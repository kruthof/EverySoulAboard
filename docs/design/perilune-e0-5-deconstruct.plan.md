# E0-5 — Deconstruct / strip as a first-class verb (LANE PLAN)

**Lane:** `lane/e0-5-deconstruct` · worktree `../perilune-wt/e0-5-deconstruct`
**Authority:** `docs/ECONOMY.md` §7.2/§9.3/§9.6, `docs/ECONOMY-PLAN.md` §E0 row E0-5, §3, §4, §5.
**Sequencing:** E0-5 lands **before** E0-4, decided by Garvin 2026-07-23 against the plan's written
order. Rationale + counter-case: `docs/HANDOVER.md` "RECOMMENDED NEXT: E0-5 before E0-4".

---

## 0. Baseline, measured in this worktree before any edit

`dotnet run --project hosts/scenario -- occupancy --ship slice --days 3`

| | value |
|---|---|
| A1 (work-busy at sim-hour 24) | **24.979 %** — FAIL by 0.02, reproduces the handover |
| busy curve | `80 → 75 → 37.5 (h3–18) → 25 (h19–27) → 12.5 (h28) → ~0 (h29+)` |
| **h29–h72 mean work-busy** | **1.480 %** over 44 hours |
| end state | `debris 0 · stockpile 0 · ground: Corpse=1, Potato=699, ControllerModule=31 · crew 8/8` |

**Correction to the record:** the handover and `MECHANICS §13.15` say "0.0 % from h29 onward,
forever". That overstates it. The floor is **1.480 %**, not zero — sporadic maintenance spikes at
h45 (9.5 %), h46 (13.6 %), h48 (6.4 %), h54/h55, h62 (15.0 %), h68 (6.5 %). `MachineWearSystem` is
the *only* demand source that survives the cliff, because wear is a rate and needs no feedstock
until the overhaul actually consumes `Parts`. Fix this sentence in `MECHANICS §13.15` and
`HANDOVER.md` at re-pin time.

**1.480 % is this lane's acceptance floor, not 0.0 %.**

---

## 1. ⚠️ The measurement guardrail is UNSATISFIABLE as written — read this first

`HANDOVER.md` says: *"Re-run `occupancy` immediately after E0-5 and check whether the h29+
flatline actually lifts."* **It cannot lift, and that will not mean E0-5 failed.**

Two independent reasons, both verified in the map:

1. **Deconstruct is player-designated. No authored ship designates anything.** The slice authors a
   dig seed (`ShipPlanBuilder.cs:63`) but there is no deconstruct equivalent and **we are not
   adding one** — deconstruct is *the decision* (`ECONOMY.md` §7.2: *"Deconstruct the gym for its
   70 % — a real, slightly shameful decision"*). Authoring it into a ship deletes the decision.
2. **`hosts/scenario/Program.cs:341-343 IsProductive` is a closed whitelist** and would not count
   the new kind even if work existed.

**Therefore the lane ships its own measurement surface** (WP-4): an opt-in `--strip N` flag on the
`occupancy` verb that designates `N` legal interior walls at t=0 in canonical z,y,x order. Host-only,
zero sim surface, zero pin impact, and the CI-pinned verb-less default path stays untouched.

**Acceptance is then honest and falsifiable:**

- `occupancy --ship slice --days 3` (no flag) → **h29–h72 mean must stay ≈ 1.480 %.** E0-5 is inert
  without player intent. *Any* movement here is a bug — it means something is designating on its own.
- `occupancy --ship slice --days 3 --strip 40` → **h29–h72 mean must rise materially above 1.480 %**,
  and `ground stock` at end-of-run must show `Regolith`/`Scrap`/`Parts` where the baseline shows none.
- If `--strip 40` does *not* lift it, that is the tuning finding the handover wanted — **report it,
  do not tune the yield to manufacture a pass.**

---

## 2. The yield decision — and a divergence from `ECONOMY.md`'s diagram, stated on purpose

The shipped ladder is strictly one-way and terminal (`content/core/SimDefs/recipes.def`):

```
Regolith --SalvageRecycler 1->2-- Scrap --Fabricator 2->1-- Parts --MachineShop 2->1-- ControllerModule
```

`Parts` has **exactly one real sink**: `MachineWearSystem.cs:372`, the overhaul that restores a
machine to `Condition 1.0`. That is the ship's only never-ending demand, and it is what still
produces the 1.480 % floor after the cliff. `ControllerModule` is consumed by nothing (A6).

**Decisions:**

| what | yields | why |
|---|---|---|
| **Wall** | `Regolith`, `floor(wall_material × recovery)` = **1** at shipped values (`wall_material = 2`, recovery 0.5) | The honest inverse of build. `SalvageRecycler`'s *input* is Regolith, so Regolith re-enters the ladder at the top and pays full conversion loss. |
| **Device** | `Parts`, `floor(device_parts × Condition)` | `ECONOMY-PLAN.md` E0-5 row, verbatim. Gives `Condition` its **second consumer** — today every reader outside `MachineWearSystem` is display-only. Feeds the one durable sink directly. |

**Divergence, recorded deliberately:** `ECONOMY.md` §5's flow diagram shows `DECONSTRUCT 70% → SCRAP`.
Do **not** implement that today. In the diagram's post-E0-6 world, `Scrap` is the salvage currency and
the recycler *upgrades* it; in the shipped ladder the recycler *consumes Regolith to make Scrap*, so
yielding Scrap would skip a conversion hop and make tearing down a wall **strictly better than
digging** — inverting the intended lossiness. Yield `Regolith` now; revisit at E0-6 when the graph
inverts. Put this paragraph in the commit message.

---

## 3. Architecture — mirror `BuildSystem`, do not extend `TileFlags`

`TileFlags` has **exactly one bit left** (`1 << 7`) and `ECONOMY.md` §8 reserves it. `TILE` is
exact-version-gated (`SaveReader.cs:105-107`). **The last bit stays reserved.** Also:
`GoalSystem.cs:43-54` documents that `TileFlags.Designated` has exactly one setter in the repo —
reusing that bit for a second verb breaks a documented invariant.

**So: a registry, exactly like `BuildSystem`.**

```
sim/Sim.Core/Systems/DeconstructSystem.cs     -- passive ISimSystem + IStatefulSystem
sim/Sim.Core/Jobs/Sources/DeconstructJobSource.cs
```

- `DeconstructSystem : ISimSystem, IStatefulSystem`; `Name => "Deconstruct"`; `IntervalTicks => 1`;
  **`Tick` is a no-op** (passive registry — keeps it out of the per-tick cost entirely, the
  `BuildSystem` precedent, `ECONOMY-PLAN.md` §3.4); `StateVersion => 1`; seed `0x53545250` (`'STRP'`).
- Canonical store `List<PendingDeconstruct> _pending`, **packed-position sorted with binary insert**,
  copying `BuildSystem.Pack`/`InsertSorted` (`BuildSystem.cs:266-279`) — see §6 hazard 4 on `Pack`.
- `CaptureState` / `RestoreState` **version-branch, never version-bail**
  (`ECONOMY-PLAN.md` §3.3 — `BuildSystem.RestoreState`'s `if (version != 1) return;` is the
  anti-pattern; copy the *corrected* `if (version < 1 || version > StateVersion) return;` shape at
  `BuildSystem.cs:301`).
- `StateChecksum()` folds `Pack(Pos)`, `Kind`, `WorkTicks`, `TargetId`.
- Registered in `SystemStack.cs` **immediately after `new BuildSystem()`** (`:38`), before the W0-6
  economy block. It is build's inverse and belongs beside it. This is **one pin move**, budgeted.

```csharp
public enum DeconstructKind : byte
{
    Wall = 0,   // TileDefs.Wall tile -> Void wall + Floor, yields Regolith
    Device = 1, // a Device entity -> removed, yields Parts x Condition
}

public struct PendingDeconstruct
{
    public Int3 Pos;
    public DeconstructKind Kind;
    public int WorkTicks;   // def-frozen at designate, counted down by the job source
    public uint TargetId;   // Device id for Kind == Device; 0 for Wall
}
```

`TargetId` is hashed and saved: a device can be removed by another path between designate and
completion, and the job source **must** re-validate it on arrival (`CraftingSystem`'s
validate-on-arrival pattern, `ECONOMY-PLAN.md` §3.4) rather than trusting a cross-tick reservation.

### `JobKind.Deconstruct = 11` — appended

Byte enum, append-only. `JobSystem`'s kind table auto-sizes (`JobSystem.cs:57,87`), so no dispatcher
edit. **Every one of these sites needs the new case** — the map found them all, none is optional:

| site | file:line | what |
|---|---|---|
| `DefaultSources()` | `JobSystem.cs:71-76` | add `new DeconstructJobSource()` **after** `BuildJobSource` (registration order = tie-break priority) |
| web task label | `GameSession.cs:1361-1416` | exhaustive switch — else the crew read "Idle" while cutting a wall |
| LLM context prose | `CitizenContext.cs:316-333` | crew must be able to say what they're doing |
| scenario productive predicate | `Program.cs:341-343` | **required for WP-4 to measure anything** |
| `EffectValidator.AgreeTask` | `EffectValidator.cs:110` | **DO NOT widen.** Whitelist stays `Dig`-only; that escape is E2's brief, not this lane's. State it in the commit message so a reviewer doesn't score it as an omission. |

`Simulation.CancelJob` (`:130-160`) needs **no change** — deconstruct holds no item reservation and
no cargo. Verify, don't assume: WP-1 ships a test that a `Flee` pre-emption
(`SafetySystem.cs:96-102`) mid-deconstruct leaves the site re-claimable and leaks nothing.

---

## 4. The pressure-hull guardrail — the load-bearing safety rule

> `ECONOMY.md` §9.3: ***"Never allow stripping the pressure hull itself — VISION: the hull is the
> canvas edge."***

**There is no hull tile kind, no hull flag, and no saved hull state.** The only structural hull
concept in the repo is `Room.HasHullContact` (`RoomState.cs:242-263`) — derived, unsaved, unhashed,
per-*room*-tile, and consumed only by `ThermalSystem`. It is the right *idea* and the wrong *shape*.

**Ship a wall-side predicate**, static, pure, no new state:

```
IsPressureHull(world, pos) :=
    world.GetWall(pos) == TileDefs.Wall
    AND any 4-neighbour (in the canonical +x, -x, +y, -y order) is
        off-map  OR  world.GetFloor(n) == TileDefs.Void
```

i.e. **a wall is hull iff it separates the interior from vacuum or the map edge.** This is exactly
the test `World.cs:13-14` already names (*"why 'adjacent to void' is a meaningful hull test"*).

**Honest limits, to be written in the doc comment and repeated in `MECHANICS §13`:**
- **In-plane only (4-neighbour), no z-axis term** — deliberate parity with `HasHullContact`. A wall
  on the top deck with vacuum *above* it is not detected. Ships are `64×20×2`; the decks are stacked
  interiors, so this does not bite today. It will on an open-topped ship. Say so.
- It is a *geometric* test, not a structural one. There is no hull-stress model
  (`ShipSystems.cs:650-694` says so explicitly).

**`CanDesignate` rejects, in this order** (mirror `BuildSystem.CanDesignate`, `:100-124`):
1. out of bounds
2. already designated at `pos`
3. `_pending.Count >= max_staged`
4. **Wall:** `GetWall(pos) != TileDefs.Wall` (so `Debris` stays dig's, `Void` is nothing) — **then
   `IsPressureHull(pos)` ⇒ REJECT**
5. **Wall:** a living citizen standing on the tile ⇒ reject (copy `BuildSystem`'s check)
6. **Device:** `TryGetDeviceAt` must resolve; **and see §5 on which kinds are legal**

### Completion consequences — all of them, none skipped

`ECONOMY.md` §9.3 names three consequences and **all three already have systems**:

- **Wall:** `SetWall(pos, 0)` + `SetFloor(pos, TileDefs.Floor)` + **`Rooms.MarkDirty()`** +
  `PowerDirty = true`, then `AddItem(Regolith, yield, pos)`, publish `TileChangedEvent`,
  `JobsDirty |= Tiles`. Copy `DigJobSource.cs:138-148` — it is the exact existing template for
  "remove a wall, drop an item". **The room merge and gas redistribution then happen for free**
  through `Rooms.MarkDirty()` + `AtmosphereSystem`. That is the "strip the wrong bulkhead and you
  decompress the mess hall" moment, and it needs no new code — **but it needs a test that proves it.**
- **Device:** `sim.RemoveDevice(id)` (`Simulation.cs:87-100`) — which already clears the device grid,
  clears `TileFlags.HasDevice`, marks rooms dirty and bumps `DeviceTopologyVersion`. Then
  `AddItem(Parts, floor(device_parts × Condition), pos)`.
  **The MOSS consequence is a feature, not a bug**: removing a named device un-registers its adapter,
  so a player can break their own automation. Do not defend against it. **Do** ship a test that a
  MOSS script bound to a stripped device fails legibly rather than throwing.

---

## 5. Which devices may be stripped

`RemoveDeviceCommand` today is gated on `PlaceDeviceCommand.IsPlaceableFurniture`
(`Commands.cs:195-212`) — 9 furniture kinds, yields nothing. Deconstruct is a **different, wider**
verb and must not reuse that whitelist.

**Decision: any device is strippable except `DeviceKind.Door`.** Doors are `BuildSystem`'s output
(`BuildSystem.cs:236`) and their inverse is build-cancel, not strip; allowing both creates two
owners for one object's lifetime. Everything else — including life support — is legal, because
stripping the scrubber to make rent **is the game**. The crew-safety system (E0-2's `SafetySystem`)
already handles the consequence.

If the implementer finds a device kind whose removal throws or corrupts state, **do not silently
whitelist around it — report it as a finding.** That is a real bug in `RemoveDevice`.

---

## 6. Determinism — the traps that apply here (`ECONOMY-PLAN.md` §4)

Applicable subset, each to be honoured explicitly:

1. **Scan order is load-bearing.** The job source's tile board fills from the dispatcher's single
   z,y,x pass via `IJobTileScanner` (`IJobSource.cs:184-196`) — **do not add a private scan.**
   Hull-predicate neighbours iterate `+x, −x, +y, −y`.
2. **No `foreach` over `Dictionary`/`HashSet` anywhere under `sim/`.** Lookup-only. This is the bug
   class the twin test **structurally cannot catch** (§4.3) — it is a rule and an integrator grep.
3. **`Pack(Int3)` masks none of its fields** and is duplicated character-identically at
   `Simulation.cs:351` and `BuildSystem.cs:230`. **Copy it as-is; do NOT fix it in this lane** — the
   masked-21/21/6 fix is its own pin move and its own package. A third copy is acceptable here only
   because fixing it is explicitly out of scope; note the third copy in the commit message so the
   eventual fix lane finds it.
4. **No rescan between `Select` and `TryClaim`** — stamp arrays are indexed by *board* position
   (§4.5). `IJobSource.cs:14-35` is the authority on the five-point arbitration contract.
5. **Do not draw from `sim.Rng`.** Deconstruct has no random term. Fork or do not draw — and it
   does not need to.
6. **Never make `EntityStore.Remove` a swap-remove** — device strip calls `RemoveDevice`, which is
   O(n) *and its order is the hash order*. Leave it alone.
7. **Zero alloc in the tick path**, test-enforced with a **precondition assertion that the measured
   path was actually reached** (§5.1) — a zero-alloc test over a board that was never populated is
   a tautology.
8. **InvariantCulture** on every new parse. Dev machine is de-DE; bare `float.Parse("0.5")` yields
   **5**. `recovery` is a decimal def value ⇒ **live hazard**.

---

## 7. Def surface — the ritual, six edits per scalar

New section `[deconstruct]` in a new `content/core/SimDefs/deconstruct.def`:

| key | default | notes |
|---|---|---|
| `wall_recovery` | `0.5` | fraction of `build.wall_material` returned. **Decimal ⇒ culture hazard.** |
| `wall_work_ticks` | `1200` | half `wall_construct_ticks` (2400). Tearing down is faster than building. Post-E0-2 scale: 2 sim-minutes. |
| `device_parts` | `2` | base `Parts` before `× Condition`. Matches `MachineShop`'s 2-Parts input so one stripped machine ≈ one ControllerModule of value. |
| `device_work_ticks` | `900` | 1.5 sim-min, between maintenance (900) and a wall. |
| `max_staged` | `64` | mirrors `build.max_staged`. |

**Per field, all six edits in the SAME commit** (`CLAUDE.md` hard rule): field + doc comment ·
`CreateDefault` value · parser key · **checksum fold appended at the END, before the rules fold**
(`SimDefs.cs:820` — the rules fold stays last) · the shipped `.def` line **verbatim equal to the
compiled default** · a **consumption tripwire test**.

Also: `DefsParser` section enum (`:31`) + header mapping (`:144`) + key switch; and a row in
`content/core/SimDefs/README.def`'s section list.

**Expect the defs checksum to MOVE** — measured precedent, `ECONOMY-PLAN.md` §3.2: appending a fold
moves `CreateDefault().Checksum` even when the shipped value equals the default. That is normal.

---

## 8. Surfaces — the `strip` verb

`ECONOMY-PLAN.md`'s E0-3 row listed `strip` alongside `dig`/`stockpile`; E0-3 correctly deferred it
here. Copy E0-3's shape exactly (`DesignationVerbTests.cs` is the test template):

- **`DesignateDeconstructCommand`** in `Commands.cs`, copying **`DesignateBuildCommand`'s
  optional-system walk** (`:163-164`) so a sim without `DeconstructSystem` ignores it. The `on` flag
  is **EXPLICIT**, not a host-side read of world state — E0-3's decision, so a sweep is idempotent
  and the host never races the sim.
- **Web:** `CmdKind.Strip` (`GameSession.cs:1544`), `case "strip":` in `Parse` (`:1597` neighbourhood),
  dispatch case (`:239-257`), a `HandleStrip` beside `HandleDesignate` (`:628-643`).
- **Client:** wire builder (`wire/session.js:68-69`), click mapping (`input/controls.js:63-64`),
  keybind (`input/controls.js:226-230`), armed tool (`ui/console-model.js:217,227,255-256`), HUD
  button + key map (`ui/hud.js:270-271,411`).
  **Key: `X`.** Not `S` (already bound), not `D` (vim-adjacent). Verify against the live map before
  committing — E0-3 caught `H` being silently dead this way.
- **TUI:** `GameLoop.cs:296-320` neighbourhood.
- **Glyph:** **append `Deconstruct = 26`** to `GlyphColor` (`GlyphColor.cs:11-39`). There is **no**
  spare reserved colour — `Water`(13)/`Growth`(14) are declared-but-unemitted and semantically wrong;
  reusing one would be a lie in the golden format. Append-only is safe (`:5-10`) and **no shipped
  golden moves**, because no shipped ship carries a deconstruct designation. Needs matching entries
  in the TUI skin (`AnsiPaint.cs`, a total switch) **and** the client palette table.
  Emitter goes in `GlyphMapper.Project`'s designation block (`:69-71`), **after** the existing
  `Designated`/`Stockpile` precedence — state the new precedence in the doc comment there.

---

## 9. Work packages — one reviewable commit each

| WP | content | gate |
|---|---|---|
| **WP-1** | `DeconstructSystem` + `PendingDeconstruct` + `DeconstructKind` + `IsPressureHull` + `JobKind.Deconstruct` + `DeconstructJobSource` + `SystemStack` registration + `DesignateDeconstructCommand`. **Walls only** — `DeconstructKind.Device` declared and rejected by `CanDesignate` with a stated TODO(WP-2). | full §10 set. Moves scenario + both tick-3000 goldens (new stateful seed). |
| **WP-2** | Device strip: `CanDesignate` accepts `Device`, arrival re-validation, `RemoveDevice` + `Parts × Condition`, the MOSS-adapter test. | §10 set. **Cuttable** — if WP-1 overruns, WP-2 defers and the lane still lands a coherent verb. |
| **WP-3** | ~~The `strip` surface~~ → **REDEFINED (Garvin, 2026-07-23), see below.** Close the place→strip matter faucet: `PlaceDeviceCommand` charges `build.device_place_cost` **Parts**, plus WP-2's two review findings (the compound arrival guard; the yield defs unproven on the shipping path). | defs ritual + full-dispatcher tripwires + all-or-nothing refusal. **Defs checksum moves; no sim pin moves.** |
| **WP-4** | The `strip` surface (defs done, command done: web/TUI/client, `GlyphColor.Deconstruct`) **and** the `occupancy --strip N` harness + `IsProductive` + the re-measurement. | §8's list; host-side parts have **no pin impact**. |

**Why WP-3 was redefined.** WP-2's independent review measured an **unbounded matter faucet**:
`PlaceDeviceCommand` charged nothing, and WP-2 made the device it places worth
`floor(device_parts × Condition)` = 2 Parts. Place → strip → repeat yielded **1 Part per 476
ticks with zero matter input**, against **15 000 ticks + 1 Regolith** for the same Part through
the shipped `recipes.def` ladder — feeding `MaintenanceSystem`, the one sink that never ends.
Nothing bounded it: not material (free), not `max_staged` (a queue-depth cap, not a rate cap),
not tiles, not kind. It is not player-reachable until the `strip` verb ships, **so the loop had
to close before the surface did** — §8's UI work moves to WP-4 behind it.

WP-1 and WP-3's def work may be co-committed if that keeps the def-field ritual atomic — **the
ritual's atomicity wins over the WP boundary.**

---

## 10. Tests — the applicable subset, and every one ships its mutation

`ECONOMY-PLAN.md` §5.1 note: *state the applicable subset, or a reviewer scores the package against
gates it cannot fail.* This lane adds hashed **and** serialized state, so **the full set applies**:

determinism twin · save round-trip (populated) · **save → load → tick 1000 → re-compare** · old-save
**without** the `Deconstruct` chapter loads silently (unknown FourCCs are length-skipped,
`SaveReader.cs:136-142`) · defs default-equivalence · defs mutation probe · def-field consumption
tripwire · **zero-alloc steady state with a precondition assertion the board was populated** · de-DE
culture on `wall_recovery` · golden single-owner and stated.

Plus, specific to this lane:

1. **`IsPressureHull` bites** — designate an exterior wall ⇒ rejected; designate an interior
   partition ⇒ accepted; **on the real slice**, not a synthetic 3×3.
2. **The bulkhead consequence** — strip an interior wall between two rooms, tick, assert the two
   `RoomId`s merged and pressure equalised. This is `ECONOMY.md`'s named moment; if it silently
   doesn't happen, the feature is cosmetic.
3. **Conservation** (§5.1) — over 3 sim-days on the slice with `--strip`: matter in == consumed +
   stored + losses. Deconstruct is the first **one-way source**, so the ledger must balance with it.
4. **Hash-honesty table** for every new hashed field, **plus a collision-pair test** for any field
   sharing a word (§5.1: a per-field table would NOT have caught either W0-1 alias).
   `StateHashHonestyTests.cs` ships both shapes — it is the template.
5. **Flee pre-emption** mid-deconstruct leaves the site re-claimable and leaks nothing.
6. **Device-strip re-validation** — remove the target device by another path between designate and
   arrival; assert the job abandons cleanly and yields nothing.

**The five anti-tautology rules (§5.2) are merge gates, not advice:**
never recompute the subject inside the test · **every test's doc comment names the mutation that
makes it fail, and the independent reviewer actually applies it** · assert the path was reached
before the outcome · name the test after what it proves *including its limits*
(`CrewWorkTheBootWindow_FirstTenSimMinutes` is the precedent — a test called `DeconstructWorks`
that runs 10 sim-minutes is a lie) · a "could not fail" pass is a **merge gate**.

Round 3 shipped three tests that could not fail. This lane is mostly bookkeeping code, which is the
easiest thing in the world to write a test *about* rather than *against*.

---

## 11. Expected pin movement — measure, never predict

WP-1 adds a new stateful system whose seed folds unconditionally ⇒ **the scenario hash and BOTH
tick-3000 goldens move**, exactly like W0-6. WP-3's def fold ⇒ **the defs checksum moves.**
The behaviour on every pinned ship is **inert** (nothing designates), so the moves should be
*fold-only*.

Current (pre-lane): scenario `85ac8c44233284e9` · tick-3000 `9b834cffc232ce7f` · slice
`8c6b2544fac36d63` · defs `e56d33a2e46b5644`.

Find every pin site with the grep, **not a list** (§3.1 — the old five-site list was wrong twice):

```bash
grep -rnE '\b[0-9a-f]{16}\b' docs CLAUDE.md ci.sh tests
```

Distinguish **live** sites from dated session records and deliberate "never assert the literal"
examples. Not every 16-hex literal is a sim pin — the defs checksum looks identical and moves for
different reasons. Re-pinning is **integrator-only, on `main`, after merge**.

---

## 12. Explicitly out of scope

- **E0-4 stockpile zones.** Next, immediately after. **Do not zone stockpiles in any authored ship**
  ~~until it lands — that keeps the measured −14 % throughput regression latent.~~
  **⚠️ 2026-07-25 — E0-4 has landed, and there is no "measured −14 % throughput regression":** it is
  `ECONOMY.md` §8's figure, E0-4 never reproduced it, and the slice **cannot settle** it (not
  disproved — unsettleable). **The advice still stands; the reason is now a DESIGN DECISION, not a
  measurement** — a zone is the player's decision, so authoring one deletes it. See `MECHANICS.md`
  §13.18.
- Fixing `Pack(Int3)`'s field aliasing (§6.3) — its own package, its own pin move.
- Widening `EffectValidator.AgreeTask` past `Dig` — E2.
- Hull *stress*; `Scrap`-yield deconstruct (E0-6); derelict stripping (E3).
- Promoting `BuildSystem`'s hardcoded floor literals (`:253-254`) to defs.
