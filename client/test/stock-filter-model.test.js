// STOCK_KINDS ↔ ItemKind contract, and the mask reducer behind the stockpile filter palette.
//
// The `kind` index in STOCK_KINDS IS the sim's ItemKind byte — it becomes bit k of the mask the
// host stores and StockZoneSystem.Accepts queries. A reorder of the C# enum therefore silently
// mis-filters every zone the player paints (FOOD only would keep out food and let in scrap), with
// no error anywhere and no tint on the tile to show it. So this parses ItemKind straight from the
// sim source — the authority — exactly as palette.test.js does for GlyphColor, rather than
// re-asserting a hand-copied list back at itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  STOCK_KINDS, ACCEPT_ALL, defaultStockFilter, stockKindAccepted, toggleStockKind, stockFilterLabel,
} from '../src/ui/stock-filter-model.js';

const here = dirname(fileURLToPath(import.meta.url));

/** ItemKind member names in enum order, straight from the sim's C# source. */
function itemKindMembers() {
  const src = readFileSync(join(here, '../../sim/Sim.Core/Entities/ItemStack.cs'), 'utf8');
  const body = src.slice(src.indexOf('{', src.indexOf('enum ItemKind')) + 1);
  const members = [];
  let idx = 0;
  for (const line of body.split('\n')) {
    if (line.includes('}')) break; // end of the enum body
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*(\d+))?\s*,/);
    if (!m) continue;
    if (m[2] !== undefined) idx = Number(m[2]); // an explicit `= N` re-anchors the running index
    members.push([m[1], idx]);
    idx += 1;
  }
  return members;
}

// MUTATION: swap `Potato = 3` and `Scrap = 4` in sim/Sim.Core/Entities/ItemStack.cs ⇒ this fails and
// names the client file that has to follow. It is also the tripwire that stops a NINTH ItemKind
// from shipping with no chip in the palette — a kind the player can never filter on, and which a
// stored accept-all mask would silently refuse (see MECHANICS §13). It did its job once already:
// E0-6's `Seals = 7` landed here first, and the palette followed in the same commit.
test('STOCK_KINDS mirrors the sim ItemKind enum member-for-member, in order', () => {
  const members = itemKindMembers();
  assert.equal(members.length, 8, `parsed ${members.length} ItemKind members, expected 8`);
  assert.equal(STOCK_KINDS.length, members.length,
    'the palette lists exactly as many kinds as the sim has');
  members.forEach(([name, index], i) => {
    assert.equal(STOCK_KINDS[i].name, name,
      `STOCK_KINDS[${i}] is ${STOCK_KINDS[i].name} but ItemKind has ${name} there`);
    assert.equal(STOCK_KINDS[i].kind, index,
      `STOCK_KINDS.${name} carries bit ${STOCK_KINDS[i].kind} but the enum byte is ${index}`);
  });
  // Every chip needs a non-empty player-facing label; the labels must be distinct or two chips
  // read as the same filter.
  const labels = STOCK_KINDS.map((e) => e.label);
  for (const l of labels) assert.ok(l && l.length, 'every kind has a label');
  assert.equal(new Set(labels).size, labels.length, 'labels are distinct');
  // ACCEPT_ALL covers exactly one bit per kind — derived, never a copied 0x7F.
  assert.equal(ACCEPT_ALL, 255);   // 0x7F before E0-6 added Seals
  for (const { kind } of STOCK_KINDS) assert.ok(stockKindAccepted(ACCEPT_ALL, kind), `bit ${kind} set`);
  assert.equal(ACCEPT_ALL >> members.length, 0, 'and no bit above the last kind');
});

// MUTATION: `mask ^ kind` instead of `mask ^ (1 << kind)` in toggleStockKind ⇒ toggling kind 3 off
// ACCEPT_ALL yields 252, not 247 (it clears kinds 0 and 1 and leaves Potato accepted).
test('toggleStockKind flips exactly one bit, never mutates, and the default accepts everything', () => {
  assert.equal(defaultStockFilter(), ACCEPT_ALL,
    'a player who never opens the filter gets exactly E0-3 behaviour');

  const before = ACCEPT_ALL;
  const noPotato = toggleStockKind(before, 3);
  assert.equal(noPotato, 0b11110111);
  assert.equal(before, ACCEPT_ALL, 'the input mask is not mutated');
  assert.equal(stockKindAccepted(noPotato, 3), false);
  assert.equal(stockKindAccepted(noPotato, 4), true, 'exactly ONE bit moved');
  assert.equal(toggleStockKind(noPotato, 3), ACCEPT_ALL, 'toggling twice returns to the start');

  // Accept-nothing is a real, reachable state — every kind toggled off, not a falsy "unset".
  let m = ACCEPT_ALL;
  for (const { kind } of STOCK_KINDS) m = toggleStockKind(m, kind);
  assert.equal(m, 0);

});

// The values that actually BITE. An earlier revision of the model had no explicit range check and
// justified it with "the trailing & ACCEPT_ALL truncates anything an out-of-range kind could set" —
// which is FALSE, because JS shift counts are reduced modulo 32: `1 << 32` is 1, not 0, so the
// "out-of-range" bit wraps back INSIDE the valid range where the mask cannot touch it. Measured
// before the fix: toggleStockKind(127, 32) === 126 (it flipped REGOLITH) and
// stockKindAccepted(1, 32) === true. Kinds 8..31 ARE truncated, which is precisely how the false
// claim survived a test that only probed 9 and -1.
//
// MUTATION: delete the `if (!inKindRange(k))` line from toggleStockKind ⇒ the kind-32 assertion
// fails. Same for stockKindAccepted.
test('the mask helpers are TOTAL: a kind the sim does not have flips nothing and is accepted by nothing', () => {
  assert.equal(1 << 32, 1, 'JS reduces the shift count modulo 32 — this is why the guard exists');

  for (const bad of [8, 9, 31, 32, 33, 39, 64, -1, -32, STOCK_KINDS.length]) {
    assert.equal(toggleStockKind(ACCEPT_ALL, bad), ACCEPT_ALL, `toggle is a no-op for kind ${bad}`);
    assert.equal(toggleStockKind(0, bad), 0, `toggle is a no-op for kind ${bad} on an empty mask`);
    assert.equal(stockKindAccepted(ACCEPT_ALL, bad), false, `no mask accepts kind ${bad}`);
  }
  // The specific pre-fix failures, pinned by value so a regression names itself.
  assert.notEqual(toggleStockKind(127, 32), 126, 'kind 32 must not flip REGOLITH');
  assert.equal(stockKindAccepted(1, 32), false, 'kind 32 must not read as REGOLITH');
});

// MUTATION: return the kind `name` instead of the `label` in stockFilterLabel ⇒ the hint reads
// 'ACCEPTS Potato' instead of 'ACCEPTS FOOD'. (The label is the only filter readback a player gets:
// there is no tint or badge on a filtered tile — MECHANICS §13.)
test('stockFilterLabel names the accepted kinds, with ALL / NOTHING at the ends', () => {
  assert.equal(stockFilterLabel(ACCEPT_ALL), 'ALL');
  assert.equal(stockFilterLabel(0), 'NOTHING');
  assert.equal(stockFilterLabel(1 << 3), 'FOOD');
  assert.equal(stockFilterLabel((1 << 3) | (1 << 5)), 'FOOD · PARTS');
  // Listed in ItemKind order regardless of which bit was set first.
  assert.equal(stockFilterLabel((1 << 5) | (1 << 0)), 'REGOLITH · PARTS');
  // Bits above the last kind are ignored, so a stray one can never render a phantom chip name.
  assert.equal(stockFilterLabel(ACCEPT_ALL | (1 << 9)), 'ALL');
});

// The TUI and the web client must speak ONE vocabulary — a filter bit the console calls FOOD and the
// terminal calls Potato is two names for one thing, and the two tables live in different languages
// with no compiler between them. So parse the C# table out of its own source and compare, exactly as
// the ItemKind tripwire above does.
//
// MUTATION: change any label in hosts/tui/Ui/StockFilterModel.cs (e.g. "FOOD" back to "Potato") ⇒
// this fails and names both files.
test('the TUI label table matches the web palette label-for-label', () => {
  const src = readFileSync(join(here, '../../hosts/tui/Ui/StockFilterModel.cs'), 'utf8');
  const body = src.slice(src.indexOf('{', src.indexOf('string[] Labels')) + 1);
  const labels = [];
  for (const line of body.split('\n')) {
    if (line.includes('};')) break;
    const m = line.match(/"([^"]*)"/);
    if (m) labels.push(m[1]);
  }
  assert.equal(labels.length, STOCK_KINDS.length,
    `parsed ${labels.length} TUI labels, expected ${STOCK_KINDS.length}`);
  assert.deepEqual(labels, STOCK_KINDS.map((e) => e.label));
});
