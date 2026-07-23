# PERILUNE — SHIP-STAGE ART DIRECTION v1 ("the derelict")

> **What this is.** The binding art bible for everything drawn on the ship stage: floors,
> walls, doors, debris, devices, props, furniture, crew. It is specific enough to *produce*
> on-model work from and specific enough to *reject* work with. Every number here was
> measured against the shipped art and against the Prison Architect reference; where a
> number is derived rather than measured, the derivation is written out.
>
> **What it is not.** It does not cover portraits (`art/spritegen/spec_portraits_slice_v2.json`
> owns those) or the console UI (`perilune-game-ui.visual-spec.md` owns that — and stays
> authoritative for every pixel outside the canvas).
>
> **Its encoding.** `art/spritegen/spec_derelict256.json` is this document expressed as a
> spritegen spec. If the two disagree, this document wins and the spec is a bug.
>
> **Status:** design only. Nothing has been generated. Per Garvin's 2026-07-22 decision the
> order of work is **(a) revise the design → (b) fix it → (c) only then regenerate**; this is
> (a). See §14 for what (b) and (c) cost and in what order they must happen.
>
> **Revision 2 (2026-07-22), after an independent re-measurement.** Every measured claim in
> §1 was re-derived from the files and the reference; five were wrong and are corrected in
> place, each with the superseded figure named so the record is honest (§1.2, §1.3, §1.6.1–4).
> §1.7 now publishes the exact method behind every number. The gate recipe of AD-21 was
> unusable as written (it failed 45 of 48 sprites including on-model ones, over a background
> colour that exists nowhere in the codebase) and is replaced; the G-COL ceiling did not
> bracket the reference and is re-derived. Three contradictions are ruled definitively: the
> **outline** is uniform (AD-6), the **wall** is baked and not world-sampled (AD-32), and
> **AD-23** no longer rejects this document's own mandated art. F1 PLATE is deliberately
> quieted (AD-29b). Seven concrete pieces of renderer/pipeline work this direction depends on
> — none of which exists today — are scoped in §14.1.

---

## 1. The measured baseline — and three corrections to the received diagnosis

Everything in this section was re-measured for this document from the actual files
(`art/spritegen/work/cyberpunk80s-128-v2/processed/*.png`, 48 sprites) and from
the reference screenshot. Prior findings that survived measurement are marked ✔; the three
that did **not** are marked ✘ and superseded.

### 1.1 The reference's real tile pitch

The Prison Architect reference is 2054×1522. Its tile pitch, recovered by autocorrelating the
column-gradient profile over the open yard and over the shower-tile grout, is **40 px**
(yard gradient period 80 = 2 tiles; shower grout period 13.3 = 3 sub-tiles per tile). A
prisoner's body is 20 px wide — exactly half a tile — which corroborates it. Every "PA"
number below is quoted at that 40 px pitch, and every one of our numbers is quoted after
downscaling our cell to the same 40 px so the comparison is like-for-like.

### 1.2 ✘ CORRECTION 1 — "PA sprites carry ≤64 colours; ours carry ~2,285"

**Raw unique-RGB count is not a valid discriminator and the reference does not pass it
either.** A 48 px window centred on a PA guard carries **1,870–2,109 unique RGB values**
(seven guards; see §1.7 for where they are); a 128 px window on PA's yard floor carries
**8,744**. Our three pawn idles carry **2,081 / 2,001 / 2,768** opaque unique RGBs (the
quoted ~2,285 is in family but is not any of them) and our debris carries 9,724 of 16,384
pixels ✔ (that one is exact). Both images are continuous-tone and resampled; counting exact
RGB triples counts the resampler, not the art.

*(Corrected 2026-07-22 after an independent re-measurement. The first draft of this section
quoted 1,775–1,824 for PA and 1,744 / 1,662 / 2,378 for us; both were wrong. **The
conclusion is unchanged and was re-verified**: the two distributions overlap, so raw
unique-RGB discriminates nothing.)

The discriminating measurement is the **quantised** count — opaque pixels bucketed to
`RGB//16`, a 4096-cell grid in which one bucket is about one just-noticeable step at these
values — taken at a common 40 px pitch:

| | PA @40 px | ours @40 px | |
|---|---|---|---|
| guards / pawns | 22 · 49 · 102 · 111 | 53 – 125 | **overlapping — no real gap** |
| floors | 27 · 31 · 40 | **2** | ours is a dead plate |
| props / machines | — | 50 – 180 | the top half is over |

Which already previews §1.3: on colour density our crew are inside the reference's own range,
our floors are far below it, and our machines run past it. "Too many colours" is not a
property of our art; it is a property of *some* of our art, and the ceiling in §7 is therefore
written per authoring kind, not per sprite.

### 1.3 ✘ CORRECTION 2 — "our art fails at flat fills; the crew are the worst case"

The received diagnosis said the crew were the worst case. They are the **best of our set**.
The first draft of this section over-corrected and said they were **"at parity" with the
reference. That claim was wrong and is withdrawn** — it rested on a comparison that was not
like-for-like, and it is restated below from a protocol that is.

**Why the first comparison was invalid.** It downscaled our whole 128 px cell to 40×40 and
compared the result to a 40×40 window on a PA guard. But our cell is mostly empty: measured
on the 38×38 interior, **62–68 % of our pawn window has a zero Laplacian** (flat composited
margin), against **2.8–4.6 %** for a PA guard window, which is 100 % covered by textured
dirt plus a cast shadow. Half our sample was scoring nothing. It also quoted the *bottom* of
PA's distribution: re-centred on each guard's own uniform centroid, seven guards at the 40 px
pitch score **16.7 – 20.1, median 18.8** — every one of them above the 8.8 / 9.8 / 13.7 the
first draft quoted.

**The like-for-like protocol** (fully specified in §1.7 so it can be re-run): put our pawn
and a PA guard in the *same* 40×40 window, on the *same* ground — five 40×40 crops of PA's
own yard dirt — with our figure scaled so its opaque bbox is **34 px tall**, the mean height
of PA's own guard figures (31 – 35 px). Then the only thing that differs is the figure.

| | 40×40 window, mean \|Laplacian\| | of which the figure contributes |
|---|---|---|
| bare PA yard dirt (5 patches, the control) | 8.3 – 16.2 (mean **11.7**) | — |
| **PA guard** on that dirt (7 guards) | 16.7 – 20.1 (median **18.8**) | **+5.0 – +8.4** |
| **our pawn family** on that dirt (9 units) | 22.8 – 29.3 (median **24.8**) | **+11.1 – +17.6** |

**Our crew figures carry about twice the detail energy of a PA guard at the same size on the
same ground.** They are the calmest thing we ship and they are still ~2× over. The corrected
picture across the set, under the gate recipe of AD-21 (§1.7 method S):

| band | units | verdict |
|---|---|---|
| **12.9 – 19.8** | the 9 crew units, plus `locker` 17.5, `terminal@broken` 18.3, `medbed` 19.5 | the best we have — 5 of the 9 crew units are inside the AD-21 band, none by much |
| **26.0 – 35.6** | `terminal`, `recycler`, `table`, `growbed`, `machineshop` (3 states), `terminal@off`, `corpse`, `reclaimer@broken`, `recycler@broken`, `bed`, `chair`, `battery`, `plant`, `watertank`, `recycler@off`, `desk`, `solar`, `medcab` | 2× over |
| **37.6 – 48.4** | `fabricator` (2 states), `scrubber`, `scrubber@off`, `scrubber@broken`, `reclaimer`, `radiator`, `door`, `ladder` | 3× over |
| **57.7 – 61.5** | `vent`, `reclaimer@off` | 4× over |
| `debris` (full cell) | **61.2** | 4× over |
| `wall` (full cell) | 20.7 | fails as a MATERIAL; it was authored as a decorated object |
| `floor` (full cell) | **3.0** | fails the other way — a dead plate |

So the money still does not go **first** on the crew — floors dominate the gap (one dead
material at 3.0 for fifteen room types), then walls (no cap/side/corner structure at all),
then the machine/furniture/debris family at 2–4× over. But **the crew are not exempt**: they
are measured by the same gates as everything else, and only four of the nine units pass them
today — at the very bottom of the band. See AD-42 for the unit-by-unit table and for what it
means for the re-process.

### 1.4 ✘ CORRECTION 3 — "1:1 at max zoom on Retina needs 640 px/tile"

Superseded by shipped code. `client/src/render/camera.js:25` sets
`MAX_TILE_DEVICE_PX = 128` and `client/src/main.js:128` opens at **64 CSS px/tile**, which at
dpr 2 is 128 device px/tile — **the default view is already exactly 1:1 with the 128 px art,
and max zoom is that same 1:1**. There is no zoom at which the shipped art is magnified.

The zoom band the art is actually sampled at, stated exactly because two different numbers get
quoted for it:

| view | device px per tile | vs 128 px source |
|---|---|---|
| max zoom / default, Retina play (dpr 2, 64 CSS px/tile) | **128** | 1:1 |
| zoomed out, Retina play — `clampCam` floors `z` at `min(fitZoom, 0.5)` | **≥ 64**, lower only when the ship is too wide to fit | 2× minify |
| ⚠ **the same row after `SPRITE_TILE` → 256, if `clampCam` is left alone** | **≥ 128** | 2× minify of a 256 source |
| screenshot rig near frame (`slice-shot.mjs zoom: 72`, **`--force-device-scale-factor=1`**) | **72** | 1.8× minify |
| screenshot rig establishing frame (`zoom: 32`, dpr 1) | **32** | 4× minify |

Which settles the resolution question: **our normal working view already draws 64–128 device
px per tile — 1.6× to 3.2× the reference's own 40 px — and still reads worse.** Resolution is
not the defect. It never was. See §5 for why we nevertheless move to 256.

**⚠ The `clampCam` trap, flagged here because AD-13's outline weight is derived from this
table.** `camera.js:53` floors the zoom at `min(fitZoom(cam, frame), 0.5)` — and `0.5` is a
*factor on `cam.tile`*, not a device-pixel figure. `cam.tile` is `SPRITE_TILE`. So the moment
`SPRITE_TILE` becomes 256 the working zoom floor silently doubles from 64 to **128** device
px/tile and the minification the art is designed for halves. That is a latent bug the 256
move exposes, not a design choice. **`clampCam`'s `0.5` must become `0.25` in the same commit
as the `SPRITE_TILE` move** — `256 × 0.25 = 64 = 128 × 0.5`, i.e. it preserves today's
behaviour exactly. It is listed as required work in §14.4.

### 1.5 ✔ What survived measurement

- **Cohesion is real, not AI slop.** One light direction holds in **38 of 48** sprites (median
  top-left-minus-bottom-right luma **+17.9**, §1.7 method L). Alpha edges are clean: 2.55 %
  semi-transparent pixels, mean, per cell. *(38 + the 8 of §1.6.1 is 46, not 48: `debris` and
  `scrubber@broken` score exactly 0.0 and are in neither camp.)*
- **The stage is far flatter and darker than the reference** — deck luma p50 41 vs 122.4,
  lit-floor p50→p95 spread 13 vs the reference's 44 (yard) / 45 (shower).
- **Only the 9 pawn units retain 1024² sources on disk**
  (`work/cyberpunk80s-128-v2/anchor_pawn*_raw.png` — 3 idles + 6 walk frames, all 1024×1024
  RGBA, plus 27 candidates). Every other asset exists only as 128 px processed output.

### 1.6 NEW — four defects the received diagnosis missed

*(Every count and every magnitude in this subsection was wrong in the first draft and was
re-derived on 2026-07-22 from the 48 shipped PNGs. The defects are all real; the numbers
below are the measured ones, and the method for each is written out in §1.7.)*

1. **Eight of forty-eight sprites are lit from the wrong side** — not ten. Under AD-3's own
   formula taken over **opaque pixels only** (§1.7 method L): `chair` **−52.2**,
   `medcab` **−51.9**, `recycler` **−10.9**, `pawn@f0` **−3.4**, `table` −3.2, `growbed` −1.6,
   `terminal@broken` −1.2, `debris` −0.0. The first draft's −46.1 / −65.1 / −15.1 / −11.1 do
   not reproduce under any variant of the formula and are withdrawn. Widening the test from
   "negative" to AD-3's actual bar of **< +8** catches **14** of the 45 free-standing sprites
   (the other six being `door` +5.1, `recycler@broken` +5.3, `radiator` +3.6, `corpse` +2.4,
   `battery` +1.5, `plant` +1.3). The "one light direction" property is a majority, not an
   invariant.
2. **Eight of forty-eight sprites fail the outline test — not twenty-one — and only two of
   those eight are a real art defect.** Under the formula this document uses (§1.7 method R,
   which reproduces the three numbers the first draft cited to the decimal), 40 sprites have a
   rim ≥8 luma darker than their body and 8 do not:

   | failing sprite | rim − body | what it actually is |
   |---|---|---|
   | `floor` | −0.1 | tiling terrain — **correctly** outline-free per AD-7 |
   | `wall` | −7.5 | tiling terrain — **correctly** outline-free per AD-7 |
   | `debris` | +2.2 | tiling terrain — **correctly** outline-free per AD-7 |
   | `scrubber@broken` | +0.0 | matte-corrupted (defect 3) — the "rim" is the white square |
   | `reclaimer@off` | +145.7 | matte-corrupted (defect 3) |
   | `fabricator@off` | +46.3 | matte-corrupted (defect 3) |
   | **`door`** | **−2.3** | **a genuine missing outline** |
   | **`terminal@broken`** | **−5.3** | **a genuine missing outline** |

   The first draft's `battery` −1.2, `desk` −3.8 and `corpse` +27.5 are all wrong: they
   measure **−35.4**, **−61.8** and **−51.4**, i.e. all three are correctly and heavily inked.
   Consequence for AD-6: the interim renderer dilate is **withdrawn** — two sprites do not
   justify a renderer change that has to be un-made later.
3. **Three sprites ship a residual matte.** `anchor_scrubber@broken.png` is **6,833 white
   pixels of 10,000 opaque** — the sprite is mostly a white square; `anchor_reclaimer@off.png`
   **4,225**; `anchor_fabricator@off.png` **756** (not 687). **The first draft's claim that
   "the runtime border-flood in `matte.js scrubMatte` rescues these in play" is false for all
   three.** `sprites.js _process` calls `scrubMatte` only when `isCrewKey(baseKey(key))` —
   i.e. only for `pawn*` — precisely so a light-toned full-bleed tile can never be gutted. No
   net catches these. They are visible in play.
4. **Three sprites ship un-keyed GREEN, which `scrubMatte` could not clear even if it ran on
   them** (it only walks near-white low-chroma pixels): `anchor_fabricator@broken.png`
   **93 px**, `anchor_fabricator@off.png` **46 px**, and — missed entirely by the first draft
   — **`anchor_table.png` 90 px**. Green residue on `growbed` (1,139) and `plant` (726) is
   legitimate: those are foliage keyed on magenta.

### 1.7 The methods, published so every number above is falsifiable

A number that cannot be re-derived is not a measurement. Each method below takes the 48
files in `art/spritegen/work/cyberpunk80s-128-v2/processed/` and the 2054×1522 reference.
Luma is Rec.709: `0.2126R + 0.7152G + 0.0722B`. "mean |Laplacian|" is the mean absolute value
of the 4-neighbour discrete Laplacian of luma over the interior of the window.

- **The seven guards.** Reference pixel coordinates, each the centroid of its own uniform
  (`b > r+30 ∧ g > r+20 ∧ r < 110 ∧ 60 < b < 190`) within ±30 px of a hand-picked seed:
  **(561,1044) (1114,1019) (1205,1138) (808,1226) (1066,1261) (1009,1496) (1602,1433)**.
  The last stands on flat grey concrete; the other six on yard dirt. Guard figure height,
  from the uniform-plus-cap vertical extent: 31 · 34 · 35 · 33 · 35 · 35 · 32 px (mean 33.6).
- **The five dirt controls** (empty yard, no object, no shadow): **(700,1100) (900,1350)
  (1300,1300) (620,1300) (1150,1420)**, each a 40×40 crop.
- **Method S — the SPRITE gate window (G-DET, G-COL).** Scale the cell so the **longer side**
  of the sprite's opaque bounding box is **34 px**; centre it in a 40×40 window filled with
  **`#6d7077`**, F1 PLATE's body value (§9) — a real authored value on a real surface, chosen
  because the deck is what a free-standing sprite actually stands on. Measure on that window.
- **Method M — the MATERIAL / DEBRIS gate window.** The full cell, LANCZOS-downscaled to
  40×40. No compositing: these assets are opaque edge to edge by construction.
- **Method L — G-LIT.** `median(luma | x+y < 0.85·w) − median(luma | x+y > 1.15·w)` over
  **opaque pixels only**, at the **native source resolution**, with **no compositing and no
  downscale**. See AD-21 for why the first draft's recipe was unusable.
- **Method R — the outline test.** `median(luma of opaque pixels 4-adjacent to a
  non-opaque pixel) − median(luma of all opaque pixels)`. An inked sprite scores ≤ −8.

---

## 2. The target look

> **A cold ship with warm rooms in it.**

A hard, high-value graphite hull standing against true black. Room identity carried by the
**floor material alone** — you should be able to name the room with every device deleted.
Saturation is a scarce resource spent, in this order, on **crew**, then **live machine
states**, then **hazards** — and on nothing else. Wear is the signature: this is a drifting
derelict that people are keeping alive, not a facility that is being run.

**Not a prison.** We match the reference's legibility *discipline* — hard edges, flat fills,
few values, high contrast, low detail density — and take none of its content, palette or
mood. No cream concrete, no brick, no institutional signage.

**Not the 1980s cyberpunk set either.** The shipped direction (deep violet plate, magenta
conduit neon, electric cyan trim) is superseded. It fights the console — which is warm amber
on near-black brown per `perilune-game-ui.visual-spec.md` VS-1 — and it forced the chroma
ceilings in `matte.js` to clamp 31,832 wall pixels to keep the deck from out-shouting the
crew 26:1. The new direction gives the deck no loud pixels to clamp.

---

## 3. Camera and light — one law, no exceptions

**AD-1 · Camera.** Orthographic. The ground plane (floors, debris, vents, ladders, anything
flush) is drawn at **0° — dead top-down**. Everything that stands up (crew, machines,
furniture, wall side faces) is drawn at **20° from vertical**, which means a standing object
shows a front/side face occupying **18–25 % of its own vertical extent**. This is a shallow
tilt on purpose: at 40° (where several shipped sprites sit — `bed`, `solar`, `terminal`) the
object stops agreeing with the floor it is standing on.

**AD-2 · No sprite is ever quarter-turned by the renderer unless its art is symmetric under
that turn.** Anything with a baked side face declares `"rotatable": false` in the spec. This
already exists (`SPRITE_NO_ROTATE`); it is now mandatory rather than optional.

*Enforcement, because the spec violated its own rule.* Every asset whose prompt contains
"tilted twenty degrees" has a baked front face by construction. There are **17** of them
(`door`, `terminal`, `scrubber`, `reclaimer`, `fabricator`, `machineshop`, `recycler`,
`watertank`, `radiator`, `solar`, `battery`, `growbed`, `plant`, `chair`, `medcab`, `locker`,
`desk`) and until 2026-07-22 only two — `locker` and `desk` — declared `rotatable: false`.
**All 17 now do.** The rule is mechanical and a reviewer must apply it mechanically: *tilted
prompt ⇒ `rotatable: false`.* Assets drawn "seen STRAIGHT DOWN" (`floor`, `wall`, `debris`,
`vent`, `light`, `ladder`, `bed`, `table`, `medbed`) are the only ones the renderer may turn,
and of those `bed`/`medbed` carry `facing` so the renderer turns them deliberately rather
than arbitrarily.

*A `facing` on a no-rotate sprite is inert, not a contradiction.* `glyphs.js spriteTurns`
returns 0 as soon as the role is in `SPRITE_NO_ROTATE`, before it ever looks at `facing`. So
`chair` (E), `locker` (S) and `desk` (S) keep their `facing` as a note to the artist about
which way the art is painted, and the renderer ignores it. Do not delete those keys and do not
expect them to do anything.

**AD-3 · Light.** One key light, from the **upper left**: azimuth 315° in plan, elevation 55°.
Every form's light step is on its upper-left, every shade step on its lower-right, in every
sprite, in every state, in every frame. Measured by **§1.7 method L** — `median(luma |
x+y < 0.85·w) − median(luma | x+y > 1.15·w)` over **opaque pixels at native resolution** — an
on-model sprite scores **≥ +8**; today **8** sprites score negative and **14** score below
+8 (§1.6.1), and all fourteen are rejects.

**AD-4 · No second light source in the art.** Emissive elements (a lit screen, a status ring,
a hazard strip) glow *themselves* — they do not cast light onto neighbouring geometry in the
sprite. Light spilling onto the deck is `client/src/render/` work (WP-3 light pools) and must
not be baked, because the sim's four light states (`palette.js LIGHT[]`: Dead / Emergency /
Brownout / Powered) would then be contradicted by the art.

---

## 4. THE RULING — outlines, shadows, and who owns which

A parallel lane is implementing renderer-side grounding shadows and light pools right now.
This is the binding division. It is deliberately not "all art" or "all renderer".

**AD-5 · Shadows are RENDERER. Always. The art contains no shadow of any kind.**
No cast shadow, no contact shadow, no ambient-occlusion pool, no darkened margin, no
"grounding" gradient in the transparent area. Four reasons, in order of weight:

1. **A grounding shadow leaves the cell.** In the reference, the shadow under a wall run is a
   smooth ramp from luma 22 up to 60 spread over ~40 px — a full tile *below* the wall,
   in the neighbouring tile. Baking that needs oversized cells or it clips.
2. **A baked shadow lies about the light state.** An unlit cabin (`LIGHT[1]`, an 0.48/0.53/0.68
   per-channel multiply) has no directional light and must have no directional shadow. Art
   cannot know.
3. **A baked shadow gets graded.** `matte.js gradePixels` runs a per-class levels curve over
   the whole cell at load; a shadow authored at source luma 20 arrives on screen at 46
   (`struct`) or 52 (`crew`). You cannot author a shadow value that survives grading, because
   grading is applied to the shadow too.
4. It is already owned: WP-1's second offset quad and WP-3's light-pool mesh.

**AD-6 · Silhouette outlines on FREE-STANDING SPRITES are ART.** Crew, devices, props,
furniture, corpse, door. Baked into the PNG, per §6.

> **THE OUTLINE RULING (2026-07-22).** This document previously said three different things
> about outline weight — the spec's `style_block` said "a hard **uniform** dark ink line", the
> first draft of AD-6 said a uniform rim is exactly what makes a renderer dilate unacceptable
> ("real inking varies"), and AD-13 said "8 px **uniform**". Two of those three cannot both be
> the brief. **The outline is UNIFORM.** One weight, 8 px at 256 source (7–9 tolerated),
> everywhere on the silhouette and on every declared internal division, on every free-standing
> sprite. There is no lighter-where-the-light-falls variation, no tapering, no thin-element
> exception.
>
> Three reasons, in order of weight. (1) **A uniform weight is the only one that can be
> gated.** AD-13's G-INK is a machine check; "heavier where the form turns away from the
> light" is not checkable, not brief-able and would let any generation argue its way through.
> (2) **An image model cannot hold a varying weight to spec.** It can hold "one hard line of
> one thickness" — that is the single most reproducible instruction in the whole style block.
> (3) **Crispness here comes from the outline**, and a uniform line is what makes a set of 45
> independently-sampled generations look like one set. The variation the first draft asked for
> is a hand-inking mannerism we cannot buy and do not need.

Why a renderer dilate is still rejected (WP-1's "bake a dilated dark rim into each atlas
cell"). Note that the *uniformity* argument is gone — these are the reasons that survive:
- **A dilate cannot ink an internal edge.** It only knows the alpha silhouette. It cannot draw
  the line between a pawn's arm and its torso, or between a machine's cap and its side face.
  The reference inks both; more than half of what an outline does here is internal.
- A dilate on a thin feature *closes* it. A cable, a chair leg, a ladder rung at 8 px wide
  becomes a solid dark lozenge.
- A dilate is one flat colour. AD-14 requires the ink to be *of the material* — hue within 30°
  of the fill it borders — so a cool graphite machine is inked cool and a warm jacket warm.
- It fights WP-0. The atlas already carries `ATLAS_BORDER = 4` px of **edge-replicated**
  pixels per cell. Dilating into that gutter, or replicating a dilated rim outward, is
  precisely the mip-3 halo case WP-0 documented at `ATLAS_BORDER`.
- An art outline is a property of a committed PNG — checkable by §7's gates, pinned by
  `sprites.g.test.js`. A renderer dilate has to be re-proved in both executors and perturbs
  every golden.

**No interim stopgap.** The first draft recommended WP-1's dilate as a temporary rescue for
"the 21 outline-less sprites". There are **two** (`door` −2.3, `terminal@broken` −5.3 — see
§1.6.2); the other six failures are three tiling materials that must *stay* outline-free and
three matte-corrupted units. Two sprites do not justify a renderer change that then has to be
un-made, per-cell, in the integration commit. **The dilate is not adopted at any stage.**

**AD-7 · Edge outlines on TILING TERRAIN are RENDERER.** Wall, floor, debris.
A terrain tile's exposed edges are a function of its 8-bit neighbour mask, which only the
renderer knows. Baking them means 47 variants per material. Drawing them is one dark quad per
exposed edge. **The art therefore supplies terrain as outline-free, seamlessly tileable
material** — and the *side face* of a wall, which is a material and not a line, is art (§10).

Note that AD-7 is what makes three of §1.6.2's eight "outline failures" correct behaviour
rather than defects: `floor`, `wall` and `debris` are *supposed* to have no rim.

**AD-8 · Restatement, for a reviewer.** Reject any sprite that contains a shadow. Reject any
free-standing sprite that lacks an outline. Reject any floor, wall-cap or debris tile that
*has* an outline, a vignette or a baked border — that is the `autocrop_margin` failure mode
and it renders as a grid of gutters.

---

## 5. Resolution and the pixel budget

**AD-9 · `tile_px` is 256.** Not because 128 is being magnified — §1.4 proves it is not — but
for three reasons:

1. **It buys back the zoom Garvin asked for.** With 256 px source, `MAX_TILE_DEVICE_PX` can
   rise to 256, which at dpr 2 is **128 CSS px/tile of max zoom, twice today's 64, still
   exactly 1:1**. It also lets the default opening zoom return to 72 CSS px/tile without
   contradicting the ceiling (the parked decision in HANDOVER "Open decisions" #1).
2. **The outline law needs the room.** §6 requires 8 source px of outline. At 128 that is 4 px,
   which after a generator's own resampling and a LANCZOS downscale is not a line, it is a
   gradient. At 256 it is a line.
3. **512 buys nothing.** It quadruples bytes for a zoom no one reaches and makes the free pawn
   re-process (below) impossible.

**AD-10 · `api_image_size` is `"1K"` (1024²), giving a 4× LANCZOS downscale to 256.**
Deliberately not 2K: an 8× downscale over-softens exactly the hard edges this direction is
built on, **and 1K is what the 9 surviving pawn raws already are** — so re-processing them to
256 costs **$0**. That saves roughly $4–7 of generation and keeps the three crew *characters*
Garvin accepted. It does **not** keep their pixels: `harmonize_set` re-hues them by a mean
21–22° under this spec's `hue_centers_deg`, and the re-process is not expected to bring them
inside the AD-21 gates. See AD-42.

**AD-11 · `style` is `"hd"`** (LANCZOS resample + hue harmonisation), not `"pixel"`. The
pixel path in `run.py` gives a shared 24-colour palette but resamples with `Image.NEAREST` —
a 4× nearest decimation from 1024 would delete an 8 px outline outright.

**Consequence, flagged not hidden:** the colour ceiling in §7 therefore has **no automatic
enforcement in the current pipeline**. `run.py` has no posterise step and adding one is out of
this document's scope. §7's gates are written to be run by a reviewer (and, later, by a
`process`-stage addition) before `integrate`. See §14.

**AD-12 · Asset bytes.** `client/assets/sprites.g.js` is **1,051,199 bytes** of inline base64
today. Moving to 256 px multiplies pixel count 4×; with §7's colour discipline PNG entropy per
pixel falls, so expect **2.5–3.5 MB**. That is past the point where inlining base64 into a JS
module is reasonable — **256 px art requires renderer WP-7 (real asset files + a texture
array) to land first**. This is a hard sequencing constraint, not a preference. See §14.

---

## 6. Silhouette and outline law

**AD-13 · Outline weight is derived, not chosen.** The design anchor is the **working
zoom floor: 64 device px/tile** — the lowest zoom `clampCam` allows on Retina whenever the
ship fits the viewport (§1.4), and the zoom at which the player is still reading *objects*
rather than the ship's plan. From 256 px source that is a **4× minification**, and for a dark
rim to remain ≥2 output pixels after a 4× minification it must be ≥8 source pixels. Hence,
for **every free-standing sprite** (crew,
devices, props, furniture, corpse, door) — which is every outline the art draws at all:

> **The art outline is a UNIFORM 8 px at 256 source (7–9 tolerated) = 3.1 % of tile.**
> 2 device px at the working zoom floor, 8 device px at 1:1.

**This derivation is conditional on a code change and does not hold without it.** "64 device
px/tile" is the *current* floor because `clampCam`'s `0.5` multiplies a `cam.tile` of 128.
Move `SPRITE_TILE` to 256 and leave `clampCam` alone and the floor becomes 128 device px/tile,
the minification becomes 2×, and 8 source px would over-deliver at 4 output px while a 4 px
rim would suffice. **The weight stays 8 px and `clampCam`'s `0.5` becomes `0.25`** (§1.4,
§14.4) — that keeps the shipped zoom range byte-identical and keeps this derivation true.

**G-INK — the outline gate, so "uniform 8 px" is falsifiable.** On the processed 256 px PNG,
compute the distance transform of the opaque mask to the nearest non-opaque pixel. Call a
pixel *ink* if its source luma ≤ 34 (AD-14 authors ink at 14–26; 34 leaves resampler
headroom). Then, for every free-standing sprite:
- of the opaque pixels at distance **1–6**, **≥ 90 %** must be ink — the line is there and it
  is continuous;
- of the opaque pixels at distance **11–16**, **≤ 15 %** may be ink — the line is a line and
  not a dark border band.

Both halves matter: the first rejects a missing or broken rim (today `door` and
`terminal@broken`), the second rejects the generator's favourite failure, a soft dark vignette
masquerading as an outline. A sprite that passes both has a rim between roughly 7 and 10 px
everywhere, which is the tolerance this document intends.

Below the working floor — the rig's dpr-1 establishing frame at 32 device px/tile, or a
fit-the-whole-ship view — the outline degrades to 1 output pixel. That is correct and
deliberate: at that zoom the player is reading the ship's plan, and the *reference itself*, at
40 px/tile, sits right at the same threshold.

There is **no second art outline weight.** Terrain (floor, wall, debris) carries no outline in
the art at all (AD-7). For completeness, and as a contract to WP-2 rather than an instruction
to an artist: the **renderer's** terrain edge ink is **16 px at 256** (4 device px at the
working zoom floor), twice the art's, because a terrain edge also does the work of separating a
tile from its neighbour and a wall cap from its side face.

Cross-check against the reference: its sprite outlines run ~2 px at a 40 px tile (5 % of tile)
and its *architecture* is inked ~3–4 px (8–10 % of tile) — measured on a vertical profile
through a wall run: 4 px at luma 5–31, then the cap face, then 4 px at luma 5–8. The 1:2
sprite:terrain ratio is the reference's; the absolute weights are ours, a little lighter in
proportional terms and heavier in absolute device pixels, which is correct, because we render
tiles at 64–256 device px where the reference renders them at 40.

**AD-14 · Outline value and colour.** Authored at **source luma 14–26**, **chroma ≤ 24**, hue
within **30°** of the fill it borders. It is an *ink of the material*, never neutral black and
never pure `#000` — so a cool graphite machine is inked cool and a warm jacket is inked warm.
Two worked examples at the band's centre:

| | hex | source luma | source chroma | source hue |
|---|---|---|---|---|
| cool ink (graphite bodies, steel fittings) | `#0f151d` | 20.3 | 14 | 214° |
| warm ink (crew garments, weave, rust) | `#1b130b` | 20.1 | 16 | 30° |

(The renderer's terrain ink of AD-13 uses the cool value; that is the one place a fixed ink
colour is correct, because a terrain edge borders two different materials at once.)

Where that lands on screen, after the *shipped* `matte.js` grades (§8 has the full transfer
table): **31–49** for `struct`/`prop`, **37–55** for `crew`. That sits above explored void (5)
and around hull mass (39) and a clear 35–120 luma below every lit floor. It is deliberately not
darker: an outline at source 0 would arrive at 18–20 and tie with the void, and the ship would
look like it was drawn on holes.

**AD-15 · Where the outline is omitted.** Three places, and only three:
1. Where a form meets the ground plane *underneath* itself and no silhouette edge exists
   (the underside of a bed's mattress against its own frame).
2. On an internal edge whose two sides already differ by ≥ 45 source luma — there the value
   step *is* the edge, and inking it as well reads as a scribble. (The reference does this:
   a guard's arm separates from the torso by a value step plus a hairline, not a full rim.)
3. On tiling terrain, entirely (AD-7).

**AD-16 · Minification survival — the hard geometry rules.** At 256 source:
- Nothing narrower than **12 px** may carry meaning. (3 device px at the working zoom floor.)
  In `style_block` terms that is "**a twentieth** of the image" — 12.8 px — which is the wording
  the spec must use for *detail* (rivets, bolts, marks) and does.
- The narrowest limb or strut of a silhouette is **≥ 20 px** — "**a thirteenth** of the image".
  The spec's SILHOUETTE clause previously said "a twentieth" here too, which would let a 13 px
  limb pass the prompt while failing this rule; it now says a thirteenth. Two numbers, two
  clauses, no overlap: *detail ≥ a twentieth, silhouette members ≥ a thirteenth.*
- A sprite's opaque area is **≥ 25 %** of its own opaque bounding box. No lattices, no
  wireframes, no dangling cables — the reference has no sprite you could see the floor through.
- The **read test**: downscale the finished cell to 40×40 (the reference's own pitch) and it
  must still be nameable. If you cannot tell a fabricator from a recycler at 40 px, the design
  is wrong, not the resolution.

**AD-17 · Alpha.** Hard alpha. Semi-transparent pixels (`0 < a < 250`) must stay **≤ 4 %** of
the cell — the shipped set is at 2.55 % and that is the bar to hold. No soft-edged glows in
the alpha channel; a glow is drawn as flat opaque steps inside the silhouette.

**AD-18 · The crew cell's transparent margin is load-bearing.** `matte.js paintUnderglow`
paints the per-crew accent disc into the cell's own transparent margin at
`rx = 0.82·bboxW + 0.03·cell`, `ry = 0.42·rx`, centred at `cy = maxY − 0.06·bboxH`. If the
figure is too large the disc clips at the cell edge, `_replicateEdges` then replicates the
clipped disc 4 px outward, and the pawn haloes at low zoom — the risk HANDOVER already flagged.

**Contract: `"fill": 0.72` for the pawn family, and the figure's opaque bounding box must be
no wider than 0.70 of its height.** Derivation — `normalize_fill` scales the longest side to
`fill·cell` and centres it, so for a taller-than-wide figure at fill 0.72 in a 256 cell:
`bboxH = 184`, `maxY = 219`, `cy = 219 − 11.0 = 208`, and the disc fits vertically only while
`ry ≤ 48`, i.e. `rx ≤ 114.3`, i.e. `bboxW ≤ 130` — which is `0.707 × 184`. Horizontally the
figure is centred so `rx ≤ 128` is the looser bound; **vertical clearance is the binding one.**
Verified against the nine surviving pawn raws, whose alpha-bbox aspects measure **0.388–0.618**
(worst case `pawn_b@f0` at 0.618 → `rx` 101.2, `ry` 42.5, `cy + ry` = 250.4 ≤ 256, with 5.6 px
to spare). Any new crew silhouette wider than 0.70 aspect must drop `fill` accordingly.

---

## 7. Flat-fill law and the acceptance gates

**AD-19 · The design ceiling — what an artist is allowed to use.**
Per sprite: **≤ 6 material families × ≤ 3 value steps each, + 1 outline value, + ≤ 2 emissive
notes = ≤ 21 design colours.** A "value step" is a flat region, not a ramp. Three steps means
shade / body / light — nothing between them.

**AD-20 · Banned techniques, absolutely, in every class.**
- Soft airbrush; any gradient longer than **24 source px** across.
- Noise dither, film grain, "texture overlays", scanline overlays.
- Sub-pixel filigree: hairline seams, individual rivets under 12 px, coiled cables, wire
  bundles, panel-line webs, stitching, individual hair strands, freckles.
- Bloom, lens flare, chromatic aberration, vignette.
- Any baked shadow (AD-5), any baked border or frame (AD-8).
- Text of any kind, including fake labels and gauge numerals.

**AD-21 · The measured gates.**

> **The first draft's recipe was unusable and is replaced.** It said all three gates are
> computed by compositing the cell over mid-grey `#585460` and downscaling to 40×40. Two
> things were wrong with that. (a) **`#585460` does not exist.** It appears nowhere in the
> codebase, matches no on-screen value, and is not authored by this document; the deck's hull
> mass is `#282531` and its default floor is `#6d7077`. (b) **The recipe breaks G-LIT
> outright.** Under it the flat background dominates both half-medians, and **45 of 48
> sprites score below +8 — including on-model ones**: `pawn`, `pawn_b`, `terminal` and
> `locker` all score exactly **+0.0**, because the median of each half is the background. A
> gate that fails the art it is meant to pass is not a gate.

The gates are computed on the **processed 256 px PNG**, by the methods published in §1.7:

- **G-DET / G-COL, SPRITE kind — §1.7 method S.** Scale the cell so the **longer side** of the
  sprite's opaque bounding box is **34 px** (PA's own guard figure height at its 40 px pitch,
  measured 31–35 px, mean 33.6 — and for an upright figure the longer side *is* the height),
  centre it in a 40×40 window of **`#6d7077`** — F1 PLATE's body value, a real surface a real
  sprite really stands on. *Longer side, not height*: four shipped units (`growbed`,
  `machineshop` ×3) are wider than tall and would be cropped by the window under a height-only
  rule. Normalising to the *figure* rather than to the cell is the whole correction of §1.3:
  the first draft's recipe let a mostly-empty cell score as a calm one.
- **G-DET / G-COL, MATERIAL and DEBRIS kinds — §1.7 method M.** Full cell, LANCZOS to 40×40,
  no compositing (these are opaque edge to edge).
- **G-LIT — §1.7 method L.** Opaque pixels only, native resolution, no compositing, no
  downscale.

Classes for the gates are **authoring kinds**, not `matte.js` grade classes:
**MATERIAL** = the 5 floors + the 2 walls (everything `"tileable": true` except debris) ·
**DEBRIS** = the wreck field alone · **SPRITE** = every free-standing unit (crew, corpse,
devices, furniture, door).

| gate | kind | threshold | derivation | our current worst |
|---|---|---|---|---|
| **G-DET** mean \|Laplacian\| of luma | SPRITE | **6 ≤ x ≤ 15** | see below | reclaimer@off 61.5, vent 57.7, ladder 48.4 |
| | MATERIAL, except F1 | **6 ≤ x ≤ 16** | PA yard 8.3–12.5, shower 13.9 | wall 20.7 |
| | MATERIAL, **F1 PLATE only** | **5 ≤ x ≤ 9** | PA circulation floors 4.6 / 7.0 — see AD-29b | floor **3.0** |
| | DEBRIS | **≤ 28** | — | 61.2 |
| **G-COL** quantised colours (`RGB//16`) | all | **≤ 120** | see below | reclaimer@broken 187, ladder 156, growbed 155 |
| **G-INK** rim continuity / rim thickness | SPRITE only | ≥90 % ink at d1–6, ≤15 % at d11–16 | AD-13 | door, terminal@broken |
| **G-LIT** top-left minus bottom-right median luma | SPRITE only | **≥ +8** | AD-3 | medcab −51.9, chair −52.2 |

**Where the SPRITE G-DET band of 6–15 comes from** (the first draft's 8–22 was fitted to
nothing). On PA's own yard dirt a guard scores 16.7–20.1 in a 40×40 window where the bare
dirt scores 11.7, and our pawn family scores 22.8–29.3 on the same dirt at the same figure
height (§1.3). On flat PLATE our pawn family scores 12.9–19.8. Scaling by the ratio the two
grounds give us — 18.8 / 24.8 — puts a PA guard's flat-ground equivalent at **9.8–15.0**. The
ceiling is that upper figure, **15**; the floor is **6**, just under PA's calmest measured
floor (4.6) so that a dead, featureless sprite also fails. Today **five of the 48 sprites are
inside the band and all five are crew** (`pawn_b` 12.9, `pawn_c@f0` 14.0, `pawn@f0` 14.6,
`pawn_b@f1` 14.8, `pawn_c@f1` 14.9). The next-calmest non-crew unit is `locker` at 17.5, and
everything else is 2–4× out.

**Where the G-COL ceiling of 120 comes from** (the first draft's ≤112 was fitted to its own
maximum sample of 111 and **did not bracket the reference**: three of the seven guard windows
score 113, 119 and 119). Re-derived like-for-like: the seven 40×40 guard windows carry
**92 – 119** quantised colours over PA's own textured floor. The ceiling is that maximum
rounded up: **120**. Our crew family scores 63–144 under method S — eight of nine inside, only
`pawn_c` (144) out — and our devices run to 187.

G-DET is the primary gate: it is the one measurement on which the reference and our best
sprites are on the same scale and our worst sprites are 4× out. It is a **band**, not a
ceiling — a floor scoring 3.0 fails for being a dead plate just as surely as debris scoring 61
fails for being noise. Note that the shipped `wall` scores 20.7: **over both bands**, and
worse against the sprite band than against the material one. That is not a technicality, it is
exactly the diagnosis — it was authored as a decorated object rather than as a material, which
is why it cannot autotile.

**AD-22 · The two tileable-material gates.**
- **Seam.** `run.py seam_report` must print `clean` (mean edge delta < 12) for every asset
  marked `"tileable": true` — on **both** axes for the five floors, the wall cap and debris,
  and on the **L/R axis only** for `wall@side`, which tiles horizontally by design (§10).
- **Value spread.** Every floor material's own luma distribution must satisfy
  **45 ≤ p95−p05 ≤ 80** and **p95−p50 ≥ 18**. Reference: yard 71 / 44, shower 71 / 45. Ours
  today: **11 / 9** — this single gate is the "one mud" fix, and no amount of grading
  substitutes for it (see §8.2).

**AD-23 · Residual-key gate.** *(Reformulated 2026-07-22 — as first written it rejected this
document's own mandated art.)*

The first draft said "zero opaque pixels may satisfy `min(r,g,b) ≥ 190 ∧ max−min ≤ 40` on a
border-connected component". **`#d9dfe2` satisfies it** — `min` 217, `max−min` 9 — and
`#d9dfe2` is the light step of F3 SEAL (§9) *and* of the CLINICAL triple (§11). On a
full-bleed seamless SEAL tile that region is border-connected by construction, so the gate
would reject the brightest surface on the ship for existing. `medbed` (1,299 such pixels) and
`medcab` (509) already trip it today and neither is matte-corrupted.

The gate as it now stands:

- **White matte.** Reject any asset with **≥ 500 opaque pixels** satisfying
  `min(r,g,b) ≥ 190 ∧ max−min ≤ 40` **in a single border-connected component**, *unless* the
  asset's authoring class is **SEAL** (`floor@seal`) or **CLINICAL** (`medbed`, `medcab`),
  whose light step is legitimately `#d9dfe2`. For those three units the test is instead the
  **area** test: near-white must be ≤ 25 % of the opaque area, which is what AD-29's
  "light 10–30 %" and AD-37's three-step language already require. Shipped failures under the
  reformulated gate: `scrubber@broken` (6,833 — 68 % of its opaque area), `reclaimer@off`
  (4,225 — 42 %), `fabricator@off` (756). `medbed` 1,299 = 18 % and `medcab` 509 = 13 % pass.
- **Un-keyed green.** Reject any opaque pixel satisfying `g > 120 ∧ g > 1.5r ∧ g > 1.5b`
  **except** on assets that declare their own `key_color` (foliage: `growbed`, `plant`). No
  exemption, no threshold — green on a green-keyed unit is always a keying failure. Shipped
  failures: `fabricator@broken` 93, `fabricator@off` 46, `table` 90.

**The source must not need a runtime net, because there is no net.** The first draft claimed
"the runtime border-flood in `matte.js scrubMatte` rescues these in play". It does not:
`sprites.js _process` calls `scrubMatte` only when `isCrewKey(baseKey(key))` is true — only
`pawn*` — deliberately, so that a light-toned full-bleed tile can never be gutted by a border
flood. Every non-crew unit above ships its defect straight to the screen.

---

## 8. Value and palette system

### 8.1 The ladder we already ship — and must not break

`client/src/render/palette.js` documents four separated dark states and says explicitly that
whoever moves one must re-check the other three. This direction keeps all four:

| meaning | source | on-screen luma |
|---|---|---|
| explored void | `FG[Void] = FG[Unknown] = #050409` | **5** |
| hull mass **and all fog** | `HULL = #282531` | **39** |
| explored but unlit room floor | floor art × `LIGHT[1]` (luma multiplier ≈0.53) | **45–89** (per material, §9) |
| explored and lit room floor | floor art, no overlay | **84–168** (per material, §9) |

The bottom two rows assume §8.3's superseded `floor` grade has landed — under the *shipped*
grade every one of §9's five materials renders at 172 and the ladder collapses. That is the
whole of §8.3, and it is why the two changes are a single commit.

**AD-24 · No floor material may have a p50 below source luma 76.** Derivation: an unlit floor
renders at 0.53× its lit value, and it must stay above hull mass (39); 39 / 0.53 = 73.6.
Break this and a *seen dark room* becomes darker than *never-seen hull*, which inverts the
whole exploration read.

**AD-25 · Value collision between a wall cap (§10) and the `SEAL` floor (§9) is accepted, not
resolved by value.** They are separated by the wall's outline and its side face, exactly as the
reference separates its cream wall cap from its white shower tile. Do not "fix" this by
darkening one of them.

### 8.2 The shipped grades — the transfer table every author needs

`matte.js gradePixels` runs a levels+gamma+saturation curve over every decoded sprite at load,
per class (`floor` / `struct` / `prop` / `crew`, selected by `gradeFor`). **Source luma is not
screen luma.** This table is the shipped arithmetic, computed exactly:

| source luma | `floor` (shipped) | `struct` | `prop` | `crew` |
|---|---|---|---|---|
| 8 | 78.0 | 18.0 | 18.0 | 25.5 |
| 24 | **78.0** | 46.1 | 46.1 | 52.1 |
| 44 | **78.0** | 70.8 | 70.8 | 78.3 |
| 60 | 128.1 | 88.4 | 88.4 | 97.3 |
| 74 | **172.0** | 102.8 | 102.8 | 112.9 |
| 110 | **172.0** | 137.0 | 137.0 | 150.6 |
| 150 | **172.0** | 172.1 | 172.1 | 189.4 |
| 190 | **172.0** | 205.0 | 205.0 | 226.1 |
| 255 | **172.0** | 205.0 | 205.0 | 235.0 |

And the chroma arithmetic:

| class | `sat` | `chromaMax` | source chroma above which the ceiling clamps |
|---|---|---|---|
| `floor` | 0.5 | — | (none; screen chroma = source × 0.5) |
| `struct` | 0.6 | 45 | **75** |
| `prop` | 0.70 | 50 | **71** |
| `crew` | 1.8 | — | (none; screen chroma = source × 1.8) |

**AD-26 · Authoring windows that follow directly.**
- `struct` / `prop`: author within **source luma 8–190**. Above 190 everything clips to 205 —
  three different highlights become one.
- `crew`: author within **source luma 6–200**.
- `struct`: author chroma ≤ **40** (screen ≤ 24). `prop`: body chroma ≤ **30** (screen ≤ 21),
  and the *state element only* may reach **71** (screen 50, the ceiling — going higher throws
  the colour away).
- `crew`: the garment accent at source chroma **45–70** (screen **81–126**); skin, hair and
  base garment at ≤ **22** (screen ≤ 40).

That produces exactly the discipline this direction demands, in on-screen chroma:
**crew accent 81–126 > machine state / hazard ≤ 50 > floor ≤ 30 > structure ≤ 24.** It also
agrees with `matte.js`'s own measured claim that "the crew family reads 1.79× louder than the
loudest thing they walk past".

### 8.3 SUPERSESSION — `GRADE.floor` must change when the new floor art lands

This is the one place this document supersedes shipped code, and it is not optional.

`GRADE.floor` is `{inLo: 44, inHi: 74, outLo: 78, outHi: 172}` — a **3× stretch of a 30-luma
input window**. It exists because the shipped floor tile spans luma 54→65 and needed rescuing.
Applied to §9's floor set it is destructive: every source value ≤44 collapses to 78 and every
source value ≥74 collapses to 172, so `RIME` (84), `GRID` (96), `PLATE` (112), `WEAVE` (132)
and `SEAL` (168) would **all render as 172** — one mud, again, and worse than today.

**Binding contract for the lane that integrates the new floor art (a `matte.js` change; this
document does not make it):**

```js
floor: { inLo: 0, inHi: 255, outLo: 0, outHi: 255, gamma: 1.0,
         sat: 1.0, chromaMax: 34, tint: [1.0, 1.0, 1.0] },
```

Identity in luma — the art now carries its own value range, which is the entire point of §9 —
with the chroma ceiling moved from the multiplier into a **34** cap. Why 34: the floor covers
more pixels than anything else on the deck, so it must be the calmest surface; 34 sits below
`struct`'s 45 and `prop`'s 50, and above every value §9 authors (max 28), so it never binds on
on-model art and only catches a drifting generation.

**The two changes must land in the same commit.** New floor art under the old grade is a
regression; the new grade under the old art returns the deck to luma 56.

**AD-27 · The floor variants must reach the `floor` grade.** They are authored as spritegen
**states** of the `floor` asset (`floor@grid`, `floor@seal`, `floor@weave`, `floor@rime`), not
as new roles, so the runtime key is `floor#grid` and `matte.js baseKey` strips at `#` and
returns `floor`. **Do not give them their own roles** — `gradeFor` matches `base === 'floor'`
exactly and a role named `floor_grid` would silently fall through to the `struct` grade. The
same applies to the wall states (§10).

**But the loading machinery does NOT already ship, and the first draft was wrong to say so.**
`baseKey`/`gradeFor` are append-only and need no change — that half is right. The half that is
false: `client/src/render/sprites.js variantUris()` hard-codes exactly three variant families
via `VARIANT = { BROKEN, OFF, FRAME }` (`motion.js:269`) —

```js
if (s.broken) out[role + VARIANT.BROKEN] = s.broken;
if (s.off)    out[role + VARIANT.OFF]    = s.off;
```

— so `grid`, `seal`, `weave`, `rime`, `side` and `open` are **silently never loaded**. No
error, no warning, no fallback message: the keys simply do not exist in `this.img` and the
renderer draws the base sprite forever. **Extending `variantUris()` and `VARIANT` to carry the
new state keys is required renderer work and is listed as such in §14.1**, alongside the
selection work (terrain state selection for the floor/wall variants, `door@open` selection).
It is small — a generic "load every key in `SPRITE_STATES[role]`" loop replaces the two
hard-coded lines — but it is not free and it is not already covered by a test.

---

## 9. Floor materials — room identity by floor alone

Five materials cover all fifteen `RoomType` values (`sim/Sim.Core/Rooms/RoomType.cs`). Each is
a seamless 4-way tileable 256×256 swatch, outline-free (AD-7), authored at its stated value.

| id | name | RoomTypes | p50 source luma | unlit (×0.53) | hue | chroma | signature |
|---|---|---|---|---|---|---|---|
| **F1** | **PLATE** | None, Corridor, Storage, **Bridge, Command** | **112** `#6d7077` | 59 | 215–225° | ≤ 10 | The default and the value anchor, and **deliberately the quietest material on the ship** (AD-29b). Big graphite deck plates, a straight recessed joint, and **one** wear event. No bolts, no drainage channel. Neutral. |
| **F2** | **GRID** | Engineering, Reactor, Fabrication, Workshop | **96** `#695e55` | 51 | 22–35° | ≤ 22 | Steel walkway grating over a dark void. Slots read as flat dark bars, never as a lattice you can see through. Warm rust in the wear. |
| **F3** | **SEAL** | Medbay, LifeSupport | **168** `#a1a9ad` | 89 | 195–210° | ≤ 14 | Poured heat-sealed composite, near-white, one fine grout line quartering the tile. The brightest surface on the ship. Clinical, cold, spotless. |
| **F4** | **WEAVE** | Quarters, Mess, Commons | **132** `#8f8274` | 70 | 28–45° | ≤ 28 | Matted synthetic pad laid over plate; soft-edged, warm, slightly uneven. **The only floor allowed real colour** — this is the "warm rooms" of the target look. |
| **F5** | **RIME** | Observatory, and any depressurised or breached room | **84** `#4d555d` | 45 | 205–220° | ≤ 16 | Raw structural deck, no coating, exposed ribs, frost rime in the seams. Cold. Reads "do not go here". |

That is all fifteen `RoomType` values covered with no gaps and no overlaps: F1 takes None ·
Corridor · Bridge · Command · Storage, F2 takes Workshop · Reactor · Engineering · Fabrication,
F3 takes Medbay · LifeSupport, F4 takes Quarters · Mess · Commons, F5 takes Observatory.
"Depressurised or breached" is a *state*, not a RoomType — until a pressure flag reaches the
client (which no wire carries today) F5 is selected by Observatory alone.

**AD-28 · Value ladder.** 84 · 96 · 112 · 132 · 168 — five steps, minimum separation 12 luma,
all above the 76 floor of AD-24, all distinct when unlit (45 · 51 · 59 · 70 · 89), and all
above hull mass (39) when unlit. **F2 GRID and F5 RIME are only 12 apart and are therefore
separated by hue and pattern, not by value** (warm rust with dark slots vs cold blue-grey with
frost).

*How adjacency is actually handled, so nobody invents a third answer.* F2's rooms
(Engineering · Reactor · Fabrication · Workshop) and F5's room (Observatory) are not adjacent
in the authored slice, and no ship generator is required to keep them apart. When they do
meet, they are separated **exactly as any two floor materials are**: by the renderer's terrain
edge ink, 16 px at 256 (AD-13), drawn along the boundary between two different materials.
There is no special case, no third value, no transition tile, and neither material's hue or
value moves to accommodate the other. The 12-luma gap is stated only so an artist does not
"fix" it by darkening one of them.

**AD-29 · Per material: a three-step value structure and nothing else.** Shade / body / light,
each flat. Reference triples, all computed to hit AD-22's spread:

| | shade | body | light |
|---|---|---|---|
| F1 PLATE | `#4e5158` (81) | `#6d7077` (112) | `#929498` (148) |
| F2 GRID | `#4e433a` (69) | `#695e55` (96) | `#867d76` (126) |
| F3 SEAL | `#737a7e` (121) | `#a1a9ad` (168) | `#d9dfe2` (222) |
| F4 WEAVE | `#6a5d4e` (95) | `#8f8274` (132) | `#b8ada0` (174) |
| F5 RIME | `#363d46` (60) | `#4d555d` (84) | `#6a7076` (111) |

**Area split: body 40–70 % of the tile, shade 10–30 %, light 10–30 %.** This is what makes the
p05→p95 window of AD-22 land *inside* the triple rather than at its extremes — F3 SEAL's steps
span 101 luma, which would blow AD-22's 80 ceiling if the shade and light were majority areas.
A material whose body is under 40 % of the tile is noise, not a material.

**AD-29b · THE PLATE JUDGEMENT — F1 is quieter than the rest, and here is why.**
F1 PLATE is the default under **None · Corridor · Storage · Bridge · Command** — the majority
of the deck by area, and the ground under most of the ship's objects. The first draft asked it
for bolts, drainage channels, traffic lanes, a welded patch *and* a stain inside a 6–16 G-DET
budget. That is five motifs on the surface that is supposed to disappear.

Measured on the reference: PA's **circulation** floors — the ones its high-contrast objects
actually stand on — score **4.6** (grey corridor) and **7.0** (concrete apron), against
**8.3 – 12.5** for its open yard dirt and 13.9 for its shower tile. *The reference's clarity
comes from its busiest floor being outdoors and its indoor floors being nearly unpatterned.*
Our F1 covers indoor circulation, so it must be measured against 4.6–7.0, not against the
yard.

**Ruling.** F1 PLATE gets its own G-DET band, **5 ≤ x ≤ 9** (AD-21), and a motif inventory of
**two**:
1. the plate joint — one straight recessed joint grid, rhythm coarser than one tile;
2. **exactly one** wear event per tile, per AD-30.

**Bolts and the drainage channel are deleted from F1.** A recessed bolt at a plate corner is a
sub-14 px mark on the surface that covers the most pixels and the least meaning; four of them
per tile is four dark specks under every object on the ship, and at the working zoom floor
they are 3 device px of grit. The drainage channel moves to **F2 GRID**, where an engineering
deck earns it and where the material is already the loud one. F1 keeps its full three-value
triple and its AD-22 value spread — the spread comes from the joint and the wear event, not
from a scatter of small marks.

The other four materials are unchanged: they cover one to four room types each, they are the
*reason* you can name a room, and a Medbay or a Quarters is allowed to be characterful because
you are only ever in one of them at a time.

**AD-30 · Wear is the signature and it lives in the floor — and it is countable.** Every
material carries wear: a scuffed traffic lane, a patch of a *different* material welded in, a
stain, a bar worn bright. Wear is drawn with the material's own three values — never with a
new hue, never with noise, never below the shade step. It is what makes 45–80 of value spread
(AD-22) rather than dither.

*So that two artists cannot diverge, wear is specified as a count and an area, not as a mood:*

| | wear events per 256 tile | total wear area | min feature |
|---|---|---|---|
| **F1 PLATE** | **exactly 1** | 6 – 15 % of the tile | one connected region ≥ 40×40 px |
| F2 GRID · F4 WEAVE · F5 RIME | 2 – 3 | 10 – 25 % | each region ≥ 32×32 px |
| F3 SEAL | **exactly 1** | ≤ 6 % | one connected region ≥ 32×32 px (it is the clean room) |

A "wear event" is one connected region drawn in exactly one of the material's own three
values, differing from the value it sits on. Two events may not touch. A region below the
minimum size is not wear, it is grit, and AD-20 bans it.

**AD-31 · Room-type selection is renderer work and needs a wire.** The client has no room-type
information today. Selecting F1–F5 per tile needs the new append-only `rooms` message that
WP-5 already requires. Until it exists, F1 PLATE ships as the base `floor` asset and the other
four sit unused in `SPRITE_STATES` — which is harmless (a missing state key simply falls back
to the base sprite, proven by `sprites.g.test.js`).

---

## 10. Wall design for autotiling and extrusion — the art contract for WP-2

**AD-32 · The art supplies two materials. Not 47 sprites. Not 20.**

This is the largest structural win available and it is also where a naive contract burns the
most money. WP-2 needs ≤47 distinct wall cells keyed by an 8-bit neighbour mask. Asking an
image model for 47 mutually-consistent draws does not work — each generation is an independent
sample and they will not agree on plate rhythm, wear placement or bolt spacing.

Per AD-7, edges and corners are *lines*, and lines are renderer geometry. So:

| unit | spritegen key | authored as | drawn as | what it is |
|---|---|---|---|---|
| **cap material** | `wall` (base) | full 256×256 swatch, seamless in **all four** directions | the whole cell, with the seam/side/ink bands painted **over** it | The lit top face of the hull. No outline, no lip, no border, no side face. |
| **side material** | `wall@side` | full 256×256 swatch, seamless **left↔right** | the whole swatch **squashed vertically to 256×104** | The vertical face revealed by the 20° camera tilt. No outline, no top or bottom lip. |

Both are authored as full square swatches — a generator draws a square well and a strip badly.
The horizontal seam is the only one that matters for `wall@side`; `seam_report`'s L/R number is
the gate, its T/B number is advisory for that unit.

*Why the side face is squashed rather than windowed.* "A 256×104 window of it" left the window
position unspecified, which is a divergence a reviewer cannot settle. Squashing the whole
256×256 swatch to 256×104 is position-free, loses no authored material, keeps L/R tiling
exact, and is physically what a shallow camera tilt does to a vertical face anyway. It also
fixes where the value break lands (AD-33).

> **THE WALL RULING (2026-07-22) — bake, do not tile.** As first written this section
> contradicted itself: AD-32 promised two authored materials and ≤47 renderer-composed cells,
> while AD-34/AD-35 required both materials to be sampled "at the tile's **world**
> coordinates" so runs continue. A baked atlas cell cannot do that — cells are keyed by mask
> alone, their UVs are clamped, and `ATLAS_BORDER` edge-replicates their rims. Today
> `resolveTerrain` returns a single position-independent `terrain:wall` cell and no mask at
> all. Both halves could not ship. **The bake wins and world-continuity is dropped**, for
> three reasons: it needs no new sampling capability in either executor (the atlas already
> bakes cells, `packAtlas` already places them, both executors already sample them); per-tile
> UV offsets into a wrapping texture would break the UV-clamp and edge-replication guarantees
> WP-0 just landed; and the atlas cost is bounded and demand-driven (`collectCellKeys` only
> bakes the masks a frame actually contains).
>
> **What replaces world-continuity: bounded phase variation.** A cap swatch that is seamless
> in all four directions can be *rolled* by any offset and stay seamless. The composer picks
> one of **4 cap phases** — roll by (0,0), (128,0), (0,128), (128,128) — from a deterministic
> hash of the tile's world (x, y). **The side material takes only the x half of that phase**
> (roll by 0 or 128 in x, never in y): it tiles L↔R only, and a vertical roll would move
> AD-33's authored value break. So a wall run is 4 cap variants × 2 side variants, all from
> two authored swatches, with **no** new sampling capability, **no** wire change and a bounded
> multiplier on the cells actually baked. It is the one place the composer is allowed to know
> a tile's world position, and it uses it to pick a variant, not to compute a UV.

**AD-33 · The wall cell's vertical composition**, which the renderer assembles and which the
two materials must be authored to fit. Measured off the reference (a vertical profile through
a wall run at tile 40: 4 px ink · 16 px cap at luma 197 · 2 px seam · 14 px brick side at luma
104–146 · 4 px ink · then a ~40 px shadow ramp 22→60 on the floor below), scaled to 256:

| band | y range @256 | height | owner | value |
|---|---|---|---|---|
| top edge ink | 0 – 16 | 16 px | **renderer** (only when N is open) | source 14–26 |
| **cap face** | 16 – 124 | 108 px (42 %) | **art** (`wall`) | three flat steps **111 / 150 / 189** (`#6b7076` / `#92979d` / `#b9bec3`), p50 150 |
| cap↔side seam ink | 124 – 136 | 12 px | **renderer** (only when S is open) | source 14–26 |
| **side face** | 136 – 240 | 104 px (41 %) | **art** (`wall@side`) | two flat steps **78 / 104** (`#554d47` / `#71665f`), p50 104 |
| bottom edge ink | 240 – 256 | 16 px | **renderer** (only when S is open) | source 14–26 |
| cast shadow | the tile *below* | ~1 tile | **renderer** (WP-1/WP-3) | — |

16 + 108 + 12 + 104 + 16 = 256. ✔

**The cap material fills the cell; the bands are painted over it.** The first draft's "the
whole cell, **or its top 136 px**" was ambiguous — is the 12 px seam band cut *from* the cap or
laid *on* it? **On it.** The `wall` swatch is drawn edge to edge at 256×256 every time, and
the renderer then paints the seam ink, the side face and the edge inks on top of it in that
order. So the artist authors 256 px of cap and never has to know where the seam lands, and no
band boundary is a place where two authored assets must agree.

**Where the side face's value break sits** — the second thing two artists would have solved
differently. The side swatch is authored with **body `#71665f` (104) across its top 60 % and
shade `#554d47` (78) across its bottom 40 %**, break dead straight, hard edge. Squashed to the
104 px window that puts the break at **y = 198** in the cell (136 + 62), and gives the side
face the p50 of 104 this table specifies. Light comes from above, so the lit part of a
vertical face is its top: never the other way round.

A wall whose south neighbour is **not** open shows cap material for the full 256 px. A wall
with **no** open neighbour (deep hull mass) is not drawn at all — `palette.js HULL` paints it,
and must keep painting it, or the fog gate leaks.

The cap p50 of 150 renders through the `struct` grade at **172** — brighter than every floor
except SEAL, which is what makes the ship's interior architecture read as architecture. The
side face p50 104 renders at **131**, a clear step below the cap and a clear step above the
darkest floor. Note the cap is **cool** (hue 211–213) and the side **warm** (hue 23–26): the
face in shadow picks up the ship's warm interior bounce, and it is the one place structure is
allowed any hue at all.

**AD-34 · The 8-bit mask contract (what the renderer must be able to build from two materials).**
Neighbour bits in order **N, NE, E, SE, S, SW, W, NW**; a diagonal bit counts only when both of
its adjacent edge bits are set (the standard blob rule, which is what collapses 256 masks to 47
distinct cells). From the two materials the renderer composes any mask as:

1. Fill the cell edge to edge with **cap material**, using the **phase variant** selected by a
   deterministic hash of the tile's world (x, y) — one of the four 128 px rolls of the seamless
   swatch (see the ruling in AD-32). The cell is baked once per (mask, phase) pair and cached
   in the atlas; nothing is sampled per-pixel at world coordinates.
2. For each **open edge** (N / E / S / W): draw a 16 px ink band along that edge, inset into
   the wall tile.
3. For each **corner where both adjacent edges are wall but the diagonal is open** (an inner
   corner): draw a 16×16 ink notch at that corner. Zero to four per tile — this is the case
   that cannot be expressed by rotating a whole-tile piece, and it is why the composition is
   per-edge rather than per-piece.
4. If **S is open**: paint over the bottom **132 px** — `y = 124 … 256` — as seam ink
   (12 px, y 124–136) + **side material** squashed to 256×104 (y 136–240) + bottom ink
   (16 px, y 240–256). *(The first draft said "the bottom 120 px", which is 12 + 104 + 16 = 132
   miscounted; a renderer built to that text would misplace the whole stack by 12 px.)* The
   side material uses the **x half** of the cap's phase index, so a wall run's two faces agree
   horizontally and the side's authored value break never moves.

This composes all 256 masks, hence all 47 distinct appearances, from 2 authored units and
**no wire change** — the client already holds the glyph grid, and `glyphs.js openAt` already
defines "open" correctly (fog counts as solid, off-grid counts as open). The atlas cost is
(masks present in the frame) × (phases present in the frame), demand-driven by
`collectCellKeys`, and bounded above by 47 × 4.

**AD-35 · What the art must therefore guarantee.**
- Both materials tile seamlessly **at cell offsets and at every phase roll they are subject
  to** — which is what makes AD-32's phase variants legal. `seam_report` must read `clean` on
  the swatch and on each roll: the cap at (128,0), (0,128) and (128,128); the side at (128,0)
  only, since it is never rolled vertically. In practice that is the same requirement stated
  twice — a genuinely seamless swatch survives any roll — but it is the cheapest check that
  catches a swatch that is only *nearly* seamless.
- **No world-offset sampling is required or permitted.** A feature *may* sit at a fixed
  position within the 256 cell — the phase variation, not the sampling, is what breaks the
  rhythm. This supersedes the first draft's "no feature may sit at a fixed position".
- Neither carries any edge treatment, lip, bevel, border or vignette. AD-8 rejects it.
- The cap material's plate rhythm must be **coarser than one tile** — a plate joint every
  ~1.5 tiles — so a long wall run does not read as a checkerboard, and no joint may run along
  a cell edge (where two tiles would double it). (Checkerboarding is the failure mode of the
  shipped `anchor_wall`, which is authored to tile *horizontally only* and is rotated 90° for
  vertical runs by `wallVertFace`.)
- The side material is exactly **two flat steps** across its height, top 60 % body and bottom
  40 % shade (AD-33), with no gradient: it is a face in shadow, not a cylinder.

**AD-36 · Debris** (`debris`, tileable, `struct` grade) follows the same rules as a floor
material — outline-free, seamless, G-DET ≤ 28 — and is the one asset allowed to look chaotic.
Today it scores 61.2 with **0.0 % flat pixels** and 9,724 unique colours: it must be rebuilt as
**large recognisable pieces** (a torn hull plate, a bent strut, a spilled crate) at 4–6 per
tile with flat fills, not as a noise field.

---

## 11. Devices, props and furniture

**AD-37 · Design language.** Heavy, welded, repaired. A device is a **single closed mass** with
one or two subordinate volumes — never an assembly of small parts. Materials: graphite plate,
dull steel, dark polymer, one warm metal (brass/bronze) as the ship's age. Every device carries
at least one visible repair: a bolted patch, a mismatched panel, a clamp, a weld bead. Fasteners
appear only where they are ≥12 px (AD-16); everywhere else they are implied by a value step.

Two body triples cover the whole non-crew stage, and every unit uses one of them:

| triple | shade / body / light | source luma | used by |
|---|---|---|---|
| **DARK MACHINE** | `#43474d` / `#62676e` / `#878c93` | 71 / 102 / 139 | terminal, scrubber, reclaimer, fabricator, machineshop, recycler, door slab, radiator, battery |
| **LIGHT FITTING** | `#4b5158` / `#6d747c` / `#949aa1` | 80 / 115 / 153 | watertank, solar frame, vent, light housing, ladder frame, growbed trough, plant pot, bed, table, chair, locker, desk |
| **CLINICAL** | `#737a7e` / `#a1a9ad` / `#d9dfe2` | 121 / 168 / 222 | medbed, medcab — the same authored hexes as floor F3 SEAL, deliberately |

**What these triples do and do not do.** After the `prop` grade they land on screen at
**100 / 129 / 162** (DARK MACHINE), **109 / 141 / 174** (LIGHT FITTING) and **147 / 187 / 205**
(CLINICAL — the top step clips at the `prop` ceiling, AD-26). That is a 12-luma step between
the two common families: enough to give the ship a "heavy machine vs light fitting" register,
**not** enough to separate an object from the floor it stands on, and it is not meant to. With
five floor materials spanning 84–168 there is no single object value that stands clear of all
of them. **The outline does that job** (AD-6), which is exactly how the reference works — its
guards sit at luma ~110 and its prisoners at ~142 against a 128 yard floor, both within 20
luma, and both read instantly. Do not chase value separation between object and ground; chase
the outline.

CLINICAL is shared with F3 SEAL on purpose: the medbay is one material world. The two grades
then part them slightly — the bed's 187 against the floor's 168 — so the furniture still reads
a step off its ground.

**AD-38 · A device's state must be readable at the working zoom floor (64 device px/tile).**
The rule: **state is carried by the emissive area and by nothing else.** The silhouette,
the palette and the light are byte-for-byte the same intent across all states — this is what
makes the change legible, because a change nothing else competes with is visible at 3 device
pixels.

**The emissive element, specified so two artists cannot diverge.** There is **exactly one**
emissive region per device, in every state. It is **one connected convex flat shape** — a
rectangle, a disc or a rounded bar, never a ring of lamps, never a scatter. Its bounding box
lies **entirely inside the object's opaque bbox** (no emissive on the silhouette edge, where
the outline would eat it). It sits on a face that turns toward the **upper left**, so the lit
element and the key light agree. Its shorter dimension is **≥ 28 px** at 256 (7 device px at
1:1, 1.75 at the working zoom floor — the smallest thing that can still change state
visibly). It may contain **at most two** darker sub-bars of the same hue, each ≥ 20 px wide,
and nothing else. No halo, no glow gradient, no second colour.

| state | spritegen key | emissive area | emissive source luma | emissive source chroma | anything else |
|---|---|---|---|---|---|
| **running** | base sprite | **3–8 % of the cell** | 150–190 | 55–71 (screen 39–50, the `prop` ceiling) | — |
| **unpowered** | `@off` | same shape, dead | ≤ 40 | ≤ 10 | **nothing**. No moved parts, no opened panels. |
| **broken** | `@broken` | same shape, dead | ≤ 40 | ≤ 10 | + **one** damage mark: a scorch, a crack, or a bent member. + a **hazard-red** note at 2–4 % of the cell, source luma 120–150, chroma 60–71. No smoke, no sparks, no debris pile. |

The shipped `@broken` sprites add smoke, sparks, scorch marks *and* a red glow, which is why
they score G-DET 41.9 (`fabricator@broken`), 46.3 (`scrubber@broken`) — the damage language
buries the object.

**AD-39 · Wear is NOT a fourth generated sprite.** `MachineWear` is a continuous sim value; a
sprite is discrete. Wear must be a **renderer overlay** — a chroma reduction plus one dark
streak multiply, scaled by wear — not 13 more generations. Two reasons: 13 units × 3 candidates
is real money for a state the client cannot currently select, and a discrete "worn" sprite would
pop. Recorded here as the design, owned by a renderer lane.

**AD-40 · Doors.** `door` (base, closed) plus **`door@open`**, which is new. `matte.js`'s
loud-pixel census names procedurally-painted open doors as 680 of the 1,815 remaining loud
pixels on the deck, because `procedural.js paintDoor` fills them from the semantic palette —
there is no open-door sprite. One authored unit removes the single largest remaining source of
environment chroma. Selecting it is a renderer change (same shape as the floor/wall states).

**AD-41 · Furniture** (`bed`, `table`, `chair`, `medbed`, `medcab`, `locker`, `desk`, `plant`)
follows AD-37 with a softer register: fabric, worn edges, personal objects. Furniture is where
the *warm rooms* read at object scale — a folded blanket, a mug — but at ≤ 2 objects per sprite
and always at ≥ 20 px (AD-16). `bed` currently scores G-DET 40.1: the quilting, the piping and
the reading-light glow are three detail systems where the reference would have one.

---

## 12. Crew

**AD-42 · The crew are the best of our set. They are not at parity, and they are not exempt.**
*(Restated 2026-07-22. The first draft said "already close — do not redesign them", on the
strength of a comparison that was not like-for-like; see §1.3.)*

On the same ground at the same figure height, our crew carry **about twice** a PA guard's
detail energy (guard +5.0 to +8.4 over its floor; ours +11.1 to +17.6). Against the AD-21
gates, **four of the nine units pass all three measurable gates today** and five do not:

| unit | G-DET (6–15) | G-COL (≤120) | G-LIT (≥+8) | |
|---|---|---|---|---|
| `pawn_b` | 12.9 | 63 | +30.9 | pass |
| `pawn_c@f0` | 14.0 | 83 | +33.1 | pass |
| `pawn_b@f1` | 14.8 | 64 | +23.8 | pass |
| `pawn_c@f1` | 14.9 | 98 | +19.6 | pass |
| `pawn@f0` | 14.6 | 98 | **−3.4** | fails G-LIT |
| `pawn` | **15.7** | 75 | +14.6 | fails G-DET |
| `pawn@f1` | **15.8** | 63 | +13.2 | fails G-DET |
| `pawn_b@f0` | **16.4** | 88 | +15.8 | fails G-DET |
| `pawn_c` | **19.8** | **144** | +21.9 | fails G-DET and G-COL |

Four passes at the *bottom* of a band whose ceiling is a PA guard's flat-ground equivalent is
"borderline", not "at parity". **The crew go through the same gate as everything else.**

What is kept is **identity, not pixels**: the three characters Garvin accepted, their
silhouettes, their hair masses, their skin values, and the gender-matched `SliceVariant`
mapping in `GameSession.Portrait()`. The re-process to 256 (§14) is the first step and it is
free, but it is **not expected to bring the crew inside the gates** — a LANCZOS downscale does
not remove hair curls or freckles. Units that still fail after the re-process are regenerated
with the rest of the set, from prompts that keep the character description verbatim.

**And the re-process is not byte-preserving.** `run.py harmonize_set` pulls every chromatic
pixel toward the spec's `hue_centers_deg`, and this spec's centres ([215, 28, 198, 12, 150],
pull 0.45) are not the v2 set's ([187, 320, 268, 35, 130], pull 0.55). Measured on the three
idle raws, re-processing moves chromatic pixels by a **mean 21–22° of hue**, with **88–95 % of
them moving more than 10°**. The garment accents will visibly change colour — which is the
point of §2 abandoning the magenta/cyan set, but it must not be sold as "keeps what Garvin
accepted unchanged". It keeps the *people*; it re-colours their clothes.

**AD-43 · What the crew language is, so the re-process and any future crew stay on model.**
- One garment mass, one head mass, one hair mass. Legs read as a single tapering mass in idle
  and as two in the walk frames.
- **≤ 2 value steps per mass.** Reference: 65.6 % of a prisoner's uniform is one quantised
  colour; the top two cover 80.6 %.
- **Face = two eye marks and one mouth mark.** No nose shading, no brow, no ears, no freckles.
  `pawn_c` scores G-COL 125 and G-DET 15.3 — the highest of the family — because of hair curls
  and freckles, and both are exactly the detail that dies at the working zoom floor.
- **Identity is carried by three things only:** the garment accent hue, the hair silhouette
  mass, and the skin value. Never by detail.
- Gaze **level, three-quarter profile**, in the walk-frame perspective. (The v2 spec already
  fixed the "staring into the camera" defect; keep that wording verbatim.)
- Chroma per AD-26: garment accent source 45–70, everything else ≤ 22.

**AD-44 · Corpse** is the crew silhouette, prone, desaturated to source chroma ≤ 15 and lifted
nowhere — respectful, non-graphic, and it must not out-read a living crew member. It currently
has a **lighter** rim than its body (+27.5) and is an AD-6 reject.

---

## 13. The rejection checklist

A unit is rejected if **any** of these is true. Run in this order — the first four are free.

1. It contains a shadow, a vignette, a baked border, or text. *(AD-5, AD-8, AD-20)*
2. It is a free-standing sprite with no outline, or a tiling material *with* one. *(AD-6, AD-7)*
3. It fails the residual-key gate — white matte, or un-keyed green. *(AD-23)*
4. `seam_report` prints anything but `clean` on a `tileable` asset, on the swatch **or on any
   of its three 128 px rolls**. *(AD-22, AD-35)*
5. G-DET is outside its band: SPRITE 6–15, MATERIAL 6–16, **F1 PLATE 5–9**, DEBRIS ≤ 28.
   *(AD-21)* — **the primary gate**
6. G-COL > 120. *(AD-21)*
7. G-LIT < +8 by §1.7 method L, i.e. it is lit from the wrong side. *(AD-3, AD-21)*
8. G-INK fails: under 90 % ink at distance 1–6, or over 15 % ink at 11–16. *(AD-13, AD-21)*
9. A floor material's p95−p05 is outside 45–80, or p95−p50 < 18. *(AD-22)*
10. Its p50 sits outside the value band its class or material is assigned. *(§8, §9, §10)*
11. Its chroma exceeds its class's authoring window, or a device's *body* out-colours its
    *state element*. *(AD-26)*
12. **A pawn cell's opaque bbox is wider than 130 px or reaches below y = 219.** *(AD-18 —
    these are AD-18's own derived bounds; the first draft of this checklist said 146 px and
    y = 216, which agreed with nothing. AD-18's derivation is the authority: at `fill` 0.72 in
    a 256 cell, `bboxH` 184, `maxY` 219, `bboxW ≤ 130`.)*
13. Its wear is not countable per AD-30 — wrong number of events, or an event below the size
    floor. *(AD-30)*
14. It carries more than one emissive region, or an emissive shorter than 28 px. *(AD-38)*
15. It is drawn "tilted twenty degrees" and does not declare `rotatable: false`. *(AD-2)*
16. Downscaled to 40×40, you cannot say what it is. *(AD-16)*

---

## 14. Migration and sequencing

### 14.1 What has to be true before a single image is generated

**WP-7 (texture array + real asset files) must land before any art is INTEGRATED.**
`client/assets/sprites.g.js` is 1,051,199 bytes of inline base64 at 128 px; 256 px art lands at
an estimated 2.5–3.5 MB (AD-12). There is no point *shipping* art the client cannot carry. The
gate is on `integrate`, not on `process`: §14.3 step 1 deliberately runs `process` only, so
WP-7 has real 256 px art to be built against.

**WP-2 (wall autotiling) must land, or the wall art is unusable.** The two wall materials in
§10 are meaningless without the per-edge composition — `wallVertFace`'s single rotated strip
cannot draw a cap-plus-side stack.

**The `matte.js` supersession (§8.3) must be ready to land in the same commit as the floor
art.** It is two lines: the `floor` grade replacement and the `gradeFor` question — the latter
is already answered by authoring the variants as *states* (AD-27), so no `gradeFor` change is
needed at all if that is respected.

**Required work this direction depends on that does NOT exist today.** None of these is
optional and none is "already covered"; each is named with its file so a lane can scope it.

| # | what | where | why |
|---|---|---|---|
| R1 | `variantUris()` must load **every** key in `SPRITE_STATES[role]`, not just `broken`/`off`; `VARIANT` gains the new tags | `client/src/render/sprites.js`, `motion.js:269` | otherwise `grid`/`seal`/`weave`/`rime`/`side`/`open` are silently never loaded (AD-27) |
| R2 | terrain state selection: a floor tile picks F1–F5, a wall picks its mask + phase, a door picks `open` | `rasterplan.js resolveTerrain` / `resolveEntity` | `resolveTerrain` today returns one `terrain:wall` cell and no mask at all (AD-32) |
| R3 | `clampCam`'s zoom floor `0.5` → `0.25` | `client/src/render/camera.js:53` | `0.5` is a factor on `cam.tile`; at 256 it doubles the working zoom floor and invalidates AD-13 (§1.4) |
| R4 | `MAX_TILE_DEVICE_PX` 128 → 256 | `client/src/render/camera.js:25` | AD-9; un-parks HANDOVER open decision #1 |
| R5 | `CELL` 128 → 256 | `client/src/render/rasterplan.js:27` | it is a **separate constant** from `SPRITE_TILE`; `webgl2.js` uses it for `packAtlas` sizing, the per-cell `clip()` and `const T = CELL` |
| R6 | `packAtlas` `maxWidth` default 512 → ≥ 4096 | `client/src/render/webgl/atlas.js:101` | at 256 px cells with `ATLAS_PAD = 8` a shelf holds **one** cell (2×264 = 528 > 512), so the atlas grows to one row per cell |
| R7 | base-asset `_datauri` must be guarded by `.exists()` like the state/frame lookups already are | `art/spritegen/run.py:403` | otherwise `--stage process,integrate` on a partial work dir crashes; see §14.3 |

Renderer work that is *not* a prerequisite but that this direction assumes will exist:
WP-1's grounding shadows (AD-5), WP-3's light pools (AD-4), WP-5's `rooms` wire (AD-31),
WP-4's floor variants and wall-base AO.

### 14.2 What gets regenerated, what gets re-processed, what is left alone

| | units | cost | note |
|---|---|---|---|
| **Re-processed, $0** | the 9 pawn units (3 idles + 6 walk frames) | **$0** | Their 1024² raws survive on disk (verified 2026-07-22: nine files, all 1024×1024, plus 27 candidates). Copy `work/cyberpunk80s-128-v2/anchor_pawn*_raw.png` into the new spec's work dir and run `--stage process,integrate` only. This is the "partial-regen work-dir trick" the pipeline already documents. It is the reason AD-10 pins `api_image_size` to `"1K"`. **It re-colours them — see AD-42** — and it is not expected to bring them inside the gates. |
| **Regenerated** | 5 floor · 2 wall · 1 debris · 2 door · 1 corpse · 18 device-with-state · 8 device · 8 furniture = **45 units** | order **$20–40** at 3–4 candidates/unit | **`run.py --candidates` defaults to 4, so a default run is 45 × 4 = 180 billed images.** Pass `--candidates 3` for 135 if that is the intent. Confirm the current per-image price for `gemini-3-pro-image-preview` before running; do not trust this range. |
| **Left alone** | all 16 portraits (`portraits.g.js`), the console UI, every non-stage asset | — | Portraits are a separate spec with a separate style and a separate manifest that is append-only by construction. |

**Total new spec surface: 54 units, 45 of them billed, 180 images at the default candidate
count.**

**⚠ The raws are gitignored, so they exist only in the MAIN checkout.** `work/*/candidates`
and `work/*/*_raw.png` are not tracked; a worktree lane sees an empty `work/cyberpunk80s-128-v2/
candidates/` and no raws at all. The pawn re-process must be run from the main checkout, or the
raws copied into the lane's work dir by hand first.

**The step everyone forgets.** `run.py --stage integrate` writes only the SPRITEGEN block of
`hosts/web/Client.html`. `client/assets/sprites.g.js` — the file the shipping client actually
imports — is produced from that block by **`node client/tools/extract-sprites.mjs`**, which
must be re-run afterwards or the browser client keeps the old art while the legacy host page
shows the new. Neither file is hand-editable.

### 14.3 The order

*(Reordered 2026-07-22. The first draft put WP-7 first and the pawn re-process third, which
meant the first thing to exercise the 256 path was a large renderer change with **no 256 px
art to test it against**. The re-process now runs first and produces exactly that art, without
integrating it.)*

1. **Pawn re-process to 256, PROCESS ONLY.** `--stage process` on a work dir seeded with the
   nine 1024² raws. Costs $0, moves no pin, touches no client file, and produces nine real
   256 px PNGs that steps 2 and 3 can be built and eyeballed against. **Do not run
   `integrate` here** — see the trap below.
2. **WP-7** — texture array, real asset files. *(no art of its own; tested against step 1's
   output)*
3. **R3–R6** (§14.1) — `clampCam`, `MAX_TILE_DEVICE_PX`, `rasterplan CELL`, `packAtlas
   maxWidth`. One commit, renderer only, no art. This is the commit where 256 becomes real.
4. **WP-2 + R2** — wall autotiling, per-edge ink composition, mask + phase selection.
   *(prerequisite for the wall art)*
5. **Integrate the re-processed pawns** — the first pin move, on art whose *identity* is
   already accepted, cheaply, once.
6. **Floors** (5 units) **+ R1 + the `matte.js` supersession**, one commit. Biggest visible win
   per dollar: it fixes value, spread, room identity and the deck's median luma at once.
7. **Walls + debris + door** (5 units). Needs step 4.
8. **Devices and furniture** (34 units). The long tail; can be split across lanes by asset, but
   **one lane at a time may touch `client/test/golden/`**.
9. **WP-5 `rooms` wire + WP-4** — turns the four floor states on.
10. **Re-gate the crew** (AD-42). Any pawn unit still failing AD-21 after the re-process is
    regenerated here, with its character description carried over verbatim.

**⚠ Step 1 cannot run `integrate`, and the "$0 end-to-end proof" claim in the first draft was
not executable.** `run.py:403` builds the base URI map unconditionally —
`{a["role"]: _datauri(proc / f"{a['name']}.png") for a in spec["assets"]}` — for **every**
asset in the spec, with no `.exists()` guard (unlike the `states` and `frames` lookups below
it, which are guarded). On a pawn-only work dir it raises on the missing `anchor_floor.png`.
Either land **R7** (§14.1) first, or accept that step 1 proves `process` and not `integrate`.
This document assumes R7 lands with step 1.

### 14.4 The pins that move, and the traps

- **`SPRITE_URIS` moves.** `client/test/sprites.g.test.js:50` pins
  `7f9305d1e45aa7d2f045a1888d606c75fbcb76de4bad8f1238f2176750dcac2d`. Every step 3–6 moves it.
  Move it **deliberately**, once per step, with the reason written into the test file — that
  file already carries the precedent comment from the v2 pawn regen.
- **`accepted.png` — the style anchor — moves.** `art/screenshot-test/accepted.png` is the
  hue-histogram baseline for the advisory style-lock metric. This direction deliberately
  abandons the magenta/cyan cyberpunk hue set, so the style-lock distance **will** exceed its
  0.20 bar. Re-accepting is the human A/B ritual's call per `PROTOCOL.md` §2 — **not** a lane's
  unilateral decision. Expect one WARN in `ci.sh`'s advisory block per step until it is
  re-accepted; the metric can never fail CI.
- **`SPRITE_TILE` moves 128 → 256** in `client/assets/sprites.g.js`, which is generated — but
  it is **not** the only manual change, and the first draft was wrong to say it was. Four
  constants do not read from it and must be moved by hand, in the same commit:

  | constant | file | today | must become | consequence if missed |
  |---|---|---|---|---|
  | `MAX_TILE_DEVICE_PX` | `render/camera.js:25` | 128 | **256** | max zoom stays a 2× *downscale* of the new art (AD-9) |
  | `clampCam` zoom floor | `render/camera.js:53` | `0.5` | **`0.25`** | the working zoom floor silently doubles to 128 device px/tile and AD-13's 8 px outline derivation is void (§1.4) |
  | `CELL` | `render/rasterplan.js:27` | 128 | **256** | atlas cells stay 128 px; `webgl2.js` uses `CELL` for `packAtlas` sizing, the per-cell `clip()` rect and `const T = CELL`, so every sprite is packed and clipped at half size |
  | `packAtlas` `maxWidth` | `render/webgl/atlas.js:101` | 512 | **≥ 4096** | with `ATLAS_PAD = 8`, a 264 px cell means `2 × 264 = 528 > 512`, so **one cell per shelf**: ~50 live cells become ~50 rows × 264 ≈ 13,200 px tall, rounding to a **16384²** texture |

  `cam.tile` does read `SPRITE_TILE`, which is exactly why the `0.5` factor is dangerous: it is
  a multiplier on a number that just doubled.
- **The golden trap, restated because it has already been flagged once:** every visual step
  perturbs `client/test/golden/` and the `passes` fixtures, and `UPDATE_GOLDEN=1` will bake a
  regression silently. Never let two lanes regenerate the same golden. Eyeball
  `node art/screenshot-test/slice-shot.mjs` output before baking.
- **Determinism pins do not move.** None of this touches the sim. `26907c23d7e48a5c`,
  `401c9b96aff338a7` and `b31ba82f50cf395c` must all read unchanged after every step; if one
  moves, something crossed a lane boundary.

### 14.5 What this direction does not solve

- **The deck's median luma gap closes only partly.** §9's ladder puts a typical lit deck at
  112–132 against the reference's 122.4 full-frame p50 — comparable. But our frames also carry
  explored void at luma 5 and unlit cabins at 45–89, which the reference does not have, so the
  *frame* p50 will stay below it. That is the fiction (a dark derelict), not a defect, and the
  A/B ritual should be told so before it judges.
- **Per-soul crew accents.** Eight crew still share three deck accents, because `paintUnderglow`
  is baked at load and keys on the sprite key. Fixing it is draw-time renderer work
  (`matte.js` says so at `CREW_ACCENTS`), not art.
- **Nothing here makes the crew *do* more.** The "there is nothing to do" and "the dig is a
  boot-window economy" findings are sim design, in P3.
