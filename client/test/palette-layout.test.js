// THE ROOM-ZOOM PALETTE'S LAYOUT CONTRACT — a ratchet, and it says so.
//
// ⚠️ READ THIS BEFORE TRUSTING ANYTHING IN HERE AS PROOF THAT THE BUG IS FIXED. IT IS NOT.
//
// The bug this file exists beside is a LAYOUT bug: `.rz-palette` shipped as `overflow-x:auto` with
// `scrollbar-width:none` and a `::-webkit-scrollbar{display:none}` rule, so below roughly 1250px of
// viewport the last tools — STOCKPILE, STRIP, DEMOLISH — were scrolled off the right edge with no
// scrollbar, no fade and no arrow to say they were there. The DOM is byte-identical in the working
// and the broken case: fifteen buttons, all present, all focusable, three of them not on the screen.
// **Node cannot see that.** There is no jsdom here and a stub DOM has no layout engine, so no
// assertion in this file could distinguish a palette that works from one that hides a third of the
// game's verbs. `client/tools/palette-shot.mjs` is the instrument that can — real Chrome, real
// widths, per-button box containment, non-zero exit when a tool is clipped — and it is the evidence.
// This file is the part of that evidence a machine with no browser can keep: **the palette must not
// re-acquire the idiom that caused it.**
//
// Which makes every assertion below a source scan, i.e. exactly the instrument `docs/HANDOVER.md` §4
// says is not acceptable when a driven test is available. It is used here BECAUSE no driven test is
// available for a CSS cascade, and it is hardened accordingly: comments are stripped quote-aware
// through the shared `cssCodeOnly`, and the last section is a NEGATIVE CONTROL proving that a
// commented-out violation does NOT trip the scan while a live one does — without that pair, the
// thirty-line block comment above `.rz-palette` (which quotes the very declarations it removed)
// would make this whole file fire on its own explanation.
//
// The DRIVEN half of the package lives in `client/test/room-model.test.js` ("the armed tool, said in
// words"), which mounts the real controller and clicks the real buttons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cssCodeOnly } from './code-only.js';

const here = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(here, '../styles.css'), 'utf8');
const CSS = cssCodeOnly(RAW);

/**
 * `{ sels, decls }` for every rule in a stylesheet, over code only.
 *
 * Deliberately the same shallow brace walk `relations-view.test.js` uses: a rule nested in an
 * `@media` block is still matched on its own (the wrapper's selector text is what gets skipped), so
 * a declaration hidden inside a media query is NOT invisible to this scan. That matters — moving the
 * old `overflow-x:auto` into `@media (max-width: …)` is the single most plausible way someone
 * re-introduces this bug while believing they are fixing it.
 */
function cssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sels: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean),
    decls: m[2],
  }));
}

/** The LAST value `prop` is given for any rule whose selector list contains exactly `sel`. */
function lastValue(rules, sel, prop) {
  const re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g');
  let v = null;
  for (const r of rules) {
    if (!r.sels.includes(sel)) continue;
    for (const m of r.decls.matchAll(re)) v = m[1].trim();
  }
  return v;
}

/** Every rule whose selector list contains a selector starting with `sel` and carrying a `::` pseudo. */
function pseudoRules(rules, sel) {
  return rules.filter((r) => r.sels.some((s) => s.startsWith(sel + '::')));
}

/**
 * THE THREE ROWS OF THE ROOM-ZOOM PALETTE WRAPPER. All three carried the identical idiom; the
 * palette is the one that was measured clipping, and the other two are the same defect waiting for a
 * seventh material or an eighth ItemKind. Named by selector rather than discovered, because a scan
 * that discovers its own subject cannot fail when the subject disappears.
 */
const ROWS = ['.rz-palette', '.rz-matstrip', '.rz-acc-chips'];

/** Overflow values that CLIP or SCROLL, i.e. that can put a control where the player cannot get it. */
const CLIPPING = new Set(['auto', 'scroll', 'hidden', 'clip']);

const RULES = cssRules(CSS);

// Non-vacuity first, and it is not a formality: every assertion below is phrased as an ABSENCE, and
// an absence over an empty rule set is free.
test('the stylesheet parses and the three palette rows are all in it', () => {
  assert.ok(RULES.length > 100, `only ${RULES.length} rules parsed out of styles.css — the scans ` +
    'below would be reading almost nothing');
  for (const sel of ROWS)
    assert.ok(RULES.some((r) => r.sels.includes(sel)), `no rule for ${sel} — the guards are vacuous`);
});

// MUTATION: put `overflow-x:auto` back on `.rz-palette` ⇒ RED.
// MUTATION: put it back inside `@media (max-width:1200px){ … }` ⇒ RED (the shallow walk sees it).
test('no palette row may CLIP or SCROLL its own controls', () => {
  for (const sel of ROWS) {
    for (const prop of ['overflow', 'overflow-x', 'overflow-y']) {
      const v = lastValue(RULES, sel, prop);
      assert.ok(v === null || !CLIPPING.has(v),
        `${sel} declares ${prop}:${v}. A palette row that clips or scrolls puts tools where the ` +
        'player cannot reach them, and — measured in Chrome before this was fixed — that is not ' +
        'theoretical: at 1024px it cost STOCKPILE, STRIP and DEMOLISH, three of the game\'s five ' +
        'order verbs. If a row genuinely must scroll, it needs a VISIBLE affordance and this guard ' +
        'needs rewriting around that affordance — do not simply delete the row from ROWS.');
    }
  }
});

// MUTATION: put `scrollbar-width:none` back on `.rz-matstrip` ⇒ RED.
// MUTATION: put the `.rz-palette::-webkit-scrollbar{display:none}` rule back ⇒ RED.
test('no palette row may HIDE a scrollbar — that is the exact idiom that made the bug silent', () => {
  for (const sel of ROWS) {
    const sw = lastValue(RULES, sel, 'scrollbar-width');
    assert.notEqual(sw, 'none',
      `${sel} declares scrollbar-width:none. Overflow with a hidden scrollbar is the combination ` +
      'that made STRIP disappear with nothing on screen to say it existed.');
    const webkit = pseudoRules(RULES, sel).filter((r) => /display\s*:\s*none/.test(r.decls));
    assert.deepEqual(webkit.map((r) => r.sels.join(',')), [],
      `${sel} still has a ::-webkit-scrollbar{display:none} rule — the other half of the same idiom.`);
  }
});

// MUTATION: drop `flex-wrap:wrap` from any of the three ⇒ RED.
test('every palette row WRAPS, so a control that does not fit moves down instead of vanishing', () => {
  for (const sel of ROWS)
    assert.equal(lastValue(RULES, sel, 'flex-wrap'), 'wrap',
      `${sel} does not declare flex-wrap:wrap. Wrapping is what makes the fix work at all: it is ` +
      'the only arrangement in which nothing is ever hidden, as opposed to hidden-but-advertised.');
});

// MUTATION: drop `width:max-content` from `.rz-palette` ⇒ RED.
// MUTATION: drop it from `.rz-matstrip` ⇒ RED (added in review — only the palette's copy was pinned,
//           which was asymmetric: both rows carry the property for the same measured reason).
// MUTATION: drop `max-width:100%` from `.rz-palette` ⇒ RED.
//
// All MEASURED, not reasoned. `flex-wrap:wrap` on its own made the palette wrap at EVERY width — two
// rows at 1600px, where one row had always fitted — because a wrapping flex container in this
// shrink-to-fit slot stopped offering its single-line sum as its preferred width (798px offered
// against 1225px of content, read off the live layout). `max-content` restores that sum; `max-width`
// is what still forces the wrap once the wrapper is narrower than it. Either one alone is wrong in a
// different direction, which is why they are pinned together.
//
// `.rz-acc-chips` is deliberately NOT in this list and the asymmetry is correct: it is not a
// shrink-to-fit child of the wrapper but a stretched row inside `.rz-accepts`
// (`align-items:stretch`), so it is already given a definite width and `max-content` would fight it.
const MAXCONTENT_ROWS = ['.rz-palette', '.rz-matstrip'];
test('the wrapper\'s two shrink-to-fit rows state their single-line width', () => {
  for (const sel of MAXCONTENT_ROWS)
    assert.equal(lastValue(RULES, sel, 'width'), 'max-content',
      `${sel} lost \`width:max-content\` — without it a wrapping flex container in this slot ` +
      'under-reports its preferred width and wraps at 1600px, where nothing was ever wrong');
});

test('the palette states its ceiling too — the width without it regresses the other way', () => {
  assert.equal(lastValue(RULES, '.rz-palette', 'max-width'), '100%',
    'the palette lost `max-width:100%` — with `width:max-content` and no ceiling it simply ' +
    'overflows the wrapper again, which is the original bug with extra steps');
});

// ⚠️ THE WRAPPER, added in review, and the second half of it is a failure mode THIS PACKAGE CREATED.
//
// `.rz-palette-wrap` is what hands every row its width budget and its height. Two mutations were
// applied to it during review and BOTH were green against the guards above, because those guards
// only ever looked at the rows:
//   * `max-width:calc(100vw - 900px)` — the budget silently tightened. Every row still wraps, still
//     hides no scrollbar, and still fits its box; the box is simply far too small, and tools go off
//     the bottom of a very tall column instead of off the right of a short one.
//   * `max-height:54px;overflow:hidden` — the exact regression the fix invites. Before this package
//     the palette was one row and a height cap was harmless; it now GROWS DOWNWARD-INTO-UPWARD as it
//     wraps, so a cap re-creates the original bug in the other axis, and the CLIP test above cannot
//     see it because it is on the wrapper, not on a row.
//
// MUTATION: tighten the wrapper's `max-width` ⇒ RED.  MUTATION: add `max-height` or a clipping
//           `overflow` to the wrapper ⇒ RED.
test('the palette WRAPPER keeps its width budget and never caps the height the wrap now needs', () => {
  assert.equal(lastValue(RULES, '.rz-palette-wrap', 'max-width'), 'calc(100vw - 64px)',
    'the wrapper\'s width budget changed. It is what every row\'s `max-width:100%` resolves ' +
    'against, so narrowing it moves the wrap point without touching a single rule the other ' +
    'guards in this file read. If the margin is genuinely being retuned, re-measure the wrap ' +
    'point with client/tools/palette-shot.mjs and update this pin in the same commit.');
  for (const prop of ['overflow', 'overflow-x', 'overflow-y', 'max-height']) {
    const v = lastValue(RULES, '.rz-palette-wrap', prop);
    assert.equal(v, null,
      `.rz-palette-wrap declares ${prop}:${v}. The palette GROWS IN HEIGHT as it wraps — that is ` +
      'the whole mechanism of the fix — so a height cap or a clipping overflow on the wrapper ' +
      'reproduces the original bug rotated ninety degrees: tools present, focusable, and not on ' +
      'the screen. This is the one new failure mode the wrap introduced.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// NEGATIVE CONTROLS — the half without which none of the above is evidence.
//
// Two failure modes, and they are opposites. (1) The scan fires on PROSE: the block comment above
// `.rz-palette` in styles.css quotes `overflow-x:auto` and `::-webkit-scrollbar{display:none}` by
// name, so a stripper that did not work would redden this file against a perfectly correct
// stylesheet — and the lesson people would draw is "delete the explanatory comment", which is the
// worst possible outcome. (2) The scan fires on NOTHING: a matcher with a typo in it is green
// forever. Both are checked here against synthetic stylesheets, so neither depends on the state of
// the real file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const LIVE_VIOLATION = `
.rz-palette{display:flex;overflow-x:auto;scrollbar-width:none;max-width:100%}
.rz-palette::-webkit-scrollbar{display:none}
`;
const COMMENTED_VIOLATION = `
/* What stood here was:
     .rz-palette{display:flex;overflow-x:auto;scrollbar-width:none;max-width:100%}
     .rz-palette::-webkit-scrollbar{display:none}
   and it hid three tools. */
.rz-palette{display:flex;flex-wrap:wrap;width:max-content;max-width:100%}
`;

/** The three guards above, re-expressed as predicates so the controls run the SAME logic. */
const clips = (rules) => ['overflow', 'overflow-x', 'overflow-y']
  .some((p) => CLIPPING.has(lastValue(rules, '.rz-palette', p)));
const hidesScrollbar = (rules) => lastValue(rules, '.rz-palette', 'scrollbar-width') === 'none'
  || pseudoRules(rules, '.rz-palette').some((r) => /display\s*:\s*none/.test(r.decls));

test('NEGATIVE CONTROL: the scans FIRE on a live violation', () => {
  const rules = cssRules(cssCodeOnly(LIVE_VIOLATION));
  assert.ok(clips(rules), 'the overflow scan does not detect `overflow-x:auto` — it guards nothing');
  assert.ok(hidesScrollbar(rules),
    'the scrollbar scan detects neither `scrollbar-width:none` nor `::-webkit-scrollbar{display:none}`');
  assert.equal(lastValue(rules, '.rz-palette', 'flex-wrap'), null,
    'the flex-wrap scan reports a value where the stylesheet declares none');
});

test('NEGATIVE CONTROL: the scans stay SILENT when the same violation is a comment', () => {
  const rules = cssRules(cssCodeOnly(COMMENTED_VIOLATION));
  assert.ok(!clips(rules), 'a commented-out `overflow-x:auto` tripped the scan — this guard would ' +
    'fire on the block comment that documents the fix, and teach people to delete it');
  assert.ok(!hidesScrollbar(rules), 'a commented-out scrollbar suppression tripped the scan');
  assert.equal(lastValue(rules, '.rz-palette', 'flex-wrap'), 'wrap',
    'the live rule after the comment was lost — the stripper swallowed more than the comment');
});

// The specific hole a naive `replace(/\/\*[\s\S]*?\*\//g, '')` does NOT have but a JS stripper
// borrowed for CSS DOES: `//` is not a comment in CSS, and eating to end-of-line on one destroys
// `url(http://…)` and every declaration after it on that line.
test('NEGATIVE CONTROL: cssCodeOnly leaves `//` alone — it is a URL, not a comment', () => {
  const css = '.a{background:url(http://x/y.png);color:red}\n.rz-palette{flex-wrap:wrap}';
  const rules = cssRules(cssCodeOnly(css));
  assert.equal(lastValue(rules, '.a', 'color'), 'red',
    'the declaration after a `//` inside a url() was eaten — the stripper is treating CSS as JS');
  assert.equal(lastValue(rules, '.rz-palette', 'flex-wrap'), 'wrap');
});

// And the blinding hole in the other direction: a quoted `/*` must not open a comment and swallow
// the rest of the file. This is the CSS twin of the exact defect `codeOnly`'s header records.
//
// ⚠️ THE TRAILING REAL COMMENT IS THE WHOLE CONTROL, AND WITHOUT IT THIS TEST COULD NOT BITE. The
// fixture originally ended at the `.rz-palette` rule, and against the realistic naive stripper —
// `src.replace(/\/\*[\s\S]*?\*\//g, '')`, the exact non-quote-aware implementation this control
// exists to reject — it stayed GREEN. The lazy match needs a CLOSING `*/` to fire, the fixture had
// none, so the characteristic failure could not occur and the control was asserting that a broken
// stripper works. Both stripper implementations were run against both fixtures, all four legs, and
// this 2×2 is why the two `.b` lines below are load-bearing rather than decorative:
//
//                        fixture without `/* … */`   fixture as it now stands
//     naive stripper     0 fail (VACUOUS)            1 fail (bites, on this test)
//     cssCodeOnly        0 fail                      0 fail
//
// It matters on the file this guard actually watches: `styles.css` is full of later `*/`s, so a
// naive stripper WOULD be blinded there — and the control, as first written, said it would not.
test('NEGATIVE CONTROL: a quoted `/*` does not blind cssCodeOnly', () => {
  const css = '.a::before{content:"/*"}\n.rz-palette{overflow-x:auto}\n'
            + '/* a later, real comment */\n.b{color:red}';
  const rules = cssRules(cssCodeOnly(css));
  assert.ok(clips(rules),
    'a `/*` inside a string literal opened a comment and swallowed the rule after it — every scan ' +
    'in this file would go silently green against a stylesheet with one such string in it');
  // …and the stripper must still be a stripper: the LATER comment is genuinely removed, and the
  // rule after it survives. A "stripper" that gave up on quotes by stripping nothing would pass the
  // assertion above and fail these two.
  assert.equal(lastValue(rules, '.b', 'color'), 'red',
    'the rule after the later comment was lost — the quoted marker still swallowed the file, just ' +
    'from a different starting point');
  assert.doesNotMatch(cssCodeOnly(css), /a later, real comment/,
    'the later, genuinely-commented text survived stripping — this is not a comment stripper at all');
});

// …and the same property demonstrated ON THE REAL FILE rather than on synthetic input, which is the
// gap the two controls above cannot close by themselves. `styles.css` genuinely contains the
// forbidden text in BOTH forms: a live one (`.tabrow`, on the deprecated console shell — out of this
// package's scope and deliberately untouched) and a commented one (the block above `.rz-palette`
// that quotes what it removed). If the stripper ever stopped working on this file, the count would
// stop dropping — and every scan above would be reading prose as if it were CSS.
const count = (s, re) => (s.match(re) || []).length;
test('the stripper measurably removes a COMMENTED violation from the real styles.css', () => {
  const raw = count(RAW, /scrollbar-width:none/g);
  const code = count(CSS, /scrollbar-width:none/g);
  assert.ok(raw > code,
    `styles.css mentions \`scrollbar-width:none\` ${raw} time(s) and ${code} survive comment ` +
    'stripping. They should not be equal: this file quotes that declaration in the block comment ' +
    'above `.rz-palette`. Equal counts mean either the comment was deleted (in which case this ' +
    'control no longer models the file it guards) or the stripper is a no-op here.');
  assert.ok(code >= 1,
    'no live `scrollbar-width:none` survives anywhere in styles.css. That is not a failure of the ' +
    'palette — `.tabrow` on the deprecated console shell carries one — but if it has gone, this ' +
    'control has lost its live half and should be re-derived rather than relaxed.');
});
