// THE ROOM-ZOOM PALETTE'S LAYOUT CONTRACT — a ratchet, and it says so.
//
// ⚠️ READ THIS BEFORE TRUSTING ANYTHING IN HERE AS PROOF THAT THE BUG IS FIXED. IT IS NOT.
//
// The bug this file exists beside is a LAYOUT bug: `.rz-palette` shipped as `overflow-x:auto` with
// `scrollbar-width:none` and a `::-webkit-scrollbar{display:none}` rule, so below roughly 1250px of
// viewport the last tools — STOCKPILE, STRIP, DEMOLISH — were scrolled off the right edge with no
// scrollbar, no fade and no arrow to say they were there. The DOM is byte-identical in the working
// and the broken case: fifteen buttons — the palette wore fifteen tools on the day of the bug; it
// wears SEVENTEEN today — all present, all focusable, three of them not on the screen.
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
import { stylesSource } from './styles-source.js';

// ⚠️ "styles.css" IN THIS FILE'S PROSE IS NOW SIX FILES. The single `client/styles.css` was split by
// surface at VR-A (2026-08-04) into `client/styles/{base,console,moss,overview,roomzoom,relations}
// .css` plus the `src/theme/paper.css` token layer. `stylesSource()` reads `client/index.html`, takes
// its `<link rel=stylesheet>` hrefs IN ORDER and follows each file's `@import`, so `RAW` below is the
// same text this file always scanned — the whole cascade the browser loads, concatenated in cascade
// order. Every mutation note, every "delete this rule from styles.css", every `*/`-balance claim
// still applies; it applies to the cascade rather than to one file. `stylesheet-split.test.js` pins
// that the set of files, the link order and the dev preview's copy of it stay in step.
const here = dirname(fileURLToPath(import.meta.url));
const RAW = stylesSource();
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

/**
 * ⚠️ SELECTOR MATCHING IS BY **SUBJECT**, NOT BY EXACT STRING, AND THAT IS A BUG FIX.
 *
 * This used to be `r.sels.includes(sel)` and `s.startsWith(sel + '::')` — exact-string tests against
 * one compound. Adding ONE rule to `styles.css` restored the pre-fix declaration set VERBATIM and
 * left all 710 node tests green:
 *
 *     #roomzoom-view .rz-palette{overflow-x:auto;scrollbar-width:none;flex-wrap:nowrap}
 *
 * Those are the same three declarations this file's own header quotes as the cause of the bug, and
 * that configuration was measured at 900px losing PLANT, DIG, STOCKPILE, STRIP and DEMOLISH. The
 * same trick re-capped the wrapper's height. **A guard that cannot see the exact declarations it
 * names, written under a compound selector, is a defect in the matcher — not a limit of the
 * approach.** (The limits are real and are declared in the file header: a font swap, an eighteenth
 * tool, a `max-height` nobody imagined. Those are differently-SHAPED regressions. This was the named
 * subject walking back in through a door left open.)
 *
 * The fix is to ask what a rule TARGETS: the rightmost compound — the selector's *subject* — is the
 * element the declarations land on, whatever ancestry is written to its left. `#roomzoom-view
 * .rz-palette`, `.rz-palette-wrap>.rz-palette` and `body.roomzoom-open .hud.rz-palette` all target
 * the palette; `.rz-palette-wrap` does NOT, so the two pins stay distinct (verified by a control
 * below, because "these two selectors do not collide" is exactly the kind of thing that is obvious
 * and wrong).
 */

/** The rightmost compound of a selector — the element it actually styles. */
function subject(s) {
  return s.split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() || '';
}

/** A compound split into simple selectors: `.hud.rz-palette:hover` → ['.hud','.rz-palette',':hover']. */
function simples(compound) {
  return compound.match(/::?[a-zA-Z-]+(?:\([^)]*\))?|[.#][\w-]+|\[[^\]]*\]|^[a-zA-Z*][\w-]*/g) || [];
}

/** Does this selector style the element `sel` names — as its subject, under any ancestry? */
const targetsEl = (s, sel) => simples(subject(s)).includes(sel);
/** …and does it style a PSEUDO-ELEMENT of it (`::-webkit-scrollbar`) rather than the element itself? */
const isPseudoElement = (s) => /::/.test(subject(s));

/**
 * The LAST value `prop` is given to the element `sel` names, by any rule that targets it.
 *
 * Pseudo-ELEMENT rules are excluded (a `::-webkit-scrollbar{display:none}` is not the row's own
 * `display`); pseudo-CLASS rules are deliberately INCLUDED, because `.rz-palette:hover{overflow-x:
 * auto}` is a real regression and there is no reason to be blind to it.
 */
function lastValue(rules, sel, prop) {
  const re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g');
  let v = null;
  for (const r of rules) {
    if (!r.sels.some((s) => targetsEl(s, sel) && !isPseudoElement(s))) continue;
    for (const m of r.decls.matchAll(re)) v = m[1].trim();
  }
  return v;
}

/** Every rule styling a `::` pseudo-element of `sel`, under any ancestry. */
function pseudoRules(rules, sel) {
  return rules.filter((r) => r.sels.some((s) => targetsEl(s, sel) && isPseudoElement(s)));
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
// `.rz-acc-chips` is deliberately NOT in this list, and the asymmetry is correct FOR A MEASURED
// REASON rather than a deduced one: it is not a shrink-to-fit child of the wrapper but a stretched
// row inside `.rz-accepts` (`align-items:stretch`). Driven in Chrome with STOCKPILE armed, its box
// is FIXED at 494px across an 832px range of viewport widths and is WIDER THAN ITS OWN CONTENT — so
// it has no under-reported-preferred-width failure mode for `max-content` to fix.
//
// ⚠️ ONE CLAIM WITHDRAWN: an earlier draft said `max-content` "would fight it". That is NOT
// demonstrated — forcing `width:max-content` onto this row changed nothing, because there the
// max-content width and the stretched width coincide. The exclusion rests on the measured stretch
// behaviour above, which is the better argument anyway.
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
// stripper works. Both stripper implementations were run against both fixtures, all four legs:
//
//                        fixture without `/* … */`   fixture as it now stands
//     naive stripper     0 fail (VACUOUS)            1 fail (bites, on this test)
//     cssCodeOnly        0 fail                      0 fail
//
// It matters on the file this guard actually watches: `styles.css` is full of later `*/`s, so a
// naive stripper WOULD be blinded there — and the control, as first written, said it would not.
//
// ⚠️ THE 2×2 ABOVE IS ABOUT THE TRAILING COMMENT AND NOTHING ELSE. An earlier draft of this note
// offered it as the justification for the two `.b` assertions below, and that was wrong: review
// re-ran it as a 3×2 and showed the control is MINIMAL — the comment alone is what makes it bite
// (drop the trailing rule and it still bites; drop the comment and it goes vacuous again). The `.b`
// assertions earn their place for the different reason given at their own line: they catch the
// OPPOSITE cheat, a "stripper" that dodges the quote problem by stripping nothing at all.
//
// ⚠️ AND ALL THREE MARKERS ARE RUN, NOT ONE. `cssCodeOnly` is a SHARED helper with a second consumer
// as of tonight, and `styles.css` really does contain single-quoted strings
// (`:779 content:'— no audit lines —'`, `:815 content:''`). Testing `"` alone left the `'` branch
// AND the backslash-escape branch of a live shared code path uncovered — both were survivors.
test('NEGATIVE CONTROL: neither quote character, escaped or not, blinds cssCodeOnly', () => {
  const MARKERS = [
    ['a double-quoted marker', '.a::before{content:"/*"}'],
    ['a single-quoted marker', '.a::before{content:\'/*\'}'],
    ['an ESCAPED quote before the marker', '.a::before{content:"x\\"/*"}'],
  ];
  for (const [what, head] of MARKERS) {
    const css = head + '\n.rz-palette{overflow-x:auto}\n/* a later, real comment */\n.b{color:red}';
    const rules = cssRules(cssCodeOnly(css));
    assert.ok(clips(rules),
      `${what} opened a comment and swallowed the rule after it — every scan in this file would go ` +
      'silently green against a stylesheet containing one such string');
    // …and the stripper must still BE a stripper: the LATER comment is genuinely removed and the
    // rule after it survives. A "stripper" that dodged the quote problem by stripping nothing would
    // pass the assertion above and fail both of these.
    assert.equal(lastValue(rules, '.b', 'color'), 'red',
      `${what}: the rule after the later comment was lost — the marker still swallowed the file, ` +
      'just from a different starting point');
    assert.doesNotMatch(cssCodeOnly(css), /a later, real comment/,
      `${what}: genuinely-commented text survived — this is not a comment stripper at all`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MATCHER'S OWN CONTROLS — added in review, and these are what would have caught the hole.
//
// Every guard in this file resolves its subject through `lastValue`/`pseudoRules`. While those
// matched by exact string, `#roomzoom-view .rz-palette{overflow-x:auto;scrollbar-width:none;
// flex-wrap:nowrap}` restored the pre-fix declaration set VERBATIM and the whole suite stayed green.
// The variants below are the realistic spellings: a descendant, both child-combinator spacings, a
// compound sharing the `hud` class the palette element actually carries, a pseudo-class, and the
// media-query form this file's own header advertises as covered.
// ─────────────────────────────────────────────────────────────────────────────────────────────
test('NEGATIVE CONTROL: a violation written under a COMPOUND selector is still seen', () => {
  const VARIANTS = [
    '#roomzoom-view .rz-palette{overflow-x:auto;scrollbar-width:none;flex-wrap:nowrap}',
    '.rz-palette-wrap>.rz-palette{overflow-x:auto}',
    '.rz-palette-wrap > .rz-palette{overflow-x:auto}',
    'body.roomzoom-open .hud.rz-palette{overflow-x:auto}',
    '.rz-palette:hover{overflow-x:auto}',
    '@media (max-width:1200px){#roomzoom-view .rz-palette{overflow-x:auto}}',
  ];
  for (const v of VARIANTS) {
    assert.ok(clips(cssRules(cssCodeOnly(v))),
      `NOT SEEN: ${v}\nThe matcher is back to exact-string comparison, so the exact declarations ` +
      'this file names can be re-introduced under any ancestry with the suite green.');
  }
  assert.ok(hidesScrollbar(cssRules(cssCodeOnly(
    '#roomzoom-view .rz-palette::-webkit-scrollbar{display:none}'))),
  'a pseudo-element rule under a compound ancestry is not seen by pseudoRules');
});

// The other half of the same change: subject matching must not FUSE the two pins. `.rz-palette-wrap`
// is a different element from `.rz-palette` and its guard says different things about it, so a
// matcher treating one as the other would silently move both. Obvious — and exactly the kind of
// obvious that is worth one assertion, since `.rz-palette-wrap` literally begins with `.rz-palette`.
test('NEGATIVE CONTROL: `.rz-palette-wrap` is NOT read as `.rz-palette`', () => {
  const wrapOnly = cssRules(cssCodeOnly('.rz-palette-wrap{overflow:hidden;max-height:54px}'));
  assert.ok(!clips(wrapOnly),
    'a rule on `.rz-palette-wrap` was read as a rule on `.rz-palette` — the two pins have fused, ' +
    'and every wrapper guard is now also (wrongly) a row guard');
  assert.equal(lastValue(wrapOnly, '.rz-palette-wrap', 'max-height'), '54px',
    'the wrapper\'s own declarations are not being read at all — its guard is vacuous');

  // …and the OTHER direction of the same property, which was a SURVIVOR: neutering `subject()` to
  // `s => s` — no combinator split at all — left the whole suite green, because `simples()` runs
  // over the entire selector and still finds `.rz-palette` somewhere in it. The matcher would then
  // be over-eager rather than fused: `.rz-palette .rz-tool{overflow:hidden}`, a legitimate rule
  // clipping the TOOL, would be read as a rule on the ROW and fail the CLIP guard with a message
  // naming the wrong element. The shipped `subject()` gets this right; nothing tested it.
  // MUTATION: `subject = s => s` ⇒ RED here (and, measured, only here).
  assert.ok(!clips(cssRules(cssCodeOnly('.rz-palette .rz-tool{overflow-x:auto}'))),
    'a rule whose SUBJECT is `.rz-tool` was read as a rule on `.rz-palette` — the matcher has ' +
    'stopped resolving the subject and now fires on any selector merely CONTAINING the row');
});

/**
 * ARMED MUST NOT LOOK LIKE HOVERED — the 2026-08-03 owner defect, pinned where its cause lived.
 *
 * ⭐ SWEPT OVER THE **CLASS** OF ARMABLE ROOM-ZOOM CONTROLS, NOT OVER A LIST OF RULES SOMEONE PICKED.
 * This test shipped on 2026-08-03 covering `.rz-tool` alone, and the palette lane's own reviewer
 * immediately found the same collision one row down: `.rz-acc-chip` had it IDENTICALLY (`:hover` and
 * `.on` both `border-color:#cf7a33`) and `.rz-mat-chip` had it in near-form. Two rules were fixed and
 * a third one would have been missed the same way, so the membership is now DISCOVERED from the
 * stylesheet (`discoverArmable`, and the test above this one pins the discovered set against
 * `ARMABLE`) and every member is swept by the same legs — the owner's "sweep the class, not the
 * list" applied to the guard rather than only to the fix.
 *
 * ⭐⭐ AND THE THIRD INSTANCE WAS FOUND BY THIS GUARD'S OWN CONFESSION, WHICH IS THE POINT OF WRITING
 * LIMITS DOWN. The chip lane's version of the ⛔ block below named `.rz-crew.sel` as the collision it
 * could not see and FILED it; on 2026-08-04 the crew dock was measured in real Chrome and had it
 * exactly — `.rz-crew:hover` and `.rz-crew.sel` both `#cf7a33`. Read off a live EIGHT-ROW dock by
 * `zoom-pawn-shot.mjs` §5b (rest and hover are one unselected row with the pointer off it and on it;
 * selected is the row beside it, in the same session):
 *
 *     rest      bg rgba(18,15,11,.55)  border 1px rgb(46,40,32)/.6  shadow none
 *     hover     bg rgba(18,15,11,.55)  border 1px rgb(207,122,51)   shadow none   ← the selected edge
 *     selected  bg rgba(34,27,18,.8)   border 1px rgb(207,122,51)   shadow none
 *
 * ⛔ AND THAT RUN IS ALSO THE RECEIPT FOR WHY THE SHADOW LEG IS WRITTEN AS A CHANNEL AND NOT AS A
 * DIFFERENCE: `sameLook(hover, selected)` was FALSE on the defect — the two really did differ, on a
 * dark-on-dark fill over a blurred glass island — so a byte-comparison would have passed it, for the
 * second time in two lanes. The alphabet of state spellings is now `.on` + `.sel` (`STATE_CLASSES`),
 * which is the repair of this file's OWN blind spot rather than one more hand-added row.
 *
 * ⛔ THE CLASS IS STILL THE ONE `discoverArmable` CAN NAME, WHICH IS NARROWER THAN "EVERY ARMABLE
 * CONTROL". An earlier draft of this paragraph said a fourth armable control "fails the membership
 * pin until it is either listed or given a real armed look", and independent review DROVE that and
 * found it false twice over. Read `discoverArmable`'s own ⛔ block for the measured blind spots and
 * for the live counterexample that is STILL on this surface (`.rz-mini-slot.cur`). What is true is
 * the weaker sentence: a control that spells its chosen state `.on` or `.sel` on a `.rz-` class
 * cannot be added without this file noticing.
 *
 * ⚠️ THE CAUSE WAS NOT IN THE MODEL. `paintPalette` has always toggled `.on` off `_armed`, and
 * `room-model.test.js` now drives that end to end. Measured in real Chrome on the shipped tree, the
 * click landed correctly — `cls="rz-tool on"`, `aria-pressed="true"` — and the owner still reported
 * that "the BUTTON itself never changes state". Both states were read off the SAME button at the
 * SAME pixels:
 *
 *     HOVER  bg rgba(26,22,17,.5)  color rgb(179,170,156)  border 1px rgb(207,122,51)  shadow none
 *     ARMED  bg rgb(58,42,18)      color rgb(242,181,99)   border 1px rgb(207,122,51)  shadow none
 *
 * Identical borders, because `.rz-tool:hover` had borrowed `#cf7a33` — the ARMED border colour. The
 * player's cursor is always on the button they just clicked, so the loudest edge signal was already
 * amber BEFORE the click and arming moved only a dim fill and a text hue. A state that is painted
 * and still not visible is the "invisible feedback is FUNCTIONAL" rule failing in the stylesheet.
 *
 * A source scan again, and for the same reason the file header gives: there is no layout engine here
 * and none of this is provable in node. `client/tools/palette-shot.mjs` is the instrument: it
 * measures rest / hover / armed / post-ESC in real Chrome and requires the armed state to OWN the
 * shadow channel (armed has one, hover has none). ⚠️ That is narrower than "refuses to pass when
 * hover and armed resolve alike", which is what an earlier draft of this sentence claimed — review
 * drove the pre-fix CSS through the rig and it exited 0 GREEN, because the two states differed on a
 * dark-on-dark fill while matching on border and shadow. Neither instrument judges CONTRAST. This
 * file keeps the part a browserless gate can — **armed must carry a signal `:hover` does not.**
 * ⚠️ AND THE FOURTH MEMBER'S BROWSER INSTRUMENT IS A DIFFERENT FILE: `palette-shot.mjs` only knows
 * the three palette controls, so `.rz-crew` is measured by `zoom-pawn-shot.mjs` §5b (the crew dock's
 * own rig), which reads FOUR states rather than three — a crew row is normally shown selected with
 * the pointer on a DIFFERENT row, which no chip ever is. Driven both sides of this fix: RED on the
 * shipped defect naming the shadow channel, GREEN after, box 168x52 unchanged in every state.
 *
 * ⚠️ LEG 4 IS NOT DECORATION. It is why the armed ring is a `box-shadow` rather than a thicker
 * border or a bolder weight: shadows do not participate in layout, and anything that re-measures the
 * button on arm reflows the TWENTY-ONE-tool wrapping row — which is the clipping defect this entire
 * file exists for. The obvious way to make the armed look "louder" is the one that re-opens it.
 * (TWENTY-ONE measured 2026-08-04, twice — `ROOM_TOOLS.length` and `palette-shot.mjs`'s live `21/21`
 * at all six widths, rows 3/3/3/4/4/5 across 1600→900. It read EIGHTEEN the day before, and
 * SEVENTEEN before that. Note that this file's own header and several comments in
 * `room-model.test.js` still say "seventeen"; those are stale and are FILED rather than edited from
 * here — the only counts kept live are the ones something MEASURES.)
 *
 * Legs are blinded (trap shape 5): one `assert` at the end, so a regression names every state that
 * has drifted rather than only the first.
 *
 * ⚠️ EVERY LEG IS CHECKED PER ARMED RULE, NOT OVER THE MERGED BLOB, AND THAT IS A BUG FIX IN THIS
 * TEST — found by applying its own named mutations and watching two of them stay GREEN. The palette
 * has TWO armed rules: `.rz-tool.on`, which paints the seventeen ordinary tools, and
 * `.rz-tool.demo.on`, which overrides it for DEMOLISH alone (18 = 17 + 1, measured). Merging
 * their declarations meant deleting `box-shadow` from the rule that paints SEVENTEEN buttons still
 * matched `/box-shadow/`, because DEMOLISH's rule kept its own: **a surviving sibling masked a
 * missing one.** That is trap shape 4 — a guard whose scope cannot catch its subject — reproduced
 * inside the guard written to close a different one. Each rule now answers for itself.
 *
 * ⚠️ `:active` IS SWEPT TOO, AND FOR THE SAME REASON `:hover` IS. It is the other state the pointer
 * can put a control into without the player having chosen anything, and it is the one a "make the
 * press feel solid" edit reaches for first — copying the armed fill into `:active` re-opens exactly
 * this defect, one frame at a time, on a control the player is touching. Both pointer states are held
 * off the armed channel, and the armed rule must repeat `:hover`/`:active` in its OWN selector list so
 * the cursor that armed a control can never wash the state back out by simply not moving.
 *
 * MUTATION: give `:hover` the armed border colour (`border-color:#f2b563`) — the defect in its exact
 *           historical shape, hover borrowing the armed edge ⇒ RED on the border leg, BOTH rules.
 * MUTATION: drop `box-shadow` from `.rz-tool.on` ONLY, leaving DEMOLISH's ⇒ RED (this is the one
 *           that was green before the per-rule fix).
 * MUTATION: restore the pre-2026-08-03 `.rz-acc-chip` pair (`:hover` and `.on` both `#cf7a33`,
 *           no shadow) ⇒ RED on the border leg AND the shadow leg — the SHIPPED defect this package
 *           closes, driven as its own control rather than described.
 * MUTATION: give `.rz-mat-chip:active` the armed `background:#5a3f14` ⇒ RED on the `:active` leg.
 * MUTATION: drop `.rz-acc-chip` (or `.rz-mat-chip`) from `ARMABLE` ⇒ RED on the membership test
 *           above, which is the "the sweep quietly stopped covering a member" shape.
 * MUTATION: delete the `.rz-mat-chip.on` rule from `styles.css` ⇒ RED on the membership test AND on
 *           that member's rule-count pin.
 * MUTATION: add `font-weight:700` to the `.rz-tool.on` rule ⇒ RED on the box leg.
 * MUTATION: `border:3px solid #f2b563` on `.rz-tool.on` — the SHORTHAND, which is how anyone would
 *           actually write "make the armed edge thicker" ⇒ RED on the box leg. This one was GREEN
 *           until review drove it; see `reMeasures`.
 * MUTATION: `font:700 12px var(--font-mono)` or `padding-inline:18px` on the armed rule ⇒ RED (same
 *           shape, and the reason the leg matches by FAMILY rather than by property name).
 * MUTATION: restore the pre-2026-08-04 `.rz-crew` pair (`:hover` and `.sel` both `#cf7a33`, no
 *           shadow, no `:active`) ⇒ RED on the border leg, the shadow leg, the `.sel:hover`/
 *           `.sel:active` specificity leg AND the missing-`:active` leg — the crew dock's shipped
 *           defect, driven as its own control rather than described.
 * MUTATION: give `.rz-crew:hover` the selected `box-shadow` ⇒ RED on the pointer-shadow leg (the
 *           pointer claiming the state's exclusive channel).
 *
 * ⛔ THE LIMIT, STATED SO NOBODY READS THIS AS MORE THAN IT IS. This pins that armed and hover are
 * DIFFERENT, never that armed is LOUD ENOUGH. Reverting `:hover` alone to its old
 * `border-color:#cf7a33` is green here — measured, not assumed — and correctly so: against today's
 * `#f2b563` armed edge the two really are distinguishable. A pair of colours that differ by one
 * hex digit would also pass. "Can a player see it" is a question for `palette-shot.mjs`, which
 * photographs the same control in all three states; this file only keeps the two from COLLIDING,
 * which is the specific way the state went invisible on 2026-08-03.
 */

/** Every rule whose SUBJECT compound satisfies `pred`, as `{ sel, sels, decls }`. */
function rulesWhere(pred) {
  return RULES.filter((r) => r.sels.some((s) => !isPseudoElement(s) && pred(simples(subject(s)))))
    .map((r) => ({ sel: r.sels[0], sels: r.sels, decls: r.decls }));
}
/** Declarations merged, in source order, from every rule whose SUBJECT compound satisfies `pred`. */
function declsWhere(pred) {
  return rulesWhere(pred).map((r) => r.decls).join(';');
}
/** The last value `prop` takes in a merged declaration blob, or null. */
function valueOf(decls, prop) {
  let v = null;
  for (const m of decls.matchAll(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g'))) v = m[1].trim();
  return v;
}
/** Every property NAME declared in a blob, lower-cased, in source order. */
const propsOf = (decls) => [...decls.matchAll(/(?:^|;)\s*([a-zA-Z-]+)\s*:/g)].map((m) => m[1].toLowerCase());

/**
 * Does this declared property change the button's BOX, rather than only its paint?
 *
 * ⚠️ ASKED AS A PREDICATE OVER WHAT THE RULE ACTUALLY DECLARES, NOT AS A FIXED LIST OF PROPERTY
 * NAMES TO LOOK FOR — and that is a bug fix, found by independent review DRIVING it. The first
 * draft scanned a hand-written list (`font-weight`, `letter-spacing`, `font-size`, `padding`,
 * `border-width`) and `border:3px solid #f2b563` on `.rz-tool.on` was measured FULLY GREEN: the
 * SHORTHAND is the natural spelling — the base `.rz-tool` rule two lines above uses it — and it
 * widens the border box 2px per side on a shrink-to-fit button, rewrapping the eighteen-tool row
 * unseen. `font` and `padding-inline` are the same shape. That is TRAPS' 4th shape (a guard whose
 * scope filter excludes the violation) sitting inside the guard whose own comment claimed to have
 * closed that shape for its `box-shadow` sibling. A list of things to look for can only find what
 * someone thought of; a predicate over the declared set has to answer for everything.
 *
 * Prefix-matched by FAMILY so shorthand and every longhand are covered at once, minus the two
 * families that provably only paint: `*-color` and `*-radius` never move an edge. Everything else
 * under border/padding/margin/font/spacing/sizing can, including `border-style:none`, which
 * collapses a border to zero width.
 */
function reMeasures(prop) {
  if (/-color$|radius$/.test(prop)) return false;   // paint only — the armed rule sets `border-color`
  return /^(?:border|padding|margin|font|letter-spacing|word-spacing|(?:min-|max-)?(?:width|height)|inline-size|block-size)/
    .test(prop);
}
/**
 * THE TWO SPELLINGS OF "THE STATE THE PLAYER CHOSE" ON THIS SURFACE.
 *
 * ⭐ `.sel` WAS ADDED 2026-08-04, AND IT IS THE 9th-SHAPE REPAIR OF THIS FILE'S OWN BLIND SPOT. The
 * chip lane's version of `discoverArmable` looked for `.on` alone; its comment then named the live
 * counterexample it could not see (`.rz-crew.sel`) and FILED it. That file was one instance of the
 * defect wide, so the guard was too — a narrowed instrument going blind exactly where the next
 * instance was already sitting. Widening the alphabet is what closes it, not another hand-added row.
 */
const STATE_CLASSES = ['.on', '.sel'];

/**
 * THE CLASS OF ARMABLE ROOM-ZOOM CONTROLS — every element this surface writes a chosen-state class
 * onto, HOW it spells that state, and the number of armed rules each one is expected to carry.
 *
 * All four are written by the same four lines of shipped code: `paintPalette`'s
 * `setCls(b, 'on', on)` (roomzoom-view.js), `paintMatStrip`'s `'rz-mat-chip' + (… ? ' on' : '')`
 * (roomzoom-view.js:1125), `acceptsRowHtml`'s `'rz-acc-chip' + (on ? ' on' : '')`
 * (accepts-row.js:95) and `paintCrewDock`'s `setCls(rec.el, 'sel', r.selected)`
 * (roomzoom-view.js:1098). `.rz-tool` carries TWO armed rules because DEMOLISH overrides the other
 * twenty (`.rz-tool.demo.on`) — measured here, not inherited: `ROOM_TOOLS.length` is 21 and exactly
 * one of them takes the `demo` class (`paintPalette`, roomzoom-view.js:350). The chips and the crew
 * row carry one armed rule each. If a member's count
 * changes, that is a real edit and the number must be RE-DERIVED — but a count that fell to zero
 * means the legs for that member are reading nothing, which is how this whole shape passes over a
 * broken control.
 *
 * ⚠️ `.rz-crew` IS NOT A PALETTE CONTROL AND IS SWEPT HERE ANYWAY, deliberately: the thing this
 * section pins is a CLASS OF DEFECT, not a region of the screen, and the class's membership is
 * "spells a chosen state, and has a pointer state that can borrow its paint". Splitting the sweep by
 * which island a control lives on is how the second and third instances survived the first fix.
 */
const ARMABLE = [
  { member: '.rz-tool', state: '.on', rules: 2 },
  { member: '.rz-mat-chip', state: '.on', rules: 1 },
  { member: '.rz-acc-chip', state: '.on', rules: 1 },
  { member: '.rz-crew', state: '.sel', rules: 1 },
];
const KEY = (a) => a.member + a.state;

/**
 * The same class DISCOVERED from the stylesheet: every `.rz-*` element that has a chosen-state rule,
 * reported as `member + state` (`.rz-tool.on`, `.rz-crew.sel`, …) so the SPELLING is pinned too.
 *
 * ⚠️ THIS IS THE ANSWER TO "SWEEP THE CLASS, NOT THE LIST", AND IT IS THE LEG THAT WOULD HAVE CAUGHT
 * THE 2026-08-03 DEFECT. The version of this file that shipped that morning hand-named `.rz-tool`,
 * so the identical `#cf7a33` collision on `.rz-acc-chip` — six lines further down the same
 * stylesheet — was invisible to it. A list finds what someone thought of; discovery answers for
 * everything the sheet declares IN THE SHAPE IT KNOWS HOW TO READ.
 *
 * ⛔ AND THAT SHAPE IS STILL THE WHOLE LIMIT, STATED HERE BECAUSE IT WAS OVERSTATED ONCE AND THE
 * OVERSTATEMENT WAS DRIVEN DOWN BY INDEPENDENT REVIEW. The predicate is literal on TWO counts, and
 * either one alone is a blind spot. All four lines below were applied to `styles.css` and driven
 * (2026-08-04, this lane — the first two are the same controls the chip lane ran, RE-DRIVEN because
 * `.sel` moved one of them from GREEN to RED and a quoted result is not a measurement):
 *
 *     .rz-newthing2.sel{border-color:#cf7a33}   ← `.sel` is now a known spelling → RED  (was GREEN)
 *     .zoomchip.on     {border-color:#cf7a33}   ← armed spelled `.on`, no `.rz-` → GREEN
 *     .rz-newthing4.cur{border-color:#cf7a33}   ← a THIRD spelling, `.rz-` present → GREEN
 *     .rz-newthing3.on {border-color:#cf7a33}   ← CONTROL, both conditions met   → RED
 *
 * So this discovers "controls that spell their chosen state `.on` or `.sel` on a `.rz-` class",
 * NEVER "every armable control on this surface". ⭐ THE COUNTEREXAMPLE IS STILL IN THE FILE IT SCANS,
 * and it is a different one now that `.rz-crew` is a member: `.rz-mini-slot.cur` (styles.css) spells
 * the minimap's current-room slot `.cur`. It is NOT today's defect — that rule declares
 * `cursor:default` and nothing else, so there is no paint for a pointer state to borrow, and the
 * minimap's highlight is drawn in SVG rather than by the cascade — but it is the shape the third
 * instance had, and naming it here is cheaper than rediscovering it. FILED, not chased (PROCESS §2).
 *
 * Subject-compound only, so `.rz-mat-chip.on .rz-mat-name` (whose subject is the NAME span, not the
 * chip) is correctly not a member: it is armed PAINT on a child, not an armable control.
 */
function discoverArmable() {
  const found = new Set();
  for (const r of RULES)
    for (const s of r.sels) {
      if (isPseudoElement(s)) continue;
      const sx = simples(subject(s));
      for (const state of STATE_CLASSES) {
        if (!sx.includes(state)) continue;
        for (const c of sx) if (c.startsWith('.rz-')) found.add(c + state);
      }
    }
  return [...found].sort();
}

// MUTATION: drop a member from `ARMABLE` ⇒ RED naming it as unswept.
// MUTATION: delete `.rz-mat-chip.on` from styles.css ⇒ RED naming it as no longer armable at all.
// MUTATION: add `.rz-newthing.on{…}` to styles.css ⇒ RED — a control in the shape this scan reads
//           cannot enter the surface without the legs below being pointed at it.
// MUTATION: add `.rz-newthing2.sel{…}` ⇒ RED, which is NEW on 2026-08-04: the chip lane drove this
//           exact line and measured it GREEN, and that green was the blind spot `.rz-crew.sel` was
//           sitting in. Re-driven here rather than quoted.
// MUTATION: rename the crew dock's state to `.on` in styles.css ⇒ RED twice, on the membership set
//           (`.rz-crew.on` discovered where `.rz-crew.sel` is listed) and on that member's rule
//           COUNT (0 parsed, 1 expected) — the member's SPELLING is pinned, not only its existence.
//           (styles.css only: this file never reads the painter, so the JS half is not what reddens
//           it. `zoom-pawn.test.js` is what pins the class the painter actually writes.)
// ⛔ NEGATIVE RESULT, DRIVEN, NOT A MISSING MUTATION: `.zoomchip.on{…}` (no `.rz-`) and
//           `.rz-newthing4.cur{…}` (a spelling the alphabet does not carry) are both GREEN. See
//           `discoverArmable`'s ⛔ block — that is the predicate's reach, and the assertion below
//           must not be read as covering more.
test('the ARMABLE class is DISCOVERED from the stylesheet, and the sweep covers all of it', () => {
  const found = discoverArmable();
  assert.ok(found.length >= 4, `only ${found.length} armable \`.rz-*\` controls discovered in ` +
    'styles.css — the discovery itself has stopped working, and a sweep over nothing is free');
  assert.deepEqual(found, ARMABLE.map(KEY).sort(),
    'the set of `.rz-` controls whose SUBJECT compound carries a chosen-state class (`.on`, `.sel`) ' +
    'no longer matches the set this file sweeps. Every one of them is a control the player picks, ' +
    'and each is one `border-color` edit away from the 2026-08-03 defect (a pointer state wearing ' +
    'the chosen colour). Add it to `ARMABLE` — or, if a rule was deliberately deleted, say so here ' +
    'and re-derive the counts. (This says nothing about controls that spell their state some THIRD ' +
    'way, e.g. `.rz-mini-slot.cur` — see the ⛔ block over `discoverArmable`.)');
});

const memberOf = (m) => (sx) => sx.includes(m);
const ARMED = (m, state) => (sx) => memberOf(m)(sx) && sx.includes(state);
const POINTER = (m, state, pseudo) => (sx) =>
  memberOf(m)(sx) && !sx.includes(state) && sx.includes(pseudo);

for (const { member, state, rules: ruleCount } of ARMABLE) {
  test(`the ARMED \`${member}${state}\` carries a signal \`:hover\`/\`:active\` cannot produce`, () => {
    const armedRules = rulesWhere(ARMED(member, state));
    const pointer = { ':hover': declsWhere(POINTER(member, state, ':hover')),
      ':active': declsWhere(POINTER(member, state, ':active')) };
    // Non-vacuity, and it is the whole risk here: every leg below is a comparison or an absence, and
    // both are free over an empty rule set. The COUNT is pinned as well as the presence — the merged
    // form of this test could not see a deleted rule while a sibling survived.
    assert.equal(armedRules.length, ruleCount,
      `${armedRules.length} armed rules parsed out of styles.css for ${member}${state}, expected ` +
      `${ruleCount}. If a rule was deliberately added or removed, re-derive this number — but if it ` +
      'dropped, the legs below are reading less than they claim and would pass on a broken control');

    const bad = [];
    // ⚠️ BOTH POINTER STATES MUST EXIST, AND THIS IS BLINDED RATHER THAN ASSERTED — trap shape 5,
    // caught by driving this test's own named mutations. Written as a hard `assert.ok` it THREW, so
    // restoring the exact pre-fix `.rz-acc-chip` pair went red naming only the absent `:active` rule
    // and NEVER MENTIONED the `#cf7a33` border collision, which is the defect this whole package is
    // about. A red that names the wrong thing is a red someone closes the wrong way. It is a real
    // requirement in its own right (a control with no press state reads dead under the finger, one
    // with no hover state cannot be told from a label) AND the non-vacuity guard for that pointer
    // state's comparison legs — an empty blob makes every `valueOf` below null, so vacuity here can
    // only ever be reported, never silent. The armed-rule COUNT above stays a hard assert: nothing
    // downstream can report on a rule set that was never read.
    for (const pseudo of [':hover', ':active'])
      if (!propsOf(pointer[pseudo]).length)
        bad.push(`no \`${member}${pseudo}\` rule was parsed out of styles.css — that half of the ` +
          'comparison does not exist, so this pointer state\'s collision legs read nothing.');
    // EACH armed rule answers for itself: `.rz-tool.on` paints seventeen tools and `.rz-tool.demo.on`
    // paints DEMOLISH, and either can regress alone.
    for (const { sel, sels, decls } of armedRules) {
      for (const pseudo of [':hover', ':active'])
        for (const prop of ['border-color', 'background', 'background-color', 'color']) {
          const a = valueOf(decls, prop), h = valueOf(pointer[pseudo], prop);
          if (a !== null && h !== null && a === h)
            bad.push(`${sel} — ${prop} is '${a}' on BOTH armed and ${pseudo}. That is the owner's ` +
              'defect exactly: the cursor that arms a control has already painted it, so the click ' +
              'changes nothing under the pointer.');
        }
      // A channel the pointer states do not touch AT ALL, so the two cannot converge by a colour edit.
      if (!/box-shadow/.test(decls))
        bad.push(`${sel} declares no \`box-shadow\` — the ring/depth was the one armed signal that did ` +
          'not depend on two colours staying different, and it is gone from this rule.');
      // ⚠️ AND THE ARMED RULE MUST OUTRANK THE POINTER ON ITS OWN CONTROL. `.rz-tool.on` and
      // `.rz-tool:hover` have the SAME specificity, so today the armed look survives only because it
      // is written later in the file — a property that moving one rule silently destroys. Repeating
      // `:hover`/`:active` on the armed selector states it instead of relying on source order, which
      // is what "an armed control cannot be washed out by not moving the mouse" actually needs.
      // ⭐ AND `.rz-crew` IS WHY THIS LEG IS NOT THEORETICAL. Selecting a crew member MOVES THE CAMERA
      // to her (the RimWorld colonist-bar gesture, `zoom-pawn-shot.mjs` §5), so the player's pointer
      // is still sitting on the row they just picked when the surface repaints.
      for (const pseudo of [':hover', ':active'])
        if (!sels.some((s) => subject(s).includes(state) && subject(s).includes(pseudo)))
          bad.push(`${sel} is not also written for \`${state}${pseudo}\`. Its armed look then depends ` +
            `on source order to beat the equal-specificity \`${member}${pseudo}\` rule — reorder the ` +
            'file and the state the player just chose disappears under their own cursor.');
      // The armed look must not RE-MEASURE the control (see `reMeasures` and the block comment above).
      // An INCLUSION test over every property the rule declares — never a list of names to hunt for.
      const declared = propsOf(decls);
      if (!declared.length)
        bad.push(`${sel} parsed to ZERO declared properties — the box-reflow leg below is vacuous ` +
          'for this rule, which is exactly how it would pass over a rule it cannot read.');
      for (const p of declared)
        if (reMeasures(p))
          bad.push(`${sel} sets \`${p}\`, which changes the control's BOX. Arming would reflow a ` +
            'WRAPPING row and can push the last controls out of reach — the clipping defect this ' +
            'file guards, and three of these rows wrap. (`.rz-crew` does not wrap: it is a SCROLLING ' +
            'flex column under a `max-height`, where a row that grows shoves its neighbours around ' +
            'under a pointer that is reading them.) Use a `box-shadow` ring; shadows do not ' +
            'participate in layout.');
    }
    for (const pseudo of [':hover', ':active'])
      if (/box-shadow/.test(pointer[pseudo]))
        bad.push(`\`${member}${pseudo}\` has acquired a \`box-shadow\` — it is now claiming the armed ` +
          'state\'s exclusive channel, which is how the border colour was lost the first time');

    assert.deepEqual(bad, [], `the armed ${member}${state} is not distinguishable from a hovered or ` +
      'pressed one:\n  ' + bad.join('\n  '));
  });
}

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
