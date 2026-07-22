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

`Simulation.StateHash()` (`Simulation.cs:232-324`) folds, in order: tick, RNG state (4
words), the whole world (`Floor`/`Wall`/`Flags`/`RoomId` arrays per deck,
`World/World.cs:65-76`), every citizen field, every item, every device, every room's
`TileCount`/`O2Moles`/`CO2Moles`/`N2Moles`/`TemperatureK`, room anchors,
`WastewaterLiters`, then **every `IStatefulSystem.StateChecksum()`** in stack order
(`Simulation.cs:319-321`).

`sim.Defs` is deliberately **not** hashed (`Simulation.cs:26`) — both determinism twins
share one instance; the defs identity rides the `DEFS` save chapter instead
(`Save/SaveWriter.cs:342-345`).

Not hashed: `Room.HullTiles` (pure function of the grid, `Rooms/RoomState.cs:26`),
`ZLevel.RegionId`, the job board (purely derived), `PowerSystem`/`WaterSystem`'s internal
network dictionaries, and the entire mind/persona/fact layer *unless* a `MemorySystem` is
registered (then its `'MEMS'` checksum joins — `Citizens/CitizenMemory.cs:222-231`).

Careful here: the **per-device** `NetworkId` (`Simulation.cs:290`), `FluidNetworkId`
(`:297`) and `Powered` (`:289`) *are* hashed and saved, even though they are derived —
deliberately, so a load hashes equal immediately while `PowerDirty = true` rebuilds them
(`Save/SaveWriter.cs:273-275`).

**Determinism pins** (move them only with the hash-move ritual, and update `ci.sh` +
`CLAUDE.md` in the same commit): 3-day seed-42 scenario hash `26907c23d7e48a5c`
(pinned at `ci.sh:25`); tick-3000 golden `401c9b96aff338a7`; slice tick-3000 golden
`d1710ab6a1fe50ce`.

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

**Water is never created** — only cycled, with a 7 % loss per pass through the reclaimer.
Greywater enters the pool from drinking (`Systems/SustenanceSystem.cs:188,229`) and from
plant transpiration (`Systems/HydroponicsSystem.cs:34`).

`WaterSystem.TryDrawWater` (`:159-184`) is **all-or-nothing** across a network's tanks: if
the network cannot cover the full amount, nothing is drawn.

Tunables (`water.def`): `tank_capacity_liters = 500`, `reclaimer_liters_per_second = 0.05`,
`reclaim_efficiency = 0.93`.

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

`IsIdleForWork` (`:63`) = `!Dead && !HoldPosition && JobKind == None && !HasPath`. This
one predicate gates every recruiter (`JobSystem`, `SustenanceSystem`, `CraftingSystem`,
`MaintenanceSystem`).

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
`PathService.TryRandomWalkableTile`.

`citizen.def`: `ticks_per_tile = 5` (2 tiles/s at 10 Hz), `idle_ticks_between_wanders = 30`
(3 s).

**`TryRandomWalkableTile` (`Path/PathService.cs:77-89`) samples up to 10 uniformly random
tiles from the ENTIRE world — all decks — and returns the first walkable one.** There is no
locality, no room preference, no deck preference.

Measured on the shipping slice (8,000 draws from the eight crew start tiles, using the real
`TryRandomWalkableTile` + `FindPath` API). **The draw RNG is not seed-pinned, so these are
estimates, not goldens** — three independent runs are quoted as ranges:

- ~6,400 of 8,000 draws produced a path (6,368 / 6,409 across runs); the rest were rejected
  — no walkable sample in 10 tries, or unreachable.
- **mean path length ≈ 21.4 tiles (21.33–21.49), max 48–49** ⇒ at `ticks_per_tile = 5`, a
  mean wander leg is ~10.7 s of continuous walking.
- **≈ 46 % of random picks landed on a different deck** than the walker (3,675 / 3,709 /
  3,732 of 8,000 across the three runs).

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
   `UnreachableRetryTicks = 50` ticks (5 s) for that target (`:46,370,386,402,414`), then
   retry the next-nearest. The loop always terminates because every failure stamps.
5. If nothing is left, `citizen.ClearPath()` and return (`:418-419`).

### 6.3 `JobKind` lifecycles (`Entities/Citizen.cs:85-97`)

| kind | owner | lifecycle |
|------|-------|-----------|
| `Dig` (1) | JobSystem | path adjacent → count down `JobWorkTicks` from `DigWorkTicks = 60` (6 s, `:28`) → `SetWall(0)`, `SetFloor(Floor)`, clear `Designated`, `Rooms.MarkDirty()`, **drop 1 `Regolith` on the tile**, publish `TileChangedEvent` (`ProgressDig`, `:491-523`) |
| `HaulPickup` (2) | JobSystem | walk to the reserved item; on arrival pick a reachable free stockpile tile **before** touching carry state, then graduate the reservation into a carry and become `HaulDeliver` (`:525-565`) |
| `HaulDeliver` (3) | JobSystem | carried item's `Pos` is glued to the carrier every tick; on arrival (or path loss) the stack is set down where the citizen stands (`:567-589`) |
| `Eat` (4) | **SustenanceSystem** | §4.5 |
| `Drink` (5) | **SustenanceSystem** | §4.5 |
| `Craft` (6) | **CraftingSystem** | §6.4 |
| `Maintain` (7) | **MaintenanceSystem** | §7 |
| `HaulToBuild` (8) | JobSystem | two hops on one `JobTarget` (always the SITE): phase A empty-handed to the reserved material, phase B carrying it to the site; deposits what the site can take, surplus drops as a loose stack (`:600-683`) |
| `Build` (9) | JobSystem | mirrors Dig; on the last work tick calls `BuildSystem.Complete` (`:691-715`) |

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
| `SalvageRecycler` | 1 `Regolith` → 2 `Scrap`, 20 s |
| `Fabricator` | 2 `Scrap` → 1 `Parts`, 30 s |
| `MachineShop` | 2 `Parts` → 1 `ControllerModule`, 40 s |

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
| `Wall` | `wall_material = 2` | `wall_construct_ticks = 60` (6 s) |
| `Door` | `door_material = 1` | `door_construct_ticks = 40` (4 s) |

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
`IntervalTicks (10)` per pass from `maintenance_work_seconds × 10 = 200` ticks
(`:284,319`).

**The completion mode is decided by what is in the servicer's hands** (`:248-259`):

- **Parts in hand** → consume one unit, `Condition = 1` (full overhaul).
- **Empty hands** → `Condition = jury_rig_condition = 0.6` (patched, not fixed). Only
  reachable when no `Parts` existed anywhere on the ship at decision time (`:290-323`).

Tunables (`wear.def`): `hot_threshold_c = 35`, `wear_per_degree_c = 0.05`,
`max_heat_multiplier = 3`, `maintenance_work_seconds = 20`, `jury_rig_condition = 0.6`.

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
  `JobWorkTicks = JobSystem.DigWorkTicks (60)` and set `JobsDirty`.
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
formation"). **Promise *breaking* is not implemented** — §13.10.

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
| `ScriptRuntime` | — | 1 | `Sim.Dsl/ScriptRuntime.cs:209` |
| `DesignerRuleSystem` | — | 1 | `Sim.Dsl/DesignerRuleSystem.cs:207` |

**Strings are hash-exempt by convention** for `HIST`, `SOCL` and `MEMS`: the checksum
folds tick + kind + subject ids (`HistorySystem.cs:200-212`), edge key + opinion + tier
(`SocialSystem.cs:289-310`) and counts/ticks/importance bits — never the free text. So
rewording an entry never perturbs determinism, but **adding** one does.

**The ritual**: every saved field is also hashed (`Simulation.cs:241-243`). Adding a field
means default + parser key + checksum fold + save round-trip + hash-move, in the **same
commit**, and updating the pin in `ci.sh` + `CLAUDE.md`.

---

## 13. ⚠️ Known gaps — wired but not connected

*Mechanics that look implemented but do not close the loop. Every item below was verified
in this session by reading the code and, where a number is quoted, by a headless probe
against the shipping slice (`--ship slice`, `SimHost.SliceSeed`). **This section is the
institutional memory that prevents the next playtest surprise.***

### 13.1 Nothing converts an atmosphere reading into a job — and scrubbers cannot help the room the crew is in

<!-- IN FLIGHT: CO2 → maintenance dispatch and the AgreeTask whitelist —
     MachineWearSystem.cs, EffectValidator.cs, CapabilityComputer.cs. -->
> **⚠ IN FLIGHT** — a lane is adding CO2→maintenance dispatch and revisiting the
> `AgreeTask` whitelist. This describes `0f88231`.

`RoomState.CO2Ppm` has exactly six consumers repo-wide (verified by grep):
`NeedsSystem.cs:52` (health damage at 40,000 ppm), `ShipMetrics.cs:67` (HUD),
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
- Cause: scrubbers are **room-local**, and §3's door flow is **pressure-driven bulk flow
  with no diffusion** (`AtmosphereSystem.cs:113`). After 3 sim-days the scrubber rooms sit
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

### 13.6 On the shipping slice, three whole `JobKind`s are unreachable — including `AgreeTask`

`TileFlags.Designated` is set by exactly one writer in the entire repo:
`DesignateDigCommand` (`Commands/Commands.cs:112`). That command is issued from exactly one
place: the **TUI** (`hosts/tui/GameLoop.cs:304`). The web host's command parser
(`hosts/web/GameSession.cs:797-820`) exposes `cursor/click/move/deck/lens/speed/pause/
build(wall|door|cancel)/talk/say/bye/chron/bio/moss` — **no dig verb and no stockpile
verb.**

Measured on the slice at boot and throughout a 1-day run: **48 debris tiles, 0 designated,
0 stockpile tiles.** Consequences:

- `JobKind.Dig` can never be assigned from the shipping client.
- `JobKind.HaulPickup`/`HaulDeliver` can never be assigned either — `Rescan` builds haul
  candidates only when a free stockpile tile exists (`JobSystem.cs:153-176`), and there are
  none.
- **`AgreeTask` is dead code**: `CapabilityComputer.FillDigTargets` needs a designated
  debris tile (`:97-98`), so the manifest never includes it. Measured manifest for a slice
  crew member: `legal = SetDisposition, SetEmotionalState, RevealInfo, FollowPlayer,
  EndConversation`, `digTargets = 0`. The single richest LLM verb — the one that lets a
  conversation change the world — cannot fire in the shipped configuration.
- The `ClearAllDebris` goal on the slice (`AuthoredShips.cs:195`, *"Clear the aft
  debris"*) is therefore uncompletable from the web client.

Measured job occupancy over 3 sim-days, all 8 crew: `None 99.92 %`, `Maintain 0.03 %`,
`Drink 0.02 %`, `Eat 0.01 %`, `Craft 0.01 %`, everything else **0.00 %**.

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

A direct consequence of §13.7 and §13.10, and it lands squarely on the "talking ship"
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

### 13.10 Smaller dead wires

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

### 13.11 Non-gaps worth not re-investigating

These *look* suspicious and are actually fine:

- `MachineWearSystem` skipping unpowered machines is deliberate (idle machines don't wear).
- `RelationType` starting at `None` for seeded edges at boot is correct — `Classify` runs
  on the first social pass.
- `DirectorSystem` shipping with `IntervalTicks = 1` but a 100-tick heavy pass is
  deliberate: the event bus is double-buffered and a coarse sampler would miss alarms.
- `EffectPump` and `MemorySystem` not being in the scenario stack is why the pure-sim
  determinism pin is stable.

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
| "explored-but-unseen compartments greyed, last-known-state" | `Explored` is a one-way boolean; no last-known-state layer | §13.10 |
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
| dig work time | `sim/Sim.Core/Jobs/JobSystem.cs:28` (`DigWorkTicks`) — code, no def |
| unreachable-target backoff | `sim/Sim.Core/Jobs/JobSystem.cs:46` (`UnreachableRetryTicks`) |
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
`content/core/SimDefs` — the latter reporting `defs 1cd88ff321d04a46 (16 files, 0
problems)`, byte-identical to the TUI dump header, and a 24-system stack reading
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
