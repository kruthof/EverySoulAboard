# PERILUNE headless presentation & tuning — tools guide

*Written 2026-07-19 at the close of the glyph-presentation pivot. The sim is the game;
Unity's `Game.View` is FROZEN (compiles, gets no new work). Everything below runs with
`~/.dotnet/dotnet`, no Unity editor required.*

## Architecture in one picture

```
Simulation (truth, 10 Hz, deterministic, UnityEngine-free)
   │  GlyphMapper.Project — pure, fog-gated, zero-alloc (Sim.Glyph)
   ▼
GlyphBuffer: W×H cells of (glyph char, semantic fg/bg GlyphColor, attr)
   ├─► tools/PeriluneTui   ANSI terminal skin (--play) + text frame dumps (--dump)
   ├─► tools/PeriluneWeb   flat-2D browser canvas skin (WebSocket, semantic ids on the wire)
   └─► (future) any other skin — sprite tileset, Unity — same cells, new lookup table
```

Colors/attrs are SEMANTIC ids; each skin owns the actual look (ANSI palette, RGB map).
`GlyphColor` is append-only — the enum index is a golden-file token.

## Running the game

```bash
# Playable terminal client (real TTY required)
~/.dotnet/dotnet run --project tools/PeriluneTui -- --play

# Browser client (RimWorld-style flat 2D — procedural shapes OR an AI sprite set)
~/.dotnet/dotnet run --project tools/PeriluneWeb           # then open http://localhost:8323
# Single-session: every browser tab shares ONE game (deck/lens/speed/cursor/selection).
# Loopback-only by design (per-request IsLocal check); --port/--seed/--layout/--data flags.
# Serves Client.html fresh per request with Cache-Control: no-store, so an edit +
# plain reload always shows up (no hard-refresh needed).

# Watch the ship as text (agents/CI "see" the game this way)
~/.dotnet/dotnet run --project tools/PeriluneTui -- --dump --days 1 --metrics
#   flags: --seed N  --ticks N|--days D  --every M  --deck 0|1|all
#          --lens none|pressure|oxygen|co2|temperature|power|water
#          --cursor x,y  --colors  --metrics  --out FILE  --layout PATH  --data DIR
#   footer: hash: <StateHash hex16> — byte-identical across runs at the same seed.

# Fast scenario harness (twin-run determinism proof + defs line)
~/.dotnet/dotnet run --project tools/ScenarioRunner -- --days 30 --seed 42
```

### Terminal keys
arrows/hjkl cursor · R/F deck · 1–7 lens (legend in sidebar) · space pause · +/- speed
(1×=10 t/s … 1000×) · Enter context (door/device toggle, citizen select) · m move order ·
L lock/unlock · d dig · p stockpile · c follow · t MOSS pane (e = edit in $EDITOR,
Esc close) · ? help · q quit. Terminal restore is guaranteed on every exit path.

### MOSS pane contract
`t` opens the terminal under the cursor. `e` suspends the alt-screen, round-trips
`$EDITOR`, then DUAL-APPLIES: `SetScriptCommand` (canonical source → sim state, next
tick) **and** `moss.SetProgram` (live hot-swap). Diagnostics render via the pure
`MossCompiler.Compile` — never `SetProgram` (which would reset live latches).

### Web client (`tools/PeriluneWeb/Client.html`, vanilla-JS canvas)
The canvas is a camera over the semantic frame — never shrink-to-fit. Keys: **WASD**
pan · **arrows/hjkl** cursor · **scroll** zoom (anchored on the tile under the mouse) ·
**drag** pan · **R/F** deck · **1–7** lens · **space** pause · **+/-** speed · **click**
select/toggle · **shift-click** move order · **P** toggle sprite ↔ procedural skin. Opens
centred on the crew. A clicked crew shows an animated selection reticle (glow disc +
pulsing brackets); the server sends the selected tile in the frame (`sel:[x,y]`), the
client draws it and runs a light rAF pulse only while something is selected.
Rendering conventions (also the target for a future Unity 2D tilemap skin):
- **Wall face vs solid mass**: rooms are floor carved from a solid `#` block, so most of
  the ship is wall. A wall draws its panel only when it touches open space (a "face");
  deep solid hull draws as a flat dark mass (`HULL`). Otherwise revealed interior reads
  as a sea of panels.
- **Fog == hull mass**: unexplored fog renders as the same `HULL` colour as solid hull,
  so moving the crew never "reveals" structure tile-by-tile against a darker fog. Only
  genuinely-open discoveries (entering a sealed room) change. Fog-of-war gameplay is
  intact underneath (sealed compartments stay hidden until entered).
- Wire carries only semantic ids (glyph char + `GlyphColor`/`GlyphAttr` bytes); the skin
  owns every pixel. Glyph→sprite is one lookup table (`SPRITE_FOR_GLYPH`), so unmapped
  kinds fall back to the procedural icon and a new tileset is a table swap.
- **Crew variants**: the frame carries an optional `crew:[[x,y,variant],...]` list —
  variant is `citizenId % 3`, stable per person, mapped to the `pawn`/`pawn_b`/`pawn_c`
  sprites so each crew member keeps their face. The session only lists citizens whose
  projected tile shows '@' (the fog gate stays authoritative; nothing hidden leaks).

### Sprite pipeline (`tools/spritegen/`, AI art via Nano Banana / Gemini image API)
`python3 tools/spritegen/run.py --spec <spec.json> --stage all` runs generate → select →
process → integrate → shot. Style enforcement makes AI sets cohesive: palette-lock for
`"style":"pixel"` specs, hue-harmonisation toward a material family for `"hd"` specs;
plus keying on the spec/per-asset key colour (with a key-following de-fringe pass),
per-asset `fill` scale normalization (crop to the object's alpha bbox, size its longest
side to fill×tile — grounds RELATIVE scale: a chair is small, a bed fills its tile),
auto-crop of baked margins, and seam metrics for tileables. `integrate` writes data URIs + `SPRITE_TILE` into Client.html between
`SPRITEGEN` markers (never hand-edit that block). Work dirs live under
`tools/spritegen/work/<spec>/` (outside Assets so Unity never imports candidates;
candidates gitignored, processed sprites + selection committed). API key: `GEMINI_API_KEY`
env or a `gemini` line in the gitignored repo-root `.env`. New art direction = new spec
(see `spec_cyberpunk80s.json` — the shipped cyberpunk/synthwave look — plus
`spec_steampunk.json` / `spec_pixel32.json` and `tools/spritegen/README.md`).
The web chrome (CSS vars + JS semantic palette + `HULL`) is themed to match the
shipped set; a spec swap that changes mood should retheme those in the same commit.

### The ship designer (2026-07-20): programme → planner → outfitter → dresser
The shipping ship is built by rules, not hand-carved rooms:
- **`RoomProgramme`** — per-RoomType footprint targets (a cabin is 4×4, a medbay
  8×4; anything a band doesn't need stays solid hull, so the ship reads dense).
- **`BandPlanner.Carve`** — packs a corridor band with programme-sized rooms,
  doors (pinnable X so DeviceLayout.json yaw overrides stay valid) and typed
  anchors. Pure function of its inputs.
- **`RoomOutfitter`** — places each room's working devices by rule (lights center,
  air machinery in corners, water hardware on the service row with the pipe run
  adjacent); device NAMES are pinned MOSS vocabulary (vent_hydro, term_hydro, …).
- **`RoomDresser.Dress`** — furniture is real sim content
  (`DeviceKind.Bed/Table/Chair/MedBed/MedCabinet/Locker/Desk/PlantPot`, inert rows, glyphs `b t h d C L D P`)
  placed by geometric rules: beds hug the wall farthest from the door (corners
  preferred), tables on the center line with chairs pulled up, med-beds in a
  spaced clinical row + supply cabinet, cabins get locker/desk/plant, plants in
  commons/observatory corners, nothing on doors/aprons/occupied tiles.
Nothing in a room is ever hand-dressed; a future procedural ship reuses all four
stages. Quarters is four 4×4 cabins off a private hall (`cabin_1..4` +
`quarters_hall`). **Design lesson (found by the survival tests): a compact hull
holds little passive air — the upper-deck corridor carries a RUNNING
scrubber+open-vent recirculator pair (`scrubber_corr_up`/`vent_corr_up`), which is
the scrub→pressure-dip→fresh-mix life-support cycle the sim models.** Contracts
pinned by `RoomDresserTests` + `ShipDesignTests` (fast day-one survival mirror).

### Sprite facings (skin-side smart rotation)
Directional sprites declare which way the ART faces in the spec
(`"facing": "E"` on the chair — backrest west; beds/med-beds head N); integrate
emits `SPRITE_FACING` beside the URIs. The client rotates by CONTEXT at draw
time: a chair turns toward the table (or bed) it serves, else opens away from its
wall; bed/med-bed heads go against the nearest wall (N/S preferred). Pure
presentation — the wire stays semantic; procedural fallback unaffected.

## Tuning & rules (designer loop)

All sim constants live in `moonbase/Assets/StreamingAssets/SimDefs/*.def` (12 files,
`#` comments, `[section] key = value` + enum-keyed table rows). Values ship as the
compiled defaults, verbatim; delete a line to fall back. Bad lines warn and keep
defaults — boot never bricks. See `README.def` for the format and the
add-a-field invariant. Loop: edit a value → re-run ScenarioRunner or a dump →
the `defs:` checksum changes and behavior follows. Ship-wide **rules** are MOSS
scripts in `SimDefs/rules/*.moss` (content, not save state): own interpreter +
budget, run just before player scripts (player wins ties), can read the read-only
`ship.*` namespace (power/o2/co2/water/food/heat/morale; 0..1 normalized, co2 ppm),
`alarm()` lands in the event log. Example: `rules/overheat_guard.moss`.

## Testing

```bash
~/.dotnet/dotnet test tools/Perilune.Tests --nologo        # 182 tests (day-one survival mirror runs the sim for a full day — ~17 s total)
```

- **Golden frames/screens/wire**: committed under `tools/Perilune.Tests/Golden/`;
  a mismatch prints a diff; `UPDATE_GOLDEN=1 dotnet test --filter ...` rewrites —
  regenerate ONLY when a change is intended, and say why in the commit.
- **Purity**: `StateHash` before == after every projection (clean AND dirty rooms).
- **Twin determinism**: identical sims → identical frames/hashes; ScenarioRunner
  verifies at the CLI (`twin hashes MATCH`).
- **Defs equivalence (keystone)**: parsed shipped `.def` files vs compiled defaults →
  identical StateHash over 20k ticks; mutation tripwires prove each system actually
  reads its file.
- **Reference hashes** (seed 42, `--days 3`): rules-absent `222bf79dd1731130`;
  with the shipped example rule `802d053d7f867e89` (differs only via the rule
  system's saved-latch fold — documented, expected).

### CI smoke (no Unity)
```bash
~/.dotnet/dotnet test tools/Perilune.Tests --nologo && \
~/.dotnet/dotnet run --project tools/PeriluneTui -- --dump --days 1 > /dev/null && \
~/.dotnet/dotnet run --project tools/ScenarioRunner -- --days 1 --seed 42
```

### Unity gate (only when Sim.* or Game.View files change)
Headless compile + EditMode per `docs/HANDOVER.md` batch commands (editor must be
closed — it holds the project lock). The frozen view must keep compiling; EditMode
suite is 175 green as of this pivot.

## Invariants added by this pivot (do not break)

1. `GlyphMapper.Project`/`ScreenComposer` are PURE — no sim mutation, ever
   (hash-tripwire tests enforce, including the dirty-rooms case).
2. Fog gate first: nothing renders on an unexplored tile, in any pass, any skin.
3. `GlyphColor` and the golden annotated format are append-only.
4. A def field ships in ONE commit with: CreateDefault value + parser key +
   checksum fold + equivalence coverage (README.def spells it out).
5. Rules are content (`SimDefs`), never player state (`Simulation.Scripts`);
   the player runtime registers after the rule system so player scripts win ties.
6. Sim.Core stays file-IO-free; hosts own IO (shared helpers: `RulesLoader` in
   Sim.Dsl, `DefsParser`/`DeviceLayoutFile` take text, not paths).
7. Wire/goldens/dumps are InvariantCulture everywhere (dev machine is de-DE —
   culture bugs are live here, not theoretical).
