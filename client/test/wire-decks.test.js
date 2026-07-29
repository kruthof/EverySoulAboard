// Wire tests for the three warm-SVG view channels: `decks`, `rooms`, `decor` (wire-channels spec).
// Pure — no DOM, no GPU. Proves: decode() round-trips the exact host JSON shapes; the tolerant
// decoders drop malformed tuples/messages and NEVER throw; and decks-model.js derives the material,
// UPPERCASE label, occupancy and per-anchor atmosphere correctly, including the unknown-roomType
// fallback and the empty-hall (blank name + occupied:false + null atmos) case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  decode, decodeDecks, decodeRooms, decodeDecor, decodeSlot, decodeRoom,
} from '../src/wire/messages.js';
import {
  decksView, deckSlotView, roomLabel, atmosByAnchor, ROOM_LABEL_BY_ID,
} from '../src/ui/decks-model.js';
import { roomMaterial, ROOM_MATERIAL_FALLBACK } from '../src/theme/warm-tokens.js';

// Byte-for-byte the host's WireFormat output (hosts/web/WireFormat.cs): a furnished LifeSupport slot
// (roomType 15), an empty hall (roomType 0, blank anchor, unoccupied), one deck active.
const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":1,"slots":[' +
  '[0,4,6,12,8,"lifesupport",15,true,true],' +
  '[3,34,6,12,8,"",0,false,true]]}]}';

const ROOMS_JSON =
  '{"type":"rooms","rooms":[' +
  '["lifesupport",1,0.209,512,101.3,293,96],' +
  '["hydro",1,0.188,16677,58.1,288.4,40]]}';

const DECOR_JSON = '{"type":"decor","items":[[1,12,7,"rug",0,0],[1,15,6,"bookshelf",90,2]]}';

test('decode() passes the three channel messages through by type', () => {
  assert.equal(decode(DECKS_JSON).type, 'decks');
  assert.equal(decode(ROOMS_JSON).type, 'rooms');
  assert.equal(decode(DECOR_JSON).type, 'decor');
});

test('decodeDecks round-trips slot tuples into objects', () => {
  const decks = decodeDecks(decode(DECKS_JSON));
  assert.equal(decks.length, 1);
  assert.equal(decks[0].deck, 1);
  assert.equal(decks[0].slots.length, 2);
  const s0 = decks[0].slots[0];
  assert.deepEqual(s0, {
    slotIndex: 0, x: 4, y: 6, w: 12, h: 8,
    anchorName: 'lifesupport', roomType: 15, occupied: true, active: true,
  });
  const s1 = decks[0].slots[1];
  assert.equal(s1.anchorName, '');       // empty hall → blank name
  assert.equal(s1.occupied, false);
  assert.equal(s1.roomType, 0);
});

test('decodeRooms round-trips room tuples with raw numeric atmos', () => {
  const rooms = decodeRooms(decode(ROOMS_JSON));
  assert.equal(rooms.length, 2);
  assert.deepEqual(rooms[0], {
    anchorName: 'lifesupport', deck: 1, o2: 0.209, co2ppm: 512, pressureKPa: 101.3, tempK: 293, tileCount: 96,
  });
  assert.equal(rooms[1].co2ppm, 16677); // raw ppm, no client formatting on the wire
});

test('decodeDecor round-trips placement tuples', () => {
  const decor = decodeDecor(decode(DECOR_JSON));
  assert.equal(decor.length, 2);
  assert.deepEqual(decor[0], { deck: 1, x: 12, y: 7, itemId: 'rug', yawDeg: 0, variant: 0 });
  assert.equal(decor[1].itemId, 'bookshelf');
  assert.equal(decor[1].variant, 2);
});

test('an empty decor channel decodes to an empty array (snapshot-replay of nothing)', () => {
  assert.deepEqual(decodeDecor(decode('{"type":"decor","items":[]}')), []);
});

test('malformed messages decode to null, never throwing', () => {
  assert.equal(decodeDecks(null), null);
  assert.equal(decodeDecks({ type: 'rooms' }), null);          // wrong type
  assert.equal(decodeDecks({ type: 'decks', decks: 'x' }), null); // decks not an array
  assert.equal(decodeRooms({ type: 'decks', rooms: [] }), null);  // wrong type
  assert.equal(decodeRooms(undefined), null);
  assert.equal(decodeDecor({ type: 'decor' }), null);          // items missing
  assert.equal(decode('not json'), null);
  assert.equal(decode('{"no":"type"}'), null);
});

test('malformed tuples are dropped, not thrown', () => {
  // A short slot tuple, a non-array, and a deck missing `slots` are all skipped.
  const decks = decodeDecks({
    type: 'decks',
    decks: [
      { deck: 0, slots: [[0, 1, 2, 3, 4, 'a', 5, true], 'garbage', [1, 2, 3, 4, 5, 6, 'x', 7, false, true]] },
      { deck: 1 }, // no slots array → dropped
      null,        // dropped
    ],
  });
  assert.equal(decks.length, 1);
  assert.equal(decks[0].slots.length, 1); // only the well-formed 9-element tuple survives
  assert.equal(decks[0].slots[0].slotIndex, 1);

  // Rooms: a short tuple and a non-string anchor are dropped.
  const rooms = decodeRooms({ type: 'rooms', rooms: [['a', 0, 0.2, 500, 100, 293], [1, 2, 3, 4, 5, 6, 7]] });
  assert.equal(rooms.length, 0);

  // Decor: a short tuple and a non-string itemId are dropped.
  const decor = decodeDecor({ type: 'decor', items: [[1, 2, 3], [1, 2, 3, 4, 5, 6]] });
  assert.equal(decor.length, 0);
});

test('decodeSlot / decodeRoom return null on malformed, object on valid', () => {
  assert.equal(decodeSlot([0, 1, 2]), null);
  assert.equal(decodeSlot('x'), null);
  assert.equal(decodeRoom([1, 2, 3, 4, 5, 6, 7]), null); // anchor must be a string
  assert.ok(decodeSlot([0, 1, 2, 3, 4, 'a', 5, true, false]));
  assert.ok(decodeRoom(['a', 0, 0.2, 500, 100, 293, 10]));
});

// ---- decks-model derivations ----

test('roomLabel maps ids and names to UPPERCASE labels; None/unknown → ""', () => {
  assert.equal(roomLabel(15), 'LIFE SUPPORT');
  assert.equal(roomLabel(5), 'QUARTERS');
  assert.equal(roomLabel('Hydro'), 'HYDROPONICS');
  assert.equal(roomLabel(0), '');        // None
  assert.equal(roomLabel(999), '');      // out of range
  assert.equal(roomLabel(null), '');
  assert.equal(ROOM_LABEL_BY_ID[7], 'HYDROPONICS');
});

test('decksView derives material, label, occupancy and atmos by anchor', () => {
  const decks = decodeDecks(decode(DECKS_JSON));
  const rooms = decodeRooms(decode(ROOMS_JSON));
  const view = decksView(decks, rooms);

  assert.equal(view.length, 1);
  const [furnished, hall] = view[0].slots;

  // Furnished LifeSupport slot: steel-tan material, LIFE SUPPORT label, occupied, atmos joined.
  const lsMat = roomMaterial(15);
  assert.equal(furnished.material, lsMat.material);
  assert.equal(furnished.floor, lsMat.floor);
  assert.equal(furnished.labelColor, lsMat.label);
  assert.equal(furnished.displayName, 'LIFE SUPPORT');
  assert.equal(furnished.occupied, true);
  assert.equal(furnished.active, true);
  assert.deepEqual(furnished.rect, { x: 4, y: 6, w: 12, h: 8 });
  assert.deepEqual(furnished.atmos, { o2: 0.209, co2ppm: 512, pressureKPa: 101.3, tempK: 293 });

  // Empty hall: blank name, unoccupied, no atmos row → null. Still on an active deck.
  assert.equal(hall.displayName, '');
  assert.equal(hall.anchorName, '');
  assert.equal(hall.occupied, false);
  assert.equal(hall.active, true);
  assert.equal(hall.atmos, null);
});

test('unknown roomType falls back to the neutral material and a blank label', () => {
  const v = deckSlotView(
    { slotIndex: 2, x: 0, y: 0, w: 5, h: 5, anchorName: 'weird', roomType: 42, occupied: true, active: true },
    new Map(),
  );
  assert.equal(v.material, ROOM_MATERIAL_FALLBACK.material);
  assert.equal(v.floor, ROOM_MATERIAL_FALLBACK.floor);
  assert.equal(v.displayName, 'weird'); // no label for 42 → anchor-name fallback
  assert.equal(v.atmos, null);          // empty atmos map
});

test('atmosByAnchor skips blank/missing anchors and indexes the rest', () => {
  const map = atmosByAnchor([
    { anchorName: 'a', o2: 0.2, co2ppm: 1, pressureKPa: 2, tempK: 3, tileCount: 4, deck: 0 },
    { anchorName: '', o2: 0, co2ppm: 0, pressureKPa: 0, tempK: 0, tileCount: 0, deck: 0 },
    null,
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get('a').co2ppm, 1);
});

test('decksView is tolerant of null / garbage inputs', () => {
  assert.deepEqual(decksView(null, null), []);
  assert.deepEqual(decksView('x', 'y'), []);
  assert.deepEqual(decksView([{ deck: 0 }], null), []); // deck missing slots → skipped
});

// ---------------------------------------------------------------------------------------------
// WP-1: the grid ship's LIVE WRECK must have a player-facing label. Driven by the real captured
// wire snapshot, not a hand-built tuple, because the defect this pins was invisible in a hand-built
// one: `displayName` is `roomLabel(roomType) || anchorName`, so ANY pressurised slot left at
// RoomType.None renders as a room labelled with its own internal anchor id. The grid ship's live
// wreck is pressurised at boot (it is the compartment the crew are already digging), and in this
// package's first draft it was RoomType.None — so the one standard play ship showed "hall_d1_s6" in
// an UPPERCASE-label UI. Authoring it as a typed room is the fix; this is the tripwire.
// (⚠️ W4b retracted the parenthetical that used to end that sentence — "and could never be
// commissioned out of it either, because AddRoomCommand returns early on TotalMoles > 0". Both
// occupancy and the command's rejection predicate now read the ANCHOR's type rather than the room's
// gas, so a slot is un-commissionable precisely because it is already typed.)

const GRID_FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);

test('WP-1: every OCCUPIED slot on the grid ship has a real label, never an internal anchor id', () => {
  const view = decksView(
    decodeDecks(decode(JSON.stringify(GRID_FIX.decks))),
    decodeRooms(decode(JSON.stringify(GRID_FIX.rooms))),
  );

  for (const deck of view) {
    for (const s of deck.slots) {
      if (!s.occupied) continue;
      assert.ok(s.displayName, `deck ${deck.deck} slot ${s.slotIndex} is occupied with no label at all`);
      assert.ok(
        !/^hall_d\d+_s\d+$/.test(s.displayName),
        `deck ${deck.deck} slot ${s.slotIndex} renders as the internal id "${s.displayName}" — an occupied `
        + 'slot draws as a ROOM with no ＋ADD ROOM chip, so RoomType.None leaks the anchor name to the player',
      );
      assert.equal(s.displayName, s.displayName.toUpperCase(),
        `deck ${deck.deck} slot ${s.slotIndex} label "${s.displayName}" is not the UPPERCASE form the UI uses`);
    }
  }

  // And specifically the live wreck: deck 1 slot 6, occupied, Storage, labelled.
  const wreck = view.find((d) => d.deck === 1).slots.find((s) => s.slotIndex === 6);
  assert.equal(wreck.occupied, true, 'the live wreck boots pressurised, so the client reads it as occupied');
  assert.equal(wreck.displayName, 'STORAGE');
  assert.equal(wreck.anchorName, 'hold');
});

test('WP-1: the fixture carries a deck-1 frame with BOTH debris and designation fg bytes', () => {
  // WP-2's acceptance is "a designated tile renders differently from an undesignated one, asserted
  // on the fg byte". That needs one frame carrying GlyphColor.Debris (4) AND GlyphColor.Designate
  // (15). Neither exists anywhere on deck 0, so a deck-0-only fixture would force WP-2 to hand-craft
  // cells — the vacuous test the WP-1-before-WP-2 ordering exists to prevent.
  const f = GRID_FIX.frameDeck1;
  assert.ok(f && f.deck === 1, 'the fixture must carry a deck-1 frame');
  const fg = new Set(f.cells.map((c) => c[1]));
  assert.ok(fg.has(4), 'no GlyphColor.Debris (4) in the deck-1 frame');
  assert.ok(fg.has(15), 'no GlyphColor.Designate (15) in the deck-1 frame');
  const fg0 = new Set(GRID_FIX.frame.cells.map((c) => c[1]));
  assert.ok(!fg0.has(4) && !fg0.has(15), 'deck 0 has no wreck — if it does, this fixture is not what it says');
});
