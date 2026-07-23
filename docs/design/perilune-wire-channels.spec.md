# Perilune warm-SVG wire channels — `decks` / `rooms` / `decor`

**Status:** DATA CONTRACT (spec only — nothing built). Authority for the three NEW
view-only wire channels the warm SVG rework (Overview + Room Zoom) consumes.

Companion docs: `perilune-item-mapping.md` (the 60-piece item set → sim reality),
`perilune-game-ui-warm.dc.html` (Overview / Level-1 consumer),
`perilune-room-zoom.dc.html` (Room Zoom / Level-2 consumer).

---

## 0. What these channels are, and the class they join

The warm SVG views do not re-skin the WebGL tile renderer. They are pure SVG/DOM
(`client/src/ui/overview-view.js`, `roomzoom-view.js`) driven by the live wire. The
`frame` channel already carries the tile glyphs and `roster` the crew; these three new
channels carry what the warm views additionally need:

- **`decks`** — the 8-slot compartment grid of every deck (room *geometry* + live occupancy).
- **`rooms`** — per-room atmosphere derived from `RoomState` (for LENS overlays, the
  SELECTED-room atmos box, and the CAUTION · CO2 chip).
- **`decor`** — cosmetic, view-only furniture placements (rug, bookshelf, viewport, …).

**`decks` and `rooms` join the exact channel class of `systems` and `roster`** — a
*cached state channel*, established in `client/src/wire/messages.js` and
`hosts/web/GameSession.cs`:

- **Rebuilt each render** on the sim thread, from live sim state, alongside
  `BuildRoster()` (`GameSession.Render`, `GameSession.cs:794`).
- **Deduped** — `Send(channel, json, force)` broadcasts only when the exact JSON string
  changed since last render (`GameSession.cs:835`). An idle ship puts nothing on the wire.
- **Snapshot-replayed on connect** — a freshly-connected tab is caught up from the cache
  (`GameSession.Snapshot`, `GameSession.cs:158`). New channels MUST be added to that key
  list or a reconnecting client renders an empty ship.
- **NOT fog-gated.** A ship's own deck plan, room atmosphere, and decor are fixed crew
  knowledge — the same rule the doc comments already state for `roster`, `designs`,
  `terminals`, `relations`, and `systems`. (`frame` and `light` remain fog-gated; these
  three are not.)

**`decor` is a *different* animal** — a persisted, deliberately **NOT-hashed** view layer.
Its contract is §3 below and is the one place these channels touch save state at all.

> ### Determinism statement — read this first, loudly
> **None of these three channels moves the sim determinism hash.** `decks` and `rooms`
> are a *pure read* of `RoomState`/`Room` derived properties, which store nothing and are
> already excluded from `Simulation.StateHash` (see the class doc on `Room` in
> `RoomState.cs:9-16`: "every property below is derived on read and stores nothing").
> `decor` is a **saved-but-not-hashed** carve-out modelled exactly on
> `DeviceLayout.Entry.YawDeg` — "the sim ignores it — the view layer applies it"
> (`Sim.Gen/DeviceLayout.cs:23`). The pinned proof hash **`616ed4a84a9f6e87`**
> (`--days 3 --seed 42`, `ci.sh`) and the tick-3000 goldens **do not move** when these
> channels are added. Any change here that moves a pin is a bug in this spec.

---

## 1. `decks` — the compartment grid

The warm Overview draws each deck as a 2×4 grid of 8 room slots plus a spine corridor
(`perilune-game-ui-warm.dc.html`, "2x4 grid of ROOM compartments"). Room Zoom clamps
`frame.cells` to one slot's tile-rect (`perilune-room-zoom.dc.html`). Both need the slot
geometry and which slots are real rooms right now.

### 1.1 Line shape

```json
{"type":"decks","decks":[
  {"deck":1,"slots":[
    [0, 4, 6, 12, 8, "hab1", 5, true, true],
    [1, 16, 6, 12, 8, "", 0, false, false],
    ...
  ]}
]}
```

- Outer: `{type, decks:[DeckEntry]}`, one `DeckEntry` per deck, **all decks present from
  the first frame** (an empty ship still ships every deck).
- `DeckEntry = {deck:int, slots:[SlotTuple]}` — always **exactly 8** slot tuples, in a
  stable slot order (row-major over the 2×4 grid; slot order is a host decision, never a
  client sort — same rule as the `systems` rows and `relations` ring).
- `SlotTuple = [slotIndex, x, y, w, h, anchorName, roomType, occupied, active]`:
  - `slotIndex` — 0..7, the slot's fixed grid position.
  - `x, y, w, h` — the slot's **tile rect** on this deck (the flattened `tileRect{x,y,w,h}`;
    tile coords in the same space as `frame`/`roster`/click coords). Room Zoom clamps
    `frame.cells` to this rect; Overview places the compartment `<svg>` from it.
  - `anchorName` — the `RoomAnchor.Name` of the room occupying this slot, or `""` when the
    slot is an **empty hall** (unbuilt / bare corridor). This is the key that joins to a
    `rooms` row and to the MOSS namespace (`hab1.o2`).
  - `roomType` — the `RoomType` **byte** (0 None … 15 LifeSupport; ids are stable and
    never reorder, `RoomType.cs`). The client maps it to a material/label. `0` for an
    empty hall.
  - `occupied` — bool, **DERIVED each tick, never guessed by the client**: true iff a real
    (non-vacuum, non-empty) room currently fills the slot.
  - `active` — bool, **DERIVED each tick**: the room is powered/functioning enough to read
    as "lit and alive" (host-derived from live state — e.g. a powered `Light`/life-support
    presence or non-vacuum pressure; the host owns the exact predicate). The Overview uses
    it to decide the amber glow-pool vs a dark compartment.

### 1.2 Requirements

- **DA-D1** — `decks` is a cached, deduped, snapshot-replayed, **NOT fog-gated** state
  channel (§0). It MUST be added to the `GameSession.Snapshot` key list.
- **DA-D2** — Every deck the sim has is present in every `decks` message from the first
  (primed) frame. Decks never appear/disappear mid-run; only slot contents change.
- **DA-D3** — Exactly 8 slot tuples per deck, `slotIndex` 0..7 in a fixed host order. The
  client renders slots by their `slotIndex`, never by array position and never re-sorted.
- **DA-D4** — `occupied` and `active` are computed host-side from live `RoomState`/power
  each render. **The client MUST NOT infer occupancy from geometry or from `frame`.** An
  empty slot (`occupied:false`, `anchorName:""`) renders as an empty hall.
- **DA-D5** — `x,y,w,h` are integer tile coords in `frame`/click space. Room Zoom's
  clamp of `frame.cells` to `[x, x+w) × [y, y+h)` MUST land on real tiles.
- **DA-D6** — `SlotTuple` is **append-only**: any future field is a trailing element, so a
  reader that knows only the first nine is unaffected and an older host that sends nine
  still parses (the `DesignCell`/`RosterEntry` append-only rule).
- **DA-D7** — Moves **no** determinism hash. Pure read; nothing saved, nothing hashed.

### 1.3 Host derivation note

Built in `GameSession.Render` alongside `BuildRoster()`/`BuildSystems()` as
`BuildDecks()` → `WireFormat.Decks(...)`. Pure derivation: no mutation, no RNG, no
`SimDefs` writes. It reads `RoomState.Anchors` (slot ↔ anchor ↔ room) and each slot's
tile rect from the ship's fixed deck layout; `occupied`/`active` fold live `Room`
state and power. `RoomState.RecomputeIfDirty` must have run for the frame (it already
does in the tick). Numbers serialized with **InvariantCulture** (dev machine is de-DE).

### 1.4 Client decode note

Mirror `systems`/`roster`: a tolerant per-line decoder in `wire/messages.js` (malformed
line dropped, never thrown). No RLE plane here (geometry is tiny). `overview-model.js`
turns tuples into slot view-models; `room-model.js` reads one slot's rect to clamp
`frame`. There is deliberately no re-derivation of `occupied`/`active` client-side.

---

## 2. `rooms` — per-room atmosphere

Feeds the LENS overlays (pressure/O2/CO2/temp), the SELECTED-room **CURRENT ROOM** atmos
box (O2/CO2/temp/power in `perilune-game-ui-warm.dc.html`), and the blinking
**CAUTION · CO2** chip. Straight from `Room` derived properties.

### 2.1 Line shape

```json
{"type":"rooms","rooms":[
  ["hab1", 1, 0.209, 512.0, 101.3, 293.0, 96],
  ["hydro", 1, 0.188, 16677.0, 58.1, 288.4, 40]
]}
```

- `RoomTuple = [anchorName, deck, o2, co2ppm, pressureKPa, tempK, tileCount]`:
  - `anchorName` — the `RoomAnchor.Name`, joining to the `decks` slot with the same name.
  - `deck` — the room's deck (z), for client bucketing.
  - `o2` — `Room.O2Fraction` (0..1 mole fraction). The client shows a %; partial-pressure
    reasoning (a 21% room can still suffocate at 8 kPa) stays a client presentation choice.
  - `co2ppm` — `Room.CO2Ppm` (parts-per-million by mole). Drives the CO2 lens ramp and the
    CAUTION chip (the shipped ramp bands are 1,000 / 2,000 ppm — client-side thresholds).
  - `pressureKPa` — `Room.PressureKPa`.
  - `tempK` — `Room.TemperatureK` (kelvin; the client formats °C).
  - `tileCount` — `Room.TileCount` (also the SELECTED box's size readout).

One row **per real room**; the vacuum sink (room 0) and empty halls are omitted (they
have no anchor / no meaningful atmosphere). Rows keyed by `anchorName`, so a room survives
a topology recompute even as its internal room id churns.

### 2.2 Requirements

- **DA-R1** — Cached, deduped, snapshot-replayed, **NOT fog-gated** state channel (§0);
  added to `GameSession.Snapshot`.
- **DA-R2** — Every value is a **direct read** of a `Room` derived property via the room's
  anchor. The host performs **no** unit conversion beyond what the property already yields
  (fraction stays a fraction, ppm stays ppm, K stays K); all display formatting — %, °C,
  rounding — is the client's job. Raw values only (the `systems` "ship the raw tick count,
  the client formats" rule).
- **DA-R3** — Serialized with **InvariantCulture**. (A de-DE `,` decimal separator here is
  a live culture bug — the same class the codebase already guards.)
- **DA-R4** — Row order is a host decision; the client never sorts the ring. Rooms with no
  anchor (vacuum, empty halls) are absent, not zero-filled.
- **DA-R5** — `RoomTuple` is append-only (trailing fields only).
- **DA-R6** — Moves **no** determinism hash. `Room`'s properties are derived-on-read and
  already outside `Simulation.StateHash`.

### 2.3 Host derivation note

`BuildRooms()` in `GameSession.Render`, beside `BuildRoster()`. For each
`RoomState.Anchors` entry, resolve `RoomState.RoomAt(world, anchor.Probe)` and read
`O2Fraction`/`CO2Ppm`/`PressureKPa`/`TemperatureK`/`TileCount`. Pure; no mutation, no RNG.
`RecomputeIfDirty` must have run this tick (it does). This is the same data
`ShipMetrics.Co2Ppm` (worst pressurized room) and the MOSS `room.o2`/`room.co2` read —
so `rooms` and the `systems`/HUD numbers agree by construction.

### 2.4 Client decode note

Tolerant per-line decoder mirroring `systems`. `overview-model.js` keys rooms by
`anchorName` to fill the LENS tints and the SELECTED atmos box; the CAUTION · CO2 chip is
`max(co2ppm)` over the current deck's rooms against the client CO2 bands.

---

## 3. `decor` — cosmetic, view-only, **NOT hashed**

The warm views place furniture the sim does not model: rug, bookshelf, framed photo,
viewport/porthole, deck sign, storage crate, fuel drum, standing/wall lamp glow, etc.
(the COSMETIC column of `perilune-item-mapping.md`). This is a **persisted view layer that
is deliberately excluded from the determinism hash** — the single, explicit
saved-but-not-hashed carve-out these channels introduce.

### 3.1 The precedent (why this is allowed)

`DeviceLayout.Entry.YawDeg` is the shipped precedent: a value that is **saved and applied
by the view layer but ignored by the sim** — `// the sim ignores it — the view layer
applies it` (`Sim.Gen/DeviceLayout.cs:23`), and its yaw-only entries are explicitly
skipped by the structural-device guard (`DeviceLayout.cs:47`). `decor` extends the same
principle to a whole placement layer: it changes what the player sees, never what the sim
computes, so it must never enter `Simulation.StateHash`.

> This is an *intentional* exception to the "every saved field is hashed" invariant, and
> it is confined to `decor`. It does **not** live in a sim save chapter that folds into
> `StateHash`. It is written to a **separate, non-hashed view-state sidecar** (host-owned
> file IO, like `DeviceLayout.json`), so round-trip determinism proofs are untouched. If a
> `decor` field ever needs to affect the sim, it stops being decor and becomes a
> `DeviceKind` (see the item-mapping "needs a NEW DeviceKind" flags).

### 3.2 Line shape

```json
{"type":"decor","items":[
  [1, 12, 7, "rug", 0, 0],
  [1, 15, 6, "bookshelf", 90, 0]
]}
```

- `DecorTuple = [deck, x, y, itemId, yawDeg, variant]`:
  - `deck, x, y` — placement tile, in `frame`/click space.
  - `itemId` — a stable string id from the item library (the COSMETIC rows of
    `perilune-item-mapping.md`, e.g. `"rug"`, `"bookshelf"`, `"viewport"`, `"deck_sign"`).
  - `yawDeg` — visual rotation, exactly the `YawDeg` role (0/90/180/270; view applies it).
  - `variant` — optional cosmetic variant index (palette/orientation); default 0.

### 3.3 Requirements

- **DA-C1** — `decor` is **NEVER folded into any determinism hash**. It is persisted in a
  **separate non-hashed view sidecar**, not in a sim save chapter. Pin `616ed4a84a9f6e87`
  and both tick-3000 goldens are unmoved by any decor content. (Adding `decor` is
  explicitly **not** a "save + hash + round-trip in the same commit" field.)
- **DA-C2** — `decor` is a cached, snapshot-replayed, **NOT fog-gated** state channel like
  the others (so a placed rug survives reconnect), but its *persistence* is the sidecar,
  not the sim save.
- **DA-C3** — The sim never reads `decor`. No system, job, effect, pathfinder, or room
  recompute may branch on a decor item. It is inert exactly as `YawDeg` is inert.
- **DA-C4** — `DecorTuple` is append-only (trailing fields only). An older host that ships
  four elements still parses.
- **DA-C5** — `itemId` MUST be a COSMETIC-classified item from `perilune-item-mapping.md`.
  A FUNCTIONAL item is placed as a real `Device` (a sim command), never as decor.

### 3.4 Host derivation / client decode note

The host owns decor file IO (a `decor.json`-class sidecar, InvariantCulture), loads it at
boot, and ships `BuildDecor()` on the cached channel. Placement/removal from Room Zoom is
a **view-only mutation of the sidecar**, not an `ISimCommand` — contrast a FUNCTIONAL
piece, which lowers to `PlaceDeviceCommand`. Client decode mirrors `roster` (tolerant
per-line); `roomzoom-view.js`/`overview-view.js` draw each `itemId` with its warm SVG
builder at `(x,y)` rotated by `yawDeg`.

---

## 4. Checklist for the implementer

- [ ] Add `decks`, `rooms`, `decor` to the `GameSession.Snapshot` key list (DA-D1/R1/C2).
- [ ] `BuildDecks/BuildRooms/BuildDecor` on the sim thread beside `BuildRoster` — pure,
      InvariantCulture, no mutation/RNG.
- [ ] `decks`/`rooms` read only derived `Room`/`RoomState` props — confirm StateHash and
      pin `616ed4a84a9f6e87` + both tick-3000 goldens are unmoved (DA-D7/R6).
- [ ] `decor` persisted to a **separate non-hashed sidecar**, never a sim chapter (DA-C1);
      confirm the pins are unmoved with decor present and round-tripped.
- [ ] Tolerant per-line decoders in `wire/messages.js`; all display formatting client-side.
- [ ] Append-only tuples throughout (DA-D6/R5/C4).
```
