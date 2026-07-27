# Perilune item mapping — the 60-piece warm set → sim reality

**Status:** DATA CONTRACT (spec only). The authority for **Phase 1** (the item library,
`client/src/items/*`) and **Phase 4** (furniture placement / decor). Maps every one of the
60 pieces in `perilune-item-set.dc.html` to its class in the sim:

- **FUNCTIONAL** — a real interactive machine → a `DeviceKind` (`sim/Sim.Core/Entities/Device.cs`).
  Placing it lowers to a sim command (`PlaceDeviceCommand`). Sub-flagged **[exists]** (map to a
  live `DeviceKind`, pure re-skin, no sim change) or **[NEW]** (needs a new `DeviceKind` — a sim
  change in its own commit: enum id + MachineDefs row + save/hash coverage).
- **COSMETIC** — view-only decor → the non-hashed `decor` channel
  (`perilune-wire-channels.spec.md` §3). Never a `Device`; never hashed.
- **MATERIAL** — a buildable wall/floor tint → material tables + buildable variants; not a device.

The **sim glyph** column is the semantic glyph the piece maps to. **⚠️ IT IS LOAD-BEARING SINCE
2026-07-26 and it is no longer cross-checked against `SPRITE_FOR_GLYPH`.** `client/src/items/glyph-map.js`
derives the one glyph → itemId table BOTH SVG surfaces skin from straight out of this column, as it is
transcribed into `client/src/items/index.js`.

⚠️ **The original sentence is quoted because it caused a shipped bug**: *"cross-checked against
`client/src/render/glyphs.js` `SPRITE_FOR_GLYPH` (glyph → sprite role) — the WebGL skin's existing
mapping. `—` = no glyph entry (door/pawn/growbed/terminal/conduit/pipe are handled directly in the
executor switch, not via `SPRITE_FOR_GLYPH`)."* That is true **of the WebGL/canvas skin only**
(`hosts/web/Client.html:630,634` really do draw growbed and terminal in the executor switch). The SVG
Overview and Room Zoom have **no executor switch**, so for them a `—` silently meant *no art*: GrowBed,
Terminal and Telescope rendered as dashed boxes with a raw ASCII letter in them, in the shipping game,
until the owner photographed it (`docs/HANDOVER.md` §4l). Rows 7, 21 and 23 now carry their real glyphs.

`—` today means only: **no `DeviceKind` projects this piece** (cosmetics, materials, and FUNCTIONAL
**[NEW]** rows whose kind does not exist yet), **or** the piece is drawn by a layer other than furniture
(doors, conduits, pipes). The second case is an allowlist with a per-entry reason in
`client/test/device-sprite-coverage.test.js`, and that test fails if any *other* `DeviceKind` ends up
here.

⚠️ **Five `DeviceKind`s are drawn wearing another piece's art**, and this table does not say so on the
substitute's own row. `WaterTank` → OXYGEN TANK (#5), `Radiator` → SPACE HEATER (#40), `SalvageRecycler`
→ WATER RECYCLER (#6), `MedCabinet` → LOCKER (#15), `Light` → WALL LAMP (#37). The warm set has no piece
for any of those five kinds, and every one of these substitutions predates this note — they are inherited
verbatim from the two hand-mirrored `ROLE_TO_ITEM` tables the derivation replaced, so nothing new started
wearing borrowed art. Two consequences worth knowing: rows 5 and 40 are marked FUNCTIONAL **[NEW]** and
so read as unreachable, but they are **on screen today** standing in for a live kind; and the ledger
(`GLYPH_SUBSTITUTE`) is pinned to shrink only, so growing a real piece is the way out.

DeviceKind reference (`Device.cs`): Door 0, AirVent 1, Scrubber 2, Ladder 3, Terminal 4,
SolarWing 5, Battery 6, Conduit 7, Light 8, GrowBed 9, WaterTank 10, Pipe 11, Reclaimer 12,
Fabricator 13, MachineShop 14, SalvageRecycler 15, Radiator 16, Bed 17, Table 18, Chair 19,
MedBed 20, MedCabinet 21, Locker 22, Desk 23, PlantPot 24, Telescope 25.

---

## Objects (30)

| # | Item label | Class | DeviceKind / target | Sim glyph | Notes |
|---|------------|-------|---------------------|-----------|-------|
| 1 | REACTOR | FUNCTIONAL **[NEW]** | (new) Reactor | — | No `DeviceKind.Reactor` exists. `SolarWing` is today's only power *producer*; the `systems` ledger's `reactor` row is a derived report, not a device. Needs a new kind (PowerSystem producer). |
| 2 | SOLAR PANEL | FUNCTIONAL [exists] | SolarWing (5) | `G` → solar | Surface solar line, abstracted until a surface exists. |
| 3 | BATTERY BANK | FUNCTIONAL [exists] | Battery (6) | `B` → battery | |
| 4 | O₂ SCRUBBER | FUNCTIONAL [exists] | Scrubber (2) | `S` → scrubber | Removes CO2 while powered. |
| 5 | OXYGEN TANK | FUNCTIONAL **[NEW]** | (new) O2/gas store | — | No gas-storage device. `AirVent` (1) is the sim's live O2 *source* (injects mix); a tank as buffered store needs a new kind. If descoped, render as an `AirVent` variant, not decor. |
| 6 | WATER RECYCLER | FUNCTIONAL [exists] | Reclaimer (12) | `R` → reclaimer | Recycles wastewater back to the tank network. |
| 7 | HYDROPONICS | FUNCTIONAL [exists] | GrowBed (9) | `"` → hydroponics | Grows crops while powered + watered. **Was `— (growbed)`** — true of the WebGL executor switch, but it left the food loop drawing an unknown-glyph chip on both SVG surfaces (HANDOVER §4l). |
| 8 | COOKER | FUNCTIONAL **[NEW]** | (new) Stove/Cooker | — | No cooker/stove device; food is a ship metric, not a station. New kind (food prep). |
| 9 | COOLER | COSMETIC | decor `cooler` | — | No food-storage mechanic. View-only fridge/freezer prop. |
| 10 | PASTE DISPENSER | COSMETIC | decor `paste_dispenser` | — | No food-dispenser device; decorative. Promote to FUNCTIONAL only if a food-station mechanic lands. |
| 11 | DINING TABLE | FUNCTIONAL [exists] | Table (18) | `t` → table | |
| 12 | BUNK BED | FUNCTIONAL [exists] | Bed (17) | `b` → bed | Rest anchor. |
| 13 | DESK | FUNCTIONAL [exists] | Desk (23) | `D` → desk | Faces away from the adjacent wall (glyph facing logic). |
| 14 | CHAIR | FUNCTIONAL [exists] | Chair (19) | `h` → chair | Dresser pairs it to a table/bed. |
| 15 | LOCKER | FUNCTIONAL [exists] | Locker (22) | `L` → locker | |
| 16 | RUG | COSMETIC | decor `rug` | — | Import plan's canonical cosmetic. |
| 17 | STANDING LAMP | COSMETIC | decor `standing_lamp` | — | The lamp *glow* is decor; the functional `Light` (8, glyph `*`) is placed separately. |
| 18 | POTTED PLANT | FUNCTIONAL [exists] | PlantPot (24) | `P` → plant | Inert furniture but a real `DeviceKind` (dresser-placed). |
| 19 | BOOKSHELF | COSMETIC | decor `bookshelf` | — | |
| 20 | MED BED | FUNCTIONAL [exists] | MedBed (20) | `d` → medbed | Clinical bed. |
| 21 | RESEARCH CONSOLE | FUNCTIONAL [exists] | Terminal (4) | `T` → research-console | Hosts MOSS programs. **Was `— (terminal)`** — drawn in the WebGL executor switch, but nowhere on the standard surface, so the door into the entire MOSS CRT was a dashed box reading `T` (HANDOVER §4l). |
| 22 | COMMS DISH | COSMETIC | decor `comms_dish` | — | No comms device in the sim (MECHANICS: comms inert). Decor. |
| 23 | SENSOR ARRAY | FUNCTIONAL [exists] | Telescope (25) | `x` → sensor-array | Maps to the live `Telescope` (NavSystem NAV-SENSORS). NOTE: the import plan listed this cosmetic, but a `Telescope` `DeviceKind` already exists — treat as functional. **Was `—` with no note at all**, and unlike rows 7/21 it was not drawn by the executor switch either: `x` was drawn by *nothing*, on any surface. |
| 24 | WORKBENCH | FUNCTIONAL [exists] | MachineShop (14) | `M` → machineshop | parts → devices / controller modules. |
| 25 | FABRICATOR | FUNCTIONAL [exists] | Fabricator (13) | `F` → fabricator | scrap → parts. |
| 26 | STORAGE CRATE | COSMETIC | decor `storage_crate` | — | `Storage` is a RoomType, not a device; item stacks aren't a placeable crate. Decor. |
| 27 | BLAST DOOR | FUNCTIONAL [exists] | Door (0) | — (door) | Structural — edited in the plan, not hand-layouted (`DeviceLayout` guard). Reinforced-door skin. |
| 28 | TURRET | COSMETIC | decor `turret` | — | No turret `DeviceKind` yet. Becomes FUNCTIONAL when AccessSystem/raiders land (`LockOwner` milestone). |
| 29 | CRYOPOD | COSMETIC | decor `cryopod` | — | No cryo mechanic. Decor. |
| 30 | FUEL DRUM | COSMETIC | decor `fuel_drum` | — | No fuel mechanic. Decor. |

## Walls (6) — MATERIAL

| # | Item label | Class | Target | Sim glyph | Notes |
|---|------------|-------|--------|-----------|-------|
| 31 | STEEL BULKHEAD | MATERIAL (wall) | wall tint | `#` (wall) | Default hull wall skin; amber top trim-light. |
| 32 | TIMBER-LINED WALL | MATERIAL (wall) | wall tint | `#` | Warm-wood variant. |
| 33 | BLAST WALL | MATERIAL (wall) | wall tint | `#` | Reinforced variant. |
| 34 | GLASS PARTITION | MATERIAL (wall) | wall tint | `#` | Transparent partition (still `BlocksGas` for rooms). |
| 35 | INSULATED WALL | MATERIAL (wall) | wall tint | `#` | Cosmetic tint; thermal insulation is `HullTiles`-derived, not a wall variant today. |
| 36 | HULL PLATING | MATERIAL (wall) | wall tint | `#` | Outermost hull skin. |

## Floors (6) — MATERIAL

| # | Item label | Class | Target | Sim glyph | Notes |
|---|------------|-------|--------|-----------|-------|
| 37 | STEEL-TAN FLOOR | MATERIAL (floor) | floor tint | `.` (floor) | Default deck. |
| 38 | WOOD PLANK FLOOR | MATERIAL (floor) | floor tint | `.` | Quarters/commons warmth. |
| 39 | GROW MATTING | MATERIAL (floor) | floor tint | `.` | Hydro rooms. |
| 40 | CREAM TILE FLOOR | MATERIAL (floor) | floor tint | `.` | Medbay. |
| 41 | METAL GRATING | MATERIAL (floor) | floor tint | `.` | Engineering/reactor. |
| 42 | CARPET FLOOR | MATERIAL (floor) | floor tint | `.` | Cosmetic. |

## Fixtures (18)

| # | Item label | Class | DeviceKind / target | Sim glyph | Notes |
|---|------------|-------|---------------------|-----------|-------|
| 43 | SLIDING DOOR | FUNCTIONAL [exists] | Door (0) | — (door) | Standard door skin. Structural (plan-edited). |
| 44 | AIRLOCK | FUNCTIONAL [exists] | Door (0) | — (door) | Vacuum-boundary door variant; no separate `Airlock` kind. |
| 45 | HATCH / LADDER | FUNCTIONAL [exists] | Ladder (3) | `H` → ladder | Links its tile to the tile above; structural. |
| 46 | POWER CONDUIT | FUNCTIONAL [exists] | Conduit (7) | — (conduit) | Power-line tile; networks are connected components. Overlay, not a `SPRITE_FOR_GLYPH` sprite. |
| 47 | AIR VENT | FUNCTIONAL [exists] | AirVent (1) | `^` → vent | Injects breathable mix while open. |
| 48 | PIPE RUN | FUNCTIONAL [exists] | Pipe (11) | — (pipe) | Water-line tile; overlay. |
| 49 | WALL LAMP | COSMETIC | decor `wall_lamp` | — | Glow decor; functional `Light` (8, `*`) placed separately. |
| 50 | VIEWPORT | COSMETIC | decor `viewport` | — | Porthole to stars (Room Zoom right wall). |
| 51 | WALL SCREEN | COSMETIC | decor `wall_screen` | — | Decorative display; not a MOSS `Terminal`. |
| 52 | SPACE HEATER | FUNCTIONAL **[NEW]** | (new) Heater | — | ThermalSystem has `Radiator` (16, rejects heat) but **no** heat *source* device. A heater is a new kind. |
| 53 | VENT FAN | COSMETIC | decor `vent_fan` | — | Decorative; airflow has no fan device (atmosphere is lumped-node). |
| 54 | SHELF RACK | COSMETIC | decor `shelf_rack` | — | |
| 55 | SUPPLY BARREL | COSMETIC | decor `supply_barrel` | — | |
| 56 | WEAPONS RACK | COSMETIC | decor `weapons_rack` | — | Becomes meaningful with the raider/defense milestone. |
| 57 | SUN LAMP | COSMETIC | decor `sun_lamp` | — | Grow-glow decor; hydroponics light is not a separate device. |
| 58 | HERB PLANTER | COSMETIC | decor `herb_planter` | — | Small wall planter, decorative. (`PlantPot` (24) is available if a functional variant is wanted.) |
| 59 | DECK SIGN | COSMETIC | decor `deck_sign` | — | Wayfinding label. |
| 60 | FLOODLIGHT | COSMETIC | decor `floodlight` | — | Glow decor; the functional luminaire is `Light` (8). |

---

## Tally

| Class | Count |
|-------|------:|
| FUNCTIONAL — [exists] (map to a live `DeviceKind`, pure re-skin) | 23 |
| FUNCTIONAL — [NEW] (needs a new `DeviceKind`) | 4 |
| **FUNCTIONAL total** | **27** |
| COSMETIC (view-only `decor`, non-hashed) | 21 |
| MATERIAL (wall/floor tint) | 12 |
| **Total** | **60** |

**The 4 items needing a NEW `DeviceKind`:** REACTOR (1), OXYGEN TANK (5), COOKER (8),
SPACE HEATER (52). Each is a real sim change — enum id + `MachineDefs` row + save/hash +
round-trip in a single commit — and must go through the def-field / spine-lane ritual, not
the item-library re-skin. Everything else is either an existing-`DeviceKind` re-skin (Phase 1
library work, no sim change), non-hashed decor, or a material tint.

**Placement lowering:** FUNCTIONAL pieces place via a sim command (`PlaceDeviceCommand`) and
are hashed sim state. COSMETIC pieces place into the non-hashed `decor` sidecar
(`perilune-wire-channels.spec.md` §3) and never touch the determinism hash. MATERIAL pieces
are buildable wall/floor variants (material tables). Nothing in this doc moves the pinned
determinism hash `616ed4a84a9f6e87` except the four [NEW] `DeviceKind`s, each of which owns
its own re-pin commit.
```
