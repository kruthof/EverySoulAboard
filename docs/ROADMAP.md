# ROADMAP — the work queue

*2026-07-29. Distilled from `docs/design/perilune-roadmap-q3.plan.md` /
`…packages.md` (both independently reviewed, both amended after OD-D…OD-K) and corrected
against the merged tree. **This file states the current queue only** — detailed M2 charters
(seams, conflict matrices, mutation tables) stay in `…packages.md`; superseded arguments
and revision history stay there and in `docs/history/`. Corrections here REPLACE text.
Status column is authoritative; update it in the merge commit that changes it.*

**The standing rules** (full rationale in `docs/PROCESS.md`):
- Every package has a **player sentence** or is explicitly INFRASTRUCTURE.
- Every milestone ends with a **five-minute demo** in the running game.
- Pin-neutral lanes prove it mechanically: `git diff -- tests/Perilune.Tests/Golden/ ci.sh
  content/` = 0 lines. Pin-moving rows go through the ONE standing deep lane, never two
  concurrent, each with its own re-pin commit + `pin/*` tag.
- One owner-decision batch per milestone; default-to-recommendation after three days.

## 1. Milestones (exit gates are player sentences)

| M | weeks | exit gate |
|---|---|---|
| **M1 — SEE IT, KNOW WHY** | 1–2 | Every wrecked machine visible; open `vent_ls` and the hall pressurises; a stalled order carries its reason on the tile; erase takes an order back. **Effectively DONE** (M1-E/M1-G/M1-L-b remain, none gate-blocking). |
| **M2 — THE ORDER** | 3–6 | Player sets Rell's work grid (or right-clicks one machine); her behaviour inverts; **repairing the reactor wing turns the lights back on** (phase-1 exit gate, OD-K). Under OD-G/OD-H the demo runs in the *enabling* direction: the pawn boots idle, the opening beat IS the first order. |
| **M3 — THE SECOND SOUL** | 7–9 | A second thaw is earned and chosen; thaws 3–5 don't arrive in one sim-hour; the new soul's WORK row differs from Rell's. **Hard 60-min owner playtest at end of week 9.** |
| **M4 — THE PERSON** | 10–11 | One click → one Persona window: who she is, what she's doing, why, how she is — no `◇ SAMPLE` anywhere; Chronicle reachable. |
| **M5 — A RUN WITH A SHAPE** | 12–13 | An hour-long session with a beginning, middle and an ending on screen. Second human gate + blind A/B. Save/load (M5-7) is the quarter's release valve, not a promise. |

## 2. M1 — status

DONE/merged: M1-A boot-explored interior (OD-C) · M1-B honest first screen · M1-C erase
tool · M1-D `blocked` reachability reason · M1-F morale bar deleted · M1-H craft-thrash
fix (pin-neutral, measured) · M1-I repair consumables 3→11 (OD-F) · M1-K pawn control in
Room Zoom (post-hoc charter) · M1-L every compartment IS a room, ＋ADD ROOM deleted (OD-K)
· M2-0 dispatch spike (findings only, branch destroyed — **read before any dispatch work**:
priority cannot live in `TryAssign`; five entry sites; pre-emption is safe and cheap).

Remaining, none blocking M2: **M1-E** silent-refusal census/surfacing (`ReasonNoConsumable`
re-homed to M2-9). M1-G vent-premise reword DONE 2026-07-29 (three surviving source comments
reworded in `lane/premise-fix`). M1-L-b DONE 2026-07-30: `AddRoomCommand`/`CmdKind.AddRoom`
deleted, ordinal renumber measured safe (no numeric path to the enum exists), MECHANICS.md
drift reconciled — which surfaced a live gap: nothing under `Jobs/` reads `CO2Ppm` (§13.1).

## 3. M2 — the queue (merge order; charters in packages.md)

| pos | id | one line | pins |
|---|---|---|---|
| ✅ | M2-1 | per-citizen work priorities as hashed state (CITZ v7→v8) — merged + re-pinned, tag `pin/m2-a`; boots OFF everywhere (OD-H/OD-I) | M2-a DONE |
| ✅ | M2-21 | silent BUILD haul back-off (defect D-2) — merged 2026-07-29; pins MEASURED HELD (geometry, non-vacuity proven driven), so pin row M1-c left the chain with no re-pin | M1-c DONE |
| ✅ | M2-4 | `work` wire channel + `SetWorkPriorityCommand` — merged 2026-07-29, pin-neutral proven (check A empty, all pins held) | neutral DONE |
| ✅ | M2-3 | the WORK tab — merged 2026-07-30, pin-neutral; acceptance steps 4/6 DEFERRED BY NAME to M2-2 (need the veto; M2-2's acceptance runs the full five-step sequence) | neutral DONE |
| ✅ | M2-2 | the work-type veto — merged 2026-07-30, PIN M2-e re-pinned (P1/P3 moved, P2 held); full five-step acceptance driven incl. M2-3's deferred steps 4/6 | M2-e DONE |
| ✅ | M2-20 | "the ship is waiting on you" — merged 2026-07-30, pin-neutral. Item 11 shipped SHORT ("Awaiting orders"): the recommended long form measured CLIPPED in both docks; reversible at `GameSession.AwaitingOrdersLabel`, re-measure on reversal. Card taught WORK by dropping the Space row | neutral DONE |
| ✅ | M2-18 | `ReasonWorkTypeOff` — merged 2026-07-30, pin-neutral; the boot tile + M2-20's pawn word tell one story. FILED for owner: the work-type ▸ reach ranking is arguably invertible (see HANDOVER) | neutral DONE |
| ✅ | M2-5 | cross-family ranking — merged 2026-07-30, both halves, blindings verified. PIN ROW M2-g DISCHARGED WITH NO MOVE (mechanism instrumented: no pinned fixture enables work). FILED: pull-vs-pull equal band still ties by distance (charter tension) | M2-g DONE |
| 15 | M2-6 | the `why` line on `TaskLabel` | neutral |
| 16 | M2-8 | pre-emption (0 lines in `sim/`, 3 host lines) | neutral |
| 17 | M2-19 | the sticky claim (`HeldByOrder`) — "that machine, NOW" means holding, not cancelling | neutral |
| 18 | M2-9 | `PrioritiseJobCommand` (+ emits `ReasonNoConsumable`) | neutral |
| 19 | M2-10 | right-click *Prioritise: repair X* | neutral |
| 20 | M2-11 | off-network authoring defect (D-1 half 1: 0 of 626 devices off-network) | M2-c |
| 21 | M2-12 | `EffectiveRate` on generation — condition-blind power fixed; **the lights-come-back package** (promoted, OD-K) | M2-d = rollback point |
| 22 | M2-17 | re-baseline: teach the occupancy harness to author a grid (OD-I) — INFRA | neutral |

Retracted / never existed: M2-7, M2-13…M2-16. M1-J dropped same day (survives as a source
comment). Pin rows remaining, in order: `M2-c` → `M2-d` → `M3-a…d`. Done: `M2-a` (M2-1) ·
`M1-c` (M2-21, measured pin-neutral, left the chain) · `M2-e` (M2-2, tag `pin/m2-e`) ·
`M2-g` (M2-5, discharged with no move — mechanism instrumented, no tag). Letters are
historical ids, not ordinals.

## 4. M3–M5 (outlines; charters get written at end of M2, not before)

- **M3:** M3-1 `Device.Name` double duty (INFRA — decide before the save chapter freezes) ·
  M3-2 `CryoSystem` · M3-3 `ThawGate`/`ThawCommand` · M3-4 MOSS POD BAY · M3-5 emergency
  thaw + lose screen · M3-6 pod census · M3-7 skill consumers · M3-8 sleeper personas ·
  M3-9 REST · M3-10 a heater · M3-11 deck-1 vent · M3-12 skills in WORK tab · M3-13 thaw
  refusals. (Also decide: schedules — T15.) ⛔ **Charter all of these against OD-L**: the
  pod bay states per-pod failure reasons that direct the player's repairs, and the pods'
  repair items form an escalating production-chain ladder (M3-6's census + M3-13's
  refusals carry the ladder; content authoring for the chain depths is new M3 scope).
- **M4:** M4-1 Persona design (INFRA) · M4-2 build it · M4-3 dossier stops lying · M4-4
  Health/Morale real-or-delete · M4-5 onboarding rewrite · M4-6 RUG/SHELF · M4-7 Chronicle
  reachable · M4-8 WP-9 console deletion.
- **M5:** M5-1 the ending · M5-2 alerts · M5-3 mid-game goal · M5-4 art pass · M5-5
  Regolith→Rubble rename · M5-6 device-removal hole · M5-7 save/load (own lane).

## 5. Owner-decision ledger (binding; one row each)

| OD | decision | binds |
|---|---|---|
| A | Repair is a WORK TYPE under the grid + right-click prioritise; never a paint designation | all of M2 |
| B | Economy PARKED at E0-complete; E1 unopened; A1 retired as goal (regression stat only); gate re-chartered "one crew member alone reaches a second thaw" | parks E1–E4 |
| C | Ship interior authored-explored at boot | M1-A ✅ |
| D | Vent premise reworded (docs-only) | M1-G ✅ |
| E | Deck 1 stays dead (no vertical gas term is SHIPPED FILED) | standing refusal |
| F | Repair soft-lock fixed by authoring consumables, not by softening the floor | M1-I ✅ |
| G | The pawn boots idle and waiting; the opening IS an order; autonomy resumes after | M2-20 |
| H | The work grid defaults OFF — work is opt-in; WORK tab becomes BLOCKING | M2-1 ✅, M2-3/M2-4 |
| I | One rule, OFF everywhere — fixtures too; M2-17 teaches the harness to author a grid | M2-1 ✅, M2-17 |
| J | v1 work-list order = Repair · Construct · Craft · Deconstruct · Mine · Haul — and it IS the equal-band tie-break | M2-5, M2-3 layout |
| K | ＋ADD ROOM deleted; every compartment IS a room; + four delegated calls: phase-1 exit gate = "order a repair, the lights come back" · M2-12 promoted · build the vacuum-work ladder · keep M1-I's thermal reprieve | M1-L ✅, M2-12, ladder unchartered |
| L | **The opening arc is POD-DRIVEN** (2026-07-30): the pawn wakes to a ship of frozen/dead crew and the goal is unfreezing. MOSS controls freeze/unfreeze **per pod** and states each pod's **failure reason — the reason IS the hint what to repair next**. Pods form an **escalating repair ladder**: each successive pod's repair item needs a deeper production chain (pod 2 a simple item; pod 3 one with more pre-processing; …) — chain DEPTH is the difficulty curve, refining OD-11's Parts-count escalation. WORK tab stays the high-level prioritisation; per-target detail via right-click prioritise (re-ratifies OD-A) and the POD BAY | M3-2/3/4/6/13 charters (written at end of M2), OD-11/OD-12, M2-9/M2-10 unchanged |

Unchartered from OD-K: the **vacuum-work ladder** (playerForced bypass → opt-in deadly
work givers → self-rescue suppression, RW§2.4's `Danger` ladder as the analogue) — needs a
package id in M2 or M3; today `WorksiteSafety`'s refusal is bare and silent.

## 6. Live defects on `main` (filed, scheduled or owned — not a self-executing queue)

- **D-1** `PowerSystem` condition-blind both halves; 18.000 kW supply vs 20.900 kW demand;
  every light out at sim-hour 7 on the wreck → M2-11/M2-12. (Earlier roadmap power figures
  described a model that doesn't exist; trust the driven measurement, re-measure at M2-12.)
- **D-2** BUILD order behind a shut door is completely silent → CLOSED by M2-21 (2026-07-29):
  backs off on `_matRetryAt`, visible on the `blocked` channel. Residuals filed in HANDOVER
  (per-site suppression on multi-pawn ships untested; retry maps never pruned; phase B safe
  only via phase A).
- **D-3** social argument gate permanently open on every pair → unscheduled; file with M4.
- **D-4** M1-K merged against a send-back; fix-forward landed (`da376b8`) — verify closed.
- Standing, owner-accepted: no vertical gas (OD-E) · no heater until M3-10 · no save/load
  until M5-7 · door has no removal verb until M5-6 · grid ship's water still conjured (B-2)
  · A3 never measured.

## 7. Parked (do not start; one line of what re-opening costs)

- **Economy E1–E4** (OD-B): re-opening needs an owner faucet decision first.
- **Phase-2 automation** (operator model, ledger UI, ControllerModule gate, terminal sink,
  outposts): design is ready (`perilune-automation-and-souls.md`); carrier milestone
  deliberately unscheduled until the RimWorld loop passes the week-9 human gate.
- **P3 Voyage / nav / derelicts** (`PLAN.md`): after M5.
- **Console retirement WP-9**: scheduled inside M4-8, not before the Persona re-home.

## 8. Risks (early warnings only)

1. M2-2's veto without M2-3/M2-4 merged first = a game with no work and no way to enable
   it — watch merge order, not just green gates.
2. The dispatcher has five entry sites; a "fixed" priority bug that only patched
   `TryAssign` is the M2-0 spike repeating — demand the driven five-site test.
3. Two pin rows in flight at once — the chain rule exists because this failed; check
   `git tag pin/*` before starting a pin-moving lane.
4. Week-9 human gate slips silently — the integrator names the date when M3-1 merges.
5. Doc drift: a stale number quoted from a doc instead of re-measured — the twice-proven
   failure; `docs/PROCESS.md` §1 step 3.
