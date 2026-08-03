# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-03, session E CLOSED — five defect lanes landed, playtest in 4 days)

**Gate on `main` (`39105fc`): FULL `./ci.sh` exit 0 after all five merges — 1831 dotnet +
1240 node, twin hashes MATCH at P1** (re-measure before quoting). **Pin table** (CLAUDE.md
authoritative): P1 `7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52` · P3 `43a1a5c25713faec` ·
P4 `661fcdd4b89f1e87` · P5 `558a1c0a4985f5ea`. **NO PIN MOVED this session** — chronicle's
holds are part-VACUOUS and labelled (P1's fixture has no pods, no brownout edges, no
commands; its ring is 200/200 Bond — the real instruments are `ChronicleSignalTests` +
the mid-episode save/restore test).

**FIVE merges**, each one Opus implementer + one independent reviewer (owner triage 08-02
chose the Chronicle lane; the rest ran under the extended 08-03 authorization):
- **chronicle-signal** (`6556f7f`, 2 send-backs) — D6+D1: ONE 200-ring backs Chronicle,
  sensor log AND the MOSS fault log; brownout flapping coalesces into per-network episode
  entries (hashed `SubjectB` = edge-count+direction word; same-direction duplicate edges
  dropped, closing a mid-brownout save/restore divergence, driven 2×2 bit-identical);
  thaw / repair (3 arms named, via new `RepairCompletedEvent`) / commission write lines;
  ladder re-ranked per RW §14.3 (Death 8 > Thaw 7); the MOSS "nothing published on
  repair" caveat retracted. TWO residuals FILED in five places (episode-BOUNDARY saves
  never re-converge — 1–11-tick windows, permanent, pinned by a KNOWN-DIVERGENT control
  test; evicted-live-episode corner); honest fix = a stateful-PowerSystem SYSS package
  (would move P1/P2/P3), filed.
- **spend-visible** (`68101b2`, APPROVE first pass) — the offer names its price BEFORE the
  click: 10th `DeviceCell` element `spend` (ItemKind byte; −1 unknown / −2 nothing; absent
  never fabricates), `WhatARepairWouldSpend` wraps the ONE funnel (never the tier-0
  `WantedRepairConsumable` lie), two-answer prologue (2 scans/render vs ~438). The price
  is a HINT and a COUNTERFACTUAL, doc'd as such.
- **dock-labels** (`ae63b70`, 1 send-back) — `· NO AIR` survives BOTH docks (`Servicing
  fabric… · NO AIR`); base ellipsized, never the warning; hover title = full sentence.
  The inherited "~23 chars" rz budget was the CLIPPED figure (truth 22; M2-20's arithmetic
  dropped the 0.04em letter-spacing term) — corrected at origin.
- **roomzoom-build** (`50d02f8`, 1 send-back) — the first screen in a room is the ROOM:
  `_armed` was always null; three surfaces announced BUILD anyway. One pure
  `zoomChrome(armed)`: `TOOLS ▸ {ROOM}` / crew-count caption / a neutral hint naming the
  real verbs (RIGHT-CLICK A **MACHINE** — the TILE wording invited a deliberately-silent
  gesture; both instruments matched `/PRIORITISE/`, so only review caught it).
- **d5-dropped-orders** (`39105fc`, 1 send-back) — ⭐ **D5 ROOT-CAUSED: deterministic
  REACHABILITY, not flakiness.** `TryFindStagingTile` never asks *reachable*; the order is
  accepted (design, §2.2), then `DriveWorker`'s pickup branch (`MachineWearSystem.cs:464`)
  fails `FindPath` and `Abandon` clears the hold — taken tick 1, gone tick 171, silent.
  Fix feedback-first: `ReasonNoRoute` / **NO WAY TO WALK TO IT** on the blocked channel,
  asked before the taken-retire, badge outlives the drop. Zero `sim/` diff.

**Merged-main browser verification (before D5): 83 rig checks green, no composition
regression**; the four features compose in one string (`PRIORITISE: REPAIR FABRICATOR ·
SPENDS 1 PARTS · NO AIR AT THE WORKSITE — SHE MAY DIE`). D1 witnessed driven end-to-end.
23 owner shots in the session scratchpad; 9 sent to the owner.

## Open on the owner (playtest 2026-08-07 — FOUR DAYS OUT)

- **ANSWERED, now a design call: deep-capsule art.** Verified in browser — 0.51–0.75 pods
  draw the ORDINARY intact capsule (only condition switch is the 0.25 wreck threshold).
  Want mid-band wear art, or is intact correct?
- **Chronicle headline order**: a day with a death AND a thaw headlines the death (RW's
  shape, deliberate). One-line pin-free change if you want the thaw to win.
- Carried from 08-02: the ~4 sim-h bench wait (OWNER RULED 08-02: leave for the playtest to
  measure) · heater power TIER + boot affordability · rung-1 pacing · rung 1 of the vacuum
  ladder needs a named home · unsurvivable-vacuum services as a CLASS · playtest date
  confirm. Carried UI: Prioritise names the TYPE · off-switch never pre-empts · "Awaiting
  orders" short form · onboarding Space row · work-type▸reach inversion · BUILD label
  collision (WORK tab) · ascending click cycle · door art · `'/'` glyph · Rell reads
  `general crew` · sleeping crew drawn standing.

## Open — unscheduled (filed this session; the load-bearing subset)

- **MOSS FAULT LOG prints the newest 14 entries TWICE** (`faultLogView` concatenates live
  tail + whole chronicle, no dedupe) — pre-existing, but one-ring-feeds-both makes it read
  as a bug now. First-hour-visible; strongest playtest-facing residue.
- **D5 residuals (§13.25 b3)**: the SAME arm is silent when the route closes MID-ORDER
  (record already retired — structural; honest fix = a sim-published drop reason covering
  all NINE `DriveWorker` Abandon arms, a named follow-on) · order not re-issued when the
  route opens (§13.25d) · no-staging-tile refused silently at issue time ·
  `BLOCKED_ORDER_NAMES` has no index 3 (REPAIR rows read "ORDER BLOCKED") · badge is
  Room-Zoom-only (Overview dock says bare "Awaiting orders"; dock-labels' clause machinery
  is the natural follow-on) · a pre-click route clause on the OFFER (RW §2.2's actual
  shape; needs sim answer + wire element).
- **Chronicle residuals**: stateful-PowerSystem package (moves P1/P2/P3) ·
  episode-boundary saves (control-test-pinned) · P1 fixture's ring is 200/200 Bond
  (social spam, D-3 family) · `CitizenMemory` still 100% social · craft/batch line
  deliberately out · `IsWanting` sawtooth untouched (22 562 edges/day) · no pin covers
  `--ship wreck`.
- **spend-visible**: why-line price clause (post-dock follow-on) · D4 `air` element has NO
  MECHANICS section · offer prices a machine the command silently refuses (pristine) ·
  `NoService` is a silence · carried-stack price flip (2 transitions/service, visible) ·
  spend-through-fog names a RUNG where precedent said none.
- **Tooling**: why-line-shot STEP-2 selection flake (no poll — coin-flip red on fresh
  host) · dropped-order-shot needs a fresh host (no cancel verb) · moss-gate-shot
  `zoomOpen` guard vacuous · rig-ordering hazard (no-add-room leaves deck 1) · key-swatch
  guard never checks distinctness · leaked-Chrome + broad-pkill + self-matching-waiter
  incidents → TRAPS 5/3 addendum THIS session (see TRAPS.md) · NOTHING GATES
  `client/tools/*.mjs` (now 34 tools).

## Next

1. **The playtest 2026-08-07.** Arc-complete AND legible: order → priced → repaired →
   logged → MOSS → commission → thaw; dangers visible; refusals spoken; the log tells it.
2. Owner triage of the two NEW design calls above (deep-capsule art, headline order) plus
   the carried batch.
3. M4 opens after the playtest gate (M4-1 Persona design first). The MOSS fault-log dedupe
   and the D5 follow-on (sim-published drop reason) are the top unscheduled candidates if
   a defect lane is wanted before it.

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
