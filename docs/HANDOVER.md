# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-30, autonomous overnight session — six merges)

**Gate on `main`: `./ci.sh` exit 0, 1439 dotnet + 1060 node, twin hashes MATCH at the NEW
P1 `81733e27709f36e4`** (pin table in `CLAUDE.md`; re-measure before quoting). **P1/P3
moved with M2-2, tag `pin/m2-e`** — a behaviour change, not a fold: the grid M2-1 stored is
now read. P2 held (perilune's two crew are `HoldPosition`); P4/P5 held.

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

Every package: Opus implementer + separate independent reviewer; two send-backs (M1-L-b
docs/comments; M2-3 one comment), both fixed and re-verified before merge.

## Next (from `docs/ROADMAP.md` §3)

1. **M2-20** "the ship is waiting on you" (OD-G's words) — was chartered for the SAME
   window as M2-2, so it is now the top item: without it a boot pawn reading
   `Walking to 7,9 (no task)` and a hung game look identical. Integrator defaults already
   recorded (plan §3.5): two words *unassigned* vs *idle*; "first order" = any
   job-taking command incl. a WORK-tab toggle. Owner may overturn on sight.
2. **M2-18** `ReasonWorkTypeOff` on the blocked channel (position 13) — under OD-H the
   FIRST order a new player paints is refused for exactly this reason; M2-20 owns the
   vocabulary, M2-18 consumes it (serialize: M2-20 first, both touch `GameSession.cs`).
3. Then M2-5 (cross-family ranking, PIN `M2-g`, integrator lane, strictly serialized
   against M2-2's files) · M2-6 (`why` line) · M2-8 (pre-emption) · M2-19 (sticky claim).

## Open on the owner

Nothing blocking. New, from this session's merges (review as you play):
- M2-20 shipped "Awaiting orders" (batch item 11): the recommended "Unassigned — awaiting
  orders" measured CLIPPED in both docks (155/146 px in 145/118 px cells). Reversible at
  `GameSession.AwaitingOrdersLabel`; any reversal must re-measure in the browser.
- The onboarding card dropped its `Space` row to fit the new WORK row (Space is written on
  screen by the ship itself at `#ov-nudge`); if you want it back, another row must go.
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
| 07-30 | m1-g·m2-21·m2-4·m1-l-b·m2-3·m2-2 | **the RimWorld loop's first beat is playable**: WORK tab on the Overview, boots all-off, set Repair → she repairs, off mid-job → she finishes then waits; BUILD-behind-door backs off visibly; ADD ROOM fully gone | green, P1/P3 re-pinned `pin/m2-e` |
