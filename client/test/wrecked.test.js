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
} from '../src/items/wrecked.js';
import { codeOnly } from './code-only.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(HERE, '..', '..', 'docs', 'design', 'perilune-item-set.dc.html');
const SPEC = readFileSync(SPEC_PATH, 'utf8');
const WRECKED_SRC = readFileSync(join(HERE, '..', 'src', 'items', 'wrecked.js'), 'utf8');

// ── the two readers over the spec ────────────────────────────────────────────────────────────

/**
 * The mock's WRECKED pieces: `{ name, state }` per entry of `brokenD`, in file order.
 * Deliberately a REGEX over the array's source rather than an `eval` of `renderVals()`: a test that
 * executed the spec would be pinning the spec against itself.
 */
function mockWreckedRows() {
  const start = SPEC.indexOf('const brokenD = [');
  assert.ok(start > 0, 'brokenD array not found in the spec — the reader is broken, not the data');
  const body = SPEC.slice(start);
  return [...body.matchAll(/\{\s*name:\s*'([^']*)',\s*state:\s*'([^']*)'/g)]
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
test('the class census of the twin set: 27 functional, 23 cosmetic, 12 material, 8 resource', () => {
  const by = { functional: 0, cosmetic: 0, material: 0, resource: 0 };
  for (const id of WRECKED_IDS) {
    // ⚠️ NOT `by[ITEMS[id].kind]++`. An orphan twin (a key with no registry row) made that throw a
    // bare TypeError, which the mutation harness correctly refuses to score as a semantic RED
    // (CLAUDE.md trap 3). A guard that crashes instead of reporting has told you nothing.
    assert.ok(ITEMS[id], `${id} is a twin with no registry row behind it`);
    by[ITEMS[id].kind] += 1;
  }
  assert.deepEqual(by, { functional: 27, cosmetic: 23, material: 12, resource: 8 });
  assert.equal(WRECKED_IDS.length, 70);
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
  for (const id of dash) assert.equal(ITEMS[id].kind, 'resource', `${id} carries — but is not a resource`);
});

// ── the join ─────────────────────────────────────────────────────────────────────────────────

// ⚠️ THIS IS A LIST EQUALITY, NOT A COUNT EQUALITY, AND THAT IS DELIBERATE (CLAUDE.md trap 7).
// A suite of ratio/count assertions cannot see a substitution: swapping one twin for another leaves
// `WRECKED_IDS.length === ITEM_IDS.length` perfectly true. `deepEqual` on the ORDERED id lists is
// the only form that regresses on a rename, a reorder, a swap, an omission AND an extra.
test('every registry row has exactly one wrecked twin, and no twin is an orphan', () => {
  assert.deepEqual(WRECKED_IDS, [...ITEM_IDS], 'the twin key set is exactly ITEM_IDS, in order');
  assert.deepEqual(itemsWithoutWreckedTwin(), [], 'registry rows with no twin');
  assert.deepEqual(orphanWreckedTwins(), [], 'twins with no registry row');
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
  assert.equal(labels.length, ITEM_IDS.length, 'positional alignment requires equal lengths');
  const verbatim = [];
  const renamed = [];
  ITEM_IDS.forEach((id, i) => {
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
    const i = ITEM_IDS.indexOf(id);
    const label = WRECKED[id].mockLabel;
    assert.ok(label.includes(' · '), `${id}: a renamed piece carries a " · STATE" suffix`);
    (stemOf(label) === labels[i] ? kept : shortened).push(id);
  }
  assert.deepEqual(shortened, ['controller-module'],
    'exactly ONE rename changes its stem. If this list grew, a stem-preserving derivation is now\n'
    + 'wrong in more places; if it emptied, the mock became mechanical and this test should be\n'
    + 'RETIRED rather than relaxed — but check the mock, do not assume it.');
  assert.equal(kept.length, 7);
  assert.equal(WRECKED['controller-module'].mockLabel, 'CONTROLLER · FRIED');
  assert.equal(labels[ITEM_IDS.indexOf('controller-module')], 'CONTROLLER MODULE');
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

test('every twin builds to a non-empty, balanced SVG <g> fragment (not a whole <svg>)', () => {
  for (const id of WRECKED_IDS) {
    const svg = buildWrecked(id);
    assert.equal(typeof svg, 'string', `${id} builds a string`);
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
// If any twin came out byte-identical to its pristine counterpart, a builder was wired to the wrong
// painter — which is a copy-paste slip nothing else in this file would catch.
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
// a UI file importing the twins is a premature wiring, and `index.js` importing them would invert
// the dependency and make the set un-revertible.
test('no UI surface imports the wrecked set, and index.js does not know it exists', () => {
  const ui = join(HERE, '..', 'src', 'ui');
  const files = readFileSync(join(HERE, '..', 'src', 'items', 'index.js'), 'utf8');
  assert.ok(!codeOnly(files).includes('wrecked'),
    'client/src/items/index.js references the wrecked set. The dependency must run ONE WAY\n'
    + '(wrecked.js → index.js) or the twins stop being revertible on their own.');
  const seen = [];
  for (const name of readdirSync(ui)) {
    if (!name.endsWith('.js')) continue;
    seen.push(name);
    const src = codeOnly(readFileSync(join(ui, name), 'utf8'));
    assert.ok(!/from\s+['"][^'"]*items\/wrecked\.js['"]/.test(src),
      `client/src/ui/${name} imports the wrecked set. Wiring a twin to a surface needs a device\n`
      + 'CONDITION on the wire and an owner decision about the threshold — neither exists yet.');
  }
  assert.ok(seen.length >= 5, 'non-vacuity: the ui/ sweep found ' + seen.length + ' modules');
});
