# HANDOVER — PERILUNE (2026-07-18, post-Phase-A)

For the next Claude instance. Read this top to bottom before touching code.
Companion docs: `GDD.md`, `TDD.md`, `SIMULATION_ARCHITECTURE.md`, `MOSS_SPEC.md`,
`LLM_CITIZENS.md`, **`TUI.md`**. Approved pivot plan: `~/.claude/plans/ok-so-a-few-cuddly-teacup.md`.

## FOURTH PIVOT (2026-07-19, user-approved): glyph presentation + data-driven tuning

**Unity's `Game.View` is FROZEN** — it must keep compiling (EditMode 175 green) but
gets no new work. The primary presentation is now a two-layer projection: sim →
semantic `GlyphBuffer` (`Sim.Glyph`, pure/fog-gated/zero-alloc) → skins:
`tools/PeriluneTui` (playable ANSI terminal + `--dump` text frames for agents/CI)
and `tools/PeriluneWeb` (flat-2D browser canvas, procedural art, WebSocket).
All sim tuning lives in `StreamingAssets/SimDefs/*.def` (12 files; systems read
`sim.Defs`, bit-exact default-equivalence proven); ship-wide designer rules are
MOSS scripts in `SimDefs/rules/*.moss` (own interpreter/budget, `ship.*` metrics
namespace, content-not-save-state). **Read `docs/TUI.md` for commands, keys,
reference hashes, and the pivot's seven new invariants** (projection purity,
append-only GlyphColor, def-field commit rule, rules-are-content, host-owned IO,
InvariantCulture — the dev machine is de-DE). Ten dual-reviewed commits
e52e131..da8e863; suite `~/.dotnet/dotnet test tools/Perilune.Tests` = 175 green.
Everything below this section predates the pivot and remains true of the frozen
Unity path and the sim core.

**Web sprite skin + AI art pipeline (2026-07-20, follows the pivot).** `tools/PeriluneWeb`
is now the visual front-runner: a flat-2D browser canvas over the same semantic frame,
with a real camera (WASD/drag pan, wheel zoom, crew-centred open), a clicked-crew
selection reticle, and a sprite skin (`P` toggles procedural ↔ sprites). Art is generated
by `tools/spritegen/` — a spec-driven Nano Banana (Gemini image API) pipeline with style
enforcement (palette-lock / hue-harmonise), magenta de-fringe, margin auto-crop, and
one-command generate→integrate→screenshot; a full 20-sprite steampunk set ships integrated
as data URIs in Client.html. **Rendering conventions worth carrying into a future Unity 2D
tilemap skin**: a wall draws its panel only as a *face* (touching open space), deep hull is
a flat dark mass, and unexplored fog == hull mass (so crew movement never reveals structure
tile-by-tile). No sim/glyph change — all client-side; the wire still carries only semantic
ids. Full details + the designer art loop are in `docs/TUI.md`. Nine more commits
1cd0899..0683ea9; suite still 175 green.

## What this project is

**PERILUNE** — a Dwarf-Fortress-style colony sim aboard the **MSV Perilune**, with
Aliens: Dark Descent atmosphere, a deterministic UnityEngine-free sim core,
LLM-driven citizens (sim-validated effect whitelist), and a player automation DSL
(**MOSS**). Unity project lives in `moonbase/` (URP, UI Toolkit HUD).

## The current direction (third pivot, user-approved 2026-07-18)

1. **One main view: full 3D isometric** (Dark Descent look). The old 2D side view
   is deleted. Right-click a room = camera zoom + readout (no separate 3D room view).
2. **Setting: raided-ship recapture.** The Lien (pirates) hold the ship; the player
   regains system access deck by deck and fights **systemically** (lock doors, vent
   compartments to vacuum, cut power/heat). No squad micro; the data model must
   permit tactical control later.
3. **Everything builds toward procedural ships.** Garvin decorates 1–2 room
   templates in the editor → a rule extractor learns placement rules → a
   `RoomDresser` dresses ALL rooms, including generated ships. **Claude never
   hand-dresses rooms** — that failed hard (multiple convergence-free iterations);
   automation lives only in sim-validatable domains.

## Phase status

**Phase A COMPLETE** (6 commits, all green: 174 EditMode + 3 PlayMode):

| Commit | What |
|---|---|
| b95bf17 | Iso stack (`Game.View/Iso/`): IsoGrid, IsoCameraRig (FOV 20, pitch 50, smoothed 90° orbit steps, deck switch, Tab exterior), IsoWorldPresenter (instanced schematic + lens floor quads + camera-facing wall **cutaway**), IsoTilePicker, LensSampler. Side view deleted. |
| 758c7c8 | Scene boot: `Perilune.unity` + `GameBootstrap` MonoBehaviour (no more RuntimeInitializeOnLoadMethod); `Tools/Perilune/Bake Ship Preview` materializes the ship in-editor. |
| 87ff39e | `Moonbase.Sim.Gen` (UnityEngine-free): ShipPlan/GridCanvas/ShipPlanBuilder + `AuthoredShips.Perilune()` = **64×20×2 top-down** deck plan. Bootstrap is now a facade. Raider groundwork saved+hashed (see below). **Thermal model change**: hull loss ∝ `Room.HullTiles` (hull-contact tiles; single partition walls insulate), not room area. |
| 00857b6 | Kit structure layer: KitTileSet (+builder), IsoStructureBuilder — kit floors/walls/doors/ladders on the active deck, per-deck realtime ReflectionProbe, ACES post + 3-point light rig. TileSize 2 m, DeckHeight 3 m. |
| a114805 | Room templates: plain `RT_{Type}.prefab` per typed room (`Assets/RoomTemplates/Resources/`), TemplateGallery scene, runtime stamping (templates own room interiors; structure keeps walls/doors/ladders; presenter keeps lights). Regeneration NEVER overwrites an existing template. |
| dd3c235 | RoomDetailView deleted; room zoom = `IsoCameraRig.FocusRoom` tween + HUD readout panel. |
| 4386a1d, 82f3fd2 | Readability: bright wall top caps in game, door state diamonds (green open/amber closed/red locked), gallery boundary context (half-height walls + door frames + green chips + **amber door-apron keep-clear tiles**). |

**LookDev sandbox (2026-07-18, after Garvin nearly called for a full env
restart):** `Tools/Perilune/Build LookDev Scene` creates
`Assets/Scenes/LookDev.unity` — ground plane, 1.6 m player capsule, the game's
exact light/post rig, and a hand-editable mock corridor+room built from the real
pieces (slab walls, kit floors, kit door). **The wall material is the asset
`Assets/UI/Resources/IsoWallMat.mat`** (+ baked `iso_wall_panel.png`);
`IsoWallStyle.WallMaterial` loads it from Resources at runtime, so tuning that
material in LookDev IS tuning the game — no porting step. The build tool never
overwrites an existing LookDev scene (hand work lives there); play mode there
gets the gallery fly camera. This is where Garvin designs the environment look
by hand; codify structural findings (proportions, new piece types) into
IsoWallStyle/IsoStructureBuilder afterwards.

**Ship dressing layer (2026-07-19, Garvin-requested): hand-placed props for
SPECIFIC rooms of the real ship.** `Tools/Perilune/Bake Ship Preview` now (a)
bakes the REAL view (kit floors/slab walls/doors/templates/catalog props via the
runtime classes, fog ignored, per-deck toggleable roots; schematic cubes only as
fallback) and (b) ensures a persistent `ShipDressing/Deck{z}` root in
Perilune.unity. Garvin drags kit prefabs under those groups and saves the scene
— that IS the persistence. GameBootstrap destroys only `ShipPreview`;
`ShipDressingView` (presenter-driven, structure-layer triggers) shows props on
the active deck when their tile is explored. **Dressing props are VISUAL ONLY**
(no Scenery flags yet — crew paths through them) until the B2 dresser lands.
Enabler: IsoStructureBuilder/RoomTemplateInstantiator use a play-mode-aware
`Kill()` so the baker can run them in edit mode.

**Ship editing (2026-07-19, collapsed after adopt-workflow dupes): the SCENE
owns the look, the CODE owns the function.** All 14 rooms are adopted into
`ShipDressing` — templates no longer stamp in the real ship (they remain B2
rule-extractor input). Daily loop is TWO steps: edit Perilune.unity like any
Unity scene (move props, delete clutter, drag machines — move the teal
DeviceSocket WITH the prop), then **`Tools/Perilune/Sync Ship`** and save. Sync
= capture machine tiles from sockets + loose `{Kind}_{name}` props (dressing
wins over preview, sockets over props) → write
`Assets/UI/Resources/DeviceLayout.json` (`Bootstrap.BuildAuthoredSim` applies
it via UnityEngine-free `Sim.Gen/DeviceLayout.Apply`; invalid entries warn,
never brick boot) → rebake the disposable preview → log every machine's visual
owner. Rendering invariant: a machine renders EXACTLY ONCE — dressing covers by
NAME only (`ShipDressingView.Covers`; socket deviceName or `{Kind}_{name}`
prop); anything un-named gets a presenter/baker auto prop (never silent
invisibility; the sync report lists them). Adopted rooms still tile-cover their
FLOOR (dressing carries kit plates). Machine deletion stays explicit: *Remove
Selected Devices From Ship* writes `remove: true` entries and deletes visuals
(life-support removal can starve the crew — ShipSurvivalTests is the canary).
Adoption tools remain for pulling future preview content into dressing; adopt
now deletes stale preview duplicates instead of skipping them, and every tool
sweeps ALL `ShipPreview` scene roots (a stale preview saved pre-no-save-guard
caused the old-asset-plus-adjusted-copy dupes). Devices snap to tiles;
doors/ladders/lights/utility overlays are excluded from position capture.
**Rotation:** DOORS and auto-prop machines can never live in dressing (doors
animate open/closed with the sim; both regenerate every rebake) — rotate them
IN THE PREVIEW and Sync captures the yaw as a visual-only override
(`Entry.HasYaw/YawDeg` in DeviceLayout.json; sim ignores it, the structure
layer/presenter/baker apply it). Door frames are named `Door_{name}` for this;
rotating one back to its wall-derived default drops the override on the next
Sync. Never copy a door into ShipDressing — the regenerated frame will overlap
it.

**CURRENT CHECKPOINT (blocks B2):** Garvin decorates 1–2 templates in
`Assets/Scenes/TemplateGallery.unity` (kit props in prefab mode; teal DeviceSocket
markers must not move) and judges the look. He may report look feedback — exposure
knobs: `Bootstrap.SetupLighting` (ambient 0.30/fill 0.9/counter 0.35),
`IsoCameraRig` post volume (postExposure 0.45, contrast 4), `IsoStructureBuilder`
cap material (neutral dark metal).

**Look pivot (2026-07-18, reference: The-Ascent-style photo Garvin supplied):
walls are FULL height everywhere — the whole cutaway system was deleted**
(presenter no longer tracks ViewDir; `ApplyCutaway`/`FloorBehind*`/CutSill/
CutawayHeight are gone). People read at ~half wall height (capsule 1.6 m vs
3 m walls); MMB free orbit is how the player looks behind near walls. Wall top
caps are REMOVED entirely (they flattened wall runs into map ribbons). Kit floor
grates get schematic backing slabs.

**Wall pivot 2 (2026-07-18, later that evening): structural walls are GENERATED
slabs, not kit pieces.** The kit's 9.6 m wall modules squashed ~5× onto 2 m tiles
read as dark repeating mini-panels no matter how they were placed — Garvin called
time on cleaning that up. `IsoWallStyle` (Game.View/Iso) owns the look: per-tile
half-slabs toward each wall neighbor (full-tile symmetric slabs grew crenellation
nubs on stepped hull runs), procedural grayscale panel texture, low-metallic
URP/Lit so brightness comes from scene lights, not just the probe. One knob for
wall color: `IsoWallStyle.CreateMaterial` `_BaseColor`. The two-faced kit wall
placement is deleted; `KitTileSet.Wall` is unused (kept measured for reference)
and `IsValid` no longer requires it. Gallery boundary walls use the same slabs
(rebuild the gallery scene to see it). Kit keeps floors/doors/ladders/props. Lighting: ambient 0.52/0.55/0.62, fill 1.0 @ (42,-35), counter 0.5 @
(38,150), probe background 0.45/0.49/0.58 @ intensity 1.15, post contrast 1.2 /
exposure 0.55 (contrast 4 crushed the PBR). Camera: pitch 47, follow distance
36; ResetFraming still gives the whole-deck overview. Fog note: Bootstrap
pre-reveals every room REACHABLE from the crew at boot (crew knows their ship;
sealed rooms stay dark) — deck 0 mostly explored on day 0 is by design.

## What comes next (in order)

- **B2 — rule extraction + dresser**: `Editor/TemplateRuleExtractor` (diff decorated
  template vs plain: prop class, wall affinity, nearest-device-kind, door clearance,
  clustering, yaw, blocking) → `DressingRuleSet` (plain POCO in Sim.Gen, wrapped in
  a ScriptableObject; extracted values are editable priors, not learned truth).
  `Sim.Gen/Dress/RoomDresser`: reserved lane mask (door↔door/door↔device BFS +
  door aprons) → scored placement → blocking props set `TileFlags.Scenery` (already
  wired into `IsWalkable` + saves). Deterministic per (seed, roomId).
- **C — procedural ships**: `Sim.Gen/Gen/ShipGenerator` (corridor-first band
  partition + scored greedy room assignment; generate-and-test, NOT constraint
  solving), stages Hull→Spine→Assign→Doors→Devices→Utilities→Start→Damage.
  Validation gates V1 connectivity, V2 room integrity/vacuum leaks, V3 power,
  V4 water/food, V5 MOSS names, V6 survivability days, V7 twin-hash. ScenarioRunner
  CLI: `gen --seed N --validate`, `sweep --count 100` (exit code contract). Add
  Sim.Gen to `tools/ScenarioRunner/ScenarioRunner.csproj` via compile glob first.
- **D — raiders**: reuse Citizen (Faction/Health/Morale/Archetype already on it),
  RaiderSystem (SYSS "Raiders", brain state in-system, body on citizen),
  AccessSystem (zones, `Device.LockOwner` already saved), `JobKind.Override` at
  terminals, purge vents, morale break → surrender → parley via the existing LLM
  effect spine. PowerSystem must learn to skip `!IsOperational` conduits (sabotage).

## Architecture you must not break

- **Sim core (`Sim.Core`) is UnityEngine-free and deterministic**: 10 Hz fixed tick,
  all input via `ISimCommand` inbox, all RNG via forked `SimRng`. Every saved field
  is hashed (`Simulation.StateHash`) — add field ⇒ save + hash + round-trip test in
  the SAME commit. Twin-run + zero-alloc tests enforce this (`DeterminismTests`,
  `AllocationTests`).
- **Save format**: chaptered MBSV; current versions ROOM v3 (+anchor RoomType),
  CITZ v5 (+Faction/Health/Morale/Archetype), DEVC v4 (+LockOwner). Readers accept
  older versions with defaults.
- **One build path for ships**: `ShipPlanBuilder.Build(plan, systems)`. The authored
  ship is `AuthoredShips.Perilune()`. Never author world state imperatively in
  Bootstrap again.
- **View ownership** (no double rendering): structure layer owns walls/doors/
  ladders/floors (kit geometry, active deck only; decks below = dim schematic);
  room templates own room-interior floors + machine props (via DeviceSockets);
  presenter owns citizens/items/lights/fallback props + instanced debris/marks/
  lens quads; `LensSampler` is the single lens colorimetry source (HUD minimaps use it).
- **LLM effects**: only through the CitizenEffect whitelist / EffectPump. Never let
  an LLM touch sim state directly.

## Key facts that cost time to learn (don't relearn them)

- **Heavy Station Kit** (gitignored, on disk at `moonbase/Assets/Heavy Station Kit/`):
  metallic PBR **reads flat-cyan without an environment** — always pair with a
  reflection probe (probe backgroundColor is effectively the wall brightness —
  dark probe = black walls). `Top-Down/TD_base_topwall_*` are flat roof TRIMS at
  y≈9.7 (useless as walls). The real wall plane is `Walls/1 Wall/W1_D0`
  (9.61×9.72×0.43), and it is SINGLE-FACED — **kit walls are ABANDONED for
  structure** (see Wall pivot 2 above); don't try to bring them back at 2 m
  tiles. The kit floor plate is
  an OPENWORK GRATE — with nothing below, every hole is a black porthole; the
  presenter draws its instanced schematic floor slabs UNDER the kit plates as
  backing. `Editor/SceneDump.cs` is the diagnostic that found all this (dumps
  fog/template/wall state + a wall close-up screenshot).
  Doors: `B2_Door` (closed) / `B2_Door_None` (open frame). Kit assets are measured
  and auto-fitted by `KitTileSetBuilder` — rerun `Tools/Perilune/Rebuild Kit Tile
  Set` + `Rebuild Device Prop Catalog` after a fresh kit import. `KitBoundsProbe`
  logs measured bounds if you need to pick new pieces.
- **Thermal**: rooms below −10 °C injure via the suffocation track (NeedsSystem).
  Hull loss uses `Room.HullTiles` (recomputed in RoomState flood; derived, not
  saved/hashed). A wall counts as hull if backed by void/map-edge/more wall; a
  single partition wall with a room behind insulates. ThermalTests' derivations
  assume the 8×3 test room has 18 hull tiles — keep the math comments in sync.
- **Unity batch workflow** (also in auto-memory `unity-batch-workflow`): editor
  binary `/Users/garvin/Documents/6000.5.4f1/Unity.app/Contents/MacOS/Unity`.
  EditMode: `-batchmode -nographics -runTests -testPlatform EditMode -testResults
  <abs>.xml -logFile <abs>.log` (no `-quit` with `-runTests`). Compile-only: add
  `-quit`, drop test flags. **Garvin's GUI editor holds the project lock** — check
  `ps aux | grep "MacOS/Unity -projectpath"`; quit via
  `osascript -e 'tell application id "com.unity3d.UnityEditor5.x" to quit'` (may
  need a retry), and DON'T kill it silently while he's working.
  Screenshot tools need the GUI editor (real GPU), NOT batch:
  `-executeMethod Moonbase.Editor.HudScreenshot.Run` (game) /
  `GalleryShot.Run` (gallery); output to `$MOONBASE_SHOT_DIR`.
- **Exposure tuning took 3 iterations** — change one knob at a time and screenshot;
  ACES + contrast crushes dark PBR fast.

## Known issues / backlog (not regressions)

- Device prop catalog scales were tuned for the old 1 m side-view tiles; several
  props read small on 2 m tiles (grow beds are primitive boxes). Templates/dresser
  will supersede most of it.
- Door state markers don't refresh on lock-only changes (rebuild keys on
  open/closed); fix when locks matter (phase D).
- Structure rebuild: fog reveals are now incremental (`AddNewlyExplored`
  add-only pass — reveals fire every second under the follow camera and full
  teardowns stuttered visibly). Digs/topology changes (`TileChangedEvent`/
  `RoomsChangedEvent`) and deck switches still do full rebuilds.
- Camera follow tracks `IsoWorldPresenter.CitizenVisualPos` (the interpolated
  render position) — following the raw sim tile steps 2 m per move tick and
  stutters. Keep any future follow targets on visual positions.
- `IsoWorldPresenter.ShowDecksBelow` defaults OFF: the dim under-deck schematic
  read as leftover geometry to Garvin. Flip the bool to get the preview back
  (citizens/devices/items below deck are hidden with it).
- ~~MOSS terminal typing can still pan the camera~~ fixed 2026-07-18:
  `PeriluneHud.KeyboardCaptured` gates all IsoCameraRig keys. Camera also gained
  MMB free orbit (yaw+pitch, drag-down = more top-down), R/F deck switching,
  crew-centered start deck, and the TemplateGallery got a self-installing
  play-mode fly camera (`GalleryFlyCamera`, RMB-look + WASD).
- **Control-scheme pivot (2026-07-18, Garvin-directed): strict player control.**
  `Citizen.HoldPosition` (saved CITZ v6, hashed): held citizens never
  self-initiate movement — no jobs, no self-serve needs, no crafting/maintenance
  recruitment (`IsIdleForWork` now excludes them). They DO consume water/potatoes
  in place when parked adjacent (`SustenanceSystem.TryServeInPlace`) — the player
  owns their survival. Authored crew spawns held. ShipSurvivalTests releases the
  holds (it validates the map, not the control scheme). Camera follows the first
  living crew citizen by default, switching decks with them; WASD-pan/R/F/room
  zoom break follow, C or a move order re-engages it.
- No windows/viewports anywhere; observatory wants one eventually.
- Minds/personas are regenerated from RNG on load (not persisted yet).
- `ExteriorVista` hull greybox hasn't been re-proportioned for the 64×20×2 ship.

## Verification ritual (every substantive change)

1. Headless compile clean.
2. EditMode suite green (174+; survival test `ShipSurvivalTests` is the canary for
   any map/thermal/water change).
3. PlayMode suite green (3 — boots the real scene).
4. Screenshot checkpoint for anything visual; judge it yourself before showing Garvin.
5. Commit per milestone-sized step with a summary of what + why + test counts.
