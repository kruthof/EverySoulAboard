// Item-library tests — the registry in `client/src/items/*`. Pure builders: no DOM, no clock, no
// randomness. Asserts every registered item builds to a non-empty SVG `<g>` fragment, is
// deterministic (same opts → identical bytes), collision-free across idPrefixes, correctly
// classified, and that buildItem() falls back safely. The count is pinned by equality.
//
// ⚠️ "THE 70-PIECE WARM SVG SET" WAS THIS FILE'S OPENING CLAUSE AND IS TWICE WRONG NOW, so it is
// corrected rather than left: the registry is EIGHTY, and it is no longer one set. Thirty rows draw
// from `client/src/items/fittings.js` in the paper/ink idiom of the visual redesign; the remaining
// fifty still wear the warm mock's art until charter §3's P2b lands. A file whose header names a
// count is a file whose header goes stale — the numbers that matter are the assertions below.
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
import { coilPath } from '../src/items/resources.js';
import * as FITTINGS from '../src/items/fittings.js';
import { FITTING_IDS, SIZES } from '../src/items/fittings.js';

/** itemId → its builder's name. The convention `wrecked.test.js`'s painter floor already pins. */
const camelOf = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** All gradient/pattern/filter ids referenced anywhere in an SVG fragment (url(#id) + id="..."). */
function idsIn(svg) {
  const defIds = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const refIds = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  return { defIds, refIds };
}

// 70 → 71 on 2026-07-28 (W0b): `swarf`, the FIRST registry row that is not in the mock at all.
// `ItemKind.Swarf` arrived with the wreck start's salvage rule, after the mock was drawn, and on
// `--ship wreck` a Swarf pile is roughly the first thing the player makes — so it drew a raw-letter
// `w` chip on the deck plate in the shipping game. The row sits LAST in `ITEMS` on purpose (the
// mock's order is walked positionally by `wrecked.test.js`) and has no wrecked twin (ledgered by
// name in `client/src/items/wrecked.js`).
// ⚠️ 71 → 80 on 2026-08-05 (VR-P2). The owner's `design-import/Perilune Fittings.dc.html` is a
// THIRTY-piece buildable catalogue, and it overlaps the mock's furniture by twenty-one: those
// twenty-one REPLACED their art in place (same id, same class, same glyph, new drawing on
// `client/src/items/fittings.js`) and moved NO count at all. The nine that follow — BENCH, STOOL,
// COT, FOOTLOCKER, SINK, COMPOST BIN, VICE POST, CURTAIN RAIL, SHRINE SHELF — are pieces the mock
// never had, and they are the whole of the move. All nine are COSMETIC; index.js's own section
// comment measures why (every DeviceKind they could plausibly claim is already claimed above).
// RE-COUNTED off the shipped registry, not derived from this paragraph.
// ⚠️ 80 → 93 on 2026-08-05 (lane/paper-machines). `client/src/items/machines.js` draws the ship's own
// PLANT — reactor, solar wing, gas bottles, reclaimer, paste column, med cot, fab cell, ring array,
// dish, plant pot, book case, turret, sleeper pod — thirteen pieces the owner's fittings catalogue
// never covered and which were still wearing `objects.js`'s mock art. Every one is a NEW row: the
// thirteen warm rows they replace stay registered at `glyph: null`, so this is an addition of
// thirteen and not a re-skin of thirteen, and both halves of that are visible in the tally below.
// RE-COUNTED off the shipped registry, not derived from this paragraph.
test('the registry holds exactly 93 items', () => {
  assert.equal(ITEM_IDS.length, 93);
  assert.equal(Object.keys(ITEMS).length, 93);
});

// ⚠️ RE-COUNT, NEVER COMPUTE. A prior review published a wrong sum for a sibling census and it
// stayed green through BOTH wrong versions, because the assertion was written as one number. This
// one is a per-class OBJECT, so a class that moves names itself in the failure message; the four
// numbers below were re-counted off the shipped registry after the cryo rows landed.
test('the class tally holds: 37 functional, 35 cosmetic, 12 material, 9 resource', () => {
  // ⚠️ RE-COUNTED AGAIN AFTER lane/paper-machines: functional 29 → 37 and cosmetic 30 → 35, so TWO
  // classes moved this time and the pair of them is the shape of the package. Eight of the thirteen
  // machines name a `DeviceKind` (six that the sim projects today plus Reactor and OxygenTank, which
  // it does not yet — see the `deviceStatus:new` test below); five name none and are decor, exactly
  // as their warm predecessors were. Nothing was RE-CLASSIFIED: the warm rows kept their class and
  // lost only their glyph, which is why both numbers grew and neither shrank.
  // ⚠️ RE-COUNTED AGAIN AFTER VR-P2: COSMETIC 21 → 30, and it is the ONLY class that moved. That is
  // the tell that the fittings package was an ADDITION of nine decor rows and not a reclassification
  // — twenty-one further rows changed their PAINTING in the same commit and are invisible here,
  // which is exactly right: `kind` is a fact about what a piece IS, never about how it is drawn.
  // ⚠️ RE-COUNTED AGAIN AFTER W0b: `swarf` is a ninth RESOURCE row (8 → 9) and the only class that
  // moved. The total moved WITH it (70 → 71) because this is an addition and not a reclassification
  // — the opposite of the cryo move recorded below, and the reason both numbers are asserted.
  // ⚠️ RE-COUNTED AGAIN AFTER THE WRECK START (W3): `DeviceKind.CryoPod` now exists, so the two
  // cryo-capsule pieces moved COSMETIC → FUNCTIONAL [exists] and claimed the two state glyphs
  // 'K' (occupied) and 'k' (open). Functional 27 → 29, cosmetic 23 → 21; the total is unchanged
  // at 70 because nothing was added or removed, only reclassified — which is exactly the shape a
  // single total would have hidden, and the reason this census is a per-class object.
  const by = { functional: 0, cosmetic: 0, material: 0, resource: 0 };
  for (const id of ITEM_IDS) by[ITEMS[id].kind]++;
  assert.deepEqual(by, { functional: 37, cosmetic: 35, material: 12, resource: 9 });
});

// ⚠️ THE PAINTING IS NOT PINNED BY ANY COUNT ABOVE, AND VR-P2 IS THE PROOF: twenty-one rows swapped
// builders in one commit and every census in this file stayed still. So the swap is stated as a
// MEMBERSHIP, both ways — a row that quietly went back to `objects.js`, and a row that quietly
// arrived from the fittings catalogue, each fail here and name themselves.
test('exactly the thirty catalogue rows draw from items/fittings.js, and nothing else does', () => {
  const fromFittings = ITEM_IDS.filter((id) => FITTING_IDS.includes(id));
  assert.deepEqual([...fromFittings].sort(), [...FITTING_IDS].sort(),
    'a fittings-catalogue id is missing from the registry entirely');
  assert.equal(FITTING_IDS.length, 30, 'the catalogue is thirty pieces');
  for (const id of FITTING_IDS) {
    assert.equal(ITEMS[id].build, FITTINGS[camelOf(id)],
      `${id} does not draw from its own fittings builder`);
    assert.equal(ITEMS[id].size, SIZES[id], 'the size hint is the DERIVED one, not a transcription');
  }
  // …and the complement: no OTHER row may point into that module, which is what would happen if a
  // later lane pointed, say, `bookshelf` at `shelfRack` instead of drawing it.
  const builders = new Set(FITTING_IDS.map((id) => FITTINGS[camelOf(id)]));
  const strays = ITEM_IDS.filter((id) => !FITTING_IDS.includes(id) && builders.has(ITEMS[id].build));
  assert.deepEqual(strays, [], 'a non-catalogue row borrows a fitting builder');
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
    'controller-module', 'corpse', 'ice', 'parts', 'potato', 'regolith', 'scrap', 'seals', 'swarf',
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
  assert.equal(Object.keys(RESOURCE_ITEM_BY_KIND_NAME).length, 9);
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

// ⭐ M3-10: FOUR BECAME THREE, and it is the first time this list has ever shrunk. `space-heater`
// left it because `DeviceKind.Heater` now exists and `Glyphs.ForDevice` gives it `'E'`, so the piece
// claims its own glyph and is reachable by projection rather than only by the Radiator's borrow.
// This assertion is the reason that claim cannot be made in prose: a piece whose `deviceStatus` says
// `new` while a live DeviceKind projects it is a registry lie.
// ⚠️ THREE BECAME FIVE ON 2026-08-05, AND THE TWO NEW ONES ARE NOT NEW FACTS ABOUT THE SIM. They are
// `reactor-plant` and `bottle-rack`, the PAPER drawings of the same two kinds `reactor` and
// `oxygen-tank` have been waiting on: `DeviceKind.Reactor` and `DeviceKind.OxygenTank` still do not
// exist in `sim/Sim.Core/Entities/Device.cs`. So the list grows because the ART grew, not because the
// enum did — which is the honest reading and the reason the guard is a NAMED LIST rather than a count.
test('the five NEW device kinds are flagged deviceStatus:new', () => {
  const news = ITEM_IDS.filter((id) => ITEMS[id].deviceStatus === 'new').sort();
  assert.deepEqual(news, ['bottle-rack', 'cooker', 'oxygen-tank', 'reactor', 'reactor-plant']);
  assert.equal(ITEMS['space-heater'].deviceStatus, 'exists',
    'space-heater must read `exists` — DeviceKind.Heater (28) projects it directly since M3-10');
  assert.equal(ITEMS['space-heater'].glyph, 'E', 'and it must carry the glyph the sim projects');
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE SWARF PIECE (W0b) — the one registry row that is not in the mock.
//
// Everything above this line treats all 71 rows alike, and that is right for purity, determinism and
// classification. What no generic assertion can see is the ONE property this piece was drawn for:
// four of the nine resources are the same grey industrial granulate, hue cannot separate them at the
// ~32 px a tile is finally shown at, and the set therefore separates them by SILHOUETTE. Swarf's is
// the OPEN CURL — the only shape in the set whose middle is floor. If the curls silently closed into
// rings, or lost their dark rim and dissolved into the floor tint, every test above would still
// pass and a player would see a smudge where the first thing they ever made should be.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('a swarf coil is an OPEN path — a closed one is a ring, which is SEALS', () => {
  const d = coilPath(0, 0, 4, 14, 0, Math.PI * 3);
  assert.ok(d.startsWith('M'), 'a path starts with a moveto');
  assert.ok(d.includes('L'), 'the coil is a polyline');
  assert.ok(!d.includes('Z') && !d.includes('z'),
    'THE COIL CLOSED. `Z` makes the curl a ring, the floor stops showing through the middle, and\n'
    + 'the piece becomes SEALS at tile size — the exact collision the silhouette rule exists to stop.');
  // …and the ends really are apart: a spiral that returned to its start would be a ring drawn the
  // long way round, which `Z`-freeness alone does not rule out.
  const pts = d.slice(1).split('L');
  assert.ok(pts.length >= 20, 'the polyline is fine enough not to show its corners when downscaled');
  assert.notEqual(pts[0], pts[pts.length - 1], 'the coil returns to its own start — that is a ring');
  // PURE: same arguments ⇒ byte-identical, and every coordinate is 3 dp (no engine last-place drift).
  assert.equal(coilPath(0, 0, 4, 14, 0, Math.PI * 3), d);
  for (const p of pts) {
    for (const n of p.split(',')) {
      assert.ok(/^-?\d+(\.\d{1,3})?$/.test(n), `coordinate ${n} is not rounded to 3 dp`);
    }
  }
});

test('the swarf pile is drawn in STROKE, and every ribbon carries its dark rim', () => {
  const svg = buildItem('swarf', { idPrefix: 'sw' });
  // Every ribbon is a stroked path with NO fill — the property that keeps a 3 px curl visible when
  // the fill it would have had collapses to nothing at tile size.
  const strokedPaths = [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="([^"]+)" stroke-width="([\d.]+)"/g)];
  assert.ok(strokedPaths.length >= 10,
    `the swarf pile has ${strokedPaths.length} stroked ribbons; it needs at least ten (five curls,`
    + ' each drawn twice — a dark rim then a bright core).');
  // THE RIM, PAIRWISE. Each curl's `d` must appear TWICE: once dark and wide, once bright and 2 px
  // narrower. A single-stroke curl is a pale line over a pale floor tint and the pile reads as a
  // smudge — invisible to every other assertion in this file, which only ever sees "a string".
  const byPath = new Map();
  for (const [, d, colour, width] of strokedPaths) {
    if (!byPath.has(d)) byPath.set(d, []);
    byPath.get(d).push({ colour, width: Number(width) });
  }
  assert.ok(byPath.size >= 5, `only ${byPath.size} distinct curls in the pile`);
  for (const [d, strokes] of byPath) {
    assert.equal(strokes.length, 2, `a curl is drawn ${strokes.length}× — it needs a rim and a core`);
    const [under, over] = strokes;
    assert.equal(under.colour, '#39424b', 'the UNDER-stroke is the set\'s dark rim colour');
    assert.notEqual(over.colour, under.colour, 'the core is a different, brighter metal');
    assert.equal(under.width - over.width, 2,
      `the rim is ${under.width - over.width} px wider than the core, not 2 — one pixel of dark a`
      + ' side at design scale is what separates the curl from the floor.'
      + ` (curl ${d.slice(0, 24)}…)`);
  }
});

test('swarf does not look like the three pieces it could be confused with', () => {
  // NOT a byte comparison of whole fragments: every builder namespaces its own def ids, so any two
  // rows differ trivially and such a check would pass for two identical drawings. Compare the
  // GEOMETRY VOCABULARY instead, which is what a player actually reads at tile size.
  const geo = (id) => {
    const svg = buildItem(id, { idPrefix: 'x' });
    return {
      openStrokes: (svg.match(/fill="none" stroke="/g) || []).length,
      rects: (svg.match(/<rect /g) || []).length,
      circles: (svg.match(/<circle /g) || []).length,
    };
  };
  const sw = geo('swarf');
  assert.ok(sw.openStrokes >= 10, 'swarf is made of open strokes');
  for (const other of ['regolith', 'scrap', 'parts', 'seals']) {
    const g = geo(other);
    assert.ok(g.openStrokes < sw.openStrokes,
      `${other} now has as many open strokes as swarf (${g.openStrokes} vs ${sw.openStrokes}).\n`
      + 'The four grey granulates separate by SILHOUETTE, not hue, and the open curl was the last\n'
      + 'unused shape. If a redraw really needs open strokes there, swarf needs a new silhouette.');
  }
});
