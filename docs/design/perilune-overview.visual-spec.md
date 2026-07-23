# PERILUNE LEVEL-1 SHIP OVERVIEW — VISUAL SPEC v1 ("Warm deck schematic")

Target: build a NEW pure SVG/DOM view — `client/src/ui/overview-view.js` +
`client/src/ui/overview-model.js` — to the warm deck-schematic language of
`docs/design/perilune-game-ui-warm.dc.html` (the Overview mock). Every value below is exact
and implementable as written; it is the mock's own `data`/`renderVals` verbatim. This is the
**Level-1** surface: a whole deck seen at once, floating over full-bleed space. Clicking a room
descends to **Level 2** (Room Zoom), which this spec does NOT own (see VS-O-04).

The Overview is a distinct top-level view, a sibling of the RELATIONS web and the MOSS terminal
takeover: it replaces the WebGL tile canvas and the solid console grid of
`perilune-game-ui.visual-spec.md` with a live SVG schematic + **floating** blur-glass HUD
islands. It is NOT a reskin of the tile renderer and NOT a static picture — it is driven by the
live wire (`frame` + `roster` + `designs` + the new view-only `decks`/`rooms` channels).

Conventions: colors are the mock's hexes verbatim. "Trio" = background / foreground / border.
All borders `1px solid` unless stated. Coordinates in the ship layer are in the mock's
`0 0 1300 561` design space (VS-O-13), scaled uniformly to the rendered container.

---

## 0. Scope & precedence (VS-O-01 … VS-O-04)

**VS-O-01** — This spec is the visual authority for the Level-1 Overview surface: the space
field, the hull silhouette, the 8-slot room grid + its floors/furniture/glow, the front-facing
pawns, the deck rail, and the floating HUD islands. Where this spec and the Overview mock
conflict, THIS spec resolves the conflict and the resolution is final (the mock is a snapshot,
not a contract).

**VS-O-02** — **Palette defers to `docs/design/perilune-art-direction-warm.md`.** Every hex
below is the mock's snapshot of the warm palette; where a value here disagrees with the
art-direction doc, the art-direction doc wins and this spec is corrected. Introduce no hue that
is neither in the mock nor in the art-direction ramp.

**VS-O-03** — **Shared HUD chrome defers to `perilune-game-ui.visual-spec.md`.** The semantic
components housed inside the floating islands — crew-watch row, readout card, lens button, tab,
build-palette button, sensor-log line, caution/pause/speed chips, morale color function — reuse
that console spec's grammar and its `:root` tokens (VS-1). This spec pins only what the Overview
adds or re-houses: the floating-island geometry, the `.hud` glass token, and the space/hull/
room/pawn/deck-rail layers. Do not re-fork the token set; import the console's.

**VS-O-04** — **Room-detail defers to `perilune-roomzoom.*`.** Everything painted AFTER a room
is clicked (the Level-2 zoomed room, its enlarged furniture, per-tile detail, occupant list) is
owned by the roomzoom spec. This spec owns only the Level-1 room as a compartment tile and the
transition trigger (see the interaction spec IX-O-11). **Data-channel shapes defer to
`perilune-wire-channels.spec.md`** — the `decks`/`rooms` channels are referenced here, never
redefined.

---

## 1. The space field (VS-O-05 … VS-O-12)

**VS-O-05** — Page + view background. `body { background:#05060c; }`. The view root is
`position:relative; overflow:hidden; font-family:var(--font-mono); color:#b3aa9c;` with
`background:radial-gradient(150% 120% at 60% 30%, #141a2b 0%, #0a0c16 50%, #05060c 100%);`.
Reference proportion is 1920×1000; the root fills its container and everything inside scales
from that (VS-O-52). `pointer-events` pass through the field to the layers above it.

**VS-O-06** — Three nebula washes, absolutely positioned, `border-radius:50%;
pointer-events:none;`, in this order (back to front):
1. `left:-6%; top:8%; width:52%; height:90%;` `radial-gradient(circle, rgba(90,70,150,.16), transparent 65%)`
2. `right:-8%; bottom:-24%; width:48%; height:80%;` `radial-gradient(circle, rgba(40,120,130,.12), transparent 65%)`
3. `left:38%; top:-22%; width:44%; height:62%;` `radial-gradient(circle, rgba(180,90,60,.09), transparent 65%)`

**VS-O-07** — One galaxy smudge: `right:12%; top:9%; width:190px; height:74px;
transform:rotate(-22deg); border-radius:50%; filter:blur(.5px); pointer-events:none;`
background `radial-gradient(ellipse at center, rgba(255,240,220,.9) 0%, rgba(232,181,120,.5) 18%, rgba(150,120,180,.2) 45%, transparent 72%)`.

**VS-O-08** — **Deterministic starfield — 220 stars, seeded, never random.** The generator is
the mock's, and it is PURE (goes in `overview-model.js`, node-tested): `rnd(s) =
frac(sin(s) * 10000)`. For star `i` (0…219): `b = rnd(i+0.7)`; size `s = b>0.94 ? 3 : b>0.8 ? 2
: 1` px; color `c = COLS[floor(rnd(i+0.3) * COLS.length)]` where
`COLS = ['#fff','#ffe9cf','#cfe0ff','#f2d9b0','#ffffff']`;
`x = round(rnd(i)*100, 2)`%, `y = round(rnd(i+0.5)*100, 2)`%;
`glow = s>=2 ? '0 0 '+(s*2)+'px '+c : 'none'`;
`d = round(2 + rnd(i+0.2)*3.5, 1)`s (twinkle period); `delay = round(rnd(i+0.9)*4, 1)`s.
Determinism is load-bearing: the field must be pixel-identical across reloads and machines
(InvariantCulture number formatting — no locale APIs in the model).

**VS-O-09** — Each star renders as `position:absolute; left:{x}%; top:{y}%; width/height:{s}px;
border-radius:50%; background:{c}; box-shadow:{glow}; pointer-events:none;
animation:plnTw {d}s ease-in-out infinite; animation-delay:{delay}s;`.

**VS-O-10** — Twinkle keyframe: `@keyframes plnTw { 0%,100% { opacity:.3 } 50% { opacity:1 } }`.
Disabled under `prefers-reduced-motion:reduce` (VS-O-74): stars hold `opacity:.65` static.

**VS-O-11** — The space field, nebulae, galaxy, and stars are all `pointer-events:none` — they
never intercept a click meant for the ship or the HUD.

**VS-O-12** — Z-order of the whole view, bottom to top: space field → nebulae → galaxy → stars
→ ship layer (hull SVG, room floors, glow pools, furniture, ghosts, pawns) → floating HUD
islands → deck rail → transient overlays (nudge, placement pulse). Exact within-ship z is
VS-O-46.

---

## 2. The hull silhouette (VS-O-13 … VS-O-24)

**VS-O-13** — Ship layer container: `position:absolute; left:310px; top:172px; width:1300px;
height:561px; cursor:crosshair;` at reference scale (VS-O-52 scales it with the view). It holds
one SVG (`viewBox="0 0 1300 561"`, `pointer-events:none; overflow:visible;`) plus the absolutely
positioned room/furniture/glow/ghost/pawn layers, all in the same 1300×561 design space. The
container is the click surface for build placement (interaction spec IX-O-19).

**VS-O-14** — Engine glow: two ellipses `cx=70`, `cy=230` and `cy=330`, `rx=72 ry=34`,
`fill:rgba(232,134,60,.5); filter:blur(3px)`.

**VS-O-15** — Nacelle triangles (fore + aft), `fill:#1f2830; stroke:#33414d; stroke-width:2`:
fore `M540 150 L660 74 L860 150 Z`, aft `M540 411 L660 487 L860 411 Z`.

**VS-O-16** — Nacelle struts: group `stroke:rgba(232,147,74,.3); stroke-width:1.5`, four lines:
`600,132→700,96` · `660,140→740,108` · `600,429→700,465` · `660,421→740,453`.

**VS-O-17** — Engine housings: two rects `x=24`, `y=196` and `y=296`, `width=86 height=68 rx=10`,
`fill:#232d36; stroke:#39424c; stroke-width:2`.

**VS-O-18** — Engine cores: two `circle cx=34` at `cy=230`/`cy=330`, `r=20; fill:#e8863c;
animation:plnEflick 1.4s ease-in-out infinite` (the second `animation-delay:.5s`), each with an
inner `circle r=10 fill:#ffe6b0`. Keyframe `@keyframes plnEflick { 0%,100% { opacity:.75 } 50% {
opacity:1 } }`; disabled under reduced-motion, cores hold `opacity:1`.

**VS-O-19** — Hull body: one path `fill:#28323d; stroke:#3f4e5c; stroke-width:3`,
`d="M150 168 C 420 132 860 132 1070 158 Q 1180 172 1274 280 Q 1180 389 1070 403 C 860 429 420
429 150 393 Q 96 384 92 344 L 92 217 Q 96 177 150 168 Z"`.

**VS-O-20** — Interior structure lines, group `stroke:rgba(0,0,0,.28); stroke-width:2; fill:none`:
two horizontals `150,262→1120,262` and `150,300→1120,300` (the spine walls), two verticals
`340,150→340,410` and `700,146→700,414` (compartment divisions). These are the schematic bones
the room slots register against (VS-O-25).

**VS-O-21** — Amber deck accent: one path `fill:none; stroke:rgba(242,181,99,.4); stroke-width:2`,
`d="M160 172 C 420 138 860 138 1065 163"` (the warm top rail of the hull).

**VS-O-22** — Four amber portholes along the top rail: `circle r=2.6 fill:#f2b563` at
`(300,141)`, `(520,135)`, `(760,137)`, `(980,147)`.

**VS-O-23** — Bridge nub (fore): outer path `M1090 210 Q 1210 250 1250 280 Q 1210 310 1090 350
Z` `fill:#1a222b; stroke:#3f4e5c; stroke-width:2`; inner viewport path `M1110 232 Q 1195 258
1222 280 Q 1195 302 1110 328 Z` `fill:#12202e; stroke:rgba(122,180,220,.35); stroke-width:1.5`;
two star-blue pips `circle r=1.4 fill:#cfe0ff @(1150,270)` and `r=1.2 @(1175,288)`; label
`<text x=1120 y=284 fill=rgba(122,180,220,.5) font-size=9 letter-spacing=1>BRIDGE</text>`. The
cool blue of the bridge is deliberate — it is the ONE non-amber accent, and it reads as glass.

**VS-O-24** — The hull SVG is `pointer-events:none` in its entirety; clicks reach the container
(VS-O-13) and the room/pawn layers above it, never the hull art.

---

## 3. The room grid — the 8-slot template (VS-O-25 … VS-O-34)

**VS-O-25** — **The layout is a fixed 8-slot template: a 2×4 room grid plus a horizontal spine
corridor.** The slot rectangles (design space, `left top width height`) are FIXED chrome — they
do not come from the wire; the wire says only WHICH slot is occupied and BY WHAT (VS-O-26):

| slot | col | row | left | top | width | height |
|---|---|---|---|---|---|---|
| A0 | 0 | top    | 205 | 168 | 150 | 96 |
| A1 | 1 | top    | 370 | 168 | 175 | 96 |
| A2 | 2 | top    | 560 | 168 | 175 | 96 |
| A3 | 3 | top    | 750 | 168 | 160 | 96 |
| SPINE | — | mid | 190 | 270 | 930 | 30 |
| B0 | 0 | bottom | 205 | 306 | 150 | 96 |
| B1 | 1 | bottom | 370 | 306 | 175 | 96 |
| B2 | 2 | bottom | 560 | 306 | 175 | 96 |
| B3 | 3 | bottom | 750 | 306 | 160 | 96 |

Column widths are shared row-to-row (150/175/175/160). The spine spans all four columns between
the rows. This grid is the same on every deck.

**VS-O-26** — Slot→room binding and slot geometry come from the view-only `decks` channel
(shape owned by `perilune-wire-channels.spec.md`): each `SlotTuple` is
`[slotIndex, x, y, w, h, anchorName, roomType, occupied, active]`, so the deck's slot tile-rects,
the slot↔room binding (`anchorName`), and the `roomType` byte all originate here — never from
`rooms` (which carries atmosphere only, VS-O-63). Everything a room needs to PAINT is then
CLIENT-DERIVED from that `roomType`:

- **Floor material / colors** — `mat ∈ {wood, grow, grid, cream}`, base floor color `bg`, plank
  `line` color, inset `trim` color, and `label` ink color are NOT on the wire. The client maps the
  `decks` `roomType` through a palette table (the RoomType→floor-tint table in
  `perilune-art-direction-warm.md` / `client/src/render/palette.js`) to obtain them. The wire
  carries `roomType` only, never colors.
- **Display `name`** — neither channel carries a human room name; `decks` carries only
  `anchorName` (an id like `hab1`). The uppercase label is CLIENT-DERIVED by a `roomType`→label
  map (Quarters→`QUARTERS`, Mess→`MESS HALL`, Hydro→`HYDROPONICS`, …), with `anchorName` as the
  fallback label when the roomType has no mapped name.
- **Atmos read** (`o2`, `co2`, `temp`) is the SEPARATE `rooms` channel, joined by `anchorName`,
  surfaced in the readout (VS-O-63).

The mock's nine bound rooms are the reference values for the client palette/label tables (the
`bg`/`line`/`trim`/`label` columns are the derived-color reference, the `name` column the
derived-label reference — both keyed off the room's `roomType`):

| roomType (slot) | anchorName | derived name | bg | line | mat | trim | label |
|---|---|---|---|---|---|---|---|
| A0 | reactor  | REACTOR      | #9a7c52 | #8e7049 | wood  | rgba(232,147,74,.6)  | rgba(50,35,20,.7) |
| A1 | hydro    | HYDROPONICS  | #8a9857 | #7e8c4d | grow  | rgba(232,147,74,.4)  | rgba(30,35,20,.7) |
| A2 | mess     | MESS HALL    | #c2894e | #b57e45 | wood  | rgba(232,147,74,.5)  | rgba(50,35,20,.7) |
| A3 | med      | MED BAY      | #d8c39c | #cdb891 | cream | rgba(90,159,212,.4)  | rgba(40,45,55,.7) |
| SPINE | corr  | SPINE        | #9c8763 | #917c59 | grid  | rgba(232,147,74,.35) | rgba(45,38,25,.6) |
| B0 | lifesup  | LIFE SUPPORT | #a08a63 | #95805a | grid  | rgba(232,147,74,.4)  | rgba(45,38,25,.65)|
| B1 | hold     | MAIN HOLD    | #a1875c | #957c52 | wood  | rgba(232,147,74,.4)  | rgba(45,38,25,.65)|
| B2 | galley   | GALLEY       | #c8935a | #bd8850 | wood  | rgba(232,147,74,.5)  | rgba(50,35,20,.7) |
| B3 | quarters | QUARTERS     | #bd9066 | #b08659 | wood  | rgba(232,147,74,.5)  | rgba(50,35,20,.7) |

**VS-O-27** — Room box chrome: an absolutely positioned div at the slot rect,
`box-sizing:border-box; border-radius:2px;` `box-shadow: inset 0 4px 0 {trim}, inset 0 0 20px
rgba(0,0,0,.3), inset 0 0 0 1px rgba(0,0,0,.35);`. The `inset 0 4px 0 {trim}` is the amber
**top trim-light** — a warm strip along the top edge of every compartment; it is the room's
signature and must not be dropped. The room box is `pointer-events:none` — the room CLICK target
is a sibling hit-rect (interaction spec IX-O-11), not the tinted floor, so glow/blend layers
never steal the click.

**VS-O-28** — Material floors (the `background` of the room box), PURE from `mat` (function
`floorBg(room)` in `overview-model.js`):
- `wood` (default): `repeating-linear-gradient(90deg, {bg} 0 42px, {line} 42px 45px)`
- `grow`: `radial-gradient(rgba(60,90,40,.5) 2px, transparent 3px) 0 0 / 16px 16px, {bg}`
- `grid`: `linear-gradient(rgba(0,0,0,.14) 1px, transparent 1px) 0 0 / 26px 26px,
  linear-gradient(90deg, rgba(0,0,0,.14) 1px, transparent 1px) 0 0 / 26px 26px, {bg}`
- `cream`: `linear-gradient(rgba(0,0,0,.08) 1px, transparent 1px) 0 0 / 24px 24px,
  linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px) 0 0 / 24px 24px, {bg}`

**VS-O-29** — Room label: a child div, `font-size:8.5px; letter-spacing:.12em; color:{label};
padding:4px 6px;` showing the room `name`. 8.5px is below the console's 9px floor (VS-16) but is
a canvas-schematic annotation, not chrome text; it is acceptable here as a map label (matches
the console's own map-label exception).

**VS-O-30** — Furniture layer: a flat list of chunky blocks over the floors, each an absolutely
positioned div `left/top/width/height; border-radius:{r}px; background:{bg}; box-shadow:{sh};
pointer-events:none;`. Furniture is anchored to its room: an item's `{dx,dy}` offset resolves to
`x = slot.left + dx`, `y = slot.top + dy`. The furniture set per room is data (the mock hardcodes
`furnByRoom`; in the live view it arrives with the room on the `rooms` channel). Shared material
constants (verbatim):
```
CONS  = linear-gradient(#333d47,#232b33)
SCRN  = linear-gradient(#0e3a44,#0b2a32)     SCRNg = 0 0 7px 2px rgba(90,200,220,.5)
AMBRs = linear-gradient(#3a2a10,#2a1e0c)     AMBRg = 0 0 8px 2px rgba(232,147,74,.5)
DESK  = linear-gradient(#7a5c38,#5f4527)
GREEN = repeating-linear-gradient(90deg,#5f8a3a 0 11px,#4f7a30 11px 20px)
```
The mock's `furnByRoom` (reactor core+console, life-support tank, hydro trays ×2, mess table,
med-bay bed+cabinet+console, hold crates, galley counter+stove, quarters bunk+desk) is the
reference furniture vocabulary. Full item geometry is reproduced from the mock's `furnByRoom`
table; deeper per-item detail is a Level-2 concern and defers to `perilune-roomzoom.*`.

**VS-O-31** — Glow pools: one soft amber radial per room EXCEPT the spine, `border-radius:50%;
mix-blend-mode:screen; pointer-events:none;` `background:radial-gradient(circle, {c}, transparent
70%)`, geometry `left:slot.left+2; top:slot.top-6; width:slot.width+6; height:slot.height+30;`.
Pool color `c` PURE from the room (function `glowColor(room)`):
- `grow` → `rgba(120,150,70,.16)`
- `cream` → `rgba(90,159,212,.12)`
- `id === 'reactor'` → `rgba(232,134,60,.22)`
- else → `rgba(242,147,74,.14)`

The `mix-blend-mode:screen` is what makes the pool read as light rather than paint; it must sit
above the floors and below the pawns (VS-O-46).

**VS-O-32** — The spine (`corr`) renders as a room box + `grid` floor + label like any slot, but
takes NO glow pool (VS-O-31) — it is a corridor, not a lit compartment.

**VS-O-33** — All lit-room material tints and glow colors are the resting (lens `none`) look.
When a lens is active the floors recolor per the lens grade (interaction spec IX-O-29); the grade
ramps defer to `perilune-game-ui.visual-spec.md` VS-7 and to `perilune-art-direction-warm.md`.

**VS-O-34** — On decks with fewer than 8 bound rooms, unbound slots render as HALLS (VS-O-35),
not as blank space; the spine is always present. All decks exist from cold start (interaction
spec IX-O-04), so there is never an "empty deck" — only halls awaiting build-out.

---

## 4. Empty slots — buildable halls (VS-O-35 … VS-O-38)

Spec-authored (the mock shows all slots bound, so these values are derived from the mock's ghost
grammar and the warm palette; they defer to `perilune-art-direction-warm.md`).

**VS-O-35** — An unbound slot renders a HALL: the slot rect with `box-sizing:border-box;
border-radius:2px; background:rgba(12,10,8,.35);` (near-void, so a hall reads as unpressurized
raw volume, distinct from any tinted floor), `box-shadow: inset 0 0 0 1px rgba(0,0,0,.35);` — no
trim-light, no glow pool, no furniture.

**VS-O-36** — Add-room affordance: centered in the hall, a dashed amber chip reusing the ghost
look (mock's build-ghost grammar) — `border:1.5px dashed #f2b563; background:rgba(232,147,74,.22);
color:#f2b563; border-radius:2px; padding:4px 8px; font-size:8.5px; letter-spacing:.10em;`
text `＋ ADD ROOM`. It is the only interactive element inside a hall (interaction spec IX-O-13).

**VS-O-37** — A hall label (the slot's designation, e.g. `HALL · A2`) renders in the top-left
like a room label (VS-O-29) but in `color:rgba(140,131,119,.6)` (dim) so a hall never reads as a
commissioned room.

**VS-O-38** — Hover on a hall (pointer, no armed tool): the dashed chip brightens to
`border-color:#f2b563; background:rgba(232,147,74,.30);` and the hall floor lifts to
`background:rgba(12,10,8,.45);`. No hover state under an armed build tool (the floor is a
placement surface then — interaction spec IX-O-21).

---

## 5. The pawns (VS-O-39 … VS-O-48)

**VS-O-39** — Pawns are **front-facing chunky SVG figures generated by the pawn-svg generator
(the crew-sprites mock)**; the mock's inline pawn SVG is that generator's output and is the
reference construction. Per-crew inputs are four colors — `hue` (uniform), `accent` (collar
stripe / rim), `hair`, `skin` — sourced from the crew's appearance data alongside the roster
(the same identity the console's avatar uses). Position (`x`, `y`, `deck`) comes from the
`roster` wire, in the same tile space as the rest of the client; only pawns on `frame.deck`
render (interaction spec IX-O-15).

**VS-O-40** — **NO facing rotation, NO mirroring — ever.** The pawn always faces the viewer.
Walking direction is conveyed ONLY by the position changing over time plus the bob (VS-O-44); the
figure is never rotated, flipped, or turned to face travel. This is a hard invariant of the warm
art direction (a front-facing cast reads as portraits-in-motion, not top-down sprites).

**VS-O-41** — Pawn container: absolutely positioned div at the pawn's projected tile,
`width:32px; height:48px; margin:-40px 0 0 -16px; cursor:pointer; z-index:5;` with `title` = the
crew's full name (native tooltip). The negative margin seats the figure's feet on the tile.

**VS-O-42** — Selected glow: a child div behind the figure, `left:50%; bottom:-3px;
transform:translateX(-50%); width:34px; height:34px; border-radius:50%;
background:radial-gradient(circle, {selGlow}, transparent 70%);` where `selGlow =
selectedCid === thisCid ? 'rgba(242,181,99,.65)' : 'transparent'`. Selection is derived from the
wire (`selectedCrewCid`), never latched on click (interaction spec IX-O-16).

**VS-O-43** — Pawn body SVG: `class="pawn" width=32 height=48 viewBox="0 0 16 24"`, layers in
paint order (the generator's fixed stack):
1. ground shadow `ellipse cx=8 cy=23 rx=6 ry=1.3 fill:rgba(0,0,0,.4)`
2. hair cap `rect x=4 y=2 w=8 h=3.4 rx=1.6 fill:{hair}`
3. face `rect x=4.7 y=3.8 w=6.6 h=6.4 rx=2.2 fill:{skin}`
4. hair sides `rect x=4 y=4 w=1 h=6` and `rect x=11 y=4 w=1 h=6`, `fill:{hair}`
5. eyes `rect x=6 y=7 w=1 h=1` and `rect x=9 y=7 w=1 h=1`, `fill:#2a201a`
6. collar stripe `rect x=4 y=10 w=8 h=1 fill:{accent}`
7. torso `rect x=3.8 y=10.6 w=8.4 h=6.6 rx=1.8 fill:{hue}`
8. arms `rect x=2 y=11.2 w=2.4 h=5 rx=1.1` and `rect x=11.6 y=11.2 w=2.4 h=5 rx=1.1`, `fill:{hue}`
9. body shade `rect x=11 y=11 w=1 h=6 fill:rgba(0,0,0,.16)`
10. hands `rect x=2 y=16 w=2 h=1` and `rect x=12 y=16 w=2 h=1`, `fill:{skin}`
11. legs `rect x=5 y=17 w=2.9 h=5 rx=1` and `rect x=8.1 y=17 w=2.9 h=5 rx=1`, `fill:#2b2018`
12. boots `rect x=5 y=21 w=3 h=1` and `rect x=8 y=21 w=3 h=1`, `fill:#16100b`
13. amber rim-light `rect x=4 y=4 w=1 h=13 fill:rgba(242,181,99,.4)` — the warm edge down the
    figure's left side (VS-O-45).

**VS-O-44** — Bob: the body SVG carries `animation:plnBob 3.4s ease-in-out infinite;
animation-delay:{i*0.5}s` (stagger by roster index so the crew don't bob in lockstep).
`@keyframes plnBob { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-1.5px) } }`.
Disabled under reduced-motion (VS-O-74): the figure holds `translateY(0)`.

**VS-O-45** — The rim-light (layer 13) is a fixed warm edge, NOT a light-direction cue that
turns with movement — it is always down the figure's left. Consistent with VS-O-40: the pawn's
lighting, like its facing, is invariant.

**VS-O-46** — Ship-layer z-order, bottom to top: hull SVG (VS-O-24) → room boxes/floors →
furniture → glow pools (`mix-blend:screen`) → build ghosts (`z-index:4`) → pawns (`z-index:5`).
The glow pool sits UNDER the pawn so a crew member is lit by the pool, not washed out by it.

**VS-O-47** — Surname tag: a child div above the head, `left:50%; top:-11px;
transform:translateX(-50%); font-size:7.5px; letter-spacing:.06em; color:{tagC};
background:rgba(12,10,8,.72); padding:1px 4px; border-radius:2px; white-space:nowrap;` where the
text is the crew SURNAME (last whitespace token, uppercased — same pure `surnameOf` as the
console) and `tagC = selected ? '#f2b563' : 'rgba(220,210,195,.7)'`. The selected tag brightens
to amber, matching the selected glow (VS-O-42).

**VS-O-48** — A pawn whose tile is fogged / off the current deck simply does not render; there
is no ghost or placeholder for an unseen crew member (their presence is the CREW WATCH dock's
job — VS-O-58).

---

## 6. The deck rail (VS-O-49 … VS-O-52)

Spec-authored (the mock shows the current deck only as status text; the task requires a rail for
up to 8 decks). Values derive from the warm palette + the console tab grammar; defer to
`perilune-art-direction-warm.md`.

**VS-O-49** — The deck rail is a vertical `.hud` glass island on the LEFT edge, centered
vertically: `position:absolute; left:26px; top:50%; transform:translateY(-50%);
display:flex; flex-direction:column; gap:6px; padding:10px 8px; border-radius:12px;`. It carries
one pip per existing deck, top pip = highest deck number, so up/down reads spatially.

**VS-O-50** — Deck pip: a button `width:34px; height:26px; border-radius:6px; font-size:11px;
text-align:center; cursor:pointer;` showing the deck number.
- inactive: `background:rgba(26,22,17,.6); color:#8c8377; border:1px solid #3a332a;`
- active (`deck === frame.deck`): `background:#3a2a12; color:#f2b563; border:1px solid #cf7a33;`
  (the shared selected trio).
- hover (inactive): `color:#b3aa9c; border-color:#57503f;`

**VS-O-51** — The rail shows every deck that exists (all present from cold start, up to 8 —
IX-O-04); it never shows more than the deck count and never renders a disabled/"future" pip. If
the deck count is not yet known on connect, the rail shows only the active deck's pip until the
`decks` channel lands (defer channel shape to `perilune-wire-channels.spec.md`).

**VS-O-52** — Responsive scaling: the 1920×1000 reference is a proportion, not a fixed size. The
space field fills the container; the ship layer (VS-O-13) and the deck rail scale uniformly to
keep the hull centered, with the floating HUD islands pinned to the container edges at their
mock offsets (VS-O-53+). Minimum supported viewport 1280×800; below it the view clips rather than
reflowing (a schematic, like the console — matches `perilune-game-ui.visual-spec.md` VS-17).

---

## 7. Floating HUD islands (VS-O-53 … VS-O-72)

**VS-O-53** — The `.hud` glass token (the material of every floating island):
`background:rgba(18,14,10,.62); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
border:1px solid rgba(232,147,74,.16); box-shadow:0 10px 34px rgba(0,0,0,.5);`. Every island in
this section is a `.hud`. This is the Overview's defining chrome — floating amber glass over
space — and is the deliberate divergence from the console's solid opaque bars (VS-O-03).

### Top status + controls

**VS-O-54** — Top-left status island: `position:absolute; left:26px; top:22px; display:flex;
align-items:center; gap:16px; padding:9px 16px; border-radius:11px; font-size:11px;
letter-spacing:.1em;` containing three spans:
- `MSV PERILUNE` — `color:#cf7a33; font-weight:700;` (client chrome, hardcoded ship name)
- deck context — `color:#8c8377;` text `DECK {n} OF {total} · {deck-name}` (mock shows `DECK 2 ·
  HABITATION & DRIVE`; the `OF {total}` and any deck name come from the `decks` channel — omit
  the name when the channel supplies none). **Deviation from mock:** the mock's `#57503f` fails
  contrast for load-bearing deck info — bumped to `#8c8377` (matches console VS-64).
- clock — `color:#b3aa9c;` text `DAY {day} · {HH:MM}` (pure `clockHHMM(dayFrac)` from
  `perilune-game-ui.interaction-spec.md` IX-81).

**VS-O-55** — Top-right controls island group: `position:absolute; right:26px; top:22px;
display:flex; align-items:center; gap:8px;`, three chips:
- pause chip — `.hud; cursor:pointer; padding:8px 12px; border-radius:9px; font-size:11px;
  color:{pauseCol};` label `‖ HOLD` running (`color:#8c8377`) / `► RUN` paused (`color:#e8934a`).
  State strictly from `status.paused` (IX-82).
- speed chip — `.hud; padding:8px 12px; border-radius:9px; font-size:11px; color:#8c8377;` text
  the speed label (`1×`, `5×`, …) via the console's `speedLabel` (IX-83).
- caution chip — `.hud; padding:8px 14px; border-radius:9px; font-size:11px; font-weight:700;`.
  Warn look (mock's) `background:rgba(58,42,18,.72); color:#e8934a; border-color:rgba(232,147,
  74,.4); animation:plnBlink 1.6s infinite;` text `CAUTION · {cause}`. State/label/alert-grade
  and the idle/alert trios defer to `perilune-game-ui.interaction-spec.md` IX-84 (one caution
  language across both views). Blink keyframe `@keyframes plnBlink { 0%,60% { opacity:1 }
  70%,100% { opacity:.25 } }`; disabled under reduced-motion (colors carry the state).

### Left CREW WATCH dock

**VS-O-56** — Dock island: `position:absolute; left:26px; top:96px; width:236px; padding:12px;
border-radius:14px; display:flex; flex-direction:column; gap:7px;`.

**VS-O-57** — Dock header: `font-size:10px; letter-spacing:.18em; color:#57503f;
padding:0 2px 2px;` text `CREW WATCH — {n} SOULS` (decorative-tier `#57503f` is allowed on a
self-evident section header — console VS-62).

**VS-O-58** — Crew row: `display:flex; gap:9px; align-items:center; padding:7px;
border:1px solid {bd}; border-radius:8px; background:{bg}; cursor:pointer;`.
- resting: `bd:rgba(46,40,32,.6); bg:transparent;`
- selected: `bd:#cf7a33; bg:rgba(34,27,18,.8);` (derived from the wire selection, IX-O-16).

**VS-O-59** — Row avatar: `width:40px; height:40px; border-radius:6px; overflow:hidden;
background:radial-gradient(circle at 50% 30%, #2a2018, #12100d); box-shadow:inset 0 0 0 1px
rgba(232,147,74,.18); flex:none;`, containing a bottom light band `left:0; right:0; bottom:0;
height:14px; background:radial-gradient(circle at 50% 100%, rgba(242,181,99,.35), transparent
70%);` and a bust-crop pawn SVG (`class="pawn" viewBox="0 0 16 20"`, the generator's bust variant
— head+torso only, no legs; positioned `left:0; top:5px;`). Where a generated PORTRAIT exists it
replaces the SVG bust (`<img>` `object-fit:cover`), same rule as the console avatar (VS-34).

**VS-O-60** — Row text column (`min-width:0; flex:1;`): surname line `font-size:11px;
color:#e8dcc9;` ellipsized; role line `font-size:8.5px; color:#8c8377; text-transform:uppercase;
letter-spacing:.08em;`; morale track `height:3px; background:rgba(43,36,28,.8); border-radius:2px;
margin-top:4px;` with fill `height:3px; border-radius:2px; width:{morale%}; background:{moraleC};`.
`moraleC` PURE: `≥.75 → #5aa77f`, `≥.50 → #cf7a33`, else `#c25a3f` (console `moraleColor`, VS-4).

### Right SELECTED readout

**VS-O-61** — Readout island: `position:absolute; right:26px; top:96px; width:298px;
padding:16px; border-radius:14px; display:flex; flex-direction:column; gap:10px; font-size:11px;`
led by header `SELECTED` (`font-size:10px; letter-spacing:.18em; color:#57503f;`).

**VS-O-62** — Bust row: `display:flex; align-items:center; gap:12px;` — a `52×52`
`border-radius:8px` avatar (same construction as VS-O-59, `box-shadow:inset 0 0 0 1px {hue}` in
the selected crew's uniform hue, bust pawn `viewBox="0 0 16 20"` positioned `top:7px`) beside a
name block: name `color:#f2b563; font-size:14px; font-weight:700;` and role/room line
`color:#8c8377; text-transform:uppercase; letter-spacing:.1em; font-size:9.5px; margin-top:3px;`
text `{role} · {room}` (the current room from the pawn's occupied slot).

**VS-O-63** — Readout body, in order below the bust:
- trait chips — `display:flex; gap:6px; flex-wrap:wrap;` each `border:1px solid #3a332a;
  border-radius:3px; padding:2px 7px; font-size:9.5px; color:#b3aa9c;` (inert; from the cached
  `citizen` payload, absent when none — console VS-38).
- task line — `border-top:1px dashed #2b241c; padding-top:9px; color:#e8dcc9;` text `> {task}`
  (roster label verbatim; console IX-104 vocabulary).
- memory line — `color:#8c8377; font-size:10.5px; line-height:1.6;`. **Honesty:** rendered ONLY
  when the wire supplies memory text; the mock's `Remembers: …` line is a mock fiction and is NOT
  fabricated (console VS-40 rule).
- CURRENT ROOM atmos box — `border:1px solid #2b241c; border-radius:8px; padding:9px;
  background:rgba(16,13,10,.6); display:flex; flex-direction:column; gap:5px;` containing: label
  `font-size:9px; letter-spacing:.16em; color:#57503f;` `CURRENT ROOM · {room}`; an ATMOS row
  (`justify-content:space-between; font-size:10px;`) — `ATMOS` in `#8c8377` / `{o2} O₂ · {co2}
  CO₂` in `#6fc09a`; a TEMP·POWER row — `TEMP · POWER` in `#8c8377` / `{temp} · {pwr}` in
  `#f2b563`. The `o2`/`co2`/`temp` values come from the selected crew's room on the `rooms`
  channel (joined by `anchorName`, VS-O-26). The `rooms` tuple carries NO power field, so `{pwr}`
  is a coarse per-room power state DERIVED CLIENT-SIDE from the `decks` slot's `active` flag
  (`active === true` → `ON`, else `OFF`) — the same live power/lit predicate the amber glow-pool
  reads (VS-O-31). (If a finer per-room load ever becomes available from the `systems` channel it
  supersedes this; the `active`-derived ON/OFF is the honest floor, never a fabricated number.)

**VS-O-64** — Readout actions, `display:flex; flex-direction:column; gap:6px;`:
- primary `[T] OPEN CHANNEL — TALK` — `border:1px solid #cf7a33; color:#f2b563; text-align:center;
  padding:7px; border-radius:6px; cursor:pointer;`
- a two-up row (`display:flex; gap:6px;`) of `[M] MOVE` and `[B] BIO`, each `flex:1; border:1px
  solid #3a332a; text-align:center; padding:7px; border-radius:6px; color:#b3aa9c;`.

The `[M]`/`[B]` accelerator honesty (which bracket is real) defers to
`perilune-game-ui.interaction-spec.md` IX-52/IX-53; the labels render as this spec's
interaction rung dictates (IX-O-40).

### Bottom-left LENS

**VS-O-65** — Lens island: `position:absolute; left:26px; bottom:24px; padding:10px 12px;
border-radius:12px;`, header `LENS` (`font-size:9px; letter-spacing:.16em; color:#57503f;
margin-bottom:7px;`), then a `display:flex; gap:6px;` button row.

**VS-O-66** — Lens button: `min-width:42px; text-align:center; padding:7px 6px; border-radius:6px;
font-size:10.5px; cursor:pointer;`.
- active (`name === frame.lens`): `background:#3a2a12; color:#f2b563; border:1px solid #cf7a33;`
- inactive: `background:rgba(26,22,17,.6); color:#8c8377; border:1px solid #3a332a;`

Labels (mock's six): `NONE · PRES · O₂ · CO₂ · TEMP · PWR`. **Deviation → interaction spec:** the
sim carries SEVEN lenses (adds `H₂O`); the shipping row follows the console's seven-lens set and
digit-hotkey labeling (IX-O-29 / console IX-91). The mock's six-slot styling is the visual
grammar; the count comes from reality.

### Bottom-center command bar

**VS-O-67** — Command-bar group: `position:absolute; left:50%; bottom:24px;
transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:8px;` —
a PLACE palette island stacked above a menu-tabs island.

**VS-O-68** — PLACE palette island (`.hud`, `display:{flex when BUILD tab active, else none};
gap:7px; align-items:center; padding:8px 12px; border-radius:11px;`): a `PLACE ▸` label
(`font-size:9px; letter-spacing:.16em; color:#57503f; flex:none;`) then tool buttons
`padding:7px 12px; border-radius:6px; font-size:10.5px; cursor:pointer;`.
- active (non-demolish): `background:#3a2a12; color:#f2b563; border:1px solid #cf7a33;`
- active demolish/cancel: `background:#3a1a10; color:#e07a5f; border:1px solid #a53a25;`
- inactive: `background:transparent; color:#8c8377; border:1px solid #2b241c;`

The mock's eight tools (`WALL DOOR BUNK CONSOLE SCRUBBER "HYDRO TRAY" LIGHT "⌫ DEMOLISH"`) are the
visual grammar; the SHIPPING palette follows the console's honest set — `WALL · DOOR · ⌫ CANCEL`
only, no P3-fiction tools rendered dead (defer to `perilune-game-ui.interaction-spec.md` IX-21;
and CANCEL is not DEMOLISH — IX-31). The palette row is append-ready for P3.

**VS-O-69** — Menu-tabs island (`.hud; display:flex; gap:6px; padding:9px 11px;
border-radius:12px;`): tab buttons `padding:9px 15px; border-radius:8px; font-size:11px;
letter-spacing:.08em; cursor:pointer;`.
- active: `background:#3a2a12; color:#f2b563; border:1px solid #cf7a33;`
- inactive: `background:rgba(26,22,17,.5); color:#8c8377; border:1px solid #3a332a;`

The mock's nine tabs (`BUILD REFIT ORDERS CREW RELATIONS SHIP MOSS NAV CHRONICLE`) are the visual
grammar; the SHIPPING tab set follows the console's honest set — `BUILD · CREW · RELATIONS ·
MOSS · CHRONICLE` — with the four wire-less tabs (REFIT/ORDERS/SHIP/NAV) omitted, not rendered as
dead placards (defer to `perilune-game-ui.interaction-spec.md` IX-70). The tab row is
append-ready.

### Bottom-right SENSOR LOG

**VS-O-70** — Sensor-log island: `position:absolute; right:26px; bottom:24px; width:340px;
padding:12px 14px; border-radius:12px; font-size:10px; line-height:1.7; color:#8c8377;`, header
`SENSOR LOG — LAST {n}` (`font-size:9px; letter-spacing:.16em; color:#57503f; margin-bottom:6px;`).

**VS-O-71** — Log lines from the `log` wire (newest last). Each line's leading `D<day.dd>` token
is tinted: newest `#e8934a`, older `#8c8377`; remainder verbatim in `#8c8377`. The count shown
follows the console sensor-log rule (IX-90); the mock's "LAST 3" is the reference for a compact
island. Timestamp splitting is the console's pure `logLineParts`.

**VS-O-72** — Build-ghost markers (over the room floors, from the `designs` wire): each a div
`width:26px; height:26px; box-sizing:border-box; border:1.5px dashed #f2b563;
background:rgba(232,147,74,.22); color:#f2b563; font-size:8px; display:flex; align-items:center;
justify-content:center; z-index:4;` showing the kind glyph. Persistence, the starved/supplied/
ready supply states, and the `n/m` ledger defer to `perilune-game-ui.visual-spec.md` VS-67 and
IX-38/IX-39 — the Overview reuses the console's wire-backed ghost model (never a client-invented
optimistic ghost). Placement grid: the mock's free 26px grid is a mock artifact; live placement
snaps to sim tiles (interaction spec IX-O-19).

---

## 8. Motion & degraded states (VS-O-73 … VS-O-78)

**VS-O-73** — Keyframe budget (the only loops in the view): `plnTw` (star twinkle, VS-O-10),
`plnEflick` (engine cores, VS-O-18), `plnBob` (pawn bob, VS-O-44), `plnBlink` (caution chip,
VS-O-55). No layout animation, no view-swap transition (entering/leaving the Overview is instant
— it is a view, not an app).

**VS-O-74** — `@media (prefers-reduced-motion: reduce)`: disable `plnTw`, `plnEflick`, `plnBob`,
`plnBlink` (all four); stars, cores, pawns, and the caution chip hold their steady frame — color
alone carries the caution state. `* { transition-duration:0s !important; }` for this view too.

**VS-O-75** — Placement pulse (transient input ack): on a build-placement click, a single
fading tile-outline pulse (≤160 ms, amber for wall/door, ember-red for cancel) over the clicked
tile, drawn by the view layer using the same projection as the ghosts. It acknowledges the INPUT,
never survives into a second frame, and defers to `perilune-game-ui.interaction-spec.md` IX-36.

**VS-O-76** — No-crew-selected readout: the island shows `NO CREW SELECTED`
(`color:#8c8377`) plus one guide line `Click a pawn or a CREW WATCH row.`, and the three action
buttons render disabled (reduced opacity, no pointer events) — defer to console IX-55.

**VS-O-77** — Empty roster: the CREW WATCH dock header reads `CREW WATCH — 0 SOULS` with one
faint line `No souls aboard.`; no skeleton, no placeholder rows (console IX-97).

**VS-O-78** — **Contrast:** the `#57503f` decorative tier is confined to self-evident section
headers and the atmos-box sub-labels (CREW WATCH, SELECTED, LENS, PLACE ▸, CURRENT ROOM,
SENSOR LOG). Every value the player must READ to act — the deck context line (VS-O-54), log
content, readout task/atmos values — is at `#8c8377` or brighter. The full contrast ledger and
its rationale defer to `perilune-game-ui.visual-spec.md` §7; re-run it here if any hex changes.
