# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-03, session F CLOSED — three defect/infra lanes landed, playtest in 4 days)

**Gate on `main` (`dbaff5f`): FULL `./ci.sh` exit 0 after all three merges — 1841 dotnet +
1247 node, twin hashes MATCH at P1** (dotnet figure measured on the byte-identical lane
tree `f50cd65`, tree-hash-verified equal; re-measure before quoting). **Pin table**
(CLAUDE.md authoritative, UNCHANGED): P1 `7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52` ·
P3 `43a1a5c25713faec` · P4 `661fcdd4b89f1e87` · P5 `558a1c0a4985f5ea`. **NO PIN MOVED** —
every lane pin-neutral, proven mechanically (0-line diffs on Golden/ci.sh/content).

**THREE merges**, each one Opus implementer + one independent reviewer:
- **faultlog-dedupe** (`29964ed`, APPROVE + 2 polish observations taken) — the MOSS fault
  log lists each fault once. The cause was DOUBLE-SOURCING (one 200-ring feeding both the
  `log` tail and the whole `chron`, plus the day headline as a third copy): 29 rows for a
  14-entry ring. A text dedupe would have been WRONG, measured — live brownout episode
  entries are rewritten in place, so tail and chron legitimately disagree word-for-word.
  Stated cost: the open pane refreshes on retyped `log` + day rollover, no sub-day stream
  (throttled chron re-request filed). New rig `faultlog-once-shot.mjs` (9 checks).
- **whyline-shot-flake** (`c9e83f5`, APPROVE first pass) — INFRA: the rig's STEP-2 click
  was fire-and-forget at the pawn's LAST-FRAME tile while she walks (selection is
  host-side, never latched); and the flake was the smaller half — with nobody selected the
  readout is hidden so STEP 4 passed VACUOUSLY (0 > 0). Now `ensureSelected` re-clicks
  against frame-derived truth, 30s bound, loud exit; STEP 4 gained the `clientW > 0`
  non-vacuity term (2×2-proven load-bearing). 28 legs, 5+2 fresh-host greens.
- **d5-drop-reason** (`dbaff5f`, 1 send-back) — ⭐ **§13.25 b3 CLOSED from the ruled side:
  the SIM says why it let go.** `Abandon` takes a no-default `JobDropReason` (the COMPILER
  stops a tenth arm shipping mute) and publishes transient `OrderDroppedEvent` for held
  jobs (NOT hashed — the chronicle-signal regression's shape deliberately avoided). Host
  drains at the tick boundary; badge rule: a dropped order is badged iff the host can
  re-ask the sim's own killing question, LIVE (3 of 6 reasons qualify). Mid-order
  route-shut now reads NO WAY TO WALK TO IT; consumable-vanished names the ITEM. Also:
  `BLOCKED_ORDER_NAMES[3]` — repair badges had read "ORDER BLOCKED" since M2-9; now a
  derivation test parses the host's constants. Send-back: five stated mutation counts were
  stale (measured 6, said 3/5 — both sides now agree) and "Displaced/CargoLost are
  self-healing" was MEASURABLY FALSE under OD-H — retracted, residual **b3-R** named.

## Open on the owner (playtest 2026-08-07 — FOUR DAYS OUT)

- **Deep-capsule art** (from 08-03 E): 0.51–0.75 pods draw the ORDINARY intact capsule.
  Want mid-band wear art, or is intact correct?
- **Chronicle headline order**: a death AND a thaw headlines the death (RW's shape,
  deliberate). One-line pin-free change if you want the thaw to win.
- Carried from 08-02: ~4 sim-h bench wait (RULED: playtest measures it) · heater power
  TIER + boot affordability · rung-1 pacing · rung 1 needs a named home ·
  unsurvivable-vacuum services as a CLASS · playtest date confirm. Carried UI: Prioritise
  names the TYPE · off-switch never pre-empts · "Awaiting orders" short form · onboarding
  Space row · work-type▸reach inversion · BUILD label collision · ascending click cycle ·
  door art · `'/'` glyph · Rell reads `general crew` · sleeping crew drawn standing.

## Open — unscheduled (the load-bearing subset; ★ = new this session)

- ★ **b3-R (§13.25)**: a `Displaced`/`CargoLost` drop of a player-held order evaporates
  permanently under OD-H (nothing re-recruits; per-worker transients, no standing fact to
  re-ask — no honest badge under the live-re-ask rule; §13.25d owns the re-issue half).
  Driven by both sides independently. The loudest D5 residue left.
- ★ **Ring saturation**: 200 identical `overheat_guard: THERMAL LOAD HIGH` alarms fill the
  ring in ~1 sim-day at speed — D6's brownout spam in a second costume; Chronicle AND
  fault log both drown. Strongest playtest-facing candidate now the double-print is gone.
- D5 family: order not re-issued when the route opens (§13.25d) · no-staging-tile silent
  at issue time (b2) · badge Room-Zoom-only (Overview dock bare) · pre-click route clause
  on the offer · tenth path (deconstruct mid-service, defensible) · neither repair walk
  re-asks whether the machine still WANTS service · `OrderDroppedEvent` is trivially
  Chronicle-consumable (one-package follow-on) · no player-moved-on badge retirement.
- Chronicle residuals: stateful-PowerSystem package (moves P1/P2/P3) · episode-boundary
  saves (control-pinned) · P1 ring 200/200 Bond · `IsWanting` sawtooth (22 562 edges/day)
  · no pin covers `--ship wreck` · fault-log lines clip at right edge · throttled chron
  re-request (or positional splice — reviewer's cheaper option) for sub-day liveness.
- spend-visible carryover: why-line price clause · D4 `air` element no MECHANICS section ·
  offer prices a machine the command refuses (pristine) · `NoService` silent ·
  carried-stack price flip · spend-through-fog rung question.
- Tooling: same unverified-click shape in `vacuum-shot.mjs:201`,
  `dropped-order-shot.mjs:170-172`, `zoom-pawn-shot.mjs:213-222` (★ that one is a
  FALSE-RED risk — right instrument, no retry) · ★ ten tools one-shot the onboarding
  dismissal unverified · ★ the rig retry loop can ACTUATE A DOOR via a stale click
  (product hazard: ContextAction actuates devices — a green run may have mutated the
  ship) · ★ warm-host selection SURVIVES between runs (2×2 cells need fresh hosts) ·
  moss-gate-shot `zoomOpen` guard vacuous · rig-ordering hazard (no-add-room leaves
  deck 1) · key-swatch distinctness · ★ M-PURITY scans raw text incl. comments (TRAPS-1
  inverted) · ★ `moss.jsonl` fixture: days newest-first vs host ascending, no `[Kind]`
  tags · NOTHING GATES `client/tools/*.mjs` (now 36 tools).

## Next

1. **The playtest 2026-08-07.** The log tells each fault once; a dying order says why.
   Remaining first-hour risks: ring saturation (★ above) and the Overview dock's bare
   "Awaiting orders" while a badge sits in the Room Zoom.
2. Owner triage: the two design calls above + the carried batch.
3. M4 opens after the playtest gate (M4-1 Persona design first). Top unscheduled
   candidates if another defect lane is wanted first: **ring saturation** (playtest-facing)
   and **b3-R** (needs a design ruling — no live badge is honest, so the shape is likely a
   Chronicle line off `OrderDroppedEvent`, which also happens to be the filed follow-on).

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-29 | m1 wave + m2-1 + doc-restructure | machines visible · vent operable · honest first screen · work-priority state · doc spine | green, `pin/m2-a` |
| 07-30 | fourteen lanes over three waves | **the RimWorld loop's first act + the DIRECT ORDER + M2 CLOSED (phase-1 exit gate MET)**; M3 chartered | green, `pin/m2-e` · `pin/m2-d` |
| 07-31 | m3-batch · pod-identity · vacuum-ladder | **M3 gate cleared (OD-M); a direct order crosses the frontier**; playtest named 2026-08-07 | green, pins UNMOVED |
| 07-31 B | pod-census · deck1-vent · od-n · cryo-system · moss-input · moss-hotkeys | **the thaw ladder authored · deck 1 one repair from air · OD-N/OD-O/OD-P · A POD CYCLES · the MOSS terminal types** | green, **`pin/m3-a`** |
| 08-01 C | doc-anchor-sweep · thaw-cmd · moss-gate · pod-bay · thaw-blocked · board-fault · emergency-thaw | **the thaw is EARNED · the ship answers to MOSS · typed `pods` shows the bay · the badge names the item · the vent puzzle · the ship wakes one more soul by itself** | green, **`pin/m3-e`**, tests →1690/1180 |
| 08-02 C | heater · skill-consumers · skill-display · sleeper-personas · rest | **a heater exists (and `place` was INERT — found+fixed) · who works changes how fast · the WORK tab shows it with ABSENT cells · seven written souls · crew SLEEP** | green, **`pin/m3-d` · `pin/m3-b` · `pin/m3-c`**, tests →1775/1205 |
| 08-02 C | m3-demo | **⭐ THE M3 EXIT GATE HOLDS, MEASURED**: 43/43 — a second thaw earned and chosen · thaws 3–5 span 6.93 sim-h · her row differs in SHAPE; 7 findings filed (2 first-hour: the ladder decays silently; the work grid soft-locks) | demo, 18 shots, commissioning needed a button (closed 08-02 D) |
| 08-02 D | commission · repair-reserve · ladder-pacing · vacuum-visible | **⭐ THE PLAYTEST IS UNBLOCKED**: typed `commission` at the real cost · the grid no longer bankrupts the ship (reserve of 4) · the ladder decays in DAYS with a named-capsule warning bar · the vacuum is VISIBLE · **T13 DONE — the whole arc witnessed unmodified, 5.47 sim-h, Ozawa walks** | green ×4 post-merge + final gate on main (exit 0), pins UNMOVED, tests →1801/1218 |
| 08-03 E | chronicle-signal · spend-visible · dock-labels · roomzoom-build · d5-dropped-orders | **the log tells the story (brownout ticker gone; repair/commission/thaw write lines) · the order names its price (`· SPENDS 1 PARTS`) · `· NO AIR` survives both docks (+hover) · a room opens as a ROOM (`TOOLS ▸`) · ⭐ D5 ROOT-CAUSED (reachability, deterministic) — an unreachable order says NO WAY TO WALK TO IT** | green ×5 post-merge + final gate on main, pins UNMOVED ×5 (chronicle holds part-vacuous, labelled), 83 rig checks on merged main, tests →1831/1240 |
| 08-03 F | faultlog-dedupe · whyline-shot-flake · d5-drop-reason | **the fault log lists each fault ONCE (was ×2 + headline ×3 — double-sourced, not undeduped) · the why-line rig no longer coin-flips (and its STEP-4 check was VACUOUS — closed with a driven 2×2) · ⭐ the sim SAYS WHY it let go: a mid-order drop wears its reason (route/approach/named item), §13.25 b3 closed, b3-R named honestly** | green ×3 in-lane + final gate on main `dbaff5f` (exit 0, twin MATCH), pins UNMOVED ×5, tests →1841/1247 |
