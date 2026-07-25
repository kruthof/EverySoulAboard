# PERILUNE — Mechanics, as implemented

*Written 2026-07-21 against commit `0f88231`. **This document describes what the code
does, not what the design wants.** Every number below was read out of a source file or a
`.def` file in one sitting and is cited `file:line` or `def-file:key`. Where
`docs/legacy/GDD.md` or `docs/legacy/TDD.md` disagree with the code, the code is truth —
those disagreements are listed in §14. If something could not be verified it says
"unverified" and why.*

**Companion docs:** `ARCHITECTURE.md` (module structure) · `VISION.md` (intent) ·
`PLAN.md` (phasing) · `HANDOVER.md` (state). This file is the missing middle: *what
actually happens, and where do I change it*. **§13 "Known gaps" is the most valuable
section — read it before you conclude a mechanic works.**

> **⚠ In-flight work.** Four packages were being implemented in parallel while this was
> written and will change behaviour. Every section describing one carries a visible
> **IN FLIGHT** note plus an HTML comment so a reconciliation pass can `grep "IN FLIGHT"`
> and find them all: movement tuning (§5.4) · the slice build/work economy (§6.5) ·
> CO2→maintenance dispatch and the `AgreeTask` whitelist (§13.1) · task labels and the
> build-ghost wire fields (§13.4, §15).

---

## 1. The tick model & determinism contract

**10 Hz fixed tick.** `Simulation.TicksPerSecond = 10`, `TickSeconds = 1/10`
(`sim/Sim.Core/Simulation.cs:14-15`). One sim-day = `10 × 60 × 60 × 24 = 864,000` ticks
(`sim/Sim.Core/Systems/HistorySystem.cs:53`, `SimClockUtil.TicksPerDay`).

`Simulation.Tick()` (`Simulation.cs:205-226`) does exactly four things, in order:

1. **Drain the command inbox.** Every queued `ISimCommand` executes in arrival order
   (`Simulation.cs:208-210`). This is the *only* input channel — player orders, MOSS
   writes and LLM effects all arrive here.
2. **`Rooms.RecomputeIfDirty(this)`** — an owned tick phase before any system reads room
   state (`Simulation.cs:214`), so no consumer depends on which system recomputes first.
3. **Run systems in fixed registration order at their cadence**:
   `if (_tick % system.IntervalTicks == 0) system.Tick(this)` (`Simulation.cs:217-221`).
4. Then `Events.SwapBuffers()` and `_tick++` (`Simulation.cs:224-225`). The event bus is
   **double-buffered**: an event published on tick *N* is readable on tick *N+1* only.
   That is why every event-reading system runs at `IntervalTicks = 1`.

### The system stack

`SystemStack.CreateDefault` (`sim/Sim.Core/SystemStack.cs:20-50`) is the one authoritative
order. Order is load-bearing (see the class comment).

| # | System | `IntervalTicks` | Effective rate | Source |
|---|--------|-----------------|----------------|--------|
| 1 | `AtmosphereSystem` | 2 | 5 Hz (Dt 0.2 s) | `Systems/AtmosphereSystem.cs:14,16` |
| 2 | `PowerSystem` | 10 | 1 Hz | `Systems/PowerSystem.cs:14` |
| 3 | `NavSystem` | 10 | 1 Hz | `Space/NavSystem.cs:25` |
| 4 | `ThermalSystem` | 5 | 2 Hz (Dt 0.5 s) | `Systems/ThermalSystem.cs:29,33` |
| 5 | `WaterSystem` | 5 | 2 Hz (Dt 0.5 s) | `Systems/WaterSystem.cs:18,20` |
| 6 | `CitizenSystem` | 1 | 10 Hz | `Systems/CitizenSystem.cs:11` |
| 7 | `JobSystem` | 1 | 10 Hz | `Jobs/JobSystem.cs:25` |
| 8 | `SustenanceSystem` | 10 | 1 Hz | `Systems/SustenanceSystem.cs:22` |
| 9 | `CraftingSystem` | 10 | 1 Hz | `Systems/CraftingSystem.cs:58` |
| 10 | `MachineWearSystem` | 10 | 1 Hz | `Systems/MachineWearSystem.cs:22,24` |
| 11 | `MaintenanceSystem` | 10 | 1 Hz | `Systems/MachineWearSystem.cs:125,127` |
| 12 | `BuildSystem` | 1 | passive — `Tick` is a no-op | `Systems/BuildSystem.cs:52,65` |
| 13 | `HydroponicsSystem` | 10 | 1 Hz | `Systems/HydroponicsSystem.cs:13` |
| 14 | `NeedsSystem` | 10 | 1 Hz | `Systems/NeedsSystem.cs:14,16` |
| 15 | `SocialSystem` | 10 | 1 Hz | `Social/SocialSystem.cs:47` |
| 16 | `ExplorationSystem` | 10 | 1 Hz | `Systems/ExplorationSystem.cs:13` |
| 17 | `GoalSystem` | 10 | 1 Hz | `Systems/GoalSystem.cs:37` |
| 18 | `DirectorSystem` | 1 | 10 Hz (heavy pass gated to every 100 ticks) | `Director/DirectorSystem.cs:36`, `director.def:period_ticks` |
| 19 | `HistorySystem` | 1 | 10 Hz | `Systems/HistorySystem.cs:74` |
| 20 | `DesignerRuleSystem` (optional) | 1 | 10 Hz | `Sim.Dsl/DesignerRuleSystem.cs:39` |
| 21 | `ScriptRuntime` (MOSS) | 1 | 10 Hz | `Sim.Dsl/ScriptRuntime.cs:42` |

The **LLM hosts wrap this stack** (`hosts/tui/SimHost.cs:166-187`, mirrored by the web
host's `Bootstrap`): `EffectPump` is prepended at index 0 (**must run first**), and
`MemorySystem` + `EulogySystem` are appended at the end. `hosts/scenario` uses
`SystemStack.CreateDefault` **unwrapped** (`hosts/scenario/Program.cs:293`) — which is why
the pinned determinism hash below is the *scenario* stack's, not the game's:
`MemorySystem` is an `IStatefulSystem`, so registering it adds a `MEMS` fold to
`StateHash` (`Citizens/CitizenMemory.cs:222-231`). `EffectPump` normally touches only
host-owned mind state, but `AgreeTask` is the one effect that writes hashed sim state
(§10.3) — with no LLM attached (minds empty) it is inert.

Note the hoist at `SystemStack.cs:24`: **one** `DirectorSystem` instance occupies two
slots — `MachineWearSystem` holds a reference to it (reading last pass's lever) while the
Director itself ticks late in the frame.

### RNG

All randomness is `SimRng` (xoshiro256**, `Rng/SimRng.cs`). Systems that need dice
**fork a private stream** so they can never perturb another system's sequence:
`Fork(streamId)` derives four fresh words from `_s0 ^ (streamId * 0xBF58476D1CE4E5B9)`
without advancing the parent (`SimRng.cs:31-36`). Exactly two call sites fork **`sim.Rng`**:
`SocialSystem`'s argument/bond stream (`0x50C1A1`, once on its first pass —
`Social/SocialSystem.cs:52,85`) and `PersonaGenerator` (`0x5045524C554E45 + citizenId`,
per citizen at worldgen — `Citizens/PersonaSheet.cs:98,176`). Two more `Fork` calls exist in
`Sim.Gen` — `ProceduralShips.cs:25` (`0x5417`) and `ShipRecipe.cs:33` (`0x5EC1DE`) — but each
forks a **fresh `new SimRng(seed)`** it owns, never the running sim's stream, so they cannot
perturb a tick.

`CitizenSystem` is the **only** system that takes `sim.Rng` directly
(`Systems/CitizenSystem.cs:29`, used at `:65` for the idle wander target) — verified by
grep across `Sim.Core`/`Sim.Dsl`/`Sim.Gen`. So idle wandering is the only thing advancing
the global stream in a normal tick.

### What is hashed

`Simulation.StateHash()` (`Simulation.cs:280-393`) folds, in order: tick, RNG state (4
words), the whole world (`Floor`/`Wall`/`Flags`/`RoomId` arrays per deck,
`World/World.cs:65-76`), every citizen field, every item, every device, every room's
`TileCount`/`O2Moles`/`CO2Moles`/`N2Moles`/`TemperatureK`, room anchors,
`WastewaterLiters`, then **every `IStatefulSystem.StateChecksum()`** in stack order
(`Simulation.cs:389-391`).

The fold's own rules since 2026-07-22 are **no field may share a bit with another** (W0-1)
and **a variable-length member folds its length before its entries** (W0-1b — `Path` is the
only one; without the count, path tiles can shuffle between two crew members and hash the
same, and `StateHashHonestyTests` constructs that exact collision pair). A multi-field word
is allowed only where every contributor is a statically-bounded `byte`
or a 1-bit flag, and anything that could grow gets its own `XxHash64.Combine`. Before
W0-1 the citizen and item packs aliased — `ItemKind` bit 7 landed on `ReservedForJob`'s
bit 39, `ItemStack.Count` was clipped to 24 bits, and `JobWorkTicks` (bits 16–47)
overlapped `CarryingItemId` (bits 32–63), so an item kind ≥ 128, a stack above 2^24, or a
job longer than 65,535 ticks (109 sim-min) made two genuinely distinct states hash EQUAL.
Not a determinism break; canary blindness. `tests/Perilune.Tests/StateHashHonestyTests.cs`
is the table test that pins every field of both folds, including the three collision pairs.
Still packed and *deliberately* so: `Faction | Archetype << 8` (both `byte`), the citizen
flag word (`Dead`/`RevealsFog`/`HoldPosition`, 1 bit each), and the device word
(`DeviceKind` byte, three flags, `ushort NetworkId` at 16–31, `Rate` bits at 32–63 — audited
alias-free at W0-1). **Not** fixed and still known-lossy, both out of W0-1's scope:

- **`Pack(Int3)` overlaps all three axes.** None of the three fields is masked: X is
  `(uint)p.X` at bits 0–31, Y is `(uint)p.Y << 20` at bits 20–51, Z is `(uint)p.Z << 40` at
  bits 40–63 (the top 8 bits of Z fall off the word entirely). So the nominal 20-bit lanes
  hold only while every coordinate is in `[0, 2^20)`; any negative coordinate is
  `0xFFFFFFFF` and floods every lane above it, and `(-1,0,0)`, `(-1,-1,0)` and `(-1,-1,-1)`
  are hash-indistinguishable. `ECONOMY-PLAN.md` §4.4 states this as "aliases on negative
  coordinates and breaks past 2^20"; the negative case is the sharper half. Duplicated
  verbatim at `Simulation.cs:396` and `Systems/BuildSystem.cs:230` — §3.5's "one shared
  `Pack` helper" should mask each field when it lands, which is a further pin move.
- **The room-anchor word shares bits with `Pack`.** It is
  `Pack(Probe) | ((ulong)Type << 60)`, and because Z reaches bits 40–63 (above), `Type`'s
  bits 60–63 sit on top of Z's bits 20–23. Measured: `anchor(z = 2^20, Type = None)` and
  `anchor(z = 0, Type = Corridor)` both pack to `0x1000000000000000`, and
  `anchor(z = -1, Type = None)` corrupts the `Type` bits outright. **It is safe today only
  because `Probe.Z` is a deck index (≤ 3), not because the fields were given disjoint
  lanes.** Separately, `Type` has exactly 4 usable bits before it runs off the top of the
  word: `RoomType` (`Rooms/RoomType.cs:9-26`) declares 16 members, `None = 0` …
  `LifeSupport = 15`, which fills them exactly — every shipping member is fine, and it is
  the **17th** that would silently fold onto `None` (measured: `anchor(Type = 16) ==
  anchor(Type = 0)`).

`sim.Defs` is deliberately **not** hashed (`Simulation.cs:26`) — both determinism twins
share one instance; the defs identity rides the `DEFS` save chapter instead
(`Save/SaveWriter.cs:342-345`).

Not hashed: `Room.HullTiles` (pure function of the grid, `Rooms/RoomState.cs:26`, and not
saved), `ZLevel.RegionId`, the job board (purely derived), the device grid index,
`PowerSystem`/`WaterSystem`'s internal network dictionaries, the `SYSS` chapters' own
human-readable text (`GoalSystem` `Param`/`Text`, `HistorySystem` entry text — see below),
and the entire mind/persona/fact layer *unless* a `MemorySystem` is registered (then its
`'MEMS'` checksum joins — `Citizens/CitizenMemory.cs:222-231`).

**Scope of the "saved ⇒ hashed" rule, stated precisely, because a looser version of this
sentence has now been wrong twice.** Every field of the **header, `TILE`, `ROOM`, `CITZ`,
`DEVC`, `ITEM` and `DSLS`** chapters is folded by `StateHash`. `SYSS` is *not* covered
field-by-field: each `IStatefulSystem` owns its own `StateChecksum` and several deliberately
exempt their prose. `DEFS` is deliberately unhashed. Do not restate this as "everything
saved is hashed" — that phrasing is what hid thirteen fields.

Until 2026-07-22 the fold silently missed **thirteen** saved fields. Nine were found by
economy W0-1b: `Citizen.Name`, `PrevPos`, `AutoWander`, `Path[]`, `PathIndex`,
`MoveCooldown`, `IdleCooldown` (`Save/SaveWriter.cs:241-249`), `ItemStack.Label` (`:319`)
and `Device.Name` (`:287`). Four more were found by its **independent review, after that
package had already written "the list is now complete"**: the save header's `NextEntityId`
(`:147`), `RoomAnchor.Name` (`:218`) and `ScriptEntry.TerminalId`/`.Source` (`:333-334`).

Three of the citizen fields are live tick state read and written by `CitizenSystem` every
pass, so **two sims at different path progress hashed equal**, and `AutoWander` is a
behaviour gate (`Systems/CitizenSystem.cs:61`), so two sims about to diverge hashed equal at
load. The four late ones are the same class of hazard on other keys: `NextEntityId` decides
the id of the next spawn (and every tie-break on the ship resolves to entity store order);
`RoomAnchor.Name` **is** the MOSS room namespace, so a renamed anchor unbinds every
`room.<name>` reference exactly as a renamed device unbinds an adapter; and a MOSS source
*is* the player's program, not a label for it (`Simulation.cs:171`, TDD §4.5).

W0-1b folds all thirteen. Strings go through `XxHash64.Combine(ulong, string)`, which folds
length then each UTF-16 code unit — ordinal, culture-free, allocation-free, and never
`string.GetHashCode()`, whose seed .NET randomizes per process (a *non-deterministic* canary
would be worse than a blind one). This mattered beyond tidiness: a job-dispatcher refactor's
most likely regression is a different job→crew assignment producing a *different path of
equal length*, which the canary could not see. To reproduce the blindness, run the
`Citizen.PathIndex`, `Citizen.AutoWander` or `Citizen.Name` row of
`StateHashHonestyTests` against the parent commit `59049f1` — each fails with the twins
hash-**equal**.

The blanket "project convention: strings are hash-exempt" that `GoalSystem.StateChecksum`
used to cite is **retired**: it was too broad, because three of the six newly folded strings
are *binding keys*, not prose. The rule that replaces it is written at that call site — an
entity field the save format writes is hashed; a `SYSS` chapter decides for itself; and
human-readable text stays exempt so a copy-edit cannot move a determinism pin.

Careful here: the **per-device** `NetworkId` (`Simulation.cs:357`), `FluidNetworkId`
(`:364`) and `Powered` (`:356`) *are* hashed and saved, even though they are derived —
deliberately, so a load hashes equal immediately while `PowerDirty = true` rebuilds them
(`Save/SaveWriter.cs:273-275`).

**Determinism pins** (move them only with the hash-move ritual, and update `ci.sh` +
`CLAUDE.md` in the same commit): 3-day seed-42 scenario hash `85ac8c44233284e9`
(pinned in `ci.sh`); tick-3000 golden `9b834cffc232ce7f`; slice tick-3000 golden
`8c6b2544fac36d63`; defs checksum `e56d33a2e46b5644` (this is `SimDefs.Default.Checksum`, the
compiled-default fingerprint the docs track — NOT the scenario host's rules-inclusive `defs:`
print, which is a different value). The scenario + slice pins + defs checksum most recently moved
with **E0-2** (work-rate rebase 10× + movement retune `ticks_per_tile` 5→10 + the crew-safety
`SafetySystem`/`JobKind.Flee` guard, 2026-07-23) — a REAL behaviour change (human-pace crew doing
minutes-long watchable work): scenario `a53d8505`→`85ac8c44`, slice `9a84a72f`→`8c6b2544`, defs
`60147a5`→`e56d33a2` (the changed work-rate defs + the new `flee_suffocation` field). The
tick-3000 golden held (`9b834cffc232ce7f` — the default ship's 2 crew neither move nor work within
3000 ticks). Before E0-2, the **wall drag-build + materials** feature moved scenario
`494ad0b0`→`a53d8505`, tick-3000 `0f66ffdf`→`9b834cffc232ce7f`, slice `d93165a4`→`9a84a72f` (an
all-zero `World.Material` fold); and before that **E0-1** (recruitability) moved the slice golden
`994aa1ac`→`d93165a4` and the defs checksum `81ae90b`→`60147a5` (wandering crew now recruited:
`IsIdleForWork` no longer vetoes a wander path, plus a `wander_radius_tiles` def field), holding
both StateHash pins. Before E0-1 the slice golden was `994aa1ac661aa1cc` and the defs checksum
`81ae90bdd049f745`, both of which had moved with the **B-1/B-2/B-3**
shipping-bug fixes (2026-07-23) — the first pin moves that are real BEHAVIOUR changes rather
than pure folds (B-1 releases a stranded crafting reservation on the slice; B-2's greywater
makeup floor keeps the hydro loop alive; B-3's partial-pressure diffusion transports CO2 across
open doors). Before them, all three moved three times on 2026-07-22, each time by a pure fold
change whose *inputs* were unchanged, so no sim behaviour moved with them: W0-1 (the hash-pack
un-aliasing) took `26907c23d7e48a5c` / `401c9b96aff338a7` / `b31ba82f50cf395c` →
`3afc99d90e849aa0` / `d807c509743d1b9d` / `21ad26192d778d95`; W0-1b (folding the thirteen
saved-but-unhashed fields) took those to `ffefe9a9a42d8e7e` / `6071adb8fa781440` /
`ab47cefd840247c4`; and **W0-6** (registering four empty economy systems — `ZONE`, `PROD`,
`ORES`, `TRAD` — whose checksum seeds fold unconditionally) took those to
`616ed4a84a9f6e87` / `3cf25daf3ca40e0b` / `72f7023ef9f1cd73`. **B-3** (the CO2 partial-pressure
diffusion term, `AtmosphereSystem.DiffuseAcrossDoors`) then took those to the current values
above — the FIRST of these moves that is a real behaviour change, not a pure fold: gas now
crosses open doors by partial-pressure gradient, so the hash's *inputs* genuinely differ (its
new `diffusion_coefficient` def also moved the defs checksum `08b73814d97c7be3` →
`81ae90bdd049f745`). Still only the two tick-3000 goldens moved; every frame, persona and
layout golden stayed byte-identical.
All three times exactly 2 goldens moved — the two tick-3000 hash files — and every frame,
persona and layout golden was byte-identical, which is the check that the cause really was
the fold.

---

## 2. World substrate

**Grid.** `World` is a stack of `ZLevel`s (`World/World.cs:7-18`); one z-level = one deck.
Each tile carries `Floor` (ushort tiledef), `Wall` (ushort tiledef), `Flags` (byte) and
`RoomId` (ushort). Tile defs are id-stable and never reordered
(`World/TileDefs.cs:32-48`):

| id | name | walkable | blocksGas |
|----|------|----------|-----------|
| 0 | `Void` | no | no |
| 1 | `Floor` | yes | no |
| 2 | `Wall` | no | yes |
| 3 | `Debris` | no | yes |

`TileFlags` (`World/TileDefs.cs:5-16`): `Walkable`, `BlocksGas`, `HasDevice`,
`Designated`, `Stockpile`, `Explored`, `Scenery`.

`Walkable` and `BlocksGas` are **derived** and recomputed on every `SetFloor`/`SetWall`
(`World/World.cs:49-62`): `Walkable` iff the floor def is walkable **and** `Wall == 0`;
`BlocksGas` iff either def blocks gas. The other five flags are preserved verbatim across
terrain edits (`World.cs:55-57`) — including through a dig, which is why `ProgressDig`
must explicitly clear `Designated` (`Jobs/JobSystem.cs:516`).

**THE walkability rule** lives in exactly one place, `Simulation.IsWalkable`
(`Simulation.cs:110-122`), shared by pathing, movement stepping and job approach checks:
`Walkable` flag set, `Scenery` flag clear, and — if a device sits on the tile — a `Door`
is walkable only when `IsOpen && !IsLocked`, any other device blocks iff its machine def
says `Blocks`. **Every shipped machine has `blocks = false`** (`machines.def`, the
`blocks` column: side-section world), so among *devices* only doors gate movement. Walls,
debris and void are already non-walkable by the derived flag; `Scenery` props block on top
of that.

**Overlay utilities.** `Conduit` and `Pipe` never enter the tile grid and never set
`HasDevice` — they share tiles with machines (`Simulation.cs:67-68,74-77`).

### Rooms

`RoomState.Recompute` (`Rooms/RoomState.cs:120-195`) flood-fills in deterministic z,y,x
scan order. A tile joins a room iff it has a non-`Void` floor, does not block gas, and is
not a door tile (`RoomState.cs:235-241`). **A region that touches `Void` or the map edge
becomes part of room 0 — the vacuum sink** (`RoomState.cs:152-158,265-272`), whose moles
are pinned to zero every atmosphere pass (`Systems/AtmosphereSystem.cs:77`). **Door tiles
belong to no room**: they get `DoorMarker = ushort.MaxValue` (`RoomState.cs:52,186-194`)
and are flow/conduction edges instead.

`Room.VolumeM3 = TileCount × 2.5` (`RoomState.cs:28`) — 1 m × 1 m tiles, 2.5 m deck
height. `Room.HullTiles` counts region tiles with at least one hull contact (map edge,
open void, or a wall backed by void/more wall — a single partition wall with a room
behind it insulates, `RoomState.cs:211-232`); `ThermalSystem`'s space loss scales with it.

On recompute, gas **and temperature** are remapped by tile overlap
(`RoomState.RemapGas`, `RoomState.cs:291-313`): each new room inherits `share = 1/oldTileCount`
of every old room its tiles came from. A brand-new volume with no predecessor keeps the
293 K default (`RoomState.cs:16,311-312`).

`Rooms.MarkDirty()` has exactly five call sites repo-wide: `AddDevice` / `RemoveDevice`
(`Simulation.cs:79,95`), `SetTileCommand` (`Commands/Commands.cs:184`), a completed dig
(`Jobs/JobSystem.cs:517`) and a completed wall build (`Systems/BuildSystem.cs:194`).
**Nothing else re-floods rooms** — in particular, no runtime breach mechanic exists.

**Room anchors** are saved sim state (`RoomState.cs:72-85`, `ROOM` chapter v2/v3) — a name
plus a probe tile. They are the MOSS room namespace (`hab1.o2`) and the `GoalSystem`
anchor lookup.

---

## 3. Atmosphere & life support — the flagship system

`Systems/AtmosphereSystem.cs`, 5 Hz, `Dt = 0.2 s` (`:14,16`). Tuning: `atmosphere.def`.

### The model

Each room is **one lumped node** holding `O2Moles`, `CO2Moles`, `N2Moles`, `TemperatureK`.
Derived (`Rooms/RoomState.cs:28-41`):

```
PressureKPa  = TotalMoles × 8.314 × TemperatureK / VolumeM3 / 1000
O2Fraction   = O2Moles / TotalMoles
CO2Ppm       = CO2Moles / TotalMoles × 1,000,000
```

Initial fill (`RoomState.Pressurize`, `:104-110`) is 101.3 kPa of 21 % O2 / 79 % N2 /
0.05 % CO2 — i.e. **500 ppm CO2 baseline**. The 0.21/0.79/0.0005 mix and the 0.2 s `Dt`
are structural, not def-tunable (`atmosphere.def` header).

### One pass, in order (`AtmosphereSystem.Tick`, `:23-78`)

**1. Devices** (device store order):

| device | condition to act | effect per pass |
|--------|------------------|-----------------|
| `Door` | `IsOpen` | bulk flow across the edge (below) |
| `AirVent` | `IsOpen && Powered && IsOperational` **and** room ≠ vacuum **and** `room.PressureKPa < nominal_pressure_kpa` | `+30 × EffectiveRate × 0.2` mol, split 21 % O2 / 79 % N2 (`:41-50`) |
| `Scrubber` | `Powered && IsOperational` and room ≠ vacuum | `CO2Moles = max(0, CO2Moles − 0.001 × EffectiveRate × 0.2)` (`:53-59`) |

`EffectiveRate = Rate × (0.5 + 0.5 × Condition)` (`Entities/Device.cs:79`) — a worn machine
works, but poorly: at `Condition = 0.10` (the fail floor for most life-support kinds) it
delivers **55 %** of nominal, and it stops entirely below that because `IsOperational`
goes false.

**Vents inject from an infinite reserve** — nothing is consumed anywhere
(`Entities/Device.cs:6` comment; no counterpart bookkeeping exists in the system).

**2. Citizens breathe** (`:63-74`): every living citizen standing in a real room
consumes `min(room.O2Moles, 3.04e-4 × 0.2)` mol O2 and emits `2.73e-4 × 0.2` mol CO2.
Citizens on a `DoorMarker` tile or in room 0 breathe nothing.

**3. Room 0 stays empty** (`:77`).

### Door flow (`FlowAcrossDoor`, `:80-128`) — the mechanic that surprises people

Flow only happens across **open** door tiles, between the two distinct room ids among the
door's four neighbours. Then:

```
if (|Pa − Pb| < 1e-6) return;                       // :113
dn = flow_coefficient × |Pa − Pb| × Dt              // :116, capped at source TotalMoles
```

`dn` moles move **at the source room's mixture fractions** (`:121-126`). The destination
gains nothing if it is room 0 (venting to space is one-directional).

> **✅ FIXED by B-3 (`AtmosphereSystem.DiffuseAcrossDoors`)** — partial-pressure diffusion
> across open doors now transports CO2 to scrubber rooms. `FlowAcrossDoor` (bulk flow) runs as
> below, but a **per-species concentration term** now runs beside it every pass, so a 17,000 ppm
> room beside a 0 ppm room DOES equalize even at equal total pressure. The paragraph below
> describes the PRE-B-3 sim (kept for the mechanism detail of the bulk-flow half).

**This is bulk pressure-driven flow, not diffusion.** There is no concentration term at
all: if two rooms ever *did* equalize to `|Pa − Pb| < 1e-6`, exchange would stop dead and a
17,000 ppm room beside a 0 ppm room would stay that way. In practice they never equalize —
breathing adds moles on one side and scrubbing removes them on the other, so a small
standing Δp persists and gas keeps moving. Measured on the slice at day 2, the crew
corridor r5 (11,961 ppm) and the scrubber room r6 (0 ppm) sit at 96.762738 vs 96.762308 kPa
— a Δp of `4.3e-4` kPa, ~430× the cutoff. Transport is therefore **throughput-limited, not
zero**: it moves gas at the source room's mixture fraction, which is far too slow to level a
concentration gradient. See §13.1 for the measured balance.

### Thresholds that hurt people (`Systems/NeedsSystem.cs:41-73`, `needs.def`)

`NeedsSystem` runs at 1 Hz with `Dt = 1 s`. It samples `ppO2 = PressureKPa × O2Fraction`
and `CO2Ppm` of the citizen's room. A citizen standing on a **door tile** is skipped
entirely that second — neither suffocating nor recovering (`:45`).

```
vacuum-rate damage   if PressureKPa < 5           (vacuum_pressure_kpa)
                     or ppO2 < 10 kPa             (severe_hypoxia_ppo2_kpa)
                     or CO2 > 80,000 ppm          (2 × co2_narcosis_ppm)
                     → Suffocation += 1/90 per s   → dead in 90 s
hypoxia-rate damage  if ppO2 < 16 kPa             (hypoxia_ppo2_kpa)
                     or CO2 > 40,000 ppm          (co2_narcosis_ppm)
                     or tempC > 45 / < −10        (heat_stroke_c / hypothermia_c)
                     → Suffocation += 1/240 per s  → dead in 240 s
otherwise            → Suffocation −= 1/30 per s   → clear in 30 s
```

`Suffocation ≥ 1` ⇒ death (`NeedsSystem.cs:69-73,95-106`): the citizen is removed from the
store entirely, a `Corpse` item labelled with their name drops on their tile, and both
`CitizenDiedEvent` and an `AlarmRaisedEvent("CITIZEN DOWN — asphyxiation")` fire.
**Thermal injury shares the suffocation track** — there is no separate hypothermia meter.

**Crew now self-preserve (E0-2 `SafetySystem`, `Systems/SafetySystem.cs`, 1 Hz, after
`NeedsSystem`).** Before E0-2 a crew member had no response to bad air at all — it would work a
job on a tile whose air had turned lethal until it died (§13's "a citizen will stand in 60,000
ppm taking damage without ever choosing to leave"). Once the L1 rebase stretched a maintenance
call to 900 s that killed every generated ship. The guard: when a crew member's `Suffocation`
reaches `needs.flee_suffocation` (0.5) AND its current tile is not breathable
(`AtmosphereSafety.IsBreathable` — the exact negation of the danger bands above), it drops its
job (`CancelJob` — cargo/reservations released) and takes `JobKind.Flee`, pathing to the nearest
breathable tile (`PathService.FindNearestBreathable`). While `Flee` it is not idle, so no
dispatcher recruits it back into the air it is fleeing; it returns to `None` only once it is
breathing and has recovered below `0.5 × flee_suffocation`. The guard is INERT on a healthy ship
(crew never suffocate, so `JobKind` never becomes `Flee` and no hash moves); it does NOT make
crew respond to CO2 they can survive, seek air pre-emptively, or fight fires — it is purely "do
not stand in lethal air until dead". A sealed pocket with no breathable tile reachable still
kills, which the ship-gen V6 survivability gate is right to catch.

### Key tunables

| key | value | file |
|-----|-------|------|
| `flow_coefficient` | 0.5 mol/(kPa·s) per open door | `atmosphere.def` |
| `o2_per_person_per_second` | 3.04e-4 mol/s (0.84 kg/day) | `atmosphere.def` |
| `co2_per_person_per_second` | 2.73e-4 mol/s (1.04 kg/day) | `atmosphere.def` |
| `vent_mol_per_second` | 30 | `atmosphere.def` |
| `scrubber_mol_per_second` | 0.001 | `atmosphere.def` |
| `nominal_pressure_kpa` | 101.3 (runtime vent ceiling) | `atmosphere.def` |
| `hypoxia_ppo2_kpa` / `severe_hypoxia_ppo2_kpa` | 16 / 10 | `needs.def` |
| `co2_narcosis_ppm` | 40,000 | `needs.def` |
| `vacuum_pressure_kpa` | 5 | `needs.def` |
| `heat_stroke_c` / `hypothermia_c` | 45 / −10 | `needs.def` |

One scrubber at `Condition = 1` removes `0.001 / 2.73e-4 = 3.66` people's CO2 — computed
from the two def values, and confirmed by probe. **§13.1 explains why that ratio does not
translate into a breathable ship.**

---

## 4. Power, water, thermal, hydroponics, sustenance

### 4.1 Power (`Systems/PowerSystem.cs`, 1 Hz)

A **network** is a connected component of `Conduit` devices, flooded over 4 lateral
neighbours **plus vertical risers** (`:67-78`). Any non-conduit device on, or 4/6-adjacent
to, a conduit joins that network (`:82-100`); a device on no network has `NetworkId = 0`
and is unpowered. Networks are rebuilt when `sim.PowerDirty` is set — which has exactly
three writers: `AddDevice` / `RemoveDevice` (`Simulation.cs:80,96`), a completed wall build
(`Systems/BuildSystem.cs:195`) and save load (`Save/SaveReader.cs:146`). **A dug-out or
`SetTileCommand`-edited tile does NOT dirty the power graph** — only the room graph.

Balance (`:103-180`), per network:

```
supply   = Σ GenerationKW  +  Σ Battery.StoredKWh × 3600     // :133-134
```
A battery can burst its entire stored energy inside one 1-second balance pass, so
**batteries bridge any load until empty** (`:131-133`, comment). Battery capacity is
`Device.BatteryCapacityKWh = 40` (`Entities/Device.cs:71`).

Demand is bucketed by `PowerTier` (`Entities/Device.cs:36-42`) and **served** highest tier
first: the loop runs `tier = 3 → 0`, i.e.
`LifeSupport (3) → Defense (2) → Industry (1) → Comfort (0)`. So **the lowest tier sheds
first and life support sheds last**. The priority is strict: once any tier is shed, every
lower tier sheds too — leftovers never trickle past a browned-out higher tier
(`:138-154`). A brownout transition publishes `BrownoutChangedEvent`.

`IsWanting` (`:183-187`): **every device with `draw > 0` demands power unconditionally
except a closed `AirVent`.** Crafting stations draw their full kW whether or not anyone is
working them.

Machine table (`machines.def`, columns `draw gen tier blocks heat wear maint fail`;
mirrored in `Entities/MachineDefs.cs`, read via `sim.Defs.Machines[(int)kind]`):

| kind | draw kW | gen kW | tier | heat kW | wear/h | maint< | fail< |
|------|---------|--------|------|---------|--------|--------|-------|
| Door | 0.1 | 0 | Defense | 0.05 | 0.002 | 0.30 | 0.05 |
| AirVent | 0.5 | 0 | LifeSupport | 0.2 | 0.010 | 0.40 | 0.10 |
| Scrubber | 0.4 | 0 | LifeSupport | 0.4 | 0.012 | 0.40 | 0.10 |
| Terminal | 0.1 | 0 | Defense | 0.1 | 0.001 | 0.20 | 0.02 |
| SolarWing | 0 | **6** | Comfort | 0 | 0.004 | 0.40 | 0.10 |
| Battery | 0 | 0 | Comfort | 0.1 | 0.002 | 0.30 | 0.05 |
| Light | 0.15 | 0 | Comfort | 0.15 | 0.001 | 0.20 | 0.02 |
| GrowBed | 0.6 | 0 | Industry | 0.5 | 0.008 | 0.40 | 0.10 |
| Reclaimer | 0.8 | 0 | LifeSupport | 0.6 | 0.012 | 0.40 | 0.10 |
| Fabricator | 3 | 0 | Industry | 2.5 | 0.020 | 0.40 | 0.10 |
| MachineShop | 2 | 0 | Industry | 1.6 | 0.020 | 0.40 | 0.10 |
| SalvageRecycler | 1.5 | 0 | Industry | 1.2 | 0.018 | 0.40 | 0.10 |
| Radiator | 0.2 | 0 | LifeSupport | 0 | 0.006 | 0.40 | 0.10 |
| Telescope | 0.4 | 0 | Industry | 0.2 | 0.004 | 0.40 | 0.10 |
| WaterTank | 0 | 0 | Comfort | 0 | 0.001 | 0.20 | 0.02 |
| Ladder, Conduit, Pipe, and all furniture | 0 | 0 | Comfort | 0 | 0 | 0 | 0 |

`radiator_reject_kw = 5` is a separate `[machines]` scalar (`machines.def:22`).

### 4.2 Water (`Systems/WaterSystem.cs`, 2 Hz, `Dt = 0.5 s`)

Fluid networks mirror power exactly, but over `Pipe` devices, and rebuild when
`sim.DeviceTopologyVersion` changes (`:46-50`) rather than on `PowerDirty`.

**Reclaimers** (`RunReclaimers`, `:121-152`): a powered, operational reclaimer on a fluid
network tops up the **least-full tank** on that network. It draws from the global
`sim.WastewaterLiters` greywater pool at 93 % efficiency:

```
wantOut = min(0.05 × 0.5 × EffectiveRate, capacityRoom)
drawIn  = min(wantOut / 0.93, sim.WastewaterLiters)
sim.WastewaterLiters -= drawIn;  tank.StoredLiters += drawIn × 0.93
```

Greywater enters the pool from drinking (`Systems/SustenanceSystem.cs:188,229`) and from
plant transpiration (`Systems/HydroponicsSystem.cs:34`). The loop is lossy by design (the
reclaimer's 7 % per pass, plus the ~20 % transpiration that never returns), so with no
runtime source the pool was **strictly monotone-decreasing** — it drank itself dry ~day 1.2
and stalled every grow bed forever (ECONOMY-PLAN B-2). **`WaterSystem.RunMakeup` (called each
Water pass before the reclaimers) fixes that**: a self-throttling floor tops the pool up to
`makeup_floor_liters` **only when it would otherwise fall below it**, so it replaces exactly
the ~0.256 L/L·irrigation the loop destroys and **nothing when the loop is healthy or tanks
are capped** — the greywater number self-limits at the floor rather than inflating. This is
the one place water is created at runtime; everywhere else it is only cycled.

`WaterSystem.TryDrawWater` (`:159-184`) is **all-or-nothing** across a network's tanks: if
the network cannot cover the full amount, nothing is drawn.

Tunables (`water.def`): `tank_capacity_liters = 500`, `reclaimer_liters_per_second = 0.05`,
`reclaim_efficiency = 0.93`, `makeup_floor_liters = 20`.

### 4.3 Thermal (`Systems/ThermalSystem.cs`, 2 Hz, `Dt = 0.5 s`)

Each room is one node with capacity `TileCount × 53,000 J/K` (`:42-43`, `thermal.def`).
Joules accumulate into a scratch buffer so **all reads see start-of-pass temperatures** —
within-pass ordering can never bias flow direction (`:57-63,133-136`).

Sources and sinks per pass:

- **Device waste heat**: `HeatKW × 1000 × Dt` for any powered, operational device with
  `heat > 0`. Vents emit only while open; every other kind emits whenever powered —
  there is no duty cycle (`:100-108`, documented simplification).
- **Radiators**: reject `radiator_reject_kw × EffectiveRate × 1000 × Dt` joules, capped at
  `(T − radiator_floor_k) × capacity` so they never pull the room below **283.15 K
  (10 °C)** (`:86-98`).
- **Citizens**: `citizen_heat_w = 100 W × Dt` into their room (`:112-119`).
- **Door conduction** (`ConductAcrossDoor`, `:147-180`): `conduct × (Ta − Tb) × Dt`, with
  `door_conduct_open_w_per_k = 40` and `door_conduct_closed_w_per_k = 8`. Conduction is
  passive — closed and unpowered doors still conduct, 5× slower. A door edge onto vacuum
  leaks one-sidedly to the 3 K sink. **The door's own `HeatKW` is dropped by design**
  (`:72-78`) because a door tile belongs to no room.
- **Hull loss**: `hull_loss_w_per_k_per_tile (0.09) × HullTiles × (T − space_sink_k) × Dt`
  (`:129-131`).

Result clamped to `[min_temperature_k, max_temperature_k] = [3, 500] K` (`:134-135`).

An unpowered, radiator-less room drifts toward the 3 K sink over days — the source states
the time constant as `τ = 53 kJ/K ÷ 0.09 W/K ≈ 164 h` (`:22-24`), i.e. for a room where
every tile is a hull tile. Interior rooms are insulated by their neighbours and cool more
slowly (that is what `HullTiles` buys you). **Nothing in the sim heats a room on
purpose** — only waste heat and bodies do — so the shipped slice cools steadily (§13.2).

### 4.4 Hydroponics (`Systems/HydroponicsSystem.cs`, 1 Hz, `Dt = 1 s`)

A `GrowBed` advances only while `Powered && IsOperational` **and** its fluid network can
cover `grow_bed_water_per_second × Dt = 0.02 L` — otherwise progress **holds** (no decay).
80 % of the irrigation is returned to the greywater pool as condensate
(`transpiration_recapture_fraction = 0.8`, `:31-34`).

```
bed.Progress += Dt / grow_seconds_per_crop        // 1/600 per second
```

At `Progress ≥ 1` a single `Potato` drops on the first walkable 4-neighbour of the bed
(canonical `+x,−x,+y,−y` order), or on the bed's own tile if none is walkable
(`Harvest`, `:44-60`). **600 s per crop is an explicit dev rate**, flagged in
`hydro.def:11` as *not* the GDD's 12-day cycle.

### 4.5 Sustenance (`Systems/SustenanceSystem.cs`, 1 Hz)

Registered **after** `JobSystem`, so working citizens are never stolen mid-job; they eat
when they next go idle. `JobKind.Eat`/`Drink` are owned exclusively by this system —
`JobSystem`'s switch ignores them.

- Trigger: `Thirst ≥ 0.5` or `Hunger ≥ 0.5` (`need_threshold`), **thirst outranks hunger**
  (`TryStartNeed`, `:62-69`). If no tank can serve, the citizen still tries to eat.
- **Drink**: walk to the nearest stocked `WaterTank` (Manhattan, ties by device store
  order) with a reachable walkable 4-neighbour. On arrival, `tank.StoredLiters -= 0.5`,
  `Thirst = 0`, and `sim.WastewaterLiters += 0.5` (`ProgressDrink`, `:211-233`).
- **Eat**: walk onto the nearest unreserved ground `Potato`, reserve it, then
  `item.Count--`, `Hunger = max(0, Hunger − 0.36)` (`ProgressEat`, `:235-265`).
- **HoldPosition citizens never travel for needs** but *do* consume what is adjacent
  (`TryServeInPlace`, `:175-207`) — one serving per 1 Hz pass.

Tunables (`sustenance.def`): `drink_liters = 0.5`, `potato_hunger_value = 0.36`,
`need_threshold = 0.5`.

---

## 5. Citizens

### 5.1 The state a citizen carries

`Entities/Citizen.cs`. Position (`Pos`, `PrevPos` — the presenter interpolates between
them), a path list + `PathIndex` + `MoveCooldown` + `IdleCooldown`, four 0..1 need scalars
(`Suffocation`, `Hunger`, `Thirst`, `Fatigue`), a derived `Mood`, and the job tuple
(`JobKind`, `JobTarget`, `CarryingItemId`, `ReservedItemId`, `JobWorkTicks`).

Three behaviour switches:

- `AutoWander` (`:14`) — **off by default**; an institution's crew stands at their station
  when idle. The authored slice sets it **true** for all eight
  (`Sim.Gen/AuthoredShips.cs:255`, with a comment explaining that eight non-wandering crew
  all reached thirst simultaneously and asphyxiated in one small room).
- `HoldPosition` (`:20`) — strict player control: never wanders, never picks up a job,
  never self-serves by travelling.
- `RevealsFog` (`:23`) — hidden survivors don't lift fog until found.

`IsIdleForWork` (`:63`) = `!Dead && !HoldPosition && JobKind == None`. This one predicate
gates every recruiter (`JobSystem`, `SustenanceSystem`, `CraftingSystem`,
`MaintenanceSystem`). **E0-1 (recruitability, L0) dropped the old `&& !HasPath` clause:** a
crew member mid-wander (AutoWander crew almost always are) used to be invisible to every
recruiter, pickable only in the brief settle gap between wander legs, so the effective
labour pool collapsed toward ~1.43 of 8. It is now recruited straight off a wander — its
wander path is overwritten from where it stands when a source claims it (every recruiter
paths from `citizen.Pos`), or left untouched when nothing is on offer. This also means an
idle-walking crew member under a `MoveCitizenCommand` (also `JobKind==None`) will now
self-serve or take work mid-order — deliberate; use `HoldPosition` for a crew member the
player wants to stay strictly on the ordered path.

### 5.2 Need rates (`needs.def`, applied at 1 Hz with `Dt = 1 s`)

| need | rate | time from 0 to 1 |
|------|------|------------------|
| `hunger_per_second` | 1/172,800 | **48 h** |
| `thirst_per_second` | 1/86,400 | **24 h** |
| `fatigue_per_second` | 1/57,600 | **16 h** |

All three clamp at 1.0 (`NeedsSystem.cs:76-78`). Hunger and thirst have consumers
(§4.5). **Fatigue has no consumer — nothing anywhere reduces it.** See §13.4.

### 5.3 Mood

```
Mood = 20 − 40×Hunger − 30×Thirst − 25×Fatigue − 60×Suffocation
```
(`NeedsSystem.cs:81-85`, `needs.def:27-31`). Range in practice ≈ `[−135, +20]`.

Consumers of `Citizen.Mood`, exhaustively: `ShipMetrics.Compute` (the morale metric,
`ShipMetrics.cs:83`) → which feeds the Director's tension; `SocialSystem.RollPair`'s
argument gate (`SocialSystem.cs:147`); the TUI inspector (`hosts/tui/Ui/InspectorModel.cs:84`);
and the state hash. **Mood does not gate work speed and there are no mental breaks.**

### 5.4 Movement (`Systems/CitizenSystem.cs`, 10 Hz)

<!-- IN FLIGHT: movement tuning — citizen.def ticks_per_tile / idle_ticks_between_wanders,
     CitizenSystem.cs, PathService wander. Numbers below are pre-change. -->
> **⚠ IN FLIGHT** — the movement-tuning lane is changing `citizen.def`'s
> `ticks_per_tile` / `idle_ticks_between_wanders`, `CitizenSystem` and the `PathService`
> wander. Everything in §5.4 describes the code at `0f88231`.

Following a path (`:38-53`): decrement `MoveCooldown`; when it hits 0, re-validate the next
tile with `sim.IsWalkable` (a closed door mid-route clears the path and re-decides next
tick), step one tile, and reset `MoveCooldown = ticks_per_tile`. On arriving,
`IdleCooldown = idle_ticks_between_wanders`.

Idle (`:54-78`): a citizen with `AutoWander && !HoldPosition && JobKind == None` counts
`IdleCooldown` down and then picks a wander target via
`PathService.TryRandomWalkableTileNear` (E0-1; was the world-wide `TryRandomWalkableTile`).

`citizen.def`: `ticks_per_tile = 10` (1 tile/s at 10 Hz; E0-2 movement retune, was 5 = 2 tiles/s),
`idle_ticks_between_wanders = 30` (3 s), `wander_radius_tiles = 8` (E0-1; the idle-wander scope).

**`TryRandomWalkableTileNear` (`Path/PathService.cs`) samples up to 10 random tiles from a
Chebyshev box of half-width `wander_radius_tiles` around the citizen (clamped to the world)
and returns the first walkable one (E0-1).** It bounds wandering LOCALLY so crew disperse
near their work instead of roaming ship-wide, WITHOUT reducing wander cadence — the slice
depends on wandering to desynchronise needs (§5.1 `AutoWander` note), so E0-1 bounds reach,
not frequency. The default 8 is UNTUNED, pending A1 measurement; a radius ≥ the ship extent
reproduces the pre-E0-1 global wander. The un-bounded `TryRandomWalkableTile` remains in
`PathService` (no longer called by the sim).

The pre-E0-1 global sampler produced, on the shipping slice, a mean wander leg of ~21 tiles
(~21 s at the E0-2 `ticks_per_tile = 10`; was ~10.7 s at the pre-E0-2 5) with ~46 % of picks on a different deck — i.e. crew
routinely crossed the whole ship between needs. That is the ship-wide roaming E0-1's radius
now bounds.

### 5.5 Pathing (`Path/PathService.cs`)

Synchronous, preallocated grid A*: 4-directional, plus ladder z-links (a `Ladder` on your
tile links up; a `Ladder` on the tile below links down, `:100-104`). `g` cost is a flat 1
per step; the heuristic is Manhattan with **z weighted ×2** (`:108-109`). Walkability is
`sim.IsWalkable` — the single shared rule (`:91`). The returned path excludes the start
and includes the goal (`:28`).

### 5.6 Death

Only one death pipeline: `Suffocation ≥ 1` in `NeedsSystem`. `Citizen.Health` is declared
(`Citizen.cs:31`, documented as "Damaged by hypoxia, cold and struggle") but **is never
written by any system** — see §13.4.

---

## 6. Jobs & labour

### 6.1 The job board is purely derived

`Jobs/JobSystem.cs` (10 Hz). The board — dig sites, haul candidates, stockpile tiles,
build sites — is rebuilt from the world + entity stores whenever `sim.JobsDirty` is set,
and is **never serialized** (`:11-17`). All per-citizen job state lives on the citizen.
The board also self-dirties whenever last tick published any `TileChangedEvent` (`:76`).

`Rescan` (`:117-223`) scans tiles in z,y,x order for `Designated` debris and `Stockpile`
flags; collects haul candidates **only if at least one stockpile tile is currently free**
(`:153-176`) — a `Corpse` is never a haul candidate, and an item already inside a stockpile
zone counts as stored; rebuilds the assigned-dig and assigned-build sets from live citizen
state (`:178-191`); and splits `BuildSystem.Pending` into ready-to-build vs
needs-material (`:193-216`).

### 6.2 `TryAssign` — the full selection order (`:242-422`)

This is the whole labour-allocation policy. **There is no priority table and there are no
skills.** For an idle citizen:

1. Bail immediately if all four boards are empty.
2. Bump the generation counter `_gen`, then loop:
   - Scan **dig sites** for the strictly-nearest by **Manhattan distance** that isn't
     stamped-tried, isn't in unreachable-backoff, isn't already assigned, and is still a
     `Designated` `Debris` tile.
   - Scan **haul items** for a strictly-nearer unreserved, uncarried item.
   - Scan **ready-to-build sites** for a strictly-nearer unassigned, materialed site.
   - If any free `Material` (Regolith) exists, scan **needs-material sites** for a
     strictly-nearer one.
   - **Ties keep the earlier category** (strict `<` throughout), so the effective tie-break
     order is: dig → haul → build-ready → build-material, then board scan order.
3. Try to commit the winner:
   - **Dig / Build**: `TryPathToAdjacent` — path to the first walkable 4-neighbour in
     `+x,−x,+y,−y` order (`:473-487`).
   - **Haul**: path directly onto the item tile, set `item.ReservedForJob`, remember
     `citizen.ReservedItemId`.
   - **Build-material**: `TryReserveMaterialFor` (`:432-468`) reserves the nearest
     *reachable* free Regolith stack, stores the **site** as `JobTarget` and routes the
     citizen to the material first.
4. On a pathing failure, stamp the candidate tried **and** set an unreachable-backoff of
   `UnreachableRetryTicks = 50` ticks (5 s) for that target. The constant lives at
   `sim/Sim.Core/Jobs/JobContext.cs:55` and each source stamps in its own `TryClaim`
   (the `:46,370,386,402,414` line cites here predate the W0-4 split and are dead — that
   `JobSystem.cs` is 275 lines now, and the arbitration is all this file still owns). Then
   retry the next-nearest. The loop always terminates because every failure stamps.
5. If nothing is left, `citizen.ClearPath()` and return (`:418-419`).

**The backoff has a second axis: per STOCKPILE TILE (E0-4 WP-7).** Step 4's backoff is keyed by
*candidate* — a dig site, a build site, a haul item. That left one hole: the haul candidate gate
asks only "does a free stockpile tile exist" (`Jobs/JobContext.cs:115-121` — `Stockpile` +
`Walkable` + no ground stack) while the *delivery* step asks the stronger "can this citizen path to
one". A zoned tile that is walkable but that nobody can reach — the slice's authored-sealed
observatory is exactly that (`Sim.Gen/AuthoredShips.cs:93` `DoorClosed = true`) — therefore held the
gate permanently open against a delivery that could never succeed: **72,928 pickup starts, zero
deliveries, 31.191 % of all crew-ticks over 30,000 slice ticks**, an ~8-crew livelock at 50 % duty.
`HaulJobSource` now keeps a second backoff map keyed by *tile*
(`Jobs/Sources/HaulJobSource.cs:53`, `_tileRetryAt`). It is **written in one place only** — a failed
`FindPath` in `TryPathToFreeStockpile` stamps its tile for the same `UnreachableRetryTicks = 50`
(`:499`) and a successful one removes the stamp (`:495`) — and **read in three**, all of which skip a
stamped tile: the kind-less candidate gate (`:176`), E0-4's filtered `AnyFreeStockpileAccepts`
(`:384`), and the destination-selection loop itself (`:477`). That third one is what makes the saving
real — it is the site that would otherwise re-run a whole-region A* sweep per hauler per tick.
Measured after: **918 / 0 / 2.254 %**, with the reachable controls (a far-deck tile, a
bench-adjacent buffer) byte-identical to before, and the 3,000-sim-second leg down from 51 s of wall
time to 1.2 s.

It is a rate limiter, not a blacklist, and three separate things lift a stamp: the deadline
(`IsPathworthy`, `:400` — the *sole* expiry mechanism, since nothing sweeps the map), a successful
path, and `ForgetBackoffsOnTileChange` (`:156`), which empties the map wholesale on any
`JobBoardDirty.Tiles` rescan — so an E0-5 deconstruct or a dug-out wall re-opens the zone on the
**next tick**, not after 5 s. A door opening is the one case that still takes the 5 s path, because
`SetDoorStateCommand` sets no `JobsDirty` and publishes no `TileChangedEvent`; `HaulJobSource.BeginTick`
re-dirties the board once at each expiry precisely so a quiescent board cannot leave that zone dead.

**The liveness re-probe is free in crew-time, and it is the tuning lever.** Measured over the same
30,000 ticks: with the wake **918 starts / 2.254 %**; with it disabled, **50 starts / 2.382 %** — it
trades a few long wasted claims for many short ones. Anyone wanting the residual cheaper should move
`UnreachableRetryTicks`, not delete the wake: without it, a board that goes quiet while a zone is
backed off never rescans, and the zone is dead until something unrelated dirties it.

**HOW WELL THE FIX WORKS IS A FUNCTION OF TERRAIN CHURN — read this before believing 2.254 %.**
Because a `Tiles`-dirty rescan throws the whole cache away, every terrain edit buys back a round of
wasted claims. Measured over the same 30,000 slice ticks, three sealed-observatory tiles zoned:

| terrain churn | pickup starts / 30k | share of crew-ticks |
|---|---|---|
| untouched slice (**10** `Tiles`-dirty ticks in 30,000) | 918 | 2.254 % |
| `Tiles` dirty **every** tick (adversarial — ship-wide digging or stripping) | 67,742 | 28.873 % |
| no fix at all | 72,928 | 31.191 % |

So continuous churn defeats ~**93 %** of the fix. It degrades *gracefully* — never worse than
pre-WP-7, never incorrect, only wasted crew time — but "my late-game ship started livelocking again"
is a terrain-churn question first. Calibration: ten `Tiles`-dirty ticks cost **+0.37 pp** on the
slice. **The escape hatch** is to drop the clear in `ForgetBackoffsOnTileChange` and rely on the
`IsPathworthy` expiry alone: measured **1.884 %**, churn-independent, and the only thing given up is
that a deconstruct re-opens the zone after ≤5 s instead of on the next tick.

Like the step-4 backoff this is **transient board state — not saved, not hashed**; all four
determinism pins are unmoved. No collection is iterated (`IJobSource` arbitration contract rule 4):
lookup, keyed remove and wholesale clear only.

### 6.3 `JobKind` lifecycles (`Entities/Citizen.cs:85-97`)

| kind | owner | lifecycle |
|------|-------|-----------|
| `Dig` (1) | JobSystem | path adjacent → count down `JobWorkTicks` from `DigWorkTicks = 6000` (600 s; E0-2 L1 rebase, was 60/6 s; the const is `Jobs/Sources/DigJobSource.cs:19`, surfaced as `JobSystem.DigWorkTicks`) → `SetWall(0)`, `SetFloor(Floor)`, clear `Designated`, `Rooms.MarkDirty()`, **drop 1 `Regolith` on the tile**, publish `TileChangedEvent` (`DigJobSource.Progress`) |
| `HaulPickup` (2) | JobSystem | walk to the reserved item; on arrival pick a reachable free stockpile tile **before** touching carry state, then graduate the reservation into a carry and become `HaulDeliver` (`:525-565`) |
| `HaulDeliver` (3) | JobSystem | carried item's `Pos` is glued to the carrier every tick; on arrival (or path loss) the stack is set down where the citizen stands (`:567-589`) |
| `Eat` (4) | **SustenanceSystem** | §4.5 |
| `Drink` (5) | **SustenanceSystem** | §4.5 |
| `Craft` (6) | **CraftingSystem** | §6.4 |
| `Maintain` (7) | **MaintenanceSystem** | §7 |
| `HaulToBuild` (8) | JobSystem | two hops on one `JobTarget` (always the SITE): phase A empty-handed to the reserved material, phase B carrying it to the site; deposits what the site can take, surplus drops as a loose stack (`:600-683`) |
| `Build` (9) | JobSystem | mirrors Dig; on the last work tick calls `BuildSystem.Complete` (`:691-715`) |

**Build kinds + materials (2026-07-23).** `BuildKind` is `Wall=0 / Door=1 / Floor=2`
(`Systems/BuildSystem.cs:7`). A **Wall** build seals the tile (`SetWall`) and records its material via
`World.SetMaterial`; a **Floor** build re-materials an existing floor tile (material-only, no wall, inert —
it needs a real non-void floor with no wall and an actual material change, may sit under furniture/a
citizen, costs 1 `Regolith` / 20 ticks, v1 literals `:253-254`); a Door spawns a device. Each
`PendingBuild` carries a `Material` byte (0=default) chosen client-side and threaded through
`DesignateBuildCommand`. Material is authoritative, **hashed** per tile (`ZLevel.Material`, folded last
into `World.HashInto`, saved TILE chapter v2) but **inert identity** — it never affects Walkable/BlocksGas
or cost (every build still consumes `Regolith`; there are no per-material item kinds). The client reads
it back via the view-only sparse `materials` wire channel to skin built walls/floors.

**Reservation discipline.** `ItemStack.ReservedForJob` is set by: haul pickup
(`JobSystem.cs:380`), build-material reservation (`:462`), eating
(`SustenanceSystem.cs:160`), and — as the *station's* claim — a crafting input the moment
it is staged (`CraftingSystem.cs:165`). `Simulation.CancelJob` (`Simulation.cs:128-154`)
drops carried cargo where the citizen stands and releases exactly *that citizen's*
reservation (never a co-located stranger's). `MaintenanceSystem` and `CraftingSystem`'s
fetch leg deliberately **never** reserve across ticks, because `CancelJob` would not know
how to release them; they re-validate from ground truth at every settled moment
(`MachineWearSystem.cs:111-115`, `CraftingSystem.cs:36-42`).

### 6.4 Work dispatched OUTSIDE the job board

Three systems path citizens directly, bypassing `TryAssign` entirely. All three run
**after** `JobSystem` in the stack, so the job board gets first pick of idle hands; they
recruit only `IsIdleForWork` citizens and stamp the `JobKind` immediately.

- **`SustenanceSystem`** (`:35-58`) — self-serve eat/drink. Its own nearest-first scans.
- **`CraftingSystem`** (`:76-124`) — a **standing bill** on every powered, operational
  workstation with a recipe. It recruits `FindNearestIdle` when the station can start
  (progress already banked, or enough staged input) or when any un-staged input exists to
  fetch. `JobTarget` binds the worker to the station tile; at most one worker per station.
  `Device.Progress` is authoritative and **holds across interruptions** — a redirected
  worker leaves consumed inputs consumed, and a fresh recruit resumes the batch without
  re-consuming (`:44-48,182-191`).
  Progress: `station.Progress += 1 / WorkSeconds` per 1 Hz pass; completes at
  `≥ 1 − 1e-4` (`:60,142-146`).
- **`MaintenanceSystem`** (`MachineWearSystem.cs:139-143`) — a standing rule, §7.

Recipes (`recipes.def`, `input in_count → output out_count, work_s`):

| station | recipe |
|---------|--------|
| `SalvageRecycler` | 1 `Regolith` → 2 `Scrap`, 600 s (E0-2 L1 rebase, was 20 s) |
| `Fabricator` | 2 `Scrap` → 1 `Parts`, 900 s (E0-2, was 30 s) |
| `MachineShop` | 2 `Parts` → 1 `ControllerModule`, 1800 s (E0-2, was 40 s) |

"Staged" is forgiving: any ground stack of the input kind on **any** 4-neighbour of the
station counts. The only filter is `item.CarriedBy != 0` — a stack **reserved** by a hauler
but already put down still counts, deliberately ("incl. our own staged claim",
`StagedUnits`, `CraftingSystem.cs:326-337`). The drop tile is the
first walkable 4-neighbour in `+x,−x,+y,−y` order (`TryFindStagingTile`, `:312-323`).

### 6.5 Build & refit (`Systems/BuildSystem.cs`)

<!-- IN FLIGHT: the slice build/work economy — AuthoredShips.cs, CraftingSystem.cs,
     JobSystem.cs material gating. Numbers below are pre-change. -->
> **⚠ IN FLIGHT** — the slice build/work-economy lane is changing `AuthoredShips.cs`,
> `CraftingSystem.cs` and `JobSystem`'s material gating. §6.5 describes `0f88231`.

`BuildSystem` holds only canonical state (the pending list) — its `Tick` is a no-op
(`:65`). The pending list is kept in **packed-position sorted order** by binary insert
(`:233-243`) so the job board, the save and the checksum all scan it identically. It is an
`IStatefulSystem`: `BULD` checksum over position/kind/required/delivered/workticks
(`:282-295`).

`CanDesignate` (`:94-108`) requires: in bounds, not already designated, `Pending.Count <
max_staged`, a non-`Void` floor, no wall, no device flag and no device, and **no living
citizen standing on the tile** (they'd be sealed in).

Costs (`build.def`, material is always `ItemKind.Regolith`, `:56`):

| kind | material | construct ticks |
|------|----------|-----------------|
| `Wall` | `wall_material = 2` | `wall_construct_ticks = 2400` (240 s; E0-2 L1 rebase, was 60/6 s) |
| `Door` | `door_material = 1` | `door_construct_ticks = 1800` (180 s; E0-2, was 40/4 s) |

`max_staged = 64` caps concurrent designations.

`Cancel` (`:138-150`) refunds exactly the delivered units as one loose `Regolith` stack on
the tile; a hauler still en route keeps its stack and drops it when it finds the site gone.

`Complete` (`:183-218`): a **Wall** writes `TileDefs.Wall` (which derives `BlocksGas` and
clears `Walkable`), marks rooms dirty and marks power dirty; a **Door** spawns a runtime
`Door` device named `door_{x}_{y}_{z}`, **closed**. Both publish `TileChangedEvent` and
exactly one `ConstructionCompletedEvent`.

Precisely what "the new compartment pressurizes" means (the class comment at `:31-36` is
loose): the next `Rooms.RecomputeIfDirty` splits the old region, and `RemapGas`
(`Rooms/RoomState.cs:291-313`) hands each new room a tile-overlap share of the old room's
moles **and** temperature. Nothing conjures air. Bringing a sealed room *up* to nominal is
then the ordinary job of an `AirVent` in it (§3) — a compartment with no vent stays at
whatever share of gas it inherited.

---

## 7. Machine wear & maintenance (`Systems/MachineWearSystem.cs`)

### Wear (`MachineWearSystem`, 1 Hz)

A device wears only when **`Powered`** and **`Condition ≥ FailBelow`** (idle and already-
failed machines don't wear); a closed `AirVent` is skipped too (`:54-56`).

```
multiplier = 1                                              if roomC ≤ hot_threshold_c
           = min(1 + (roomC − 35) × 0.05,  3)               otherwise      // :63-67
Condition -= WearPerHour / 3600 × 1 s × multiplier × wearPressure          // :70
```

Rooms hotter than **35 °C** accelerate wear by 5 %/°C up to **3×** (`wear.def`).
`wearPressure` is the Director's lever, `[1, 1.35]` (§9). A device in room 0 or on a door
tile takes nominal wear (`:60`).

**Failure-crossing detection is stateless**: wear is applied only to machines operational
at the top of the pass, so landing below `FailBelow` after the decrement *is* the crossing
— an `AlarmRaisedEvent("MACHINE FAILURE — <name>")` fires exactly once per failure
(`:76-84`).

`Device.IsOperational(defs)` = `Condition ≥ FailBelow` (`Entities/Device.cs:76`). Every
operating system gates on it: atmosphere vents/scrubbers, thermal, water reclaimers,
hydroponics, crafting, nav telescopes.

### Maintenance (`MaintenanceSystem`, 1 Hz, `MachineWearSystem.cs:122-417`)

A **standing rule with no bills and no UI**: any machine below its `MaintainBelow` wants
service, **neediest (lowest `Condition`) first**, ties by device store order (`:171-208`).
One servicer per machine, bound by `JobTarget = the machine's tile`.

Phases are encoded in existing citizen fields (`:98-116`):
`JobWorkTicks == 0` ⇒ logistics (fetch a `Parts` stack, or carry one over — sub-phase by
`CarryingItemId`); `> 0` ⇒ servicing adjacent to the machine, counting down by
`IntervalTicks (10)` per pass from `maintenance_work_seconds × 10 = 9000` ticks
(E0-2 L1 rebase: `maintenance_work_seconds` 20→900, so the service is 900 s not 20 s)
(`:284,319`).

**The completion mode is decided by what is in the servicer's hands** (`:248-259`):

- **Parts in hand** → consume one unit, `Condition = 1` (full overhaul).
- **Empty hands** → `Condition = jury_rig_condition = 0.6` (patched, not fixed). Only
  reachable when no `Parts` existed anywhere on the ship at decision time (`:290-323`).

Tunables (`wear.def`): `hot_threshold_c = 35`, `wear_per_degree_c = 0.05`,
`max_heat_multiplier = 3`, `maintenance_work_seconds = 900` (E0-2 L1 rebase, was 20), `jury_rig_condition = 0.6`.

**Measured on the slice, 3 sim-days, no `Parts` on the ship**: 19 maintenance jobs started;
scrubbers/reclaimers settled at `Condition ≈ 0.51`, radiators `0.55`, workstations
`0.46–0.57` — i.e. the jury-rig loop holds machines in a permanent 0.4↔0.6 sawtooth and
nothing ever returns to pristine.

---

## 8. Social & relationships (`Social/SocialSystem.cs`, 1 Hz)

A sparse **directed** opinion graph. Edges live in a `(From,To)`-sorted list; the
dictionary is lookup-only, never iterated (`:38-42`). Canonical sim state: `SOCL`
checksum + `SYSS` save (`:289-310`), StateVersion 2.

One pass does three things in order:

**1. Co-location accrual + rolls** (`:87-105`). For every *unordered* pair of living
citizens (`i`, then `j = i+1` in store order) that share a deck **and** a room — room 0
and door tiles excluded — both directions get `familiarize_per_hour × (1/3600)` and the
pair rolls once.

**2. Relaxation** (`:107-114`): every edge relaxes toward 0 by `decay_per_hour × (1/3600)`
each pass — including edges of co-located pairs, so net accrual is
`familiarize − decay = 2 − 0.1 = 1.9` opinion/hour while sharing a room, and `−0.1`/hour
apart.

**3. Hysteresis classification** (`:116-133`, `Classify` at `:171-192`). A tier is entered
at its strict *enter* opinion and only left at its *exit* opinion (nearer zero), so a
jittering opinion never flickers the type. Transitions publish `RelationshipChangedEvent`.

| tier | enter | exit |
|------|-------|------|
| `Friend` | ≥ 30 | < 20 |
| `CloseFriend` | ≥ 60 | < 45 |
| `Rival` | ≤ −30 | > −20 |
| `Enemy` | ≤ −60 | > −45 |

`RelationType` is append-only: `None=0, Friend=1, CloseFriend=2, Rival=3, Enemy=4`
(`Social/RelationType.cs:10-17`).

**Argument / bond rolls** (`RollPair`, `:144-163`), against the forked `0x50C1A1` stream,
argument first then bond (`else if`, so at most one fires per pair per pass):

```
argument: lowerMood(a,b) < 0  AND  opinion(a→b) ≤ −20  AND  roll < 0.05   → both ways −8
bond:     opinion(a→b) ≥ 20                            AND  roll < 0.02   → both ways +5
```

All deltas go through the single `Nudge` entry point, which clamps to
`[min_opinion, max_opinion] = [−100, 100]` and creates the edge by sorted insert on first
contact (`:206-226`). Conversation effects and social events use the same `Nudge`.

**These rates are per 1 Hz PASS, i.e. per second of shared-room time.** Measured on the
slice: **2,611 bond events and 720 argument events in the first sim-day**, and every
authored edge saturated at ±100 within 24 h (see §13.7).

Tunables: `social.def` (`familiarize_per_hour = 2`, `decay_per_hour = 0.1`,
`argument_chance_per_pass = 0.05`, `bond_chance_per_pass = 0.02`,
`argument_mood_threshold = 0`, `argument_opinion_ceiling = −20`, `bond_opinion_floor = 20`,
`argument_opinion_delta = −8`, `bond_opinion_delta = 5`, plus the eight enter/exit values).

---

## 9. The Director (`Director/DirectorSystem.cs`)

Hard rule: **the Director never rolls dice and never spawns events** (`:5-11`). It reads
real sim state into a 0..1 tension scalar and drives exactly **one** sim-legal lever.

Every tick it accumulates incident pressure from the (double-buffered) event bus:
`_alarmAccum += AlarmRaisedEvent count`, `_deathAccum += CitizenDiedEvent count`
(`:57-58`). The heavy pass is gated to every `period_ticks = 100` ticks (10 s, `:61-62`).

```
tension = 0.4×(1 − morale) + 0.2×(1 − water) + 0.2×(1 − food) + 0.2×(1 − power)
        + 0.1×alarmAccum + 0.5×deathAccum,   clamped to [0,1]         // :66-73
```

The four resource terms come from `ShipMetrics.Compute` (`ShipMetrics.cs:21-91`).

The lever (`:78-80`):

```
wearPressure += lever_step (0.1) × (lever_target_tension (0.35) − tension)
wearPressure  = clamp(wearPressure, 1, max_wear_pressure = 1.35)
```

Below the target (quiet) it **builds** toward 1.35 — machines grind faster; above it
(after incidents) it **releases** toward 1.0. Then
`_alarmAccum *= 0.9`, `_deathAccum *= 0.95` (`:82-83`).

`MachineWearSystem` is the only consumer (`MachineWearSystem.cs:48,70`). Tension itself is
readable by hosts/HUD (`:48`) but drives nothing else.

State (`_tension`, `_wearPressure`, both accumulators) is canonical: `DRCT` checksum,
`SYSS` save (`:90-115`).

Tunables: `director.def`.

---

## 10. The LLM crew layer

### 10.1 The effect whitelist — the entire vocabulary

`Effects/CitizenEffects.cs:28-84`. **There is no `spawn_item`, no `set_stat`, no free-form
effect.** Anything not representable here is unrepresentable, not merely discouraged.

| effect | payload | what it actually changes |
|--------|---------|--------------------------|
| `SetDisposition` | `ΔAffinity`, `ΔTrust`, `Reason` | `mind.AffinityToPlayer`, `mind.TrustToPlayer`, + a memory entry |
| `SetEmotionalState` | `Emotion`, `DurationTicks` | `mind.Emotion` / `mind.EmotionUntilTick` |
| `AgreeTask` | `JobKind`, `Int3 Target` | assigns a real `JobKind.Dig` job — **the only effect that touches hashed sim state** |
| `RevealInfo` | `FactId` | marks a `ShipFact` revealed + a memory entry |
| `FollowPlayer` | `bool` | sets `mind.FollowingPlayer` (read by nothing — §13.3) |
| `EndConversation` | `Mood` string | writes a memory entry |

`EffectKind` is a `[Flags]` **ushort** so a `CapabilityManifest` can express a legal-set
(`:89-99`; widened from `byte` by ECONOMY-PLAN.md §0 W0-2 — 6 of 8 bits were spent, next free bit is `1 << 6`).

### 10.2 How an effect reaches the sim

Two twin paths, same validator, same published event:

- **`ApplyCitizenEffectCommand`** (`Effects/ApplyCitizenEffectCommand.cs`) — the path the
  conversation runtime uses. It rides the ordinary `ISimCommand` inbox, so it executes at
  tick start in arrival order and is recorded in the command log exactly like a player
  order.
- **`EffectPump`** (`Effects/CitizenEffects.cs:176-211`) — a system registered **first**
  in the LLM hosts' stack, draining a thread-safe `PendingEffectBuffer` at
  ≤ `MaxEffectsPerTick = 64` per tick; overflow stays queued (`:181,199`).

Both call `EffectValidator.TryApply` and publish `CitizenEffectAppliedEvent { CitizenId,
Kind, Accepted }` — accepted **or** rejected. Rejections are silent sim-side; the dialogue
layer words them as an in-character `tool_result` error.

### 10.3 Validation and clamps (`Effects/EffectValidator.cs`)

Preconditions for every effect (`:25-43`): the citizen must exist and be alive, and must
have a mind. Then per effect:

- **`SetDisposition`** (`:62-89`): rejects NaN/Infinity. `|ΔAffinity|` is budgeted at
  **15 per sim-DAY** (`MaxAffinityDeltaPerDay = 15`, `:19`); the budget rolls on
  `tick / TicksPerDay` (`:46-60`). An exhausted budget rejects the whole effect.
  `ΔTrust` is clamped to **±15 per effect** with no daily budget (`:20,75`). Both
  accumulators clamp to `[−100, 100]`. A non-empty `Reason` becomes a memory entry with
  `Importance = 0.3 + 0.4 × (|ΔAffinity| / 15)`.
- **`SetEmotionalState`** (`:91-99`): non-empty emotion, `≤ MaxStringLength = 64` chars,
  positive duration clamped to `MaxEmotionDurationTicks = 1 sim-day`.
- **`AgreeTask`** (`:108-154`): **`Job` must be `Dig`**; the citizen must be off-job (a
  wander path does not veto — agreeing mid-stroll is fine); the target must be in bounds,
  currently `Designated` **and** `Wall == Debris`, not already worked by another living
  citizen; and an adjacent approach tile must be pathable (same `+x,−x,+y,−y` order as
  `JobSystem`). Only then does it write `JobKind.Dig`, `JobTarget`,
  `JobWorkTicks = JobSystem.DigWorkTicks (6000; E0-2, was 60)` and set `JobsDirty`.
- **`RevealInfo`** (`:156-180`): the fact must exist, not already be revealed, and be in
  `mind.KnownFactIds`.
- **`EndConversation`** (`:182-194`): mood string ≤ 64 chars.

### 10.4 The capability manifest (`Effects/CapabilityComputer.cs`)

Computed deterministically from `(sim, minds, facts)` — world scanned in z,y,x order, no
RNG, no LINQ, no allocation beyond the caller's lists (`:38-43`).

`SetEmotionalState | FollowPlayer | EndConversation` are **always** legal for a living,
minded citizen (`:55`). `SetDisposition` is added iff the daily affinity budget is
non-zero (`:57-59`). `RevealInfo` is added iff the citizen knows at least one unrevealed
fact (`:61-68`). `AgreeTask` is added iff `citizen.JobKind == None` **and**
`FillDigTargets` found at least one designated, unworked `Debris` tile — up to
`MaxDigTargets = 8` (`CapabilityComputer.cs:14`) nearest by Manhattan, ties by z,y,x scan
order (`:70-127`).

`CitizenContext.Build` (`Sim.Llm/CitizenContext.cs:31-60`) turns the manifest into the
prompt's capability summary — one `EffectOption` per legal `(kind, id)` pair, which **is**
the enum domain a strict tool schema encodes: fact ids for `reveal_info`, target *indices*
for `agree_task` (`:83-92`).

### 10.5 What the model can and cannot change

**Can:** its own citizen's affinity/trust/emotion toward the player (budgeted), reveal an
already-existing `ShipFact`, take a `Dig` job on an already-designated tile, set a flag
nothing reads, end the conversation.

**Cannot:** create matter, walk a citizen to an arbitrary tile (`AgreeTask` routes them,
but only to an already-`Designated` debris tile), open a door, change a need, change a
crew-to-crew opinion, designate anything, or touch any resource. Player text is
quarantined as in-fiction speech. The minds/facts store is **host-owned** and outside
`StateHash` unless a `MemorySystem` is registered.

`AgreeTask` is the **only** effect that writes hashed sim state. Everything else lands in
the mind store.

### 10.6 Memory (`Citizens/CitizenMemory.cs`)

Per-citizen episodic list, `Cap = 120` entries; on overflow the lowest-importance entry is
dropped (ties: the older, keeping recency) — and if the *new* entry is the least important
it is simply discarded (`:35-47`). Retrieval is `importance × 0.5^(age / HalfLifeTicks)`
with `HalfLifeTicks = 2 sim-days` (`:30,50-55`); `GetTop` returns top-k best-first, ties by
chronological order.

`MemorySystem` (`:233-329`, `IntervalTicks = 1`) writes from events with hardcoded
importances (`:241-246`): alarm 0.5 (ship-wide broadcast), death 0.95 (broadcast),
argument 0.55, bond 0.5, relationship change 0.6, accepted `AgreeTask` 0.7 ("promise
formation"). **Promise *breaking* is not implemented** — §13.11.

---

## 11. MOSS — the automation DSL's sim-facing surface

`Sim.Dsl`. Two systems, both `IntervalTicks = 1`, both `IStatefulSystem`:
`DesignerRuleSystem` (content rules, runs **first**) then `ScriptRuntime` (player scripts —
**player wins ties**, `SystemStack.cs:47-48`). Both address the same shared
`DeviceRegistry`, so rules and player scripts see the same devices and the same tick's
state.

**Reads are immediate** against current sim state; **writes go through the command inbox**
and apply at the next tick boundary — scripts never mutate the sim directly
(`Sim.Dsl/DeviceAdapters.cs:5-9`).

### What MOSS can read

| namespace | properties | source |
|-----------|-----------|--------|
| a door by name | `open`, `locked`, `powered` | `DeviceAdapters.cs:20-31` |
| a vent / scrubber / solar wing / grow bed / water tank / reclaimer by name | `open`, `rate`, `powered`, `liters`, `charge`, `progress` (×100) | `DeviceAdapters.cs:58-72` |
| a **room anchor** by name (`hab1.o2`) | `o2` (%), `co2` (ppm), `pressure` (kPa), `temp` (°C) | `DeviceAdapters.cs:116-128` |
| `ship` (read-only) | `power`, `o2` (0..1 — *not* a % like `room.o2`), `co2` (ppm), `water`, `food`, `heat`, `morale` | `Sim.Dsl/ShipMetricsAdapter.cs:44-57` |

Which devices get adapters at all is `MossBindings.RegisterAdapters`
(`Sim.Dsl/MossBindings.cs:14-44`): named `Door`s, and named
`AirVent`/`Scrubber`/`SolarWing`/`GrowBed`/`WaterTank`/`Reclaimer`. **Everything else —
lights, batteries, radiators, conduits, workstations, telescopes — is unaddressable from
MOSS.** (`Terminal` devices *host* programs — they are the `terminalId` a script is stored
under — but are not themselves readable or commandable.) Room anchors come from saved sim
state, so bindings survive
loads and room recomputes. `ship` is read-only and cannot perturb the player-script
invariant. `ShipMetrics.Compute` is a full scan, so the `ship` snapshot is cached and
refreshed at most once per sim-second, keyed by `TickCount / TicksPerSecond` — a pure
function of the tick, so both determinism twins recompute at the same ticks
(`ShipMetricsAdapter.cs:33-40`).

### What MOSS can command

`open`, `close`, `lock`, `unlock` on doors (`DeviceAdapters.cs:33-44`); `open`, `close`,
`set(rate, <number|max|min>)` on utility devices (`:74-99`, rate clamped to `[0,1]` in
`SetDeviceStateCommand`, `Commands/Commands.cs:47`); and `alarm("…")`, which publishes an
`AlarmRaisedEvent { SourceId = terminalId, Message }` directly
(`Sim.Dsl/Interpreter.cs:151,218`) — so a script's alarm reaches `HistorySystem`, the
`MemorySystem` broadcast and the Director's tension accumulator on exactly the same
channel a machine failure does. Rooms have **no** commands (`DeviceAdapters.cs:130-134`).

### Budgets

`MossLimits.StepsPerProgram = 1000` and `StepsGlobal = 50000`, **per tick**
(`Sim.Dsl/Interpreter.cs:8-12`). Every AST node visit costs one step (`:52`). A budget
overrun is a **permanent** halt of that program until `SetProgram` is called again; type
errors and unknown devices halt for the current tick only (`:20-34,54`).

Tick phases inside one program (`Interpreter.cs:43-51`): (1) `when` / `alarm-when`
triggers, (2) `every` blocks, (3) top-level bare statements — each in source order. `let`
variables reset every tick. Edge latches start false, so a condition already true on the
first tick fires immediately.

**Program sources are sim state**: `sim.Scripts` is the canonical saved copy (`DSLS`
chapter); compiled programs are derived (`Simulation.cs:171-184`).

### Shipped content rules

Exactly one, `content/core/SimDefs/rules/overheat_guard.moss`:

```
every 60s:
  if ship.heat < 0.5: alarm("THERMAL LOAD HIGH — check radiators")
```

Its own comment says it is "inert under the shipped defaults". **On the shipping slice it
is not inert**: measured with the real `content/core/SimDefs` loaded, it fires **2,579
times over 3 sim-days** — every 60 s from roughly day 1.1, once `ship.heat` falls under
0.5 and stays there (§13.2).

---

## 12. Save & hash

Format: **MBSV**, chaptered, GZip-compressed, little-endian
(`Save/SaveWriter.cs:8-67`). `SaveFormat.GlobalVersion = 2`.

Header: magic `MBSV`, global version, tick count, next entity id, RNG state ×4, world
W/H/D, `WastewaterLiters` (v2) (`:141-157`).

Chapters, in write order (`:108-134`):

| FourCC | version | contents |
|--------|---------|----------|
| `TILE` | 1 | per deck: `Floor[]`, `Wall[]`, `Flags[]`, `RoomId[]`. **Flags saved verbatim** (incl. `HasDevice`/`Designated`) — the reader never re-derives them |
| `ROOM` | 3 | per room: `TileCount`, O2/CO2/N2 moles, `TemperatureK`; then anchors (name, probe, `RoomType` at v3) |
| `CITZ` | 6 | v2 +Thirst, v3 +ReservedItemId, v4 +RevealsFog, v5 +Faction/Health/Morale/Archetype, v6 +HoldPosition |
| `DEVC` | 4 | v2 +StoredLiters/Progress/FluidNetworkId, v3 +Condition, v4 +LockOwner |
| `ITEM` | 2 | v2 +Label |
| `DSLS` | 1 | MOSS sources per terminal |
| `DEFS` | 1 | the active `SimDefs.Checksum` — a **fingerprint only**; the loader's defs always win, a mismatch is an advisory warning (`SaveReader.cs:34-39`) |
| `SYSS` | 1 (×N) | one per `IStatefulSystem`: name, per-system `StateVersion`, blob |

Unknown chapter ids are skipped via their length prefix (forward compatibility). Known
chapters with an unknown version **throw**.

Never serialized (rebuilt on load): `ZLevel.RegionId`, power/fluid networks, the job board,
path caches. `PowerDirty`/`JobsDirty` are forced true and `RoomState.Dirty` defaults true
(`SaveReader.cs:15-24`). **Room contents ARE saved** — atmosphere is not derivable.

### `IStatefulSystem` implementers and their checksum seeds

| system | seed | StateVersion | source |
|--------|------|--------------|--------|
| `BuildSystem` | `'BULD'` | 1 | `Systems/BuildSystem.cs:53,284` |
| `GoalSystem` | `'GOAL'` | 1 | `Systems/GoalSystem.cs:44,145` |
| `HistorySystem` | `'HIST'` | 2 | `Systems/HistorySystem.cs:82,202` |
| `SocialSystem` | `'SOCL'` | 2 | `Social/SocialSystem.cs:53,291` |
| `DirectorSystem` | `'DRCT'` | 1 | `Director/DirectorSystem.cs:38,40` |
| `NavSystem` | `'NAVS'` | 1 | `Space/NavSystem.cs:28,207` |
| `MemorySystem` | `'MEMS'` | 1 | `Citizens/CitizenMemory.cs:239` (host-registered only) |
| `StockZoneSystem` | `'ZONE'` | 1 | `Stock/StockZoneSystem.cs` — W0-6 empty registry, §13.14 |
| `ProductionSystem` | `'PROD'` | 1 | `Production/ProductionSystem.cs` — W0-6 empty registry, §13.14 |
| `OreRegistrySystem` | `'ORES'` | 1 | `Mining/OreRegistrySystem.cs` — W0-6 empty registry, §13.14 |
| `TradeSystem` | `'TRAD'` | 1 | `Space/TradeSystem.cs` — W0-6 empty registry, §13.14 |
| `ScriptRuntime` | — | 1 | `Sim.Dsl/ScriptRuntime.cs:209` |
| `DesignerRuleSystem` | — | 1 | `Sim.Dsl/DesignerRuleSystem.cs:207` |

**`SYSS` free TEXT is hash-exempt** for `HIST`, `SOCL`, `GOAL` and `MEMS`: those checksums
fold tick + kind + subject ids (`HistorySystem.cs:200-212`), edge key + opinion + tier
(`SocialSystem.cs:289-310`), goal kind + done tick (`GoalSystem.cs:228-238`) and
counts/ticks/importance bits — never the free text. So rewording an entry never perturbs
determinism, but **adding** one does. Note the narrowing: this used to be stated as the
blanket "strings are hash-exempt", and W0-1b retired that (six saved strings are folded now,
three of them binding keys). The live rule is at `GoalSystem.StateChecksum`: **an entity
field the save format writes is hashed; a `SYSS` chapter decides for itself; human-readable
text stays exempt.**

**The ritual**: every field of the header/`TILE`/`ROOM`/`CITZ`/`DEVC`/`ITEM`/`DSLS` chapters
is also hashed — the scope note at `Simulation.cs:332-343` is the authority. Adding a
field means default + parser key + checksum fold + save round-trip + hash-move, in the
**same commit**, and updating the pin in `ci.sh` + `CLAUDE.md`. **And read `SaveWriter`
beside `StateHash` field-for-field when you do — W0-1b found thirteen fields that had
skipped this step, four of them only on a second reading.**

---

## 13. ⚠️ Known gaps — wired but not connected

*Mechanics that look implemented but do not close the loop. Every item below was verified
in this session by reading the code and, where a number is quoted, by a headless probe
against the shipping slice (`--ship slice`, `SimHost.SliceSeed`). **This section is the
institutional memory that prevents the next playtest surprise.***

### 13.1 Nothing converts an atmosphere reading into a job — and scrubbers cannot help the room the crew is in [CO2-transport half FIXED by B-3]

<!-- IN FLIGHT: CO2 → maintenance dispatch and the AgreeTask whitelist —
     MachineWearSystem.cs, EffectValidator.cs, CapabilityComputer.cs. -->
> **⚠ IN FLIGHT** — a lane is adding CO2→maintenance dispatch and revisiting the
> `AgreeTask` whitelist. This describes `0f88231`.

> **✅ FIXED by B-3 (`AtmosphereSystem.DiffuseAcrossDoors`)** — the "scrubbers cannot help the
> room the crew is in" half of this entry is resolved: partial-pressure diffusion across open
> doors now transports CO2 to the scrubber rooms, so the slice's crew corridor no longer climbs
> to 17,644 ppm — LIFE SUPPORT reads NOMINAL by day 3. The measured
> **500 → 6,243 → 11,961 → 17,644 ppm** figures and the "no diffusion" cause below describe the
> **PRE-B-3** sim. The FIRST half — nothing converts a CO2 reading into a job/alarm/vent — is
> untouched by B-3 and still live.

`RoomState.CO2Ppm` has exactly six consumers repo-wide (verified by grep):
`NeedsSystem.cs:130,132` (health damage: `> 2× co2_narcosis_ppm` severe, `> co2_narcosis_ppm`
i.e. 40,000 ppm ordinary — `:52` is SocialSystem class-doc, not the consumer), `ShipMetrics.cs:67` (HUD),
`Sim.Glyph/GlyphMapper.cs:194` (the CO2 lens), `Sim.Dsl/DeviceAdapters.cs:123` (MOSS
`room.co2`), `hosts/scenario/Program.cs:377` (the scenario runner's own binding) and
`hosts/tui/Ui/InspectorModel.cs:54`. **No system reads it to dispatch work, raise an
alarm, or open a vent.** The GDD's 5,000 ppm alarm and 10,000 ppm impairment bands do not
exist in code.

Worse, the slice's air is *nominally over-scrubbed* and still poisons the crew:

- 5 scrubbers × `0.001 mol/s` = 0.005 mol/s removal vs 8 crew × `2.73e-4` = 0.002184 mol/s
  production — **2.3× the required capacity**, every scrubber healthy and powered.
- Yet measured worst-room CO2 climbs **500 → 6,243 → 11,961 → 17,644 ppm over 3 days**
  (`hosts/tui --dump --ship slice --days 3 --metrics`, and the same figures from a probe).
- Cause (PRE-B-3; now fixed — see the banner above): scrubbers are **room-local**, and §3's
  door flow was **pressure-driven bulk flow with no diffusion** (`AtmosphereSystem.cs:113`).
  After 3 sim-days the scrubber rooms sit
  at **exactly 0 ppm** (rooms 6, 9, 18, 19 in the probe) while the corridor the crew
  actually live in (room 5, 108 tiles) is at **17,644 ppm** and room 17 at 8,381 ppm.
- The scrubber rooms read 0 ppm *because* CO2 keeps arriving and is over-scrubbed — not
  because nothing arrives. Bulk flow never stops (§3: a standing `4.3e-4` kPa Δp between
  r5 and r6 at day 2, ~430× the `1e-6` no-flow cutoff), it is simply **too slow**.
  Measured ship-wide over day 1 → day 2: 8 crew produce **188.70 mol** of CO2, the ship's
  room inventory grows by **109.97 mol**, so only **78.72 mol — ≈ 42 %** — is removed. The
  scrubbers have 2.3× the nameplate capacity and still get less than half the ship's
  output, because most of it is in a room they are not in.

So the scrubbers scrub near-empty air. Nothing notices and nothing dispatches. The worst room
accumulates ≈ **5,700 ppm/day** over days 1→3, so from 17,644 ppm it needs roughly **four
more days** to reach the 40,000 ppm narcosis threshold that *does* have a consumer — i.e.
the only CO2 mechanic that exists arrives around day 7 of an unattended voyage, with no
warning of any kind before it.

### 13.2 The ship freezes, and the one shipped MOSS rule screams about it forever

Measured after 3 sim-days on the slice: room 14 at **−12.9 °C**, room 20 at **−12.2 °C**,
rooms 10/13 at −4.5 °C, most of the ship in the 0–10 °C band. `hypothermia_c = −10`
(`needs.def`), so those two rooms are already inflicting hypoxia-rate suffocation damage on
anyone who walks in. The `heat` metric (fraction of pressurized rooms in the 10–35 °C
comfort band) falls **1.00 → 0.20** over three days.

`content/core/SimDefs/rules/overheat_guard.moss` fires
`alarm("THERMAL LOAD HIGH — check radiators")` whenever `ship.heat < 0.5`, every 60 s.
Its own comment says it is "inert under the shipped defaults". It is not: measured with
the real defs+rules directory loaded, it fires **2,579 times over 3 sim-days** — first at
tick 1,045,200 (**day 1.21**), then every 60 s, and it never stops, because the trigger is
the ship getting *cold* and nothing warms it back up. Radiators have a 10 °C floor; **hull loss does
not**, and nothing heats a room deliberately. The message also tells the player the exact
opposite of what is happening.

### 13.3 `FollowPlayer` is written, saved and hashed — and read by nothing

`EffectValidator.cs:38` sets `mind.FollowingPlayer`. It is persisted
(`Citizens/CitizenMemory.cs:369`), restored (`:425`) and folded into the `MEMS` checksum
(`:482`). **No system, host or client reads it** (grep: the only other hits are the
persistence test). `CitizenMind.FollowingPlayer`'s own comment admits it: *"v0: flag only —
no follow movement behavior yet"* (`:113`). It is still offered to the model as a
capability on every single turn (`CapabilityComputer.cs:55` puts it in the *always legal*
set), so a crew member will cheerfully agree to walk with you and then not.

### 13.4 Four citizen fields the sim writes but never uses — and one it never writes

<!-- IN FLIGHT: task labels / build-ghost wire fields — hosts/web/GameSession.cs (TaskLabel,
     BuildRoster/BuildDesigns), hosts/web/WireFormat.cs (Design), client work-marker layer
     + CREW WATCH task line. The roster-wire discussion below describes 0f88231. -->
> **⚠ IN FLIGHT** — the task-label / build-ghost-wire lane is changing what the roster and
> `designs` channels carry. `GameSession.TaskLabel` stops emitting five generic words and
> **names the object** ("Servicing scrubber_ls", "Hauling regolith to wall 3,4 (0/2)"),
> `WireFormat.Design` gains `delivered`/`required` as **append-only** tuple elements 5 and 6,
> and the client grows on-map WORK markers plus a CREW WATCH task line. `task` is a
> pre-existing roster field, so no wire shape moves and a four-element `designs` reader is
> unaffected. §13.4's roster-wire bullet and §15's `WebCommand.Parse` row describe `0f88231`.

- **`Fatigue`** rises at 1/57,600 per second to a hard clamp of 1.0 after 16 h and
  **nothing anywhere reduces it**. There is no sleep mechanic; `Bed` is inert furniture
  (`machines.def`: `Bed 0 0 Comfort false 0 0 0 0`). Measured: all eight slice crew are at
  `Fatigue = 1.00` after one sim-day, permanently costing 25 mood points.
- **`Mood`** is computed but gates nothing — no work-speed modifier, no breaks (§5.3). It
  is not a flat line: it **sawtooths**, because the hunger/thirst terms ramp and then drop
  each time a citizen eats or drinks. Measured on the slice, crew-mean at the day marks:
  **−37.7 (day 1) → −26.4 (day 2) → −29.5 (day 3)**, with a per-citizen envelope over days
  1–3 of roughly **[−39.8, −10.5]**. The durable fact is the ceiling, not the average:
  `Fatigue` saturates at 1.0 after ~16 h and never falls, so `Mood ≤ mood_base −
  mood_fatigue_weight = 20 − 25 = −5` from then on (`NeedsSystem.cs:81-85`, `needs.def:27-31`).
  **Mood is permanently negative for every crew member from day 1 onward**, whatever they
  eat.
- **`Citizen.Health`** (`Citizen.cs:31`, "Damaged by hypoxia, cold and struggle") is
  **never written by any system**. It is saved (`SaveWriter.cs:263`), hashed
  (`Simulation.cs:264`) and displayed (`hosts/tui/Ui/InspectorModel.cs:83`). Measured:
  1.00 for everyone after 3 days of CO2 poisoning and near-hypothermia.
- **`Citizen.Morale`** (the raider-resolve field, distinct from `Mood`) is likewise never
  written — and it is the value the shipping client's **CREW WATCH morale bar** displays
  (`hosts/web/GameSession.cs:609` puts `c.Morale` on the roster wire). Measured: **1.00
  for every crew member at all times.** The visible morale bar is a constant.
- **`Citizen.Archetype`** is saved and hashed with **no reader anywhere** (raider
  groundwork). `Citizen.Faction` *is* read — but only for colour: hostile pawn tint
  (`Sim.Glyph/GlyphMapper.cs:123`) and a TUI inspector label
  (`hosts/tui/Ui/InspectorModel.cs:82`). Neither is ever set to a non-zero value by
  shipped content, and no system treats factions differently.

### 13.5 Persona `RoleNow` / `RolePreRaid` are cosmetic strings

Confirmed by grep across `sim/` and `hosts/`: read only by
`hosts/web/GameSession.cs:546,603` (the roster/bio wire), `Sim.Llm/CitizenContext.cs:114-115`
(prompt prose), `Citizens/PersonaSheet.cs:193` (`RolePreRaid` interpolated into the raid
backstory string) and `hosts/scenario/PersonaDump.cs:44` (`rolePreRaid` in the portrait-
pipeline JSON). All four are prose or display. **No sim system consults a role.**
Amara Okonkwo's `RoleNow = "life-support lead"` (`Sim.Gen/AuthoredShips.cs:354`) does not
make her more likely to maintain a scrubber, reach one first, or be told about one.

### 13.6 The player verbs — CLOSED by E0-3, and an earlier measurement here was stale

**Status: closed (E0-3, 2026-07-23).** This section previously claimed that three `JobKind`s
were unreachable on the slice and that `AgreeTask` was dead code. Re-measured during E0-3,
**part of that was already false when it was written** — the correction is recorded here
rather than quietly deleted, because the stale numbers were cited in several later plans.

**What was true, and is now fixed.** `TileFlags.Designated` had exactly one writer
(`DesignateDigCommand`) issued from exactly one place, the **TUI**
(`hosts/tui/GameLoop.cs:293`). The web host's parser exposed no dig verb and no stockpile
verb. **E0-3 adds both** (`dig` / `stockpile` in `hosts/web/GameSession.cs`, driving the
existing commands; ⛏ DIG and ▤ STOCKPILE on the console palette, keys `G` and `Z`), and
gives the two long-reserved `GlyphColor` ids — `Designate` (15) and `Stockpile` (16) — their
first emitter in `GlyphMapper.Project`, so a designation is finally *visible*.

**What was stale.** "48 debris tiles, **0 designated**" and "`digTargets = 0`, `AgreeTask`
is dead code" no longer described the shipping slice, and had not since commit `5e2bd41`
("restore the slice's work economy", 2026-07-21). `AuthoredShips.PeriluneSlice` calls
`DesignateDebrisRect(plan, 57, 6, 62, 13, z: 0)` and `ShipPlanBuilder.cs:63` applies
`plan.DigDesignations` as real `TileFlags.Designated` at boot. Re-measured on the shipping
slice (`SliceDigLoopTests`): **48 debris tiles, 48 designated, 0 stockpile tiles**;
`digTargets > 0` and **`AgreeTask` is legal** for idle crew at boot. The `ClearAllDebris`
goal is likewise completable — E0-1 is what made the authored seed actually get *worked*.

So the honest accounting of what each lane bought:

| claim | reality |
|---|---|
| `JobKind.Dig` unreachable | **was already reachable** via the authored seed; E0-1 made it get worked |
| `AgreeTask` dead code | **was already legal** on the slice since `5e2bd41` |
| `HaulPickup`/`HaulDeliver` unreachable | **TRUE and closed by E0-3** — see below |
| no player dig/stockpile verb | **TRUE and closed by E0-3** |

**The haul half was the real gap, and it is the unqualified E0-3 win.** `HaulJobSource`
builds haul candidates only when a *free stockpile tile* exists, and **nothing anywhere
authors a stockpile** — 0 zoned tiles on the slice, on the default ship, and on every
generated ship. `HaulPickup`/`HaulDeliver` genuinely could not be assigned in any shipped
configuration until a player could zone one. E0-3's stockpile verb is that capability.

**What the dig verb genuinely adds**, now that the `AgreeTask` framing is corrected: the
player can designate work the *author* did not pre-place. That matters on the slice once the
authored aft seed is dug out, and on **every generated ship**, which authors no designations
at all. Pinned in `SliceDigLoopTests.WithTheAuthoredSeedCleared_OnlyAPlayerOrderCanCreateDigWork`.

**Player-order precedence (the E0-1 revisit, also E0-3).** E0-1's relaxed `IsIdleForWork`
made an explicit `MoveCitizenCommand` hijackable by auto-work mid-walk — latent only because
no web verb could create work. New hashed `Citizen.OrderedMove` + `IsRecruitableForWork`
(`IsIdleForWork && !(OrderedMove && HasPath)`) now guard the three **work** recruiters
(`JobSystem`, `CraftingSystem`, `MachineWearSystem`). `SustenanceSystem` deliberately keeps
using `IsIdleForWork`: an order suppresses **work**, never **survival** — a crew member
crossing a real thirst/hunger threshold mid-order still diverts, exactly as E0-2's
`SafetySystem` still lets them flee lethal air. See §5.1.

**Job occupancy has now been re-measured** (2026-07-23, post-E0-1/2/3) — see **§13.15**, which
supersedes the `None 99.92 %` figure. Headline: `None` fell **99.92 % → 85.28 %** over 3 sim-days,
so the labour fix worked; but the remaining work is finite and the ship goes **permanently idle
after sim-hour 28**. The `wander_radius_tiles` default (8) is still UNTUNED — tuning it against a
labour metric is premature while the binding constraint is matter, not labour (§13.15).

### 13.7 The social graph saturates in a single day

`argument_chance_per_pass` and `bond_chance_per_pass` are per **1 Hz pass** — i.e. per
second of shared-room time, per pair. At `bond_chance_per_pass = 0.02` a co-located pair
above the +20 floor bonds roughly every 50 seconds, at +5 each time, against a decay of
only 0.1/hour.

Measured on the slice over **one** sim-day: **2,611 bond events, 720 argument events, 29
relationship-tier changes**. Every authored edge went to its clamp:
Amara→Priya 40 → **100 (CloseFriend)**, Amara→Nadia 65 → **100**,
Dmitri→Salif −40 → **−100 (Enemy)**, Dmitri→Tomas 40 → **100**. Every previously
unrelated pair reached ≈ **+8** by proximity alone. The authored relationship web — the
subject of the RELATIONS tab — is fully saturated before the end of day 1, and the
hysteresis classifier never gets to do anything interesting because the opinions are
pinned at the clamp.

Compounding it: the argument gate is `lowerMood < 0` (`argument_mood_threshold = 0`), and
§13.4 shows mood is permanently negative for everyone from day 1 — so **the mood half of
the argument gate is permanently open**.

### 13.8 Crew memory and the Chronicle are flooded by social/brownout spam

A direct consequence of §13.7 and §13.11, and it lands squarely on the "talking ship"
pillar. Measured on the slice with the real defs+rules loaded:

- **After one sim-day, Amara Okonkwo's 120-entry episodic memory is 100 % `social`-tagged**,
  and the top-8 memories `CitizenContext.Build` would put in her prompt are eight lines of
  the same shape with only **two distinct texts** — five × *"Grew closer to Nadia Hassan."*
  and three × *"Grew closer to Priya Raghavan."*
- After three days it is 78 `social` + 42 `alarm` entries (the overheat klaxon), top-8 all
  *"My feelings about ⟨name⟩ changed."* **Zero** persona, player or conversation entries
  survive — `CitizenMemory.Add` evicts the lowest-importance entry, and a 0.5–0.6 social
  event outranks an `EndConversation` memory (0.4) and most `SetDisposition` reasons
  (0.3–0.7, `EffectValidator.cs:84`).
- The ship's 200-entry `HistorySystem` buffer at day 3 holds **174 Brownout + 23 Bond + 3
  Alarm** entries. `HistorySystem.MaxEntries = 200` with `RemoveAt(0)` eviction
  (`Systems/HistorySystem.cs:76,146-150`) means the Chronicle's window is entirely power
  flapping.

So a crew member talked to on day 2 remembers nothing but that she grew closer to people,
and the ship's log is a brownout ticker.

### 13.9 `TrustToPlayer` and `RevealDifficulty` are decorative

`SetDisposition` writes `mind.TrustToPlayer` with a ±15 clamp
(`EffectValidator.cs:76`). Nothing reads it — grep shows only save/restore/hash. Both
`SecretRecord.RevealDifficulty` and `AuthoredSecret.RevealDifficulty` are documented as
*"0..1, checked against trust by the dialogue layer"* (`Citizens/PersonaSheet.cs:10,54`)
and the eight slice secrets carry hand-tuned values from 0.55 to 0.85
(`AuthoredShips.cs:369-551`). **No code path checks either.** `ApplyReveal`
(`EffectValidator.cs:156-180`) tests only "the fact exists", "not already revealed" and
"this mind knows it". A model that calls `reveal_info` gets the secret on turn one
regardless of trust.

### 13.10 A reload is not bit-exact under run-on: `RoomState.Recompute` is not gas-idempotent

**The save is not the cause — `Recompute` is**, and the cleanest demonstration removes the
save path entirely: on a *single* sim, with no partition change at all, `MarkDirty()` +
`RecomputeIfDirty()` moves `StateHash` and perturbs **20 of 22 rooms**. A reload merely
triggers it, because `SaveReader` leaves `RoomState.Dirty = true` by design, so the reloaded
sim runs `Rooms.Recompute` on its first tick while an uninterrupted twin does not.

Two distinct lossy paths inside `RemapGas` (`Rooms/RoomState.cs:322-340`):

- **Gases** are rebuilt as a sum of per-tile shares, and the share is a **reciprocal
  multiply**, not a division — `double share = 1.0 / oldRoom.TileCount` (`:331`) then
  `newRoom.O2Moles += oldRoom.O2Moles * share`. Computing the reciprocal once and multiplying
  is fractionally lossier than dividing per tile, and it rules out "just divide" as a fix.
- **`TemperatureK`** drifts by a *different* route: it is a weighted mean,
  `tempWeighted / shareSum`, not a sum — so a fix aimed only at the mole sums would leave
  temperature drifting.

So **recomputing an UNCHANGED partition perturbs O2/CO2/N2 *and* temperature in the last
bits.** Measured on the slice (save at T = 300, fresh system stack, `SimDefs.Default`): the
hash is bit-exact **at load**, and essentially every room drifts on the very first tick after
it. The drift **grows with run-on** — worst ~2.7e-15 relative on the first tick, ~1.5e-14 by
N = 1000 — so quoting a single figure understates it; the largest absolute case at the first
tick is O2 `663.9121356693391` vs `663.9121356693432`. Nothing else drifts: crew, items,
devices, the world arrays, RNG, tick count, wastewater and every `IStatefulSystem` fold are
bit-exact 1000 ticks later (`SaveRestoreRunOnTests.SaveLoadTickThousand_WithoutAMatchedRecompute_…`
asserts exactly that blast radius, at a 1e-9 relative band ≈ 6.5×10^4 times looser than the
worst measured drift — it permits the drift rather than requiring it, so a fix cannot redden
it).

Consequences worth knowing before the economy lands: (a) the ECONOMY-PLAN §5.1 "save → load
→ tick 1000 → re-compare" test can only demand whole-`StateHash` equality if both sims take
the same recompute, which is why the shipped test marks the twin's rooms dirty; (b)
`P2ExitTests` compares only per-system folds after its reload for this reason; (c) a player
who saves and reloads gets a very slightly different ship, forever. This is the long-standing
"save-reload thermal ULP drift" in `HANDOVER.md` — the cause is now located, not fixed. The
fix (skip the remap when the partition is unchanged, or remap by total rather than per-tile
share) changes sim behaviour and moves every pin, so it is its own package.

### 13.11 Smaller dead wires

- **`PromiseBrokenEvent`** (`Events/SimEvents.cs:93`) is declared and **never published or
  consumed** anywhere. `MemorySystem` writes promise *formation* only
  (`Citizens/CitizenMemory.cs:300-308`), and its class comment says breaking is
  "deferred… filed as contract requests" (`:210-213`).
- **Generation ignores `Condition` and `IsOperational`.** `PowerSystem.Balance` sums
  `def.GenerationKW` for every device on a network with no wear or operational check
  (`Systems/PowerSystem.cs:121-122`). A `SolarWing` at `Condition = 0.05` (well below its
  `fail = 0.10`) still delivers a full 6 kW. Every *consumer* gates on `IsOperational`;
  producers do not.
- **Crafting stations draw full power while idle.** `IsWanting` returns true for every
  device except a closed `AirVent` (`PowerSystem.cs:183-187`), so the slice's Fabricator
  (3 kW), MachineShop (2 kW) and SalvageRecycler (1.5 kW) load the bus 100 % of the time
  against 12 kW of solar. Measured: the slice flaps in and out of brownout continuously —
  **174 of the 200 history entries at day 3 are alternating browned-out/recovered on
  network 1** (see §13.8 for what that does to the Chronicle).
- **The greywater pool empties and the water loop stalls.** Measured after 3 days:
  `WastewaterLiters = 0.0`, `water` metric pinned at 0.50 from day ~1.3 onward. The loop
  leaks 20 % of every litre of irrigation (only 0.8 is recaptured, `hydro.def`) plus 7 %
  per reclaim pass, and the only inflow is drinking (0.5 L/drink) and transpiration.
  Grow-bed output followed: **285 potatoes on the ship after 3 days** (from a ~27-potato
  opening stock, minus what was eaten) against a theoretical ~1,296 harvests if the three
  beds had run continuously — i.e. the beds were dry most of the time.
- **`WaterSystem`'s dirty proxy has a known hole**: it rebuilds only when
  `sim.DeviceTopologyVersion` changes, so a remove+add pair landing between two water ticks
  leaves the fluid topology stale (`Systems/WaterSystem.cs:31-37`, documented).
- **Room 0 accumulates `TileCount` but never `HullTiles`** — vacuum regions add their tile
  count to `Rooms[0]` without a `CountHullTiles` call (`Rooms/RoomState.cs:156-157`).
  Harmless (the thermal loop starts at index 1, `ThermalSystem.cs:123`), but do not read
  room 0's row as meaningful.
- **Doors' waste heat is silently dropped** — a door tile belongs to no room, so
  `machines.def`'s `Door heat = 0.05` never lands anywhere (`ThermalSystem.cs:72-78`,
  documented as by design).
- **`ExplorationSystem` never un-explores.** `Explored` is a tile flag, saved verbatim,
  never cleared (`Systems/ExplorationSystem.cs:7-8`). There is no "greyed last-known-state"
  memory layer — a tile is either dark or fully live.

### 13.12 Non-gaps worth not re-investigating

These *look* suspicious and are actually fine:

- `MachineWearSystem` skipping unpowered machines is deliberate (idle machines don't wear).
- `RelationType` starting at `None` for seeded edges at boot is correct — `Classify` runs
  on the first social pass.
- `DirectorSystem` shipping with `IntervalTicks = 1` but a 100-tick heavy pass is
  deliberate: the event bus is double-buffered and a coarse sampler would miss alarms.
- `EffectPump` and `MemorySystem` not being in the scenario stack is why the pure-sim
  determinism pin is stable.

### 13.12 The `[production]` node table is consumed, and ships empty (W0-5)

`SimDefs.Production` — the `[production]` conversion-graph node table
(`Defs/ProductionDefs.cs`) — is parsed, folded into the defs checksum, and read on every
crafting pass: `CraftingSystem` resolves *every* station through
`ProductionDefs.TryGetBill`, which prefers the station's node and falls back to its legacy
`SimDefs.Recipes` row. But `content/core/SimDefs/production.def` declares **zero rows**, so
every shipped station takes the *fallback* leg. **Nothing in the shipped game is a graph
node**, and the multi-input / multi-output / sink machinery in `CraftingSystem` is exercised
only by tests.

- **What would connect it:** authoring rows in `production.def`. E0-6 ("conversion loss +
  `Seals`", `ECONOMY-PLAN.md`) is the first work package that wants one.
- **Conversion loss (sink S3) is therefore still unbuilt.** The container expresses loss as
  the integer input:output ratio (`Scrap:20 → Regolith:17` is exactly 85 %); with an empty
  table no shipped hop is lossy and the graph returns 100 % everywhere.
  - Stated precisely, because the loose version overstates it: the `SalvageRecycler` hop
    alone *does* double unit count — measured, 3 `Regolith` at a recycler yields
    `Regolith = 0, Scrap = 6`. But the two-hop metal loop
    `Regolith:1 → Scrap:2 → (Fabricator Scrap:2 → Parts:1)` is exactly **1 Regolith → 1
    Part**, so in ECONOMY.md §10's Part-equivalent accounting the shipped chain is
    **loss-free (100 %), not a net matter source**. What is missing is the *drain* S3
    names — every hop returning less than it took — not a leak that needs plugging.
- **Batch size is a staging requirement, not just a ratio.** `AllInputsStaged` is
  all-or-nothing and `StepFetch` fetches one stack per trip, so a fine-grained ratio like
  `Scrap:20 → Regolith:17` makes the crew stage 20 units before a batch starts — ~5× the
  hauling round-trips of a coarse `Scrap:4` node, and a correspondingly longer bench idle
  stretch. Anyone tuning this table must scale `work_s` with the batch (a 5× batch at
  unchanged `work_s` is a ~5× throughput change) and should buy ratio precision
  deliberately. This lands on the labour budget A1 measures.
- **Deliberately not shipped:** a fractional yield column. `floor(n·y)/n = y` only when
  `n·y` is integral, so 0.85 would need out-counts in multiples of 20 and a single
  node-level yield gives a different effective rate per output port. Loss lives in the
  counts.

**Two nodes on one station parse but only the first RUNS.** `TryGetBill` resolves **ordinal
0** — the first node in table order naming that station. A second node parses, folds into
the checksum and is reachable via `ProductionDefs.TryGetNode(station, ordinal, …)`, but
nothing selects among them. This is deliberate: selection needs per-station state (which
bill is mid-batch, priorities, quotas) and therefore a save chapter, which is E-PROD's
`PROD` blob. It is **not silent** — `DefsParser` emits a problem line naming both node ids
and pointing here. *What would connect it:* E-PROD's `PROD` `SYSS` chapter plus a selection
policy.

Also on this table: `ProductionDefs.CountFor` is container API with no sim consumer yet
(tests and the parser warning only).

### 13.14 Four economy systems are registered, fold the pin, and hold no state (W0-6)

`SystemStack.CreateDefault` registers four **passive, empty** `IStatefulSystem`s grouped
after `BuildSystem` — `StockZoneSystem` (`'ZONE'`), `ProductionSystem` (`'PROD'`),
`OreRegistrySystem` (`'ORES'`), `TradeSystem` (`'TRAD'`). Each has a no-op `Tick`, a
`CaptureState` that writes only a state-marker byte, a `RestoreState` that version-*branches*
(never `if (version != 1) return;`), and a `StateChecksum` that folds only its FourCC seed.
That empty seed-fold is exactly what moved the three determinism pins (W0-6). They exist so
the SYSS chapters and seeds are declared **once, batched** — the economy lanes then fill in
real state without another pin site to find, `SystemStack` reorder, or save chapter to invent.

- **Holds no state today.** Every system's persisted payload is a single constant byte; there
  is no behaviour behind any of them. A pre-W0-6 save (no economy chapters) loads into the
  economy build as empty economy state with no reader branch —
  `EconomySystemRegistrationTests.PreEconomySaveLoadsIntoEconomyBuild_*` pins that compat.
- **What would connect each (the E-lane that owns it, `ECONOMY-PLAN.md` §2):** `'ZONE'` →
  **E-STOCK** filtered stockpile zones (`sim/Sim.Core/Stock/`); `'PROD'` → **E-PROD** the
  production graph / station bills (`sim/Sim.Core/Production/`, which also takes over
  `CraftingSystem`); `'ORES'` → **E-MINE** the ore-deposit registry an extraction `IJobSource`
  reads (`sim/Sim.Core/Mining/`) — a *registry*, not a ticking system, per §3.4; `'TRAD'` →
  **E-VOY** trade (`sim/Sim.Core/Space/`). `CITZ` v7 (E-PEOPLE) and `ITEM` v3 (E-DECAY) are
  entity-field bumps, not new systems; `NAVS` ext (E-VOY) extends the existing `NavSystem`
  chapter — none of those are registered here.

### 13.15 The economy is finite and TERMINATES — measured A1 (2026-07-23)

**This supersedes §13.6's `None 99.92 %` occupancy table**, which was pre-E0-1. Measured with
`dotnet run --project hosts/scenario -- occupancy --ship slice --days 3`, sampling every live
crew member's `JobKind` every tick. "work" excludes `Eat`/`Drink`/`Flee`.

**A1 (`ECONOMY-PLAN.md` §E0's goal: ≥ 25 % busy at sim-hour 24) = 24.979 % — FAIL, by 0.02
points.** But the pass/fail is the least interesting part; the *shape* is the finding.

| | pre-E0-1 (§13.6) | now (3 sim-days) |
|---|---|---|
| `None` | 99.92 % | **85.28 %** |
| `Craft` | 0.01 % | 12.35 % |
| `Dig` | 0.00 % | 1.41 % |
| `Maintain` | 0.03 % | 0.90 % |
| `HaulPickup`/`HaulDeliver`/`Build`/`HaulToBuild` | 0.00 % | **0.00 %** |

**So E0-1/E0-2 worked** — the labour pool really did open up (busy 0.08 % → 14.72 %). The
problem has moved.

**The busy curve, by sim-hour:** `80 % → 75 % → 37.5 % (h3–18) → 25 % (h19–27) → 12.5 % (h28)
→ ~1.5 % from h29 onward.` The flat plateaus are exact crew fractions (3/8, then 2/8) — a fixed
number of crew on long crafting bills, not a busy ship.

**CORRECTED 2026-07-23 (E0-5): the post-cliff floor is 1.480 %, not 0.0 %.** Measured over h29–h72
the mean work-busy is **1.480 %**, with sporadic spikes (h45 9.5 %, h46 13.6 %, h62 15.0 %, h68
6.5 %). `MachineWearSystem` is the *one* demand source that survives the cliff: wear is a rate and
the overhaul consumes `Parts` (of which the ship still holds some) without new feedstock. "0.0 % from
h29 onward, forever" overstated it; the economy idles, it does not flatline.

**Why it terminates** (end-of-run state, printed by the harness):

- **`debris tiles left: 0`.** The authored 48-tile field is fully dug out by ~h2. **Nothing
  regenerates debris**, so `JobKind.Dig` can never be assigned again on that ship, ever.
- **`stockpile tiles zoned: 0`.** Haul stays structurally unreachable unless a player zones one
  (E0-3 shipped the verb; nothing zones by default).
- **`ground stock: Corpse=1, Potato=699, ControllerModule=31`.** No `Regolith`, no `Scrap`, no
  `Parts` left — all of it was converted, and the terminal product is **`ControllerModule`,
  which nothing in the repo consumes.** Sole producer: `MachineShop: Parts 2 → ControllerModule 1`
  (`SimDefs.cs:606`, `recipes.def:22`). This is `ECONOMY.md`'s A6 dead-`ItemKind` confirmed by
  measurement: the ship spends its entire finite matter budget manufacturing a paperweight.

**Not slice-specific.** `--ship grid` (3 crew) shows the same terminal shape and dies sooner:
`Craft 28.23 %` on day 1 but **A1 at hour 24 = 0.000 %**, ending at `0 debris, 0 stockpile,
Potato=273, ControllerModule=12`.

**The binding constraint is now MATTER, not LABOUR.** Every ship converts its finite starting
matter into an unused item and then idles forever. That reframes the rest of E0: tuning
`wander_radius_tiles` against a labour metric is premature, and the lanes that matter are the
ones that create *durable* demand or supply — **E0-5** (deconstruct: a real one-way matter
source), **E0-7** (ice → water: a recurring haul source), **E0-6** (conversion loss, and the one
thing that finally gives `ControllerModule` a consumer). **E0-4** (filtered stockpile zones)
unblocks the 0.00 % haul kinds but adds no matter, so it moves haul off zero without extending
the 28-hour runway.

**E0-5 LANDED 2026-07-23 — deconstruct extends the runway, measured.** With the opt-in `--strip N`
harness (which designates N *reachable* interior walls at t=0 — the plain verb-less path is
unchanged), `occupancy --ship slice --days 3 --strip 40` lifts the h29–h72 floor **1.480 % → 13.198 %**
and flips **A1 24.979 % (FAIL) → 37.424 % (PASS)**. 40 walls yield 40 `Regolith`, which idle crew craft
up the ladder to **+19 `ControllerModule`** (31→50) — matter conserves, nothing minted. Deconstruct is
**player-designated**, so it is inert on every authored ship (none designates a strip); the runway
extends only when a player chooses to tear the ship apart. This is the "deconstruct at a loss"
faucet of §7.2, now real. See `docs/HANDOVER.md` "E0-5". §13.16 records the wired-but-not-connected
follow-ups (furniture strip currency, placement haul, MOSS write legibility).

---

### 13.16 E0-5 deconstruct — what is wired but not connected (owner: E0-6)

The deconstruct verb is complete and reviewed, but four seams were deliberately left for E0-6, each
recorded here so they are not rediscovered as bugs:

- **Furniture costs machine `Parts` to place.** `PlaceDeviceCommand` charges `device_place_cost`
  Parts in the *same* currency the strip refunds, because charge-currency must equal refund-currency
  or the place→strip loop reopens per-kind. That is economically correct but fictionally odd (a chair
  costing machine parts). The clean fix is furniture with its own strip yield in its own currency —
  E0-6, not a per-kind cost table here (`PlaceDeviceCommand.Execute`, `DeconstructSystem.DeviceSalvage`).
- **Placement material teleports.** The Parts cost is consumed from any loose ground stack aboard, in
  item-store order, with no haul and no distance term. A real staged-haul placement is `BuildSystem`'s
  shape and belongs to E0-6. Stated in the command's doc comment.
- **MOSS write-only scripts fail silently against a stripped device.** A read against a removed device
  breaks legibly (the adapter is gone); a `TryInvoke` write enqueues against a dead id and returns
  true, so a write-only script fails silently forever. The fix belongs in `Sim.Dsl`.
- **No client feedback on an unaffordable placement.** The command refuses (a bit-for-bit no-op), but
  the shipping client shows the player nothing. A WP-level client affordance, E0-6.

Also structural, not a defect: **`Conduit`/`Pipe` are un-strippable** because `Simulation.IsUtilityOverlay`
keeps them off the device grid, so `TryGetDeviceAt` never resolves them — a consequence, not a designed
rule. And the **`IsPressureHull` predicate is in-plane only** (4-neighbour, no z-term) and geometric,
not structural (there is no hull-stress model — `ShipSystems.cs:650-694`); on the solid-mass slice it
reduces to the map-edge ring.

---

## 14. Where GDD.md / TDD.md disagree with the code

`docs/legacy/GDD.md` §4 and §5 are **aspiration**, and `CLAUDE.md` still marks legacy docs
"authoritative where the new docs don't supersede". For mechanics, **this document
supersedes them**. Concrete divergences found while writing it:

| GDD/TDD says | The code does | Where |
|--------------|---------------|-------|
| CO2 alarm 5,000 ppm; impairment 10,000 ppm; narcosis 40,000; lethal 80,000 | Only 40,000 (hypoxia-rate) and 80,000 (vacuum-rate) exist. No alarm band, no impairment debuff | `needs.def:17`, `NeedsSystem.cs:62-65` |
| ppO2 death timer < 6 kPa | No 6 kPa band. `severe_hypoxia = 10 kPa` → vacuum-rate; separate total-pressure `vacuum = 5 kPa` | `needs.def:15-18` |
| Fire risk above 25 % O2 | Not implemented anywhere | — |
| Solar wings **50 kW** combined; auxiliary fission unit 40 kW; battery bank 200 kWh | `SolarWing gen = 6 kW` each (slice has 2 ⇒ 12 kW); no fission DeviceKind exists; `BatteryCapacityKWh = 40` each (slice has 2 ⇒ 80 kWh) | `machines.def`, `Entities/Device.cs:71` |
| Turret (safe/armed), electrolyzer, melter, pump, breaker, logger devices | None exist. `DeviceKind` has 26 members, none of them these | `Entities/Device.cs:3-33` |
| Potato cycle 70 days → 12 in-game days | **600 seconds**, explicitly flagged as a dev rate | `hydro.def:11` |
| Drinking 3.5 L/p/day, total use 20 L/p/day | `drink_liters = 0.5` at a `≥ 0.5` thirst trigger with a 24 h fill ⇒ ≈ 1 L/person/day | `sustenance.def`, `needs.def:25` |
| Citizens eat 2,200 kcal/day | Hunger is an abstract 0..1 with a 48 h fill; a potato removes 0.36 | `needs.def:24`, `sustenance.def:11` |
| Job types Haul/Build/Clear/Farm/Operate/Repair/Guard **+ a RimWorld-style 1–4 per-citizen priority grid + skills 0–10** | 10 `JobKind`s, **no priority table, no skills at all**. Selection is nearest-by-Manhattan with a fixed category tie-break | `Entities/Citizen.cs:85-97`, `JobSystem.cs:242-422` |
| Mood gates work speed; below −60 citizens "break" and refuse work | Mood gates nothing; no breaks | §5.3 |
| Low mutual opinion → work-together penalty | No work penalty exists; opinion only classifies tiers and gates argument/bond rolls | `SocialSystem.cs` |
| Rationing policies, stockpile filters, room-role assignment UI | Not implemented. `Stockpile` is one boolean tile flag with no filters | `World/TileDefs.cs:13` |
| `~160×40 tiles, 6 decks` | The authored slice is **64×20×2** | measured at boot |
| Gravity 0.16 g, fall damage, hauling capacity | No gravity, no falls, no carry limits (a citizen carries exactly one stack) | — |
| Ten scriptable device types incl. turret/alarm/logger; `on event:` handlers | **Seven** adapter-bearing device kinds (`Door` + `AirVent`/`Scrubber`/`SolarWing`/`GrowBed`/`WaterTank`/`Reclaimer`) + room anchors + read-only `ship`; no `on event:` | `Sim.Dsl/MossBindings.cs:22-33` |
| "explored-but-unseen compartments greyed, last-known-state" | `Explored` is a one-way boolean; no last-known-state layer | §13.11 |
| Per-tile gas at breach fronts as a visual/hazard wavefront | Not implemented; lumped rooms only, and see §13.1 for what "lumped + pressure-only flow" means | `AtmosphereSystem.cs` |

Agreements worth recording (the code *does* honour these): 101.3 kPa / 21 % O2 nominal;
500 ppm CO2 baseline; hypoxia < 16 kPa ppO2; 0.84 kg O2 in / 1.04 kg CO2 out per person per
day; 93 % reclaimer closure; scrubber 0.4 kW, grow bed 0.6 kW, fabricator 3 kW draws;
1 m × 1 m × 2.5 m tiles; per-compartment lumped atmosphere; brownouts shedding life support
last.

---

## 15. Where to change X

| I want to change… | Edit |
|---|---|
| tick rate | `sim/Sim.Core/Simulation.cs:14` (`TicksPerSecond`) — moves every pin |
| which systems run, and in what order | `sim/Sim.Core/SystemStack.cs:20-50` (**integrator lane only**) |
| how often a system runs | that system's `IntervalTicks`; if it is interval-paired with a `Dt` const, change both |
| air chemistry rates, vent/scrubber throughput, vent ceiling | `content/core/SimDefs/atmosphere.def` |
| what makes air lethal, need fill rates, mood weights | `content/core/SimDefs/needs.def` |
| when a crew member flees lethal air | `content/core/SimDefs/needs.def` (`flee_suffocation`; consumed by `Systems/SafetySystem.cs`) |
| walking speed / wander cadence | `content/core/SimDefs/citizen.def` (`ticks_per_tile`, `idle_ticks_between_wanders`) |
| **where** a citizen wanders to | `sim/Sim.Core/Path/PathService.cs:77-89` (`TryRandomWalkableTile`) — code, not a def |
| a machine's draw / generation / tier / heat / wear / thresholds | `content/core/SimDefs/machines.def` (one row per `DeviceKind`) |
| brownout shed order semantics | `sim/Sim.Core/Systems/PowerSystem.cs:138-154` + `PowerTier` (`Entities/Device.cs:36-42`) |
| radiator strength, room heat capacity, hull loss, door conduction | `content/core/SimDefs/thermal.def` (+ `radiator_reject_kw` in `machines.def`) |
| tank size, reclaimer rate, recovery efficiency | `content/core/SimDefs/water.def` |
| crop time, irrigation draw, condensate recapture | `content/core/SimDefs/hydro.def` |
| eat/drink portion sizes and the self-serve trigger | `content/core/SimDefs/sustenance.def` |
| crafting recipes | `content/core/SimDefs/recipes.def` (add a row keyed by `DeviceKind`) |
| wear acceleration, service time, jury-rig quality | `content/core/SimDefs/wear.def` |
| build costs and construct times | `content/core/SimDefs/build.def` |
| relationship accrual, tier thresholds, argument/bond rates | `content/core/SimDefs/social.def` |
| Director tension weights and the wear lever | `content/core/SimDefs/director.def` |
| fog reveal radius | `content/core/SimDefs/exploration.def` |
| delta-v, transit speed, telescope detection | `content/core/SimDefs/nav.def` |
| **job selection policy** (priorities, skills, distance metric) | `sim/Sim.Core/Jobs/JobSystem.cs:242-422` — code, no defs |
| dig work time | `sim/Sim.Core/Jobs/Sources/DigJobSource.cs:19` (`DigWorkTicks = 6000`; E0-2 L1 rebase) — code const, no def; `TODO(E-MINE/E3)` moves it to `mining.def` when E-MINE owns dig |
| unreachable-target backoff (per candidate, and per stockpile tile — E0-4 WP-7) | `sim/Sim.Core/Jobs/JobContext.cs:55` (`JobWork.UnreachableRetryTicks`), stamped by each source's `TryClaim` and by `sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:499` (`_tileRetryAt`) |
| what the LLM may propose | `sim/Sim.Core/Effects/CitizenEffects.cs` (the record set + `EffectKind`) — spine file |
| what the LLM may propose *right now* | `sim/Sim.Core/Effects/CapabilityComputer.cs:46-76` |
| the clamps on a proposed effect | `sim/Sim.Core/Effects/EffectValidator.cs:19-22` + each `Apply*` |
| memory capacity / decay / event importances | `sim/Sim.Core/Citizens/CitizenMemory.cs:29-30,241-246` (hardcoded consts, deliberately not defs) |
| which devices MOSS can address | `sim/Sim.Dsl/MossBindings.cs:14-44` |
| what MOSS can read off a device/room/ship | `sim/Sim.Dsl/DeviceAdapters.cs`, `sim/Sim.Dsl/ShipMetricsAdapter.cs:44-57` |
| MOSS step budgets | `sim/Sim.Dsl/Interpreter.cs:10-11` |
| shipped designer rules | `content/core/SimDefs/rules/*.moss` |
| the HUD metric definitions | `sim/Sim.Core/ShipMetrics.cs:21-91` |
| the save format | `sim/Sim.Core/Save/SaveWriter.cs` + `SaveReader.cs` (spine files; bump the chapter version and add the reader branch in the same commit) |
| the shipping slice's ship, crew, stock | `sim/Sim.Gen/AuthoredShips.cs:223-563` |
| the client's command surface | `hosts/web/GameSession.cs:797-820` (`WebCommand.Parse`) |
| what a crew member's task line says | `hosts/web/GameSession.cs:684` (`TaskLabel`) — **IN FLIGHT**, see §13.4 |
| what the build ghosts carry | `hosts/web/WireFormat.cs:293-330` (`Design` / `Designs`) — **IN FLIGHT**, see §13.4 |

<!-- IN FLIGHT: task labels / build-ghost wire fields — the two rows above are the edit
     points the lane is moving; line numbers are pre-change (0f88231). -->

### Adding a def field (the ritual, one commit)

1. Default in `SimDefs.CreateDefault` (`sim/Sim.Core/Defs/SimDefs.cs:373`).
2. Parser key in `sim/Sim.Core/Defs/DefsParser.cs`.
3. Fold into `SimDefs.ComputeChecksum` (`SimDefs.cs:582`).
4. Line in the shipped `.def` file, **verbatim equal to the compiled default** so the
   checksum is unmoved.
5. Equivalence coverage (see `content/core/SimDefs/README.def`).
6. Consume it via `sim.Defs.*` **inside `Tick`** — never cache the graph in a field, so
   parallel sims with different defs never cross-talk.

### Adding a hashed sim field (the ritual, one commit)

Field → `SaveWriter` (bump the chapter version) → `SaveReader` (version-branch) →
`Simulation.StateHash` fold → save round-trip test → run
`~/.dotnet/dotnet run --project hosts/scenario -- --days 3 --seed 42`, then update the pin
in `ci.sh:25` **and** `CLAUDE.md` **and** memory in that same commit.

---

*Verification note. The runtime figures come from two sources. (a)
`~/.dotnet/dotnet run --project hosts/tui -- --dump --ship slice --days 3 --every N
--metrics`. (b) A throwaway probe compiled against the sim sources **outside** the repo,
booting the same `SimHost.Build(SimHost.SliceSeed, null, <dataDir>, ShipChoice.Slice)` the
shipping hosts use. The probe was run both with compiled defaults and with the real
`content/core/SimDefs` — the latter reporting `defs 1cd88ff321d04a46 (17 files, 0
problems)` (16 files when this section was written; W0-5 added the empty
`production.def`, which folds nothing, so the checksum is unchanged), byte-identical to the
TUI dump header, and a 24-system stack reading
`EffectPump Atmosphere Power Nav Thermal Water Citizens Jobs Sustenance Crafting Wear
Maintenance Build Hydroponics Needs Social Exploration Goals Director History
DesignerRules Moss Memory Eulogy`, which is exactly §1's table plus the three host
wrappers. All three runs produce the same 3-day metrics —
`power=1.00 o2=0.98 co2=17644 water=0.50 food=1.00 heat=0.20 struct=0.80 morale=0.35`.*

*One caveat this note exists to record: the compiled-defaults run loads **no MOSS rules**,
so it reported zero alarms. The 2,579 `overheat_guard` firings in §13.2 come only from the
real-defs run. If you probe this sim, pass an explicit data directory — auto-discovery
walks up from the running binary and will not find the repo from a scratch directory.*

*No repo file was modified to obtain any of this.*

*Corrections pass, 2026-07-21. An independent verifier re-derived these claims from a clean
boot and found five that overstated the code. All five are fixed above, each re-measured
here before the edit: the mood **sawtooth** and its `−5` ceiling (§13.4/§13.7); **seven**
adapter-bearing MOSS device kinds, not six (§14, which contradicted §11); Amara's top-8 as
eight lines of the same *shape* rather than eight identical ones (§13.8 — two distinct texts
at day 1); CO2 transport as **throughput-limited, not zero** (§3/§13.1 — a `4.3e-4` kPa
standing Δp and ≈42 % of daily production scrubbed, so "they never mix again" was wrong);
and the fourth `IN FLIGHT` marker the intro promised (§13.4/§15). Six smaller precision
fixes came with them (§1 fork qualifier, §4.1 `WaterTank` row, §5.4 wander figures now given
as ranges because the draw is unseeded, §6.4 `StagedUnits`, §13.2 first-alarm day 1.21, §13.5
two more role readers). One reviewer figure was **not** reproduced and is not used: a
claimed "~20 % of production reaches the scrubbers" — the measured ship-wide balance over
day 1→2 is 78.72 of 188.70 mol, **≈42 %**.*
