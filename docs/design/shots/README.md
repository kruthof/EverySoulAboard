# `docs/design/shots/` — rendered evidence, for the owner to judge

Pictures of the running game, committed so there is a **path in the tree** to hand over. Every
assertion in `client/test/` reads a string; only a person looking at a screen can say whether the art
is right. The owner judges the art (memory: *Review seams, not art*), so the art has to be reachable
without re-running anything.

Regenerate with the tool named beside each set — never hand-edit, never crop by hand.

---

## `wreck-*` — `--ship wreck`, the wreck start, ON THE RUNNING GAME (2026-07-28)

Tool: **`client/tools/wreck-shot.mjs`** (`--out docs/design/shots`). Regenerate, never hand-edit.
It needs a live host on the wreck, which `play.sh` does not offer:

```
~/.dotnet/dotnet run --project hosts/web -- --port 8390 --ship wreck
python3 client/serve.py 8391
node client/tools/wreck-shot.mjs --out docs/design/shots
```

⚠️ **UNLIKE `wrecked-*`, THESE ARE SHOTS OF THE RUNNING GAME.** The registry gallery above renders
pieces onto the mock's own stage; these are real pointer clicks on the real Overview and Room Zoom,
against a real `hosts/web` on `--ship wreck`. The tool prints a CAPSULE CENSUS read off the live wire
before it opens Chrome, and refuses to shoot if a capsule glyph resolves to no piece — so a set of
pretty pictures of the wrong ship, or of dashed placeholder chips, cannot be produced by accident.

| file | what it shows |
|---|---|
| `wreck-1-overview-deck0.png` | the surviving deck. CRYO BAY and REACTOR lit and labelled; six sealed halls dark, each offering ＋ADD ROOM. CREW WATCH reads **1 SOUL**. The SENSOR LOG carries the boot ship's-log lines — *"Sokolov did not survive the raid — capsule breached"*. |
| `wreck-2-overview-deck1.png` | the dead deck: eight sealed halls, nothing pressurised, nothing lit. |
| `wreck-3-cryobay.png` | the Room Zoom on the cryo bay — **twelve capsules, eleven closed and one hinged OPEN** with the single pawn beside it. |
| `wreck-4-cryobay-crop.png` | a 3× crop of the capsule rows, so the two pieces are separable at a glance. |
| `wreck-5-reactor.png` | the reactor bay: three solar wings, two batteries, the water reserve, and the opening stock on the floor. |

### What these pictures DO and DO NOT claim

- ✅ **The two cryo pieces reach the standard surface and are distinguishable.** `'K'` (occupied) and
  `'k'` (open) are different glyphs from `GlyphMapper.DeviceGlyph`, and the warm set ships a piece for
  each. This is the first time a device's STATE picks between two real `ITEMS` rows.
- ✅ **`RoomType.Cryo` renders as `CRYO BAY`**, not as an internal anchor id.
- ⛔ **THE CAPSULE *PIECE* IS CONDITION-BLIND — the capsules are not.** ⚠️ This bullet and the one
  below it used to claim *"all eleven closed capsules draw identically"* and *"the corpses are not
  visible on the capsule tiles"*. **Both were false, and false in the flattering direction** — the
  ship reads better than the claim. Corrected against a live host rather than re-reasoned:
  - The `devices` channel's `cond` byte draws nothing, so **the capsule ART is the same art at
    `Condition 0.94` and at `0.04`.** That much stands, and wiring the wrecked twins to it is still
    a separate package.
  - But **the projection already distinguishes them**: the fg byte is `GlyphColor.Broken` for
    exactly the four wrecked pods (`pod_vance` 0.04, `pod_sokolov` 0.07, `pod_iqbal` 0.03,
    `pod_osei` 0.06) and `Device` for the other eight — driven, tick 0.
  - And **the corpses ARE on screen in the Room Zoom.** The `items` channel carries a `Corpse`
    stack on exactly those four tiles, and `roomzoom-view.js`'s `itemStackSvg` (`:476`) draws
    **after** `furnitureSvg` (`:444`) — so the body renders **over** the capsule, as
    `resources.js:311`'s brown bag with an amber ID tag. Those are precisely the four distinct
    capsules visible in `wreck-4-cryobay-crop.png`; the picture had been showing the thing the
    caption said it did not show.
- ⛔ **ON THE OVERVIEW the original claim DOES hold, and only there.** `overview-view.js` has no
  ground-item layer at all, so at Level 1 the twelve capsules really are indistinguishable and the
  four deaths are readable only in the SENSOR LOG. That is the honest scope of "condition is
  invisible": **it is a Level-1 statement, not a Level-2 one.**
- These are one run, one seed, one machine. They claim the ship RENDERS. **The owner judges the art.**

---

## `wrecked-*` — the post-raid twin set + the two new cryo capsules (2026-07-28)

Tool: **`client/tools/wrecked-gallery.mjs`** (`--out docs/design/shots`). Regenerate, never hand-edit.

⚠️ **THESE ARE NOT SHOTS OF THE RUNNING GAME, and that is not laziness.** The wrecked set is
deliberately **not wired to either surface**: nothing on the wire carries a device *condition*, so no
surface can choose between a piece and its twin yet, and there is no running game in which to
photograph one. The tool renders the registry directly onto the mock's own 150×132 stage. That is
**weaker evidence** than `door-*` or `items-*`: it proves the pieces DRAW, not that they read
correctly in a room. When the `devices` condition channel lands and the twins are wired, these want
re-shooting from the live Room Zoom.

**Each row is three stages: pristine SVG · THE MOCK'S OWN CSS DIVS · wrecked SVG.** The middle stage
is read out of `docs/design/perilune-item-set.dc.html`'s `brokenD` array and laid out on the mock's
own geometry, so the middle-versus-right comparison is a real fidelity diff rather than an argument
about one. The SVG is rendered at 128×128 — `helpers.js` `TILE`, i.e. scale exactly 1:1 with the
mock — for the same reason.

| file | what it shows |
|---|---|
| `wrecked-0-cryo-new.png` | the **two NEW static pieces**, CRYO CAPSULE · OCCUPIED and · OPEN, pristine and wrecked, at 300 px. The only pieces in this package a player could ever see undamaged, so they are shown big enough to see the occupant. |
| `wrecked-1-objects.png` | the 30 objects |
| `wrecked-2-walls-floors.png` | the 6 walls + 6 floors |
| `wrecked-3-fixtures.png` | the 18 fixtures |
| `wrecked-4-resources.png` | the 8 loose resources (the ones the mock renames and badges `—`) |
| `wrecked-5-cryo.png` | the 2 cryo capsules at tile size |

### The deliberate departures you will SEE in the middle-versus-right diff

Each is argued in `client/src/items/wrecked.js`'s header; none is a mistake.

- **PARTS · SEIZED** — the mock's two cogs are `conic-gradient` pies; the SVG draws **real teeth**
  (`gearPath`, reused from `resources.js`). At tile size a pie of grey wedges is a grey disc.
- **VENT FAN** — the same `conic-gradient`, translated the *other* way, to four quarter **sectors**,
  matching what the pristine `fixtures.js` `ventFan` already does. A fan is a disc with alternating
  quadrants; teeth would make it a cog.
- **Blurred `box-shadow`s** become hard rings or radial vignettes — SVG blur is a filter, and filters
  are not in this set's vocabulary. The vignette is flattened to 0.7 alpha over a 0.6 ramp; without
  that, HULL PLATING's breach wore a crisp cyan ring instead of a cold bloom.
- **Drop shadows are dropped**, exactly as the 70 pristine pieces drop theirs.
- **45° hazard-stripe handedness is not pinned** (CSS measures the gradient axis anticlockwise from
  "up"; SVG `patternTransform` rotates clockwise with y down). Every 45° use is hazard tape.

⚠️ **Nothing here has had owner review.** The state badges (`0%`–`35%`, `—`) come from the mock and
are carried through, but no threshold anywhere decides when a tile wears its twin — that decision
does not exist yet.

---

## `door-*` — the door package (2026-07-27)

Tool: **`client/tools/door-shot.mjs`**. Live `--ship grid` host, real Chrome over CDP, real pointer
clicks. The door is shut over the wire (`{"cmd":"click"}` → `GameSession.ContextAction` toggles it),
which is the same projected `'+'` a player gets from the DOOR tool — `BuildSystem.cs:226`: *"the door
starts closed"*.

| file | what it shows |
|---|---|
| `door-1-BEFORE-closed-crop.png` | **THE BUG.** MEDBAY, deck 0. A shut door renders as the VS-Z-25 dashed box with a raw `+` in it. Captured with `sliding-door`'s glyph reverted to `null`, i.e. the state that shipped. |
| `door-2-AFTER-closed-crop.png` | **THE FIX.** MESS, deck 0. The same tile draws the `sliding-door` leaf — steel, lit centre strip — seated in the wall gap. |
| `door-3-BEFORE-roomzoom.png` | the whole Room Zoom for the BEFORE crop, so the chip is seen in context |
| `door-4-AFTER-roomzoom.png` | the whole Room Zoom for the AFTER crop |
| `door-5-AFTER-open-doorway.png` | the **OPEN** doorway, drawing nothing — deliberate (`NO_DEVICE_GLYPH_ART`). Closed draws a leaf, open draws a hole, so shut-vs-open stays legible. |
| `door-6-AFTER-overview.png` | Level-1, where an unskinned glyph was not a chip but **silently absent** |

### Two things these pictures do NOT show — read before quoting them

- **The LOCKED state (`'X'` → `blast-door`) is not photographed.** No wire verb locks a door, so it is
  reachable only from the TUI or the MOSS/DSL adapters. It is pinned by a driven test against the
  real DOM; that proves the markup, not the look. **The choice of `blast-door` for locked and
  `sliding-door` for closed is an agent's aesthetic call and has had no owner review.**
- **A ground stack sharing a door tile** is proven by driven test only. Producing it live would need
  a haul to land on a door tile.

### The Level-1 change, measured at boot rather than argued

`--ship grid` **deck 1** boots with three CLOSED doors — (38,7), (16,10), (38,10) — so the Overview
gains **three** door pieces immediately: furniture tiles **26 → 29**, drawn at `tileSize * 1.7`.
**Deck 0 gains nothing at boot** (57 → 57): all eight of its doors boot open. Both measured against a
live host, not computed.

⚠️ All three of deck 1's closed doors sit in **unoccupied halls** (blank `anchorName`), and
`roomTileRect` refuses a blank anchor — so at boot the number of closed doors in a room the player can
**enter** is **zero**. The Level-2 case is reached by a player gesture: shutting a door, or building
one. "8 in-rect doors, 3 closed" is a statement about *rect geometry*, which is what it was measured
to refute; it is not a statement about what a player sees at Level 2 on a fresh save.
