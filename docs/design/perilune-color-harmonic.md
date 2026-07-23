# PERILUNE — THE COLOUR HARMONIC (console ↔ ship ↔ crew)

> **What this is.** The binding decision on how the three colour systems in PERILUNE relate:
> the **console chrome** (`perilune-game-ui.visual-spec.md`), the **ship stage**
> (`client/src/render/`), and the **crew**. None of those three documents currently references
> the others, so the relationship between them has never been written down. This document is
> that relationship, and it is the authority where they disagree.
>
> **What it is not.** It does not restate the console token palette (VS-1 owns that) or the
> stage's authoring rules (`perilune-art-direction.md` owns those). It rules only on the seam.
>
> **Status:** design. One decision (H-4) is a retraction of a claim made earlier the same day;
> the rest are new. Nothing in here has been implemented.
>
> **Provenance, and a warning about it.** Every number in §1 was measured on
> `art/screenshot-test/candidate.png` **re-captured 2026-07-22 after `69df9c0`** (the light
> pools + grounding shadows pass). An earlier evaluation the same day measured the frame
> captured at 00:51 — *before* `69df9c0` landed at 09:25 — and drew three conclusions that do
> not reproduce. They are named and retracted in §5 rather than quietly dropped. **Anyone
> quoting a stage measurement must state which capture it came from.** `renderstats.json`
> tells you: the pre-lighting frames report `lightQuads` with no mesh.

---

## 1. The measured baseline (post-`69df9c0` capture)

Stage rect (264,46)–(2236,1256) of the 2560×1440 near frame.

| region | luma (median) | B−R | reading |
|---|---|---|---|
| explored void | 4.6 | +4 | true black |
| hull / fog mass | ~17–39 | −6 | graphite silhouette |
| wall band | 46.5 | +22.3 | cool |
| cabin floor (Dead) | 60.0 | +27.9 | cool |
| corridor floor (Powered, no pool) | 100.9 | **+37.1** | **strongly cool** |
| light pool core | 111.1 | **−8.1** | **warm** |

Whole-stage: mean luma **48.4**, mean B−R **+17.0**, and the hue census is

> **cool (B−R > 8): 66.2 % · neutral: 32.8 % · warm (B−R < −8): 1.0 %**

against a console whose four chrome zones measure mean luma 20.7–22.5 and B−R −6.0 to −6.9.

The project's own advisory gate already fails this. `art/spritegen/metrics.py` reports
**`style-lock hue-d 0.3602`** on the near frame and **`0.2721`** on the establishing frame,
against a bar of **≤ 0.20**. Both WARN. `lighting range` passes comfortably (4.29× near,
4.14× far), so this is specifically a *hue* divergence, not a contrast one.

---

## 2. The concept exists — and it is correct

**H-1 — The warm/cold split is the game's thesis, not an accident, and it is kept.**

The console is warm (`--amber-1 #cf7a33` on `--bg-void #0c0a08`) and the ship is cold. That
split says: *the warm layer is you, the cold layer is out there.* It is already written into
the copy — `CREW WATCH — 8 SOULS`, `[T] OPEN CHANNEL — TALK`, `READOUT`, `LIVE SPRITE FEED`
(`client/index.html:41,78,68,51`) — which frames the player as a person at a console seeing
the ship only through what its instruments report. The colour must not contradict the words.

**H-2 — Cold is a STATE, not the ship's constant. Warm means alive, powered, inhabited.**

This is already implemented and is the single most important fact about the current renderer:

```
client/src/render/lightfield.js:87   POOL_CORE   = [1.00, 0.995, 0.85]   // warm: blue −15%
client/src/render/lightfield.js:95   AMBIENT_LIT = [0.72, 0.92, 1.00]    // cool: red  −28%
```

with the header comment at `lightfield.js:85` stating the intent outright — *"warmth is spent
there and nowhere else."* The light pool measures B−R −8.1 inside a corridor at +37.1. **The
ship already gets warmer where it is alive.**

That gives the colour system an emotional arc it can carry for the whole game: a ship you are
restoring literally warms toward you as you restore it. A uniformly cold ship cannot do this,
because it has nowhere to go.

**H-3 — Crew are warm, and are the only thing on the stage allowed full chroma.**

Already ruled by `matte.js:154` (crew `sat: 1.8`, **no `chromaMax`**) and by the ceilings on
`struct` (45) and `prop` (50), which `matte.js:136,150` document as being set *at the mean
chroma of a graded pawn* precisely to keep the ratio in the crew's favour.
`perilune-art-direction.md:253` states the rule: saturation is spent on crew first.

The consequence for this document: **crew must not share the ship's hue.** Warm crew on a cool
ship rhymes them with the console — i.e. with the player — which is exactly the alliance the
fiction wants.

---

## 3. The defect: dosage, not direction

The concept is right and the balance is wrong. **1.0 % of the stage is warm.** The thesis of
H-2 is running at trace concentration, so the player reads "cold ship" as a constant rather
than "cold *because* dark" as a state.

**H-4 — `AMBIENT_LIT` spends too much chroma for too little luma.**

`AMBIENT_LIT = [0.72, 0.92, 1.00]` applies to *every powered tile* — the largest addressable
surface in the frame. It manufactures roughly `0.28 · N` of blue-minus-red on a neutral source
(≈ 32 at N = 115) while buying only ~11.8 luma of recess (0.986 → 0.883 × 115). That is the
whole "cool ship" reading purchased at a ~49-chroma swing against the warm pools, and it is
why the corridor sits at B−R +37.1 and why `style-lock hue-d` reads 0.36.

Shipped: **`AMBIENT_LIT = [0.92, 0.877, 0.83]`** (warm — see H-5's ruling that a lit room is
never cold), which preserves the luma recess exactly —

```
0.2126·0.92 + 0.7152·0.877 + 0.0722·0.83 = 0.8835   (unchanged)
neutral chroma: multiply B−R = (0.83−0.92)·N ≈ −0.09·N  →  WARM  (was +0.28·N cold)
```

— so `AMBIENT_LUMA_FLOOR` (`lightfield.js`, test-enforced) is untouched and the deck's p50 does
not move; only the hue turns, from a cold +0.28·N cast to a warm −0.09·N one. The ship stops
being a blue gel. *(An earlier draft proposed a merely-neutral `[0.84,0.895,0.95]`; the warm
value shipped instead, per H-5.)* Measured effect on the deck: whole-stage mean B−R **+17.0 →
−1.3**, cool pixels **66% → 7%**, and the wall band — the specific complaint — **+22.3 → −3.1**.

**H-5 — `LIGHT[1]` is WARM-DARK: an unlit room is a lamp-off room, not a cold vacuum.**

*Decided 2026-07-22 (Garvin): "the walls are cold and the ship does not need to be cold."* The
Dead overlay was the ship's largest remaining cold mass once the lit floors warmed (H-4), and
it is now **`rgba(58,42,30,.58)`** — a warm-dark darkening (per-channel multiply 0.55 / 0.52 /
0.49, luma 0.52, so the value ladder is unmoved and only the hue turns). A neutral source now
exits a Dead room at chroma ~16 *warm*, versus the old +51 *cold*.

This **reverses a prior design contract** — `lighting.test.js` used to assert Dead "must go
BLUE… the light is cold." That test is rewritten to assert warm (red survives above blue). The
ruling that replaces it: **cold is reserved for the hull and the vacuum; a room is never cold,
only lit or unlit.** The three-state warmth gradient is now lamp (warmest, `POOL_CORE`) → room
(warm, `AMBIENT_LIT`) → unlit room (warm-dim, `LIGHT[1]`), with true cold only outside the hull.

Because H-5 landed *with* H-4 rather than after it, `POOL_CORE` was pushed a step warmer
(`[1.00,0.99,0.80]`, was `[_,_,0.85]`) so a lamp still reads as a distinct warm island over the
now-warm ambient — a gradient needs its peak to clear its floor.

**H-5a — wall warmth comes from the light layer, NOT the material grade.** The `struct` `tint`
in `matte.js` is applied *after* the `chromaMax` clamp, so a warm tint there re-inflates a
just-clamped pixel back over the ceiling and lets a wall out-colour a crew member — defeating
H-3. `struct.tint` therefore stays near-neutral (`[1.0,0.99,0.99]`); all wall warmth is carried
by `AMBIENT_LIT` + `LIGHT[1]`, which apply uniformly and cannot break the ceiling.

**H-6 — Two documented facts about `LIGHT[1]` are wrong and must be corrected in place.**

1. `palette.js:47-49` asserts the canvas2d over-blend and the webgl2 multiply are "the
   identical expression". They are not — affine vs linear, equal only at dst = 255. At
   dst = 117 they differ by ~25 % (76.2 vs 61.0). `lighting.test.js:137` already concedes
   this ("parity is at the palette, not the pixel"). The mesh path fixed it by construction;
   the fallback still diverges while the comment claims it does not.
2. The "+51 chroma on a neutral" figure quoted at `palette.js:55-57` describes the
   **source-over** path only. Under the shipping multiply it is ~23. `matte.js:145-150`
   dropped `prop.chromaMax` 55 → 50 to fight a term twice its real size; once H-4 and H-5
   land, that ceiling should go back to 55.

---

## 4. The seam, the semantics, and the orphaned crew hue

**H-7 — One meaning gets one colour, on both sides of the canvas edge.**

The same grade currently ships two vocabularies:

| meaning | console | stage | delta |
|---|---|---|---|
| good | `--good #5aa77f` | `LensGood #3ee08a` | 2.7× saturation |
| warn | `--warn #cf7a33` | `LensWarn #ffb02e` | 13°, 1.5× value |
| bad | `--bad #c25a3f` | `LensBad #ff4d6a` | **21°, red → pink** |

The READOUT vitals bar and the lens wash can render the same CO₂ reading in two different
colours simultaneously. Resolve toward the console (it is spec'd and contrast-audited):
`LensGood → #6cc493`, `LensWarn → #e8934a`, `LensBad → #e07a5f`, `LensOk → #c7a24a`, and the
washes to VS-7's `rgba(90,167,127,.24)` / `rgba(207,122,51,.30)` / `rgba(194,90,63,.38)`.

**`LensCold #3ab4f0` is explicitly kept.** Cold is the one meaning that earns a cool hue, and
reserving it is the entire point of H-2.

**H-8 — The selection reticle is player-cursor language and stops being neon.**

`procedural.js:42,52` draw the cursor and reticle in `#2de2ff` with `shadowBlur 8` and a
3.2 rad/s pulse — against VS-15 ("no text-shadows… the neon glow era is over") and VS-60's
motion budget. The most-looked-at element on the deck is the last survivor of the superseded
cyberpunk skin. It becomes `--amber-3 #f2b563` with no blur: the cursor is *you*, and you are
the warm layer.

**H-9 — VS-6's crew hue reaches the map and the roster, or it should not exist.**

The per-crew hue is deterministic, tested, and currently reaches almost nothing: `crewHue` is
called only at `client/src/ui/hud.js:597,690`, both RELATIONS-view nodes. `visual-spec.md:95`
scopes it to "initials fallback backgrounds", and VS-34 renders an `<img>` whenever a portrait
resolves — all eight slice crew have portraits, so **the fallback never fires.**

Meanwhile the map cannot distinguish them at all: `glyphs.js:21` ships
`PAWN_ROLES = ['pawn','pawn_b','pawn_c']` — three sprites for eight souls — and the underglow
at `matte.js:284` keys on **sprite key, not cid**, so at least three pairs of crew are
pixel-identical on the deck, disc included.

The fix does not need new art and does not violate H-3 or AD-6: pass `cid` on the entity op
(`compose.js:111`) and stroke a 2-device-px silhouette rim in `crewHue(cid)` **after the light
multiply**, so neither `LIGHT[1]` nor `AMBIENT_LIT` can wash it. Re-key the underglow from
sprite key to cid. Then surface the same hue as a 3 px bar on the CREW WATCH row, so the map
and the roster agree. VS-34 must be amended: the hue renders *with* a portrait, not only in
its absence.

**H-10 — Dead palette entries are removed, not left commented as if load-bearing.**

`palette.js:19` defines `FG[C.Floor] = '#443d5e'` and `FG[C.Wall] = '#6f6892'`. Neither is read
anywhere in `client/src` outside that line (verified by grep). They are a ghost of the
superseded cyberpunk skin, and `perilune-art-direction.md:262` already ruled that direction
superseded. `procedural.js:19` carries a third, different floor colour (`#242038`). Three
floor colours ship and disagree; the one that renders is none of them. Delete the dead two and
reconcile the third, or the next author inherits a superseded direction from a confident
comment.

---

## 5. Retracted — claims that did not survive the re-capture

Recorded so the error is not re-derived. All three came from measuring the 00:51 frame.

- ✘ **"The walls sink below the hull mass (luma 26–34 vs 39)."** Does not reproduce. The wall
  band measures **46.5**, comfortably above hull. No wall-value work is needed.
- ✘ **"The value ladder is bimodal — nothing between luma 80 and 100."** Does not reproduce.
  That band is **6.5 %** populated, and the ladder gained a fifth rung (the pool at 111).
  `69df9c0` did this; the §8.3 floor-grade rewrite is *not* urgent and may not be needed.
- ✘ **"The ship has no colour concept."** False. It has one, authored in `lightfield.js` and
  stated in its header comment. The defect is dosage (H-4), not absence.

What *did* survive, unchanged: the hue divergence (§1), the semantic double-vocabulary (H-7),
the orphaned crew hue (H-9), and the dead palette entries (H-10) — all of which are file-level
facts that no re-capture can move.

---

## 6. Order of work, and what it costs

Colour first, identity second, light last — because H-5 depends on H-4 and H-9 depends on
nothing.

| # | Change | Files | Moves |
|---|---|---|---|
| 1 | **H-4** `AMBIENT_LIT` → `[0.84, 0.895, 0.95]` | `render/lightfield.js:95` | `lightfield.test.js` asserts the literal |
| 2 | **H-7** bind the semantic ramp | `render/palette.js:23-24,29-31` | node tests only |
| 3 | **H-8** de-neon the reticle | `render/procedural.js:42,52` | node tests only |
| 4 | **H-10** delete dead entries | `render/palette.js:19`, `procedural.js:19` | none |
| 5 | **H-9** crew hue to map + roster | `compose.js`, `canvas2d.js`, `webgl/`, `matte.js:267-291`, `ui/hud.js`, VS-6/VS-34 | node tests; **wire carries `cid`** |
| 6 | **H-5/H-6** `LIGHT[1]` + correct the two comments | `render/palette.js:47-62`, `matte.js:150` | `lighting.test.js:33` asserts the literal |

**No sim determinism pin moves.** `26907c23d7e48a5c` and the slice golden `b31ba82f50cf395c`
are glyph/state hashes and carry no RGB; grading runs at sprite-load (`sprites.js _process`),
so none of this is an art regeneration. The screenshot metrics are advisory (`ci.sh:36`,
`|| true`) — but `style-lock hue-d` should be watched down toward its 0.20 bar as 1–2 land,
and that is the objective read on whether this document worked.

Item 5 is the only one that touches the wire, and the only one with a real design question
left in it (rim vs. underglow vs. both). Items 1–4 are hex-level and reversible.
