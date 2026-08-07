# HANDOVER — current state

*REWRITTEN every session (hard cap ~120 lines + the log): the ritual in `docs/PROCESS.md` §1 replaces this block and
appends one log row. Older content: `docs/history/HANDOVER-archive.md` (rolling) and
`docs/history/HANDOVER-2026-07.md` (frozen, all § anchors intact).*

## Current state (2026-08-06, session M CLOSED — the game wears the owner's paper and it BUILDS; M4 is OPEN, two of its packages shipped)

**Gate on `main` (`8014cb1`): ~26 independently reviewed packages over two days, each behind its own full `./ci.sh`.
Both suites re-measured in the close-out lane AT THIS COMMIT: dotnet **1984/1984** and node **1917/1917**, 0 fail
either side (the dotnet line is de-DE — `Fehler: 0, erfolgreich: 1984`; parse it, TRAPS-3). Re-measure before
quoting.** ⭐⭐ **PIN M4-b (tag `pin/m4-b`) — THE FIRST MENTAL BREAK MOVED THREE PINS.** P1 →
**`7c70c1befe848cc7`** (twin MATCH) · P2 → **`55437c9e5f5d4c95`** · P3 → **`6f1fcfda3312c87a`** · P4
`661fcdd4b89f1e87` and P5 `558a1c0a4985f5ea` HELD (two paths each). Cause: FOLD WIDENING + THE DWELL COUNTER (CITZ
v9→v10, five hashed fields), **not behaviour** — the 2×2's third cell returns the old pin to the digit with the ladder
live. **CLAUDE.md's table is authoritative** and carries the receipts. ⛔ No pin sees a tier, a reset rule or any
behaviour: `MentalBreakTests` (40 legs, one BLINDED leg per claim gate) + `HowSheIsTests` (10) are the ONLY
instruments.

**WHAT THE GAME IS NOW.** **One visual language, end to end** — paper/ink/oxblood on the Level-1 **ship plate** (a
side-elevation cutaway of both decks, live miniature tiles), the Level-2 **room cutaway** now **INSET TO THE TRUE
INTERIOR** so a wall reads as a wall and a piece places **flush against it**, MOSS, the catalogues, the pawns; **THE
WARM PURGE finished it** — registry **120 → 82 rows / 80 twins**, all five paper catalogues, `TWIN_SOURCE` TOTAL
80/80, warm modules deleted; sketch ships at **`strong`** catalogue-wide at the one `item()` seam, and a 171-agent
fan-out polished **67 of 82** pieces. **The build loop feels like one**: the press reaches the sim and **the sim says
why when it refuses** (2/30 presses landed before, 30/30 after) · a **ghost** stands on the hovered tile and **[E]
rotates it** (`Device.Facing`, DEVC v7) · a placed piece is a **BLUEPRINT** wearing `AWAITING A BUILDER` until a pawn
assembles it (`BuildKind.Device`, BULD v3) · the **tray** says what every card costs · a finished piece **draws itself
onto paper**. **ONE DOOR TO A PERSON** — the **Persona window** ships (M4-2, key `U`; `CREW_INTERACTION` is a
one-element census), six bands, every line named to a wire source or written as an honest empty. **MOOD GATES
BEHAVIOUR** (M4-9, MECHANICS §13.51): a deterministic three-tier ladder over hashed mood with a DWELL and no roll —
she refuses the dangerous order, stops working, withdraws; override **graduated by tier**; the **HOW SHE IS** band and
a Chronicle line say so — OD-R's TWoM half, live. **The wreck is dressed**: solars **OUTBOARD** each over its own
feed; the cryo bay is 12 capsules and a terminal; pawns glide sub-tile at 60 fps over a carpet that survives
underfoot.

⭐⭐ **OD-S (2026-08-05) — the M4 §10 batch ACCEPTED VERBATIM, and M4 is OPEN** (`ROADMAP.md` §5 is its permanent home):
M4-9 builds the first break now · `Health`/`Morale`/`Archetype` REAL · override graduated by tier ·
`CryoSystem`-seeded bonds · severity tie kept. **The economy STAYS PARKED** — OD-B untouched, the faucet ruling still
open. ⛔ **It re-sequences the plan**: the charter's *"the 08-07 playtest amends before M4-2 implements"* is spent —
both packages are merged, so **the playtest amends M4-3 onward**. Also owner-ruled: sketch = `strong` · scene inset
over poché · the warm purge (*"replace all old items with our new ones"*) · solars outboard · cryo bay decluttered ·
nine gallery pieces keep `main`'s art, lamp-sconce redrawn.

⚠️ **THE M4 EXIT GATE IS PARTIAL, TWO NAMED PACKAGES SHORT.** All four questions are answered (*who · what · why* by
M4-2, *how she is* by M4-9's band); *no `◇ SAMPLE` anywhere* waits on **M4-3** (`panels.js` still carries the SAMPLE
ledger) and *Chronicle reachable* on **M4-7** (`persona-view.js:215-217` draws an honest empty, not her lines).

## Open on the owner

- **The 2026-08-07 playtest is the next event**; its findings amend M4-3 onward (OD-S).
- **The economy faucet ruling** (OD-B) — E1–E4 stay parked until it lands.
- From the plate (VR-P5, unchanged): a LOCKED DOOR draws as an ordinary one (`Device.IsLocked` is off the `devices`
  channel — *worth a wire field?*) · FOG IS ONE DECK · a stuck order on the inactive band shows no outline (*does the
  `compartments` column go ship-wide?*) · `--ship grid` overflows the bay and says so.
- **Wreck has no vertical air** (standing, OD-E's mechanical half): deck-1 halls stay 0 kPa forever.
- Carried: maintenance vs furnishing budget · NO-CONSUMABLE badge unreachable at boot · FLOOR default + toast ·
  furniture as a pawn job · bench wait · heater tier · rung-1 · vacuum services class · shrine shelf's oxblood frame ·
  radar shows own-ship only · **P7** (story prose needs sim+wire data that does not exist — gated on M4).

## Open — FILED, an archive not a queue (★ new this session; receipts in the merge commits)

- ★ **`OFF_PIECE_RESIDUAL`** — 10 pre-existing twins whose damage lands 4.8–13.7 px off their own ink, all predating
  2026-08-06. ⛔ A redraw must **RE-ANCHOR, never ledger**: per-row measured ceiling + inclusion arm, so a row cannot
  worsen and a fixed row must LEAVE (`client/test/wrecked.test.js:456-509`).
- **Stateful-`PowerSystem` pin lane still HELD** — residual 2 (a save on an episode's OPENING tick, 1–11 ticks per
  ~36 000, permanent and compounding), behind the M4 pin chain.
- ★ **M4-9: the wreck left alone NEVER breaks anyone** — 21 sim-days, peak dwell 111 150/864 000; crew die of AIR on
  day 19. The player path ships (held order → mood −75.00 → EXTREME at ~20.9 sim-h); scarcity tuning is **M5**'s. And
  `MentalBreakTests`' 40 legs have no leg-count/`nameof` guard — two were once spliced out.
- ★ **Shut the cryo bay's door and it cooks** (pre-existing, wreck-dressing round 1): shipped crosses `heat_stroke_c`
  between **h24 and h36** vs the control's h60–h72 — ~48 sim-h earlier, and reachable.
- ★ **Level-1/Level-2 disagree about whose fitting a BOUNDARY DOOR is** — the plate assigns it to the compartment
  (wall-inclusive `covers`), the Room Zoom does not (`roomCells` clamps to drawn floor); the join subtracts the ring
  **derived per compartment** (`client/tools/overview-plate-shot.mjs:840-869`).
- ★ **Leg 3c — a STRIPPED ring wall is unaddressable in the Room Zoom and the Level-1 STRIP tool can produce one**
  (`client/src/ui/overview-view.js:2243`). Mitigation measured: over the fixture deck's 8 slots, **240 distinct
  perimeter tiles, NOT ONE floor** (`client/test/room-model.test.js:4734`, leg `:4815`, re-derived on `8014cb1`). ⛔ A
  **FIXTURE fact** — re-derive before relying.
- ★ **The scene-inset clamp census is blind to the destructured read** (`const { rx, ry } = focusRoom`) — harmless
  today (all 11 clamp sites have behavioural legs, measured), but a 12th written that way would be invisible to both
  censuses; the census header should carry the warning.
- ★ **Wing-leg brittleness** (reviewer MINOR, filed): `THE WING HANGS OVER ITS OWN FEED`
  (`client/test/overview-scene.test.js:1939`) asserts alignment **∧** equal-size, so a legitimate unequal-size wing
  false-reds with the wrong message; the float leg (`:1979`) is the primary pin.
- ★ **`overview-plate-shot.mjs`'s dedupe self-report over-discloses** — computed on pre-ring-filter `all` (`:857-861`)
  while the returned count dedupes `onFloor` (`:869`). Imprecise, not wrong.
- ★ **The plate's build-ghost glyph is consumed by no test** — `ghostLayer`'s oxblood `#`/`/`
  (`client/src/ui/overview-scene.js:698-717`); `pl-ghost`/`ghostLayer` appear nowhere under `client/test/` or
  `client/tools/`. ⚠️ The earlier `:601` citation was WRONG; that line is prose.
- ★ **DEMOLISH is silent on a device a crew member stands on** (`client/src/ui/room-model.js:2832-2845`, filed there
  with its close): the occlusion fallback DRAWS the capsule and the verb refuses it — *invisible feedback is
  FUNCTIONAL* pointing the other way; the close is a signature change.
- ★ **Telescope substitution liveness** (the plate goes **3 → 4** hull pieces on `--ship wreck`) was driven live in
  round 2 (`ef3dfb1`); round 3's re-verify took it by construction.
- ★ **`doorway-cross-shot.mjs` reports message→repaint ENTRY LATENCY as honest, not a defect** (`:373`, `:404`);
  `--latency-cap` (default 20 frames = the tween's 250 ms ceiling) separates it from a VANISH, and at cap 0 it
  reclassifies nothing else.
- ★ **Rig/guard debt**: `persona-shot.mjs` flakes ~1 run in 3 on M4-2's `[U]` step (false-RED only; close = wait on
  the SELECTION — `:37`) · the draw-reveal keyframes are **invisible to the node gate** (no CSS engine; the text guard
  at `client/test/draw-reveal.test.js:1011-1033` is the only cover) · **six hand-mirrored copies of one positional
  `devices` parser** (23 dotnet failures on one widening) · treated repaint is priced — the cryo bay went **702 → 5480
  paths** (inside 16 ms at 7 fittings; the PLATE was priced OUT at 20.82 px, miniatures go raw) · blueprint/facing
  fold-neutrality is a **VACUOUS hold** (no pinned fixture authors a blueprint or rotates), CLAUDE.md's rate-term class.
- ⚠️ **Two review notes I could NOT re-derive at close-out — unverified, re-measure before quoting**: an `N.5`
  rounding knife-edge in the plate join, and a `0↔0` content-join branch said to be unexercised (the live rig reads
  `hall_d0_s7` 0 ↔ 0, so it may in fact be driven).
- Carried: the walkway strip compresses a deck's whole `ty` range (VR-P5 item 5) · an upright caption's ink reads as
  pressable · `rz-blockeds` is the only layer above the new tier taking pointer events · zone `<title>` tooltips
  unreachable under a fitting · furniture flickers ±1 piece · ContextAction silence on refused device clicks ·
  MOSS-live stray clicks actuate doors, no confirm/undo · klaxon dominant ring producer · save-tick event-loss family ·
  HELP is fourteen lines in a ~7-line pane · D5 / spend-visible / Chronicle residuals · ~40 stale `styles.css:NNN`
  citations in `docs/` · NOTHING GATES `client/tools` (43) · `perilune-moss-terminal.spec.md` §4 is SUPERSEDED.

## Next

1. **The 2026-08-07 owner playtest is the next event**, and nothing is scheduled ahead of it. Its findings **amend
  M4-3 onward** (OD-S) — M4-2 and M4-9 are merged and are not revisable by it; file them as HANDOVER lines and
  charter amendments, never as new lanes.
2. **Then the M4 queue per `perilune-m4.packages.md` §3**: **M4-3** the dossier stops lying (carries OD-S item 4's
  seeded bonds) → **M4-4** Health/Morale real (OD-S item 2) → M4-5 · M4-6 → **M4-7** Chronicle reachable → **M4-8**
  WP-9 console deletion. **M4-3 and M4-7 are the two the M4 exit gate is short.**
3. **The held pin lane: stateful `PowerSystem`** (residual 2) — one standing pin lane at a time; check `git tag pin/*`
  first, `pin/m4-b` is the chain's head. ⛔ Rig hardening, guards-about-guards, renames and DOM tests for shipped
  affordances stay META-WORK under PROCESS §2: they ride inside a lane that moves a row, or they stay filed.

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 08-02 D | commission · repair-reserve · ladder-pacing · vacuum-visible | **⭐ THE PLAYTEST IS UNBLOCKED**: typed `commission` · reserve of 4 · decay in DAYS with warning · vacuum VISIBLE · **T13 DONE — the whole arc witnessed unmodified** | green ×4 + final gate, pins UNMOVED, tests →1801/1218 |
| 08-03 E | chronicle-signal · spend-visible · dock-labels · roomzoom-build · d5-dropped-orders | **the log tells the story · the order names its price · NO AIR survives docks · TOOLS ▸ · ⭐ D5 ROOT-CAUSED — NO WAY TO WALK TO IT** | green ×5 + final gate, pins UNMOVED ×5, tests →1831/1240 |
| 08-03 F | faultlog-dedupe · whyline-shot-flake · d5-drop-reason | **each fault ONCE · the rig stops coin-flipping · ⭐ the sim SAYS WHY it let go (§13.25 b3 closed, b3-R named)** | green ×3 + final gate `dbaff5f`, pins UNMOVED ×5, tests →1841/1247 |
| 08-03 G | overview-dock-badge · ring-saturation · palette-armed-state · b3r-dropped-order-chronicle | **the OVERVIEW says why an order is stuck · a klaxon writes ONE line (ring 200/200→49) · the palette PRESSES · ⭐ ORDER DROPPED in the log (b3-R closed, owner-ruled)**; 4 owner rulings in-session | green ×4 + final gate `025e529`+docs `5d9deb0`, pins UNMOVED ×5, tests →1850/1257 |
| 08-04 H | TWELVE lanes (owner-directed, AFK): chip-collision · brownout-cadence · rig-hardening · palette-honesty · parts-affordability(D7) · onboarding-thaw · gate-sentences · moss-autoscroll · pod-poll-spam · rig-premises · palette-three-tools · moss-doors-verb | **"can't build / can't defreeze" AUDITED then CLOSED: every build button priced+honest, first bunk affordable (⭐⭐ brownout trade FILED for the owner), 3 new tools · the card TEACHES the thaw, MOSS refusals name the next step, the console scrolls+stops spamming, typed `doors` ends the secret-door stall · the log survives a WEEK · rigs can't coin-flip or leak · ⭐⭐ THE LIVE-PLAYER CHAIN PROVEN DRIVEN (repair→doors→craft→CM→commission, ~6.7 sim-h)** | 12× in-lane full gates + final tree ≡ gated tree (exit 0, twin MATCH), pins UNMOVED ×5, tests →1876/1297 |
| 08-04 I | vents-verb · crew-sel-collision · moss-scroll-affordance (owner-triage; THREE same-day rulings → OD-Q) | **⭐⭐ D7 RULED keep-the-cache · `doors` RATIFIED and typed `vents` SHIPS (the deck-1 puzzle's noun is learnable; BOARD FAULT visible in the listing) · picking a crew row visibly ARMS it (3rd chip-collision instance closed, guard widened to discover `.sel`) · the MOSS console says `▾ N MORE` — and its review CAUGHT the sign eating the autoscroll slack (fixed at the seam, both sides of the band pinned)** | 3× in-lane full gates + TRAPS-8 re-gates ×2 + final tree ≡ gated tree, pins UNMOVED ×5, tests →1889/1312 |
| 08-04 J | twom-axis-drift-guardrails + twom-gameplay-pillar (docs-only, owner-direct) | **OD-R — the game is RimWorld × Factorio × THIS WAR OF MINE, and TWoM is a GAMEPLAY PILLAR** (owner amended same day: "more than a tone"; three follow-ups adopted — emergent triage from real scarcity · deterministic mental breaks gate BEHAVIOUR (T12's missing half) · lands inside M4+M5; nothing implementable before the M4-1 charter) · **the drift check the owner asked for**: PROCESS §2 lane-selection gate + `rows:` disclosure, HANDOVER's meta-work candidates demoted behind owner triage | docs-only ×2, full gate exit 0 each, doc-sentinel tests green; rows: none (owner-directed ruling batch) |
| 08-04/05 L | **THE VISUAL REDESIGN** (owner-directed, `lane/visual-redesign`, MERGED to main 08-05 by owner ruling): vr-foundation · vr-pawns · vr-fittings · vr-moss · vr-overview · vr-roomzoom | **the whole client is the owner's paper/ink/oxblood design** — one oblique kit draws plate tiles, room cutaway and 30 fittings; ink figures; MOSS on paper with every view alive; every playtest affordance re-housed (E4), dash dialect replaces the amber/red hues (E3); registry 71→80; ⭐ every package survived independent adversarial review (A: shadow-theme guard hole · P5: clip-erased chips · P2: 2 invisible-ink members · P6: row-side grid break + unknown-dressed-as-zero · P4: off-screen alert + split coordinate systems + unpinned painters · P3: unguarded assembly seam) — all fixed and re-verified | 6 in-lane full gates + 4 integration re-gates + final gate, pins UNMOVED ×5 every time, tests →1889/1463; rows: none (owner-directed) |
| 08-04 K | m4-1-persona-design (forced topmost row after two `none` sessions) | **M4 CHARTERED IN FULL — THE PERSON** (`perilune-m4.packages.md`, 2132 lines): the Persona design with (a)–(h) ruled-or-forked (keymap census says `E`; the T-key third door named; Rell ruled authored, its pin move named) · **⭐⭐ OD-R's TWoM-gameplay section — the deterministic break ladder priced in hashed fields** (review DEFEATED the hard-reset counter with the measured sawtooth; decaying counter recommended; the tunable's unhashed-trait trap named) · M5-1 forward charter · five-item owner batch with silence defaults; 1 send-back (5 MAJOR + 11 MINOR) + 4 nits, all enforced | docs-only, full gate exit 0 in-lane at FINAL commit, twin MATCH, pins UNMOVED ×5, merge tree ≡ lane tree; rows: M4-1 (T16 + T12's OD-R half → chartered) |
| 08-05/06 M | **THE OWNER-DIRECTED WAVE + M4 OPENS** (~26 reviewed packages): responsive band+radar · tile picking · pawn glide + 60 fps tween · capsules/cells · four paper catalogues · carpet-under-pawn · build-ghost + [E] rotation · build-feel + BLUEPRINTS · **M4-2 THE PERSONA WINDOW** · sketch-strong catalogue-wide + `perilune-art-style.md` · 171-agent designer fan-out (67/82) + owner gallery ruling · build tray · draw-reveal · **M4-9 THE FIRST MENTAL BREAK** · place-in-vacuum · **THE WARM PURGE** · scene-inset · wreck-dressing | **the game wears the owner's paper end to end and it BUILDS**: a wall reads as a wall and a piece places flush against it · a press that refuses says why (2/30 → 30/30) · a placed piece is a blueprint that draws itself in when a pawn finishes it · ONE DOOR to a person (key `U`) · ⭐⭐ **MOOD GATES BEHAVIOUR — she refuses, stops, withdraws** · registry 120 → 82 rows / 80 twins, all paper · solars outboard, cryo bay decluttered. **OD-S**: the M4 §10 batch accepted verbatim, M4 OPEN, economy still parked, the 08-07 playtest re-sequenced to amend M4-3 onward | full gate per merge; final `8014cb1` node 1917 re-measured / dotnet 1984; ⭐⭐ **`pin/m4-b` — P1/P2/P3 MOVED**, P4/P5 held; rows: **T12** (mood gates behaviour) · **T16** (Persona window SHIPPED) · **T8** (the build refusal + blueprint wait say why) · M4 gate → PARTIAL (M4-3 + M4-7 short) |
