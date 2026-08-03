# PERILUNE ROOM ZOOM (Level 2) — VISUAL SPEC v1 ("The Warm Cabin")

Target: build `client/src/ui/roomzoom-view.js` + `client/src/ui/room-model.js` to the warm
Space Mono / navy-steel-and-amber language of `docs/design/perilune-room-zoom.dc.html` — the
Level-2 **Room Zoom**, the detailed build/decorate view of a single room, reached by clicking a
room in the Overview (Level 1). Every value below is exact and implementable as written; hexes
are the mock's verbatim unless a contrast note (§9) overrides them.

This is a **pure SVG/DOM view driven by the live wire** — no raster, WebGL renderer parked. The
room's furniture is the sim's own `frame` cells clamped to the focused room's tile-rect and
re-skinned as the warm SVG item set (`docs/design/perilune-item-set.dc.html`); the occupant is a
`frame.crew` pawn; build ghosts are the `designs` channel; cosmetic decor is a view-only layer that
is never a sim entity. Nothing in this view mutates or adds hashed sim state.

Conventions: "Trio" = background / foreground / border. All borders 1px solid unless stated. `U` is
the logical tile unit (§3). Requirements are numbered `VS-Z-nn`, one behavior each.

---

## 0. Scope, authorities & precedence (VS-Z-01 … VS-Z-04)

**VS-Z-01** — This spec governs ONLY the Level-2 Room Zoom surface: the build canvas, its furniture
/ occupant / ghost / decor layers, the breadcrumb, the deck minimap, and the construction palette.
Interaction (tool arming, placement, command mapping, navigation, ESC) is the companion
`docs/design/perilune-roomzoom.interaction-spec.md` (`IX-Z-*`).

**VS-Z-02** — **Palette authority.** All colour tokens, the warm material language (navy-steel
`#2b3742`/`#3a4b5c`, amber trim `#e8934a`/`#f2b563`, warm wood `#7a5c38`/`#bd9066`, cyan/amber lit
screens, soft practical glows), and the item-set geometry defer to
`docs/design/perilune-art-direction-warm.md`. Where a hex below and that authority disagree, the
authority wins and this spec is corrected — never re-hued locally.

**VS-Z-03** — **Overview authority.** The Level-1 Overview surface (the ship deck-grid the player
clicks a room in) is `docs/design/perilune-overview.*`. This spec does not define the Overview; it
defines only the Room Zoom that Overview opens, and the ONE component the two share — the deck
minimap (§8), which is specified here but authored to satisfy both.

**VS-Z-04** — **Wire-channel authority.** The `decks`, `rooms`, and `decor` channels are defined
in `docs/design/perilune-wire-channels.spec.md`. Their division of labour is authoritative and
this spec obeys it: the **`decks`** channel carries all slot GEOMETRY (per-slot tile-rect
`[x,y,w,h]`), the slot↔room binding (`anchorName`), the `roomType` byte, and the deck index; the
**`rooms`** channel is ATMOSPHERE-ONLY (`[anchorName, deck, o2, co2ppm, pressureKPa, tempK,
tileCount]`); **`decor`** is the cosmetic view-only layer. Neither channel carries a human room
NAME — the display name is CLIENT-DERIVED from `decks` `roomType` (VS-Z-12). This spec CONSUMES
these channels and never redefines their shape; the `frame` cells and `designs` / `crew` channels
are per `client/src/wire/messages.js`.

---

## 1. The build canvas — frame (VS-Z-05 … VS-Z-12)

The canvas is the hero: one room, top-down, on a warm wood floor inside a navy-steel hull frame.
Mock reference: a fixed `left:56 top:78 width:1488 height:672` rectangle on the 1600×900 stage. In
the client it is responsive (§3) but keeps every surface treatment below exactly.

**VS-Z-05** — Canvas container: `border-radius:8px; overflow:hidden;` cursor per interaction
(`crosshair` when a tool is armed, else `default` — IX-Z). It is the sizing anchor for the tile
grid (§3); its interior is everything inside the 6px steel border.

**VS-Z-06** — **Wood-plank floor** (base fill): `repeating-linear-gradient(90deg, #bd9066 0 54px,
#b0865a 54px 58px)` — a 54-logical-unit warm plank with a 4-unit darker seam. This is the default
floor; a room whose floor material differs — CLIENT-DERIVED by mapping the `decks` `roomType`
through the RoomType→floor table (`perilune-art-direction-warm.md` / `render/palette.js`), one of
`WOOD PLANK` / `STEEL-TAN` / `GROW MATTING` / `CREAM TILE` / `METAL GRATING` / `CARPET` — swaps to
that item-set floor swatch pattern
(`perilune-item-set.dc.html` FLOORS block), same 8px radius, same border/trim/shadow stack below.

**VS-Z-07** — **Inset navy-steel border**: `box-shadow: inset 0 0 0 6px #2b3742` — a 6-unit steel
bulkhead ring hugging the floor edge.

**VS-Z-08** — **Amber top trim-light**: second inset shadow `inset 0 9px 0 rgba(232,147,74,.42)` —
a 9-unit warm wash along the top edge only (the ship's practical over-lighting). It sits ON TOP of
the steel border in the shadow stack (declared after it).

**VS-Z-09** — **Inner shadow (grounding)**: third inset shadow `inset 0 0 90px rgba(0,0,0,.5)` — a
soft vignette that seats the floor into the hull. Full stack order, comma-joined in one
`box-shadow`: steel border → amber trim → inner shadow (VS-Z-07, -08, -09 in that order).

**VS-Z-10** — **32-unit build grid**: an overlay `position:absolute; inset:12px;
pointer-events:none;` with
`background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size:32px 32px;`
(scaled to `U` in the responsive client — one grid cell = one tile, §3). The 12-unit inset keeps
the grid off the steel border. Faint by design: the grid guides placement, it does not decorate.

**VS-Z-11** — **Ambient warmth glow-pool**: one `pointer-events:none` radial ellipse,
`radial-gradient(circle, rgba(242,181,99,.16), transparent 70%)`, mock size 640×460 at
`left:780 top:180` (roughly centre-right of the room). In the client it is anchored to the room's
centre, sized `~0.42 × canvas width` by `~0.68 × canvas height`, and is the ONLY ambient light
element — no per-lamp light pools in Level 2 (individual LAMP items carry their own local glow,
§5/§6). It never occludes furniture (behind all item layers, above the floor+grid).

**VS-Z-12** — **Canvas footer caption**: bottom-left inside the floor, `left:20 bottom:16;
pointer-events:none; font-size:9.5px; letter-spacing:.16em; color:rgba(255,240,220,.5);` reading
`{ROOM NAME} · BUILD DETAIL · {n} PLACED`, where `{n}` is the count of pending designations +
placed devices in this room and is coloured `#f2b563`. `{ROOM NAME}` is CLIENT-DERIVED (uppercase)
by mapping the focused room's `decks` `roomType` through the `roomType`→label table, with the
`decks` `anchorName` as the fallback label — no channel carries a human name (VS-Z-04).

---

## 2. Layer stack (VS-Z-13)

**VS-Z-13** — The canvas paints these layers, back to front, each repainted every `draw()` so all
stay glued under the same tile transform (§3):
1. **floor** (VS-Z-06) — the material fill.
2. **build grid** (VS-Z-10).
3. **ambient glow-pool** (VS-Z-11).
4. **decor layer** — cosmetic, view-only, never a sim entity (§7); `z` below functional furniture
   so a rug reads under a bunk.
5. **furniture layer** — the sim `frame` cells → warm SVG items (§4).
6. **occupant pawns** — `frame.crew` front-facing SVGs (§5).
7. **build-ghost layer** — `designs` dashed placeholders (§6), `z-index:4` (above furniture so a
   ghost over an occupied tile still reads).
8. **input pulse** — the transient placement acknowledgment (IX-Z), topmost, ≤150 ms.
Breadcrumb, minimap, and construction menu are HUD chrome OUTSIDE the canvas (§7-b/§8/§9? — §7,§8).

---

## 3. Coordinate & tile model (VS-Z-14 … VS-Z-18)

**VS-Z-14** — **Focused room tile-rect.** The view is opened for one room id; its tile-rect
`[rx, ry, rw, rh]` (origin tile + width/height in tiles) and `deck` come from the `decks` channel
slot for that room (the `SlotTuple` `[x,y,w,h]` + deck index — GEOMETRY lives on `decks`, never on
`rooms`, VS-Z-04). All furniture, pawns, ghosts, and decor are **clamped to this rect**: a `frame` cell,
crew member, or design at absolute tile `(tx, ty)` renders only when `rx ≤ tx < rx+rw` and
`ry ≤ ty < ry+rh` AND its deck equals the room's deck; everything else is dropped (this is the
Level-2 "just this room" contract, not a camera crop).

**VS-Z-15** — **Logical tile unit `U = 32`.** The room's logical coordinate space is `rw*U` wide by
`rh*U` tall — the mock's 32px grid, one grid cell per tile. A tile at absolute `(tx, ty)` maps to
logical top-left `((tx-rx)*U, (ty-ry)*U)`; its centre is `+U/2` on each axis.

**VS-Z-16** — **Fit transform.** The logical `rw*U × rh*U` space is scaled by a single factor `s`
to fit the canvas interior (inside the 6-unit border, VS-Z-07) preserving aspect, and centred
(letterboxed on the short axis). `s = min(interiorW/(rw*U), interiorH/(rh*U))`. Implement as one SVG
`viewBox="0 0 {rw*U} {rh*U}"` with `preserveAspectRatio="xMidYMid meet"`, OR a single CSS
`transform: translate(...) scale(s)` on a logical-sized layer group — either way every layer in §2
shares the ONE transform so they never drift (the game-ui pawn/ghost invariant, VS-66/IX-38, carried
here).

**VS-Z-17** — The build grid (VS-Z-10) `background-size` is `U*s` px in the client, so a grid cell
always equals one tile at the current fit. The 12-unit inset scales with `s`.

**VS-Z-18** — **Minimum tile size.** If `s` would render a tile below 18px on-screen (a very large
room in a small viewport), the canvas scrolls inside its own `overflow:auto` rather than shrinking
tiles below legibility; the letterbox rule (VS-Z-16) still centres a room that DOES fit. Rooms in
the authored ship fit at the target 1280–1920 widths; this is a safety valve.

---

## 4. Furniture layer — glyph → warm SVG item (VS-Z-19 … VS-Z-26)

The furniture is **not** authored pixel art at fixed positions (the mock draws it that way for
illustration only). It is the sim's `frame` cells, clamped (VS-Z-14), each non-blank cell rendered
as the warm SVG item keyed by its **glyph** (`sim/Sim.Glyph/Glyphs.cs`), one pure builder per item
from `client/src/items/*` (`perilune-item-set.dc.html` geometry).

**VS-Z-19** — **Glyph → item-id table** (the authoritative map; source glyph on the left is
`Glyphs.ForDevice` / terrain / `Glyphs.ForItem`, item id on the right is the item-set piece). A cell
whose glyph is not in this table renders the `unknown` chip (VS-Z-25).

| glyph | sim meaning | item id (item-set piece) |
|---|---|---|
| `.` | floor | — (floor is the base fill, VS-Z-06; no per-tile object) |
| `#` | wall | `wall.steel` (STEEL BULKHEAD; room wall material may reskin per `rooms`) |
| `%` | debris / rock | `wall.hull` (HULL PLATING, unbuilt rock face) |
| `+` `/` `X` | door closed/open/locked | `fixture.door` (SLIDING DOOR; state → colour, VS-Z-22) |
| `^` | air vent | `fixture.vent` (AIR VENT) |
| `S` | scrubber | `object.scrubber` (O₂ SCRUBBER) |
| `H` | ladder | `fixture.ladder` (HATCH / LADDER) |
| `T` | terminal | `object.console` (RESEARCH CONSOLE, cyan-lit screen) |
| `G` | solar wing | `object.solar` (SOLAR PANEL) |
| `B` | battery | `object.battery` (BATTERY BANK) |
| `~` | conduit / pipe | `fixture.conduit` (POWER CONDUIT / PIPE RUN — line tile) |
| `*` | light | `fixture.walllamp` (WALL LAMP glow; own local glow, VS-Z-24) |
| `"` | grow bed | `object.hydroponics` (HYDROPONICS) |
| `O` | water tank | `object.watertank` (OXYGEN/WATER TANK cylinder) |
| `R` | reclaimer | `object.recycler` (WATER RECYCLER) |
| `F` | fabricator | `object.fabricator` (FABRICATOR) |
| `M` | machine shop | `object.workbench` (WORKBENCH) |
| `Y` | salvage recycler | `object.crate` (STORAGE CRATE proxy) |
| `=` | radiator | `fixture.vent` recoloured (RADIATOR grille) |
| `b` | bed | `object.bunk` (BUNK BED) |
| `t` | table | `object.table` (DINING TABLE) |
| `h` | chair | `object.chair` (CHAIR) |
| `d` | med bed | `object.medbed` (MED BED) |
| `C` | med cabinet | `object.locker` recoloured (MED CABINET) |
| `L` | locker | `object.locker` (LOCKER) |
| `D` | desk | `object.desk` (DESK, cyan-lit terminal inset) |
| `P` | plant pot | `object.plant` (POTTED PLANT) |
| `x` (mapping TBC — Phase 4) | telescope / sensor array | `object.sensor` (SENSOR ARRAY) — **NOTE:** `x` is NOT in the executor's `SPRITE_FOR_GLYPH` (`client/src/render/glyphs.js`), so there is no shipped `x`→sensor mapping. Until the real sensor-array/telescope glyph is confirmed in the sim's `Glyphs.cs`, this row is provisional; an unmapped cell renders the `unknown` chip (VS-Z-25) rather than a wrong item |
| `,` | regolith stack | `item.regolith` (small warm-tan pile) |
| `o` | metal ore | `item.ore` |
| `s` | scrap | `item.scrap` |
| `p` | parts | `item.parts` |
| `c` | controller module | `item.controller` |
| `f` | potato | `item.potato` |
| `&` | corpse | `item.corpse` |

**VS-Z-20** — **Placement & footprint.** Each item builder draws centred on its tile centre
(VS-Z-15) at logical scale — the item-set stages are 150×132; the builder normalises its piece to
fit **one `U`-tile** by default (bed/desk/locker etc. that read as multi-tile in the mock's
illustration are single-tile objects here, one cell = one tile, matching the sim). No item overflows
its tile by more than the item-set's own soft shadow/glow.

**VS-Z-21** — **Item fidelity.** Every builder reproduces its item-set piece's fills, gradients,
insets, and soft glows verbatim (e.g. BUNK BED `#8a6b4a` frame + striped blanket
`repeating-linear-gradient(90deg,#c14a32 0 11px,#b0402b 11px 22px)` + cream pillow `#eadfca`; DESK
`linear-gradient(#7a5c38,#5f4527)` + cyan screen `linear-gradient(#0e3a44,#0b2a32)` glow
`rgba(90,200,220,.4)`). The mock's cabin arranges lower + upper bunk, footlocker, desk+terminal+chair,
wardrobe, shelf, framed photo, lamp, plant, porthole — that is one illustrative dressing; the client
draws whatever the sim's cells say.

**VS-Z-22** — **State is colour, never glyph** (the `Glyphs.cs` invariant). A door cell's
open/closed/locked and a device's powered/unpowered/broken state recolour the same item builder —
e.g. an unpowered terminal drops its cyan screen glow, a locked door tints its light-bar to
`--bad-txt`. Never a different item for a state.

**VS-Z-23** — **Cell colour honoured.** The `frame` cell's fg/bg colour ids (`GlyphColor`) tint the
item's accent where the item-set piece has an accent slot (screen glow, trim, status LED), so a lens
or fault state that recolours the sim cell shows through. The item's warm base material is fixed;
only the accent follows the wire colour.

**VS-Z-24** — **Item-local glow.** LAMP (`*`), WALL LAMP, REACTOR, FABRICATOR, WORKBENCH, and DESK
LAMP carry their own soft practical glow (`box-shadow` radial, item-set values, e.g. desk-lamp
`0 0 22px 8px rgba(232,134,60,.55)`) as part of the builder — these are the room's point warmth, on
top of the single ambient pool (VS-Z-11). No other item glows.

**VS-Z-25** — **Unknown glyph fallback**: a 32-unit dashed chip, `border:1.5px dashed
var(--txt-dim); color:var(--txt-dim); font-size:9px;` centred glyph char — visible-but-plain, so an
unmapped sim glyph is legible as "something is here we don't skin yet", never invisible and never
faked as a known object.

**VS-Z-26** — **Fog / unseen.** A cell the sim reports as fog/void (blank glyph, `GlyphColor.Unknown`)
renders nothing — bare floor. The Room Zoom shows own-ship rooms (fog is rare here); it never
invents furniture for an unseen tile.

---

## 5. Occupant pawns (VS-Z-27 … VS-Z-29)

**VS-Z-27** — Occupants are `frame.crew` entries (`[x, y, variant, cid]`) clamped to the room rect
(VS-Z-14), drawn as the **front-facing pawn SVG** from the mock: `viewBox="0 0 16 24"`, rendered at
`~74×111` logical (scaled by `s`), shape-rendering:auto, `display:block`, class `pawn`. Anatomy per
mock: contact-shadow ellipse `rgba(0,0,0,.4)`, hair cap `#3a2a1a`, face `#caa074`, torso `#8c8377`,
legs `#2b2018`, warm rim-light stripe `rgba(242,181,99,.4)` down the left edge.

**VS-Z-28** — A pawn is positioned by its tile centre (VS-Z-15), its feet on the tile (SVG bottom
edge = tile bottom), and painted above furniture so an occupant standing on a bunk/chair reads. When
a device it uses shares the tile, the pawn wins z.

**VS-Z-29** — ⚠️ **RETRACTED AND REPLACED at M1-K (2026-07-29).** It read, and the struck text is
kept because a grep for it must land on what replaced it: *"**No name tag, no idle animation in
Level 2.** The pawn is static (front-facing); who they are and what they are doing is answered by
clicking them (interaction spec), not by a floating label — the Room Zoom is the room's portrait, not
the crew HUD. (The mock labels the occupant "Ashby" in prose only; no on-canvas name element.)"*

**ITS JUSTIFICATION WAS FALSE ON THE DAY IT WAS WRITTEN, and only from live play did that surface.**
The clause that paid for the missing name — *"answered by clicking them (interaction spec)"* — points
at **IX-Z-30**, whose readout lives in the console's `.app` / `#panels`, and `client/styles.css`
sets `#panels{display:none}` for `body.roomzoom-open`. So the compensating affordance has **never
once executed on this surface**. The owner's report is what that cost in play: *"in zoom mode we have
no control over the pawn… we also lost the pawn we selected at the ship level."* The clause was also
already half-spent by WP-8, which ported the IX-103 **WORK tag** onto these same pawns — so "no
floating label" had not been true for a while either.

**VS-Z-29 (replacement) — identity + selection on the occupant.** Three elements, all inside the
room's tile rect and all below `pawnSvg`'s existing z-order rules:

- **Name pill** — the crew member's **surname** (`console-model.js`'s `surnameOf`, the Overview's own
  derivation), on **every** pawn in the room, always: `font-size:7.5`, `letter-spacing:.5`, Space
  Mono, on a `rgba(12,10,8,.78)` plate `rx:2`, height `9`, width `max(16, len*5.2 + 8)`. It is
  anchored at the **feet, inside the tile** — the plate spans `fy-8 … fy+1`, over the pawn's shins.
  Hanging it *below* the feet reads better on a sparse room and is wrong on a full one: the layer's
  viewBox ends at the room's last row, so the bottom row's names would be clipped away.
  *RimWorld analogue:* RimWorld labels colonists by name at their feet, on the map, by default.
  ⚠️ Flagged as an inference: the placement and the default-on behaviour are asserted from memory of
  the game, not from `docs/design/rimworld-reference.md` (which did not exist when this was written).
  Check this paragraph against that reference rather than the reverse.
- **Selection glow** — for the crew member the host reports as selected (`frame.sel` ∩ `frame.crew`,
  via `selectedCrewCid`), the **Overview's own pool**, copied formula for formula from
  `overview-scene.js`'s `pawnLayer`: a radial gradient `rgba(242,181,99,.65)` → transparent at 70 %,
  centred `(fx, fy-2)`, radius `S*9`, drawn **under** the pawn. Deliberately **not** RimWorld's white
  corner brackets: the player has just come from the Overview, where the glow already means "this
  one", and two indicators for one state on two halves of one surface is worse than the divergence.
- **Selected label reads amber** (`#f2b563`) where every other reads `rgba(220,210,195,.72)` — the
  same rule the Overview's `tagC` applies, so exactly one label is lit at a time.

**Still true from the retracted rule:** *no idle animation* — the pawn is static, front-facing.

⛔ **KNOWN LIMIT, measured in a browser and ACCEPTED, not patched.** A pill is **wider than its tile**
for any surname past ~4 characters (`len * 5.2 + 8` against `U = 32`), so **adjacent** pawns — not
merely pawns sharing a tile — have overlapping labels. Photographed on `--ship grid` deck 1, where
eight crew line up on one dig row and the pills read `VEGA HALLOR( OKONJO NOVAK KAUR`
(`docs/design/shots/m1-k-grid-11-grid-second-pawn.png`). The shipping game (`--ship wreck`) has
exactly **one** crew member, so this is not the case the owner reported, and where a crowd does occur
the **crew dock** disambiguates by name, task and selection. The two fixes both cost more than they
buy here: truncating the surname trades a crowd problem for a permanent one, and porting the
Overview's `layoutPawnLabels` de-clutter sweep (leader lines, row assignment, a crowded state) is its
own package.

---

## 5b. Crew dock (VS-Z-52 … VS-Z-54) — M1-K

**VS-Z-52** — **`.rz-crewdock`** is a blur-glass `.hud` island at `left:32px; top:74px; width:190px;
max-height:calc(100vh - 260px); overflow-y:auto; z-index:21`, i.e. the **same corner, the same island
and the same idiom** as the Overview's `.ov-crewwatch`, because it is **the same list the player was
reading one gesture ago**. It **floats over** `.rz-canvas` rather than shrinking it: the canvas
letterboxes its room, so the left margin is usually empty, and insetting the canvas would silently
rescale every room in the game to make space for a dock. **Cost, stated:** on a room wide enough to
fill the canvas the dock covers the leftmost ~2 tiles — the identical trade the Overview already
makes on the identical edge.

**VS-Z-53** — One row **per soul aboard**, in roster order, never room-filtered: `.rz-crew` is a
`<button type="button">` carrying `data-rzcrew` and `aria-pressed`, holding a `.rz-bust` (the shared
`pawnChip`, 28 px), a `.rz-crewname` (surname), a `.rz-crewtask` (the shared `watchTask`; `.working`
reads amber and nothing else does), and a `.rz-crewwhere` — **`HERE`** in amber when they are standing
in the room on screen, else the room they are in, else `DECK {n}` for a crew member in a hall.
⭐ **AMENDED 2026-08-03 (D4 fix-back)** — `.rz-crewtask` also carries a **hover `title`**: the WHOLE
task sentence, raw off the wire, both clauses included. The row's own text is the *what* half
shortened to this dock's **measured 22-character budget** (118 px — ⚠️ *not* the ~23 that every
comment in `console-model.js`, both views and `GameSession.cs` carried since M2-6: 23 characters
measure 120 px in this 118 px box, so the inherited figure was the CLIPPED one) so that D4's `· NO AIR` warning cannot be the
part the ellipsis eats. The `title` is NOT the feature — hover is invisible feedback and the warning
is in the always-visible row — it exists because this surface has **no selected readout** (the M4
Persona gap), so shortening the base would otherwise put the full device name and the ranking clause
out of reach inside a room.
*RimWorld analogue:* the **colonist bar** — every colonist, always, wherever the camera is.

**VS-Z-54** — The selected row carries `.sel` (`border-color:#cf7a33`, `background:rgba(34,27,18,.8)`
— the Overview's `.ov-crew.sel` values) **and** `aria-pressed="true"`, so which row is selected is
stated in words as well as in colour. Row nodes are created once per cid and mutated in place; they
are rebuilt **only** when the cid set changes.

---

## 6. Build-ghost layer (VS-Z-30 … VS-Z-33)

**VS-Z-30** — Pending designations are the `designs` channel (`[x, y, deck, kind, delivered,
required]`, `messages.js`), clamped to the room rect (VS-Z-14). Each renders as a **32-unit dashed
ghost tile**: `border:1.5px dashed #f2b563; background:rgba(232,147,74,.22); color:#f2b563;
font-size:9px;` centred, `z-index:4`, containing a two-letter abbreviation of its kind (VS-Z-31).
This is the mock's ghost exactly; it is authoritative (never client-invented — IX-38 carried here).

**VS-Z-31** — **Ghost abbreviations** (kind → label): `wall→WA`, `door→DO`, and — for the Level-2
functional-furniture palette (interaction spec) — `bunk→BU`, `desk→DE`, `chair→CH`, `locker→LO`,
`plant→PL`, `lamp→LA`. Cosmetic decor placements (`rug→RU`, `shelf→SH`) are NOT sim designations and
do not appear in this authoritative layer — they render live in the decor layer (§7) the instant
they are placed. An unknown kind shows `?`.

**VS-Z-32** — **Supply state** (the `delivered`/`required` ledger, IX-39 carried): `starved`
(required>0, delivered=0) → `border-color:var(--bad)` + `background:rgba(194,90,63,.08)` + kind
label `opacity:.45`; `ready` (delivered≥required) → `border-style:solid; border-color:var(--good)`;
`supplied`/`plain` keep the amber dashed look. An `n/m` count sits in the tile's bottom-right corner,
`font-size:` scaled to `U*s*0.26` (min 6px), `color:var(--txt-dim)`, tinted `--bad-txt` when starved
and `--good` when ready. Per §9, the red BORDER may be `--bad`; red TEXT is `--bad-txt`.

**VS-Z-33** — A ghost vanishes when its designation leaves `designs` (built or cancelled). No
client-side ghost persistence beyond the authoritative channel; the built object then appears in the
furniture layer (§4) on the next frame. Functional-furniture placement that has NOT yet lowered to a
sim command (Phase-4 pending, interaction spec) shows the input pulse only (IX-Z), never a lingering
fake ghost.

---

## 7. Cosmetic decor layer (VS-Z-34 … VS-Z-36)

**VS-Z-34** — Decor is **view-only and NEVER hashed sim state**: rug, bookshelf/shelf, framed photo,
porthole/viewport, deck sign, storage crate, fuel drum, standing-lamp glow, and the other item-set
COSMETIC pieces (`perilune-item-set.dc.html` §COSMETIC). It is carried on the read-only `decor`
channel (VS-Z-04) — `[roomId, itemId, tx, ty, …]` — replayed and rendered under the furniture layer
(VS-Z-13 layer 4), each piece drawn by its item builder at its tile (VS-Z-15).

**VS-Z-35** — Decor pieces render at item-set fidelity: e.g. RUG `repeating-linear-gradient(90deg,
#b34a34 0 16px,#a4402d 16px 32px)` + `inset 0 0 0 6px #d9b48a` frame + dashed inset; framed photo
`#12202e` + cream `#d9b48a` frame; PORTHOLE 74-unit `radial-gradient(circle at 40% 35%,#1c3a52,
#0c1a26)` + `0 0 0 6px #3a4b5c` steel ring + 3 star pips. A porthole/viewport is wall-mounted (drawn
on the room's edge tile), not floor decor.

**VS-Z-36** — Decor has no supply ledger, no ghost, no material cost, and no sim footprint; placing
or removing it is instant and local (interaction spec). It never blocks pathing or pressure (it is
not a sim entity) — a rug under a walking pawn is purely visual.

---

## 8. Breadcrumb (VS-Z-37 … VS-Z-39)

**VS-Z-37** — Top-left HUD, `left:32 top:24; display:flex; align-items:center; gap:9px; padding:9px
14px; border-radius:10px; font-size:11px; letter-spacing:.1em;` on the shared `.hud` blur-glass:
`background:rgba(18,14,10,.66); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
border:1px solid rgba(232,147,74,.18); box-shadow:0 10px 34px rgba(0,0,0,.5);`.

**VS-Z-38** — Content, left→right: `‹ PERILUNE` (`color:var(--txt-dim)`, `cursor:pointer` — pops to
Overview, IX-Z), separator `▸` (`color:var(--txt-faint)`, decorative), `DECK {n}`
(`color:var(--txt-dim)`, `cursor:pointer` — Overview at that deck, IX-Z), separator `▸`, `{ROOM
NAME}` (`color:#f2b563; font-weight:700;` — the current leaf, not a link). `{n}` is the focused
room's `deck` from its `decks` slot; `{ROOM NAME}` is CLIENT-DERIVED from the slot's `roomType`
(the `roomType`→label map, `anchorName` fallback, VS-Z-12) — never hardcoded, never a wire string.

**VS-Z-39** — The two link segments (`‹ PERILUNE`, `DECK {n}`) get `:focus-visible` +
`:hover color:var(--txt-hi)` per the game-ui focus/hover grammar (VS-55/VS-28). The room-name leaf is
inert (no hover, no cursor).

---

## 9-a. Deck minimap — SHARED component (VS-Z-40 … VS-Z-44)

**VS-Z-40** — **This is a shared component with the Overview** (VS-Z-03): the same
`client/src/ui/deck-minimap.js` renders the 8-slot deck grid in both the Overview (as the primary
navigator) and the Room Zoom (as the top-right you-are-here HUD). Its geometry, colours, and the
room-slot fills are authored ONCE to satisfy both surfaces; this section pins the Room-Zoom
presentation of it.

**VS-Z-41** — Top-right HUD on the shared `.hud` glass, `right:32 top:24; display:flex;
flex-direction:column; gap:6px; padding:11px; border-radius:12px;`. Header row `display:flex;
justify-content:space-between; align-items:center; gap:16px;`: left `SHIP · DECK {n}` (`font-size:8px;
letter-spacing:.16em; color:var(--txt-faint)`, decorative), right `{ROOM NAME}` (`font-size:8px;
letter-spacing:.12em; color:#f2b563`; the same CLIENT-DERIVED `roomType`→label name as VS-Z-12).

**VS-Z-42** — The deck-plan SVG: `width:188 height:80 viewBox="0 0 160 70"`, containing the spinal
corridor stub `rect x2 y24 w8 h16 rx3 #232d36`, the hull `rect x10 y12 w144 h46 rx16 #28323d stroke
#3f4e5c 2`, and the deck's rooms as an up-to-8-slot grid of `26×13 rx2` rects (mock layout: two rows
of four at `y20` / `y37`, x at `24/54/84/114`). Each slot's fill is CLIENT-DERIVED from that
slot's `decks` `roomType` (mapped through the same RoomType→hue table as the floor tint, VS-Z-06;
mock hues `#9a7c52 #8a9857 #c2894e #d8c39c` / `#a08a63 #a1875c #c8935a #e8863c`); the slot set and
occupancy come from the `decks` channel — a deck with fewer than 8 rooms renders fewer slots (no
empty placeholders).

**VS-Z-43** — **Current-room highlight**: the focused room's slot draws `fill:#e8863c stroke:#f2b563
stroke-width:1.5` (amber, ringed) — distinct from every other slot. Exactly one slot is highlighted.

**VS-Z-44** — **Pulsing you-are-here dot**: an absolutely-positioned `12×12` circle over the
highlighted slot's centre, `border-radius:50%; background:#f2b563; box-shadow:0 0 10px 3px
rgba(242,181,99,.7); animation:pulse 1.4s ease-in-out infinite;` where
`@keyframes pulse { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }`.
Under `prefers-reduced-motion:reduce` the dot is static at full opacity (game-ui motion budget,
VS-60). Every non-current slot is a click target back to that room's Room Zoom / Overview (IX-Z).

---

## 9-b. Construction palette (VS-Z-45 … VS-Z-49)

**VS-Z-45** — Bottom-centre, `left:50%; bottom:24; transform:translateX(-50%); display:flex;
flex-direction:column; align-items:center; gap:8px;`. Top element is the palette bar on the shared
`.hud` glass, `display:flex; gap:7px; align-items:center; padding:9px 12px; border-radius:12px;`,
led by the label `BUILD ▸ {ROOM NAME}` (`font-size:9px; letter-spacing:.16em; color:var(--txt-faint);
flex:none;`).

**VS-Z-46** — **Palette tools, in order**: `WALL`, `DOOR`, `BUNK`, `DESK`, `CHAIR`, `LOCKER`,
`SHELF`, `LAMP`, `RUG`, `PLANT`, `⌫ DEMOLISH`. Each button: `padding:8px 13px; border-radius:7px;
font-size:10.5px; letter-spacing:.04em; cursor:pointer;`. (Their command mapping — build vs.
place-device vs. decor vs. demolish — is the interaction spec's job; this section pins only their
look.)

**VS-Z-47** — Button state trios (mock's exact DCLogic values):
- inactive: bg `rgba(26,22,17,.5)` · fg `#8c8377` · bd `#3a332a`
- active (non-demolish): bg `#3a2a12` · fg `#f2b563` · bd `#cf7a33`  (the game-ui selected trio)
- active DEMOLISH: bg `#3a1a10` · fg `#e07a5f` · bd `#a53a25`  (the game-ui demolish trio)
Exactly one tool is active at a time (single-slot, interaction spec). Hover on an inactive button:
fg `#b3aa9c`, bd `#3a332a→#cf7a33` per the game-ui palette-hover grammar (VS-47).

**VS-Z-48** — **Hint line** below the bar: `font-size:9.5px; letter-spacing:.06em;
color:var(--txt-dim);` (bumped from the mock's `#57503f` per §9 — this is load-bearing instruction),
text: `SELECT AN ITEM · CLICK THE FLOOR TO PLACE · CLICK A GHOST WITH DEMOLISH TO REMOVE`.

**VS-Z-49** — The palette bar never wraps; at min viewport width it scrolls horizontally inside its
own `overflow-x:auto` with the scrollbar hidden (`scrollbar-width:none`), the eleven tools fitting at
1280 with the paddings above (safety valve only, per game-ui VS-26).

---

## 9. Contrast & token discipline (VS-Z-50 … VS-Z-52)

**VS-Z-50** — This view inherits the game-ui token ramp and its contrast audit
(`perilune-game-ui.visual-spec.md` §7): `#57503f`/`--txt-faint` is **decorative-only** (breadcrumb
separators, minimap header, palette group label, canvas footer caption at reduced-alpha cream —
self-evident chrome); it is NOT used for any text the player must read to act. The two deliberate
bumps vs. the mock: (a) the palette **hint line** `#57503f → var(--txt-dim)` (VS-Z-48), and (b) the
breadcrumb **`DECK {n}`** link `#57503f → var(--txt-dim)` (VS-Z-38) — both are informative /
actionable. Everything else keeps the mock's exact hexes.

**VS-Z-51** — `--bad` (`#c25a3f`, 4.4:1) is fills/bars/borders ONLY (starved-ghost border VS-Z-32,
locked-state tints); all red TEXT (starved `n/m`, demolish fg) uses `--bad-txt` (`#e07a5f`, 6.4:1).
Same discipline as game-ui VS-63.

**VS-Z-52** — No text-shadows and no decorative motion beyond the two keyframe loops
(`pulse` you-are-here dot; the input pulse is instrumental, ≤150 ms). Item glows (VS-Z-24) are
practical light, not decoration, and are exempt. Re-run the game-ui §7 table if any token hex here is
changed.

---

## 10. Precedence clause (VS-Z-53)

**VS-Z-53** — When this spec conflicts with another authority: on the **Overview** surface and the
**shared deck-minimap** contract, `docs/design/perilune-overview.*` wins; on **palette / material /
item geometry**, `docs/design/perilune-art-direction-warm.md` wins; on **wire-channel shape**
(`decks`/`rooms`/`decor`/`designs`/`frame`), `docs/design/perilune-wire-channels.spec.md` and
`client/src/wire/messages.js` win; on **client chrome tokens, typography, motion budget, and the
contrast audit**, `docs/design/perilune-game-ui.visual-spec.md` wins. This spec is authoritative only
for the Level-2 Room Zoom canvas and its layers. Where two authorities both plausibly apply, the more
specific (Room Zoom > Overview > game-ui chrome) governs the pixel in question.
