// Tests for THE ALL-DECK FITTING SOURCE (client/src/ui/ship-fittings.js) — the substitution that
// made the side-elevation plate possible without a host change.
//
// ⛔ WHAT IS ACTUALLY AT STAKE. The Level-1 plate draws EVERY deck at once and the `frame` channel
// carries exactly ONE (`GameSession.RenderFrame` projects `_deck` alone). This module replaces the
// frame's glyphs with the `devices` + `items` channels, which carry the whole ship. If that
// substitution is not EXACT, the plate silently draws a different ship than the Room Zoom does — and
// "silently" is the operative word: every other test in the suite would stay green.
//
// So the load-bearing test in this file is an EQUIVALENCE, driven off a captured wire snapshot,
// tile-for-tile, in BOTH directions. The live rig (`client/tools/overview-plate-shot.mjs`) re-derives
// the same claim off the running wire so it cannot rot in a fixture nobody recaptures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decode, decodeDevices, decodeItems } from '../src/wire/messages.js';
import { itemIdForGlyphChar } from '../src/items/glyph-map.js';
import {
  NON_FURNITURE_CODES, itemForDeviceRow, itemIdForStockKind, DEVICE_KIND_NAMES,
} from '../src/ui/room-model.js';
import {
  deckFittings, fogTiles, slotUnsurveyed, surveyedDecks, FOG_CODE,
} from '../src/ui/ship-fittings.js';

const FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);
const devices = decodeDevices(decode(JSON.stringify(FIX.devices)));
const items = decodeItems(decode(JSON.stringify(FIX.items)));
const NON_FURNITURE = new Set(NON_FURNITURE_CODES);
const KIND = Object.freeze(Object.fromEntries(DEVICE_KIND_NAMES.map((nm, i) => [nm, i])));

/** What the FRAME's glyphs skin, tile by tile — the derivation the plate used before this module. */
function frameFittings(frame) {
  const out = new Map();
  const w = frame.w | 0, h = frame.h | 0;
  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      const cell = frame.cells[ty * w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0] | 0;
      if (NON_FURNITURE.has(code)) continue;
      const id = itemIdForGlyphChar(String.fromCharCode(code));
      if (id) out.set(tx + ',' + ty, id);
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE EQUIVALENCE — the whole argument for this module, driven.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐⭐ THE SUBSTITUTION IS EXACT: devices+items skin the SAME TILES with the SAME PIECES as the '
  + 'frame\'s glyphs, in both directions', () => {
  // ⚠️ AGAINST THE **BOOT** FRAME, NOT `frameDeck1`, AND THE FIXTURE'S OWN `note` (3) SAYS WHY: the
  // channels were captured at boot and `frameDeck1` is a WORKING snapshot from later in a session,
  // so it carries 10 spoil-heaps the channels predate. That asymmetry is measured and recorded there
  // — an older channel snapshot can LACK a stack a newer frame has; it can never INVENT one — and
  // driving this test against the incoherent pair would be measuring the fixture, not the module.
  const frame = FIX.frame;
  const deck = frame.deck | 0;
  const fromFrame = frameFittings(frame);
  const fromChannels = deckFittings(devices, items, deck);

  // NON-VACUITY FIRST, and by NAME: two empty maps are trivially equal, and that is exactly what a
  // broken decoder or a mis-keyed fixture would produce.
  assert.ok(fromFrame.size >= 40,
    `the frame skins only ${fromFrame.size} tiles — the equivalence below would be about nothing`);
  assert.ok(fromChannels.size >= 40,
    `the channels skin only ${fromChannels.size} tiles — the equivalence below would be about nothing`);

  const onlyFrame = [...fromFrame.keys()].filter((k) => !fromChannels.has(k));
  const onlyChannels = [...fromChannels.keys()].filter((k) => !fromFrame.has(k));
  const different = [...fromFrame.keys()]
    .filter((k) => fromChannels.has(k) && fromChannels.get(k).itemId !== fromFrame.get(k));

  assert.deepEqual(onlyFrame.slice(0, 10).map((k) => `${k}=${fromFrame.get(k)}`), [],
    'A TILE THE FRAME FURNISHES IS EMPTY ON THE PLATE. Every one of these is a piece the Level-2 Room '
    + 'Zoom draws and the Level-1 plate does not — the two surfaces have come to show different ships.');
  assert.deepEqual(onlyChannels.slice(0, 10).map((k) => `${k}=${fromChannels.get(k).itemId}`), [],
    'THE PLATE FURNISHES A TILE THE PROJECTION LEAVES EMPTY. This is the dangerous direction: the '
    + 'channels are fog-gated in the host, so an extra tile here means the gate has been lost and the '
    + 'plate is showing the player something the ship has not explored.');
  assert.deepEqual(different.slice(0, 10)
    .map((k) => `${k}: frame=${fromFrame.get(k)} channels=${fromChannels.get(k).itemId}`), [],
  'the same tile draws a DIFFERENT PIECE on the two routes');
  assert.equal(fromFrame.size, fromChannels.size);
});

test('the equivalence holds PER DECK, not merely in total', () => {
  // A total that matches while the per-deck split does not is exactly the shape a deck-index bug
  // produces, and it is invisible to the test above.
  const byDeck = new Map();
  for (const d of devices) byDeck.set(d.deck | 0, (byDeck.get(d.deck | 0) || 0) + 1);
  assert.ok(byDeck.size >= 2, 'the fixture carries devices on one deck — this test is vacuous');
  for (const [deck, n] of byDeck) {
    const f = deckFittings(devices, items, deck);
    assert.ok(f.size > 0, `deck ${deck} has ${n} device rows and skins nothing`);
    // and NOTHING from another deck leaked in: every key must be a tile carrying a row on THIS deck.
    for (const key of f.keys()) {
      const [x, y] = key.split(',').map(Number);
      const here = devices.some((d) => (d.deck | 0) === deck && d.x === x && d.y === y)
        || items.some((i) => (i.deck | 0) === deck && i.x === x && i.y === y);
      assert.ok(here, `deck ${deck} furnished tile ${key}, which carries no row on that deck`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE PRECEDENCE, THE WEAR BYTE, AND THE TOLERANCES
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('a DEVICE wins a tile over a GROUND STACK — the sim\'s own pass order', () => {
  // `GlyphMapper` runs pass 3 (items) before pass 4 (devices), so a device is what the projection
  // draws on a tile carrying both. Reversing it here would make the two surfaces disagree about one
  // tile, which is precisely the class of drift this module exists inside.
  const dev = [{ x: 4, y: 4, deck: 0, kind: KIND.Scrubber, cond: 200, oper: 1, open: 0 }];
  const it = [{ x: 4, y: 4, deck: 0, kind: 3, count: 9 }];   // ItemKind 3 → tuber-crate
  const both = deckFittings(dev, it, 0).get('4,4');
  assert.ok(both, 'the tile is furnished by NEITHER channel — the precedence has no subject');
  assert.equal(deckFittings(dev, it, 0).size, 1);
  assert.equal(both.itemId, itemForDeviceRow(dev[0]));
  assert.equal(both.ground, false);
  // NON-VACUITY: the stack really does skin something on its own, so "the device won" is not "the
  // stack was unskinnable".
  const alone = deckFittings(null, it, 0).get('4,4');
  assert.ok(alone, 'the ground stack draws nothing on its own');
  assert.equal(alone.itemId, itemIdForStockKind(3));
  assert.equal(alone.ground, true);
});

test('the WEAR BYTE rides through — a device carries its `cond`, a ground stack carries none', () => {
  // `cond` is the wear join's input; `items/wear.js` is the ONE place that turns it into a
  // post-raid twin, for both surfaces. A source that dropped it would make every machine on the
  // plate draw intact no matter how wrecked, silently.
  // ⚠️ EVERY LOOKUP IS PRESENCE-CHECKED FIRST (TRAPS #3). A mutation that deletes the device arm
  // makes `.get(...)` return undefined, and reading `.cond` off it is a TypeError — a CRASH wearing
  // the costume of a semantic RED. The mutation battery flagged exactly that on M10.
  const dev = [{ x: 1, y: 1, deck: 0, kind: KIND.Scrubber, cond: 12, oper: 0, open: 0 }];
  const machine = deckFittings(dev, null, 0).get('1,1');
  assert.ok(machine, 'the device arm drew nothing at all — the wear byte cannot ride a piece that '
    + 'is not there, and every machine on the plate would be missing before it was un-worn');
  assert.equal(machine.cond, 12);
  const stack = deckFittings(null, [{ x: 2, y: 2, deck: 0, kind: 3, count: 1 }], 0).get('2,2');
  assert.ok(stack, 'the items arm drew nothing at all');
  assert.equal(stack.cond, undefined,
    'a ground stack invented a condition — `buildTileItem` would treat 0 as destroyed');
});

test('the OPEN bit chooses the state piece, and an unskinnable kind draws nothing', () => {
  const shut = deckFittings([{ x: 0, y: 0, deck: 0, kind: KIND.CryoPod, cond: 255, oper: 1, open: 0 }], null, 0).get('0,0');
  const open = deckFittings([{ x: 0, y: 0, deck: 0, kind: KIND.CryoPod, cond: 255, oper: 1, open: 1 }], null, 0).get('0,0');
  assert.ok(shut && open, 'a capsule on the channel drew nothing — the device arm is gone');
  assert.ok(shut.itemId && open.itemId);
  assert.notEqual(shut.itemId, open.itemId,
    'an OPEN and a SHUT capsule resolve to the same piece — every cycled pod reads as sealed');
  // A kind nothing skins, and a byte from a newer host: neither draws, neither throws.
  assert.equal(deckFittings([{ x: 0, y: 0, deck: 0, kind: 250, cond: 255, oper: 1, open: 0 }], null, 0).size, 0);
  assert.equal(deckFittings(null, [{ x: 0, y: 0, deck: 0, kind: 250, count: 1 }], 0).size, 0);
});

test('hostile and absent input is tolerated without throwing', () => {
  for (const bad of [null, undefined, 'x', 42, {}]) {
    assert.equal(deckFittings(/** @type {any} */ (bad), /** @type {any} */ (bad), 0).size, 0);
  }
  assert.equal(deckFittings([null, undefined, {}], [null], 0).size, 0);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE ONE PIECE OF ART THE SUBSTITUTION COSTS — pinned by name, in both directions.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⛔ the LOCKED DOOR is the only art the channels cannot reach, and it is named', () => {
  // `GlyphMapper.DeviceGlyph` returns `Glyphs.DoorLocked` (`'X'`) for a `DeviceKind.Door` whose
  // `IsLocked` is set — and `IsLocked` is NOT on the `devices` channel, by a decision with a written
  // reason (`hosts/web/WireFormat.Devices.cs`'s "WHAT IS DELIBERATELY LEFT OUT" list). So the plate
  // draws a locked door as an ordinary one. THE COST IS SMALL AND IT IS NOT NOTHING: a locked door is
  // a fact about a ROUTE, and Level 1 is where a player looks for routes.
  const shut = deckFittings([{ x: 0, y: 0, deck: 0, kind: KIND.Door, cond: 255, oper: 1, open: 0 }], null, 0).get('0,0');
  assert.ok(shut, 'a door on the channel drew nothing at all — the device arm is gone, which is a '
    + 'bigger loss than the one this test is about');
  assert.equal(shut.itemId, 'door-sliding',
    'a shut door no longer draws the sliding leaf — the loss would be total rather than partial');
  assert.equal(itemIdForGlyphChar('X'), 'door-blast',
    'the LOCKED-door glyph no longer skins the blast door — the Room Zoom lost it too');
  assert.notEqual(shut.itemId, 'door-blast',
    'the channel can suddenly express LOCKED — delete this test and the paragraph in '
    + 'ship-fittings.js that files the limit');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. FOG — the one thing the frame still owns.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('fogTiles reads the FRAME, answers for ONE deck, and NULL is not an empty set', () => {
  const w = 3, h = 2;
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];   // '.' floor, explored
  cells[0] = [FOG_CODE, 0, 0, 0];                                       // a fogged tile
  cells[4] = null;                                                      // an absent tuple
  const frame = { deck: 2, w, h, cells };
  const fog = fogTiles(frame, 2);
  assert.deepEqual([...fog].sort(), ['0,0', '1,1']);

  // ⛔ NULL FOR A DECK WITH NO FRAME, AND IT IS DELIBERATELY NOT AN EMPTY SET. "the client cannot
  // answer" and "nothing here is fogged" are different facts, and rendering the first as the second
  // is how a surface comes to claim knowledge it does not have.
  assert.equal(fogTiles(frame, 3), null, 'another deck answered the fog question from this frame');
  assert.equal(fogTiles(null, 2), null);
  assert.equal(fogTiles({ deck: 2, w: 1, h: 1, cells: 'x' }, 2), null);
  assert.equal(surveyedDecks(frame)[0], 2);
  assert.deepEqual(surveyedDecks(null), []);
});

test('a compartment is UNSURVEYED only when EVERY tile of it is fogged', () => {
  // ⛔ "EVERY", NOT "ANY", and the difference is information. A compartment the crew has walked half
  // of is a compartment the player has seen; hatching it out would DELETE what the ship already
  // knows. The design's hatched cross-box is for the hold nobody has opened.
  const rect = { x: 0, y: 0, w: 2, h: 2 };
  const all = new Set(['0,0', '1,0', '0,1', '1,1']);
  assert.equal(slotUnsurveyed(all, rect), true);
  for (const seen of [...all]) {
    const partial = new Set([...all].filter((k) => k !== seen));
    assert.equal(slotUnsurveyed(partial, rect), false,
      `a compartment with ${seen} explored still reported as unsurveyed`);
  }
  // NULL (no frame for this deck) must never render as "unexplored".
  assert.equal(slotUnsurveyed(null, rect), false);
  assert.equal(slotUnsurveyed(new Set(), rect), false);
  assert.equal(slotUnsurveyed(all, null), false);
  assert.equal(slotUnsurveyed(all, { x: 0, y: 0, w: 0, h: 0 }), false);
});

test('⚠️ THE CAPTURED SHIP HAS FOG BUT NO WHOLLY-UNSURVEYED COMPARTMENT — measured, and stated', () => {
  // ⚠️ THE FIRST DRAFT OF THIS TEST ASSERTED `fog.size === 0` AND WAS WRONG, which is worth keeping
  // because it is the shape of the mistake: it was written from the WRECK measurement (all sixteen
  // compartments read `fogged 0/96`) and applied to the GRID fixture without re-measuring. The grid
  // capture carries 14 fogged tiles.
  //
  // What is TRUE of both ships is the thing that matters to the drawing: no compartment is fogged
  // END TO END, so the design's hatched cross-box does not fire on either. That is why the
  // unsurveyed treatment's only instrument is a synthetic fixture, and writing it down here is what
  // stops a later lane reading a live screenshot without a hatch as evidence that the hatch works.
  const fog = fogTiles(FIX.frame, FIX.frame.deck | 0);
  assert.ok(fog instanceof Set);
  assert.equal(fog.size, 14,
    'the captured ship\'s fog census has moved — re-derive it and re-check the claim below');
  const slots = FIX.decks.decks.find((d) => (d.deck | 0) === (FIX.frame.deck | 0)).slots;
  const dark = slots.filter((sl) => slotUnsurveyed(fog, { x: sl[1], y: sl[2], w: sl[3], h: sl[4] }));
  assert.deepEqual(dark.map((sl) => sl[5]), [],
    'a compartment on the captured ship IS wholly unsurveyed — the hatch is now reachable from live '
    + 'data and the composer test should stop relying on a synthetic fixture for it');
  // NON-VACUITY: the predicate can say TRUE, on this very fixture's geometry.
  const sl0 = slots[0];
  const rect = { x: sl0[1], y: sl0[2], w: sl0[3], h: sl0[4] };
  const allDark = new Set();
  for (let ty = rect.y; ty < rect.y + rect.h; ty += 1) {
    for (let tx = rect.x; tx < rect.x + rect.w; tx += 1) allDark.add(tx + ',' + ty);
  }
  assert.equal(slotUnsurveyed(allDark, rect), true, 'the predicate cannot say TRUE at all');
});
