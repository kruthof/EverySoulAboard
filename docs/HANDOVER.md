# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-30, autonomous overnight session — NINE merges)

**Gate on `main`: `./ci.sh` exit 0, 1460 dotnet + 1073 node, twin hashes MATCH at P1
`81733e27709f36e4`** (pin table in `CLAUDE.md`; re-measure before quoting). **P1/P3 moved
with M2-2, tag `pin/m2-e`**; pin rows `M1-c` and `M2-g` both discharged with NO move
(measured + mechanism-verified, the pattern for "expected to move, held").

**THE PHASE-1 OPENING BEAT WORKS END TO END** (driven in a real browser on the merged
tree): boot → WORK tab all-off, the pawn wanders unassigned → set Repair 3 → she walks to
`wing_c` and services it (0.06 → 1.00) → set off mid-service → **she finishes** (the
claim-time ruling), then takes nothing new. Merged this session, in order:

- **M1-G** vent-premise reword (OD-D) — three surviving source comments; docs were clean.
- **M2-21** silent BUILD haul back-off (D-2 CLOSED) — 1 500 abandons/3 000 ticks → 59;
  pins measured HELD (geometry), pin row M1-c left the chain.
- **M2-4** `work` wire channel + `SetWorkPriorityCommand` — pin-neutral, spine.
- **M1-L-b** `AddRoomCommand`/`CmdKind.AddRoom` deleted; ordinal renumber measured safe;
  MECHANICS.md reconciled (found: nothing under `Jobs/` reads `CO2Ppm` — §13.1 is LIVE).
- **M2-3** the WORK tab — the game's primary control surface, ascending-only click cycle
  (stated at the seam), positively pinned inside the Overview root.
- **M2-2** the work-type veto — 5 gates, 1 predicate, 11/5/3 census re-verified; A5 +
  survival doors ruled ungated and PINNED; 138 test call sites moved to explicit
  `GiveAllWork` (OD-I). **This delivers OD-G: the pawn boots idle and waiting.**

Then, same session: **M2-20** "Awaiting orders"/"Idle" from one host authority, both docks,
the card teaches WORK as the first order · **M2-18** `ReasonWorkTypeOff = 4` on the tile,
ALL-not-ANY, air outranks it — the boot tile and the pawn word now tell one story ·
**M2-5** the band loop + push gate (both halves; the spike's half-done signature is pinned
by blinded legs both ways; equal band ties on `NaturalPriority`). Every package: Opus
implementer + separate independent reviewer; three send-backs (M1-L-b, M2-3, M2-18 — all
comment/record defects), each fixed and re-verified before merge.

## Next (from `docs/ROADMAP.md` §3 — the remaining M2 queue, in merge order)

1. **M2-6** the `why` line on `TaskLabel` (pos 15, neutral) — consumes M2-20's vocabulary;
   its charter is already OD-H-corrected (packages.md ~2712).
2. **M2-8** pre-emption (pos 16, neutral, "0 lines in sim/, 3 host lines") · **M2-19**
   sticky claim (17) · **M2-9** `PrioritiseJobCommand` (18) · **M2-10** right-click
   prioritise (19).
3. **M2-11** off-network authoring (20, PIN `M2-c`) → **M2-12** `EffectiveRate` — THE
   LIGHTS-COME-BACK package, the phase-1 exit gate (21, PIN `M2-d` = rollback point) →
   **M2-17** teach the harness to author a grid (22, INFRA; note M2-5's coverage caveat:
   after the veto the P1 run exercises no job system at all until M2-17 lands).

**OD-L landed (owner, 2026-07-30, after playing the new build):** the opening arc is
pod-driven — MOSS freeze/unfreeze per pod, failure reasons as repair hints, and an
escalating repair-item ladder (production-chain depth = difficulty). Ledger row L in
ROADMAP §5; binds the M3 charters, which are still written at end of M2 per process.
The M2 tail (M2-9/M2-10 right-click prioritise) already delivers the "detail below the
WORK tab" half.

## Open on the owner

Nothing blocking. New, from this session's merges (review as you play):
- M2-20 shipped "Awaiting orders" (batch item 11): the recommended "Unassigned — awaiting
  orders" measured CLIPPED in both docks (155/146 px in 145/118 px cells). Reversible at
  `GameSession.AwaitingOrdersLabel`; any reversal must re-measure in the browser.
- The onboarding card dropped its `Space` row to fit the new WORK row (Space is written on
  screen by the ship itself at `#ov-nudge`); if you want it back, another row must go.
- M2-18 ranks `ReasonWorkTypeOff` ABOVE `ReasonUnreachable`; the review showed the
  both-carrying state is reachable in play (latch survives the switch-off) and by the
  package's own "world facts outrank switch facts" principle the ranking is arguably
  inverted. Shipped order is honest (a two-step reveal, never lies); glance and rule.
- The WORK tab's column labels abbreviate OD-J (`BUILD` for Construct, `STRIP` for
  Deconstruct) and `BUILD` collides with the BUILD tab label in the same command bar.
- The ascending-only click cycle (off→1→2→3→4→off) deviates from RimWorld's two-gesture
  pair; reasoning at `overview-model.js` `nextWorkPriority`; reversible in one edit.
- Standing art items: door art + LOCKED state unphotographed · OPEN-doorway `'/'` glyph
  piece missing · blind screenshot A/B and the 60-min playtest are the week-9/13 gates.

## Open — unscheduled (filed, unowned; integrator triages against the roadmap)

- `MECHANICS.md` §13.1 first half is a LIVE gap: nothing in `MachineWearSystem` or under
  `Jobs/` reads `CO2Ppm` at all (measured in M1-L-b's reconciliation).
- M2-21 residuals: a per-citizen path failure suppresses the SITE for every pawn for 50
  ticks (bounded, untested either way) · neither `_matRetryAt` map is pruned on a
  Sites-dirty rescan (dead entries, bounded) · `ProgressBuildHaul` phase B (`:457`) is
  safe only because phase A now stamps — documented at the seam.
- `Citizen.WorkIncapable` exists sim-side but is not on the `work` wire — the WORK tab
  cannot render an incapable cell (RimWorld's greyed row). File into M3-7/M3-12.
- M2-5: pull-vs-pull equal-band ties still separate by DISTANCE, not `NaturalPriority`
  (Construct@2 + Haul@2, nearer haul wins — contradicts OD-J's 700>100). A charter
  tension resolved toward the binding argmin-per-band shape; KNOWN LIMIT in
  `WorkArbiter.cs`'s header; fix is one argmin per (band, work type), no `Select` change.
- M2-2's G5 still OFFERS the LLM a dig that M2-5's arbitration then refuses at grant —
  charter-correct, possible M4 dialogue wrinkle (she agrees, then ranks it lower).
- `designs` not fog-gated while `blocked` is — closed on wreck, live on grid/slice/perilune.
- A machine below the wreck floor with no consumable stays needy forever (3 item-store
  scans at 1 Hz, per device).
- Unskinned device glyphs: GrowBed `"`, Terminal `T`, Telescope `x` (fix with a guard).
- D-3 social argument gate permanently open on every pair — file into M4.
- Save-reload gas/thermal ULP drift (archive: "Save-reload gas/thermal ULP drift").
- `WreckShipTests.WreckedPods_StillReadAsDead_AfterASimDayUnattended`: "unattended" now
  means "no further input after the one order" (grid must be enabled for non-vacuity).
- Pre-re-aim backlog archived in `docs/history/HANDOVER-2026-07.md` — triage on touch.

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-28 | (six lanes) | wreck ship ships: operate verb, wrecked art, devices channel; ADD ROOM stops conjuring air | green, all pins |
| 07-29 am | audit + spike | no code: metric audit (A1 retired), dispatch spike refuted `TryAssign` seam, OD-A…OD-C | n/a |
| 07-29 | m1 wave | machines visible, `vent_ls` operable, honest first screen, ERASE tool | green |
| 07-29 pm | m1-f/h/d/i/k | morale bar gone, craft thrash gone, unreachable reason on tile, 11 repair consumables, pawn select+MOVE in Room Zoom | green |
| 07-29 pm | m2-1 + m1-l | work-priority state (hashed, OFF), every compartment IS a room | green, P1–P3 re-pinned `pin/m2-a` |
| 07-29 late | doc-restructure | docs only: TARGET/ROADMAP/PROCESS/TRAPS created; CLAUDE.md + HANDOVER cut ~10×; history archived | green, pins held |
| 07-30 | nine lanes (m1-g·m2-21·m2-4·m1-l-b·m2-3·m2-2·m2-20·m2-18·m2-5) | **the RimWorld loop's first act is playable**: boot reads "Awaiting orders" + the tile says nobody is assigned; WORK tab (all-off) → set Repair → she repairs → off mid-job → finishes then waits; priorities RANK across families (Repair@1/Haul@4 means it); BUILD-behind-door backs off visibly; ADD ROOM fully gone | green, P1/P3 re-pinned `pin/m2-e`; M1-c+M2-g discharged no-move |
