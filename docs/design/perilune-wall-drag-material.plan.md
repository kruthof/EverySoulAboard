# Wall drag-build + authoritative materials — execution plan

Feature: RimWorld-style **click-drag** wall/floor building with a **live orientation-aware
preview**, plus **authoritative wall/floor material selection** (the 12 MATERIAL pieces of
`perilune-item-set.dc.html`). Requested 2026-07-23. Worktree `wall-drag-build`.

## Scope decisions (from the user)
- Material is **authoritative + hashed** (stored per tile, saved, survives reload), NOT view-only.
- Both **walls AND floors** get the drag + material picker (floors are NEW — not a build target today).
- Drag-build implemented on the **Room Zoom** (current build face) first; legacy on-map console is a
  fast-follow.

## Honest caveat
Material determines the built tile's **identity + skin**, not a differentiated **cost**. The sim has
only one build stock (`ItemKind.Regolith`); there are no glass/timber/steel item kinds. Every build
consumes Regolith regardless of chosen material. Per-material bills of materials are a separate
economy-lane job (noted, out of scope).

## Determinism
This MOVES the pins (new hashed World material plane folds zeros in even before any material is set;
`PendingBuild.Material` + `BuildKind.Floor` add hashed build state). Re-pin `ci.sh` + `CLAUDE.md`
"Determinism proof" + `MECHANICS.md` + `HANDOVER.md` + memory in the integration commit, measuring
the final combined tree. Each sim package still ships its own save+hash+round-trip test in-commit.

## Material byte semantics
Per-tile `byte Material`. Interpreted by tile type:
- WALL tile: `WallMaterial { SteelBulkhead=0, TimberLined=1, BlastWall=2, GlassPartition=3,
  InsulatedWall=4, HullPlating=5 }` → item ids steel-bulkhead / timber-lined-wall / blast-wall /
  glass-partition / insulated-wall / hull-plating.
- FLOOR tile: `FloorMaterial { SteelTan=0, WoodPlank=1, GrowMatting=2, CreamTile=3, MetalGrating=4,
  Carpet=5 }` → steel-tan-floor / wood-plank-floor / grow-matting / cream-tile-floor / metal-grating
  / carpet-floor.
`0` is the default for both, so a fresh/legacy world reads as the default skins (no visual change on
existing ships until a player picks a material).

## Packages (dependency order)
- **S1 World material plane (hashed)** — `ZLevel.Material byte[]`; `World.GetMaterial/SetMaterial`;
  fold into `HashInto`; WLDL save chapter +Material array w/ version bump + back-compat; round-trip +
  hash test. MOVES PINS.
- **S2 Build material + floor kind (hashed)** — `BuildKind.Floor=2`; `PendingBuild.Material`
  (save+checksum+version bump); `Designate(pos,kind,material)`; `Complete` writes material via
  `World.SetMaterial`; `CanDesignate` for floor; `BuildJobSource` floor jobs; `DesignateBuildCommand`
  carries kind+material. MOVES PINS.
- **W1 build cmd + designs material** — `Cmd.build(kind,x,y,material)`; host parse; `DesignCell` gains
  material (append, back-compat).
- **W2 sparse `materials` channel** — host derives non-default-material wall/floor tiles from the
  World plane; WireFormat additive; client decode + Hud cache.
- **C1 drag-tiles model (pure)** — start+end+tool → target tiles (wall=rect perimeter / line;
  floor=filled rect; door=single) + orientation hint. Node-tested.
- **C2 material-picker model (pure) + UI** — active-material state per tool; palette swatch sub-row.
- **C3 drag interaction + live preview + commit** — Room Zoom canvas mousedown/move/up; preview ghost
  (skinned, orientation-aware); commit one `Cmd.build` per tile; single-click still works.
- **C4 render built walls/floors with material** — Room Zoom wall layer reads frame walls + `materials`
  channel → item-set skins; floors tint per material.
- **INT re-pin** — ci.sh + docs + memory; full ./ci.sh gate.

Each package: Opus implementer + independent Opus reviewer; integrator (me) merges + re-pins.
