# PERILUNE — Technical Design Document

*Unity 6 (6000.5.4f1), URP 17.5, macOS-first desktop. Companion docs: [SIMULATION_ARCHITECTURE.md](SIMULATION_ARCHITECTURE.md) (philosophy authority — where documents conflict, it wins on philosophy, this one on mechanism), [GDD.md](GDD.md), [LLM_CITIZENS.md](LLM_CITIZENS.md), [MOSS_SPEC.md](MOSS_SPEC.md), [REQUIREMENTS.md](REQUIREMENTS.md). See the Revision log at the bottom for the three design pivots this document tracks.*

---

## 1. Overall Architecture: Deterministic Plain-C# Sim Core

**Decision: a plain-C# simulation core with zero UnityEngine dependencies, running on a fixed tick, with Unity as a presentation/input shell.**

| Criterion | Plain-C# core | DOTS/ECS | MonoBehaviour-centric |
|---|---|---|---|
| EditMode tests without player | Excellent — pure .NET, can run under `dotnet test` | Poor–fair; ECS worlds need Unity runtime | Poor; sim entangled with scene lifecycle |
| Determinism (saves/replays) | Full control: fixed tick, owned RNG, defined iteration order | Possible but chunk iteration order fights you | Practically impossible |
| Speed controls (pause/1x/3x) | Trivial: run N ticks per frame | Doable | Painful (timeScale leaks) |
| LLM async integration | Clean: inbox/outbox queues at tick boundary | Awkward (managed async vs Burst) | Easy but nondeterministic |
| AI-assistant-written code | Ideal: plain idiomatic C# | Worst: Burst/ECS idioms, API churn | Fine but degrades into spaghetti |
| Raw throughput | Enough: ~200 citizens on a small grid | Overkill by ~100× | Enough |

DOTS is rejected because its payoff (100k+ entities) is irrelevant at this scale and its costs hit every axis this project cares about. MonoBehaviour-centric is rejected because breadth-first system building demands headless stress tests from week one.

**Threading model:** the sim is single-threaded per tick (determinism by construction). The architecture reserves one future exception: pathfinding may move to worker threads as a *pure function* of an immutable-during-tick grid snapshot, joined before tick end — but the shipped `PathService` is synchronous and preallocated, which is ample at current scale (§3.9). The sim runs on the main thread, driven by `SimRunner : MonoBehaviour`; the view reads sim state between ticks — no locks needed. If tick cost ever exceeds budget, the sim can move to a dedicated thread with a double-buffered view snapshot — the architecture permits it; do not start there.

**World model (side-section pivot, 2026-07-18, user-approved):** the ship is simulated and shown as a **2D side cross-section** (Oxygen-Not-Included topology): world x = ship length, z = decks, and the beam axis is abstracted to a single interior row at **`y = 1`** — each deck level is three rows tall, with solid hull rows at y0/y2 so a one-room-deep deck can hold pressure (`RoomState` treats out-of-bounds as vacuum). The side view IS the simulation truth — no hidden beam axis. Consequences, all live in code:
- **Machines are passable** — crew steps around them in the abstracted depth; doors remain the only dynamic blockers. Every current `MachineDef` has `Blocks = false`; the flag stays for genuinely bulky exceptions.
- **Conduits and pipes are utility overlays** (`Simulation.IsUtilityOverlay`): service-tray runs that share tiles with machines and never enter the tile grid or `HasDevice` flags, with **vertical risers** connecting decks (network floods span z).
- **Ladders/lift shafts are the deck-to-deck crew paths** (ladder z-links in `PathService`).
- The earlier isometric renderer (`WorldPresenter`/`CameraRig`) is retained as the basis of the future **Detail view**.

**Core loop contract:**

```csharp
// Sim.Core — no UnityEngine anywhere
public sealed class Simulation {
    public const int TicksPerSecond = 10;          // 100 ms fixed tick
    public World World { get; }
    public EventBus Events { get; }
    public void Tick();                              // advances exactly one tick
    public void EnqueueCommand(ISimCommand cmd);     // player/UI/LLM input, applied at next tick start
    public ulong StateHash();                        // xxHash64 of canonical state, for tests/replays
}
```

`SimRunner` uses a time accumulator: `accum += Time.deltaTime * speed; while (accum >= 0.1f) sim.Tick();` where `speed ∈ {0, 1, 3, 10}` (cap ticks-per-frame to avoid spiral of death). All player input becomes `ISimCommand` records (e.g. `DesignateDigCommand`, `SetScriptSourceCommand`) — this single choke point is what makes saves, replays, and LLM effects uniform.

## 2. Project / Code Structure

Assembly definitions (all under `Assets/`), with `noEngineReferences: true` on the two Sim assemblies. This is the tree as built:

```
Assets/
  Scripts/
    Sim.Core/          Moonbase.Sim.Core.asmdef       (noEngineReferences: true)
      World/           World.cs, ZLevel.cs, TileDefs.cs, AsciiWorld.cs, Int3.cs
      Entities/        Citizen.cs, Device.cs, ItemStack.cs, EntityStore.cs, MachineDefs.cs
      Systems/         AtmosphereSystem.cs, PowerSystem.cs, ThermalSystem.cs, WaterSystem.cs,
                       CitizenSystem.cs, SustenanceSystem.cs, CraftingSystem.cs,
                       MachineWearSystem.cs (Wear + Maintenance), HydroponicsSystem.cs,
                       NeedsSystem.cs, ExplorationSystem.cs, HistorySystem.cs
      Jobs/            JobSystem.cs
      Rooms/           RoomState.cs
      Path/            PathService.cs
      Events/          EventBus.cs, SimEvents.cs
      Commands/        ISimCommand.cs, Commands.cs
      Save/            SaveWriter.cs, SaveReader.cs, IStatefulSystem.cs, ScriptEntry.cs
      Rng/             SimRng.cs                       (xoshiro256**)
      Hash/            XxHash64.cs
      Simulation.cs, SystemStack.cs, ShipMetrics.cs, ISimSystem.cs
    Sim.Dsl/           Moonbase.Sim.Dsl.asmdef        (refs Sim.Core; noEngineReferences: true)
      Lexer.cs, Token.cs, Parser.cs, Ast.cs, MossCompiler.cs, CompiledScript.cs,
      Interpreter.cs, DslValue.cs, DeviceRegistry.cs, ScriptRuntime.cs, Diagnostics.cs
    Game.View/         Moonbase.Game.View.asmdef      (refs Sim.Core, Sim.Dsl)
      Bootstrap.cs, SimRunner.cs, WorldPresenter.cs, CameraRig.cs, TilePicker.cs,
      DebugHud.cs, TerminalHud.cs, SaveController.cs, ExteriorVista.cs,
      Moss/DeviceAdapters.cs
    Editor/            Moonbase.Editor.asmdef          (BatchTools.cs — headless utilities)
    Tests/
      EditMode/        Moonbase.Tests.EditMode.asmdef (refs Sim.Core, Sim.Dsl, Game.View)
      PlayMode/        Moonbase.Tests.PlayMode.asmdef (refs everything)
tools/
  ScenarioRunner/      standalone net8.0 csproj — compiles Sim.Core + Sim.Dsl sources
                       by glob; headless years-per-minute harness (§8)
```

Notes on the roster:
- **No separate `Game.UI` assembly yet** — the current HUDs (`DebugHud`, `TerminalHud`) are IMGUI stand-ins living in `Game.View`; a real UI assembly splits out when the UI shell lands.
- **`Game.View` composition:** `Bootstrap` assembles the whole game from code at play start (authored side-section ship, devices, utility overlays, crew, MOSS runtime, camera, HUDs — no scene wiring), and owns the teardown/rebuild path used by loading. `SimRunner` drives ticks; `SaveController` does F5/F9 + rotating autosaves; `ExteriorVista` is the greybox orbit view; `Moss/DeviceAdapters` bridges sim devices/rooms to `IScriptable`. The **side-view component set — `SideViewPresenter`, `SideCamera`, `SidePicker`, `GameHud` — is in flight (2026-07-18)**; until it lands, `WorldPresenter`/`CameraRig`/`TilePicker` render the iso view, and they are retained afterwards as the basis of the future Detail view.
- **`Moonbase.Llm`** (refs Sim.Core only; `IChatBackend`, Anthropic/Ollama/Template backends, `LlmService`, `PromptBuilder` — see LLM_CITIZENS.md) is **in flight (2026-07-18)**; the design below (§7) is unchanged.

Dependency rule (enforced by asmdef references): `Sim.Core ← Sim.Dsl ← Game.View`; `Llm` sees only `Sim.Core`; nothing references `Game.*` from below. **`Sim.Core` and `Sim.Dsl` never import UnityEngine** — use own `Int3` (x, y, z tile coord) and float math types.

Conventions: `Moonbase.*` root namespace matching folders; systems named `*System`, view classes `*Presenter`/`*Controller`; sim data is fields/plain properties, no LINQ in tick paths; events are `readonly struct *Event`; commands are `*Command`.

Housekeeping (done at Phase 0): delete `Assets/TutorialInfo`, remove `com.unity.visualscripting` and `com.unity.multiplayer.center` from the manifest, repo under git with a Unity `.gitignore`.

## 3. Sim Core Design

### 3.1 Tick scheduling
Base tick 10 Hz. Each system declares `IntervalTicks`; `Simulation.Tick` dispatches at fixed cadences (tick multiples, so speed changes are trivial). The one authoritative registration order is **`SystemStack.CreateDefault`** — Bootstrap and the headless ScenarioRunner both build from it, so the shipping game and the determinism harness can never diverge. The current roster:

| System | Cadence | One line |
|---|---|---|
| Command inbox apply | every tick, first | player + MOSS + (future) LLM effects, arrival order |
| Room recompute (`RoomState.RecomputeIfDirty`) | owned tick phase, after commands, before systems | derived room state refreshed before any system reads it — no consumer depends on which system recomputes first |
| Atmosphere | every 2 ticks (5 Hz) | lumped per-room gases; flow across open door edges; vents/scrubbers; room 0 = vacuum sink |
| Power | every 10 ticks (1 Hz) | conduit connected-component networks (rebuilt on `PowerDirty`), tiered brownout shedding, batteries |
| Thermal | every 5 ticks (2 Hz) | per-room heat nodes: machine waste heat + body heat in, radiators/door conduction/hull loss out — the cascade backbone |
| Water | every 5 ticks (2 Hz) | pipe networks mirroring the conduit rule; reclaimers refill tanks from the greywater pool |
| Citizen | every tick (10 Hz) | path following tile-to-tile, idle wander; view interpolates |
| Jobs | every tick (10 Hz) | dig designations + hauling to stockpiles from a derived job board |
| Sustenance | every 10 ticks (1 Hz) | idle citizens self-serve food/water past need thresholds; thirst outranks hunger |
| Crafting | every 10 ticks (1 Hz) | standing bills at powered workstations (recycler/fabricator/machine shop); recruits idle citizens |
| Wear | every 10 ticks (1 Hz) | operating machines lose Condition; heat >35 °C accelerates up to 3×; crossing `FailBelow` = emergent failure + alarm |
| Maintenance | every 10 ticks (1 Hz) | standing rule: neediest machine below `MaintainBelow` gets a servicer; Parts = full overhaul, none = jury-rig |
| Hydroponics | every 10 ticks (1 Hz) | grow beds turn power + water + time into potatoes; progress holds when dark/dry/broken |
| Needs | every 10 ticks (1 Hz) | breathing environment (hypoxia/CO2 narcosis/vacuum) can kill; hunger/thirst/fatigue accumulate |
| Exploration | every 10 ticks (1 Hz) | fog of war: living citizens reveal their compartment + its shell; Explored is a saved tile flag |
| History | every 10 ticks (1 Hz) | historical layer v0: alarms + deaths become day-stamped entries (the event log's data source) |
| MOSS ScriptRuntime | every tick, last | `every`/`when`/`alarm` triggers, budgeted; actuates via commands |

Systems tick in a fixed, explicit order (the `SystemStack` array), never by reflection or event timing — order is part of determinism and is load-bearing (Sustenance/Crafting/Maintenance after Jobs so earlier systems get first pick of idle citizens; Hydroponics after Water; Needs after everything that moves people; MOSS last). `StateHash` remains the determinism canary in tests and dev builds.

### 3.2 World data model
Side-section world (§1): tests build tiny ASCII maps via `AsciiWorld`/`SimHarness`; the authored MSV Perilune is **96 × 3 × 3** — x = ship length, z = decks (z0 lower), y = the three-row deck cross-section with the single interior row at `y = 1`. Same data model at any size. Flat SoA arrays per z-level:

```csharp
public sealed class ZLevel {
    public ushort[] Floor;      // TileDefId, 0 = void/rock
    public ushort[] Wall;       // 0 = none
    public byte[]   Flags;      // Walkable, BlocksGas, HasDevice, Designated...
    public ushort[] RoomId;     // 0 = outside/vacuum
    public ushort[] RegionId;   // pathfinding region (per 32x32 chunk connectivity)
    // index = y * width + x
}
```

Tile *definitions* (`TileDef`: id, name, walkable, gasBlocking, buildCost…) live in a `TileDefs` static catalog in Sim.Core, keyed by stable ushort ids; the view maps the same ids to prefabs (§5). Never store prefab references or names in sim state.

### 3.3 Entities
Plain C# classes per archetype — no generic ECS. Entity ids are monotonically-assigned `uint`s (never reused within a save). `EntityStore<T>` = `List<T>` for deterministic iteration + `Dictionary<uint, T>` for lookup. Archetypes: `Citizen` (needs, path state, job fields), `Device` (a `DeviceKind` enum — doors, vents, scrubbers, ladders, terminals, solar wings, batteries, conduits, lights, grow beds, tanks, pipes, reclaimers, fabricators, machine shops, salvage recyclers, radiators — plus a small state union: `IsOpen/IsLocked/Powered/Rate/StoredKWh/StoredLiters/Progress/Condition/NetworkId/FluidNetworkId`), `ItemStack`, `Room` (derived, §3.5); power/fluid networks are derived ids on devices. At ~200 citizens + a few thousand devices/items, class overhead is irrelevant; clarity wins.

Three identity/staleness mechanisms worth naming:
- **`MachineDefs` data table:** one row per `DeviceKind` — power draw, generation, tier, blocks-movement, waste heat, wear/hour, `MaintainBelow`, `FailBelow`. Atmosphere/Power/Thermal/Wear all read exclusively from here (SIMULATION_ARCHITECTURE: data-driven definitions); v0 keeps the table in code as a single authoritative array — a file loader can replace the initializer without touching any consumer.
- **`Citizen.ReservedItemId`:** the exact stack a citizen reserved for its current job. `Simulation.CancelJob` releases *that* reservation and never a co-located stranger's — two reserved stacks can share a tile, so position is not identity.
- **`Simulation.DeviceTopologyVersion`:** bumped on any device add/remove — a cheap staleness check for derived topologies (WaterSystem's fluid networks) that don't own `PowerDirty`.

### 3.4 Event bus
Typed, double-buffered, deterministic:

```csharp
public sealed class EventBus {
    public void Publish<T>(in T e) where T : struct, ISimEvent;   // appended to current-tick buffer
    public ReadOnlySpan<T> Read<T>() where T : struct, ISimEvent; // events from *previous* tick
}
```

Systems read last tick's events, publish this tick's; buffers swap at tick end. No delegates/subscriptions in the sim (callback order is a determinism hazard) — systems *pull*. The view drains a separate render-event queue (`RoomBreachedEvent`, `TileChangedEvent`, `AlarmRaisedEvent`) after each tick for VFX/audio/UI; view reading never mutates sim.

### 3.5 Rooms
`RoomState` maintains room assignment (`ZLevel.RoomId`) and the room list, recomputed by flood fill when topology changed (walls/doors/floors edited set the dirty flag). The recompute is an **owned tick phase**: `Simulation.Tick` calls `Rooms.RecomputeIfDirty` after the command inbox and before any system runs, so no consumer depends on which system recomputes first. Door state is *not* a room boundary change — door tiles are flow edges, marked `DoorMarker`, never room members. Rooms store tile count, gas moles (O2, CO2, N2) and temperature; volume/pressure derive from tiles (P = nRT/V, 2.5 m³/tile). Room 0 is "outside" (infinite vacuum sink; regions touching void join it). Gas is remapped by tile overlap on recompute, so merges/splits conserve moles. **Named room anchors** (`RoomAnchor { Name, Probe }`) are sim state and the MOSS room namespace (`hab1.o2`): an anchor names whatever room contains its probe tile, so it survives recomputes by construction.

### 3.6 Atmosphere
Lumped per-room model, no cellular gas — cheap and plausible:
- Each room: `float O2Moles, CO2Moles, N2Moles, ThermalEnergy`. Pressure = `n·R·T / V` (simplified constants; display in kPa/%/ppm).
- Each atmosphere tick (5 Hz), flow happens across **open door edges**: transfer `Δn = k · (P_a − P_b) · dt`, clamped; k tuned so a hab drains to vacuum in ~40 s through one open edge — dramatic but survivable. Composition transfers proportionally. Regions merged by wall removal equalize instantly via room recompute (§3.5).
- Breach = edge to Room 0. Citizens breathe (consume O2, emit CO2) into their current room; vents inject breathable mix, scrubbers remove CO2 — Devices that transform room contents, gated on `Powered` and `IsOperational`. Numeric targets per GDD §5.
- Temperature is owned by **ThermalSystem** (2 Hz), the cascade backbone: per-room heat nodes with capacity `TileCount × 53 kJ/K` (air + coupled structure mass); sources are machine waste heat (`MachineDefs.HeatKW`) and citizen body heat; sinks are radiators, door-edge conduction (closed doors conduct 5× slower) and hull loss toward the 3 K space sink. Joules accumulate into a scratch buffer and apply once per pass, so within-pass ordering can never bias flow direction. Consequences by design: derelict sections freeze over days; a room whose machines outrun its radiators cooks — and hot rooms grind their machines (§3.1 Wear).

This is O(door edges + rooms) — hundreds of ops per pass.

### 3.7 Power, water and the greywater loop
`PowerSystem` maintains networks as connected components over conduit tiles (utility overlays, §1); any device on or 4-adjacent to a component's conduit belongs to it. Rebuilt lazily when `PowerDirty` is set by construction/destruction (flood fill on the conduit graph, spanning deck risers — cheap at this scale). Each balance pass (1 Hz): sum generation, sum demand by priority tier (LifeSupport > Defense > Industry > Comfort), charge/discharge batteries, set `device.Powered` flags; brownouts shed lowest tier first (this powers the emergency-lighting look). Devices on no network are unpowered.

`WaterSystem` (2 Hz) mirrors the conduit rule exactly with Pipe tiles — same deterministic store-order flood, staleness via `DeviceTopologyVersion` (§3.3). Reclaimers top up the least-full tank on their network; consumers (grow beds, later crafting) draw via `TryDrawWater`; citizens drink at a specific tank in person (SustenanceSystem — that path skips network membership). No cellular fluids.

**Greywater conservation law:** water is never created, only cycled with losses. Drinking and grow-bed transpiration (~80% of irrigation recaptured as condensate) feed a global greywater pool (`Simulation.WastewaterLiters`, saved in the header); reclaimers convert it back to tank water at **93%** (ISS-class closure, GDD §5). The 7% loss is the slow leak the colony must eventually make up.

### 3.8 Jobs & labor
RimWorld-shaped, built as two cooperating patterns:
- **`JobSystem`** (every tick) owns dig designations and hauling to stockpiles. The job board is *purely derived* state — rebuilt from world + entity stores whenever `Simulation.JobsDirty` is set, never serialized. Per-citizen job progress lives on the citizen itself (`JobKind`/`JobTarget`/`JobWorkTicks`/`CarryingItemId`/`ReservedItemId`), so saves need nothing from the system class.
- **Recruiting systems** (Sustenance, Crafting, Maintenance, all 1 Hz, registered after JobSystem) don't post to a board — each recruits `JobKind.None` citizens directly and stamps them (`Eat`/`Drink`/`Craft`/`Maintain`), binding worker to target via `JobTarget` (one servicer per station/machine). Everything re-validates from ground truth at each settled moment, so `Simulation.CancelJob` (player redirects, death) needs no system-specific reservation bookkeeping — dropped cargo re-enters the pool and standing rules re-recruit.

Determinism rules shared by all of them: store-order iteration, nearest-by-Manhattan with strict `<` (ties resolve to store order), canonical `Neighbor4` staging order, no RNG, no LINQ, zero allocation in the steady state.

### 3.9 Pathfinding
`PathService` is a synchronous, fully preallocated grid A*: 4-directional plus ladder z-links, door-aware through the single shared walkability rule `Simulation.IsWalkable` (pathing, movement stepping and job approach checks can never drift apart). At side-section scale (96×3 per deck, a handful of citizens) this is ample. The original two-level design — region-graph reachability, threaded pure-function solves joined before tick end — remains the upgrade path if profiling ever demands it; the API is shaped so it can slot in without callers changing.

## 4. MOSS Implementation (Sim.Dsl)

Full language spec: [MOSS_SPEC.md](MOSS_SPEC.md). Implementation notes:

- Hand-written, zero dependencies: `Lexer` → `Token { Type, Text, Line, Col }` list (INDENT/DEDENT like Python) → recursive-descent `Parser` (Pratt for expressions) → `Ast` node classes → direct AST-walking `Interpreter` (no bytecode in v1; scripts are tiny). Values: `readonly struct DslValue { Kind; double Num; bool Bool; string Str; }`.
- `CompiledScript` = AST + resolved device references + list of `Trigger { EveryNTicks | WhenExpr }`.
- **Device binding:** `DeviceRegistry` (Sim.Dsl, backed by Sim.Core stores) maps player-assigned names → `EntityId` (players name devices in the inspector UI; rooms auto-named `hab3` etc., renameable). Devices expose:

```csharp
public interface IScriptable {                    // implemented by Device, Room adapters
    bool TryGetProperty(string name, out DslValue v);   // "o2", "pressure", "open", "rate"
    bool TryInvoke(string verb, ReadOnlySpan<DslValue> args, out DslError err); // "open","close","set"
}
```

- Name resolution at compile time where possible; renames/deletions degrade to a runtime error surfaced in the terminal, not a crash.
- **Sandboxing:** `ScriptRuntime` (a sim system, last in the stack) runs one compiled program per terminal, in insertion order. Budget: **1,000 interpreter steps per script per tick, 50k global**; exceeding → the program halts *permanently* (until `SetProgram`) with `BudgetExceeded` and an in-game alarm. Runtime errors (unknown device/property, type mismatch, failed command) halt the program for *that tick only* — recorded, alarmed, re-run next tick (the device may reappear); other programs are unaffected. Actuator commands emit `ISimCommand`s rather than mutating directly.
- **Errors & hot reload:** `Diagnostics` carries `(line, col, message, severity)`; compile errors render inline in the terminal (program stored but never runs). Saving in the terminal recompiles at the tick boundary; an *edited* script gets fresh trigger state. Script *source text* is sim state (the canonical copy lives in `Simulation.Scripts`, saved in DSLS).
- **Persistence (`IStatefulSystem`, blob v1):** edge-trigger latches, `every`-timers and the halted flag are captured per program in the runtime's SYSS chapter, so a loaded sim behaves as if never interrupted — no phantom re-fires of already-latched `when` triggers, no re-phased `every` timers. Restore can arrive before programs are recompiled, so the blob is stashed and applied inside `SetProgram`, gated on an FNV-1a hash of the source: byte-identical source gets its saved state back, edited source starts fresh — the correct behavior in both cases. `StateChecksum()` folds the same latch/timer state into `Simulation.StateHash`, so the determinism canary sees system-internal state a bad restore would otherwise hide.
- **Audit log (GDD §6 — post-mortems are gameplay):** every executed actuator command, raised alarm and permanent halt lands in a per-terminal 64-entry ring buffer, readable via `GetAuditLog`. Transient per-tick runtime errors are deliberately *not* recorded (a missing device would refill the ring within 64 ticks and erase the history that matters). Audit entries survive `SetProgram` on the same terminal (terminal history) but are transient diagnostics — never saved.
- **Tests:** lexer/parser/runtime suites against a `FakeDevice` registry, allocation tests, audit tests, error-model tests, save/restore persistence tests, and full-loop integration tests (script + mini-world, assert the door opens on tick N).

## 5. View Layer

*Status note (2026-07-18): this section describes the isometric renderer built in M1–M4. After the side-section pivot (§1) the main view becomes a 2D side cross-section — `SideViewPresenter`/`SideCamera`/`SidePicker`/`GameHud` are in flight (2026-07-18) — and the iso renderer below is retained as the basis of the future Detail view. The presenter pattern, catalogs, and decoupling rules apply unchanged to both.*

- **Presenter pattern:** view holds no gameplay state. `WorldPresenter` subscribes to the render-event queue; `TileChangedEvent` marks a 32×32 chunk dirty; dirty chunks rebuild next frame.
- **Tile rendering:** modular prefab kit resolved through `TileVisualCatalog : ScriptableObject` (`ushort tileDefId → prefab/mesh + material variants`). Static tiles render via `Graphics.RenderMeshInstanced` batches per chunk (floors, walls) — no GameObject per tile. Devices and citizens are pooled GameObjects (they animate). Citizens: `CitizenPresenter` lerps between `PrevTilePos` and `TilePos` using tick interpolation factor from `SimRunner` — smooth motion at 10 Hz sim.
- **Z-slicing:** each z-level's renderables grouped per level. Active level `z`: levels `> z` hidden entirely; level `z` fully lit; levels `< z` rendered dimmed (global shader property `_ActiveSliceY` + darkening/desaturation in the kit's Shader Graph master). Wall-top cutaway on the active level via the same shader: clip fragments above `_ActiveSliceY + wallCapHeight` — the classic dollhouse cut. One master Shader Graph for the whole kit makes this a two-property problem.
- **Lighting:** all-realtime URP Forward+, and this is right for the game: no baked GI (the world is player-built/dug — baking is impossible anyway). Per-room light fixtures are Devices → light state driven by the power sim (powered/brownout/emergency-red/off). Shadows only on key lights; per-room light budget 2–4; `LightingDirector` culls lights on inactive z-levels and distant rooms. Volumetric feel via cheap tricks (shaft meshes, cookies, bloom, dust particles); optional purchased volumetrics at M5.
- **Camera:** **low-FOV perspective (18–22°), pitch ~50°, yaw 45° with 90° orbit steps.** Ortho gives perfect grid readability but flattens the dramatic lighting/parallax that sells the Dark Descent look; low FOV keeps near-isometric readability. `CameraRig` = pan (edge/WASD via `InputSystem_Actions`), zoom = dolly along view axis with clamped distance, z-level up/down keys.
- **Picking:** no physics needed for tiles — raycast the math plane `y = activeZ * levelHeight`, floor to tile coords (`TilePicker`). Devices/citizens picked via a slim collider layer, mapping collider → `EntityId` via a registry on the presenter.

## 6. Save / Load

- **Format: custom binary, chaptered.** `SaveWriter`/`SaveReader` in Sim.Core over `BinaryWriter` + `GZipStream`. File = **header v2** (magic `MBSV`, global version, tick count, next entity id, RNG state s0..s3, world dimensions, + `WastewaterLiters` since v2) + chapters `{ FourCC, ushort version, int byteLength, payload }`. Length-prefixed chapters let readers skip unknown chapters and let migrations target one chapter at a time. The current chapter roster:
  - `TILE` v1 — per z-level Floor/Wall/Flags/RoomId arrays. Flags saved verbatim (HasDevice/Designated/Explored included — the reader must NOT re-derive them); RegionId is derived, not saved.
  - `ROOM` v2 — room list (tile count, moles, temperature) + **named room anchors** (v2).
  - `CITZ` v3 — full citizen state incl. path; +`Thirst` (v2), +`ReservedItemId` (v3).
  - `DEVC` v3 — device state; +`StoredLiters`/`Progress`/`FluidNetworkId` (v2), +`Condition` (v3). `Powered`/`NetworkId` are derived but part of StateHash, so they're saved for immediate hash equality; `PowerDirty=true` after load rebuilds them anyway.
  - `ITEM` v2 — item stacks; +`Label` (v2).
  - `DSLS` v1 — MOSS script sources (terminal id + source, insertion order).
  - `SYSS` — one chapter **per `IStatefulSystem`**, keyed by system `Name` with a per-system blob version inside the payload: currently the MOSS runtime (latches/timers/halted, §4) and History (day-stamped entries).
- **Versioning & compatibility:** `RequireVersionUpTo` is the backward-compat policy — chapters at *older* versions load with defaults for the missing trailing fields (this is how v2/v3 fields were added without breaking v1 saves); *newer-than-known* chapter or global versions throw rather than misread. **The M3+ save-compatibility guarantee is active**: bump a chapter version by appending fields and defaulting on read; never reorder or repurpose existing fields. Derived state (region ids, power/fluid networks, job board, path caches) is rebuilt on load; atmosphere room contents ARE saved (not derivable).
- **Everything serializable lives in Sim.Core**, so a save is a pure function of `Simulation` — also the backbone of determinism tests (save→load→hash equality).
- **Autosave without hitches:** serialize on the sim thread between ticks into a pooled `MemoryStream` (~1–3 MB, ~2–5 ms — one skipped tick at worst), then compress + write to disk on a background `Task`. Rotate `autosave_0..2.mbsv`. Save path: `Application.persistentDataPath/Saves` (path passed in from the view layer — Sim.Core takes a `Stream`, never touches file APIs).

## 7. LLM Integration Seams

Hard rule: **the sim never awaits anything.** Two queues own the boundary (full design in [LLM_CITIZENS.md](LLM_CITIZENS.md)):

- Sim side: `LlmOutbox` (`ConcurrentQueue` of value-type `CitizenContext` snapshots — no live sim references cross the boundary) out; validated effects return as `ISimCommand`s in the ordinary command inbox, **applied only at tick start**.
- `LlmService` (plain C#) drains the outbox, builds prompts, calls the active `IChatBackend` with timeout and fallback chain (Anthropic → Ollama → Template). Responses parse into `CitizenEffect` records; `EffectValidator` rejects anything referencing invalid entities or illegal actions.
- Late/failed responses simply never arrive — citizens always have a deterministic utility-AI baseline, so LLM output is flavor/steering, never load-bearing. The sim is deterministic *given the command log*; replays record the command stream.
- **HttpClient over UnityWebRequest** for desktop: full async/await, SSE streaming, works in plain-C# assemblies and EditMode tests. Keep `Llm` free of UnityEngine so provider logic is unit-testable with a fake `HttpMessageHandler`.

## 8. Testing & Tooling

- **EditMode (the workhorse):** the suite stands at **113+ tests** across atmosphere, thermal, power/needs, jobs, food/water, crafting, maintenance, exploration, pathfinding, save/load round-trips, determinism twin-runs, and the full MOSS battery (lexer/parser/runtime/errors/audit/persistence/allocation). Sub-second each.
- **`SimHarness`** (EditMode test assembly): builds worlds from ASCII maps —
  `"########  #..D..#  ########"` → walls/floor/door — the single highest-leverage test utility for a grid game; every system test starts from a tiny ASCII scenario. (`AsciiWorld` itself lives in Sim.Core so the ScenarioRunner shares it.)
- **The allocation cop** runs the **full default `SystemStack`** (via `SystemStack.CreateDefault`, vents + power + a citizen active) for 1,000 ticks after warmup and asserts a zero `GC.GetAllocatedBytesForCurrentThread` delta — every system's zero-alloc claim is regression-protected, not comment-only.
- **`ShipSurvivalTests`** — the institutionalized ScenarioRunner lesson: the SHIPPING authored map (`Bootstrap.BuildAuthoredSim`) must keep its crew alive through a full headless sim-day — air held, water found, potatoes grown. This is the test that catches "all the doors spawned closed" (a real M3 review finding) and any future authoring regression like it.
- **`tools/ScenarioRunner`** (headless CLI, the SIMULATION_ARCHITECTURE deliverable — delivered): a standalone net8.0 csproj that compiles Sim.Core + Sim.Dsl sources by glob and runs the full system stack for days of sim-time at maximum speed, printing a daily status line and verifying twin-run determinism at exit. The dotnet SDK lives at `~/.dotnet`:
  ```bash
  ~/.dotnet/dotnet run --project /Users/garvin/Research/Code/moonbase/tools/ScenarioRunner -- --days 30 --seed 42
  ```
- **PlayMode (thin):** boot smoke test — scene boots, `SimRunner` ticks, presenter spawns visuals.
- **CLI on macOS (6000.5.4f1):** the editor is installed under `~/Documents`, **not** `/Applications`:
  ```bash
  # run EditMode tests headless
  /Users/garvin/Documents/6000.5.4f1/Unity.app/Contents/MacOS/Unity \
    -batchmode -nographics \
    -projectPath /Users/garvin/Research/Code/moonbase/moonbase \
    -runTests -testPlatform EditMode \
    -testResults /Users/garvin/Research/Code/moonbase/test-results.xml \
    -logFile -
  # compile check only
  /Users/garvin/Documents/6000.5.4f1/Unity.app/Contents/MacOS/Unity \
    -batchmode -quit -nographics \
    -projectPath /Users/garvin/Research/Code/moonbase/moonbase -logFile -
  ```
  (No `-quit` with `-runTests`; only one editor instance can hold the project — quit the GUI editor first. `Moonbase.Editor.BatchTools` adds `-executeMethod` utilities, e.g. Built-in→URP material conversion for the art kit.)
- **Solo workflow (no CI):** ScenarioRunner + EditMode suite before each milestone tag; `StateHash` compared across twin runs in permanent tests; determinism drift fails loudly, not silently.

## 9. Performance Budgets

- Frame: 16.6 ms @ 60 fps. **Sim tick ≤ 3 ms at 1×** (so 3× speed worst-case ≈ 9 ms/frame still leaves ~7 ms for rendering). Per-system: citizens 1.0 ms, pathfinding join 1.0 ms (off-main solve), atmosphere 0.2 ms, MOSS 0.3 ms, everything else 0.5 ms.
- Render: ≤ 6 ms main thread — instanced chunk batches, pooled device/citizen GOs, Forward+ with aggressive light culling.
- **GC rules (hot paths = anything inside `Tick()`):** no `new` per tick — pooled `List<T>`/arrays reused via `Clear()`, struct events, `stackalloc`/`Span` for scratch, no LINQ, no closures, no string concat (defer formatting to UI layer); pathfinding uses preallocated open/closed sets per solver thread. Enforcement: an EditMode test runs 1,000 ticks of a busy scenario and asserts `GC.GetAllocatedBytesForCurrentThread()` delta ≈ 0 after warmup — the allocation cop.
- Memory: world arrays are a few MB — trivial; headroom to grow without redesign.

## 10. Build Phases

- **M0 — Spine. DONE:** deterministic sim spine (Simulation/EventBus/SimRng/ZLevel/SimHarness) with passing headless tests, zero-alloc ticks, stable twin-run hash.
- **M1 — First playable slice. DONE:** greybox iso view, camera + picking + z-switching, one citizen with A* + click-to-move, rooms/atmosphere with a breachable door, minimal MOSS toggling a door from a terminal, PlayMode boot smoke test.
- **M2 — Skeletal breadth 1. DONE:** dig designations + JobSystem + hauling, PowerSystem with tiered brownouts, needs (a citizen dies in a vacuum), chaptered save/load with hash-equal round-trips, autosave; plus a 10-finding milestone review pass.
- **M3 — Skeletal breadth 2. DONE:** food (hydroponics→potatoes), water (pipes/tanks/reclaimers + greywater), crafting verticals (salvage→scrap→parts), fog of war, the authored MSV Perilune deck plan, MOSS depth (`when`/`alarm`, audit log, save persistence), headless ScenarioRunner, citizen lifecycle + room anchors + save format v2. Save-compatibility guarantee active from here.
- **M4 — "Depth of Matter" (re-scoped by the second pivot — depth before threats). DONE:** ThermalSystem (machine waste heat, radiators, hull loss, freeze/cook consequences) + machine condition (MachineDefs wear rates, heat-accelerated wear, emergent failure, MaintenanceSystem with overhaul/jury-rig) + M3 review fixes. Threats/occupation deferred — pirates become another pressure on an institution, not the core loop.
- **UI shell — in flight (2026-07-18):** the side-view interface per the approved concept sheet — `SideViewPresenter`/`SideCamera`/`SidePicker`/`GameHud` (ship cross-section stage, systems sidebar fed by `ShipMetrics`, event log fed by `HistorySystem`).
- **M5 — LLM citizens + aging:** `Llm` assembly (in flight, 2026-07-18) with the TemplateBackend end-to-end (outbox → effect → command inbox), then Anthropic/Ollama providers, conformant to LLM_CITIZENS.md and the SIMULATION_ARCHITECTURE rule (LLM = conversational interface, never the simulation); skills/experience, aging + calendar; art pass incl. first Detail View room.
- **M6 — Knowledge & History depth:** per-citizen skill/knowledge records, documentation artifacts (MOSS scripts, manuals), knowledge transfer (teaching, apprenticeship), historical records feeding memories/behavior; social layer per GDD.

**Balancing backlog** (known dev-rate placeholders, tuned with global time-scale work): grow-bed water draw rate, the 10-minute dev grow cycle vs. the GDD's 12-day potato (6× biology compression), and presenter chunking/instancing once the view faces full-ship entity counts.

Ordering rationale: M0's harness + determinism test exist *before* any gameplay so every subsequent system lands with tests; the second pivot moved matter-depth (thermal/wear) ahead of threats because it is the cascade backbone every later story depends on.

## 11. Asset Strategy

- **Kit:** buy a modular sci-fi interior kit (see `ASSET_SUGGESTIONS.md` at repo root) — requirements: 1-unit-grid-snappable walls/floors/doors, PBR/URP, trim-sheet based. Greybox until M5 regardless. All kit materials get re-parented onto the single master Shader Graph (slice/dim support, §5).
- **Decals:** URP Decal Projector (built into URP 17) for grime, hazard stripes, blood, scorch — one small decal atlas; huge atmosphere-per-dollar.
- **Audio:** Asset Store sci-fi ambience/SFX packs; the hard requirement is the *systemic hook-up*: a view-side `AudioDirector` mapping sim events (alarm, breach, door, brownout) to a `SoundCatalog : ScriptableObject` — same decoupling pattern as visuals.
- **Decoupling rule (applies everywhere):** sim knows `ushort` def ids and event types; ScriptableObject catalogs (`TileVisualCatalog`, `DeviceVisualCatalog`, `SoundCatalog`) map ids → assets; swapping the entire art/audio set is a catalog edit, zero code. Missing-entry fallback = magenta placeholder mesh + logged warning, so art gaps never block sim work.

## 12. Top 3 Technical Risks & Mitigations

1. **Determinism erosion.** One `Dictionary` iteration in a tick path, one `DateTime.Now`, one float reassociation after refactor, and saves/replays/tests silently rot. *Mitigation:* determinism is enforced, not hoped for — `StateHash` every 100 ticks compared across twin runs in a permanent EditMode test from M0; all randomness through `SimRng` streams; all sim iteration over `List<T>`/arrays (banned-API list in `Sim.Core/README`: no Dictionary iteration, no DateTime, no Environment, no unordered LINQ); pathfinding threads join before tick end and results apply in request order. Trap to note: cross-*platform* float determinism is not guaranteed — determinism is scoped per-platform (saves store state, not replay logs; cross-platform replays aren't needed).
2. **Sim–view drift as breadth grows.** With 8+ systems mutating tiles/entities, a presenter missing one mutation path causes ghost walls/invisible citizens — classic MVC rot. *Mitigation:* the *only* channel is the render-event queue + chunk dirty flags; a dev "reconcile" mode (F-key) rebuilds the entire view from sim state and diff-logs mismatches — also run in PlayMode smoke tests; view code never caches sim-derived gameplay values.
3. **Simulation depth spiral.** Cellular gas, per-tile fluids, or naive 3D A* for 200 citizens can each eat the tick budget and months of time. *Mitigation:* the architecture pre-commits to cheap models — lumped rooms (O(edges)), network fluids (no cells), region-graph reachability before A*, repath-on-invalidation only; per-system tick budgets asserted in profiling EditMode tests (`AtmosphereTick_Under0_2ms_On50Rooms`) so regressions fail loudly; upgrade a model only when a gameplay need is demonstrated, never speculatively.

(Runner-up: LLM latency/cost/nonsense — structurally contained by the fallback backend chain and effect validation; the sim is fully playable with the LLM off.)

---

## Revision log

- **2026-07-18 — Setting pivot:** moon base (Malapert Deep lava tube) → shipboard: the drifting colony/mining vessel **MSV Perilune**. Narrative and world-structure only; sim architecture unchanged. Code keeps the `Moonbase.*` namespaces and legacy names (rock tiles, dig jobs) as the project codename.
- **2026-07-18 — Living-simulation pivot:** [SIMULATION_ARCHITECTURE.md](SIMULATION_ARCHITECTURE.md) adopted as the philosophy authority (this document remains the mechanism authority). Consequences: headless ScenarioRunner, no random events (failure emerges from operating conditions), data-driven MachineDefs, M4 re-scoped to "Depth of Matter" (thermal + machine condition), threats deferred behind the depth layers, M6 added for Knowledge/History.
- **2026-07-18 — Side-section pivot:** world model changed from top-down z-levels to a **2D side cross-section** (length × decks, single interior row at y=1). Machines passable, conduits/pipes as utility overlays with vertical risers, ladders as deck links; the iso renderer retained as the future Detail view; side-view UI in flight.
