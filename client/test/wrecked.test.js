// The WRECKED item set — 70 post-raid twins (client/src/items/wrecked.js), imported 2026-07-28 from
// the "Wrecked — post-raid state" section of docs/design/perilune-item-set.dc.html.
//
// WHAT THIS FILE IS FOR, in one sentence: to make it impossible for the twin registry to drift from
// the pristine registry OR from the mock, silently.
//
// ⚠️ IT READS THE COMMITTED SPEC, and that is the point rather than a convenience. The alternative —
// asserting the 70 labels and 70 condition badges from memory — would be a SECOND TRANSCRIPTION of
// the same data, and this repo has a standing lesson that hand-mirrored tables rot (`ROLE_TO_ITEM`
// was deleted for exactly that; `glyph-map.js` derives glyph→item from `ITEMS` instead). So the
// labels and states in `WRECKED` are checked against the mock's OWN `brokenD` array, parsed out of
// the spec at test time. If the mock is re-imported and a label or a badge changes, this file goes
// red and names the row.
//
// ⚠️ THE 70 WRECKED PIECES ARE NOT IN THE SPEC'S MARKUP. They exist only after JS execution — a
// `brokenD` array inside `<script type="text/x-dc" data-dc-script>`, rendered through `<sc-for>`.
// A `class="lbl"` grep over the spec finds the 70 PRISTINE labels plus the literal template text
// `{{b.name}}`, and MISSES EVERY WRECKED PIECE. Both readers below are exercised, and both carry a
// non-vacuity floor, because "found nothing" and "matched nothing" are the same string here.

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
} from '../src/items/wrecked.js';
import { codeOnly } from './code-only.js';

// The registry rows that come FROM THE MOCK, in the mock's own order — `ITEM_IDS` minus the ledger
// of deliberate omissions. Every positional join in this file (label[i] ↔ id[i]) is against THIS
// list and not against `ITEM_IDS`, because the mock is 70 pieces and the registry is no longer.
//
// ⚠️ DERIVED, NOT A SECOND LIST. Writing the 70 ids out here would be a transcription of `ITEMS`
// that could fall out of step with it silently — the exact defect `glyph-map.js` exists to remove.
// A ledgered row appended anywhere but the END would still break the positional join, and the
// registry says so beside the row rather than here; `the ledger is exactly the rows with no twin`
// below is what keeps the two definitions of "mock row" from drifting apart.
const MOCK_IDS = ITEM_IDS.filter((id) => !(id in NO_WRECKED_TWIN));

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(HERE, '..', '..', 'docs', 'design', 'perilune-item-set.dc.html');
const SPEC = readFileSync(SPEC_PATH, 'utf8');
const WRECKED_SRC = readFileSync(join(HERE, '..', 'src', 'items', 'wrecked.js'), 'utf8');

// ── the two readers over the spec ────────────────────────────────────────────────────────────

/**
 * The mock's WRECKED pieces: `{ name, state }` per entry of `brokenD`, in file order.
 * Deliberately a REGEX over the array's source rather than an `eval` of `renderVals()`: a test that
 * executed the spec would be pinning the spec against itself.
 *
 * ⚠️ BOUNDED AT THE ARRAY'S OWN `];`, not run to end-of-file. The unbounded version happened to
 * return the same 70 rows only because nothing LATER in the spec has the shape
 * `{ name: '…', state: '…' }` — a dependence on a file this reader does not own and cannot see. The
 * bound is measured, not assumed: the first `];` after the array's head is its terminator, and the
 * row count either side of it is identical (70) today, which is exactly why the drift would be
 * silent. If a future section grows a `state:` field, the unbounded reader would inflate the census
 * and every downstream bijection would fail somewhere unrelated.
 */
function mockWreckedRows() {
  const start = SPEC.indexOf('const brokenD = [');
  assert.ok(start > 0, 'brokenD array not found in the spec — the reader is broken, not the data');
  const tail = SPEC.slice(start);
  const end = tail.indexOf('];');
  assert.ok(end > 0, 'the brokenD array is unterminated in the spec — the reader is broken');
  return [...tail.slice(0, end).matchAll(/\{\s*name:\s*'([^']*)',\s*state:\s*'([^']*)'/g)]
    .map((m) => ({ name: m[1], state: m[2] }));
}

/** The mock's PRISTINE labels: every `class="lbl"` in the static markup, in file order. */
function mockPristineLabels() {
  return [...SPEC.matchAll(/<div class="lbl">([^<]*)<\/div>/g)]
    .map((m) => m[1])
    .filter((s) => s !== '{{b.name}}');   // the <sc-for> template's own placeholder, not a piece
}

/** All gradient/pattern ids defined and referenced anywhere in an SVG fragment. */
function idsIn(svg) {
  return {
    defIds: [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
    refIds: [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]),
  };
}

// ── the census — RE-COUNTED, never computed ──────────────────────────────────────────────────

test('the spec really carries 70 wrecked pieces and 70 pristine labels', () => {
  // NON-VACUITY FIRST, both readers. A regex that matched nothing and a spec that contained nothing
  // are indistinguishable downstream, and this file's every other assertion is downstream.
  const rows = mockWreckedRows();
  const labels = mockPristineLabels();
  assert.equal(rows.length, 70, 'brokenD reader found ' + rows.length + ' wrecked pieces, expected 70');
  assert.equal(labels.length, 70, 'lbl reader found ' + labels.length + ' pristine labels, expected 70');
  // …and the two readers must not be reading the same thing. `class="lbl"` cannot see brokenD.
  assert.ok(!labels.includes('REGOLITH · CONTAMINATED'),
    'the lbl reader picked up a WRECKED label — it is reading the wrong section, and every '
    + 'verbatim/renamed split below would then be meaningless');
});

// ⚠️ RE-COUNT, NEVER COMPUTE. A prior review in this repo published a wrong sum for a sibling
// census and it stayed green through BOTH wrong versions, because the assertion was a single
// number. This one is a per-class OBJECT so a class that moves names itself, and the four numbers
// were re-counted off the shipped registry (they are `items.test.js`'s tally, which is the point:
// every registry row, of every class, has exactly one twin).
test('the class census of the twin set: 29 functional, 21 cosmetic, 12 material, 8 resource', () => {
  // ⚠️ MOVED ABOVE THE LOOP DELIBERATELY (CLAUDE.md trap 5). It used to sit AFTER the `deepEqual`
  // below, where it could never fire on its own: the four class counts sum to 70 and every id
  // contributes exactly one, so a 69-row twin set fails the `deepEqual` first and `assert` throws.
  // A leg that cannot report is indistinguishable from one that can. Here it is the file's first
  // absolute-scale statement and it bites alone.
  assert.equal(WRECKED_IDS.length, 70);
  const by = { functional: 0, cosmetic: 0, material: 0, resource: 0 };
  for (const id of WRECKED_IDS) {
    // ⚠️ NOT `by[ITEMS[id].kind]++`. An orphan twin (a key with no registry row) made that throw a
    // bare TypeError, which the mutation harness correctly refuses to score as a semantic RED
    // (CLAUDE.md trap 3). A guard that crashes instead of reporting has told you nothing.
    assert.ok(ITEMS[id], `${id} is a twin with no registry row behind it`);
    by[ITEMS[id].kind] += 1;
  }
  // ⚠️ RE-COUNTED AGAIN AFTER THE WRECK START (W3): `DeviceKind.CryoPod` now exists, so the two
  // cryo-capsule pieces moved COSMETIC → FUNCTIONAL [exists] and claimed the two state glyphs
  // 'K' (occupied) and 'k' (open). Functional 27 → 29, cosmetic 23 → 21; the total is unchanged
  // at 70 because nothing was added or removed, only reclassified — which is exactly the shape a
  // single total would have hidden, and the reason this census is a per-class object.
  assert.deepEqual(by, { functional: 29, cosmetic: 21, material: 12, resource: 8 });
});

test('the state census: 62 pieces carry a percentage, 8 carry the em-dash', () => {
  const pct = WRECKED_IDS.filter((id) => /^\d+%$/.test(WRECKED[id].state));
  const dash = WRECKED_IDS.filter((id) => WRECKED[id].state === '—');
  assert.equal(pct.length, 62);
  assert.equal(dash.length, 8);
  assert.equal(pct.length + dash.length, WRECKED_IDS.length, 'no third state exists');
  // the em-dash ones are exactly the loose resources: you cannot repair a spoiled pile
  assert.deepEqual(dash.sort(), [
    'controller-module', 'corpse', 'ice', 'parts', 'potato', 'regolith', 'scrap', 'seals',
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
  assert.deepEqual(WRECKED_IDS, MOCK_IDS, 'the twin key set is exactly the mock rows, in order');
  assert.deepEqual(orphanWreckedTwins(), [], 'twins with no registry row');
});

// ⚠️ THE LEDGER IS THE ONLY WAY A ROW MAY HAVE NO TWIN, AND IT IS PINNED BOTH WAYS. `deepEqual` of
// the two ORDERED lists — not a count, and not a subset check — so an unledgered omission fails
// (a row silently missing its twin) AND a stale ledger entry fails (a row that has since been given
// one). The size is pinned separately below because a swap of one omission for another leaves both
// lists the same length.
test('the ledger is exactly the rows with no twin, and its reasons are real prose', () => {
  assert.deepEqual(itemsWithoutWreckedTwin(), Object.keys(NO_WRECKED_TWIN),
    'a registry row has no wrecked twin and no NO_WRECKED_TWIN entry (or the ledger names a row\n'
    + 'that has one). A missing twin is a decision — write it in the ledger with its reason.');
  // NON-VACUITY: the ledger must not be trivially satisfiable by an empty reason.
  for (const [id, why] of Object.entries(NO_WRECKED_TWIN)) {
    assert.ok(ITEMS[id], `${id} is ledgered but is not a registry row at all`);
    assert.ok(typeof why === 'string' && why.length > 80, `${id}: the ledger entry has no reason`);
  }
  assert.equal(Object.keys(NO_WRECKED_TWIN).length, 1,
    'THE NO-TWIN LEDGER CHANGED SIZE. It went 0 → 1 when `swarf` landed — a piece drawn for a sim\n'
    + 'fact the mock predates, so the mock has no twin for it. Growing it means another piece was\n'
    + 'drawn outside the mock; SHRINKING it means the mock was re-imported with a twin, in which\n'
    + 'case add the twin rather than deleting the reason.');
});

test('every twin label and condition badge matches the mock, row for row', () => {
  const rows = mockWreckedRows();
  const byName = new Map(rows.map((r) => [r.name, r.state]));
  assert.equal(byName.size, 70, 'two mock pieces share a label — the join cannot be by name');
  const claimed = new Set();
  for (const id of WRECKED_IDS) {
    const { mockLabel, state } = WRECKED[id];
    assert.ok(byName.has(mockLabel), `${id}: no mock piece is labelled ${JSON.stringify(mockLabel)}`);
    assert.equal(state, byName.get(mockLabel), `${id} (${mockLabel}): condition badge`);
    assert.ok(!claimed.has(mockLabel), `two registry rows claim the mock piece ${mockLabel}`);
    claimed.add(mockLabel);
  }
  assert.equal(claimed.size, rows.length, 'the join is a BIJECTION: every mock piece is claimed once');
});

// ⚠️ THE NAMING COLLISION, PROVEN RATHER THAN REMEMBERED. A label is unique only within a section:
// 62 wrecked pieces reuse the pristine label verbatim, and the 8 resources are renamed. Both halves
// are checked against the spec, and the pristine side is derived POSITIONALLY — `ITEM_IDS` order is
// the mock's static order, so `labels[i]` is `ITEM_IDS[i]`'s own label and nothing is transcribed
// a second time.
test('62 twins reuse the pristine label verbatim; the 8 resources are renamed', () => {
  const labels = mockPristineLabels();
  assert.equal(labels.length, MOCK_IDS.length, 'positional alignment requires equal lengths');
  const verbatim = [];
  const renamed = [];
  MOCK_IDS.forEach((id, i) => {
    // ⚠️ GUARDED, not `WRECKED[id].mockLabel` bare. Deleting one twin row made that throw a
    // TypeError, and a guard that crashes reports nothing — the mutation harness scores it as a
    // CRASH rather than a semantic RED, which is the third trap in reverse.
    assert.ok(WRECKED[id], `${id} has no wrecked twin, so its label cannot be compared`);
    (WRECKED[id].mockLabel === labels[i] ? verbatim : renamed).push(id);
  });
  assert.equal(verbatim.length, 62, 'verbatim reuse');
  assert.deepEqual(renamed, ['regolith', 'potato', 'scrap', 'parts', 'controller-module', 'seals', 'ice', 'corpse']);
  // the positional alignment is itself an assumption; make it fail loudly if the mock reorders
  assert.equal(labels[0], 'REACTOR');
  assert.equal(labels[68], 'CRYO CAPSULE · OCCUPIED');
  assert.equal(labels[69], 'CRYO CAPSULE · OPEN');
});

// ⚠️ THE SUFFIX RULE IS NOT MECHANICAL, AND THIS TEST EXISTS TO STOP SOMEONE MAKING IT ONE.
// Seven of the eight renames are `<pristine label> · <STATE>`. `CONTROLLER · FRIED` also SHORTENS
// its stem, from `CONTROLLER MODULE`. Anyone who "simplifies" the join to string surgery would be
// right seven times and wrong once, and the wrong one would produce a lookup miss, i.e. a
// placeholder `?` tile in the shipping game.
test('the 8 renames: seven keep the stem, CONTROLLER MODULE does not', () => {
  const labels = mockPristineLabels();
  const stemOf = (s) => s.split(' · ')[0];
  const kept = [];
  const shortened = [];
  for (const id of ['regolith', 'potato', 'scrap', 'parts', 'controller-module', 'seals', 'ice', 'corpse']) {
    const i = MOCK_IDS.indexOf(id);
    const label = WRECKED[id].mockLabel;
    assert.ok(label.includes(' · '), `${id}: a renamed piece carries a " · STATE" suffix`);
    (stemOf(label) === labels[i] ? kept : shortened).push(id);
  }
  assert.deepEqual(shortened, ['controller-module'],
    'exactly ONE rename changes its stem. If this list grew, a stem-preserving derivation is now\n'
    + 'wrong in more places; if it emptied, the mock became mechanical and this test should be\n'
    + 'RETIRED rather than relaxed — but check the mock, do not assume it.');
  // ⚠️ REDUNDANT BY CONSTRUCTION, AND SAYING SO IS THE POINT. The loop above visits exactly eight
  // ids and pushes each into one of two arrays, so `shortened === ['controller-module']` already
  // forces `kept.length === 7`; this line CANNOT fail on its own. Kept as a statement of the split
  // rather than deleted, but labelled — an unlabelled dead leg is the fifth trap shape, and the
  // cost is that a reader believes two guarantees where there is one.
  assert.equal(kept.length, 7);
  assert.equal(WRECKED['controller-module'].mockLabel, 'CONTROLLER · FRIED');
  assert.equal(labels[MOCK_IDS.indexOf('controller-module')], 'CONTROLLER MODULE');
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
// pristine painter); `the 70 twins are 70 different pictures` catches exactly one other (two rows
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
test('the 70 twins are 70 different pictures', () => {
  const seen = new Map();
  for (const id of WRECKED_IDS) {
    const svg = buildWrecked(id, { idPrefix: 'k' });
    assert.ok(!seen.has(svg), `${id} renders identically to ${seen.get(svg)} — one painter, two rows`);
    seen.set(svg, id);
  }
  assert.equal(seen.size, 70);
});

// ⚠️ THE JOIN PINS WHICH ROWS EXIST — IT PINS NOTHING ABOUT WHICH PICTURE A ROW DRAWS.
// `deepEqual(WRECKED_IDS, [...ITEM_IDS])` pins the ids, their order, their labels and their badges.
// It says nothing about `paint`. Swapping the `paint:` fields of the `reactor` and `solar-panel`
// rows — so `buildWrecked('reactor')` hands back the wrecked solar panel — leaves this file GREEN,
// measured, because the swapped pair is still 70 distinct pictures and neither is its own pristine
// piece. In the shipping game that is simply the wrong object on the tile, forever, silently.
//
// The convention that makes it checkable already holds unbroken in BOTH registries: every builder is
// a `const <camelCaseOfItsOwnId> = (s) => …`, so `fn.name` IS the row's id. 70 of 70 in `WRECKED`,
// 70 of 70 in `ITEMS` — re-measured here, not quoted.
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
