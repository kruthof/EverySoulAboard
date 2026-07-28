// Item-library tests — the 70-piece warm SVG set (client/src/items/*). Pure builders: no DOM, no
// clock, no randomness. Asserts every registered item builds to a non-empty SVG `<g>` fragment,
// is deterministic (same opts → identical bytes), collision-free across idPrefixes, correctly
// classified, and that buildItem() falls back safely. The count is pinned at exactly 70.
//
// 60 → 68 on 2026-07-27: the mock was re-imported with a "Resources & loose items" section — the
// eight GROUND STACKS the `items` wire channel was built to carry. They are a FOURTH `kind`
// (`resource`); see index.js's header for why none of the other three fitted.
//
// 68 → 70 on 2026-07-28: the mock re-import added CRYO CAPSULE · OCCUPIED and CRYO CAPSULE · OPEN
// (client/src/items/cryo.js). Both COSMETIC — there is no cryo `DeviceKind` — so the class tally
// moves in `cosmetic` alone. The same import brought 70 WRECKED twins; they are NOT in this
// registry and are pinned by `client/test/wrecked.test.js` instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ITEMS,
  ITEM_IDS,
  ITEM_KINDS,
  buildItem,
  itemInfo,
  placeholderItem,
  RESOURCE_ITEM_BY_KIND_NAME,
  isResourceItem,
  isDeviceItem,
} from '../src/items/index.js';

/** All gradient/pattern/filter ids referenced anywhere in an SVG fragment (url(#id) + id="..."). */
function idsIn(svg) {
  const defIds = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const refIds = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  return { defIds, refIds };
}

test('the registry holds exactly 70 items', () => {
  assert.equal(ITEM_IDS.length, 70);
  assert.equal(Object.keys(ITEMS).length, 70);
});

// ⚠️ RE-COUNT, NEVER COMPUTE. A prior review published a wrong sum for a sibling census and it
// stayed green through BOTH wrong versions, because the assertion was written as one number. This
// one is a per-class OBJECT, so a class that moves names itself in the failure message; the four
// numbers below were re-counted off the shipped registry after the cryo rows landed.
test('the class tally holds: 27 functional, 23 cosmetic, 12 material, 8 resource', () => {
  const by = { functional: 0, cosmetic: 0, material: 0, resource: 0 };
  for (const id of ITEM_IDS) by[ITEMS[id].kind]++;
  assert.deepEqual(by, { functional: 27, cosmetic: 23, material: 12, resource: 8 });
});

test('ITEM_KINDS is exactly the set of kinds the registry uses — no dead value, no unlisted one', () => {
  // Both directions. A `kind` value listed but never used is dead vocabulary that makes the next
  // reader believe in a class that does not exist; a kind USED but not listed slips past the
  // per-entry `ITEM_KINDS.includes(e.kind)` check below only because that check would then fail —
  // which is the point, so this states the closure once rather than leaving it implied.
  assert.deepEqual([...ITEM_KINDS].sort(),
    [...new Set(ITEM_IDS.map((id) => ITEMS[id].kind))].sort());
  assert.equal(ITEM_KINDS.length, 4, 'four kinds: functional, cosmetic, material, resource');
});

test('every RESOURCE row names a sim ItemKind and a Glyphs.ForItem char', () => {
  const res = ITEM_IDS.filter((id) => ITEMS[id].kind === 'resource');
  assert.deepEqual(res.sort(), [
    'controller-module', 'corpse', 'ice', 'parts', 'potato', 'regolith', 'scrap', 'seals',
  ]);
  const kinds = new Set();
  const glyphs = new Set();
  for (const id of res) {
    const e = ITEMS[id];
    assert.equal(typeof e.itemKind, 'string', `${id} carries the sim ItemKind NAME`);
    assert.ok(e.itemKind.length > 2, `${id}: itemKind looks like a member name`);
    assert.equal(typeof e.glyph, 'string', `${id} carries a glyph`);
    assert.equal(e.glyph.length, 1, `${id}: one char`);
    assert.ok(!kinds.has(e.itemKind), `two rows claim ItemKind ${e.itemKind}`);
    assert.ok(!glyphs.has(e.glyph), `two rows claim glyph ${JSON.stringify(e.glyph)}`);
    kinds.add(e.itemKind); glyphs.add(e.glyph);
    assert.equal(e.deviceKind, undefined, `${id} is not a device`);
    assert.equal(e.decor, undefined, `${id} is not decor`);
  }
  // …and MetalOre is deliberately absent. `ItemKind.MetalOre` has zero references anywhere in `sim/`
  // outside the glyph table; giving it art would be inventing a material the game does not have.
  assert.ok(!kinds.has('MetalOre'),
    'MetalOre grew a piece. Nothing in sim/ produces or consumes it — it is dead E3 mining '
    + 'vocabulary and must stay in NO_GROUND_ITEM_SPRITE until it is real.');
});

test('RESOURCE_ITEM_BY_KIND_NAME is derived from the registry, not transcribed', () => {
  for (const id of ITEM_IDS) {
    const e = ITEMS[id];
    if (e.kind !== 'resource') continue;
    assert.equal(RESOURCE_ITEM_BY_KIND_NAME[e.itemKind], id, `${e.itemKind} → ${id}`);
  }
  assert.equal(Object.keys(RESOURCE_ITEM_BY_KIND_NAME).length, 8);
  // and the two predicates the view layer classifies with
  assert.equal(isResourceItem('regolith'), true);
  assert.equal(isResourceItem('locker'), false, 'a device is not a resource');
  assert.equal(isResourceItem('rug'), false, 'decor is not a resource');
  assert.equal(isDeviceItem('locker'), true);
  assert.equal(isDeviceItem('regolith'), false, 'a pile is not a device — DEMOLISH depends on this');
  for (const junk of ['', 'nope', null, undefined, 42, {}]) {
    assert.equal(isResourceItem(/** @type {any} */ (junk)), false);
    assert.equal(isDeviceItem(/** @type {any} */ (junk)), false);
  }
});

test('every item builds to a non-empty, balanced SVG <g> fragment (not a whole <svg>)', () => {
  for (const id of ITEM_IDS) {
    const svg = buildItem(id);
    assert.equal(typeof svg, 'string', `${id} builds a string`);
    assert.ok(svg.length > 40, `${id} is non-trivial`);
    assert.ok(svg.startsWith('<g'), `${id} starts with <g`);
    assert.ok(svg.trimEnd().endsWith('</g>'), `${id} ends with </g>`);
    assert.ok(!svg.includes('<svg'), `${id} is a fragment, not a full <svg>`);
    // balanced <g>…</g>
    const opens = (svg.match(/<g[\s>]/g) || []).length;
    const closes = (svg.match(/<\/g>/g) || []).length;
    assert.equal(opens, closes, `${id} has balanced <g> tags`);
    // no unresolved template holes
    assert.ok(!svg.includes('undefined') && !svg.includes('NaN'), `${id} has no undefined/NaN`);
  }
});

test('every referenced gradient/pattern id is defined in the same fragment', () => {
  for (const id of ITEM_IDS) {
    const svg = buildItem(id);
    const { defIds, refIds } = idsIn(svg);
    const defSet = new Set(defIds);
    for (const r of refIds) assert.ok(defSet.has(r), `${id}: url(#${r}) resolves to a local def`);
  }
});

test('builders are deterministic: same opts → byte-identical output', () => {
  for (const id of ITEM_IDS) {
    const a = buildItem(id, { w: 100, h: 100, idPrefix: 'x' });
    const b = buildItem(id, { w: 100, h: 100, idPrefix: 'x' });
    assert.equal(a, b, `${id} is deterministic`);
  }
});

test('idPrefix makes two placements collision-free: disjoint gradient/pattern ids', () => {
  for (const id of ITEM_IDS) {
    const a = buildItem(id, { idPrefix: `${id}-a` });
    const b = buildItem(id, { idPrefix: `${id}-b` });
    const aIds = new Set(idsIn(a).defIds);
    const bIds = new Set(idsIn(b).defIds);
    for (const x of aIds) assert.ok(!bIds.has(x), `${id}: id ${x} must not appear in both placements`);
  }
});

test('the default idPrefix derives deterministically from itemId + index', () => {
  const a = buildItem('reactor', { index: 0 });
  const b = buildItem('reactor', { index: 1 });
  // different indices ⇒ different namespaces ⇒ disjoint ids (when the item has any defs)
  const aIds = new Set(idsIn(a).defIds);
  const bIds = new Set(idsIn(b).defIds);
  for (const x of aIds) assert.ok(!bIds.has(x), `index bump renames def ${x}`);
  // stable per (id,index)
  assert.equal(buildItem('reactor', { index: 2 }), buildItem('reactor', { index: 2 }));
});

test('every registry entry has a valid kind + a callable builder + a size', () => {
  for (const id of ITEM_IDS) {
    const e = ITEMS[id];
    assert.ok(ITEM_KINDS.includes(e.kind), `${id} has a valid kind (${e.kind})`);
    assert.equal(typeof e.build, 'function', `${id} has a build function`);
    assert.ok(e.size && e.size.w > 0 && e.size.h > 0, `${id} has a positive size`);
    if (e.kind === 'functional') assert.ok(e.deviceKind, `${id} functional ⇒ deviceKind`);
    if (e.kind === 'material') assert.ok(['wall', 'floor'].includes(e.material), `${id} material tag`);
    if (e.kind === 'cosmetic') assert.ok(e.decor, `${id} cosmetic ⇒ decor key`);
    if (e.kind === 'resource') assert.ok(e.itemKind, `${id} resource ⇒ itemKind name`);
  }
});

test('the four NEW device kinds are flagged deviceStatus:new', () => {
  const news = ITEM_IDS.filter((id) => ITEMS[id].deviceStatus === 'new').sort();
  assert.deepEqual(news, ['cooker', 'oxygen-tank', 'reactor', 'space-heater']);
});

test('buildItem falls back to a placeholder for unknown / bad ids without throwing', () => {
  for (const bad of ['nope', '', null, undefined, 42, {}]) {
    let svg;
    assert.doesNotThrow(() => {
      svg = buildItem(/** @type {any} */ (bad));
    }, `buildItem(${String(bad)}) must not throw`);
    assert.ok(svg.startsWith('<g'), 'placeholder is a <g> fragment');
    assert.ok(svg.includes('?'), 'placeholder carries the "?" mark');
  }
  assert.equal(itemInfo('nope'), undefined);
});

test('placeholder is deterministic and honours idPrefix', () => {
  assert.equal(placeholderItem({ idPrefix: 'p' }), placeholderItem({ idPrefix: 'p' }));
});

test('opts.state="off" changes glow-bearing devices but stays a valid fragment', () => {
  for (const id of ['reactor', 'cooker', 'fabricator', 'standing-lamp', 'space-heater', 'sliding-door']) {
    const on = buildItem(id, { idPrefix: 'p', state: 'on' });
    const off = buildItem(id, { idPrefix: 'p', state: 'off' });
    assert.notEqual(on, off, `${id} responds to state`);
    assert.ok(off.startsWith('<g') && off.trimEnd().endsWith('</g>'), `${id} off is valid`);
  }
});

test('custom w/h scales the wrapper transform (fragment stays tile-normalised)', () => {
  const small = buildItem('reactor', { w: 50, h: 50, idPrefix: 'z' });
  const big = buildItem('reactor', { w: 200, h: 200, idPrefix: 'z' });
  assert.ok(small.includes('translate(25 25)'), 'small centres at 25,25');
  assert.ok(big.includes('translate(100 100)'), 'big centres at 100,100');
});

// ── the mapping document's Tally, which was prose and is now pinned ──────────────────────────
//
// ⚠️ WHY THIS TEST EXISTS AT ALL. `docs/design/perilune-item-mapping.md` is the human-readable map
// from mock piece → registry row, and its Tally table is the number a reader quotes. NOTHING READ
// IT: `grep -rn "item-mapping" client/ tests/ hosts/ sim/` finds three citations inside `index.js`
// comments and ZERO readers. It has already gone stale once and was hand-corrected (21 → 23 COSMETIC,
// 68 → 70) — the same fix with the same half-life, because the mechanism was never touched. The
// 2026-07-28 re-import also shipped a sentence in that file claiming the wrecked join is *"asserted
// against this document's own ordering"*, which was simply untrue; correcting the CONTENT while
// leaving the ROT MECHANISM in place is how the next drift arrives just as quietly. So the table is
// now parsed and checked against the shipped registry.
//
// The doc is the SUBJECT here, never the source of truth: every expected number below is computed
// from `ITEMS`, and a mismatch means the prose is wrong.
test('the mapping doc\'s Tally table agrees with the shipped registry, row for row', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const DOC = join(HERE, '..', '..', 'docs', 'design', 'perilune-item-mapping.md');
  const md = readFileSync(DOC, 'utf8');

  // Bound the read to the Tally section: this file carries several other tables (the class tables
  // above it, and the correction table in the Wrecked section), and an unbounded row scan would
  // silently pick up whichever of them happened to match. ⚠️ Tally is currently the LAST `##`
  // section, so this bound runs to end-of-file today and is doing nothing yet — it is insurance
  // against the next section being appended below it. What makes an appended table LOUD rather than
  // silent is the exact row-label `deepEqual` further down, not this slice.
  const from = md.indexOf('\n## Tally\n');
  assert.ok(from > 0, 'the Tally heading is gone from perilune-item-mapping.md — this reader is\n'
    + 'broken, or the section was renamed and the guard must follow it');
  const after = md.indexOf('\n## ', from + 1);
  const section = md.slice(from, after > 0 ? after : md.length);

  /** `| **FUNCTIONAL total** | **27** |` → `['FUNCTIONAL total', 27]`, code rows only. */
  const rows = new Map();
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length !== 4 || cells[0] !== '' || cells[3] !== '') continue;   // not a table row
    const label = cells[1].replace(/\*\*/g, '').replace(/`/g, '').trim();
    const count = cells[2].replace(/\*\*/g, '').trim();
    if (!/^\d+$/.test(count)) continue;                                       // the header + rule
    rows.set(label, Number(count));
  }

  // NON-VACUITY, as an inclusion test rather than a count: name every row that must be present, so
  // a reader that silently matched nothing (a reformatted table, a renamed heading) fails HERE and
  // says which row it lost, instead of vacuously agreeing with the registry about an empty set.
  const need = [
    'FUNCTIONAL — [exists] (map to a live DeviceKind, pure re-skin)',
    'FUNCTIONAL — [NEW] (needs a new DeviceKind)',
    'FUNCTIONAL total',
    'COSMETIC (view-only decor, non-hashed)',
    'MATERIAL (wall/floor tint)',
    'RESOURCE (ground stack, a sim ItemKind)',
    'Total',
  ];
  assert.deepEqual([...rows.keys()], need,
    'the Tally table\'s rows are not the seven this guard knows. Adding or renaming a class is a\n'
    + 'real change — update this list deliberately; do not relax the reader.');

  // …and the numbers, every one of them derived from the registry.
  const by = { functional: 0, cosmetic: 0, material: 0, resource: 0 };
  for (const id of ITEM_IDS) by[ITEMS[id].kind]++;
  const isNew = ITEM_IDS.filter((id) => ITEMS[id].deviceStatus === 'new').length;
  assert.deepEqual(Object.fromEntries(rows), {
    [need[0]]: by.functional - isNew,
    [need[1]]: isNew,
    [need[2]]: by.functional,
    [need[3]]: by.cosmetic,
    [need[4]]: by.material,
    [need[5]]: by.resource,
    [need[6]]: ITEM_IDS.length,
  }, 'docs/design/perilune-item-mapping.md\'s Tally no longer matches client/src/items/. The doc is\n'
    + 'the thing that is wrong here — re-count off the registry and correct the table.');
});
