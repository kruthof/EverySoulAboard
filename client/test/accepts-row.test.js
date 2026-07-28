// THE ACCEPTS ROW'S MARKUP (console-retirement WP-6) — the chip strip that finally makes the
// stockpile accept-mask reachable on the standard surface, and the sentence that says what the chips
// actually do.
//
// WHY THESE ARE STRING ASSERTIONS AND NOT dom-lite. Same reason `zone-overlay.test.js` gives: the
// builder is a PURE string function (the `render/pawn-svg.js` / `ui/deck-minimap.js` house pattern),
// so its markup is checkable to the character here, while `client/test/dom-lite.js` parses no markup
// at all and could not see inside an assigned `innerHTML`. That the ROW IS MOUNTED, revealed on arm,
// clickable and wired to the brush is proven where that claim lives — driven through the real
// controller in `room-model.test.js` — and in a real browser.
//
// EVERY TEST BELOW IS WRITTEN SO THAT `acceptsRowHtml` RETURNING '' REDDENS IT. That is not a
// hypothetical mutation: WP-3 measured its own builder returning the empty string and left 546/546
// tests passing, because the only guard was a source scan proving the function was called.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STOCK_KINDS, ACCEPT_ALL, defaultStockFilter } from '../src/ui/stock-filter-model.js';
import { acceptsRowHtml, mismatchLabel, APPLIES_NEXT_LABEL } from '../src/ui/accepts-row.js';

/** Count non-overlapping matches — a presence regex says "at least one", which is not the claim. */
const count = (s, re) => (s.match(re) || []).length;

/** The mask a rendered row is SHOWING, read back out of its own markup. */
function shownMask(html) {
  let m = 0;
  for (const mt of html.matchAll(/data-rzaccept="(\d+)"[^>]*aria-pressed="(true|false)"/g)) {
    if (mt[2] === 'true') m |= 1 << Number(mt[1]);
  }
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════════ the chips

// MUTATION: `return ''` unconditionally ⇒ fails.
test('one chip per ItemKind, in enum order, each carrying its kind byte and its label', () => {
  const html = acceptsRowHtml(ACCEPT_ALL, 0);
  assert.ok(html.length > 0, 'the row must not be empty — there are always seven kinds to show');
  assert.equal(count(html, /data-rzaccept="/g), STOCK_KINDS.length, 'one chip per ItemKind, no more');
  const kinds = [...html.matchAll(/data-rzaccept="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(kinds, STOCK_KINDS.map((k) => k.kind),
    'the chips must be emitted in ItemKind order, carrying the SIM BYTE — the `kind` index IS the ' +
    'bit the host stores, so a chip mislabelled by one silently filters the wrong material');
  for (const { kind, label } of STOCK_KINDS) {
    assert.ok(html.includes('>' + label + '<'), `kind ${kind} is missing its label '${label}'`);
  }
});

// MUTATION: emit `class="rz-acc-chip on"` unconditionally, or drop the `stockKindAccepted` call ⇒
// fails. A row that lights every chip whatever the mask is a filter UI that cannot show a filter.
test('a chip is LIT exactly when the mask accepts its kind', () => {
  assert.equal(shownMask(acceptsRowHtml(ACCEPT_ALL, 0)), ACCEPT_ALL, 'accept-all lights every chip');
  assert.equal(shownMask(acceptsRowHtml(0, 0)), 0, 'accept-nothing lights none');
  assert.equal(count(acceptsRowHtml(0, 0), /class="rz-acc-chip on"/g), 0);
  assert.equal(count(acceptsRowHtml(ACCEPT_ALL, 0), /class="rz-acc-chip on"/g), STOCK_KINDS.length);

  const FOOD_AND_PARTS = (1 << 3) | (1 << 5);
  const html = acceptsRowHtml(FOOD_AND_PARTS, 0);
  assert.equal(shownMask(html), FOOD_AND_PARTS, 'the row does not show the mask it was handed');
  assert.equal(count(html, /class="rz-acc-chip on"/g), 2, 'exactly two kinds are accepted');
  // The lit chips are the RIGHT two, by label — a mask read back through the same bit arithmetic
  // that emitted it would be self-consistent and still wrong.
  const lit = [...html.matchAll(/class="rz-acc-chip on"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(lit, ['FOOD', 'PARTS']);
});

// The state has to be readable by something other than a colour. MUTATION: drop `aria-pressed`, or
// pin it to a constant ⇒ fails.
test('every chip is a real, explicitly-typed button carrying its pressed state', () => {
  const html = acceptsRowHtml(ACCEPT_ALL & ~(1 << 2), 0);
  assert.equal(count(html, /<button type="button"/g), STOCK_KINDS.length,
    'every chip must be an explicit type="button" — an implicit button SUBMITS inside a <form>, and ' +
    'this row is one innerHTML assignment away from living anywhere');
  assert.equal(count(html, /aria-pressed="true"/g), STOCK_KINDS.length - 1);
  assert.equal(count(html, /aria-pressed="false"/g), 1,
    '`on` is a CSS class and a class is invisible to assistive tech — the toggle STATE has to be in ' +
    'the markup');
  // aria-pressed and the `on` class must agree, or the row says two different things at once.
  assert.equal(count(html, /class="rz-acc-chip on"[^>]*aria-pressed="true"/g), STOCK_KINDS.length - 1);
  assert.equal(count(html, /class="rz-acc-chip"[^>]*aria-pressed="false"/g), 1);
  // The title says which direction the chip is currently pointing, not merely that it is a filter.
  assert.match(html, /title="CORPSE &mdash; kept out of stockpile tiles you paint next"/);
  assert.match(html, /title="FOOD &mdash; accepted by stockpile tiles you paint next"/);
});

// ═════════════════════════════════════════════════════════════════════════════════ the wording

// PLAN §5 GAP 2 — "chips affect only future paints, with nothing saying so". On the console this was
// said only in a `title=` attribute nobody hovers: "true, and invisible".
// MUTATION: drop the `.rz-acc-note` block ⇒ fails.
test('the row states, visibly, that the chips apply to tiles painted NEXT', () => {
  const html = acceptsRowHtml(ACCEPT_ALL, 0);
  assert.ok(html.includes(APPLIES_NEXT_LABEL), 'the applies-next line is missing');
  assert.equal(count(html, /class="rz-acc-note"/g), 1, 'exactly one note element carries it');
  // It is NOT inside a title/aria attribute — the whole point is that it needs no hover. (Checked by
  // stripping every attribute value and confirming the words survive in TEXT.)
  const text = html.replace(/<[^>]*>/g, ' ');
  assert.ok(text.includes(APPLIES_NEXT_LABEL),
    'the applies-next wording only exists inside an attribute, which is exactly where the console ' +
    'put it and exactly why the player never read it');
});

// MUTATION: return a fixed string / drop the plural / count from 0 ⇒ fails.
test('mismatchLabel counts the already-painted tiles that disagree, and is SILENT at zero', () => {
  assert.equal(mismatchLabel(0), '', 'zero must render nothing at all — a clean room reads clean');
  assert.equal(mismatchLabel(-3), '', 'a negative count is not a sentence');
  assert.equal(mismatchLabel(undefined), '');
  // Both the noun AND the verb agree — a filter row that reads "1 ZONED TILES KEEP" is the kind of
  // sloppiness a player reads as "this number is probably wrong too".
  assert.equal(mismatchLabel(1), '1 ZONED TILE IN THIS ROOM KEEPS A DIFFERENT FILTER');
  assert.equal(mismatchLabel(2), '2 ZONED TILES IN THIS ROOM KEEP A DIFFERENT FILTER');
  assert.equal(mismatchLabel(9), '9 ZONED TILES IN THIS ROOM KEEP A DIFFERENT FILTER');
  // ROOM-SCOPED, and the words say so. The count is derived from `roomZoneTiles`, which drops every
  // row outside the focused rect; a sentence that implied the whole ship would be a lie in text.
  assert.match(mismatchLabel(2), /IN THIS ROOM/,
    'the wording must scope itself — the count only ever sees the focused room');
});

// The count reaches the ROW, not just the helper. MUTATION: ignore the second argument ⇒ fails.
test('the row carries the mismatch count when there is one, and omits it when there is not', () => {
  assert.ok(!acceptsRowHtml(ACCEPT_ALL, 0).includes('KEEP A DIFFERENT FILTER'),
    'the row invented a discrepancy for a room with none');
  assert.ok(!acceptsRowHtml(ACCEPT_ALL).includes('KEEP A DIFFERENT FILTER'),
    'an omitted count must read as zero, not as NaN or as a claim');
  assert.equal(count(acceptsRowHtml(ACCEPT_ALL), /class="rz-acc-diff"/g), 0);

  const html = acceptsRowHtml(1 << 3, 4);
  assert.ok(html.includes(mismatchLabel(4)), 'the row dropped the count it was handed');
  assert.equal(count(html, /class="rz-acc-diff"/g), 1,
    'the count needs its own element — it is the one line in this row about the MAP rather than ' +
    'about the brush, and it is styled as the alarm');
  // …and it sits beside the rule, not instead of it: both facts are shown.
  assert.ok(html.includes(APPLIES_NEXT_LABEL), 'the count REPLACED the rule instead of joining it');
});

// ══════════════════════════════════════════════════════════════════════ escaping — DISCLOSED GAP

// ⚠️ READ THIS BEFORE BELIEVING THE `esc` CALLS IN accepts-row.js ARE COVERED. THEY ARE NOT, AND THAT
// IS MEASURED, NOT ASSUMED. `acceptsRowHtml` takes two NUMBERS. The only model text it interpolates
// is `label`, which comes from the frozen `STOCK_KINDS` table, whose seven labels are ASCII with no
// markup character in them — and the kind byte is an integer. So there is no reachable input that
// `esc` can change, and both mutations were applied physically and BOTH SURVIVED a fully green suite:
//   • `esc(kind)` → `kind`   in the data-rzaccept attribute  ⇒ GREEN (678/678)
//   • `esc(label)` → `label` in the chip text                ⇒ GREEN (678/678)
// The calls are KEPT anyway, for the reason `zone-overlay.js`'s header states in the same situation:
// a builder that emits markup must not depend on its caller having sanitised anything, and "the
// input happens to be safe today" is not a contract — a room name, a player-typed zone name or an
// eighth ItemKind walks straight in. But a test claiming to guard them would be a test whose named
// mutation cannot bite, which is this repo's single most common review finding.
//
// What IS asserted below is real and does bite: the emitted markup is well-formed, and every entity
// in it is one the builder wrote on purpose. MUTATION: emit a bare `&` or an unbalanced quote ⇒ fails.
test('the emitted markup is well-formed, and every entity in it is deliberate', () => {
  const html = acceptsRowHtml(ACCEPT_ALL, 3);
  assert.ok(!/title="[^"]*"[^ >]/.test(html), 'an attribute value escaped its own quotes');
  // `\b`, NOT a trailing space: measured — counting `<button ` misses a bare `<button>`, so an
  // unbalanced attribute-less opener slipped past this assertion on its first draft and it went GREEN.
  assert.equal(count(html, /<button\b/g), count(html, /<\/button>/g), 'unbalanced <button> tags');
  assert.equal(count(html, /<div\b/g), count(html, /<\/div>/g), 'unbalanced <div> tags');
  assert.equal(count(html, /<span\b/g), count(html, /<\/span>/g), 'unbalanced <span> tags');
  // The four entities this builder writes are ▸, —, ·, and whatever `esc` produced. Anything else is
  // a raw `&` that a browser will try to interpret.
  const strays = [...html.matchAll(/&(?!amp;|lt;|gt;|quot;|#39;|#9656;|mdash;|middot;)/g)];
  assert.deepEqual(strays.map((m) => m.index), [], 'an undeclared & reached the markup');
  // Non-vacuity: the entity scan must actually see the entities the builder emits.
  assert.ok(count(html, /&#9656;/g) === 1 && count(html, /&mdash;/g) === STOCK_KINDS.length,
    'the entity census found none of the entities it is filtering — it is matching nothing');
});

// ══════════════════════════════════════════════════════════════════════════════════ non-vacuity

// Every assertion above is about a row rendered from a mask; if the shared model were broken (or if
// this file's own reader were), several of them would be trivially true.
test('the fixture really is the shared model, and the reader really reads', () => {
  assert.equal(STOCK_KINDS.length, 10, 'the ItemKind table is no longer ten kinds');
  assert.equal(defaultStockFilter(), ACCEPT_ALL, 'the palette default is not accept-all');
  assert.notEqual(shownMask(acceptsRowHtml(ACCEPT_ALL, 0)), shownMask(acceptsRowHtml(0, 0)),
    'the mask reader returns the same answer for accept-all and accept-nothing — it is broken, and ' +
    'every assertion built on it is passing for the wrong reason');
});
