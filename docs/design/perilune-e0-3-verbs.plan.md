# E0-3 — player verbs on the web client (dig + stockpile)

**Lane:** `lane/e0-3-verbs` · **Plan authority:** `docs/ECONOMY-PLAN.md` §E0 · **Gap:**
`docs/MECHANICS.md` §13.6 · **Predecessor:** E0-1 (recruitability), E0-2 (work-rate rebase).

## The gap, restated from measurement

`TileFlags.Designated` has exactly one writer in the repo (`DesignateDigCommand`,
`Commands/Commands.cs:95`) and it is issued from exactly one place: the **TUI**
(`hosts/tui/GameLoop.cs:293`). The web host's command parser
(`hosts/web/GameSession.cs:1540-1570`) has no dig verb and no stockpile verb. Measured on the
slice: **48 debris tiles, 0 designated, 0 stockpile tiles**, job occupancy `None 99.92 %`.

E0-1 fixed the *recruiter* half (a wandering crew member is now recruitable). This lane fixes
the *designation* half: without it there is no demand for the enlarged labour pool to meet, and
`JobKind.Dig` / `HaulPickup` / `HaulDeliver` plus the LLM's `AgreeTask` verb stay unreachable.

## Scope decisions (Garvin, 2026-07-23)

1. **Surface: the legacy console glyph map, not the AAA Overview.** Surveyed before briefing, as
   the handover asked. The Overview is `SlotGrid`-driven and the code says so in its own words —
   `GameSession.cs:1150` *"Empty on ships with no slot grid (Perilune/PeriluneSlice)"*,
   `overview-view.js:15` *"an empty `decks` (e.g. --ship slice) never shows the [Overview]"*. The
   ship that carries the 48 debris tiles (`AuthoredShips.cs:304`), the 8 crew and the
   `ClearAllDebris` goal is **`--ship slice`**, which therefore plays on the legacy console canvas.
   `--ship grid` has the modern face but no debris and nothing to dig. Additionally
   `overview-model.js:51` states the design rule *"BUILDING IS ZOOM-ONLY … there is NO 'build'
   action here"* — the Overview is a schematic on purpose. An Overview ORDERS layer is a separate
   follow-up that must also author debris into the grid ship and add a designation wire channel.
2. **`strip` is deferred to E0-5.** No `JobKind.Strip` and no deconstruct system exist. E0-5's
   brief already owns it ("Deconstruct / strip as a first-class verb, mirroring `BuildSystem`",
   50 % wall recovery, `Parts × condition`, never-the-pressure-hull). E0-3 ships **dig +
   stockpile** — which is what "unblocks three `JobKind`s at near-zero sim cost" actually means.
3. **The E0-1 parked player-control question is decided in this lane.** The dig verb makes the
   auto-work interrupt reachable for the first time, so it stops being latent here.

## What already exists (so this lane does not build it)

| piece | where | state |
|---|---|---|
| `DesignateDigCommand` | `Commands/Commands.cs:95` | done, TUI-driven, debris-only precondition |
| `DesignateStockpileCommand` | `Commands/Commands.cs:119` | done, walkable-only precondition |
| `JobBoardDirty.Tiles` fold | both commands | done (W0-3) |
| `GlyphColor.Designate` = 15 | `Sim.Glyph/GlyphColor.cs:28` | reserved, **no emitter** |
| `GlyphColor.Stockpile` = 16 | `Sim.Glyph/GlyphColor.cs:29` | reserved, **no emitter** |
| client palette for both | `client/src/render/palette.js:15,23` | `#ff3d8a` / `#b0a860`, already shipped |
| single armed-tool slot | `console-model.js:234` `nextArmedTool` | `null|wall|door|cancel|move` |
| canvas click → armed order | `input/controls.js:119` | `Cmd.build(tool,x,y)` on a non-drag click |

**Therefore: no wire-format change, no `GlyphColor` enum change, no client palette change.** The
frame already ships raw `GlyphColor` bytes and the client already knows how to paint 15 and 16.

## Packages

### P1 — emit the two reserved designation colours (`Sim.Glyph`, pure)

`GlyphMapper.Project` writes `GlyphColor.Designate` for a `Debris` tile carrying
`TileFlags.Designated`, and `GlyphColor.Stockpile` for a walkable floor tile carrying
`TileFlags.Stockpile`. Fog gate stays first (an unexplored designated tile stays `Unknown`).
Projection is pure — **no hash impact**. Golden impact: none expected, because no pinned ship
designates anything at boot; verified, not assumed.

### P2 — the two host verbs (`hosts/web`)

`dig` and `stockpile` in `ParseCommand` + `CmdKind` + handlers, mirroring `HandleBuild`: clamp to
bounds on the current deck, enqueue the existing command, set a status line that promises only the
*attempt* (legality is decided sim-side at the tick boundary). Both carry an explicit `on` flag
rather than reading world state host-side, so a drag-sweep is idempotent and the host never
races the sim.

### P3 — the two client tools (`client/`)

`Cmd.dig` / `Cmd.stockpile` builders; `dig` + `stockpile` join the armed-tool vocabulary
(`nextArmedTool`, `isBuildTool` → a wider `isOrderTool`); two palette buttons in the BUILD tab;
the canvas click handler routes an armed order tool to the new commands; keyboard parity at the
inspection cursor. Node-tested via the pure reducer, as the existing tools are.

### P4 — player-order precedence (`Sim.Core`, **moves pins**)

A hashed `Citizen` field marking "executing an explicit player move order", set by
`MoveCitizenCommand`, cleared on arrival / cancel / a new job, and added to `IsIdleForWork` so
auto-work cannot hijack a direct order. Full ritual in ONE commit: default + save + hash fold +
round-trip test. This moves the slice golden and possibly the scenario pin; re-measured and
re-pinned in the integration commit.

## Acceptance

- A player can designate dig on slice debris from the shipping web client and watch crew clear it.
- A player can zone a stockpile and see haul jobs run (`HaulPickup`/`HaulDeliver` leave 0.00 %).
- `AgreeTask` appears in a slice crew member's LLM manifest (`digTargets > 0`).
- An explicit move order is no longer hijacked by auto-work.
- `./ci.sh` exit 0, twin hashes match, pins re-measured and updated in the same commit.
