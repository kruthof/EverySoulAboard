# PERILUNE — Economy Implementation Plan

*The execution companion to `ECONOMY.md`. Written 2026-07-22 against `main` @ `3efd181`.
Nothing here is built. This document is written to be run by parallel worktree lanes plus one
integrator, under the existing rituals in `HANDOVER.md` ("The rituals") and the conflict rules
in `PLAN.md`.*

**Scope — APPROVED 2026-07-22 by Garvin: the full programme, E0 through E4.** This is a
P4-scale programme (`PLAN.md:112`, "economy/trade (Freeport)") pulled forward, plus the round-3
caveat that "a recurring work source is real, open design work". The decision log is
`ECONOMY.md` §13; the work-rate rebase (10×), sleep, the CI economy canary and the `Regolith`
→ `Stock` presentation rename are all settled there.

Staging is still real and still load-bearing: **each phase is independently playable and ships
with its own acceptance measurement**, and E0 alone turns a measured 64-sim-minute economy into
weeks of play. But because E4 is approved rather than optional, three things are designed for
*now* instead of retrofitted later — the Appraisal-summable wealth roll-up in E0-8, persisted
faction standing in E3, and strictly **per-capita** rates throughout §10 (`ECONOMY.md` §13.3).
An economy tuned to exactly eight crew is a bug against E4.

---

## 0. The five things that must be true before any lane spawns

Each is behaviour-free or near-behaviour-free. **Each is cheap now and becomes an expensive
cross-lane refactor the moment parallel lanes exist.** This is the whole ballgame; it looks
like pure plumbing and it is not optional.

| # | change | why now | pin |
|---|---|---|---|
| W0-1 | **Un-alias the two hash packs.** `Simulation.cs:272-275` packs `ItemKind` (byte, bits 32–39) over `ReservedForJob` (bit 39) and gives `Count` only 24 bits; `:255-260` overlaps `JobWorkTicks` (bits 16–47) with `CarryingItemId` (bits 32–63). | Not determinism breaks — **canary blindness in exactly the fields the economy stresses.** A ≥128th `ItemKind` or a >65,535-tick job (109 sim-min — an ordinary smelt) makes two distinct states hash equal. | **moves** |
| W0-2 | **Widen `EffectKind`** `byte` → `ushort` (`CitizenEffects.cs:74-84`, 6 of 8 bits used). | Two economy effects and it is full. Widening after lanes queue effects is a cross-lane refactor touching `CapabilityComputer`, `EffectValidator`, the event, and the `Sim.Llm` tool-schema builders. | neutral |
| W0-3 | **Split `JobsDirty`** into tile / item / site dirty flags (`Simulation.cs:167` → `JobSystem.cs:131-147`). | Today every `AddItem` forces a full-world O(W·H·D) rescan plus two full item passes. A production economy emits items dozens per second. Invisible on the slice, fatal on a P3 derelict. | neutral — **prove it** |
| W0-4 | **Refactor `JobSystem` into a dispatcher over pluggable `IJobSource` providers.** | It is 842 lines already owning dig, haul, build-haul and build — a *de facto* second spine file that mining (E3), filtered hauling (E1) and bill-driven fetching (E2) all want to edit. **This is the single highest-leverage parallelism unlock in the plan.** After it, each lane ships its own provider file and only the dispatcher stays integrator-owned. | neutral — **prove it** |
| W0-5 | **The `[production]` node table** (`ProductionDefs`) beside the existing `Recipes[]`, with an additive lookup that prefers a station's bill and falls back to the legacy array. Shipped values ≡ today. | `Recipes` is `new RecipeDef[d.Machines.Length]` indexed by `(int)DeviceKind` (`SimDefs.cs:558`), single-in/single-out, and `[recipes]` rows keyed by station name **overwrite each other**. A conversion graph cannot be expressed in it. Discovered late, E2 either forks the crafting system or hits a mid-flight redesign. | neutral |
| W0-6 | **Register the economy systems empty** into `SystemStack` and declare their FourCCs, all in one commit. | Registering *any* `IStatefulSystem` moves the pin even with empty state — the checksum seed is folded unconditionally (`Simulation.cs:319-321`). **Hash moves are counted in commits, not features.** Batch the registrations and pay once. | **moves** |

**Two pin moves in Wave 0. After this, work can run wide.**

Alongside Wave 0, three **bug** commits that are independent of every design decision
(`ECONOMY.md` §1.5) and should land regardless of what is approved:

- **B-1** the ownerless reservation leak (`CraftingSystem.cs:183`) — see W1-3, it is the same
  change as `ReservedBy`.
- **B-2** the hydroponics water leak — food production dies permanently on day 1.2.
- **B-3** CO₂ gas transport (no diffusion term) — already on record from round 3.

> **Sequencing note on B-3 and the finite air reserve.** Fix transport **first**. A finite vent
> reserve landed on top of a broken transport model simply kills the crew faster, in a way
> that reads as a balance failure rather than a design.

---

## 1. The phases

Each phase is independently playable and ships with its own acceptance measurement.

### E0 — Close the box, and give the player verbs *(highest value per unit effort)*

**Goal: A1 ≥ 25 % busy at sim-hour 24, and A3 "can build a wall at day 3".** This alone turns
the measured four-hour economy into roughly fifteen.

| WP | content | notes |
|---|---|---|
| **E0-1** | **Labour supply (L0).** `IsIdleForWork`'s `!HasPath` → "has no *job* path"; a `wander_radius_tiles` def field bounding wander scope. | **Hard prerequisite for everything else.** Moves the effective pool from 1.43 of 8 toward the full crew. Preserves the desynchronisation `AuthoredShips.cs:235-241` depends on (that is why radius, not idle-time, is the lever). |
| **E0-2** | **Work-rate rebase (L1)** + the parked movement retune, landed **together** as one integrator-gated commit. | They interact: the retune alone costs 29 % of production and halves recruitability. Landing either before E0-1 is a regression in a fix's costume. Def-field ritual both sides; moves the scenario pin and both tick-3000 goldens. |
| **E0-3** | **Player verbs on the web client**: `dig`, `stockpile` (filtered), `strip`. | Unblocks three `JobKind`s and `AgreeTask` at near-zero sim cost. `GlyphColor.Stockpile` already exists with no writer and the client already has the palette slot — **emitting it needs no wire change**. |
| **E0-4** | **Filtered stockpile zones** as a registry with its own save chapter, keyed by packed position. | **Never in `TileFlags`** — one bit left, and `TILE` is exact-version-gated (`SaveReader.cs:106,175-180`), so widening the flags array moves the world hash *and* bricks every existing save. Must ship with the "don't haul what a bench wants" rule or it is a throughput regression (measured: wrong-deck stockpile → 75.7 % travel, −14 % throughput). |
| **E0-5** | **Deconstruct / strip** as a first-class verb, mirroring `BuildSystem`. 50 % wall recovery, `Parts × condition` on devices. | Gives the player a real one-way matter source *today* and finally gives `Condition` a second consumer. Guardrail: never the pressure hull. |
| **E0-6** | **Conversion loss + `Seals`.** Every hop returns < 100 %; `Seals` become the never-ending maintenance drain; `ControllerModule` gets its one consumer (MOSS scriptability gating). | Kills A6 (two dead `ItemKind`s). |
| **E0-7** | **Ice → melter → water**, with the GDD-canonical forward-hold cargo authored into the slice. | Highest-value single item in the external-supply review and it needs **zero** nav work: it repairs the measured water-loop failure, creates a durable recurring haul source, and is the exact training-wheels version of the comet loop. |
| **E0-8** | **The ledger.** New `ShipMetrics` members (`MassLedger`, `PartsPerDay`, `DaysOfWater`, `DaysOfAir`), computed incrementally in the owning system, exposed as a snapshot; a read-only `ledger` wire channel and console panel. **Ships with a total-value roll-up** — E4's Appraisal lever sums it (`ECONOMY.md` §13.3). | Today `Food` reads 1.00 while food production is dead. The metrics must stop lying before anything else is tuned against them. Same aggregates become the new MOSS `ship.*` bindings and Director tension inputs. |

### E1 — Entropy bites

Sleep (L2); spoilage on a temperature curve (couples free to the existing thermal sim); hull
leak; `Swarf` and the metal cycle's real loss; the food labour chain (harvest → haul → cook →
`Meal`); the finite bottled-air reserve + `Volatiles` + `GasPlant`; **carbonate** — scrub CO₂
into a stock the player must regenerate or vent.

### E2 — People matter

Skills as **new hashed `Citizen` state** (never an extension of the unhashed persona); yield
and defect terms modulated by skill *and* held `Procedure`; `Procedure` documents; teaching;
personal maintenance quality (a stranger restores to 0.85, the specialist to 1.0 and resets the
wear clock). `AgreeTask` escapes its `Dig`-only whitelist (`EffectValidator.cs:110`) and gains
an economic vocabulary. `Circuits` gate `ControllerModule`.

*This is `PLAN.md`'s deferred WS-PEOPLE P2 body. The economy is what gives it teeth, because
the loss becomes quantified.*

### E3 — The voyage is the faucet

Make `NavSystem` non-inert (place a `Telescope`; add `ShipVelX/ShipVelY` and station-keeping;
fix arrival teleport; replace the flat burn cost with coast-and-brake). Nav on the wire, in the
console, and in MOSS. Detections as knowledge. T1 ice harvesting at a comet. Then salvage — the
`Sim.Gen` damage pass + generated-history engine + a forked `SiteGates` suite + the
away-mission dual-sim + suit clock + return merge. Asteroid mining is nearly free once salvage
exists. Trade v0: barter against `goods.def` + faction scarcity, no dynamic market, services
before goods — with **faction standing as a persisted, hashed, Chronicle-visible scalar from
the first commit**, because E4's lien payoff is expressed in it (`ECONOMY.md` §13.3).

**E3 also owns the trading-hub DLC seams** (`ECONOMY.md` §9.7). Six of the seven land here and
none is hub-specific work — each is something E3 wants anyway, shaped so a hub is additive:
the valuation chokepoint, the settlement abstraction, pack-qualified site ids, **persistent
per-site state in its own chapter** (the derelict `Stripped` flag generalised — design it once,
not twice), trade-as-`ISimCommand` with the LLM able to propose but never adjudicate, and
deterministic price formation with no runtime RNG. The one that is easy to miss and expensive
to retrofit: **the away-mission crew-transfer contract must support non-crew personas resident
at a site**, or a hub can never have a quartermaster who remembers you. That is a sentence in
the lane brief now and a contract change later.

**Prerequisite, and it is not optional:** the content-pack seam is currently a lie in the
shipping binary. `PackSource` has two channels, **no host loads packs at all**, and no save
records a manifest. Fix generic pack channels → a host that loads packs → a `PACK` save chapter
*before* authoring `sites.def`, or the P3 DLC dry run discovers it at the worst possible moment.
A planned trading-hub DLC promotes this from "should" to "must" — a hub cannot exist without it.

### E4 — Demand grows

Population growth as the metabolic multiplier; **Appraisal → threat** (visible wealth/heat/light
driving the Director's exogenous-actor windows — economy and threat on one dial, no dice); the
lien as the endgame sink.

E4 is the phase that keeps the economy interesting past hour 100, and it is the one with the
least new machinery — its three levers all consume aggregates earlier phases already built
(the E0-8 wealth roll-up, E3's faction standing, per-capita rates). **Its main risk is the
genre's known failure mode:** RimWorld's wealth→raid curve *saturates*, and once raids cap,
further wealth is free and the late-game economy becomes an afterthought. Perilune's escape is
that upkeep (S1 + S4) is a **rate, not a threshold**, so Appraisal must modulate *cadence* and
never resolve to a capped points budget. Write that constraint into the E4 lane brief.

---

## 2. Lane decomposition

After Wave 0, these run in parallel with exclusive write paths per `PLAN.md`'s conflict rules.

| lane | exclusive paths | spine needs | save chapter |
|---|---|---|---|
| **E-STOCK** stockpiles & containers | `sim/Sim.Core/Stock/`, `stock.def`, its tests | 2 commands, 1 wire msg | new `ZONE` SYSS |
| **E-PROD** production graph & bills | `sim/Sim.Core/Production/` (owns `CraftingSystem.cs`), `production.def` | 2 commands, 1 wire msg | new `PROD` SYSS |
| **E-MINE** extraction | `sim/Sim.Core/Mining/` + one `IJobSource` file | 1 command | new `ORES` SYSS |
| **E-PEOPLE** skills & knowledge | `sim/Sim.Core/People/` (WS-PEOPLE's declared path), `skills.def` | `Citizen` fields | **`CITZ` v7** |
| **E-DECAY** spoilage & wear consumables | `sim/Sim.Core/Systems/DecaySystem.cs`, `quality.def` | `ItemStack` fields | **`ITEM` v3** |
| **E-VOY** trade & fuel | `sim/Sim.Core/Space/` (WS-NAV's path), `trade.def`, `nav.def` | 1 command | `NAVS` ext + `TRAD` SYSS |
| **E-MOSS** automation surface | `sim/Sim.Dsl/` — read-only `stock.*`/`prod.*` adapters | none | none |
| **E-WIRE** wire + client | `client/**`; `WireFormat.cs` via contract request | wire only | none |
| **E-CONTENT** authoring | `Sim.Gen/AuthoredShips.cs`, `content/core/` layout | none | none — **but see risk 5** |

**Golden ownership:** E-WIRE owns `client/test/golden/`; E-CONTENT owns the slice goldens.
Nobody else regenerates either. This is the trap `HANDOVER.md` already flags as the biggest one
in visual work, and it applies identically here.

### 2.1 What genuinely cannot run in parallel

1. **Two lanes cannot both edit `JobSystem.cs`.** Hence W0-4.
2. **Two lanes cannot both append to `SimDefs.ComputeChecksum()`.** Appends must be ordered
   (append at the END, before the rules fold), and two lanes appending locally produce a merged
   order matching *neither* lane's locally measured checksum. **Mitigation: the integrator
   pre-assigns append slots per lane in this document before the lanes spawn.**
3. **Two lanes cannot bump the same save chapter in one wave.** E-PEOPLE (`CITZ` v7) and
   E-DECAY (`ITEM` v3) are safe together only because they touch different chapters.
4. **Pin measurement is integrator-only, on main, after merge.** Every lane runs `./ci.sh`
   in-worktree and asserts `twin hashes MATCH` — but **must never assert the literal
   `26907c23d7e48a5c`**, which is guaranteed stale the moment another lane merges. The
   integrator lands a per-wave re-pin commit.
5. **E-MOSS and E-WIRE are the only truly independent lanes** — read-only adapters and a client
   building against recorded wire fixtures. Start them early; they are free parallelism.

---

## 3. The budgets

### 3.1 Hashed state — 7 pin moves, one per reviewable commit

| wave | commit | why it moves |
|---|---|---|
| 0 | W0-1 un-alias the item + citizen hash packs | fold restructure |
| 0 | W0-6 register the economy systems (empty) | 4 new stateful seeds — **one move if one commit** |
| 1 | E0-2 work-rate rebase + movement retune | def values consumed in tick paths |
| 2 | W1-3 / E-STOCK `ReservedForJob : bool` → `ReservedBy : uint` | item pack changes |
| 3 | E-PEOPLE skills → `CITZ` v7 | new citizen fold |
| 4 | E-DECAY item quality/decay → `ITEM` v3 | new item fold |
| 5 | E-VOY fuel → `NAVS` checksum extension | stateful checksum changes |

Waves 1–5 can be *developed* in parallel but must **merge serially**, each re-measuring the pin
on main.

**Prefer keeping the pinned ScenarioRunner scenario economy-free** so the 3-day proof stays a
pure physics canary. (It is a 22×6 single-deck room with two citizens, no designations, no
items — economy *behaviour* is inert there; what moves the pin is new stateful seeds and new
field folds.)

**Find every pin site with a grep, not a list (CORRECTED 2026-07-22).** The old five-site list
was wrong twice: `CLAUDE.md` has **two** pin sites, `MECHANICS.md` has two plus `file:line` cites
that a fold restructure also invalidates, the two golden `.txt` files are a site it omitted
entirely, and the fifth named site — auto-memory — **contains no pin literal at all**, so it was
vacuous. It had already failed once in the wild (`MECHANICS.md` and `HANDOVER.md` both shipped a
slice golden that had moved weeks earlier). Use:

```bash
grep -rnE '\b[0-9a-f]{16}\b' docs CLAUDE.md ci.sh tests
```

which returns the complete set and cannot go stale. Distinguish **live** sites (update) from
**dated session records and deliberate "never assert the literal" examples** (leave frozen), and
note that not every 16-hex literal is a sim pin — the defs checksum looks identical and moves for
different reasons.

### 3.2 Def surface — 50–70 fields, 4–6 **hash-neutral** commits

New/changed: `stock.def`, `production.def` (**table**), `mining.def`, `skills.def`,
`quality.def`, `trade.def`, `goods.def`, `sites.def`, `yields.def`, `factions.def`, plus
extensions to `nav.def`, `atmosphere.def`, `machines.def`, `build.def`, `hydro.def`, and the
`README.def` section list.

The ritual costs **six edits per scalar field**: field + doc comment, `CreateDefault` value,
parser key, **appended** checksum fold (at the END, before the rules fold), the shipped `.def`
line *verbatim equal to the compiled default*, and a **consumption tripwire test**. Measured
precedent: Social S1 landed **15 fields in one commit**, so 4–6 commits is a demonstrated rate.

**CORRECTED 2026-07-22 (measured): the defs checksum DOES move.** Appending a fold for a scalar
field whose shipped value equals its compiled default still moves `CreateDefault().Checksum`
(measured `08b73814d97c7be3` -> `18c26618041a5e0a`, all 30 defs tests green). Shipped-equals-default
guarantees *parsed == CreateDefault*, not *CreateDefault == yesterday's*. Budget for a moved defs
checksum and a `SaveReader` warning on pre-existing saves; only a fold that is a **no-op on empty
data** (the `RuleDef` / W0-5 `[production]` precedent) is genuinely neutral. **The sim pin still
does not move at all** — defs are not in `StateHash`. Def work is therefore the *cheapest* part of this project and should be
scheduled early to unblock content tuning — **provided the tripwire is honoured**. `MECHANICS.md
§13` ("wired but not connected") exists precisely because that step gets skipped.

### 3.3 Save format — 2 chapter bumps, zero changes to `TILE`

- **New state goes in new containers.** Every economy subsystem ships as an `IStatefulSystem`
  with its own `SYSS` blob or FourCC. Unknown FourCCs are length-skipped
  (`SaveReader.cs:136-142`), so a pre-economy save loads into a post-economy build with empty
  economy state and **no reader branch at all**.
- **Extend `CITZ` / `ITEM` only where the state genuinely belongs on the entity**, and exactly
  once per wave: skills on `Citizen` (`CITZ` v7), quality/decay on `ItemStack` (`ITEM` v3).
- **Never touch `TILE` or `DSLS`** — both are exact-version-gated and any bump throws on every
  existing save.
- **Respect the byte ceilings**: `ItemKind` and `DeviceKind` are written and read as single
  bytes. 255 kinds is the hard format ceiling. Plan the widening, don't discover it.
- **Version-*branch*, never version-bail.** `BuildSystem.RestoreState` opens with
  `if (version != 1) return;` — fine with one version, but copied into an economy system it
  means "a v1 save loaded by a v2 build loses every bill and every stockpile, silently."
- **The compat test that must exist and does not:** write a save with the economy systems
  unregistered, load it with the economy build, tick 1000, assert no throw and a stable twin
  hash.

### 3.4 Spine changes, and how to keep each small

- **`Commands.cs` is the cheapest spine file in the repo** — plain sealed classes, no enum, no
  registry. 7–9 new command types, one commit, **zero hash impact**. Copy
  `DesignateBuildCommand`'s optional-system pattern verbatim so an economy-free stack ignores
  the command.
- **`SystemStack.cs` is the one genuinely serialized edit.** Order is load-bearing. Prefer
  **passive registries** (`Tick` a no-op, state command-driven) — `BuildSystem` proves a whole
  vertical can be built that way, which keeps them out of the per-tick cost entirely. Extraction
  is a *job source*, not a system: it belongs inside the dispatcher.
- **`Simulation.CancelJob` must learn every new reservation kind**, or a player move-order
  strands it forever. Better: copy `CraftingSystem`'s validate-on-arrival pattern rather than
  extending cross-tick reservations.
- **Enum rows are append-only.** A new `DeviceKind` is *not* one line: it needs a
  `MachineDefs.Table` row (index = enum order), a matching `CreateDefault` row, an optional
  `machines.def` row, a decision in `Simulation.IsUtilityOverlay`, a `MossBindings` case if
  scriptable, and client sprite/glyph mapping. Budget one commit per 3–5 device kinds.
- **New glyphs cost every golden frame that contains them.** One lane, one golden, stated why.

### 3.5 Performance — the zero-alloc tick path

Zero-alloc is **test-enforced**, not aspirational (`GC.GetAllocatedBytesForCurrentThread()`
deltas asserted `== 0` over 3000 ticks in eight test files — seven pre-economy plus `JobDispatchTests`). Patterns to copy verbatim:
reusable board lists + **generation stamps** instead of clearing (`JobSystem`); `HashSet`/
`Dictionary` for **lookup only, never iterated**; canonical **packed-position** ordering with
binary insert (`BuildSystem`); `stackalloc` top-K insertion sort (`CapabilityComputer`); a
scratch list for deferred removal during iteration; lazy one-time resolution of an optional
stack system; passive systems whose `Tick` is a no-op.

Hard rules for every lane brief: **no LINQ in `Tick`**; no lambdas or closures in tick paths;
no `foreach` over `Dictionary`/`HashSet` anywhere under `sim/` (a *determinism* rule, §4);
struct-of-arrays for per-node conversion state; and **one shared `Pack(Int3)` helper** — it is
already duplicated in two places, and a third copy in the economy is how the packings drift
apart.

Four scaling hazards the codebase already contains, all to be addressed as lane deliverables:
`EntityStore.Remove` is O(n) *and its order is the hash order* (so a swap-remove
"optimisation" would silently reorder every tie-break on the ship — **do not**); `AddItem`
forces a full-world rescan (W0-3); `TryAssign` is O(board) per retry iteration and
`TryReserveMaterialFor` rescans all items per iteration (needs kind-bucketed indexes); and
`CraftingSystem` scans items per station per second (same fix). Ship an explicit "N = 2000
stacks" perf test with E-STOCK.

---

## 4. Determinism traps specific to this work

Every item is a place a new economy could silently break the pins.

1. **Tie-breaks resolve to entity store order.** Every `argmin` uses strict `<`. Store order is
   insertion order. **Never make `EntityStore.Remove` a swap-remove.**
2. **Scan orders are load-bearing**: tiles z,y,x; neighbours `+x,−x,+y,−y`; items/citizens/
   devices in store order. Any new scan must declare its order.
3. **`HashSet`/`Dictionary` must stay lookup-only.** This is the one bug class the test suite
   **structurally cannot catch**: the twin test builds both sims in one process with identical
   insertion order, so a dictionary-order dependency hashes equal in both, and save/load rebuilds
   the same order. **Mitigation is a rule and an integrator grep, not a test** — and it must be
   stated in every lane brief, because a conversion graph is exactly the code where someone
   reaches for `foreach (var kv in _stationBills)`.
4. **Packed positions are worse than they look (CORRECTED 2026-07-22, measured).** `Pack(Int3)`
   masks **none** of its three fields: X occupies bits 0-31, so X<->Y alias from bit 20, Y<->Z from
   bit 40, and z truncates above 2^24 while corrupting `RoomAnchor.Type` above 2^20. *Any* single
   negative coordinate is `0xFFFFFFFF` and floods all three fields, so `(-1,0,0)`, `(-1,-1,0)` and
   `(-1,-1,-1)` are hash-indistinguishable. Latent today (every hashed `Int3` is a bounded in-world
   tile) but live the moment a lane grows the ship. **"Reuse the one shared helper" is misleading —
   the shared helper IS the defect**, and it is duplicated character-identically at
   `Simulation.cs:351` and `BuildSystem.cs:230`. Reuse it *and* fix it to masked 21/21/6 fields
   before any lane grows the ship. That is a pin move; budget it.
5. **Stamp arrays are indexed by BOARD position (CORRECTED 2026-07-22)**, not store position —
   board indices are derived from store order but are not the same thing, and the boards are
   rebuilt wholesale by `Rescan`. The real hazard is therefore **any rescan between `Select` and
   `TryClaim`** (an extraction source refreshing its ore board is the shape that will reach for
   it), not merely "removing items during a scan". `sim/Sim.Core/Jobs/IJobSource.cs` states the
   invariant correctly; treat it as the authority.
6. **RNG:** `CitizenSystem` draws from the shared `sim.Rng`. Any new system drawing from it
   shifts every subsequent draw and moves all pins. **Fork, or do not draw.**
7. **Float accumulation order.** `station.Progress += 1f / WorkSeconds` is a hashed float, safe
   today only because there is exactly one worker per station and one pass per second. Two
   workers, or a skill-derived rate multiplier, makes the sum order-dependent. **Design the
   skill multiplier to be applied once per completed batch, not accumulated per pass.**
8. **The A\* heuristic is inadmissible across decks** (z weighted ×2 while a ladder step costs
   1). Measured 0 of 660 cross-deck paths suboptimal on the 2-deck slice, so it does not bite
   today — but it will on a 4-deck ship, and it makes path length an unreliable cost metric for
   any dispatcher that wants to rank by true walk distance.
9. **`Int3.Manhattan` treats a deck change as one tile.** Measured: Manhattan-nearest is *not*
   path-nearest **28.7 %** of the time (mean penalty 8.2 tiles, worst 29; worst cross-deck
   walk/Manhattan ratio 23×). Every dispatcher inherits this. Deterministic — just wrong.
10. **InvariantCulture everywhere.** The dev machine is de-DE. **The symptom depends on the
    styles (CORRECTED 2026-07-22, measured):** bare `float.Parse("0.5")` yields **5**, because its
    default styles include `AllowThousands`; with an explicit `NumberStyles.Float` the same string
    **fails to parse at all** (`False, 0`). Same hazard, different failure — a silent 100x value in
    one case, a parse *problem* in the other. `NumberStyles.Integer` is culture-inert for unsigned
    decimals, so an integer-only table has no culture exposure and a "culture test" over it is a
    tautology unless it pins the **style set**.
    A `[production]` table of decimal yields is a live hazard, as is every new wire number.

---

## 5. Testing — and how these tests avoid being tautological

### 5.1 The mandatory set, per economy commit

> **Not every item applies to every package (added 2026-07-22).** A package that adds no hashed
> and no serialized state — W0-4's dispatcher refactor is the worked example — cannot fail save
> round-trip, save->load->tick-1000, old-save-without-chapter, def-field, defs-checksum or de-DE
> culture gates, because it does not touch those surfaces. State the applicable subset in the lane
> brief, or a reviewer scores the package against gates it cannot fail and both sides waste a
> round.

Determinism twin · save round-trip (populated) · **save → load → tick 1000 → re-compare**
(new; a restore that drops a derived index hashes equal *at load* and diverges hundreds of
ticks later — exactly the hole an economy's kind-buckets and station→bill maps fall into) ·
old-save-without-the-chapter loads silently · defs default-equivalence · defs mutation probe ·
def-field consumption tripwire · zero-alloc steady state **with a precondition assertion that
the measured path was actually reached** · de-DE culture on every new parse/wire/dump number ·
golden moves single-owner and stated.

Plus a **conservation property test**: units in == units consumed + stored + decayed + losses,
over 3 sim-days, on the slice. The water loop already advertises this shape
(`Simulation.cs:46-48`); the economy should assert it.

Plus a **hash-honesty table test**: for each newly hashed field, mutate exactly that field and
assert `StateHash()` changes. **CORRECTED 2026-07-22 (measured, twice, independently): a
per-field table would NOT have caught either W0-1 bit-alias.** Against the pre-fix fold,
mutating `ItemKind` 4 -> 128 still moves a bit, so that row *passes*. A single-field table finds
*dropped* and *truncated* fields; only a **collision pair** — two distinct states constructed to
hash equal under the packing — finds an *alias*. The mandatory set is therefore a per-field
mutation table **plus**, for any field sharing a word with another, an explicit collision-pair
test. `tests/Perilune.Tests/StateHashHonestyTests.cs` ships both shapes and is the template.

### 5.2 The five anti-tautology rules

Round 3 shipped **three tests that could not fail** — a tautological colour pin, an untested
`prop` class, and a pawn-slide "guard" that recomputed the transform inside the test and
survived the exact mutation it claimed to catch. An economy is mostly bookkeeping code, which
is the easiest thing in the world to write a test *about* rather than *against*.

1. **Never recompute the subject inside the test.** Drive the *real* system and assert
   observable state; never re-derive the expected value with the same expression the code uses.
2. **Every test ships with a named mutation that makes it fail**, stated in its doc comment,
   and **the reviewer actually applies it**. `DefsEquivalenceTests`'s class comment is the
   template.
3. **Assert the path was reached before asserting the outcome.**
4. **Name the test after what it proves, including the limits.**
   `CrewWorkTheBootWindow_FirstTenSimMinutes` is the honest-naming precedent; a test called
   `EconomyIsSustainable` that runs ten sim-minutes is a lie.
5. **A "could not fail" review pass is a merge gate**, run by the independent reviewer, whose
   deliverable is: for each new test, the one-line mutation that breaks it, plus evidence it
   was run.

### 5.3 The project-level gates

`ECONOMY.md` §12.1 (A1–A9). **A1 — "crew are > 25 % busy at sim-hour 24" — is an explicit,
measured acceptance criterion of the whole programme, not an emergent hope.** A conversion
graph with finite ore is a *longer* boot window, not a durable loop, and A1 is what tells the
difference.

**A9 deserves special mention:** CI never exercises the material economy at all today (the
2-crew reference ship has zero designations and `HoldPosition` crew — `RegProd = 0,
RegCons = 0` after a full sim-day). That is precisely how a 64-minute economy shipped
unnoticed. A bounded slice-based economy canary in `ci.sh` is the structural fix.

---

## 6. Process

Reuse the round-3 method verbatim, because it demonstrably worked:

1. **Read-only diagnostic lanes first**, forbidden from editing anything. Only then are fix
   lanes briefed with the *verified* findings, so they cannot re-derive or re-invent the
   diagnosis. (This document is the output of that step for the economy.)
2. **Both an author self-review and an INDEPENDENT reviewer**, on every package. Round 3 proved
   these catch **disjoint** classes of defect: self-review caught the author's mechanical errors
   (a fake test suite where all ten tests passed with both fixes disabled; the discovery that
   adding one `DeviceSpec` would have silently rebound all eight crew portraits). Independent
   review caught what the author could not see (a prompt block instructing the model to deny
   real faults; a permanent crafting-chain deadlock *introduced by the fix*; three tests that
   could not fail).
3. **Reviewers are wrong too, and implementers push back with evidence.** Round 3's reviewers
   produced a wrong throughput figure, a stale test count read from `CLAUDE.md` instead of
   measured, and a specified UV inset that was simply incorrect. Plan for four of six packages
   being sent back before merging — that was the observed rate.
4. **Every lane's exit criterion includes updating `MECHANICS.md` §13** with what it left
   *unconnected*. That list is the institutional memory whose absence let the round-3 bugs ship,
   and an economy multiplies that surface.

---

## 7. The honest risk list

| # | risk | mitigation |
|---|---|---|
| 1 | **Hash-pin thrash across lanes.** N lanes each locally green; merged main matches none of their pins, and the temptation is to "just re-run `UPDATE_GOLDEN=1`" — which is how a regression gets baked in silently. | Lanes never assert the literal; integrator owns a per-wave re-pin commit; goldens single-owner; every regeneration states its cause. |
| 2 | **`ComputeChecksum` append-order collisions.** Silent, and it invalidates every locally measured defs fingerprint. | Pre-assigned append slots, in this document, before lanes spawn. |
| 3 | **Discovering the one-recipe-per-`DeviceKind` wall late.** | W0-5, additively, before E-PROD spawns. |
| 4 | **`EffectKind` bit exhaustion** (2 bits left). | W0-2, before anything. |
| 5 | **`_nextEntityId` silently rebinding all eight crew portraits.** Ids are monotonic and shared across citizens/devices/items; the slice adds devices *before* citizens; portraits key on `pk_fnv1a32(seed, citizenId)`. Round 3's self-review caught that adding **one** `DeviceSpec` would have rebound all eight — and it would move the slice golden and the `SPRITE_URIS` pin, right after Garvin decided **no sprite regen until the design revision**. An economy that adds starting stock or a smelter to `AuthoredShips.cs` triggers exactly this. | Append new economy entities strictly **after** the citizen block; explicit line item in E-CONTENT's brief; add a portrait-stability assertion to the slice test. |
| 6 | **`TILE`'s exact-version gate + one free `TileFlags` bit.** An innocent "let's add a `Mineable` and a `NoHaul` flag" widens the flags array, moves the world hash, and **bricks every existing save**. | Written rule: zones and ore live in registries with their own chapters, never in tile flags. The last bit stays reserved. |
| 7 | **The economy makes the boot-window problem *worse*.** A conversion graph with finite ore is a longer boot window, not a durable loop. | A1 as a hard, measured, named acceptance gate (§5.3). |
| 8 | **Tautological tests.** | §5.2, with the named-mutation requirement as a hard merge gate. |
| 9 | **"Wired but not connected" growth.** §13 already lists four `Citizen` fields written and never read, three unreachable `JobKind`s, and `Morale`/`Health` never written while three UI surfaces render them. An economy multiplies this. | Every lane's exit criterion updates §13 (§6.4). |
| 10 | **Determinism via dictionary enumeration** — structurally invisible to the test suite. | Integrator grep gate, stated in every lane brief. |
| 11 | **`CancelJob` reservation leaks.** Every new reservation kind must be released there or a player move-order strands it forever. | Prefer validate-on-arrival; where a reservation is unavoidable, a test that issues a `MoveCitizenCommand` mid-job and asserts the resource is free again. |
| 12 | **The labour retunes land in the wrong order.** Landing the movement retune or the work-rate rebase before E0-1 would measurably make the game worse while looking like a fix. | E0-1 is a stated hard prerequisite; E0-2 is one integrator-gated commit that includes both retunes. |
| 13 | **Trade becomes a faucet.** The planned trading-hub DLC is the single easiest way to break the closed-mass axiom: a hub with unlimited stock and a farmable currency is a renewable internal source with a shop front — the exact failure §9.6 forbids. The risk is highest in E3, where trade is built by people who will not be the ones authoring the hub. | `ECONOMY.md` §9.7's three rules (finite modelled hub stock, pay only in real goods or labour, spread is a permanent drain — sink S11) go verbatim into the E3 lane brief, and the §5.1 conservation property test must include trade legs, not just internal conversions. |

---

## 8. The first move

> **STATUS 2026-07-22: Wave 0 is partly done. See `HANDOVER.md` "Economy Wave 0 — IN FLIGHT".**
> Merged on branch `lane/economy-w0`: **W0-1** (hash packs un-aliased, pins moved), **W0-2**
> (`EffectKind` widened), **W0-4** (`IJobSource` dispatcher), **W0-5** (`[production]` table,
> integer-ratio loss). In review: **W0-1b**, a package this document did not anticipate — nine
> saved-but-unhashed fields (`Path`, `PathIndex`, `MoveCooldown`, `AutoWander`, four names/labels,
> `PrevPos`) meant two sims with different path progress hashed **equal**, which made W0-4's and
> E0-1's "prove it is neutral" *unprovable*. Not started: **W0-3**, **W0-6**. Wave 0 therefore
> costs **three** pin moves, not two. No E-lane may spawn until W0-3 and W0-6 land.

With the full programme approved, the opening wave is **Wave 0 + B-1/B-2/B-3 + E0-1 + E0-3**,
in that order:

- **Wave 0** is behaviour-free plumbing that becomes roughly 5× more expensive once parallel
  lanes exist. Two pin moves, all six commits integrator-owned, no lane may spawn before it
  lands.
- **B-1 / B-2 / B-3** are bugs on the shipping build (`ECONOMY.md` §13.6). B-3 (CO₂ transport)
  specifically precedes the finite air reserve in E1, or the reserve just kills the crew faster
  and reads as a balance failure.
- **E0-1** (recruitability) is the difference between a crew of 1.43 and a crew of 8. It gates
  every other labour change, including the two retunes Garvin approved — which is why E0-2 is
  a *later* commit than E0-1 despite being the more visible one.
- **E0-3** (dig / stockpile / strip verbs on the web client) unblocks three `JobKind`s and the
  `AgreeTask` conversation verb at near-zero sim cost, and it is the only item in the opening
  wave the player can *see* the same day.

Everything else in E0 then has somewhere to land. The first measurement to take after this wave
is **A1 at sim-hour 24** — it is the gate that distinguishes a longer boot window from a
durable loop, and it is the number the whole programme is judged on.
