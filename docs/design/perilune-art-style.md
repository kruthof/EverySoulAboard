# PERILUNE — the art style, as adopted

**Read this before drawing anything.** It is the map: the one place the whole visual language is
stated together. The modules it cites are the territory and they stay authoritative — every
derivation lives in a module header, and this file points at it rather than repeating it.

⚠️ **Every count and every value below was re-derived from the tree on 2026-08-05 and will go
stale** (TRAPS 8th shape — a number in a doc is not evidence). The deriving TESTS are named beside
each claim; re-measure there, never quote this file.

---

## 1 · The palette — four values, and one of them is not decoration

| value | hex | means | source |
|---|---|---|---|
| **ink** | `#14120F` | every stroke, every dark fill | `client/src/items/helpers.js:41` |
| **paper** | `#EBE4D1` | a plate, a sheet, every front and top face | `helpers.js:43` |
| **oxblood** (ATTEND) | `#7B2C22` | **attention, faults, queued orders, emotional beats. There is no second accent and it is never decoration.** | `helpers.js:45` |
| flat side tone | `#E1D9C5` | a turned-away face, one step down from paper | `client/src/render/oblique.js:58` |

The two copies of those strings (`items/helpers.js` and `theme/paper-tokens.js`) are pinned to each
other by `client/test/oblique.test.js` — a duplicated literal nothing compares is how two modules
come to disagree about black.

**The dash grammar carries the state, so every state is legible in ink alone**
(`client/src/theme/paper-tokens.js:82-89`, `DIALECT`):

| state | stroke | dash |
|---|---|---|
| queued order | oxblood | `8 5` |
| attention / fault | oxblood | solid |
| unbuilt / planned (the build ghost) | ink | `6 5` |
| offline | `#8A8272` | solid |
| a cut edge of the room cutaway | ink | `7 5` |

Closure is **tested, not intended**: `paper-fixtures.test.js`, `machines.test.js`,
`paper-resources.test.js` and `sketch-adoption.test.js` each scan their whole catalogue — raw AND
treated — and fail on a fifth hex.

## 2 · The projection — cabinet oblique, in centimetres

* `DEPTH_RATIO = { x: 0.4, y: −0.6 }` — one home for both ratios, `oblique.js:50`. A centimetre of
  depth moves a point 0.4 cm right and 0.6 cm **up** (SVG y is negative up). Never re-type them.
* **1 tile = 1 m** (`room-model.js:487`), **room height 2.4 m** (`:489`), and the Room Zoom draws at
  **0.95 px/cm** (`ROOM_SCALE`, `:491`; `PX_PER_CM` is `oblique.js:47` — plate 1.0 / room 0.95 /
  catalogue 0.85).
* **Anything round is drawn LEVEL** — `ry = 0.6·rx`, no heading anywhere — so a round piece can be
  set down any way about and needs no facing on the wire. `fittings.js`'s header argues it; the
  guards are the "round things draw level" tests in all three standing catalogues.
* **A piece declares honest centimetres and DERIVES its drawing scale.** `SPECS[id]` is `w × d × h`
  cm (`fittings.js:138`); the piece occupies `w + 0.4·d` across and `h + 0.6·d` up, and the scale is
  whatever makes the larger fill `BOX = 112` inside `TILE = 128` (`fittings.js:101`, `helpers.js:27`).
  Geometry outside `0..w / 0..d / 0..h` is drawn but not counted, so it clips — that is what the box
  guards are for.
* **Wall-hung pieces carry a hatched WALL STUB with dashed cut edges** and a real `z0` mounting
  height; thirteen of the fourteen paper fixtures do (`paper-fixtures.test.js`, E8-6/E8-6b).
* The 45° hatch is the kit's, once: `HATCH = { period 7, angle 45, width 0.7, opacity 0.28 }`
  (`oblique.js:62`).

## 3 · The pawns' hand — the thing the furniture was matched to

`client/src/render/pawn-svg.js`, measured off the shipped module rather than remembered:

1. **Two passes.** `oblique.ghost()` writes every path in paper at `ink + widen` first, then the ink
   pass — a figure carves its own silhouette out of whatever it stands on. `GHOST.widen = 3.0`
   (`oblique.js:66`).
2. **Round everything** — `linecap: round`, `linejoin: round`, on every element.
3. **Freehand curves** — the load-bearing paths are `C`/`Q`; no ruled line carries a silhouette.
4. **Implied pressure** — weights run 1.0 (a mouth) to 1.5 (folded arms): the range is spent on what
   matters, not on distance.
5. **No ruler**, and **a ground line**: `M3.4 23.5 L12.6 23.5` at `stroke-width 0.45`, opacity 0.35
   (`pawn-svg.js:496`) — a figure on paper does not cast a shadow, it stands on a line.

## 4 · The sketch treatment, as adopted

> **The owner's ruling, 2026-08-05: *"i like the strong one — just ensure you are getting the
> dimension and perspectives right."*** and, the same day, *"we need to update ALL with the sketch
> style we defined."*

`client/src/render/sketch.js` is a pure **post-processor over an emitted SVG fragment**, applied at
`helpers.item()` — the one door every builder already goes through (`helpers.js`, the `item()`
seam). It runs on the **five paper catalogues**: 34 fittings, 13 machines, 14 paper-fixtures, 9
paper-resources, 12 materials, plus the **47 twins** whose own painting is paper. The pre-redesign
WARM set is not treated; nor are the 21 fittings still wearing a warm mock twin (filed).

**The preset is `LEVELS.strong`** (`sketch.js`), knob by knob:

| knob | value | what it does |
|---|---|---|
| `overshoot` | 3.6 | a run starts before its first point and ends past its last — the architect's tell |
| `wave` / `waveMax` | 0.024 / 5.5 | the bow; short runs bow, long runs waver (an S) |
| `lump` | 0.075 | a round thing's radius wobbles; arcs' radii too |
| `ramp` | 1.9 | gain on the existing weight ramp about its midpoint (1.4) |
| `silBoost` / `interior` | 1.5 / 0.74 | silhouette and ground-contact runs press; interior detail lifts |
| `haloWiden` / `haloScope` | 1.9 / `all` | the paper knockout, **under every element** |
| `doubles` | true | a second, lighter pass over each silhouette run |
| `hatch` / `ground` | true / true | the kit hatch loosens; the pawns' floor rule is appended |

**⛔ THE HALO EXCEPTION, MEASURED.** `haloScope: 'all'` is the expensive knob and the experiment
measured why: a fitting's paper-filled faces are ALREADY a knockout, so a second one can only reach
the ink of elements drawn BEFORE it — the table's four legs come away with white bites where the top
face's halo crosses them, and the locker's louvres break into dashes. That is the cost of `strong`
and the owner took it after seeing both. The one thing it may not do is DELETE a member, which
`sketch-adoption.test.js` pins in both forms (a later opaque face; a knockout with no ink over it).

**⛔ THE PATTERN EXCEPTION.** The hatch knob loosens the **kit's** `#fh` only — recognised by shape
(square cell, ground rect, one `M0 0 L0 <period>` rule; `sketch.isKitHatch`). Four material skins
carry a `<pattern>` that is a structural FIELD (the matting's weave, the grating's bar, the carpet's
pile, the blast wall's hazard block) and are passed through untouched.

**The guarantee — the owner's caveat, as a structure.** The treatment's input is a string and its
output is a string: the projection, the `SPECS` centimetres, the frames and every placement
transform have already run and it cannot reach them. What it CAN move is an emitted point, bounded
by `amplitudeBound(level)` = **6.78 local units at `strong`** (6.1% of the 112 drawing box), derived
term by term from the knobs. Pinned in `client/test/sketch-adoption.test.js`, both directions, per
element, every piece of all five catalogues and all 47 twins.

⭐ **And an EXACT leg, because a bound cannot see an error smaller than itself** (7th trap shape): a
treated run's chord lies on the original segment's own line — worst measured 0.0069 units. A 2%
scale, a rotation or a translation moves it off; the bound alone would admit all three.

**Determinism**: every wobble comes from `hash32(seed | element | segment | channel)`. No RNG, no
clock, no locale API, no memo table. Seeded by the **piece id**, so two of a kind in one room are the
same drawing — which is also what makes a treated fragment cacheable.

**What it deliberately does NOT change**: the declared centimetres (a pitch measured on a treated
material skin is exact, not tolerant — `paper-materials.test.js`), the palette (it buys no colour),
and the tile-size expectation — at 22 px only WEIGHT survives, so a piece must read by silhouette and
mass, never by detail.

**Cost, measured** (`client/tools/sketch-repaint-bench.mjs`, the wreck cryo bay, 7 fittings): 296 →
1102 elements (×3.7), 0.96 → 4.73 ms to build the plate. Inside the 16 ms interactive budget. A
cache keyed on `(itemId, side)` would make the furniture 39× cheaper and is NOT built.

## 5 · The rulings trail

* The **charter** — `docs/design/perilune-visual-redesign.charter.md`: §1 the dialect, §2 the adopted
  rulings, §4 ruling **E8**'s six defect classes (the ones every catalogue's tests are named after),
  §5 the hard constraints.
* **2026-08-05, `strong`** — the owner's words at the top of §4. The experiment's own recommendation
  was `hand` (`medium` without the knockout); it is kept in `sketch.js` as a superseded finding and
  as the control the halo comparison is driven against.
* **2026-08-05, materials** — "update ALL", which closed the filed question about wall/floor skins.
* The receipts live on `lane/sketch-experiment` (`9fda9e9`): the knob sheet, the level sheet and the
  room plates that the ruling was made from.

## 6 · Adding a new piece — the checklist

1. **`SPECS`**: honest centimetres, `w × d × h` (+ `z0` if it hangs). Bigger than the object only
   where the picture is, and say why in the comment.
2. **Draw through the kit**: `roomFrame(...).project(x, y, z)` for placement, `box`/`hoop`/`disc` for
   the vocabulary, the five-rung weight ramp by mass, round things LEVEL. Never a second projection.
3. **A twin** in `wrecked.js`, painted by re-running your own pristine painter and ADDING damage —
   never a redraw and never another row's painter.
4. **A registry row** in `index.js`, plus your catalogue's tests: the id lists, the box guard, the
   palette closure, the E8 class your piece could fall into.
5. **The treatment applies automatically** at the `item()` seam. You do not call `sketch()`. If your
   builder emits geometry the parser refuses, it still gets the pen — but check the ramp: a raw rung
   surviving into treated output means an element never reached the treatment.
6. **Look at it.** Run your catalogue's sheet tool and the render probe. A green suite is a necessary
   condition and has never been a sufficient one — invisible feedback is broken feedback (binding,
   2026-07-26).
