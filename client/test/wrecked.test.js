// The WRECKED item set — 80 post-raid twins (client/src/items/wrecked.js), every one of them drawn
// by re-running its own PRISTINE painter and adding ink damage on the same frame.
//
// WHAT THIS FILE IS FOR, in one sentence: to make it impossible for the twin registry to drift from
// the pristine registry, or for a twin to draw another row's object, silently.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE MOCK BIJECTION IS GONE — lane/warm-purge, 2026-08-06, on the owner's ruling. READ THIS
// BEFORE CONCLUDING THAT COVERAGE WAS DROPPED, because the argument is the package.
//
// FOUR TESTS AND TWO SPEC READERS WERE DELETED FROM THIS FILE. They joined the twin registry to
// `docs/design/perilune-item-set.dc.html`'s own `brokenD` array:
//
//   1. `the spec really carries 70 wrecked pieces and 70 pristine labels` — the readers' non-vacuity.
//   2. `every twin label and condition badge matches the mock, row for row` — the BIJECTION: every
//      one of `MOCK_TWIN_IDS` claimed a distinct mock piece by `mockLabel`, its `state` badge equalled
//      that piece's, and all 70 mock pieces were claimed exactly once.
//   3. `62 twins reuse the pristine label verbatim; the 8 resources are renamed` — the POSITIONAL
//      walk, `mockPristineLabels()[i]` against `MOCK_IDS[i]`.
//   4. `the 8 renames: seven keep the stem, CONTROLLER MODULE does not`.
//   …plus `assert.equal(MOCK_TWIN_IDS.length, 70)` inside the ledger test.
//
// ⭐ THE SUBJECT OF ALL FOUR WAS TRANSCRIPTION. `wrecked.js`'s header stated it: seventy twins were
// transcribed BY HAND from a document, labels collide across its sections, and *"any code that tried
// to derive one label from the other by string surgery would be right 69 times and wrong once,
// silently"*. The walk was the evidence that a hand transcription of seventy drawings landed on the
// right rows.
//
// ⇒ AFTER THIS PACKAGE NO TWIN IS A TRANSCRIPTION OF ANYTHING. All eighty re-run their own pristine
// painter (`paintFitting` / `paintMachine` / `paintPaperFixture` / `paintResource` / `paintMaterial`)
// and add ink damage. There is no second document for a label to disagree with, so `mockLabel` has no
// referent, `MOCK_TWIN_IDS` is EMPTY, and a bijection over an empty set is a guard kept green forever
// — the fifth trap shape. ⛔ THE TWO WRONG EXITS, NAMED SO THEY ARE VISIBLY REFUSED:
//   • Keeping the walk over a shrinking population. It would still pass, over fewer and fewer rows,
//     while saying nothing about the eighty that ship — the failure mode `NON_MOCK_TWIN`'s own header
//     warned about ("a repo-authored twin left inside it does not merely fail; it destroys the
//     evidence").
//   • Deleting the four and putting nothing in their place. The guard CLASS (a twin that draws the
//     wrong row's object) is real and survives the redraw even though transcription does not.
//
// ⇒ WHAT REPLACES THEM, and why nothing is weaker on the question that survives — *"does this twin
// draw ITS OWN row's object?"* — which now has a MECHANICAL answer the label walk never had:
//
//   (i)   THE PAINTER NAMES ITS ROW — `WRECKED[id].paint.name === camelCase(id)`. Already present,
//         kept unchanged, with its pristine-registry non-vacuity floor. Catches a SWAP of two rows'
//         `paint:` fields.
//   (ii)  ⭐ THE TWIN IS ITS PRISTINE PIECE PLUS DAMAGE — new, and TOTAL. A twin's emitted element
//         list must BEGIN with its pristine piece's, in order. This is what the bijection was really
//         standing in for and it is strictly stronger: a painter that is correctly NAMED but calls
//         `paintFitting(s, '<another row>')` passes (i), passes every census in this file, and fails
//         (ii) BY NAME. That is the transcription-class error in its surviving form — the wrong
//         drawing under the right label — and it is driven as a control below.
//   (iii) THE DAMAGE LANDS ON THAT DRAWING — `offPieceAnchors`, lifted out of
//         `paper-resources.test.js` (where it watched 8 rows) into `client/test/sketch-geom.js` and
//         applied to all 80, with `inkArea` (the containment ring) the one mark-KIND exception.
//   (iv)  THE PROVENANCE LEDGER IS TOTAL. `NON_MOCK_TWIN` (47 of 117 rows, an EXCEPTION list) became
//         `TWIN_SOURCE` (80 of 80, a total function). Where the old ledger could hide a row by ADDING
//         it, the new one cannot: adding a row to a total map changes nothing, and OMITTING one fails.
//
// `docs/design/perilune-item-set.dc.html` STAYS IN THE REPO AS HISTORY — it is where the wreck premise
// ("each keeps one identifying feature so it still reads as the same object") is stated, and that
// premise is now ENFORCED by (ii) rather than quoted. THIS FILE NO LONGER OPENS IT.
// ═════════════════════════════════════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ITEMS, ITEM_IDS, buildItem, placeholderItem } from '../src/items/index.js';
import { GLYPH_SUBSTITUTE } from '../src/items/glyph-map.js';
import {
  WRECKED,
  WRECKED_IDS,
  WRECKED_PREFIX,
  buildWrecked,
  wreckedItemId,
  pristineItemId,
  isWreckedItemId,
  wreckedState,
  wreckedInfo,
  itemsWithoutWreckedTwin,
  orphanWreckedTwins,
  NO_WRECKED_TWIN,
  TWIN_SOURCE,
} from '../src/items/wrecked.js';
import { FITTING_IDS } from '../src/items/fittings.js';
import { PAPER_RESOURCE_IDS } from '../src/items/paper-resources.js';
// — lane/paper-fixtures —
import { FIXTURE_IDS } from '../src/items/paper-fixtures.js';
// — lane/paper-machines —
import { MACHINE_IDS } from '../src/items/machines.js';
// — lane/warm-purge —
import { MATERIAL_IDS } from '../src/items/paper-materials.js';
import { codeOnly } from './code-only.js';
import {
  damageMarks, offPieceAnchors, damageAnchors, isContainmentRing, DMG_TOL,
} from './sketch-geom.js';
/** Every row that must have a twin, in registry order — the population `WRECKED_IDS` must equal. */
const TWINNED_IDS = ITEM_IDS.filter((id) => !(id in NO_WRECKED_TWIN));

const HERE = dirname(fileURLToPath(import.meta.url));
const WRECKED_SRC = readFileSync(join(HERE, '..', 'src', 'items', 'wrecked.js'), 'utf8');

// ⛔ `SPEC`, `mockWreckedRows()` AND `mockPristineLabels()` STOOD HERE AND ARE GONE (2026-08-06).
// They read `docs/design/perilune-item-set.dc.html` — the first out of a `brokenD` array inside a
// `<script type="text/x-dc">` block, the second out of the static `class="lbl"` markup — and both
// carried non-vacuity floors, because "found nothing" and "matched nothing" are the same string
// there. Nothing in this file joins that document any more; the header says why the question they
// answered no longer exists. The document itself stays in the repo as HISTORY.
/** All gradient/pattern ids defined and referenced anywhere in an SVG fragment. */
function idsIn(svg) {
  return {
    defIds: [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
    refIds: [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]),
  };
}

// ── the census — RE-COUNTED, never computed ──────────────────────────────────────────────────

// ⚠️ RE-COUNT, NEVER COMPUTE. A prior review in this repo published a wrong sum for a sibling
// census and it stayed green through BOTH wrong versions, because the assertion was a single
// number. This one is a per-class OBJECT so a class that moves names itself.
//
// ⚠️ 117 → 80 AND 46/43/12/16 → 30/30/12/8, RE-DERIVED OFF THE SHIPPED TREE with `node -e` over the
// real export (lane/warm-purge, 2026-08-06). ⛔ NOT ARITHMETIC ON THE OLD FIGURES, and the two would
// not have agreed: thirty-eight registry rows were retired and only THIRTY-SEVEN of them had a twin
// (`swarf` was in `NO_WRECKED_TWIN`), so the registry moved by 38 and the twin set by 37 while
// `NO_WRECKED_TWIN` moved by 1 — three different deltas from one commit, which is exactly the shape
// a single subtraction gets wrong (TRAPS 8th).
//   FUNCTIONAL 46 → 30, COSMETIC 43 → 30, MATERIAL 12 → 12, RESOURCE 16 → 8.
// ⭐ MATERIAL IS THE ONE THAT DID NOT MOVE, AND IT IS THE TELL FOR THIS PACKAGE'S SHAPE: the twelve
// wall/floor skins were RE-AUTHORED (warm mock transcription → paper twins re-running `paintMaterial`)
// and not added or removed, so the class census cannot see the largest single art change in the
// commit. `sketch-adoption.test.js`'s treated-twin count is where that one shows up (47 → 80).
test('the class census of the twin set: 30 functional, 30 cosmetic, 12 material, 8 resource', () => {
  // ⚠️ MOVED ABOVE THE LOOP DELIBERATELY (CLAUDE.md trap 5). It used to sit AFTER the `deepEqual`
  // below, where it could never fire on its own: the four class counts sum to the total and every id
  // contributes exactly one, so a short twin set fails the `deepEqual` first and `assert` throws. A
  // leg that cannot report is indistinguishable from one that can.
  assert.equal(WRECKED_IDS.length, 80);
  const by = { functional: 0, cosmetic: 0, material: 0, resource: 0 };
  for (const id of WRECKED_IDS) {
    // ⚠️ NOT `by[ITEMS[id].kind]++`. An orphan twin (a key with no registry row) made that throw a
    // bare TypeError, which the mutation harness correctly refuses to score as a semantic RED
    // (CLAUDE.md trap 3). A guard that crashes instead of reporting has told you nothing.
    assert.ok(ITEMS[id], `${id} is a twin with no registry row behind it`);
    by[ITEMS[id].kind] += 1;
  }
  assert.deepEqual(by, { functional: 30, cosmetic: 30, material: 12, resource: 8 });
  // ⛔ AND THE GAP TO THE REGISTRY, STATED RATHER THAN LEFT TO ARITHMETIC: `ITEM_IDS` is 82 and this
  // is 80, and the two missing rows are exactly `NO_WRECKED_TWIN`'s — `cell-spent` (functional) and
  // `turnings` (resource), which is why FUNCTIONAL and RESOURCE are each one short of the registry's
  // and COSMETIC and MATERIAL match it exactly.
  assert.equal(ITEM_IDS.length - WRECKED_IDS.length, Object.keys(NO_WRECKED_TWIN).length);
});

test('the state census: 72 pieces carry a percentage, 8 carry the em-dash', () => {
  // ⚠️ 101/16 → 72/8, RE-DERIVED OFF THE SHIPPED TREE (lane/warm-purge, 2026-08-06). ⭐ BOTH SIDES
  // MOVED, WHICH NO PREVIOUS PACKAGE MANAGED, and the reason is the tell for a RETIREMENT rather
  // than an addition: every package before this one added rows to one side and left the other still,
  // so the census could always name which half a lane touched. Here twenty-nine percentage badges
  // and eight em-dashes went out of the table together, because the warm ROWS went — the badges did
  // not change meaning, they stopped existing.
  // ⚠️ THE HISTORY IS KEPT because the chain is how the next reader checks a number rather than
  // trusting it: 62 → 71 (VR-P2's nine fittings) → 74 (the capsules) → 85 (paper-fixtures) → 88+16
  // (paper-resources moved the DASH side alone, 8 → 16) → 101/16 (paper-machines) → 72/8 here.
  const pct = WRECKED_IDS.filter((id) => /^\d+%$/.test(WRECKED[id].state));
  const dash = WRECKED_IDS.filter((id) => WRECKED[id].state === '—');
  assert.equal(pct.length, 72);
  assert.equal(dash.length, 8);
  assert.equal(pct.length + dash.length, WRECKED_IDS.length, 'no third state exists');
  // the em-dash ones are exactly the loose resources: you cannot repair a spoiled pile
  assert.deepEqual(dash.sort(), [
    'body-bag', 'control-card', 'gear-set', 'ice-block', 'plate-offcut', 'seal-set', 'spoil-heap',
    'tuber-crate',
  ]);
  // ⚠️ AUDITED AND KEPT — this leg is NOT implied by the `deepEqual` above, though it looks it. The
  // `deepEqual` pins WHICH eight ids carry the em-dash; this reads `ITEMS`, a different module, and
  // fires if `index.js` ever re-classifies one of them (a `resource` demoted to `material` would
  // leave the eight ids and their badges untouched). Its two siblings in this file were audited the
  // same way and one was moved rather than kept — see the census above.
  for (const id of dash) assert.equal(ITEMS[id].kind, 'resource', `${id} carries — but is not a resource`);
});

// ── the join ─────────────────────────────────────────────────────────────────────────────────

// ⚠️ THIS IS A LIST EQUALITY, NOT A COUNT EQUALITY, AND THAT IS DELIBERATE (CLAUDE.md trap 7).
// A suite of ratio/count assertions cannot see a substitution: swapping one twin for another leaves
// `WRECKED_IDS.length === ITEM_IDS.length` perfectly true. `deepEqual` on the ORDERED id lists is
// the only form that regresses on a rename, a reorder, a swap, an omission AND an extra.
test('every registry row has exactly one wrecked twin, and no twin is an orphan', () => {
  // ⚠️ AGAINST `TWINNED_IDS` — every registry row that is supposed to have a twin has one, in
  // registry ORDER. (It used to say "NOT `MOCK_IDS`", which was the narrower population the spec
  // joins ran over; that population no longer exists and the distinction went with it.)
  assert.deepEqual(WRECKED_IDS, TWINNED_IDS, 'the twin key set is exactly the twinned rows, in order');
  assert.deepEqual(orphanWreckedTwins(), [], 'twins with no registry row');
});

// ⭐ (iv) THE PROVENANCE LEDGER IS TOTAL — one entry per twin, and that is a change of KIND rather
// than of contents. `NON_MOCK_TWIN` was an EXCEPTION list (47 of 117 rows) and its own header warned
// what that costs: *"a repo-authored twin left inside [the bijection] does not merely fail; it
// destroys the evidence."* ⇒ A row could be HIDDEN BY ADDING IT — moved into the exception list, the
// bijection stayed green over a smaller population and the mock piece it used to claim went
// unchecked. A total map cannot be gamed that way: adding a row to it changes nothing at all, and
// OMITTING one fails by name.
//
// ⛔ AND THE REASON THE OLD LEDGER HAD TO GO IS A MEASUREMENT, NOT A PREFERENCE. `NON_MOCK_TWIN`
// conflated two different questions — *where did this drawing come from* and *does this row join the
// mock bijection* — and the twelve MATERIALS made both answers true at once: they genuinely ARE rows
// in the mock's `brokenD` array AND their twins are now repo-authored paper. Ledgering them reddened
// three legs that no edit could satisfy together. Separating the questions is what this map does; the
// second question then had no population left and was retired (see the file header).
test('the provenance ledger is TOTAL over the twin set, and every row names a real source', () => {
  // ⇒ BOTH DIRECTIONS, AS SET EQUALITY. An omitted row fails (the ledger is not total any more) and
  // a stale row fails (a twin was retired and its line was left behind). Sorted, because the two
  // sides are ordered by unrelated accidents — `ITEM_IDS` order on one, object insertion order on
  // the other — so an unsorted compare would go red for a difference that means nothing.
  assert.deepEqual(Object.keys(TWIN_SOURCE).sort(), [...WRECKED_IDS].sort(),
    'TWIN_SOURCE is no longer one entry per twin. It is a TOTAL map: every twin names the document\n'
    + 'or module its drawing came from, and there is no exception arm to fall through.');
  assert.equal(Object.keys(TWIN_SOURCE).length, 80);

  // ⭐ AND THE ONE THAT IS NOT LIKE THE OTHER SEVENTY-NINE, PINNED BY NAME. Every other value names
  // the source of the row's OWN pristine piece; `cell-sound`'s is card 34, because its twin is not
  // ink damage over card 33 — it is the owner's own drawing of a spent cell. If that ever silently
  // becomes '33 CELL, SOUND' the twin has been redrawn as a damage pass and the design's spent cell
  // has gone unreachable, which no count in this file could see.
  assert.equal(TWIN_SOURCE['cell-sound'], '34 CELL, SPENT');

  // ⚠️ FIVE POPULATIONS, FIVE SHAPES, AND EACH ROW IS HELD TO THE SHAPE ITS OWN SOURCE IMPLIES.
  // ⛔ THE EXIT NOT TAKEN is a pattern loose enough for all five, which would stop the guard seeing a
  // fittings row with a made-up card reference. Each id is routed to its own shape, and an id in
  // NONE of the five populations fails BY NAME rather than falling through to a looser branch
  // (CLAUDE.md trap 4 — the membership test is an INCLUSION, not a disjunction of convenience).
  //   `NN NAME`            a card in `design-import/Perilune Fittings.dc.html` — a page to turn to
  //   `MNN NAME`           a sheet entry in `client/tools/machines-sheet.mjs`; the `M` is not cosmetic
  //   `PAPER FIXTURES · X` a SECTION of `client/src/items/paper-fixtures.js` — there is no card
  //   `PAPER RESOURCE · X` a piece in `client/src/items/paper-resources.js` — there is no card
  //   `PAPER MATERIAL · X` a skin in `client/src/items/paper-materials.js` — there is no card
  const shapeOf = (id) => (FITTING_IDS.includes(id) ? /^\d\d [A-Z]/
    : PAPER_RESOURCE_IDS.includes(id) ? /^PAPER RESOURCE · [A-Z]/
      : FIXTURE_IDS.includes(id) ? /^PAPER FIXTURES · [A-Z]/
        : MACHINE_IDS.includes(id) ? /^M\d\d [A-Z]/
          : MATERIAL_IDS.includes(id) ? /^PAPER MATERIAL · [A-Z]/ : null);
  for (const [id, source] of Object.entries(TWIN_SOURCE)) {
    assert.ok(ITEMS[id], `${id} is ledgered but is not a registry row`);
    const shape = shapeOf(id);
    assert.ok(shape,
      `${id} names a source but is none of a fittings row, a paper ground stack, a paper fixture,\n`
      + 'a machine or a material. Every twin has to say where its drawing came from, and this one\n'
      + 'is in no population whose citation shape this guard knows.');
    assert.match(source, shape, `${id}: the source reference is not in its population's shape`);
  }

  // …and the DISJOINTNESS the chain above leans on, MEASURED — because a comment claiming a set
  // relation is exactly the kind of prose that goes stale silently. Every pair, not just one.
  const POPS = [['fittings', FITTING_IDS], ['machines', MACHINE_IDS], ['fixtures', FIXTURE_IDS],
    ['resources', PAPER_RESOURCE_IDS], ['materials', MATERIAL_IDS]];
  for (let i = 0; i < POPS.length; i += 1) {
    for (let j = i + 1; j < POPS.length; j += 1) {
      assert.deepEqual(POPS[i][1].filter((id) => POPS[j][1].includes(id)), [],
        `an id is in BOTH ${POPS[i][0]} and ${POPS[j][0]}. The chain above then reads "is neither"\n`
        + 'for a row that is BOTH, and two modules are exporting one piece under one name.');
    }
  }

  // ⭐⭐ AND THE INVARIANT THE PURGE CREATED, WORTH PINNING BECAUSE IT IS NEW AND FRAGILE: the
  // registry is now EXACTLY the union of the five paper catalogues — 82 = 34 + 13 + 14 + 9 + 12,
  // with nothing outside it. Before 2026-08-06 thirty-eight rows sat outside every catalogue,
  // drawing warm art nothing reached; a thirty-ninth arriving tomorrow is the shape this pins.
  const union = new Set([...FITTING_IDS, ...MACHINE_IDS, ...FIXTURE_IDS, ...PAPER_RESOURCE_IDS,
    ...MATERIAL_IDS]);
  assert.deepEqual(ITEM_IDS.filter((id) => !union.has(id)), [],
    'a registry row is drawn by NONE of the five paper catalogues. Since the warm purge every piece\n'
    + 'in the game is paper; a row outside all five is either warm art returning or a sixth\n'
    + 'catalogue nobody declared.');
  assert.equal(union.size, ITEM_IDS.length, 'a catalogue exports an id the registry does not carry');
});

// ⚠️ THE LEDGER IS THE ONLY WAY A ROW MAY HAVE NO TWIN, AND IT IS PINNED BOTH WAYS. `deepEqual` of
// the two ORDERED lists — not a count, and not a subset check — so an unledgered omission fails
// (a row silently missing its twin) AND a stale ledger entry fails (a row that has since been given
// one). The size is pinned separately below because a swap of one omission for another leaves both
// lists the same length.
test('the ledger is exactly the rows with no twin, and its reasons are real prose', () => {
  // ⚠️ SORTED, DELIBERATELY, AND THAT IS THE OPPOSITE CALL FROM `WRECKED_IDS` vs `TWINNED_IDS`
  // ABOVE. There the ORDER carries meaning — it is the registry's own — so the comparison is
  // unsorted on purpose. Here the two sides are ordered by unrelated accidents (`ITEM_IDS` order,
  // object INSERTION order on the right), so an unsorted `deepEqual` is inert at one entry and can
  // go red spuriously at two, for a difference that means nothing. What is being asserted is SET
  // equality both ways: no unledgered omission, no stale ledger entry.
  assert.deepEqual([...itemsWithoutWreckedTwin()].sort(), Object.keys(NO_WRECKED_TWIN).sort(),
    'a registry row has no wrecked twin and no NO_WRECKED_TWIN entry (or the ledger names a row\n'
    + 'that has one). A missing twin is a decision — write it in the ledger with its reason.');
  // NON-VACUITY: the ledger must not be trivially satisfiable by an empty reason.
  for (const [id, why] of Object.entries(NO_WRECKED_TWIN)) {
    assert.ok(ITEMS[id], `${id} is ledgered but is not a registry row at all`);
    assert.ok(typeof why === 'string' && why.length > 80, `${id}: the ledger entry has no reason`);
  }
  // ⛔ THIS LITERAL AUTO-MERGED CLEAN AND WRONG ONCE, and the scar is kept: two lanes moved it
  // 1 → 2 for DIFFERENT ids — `cell-spent` on one side, `turnings` on the other — so git took one
  // "2" and neither conflict marker nor either lane's own green gate could see that the merged truth
  // was THREE (CLAUDE.md's 8th trap shape, stated as a number).
  // ⚠️ 3 → 2 ON 2026-08-06, AND IT IS THE ONE DIRECTION THE MESSAGE BELOW USED TO CALL AN ERROR.
  // The entry that left is `swarf`, and it left because its REGISTRY ROW was retired with the rest of
  // the warm set — not because a twin was drawn for it. That is exactly what `turnings`' own ledger
  // entry predicted in writing ("the moment `swarf` retires so does its line above"), so the shrink
  // is an argued one. RE-DERIVED off the shipped ledger, not subtracted from the old figure.
  assert.equal(Object.keys(NO_WRECKED_TWIN).length, 2,
    'THE NO-TWIN LEDGER CHANGED SIZE. Growing it means another piece was drawn whose wrecked state\n'
    + 'names nothing the sim can reach; SHRINKING it means either a twin was added (in which case\n'
    + 'add the twin rather than deleting the reason) or the ROW itself was retired, which is what\n'
    + 'happened to `swarf` on 2026-08-06 and is the only shrink this guard should ever accept\n'
    + 'without a twin appearing.');
  // ⚠️ AND THE TWO ENTRIES ARE NOT THE SAME KIND OF ROW, WHICH THE COUNT CANNOT SAY. `turnings` is a
  // RESOURCE row (a nest of cuttings has no second condition); `cell-spent` is a FUNCTIONAL row the
  // design DOES ship a card for, ledgered because the state it draws is terminal. Pinned by name so
  // a substitution — one ledgered omission traded for another — cannot pass as "still two".
  assert.deepEqual(Object.keys(NO_WRECKED_TWIN).sort(), ['cell-spent', 'turnings']);
  assert.equal(ITEMS.turnings.kind, 'resource',
    'the resource half of the ledger is no longer the ground stack it was written about');
  assert.equal(ITEMS['cell-spent'].kind, 'functional',
    'the second ledger entry is no longer the Battery row it was written about');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ (ii) AND (iii) — THE TWO GUARDS THAT REPLACE THE MOCK BIJECTION, OVER ALL 80 TWINS
//
// Both existed before this package and both watched EIGHT rows: they are `paper-resources.test.js`'s
// `damageMarks` and `offPieceAnchors`, written for the nine paper ground stacks. lane/warm-purge
// lifted them into `client/test/sketch-geom.js` unchanged and pointed them at the whole twin set —
// which is the half of the restructure that ADDS coverage. Seventy-two twins had neither guard.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The box every geometric leg below measures in. 240 is `paper-resources.test.js`'s, unchanged. */
const PROBE = { w: 240, h: 240, idPrefix: 'z', sketch: false };

/**
 * ⛔ THE ONE ROW WHOSE TWIN IS NOT ITS PRISTINE PIECE PLUS DAMAGE, BY NAME AND WITH ITS REASON.
 *
 * `cell-sound`'s twin is catalogue 34, CELL SPENT — a drawing the OWNER made of exactly that state.
 * Every other twin re-runs its pristine painter because "the same object, damaged" has no other
 * author; here it has one, and inventing a second set of ink marks over the sound cell would put a
 * repo-authored wreck on screen while the design's own went unreachable (`wrecked.js`'s row says so
 * too). ⇒ THE EXCEPTION IS BY ID, NOT BY A PREDICATE, so a second one has to be argued in a commit
 * rather than fall through a branch — and the guard below REQUIRES it to really diverge, so the day
 * someone redraws it as a damage pass this list goes red instead of quietly covering nothing.
 */
const NOT_A_DAMAGE_PASS = ['cell-sound'];

test('⭐⭐ (ii) every twin IS its pristine piece PLUS damage — the prefix rule, over all 80', () => {
  const broken = [];
  let marksSeen = 0;
  for (const id of WRECKED_IDS) {
    if (NOT_A_DAMAGE_PASS.includes(id)) continue;
    const marks = damageMarks(id, buildItem(id, PROBE), buildWrecked(id, PROBE), (i, n) => {
      broken.push(`${id}: the twin diverges from its pristine piece at element ${i} of ${n}`);
    });
    marksSeen += marks.length;
  }
  assert.deepEqual(broken, [],
    'A TWIN IS NOT ITS OWN PRISTINE DRAWING PLUS DAMAGE:\n  ' + broken.join('\n  ') + '\n'
    + 'This is the guard that replaced the mock label bijection, and it is the SAME class of defect:\n'
    + 'the wrong drawing under the right label. A painter whose NAME is correct but whose body calls\n'
    + 'another row\'s painter — `paintFitting(s, \'chair\')` inside `locker` — passes the painter-name\n'
    + 'guard, passes every census in this file, and fails here. Re-run your own pristine painter and\n'
    + 'ADD damage; never redraw the piece.');
  // ⛔ NON-VACUITY AS AN INCLUSION FLOOR, not a population count: a splitter that silently returned
  // [] for every row would satisfy the line above perfectly.
  assert.ok(marksSeen >= 250, `only ${marksSeen} damage marks split out — the splitter found nothing`);

  // ⭐ AND THE EXCEPTION MUST EARN ITS PLACE. A named exception that no longer applies is a hole
  // somebody can walk a real defect through; this requires `cell-sound` to REALLY diverge, so the
  // list cannot outlive its reason.
  for (const id of NOT_A_DAMAGE_PASS) {
    let diverged = false;
    damageMarks(id, buildItem(id, PROBE), buildWrecked(id, PROBE), () => { diverged = true; });
    assert.ok(diverged,
      `${id} is exempted from the prefix rule but now PASSES it — its twin has become an ordinary\n`
      + 'damage pass over its own pristine piece. Delete the exemption; do not leave it green.');
  }
});

/**
 * ⛔ THE OFF-PIECE LEDGER — ten twins whose damage lands more than `DMG_TOL` from any ink their own
 * pristine piece draws, at the 240 probe box. RE-MEASURED HERE, not inherited: every value is the
 * smallest tolerance at which that row goes clean, bisected off the shipped tree on 2026-08-06.
 *
 * ⚠️ ALL TEN ARE PRE-EXISTING, AND SAYING SO IS THE POINT RATHER THAN AN EXCUSE. The guard is new to
 * these rows — it watched the eight paper ground stacks and nothing else until this commit — so what
 * it found on its first run over the other seventy-two is what those lanes shipped: five fittings
 * twins (VR-P2), three paper-fixture twins and five machine twins, authored in absolute centimetres
 * against geometry that later polish passes moved. NONE of the twenty-one twins lane/warm-purge
 * itself re-authored is in this list, and none of the twelve materials is (they carry their own,
 * tighter, normalised-coordinate leg in `paper-materials.test.js`).
 *
 * ⛔ AND THE TOLERANCE IS NOT RAISED TO SWALLOW THEM, WHICH WAS THE OBVIOUS WRONG FIX, REFUSED WITH A
 * MEASUREMENT: the defect this guard is NAMED for — `seal-set`'s pre-2026-08-06 tear, hanging in
 * clean paper inside its own box — is caught only up to a tolerance of 11, and the worst row here
 * needs 13.7. A single loosened tolerance would therefore have bought these ten rows by making the
 * guard blind to its own subject (TRAPS 9th shape: an instrument narrowed goes blind). So the
 * tolerance stays where it was measured and the residual is a LEDGER: named, bounded per row, and
 * required to still be true.
 */
const OFF_PIECE_RESIDUAL = Object.freeze({
  'deck-hatch': 13.7,
  'ring-array': 9.4,
  'plant-pot': 8.7,
  'door-airlock': 7.1,
  stool: 6.3,
  'vice-post': 6,
  'dish-mast': 5.8,
  'sleeper-pod': 5.5,
  'bottle-rack': 5.4,
  'conduit-run': 4.8,
});

test('⭐⭐ (iii) every twin\'s damage lands ON the piece it damages, not merely inside its box', () => {
  const bad = [];
  let marksSeen = 0;
  let anchorsSeen = 0;
  for (const id of WRECKED_IDS) {
    if (NOT_A_DAMAGE_PASS.includes(id)) continue;
    const pristine = buildItem(id, PROBE);
    // ⛔ THE ONE MARK-KIND EXCEPTION, AND IT IS BY KIND RATHER THAN BY PIECE, which is what keeps it
    // from becoming a place to hide a defect. `inkArea` is the dashed containment ring and its whole
    // meaning is THE DECK AROUND THE OBJECT (`spoil-heap`'s "the deck around it, marked off",
    // `ice-block`'s meltwater spreading). A containment ring that landed ON the piece would be the
    // wrong drawing. Every OTHER mark — crack, tear, wire, hole, scorch, slit — damages the object.
    const marks = damageMarks(id, pristine, buildWrecked(id, PROBE)).filter((m) => !isContainmentRing(m));
    marksSeen += marks.length;
    anchorsSeen += marks.flatMap(damageAnchors).length;
    const off = offPieceAnchors(pristine, marks);
    const bound = OFF_PIECE_RESIDUAL[id];
    if (bound === undefined) {
      if (off.length) {
        bad.push(`${id}: ${off.length} anchor(s) off the drawing — `
          + off.slice(0, 2).map((q) => `(${q[0].toFixed(1)}, ${q[1].toFixed(1)})`).join(' '));
      }
    } else {
      // A LEDGERED ROW IS HELD TO ITS OWN RECORDED BOUND, so it cannot silently get WORSE…
      assert.deepEqual(offPieceAnchors(pristine, marks, bound), [],
        `${id} is in OFF_PIECE_RESIDUAL at ${bound}, and it now needs MORE than that. A ledgered\n`
        + 'residual is a ceiling, not a licence: re-anchor the mark, or measure the new number and\n'
        + 'say in the commit why the drawing moved further from its own piece.');
      // …and it must STILL VIOLATE at the real tolerance, or the ledger entry is a hole (TRAPS 4th:
      // a guard whose exception list outlives its subject cannot catch its own subject any more).
      assert.ok(off.length,
        `${id} is ledgered as an off-piece residual but is now CLEAN at DMG_TOL. Someone fixed it —\n`
        + 'delete the ledger line in the same commit rather than leaving a hole open.');
    }
  }
  assert.deepEqual(bad, [],
    'A TWIN MARKS PAPER THE PRISTINE PIECE DOES NOT OCCUPY:\n  ' + bad.join('\n  ') + '\n'
    + 'The damage is authored in absolute centimetres against the pristine geometry, so a redraw of\n'
    + 'the piece silently strands it. Re-anchor the mark onto the feature it damages — do NOT widen\n'
    + 'DMG_TOL, which is the one edit that makes this guard stop meaning anything, and do NOT add a\n'
    + 'row to OFF_PIECE_RESIDUAL for art written after 2026-08-06.');
  // ⛔ NON-VACUITY, AS INCLUSION FLOORS. A probe that found no marks and a set with no defects read
  // identically green, and the mark-splitter is exactly the part that could silently return [].
  assert.ok(marksSeen >= 250, `only ${marksSeen} damage marks inspected — the splitter found nothing`);
  assert.ok(anchorsSeen >= 800, `only ${anchorsSeen} anchors inspected — the probe is reading nothing`);
  assert.ok(DMG_TOL === 4, 'DMG_TOL moved. It is the shared constant this leg and paper-resources\n'
    + 'both measure at; changing it silently re-tunes a guard in another file.');
});

test('(iii) the anchoring guard FAILS on a mark moved off its piece — driven, both directions', () => {
  // ⭐ THE CONTROL IS BUILT FROM THE PIECE'S OWN GEOMETRY, not from hand-typed pixels: take a real
  // mark off a real twin and TRANSLATE it into the clean paper beside the object. A guard that could
  // not see that is a guard that cannot see its own subject.
  const id = 'dining-table';
  const pristine = buildItem(id, PROBE);
  const marks = damageMarks(id, pristine, buildWrecked(id, PROBE)).filter((m) => !isContainmentRing(m));
  assert.ok(marks.length >= 3, 'the fixture twin lost its damage — this control is about nothing');
  // (a) AS SHIPPED: on the piece.
  assert.deepEqual(offPieceAnchors(pristine, marks), [],
    'the shipped dining-table twin already has an off-piece anchor — fix that before reading (b)');
  // (b) THE SAME MARK, SHIFTED 60 px INTO THE CORNER OF THE BOX. Still inside the 240 box, so the
  // box rule that this guard exists to strengthen says nothing about it — which is the whole point.
  const shifted = marks[0].replace(/d="([^"]+)"/, (_, d) => 'd="' + d.replace(/(-?[\d.]+) (-?[\d.]+)/g,
    (__, x, y) => `${(+x - 60).toFixed(2)} ${(+y - 60).toFixed(2)}`) + '"');
  assert.notEqual(shifted, marks[0], 'the fixture did not actually move — the rewrite matched nothing');
  assert.ok(offPieceAnchors(pristine, [shifted]).length >= 1,
    'the guard PASSES a damage mark translated 60 px into clean paper. It cannot see its own subject.');
  // …and the leg that would hide it: every anchor of the shifted mark is still INSIDE the box.
  const inBox = damageAnchors(shifted).every(([x, y]) => Math.abs(x) <= 120.05 && Math.abs(y) <= 120.05);
  assert.ok(inBox,
    'the shifted mark left the 240 box, so a plain box rule WOULD have caught it and this control\n'
    + 'adds nothing. The whole point is that the stranded mark is inside the box.');
});

// ⚠️ CLAUDE.md TRAP 6, AS AN INCLUSION TEST RATHER THAN AN ASSERTION ABOUT INTENT.
// The sixth trap shape is a predicate over "what a glyph resolves to", defeated by
// `GLYPH_SUBSTITUTE` — a device wearing ANOTHER piece's art, so the borrowed row's `kind` is not a
// fact about the tile. It shipped DEMOLISH dead on every lamp. A join that keyed on `kind` would
// have the same hole waiting. This plants the shape: every substitution target must resolve to a
// twin, and `GLYPH_SUBSTITUTE` must still be the heterogeneous set that made the original bug
// possible — if it ever became homogeneous, this control would stop proving anything.
test('the join survives GLYPH_SUBSTITUTE: a borrowed row still resolves to its own twin', () => {
  const targets = [...new Set(Object.values(GLYPH_SUBSTITUTE))];
  assert.ok(targets.length >= 5, 'non-vacuity: GLYPH_SUBSTITUTE has targets to test');
  const kinds = new Set(targets.map((id) => ITEMS[id].kind));
  assert.ok(kinds.size >= 2,
    'GLYPH_SUBSTITUTE became homogeneous in registry kind. That is the exact condition under which\n'
    + 'a kind-keyed predicate looks correct — this control no longer proves the join is kind-free.');
  for (const id of targets) {
    assert.ok(WRECKED[id], `${id} is a substitution target with no wrecked twin`);
    assert.equal(wreckedItemId(id), WRECKED_PREFIX + id);
    // ⚠️ NOT `startsWith('<g')`. THE PLACEHOLDER STARTS WITH `<g` TOO, so that leg was a right
    // answer from the wrong branch — the fourth trap shape, and mutation caught it: keying
    // `buildWrecked` on `kind !== 'cosmetic'` left this test GREEN while every cosmetic row silently
    // fell back to the `?` tile. Compare against the placeholder BUILT WITH THE SAME OPTS, which is
    // byte-for-byte what a missed lookup returns.
    const opts = { idPrefix: 'sub' };
    assert.notEqual(buildWrecked(id, opts), placeholderItem(opts),
      `${id}: a substitution target fell back to the placeholder — the join consulted something
`
      + 'other than the itemId, and every device wearing a borrowed piece just lost its twin.');
  }
  // …and every one of the four kinds is represented in the twin set, so no class is special-cased.
  // Guarded the same way as the census: an orphan twin must REPORT, not throw a bare TypeError.
  for (const id of WRECKED_IDS) assert.ok(ITEMS[id], `${id} is a twin with no registry row behind it`);
  assert.deepEqual([...new Set(WRECKED_IDS.map((id) => ITEMS[id].kind))].sort(),
    ['cosmetic', 'functional', 'material', 'resource']);
});

// ── purity + fragment hygiene, mirroring items.test.js ───────────────────────────────────────

// ⚠️ THE NAME USED TO OVER-CLAIM AND THE TEST HAS BEEN CORRECTED, NOT JUST RENAMED. Every clause it
// asserts — non-empty, starts `<g`, ends `</g>`, balanced, no `undefined`/`NaN` — is satisfied by the
// PLACEHOLDER, all 414 characters of it, so a twin whose lookup missed entirely read as a pass. That
// is the fourth trap shape (a right answer from the wrong branch) and it lives wherever several
// paths return one sentinel. The placeholder is now compared against directly, built with the SAME
// opts, which is byte-for-byte what a missed lookup returns.
test('every twin builds its OWN non-empty, balanced <g> fragment — never the placeholder', () => {
  const missed = placeholderItem({});      // exactly what `buildWrecked(<unknown>)` returns
  for (const id of WRECKED_IDS) {
    const svg = buildWrecked(id);
    assert.equal(typeof svg, 'string', `${id} builds a string`);
    assert.notEqual(svg, missed, `${id} fell back to the placeholder — its row has no live painter`);
    assert.ok(svg.length > 40, `${id} is non-trivial`);
    assert.ok(svg.startsWith('<g'), `${id} starts with <g`);
    assert.ok(svg.trimEnd().endsWith('</g>'), `${id} ends with </g>`);
    assert.ok(!svg.includes('<svg'), `${id} is a fragment, not a full <svg>`);
    assert.equal((svg.match(/<g[\s>]/g) || []).length, (svg.match(/<\/g>/g) || []).length,
      `${id} has balanced <g> tags`);
    assert.ok(!svg.includes('undefined') && !svg.includes('NaN'), `${id} has no undefined/NaN`);
  }
});

test('every referenced gradient/pattern id resolves inside the same fragment', () => {
  for (const id of WRECKED_IDS) {
    const svg = buildWrecked(id);
    const { defIds, refIds } = idsIn(svg);
    const defSet = new Set(defIds);
    assert.ok(refIds.length > 0 || defIds.length === 0, `${id}: a fragment with defs must use them`);
    for (const r of refIds) assert.ok(defSet.has(r), `${id}: url(#${r}) resolves to a local def`);
  }
});

test('twins are deterministic: same opts → byte-identical output', () => {
  for (const id of WRECKED_IDS) {
    assert.equal(
      buildWrecked(id, { w: 100, h: 100, idPrefix: 'x' }),
      buildWrecked(id, { w: 100, h: 100, idPrefix: 'x' }),
      `${id} is deterministic`,
    );
  }
});

test('idPrefix makes two placements collision-free: disjoint def ids', () => {
  for (const id of WRECKED_IDS) {
    const a = new Set(idsIn(buildWrecked(id, { idPrefix: `${id}-a` })).defIds);
    const b = new Set(idsIn(buildWrecked(id, { idPrefix: `${id}-b` })).defIds);
    for (const x of a) assert.ok(!b.has(x), `${id}: def ${x} must not appear in both placements`);
  }
});

// ⚠️ THE DEFAULT idPrefix MUST NOT CARRY A COLON. It is interpolated into every `id="…"` and
// `url(#…)` in the fragment; `:` is legal in an XML name but reserved for namespace prefixes and is
// combinator-adjacent in CSS. The PUBLIC id keeps its colon, where nothing parses it as markup.
test('the default def-id namespace is markup-safe, and the public id is namespaced away', () => {
  for (const id of WRECKED_IDS) {
    for (const defId of idsIn(buildWrecked(id)).defIds) {
      assert.ok(!defId.includes(':'), `${id}: def id ${defId} contains a colon`);
      assert.match(defId, /^wrecked-/, `${id}: def id ${defId} is not namespaced to the twin`);
    }
    assert.equal(wreckedItemId(id), 'wrecked:' + id);
    assert.equal(ITEMS[wreckedItemId(id)], undefined, 'a wrecked id is never a registry key');
  }
});

// A twin is an INDEPENDENT REDRAW, not an overlay on the pristine piece and not a variant flag.
// If any twin came out byte-identical to its pristine counterpart, a builder was wired to its own
// PRISTINE painter.
//
// ⛔ CORRECTION, AND THE FALSE CLAIM WAS THE EXPENSIVE HALF. This comment used to end *"— which is a
// copy-paste slip nothing else in this file would catch"*, naming this test as the guard for
// wrong-painter wiring in general. IT IS NOT. It catches exactly one shape (a twin wired to its
// pristine painter); `the 80 twins are 80 different pictures` catches exactly one other (two rows
// SHARING one painter). A SWAP is neither, and swapping the `paint:` fields of the `reactor` and
// `solar-panel` rows was MEASURED against this whole file: 20 pass / 0 fail. This repo has a scar
// from precisely this shape — a package that wrote "a door is taken apart with STRIP" into six
// places and asserted it in a test, when STRIP explicitly refuses doors. The swap is caught by the
// painter-name guard below, and by nothing else.
test('no twin is byte-identical to its pristine piece', () => {
  for (const id of WRECKED_IDS) {
    assert.notEqual(buildWrecked(id, { idPrefix: 'same' }), buildItem(id, { idPrefix: 'same' }),
      `${id}: the wrecked twin renders exactly like the pristine piece`);
  }
});

// Every twin is DISTINCT from every other twin. Two rows pointing at one painter is the other half
// of the same slip, and the deep-equal on ids above cannot see it.
test('the 80 twins are 80 different pictures', () => {
  const seen = new Map();
  for (const id of WRECKED_IDS) {
    const svg = buildWrecked(id, { idPrefix: 'k' });
    assert.ok(!seen.has(svg), `${id} renders identically to ${seen.get(svg)} — one painter, two rows`);
    seen.set(svg, id);
  }
  assert.equal(seen.size, 80);
});

// ⚠️ THE JOIN PINS WHICH ROWS EXIST — IT PINS NOTHING ABOUT WHICH PICTURE A ROW DRAWS.
// `deepEqual(WRECKED_IDS, [...ITEM_IDS])` pins the ids, their order, their labels and their badges.
// It says nothing about `paint`. Swapping the `paint:` fields of the `reactor` and `solar-panel`
// rows — so `buildWrecked('reactor')` hands back the wrecked solar panel — leaves this file GREEN,
// measured, because the swapped pair is still 70 distinct pictures and neither is its own pristine
// piece. In the shipping game that is simply the wrong object on the tile, forever, silently.
//
// The convention that makes it checkable already holds unbroken in BOTH registries: every builder is
// a `const <camelCaseOfItsOwnId> = (s) => …`, so `fn.name` IS the row's id — re-measured here over
// both registries, never quoted (80 of 80 in `WRECKED`, 82 of 82 in `ITEMS` on the day this line was
// written; the assertions below are lists, not counts, so neither figure is load-bearing).
//
// ⚠️ ASSUMPTION, STATED BECAUSE THE GUARD RESTS ENTIRELY ON IT: `Function.prototype.name` survives
// to the browser. `client/serve.py` serves `client/src/*.js` RAW — this repo has no bundler and no
// minifier anywhere in it — so name mangling would have to be introduced deliberately. If it ever
// is, the PRISTINE floor below reddens first and names minification as the cause, instead of this
// guard degrading quietly into a tautology.
test('the paint on every row is the painter named after that row (a swap is invisible otherwise)', () => {
  const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

  // NON-VACUITY FLOOR — a SECOND POPULATION, not a count. `ITEMS` obeys the same convention through
  // the same mechanism, and this package does not own a single one of its rows. A floor that counted
  // `WRECKED_IDS.length` would prove only that the loop ran (CLAUDE.md trap 4: a population count
  // proves a matcher matched something, never that it would match the thing); this one fails if
  // `fn.name` is ever stripped or if `camel` is wrong, on evidence outside the subject.
  //
  // ⚠️ AND IT IS NOT ONLY A FLOOR — DISCLOSED, BECAUSE A SIDE EFFECT NOBODY WROTE DOWN IS THE NEXT
  // READER'S SURPRISE. `client/src/items/index.js` has the IDENTICAL hole this whole test exists to
  // close, and it predates this package: swapping the `build:` fields of the `desk` and `chair` rows
  // leaves the entire node suite GREEN on `main` — MEASURED HERE, 843 pass / 0 fail with these four
  // lines deleted, and exactly one RED with them present. So this floor is also, incidentally, the
  // only guard in the repo against a pristine-row swap. That was NOT this lane's charter and the
  // coverage is a by-product of the floor's shape; if the pristine set ever needs a guard of its
  // own it should get an explicit one in `items.test.js` rather than lean on this.
  const pristineBroken = ITEM_IDS
    .filter((id) => ITEMS[id].build.name !== camel(id))
    .map((id) => `${id} ← ${ITEMS[id].build.name || '<anonymous>'}`);
  assert.deepEqual(pristineBroken, [],
    'a PRISTINE registry row carries a builder that is not its own. Read the pairs above before\n'
    + 'assuming which: two rows naming each other is a SWAP in client/src/items/index.js (the same\n'
    + 'defect this file guards for the twins); all 70 at once is name mangling, in which case this\n'
    + 'guard is unusable AS WRITTEN and must be REPLACED — not relaxed — by one that compares\n'
    + 'rendered output; a single odd one is a renamed builder, so rename it back.');

  const mismatched = WRECKED_IDS
    .filter((id) => WRECKED[id].paint.name !== camel(id))
    .map((id) => `${id} ← ${WRECKED[id].paint.name || '<anonymous>'}`);
  assert.deepEqual(mismatched, [],
    'a twin row carries a painter that is not its own — the SWAP shape. The ids, their order, the\n'
    + 'labels, the badges, the 70-different-pictures check and the not-the-pristine-piece check are\n'
    + 'ALL still green, and the shipping game draws the wrong object.');
});

// ⚠️ THE PURITY SCAN, AND WHY IT IS WORTH A TEST AT ALL. Damage LOOKS like scatter. A builder that
// derived a scorch position from `Math.random` would not present as a bug — it would present as a
// screenshot that differs from itself, blamed on the renderer. The determinism test above is the
// primary guard; this is the cheap second one that names the cause.
// Comments are STRIPPED first (CLAUDE.md trap 1: this file's own header discusses randomness, and a
// raw-text scan would fire on the prose), with a negative control below proving that it does.
test('the twin module reaches for no clock, no randomness and no DOM', () => {
  const code = codeOnly(WRECKED_SRC);
  assert.ok(code.length > 4000, 'non-vacuity: the stripper did not eat the module');
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'document.', 'window.', 'performance.now']) {
    assert.ok(!code.includes(banned), `wrecked.js reaches for ${banned}`);
  }
  // NEGATIVE CONTROL, and it is not decoration: without it the scan fires on prose and the fix is
  // to delete explanatory comments, which is worse than the bug. The module's header really does
  // contain the string `Math.random` (it explains why the ban exists), so this control is LIVE on
  // the shipped file rather than on a fixture.
  assert.ok(WRECKED_SRC.includes('Math.random'),
    'the header no longer mentions Math.random, so this control proves nothing — either restore the\n'
    + 'explanation or delete this assertion, but do not leave it green and vacuous.');
});

// ── the tolerant API surface ─────────────────────────────────────────────────────────────────

test('buildWrecked falls back to a placeholder for unknown / bad ids without throwing', () => {
  for (const bad of ['nope', '', null, undefined, 42, {}, 'wrecked:reactor']) {
    let svg;
    assert.doesNotThrow(() => { svg = buildWrecked(/** @type {any} */ (bad)); },
      `buildWrecked(${String(bad)}) must not throw`);
    assert.ok(svg.startsWith('<g'), 'placeholder is a <g> fragment');
    assert.ok(svg.includes('?'), 'placeholder carries the "?" mark');
  }
  // ⚠️ `'wrecked:reactor'` is in that list on purpose: `buildWrecked` takes the PRISTINE id. Feeding
  // it an already-wrecked id is the obvious call-site mistake, and it must miss rather than
  // double-wrap into `wrecked:wrecked:reactor`.
  assert.equal(WRECKED['wrecked:reactor'], undefined);
});

test('wreckedItemId / pristineItemId round-trip, and reject everything else', () => {
  for (const id of WRECKED_IDS) {
    const w = wreckedItemId(id);
    assert.equal(pristineItemId(w), id);
    assert.equal(isWreckedItemId(w), true);
    assert.equal(isWreckedItemId(id), false, `${id}: a pristine id is not a wrecked id`);
  }
  for (const junk of ['', 'nope', 'wrecked:', 'wrecked:nope', null, undefined, 42, {}]) {
    assert.equal(wreckedItemId(/** @type {any} */ (junk)), undefined);
    assert.equal(pristineItemId(/** @type {any} */ (junk)), undefined);
    assert.equal(isWreckedItemId(/** @type {any} */ (junk)), false);
  }
});

// ⚠️ THE FOOTPRINT IS BORROWED, NEVER RE-TRANSCRIBED. `wreckedInfo` reads `size` and `kind` off the
// PRISTINE registry row, so a twin cannot disagree with its own object about how big it is. A
// second `size` column would be the exact defect this package's join was designed to avoid.
test('wreckedInfo derives size and kind from the pristine row, and carries no copy of them', () => {
  for (const id of WRECKED_IDS) {
    const info = wreckedInfo(id);
    assert.equal(info.pristineId, id);
    assert.equal(info.wreckedId, 'wrecked:' + id);
    assert.equal(info.state, wreckedState(id));
    // guarded for the same reason as the census above: an orphan twin must REPORT, not throw
    assert.ok(ITEMS[id], `${id} is a twin with no registry row, so it has no size or kind to borrow`);
    assert.equal(info.kind, ITEMS[id].kind);
    assert.deepEqual(info.size, ITEMS[id].size);
    assert.equal(info.size, ITEMS[id].size, 'the SAME object, not a copy — a copy could drift');
  }
  assert.equal(wreckedInfo('nope'), undefined);
  assert.equal(wreckedState('nope'), undefined);
});

// ── the surface boundary ─────────────────────────────────────────────────────────────────────

// ⚠️ THIS PACKAGE IS ART AND A JOIN, AND NOTHING ELSE. Nothing on the wire carries a device
// condition, so no surface could choose a twin even if it wanted to; a lane that quietly wired it in
// would be shipping a draw decision nobody has made. Two directions, because they fail differently:
// a client file importing the twins is a premature wiring, and `index.js` importing them would
// invert the dependency and make the set un-revertible.
//
// ⛔ THE FIRST VERSION OF THIS GUARD WAS TOO NARROW IN BOTH DIMENSIONS AT ONCE, and each failure was
// measured with a planted violation rather than reasoned about.
//
// THE PARSER was `/from\s+['"][^'"]*items\/wrecked\.js['"]/` — ONE SPELLING:
//   • `import { WRECKED } from '../items/wrecked.js';`   → RED   (the spelling it knew)
//   • `import { WRECKED } from '../items/wrecked';`      → GREEN (no extension)
//   • `const m = await import('../items/wrecked.js');`   → GREEN (dynamic import is not `from`)
//   • `import '../items/wrecked.js';`                    → GREEN (a bare side-effect import)
// THE SCOPE was `client/src/ui/` only, so the plain, known spelling planted in
// `client/src/render/compose.js` or in `client/src/main.js` was GREEN on both counts.
// THE FLOOR was `seen.length >= 5` — a POPULATION COUNT, which is `CLAUDE.md` trap 4 verbatim: it
// proves the matcher matched something; it never proves it would match the thing.
//
// EVERY REGISTRY CONSUMER LIVES IN `ui/` TODAY, WHICH IS EXACTLY WHY THE SCOPE FILTER LOOKS
// SUFFICIENT AND IS NOT. The wiring that would matter here is a DRAW decision, and a draw decision
// lands in `render/` or in `main.js` at least as naturally as in a view — `ui/` is where the
// registry is read now, not where a twin would first be reached for.
//
// So: every `.js` under `client/src/` except `items/` (the set's own home), and the needle is the
// bare word `wrecked` over COMMENT-STRIPPED source. A module cannot reach this set without naming
// it — the file, the exports and the id prefix all carry the word — so the weakest possible needle
// is also the strongest available one, and stripping comments is what keeps it from firing on prose.
// ⚠️ THIS TEST'S SUBJECT CHANGED WITH W0b AND ITS MACHINERY DID NOT, which is the only honest way to
// move a boundary. It used to assert that NO module outside `items/` names the wrecked set, on the
// grounds that *"wiring a twin to a surface needs a device CONDITION on the wire and an owner
// decision about the threshold — neither exists yet."* Both exist now: the `devices` channel carries
// `Condition`, and `client/src/items/wear.js` makes the threshold decision once, against
// `wear.wreck_threshold`.
//
// ⛔ AND LEAVING THE TEST AS IT WAS WOULD HAVE BEEN A FALSE GREEN, not a stale pin. The sweep
// EXCLUDES `items/`, so `wear.js` could import the whole twin set and every surface could draw it
// through a name that does not contain the string "wrecked", with this assertion perfectly happy.
// A guard whose scope filter excludes the violation is CLAUDE.md's fourth trap, and it would have
// fired here on the very next commit.
//
// ⇒ THE INVARIANT IS NOW "ONE DOOR", which is the thing actually worth protecting: `wear.js` is the
// only module that may name the wrecked set, and every surface goes through it. That keeps the
// property the original was really defending — the twins revert by deleting two files — while making
// the sweep able to see the shape that replaced the one it was written for.
const WRECKED_DOOR = 'wear.js';

test('the wrecked set has exactly ONE door (items/wear.js), and index.js does not know it exists', () => {
  const index = readFileSync(join(HERE, '..', 'src', 'items', 'index.js'), 'utf8');
  assert.ok(!codeOnly(index).includes('wrecked'),
    'client/src/items/index.js references the wrecked set. The dependency must run ONE WAY\n'
    + '(wrecked.js → index.js) or the twins stop being revertible on their own.');

  const reaches = (src) => /wrecked/i.test(codeOnly(src));

  // INCLUSION FLOOR, not a population count. Every spelling below is a real way to wire the set in,
  // and the four marked ⨯ are the ones the retired parser missed. The predicate must catch each one
  // on its own — that is the only form of non-vacuity that says anything about what a scan WOULD
  // catch. (These were also planted in the real files and run; see the package report.)
  for (const plant of [
    "import { WRECKED } from '../items/wrecked.js';",
    "import { WRECKED } from '../items/wrecked';",              // ⨯ no extension
    "const m = await import('../items/wrecked.js');",           // ⨯ dynamic
    "import '../items/wrecked.js';",                            // ⨯ bare side-effect
    "import { buildWrecked } from '../../items/wrecked.js';",   // ⨯ from render/webgl/
    'const art = buildWrecked(id);',                            // the import aliased away entirely
  ]) assert.ok(reaches(plant), `the sweep predicate misses this wiring: ${plant}`);
  // …and it must NOT fire on prose, or the way to satisfy it becomes deleting explanatory comments,
  // which is worse than the bug (CLAUDE.md trap 1's second half). A LATER REAL COMMENT is included
  // deliberately: a stripper fixture with no closing `*/` passes whether the stripper works or not.
  assert.ok(!reaches('/* the wrecked twins are not wired here */\nconst x = 1; // and nor here\n'),
    'the sweep fires on a comment. That is the stripper, not the scan — import `codeOnly`, never a\n'
    + 're-derived one.');

  const files = [];
  (function walk(dir, rel) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (ent.name !== 'items') walk(join(dir, ent.name), `${rel}${ent.name}/`);
      } else if (ent.name.endsWith('.js')) {
        files.push([rel + ent.name, join(dir, ent.name)]);
      }
    }
  }(join(HERE, '..', 'src'), ''));

  // Non-vacuity on the SWEEP is likewise structural, not a bare count: the three places the retired
  // scope filter could not see must each be present.
  assert.ok(files.some(([r]) => r.startsWith('ui/')), 'the sweep must reach client/src/ui/');
  assert.ok(files.some(([r]) => r.startsWith('render/')), 'the sweep must reach client/src/render/');
  assert.ok(files.some(([r]) => r.includes('/webgl/')), 'the sweep must recurse into nested dirs');
  assert.ok(files.some(([r]) => r === 'main.js'), 'the sweep must reach client/src/main.js');
  assert.ok(!files.some(([r]) => r.startsWith('items/')),
    'items/ is the set\'s own home and is excluded — wrecked.js names itself on every line');
  assert.ok(files.length >= 40, 'the client/src sweep found only ' + files.length + ' modules');

  for (const [rel, path] of files) {
    assert.ok(!reaches(readFileSync(path, 'utf8')),
      `client/src/${rel} reaches for the wrecked set DIRECTLY. There is exactly one door and it is\n`
      + `client/src/items/${WRECKED_DOOR}: a surface asks it for a tile's art and it answers with the\n`
      + 'piece or its twin. A second reader is a second copy of "below what condition does a tile\n'
      + 'wear its twin?", which is the hand-mirror defect that shipped the device-sprite bug.');
  }

  // ⇒ AND INSIDE `items/`, WHICH THE SWEEP ABOVE EXCLUDES: exactly TWO modules may name the set —
  // the set itself (which names itself on every line) and its one door. Without this leg the
  // exclusion is a hole big enough to drive the whole join through.
  const inItems = readdirSync(join(HERE, '..', 'src', 'items'), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => e.name)
    .filter((name) => name !== 'wrecked.js'
      && reaches(readFileSync(join(HERE, '..', 'src', 'items', name), 'utf8')));
  assert.deepEqual(inItems, [WRECKED_DOOR],
    'the modules inside client/src/items/ that reach for the wrecked set are not exactly\n'
    + `[${WRECKED_DOOR}]. If this list GREW, the join has a second home. If it EMPTIED, the`
    + ' door was renamed or the join was dismantled — in which case nothing draws the twins\n'
    + 'at all and the whole set is unreachable again, which is the state W0b existed to end.');

  // NON-VACUITY for that leg specifically: the door must really be a file, and it must really be
  // the thing the surfaces import. A `deepEqual` against a one-element list is satisfied by a
  // directory read that happened to return one match for the wrong reason.
  const door = readFileSync(join(HERE, '..', 'src', 'items', WRECKED_DOOR), 'utf8');
  assert.ok(codeOnly(door).includes('buildWrecked'), `items/${WRECKED_DOOR} does not call buildWrecked`);
  for (const surface of ['ui/roomzoom-view.js', 'ui/overview-scene.js']) {
    assert.ok(codeOnly(readFileSync(join(HERE, '..', 'src', surface), 'utf8')).includes('buildTileItem'),
      `client/src/${surface} does not go through the door — it draws no twins at all`);
  }
});
