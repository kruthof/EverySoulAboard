// Tests for the PURE Overview view-model (client/src/ui/overview-model.js). No DOM, no GPU. Proves:
// the click→action classification honours the single disambiguation rule, the lens grade + tint
// mapping is honest (no fabricated water/power atmos), the selected→current-room join, the deck-rail
// pip list + delta, the Escape rung reducer (every rung incl. the added Level-2 ascent), the atmos
// formatters, and the tile projection round-trips through the real scene transform.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { makeTransform } from '../src/ui/overview-scene.js';
import {
  tileAt, overviewClickAction, lensGrade, lensSlotTint, GRADE_TINT, currentRoom,
  deckPips, deckDelta, overviewEscape, fmtO2, fmtCo2, fmtTemp, powerLabel,
} from '../src/ui/overview-model.js';

const FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);
const decks = decodeDecks(decode(JSON.stringify(FIX.decks)));
const rooms = decodeRooms(decode(JSON.stringify(FIX.rooms)));
const view = decksView(decks, rooms);
const frame = FIX.frame;

// ---- click classification (IX-O-11/12/13/15/19) ----

test('an armed build tool classifies as a placement regardless of what was hit', () => {
  for (const tool of ['wall', 'door', 'cancel']) {
    assert.deepEqual(overviewClickAction(tool, { pawnCid: 5 }), { type: 'build' });
    assert.deepEqual(overviewClickAction(tool, { roomAnchor: 'reactor' }), { type: 'build' });
  }
});

test('the move order classifies as a move target over any hit', () => {
  assert.deepEqual(overviewClickAction('move', { roomAnchor: 'mess' }), { type: 'move' });
});

test('with no tool: pawn > terminal > add-room > room > space (the single disambiguation rule)', () => {
  assert.deepEqual(overviewClickAction(null, { pawnCid: 42, roomAnchor: 'mess' }),
    { type: 'select', cid: 42 });
  assert.deepEqual(overviewClickAction(null, { addRoomSlot: 3 }), { type: 'addroom', slot: 3 });
  assert.deepEqual(overviewClickAction(null, { roomAnchor: 'reactor' }),
    { type: 'enterRoom', anchor: 'reactor' });
  assert.deepEqual(overviewClickAction(null, { hallSlot: 2 }), { type: 'none' });
  assert.deepEqual(overviewClickAction(null, {}), { type: 'none' });
});

test('a MOSS terminal hit classifies as `terminal` (opens MOSS); pawn wins, terminal beats the room', () => {
  // a bare terminal → open its MOSS program
  assert.deepEqual(overviewClickAction(null, { terminalId: 'con-3' }), { type: 'terminal', tid: 'con-3' });
  // a crew member standing ON a console still selects as a pawn (pawns sit on top)
  assert.deepEqual(overviewClickAction(null, { pawnCid: 7, terminalId: 'con-3' }),
    { type: 'select', cid: 7 });
  // the terminal beats the room it sits in (you want MOSS, not room-zoom)
  assert.deepEqual(overviewClickAction(null, { terminalId: 'con-3', roomAnchor: 'command' }),
    { type: 'terminal', tid: 'con-3' });
  // an armed build tool still wins over a terminal (placement is unconditional)
  assert.deepEqual(overviewClickAction('wall', { terminalId: 'con-3' }), { type: 'build' });
});

// ---- lens grade + tint (IX-O-29/30) ----

test('lensGrade grades oxygen / co2 / temperature / pressure honestly', () => {
  assert.equal(lensGrade('oxygen', { o2: 0.21 }), 'good');
  assert.equal(lensGrade('oxygen', { o2: 0.16 }), 'warn');
  assert.equal(lensGrade('oxygen', { o2: 0.10 }), 'bad');
  assert.equal(lensGrade('co2', { co2ppm: 400 }), 'good');
  assert.equal(lensGrade('co2', { co2ppm: 1500 }), 'warn');
  assert.equal(lensGrade('co2', { co2ppm: 16677 }), 'bad');
  assert.equal(lensGrade('temperature', { tempK: 295 }), 'good');
  assert.equal(lensGrade('temperature', { tempK: 275 }), 'cold');
  assert.equal(lensGrade('pressure', { pressureKPa: 101 }), 'good');
});

test('lensGrade never fabricates a reading it does not have', () => {
  assert.equal(lensGrade('none', { o2: 0.21 }), null);
  assert.equal(lensGrade('water', { o2: 0.21 }), null); // rooms carries no per-room H₂O
  assert.equal(lensGrade('power', { o2: 0.21 }), null); // power is a per-slot flag, not atmos
  assert.equal(lensGrade('oxygen', null), null);
});

test('lensSlotTint derives the power lens from the slot active flag', () => {
  assert.equal(lensSlotTint('power', { active: true }), GRADE_TINT.good);
  assert.equal(lensSlotTint('power', { active: false }), GRADE_TINT.bad);
  assert.equal(lensSlotTint('none', { active: true }), null);
  assert.equal(lensSlotTint('oxygen', { atmos: { o2: 0.21 } }), GRADE_TINT.good);
});

// ---- current-room join (VS-O-62/63) ----

test('currentRoom finds the bound room a crew tile falls in, else null', () => {
  const slots = view[0].slots;
  const occ = slots.find((s) => s.occupied);
  const inside = { x: occ.rect.x + 1, y: occ.rect.y + 1 };
  const r = currentRoom(inside, slots);
  assert.equal(r.anchorName, occ.anchorName);
  assert.equal(currentRoom({ x: -5, y: -5 }, slots), null);
  assert.equal(currentRoom(null, slots), null);
});

// ---- deck rail (VS-O-49/51 / IX-O-26) ----

test('deckPips lists every deck highest-first with the active one flagged', () => {
  const pips = deckPips(view, 0);
  assert.equal(pips.length, 8);
  assert.equal(pips[0].deck, 7);            // highest on top
  assert.equal(pips[pips.length - 1].deck, 0);
  assert.equal(pips.find((p) => p.active).deck, 0);
});

test('deckPips falls back to a single active pip before decks land', () => {
  assert.deepEqual(deckPips(null, 3), [{ deck: 3, active: true }]);
  assert.deepEqual(deckPips([], 2), [{ deck: 2, active: true }]);
});

test('deckDelta is the relative Cmd.deck step', () => {
  assert.equal(deckDelta(5, 2), 3);
  assert.equal(deckDelta(1, 4), -3);
});

// ---- Escape rung reducer (IX-O-35) ----

test('overviewEscape follows the rung order incl. the Level-2 ascent', () => {
  assert.equal(overviewEscape({ armed: true, dialogueOpen: true, mossActive: true }), 'disarm');
  assert.equal(overviewEscape({ armed: false, dialogueOpen: true, mossActive: true }), 'dialogue');
  assert.equal(overviewEscape({ armed: false, dialogueOpen: false, mossActive: true }), 'moss');
  assert.equal(overviewEscape({ relationsActive: true }), 'relations');
  assert.equal(overviewEscape({ roomZoomOpen: true }), 'ascend');
  assert.equal(overviewEscape({}), 'none');
  assert.equal(overviewEscape({ relationsActive: true, roomZoomOpen: true }), 'relations');
});

// ---- tile projection round-trip (IX-O-19) ----

test('tileAt inverts the scene transform back to a sim tile', () => {
  const t = makeTransform(view[0].slots, frame);
  const [sx, sy] = t.project(8 + 0.5, 8 + 0.5); // centre of tile (8,8)
  assert.deepEqual(tileAt(t, sx, sy, frame), { x: 8, y: 8 });
  // out of bounds → null
  const [ox, oy] = t.project(frame.w + 4, frame.h + 4);
  assert.equal(tileAt(t, ox, oy, frame), null);
  assert.equal(tileAt(null, 0, 0, frame), null);
});

// ---- atmos formatters (VS-O-63) ----

test('the atmos formatters are InvariantCulture-safe', () => {
  assert.equal(fmtO2(0.209), '21%');
  assert.equal(fmtCo2(16677.4), '16677 ppm');
  assert.equal(fmtTemp(293.15), '20°C');
  assert.equal(fmtTemp(288.4), '15°C');
  assert.equal(powerLabel(true), 'ON');
  assert.equal(powerLabel(false), 'OFF');
});
