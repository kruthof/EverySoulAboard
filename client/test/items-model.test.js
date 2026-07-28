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
//   3. THE PLATE MODEL — what `roomItemTiles` aggregates, what `itemPlateRows` says, and that
//      `itemPlateSvg` cannot overflow its own plate however large a count gets.
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
  U, roomItemTiles, itemKindLabel, itemPlateRows, itemPlateSvg, itemPlateTileKeys,
} from '../src/ui/room-model.js';
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

test('roomItemTiles clips to the focused room — deck and rect, half-open', () => {
  const rows = [
    [4, 2, 1, 0, 1],   // top-left corner, inside
    [7, 4, 1, 0, 1],   // bottom-right corner, inside (rx+rw-1, ry+rh-1)
    [8, 2, 1, 0, 1],   // one past the right edge — OUT
    [4, 5, 1, 0, 1],   // one past the bottom edge — OUT
    [3, 2, 1, 0, 1],   // one left of the left edge — OUT
    [4, 1, 1, 0, 1],   // one above the top edge — OUT
    [4, 2, 0, 0, 1],   // right tile, WRONG DECK — OUT
  ];
  const tiles = roomItemTiles(decodeItems(msg(rows)), ROOM);
  assert.deepEqual(tiles.map((t) => [t.tx, t.ty]), [[4, 2], [7, 4]]);
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
  assert.equal(tiles[0].total, 29, 'total is every unit on the tile, whatever the kind');
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
  tiles[0].total = -1;
  assert.equal(JSON.stringify(decoded), snapshot,
    'roomItemTiles handed back objects that alias the decoded channel, so a caller editing its own '
    + 'view-model silently rewrites the wire cache');
});

// ═════════════════════════════════════════════════════════════════════ the plate

test('itemPlateRows names one kind per row, up to two', () => {
  assert.deepEqual(itemPlateRows([{ kind: 0, count: 40 }]), ['REGO 40']);
  assert.deepEqual(itemPlateRows([{ kind: 0, count: 40 }, { kind: 3, count: 2 }]),
    ['REGO 40', 'FOOD 2']);
  assert.deepEqual(itemPlateRows([]), []);
  assert.deepEqual(itemPlateRows(null), []);
});

// MUTATION: `PLATE_MAX_ROWS = 3` ⇒ this fails (three kinds would then all be named).
test('a tile with more kinds than fit says HOW MANY are hidden, rather than picking winners', () => {
  const rows = itemPlateRows([
    { kind: 0, count: 4 }, { kind: 3, count: 5 }, { kind: 8, count: 6 }, { kind: 5, count: 7 },
  ]);
  assert.deepEqual(rows, ['REGO 4', '+3 KINDS'],
    'a crowded tile must account for every kind on it. Naming two and silently dropping two would '
    + 'be the same class of lie as the projection keeping only the topmost stack.');
});

test('itemPlateSvg draws one group per tile inside the rz-items layer, in room-local space', () => {
  const tiles = roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 40], [7, 4, 1, 3, 2]])), ROOM);
  const svg = itemPlateSvg(tiles, ROOM);
  assert.match(svg, /^<g class="rz-items" pointer-events="none">/);
  assert.equal([...svg.matchAll(/<g class="rz-item">/g)].length, 2, 'one group per plated tile');
  assert.ok(svg.includes('REGO 40') && svg.includes('FOOD 2'), 'both plates must carry their words');

  // ROOM-LOCAL: the first tile is the room's origin, so its plate sits inside [0, U); the second is
  // three tiles right and two down. Placement is asserted, not assumed — an absolute-space bug puts
  // every plate off-screen and every assertion above still passes.
  const xs = [...svg.matchAll(/<rect x="([-\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(xs.length, 2);
  assert.ok(xs[0] >= 0 && xs[0] < U, 'the origin tile\'s plate must sit in the first tile column');
  assert.ok(xs[1] >= 3 * U && xs[1] < 4 * U, 'the second tile\'s plate must sit three columns over');
});

test('itemPlateSvg is empty when there is nothing to draw', () => {
  assert.equal(itemPlateSvg([], ROOM), '');
  assert.equal(itemPlateSvg(null, ROOM), '');
  assert.equal(itemPlateSvg([{ tx: 4, ty: 2, stacks: [] }], ROOM), '',
    'a tile whose stack list is empty must produce no plate, not an empty box');
});

// MUTATION: replace the computed `fs` with a constant 6.5 in itemPlateSvg ⇒ this fails on the
// three-digit leg. The slice fixture boots with stacks in the hundreds, so this is a live shape.
test('the plate text is sized to FIT — a three-digit count never overflows the box', () => {
  const wide = itemPlateSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 6, 699]])), ROOM), ROOM);
  const narrow = itemPlateSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 8, 1]])), ROOM), ROOM);
  const fsOf = (svg) => Number(/font-size="([\d.]+)"/.exec(svg)[1]);
  const textOf = (svg) => /dominant-baseline="central"[^>]*>([^<]*)</.exec(svg)[1];

  assert.equal(textOf(wide), 'CTRL 699');
  assert.equal(textOf(narrow), 'ICE 1');
  assert.ok(fsOf(wide) < fsOf(narrow),
    'the longer row was not shrunk. A fixed size spills the text across neighbouring tiles, which '
    + 'misattributes stock to a tile that has none — worse than small text.');

  // The hard property: rendered width ≤ the plate's inner width, for every row length the sim can
  // produce. 0.62em is the monospace advance the builder assumes.
  const boxW = U - 4;
  for (const count of [1, 12, 345, 6789, 1234567]) {
    const svg = itemPlateSvg(roomItemTiles(decodeItems(msg([[4, 2, 1, 6, count]])), ROOM), ROOM);
    const width = fsOf(svg) * 0.62 * textOf(svg).length;
    assert.ok(width <= boxW - 3 + 1e-9,
      `a count of ${count} renders ${width.toFixed(2)} wide inside a ${boxW}-unit plate`);
  }
});

// MUTATION: return an empty Set from itemPlateTileKeys ⇒ the driven suppression test in
// room-model.test.js fails (this leg only pins the key SHAPE the view joins on).
test('itemPlateTileKeys names exactly the tiles that get a plate', () => {
  const tiles = roomItemTiles(decodeItems(msg([[4, 2, 1, 0, 40], [7, 4, 1, 3, 2]])), ROOM);
  const keys = itemPlateTileKeys(tiles);
  assert.deepEqual([...keys].sort(), ['4,2', '7,4']);
  assert.deepEqual([...itemPlateTileKeys([{ tx: 1, ty: 1, stacks: [] }])], [],
    'a tile that draws no plate must not suppress the chip that would otherwise explain it');
  assert.deepEqual([...itemPlateTileKeys(null)], []);
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
  assert.match(ROOMZOOM, /body \+= itemPlateSvg\(_itemTiles, _focus\);/,
    'roomzoom-view.js must concatenate itemPlateSvg(_itemTiles, …) into the layer stack');
  assert.match(ROOMZOOM, /furnitureSvg\(roomCells\(frame, _focus\), itemPlateTileKeys\(_itemTiles\)\)/,
    'the furniture layer must be told which tiles the item layer plates, or the VS-Z-25 unknown '
    + 'chip — the raw glyph letter this channel replaces — is stacked underneath the plate');
});

// THE LAYER ORDER, as source positions rather than as a claim. The plate must be concatenated AFTER
// the furniture layer (so a device cannot bury it — that is loss 3 being fixed in the client too) and
// BEFORE the pawn layer (so a crew member is never hidden by stock).
//
// MUTATION: move the `itemPlateSvg` line above `furnitureSvg` ⇒ this fails.
test('the item plate is drawn ABOVE furniture and BELOW pawns', () => {
  const iFurn = ROOMZOOM.indexOf('body += furnitureSvg(');
  const iItem = ROOMZOOM.indexOf('body += itemPlateSvg(');
  const iPawn = ROOMZOOM.indexOf('body += pawnSvg(');
  assert.ok(iFurn > 0 && iItem > 0 && iPawn > 0, 'the three layer lines must all be found — '
    + 'this scan has rotted and the ordering below would compare -1s');
  assert.ok(iItem > iFurn,
    'the item plate is concatenated BEFORE the furniture layer, so a device sprite is painted over '
    + 'it — reproducing GlyphMapper pass 4\'s erasure in the client after removing it from the wire');
  assert.ok(iPawn > iItem, 'a crew member must never be hidden behind a stock plate');
});

// ═════════════════════════════════════════════════════════════════ the scans' own controls

test('NEGATIVE CONTROL: the scans read code, not comments', () => {
  assert.ok(!codeOnly("// case 'items': Hud.renderItems(m);\nconst live = 1;").includes('renderItems'),
    'a line comment survived codeOnly — the dispatch scan above could then be satisfied by a TODO');
  assert.ok(!codeOnly("/* body += itemPlateSvg(_itemTiles, _focus); */ const live = 1;")
    .includes('itemPlateSvg'),
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
