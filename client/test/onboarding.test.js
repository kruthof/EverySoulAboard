// THE FIRST SCREEN MUST TELL THE TRUTH — the guards for `client/src/ui/onboarding.js`.
//
// ⚠️ WHAT WENT WRONG, so the shape is recognisable. The onboarding card is the only help surface in
// the game and the `?` button reopens it. It shipped saying `['B', 'open their dossier']`. `B` has
// never done that — `client/src/input/controls.js` arms the BUILD tool on `B`, and
// `Hud.openBioForSelected` has no keyboard binding at all. It also led with TALK (the owner has
// stood the dialogue runtime down: *ship playable WITHOUT chat*), named ZERO of the four order verbs
// the whole console-retirement programme exists to deliver, and described the pre-wreck fiction.
// Four wrong things, none of which any test could see, because the card was PROSE and prose is not
// joined to anything.
//
// SO THE GUARDS BELOW ARE OF TWO KINDS AND THE DIVISION IS DELIBERATE:
//
//   1. Assertions on the RENDERED STRING (`overlayHtml()`). This is `CLAUDE.md` trap 1 REMOVED
//      rather than hardened against: a claim sitting in a comment cannot reach the rendered card,
//      so there is nothing for a comment stripper to defend. Prefer these.
//   2. ONE source scan — the key→branch join — because nothing else can check that what the card
//      SAYS about a key matches the branch that implements it. It strips comments through the
//      shared quote-aware `codeOnly` (never a re-derived one), and it carries an INCLUSION control
//      that plants the exact historical lie and requires it be caught, plus a blinding control
//      whose fixture holds a LATER REAL COMMENT (without that, a naive stripper passes vacuously).
//
// ⚠️ WHAT THIS FILE CANNOT SEE, stated rather than buried. It cannot tell you a key WORKS — only
// that the branch the card names exists and calls what the card claims. Two documented keys were
// deleted from the card during this package precisely because they are BOUND AND DEAD on the
// standard surface (`WASD` pans a 0×0 canvas; `M` moves to a cursor nothing updates), and no
// assertion here would have caught either. The instrument that did is real Chrome —
// `client/tools/onboarding-shot.mjs`, committed beside this file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { codeOnly } from './code-only.js';
import {
  overlayHtml, VERBS, ORDER_VERBS, CONTROL_GROUPS, TITLE, LEDE,
} from '../src/ui/onboarding.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '../src/', rel), 'utf8');

const HTML = overlayHtml();
const ROWS = CONTROL_GROUPS.flatMap((g) => g.rows);

/** The `onb-verb-h` headings, in render order, read out of the real markup. */
function verbHeads(html) {
  return [...html.matchAll(/class="onb-verb-h">([^<]*)</g)].map((m) => m[1].trim());
}

/**
 * The branch slices of `code` whose CONDITION contains `cond`, in source order.
 *
 * A slice runs from the condition token to whichever comes first: the next `else if (`, or the next
 * line that begins (after whitespace) with `}`. Both bounds are needed and each catches a case the
 * other misses — the first bounds a one-line `else if` chain (`controls.js`), the second bounds the
 * LAST branch of a braced chain (`roomzoom-view.js`'s `O`, which has no `else if` after it and
 * would otherwise swallow the rest of the file and match anything).
 *
 * A LIST, never one slice: `k === ' '` legitimately appears in two branches of `controls.js` (the
 * focused-BUTTON yield, then the real pause), and asking only the first would report the pause key
 * as unbound. Callers require SOME slice to carry the call.
 */
export function branchSlices(code, cond) {
  const out = [];
  for (let i = code.indexOf(cond); i >= 0; i = code.indexOf(cond, i + 1)) {
    const rest = code.slice(i + cond.length);
    const a = rest.indexOf('else if (');
    const b = rest.search(/\n[ \t]*\}/);
    const ends = [a, b].filter((n) => n >= 0);
    out.push(cond + rest.slice(0, ends.length ? Math.min(...ends) : rest.length));
  }
  return out;
}

/** Does one `{cond, call}` claim hold against `raw`? SOME branch matching `cond` must carry `call`. */
function bindHolds(raw, claim) {
  return branchSlices(codeOnly(raw), claim.cond).some((s) => s.includes(claim.call));
}

// ─────────────────────────────────────────────────────────────────── 1. the card names the orders

test('the card names every ORDER verb — the player\'s task-definition vocabulary', () => {
  // ⚠️ ORDER_VERBS is pinned to a LITERAL here, not read from the module and compared to itself.
  // Without this line, deleting DIG from BOTH the prose and the constant leaves the loop below
  // green over a shorter list — the self-derivation shape `CLAUDE.md` records as the seventh trap's
  // cousin ("its only assertion was Is.EqualTo(the field under test)").
  assert.deepEqual([...ORDER_VERBS], ['DIG', 'STOCKPILE', 'STRIP', 'OPERATE']);
  for (const v of ['DIG', 'STOCKPILE', 'STRIP', 'OPERATE'])
    assert.ok(HTML.includes(v), `the rendered card never says ${v}`);
});

test('the order verbs are taught in the HEADLINE block, not buried in a controls row', () => {
  const verbs = HTML.slice(HTML.indexOf('class="onb-verbs"'), HTML.indexOf('class="onb-controls"'));
  assert.ok(verbs.length > 200, 'the verbs block was not found in the rendered card');
  for (const v of ['DIG', 'STOCKPILE', 'STRIP', 'OPERATE'])
    assert.ok(verbs.includes(v), `${v} is not in the headline verbs block`);
});

// ─────────────────────────────────────────────────────────────────── 2. TALK is not the headline

test('the card does not lead with TALK', () => {
  const heads = verbHeads(HTML);
  assert.equal(heads.length, 2, 'expected exactly two headline verb blocks');
  assert.ok(!/TALK/i.test(heads[0]), `the FIRST verb taught is ${heads[0]} — it must not be TALK`);
  // Stricter than "not first", deliberately: a second headline TALK block is the same mistake one
  // column to the right, and the owner's decision is that TALK is not a headline verb at all.
  for (const h of heads) assert.ok(!/TALK/i.test(h), `TALK is a headline verb again: ${h}`);
  assert.ok(!/TALK/i.test(TITLE), 'the TITLE leads with TALK');
  assert.ok(!/\btalk\b/i.test(LEDE), 'the LEDE leads with talk');
});

test('TALK survives as a control row — demoted, not deleted (it works: T opens a channel)', () => {
  const t = ROWS.find((r) => r.key === 'T');
  assert.ok(t, 'the T row is gone entirely — the verb still works and should still be findable');
  assert.match(t.text, /talk/i);
});

// ─────────────────────────────────────────── 3. the join: what the card SAYS ↔ what the code DOES

test('every documented key is joined to the branch that implements it', () => {
  // ⚠️ COUNT THE CLAIMS, NOT THE ROWS. A row documents 1..3 keys, so a row count would let someone
  // collapse `G / Z / V` to `G` and still satisfy a row-count floor while dropping two joins.
  const claims = ROWS.flatMap((r) => (r.bind || []).map((b) => ({ ...b, key: r.key, text: r.text })));
  assert.ok(claims.length >= 10, `only ${claims.length} key claims are joined — the guard has been hollowed out`);
  for (const c of claims)
    assert.ok(bindHolds(src(c.file), c),
      `the card says [${c.key}] "${c.text}" ⇒ ${c.call} in ${c.file}, and no branch there does that`);
});

test('a row that opts OUT of the join must say why', () => {
  for (const r of ROWS.filter((x) => !x.bind))
    assert.ok(typeof r.why === 'string' && r.why.length > 20,
      `row [${r.key}] has bind:null and no reason — that is how this guard gets silenced`);
});

test('the B row no longer claims a dossier — the exact sentence that shipped false', () => {
  const b = ROWS.find((r) => r.key.split(' / ').includes('B'));
  assert.ok(b, 'the B row is gone');
  assert.ok(!/dossier|\bbio\b|biograph/i.test(b.text), `the B row still claims: ${b.text}`);
  // And positively: whatever it now claims must survive the join above.
  assert.ok(b.bind && b.bind.length, 'the B row must carry a bind — it is the row this whole file exists for');
});

// ── INCLUSION CONTROL: plant the historical violation and require it be caught ──
//
// `CLAUDE.md` trap 4: a population count proves a matcher matched SOMETHING, never that it would
// match THE THING. So the guard is handed the exact claim the card shipped for months, against the
// exact real file, and must reject it.
test('INCLUSION — the historical lie (B ⇒ openBioForSelected) is CAUGHT against the real source', () => {
  const raw = src('input/controls.js');
  assert.equal(bindHolds(raw, { cond: "k === 'b'", call: 'openBioForSelected' }), false,
    'the join accepts "B opens the dossier" against the real controls.js — it cannot see the bug it exists for');
  // …and the same join accepts the TRUE claim about the same key, so the rejection above is not
  // simply "this matcher never says yes".
  assert.equal(bindHolds(raw, { cond: "k === 'b'", call: "onBuildKey('build')" }), true,
    'the join rejects the TRUE claim about B — it is vacuously negative');
});

test('INCLUSION — a key with no branch at all is caught', () => {
  // `Q` is bound nowhere in controls.js. A card row claiming it would be the WASD/M failure mode.
  assert.equal(bindHolds(src('input/controls.js'), { cond: "k === 'q'", call: 'anything' }), false);
});

// ── NEGATIVE CONTROLS for the comment stripper ──
//
// Both halves of `CLAUDE.md` trap 1 are required, and the second one is the one that is usually
// written vacuously.

test('NEGATIVE CONTROL — a claim that exists only in a COMMENT does not satisfy the join', () => {
  const fixture = [
    "    else if (k === 'a' || k === 'A') pan(-1, 0);",
    "    // else if (k === 'b' || k === 'B') openBioForSelected();   <- the removed idea, in prose",
    "    else if (k === 'b' || k === 'B') onBuildKey('build');",
    '    /* a later real comment, so a stripper that gave up early is not silently fine */',
    "    else if (k === 'x' || k === 'X') onBuildKey('cancel');",
  ].join('\n');
  assert.equal(bindHolds(fixture, { cond: "k === 'b'", call: 'openBioForSelected' }), false,
    'a commented-out call satisfied the join');
  assert.equal(bindHolds(fixture, { cond: "k === 'b'", call: "onBuildKey('build')" }), true,
    'the LIVE call in the same fixture was missed — the stripper is eating code');
});

test('NEGATIVE CONTROL — a quoted comment marker does not blind the stripper', () => {
  // ⚠️ THIS CONTROL'S FIRST DRAFT WAS VACUOUS AND ONLY A MUTATION FOUND IT — recorded because the
  // mistake is subtle and the repaired shape is the reusable part.
  //
  // The first fixture's quoted marker was `"/* … */"` — BALANCED. A naive stripper opens its
  // comment at the `/*` inside the string and closes it at that same string's `*/`, so the damage
  // is contained to the literal, the live code below survives, and BOTH assertions pass whether the
  // stripper is quote-aware or not. Deleting the shipped `codeOnly`'s entire quote branch left this
  // test GREEN. The control was decoration.
  //
  // THE FIX IS AN **UNBALANCED** MARKER, AND *THAT* IS WHY THE LATER REAL COMMENT IS REQUIRED: the
  // string opens a `/*` and never closes it, so a naive `replace(/\/\*[\s\S]*?\*\//g,'')` runs
  // forward hunting a terminator and finds the LATER REAL COMMENT's `*/` — swallowing the live
  // branch in between. With no later real comment there is no terminator, the naive regex matches
  // nothing, returns the input unchanged, and passes vacuously. Verified by mutation: removing the
  // quote branch from `client/test/code-only.js` reddens this test (n=1) and nothing else here.
  const blockFixture = [
    '    const marker = "/* opens a comment and never closes it";',
    "    else if (k === 'b' || k === 'B') onBuildKey('build');",
    "    /* a LATER REAL COMMENT, carrying a decoy: onBuildKey('bogus') */",
    "    else if (k === 'x' || k === 'X') onBuildKey('cancel');",
  ].join('\n');
  assert.equal(bindHolds(blockFixture, { cond: "k === 'b'", call: "onBuildKey('build')" }), true,
    'the quoted /* swallowed the live code — the stripper is blinded');
  assert.equal(bindHolds(blockFixture, { cond: "k === 'b'", call: "onBuildKey('bogus')" }), false,
    'a decoy inside a genuine later comment satisfied the join');

  // The `//` half of the same rule, which the block half cannot reach: a quoted line-comment marker
  // must not eat the rest of ITS OWN line. Naive: `'//'` strips to EOL and the call disappears.
  const lineFixture = "    else if (k === 'c' || k === 'C') { const s = '//'; onBuildKey('cee'); }";
  assert.equal(bindHolds(lineFixture, { cond: "k === 'c'", call: "onBuildKey('cee')" }), true,
    "a quoted '//' ate the rest of its line — the stripper is blinded");
});

test('NEGATIVE CONTROL — prose about a key does not FIRE the guard (comments are documentation)', () => {
  // The mirror of the above: the real `roomzoom-view.js` O branch carries a long comment naming
  // `client/src/input/controls.js` and half the console's key map. If comments were scanned, the
  // join would drift into matching prose. This asserts the real, comment-heavy branch still joins.
  const r = ROWS.find((x) => x.key === 'O');
  assert.ok(bindHolds(src(r.bind[0].file), r.bind[0]), 'the O branch, which is mostly comment, failed to join');
});

// ─────────────────────────────────────────────────────────────────── 4. the fiction is the wreck's

test('the fiction is the WRECK, not the pre-wreck ship', () => {
  // A RATCHET, and it says so: it cannot prove the new copy is good, only that the retired copy has
  // not walked back in. `hosts/web/Program.cs` boots `--ship wreck`; "a drifting ship, a skeleton
  // crew" described the ship before the re-premise, and "Your crew are people." led on the verb the
  // owner stood down.
  for (const dead of ['skeleton crew', 'drifting ship', 'Your crew are people'])
    assert.ok(!HTML.includes(dead), `the retired pre-wreck copy is back: "${dead}"`);
});

test('the card does not promise a thaw — the pods do nothing until W5', () => {
  // ⚠️ The premise ends "the rest thaw one at a time through MOSS", and that is NOT BUILT: there is
  // no CryoSystem, no thaw command, no MOSS thaw op (AuthoredShips.cs's PeriluneWreck header says
  // so in full). A first screen that told the player to wake somebody would be the same class of
  // defect as the B row — a plausible sentence nobody drove.
  assert.ok(!/\bthaw|\bwake (someone|somebody|the|another)/i.test(HTML),
    'the card promises a thaw the game cannot deliver');
});
