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
either.** A 48 px window on a PA guard carries **1,775–1,824 unique RGB values**; a 128 px
window on PA's yard floor carries **8,744**. Our pawns carry 1,744 / 1,662 / 2,378 (the
quoted ~2,285 is in family but is not any of them) and our debris carries 9,724 of 16,384
pixels ✔ (that one is exact). Both images are continuous-tone and resampled; counting exact
RGB triples counts the resampler, not the art.

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

**The crew are the part that already works.** Measured at PA's pitch, the strongest single
discriminator is mean |Laplacian| of luma (detail energy per pixel):

| asset | ours @40 px | PA @40 px | verdict |
|---|---|---|---|
| `pawn` / `pawn_b` / walk frames | **9.3 – 12.2** | guards 8.8 · 9.8 · 13.7 | **at parity** |
| `pawn_c` | 15.3 | prisoner 18.6 | at parity |
| `chair`, `locker`, `plant`, `light`, `table`, `medcab`, `terminal` | 10.9 – 19.8 | — | acceptable |
| `scrubber`, `solar`, `fabricator`, `bed`, `door`, `radiator`, `ladder` | **33.6 – 54.4** | — | **2.4–3.9× over** |
| `debris` | **61.2** | — | **4.4× over** |
| `floor` | **3.0** | yard 9.2 · shower 15.7 · canteen 6.5 | **fails the other way** |

So the money does **not** go on redrawing the crew. It goes on floors (too flat, too dark,
one material for fifteen room types), on walls (no cap/side/corner structure at all), and on
the machine/furniture/debris family (2.4–4.4× the reference's detail density).

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
| screenshot rig near frame (`slice-shot.mjs zoom: 72`, **`--force-device-scale-factor=1`**) | **72** | 1.8× minify |
| screenshot rig establishing frame (`zoom: 32`, dpr 1) | **32** | 4× minify |

Which settles the resolution question: **our normal working view already draws 64–128 device
px per tile — 1.6× to 3.2× the reference's own 40 px — and still reads worse.** Resolution is
not the defect. It never was. See §5 for why we nevertheless move to 256.

### 1.5 ✔ What survived measurement

- **Cohesion is real, not AI slop.** One light direction holds in 38 of 48 sprites (median
  top-left-minus-bottom-right luma +17.1). Alpha edges are clean: 2.55 % semi-transparent
  pixels, mean, per cell.
- **The stage is far flatter and darker than the reference** — deck luma p50 41 vs 122.4,
  lit-floor p50→p95 spread 13 vs the reference's 44 (yard) / 45 (shower).
- **Only the 9 pawn units retain 1024² sources on disk**
  (`work/cyberpunk80s-128-v2/anchor_pawn*_raw.png` — 3 idles + 6 walk frames, all 1024×1024
  RGBA, plus 27 candidates). Every other asset exists only as 128 px processed output.

### 1.6 NEW — four defects the received diagnosis missed

1. **Ten of forty-eight sprites are lit from the wrong side.** `chair` −46.1, `medcab` −65.1,
   `recycler` −15.1, `pawn@f0` −11.1 (top-left minus bottom-right luma; negative = lit from
   the lower right). The "one light direction" property is a majority, not an invariant.
2. **Twenty-one of forty-eight sprites have no silhouette outline.** Rim luma (pixels
   touching transparency) minus body median luma: 27 sprites are ≥8 darker at the rim, 21 are
   not — `battery` −1.2, `door` −2.3, `desk` −3.8, `debris` +2.2, `wall` −7.5, `corpse`
   **+27.5** (a *lighter* rim). Whatever "our outlines are uniform" meant, it is not true of
   the shipped set.
3. **Three sprites ship a residual matte.** `anchor_scrubber@broken.png` is **6,833 white
   pixels of 10,000 opaque** — the sprite is mostly a white square; `anchor_reclaimer@off.png`
   4,225; `anchor_fabricator@off.png` 687. The runtime border-flood in `matte.js scrubMatte`
   rescues these in play, which is exactly why nobody noticed.
4. **Two sprites ship un-keyed GREEN, which `scrubMatte` provably cannot clear** (it only
   walks near-white low-chroma pixels): `anchor_fabricator@broken.png` 88 px,
   `anchor_fabricator@off.png` 13 px, border-connected and visible in play. Green residue on
   `growbed` (1,139) and `plant` (672) is legitimate — those are foliage keyed on magenta.

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

**AD-3 · Light.** One key light, from the **upper left**: azimuth 315° in plan, elevation 55°.
Every form's light step is on its upper-left, every shade step on its lower-right, in every
sprite, in every state, in every frame. Measured as `median(luma | x+y < 0.85·w) −
median(luma | x+y > 1.15·w)`, an on-model sprite scores **≥ +8**; today ten sprites score
negative (§1.6.1) and those are rejects.

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

Why not a renderer dilate (WP-1's "bake a dilated dark rim into each atlas cell"):
- A dilate produces one uniform rim. Real inking varies — heavier where the form turns away
  from the light, lighter on a thin element, and it inks **internal** edges (the line between
  a pawn's arm and its torso; between a machine's cap and its side). The reference does all
  three; a dilate can do none.
- A dilate on a thin feature *closes* it. A cable, a chair leg, a ladder rung at 8 px wide
  becomes a solid dark lozenge.
- It fights WP-0. The atlas already carries `ATLAS_BORDER = 4` px of **edge-replicated**
  pixels per cell. Dilating into that gutter, or replicating a dilated rim outward, is
  precisely the mip-3 halo case WP-0 documented at `ATLAS_BORDER`.
- An art outline is a property of a committed PNG — checkable by §7's gates, pinned by
  `sprites.g.test.js`. A renderer dilate has to be re-proved in both executors and perturbs
  every golden.

**Interim, until the new art lands:** WP-1's dilate is a defensible stopgap for the 21
outline-less sprites in §1.6.2. It must be **removed for entity cells** in the same commit
that integrates the new art, or every sprite gets a double rim.

**AD-7 · Edge outlines on TILING TERRAIN are RENDERER.** Wall, floor, debris.
A terrain tile's exposed edges are a function of its 8-bit neighbour mask, which only the
renderer knows. Baking them means 47 variants per material. Drawing them is one dark quad per
exposed edge. **The art therefore supplies terrain as outline-free, seamlessly tileable
material** — and the *side face* of a wall, which is a material and not a line, is art (§10).

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
256 costs **$0**. This one setting saves roughly $4–7 of generation and, more importantly,
keeps the three crew identities Garvin already accepted rather than rolling the dice on them.

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

> **The art outline is 8 px at 256 source (7–9 tolerated) = 3.1 % of tile.**
> 2 device px at the working zoom floor, 8 device px at 1:1.

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
- The narrowest limb or strut of a silhouette is **≥ 20 px**.
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

**AD-21 · The measured gates.** All three are computed on the **processed 256 px PNG,
composited over mid-grey `#585460`, then LANCZOS-downscaled to 40×40** — the reference's own
pitch, which makes every threshold directly comparable to a number measured on the reference.

Classes for the gates are **authoring kinds**, not `matte.js` grade classes:
**MATERIAL** = the 5 floors + the 2 walls (everything `"tileable": true` except debris) ·
**DEBRIS** = the wreck field alone · **SPRITE** = every free-standing unit (crew, corpse,
devices, furniture, door).

| gate | kind | threshold | reference scores | our current worst |
|---|---|---|---|---|
| **G-DET** mean \|Laplacian\| of luma | SPRITE | **8 ≤ x ≤ 22** | guards 8.8 / 9.8 / 13.7, prisoner 18.6 | ladder 54.4, radiator 48.7, door 41.6 |
| | MATERIAL | **6 ≤ x ≤ 16** | yard 9.2, shower 15.7, canteen 6.5 | floor **3.0**, wall 20.7 |
| | DEBRIS | **≤ 28** | — | 61.2 |
| **G-COL** quantised colours (`RGB//16`) | all | **≤ 112** | 22 · 27 · 31 · 40 · 49 · 102 · 111 | ladder 180, growbed 170, door 162 |
| **G-LIT** top-left minus bottom-right median luma | SPRITE only | **≥ +8** | — | medcab −65, chair −46 |

G-DET is the primary gate: it is the one measurement on which the reference and our best
sprites agree and our worst sprites are 2.4–4.4× out. It is a **band**, not a ceiling — a floor
scoring 3.0 fails for being a dead plate just as surely as debris scoring 61 fails for being
noise. Note that the shipped `wall` scores 20.7 and fails as a MATERIAL while it would pass as
a SPRITE: that is not a technicality, it is exactly the diagnosis — it was authored as a
decorated object, which is why it cannot autotile.

**AD-22 · The two tileable-material gates.**
- **Seam.** `run.py seam_report` must print `clean` (mean edge delta < 12) for every asset
  marked `"tileable": true` — on **both** axes for the five floors, the wall cap and debris,
  and on the **L/R axis only** for `wall@side`, which tiles horizontally by design (§10).
- **Value spread.** Every floor material's own luma distribution must satisfy
  **45 ≤ p95−p05 ≤ 80** and **p95−p50 ≥ 18**. Reference: yard 71 / 44, shower 71 / 45. Ours
  today: **11 / 9** — this single gate is the "one mud" fix, and no amount of grading
  substitutes for it (see §8.2).

**AD-23 · Residual-key gate.** Zero opaque pixels may satisfy `min(r,g,b) ≥ 190 ∧
max−min ≤ 40` on a border-connected component (white matte), and zero opaque pixels may satisfy
`g > 120 ∧ g > 1.5r ∧ g > 1.5b` **except** on assets that declare their own `key_color`
(foliage). Three shipped sprites fail the first and two fail the second (§1.6.3–4). The runtime
`scrubMatte` net stays as a net; the source must not need it.

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
same applies to the wall states (§10). This keeps the whole system inside append-only
machinery that already ships and is test-covered.

---

## 9. Floor materials — room identity by floor alone

Five materials cover all fifteen `RoomType` values (`sim/Sim.Core/Rooms/RoomType.cs`). Each is
a seamless 4-way tileable 256×256 swatch, outline-free (AD-7), authored at its stated value.

| id | name | RoomTypes | p50 source luma | unlit (×0.53) | hue | chroma | signature |
|---|---|---|---|---|---|---|---|
| **F1** | **PLATE** | None, Corridor, Storage, **Bridge, Command** | **112** `#6d7077` | 59 | 215–225° | ≤ 10 | The default and the value anchor. Big 1×1 graphite deck plates, a recessed bolt at each plate corner, a shallow drainage channel every 3rd plate. Neutral. |
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
frost). Their fictions never adjoin, so this is safe — but it is stated so that two artists do
not each solve it differently.

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

**AD-30 · Wear is the signature and it lives in the floor.** Every material carries wear:
scuffed traffic lanes, a bolt gone, a patch of a *different* material welded in, a stain. Wear
is drawn with the material's own three values — never with a new hue, never with noise, never
below the shade step. It is what makes 45–80 of value spread (AD-22) rather than dither.

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
| **cap material** | `wall` (base) | full 256×256 swatch, seamless in **all four** directions | the whole cell, or its top 136 px | The lit top face of the hull. No outline, no lip, no border, no side face. |
| **side material** | `wall@side` | full 256×256 swatch, seamless **left↔right** | a 256×104 window of it | The vertical face revealed by the 20° camera tilt. No outline, no top or bottom lip. |

Both are authored as full square swatches — a generator draws a square well and a strip badly.
The renderer samples the window it needs. The horizontal seam is the only one that matters for
`wall@side`; `seam_report`'s L/R number is the gate, its T/B number is advisory for that unit.

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

1. Fill the cell with **cap material**, sampled at the tile's *world* coordinates so adjacent
   wall tiles continue one another and the run has no repeat rhythm.
2. For each **open edge** (N / E / S / W): draw a 16 px ink band along that edge, inset into
   the wall tile.
3. For each **corner where both adjacent edges are wall but the diagonal is open** (an inner
   corner): draw a 16×16 ink notch at that corner. Zero to four per tile — this is the case
   that cannot be expressed by rotating a whole-tile piece, and it is why the composition is
   per-edge rather than per-piece.
4. If **S is open**: replace the bottom 120 px with the seam ink (12 px) + **side material**
   (104 px) + bottom ink (16 px), the side material also sampled at world x so a horizontal run
   is continuous.

This composes all 256 masks, hence all 47 distinct appearances, from 2 authored units and
**no wire change** — the client already holds the glyph grid, and `glyphs.js openAt` already
defines "open" correctly (fog counts as solid, off-grid counts as open).

**AD-35 · What the art must therefore guarantee.**
- Both materials tile seamlessly at **world** offsets, not just at cell offsets — no feature
  may sit at a fixed position within the 256 cell. `seam_report` must read `clean`.
- Neither carries any edge treatment, lip, bevel, border or vignette. AD-8 rejects it.
- The cap material's plate rhythm must be **coarser than one tile** — a plate joint every
  ~1.5 tiles — so a long wall run does not read as a checkerboard. (This is the failure mode of
  the shipped `anchor_wall`, which is authored to tile *horizontally only* and is rotated 90°
  for vertical runs by `wallVertFace`.)
- The side material's own vertical gradient is at most **two flat steps** across its 104 px:
  it is a face in shadow, not a cylinder.

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

**AD-42 · The crew are already close — do not redesign them.** Measured at the reference's
pitch, `pawn` scores 11.8, `pawn_b` 9.3, walk frames 9.8–12.2, against reference guards at
8.8–13.7. The three identities Garvin already accepted (and the gender-matched
`SliceVariant` mapping in `GameSession.Portrait()`) are kept. They are **re-processed** from
their surviving 1024² raws to 256, not regenerated (§14).

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
3. It has residual white-matte or un-keyed green pixels. *(AD-23)*
4. `seam_report` prints anything but `clean` on a `tileable` asset. *(AD-22)*
5. G-DET is outside its band. *(AD-21)* — **the primary gate**
6. G-COL > 112. *(AD-21)*
7. G-LIT < +8, i.e. it is lit from the wrong side. *(AD-3, AD-21)*
8. A floor material's p95−p05 is outside 45–80, or p95−p50 < 18. *(AD-22)*
9. Its p50 sits outside the value band its class or material is assigned. *(§8, §9, §10)*
10. Its chroma exceeds its class's authoring window, or a device's *body* out-colours its
    *state element*. *(AD-26)*
11. A pawn cell's opaque bbox is wider than 146 px or reaches below y=216. *(AD-18)*
12. Downscaled to 40×40, you cannot say what it is. *(AD-16)*

---

## 14. Migration and sequencing

### 14.1 What has to be true before a single image is generated

**WP-7 (texture array + real asset files) must land first.** `client/assets/sprites.g.js` is
1,051,199 bytes of inline base64 at 128 px; 256 px art lands at an estimated 2.5–3.5 MB
(AD-12). There is no point generating art the client cannot ship. This is the hard gate.

**WP-2 (wall autotiling) must land, or the wall art is unusable.** The two wall materials in
§10 are meaningless without the per-edge composition — `wallVertFace`'s single rotated strip
cannot draw a cap-plus-side stack.

**The `matte.js` supersession (§8.3) must be ready to land in the same commit as the floor
art.** It is two lines: the `floor` grade replacement and the `gradeFor` question — the latter
is already answered by authoring the variants as *states* (AD-27), so no `gradeFor` change is
needed at all if that is respected.

Renderer work that is *not* a prerequisite but that this direction assumes will exist:
WP-1's grounding shadows (AD-5), WP-3's light pools (AD-4), WP-5's `rooms` wire (AD-31),
WP-4's floor variants and wall-base AO.

### 14.2 What gets regenerated, what gets re-processed, what is left alone

| | units | cost | note |
|---|---|---|---|
| **Re-processed, $0** | the 9 pawn units (3 idles + 6 walk frames) | **$0** | Their 1024² raws survive on disk. Copy `work/cyberpunk80s-128-v2/anchor_pawn*_raw.png` into the new spec's work dir and run `--stage process,integrate` only. This is the "partial-regen work-dir trick" the pipeline already documents. It is the reason AD-10 pins `api_image_size` to `"1K"`. |
| **Regenerated** | 5 floor · 2 wall · 1 debris · 2 door · 1 corpse · 18 device-with-state · 8 device · 8 furniture = **45 units** | order **$20–40** at 3–4 candidates/unit | Confirm the current per-image price for `gemini-3-pro-image-preview` before running; do not trust this range. |
| **Left alone** | all 16 portraits (`portraits.g.js`), the console UI, every non-stage asset | — | Portraits are a separate spec with a separate style and a separate manifest that is append-only by construction. |

**Total new spec surface: 54 units, 45 of them billed.**

**The step everyone forgets.** `run.py --stage integrate` writes only the SPRITEGEN block of
`hosts/web/Client.html`. `client/assets/sprites.g.js` — the file the shipping client actually
imports — is produced from that block by **`node client/tools/extract-sprites.mjs`**, which
must be re-run afterwards or the browser client keeps the old art while the legacy host page
shows the new. Neither file is hand-editable.

### 14.3 The order

1. **WP-7** — texture array, real asset files. *(prerequisite, no art)*
2. **WP-2** — wall autotiling, per-edge ink composition. *(prerequisite for the wall art)*
3. **Pawn re-process** — the free one. Proves the 256 pipeline end to end for $0 and moves
   the pins once, cheaply, with art whose look is already accepted.
4. **Floors** (5 units) **+ the `matte.js` supersession**, one commit. Biggest visible win per
   dollar: it fixes value, spread, room identity and the deck's median luma at once.
5. **Walls + debris + door** (5 units). Needs WP-2.
6. **Devices and furniture** (34 units). The long tail; can be split across lanes by asset, but
   **one lane at a time may touch `client/test/golden/`**.
7. **WP-5 `rooms` wire + WP-4** — turns the four floor states on.

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
- **`SPRITE_TILE` moves 128 → 256** in `client/assets/sprites.g.js`, which is generated. Every
  consumer reads it from there (`camera.js` takes `cam.tile` from it), so the only manual change
  is `MAX_TILE_DEVICE_PX` 128 → 256, and that is a deliberate, separately-justified decision
  (AD-9) that also un-parks HANDOVER's open decision #1.
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
