# PERILUNE ROOM ZOOM (Level 2) — INTERACTION SPEC v1

Authoritative interaction contract for the Level-2 **Room Zoom** — the detailed build/decorate view
of one room, opened by clicking a room in the Overview (Level 1). Target files:
`client/src/ui/roomzoom-view.js` + `client/src/ui/room-model.js` + the shared
`client/src/ui/deck-minimap.js`. The companion visual spec is
`docs/design/perilune-roomzoom.visual-spec.md` (`VS-Z-*`). Ground truth for wire/DOM constraints is
the client design log `client/README.md` and the node-test golden discipline (the sim determinism
pin is `616ed4a84a9f6e87` in `ci.sh`; this view moves no sim state); the `decks`/`rooms`/`decor`
channels are `docs/design/perilune-wire-channels.spec.md`; the `frame`/`designs`/`crew`/`roster`
channels are `client/src/wire/messages.js`. Where a mock and reality conflict, this spec resolves
it and the resolution is final.

Every requirement is numbered `IX-Z-nn`; one behavior per requirement — no options.

Conventions:
- **Authoritative state** = what the wire last said (`frame`, `designs`, `rooms`, `decor`, …). The
  client never latches its own copy of anything the wire carries.
- **armedTool** = the single client-side input slot, extended for Level 2 to
  `null | 'wall' | 'door' | 'bunk' | 'desk' | 'chair' | 'locker' | 'lamp' | 'plant' | 'rug' | 'shelf' | 'demolish'`.
  It is the ONLY input mode in the Room Zoom; the eleven palette tools and demolish share it, so
  they are mutually exclusive by construction.
- **focusRoom** = the room id the Room Zoom is currently showing; its `[rx,ry,rw,rh]` and `deck`
  come from the `decks` channel slot for that room (GEOMETRY lives on `decks`, VS-Z-14), and its
  display `name` is CLIENT-DERIVED from the slot's `roomType` (VS-Z-12) — no channel carries a
  human name.
- All new derivations named `xxx()` below are pure functions in `client/src/ui/room-model.js`,
  node-tested (per `client/README.md` + the node-test golden discipline): `roomTileRect`
  (reads the `decks` slot), `tileFromCanvasXY`, `clampTileToRoom`,
  `roomCells`, `roomCrew`, `roomDesigns`, `paletteCommand`, `escStackRung`.

---

## 0. Mode & entry model (read first) (IX-Z-01 … IX-Z-05)

- **IX-Z-01** The Room Zoom is **entered from the Overview** by clicking a room (Overview spec owns
  that click; it passes a `roomId`). On entry the client sets `focusRoom = roomId`, arms nothing
  (`armedTool = null`), and renders the room from the latest `frame` + `decks` + `rooms` +
  `designs` + `decor` (the `decks` slot supplies the tile-rect geometry, `rooms` its atmosphere).
  No wire request is required to open — the room's tiles are already in the streamed `frame`; the
  `decks`/`rooms`/`decor` channels are snapshot-cached (arrive on connect).
- **IX-Z-02** The Room Zoom has exactly two overlay concepts on top of the plain room view: (a) the
  `armedTool` slot (canvas input mode), (b) whatever floating panels the game-ui already owns
  (dialogue / citizen). Selecting a palette tool is not a "mode change" beyond arming that slot; the
  palette is always visible.
- **IX-Z-03** Arming any tool disarms the previous one (single slot). Leaving the Room Zoom
  (IX-Z-40/41), the deck changing out from under the focus room, and disconnect all disarm.
- **IX-Z-04** All selected/active visual states (armed palette button, ghost tiles, minimap
  highlight, breadcrumb leaf) render from **authoritative wire state on the next matching message** —
  never from click optimism. The only client-latched visuals are: the armed-tool highlight, the
  focusRoom identity, and the transient placement pulse (IX-Z-27).
- **IX-Z-05** **This spec does not define the Overview.** How the deck grid is drawn, how a room is
  chosen, and Overview-level navigation are `docs/design/perilune-overview.*`. This spec begins the
  moment a `roomId` is handed in and ends when ESC/breadcrumb pops back to the Overview (IX-Z-40).

---

## 1. Coordinate & hit-testing (IX-Z-10 … IX-Z-13)

- **IX-Z-10** **Canvas tile from pointer.** A canvas click at client `(cx, cy)` resolves to an
  absolute tile via the pure `tileFromCanvasXY(cx, cy, rect, focusRoom)`: undo the fit transform
  (VS-Z-16) to logical space, `floor(logicalX / U)` + `rx` = `tx`, `floor(logicalY / U)` + `ry` =
  `ty`. This is the responsive generalisation of the mock's fixed math
  (`floor((cx-rect.left)*(1488/rect.width)/32)*32`), which assumed a 1488px canvas and 32px tiles;
  the client uses the live `rect` and `U*s`.
- **IX-Z-11** **In-room clamp.** A resolved tile is valid only if `clampTileToRoom(tx, ty,
  focusRoom)` says it is inside `[rx, ry, rw, rh]`. A click outside the room's tiles (on the
  letterbox margin or a tile beyond the rect) is DROPPED client-side — no command, no pulse. There
  is no cross-room placement in Level 2 (the mock clamps to `x∈[6,1450] y∈[6,634]`; the client
  clamps to the room rect, which is stricter and correct).
- **IX-Z-12** **One tile, one object.** Placement, demolish, and selection all address exactly the
  one tile under the pointer. Drag-to-paint is NOT in v1 (a single click per tile keeps the
  authoritative-ghost model honest — IX-Z-24); it is an append-ready future.
- **IX-Z-13** **Hover.** While a tool is armed, pointer hover over an in-room tile sends the
  existing `Cmd.cursor(tx, ty)` (the host reticle doubles as the placement preview, unchanged from
  the game-ui build flow, IX-33). Hover over the letterbox margin sends nothing.

---

## 2. Palette tool selection (IX-Z-14 … IX-Z-17)

- **IX-Z-14** Palette tools, in order (VS-Z-46): `WALL`, `DOOR`, `BUNK`, `DESK`, `CHAIR`, `LOCKER`,
  `SHELF`, `LAMP`, `RUG`, `PLANT`, `⌫ DEMOLISH`. Clicking a tool arms it (and disarms any other);
  clicking the armed tool again disarms it (toggle to `null`). Armed styling per VS-Z-47.
- **IX-Z-15** The palette is grouped by **command class** (this drives §3, not the visual order):
  - **Structural** — `WALL`, `DOOR` → the existing `Cmd.build` path (IX-Z-20).
  - **Functional furniture** — `BUNK`, `DESK`, `CHAIR`, `LOCKER`, `PLANT`, `LAMP` → the NEW
    place/remove-device command contract (IX-Z-21), implemented in the sim lane.
  - **Cosmetic decor** — `RUG`, `SHELF` (and the wider decor set) → the view-only decor layer
    (IX-Z-23); never a sim entity.
  - **Demolish** — `⌫ DEMOLISH` → context-dependent removal (IX-Z-24).
  The pure `paletteCommand(tool)` returns the class + the wire verb, node-tested exhaustively.
- **IX-Z-16** **Single input slot.** Arming a palette tool disarms a move order / any other tool
  by construction (IX-Z-03). Palette tools and the game-ui move order cannot be armed together.
- **IX-Z-17** **Keyboard.** The Room Zoom reuses the game-ui build accelerators where they map:
  `B` toggles the BUILD/`WALL` tool, `X` toggles `⌫ DEMOLISH`; both sit after the
  `isTextEntryTarget` guard (game-ui IX-11) so typing in a chat/MOSS field never arms a tool. No
  new per-item hotkeys in v1 (eleven letters would collide with pan/lens keys); the palette buttons
  are the full keyboard-free control surface.

---

## 3. Command mapping — CRITICAL (IX-Z-20 … IX-Z-26)

Each requirement is exactly one command class → one wire behavior.

- **IX-Z-20** **WALL / DOOR → existing build path.** With `wall` or `door` armed, a valid in-room
  canvas click (IX-Z-11) sends exactly one `Cmd.build(kind, tx, ty)` — the game-ui build command,
  keyed `cmd:"build"`, unchanged — which the host lowers to `DesignateBuildCommand(pos,
  BuildKind.Wall|BuildKind.Door)` (`sim/Sim.Core/Commands/Commands.cs:144`, `BuildKind.Wall=0`
  `Door=1`). Confirmation is the wire: the designation appears in the next `designs` frame as a
  ghost (VS-Z-30) or does not (the sim may legally refuse — `CanDesignate`), never an optimistic
  client ghost. This reuses the shipped, tested command; the Room Zoom adds no new structural verb.
- **IX-Z-21** **Functional furniture → NEW PlaceDeviceCommand (sim, Phase 4).** With `bunk` / `desk`
  / `chair` / `locker` / `plant` / `lamp` armed, a valid click issues a NEW command whose CONTRACT
  is specified here but whose IMPLEMENTATION lands in the sim lane. The contract:

  ```
  PlaceDeviceCommand(Int3 pos, DeviceKind kind)     // designate a furniture device at a floor tile
  RemoveDeviceCommand(uint deviceId)                // remove a placed furniture device (IX-Z-24)
  ```

  Tool → `DeviceKind` (`sim/Sim.Core/Entities/Device.cs`):
  `BUNK→Bed(17)`, `DESK→Desk(23)`, `CHAIR→Chair(19)`, `LOCKER→Locker(22)`, `PLANT→PlantPot(24)`,
  `LAMP→Light(8)`. Wire verb: a new `Cmd.place(kind, tx, ty)` in `session.js`, keyed `cmd:"place"`
  (append-only; the host maps `kind` string → `DeviceKind`). Legality (floor tile, unoccupied,
  in-room) is decided sim-side at the tick boundary, exactly like `Cmd.build`. **Until the sim lane
  lands `PlaceDeviceCommand`, the client wires `Cmd.place` and shows the input pulse (IX-Z-27); the
  furniture appears only when the sim confirms it in the next `frame`.** No client-side furniture
  ghost is invented (same honesty rule as IX-Z-20). This spec pins the shape; the sim lane owns the
  behavior, the save chapter, and the hash fold.
- **IX-Z-22** **Furniture placement feedback** matches the build path: the placed device, once the
  sim accepts it, streams as a `frame` cell (glyph `b`/`D`/`h`/`L`/`P`/`*`) and re-skins to its warm
  SVG item (VS-Z-19). Furniture with a material cost surfaces its ledger through the same `designs`
  ghost mechanism IF the sim models it as a staged build; furniture placed instantly (no cost) skips
  the ghost and appears directly. Which of the two the sim does is the sim lane's call; the client
  renders whichever the wire reports.
- **IX-Z-23** **Cosmetic decor → view-only, NON-hashed layer.** With `rug` / `shelf` armed (and the
  wider decor set), a valid click places the item into the **`decor` layer** (VS-Z-34) and NEVER
  emits a sim command. Decor is authored to the read-only `decor` channel via a host-side, non-sim
  store (VS-Z-04): the client sends `Cmd.decor('add', itemId, tx, ty)` / `Cmd.decor('remove',
  itemId, tx, ty)` (keyed `cmd:"decor"`); the host records it in the non-hashed decor store and
  echoes the updated `decor` channel. **It is never an `ISimCommand`, never enters the tick, never
  hashes, never affects pathing/pressure/save-checksum** (VS-Z-36). If the host has no decor store
  yet, the client MAY render decor purely locally (session-only) — but it still never touches the
  sim. Placement is instant and local; there is no legality gate beyond "in-room floor tile".
- **IX-Z-24** **DEMOLISH is context-dependent** (the mock removes any placed ghost; the honest
  client distinguishes what a tile holds):
  - Click a tile with a **pending build designation** (a `designs` ghost, wall/door/furniture) →
    `Cmd.build('cancel', tx, ty)` (game-ui cancel path → `DesignateBuildCommand(pos, kind,
    on:false)` → `BuildSystem.Cancel`, which removes the pending designation and refunds staged
    material — `Commands.cs:161`). This CANCELS a queued order; it is not demolition of built
    structure.
  - Click a tile with a **cosmetic decor** piece → `Cmd.decor('remove', itemId, tx, ty)` (IX-Z-23);
    instant, local, non-sim.
  - Click a tile with a **placed functional device** → `RemoveDeviceCommand(deviceId)` via a new
    `Cmd.remove(tx, ty)` (`cmd:"remove"`; the host resolves the tile → device id) — sim lane,
    Phase 4, same deferral as IX-Z-21.
  - Click a tile with a **built wall/door** (already constructed, not pending) → demolition of built
    structure requires a NEW `DesignateDemolishCommand(pos)` (sim lane). **v1 does NOT ship built-
    wall demolition** unless the sim lane provides that command; until then, DEMOLISH on a built
    wall is a no-op with the status line `CANNOT DEMOLISH BUILT STRUCTURE — CANCEL ONLY REVOKES
    QUEUED ORDERS` (the honest limit, mirroring game-ui IX-31). The command is named here so the sim
    lane can add it; the client wires `Cmd.demolish(tx, ty)` (`cmd:"demolish"`) only once it exists.
  The pure `demolishTarget(tx, ty, designs, decor, frame)` classifies the tile into exactly one of
  {pending, decor, device, built-wall, empty} and returns the verb; node-tested. Empty-tile
  demolish is a dropped no-op.
- **IX-Z-25** **DEMOLISH precedence** when a tile holds more than one thing (e.g. a decor rug under a
  pending bunk ghost): the fixed order is **pending designation → placed device → decor → built
  structure**. Demolish acts on the highest-precedence item present and stops (one click, one
  removal). This is deterministic and node-tested; the player clicks again to remove the next layer.
- **IX-Z-26** **Confirmation is the wire** for every sim-backed class (build, place, remove, cancel,
  demolish): the change appears (or does not) in the next `frame`/`designs`, ~100 ms. Decor
  (IX-Z-23) is the sole exception — it is view-only, so it updates immediately from the local/echoed
  `decor` channel. No sim-backed action gets a persistent optimistic ghost.

---

## 4. Placement feedback & ghosts (IX-Z-27 … IX-Z-29)

- **IX-Z-27** **Input pulse (the one transient).** Every placement/demolish click draws a single
  fading tile-outline pulse at the clicked tile, ≤150 ms, drawn by the view layer over the canvas
  using the same fit transform (VS-Z-16): amber `#f2b563` for build/place, ember-red `#e07a5f` for
  demolish/cancel. It acknowledges the INPUT ("your order was sent"), not the OUTCOME, and never
  survives into a second frame. It is NOT drawn by the render executors (do-not-touch list).
- **IX-Z-28** **Authoritative ghosts only** (VS-Z-30). Pending sim designations render from the
  `designs` channel, clamped to the room (`roomDesigns(designs, focusRoom)`), with their supply
  ledger (VS-Z-32). The client never invents a ghost and never lingers one over a refusal: an
  illegal designation never enters `Pending`, and a built/cancelled one drops off `designs`, so the
  ghost vanishes on the next update.
- **IX-Z-29** **Decor is not a ghost.** A placed decor piece renders live in the decor layer the
  instant it is placed (IX-Z-23); it has no ghost, no ledger, no "under construction" state. This is
  why RU/SH are absent from the authoritative ghost abbreviations (VS-Z-31).

---

## 5. Crew in the room (IX-Z-30 … IX-Z-31)

- **IX-Z-30** **Pawn click = select** (only when NO tool is armed). With `armedTool === null`, a
  canvas click on a tile holding a `frame.crew` member sends the game-ui `Cmd.click(tx, ty)`; the
  host answers with `citizen` + `frame.sel`, and the game-ui readout / biography flow takes over
  unchanged (this is the game-ui selection path, IX-45, reached from inside the Room Zoom). Talking
  (`T`) works on the selected crew exactly as game-ui IX-51.
- **IX-Z-31** **While a tool IS armed, a canvas click never selects crew** — it places / demolishes
  (IX-Z-20…24), even on a tile a crew member stands on (the sim decides legality — e.g. placing on
  an occupied tile may be refused). This mirrors game-ui IX-32: an armed tool owns the canvas click.

---

## 6. Breadcrumb & minimap navigation (IX-Z-32 … IX-Z-35)

- **IX-Z-32** **Breadcrumb `‹ PERILUNE`** (VS-Z-38) → pops the Room Zoom back to the **Overview**
  (Level 1), deferring to `docs/design/perilune-overview.*` for what the Overview then shows. It is
  the same rung ESC pops (IX-Z-40). Disarms any armed tool on the way out (IX-Z-03).
- **IX-Z-33** **Breadcrumb `DECK {n}`** (VS-Z-38) → pops to the Overview focused on that deck
  (Overview spec owns "focused on deck n"). Same disarm-on-exit.
- **IX-Z-34** **Minimap slot click** (VS-Z-44): clicking a non-current room slot switches
  `focusRoom` to that room (a lateral Level-2 → Level-2 move — stay in Room Zoom, re-render for the
  new room), arms nothing, and disarms any armed tool. Clicking the current (highlighted) slot is a
  no-op. Because the minimap is the SHARED component (VS-Z-40), its slots resolve to room ids the
  same way in both surfaces; only the click HANDLER differs (Overview: open Room Zoom; Room Zoom:
  swap focusRoom), injected by the host view.
- **IX-Z-35** **A lateral room swap keeps the sim untouched** — no deck command is sent if the new
  room is on the same deck; a cross-deck minimap slot first sends `Cmd.deck(targetDeck -
  frame.deck)` then swaps focusRoom on the first frame with the matching deck (the game-ui pending-
  cross-deck-click pattern, IX-42, reused as a pure reducer). Nothing is placed by navigation.
  **Integrator note:** deck navigation uses the already-shipped relative `Cmd.deck(delta)`
  (`session.js` `deck:(dz)`); the approved plan's `Cmd.deckTo(z)` is SUPERSEDED and not needed.

---

## 7. The ESC stack rung (IX-Z-40 … IX-Z-42)

- **IX-Z-40** **Room Zoom occupies one rung of the shared ESC stack.** The stack is owned by
  `main.js`'s single `onEscape` handler (game-ui IX-13); this spec inserts the Room-Zoom rung and
  DEFERS the rest to the Overview and game-ui specs. Final priority order, top wins:
  1. If a text-entry element is focused: the guard already routes only Escape through; the stack
     below runs (Esc while typing with a tool armed disarms the tool first — one stack, no special
     cases). (game-ui IX-13.1)
  2. Else if `armedTool !== null` → **disarm it** (stop; consume the key). (game-ui IX-13.2, extended
     to the eleven Room-Zoom tools.)
  3. Else if a dialogue/panel is open → the game-ui panel-close rung (game-ui IX-13.3).
  4. **Else if the Room Zoom is showing (`focusRoom !== null`) → pop Room Zoom → Overview**
     (`focusRoom = null`; hand control to the Overview surface). ← the rung this spec adds.
  5. Else → the Overview's own ESC behavior, per `docs/design/perilune-overview.*` (NOT defined
     here). Esc never deselects crew and never closes the citizen card (game-ui IX-13.4).
- **IX-Z-41** Popping the Room Zoom (rung 4, or the breadcrumb IX-Z-32) disarms any armed tool
  first only if rung 2 did not already consume the Esc — i.e. one Esc either disarms a tool OR pops
  the room, never both in a single keypress (the player presses Esc twice to disarm-then-exit).
  The breadcrumb click, having no armed-tool rung, disarms AND pops in its single action (IX-Z-03).
- **IX-Z-42** **Disconnect** (game-ui IX-96) while in the Room Zoom: `armedTool → null`, any pending
  cross-deck room swap (IX-Z-35) is dropped, `focusRoom` is retained (the room re-renders from the
  snapshot replay on reconnect — `frame`/`decks`/`rooms`/`designs`/`decor` all repopulate without
  user action). Panels stay open (they are the player's record).

---

## 8. Degraded & edge states (IX-Z-50 … IX-Z-53)

- **IX-Z-50** **Room with no furniture / empty room**: renders bare floor + grid + ambient glow; the
  palette and placement work normally. No skeleton, no placeholder — an empty cabin is a real state
  and the point of the build view.
- **IX-Z-51** **Focus room vanishes** (its `anchorName` binding no longer present in the `decks`
  channel — e.g. a hull breach merged rooms): the Room Zoom pops to the Overview (rung 4 semantics)
  with the status line `ROOM NO LONGER EXISTS`. The client never renders a stale rect for a room
  the wire dropped.
- **IX-Z-52** **Pre-first-`decks`** (opened before the geometry channel lands, rare — it is
  snapshot-cached): the canvas shows the floor at a best-effort single-tile-rect from `frame` bounds
  and the palette is disabled with the hint `AWAITING ROOM DATA…`; it enables the instant the
  `decks` slot geometry (and `rooms` atmosphere) arrives. No fabricated tile-rect that could place a
  wall in the wrong room.
- **IX-Z-53** **Sim-command classes gated by the sim lane** (place / remove-device / built-wall
  demolish, IX-Z-21/24): until those commands exist server-side, arming the tool is allowed and the
  input pulse fires, but the status line reports `{TOOL} — PLACEMENT LANDS WITH THE SIM BUILD PASS`
  and nothing persists. This is a visible-honest deferral, not a dead button (the tool DOES exist and
  WILL work; it is the game-ui "no dead buttons" rule applied to a staged feature). WALL/DOOR/RUG/
  SHELF/CANCEL work in v1 with no such gate.

---

## 9. Precedence clause (IX-Z-54)

- **IX-Z-54** When this spec conflicts with another authority: on the **Overview** surface and
  Overview-level navigation (including what "pop to Overview" and "DECK n" show), and on the
  **shared deck-minimap** slot-resolution contract, `docs/design/perilune-overview.*` wins; on
  **palette / material / item appearance**, `docs/design/perilune-art-direction-warm.md` wins; on
  **wire-channel shape and command keys**, `docs/design/perilune-wire-channels.spec.md` +
  `client/src/wire/messages.js` + `sim/Sim.Core/Commands/Commands.cs` win; on **the ESC stack, the
  keyboard guard, panels, and the build/select/talk flows this view reuses**,
  `docs/design/perilune-game-ui.interaction-spec.md` wins. This spec is authoritative only for the
  Level-2 Room Zoom's own interactions — tool arming, tile hit-testing, the four command classes,
  the placement/demolish/decor flows, minimap/breadcrumb navigation within Level 2, and the ESC rung
  it inserts. Where two authorities both apply, the more specific (Room Zoom > Overview > game-ui)
  governs.

---

## Test obligations (summary)

New pure, node-tested functions (`client/src/ui/room-model.js` + `client/test/`): `roomTileRect`,
`tileFromCanvasXY` (incl. letterbox-margin rejection and responsive-rect math),
`clampTileToRoom`, `roomCells` / `roomCrew` / `roomDesigns` (channel-clamp to the room rect),
`paletteCommand` (every one of the eleven tools → class + verb, exhaustive), `demolishTarget` +
`demolishPrecedence` (every {pending, device, decor, built-wall, empty} case and multi-layer
ordering), the armed-tool transition table (arm / disarm / single-slot / exits as a pure reducer,
extended to eleven tools), the pending-cross-deck room-swap reducer (IX-Z-35), and `escStackRung`
(the four-rung priority incl. the Room-Zoom pop). No test pins a DOM id/class (existing convention).
The sim-lane commands (`PlaceDeviceCommand` / `RemoveDeviceCommand` / `DesignateDemolishCommand`)
carry their own dotnet save+hash+round-trip tests in the sim lane, per the CLAUDE.md def-field /
hashed-state invariant — NOT in this client spec's scope.
