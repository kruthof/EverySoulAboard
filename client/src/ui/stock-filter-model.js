// PURE model for the STOCKPILE ACCEPT-FILTER palette (E0-4 WP-5). Mirrors the sim's ItemKind enum
// (sim/Sim.Core/Entities/ItemStack.cs) member-for-member and reduces the bitmask the stockpile tool
// carries: bit k set ⇒ the painted tile accepts ItemKind k. No DOM, no wire, no mutation, ASCII only
// — the same shape as build-material-model.js, for the same reason (the picker's every decision has
// to be node-testable without a browser).
//
// The `kind` index IS the sim byte, so a reorder of the C# enum silently mis-filters every zone.
// stock-filter-model.test.js parses ItemStack.cs and compares member-for-member rather than
// re-asserting a hand-copied list — the same tripwire palette.test.js runs against GlyphColor.
//
// `label` is the player-facing name and is deliberately NOT the C# member name in two places:
// Potato → FOOD (the kind is "raw food", not one vegetable) and MetalOre → ORE (it is the only ore).
// `name` is the exact member name, and the tripwire compares THAT.

/**
 * The item kinds, in ItemKind DECLARATION order. `kind` === the sim ItemKind byte — which since
 * E0-7 is NOT the array index: the enum has a hole at 7 (reserved for E0-6's `Seals`) and `Ice` is
 * 8. Read every `kind` here as a bit position, never as an offset.
 */
export const STOCK_KINDS = Object.freeze([
  Object.freeze({ kind: 0, name: 'Regolith', label: 'REGOLITH' }),
  Object.freeze({ kind: 1, name: 'MetalOre', label: 'ORE' }),
  Object.freeze({ kind: 2, name: 'Corpse', label: 'CORPSE' }),
  Object.freeze({ kind: 3, name: 'Potato', label: 'FOOD' }),
  Object.freeze({ kind: 4, name: 'Scrap', label: 'SCRAP' }),
  Object.freeze({ kind: 5, name: 'Parts', label: 'PARTS' }),
  Object.freeze({ kind: 6, name: 'ControllerModule', label: 'CTRL MOD' }),
  // 7 = Seals, reserved for E0-6 and deliberately absent — see the header.
  Object.freeze({ kind: 8, name: 'Ice', label: 'ICE' }),
]);

/**
 * Every kind accepted — DERIVED from the list's `kind` VALUES, never from its length and never a
 * literal. It was `(1 << STOCK_KINDS.length) - 1` until E0-7, which is the same number only while
 * ItemKind is contiguous: with the hole at 7 the length form gives 0xFF, which sets the bit of a
 * kind that does not exist and CLEARS Ice's — "accept everything" silently refusing the newest
 * kind, on every stockpile. The sim (`StockZoneSystem.ComputeAcceptAllMask`) and both C# hosts
 * derive theirs the same way; `stock-filter-model.test.js` parses `ItemStack.cs` and pins that this
 * list still mirrors it.
 */
export const ACCEPT_ALL = STOCK_KINDS.reduce((m, e) => m | (1 << e.kind), 0);

/**
 * The starting filter: ACCEPT EVERYTHING. This makes the very first stockpile paint BEHAVIOURALLY
 * identical to E0-3's — StockZoneSystem.Accepts is true for a full mask exactly as it is for a tile
 * with no entry at all — so a player who never opens the filter sees the same game.
 *
 * BEHAVIOURALLY, NOT IN COST. Because every painted tile now stores an explicit accept-all entry,
 * `StockZoneSystem.Zones.Count > 0` is true on any played ship, which permanently arms WP-2's
 * `filtered` fast path in HaulJobSource — so the per-item AnyFreeStockpileAccepts gate runs forever,
 * over a TryGetFilter that is a LINEAR scan (the registry is sorted for canonical hashing, not for
 * lookup). That is O(items × stockpile-tiles) per rebuild and does not exist today. The fix is a
 * `sim/` change — SetFilter collapsing an accept-all mask back to a ClearFilter — which is outside
 * this package's file set and is deliberately left to the integrator. PURE.
 */
export function defaultStockFilter() { return ACCEPT_ALL; }

/**
 * True when `mask` accepts ItemKind `kind`; false for any kind the sim does not have.
 * Tolerant of junk (a non-number mask reads as 0). PURE.
 */
export function stockKindAccepted(mask, kind) {
  const k = kind | 0;
  if (!inKindRange(k)) return false;
  return ((mask | 0) & (1 << k)) !== 0;
}

/**
 * Flip exactly ONE kind's bit and return the new mask; the input is never mutated (it is a number,
 * so that is structural, but the contract is asserted). An out-of-range kind is a no-op.
 *
 * THE EXPLICIT RANGE CHECK IS LOAD-BEARING, and an earlier revision of this file claimed the
 * opposite. `& ACCEPT_ALL` alone does NOT make an out-of-range kind harmless, because **JS shift
 * counts are reduced modulo 32**: `1 << 32` is `1`, not `0`, so `toggleStockKind(127, 32)` silently
 * flipped REGOLITH (measured: it returned 126) and `stockKindAccepted(1, 32)` returned true. The
 * wrapped bit lands back INSIDE the valid range, exactly where the mask cannot remove it. Kinds 7-31
 * do get truncated by `& ACCEPT_ALL`, which is why the old claim survived a test that only probed 9
 * and -1. Not a live bug — both call sites feed 0..6 — but this is a pure exported model whose whole
 * value is being an auditable contract, so it is total rather than "undefined past the enum".
 */
export function toggleStockKind(mask, kind) {
  const k = kind | 0;
  if (!inKindRange(k)) return (mask | 0) & ACCEPT_ALL;
  return ((mask | 0) ^ (1 << k)) & ACCEPT_ALL;
}

/**
 * True for a kind the sim actually DECLARES. The one range predicate, so the guard cannot drift.
 * PURE.
 *
 * E0-7: a membership test, not `kind < STOCK_KINDS.length`. With the hole at 7 the length form is
 * wrong in both directions at once — it accepts 7 (a kind the sim does not have, whose bit the sim
 * masks away, so the UI would show a chip the game silently ignores) and rejects 8 (Ice, which the
 * player then cannot filter on at all).
 */
function inKindRange(kind) {
  for (let i = 0; i < STOCK_KINDS.length; i += 1) if (STOCK_KINDS[i].kind === kind) return true;
  return false;
}

/**
 * The armed hint's readable rendering of a mask: 'ALL', 'NOTHING', or the accepted labels joined
 * with ' · '. THE ONE AUTHORITY for naming a mask in words, and load-bearing rather than decoration:
 * the armed hint and the Room Zoom's zone key (`ui/zone-overlay.js`, via `zone-model.js`) both read
 * it, so a label change lands in both places at once. PURE.
 *
 * CORRECTED (console-retirement WP-3): this doc used to say it was "currently the ONLY place a player
 * can read a filter back in words — filtered tiles carry no tint or badge (there is no wire channel
 * for one)". That channel now exists (`zones`), and a filtered tile carries both a mark and a named
 * key. Note the HALF-HONOURED CEILING flagged in zone-model.js's header: the reduction below uses
 * `(mask | 0)`, a 32-bit operation, so a mask with a bit at index 32 or above would be mis-NAMED here
 * even though `decodeZones` delivers it intact. Unreachable with 7 ItemKinds; fix both halves together.
 */
export function stockFilterLabel(mask) {
  const m = (mask | 0) & ACCEPT_ALL;
  if (m === ACCEPT_ALL) return 'ALL';
  if (m === 0) return 'NOTHING';
  return STOCK_KINDS.filter((e) => (m & (1 << e.kind)) !== 0).map((e) => e.label).join(' · ');
}
