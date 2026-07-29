# `docs/design/shots/` — rendered evidence, for the owner to judge

Pictures of the running game, committed so there is a **path in the tree** to hand over. Every
assertion in `client/test/` reads a string; only a person looking at a screen can say whether the art
is right. The owner judges the art (memory: *Review seams, not art*), so the art has to be reachable
without re-running anything.

Regenerate with the tool named beside each set — never hand-edit, never crop by hand.

---

## `m1-c-*` — UN-DESIGNATE: the player takes an order back, ON THE RUNNING GAME (2026-07-29, M1-C)

Tool: **`client/tools/erase-shot.mjs`** (`--out docs/design/shots`). Regenerate, never hand-edit.

```
./play.sh --host-port 8442 --client-port 8443 --no-open      # play.sh opens --ship wreck
node client/tools/erase-shot.mjs --out docs/design/shots --host-port 8442 --client-port 8443
```

⚠️ **THE PICTURES ARE THE HUMAN HALF; THE TOOL'S OWN CHECKS ARE THE MACHINE HALF.** Every assertion
in `client/test/` about ERASE reads a payload out of an injected `send`, which proves the client
*emits* `on:0` and proves nothing about whether the mark goes away. This tool counts the `marks`
channel before and after each gesture, over the same WebSocket the game uses, and **exits non-zero
if a designation survives an erase — or if the paint that was supposed to precede it never landed.**
That second half is not decoration: the first draft printed `✓ ERASE took the STRIP order back
(0 → 0)` because the strip had been *refused* (device kind 0 is a Door and `DeconstructSystem`
refuses doors), which is the repo's own "a test that passes if the system under test does nothing".

**What the shipped wreck can and cannot show, measured over the wire rather than assumed:** all 20 of
deck 0's debris tiles are in HALLS and deck 1 has no enterable rooms at all, so **DIG is exercised on
the Overview** (deck-scoped, can designate a hall tile) and the Room Zoom's legs use **STRIP** on a
non-door device and **STOCKPILE**, which is the more interesting verb anyway: its paint is TWO
commands per tile (`stockpile` + `filter`) and its erase is deliberately ONE.

| file | what it shows |
|---|---|
| `m1-c-01-overview-orders-bar.png` | the Overview with the ORDERS bar open |
| `m1-c-02-overview-orders-bar-crop.png` | the bar itself: `[G] ⛏ DIG` · `[V] ⚒ STRIP` · **`[C] ↺ ERASE`** |
| `m1-c-03-overview-dig-painted.png` | a DIG painted on debris at 34,15 — `marks` went 0 → 1 |
| `m1-c-04-overview-erase-armed.png` | ERASE armed; the hint line names what a click will take back |
| `m1-c-05-overview-erase-toast.png` | **`↺ ERASED DIG ▸ 34,15 ON DECK 0`** — the confirmation, visible |
| `m1-c-06-overview-erased.png` | the mark is gone — `marks` went 1 → 0 |
| `m1-c-07-overview-nothing-to-erase.png` | **`↺ NOTHING TO ERASE ▸ 34,15 ON DECK 0`** — the MISS, said out loud. A correct erase on a bare tile sends nothing, and silence is indistinguishable from a broken tool |
| `m1-c-08-palette-17-tools.png` | the Room Zoom palette at a **1280×800 laptop viewport**: seventeen tools, two rows, none clipped. ERASE sits beside the three verbs it undoes and NOT beside DEMOLISH — `↺` against `⌫`, the most confusable pair on the bar |
| `m1-c-09-strip-mark.png` | a STRIP ✕ on a cryo capsule at 2,1 |
| `m1-c-10-erase-armed.png` | ERASE armed in the Room Zoom |
| `m1-c-11-erase-strip-toast.png` | `↺ ERASE ▸ 1 ORDER TAKEN BACK` |
| `m1-c-12-erase-strip-done.png` | the ✕ is gone — the capsule is no longer condemned |
| `m1-c-13-nothing-to-erase.png` | `↺ ERASE ▸ NOTHING TO ERASE HERE` |
| `m1-c-14-stockpile-zone.png` | a 3×3 STOCKPILE drag — 6 tiles zoned (three carry capsules, which the sim refuses) |
| `m1-c-15-erase-zone-toast.png` | `↺ ERASE ▸ 6 ORDERS TAKEN BACK` — the count is the ORDERS cleared, not the 9 tiles dragged over |
| `m1-c-16-erase-zone-done.png` | the zone is gone in ONE drag |

---

## `wear-*` — THE WEAR JOIN: a wrecked machine wearing its twin, ON THE RUNNING GAME (2026-07-28, W0b)

Tool: **`client/tools/wear-shot.mjs`** (`--out docs/design/shots`). Regenerate, never hand-edit.

```
./play.sh --host-port 8360 --client-port 8361 --no-open      # play.sh opens --ship wreck
node client/tools/wear-shot.mjs --out docs/design/shots --host-port 8360 --client-port 8361
```

⚠️ **THIS SET SUPERSEDES THE `wrecked-*` GALLERY'S CAVEAT AND THE `wreck-*` SET'S ⛔ BULLET.** Both
say, correctly for the day they were written, that the twins are *"deliberately not wired to either
surface"* and that *"the capsule ART is the same art at `Condition 0.94` and at `0.04`"*. **Neither is
true any more.** `client/src/items/wear.js` joins the `devices` channel's `cond` byte to the twin set
at `wear.wreck_threshold` (0.25 = wire byte 64), and both SVG surfaces draw through it. The old
paragraphs are kept where they are, unedited, because they record what was true then — read them with
this heading in mind.

| file | what it shows |
|---|---|
| `wear-1-reactor.png` | the Room Zoom on REACTOR. **Three SOLAR WINGS in two states**: one intact (`cond 79/255` = 0.31, above the floor) drawn as the clean framed blue array, and two below the floor (`46` and `15`) drawn as the post-raid twin — punched through, its strut torn loose, an ember at the corner. Two batteries and a terminal beside them are wrecked too. The palette, the caption and the ground stacks are the ordinary surface; only the pictures changed. |
| `wear-2-reactor-crop.png` | a 3× crop of that row, so the intact wing and the two wrecked ones are separable at a glance. **This is the shot the join exists for**: one machine, one kind, two paintings, chosen by a number the sim owns. |
| `wear-3-cryobay.png` | the Room Zoom on CRYO BAY — **twelve capsules in four combinations**: OPEN and OCCUPIED × intact and wrecked. |
| `wear-4-cryobay-crop.png` | a 3× crop of the capsule rows. The eight intact pods glow blue with a sleeper visible; the four below the floor (`cond 10, 18, 8, 15`) are dark, iced and unlit, with the body bag drawn over them by the `items` layer. The one OPEN capsule is the hinged-back piece at the top. |
| `wear-5-swarf-cryobay.png` | the Room Zoom after a strip has run: a **SWARF pile on the deck plate**. |
| `wear-6-swarf-crop.png` | a 3× crop centred on that tile — bright curled turnings with a contact shadow, beside a wrecked capsule for scale. |

### What these pictures DO and DO NOT claim

- ✅ **The join reaches BOTH standard surfaces through one seam.** `client/src/items/wear.js` is the
  only module outside `items/` that may name the wrecked set, pinned by `client/test/wrecked.test.js`.
- ✅ **THE SWARF PILE IS EARNED, NOT PLACED.** There is no verb that puts an item on a floor. The tool
  designates a **STRIP** on real wrecked machines through the same `{cmd:'strip'}` a player's `V` drag
  lowers to, runs the host at its top speed rung, and waits for a kind-9 row to appear on the `items`
  channel. It **fails rather than photographing anything else** if none ever does — so this picture is
  evidence that the wreck's opening loop produces the piece, not just that the piece renders.
- ⛔ **The threshold is a RENDERING decision, not a second authority.** The client never re-derives a
  rule: `oper` rides the wire precisely because the failure threshold is per-kind. "Which picture" is
  a uniform question about paintings, and if `wear.def` moves the floor the art follows one edit
  later — a machine simply keeps its clean picture a little past the cliff in the meantime.
- ⛔ **The byte quantisation moves the visible cliff by 0.00098 of a machine's life — 0.098 %** below
  the def (half-up rounding of a 256-state byte). `cond < 64` is exactly `Condition < 63.5/255 =
  0.2490196` against the sim's `< 0.25`, so the two disagree on `[0.249020, 0.25)` and the client is
  LATE there — a machine in that sliver is below the floor and still wearing its clean picture.
  ⚠️ **An earlier version of this bullet said ≈0.0025 and it was wrong by a whole byte**, because it
  measured the gap between two byte *values* instead of byte 64's *pre-image* under half-up rounding.
  Corrected, and now pinned exactly by `client/test/wear-join.test.js` rather than published loose.
- ⛔ **`swarf` has NO wrecked twin** and never will draw one — it *is* the wrecked state. Ledgered by
  name as `NO_WRECKED_TWIN` in `client/src/items/wrecked.js`.
- One run, one seed, one machine. They claim the ship RENDERS. **The owner judges the art.**

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

---

## M1-1 — the ship's interior is known at boot (OD-C), and slot 3 has a name

Captured 2026-07-29 with `client/tools/operate-shot.mjs --tile 35,6` against a live
`./play.sh --ship wreck` (real Chrome over CDP, real pointer clicks on the shipped DOM).
`--tile` is new in this lane and exists precisely so the rig cannot photograph the EASY vent
(`vent_cryo`, in the boot core) while the caption claims the hard one.

⚠️ **THIS SET SUPERSEDES THE `wreck-*` SET'S `wreck-1-overview-deck0.png` CAPTION.** That caption
says *"CRYO BAY and REACTOR lit and labelled; **six** sealed halls dark, each offering ＋ADD ROOM"*.
It was true on the day it was written and **both halves are now false on the shipping ship**: deck 0
shows **THREE** lit, labelled rooms (`CRYO BAY`, `LIFE SUPPORT`, `REACTOR`) and **FIVE** ＋ADD ROOM
halls, and **the halls are no longer dark — their wrecked machinery draws.** The old paragraph is
kept where it is, unedited, because it records what was true then; read it with this heading in
mind, and read `m1-1-1-BEFORE-overview.png` as the picture it describes.

| shot | what it shows |
|---|---|
| `m1-1-1-BEFORE-overview.png` | the defect: **six of eight deck-0 slots are blank ＋ADD ROOM boxes** while holding `fabricator_1`, `machineshop_1`, `recycler_1`, `scrubber_ls`, `reclaimer_ls` and `vent_ls`. The SENSOR LOG in the corner announces `light_d1_s0: MACHINE FAILURE` **by name, for a machine the player cannot see**. |
| `m1-1-2-AFTER-overview.png` | the wrecked machinery draws in every hall, and slot A3 is now the room **LIFE SUPPORT** with a material floor instead of an ＋ADD ROOM chip |
| `m1-1-3-AFTER-lifesupport-roomzoom.png` | the Room Zoom the Overview could not open before — entered with a real click on `.pl-room[data-anchor="lifesupport"]` |
| `m1-1-4-AFTER-operate-armed-vent-SHUT.png` | OPERATE armed: **two** chips, the vent at (35,6) reading `SHUT` and the compartment door |
| `m1-1-5-AFTER-toast-OPEN-AIRVENT.png` | the toast at the instant of the click: **`⇄ OPEN AIRVENT`** |
| `m1-1-6-AFTER-vent-OPEN.png` | the chip has flipped to `OPEN` — ***the player has opened `vent_ls` in a running game*** |

### What these pictures do NOT show

- **The other five deck-0 halls are visible but still NOT ENTERABLE.** Their machines draw; their
  slots still carry no `anchorName`, so ＋ADD ROOM remains the path to naming them. Only slot 3 was
  chartered. A reader looking at `m1-1-2` should not conclude the whole deck became clickable.
- **Deck 1 is not photographed**, and its machines are now visible too — on the deck
  `W4b-DEAD-DECK` proves can never hold air.
- **No air moves in these shots.** The vent is opened; the compartment filling is a separate
  measurement (`AddRoomCommandTests`: 90 kPa at tick 1 846 with the door shut) and is not shown.
- **The visual result of drawing machines inside an un-named hall has had no owner review.** It is
  what OD-C asks for — *"all of them become visible"* — and it is an agent's rendering consequence,
  not an art decision anyone signed off.
- ⚠️ **AND THE BIGGEST ONE, WHICH `m1-1-2` SHOWS PLAINLY WHILE THIS LIST ORIGINALLY OMITTED IT:
  `LIFE SUPPORT` NOW READS AS BREATHABLE.** On the Level-1 Overview it draws as a lit, warm-floored,
  labelled room — *pixel-for-pixel like `CRYO BAY` and `REACTOR`, the two compartments that really
  do hold air.* **The Overview has no vacuum indication at all outside the `2 PRES` lens**, so
  nothing on the default view distinguishes the ship's one named-but-airless room from its two named
  pressurised ones. On a ship whose core loop **is** a pressure frontier, the compartment this lane
  promoted to a room now misreads as safe — and unlike an allocated hall (which the player chose to
  create, having just been shown it is empty) **this is the player's FIRST impression of the ship.**
  Filed as a **consequence for the owner to rule on, deliberately NOT patched in this lane**: the
  candidate fixes (a vacuum tint on the default Overview, a pressure badge, or an `unpressurised`
  room-chrome state) are all new visual vocabulary on the standard surface, which is an art decision
  and not a test-fix.
