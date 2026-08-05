// THE `items` CHANNEL — the client half.
//
// WHAT THIS FILE OWNS, in order of how badly it bites:
//   1. THE TUPLE CONTRACT. `[x, y, deck, kind, count]` is positional and there is NO COMPILER across
//      this seam. A host that swapped two elements would put every stack on the wrong tile, the wrong
//      deck, or report a count as a kind. The order is PARSED out of `hosts/web/WireFormat.Items.cs`
//      — both from the `ItemCell` constructor and from the emitter's own append chain — and compared
//      against what `decodeItems` actually reads, driven.
//   2. THE DECODER'S TOLERANCE, including the one place it deliberately DIVERGES from `decodeMarks`:
//      a kind this client does not know is KEPT, not dropped.
//   3. THE GROUND-STACK LAYER — what `roomItemTiles` aggregates, which kinds `itemStackSlots` gives
//      a slot to, that `itemStackSvg` draws the real registry PIECE, that it still draws the COUNT
//      (the one fact no projection byte could carry), and that neither can overflow its own tile
//      however large a count gets. The label plate this layer shipped with is now the NO-ART
//      fallback — MetalOre, and any kind byte from a newer host — and that branch is tested too.
//   4. THAT THE ROOM ZOOM DRAWS IT and that `main.js` dispatches the channel at all.
//
// (The DRIVEN acceptance — the real `roomzoom-view.js` controller over `dom-lite`, proving a stack on
// a DEVICE tile reaches the DOM and that the letter chip it replaces is gone — lives in
// `room-model.test.js`, where that harness already exists. Duplicating a 250-line DOM rig to keep
// this file self-contained would have been the worse trade.)
//
// EVERY SOURCE SCAN HERE READS CODE, NOT PROSE — `codeOnly` is IMPORTED from the shared
// `client/test/code-only.js` (CLAUDE.md traps §1: a guard matching raw source text is satisfied by
// the thing it guards against, COMMENTED OUT; that shipped four times in one day). Both directions
// are controlled at the bottom of this file: comments must not trip the scans, and real code must.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeItems } from '../src/wire/messages.js';
import {
  U, roomItemTiles, itemKindLabel, itemStackSlots, itemStackSvg, itemStackTileKeys,
  itemIdForStockKind,
} from '../src/ui/room-model.js';
import { ITEMS } from '../src/items/index.js';
import { STOCK_KINDS } from '../src/ui/stock-filter-model.js';
import { codeOnly } from './code-only.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

const WIRE_ITEMS_CS = codeOnly(read(join(REPO, 'hosts/web/WireFormat.Items.cs')));
const GAME_SESSION_CS = codeOnly(read(join(REPO, 'hosts/web/GameSession.cs')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));
const ROOMZOOM = codeOnly(read(join(CLIENT, 'src/ui/roomzoom-view.js')));

/** A room rect covering tiles [4..8) × [2..5) on deck 1 — the shape `roomTileRect` produces. */
const ROOM = { deck: 1, rx: 4, ry: 2, rw: 4, rh: 3 };

/** Build a host-shaped `items` message from `[x,y,deck,kind,count]` tuples. */
const msg = (cells) => ({ type: 'items', cells });

// ════════════════════════════════════════════════════════════ the cross-language tuple contract

// MUTATION: swap `.Append(c.Kind…)` and `.Append(c.Count…)` in WireFormat.Items.cs ⇒ this fails and
// names the file. MUTATION 2: reorder the `ItemCell` constructor parameters ⇒ same.
test('the wire tuple order is [x, y, deck, kind, count] on BOTH sides of the seam', () => {
  // (a) the emitter's own append chain, in source order.
  const emitted = [...WIRE_ITEMS_CS.matchAll(/\.Append\(c\.(\w+)\.ToString\(ItemIc\)\)/g)].map((m) => m[1]);
  assert.deepEqual(emitted, ['X', 'Y', 'Deck', 'Kind', 'Count'],
    'hosts/web/WireFormat.Items.cs no longer appends the tuple in the order this client reads it. '
    + 'The tuple is POSITIONAL — a swap puts every stack on the wrong tile or reports a count as a '
    + 'kind — and there is no compiler across this seam.');

  // (b) the struct constructor, which is what `GameSession.BuildItems` fills.
  const ctor = /ItemCell\(int (\w+), int (\w+), int (\w+), int (\w+), int (\w+)\)/.exec(WIRE_ITEMS_CS);
  assert.ok(ctor, 'the ItemCell constructor was not found — this parse has rotted and (a) alone '
    + 'cannot see a caller that fills the fields in the wrong order');
  assert.deepEqual(ctor.slice(1, 6), ['x', 'y', 'deck', 'kind', 'count']);

  // (c) …and the host really does fill it from the item's own position/kind/count, in that order.
  assert.match(GAME_SESSION_CS, /new WireFormat\.ItemCell\(p\.X, p\.Y, p\.Z, \(int\)item\.Kind, item\.Count\)/,
    'GameSession.BuildItems no longer fills ItemCell from (p.X, p.Y, p.Z, item.Kind, item.Count). '
    + 'The two halves above pin the wire SHAPE; this pins what is put into it.');

  // (d) the decoder reads the same positions. DRIVEN, not scanned.
  const [row] = decodeItems(msg([[11, 22, 3, 4, 55]]));
  assert.deepEqual(row, { x: 11, y: 22, deck: 3, kind: 4, count: 55 });
});

test('the channel really is called `items` on the host', () => {
  assert.ok(WIRE_ITEMS_CS.includes('\\"type\\":\\"items\\"'),
    'hosts/web/WireFormat.Items.cs no longer emits {"type":"items"} — `decodeItems` gates on that '
    + 'string and main.js switches on it, so a rename silently deletes the whole layer');
});

// ════════════════════════════════════════════════════════════════════════════ the decoder

test('decodeItems reads the tuple positionally and preserves the HOST order', () => {
  // Deliberately NOT sorted by tile, kind or count — a client-side sort would reorder this.
  const out = decodeItems(msg([[7, 1, 0, 8, 3], [2, 2, 0, 0, 90], [7, 1, 0, 3, 1]]));
  assert.deepEqual(out.map((r) => [r.x, r.y, r.deck, r.kind, r.count]),
    [[7, 1, 0, 8, 3], [2, 2, 0, 0, 90], [7, 1, 0, 3, 1]],
    'the client re-ordered the channel. The host emits entity-store order — the same order '
    + 'GlyphMapper pass 3 draws in — and a client sort is a second, silently divergent authority.');
});

test('decodeItems is tolerant: garbage in, null or a dropped row, never a throw', () => {
  assert.equal(decodeItems(null), null);
  assert.equal(decodeItems({ type: 'marks', cells: [] }), null, 'the wrong channel must not decode');
  assert.equal(decodeItems({ type: 'items' }), null, 'no cells array → null, not a throw');
  assert.deepEqual(decodeItems(msg([])), []);
  assert.deepEqual(decodeItems(msg([[1, 2, 0, 3], 'nope', null, [1, 2, 0, 3, 4]])).length, 1,
    'a short row, a string and a null must each be dropped, and the valid row must survive');
  assert.equal(decode('{"type":"items","cells":[[1,2,0,3,4]]}').type, 'items',
    'the generic line decoder must still parse an items payload');
});

// ⚠️ THE ONE DELIBERATE DIVERGENCE FROM `decodeMarks`, and it is worth a test of its own because the
// two decoders sit one screen apart and the next reader will assume they agree.
//
// MUTATION: add `if (!STOCK_KINDS.some(k => k.kind === kind)) continue;` to decodeItems ⇒ this fails.
test('a kind from a NEWER host is KEPT, unlike a mark of an unknown kind', () => {
  const rows = decodeItems(msg([[4, 2, 1, 99, 40]]));
  assert.equal(rows.length, 1,
    'an unknown ItemKind was dropped. On `marks` the kind IS the payload, so dropping is honest; '
    + 'here it is one of five facts — "40 of something on this tile" is still true, and dropping it '
    + 'draws an EMPTY tile over a full one, which is the exact invisibility this channel removes.');
  assert.equal(rows[0].count, 40, 'the count must survive an unknown kind — it is the useful part');
  assert.equal(itemKindLabel(99), '?', 'an unknown kind is rendered unnamed, not unnamed AND absent');
});

// ═══════════════════════════════════════════════════════════════════════ the label table

// ⚠️ THE MUTATION THIS COMMENT FIRST NAMED COULD NOT BITE THE ASSERTION IT NAMED, and the
// correction is kept rather than quietly swapped, because it is this repo's signature defect caught
// on itself. The first draft read: *"MUTATION: change `.slice(0, 4)` to `.slice(0, 3)` ⇒ the
// distinctness leg fails (SEA/SCR collide in spirit and CTR/COR read alike)"*. MEASURED, by
// physically applying it: at three characters the nine labels are REG ORE COR FOO SCR PAR CTR SEA
// ICE — **all still distinct**, so the distinctness assertion stays green. Five tests do go red, but
// every one of them on an ANCHORED LITERAL (`itemKindLabel(0) === 'REGO'`, `'REGO 40'`), not on the
// property the leg is named for. At two characters they are still distinct as well. So the label
// LENGTH is pinned by the anchors, and distinctness is pinned by the distinctness leg — two
// different guards, and conflating them is what the old comment did.
//
// MUTATION (verified RED on the distinctness leg itself): `.slice(0, 4)` → `.slice(0, 1)` in
// room-model.js ⇒ R O C F S P C S I, with C and S each twice.
test('every ItemKind has a DISTINCT short label, derived from the one enum mirror', () => {
  const labels = STOCK_KINDS.map((e) => itemKindLabel(e.kind));
  assert.equal(labels.length, STOCK_KINDS.length);
  assert.equal(new Set(labels).size, labels.length,
    'two ItemKinds share a plate label: ' + JSON.stringify(labels) + '. Two different piles would '
    + 'then read as the same thing on the floor. Lengthen the label or rename in stock-filter-model.js.');
  for (const l of labels) {
    assert.ok(l.length > 0 && l.length <= 4, 'a plate label must be 1-4 chars, saw ' + JSON.stringify(l));
    assert.ok(!/\s/.test(l), 'a plate label must not contain whitespace, saw ' + JSON.stringify(l));
  }
  // NON-VACUITY: the derivation really is reading STOCK_KINDS and not a private literal.
  assert.equal(itemKindLabel(0), 'REGO', 'ItemKind 0 is Regolith (label REGOLITH → REGO)');
  assert.equal(itemKindLabel(8), 'ICE', 'ItemKind 8 is Ice');
});

// ═════════════════════════════════════════════════════════════════════ roomItemTiles

// ⚠️ THE DECK TERM WAS UNGUARDED IN THE TEST NAMED AFTER IT, and the first version is described here
// rather than quietly replaced, because it is a shape that will recur on every per-tile channel.
//
// The old wrong-deck row was `[4, 2, 0, 0, 1]` — the SAME TILE `4,2` as the in-room row above it.
// `roomItemTiles` keys its map by `tx,ty`, so a wrong-deck row on an ALREADY-PRESENT tile folds into
// that tile's entry: it moves `stacks`, and it NEVER changes the tile list. The assertion mapped only
// `[t.tx, t.ty]`, so both variants returned `[[4,2],[7,4]]`. MEASURED in independent review: deleting
// the deck filter outright left 782/782 GREEN. The rect halves bit; the term the test is named after
// did not. Real harm: stock on decks 1-7 plating into a deck-0 room.
//
// THE FIX IS BOTH SHAPES AT ONCE, because they fail differently:
//   • a wrong-deck row on a tile NO in-room row occupies — caught by the TILE LIST;
//   • a wrong-deck row on a SHARED tile — invisible to the tile list, caught only by `stacks`.
// A fixture with just the first would still miss the fold, which is how the hole got in.
//
// MUTATION: `if (!it || (it.deck|0) !== (focusRoom.deck|0)) continue;` → `if (!it) continue;` in
// room-model.js ⇒ RED.
//
// ⚠️ AND THE TWO LEGS WERE VERIFIED SEPARATELY, WHICH TOOK A SECOND MUTATION EACH. `assert` throws,
// so with the whole fixture in place only the FIRST failing leg ever reports — a second leg that
// could not bite would be indistinguishable from one that can, which is precisely how the original
// hole hid. Each was therefore run with the OTHER one blinded (its fixture row removed):
//   row `[5,3,0,…]` alone → the TILE-LIST message fires, the `stacks` message does not;
//   row `[4,2,0,…]` alone → the `stacks` message fires, the TILE-LIST message does not.
// Neither leg is carried by the other.
test('roomItemTiles clips to the focused room — deck and rect, half-open', () => {
  const rows = [
    [4, 2, 1, 0, 1],   // top-left corner, inside
    [7, 4, 1, 0, 1],   // bottom-right corner, inside (rx+rw-1, ry+rh-1)
    [8, 2, 1, 0, 1],   // one past the right edge — OUT
    [4, 5, 1, 0, 1],   // one past the bottom edge — OUT
    [3, 2, 1, 0, 1],   // one left of the left edge — OUT
    [4, 1, 1, 0, 1],   // one above the top edge — OUT
    [5, 3, 0, 0, 1],   // WRONG DECK, INSIDE the rect, on a tile nothing else occupies — OUT
    [4, 2, 0, 0, 9],   // WRONG DECK, on a tile an in-room row ALREADY holds — OUT, and invisible
  ];                   //             to the tile list, so `stacks` below is what catches it
  const tiles = roomItemTiles(decodeItems(msg(rows)), ROOM);
  assert.deepEqual(tiles.map((t) => [t.tx, t.ty]), [[4, 2], [7, 4]],
    'a row from another deck created a tile in this room. Every deck shares one coordinate space, '
    + 'so an unfiltered channel plates deck-7 stock onto a deck-0 floor.');
  assert.deepEqual(tiles.map((t) => t.stacks), [[{ kind: 0, count: 1 }], [{ kind: 0, count: 1 }]],
    'a row from another deck FOLDED INTO an existing tile. This is the leg the first version of '
    + 'this test lacked: the tile list cannot see it, because the tile was already there.');
});

test('roomItemTiles tolerates a missing focus or a missing channel', () => {
  assert.deepEqual(roomItemTiles(null, ROOM), []);
  assert.deepEqual(roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 1]])), null), []);
  assert.deepEqual(roomItemTiles([], ROOM), []);
});

// MUTATION: replace the `seen.count += count` fold with `tile.stacks.push({kind, count})` ⇒ this fails.
test('roomItemTiles SUMS stacks of one kind per tile, and keeps different kinds apart', () => {
  const tiles = roomItemTiles(decodeItems(msg([
    [5, 3, 1, 0, 7],   // Regolith 7
    [5, 3, 1, 3, 2],   // Potato 2
    [5, 3, 1, 0, 20],  // Regolith again — the ordinary state of a tile hauled to twice
  ])), ROOM);
  assert.equal(tiles.length, 1, 'three rows on one tile must fold into ONE tile entry');
  assert.deepEqual(tiles[0].stacks, [{ kind: 0, count: 27 }, { kind: 3, count: 2 }],
    'same-kind stacks must SUM (a player reading a floor wants "27 REGOLITH", not "7 + 20"), and '
    + 'the kind order must be first-appearance — the host order, not a client sort');
  // ⚠️ THERE IS NO `total` ANY MORE. This used to read `assert.equal(tiles[0].total, 29, …)` — and
  // that assertion was the field's ONLY reader anywhere, which is the definition of a dead field
  // dressed as a tested one. It is dropped from `roomItemTiles` rather than given a consumer,
  // because a per-tile census nobody uses is a second number that can drift from `stacks`.
  assert.equal(tiles[0].total, undefined,
    'roomItemTiles grew a `total` back. Sum `stacks` at the call site instead — one expression, and '
    + 'it cannot come to disagree with the list it is derived from.');
});

// MUTATION: sort `out` by tx/ty in roomItemTiles ⇒ this fails.
test('roomItemTiles preserves the HOST order of tiles, and the fixture can tell', () => {
  const tiles = roomItemTiles(decodeItems(msg([[7, 4, 1, 0, 1], [4, 2, 1, 0, 1]])), ROOM);
  assert.deepEqual(tiles.map((t) => [t.tx, t.ty]), [[7, 4], [4, 2]],
    'the tiles came back in a different order from the wire — the fixture is deliberately '
    + 'reverse-sorted so a client sort cannot hide here');
});

test('roomItemTiles is PURE: inputs are neither mutated nor aliased', () => {
  const decoded = decodeItems(msg([[5, 3, 1, 0, 7], [5, 3, 1, 0, 20]]));
  const snapshot = JSON.stringify(decoded);
  const tiles = roomItemTiles(decoded, ROOM);
  tiles[0].stacks[0].count = 999;
  tiles[0].stacks.push({ kind: 99, count: -1 });
  assert.equal(JSON.stringify(decoded), snapshot,
    'roomItemTiles handed back objects that alias the decoded channel, so a caller editing its own '
    + 'view-model silently rewrites the wire cache');
});

// ═════════════════════════════════════════════════════════════════ the ground-stack layer
//
// ⚠️ THE LABEL PLATE IS GONE AND THIS SECTION IS ITS SUCCESSOR. The `items` channel shipped a plate
// (`REGO 40`) as an honest "we have no art" stand-in; the 68-piece mock re-import brought the eight
// ground-item pieces, so the layer now draws SPRITE + COUNT BADGE. What did NOT change is the reason
// the channel exists: the count is the one fact no projection byte could carry, so it is still drawn,
// and the plate survives DEMOTED to the no-art fallback (MetalOre; a kind byte from a newer host).

test('itemStackSlots takes one slot per kind, up to two', () => {
  assert.deepEqual(itemStackSlots([{ kind: 0, count: 40 }]), [{ kind: 0, count: 40 }]);
  assert.deepEqual(itemStackSlots([{ kind: 0, count: 40 }, { kind: 3, count: 2 }]),
    [{ kind: 0, count: 40 }, { kind: 3, count: 2 }]);
  assert.deepEqual(itemStackSlots([]), []);
  assert.deepEqual(itemStackSlots(null), []);
});

// MUTATION: `STACK_MAX_SLOTS = 3` ⇒ this fails (three kinds would then all get a slot).
test('a tile with more kinds than fit says HOW MANY are hidden, rather than picking winners', () => {
  const slots = itemStackSlots([
    { kind: 0, count: 4 }, { kind: 3, count: 5 }, { kind: 8, count: 6 }, { kind: 5, count: 7 },
  ]);
  assert.deepEqual(slots, [{ kind: 0, count: 4 }, { more: 3 }],
    'a crowded tile must account for every kind on it. Drawing two and silently dropping two would '
    + 'be the same class of lie as the projection keeping only the topmost stack.');
});

/** Every BADGE/CHIP rect in an `itemStackSvg` string — matched on the badge fill, because the sprite
 *  builders emit `<rect …>` in the identical attribute order and would otherwise be counted. */
function badgeRects(svg) {
  return [...svg.matchAll(
    // ⭐ VR-P3 — the badge is a PAPER plate with an INK hairline now (charter §1: "no accent =
    // nothing to see" — a pile of regolith is a thing with nothing to decide about). TRANSLATED at
    // the VR-P3 review: the plate carries `class="rz-chip"`, so this is anchored on the CLASS as well
    // as on the fill+stroke pair — strictly narrower than before, since a future paper-on-ink rect in
    // this layer can no longer be mistaken for a count badge.
    /<rect class="rz-chip" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="2" fill="#EBE4D1" stroke="#14120F"/g,
  )].map((m) => ({ x: +m[1], y: +m[2], width: +m[3], height: +m[4] }));
}
/** Every badge/chip text, in emission order (anchored on the chip's own class + text colour). */
function badgeTexts(svg) {
  return [...svg.matchAll(/<text class="rz-chip-text"[^>]*fill="#14120F" text-anchor="middle"[^>]*>([^<]*)</g)]
    .map((m) => m[1]);
}
/** The sprite `<g>` wrappers the layer emitted, as their translate offsets, in emission order. */
function spriteAt(svg) {
  return [...svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)"><g class="pl-item">/g)]
    .map((m) => ({ x: +m[1], y: +m[2] }));
}

// ⚠️ THE PREDECESSOR OF THIS TEST HAD FOUR MUTATIONS SURVIVE 782/782 GREEN, all plain arithmetic in a
// pure builder, because it asserted `x` and nothing else: a zero-height plate, a TOP-anchored one, one
// drawn five tiles below its own tile, and `- rx` written for `- ry` (every plate off by rows). The
// geometry is therefore asserted as the CONTRACT — bottom-anchored means
// `y + height === tileTop + unit - inset`, which survives re-tuning the inset and fails all four.
test('itemStackSvg draws one group per tile inside the rz-items layer, in room-local space', () => {
  const tiles = roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 40], [7, 4, 1, 3, 2]])), ROOM);
  const svg = itemStackSvg(tiles, ROOM);
  assert.match(svg, /^<g class="rz-items" pointer-events="none">/);
  assert.equal([...svg.matchAll(/<g class="rz-item">/g)].length, 2, 'one group per stocked tile');

  // THE ART. Not "a string came back" — the real pieces, from the real registry, by kind.
  assert.ok(svg.includes('data-kind="0"') && svg.includes('data-kind="3"'), 'both kinds named');
  assert.equal(spriteAt(svg).length, 2, 'each stocked tile must draw a PIECE, not just a number');

  // ROOM-LOCAL, IN BOTH AXES. Tile (4,2) is the room origin → local (0,0); tile (7,4) is three
  // columns right and TWO ROWS DOWN → local (3U, 2U). A row/column mix-up puts every pile somewhere
  // the player is not looking, and every assertion above still passes.
  const rects = badgeRects(svg);
  assert.equal(rects.length, 2, 'the badge parse found the wrong number of badges — the assertions '
    + 'below would be vacuous');
  const INSET = 1.5;
  for (const [i, [tx, ty]] of [[4, 2], [7, 4]].entries()) {
    const left = (tx - ROOM.rx) * U, top = (ty - ROOM.ry) * U;
    const r = rects[i];
    assert.ok(r.height > 0, `badge ${i}: a zero-height badge draws the number with no panel behind it`);
    assert.equal(r.y + r.height, top + U - INSET,
      `badge ${i}: the badge is not BOTTOM-anchored inside its own tile. Top-anchored it covers the `
      + 'pile it is counting; off by a tile it counts the wrong floor.');
    assert.ok(r.x >= left && r.x + r.width <= left + U,
      `badge ${i}: the badge spills sideways out of its own tile (x=${r.x} w=${r.width})`);
    assert.ok(r.y >= top, `badge ${i}: the badge spills UP out of its tile`);
    const sprite = spriteAt(svg)[i];
    assert.ok(sprite.x >= left - U && sprite.x <= left + U,
      `sprite ${i}: drawn outside the neighbourhood of its own tile`);
  }
});

// THE POINT OF THE WHOLE CHANNEL, and the thing the art must not have cost. MUTATION: delete the
// `if ((slot.count | 0) > 1)` branch in room-model.js ⇒ this fails.
test('THE COUNT SURVIVES THE ART: a stack of 40 draws 40, a stack of 1 draws no badge', () => {
  const forty = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 40]])), ROOM), ROOM);
  assert.deepEqual(badgeTexts(forty), ['40'],
    'the count is the ONE fact no projection byte could ever carry — a stack of 1 and a stack of 40 '
    + 'write the identical GlyphCell. Drawing the piece and dropping the number would throw away the '
    + 'entire reason the items channel was built.');
  assert.equal(spriteAt(forty).length, 1, 'and the piece is still drawn beside it');

  const one = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 1]])), ROOM), ROOM);
  assert.deepEqual(badgeTexts(one), [],
    'a single unit is what the sprite already means; a `1` on every stack in a hold is noise over '
    + 'the numbers that matter');
  assert.equal(spriteAt(one).length, 1, 'a stack of one still draws its piece');
});

// MUTATION: make `itemIdForStockKind` return `'regolith'` for every kind ⇒ this fails (ORE 12 would
// become a regolith pile with a `12` badge, i.e. a material the game does not have, drawn as one it
// does). THE FALLBACK IS NOT DEAD CODE: MetalOre is deliberately unskinned, and `decodeItems`
// deliberately KEEPS a kind byte this client has never heard of.
test('a kind with NO art falls back to the label chip — it is never drawn as something else', () => {
  const ore = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 1, 12]])), ROOM), ROOM);
  assert.equal(itemIdForStockKind(1), '', 'MetalOre must stay unskinned — nothing in sim/ makes it');
  assert.deepEqual(badgeTexts(ore), ['ORE 12'], 'an unskinned kind keeps the old label plate');
  assert.equal(spriteAt(ore).length, 0, 'and draws no piece at all — there is no ore piece to draw');

  const alien = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 99, 7]])), ROOM), ROOM);
  assert.deepEqual(badgeTexts(alien), ['? 7'],
    'a kind byte from a NEWER host is still a real, located, counted pile. Drawing nothing would put '
    + 'an empty tile over a full one, which is the invisibility this channel removes.');
});

test('itemIdForStockKind is the DERIVED join, byte → sim name → piece', () => {
  // The three hops are: STOCK_KINDS (byte → C# member name, pinned against ItemStack.cs by
  // stock-filter-model.test.js) then ITEMS.itemKind (name → piece). Nothing here is a byte literal in
  // the registry, which is the whole reason a reordered enum cannot silently redraw every pile.
  for (const e of STOCK_KINDS) {
    const id = itemIdForStockKind(e.kind);
    // TWO kinds legitimately resolve to nothing: MetalOre (dead E3 vocabulary, deliberately never
    // drawn) and Swarf (REAL and unskinned — the wreck start created it while the wrecked-art lane
    // owned client/src/items/). Both are ledgered in device-sprite-coverage.test.js with a reason.
    if (!id) { assert.ok(e.name === 'MetalOre' || e.name === 'Swarf', `${e.name} lost its art`); continue; }
    assert.equal(ITEMS[id].itemKind, e.name, `kind ${e.kind} resolved to a piece for ${ITEMS[id].itemKind}`);
    assert.equal(ITEMS[id].kind, 'resource', `kind ${e.kind} resolved to a ${ITEMS[id].kind} piece`);
  }
  assert.equal(itemIdForStockKind(99), '', 'a byte the sim does not have has no piece');
  assert.equal(itemIdForStockKind(-1), '');
});

test('two kinds on one tile each get their own piece and their own count', () => {
  const svg = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 7], [4, 2, 1, 3, 2]])), ROOM), ROOM);
  assert.equal([...svg.matchAll(/<g class="rz-item">/g)].length, 1, 'one tile, one group');
  assert.equal(spriteAt(svg).length, 2, 'both kinds must be drawn — the projection could show one');
  assert.deepEqual(badgeTexts(svg), ['7', '2'], 'and both counts');
  const rects = badgeRects(svg);
  assert.ok(rects[0].x + rects[0].width <= rects[1].x,
    'the two slots overlap — one badge is drawn on top of the other and one count is unreadable');
  assert.ok(rects[0].x >= 0 && rects[1].x + rects[1].width <= U,
    'a two-slot tile spills out of its own tile');
});

// ⚠️ THE OVERFLOW SLOT IS NEW SURFACE AND IT WAS UNGUARDED. `itemStackSlots` has a test named for
// this exact contract ("says HOW MANY are hidden, rather than picking winners") — but it stops at the
// SLOT LIST. Nothing asserted that `itemStackSvg` ever DRAWS the summary, and the string `KINDS`
// appeared in no SVG-level assertion anywhere. Measured: replacing the whole `slot.more` branch body
// with an empty `<g>` left 796/796 GREEN. So did reporting the wrong number, and so did dropping the
// `continue` (which draws a REGOLITH PILE where the summary belongs, because `slot.kind` is undefined
// and `| 0` makes it 0). A tile with 3+ kinds would then draw pile #1 and silently swallow the rest —
// the picking-arbitrary-winners lie the slot test is named against, re-introduced one layer down.
// This is new surface because `main`'s `itemPlateSvg` printed `rows[i]` uniformly, with no
// `more`-specific branch: the summary could not be dropped independently there.
//
// MUTATIONS — SEVEN, all physically applied, all semantic REDs (no crashes), and each named leg
// blinded and required to fire on its own (`assert` throws, so only the first leg reports):
//   • the branch body → an empty `<g>`            ⇒ the TEXT leg
//   • the whole branch → `continue`               ⇒ the `data-kind="more"` leg
//   • `slot.more` → `slot.more + 1`               ⇒ the TEXT leg
//   • drop the `continue` (falls into the kind branch) ⇒ the SPRITE-COUNT leg
//   • `bottom` → `bottom + 5`                     ⇒ the bottom-anchor leg
//   • `cx` → `cx + slotW` / `cx - slotW`          ⇒ the tile-bounds leg / the overlap leg
// The first four were GREEN at 796/796 before this test existed.
test('THE OVERFLOW SUMMARY IS DRAWN: a 4-kind tile says +3 KINDS, and does not draw a 4th pile', () => {
  const four = msg([[4, 2, 1, 0, 4], [4, 2, 1, 3, 5], [4, 2, 1, 8, 6], [4, 2, 1, 5, 7]]);
  const svg = itemStackSvg(roomItemTiles(decodeItems(four), ROOM), ROOM);

  // NON-VACUITY FIRST, as an INCLUSION test: the fixture really does overflow. If `itemStackSlots`
  // stopped summarising, every assertion below would be measuring the wrong shape.
  assert.deepEqual(itemStackSlots([{ kind: 0, count: 4 }, { kind: 3, count: 5 }, { kind: 8, count: 6 }, { kind: 5, count: 7 }]),
    [{ kind: 0, count: 4 }, { more: 3 }], 'the fixture no longer overflows — the legs below are vacuous');

  assert.ok(svg.includes('data-kind="more"'),
    'the overflow slot emitted no group at all. Three of the four kinds on this tile are now '
    + 'invisible AND uncounted — the player sees one pile and has no way to know four are there.');
  assert.deepEqual(badgeTexts(svg), ['4', '+3 KINDS'],
    'the tile must draw the first kind WITH its count and then say how many are hidden. A wrong '
    + 'number here is worse than none: it is a specific false claim about what is on the floor.');
  assert.equal(spriteAt(svg).length, 1,
    'the summary slot drew a PIECE. `slot.kind` is undefined there, so `| 0` makes it 0 and the '
    + 'player is shown a Regolith pile that is not on the tile — a fabricated stack.');

  // The chip obeys the same tile geometry as a count badge: bottom-anchored, inside its own tile,
  // in its own slot. A summary drawn over the neighbouring tile misattributes the whole overflow.
  const rects = badgeRects(svg);
  assert.equal(rects.length, 2, 'the badge parse found the wrong number of chips');
  const left = (4 - ROOM.rx) * U, top = (2 - ROOM.ry) * U;
  assert.equal(rects[1].y + rects[1].height, top + U - 1.5, 'the summary chip is not bottom-anchored in its tile');
  assert.ok(rects[1].x >= left && rects[1].x + rects[1].width <= left + U, 'the summary chip spills out of its tile');
  assert.ok(rects[0].x + rects[0].width <= rects[1].x, 'the summary chip is drawn on top of the count beside it');

  // AND THE CONTROL: two kinds fit, so nothing is hidden and nothing must claim otherwise.
  const two = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 4], [4, 2, 1, 3, 5]])), ROOM), ROOM);
  assert.ok(!two.includes('KINDS') && !two.includes('data-kind="more"'),
    'a tile whose kinds all fit announced hidden kinds it does not have');
});

test('itemStackSvg is empty when there is nothing to draw', () => {
  assert.equal(itemStackSvg([], ROOM), '');
  assert.equal(itemStackSvg(null, ROOM), '');
  assert.equal(itemStackSvg([{ tx: 4, ty: 2, stacks: [] }], ROOM), '',
    'a tile whose stack list is empty must produce no group, not an empty box');
});

// MUTATION: replace the computed `fs` in `chipSvg` with a constant 6.5 ⇒ this fails on the long legs.
// THERE IS NO STACK CAP IN THE SIM — the slice fixture boots with stacks in the hundreds — so this is
// a live shape and not a hypothetical.
test('the badge text is sized to FIT — a four-digit count never overflows its own tile', () => {
  const fsOf = (svg) => Number(/font-size="([\d.]+)"/.exec(svg)[1]);
  const wide = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 6, 699]])), ROOM), ROOM);
  const narrow = itemStackSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 6, 12]])), ROOM), ROOM);
  assert.deepEqual(badgeTexts(wide), ['699']);
  assert.deepEqual(badgeTexts(narrow), ['12']);

  // The hard property: the rendered text fits its badge, and the badge fits its tile, for every count
  // the sim can produce — including the two-slot case, where each slot has HALF a tile.
  for (const count of [2, 12, 345, 6789, 1234567]) {
    for (const rows of [[[4, 2, 1, 6, count]], [[4, 2, 1, 6, count], [4, 2, 1, 0, count]]]) {
      const svg = itemStackSvg(roomItemTiles(decodeItems(msg(rows)), ROOM), ROOM);
      const texts = badgeTexts(svg);
      const rects = badgeRects(svg);
      const fs = fsOf(svg);
      assert.equal(texts.length, rects.length, 'a badge lost its text or its panel');
      for (const [k, r] of rects.entries()) {
        assert.ok(fs * 0.62 * texts[k].length <= r.width + 1e-9,
          `count ${count} (${rects.length} slots): text renders wider than its badge`);
        assert.ok(r.x >= -1e-9 && r.x + r.width <= U + 1e-9,
          `count ${count} (${rects.length} slots): the badge spills across the tile boundary, which `
          + 'misattributes stock to a tile that has none');
      }
    }
  }
});

// MUTATION: return an empty Set from itemStackTileKeys ⇒ the driven suppression test in
// room-model.test.js fails (this leg only pins the key SHAPE the view joins on).
test('itemStackTileKeys names exactly the tiles the layer draws on', () => {
  const tiles = roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 40], [7, 4, 1, 3, 2]])), ROOM);
  const keys = itemStackTileKeys(tiles);
  assert.deepEqual([...keys].sort(), ['4,2', '7,4']);
  assert.deepEqual([...itemStackTileKeys([{ tx: 1, ty: 1, stacks: [] }])], [],
    'a tile that draws nothing must not suppress the frame rendering that would otherwise explain it');
  assert.deepEqual([...itemStackTileKeys(null)], []);
});

test('the layer is PURE: same tiles → byte-identical output, and the input is not mutated', () => {
  // The builders underneath are pure by contract (helpers.js:1-7) and this layer calls them with an
  // idPrefix derived from the TILE, so two piles on one canvas cannot collide on a gradient id — and
  // a golden-frame comparison cannot flake.
  const tiles = roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 40], [7, 4, 1, 0, 40]])), ROOM);
  const snapshot = JSON.stringify(tiles);
  const a = itemStackSvg(tiles, ROOM);
  const b = itemStackSvg(tiles, ROOM);
  assert.equal(a, b, 'the layer is not deterministic');
  assert.equal(JSON.stringify(tiles), snapshot, 'the layer mutated its input');
  const ids = [...a.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length,
    'TWO PILES SHARE A GRADIENT id ON ONE CANVAS. The same kind on two tiles must namespace its defs '
    + 'per tile, or the second placement re-points the first one\'s paint.');
});

// ═══════════════════════════════════════════════════════ the surface actually wires it up

test('the Room Zoom draws the item layer, and main.js dispatches the channel', () => {
  assert.match(MAIN, /case 'items':\s*Hud\.renderItems\(m\);/,
    'client/src/main.js must dispatch the `items` channel. Its onMessage switch is the standard '
    + "client's ONLY entry point — a channel with no `case` is host work the player never sees.");
  assert.match(ROOMZOOM, /roomItemTiles\(decodeItems\(Hud\.getItems\(\)\)/,
    'roomzoom-view.js must derive its item tiles from the decoded `items` channel — not from the '
    + 'frame, whose glyph byte carries no count, keeps only the last stack, and is overwritten by '
    + 'any device on the tile');
  // ⚠️ A PREFIX, NOT AN ANCHORED CALL — the same correction W0b made to the `furnitureSvg` pattern
  // below, and for the same reason: VR-P3 gave the layer the cutaway's `place` object (a stack
  // STANDS on its tile now rather than lying in a plan), and an anchored `_focus)` would have gone
  // red for a change that does not touch this guard's subject. The subject is that the layer is
  // concatenated at all, off `_itemTiles`.
  assert.match(ROOMZOOM, /body \+= itemStackSvg\(_itemTiles, _focus/,
    'roomzoom-view.js must concatenate itemStackSvg(_itemTiles, …) into the layer stack');
  // ⚠️ THE TRAILING `\)` WAS DROPPED FROM THIS PATTERN BY W0b, DELIBERATELY, and saying so is the
  // point: `furnitureSvg` grew a THIRD argument (`_deviceCond`, the wear join) and the old anchored
  // pattern would have gone red for a change that does not touch this guard's subject at all. What
  // this guard is about is the SECOND argument — that the furniture layer is told which tiles the
  // item layer draws on. It is now pinned as a prefix, so a fourth argument does not re-break it.
  // ⚠️ `roomCells(frame, _focus)` IS NOW DERIVED ONCE PER REPAINT into `cells` — the title's own
  // FITTINGS clause counts the same list, and deriving it twice is how a stat line and a drawing
  // come to disagree about one room. The subject is unchanged: the furniture layer is told which
  // tiles the item layer draws on.
  assert.match(ROOMZOOM, /furnitureSvg\(cells, itemStackTileKeys\(_itemTiles\)/,
    'the furniture layer must be told which tiles the item layer draws on, or the frame-derived '
    + 'rendering of the same pile — the unknown chip, and now the RESOURCE PIECE itself — is stacked '
    + 'underneath the authoritative one');
});

// THE LAYER ORDER, as source positions rather than as a claim. The stacks must be concatenated AFTER
// the furniture layer (so a device cannot bury them — that is loss 3 being fixed in the client too)
// and BEFORE the pawn layer (so a crew member is never hidden by stock).
//
// MUTATION: move the `itemStackSvg` line above `furnitureSvg` ⇒ this fails.
test('the item stacks are drawn ABOVE furniture and BELOW pawns', () => {
  const iFurn = ROOMZOOM.indexOf('body += furnitureSvg(');
  const iItem = ROOMZOOM.indexOf('body += itemStackSvg(');
  const iPawn = ROOMZOOM.indexOf('body += pawnSvg(');
  assert.ok(iFurn > 0 && iItem > 0 && iPawn > 0, 'the three layer lines must all be found — '
    + 'this scan has rotted and the ordering below would compare -1s');
  assert.ok(iItem > iFurn,
    'the item layer is concatenated BEFORE the furniture layer, so a device sprite is painted over '
    + 'it — reproducing GlyphMapper pass 4\'s erasure in the client after removing it from the wire');
  assert.ok(iPawn > iItem, 'a crew member must never be hidden behind a stack');
});

// ═════════════════════════════════════════════════════════════════ the scans' own controls

test('NEGATIVE CONTROL: the scans read code, not comments', () => {
  assert.ok(!codeOnly("// case 'items': Hud.renderItems(m);\nconst live = 1;").includes('renderItems'),
    'a line comment survived codeOnly — the dispatch scan above could then be satisfied by a TODO');
  assert.ok(!codeOnly("/* body += itemStackSvg(_itemTiles, _focus); */ const live = 1;")
    .includes('itemStackSvg'),
    'a block comment survived codeOnly — the layer scan could then be satisfied by commented-out code');
});

test('POSITIVE CONTROL: the same text in real code DOES trip the scans', () => {
  assert.match(codeOnly("case 'items': Hud.renderItems(m); break;"), /case 'items':\s*Hud\.renderItems\(m\);/,
    'codeOnly mangled real code — every scan above is then vacuous');
});

// ⚠️ THE FIXTURE MUST CONTAIN A LATER REAL COMMENT (CLAUDE.md's stripper trap). A control asserting
// "a quoted /* does not blind the stripper" whose fixture has no closing */ is VACUOUS: the naive
// `replace(/\/\*[\s\S]*?\*\//g,'')` finds no match, returns the input unchanged, and passes whether
// the stripper is correct or broken. Both legs below carry a REAL comment after the quoted marker.
test('codeOnly is string-literal aware, so a quoted marker cannot blind the scans', () => {
  const line = codeOnly('const u = "http://x//y";\n/* dead */ case \'items\':');
  assert.ok(line.includes("case 'items'"),
    "a quoted '//' blinded codeOnly to end of file — every scan using it then passes vacuously");
  assert.ok(!line.includes('dead'), 'and the REAL comment after it must still be stripped');

  const block = codeOnly('const s = "/*";\n/* dead */ case \'items\':');
  assert.ok(block.includes("case 'items'"), 'a quoted block-comment opener blinded codeOnly');
  assert.ok(!block.includes('dead'), 'and the REAL comment after it must still be stripped');
});

test('the scanned sources are non-empty', () => {
  for (const [name, src] of Object.entries({ WIRE_ITEMS_CS, GAME_SESSION_CS, MAIN, ROOMZOOM })) {
    assert.ok(src.length > 200, name + ' stripped to nothing — every scan over it is vacuous');
  }
});
