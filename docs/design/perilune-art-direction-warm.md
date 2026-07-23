# PERILUNE — SHIP-STAGE ART DIRECTION v2 ("the welcoming ship")

> **What this is.** The binding art bible for everything drawn on the ship stage under the
> warm re-skin: space, hull, walls, floors, rooms, furniture, devices, props, crew, and the
> floating HUD that frames them. It is specific enough to *produce* on-model work from and
> specific enough to *reject* work with. Every colour is quoted as the exact hex or rgba() it
> carries in the five imported mocks, which are the design authority; where a rule is derived
> rather than lifted, the derivation is written out.
>
> **What it SUPERSEDES.** This document replaces **`perilune-art-direction.md`
> ("the derelict", v1)** as the authority for the ship stage. The derelict's thesis — *"a cold
> ship with warm rooms in it"*, a graphite hull against true black, saturation hoarded, wear as
> the signature, produced through the Gemini/spritegen raster pipeline at 256 px/tile — is
> **retired**. The new thesis is its inverse: *a ship you would want to live in.* The two
> cannot both be authoritative and this one wins on every point of conflict. The derelict doc
> and its expression `art/spritegen/spec_derelict256.json` are to be moved to `docs/legacy/` in
> a later, separate step **(do not move any file now)**; until they are, treat them as
> superseded-in-place and cite this document.
>
> **What it is not.** It does not restate the console-chrome token palette
> (`perilune-game-ui.visual-spec.md` VS-1 still owns that for every pixel outside the stage),
> and it does not re-open the seam between console / stage / crew — **`perilune-color-harmonic.md`
> owns the seam and this document EXTENDS it, it does not fork it** (§10). Where a colour meaning
> crosses the canvas edge, the harmonic's H-rulings hold.
>
> **The mocks are the authority.** Five imported Design-Component files, read as specs not live
> pages, each with a header comment summarising it:
> - `perilune-ship-welcoming-tileset.dc.html` — the material language (walls + floors + rooms).
> - `perilune-item-set.dc.html` — the full 60-piece buildable catalog (30 objects, 6 walls,
>   6 floors, 18 fixtures).
> - `perilune-crew-sprites.dc.html` — the new front-facing SVG pawns + roster portrait chip.
> - `perilune-game-ui-warm.dc.html` — the Level-1 Ship-Overview composition + floating HUD.
> - `perilune-color-harmonic.md` — the console↔ship↔crew seam (extended here, §10).
>
> **The implementation constraint (hard).** This direction is realised as **pure SVG/CSS**:
> parametric DOM/SVG builders driven by the live wire (`client/src/render/pawn-svg.js`,
> `client/src/items/*`, `client/src/ui/overview-view.js` + `overview-model.js`, a RoomType→floor
> material table in `render/palette.js`). **No raster. No Gemini generation. No credits spent.
> The WebGL tile renderer is PARKED**, not re-skinned. There is no atlas, no `sprites.g.js`, no
> `tile_px`, no LANCZOS downscale, no acceptance-gate metrics pipeline in this direction — every
> §7-style "measured gate" of the derelict doc is void because there is no raster to measure. A
> shape is on-model if it matches the mocks; the mocks are the ground truth.
>
> **Status:** design. Nothing built. Determinism is unaffected — everything here is view-only;
> the cosmetic decor layer is **never hashed** (see §6).

---

## 1. Mood and the five principles

> **A cozy, lived-in colony sim that happens to be in space.**

A ship with people in it, warmed by the materials they built it from. The derelict asked *what
is being kept barely alive*; the welcoming ship asks *what is worth living in*. The reference is
not a prison and not a wreck — it is a home under way, a galley that smells of the last meal, a
quarters with a striped blanket and a porthole. Warmth is the whole point, and it comes from
**materials and practical light, never from sparkle**.

**WA-1 · Warmth comes from materials, not effects.** The heavy lifting is done by *what things
are made of* — warm plank and timber, fabric, cream tile, growing plants, navy-steel with an
amber trim — not by glow, bloom, particles or shine. The caption of the tileset mock states it:
*"Swapping the materials does the heavy lifting."* A room reads warm because it is floored in
`#c2894e` wood, not because a filter was laid over grey metal.

**WA-2 · Each room reads at a glance by material + tint.** You should be able to name a
compartment with every device deleted, from its floor material and its wall alone: **wood** for
social / living, **grow-matting** for hydroponics, **cream tile** for med / helm, **steel-tan
grid** for corridor / utility. Purpose is legible in the surface. This is the derelict's
"floor material carries room identity" rule kept intact — the one idea that survives the
supersession — recoloured warm.

**WA-3 · Glow lives only where power is.** Lighting is soft and practical: a hearth, a cooker
ring, a workbench lamp, a sun-lamp over a planter, the amber trim along a powered bulkhead, a
lit screen. There is no ambient bloom and no decorative shine. A room glows *from within* where
a device is running; a doorway spills a little of that light onto the floor; an unpowered space
simply does not glow. This is the harmonic's H-2 said in materials: **warm means alive, powered,
inhabited** — and it is the emotional arc of the whole game, a ship that warms toward you as you
restore it.

**WA-4 · Chunky, readable, top-down.** Furniture and devices are chunky rounded solids read
from above, nameable at tile size (the item mock stages every piece on a 150×132 well). Pawns
are chunky front-facing figures with softly rounded corners. Nothing is a hairline, a lattice,
or a wireframe. Legibility over fidelity, always.

**WA-5 · Crew are the warmest, most saturated thing on the stage.** Inherited unchanged from
harmonic H-3: saturation is spent on crew first. Rooms are muted materials; the eight souls
walking them each own a full-chroma role hue (§8) and carry an amber rim-light so they catch the
same practical glow the rooms do. Warm crew on a warm-but-muted ship still read as the brightest
living things in it.

---

## 2. The warm palette

Every value below is the literal hex/rgba from the mocks. Read this as the token set; §5, §6,
§7 and §8 apply it.

### 2.1 Void / space — the deep-navy ramp (never black)

Full-bleed space is a **deep navy**, not the derelict's true black. The Ship-Overview backdrop
is a three-stop radial:

| stop | hex | role |
|---|---|---|
| space core | `#141a2b` | the lit centre of the field |
| space mid | `#0a0c16` | the 50 % ring |
| space edge | `#05060c` | the outermost navy — as dark as the ship gets, and it is still blue-navy, not `#000` |

`radial-gradient(150% 120% at 60% 30%, #141a2b 0%, #0a0c16 50%, #05060c 100%)`
(`perilune-game-ui-warm.dc.html`). The tileset stage uses a warmer near-navy variant
(`#16283a → #0c1522`); the item stages sit on `#0a0d14`.

**Nebula washes** — low-opacity, three hues, so the void has depth without brightness:
purple `rgba(90,70,150,.16)`, teal `rgba(40,120,130,.12)`, rust `rgba(180,90,60,.09)`, plus a
soft galaxy smudge `rgba(255,240,220,.9) → rgba(232,181,120,.5) → rgba(150,120,180,.2)`.
**Stars** are deterministic (`Math.sin(seed)` hash), sized 1–3 px, tinted from
`['#fff','#ffe9cf','#cfe0ff','#f2d9b0']`, twinkling on a 2–5.5 s cycle.

### 2.2 Hull — navy-steel

| element | hex | note |
|---|---|---|
| hull plate / silhouette fill | `#28323d` | the ship body (`HULL PLATING` floor is the same `#28323d`) |
| hull stroke / outline | `#3f4e5c` | the ship's edge line |
| hull inset shadow | `#1c242d` | inner bevel on the plate |
| bulkhead / wall body | `#3a4b5c` | walls in the tileset; `#3f4e5c` is the lighter stroke variant |
| deep steel (nacelle, bridge nub) | `#1f2830` / `#1a222b` | the dark structural triangles |

**Amber trim-light** — the single detail that makes navy-steel read as *warm, powered* rather
than cold metal. It is an inset top edge on every bulkhead:
`box-shadow: inset 0 3px 0 rgba(232,147,74,.55)` (tileset walls) /
`inset 0 4px 0 <trim>` on room floors (UI mock), where `<trim>` ranges
**`rgba(232,147,74,.35)` → `.6`** by how powered the room is. The trim band is the ship's
heartbeat: brighter amber = more power. Rivets under it are near-black `rgba(0,0,0,.35–.4)`.

### 2.3 Amber — the accent ramp

The warm signal that ties the stage to the amber console. Four rungs plus its rust and highlight
neighbours:

| token | hex | use |
|---|---|---|
| amber-deep | `#cf7a33` | the anchor (matches console `--amber-1`); breadcrumb ship name, active borders |
| amber-1 | `#e8934a` | primary amber accent, trim source, links |
| amber-light | `#f2b563` | highlights, selected text, rim-light, cursor |
| amber-rust | `#b5652a` | the darker warm end (also stores-role uniform) |
| ember | `#e8863c` | radiant cores (reactor, cooker, hearth) with `#ffe6b0` hot centre |
| rust-red | `#c14a32` / `#c25a3f` | reactor role, hazard, med cross; the warm-red end |

Amber glows are `radial-gradient(circle, #f2b563, #e8863c 60%, #c14a32)` with a soft
`box-shadow ... rgba(232,134,60,.5–.6)` — practical light, never bloom.

### 2.4 Room floor materials

The four load-bearing room materials (full catalog in §5):

| material | body hex | second stripe / detail | room role |
|---|---|---|---|
| **wood plank** (living / social) | `#c2894e` | `#b57e45` (light stripe) / `#bd9066`+`#b08659` (quarters variant) | galley, mess, quarters, common |
| **grow matting** (hydroponics) | `#8a9857` | dot texture `rgba(60,90,40,.5–.55)` | hydroponics, gardens |
| **cream tile** (med / helm) | `#d8c39c` | faint grid `rgba(0,0,0,.1)` | med bay, helm, bridge |
| **steel-tan grid** (corridor / utility) | `#9c8763` | grid `rgba(0,0,0,.14–.16)` / `#917c59` | spine, corridors, life-support, utility |

### 2.5 Status colours

| meaning | hex | note |
|---|---|---|
| good / online / nominal | `#5aa77f`, bright `#6fc09a` | matches console `--good`; battery charge, morale-high, crew status |
| warn / caution | `#cf7a33` | matches console `--warn`; brownout, morale-mid |
| bad / fault / hazard | `#c25a3f`, bright `#e07a5f` | matches console `--bad`; demolish, morale-low |
| cold / cryo / coolant | `#5a9fd4` / `#5ac8dc` | the ONE cool signal, reserved per harmonic H-2 |

These are the harmonic's resolved semantic ramp (H-7). Do not introduce a second vocabulary for
good/warn/bad on the stage.

### 2.6 UI ink ramp

The text/label hierarchy on the floating HUD, warm-grey ascending to cream:

| token | hex | use |
|---|---|---|
| ink-body | `#b3aa9c` | default HUD body text |
| ink-mute | `#8c8377` | secondary text, role labels |
| ink-faint | `#57503f` | micro-labels ("CREW WATCH", "SELECTED", "LENS") |
| ink-bright | `#e8dcc9` | crew names, headings — the brightest ink |

Hairline borders `#2b241c`, panel-inset borders `#3a332a`, active border `#cf7a33`, highlight
text `#f2b563`.

---

## 3. Materials and lighting

**WA-6 · The material vocabulary is: timber, plank, fabric, cream tile, plants, navy-steel.**
Warm organic surfaces dominate; navy-steel is the structural counterpoint that the amber trim
warms. No concrete, no grey plate, no institutional finish (that was the derelict, and the
prison it was measured against). Wood is `#c2894e`/`#8a5e38`; fabric is striped weave
(`#c14a32`/`#b0402b` blankets, `#eadfca` cream pillows, `#b34a34`/`#a4402d` rugs with
`#d9b48a` fringe); plants are `#5f8a3a`/`#4f7a30` and `#6f9c48`/`#3f6b2a`.

**WA-7 · Powered rooms glow warm from within — via screen blend, never bloom.** Each room
carries a soft radial glow-pool: `radial-gradient(circle, <amber>, transparent 70%)` with
`mix-blend-mode: screen`, sized a little larger than the room. Amber for living/utility
(`rgba(242,181,99,.13–.16)`), reactor-hot (`rgba(232,134,60,.22)`), green for hydro
(`rgba(120,150,70,.16)`), cool for cream/med (`rgba(90,159,212,.12)`). The glow is *screened
over* the material — it lifts and warms, it does not wash to white. An unpowered room omits its
glow-pool entirely (WA-3).

**WA-8 · Doorways spill amber onto the floor.** A door threshold paints a short amber strip on
the floor just inside it: `rgba(242,181,99,.35)`, ~60×10 px (tileset door thresholds). This is
the light of the powered space reaching across the sill — the smallest expression of WA-3.

**WA-9 · Devices are their own light sources; they do not light neighbours.** A hearth, cooker
ring, reactor core, workbench lamp, standing lamp, sun-lamp, lit screen each carry their own
radial glow + soft shadow. That glow is a *property of the object's cell*, cast into the room's
glow-pool by the room, not painted onto adjacent geometry. (The derelict's AD-4 kept for the
same reason: the sim's power/light state must not be contradicted by baked light. Here light is
CSS/SVG on live-state elements, so a browned-out room dims its own glows.)

**WA-10 · Grounding is a soft shadow under each solid, part of the object.** Unlike the
derelict (where shadows were strictly renderer-owned because of atlas cells), the SVG pawns and
items carry their own soft contact shadow: a low ellipse `rgba(0,0,0,.35–.4)` under a pawn,
`0 3px 6–8px rgba(0,0,0,.35–.4)` drop under furniture. Because there is no atlas cell to clip
and no grading curve to distort, the shadow can live with the shape.

---

## 4. Rooms — rounded compartments

**WA-11 · A room is a rounded compartment: material floor + inset dark border + inset amber top
trim-light + inner shadow.** The exact construction from the UI mock's room builder:

```
box-shadow: inset 0 4px 0 <amber-trim>,        /* the top trim-light, .35–.6 alpha  */
            inset 0 0 20px rgba(0,0,0,.3),      /* the inner shadow — a lived-in well */
            inset 0 0 0 1px rgba(0,0,0,.35);    /* the dark inset border             */
border-radius: 2px;
background: <material fill>;                    /* per §2.4 / §5                      */
```

The trim-light sits at the *top* edge (the wall the light is mounted on); the inner shadow sinks
the floor so the room reads as a recessed compartment rather than a flat sticker; the 1 px dark
border separates it from the hull plate and its neighbours. The tileset variant uses
`inset 0 8px 22px rgba(0,0,0,.22)` for a deeper well and explicit `#3a4b5c` wall bars between
rooms (§5).

**WA-12 · Furniture is chunky, readable, top-down, placed on the floor.** Each piece is a
rounded solid with a soft drop shadow and, where it is warm wood, an inset amber highlight
(`inset 0 2px 0 rgba(242,181,99,.3–.35)`). Beds carry cream pillows (`#eadfca`) + striped
blankets; planters carry a green glow; workbenches an amber lamp glow; a porthole/viewport is a
dark navy disc with a thin light rim. Furniture geometry does not change the sim — it is the
existing workstation re-skinned in place (tileset caption: *"the layout, pawns, and workstations
stay exactly as they are"*).

**WA-13 · The ship silhouette is a hull with warm engine glows.** At Level-1 (Ship Overview),
the ship is a single rounded hull path (`#28323d` fill, `#3f4e5c` stroke) with two amber engine
glows (`rgba(232,134,60,.5)` blurred + `#e8863c` ring + `#ffe6b0` core), fore/aft nacelle
triangles (`#1f2830`), a spine corridor, a 2×4 grid of room compartments, and a cool BRIDGE nub
(`#12202e`, `rgba(122,180,220,.35)` stroke — the one cool interior accent, earned per H-2). A
thin amber cabin-run line (`rgba(242,181,99,.4)`) runs along the top of the room band with
`#f2b563` window dots — the ship's lit windows seen from outside.

---

## 5. The 6 walls + 6 floors catalog

Buildable materials, lifted from the item-set mock. **Walls carry the amber trim-light; floors
show their material pattern.** These drive the material table in `render/palette.js` and the
buildable variants.

### 5.1 Walls / bulkheads

| # | name | body | detail |
|---|---|---|---|
| 1 | **STEEL BULKHEAD** | `#3a4b5c` | amber trim `inset 0 5px 0 rgba(232,147,74,.5)` + inset `#2b3742` + near-black rivet dots |
| 2 | **TIMBER-LINED WALL** | `#8a5e38` / `#7a5230` planks | inset border `#5f3f26` |
| 3 | **BLAST WALL** | `#2b3742` / `#232c34` | inset `#4a5560` + hazard stripe `#e8934a`/`#2b241c` |
| 4 | **GLASS PARTITION** | `rgba(90,200,220,.28)` → `rgba(90,159,212,.12)` | inset `#4a5560` + inner sheen `rgba(255,255,255,.18)` |
| 5 | **INSULATED WALL** | `#4a5560` | fine grid `rgba(0,0,0,.18)` + inset `#38424d` |
| 6 | **HULL PLATING** | `#28323d` | inset `#1c242d` + panel lines + rivet dots |

### 5.2 Floors

| # | name | body | pattern | room role |
|---|---|---|---|---|
| 1 | **STEEL-TAN** | `#9c8763` | grid `rgba(0,0,0,.16)` @22px | corridor / utility |
| 2 | **WOOD PLANK** | `#c2894e` / `#b57e45` | 21 px planks | living / social |
| 3 | **GROW MATTING** | `#8a9857` | dots `rgba(60,90,40,.55)` @15px | hydroponics |
| 4 | **CREAM TILE** | `#d8c39c` | grid `rgba(0,0,0,.1)` @26px | med / helm |
| 5 | **METAL GRATING** | `#6e6656` | slat + dot texture | catwalk / engineering |
| 6 | **CARPET** | `#b34a34` / `#a4402d` | inset `#d9b48a` fringe | quarters / comfort |

---

## 6. The item set — 60 buildable pieces

**WA-14 · The catalog is a parametric SVG library, one pure builder per piece.** Sourced from
`perilune-item-set.dc.html`: **30 objects, 6 walls, 6 floors, 18 fixtures.** Every piece is a
chunky top-down rounded solid in the palette of §2, staged on a 150×132 well, nameable at tile
size. The split (from the mock's implementation note) is binding:

- **FUNCTIONAL → existing sim `DeviceKind`, pure re-skin, NO sim change, NO new hashed state.**
  reactor, solar, battery, scrubber, oxygen/water tank, hydroponics/growbed, cooker/stove,
  fabricator, workbench/machineshop, recycler, bunk/bed, desk, chair, locker, plant, med bed,
  research console/terminal, door, airlock, ladder/hatch, vent, light.
- **COSMETIC → view-only decor layer, NEVER hashed.** rug, bookshelf, shelf-rack, standing/wall
  lamp, framed photo, viewport, deck sign, storage crate, fuel drum, comms dish, sensor array,
  cryopod, turret, weapons rack, supply barrel. These exist only in the client; the sim never
  sees them; adding one moves no determinism pin.
- **WALLS / FLOORS → material tables + buildable variants (§5).**

**WA-15 · Colour idioms the catalog uses consistently:** navy-steel machine bodies
(`#4a5560`→`#38424d`, inset `#2b3742`); warm-wood furniture (`#7a5334`→`#5f3f26`, amber inset
highlight); ember cores (`radial #f2b563→#e8863c→#c14a32` + soft amber shadow); cyan lit screens
(`linear #0e3a44→#0b2a32`, glow `rgba(90,200,220,.5)`); green plant rows
(`#5f8a3a`/`#4f7a30`, glow `rgba(95,138,58,.4)`); hazard stripes (`#e8934a`/`#2b241c` @45°);
cryo/cool blues (`#5a9fd4`→`#3a86a8`). Emissive elements glow *themselves* (WA-9).

---

## 7. Pawns — the warm crew

**WA-16 · Pawns are chunky FRONT-FACING figures, softly rounded rects, drawn as inline SVG on a
16×24 viewBox.** Not hard pixel cubes — every body part is a `rect` with a corner radius
(`rx 1–2.2`). The exact anatomy (`perilune-crew-sprites.dc.html`, identical in the UI mock):

| part | geometry | fill |
|---|---|---|
| ground shadow | `ellipse cx8 cy23 rx6 ry1.3` | `rgba(0,0,0,.35–.4)` |
| hair | `rect x4 y2 w8 h3.4 rx1.6` + two side rects | `{c.hair}` (warm dark, per soul) |
| skin (face) | `rect x4.7 y3.8 w6.6 h6.4 rx2.2` | `{c.skin}` (warm tone, per soul) |
| eyes | two `1×1` rects at y7 | `#2a201a` |
| collar accent | `rect x4 y10 w8 h1` | `{c.accent}` (role accent) |
| torso + 2 arms | rounded rects | `{c.uniform}` (role hue) |
| hands | `2×1` skin flecks | `{c.skin}` |
| boots | two `rect ... rx1` | `#2b2018` / sole `#16100b` |
| **amber rim-light** | `rect x4 y4 w1 h13` (down the LEFT side) | **`rgba(242,181,99,.4)`** |

**WA-17 · Warm skin, role-coloured uniform, ground shadow, amber rim-light one side.** The
rim-light is non-negotiable — it is what makes a pawn catch the same practical glow the rooms
do (WA-3), and it is on the left because the practical light reads from upper-left. Skin tones
are warm (`#8a5a38`, `#a06e42`, `#d8b48c`, `#6b4327`, `#9a6440`, `#c99a6a`, `#7a4a28`, `#caa074`)
and vary per soul so eight read distinct without any extra art.

**WA-18 · Front-facing means NO facing rotation.** Directional motion reads via **position slide
+ bob**, never by turning the sprite. Pawns join `SPRITE_NO_ROTATE`. The bob is a gentle
±1.5–2 px `translateY` on a ~3.2–3.4 s cycle, phase-offset per soul. (This preserves the shipped
PAWN SLIDE INVARIANT — smooth sub-tile slide from `motion.js` — and the "never blink / face
where you walk" fixes are moot because the figure never turns.)

**WA-19 · Sized ~one bed-length tall.** In-world the pawn renders at roughly 32×48 device px on
the ~26 px room grid (UI mock) — chunky, a little taller than a bed is long, unmistakably a
person on the plank floor. Selected pawns get an amber underglow disc
(`radial rgba(242,181,99,.65)`) and a `#f2b563` name tag; unselected a muted tag.

**WA-20 · The same builder serves two forms.** (1) the in-world pawn; (2) a roster **portrait
chip** — a bust on a 16×20 viewBox in a rounded well (`radial #2a3a48→#141d26`) with an amber
underglow strip (`radial rgba(242,181,99,.35)`) at the base, for CREW WATCH and the SELECTED
readout. One pure function of crew data, role hue a parameter, deterministic hair/skin/uniform
per `cid`. This retires the raster portrait pipeline for crew (harmonic H-9 is satisfied by
construction: the hue reaches map, in-world pawn, and roster together).

---

## 8. Per-role hue table

**WA-21 · Each role owns a hue, so the deck reads at a glance.** From
`perilune-crew-sprites.dc.html` (the authority for role→hue):

| role | uniform (hue) | accent |
|---|---|---|
| LIFE-SUPPORT | `#e8934a` amber | `#f2b563` |
| HYDROPONICS | `#6f8a3a` green | `#9ab55a` |
| REACTOR WATCH | `#c14a32` rust | `#e8724a` |
| DAMAGE CONTROL | `#4a6b82` teal | `#7fb0d8` |
| SHIP'S MEDIC | `#e8dcc9` cream | `#c14a32` |
| HELM WATCH | `#2f6f7a` deep teal | `#5ab0b8` |
| STORES & LOGISTICS | `#b5852f` gold | `#e0b45a` |
| COMMS & SENSORS | `#5a9fd4` blue | `#8fc4ea` |

The two teals (damage-control `#4a6b82` vs helm `#2f6f7a`) are close; keep them distinct by
pairing each with its accent, and prefer not to place both on the same deck without labels.

> **Conflict flagged (see §12).** The **UI-warm mock** assigns its six *named characters* a
> different, role-agnostic hue set — Volkov(reactor) `#cf7a33`, Okoye(quartermaster) `#5aa77f`,
> Calderón(engineer) `#c25a3f`, Qadir(medic) `#e8934a`, Brandt(hydroponicist) `#b5652a`,
> Ashby(apprentice) `#8c8377`. This does not match the crew-sprites role table above.
> **Resolution: the crew-sprites role→hue table (this §8) is authoritative for the hue a role
> owns; the UI mock's per-character values are illustrative placeholder data, not a competing
> table.** A specific *character* may still deviate from their role hue by authored intent, but
> the default is the role.

---

## 9. The HUD — floating, translucent, blurred

**WA-22 · The HUD is content-sized translucent glass panels floating over full-bleed space.**
Not a docked chrome frame — discrete rounded panels that hover over the ship. The panel token
(`.hud` in `perilune-game-ui-warm.dc.html`):

```
background: rgba(18,14,10,.62);
backdrop-filter: blur(10px);
border: 1px solid rgba(232,147,74,.16);      /* hairline amber */
box-shadow: 0 10px 34px rgba(0,0,0,.5);
```

Warm near-black brown at 62 % over a 10 px blur, hairline amber border, soft drop shadow. Each
panel is sized to its content and positioned at a corner/edge; the ship shows through the gaps.

**WA-23 · Panels (Level-1 Ship Overview layout).**
- top-left **breadcrumb**: `MSV PERILUNE · DECK 2 · HABITATION & DRIVE · DAY 212 · 06:41` —
  ship name in `#cf7a33` bold, location in `#57503f`, time in `#b3aa9c`.
- top-right controls: pause/run chip, `1×` speed, a blinking `CAUTION · CO₂` chip
  (`rgba(58,42,18,.72)` bg, `#e8934a`, `plnBlink`).
- left **CREW WATCH** dock: portrait chip + surname + role + morale bar; click selects.
- right **SELECTED** readout: portrait bust + name/role/room, trait chips, `> task`, a memory
  line, a CURRENT ROOM atmos box (O₂/CO₂/temp/power), and `[T] OPEN CHANNEL — TALK` / `[M] MOVE`
  / `[B] BIO`.
- bottom-left **LENS** row (none / pressure / O₂ / CO₂ / temp / power).
- bottom-centre **command bar**: PLACE palette + menu tabs
  (BUILD / REFIT / ORDERS / CREW / RELATIONS / SHIP / MOSS / NAV / CHRONICLE).
- bottom-right **SENSOR LOG** (last 3).

**WA-24 · The mini-ship locator IS the ship silhouette.** The breadcrumb's spatial companion is
the Level-1 hull drawing itself (WA-13) — the player always sees where they are because the whole
ship is the map. A smaller locator glyph reuses the same hull path.

**WA-25 · Type is Space Mono; micro-labels are UPPERCASE with wide letter-spacing.** Every
section header ("CREW WATCH — 6 SOULS", "SELECTED", "LENS", "PLACE ▸", "SENSOR LOG — LAST 3") is
uppercase Space Mono at ~9–10 px, `letter-spacing .1–.18em`, colour `#57503f` (ink-faint).
Body text `#b3aa9c`, names `#e8dcc9`/`#f2b563`. No text-shadows, no glow on type (harmonic H-8 /
VS-15: the neon era is over). The selection cursor/reticle is amber `#f2b563`, no blur.

---

## 10. The seam — extending the colour harmonic

This document does not re-decide the console↔ship↔crew seam; **`perilune-color-harmonic.md`
owns it and its rulings hold.** What the warm re-skin changes is that the harmonic's *direction
of travel* is now the destination, not a correction:

**WA-26 · The warm re-skin is the harmonic's H-4/H-5 arrived.** The harmonic's whole thesis was
that the stage should stop being a blue gel — warm the lit ambient (H-4), make an unlit room
*warm-dark* not cold (H-5), reserve cold for the hull and vacuum only. This document builds the
stage *warm from the start*: the materials are warm, the void is navy (not black), the only cool
things are the reserved ones — cryo/coolant/cold-lens (`#5a9fd4`/`#5ac8dc`), the glass partition,
the bridge nub, the med/helm cream's cool glow-pool. Everything else is warm. The harmonic's H-4
`AMBIENT_LIT` warm value and H-5 warm-dark unlit room are *the default surface*, not an overlay.

**WA-27 · One meaning, one colour, both sides of the canvas (H-7 kept).** good `#5aa77f` /
warn `#cf7a33` / bad `#c25a3f` / cold `#5a9fd4` are shared by console chrome, stage lens washes,
and status readouts. `LensCold` stays cool — it is the one meaning that earns a cool hue (§2.5).

**WA-28 · Crew do not share the ship's hue (H-3 kept).** The ship is muted warm materials; crew
own full-chroma role hues (§8) with an amber rim. Crew rhyme with the amber console — with *you*
— not with the deck they stand on.

**WA-29 · The crew hue reaches map, pawn, and roster together (H-9 satisfied).** Because a single
SVG builder (§7) produces both the in-world pawn and the portrait chip from the same `cid`→hue
mapping, the map and roster can never disagree — the orphaned-hue defect the harmonic flagged is
structurally impossible here.

---

## 11. The AVOID list

Reject any stage or HUD work that contains:

- **Pure black** (`#000`, true-black backgrounds). Space is navy (`#05060c` floor), the deck is
  warm. Nothing on screen is `#000`.
- **Cold grey concrete, grey plate, institutional metal.** That is the derelict and the prison
  it echoed. Materials are warm (§3, §6).
- **Harsh borders / hard outlines / heavy black ink rims.** Corners are softly rounded; edges
  are dark-navy insets (`rgba(0,0,0,.35)`), not black keylines. (There is no baked outline law
  here — the derelict's 8 px uniform ink is void; SVG shapes read by form + soft shadow.)
- **Saturated gradients, rainbow ramps, long airbrush gradients.** Fills are flat or a two-stop
  material stripe; glows are short soft radials, screen-blended.
- **Neon.** No electric cyan/magenta, no glowing outlines, no cyberpunk trim. The one cool
  accent family is the reserved cold signal (§2.5), used sparingly.
- **Emoji** anywhere in the art or HUD. (Deck signs use Space Mono glyphs like `2 ▸`.)
- **UI sparkle** — bloom, lens flare, chromatic aberration, sheen, twinkling chrome, animated
  gloss, text-shadows/glow on type.
- **Hard pixel cubes for pawns.** Figures are softly rounded rects (WA-16), never sharp voxel
  blocks.
- **Baked light contradicting sim state.** A room's glow is on a live-state element and dims
  with power (WA-9); do not hard-paint a lit look onto an unpowered space.

---

## 12. Conflicts found between the mocks

Recorded so they are resolved once, not re-litigated:

1. **Role→hue vs named-character hue.** The crew-sprites mock's role table (§8) and the UI-warm
   mock's per-character hues disagree (e.g. reactor is `#c14a32` in one, `#cf7a33` in the other;
   medic `#e8dcc9` vs `#e8934a`). **Resolved (§8): the crew-sprites role table is authoritative;
   the UI mock's values are placeholder character data.**

2. **Wall body hex: `#3a4b5c` vs `#3f4e5c`.** The tileset/item walls use `#3a4b5c`; the UI ship
   silhouette stroke uses `#3f4e5c`. These are one step apart. **Resolved: `#3a4b5c` is the wall
   body; `#3f4e5c` is the lighter hull-edge stroke.** Both kept, different jobs (§2.2).

3. **Amber trim thickness: `inset 0 3px 0` (tileset walls) vs `inset 0 4px 0` (UI room floors)
   vs `inset 0 5px 0` (item STEEL BULKHEAD swatch).** Not a real conflict — thickness scales
   with the element's rendered size; the *colour and alpha* (`rgba(232,147,74,.35–.6)`) are
   consistent. Treat px thickness as size-relative.

4. **Void backdrop hue.** UI mock `#141a2b→#0a0c16→#05060c` (navy), tileset stage
   `#16283a→#0c1522` (warmer teal-navy), item stages `#0a0d14`/`#2a2018` (warm). **Resolved: the
   UI-warm three-stop navy ramp (§2.1) is the canonical full-bleed space; the tileset/item
   backdrops are per-mock staging, not the game void.**

No conflict was found in the floor/wall material palette, the pawn anatomy (the crew-sprites and
UI-warm pawn SVGs are byte-identical), or the HUD `.hud` token.

---

## 13. Order of work (informative)

Colour + material tables first (they unblock everything), then the SVG builders, then the HUD
composition. None of it touches the sim or moves a determinism pin — it is all view-only, the
cosmetic decor layer is never hashed, and there is no raster to regenerate.

1. **Palette + material tables** — RoomType→floor-material map + wall/floor variants in
   `render/palette.js`; the amber-trim + glow-pool CSS. (§2, §5)
2. **Pawn SVG builder** — `render/pawn-svg.js`, one pure function → in-world pawn + portrait
   chip, role hue + deterministic per-`cid` variety. Join `SPRITE_NO_ROTATE`. (§7, §8)
3. **Item SVG library** — `client/src/items/*`, one builder per piece; functional→re-skin,
   cosmetic→view-only never-hashed decor. (§6)
4. **Overview view** — `client/src/ui/overview-view.js` + `overview-model.js`: rooms, furniture,
   glow-pools, pawns, ghosts, driven by the live wire (frame + roster + view-only decks/rooms
   channels). (§4, §11–12)
5. **Floating HUD** — the `.hud` panels, breadcrumb, mini-ship locator, CREW WATCH, SELECTED
   readout, LENS, command bar, SENSOR LOG. (§9)

The WebGL renderer stays parked throughout; nothing here revives it.
