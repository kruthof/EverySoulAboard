# Perilune item mapping — the 68-piece warm set → sim reality

**Status:** DATA CONTRACT (spec only). The authority for **Phase 1** (the item library,
`client/src/items/*`) and **Phase 4** (furniture placement / decor). Maps every one of the
68 pieces in `perilune-item-set.dc.html` to its class in the sim:

- **FUNCTIONAL** — a real interactive machine → a `DeviceKind` (`sim/Sim.Core/Entities/Device.cs`).
  Placing it lowers to a sim command (`PlaceDeviceCommand`). Sub-flagged **[exists]** (map to a
  live `DeviceKind`, pure re-skin, no sim change) or **[NEW]** (needs a new `DeviceKind` — a sim
  change in its own commit: enum id + MachineDefs row + save/hash coverage).
- **COSMETIC** — view-only decor → the non-hashed `decor` channel
  (`perilune-wire-channels.spec.md` §3). Never a `Device`; never hashed.
- **MATERIAL** — a buildable wall/floor tint → material tables + buildable variants; not a device.
- **RESOURCE** — a GROUND STACK → an `ItemKind` (`sim/Sim.Core/Entities/ItemStack.cs`), keyed by
  `Glyphs.ForItem` rather than `Glyphs.ForDevice`. Hashed sim state, but nothing PLACES one: the haul
  board moves it. Added 2026-07-27 with the mock's re-import (60 → 68 pieces). It is a fourth class
  because the other three are each wrong for a pile — see `client/src/items/index.js`'s header.

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
→ WATER RECYCLER (#6), `MedCabinet` → LOCKER (#15), `Light` → WALL LAMP (#37), and — since the door package (2026-07-27) —
`Glyphs.DoorLocked` `'X'` → BLAST DOOR (#27), which is the FIRST entry keyed by a glyph the
`Glyphs.ForDevice` switch does not carry (`GlyphMapper.DeviceGlyph` returns it from door STATE). The warm set has no piece
for any of those five kinds, and every one of these substitutions predates this note — they are inherited
verbatim from the two hand-mirrored `ROLE_TO_ITEM` tables the derivation replaced, so nothing new started
wearing borrowed art. Two consequences worth knowing: rows 5 and 40 are marked FUNCTIONAL **[NEW]** and
so read as unreachable, but they are **on screen today** standing in for a live kind; and the ledger
(`GLYPH_SUBSTITUTE`) is pinned to shrink only, so growing a real piece is the way out.

DeviceKind reference (`Device.cs`, **all 28** — the list used to stop at 25 and was two members
stale): Door 0, AirVent 1, Scrubber 2, Ladder 3, Terminal 4,
SolarWing 5, Battery 6, Conduit 7, Light 8, GrowBed 9, WaterTank 10, Pipe 11, Reclaimer 12,
Fabricator 13, MachineShop 14, SalvageRecycler 15, Radiator 16, Bed 17, Table 18, Chair 19,
MedBed 20, MedCabinet 21, Locker 22, Desk 23, PlantPot 24, Telescope 25, **IceMelter 26**
(E0-7, the water chain), **CryoPod 27** (W3, the wreck start — the first kind whose glyph is
picked from STATE rather than kind: `'K'` occupied, `'k'` open).

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
| 27 | BLAST DOOR | FUNCTIONAL [exists] | Door (0) | `X` → sliding-door's LOCKED sibling | Structural — edited in the plan, not hand-layouted (`DeviceLayout` guard). Reinforced-door skin. ⚠️ The `—` here USED TO SAY "(door)", meaning *drawn by another layer*; **no layer on either SVG surface ever drew a door** (door package, 2026-07-27). `'X'` is `Glyphs.DoorLocked`, which `GlyphMapper.DeviceGlyph` returns instead of calling `ForDevice`, so it is carried in `GLYPH_SUBSTITUTE` rather than on this row's `glyph` field — one `ITEMS` row can claim one glyph and `sliding-door` claims the closed one. |
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
| 43 | SLIDING DOOR | FUNCTIONAL [exists] | Door (0) | `+` → sliding-door | Standard door skin. Structural (plan-edited). ⚠️ Its `—` read "(door)" until 2026-07-27 on the false premise that a structure layer drew doors; a CLOSED door inside a room rect drew the VS-Z-25 dashed chip with a raw `+` in it, live on `--ship grid`. `'+'` is `Glyphs.DoorClosed`, i.e. `Glyphs.ForDevice(Door)`, so this is an ordinary registry claim. |
| 44 | AIRLOCK | FUNCTIONAL [exists] | Door (0) | — | Vacuum-boundary door variant; no separate `Airlock` kind. Genuinely unclaimed: the sim projects three door chars and `sliding-door`/`blast-door` take the two that are drawn (`'/'`, open, deliberately draws nothing — `NO_DEVICE_GLYPH_ART`). |
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

## Resources — ground stacks (8)

Drawn from the `items` wire channel (`hosts/web/WireFormat.Items.cs`), which carries the COUNT the
projection cannot. The **sim ItemKind** column is the exact C# member NAME, and it is load-bearing:
`client/src/ui/room-model.js` joins it to `STOCK_KINDS` to turn a wire kind BYTE into a piece, so the
byte → art mapping is derived rather than transcribed a fourth time.

| # | Piece | Class | Sim ItemKind | Sim glyph | Notes |
|---|-------|-------|--------------|-----------|-------|
| 61 | REGOLITH | RESOURCE | `Regolith` (0) | `,` | Loose spoil — the ship's base matter. |
| 62 | POTATO | RESOURCE | `Potato` (3) | `f` | Raw food; the label is FOOD, the kind is "raw food" not one vegetable. |
| 63 | SCRAP | RESOURCE | `Scrap` (4) | `s` | Salvage plate offcuts. |
| 64 | PARTS | RESOURCE | `Parts` (5) | `p` | Machine parts — the maintenance + placement currency. |
| 65 | CONTROLLER MODULE | RESOURCE | `ControllerModule` (6) | `c` | The top of the production ladder (E0-6). |
| 66 | SEALS | RESOURCE | `Seals` (7) | `g` | The maintenance rung added by E0-6. |
| 67 | ICE | RESOURCE | `Ice` (8) | `i` | Comet ice → melter → water (E0-7). Authored into `--ship slice` only. |
| 68 | CORPSE | RESOURCE | `Corpse` (2) | `&` | A sealed body bag. Its glyph was in `NON_FURNITURE` on BOTH SVG surfaces, so it drew NOTHING until 2026-07-27; art alone could not have fixed that. |

⚠️ **`ItemKind.MetalOre` (1, glyph `o`) deliberately has NO piece.** It has zero references anywhere
in `sim/` outside `Glyphs.ForItem` and the enum declaration — nothing produces or consumes it. It is
dead E3 mining vocabulary and stays in `NO_GROUND_ITEM_SPRITE`
(`client/test/device-sprite-coverage.test.js`) until ore is real. Drawing it would assert an economy
the game does not have.

---

## Cryo (2) — COSMETIC

Added by the **2026-07-28 mock re-import**. Both are `client/src/items/cryo.js`.

| # | Piece | Class | Placement | Sim glyph | Notes |
|---|-------|-------|-----------|-----------|-------|
| 69 | CRYO CAPSULE · OCCUPIED | FUNCTIONAL [exists] | CryoPod (27) | `K` → occupied capsule | A crew member frozen behind frost glass; cyan `-196°` plate, live LED. The kind's REST glyph (`Glyphs.ForDevice`). |
| 70 | CRYO CAPSULE · OPEN | FUNCTIONAL [exists] | CryoPod (27) | `k` → open capsule | The same shell empty: padded bed, lid hinged open at 24°, icicles, frost puddle, amber `EMPTY` plate. A STATE glyph, from `GlyphMapper.DeviceGlyph`, in no `ForDevice` arm. |

⛔ **THE PARAGRAPH THAT STOOD HERE IS RETRACTED BY THE WRECK START (W3), AND IT IS QUOTED RATHER
THAN DELETED BECAUSE ITS REASONING WAS CORRECT ON THE DAY.** It read: *"The `—` in the glyph column
here is a DECISION, not an omission … There is no cryo-capsule `DeviceKind` in
`sim/Sim.Core/Device.cs`, so there is no `Glyphs.ForDevice` char to claim and no tile the sim would
ever project one onto."* **`DeviceKind.CryoPod = 27` now exists** and `--ship wreck` authors twelve
of them, so both clauses are false and both pieces are `functional`.

⭐ **ONE KIND, TWO PIECES, TWO GLYPHS — the shape doors already use.** A pod's glyph comes from its
STATE: `GlyphMapper.DeviceGlyph` returns `'k'` for an open capsule and `'K'` for an occupied one.
Only `'K'` is a `Glyphs.ForDevice` arm; `'k'` appears in no switch anywhere, which is the same
blind spot that hid `'X'` (a locked door) from the art guard for months.
`client/test/device-sprite-coverage.test.js` now parses `DeviceGlyph`'s body PER KIND for exactly
this reason.

⚠️ **Neither replaces CRYOPOD (29).** That piece is a 48×82 lozenge seen from directly above and is
unchanged; these are 60×104 upright capsules that state which of two things is true of the tile. The
mock ships all three.

---

## Wrecked — post-raid twins (70)

The same re-import added **one broken twin for every piece in this document**, in a separate mock
section. They are NOT in this table and never will be: a twin is not a thing a player places, it is
the same registry row in a state. They live in `client/src/items/wrecked.js`, keyed by the PRISTINE
`itemId`.

⛔ **CORRECTION — this paragraph used to end *"and the join is asserted against this document's own
ordering by `client/test/wrecked.test.js`"*. That was false and is retracted. NO TEST ANYWHERE READS
THIS DOCUMENT'S PROSE.** What `client/test/wrecked.test.js` actually asserts, and against what:

| claim | asserted against |
|---|---|
| the twin key set is exactly `ITEM_IDS`, in order | `client/src/items/index.js` (ordered `deepEqual`) |
| every twin's label and condition badge | the mock's own `brokenD` array in `perilune-item-set.dc.html`, parsed at test time |
| every row's painter is the one named after that row | the builders themselves (`fn.name`), on both registries |

The only part of **this file** any test reads is the **Tally** table below, which
`client/test/items.test.js` parses and checks against the shipped registry. Everything else here is
unpinned prose — including this sentence. Treat a number in it as a claim, not as evidence.

⚠️ **Not wired to either surface.** Nothing on the wire carries a device *condition*, so no client
code can choose between a piece and its twin. The art and the join exist; the draw decision does
not. See `docs/design/shots/README.md` for the rendered evidence.

---

## Tally

| Class | Count |
|-------|------:|
| FUNCTIONAL — [exists] (map to a live `DeviceKind`, pure re-skin) | 25 |
| FUNCTIONAL — [NEW] (needs a new `DeviceKind`) | 4 |
| **FUNCTIONAL total** | **29** |
| COSMETIC (view-only `decor`, non-hashed) | 21 |
| MATERIAL (wall/floor tint) | 12 |
| RESOURCE (ground stack, a sim `ItemKind`) | 9 |
| **Total** | **71** |

⚠️ **THIS TABLE IS PARSED BY A TEST — it is the one part of this document that cannot rot quietly.**
`client/test/items.test.js` ("the mapping doc's Tally table agrees with the shipped registry, row for
row") reads the seven rows above out of this markdown and compares every number against `ITEMS`: the
four class counts, the `[NEW]` split (from `deviceStatus`) and the total. Change the registry without
changing this table and the gate goes red naming the row. **Keep the row labels and the `| … | N |`
shape** — the reader also asserts the seven labels, so a reformat is a deliberate change to both.

⚠️ **THEN 23 → 21 COSMETIC and 27 → 29 FUNCTIONAL, later the same day**, when the wreck start
shipped `DeviceKind.CryoPod` and the two CRYO CAPSULE pieces were reclassified. **The TOTAL did not
move**, because nothing was added or removed — only reclassified, which is precisely the change a
single total would have hidden and the reason the guard asserts a per-class object.

⚠️ **8 → 9 RESOURCE and 70 → 71 on 2026-07-28 (W0b)**, from `swarf` — the first row in this registry
that is **not in the mock at all**. `ItemKind.Swarf` arrived with the wreck start's salvage rule
after the mock was drawn, and on `--ship wreck` a Swarf pile is roughly the first thing the player
makes, so the gap was drawing a raw-letter `w` chip on the deck plate in the shipping game. The
total moved WITH the class here, which is the tell that this was an ADDITION and not the
reclassification recorded below.

⚠️ **21 → 23 COSMETIC and 68 → 70 on 2026-07-28**, from the two CRYO CAPSULE pieces. Re-counted off
the shipped registry, not derived from this table — `client/test/items.test.js` asserts the four
class numbers as an OBJECT rather than as a sum, so a class that moves names itself. A separate
**70 WRECKED twins** ship alongside and are deliberately absent from this tally: they are the same
70 rows in a state, not 70 more things. *(Before this run that sentence described the ONLY guard;
the table itself was unpinned, which is why it had already been wrong once.)*

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
