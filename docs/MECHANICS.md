# PERILUNE — Mechanics, as implemented

*Originally written 2026-07-21 against commit `0f88231`, and **amended continuously since** — §13
carries entries dated 2026-07-28. **Trust the PER-SECTION dates, not this line**; a blind-read audit
flagged that the 07-21 header invites a reader to discount the whole file as stale. **This document describes what the code
does, not what the design wants.** Every number below was read out of a source file or a
`.def` file in one sitting and is cited `file:line` or `def-file:key`. Where
`docs/legacy/GDD.md` or `docs/legacy/TDD.md` disagree with the code, the code is truth —
those disagreements are listed in §14. If something could not be verified it says
"unverified" and why.*

**Companion docs:** `ARCHITECTURE.md` (module structure) · `VISION.md` (intent) ·
`PLAN.md` (phasing) · `HANDOVER.md` (state). This file is the missing middle: *what
actually happens, and where do I change it*. **§13 "Known gaps" is the most valuable
section — read it before you conclude a mechanic works.**

> **✅ NOTHING IN THIS FILE IS IN FLIGHT — reconciled 2026-07-29 (M1-L-b).** This banner used to
> warn that four packages were being implemented in parallel with the writing and would change
> behaviour under it. That warning outlived them: **three landed and one never shipped its
> change**, and the four `IN FLIGHT` notes had sat for eight days telling readers to discount
> sections that were current. Each note is now replaced by a dated verdict, and the marker to
> `grep` is `RECONCILED 2026-07-29`:
>
> | lane | §§ | verdict, re-measured in this tree |
> |---|---|---|
> | movement tuning | §5.4 | **LANDED** — `citizen.def` `ticks_per_tile = 10` (E0-2 L1 retune, was 5), `PathService.TryRandomWalkableTileNear` (E0-1) is the wander. §5.4's prose already describes the post-change code. |
> | slice build/work economy | §6.5 | **LANDED** (`AuthoredShips`, `CraftingSystem`, `JobSystem`). ⚠️ §6.5's `file:line` citations were written against `0f88231` and this pass did NOT re-verify them line by line — re-derive before quoting one. |
> | CO2→maintenance dispatch + `AgreeTask` whitelist | §13.1 | **NEVER SHIPPED ITS CHANGE.** Re-measured: nothing in `Systems/MachineWearSystem.cs` or `Jobs/` reads `CO2Ppm` at all, and `AgreeTask` is unchanged. §13.1's first half — *nothing converts an atmosphere reading into a job* — is therefore still a LIVE gap, exactly as its own body says. The CO2-**transport** half was fixed separately, by B-3. |
> | task labels + build-ghost wire | §13.4, §15 | **LANDED** — `TaskLabel` names the object AND, since M2-6, the priority that chose it ("Servicing scrubber_ls — Repair is priority 1", "Stripping the wall at 12,7 — Deconstruct is priority 4", `GameSession.cs:2991-3075`) and `WireFormat.Design` carries `Delivered`/`Required` as tuple elements 5–6 with `Material` appended as 7 (`WireFormat.cs:307-315`). |
>
> **Trust the PER-SECTION dates.** §13 carries entries dated 2026-07-29.

---

## 1. The tick model & determinism contract

**10 Hz fixed tick.** `Simulation.TicksPerSecond = 10`, `TickSeconds = 1/10`
(`sim/Sim.Core/Simulation.cs:14-15`). One sim-day = `10 × 60 × 60 × 24 = 864,000` ticks
(`sim/Sim.Core/Systems/HistorySystem.cs:71`, `SimClockUtil.TicksPerDay`).

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
| 19 | `HistorySystem` | 1 | 10 Hz | `Systems/HistorySystem.cs:91` |
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
  `anchor(z = 0, Type = Corridor)` both packed to `0x1000000000000000`, and
  `anchor(z = -1, Type = None)` corrupted the `Type` bits outright.

  ⚠️ **THE 17TH ROOM TYPE ARRIVED AND THE PREDICTED ALIAS WENT LIVE ON THE SHIPPING SHIP.**
  `Type` had exactly 4 usable bits before running off the top of the word, `RoomType` declared
  16 members which filled them exactly, and this paragraph said in as many words that a 17th
  would fold onto `None`. The wreck start appended `RoomType.Cryo = 16`, `(ulong)16 << 60 == 0`,
  and a **CRYO BAY hashed identically to an untyped room** — measured on `--ship wreck`, Cryo
  and None both `fdcb64eb5b094f75`, Medbay `b5e6a0f45102c979`. **A predicted alias is not a
  guarded one:** nothing in `StateHashHonestyTests` drove `RoomAnchor.Type` at all, so the
  prediction sat there being right while the fold went wrong underneath it.

  **Fixed** (wreck lane, 2026-07-28): `Type` folds as its **own word**, `RoomType : byte`
  cannot alias in 64 bits at any future member count, and the Z-overlap half of the old
  problem is retired with it — nothing shares a word with anything in the anchor fold any
  more. It moved three of the five pins. `RoomType` now declares **17** members. Guarded by
  `StateHashHonestyTests`' `RoomAnchor.Type` row (which mutates to the enum's own *last*
  member, read off the enum, so an 18th inherits the guard) and by
  `Aliased_RoomTypeAboveFifteen_DoesNotFoldOntoNone`, which builds the exact collision pair
  with a Medbay non-vacuity control.

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
`CLAUDE.md` in the same commit): 3-day seed-42 scenario hash `7bdd0d6f7756dfdc`
(pinned in `ci.sh`; this line still read M3-7's superseded `3d23665a724e853d` until
2026-08-02 — `CLAUDE.md` is the authority, re-measure before quoting either);
tick-3000 golden `cb09b584a5f15e52`; slice tick-3000 golden `43a1a5c25713faec`.

⚠️ **NO PIN COVERS THE SHIP A PLAYER BOOTS, AND THE D1/D6 PACKAGE MEASURED IT.** P1 is
`hosts/scenario`'s hand-built `BuildScenario`, P2 is `--ship perilune`, P3 is `--ship slice`;
`--ship wreck` — `./play.sh`'s default — is behind none of them. That package changed what every
brownout, repair, thaw and commission writes to the hashed history ring and **all five pins held**,
because the P1 fixture publishes ZERO brownout edges in three days (its ring is 200/200 `Bond`),
authors ZERO cryo pods, completes ZERO repairs and issues ZERO commissions, and the two tick-3000
fixtures reach tick 3000 before the first brownout edge (wreck 128 361, slice 191 331). On the
wreck the identical code moves the hash hard: at tick 200 000, `291fedc58c4720ed` pre-fix →
`79c6641856fb779f` shipped. **A hold measured on a fixture that never reaches the code is
VACUOUS** — M3-7's lesson in a third costume, and this time the blind spot hid a real
save/reload determinism REGRESSION that independent review found by hand (§13.43.2).
See §13.37 and §13.8.1.

Most recent mover: **M3-7** (PIN M3-b, 2026-08-02) — `Citizen.Skill`, M2-1's
last reserved byte, WIDENED to the per-work-type `SkillsRaw` array of six (CITZ v8→v9, OD-M item
8A), so the citizen fold folds six bytes where it folded one. All three moved together and the move
is **FOLD-ONLY, measured**: with the widened array present, all six consumers live and the fold
reverted to `Combine(h, (ulong)c.SkillsRaw[0])`, P1 read `13674ebc4f8a14a9` again and both goldens
were green against their OLD values; the scenario's day-3 line is byte-identical either way.
⚠️ **AND NO PIN SEES THE RATE TERM — the thing the package is for.** Forcing every crew member to
skill 20 (a 2.24×–3.00× change) leaves all three pinned runs bit-identical with the rate seam live
and stubbed out, because OD-H boots every work type off and no pinned run enqueues a command, so no
pinned fixture does any work at all. The full record is §13.37. Before that: **M3-2** (PIN M3-a,
2026-07-31) — `CryoSystem`
joined the stack as an `IStatefulSystem`, so its `'CRYO'` `StateChecksum` seed folds into
`Simulation.StateHash` on every ship (`Simulation.cs:605-608` folds a system seed ONLY
through that interface). All three moved together and the move is **FOLD-ONLY, measured**:
with the same system registered and ticking but the interface dropped, all three read their
old values (`81733e27709f36e4` / `482fd40c070b54e0` / `94c29d5f6408d91c`). The full record
is §13.29. **P4/P5 most recently moved by M3-10** (PIN M3-d, 2026-08-01): `DeviceKind.Heater = 28`
grows `Machines` AND `Recipes`, and the package appends two def scalars (`heater_output_kw`,
`thermal.heater_ceiling_k`) — P4 `0c5ddbc07e41f07d`→`77a7a8a9e967eab4`, P5
`09900b9a44119272`→`edf1577c32f14e55`, both measured twice through two loaders. **P1/P2/P3 held**
on a census: no pinned ship authors a heater (§13.36). Before that: **M2-2** (PIN M2-e, 2026-07-30) — the work-type veto reads the grid
M2-1 stored, a behaviour change on every ship with working crew (scenario
`c1bac287`→`81733e27`, slice `0dcbff3e`→`94c29d5f`; the perilune golden held — its two crew
are `HoldPosition` and take no work). Defs checksum `77a7a8a9e967eab4` since M3-10 (it read
`0c5ddbc07e41f07d` from the wreck start through M3-2, which held it — no def field, the cryo cycle
rate being a named constant) — (this is `SimDefs.Default.Checksum`, the
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

`Rooms.MarkDirty()` has exactly **six** call sites repo-wide (**re-counted 2026-07-29** by
M1-L-b, which deleted a command out of this file and so had to re-derive every line number
here; the count is unchanged and two citations had drifted): `AddDevice` / `RemoveDevice`
(`Simulation.cs:116,132`), `SetTileCommand` (`Commands/Commands.cs:671`), a completed dig
(`Jobs/Sources/DigJobSource.cs:166`), a completed wall build (`Systems/BuildSystem.cs:213`)
and a completed strip (`Systems/DeconstructSystem.cs:557`). **Nothing else re-floods
rooms** — in particular, no runtime breach mechanic exists, and (since W4b) **no command
re-floods rooms merely because a player named one**; since M1-L-b there is no such command
at all.

**Room anchors** are saved sim state (`RoomState.cs:72-85`, `ROOM` chapter v2/v3) — a name
plus a probe tile, plus a `RoomType`. They are the MOSS room namespace (`hab1.o2`) and the
`GoalSystem` anchor lookup.

### A room is not allocated — it is DERIVED (M1-L / M1-L-b, OD-K, 2026-07-29)

**There is no allocate-a-room verb and no allocate-a-room command. A compartment IS a room
because its WALLS make it one** — `RoomState.Recompute`'s flood fill above is the whole
mechanism, and `SlotGridPlanner.Carve` gives every slot on every shipped ship interior floor, a
perimeter and a door, so the honest answer was always "yes, this is a room". Owner ruling,
verbatim and binding: *"we do not need 'add room' that makes no sense on a ship where rooms are
already existing."* RimWorld analogue, cited not remembered —
`docs/design/rimworld-reference.md` §7 item 10: *"RimWorld computes rooms from walls for stats …
the player never names or allocates one."*

**What is left of the type.** `RoomAnchor.Type` is still saved, hashed and read (`RoomDresser`
furnishes by type; `GoalSystem` and MOSS resolve rooms by anchor NAME; the `decks` channel sends
the type so the Overview can print a label instead of an internal `hall_dZ_sN` id). **It is
authoring-only**: as of M1-L-b no player-facing route writes it, so an untyped compartment stays
untyped for the life of a run. `RoomType` ids therefore remain append-only for the save's sake
(`Rooms/RoomType.cs`), not for a picker's.

> **⛔ RETRACTED IN TWO STAGES, and both are worth knowing because each was a live mechanic in a
> shipped build.**
>
> **W4b (2026-07-28) took the AIR away.** `AddRoomCommand` used to *"force every bordering door
> open AND unlocked, and `RoomState.Pressurize` it — 101.3 kPa of 21 % O₂ conjured from nothing"*.
> That was the game's largest matter faucet and it was invisible. Deleting it is what turned the
> pressure frontier from a formality into the core loop — **naming is free, air is earned** — and
> it also fixed half of the owner's *"the doors vanish when I allocate a room"* report.
> `RoomState.Pressurize` (`Rooms/RoomState.cs:135`) survives with **two** non-test callers —
> `sim/Sim.Gen/ShipPlanBuilder.cs:149` (ship generation, applying `ShipPlan.PressurizedAnchors`)
> and `hosts/scenario/Program.cs:1125` (the scenario host's fixture builder, which seeds the world
> the P1 pin runs on) — **both setup-time, neither reachable from a running game.** ⚠️ An earlier
> version of this sentence said "exactly ONE live caller" and named only the first: the census
> behind it was grepped over `sim/` alone, so `hosts/` was outside the instrument and the second
> caller could not appear. That is the **ninth trap shape** — a narrowed instrument goes blind —
> and it contradicted §3's own correct list further down this same file.
>
> **M1-L / M1-L-b (2026-07-29) took the VERB and then the COMMAND away.** M1-L deleted the ＋ADD
> ROOM picker, the client sender, the `"addroom"` parse case, the dispatch route and
> `GameSession.HandleAddRoom`/`ParseRoomType`; M1-L-b deleted the sim's `AddRoomCommand` and the
> `CmdKind.AddRoom` enum member (which renumbered `Dig`…`WorkPriority` down by one — safe, because
> nothing anywhere converts a `CmdKind` to a number; the wire carries verb strings). **Any doc,
> plan or comment that describes allocating, commissioning or re-typing a room is describing a sim
> that no longer exists.** Its rejection predicate — *refuse when any anchor resolving to this same
> room already carries a non-`None` type* — is gone with it. It is recorded in W4b's own plan
> (`docs/design/perilune-wreck-start.plan.md`) and in this paragraph, and **it is NOT a rule the
> current sim enforces**, because there is nothing left to refuse.

⛔ **Do NOT close `W4b-DEAD-DECK` (§13.23a) by re-pressurising on room creation.** That is the wand
W4b deleted on a binding owner decision, and it has already tried to come back once.

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

Initial fill (`RoomState.Pressurize`, `:135-141`) is 101.3 kPa of 21 % O2 / 79 % N2 /
0.05 % CO2 — i.e. **500 ppm CO2 baseline**. The 0.21/0.79/0.0005 mix and the 0.2 s `Dt`
are structural, not def-tunable (`atmosphere.def` header).

**`Pressurize` is a SETUP-TIME utility and nothing in the running game calls it** (checked
repo-wide, 2026-07-28). Its callers are ship generation (`ShipPlanBuilder.cs:149`, applying
`ShipPlan.PressurizedAnchors`), the scenario host's dump path and tests. **No `ISimCommand`
calls it** — W4b removed the last one (§2 "Allocating a room"). At runtime, air enters a
compartment by exactly two routes: an `AirVent` injecting into it, or bulk/diffusive flow
across an **open door** from a room that already has some.

### One pass, in order (`AtmosphereSystem.Tick`, `:23-78`)

**1. Devices** (device store order):

| device | condition to act | effect per pass |
|--------|------------------|-----------------|
| `Door` | `IsOpen` | bulk flow across the edge (below) |
| `AirVent` | `IsOpen && Powered && IsOperational` **and** room ≠ vacuum **and** `room.PressureKPa < nominal_pressure_kpa` | `+30 × EffectiveRate × 0.2` mol, split 21 % O2 / 79 % N2 (`:41-50`) |
| `Scrubber` | `Powered && IsOperational` and room ≠ vacuum | `CO2Moles = max(0, CO2Moles − 0.001 × EffectiveRate × 0.2)` (`:53-59`) |

`EffectiveRate = Rate × (0.5 + 0.5 × Condition)` (`Entities/Device.cs:120`) — a worn machine
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

### ⛔ Gas is SAME-DECK ONLY — there is no vertical transport term anywhere

**Every gas path in the sim is planar.** This is not a tuning weakness, it is the absence of a
term, and it was only noticed when a ship shipped with its vents on one deck and its
compartments on another (W4b, 2026-07-28). All four legs verified in source:

| path | what it probes | citation |
|---|---|---|
| bulk door flow | `(X±1,Y,Z)` / `(X,Y±1,Z)`, on `world.Levels[doorPos.Z]` | `AtmosphereSystem.cs:211,219-222` |
| per-species diffusion (B-3) | `Int3.Neighbor4`, on `world.Levels[doorPos.Z]` | `AtmosphereSystem.cs:337,343`; `World/Int3.cs:23-29` |
| the room flood itself | `world.Levels[start.Z]`, planar 4-neighbours only ⇒ **a room can never span decks** | `RoomState.cs:275-293` |
| gas remap on recompute | called once per `z`, with `z` as a parameter | `RoomState.cs:198,322` |

`Ladder` z-links exist for **pathing** (`Path/PathService.cs`, §5.5) and for nothing else — a
ladder trunk is not a gas edge, and neither is an open hatch, because there is no such device.
⇒ **A compartment with no vent on its own deck and no open-door chain to a pressurised room on
its own deck cannot be pressurised at all.** Measured consequence on the shipped wreck: §13.23.

### How fast a compartment fills

Two rates, both derivable from `atmosphere.def` and neither of them fast:

- **A vent is a constant source.** `vent_mol_per_second = 30`, injected as
  `30 × EffectiveRate × Dt` per pass at 5 Hz (`AtmosphereSystem.cs:123,142`) — so **30 mol/s**
  at `Condition = 1`, and `EffectiveRate = Rate × (0.5 + 0.5 × Condition)`
  (`Entities/Device.cs:120`; `Rate` defaults to 1, `:79`) drops that to **16.5 mol/s** (55 %) at
  the `AirVent` fail floor of `Condition = 0.10`, below which it stops entirely. A 60-tile hall — the standard `SlotGridPlanner` interior, 10 × 6 — is 150 m³
  (`Room.VolumeM3 = TileCount × 2.5`), which at 293 K holds
  `101 × 1000 × 150 / (8.314 × 293) ≈ 6 219` mol at 101 kPa ⇒ **~207 s (~2 070 ticks) from
  vacuum**, after which the vent gates off at `nominal_pressure_kpa`. Confirmed by driving
  `--ship wreck` (n = 1): `vent_ls` repaired, powered and opened with its compartment's door
  **shut** reaches 101 kPa at tick **2 072** = 207.2 s.
- **A door is an exponential.** `dn = flow_coefficient × |Δp| × Dt` with
  `flow_coefficient = 0.5 mol/(kPa·s)`, i.e. **0.5·Δp mol/s** through one open door, so Δp
  decays exponentially and the last few kPa take as long as the first fifty. For a 150 m³ room
  filling from a large reservoir through one open door the time constant is
  `V / (0.5 × R × 293 / 1000) ≈ 123 s`, so **half-full in ~85 s and 90 % full in ~4½ min** —
  minutes, not seconds, and slower still when the source room is small enough to draw down.
  Order-of-magnitude confirmed by driving `--ship wreck` (n = 1): a deck-0 hall opened onto the
  pressurised spine is substantially full at **~2 990 ticks (~5 sim-minutes)**.

⇒ **Opening a door onto vacuum is the same arithmetic in reverse** (`atmosphere.def:15` says
"hab drains in ~40 s"), and room 0 is an infinite sink, so the outward case never slows down.

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
supply   = Σ GenerationKW × EffectiveRate  +  Σ Battery.StoredKWh × 3600   // :235, :246-247
```
**Generation is condition-scaled (M2-12, `PowerSystem.cs:235`)** by the same
`Device.EffectiveRate = Rate × (0.5 + 0.5 × Condition)` (`Entities/Device.cs:120`) every
consumer uses — a generator's output *is* power, so the ledger is the only place its wear
can be expressed. There is deliberately **no `IsOperational` gate**: the floor is a half
share, not zero, so repair is a gradient rather than a cliff. **Demand stays flat** — a
worn scrubber pays its full `draw` for reduced output. Measured on `--ship wreck`: three
wings at Condition 0.31/0.18/0.06 supply **10.65 kW**, one Parts overhaul takes it to
**13.47**, and the 1.00/0.90/0.90 state (one Parts + two Seals) is **17.40**, against a flat
14.80 kW of demand (14.30 until M3-11 put `vent_d1` on the trunk — an open `AirVent` is 0.5 kW
of LifeSupport, and it pays it while broken because only generation rides `EffectiveRate`).
Read at the seam via `PowerSystem.LastGenerationKW` / `LastDemandKW`, which exist only so
tests can pin the ledger without re-deriving it.
⚠️ **17.40 WAS CALLED "THE REACHABLE CEILING" UNTIL D7 (2026-08-03) AND IS NOT ONE ANY MORE.**
That reading rested on the wreck carrying exactly ONE Parts, so only one wing could reach 1.00
out of the hold. D7's `cabin stores` author seven more (`AuthoredShips.PeriluneWreck`), the ship
boots with EIGHT, and three Parts overhauls put all three wings at 1.00 ⇒ **18.00 kW is reachable
on boot stock**. It is not free: those are the same units furniture is bought with
(`build.device_place_cost` = 3), so the ceiling and the first bunk compete for one pile. The three
figures above are unchanged and still correct — they are points on the affine map
(`EffectiveRate = Rate × (0.5 + 0.5 × Condition)`), which is what `GenerationWearTests` pins with
hand-set conditions; only the word "ceiling" was retired.
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
  all reached thirst simultaneously and asphyxiated in one small room). **The grid ship — the
  ONE standard play ship — sets it true for all eight too as of 2026-07-25**, for a different
  reason: a ship whose idle crew (≈67 % of a sim-day) stand on their boot tiles reads as dead.
  That flip was only safe once the wander sampler became deck-confined; see §5.4.
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

<!-- RECONCILED 2026-07-29 (M1-L-b): the movement-tuning lane LANDED; this section is current. -->
> **✅ RECONCILED 2026-07-29 — the movement-tuning lane LANDED and §5.4 describes the tuned
> code.** Re-measured in this tree: `citizen.def` `ticks_per_tile = 10` (E0-2 L1 retune, was 5),
> `idle_ticks_between_wanders = 30`, and the wander is `PathService.TryRandomWalkableTileNear`
> (E0-1, `:172`) rather than the old world-wide draw.

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
Chebyshev box of half-width `wander_radius_tiles` around the citizen **in X and Y only**
(clamped to the world) and returns the first walkable one (E0-1).** It bounds wandering
LOCALLY so crew disperse near their work instead of roaming ship-wide, WITHOUT reducing wander
cadence — the slice depends on wandering to desynchronise needs (§5.1 `AutoWander` note), so
E0-1 bounds reach, not frequency. The default 8 is UNTUNED, pending A1 measurement. The
un-bounded `TryRandomWalkableTile` remains in `PathService` (no longer called by the sim).

**⚠️ Z IS NOT IN THE BOX — the draw is pinned to `origin.Z` (the deck-confined wander,
2026-07-25).** An idle wander never changes deck. This is a LITERAL, not a def field: it is a
rule (idle crew do not climb ladders for nothing), not a tunable, so it adds no hashed state
and moves neither defs checksum. **Consequence, and it invalidates a sentence that stood here
until today: no radius reproduces the pre-E0-1 global wander any more** — a radius ≥ the ship
extent now saturates the box to the whole DECK and no further. Why it was needed: the default
`wander_radius_tiles` (8) is ≥ the grid ship's depth (`GridDepth = 8`), so the old 3-D box
saturated all eight decks and ONE idle draw could put a crew member on any of the six that boot
airless-but-walkable off the ladder trunk. Measured on `--ship grid`, one sim-day, with
`AutoWander = true`: the old box sent **4.46 % of all crew-ticks to `JobKind.Flee`** (8/8 alive
— it was waste, not lethality); the deck-pinned draw sends **0.00 %**, at identical productive
work (24.990 %). It moved the slice tick-3000 golden and nothing else. Driven pins in
`tests/Perilune.Tests/DeckConfinedWanderTests.cs`.

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

> ⚠️ **PARTIALLY SUPERSEDED 2026-07-30 (M2-2 + M2-5, verified in `JobSystem.cs` /
> `WorkArbiter.cs`).** There IS a priority table now: the per-citizen work grid (M2-1,
> boots OFF everywhere) is enforced at five claim gates (M2-2), and `TryAssign` iterates
> priority bands 1→4 OUTSIDE the distance argmin below, deferring to a push recruiter
> (Crafting/Maintenance) holding a better band; the push recruiters ask
> `WorkArbiter.HasBetterOfferThan` before claiming (M2-5). Equal band ties on
> `WorkPriority.NaturalPriority` (OD-J) — except pull-vs-pull at the same band, which
> still separates by distance (KNOWN LIMIT, filed). Within a band the text below is
> still exact. One behavioural note: an empty pass that defers to a push offer returns
> WITHOUT `ClearPath()`, where the old code always cleared — safe because a failed
> `FindPath` leaves no residue. The "no skills" clause survives until M3-7.
>
> ⚠️ **AND SINCE M2-8 (2026-07-30) THE DISPATCHER IS NO LONGER ONLY A GIVER OF WORK.** `Tick`'s
> BUSY branch can now TAKE a job back when a strictly better BAND is on offer — see **§6.2b**,
> which is a different question from anything below and is asked outside `TryAssign` entirely.

This is the whole labour-allocation policy as ORIGINALLY SHIPPED. For an idle citizen:

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

### 6.2b PRE-EMPTION — a better BAND takes a busy pawn back (M2-8, 2026-07-30)

Until M2-8 nothing in the sim could take a job away except the flee path. `IsRecruitableForWork`
requires `JobKind == None`, so every recruiter and the dispatcher alike could only hand work to
somebody who had none.

**The seam is `JobSystem.Tick`'s BUSY branch** (`Jobs/JobSystem.cs:232` → `TryPreempt`,
`:287-323`), and it is there rather than in `TryAssign` because **that loop is the only place that
sees every busy pawn**: `JobKind.Craft` and `JobKind.Maintain` have no `IJobSource` at all, so
their pawns reach the loop and fall out at `owner == null`. One check therefore reaches a pawn
inside a maintenance chain exactly as it reaches a hauler; `TryAssign` is only ever entered by
pawns with no job to lose. Order per tick: pre-empt → `continue` (she is NOT advanced this tick) →
she is offered work again on the NEXT tick's pass. **One tick**, which is what the M2-0 spike
measured (order at t=231 → `Deconstruct` at t=232).

The predicate, in order (`JobSystem.cs:290-317`):

1. `WorkTypeMap.TryOf(citizen.JobKind, …)` must succeed. **This is the whole survival guard** —
   `Flee`, `Eat` and `Drink` carry no `WorkType` and are refused here. There is deliberately no
   second check listing them (two guards for one rule and neither can be shown to bite);
   `PreemptionTests.SurvivalKinds_CarryNoWorkType_WhichIsTheWholeSurvivalGuard` pins the premise.
2. `Citizen.IsRecruitableIgnoringJob` (`Entities/Citizen.cs:439`, NEW in M2-8) — `IsRecruitableForWork`
   with the "carries no job" clause factored out. Dead, `HoldPosition`, or mid-ordered-walk still
   refuse: taking the job would strand her, because the same facts stop anything from giving her
   another. `IsRecruitableForWork` is expressed as `IsRecruitableIgnoringJob && JobKind == None`.
   ⚠️ **M2-19 added `&& !HeldByOrder` to this property** — a direct order refuses pre-emption
   outright, and this is the step that does it. See §6.2c.
3. Her band must be neither `Off` (she is finishing work the player has since switched off — M2-2's
   decided behaviour) nor `Highest` (nothing can outrank band 1).
4. `WorkArbiter.HasOfferAboveBand` (`Jobs/WorkArbiter.cs:229-258`, NEW) — **BAND ONLY.** It queries
   the bands strictly ABOVE hers, so **at equal band nothing pre-empts, whatever the
   `NaturalPriority` constants say.** That is a deliberate divergence from `HasBetterOfferThan`
   (the claim-time gate, which does let the constant win inside a band): declining to hand out a
   job is free, taking one away drops cargo and abandons a walk.

**The cancel is `Simulation.CancelJob`, not `JobWork.AbandonJob`** — modelled on the flee path
(`SafetySystem.cs:233-238`): `sim.CancelJob(c); c.ClearPath(); c.OrderedMove = false;`. `AbandonJob`
leaves reservations *"the CALLER's to release"*, so a pawn pre-empted through it walks off still
carrying the stack. What survives a pre-emption, all of it measured by M2-0 and now pinned by
`PreemptionTests`: the cargo (set down at her feet, `CarriedBy`/`ReservedBy` cleared, re-enters the
haul board), a station's `Progress` and a build site's `Delivered` — because those live on the
`Device` / the site. Only her own `JobWorkTicks` countdown is lost.

**The offer query asks a hypothetical.** `IWorkOfferSource.HasClaimableWork` gained a required
`asIfIdle` argument (`WorkArbiter.cs:50-61`); `true` swaps ONLY the `IsRecruitableForWork` gate for
`IsRecruitableIgnoringJob` in all three providers (`JobSystem.cs:622`, `MachineWearSystem.cs:469`,
`CraftingSystem.cs:527`). Every other early return still applies, because an over-report is still a
silent stall — and a pre-emption built on one takes a pawn off real work for work that does not
exist. Both push providers skip a device that already has a worker, which is what stops a Craft or
Maintain pawn being offered her own bench back under the hypothetical.

**Cost:** `HasOfferAboveBand` runs for every busy pawn every tick, but `BestOfferAtBand`
short-circuits on `GetWorkPriority(type) != band` — a field read per work type — so a pawn with
nothing enabled above her own band never reaches a provider. At the OD-H defaults no band is ever
matched. Allocation-free, no RNG. **Pin-neutral** (P1–P5 unmoved), for the reason above: nothing is
enabled ⇒ nothing is claimed ⇒ nothing to pre-empt.

### 6.2c THE STICKY CLAIM — a direct order outranks the grid (M2-19, 2026-07-30)

§6.2b gave the grid the power to take a busy pawn back. **The same power eats the player's own
direct order**: a crew member ordered onto a band-4 job is pre-empted off it by anything the grid
ranks higher, and the M2-0 spike measured `MaintenanceSystem` re-claiming a directly-ordered pawn
**within the same tick** (idle 11 ticks of 30 000). `Citizen.HeldByOrder` is what outranks the grid.

**The state** is the M2-1 bool (`Entities/Citizen.cs:201`, CITZ v8, hashed at bit 5). ⭐ **Its
writer landed in M2-9** — `PrioritiseJobCommand` (§6.2d) — so this mechanism is no longer
unreached; what is still missing is the right-click that sends it (M2-10, §13.25).

**The rule, in ONE predicate.** `Citizen.IsRecruitableIgnoringJob` (`:438`) gained `&& !HeldByOrder`
and nothing else changed, because that property is what every gate already shares: the dispatcher
(`JobSystem.cs:220`) and both push recruiters (`MachineWearSystem.cs:522`, `CraftingSystem.cs:654`)
reach it through `IsRecruitableForWork`, all three `HasClaimableWork` implementations read it
directly on the `asIfIdle` branch, and so does `JobSystem.TryPreempt` (`:309`).

**The two LLM gates are named here too, so an audit of "every path" is complete.** `EffectValidator`
(`:119`, the GRANT — M2-2's G4) and `CapabilityComputer` (`:78`, the OFFER — G5) do **not** read the
property: each tests `JobKind == None` itself. A held pawn is therefore refused at both, for exactly
the reason the claim gates refuse her, and neither needs the hold spelled out.

> ⚠️ **WHICH OF THOSE SITES ACTUALLY BITES — MEASURED, and it is not what the charter predicted.**
> A held pawn always carries a job, and every CLAIM gate — the three above plus G4/G5 — already
> requires `JobKind == None`, so the
> claim-side clause is **subsumed and stops nothing**; the entire hold lives on the pre-emption path.
> That path reads the predicate **twice** (`TryPreempt`'s gate and the `asIfIdle` offer query), and
> blinding either one alone leaves `StickyClaimTests` **fully green** — only blinding both reddens
> it. **The pinned fact is the property, not either call site.**

**The invariant is `HeldByOrder ⇒ JobKind != None`**, and it is RimWorld's placement rather than a
convenience: `docs/design/rimworld-reference.md` §2.2 reads the forced flag off `curJob.playerForced`
— it lives on the job and dies with it. Enforced in the **`Citizen.JobKind` property setter**
(`:313-324`), which is why that field stopped being a plain field: **twenty sites in `sim/` end a
job and every one of them assigns `JobKind.None`**, so releasing there covers completion, a new
direct order (which cancels first), death (`NeedsSystem.Kill` → `Simulation.CancelJob`), and every
genuine inability — safety (`SafetySystem.cs:233`), the target vanishing, a lost path
(`JobWork.AbandonJob`). Releasing at the twenty sites instead is the five-site discipline again, and
one missed site is a crew member nothing may recruit and nothing can re-order.

**What is deliberately NOT built:** RimWorld's other half, `Pawn_MindState.priorityWork` — a saved
(cell, workGiver, tick) record that RE-ISSUES the prioritised job and **expires after 30 000 ticks**.
It needs a saved target this pin-neutral package may not add, and the integrator ruling rejects the
timeout outright (*"a timeout makes the hold a race the player cannot see"*). ⇒ **the 30 000-tick
timeout is a knowing divergence from §2.2**, and a job that ends is the end of the order: she does
not resume it after a flee or a needs break.

⛔ **Survival is untouched.** `SafetySystem` consults no recruitability predicate at all, and
`SustenanceSystem` gates on `IsIdleForWork` (`:345`), which does **not** carry the hold — the same
line E0-3 drew for `OrderedMove`. Folding the hold into `IsIdleForWork` reddens a driven leg.

**Pin-neutral** (P1–P5 unmoved): nothing writes the bool, so no shipped run's behaviour moves.
Allocation-free, no RNG. Pinned by `tests/Perilune.Tests/StickyClaimTests.cs` (11 legs, measured
mutation table in the fixture header).

### 6.2d THE DIRECT ORDER — "that machine, now" (M2-9, 2026-07-30)

`PrioritiseJobCommand` (`Commands/Commands.cs:220`) is the player's per-machine verb and **the
writer §6.2c was waiting for**. One named crew member, one machine **by entity id** (tile→device
resolution is the host's — `GameSession.HandlePrioritise`, `hosts/web/GameSession.cs:990`, through
`Simulation.TryGetDeviceAt` and never that file's linear `TryDeviceAt`, which returns the conduit).
The wire is `{"cmd":"prioritise","cid":N,"x":..,"y":..,"deck":..}` → `CmdKind.Prioritise` (24).

**The composition, in the order the M2-19 writer contract requires** (`Commands.cs:305-321`):
`Simulation.CancelJob` → `ClearPath` → `OrderedMove = false` → `JobKind = Maintain` + `JobTarget` +
`JobWorkTicks = 0` → **then** `HeldByOrder = true` → `JobsDirty |= Citizens`. Job first, hold
second: the `JobKind` setter clears the hold on the way past `None`, so the reverse order writes a
bool that is immediately erased. `MaintenanceSystem.DriveWorkers` picks her up on the next 1 Hz
pass and drives the service from ground truth — this command starts no path and fetches nothing.

**⭐ THE DECIDED BEHAVIOUR: AN EXPLICIT ORDER OVERRIDES THE WORK GRID, AND NOTHING ELSE.**
`Citizen.CanTakeWorkType` is deliberately NOT called; `Citizen.IsIncapableOf` is. The authority is
`docs/design/rimworld-reference.md` §2.2, source-grade half (`Pawn_JobTracker.cs:112-120`):
*"incapability wins even over a player order; a player's own priority-0 setting does not."* §2.2's
other paragraph (*"it does not override disabled or incapable"*) is about `PawnCanUseWorkGiver`,
which tests `WorkTypeIsDisabled` and **not** `GetPriority(w) == 0`, and that file marks the looser
wiki wording UNVERIFIED with an instruction not to encode it. ⚠️ **Under OD-H this is the DEFAULT
case**: every work type boots off, so a no-override answer would refuse the player's very first
right-click. The order does not WRITE the grid — it overrides the setting for this job only.

**The refusals, all of them the dispatcher's own predicates, none re-derived** — `HoldPosition` ·
`IsIncapableOf(Repair)` (via `WorkTypeMap.TryOf(Maintain)`, M2-2's one table) · nothing to service
(`Condition >= MaintainBelow`) · `MaintenanceSystem.TryFindStagingTile` (**now public**; ⭐ **M3-14
AMENDS THIS — the command passes `forced: true` (`Commands.cs:286`), so the AIR question is waived
for an ordered pawn and only the GEOMETRY still refuses**: `TryFindStagingTile` tests
`Simulation.IsWalkable` outside the flag, so a walled-in machine is refused exactly as before) ·
`MaintenanceSystem.IsUnfixableWreck` (wreck rule W2 — ⭐ **M3-14 asks this one `forced: true` too**,
`Commands.cs:297`, the same decision one line on: the order counts a consumable stack the dispatcher
could not reach) · the machine
already has a servicer who is **somebody else** (`MaintenanceSystem.FindWorker`, **now public** —
`DriveWorkers` drives every Maintain citizen bound to a tile, so a second one would repair it twice).
**Every refusal returns BEFORE the cancel**, so no path can leave a held pawn with no job.

**⛔ AND THE SERVICER IS *HERSELF* IS NOT A REFUSAL — IT IS A NO-COST ORDER, which is a defect
independent review found live.** Falling through on a machine she is already servicing reaches
`CancelJob` and destroys the service: measured, `JobWorkTicks` **8 770 → 0** and the carried Parts
stack dropped on the floor, on a second click at the machine she was already on. M2-10 puts that
second click one click away from the first. So the branch leaves the JOB completely untouched and
writes **only** the hold — idempotent on a repeat click, and the whole point when she reached the
machine on her own: the grid recruited her, the player says *"stay on THAT"*, and an order that
returned without writing the bool would leave the grid free to take her off it. Same machine only;
an order naming a DIFFERENT machine still replaces this one through the cancel.

**⭐ AND IT DISCHARGES `ReasonNoConsumable`.** The `blocked` channel gains a fourth order kind,
`WireFormat.OrderRepair = 3`, and its rows come from `GameSession._prioritised` — a **host-side,
transient, never-saved** map of crew id → ordered device id, walked in CITIZEN STORE order (never
enumerated: a hash layout must not reach the socket). ~~A row is emitted only while
`IsUnfixableWreck` is true~~ ⭐⭐ **CORRECTED 2026-08-03 BY D5 — THE REPAIR WALK NOW EMITS TWO
REASONS AND THE WRECK RULE IS THE SECOND OF THEM.** A row is emitted while `IsUnfixableWreck` is
true (`ReasonNoConsumable`) **or while `GameSession.OrderedWorksiteIsOutOfReach` is true**
(`ReasonNoRoute = 5`, asked FIRST — §13.25 b3 and the retire rule below). `IsUnfixableWreck` is
asked **once per pending order**, in the walk
(`hosts/web/GameSession.cs:3136-3181`), and the answer handed to `AddUnfixableRow`
(`hosts/web/GameSession.cs:2926`) rather than re-asked inside it: below the wreck floor that call is
up to three full item-store scans. ⭐ **Since M3-14 it is asked `forced: true`**
(`GameSession.cs:3181`), so the badge answers *"is there a consumable ABOARD"*, not *"is there one an
idle crew member could reach in air"*.

**THE RETIRE RULE IS A WHITELIST**, and it is a whitelist because the blacklist it replaced LEAKED
(independent review, measured). ⭐⭐ **IT HAS THREE ARMS SINCE D5 (2026-08-03), NOT TWO — the
two-arm wording that stood here was left false by this file's own §13.25 b3 and is corrected in
place rather than left to drift.** An entry survives a render only while **(0)** the ordered
worksite is OUT OF REACH for the crew member who was ordered (`OrderedWorksiteIsOutOfReach`, asked
FIRST — it must be true on both sides of the drop, and arm (1) below would otherwise retire the
entry at tick 1); or **(1)** she is held on a job at that machine — from then on the held job is
the record, §2.2's `curJob` again; or **(2)** the machine is an unfixable wreck. Everything else
retires on the very next render, so an order refused on Condition, staging, incapability or
"somebody else got there first" costs nothing and can never later raise a NO PARTS badge for an
order nobody holds.
Entries are also **pruned** when their crew member leaves the store (§2.1: a designation survives
its pawn, a direct order does not). ⚠️ The four-reason ladder (`BlockedReason`) is deliberately NOT
applied to a repair row — `ReasonWorkTypeOff` would be a lie about an order that overrides the grid.
⭐⭐ **D5 (2026-08-03) ADDS A THIRD ARM, AND IT IS ASKED FIRST — `OrderedWorksiteIsOutOfReach`**
(`ReasonNoRoute = 5`; §13.25 b3 is the diagnosis). Position is not style: it must be true on BOTH
sides of the drop, and arm (1) retires the entry the moment the sim takes the order, so a badge that
rode on `taken` would vanish at tick 1 and be long gone by the abandon at tick 171. It is one A* per
pending order per render (`_prioritised` is bounded by the crew; the whole walk is gated on it being
non-empty) — **103 µs measured, Debug, for a FAILING search on the wreck at boot**, which is the
worst case and a different order of magnitude from the per-tile sweep `WireFormat.Blocked.cs`'s
header rejects for the other three walks.
⭐⭐ **AND SINCE THE D5 FOLLOW-ON (2026-08-03) THERE IS A FIFTH WALK BESIDE THIS ONE**, over
`GameSession._dropped` — the orders the SIM has already eaten, filed from `OrderDroppedEvent` at the
TICK boundary (`NoteDroppedOrders`, called from `AdvanceTicks`, never from `Render`). The two maps
are **disjoint by construction**: `NoteDroppedOrders` files nothing while `_prioritised` holds that
crew member, and `HandlePrioritise` clears `_dropped` when a new order supersedes. So the whitelist
above still governs the PENDING half alone, and the badge is never emitted twice for one order.
§13.25 b3′.

**No saved field, no chapter bump, no sim-side order registry**: the held job carries the target,
as §2.2 keeps the forced flag on `curJob`. RimWorld's re-issuing `priorityWork` record and its
30 000-tick timeout are still not built (§6.2c). **Pin-neutral** (P1–P5 unmoved): a command nobody
sends changes nothing. Pinned by `tests/Perilune.Tests/PrioritiseOrderTests.cs` (18 legs, measured
mutation table in the fixture header — eight rows, three of them independent review's).

### 6.3 `JobKind` lifecycles (`Entities/Citizen.cs:314-325` the property, `:462-477` the enum)

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

<!-- RECONCILED 2026-07-29 (M1-L-b): the slice build/work-economy lane LANDED. Its file:line
     citations were NOT re-verified line by line in that pass — see the note. -->
> **✅ RECONCILED 2026-07-29 — the slice build/work-economy lane LANDED** (`AuthoredShips.cs`,
> `CraftingSystem.cs`, `JobSystem`'s material gating), so this section is no longer describing a
> tree about to change under it. ⚠️ **Its `file:line` citations were written against `0f88231`
> and the reconciliation pass did NOT re-derive them one by one** — treat a line number here as a
> hint, not a fact, and re-measure before quoting one. (A count you did not measure yourself is
> not evidence, even from this file.)

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

### Maintenance (`MaintenanceSystem`, 1 Hz, `MachineWearSystem.cs:146-1029`)

*(Every `file:line` in this subsection was re-derived from the tree on 2026-08-02; the set
it replaced pre-dated E0-6 and pointed into `MachineWearSystem` — the file's FIRST class —
for lines that live in `MaintenanceSystem`, the second.)*

A **standing rule with no bills and no UI**: any machine below its `MaintainBelow` wants
service, **neediest (lowest `Condition`) first**, ties by device store order (`:218-307`).
One servicer per machine, bound by `JobTarget = the machine's tile`.

Phases are encoded in existing citizen fields (`:100-124`):
`JobWorkTicks == 0` ⇒ logistics (fetch a consumable stack, or carry one over — sub-phase by
`CarryingItemId`); `> 0` ⇒ servicing adjacent to the machine, counting down by
`IntervalTicks (10)` per pass from `maintenance_work_seconds × 10 = 9000` ticks
(E0-2 L1 rebase: `maintenance_work_seconds` 20→900, so the service is 900 s not 20 s),
scaled by the servicer's Repair skill through `WorkRates.WorkTicksFor` (M3-7 — BOTH
assignment legs, `:411` parts-in-hand and `:468` jury-rig).

**The completion mode is decided by what is in the servicer's hands** (`:352-381`), and
since E0-6 + the wreck start there are FOUR outcomes, one per rung of
`RepairConsumableTier` plus the free one:

- **Parts in hand** → consume one unit, `Condition = 1` (full overhaul).
- **Seals in hand** → `Condition = seal_service_condition = 0.9` (routine service).
- **Swarf in hand** → `Condition = swarf_service_condition = 0.45` (salvage patch-up; only
  offered to a machine already below `wreck_threshold`).
- **Empty hands** → `Condition = jury_rig_condition = 0.6` (patched, not fixed). Reachable
  only when the fetch found nothing, and REFUSED below `wreck_threshold` (`:450-453`).

Fetch preference is **tier before distance** (`FindNearestConsumable`, `:696-729`); the
ladder has one declaration, `RepairConsumableTier` (`:749`).

#### ⭐ The reserve floor on AUTONOMOUS spend (D3, owner decision 2026-08-02)

`MaintenanceSystem.AutonomousRepairReserve = 4` (`:790`) — a **named constant, not a def
field**, on `ThawGate.MinDaysOfFood`'s precedent. The standing rule may only fetch while the
ship holds **more than 4** loose consumable units; a direct order (`forced`) sees the whole
pile. Below that line an autonomous service behaves exactly as it does on a ship holding
nothing: **free jury-rig inside `[wreck_threshold, maint)`, no service to offer below the
wreck floor.**

- The predicate is `HasAutonomouslySpendableStock` (`:837`) — all three ladder kinds, units
  summed with `FindNearest`'s own filters (unreserved, uncarried, and the stack's tile
  stageable in the AUTONOMOUS view), early-exiting once the floor is cleared.
- It is applied in **one place**: the first line of `FindNearestConsumable` (`:702` — the
  signature is `:696`; the statement is two lines past it). That
  is the single funnel through which all three deciding sites already pass — the recruit
  gate (`:257`) and `HasClaimableWork`'s mirror (`:515`) via `IsUnfixableWreck`, and
  `DriveWorker`'s fetch (`:421`) directly — so the three cannot come apart. A reserve at the
  fetch alone is a livelock: recruit, walk, abandon, re-offer.
- Consequence to read out loud: **`IsUnfixableWreck(…, forced: false)` can now be TRUE on a
  ship that visibly holds consumables.** Every host-side caller
  (`PrioritiseJobCommand`, `GameSession.BuildBlocked`, the operate reply) already passes
  `forced: true`, so no order is refused and no `ReasonNoConsumable` badge is raised over
  reserved stock.
- Why 4: `AuthoredShips.cs`'s WINNABILITY block prices the wreck's opening at three benches
  below the floor + the MOSS terminal = **4 consumable services** the player must be able to
  buy by hand.

#### ⭐ The order names its price (T13 finding, 2026-08-02)

**`MaintenanceSystem.WhatARepairWouldSpend(sim, device|belowWreckFloor, forced, out kind)`
(`:759`/`:780`)** — *what would a service at this machine spend, right now?* Three outcomes
(`RepairSpend`, `:687`), because two of them are "nothing" for different reasons:

| outcome | when | the player's sentence |
|---|---|---|
| `Consumable` + kind | the fetch funnel finds a stack | `SPENDS 1 PARTS` / `SEALS` / `SWARF` |
| `Nothing` | nothing aboard, machine **at or above** `wreck_threshold` | `SPENDS NOTHING` (the free jury-rig) |
| `NoService` | nothing aboard, machine **below** it — i.e. `IsUnfixableWreck` | *silence* (there is no service to price) |

- **It is the dispatcher's own funnel.** The whole body is `FindNearestConsumable` plus the same
  wreck-floor split `DriveWorker` makes when the fetch comes back empty (`:452`). ⛔ It is **not**
  `WantedRepairConsumable`, which is `RepairConsumableTier(0)` UNCONDITIONALLY — right for the
  `blocked` badge (raised only when the ship holds none of the three rungs) and a confident lie as a
  price: on a Seals-only ship it says PARTS while the service eats Seals.
- **Position-independent**, so there is no `from` argument: the tier is chosen by EXISTENCE and
  `FindNearest` uses the tile only to break distance ties. Under `forced` even the breathability
  filter is waived.
- **The one per-device input is `IsBelowWreckFloor` (`:679`)** — the Swarf rung's precondition,
  extracted so the four sites that must agree (`IsUnfixableWreck`, the fetch's `allowSwarf`,
  `DriveWorker`'s empty-handed split, and this query) read one declaration. A pure extraction; the
  comparison is unchanged.
- **Asked with `forced: true`** by the host, because the offer prices an ORDER and D3's reserve
  lives inside the funnel.

**It travels on the `devices` channel as a TENTH element, `spend`** (`DeviceCell`,
`WireFormat.Devices.cs`; `SameAs` gained the clause **in the same commit**). A raw `ItemKind` byte,
or `WireFormat.SpendNothing = -2`, or `WireFormat.SpendUnknown = -1`. `decodeDevices` defaults an
absent element to the SENTINEL and never to a kind — the other three elements default to their old
behaviour and so does this one, and before it existed the offer named no price.

⚠️ **THE HOST COMPUTES BOTH ANSWERS ONCE PER RENDER**, in `GameSession.BuildDevices`' prologue, and
selects per row with `IsBelowWreckFloor`. The answer is ship-global except for that one bit, so there
are exactly two of them; a per-row call would be three item-store scans × ~146 rows × 10 Hz, a cost
`FindNearestConsumable`'s own comment files as owed.

⚠️ **NOT VOLATILE, which is the channel's admission bar** (`Powered` was refused by name for being
re-stamped every second). `spend` moves only when the ship's top available rung changes — a discrete
pickup/consume/craft event — or when a device crosses `wreck_threshold`, which at the fastest shipped
wear rate is once per machine per run. On `--ship wreck` at boot it is a constant on every row.

⚠️ **IT IS A HINT, NOT A PROMISE**, on `GameSession.HandleCommission`'s precedent (*"written from what
is affordable RIGHT NOW rather than from the command's outcome … a hint, not a result"*). A repair is
9 000 ticks of fetch-and-service and the funnel re-runs at the fetch. **Nothing is reserved** — the
class header refuses reservations deliberately.

The client composes the words in `prioritise-model.js`'s `spendClause`, spelling the kind through
`ITEM_WORDS` (pinned equal to `ThawGate.ItemWords`; **`Swarf` was added to BOTH in the same commit** —
the C# arm is behaviourally a no-op because `default:` already returned `"SWARF"`, and it exists so
the parse-based pin can see the rung). The label is
`PRIORITISE: REPAIR <NAME> · SPENDS 1 PARTS · NO AIR AT THE WORKSITE — SHE MAY DIE`: **price first,
hazard last**, because the hazard is life-and-death and keeps the position it held alone under D4.

Tunables (`wear.def`): `hot_threshold_c = 35`, `wear_per_degree_c = 0.05`,
`max_heat_multiplier = 3`, `maintenance_work_seconds = 900` (E0-2 L1 rebase, was 20),
`jury_rig_condition = 0.6`, `seal_service_condition = 0.9`, `swarf_service_condition = 0.45`,
`wreck_threshold = 0.25`.

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

### 10.7 The ship's log (`Systems/HistorySystem.cs` + `Memory/Chronicle.cs`)

**ONE ring, two surfaces.** `HistorySystem.Entries` is a `List<HistoryEntry>` capped at
`MaxEntries = 200` with `RemoveAt(0)` FIFO eviction. There is no separate "sensor log":
`GameSession.BuildLog()` takes the last 14 entries, the Overview SENSOR LOG island shows the
last 5 of those, and the MOSS `log` screen shows the same tail above the rendered Chronicle.
Fixing the ring fixes both. The Chronicle TAB is inert on the standard surface by design
(`overview-model.js:342`) — M4-7's, not to be re-homed opportunistically.

**Who writes what.** All ingestion is event-driven in `HistorySystem.Tick`, except two systems
that call `HistorySystem.Record` directly because they are not economy files and hold the only
context that knows the line is warranted (`EulogySystem`, `CryoSystem`). Economy files may NOT:
`ArchitectureBoundaryTests.Economy_KnowsNothingAboutSoulsPresentationOrPhysiology` forbids the
identifier `Chronicle` there with the reason in the test — *"publish an event, let HistorySystem
write it"*.

| kind | ord | label | sev | written by |
|---|---|---|---|---|
| `Generic` | 0 | Note | 0 | authored boot lines (`AuthoredShips`, e.g. the four breached capsules) |
| `Alarm` | 1 | Alarm | 2 | `AlarmRaisedEvent` |
| `Death` | 2 | Death | 8 | `CitizenDiedEvent` (name rides the event — the citizen is already gone) |
| `Goal` | 3 | Objective | 1 | `GoalCompletedEvent` |
| `Brownout` | 4 | Power | 5 | `BrownoutChangedEvent`, **coalesced per network per sim-hour** — §13.8.1 |
| `RelationshipChanged` | 5 | Relations | 3 | `RelationshipChangedEvent` |
| `Argument` | 6 | Argument | 4 | `ArgumentEvent` |
| `Bond` | 7 | Bond | 4 | `BondEvent` |
| `ConstructionCompleted` | 8 | Construction | 6 | `ConstructionCompletedEvent` (`BuildSystem`) |
| `Eulogy` | 9 | Eulogy | 9 | `EulogySystem.Record` |
| `DeconstructCompleted` | 10 | Salvage | 6 | `DeconstructCompletedEvent`, three arms (salvage / swarf / worth nothing) |
| `EmergencyThaw` | 11 | Thaw | 11 | `CryoSystem.Open`, emergency arm (M3-5) |
| `RunEnded` | 12 | Ending | 12 | `CryoSystem` (M3-5) |
| `Thaw` | 13 | Thaw | 7 | `CryoSystem.Open`, **ordinary arm** (D1, 2026-08-02) |
| `RepairCompleted` | 14 | Repair | 6 | `RepairCompletedEvent` (`MaintenanceSystem.DriveWorker`), **four arms** (D1) |
| `DeviceCommissioned` | 15 | Commission | 6 | `DeviceCommissionedEvent` (`CommissionDeviceCommand`) (D1) |
| `OrderDropped` | 16 | Order | 5 | `OrderDroppedEvent` (`MaintenanceSystem.Abandon`), **all six reasons** (b3-R, 2026-08-03) |

The enum is **append-only** (persisted as a byte, folded into the checksum). Severity picks each
day's single headline, ties to the earliest entry; tier 6 is a deliberate four-way tie meaning
"the ship's capability changed and a person made it happen".

⛔ **THE ORDINARY THAW SITS BELOW BOTH DEATH ROWS, AND THAT IS RIMWORLD'S CLASSING** (owner-directed
2026-08-02 after review; the first draft had it at 10, above both, so a day holding a death AND a
wake headlined the wake). `docs/design/rimworld-reference.md` §14.3 puts *"wanderer joins"* in the
**good/neutral event** bucket of the incident deck beside cargo pods and traders, while a raid is a
*big threat*; §11.3's letter colours say the same (gold for good news, red pulsing for the big ones).
A joinee is a lesser positive event; a death is a major negative one. `Death` 7→8 and `Eulogy` 8→9
are a RENUMBER that preserves every pinned pairing and opens the slot Thaw now sits in.
`EmergencyThaw` stays at 11 because its own sentence already CONTAINS the death.

⛔ **A KIND WITH NO ROW IN BOTH SWITCHES IS INVISIBLE, AND THAT HAS ALREADY HAPPENED TWICE.**
`EmergencyThaw` and `RunEnded` shipped in M3-5 with rows in neither `Chronicle.Severity` nor
`Chronicle.Label`, so they rendered as `[Note]` at severity 0 and the ending could never headline
a day. A missing `switch` case falls through `_ =>` and nothing fails. Mechanised for every future
member by `ChronicleTests.EveryHistoryKindHasBothALabelAndASeverityRow`.

**The three D1 lines and their arms:**

- **Thaw** — *"Ozawa came out of cryosleep — awake, and awaiting orders."* SubjectA = the new
  citizen, SubjectB = the capsule. The capsule is not named in prose because every shipped pod is
  `pod_<sleeper>`. The emergency arm keeps its own distinct kind and sentence.
- **RepairCompleted** — *"Okafor overhauled the scrubber (scrub_a) — as good as new."* /
  *"…serviced…"* / *"…patched up … with salvage."* / *"…jury-rigged …, there was nothing aboard to
  fix it properly."* `RepairTier` rides the event, mirroring `MaintenanceSystem.RestoredCondition`'s
  four arms; the device kind and NAME ride it too, so the line needs no lookup. SubjectA = worker,
  SubjectB = device. Published only where a service's work phase actually ends and `Condition` is
  written — an abandoned job, a vanished stack and a walled-in machine announce nothing.
- **DeviceCommissioned** — *"A controller module was fitted to the reclaimer (recl_b) — it answers
  MOSS now."* Nobody is named: commissioning is a paid command, not work a crew member does.
  Published after the flip, so every refusal is silent.

**The b3-R line (2026-08-03):**

- **OrderDropped** — *"ORDER DROPPED — Rell let go of the fabricator (fabricator_1): the parts in
  hand were gone."* SubjectA = the crew member, SubjectB = the machine (RepairCompleted's
  convention, so both halves of one order's life key the same way). The reason clause is
  `HistorySystem.DropReasonClause`, **the one authority for what the sim says killed an order** —
  one clause per `JobDropReason`, six of them, deliberately NOT the client's `BLOCKED_REASON_TEXT`
  (that table is keyed by the wire's three live-re-ask `Reason*` values; §13.45.2 argues the split).
  The prefix is uppercase because the `log` and SENSOR LOG surfaces render raw text with no kind
  tag — only the Chronicle prepends `[Order]`. The device is resolved by ID rather than carried on
  the event, which is safe HERE and is not safe in general (§13.45.1).
- ⛔ **It is the second kind whose text names a device, so it is on `ShipSystems.IsNotAFault`'s skip
  list** — and the FIRST member of that list that is not good news. A dropped order is bad news
  about a PERSON and an ORDER, never about the machine's condition; §13.43.3's regression, second
  instance, and this time caught before it shipped (driven: without the clause the FABRICATION row
  reports `ORDER DROPPED — RELL LET GO OF THE FABRICATOR (FABRICATO…` under LAST FAULT).
- **No coalescer, and that is a decision** — see §13.45.1. Both siblings on this ring
  (`RecordAlarm`, `RecordBrownout`) exist because a CONDITION fired an event forever; a dropped
  order needs a click, and under OD-H nothing re-recruits her afterwards.

**NOT written, deliberately:** crafting / batch completions. That is the next spam source, not the
next feature — a bench working through a bill would produce exactly the shape D6 just removed.

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
| `CITZ` | 8 | v2 +Thirst, v3 +ReservedItemId, v4 +RevealsFog, v5 +Faction/Health/Morale/Archetype, v6 +HoldPosition, v7 +OrderedMove, **v8 +work-priority grid / WorkIncapable / Skill / HeldByOrder (M2-1)** |
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
| `HistorySystem` | `'HIST'` | 2 | `Systems/HistorySystem.cs:105,392` |
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
fold tick + kind + subject ids (`HistorySystem.cs:392-403`), edge key + opinion + tier
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

<!-- RECONCILED 2026-07-29 (M1-L-b): the CO2→maintenance dispatch lane NEVER SHIPPED its
     change. This gap is LIVE, not pre-change. -->
> **⛔ RECONCILED 2026-07-29 — THAT LANE NEVER SHIPPED ITS CHANGE, SO THIS GAP IS LIVE.** The
> note here promised CO2→maintenance dispatch and a revisited `AgreeTask` whitelist "soon", which
> for eight days invited a reader to discount a real hole as merely stale. Re-measured in this
> tree: **nothing in `Systems/MachineWearSystem.cs` or anywhere under `Jobs/` reads `CO2Ppm` at
> all**, and `AgreeTask` is unchanged (`Effects/EffectValidator.cs:35,108`,
> `Effects/CapabilityComputer.cs:74`). The FIRST half of this entry — *nothing converts an
> atmosphere reading into a job, an alarm or a vent* — therefore stands exactly as written.

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

> ⭐ **RECONCILED 2026-08-03 (§13.44): the LOG no longer records each firing — the SHIP still does
> them.** Repeated alarms coalesce into one entry per sim-hour run (`HistorySystem.RecordAlarm`),
> because 197 copies of this one sentence had filled the whole 200-entry ring by day 1.4 on the
> shipped wreck and evicted every repair, boot line and real fault from it. The firing counts above
> are unchanged and still the defect underneath: re-measured on `--ship wreck`, **2 512 firings in
> three sim-days, first at tick 1 085 400 (day 1.26)** — the day-1.21/2,579 figures here are the
> SLICE's and are kept as such. Nothing warms the ship; §13.44.5 files that half.

### 13.3 `FollowPlayer` is written, saved and hashed — and read by nothing

`EffectValidator.cs:38` sets `mind.FollowingPlayer`. It is persisted
(`Citizens/CitizenMemory.cs:369`), restored (`:425`) and folded into the `MEMS` checksum
(`:482`). **No system, host or client reads it** (grep: the only other hits are the
persistence test). `CitizenMind.FollowingPlayer`'s own comment admits it: *"v0: flag only —
no follow movement behavior yet"* (`:113`). It is still offered to the model as a
capability on every single turn (`CapabilityComputer.cs:55` puts it in the *always legal*
set), so a crew member will cheerfully agree to walk with you and then not.

### 13.4 Four citizen fields the sim writes but never uses — and one it never writes

<!-- RECONCILED 2026-07-29 (M1-L-b): the task-label / build-ghost-wire lane LANDED. -->
> **✅ RECONCILED 2026-07-29 — the task-label / build-ghost-wire lane LANDED.** Re-measured in
> this tree: `GameSession.TaskLabel` **names the object** rather than emitting five generic words
> ("Servicing scrubber_ls", "Hauling … to …" — `GameSession.cs:2900-2938`), and
> `WireFormat.Design` carries `Delivered`/`Required` as **append-only** tuple elements 5 and 6
> with `Material` appended after them as 7 (`WireFormat.cs:307-315`). `task` was a pre-existing
> roster field, so no wire shape moved and a four-element `designs` reader is still unaffected.

- ~~**`Fatigue`** rises at 1/57,600 per second to a hard clamp of 1.0 after 16 h and
  **nothing anywhere reduces it**…~~ ✅ **CLOSED 2026-08-02 by M3-9 — see §13.40.** `RestSystem`
  is the reducer: a crew member between jobs past `fatigue_rest_threshold` (0.75, i.e. 12 sim-hours)
  sleeps in a `Bed` at effectiveness 1.0 or on the deck at 0.8 and returns to 0. `Bed` is no longer
  inert furniture. ⚠️ **The half of the old bullet that survives**: fatigue still gates **no work
  rate** — `Citizen.cs`'s *"slows work"* was false and is now corrected in place, and RW §4.4 says
  rest reaches mood and immunity only.
- **`Mood`** is computed but gates nothing — no work-speed modifier, no breaks (§5.3). It
  is not a flat line: it **sawtooths**, because the hunger/thirst terms ramp and then drop
  each time a citizen eats or drinks. Measured on the slice, crew-mean at the day marks:
  **−37.7 (day 1) → −26.4 (day 2) → −29.5 (day 3)**, with a per-citizen envelope over days
  1–3 of roughly **[−39.8, −10.5]**. ⚠️ **THE CEILING CLAIM IS RETIRED BY M3-9 (§13.40).** It read:
  *"`Fatigue` saturates at 1.0 after ~16 h and never falls, so `Mood ≤ 20 − 25 = −5` from then on …
  Mood is permanently negative for every crew member from day 1 onward."* Fatigue now falls while a
  crew member sleeps, so the −25 floor is no longer permanent and the mood envelope above is a
  PRE-M3-9 measurement that has not been re-taken. ⭐ And the OTHER half of this bullet — *"Mood is
  computed but gates nothing"* — was already false when it was written and is worth stating plainly:
  mood reaches `ShipMetrics.Morale` → `DirectorSystem` tension → `WearPressure` →
  `MachineWearSystem`, which is exactly why M3-9 moved P1.
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
crossing a real thirst/hunger threshold mid-order still diverts. ⭐ **THE FLEE HALF OF THAT
SENTENCE IS NO LONGER TRUE — M3-14 (rung 4, 2026-07-31) MADE THE ORDER SUPPRESS SELF-RESCUE
TOO.** `SafetySystem.Tick` skips a `Citizen.HeldByOrder` crew member outright
(`sim/Sim.Core/Systems/SafetySystem.cs:284`), so an ordered pawn does **not** flee lethal air:
she may die, deliberately. It is scoped to the held pawn — every other crew member, including one
standing in the same compartment, flees exactly as before. See §5.1 and §13.21.

**A NEW player verb landed 2026-07-28: OPERATE.** It is the first player verb that is not a
designation — it changes the world at the command drain with nobody walking anywhere.

- **What it does.** Toggles `Device.IsOpen` on a `Door` or an `AirVent`, and on **nothing else**.
  The operable set is host-side in one place, `GameSession.IsOperableKind` (`:1103-1104`),
  derived from what the *sim* actually reads `IsOpen` for: `AtmosphereSystem` (door flow, vent
  injection), `ThermalSystem`, `PowerSystem.IsWanting`, `Simulation.IsWalkable`,
  `GlyphMapper.DeviceGlyph` and the room flood. `SetDeviceStateCommand` will happily set the bit
  on a Fabricator and **nothing would ever read it**, which is the invisible no-op the narrow
  set exists to refuse. **`CryoPod` is deliberately excluded** — opening a pod is a thaw, gated
  and priced, and belongs to W5's `ThawCommand`.
- **It goes through a command, never through the device.** `Door` →
  `SetDoorStateCommand`; `AirVent` → `SetDeviceStateCommand` (`GameSession.cs:1073-1076`). The
  host reads device fields to *answer*, and writes nothing.
- **Surface.** Room Zoom only, as a 16th palette tool, key `[O]` (`client/src/ui/room-model.js:51-54`,
  `roomzoom-view.js:1269`). Not on the Overview, and it is **not a sweep tool** — one click, one
  device.
- **It is fog-gated on the HOST as well as the client** (`GameSession.HandleOperate` →
  `IsExplored`, `GameSession.cs:1045,1111-1112`) — the *same* `TileFlags.Explored` predicate the
  `devices` channel is gated on, written once so the verb and the channel cannot come to
  disagree about which devices exist as far as the player is concerned. **This is deliberate and
  it is the rule, not an oversight: a verb has no more licence to widen what the player knows
  than a renderer does.** An unexplored target is refused with `NOTHING KNOWN HERE TO OPERATE`;
  the client's own chip layer is derived from the `devices` channel, which is gated on the same
  flag, so the two populations are identical by construction (`roomzoom-view.js:1015-1020`).
- **It resolves the device through `Simulation.TryGetDeviceAt`, not a store scan.** `Conduit`
  and `Pipe` are utility overlays that share tiles with machines and are ~88 % of the device
  store; a linear scan returns the *conduit* on any tile that also carries power, which is where
  a vent usually is. ⚠️ **The deprecated console's `ContextAction` cursor toggle still has that
  bug and it was not fixed** — that path is closed to new work.
- **One refusal, three advisories, and the distinction matters.** The only state in which the
  sim accepts the command and the world does not move is a **locked door being opened**, so that
  is refused up front (`GameSession.cs:1066-1071`); a locked door can still be *shut*.
  Everything else is **accepted** and carries an advisory tail explaining why it may change
  nothing (`OperateAdvisory`, `:1311-1340`): `WRECKED (n %)` when `!IsOperational`, plus `NO
  PARTS, SEALS OR SWARF ABOARD TO REPAIR IT` when `MaintenanceSystem.IsUnfixableWreck` — ⭐ **asked
  `forced: true` since M3-14 (`:1332`), with NO order in view, so the sentence is a claim about the
  ship's stock rather than about reachable-in-air stock** — and —
  `else if`, so a wrecked machine never also mentions power — `NO POWER REACHES IT` for a vent
  being opened while `!Powered`. ⚠️ **The power clause cannot fire on any shipped ship**: every
  `AirVent` on `--ship wreck` (2) and `--ship grid` (4) is on network 1, and no palette tool
  places a vent. It is dead on shipped content, pinned by a constructed fixture.

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

### 13.8 Crew memory is flooded by social spam — ~~and so is the Chronicle~~ (brownout half FIXED)

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
  (0.3–0.7, `EffectValidator.cs:84`). **STILL OPEN** — `CitizenMemory` was not touched by the
  Chronicle fix below and is a different store with a different eviction rule.

#### 13.8.1 The brownout half — finding D6 — is FIXED (2026-08-02)

**THE DEFECT, RE-MEASURED ON THE SHIPPED WRECK** rather than quoted (the earlier figure here —
"174 Brownout + 23 Bond + 3 Alarm at day 3" — is a SLICE measurement and is kept in §13.11
where it belongs; `--ship wreck` is what a player boots):

| tick (sim-h) | ring, BEFORE | ring, AFTER |
|---|---|---|
| 200 000 (5.56 h) | **200 entries, 200 Brownout**, window ticks 191 431–199 941 | 9 entries — 3 Alarm + 4 Generic + **2 Brownout** |
| 864 000 (24 h) | **200 entries, 200 Brownout**, window ticks 860 011–863 991 | 30 entries — 5 Alarm + 4 Generic + **21 Brownout** |

`PowerSystem.Balance` published **22 562** `BrownoutChangedEvent`s on network 1 in that first
sim-day. Every one of them appended an entry, so by sim-hour 5.6 — the T13 playtest ran 5.47 —
the whole 200-entry ring was power flapping and the ship's own boot lines had been evicted from
its own log. On the SLICE the same shape: 27 986 edges, 198 Brownout + 2 Bond at day 1.

**THE FIX: episode coalescing in the ring itself** (`Systems/HistorySystem.cs:218-303`,
`RecordBrownout`). A `BrownoutChangedEvent` scans back for the newest `Brownout` entry on the
SAME network (`HistoryEntry.SubjectA`, which now carries the network id — it was 0) and, if that
entry is younger than `HistorySystem.BrownoutQuietTicks` (36 000 ticks = **one sim-hour**, a code
constant per M2-1's rule-not-tunable precedent, so P4/P5 do not move), **rewrites it in place**
rather than appending: the tick stays at the episode's first edge, `SubjectB` carries the EPISODE
WORD, and the text becomes *"Power network 1 browned out — non-critical loads shed; 891 changes
within the hour, still shedding."* / *"…, since recovered."*

**`SubjectB` IS AN EPISODE WORD, NOT A BARE COUNT** — `HistorySystem.EpisodeWord(edges, shedding)`
packs the edge count in bits 1.. and **the episode's current direction in bit 0**. Both halves are
hashed and saved in a field the chapter already wrote, so `StateVersion` stays at **2**.
⛔ The direction cannot be recovered from the count's parity: an episode whose window expired
mid-recovery BEGINS with a recovery edge, and the shipped wreck produces both parities on both
sides (1036 = recovered, 891 = shedding, 647 = recovered). An early draft assumed parity worked.

Four properties worth knowing before touching it:

- ⭐⭐ **IT DROPS A SAME-DIRECTION EDGE, AND THAT IS A DETERMINISM FIX RATHER THAN TIDINESS.**
  `PowerSystem.Balance` publishes only on a CHANGE, so a network's edges strictly alternate within
  one uninterrupted run; an edge whose direction the ring already records is therefore a restore or
  topology-rebuild artefact and is dropped. The direction test deliberately ignores the window (an
  episode boundary does not break alternation, so a same-direction edge is a duplicate whether the
  window is open or shut). See §13.43.2 for the regression this closes and its residual.
- **No new saved state, on purpose.** The throttle is derived from the ring, which is already a
  save chapter and already hashed. A private `_lastBrownoutTick` would have reproduced
  `PowerSystem._wasBrownout`'s disease (unsaved state deciding what gets written).
  ⚠️ The instrument for that claim is
  `ChronicleSignalTests.TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode`,
  which drives the FULL stack on a ship that flaps. The chapter-only round-trip beside it
  (`TheEpisodeSurvivesASaveAndReload_…`) has no `PowerSystem` in its stack and **cannot see** the
  defect above — it was offered as the evidence once, and that was the wrong scope for the claim.
- **It coalesces rather than drops the RECOVERY, and that is an honesty requirement.** A plain drop
  would log *"browned out"* and swallow the recovery three minutes later, leaving the player looking
  at a fault that no longer exists.
- ⚠️ **"browned out" is a LOAD-BEARING LITERAL; the direction is STRUCTURAL.** Every fault-bearing
  episode line leads with the fault so `ShipSystems.Fault`'s documented `ownKindMustContain` join
  still matches (`ShipSystems.cs:457`); the single-edge pure recovery deliberately does not contain
  it. What that column no longer does is sniff for the word "recovered" on a brownout — that is
  `HistorySystem.BrownoutEpisodeRecordsAFault` now, for the reason in §13.43.2.

The mechanism is RimWorld's, per `docs/design/rimworld-reference.md` §11.1: the **alert stack** is
a DERIVED condition that exists exactly while it holds, and **letters** are fired once by an event
and persist (§11.3 calls letters *"the event log the player actually reads"*). A brownout flapping
at 1 Hz is a CONDITION; RimWorld would never fire a letter per flap. This ring is the letter
channel — the condition belongs on D2's alerts bar and, later, M5-2's stack.

**WHAT THIS DID NOT FIX** (filed, not chased): `IsWanting` returns true for every device except a
closed `AirVent`, so the sawtooth GENERATOR is untouched — see §13.11. The log no longer records
it 22 562 times; the ship still does it.

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
- ~~**Generation ignores `Condition` and `IsOperational`.**~~ **CONNECTED by M2-12
  (2026-07-30).** `PowerSystem.Balance` now multiplies by `Device.EffectiveRate`
  (`Systems/PowerSystem.cs:235`), so a worn `SolarWing` supplies less and repairing one
  steps the ship's generation — see §6's supply formula. The `IsOperational` half is
  *still* absent and that is a decided rule, not a gap: it would make a wing below `fail`
  worth exactly nothing, and the gradient is what makes a wrecked ship recoverable
  (pinned as a negative leg in `GenerationWearTests`).
- **Crafting stations draw full power while idle.** `IsWanting` returns true for every
  device except a closed `AirVent` (`PowerSystem.cs:183-187`), so the slice's Fabricator
  (3 kW), MachineShop (2 kW) and SalvageRecycler (1.5 kW) load the bus 100 % of the time
  against 12 kW of solar. Measured: the slice flaps in and out of brownout continuously —
  **174 of the 200 history entries at day 3 are alternating browned-out/recovered on
  network 1**. ⭐ **STILL OPEN, AND IT IS THE GENERATOR RATHER THAN THE SYMPTOM.** D6
  (2026-08-02) fixed what the flap does to the ship's log (§13.8.1 — the slice's day-1 ring goes
  from 198 Brownout entries to a handful of hourly episode lines), and fixed nothing about the
  flap: re-measured on the shipped tree, the slice still publishes **27 986** brownout edges in
  one sim-day and the wreck **22 562**. `IsWanting` is the cause and it is untouched.
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

### 13.12a Non-gaps worth not re-investigating

> ⚠️ **RENUMBERED 2026-07-27 (was a second `§13.12`).** Two sections carried that number. All three
> inbound citations — `:2319`, `:2367`, `HANDOVER.md:3211` — mean the **`[production]` node table**,
> so **that** section keeps `§13.12` and this one moved. Found by a blind-orientation audit.
> **Also note §13.20 is filed physically BEFORE §13.19** in this file; the numbers are correct and
> only the order is odd, so search by number rather than scrolling.

These *look* suspicious and are actually fine:

- `MachineWearSystem` skipping unpowered machines is deliberate (idle machines don't wear).
- `RelationType` starting at `None` for seeded edges at boot is correct — `Classify` runs
  on the first social pass.
- `DirectorSystem` shipping with `IntervalTicks = 1` but a 100-tick heavy pass is
  deliberate: the event bus is double-buffered and a coarse sampler would miss alarms.
- `EffectPump` and `MemorySystem` not being in the scenario stack is why the pure-sim
  determinism pin is stable.

### 13.12 The `[production]` node table is consumed, and ships THREE ROWS (W0-5, retitled by E0-6, corrected by the E0-6/E0-7 wave)

> **⚠️ SUPERSEDED IN PART, 2026-07-27 (E0-6).** The title of this section said *"and ships empty"*
> and that is now **false**. `content/core/SimDefs/production.def` ships **two rows** —
> `recycle_stock` (SalvageRecycler, `Regolith:4 → Scrap:3`) and `fab_components` (Fabricator,
> `Scrap:2 → Parts:1+Seals:1`). What is still true, and is the part worth keeping, is the rest of
> this section: **the MachineShop has no row and still takes `TryGetBill`'s fallback leg**, and the
> **ordinal-0 selection limit below is unchanged and is now load-bearing** — it is why E0-6 ships
> `Seals` as a *co-output* of the Fabricator's one bill rather than as a second bill of its own. A
> second Fabricator node would parse, checksum and never run.


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

> **⛔ AND RE-BASELINED AGAIN 2026-07-30 by M2-17 — see §13.26 for the current A1/A2/A3, each with
> the work grid that produced it.** Every figure in this section predates OD-H, so its crew were
> working *by default*; after M2-2 an unattended run of the same command does no work at all. The
> `24.979 %` below is therefore doubly stale (pre-E0-6 *and* pre-M2) and must not be quoted.

> **⚠️ SUPERSEDED 2026-07-27 by E0-6. Every number in this section is a PRE-E0-6 measurement and
> roughly half of the matter behind it did not exist.** The shipped `SalvageRecycler` row turned
> **1 Regolith into 2 Scrap** — mass creation against `ECONOMY.md` §2.1 — so the 62 Regolith aboard
> became 124 Scrap, 62 Parts and the 31 `ControllerModule` this section treats as the ship's matter
> ceiling. E0-6 made every hop lossy; the replacement figures are in **§13.19**, and the cliff this
> section describes at h28 **moves EARLIER, to h18**. Do not quote 24.979 %, `ControllerModule=31`
> or the 1.480 % post-cliff floor as current.


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

**E0-4 LANDED 2026-07-25, and that last sentence held exactly — expensively.** Every zoned leg moves
haul off zero (0.115–0.332 % against 0.000 %) and **every one still ends on `ControllerModule = 31`**,
the identical byte-for-byte ground stock as the baseline. The lane spent a whole work package aiming
its acceptance test at that number before recognising the metric was matter-bound and could not move:
**this paragraph already said so, and named this lane.** §13.18 is the retraction, and the lesson is
generic — *before aiming a lane's acceptance at a metric, check that the metric has the power to move.*

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

### 13.17 E0-4 filtered stockpile zones — what is wired but not connected (2026-07-25)

E0-4 landed on `main` (`0be9d70`). The registry, the per-tile filter, the haul enforcement and the
livelock fix are complete and reviewed. These seams are not.

**⚠️ Read §13.18 before quoting any `--stockpile far` number.** The lane's published far-leg
throughput figures are **withdrawn**.

**1. An unreachable zone tile is now cheap and INVISIBLE — the bug got quieter, not fixed.**
Before WP-7, painting a stockpile tile no crew could path to livelocked the haul board: one
unreachable free tile held the per-item candidate gate open forever while delivery always failed, a
2-tick claim/abandon churn across ~8 crew at ~50 % duty (72,928 pickup starts per 30,000 slice ticks).
WP-7 fixed it with a per-tile backoff (`sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:507` stamps,
`:410` honours, reusing `JobWork.UnreachableRetryTicks = 50` at
`sim/Sim.Core/Jobs/JobContext.cs:55`), taking it to **918 starts / 2.254 %**. **The honest cost: a
zone painted where no crew can reach now simply never fills, silently, and nothing anywhere says so.**
There is no indicator on any surface, no MOSS fault row, and no log line. Arguably a worse play
experience than the livelock, which at least showed visible activity. The data is one line from being
enumerable (`HaulJobSource.cs:108`, `BackedOffStockpileTiles`) and would ride the existing view-only
wire channel beside `designs`/`materials`. **Live follow-up, first E0-6 candidate.**

**2. WP-7's fix degrades with terrain churn** — measured, and this belongs in any future debugging of
"my late-game ship started livelocking again". Every `JobBoardDirty.Tiles` rescan discards every
stamp (`HaulJobSource.cs:453`, a wholesale `Clear()` — chosen so an E0-5 deconstruct re-opens a zone
immediately instead of after ≤5 s):

| terrain churn (per 30,000 slice ticks) | pickup starts | share |
|---|---|---|
| untouched slice (10 `Tiles`-dirty ticks) | 918 | 2.254 % |
| `Tiles` dirty **every** tick (adversarial) | 67,742 | **28.873 %** |
| no fix at all | 72,928 | 31.191 % |

Up to **93 % defeat under continuous churn.** It degrades *gracefully* — never worse than pre-WP-7,
never incorrect, only wasted crew time. Calibration: 10 `Tiles`-dirty ticks cost +0.37 pp. **Escape
hatch:** drop the `Tiles` clear and rely on expiry alone (the measured 1.884 % variant), costing ≤5 s
of re-open latency after a deconstruct.

**3. `_tileRetryAt` / `_backoffWakeAt` are transient, so a reload can diverge from a live game** by up
to one re-probe cycle: the reloaded game starts with an empty backoff map where the live one held
entries. **Identical in kind to the pre-existing `_retryAt`** in Haul/Dig/Deconstruct — not introduced
by E0-4 — and **no test in the suite would catch either. Nobody has checked it.**

**4. A filtered stockpile tile has NO visual indicator anywhere.** Filtered and unfiltered tiles are
byte-identical to every projection: the accept mask lives in the `ZONE` registry
(`sim/Sim.Core/Stock/StockZoneSystem.cs`), which no wire channel carries. An honest indicator needs a
new channel and is its own package.

**5. A chip toggle affects only FUTURE paints.** Both filter UIs are a *pending mask* applied at
designate time, not a per-tile editor: an existing zone is unchanged until repainted, and (per 4)
nothing says so. The TUI is explicitly a **two-key pending mask** — `i` walks the kind cursor,
`I` accepts/rejects the kind under it (`hosts/tui/GameLoop.cs:354`, `:361`).

**6. A mis-placed stack on a filter-rejecting tile is not re-hauled off it.** Haul skips any item
already standing on a `Stockpile` tile as "already stored" (`HaulJobSource.cs:209`) **before** the
filter is consulted, so a stack that arrived on a tile whose mask rejects its kind stays there
forever. Inherited from the pre-E0-4 guard, not introduced by the filter.

**7. `DesignateStockpileCommand` has no device exclusion**, so a **bench tile is a legal zone tile at
distance 0** (`sim/Sim.Core/Commands/Commands.cs:137` gates on `TileFlags.Walkable` alone). A player
can do this; it is not a harness artifact. Second-order consequence worth knowing: crafting outputs
spawn at `worker.Pos` (`sim/Sim.Core/Systems/CraftingSystem.cs:196`) and the worker stands *adjacent*
to the station, so an output can land on a zoned tile — where the "already stored" guard (6) skips it,
and **it never enters the haul pool at all.**

**8. The E0-4 verbs are on the DEPRECATED surface only.** The stockpile verb and its `ACCEPTS ▸`
filter row live in the `.app` console shell (`client/index.html:88-90`,
`client/src/ui/hud.js:302`, `:523-525`), which `body.overview-open` hides — so on **`--ship grid`**,
**the one standard UI** (`CLAUDE.md`, THE STANDARD SURFACE), the player cannot reach them at all.
Tracked as debt that only pays down: `KNOWN_GAPS.stockpile` in
`client/test/surface-boundary.test.js:132-136`, owned by the console-retirement WP-5. `dig` and
`strip` are in the same position.

**9. Two code comments are now stale and must be rewritten** (recorded rather than fixed, because the
package that found this was docs-only): `hosts/tui/GameLoop.cs:56-60` and
`client/src/ui/stock-filter-model.js:38-45` disclose the filter's cost as *"zoning any tile now writes
an explicit accept-all entry, so `Zones.Count > 0` permanently arms the `filtered` fast path"* at
`O(items × stockpile-tiles)`. **Both halves are wrong now.** WP-6 made an accept-all mask store **no
registry entry** (`StockZoneSystem.cs:152-155` — `mask &= AcceptAllMask`, then accept-all collapses to
`ClearFilter`), so the fast path is *not* permanently armed; and the exponent was understated — the
true pre-WP-6 cost was `O(items × stockpile-tiles²)`, because `AnyFreeStockpileAccepts` loops S tiles
and each `IsFreeStockpileTile(…, kind)` (`JobContext.cs:133`) calls `TryGetFilter`, itself a linear
scan of S entries.

**10. `AcceptAllMask` has THREE independent derivations, and the host-side redundancy is safe only
while they agree.** All three currently compute `0x7F`. `GameSession.HandleFilter`'s `& AcceptAllMask`
is therefore redundant with `StockZoneSystem.SetFilter`'s own `mask &= AcceptAllMask`
(`sim/Sim.Core/Stock/StockZoneSystem.cs:154`) — **but only while the derivations agree**, and **no
test can bite the host-side line**, because since WP-6 it uniquely decides a `_status` string nothing
observes. A cross-derivation contiguity test pins the agreement and is a **bridge, not a fixture**.
**The logged resolution is to make every site consume `StockZoneSystem.AcceptAllMask`**, after which
that bridge test should be *deleted, not maintained*. Decision on record: **keep** the redundant line
with the divergence condition documented; **no** status accessor was added.

**11. One harness coupling was left deliberately, as a one-way ratchet:**
`BenchStockpile_StillFills` draws its tiles from `SelectStockpile(far: false, 4)` rather than
declaring them, so a change to the selection order changes what that test exercises. Documented and
accepted rather than fixed.

**12. Still flagged, still not fixed:** the accept mask is a `ulong`, so **`ItemKind` 64 is a hard
ceiling**; there is no stack merging, no zone priority, and no containers (later E-STOCK packages);
and there is no `stock.def` (deferred until a real tunable exists).

---

### 13.18 ⛔ RETRACTED: the `--stockpile far` measurements, and what the slice can and cannot settle

**Every `far`-column number this project published before 2026-07-25 is void.** They are listed here
so that a reader who finds one elsewhere learns it is withdrawn: end-of-run `ControllerModule`
throughput **`6`**, **`2`** and **`9`**; `HaulPickup` **~49 %** against `HaulDeliver` **~0.0 %**;
on-job travel **~0.2–0.3 %**; and **A1 "50.000 % PASS"**.

**Why.** `StockpileHarness.SelectStockpile` gated candidates on the `TileFlags.Walkable` **flag** with
**no reachability test**, and ordered them by distance-to-nearest-bench *descending*. Walkability says
nothing about connectivity: **150 of the slice's 807 walkable tiles (19 %) are unreachable**, sitting
inside the authored observatory behind a door built closed (`sim/Sim.Gen/AuthoredShips.cs:93`,
`DoorClosed = true`; `Simulation.IsWalkable` refuses a closed door and **nothing in the sim ever opens
a door**). Distance-descending ranked all of them above every legal tile, so `--stockpile far` zoned a
**sealed compartment** and what it measured was the §13.17-(1) haul livelock. `--stockpile far
--days 1` went from **~43 min of wall clock to 24 s** once a reachability gate landed — the **~43 min**
is contemporaneous prose, **no timing artifact survives**, while the post-gate figures are recorded
`.time` files; at 3 sim-days
every leg now runs in **~72 s**. That collapse *is* the retraction. A reachability gate now runs in
the harness (`sim.Paths.FindPath` from every live crew member, host-side, t = 0 snapshot,
∃-any-live-crew — so a `HoldPosition` crew member counts as a witness yet can never haul; measured
inert on the slice, 0 of 40 picks affected).

**`ECONOMY.md` §8's −14 % wrong-deck regression is NEITHER CONFIRMED NOR REFUTED, and this ship
cannot settle it.** The reason is §13.15: end-of-run `ControllerModule` is **matter-bound, not
labour-bound**. Every unmodified leg — baseline, `bench 4/40`, `far 4/40`, `filtered-far 4/40` — ends
on the **identical** ground stock `Corpse=1 Potato=699 ControllerModule=31` with zero
Regolith/Scrap/Parts left. `far 40`'s entire haul cost is **1.6 crew-hours against ~352 crew-hours of
post-cliff idle** (h29–h72 × 8 crew); to cost one module it would have to be **~200× larger** *and*
land as contention during h1–h28. **"31 in every leg" is a saturated instrument, not a null result —
uninformative, not evidence of absence. Do not record §8 as disproved.**

**What IS measured and stands** (slice, 3 sim-days = 2,592,000 ticks, one seed, **n = 1**):

| leg | modules | haul % | on-job travel | delivery legs | A1 h24 |
|---|---|---|---|---|---|
| no flag (baseline) | 31 | 0.000 | — | 0 | 24.979 FAIL |
| `bench 40` | 31 | 0.169 | 4.6 % | 74 | 24.979 FAIL |
| `far 40` | 31 | 0.278 | 5.2 % | 80 | 24.979 FAIL |
| `filtered-far 40` | 31 | 0.115 | 4.2 % | 31 | **25.219 PASS** ⚠️ |
| `strip 40` (headroom, no zone) | 50 | 0.000 | — | 0 | 37.424 PASS |
| `strip 40 + bench 40` | 51 | 0.146 | 2.9 % | 63 | 37.417 PASS |
| `strip 40 + far 40` | 51 | 0.332 | 3.6 % | 91 | 37.479 PASS |
| `strip 40 + filtered-far 40` | 50 | 0.137 | 2.9 % | 40 | 37.622 PASS |

- **Cross-deck haul works.** Deliveries land on deck 1 via the ladders in every zoned leg. That
  refutes the *stranding* half of §8's "catastrophic" — material is not marooned. It bounds no cost.
- **A reachable far-deck stockpile is nearly harmless at equal capacity.** At N = 40 it costs
  **+0.109 pp** of crew time and **+0.6 pp** of on-job travel over a bench-side zone (with
  `--strip 40`: +0.186 pp and +0.7 pp).
- **Per delivery a far-deck leg costs ~1.5× a bench-side one** — the normalised figure, not a total:
  0.00348 vs 0.00228 %-of-crew-time per leg at N = 40; 0.00365 vs 0.00232 with `--strip 40`. **That
  1.5× is a LOWER BOUND**: an abandoned leg is counted but carries fewer ticks, so over-counted legs
  inflate the denominator and bias the ratio *downward*. (The bias is small here — `Flee` 0.00 % and
  8/8 crew alive in every leg, so abandons are path-loss only.)
- **With headroom the metric resolves and placement still does not move it:** `--strip 40` reads
  50 → 51 and **far equals bench**.
- **The `--strip 40` leg reproduces §13.15's published E0-5 numbers to the digit** (31 → 50, A1
  37.424), which is the evidence that the harness itself is sound.

**§8's MECHANISM is real, and WP-4's bench rule is what suppresses it — the lane's strongest result.**
§8's named root cause is "crafting **outputs** spawn unreserved, so the haul board drags them to the
stockpile, from which the downstream station's fetcher must walk them back". WP-4's bench rule
(`HaulJobSource.cs:216`) deletes exactly that by dropping `_benchWanted` = `{Regolith, Scrap, Parts}`
from the candidate pool first; `Corpse` is hard-excluded (`:208`) and `MetalOre` is a dead kind no
system creates, leaving only `Potato` and `ControllerModule` haulable — **neither an input to any
bench**. So every unmodified leg above measures "is there a regression?" on a tree that already
contains the fix. With the rule reverted (`_benchWanted` forced to 0 — a **measurement-only local
revert, never committed**, independently replicated by the textually different edit of deleting the
guard):

| revert leg | modules | haul % | on-job travel | delivery legs |
|---|---|---|---|---|
| `bw0 + bench 40` | 31 | 0.357 | 5.0 % | 156 |
| `bw0 + far 40` | 31 | 0.762 | **9.3 %** | 244 |
| `bw0 + strip 40 + bench 40` | 51 | 0.389 | 3.1 % | 202 |
| `bw0 + strip 40 + far 40` | 51 | 0.795 | 6.8 % | 263 |

**The sign flips with placement, which is what makes it §8's round-trip rather than "more hauling" —
and it replicates in BOTH horizons.** With a **far-deck** zone the revert costs **+3.2–4.1 pp** on-job
travel **and crafting occupancy RISES**; with a **bench-side** zone crafting occupancy **FALLS**, at a
cost of only +0.2–0.4 pp. Idle `None` falls in both far-deck cases (75.35 % → 74.37 % with headroom,
84.85 % → 84.10 % without). The stations, not the haulers, do the extra walking — §8's sentence
verbatim.

| revert, crafting occupancy | with `--strip 40` | without |
|---|---|---|
| **far-deck** zone | 21.71 → **22.09 %** (+0.38) | 12.52 → **12.72 %** (+0.20) |
| **bench-side** zone | 21.64 → **21.33 %** (−0.31) | 12.48 → **12.12 %** (−0.36) |

A volume story would push crafting the same way regardless of *where* the zone sits. It does not.

**DELIBERATELY NOT QUANTIFIED: how much of §8 the bench rule removes.** The fraction depends entirely
on the contrast chosen. **All four contrasts below are the `--strip 40` (matter-headroom) legs, and
that label is load-bearing:** **~47 %** of far's absolute travel (6.8 → 3.6 %), **~81 %** of the
far-minus-bench travel *penalty* (+3.7 → +0.7 pp), **~65 %** of haul *volume* (263 → 91 legs), and
**~0 %** of the *per-delivery* penalty (**1.57× with the rule and 1.57× without**).

> **⚠️ WITHOUT HEADROOM THE LAST ONE FLIPS SIGN.** Re-derived from the **un-stripped** rows of the
> main table: **1.52× with the rule** (`far 40` 0.278/80 = 0.00348 vs `bench 40` 0.169/74 = 0.00228)
> against **1.37× without** (`bw0 + far 40` 0.762/244 vs `bw0 + bench 40` 0.357/156). At N = 40 with no
> `--strip`, the rule makes the per-delivery penalty **larger, not equal** — the opposite of "~0 %".
> **"~0 %" is a `--strip 40` statement, not a general one.** Even the *sign* of "does the rule change
> the per-delivery cost?" is horizon-dependent, which is the sharpest single reason the magnitude is
> declined.

**The rule does not make a wrong-deck haul cheaper; it makes 2.1–3.2× fewer of them happen**,
by returning `{Regolith, Scrap, Parts}` to the pool. **Any single percentage would be cherry-picked.**
Direction and placement-dependence are measured; **magnitude is not.** Quote absolute pp, not ratios:
**on the `--strip 40` legs** the rule's removal adds **+0.463 pp** of haul cost on the far deck against
**+0.243 pp** beside the benches (as a *ratio* bench is hit harder there, **2.66× vs 2.39×**, which
inverts the story and is the wrong axis). **Without headroom**: **+0.484 pp** far against **+0.188 pp**
bench, ratios **2.74× vs 2.11×**. **The pp ordering is stable across horizons; the ratio ordering is
not** — which is the whole argument for quoting pp.

**§8's magnitude is never approached.** The worst on-job travel anywhere above is **9.3 %** against
§8's **75.7 %** — roughly 8× short — and it never costs a single module. **Settling §8 needs a ship
whose economy is labour-bound rather than matter-bound.**

**⚠️ The A1 trap, for the fourth time in this one lane.** `filtered-far 40` is the only unmodified leg
whose A1 "PASSES" (**25.219 %** against the 25 % target) and its throughput is **31 — identical to the
FAILING baseline**. A1 counts crew who are **busy**, and haul is busywork. The withdrawn "50.000 %
PASS" was pure livelock: crew claiming and abandoning, never producing. **Never read A1 as
production.**

**Two knobs, and which question each answers:** `--stockpile-n N` is **capacity** (free slots, hence
how much haul can happen before the zone saturates); `--strip N` is **headroom** (new matter, hence
whether throughput can move at all). `N = 40` is the measuring package's own choice with **no prior
precedent in the repo**, picked so both placements have equal capacity.

**The `bench` leg was MISLABELLED and the label is corrected, not the measurement.** `--stockpile
bench 4` picks `(13,5,0)`, `(16,5,0)`, `(22,6,0)` — **the three benches themselves, distance 0** —
plus `(13,4,0)`, the one genuinely adjacent tile. So it is a stockpile **on and beside** the benches,
not one "hugging" them; see §13.17-(7) for why that is legal. The conclusion still holds directionally
(throughput at baseline, near-zero haul — what a pre-positioning buffer looks like). **Recorded
follow-up, not taken:** make `bench` mode skip `HasDevice` tiles so the mode means what it says —
**that moves the published bench row and requires re-running the 3-day A/B**, and nobody has
quantified how much it would change.

**Repo-wide remedy that landed with the retraction:** the plain, verb-less
`occupancy --ship slice --days 3` report — the exact run whose `31` was misread into the retracted
claim — now prints an unconditional ⚠️ matter-headroom warning beside `ground stock`, naming
`--strip N` as the remedy. It is guarded by `StockpileHarness.MatterHeadroomWarning(int)` plus a test
that asserts the message keeps naming the remedy. **Disclosed residual: the single `Console.WriteLine`
call site (`hosts/scenario/Program.cs:491`) is UNCOVERED** — the tests project does not compile
`Program.cs` — so **deleting the call leaves the gate green**. The message is pinned; its emission is
not. This intentionally adds exactly **one line** to that
report; the other 100 lines are byte-identical.

### 13.20 E0-7 — ice → melter → water, and the water the ship never uses (the E0-6/E0-7 wave, 2026-07-27)

**What shipped.** `ItemKind.Ice = 8`, a `DeviceKind.IceMelter` whose bill is a `[production]` node
(`melt_ice`, `Ice:1 → none` — litres, so it cannot be a `[recipes]` row), meltwater buffered in the
already-hashed `Device.StoredLiters`, and **1 600 units of authored forward-hold cargo = 40 000 L**.
**The chain adds zero new hashed state.** B-2's makeup floor is now **suppressed per-ship on the
existence of a melter** — not deleted, because `--ship grid`, the 2-crew reference and every
procedural ship have no ice and would re-kill the food loop on day 1.2. Both directions are pinned.

**⚠️ THE RUNWAY IS NOT A PROPERTY OF THE ICE ECONOMY.** `sim.WastewaterLiters` has **no cap**, so
**~66 % of every litre melted, in steady state, is warehoused in an abstract pool nothing uses.**
That is filed in `WaterSystem.cs` as **"⚠ OPEN DEFECT, NOT A LIMIT"**. Two-thirds of the burn funds a
pool. Measured on the merged tree (slice, seed 20260721, n = 1): **1 382 units left at day 3, 888 at
day 10, 71.2–72.7 units/day ⇒ ~22.5 sim-days from boot.** The loop is **demand-limited, not
supply-limited** — tanks sit at 1000/1000 and the melter buffer rests at 80.6–83.1 L against a 100 L
cap, above the 75 L recruit gate.

**A priority inversion found by review, not by the suite.** `RunMelters` ran **before**
`RunReclaimers`, so finite hauled ice claimed tank headroom ahead of free recycled greywater.
Swapping two lines: ice burned over 3 days **335 → 224 units (−33 %)**, runway **14.3 → 21.4 days**,
pool **7 051 → 4 049 L**, with **identical food and identical full tanks**. **The ordering had no
test at all** — that is why a reviewer's sweep found it and the gate did not. It is pinned now.

**⚠️ E0-7 IS INERT ON `--ship grid`, THE ONE STANDARD PLAY SHIP.** `AddIceMelterOnHydroLoop` /
`AddIceAtTheForwardHold` are called only from `AddSliceMatter`; `PeriluneGrid()` is a separate
builder; and `IsPlaceableFurniture` does not list `IceMelter`, so **a player can never build one**.
Grid still reports *"B-2 makeup floor is ACTIVE at 20 L — water is being conjured"*. **So the wave
does NOT repair what §13.19 records E0-6 breaking on the standard surface** — grid remains A1
**0.000 % FAIL** with throughput 8 and, at 10 days, `None` 95.50 %. Whether grid gets its own
authored ice is a **content decision and it is open on the owner.**

**⚠️ §13.19 item 6 IS NOW FALSE and is struck.** It reads *"a defs set that declares an empty
`[production]` section still empties the table and falls back to `[recipes]`."* E0-7 **seeds**
`[production]` from the compiled defaults (`DefsParser.cs:74`), so an empty section removes nothing.
Measured at the merge: E0-6's `sawProductionSection` guard **no longer bites** (deleting it leaves
its own test green) while reverting the seeding reddens 8 tests. **The two lanes' fixes did not
compose — the seeding supersedes the guard**, and E0-6's assertion was inverted with the reason at
the site. That is the shape `CLAUDE.md` warns about: two lanes fixing the same function differently
merge textually and are wrong together.

**⚠️ §13.19 item 2's Seals surplus is a 3-DAY ARTEFACT.** Measured across horizons on the merged
tree: **grid — which has no melter and no ice anywhere — produces 16 Seals by day 1 and burns them
16 → 5 → 2 → 0 by day 4.** The slice runs 23 → 14 → 11 → 0 by day 5. `ControllerModule` is **flat at
8 (grid) / 11 (slice) at every horizon**, so the matter ceiling never moves and only the Seals stock
decays. "Nothing burns the surplus" was true of a 3-day window and false of the game. The one clean
like-for-like moved **12 → 11** with a named mechanism (the melter is a new wearing device, wear
0.012, therefore a new maintenance customer and a new Seals consumer) — but one unit at n = 1 is not
a measurement of size.

**⚠️ A1 IN A FIFTH COSTUME, and it nearly shipped as a regression.** The merged `--strip 40` leg
reads A1 **28.771 PASS → 21.153 FAIL** — while **throughput is identical at 19** and *both* robust
statistics **improve**: mean h1–h28 **29.779 → 33.261**, floor h29–h72 **2.577 → 6.198**. The
neighbouring hours are **h23 30.7 % · h24 21.2 % · h25 34.4 %** — a 13.2 pp swing across three
adjacent hours, and **A1 samples the trough**. The melter re-times work. **A1 moved down while the
economy moved up.** Never quote it without throughput beside it.

**A performance defect found while measuring a disclosure — ✅ FIXED 2026-07-27
(`WaterSystem.HasIceChain`).** `HasIceChain` runs only when `RunMakeup`'s cheap pool check fails —
so it was **heaviest on exactly the ship that can never benefit from it**. `--ship grid` walked
**91 721 250 device slots per sim-day** across 73 377 scans (42.5 % of `RunMakeup` passes — *a share
of passes, not of CPU*; the honest cost is low single-digit percent of wall clock), every scan
returning false, because its pool sits pinned at the 20 L floor. The slice measures **0 scans** on a
1-day run, because its ice chain keeps the pool high. Reordering could not help — the cheap check is
already first. The fix is one field memoised against `sim.DeviceTopologyVersion`, which
`WaterSystem.Tick` **already tracks 14 lines away**: pin-neutral (all five pins held, `--ship grid`
occupancy output byte-identical), inherits `RebuildNetworks`' correctness.

**Both halves of the original charter's warning survive the fix and are now measured, so keep
quoting them:** 91 721 250 slots per sim-day → **1 250** (one scan), but that is **~90 ms of an
~8.2 s sim-day, ~1.1 %** (Release, n = 5, the scan replayed 73 377 times over the real 1 250-device
store — a *lower* bound). A paired A/B/B/A of the whole harness (n = 8 per arm) reads 8.78 s
pre-memo vs 8.71 s memoised: right sign, **not separated from noise**. **The 91.7 M is a count of
slots, not of CPU — charter on it, never quote it as a speed-up.** ⚠️ **CONDITIONS, so this does not
become the next inherited figure:** every timing above was taken on a machine running **up to four
concurrent `dotnet test` suites from other worktrees** (the same-session gate took 9 m 58 s against a
~6.5 min norm). Contention widens the noise band on both arms of a paired A/B and can only make a
1 % separation *harder* to resolve, so the conclusion is conservative and does not move — but the
absolute seconds are not a quiet-machine baseline and the slot counts (which are exact counters, not
timings) are the only figures here that are contention-proof. The memo's key is sufficient
because `Simulation.AddDevice`/`RemoveDevice` are production's only doors into the device store and
both bump the version; the load path does not bump it and does not need to (a load builds a fresh
sim with fresh systems, so the memo is uncomputed) — pinned by
`tests/Perilune.Tests/IceChainMemoTests.cs`, which drives the flip in both directions because **a
stale answer is invisible on grid by construction**.

**Known and disclosed:** 400 of the 1 600 authored ice units are **invisible** (one pile lands under
a Light; `IsOpenFloor` tests the deck raster only). The melter's `machines.def` row is a **verbatim
Scrubber copy**, so it inherits **0.4 kW of waste heat** — physically inverted for a device absorbing
heat, on a ship whose thermal loop is documented as freezing. And `ECONOMY-PLAN §5.1`'s mandated
slice-level conservation test arrived with E0-6, not here — it is what would have surfaced the 66 %
surplus from inside the suite instead of from a reviewer's arithmetic.

---

### 13.21 The worksite staging rule — the maintenance/deconstruct livelock, and its invisible cost (2026-07-28)

**The bug.** Nothing in the dispatcher asked whether a crew member could SURVIVE at the tile it was
about to be parked on. `MaintenanceSystem.RecruitForNeediest` picked the neediest machine and paths a
recruit there; `SafetySystem` pulled it off at `flee_suffocation` (45 s of vacuum, 120 s of thin air
or CO2 narcosis); it recovered in good air, returned to `JobKind.None`, and the very next 1 Hz pass
re-recruited it for the **same** machine, which was still needy because no work had ever landed on
it. `DeconstructJobSource` is the same shape, and its `_retryAt` backoff could not see it: that stamp
is written only when `FindPath` **fails**, and here the path succeeds every time.

**Measured on `--ship grid`, seed 20260723, `occupancy --maint-audit`** (the flag is new and
opt-in — with no flag the report is byte-identical):

| | before | after |
|---|---|---|
| 14 sim-days: Maintain occupancy | 16.245 % | **2.974 %** |
| 14 sim-days: Flee occupancy | 4.325 % | **0.000 %** |
| 14 sim-days: Maintain job starts | 47 640 | **298** |
| …of which ended in a flee | 18 301 | **0** |
| **14 sim-days: SERVICES COMPLETED** | **311** | **309** |
| final sim-hour: starts / services | 643 / 2 | 0 / 1 |
| 14 sim-days: wall clock | 173.7 s | 120.1 s |
| 2 days `--strip 20 --strip-deck 2`: Deconstruct / Flee | 24.653 % / 19.072 % | **0.000 % / 0.000 %** |
| …Deconstruct starts, of which fled | 7 429 / 7 427 | **0 / 0** |
| …walls torn down | 0 of 20 | 0 of 20 |
| …wall clock | 275.6 s | **22.5 s** |

**Read the SERVICES row before anything else: 311 → 309.** The 47 342 job starts the rule removed
produced essentially nothing; the two-service difference is chaotic divergence on a 14-day run, not
lost capability. From ~h270 the old hourly curve read **91 % busy / 70 % "productive" forever** and
would have scored **A1 PASS** while completing 2 services an hour. It is the clearest instance yet of
`docs/HANDOVER.md` §6's rule: A1 counts busy crew.

**Who the needy machines are, and why it starts at h270:** the **eight deck-2 doors**. Deck 2 boots
airless; a Door wears 0.002/h scaled by the Director's `WearPressure`, so it crosses
`maintain_below` 0.3 at about h270 and then sits between `maintain` and `fail` **forever** — a
permanent demand nobody can serve.

**The fix.** One rule, `WorksiteSafety.CanStageWorkerAt` (`sim/Sim.Core/Systems/SafetySystem.cs`),
asked by the only two places in the sim that choose the tile a worker will stand on:
`JobWork.TryPathToAdjacent` (dig, build, deconstruct) and `MaintenanceSystem.TryFindStagingTile`
(which also gates the consumable fetch, or the cycle simply moves upstream to a Parts stack a
mid-carry flee left in vacuum). **No field, no save, no hash fold, no def, and all five pins held.**

⭐ **AMENDED 2026-07-31 BY M3-14 — THE RULE NOW HAS A PLAYER OVERRIDE, AND EVERYTHING BELOW IS
ABOUT AUTONOMOUS WORK.** `CanStageWorkerAt` gained a `forced` parameter
(`sim/Sim.Core/Systems/SafetySystem.cs:149`) that short-circuits the air test. ⛔ **`SafetySystem`'s
own doc comment says *"only a caller that can see the ORDER"* may pass it true, and that is NOT what
shipped.** Measured, the true-passers are: `PrioritiseJobCommand` at **both** its gates
(`Commands.cs:286` staging, `:297` the wreck rule), a `Citizen.HeldByOrder` worker on the drive path
(`MachineWearSystem.cs:311-312`), the ordered-device badge walk (`GameSession.cs:3181`) — **and
`OperateAdvisory` (`GameSession.cs:1332`), which passes it UNCONDITIONALLY with no order in view at
all**, because there the question is *"a claim about the SHIP'S STOCK, not about what an idle crew
member happens to be able to reach"* (its own comment, `GameSession.cs:1320-1321`). Every
dispatcher-side RECRUITMENT query still passes `false`, which is what keeps every measurement in this
section and every pin standing. What changed is that the player can now order a crew member into
vacuum, and `SafetySystem` no longer rescues her while the order holds (`SafetySystem.cs:284`) — see
§13.25 b2.

**⛔ RETRACTED — "the rule denies only work that could never have landed."** That was this package's
load-bearing claim, from the arithmetic that the flee threshold arrives in 45 s (vacuum) / 120 s
(thin air, CO2 or thermal) while the shortest fixed-tile job is a 90 s device strip. **It is false,
in two independent ways, and both are accepted costs rather than patched bugs:**

1. **A floor build is 20 ticks — 2 seconds** (`BuildSystem.cs:254 FloorConstructTicks`), dispatched
   through the guarded seam, and it fits inside the vacuum deadline with 43 s to spare. **Measured
   both ways** (`UnbreathableWorksiteLivelockTests.AFloorBuildInVacuum_…`): planted by hand the build
   **completes in hard vacuum** with the builder alive and never fleeing; through the dispatcher it
   is **never offered**. Real, achievable work is denied — silently, forever.
2. **"Unbreathable" includes THERMAL.** `AtmosphereSafety.IsBreathable` is false for
   `tempC > HeatStrokeC || tempC < HypothermiaC`, and `NeedsSystem` puts thermal injury in the slow
   (1/240) band. So a **fully pressurised, perfectly breathable but freezing or roasting** room now
   refuses **all** work, including jobs that would finish inside its 120 s deadline. `CLAUDE.md`
   records a live freezing thermal loop, so this is not hypothetical.

**Not patched, deliberately.** Making the rule duration-aware re-opens every marginal case (does the
job fit *after* the walk, *after* the suffocation already carried, at which rate?) for a bounded
loss: `CanDesignate` refuses a floor on `TileDefs.Void`, so what is denied is a floor **re-material
on existing deck plating**, never sealing a breach. The surviving argument is the weaker, true one:
**every LONG job in bad air is unachievable, the long jobs are where the livelock lived, and the
short ones are paid for on purpose.**

**A third copy of the staging shape is deliberately left OPEN.** `SustenanceSystem.cs:307` has its
own private `TryPathToAdjacent` and stages crew at a `WaterTank`; it is **not** guarded, because
denying a thirsty crew member the only water aboard kills them for certain where the cycle only
wastes their time. Survival outranks the cycle — the same precedence `IsRecruitableForWork` already
encodes.

**Inert unless BOTH `NeedsSystem` and `SafetySystem` are registered** — the precise statement of what
the cycle needs. Without the first, suffocation never rises; without the second, nothing pulls a
worker off. It also keeps every atmosphere-free fixture and host working: such a sim has *every*
room at 0 kPa, where an unconditional rule would stop all work everywhere.

**⚠️ THE COST, taken deliberately — the E0-4 WP-7 trade again (§13.17).** The bug went from
**expensive-and-visible to cheap-and-invisible**. A dig, build or strip painted in an airless
compartment now simply never progresses, silently, with nothing on any surface saying why — and on
`--ship grid` that is reachable in play: the two unopened wreck slots hold 40 debris tiles behind
sealed, airless doors. `CanStageWorkerAt` is public precisely so a wire channel can one day say so.

**⚠️ Two shipped test fixtures had to change, and both were arranging the impossible.**
`CrewSafetyTests` booted its work room at vacuum and designated a dig in it — dispatch into
already-lethal air can no longer happen, so it now pressurises the room and **blows it once the crew
is settled on the dig**, which is the case `SafetySystem`'s own doc comment describes.
`DesignationVerbTests` built a full stack on an unpressurised ASCII strip and expected a dig to be
taken; it now gives the deck air.

**Not covered, recorded:** `BuildJobSource`'s `_needMat` list is a HAUL to the site, not a countdown
at it, so material can still be carried into an airless compartment and set down once per site and
then never built. `HaulJobSource` is untouched — a haul has no work timer and cannot pin a worker.

**New latent harm, recorded not hidden.** `MaintenanceSystem.DriveWorker` calls the same staging
picker every pass, so a servicer whose compartment loses air mid-service now abandons *at that
moment* rather than at the flee threshold — earlier and safer, but it sets any carried `Parts`/
`Seals` stack down where it stands, and the fetch gate then refuses that stack because its tile is
unbreathable. A consumable can therefore be **stranded** in a compartment until the player
repressurises it. It is bounded (one stack per interrupted service), it is visible on the ground, and
the alternative — leaving the fetch ungated — is the livelock one leg upstream.

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
| what a crew member's task line says | `hosts/web/GameSession.cs:3871-3975` (`TaskLabel`; its remarks start at `:3814`) |
| …and **why that job and not another** (M2-6) | `hosts/web/GameSession.cs:4097` (`AppendRankingClause` — appends " — &lt;WorkType&gt; is priority &lt;n&gt;", and says nothing at all in three states: no job / no ranking for the job in hand / only one work type enabled) |
| …and **whether the air where she stands will kill her** (D4) | `hosts/web/GameSession.cs:4035` (`AppendAirWarning`) + `:4034` (`AirWarningClause = " · NO AIR"`). Gated on `Citizen.HeldByOrder` — the sim already speaks for everyone else (`SafetySystem` pulls them off the job and the label becomes "Heading to safe air"). Asks `AtmosphereSafety.IsBreathable`, skips a door marker. ⚠️ Appended **BEFORE** the ranking clause, deliberately, and spelt with a **middot** rather than an em dash so it rides inside the *what* half and reaches the docks — pinned by `WhyLineTests.NoBaseLabel_ContainsTheSeparator` (its held-in-vacuum half) |
| **where those clauses are READ, and where they are not** | ⚠️ ONE wire field, TWO renderings. The separator is a parsing contract declared on both sides: `GameSession.cs:4129` (`RankingSeparator`) and `client/src/ui/console-model.js` (`WHY_SEPARATOR` + `taskWhat`); the air clause is a **second** two-sided contract, `GameSession.cs:4034` ↔ `console-model.js`'s `AIR_WARNING_CLAUSE`, and `client/test/why-line.test.js` compares the two literals across the language boundary. The two crew docks render only the WHAT half — too narrow to hold the ranking clause. ⭐ **THEIR BUDGETS ARE MEASURED, NOT DERIVED** (`client/tools/why-line-shot.mjs` STEP 6/7, real Chrome, `--ship wreck` 1600×1000): `.ov-crewtask` **145 px = 26 characters**, `.rz-crewtask` **118 px = 22** — ⚠️ *not* the ~147/~120 ≈ 26/23 every comment in this repo carried until 2026-08-02; 23 characters measure 120 px in a 118 px box and clip. The whole sentence is read in the Overview's **selected readout** `.ov-task` (**264 px** — MEASURED `clientWidth`, same rig, same run; ⚠️ this repo carried 266 from M2-6 and five comment sites were moved with it at D4 fix-back — wraps), which renders the raw wire field, and — since D4 fix-back — as a **hover `title`** on both dock rows. ⛔ The Room Zoom still has no readout, so the dock row is the only always-visible surface there; filed as an M4 Persona question. |
| **how the air warning survives the docks** (D4 fix-back) | `client/src/ui/console-model.js` `dockTask(task, budget)` — the *what* half, and if it is over budget **and ends in the air clause**, the BASE is shortened so the warning stays whole (`"Servicing fabricator_1 · NO AIR"` 31 ⇒ `"Servicing fabric… · NO AIR"` 26 / `"Servicing fa… · NO AIR"` 22). ⛔ A label that fits, or that is long with **no** warning, is returned UNTOUCHED — CSS ellipsis keeps doing what it always did, and the client never becomes a second opinion about the host's prose. Each view passes its own constant (`OV_DOCK_TASK_CHARS` / `RZ_DOCK_TASK_CHARS`); the deprecated console shell passes none and renders `text` anyway |
| what the build ghosts carry | `hosts/web/WireFormat.cs:307-315` (`Design`), `:323` (`Designs`) |

<!-- RECONCILED 2026-07-29 (M1-L-b): the lane that was moving these two rows LANDED; the line
     numbers above were re-derived from this tree, not carried over from 0f88231. -->

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

---

### 13.22 `--ship wreck` (W3) — what is wired but not connected (2026-07-28)

The wreck start's authoring lane. Everything here is **measured by driving the ship**, not read
off the plan.

**a. A CLOSED CRYO CAPSULE NOW REFUSES STRIP, AND THE PLAYER IS NOT TOLD WHY.**
`DeconstructSystem.CanDesignate` gained a second device exclusion beside `Door`: a
`DeviceKind.CryoPod` with `IsOpen == false`. Before it, `CanDesignate(pod_ozawa, its Condition,
occupied)` returned **True** and `Designate` accepted it (driven, with a passing `Door` control at
False) — **one drag of the STRIP palette across the cryo bay permanently deleted seven of the eight
souls a won game ends with**, and paid 1 Part for it. There is no undo on any client surface and no
way to build a pod back.
The refusal is **silent**: it is E0-4 WP-7's trade again (§13.17) — the failure moved from
*expensive-and-visible* to *cheap-and-invisible*. The `blocked` channel is the surface that should
carry it; **filed, not fixed.** An OPEN pod is still strippable (empty furniture), and that control
is asserted, so the rule is about occupancy rather than about the kind.

**b. THE PODS STILL DO NOTHING.** No `CryoSystem`, no thaw command, no MOSS verb. `CryoPod` is a
prop with a Condition, a glyph pair (`'K'` occupied / `'k'` open — the first device whose glyph is
picked from STATE) and a power draw. **A pod that will not open is CORRECT today**; the thaw is W5.

**c. AND NOTHING REPAIRS ONE EITHER, DELIBERATELY.** `CryoPod`'s `maint` is **0**, the opt-out, so
`MaintenanceSystem` never targets a capsule. That closes a live defect rather than opening one: at
the first draft's `maint = 0.30` the four wrecked pods were the ship's lowest-Condition devices, so
the standing rule sent the lone pawn to nurse them with the opening's **entire** consumable stock —
driven, one unattended sim-day, first `Maintain` job at **tick 201**: Parts 1 → 0, Seals 2 → 0,
`pod_iqbal` 0.03 → 1.00, `pod_vance` 0.04 → 0.90, `pod_osei` 0.06 → 0.90. **Three of the four dead
sleepers stopped reading as dead inside a day, with no player input.** With `maint = 0` the same day
spends the same stock on ship plant (`wing_c` 0.06 → 0.99, `battery_2` 0.09 → 0.89, `light_reactor`
0.09 → 0.90) and all four capsules hold. ⇒ **Repairing a capsule is a player act.** The cost, stated:
a pod has no free-jury-rig band at all now, so W5 must supply the repair path along with the thaw.
`DefsParser` had to learn that `maint = 0` is an opt-out and not a threshold — its `fail <= maint`
clamp was rewriting this row's `fail` to 0 on every host that reads `machines.def`.

**d. ~~CONDITION IS INVISIBLE ON THE OVERVIEW, AND ONLY THERE.~~ ✅ CLOSED 2026-07-28 — the
wrecked-twin art join landed.** ⛔ The struck claim below — *"the `devices` channel carries `cond`
and no surface draws it, so the capsule **art** is identical at a healthy Condition and at 0.04"* — was true when
written and is **false now**. `client/src/items/wear.js` is the one seam between the channel's
condition byte and the 70 post-raid twins + 2 cryo capsules in `client/src/items/wrecked.js`; both
SVG surfaces route their tile art through its `buildTileItem(itemId, opts, cond)`
(`overview-scene.js:355`, `roomzoom-view.js:653`), so **a machine below `wear.wreck_threshold`
(0.25) wears its wrecked twin on both surfaces.** The threshold is mirrored from the def rather
than chosen (`wear.js:77`) and quantised to the wire's byte scale by derivation, never as a
literal (`wear.js:107`) — the art changes exactly where the *rules* change (jury-rig refused,
`Swarf` instead of `Parts`). The join is keyed on the **projected glyph**, not on the wire's
`kind` byte, because `DeviceKind → itemId` is **not a function** (`Door` is claimed by three
pieces, `CryoPod` by two — occupied and open), and not on a registry `kind` either (the sixth
trap shape, §13 and `CLAUDE.md`). The retained half of the original entry still stands: the
projection
already paints the four wrecked pods `GlyphColor.Broken`, and the Room Zoom draws the `Corpse` stack
**over** the capsule (`roomzoom-view.js:476` after `:444`), so at Level 2 the four deaths are on
screen. `overview-view.js` has no ground-item layer, so at Level 1 they are not — **the corpses
are still Level-2 only**; it is the capsule's own wear that now reads at both levels.

**e. THE SHIP FREEZES OUTSIDE THE CRYO BAY AND NO AUTHORED VALUE FIXES IT** — there is **no heater
device in the game**; a radiator can only take heat out. Measured in the ship's own header.

**f. ⛔ NOT REPRODUCED — a review figure of `Suffocation` 0.496 on day 7.** It was filed as a 0.8 %
margin against the day-1 test's `< 0.5` on a day nothing tests, which would have been worth acting
on. **Driven on the merged tree it does not appear at all**: seven sim-days, unattended, sampling
**every tick** and not only the day boundary, the lone pawn's `Suffocation` is **exactly 0.000
throughout** — and it is still 0.000 with `CryoPod`'s `maint` forced back to the pre-fix 0.30, so
this lane's own changes are not what removed it. `vent_cryo` and `scrubber_cryo` both stay
operational all week (0.43–0.60, riding the jury-rig sawtooth). ⇒ **Recorded as unreproduced, with
the instrument stated**, rather than repeated. Anyone who sees it again should say which tree and
which sampling.

**g. RECORDED, not re-driven by this lane.** The wreck inherits B-2's conjured water, and the
ledger counts the four corpses as **matter** (82 u includes 4). Both are review findings carried
forward; neither was re-measured here.

---

### 13.19 E0-6 conversion loss + `Seals` + the `ControllerModule` sink — what is wired but not connected (2026-07-27)

**Supersedes §13.15's table and cliff narrative; retitles §13.12.** Measured with
`dotnet run --project hosts/scenario -- occupancy --ship slice --days 3` and
`--ship grid --days 1`. **One seed, one run per leg, n = 1** throughout.

#### The replacement numbers

A1 is the harness's own `A1 (busy at sim-hour 24)` line, not the hourly curve's h24 bucket
(which is printed to 1 dp). "Last busy hour" is the last hour of the OPENING contiguous run with
work ≥ 5 %; the sporadic post-cliff maintenance spikes are not part of it.

| leg | A1 @ h24 (work) | throughput (`ControllerModule`) | mean work % h1–h28 | floor h29–h72 | last busy hour |
|---|---|---|---|---|---|
| pre-E0-6 (what §13.15 measured) | 24.979 % FAIL | 31 | 35.404 | 1.482 | h28 |
| **E0-6, no flags** | **0.000 % FAIL** | **11** | 18.900 | 0.902 | **h18** |
| E0-6 with the recycler ratio reverted | 24.979 % FAIL | 31 | 35.404 | 0.902 | h28 |
| E0-6 `--strip 40` | 28.771 % PASS | 19 | 29.779 | 2.577 | h32 |
| E0-6 ratio reverted, `--strip 40` | 37.368 % PASS | 51 | 40.864 | 12.975 | h49 |

End-of-run ground stock, slice, 3 days: `Corpse=1 Potato=699 ControllerModule=31` →
`Regolith=2 Corpse=1 Potato=699 Scrap=1 ControllerModule=11 Seals=12`.

**The regression is 100 % the recycler ratio, measured by isolation**: with `Regolith:1 → Scrap:2`
restored and every other E0-6 change intact, A1, throughput and the whole h1–h28 curve are
identical to pre-E0-6 to the digit. The `Seals` rung and the `ControllerModule` sink cost nothing.
Arithmetic predicts the sim to the unit: 31 × 0.375 = 11.6 → measured **11**; on `--strip 40`,
51 × 0.375 = 19.1 → measured **19**.

**It is not confined to the measurement fixture.** On **`--ship grid`, the ship `./play.sh` opens**,
`--days 1`: A1 **24.990 % → 0.000 %**, `Craft` **31.05 % → 15.35 %**, idle `None`
**67.15 % → 82.85 %**, modules 19 → 8, and **work stops after h16** — crew idle for the last third
of the day. Same isolation result: reverting the ratio restores `CLAUDE.md`'s published
deck-confined-wander figures exactly.

#### Wired but NOT connected

1. ~~**`CommissionDeviceCommand` has no affordance on the standard surface, and is INERT in every
   unattended run.**~~ ✅ **CLOSED 2026-08-02 by M3-17 — see §13.41.** The typed `commission` verb at
   the MOSS console is the sender; the command is reachable, priced at the real
   `build.def commission_cost = 1`, and answers with a rendered sentence either way. ⚠️ **Two halves
   of the original entry SURVIVE and are not closed by it**: (a) the `{"cmd":"commission",x,y,deck}`
   wire message routed through `GameSession.HandleCommission` is **still sender-less** — M3-17 added
   a MOSS op instead, because that path renders a verdict where the palette bridge writes only
   `_status`; (b) **it is still INERT in every unattended run**, since no pinned fixture types at a
   console, which is why M3-17 is pin-neutral. The original text read: *"Nothing in `sim/`,
   `client/`, `hosts/tui/`, MOSS or the designer-rule layer constructs it … what is missing is only
   the button."* The plumbing underneath was always covered
   (`ConversionLossSealsTests.TheHostItselfRebindsMoss_WhenADeviceIsCommissionedMidGame` drives the
   real `GameSession` → real `DeviceRegistry` path) — **the button was the whole gap, and it stayed
   open for a milestone.**

2. **`Seals` are a new terminal product one rung down — structurally the same defect this package
   removed.** You cannot make `Parts` without making `Seals` (the Fabricator's single bill emits
   both, and it must, because `CraftingSystem` resolves at ordinal 0 — §13.12). `Seals` have exactly
   one consumer, `MaintenanceSystem`, whose demand is bounded by machine wear. Measured: the
   ratio-reverted 3-day slice leg ends holding **52 `Seals` on the ground**, and the `--strip 40`
   leg 26. Nothing burns the surplus. **What would connect it:** a second `Seals` consumer, or
   E-PROD's bill selection so the Fabricator can be told to make Parts *or* Seals.

3. **The `Seals` rung is reachable only on a ship with no `Parts`, so its published rationale was
   about the wrong comparison.** `Parts` outrank `Seals` by tier, so the live comparison is
   **0.6-vs-0.9 (jury-rig vs seal), never 1.0-vs-0.9** — and against a jury-rig the rung makes
   maintenance recur **less**, not more. Measured on the slice: with the rung in and everything else
   reverted, **12 of 72 hours change, all post-cliff** — the h29–h72 floor falls
   **1.482 % → 0.902 %** (−39 % relative), `Maintain` **0.90 % → 0.55 %**, and the h62/h68 spikes
   (19.5 % / 6.4 %) vanish. That is the rung *working*: ten services that used to leave a machine at
   0.6 now leave it at 0.9, so the ship needs fewer of them. **`CLAUDE.md`'s E0-5 record publishes
   the 1.480 % floor; it moves.**

4. **`MetalOre` is still dead** — no producer, no consumer. **A6 goes 2 → 1, not 0.** `ECONOMY.md`
   §3.2 revives it in E3; E0-6 cannot.

5. **Two guards in `CommissionDeviceCommand` are unreachable and therefore untested**
   (`InBounds`, the nameless-device check): the host clamps every coordinate and every
   player-created device is given a deterministic name. Recorded, not covered — the same disclosure
   `MaintenanceSystem.RestoredCondition`'s unreachable fallthrough arm carries.

6. **The `DefsParser` fallback guard is narrower than it reads.** Omitting `production.def`
   entirely now keeps the compiled defaults, but a defs set that declares an **empty**
   `[production]` section still empties the table and falls back to `[recipes]`. E0-6 therefore
   moved the legacy `Recipes[SalvageRecycler]` row to `Regolith:4 → Scrap:3` as well, so both
   spellings of the recycler agree; without that, the mass creation stayed reachable one branch
   away from the fix that removed it.

---

### 13.23 W4b (the air split off ＋ADD ROOM) + the OPERATE verb — what is wired but not connected (2026-07-28, reconciled 2026-07-29)

The lanes that made air a thing the player earns rather than names. Everything here was measured
by driving a ship, and each item is a **live** hole in the shipping game, not a latent one.

> ⚠️ **READ WITH §2 "A room is not allocated — it is DERIVED".** W4b split the AIR off the ＋ADD
> ROOM verb; **M1-L then deleted the verb and M1-L-b the command behind it** (OD-K, 2026-07-29).
> The mechanisms measured below are unchanged — they are facts about gas, fog and devices, not
> about the verb — but every sentence that says "allocate" or "＋ADD ROOM" describes a gesture the
> player no longer has. Item **c** already carries its own CLOSED marker, and item **f** is
> corrected in place below.

**a. ⛔ `W4b-DEAD-DECK` — THE SIM HAS NO VERTICAL GAS TERM, SO A DECK WITH NO VENT CAN NEVER BE
PRESSURISED.** The mechanism is §3 "Gas is SAME-DECK ONLY" — four independent planar paths, all
cited there, none of which is a tuning value. The consequence is not slowness, it is
**impossibility**: `--ship wreck` authors exactly two `AirVent`s and **both are on deck 0**
(`AuthoredShips.cs:1994-1995` `vent_cryo`, `:2118-2122` `vent_ls`; the plan runs `1888`→EOF), so all
eight deck-1 halls, **allocated and with their doors opened, peak at `0.000` kPa over 20 000
ticks.** No amount of OPERATE fixes it, because the verb only opens edges and there is no edge to
open (the "allocated" in that measurement is now moot — M1-L-b deleted the verb; the eight halls
are rooms whatever anyone does, and they still peak at `0.000` kPa).
⚠️ **W4b did not create this — `＋ADD ROOM`'s free pressurisation was HIDING it**, and that
is why deleting a wand exposed a hole rather than digging one. **The owner's decision is to ship
it filed.** The three ways out (author a deck-1 vent · add a vertical transport term · accept the
dead deck) are all content/design calls. ⛔ **Do NOT close it by re-pressurising in
`AddRoomCommand`** — that is precisely the wand W4b deleted on a binding owner decision, and
M1-L-b has since deleted the command it would have been re-added to.

⭐ **THE OUTCOME, 2026-07-31 — WAY ONE IS AUTHORED; WAYS TWO AND THREE ARE STILL REFUSED.**
**OD-M item 2 amends OD-E's headline** to *"deck 1 boots dead and the player may bring it back;
the sim still has no vertical gas term"* — so the paragraph above is now a statement about the
MECHANISM (still true and still binding: gas is same-deck only, and nothing here adds a term) and
no longer about the ship. **M3-11 authors `vent_d1`** in `hall_d1_s0` at `(10,1,1)`, directly above
`vent_cryo` — `AuthoredShips.cs:2165-2170` for the device, `:1726-1805` for the rationale, and its
single surviving riser tap is the one exemption inside `WreckCutDeck1Risers` (`:2452-2515`). The
wreck now authors **three** `AirVent`s, one of them on deck 1. ~~It is authored **WRECKED (0.06,
below `AirVent`'s `fail` of 0.10)**, so the halls still read `0.000` kPa at boot and the act that
opens the deck is a REPAIR.~~ ⭐ **RE-AUTHORED 2026-08-01 BY M3-16 (OD-O) — THE HALLS STILL READ
`0.000` kPa AT BOOT, FOR A COMPLETELY DIFFERENT REASON, AND THE ACT THAT OPENS THE DECK IS NO
LONGER A REPAIR.** The vent is now **`Condition = 0.62f, Rate = 0f, Faulted = true`**: mechanically
sound, open, powered, **operational** — and injecting nothing, because `EffectiveRate` is zero. The
act that opens the deck is a **two-line MOSS program**; §13.34 is the mechanism, and the deck-1 air
path is now SHIPPED rather than blocked. Driven both ways in
`tests/Perilune.Tests/Deck1VentTests.cs` (dead after 3 000 unattended ticks *with the vent
operational*, asserted as a stated premise so the leg cannot pass for the pre-OD-O reason; ≥ 80 kPa
and `CanStageWorkerAt` TRUE 3 000 ticks after **something holds the rate**, with a second deck-1
hall still at `0.000` as the mechanism control; and a repair alone changing **nothing**).
⛔ **AND THE PLAYER CANNOT PERFORM THAT REPAIR YET. TWO BLOCKERS, IN THIS ORDER — driven on the
M3-11 tree, FILED, not fixed.**

**1. REACHABILITY, and it is completely silent.** Every deck-1 hall door boots SHUT
(`SlotGridPlanner.Carve`'s derived rule) and OFF-NETWORK, and `Simulation.IsWalkable:155` refuses a
shut door tile — so at boot **there is no path into `hall_d1_s0` at all**. Measured: `door_d1_s0`
(5,7,1) `IsOpen=false` / `NetworkId=0` / `IsWalkable=false`; `FindPath` to the tile beside the vent
FALSE while the control path to the deck-1 ladder head is TRUE (so it is the door, not the ladder).
⛔ `PrioritiseJobCommand` **accepts the order anyway** — `TryFindStagingTile` asks whether the
staging tile is walkable and survivable, never whether it is *reachable* — setting
`JobKind=Maintain` and `HeldByOrder=true`; the job then evaporates in
`MaintenanceSystem.DriveWorker`'s abandon path. 20 000 ticks later she is alive on deck 0,
`JobKind=None`, zero work ticks served, the vent still 0.06. **No badge, no dock row, no movement.**
The player must first open `door_d1_s0` by hand — `SetDoorStateCommand` has no power gate, so an
off-network door still opens (measured).

**2. SURVIVABILITY, once the door is open.** `wear.maintenance_work_seconds` is 900 s (9 000 work
ticks) against `needs.suffocation_per_second_vacuum` of 1/90. Driven, door opened first and then
ordered: she crosses, reaches deck 1, takes the service and is **dead at tick 1 341** (~134
sim-seconds), the vent still at 0.06.

⚠️ **The M3-11 charter's acceptance script has its steps in the wrong order** — the hall door must
be opened BEFORE the repair order, or the order lands in blocker 1's silence.

⚠️ **Only one half is beyond authoring.** Survivability is: every deck-1 tile is vacuum, so no
geometry puts a breathable staging tile beside this machine (it needs a suit, a shorter or
segmented service, or relayed servicers). **Reachability is not** — authoring `door_d1_s0` open via
`SlotAssign.DoorOpen`, or exempting its riser tap too, are choices inside `AuthoredShips.cs`, and
both are **owner calls left open**: the first moves the wreck's "no open door faces vacuum at boot"
invariant, the second moves the tap census.

⭐ **OUTCOME 2026-07-31 — BOTH BLOCKERS ARE ANSWERED, BUT NOT IN THE SAME WAY, AND THE DIFFERENCE
IS THE POINT.** Two owner decisions taken the same day supersede the "owner calls left open" above;
the authoring options named in that paragraph were **not** the route taken.

- **BLOCKER 1 (reachability) is ANSWERED AS A MECHANISM by OD-N** (`ROADMAP.md` §5 row N) — **and it
  is not `vent_d1`-specific.** Doors and vents are actuated through **MOSS only** (the Room Zoom's
  direct OPERATE click is removed for both), and the ⭐ **SPLIT GATE** opens the **MOSS console**
  (manual actuation, one command at a time) as soon as `term_moss` is **REPAIRED**; commissioning
  gates *programs and the pod bay*, not the console. ⇒ **A repaired console opens ANY named door on
  the ship remotely**, so *every* machine behind a shut door — not just this one — stops being
  unreachable by geometry. Package **M3-15**, queue position **6b** — ✅ **SHIPPED 2026-08-01; the
  mechanism is live and recorded in §13.31.** ⚠️ The reachability sentence above is now literally
  true rather than planned: the console really does open a named door, and the corrected gate term is
  `Condition >= maintain` (0.20), not `>= fail` — `term_moss`'s authored 0.14 clears `fail` at boot,
  so the chartered term would have shipped the gate OPEN and delivered nothing.
- **BLOCKER 2 (survivability) is DISSOLVED FOR `vent_d1` ALONE by OD-O** (§5 row O), and this half
  is authored content, not a mechanism. The vent is re-authored **mechanically fine** — `Condition`
  above `AirVent`'s `fail` of 0.10 — with a **dead control board**: the direct actuation refuses
  with an authored story reason (`CONTROLLER FAULT — BOARD UNRESPONSIVE`) and the workaround is a
  MOSS **program**. **No crewed repair is needed, so nobody has to cross deck 1 at all** and the
  900 s-against-suffocation arithmetic above simply does not arise here. Package **M3-16**, queue
  position **8b** — ✅ **SHIPPED 2026-08-01; the mechanism is live and recorded in §13.34.**
  ⚠️ **The chartered half-sentence "re-authored mechanically fine" turned out to be TWO edits and
  the second is the one that matters:** raising `Condition` alone makes the upper deck breathe at
  boot with no player action at all, because `AtmosphereSystem`'s injection branch asks exactly
  `IsOpen && Powered && IsOperational` and all three then hold. The vent is also authored
  **`Rate = 0f`**. ⭐ **THE DEAD DECK IS THEREFORE NO LONGER A KNOWN LIMIT AT ALL:** with both
  blockers answered, `hall_d1_s0` has a SHIPPED path to breathable air that a player can walk —
  repair the console, fit a module, write two lines — and it is the first deck-1 compartment that
  ever has. The other seven halls have no vent and are still `0.000` kPa forever; `W4b-DEAD-DECK`
  is unchanged about the MECHANISM (gas is same-deck only) and now has exactly one authored
  exception on the shipping ship.

⛔ **SO THE CLASS IS HALF OPEN, AND THAT IS THE PRECISE STATEMENT.** Reachability is closed
generally: a repaired console reaches every door. **Survivability is not** — OD-O ships **exactly
one** authored instance and the owner said so explicitly (*"not a pattern for all devices — it's an
idea we can apply sometimes as a game element"*). The next machine that needs a **crewed** service
in vacuum has blocker 2 again, undiminished, and **that stays an owner call**. ⚠️ **AND THE BEAT
MOVES**: under OD-N installing a program needs the **COMMISSIONED** terminal, so deck-1 air becomes
a **POST-COMMISSION** beat — after the frontier, the benches and the `ControllerModule` — not part
of the opening.

**b. A BUILD GHOST DRAWS WHERE ITS REASON CANNOT — the `designs`/`blocked` fog asymmetry.**
`BuildDesigns` (`hosts/web/GameSession.cs:1715-1729`) walks `BuildSystem.Pending` and emits every
site with **no fog gate at all**. `AddIfBlocked` — the single gate through which every `blocked`
row passes — **is** gated on `TileFlags.Explored` (`GameSession.cs:2311`). A freshly allocated
vacuum compartment is, in the normal case, one no crew member has ever entered — that is the
premise — so on its tiles the player sees **their own build ghost sitting there doing nothing,
with the channel that would say why deliberately silent.** Dig and strip fail the *opposite* way and are therefore self-consistent: `BuildMarks`
is fog-gated too (`GameSession.cs:2053`), so the order and its reason vanish **together**. ⇒ The
natural player order on the wreck — *allocate → paint → wonder why nothing happens* — is exactly
the order in which the channel is silent. Not fixed; the fix is a decision about which side moves
(gate `designs`, or ungate `blocked`), and both are fog-of-war changes.

⚠️ **AMENDED 2026-07-29 — THE ASYMMETRY IS STILL REAL BUT IT IS NO LONGER REACHABLE ON THE SHIPPING
SHIP.** The paragraph above is kept unedited because its mechanism is unchanged and it is still live
on `--ship grid` / `slice` / `perilune`. What changed underneath it is **M1-1 (OD-C, item c below):
`--ship wreck` now boots with `fogTiles = 0` of 1 620** — measured after a full `GenSimHost` boot,
both ways in the same tree: flipping `InteriorKnownAtBoot` back to `false` gives **1 104** — so
`AddIfBlocked`'s early return on unexplored — and `BuildMarks`' gate at `GameSession.cs:2053` — can
no longer fire anywhere on that ship. **DRIVEN, not read off the code** (the wreck, the then-live
`AddRoomCommand` + real `DesignateBuildCommand`, payloads read off `GameSession.Snapshot()`;
M1-L-b has since deleted that command, which changes the recipe and not the result — the
allocation only set an anchor's `RoomType`, which no fog, gas or build term reads):
allocate deck-0 slot 1 `hall_d0_s1` ⇒ the room is airless (`0.000` kPa, `IsBreathable` false, i.e.
＋ADD ROOM conjured nothing even then); paint a wall at `(12,1,0)` ⇒ the tile reads `Explored = true`,
`designs` carries `[[12,1,0,0,0,2,0]]` **and `blocked` carries `[[12,1,0,2,0]]` — order 2
(`OrderBuild`), reason 0 (`ReasonAir`).** ⇒ **The ghost and its reason now draw together on the
wreck.** This is the **eighth trap shape** in the small: item b was true of the tree it was written
against and went stale the moment a sibling lane landed — *a statement about a TREE, which a merge
changes.* `docs/HANDOVER.md`'s **W4b-BLOCKED-FOG** needs the same amendment.

**c. ~~THE PREMISE'S OPENING MOVE IS STILL UNREACHABLE — `vent_ls` is never explored.~~ CLOSED
2026-07-29 by M1-1 (OD-C).** *The struck text is kept because the mechanism it names is still the
mechanism, and because it records what the owner decided between three options.*

~~The vent authored *inside* wreck `hall_d0_s3` — the one the wreck start's fiction points the
player at — reads `Explored = false` at tick 0, tick 600 **and tick 36 000 (a full sim-hour)**. It
therefore never reaches the `devices` channel, gets no OPERATE chip, and is **honestly** refused by
the host's own fog gate rather than dishonestly accepted. Its slot is also authored **unnamed**, so
`roomTileRect` cannot resolve it and the Overview opens the ＋ADD ROOM picker there instead of a
Room Zoom. ⇒ **The only operable vent a player can reach on `--ship wreck` today is `vent_cryo`.**~~

**OD-C, taken:** *"the wreck's own interior — layout and machines — is authored-explored at boot.
You woke up on your own ship; its hold is on file."* Sensor/MOSS reveal was ⛔ **rejected** (it puts
the premise's first action behind a repair the player may not be able to reach) and so was
line-of-sight-through-doors (most work, still leaves sealed compartments unknowable).

**As implemented, both halves, because the fog fix alone is not sufficient:**
- `ShipPlan.InteriorKnownAtBoot` (`ShipPlan.cs`), applied in `ShipPlanBuilder.Build` — every
  non-`Void` tile of every deck boots `Explored`. **`ExplorationSystem` and `FogReveal` are
  UNTOUCHED**: the first is crew vision and could never have reached a compartment nobody can enter,
  the second reveals what the crew can *reach*. All three only ever SET the bit, so they compose.
  **The wreck is the only ship that opts in**, pinned by
  `InteriorKnownAtBootTests.NoOtherAuthoredShip_OptsIn_AndTheirFogSurvivesTheBoot` with an inclusion
  control that forces the flag on and requires the census to see it.
- Wreck deck-0 slot **3 is now the named room `lifesupport`** (`RoomType.LifeSupport`), so
  `roomTileRect` resolves it and the Overview opens a Room Zoom. **Its door is held SHUT** through the
  new `SlotGridPlanner.SlotAssign.DoorOpen` override — `Carve` otherwise derives a typed slot's door
  as OPEN, and **the compartment would then have filled ITSELF, deleting the pressure loop `vent_ls`
  exists for.** ⚠️ **The mechanism is DIFFUSION, not a room merge, and an earlier draft of this
  bullet said "joined the compartment to the pressurised spine and handed it 101 kPa free" — wrong
  in both the mechanism and the timing.** Rooms never merge across a door (`RoomState` marks the
  door tile `DoorMarker`), so with the door open the **boot census is byte-identical**: slot 3 is
  still its own 60-tile room holding **0.0 mol**, and `RoomState.Pressurize("wreck_spine_0")` cannot
  reach it. What fills it is **B-3's `AtmosphereSystem.DiffuseAcrossDoors`** (§3), out of the spine
  and the reactor bay. **Measured with the override dropped, driven, no player input:** `0.000` kPa
  at tick 0 · `14.459` at 100 · `52.998` at 600 · **breathable at tick 1 450** (~2.4 sim-minutes;
  ppO2 crosses `hypoxia_ppo2_kpa` = 16) · `90.042` at 3 000 · `101.302` at 20 000. The conclusion is
  unchanged and slightly worse — the bay breathes itself open in under three sim-minutes — but *at
  tick 0 the two trees agree to the mole*, which is why the guard asserts the **door**, with the gas
  as a separate leg carrying its own separate mutation. **As shipped the compartment is still
  airless and the frontier has not moved.**

**Measured in the running game** (`client/tools/operate-shot.mjs --tile 35,6`, real pointer clicks on
the shipped DOM): deck-0 devices on the `devices` channel **38 → 49**; enterable deck-0 rooms
**2 → 3**; `vent_ls @ 35,6` now reads `cond=38 oper=1 open=0` on the channel, its Room Zoom carries a
`SHUT` chip, and a click toasts **`⇄ OPEN AIRVENT`** and flips the chip to `OPEN`.

⚠️ **UNDISCLOSED PLAYER-VISIBLE CONSEQUENCE, FILED FOR THE OWNER AND DELIBERATELY NOT PATCHED HERE:
`LIFE SUPPORT` NOW READS AS BREATHABLE ON THE OVERVIEW.** Naming slot 3 makes it draw as a lit,
warm-floored, labelled room — **pixel-for-pixel like `CRYO BAY` and `REACTOR`, the two compartments
that really do hold air** (see `docs/design/shots/m1-1-2-AFTER-overview.png`). The Level-1 Overview
carries **no vacuum indication at all outside the `2 PRES` lens**, so on the default view nothing
distinguishes the ship's one named-but-airless room from its two named pressurised ones. On the ship
whose core loop *is* a pressure frontier this is the wrong first impression, and unlike an allocated
hall — which the player chose to create having just been shown it is empty — **it is the player's
FIRST impression, not something they made.** Every candidate fix (a vacuum tint on the default
Overview, a pressure badge, an `unpressurised` room-chrome state) is new visual vocabulary on the
standard surface, i.e. an art decision. **Owner call, not an agent's.**

⚠️ **CONSEQUENCE, NOT A REGRESSION, AND WORTH STATING: deck 1's machines are now visible too**, on
the deck that `W4b-DEAD-DECK` proved can never hold air. The owner's decision on that defect was
*"ship it filed, visible in play"* — this makes it more visible, not less true. ⭐ **Amended
2026-07-31 (OD-M item 2 / M3-11):** the deck can now hold air after one repair, and one of the
machines the player sees up there is the vent that does it — see §13.23a's outcome block.

⚠️ ~~**The remaining five deck-0 halls are visible but still not ENTERABLE**: their machines now draw,
their slots still have no `anchorName`, and ＋ADD ROOM remains the path to naming them. Only slot 3
was in M1-1's charter.~~ **CLOSED 2026-07-29 by M1-L (OD-K).** `GameSession.ResolveSlot` lost its
`if (a.Type == RoomType.None) continue;` gate, so occupancy is GEOMETRY: all five halls now leave
the host `occupied` and carrying their own `hall_d0_sN` anchor, which is what `roomTileRect`
resolves, so they are enterable. **They are still UNTYPED and that is deliberate** — M1-L makes a
compartment visible and enterable, it does not invent a purpose for it — so the Overview captions
them from the anchor. There is no "path to naming them" any more: M1-L-b deleted the verb, the
command and the enum member, and a room type is authoring-only (§2). Driven by
`EveryCompartmentIsARoomTests.Wreck_EveryDeck0CompartmentLeavesTheHostOccupiedAndNamed`.

**d. A BUILT DOOR STILL HAS NO REMOVAL VERB ON ANY SURFACE** (pre-existing, unchanged by these
lanes, and now more visible because a door is finally a thing the player *touches*).
`DeconstructSystem` refuses `DeviceKind.Door` outright (`DeconstructSystem.cs:378`, with the
legality restated at `:212`), and no client surface offers any other way to take one down. You
can build a door, you can open and shut it — you cannot remove it.

**e. THE OPERATE VERB IS A ONE-SHOT REPLY, NOT A CHANNEL, AND THAT IS A DESIGN LIMIT.**
`hosts/web/WireFormat.Operate.cs` answers a click and is never cached — it is a direct answer to
an action, not a fact about the world. So the refusal and its advisories are readable **only at
the instant of the click**; nothing on either surface says "this vent is wrecked" until you try
it. The standing facts *do* reach the client on the `devices` channel, which gained a **7th tuple
element `open`** (`Device.IsOpen` as 1/0) in the same run
(`hosts/web/WireFormat.Devices.cs:218,257`) — but `oper` and `open` are drawn only inside the
OPERATE overlay, and only while the tool is armed. ⚠️ **`open` had to be added to the channel's
dirty-version gate by hand at the merge** (`DeviceCell.SameAs`, `WireFormat.Devices.cs:272-281`;
the gate itself is `GameSession.SendDevices`, `:1586-1595`): the gate skips serialization when
the cell list is unchanged, and a door toggle moves **only** `open`, so without that clause a
player's own toggle would silently freeze the OPEN⇄SHUT chip. Two lanes added `Open` and `SameAs`
independently and **git reported no conflict** — see `HANDOVER.md`'s eighth trap shape.
⭐ The tuple has since grown three times more, each under the same same-commit rule: `serv` (8th,
M3-13 — *"the Prioritise menu no longer offers a repair the sim will never take"*), `air` (9th, D4)
and `spend` (10th — **§7**, *the order names its price*). ⚠️ **D4's `air` element has no section of
its own in this file yet** — filed, and not written by the `spend` lane.

### 13.24 M2-8 pre-emption is LIVE in the sim and INVISIBLE in play until M2-19 (2026-07-30)

The mechanism is §6.2b and it works: a strictly better-banded job takes a busy pawn back in one
tick, and eight named mutations were physically applied to prove each half of it
(`tests/Perilune.Tests/PreemptionTests.cs`, table in the fixture header). What is NOT there:

**a. ⛔ THERE IS NO BROWSER DEMO, BY CHARTER, AND A REVIEWER MUST NOT ACCEPT ONE.** M2-0 measured
the pre-empted pawn being **re-claimed by `MaintenanceSystem` within the same tick** — idle 11
ticks of 30 000. On screen, a pre-emption that lands and one that does nothing look identical.
⚠️ Note what that measurement is and is not: it is about *"that machine, now"* — a **HOLD**, which
nothing in the sim expresses. It does NOT apply to the band case this package ships, because M2-5's
push gate refuses the re-claim whenever the better-banded work is real. The acceptance for M2-8 is
therefore the driven suite, and the demo waits for the STICKY CLAIM (**M2-19**).

**b. ~~`Citizen.HeldByOrder` is written by nobody and read by nobody~~ — CLOSED, in two halves
(2026-07-30).** M2-19 gave it a reader (`Citizen.IsRecruitableIgnoringJob`, §6.2c) so the sim can say
"keep this crew member on this job"; **M2-9 gave it a writer** (`PrioritiseJobCommand`, §6.2d). What
remains is the right-click that sends the order — M2-10, §13.25.

**c. THE OFFER QUERY IS OPTIMISTIC AND A PRE-EMPTION CAN THEREFORE BE WASTED.** `HasClaimableWork`
stops short of the A* (`IWorkOfferSource`'s declared one-sided contract), so a pre-emption whose
better-banded claim then fails leaves her idle for a tick and she re-takes the lower-banded job.
Bounded by M1-H's per-tile / per-device 5 s backoff rather than eliminated; not observed in any
fixture, filed because it is a real shape and not a hypothetical one.

**d. A PAWN WORKING A TYPE THE PLAYER HAS SINCE SWITCHED OFF IS NEVER PRE-EMPTED.** Her band reads
`Off`, and the predicate refuses (§6.2b step 3). She finishes and then waits, which is M2-2's
decided behaviour — recorded here because "switch it off and she stops" is a reasonable thing for a
player to expect and it is not what happens.

### 13.25 The direct order is LIVE end to end EXCEPT the click (M2-19 + M2-9, 2026-07-30)

The mechanism is §6.2c + §6.2d, driven and pinned (`StickyClaimTests` 11 legs,
`PrioritiseOrderTests` 14). What is NOT there:

**a. ⭐ CLOSED (M2-9). `Citizen.HeldByOrder` HAS A WRITER** — `PrioritiseJobCommand`, composing
**the job first, the bool second** exactly as this entry said it must. `StickyClaimTests`' `Hold()`
fixture stages the same order by hand and is now a mirror of a real writer rather than of a planned
one.

**b. ⛔ NO PLAYER CAN SEND THE ORDER YET, AND THIS IS THE ONLY THING BETWEEN THE MECHANISM AND THE
PLAYER.** The sim verb, the wire kind (`prioritise`), the host bridge and the refusal badge are all
live and tested; the right-click *"Prioritise: repair"* that emits the message is **M2-10**, which
also names `OrderRepair` on the client (until it lands, the badge reads *"ORDER BLOCKED — NO PARTS
OR SEALS ABOARD"* rather than *"REPAIR BLOCKED — …"*, via `decodeBlocked`'s unknown-order path).

**b2. ⚠️ ONLY THE WRECK RULE REACHES THE PLAYER.** The order's other refusals — incapable, nothing
to service, nowhere to stand, a machine somebody else is already fixing — are **silent**,
the same shape §13.21 records for `CanStageWorkerAt`. A player who orders a repair that is refused
for any of those four reasons sees exactly nothing. Named here rather than fixed: the surface that
would say it is M2-10's, and the ladder that would rank the reasons is a package of its own.
⭐ **M3-14 AMENDS THE THIRD REASON, AND WHAT THE WRECK RULE ANSWERS — not the silence.** The third
used to read *"nowhere survivable to stand"*; since `PrioritiseJobCommand` passes `forced: true`
(`Commands.cs:286`) an order waives the AIR question entirely, so what is left to refuse is the
**geometry** — no walkable tile beside the machine — and that refusal is still silent. ⚠️ **And the
one refusal that DOES reach the player changed its MEANING**: `IsUnfixableWreck` is asked
`forced: true` as well (`Commands.cs:297`, and the badge walk at `GameSession.cs:3181`), so the
headline above now means *"only the ship's-stock rule reaches the player"* — a Parts stack behind the
pressure frontier no longer reads as NO PARTS.

**b3. ⭐⭐ D5 (2026-08-03) — THE ACCEPTED-THEN-SILENTLY-DROPPED ORDER, DIAGNOSED AND SURFACED. The
worst case of b2's silence was never one of its four reasons: it was an order the command ACCEPTED
and a system downstream then ate.** Reproduced headlessly on the shipped wreck, unmodified, from the
2026-08-03 browser sighting:

- **`fabricator_1`** (24,2,0) in `hall_d0_s2`. Staging tile `(25,2,0)`, from
  `MaintenanceSystem.TryFindStagingTile(forced: true)` — the same call `PrioritiseJobCommand` makes
  (`Commands.cs:335`) and `MaintenanceSystem.DriveWorker` makes on every tick she carries the order
  (`MachineWearSystem.cs:318`). That tile is **walkable and (forced) survivable but NOT REACHABLE**:
  `door_d0_s2` (27,7,0) boots SHUT and since OD-N doors are actuated through MOSS only.
- ⛔ **`TryFindStagingTile` asks walkable + survivable and NEVER asks reachable** (`:1148-1160`), so
  the order is accepted, `JobKind = Maintain`, `HeldByOrder = true`.
- She then walks **5 sim-seconds** to the NEAREST Parts stack — a `cabin stores` crate at (3,6,0);
  tier before distance, so Parts is chosen over the 8-Seals locker beside it — and the instant she
  stands on it `DriveWorker`'s
  **pickup branch** re-asks `FindPath(worker → staging)`, gets false, and calls `Abandon`
  (`MachineWearSystem.cs:464`, whose comment *"unreachable from here — retried from ground truth next
  second"* is true of the AUTONOMOUS path and false of an order). `Abandon` → `JobKind = None` → the
  setter clears `HeldByOrder` → **the order is gone**. Measured: taken tick 1, dropped **tick 51**,
  machine untouched, nothing on any surface.
  ⚠️ **D7 (2026-08-03) SHORTENED THIS ROUTE AND THE NUMBERS ARE RE-MEASURED, NOT ADJUSTED.** This
  line read *"walks 17 sim-seconds to the ship's one Parts stack at (7,14,0) … dropped tick 171"*,
  true while the reactor bay held the only Parts aboard. The `cabin stores` cache puts seven
  one-unit Parts crates at (2..8, 6, 0) and she wakes at (3,1,0). Driven as a 2×2, the cache the only
  difference: **with it, tick 51 at (3,6,0); with the crates removed, tick 171 at (7,14,0)** — the
  old trace reproduced to the digit. The diagnosis is unchanged; only the walk is. ⛔ Neither number
  was ever asserted — both lived in prose here and in `DroppedOrderTests`' header, so the gate stayed
  green while they went stale.
- **CONTROLS, DRIVEN.** Strip every consumable ⇒ the drop moves to **tick 1** at her boot tile (the
  below-wreck-floor arm, `:479`) — a different site, so the baseline is not that one. Open
  `door_d0_s2` alone ⇒ the identical order is taken and driven to the worksite (she reaches (25,2,0)).
  Of the eight deck-0 spine doors, that one alone restores the route.
- ⛔ **IT IS NOT "GEOMETRY-SPECIFIC" AND IT IS NOT FLAKY — IT IS REACHABILITY, AND IT IS
  DETERMINISTIC.** T13 (2026-08-02) recorded no-repro on five direct orders because every machine it
  ordered was in the boot-breathable core, or was ordered *after* the MOSS console had opened the
  hall doors. D5 fires exactly when the ordered machine's staging tile is in a different connected
  region from the ordered crew member.
- **THE FIX IS THE SURFACE, NOT THE BEHAVIOUR** (`rimworld-reference.md` §2.2: *"RimWorld's answer to
  an impossible order is a refusal at the point of the click … It does not accept the order and then
  fail silently"* — flagged there as **the single most transferable fact in §2 for Perilune**). §2.2's
  pinned ruling stands, so the order is still accepted; what changed is that the machine wears
  **`WireFormat.ReasonNoRoute = 5`** on the shipped `blocked` channel (client sentence **NO WAY TO
  WALK TO IT**) from the frame after the click, **and keeps it after the sim drops the job**. Emitted
  by `GameSession.OrderedWorksiteIsOutOfReach` / `AddNoRouteRow`, live and never latched, ordered
  machines only. Instruments: `DroppedOrderTests` (**16** legs since the follow-on, driven on
  `--ship wreck`) + `client/tools/dropped-order-shot.mjs`.
- ⛔⛔ **THE RESIDUAL THAT STOOD HERE — `:464` ONLY WHEN THE ROUTE IS SHUT AT ISSUE TIME — IS CLOSED
  BY THE D5 FOLLOW-ON (2026-08-03), FROM THE SIM SIDE, AND THE OLD SENTENCE IS KEPT BECAUSE IT IS THE
  DIAGNOSIS.** What was wrong: if the route was open when the order was given and closed DURING it,
  the order died at the very same arm and **nothing was said**. Driven on the shipped wreck: open
  `door_d0_s2`, order `fabricator_1` ⇒ taken at tick 1, and the first render **retires the pending
  record** (arm (1) — the held job is the order from then on, so `blocked` is `cells:[]`). Shut the
  door at tick 41 ⇒ she is dropped at **tick 171** at (7,14,0), the identical pickup branch, with the
  channel still **empty**. Structural, not a missing predicate: once the record is retired there is
  nothing left for the render to re-ask about.

- ⭐⭐ **b3′ — THE FIX: THE SIM SAYS WHY IT LET GO (D5 follow-on, 2026-08-03).** The ruled shape was
  the second of the two offered: **the SIM emits a drop reason and the host reads it**, which covers
  all nine arms at once instead of patching one.

  - **`MaintenanceSystem.Abandon` is the ONE funnel** every one of `DriveWorker`'s **NINE**
    `Abandon` call sites goes through (`:321 :333 :343 :419 :428 :466 :471 :481 :502` — re-counted in
    this tree AFTER the edit. ⚠️ The diagnosis above names the pickup branch `:464`, which was its
    line BEFORE this package put a two-line comment over it: same arm, moved number. The COUNT is the
    load-bearing part and it is what is pinned, by
    `DroppedOrderTests.DriveWorkerHasNineAbandonArms_AndEveryDropReasonIsUsedByOne`, which counts CALL
    SITES rather than trusting any table, with a commented-out-code control).
    It now takes a **`JobDropReason`** with **no default value**,
    so the compiler — not a test — is what stops a tenth arm shipping mute.
    ⛔ **ONE KNOWN EXCEPTION, NAMED because "the ONE funnel" reads as complete and is not:**
    `DriveWorkers` at `:207` calls `AbandonOrphan` **directly**, bypassing `Abandon`, when the ordered
    machine has been deconstructed mid-service — so that path publishes nothing and a player's order
    dies there silently as well. Defensible rather than accidental (the badge's site is the machine's
    tile and there is no machine; the host's walk independently drops a record whose device no longer
    resolves), and censused rather than assumed: `AbandonOrphan` has exactly two callers, `:207` and
    the funnel. Six reasons for nine arms;
    the arm→reason table lives on the enum in `sim/Sim.Core/Events/SimEvents.cs` and the two collapses
    (`:343`/`:419` cargo, `:428`/`:466`/`:502` worksite route) are argued there.
  - **`OrderDroppedEvent`** (Pos = the DEVICE's tile, DeviceId, CitizenId, Reason) is published there
    **only when the job was `HeldByOrder`** — the hold IS the order. The dispatcher's own abandons are
    the ordinary case (M1-H's backoff funnel exists because of that thrash) and would be an unbounded
    per-tick stream for a reader that wants the rare one. ⚠️ **The hold is read BEFORE
    `AbandonOrphan`**, whose `JobKind` setter releases it; a publish written after that line reads
    `false` every time and the channel is permanently empty — a mutation that was run and reddens
    **6** legs (re-measured; the "5" first written here predated `DroppedOrderTests`' purity leg).
  - **TRANSIENT.** Not saved, not folded into `StateHash`, no def field, no `IStatefulSystem`. That is
    deliberate and it is the chronicle-signal lesson: a transient event folded into a hashed,
    never-evicted field is what broke save/restore that lane (CLAUDE.md's pin block).
  - **Host: `GameSession.NoteDroppedOrders`, called from `AdvanceTicks`, NEVER from `Render`.** The bus
    is double-buffered and swaps at the end of every tick, and the run loop advances up to
    `MaxTicksPerFrame` ticks between renders — a render-side read loses a one-tick event outright
    (mutation run: moving the call into `BuildBlocked` reddens **6** legs, re-measured). It files into `_dropped`
    (crew id → device id + reason), host-side render scratch exactly like `_prioritised`.
  - ⭐ **ONE SURFACE, NO DOUBLE-BADGING: a LIVE PENDING RECORD ALWAYS WINS.** `NoteDroppedOrders`
    files nothing while `_prioritised` holds that crew member, and `HandlePrioritise` clears
    `_dropped` for her. The two maps are therefore disjoint by construction and describe the two
    halves of an order's life. In the ISSUE-TIME case the pending record is never retired (the
    no-route question is asked before the taken-retire rule), so it owns the badge from the click
    through the drop and `_dropped` stays empty — pinned by
    `TheIssueTimeBadgeOWNSTheMachine_TheDropFilesNothingBehindIt`, on the RECORD count, because both
    emitters dedupe per order+tile and a duplicate record would be invisible on the wire until the
    day one cleared and the other did not.
  - ⭐ **THE RULE FOR WHETHER A DROP GETS A ROW, and it is one sentence: a dropped order is badged if
    and only if the host can RE-ASK THE SIM'S OWN KILLING QUESTION, LIVE.** Three of the six qualify,
    each a call into `MaintenanceSystem`, so the badge and the executor cannot disagree:

    | `JobDropReason` | arms | live re-ask | row |
    |---|---|---|---|
    | `NoRouteToWorksite` | `:428 :466 :502` | `OrderedWorksiteIsOutOfReach` (TryFindStagingTile + FindPath) | `ReasonNoRoute` — NO WAY TO WALK TO IT |
    | `NoWorksiteTile` | `:321` | `!TryFindStagingTile(forced: true)` | `ReasonNoApproach` — NO WAY TO STAND NEXT TO IT |
    | `NoConsumable` | `:481` | `IsUnfixableWreck(forced: true)` | `ReasonNoConsumable` + the item |
    | `Displaced` | `:333` | — per-worker transient, FILED (residual below) | none |
    | `CargoLost` | `:343 :419` | — per-worker transient, FILED (residual below) | none |
    | `NoRouteToConsumable` | `:471` | — no host-side twin, FILED | none |

    So the badge is **LIVE, not latched**, even though its trigger was an instant: the record only says
    which question to ask about which machine, and it is dropped the moment the world stops agreeing
    (open the door ⇒ badge gone AND record gone, next frame). There is no timer anywhere.
  - **Instruments:** `DroppedOrderTests` (16 legs, driven on `--ship wreck` through `gs.AdvanceTicks`,
    never `sim.Tick()` — the run loop's own path, and the only one where the event has been read) +
    `client/test/blocked-model.test.js` + `client/tools/dropped-order-shot.mjs`.
    **THIRTEEN named mutations physically applied**, each red for the right reason and reverted from
    an in-memory copy (11 C#, 2 client).

- ⭐⭐ **b3″ — THE BADGE REACHES THE SCREEN THE PLAYER IS ACTUALLY LOOKING AT (D5 OVERVIEW,
  2026-08-03).** Everything above is drawn on the machine's TILE, in the **Room Zoom**. On the
  **Level-1 Overview** the ordered crew member went straight back to `Awaiting orders`
  (`GameSession.AwaitingOrdersLabel` — M2-20's honest word for a state that was no longer hers) and
  nothing pointed at the badge one screen away. Filed in HANDOVER as *"badge Room-Zoom-only (Overview
  dock bare)"* and named there a **first-hour playtest risk**; `dropped-order-shot.mjs` STEP 6 carried
  it as an explicit PREMISE.
  - **THE MECHANISM IS A JOIN, NOT A SECOND ANSWER.** `WireFormat.BlockedCell` grows a **seventh
    element, `Cid`** (`WireFormat.Blocked.cs`, append-only exactly as M3-13's `Detail` was, sentinel
    `WireFormat.CidNone = -1`): the two REPAIR walks stamp the ordered crew member's id on the row they
    already emit (`GameSession.AddNoRouteRow` / `AddNoApproachRow` / `AddUnfixableRow`, each taking the
    id from the walk that already holds her), and the three registry walks send `CidNone` — a
    designation belongs to the ship, not to a person (§2.1). The client joins in one pure function,
    `crewBlockedOrder` (`client/src/ui/console-model.js`), wording the row through
    `blockedReasonSentence` — the SAME one entry point the badge and the key box use.
  - ⛔ **THE HOST DOES NOT COMPOSE A SENTENCE.** The rejected alternative was a clause appended to the
    roster's `task` string in D4's shape; it would have put a second copy of `BLOCKED_REASON_TEXT`
    host-side (`messages.js`: *the SIM owns the words, the wire carries the byte*) **and** would not
    have fitted: `"Awaiting orders · NO WAY TO WALK TO IT"` is 38 characters against the dock's
    measured 26, so `dockTask` would have shipped `"Aw… · NO WAY TO WALK TO IT"`. The row therefore
    **replaces** the label rather than extending it, and all three repair sentences lead with their
    payload (20 / 26 / `NEEDS PARTS — …`), so the one that overflows loses prose, not payload.
  - **TWO SURFACES ON THE OVERVIEW:** the crew dock cell `.ov-crewtask` in the channel's fault red
    (`.ov-crewtask.blocked`, the work/waiting classes explicitly off — a stuck order is a FAULT, not
    an activity), plus `.ov-roblocked` under the selected readout, which wraps at **264 px** and is the
    only place the 45-character `no_consumable` sentence is readable whole. ⚠️ **264 is the ELEMENT,
    298 is the ISLAND** (`.ov-readout`'s stylesheet width) — this line said 298 until the element was
    walked in Chrome; `overview-dock-badge-shot.mjs` measures `.ov-roblocked` and its `.ov-task`
    sibling at clientWidth 264 apiece and asserts they agree. Hover carries reason +
    the host's own label.
  - ⭐ **LIVE BY CONSTRUCTION, not by a second timer.** Both surfaces re-derive from the same decoded
    `blocked` message the Room Zoom badge is drawn from (`Hud.getBlocked`, decoded once per repaint in
    `overview-view.js`), and `crewBlockedOrder` holds no state — so the frame the host drops the row,
    the dock, the readout and the badge go together.
  - ⛔ **NAMED COST 1: THE PER-TILE DEDUPE OUTRANKS THE OWNER.** Two crew ordered at one machine are one
    blocked machine, not two, so the surviving row carries the FIRST crew member's id in citizen-store
    order and the second gets no dock line (the badge stays correct). Reachable only while neither
    holds the job. **FILED.**
  - ⛔ **NAMED COST 2: THE REPLACEMENT DISCARDS D4's ` · NO AIR` CLAUSE** (found by independent
    review). The dock row REPLACES the host's task label, and a replacement drops everything that
    label carried — including the air warning, whose own constant says dropping it from the docks is
    *"the one change this constant exists to make impossible"* (`console-model.js` `AIR_WARNING_CLAUSE`).
    **Measured client-side:** a host label of `"Servicing fabricator_1 · NO AIR"` renders as
    `"NO WAY TO WALK TO IT"`. ⚠️ **Structurally possible, NOT shown reachable** — a 900-tick probe of
    the shipped wreck measured the two states co-occurring **zero** times, which follows from the
    clause being gated on `HeldByOrder` while a stuck order is one the sim could not run. The hover
    title still carries the raw label, clause and all; a tooltip is not a fix, which is why this is a
    named cost rather than a closed one. If it is ever driven, the fix is a composition rule at the
    dock row, never a wider dock (M2-20's precedent).
  - **Instruments:** `DroppedOrderTests.TheRowNamesTheORDEREDCrewMember_SoTheOverviewsDockCanSayIt`
    (driven on `--ship wreck`, asserted on BOTH sides of the drop) +
    `BlockedChannelTests.A_Designation_Belongs_To_Nobody_And_Sends_The_Cid_Sentinel_Not_Zero` +
    `client/test/overview-dock-badge.test.js` + `client/tools/overview-dock-badge-shot.mjs` (real
    Chrome: the sentence is in the dock, `scrollWidth <= clientWidth`, and it LEAVES when
    `door_d0_s2` opens). **SEVEN named mutations physically applied**, each red for the right reason
    and reverted from an in-memory copy (2 C#, 5 client) — one of them, hiding the readout line, was
    a SURVIVOR on the first pass and is what the readout's own scan leg exists to close.
- ⛔⛔ **RESIDUAL b3-R — A `Displaced`/`CargoLost` DROP OF A PLAYER'S ORDER EVAPORATED PERMANENTLY
  AND SILENTLY UNDER OD-H. ⭐ THE SILENCE IS CLOSED (2026-08-03, owner-ruled) BY A CHRONICLE LINE —
  §13.45. THE BADGE HALF IS STILL REFUSED AND THE DIAGNOSIS BELOW IS KEPT BECAUSE IT IS WHY.**
  What the log now holds for every one of the six reasons: *"ORDER DROPPED — Rell let go of the
  fabricator (fabricator_1): the parts in hand were gone."* What is still true: no live badge for
  these three, and no re-issue (item **d**). The rest of this block is the measurement that ruled
  the shape, unchanged.
  ⚠️ **The justification first shipped for these two rows was FALSE and is retracted here rather than
  quietly reworded:** it said they were *"self-healing — the standing rule re-recruits from ground
  truth on the next pass"*. It does not. `FindNearestReachableIdle` gates on `CanTakeWorkType`
  (`MachineWearSystem.cs:598`, mirrored in `HasClaimableWork` at `:534`) and **OD-H boots every work
  type OFF**, so nothing re-recruits anybody until the player opens the WORK tab.
  **DRIVEN on the shipped wreck** (independent review found it; re-measured here rather than
  transcribed): order `fabricator_1` with the route open ⇒ taken tick 1, the first render retires the
  pending record; yank the carried stack at the pickup, **tick 171** ⇒ `CargoLost` at `:419`, the sim
  publishes and **the host really does FILE the drop** — the event mechanism is working — and then the
  fifth walk's default arm discards it. **3 000 further ticks: never re-recruited, `JobKind` stays
  `None`, `blocked` reads `cells:[]` throughout.** The order is gone with nothing on any surface.
  **The honest justification, and the only one now claimed:** these are **per-worker transients** —
  what killed the job is a fact about a MOMENT and a PAWN, never a standing property of the machine,
  so there is no world question for a render to re-ask, and under the live-re-ask discipline that
  governs this channel no honest badge is available. **The fix is §13.25d's** (nothing re-issues a
  forced job after an interruption), not another row here; a latched sentence would be the one thing
  the discipline exists to refuse.
  ⭐ **AND THE OWNER RULED THE THIRD OPTION, WHICH IS NEITHER: THE SHIP'S LOG.** A badge must be
  re-askable because it claims to say what is TRUE NOW; a history line claims only that something
  HAPPENED, and a moment that no longer exists is exactly what a log is for. So all six reasons —
  including the three that also badge, because the badge vanishes with the world and the line does
  not — write one `HistoryKind.OrderDropped` entry from `HistorySystem`. **§13.45.**
- ⚠️ **WHAT IS ALSO STILL OPEN.** (i) The badge clears when the route opens and the order does
  **not** come back with it — item **d** below, unchanged. (ii) `NoRouteToConsumable` has no
  host-side twin, because "can she walk to a stack `FindNearestConsumable` would choose" is a
  private, per-worker-position declaration and re-using the WORKSITE's route for it would be a second
  authority. (iii) A machine with **no staging tile at all**
  is refused at issue time and is still silent (b2's geometry reason — the mid-order twin IS surfaced
  now, and that says nothing about the issue-time one: no job is ever created there).

**c. NEITHER PRE-EMPTION CALL SITE IS INDIVIDUALLY PINNED** for the hold — the predicate is read
twice on that path and blinding either alone is green (§6.2c). Named so that a later lane does not
read the `TryPreempt` line as guarded.

**d. THE HOLD CANNOT SURVIVE AN INTERRUPTION, AND NOTHING RE-ISSUES THE ORDER.** A flee, a needs
break or any abandon ends the job and therefore the order; she does not go back to the machine the
player pointed at. That is §2.2's forced-work behaviour minus RimWorld's re-issuing `priorityWork`
record, which this package may not build (it would need a saved target). **Expect a player to notice
this**: "I told her to fix THAT and she wandered off after the vacuum scare" is the shape of it.

---

### 13.26 ⭐⭐ THE M2-17 RE-BASELINE — A1/A2/A3, each with the work grid that produced it (2026-07-30)

> ### ⛔ THE HONEST HEADLINE, AND IT GOES FIRST
>
> **Every occupancy / A1 / A2 / A3 number in this repo taken before M2-2 landed was measured on a
> tree nobody will play.** OD-H made work opt-in and OD-I extended that to the fixtures, so from
> M2-2 the crew of `--ship slice`, `--ship grid`, `--ship wreck` and the scenario ship boot with
> **every work type off** and an unattended run does **no work at all**.
> ⚠️ **The drop between the old numbers and the ones below is OD-B's re-baseline arriving, with
> OD-H's default as its cause. IT IS NOT A REGRESSION AND MUST NOT BE REPORTED AS ONE.**
> ⛔ **And A1 is a regression statistic only** (OD-B): it may be reported and **never optimised
> toward**. A package justified by an A1 number is refused at charter time.

**⚠️ `0.000 %` NOW HAS TWO CAUSES AND THEY ARE CONFUSABLE BY CONSTRUCTION.** It is the correct
output of a correctly-working game whose crew were given no orders, *and* the signature of a harness
that measured nothing — and `A1 = 0.000 %` on `--ship grid` was **already** the measured post-E0
result (§13.15's successor, `HANDOVER-2026-07` 2026-07-28). The table below therefore carries the
**grid** and the **productive crew-tick count** in every row; a row without both is not a reading.

#### The instrument (`hosts/scenario`, `occupancy`)

- **`--grant <spec>`** authors a work grid *through the sim's own `SetWorkPriorityCommand`* — one
  command per (living citizen, work type), **all six cells written including the Off ones**, so a
  leg's grid is never a function of `WorkPriority.Default`. Grammar: `all` / `all@N` /
  `Repair@1,Haul@4`; a bare type name grants at **3** (RimWorld's `alwaysStartActive` value,
  reference **§1.5** — the newly-arrived-colonist algorithm, whose steps 3 and 4 both set 3). No flag ⇒ **no grant**, which is the shipped boot state and still a legitimate
  thing to measure — it is just no longer measurable *silently*.
  `hosts/scenario/WorkGrantHarness.cs`.
- **The grid is READ BACK off the sim** (`Citizen.GetWorkPriority`) after the commands execute and
  printed above the occupancy table plus beside every headline (`A1 grid:` / `A2 grid:` /
  `A3 grid:`). Printing the parsed spec would read identically whether the grant landed or was
  dropped on the floor.
- **Exit codes are the non-vacuity check, by INCLUSION:**
  **3** = a grid was granted and the read-back disagrees (the grant never landed — refuses to
  measure at all); **2** = a grid was granted, survived the read-back, and the run still produced
  **zero** productive crew-ticks (*do not quote this run*); **0** = quotable, with its grid.
  `WorkGrantHarness.Judge`, pinned in `tests/Perilune.Tests/WorkGrantHarnessTests.cs`.
  ⚠️ It lives in the harness rather than in `ci.sh` deliberately: this package is pin-neutral
  (`ci.sh` takes a zero-line diff), and a gate-side check would guard only the one run `ci.sh` makes
  — the misquote happens in the ad-hoc runs a session types by hand.
- **`--wall-day N`** issues one `DesignateBuildCommand(BuildKind.Wall)` at the start of sim-day N —
  A3. The site is the first tile in canonical `z,y,x` order that `BuildSystem.CanDesignate` accepts
  **and** that has a neighbour passing `WorksiteSafety.CanStageWorkerAt`; without that second leg the
  order lands on an airless deck and measures §13.21's staging rule instead of the economy.

#### The measurements

All taken on `lane/rebaseline` at this commit, **Debug** build, `n = 1`, each ship at its authored
seed (wreck `20260728`, grid `20260723`, slice `20260721`), `--days 1`. Wall-clock is soft (other
lanes were running); every figure below is sim-time.

| ship | grant | A1 work @h24 | A1 any @h24 | A2 | zero-recruitable ticks | productive crew-ticks | non-vacuity |
|---|---|---|---|---|---|---|---|
| wreck | *none* | 0.000 % | 0.000 % | 99.997 % | 0.003 % | **0** | N/A |
| wreck | `all@3` | 0.000 % | 0.000 % | 83.074 % | 16.926 % | 146 130 | PASS |
| grid | *none* | 0.000 % | 0.000 % | 99.985 % | 0.000 % | **0** | N/A |
| grid | `all@3` | 0.000 % | 0.000 % | 83.862 % | 1.425 % | 1 112 841 | PASS |
| slice | *none* | 0.000 % | 0.000 % | 99.971 % | 0.000 % | **0** | N/A |
| slice | `all@3` | **2.184 %** | 2.184 % | 71.125 % | 4.202 % | 1 994 104 | PASS |

⭐ **READ THE TWO `grid` ROWS TOGETHER — THEY ARE THE WHOLE POINT OF THIS PACKAGE.** Both report
`A1 = 0.000 %`. One did 1 112 841 crew-ticks of work and then ran out of matter; the other did
**nothing at all**. From the number alone they are indistinguishable.

**Where the work went** (share of live crew-ticks, granted legs; every other `JobKind` is 0.00 %):

| ship | the productive kinds | the busy curve |
|---|---|---|
| wreck | `Maintain` 16.91 % | 100 % h1–h3, 55 % h4, then flat with spikes at h10 (23.3 %) and h20 (25.3 %) |
| grid | `Craft` 14.33 % · `Dig` 1.77 % | 58.5 % h1, ~25–34 % h2–h13, decaying h14–h15, **0.0 % from h16** |
| slice | `Craft` 24.60 % · `Dig` 4.25 % | 83 % h1, ~28–35 % h3–**h20** (h20 is still 28.1 %), then a TWO-STEP fall — h21 **10.4 %**, h22 **2.4 %** — settling at 2.2–2.4 % through h24 |

⚠️ **`Haul*` is 0.00 % on all three ships** and always was: `stockpile tiles zoned = 0`, so
`HaulPickup`/`HaulDeliver` can never be assigned (A4's standing zero — see §13.17). The `Craft`
column is E0-6's lossy ladder converting the ship's finite matter budget, and the cliff is §13.15's,
arriving at **h16 on grid** and **h21 on slice**.

#### A1 — `crew busy-fraction at sim-hour 24` (`ECONOMY.md` §12.1, target > 25 %)

Definition unchanged and read off the harness: the hour-23→24 window (not an instant, not a run
average), `work` counting only the productive `JobKind`s — a crew 25 % busy *eating* has not met it.

| | pre-M2 | now, with a granted grid | now, no grant |
|---|---|---|---|
| slice | **24.979 %** (2026-07-23; §13.15 marks it SUPERSEDED — E0-6 moved the cliff earlier) | 2.184 % | 0.000 % |
| grid | **0.000 %** (2026-07-28, post-E0 gate, `--days 2`, work stopping after h16–h20) | 0.000 % | 0.000 % |
| wreck | never measured | 0.000 % | 0.000 % |

⇒ **grid's A1 did not move.** Its pre-M2 value was already 0.000 % for the same reason it is 0.000 %
today: the economy terminates around h16 and h24 is on the far side of that. **M2 changed the
*ungranted* number, not the granted one** — which is exactly what "the drop is the default, not a
regression" means, stated as a measurement instead of an assurance.

#### A2 — `recruitable crew-ticks` (`ECONOMY.md` §12.1, target > 60 %)

⛔ **THE PREDICATE MOVED AND THE TWO NUMBERS ARE NOT COMPARABLE — DO NOT DIFF THEM.** The recorded
**17.9 %** was `IsIdleForWork`, whose `!HasPath` clause made a wandering pawn unrecruitable
(`ECONOMY.md` §1.3a). **E0-1 removed exactly that clause**; that removal *was* E0-1. Today's
predicate is `Citizen.IsRecruitableForWork` (`Citizen.cs:376`) — `IsRecruitableIgnoringJob &&
JobKind == None`, i.e. not dead, not `HoldPosition`, not `HeldByOrder`, not mid-ordered-walk, and
carrying no job — which is the one every claim gate actually reads (§6.2c).

So A2 "passes" on every row above, and the pass is nearly meaningless on the ungranted rows: a crew
that can take no work at all is **99.97–99.99 % recruitable**, because recruitability is a fact about
the *person* and the work-type veto is a fact about the *(person, work type)* pair (`Citizen.cs:245`
says so explicitly). ⚠️ **A2 is therefore not a proxy for "the dispatcher has people" after M2-2**,
and a package quoting it without `CanTakeWorkType` beside it is measuring the wrong thing. Filed as
an observation, not fixed here — redefining A2 is an owner call, not a harness change.

#### A3 — `player can build a wall at day 3` — MEASURED FOR THE FIRST TIME IN THIS REPO'S LIFE

`ECONOMY.md` §12.1 records A3 as *"impossible"* against a target of *"routine"*, and every
`HANDOVER`/roadmap note since has recorded that it **has never been measured**. It is measured now.
`--ship wreck --days 4 --grant all --wall-day 3` (order at tick 1 728 000, 48 sim-hours of
observation):

| leg | site | required | outcome |
|---|---|---|---|
| wreck, `all@3` | `(3,1,0)` | 2 Regolith | ⭐ **COMPLETED 0.074 sim-hours (4.4 sim-minutes) after the order** |
| wreck, *no grant* | `(3,1,0)` | 2 Regolith | **NOT COMPLETED** after 48 sim-hours — 0 / 2 Regolith staged, site still pending |
| grid, `all@3` | `(2,1,0)` | 2 Regolith | **NOT COMPLETED** after 48 sim-hours — 0 / 2 staged, and the cause is **matter, not labour**: grid ends the run holding `Potato=451 Scrap=1 ControllerModule=8` and **no Regolith at all** (1 385 891 productive crew-ticks, non-vacuity PASS) |
| slice, `all@3` | `(2,4,0)` | 2 Regolith | ⭐ **COMPLETED 0.089 sim-hours (5.3 sim-minutes) after the order** |

⇒ **A3 is `routine` on the wreck when the crew have a grid, and `impossible` when they do not** —
the same ship, the same site, the same tick, one flag apart. That pair is the clearest statement of
what OD-H changed, and it is why an A3 verdict without its grid means nothing.

⇒ **And grid's A3 FAILS for a reason no work grid can fix.** The Craft ladder converts the ship's
whole Regolith budget (§13.15/§13.19), so by day 3 there is no build material aboard and a wall
order can never be staged. That is the same finite-matter fact A1 reports at h24, seen from the
other side — and it is precisely the content decision the owner already holds open (grid's faucet,
`ROADMAP` §7 / OD-B). ⛔ **Do not open a package to "fix A3 on grid":** it is a re-statement of the
parked economy question, not a new defect.

⛔ **A3 NEEDS `Construct` ALONE — `Haul` IS NOT INVOLVED, AND THIS IS THE ROW EVERYONE GETS WRONG**
(this section shipped it backwards once). Fetching the Regolith is `JobKind.HaulToBuild`, which
`WorkTypeMap` maps to **`Construct`, not `Haul`** (`sim/Sim.Core/Entities/WorkTypeMap.cs:17-24`,
switch at `:62`) — a deliberate decision, on the stated grounds that *"a player who switched
`Construct` on and `Haul` off expects their builder to fetch her own beams"*, and because mapping it
to `Haul` would split one job source across two work types.

**Measured, not reasoned:** `--grant Construct@3 --wall-day 3 --days 4` on the wreck, with `Haul`
**off** in the read-back grid, completes the wall at site `(3,1,0)` in **0.073 sim-hours** — a hair
*faster* than `all@3`'s 0.074 (2 620 productive crew-ticks, non-vacuity PASS). ⇒ A `NOT COMPLETED`
under a Haul-less grid is **never** explained by the missing `Haul`; look at `Construct` and at the
material aboard.

⚠️ **The A3 legs are `--days 4`, so their A1/A2 differ from the `--days 1` table above** (a longer
run dilutes both): wreck `A2 90.103 %`, grid `A2 94.937 %`, slice `A2 90.416 %`; A1 @h24 is
unchanged at `0.000 / 0.000 / 2.184 %`. Quote a row with its `--days`.

#### Unmeasurable as written — FILED, not silently redefined

- **A3's published form is a *qualitative* gate** (`impossible` → `routine`), and "routine" has no
  operational definition anywhere in the repo. What is measured above is the falsifiable half —
  *does one ordered wall complete, and how long does it take* — on **one** site chosen canonically.
  It does not establish that *any* wall a player picks completes, which is what "routine" would
  have to mean. **The definition is not rewritten here**; the gap is filed.
- **A2 no longer answers the question it was written for** (see above): after M2-2, "recruitable"
  and "can take this work" are different facts and A2 only measures the first.
- **`--ship perilune` is not in the table.** Its occupancy legs sit behind the tick-3000 goldens and
  measuring it is not this package's scope.

**Reproduce:**

```sh
~/.dotnet/dotnet run --project hosts/scenario -- occupancy --ship grid  --days 1 --grant all
~/.dotnet/dotnet run --project hosts/scenario -- occupancy --ship wreck --days 4 --grant all --wall-day 3
~/.dotnet/dotnet run --project hosts/scenario -- occupancy --ship wreck --days 1               # the boot state
echo $?   # 0 quotable · 2 vacuous, do not quote · 3 the grant never landed
```

---

### 13.27 `Device.Name` does double duty, and the owner's answer makes that safe (M3-1, 2026-07-31)

**`Device.Name` (`sim/Sim.Core/Entities/Device.cs:70`) is two things at once.** It is **the MOSS
registry key**: `MossBindings.RegisterAdapters` (`sim/Sim.Dsl/MossBindings.cs:14`) registers every
addressable device **by name** — `registry.Register(device.Name, …)` at `:32` (doors) and `:40`
(vents, scrubbers, wings, grow beds, tanks, reclaimers) — so the string a player types in a MOSS
program *is* this field, and `Simulation.StateHash` folds it **for that reason, in a comment that
says so** (`sim/Sim.Core/Simulation.cs:553-555`: *"registers every MOSS adapter BY NAME, so a
restore that changed one silently unbinds every player program, no error"*). It is **also the cryo
sleeper's identity**: the wreck's twelve capsules are named `"pod_" + pod.Who.ToLowerInvariant()`
(`sim/Sim.Gen/AuthoredShips.cs:1963`) from the `PodSpec.Who` column (`:1839`, table at `:1865`), and
`Device.cs:37-49`'s `CryoPod` comment already pins that mapping — *`IsOpen` (open vs occupied),
`Name` (who is inside), `Condition`* — closing with **"NO new `Device` field."**

⭐ **The collision only exists if a pod is ever RE-OCCUPIED.** A capsule that is thawed once and
never refilled has a name that is true forever, so one field can be a stable automation identifier
*and* the person in the box without contradiction. **Owner batch item 6, answered 2026-07-31: (A) —
unfreeze only.** ⇒ **A pod is single-use, `Device.Name` stays both the registry key and the
sleeper's identity, and no new field, no occupancy map and no save chapter is added anywhere.**
M3-1 therefore lands as **a recorded non-change**: this paragraph plus the pin below. Pin-neutral —
it writes no sim code, and `pin/m3-a` is unconstrained by it.

**The pin: `tests/Perilune.Tests/PodIdentityTests.cs`** —
`DeviceNames_NeverChangeAfterBoot_AcrossThreeThousandTicksOfCommandedPlay` boots `--ship wreck`,
snapshots every device's name at tick 0, drives 3 000 ticks of **commanded** play (a full work grant
through `SetWorkPriorityCommand`, a door through `SetDoorStateCommand`, a vent through
`SetDeviceStateCommand`) and asserts the per-id name map *and* the name multiset are unchanged.
⛔ **It is DRIVEN, never a text scan for `\.Name =`** — the charter refuses the scan by name
(trap 1: a scan is satisfied by the violation sitting in a comment; trap 4: it is defeated by
`device.Name=x` or any spelling the regex's author did not imagine). **Record the state, not the
spelling.** Verified by physically renaming a live pod inside `MachineWearSystem.Tick`'s device loop
at tick 1 500: RED, *"renamed: device 548 'pod_rell' -> 'pod_okonkwo'"* — the semantic failure, not a
crash.

⚠️ **Two things this does NOT say.** (1) `SaveReader.cs:344` writes `d.Name` on load — that is
*reconstructing* the boot state, not mutating it, and the pin is a claim about a running sim.
(2) **The pin is owed a thaw leg**: `ThawCommand` is M3-3's and does not exist yet, so the run above
drives the richest command traffic that ships today. A thaw is the code path most likely to want to
write a pod's name; **M3-3 must extend this test with a real thaw executed**, and the test says so in
its own header.

⇒ **FREEZE AS A PLAYER VERB IS THE NAMED FOLLOW-ON THAT REOPENS ALL OF THIS.** OD-L's *"MOSS
controls freeze/unfreeze per pod"* was read as *thaw only*. If a later package lets the player put a
crew member back in a box, the occupant must leave `Name`, and the only shapes that still add no
`Device` field are a parallel sim-side occupancy map (new hashed state, new save chapter, a pin move)
or a slot/occupant naming split (`pod_a1` as the key) — **which renames every authored pod and breaks
every existing player program that named one.** Do not take that step inside another package.

### 13.28 The thaw ladder's rung table exists and is asserted (M3-6, 2026-07-31) — ✅ and M3-3 now reads it (§13.30)

**`sim/Sim.Core/ThawGate.cs` (new, 106 lines) holds the whole per-pod repair requirement OD-L asks
for** — `ThawGate.RungOf(float condition)` (`:95`) resolves a `Condition` to a `ThawRung` readonly
struct (`:9`) carrying rung number, `ItemKind` and count, through a seven-row literal band table
(`:97-103`), with `ThawGate.RungCount = 7` (`:86`). It is pure, total, zero-alloc and engine-free.
**No sim system, no command and no host called it** — ✅ **and M3-3 CONNECTED IT: `ThawGate.Evaluate`'s
term 4 reads `RungOf` and `ThawCommand` spends what it names (§13.30).** The sentence that stood
here — *"until that lands, the ladder is content that exists and nothing consumes"* — is discharged;
what M3-6 shipped is the TABLE, what M3-3 shipped is the LADDER, and both sets of pins are still
load-bearing.

⭐ **The rung is DERIVED, so it costs no state.** The carrier is the pod's already-authored
`Condition` (`sim/Sim.Gen/AuthoredShips.cs:1865-1882`, `WreckPods`), whose documented meaning is
already *"how badly the raid treated it"* (`Entities/Device.cs:47`). ⇒ **no new `Device` field**
(refused by `Device.cs:46-49` and by wreck-plan W5.1), **no new def field** (which would move P4/P5
for a table nobody tunes at runtime — and a def field pinned only by the checksum is NOT pinned),
**no pin move**. M2-1's precedent in its own words: *"it is a rule, not a tunable."*

**The table, OD-M item 1 (answered 2026-07-31, option A, BINDING).** Chain depth is non-decreasing
and the count escalates inside a depth — OD-L's *"chain DEPTH is the difficulty curve"* read
literally:

| rung | band | pod | item | count | chain depth |
|---:|---|---|---|---:|---:|
| — | *(the prologue)* | `term_moss` commissioning | `ControllerModule` | 1 | 3 |
| 1 | `c >= 0.92` | Lindqvist 0.99 | `Seals` | 1 | 0 |
| 2 | `c >= 0.84` | Ozawa 0.91 | `Seals` | 2 | 0 |
| 3 | `c >= 0.76` | Ferreira 0.83 | `Parts` | 1 | 2 |
| 4 | `c >= 0.68` | Mbeki 0.75 | `Parts` | 2 | 2 |
| 5 | `c >= 0.60` | Bahri 0.67 | `ControllerModule` | 1 | 3 |
| 6 | `c >= 0.52` | Nakamura 0.59 | `ControllerModule` | 2 | 3 |
| 7 | otherwise | Torres 0.51 | `ControllerModule` | 3 | 3 |

⭐ **THE EDGES AND THE CONDITIONS WERE RE-SCALED TOGETHER BY D2 (2026-08-02); OD-M item 1's CURVE was
not touched** — same seven rows, same items, same counts, same chain depths, same pod order. The
bands were 0.02–0.03 wide with the pods authored 0.01–0.02 above their own floors; they are now
**0.08 wide with every pod 0.07 above its floor**. See §13.42.

⚠️ **The commissioning gate is the PROLOGUE, not a rung** (*"restore MOSS"*) and is deliberately
NOT in `ThawGate` — its cost lives where it already lives (`Commands/Commands.cs:753,778`;
`build.def commission_cost = 1`). The last rung is **3× the prologue**. ⚠️ **Chain depth 1
(`Scrap`) is deliberately unused**: `Scrap` is a crafting intermediate, not a repair consumable.

⭐ **THE BAND EDGES ARE INCLUSIVE ON THEIR LOWER SIDE, AND THAT WAS A DECISION, NOT A DEFAULT.** A
capsule at exactly 0.92 is rung 1; at exactly 0.84 rung 2; at exactly 0.52 rung 6 (the six edges
were re-scaled by D2, §13.42; the convention was not). RimWorld's
analogue chooses the OPPOSITE — `CapableOf` is `GetLevel(c) > c.minForCapable`, a strict `>`, so
*"a capacity sitting exactly at `minForCapable` is NOT capable"* (`docs/design/rimworld-reference.md`
§6.1) — and the lesson §6.1 draws is the one obeyed here: **an edge nobody chose is an edge somebody
will hit.** No authored `Condition` sits on an edge today (the bands were picked to fall between
them), so only the pin below would notice the convention flipping. Verified by physically flipping
every `>=` to `>` with a pod re-authored at exactly 0.90: RED, *"a capsule at EXACTLY 0.9 resolves
rung 3, expected rung 2"* and *"pod_ozawa (Condition 0.9) resolves rung 3, expected rung 2"*.

**The pins, all in `tests/Perilune.Tests/WreckShipTests.cs`:**
`ThawLadder_TheSevenIntactCapsules_SitOnTheSevenAuthoredRungs` (`:383`) walks the booted ship's
intact occupied capsules against a **hand-written** pod→rung→item→count table (`:355`) — never
derived from `WreckPods` nor from the band table, which is the charter's refused mutation 4 (*a
test derived from the table under test can never fail*) — and compares the two SETS both ways so an
added, renamed, opened or wrecked pod is a named failure.
`ThawLadder_BandLowerEdgesAreInclusive_AndTheEdgeBelowIsTheNextRung` (`:469`) pins both sides of all
six edges plus the two open ends.
`AuthoredShipsProseHeader_StatesTheSameCensusAsTheseLiterals` (`:544`) is a **source scan that
deliberately INVERTS the house `codeOnly` convention**: the census prose IS the artefact under test,
so the banner-delimited header block (`AuthoredShips.cs:1312-1340`) is extracted as comment text on
purpose, and `SurfaceBoundaryTests.CodeOnly` is used as the *proof* of that by asserting it deletes
the block entirely. It is a POSITIVE scan (`:598`), never a "must not contain 8" one — the header
deliberately records the dead draft it replaced, and a negative scan would fire on the very
paragraph that exists to stop the mistake recurring.

✅ **The band-edge BEHAVIOURAL sweep was OWED TO M3-3, mutation 6, by name — and M3-3 RAN IT**:
`ThawGateTests.TheRungTheGateResolves_ChangesAtEverySixInteriorBandEdge` crosses all six interior
edges through the six-term thaw contract and asserts the SENTENCE changes at each (§13.30). It could
not run here — that contract did not exist at position 6 — and *a leg that cannot run in its own lane
is not a mutation, it is a wish*. The M3-1 precedent (§13.27's owed thaw leg) was the same shape and
was discharged by the same package.

### 13.29 A pod cycles: the capsule opens and a person exists (M3-2, 2026-07-31)

**`sim/Sim.Core/Systems/CryoSystem.cs` (new, 269 lines), registered in `SystemStack.cs:55`** between
`HydroponicsSystem` and `NeedsSystem`. A `CryoPod` whose `Device.Progress` is above zero advances at
1 Hz (`:79`, `:138`); at full progress the capsule opens, `Progress` returns to 0, and
`Simulation.AddCitizen` puts a live crew member on the floor beside it (`Open`, `:175`), announced by
the new `CitizenThawedEvent` (`Events/SimEvents.cs:156` — `Pos` + `CitizenId` + `PodId`, mirroring
`DeconstructCompletedEvent`, transient and therefore pin-neutral by itself).

✅ **M3-3 GAVE IT A VERB.** The paragraph that stood here — *"nothing player-facing starts a cycle on
this tree … the only writer of a pod's `Progress` today is a test"* — is discharged: `ThawCommand`
writes it (`Commands/Commands.cs:890`) behind the six-term gate, and the MOSS `thaw` op carries the
player's request (§13.30). What is still absent is the **countdown badge (M3-4)**, the **emergency
thaw (M3-5)** and, for now, **any client sender at all** — so a `--ship wreck` player still cannot
thaw anybody by clicking. The mechanic and its verb both exist; the button does not.

⭐ **NO NEW `Device` FIELD.** `Device.cs:46-49`'s mapping was already correct and is now consumed:
`IsOpen` = opened vs occupied, `Name` = who is inside, `Condition` = how badly the raid treated it,
`Progress` = the cycle. All four were already hashed (`Simulation.cs:545-555`) and saved (DEVC
v1/v2/v3), so the *feature* adds no saved field at all — the one piece of new state is the
emergency-thaw bit, below.

**THE FOUR RULES, ENFORCED IN THE SYSTEM AND NOT IN A FUTURE COMMAND.** A gate living in
`ThawCommand` would be bypassed by the emergency thaw, by a restored save that already holds two
live cycles, and by any later writer of `Progress`.

| rule | where | what it does |
|---|---|---|
| **one at a time** (the owner's *"only one after the other"*) | `:153` | at most ONE pod advances per pass, elected by lowest `Device.Id`; every other pod holds its `Progress` untouched and resumes when the bay is free |
| **a wrecked pod never cycles** (OD-9) | `:152` | below the `CryoPod` row's `fail` (0.10) the capsule is INELIGIBLE — it neither advances nor blocks anyone else. The wreck authors four such capsules and each already carries a `Corpse` and a log line |
| **single-use** (§13.27, OD-M item 6 = A) | `:150` | an OPEN pod is done forever, which is what lets `Device.Name` be both the MOSS registry key and the sleeper's identity |
| **somewhere to stand** | `TryFindExitTile`, `:209` | the first walkable, DEVICE-FREE 4-neighbour in `Int3.Neighbor4`'s canonical order (+X, −X, +Y, −Y). With no such tile the capsule **holds at exactly `Progress` 1.0 and stays shut** (`:163`) rather than opening into a wall |

⚠️ **The exit tile is stricter than `HydroponicsSystem`'s harvest drop, deliberately.** The harvest
uses the same canonical order but accepts a blocked tile ("items on blocked tiles are legal, hauling
handles reachability", `HydroponicsSystem.cs:91-93`). A PERSON may not be placed inside the
furniture, so the cryo version adds the `TryGetDeviceAt` clause — which is exactly why copying the
harvest loop verbatim would have shipped a crew member inside a locker.

**THE CYCLE RATE IS A NAMED CONSTANT: `ThawSecondsPerCycle = 240f` (`:110`), four sim-minutes.** Not
a def field, because a new def scalar moves P4 and P5 — which this package's pin ritual required to
HOLD — and because *a def field pinned only by the checksum is NOT pinned*. The shipped precedent is
`BuildSystem`'s `FloorConstructTicks` (`Systems/BuildSystem.cs:253-254`), a v1 literal for the same
reason. `Progress` is a 0..1 FRACTION, so retuning the constant rescales a saved mid-cycle capsule
rather than invalidating it. ⚠️ **M3-4's countdown badge will DISPLAY this number**, so retuning it
is a player-visible change; promoting it to `cryo.def` belongs to the next package that moves P4/P5
anyway, with a behavioural consumer test in the same commit.

**The person's display name is derived, not stored**: `SleeperName` (`:234`) inverts the authoring
convention at `sim/Sim.Gen/AuthoredShips.cs:1963` (`"pod_" + Who.ToLowerInvariant()`), so `pod_ozawa`
wakes up as **Ozawa**. A capsule not carrying the prefix keeps its name verbatim rather than being
mangled into an invented person. She boots `AutoWander = true` to match the ship's own pawn
(`AuthoredShips.cs:2181-2185`, the fields at `:2184` — a thawed sibling standing dead still beside
a wandering one reads as a bug), `HoldPosition = false`, and an **all-off work grid** (OD-H) —
i.e. exactly OD-G's shape: awake, idle, awaiting orders.

⭐ **AND IT SHIPS ONE PIECE OF STATE IT NEVER WRITES: the emergency-thaw "has fired" bit**
(`EmergencyThawFired`, `:127`; the M3-5 seam `MarkEmergencyThawFired`, `:136`). It is saved in the
SYSS chapter (`CaptureState`, `:245`), folded into `Simulation.StateHash` (`StateChecksum`, `:262`,
seed `'CRYO'`), round-tripped, and **asserted never to be set by anything in this package**. M3-5 is
the reader AND the writer. This is M2-1 → M2-19's shape (*storage first, reader later*) and it exists
so that M3-5 is not a SECOND re-pin.

✅ **M3-5 IS NOW THE WRITER, AND THE PLAN PAID OFF: IT MOVED NO PIN** (§13.35). `CryoSystem` sets the
bit the first tick the ship has no living crew, and it added two more structural members beside it
(`_runEnded`, `_emergencyPodId`) **without moving P1/P2/P3** — the three are packed into ONE fold
word, so a ship that never lost its crew hashes exactly what M3-2 hashed. `CryoSystemTests`'
`NothingInThisPackageEverSetsTheEmergencyThawBit` still passes and is still meaningful: its drive
keeps a crew member alive, which is the condition under which M3-5's branch does not run.
⚠️ The absent-features list two paragraphs above is now **discharged in full** — the countdown badge
is M3-4's (§13.32) and the emergency thaw is §13.35.

---

#### ⛔ THE PIN MOVE — WHY IT HAPPENED, AND THE MEASUREMENT THAT PROVES THE CAUSE

**`CryoSystem` implements `IStatefulSystem`, and THAT is what moved the pins — not registration.**
`Simulation.cs:605-608` folds a system's `StateChecksum` **only** for systems that implement the
interface, and `Save/SaveWriter.cs:120-128` writes the SYSS chapter under the same test. W0-6's four
"empty" systems moved three pins for precisely this reason (`StockZoneSystem.cs:65`,
`ProductionSystem.cs:19`, `OreRegistrySystem.cs:22`, `Space/TradeSystem.cs:23`). **Registering a
stateless system folds nothing and saves nothing** — and the charter's earlier revision claimed
otherwise, which is why this paragraph exists.

⚠️ **THE REFUSED ALTERNATIVE, REFUSED EXPLICITLY**: a stateless `CryoSystem` with the emergency bit
on `Simulation`'s save HEADER. It works. It is rejected because **the header is written by every
ship while a SYSS chapter is written only by ships that have the system** — the bit is cryo state, so
it lives where cryo state lives. (The third option, a new `Device` field, is refused by
`Device.cs:48`.)

| pin | before | after |
|---|---|---|
| P1 scenario `--days 3 --seed 42` | `81733e27709f36e4` | **`25f604dd61b221fb`** |
| P2 tick-3000 golden (`--ship perilune`) | `482fd40c070b54e0` | **`1c036ffd53b8f106`** |
| P3 slice tick-3000 golden | `94c29d5f6408d91c` | **`37c85c1ed445895e`** |
| P4 defs defaults checksum | `0c5ddbc07e41f07d` | **unchanged** — no def field |
| P5 defs rules-inclusive | `09900b9a44119272` | **unchanged** — no def field |

⭐ **FOLD-ONLY, AND MEASURED RATHER THAN ARGUED.** With `CryoSystem` still registered and still
ticking but `IStatefulSystem` **removed from its declaration**, the scenario reported
`81733e27709f36e4` — the OLD P1 — and both tick-3000 golden tests passed against their OLD files.
That single measurement proves both halves at once: the move is caused by the INTERFACE, and no
ship's behaviour changed (none of the three fixture ships has a `CryoPod`; the scenario's day-3 line
reads `pop 2 / hydro 97.7 kPa / water 0.0 L / potatoes 371` before and after). Twin-run equality
holds at the new value, and two separate invocations agreed.

**The pins: `tests/Perilune.Tests/CryoSystemTests.cs`** — thirteen tests, every one driven.
`APodCycles_ThenOpens_AndANamedPersonStepsOut` (`:97`) is the player sentence;
`AFullCycle_TakesFourSimMinutes` (`:147`) pins the rate in seconds and ticks rather than as
`Dt / ThawSecondsPerCycle` (which would be the implementation re-deriving itself);
`OnlyOneCapsuleCyclesAtATime_AndTheQueueThenDrains` (`:175`) pins both halves of the owner's
mechanic; `AWreckedCapsuleNeverCycles_AndDoesNotBlockAHealthyOne` (`:212`) asserts the capsule is
below `fail` BEFORE driving and carries a healthy capsule in the SAME run as the inclusion control;
`AMidCycleShip_RoundTripsByteIdentical_AndKeepsCycling` (`:346`) is the state the feature invents.

⚠️ **The `IStatefulSystem` leg is TWO SEPARATE `[Test]` METHODS** —
`TheCryoFold_ReachesStateHash_AndTheSystemIsRegisteredAsStateful` (`:394`) and
`TheCryoSystem_WritesItsOwnSyssChapter` (`:424`, which parses the SAVED BYTES) — because `Assert`
throws and a second leg inside one body is indistinguishable from a dead one (fifth trap shape).
Dropping the interface reddens both; making `StateChecksum` a constant reddens only the first, which
is the proof that they are independent instruments. And the fold test **sets the bit before
hashing**: with a permanently-zero bit a constant checksum is byte-identical to a real one, and the
leg would be vacuous — the same discipline as the wrecked-pod fixture, stated in the same words.

⚠️ **`CryoSystem.cs` is classified NOT ECONOMY** in
`ArchitectureBoundaryTests.EconomySystemCensus_ForcesADecisionOnEveryNewSystemFile`, deliberately
rather than by default: it consumes no item, produces no item and charges nothing. The thaw's PRICE
is the `ThawGate` rung, which M3-3 will spend in `Commands/Commands.cs` — already inside the
boundary — ✅ **and M3-3 spent it exactly there** (`Commands/Commands.cs:885`), so the classification
still holds and `CryoSystem.cs` still consumes nothing. **The day a cryo file spends an item is the
day it joins `EconomyFilesInSharedDirectories`.**

⚠️ **WHAT THIS PACKAGE DELIBERATELY DOES NOT GATE, so M3-3 knows what it inherits.** A cycle in
progress ignores `Powered`, ignores life-support headroom, ignores the `ThawGate` rung and ignores
who (if anyone) is standing at a terminal. Those are the thaw's PRECONDITIONS and they belong to the
verb that starts a cycle, not to the system that runs one. Once started, a cycle completes.
✅ **M3-3 took exactly that division** — all six terms are checked at the moment of the request and
none of them is re-checked while the capsule counts down (§13.30), so a scrubber that fails mid-cycle
does not abort a thaw the ship had already paid for.

### 13.30 ⭐⭐ The thaw is EARNED — the ship answers yes, or no with a named reason and a number (M3-3, 2026-07-31)

**A player can now ask for a thaw.** `{"type":"moss","op":"thaw","tid":"term_moss","text":"pod_ozawa"}`
reaches `GameSession.HandleMoss`'s new `thaw` case (`hosts/web/GameSession.cs:452`), which renders
`ThawGate`'s verdict and enqueues a `ThawCommand` (`sim/Sim.Core/Commands/Commands.cs:845`,
`Execute` at `:874`). The command sets the capsule's `Device.Progress` (`:890`) and §13.29's
`CryoSystem` takes it from there — countdown, open, a named person on the floor. §13.28's *"content
that exists and nothing consumes"* and §13.29's *"a mechanic waiting for a verb"* are both
**discharged by this entry**; the two paragraphs saying so are corrected in place.

#### THE SIX TERMS — where each is evaluated, and the exact sentence it produces

All six resolve inside `ThawGate.Evaluate` (`sim/Sim.Core/ThawGate.cs:394`) from **sim state**, in
this order. Term 6 is `ThawCommand`'s, because a pure function may not spend.

| # | term | where | the sentence |
|---|---|---|---|
| 1 | the pod | `:394-403` (`FindCryoPod` `:481`) | `NO SUCH POD` · `POD IS EMPTY — ALREADY THAWED` · `POD — NO SIGNAL` |
| 2 | the console | `IsCommissionedConsole` (`:465`) | `NO COMMISSIONED CONSOLE — FIT A CONTROLLER MODULE TO A WORKING TERMINAL` ⚠️ **re-worded by M3-4** — see §13.32 |
| 3 | the cycle | `FindCyclingPod` (`:500`) | `POD LINDQVIST IS CYCLING — 4 min` |
| 4 | the rung (OD-L) | `:415-420`, over `RungOf` (`:293`) + `LooseMatter.Affordable` | `NEEDS 1 SEALS — SHIP HAS 0` · `NEEDS 3 CONTROLLER MODULE — SHIP HAS 0` |
| 5 | the headroom | `Headroom` (`:530`) | `SCRUBBING COVERS 3 OF 4` · `FOOD 1.8 DAYS — NEEDS 3.0` · `WATER … — NEEDS 3.0` · `O2 … CREW-DAYS — NEEDS 1.0` |
| 6 | the price | `Commands.cs:885` (`LooseMatter.TryPay`) | **none — and that is deliberate; see below** |

Accepted reads `THAW ACCEPTED — LINDQVIST — 4 min`. The prose is composed by `ThawGate.Describe`
(`:683`), which **allocates and is host/test-only**; `Evaluate` returns a `ThawVerdict` readonly
struct (`:107`) of numbers and two existing string references, which is why the gate is zero-alloc
on a path that runs inside `Simulation.Tick` (pinned by `EvaluatingTheGate_AllocatesNothing`).

⚠️ **TERM 1 SPEAKS THREE SENTENCES WHERE THE CHARTER TABLE WROTE ONE, AND THAT IS A DECISION.**
"This capsule is not on the ship", "this sleeper is already out" and "this sleeper did not survive
the raid" are three different facts and only the third is OD-9's permanent one. The RimWorld
analogue the whole gate is built on (`docs/design/rimworld-reference.md` §2.2) is a refusal that
STATES THE REASON, and one reason for three facts is the shape it exists to prevent.

⛔ **AND TERM 1 SHIPPED UNCOVERED IN THE FIRST CUT — caught by independent review, recorded because
the shape recurs.** Replacing `if (!pod.Powered || !pod.IsOperational(sim.Defs))` (`:402-403`) with
a never-true predicate left **83/83 GREEN** across every file naming `ThawGate`, and swapping the
`PodAlreadyOpen` ↔ `PodNoSignal` labels left **56/56 GREEN**; the control (dropping the `IsOpen`
check instead) went red, so the fixtures could bite — it was specifically the `Powered &&
IsOperational` conjunct and the reason LABELS that nothing saw. **The fourth trap shape, twice:**
the reason codes were compared against `Evaluate`'s own output (a code compared to itself), and the
two `>= 6` non-vacuity floors were POPULATION COUNTS — under the mutation the dead capsule falls
through to `Rung` and seven distinct codes still clear a floor of six. The deletion is **run-ending**,
not cosmetic: a dead sleeper's thaw is accepted and billed 3 `ControllerModule`, `CryoSystem`'s own
OD-9 guard never advances it, and the capsule sits at `Progress > 0` forever with term 3 refusing
every remaining thaw. Closed by `TermOne_SpeaksItsThreeSentences_AndEachLegIsolatesOneConjunct`,
which pins each sentence **against a literal**, isolates one conjunct per leg with the precondition
asserted BEFORE the drive, and carries an inclusion control. ⚠️ `PowerSystem` re-derives `Powered`
at the end of the same tick, so the depowered leg's precondition can only be asserted before the
send — the command drain runs BEFORE the systems, which is what makes that leg drivable at all.

⚠️ **TERM 6 HAS NO REFUSAL SENTENCE AND NO `ThawRefusal` MEMBER, DELIBERATELY.** Term 4 reads the
ship's loose stock through `LooseMatter.Affordable` and term 6 spends it through
`LooseMatter.TryPay` — the same lens, the same state, one synchronous command — so **the charge
cannot refuse**. A `Price` member would be a reason nothing can produce: a §13 "wired but nothing
reaches it" entry from birth, inside the package written to end silent refusals. The spend is still
CHECKED (`Commands.cs:885`), as a disclosed, UNTESTED defensive guard — the
`CommissionDeviceCommand` precedent — because "cannot fail" is a claim about today's callers and the
alternative is a capsule that cycles for free.

#### WHY THE HOST CALLS THE GATE, AND WHY THAT IS NOT A SECOND AUTHORITY

`HandleMoss` calls `ThawGate.Evaluate` to RENDER the answer and enqueues the command
**unconditionally**. Both halves are the design: reading the gate is what puts the refusal on screen
in the same frame as the click, and enqueueing regardless is what stops the host becoming a gate a
load, a replay and the TUI would all disagree with. There is exactly **one implementation of every
term**, it is in Sim.Core, and `ThawCommand.Execute` re-runs it authoritatively. The wire reply is
`WireFormat.MossThaw` (`hosts/web/WireFormat.cs:923`): `ok` · `pod` · `why` (the `ThawRefusal`
ordinal, `ThawGate.cs:38`, append-only) · `reason` (the sentence). **A code with no sentence is
unrenderable and a sentence with no code is unstylable, so both ship.**

#### ⛔ THE THAW IS A MOSS *SCREEN* VERB, NOT A MOSS *LANGUAGE* VERB

`MossBindings.RegisterAdapters`'s switch (`sim/Sim.Dsl/MossBindings.cs:29-42`) is **not touched** and
no adapter exists for a `CryoPod`. `ScriptRuntime.Tick` consults no device at all — not `Powered`,
not `Condition`, not `Scriptable` — so a ten-line installed program carrying a thaw verb could empty
the cryo bay unattended, which is the opposite of the owner's *"only one after the other"*. It is
**not a console-prompt verb either**: `ExecConsole` inherits its authority from the DSL adapters
(IX-M40), so a typed `thaw` line would be the one verb granting authority the DSL withholds. Both
are pinned — `NoMossAdapterIsRegisteredForACryoPod` (with a registered `AirVent` as the inclusion
control, because the switch simply not listing `CryoPod` would make the naive assertion hollow) and
`WebThawTests.TheConsolePrompt_CannotThaw`. **This is not reversible later without breaking saves.**

#### ONE SOURCE OF TRUTH, BY ASSERTION AND NOT BY CALL

`ThawGate` may not name `ShipLedger`: `ArchitectureBoundaryTests.TheLedgerIsNotReachableFromAnyTickPath`
denies the identifier to every file in Sim.Core but the ledger's own, deliberately with no scope
filter, and `ShipLedger.Sample` allocates an `int[]` per census. So the gate re-reads the same live
state (`Headroom`, `:530`) and **`TheGateAndTheLedgerAgree_OnADrivenShip` requires the two to be
equal after a driven sim-hour** on `LivingCrew`, `FoodUnits`, `TankLiters`, `BreathableO2Moles` and
both derived per-crew rates. Measured on `--ship wreck` at boot: **1 living crew · 60 u food ·
300.0 L · 4 497.367 mol O₂ · 1 working scrubber covering 3**.

⚠️ **AND THE FLOORS ARE ABSOLUTE, BECAUSE A RATIO SUITE CANNOT SEE A 2× ERROR** (seventh trap shape;
E0-9's whole gate went green with `DaysOfFood` 2× wrong). `TheHeadroomReadsInABSOLUTEUnits_NotRatios`
pins measured literals: `FoodUnitsPerCrewPerDay = 1.3889 u` (2.7778 is the E0-9 mistake — reading
`sustenance.def`'s COMMENT, which says one meter per day, instead of `needs.def`'s tuning, which
fills it in two), `LitersPerCrewPerDay = 1.0 L` (thirst fills in one sim-day, self-serve at 0.5, a
drink is 0.5 L), `O2MolesPerCrewPerDay = 26.2656`, and the wreck's own **21.6 d food / 150.0 d water
/ 85.6 crew-days O₂** for the crew a thaw would create. Physically applying a 2× to the food rate
reddens this test, the agreement test and the food sentence.

#### THE HEADROOM TERMS, AND WHICH ONE ACTUALLY BITES

- **Scrubbing is a STEP FUNCTION** — `0.001 / 2.73e-4 = 3.663` crew per working scrubber, strict
  surplus, so **one scrubber covers 3 and two cover 7**. On the wreck exactly one scrubber
  (`scrubber_cryo`, 0.55) is powered and above `fail` at boot, so thaws 2 and 3 pass and the fourth
  soul is a wall the player repairs their way through — after which a *tier* unlocks, not a step.
  Driven end to end by `TheScrubbingTerm_SaysHowManyCrewItCovers_AndASecondScrubberUnlocksATier`.
- **Food is the only continuous term** and it stops biting the moment a grow bed is repaired.
- **Water** is food's shape; the wreck stands at 300 L, i.e. 150 sim-days for two.
- **O₂ REPORTS AND NEVER BINDS** — ~86 crew-days for two on the wreck against a 1.0 floor, because a
  powered vent injects gas from nothing and there is no reserve to run down. It is kept so the
  report does not lie by omission. **The pacing is the ladder; the headroom is the ship talking.**

**No def field ships.** `MinDaysOfFood = 3.0` (`:348`), `MinDaysOfWater = 3.0` (`:352`) and
`MinO2CrewDays = 1.0` (`:364`) are named constants, and the rung table stays a literal — the
`CryoSystem.ThawSecondsPerCycle` / `BuildSystem.FloorConstructTicks` precedent. `thaw_cost_base` and
`thaw_cost_step` are **deliberately NOT shipped**: OD-L replaced the per-pawn price with the ladder,
and two prices would be one price too many. ⇒ **P4 and P5 do not move.**

#### PIN-NEUTRAL

P1–P5 all hold. A command nobody sends changes nothing (the E0-5 shape): `ThawGate` is a static and
is **not registered as a system** — registering it would fold a seed and move P1/P2/P3 for nothing —
no `Device` field, no def field, no save chapter, no `GlyphColor`. Check A
(`git diff main...HEAD -- tests/Perilune.Tests/Golden/ ci.sh content/`) is empty and the P1 twin-run
matched at `25f604dd61b221fb`.

#### ⚠️ WIRED BUT NOT CONNECTED — read this before believing a player can do it in the browser

**There is no client sender for the `thaw` op.** The POD BAY that would send it is **M3-4's**, and
this package's browser beat is deferred BY NAME to M3-4 (whose acceptance step 5 drives the cycle
refusal) and M3-13 (whose steps 0 and 2 drive the reasons); both charters accept it. So today the
verb is complete and reachable **over the wire and from the sim**, and unreachable **from the
running game's UI**. A `--ship wreck` player still cannot thaw anybody by clicking, and the reason
is a missing button, not a missing gate.

**The debts this package was owed, both paid.** `PodIdentityTests`' 3 000-tick immutability run now
commissions the console with a real `CommissionDeviceCommand`, sends a real `ThawCommand`, and is
required to have OPENED a capsule and produced a live citizen before the claim is read (non-vacuity
5) — a thaw is the code path most likely to want to write a pod's name, and it does not.
M3-6's deferred band-edge sweep is `TheRungTheGateResolves_ChangesAtEverySixInteriorBandEdge`, which
crosses **all six** interior edges (0.92 · 0.90 · 0.87 · 0.85 · 0.82 · 0.80) through the six-term
contract with every ladder item stripped, and asserts the rung steps by exactly one AND that the
SENTENCE differs either side. Six, not four: *the edge that is never crossed is the edge nobody
chose.*

---

### 13.31 ⭐⭐ The ship's doors and vents answer ONLY to a live MOSS server (M3-15 / OD-N, 2026-08-01)

**The player sentence.** Before this package, on `--ship wreck` at tick 0, a door opened with a free
click AND `open door_d0_s1` typed into an ungated MOSS prompt. After it, the two remote-actuation
commands refuse on a ship with no live MOSS server, the Room Zoom's click verb is deleted outright,
and **bringing the computer back is the first thing the wreck asks of you.**

#### THE PREDICATE, AND WHY IT IS `maintain` AND NOT `fail`

```
a MOSS server is LIVE  ⇔  ∃ Device d : d.Kind == Terminal && d.Powered
                             && d.Condition >= Defs.Machines[(int)Terminal].MaintainBelow   // 0.20
```

`MossGate.IsServerLive` (`sim/Sim.Core/MossGate.cs:81`) — a zero-alloc static, sibling of
`ThawGate`, **holding nothing**: no instance field, no mutable static, no def field, no hashed
state. ⚠️ **The threshold is the correction this package measured rather than inherited.** The
charter's own term was `Powered && IsOperational`, and `Device.IsOperational` is `Condition >=
FailBelow` (`Device.cs:119`), `Terminal`'s `fail` is **0.02** (`MachineDefs.cs:42`) while `term_moss`
is authored at **0.14** (`AuthoredShips.cs:2059`) — so **that term is TRUE at boot** and the gate
would have shipped OPEN. `MaintainBelow` (0.20) is the sim's own *"this machine wants a service"*
line; `term_moss` fails it by 0.06 and clears it after **any** service (bare hands ⇒ 0.60). Pinned
with its own non-vacuity precondition (`IsOperational == true` asserted in the same test) by
`MossGateTests.TheWreckBootsWithADarkConsole_AndItIsTheMaintainThresholdThatMakesItDark`.

⚠️ **`Powered` is asked separately and that is not double-stating** — `IsOperational` never reads it.
⚠️ **`Powered` is stamped by `PowerSystem`, not by authoring**: a freshly built plan reads
`Powered = true` on every device, so any census of this predicate must tick first (measured at 40).

⚠️ **ANY healthy powered Terminal is a MOSS server — there is deliberately no name literal in
`sim/`.** Integrator ruling 2026-07-31: on the wreck the back door is theoretical (`term_nav` is at
(41,2,1), `Powered = false`, `NetworkId = 0`, unreachable in the boot flood, and authored at 0.03 —
below `maintain` twice over), and a `Name == "term_moss"` test would make every other ship
ungateable. **It goes live the moment content authors a second reachable powered Terminal on a
wrecked ship — a content-review item, not a code one**, and it is pinned as a FACT by
`ANY_HealthyPoweredTerminalIsAServer_AndTheWreckSecondOneIsNeither`.

#### WHERE THE GATE LIVES: THE COMMANDS, BECAUSE THERE ARE FIVE ROUTES

`SetDoorStateCommand.Execute` (`Commands.cs:39`) and `SetDeviceStateCommand.Execute` (`:77`), each
one line, first statement. Not a host, because a host-side check is *"not replayed on load, not
folded into the hash, and not present in the TUI"* (M3-3's precedent) and would leave four back
doors — the deprecated console cursor, the TUI, `hosts/scenario`, and **MOSS's own DSL adapters**
(`Sim.Dsl/DeviceAdapters.cs:38`), which every installed program and every typed console line goes
through. Driven, with no host in the picture, by
`ADoorDoesNotMoveOnADeadServerShip_DrivenOnTheSimWithNoHost` and
`TheMOSS_DSL_AdapterIsGatedToo_AndItIsTheRouteAHostCouldNotClose`.

⛔ **AUTHORING AND SAVES ARE NOT COMMANDS AND ARE NOT GATED.** `AuthoredShips.cs:508` /
`ShipPlanBuilder.cs:31` / `SaveReader.cs:345` write `Device.IsOpen` as a **field**. The wreck still
boots with its authored-open doors open and a save still restores an open door on a dead-server
ship (`AuthoredOpenDoorsStillBootOpen_OnADeadServerWreckAndOnTheGrid`,
`ASaveRestoresAnOpenDoorOnADeadServerShip`).

#### THE SPLIT GATE — the console, op by op, as shipped

Two tiers, two predicates, two files, named so the split reads in the code.

| `HandleMoss` op | tier | predicate | the refusal |
|---|---|---|---|
| `sys` (`GameSession.cs:452`) · `audit` (`:506`) · `exec` (`:465`) | **REPAIRED** | `MossGate.IsServerLive` | `MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR ONE TO REACH THE DOORS` |
| `exec` → `open`/`close`/`lock`/`unlock`, `set <dev>.rate`, bare `<dev>.<prop>` reads | **REPAIRED** | (inside `exec`) | same |
| `open` (program source, `:472`) · `set` (program install, `:495`) | **COMMISSIONED** | `MossGate.CanInstallProgram` (`MossGate.cs:146`) | `MOSS IS NOT COMMISSIONED — FIT A CONTROLLER MODULE TO TERM_MOSS` |
| `thaw` (M3-3, `:571`) · `pods` (M3-4, `:530`) | **COMMISSIONED** | `ThawGate.IsCommissionedConsole` — **and since M3-4 the SHIP gate is asked FIRST on both** | ship: the OFFLINE sentence · target: `NO COMMISSIONED CONSOLE — FIT A CONTROLLER MODULE TO A WORKING TERMINAL` (`pods` answers `MossGate.NotCommissionedRefusal` instead, because it refuses before it names a capsule) |
| ⭐ `commission` (M3-17, `GameSession.cs:663`) | **REPAIRED** — *the act that crosses the split, so it can only sit on this side of it* | `MossGate.EvaluateCommission` (`MossGate.cs:290`), whose term 1 IS the ship gate | ship: the OFFLINE sentence · target: `ALREADY COMMISSIONED — PROGRAMS AND THE POD BAY ARE OPEN ON TERM_MOSS` · price: `COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0`. Accepted: `COMMISSION ACCEPTED — TERM_MOSS — 1 CONTROLLER MODULE FITTED; PROGRAMS AND THE POD BAY ARE OPEN` (**stream 1**, via `Reply` — §13.41) |

⚠️ **THE COMMISSIONED TIER IS TWO DIFFERENT PREDICATES AND THAT IS DELIBERATE.**
`ThawGate.IsCommissionedConsole` additionally requires the named terminal to EXIST, be `Powered` and
be above `fail` — right for a thaw performed at a specific console, **wrong for a program**, because
`SetScriptCommand` deliberately allows a tid with no device behind it (a free-text key `hosts/scenario`
and several tests drive). `MossGate.CanInstallProgram` **is** `SetScriptCommand.Execute`'s own
predicate, so the console cannot report a refusal the command it is about to enqueue would not make.

⭐ **`set <dev>.rate` sits at the REPAIRED tier and that is the CHARTER'S ruling, not the owner's.**
OD-N's line is *manual vs scripted*; it says nothing about which field a manual command writes. The
reason: `set rate` is one typed line producing one immediate write through the SAME
`SetDeviceStateCommand` as `open`, so scoping it with the device verbs is the only cut that does not
split one command across two tiers. **Consequence, stated once: OD-O's puzzle straddles the gate** —
diagnose and probe are repaired-tier, the `every 1s:` fix is a program and therefore commission-tier.
That gap is OD-O's own, not a scheduling error.

⛔ **EVALUATION ORDER IS CONTRACT: SHIP FIRST, TARGET SECOND.** The two predicates are disjoint, both
can be true at once, and nothing else states which sentence the player gets. A player on a
dead-computer ship must be told **MOSS IS OFFLINE**, not sent across the pressure frontier to fit a
module (`OnADeadShipTheOfflineSentenceWinsOverTheCommissioningOne`). M3-16's `CONTROLLER FAULT —
BOARD UNRESPONSIVE` is a THIRD sentence from a fourth predicate about the TARGET; the offline
sentence is asserted **not** to contain the word CONTROLLER so the two cannot be confused.

#### THE REFUSAL IS REPORTED BY THE SAME STATIC IT IS REFUSED BY — THREE SURFACES, NO NEW EVENT

`GameSession.Refuse` (`:560`) puts it on `MossExec`'s **stream-2** line, which the MOSS transcript
renders on **every** screen. A refused `sys` **also** emits an empty `MossSys` carrying the sentence
as its derivation note — without it the DETAIL screen would sit on `LOADING…` for ever beside a
transcript line saying why. The operate reply (`GameSession.cs:1308`) and the TUI `_status`
(`GameLoop.cs:274`, `:310`) call the same static. **A refusal event on the bus was refused**:
`DoorStateChangedEvent` is published after a SUCCESSFUL write, and a refusal event would be a new
type consumed by one host where the constant is consumed by three.

#### WHAT THE CLIENT LOST

Deleted from `client/src/`: the OPERATE help line, `_operableTiles` + its derivation, the ring +
OPEN/SHUT plate layer, the click branch, `doOperate`, the reply renderer, the `O` key, `arm()`'s
`wasOperate` crossing (`roomzoom-view.js`); `roomOperableTiles`, `operateLayerSvg`, `OPERABLE_KINDS`,
`OPERABLE_NAME_BY_KIND`, `isOperableKind` and the palette row (`room-model.js`); `Cmd.operate`
(`session.js`); `decodeOperate` (`messages.js`); the `case 'operate'` dispatch (`main.js`); the
`OPERATE` order verb and its `O` control row (`onboarding.js`). Also deleted:
`client/test/operate-model.test.js` and `client/tools/operate-shot.mjs`. **`ROOM_TOOLS` is 18 → 17 —
the first time that number has gone DOWN.** Anti-resurrection guard: `surface-boundary.test.js` §3b,
six per-file scans over `codeOnly` plus one negative control and **18 inclusion controls** (one per
token, planted as live code into the very file that must not contain it).

⛔ **WHAT SURVIVES ONE MORE PACKAGE, stated so a reader can tell excluded from missed:**
`GameSession.HandleOperate`, `CmdKind.Operate`, `hosts/web/WireFormat.Operate.cs` and
`OperateVerbTests.cs`. M3-14 landed a rung-3 pin inside `OperateAdvisory` the day before, and the
host handler is the cheapest place to prove the sim gate bites from a surface. **FILED: they become
dead player-facing code at 6b and retire inside M4-8's console-deletion sweep.**

⭐ **AND ONE FILED DEFECT CLOSES ON THE WAY.** `GameSession.cs` recorded that *"the premise's opening
move is still not expressible"* — `vent_ls` reads `Explored = false` at tick 0, 600 and 36 000, so
the fog-gated OPERATE verb honestly refused it. **MOSS addresses devices by NAME, not by tile, so the
fog gate does not apply**, and all 19 doors and vents resolve in the MOSS registry at boot. The M1
gate sentence is expressible for the first time — through the console, after one repair.

#### ⛔⭐ PIN STORY — **P1 MOVED (PIN M3-e)**, AND THE CHARTER'S CENSUS OF IT WAS WRONG

⚠️ **Check A is NOT zero on this package, and it is the pin ritual that makes it non-zero — nothing
else.** `git diff main -- tests/Perilune.Tests/Golden/` = **0 lines** and
`git diff main -- content/` = **0 lines** (no golden rewritten, no def touched); the whole of check A's
output is `ci.sh`, carrying the new P1 literal, its FAIL text and the why-paragraph below. A diff in
either of the other two paths would mean something else moved and is a STOP.
**P2, P3, P4 and P5 HOLD** — the two tick-3000 goldens are green in the suite and the two defs
checksums print `0c5ddbc07e41f07d` / `09900b9a44119272` unchanged. ⛔ **P1 MOVED — PIN ROW M3-e, 2026-08-01: `25f604dd61b221fb` →
`13674ebc4f8a14a9`**, twin hashes MATCH on the new value.

⭐ **THE CAUSAL CONTROL IS A 2×2, ALL FOUR CELLS DRIVEN, AND THE HEADLINE IS THE FOURTH:**

| tree | gate ON | gate OFF (the two lines deleted, nothing else) |
|---|---|---|
| **no `term_main`** (as the lane found it) | `6d6e009299e6e86e` | `25f604dd61b221fb` — the pre-OD-N baseline, **to the digit** |
| **`term_main` authored** (as shipped) | ⭐ **`13674ebc4f8a14a9`** | ⭐ **`13674ebc4f8a14a9` — IDENTICAL** |

⇒ ⛔ **ON THE SHIPPED TREE THE GATE IS INERT ON THIS PIN.** Once the fixture has the terminal its own
program has always claimed, the gate refuses nothing there — so **every bit of P1's move is the one
authored device** (a `Terminal` draws 0.1 kW and sheds 0.1 kW of waste heat into a compartment this
fixture keeps deliberately tight), and **none of it is the gate**. It is also not cached state:
`MossGate` holds nothing (`TheGateAddsNoHashedState` — no instance field, no mutable static), no save
chapter moved, no def field exists.

⚠️ **The bottom-left cell is what the lane measured FIRST and it is the weaker claim** — "delete the
gate and the old hash returns" is true of the tree BEFORE the fix and would be false, and misleading,
if quoted about the tree that shipped. Both rows are recorded because a reader who takes one number
out of this table gets the wrong story; it is this repo's own eighth-trap shape (*a merged file's
truth is a number neither lane could compute*) pointing at a pin note instead of a census.

⭐ **THE CAUSE: P1'S FIXTURE IS NOT A SHIP THE CHARTER SURVEYED.** `--days 3 --seed 42` runs
`hosts/scenario/Program.cs`'s hand-built `BuildScenario` — a 22×6 ASCII section — and **it authors no
`DeviceKind.Terminal` at all**. Its life-support watch is installed on `term_main`, a script id with
no device behind it (`SetScriptCommand`'s own remarks record that this is deliberate and that
`hosts/scenario` relies on it). So on that fixture `MossGate.IsServerLive` is **false forever**, and
the watch's `open(vent)` — which fires in **day 2**, when hydro dips below its 96 kPa trigger — is
refused. Measured, day by day: hydro `96.2 → 98.4 → 97.7` before, `96.2 → 95.1 → 94.3` after.

⚠️ **The charter's own table said "P1 — the full 3 days — 0 `IsOpen` transitions, 0 `Rate`
transitions".** Re-measured here, that is true of a PROCEDURAL ship (`ProceduralShips.Generate`,
which does carry a `Terminal`: driven, 0 flips, hash identical gated and ungated) and **false of the
ship P1 actually runs**. The fixture table's four rows — perilune / slice / grid / wreck — never
included the scenario ship. **The lesson is the repo's own: a count you did not measure yourself is
not evidence, even from a charter.**

⭐ **BOTH OPTIONS PRICED, BECAUSE NEITHER IS FREE:**

| option | P1 | what the fixture then does |
|---|---|---|
| ship the gate as-is | `6d6e009299e6e86e` | the watch is inert; hydro coasts to 94.3 kPa by day 3 |
| ✅ **TAKEN — also author `term_main` as a real `Terminal`** (one line in `BuildScenario`) | ⭐ **`13674ebc4f8a14a9`** | the watch works again (98.4 at day 2, 98.1 at day 3), and the fixture's fiction — a program running on a terminal — becomes physically true |
| revert the gate | `25f604dd61b221fb` | OD-N not shipped |

⇒ **There is no zero-move option.** Adding the device moves the hash too (a Terminal draws 0.1 kW and
sheds 0.1 kW of heat into a compartment this fixture deliberately keeps thermally tight).

✅ ⭐ **INTEGRATOR DECISION, 2026-08-01 — OPTION 2 TAKEN, AND PIN ROW M3-e IS THE COST.**
`hosts/scenario/Program.cs`'s `BuildScenario` now authors `term_main` as a REAL
`DeviceKind.Terminal` at (17,3,0) — adjacent to the `c_leg1` conduit, so `PowerSystem` really wires
it. **Three reasons, and the second is the load-bearing one.** (i) OD-N is binding, so reverting is
not available. (ii) ⛔ **Shipping as-is would leave the fixture's authored watch permanently inert,
which removes the pinned window's ONLY script→device actuation path** — the ninth trap shape, an
instrument narrowed until it goes blind, on the one pin that watches a MOSS program drive hardware.
(iii) It makes the fixture's own fiction physically true and aligns it with every other fixture ship
(a healthy Terminal ⇒ the gate is open at boot — this package's own fixture-ship rule).
**Re-measured on the merged tree, never quoted:** hydro is back to `96.2 / 98.4 / 98.1` kPa and the
twin match reads `13674ebc4f8a14a9`. `ci.sh`, this file, `CLAUDE.md` and `HANDOVER.md` move in the
SAME commit; the `pin/m3-e` tag is the integrator's at merge.

**What DOES hold, and is pinned:** every AUTHORED fixture ship — perilune, slice, grid — boots with
the gate OPEN (`term_hydro`, `Condition 1.000`, `Powered`), by
`EveryFixtureShipBootsWithTheGateOPEN`; and the authored `DefaultProgram`'s `open(vent_hydro)` still
reaches `Device.IsOpen` on the pinned ship (`ThePeriluneProgramsVentStillOpens`) — the non-vacuity
control for a neutrality that is otherwise a zero. ⚠️ **P2/P3's neutrality remains a measurement of a
WINDOW, not a proof about the mechanism**: a content change that made hydro pressure dip inside
3 000 ticks would move them **through this gate**, exactly as it just moved P1 at 3 days.

⚠️ **THE ARCHITECTURE CARVE-OUT.** `ArchitectureBoundaryTests.Economy_KnowsNothingAbout…` forbids the
identifier `Moss` in economy code; `Commands.cs` now carries it twice. Declared as a **NOMINAL**
crossing with its count pinned at 2: `MossGate` is a Sim.Core static, not `Sim.Dsl`, so no `using`,
no DSL type and no runtime reach is acquired — only the word, because the rule is named after the
fiction it enforces. **A third occurrence fails that test and must be argued.**

#### WHAT THIS DOES NOT DO — filed, not fixed

- **The onboarding still teaches the OLD first order.** OD-N re-cuts the opening beat from *"repair
  something so the lights come back"* to *"repair the computer"*, and three surfaces still say
  otherwise: `client/src/ui/onboarding.js` (prose), `GameSession.AwaitingOrdersLabel` (M2-20) and the
  boot tile reason (M2-18). **M4-5 owns the onboarding rewrite**; this package edited exactly one
  thing there — the deleted OPERATE verb — because a card advertising a verb that no longer exists is
  a lie, not a narrative choice.
- **Fixtures that had no computer now need one.** A hand-built world has no authored Terminal, so
  `SetDoorStateCommand` refuses in it. `BuildHaulSiteBackoffTests` adds a pristine `term_fixture`;
  `OperateVerbTests.Boot` services `term_moss`; `WreckRepairEconomyTests` **drives** the repair rather
  than writing the field, because writing it removes a maintenance job AND the consumable that job
  would have spent (measured: `wing_b` ended at 0.883 instead of below the 0.25 floor).

---

### 13.32 ⭐⭐ The POD BAY — twelve capsules, and every closed one says why (M3-4, 2026-08-01)

**A player can now see who is aboard.** Typing `pods` at the MOSS prompt sends
`{"type":"moss","op":"pods","tid":"@console"}`, which reaches `GameSession.HandleMoss`'s new `pods`
case (`hosts/web/GameSession.cs:528`) and comes back as a `moss ev:pods` reply
(`hosts/web/WireFormat.Pods.cs:202`) carrying one row per `DeviceKind.CryoPod`. On `--ship wreck`
that is **twelve rows: one OPEN (Rell), four NO SIGNAL (the raid's four), seven SEALED** — the
census `AuthoredShips.WreckPods` authors, re-derived by `WebPodBayTests` rather than copied.

```
POD BAY                                            term_moss · COMMISSIONED
  #  OCCUPANT      STATE       WHY / WHAT IT NEEDS
  1  RELL          OPEN        —
  2  OZAWA         SEALED      READY — 2 SEALS                        [THAW]
  3  VANCE         NO SIGNAL   —
  7  TORRES        SEALED      NEEDS 3 CONTROLLER MODULE — SHIP HAS 0
  9  LINDQVIST     CYCLING     POD LINDQVIST IS CYCLING — 4 min
```

#### WHERE EACH COLUMN COMES FROM — the host asks, the client renders, NEITHER re-derives

`WireFormat.BuildPods` (`WireFormat.Pods.cs:106`) calls `ThawGate.Evaluate` **once per capsule** and
puts the answer on the wire whole. Nothing in the host or the client re-computes a term.

| column | source | note |
|---|---|---|
| `#` | the 1-based index in `Device.Id` order | not the device id — four-digit noise in a 12-row table |
| OCCUPANT | `CryoSystem.SleeperName` (`Systems/CryoSystem.cs:239`) | **widened `internal`→`public` by this package**: the alternative is a second copy of the `"pod_" + who` convention in another assembly |
| STATE | derived from the VERDICT, not the device (`WireFormat.Pods.cs:118-127`) | `PodAlreadyOpen`⇒OPEN · `PodNoSignal`⇒NO SIGNAL · `PodCycling && PodId == this pod`⇒CYCLING · else SEALED |
| WHY | `ThawGate.DescribeRow` (`sim/Sim.Core/ThawGate.cs:789`) | delegates to `Describe` for every refusal; `READY — 1 SEALS` for the one verdict that is not one |
| `[THAW]` | `ThawVerdict.Allowed`, carried as `can` | the affordance IS the gate — see below |

⭐ **CYCLING IS THE ONE NON-OBVIOUS DERIVATION.** Term 3 refuses *every* capsule while *any* capsule
is mid-cycle, so a bay reading the refusal alone prints CYCLING twelve times. The verdict carries the
**cycling** capsule's own `PodId`, so `PodCycling && PodId == this pod` is *"this one is running"* and
`PodCycling && PodId != this pod` is *"the bay is busy with somebody else"* — two different things the
player needs to read, told apart without a second pass over `Device.Progress`.
⚠️ **The countdown is the gate's sentence, verbatim** — that is M3-3's `MinutesLeft(0f)` filing
discharged by construction: there is no second derivation to disagree with it.

#### ONE RULE, THREE DOORS (RW §2.2 + §8.4 rung 3)

`[THAW]`, `ENTER` on the selected row and the typed `thaw <n|capsule|name>` all reach
`activateThaw` (`client/src/ui/moss-model.js:958`), which reads the row's `can` bit and **nothing
else** — never the state word, never the refusal ordinal. A refused capsule answers with **the row's
own reason**, which is the gate's sentence. The client's refusal can at worst be one second stale;
the sim re-evaluates and is authoritative either way.

⭐ **SINGLE-FLIGHT** (M3-3's filed double-thaw): the model latches the asked-for capsule
(`pods.thawing`) from the moment the ask leaves until a `pods` reply shows that row is no longer
`can` — i.e. until the SHIP has moved. `HandleMoss`'s thaw op evaluates, replies, then enqueues, so
two asks inside one tick both read `Progress == 0` and both hear ACCEPTED while only the first
cycles; this surface can no longer produce that pair.

#### THE THREE MOSS STATES, AND THE DOOR THAT REFUSES IN WORDS (OD-N)

The bay is COMMISSION-gated (M3-3 term 2, unchanged). The op asks **the ship gate first**:

| ship | console | what the player gets |
|---|---|---|
| no live server | — | `MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR ONE TO REACH THE DOORS` |
| live | not commissioned | `MOSS IS NOT COMMISSIONED — FIT A CONTROLLER MODULE TO THE TERMINAL` |
| live | commissioned | the bay, headed `term_moss · COMMISSIONED` |

⛔ **NEVER AN EMPTY BAY.** Both refusals are `ev:exec` stream-2 lines and the screen does not open,
because the command does not navigate — **the reply does** (`reducePods`, `moss-model.js:362`, gated
on the `podsAsked` handshake so an unsolicited bay cannot yank the screen). A POD BAY drawn empty
beside a sentence explaining why it is empty is the M3-13 defect this package was warned about by
name.

⚠️ **`ThawGate`'s term-2 sentence was RE-WORDED here** (`ThawGate.cs:750`): `NO CONSOLE — MOSS IS
OFFLINE` → `NO COMMISSIONED CONSOLE — FIT A CONTROLLER MODULE TO A WORKING TERMINAL`. M3-15 made the
old wording false for the state it now fires in most — a player at a console that just opened a door
would go and repair a terminal that works. The family (this · `MossGate.OfflineRefusal` ·
`MossGate.NotCommissionedRefusal` · M3-16's shipped `CONTROLLER FAULT — BOARD UNRESPONSIVE`) is pinned
**pairwise distinct AND with different first four words** by
`ThawGateTests.TheConsoleSentences_ArePairwiseDistinct`; the M3-15 review found only one of the three
pairs guarded. Refusal strings are not hashed — **no pin moved.**

⭐ **AND THE `thaw` OP GAINED THE SAME SHIP GATE** (`GameSession.cs:564`), discharging M3-15's other
filing: until this package a DARK ship answered target-side sentences (`NO SUCH POD`) from a computer
that is off.

#### WHICH CONSOLE — `ThawGate.CommissionedConsoleName` (`ThawGate.cs:507`)

The prompt addresses the `@console` pseudo-tid (spec §1.3), which has **no device behind it**, so the
bay's term 2 would refuse on every ship forever. The sim resolves the lowest-`Id` terminal its own
`IsCommissionedConsole` accepts — the finder is *defined* as that predicate, so it is not a second
rule — and the host puts the name on the reply as `term`; the client sends **that** name back with a
thaw. A client picking one would be guessing at `Device.Scriptable`, which has never reached the wire.

#### THE HEADROOM LINE SAYS WHICH FOOD NUMBER IT IS

`WireFormat.PodsHeadroomNote` (`:155`) renders `ThawGate.Headroom` under the table and states, in
words, that its FOOD count is **all stock aboard, carried and reserved included — not the loose stock
a rung's `SHIP HAS` reads**. Two numbers, two questions, one screen; the sim's accounting is
untouched (M3-3's filed item, answered as the display question it is). Driven non-vacuity: the two
agree at boot (60 = 60) and part company the moment a stack is reserved.

#### WHAT THIS DOES NOT DO — filed, not fixed

- **The bay POLLS at 1 Hz while it is up** (`moss-screen.js:79`). It is a request/reply op, not a
  pushed channel, and `GameSession.Send` drops a byte-identical payload — so re-asking on `systems`
  would stall on a quiet ship, which is most of a cycle. A pushed `pods` channel is the tidier
  answer and is a different package.
- **A pod that finishes with NO free exit tile still blocks the bay forever, silently** (M3-2's
  filing, carried). It reads CYCLING here and counts down to a number it never leaves; the gate
  cannot see the exit tile and neither can this screen.
- **The bay is reached through `hud.js`'s MOSS door**, which M4-8 deletes. This package added **zero**
  hud.js state — pinned by `surface-boundary.test.js` with a negative control — so M4-8 re-homes one
  door, not a cache.

---

### 13.33 ⭐⭐ Every thaw refusal reaches a surface, and the tile badge NAMES THE ITEM (M3-13, 2026-08-01)

**Two things changed for the player, and one wire tuple grew to carry the first.**

#### (a) `BlockedCell` gained a SIXTH element: `Detail`

`hosts/web/WireFormat.Blocked.cs` — the `blocked` tuple is now
`[x, y, deck, order, reason, detail]`, **appended, never inserted**. `Detail` is ONE int whose
meaning is decided by `Reason`, and the table lives in the struct's own doc comment because *an int
whose meaning depends on a sibling field is exactly the kind of thing that rots*:

| reason | `Detail` means | rendered as |
|---|---|---|
| `ReasonAir` (0) | — (`DetailNone`) | the reason's own sentence |
| `ReasonNoApproach` (1) | — | ″ |
| ⭐ `ReasonNoConsumable` (2) | **the `ItemKind` byte the order is waiting for** | `NEEDS PARTS — NOTHING ABOARD TO REPAIR IT WITH` |
| `ReasonUnreachable` (3) | — | the reason's own sentence |
| `ReasonWorkTypeOff` (4) | — | ″ |
| ⭐ `ReasonNoRoute` (5) | — | `NO WAY TO WALK TO IT` (D5, 2026-08-03 — §13.25 b3) |

⭐ **ORDER VALUE `3` (`OrderRepair`) HAD NO NAME IN THE CLIENT FROM M2-9 UNTIL 2026-08-03.**
`BLOCKED_ORDER_NAMES` was `['dig','strip','build']`, so `blockedOrderName(3)` answered `''`, and both
surfaces fell through: the badge read `ORDER BLOCKED — …` and the key `1 ORDER STUCK` for a machine
the player had explicitly right-clicked and told to REPAIR. Fixed with `'repair'` at index 3, and the
hand-written `deepEqual` that could not see the hole is now backed by a DERIVATION test that parses
the host's `Order*` constants and requires a name for every one (the `DEVICE_KIND_NAMES` precedent,
M2-10). Filed by `dropped-order-shot.mjs`, which observed it and now CHECKS it.

- **`DetailNone = -1`, not 0** — `0` is `ItemKind.Regolith`, so a zero sentinel could not be told
  from a payload and an airless dig would badge `NEEDS REGOLITH`. (`moss-model.js`'s DA-M1 rule for a
  screen row, applied to a wire int.)
- **A payload int, not a sixth reason code.** `ReasonNoInput = 5` would cost a mirrored constant, a
  vocabulary name, a sentence and a legend swatch **per item** and *still* not carry the item.
- ⛔ **THE HAZARD HERE IS THE POSITIONAL ARRAY, NOT A DELTA GATE.** `BlockedCell` has no `SameAs`
  and this channel has no field-list gate: `GameSession.Send` dedupes on the **whole serialized
  string** (`GameSession.cs:1783`), so a serialized `Detail` is inside the key by construction and the
  `DeviceCell` scar is unreachable. What IS reachable is a decoder destructuring FIVE by index — it
  keeps working and silently drops the field. **Decoder census, all updated in the same commit:**
  `client/src/wire/messages.js:decodeBlocked` (the only `client/src/` index-reader; reads `t[5]`,
  defaults `-1` on a five-element row) · `BlockedChannelTests.Tuples` and
  `PrioritiseOrderTests.Rows` (both now ASSERT width 6) · the three `.mjs` rigs
  (`blocked-shot`/`blocked-reach-shot`/`work-blocked-shot`) read `c[2..4]` only and are
  append-stable, re-read to confirm. The C# construction sites are compiler-enforced: the
  constructor takes six arguments **with no default**, deliberately.

⛔ **WHAT WAS WRONG WITH THE GENERIC SENTENCE — and the charter's own reason for it was FALSE.**
`NO PARTS OR SEALS ABOARD` (a) **omits Swarf**, a third tier that clears the row on its own, and
(b) **names no item to go and get**. ⚠️ It is **not** wrong because of `ControllerModule`: the
charter motivated this field with *"the existing `ReasonNoConsumable` is the wrong sentence for
`ControllerModule`"*, and a census says otherwise — `ControllerModule` has exactly two consumers,
`CommissionDeviceCommand` and `ThawGate`'s rung table, and **neither is a repair**. The repair
ladder is `Parts` ▸ `Seals` ▸ `Swarf`. The charter borrowed a THAW-side fact into a repair-side
justification; the field is right, the stated reason was not, and it is corrected here (and in
`WireFormat.ReasonNoConsumable`'s remarks) rather than quoted forward.

⭐ **THE ITEM IS ASKED, NEVER RE-DERIVED.** `GameSession.AddUnfixableRow` sends
`(int)MaintenanceSystem.WantedRepairConsumable` — the top rung of `RepairConsumableTier`, which is
now the ladder's ONE declaration and the same one `FindNearestConsumable` walks
(`sim/Sim.Core/Systems/MachineWearSystem.cs`, behaviourally unchanged: Parts ▸ Seals ▸ Swarf, the
bottom rung gated). ⚠️ **The row is emitted only when NONE of the three tiers is aboard**, so any of
them would clear it; the badge names the TOP one (what a servicer would actually pick up, and the
one that buys a full overhaul) and `— NOTHING ABOARD TO REPAIR IT WITH` is what keeps the sentence
true about the other two.

⭐ **ONE VOCABULARY, TWO SURFACES** (M2-18's rule). `ThawGate.ItemWords` is now **public** and is the
ONE place an `ItemKind` is spelled **inside a refusal sentence** — ⚠️ *not* the one place the game
spells one at all: the stockpile FILTER chips say `CTRL MOD` on both shipping surfaces
(`stock-filter-model.js:29`, `hosts/tui/Ui/StockFilterModel.cs:89`, pinned equal to each other) and
deliberately so, because a chip has a column to fit and a refusal has a line of prose. Two
vocabularies for two jobs is fine; two for ONE job is the defect. Within refusals: the MOSS POD BAY
composes host-side through
`ThawGate.Describe` (`NEEDS 1 CONTROLLER MODULE — SHIP HAS 0`), the tile badge composes client-side
through `ITEM_WORDS` in `client/src/wire/messages.js`, and the two are pinned equal by a test that
**parses `sim/Sim.Core/ThawGate.cs`** (`client/test/blocked-model.test.js`, the house tripwire idiom).
Re-word a case on either side and it reddens. The client spells it because the channel carries a
BARE INT and has carried no string since it shipped.

`blockedReasonSentence(reasonName, detail)` is the ONE entry point every surface words a row
through, and it degrades in two steps, never to `undefined`: an unnameable `detail` ⇒ the reason's
generic sentence; an unnameable REASON ⇒ `''` and the caller says *stuck, reason unknown*.
⚠️ `blockedKeyHtml` now dedupes on the **sentence**, not the reason code — two rows can share a code
and say two different true things, and keyed on the code the visible key printed one and swallowed
the other.

#### (b) The Prioritise menu no longer offers a repair the sim will never take

**The open defect from `HANDOVER`, closed.** `PrioritiseJobCommand` returns at
`device.Condition >= Machines[kind].MaintainBelow`, and `Condition` is clamped at or above zero — so
a kind whose `maint` is `0.00` can never satisfy it on any ship, forever. `CryoPod` is `0.00`
**deliberately** (§13.22c) and the def is not the thing to change; the MENU was.

- `MaintenanceSystem.IsEverServiceable(defs, kind)` is the sim's answer — *the permanent half of a
  comparison that already exists*, not a new rule.
- It travels on the **`devices` channel as an EIGHTH element, `serv`** (`DeviceCell`, and `SameAs`
  gained the clause **in the same commit** — `serv` is per-KIND and therefore constant within a
  session, so omitting it could not be caught by any live behaviour, which makes it the most
  dangerous omission in that struct rather than the most harmless). A client-side list of
  never-serviceable kinds would be a hand mirror of a DEF.
- `decodeDevices` defaults an absent `serv` to **1**, where `open` defaults to 0: in both cases the
  absent value must reproduce the behaviour that shipped before the element existed. A `serv`
  defaulting to 0 would withdraw M2-10's verb from every machine aboard, silently.
- `prioritiseOffer` refuses with `{ok:false, silent:false}` and **says why** —
  `CRYO POD IS NEVER SERVICED — NO REPAIR TO ORDER HERE`. RW §2.2: *the menu greys the entry and
  states the reason*; this menu is a single row, so a greyed row is an empty box and the reachable
  equivalent is the model's existing says-so-in-words outcome. Silence stays reserved for bare
  floor, which is not a target the player aimed at.

#### THE REFUSAL PRECEDENCE, PINNED

`ThawGate.Evaluate`'s term order already ranked the CONSOLE refusal above the RUNG refusal; M3-13
pins it (`ThawGateTests.TheConsoleRefusalOutranksTheRungRefusal_…`) with a **two-sided premise** —
the rung really is unaffordable, and a commissioned twin really does stop at it — so the test cannot
pass under a reordered `Evaluate`. A player at an uncommissioned console told *NEEDS 3 CONTROLLER
MODULE* would mine 24 Regolith for a bay that will not open when he gets back. Both surfaces inherit
the order because both render **this function's** answer: `DescribeRow` delegates every refusal arm
to `Describe` and ranks nothing of its own.

#### WHAT THIS DOES NOT DO — filed, not fixed

- **`Detail` has exactly one live meaning today.** Every real emission resolves to `Parts`, because
  the repair ladder is not per-device and the row fires only when all three tiers are absent. The
  field is shaped for the reason above (one int serves this reason and every future one), and the
  per-reason table is the price of that.
- **The APPROACH refusal for a repair order is still silent** — unchanged by this package, and
  §13.25's note stands: a machine with no walkable neighbour is refused and nothing is said.
- ⭐ **THE WRECK'S LARDER STOPS AT TWO — MEASURED, AND IT IS A PACING OBSERVATION, NOT A DEFECT.**
  M3-4 filed that switching REPAIR on lets the maintenance board spend and CARRY the wreck's stock
  down until every rung reads `SHIP HAS 0`. Driven again here (2026-08-01, `--ship wreck`, REPAIR
  on, top speed, 18 order passes over the 22 wrecked serviceable machines on deck 0): the loose
  count falls **10 → 2 in the first minute and then STOPS.** With two units still loose
  `IsUnfixableWreck` is false everywhere, so no `ReasonNoConsumable` row is due and none appears —
  correctly. ⇒ **The unpayable-repair state is not reachable in a bounded automated run on the
  shipping ship**, so `client/tools/thaw-blocked-shot.mjs` reports step 2a as an OBSERVATION that
  does not fail the run, and proves the two claims separately: the EMISSION by
  `PrioritiseOrderTests.TheNoConsumableRow_NamesTheItemTheOrderIsWaitingFor` (a real session, RED
  under the ladder mutation), the RENDER by injecting the row through the client's own dispatch
  (`blocked-shot.mjs`'s documented technique — the host is not modified), with the FIVE-element row
  drawn first in the same run as the before picture. Where the last two units sit, and why the board
  stops, is not this package's question.

---

### 13.34 ⭐⭐ One machine does not answer its switch — the malfunctioning board (M3-16 / OD-O, 2026-08-01)

**The player sentence.** Before this package MOSS was a remote control: every device answered one
verb and the language was decoration. After it, **one machine on the ship does not answer its
switch**, and the only way to get the upper deck breathing is to **write a two-line MOSS program**.

**OD-O, owner-direct 2026-07-31:** *"Let's make that a 'game' within MOSS, so the user has to do
some simple programming to activate the vent — storyline could be that the easy turn-off switch does
not work as the controller module is malfunctioning so we have to do a workaround."* Scoped by three
follow-ups: the vent is re-authored mechanically FINE with its board dead (no crewed repair) · the
path is PROGRAM-ONLY (no spend-a-module-to-replace-the-board alternative) · ⛔ **it is NOT a general
pattern** — *"an idea we can apply sometimes as a game element."*

#### (a) The fault is AUTHORED DATA. There is no fault mechanic.

`Device.Faulted` (`sim/Sim.Core/Entities/Device.cs`) — a bool, hashed at **bit 12** of the packed
device state word (`Simulation.cs:539-547`; b13–b15 remain free) and saved as **DEVC v6**. ⛔ **No
fault probability, no wear→fault path, no sweep, no command, no def row.** Its only writers are
`ShipPlanBuilder` (from the new `DeviceSpec.Faulted`) and `SaveReader`. **EXACTLY ONE instance ships
in M3** — `vent_d1` on `--ship wreck` — and that count is a **censused test with an inclusion
control** (`BoardFaultTests.ExactlyOneFaultedDeviceInTheGame…` plus
`TheFaultCensus_Catches_APlantedSecondFault`), not a convention. Zero on grid / slice / perilune,
where a fault would also be a re-pin.

`DeviceSpec` grew **`float? Rate`** and **`bool? Faulted`** on W1's `Nullable` precedent
(`ShipPlan.cs`). ⚠️ `Rate` is the one that would have repeated W1's near-miss exactly: a plain
`float Rate` reads `0f` out of zeroed memory, so every vent, scrubber and reclaimer in the repo
would boot at zero throughput. `AuthoredDamageTests`' census grew both columns, each with its own
planted-violation inclusion control.

#### (b) The re-authoring is THREE fields, and the second is the fault's visible half

`AuthoredShips.cs` — `vent_d1` is now `Condition = 0.62f, Rate = 0f, Faulted = true`.

| field | why, driven |
|---|---|
| `Condition = 0.62f` | above `AirVent.fail` 0.10 (**operational**), above `wear.wreck_threshold` 0.25 (not a one-way trip), **and above `AirVent.maint` 0.40 so no Maintain job the player never asked for appears beside the puzzle.** MEASURED: 0.6191 after 3 000 ticks, 0.6091 after 30 000; at wear 0.010/h it would not reach `maint` for ~22 sim-hours |
| ⭐ `Rate = 0f` | ⛔ **raising `Condition` ALONE makes the upper deck breathe at boot with no player action at all** — the injection branch asks exactly `IsOpen && Powered && IsOperational`. An open, powered, operational vent at rate 0 has `EffectiveRate = 0` and injects nothing. *The machine is fine; the board is dead* — the fiction and the arithmetic are the same sentence |
| `Faulted = true` | the refusal and the bleed |

#### (c) The switch is dead for EVERYBODY; the rate is writable by everybody

⛔ **THERE IS NO CALLER PRIVILEGE AND THERE MUST NOT BE.** `UtilityDeviceAdapter.TryInvoke` is
reached identically by an installed program and by the console prompt, so a fault that let a program
call `open()` while the console could not would be a permission invented from nothing — and the
owner's sentence does not ask for one: *the switch is dead for everybody.*

- **The refusal.** The predicate is sim-side (`DeviceFault.BlocksActuation`, `sim/Sim.Core/
  DeviceFault.cs`), the COMMAND enforces it (`SetDeviceStateCommand.Execute` — so the TUI, the
  scenario host and the deprecated cursor obey too), and the adapter **asks the same static** for the
  sentence rather than re-deriving the rule. ⚠️ **The `_open` half is gated and the `_rate` half is
  not**, in the same command. ⛔ **SHIP GATE FIRST, TARGET SECOND** — OD-N's `MossGate.IsServerLive`
  is asked before the board, so a player on a dead-computer ship is told MOSS IS OFFLINE rather than
  sent across the pressure frontier to look at a vent (M3-15's evaluation-order contract).
- **`CONTROLLER FAULT — BOARD UNRESPONSIVE`** — a `const string`, reaching **two surfaces that
  already existed and cost nothing**: the console's stream-2 error line (`GameSession.Invoke`
  upper-cases the adapter's error verbatim) and, inside a program, a `ScriptRuntime` runtime error
  plus an `AlarmRaisedEvent`. Pinned pairwise-distinct — including distinct FIRST FOUR WORDS —
  against the other three console refusals by `ThawGateTests.TheConsoleSentences_ArePairwiseDistinct`,
  which now reads the shipped constant instead of the literal M3-4 reserved for it.
- **The bleed.** ONE clause in `AtmosphereSystem`'s existing device walk, immediately after the
  injection branch: `if (device.Faulted && device.Rate > 0f) Rate -= FaultedRateBleedPerPass`
  (0.25, clamped at 0). ⭐ **That home is chosen for ORDERING, not convenience** — commands drain at
  the top of the tick and Atmosphere is the FIRST system in the stack, and `IntervalTicks == 2` means
  injection and bleed are **phase-locked by construction**. `MachineWearSystem` was refused: a
  different cadence for the same mechanic is how a tuning constant becomes untunable.

#### (d) The puzzle, in three moves — and the bleed constant is a DRIVEN measurement

```
1. DIAGNOSE   > open vent_d1
              CONTROLLER FAULT — BOARD UNRESPONSIVE
2. PROBE      > set vent_d1.rate max
              QUEUED SET(VENT_D1.RATE, 1)     ← the hall ticks up 0.197 kPa … and STALLS
3. SOLVE      (PROGRAM screen, on the COMMISSIONED term_moss)
              every 1s:
                set(vent_d1.rate, max)
```

⛔ **BOTH ENDS OF THE BLEED ARE FAILURES AND ONLY A DRIVEN NUMBER DISTINGUISHES THEM.** MEASURED on
`--ship wreck`, `hall_d1_s0` (60 tiles, 293 K):

| | measured |
|---|---|
| one prompt line | spends 1 + 0.75 + 0.5 + 0.25 = **2.5 passes** of injection ⇒ **0.197 kPa**, then dead flat for the next 3 000 ticks |
| `every 1s` program | crosses **80 kPa** (M3-11's own absolute floor) at tick **4 063**, nominal by 6 000 — inside two of M3-11's 3 000-tick windows; a **50 % duty cycle** against the 2 028 ticks a held rate needs |
| `when …` variant | **0.197 kPa** after 6 000 ticks — identical to the one-shot |

⚠️ **The live browser run reads `0.190` kPa rather than `0.197`, and neither number is wrong.** The
sim tests probe at boot; the acceptance harness types its line after the crew has serviced
`term_moss`, by which point `MachineWearSystem` has taken a few thousandths off the vent's condition
and `EffectiveRate` with it. Quoted separately on purpose — the test's number is the pin, the
harness's is what a player sees.

⭐ **0.25 is also the LARGEST value that keeps the lesson visible:** four passes is 0.8 s, so the
rate hits exactly zero before each 1 s heartbeat re-sets it and the player watching `vent_d1.rate`
sees a sawtooth that touches the floor. ⛔ **MOVE 2 IS THE TEACHING MOMENT AND IT MUST NOT BE
DELETED AS REDUNDANT** — without the puff, the refusal and the program are two unrelated facts and
the player is following a walkthrough instead of making an inference.

⚠️ ⭐ **THE NATURAL WRONG ANSWER IS PART OF THE DESIGN — DO NOT "FIX" IT.** `when` is EDGE-LATCHED
(`Interpreter.cs:50-51`), so `when hall_d1_s0.pressure < 80: set(vent_d1.rate, max)` fires ONCE and
the latch never re-arms while the condition stays true. ***`when` is an edge, `every` is a
heartbeat*** is the one thing this puzzle teaches, it is teachable in two attempts, and it is a
property of the SHIPPED interpreter rather than something this package built.
`BoardFaultTests.TheWhenVariantFiresOnce_AndTheHallStallsAgain` exists so that behaviour cannot
change quietly — a lane that made `when` re-fire would move every installed program in the repo.

#### (e) Sequencing — OD-N's split gate decides WHEN the puzzle is solvable

The workaround is a PROGRAM, so it needs the **COMMISSIONED** tier: repairing `term_moss` lights the
console (typed lines, so moves 1 and 2 work), and a `ControllerModule` is what unlocks the install.
Driven: on a repaired-but-uncommissioned terminal the install is refused with
`MossGate.NotCommissionedRefusal`, no program is stored, and `hall_d1_s0` is still at `0.000` kPa
6 000 ticks later.

#### WHAT THIS DOES NOT DO — filed, not fixed

- ⛔ **It is not a pattern and must not become one.** A future instance costs one line of authoring,
  one refusal message and one findable workaround. There is still **no systemic fault mechanic**,
  and adding a second faulted device "while we're here" reddens a census by name.
- **A faulted device has no CLEAR path.** Nothing in the game removes the bit — not a repair, not a
  commission, not a service. That is deliberate for the one authored instance (OD-O item (ii): the
  path is program-only) and it is the first thing to revisit if a second instance is ever authored.
- **The bleed is not def-tunable.** A def row is per KIND and would fault-tune every `AirVent` on
  every ship. Retuning the constant means re-driving both halves of the tuning leg, not editing a
  number.
- **The other seven deck-1 halls have no vent and are still `0.000` kPa forever.** §13.23a's
  mechanism claim (gas is same-deck only) is unchanged; the shipping ship now has exactly one
  authored exception to the dead deck.

### 13.35 ⭐⭐ The ship wakes one more soul BY ITSELF, once — and when it cannot, the run ends (M3-5 / OD-10, 2026-08-01)

**Today the run died with the first pawn, silently, in minute three.** `CryoSystem.Tick` now carries
a named exception: the tick the ship notices it has **no living crew**, it elects the nearest intact
capsule and starts it counting down; four sim-minutes later a named person steps out and the
Chronicle says *"With Rell dead, the ship woke Ozawa."* It happens **once per run**. When there is
nothing left to wake, a **real lose state** fires — a saved, hashed bit, a Chronicle line, and a
one-line banner on the standard surface.

⛔ **IT LIVES IN `CryoSystem` AND `ThawCommand` NEVER LEARNS IT EXISTS.** OD-10, and it is the half a
lane would be tempted to get wrong. `ThawCommand` is a player-reachable `ISimCommand`; any bypass
inside it — a `skipGate` flag, a nullable pod argument, an early return before the term list — is a
code path the player can reach, and the first player who finds it uses it as the normal route.
`sim/Sim.Core/ThawGate.cs` and `Commands/Commands.cs` are at a **ZERO DIFF** in this package. The two
share the MECHANISM (`Progress` → cycle → `AddCitizen`) and share **none** of the gate.

#### THE TRIGGER, THE ELECTION, THE ENDING — all three stated

| | rule | where |
|---|---|---|
| trigger | no citizen with `!Dead` aboard, and the reprieve unspent | `CryoSystem.cs` `EmergencyWatch` |
| ⛔ **a cycle already running** | **nothing happens and the reprieve is NOT spent** — see the block below; this is the send-back defect | `EmergencyWatch`, first line |
| bypasses | the console (term 2), the cycle exclusion (3), the rung (4), the headroom (5), the price (6) — **all of it, correctly**: every one presumes a living crew member | — |
| does NOT bypass | **term 1, the pod**: `!IsOpen && Powered && IsOperational` — restated, and pinned against `ThawGate.Evaluate` by a driven 12-capsule agreement sweep, **each conjunct isolated by its own leg** | `IsIntactPod` |
| tie-break | **fewest decks, then fewest tiles (Manhattan X/Y), then lowest `Device.Id`** — a strict lexicographic total order over integers. Origin = the tile the last crew member FELL on, from `CitizenDiedEvent.Pos`; with no event to read (a save loaded with nobody aboard) it degenerates to M3-2's lowest-Id | `NearestIntactPod` |
| once | `_emergencyThawFired` is set **whether or not a capsule was found** — the reprieve is spent either way, EXCEPT on the in-flight row above | — |
| ending | no crew, reprieve spent, **and nothing counting down** ⇒ `_runEnded` | `EmergencyWatch` |

#### ⛔⛔ A CYCLE THE PLAYER PAID FOR IS NEVER STAMPED ON — and the reprieve is not spent on it

**Found in independent review of the first commit, driven, and it was a real player-reachable
regression in production code.** The election did not exclude a capsule already counting down and
the assignment was unconditional, so an ordinary `ThawCommand` cycle **216 s into its 240 was reset
to one pass** the instant the last pawn died — ~3.6 sim-minutes of *purchased* progress discarded,
silently, at the moment the player can least afford it. `WireFormat.Ending.cs` had reasoned about
exactly this state for the BANNER and the consequence for the ELECTION was missed.

⭐ **THE SEMANTICS CHOSEN, AND WHY.** A capsule already counting down **IS** the grace ⇒
`EmergencyWatch` returns immediately and **does not burn the latch**. Justified from the charter's
own purpose — *"protects minute three without protecting hour three"*: the reprieve exists because
the player has nobody left **and no way to ask**. A player who ALREADY asked, and paid a rung for
it, has not used it, so it is still there the next time the crew hits zero. Burning it would charge
them twice for one rescue. The alternative (spare `Progress`, still burn the latch) was applied as a
mutation and is **RED** — the suite discriminates the two candidate fixes, not just the reset.

⚠️ **AND THE TEST THAT PINS THIS WAS ITSELF A NAMED MUTATION THAT COULD NOT BITE**, caught in the
second review pass — the very shape it exists to close. Its first draft put the paid cycle on
`pod_lindqvist`, a capsule the election would never pick, so under the mutation the ship started a
DIFFERENT capsule and the headline clause — *"the paid cycle was RESET"*, the defect's own sentence —
could not fire at all. The paid capsule is now `pod_ozawa`, **the one the election would otherwise
pick**, and the mutation reddens it with the original defect's exact numbers: `the paid cycle was
RESET (0.90416664 → 0.004166667)`. The not-nearest arrangement is KEPT as its own `[Test]`, because
it is the only one that produces the *"a SECOND capsule started counting down"* discriminator.

⇒ **The guard sits at the top of the method rather than at the assignment, and that is deliberate**:
past it nothing aboard is cycling, so no capsule the election can reach has progress to lose. A
`Progress <= 0f` guard at the assignment would be unreachable and therefore untestable.

⇒ **The banner had to follow.** With the reprieve unspent there is no elected id, so a
banner reading only `EmergencyPodId` would have gone SILENT on a dead ship with a capsule counting
down — the exact silence this package exists to close. `CryoSystem.GraceCapsuleId` now answers the
question the host asks (elected capsule, else the counting one, else 0), **in the sim**, because
only the sim knows what the reprieve did. The elected id WINS when both are set, so an ordinary
cycle in flight can never make the banner name the wrong person.

⚠️ **`CyclingPod` deliberately omits `Powered` while `IsIntactPod` includes it, and the asymmetry is
CORRECT** (reviewer's observation 5, agreed and now written into the code). Term 1 asks *may this
capsule be STARTED* — a question about signal. `CyclingPod` asks *is this capsule ADVANCING*, and
M3-2's countdown ignores power once a cycle is under way (§13.29: *once started, a cycle completes*).
Adding `Powered` there would let a brownout silently convert a running thaw into a lost run.

⚠️ **"NEAREST" IS NOT A PATH LENGTH, DELIBERATELY.** A path cost would make the choice depend on
doors, on air and on the pathfinder's tie-breaks — three things that have nothing to do with which
sleeper the ship should spend its one reprieve on, and all three of which can make the answer
unreachable on a wrecked ship.

⚠️ **THE GRACE IS WHY THE ENDING CANNOT SIMPLY BE "NOBODY IS ALIVE".** For 240 sim-seconds after the
last death nobody is alive and the run is very much still on. `AnyPodCycling` is the exception, and
its predicate is the countdown's own election predicate conjunct for conjunct — a capsule the
countdown would never advance must not be able to hold the ending open forever.

#### THE THREE MOMENTS, AND WHERE EACH ONE LANDS

| moment | what the player gets | surface |
|---|---|---|
| the last pawn dies | a capsule counting down **on the very next tick** (asserted as ONE tick, not "eventually"), and the banner **ALL HANDS DOWN — THE SHIP IS WAKING OZAWA.** | Overview `#ov-ending` |
| the capsule opens | *"With Rell dead, the ship woke Ozawa."* — `HistoryKind.EmergencyThaw` | Chronicle (MOSS console) |
| nothing left to wake | `CryoSystem.RunEnded` + *"Every soul aboard is dead, and no intact pod remains. The run is over."* (`HistoryKind.RunEnded`) + **EVERY SOUL ABOARD IS DEAD — THE RUN IS OVER.** | sim · Chronicle · Overview |

⭐ **THE BANNER IS ON THE STANDARD SURFACE BECAUSE THE CHRONICLE IS NOT.** The two Chronicle lines
reach the player only through the MOSS console; a player watching the Overview would otherwise see
their last pawn die and then **nothing at all for four sim-minutes**, which is exactly the failure
the charter names (*"if the grace is silent the player believes the game ended and quits"*). New wire
channel `ending` — `{"type":"ending","text":"…","over":bool}` — built in
`hosts/web/WireFormat.Ending.cs` (a TENTH `WireFormat` partial; `WireFormat.cs` stays at a zero
diff), sent from `GameSession.cs` and **on the reconnect resend list**, because its payload changes
at most twice in a whole run and a reconnecting tab would otherwise show no banner on a dead ship
for ever. `over` rides beside the text rather than being inferred from it (`MossPods`' rule: a code
with no sentence is unrenderable, a sentence with no code is unstylable).

⛔ **THIS IS NOT AN ENDING SCREEN AND MUST NOT GROW INTO ONE.** OD-M item 4 = A: M3-5 ships the sim
state + the Chronicle lines + a one-line banner; **M5-1 owns THE ENDING** and reads `RunEnded`.

#### ⛔ PIN-NEUTRAL — P1–P5 ALL HOLD, and TWO things had to be engineered for that

1. **The fold is ONE packed state word.** `XxHash64.Combine` is not idempotent on zero, so folding
   `_runEnded` and `_emergencyPodId` as their own steps would have moved P1/P2/P3 on every ship in
   the game **to record two zeros**. Packed — `fired | runEnded<<1 | podId<<2` — the word is `0`
   exactly where M3-2's `fired ? 1 : 0` was `0`. **Driven both ways**: `AShipThatNeverLostItsCrew_…`
   pins the fresh-boot CRYO checksum at `c25ab65f198b0144`, and `BothNewMembers_ReachTheStateHash`
   proves each new member still moves the hash, one at a time. The un-packed form was applied as a
   mutation and reddened that test **plus both tick-3000 goldens**.
2. **`IntervalTicks` went 10 → 1 and the countdown did not speed up.** The emergency watch reads
   `CitizenDiedEvent`, and the bus double-buffers per tick, so a 10-tick sampler misses nine deaths
   in ten. The cadence is preserved by CONSTRUCTION rather than by retuning `Dt`: `Simulation.cs:293`
   dispatches on `_tick % IntervalTicks == 0`, and `CycleIntervalTicks` re-applies that exact
   predicate to that exact counter. Pinned by `TheCountdownStillAdvancesOncePerSimSecond` — nine
   ticks advance a capsule by exactly one pass, the tenth by nothing, and a full cycle still takes
   2 391 ticks (239.1 s; the extra pass over 239 is float, not cadence — 240 additions of `1f/240f`
   land at `0.99999994`).

`_emergencyDeadName` is **saved but hash-EXEMPT** — `HistorySystem`'s own HIST convention (*strings
are hash-exempt; the checksum folds tick + kind + subjects, never the free text*), for the same
reason: rewording must never perturb determinism. It cannot desynchronise a twin either, because it
is derived from state that IS folded (the death rides HIST carrying the citizen id) and it is saved,
so a restored ship carries the identical string. `CryoSystem.StateVersion` goes **1 → 2**; a v1 blob
still restores through the version branch.

**The pins: `tests/Perilune.Tests/EmergencyThawTests.cs`** — 17 tests, every one driven, plus one
client test (`overview-model.test.js`, the ENDING bar). ⚠️ **Every death is driven from INSIDE a
tick** by a test system registered at `NeedsSystem`'s relative position: a `CitizenDiedEvent`
published from test code BETWEEN ticks lands in the write buffer and is not readable until a tick too
late, by which time `CryoSystem` has already fired with no name to say — the whole suite would have
been green with the wake line reading *"With a crew member dead…"*. ⚠️ **The wreck's pawn is FROZEN**
(`AutoWander` off, `HoldPosition` on) in every test that names an expected capsule: "the nearest
intact capsule" is measured from where she fell, so without pinning her down the expected answer is a
function of how many ticks the test happened to run.

⭐⭐ **EVERY CONJUNCT OF TERM 1 IS PINNED BY ITS OWN DRIVEN LEG, INCLUDING `Powered` — and the
technique is a coupling THIS PACKAGE CREATED.** `PowerSystem.IntervalTicks` is 10 and it re-assigns
`Powered` unconditionally (`PowerSystem.cs:298-301`); `CryoSystem` now ticks at **1**, so on nine
ticks in ten a hand-set `Powered = false` survives to the election's read.
`ADepoweredCapsuleIsNeverElected` therefore uses `ThawGateTests.TermOne_…`'s own in-tree fixture
(`Powered = false` on the shipping ship), **phase-locked off a power pass** and asserting the
capsule is STILL depowered afterwards — without that the leg would pass on luck.
⚠️ Its first run reddened on `NON-VACUITY FAILED: the drive ended on a power pass`, because
`Simulation.Tick` increments `_tick` at the END: a drive over ticks …8 and …9 leaves `TickCount`
reading …0, a power pass that never ran. **The claim is the ticks EXECUTED, not the counter
afterwards** — the guard caught its own author.

⛔ **AND THE INCIDENTAL COVERAGE IT REPLACES IS GONE, MEASURED ON THIS TREE.** Independent review
measured `&& d.Powered` deleted as reddening **2 of 1687** — two M3-2 crewless synthetic-map
`CryoSystemTests` legs, red for the WRONG reason (trap 3: perturbed by the every-tick watch, not
pins of the election). On the FIXED tree those two are green: their fixtures have a capsule
counting down, so the new in-flight guard returns before the election ever runs. Re-measured here:
**the deletion now reds exactly 1 of 1690, and it is `ADepoweredCapsuleIsNeverElected`, by name and
for the right reason** (`elected device 549 (pod_ozawa), expected pod_torres (552) · a DEPOWERED
capsule (pod_ozawa) was started`). ⚠️ **So the D2 fix removed the last incidental coverage at the
same moment the D1 leg supplied real coverage.** The corollary is worth stating for whoever comes
next: the emergency watch now runs inside **every crewless fixture in the repo**, and a future lane
that crews those fixtures — or that changes what counts as "cycling" — silently removes whatever
incidental exercise of this branch remains. The named legs are the only durable pins.

⭐ **THE ELECTION FIXTURE DISCRIMINATES THREE WRONG ANSWERS AT ONCE**, on the SHIPPING SHIP (a
synthetic bay is useless here — `PowerSystem` leaves every device on a conduit-less test map
unpowered, so term 1 would refuse for a reason unrelated to the claim). With `pod_ozawa` wrecked and
the pawn at (3,1,0) the right answer is `pod_torres`: wrecked-eligible ⇒ `pod_ozawa` wins,
opened-eligible ⇒ `pod_rell` wins, distance-ignored ⇒ `pod_mbeki` wins. All three were applied as
mutations and each named its own wrong capsule in the failure text.

#### WHAT THIS DOES NOT DO — filed, not fixed

- **No ending SCREEN.** By design (OD-M item 4 = A) — M5-1's.
- **The deck term of the tie-break is behaviourally INERT on the shipping ship.** All twelve
  capsules are authored at `z = 0`, so `deck` is always 0 and the order collapses to
  (Manhattan, Id). Replacing the deck computation with `deck = 0` survives the whole suite. It is
  kept because a second cryo bay on another deck is a content change, not a code change, and the
  rule would then be wrong by omission — but nothing pins it today. **Recorded, not fixed.**
- **A capsule with nowhere to open holds the ending open for ever.** M3-2's `TryFindExitTile` holds
  such a capsule shut at `Progress == 1.0`, and `AnyPodCycling` reads that as "still counting down",
  so the run never formally ends. Unreachable on the shipping ship (every capsule has a walkable
  neighbour); it is the one state in which the banner would sit on "waking" indefinitely.
- **A save loaded with nobody aboard names nobody.** There is no `CitizenDiedEvent` to read, so the
  emergency still fires and still elects a capsule, but the wake line degrades to *"With a crew
  member dead, the ship woke …"* and the election falls back to lowest-Id. Reachable only by loading
  a save taken between the death and the next tick.
- **The banner is the ONLY standard-surface trace.** The two Chronicle lines are still MOSS-console
  only, which is a general property of the Chronicle and not this package's to change.
- ~~**Both new lines render as `[Note]` and neither can become a day headline.**~~ ⭐ **CLOSED
  2026-08-02** by the D1/D6 package, which swept the CLASS rather than these two rows: `RunEnded`
  is now `[Ending]` at severity 12, `EmergencyThaw` is `[Thaw]` at 11, and the ordinary `Thaw` is
  `[Thaw]` at 10 — above `Eulogy`'s 8, so a day on which somebody woke is remembered as the day
  somebody woke (`Memory/Chronicle.cs:105-183`). The hole was structurally invisible (a missing
  `switch` case falls through `_ =>` and nothing fails), so it is now mechanised for every future
  member by `ChronicleTests.EveryHistoryKindHasBothALabelAndASeverityRow`.
- ⚠️ **The Overview does not repaint while the MOSS console is up** (`repaint()` returns early on
  `shouldShow()`), so the banner is frozen at whatever it last painted for as long as a player sits
  on the console. Pre-existing and general to every Overview island; it cost the acceptance run one
  whole take before the steps were reordered, and it is written into that harness's header.

#### ACCEPTANCE — DRIVEN AND WITNESSED, and which is which

`client/tools/emergency-thaw-shot.mjs` (headless Chrome + CDP + an INDEPENDENT socket that is never
the page). ⛔ **THE GAME OFFERS NO VERB THAT KILLS A PAWN**, and the honest route — order her across
the pressure frontier — is defeated by the shipping safety rule (`needs.flee_suffocation`). So
`--prep` writes a temporary defs overlay moving **TWO numbers** and nothing else:
`hypoxia_ppo2_kpa` / `severe_hypoxia_ppo2_kpa` `16`/`10` → `999`/`999`, so the whole ship reads as
unbreathable. **The DEATH is the shipping mechanism at the shipping rate** (`NeedsSystem`'s hypoxia
track, `suffocation_per_second_vacuum` untouched — ~90 s). **The emergency thaw, the wake, the
Chronicle and the ending are all WITNESSED**; the tool sends no cryo command and writes no sim state.

All 17 checks passed on the shipping ship (re-run after the send-back fixes, since D2 changed production code): the bar is hidden while Rell is alive → she dies and it
reads **ALL HANDS DOWN — THE SHIP IS WAKING NAKAMURA.** (not styled as the ending, and the
independent socket agrees on text AND `over`) → four sim-minutes later the bar clears and Nakamura
is on the roster → she dies in her turn and it reads **EVERY SOUL ABOARD IS DEAD — THE RUN IS
OVER.** with `over:true`, and it STAYS → the FAULT LOG carries
`[Note] With Rell dead, the ship woke Nakamura.`, `[Death] Rell has died.` and
`[Note] Every soul aboard is dead, and the ship's one reprieve is already spent. The run is over.`
⭐ The elected capsule was `pod_nakamura` rather than the boot-adjacent `pod_ozawa` **because Rell
fled before she died** — the tie-break really is measured from where she fell.
Shots: `docs/design/shots/emergency-thaw-{1-alive,2-grace,3-woken,4-ending,5-chronicle}.png`.

---

### 13.36 ⭐⭐ The ship can be WARMED — the first deliberate heat source, and the frontier stops ending at the heated core (M3-10 / PIN M3-d, 2026-08-01)

**THE HOLE THIS CLOSES, DRIVEN AND DATED.** §13.2 and §13.22e both say the ship freezes and no
authored value fixes it. Measured HERE, on `--ship wreck`, unattended, ten sim-days, sampling every
sim-day: the **reactor bay (room 6) crosses `hypothermia_c` on DAY 9** — `-10.98 °C`,
`AtmosphereSafety.IsBreathable` **False** — and the spine (room 5) reads `-9.80 °C` on day 10 with
the same slope. Room 1 (the cryo bay) is the only compartment that holds, and it holds because
twelve capsules' waste heat is propping it up. Because `WorksiteSafety.CanStageWorkerAt` resolves
through `IsBreathable`, **the ship's own survivable core stops being workable on day 9** and every
job in it silently stops being offered. Before this package nothing in the game could answer that:
a radiator only takes heat OUT.

**WHAT LANDED.** `DeviceKind.Heater = 28`, appended. `ThermalSystem` gained ONE arm — the
radiator's, sign-flipped line for line: push `Defs.HeaterOutputKW` × `Device.EffectiveRate`, clamped
so the room never passes `Thermal.HeaterCeilingK`, behind the same two `continue` gates every other
kind goes through (`Powered`, `IsOperational`). `PlaceDeviceCommand.IsPlaceableFurniture` gained the
kind and the Room Zoom palette gained a **HEATER** tool (17 → 18) — a heater the player cannot place
is a def row.

**THE NUMBERS, AND THE DRIVE THAT CHOSE THEM.**

| value | what | why THAT number |
|---|---|---|
| `heater_output_kw` **5 kW** | pushed into the room, condition-scaled | the Radiator's own magnitude, so one heater cancels one radiator and a compartment can be reasoned about without arithmetic. DRIVEN: room capacity is `TileCount × 53 kJ/K` and the wreck's compartments measure 40 / 60 / 86 tiles, so 5 kW lifts the 60-tile reactor bay out of hypothermia in ~46 sim-minutes and to the ceiling in ~7 sim-hours — 28 s and 4 min of wall clock at the web host's 100×. At a 0.2 kW-class output it would have been days. |
| `heater_ceiling_k` **294.15 K (21 °C)** | the cap | the exact mirror of `radiator_floor_k` 283.15 — 11 K of dead band, so a heater and a radiator in one room cannot fight pass by pass — and inside the 10–35 °C band the THERMAL row already calls comfortable. NOT comfort in purpose, though: `IsBreathable` is false ABOVE `heat_stroke_c` 45 °C too, and a 60-tile hall with 15 hull tiles sheds only ~390 W at 21 °C against 5 000 W in, so uncapped the device ends by refusing the work it was placed to allow. ⛔ **NOT attributed to RimWorld, and an earlier version of this row WAS** (*"21 °C is RimWorld's own default heater target"*): the reference states only that the target is **player-settable**, gives no number anywhere, and its own §21 verify ledger flags §9.2–9.3 **UNVERIFIED** with M3-10 named as the consumer. What it does support is the SHAPE — per-device and settable there, one ship-wide scalar here, because a setpoint is a saved+hashed field plus a UI. |
| `draw` **1.0 kW**, tier **LifeSupport** | the power cost | ⛔ **A SHIPPED INTERIM — the tier is OPEN ON THE OWNER, and the measurement that used to settle it was FALSE.** See the correction box below. Driven, the three **wired** Industry machines run **36.1 %** of the time, so an Industry heater would be **weak, not inert**. 1.0 kW is what makes the shed ladder land where the box below records it. |
| `heat` column **0** | waste heat | a heater's heat is its PRODUCT. The `heat` column is emitted unconditionally and is NOT scaled by `EffectiveRate`, so a heater there would be exactly as strong at Condition 0.15 as at 1.00 (the M2-12 generation precedent, pointing the other way) and would double-count against the ceiling. `Radiator` makes the same choice for the same reason. |
| `wear` 0.006/h, `maint` 0.40, `fail` 0.10 | the service terms | the Radiator's, unchanged — same class of plant, same standing-maintenance terms, same free-jury-rig band `[0.25, 0.40)`. |

⛔⛔ **THE TIER ARGUMENT WAS FALSE, AND THE CORRECTION IS THE INTERESTING PART.** This section
shipped saying — labelled MEASURED — *"Industry and Comfort are ALREADY SHED at boot and still shed
on day 10, so an Industry-tier heater would never once be powered: it would ship inert."* **The
demand figures are right; the conclusion is wrong.** The tier walk does not decide against
generation: `PowerSystem.cs:246-247` sets `supply = generation + batteryKW` with
`batteryKW = storedKWh × 3600`, so a battery holding *any* charge bridges the whole ship for a pass
and the wreck runs a **brownout SAWTOOTH**. The claim was a single end-of-run sample of `Powered`,
which reads whichever phase it landed in. ⇒ **A number sampled once from an oscillator is not a
measurement**, and `LastGenerationKW` (9.78 kW) is *generation*, not the supply the walk used.

**RE-MEASURED, driven, unattended, 10 sim-days, sampling every 10 sim-minutes (1 440 samples):**

| device | tier | wired? | powered |
|---|---|---|---|
| `recycler_1`, `machineshop_1`, `fabricator_1` | Industry | net 1 | **36.1 %** |
| `growbed_1`, `growbed_2`, `telescope_1`, `machineshop_2` | Industry | **net 0** | 0 % — never cabled; not a tier fact |
| the eight deck-0 doors | Defense | net 1 | **100 %** |

⇒ **An Industry-tier heater would run at ~36 % duty: WEAK, NOT INERT** — a heater that stops every
few minutes and lets the compartment drift back down. Weak-and-safe versus always-on-and-dangerous
is a **design** choice, not an arithmetic result, so **the tier is FILED for the owner** (below) with
these numbers. `LifeSupport` ships as the interim because it is the smallest reversible decision:
one word in three rows.

⚠️ **THE COST OF `LifeSupport`, MEASURED BY DRIVING IT rather than computed.** The tier is served
ALL-OR-NOTHING (`PowerSystem.cs:253-265`). N heaters added to a **copy** of the wreck's plan, 3
sim-days per arm, 432 samples:

| heaters | deck-0 doors (Defense) | `machineshop_1` (Industry) | LifeSupport |
|---:|---|---|---|
| 0 | 100.0 % | 35.9 % | 95.7 % |
| 1 | 100.0 % | 15.5 % | 95.8 % |
| 2 | 100.0 % | 16.4 % | 96.0 % |
| **3** | **84.7 %** ← Defense sheds | 3.7 % | 96.2 % |
| **4** | 31.0 % | 21.3 % | **81.1 %** ← life support sheds |

⇒ **Two heaters cost no tier anything; the THIRD sheds DEFENSE (the eight deck-0 doors); the FOURTH
sheds LIFE SUPPORT itself.** The first version of this paragraph said three were comfortable and the
fourth took the vents — **it understated the cost by one tier**, because it computed the ladder from
the demand figures instead of driving it. What every arm pays from N=1 is **Industry and Comfort
duty (36 % → ~16 %)**: a heater is bought with the crafting benches' uptime. Repairing the solar
wings is what buys the next one — the intended lever, and `PowerSystem` publishes
`BrownoutChangedEvent` when it flips, so it is not a silent trap. This is the same all-or-nothing
cost `CryoPod`'s row already documents.

**PIN M3-d — P4 AND P5 MOVED, P1/P2/P3 HELD (measured).**
`P4 0c5ddbc07e41f07d → 77a7a8a9e967eab4` and `P5 09900b9a44119272 → edf1577c32f14e55`, each measured
twice through two loaders. FOUR things move them for one enum member: the new `Machines` row (8
columns), the `Recipes` entry that comes with it (`new RecipeDef[Machines.Length]` — 6 fields, all
default, for an entry no crafting will ever use), and the two appended scalars. **P1/P2/P3 held, and
the `./ci.sh` run IS that proof** — the guards below are a cheap alarm naming which fixture moved,
never a second authority. They come in two halves because the pins do not share a shape: P2/P3 (and
grid/wreck) are `ShipPlan`s, censused by `HeaterTests.NoPinnedShipAuthorsAHeater`; ⭐ **P1 is not a
`ShipPlan` at all.** `ci.sh` runs `hosts/scenario --days 3 --seed 42` and `Program.cs:56` builds its
sim with the hand-written `BuildScenario`, so P1's fixture is SOURCE and is scanned as source by
`P1sOwnFixtureAuthorsNoHeater` (shared `CodeOnly`, plus an inclusion control and a
commented-out-code control). ⚠️ An earlier version of this paragraph credited the plan census with
covering P1 and named `ProceduralShips.Generate` as its builder — **false, and structurally so**:
that generator stands behind no pin, and `Program.cs` was outside the census's reach entirely.

⛔⭐ **AND IT FOUND A SHIPPED BUG ON THE WAY IN — `place` WAS INERT ON THE STANDARD SURFACE.**
`roomzoom-view.js`'s functional branch sent `Cmd.place(pc.deviceKind, …)` — the SIM ENUM MEMBER
(`Bed`, `Heater`) — where `GameSession.TryFurnitureKind` switches on the WIRE TOOL STRING (`bunk`,
`heater`), which `wire/session.js`'s own `Cmd.place` doc and `GameSession.cs`'s own protocol comment
both spell out. `TryFurnitureKind` fell to `default`, `HandlePlace` returned, and a refused
placement is a SILENT no-op by design — so **every furniture tool on the Room Zoom palette did
nothing and said nothing.** Found by M3-10's acceptance harness reporting `0 -> 0` heaters; proved
GENERAL rather than heater-specific by a driven control with the shipped **`bunk`** tool (two clicks
on clear floor of the wreck's reactor bay, device census byte-identical). ⚠️ **NOTHING SAW IT
BECAUSE NOTHING READ THE PAYLOAD** — `prioritise-menu.test.js` asserted `o.cmd === 'place'` and never
its `kind`: CLAUDE.md trap 4 (*pin HOW an API was called by recording the ARGUMENT at the seam*) and
the *"verb parity is NOT sufficient"* rule, a verb present, wired, tested and INERT. Fixed here in
one token and pinned by DERIVATION off `GameSession.cs`'s own switch, so a renamed tool string
reddens instead of silently disabling a palette button. **BUNK, DESK, CHAIR, LOCKER, PLANT and LAMP
all start working again in this commit.**

**ACCEPTANCE, DRIVEN IN REAL CHROME** (`client/tools/heater-shot.mjs`, shots
`docs/design/shots/heater-*.png`). Fast-forward with the game's own speed stepper until the reactor
bay is the coldest pressurised compartment at **5.78 °C** → palette shows **18 tools**, HEATER among
them, none clipped → one click places it (`0 -> 1` on the `devices` channel, read from an
INDEPENDENT socket) → it draws as the real `space-heater` piece, not a dashed `E` chip → 60 s at
100× takes the bay to **14.62 °C** while the control compartment moves 1.74 °C (a 5.1× ratio).
⚠️ Two things are driven and not played, both disclosed in the tool's header: the temporary
`device_place_cost = 0` overlay, and the fast-forward itself.

**WHAT THIS DOES NOT DO — filed, not fixed**

- ⛔⭐ **THE HEATER'S POWER TIER IS AN OWNER CALL, and it is filed because the measurement that
  settled it was wrong.** `LifeSupport` (always on; three heaters shed the doors, four shed the
  vents) versus `Industry` (~36 % duty on the shipped wreck, and structurally incapable of taking
  life support down). The false "an Industry heater would be inert" is what chose LifeSupport;
  with the true numbers it is a design question nobody has answered. Shipped as LifeSupport,
  reversible in one word in three rows (`MachineDefs.cs`, `SimDefs.CreateDefault`, `machines.def`).
- ⛔ **A HEATER IS REACHABLE BUT NOT AFFORDABLE ON THE SHIPPED WRECK.** `build.def
  device_place_cost` is **3 Parts** and the wreck authors **ONE**, which `MaintenanceSystem` spends
  unattended inside the first sim-day. Three Parts is 6 Regolith through the
  Regolith → Scrap → Parts ladder, three benches deep, behind two doors, across the pressure
  frontier. That is the intended shape of the game (the heater is a REWARD for pushing the
  frontier, not an opening move) but nobody decided it for the heater specifically, and the refusal
  is the SILENT one `PlaceDeviceCommand` documents — the player gets no price, no balance and no
  reason. **Owner call; measured, not fixed.**
- ⭐ **TWO DEVICE KINDS NOW DRAW THE SAME SILHOUETTE.** `ITEMS['space-heater']` has read
  `deviceKind: 'Heater'` since the warm set was drawn and sat unreachable (`deviceStatus: 'new'`,
  `glyph: null`); it now claims `'E'` directly, which is the one addition to that registry that PAID
  DOWN unreached art instead of spending a stand-in. But `GLYPH_SUBSTITUTE['=']` — the RADIATOR's
  borrow of the same piece — is untouched, so a radiator and a heater look identical on both SVG
  surfaces. Reassigning the radiator to the unused `cooler` piece was considered and REFUSED:
  `cooler` is registered `cosmetic`, and a functional device wearing a cosmetic piece is the exact
  shape of the live `demolishTarget` bug `glyph-map.js`'s header records. **The radiator's art is an
  OWNER call, not a seam call.**
- **No per-device target temperature and no on/off switch.** A heater runs whenever it is powered
  and above `fail`, and stops at the one ship-wide ceiling. RimWorld's setpoint is the obvious next
  rung and is a saved+hashed field plus a UI.
- **The THERMAL ship-system row's LOAD still counts waste heat against radiators only** and does not
  see heater output at all, so a warm compartment can sit under a low LOAD. The row's own LIMIT
  paragraph now says so instead of the retired *"nothing deliberately heats a room."*
- **The heater is not on the wire as anything special** — it is an ordinary `devices` row with a
  `kind` byte, `cond` and `oper`. Nothing tells the player a compartment is being heated except the
  temperature moving.

---

### 13.37 ⭐⭐ WHO does a job changes how fast it is done — skill reaches work (M3-7 / PIN M3-b / OD-M item 8A, 2026-08-02)

**THE PLAYER SENTENCE.** Until this package everyone aboard worked at the same rate at everything,
and a name was the only thing telling two crew apart. Now **who does a job changes how fast it is
done** — and choosing which soul to thaw finally means something.

⚠️ **BUT READ §13.37.5 BEFORE BELIEVING THE SENTENCE IS VISIBLE IN PLAY: nothing in the sim WRITES a
skill yet.** Every crew member on every shipping ship is level 0, where the curve is the exact
identity. The mechanism is live, driven and pinned; the *authoring* is M3-8's.

#### 13.37.1 The state — `Citizen.Skill` (one byte) became `SkillsRaw` (six)

`sim/Sim.Core/Entities/Citizen.cs` — `internal readonly byte[] SkillsRaw`, sized by
`WorkPriority.WorkTypeCount`, one level `0..20` per `WorkType`, read through `GetSkill`/`SetSkill`.
Exactly `WorkPrioritiesRaw`'s shape, walked by the same save loop and the same fold loop.

⭐ **THE WIDENING IS THE DESIGN, NOT AN OPTIMISATION.** M2-1 reserved `public byte Skill` — one
scalar. Scaled through six per-type curves, one scalar makes two pawns differ in MAGNITUDE but never
in SHAPE: their ordering across work types is identical for ever. `rimworld-reference.md` §5.1 is
explicit that *"skills level independently"*, and M3's own exit gate says *"the new soul's WORK row
differs from Rell's."* **OD-M item 8, answer A** adopted the widening inside M3-7's already-paid pin
row: CITZ **v8 → v9**, a save migration, and NOT a second re-pin.

**THE MIGRATION IS REPLICATE, NOT ZERO** (`SaveReader.cs`, branching on the VERSION because a v8
payload has no count byte to tell the shapes apart). v8's byte was *"reserved, zeroed, read by
nothing"*, so on every save that has ever existed both candidates are the identical no-op; where it
is NOT zero, replicating carries it forward as *"equally apt at everything"*, which is exactly what
one byte meant. Zeroing would silently discard state a v8 writer stored.

#### 13.37.2 The curve — `WorkRates`, and it is THE ONE SEAM

`sim/Sim.Core/Entities/WorkRates.cs`. `rate = (base + bonus × level) / 1000`, per work type,
**LITERALS** (M2-1's *a rule, not a tunable*) — which is what keeps **P4/P5 out of this pin row**.

| work type | ×at level 20 | consumer |
|---|---|---|
| Repair | **2.24** | `MaintenanceSystem` (BOTH legs: parts-in-hand and jury-rig) |
| Construct | **2.50** | `BuildJobSource.TryClaim` |
| Craft | **2.50** | `CraftingSystem` (the accrual, not the assignment — see below) |
| Deconstruct | **2.00** | `DeconstructJobSource.TryClaim` |
| Mine | **3.00** | `DigJobSource.TryClaim` **+ `EffectValidator`'s LLM dig grant** |
| Haul | **1.00** | ⚠️ **NONE — haul accrues no work anywhere** |

⭐ **base is 1.000 EVERYWHERE, and that is load-bearing rather than tidy**: an untrained crew member
works at *exactly* the pre-M3-7 rate, which is what makes this package's pin move provably fold-only
and what lets `WorkTicksFor` be the EXACT identity at level 0 (`(b × 1000 + 500) / 1000 == b`).
RimWorld's own constants could not be lifted — their base is near zero (Mining `0.04`), so a level-0
pawn would be 25–60× slower and every balance number in the game would move.

⚠️ **THE DEVIATION IS STATED, NOT HIDDEN: skill affects RATE ONLY.** §5.1 warns that *"a single
'skill → work speed' multiplier is not the RimWorld model"* — for Construction skill is speed AND
failure, for Crafting it is quality only. `TARGET.md` §2 forbids dice in outcomes, so *"no dice"* and
*"skill affects quality"* cannot both hold. ⛔ **Do not let a later lane "complete" this with a roll.**

⛔ **SKILL NEVER GATES WHETHER** (§5.2). `CanTakeWorkType` does not consult a level and a guard
forbids it from starting to; a level-0 pawn takes the job and does it slowly. The only two refusals
are the player's grid and `Citizen.WorkIncapable`.

⭐ **THE SEAM TAKES A CITIZEN, NOT A LEVEL, AND THE ARCHITECTURE TEST IS WHY.**
`ArchitectureBoundaryTests` forbids the substring `Skill` in every ECONOMY file — and all five
consumers are economy files. `WorkRates` lives in `Entities/`, outside those directories, and the
consumers call it without naming a level, so **that row needed no carve-out and still holds**.

#### 13.37.3 Assignment vs accrual — the asymmetry is forced, not chosen

Four consumers scale **at the assignment** (`JobWorkTicks = WorkTicksFor(...)`), because that counter
is an integer countdown decremented one unit per pass: a per-tick multiplier could only be an
integer, so every rate between 1× and 2× would floor to 1× and the middle of the curve would be
silently inert. It is EXACT there because **an abandoned job loses its countdown entirely**
(`JobSystem.cs:271`), so a re-claim always restarts from the full unskilled cost.

**Crafting is the exception and must stay one**: `station.Progress` lives on the DEVICE and survives
a worker being pulled off mid-batch, so a fresh recruit at a different competence contributes at HER
rate to the remainder. Scaling its assignment would price the whole batch at whoever touched it
first. (`worker.JobWorkTicks` there is only a phase marker and is never decremented.)

⚠️ **REPAIR QUANTISES TO THE 1 Hz PASS GRID and the primed number is not the landed one.**
`MaintenanceSystem` runs at `IntervalTicks = 10` and subtracts its whole `Interval` per pass, so a
service ENDS on the first pass that drives the countdown to or below zero: an untrained 9000 lands
exactly at 9000 (900 passes), but a level-20 **4018 lands at 4020** (402 passes, overshooting by 2).
The four assignment consumers are pinned on the value ASSIGNED, not on the tick observed, for exactly
this reason — the other three run at 10 Hz and subtract 1, where the two coincide.

#### 13.37.4 The `workcaps` channel — and why it could not be two columns on `work`

`hosts/web/WireFormat.WorkCaps.cs`, `[cid, s0..s5, incapableMask]`, one row per LIVING crew member.
`WireFormat.cs` **and** `WireFormat.Work.cs` both take a zero diff.

⛔ **THE OBVIOUS DESIGN IS UNBUILDABLE, NOT MERELY WORSE.** `work` emits one row per switched-**ON**
pair and nothing else (`WireFormat.Work.cs:86-87`), and an incapable type is by definition never on —
**so it has no row, and a row that does not exist cannot carry a column.** Under OD-H the whole
channel is empty at boot, i.e. at the exact moment the player first looks at a crew member.

- **DENSE where `work` is sparse**: a crew member with nothing switched on still gets a row. That is
  the OD-H boot state, i.e. the default case.
- **The mask is `Citizen.WorkIncapable`'s own byte, VERBATIM** — never re-derived. A host-side
  derivation reports the opposite bit for a type that is incapable AND switched on, a state
  `Citizen.cs` deliberately leaves reachable.
- **`incapable` ≠ `priority 0`.** A fact about the PERSON versus an order from the PLAYER. On the
  sparse `work` channel the two are indistinguishable **by construction** — that is the whole reason
  this message exists. ⭐ `rimworld-reference.md:335` renders a disabled cell **blank** and an
  incapable one as **no cell at all**: the rendering is ABSENCE, not decoration.
- Client: `decodeWorkCaps` + `isIncapableOf` (`messages.js`), cached behind `Hud.getWorkCaps`,
  dispatched in `main.js`. **STATE LAYER ONLY — nothing draws it. M3-12 draws it.**

#### 13.37.5 ⚠️ WHAT IS WIRED BUT NOT CONNECTED

- ⛔ **NOTHING WRITES A SKILL.** No spawn, no backstory, no XP, no levelling, no command, no def.
  Every crew member on every ship is level 0, where every curve is exactly 1.000× — **so the shipped
  game behaves identically to the pre-M3-7 game and will until M3-8 authors persona sheets.** The
  mechanism is real and driven; the *content* is the next package's.
  ⭐ **AMENDED BY M3-8 (§13.39, 2026-08-02): the wreck's seven SLEEPERS now get an authored spread at
  the moment their capsule opens.** The bullet still stands verbatim for everybody else — every crew
  member on every other ship, and Rell, who boots awake and is deliberately unauthored (§13.39.3).
  There is still no XP and no levelling anywhere.
- ⛔ **NO PIN SEES THE RATE TERM.** Measured as a 2×2: force every crew member to skill 20 and all
  three pinned runs are bit-identical with the rate seam live and with it stubbed out. OD-H boots
  every work type off and no pinned run enqueues a command, so **no pinned fixture does any work at
  all**. M2-12's *"no pin sees the generation term"* in a second costume, and M2-17's lesson: an
  unattended fixture does no work, so a held pin here is VACUOUSLY held. `SkillConsumerTests` is the
  only instrument the curve has.
- ⚠️ **`WorkType.Haul` HAS A FLAT CURVE BECAUSE HAUL ACCRUES NO WORK.** `HaulJobSource` is pure
  travel plus an instantaneous pickup and drop — there is no `JobWorkTicks` countdown anywhere on the
  path. A non-zero bonus would be a number that looked like a mechanic. A haul-speed term needs a
  carry-capacity or move-speed mechanism first. **FILED, not built.**
- **Nothing WRITES `WorkIncapable` either** (M2-1's note still stands): the mask is storage the
  channel now carries, with no source of incapability in the game. So `workcaps` ships correct and
  all-zero on every shipping ship.
  ⭐ **AMENDED BY M3-8 (§13.39): every one of the seven sleepers carries at least one incapability
  bit**, and it is fully live — it gates WHETHER through `CanTakeWorkType` at all five dispatcher
  sites. `workcaps` is still all-zero on every ship but the wreck, and on the wreck until a thaw.
- ~~**No surface draws skills or absent cells.**~~ ✅ **CLOSED 2026-08-02 by M3-12 — §13.38.** The
  WORK tab now draws both and `getWorkCaps` is on `SHIP_STATE_REACH`. ⚠️ The *other* two bullets in
  this list are NOT closed by it on the FIXTURE ships — the numbers drawn are still all zero and the
  masks all clear there — ⭐ but M3-8 (§13.39) amends the wreck: a THAWED sleeper arrives with
  authored levels and masks, so on the shipping ship the tab now has something true to draw.
- **Skill does not affect quality, failure, mood, or what a pawn CHOOSES to do.** Only rate, and only
  at the six sites above. RimWorld's `naturalPriority` ordering is untouched.

---

### 13.38 ⭐⭐ The WORK tab says what each soul is good at — and draws the cell that is not there (M3-12, 2026-08-02)

**THE PLAYER SENTENCE.** Until this package the player could not see why they would give a job to one
soul rather than another: the grid was six identical boxes per row and a name. Now **every cell
carries her skill in that work type**, and **a work type she can never do has no cell there at all.**

⚠️ **CLIENT-ONLY, PIN-NEUTRAL.** No sim file, no host file, no def. All five pins held (check A).

#### 13.38.1 ⭐ BLANK vs ABSENT — the one thing this package is actually about

`docs/design/rimworld-reference.md:335`, the `renders as` row of §1.6's table:

| | **disabled** (priority 0) | **incapable** |
|---|---|---|
| what it means | *this pawn's setting is off* — an order the PLAYER gave | *there is no such setting for this pawn* — a fact about the PERSON |
| who can change it | the player, by clicking | nobody. RimWorld's `SetPriority` refuses and logs |
| renders as | a **blank cell** | ⭐ **no cell at all — the box is absent** |

⛔ **THE RENDERING IS STRUCTURAL, NEVER DECORATIVE, AND THAT IS THE WHOLE DESIGN.** A greyed, struck,
dimmed or `opacity:0` cell is still a cell: it still occupies the column, still takes the click, and
still says the FIRST sentence. Revision 1 of the charter said RimWorld strikes the cell; revision 2
corrected it as a misquote of the authority it cited. So `client/src/ui/overview-model.js`'s
`workRowColumns` decides the SET of cells and the DOM is built from that answer —
`overview-view.js:paintWork` appends only the columns it returns.

| where | what |
|---|---|
| `client/src/ui/overview-model.js:477-507` | `workRowColumns(caps)` (the cell SET) + `workSkillLabel(skill)` (the corner glyph). PURE. |
| `client/src/ui/overview-model.js:60-66` | imports `isIncapableOf` from `wire/messages.js` — the mask bit test has ONE home, not two |
| `client/src/ui/overview-view.js:226-252` | `workCapsFor(cid)` — the live-cache seam, `Hud.getWorkCaps()` → `decodeWorkCaps` |
| `client/src/ui/overview-view.js:630-701` | `paintWork` — attaches/detaches cells on `rec.sig`, paints the two spans |
| `client/styles.css:1152-1171` | the per-work-type `grid-column` rules + `.ov-workskill` |
| `client/test/surface-boundary.test.js` | `getWorkCaps` joins `SHIP_STATE_REACH` — a census MOVE, said out loud |

#### 13.38.2 The geometry — why CSS is load-bearing here

`.ov-workrow` is `grid-template-columns:132px repeat(6,58px)`. An incapable soul's row has FEWER
children than the header has columns, so under auto-placement the survivors **shuffle left and every
one of them draws under the wrong header** — HAUL under MINE. ⛔ **The addressing would stay correct**
(each `<button>` carries its own `data-ov-work-cid` + `data-ov-work-type`, and the click reads those
back), **which is exactly why no click test can see this failure.** So each cell is pinned to its
column by `.ov-workcell[data-ov-work-type="N"]{grid-column:N+2}` — keyed off the same attribute the
click handler reads, so the drawn position and the addressed work type cannot disagree.

#### 13.38.3 The skill corner, and the level-0 honesty choice

Each cell is now two spans: `.ov-workprio` (the `off`/`1..4` glyph the click changes) and
`.ov-workskill` (her level `0..20`, small, in the corner — RimWorld's own arrangement, §1.7).

⭐ **LEVEL 0 RENDERS AS A VISIBLE `0`.** Not blank, not a dash. Nothing in the sim writes a skill
(§13.37.5), so **today the grid reads `0` on every cell of every row on every shipping ship** — and
that is the honest picture of a wreck whose only waking soul is untrained at everything, not a
display with nothing to show. Hiding the zero would make the shipped game indistinguishable from one
where this feature never landed.

⚠️ **`0` AND `·` ARE DIFFERENT ANSWERS.** `·` is *no `workcaps` payload for this person*, and it keeps
every cell present: deleting a box because a message is late would state a permanent fact about a
person on no evidence, and unlike a wrong number **a missing box cannot be noticed as wrong.**
`decodeWorkCaps` drops a short row rather than zero-filling it for the same reason.

⛔ This does **not** contradict `workCellLabel`'s rule that *off is never `"0"`*. That rule governs
the PRIORITY glyph, where a `0` reads as the worst of `1..4`. The skill lives in its own element, on
its own domain (`0..20`), and never replaces the priority text.

#### 13.38.4 Read-only, and the two carried owner items

The skill display adds **no editing affordance**: `onWorkCellClick` is unchanged, the skill span
carries no `data-ov-*` address of its own, and a click anywhere in the cell — including on the
number — sends the same single `workPriority` order it did before. A skill is the SIM's to write.

The two owner items `HANDOVER.md` files against this tab are **untouched by design**: the `BUILD`
column label still collides with the BUILD tab, and the click cycle still walks only upwards. Both
are pinned as *unchanged* by `overview-model.test.js` so that a later package cannot resolve either
by accident.

#### 13.38.5 ⚠️ WHAT IS WIRED BUT NOT CONNECTED

- ⛔ **THE ABSENT CELL CANNOT BE SEEN IN THE SHIPPING GAME.** Nothing writes `Citizen.WorkIncapable`
  (§13.37.5), so every shipping ship sends `incapableMask = 0` and **every row has all six cells**.
  The rendering is real, driven and mutation-tested against an authored two-soul fixture; the
  *content* — a source of incapability, i.e. a backstory or trait that disables a work type — exists
  nowhere in the game. **FILED, not built.** M3-8's persona sheets are the first place it could land.
- ⛔ **AND THE SKILL NUMBERS ARE ALL `0`** for the same reason. The milestone's decisive step ("her
  row is NOT Rell's") therefore needs **M3-8** before it can be demonstrated in play: today the two
  rows differ in neither the numbers nor the set.
- **No hover explains WHY a cell is absent.** RimWorld puts that in the pawn's Bio tab
  ("Incapable Of", with the source on hover). We have no such surface — the Persona window is M4 — so
  the grid's second hint line carries the whole explanation ("a work type she can never do has no
  cell at all"). **FILED.**
- **Skill is not shown anywhere else.** No CREW WATCH column, no tile tooltip, no Room Zoom readout.
  One surface, one place.

---

### 13.39 ⭐⭐ The sleepers are people — seven authored souls, and the first skill this game ever wrote (M3-8 / OD-M items 5+8, 2026-08-02)

**THE PLAYER SENTENCE.** Until this package a thawed citizen arrived with **no mind attached at all**
and level 0 at everything — the capsule opened, a name walked out, and that was the whole of her.
Now each of the wreck's seven sleepers is **a written person before you open her pod, and she is that
person the second she steps out**: six authored skill levels, at least one thing she cannot do at
all, and a backstory that explains both.

⭐ **THIS IS THE FIRST WRITER OF A SKILL IN THE GAME.** §13.37.5's headline — *"NOTHING WRITES A
SKILL … the shipped game behaves identically to the pre-M3-7 game and will until M3-8 authors persona
sheets"* — is retired for the seven sleepers and **still stands for everybody else**, Rell included.

#### 13.39.1 The split is the design: what is sim state and what is not

| half | lives in | written when | is it hashed? |
|---|---|---|---|
| **competence** — six levels + the incapability mask | `sim/Sim.Core/SleeperAptitudes.cs`, applied by `CryoSystem.Open` (`Systems/CryoSystem.cs:298`) | at the thaw, inside the sim | **YES** — `Citizen.SkillsRaw` + `WorkIncapable` ride CITZ v9 and `Simulation.cs:504` |
| **the person** — persona sheet, secret, fact | `sim/Sim.Gen/AuthoredShips.cs:2602` `WreckSleepers()` + `:2800` `AttachSleeperPersona`, attached by `hosts/web/GameSession.cs:226` `AttachThawedPersonas` | at the thaw, in the HOST, observing `CitizenThawedEvent` | **NO** — mind/fact layer, host state |

⛔ **THE SIM HALF OWES THE HOST HALF NOTHING, AND THAT IS THE OFFLINE INVARIANT.** Boot the wreck on
the bare `SystemStack.CreateDefault` — no `MemorySystem`, no `MindState`, no `FactRegistry`, no LLM
anywhere in the process — drive a capsule open, and the same woman steps out with the same six levels
and the same mask. Driven by
`SleeperPersonaTests.AThawWithNoPersonaLayerAnywhere_StillProducesTheWholePerson`, whose fixture
*asserts* the absence rather than assuming it.

⭐ **WHY THE PERSONA COULD NOT USE `PopulateSlice`'s PATTERN.** `AuthoredShips.PopulateSlice` weaves
the slice's eight minds **at boot**, before the first tick, because all eight citizens exist at tick
0. **A sleeper does not exist until her capsule opens at some unknown later tick.** So the roster is
consumed by an OBSERVER instead — and that is the whole architectural difference between the two
packages.

⚠️ **THE OBSERVER IS PER-TICK, NOT PER-FRAME, AND THAT IS FORCED.** `EventBus` is double-buffered and
swaps at the END of every tick, so a host that ticks N times and *then* reads the bus sees only the
last tick's events. The run loop's bare `for (…) _sim.Tick();` became `GameSession.AdvanceTicks`
(`hosts/web/GameSession.cs:196`), one method that ticks **and** observes, so tests drive the loop's
own body and no harness can navigate a path the game does not take (the OD-P lesson, one package
later). The harness asks for **five ticks at a time**, deliberately: a drive that only ever asked
for one would be blind to exactly this defect.

⛔ **NO `Relationships` ARE AUTHORED FOR THE SLEEPERS, DELIBERATELY.** `PopulateSlice` seeds its web
with `SocialSystem.Nudge`, which writes **canonical sim state** (the SOCL fold) — safe at boot,
forbidden here, because this roster is consumed at RUNTIME by a host and a host that nudges the
social graph mid-run is a host mutating hashed sim state. The bonds are written into the prose
instead. `PersonaGenerator.CreateAuthoredMind` is **RNG-free**, which is what makes it callable from
a runtime observer at all. **A sim-side social seed at thaw is FILED, not smuggled in.**

#### 13.39.2 The table — literals keyed by name, no def field

```
  rung  who         rep con cra dec min hau   cannot                  capsule
  ----  ----------  --- --- --- --- --- ---   ---------------------   -------
    1   Lindqvist     9   7   2   5   0   4   Mine                    0.99
    2   Ozawa         5   0  11   6   2   3   Construct               0.91
    3   Ferreira      3   4   0  11   7   9   Craft                   0.83
    4   Mbeki         0   6   0   8  13   9   Repair, Craft           0.75
    5   Bahri         7  12   5   4   3   0   Haul                    0.67
    6   Nakamura     10   2  13   0   0   3   Deconstruct, Mine       0.59
    7   Torres       14  11   9  10   0   8   Mine                    0.51
```

Ladder order is `ThawGate.RungOf`'s — the order the player meets them in, because the ladder is
priced by capsule condition (§13.28/§13.30).

⭐ **KEYED BY THE SLEEPER'S DISPLAY NAME** — what `CryoSystem.SleeperName` derives from the capsule's
`pod_<who>` device name — so the table and `AuthoredShips.WreckPods` are joined on **exactly the
string the player reads**, and a typo yields an untouched level-0 citizen rather than a wrong one.
`StringComparer.Ordinal` throughout (the dev machine is de-DE).

⚠️ **NOT A DEF FIELD, and that is a decision** — the `ThawGate.RungOf` precedent (M2-1's *a rule, not
a tunable*), taken for the same reason: a def field would ship a P4/P5 re-pin and a checksum fold for
one ship's authoring, and *"this person is this good"* is no more tunable than the rung ladder is.

⚠️ **AN INCAPABLE TYPE IS AUTHORED AT LEVEL 0, ALWAYS** — a row claiming skill in something the woman
cannot do at all would be two contradictory facts about one person. Enforced by
`EveryAuthoredRow_IsInternallyConsistent`, not by convention.

⭐ **THE SPREAD IS A DESIGN STATEMENT.** Mining is the first link of the wreck's whole production
chain (Regolith → Scrap → Parts → ControllerModule, which the thaw ladder itself spends) — and
**three of the seven cannot mine at all, Torres among them: the best crew member aboard and the most
expensive capsule to open.** So waking the strongest person does not also solve the chain. Of the
four who **can**, **Mbeki (13) is the strongest by a wide margin**: the mine curve is the steepest in
`WorkRates` (100/level), so she cuts at **2.30×** against Ferreira **1.70×** (7), Bahri **1.30×** (3)
and Ozawa **1.20×** (2). Nobody is ever hard-blocked — Rell is capable of everything at level 0, and
*0 is untrained, not unable* (`rimworld-reference.md` §5.2). The question the table poses is **how
fast, not whether** — and it is priced: the cheapest capable miner is **Ozawa at rung 2** (level 2,
1.20×, 2 `Seals`), where Mbeki is **rung 4** (2.30×, 2 `Parts`) — a whole production tier deeper into
the very chain her rate is what accelerates.

⛔ **CORRECTED IN REVIEW — the previous sentence was FALSE and it was load-bearing** (it also stood in
`SleeperAptitudes`' class doc, in Mbeki's `RaidBackstory`, and in a test's assertion message). It
read: *"Mbeki (rung 4) is the only sleeper who can feed the chain her own rescue is priced in."*
**Four** of the seven have a non-zero Mine level and none of the other three is incapable, so the
claim was refuted by the table printed directly above it — and by its own next sentence, which
conceded that Rell can mine at 0. The true claim is an **absence** in three sleepers and a **margin**
in one.

⚠️ **`Haul` LEVELS BUY NOTHING TODAY and the table does not pretend otherwise**: `WorkRates`' haul
bonus is 0 because hauling accrues no work ticks anywhere in this sim (§13.37.5, FILED). A haul level
is a fact about the person for M3-12's column to draw. **Haul INCAPABILITY, by contrast, is fully
live** — it gates WHETHER through `Citizen.CanTakeWorkType` at all five dispatcher sites, which is
exactly why Bahri carries it.

#### 13.39.3 ⚠️ RELL IS DELIBERATELY UNAUTHORED — the decision, and what it costs

Rell **boots awake**, so she is never thawed, so nothing on this path can ever reach her: she keeps
the fleet-wide level-0 default and the *procedural* persona `GameSession.GeneratePersonas` gives
every citizen at boot. **Both options were pin-neutral** (see §13.39.4), so this was decided on
design, not on cost:

- every route to authoring her touches a **shared boot seam** — `ShipPlanBuilder`'s crew loop or a
  new `ShipPlan`/`CrewSpec` field, i.e. surface on every ship — for a package whose seam is the thaw;
- the exit-gate sentence (*"the new soul's row differs from RELL's"*) is satisfied without it: an
  authored sleeper differs from Rell on six columns and the mask;
- ⛔ **AND IT IS VISIBLE, NOT INVISIBLE.** In CREW WATCH today Rell reads **`general crew`** with
  procedurally-drawn traits (`stoic, gentle, cowardly` at the shipping seed) beside `electronics` and
  `salvage`. **FILED for M4-2/M4-3**, and *pinned by assertion* in
  `TwoThawedSleepers_ReadAsTwoPeopleOnTheRosterChannel` so that authoring her later is a red test
  telling you which claim you changed, not a silent improvement.

The four dead sleepers (Vance, Sokolov, Iqbal, Osei) get neither a row nor a sheet — OD-9: their
capsules are below the CryoPod `fail` floor, so they can never cycle, and a sheet for one of them
would be prose the game cannot show attached to a number the game cannot use.

#### 13.39.4 PIN-NEUTRAL, and the premise is mechanised rather than asserted

Everything the sim half writes is reachable **only through a thaw**; a thaw needs a `CryoPod`; and
**the wreck is the only ship in the repo that has one**. So no pinned fixture can reach the table
however long it runs — P1 is `hosts/scenario`'s own ship (no `CryoPod` anywhere under
`hosts/scenario`), P2 is `Perilune()`, P3 is `PeriluneSlice()`, and P4/P5 are the defs, which gain no
field. `NoShipButTheWreck_HasACapsuleToThawFrom` asserts the census **as an inclusion test** — the
wreck's own twelve are asserted too, so a build where NO ship has capsules (which would make the
claim true and meaningless) fails it.

The host half cannot move a pin either, for a second and independent reason: no pinned fixture runs
`GameSession` at all.

⚠️ **THE HONEST CAVEAT ON "OUT OF DETERMINISM".** `MemorySystem.StateChecksum` **does** fold mind
STRUCTURE (counts, fact ids, secret ids) when the system is registered — the LLM hosts register it —
so an attached persona is not literally invisible to every `StateHash` in the repo. What is asserted,
and driven, is the claim that matters: `AuthoredShips.AttachSleeperPersona` **writes nothing the sim
itself hashes** (`ThePersonaAttach_TouchesNoSimState_ButTheSkillsAre`, which also asserts the
converse in the same run so the leg cannot pass on an inert build). `GameSession.GeneratePersonas`
has been creating minds at boot since L6; this package adds the same class of write at a later tick.

#### 13.39.5 ⚠️ WHAT IS WIRED BUT NOT CONNECTED

- ⛔ **NO SURFACE DRAWS THE SPREAD YET.** The levels and the mask reach the `workcaps` wire
  (§13.37.4) and stop there — **M3-12 owns the WORK tab's skill column and the absent-cell
  rendering.** What a player can see TODAY is the roster: the woken sleeper's authored **role** and
  **traits** in CREW WATCH. Do **not** claim the M4 dossier: `panels.js` is four-of-eight fabricated
  (`◇ SAMPLE`) until M4-3 and this package does not touch it.
- ⛔ **NO SOCIAL BOND IS SEEDED FOR A THAWED SLEEPER** — see §13.39.1. Their relationships exist only
  as prose in the sheets (Bahri↔Osei, Nakamura↔the MOSS board, Torres↔the four dead capsules).
  FILED.
- ⚠️ **THE SECRETS ARE REACHABLE ONLY THROUGH CONVERSATION**, which is the L6 chat surface the
  standard UI does not open onto — a thawed sleeper's fact-backed secret is registered and known and
  nothing in the shipping browser face can ask her about it. Pre-existing, restated because this
  package just multiplied the number of them by eight.
- ⚠️ **NOTHING LEVELS.** There is still no XP, no training and no decay: a sleeper's authored spread
  is the spread she has for the whole run. RimWorld's levelling is §5.1 and is nobody's package yet.

#### 13.39.6 The acceptance harness

`client/tools/sleeper-persona-shot.mjs` — the `pod-bay-shot.mjs` precedent, verbatim in technique and
in disclosure: it repairs `term_moss` with a **played** direct order, commissions it against a
**temporary defs overlay** (`commission_cost = 0`, disclosed in its own header, nothing else
changed), thaws **two** capsules through the POD BAY's own typed `thaw N`, and photographs CREW
WATCH. It never writes sim state and never touches a skill, a mask or a persona. ⚠️ It also
photographs Rell's `general crew` row rather than hiding it, so the decision in §13.39.3 can be
overruled from a picture. Not wired into `./ci.sh` — it needs a browser and a running host.

#### 13.39.7 Two enrolment ledgers grew, and what each enrolment claims

The package's only two red tests on the first full gate were the repo's own **enrolment ledgers**,
which is what they exist to do — a new reader/writer is a decision recorded by name, not a diff
nobody read. `sim/Sim.Core/SleeperAptitudes.cs` is now enrolled in both:

- `SkillConsumerTests.OnlyTheSeamAndTheStorageMayNameASkill` — **the first WRITER of a skill in the
  game.** It names `SetSkill` and nothing else: it never reads a level, never computes a rate and
  never touches `WorkRates`, so §13.37.2's one-seam claim is untouched. Competence still reaches
  WORK through `WorkRates` alone; this file is where competence reaches the PERSON.
- `WorkPriorityStateTests.OnlyEnrolledFilesReadTheWorkGrid` — **the first writer of
  `WorkIncapable`**, ending M2-1's note that the mask was storage with no source. ⚠️ It WRITES and
  never reads an arbitration: no `GetWorkPriority`, no `IsWorkEnabled`, no `CanTakeWorkType`. The
  `IsIncapableOf` the identifier scan sees is `SleeperAptitude`'s own accessor, not `Citizen`'s —
  the scan cannot tell them apart, so the distinction is written down rather than assumed.

---

### 13.40 ⭐⭐ Crew SLEEP — the reducer `Fatigue` never had, and machine wear on every ship moved with it (M3-9 / PIN M3-c, 2026-08-02)

**THE PLAYER SENTENCE.** Until this package **every crew member on every ship in the repo was
permanently exhausted**: `NeedsSystem` ramped `Citizen.Fatigue` to 1.0 over ~16 sim-hours and
**nothing anywhere took a single unit back off it** — that system's own header said so — while
`Citizen.cs`'s field comment claimed *"1 = exhausted (slows work)"*, which was **false in both
halves** (nothing reduced it, and nothing read it for a rate). Now a tired crew member finishes what
she is doing, walks to a bunk, sleeps, wakes rested, and goes back to work — and the crew dock's
task line says which of those she is on. The false comment is corrected in the same commit.

#### 13.40.1 The seam, and the one rule it exists to obey

`sim/Sim.Core/Systems/RestSystem.cs` (new) · `JobKind.Sleep = 12` (`Entities/Citizen.cs`) ·
`WorkTypeMap` (`Entities/WorkTypeMap.cs`, the not-work row) · three `[needs]` def scalars ·
`SystemStack.cs` (the registration, **before** `JobSystem`) · `GameSession.TaskLabel` +
`console-model.js`'s `TASK_TAGS` (the `REST` tag).

⛔ **`rimworld-reference.md` §3.5's boxed rule is the whole design**: *"Needs do NOT interrupt a job
in progress. The need check is a job-SELECTION filter, evaluated between jobs."* The only branch that
can start a sleep is guarded by `Citizen.IsIdleForWork` (`JobKind == None`), so **rest is
structurally incapable of taking a job away from anybody**. That is not tidiness — see §13.40.5 for
the measurement that says no existing suite would have caught the alternative.

⭐⭐ **AND HALF THE MECHANISM LIVES IN `NeedsSystem`: THE RAMP IS GATED ON BEING AWAKE.** §4.4's
numbers describe a rest meter that falls **only while awake**, so an unconditional ramp silently
makes the real recovery `(recovery × effectiveness − ramp)` — the same numbers wearing a different
mechanism. ⛔ **MEASURED with the ramp ungated (M3-9's first commit): a 0.9-tired crew member needed
27.7 sim-hours off a bed and 63.6 sim-hours — two and a half sim-DAYS — on the deck**, which is the
shipped path, at an awake fraction of ~16–30 % against the reference's 70.6 %. Not one test was red:
`RestSystemTests`' fixture deliberately omits `NeedsSystem` (a correct narrowing that created a
blind spot nothing closed — TRAPS, ninth shape, and this file's own header said so). The gate is
`JobKind != Sleep` at the ramp site — the one fact about sleeping that is already saved, already
hashed and already written by `RestSystem`, so the two systems cannot disagree about who is asleep.
⛔ Do **not** re-derive `fatigue_recovery_per_second` to absorb a ramp instead: that encodes a
coupling the analogue does not have and makes the def's §4.4 provenance a lie.
`RestSystemTests.OnTheSHIPPEDStack_TheRampDoesNotFightTheRecovery` is the blind spot's cover.

⭐ **REST IS NOT A WORK TYPE, and that is the seam ruling.** RimWorld's answer, and `WorkType`'s own
header already said the equivalent (*"Eat, Drink and Flee are NOT work types and never will be …
you cannot switch off eating"*). The M2-0 findings make it the only affordable answer too: the
arbitration seam (`IWorkOfferSource`/`WorkArbiter`) speaks only `WorkType` and the player's 1..4
band, so entering rest *there* would mean a seventh hashed grid column — a checkbox for *"this
person may sleep"*. What the arbitration does for rest instead is **refuse to interfere**:
`WorkTypeMap.TryOf` classifies `Sleep` as not-work, so `JobSystem.TryPreempt`'s survival guard (its
FIRST line) declines a sleeping pawn, and no `IJobSource` owns the kind so the dispatcher never
advances her either. **No new guard was written for any of that.**

⭐ **REGISTRATION ORDER IS BEHAVIOUR — and the reason M3-9's first commit gave for it was FALSE.**
§3.5's need-check order is **Eat ▸ SLEEP ▸ Meditate ▸ Recreate ▸ WORK**, so `RestSystem` is
registered **before** `JobSystem` (and after `CitizenSystem`, so movement is settled). What that
buys, measured: for a crew member who is idle when a **tick begins**, the position decides which of
the two is asked first — registered first she chooses **SLEEP** with a full haul board in front of
her (`first job = Sleep`, 0 hauls taken); registered second, **WORK** wins the selection and she
takes another job while exhausted.
⛔ The first commit claimed instead that a claimant behind the dispatcher *"would win only on the
ticks the dispatcher found nothing, which on a busy ship is never."* **That is false**: behind the
dispatcher she still falls asleep, at **t = 121** rather than **t = 1**, because a COMPLETING job
writes `JobKind.None` where a later system sees it inside the same tick. The claim was asserted in
three places and pinned by nothing; an independent reviewer moved the system with every suite green
and P1 unchanged. It is now pinned by
`RestSystemTests.RestIsRegisteredBeforeTheDispatcher_AndThatDecidesTheSELECTION`, the only thing in
the repo that sees it. ⚠️ `IntervalTicks = 1` (the dispatcher's cadence, so "rest is asked first"
holds on every tick rather than one in ten) is **disclosed rather than pinned** — a compile-time
property with no seam to vary.
⚠️ **`SustenanceSystem` is still registered AFTER `JobSystem`, so eating still loses to work where
sleeping now beats it.** That asymmetry is **pre-existing**, is **not fixed here** (it is a behaviour
change to a system this package does not own, and it would confound this row's pin story), and is
**FILED**.

#### 13.40.2 The bed, and what happens without one

| | |
|---|---|
| **claim** | nearest `DeviceKind.Bed` no other live crew member is sleeping in or walking to (Manhattan, ties by device store order), pathed to the bunk's **own tile** — furniture is authored `blocks = false` |
| **occupancy** | **DERIVED, never stored**: a bunk is taken iff some other citizen holds `JobKind.Sleep` with that tile as `JobTarget`. A `Device.SleeperId` field would have been a DEVC bump, a hash fold and a second source of truth that can disagree with the citizen after a load |
| **no bunk / none free / none reachable** | she lies down **where she stands**, at `rest_effectiveness_ground` = **0.8** (§4.4: ground 0.8, bed 1.0) |
| **effectiveness** | read off the tile she is **actually on**, every pass — so a bunk deconstructed under a sleeper silently degrades her to ground rate and there is **no orphan-handling branch anywhere in the file** |
| **waking** | one condition: `Fatigue` reaches 0 (§3.5's *"wakes at rest 100 %"*). No timer, no schedule grid — OD-M item 3 defers the 24-slot instrument past the week-9 gate |

⚠️ **THE 0.8 BRANCH IS THE SHIPPED PATH, not a courtesy.** `--ship wreck` — the default `./play.sh`
ship — calls `RoomDresser.Dress` **deliberately not at all** (*"a raided ship has no bunks left"*),
so **there is not one bed aboard** until the player places one. `PlaceDeviceCommand` has `Bed` on its
furniture whitelist and the standard surface's BUNK tool is live (M3-10 fixed it), so a bunk costs
`build.device_place_cost` Parts.

**The other ways a sleep ends are all pre-existing and none of them is coded in `RestSystem`** —
which is the point of routing rest through `JobKind` at all: `SafetySystem` cancels the job and flees
lethal air (**a sleeper does wake for vacuum**), `MoveCitizenCommand` and `PrioritiseJobCommand` both
call `Simulation.CancelJob` first (**a direct order wakes her**), and `NeedsSystem.Kill` ends it the
last way.

#### 13.40.3 The three def scalars (`content/core/SimDefs/needs.def`, `[needs]`)

| key | value | why that number |
|---|---|---|
| `fatigue_rest_threshold` | **0.75** | RimWorld's trigger is *rest < 30 %* (§3.5), i.e. tiredness above 0.70, rounded to the quarter. At the unchanged `fatigue_per_second` that is **12 sim-hours awake** |
| `fatigue_recovery_per_second` | **1/37800** (`2.6455027e-05`) | §4.4: 0 → 100 % rest is **10.5 in-game hours at effectiveness 1.0** |
| `rest_effectiveness_ground` | **0.8** | §4.4's rest-effectiveness table, verbatim |

They live in `[needs]` beside `fatigue_per_second` and `mood_fatigue_weight` because they are the
same meter: a designer retuning *"how tired do people get"* sees the fall rate next to the rise rate.
⚠️ The **rise ramp's RATE is unchanged**; what changed is that it is now **gated** on being awake
(§13.40.1). The bed's own 1.0 is a RULE, not a fourth scalar — it is the unit the ground multiplier
is expressed against.

⭐ **THE DURATIONS THAT FALL OUT, MEASURED ON THE SHIPPED STACK** (`SystemStack.CreateDefault`, ramp
present). ⚠️ §4.4's *10.5 in-game hours* is the **full 1.0 → 0** case and is not what play reaches:

| from | in a bed (1.0) | on the deck (0.8) |
|---|---|---|
| the shipped 0.75 trigger | **7.89 sim-h** (284 002 ticks) | **9.80 sim-h** (352 854 ticks) |
| 0.90 (the test fixtures' start) | 9.48 sim-h | 11.74 sim-h |
| ⛔ *with the ramp ungated* | *27.7 sim-h* | *63.6 sim-h* |

⚠️ **THE DUTY CYCLE, AND ITS DIVERGENCE FROM THE REFERENCE, STATED RATHER THAN LEFT TO BE FOUND.**
12 sim-h awake (the 0.75 trigger at the unchanged `fatigue_per_second`) + 7.89 asleep is a 19.9 h
cycle, i.e. **60 % awake** in a bed and 55 % on the deck, against §4.4's **70.6 %**. The gap is
entirely the **pre-existing rise ramp** (16 h to saturation), not this package's rates, and it is
left alone deliberately — retuning `fatigue_per_second` is a second, unrelated reason to move P1.
**FILED.**

⚠️ **THE ONE KNOCK-ON, AND ITS ARITHMETIC.** A sleeping crew member is skipped by
`SustenanceSystem` (its `JobKind.None` gate), so **she cannot eat or drink while asleep**. At these
durations that is benign and is bounded: thirst rises at 1/86 400 per second, so a bed sleep costs
**0.329** of the meter and a deck sleep **0.409** (hunger, at half that rate: 0.164 / 0.204), against
a self-serve threshold of 0.5 and no death term on either meter. ⛔ At the ungated 63.6 h it was not
benign — thirst would have risen by 2.65, i.e. she woke fully parched. Bounded by an assertion in
`OnTheSHIPPEDStack_TheRampDoesNotFightTheRecovery`.

⛔ **TIREDNESS IS NOT A WORK-RATE MULTIPLIER IN v1, and it is a scope ruling.** §4.4 measures
RimWorld's rest need as affecting **mood and immunity only — no work or combat stat**. The work
rate's one input is `WorkRates`/`Citizen.SkillsRaw` (M3-7's axis, §13.37) and a second factor here
would double-count it. What fatigue *does* reach is `Citizen.Mood`, and that is where the expensive
half of this row comes from.

#### 13.40.4 ⛔ PIN M3-c — P1/P4/P5 MOVED, P2/P3 HELD, and every claim below was measured

| pin | old | new |
|---|---|---|
| **P1** scenario `--days 3 --seed 42` | `3d23665a724e853d` | **`7bdd0d6f7756dfdc`** (twin match) |
| **P2** perilune tick-3000 | `cb09b584a5f15e52` | **HELD** |
| **P3** slice tick-3000 | `43a1a5c25713faec` | **HELD** |
| **P4** defs defaults | `77a7a8a9e967eab4` | **`661fcdd4b89f1e87`** |
| **P5** defs rules-inclusive | `edf1577c32f14e55` | **`558a1c0a4985f5ea`** |

⭐ **THE P1 CAUSE, DECOMPOSED AS A DRIVEN 2×2** (needs.def edited in place, restored from an
in-memory copy — TRAPS 2):

| | crew never sleep (`fatigue_rest_threshold = 2`) | crew sleep (shipped 0.75) |
|---|---|---|
| `mood_fatigue_weight = 25` (shipped) | **`3d23665a724e853d`** ← the OLD pin, to the digit | **`7bdd0d6f7756dfdc`** ← SHIPPED |
| `mood_fatigue_weight = 0` | `455d352944081b14` | `97f43a5a7f90bae2` |

Read the two rows:
1. ⭐ **With the trigger out of reach P1 returns EXACTLY to its old value.** ⇒ the entire move is the
   **sleep behaviour**. The new system's mere presence — its registration in `SystemStack`,
   `JobKind.Sleep = 12`, the three def fields, the `WorkTypeMap` row, **and the gated ramp** — is
   **pin-neutral, measured** (def scalars fold into the defs checksum, never into
   `Simulation.StateHash`; and a gate that never fires changes nothing).
2. **The bottom row's two cells differ from each other**, so sleeping moves the pin **independently
   of mood**: the labour a sleeping crew member does not do is itself a state change.
3. ⚠️ **AND THE DAY-3 SUMMARY LINE DOES NOT MOVE — say it plainly, because it is the trap.** All
   four cells print `pop 2 / hydro 98.1 kPa / water 0.0 L / potatoes 371`. The ONLY evidence this pin
   moved is the hash, which folds per-citizen `Fatigue`/`Mood`/`JobKind`. ⛔ A reader who checks the
   printed line for a behaviour change will conclude, wrongly, that nothing happened. (M3-9's FIRST
   commit — before the ramp was gated — did move it, to `98.5 kPa / 373`; the shorter gated sleeps
   put the aggregate back.)

⚠️ **P2/P3 HELD, AND THE HOLD IS A PROPERTY OF THE WINDOW, NOT OF A DEAD SYSTEM — proved rather than
asserted.** Tick 3000 is **300 sim-seconds**, where `Fatigue` reaches ~0.0052 against a 0.75 trigger:
nobody aboard *can* sleep. Control, driven: drop `fatigue_rest_threshold` to 0.001 and the SAME two
goldens move — perilune `cb09b584a5f15e52 → c4001c0b66e3e4e9`, slice
`43a1a5c25713faec → 78e2cc40adc39c45`. ⛔ **Do not read "P2/P3 held" as "the goldens cover rest".**
This is M2-12's *"no pin sees the generation term"* and M3-7's *"no pin sees the rate term"* in a
third costume: the instrument for rest is `RestSystemTests`, and nothing else.

⚠️⚠️ **THE THIRD CAUSE, WHICH IS THE ONE THAT IS EASY TO MISS: MACHINE WEAR RATES CHANGED ON EVERY
SHIP IN THE REPO.** `Citizen.Mood` → `ShipMetrics.Morale` → `DirectorSystem`'s
`WeightMoraleDeficit × (1 − Morale)` → `_wearPressure` → `MachineWearSystem`. Driven in
`RestSystemTests.TheWearPath_ACTUALLY_Moves_WhenFatigueFalls`, which asserts it at two points: the
Director's own **hashed** state (`Tension` 0.20644 with sleep vs 0.20903 without, and the
`IStatefulSystem` checksum differs — that is P1 moving, in miniature), and a machine's `Condition` at
the far end. ⚠️ **The direction reads backwards and is correct**: rested crew are happier, tension is
lower, and the Director's lever *"below target (quiet) BUILDS toward the max"* — so a well-rested
ship wears its machines **faster**.

⭐ **AND A FINDING THAT FELL OUT OF BUILDING THAT LEG, worth more than the leg: on a quiet ship the
wear lever is SATURATED.** With water, food and power satisfied the shipped tension sits at ~0.207
against `director.def`'s `lever_target_tension` of 0.35, so `_wearPressure` reaches its
`max_wear_pressure` **stop of 1.35 within ~2 500 ticks and stays there** — while the lever is on its
stop the morale term reaches wear **not at all**. The test raises the ceiling in **both** defs graphs
(disclosed, equally on both sides) purely to make the accumulating difference observable. ⛔ This
does **not** mean wear is unchanged in the shipped game: the lever is off its stop on any ship that
is not quiet, and P1's own 2×2 moved. **FILED** as a Director question nobody has asked.

**P4/P5, measured twice each through two code paths.** P4: the pin test's `CreateDefault` **and**
`DefsEquivalenceTests`' parse of the shipped `.def` files (*"parsed 18 shipped .def files, checksum
661fcdd4b89f1e87"*) — the agreement that says the three transcriptions match. P5: the pin test **and**
`hosts/scenario --days 0 --seed 42` printing `defs: 558a1c0a4985f5ea (18 files, 0 problems, 1 rules)`.
The cause is exactly three appended folds and **no new `DeviceKind`**, so unlike M3-10 neither
`Machines` nor `Recipes` grew.

#### 13.40.5 ⛔ The measurement that justifies the two M2-contract tests

The charter's warning was that an out-of-band rest claim *"would silently undo M2-8's pre-emption
contract and M2-19's sticky hold, both pinned by property rather than by call site."* **Driven, and
it is exactly true:** with rest made an out-of-band interrupt (mutation 2) **and** with it made to
bypass the hold specifically (mutation 3), `StickyClaimTests` + `PreemptionTests` are **GREEN 0/22
both times**. Those suites pin `Citizen.IsRecruitableIgnoringJob`, and an out-of-band claimant never
asks that property. `RestSystemTests.MidHaul_FatigueDoesNotTakeTheJob` and
`.AHeldOrder_IsNotStolenByFatigue` are the only two things in the repo that see it.

#### 13.40.6 ⛔ The send-back, and the two blind spots it exposed

M3-9's first commit shipped with **an ungated fatigue ramp** (§13.40.1) and with **"registration
order is behaviour" asserted in three places and pinned by nothing** (§13.40.1). Both were found by
independent review, and both are worth carrying because of *how* they hid:

1. **The ramp.** Every leg in `RestSystemTests` ran on a fixture that deliberately omits
   `NeedsSystem` — a **correct** narrowing (it makes fatigue exactly what the fixture wrote minus
   what `RestSystem` removed) that created a blind spot nothing else closed. **TRAPS, ninth shape**,
   and this package's own test header had written the narrowing down as a virtue. The un-gate
   mutation is **GREEN 0/11 against the first commit's suite** and RED 1/13 against this one.
2. **The order.** Moving `RestSystem` behind `JobSystem` left every suite in the repo green and P1
   unchanged. ⭐ **And the reason the comment gave was itself false** — behind the dispatcher she
   still sleeps (t = 121 rather than t = 1), because a completing job writes `JobKind.None`
   mid-tick. Writing a *plausible* mechanism next to a *correct* conclusion is the shape here: the
   conclusion "put rest first" was right and the sentence explaining it was not.

⚠️ The harness recorded the first defect and **explained it away**: `rest-shot.mjs` measured a 2.33×
wall-clock spread between the bunk and deck runs and attributed it to host throughput. It was the
ramp (the coupling is non-linear in effectiveness). With the gate the same two runs read 1.26×
against the def ratio's 1.25×. ⇒ **A measured ratio that does not match the def ratio is worth
looking at, not worth explaining away.**

#### 13.40.7 What this package deliberately does NOT build

- **No schedule grid.** OD-M item 3: RW §3.5's 24-slot instrument is revisited after the week-9 gate;
  its *mechanism* (the need check as a selection filter) is what landed here.
- **No mood freeze while asleep.** §4.2 says RimWorld freezes the mood bar and pauses break risk for a
  sleeping pawn; `NeedsSystem` recomputes `Mood` every pass regardless. Not ported, stated.
- **No immunity term.** §4.4's other half needs a disease model, which does not exist.
- **No collapse.** RimWorld drops a pawn where she stands at rest 0; here `Fatigue` simply saturates
  at 1 and she sleeps badly instead. Nothing kills a crew member for tiredness.
- **A `HoldPosition` crew member sleeps IN PLACE and never travels for a bunk** — `SustenanceSystem`'s
  rule for food, applied unchanged: under strict player control the player owns the fetching.
- **No retune of `fatigue_per_second`.** The duty cycle it produces (60 % awake in a bed) diverges
  from §4.4's 70.6 %, and the ramp is left alone anyway: changing it is a second, unrelated reason to
  move P1. FILED (§13.40.3).

---

### 13.41 ⭐⭐ The console can be COMMISSIONED — the verb that was missing, and the arc that dead-ended without it (M3-17, 2026-08-02)

**THE PLAYER SENTENCE.** At the MOSS console the player types `commission` and — with the terminal
repaired and a `ControllerModule` aboard — **the terminal becomes COMMISSIONED: programs and the POD
BAY unlock**; a refusal is a rendered sentence with a named reason and a number.

⛔ **WHAT WAS ACTUALLY MISSING WAS A SENDER, AND THAT IS THE WHOLE LESSON OF THIS ROW.**
`CommissionDeviceCommand` has worked since E0-6 (`Commands.cs:697`), `build.def` has priced it at
`commission_cost = 1` since the same package, and `GameSession.HandleCommission` (`:1364`) has
bridged a `{"cmd":"commission",x,y,deck}` message since the build palette. **No client and no TUI
surface ever emitted that message.** Every piece was green, every test passed, and the opening arc
still dead-ended one step before the pod bay: the M3 milestone demo could only reach a commissioned
console through a temporary defs overlay at `commission_cost = 0`, disclosed at the time. The
blocker was named in HANDOVER on 2026-08-02 as *"purely A BUTTON"* and this package is that button.

#### 13.41.1 The seam — one op, one pure gate, one sentence

| where | what |
|---|---|
| `sim/Sim.Core/MossGate.cs:126` | `LiveServer(sim)` — the lowest-`Device.Id` terminal `IsServerLive`'s own term accepts, or `null`. The mirror of `ThawGate.CommissionedConsoleName` one tier down |
| `MossGate.cs:228` / `:246` | `CommissionRefusal` (None · NoServer · AlreadyCommissioned · NoModule) and `CommissionVerdict` (reason · terminal · **tile** · cost · units aboard) |
| `MossGate.cs:290` | `EvaluateCommission(sim, requestedTid)` — **PURE**: reads live sim state, spends nothing, mutates nothing, draws no RNG |
| `MossGate.cs:351` | `DescribeCommission(in v)` — the four sentences, upper case, InvariantCulture |
| `hosts/web/GameSession.cs:663` | the `case "commission":` arm of `HandleMoss` |
| `hosts/web/GameSession.cs:715` | `Reply(tid, sentence)` — `Refuse`'s twin, stream **1**, `ok:true` |
| `client/src/ui/moss-model.js:800`, `:906` | `commission` joins `parseCommand`'s nav vocabulary and `navCommand`; `HELP_LINES` names it |

⚠️ **THE TERM ORDER IS THE CONTRACT — SHIP, TARGET, PRICE, in that order.** Term 1 is the ship gate
(`LiveServer == null` ⇒ `MossGate.OfflineRefusal`, the SAME constant every other op refuses with —
refuse by predicate, report by predicate). Term 2 is the target's own state. **Term 3 is the price
and it is LAST**, so a refusal never bills; here that is structural rather than careful, because
`EvaluateCommission` cannot spend at all and `CommissionDeviceCommand.Execute` charges after its own
two guards (`Commands.cs:861`). Driven by `WebCommissionTests.ARefusalNeverBills`, which censuses
the ITEM STORE before and after every refused ask; moving `TryPay` above the `Scriptable` check
reddens it by name (mutation 4, run).

#### 13.41.2 ⛔ THE VERB SITS AT THE **REPAIRED** TIER, AND IT IS THE ONLY TIER IT CAN SIT AT

OD-N's split (§13.31) puts programs, the thaw and the pod bay behind COMMISSIONED. **Commissioning
itself cannot join them**: a console that had to be commissioned before it could be commissioned
would make the entire opening arc unreachable, which is the exact blocker this package closes. A
DARK terminal still refuses — with the SHIP's sentence. Pinned as a CONTRAST rather than an
assertion by `TheCommissionVerbSitsAtTheREPAIREDTier_NotBehindItself`: in **one** state (repaired,
un-commissioned) the `set` program op refuses and the `commission` op works, both driven in the same
fixture, so the two tiers are demonstrably distinguishable at that point.

#### 13.41.3 The prompt addresses `@console`, so the SIM resolves the terminal

The MOSS prompt sends `tid: "@console"` (spec §1.3) — a free-text key with no device behind it. The
client **cannot** pick a terminal: `Device.Condition` and `Device.Scriptable` are the two facts
OD-N's tiers turn on and **neither has ever reached the wire**. So `LiveServer` resolves it and the
reply NAMES it, exactly as M3-4 does for the bay. `requestedTid` is honoured only when it names a
terminal that is itself live. ⚠️ **The tie-break is inherited, not re-decided**: a ship with two live
terminals answers through the lower-`Id` one — `ThawGate.CommissionedConsoleName`'s known
consequence, for the same reason (no name literal may live in `sim/`). Non-vacuity of the resolver is
asserted on the DARK boot ship, where it must name nothing.

#### 13.41.4 ⛔ THE HOST DECIDES NOTHING — and the instrument for that is a window production cannot open

`HandleMoss` reads the gate to RENDER the answer and enqueues `CommissionDeviceCommand`
**regardless** of it (the thaw op's construction exactly). The one arm that does not enqueue is
`NoServer`, and not as a second gate: there is no terminal, so there is **no tile to address**, and
`Int3.default` is a real tile on every ship.

**The property is otherwise invisible** — the command is a no-op on every refusal, so a gated
enqueue and a blind one produce identical ships. `TheHostDoesNotDecide_ARefusedAskStillReachesTheSim`
forces the window: the op is sent while the ship cannot pay (the console renders the refusal), a
module is added **before the tick drains**, and the command that drains one moment later finds it and
does the work. Changing the arm to `if (verdict.Allowed)` reddens exactly that test and nothing else
(mutation 3, run). ⚠️ **That window is a test artefact and is labelled as one**: in the shipping host
`Apply` runs INSIDE the command drain, between ticks, so the gate's read and the command's execute
cannot disagree. The mirror leg (`ARefusedAskThatStaysRefused_ChangesNothing`) keeps "enqueued blind"
from being read as "accepted blind".

#### 13.41.5 The sentences, and the family they joined

```
COMMISSION ACCEPTED — TERM_MOSS — 1 CONTROLLER MODULE FITTED; PROGRAMS AND THE POD BAY ARE OPEN
ALREADY COMMISSIONED — PROGRAMS AND THE POD BAY ARE OPEN ON TERM_MOSS
COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0
MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR ONE TO REACH THE DOORS   ← not a new one
```

The two new refusals join M3-4's pinned family in
`ThawGateTests.TheConsoleSentences_ArePairwiseDistinct`, which grows from four sentences / six pairs
to **six sentences / fifteen pairs** and still requires **pairwise distinct AND distinct in the first
four words**. Both new leads deliberately avoid the terminal's NAME, so content cannot move a lead.

⚠️ **AND THE ONE COLLISION THAT WAS NOT OBVIOUS:** `ThawGate.Describe`'s rung arm composes
`NEEDS 1 CONTROLLER MODULE — SHIP HAS 0` for a thaw whose rung is a module — the same words, on the
same transcript line, about a different ask. **Naming the ACT** (`COMMISSIONING NEEDS …`) is the only
thing keeping them apart, so it is asserted rather than left to the reader. Rewording the
already-commissioned refusal to share `MossGate.NotCommissionedRefusal`'s lead reddens the family
test by name (mutation 6, run).

⭐ **THE ACCEPTED LINE GOES OUT ON STREAM 1, AND IT HAD TO EXIST.** `commission` is the first op in
this switch whose success **repaints nothing** — no screen opens, no row changes. Without a sentence,
"it worked" and "the key did nothing" are the same picture: the *invisible feedback is functional*
rule, which has cost this repo three owner reports. Deleting the accept branch reddens the outcome
test (mutation 7, run).

#### 13.41.6 Witnessed in real Chrome — and what the witness deliberately stops short of

`client/tools/commission-shot.mjs` (new; the `moss-gate-shot.mjs` harness shape — CDP, trusted
keystrokes, the sim's truth read off an **independent** socket, never the page). Run against
`./play.sh --host-port 8390 --client-port 8391 --no-open` on the shipping `--ship wreck`,
**ALL CHECKS PASSED**:

1. `HELP` lists `COMMISSION` — and so does the LEDGER footer, beside `PODS`.
2. On the boot ship the console is DARK and `commission` answers
   `MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR ONE TO REACH THE DOORS`; the typed line
   is echoed and the client never answers `UNKNOWN COMMAND`.
3. **A REAL repair** — REPAIR turned on in the WORK tab, the crew servicing `term_moss` from
   `cond 36/255` to **229/255** (the `maintain` floor is 51), watched on the `devices` channel.
4. ⭐ The same line now reads `COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0` and **no longer
   says OFFLINE** — the tier is right, at the real `commission_cost = 1`.
5. `prog term_moss` on the same live console still refuses in M3-15's words, so the split stands.

⭐ **THE HARNESS HAS ITS OWN NON-VACUITY CONTROL, RUN.** With the `case "commission":` arm renamed
so the op rejoins `default: break;` (the silent swallow) and the host rebuilt, the tool reports
**3 FAILED** — steps 2 and 4 go red with empty error transcripts — while step 1 stays GREEN, which
is the right split: `HELP` is a client fact and the sentences are the host's. ⚠️ Step 4's *"does not
say OFFLINE"* leg passes **vacuously** under that mutation; it is a negative check and the two
positive legs beside it are the biting ones.

⛔ **NOT WITNESSED IN THE BROWSER: THE ACCEPTED BRANCH**, and the header of the tool says so in the
same words. It needs one `ControllerModule`, and the only honest way to get one is to play the whole
Regolith → Scrap → Parts → ControllerModule chain — which the M3 demo did, over many steps and
several sim-hours. Faking it with a `commission_cost = 0` overlay is the exact thing this package
deletes. The accepted branch is driven at the wire instead
(`TypingCommission_CommissionsTheConsole_AndTheseTwoUnlock`, which ends by asking the ship for the
POD BAY and getting twelve rows) and at the reducer. **The full-arc browser beat is still owed and
it is T13's own unmodified-game run.**

#### 13.41.7 Pins, and what is NOT here

**PIN-NEUTRAL, and measured rather than argued** (`./ci.sh` green in the lane, P1 twin match at
`7bdd0d6f7756dfdc`, both tick-3000 goldens byte-unchanged, P4/P5 unmoved). No hashed state, no def
field, no new `DeviceKind`, no system, no save chapter — `MossGate` still holds nothing. The reason
it cannot move a pin is the one M3-15's own gate had: **no pinned fixture sends a MOSS op at all**,
and `CommissionDeviceCommand` was already in the sim before this package.

- **The BUILD-palette route is still sender-less.** `CmdKind.Commission` / `HandleCommission`
  (`GameSession.cs:1364`) parse a `{"cmd":"commission",x,y,deck}` message that **nothing emits** —
  this package added the MOSS op instead, because that path renders a verdict and the palette bridge
  writes only `_status`, a console string the standard surface never shows. FILED, not deleted
  (`HandleOperate`'s precedent: kept for M4-8).
- **No `commission <device>` argument.** The verb commissions the console the player is speaking
  through. Commissioning arbitrary devices is E0-6's general sink and has no surface; opening one
  here would be a second feature.
- **The ship-gate sentence still ends `…TO REACH THE DOORS`**, which is about actuation rather than
  about programs. It is the one constant three surfaces render and it was not re-worded for one new
  caller. FILED.
- **No TUI sender.** `hosts/tui` has no MOSS op surface at all; nothing was narrowed.

### 13.42 ⭐⭐ The thaw ladder decays in DAYS, and the ship says so before the price rises (D2, 2026-08-02)

**The defect, measured.** The M3 milestone demo (finding D2) watched Mbeki's capsule go
`2 PARTS` → `1 CONTROLLER MODULE` inside **100 sim-minutes**, unannounced. Driven on the pre-D2 tree
(`ac02267`, full `SystemStack`, `--ship wreck`, no player): **six of the seven thawable capsules
changed rung at sim-hour 9**, Lindqvist at 18, and by sim-hour 120 **every capsule aboard sat on
rung 7** — the deepest, three-`ControllerModule` rung. The cause was arithmetic, not a bug: the bands
were 0.02–0.03 wide, each pod was authored 0.01–0.02 above its own floor, and `CryoPod` wear is
0.001/h (`machines.def:75`) × `DirectorSystem.WearPressure` (1.00–1.35, measured ~1.08 on a quiet
wreck). Owner's ruling (2026-08-02): **keep the decay as a feature, slow it, surface it.**

⚠️ **AND THE REASSURANCE IN THE SHIP'S OWN COMMENT MEASURED A THRESHOLD THAT DOES NOT EXIST.**
`AuthoredShips.cs` said *"the lowest of them takes ~480 sim-hours to reach its `maint` threshold at
all"* — but `machines.def:67-68` says in its own words that `CryoPod`'s `maint = 0` **IS THE OPT-OUT,
NOT A THRESHOLD**, so there is nothing for 480 hours to be a countdown to. Corrected in place.

#### 13.42.1 Half one — the re-scale

`ThawGate.BandFloors` (`sim/Sim.Core/ThawGate.cs`) is now the ONE place the six interior edges are
written; `RungOf` reads it and the new `BandFloorOf(rung)` reports it. Edges and the seven authored
`PodSpec.Condition` values moved together:

| rung | band floor (old → new) | pod (old → new) | headroom (old → new) | sim-h to crossing at 0.001/h |
|---:|---|---|---|---:|
| 1 | 0.92 → **0.92** | Lindqvist 0.94 → **0.99** | 0.02 → **0.07** | 20 → **70** |
| 2 | 0.90 → **0.84** | Ozawa 0.91 → **0.91** | 0.01 → **0.07** | 10 → **70** |
| 3 | 0.87 → **0.76** | Ferreira 0.88 → **0.83** | 0.01 → **0.07** | 10 → **70** |
| 4 | 0.85 → **0.68** | Mbeki 0.86 → **0.75** | 0.01 → **0.07** | 10 → **70** |
| 5 | 0.82 → **0.60** | Bahri 0.83 → **0.67** | 0.01 → **0.07** | 10 → **70** |
| 6 | 0.80 → **0.52** | Nakamura 0.81 → **0.59** | 0.01 → **0.07** | 10 → **70** |
| 7 | catch-all | Torres 0.78 → **0.51** | — | — |

*(Two coincidences worth not misreading: rung 1's floor is 0.92 both before and after, and Ozawa's
Condition is 0.91 both before and after. Every other number moved, and the two that did not are
arithmetic accidents of a uniform re-scale — not evidence that anything was left alone.)*

**Driven on the shipped tree after the change** (full `SystemStack`, `--ship wreck`, no player,
hourly rung sampling): **all six crossable capsules cross at sim-hour 65** — Lindqvist, Ozawa,
Ferreira, Mbeki, Bahri, Nakamura — and Torres, the catch-all, never (unmoved past sim-hour 100).
At sim-hour 36 not one has moved. ⇒ **9 sim-hours → 65 sim-hours, a 7.2×
slowdown**, and the arithmetic floor (`ThawLadderDecayTests.MinHoursToFirstCrossing` = 60 h) is
asserted in ABSOLUTE hours, never as a ratio (the seventh trap: a ratio suite cannot see a scale
change, and this IS one). The driven number is below the arithmetic 70 because
`DirectorSystem.WearPressure` measures ~1.08 on a quiet wreck.

⚠️ **OD-M item 1's CURVE IS UNTOUCHED** — seven rows, same items, same counts, chain depths still
`0 0 2 2 3 3 3`, last rung still 3× the commissioning prologue, and every pod on the same rung it
booted on before. What moved is where the edges sit.

⭐⭐ **0.08-WIDE BANDS AND NOT 0.11 — AN OWNER RULING, AND THE FIRST DRAFT IS WHY IT WAS ASKED FOR.**
D2's first implementation used 0.11-wide bands (0.10 of headroom, ~100 sim-hours, driven first
crossing at sim-hour 93). Seven bands 0.11 wide need 0.66 of `Condition` to live in, so that ladder
spanned 0.98 → **0.32** and left the deepest capsule **~220** unattended sim-hours from `CryoPod`'s
`fail` (0.10) where the shipped ship left it ~680 — and a pod below `fail` is
`ThawRefusal.PodNoSignal` **permanently**: `maint = 0` makes every repair path skip it
(`MaintenanceSystem.cs:223,505` both gate on `Condition >= MaintainBelow`), player-forced or not.
That trade was taken to the owner rather than shipped. **The ruling (2026-08-02): walk the bands
back to ~70 sim-hours so every capsule stays above `Condition` 0.50.** The shipped ladder spans
0.99 → 0.51, **Torres sits ~410 sim-hours above `fail`**, and the price pacing is still ~7× the
shipped tree's. Nothing warns about the `fail` crossing; that row is FILED for M5-2's alert stack.

⭐ **AND THE 0.50 FLOOR IS NOT COSMETIC — IT KEEPS A CENSUS HONEST.** `deconstruct.def
device_parts = 2` puts a cliff at `Condition` 0.5 (`floor(2 × c)` = 0 below it), and
`WreckShipTests.PrintTheBootCensus` counts every device under it as *"worth SWARF if stripped"*. The
0.11 draft pushed Nakamura and Torres under that cliff and the census went 44 → **46** — two
capsules that can never be stripped at all (`DeconstructSystem` refuses every closed pod), i.e. two
units of salvage the census promised and the ship does not have. Under the shipped table the census
reads **44** again, measured. ⚠️ It also caught a stale number: that paragraph in `AuthoredShips.cs`
claimed **45**, and the pre-D2 tree measures **44** — the doc was already wrong, and only measuring
both ends of the re-scale exposed it.

⚠️ **A float-granularity artefact worth knowing** (measured, not modelled): the per-tick decrement is
~3e-8 and `float` ulp is 6e-8 above 0.5 and 3e-8 above 0.25, so deep capsules lose Condition slightly
more slowly than shallow ones. It leans the safe way and nothing depends on the two rates being equal.

#### 13.42.2 Half two — the `alerts` channel

`hosts/web/WireFormat.Alerts.cs` (new partial; **`WireFormat.cs` at a ZERO diff**, the M3-4/M3-5
precedent) emits `{"type":"alerts","text":"…"}` every render, derived from
`ThawGate.CapsuleNearestToRungCrossing`. `text` is `""` when nothing is close — the `ending` rule:
"all quiet" is a state the WIRE expresses, never an absence the client infers from a channel that
stopped arriving. The Overview draws it in `#ov-alert`, directly under the ENDING bar
(`client/src/ui/overview-view.js` `paintAlert`); `hud.js` caches it (`getAlerts`) and draws nothing.

- **The margin is `ThawGate.DecayWarningMargin = 0.025`** — a named constant, never a def field
  (`MinDaysOfFood`'s precedent: a def scalar would move P4/P5 for a number nobody tunes, and a def
  field pinned only by a checksum is not pinned). 0.025 / 0.001 = **25 sim-hours of notice at nominal
  wear**, 18.5 h at the Director's ceiling pressure — the ship gets less warning exactly when the run
  is going worse, which is the right direction for a warning to lean. Against the shipped 0.07 of
  headroom that is the last **36 %** of a capsule's band; at boot every capsule is 0.045 clear of it,
  so the bar starts silent (driven, `TheBarIsSilent_OnTheShippedShipAtBoot`).
- **One line, nearest-to-crossing.** Several capsules can be inside the margin at once; the bar names
  the one about to cross and the POD BAY (typed `pods`) is the detail view. Ties break on the lower
  `Device.Id`, `CryoSystem`'s own election.
- **Never named:** an OPEN capsule (no price left to pay), one below `fail` (its sleeper is dead and
  term 1 refuses it permanently), and one on the **catch-all rung** — `BandFloorOf` answers
  `NoBandFloor` there, so the margin test cannot pass and the ship never promises a rise that cannot
  happen.
- **The sentence:** `CAPSULE DECAYING — MBEKI — THAW PRICE RISES SOON`. Em-dash apposition rather
  than `MBEKI'S`, for `ThawGate.Describe`'s stated reason — a possessive needs a rule for names
  ending in `s`, and this repo refuses that class of table ("NO PLURALISATION, on purpose").

⛔ **NOT A CHRONICLE EVENT, AND THAT IS MEASURED RATHER THAN PREFERRED.** The same demo's finding D6
is that the Chronicle is a **200-entry ring drowned in brownout spam** — a real event posted there is
evicted before the player opens the MOSS console. A derived, always-visible line has nothing to miss.
⭐ **D6 IS NOW FIXED (2026-08-02, §13.8.1) AND THIS DECISION STANDS UNCHANGED.** The ring no longer
evicts, so a Chronicle line WOULD survive — but a capsule whose price is about to rise is a
CONDITION, and RimWorld §11.1 puts conditions on the alert stack and events in the letter log. D2
picked the right channel for the right reason; the reason is now the rule rather than the ring size.

⭐ **THIS BAR IS A PRE-PAYMENT ON M5-2 / T17, THE ALERT STACK.** The channel is named `alerts`
(plural) and carries one `text` field; M5-2 should turn that field into a list and keep the channel,
the `hud.js` cache and the Overview slot. D2 ships exactly one alert because that is the one the demo
proved the game needs — a stack with one row is a stack nobody can design against.

#### 13.42.3 What D2 deliberately does NOT do

- **No def-value change** (P4/P5 untouched — the band table and the margin are literals in code).
- **No new hashed sim state** (the bar is a view channel; `GameSession.cs:1862-1863`'s rule).
- **No Chronicle change** (finding D6 was a different package — it landed 2026-08-02, §13.8.1).
- **No warning about the `fail` crossing** — the permanent one. Filed above and STILL OPEN after the
  0.50 ruling (~410 sim-hours is distance, not a message): it wants its own sentence, and it is the
  natural second row of M5-2's alert stack. D2 was chartered on the PRICE.
- ~~**No fix for demo finding D1** (an ordinary thaw writes no Chronicle line).~~ Filed by D2, and
  **CLOSED 2026-08-02** by the D1/D6 package: `CryoSystem.Open`'s fall-through arm records
  `HistoryKind.Thaw` naming the sleeper (`Systems/CryoSystem.cs:330-344`).

---

### 13.43 ⭐⭐ The Chronicle tells the story — the flap stops evicting it, and the three player verbs write a line (D1 + D6, 2026-08-02)

**THE PLAYER SENTENCE.** *The ship's log stops being a brownout ticker: repairs, commissioning and
thaws each write a line the player can actually find, and power flapping no longer evicts them.*

Two owner-triaged findings from the M3 demo, in one lane because they are one surface. §13.8.1 has
the D6 mechanism and its before/after census; §10.7 has the kind table, the three new lines and
which code writes each. This section is the **pin record** and the list of what was deliberately
not done.

#### 13.43.1 THE PIN MATRIX — all five held, and FOUR OF THE FIVE HOLDS ARE VACUOUS

| pin | fixture | before | after | verdict |
|---|---|---|---|---|
| **P1** scenario `--days 3 --seed 42` | `hosts/scenario` `BuildScenario` | `7bdd0d6f7756dfdc` | `7bdd0d6f7756dfdc` (twin match) | **HELD — VACUOUS** |
| **P2** perilune tick-3000 | `SimHost.Build` | `cb09b584a5f15e52` | **HELD** | held, window |
| **P3** slice tick-3000 | `--ship slice` | `43a1a5c25713faec` | **HELD** | held, window |
| **P4** defs defaults | — | `661fcdd4b89f1e87` | **HELD** | genuinely inert (no def field) |
| **P5** defs rules-inclusive | — | `558a1c0a4985f5ea` | **HELD** | genuinely inert (no def field) |

⛔ **WHY P1's HOLD IS VACUOUS, MEASURED RATHER THAN ARGUED.** Instrumenting `Report` in
`hosts/scenario/Program.cs` (patched, run, restored from an in-memory copy with the mtime moved
FORWARD — TRAPS 2) and printing a census of the ring at each day boundary:

```
SCRATCH-CAUSES brownoutEntries=0 thawLines=0 repairLines=0 commissionLines=0 cryoPodsOnShip=0
```

— on all three days. The P1 fixture's 200-entry ring is **200/200 `Bond`**. It publishes no
brownout edge in three sim-days, authors **no CryoPod at all**, completes no repair (OD-H boots
every work type off and the fixture enqueues no command) and issues no commission. **All four
halves of this package are reached zero times on the pin.**

The four independent stubs were run anyway, because a count and a hash are different evidence
(each mutation applied in place, measured, reverted from an in-memory copy):

| P1 with… | hash |
|---|---|
| the shipped tree (all four live) | `7bdd0d6f7756dfdc` |
| brownout coalescing stubbed | `7bdd0d6f7756dfdc` |
| the ordinary-thaw line stubbed | `7bdd0d6f7756dfdc` |
| the repair event stubbed | `7bdd0d6f7756dfdc` |
| the commission event stubbed | `7bdd0d6f7756dfdc` |

Every cell identical, and identical to `main` before the lane. **This is M2-12's *"no pin sees the
generation term"* and M3-7's *"no pin sees the rate term"* in a third costume, and it is worse here
because the affected surface is the SHIPPED ship.**

⭐ **THE SAME CODE MOVES THE HASH HARD WHERE IT IS REACHED — the driven control, on `--ship wreck`,
the ship `./play.sh` boots and which no pin covers:**

| cell | `StateHash` @ tick 200 000 | @ tick 864 000 | ring @ 200 000 |
|---|---|---|---|
| pre-fix writer (subjects 0, no coalescing) | `291fedc58c4720ed` | `2686a42ad8c1cf46` | 200 entries, all Brownout |
| **SHIPPED** | **`79c6641856fb779f`** | **`84a8c59eb1eebb9f`** | 9 entries (3 Alarm + 4 Generic + 2 Brownout) |

The pre-fix cell is re-derived on the CURRENT tree (the writer replaced by its old shape) and
reproduces the value measured on `main` to the digit, which is what makes it a control rather than
a recollection.

**WHY P2/P3 HOLD, and it is the window rather than a dead system** (M3-9's shape). Measured at
tick 3000 on all three authored plans: `perilune` 0 entries, `slice` 1 entry, `wreck` 4 entries,
and **0 brownout edges on every one of them** — the first edge is at tick 128 361 (wreck) and
191 331 (slice), 43× and 64× later than the golden. `perilune` and `slice` also author 0 CryoPods.

**No re-pin was performed and none was owed**: `ci.sh`'s literal, both golden files and both defs
checksums are untouched. No new def field exists (`BrownoutQuietTicks` is a code constant per
M2-1's rule-not-tunable precedent), and `HistorySystem.StateVersion` stays at **2** — `SubjectA`
and `SubjectB` were already written by `CaptureState` and already folded by `StateChecksum`, so the
save format did not change at all.

#### 13.43.2 ⛔ TWO DEFECTS INDEPENDENT REVIEW FOUND, AND WHAT THEY COST TO CLOSE

Both were shipped by the lane's first commit, both were caught by review rather than by the gate,
and both are worth reading before touching this code again.

**DEFECT 1 — a save taken mid-brownout stopped replaying. A determinism REGRESSION against `main`.**
`PowerSystem` is deliberately not `IStatefulSystem`, so `_wasBrownout` restores as `false` and
re-publishes a `BrownoutChangedEvent` for a network that was already shedding (a topology rebuild
does the same). **Before this package that duplicate was one more ring entry which evicted within
~200 s** — genuinely harmless, and `PowerSystem`'s own header said exactly that: *"a duplicate
notification, not a state divergence; nothing hashed moves"*. Coalescing folded it into a HASHED,
never-evicted field and the sentence went false. Measured on the shipped wreck: save at tick
135 000, `SaveWriter`→`SaveReader`, 60 000 ticks of run-on against an uninterrupted twin ⇒ HIST
`eff48a500b403996` vs `eff48a500b4e5117`, differing on ONE datum — one episode's edge count, 1036
against 1037.

⭐ **THE FIX IS AN IDEMPOTENCY RULE DERIVED FROM THE RING, and it is exact rather than heuristic.**
`PowerSystem.Balance` publishes only on a CHANGE, so a network's edges strictly alternate within one
uninterrupted run; an edge whose direction the ring already records for that network cannot be a
real transition. `HistorySystem.RecordBrownout` drops it. That required the direction to become
STRUCTURAL — hence the episode word (§13.8.1), because parity does not encode it.

Driven, with §13.10's documented matched recompute (`SaveReader` leaves the loaded sim's rooms dirty
and `RoomState.Recompute` is not gas-idempotent, so the twin must take the same recompute — the
protocol `SaveRestoreRunOnTests` and `P2ExitTests` already use):

| leg | live | loaded |
|---|---|---|
| save @ 100 000 (before this ship's first edge — the control) | `1cd7a257831108b3` | `1cd7a257831108b3` |
| save @ 135 000 (mid-brownout — the subject) | `8b66921d15d45c9b` | `8b66921d15d45c9b` |

Whole `StateHash`, both legs bit-identical. Instrument:
`ChronicleSignalTests.TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode`
— MID-episode, read literally: episode-boundary save ticks are residual 2 below and do NOT replay.
⚠️ **The chapter-only round-trip beside it cannot see this** — it has no `PowerSystem` in its stack —
and it was offered as the evidence in the first commit. Wrong scope for the claim; both tests now
say so in their own headers.

⛔ **TWO RESIDUALS SURVIVE, AND THE SECOND ONE IS REACHABLE ON THE SHIPPED WRECK.** An earlier draft
of this section filed only the first and called the replay property otherwise general. It is not,
and a lane that read it that way would have been wrong.

**RESIDUAL 1 — the evicted-episode corner.** The rule sees only what is still in the ring. If a
network's newest brownout entry has been evicted (200 newer entries pushed past it), a duplicate
appends a fresh episode and a reload diverges. Unreachable in practice on the shipped wreck — its
whole day-1 ring is ~30 entries now, which is this package's point — but real.

**RESIDUAL 2 — a save taken on an episode's OPENING TICK never re-converges.** Found by independent
review, re-measured here. The idempotency rule DROPS a duplicate edge; it cannot RECONSTRUCT an edge
the loaded sim never published. With `_wasBrownout` reset, the loaded sim re-derives the episode's
opening edge on a LATER 1 Hz `Balance` pass than the live sim did, so the coalesced entry's hashed
TICK STAMP differs — and because the entry is coalesced and never evicted, the difference is
**permanent and compounding**:

| wreck episode | live | loaded |
|---|---|---|
| 164 361 | `t=164361`, 891 edges | `t=164371`, 891 edges |
| 200 371 | `t=200371`, 34 edges | `t=200451`, 32 edges |
| …compounding at 236 391 | `t=236391`, 218 edges | `t=236511`, 216 edges |
| …at 344 571 | 74 edges | 72 edges |

⭐ **THE WINDOW IS NARROW AND WAS SWEPT RATHER THAN ASSUMED.** It sits at the episode boundary and
ENDS on the tick the entry is stamped: **1 tick** at the 128 361 episode (36-tick sweep, everything
else clean), **1 tick** at 164 361 (21-tick sweep), **11 ticks** (200 361–200 371) at 200 371. So of
order 1–11 ticks in every ~36 000 — but *permanent* when hit, which is what makes it worth filing
rather than rounding away.

⚠️ **ON `main` THE SAME PERTURBATION EXISTS AND SELF-HEALS.** Pre-fix every edge was its own entry,
so a mis-stamped one evicted within ~200 s. **Coalescing is what makes it permanent** — D1's
mechanism in a second costume, and no consumer-side rule can close it. The honest fix for
`_wasBrownout` is the same one D1 already filed: make `PowerSystem` stateful, a new SYSS chapter
that moves P1/P2/P3. **FILED, not chased** — and residual 2 is now the strongest argument for that
package rather than a footnote to it. `PowerSystem`'s header carries the deferred obligation, so the
next consumer of `BrownoutChangedEvent` that accumulates into hashed state does not get a free pass
from a sentence that was true in 2026-07.

⚠️ **WHAT THE REPLAY TEST THEREFORE PINS, READ ITS NAME LITERALLY:**
`TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode` covers MID-episode and pre-edge
save ticks — **not** episode-boundary ticks. `EpisodeBoundarySaves_DoNotReplay_ThisIsFiledResidual2`
is the boundary's own instrument and asserts the divergence together with its clean neighbour, so it
goes red if a future change either closes the residual or widens it past one tick.

**DEFECT 2 — the coalescer made a fault line CLEAR ITSELF.** A whole episode is one entry whose text
is rewritten in place, so a recovery overwrote the record of its own fault; `ShipSystems`' sniff for
the word "recovered" then skipped the only evidence the network had ever shed. Measured on the
driven wreck at tick 864 000: 3 of 21 episodes ended recovered and the reactor row reported the
tick-814 211 episode while the NEWER 850 221 one was skipped — the inversion of MOSS spec §5.1, and
it also falsified three prose sites that had been true for months. Closed structurally, in two
places, both direction-independent: `HistorySystem.BrownoutEpisodeRecordsAFault` decides whether an
episode is attributable (only a single-edge PURE recovery is not), and `ShipSystems.Fault` renders
`HistorySystem.BrownoutFaultLine` for a brownout hit rather than the entry's developing sentence —
so the column can never print "CURRENTLY RECOVERED" under a heading that means the opposite, and
never depends on where a 56-character truncation lands. The three prose sites are true again:
`ShipSystems.FaultCaveat` now says *"nothing clears a fault line — not a repair, not a recovery"*,
which is a claim about code in that same file.

⚠️ **AND THE PRE-EXISTING TEST FOR THIS PROPERTY WAS A COIN FLIP.**
`ShipSystemsTests.Fault_Column_Is_The_Last_Thing_That_Went_Wrong_And_Never_A_Recovery` drives the
slice for a day and reads whatever fault falls out — it stayed GREEN through the whole broken
window, purely because that ship happens to be shedding at its day-1 boundary. It now carries a
deterministic second leg that appends a recovered episode and a pure recovery and asserts both
outcomes; the property's primary instrument is
`ChronicleSignalTests.ARecoveredBrownoutEpisode_IsStillTheLastFault_AndTheColumnPrintsTheFault`,
whose first leg authors its ring rather than hoping for one.

⚠️ **A THIRD FINDING, FROM RUNNING THE FIXES' OWN MUTATIONS.** The claim *"the direction test
deliberately ignores the window"* had NO instrument: moving that line below the window `break`
reddened nothing in the suite. That mutation survived once and is now covered by
`ADuplicateEdgeIsDropped_EvenAfterTheEpisodeWindowHasExpired`, which has a control leg so it cannot
be satisfied by dropping every late edge. A claim in a doc comment with no test behind it is what
the mutation discipline is for.

#### 13.43.3 A REGRESSION THIS PACKAGE CAUGHT IN ITSELF — a repair reported as a fault

`ShipSystems.Fault` attributes the MOSS ledger's LAST FAULT column by matching a row's DEVICE NAMES
against a history line's text (spec §5.1's admitted weak join). **D1's repair and commission lines
are the first entries in the whole Chronicle to contain a device NAME**, so the join matched them:
the ledger reported *"OKAFOR OVERHAULED THE SCRUBBER (SCRUB_A) — AS GOOD AS NE…"* under a column
headed LAST FAULT — §5.1's exact misread, arriving through the door §5.1 left open. The older
device-touching lines are safe only by accident: `StripText` names the device KIND ("the scrubber"),
never `scrub_a`.

Closed by `ShipSystems.IsNotAFault` (`ShipSystems.cs:1101-1127`), which now skips the two GOOD-NEWS
kinds as well as any line containing "recovered". It lists the good-news kinds rather than
allow-listing the fault kinds on purpose — an allow-list would silently narrow the name join for
every existing kind, which is the NINTH trap shape. Driven by
`ChronicleSignalTests.ARepairLineNamingItsMachine_NeverReachesTheLastFaultColumn`; the mutation
(delete the `RepairCompleted` clause) was applied and reddens it with the sentence above.

Two consequences documented rather than left to be found:

- **The host's own `FaultCaveat` sentence had gone false and was rewritten.** It read *"nothing is
  published when a machine is repaired, so a fault line never clears itself."* Repairs publish now.
  The caveat still HOLDS, for a different reason — the column never reads the repair line — and the
  shipped sentence says that instead (`ShipSystems.cs:274-277`). ⭐ This is the F1 shape landing
  exactly where `moss-model.js` predicted it would: the client's copy of the same fact had been
  deleted in an earlier lane and needed no edit today, while the host's copy did.
- **A future `HistoryKind` that reports something getting BETTER belongs on `IsNotAFault`'s list.**

#### 13.43.4 What the package deliberately does NOT do

- **No craft/batch Chronicle line.** A bench working through a bill would produce exactly the shape
  D6 just removed. FILED.
- **No fix for the sawtooth GENERATOR** — `IsWanting` returns true for every device except a closed
  `AirVent`, so the wreck still publishes 22 562 brownout edges a sim-day (§13.11). The log stopped
  recording them; the ship still does them.
- **No re-home of the Chronicle tab** (inert on the standard surface by design — M4-7's).
- **No change to `MaxEntries`.** 200 was never the problem; what filled it was.
- **No LLM prose.** `ChronicleDay.ProseOverride` is still unfilled by anything.
- **`PowerSystem` is NOT made stateful.** That is the honest fix for `_wasBrownout` and it is a new
  SYSS chapter that moves P1/P2/P3 — its own package. §13.43.2 states the residual it leaves.
- **No structural replacement for §5.1's `ownKindMustContain` string join.** `HistoryEntry.SubjectA`
  now carries the network id, so a brownout could be attributed structurally instead of by prose;
  the literal is retained because narrowing that join is a change to a documented contract with its
  own blast radius. FILED.

### 13.44 ⭐⭐ A standing klaxon stops eating the ship's log — the alarm coalescer (ring saturation, 2026-08-03)

**THE PLAYER SENTENCE.** *A sustained thermal alarm reads as one line that stays current, not two
hundred copies — and the log's real story survives a day at speed.*

D6 (§13.8.1) took the brownout ticker out of the ring. The same ring then filled with a DIFFERENT
repeated sentence, from the other end of the sim. This is that defect and its close; the mechanism
is D6's, deliberately, and `HistorySystem.RecordAlarm`'s header carries the full argument.

#### 13.44.1 THE DEFECT, MEASURED ON THE SHIPPED WRECK

`--ship wreck` is what `./play.sh` boots and **no pin covers it**. Driven UNATTENDED — the OD-H
default, work grid OFF, which is the ship a playtester looks at before opening the WORK tab —
through `SimHost.Build(…, ShipChoice.Wreck)` so the real `content/core/SimDefs/rules/overheat_guard.moss`
is loaded (a bare `ShipPlanBuilder` stack carries no `DesignerRuleSystem` and reports zero alarms —
§13.21's verification note records the same trap, and it is why the fixtures here boot through the
host).

`overheat_guard` fires `alarm("THERMAL LOAD HIGH — check radiators")` whenever `ship.heat < 0.5`,
every 60 s. On the wreck `ship.heat` goes 1.000 → 0.667 (by tick 777 601) → 0.333 and never comes
back, so the **first firing lands at tick 1 085 400 (day 1.26) and one arrives every 600 ticks
forever** — 2 512 firings in three sim-days. Every one of them appended a ring entry.

| at tick 1 300 000 (day 1.50), unattended wreck | BEFORE | AFTER |
|---|---|---|
| ring total | **200 / 200 — FULL** | **49** |
| `Alarm` | 197 | 12 |
| — the klaxon | **197 identical copies of one sentence** | 6 entries (one per sim-hour, ×60 folded each) |
| — `MACHINE FAILURE` (distinct real faults) | **0 — all evicted** | **6, all surviving** |
| `Brownout` | 3 | 33 |
| `Generic` (the four tick-0 boot lines) | **0 — all evicted** | **4, all surviving** |
| ring window | ticks 1 182 000–1 299 600 (3.3 sim-h) | ticks 0–1 282 471 (the whole run) |

At three sim-days, before: 197 `Alarm` + 3 `Brownout`, nothing else. After: 128 entries — 55
`Alarm` + 69 `Brownout` + 4 `Generic`, still under the 200 cap, so **nothing is evicted at all** —
⛔ **at day 3. That stops being true at day ~4.2 and §13.44.6's last block has the numbers; do not
read this row as a permanent property.**
The BEFORE column is the shipped tree with `RecordAlarm` reverted to its pre-fix body, measured in
place (applied, run, restored from an in-memory copy — TRAPS 2), not a recollection.

Both consumers read this one ring, so both drowned at once and both are fixed at once: the
Chronicle (`Chronicle.Render`) and the MOSS fault log, whose `GameSession.BuildLog` renders the ring's
**last 14 entries** — i.e. fourteen copies of the same sentence.

⚠️ **WITH THE WORK GRID ON THE DEFECT DOES NOT REPRODUCE, and that is why these fixtures are
unattended.** With `GiveAllCrewAllWork()` the crew keep patching the radiators, `ship.heat` never
falls under 0.5 and `overheat_guard` fires **zero** times in three sim-days (measured). That is the
exact opposite of D6's fixture in `ChronicleSignalTests`, which needs the grid ON to produce a
repair to lose. A lane that reuses one fixture for both defects will measure nothing.

#### 13.44.2 THE FIX — one entry per RUN, D6's shape

`Systems/HistorySystem.cs:RecordAlarm`. An incoming alarm scans back for an entry this same writer
could have produced for this same alarm; if the run it belongs to opened within
`HistorySystem.AlarmQuietTicks` (36 000 ticks = one sim-hour, a **code constant** per M2-1's
rule-not-tunable precedent and D6's `BrownoutQuietTicks` precedent, so P4/P5 cannot move), the entry
is **rewritten in place**: the tick stays at the run's first firing and `SubjectB` carries the count.

- **IDENTITY IS THE RENDERED LINE.** `AlarmRaisedEvent` is two strings and carries no ids, so there
  is no structural key; a candidate matches iff `prior.Text == AlarmLine(line, prior.SubjectB)`.
  That is "same rule id + same message" exactly, since the line is `"{SourceId}: {Message}"`.
  ⛔ It is **not** a text-dedupe of the ring: two runs separated by a quiet hour are two entries.
  Hashing the text into `SubjectA` was rejected — a collision risk in a HASHED field.
- ⭐⭐ **A FIRST FIRING IS BIT-IDENTICAL TO THE PRE-COALESCING WRITER.** `AlarmRepeatWord` encodes one
  firing as **0**, so a single-firing alarm stores `(tick, Alarm, 0, 0)` exactly as `Add` did and
  folds into `StateChecksum` identically. **Only a second firing of the same line moves a hash** —
  the defect's own case and nothing else. This is what makes the pin survey below structural.
- **The base line stays a PREFIX** (`"…; 60 times within the hour."` is appended). `ShipSystems.Fault`
  searches an entry's text for a device NAME and `Summarize` truncates at 56 characters; a prefixed
  count would have pushed the name past the truncation — §13.43.3's class of silent-column failure.
- **No new saved state, `StateVersion` stays 2.** The throttle is derived from the ring, which is
  already a save chapter and already hashed. D6's argument, unchanged.

⚠️ **WHY THERE IS NO IDEMPOTENCY RULE HERE, unlike `RecordBrownout`.** D6 needed one because
`PowerSystem` is not `IStatefulSystem` and re-publishes an edge after a reload (§13.43.2). Every
alarm publisher was checked against that shape: `DesignerRuleSystem` **is** stateful and saves its
`every` timers, latches and halt flags (SYSS blob v1), `ScriptRuntime` likewise; `MachineWearSystem`
fires on a saved `Device.Condition` crossing; `NeedsSystem` fires once per death. None can
re-publish an alarm a live twin did not — and a drop rule invented anyway would swallow the second
REAL firing of an alarm that legitimately repeats.

⭐ **THE WINDOW IS MEASURED FROM THE RUN'S FIRST FIRING, NOT ITS LAST, AND THAT IS A CHOICE AGAINST A
LONGER-LIVED ENTRY.** Measuring from the last firing would give a permanently-sounding alarm exactly
ONE entry — which sounds better and is worse: `BuildLog` renders the last 14 entries POSITIONALLY, so
an entry frozen at its old ring position scrolls out of the tail as the ship's story grows and a
still-sounding alarm becomes INVISIBLE. Re-announcing once per sim-hour keeps a standing fault in the
tail and in every day of the Chronicle, at ≤ 25 entries per sim-day against a 200 ring.

#### 13.44.3 THE PIN MATRIX — all five held, and the holds are NOT all the same kind

| pin | before | after | verdict |
|---|---|---|---|
| **P1** scenario `--days 3 --seed 42` | `7bdd0d6f7756dfdc` | `7bdd0d6f7756dfdc` (twin match) | **HELD — VACUOUS, driven** |
| **P2** perilune tick-3000 | `cb09b584a5f15e52` | **HELD** | held — vacuous (no alarm exists) |
| **P3** slice tick-3000 | `43a1a5c25713faec` | **HELD** | held — vacuous (no alarm exists) |
| **P4** defs defaults | `661fcdd4b89f1e87` | **HELD** | genuinely inert (no def field) |
| **P5** defs rules-inclusive | `558a1c0a4985f5ea` | **HELD** | genuinely inert (no def field) |

⛔ **WHY P1's HOLD IS VACUOUS, MEASURED RATHER THAN ARGUED.** `Report` in `hosts/scenario/Program.cs`
was instrumented to census the ring at every day boundary (patched, run, restored from an in-memory
copy with the mtime moved FORWARD — TRAPS 2):

```
SCRATCH-P1 ring=200 alarmEntries=0 coalescedAlarms=0     # days 0, 1, 2 and 3
```

The pinned fixture's 200-entry ring holds **zero `Alarm` entries at every day boundary** — it is
200/200 `Bond`, as §13.43.1 measured for D6. The fixture DOES load the rule (`defs: 558a1c0a4985f5ea
(18 files, 0 problems, 1 rules)`); that ship simply never gets cold. And the stub control was run,
because a count and a hash are different evidence: **with `RecordAlarm`'s coalescer stubbed out to
the pre-fix `Add`, P1 reads `7bdd0d6f7756dfdc` — identical to the shipped tree, to the digit.**

**WHY P2/P3 HOLD, and it is the window rather than a dead system.** Measured at tick 3000 on all
three authored plans booted through `SimHost`: **0 `AlarmRaisedEvent`s on every one of them**, and
the rings are `perilune` 0 entries, `slice` 18 (13 `RelationshipChanged` + 4 `Bond` + 1 `Goal`),
`wreck` 4 (`Generic`). The wreck's first alarm is at tick 1 085 400 — **362× later than the golden**.

⛔ **DO NOT READ ANY OF THIS AS "THE PINS COVER ALARM COALESCING". THEY DO NOT.** This is M2-12's
*"no pin sees the generation term"* in its fourth costume, and as with D1/D6 the affected surface is
the SHIPPED ship. The instruments are `RingSaturationTests` and nothing else.

#### 13.44.4 A PRE-EXISTING REPLAY DIVERGENCE THIS LANE MEASURED AND DID NOT CAUSE

`TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidAlarmRun` asserts the ALARM entries
across a save/reload, not the whole `StateHash`, and the reason is measured. At save tick 1 100 000
(mid-run) with the documented §13.10 matched recompute, exactly **one** ring entry differs after
6 000 ticks of run-on, and it is a `Brownout` one:

| | live | loaded |
|---|---|---|
| ring[36] (`t=1066381`, net 1) | word `2225` — 1112 edges | word `2221` — 1110 edges |

Same tick stamp, two fewer edges published by the reloaded sim — §13.10's last-bit atmosphere drift
amplified through `PowerSystem`'s shedding threshold, not a duplicate edge. ⭐ **The control was
DRIVEN: with `RecordAlarm`'s coalescer reverted to the pre-fix writer the same leg produces the same
divergence at the same index with the same two numbers**, so it predates this lane and belongs to
D6's filed residual family (§13.43.2). The alarm entries themselves are bit-identical on both legs,
and the **control leg (save at tick 100 000, before any alarm) replays on the WHOLE `StateHash`,
every system**. FILED, not chased — the honest fix is the same stateful-`PowerSystem` package.

⚠️ **AND THE TWIN'S SYSTEM ARRAY MUST BE THE HOST'S.** `SimHost` brackets the authoritative stack
with three host wrappers (EffectPump first, Memory + Eulogy last), so a hand-rolled
`SystemStack.CreateDefault` array is OFF BY ONE against the save's chapters. Measured: with a
hand-rolled stack even the CONTROL leg failed to replay — which would have been read as this
package's defect. A second `SimHost.Build` is the correct twin.

#### 13.44.5 ⛔⛔ THE RESIDUAL THIS PACKAGE OWNS — a save on a firing tick never re-converges

Found by independent review, re-measured here. **Filed, not chased** (PROCESS §2 "SHIP IT FILED"),
on D6 residual 2's precedent — and like that one it is worth reading before touching this code.

**THE MECHANISM, and it is the MIRROR of D6's.** §13.43.2's defect was an event *re-published* after
a reload. This is the other direction: **the event bus is not a save chapter.** An
`AlarmRaisedEvent` published on the very tick a save is taken is never written into the save, so the
loaded sim publishes one FEWER firing than its uninterrupted twin. No idempotency rule can close it
— dropping a duplicate is possible, reconstructing a lost event is not — which is exactly why the
answer here is a filed residual rather than a mechanism. `RecordAlarm`'s header carries the same
statement, and an earlier draft of that header surveyed only direction 1: CLAUDE.md's **fourth
shape**, a survey whose scope excludes the violation.

**MEASURED ON THE SHIPPED WRECK** (`SimHost.Build(… Wreck)`, real `SaveWriter`→`SaveReader`,
§13.10's matched recompute, 200 000 ticks of run-on; the klaxon fires on 1 085 400 + 600k):

| save tick | live | loaded | verdict |
|---|---|---|---|
| **1 085 400** — the run's OPENING firing tick | `1085400/b60` | `1086000/b60` | tick stamp AND count |
| **1 086 000** — a later firing tick | `1085400/b11` | `1085400/b10` | count alone |
| **1 085 700** — a NON-firing tick (control) | — | — | **clean**, alarms and whole `StateHash` |

⭐ **AND IT COMPOUNDS RATHER THAN HEALING.** Over 200 000 ticks of run-on from the 1 085 400 save,
**every subsequent run inherits the 600-tick offset** — live `1085400 · 1121400 · 1157400 · 1193400 ·
1229400 · 1265400` against loaded `1086000 · 1122000 · 1158000 · 1194000 · 1230000 · 1266000` — and
the trailing counts end 34 against 33.

⚠️ **COALESCING IS WHAT MAKES IT PERMANENT — §13.8.1's D6 sentence verbatim, and it is a DRIVEN
control, not an analogy.** With `RecordAlarm`'s coalescer reverted to the pre-fix `Add`, the same leg
reads **`ALARMS_EQUAL=True HASH_EQUAL=True`**: each firing was its own entry, so the mis-stamped one
evicted within the ring's turnover. Folding them into an entry that survives the whole run converts a
self-healing perturbation into a compounding one.

**WIDTH: 1 tick in 600 — 0.17 %** — and unlike D6's residual 2 (1–11 ticks per ~36 000) it does not
sit at a rare boundary: on the shipped wreck the klaxon sounds **continuously** from tick 1 085 400 to
end of run, so every 600th tick is a bad save tick for as long as the ship is cold.

**THE CLOSER is the same family as D6's residual 2** — save-boundary event delivery (draining or
persisting the in-flight event buffer), not a consumer-side rule in `HistorySystem`. Both residuals
now argue for the same package. ⚠️ `RingSaturationTests.TheShippedWreck_ReplaysBitIdentically_…`
samples only NON-firing save ticks and its header says so as a blind spot: **it would stay green
through every instance of this defect.** If the residual is ever closed, add a firing-tick leg there
and delete this section — do not widen the existing legs.

#### 13.44.6 What the package deliberately does NOT do

- **No fix for the GENERATOR.** The wreck still gets cold and `overheat_guard` still fires 2 512
  times in three sim-days (§13.2). The log stopped recording each one; the ship still does them.
  Closing that is a content/thermal decision, not a log one. FILED.
- **No change to the alarm's TEXT**, which still tells the player the exact opposite of what is
  happening ("THERMAL LOAD HIGH" while the ship freezes) — §13.2's standing observation, untouched.
- **No change to `MaxEntries`.** 200 was never the problem; what filled it was.
- **No alerts-bar / alert-stack work.** RimWorld's split (§11.1) says a standing condition belongs on
  the alert stack and this ring is the letter channel; D2's bar and M5-2's stack own that half.
- **No touch to `CitizenMemory`**, whose separate 42-`alarm` eviction problem (§13.8) is a different
  store with a different rule and is STILL OPEN.

⛔ **AND IT DOES NOT MAKE THE RING PERMANENTLY UNSATURATED — say this out loud, because §13.44.1's
"nothing is evicted at all" is true AT DAY 3 AND FALSE LATER.** Driven on the same unattended wreck:

| | day 1.50 | day 3.00 | day 4.50 | day 6.00 |
|---|---|---|---|---|
| ring total | 49 | 128 | **200 — FULL** | **200** |
| tick-0 boot lines surviving | 4 | 4 | **2** | **0** |
| `Alarm` / `Brownout` | 12 / 33 | 55 / 69 | 93 / 105 | 103 / 97 |

So the package moves the saturation horizon from **day ~1.4 to day ~4.2**, roughly a 3× extension,
and after that the ring turns over again. The dominant producer is then **`Brownout` at ~24 entries
per sim-day** (D6's own ≤ 25/day episode cap) rather than the klaxon, whose coalesced entries run at
~25/day against the same cap — together ~48/day against a 200 ring. **FILED, not chased:** a second
pass at the brownout cadence (or at `MaxEntries`) is the follow-on, and it is D6's ledger to settle,
not this one's. For the 2026-08-07 playtest the horizon is far past the session; for a long unattended
run it is not.

### 13.45 ⭐⭐ When an order dies mid-way, the ship's log records it (b3-R, 2026-08-03)

**THE PLAYER SENTENCE.** *An order I gave that dies mid-way leaves a line in the ship's log — who
let go, which machine, and the sim's own reason — so even a drop with no honest live badge (worker
displaced, cargo lost) is no longer silent.*

The residual is §13.25 b3-R, and it is the D5 follow-on's own: `MaintenanceSystem.Abandon` publishes
`OrderDroppedEvent` with one of **six** `JobDropReason`s, and `GameSession` badges a machine only
where it can RE-ASK the sim's killing question live. Three qualify. `Displaced`, `CargoLost` and
`NoRouteToConsumable` are facts about a MOMENT and a PAWN, so no honest badge exists — and under
OD-H nothing re-recruits her, measured: 3 000 further ticks, `JobKind` `None`, `blocked` `cells:[]`
throughout. **The owner ruled the filed one-package follow-on** (2026-08-03): a Chronicle line, no
live badge (that stays refused under the live-re-ask discipline), no re-issue (§13.25d stays open).

#### 13.45.1 THE MECHANISM — one consumer, one funnel, no coalescer

`HistorySystem.Tick` reads `OrderDroppedEvent` and writes ONE `HistoryKind.OrderDropped = 16` entry:
`Add(tick, OrderDroppedText(sim, drop), OrderDropped, drop.CitizenId, drop.DeviceId)`. Both
consumers of the ring get it for free — the MOSS `log` screen / Overview SENSOR LOG
(`GameSession.BuildLog`, last 14 entries) and the `chron` payload (`Chronicle.Render`) — and the
host needed **no change at all**. Driven on the shipped wreck, both payloads carry it (§13.45.3).

- ⛔ **ALL SIX REASONS WRITE THE LINE, INCLUDING THE THREE THAT ALSO BADGE.** The badge and the line
  are different claims: a badge says what is TRUE NOW and is dropped the frame the world stops
  agreeing (open the door ⇒ badge gone); the line says something HAPPENED and never clears. A player
  who fixes the door still deserves to know the order died.
- ⛔ **NO COALESCER, AND IT IS SAID HERE BECAUSE THIS IS WHERE THE NEXT READER WILL LOOK FOR ONE.**
  `RecordAlarm` (§13.44) and `RecordBrownout` (§13.8.1) exist because a CONDITION was firing an
  event at 1 Hz forever. A drop needs a player to click a machine, the sim to take the job and the
  world to change under it; one order can die once, and under OD-H nothing re-recruits her
  afterwards. There is no repeating source to fold, and folding would need a hashed count for a
  stream that produces single entries.
- **THE STREAM IS RARE BY CONSTRUCTION, NOT BY THROTTLE**: `Abandon` publishes only when the job was
  `HeldByOrder` — the hold IS the order — so the dispatcher's own thousands-a-day abandons never
  reach the bus (`DroppedOrderTests.AnAutonomousAbandonIsNotAnOrder_AndIsNeverFiled` is that gate's
  instrument and is untouched here).
- ⚠️ **THE DEVICE IS RESOLVED BY ID, WHICH IS SAFE HERE AND IS NOT A GENERAL LICENCE.**
  `CitizenDiedEvent` carries a NAME and `DeconstructCompletedEvent` carries a KIND precisely because
  their subject leaves the store on the publishing tick. A drop is the opposite: `Abandon` is handed
  a live `Device`, and the one path that abandons a DECONSTRUCTED machine (`DriveWorkers`' direct
  `AbandonOrphan` at `MachineWearSystem.cs:207`) deliberately publishes nothing — the known
  exception on `Abandon`'s own doc comment, unchanged by this package. The `"a machine"` fallback is
  written rather than assumed.
- **TRANSIENT STAYS TRANSIENT.** No new saved field outside the ring entry itself, no def field, no
  `IStatefulSystem` change, `HistorySystem.StateVersion` stays **2** (`SubjectA`/`SubjectB` were
  already captured and already folded). The reason lives in the TEXT and is therefore hash-exempt,
  exactly as `RepairTier` is.

#### 13.45.2 THE WORDS, AND WHY THEY ARE NOT A SECOND COPY OF THE BADGE'S

`HistorySystem.DropReasonClause` is **the one authority for what the sim says killed an order** —
one clause per `JobDropReason`, swept as a CLASS (`DroppedOrderChronicleTests`: every declared
member worded, all distinct, none falling through to the fallback), never a list of today's six.

| `JobDropReason` | clause |
|---|---|
| `NoWorksiteTile` | there was nowhere left to stand next to it |
| `Displaced` | the job was interrupted part-way through |
| `CargoLost` | the parts in hand were gone |
| `NoRouteToWorksite` | there was no way to walk to it |
| `NoRouteToConsumable` | there was no way to walk to the parts |
| `NoConsumable` | there was nothing aboard to fix it with |

⛔ **THE CLIENT'S `BLOCKED_REASON_TEXT` IS A DIFFERENT AUTHORITY FOR A DIFFERENT CHANNEL, AND
MERGING THEM WOULD HAVE COST MORE THAN IT SAVED.** That table is keyed by `WireFormat.Reason*` —
**three** values, each a question the host can put to the sim again this frame ("NO WAY TO WALK TO
IT"), rendered through `blockedReasonSentence`, the client's own single entry point. This table is
keyed by `JobDropReason` — **six** values, a historical statement about a moment that no longer
exists. Wording the log through the badge's table needs a mapping that discards three reasons —
exactly the three b3-R is FOR — and wording the badge through this one puts history prose on a live
surface. No pronouns anywhere in the table: `Citizen` carries no gender, and the crew member is
already named before the colon.

⚠️ **AND THE POSITIVE ASSERTION IN THE OUTCOME TEST READS THIS SAME AUTHORITY, SO IT AGREES WITH A
MIS-WIRED ARM.** Said out loud because it is the shape a green test hides: the leg that closes it
asserts NO OTHER reason's clause appears in the line (driven — swapping `CargoLost`'s arm for
`NoConsumable`'s reddens it by name, plus the distinctness sweep). What is still not pinned by
anything is whether a clause is the RIGHT sentence for its arm; that is prose, and the switch's
member names are what carry it.

#### 13.45.3 THE PIN MATRIX — all five held, and every hold is VACUOUS on this package

| pin | before | after | verdict |
|---|---|---|---|
| **P1** scenario `--days 3 --seed 42` | `7bdd0d6f7756dfdc` | `7bdd0d6f7756dfdc` (twin match) | **HELD — VACUOUS, measured** |
| **P2** perilune tick-3000 | `cb09b584a5f15e52` | **HELD** | held — vacuous (no order exists) |
| **P3** slice tick-3000 | `43a1a5c25713faec` | **HELD** | held — vacuous (no order exists) |
| **P4** defs defaults | `661fcdd4b89f1e87` | **HELD** | genuinely inert (no def field) |
| **P5** defs rules-inclusive | `558a1c0a4985f5ea` | **HELD** | genuinely inert (no def field) |

⛔ **THE HOLDS ARE MEASURED, NOT ARGUED — and the CAUSE is one sentence: nothing behind a pin ever
gives an order, so `Citizen.HeldByOrder` is false on every fixture and `Abandon` publishes nothing.**
The census, taken rather than reasoned (P1's `Report` instrumented, run, restored from an in-memory
copy with the mtime moved FORWARD — TRAPS 2; the ship fixtures booted through `SimHost` and driven
to tick 3000):

```
SCRATCH-B3R-P1 ring=0   orderDropped=0 heldByOrder=0     # day 0
SCRATCH-B3R-P1 ring=200 orderDropped=0 heldByOrder=0     # days 1, 2 and 3
SCRATCH-B3R SHIP Perilune tick3000 ring=0  orderDropped=0 heldByOrder=0 hash=cb09b584a5f15e52
SCRATCH-B3R SHIP Slice    tick3000 ring=18 orderDropped=0 heldByOrder=0 hash=43a1a5c25713faec
SCRATCH-B3R SHIP Wreck    tick3000 ring=4  orderDropped=0 heldByOrder=0
SCRATCH-B3R SHIP Grid     tick3000 ring=0  orderDropped=0 heldByOrder=0
SCRATCH-B3R WRECK200k ring=9 orderDropped=0              # the unattended SHIPPED ship, 200 000 ticks
```

⛔ **DO NOT READ THIS AS "THE PINS COVER THE DROPPED-ORDER LINE". THEY DO NOT** — M2-12's *"no pin
sees the generation term"* in its fifth costume, and as with D1/D6/§13.44 the affected surface is the
SHIPPED ship. ⭐ **The same code writes a line where it IS reached, driven on `--ship wreck` through
`gs.AdvanceTicks` — order `fabricator_1` with `door_d0_s2` open, yank the carried stack at the
pickup (tick 171) ⇒ at tick 181 the ring gains**

```
ORDER DROPPED — Rell let go of the fabricator (fabricator_1): the parts in hand were gone.
```

**and it is in the shipped `log` payload and in the `chron` payload in the same frame** (both read
off the session, not off the ring). The instruments are `DroppedOrderChronicleTests` (3 tests) and
`ChronicleTests.EveryHistoryKindHasBothALabelAndASeverityRow`, **and nothing else**.

**SIX NAMED MUTATIONS, PHYSICALLY APPLIED**, each red for the reason named and reverted from an
in-memory copy: (1) the consumer deleted from `HistorySystem.Tick` ⇒ *"no surface in the game
remembers that it existed"*; (2) the publish moved BELOW `AbandonOrphan` — the hold-read order
§13.25 b3′ calls load-bearing ⇒ the same red, channel permanently empty; (3) the `OrderDropped`
clause deleted from `ShipSystems.IsNotAFault` ⇒ the FABRICATION row reads `ORDER DROPPED — RELL LET
GO OF THE FABRICATOR (FABRICATO…` under LAST FAULT; (4) `DropReasonClause`'s `CargoLost` arm swapped
for another member's ⇒ two instruments red; (5) the `Chronicle` label row deleted ⇒ the line renders
`[Note]`; (6) the severity row deleted ⇒ it can no longer out-rank an alarm.

#### 13.45.4 THE DAY-HEADLINE LADDER — a dropped order ties with a brownout, deliberately

`Chronicle.Severity` puts `OrderDropped` at **5**, tied with `Brownout` and resolved by the strict
`>` in `Render` (earliest entry keeps the headline). It must not sink below the power flap — D1's
own reasoning one tier up: the order that died is usually the repair the brownout was FOR, and a day
remembered as *"the power flapped"* when what happened is *"the fix you ordered never arrived"* names
the symptom. It must not rise to the work tier either: tier 6 means *"the ship's capability changed
and a person made it happen"*, and here nothing changed at all. ⛔ **Death (8) and the ordinary thaw
(7) still out-rank it — owner-ruled, restated 2026-08-03, and pinned by
`ADeathAndAThawStillOutrankADroppedOrder` with an inclusion control so the two legs cannot be
satisfied by a kind ranked at the floor.** (`rimworld-reference.md` §11.1 would put an interrupted
forced job in the TRANSIENT message channel rather than the letter stack; Perilune has no transient
channel, and the owner ruled the log line because the alternative here is permanent silence. That
classing is why it sits low on this ladder rather than beside the work tier.)

#### 13.45.5 ⛔ THE RESIDUAL THIS PACKAGE INHERITS — a save on the drop's own tick loses the line

**The sibling of §13.44.5, and it is filed rather than chased, on the same argument.** The event bus
is not a save chapter: an `OrderDroppedEvent` published on the very tick a save is taken is never
written, so the loaded sim's ring lacks the entry its uninterrupted twin has — permanently, because
nothing re-publishes it (`Abandon` fires once and the job is already gone) and because the ring is a
hashed save chapter, so the two runs' HIST folds differ from then on. No idempotency rule can close
it: dropping a duplicate is possible, **reconstructing a lost event is not**. The closer is the same
family as D6's residual 2 and §13.44.5's — save-boundary event delivery — not a consumer-side rule
in `HistorySystem`. Three residuals now argue for that one package.

⭐ **THE WIDTH IS HONESTLY NARROWER THAN THE KLAXON'S, AND FOR A STRUCTURAL REASON.** §13.44.5's
alarm case is 1 tick in 600 *continuously*, because the klaxon sounds forever on a cold ship. A drop
requires a player-held order to die: at most one tick per order given, and under OD-H orders are the
rare deliberate act — the shipped wreck driven unattended for 200 000 ticks publishes **zero**
(measured above). The exposure is therefore "the exact tick a save lands on the drop of an order the
player gave", not a periodic window. **Not chased, and not instrumented either**: adding a leg for it
would pin a defect this package cannot fix.

#### 13.45.6 What the package deliberately does NOT do

- **No live badge for the three transient reasons.** The live-re-ask discipline (§13.25 b3′) refuses
  a latched sentence, and that ruling stands — the log is a different channel with a different
  contract, which is the whole point of the owner's shape.
- **No re-issue of the order.** §13.25d is untouched: nothing brings the order back when the world
  agrees again, and the player re-orders.
- **Nothing for the ORPHAN path.** A machine deconstructed under a live order still dies silently at
  `MachineWearSystem.cs:207` (`AbandonOrphan` direct, bypassing the funnel). Named on `Abandon`'s
  doc comment since the D5 follow-on; a line there would need the event the funnel never publishes.
- **No structural reason byte in the ring.** The reason is prose, hash-exempt like `RepairTier` — a
  hashed reason field would move nothing today and would be a save-format change for a consumer that
  does not exist.
- **No alerts-bar row and no toast.** RimWorld's split (§11.1) puts a standing condition on the alert
  stack and a fired event in the letter channel; this ring is the letter channel. M5-2 owns the other
  half.
