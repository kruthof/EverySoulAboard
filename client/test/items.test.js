// Item-library tests — the registry in `client/src/items/*`. Pure builders: no DOM, no clock, no
// randomness. Asserts every registered item builds to a non-empty SVG `<g>` fragment, is
// deterministic (same opts → identical bytes), collision-free across idPrefixes, correctly
// classified, and that buildItem() falls back safely. The count is pinned by equality.
//
// ⛔ THE WARM SET IS GONE — lane/warm-purge, 2026-08-06, on the owner's ruling. THIRTY-EIGHT rows
// were retired in one commit and four modules (`objects.js`, `fixtures.js`, `resources.js`,
// `cryo.js`) were deleted with them, so the registry is EIGHTY-TWO and every row in it is drawn in
// the paper/ink dialect by one of five catalogues. This file's own header history is the shortest
// record of what that replaced, and it is quoted rather than deleted:
//
//   *"THE 70-PIECE WARM SVG SET WAS THIS FILE'S OPENING CLAUSE and is twice wrong now … the registry
//   is EIGHTY-FOUR … Thirty-four rows draw from `client/src/items/fittings.js` in the paper/ink idiom
//   of the visual redesign; the remaining fifty still wear the warm mock's art until charter §3's P2b
//   lands."* — 60 → 68 (2026-07-27, the eight ground stacks and the fourth `kind`) → 70 (2026-07-28,
//   the two cryo capsules) → 71 → 80 → 84 → 93 → 107 → 120 → **82**.
//
// ⇒ THIS IS THE FIRST TIME THE TOTAL HAS EVER GONE DOWN, and that is the one thing about it worth
// saying: every guard in this file was written for a registry that only grew, so the legs below are
// the ones re-derived off the shipped tree rather than adjusted. A file whose header names a count is
// a file whose header goes stale — the numbers that matter are the assertions.

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
// ⚠️ 80 → 84 on 2026-08-05, LATER THE SAME DAY. The owner revised the fittings catalogue to
// THIRTY-FOUR, adding a "Capsules and cells" section (31 CAPSULE SEALED, 32 CAPSULE OPEN, 33 CELL
// SOUND, 34 CELL SPENT). Unlike VR-P2's nine, none of these four is decor: they are the paper
// drawings for `DeviceKind.CryoPod` and `DeviceKind.Battery`, which had been drawing pre-redesign
// warm art. Three warm rows lost their glyph claims to them (`cryo-capsule-occupied`,
// `cryo-capsule-open`, `battery-bank`) and were KEPT — see index.js for the measured reason — so this
// total moved by exactly the four additions and by nothing else. RE-COUNTED off the shipped registry.
// ⚠️ RE-COUNTED AGAIN AFTER lane/paper-resources: 84 → 93, and the class that moved is RESOURCE
// (9 → 18). It is an ADDITION of nine rows and NOT a reclassification: the nine loose ground stacks
// were redrawn in the paper/ink dialect under new ids (`spoil-heap`, `tuber-crate`, … `turnings`),
// and the nine warm rows they displace are KEPT as unreached art with both joins handed over
// (`itemKind: null, glyph: null, supersededBy: …`). The total moved WITH the class, which is the
// tell for an addition; a reclassification would have moved the class and left the total alone.
// ⚠️ 93 IS RE-DERIVED OFF THE MERGED TREE, not summed from either lane's literal (TRAPS 8th shape).
// ⚠️ 80 → 94 on 2026-08-05 (lane/paper-fixtures). The ship's ARCHITECTURE — doors, hatches, service
// runs, wall furniture and the three luminaires — is redrawn in the paper/ink dialect in
// `client/src/items/paper-fixtures.js`, a module with no design card behind it (every dimension in
// its `SPECS` is a real-world measurement chosen there, not transcribed). ⛔ ALL FOURTEEN ARE NEW
// ROWS AND NONE REPLACES ONE IN PLACE, which is the opposite of VR-P2's twenty-one and is the whole
// reason the total moves: the warm rows they displace (`sliding-door`, `hatch-ladder`, `air-vent`,
// `airlock`, `power-conduit`, `wall-lamp`, `viewport`, `wall-screen`, `vent-fan`, `weapons-rack`,
// `sun-lamp`, `deck-sign`, `floodlight`, `blast-door`) STAY REGISTERED, at `glyph: null` where they
// held one, because their wrecked twins are fourteen of the mock's seventy and `wrecked.test.js`
// walks that bijection positionally. RE-COUNTED off the shipped registry, not derived from here.
// ⚠️ 93 + 14 → 107 ON THE MERGED TREE (main × lane/paper-fixtures). RE-DERIVED off the merged
// registry with `node -e` over the real export, never summed from the two lanes' literals — each
// lane's number was correct on its own tree and wrong on this one (TRAPS 8th shape).
// ⚠️ 107 → 120 on 2026-08-05 (lane/paper-machines). `client/src/items/machines.js` draws the ship's
// own PLANT — reactor, solar wing, gas bottles, reclaimer, paste column, med cot, fab cell, ring
// array, dish, plant pot, book case, turret, sleeper pod — thirteen pieces the owner's fittings
// catalogue never covered and which were still wearing `objects.js`'s mock art. Every one is a NEW
// row: the thirteen warm rows they replace stay registered at `glyph: null`, so this is an addition
// of thirteen and not a re-skin of thirteen, and both halves are visible in the tally below.
// ⚠️ 120 IS RE-DERIVED OFF THE MERGED TREE (main × lane/paper-machines) with `node -e` over the real
// export — never summed from either lane's literal. The lane's own tree said 93 and main said 107;
// both were correct there and wrong here (TRAPS 8th shape).
// ⚠️ 120 → 82 (lane/warm-purge, 2026-08-06), RE-DERIVED OFF THE SHIPPED REGISTRY with `node -e` over
// the real export. ⛔ THE FIRST DECREASE THIS LITERAL HAS EVER TAKEN, and the delta is NOT the number
// of things that changed: thirty-eight rows were retired, thirty-seven of them had twins, and one
// (`swarf`) was in `NO_WRECKED_TWIN` — so the registry, the twin set and the no-twin ledger each
// moved by a DIFFERENT amount from one commit. Re-count all three at their own homes.
test('the registry holds exactly 82 items', () => {
  assert.equal(ITEM_IDS.length, 82);
  assert.equal(Object.keys(ITEMS).length, 82);
});

// ⚠️ RE-COUNT, NEVER COMPUTE. A prior review published a wrong sum for a sibling census and it
// stayed green through BOTH wrong versions, because the assertion was written as one number. This
// one is a per-class OBJECT, so a class that moves names itself in the failure message; the four
// numbers below were re-counted off the shipped registry after the cryo rows landed.
test('the class tally holds: 31 functional, 30 cosmetic, 12 material, 9 resource', () => {
  // ⚠️ RE-DERIVED OFF THE MERGED TREE (main × lane/paper-machines) with `node -e` over the real
  // export: FUNCTIONAL 47, COSMETIC 43, MATERIAL 12, RESOURCE 18, total 120. ⛔ NEITHER SIDE'S
  // TALLY IS RIGHT HERE — main read 39/38/12/18 and the lane read 37/35/12/9 — because each moved a
  // different pair of classes off a different base. Summing them would have been a guess, and this
  // is the third merge in a row where that guess would have been wrong (TRAPS 8th shape).
  // ⚠️ THE MACHINES HALF: functional +8 and cosmetic +5. Eight of the thirteen machines name a
  // `DeviceKind` (six the sim projects today plus Reactor and OxygenTank, which it does not yet —
  // see the `deviceStatus:new` test below); five name none and are decor, exactly as their warm
  // predecessors were. Nothing was RE-CLASSIFIED: the warm rows kept their class and lost only
  // their glyph, which is why both numbers grew and neither shrank.
  // ⚠️ RE-DERIVED EARLIER OFF main × lane/paper-fixtures: FUNCTIONAL 39, COSMETIC 38, MATERIAL 12,
  // RESOURCE 18 — kept as the previous step in the chain, superseded by the four numbers above.
  // ⚠️ RE-COUNTED AGAIN AFTER THE CAPSULES AND CELLS: FUNCTIONAL 29 → 33, and it was the ONLY class
  // that moved — the mirror image of VR-P2's move, and the tell that these four are DEVICE art and
  // the nine before them were decor. All four name a `DeviceKind` the sim really has (`CryoPod`,
  // `Battery`); three of them claim a glyph the sim really projects and the fourth (`cell-spent`) is
  // a condition state that reaches the screen through `wear.js`, not through a char.
  // ⚠️ AND AFTER lane/paper-resources: RESOURCE 9 → 18, the only class that moved that time. The
  // four numbers below are RE-DERIVED off the merged registry, never summed from the two lanes'
  // literals — each lane's tally was correct on its own tree and wrong on this one (TRAPS 8th shape).

  // ⚠️ RE-COUNTED AGAIN AFTER lane/paper-fixtures: FUNCTIONAL 29 → 35 and COSMETIC 30 → 38, and
  // BOTH moved, which is what makes this census worth having. The six functional rows are the three
  // door states, the deck ladder, the conduit run and the vent grille — every one of them a
  // `DeviceKind` the sim really has and really projects. The eight cosmetic ones name nothing in
  // `DeviceKind` at all. ⛔ `DeviceKind.Light` is the one that looks like an omission and is not: it
  // exists, it is projected, and it has NEVER had a functional piece — `GLYPH_SUBSTITUTE['*']`
  // borrows a cosmetic luminaire for it, a shape `glyph-map.js` records as a live trap. That borrow
  // moved from `wall-lamp` to `lamp-sconce` in the same commit and is still a cosmetic row.
  // MATERIAL and RESOURCE did not move — an addition, not a reclassification.
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
  // ⚠️ 47/43/12/18 → 31/30/12/9 (2026-08-06), RE-DERIVED off the shipped registry. ⭐ EVERY CLASS BUT
  // MATERIAL MOVED, AND MATERIAL IS THE INTERESTING ONE: the twelve wall/floor skins were re-drawn in
  // place at lane/paper-materials and their TWINS were re-authored here, and neither is visible in a
  // class tally — `kind` is a fact about what a piece IS, never about how it is drawn. The other
  // three moved because rows LEFT: functional −16, cosmetic −13, resource −9, which is the 38.
  assert.deepEqual(by, { functional: 31, cosmetic: 30, material: 12, resource: 9 });
});

// ⚠️ THE PAINTING IS NOT PINNED BY ANY COUNT ABOVE, AND VR-P2 IS THE PROOF: twenty-one rows swapped
// builders in one commit and every census in this file stayed still. So the swap is stated as a
// MEMBERSHIP, both ways — a row that quietly went back to `objects.js`, and a row that quietly
// arrived from the fittings catalogue, each fail here and name themselves.
test('exactly the thirty-four catalogue rows draw from items/fittings.js, and nothing else does', () => {
  const fromFittings = ITEM_IDS.filter((id) => FITTING_IDS.includes(id));
  assert.deepEqual([...fromFittings].sort(), [...FITTING_IDS].sort(),
    'a fittings-catalogue id is missing from the registry entirely');
  assert.equal(FITTING_IDS.length, 34, 'the catalogue is thirty-four pieces');
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

// ⚠️ THE POPULATION IS NOW TWO POPULATIONS, AND MERGING THEM WOULD HAVE BEEN THE EASY WRONG FIX.
// Since lane/paper-resources a `resource` row is either LIVE — it claims a sim `ItemKind` name and a
// `Glyphs.ForItem` char, and both joins land on it — or SUPERSEDED: its art is still registered and
// still builds, but another row took both joins and it carries `itemKind: null, glyph: null,
// supersededBy: '<the row that took them>'`. Relaxing the old loop to "itemKind is a string OR null"
// would have kept it green while making the uniqueness half unenforceable, which is the whole thing
// it exists for. So the split is asserted first, and each half is then held to its OWN contract.
test('every RESOURCE row is LIVE — a sim ItemKind and a glyph, and there is no superseded half left', () => {
  const res = ITEM_IDS.filter((id) => ITEMS[id].kind === 'resource');
  assert.deepEqual(res.sort(), [
    'body-bag', 'control-card', 'gear-set', 'ice-block', 'plate-offcut', 'seal-set', 'spoil-heap',
    'tuber-crate', 'turnings',
  ]);
  const live = res.filter((id) => ITEMS[id].supersededBy === undefined);
  const dead = res.filter((id) => ITEMS[id].supersededBy !== undefined);
  assert.equal(live.length, 9, 'nine ItemKinds have art; a tenth LIVE row means a kind grew a piece');
  // ⭐ THE SUPERSEDED HALF IS EMPTY, AND ASSERTING THAT IS STRICTLY STRONGER THAN THE EXCLUSIVE-OR IT
  // REPLACES. Since lane/paper-resources a `resource` row could be LIVE or SUPERSEDED — *"its art is
  // still registered and still builds, but another row took both joins and it carries
  // `itemKind: null, glyph: null, supersededBy: '<the row that took them>'`"* — and the two halves
  // were held to separate contracts because merging them into "itemKind is a string OR null" would
  // have made the uniqueness half unenforceable. lane/warm-purge retired all nine superseded rows
  // (2026-08-06), so the exit is closed the only way that cannot be half-made: THE ROWS ARE NOT
  // THERE. ⛔ THE ARM IS KEPT RATHER THAN DELETED because it is now an INCLUSION test — a demoted row
  // reappearing tomorrow fails here by name instead of passing as "well, it is superseded".
  assert.deepEqual(dead, [],
    'a SUPERSEDED resource row is back in the registry: ' + dead.join(', ') + '\n'
    + 'Since 2026-08-06 a resource row either claims its sim ItemKind and its glyph, or it is not\n'
    + 'registered at all. A row demoted to `itemKind: null, glyph: null, supersededBy: …` is warm-set\n'
    + 'bookkeeping returning — retire the row instead, which is what the purge did to the nine.');
  const kinds = new Set();
  const glyphs = new Set();
  for (const id of live) {
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
    if (e.kind !== 'resource' || e.supersededBy !== undefined) continue;
    assert.equal(RESOURCE_ITEM_BY_KIND_NAME[e.itemKind], id, `${e.itemKind} → ${id}`);
  }
  assert.equal(Object.keys(RESOURCE_ITEM_BY_KIND_NAME).length, 9);
  // ⚠️ THE OTHER DIRECTION USED TO BE THE ONE THE SUPERSEDING MOVE COULD BREAK SILENTLY — no
  // superseded row may appear as a VALUE in the join, because the reducer takes the FIRST row that
  // claims a kind name and the warm rows sat ABOVE the paper ones. Kept, as an inclusion test: it is
  // vacuous only for as long as the registry carries no demoted rows, and the leg above is what pins
  // that. Deleting it would leave nothing watching the direction that actually failed.
  const superseded = new Set(ITEM_IDS.filter((id) => ITEMS[id].supersededBy !== undefined));
  for (const [kind, id] of Object.entries(RESOURCE_ITEM_BY_KIND_NAME)) {
    assert.ok(!superseded.has(id),
      `ItemKind ${kind} still resolves to the SUPERSEDED row "${id}". The registry reducer takes the`
      + ' FIRST row that claims a kind name, and a demoted row declared above a live one wins.');
  }
  // and the two predicates the view layer classifies with
  assert.equal(isResourceItem('spoil-heap'), true);
  assert.equal(isResourceItem('turnings'), true);
  assert.equal(isResourceItem('locker'), false, 'a device is not a resource');
  assert.equal(isResourceItem('rug'), false, 'decor is not a resource');
  assert.equal(isDeviceItem('locker'), true);
  assert.equal(isDeviceItem('spoil-heap'), false, 'a pile is not a device — DEMOLISH depends on this');
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
  const a = buildItem('reactor-plant', { index: 0 });
  const b = buildItem('reactor-plant', { index: 1 });
  // different indices ⇒ different namespaces ⇒ disjoint ids (when the item has any defs)
  const aIds = new Set(idsIn(a).defIds);
  const bIds = new Set(idsIn(b).defIds);
  for (const x of aIds) assert.ok(!bIds.has(x), `index bump renames def ${x}`);
  // stable per (id,index)
  assert.equal(buildItem('reactor-plant', { index: 2 }), buildItem('reactor-plant', { index: 2 }));
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
    // ⚠️ `supersededBy` IS THE ONLY EXIT, and it is checked as an EXCLUSIVE OR rather than as an
    // excuse: a resource row names a sim kind, or it names the row that took its kind, never both
    // and never neither. (`itemKind` else-branch guarded so an `undefined` cannot slip through as
    // "well, it is superseded".)
    if (e.kind === 'resource') {
      if (e.supersededBy === undefined) assert.ok(e.itemKind, `${id} resource ⇒ itemKind name`);
      else assert.equal(e.itemKind, null, `${id} is superseded ⇒ it must claim no itemKind`);
    }
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
// ⚠️ FIVE BECAME THREE ON 2026-08-06, AND IT IS THE SECOND TIME THIS LIST HAS SHRUNK — the first was
// M3-10, when `space-heater` left because `DeviceKind.Heater` arrived. This one is the opposite kind
// of shrink and the difference matters: NOTHING CHANGED IN THE SIM. `reactor` and `oxygen-tank` were
// the WARM drawings of the same two kinds `reactor-plant` and `bottle-rack` still wait on, and they
// were retired as unreached art. `DeviceKind.Reactor` and `DeviceKind.OxygenTank` still do not exist
// in `sim/Sim.Core/Entities/Device.cs` — checked on the shipped tree, not assumed — which is exactly
// why the two paper rows are still flagged.
test('the three NEW device kinds are flagged deviceStatus:new', () => {
  const news = ITEM_IDS.filter((id) => ITEMS[id].deviceStatus === 'new').sort();
  assert.deepEqual(news, ['bottle-rack', 'cooker', 'reactor-plant']);
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
  // ⚠️ THE LIST WAS `['reactor', 'cooker', 'fabricator', 'standing-lamp', 'space-heater',
  // 'sliding-door']` and FOUR OF THE SIX WERE RETIRED WARM ROWS. Re-chosen off the shipped registry
  // by DRIVING it — every id below was checked to really respond to `state`, which is the only thing
  // this test is about; a piece that ignores `state` would make it vacuous.
  for (const id of ['cooker', 'standing-lamp', 'space-heater', 'door-sliding', 'grow-lamp', 'lamp-sconce']) {
    const on = buildItem(id, { idPrefix: 'p', state: 'on' });
    const off = buildItem(id, { idPrefix: 'p', state: 'off' });
    assert.notEqual(on, off, `${id} responds to state`);
    assert.ok(off.startsWith('<g') && off.trimEnd().endsWith('</g>'), `${id} off is valid`);
  }
});

test('custom w/h scales the wrapper transform (fragment stays tile-normalised)', () => {
  const small = buildItem('reactor-plant', { w: 50, h: 50, idPrefix: 'z' });
  const big = buildItem('reactor-plant', { w: 200, h: 200, idPrefix: 'z' });
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
// ⛔ THE SWARF SECTION STOOD HERE — three tests, deleted 2026-08-06 WITH THE ROW THEY WATCHED.
//
// `swarf` was the first registry row that was not in the mock (W0b, `ItemKind.Swarf` from the wreck
// start's salvage rule). Its three tests watched the ONE property no generic assertion could see:
// *"four of the nine resources are the same grey industrial granulate, hue cannot separate them at
// the ~32 px a tile is finally shown at, and the set therefore separates them by SILHOUETTE. Swarf's
// is the OPEN CURL — the only shape in the set whose middle is floor."* They were
// `a swarf coil is an OPEN path — a closed one is a ring, which is SEALS`,
// `the swarf pile is drawn in STROKE, and every ribbon carries its dark rim`, and
// `swarf does not look like the three pieces it could be confused with`. `coilPath`, the only export
// of `client/src/items/resources.js` any test imported, went with the module.
//
// ⭐ THE PROPERTY IS NOT LOST, WHICH IS WHY THE TESTS COULD GO — VERIFIED BEFORE DELETING, not
// assumed. `turnings` (`client/src/items/paper-resources.js`) took `ItemKind.Swarf` on 2026-08-05 and
// carries the SAME argument in its own suite: `client/test/paper-resources.test.js` holds
// *"every turning is an OPEN curl — a closed one is a ring, and a ring is the SEAL SET"* (no `Z`, the
// ends apart, ≥12 segments so the spiral does not show its corners at 22 px) and, in
// `the five named silhouettes are owned by exactly one piece each`, pins `turnings` as the sole owner
// of "no filled body at all" as an EXCLUSION test. That is the same claim in the paper dialect, and
// stricter — the old pair was a floor on swarf, this one is an exclusion over all nine.
// ═════════════════════════════════════════════════════════════════════════════════════════════