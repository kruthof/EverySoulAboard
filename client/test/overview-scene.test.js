// Tests for the LEVEL-1 OVERVIEW SVG SCENE (client/src/ui/overview-scene.js). Pure — no DOM, no
// GPU. Driven by the captured wire snapshot client/test/fixtures/overview-grid.json so the scene
// is testable offline and deterministically. Proves: the scene builds from the fixture without
// throwing; it is deterministic (same state → byte-identical SVG); every OCCUPIED slot gets a glow
// and empty halls do NOT; on-deck crew are placed as pawns; furniture maps from frame glyphs; ids
// are collision-free; and unknown glyph / roomType degrade gracefully.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { overviewScene, makeTransform, starfield, DECK } from '../src/ui/overview-scene.js';

const FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);

// Re-derive the view exactly as the client would from the wire snapshot.
const decks = decodeDecks(decode(JSON.stringify(FIX.decks)));
const rooms = decodeRooms(decode(JSON.stringify(FIX.rooms)));
const view = decksView(decks, rooms);
const crew = FIX.roster.crew;
const frame = FIX.frame;

function baseState(over = {}) {
  return { deck: 0, decksView: view, frame, crew, designs: FIX.designs.cells, ...over };
}

// Count distinct id="…" attributes and total id occurrences (for collision-freedom).
function idStats(svg) {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  return { ids, unique: new Set(ids).size, total: ids.length };
}

test('the fixture carries the channels the scene needs', () => {
  assert.ok(FIX.frame && FIX.decks && FIX.rooms && FIX.roster && FIX.designs);
  assert.equal(view.length, 8);              // 8 decks
  assert.equal(view[0].slots.length, 8);     // 2×4 grid
  assert.equal(view[0].slots.filter((s) => s.occupied).length, 8); // deck 0 fully commissioned
});

test('the scene builds from the fixture without throwing and is a single <svg> document', () => {
  const svg = overviewScene(baseState());
  assert.match(svg, /^<svg class="pl-overview" viewBox="0 0 1300 561"/);
  assert.ok(svg.endsWith('</svg>'));
  assert.equal((svg.match(/<svg/g) || []).length, 1);
});

test('the scene is deterministic — same state yields a byte-identical SVG', () => {
  assert.equal(overviewScene(baseState()), overviewScene(baseState()));
  // and a fresh re-derivation of the view produces the same bytes
  const view2 = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), rooms);
  assert.equal(overviewScene(baseState({ decksView: view2 })), overviewScene(baseState()));
});

test('the starfield is the seeded 220 stars, deterministic across calls', () => {
  const a = starfield();
  const b = starfield();
  assert.equal(a.length, 220);
  assert.deepEqual(a, b);
  // sizes only ever 1/2/3 px, x/y in [0,100]
  for (const s of a) {
    assert.ok(s.s === 1 || s.s === 2 || s.s === 3);
    assert.ok(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100);
  }
});

test('every OCCUPIED slot gets a glow pool and empty halls do NOT (driven by `occupied`)', () => {
  // Deck 0: all 8 occupied → 8 glow gradients, 0 halls.
  const svg0 = overviewScene(baseState({ deck: 0 }));
  assert.equal((svg0.match(/id="ov-glow-\d+"/g) || []).length, 8);
  assert.equal((svg0.match(/class="pl-hall"/g) || []).length, 0);

  // Deck 1: 4 occupied rooms + 3 halls (and 1 spine-less grid: 8 slots, 5 occupied? verify live).
  const d1 = view.find((d) => d.deck === 1);
  const occ1 = d1.slots.filter((s) => s.occupied).length;
  const halls1 = d1.slots.filter((s) => !s.occupied).length;
  assert.ok(occ1 >= 1 && halls1 >= 1, 'deck 1 must mix rooms and halls to exercise both paths');
  const svg1 = overviewScene(baseState({ deck: 1, frame: null }));
  assert.equal((svg1.match(/id="ov-glow-\d+"/g) || []).length, occ1); // one glow per OCCUPIED slot
  assert.equal((svg1.match(/class="pl-hall"/g) || []).length, halls1); // halls render as halls
  assert.match(svg1, /＋ ADD ROOM/);                                    // hall build affordance
  // The glow layer carries mix-blend screen so it reads as light, not paint (VS-O-31).
  assert.match(svg1, /mix-blend-mode:screen/);
});

test('active-but-unoccupied halls draw NO glow — glow is `occupied`, never `active` (Phase-2b note)', () => {
  // Deck 1 is the decisive case: 4 halls whose deck-level `active` flag is TRUE. If the glow read
  // `active` (the shipped-review bug) they would each light; because it reads `occupied`, none do.
  const d1 = view.find((d) => d.deck === 1);
  const activeHalls = d1.slots.filter((s) => !s.occupied && s.active);
  assert.equal(activeHalls.length, 4);
  const svg1 = overviewScene(baseState({ deck: 1, frame: null }));
  assert.equal((svg1.match(/id="ov-glow-\d+"/g) || []).length, d1.slots.filter((s) => s.occupied).length);

  // And a fully-empty, inactive deck draws no glow and 8 halls.
  const svg7 = overviewScene(baseState({ deck: 7, frame: null, crew: [] }));
  assert.equal((svg7.match(/id="ov-glow-\d+"/g) || []).length, 0);
  assert.equal((svg7.match(/class="pl-hall"/g) || []).length, 8);
});

test('on-deck crew are placed as pawns; off-deck crew are not', () => {
  const svg = overviewScene(baseState({ deck: 0 }));
  const onDeck = crew.filter((c) => c.deck === 0);
  assert.ok(onDeck.length >= 1);
  assert.equal((svg.match(/class="pl-pawn"/g) || []).length, onDeck.length);
  for (const c of onDeck) assert.ok(svg.includes(`data-cid="${c.cid}"`));
  // surname tags render (uppercased last token)
  assert.match(svg, /HALLORAN|VEGA|SATO/);
  // a deck with no crew on it → no pawns
  const svg7 = overviewScene(baseState({ deck: 7, frame: null }));
  assert.equal((svg7.match(/class="pl-pawn"/g) || []).length, 0);
});

test('the selected crew gets a selection glow + amber tag; others do not', () => {
  const cid = crew[0].cid;
  const svg = overviewScene(baseState({ deck: 0, selectedCid: cid }));
  assert.ok(svg.includes(`id="ov-sel-${cid}"`));               // selection glow gradient present
  assert.equal((svg.match(/id="ov-sel-/g) || []).length, 1);   // exactly the one selected
  // no selection → no selection glow at all
  const svgNone = overviewScene(baseState({ deck: 0 }));
  assert.equal((svgNone.match(/id="ov-sel-/g) || []).length, 0);
});

test('furniture maps from frame glyphs via SPRITE_FOR_GLYPH → item builder', () => {
  const svg = overviewScene(baseState({ deck: 0 }));
  assert.match(svg, /class="pl-furniture"/);
  // the grid deck's frame has scrubbers/beds/tables/etc — several pl-item groups must appear
  assert.ok((svg.match(/class="pl-item"/g) || []).length >= 5);
  // furniture only renders when the frame is for THIS deck
  const svgNoFrame = overviewScene(baseState({ deck: 0, frame: null }));
  assert.equal((svgNoFrame.match(/class="pl-furniture"/g) || []).length, 0);
  // a frame for a DIFFERENT deck than the one being drawn contributes no furniture
  const svgMismatch = overviewScene(baseState({ deck: 1, frame }));
  assert.equal((svgMismatch.match(/class="pl-furniture"/g) || []).length, 0);
});

test('all element ids are collision-free across the single SVG document', () => {
  const svg = overviewScene(baseState({ deck: 0, selectedCid: crew[0].cid }));
  const { unique, total } = idStats(svg);
  assert.equal(unique, total, 'duplicate id in the SVG doc — a namespacing collision');
  // two scenes with distinct idPrefix never share an id
  const a = idStats(overviewScene(baseState({ deck: 0, idPrefix: 'A' }))).ids;
  const b = idStats(overviewScene(baseState({ deck: 0, idPrefix: 'B' }))).ids;
  assert.equal(a.filter((x) => b.includes(x)).length, 0);
});

test('unknown roomType and unknown glyphs degrade gracefully (no throw, no furniture)', () => {
  // Slot with an out-of-range roomType → neutral material, blank label falls back to anchor.
  const weird = {
    deck: 3,
    slots: [{
      slotIndex: 0, rect: { x: 0, y: 0, w: 12, h: 8 }, roomType: 99, anchorName: 'weird',
      material: 'steel-tan', floor: '#9c8763', line: 'rgba(0,0,0,.16)', labelColor: 'rgba(43,36,28,.72)',
      trim: 'rgba(232,147,74,.5)', displayName: 'weird', occupied: true, active: true, atmos: null,
    }],
  };
  const svg = overviewScene({ deck: 3, decksView: [weird], frame: null, crew: [] });
  assert.match(svg, /weird/);
  assert.equal((svg.match(/id="ov-glow-0"/g) || []).length, 1); // still gets its glow

  // A frame full of glyphs NOT in SPRITE_FOR_GLYPH (e.g. '"','T','f') yields no furniture, no throw.
  const junkFrame = { deck: 0, w: 2, h: 1, lens: 'none', cells: [[34, 0, 0, 0], [84, 0, 0, 0]] };
  const svg2 = overviewScene({ deck: 0, decksView: view, frame: junkFrame, crew: [] });
  assert.equal((svg2.match(/class="pl-furniture"/g) || []).length, 0);
});

test('the scene tolerates missing / empty state without throwing', () => {
  assert.doesNotThrow(() => overviewScene(undefined));
  assert.doesNotThrow(() => overviewScene({}));
  assert.doesNotThrow(() => overviewScene({ deck: 0, decksView: [] }));
  const svg = overviewScene({ deck: 0, decksView: [] });
  assert.match(svg, /class="pl-overview"/); // still a valid empty-deck scene (hull + space only)
});

test('the coordinate transform is the shared contract: project ∘ invert is identity', () => {
  const slots = view[0].slots;
  const t = makeTransform(slots, frame);
  // a slot rect projects into the deck-floor envelope
  const r = t.rect(slots[0].rect);
  assert.ok(r.x >= DECK.x - 1 && r.x <= DECK.x + DECK.w);
  assert.ok(r.y >= DECK.y - 1 && r.y <= DECK.y + DECK.h);
  // round-trip a handful of tile coords through project → invert
  for (const [tx, ty] of [[0, 0], [8, 8], [22.5, 4.5], [44, 17]]) {
    const [sx, sy] = t.project(tx, ty);
    const [bx, by] = t.invert(sx, sy);
    assert.ok(Math.abs(bx - tx) < 1e-6 && Math.abs(by - ty) < 1e-6);
  }
});
