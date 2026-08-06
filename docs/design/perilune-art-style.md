# PERILUNE — the art style, as adopted

**Read this before drawing anything.** It is the map: the one place the whole visual language is
stated together. The modules it cites are the territory and they stay authoritative — every
derivation lives in a module header, and this file points at it rather than repeating it.

⚠️ **Every count and every value below was re-derived from the tree on 2026-08-05, and §4's twin
counts again on 2026-08-06 (`lane/warm-purge`). They will go stale** (TRAPS 8th shape — a number in a doc is not evidence). The deriving TESTS are named beside
each claim; re-measure there, never quote this file.

⛔ **AND THE PROMISE COVERS §1–§3, NOT JUST §4** — said out loud because it was broken there first.
Review found three claims in the palette and pawn sections that had gone stale while the treatment
section was being kept current: a palette-closure claim that named suites which do not do what it
said, a `linejoin` claim that is true of the halo pass only, and a pawn weight range off at the
bottom end. Every line-number citation and every hex, ratio and weight in §1–§3 was re-derived from
the shipped modules on 2026-08-05 alongside §4's.

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

Closure is **tested, not intended** — and the suites do not all scan the same thing, which matters
because the treatment sits between the two:

| suite | scans |
|---|---|
| `fittings.test.js`, `machines.test.js`, `paper-fixtures.test.js` | the **RAW** fragment (`sketch: false`) |
| `paper-resources.test.js` | **BOTH** — raw and treated, on/off |
| `sketch-adoption.test.js` | the **TREATED** fragment, all four standing catalogues + the 80 twins |
| `paper-materials.test.js` | the twelve skins, raw and treated |

Between them every catalogue is scanned on the side that ships and fails on a fifth hex. The reason
the treated side is worth scanning at all: a post-processor implying pressure with a **grey** instead
of with weight and a paper knockout would be invisible to a raw-only scan.

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
2. **Round caps on every ink element; round JOINS on the halo.** Precisely, and the distinction is
   `oblique.ghost()`'s own (`oblique.js:583` vs the ink pass below it): the knockout group carries
   `stroke-linejoin="round"` and `stroke-linecap="round"`, while the ink pass defaults `cap: 'round'`
   and leaves `join` to the individual path. `pawn-svg.js` sets no join, so **no pawn ink element
   carries a `stroke-linejoin` at all** — the roundness a figure reads with is the halo's.
3. **Freehand curves** — the load-bearing paths are `C`/`Q`; no ruled line carries a silhouette.
4. **Implied pressure** — weights run **0.9** (the slate's inner rules, `pawn-svg.js:342`) to **1.5**
   (folded arms), across **nine** distinct authored values (0.9, 1, 1.1, 1.2, 1.25, 1.3, 1.35, 1.4,
   1.5): the range is spent on what matters, not on distance. `figurePaths` then scales all nine by
   one per-figure `w` (`:432`), so the ramp's SHAPE is what is authored and its size is not.
5. **No ruler**, and **a ground line**: `M3.4 23.5 L12.6 23.5` at `stroke-width 0.45`, opacity 0.35
   (`pawn-svg.js:496`) — a figure on paper does not cast a shadow, it stands on a line.

## 4 · The sketch treatment, as adopted

> **The owner's ruling, 2026-08-05: *"i like the strong one — just ensure you are getting the
> dimension and perspectives right."*** and, the same day, *"we need to update ALL with the sketch
> style we defined."*

`client/src/render/sketch.js` is a pure **post-processor over an emitted SVG fragment**, applied at
`helpers.item()` — the one door every builder already goes through (`helpers.js`, the `item()`
seam). It runs on the **five paper catalogues**: 34 fittings, 13 machines, 14 paper-fixtures, 9
paper-resources, 12 materials — **that is the whole registry, 82 rows** — plus **all 80 twins**.

⛔ **THERE IS NO UNTREATED POPULATION LEFT, AND THE EXCLUSION THIS SECTION USED TO CARRY IS CLOSED.**
It read *"The pre-redesign WARM set is not treated"* and, beside it, the filed defect: *"the 21
fittings still wearing a warm mock twin"* — a twin is treated only if its own painting is paper, so a
`#33281b` mock transcription could not be. **47 → 68 → 80**, in two steps on 2026-08-06:
`lane/warm-purge` re-authored those twenty-one twins on paper (P2b, **CLOSED**) and then the twelve
material twins, and in the same commit RETIRED all thirty-eight warm registry rows on the owner's
ruling, deleting `objects.js` / `fixtures.js` / `resources.js` / `cryo.js`. Re-measure at
`sketch-adoption.test.js`, which pins 80 = 33 fittings + 13 machines + 14 paper-fixtures +
8 paper-resources + 12 materials, and which now asserts that **no registry row ships raw** — the
statement that replaced the old "the warm set is not treated" control when that control's population
went empty (an unsatisfiable floor is a guard kept green forever).

⚠️ **"Five catalogues" is the treated POPULATION; the guarantees below are measured over FOUR of
them.** `sketch-adoption.test.js`'s `CATALOGUES` array is the four **standing** catalogues (+ twins),
because its instrument compares a member's treated position against the raw member it replaced. A
material skin is a tiling field, so what has to survive on it is an exact centimetre **pitch** — a
different measurement, and it lives in `paper-materials.test.js` (which carries its own amplitude and
outside-the-box legs). Do not read "all five" onto a leg below.

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
| `interiorOvershoot` | 0.45 | overshoot is scaled DOWN on interior detail — a pencil runs past a corner it is establishing, not past a louvre |
| `hatch` / `ground` | true / true | the kit hatch loosens; the pawns' floor rule is appended |

**⛔ THE GROUND EXCEPTION — an orchestrator ruling, 2026-08-05, overridable by the owner from the
sheet.** `paper-materials.js` passes `ground: false` at the seam. The ground rule is the pawns' sixth
tell: the faint line a thing **standing** on a deck is drawn resting on. A material is not a standing
thing — it *is* the deck — so the rule has nothing to meet. Measured before the knob existed: all
twelve skins drew their rule **1.5–3.7 units outside their own tile edge**, and one 12 × 8 room floor
drew **ninety-six** of them through `roomzoom-view.materialLayerSvg` — a grid of ink ticks across the
deck at the tiling pitch. Pinned both ways in `sketch-adoption.test.js` (zero on every skin, exactly
one on every standing piece, with the knob forced on and off as the inclusion control) and at the
room-floor surface itself. It is the **only** knob the materials turn off.

The owner vetoes it from a **controlled A/B** — `client/tools/sketch-ground-ruling-shot.mjs`: same
scene, same camera, same pawn at the same tile, unselected in both, with the knob as the only
variable, and the AFTER column asserted byte-identical to `materialLayerSvg`. ⚠️ **It does not read
equally on all six floor skins, and the sheet shows all six for that reason**: on `metal-grating` the
rule lands on the tile edge the skin already draws, so 96 rules and 0 rules photograph the same. It
reads clearly on `cream-tile-floor`, `wood-plank-floor` and `steel-tan-floor`.

**⛔ THE HALO EXCEPTION, MEASURED.** `haloScope: 'all'` is the expensive knob and the experiment
measured why: a fitting's paper-filled faces are ALREADY a knockout, so a second one can only reach
the ink of elements drawn BEFORE it — the table's four legs come away with white bites where the top
face's halo crosses them, and the locker's louvres break into dashes. That is the cost of `strong`
and the owner took it after seeing both. The one thing it may not do is DELETE a member, which
`sketch-adoption.test.js` pins in both forms (a later opaque face; a knockout with no ink over it).

**⛔ THE PATTERN EXCEPTION.** The hatch knob loosens the **kit's** `#fh` only — recognised by shape
(square cell, ground rect, one `M0 0 L0 <period>` rule; `isKitHatch`, module-private inside
`sketch.js` — the guards drive the BEHAVIOUR either side of it, in `paper-materials.test.js`, not the
predicate). Four material skins
carry a `<pattern>` that is a structural FIELD (the matting's weave, the grating's bar, the carpet's
pile, the blast wall's hazard block) and are passed through untouched.

**The guarantee — the owner's caveat, as a structure.** The treatment's input is a string and its
output is a string: the projection, the `SPECS` centimetres, the frames and every placement
transform have already run and it cannot reach them. What it CAN move is an emitted point, bounded
by `amplitudeBound(level)` = **6.78 local units at `strong`** (6.1% of the 112 drawing box), derived
term by term from the knobs. Pinned in `client/test/sketch-adoption.test.js`, both directions, per
element, every piece of the four standing catalogues and all 80 twins.

⭐ **And TWO EXACT legs, because a bound cannot see an error smaller than itself** (7th trap shape) —
two, because the module draws two kinds of thing and one sentence does not cover both:

* **straight runs → collinearity.** A treated run's chord lies on the original segment's own line —
  worst measured 0.0069 units. A 2% scale, a rotation or a translation moves it off.
* **round members → exact per-axis radii.** A chord means nothing for a closed curve, so the radius
  nudge is *recovered* from each axis separately (`k = (x − cx)/(rx·cos t)`, and the same in y) and
  must be within `lump` on both, must **agree** between them, and the twelve samples' mean must be
  the centre.

⛔ **The second leg exists because its absence was measured, not anticipated** (review, 2026-08-05).
The collinearity leg excluded ellipses and circles — **234 of 1548** geometry rows pristine, **464
of 2719** counting the twins (measured 2026-08-05; ⚠️ **the twin half is stale twice over since
08-06** — P2b re-authored 21 twins and the materials added 12 more — while the pristine 234/1548 is
not, and the finding it supports does not turn on either figure) — and with only
the bound under them, scaling every ellipse by ×1.02 … ×1.06 ran the whole sketch + catalogue suite
**148/148 green**, and so did an **ry-only ×1.05**: a heading given to a thing this catalogue draws
level. The round-things ratio guards cannot help — a `ry/rx` ratio is scale-invariant, and under the
treatment there is no `rx` attribute left for them to read.

**Determinism**: every wobble comes from `hash32(seed | element | segment | channel)`. No RNG, no
clock, no locale API, no memo table. Seeded by the **piece id**, so two of a kind in one room are the
same drawing — which is also what makes a treated fragment cacheable.

**What it deliberately does NOT change**: the declared centimetres (a pitch measured on a treated
material skin is exact, not tolerant — `paper-materials.test.js`), the palette (it buys no colour),
and the tile-size expectation — at 22 px only WEIGHT survives, so a piece must read by silhouette and
mass, never by detail.

**Cost, re-measured on the merged tree, 2026-08-05** (`client/tools/sketch-repaint-bench.mjs`, the
wreck cryo bay, 7 fittings + 2 crew; five runs × 60 reps):

| | raw | treated |
|---|---|---|
| elements | 296 | 1102 (×3.72, byte-stable across runs) |
| build ms | 0.382 – 0.405 | 3.19 – 3.32 (×8.0 – ×8.5, **+2.80 – 2.93 ms**) |

⚠️ **Quote the range, not a point.** An earlier draft of this section said "0.96 → 4.73 ms" from a
single run on a loaded box; review measured 3.6 – 5.4 ms on theirs. The treated figure moves with
machine load by more than the whole raw figure, so a single number here is not evidence — the stable
statement is the **element ratio** (×3.72, identical on every run) and "comfortably inside the 16 ms
interactive budget", which holds across every measurement anyone has taken.

### ⛔⛔ The Level-1 plate is the ONE surface that opts OUT — measured, 2026-08-05 (`lane/ship-drawn`)

The table above is the **Room Zoom**: 7 fittings at room scale, ×3.72 elements, +2.9 ms, comfortably
inside 16 ms. The **Level-1 side elevation** is a different order of magnitude — it draws **86
fittings across two bands** (`--ship wreck`, off the live wire: 62 on deck 0, 24 on deck 1) and
rebuilds the whole plate on every wire frame at 10 Hz. The same plate, A/B, with one flag flipped:

| | raw | treated | ratio |
|---|---|---|---|
| shape elements | 2 953 | 13 787 | ×4.67 |
| DOM nodes (live Chrome) | 3 776 | 16 278 | ×4.31 |
| bytes | 499 KB | 2.91 MB | ×5.83 |
| build ms (node) | 6.96 | 45.37 | ×6.52 |
| parse + layout ms (Chrome, median of 12) | 12.1 | 56.7 | ×4.69 |
| **total per repaint** | **~19 ms** | **~102 ms** | **×5.4** |

**Treated, the plate does not fit inside its own 10 Hz wire frame** (102 ms against 100 ms; 6.4× the
16 ms interactive line). Raw it lands at ~19 ms with five-fold headroom. And what the ×5.4 buys is
nothing a player can see: **this section's own rule — *at 22 px only WEIGHT survives* — and the
plate's box is `max(10, tileSize × 2.2)` = 20.82 px, under the line.** So
`overview-scene.js`'s `fittingLayer` passes **`sketch: false`** to `buildTileItem`.

⛔ **This does not make the plate un-sketchy, and the distinction is the ruling.** The hull, the deck
floor planes and the partition walls are sketched by the plate's OWN `sketch()` calls (`strong`,
seeded per deck — `overview-scene.js:205` and `:962`), not by the catalogue, and they are untouched:
with the miniatures raw the plate still carries 13 doubled silhouette passes. The treatment is kept
exactly where it reads and dropped exactly where it is sub-pixel.

⚠️ **The ground-rule question does not arise here, by construction.** `item()` returns before
`sketch()` is called when `opts.sketch === false`, so `cfg.ground` is never read at plate scale and
the materials' `ground: false` exception has no bearing either way. A later lane that re-enables the
treatment on this surface **inherits that decision unmade** — a plate miniature IS a standing thing,
so the pawns' sixth tell applies in principle, but at 20.82 px a rule 2 % of the box is sub-pixel ink
laid over the band floor the plate already draws beneath it. Both halves are pinned in
`overview-scene.test.js` ("plate MINIATURES carry no catalogue treatment — and the ARCHITECTURE still
does" + the unreachable-knob leg), each mutation-verified.

**The memo is NOT shipped, and that is a decision.** The bench measures it: the 7 fittings alone cost
2.57 – 2.61 ms treated and 0.057 – 0.061 ms from a cache keyed on `(itemId, side, facing)` — about
**43× cheaper**. It is not built because 3.2 – 5.4 ms is not a problem against 16 ms, and a cache is
a second source of truth about what a piece looks like. ⚠️ If it is ever built, **`facing` is part of
the key** (main threaded rotation through `roomBox` and the builder on 2026-08-05): a two-term key
serves a turned bench its unturned drawing, at the unturned size.

## 5 · The rulings trail

* The **charter** — `docs/design/perilune-visual-redesign.charter.md`: §1 the dialect, §2 the adopted
  rulings, §4 ruling **E8**'s six defect classes (the ones every catalogue's tests are named after),
  §5 the hard constraints.
* **2026-08-05, `strong`** — the owner's words at the top of §4. The experiment's own recommendation
  was `hand`; it is kept in `sketch.js` as a superseded finding and as the control the halo
  comparison is driven against. ⚠️ **`hand` is `medium` minus the knockout PLUS one more term**, and
  the shorthand "`medium` without the knockout" was wrong: `interior` is also lifted, 0.85 → 0.88
  (with nothing eating the interior detail any more it is drawn a shade heavier). So the pair is a
  knockout comparison **with a named confound**, not a clean one — pinned as such, with both values
  asserted, in `client/test/sketch.test.js`.
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
