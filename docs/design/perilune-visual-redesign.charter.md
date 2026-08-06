# PERILUNE VISUAL REDESIGN — charter (2026-08-04, owner-directed)

> Owner direction (2026-08-04, verbatim intent): "revise the complete visuals to make the
> game visually more unique, and make it easier to communicate the emotional stories and
> decisions the user has to make." Spec = the owner's two Claude Design documents, imported
> verbatim at `design-import/Perilune Game.dc.html` (ship level, room zoom, MOSS, crew) and
> `design-import/Perilune Fittings.dc.html` (30 buildable fittings). THE .dc.html MARKUP IS
> THE SPEC — the Vorsatz DS bundle is voice/inspiration only (the docs use ZERO of its
> tokens; every value is a literal).

This charter was produced from (a) a full client-visual-layer audit and (b) a complete
read + headless-Chrome render of both design docs. Where it states a measured value, it was
measured on this tree at `8186cad`.

> ⭐ **THE STYLE REFERENCE, ADDED 2026-08-05: `docs/design/perilune-art-style.md`.** This charter is
> the *decision record* — what was ruled, in which package, and why. That file is the *map*: the
> palette, the projection, the pawns' hand and the adopted `strong` sketch treatment stated together
> with `file:line` for every claim, plus the checklist for adding a piece. Read it before drawing.

## 1. The design language (the new dialect, binding for all packages)

- **Paper & ink**: page ground `#E7E0D2`; plate/paper `#EBE4D1`; plate border `#C6BBA2`;
  hairline `#CFC3A9`; inset panels `#DED6C2`/`#DCD3BE`/`#E1D9C5`; ink `#14120F` (all
  strokes, dark fills, selected-row plate); body serif ink `#2E2A23`; prose `#4E463A`;
  annotation `#3A342A`; micro-label `#6B6252`; section label `#8A7F6C`; faintest `#A79C86`;
  offline/disabled `#8A8272`; link amber `#B0662A` (hover `#8A4E1E`).
- **ONE accent — oxblood `#7B2C22`** — attention, faults, queued orders, emotional beats.
- **THE DASH DIALECT (ruling E3, adopted)**: colour alone no longer distinguishes
  order/fault/rubble. New rules: `stroke #7B2C22 stroke-dasharray "8 5"` = QUEUED ORDER
  (the design's bench ghost); solid `#7B2C22` = ATTENTION/FAULT; dashed `#14120F` "6 5" =
  UNBUILT/PLANNED; `#8A8272` = OFFLINE; no accent = nothing to see. Tests that today assert
  hues (`room-model.test.js:920–938` order ring `#f2b563`, `blocked-overlay.js:30–35` fault
  `#c25a3f`) move to assert the dash+oxblood dialect IN THE SAME COMMIT — never weakened,
  translated.
- **Type**: Instrument Serif = display/headlines/body prose/italic captions & annotations.
  Space Mono = ALL micro-labels, numbers, stats, MOSS body (uppercase, letter-spacing
  .06–.24em). Inter NOT shipped (ruling E9) — no screen uses it.
- **Hatch `#fh`**: 45°, 7px period, `#14120F` at 0.28 over `#EBE4D1` — every oblique side
  face. Emitted as ONE shared namespaced def per surface root (id-collision pin).
- **Cabinet oblique projection (measured, exact)**: scale s px/cm (plate 1.00 · room 0.95 ·
  catalogue 0.85); depth offset for depth d cm = `(+0.4·s·d, −0.6·s·d)`. Round objects draw
  level (ellipses, no heading). Fittings = 3 faces: front `#EBE4D1`, side `url(#fh)` (or
  flat `#E1D9C5` at thumbnail scale), top `#EBE4D1`, stroke `#14120F` weighted 0.9–2.2 by
  mass.
- **Halo text**: `stroke #EBE4D1 stroke-width 3.4 paint-order stroke` for labels over art.
  Glyphs not in Space Mono (⚠/△/blocks) are drawn as paths, never font glyphs (de-DE /
  fallback-advance trap, `.c-bar` width pins).
- **Pawns**: each stroke path emitted TWICE — knockout halo `#EBE4D1` at ink width **+3.0
  (additive, measured from the doc: 1.4→4.4, 1.0→4.0)**, then ink `#14120F` — via a
  `ghost()` wrapper over ONE path list. Same generator serves portrait scale and board
  scale.
- **Engraved cell gauge**: filled = `background #14120F`; empty = `inset 0 0 0 1px
  rgba(20,18,15,.4)` + 45° micro-hatch. 8 cells (ship gauges) / 10 cells (MOSS load).
- **Animations**: `j4drift` starfield (ink dots on paper — retint existing `plnStarDrift`),
  `j4sweep` radar 7s, `j11blink` caret (steps). All behind `prefers-reduced-motion`.

## 2. Adopted rulings (defaults chosen per binding precedent; owner may override)

| # | ruling | adopted default |
|---|---|---|
| E1 | design nav shows 5 tabs; WORK & MOSS tabs missing | KEEP SIX TABS (`plate · build · crew · ties · chronicle` idiom, rename RELATIONS→TIES, keep WORK — OD-H's opt-in surface — and MOSS — OD-N's door). Five-tab row = incomplete sketch, not a deletion. |
| E2 | design has no build palette | KEEP the 21-tool palette + ORDERS palette, restyled in the new idiom (mono uppercase, engraved cells, oxblood armed state). `palette-honesty` exists because live play broke without it. |
| E3 | one oxblood replaces order/fault/caution/rubble hues | the DASH DIALECT above; tests translated same-commit. |
| E4 | every explanation affordance dropped in design | DROP NONE. Re-house: why-line → oxblood serif sentence in the compartments column; blocked/D5 badge → oxblood dashed outline + leader label (bench-ghost idiom); alerts bar → the `leak` row idiom; `▾ N MORE` kept. LENS island: kept but demoted (design's own `lens` prop suggests it was considered); may become a quiet row of mono toggles. |
| E5 | MOSS loses CRT + five of six views | RETINT, KEEP EVERY VIEW. Ink-on-paper skin (sprocket gutter, engraved load cells, solid-ink selected row, serif advisory, oxblood △ as path), transcript/fault-log/detail/pod-bay/PROGRAM/no-link states all survive. CRT overlay deleted. |
| E6 | plate is a fixed 4×2 grid for one authored ship | grid DERIVED from room count (`cols=ceil(n/2)` capped, dashed-tile treatment for empties); hull outline static art sized to grid. Filed: design does not generalise as drawn. |
| E7 | internal fixture contradictions (souls counts, day stamps) | canonical fixture = day 41 / three aboard; `#cellh` def dropped (its job is the CSS micro-hatch). |
| E8 | 14 of 30 fittings visually unfinished | FIX WHILE PORTING against the six defect classes (§4); reviewer diffs rendered result vs doc. Never copy the sink's placeholder tap (it leaks into Screen 02). |
| E9 | Inter Variable | not shipped; serif + mono only (2 new woff2 + existing Space Mono pair). |
| E10 | two-pass pawn halo doubles path count | `ghost()` wrapper, one path source; MEASURE repaint at 10 Hz before merging P5. |
| E11 | `aboard`/`compartments` prose needs data that doesn't exist | P7 is a SIM+WIRE package gated on M4 (mood/Persona). UI lanes must NOT invent sentences client-side. Filed, not this wave. |

## 3. Packages

Order: **A (=P0+P1)** → **P2 fittings** ∥ **P5 pawns** → **P3 roomzoom** ∥ **P4 overview**
∥ **P6 moss** → (filed: P7 story panels. P2b — the wrecked-twin restyle and the uncovered-row
restyle — is CLOSED, 2026-08-06.)
Every package: own worktree off `lane/visual-redesign`, one Opus implementer + one
independent reviewer, full `./ci.sh` at final commit, merge back by the integrator with
TRAPS-8 re-gate (merge lane→package first, re-run, then ff).

### A — FOUNDATION (paper tokens · fonts · stylesheet split · oblique kit)
Files: NEW `client/src/theme/paper-tokens.js` + `paper.css` (warm-tokens/warm.css retired
behind re-exports); `client/styles.css` → split `client/styles/{base,overview,roomzoom,moss,console}.css`
+ `@font-face` (copy instrument-serif latin+ext woff2 from design-import into
client/assets/fonts/; keep Space Mono pair; author our own @font-face — NEVER copy the DS
fonts.css, it 404s 7 subsets); `client/index.html` links; `client/src/items/helpers.js`
gains `PAPER/INK/ATTEND` colour exports + `paintOrder` on `text()`; NEW
`client/src/render/oblique.js` (`depth()`, `box()`, `room()`, shared `#fh` def helper,
halo-text, `ghost()`) + NEW `client/test/oblique.test.js`.
Tests moved: `warm-tokens.test.js` → `paper-tokens.test.js`; `overview-scene.test.js:547`
steel-tan literals; NEW mirror pin paper.css ≡ paper-tokens.js value-for-value (nothing
pins the mirror today). Beware: the SECOND `:root` block `styles.css:7–29` must not
survive as a shadow theme (its fallback hexes already disagree with warm.css).
Purity: oblique.js is a pure string module, rounds like `overview-scene.js:81 n(v)`
(2 dp, −0 normalised), no locale APIs.

### P2 — THE 30 FITTINGS (art)
Files: NEW `client/src/items/fittings.js` (30 builders on the oblique kit + helpers seam);
`items/index.js` registry; `items/glyph-map.js`; `items/wrecked.js` twins for NEW rows only;
retired rows in `objects.js`/`fixtures.js` per the mapping table (§4).
Registry math moves IN ONE COMMIT: `items.test.js` `ITEM_IDS.length` equality + class
census + `wrecked.test.js` 70-twin ledger + `device-sprite-coverage` (every projectable
glyph stays skinned — the ~23 uncovered device rows KEEP their old art (21 since 2026-08-05,
see FILED/P2b below); uncovered materials
(12)/resources (9) untouched). `items-model.test.js:286` badge ink literal moves to paper
values. Fix the 14 unfinished fittings per §4 defect classes.

### P5 — THE INK FIGURES
Files: `client/src/render/pawn-svg.js` (two-pass ghost, ink-on-paper, rim-light+shadow pin
re-expressed in the new idiom); `client/src/ui/panels.js` dossier retint only.
Tests: `pawn-svg.test.js`, `portraits.g.test.js` fallback silhouette, `zoom-pawn.test.js`
(P5 owns the SPRITE assertions; P3 owns PLACEMENT). Measure 10 Hz repaint (E10).

### P3 — LEVEL-2: THE ROOM CUTAWAY
Files: `roomzoom-view.js`, `room-model.js`, `client/styles/roomzoom.css`,
`blocked-overlay.js`, `mark-overlay.js`, `zone-overlay.js`, `accepts-row.js` (retints).
The cutaway: ONE svg via `oblique.room()` at s=0.95 — floor quad/back wall/hatched left
wall/dashed cut edges/0.2-opacity floor grid; in-SVG serif title + mono stat line
("SEATS 5 OF 3 ABOARD" idiom); door plates + halo labels; dimension arrows; queued orders
as oxblood dashed ghosts + leader + `NAME · N PARTS`; palette per E2; every dropped
affordance re-housed per E4. Tests: `room-model.test.js` (hex literals :657/926/939/3302/
3317 → dialect), `zoom-pawn.test.js:482`, blocked/marks/zone/accepts suites,
`palette-layout`, `palette-honesty`, `vacuum-visible`, `build-drag-model`.

### P4 — LEVEL-1: THE SHIP PLATE
Files: `overview-view.js`, `overview-scene.js`, `overview-model.js`,
`client/styles/overview.css`, `deck-minimap.js`.
The plate: ink starfield (retint `plnStarDrift`), hull capsule path, compartment grid of
LIVE MINIATURE INTERIORS (`oblique.room()` at s=1.0 into tiles, `preserveAspectRatio=
xMidYMid meet`; states: 1.4px normal / 2.2px selected / dashed unbuilt / oxblood attention);
four-column readout (compartments prose · aboard chronicle · engraved ship gauges + oxblood
leak line · radar with `j4sweep` + oxblood contact); footer nav per E1. Compartments/aboard
columns render from EXISTING wire data only (room names + sensor log + chronicle channel)
— no invented sentences (E11); where the design wants prose the code has none, show the
honest terse line in the new type. Click resolution stays pointerup + `getScreenCTM()`
(BUG-B); scene stays innerHTML-swapped, NOT keyed nodes. Tests: `overview-scene.test.js`
(id namespacing :535), `overview-model.test.js`, `overview-dock-badge` (D5 re-housed),
`no-add-room`, `ledger-model`, `why-line.test.js` (re-housed why-line), `awaiting-orders`,
`console-carryover`, `dossier-honesty`, **`surface-boundary.test.js` — every numeric pin
EQUALITY, moved never loosened**.

### P6 — MOSS ON PAPER
Files: `client/styles/moss.css` (full retint of the `.moss` block: paper ground, sprocket
gutter art, engraved 10-cell load bars, solid-ink inverted selected row, oxblood △-as-path
states, serif advisory line, blink caret; CRT overlay deleted); `moss-screen.js` structure
only where the skin demands it. ALL SIX VIEWS SURVIVE (E5). Width pins (`.c-bar`,
`.moss-warn`) re-measured for the new skin. Tests: `moss-screen.test.js` (89),
`moss-program-editor.test.js`.

### FILED (not this wave)
- **P2b**: ✅ **CLOSED 2026-08-06 by `lane/warm-purge`, on the owner's ruling.** The 21 uncovered
  device rows and the 12 materials were re-authored as PAPER twins (each re-runs its own pristine
  painter and adds ink damage), and every remaining warm registry row — 38 of them — was RETIRED,
  with `objects.js`, `fixtures.js`, `resources.js` and `cryo.js` deleted. Registry 120 → 82, twins
  117 → 80, treated twins 47 → 80: there is no untreated piece left in the game.
  ⚠️ **THE FIRST TERM WAS NEVER RESTYLED — IT WAS DELETED**, and the distinction is the ruling. The
  original scope below reads *"restyle the 70 wrecked twins"*; 37 of those twins went with their
  rows, and the ones that remained had already been re-authored rather than restyled.
  The original entry, for the record: *"restyle the 70 wrecked twins + the **21** uncovered device
  rows + 12 materials + 9 resources into the paper idiom (no design exists — needs owner art
  direction or a follow-up design doc)."*
  ⚠️ **23 → 21 ON 2026-08-05, RE-MEASURED, NOT ARITHMETIC.** The owner extended
  `design-import/Perilune Fittings.dc.html` to thirty-four with a "Capsules and cells"
  section, and cards 31/32 took `DeviceKind.CryoPod`'s two state glyphs off
  `cryo-capsule-occupied` / `cryo-capsule-open`. Those two rows leave this list; nothing
  else moved (`battery-bank` was already on the paper set, so cards 33/34 changed WHICH
  paper piece a Battery draws and its wrecked twin's idiom, not this count). Counted by
  intersecting `Object.values(GLYPH_TO_ITEM)` with `FITTING_IDS` — 35 glyph-reachable ids,
  14 on the paper set, 21 still warm. ⇒ **The three displaced warm rows are still
  REGISTERED and still carry their twins** (the 70-twin bijection), so P2b's first term is
  unchanged at 70 and its second term shrank; a restyle sweep must read the ledger, not
  this sentence.
  ⛔ **THE LAST CLAUSE IS THE ONE THAT AGED WORST AND IT IS RIGHT TO KEEP IT**: the bijection it
  names is what kept every displaced warm row registered, and retiring the rows meant retiring the
  bijection first. `docs/design/perilune-item-set.dc.html` stays in the repo as HISTORY; nothing in
  `client/` reads it.
- **P7**: the story panels' DATA (per-room sentence + day-stamped emotional chronicle with
  oxblood beats) — sim+wire package, gated on M4 mood/Persona; the owner's core goal lands
  fully only with this.
- Design-doc fixture slips (E7) noted for the owner.

## 4. Fittings mapping + defect classes (P2's worksheet)

New rows (registry moves): bench 01, stool 05, cot 07, footlocker 09, sink 11, compost bin
21, vice post 23, curtain rail 29, shrine shelf 30. Replacements in place: chair 02→chair,
locker 03→locker, table 04→dining-table, larder 06→shelf-rack (owner call vs bookshelf),
bunk stack 08→bunk-bed, stove 10→cooker, cold locker 12→cooler, worktop 13→desk (owner
call), crate 14→storage-crate, water butt 15→supply-barrel (owner call), scrubber 16→
o2-scrubber, duct run 17→pipe-run, drum 18→fuel-drum, planter 19→herb-planter, grow rack
20→hydroponics, workbench 22→workbench, terminal 24→research-console, deck lamp 25→
standing-lamp, heater 26→space-heater, cell rack 27→battery-bank, mat 28→rug.
Severe finetuning: 05 stool, 11 sink (placeholder tap — ALSO in Screen 02), 15 water butt,
17 duct run, 18 drum, 19 planter, 20 grow rack, 26 heater, 29 curtain rail.
Defect classes to fix: (1) corner-to-corner grey brace diagonals read as strike-throughs
(01, 06); (2) full ellipses on cylinders — back halves show through (15, 18); (3) floating/
detached members (08, 20, 21, 25, 26, 27, 30); (4) placeholder glyphs for parts (11 tap,
12 dial, 14 handle, 19 plants); (5) projection breaks — not in the shared oblique (04, 17,
22); (6) wall-hung items have no wall reference (17, 26, 29, 30) — draw a wall stub.

## 5. Hard constraints (verified, do not re-litigate)

Sim pins P1–P5 untouched (client-only work). Projection purity + determinism + id-collision
freedom + wire formats pinned. `SHIP_STATE_REACH`/`FORBIDDEN_REACH`/`CREW_INTERACTION`
exact-equality lists — new reach = same-commit pin move with review. `.app` id census
frozen (deprecated console untouched). GlyphColor + canvas/WebGL stack + their goldens
frozen. `ITEM_IDS.length` equality + class census + 70-twin ledger move only in P2's one
commit. InvariantCulture / no locale APIs (de-DE box). Never `git add -A`; worktrees only.
