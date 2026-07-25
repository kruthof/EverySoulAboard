# E0-4 — Filtered stockpile zones (LANE PLAN)

> ## ⛔ STATUS 2026-07-25: LANE COMPLETE AND MERGED — **and this plan's premise is RETRACTED**
>
> **Read this before any number below.** E0-4 landed on `main` (`0be9d70`). This plan remains the
> authority on the lane's **shape** — Choice A, the registry design, the save format, the package
> split — and it is **not** an authority on any measured figure.
>
> **Every `−14 %`, `75.7 %`, `28 → 31` and `craft-walk 13.0 % → 8.0 %` in this document is
> `ECONOMY.md` §8's figure, and E0-4 did NOT reproduce any of them.** They appear unmarked at
> `:83`, `:95`, `:100-101`, `:162`, `:199`, `:218-219`, `:386`, `:483` and `:488` (line numbers as of
> this banner); this banner retracts all of them at once rather than littering the plan with nine
> boxes. Treat **every** figure in this document as retracted, not only those lines.
>
> **What actually happened:** the `--stockpile far` harness leg gated on the `TileFlags.Walkable`
> flag with **no reachability test**, so it zoned **3 of its 4 tiles inside the slice's authored
> sealed observatory** and measured an unreachable-tile **haul livelock**, not a wrong-deck cost.
> Every `far` figure this lane published (throughput `6`/`2`/`9`, ~49 % HaulPickup against ~0.0 %
> HaulDeliver, A1 "50.000 %") is **void**.
>
> **And do NOT read that as a refutation.** `ECONOMY.md` §8's −14 % is **NEITHER CONFIRMED NOR
> REFUTED**: the slice's throughput metric is **matter-bound**, so it has no power to detect the
> regression this plan was written to reproduce. §8's *mechanism*, on the other hand, is now
> **positively supported** and is placement-dependent, which vindicates §5's bench rule — just not
> for the reason §5 gives. **Hazard 8.1 (the far-regression reproduction) closes as NOT SETTLEABLE
> ON THE SLICE**, not as done and not as disproved; reopening it needs a **labour-bound ship**, not
> another run.
>
> Authoritative record: `docs/HANDOVER.md`'s E0-4 section, `MECHANICS.md` §13.17 (wired but not
> connected) and **§13.18** (the retraction, with every measured table), and `ECONOMY.md` §8's
> correction box.

**Lane:** `lane/e0-4-stockpile-zones` · worktree `../perilune-wt/e0-4-stockpile-zones`
**Authority:** `docs/ECONOMY.md` §8 (storage & logistics — THE design authority), `docs/ECONOMY-PLAN.md`
§E0 row E0-4, §2 (E-STOCK lane), §3.3 (save format), §4 (determinism traps), §5.1/§5.2 (test discipline).
**Sequencing:** E0-4 lands **immediately after** E0-5 (deconstruct), which created the haul traffic that
makes this lane's core rule measurable (`docs/HANDOVER.md` "E0-5 before E0-4 — as a PAIR"). E0-3 shipped
the *presence* half (`TileFlags.Stockpile`, one writer); this lane ships the *filter* half and the rule
that makes filtered zones a gain rather than a regression.

---

## 0. Baseline, measured in this worktree before any edit

`dotnet run --project hosts/scenario -- occupancy --ship slice --days 3` (2'592'000 ticks, 71.9 s wall):

| | value |
|---|---|
| A1 (work-busy at sim-hour 24) | **24.979 %** — FAIL by 0.02, unchanged from the E0-5 baseline |
| **HaulPickup / HaulDeliver** | **0.00 % / 0.00 %** — no ship zones a stockpile, so haul is never assigned |
| Craft | 12.35 % · Dig 1.41 % · Maintain 0.90 % · None 85.28 % |
| busy curve | `80 → 75 → 37.5 (h3–18) → 25 (h19–27) → 12.5 (h28) → ~0 (h29+)` |
| h29–h72 floor | sporadic maintenance spikes only (~1.5 %); no haul demand exists |
| end state | `debris 0 · **stockpile tiles zoned 0** · ground: Corpse=1, Potato=699, ControllerModule=31 · crew 8/8` |

`dotnet run --project hosts/scenario -- --days 3 --seed 42` → final hash **`00e0a2dadb8e5076`**, twin MATCH.
Confirms the four current pins (from `ci.sh:31`, the two `Golden/*_tick3000_hash.txt`, and `HANDOVER.md:17-18`):

| pin | value | source |
|---|---|---|
| scenario (seed 42, 3 d) | `00e0a2dadb8e5076` | `ci.sh:31` |
| tick-3000 | `4be2e77864fb7409` | `tests/Perilune.Tests/Golden/perilune_tick3000_hash.txt` |
| slice tick-3000 | `1f8f2225ee568de9` | `tests/Perilune.Tests/Golden/slice_tick3000_hash.txt` |
| defs checksum (`SimDefs.Default.Checksum`) | `5a471d12643b64f9` | `HANDOVER.md:18`; NOT the scenario host's rules-inclusive `defs: 3f23ce5bd40283c8` print |

Gate counts (from `HANDOVER.md:17`, not re-run here — `./ci.sh` re-measures): **894 dotnet + 485 node**.

**The two numbers this lane owns:** `stockpile tiles zoned 0` (no authored ship zones — so, exactly like
E0-5, the lane needs its own measurement surface) and `HaulPickup/HaulDeliver 0.00 %` (there is no live
haul-to-stockpile traffic to regress or improve until something designates a zone).

---

## 1. ⚠️ The measurement guardrail — what E0-4 can and cannot show

Two things are true and must be stated up front so nobody scores the lane against the wrong number:

1. **E0-4 adds no matter, so A1 will not move and that is not failure.** `HANDOVER.md:135-136`: *"E0-4
   moves haul off 0.00 % but adds no matter, so it does not extend the 28-hour runway. Still worth doing —
   just don't expect A1 to move much."* The economy still terminates at h28. **Do not tune yields or zones
   to manufacture an A1 pass — that is E0-6/E0-7/E0-8's brief, not this lane's.**

2. **No authored ship designates a stockpile, and we are not adding one.** `HANDOVER.md:199`: *"Do not zone
   stockpiles in any authored ship until E0-4 lands"* — that warning kept the −14 % wrong-deck regression
   latent, and it stays true *after* this lane too: zones are the player's decision, so authoring one into
   the slice would delete the decision and move the pins. **Therefore the lane ships its own opt-in
   measurement surface** (§9, WP-3): a `--stockpile <mode>` flag on `occupancy`, host-side, zero sim state,
   the exact mirror of E0-5's `--strip N` / `StripHarness`.

**So the lane's acceptance is the pair ECONOMY.md §8 already measured, reproduced under the harness:**

- `occupancy --ship slice --days 3` (no flag) → **byte-identical to baseline**; all four pins hold. E0-4
  is inert without player intent (exactly E0-5's contract). *Any* movement here is a bug.
- `occupancy --ship slice --days 3 --stockpile far` → **WITHOUT the "don't haul what a bench wants" rule
  (WP-3, before WP-4 lands) this must REPRODUCE ECONOMY.md's regression**: on-job travel climbs toward
  75.7 %, ControllerModule end-count drops below baseline 31, intermediates strand on the wrong deck.
- The *same* command after WP-4 (the rule) → **the flip**: travel does not blow up, throughput returns to
  ≥ baseline. The A/B is across two of the lane's own commits, checkout-reproducible — the E0-5 discipline
  of "measure the faucet, then close it."
- `occupancy --ship slice --days 3 --stockpile bench` → a stockpile beside the benches is a
  neutral-to-slight-gain pre-positioning buffer (ECONOMY.md §8: craft-walk 13.0 % → 8.0 %, throughput
  28 → 31), never a regression.

If `--stockpile far` does **not** reproduce the regression before WP-4, that is a finding (the modern
job board may already deflect it) — **report it, do not invent a regression to fix.**

---

## 2. Key design decisions — with rationale and the deliberate divergences

### 2.1 Where the filter lives — a registry beside the flag, NOT a widened `TileFlags`

`TileFlags` has **exactly one bit left** (`1 << 7`, reserved) and `TILE` is exact-version-gated
(`SaveReader.cs:105-107` throws on any bump), so a filter bitmask can never live in the flags plane —
`ECONOMY.md` §8 and `ECONOMY-PLAN.md` §E0 both spell this out. The design:

| concern | home | why |
|---|---|---|
| **presence** ("this tile is a stockpile") | `TileFlags.Stockpile` (bit 4, E0-3) — **unchanged** | The fast per-tile query `HaulJobSource.VisitTile` / `JobWork.IsFreeStockpileTile` already reads. Saved & hashed in `TILE` (untouched). No new flag ⇒ ECONOMY.md §8's "one bit left" constraint honoured; the reserved bit is not spent. |
| **filter** (which `ItemKind`s a tile accepts) | the **`ZONE` SYSS registry** (`StockZoneSystem`), keyed by packed position | A registry with its own save chapter, exactly as `ECONOMY-PLAN.md` §E0 mandates. `StockZoneSystem` is already registered (W0-6) and pre-scaffolded for precisely this (§3). |

**A stockpile tile with NO registry entry = accept-all.** This is the whole back-compat story: every E0-3
stockpile, and every pre-E0-4 save, has no filter entry and therefore keeps its current accept-everything
behaviour with zero migration. An entry with `mask == 0` is a valid "accept nothing" zone.

**DECIDED (Garvin, 2026-07-24): Choice A — keep the presence bit, move only the filter.** The full
presence migration (Choice B) is rejected: ECONOMY.md §8 (the design authority) only forbids *filters* in
`TileFlags`, never the presence bit, so keeping bit 4 satisfies the real constraint at strictly less code
and zero save migration. Implementers build the design exactly as this §2.1 describes.

**Divergence from `HANDOVER.md:183`, stated on purpose.** That line (inside the E0-5-first argument) says
*"E0-4 migrates it off"* `TileFlags`. This plan does **not** remove the presence bit — only the *filter*
moves into the registry; presence stays on bit 4. Removing the bit would (a) break the dispatcher's tile
pass, which discovers stockpiles via `VisitTile` reading `TileFlags.Stockpile`, forcing a registry-driven
rescan path; (b) require migrating every existing save that has bit 4 set; (c) gain nothing — the bit is
already spent and keeping it does not touch the *reserved* bit 7. Keeping presence-as-flag + filter-as-registry
is strictly less code, strictly more back-compatible, and fully satisfies ECONOMY.md §8's actual constraint
("filters must not live in `TileFlags`"). **If Garvin intended a full presence migration, this is the point
to say so — I recommend against it.**

### 2.2 Granularity — per-tile filter, not a contiguous zone object

Each stockpile tile carries its own `AcceptMask`; the "zone" is a client-side visual grouping of tiles the
player painted with the same filter. This mirrors `BuildSystem` / `DeconstructSystem` (a registry keyed by
packed position, sorted, binary-inserted) exactly.

**Divergence from RimWorld's zone-object model, deliberate:** a contiguous-zone filter would need hashed
*zone-identity* state — a flood-group id per tile, re-flooded on every edit — which is new hashed state, a
new determinism hazard (reflood order), and a save-format burden, to express something the per-tile model
already delivers. Per-tile is the cheaper, determinism-clean choice at v0. The player still experiences a
zone; the sim just stores its filter per tile.

### 2.3 The filter representation — a `ulong` accept-mask

`AcceptMask` is a `ulong`: bit *k* set ⇒ accept `ItemKind` *k*. Covers kinds 0–63; today there are 7
(`ItemKind` 0–6). **Honest limit, to be documented:** kinds ≥ 64 are unrepresentable and would need a wider
mask (a format bump); `ItemKind`'s hard ceiling is 255 (single-byte, `ECONOMY-PLAN.md` §3.3), so this is a
future concern, flagged now, not discovered later. No `[stock]` def scalar is needed for the mask — it is
player data, not policy (§2.5).

### 2.4 "Don't haul what a bench wants" — the load-bearing correctness rule (precise)

This is the rule that turns ECONOMY.md §8's −14 % into a non-regression, and it is the reason the lane
exists as more than a UI feature. **Exact predicate:**

> Let **B(sim)** = the set of `ItemKind`s that appear as an *input port* of the resolved
> `ProductionBill` of any device currently in `sim.Devices` (store order) for which
> `ProductionDefs.TryGetBill(sim.Defs, device.Kind, out bill)` returns true. An item is **ineligible for
> general haul** iff `item.Kind ∈ B(sim)`.

Encoded as a reusable `ulong _benchWanted` bitmask, computed **once per `Rescan(Items|Tiles)` and only
inside the `anyFreeStockpile` branch** (so it is never even computed on a stockpile-free ship — keeping it
inert and zero-cost on every pinned ship). It reuses the *exact* bill resolution `CraftingSystem` uses
(`ProductionDefs.TryGetBill` + `ProductionBill.InputPortCount` / `Input(i).Kind`), so "what a bench wants"
can never drift from what a bench actually fetches. The skip lives in `HaulJobSource.Rescan`'s candidate
loop (one added `continue` beside the existing carried/reserved/corpse/already-stored guards).

**How it interacts with the crafting fetch:** it *cedes* those kinds to `CraftingSystem.StepFetch` entirely.
The haul board simply stops competing for any kind a bench consumes; the bench's own fetcher pulls the
intermediate directly from wherever it was produced (outputs spawn adjacent to the upstream bench,
`CraftingSystem.cs:196`). This structurally removes the round-trip root cause ECONOMY.md §8 names: "crafting
outputs spawn unreserved, so the haul board immediately drags them to the stockpile, from which the
downstream station's fetcher must walk them back." `StepFetch` does **not** read `TileFlags.Stockpile`, so a
bench can still pull an input the player deliberately stockpiled — the two systems cooperate, they do not
fight.

**Precedence over the filter (both live in haul):**
1. skip if carried / reserved / corpse / already on a `Stockpile` tile (existing);
2. skip if `item.Kind ∈ B(sim)` (**WP-4 — the bench rule**);
3. destination selection: choose only a free stockpile tile whose filter `Accepts(item.Kind)` (**WP-2 — the
   filter**).

The bench rule is a **global haul-eligibility gate that overrides the filter**: a tile whose filter accepts
Scrap still receives no Scrap while a Fabricator exists, because Scrap never enters the haulable pool. This
is deliberate and is what forecloses the exploit (§2.6).

**Divergence considered and rejected — a proximity-aware rule (P2):** "ineligible only if the nearest
wanting bench is closer than the nearest accepting stockpile" would let a player pre-position a bench-input
into a *closer* buffer. It is more expensive, harder to test deterministically, and reintroduces the exact
knob (wrong-deck acceptance of an intermediate) that produces the regression. The kind-global rule (P1
above) is shipped; P2 is noted as a possible E1/E2 refinement once bench inputs matter more than the
terminal-goods stockpiling P1 already permits. The cost of P1: a player *cannot* stockpile crafting
intermediates at all while a consuming bench exists (only terminal goods — ControllerModule, Potato — and
any kind no present bench wants get stockpiled). That is the intended trade and it matches the measurement
(the big win in ECONOMY.md §8 was avoiding the regression, not buffering intermediates).

### 2.5 No `[stock]` def field in v0 — a divergence from the E-STOCK row

`ECONOMY-PLAN.md` §2 lists `stock.def` in E-STOCK's exclusive paths. **This lane ships zero def scalars**,
because there is nothing to tune: the filter is player data (a mask), the bench rule is a structural
predicate (no threshold), and accept-all is a code constant. Adding a def field only to honour the row
would move the defs checksum for no behavioural reason. **Consequence, budgeted:** the defs checksum
`5a471d12643b64f9` stays put. If a tunable emerges later (e.g. a per-ship max-zone-tiles perf cap), it ships
under the full six-edit ritual (`README.def` §, field+doc, `CreateDefault`, parser key, appended fold,
verbatim `.def` line, consumption tripwire) and moves the defs checksum then — not now.

### 2.6 The exploit to close — the output-strand regression, and haul/re-haul oscillation

E0-5's analogue was the place→strip matter faucet. E0-4's analogue is **the −14 % output-strand regression
itself re-appearing through a player-zoned wrong-deck stockpile**, plus a secondary **haul-in / bench-fetch-out
oscillation** (haul drags a bench-input into a stockpile; the bench fetcher immediately walks it back out;
repeat). **WP-4's bench rule closes both** — a bench-wanted kind never enters the haulable pool, so it is
never dragged in, so there is nothing to walk back out. Items already *on* a stockpile tile are skipped
from re-haul by the existing `already stored` guard (`HaulJobSource.cs:74`), sealing the oscillation from
the other side. **WP-5 (the client surface, which makes zones player-reachable) MUST land after WP-4** — the
exact ordering E0-5 used (close the faucet before shipping the verb that opens it).

---

## 3. Architecture — fill the pre-scaffolded `StockZoneSystem`, mirror `DeconstructSystem`

`StockZoneSystem` was registered EMPTY by W0-6 (`SystemStack.cs:50`) *specifically so this lane fills it
without a new pin site, a `SystemStack` reorder, or a fresh chapter to invent* — its own class comment says
so. **So there is NO `SystemStack` edit** (one fewer serialized spine change than E0-5 needed).

Fill `sim/Sim.Core/Stock/StockZoneSystem.cs` as `DeconstructSystem`'s exact structural twin:

```csharp
public struct StockZone           // one filtered stockpile tile
{
    public Int3 Pos;
    public ulong AcceptMask;       // bit k = accept ItemKind k; absent entry = accept-all
}
```

- Canonical `List<StockZone> _zones`, **packed-position sorted, binary insert** — copy
  `DeconstructSystem.Pack` / `InsertSorted` verbatim (the *fourth* copy; §7 hazard 3 — do NOT fix the
  masking here, note the copy in the commit message).
- `Tick` **stays a no-op** — zones are pure command-driven state (the `BuildSystem` / current-`StockZoneSystem`
  precedent). No `Reap` is needed (unlike deconstruct): a stockpile tile losing its presence bit is handled
  by `DesignateStockpileCommand`'s OFF path clearing the filter (§4), and an orphan mask on a non-stockpile
  tile is inert (haul ignores non-stockpile tiles). Keeps the system out of the per-tick cost entirely.
- Public API (all deterministic, no RNG): `SetFilter(sim, pos, mask)` (insert/replace, sorted),
  `ClearFilter(sim, pos)` (remove), `bool TryGetFilter(pos, out mask)`, and the hot query
  `bool Accepts(pos, ItemKind kind)` → `!TryGetFilter(pos, out m) || (m & (1UL<<(int)kind)) != 0`
  (absent ⇒ accept-all). `SetFilter`/`ClearFilter` set `sim.JobsDirty |= JobBoardDirty.Tiles` (a zone
  filter change is a tile-board change, same axis `DesignateStockpileCommand` already dirties).
- `Simulation` gains a read-only `StockZones => _stockZones` accessor, resolved once in the constructor
  loop exactly like `_deconstruct` (`Simulation.cs:66-82`) — **adds no hashed/saved field**, it is a
  reference for the harness, the occupancy report, and (optionally) the projection. `HaulJobSource` resolves
  it lazily in its own `BeginTick` (the `DeconstructJobSource` pattern) to stay decoupled.

### Save chapter — `ZONE` StateVersion 1 → 2, version-BRANCH

`ReadSystemState` (`SaveReader.cs:160-173`) matches the chapter by `Name == "StockZones"` (unchanged) and
calls `RestoreState(reader, version)` with the version the writer stamped (`SaveWriter.cs:130` writes
`stateful.StateVersion`). So:

- `StateVersion => 2`.
- `CaptureState`: write `_zones.Count`, then per zone `Pos.X/Y/Z` + `AcceptMask`. (Replaces the current
  single marker byte — the v1 format.)
- `RestoreState(reader, version)`: **version-branch, never version-bail** (`ECONOMY-PLAN.md` §3.3):
  ```
  if (version < 1 || version > StateVersion) return;
  _zones.Clear();
  if (version == 1) { reader.ReadByte(); return; }   // E0-3/W0-6 marker byte → empty ⇒ accept-all everywhere
  int count = reader.ReadInt32();                     // v2+
  for (...) _zones.Add(new StockZone { Pos = ..., AcceptMask = reader.ReadUInt64() });
  ```
  A v1 blob (any save made since W0-6) upgrades to "no filters = accept-all" instead of vanishing.
- `StateChecksum`: fold `Seed` (`0x5A4F4E45` 'ZONE'), then per zone `Pack(Pos)` and `AcceptMask`. **An empty
  registry folds the bare `Seed` — byte-identical to today** — which is what keeps every pin unmoved on ships
  that never zone a filter. Bumping `StateVersion` changes the *save blob*, not `StateChecksum`, so it does
  not move the sim hash (there is no save-byte golden — saves are validated by round-trip hash equality).
- `CITZ` / `ITEM` / `TILE` / `DSLS` — **untouched.**

---

## 4. The command + wire surface — E-STOCK's "2 commands, 1 wire msg"

- **`DesignateStockpileCommand`** (presence) — **exists (E0-3), extended**: its OFF path also calls the
  optional `StockZoneSystem.ClearFilter` (the `DesignateBuildCommand` optional-system walk,
  `Commands.cs:163`), so clearing a stockpile never leaves an orphan filter entry accumulating in the hash.
  Two-line addition; not a new command.
- **`SetStockpileFilterCommand(Int3 pos, ulong mask)`** — **NEW** (the one new command; budget allows 2).
  Optional-system walk to `StockZoneSystem.SetFilter(sim, pos, mask)`; a sim without the system ignores it.
  Precondition-light on purpose (the sim validates at the tick boundary; an illegal tile is a silent no-op),
  mirroring `DesignateDeconstructCommand`'s explicit-flag / blind-enqueue contract.
- **Wire:** one new `filter` message `{ x, y, mask }` (`GameSession.cs` `CmdKind.Filter`, `Parse` case,
  dispatch case, a `HandleFilter`). The `stockpile` verb itself (presence) already ships (E0-3,
  `GameSession.cs:1654`).

**Zero hash impact** — `Commands.cs` is the cheapest spine file (`ECONOMY-PLAN.md` §3.4), plain sealed
classes, no enum, no fold.

---

## 5. The haul enforcement — filter, then bench rule

Both edits are in `HaulJobSource` + the shared `JobWork.IsFreeStockpileTile` (`JobContext.cs:115`). Because
no pinned ship has a stockpile tile, **every one of these paths is unreached on the scenario / tick-3000 /
slice runs** — the candidate loop only executes inside `if (anyFreeStockpile)`, and there are no stockpile
tiles to make `anyFreeStockpile` true. Pins hold.

- **Filter (WP-2):** an item is haulable only if *some free stockpile tile accepts its kind*, and a
  destination is chosen only among tiles whose filter `Accepts(carriedKind)`. Concretely:
  - `IsFreeStockpileTile` gains a kind: `IsFreeStockpileTile(sim, p, groundItemTiles, kind)` →
    existing checks **AND** `sim.StockZones?.Accepts(p, kind) ?? true`. The kind-less overload stays for the
    "any free tile exists" gate but the *candidate* gate and `TryPathToFreeStockpile` pass the carried kind.
  - The `anyFreeStockpile` candidate gate (`HaulJobSource.cs:57-66`) becomes per-item: an item is a
    candidate only if at least one free stockpile tile accepts *its* kind. (Cheap: reuse the tile board.)
  - `TryPathToFreeStockpile` (`:219`) filters destinations by `Accepts(tile, carriedItem.Kind)`.
- **Bench rule (WP-4):** compute `_benchWanted` once inside the `anyFreeStockpile` branch (§2.4); add
  `if ((_benchWanted & (1UL << (int)item.Kind)) != 0) continue;` to the candidate loop. Zero-alloc
  (`ProductionBill` is a struct over existing arrays; the mask is a field, not a new list).

---

## 6. Client / TUI / glyph surface (view + input only, no golden move)

Extend the **existing E0-3 stockpile verb**, do not add a new one:

- **Client:** when the stockpile tool is armed, a small **kind-filter palette** (7 toggles, one per
  `ItemKind`; all-on = accept-all default) whose changes emit the `filter` wire message for the painted
  tiles. Presence painting is unchanged. A filtered tile MAY be rendered with a client-only badge/tint —
  **client rendering only, no wire/glyph/format change.**
- **TUI:** the `stockpile` verb gains an optional filter argument (or a follow-up prompt); emits the same
  command path.
- **Glyph:** **NO change.** `GlyphColor.Stockpile` already exists and `GlyphMapper` already projects it
  (`GlyphMapper.cs:85`). A filtered stockpile is still a stockpile — the *filter* is not in the view-format
  (it is not needed to render the tile), so **no shipped golden moves and no `GlyphColor` slot is added.**
  This is a deliberate contrast with E0-5, which *had* to append `GlyphColor.Deconstruct` because deconstruct
  was a new tile state; a filter is metadata on an existing state.

---

## 7. Determinism — the traps that apply (`ECONOMY-PLAN.md` §4)

1. **Scan orders load-bearing.** `_zones` in packed-position order; the bench-wanted device scan in
   **store order**; the haul candidate scan unchanged (item store order). No new private world scan (the
   filter reads the existing tile board; the bench rule reads the device store).
2. **No `foreach` over `Dictionary`/`HashSet` under `sim/`.** `_benchWanted` is a `ulong` bitmask, not a
   set. `StockZoneSystem` uses a sorted `List`, not a dict. This is the bug class the twin test cannot catch
   (§5.2) — a rule + integrator grep, not a test.
3. **`Pack(Int3)` masks nothing** and is copied character-identically (`Simulation.cs`, `BuildSystem.cs`,
   `DeconstructSystem.cs:515`). Copy the fourth into `StockZoneSystem`; do **NOT** fix the 21/21/6 masking
   here (its own pin-moving package). Note the fourth copy in the commit message.
4. **No RNG.** Neither filters nor the bench rule draw from `sim.Rng`.
5. **Zero-alloc tick path**, test-enforced with a **precondition assertion that the bench-rule branch was
   reached** (a zero-alloc test over a stockpile-free board is a tautology — the exact §5.1 trap). The
   existing `JobDispatchTests` zero-alloc pin must stay green; the new scan is guarded and alloc-free.
6. **De-DE culture:** no new float parse in the sim (mask is an integer; no def scalar). The client/wire
   `mask` is an integer over the wire. No culture hazard — state it (so a reviewer does not score a gate
   that cannot fail, §5.1).

**Pin-move budget — the whole lane is pin-neutral without player intent:**

| pin | moves? | condition |
|---|---|---|
| scenario `00e0a2dadb8e5076` | **NO** | empty `ZONE` folds `Seed` only; `StateVersion` bump does not touch `StateChecksum`; haul paths unreached (no stockpile); no def field |
| tick-3000 `4be2e77864fb7409` | **NO** | same |
| slice `1f8f2225ee568de9` | **NO** | slice authors no stockpile; haul paths unreached |
| defs `5a471d12643b64f9` | **NO** | zero def scalars added (§2.5) |
| any golden frame | **NO** | no `GlyphColor` slot, no shipped ship carries a filter |

The **only** condition under which `StockZoneSystem.StateChecksum` changes is a *live filtered zone in the
folded state* — which happens exclusively under a player designation (or the `--stockpile` harness), never
on a pinned ship. Confirm each pin byte-identical after every WP with the grep, not a list
(`grep -rnE '\b[0-9a-f]{16}\b' docs CLAUDE.md ci.sh tests`), distinguishing live pins from dated records.

---

## 8. Hazards

1. **The regression may not reproduce.** The modern `IJobSource` dispatcher post-dates ECONOMY.md §8's
   experiment. If `--stockpile far` (pre-WP-4) does not tank throughput, the "don't haul what a bench
   wants" rule is still correct and worth shipping (it prevents the oscillation), but the headline −14 %→flip
   story weakens — **report the real numbers, do not fabricate a regression.** The deterministic unit test
   (§9 WP-4) still proves the rule mechanically regardless.
2. **P1 forbids stockpiling all crafting intermediates** while a consuming bench exists (§2.4). If a
   playtester expects to buffer Scrap next to the Fabricator, they cannot — by design. Document it in
   `MECHANICS §13`.
3. **Orphan filter entries** if `DesignateStockpileCommand` OFF is *not* wired to `ClearFilter` — a slow
   hash-state leak (a mask on a non-stockpile tile is inert but folded). WP-2 must wire the clear.
4. **The kind-ed `IsFreeStockpileTile` overload** must not silently change the *existing* kind-less callers'
   behaviour (the "any free tile" gate). Keep both overloads; the kind-less one is accept-all-equivalent.
5. **`_benchWanted` staleness.** It is recomputed every `Rescan(Items|Tiles)`. A device removed mid-run
   (E0-5 device strip!) changes B(sim) — since haul rescans on `Items`/`Tiles` and device removal dirties
   the board, this self-heals. Add a test: strip the only Fabricator, then Scrap becomes haulable again.
6. **64-kind mask ceiling** (§2.3) — flagged, not fixed. A test asserts kinds 0–6 round-trip; document the
   limit.
7. **`ulong` mask endianness in the wire/save** — write/read consistently (`BinaryWriter.Write(ulong)` +
   `ReadUInt64`); de-DE is irrelevant for integers but state it.

---

## 9. Work packages — one reviewable commit each

Files are exclusive per WP. The two haul WPs (**WP-2, WP-4**) both edit `HaulJobSource.cs`, so they are
**sequential, not parallel**; WP-1 (`Stock/`), WP-3 (`hosts/scenario`) and WP-5 (`client/`, `tui`, `web`)
touch disjoint files and can pipeline around that spine.

| WP | content | files (exclusive) | gate / pin |
|---|---|---|---|
| **WP-1** | Fill `StockZoneSystem`: `StockZone`, sorted registry, `SetFilter`/`ClearFilter`/`TryGetFilter`/`Accepts`, `Pack`/`InsertSorted`, `StateVersion→2` version-branch save, `StateChecksum` fold; `Simulation.StockZones` accessor. **No haul wiring yet.** | `sim/Sim.Core/Stock/StockZoneSystem.cs`, `sim/Sim.Core/Simulation.cs` (accessor only) | Full save/hash set (§10). **Pins hold** (empty fold; version-only save change). |
| **WP-2** | The command surface + **filter enforcement in haul**: `SetStockpileFilterCommand`, `DesignateStockpileCommand` OFF→`ClearFilter`, kind-ed `IsFreeStockpileTile`, per-item candidate gate, `TryPathToFreeStockpile` filter, lazy resolve in `HaulJobSource.BeginTick`. **No bench rule.** | `sim/Sim.Core/Commands/Commands.cs`, `sim/Sim.Core/Jobs/Sources/HaulJobSource.cs`, `sim/Sim.Core/Jobs/JobContext.cs` | Filter accept/reject tests. **Pins hold** (paths unreached without a stockpile). |
| **WP-3** | The **`occupancy --stockpile <bench\|far> [N]` harness** (a `StockpileHarness`, exact mirror of `StripHarness`) + occupancy reporting of haul %, throughput (ControllerModule end-count), and on-job travel. **Measure & record: `--stockpile far` reproduces (or does not) the wrong-deck regression** — the pre-rule half of the A/B. | `hosts/scenario/StockpileHarness.cs`, `hosts/scenario/Program.cs` | Host-only. **Zero sim/pin impact.** |
| **WP-4** | **The "don't haul what a bench wants" rule** (`_benchWanted` in `HaulJobSource.Rescan`) + the deterministic unit test + **re-measure the flip** under WP-3's harness. Closes the output-strand / oscillation exploit (§2.6). | `sim/Sim.Core/Jobs/Sources/HaulJobSource.cs` | Bench-rule unit test + conservation + zero-alloc-with-precondition. **Pins hold** (branch unreached without a stockpile). |
| **WP-5** | The **filter UI**: extend the E0-3 `stockpile` verb — client kind-palette + `filter` wire msg (`CmdKind.Filter`, `HandleFilter`), TUI filter arg, optional client-only filtered-tile tint. **Makes zones player-reachable — MUST land after WP-4.** | `hosts/web/GameSession.cs`, `client/**`, `hosts/tui/**` | Host/client parity tests. **No golden move** (no glyph change). |

**Ordering rationale.** WP-1→WP-2 build the state and enforce the filter. WP-3 lands the measurement surface
and *reproduces the regression while the bench rule is deliberately absent* — the honest A/B "before". WP-4
adds the rule and shows the "after" flip on the same harness. WP-5 (the player-facing verb) lands **last**,
after the exploit is closed — the E0-5 "close the faucet before you ship the tap" discipline. WP-1 and WP-2
may be co-committed if it keeps the save-format change atomic, but the boundary is clean as drawn.

---

## 10. Tests — the applicable subset, each ships its named mutation

This lane adds hashed **and** serialized state (the `ZONE` filter), so the **full save/hash set applies**
(`ECONOMY-PLAN.md` §5.1) — EXCEPT the def-field / defs-checksum / de-DE-float gates, which **do not apply
(no def scalar, §2.5)**; state that in the WP-1/WP-2 briefs so a reviewer does not score against gates the
package cannot fail.

**WP-1 (state):**
- determinism twin · **save round-trip with a populated registry** (filters survive) · **save → load →
  tick 1000 → re-compare** (a dropped/derived index would hash equal at load and diverge later) · **old
  save without a v2 `ZONE` chapter (a v1 marker-byte blob) loads silently as accept-all** (mutation:
  `if (version == 1)` → `return` before reading the byte ⇒ stream desync throws) · **hash-honesty table**
  per field (`Pos`, `AcceptMask`) **plus a collision-pair** on `Pack` sharing a word (§5.1: a per-field
  table missed both W0-1 aliases; `StateHashHonestyTests.cs` is the template) · **empty registry folds to
  `Seed`** — assert `StateChecksum() == Seed` (mutation: fold a constant ⇒ pin would move).
- `Accepts` truth table (mutation: absent-entry returns `false` instead of accept-all ⇒ back-compat breaks).

**WP-2 (filter enforcement):**
- **a filtered zone rejects a non-accepted kind and accepts an accepted one** — drive real haul, assert the
  stack is/ isn't delivered (mutation: drop the `Accepts` check in `TryPathToFreeStockpile` ⇒ a rejected
  kind gets hauled there).
- `DesignateStockpileCommand` OFF clears the filter entry (mutation: skip `ClearFilter` ⇒ orphan entry
  folds into the hash).
- **de-DE culture: N/A, stated** (integer mask, no float parse).

**WP-4 (the rule) — the load-bearing anti-tautology test:**
- **`HaulCedesBenchInputToTheCraftingChain_NotToAFarStockpile`** — a synthetic world: a SalvageRecycler
  producing Scrap, a Fabricator wanting Scrap, a free accept-all stockpile far away. Tick. **Assert the
  Scrap output is never selected onto the haul board** (and is instead available to the Fabricator's
  fetcher). **Named mutation, applied by the reviewer:** remove the `_benchWanted` skip ⇒ the Scrap is
  hauled to the far stockpile. **Assert the branch was reached** (`_benchWanted` bit for Scrap is set)
  before asserting the outcome (§5.2 rule 3).
- **bench-set self-heals:** strip the only Fabricator (E0-5 device strip), tick, assert Scrap becomes
  haulable again (mutation: cache `_benchWanted` once and never recompute ⇒ stale, stays ineligible).
- **conservation** over 3 sim-days on the slice with `--stockpile`: units in == consumed + stored + losses
  — the filter/rule must not create or destroy matter (mutation: double-count a delivered stack).
- **zero-alloc steady state with a precondition assertion the bench-rule branch ran** (a stockpile exists,
  `anyFreeStockpile` true) — else the "0 bytes" is vacuous.

**The five anti-tautology rules (§5.2) are merge gates.** Every test names the one-line mutation that fails
it; the independent reviewer *applies* each; a "could not fail" pass blocks merge. Name tests after what
they prove *including limits* (`HaulCedes…_NotToAFarStockpile`, not `HaulWorks`).

---

## 11. Acceptance — honest, falsifiable

1. **Inert without intent:** `occupancy --ship slice --days 3` (no flag) is byte-identical to §0; all four
   pins hold. `./ci.sh` green. (Falsifier: any pin moves, or the no-flag occupancy changes ⇒ the lane is
   not inert.)
2. **Haul comes alive under a zone:** `occupancy --ship slice --days 3 --stockpile bench` shows
   `HaulPickup + HaulDeliver > 0.00 %` and `stockpile tiles zoned > 0` (baseline: both 0). (Falsifier: haul
   stays 0 ⇒ the filter/command path is dead.)
3. **The regression is real, then flipped (the lane's headline A/B):**
   - WP-3 (pre-rule) `--stockpile far`: record on-job travel and ControllerModule end-count. Expect travel
     ↑ toward ECONOMY.md's 75.7 % and throughput ↓ below baseline 31 (reproducing −14 %).
   - WP-4 (rule) same command: travel does **not** blow up; ControllerModule end-count ≥ baseline 31.
   - (Falsifier at WP-4: throughput still regresses ⇒ the rule does not cover the strand. Falsifier at WP-3:
     no regression appears ⇒ report it as hazard 8.1, do not manufacture one.)
4. **Beside-benches is a buffer, not a hit:** `--stockpile bench` throughput ≥ baseline (ECONOMY.md's
   28 → 31 direction), never a regression.
5. **A1 is NOT expected to move** (`HANDOVER.md:135`): report it, do not tune to it. A1 staying ≈ 24.98 %
   FAIL and the h28 cliff remaining is **success for this lane**, not failure — E0-4 adds no matter.
6. The bench-rule unit test (§10 WP-4) passes and its reviewer-applied mutation fails it.

Re-pinning (if any pin *does* move — it should not) is **integrator-only, on `main`, after merge**, updating
`ci.sh` + both goldens + `CLAUDE.md` + `MECHANICS.md` + `HANDOVER.md` + memory in one commit.

---

## 12. Explicitly out of scope

- **Stack merging / stack cap** (ECONOMY.md §8: 699 potatoes in ~hundreds of stacks) — its own E-STOCK
  package with the "N = 2000 stacks" perf test (`ECONOMY-PLAN.md` §3.5). This lane is filters only.
- **Priorities, containers, capacity, spoilage** (ECONOMY.md §8) — later.
- **Belts / drones / logistics automation** — forbidden (ECONOMY.md §8: hauling stays crew labour).
- **Proximity-aware bench rule (P2)** — E1/E2, if bench-input buffering ever earns its complexity (§2.4).
- **Removing the `TileFlags.Stockpile` presence bit** — recommended against (§2.1); would be its own
  save-migration package if ever wanted.
- **Fixing `Pack(Int3)`'s field aliasing** (§7.3) — its own pin-moving package.
- **A `stock.def`** — deferred until a real tunable exists (§2.5).
- **Kind-bucketed item indexes** (the O(items) scans ECONOMY.md §8/§3.5 flag) — a perf package, not this
  correctness lane.
