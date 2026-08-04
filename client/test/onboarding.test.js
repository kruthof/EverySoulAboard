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
import { readFileSync, readdirSync } from 'node:fs';
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
 * LAST branch of a braced chain (`roomzoom-view.js`'s `O`, which has no `else if` after it).
 *
 * ⚠️ THIS COMMENT'S FIRST VERSION ENDED "…and would otherwise swallow the rest of the file and
 * MATCH ANYTHING". The direction was right and the magnitude was invented. MEASURED on the
 * comment-stripped source (`sb-m1b-measure`, 2026-07-29), for `k === 'o'` in `roomzoom-view.js`:
 *
 *     shipped slice          120 chars
 *     brace bound removed    391 chars   (+271)   — and there is genuinely no later `else if (`
 *     else-if bound removed  120 chars            — the brace is what binds this one
 *
 * So it does run to EOF, but EOF is **271 characters away**: the tail of that file is `toast()`
 * and one `$` helper, nothing more. The unbounded slice would therefore falsely match `toast(` and
 * `_toastTimer` and would still NOT match `arm('dig')`. THE BOUND IS REAL; "matches anything" was
 * not, and a justification that overstates its own subject is the thing this package exists to
 * stop shipping. The two INCLUSION controls below plant exactly the 271 characters' worth of lie
 * that IS reachable.
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
  // ⭐ M3-15 (OD-N): OPERATE was the fourth and is DELETED — doors and vents are actuated from the
  // MOSS console now, so a card that still taught a palette OPERATE would be teaching a verb the
  // player cannot find. The literal moves WITH the constant, deliberately: this line's job is to stop
  // a SILENT shrink (delete a verb from both the prose and the constant and the loop below stays
  // green over a shorter list), not to freeze the list against a decision.
  assert.deepEqual([...ORDER_VERBS], ['DIG', 'STOCKPILE', 'STRIP']);
  for (const v of ['DIG', 'STOCKPILE', 'STRIP'])
    assert.ok(HTML.includes(v), `the rendered card never says ${v}`);
  assert.ok(!HTML.includes('OPERATE'),
    'the onboarding card still teaches OPERATE, a verb M3-15 deleted from the palette');
});

test('the order verbs are taught in the HEADLINE block, not buried in a controls row', () => {
  const verbs = HTML.slice(HTML.indexOf('class="onb-verbs"'), HTML.indexOf('class="onb-controls"'));
  assert.ok(verbs.length > 200, 'the verbs block was not found in the rendered card');
  for (const v of ['DIG', 'STOCKPILE', 'STRIP'])
    assert.ok(verbs.includes(v), `${v} is not in the headline verbs block`);
});

test('the card teaches THE FIRST ORDER — the gesture that starts the game (M2-20 / OD-G)', () => {
  // ⚠️ WHY THIS ROW IS NOT OPTIONAL. Under OD-H every work type boots OFF, so a new game opens with
  // a crew member who will do nothing until the player says she may — her CREW WATCH row reads
  // "Awaiting orders" the entire time. A first screen that names every verb EXCEPT the
  // one that starts the game leaves the player watching a pawn wander and concluding it is broken.
  // That is the report OD-G came from, and it is the same class of defect as the `B` row: a card
  // that is true about what it says and silent about what matters.
  //
  // OWNER BATCH ITEM 10 (decided by default, 2026-07-29) defines "the first order" as ANY player
  // command that results in her taking a job, INCLUDING a WORK-tab toggle — so the card teaches the
  // WORK tab. If that is overturned to "a targeted order only", this row becomes STRIP/Prioritise
  // and this test follows it; what may NOT happen is the row quietly disappearing.
  const row = ROWS.find((r) => /WORK/i.test(r.key));
  assert.ok(row, 'the card no longer names the WORK tab — the game\'s first move is untaught');
  assert.ok(HTML.includes(row.text),
    `the WORK row's text never reaches the rendered card: ${JSON.stringify(row.text)}`);
  assert.ok(/\bWORK\b/.test(HTML), 'the rendered card never says WORK');
  // It must carry a real join, like every row that names a gesture: this is the file's whole point.
  assert.ok(row.bind && row.bind.length >= 2,
    'the WORK row must join BOTH halves of the gesture — opening the tab and setting a cell. A row '
    + 'that joined only the tab would document a panel with no way to use it.');
  // …and the row's text must fit one line (~28 chars at this grid width): a wrapped cell makes BOTH
  // cells in its grid row taller, and the card's height is a correctness property (BEGIN below the
  // fold). Measured in Chrome by `client/tools/onboarding-shot.mjs`; this is the cheap early catch.
  assert.ok(row.text.length <= 28,
    `the WORK row's text is ${row.text.length} chars and will wrap the key grid — see the module header`);
});

test('the BUILD block names BOTH currencies — furniture is PARTS, not REGOLITH (the R2 defect)', () => {
  // ⚠️ THE SENTENCE THIS REPLACES MISDIRECTED INTO A SILENT FAILURE, which is why it gets a guard
  // and not just a correction. The card said "Building spends REGOLITH" over a block that also
  // named furniture; furniture is `PlaceDeviceCommand`, whose `Currency` is `ItemKind.Parts`
  // (`sim/Sim.Core/Commands/Commands.cs:332`) at `DevicePlaceCost = 3` (`SimDefs.cs:884`), and the
  // wreck boots with ONE Part. A refusal is a silent no-op, so the old copy sent a new player to
  // place bunks that would never appear and never say why.
  const build = VERBS.find((v) => /BUILD/.test(v.head));
  assert.ok(build, 'the BUILD headline block is gone');
  assert.match(build.body, /REGOLITH/, 'the BUILD block no longer names REGOLITH (structure\'s cost)');
  assert.match(build.body, /PARTS/, 'the BUILD block does not name PARTS — furniture\'s cost is back to a lie');
  // The two must not be presented as one cost. "spends REGOLITH" as the block's ONLY currency claim
  // is the exact shape that shipped; requiring both names is what stops it returning.
  assert.ok(build.body.indexOf('REGOLITH') !== build.body.indexOf('PARTS'),
    'REGOLITH and PARTS resolved to one claim — they are different currencies for different tools');
});

test('the BUILD block does not tell the player to SWEEP furniture, or to give it a material', () => {
  // `isSweepTool` is structural + order only (`ui/room-model.js:142`), and `toolHasMaterial` is
  // wall/floor only (`ui/build-material-model.js:38`). Furniture is a plain click with no material,
  // so a blanket "pick a material, drag to sweep a run" was wrong twice over the same nouns.
  const build = VERBS.find((v) => /BUILD/.test(v.head));
  for (const dead of ['Pick a material, drag to sweep a run', 'Building spends <b>REGOLITH</b>'])
    assert.ok(!build.body.includes(dead), `the retired BUILD copy is back: "${dead}"`);
  assert.match(build.body, /single click|one click/i,
    'the BUILD block no longer says furniture is a CLICK — the sweep claim can walk back in');
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
  // The heads above are read out of the RENDERED markup; this ties them back to the data, so a
  // renderer that silently dropped or reordered a verb block cannot pass by rendering nothing.
  assert.deepEqual(heads, VERBS.map((v) => v.head));
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

/**
 * Every `.js` under `client/src/` EXCEPT the card itself, concatenated.
 *
 * ⚠️ `ui/onboarding.js` IS EXCLUDED AND THAT EXCLUSION IS THE WHOLE POINT. The `why` strings live
 * in that file, so a corpus including it would be satisfied by the `why` string finding ITSELF —
 * `Is.EqualTo(the field under test)`, `CLAUDE.md`'s self-derivation shape, which has shipped in
 * this repo before. A `why` must name a symbol that exists somewhere the card does not control.
 */
const SRC_CORPUS = (function build(dir = join(here, '../src')) {
  let out = '';
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out += build(p);
    else if (e.name.endsWith('.js') && !p.endsWith('/ui/onboarding.js')) out += readFileSync(p, 'utf8');
  }
  return out;
}());

/** The camelCase identifiers a `why` string names (≥6 chars, a lower run then an upper). Prose
 *  words never match this — "documentation", "gesture", "designation" are all single-case. */
function namedSymbols(why) {
  return [...String(why).matchAll(/\b[a-z][a-zA-Z0-9_$]*[A-Z][a-zA-Z0-9_$]*\b/g)]
    .map((m) => m[0]).filter((s) => s.length >= 6);
}

test('a row that opts OUT of the join must say why — and the why must NAME REAL CODE', () => {
  // ⚠️ THE LENGTH FLOOR ALONE WAS SATISFIED BY ANY 21 CHARACTERS, i.e. by "because I said so and
  // then some". Both shipped `why` strings already name a real symbol (`onScenePointerUp`,
  // `escStackRung`), so this makes the practice the RULE: an opt-out has to point at something a
  // reader can go and open. That is the difference between a reason and an excuse, and this join
  // is the only thing standing between the card and another `B`-row.
  for (const r of ROWS.filter((x) => !x.bind)) {
    assert.ok(typeof r.why === 'string' && r.why.length > 20,
      `row [${r.key}] has bind:null and no reason — that is how this guard gets silenced`);
    const named = namedSymbols(r.why);
    assert.ok(named.length > 0,
      `row [${r.key}]'s why names no identifier at all: ${JSON.stringify(r.why)}`);
    assert.ok(named.some((s) => SRC_CORPUS.includes(s)),
      `row [${r.key}]'s why names ${named.join('/')}, and none of them exists anywhere in ` +
      `client/src (excluding the card itself) — the reason points at nothing`);
  }
});

test('INCLUSION — the why rule rejects prose and rejects an INVENTED symbol', () => {
  // Trap 4 again: the test above proves the matcher matched something. These two prove it would
  // reject the things it exists to reject. Both are the shapes a future row would actually take.
  assert.equal(namedSymbols('a pointer gesture, not a key — it simply is not bound').length, 0,
    'pure prose produced an identifier — the matcher is too loose to mean anything');
  const invented = namedSymbols('handled by onPhantomHandlerRung, obviously');
  assert.deepEqual(invented, ['onPhantomHandlerRung'], 'the matcher did not read the symbol out');
  assert.equal(SRC_CORPUS.includes('onPhantomHandlerRung'), false,
    'an invented symbol was found in client/src — the corpus is not what it claims to be');
  // …and the positive: a REAL symbol from a row we ship is present, so the corpus is not empty.
  assert.equal(SRC_CORPUS.includes('escStackRung'), true,
    'the corpus does not contain a symbol we know is in client/src — it built wrong (vacuous)');
  // The corpus must not be able to see the card, or every why would validate against itself.
  // ⚠️ THE PROBE IS `perilune.introSeen.v1` — measured to occur EXACTLY ONCE in client/src, in
  // onboarding.js. An earlier draft of this line probed a phrase from the module header in the
  // wrong CASE, so it was false whether or not the exclusion worked: a vacuous control inside the
  // very test written to stop vacuous controls.
  assert.equal(SRC_CORPUS.includes('perilune.introSeen.v1'), false,
    'the corpus swallowed onboarding.js — a why would now be satisfied by its own text');
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

// ── INCLUSION CONTROLS FOR THE SCOPING ITSELF ──
//
// ⚠️ THE CONTROL ABOVE IS SATISFIED BY STRING ABSENCE, NOT BY SCOPING, AND THAT WAS THIS FILE'S
// OWN TRAP-4 INSTANCE. `openBioForSelected` appears **zero** times in `controls.js` (measured), so
// the planted lie is rejected by `String.includes` alone — it passes identically with
// `branchSlices` deleted outright. `branchSlices` is the entire key→branch join and, before these
// two tests, NOTHING PINNED IT. Measured on a scratch copy (`sb-m1b-branchslices`, 2026-07-29),
// each of these degradations SURVIVED the whole file at 14/14:
//
//     branchSlices returns the whole file as one slice     SURVIVED 14/14
//     the `else if (` bound dropped                        SURVIVED 14/14
//     the `\n[ \t]*\}` bound dropped                       SURVIVED 14/14
//
// …and with the whole-file degradation in place, a card row claiming `[O]` runs `arm('dig')` SHIPS
// GREEN. The countermeasure is a claim that is PRESENT IN THE SAME FILE BUT IN ANOTHER BRANCH, so
// the only thing that can reject it is the scoping. One test per bound, deliberately: `assert`
// throws, so two bounds sharing a test would let the second one die unnoticed behind the first
// (`CLAUDE.md`'s fifth trap shape).

test('INCLUSION — the `else if (` bound: a call from the NEXT branch of controls.js is rejected', () => {
  const raw = src('input/controls.js');
  // `Cmd.pause` is real, and lives in the ` ` (Space) branch — a NEIGHBOUR of `r`, not `r` itself.
  // Nothing here is absent from the file, so `includes` cannot save this assertion: only the
  // `else if (` bound can. VERIFIED BY MUTATION: dropping that bound makes this line go true.
  assert.equal(bindHolds(raw, { cond: "k === 'r'", call: 'Cmd.pause' }), false,
    'the R branch accepted a call that belongs to a LATER branch — the `else if (` bound is gone, ' +
    'and with it every guarantee that a card row describes the key it names');
  // Its own positive leg, in this test: without it the assertion above is satisfied by a
  // `bindHolds` that returns false for everything.
  assert.equal(bindHolds(raw, { cond: "k === 'r'", call: 'Cmd.deck' }), true,
    'the TRUE claim about R was rejected — the negative above is vacuous');
});

test('INCLUSION — the brace bound: a call from AFTER the LAST branch of roomzoom-view.js is rejected', () => {
  const raw = src('ui/roomzoom-view.js');
  // ⭐ RE-POINTED FROM `O` TO `M` BY M3-15 (OD-N), WHICH DELETED THE `O` BRANCH. `M` is the LAST
  // branch of the same chain now, so it is the one with no `else if (` after it and therefore the one
  // the brace bound alone terminates — the property this guard exists to measure. ⚠️ Re-pointed and
  // NOT deleted, on purpose: a correct deletion that quietly removes an instrument's only fixture is
  // the ninth trap shape, and the blind spot it would leave here is "the last branch of every braced
  // chain now matches whatever happens to follow it".
  //
  // `toast(` is real and sits in the file tail that this branch would swallow if the `\n[ \t]*\}`
  // bound were removed. VERIFIED BY MUTATION on this tree: dropping `const b = rest.search(...)`
  // (i.e. `const ends = [a]`) makes the first assertion go true.
  assert.equal(bindHolds(raw, { cond: "k === 'm'", call: 'toast(' }), false,
    'the M branch accepted a call from the file TAIL — the brace bound is gone, and the last ' +
    'branch of every braced chain now matches whatever happens to follow it');
  assert.equal(bindHolds(raw, { cond: "k === 'm'", call: "arm('move')" }), true,
    'the TRUE claim about M was rejected — the negative above is vacuous');
});

test('INCLUSION — a key with no branch at all is caught', () => {
  // `Q` is bound nowhere in controls.js. A card row claiming it would be the WASD/M failure mode.
  const raw = src('input/controls.js');
  assert.equal(bindHolds(raw, { cond: "k === 'q'", call: 'anything' }), false);
  // ⚠️ ITS OWN POSITIVE LEG, in this test and not borrowed from the one above. `assert` throws, so
  // a leg that lives in a neighbouring test proves nothing about THIS one (`CLAUDE.md`'s fifth trap
  // shape). Without this line the assertion above is satisfied by a `bindHolds` that returns false
  // for everything — including a broken one.
  assert.equal(bindHolds(raw, { cond: "k === 't'", call: 'talkSelected' }), true,
    'bindHolds says no to a TRUE claim — the negative above is vacuous');
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

test('a comment-HEAVY branch still joins, and its prose does not become matchable', () => {
  // ⚠️ RENAMED. This was called "NEGATIVE CONTROL — prose about a key does not FIRE the guard",
  // and its only assertion was a POSITIVE (`bindHolds(...) === true`). A test whose single
  // assertion runs the opposite direction from its name cannot detect the thing the name promises,
  // and the name is what a future reader trusts. It now does BOTH halves and is named for them.
  // ⭐ RE-POINTED FROM `O` TO `M` BY M3-15 (OD-N). The `O` branch was deleted with the OPERATE verb,
  // and it was this guard's fixture BECAUSE it was mostly comment and that comment named
  // `controls.js` in prose. `M` has exactly the same two properties (a 19-line comment about the
  // console keymap leak, naming `input/controls.js`), so the measurement is unchanged. The claim is
  // written out here rather than read from `ROWS` because the card has no `M` row — the fixture this
  // guard needs is a property of the SOURCE, not of the card.
  const claim = { cond: "k === 'm'", call: "arm('move')" };
  const raw = src('ui/roomzoom-view.js');
  // Half 1 (the original): the real M branch is mostly comment, and it still joins.
  assert.ok(bindHolds(raw, claim), 'the M branch, which is mostly comment, failed to join');
  // Half 2 (the one the old name promised and never delivered): that branch's comment names
  // `controls.js` and half the console key map in PROSE. Pick a token that appears there and
  // NOWHERE in its live code, and require the join to refuse it — if comments were being scanned,
  // this is exactly how the guard would start matching documentation instead of behaviour.
  const commentOnly = 'input/controls.js:225';
  assert.ok(raw.includes(commentOnly),
    'the fixture token is gone from roomzoom-view.js — re-choose it, this control just went vacuous');
  assert.equal(bindHolds(raw, { cond: "k === 'm'", call: commentOnly }), false,
    'a token that exists ONLY in the M branch\'s comment satisfied the join — comments are being scanned');
});

// ─────────────────────────────────────────────────────────────────── 4. the fiction is the wreck's

test('the fiction is the WRECK, not the pre-wreck ship', () => {
  // A RATCHET, and it says so: it cannot prove the new copy is good, only that the retired copy has
  // not walked back in. `hosts/web/Program.cs` boots `--ship wreck`; "a drifting ship, a skeleton
  // crew" described the ship before the re-premise, and "Your crew are people." led on the verb the
  // owner stood down.
  //
  // ⚠️ `the ship is airless` IS ON THIS LIST AS OF THE M1-b SEND-BACK. The rewrite that removed
  // four false sentences introduced it: the card said "Beyond the bay the ship is airless", which
  // is the CHARTER's one-compartment premise, not the shipped ship's three. Retired copy is retired
  // whether it shipped for months or for a day.
  for (const dead of ['skeleton crew', 'drifting ship', 'Your crew are people', 'the ship is airless'])
    assert.ok(!HTML.includes(dead), `the retired pre-wreck copy is back: "${dead}"`);
});

/**
 * The wreck's pressurised set, read out of the C# the ship is authored in.
 *
 * ⚠️ THIS IS A SUPPORTING JOIN, NOT THE AUTHORITY, and saying so is the honest part. The authority
 * is `WreckShipTests.ExactlyThreeSpacesBootBreathable_AndTheRestIsVacuum`, which DRIVES the sim and
 * asserts the resulting breathable set — a text scan can never do that. What this adds is the one
 * thing the C# test structurally cannot see: whether the CARD agrees with the ship. R1 was exactly
 * that gap — the ship authored three spaces, its own test asserted three, and the first screen told
 * the player there was one.
 */
function wreckPressurisedAnchors() {
  const cs = codeOnly(readFileSync(join(here, '../../sim/Sim.Gen/AuthoredShips.cs'), 'utf8'));
  const all = [...cs.matchAll(/plan\.PressurizedAnchors\.Add\(([^)]*)\);/g)].map((m) => m[1].trim());
  const wreck = ['WreckCryoAnchor', '"wreck_spine_0"', 'WreckReactorAnchor'];
  const idx = wreck.map((w) => all.indexOf(w));
  return { all, wreck, idx };
}

test('the LEDE agrees with the SHIP about where the air is (the R1 defect)', () => {
  const { all, wreck, idx } = wreckPressurisedAnchors();
  // Non-vacuity first: the scan must have found the real calls, or everything below is noise.
  assert.ok(all.length >= 5, `only ${all.length} PressurizedAnchors.Add calls found — the scan broke`);
  for (let i = 0; i < wreck.length; i++)
    assert.ok(idx[i] >= 0, `${wreck[i]} is not pressurised any more — the card's air sentence is now stale`);
  // The wreck's three are CONTIGUOUS, so a fourth added beside them trips this and forces a look at
  // the card. (Other ships' Add calls live elsewhere in the file and are deliberately not counted.)
  assert.deepEqual([...idx].sort((a, b) => a - b), [idx[0], idx[0] + 1, idx[0] + 2],
    'the wreck\'s pressurised block is no longer exactly these three contiguous anchors — ' +
    're-read it and re-write the LEDE, which promises air in the bay, the spine and the reactor');
  // …and the card names the two the player has to be told about. The bay is where they wake, so it
  // is the subject of the sentence before; these two are the claim that was wrong.
  assert.match(LEDE, /spine/i, 'the LEDE no longer names the SPINE, which boots breathable');
  assert.match(LEDE, /reactor/i, 'the LEDE no longer names the REACTOR, which boots breathable');
});

// ─────────────────────────────────────────────── 5. the thaw: the verb, the door, and the opt-in
//
// ⚠️ THIS SECTION IS AN INVERTED CONTRACT AND THAT IS THE POINT. It used to be ONE test called
// "the card does not promise a thaw — the player still cannot ask for one", which required
// `!/\bthaw/i.test(HTML)`: correct while the verb did not exist (M3-2 had a `CryoSystem` and
// nothing could start a cycle), and a LOCK on the card the moment M3-3/M3-4 built it. They landed
// 2026-08-01 and the card did not move, so the owner met the shipped game on 08-03 and reported
// *"there is still no way to defreeze others"* — of a ship where there demonstrably is. A guard
// that pins an absence has to name the event that ends it, and the old one did (in the card's
// header, not in itself). These three replace it by pinning the PRESENCE instead.

test('the LEDE says the seven can be WOKEN, and names MOSS as the place to ask', () => {
  // The owner's report was not "the thaw is broken" — the arc runs end to end. It was that nothing
  // on screen SAYS SO. So this asserts on the premise itself, not merely on the rendered card: a
  // thaw sentence hidden in a controls row would satisfy `HTML.includes('thaw')` and leave the
  // first thing a player reads exactly as mute as it was.
  assert.match(LEDE, /thaw/i, 'the LEDE states the sleepers as a FACT again, with no verb — the '
    + 'exact defect the owner reported in live play on 2026-08-03');
  assert.match(LEDE, /MOSS/, 'the LEDE promises a thaw without naming where to ask for it');
  assert.ok(HTML.includes(LEDE), 'the LEDE never reaches the rendered card');
});

test('the card names MOSS in the CONTROLS, spelled the way the UI spells the tab', () => {
  const row = ROWS.find((r) => /MOSS/.test(r.key));
  assert.ok(row, 'the controls list has no MOSS row — the thaw arc is behind a door the card never '
    + 'mentions (WORK, Click, R/F, T and nothing else was the shipped list)');
  assert.ok(HTML.includes(row.text), `the MOSS row's text never reaches the card: ${JSON.stringify(row.text)}`);
  // The KEY is the tab's own label. `OV_TABS` in overview-view.js spells it `MOSS`; a card that
  // said "CONSOLE" or "COMPUTER" would send the player looking for a button that is not there.
  assert.ok(codeOnly(src('ui/overview-view.js')).includes("['moss', 'MOSS']"),
    'the Overview no longer spells the tab MOSS — this row now names a button nobody can find');
  assert.ok(row.bind && row.bind.length, 'the MOSS row must carry a bind like every gesture row');
  // Same one-line rule as the WORK row: a wrapped cell makes BOTH cells in its grid row taller, and
  // this row is the one that pushed the grid to a third row in the first place.
  assert.ok(row.text.length <= 28,
    `the MOSS row's text is ${row.text.length} chars and will wrap the key grid — see the module header`);
});

test('the card teaches that work types boot OFF, and names CRAFT — the arc\'s own dead end', () => {
  // OD-H is binding: every work type boots OFF for every crew member, and the fix is a TEACHING
  // line, never a default change. CRAFT is the one named because commissioning the console costs a
  // ControllerModule, which is a MachineShop recipe (WorkType.Craft) — so a player who never opens
  // the WORK tab watches a correct, affordable, reachable order sit there forever.
  const order = VERBS.find((v) => /ORDER/.test(v.head));
  assert.ok(order, 'the ORDER headline block is gone');
  assert.match(order.body, /work type/i, 'the ORDER block no longer says work types boot OFF');
  assert.match(order.body, /OFF/, 'the ORDER block no longer says what they boot to');
  assert.match(order.body, /CRAFT/, 'the ORDER block no longer names CRAFT');
  assert.match(order.body, /WORK/, 'the ORDER block names CRAFT without naming the tab that has it');
  assert.ok(HTML.includes('CRAFT'), 'the rendered card never says CRAFT');
});

/** The `HELP_LINES` array literal out of the MOSS model, comment-stripped. */
function mossHelpBlock() {
  const code = codeOnly(src('ui/moss-model.js'));
  const i = code.indexOf('const HELP_LINES = [');
  return i < 0 ? '' : code.slice(i, code.indexOf('];', i));
}

test('the card hands over HELP, and MOSS HELP really lists the rest of the thaw chain', () => {
  // ⚠️ THE CARD DELIBERATELY DOES NOT SPELL repair → commission → pods → thaw; it says "type HELP"
  // and lets MOSS teach its own verbs. That trade is only honest if HELP actually carries them, so
  // the promise is joined to the list it delegates to. Without this, the card's shortest sentence
  // would be its least checked one.
  const block = mossHelpBlock();
  assert.ok(block.length > 200, 'HELP_LINES was not found in ui/moss-model.js — this join is vacuous');
  assert.ok(block.includes("'HELP  "), 'the extracted block is not the help list (no HELP row)');
  // ⭐ DOORS joined this list with the `doors` directory verb, and it belongs here rather than beside
  // it: the fabrication chain the commission's ControllerModule comes from sits behind two named
  // doors on the shipping wreck, so a player who cannot learn a door name never reaches COMMISSION
  // at all. It is the FIRST rung of the chain this card delegates to HELP.
  for (const verb of ['DOORS', 'COMMISSION', 'PODS', 'THAW'])
    assert.ok(block.includes(verb),
      `MOSS HELP no longer lists ${verb}, and the card sends the player there to find it`);
  // INCLUSION: the matcher must be able to say no, or the three lines above prove nothing.
  assert.equal(block.includes('DEFROST'), false,
    'a verb MOSS has never had was found in HELP_LINES — the extraction is not what it claims');
});

/**
 * The wreck's capsule census, read out of the C# the ship is authored in — the LEDE's "Seven".
 *
 * Same shape and the same caveat as `wreckPressurisedAnchors` above: a SUPPORTING join, not the
 * authority. What it adds is the thing no C# test can see — whether the CARD agrees with the ship.
 */
test('the LEDE\'s SEVEN is the wreck\'s own pod table (twelve, one open, four dead)', () => {
  const cs = codeOnly(readFileSync(join(here, '../../sim/Sim.Gen/AuthoredShips.cs'), 'utf8'));
  const i = cs.indexOf('WreckPods =');
  const table = cs.slice(i, cs.indexOf('};', i));
  const pods = (table.match(/new PodSpec/g) || []).length;
  const open = (table.match(/Open = true/g) || []).length;
  const dead = (table.match(/Dead = true/g) || []).length;
  assert.ok(pods >= 8, `only ${pods} PodSpec rows found — the scan broke and everything below is noise`);
  assert.equal(pods - open - dead, 7,
    `the wreck now has ${pods - open - dead} sleepers (${pods} pods, ${open} open, ${dead} dead) and the `
    + 'LEDE still says seven — re-read the ship and re-write it');
  assert.match(LEDE, /\bSeven\b/, 'the LEDE no longer names the count this test exists to check');
});
