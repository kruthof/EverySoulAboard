# Economy modularity — audit and portability plan

**Status: AUDIT + PLAN. Nothing built, nothing decided.** Written 2026-07-25 in worktree
`../perilune-wt/econ-modularity` (branch `lane/econ-modularity`, based on `main` @ `b538450`).
No production file, test, or def was edited by this lane — the deliverable is this document.

**The question, from Garvin:** *"How modularized is the economic implementation? I'm planning
other games in the future and want to create synergies. Come up with a plan to maximize
(1) maintainability and (2) portability (i.e. reusing it for other games)."*

**Authorities this must not contradict:** `docs/ECONOMY.md` (economic design authority),
`docs/ECONOMY-PLAN.md` (execution order), `docs/design/perilune-automation-and-souls.md`
(BINDING), `CLAUDE.md` (invariants). Where this note reads the code differently from a doc,
**the code wins and the disagreement is called out** (§0.2 lists three).

---

## 0. How to read this, and what is actually verified

### 0.1 The one-paragraph answer

The **module layering is genuinely good and it is the only part of this that has been
proven** — `Sim.Core` depends on nothing else in the repo, and **49 of 84 `sim/*.cs` files
crossed the moonbase→perilune engine port essentially untouched** (43 byte-identical modulo
the namespace; nothing dropped), at a total measured port cost of a `sed`, one stale
`InternalsVisibleTo`, and one hash re-verification (§2). But read that port carefully: it
proves the economy is **engine**-portable, not **game**-portable, because the game was the
same game — and what made it cheap was not modularity, it was **one boundary declared 15
minutes into the project and enforced by the build system** (§2.2). The **economy is far
less welded to the ship than the docs imply**: its entire
outward surface is 17 `Simulation` members and exactly **six** game-specific call sites,
three of which are one-line notifications (§1.5). But there is **no module boundary inside
`Sim.Core` at all** — no assembly, one flat 16,138-line namespace, one god object — so
"the economy" is a directory convention protected by nothing (§1.2). And the finding that
matters most is the *inverse* of the question: the economy is not insufficiently decoupled
from the ship, it is **insufficiently coupled to the crew**. `grep -rni skill sim/` returns
nothing; the work countdown is five independent copies of `--citizen.JobWorkTicks`; the
binding operator model ("mood + skill are the throughput") is 0 % built and has nowhere to
land (§6). Creating that one seam is simultaneously the top maintainability win, the E2
prerequisite, and the abstraction any portable economy needs — which is why it is step 1 of
the plan and why the plan does **not** propose an extraction (§7, §8).

### 0.2 Where this note corrects the record

1. **The defs checksum is not a pin.** `CLAUDE.md` and the task brief list four
   determinism pins including defs `5a471d12643b64f9`. That literal appears **nowhere** in
   `ci.sh`, `tests/`, `sim/`, `hosts/` or `content/` (verified by grep). The only
   defs-checksum assertion is *relational* —
   `DefsChecksumTests.cs:21-24` asserts `SimDefs.CreateDefault().Checksum ==
   SimDefs.Default.Checksum`, i.e. internal consistency, not a frozen value. **Three pins
   are gate-enforced** (scenario via `ci.sh:31`, and two golden files
   `tests/Perilune.Tests/Golden/perilune_tick3000_hash.txt` = `4be2e77864fb7409`,
   `Golden/slice_tick3000_hash.txt` = `1f8f2225ee568de9`); the defs value is doc-only.
   This makes the plan *cheaper* than briefed, but it also means a def-value drift would
   not fail CI.
   **✅ CLOSED 2026-07-25** by `DefsChecksumTests.SimDefsDefaultChecksum_IsPinned_NotTheScenario`
   `HostsRulesInclusiveValue` — the literal is now asserted, the test name states which of the two
   checksums it is, and a mutation test confirms a single changed def default fails it
   (`CitizenHeatW` 100→101 ⇒ `97a231fdf8f28256`). All four pins are now gate-enforced.
2. **`Citizen.Fatigue`'s doc comment is false.** `Citizen.cs:49` says
   `public float Fatigue; // 1 = exhausted (slows work)`. It slows nothing. Its only
   readers are `NeedsSystem.cs:154` (writes it), `NeedsSystem.cs:166` (feeds `Mood`),
   `Simulation.cs:385` (hash) and the save pair. No economy system reads it.
3. **`Sim.Content`'s pack layering is unreachable at runtime.** `ContentSet.cs` implements
   real pack layering with topological load order and per-key override; it is tested
   (`ContentPackTests.cs`). But `sim/Sim.Content/**` appears in exactly one
   `<Compile Include>` — `tests/Perilune.Tests/Perilune.Tests.csproj:21`. No shipping host
   compiles it; all three call `DefsParser.Parse` on a raw `*.def` listing
   (`hosts/tui/SimHost.cs:265`, `hosts/scenario/Program.cs:484`). This is a `MECHANICS.md`
   §13 "wired but not connected" entry that is not currently listed there.

### 0.3 What I did NOT read or could not verify

- **I ran no build and no test.** Every claim is static reading plus grep. I did not
  re-measure any pin, did not run `./ci.sh`, and did not run the sim. All cost estimates
  in §7 are judgement, not measurement.
- **`sim/Sim.Gen/` (procedural generation, ~2,900 LOC) I did not audit.** It is very
  likely a second large body of content-shaped data hard-coded as C# (room templates,
  device kits, `RoomDresser`) and is a real gap relative to the portability question.
- **`sim/Sim.Llm/` (~3,500 LOC) I did not audit** beyond confirming it names no economy type.
- I did not read `hosts/web/Client.html`, `client/` JS, or `art/`.
- **E0-4 is mid-flight in sibling worktrees.** `sim/Sim.Core/Stock/StockZoneSystem.cs`,
  `Jobs/Sources/HaulJobSource.cs` and `hosts/scenario/StockpileHarness.cs` are being edited
  elsewhere right now. Every line/number I cite for those three files is as of `b538450`
  and **will move**. The `StockZoneSystem` I read is the empty W0-6 stub.
- I did **not** re-verify any retracted E0-4 number and this note quotes none. See memory
  `e0-4-far-leg-thesis-retracted`.
- Type-reference counts in §1.4–1.5 come from grepping a comment-stripped concatenation of
  the economy file set. A type reached only through a fully-qualified name or `var` would
  be undercounted. The `Simulation`-member counts are the reliable ones.
- **§2's port forensics: I verified the load-bearing claims myself** (the 43/84 diff census,
  the namespace-only classification, the asmdef `noEngineReferences` flags, the `tools/*.csproj`
  source globs, `JobKind`/`ItemKind`/`TileDefs` identity, the `HaulJobSource` field/method/
  comment survival, the absent MOSS test files, the MOSS test counts). I did **not**
  independently re-derive the git timestamps, the per-file LOC ledger for `Game.View`/`Editor`,
  or the moonbase `docs/` quotations — those come from a delegated read of
  `/Users/garvin/Research/Code/moonbase`. They are consistent with what I checked but treat
  the exact LOC totals as approximate.
- **The pivot rationale in §2.3 is quoted from a Claude-authored plan file**
  (`~/.claude/plans/let-s-do-that-plan-snug-wolf.md:5`), which moonbase's `HANDOVER.md:5`
  names as the approved plan and whose line 7 attributes the decision to Garvin. **No
  first-person statement by the author about why Unity was dropped exists in either repo.**
  Garvin should correct §2.3 if it misstates his reasoning.
- I did not read the moonbase MOSS test suite's *contents* — only its file names, LOC and test
  count. §8.5's recommendation is therefore unscoped, deliberately.

---

## 1. How modular it is, measured

### 1.1 There are no assemblies. `sim/` is six source globs.

This is the single most surprising structural fact and everything else follows from it.
The repo contains **four `.csproj` files total**:

| project | globs |
|---|---|
| `hosts/scenario/ScenarioRunner.csproj:17-24` | Core, Dsl, Gen, Llm |
| `hosts/tui/PeriluneTui.csproj:17-22` | Core, Dsl, Gen, Glyph |
| `hosts/web/PeriluneWeb.csproj:19-37` | Core, Dsl, Gen, Glyph, Llm + 4 explicit TUI/scenario files |
| `tests/Perilune.Tests/Perilune.Tests.csproj:15-45` | all six + an explicit allowlist of host files |

Every one references sim code as `<Compile Include="../../sim/Sim.Core/**/*.cs" />`. There
is no `Sim.Core.csproj`. There is no `ProjectReference` anywhere in the repo. **`Sim.Core`,
`Sim.Dsl`, `Sim.Glyph`, `Sim.Gen`, `Sim.Llm` and `Sim.Content` are directories, not
assemblies** — they are recompiled into each host's single flat assembly.

Consequences, all of them live:

- **No compiler enforces the module map** in `docs/ARCHITECTURE.md`. Nothing would stop
  `Sim.Core` from `using Perilune.Glyph`.
- `internal` is meaningless as a boundary between modules — everything lands in one assembly.
- Module composition is per-host and inconsistent: `Sim.Glyph` is absent from the scenario
  host, `Sim.Llm` from the TUI, `Sim.Content` from all three shipping hosts.
- On the other hand: **this is also the reuse mechanism, and it is proven.** It is exactly
  how moonbase's `tools/` projects consumed the Unity project's sources, and it survived the
  port (§2). See §3.

### 1.2 The outer layering is a real DAG — and it holds

Measured by grepping `^using Perilune` per module directory:

```
Sim.Core   →  (nothing)              0 cross-module usings
Sim.Dsl    →  Sim.Core               7
Sim.Glyph  →  Sim.Core               3
Sim.Llm    →  Sim.Core               4
Sim.Content→  Sim.Core               1
Sim.Gen    →  Sim.Core (14), Sim.Dsl (1)
```

`Sim.Core` names **zero** types from any other module (grepped for `GlyphMapper`,
`GlyphCell`, `GlyphColor`, `ScriptRuntime`, `DeviceRegistry`, `MossCompiler`,
`Interpreter`, `CompiledScript`, `ShipPlan`, `AuthoredShips`, `ContentSet`, `PackManifest`,
`IChatBackend`, `ChatSession` — no hits). The MOSS runtime, which *is* registered in the
system stack, gets there by dependency inversion: `SystemStack.CreateDefault(ISimSystem
mossRuntime, ISimSystem designerRules = null)` (`SystemStack.cs:22`).

Projection purity holds too: grepping `sim/Sim.Glyph/` for `sim.X =`, `.Set*(`, `.Publish(`
and `JobsDirty` returns nothing. The projection genuinely never mutates.

Two documented-invariant violations found, both small and both outside the economy:
`sim/Sim.Dsl/RulesLoader.cs:23,25,29` and `sim/Sim.Llm/Providers/LlmSettings.cs:228,229`
do file IO inside `sim/`, against CLAUDE.md's "Hosts own file IO; sim takes text."

**This is the asset.** A strict, verified DAG with a dependency-free core, held for two
repos and one engine port — by discipline alone, with no compiler help.

### 1.3 Inside `Sim.Core` there is no boundary whatsoever

`Sim.Core` is 16,138 LOC in **one namespace**, `Perilune.Sim`. Every system reaches every
other through one god object:

```
Simulation.cs:17-50   World World · EventBus Events · SimRng Rng · long TickCount · SimDefs Defs
                      EntityStore<Citizen> Citizens · EntityStore<Device> Devices
                      EntityStore<ItemStack> Items · RoomState Rooms · PathService Paths
                      bool PowerDirty · JobBoardDirty JobsDirty · int DeviceTopologyVersion
                      float WastewaterLiters · List<ScriptEntry> Scripts
```

`Simulation.WastewaterLiters` (`:50`) is a bare public float on the god object — the shape
of the problem in one line. The economy is a set of files in a shared namespace, and the
*only* thing that makes it a "module" is that it lives under `Jobs/`, `Stock/`,
`Production/`, `Mining/` and four files in `Systems/`.

### 1.4 What the real economy actually is (and what is a stub)

The inventory, with LOC:

| file | LOC | what |
|---|---|---|
| `Jobs/JobSystem.cs` | 275 | the dispatcher (integrator-owned) |
| `Jobs/IJobSource.cs` | 197 | the seam + `IJobTileScanner` |
| `Jobs/JobContext.cs` | 134 | shared services + `JobWork` static helpers |
| `Jobs/JobBoardDirty.cs` | 47 | the W0-3 dirty-flag axes |
| `Jobs/Sources/BuildJobSource.cs` | 436 | stage-material-then-work |
| `Jobs/Sources/HaulJobSource.cs` | 257 | pickup → deliver to a stockpile tile |
| `Jobs/Sources/DeconstructJobSource.cs` | 192 | strip |
| `Jobs/Sources/DigJobSource.cs` | 151 | clear debris |
| `Systems/CraftingSystem.cs` | 648 | bills at stations |
| `Systems/DeconstructSystem.cs` | 588 | the strip registry + yields + hull guard |
| `Systems/MachineWearSystem.cs` | 421 | wear + `MaintenanceSystem` (two classes, one file) |
| `Systems/BuildSystem.cs` | 337 | the pending-build registry |
| `Defs/ProductionDefs.cs` | 241 | the `[production]` node table |
| `Entities/ItemStack.cs` | 27 | `ItemKind` (7 members) + the stack |
| **real economy** | **~3,950** | 2,640 lines after stripping comments — **16 % of `Sim.Core`** |

**Four of the six "economy systems" registered in the stack are empty stubs**, not economy
code: `Stock/StockZoneSystem.cs` (58), `Production/ProductionSystem.cs` (57),
`Mining/OreRegistrySystem.cs` (61), `Space/TradeSystem.cs` (61). Each is a W0-6 placeholder
whose `Tick` is `{ }` and whose `CaptureState` writes one marker byte — registered only so
its FourCC seed (`'ZONE'` `0x5A4F4E45`, `'PROD'` `0x50524F44`, `'ORES'`, `'TRAD'`) folds
into `StateHash` and its SYSS chapter exists before the E-lanes spawn. Do not count them as
economy that exists.

### 1.5 The coupling picture — 17 members, six game-specific sites

The god object hides the dependency graph: `sim.Paths.FindPath(...)` never names
`PathService`, so a type-reference count understates. The honest measure is **which
`Simulation` members the economy touches**, counted over the comment-stripped economy
concatenation:

| `Simulation` member | hits | what it is | portable? |
|---|---|---|---|
| `sim.World` | 31 | tile planes | **tile-game only** |
| `sim.JobsDirty` | 29 | board invalidation | generic |
| `sim.Items` | 29 | `EntityStore<ItemStack>` | generic |
| `sim.Defs` | 29 | tuning knobs | generic |
| `sim.Citizens` | 13 | `EntityStore<Citizen>` | generic-shaped, concrete type |
| `sim.TickCount` | 10 | clock | generic |
| `sim.Paths` | 10 | A* over tiles | **tile-game only** |
| `sim.Events` | 9 | `EventBus` | generic |
| `sim.TryGetDeviceAt` | 5 | machine at a tile | generic-shaped |
| `sim.Rooms` | 5 | `RoomState` | **ship-specific** |
| `sim.AddItem` | 5 | spawn a stack | generic |
| `sim.Devices` | 4 | `EntityStore<Device>` | generic-shaped |
| `sim.Systems` | 3 | lazy sibling-system lookup | generic |
| `sim.IsWalkable` | 3 | door-aware walkability | **tile-game only** |
| `sim.PowerDirty` | 2 | power net invalidation | ship-specific |
| `sim.RemoveDevice` / `sim.AddDevice` | 2 | device lifecycle | generic-shaped |

**Seventeen members. That is the whole outward surface of the economy.**

And the game-specific reaches are **seven sites**, which I list in full because the count is
the finding.

> **⚠ CORRECTED 2026-07-25 while mechanising this table into
> `tests/Perilune.Tests/ArchitectureBoundaryTests.cs`.** This section originally said "exactly
> six game-specific call sites" and counted `Device`/`DeviceKind` as the sixth. That conflated
> two different things and undercounted. The measured facts:
> - **Seven reaches into ship-system state:** `sim.Rooms` ×5 and **`sim.PowerDirty` ×2**
>   (`BuildSystem.cs:214`, `DeconstructSystem.cs:490`). The `PowerDirty` pair was listed in the
>   member table above but omitted from the site table — an error of transcription, not of
>   measurement.
> - **Six of those seven are notify-only** (3× `sim.Rooms.MarkDirty()`, 2× `sim.PowerDirty = true`,
>   and `MachineWearSystem.cs:45`'s `sim.Rooms.Rooms` is a list fetch). **Exactly one is a real
>   read of ship state:** `MachineWearSystem.cs:59,62`'s room temperature.
> - `IsPressureHull` (3 code uses, all in `DeconstructSystem.cs`) is **not** a reach into a ship
>   system — it is a static predicate over `World` geometry, defined inside the economy. It is
>   game-specific but self-contained, and is asserted separately.
> - `Device`/`DeviceKind` is a **generic-shaped** dependency ("a machine"), not a ship reach.
>
> The conclusion is unchanged and slightly strengthened: six of seven reaches are notifications,
> and the economy reads ship state in exactly one place. The counts are now enforced by
> `Economy_ReachesIntoShipSystemsAtExactlyTheAllowlistedSites`, so this table cannot drift from
> the code again.

| # | site | what it reaches for | severity |
|---|---|---|---|
| 1 | `Jobs/Sources/DigJobSource.cs:141` | `sim.Rooms.MarkDirty()` | **notify only** — a void call |
| 2 | `Systems/BuildSystem.cs:213` | `sim.Rooms.MarkDirty()` | notify only |
| 3 | `Systems/DeconstructSystem.cs:489` | `sim.Rooms.MarkDirty()` | notify only |
| 4 | `Systems/BuildSystem.cs:214` | `sim.PowerDirty = true` | notify only |
| 5 | `Systems/DeconstructSystem.cs:490` | `sim.PowerDirty = true` | notify only |
| 6 | `Systems/MachineWearSystem.cs:45` | `sim.Rooms.Rooms` (list fetch, for the vacuum sentinel) | notify-adjacent |
| 7 | `Systems/MachineWearSystem.cs:59,62` | `RoomAt(...)`, `room.TemperatureK` | **THE ONLY REAL READ** — heat modulates wear |
| — | `Systems/DeconstructSystem.cs:251,351,484` | `IsPressureHull(World, Int3)` — a wall adjacent to `TileDefs.Void` or the map edge | **game-specific but self-contained**: a static predicate over `World` geometry, no system dependency |
| — | `Systems/CraftingSystem.cs:109`, `MachineWearSystem.cs:49,177`, `sim.TryGetDeviceAt` | `Device` / `DeviceKind` | **generic-shaped** ("a machine"), not a ship reach |

**Six of the seven are notifications.** Sites 1–5 are one line each, trivially replaceable by an
event (§7 step 4). Site 7 — the only place the economy *reads* ship state — is a *generic
mechanism* ("environment modulates wear rate", already def-gated by `Wear.HotThresholdC` and
`Wear.WearPerDegreeC`) with a game-specific *source* for the value. Only `IsPressureHull` is
irreducibly about a spaceship, and it costs no coupling.

**And now the part that matters more — what the economy does NOT touch.** Grepped across
the whole economy file set:

| concept | hits in economy code |
|---|---|
| `Mood` / `Morale` | **0** |
| `Skill` | **0 anywhere in `sim/`** |
| `Persona` / `Llm` / `CitizenEffect` | **0** |
| `Atmosphere` / `Oxygen` / `Suffocation` | **0** (doc comments only) |
| `Glyph` | **0** |
| `Deck` | **0** |
| `Moss` / `Dsl` / `ScriptRuntime` | **0** |

The economy has no idea the crew have inner lives, that there is an LLM, that there is air,
or that anything is drawn. That is a much better starting position than
`docs/ECONOMY.md` §1's indictment would suggest — the indictment is about the economy being
*shallow and broken*, not about it being *entangled*.

> **⚠ CORRECTED 2026-07-25, and the correction is instructive.** An earlier draft of this table
> claimed these identifiers were zero *"even including comments"*. That was produced by a
> `grep` whose file list was an unquoted shell variable — **zsh does not word-split unquoted
> parameters**, so the whole list was passed as one filename, the error was swallowed by
> `2>/dev/null`, and every count came back `0` because **nothing was scanned**. The zero was an
> artefact of a broken measurement, not a measurement.
>
> The re-measured truth: **all twenty are zero in CODE** (the claim above stands, and is now
> enforced by `Economy_KnowsNothingAboutSoulsPresentationOrPhysiology`), but one appears in
> **prose** — `DeconstructSystem.cs:441`'s doc comment says the event it publishes is what
> *"`HistorySystem` turns into a Chronicle line naming the crew member"*. That is correct
> documentation of a downstream consumer, and the economy has no dependency on `Chronicle`
> (it publishes `DeconstructCompletedEvent`; `HistorySystem`, outside the economy, writes the
> Chronicle). The test therefore scans code only, and a mutation test confirms it fails on a
> code reference and passes on a comment.
>
> Recording this because it is the exact defect class this project has sent six packages back
> for — *a check whose named target cannot bite* — and here it hit the audit's own measurement.
> It was caught only because the assertion was mechanised and immediately disagreed with the
> prose. **That is the argument for §7 step 2 in miniature.**

### 1.6 Essential vs accidental coupling

The brief asks which couplings are essential (an economy needs *some* space and *some*
actor) versus accidental (it needs `Int3` and `Citizen` specifically). Measured:

- **`Int3` — accidental and free.** `World/Int3.cs` is **43 lines**, one `readonly struct`,
  zero dependencies, engine-free, and it crossed the engine port namespace-only. 105
  references in the economy is not a portability cost; it is a 43-line file you copy. Note
  `Int3.Manhattan` sums `|Δz|`, so a deck change costs 1 — that is a *design* choice worth
  knowing, not a coupling.
- **`Citizen` — accidental and expensive.** The economy names the concrete `Citizen` class
  49 times and reads seven of its fields (`Pos`, `Path`, `JobKind`, `JobTarget`,
  `JobWorkTicks`, `CarryingItemId`, `ReservedItemId`, plus `IsRecruitableForWork`). There
  is no `IWorker` interface. `Citizen.cs` is 141 lines and carries faction, health, morale,
  archetype, suffocation, hunger, thirst, fatigue and mood — **the economy drags a colony
  sim's entire pawn model along with it.** This is the one accidental coupling worth
  breaking, and §6/§7 show that the reason to break it is *not* portability.
- **`World` / `PathService` / `TileFlags` — essential to a tile game, fatal outside one.**
  `IJobTileScanner.VisitTile(Simulation, Int3, byte flags, ushort wall, ushort floor)`
  (`IJobSource.cs:195`) puts tiles **in the seam itself**, and
  `JobSystem.Rescan` (`JobSystem.cs:182-197`) walks `world.Levels[z].Flags[idx]` in z,y,x.
  The dispatcher *is* a tile scanner. There is no non-tile version of this without a
  rewrite.
- **`TileFlags.Stockpile` — a genuine weld.** Stockpile-ness is **bit 4 of the tile plane**
  (`World/TileDefs.cs:13`), read at `JobContext.cs:118`, `HaulJobSource.cs:39,74`,
  `Commands.cs:138`, `GlyphMapper.cs:85`, `hosts/tui/GameLoop.cs:312`,
  `hosts/scenario/Program.cs:325`. `TileFlags` has **one bit left**, which is exactly why
  `ECONOMY-PLAN.md` E0-4 mandates a registry instead. So "stockpiles with filters" — one of
  the more obviously generic economy concepts — is currently a bit in the geometry.

### 1.7 The dependency picture, as a diagram of the real thing

```
                       ┌──────────────────────────────────────────┐
   HOSTS (4 csproj)    │ scenario · tui · web · tests             │
   glob sources ──────►│ each recompiles sim/** into ONE assembly │
                       └──────────────────────────────────────────┘
                                        │
   ══════════ verified DAG, no compiler enforcement ══════════
                                        │
        Sim.Gen ──► Sim.Dsl ──┐   Sim.Glyph ──┐   Sim.Llm ──┐   Sim.Content ──┐
           └──────────────────┴───────────────┴─────────────┴────────────────┤
                                                                             ▼
   ┌─────────────────────────── Sim.Core — ONE namespace, 16,138 LOC ────────────────────┐
   │                                                                                     │
   │   ┌───────────────── Simulation (god object, 17 members reached by economy) ─────┐  │
   │   │  World  Events  Rng  TickCount  Defs  Citizens  Devices  Items  Rooms  Paths │  │
   │   │  JobsDirty  PowerDirty  DeviceTopologyVersion  WastewaterLiters  Scripts     │  │
   │   └──────────────────────────────────────────────────────────────────────────────┘  │
   │      ▲                    ▲                   ▲                  ▲                  │
   │      │                    │                   │                  │                  │
   │  ┌───┴──────────┐  ┌──────┴───────┐  ┌────────┴────────┐  ┌──────┴──────────────┐   │
   │  │ ECONOMY      │  │ SHIP         │  │ CREW / SOULS    │  │ SUBSTRATE           │   │
   │  │ ~3,950 LOC   │  │ Atmosphere   │  │ Citizen         │  │ SimRng  XxHash64    │   │
   │  │ Jobs/ (4 src)│  │ Rooms        │  │ Needs  Social   │  │ EntityStore         │   │
   │  │ Build        │  │ Power        │  │ Goal   Director │  │ Save{Reader,Writer}  │   │
   │  │ Deconstruct  │  │ Thermal      │  │ CitizenMemory   │  │ ISimSystem           │   │
   │  │ Crafting     │  │ Water/Hydro  │  │ Chronicle       │  │ IStatefulSystem      │   │
   │  │ MachineWear  │  │ Nav  Safety  │  │ Effects/*       │  │ ISimCommand (13)     │   │
   │  │ ItemStack    │  │ Exploration  │  │ PersonaSheet    │  │ EventBus  SimDefs    │   │
   │  └──────────────┘  └──────────────┘  └─────────────────┘  └─────────────────────┘   │
   │         │                 ▲                    ║                                    │
   │         │                 │                    ║                                    │
   │         └──── 6 sites ────┘         ╔══════════╩══════════════════════════════╗     │
   │            3× MarkDirty()           ║  ZERO EDGES. Mood/Skill/Persona/Llm/    ║     │
   │            IsPressureHull ×3        ║  Fatigue are never read by the economy. ║     │
   │            room.TemperatureK        ║  `skill` does not exist in sim/ at all. ║     │
   │                                     ║  ← THIS is the gap, not the coupling.   ║     │
   │                                     ╚═════════════════════════════════════════╝     │
   └─────────────────────────────────────────────────────────────────────────────────────┘

   Welded to a tile grid (no non-tile version without a rewrite):
     IJobSource.cs:195   IJobTileScanner.VisitTile(sim, Int3, flags, wall, floor)
     JobSystem.cs:182    z,y,x walk over world.Levels[z].Flags
     TileDefs.cs:13      TileFlags.Stockpile — a zone is a BIT IN THE GEOMETRY
     PendingBuild.Pos    a work site IS an Int3 (BuildSystem.cs:21)
```

### 1.8 One structural fact that makes everything in §7 cheap

**`JobSystem` and all four `IJobSource` implementations are not `IStatefulSystem`.** They
own no saved state and fold nothing into `StateHash` — their boards are purely derived
(`JobSystem.cs:39-42`). The hash fold iterates the stack and folds only stateful systems
(`Simulation.cs:487-488`). Of the economy, only `BuildSystem` (`:321`) and
`DeconstructSystem` (`:87,574`) are stateful, plus the four empty stubs.

SYSS chapters are keyed by the system's **`Name` string** (`SaveWriter.cs:121,129`), not by
type or file path.

Therefore: **moving economy files between directories or namespaces is pin-neutral.** What
moves a pin is reordering `SystemStack.CreateDefault`, changing a `Name`, changing fold
content, or changing behaviour. This is the difference between a plan that costs a re-pin
per step and one that costs none, and it is why §7's steps 1–4 are all pin-neutral.

---

## 2. The moonbase → perilune port — the only real portability evidence

*(The empirical heart of the audit: a completed port by this author beats any theory about
what is reusable. `/Users/garvin/Research/Code/moonbase` still exists — the Unity project at
`moonbase/moonbase/`, plus a non-Unity `moonbase/tools/` tree that is the direct ancestor of
`hosts/`.)*

### 2.1 What survived: 49 of 84 sim files essentially untouched

Measured by diffing every `Sim.{Core,Dsl,Gen,Glyph}` file against its perilune counterpart:

| outcome | files | of 84 |
|---|---|---|
| byte-identical modulo `Moonbase.`→`Perilune.` | **43** | 51 % |
| + differ only by an append-only enum/table extension (`Glyphs.cs` +1 for `Telescope`, `MachineDefs.cs` +1, `Device.cs` +2, `GlyphColor.cs` +4 for `Deconstruct`, `ItemStack.cs` +4, `EffectValidator.cs` +4) | **49** | **58 %** |
| **dropped** | **0** | — |

**Nothing was dropped.** Every moonbase `Sim.*` file has a same-path counterpart here.
`Sim.Dsl` is **16 of 16 byte-identical, 2,679 LOC in both trees** — the single most stable
module in the codebase, which is why §3.2 ranks it as it does.

### 2.2 Why it was nearly free — and this is the transferable lesson

Not modularity discovered during the port. **One boundary, declared before any gameplay code
existed, and enforced by the build system.**

| when | what |
|---|---|
`c1513cd` 2026-07-18 **10:28** | "Initial commit: clean Unity 6 URP template" |
`d1c252e` 10:36 (**+8 min**) | `moonbase/docs/TDD.md:9` already reads *"Decision: a plain-C# simulation core with zero UnityEngine dependencies, running on a fixed tick, with Unity as a presentation/input shell"* — with the full trade table against DOTS and MonoBehaviour |
`62a34d3` 10:43 (**+15 min**) | **First code commit.** `Sim.Core.asmdef` already carries `"references": []` and `"noEngineReferences": true` |
`e52e131` 2026-07-19 **17:44** (+31 h) | **First non-Unity `.csproj`** — `tools/ScenarioRunner` + `tools/Perilune.Tests`, source-globbing the Unity project's `Sim.Core`/`Sim.Dsl` |
`f846b5f` 2026-07-20 09:10 | last moonbase commit |
`5888f50` 2026-07-20 **22:47** | perilune founding commit: "Unity removed" |

**For ~29 hours two build systems compiled the same sources side by side**, and by the end the
headless suite (182 tests) had overtaken the frozen Unity suite (175). The port deleted the
losing build path. It did not extract a sim from an engine.

The quarantine was total and mechanical. `noEngineReferences: true` on all five sim asmdefs;
grepping moonbase's `Sim.Core Sim.Dsl Sim.Glyph Sim.Gen` for
`UnityEngine|MonoBehaviour|Vector3|SerializeField|Debug\.Log|UnityEditor|ScriptableObject`
returns **exactly one hit, and it is a comment asserting the invariant**
(`moonbase/.../Sim.Core/Simulation.cs:10`, `/// No UnityEngine anywhere in this assembly.`).
Unity's dependency lived in **39 files across 2 assemblies**: `Game.View` (23 of 24 files
import Unity) and `Editor` (15 of 15).

And the boundary was *enumerated in advance*: `tools/PeriluneTui/SimHost.cs:9-25`, written
**inside the Unity repo**, mirrors `Bootstrap.BuildAuthoredSim` step by step and closes —
*"Only Unity-only steps are dropped: BuildView/SetupLighting (rendering) and GenerateMinds
(LLM personas) … so the sim trajectory and every StateHash are identical to Unity's headless
boot."* Unity's entire contribution was rendering, lighting, and persona generation, and the
author had already shipped and hash-verified the version without them.

**Measured port cost: a `sed`, one stale `InternalsVisibleTo`, and one hash re-verification.**
The rename commit `c3ac35a` records the only friction found anywhere — `AssemblyInfo.cs`'s
`InternalsVisibleTo` target ("Perilune.Tests.EditMode" → "Perilune.Tests") — and notes
"goldens byte-identical; 182/182 green; determinism hash unchanged."

### 2.3 What was abandoned

11,763 of 24,614 LOC (47.8 %) in `Assets/Scripts/`, and it is **exactly what Unity owned**:

| abandoned | LOC | replaced in perilune by |
|---|---|---|
`Game.View/` (24 files) | 4,436 | `client/src/` (14,638 JS) + `hosts/`. 1 file ported — `Dialogue/DialogueShim.cs`, the only UnityEngine-free file in the directory |
`Editor/` (15 files) | 2,404 | **nothing**, mostly: no scene format, so scene authoring/generation (856 LOC), the ship-dressing round-trip (439), and the asset-kit probes (315) have no successor. Screenshot QA (619) → `art/screenshot-test/slice-shot.mjs` + `hosts/tui --dump`; generated-asset builders (175) → `art/spritegen/run.py` |
`Tests/` (30 files, 175 `[Test]`) | **4,923** | **abandoned wholesale — see §2.5** |
Assets (4,517 files, 2.34 GB) | — | 2.33 GB of it (the two purchased kits) **was gitignored and never committed** |

Two asset directories carried verbatim: `Assets/StreamingAssets/SimDefs/` → `content/core/SimDefs/`,
and the `Assets/2d/` anchor PNGs → `art/spritegen/`.

The recorded reason for the pivot is not about architecture. `moonbase/HANDOVER.md:5` names an
approved pivot plan whose rationale is *"Unity 3D scene construction has been the project's
persistent automation failure: Claude can't art-direct 3D … scene files are editor-owned
opaque state, and visual verification requires the GUI editor. Meanwhile the actual game — the
deterministic, UnityEngine-free sim core — runs headless at ~58,000× real time and is where
all the value lives."* Symptoms are all over `moonbase/docs/HANDOVER.md`: *"Claude never
hand-dresses rooms — that failed hard"* (`:55`), *"Exposure tuning took 3 iterations"*
(`:241`), *"Garvin's GUI editor holds the project lock … Screenshot tools need the GUI editor
(real GPU), NOT batch"* (`:233`).

### 2.4 The mechanism the author chose — twice, unchanged

None of moonbase's four `tools/*.csproj` used a project reference or a DLL. All four
**source-globbed the Unity assembly's `.cs` files**:

```xml
<!-- moonbase/tools/ScenarioRunner/ScenarioRunner.csproj -->
<Compile Include="../../moonbase/Assets/Scripts/Sim.Core/**/*.cs" />
<Compile Include="../../moonbase/Assets/Scripts/Sim.Dsl/**/*.cs" />
<Compile Include="../../moonbase/Assets/Scripts/Sim.Gen/**/*.cs" />
```

`diff` against this repo's `hosts/scenario/ScenarioRunner.csproj` is **13 lines** — the
namespace and the four paths. `PeriluneTui.csproj` diffs by **5**. The build files were
copied, not rewritten, and the stale comments came with them: `hosts/scenario/ScenarioRunner.csproj:3-5`
still says *"the simulation runs without Unity … Unity remains the source of truth for
shipping builds"* and `hosts/tui/PeriluneTui.csproj:3-7` still says *"Boots the SAME sim
Unity's `Bootstrap.BuildAuthoredSim` boots"* — in a repo where neither exists. (Worth a
one-line cleanup; it is currently the most misleading comment in the build system.)

**This is the answer to §3's mechanism question, decided by precedent: source globs.** It
worked across an engine boundary and across a repo boundary, twice, with no packaging step.
Also carried: **20 of 26 `tools/Perilune.Tests/*.cs` are byte-identical here.**

### 2.5 The economy specifically — it crossed intact, and that is a weaker claim than it sounds

| economy artefact | across the port |
|---|---|
`JobKind` | moonbase's **8 values byte-identical, comments included** (`None`…`Maintain`). Perilune appends `HaulToBuild=8, Build=9, Flee=10, Deconstruct=11` |
`ItemKind` | **byte-identical, all 7 kinds, same comments.** Zero new item kinds in a year of economy work |
`World/TileDefs.cs` | **byte-identical, 50 lines**, including `Stockpile = 1 << 4, // haul destination zone` |
`Systems/MachineWearSystem.cs` | 406 → 421, and **every hunk is mechanical**: `JobsDirty` bool→flags (W0-3), `ReservedForJob`→`ReservedBy` (B-1), `IsIdleForWork`→`IsRecruitableForWork` (E0-1), the Director's `× pressure` lever. **Not one line of changed wear or maintenance logic** |
recipes | same 3-step ladder (`Regolith→Scrap→Parts→ControllerModule`), same kinds, same counts. `recipes.def` differs by 6 lines and they are **all the work-seconds column** (20/30/40 → 600/900/1800, E0-2's rebase) |
`DeviceLayout.json`, `rules/overheat_guard.moss` | **byte-identical** |
`Jobs/JobSystem.cs` | 469 lines → a dispatcher + 4 sources (1,689 LOC). **This was an in-repo extraction (W0-4), not a port rewrite** — verified: `HaulJobSource` preserves moonbase's private field names (`_stockpiles` with the same `// z,y,x scan order` comment, `_groundItemTiles // lookup only`, `_stockTried`), its method names (`ProgressPickup`, `ProgressDeliver`, `TryPathToFreeStockpile`) and its comments verbatim (`// the dead are not cargo`) |
`ISimCommand`s | moonbase's 7 all survive; 6 appended |
**dropped** | **nothing** |

So: **every economy primitive crossed the engine port intact.**

**But read what that does and does not prove.** It proves the economy is **engine-portable** —
which it is, trivially, because it never touched the engine. It says nothing about whether it
is **game-portable**, because *the game was the same game*. moonbase and perilune are one
design with one ship, one crew model, one item ladder. The port never tested reuse in a
different game, which is precisely what Garvin is asking about. **The port's transferable
lesson is a process lesson, not an architecture one:** declare the boundary before writing
code and let the build system enforce it. That is what made this cheap, and it is exactly what
§7's steps 2 and 3 propose doing for the economy.

The unproven half is worth naming too. Everything genuinely *new* in the economy since the
port is either measured and merged (`BuildSystem`, `DeconstructSystem`, `SafetySystem`,
owner-scoped reservations, `JobBoardDirty`, `IJobSource`) or **declared and not connected**:
the `ProductionDefs` multi-port conversion graph (`[production]` ships empty), filtered
stockpile zones (`StockZoneSystem` is the empty stub; E0-4 unmerged), `OreRegistrySystem`,
`TradeSystem`.

### 2.6 The warning in the data: portable code is not portable tests

**moonbase's entire 30-file, 4,923-LOC, 175-`[Test]` Unity suite was abandoned.** 29 of 30
files have no counterpart here. Gone: `PathfindingTests`, `SaveLoadTests`, `ThermalTests`,
`DeterminismTests`, `AllocationTests`, `CraftingTests`, `JobSystemTests`,
`JobInteractionTests`, `MaintenanceTests`, `AtmosphereTests`, `PowerNeedsTests`, `GoalTests`,
`ExplorationTests`, `FoodWaterTests`, `ShipSurvivalTests` — and **all eight
`EditMode/Moss/*` files, 1,105 LOC**, the lexer/parser/runtime/audit/persistence/error/
integration/allocation suite for `Sim.Dsl`.

**`Sim.Dsl` is the most portable module in the repo — 16 of 16 files byte-identical — and its
entire dedicated test suite did not come along.** All nine of those files are absent here;
moonbase's 37 dedicated MOSS unit tests are replaced by 25 integration/wire-level ones, with
**no direct lexer or parser coverage at all** (measured — see §8.5). This repo rebuilt to a
larger suite overall, but not a superset: `GoalSystem` is referenced by **0** test files here
(moonbase had `GoalTests.cs`); `PathService` by **1** (moonbase had `PathfindingTests.cs`).

Two implications for the plan. First, when §3.2 says a unit is "port-proven", that means its
*code* crossed — its *tests* may not have, and the tests are where the hard-won behaviour is
pinned. Second, the reusable asset in §4 is only reusable if the gate comes with it: **copy
`ci.sh` and the golden fixtures, not just the source.**

One thing that looks like a port regression and is not: **player-facing save/load.** `SaveWriter`/
`SaveReader` exist here and are test-covered but unreachable from any host — and in moonbase
they were wired **only** in `Game.View/SaveController.cs`. Neither `tools/PeriluneTui` nor
`tools/PeriluneWeb` ever had them. It lived exclusively in the abandoned layer; it was never
portable and was not lost in the port. (It is still a real product gap, and not this lane's.)

Finally, an unrecorded cost worth knowing: **moonbase was abandoned dirty.** `git status`
there shows 61 modified/untracked paths — including `Sim.Gen/{BandPlanner,RoomDresser,
RoomOutfitter,RoomProgramme}.cs` and `Defs/SimDefs.cs` — all of which reappear inside
perilune's founding commit. The final ~13.5 hours of Unity-era work has no commits, only a
permanently dirty tree. Nothing in either repo accounts for the 11,763 abandoned LOC; there is
only a success ledger. **A future port should budget a "what we are throwing away" commit.**

---

## 3. The honest reuse units, and the mechanism

### 3.1 The mechanism question is already answered by the author's own history

The candidate mechanisms were: separate in-repo assemblies, a source-shared project, a git
submodule/subtree, a NuGet package, or copy-and-diverge.

**Recommendation: keep the source glob, and reuse by copy for the economy, by glob for the
substrate.** Reasons:

- It is what already exists (`hosts/*/*.csproj`, four instances) and what carried the port.
- It costs nothing to set up and it survives a language/runtime version change.
- NuGet is wrong here: these are not stable libraries, they are code the author edits daily
  while shipping a game. Versioning them would add a release step to every economy lane and
  the E-lanes are already the bottleneck.
- A submodule is wrong for the same reason plus the worst failure mode in this repo's
  history — two checkouts of the same code edited at once (CLAUDE.md's hard worktree rule
  exists because of exactly that on 2026-07-22).
- **Copy-and-diverge is the right answer for the economy specifically**, and saying so is
  not defeat: an economy is the most game-specific thing in a game. Two colony sims by the
  same author *should* diverge in their economies; sharing that code would couple the
  balance of two games.

### 3.2 Ranked reuse units

| unit | LOC | port-proven? | reusable in ANY sim game? | reusable in a tile colony sim? | what it drags |
|---|---|---|---|---|---|
| **Determinism substrate** — `XxHash64`, `SimRng`, `EntityStore`, `ISimSystem`, `IStatefulSystem`, `ISimCommand`, `Save{Reader,Writer}` chapter format, `EventBus`, the golden-pin/`ci.sh` discipline | ~1,500 | **yes — namespace-only** | **yes** | yes | almost nothing |
| **`Sim.Dsl` (MOSS)** — lexer, parser, AST, values, diagnostics, interpreter, budgets, audit, persistence, in-terminal IDE | 2,679 | **yes — 16/16 byte-identical** | **yes** | yes | `EventBus` + `AlarmRaisedEvent` (2 types, for alarms only) and ~200 lines of concrete adapters. **Its 1,105-LOC test suite did NOT cross — §2.6** |
| **Spatial primitives** — `Int3`, `ZLevel`, `World`, `TileDefs`, `PathService` | ~550 | **yes** (`Int3`, `TileDefs`, `ZLevel` namespace-only; `World` +88 %, `PathService` +49 %) | no | **yes** | nothing |
| **`Sim.Glyph`** — semantic projection to a glyph grid, lenses, ramps | ~750 | mostly (6/10 namespace-only) | only if you want an ASCII/semantic view | yes | `Sim.Core` (3 usings) |
| **Job board** — dispatcher + `IJobSource` + `JobContext`/`JobWork` | ~650 | **yes — crossed intact, restructured later in-repo by W0-4 (§2.5)** | no (tiles in the seam) | yes, with edits | `Simulation`, `Citizen`, `World`, `Int3`, `PathService` |
| **Stage-material-then-work pattern** — `BuildSystem` + `BuildJobSource` | ~770 | **no — post-port, never ported** | as a *pattern*, not as code | yes | all of the above + `PendingBuild.Pos : Int3` |
| **Wear/maintenance** — `MachineWearSystem` | 421 | **yes — 100 % mechanical diff, zero logic change** | **yes, nearly** | yes | `Device`, `sim.Rooms` for temperature |
| **Def system** — `SimDefs` + `DefsParser` | 1,675 | rewritten (+84 %) | as a *pattern* | yes | nothing, but see §5 |
| **`ItemKind` / recipes / production graph** | ~270 | no | no | copy and rewrite | it is 7 enum members and 3 recipes — there is nothing to reuse |
| **`Sim.Content` pack layering** | ~330 | new | **yes** | yes | nothing — and it is currently dead (§0.2) |

Two entries deserve emphasis.

**`MachineWearSystem` is the sleeper *economy* asset.** It crossed the port with a diff that
is **100 % mechanical — not one line of changed wear or maintenance logic** (§2.5). Its
mechanism is entirely generic: a machine has a condition that decays at a def'd rate,
modulated by an environmental factor; crossing a maintain threshold generates work, crossing
a fail threshold raises an alarm; servicing consumes a part. That is reusable in any game with
machines. Its only game-specific line is where the environmental factor comes from
(`sim.Rooms.RoomAt(...).TemperatureK`, `:59,62`). **If exactly one economy file is worth
lifting deliberately, it is this one.**

**`Sim.Dsl` is the sleeper asset overall, and it may be worth more than the economy.** 2,679
LOC; **16 of 16 files crossed the port byte-identical modulo the namespace**; the seam is a
two-method interface with string in and a DSL-local tagged union out
(`DeviceRegistry.cs:10-21`); the lexer/parser/AST/values/diagnostics/compiler layer
(~1,300 lines) contains **zero** references to any sim type; the interpreter's entire
coupling is `EventBus` + `AlarmRaisedEvent` for publishing alarms
(`Interpreter.cs:68,122,151,218`). A player-facing scripting language with diagnostics, an
audit trail, step budgets, persistence and an editor is reusable in *literally any* game and
is a multi-week build from scratch. One caveat: `MossBindings.RegisterAdapters`
(`MossBindings.cs:14-45`) hard-codes a `switch (DeviceKind)`, so a new automatable machine
needs a line there even when it needs no new adapter class.

---

## 4. The determinism substrate vs the economy

The brief's hypothesis — *"the determinism substrate may be the most valuable portable asset,
not the economy"* — is **correct, but not for the reason the brief supposes**, and the
distinction matters for the plan.

Every load-bearing substrate file crossed moonbase→perilune **namespace-only**:
`Rng/SimRng.cs`, `Entities/EntityStore.cs`, `Events/EventBus.cs`, `ISimSystem.cs`,
`Save/IStatefulSystem.cs`, `Commands/ISimCommand.cs`, `Save/ScriptEntry.cs`,
`Effects/CapabilityComputer.cs`. `Hash/XxHash64.cs` changed 32 lines (span overloads).
`Save/SaveReader.cs` and `SaveWriter.cs` changed 9 % and 7 % — chapter additions, not
redesign.

**But so did the economy** (§2.5): `ItemKind` and `TileDefs.cs` byte-identical,
`MachineWearSystem`'s diff 100 % mechanical, the haul internals verbatim, nothing dropped. So
the port does **not** discriminate between substrate and economy on portability — *everything
engine-free crossed, because that is what the asmdef boundary guaranteed.* Reading the port as
"the substrate is portable and the economy isn't" would be reading it wrong.

The substrate wins on a different axis: **generality of purpose.** The economy crossed one port
into *the same game*; that is engine-portability, which the economy has and which is not what
Garvin asked for. The substrate is portable into a *different* game, which nothing here has
tested but which follows from what the code is: `SimRng`, `XxHash64`, `EntityStore`,
`ISimSystem`, `IStatefulSystem`, `ISimCommand`, the chapter-based save format and the
golden-pin gate make no assumption about tiles, crews, items or ships. `ItemKind` and
`IJobTileScanner` make several.

Under the brief's own rule — *"anything rewritten twice is a warning"* — nothing here has been
rewritten twice yet. The job board has been restructured **once, in-repo** (W0-4, 469 lines →
a dispatcher plus four sources), which is a first data point in that direction and worth
watching: `ECONOMY-PLAN.md` E-MINE, E-STOCK and E-PROD each want to add a source, so the file
most likely to be restructured again is the one an extraction would freeze.

Why it is expensive to rebuild, concretely: it is not the ~1,500 lines of code, it is the
**discipline encoded around them** — "every saved field is hashed in the SAME commit", the
twin-sim divergence check, the golden-hash gate in `ci.sh`, the append-only fold-order rule
(`SimDefs.cs:699-701`), the "no `foreach` over dictionaries in `Jobs/`" determinism rule
(`IJobSource.cs:29-32`), the zero-alloc generation-stamp pattern (`JobContext.cs:31`,
`JobWork.EnsureSize`), and the reservation-ownership discipline that came out of bug B-1
(`ItemStack.ReservedBy:uint`, `JobContext.cs:40-44`). Those are conventions a second game
inherits for free by copying six files and one `ci.sh`, and they are what actually cost
months to learn. **A checklist and a `ci.sh` are part of the portable asset.**

`ISimCommand` deserves a specific note as the cheapest high-value piece: a one-method
interface (`ISimCommand.cs:10-13`) that is the *single* input channel — player orders, UI,
MOSS actuators and validated LLM effects all become one of 13 command classes. That plus
"the command log given the same seed fully determines sim state" is the whole replay/undo/
netcode/testability story, in 13 lines of interface.

---

## 5. Defs and content packs as a portability vector

**Answer: pushing more economy into defs buys *tuning* portability, not *code* portability,
and the current def system architecturally cannot deliver what would be needed.**

What the def system is, measured: **119 distinct field names, 324 addressable values in
shipped content**, in 14 scalar sections plus three tables. A "def" is a **scalar tuning
knob**, not a content definition (`SimDefs.cs:6-11`). A field may be `float`, `double`,
`int`, `bool`, or an enum-by-name — restricted to `DeviceKind`/`ItemKind`/`PowerTier` and
gated on `Enum.IsDefined` (`DefsParser.cs:660-703`). **There is no string field, no list
field, no nested-object field, and no new-entity syntax.** Parsing is three nested
hand-written switches on lowercased string keys (`DefsParser.cs:31`, `:127-154`, `:158-180`,
then one `XKey` method per section) — no reflection, no attributes. Everything is fail-soft:
an unknown section or key becomes a `problems` string and keeps the default.

Roughly **48 of the 101 scalar fields are economic**, plus 5 of 8 machine-table columns
(130 of 208 values) and all 5 recipe columns. So the economy is *already* about half-data by
knob count.

But the identities are all code:

| thing | verdict | citation |
|---|---|---|
| item kinds | **C# enum, 7 members** | `ItemStack.cs:3-12` |
| device/machine kinds | **C# enum, 26 members** (properties are a def table) | `Device.cs:3-33` |
| job kinds | **C# enum, 12 members** | `Citizen.cs:125-140` |
| tile kinds | **code consts + static table, 4 rows** | `TileDefs.cs:34-45` |
| room types | **C# enum, 16 members** | `RoomType.cs:9-27` |
| recipes | **def table over a code-fixed keyspace** — `RecipeDef[]` indexed by `(int)DeviceKind`, so single-in/single-out and one bill per station; a second row *overwrites* | `SimDefs.cs:671-674`, `:953-969` |
| production graph | **fully data-driven, additive, and shipped EMPTY** | `ProductionDefs.cs`; `Production.Nodes = Array.Empty<>()` at `SimDefs.cs:678`; `content/core/SimDefs/production.def` is 99 lines of comment and a bare `[production]` header at line 100 |
| deconstruct yields | **hybrid: amounts def'd, item kind compiled in** | `DeconstructSystem.cs:91` `WallSalvage = ItemKind.Regolith`, `:96` `DeviceSalvage = ItemKind.Parts`; amounts at `:270,290` |

So **a content pack can rewire the conversion graph among 7 existing item kinds and 26
existing device kinds, and nothing else.** It cannot add an item, a machine, a job verb, a
tile or a room type. The shipped content itself admits this (`production.def:72-73`, on the
missing `Seals`/`Ice`/`Swarf`/`Circuits` kinds).

Two further problems worth recording:

1. **The `[production]` table's selection policy is hard-coded to ordinal 0**
   (`ProductionDefs.cs:194`, `TryGetNode(station, 0, out var node)`). A second node on the
   same station parses, checksums, and is dead code — the parser emits a warning about it
   (`DefsParser.cs:557-588`). So the one genuinely additive data table can express a graph
   it cannot then *run*.
2. **Un-def'd economic literals.** `DigJobSource.DigWorkTicks = 6000`
   (`DigJobSource.cs:21`) — 600 s to dig a tile, the largest single labour number in the
   game — is a `public const` with a `TODO(E-MINE/E3): move to mining.def`. Its yield is a
   literal too (`:142`). `BuildSystem.FloorMaterialCost = 1` / `FloorConstructTicks = 20`
   (`BuildSystem.cs:253-254`) are private consts with a `TODO(economy)`, so
   `MaterialCost`/`ConstructTicks` (`:257-263`) mix defs and literals in one expression.
   `BuildSystem.Material = ItemKind.Regolith` (`:58`) compiles in the build currency. There
   is **no stack-size def anywhere** (`ItemStack.Count` is unbounded).

**The verdict on defs-as-portability.** The cost per field is real but modest — ~5 lines of
production code (field + `CreateDefault` initialiser + parser `case` + checksum
`Combine` appended at the tail + the `.def` line) plus a divergence test in
`DefsEquivalenceTests.cs` and a doc re-pin. A whole new *section* costs ~9. But moving
`DigWorkTicks` into a def does not make the economy portable — it makes it *tunable*. What
would buy portability is **data-defined item and recipe identity** (string ids instead of
enums), and that is a large change: `ItemKind` is folded into the defs checksum as its
`byte` value (`SimDefs.cs:787`), packed into the item hash, and saved. Converting enums to
data ids moves pins, touches the save format, and costs far more than it returns while the
game has 7 items. **Recommendation: do not push the economy further into defs for
portability reasons.** Do it for the two reasons that are already good — closing the
`DigWorkTicks`/floor-cost literals so tuning has one home (§7 step 5), and giving
`ContentSet` a runtime consumer so the pack path is not dead (§7 step 6).

---

## 6. The gap that matters — the operator model has nowhere to land

`docs/design/perilune-automation-and-souls.md` is a **binding** design authority. Its §4 is
titled "the centerpiece" and its claim is: *"Mood + skill are the throughput."* §4.1
insists the operator's effect be **material, not cosmetic**. §4.2 requires it be a
deterministic function of hashed state, never an RNG roll. §7's table assigns it to E2.

**Measured state of that principle: 0 % implemented, with no seam to implement it against.**

- `grep -rni skill sim/` → **no matches**. There is no skill concept in the simulation.
- `Citizen.Mood` exists and is hashed (`Simulation.cs:386`). Its only readers are
  `ShipMetrics.cs:83` (HUD average), `SocialSystem.cs:147` (opinion drift) and the hash.
  **No economy system reads it.**
- `Citizen.Fatigue` exists, is hashed (`Simulation.cs:385`), and its own comment
  (`Citizen.cs:49`) claims it "slows work". It does not (§0.2).
- **The work countdown is five independent copies of the same decrement, and none of them
  takes a rate:**

| site | code |
|---|---|
| `Jobs/Sources/DigJobSource.cs:135` | `if (--citizen.JobWorkTicks > 0) return;` |
| `Jobs/Sources/BuildJobSource.cs:405` | `if (--citizen.JobWorkTicks > 0) return;` |
| `Jobs/Sources/DeconstructJobSource.cs:180` | `if (--citizen.JobWorkTicks > 0) return;` |
| `Systems/MachineWearSystem.cs:248` | `worker.JobWorkTicks -= Interval;` |
| `Systems/CraftingSystem.cs:173` | `if (worker.JobWorkTicks > 0) { ... }` |

There is no `ApplyWork(citizen, job)` anywhere. There is no per-citizen multiplier anywhere.
A sixth job verb will be a sixth copy.

**Why this is the pivot of the whole audit.** The brief asks for portability, and notes that
"a portable economy that cannot express *mood+skill = throughput* fails this project's own
requirement." Both halves point at the same missing function:

- **Portability:** any economy reusable in a game with *characters* must be able to ask
  "who is doing this work, and how fast do they do it?" An economy that hard-codes one tick
  per tick is not an economy abstraction, it is a countdown.
- **Maintainability:** five copies of one rule is five places for a bug and five places E2
  must edit. Introducing the seam *reduces* code.
- **The binding principle:** E2 cannot ship the operator model without it.

That is three requirements satisfied by one ~40-line change. Nothing else in this audit has
that ratio, which is why it is step 1.

---

## 7. The plan

Sequenced, costed, and split into maintainability (M) and portability (P). Steps 1–4 are
**pin-neutral** by §1.8. Nothing here requires freezing feature work; every step is sized to
fit inside or beside an E-lane, which is deliberate — see §8.4.

### Step 0 — The rule, not the refactor. `P`. **Free. Applies to the next game, not this one.**

§2.2 is the finding the whole plan turns on: the moonbase port cost almost nothing because the
boundary was **declared in a doc 8 minutes in, encoded in the build system 15 minutes in, and
never negotiated** — and because a second consumer of the shared sources existed 31 hours in,
before there was much to share.

**The transferable asset is therefore a process rule, and it costs nothing to adopt:**

1. **Declare the boundary before gameplay code exists**, in a doc, with the trade table
   (moonbase's `docs/TDD.md:9-20` is the template).
2. **Enforce it in the build system on day one**, not by review. moonbase used
   `noEngineReferences: true`; this repo's equivalent is step 3's `.csproj` set, or step 2's
   test until then.
3. **Stand up a second consumer of the shared code early** — a headless test host or scenario
   runner. It is what actually keeps the boundary honest, because a violation breaks a build
   instead of a convention.
4. **Budget a "what we are throwing away" commit** at any future port. §2.6's abandoned
   4,923-LOC test suite and moonbase's permanently dirty final 13.5 hours are both unrecorded.

Writing this down is the cheapest portability work available and it is the only step here that
would have changed the outcome of the last port. It belongs in `docs/ARCHITECTURE.md` or
`CLAUDE.md`, not in a design note nobody reads twice.

### Step 1 — The work seam. `M` + `P` + unblocks E2. **~1–2 days.**

**What changes.** One static helper beside `JobWork` (`Jobs/JobContext.cs`):

```csharp
// SKETCH — not built. Rate 1 today ⇒ identical behaviour, pins hold.
public static bool ApplyWork(Simulation sim, Citizen worker, int ticks = 1)
{
    int rate = WorkRate(sim, worker);          // returns exactly 1 today
    worker.JobWorkTicks -= ticks * rate;
    return worker.JobWorkTicks <= 0;
}
public static int WorkRate(Simulation sim, Citizen worker) => 1;  // E2 replaces this body
```

Then replace the five sites in §6 with calls. **`WorkRate` returning the literal `1` makes
this byte-for-byte identical** — an integer identity, the same trick
`MachineWearSystem`'s `× 1f` director lever used (`MachineWearSystem.cs:36-37`) to land
pin-neutral.

**What it buys.** One place where "a person does a tick of work" is defined. E2's operator
model becomes a one-function change instead of a five-file change. Kills the false
`Fatigue` comment by making the seam that would honour it visible.

**What it risks.** `MachineWearSystem.cs:248` decrements by `Interval`, not 1 — the helper
must take a `ticks` argument or that site will change behaviour. `CraftingSystem.cs:173` is
a *read*, not a decrement; check before converting it. This touches `Jobs/`, which is
E0-4's active area — **land it after E0-4 merges**, not beside it.

**Verification.** All four pins must hold with no re-pin. If any moves, the identity was not
an identity and the step is wrong.

### Step 2 — An architecture test. `M` + `P`. **~1 hour. Do this first if only one thing happens.**

> **✅ LANDED 2026-07-25** — `tests/Perilune.Tests/ArchitectureBoundaryTests.cs`, 8 tests, plus the
> defs pin in `DefsChecksumTests.cs`. Test-only; no production file touched; all four pins
> byte-identical; gate `903 dotnet + 485 node`, `ci.sh` exit 0. Every assertion was proven to bite
> by physically introducing the violation and observing the specific failure (11 mutations,
> including two *negative* controls confirming a comment mentioning `Mood` or `foreach` does **not**
> fail). Writing it corrected two measurements in this document — see the boxes in §1.5.
> Assertions deliberately **not** written are listed at the end of this step.

**What changes.** One new test file. No production code. Assertions:

1. No file under `sim/Sim.Core/` contains `using Perilune.` (the §1.2 DAG invariant).
2. No file under `sim/Sim.Core/Jobs/`, `Stock/`, `Production/`, `Mining/` names `Mood`,
   `Morale`, `Persona`, `Glyph`, or any `Sim.Llm` type — pinning §1.5's zero-coupling result
   so it cannot silently regress.
3. The six known game-specific economy sites in §1.5 are an **allowlist**: a seventh fails
   the test with a message pointing here. (This is the shape that catches drift; it is also
   the shape that annoys people, so keep the message actionable and the list editable.)
4. No `foreach` over a `Dictionary`/`HashSet` under `Jobs/` (`IJobSource.cs:29-32`'s
   determinism rule, currently enforced by review only).
5. **`Sim.Dsl` acquires no new `Sim.Core` dependency.** Today it is 7 `using Perilune.Sim`
   lines and 9 named types (§8.5). Pin that list. It is the repo's most portable asset and
   the assertion is one line.

**What it buys.** The repo's one proven portable asset — the layering — is currently
protected by nothing but memory across sessions, in a project whose own record has been
wrong repeatedly. This makes it mechanical. It also gives §7's later steps a regression net.

**What it risks.** Almost nothing. It is a test over file text; it cannot move a pin. The
real risk is a *false* allowlist entry ossifying a coupling — so write the allowlist with
the `file:line` and the reason, not just the file.

**Cost/benefit:** the best in this document. An hour, zero risk, protects the asset.

**Assertions deliberately NOT written**, because each would be a tripwire people learn to ignore
rather than a boundary worth defending:

| not asserted | why not |
|---|---|
| **Fully-qualified cross-module references** (`Perilune.Glyph.GlyphColor.X` with no `using`) | A regex cannot resolve types. The DAG tests pin the **declared** dependency — the `using` line, which is what a reviewer reads and what a future `.csproj` split turns into a `ProjectReference`. Stated as a limitation in the test's class doc rather than faked. |
| **`foreach` over dictionaries repo-wide** | Five files elsewhere in `Sim.Core` legitimately use `foreach` (`Commands.cs`, `RoomState.cs`, `AtmosphereSystem.cs`, `CitizenMemory.cs`, `HistorySystem.cs`). The determinism rule is a **`Jobs/`** rule (`IJobSource.cs:29-32`); generalising it would fire on correct code and get suppressed. |
| **Zero-alloc on tick paths** | Not observable from source text. `AllocationTests` in moonbase measured it at runtime; that is the right mechanism and it is a separate piece of work (§2.6). |
| **Exact `Simulation`-member counts** for the economy (the §1.5 17-member table) | Legitimately churns with every economy lane — `sim.Items`/`sim.Defs`/`sim.World` counts move whenever anyone edits a job source. Pinning them would fire on nearly every E-lane commit and teach nothing. Only the *ship-system* reaches are pinned, because those are the ones that must stay rare. |
| **`ItemKind` member count** | E0-6/E0-7 are *supposed* to add `Seals` and `Ice`. Asserting 7 would fail by design. |
| **`Sim.Core` has no file IO** | Two documented violations already exist (`Sim.Dsl/RulesLoader.cs`, `Sim.Llm/Providers/LlmSettings.cs` — §1.2), both outside `Sim.Core`. A `Sim.Core`-only assertion would pass vacuously today and I could not verify it stays meaningful; better as a real cleanup than a green test. |
| **InvariantCulture usage** | A `ToString()` with no `IFormatProvider` is already flagged by analyzer warnings CA1305/CA1310 during the build (visible in the gate output). Duplicating that in a test would add noise, not coverage. |

### Step 3 — Real `.csproj` per sim module. `M` + `P`. **~1 day, moderate risk.**

**What changes.** Add `Sim.Core.csproj`, `Sim.Dsl.csproj`, `Sim.Glyph.csproj`,
`Sim.Gen.csproj`, `Sim.Llm.csproj`, `Sim.Content.csproj` with `ProjectReference`s matching
§1.2's DAG. Hosts switch from source globs to project references.

**What it buys.** The compiler enforces the layering instead of a test approximating it.
`internal` starts meaning something. Build times drop (six assemblies compiled once, not
five times across four projects). And the *next game* references assemblies rather than
globbing paths, which is the difference between reuse and copy-paste.

**What it risks.** Real risk, which is why it is behind step 2 and not instead of it.
(a) The hosts' explicit cross-includes (`hosts/web/PeriluneWeb.csproj:30-37` compiles four
files from `hosts/tui/` and `hosts/scenario/`; `tests/Perilune.Tests.csproj:24-45` compiles
an allowlist of nine host files) do not translate to project references without either new
projects or `InternalsVisibleTo`. (b) `Directory.Build.props` applies repo-wide and must not
change. (c) `AssemblyInfo.cs` already exists in `Sim.Core/Properties/` — check what it
declares. (d) `ci.sh` and `Perilune.sln` both change.
**Do not do this while E0-4 is mid-flight** — it touches every project file and would
conflict with everything.

**Honest note:** step 2 buys ~80 % of step 3's benefit for ~5 % of the cost. If the calendar
is tight, do step 2 and stop.

### Step 4 — Fold the three `MarkDirty()` notifications behind the event bus. `P`. **~2 hours.**

**What changes.** `DigJobSource.cs:141`, `BuildSystem.cs:213` and
`DeconstructSystem.cs:489` publish a `SpaceTopologyChangedEvent` (or reuse
`TileChangedEvent`) instead of calling `sim.Rooms.MarkDirty()`. `RoomState` subscribes.

**What it buys.** Cuts the economy's game-specific site count from six to three, and removes
the economy's only *write* into ship systems. After this the economy's remaining ship
coupling is one hull predicate and one temperature read.

**What it risks.** Ordering. `MarkDirty` today is synchronous within the tick and
`AtmosphereSystem` reads the flag later in the same tick (`SystemStack.cs:37` puts
Atmosphere **first**, so a same-tick reflood is already a next-tick effect — verify that
before assuming). If an event defers the reflood by one tick, **the pins move** and this
stops being pin-neutral. Verify with a probe before committing; if it defers, either keep
the direct call or accept a documented re-pin. **Do not batch this with step 1.**

### Step 5 — Close the un-def'd economic literals. `M`. **~half a day per literal.**

`DigJobSource.DigWorkTicks` → `mining.def`; `BuildSystem.FloorMaterialCost` /
`FloorConstructTicks` → `BuildDefs`. Each is one def field under the ONE-commit rule
(default + `CreateDefault` initialiser + parser `case` + checksum `Combine` appended at the
**tail** per `SimDefs.cs:699-701` + `.def` line + a `DefsEquivalenceTests` divergence test).
**Each moves the defs checksum** — which, per §0.2, is not gate-pinned, so the cost is
updating `CLAUDE.md`/`MECHANICS.md`, not a CI break. Behaviour is unchanged if the def value
equals the literal.

**What it buys.** Tuning has one home; the biggest labour number in the game stops being a
`const`. This is a maintainability win, **not** a portability win (§5) — do not oversell it.
It is also already on the roadmap as `TODO(E-MINE/E3)`, so the honest move is to let E-MINE
do it rather than spend a lane here.

### Step 6 — Give `ContentSet` a runtime consumer, or delete it. `M`. **~half a day either way.**

Pack layering is live, correct, tested and unreachable (§0.2). Either have
`hosts/tui/SimHost.cs:243-266` go through `ContentSet` (which also gets the three hosts off
two near-duplicate loaders — `SimHost.cs:243` and `Program.cs:465` are near-copies), or
delete `Sim.Content` and stop paying to maintain a dead path. **Add a `MECHANICS.md` §13
entry either way.** Wiring it is the better call: it is the only mod-support surface in the
repo and it is 330 lines already built.

### Step 7 — DEFER. `P`, and the expensive one. **~3 weeks. Do not start.**

Extracting a reusable economy library — an `IWorker` interface replacing `Citizen`, a
spatial abstraction replacing `Int3`/`World` in the job seam, stockpile zones out of
`TileFlags`, a separate assembly with its own tests.

**Why not:** §8 does the arithmetic. In short — the tile-grid weld is in the seam
(`IJobTileScanner.VisitTile`), so a non-tile game gets nothing from it; a tile-game gets
most of the value from copying the files; and Garvin has not said what the next game is, so
this is 3 weeks spent on a specification that does not exist. **Revisit only when the next
game is named and is a tile-based colony sim.**

---

## 8. Ranked by payoff-per-cost, and the honest verdict

### 8.1 The ranking

| rank | step | cost | serves | payoff |
|---|---|---|---|---|
| 0 | **Step 0** — write down the boundary rule | **free** | P | the only thing that would have changed the last port's outcome; applies to game 2, not this one |
| 1 | **Step 2** — architecture test | **1 hour** | M + P | protects the only proven asset; mechanises 5 invariants held by memory |
| 2 | **Step 1** — the work seam | 1–2 days | M + P + **E2** | one rule in one place; unblocks the binding principle; ~free because E2 needs it |
| 3 | **Step 6** — wire or delete `ContentSet` | half a day | M | stops maintaining a dead path; unifies two loaders |
| 4 | **Step 4** — `MarkDirty` → event | 2 hours | P | 6 game-specific sites → 3 |
| 5 | **Step 3** — real `.csproj` | 1 day + risk | M + P | compiler-enforced layering; assembly-level reuse for game 2 |
| 6 | **Step 5** — close literals | half a day each | M | tuning has one home (let E-MINE do it) |
| ★ | **Not a step — restore a `Sim.Dsl` unit suite** (§8.5) | uncosted | M + P | the repo's best portable asset currently has zero direct lexer/parser coverage |
| — | **Step 7** — extraction | **3 weeks** | P | **negative until the next game is named** |

**The cheapest thing that pays for itself immediately is step 2**, unambiguously. One hour,
one test file, no production change, no pin risk. The layering in §1.2 is this repo's most
valuable portable asset and it is currently guaranteed by nothing but whoever remembers.
This project has already been wrong in writing about its own behaviour repeatedly (a
retraction is in progress right now); relying on memory for its best invariant is the
mismatch worth fixing first.

### 8.2 Say it plainly: for the economy, it is less than you'd hope

**The economy is not a reusable asset and making it one is a bad trade.** Concretely:

- The real economy is ~2,640 code lines, of which the *ideas* — 7 item kinds, 3 recipes,
  a build cost, a wall recovery fraction — are a morning's work to retype. There is not much
  code there to save.
- The valuable part of it is the **dispatcher's arbitration contract** (`IJobSource.cs:14-36`:
  one global argmin, strict `<`, registration-order tie-break, generation stamps, the tight
  retry bound, reservation ownership). That is ~650 lines and it is genuinely hard-won —
  it is also **welded to a tile grid in the interface itself** (`IJobSource.cs:195`,
  `JobSystem.cs:182-197`).
- So: **useful only if the next game is a tile-based colony sim, and in that case copying it
  is nearly as good as abstracting it** — and copying does not put a second game's balance
  on the same code path as this one.
- The port evidence cuts both ways and should be read honestly. It shows the economy *is*
  portable across engines (§2.5, nothing dropped) — but that is not the question, because the
  game was the same game. What it also shows is that the job board is the one substantial
  economy file already **restructured once** (W0-4), with three planned E-lanes queued to add
  sources to it. Betting three weeks on abstracting the file most likely to change again is
  backwards.
- And §2.6 is the cost nobody budgets: the last time this author moved code, the *tests* did
  not come. An extraction that produces a library without its golden fixtures and `ci.sh`
  produces the appearance of reuse, not reuse.

**A specific version of the trade the brief asked for: step 7 is ~3 weeks to save maybe
1 week on the next game, and only if that game is a tile colony sim. Don't.**

### 8.3 The two branches, since the next game is unnamed

**If the next game IS a tile-based colony sim** (~4,000 LOC lifts, maybe 3 weeks saved):
`Int3` + `ZLevel` + `World` + `TileDefs` + `PathService` (~550), `Jobs/` (~650),
`ItemStack`, the `BuildSystem`/`BuildJobSource` stage-then-work pattern (~770),
`MachineWearSystem` (421 — the one economy file to lift deliberately), `Sim.Glyph` (~750) —
plus the substrate and `Sim.Dsl`. Mechanism: glob the substrate + `Sim.Dsl` from a shared
checkout; **copy** the economy and let it diverge. **Copy the tests and `ci.sh` with it** —
§2.6 is what happens otherwise. Then step 7's abstractions become worth designing, informed by
two real users instead of one hypothetical.

**If the next game is any other kind of simulation** (~4,200 LOC lifts, and none of it is
economy): the substrate (~1,500) and `Sim.Dsl` (2,679) and nothing else. `World`,
`PathService`, `Sim.Glyph` and the entire job board go to zero, because "a job board over a
tile grid" *is* the economy here. **In this branch the economy's reuse value is
approximately nil, and no amount of refactoring changes that** — the reusable thing would be
the *pattern* (a dirty-flagged derived board with pluggable sources, generation stamps and a
strict argmin), which transfers as a document, not as code. If this is the likely branch,
the highest-value portability act is not a refactor at all: it is **writing the substrate's
conventions down as a reusable checklist** — the hash-move ritual, the def-field ONE-commit
rule, the golden-pin gate, the zero-alloc board pattern — and copying `ci.sh`.

### 8.4 On not freezing feature work

The brief asks whether a big-bang extraction justifies pausing E0-4/E0-6+. **It does not,
and the structure of the repo is why.** §1.8 establishes that economy file moves are
pin-neutral, so there is no "pay the re-pin once, in one big batch" argument to make — the
usual justification for a big-bang refactor is absent here. Meanwhile E0-4 is mid-flight
across three sibling worktrees in exactly the files an extraction would move
(`Stock/StockZoneSystem.cs`, `Jobs/Sources/HaulJobSource.cs`), and E0-4 will *change the
shape of the thing being extracted* — it moves stockpile zones out of `TileFlags` into a
registry, which is one of the couplings §1.6 flags. **Extracting before E0-4 lands would
abstract a design that is being replaced this week.**

The right shape is the opposite of a big bang: **step 2 now (it conflicts with nothing),
step 1 right after E0-4 merges, steps 3/4/6 in a quiet window between E-lanes, step 5
folded into E-MINE, step 7 never — until the next game is named.**

### 8.5 One thing that is not in the plan but should be said

The best portability work available is not a refactor. It is that **`Sim.Dsl` — 2,679 lines,
**16 of 16 files byte-identical across the port**, a two-method seam
(`DeviceRegistry.cs:10-21`), zero sim references in ~1,300 of them — is probably worth more to
a future game than the entire economy, and nobody is treating it as an asset.** A
player-facing scripting language with diagnostics, an audit trail, step budgets, persistence
and an in-game editor is a multi-week build from scratch and is reusable in literally any
game. If Garvin wants one concrete synergy to plan around, **"every future game ships with
MOSS" is a stronger bet than "every future game shares an economy."**

It costs nothing today, because it is already portable. What it needs is three cheap things:
a `docs/` note saying it is an asset; step 2's assertion that it may not acquire new
`Sim.Core` dependencies; and — the one with real cost — **its test suite back.**

I measured this rather than leaving it as a worry, and it is worse than §2.6 implies:

| | moonbase | here |
|---|---|---|
| dedicated MOSS test files | **8** (`MossLexerTests`, `MossParserTests`, `MossRuntimeTests`, `MossErrorTests`, `MossPersistenceTests`, `MossAuditTests`, `MossAllocationTests`, `MossIntegrationTests` + `FakeDevice`) | **0 — all nine absent** |
| LOC | **1,105** | — |
| MOSS tests | **37 dedicated unit tests** | **25**, spread across `DesignerRuleTests` (9), `WebMossTests` (12), `MossApplyContractTests` (4) |
| direct lexer / parser coverage | yes | **none** |

So the repo's most valuable portable asset — 2,679 lines of language implementation — has
**zero direct unit coverage of its lexer and parser**, and what coverage exists is
integration- and wire-level. That is not a portability problem, it is a live correctness
problem that happens to also destroy the asset's reuse value: nobody sensibly lifts a parser
into a second game on the strength of 12 WebSocket tests.

**Restoring a `Sim.Dsl` unit suite is the highest-value item I found that is not in the plan
above.** I have not costed it (I did not read the moonbase suite's contents, only its size and
test count), so it belongs as a scoped follow-up rather than a numbered step — but of
everything in this document it is the item I would argue hardest for after step 2.

---

## 9. Summary table — generic vs welded, for a reader in a hurry

| economy concept | where | genuinely generic | welded to THIS game by |
|---|---|---|---|
| items & stacks | `ItemStack.cs` | the stack shape (`Kind`/`Count`/`Pos`/`CarriedBy`/`ReservedBy`) | `ItemKind` is a 7-member C# enum; `Pos` is `Int3`; no stack-size cap |
| reservations | `JobContext.cs:40-44`, `ItemStack.ReservedBy` | **fully generic** — owner-scoped uint, post-B-1 | nothing |
| job board + pluggable sources | `Jobs/` | the dirty-flag/derived-board/argmin/generation-stamp pattern | `IJobTileScanner.VisitTile` puts tiles **in the seam**; `Simulation` is passed everywhere; `Citizen` is concrete |
| hauling | `HaulJobSource.cs` | pickup→deliver two-phase with reservation graduation | destination is a `TileFlags.Stockpile` bit; `ItemKind.Corpse` special-cased at `:73`; **does not know about decks** |
| stockpiles with filters | `TileFlags.Stockpile` (`TileDefs.cs:13`) | the idea | it is a **bit in the tile plane**, 1 bit left; E0-4 is fixing this |
| recipes / production graph | `ProductionDefs.cs`, `SimDefs.Recipes` | the node/port/bill model, integer-ratio-only, source-refusing | keyed by `DeviceKind` enum; ordinal-0 selection hard-coded (`:194`); ships empty |
| stage-material-then-work | `BuildSystem` + `BuildJobSource` | **the pattern is very generic** | site identity IS `Int3 Pos`; material is `const ItemKind.Regolith` (`BuildSystem.cs:58`) |
| wear / maintenance | `MachineWearSystem.cs` | **nearly fully generic** (8 % changed across the port) | environmental modulator is `sim.Rooms.RoomAt(...).TemperatureK` (`:59,62`) |
| deconstruct yields | `DeconstructSystem.cs` | recover a fraction, scaled by condition | yield item kinds are `const` (`:91,96`); `IsPressureHull` (`:251`) is irreducibly a spaceship |
| the actor | `Citizen.cs` | — | **no `IWorker` interface**; economy reads 7 concrete fields and drags faction/health/morale/hunger/thirst/fatigue/mood along |
| **mood + skill → throughput** | — | — | **does not exist.** No skill in `sim/` at all; 5 copies of `--JobWorkTicks`; binding principle unbuildable as-is (§6) |

---

*Written by an audit lane. No production code, test, def or content file was modified. The
only artefact is this document.*
