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
| ✅ | M2-6 | the `why` line — merged 2026-07-30 (after M2-8; deliberate swap, disjoint files). One send-back: the clause measured INVISIBLE in both crew docks (26/23-char ellipsized cells vs 43–54-char lines); fixed by the M2-20 precedent — docks render the WHAT half at the declared ` — ` separator (`GameSession.RankingSeparator` ↔ `WHY_SEPARATOR`), the full WHAT—WHY reads in the Overview selected readout. Room Zoom has NO readout at all → clause unreachable there, filed to M4 Persona | neutral DONE |
| ✅ | M2-8 | pre-emption — merged 2026-07-30 AHEAD of M2-6 (still in fix-back; disjoint files, no semantic coupling — the swap is deliberate and recorded). Check A = 0 proven for the revision-3 reason; the seam is `JobSystem.Tick`'s busy branch (`TryPreempt`), survival guard rides `WorkTypeMap.TryOf`. NOT browser-demonstrable until M2-19 (by charter) | neutral DONE |
| ✅ | M2-19 | the sticky claim — merged 2026-07-30, pin-neutral (storage rode M2-1 as chartered). One line: `IsRecruitableIgnoringJob` gained `!HeldByOrder`; release = the `JobKind` setter clears the hold on `None` (RW§2.2's job-scoped forced flag; NO timeout, NO re-issue record — an interruption ends the order, filed §13.25d). MEASURED: claim gates are SUBSUMED (held ⇒ has a job), the hold's whole bite is the pre-emption path, and neither read point is individually pinned — the property is. Writer contract for M2-9: job first, hold second | neutral DONE |
| ✅ | M2-9 | `PrioritiseJobCommand` — merged 2026-07-30, pin-neutral. §2.2 ruling PINNED: an order beats a priority-0 grid, never `WorkIncapable`, never staging. `ReasonNoConsumable` emitted for exactly the ordered-unfixable case (fixture strips all 11 authored consumable units). One send-back (4 defects: unpinned wire parse — the reviewer's four-way break survived 0/53; same-machine re-order wiped the service; stale-order leak; citations) — fixed, re-verified. Same-machine order ADDS the hold (integrator-approved: "stay on that") | neutral DONE |
| ✅ | M2-10 | right-click *Prioritise: repair X* — merged 2026-07-30, pin-neutral, client-only. One send-back (a z-index "fix" measured INERT — a descendant of the surface's z-index:20 stacking context can never beat body-level chrome at 120; replaced by the `.ov-nudge` geometric-clamp precedent · menu names derived from SUBSTITUTED art — five of six wrong; now `DEVICE_KIND_NAMES` pinned member-for-member against `Device.cs`). Pawn rule: selection, else sole living soul, else toast. Milestone demo = integrator's post-merge acceptance | neutral DONE |
| ✅ | M2-11 | off-network authoring defect — merged 2026-07-30, decision (a) content-only: deck 1 genuinely off-network (23 of 611 devices; demand 20.40 → 14.30 kW flat), PowerSystem untouched. PIN ROW M2-c DISCHARGED WITH NO MOVE (check A = 0, twin P1 match; no tag). Side effect: D-1's blackout half CLOSED (8/16 deck-0 lamps stay lit through h24, batteries charge). One send-back (the pin comment stated the net −15 as the deletion count — the package's own defect class in its own test file; + a helper assert that swallowed legs, A/B-proven load-bearing) | M2-c DONE |
| ✅ | M2-12 | `EffectiveRate` on generation — merged 2026-07-30, **the lights-come-back package**. One term (`PowerSystem.cs:235`); curve 10.65 → 13.47 (benches) → 17.40 kW ceiling (on boot stock without crafting — Parts ARE producible), floor 9.00 never 0. Winnability PASSES unattended (LS+Defense served h0–h24, no content change); with Repair granted the Parts goes to `wing_c` at h0.26 — the wings win. ⚠️ **PIN ROW M2-d: NO PIN MOVED where the charter predicted P2/P3** — both goldens sit inside a bit-identical float window (perilune diverges t=3261, slice t=7011, both independently measured twice); P1 structurally blind (scenario ship in surplus; non-vacuity control: zeroed generation DOES move it). **No pin sees the generation term — the two-sided ±0.05 bands in `GenerationWearTests` are the sole instrument.** Tag `pin/m2-d` = rollback point. Two send-back rounds (5 false statements incl. a bank-bridged can't-fail winnability leg, then 4 missed citation mirrors — sweep the class, not the list) | M2-d DONE (tag, no move) |
| ✅ | M2-17 | re-baseline — merged 2026-07-30, pin-neutral (check A = 0, P1 twin match), **M2 IS CLOSED**. The occupancy harness authors its grid per leg via `SetWorkPriorityCommand` (OD-I's assigned cost paid), prints it beside every number, and refuses a vacuous zero by exit code (granted+mismatch=3, granted+zero-work=2). Re-baseline recorded in MECHANICS §13.26: grid's A1 was ALREADY 0.000 % pre-M2 (economy ends at h16 — matter, not labour); the two 0.000 % causes are now distinguishable only by the printed grid. **A3 measured for the first time ever**: a granted wall completes in ~4–5 sim-min (Construct ALONE suffices — HaulToBuild maps to Construct), never without a grant. One send-back (a backwards work-type caveat in shipped output + an `all@0` guard hole proven by mutation) | neutral DONE |

Retracted / never existed: M2-7, M2-13…M2-16. M1-J dropped same day (survives as a source
comment). Pin rows remaining, in order: `M3-b…d`. Done: **`M3-e` (M3-15, tag `pin/m3-e`,
2026-08-01 — P1 only, `25f604dd61b221fb` → `13674ebc4f8a14a9`; NOT the gate — the gate is
measured INERT on P1 — but the one Terminal authored into `BuildScenario` so the scenario
fixture's LS watch keeps firing through OD-N's gate; unlettered by the charter, taken when
the fixture survey hole surfaced)** · **`M3-a` (M3-2, tag `pin/m3-a`,
2026-07-31 — P1/P2/P3 fold-only for CryoSystem's SYSS seed, cause measured)** · `M2-a` (M2-1) ·
`M2-d` (M2-12, tag `pin/m2-d`, NO move — the designated power-package rollback point) ·
`M1-c` (M2-21, measured pin-neutral, left the chain) · `M2-e` (M2-2, tag `pin/m2-e`) ·
`M2-g` (M2-5, discharged with no move — mechanism instrumented, no tag) · `M2-c` (M2-11,
discharged with no move — wreck-only content, no tag). Letters are historical ids, not
ordinals.

## 4. M3–M5 (outlines; charters get written at end of M2, not before)

- **M3:** ✅ **CHARTERED IN FULL, 2026-07-30 — `docs/design/perilune-m3.packages.md`** (queue, seams,
  pin rows `M3-a…d`, conflict matrix, and an **eight-item owner batch — ANSWERED 2026-07-31, gate CLEARED (OD-M)**;
  it also corrects the pod census below from 8/1/5/2 to the shipped **12/1/7/4**, and gives OD-K's
  vacuum-work ladder the id **M3-14**). The outline that follows is kept as the index.
  M3-1 `Device.Name` double duty (INFRA — decide before the save chapter freezes) ·
  M3-2 `CryoSystem` · M3-3 `ThawGate`/`ThawCommand` · M3-4 MOSS POD BAY · M3-5 emergency
  thaw + lose screen · M3-6 pod census · M3-7 skill consumers · M3-8 sleeper personas ·
  M3-9 REST · M3-10 a heater · M3-11 deck-1 vent · M3-12 skills in WORK tab · M3-13 thaw
  refusals · ⭐ **M3-15 MOSS-gated actuation** (OD-N, 2026-07-31 — the doors and vents answer
  only to MOSS, and the console needs `term_moss` repaired; queue position 6b, SPINE) ·
  ⭐ **M3-16 the malfunctioning board** (OD-O, 2026-07-31 — `vent_d1`'s switch is dead and the
  player writes a two-line MOSS program to work around it; queue position 8b).
  (Schedules — T15: DECIDED, deferred; RW§3.5's mechanism rides M3-9, OD-M item 3.) ⛔ **Charter all of these against OD-L**: the
  pod bay states per-pod failure reasons that direct the player's repairs, and the pods'
  repair items form an escalating production-chain ladder (M3-6's census + M3-13's
  refusals carry the ladder; content authoring for the chain depths is new M3 scope).
- **M4:** ✅ **CHARTERED IN FULL, 2026-08-04 — `docs/design/perilune-m4.packages.md`**
  (queue, seams, pin rows `M4-a…c`, conflict matrix + 12 couplings, and a **five-item
  owner batch — OPEN, every item with a stated silence default**; written against OD-R's
  three registers per the binds cell: M4-1's Persona design IS the charter's §5, with the
  TWoM-gameplay section — deterministic break ladder priced in hashed fields, design
  questions (a)–(h) ruled-or-forked — and an M5-1 forward charter. **Owner review
  pending; the 08-07 playtest's findings amend the charter before M4-2 implements**).
  The outline that follows is kept as the index.
  M4-1 Persona design (INFRA — doc written, owner review open) · M4-2 build it ✅ · M4-3
  dossier stops lying · M4-4 Health/Morale real-or-delete · M4-5 onboarding rewrite ·
  M4-6 RUG/SHELF · M4-7 Chronicle reachable · M4-8 WP-9 console deletion.
  ⭐ **M4-9 THE FIRST MENTAL BREAK — the ninth package, created by OD-S item 1 = A** (not by a
  charter; §4's numbering rule). Merge-order position **4b**, pin row **`pin/m4-b`**, RUNS ALONE.
  **BUILT 2026-08-05** (MECHANICS §13.51): the deterministic ladder, the HOW SHE IS band that
  closes M4-2's PARTIAL *how she is* clause, the Chronicle line, and the graduated override.
  ⛔ Pins P1/P2/P3 MOVED, P4/P5 HELD — values in `ci.sh`'s M4-b block; **the integrator re-pins
  CLAUDE.md + HANDOVER + memory and writes the `pin/m4-b` tag at merge.**
- **M5:** M5-1 the ending · M5-2 alerts · M5-3 mid-game goal · M5-4 art pass · M5-5
  Regolith→Rubble rename · M5-6 device-removal hole · M5-7 save/load (own lane).

## 5. Owner-decision ledger (binding; one row each)

| OD | decision | binds |
|---|---|---|
| A | Repair is a WORK TYPE under the grid + right-click prioritise; never a paint designation | all of M2 |
| B | Economy PARKED at E0-complete; E1 unopened; A1 retired as goal (regression stat only); gate re-chartered "one crew member alone reaches a second thaw" | parks E1–E4 |
| C | Ship interior authored-explored at boot | M1-A ✅ |
| D | Vent premise reworded (docs-only) | M1-G ✅ |
| E | Deck 1 stays dead (no vertical gas term is SHIPPED FILED). **HEADLINE AMENDED 2026-07-31 by OD-M item 2, for M3-11: deck 1 boots dead and the player MAY bring it back (authored vent + riser tap, vent wrecked); the MECHANICAL half — no vertical gas term — STANDS** | standing refusal (mechanical half); M3-11 |
| F | Repair soft-lock fixed by authoring consumables, not by softening the floor | M1-I ✅ |
| G | The pawn boots idle and waiting; the opening IS an order; autonomy resumes after | M2-20 |
| H | The work grid defaults OFF — work is opt-in; WORK tab becomes BLOCKING | M2-1 ✅, M2-3/M2-4 |
| I | One rule, OFF everywhere — fixtures too; M2-17 teaches the harness to author a grid | M2-1 ✅, M2-17 ✅ |
| J | v1 work-list order = Repair · Construct · Craft · Deconstruct · Mine · Haul — and it IS the equal-band tie-break | M2-5, M2-3 layout |
| K | ＋ADD ROOM deleted; every compartment IS a room; + four delegated calls: phase-1 exit gate = "order a repair, the lights come back" · M2-12 promoted · build the vacuum-work ladder · keep M1-I's thermal reprieve | M1-L ✅, M2-12 ✅, ladder = M3-14 (rungs set by OD-M item 7) |
| L | **The opening arc is POD-DRIVEN** (2026-07-30): the pawn wakes to a ship of frozen/dead crew and the goal is unfreezing. MOSS controls freeze/unfreeze **per pod** and states each pod's **failure reason — the reason IS the hint what to repair next**. Pods form an **escalating repair ladder**: each successive pod's repair item needs a deeper production chain (pod 2 a simple item; pod 3 one with more pre-processing; …) — chain DEPTH is the difficulty curve, refining OD-11's Parts-count escalation. WORK tab stays the high-level prioritisation; per-target detail via right-click prioritise (re-ratifies OD-A) and the POD BAY. **"freeze/unfreeze" read as UNFREEZE ONLY (OD-M item 6, 2026-07-31): a pod is single-use, `Device.Name` immutable after boot — MECHANICS §13.27; FREEZE-as-verb is a named follow-on** | M3-2/3/4/6/13 charters (written at end of M2), OD-11/OD-12, M2-9/M2-10 unchanged |
| M | **M3 owner batch ANSWERED 2026-07-31 — all recommendations adopted (1A 2A 3A 4A 5A 6A 7B 8A)**; the position-0 gate is CLEARED. **Item 2 AMENDS OD-E's headline** (deck 1 boots dead and may be brought back; no vertical gas term); **item 7 DEVIATES from OD-K's rung list** (ladder ships rungs 2+3+4; rung 1 — OD-K's named middle rung — deferred BY NAME to M3-7's pin lane). Also: 1 re-key the rungs monotonic in depth (`3 → 0 0 2 2 3 3 3`, last rung 3× the gate; commissioning is the PROLOGUE *"restore MOSS"*, not a rung) · 3 no schedule grid in M3, RW§3.5's mechanism adopted inside M3-9 (T15 decided-deferred) · 4 M3-5 ships sim state + Chronicle + a one-line banner, M5-1 builds the screen · 5 thawed souls arrive with the grid OFF, the gate sentence is satisfied by the skill columns (OD-H/OD-I untouched) · 6 unfreeze only, a pod is single-use, `Device.Name` never mutates, M3-1 is a recorded non-change (FREEZE-as-verb FILED as a named follow-on) · 8 `Citizen.Skill` widens to a per-work-type 6-byte array inside M3-7's existing M3-b chapter bump, not a second re-pin | M3-1/2/3/5/6/7/8/9/11/12/14 (the union of the eight items' own binds cells — **M3-8 rides items 5 and 8**: its seven persona sheets are written against six independent skills); amends E, deviates from K |
| N | **THE SHIP ANSWERS TO MOSS** (owner-direct, 2026-07-31, in conversation — *not* a batch item): *"The doors should be open and closed via MOSS and MOSS should only be accessible once a MOSS server has been repaired (has to be in an open room of course)."* Scoped by three follow-ups. **(i) Doors AND vents**: the Room Zoom's direct OPERATE click verb is REMOVED for both; remote actuation happens only through MOSS. **(ii) The MOSS server IS `term_moss`** — the existing wrecked Terminal in the cryo bay (`AuthoredShips.cs:2059`, Condition 0.14, `scriptable: false`), **no new device kind**; it already sits in the boot-air room, which satisfies *"has to be in an open room"*. **(iii) ⭐ SPLIT GATE**: `term_moss` **REPAIRED** ⇒ the **MOSS CONSOLE** — manual actuation only, one command at a time (open/close/lock/unlock a door, open/shut a vent); `term_moss` **COMMISSIONED** (1×`ControllerModule`, **OD-M item 1A's pricing UNCHANGED**) ⇒ scripting/programs, and — per M3-3 term 2, unchanged — the thaw and the M3-4 POD BAY. ⛔ **The split is the anti-deadlock clause, and the owner chose it after being shown the deadlock**: no `ControllerModule` is aboard at boot and the whole Regolith→Scrap→Parts→CM chain *"lives behind these three doors"* (`AuthoredShips.cs:2093-2096`), so MOSS-only doors plus a single commissioning gate would make doors need MOSS need the module need the benches need the doors. Commissioning now gates **programs and the pod bay**, not the console | **M3-15** (new; charter in `…m3.packages.md` §5, queue position **6b**). Amends the opening beat: under OD-G the first order becomes **"repair `term_moss`"**. Touches **M3-4** / **M3-13** assumptions (one ⚠️ box each). **ANSWERS M3-11's filed deck-1 reachability blocker** (the console opens the door remotely); M3-11's *survivability* blocker stays open on the owner. **M3-14 unchanged.** OD-M item 1A pricing explicitly UNCHANGED |
| O | **A PUZZLE INSIDE MOSS** (owner-direct, 2026-07-31, in conversation, after OD-N): *"Let's make that a 'game' within MOSS, so the user has to do some simple programming to activate the vent — storyline could be that the easy turn-off switch does not work as the controller module is malfunctioning so we have to do a workaround."* Scoped by three follow-ups plus one clarification. **(i) `vent_d1` is re-authored MECHANICALLY FINE** — Condition above `AirVent`'s fail floor (**0.10**, `MachineDefs.cs:39`); it is authored 0.06 today (`AuthoredShips.cs:2169`, M3-11, merged `8d206ca`). **Its CONTROL BOARD is dead**: the direct switch — under OD-N that is the MOSS console DEVICE verb `open vent_d1` — refuses with an authored story reason (**`CONTROLLER FAULT — BOARD UNRESPONSIVE`**). **No crewed repair is needed, so M3-11's filed SURVIVABILITY blocker DISSOLVES for this vent** (nobody has to cross deck 1 to fix it). **(ii) PROGRAM-ONLY path** — there is deliberately no spend-a-`ControllerModule`-to-replace-the-board alternative. **(iii) ⛔ NOT A GENERAL PATTERN** — the owner softened this explicitly on follow-up: *"not a pattern for all devices — it's an idea we can apply sometimes as a game element."* ⇒ chartered as an **AUTHORABLE STORY TOOL**: the fault is authored data, so a future instance costs one line of authoring + a refusal message + a workaround — **but there is NO systemic per-device fault mechanic, no sweep, and M3 ships EXACTLY ONE instance (`vent_d1`)**. It does **not** compete with the parked phase-2 automation game (§7): that is control-not-conveyance at scale; this is one authored puzzle. ⭐ **SEQUENCING CONSEQUENCE, stated plainly: the workaround is a PROGRAM, and under OD-N installing a program needs the COMMISSIONED terminal ⇒ deck-1 air becomes a POST-COMMISSION beat** — after the frontier, the benches and the `ControllerModule`, not part of the opening | **M3-16** (new; charter in `…m3.packages.md` §5, queue position **8b**). **Amends M3-11's queue row** (its survivability blocker dissolves for this vent) and **M3-15's interaction notes**. ⚠️ **The authored fault is a hashed bit in the EXISTING device state word (b12 — b12–b15 are free), fold-neutral while false, with its own DEVC bump in M3-16's commit; it falls back to M3-2's `pin/m3-a` ONLY if measurement disagrees.** Named in §9's couplings (11–13) and priced in the charter's design question (a) |
| P | **THE MOSS CONSOLE IS A TERMINAL** (owner-direct, 2026-07-31, from live play, after verifying the input fix): *"I do not like these shortcuts like 'L' or 'P' — we need to expand the MOSS OS and part might be an 'ls' command later, to read directories… but as soon as we press l, the log opens."* Standing vision restated the same session: **"MOSS should be the OS of the ship."** ⇒ **Every printable character belongs to the PROMPT; screens are reached by TYPED COMMANDS only** (`log`, `prog`, `status`, `open`, `clear`, `exit` — all pre-existed; the letters were a redundant layer). Non-printable navigation keys (Enter/Escape/arrows/PageUp/Down/Home/End/Tab) keep their semantics — a terminal has those too. **SHIPPED same day** (`42f59ca`, one send-back — the design-preview harness still navigated by the deleted keys AND its screenshot verdict echoed the requested screen instead of the rendered one; both fixed, the harness now fails hard on a mis-capture). Completion ruling folded in (reviewer-accepted as measured-minimal): ENTER on a non-empty buffer submits on any screen that shows the prompt, and a bare `log` typed on DETAIL inherits that system's filter — without these the typed path could not replace the deleted keys where they mattered most. Spec IX-M8/§2 amended in place, dated. **Future MOSS-OS expansion (`ls`, directories) is VISION, not chartered scope** — file ideas against M3-15/M3-4, never implement from this row | MOSS UI (shipped `42f59ca`); binds M3-15/M3-4/M3-13/M3-16 acceptance scripts (**no charter may press a letter hotkey — type the command**) |
| Q | **THREE PRE-PLAYTEST RULINGS** (owner-direct, 2026-08-04, in-session — the session-H ⭐ batch answered): **(i) D7 brownout trade — KEEP THE CACHE.** The shipped seven cabin-stores crates stand with the trade taken (at 3 Parts aboard the wreck stops browning out; bands don't overlap); the one-line revert stays documented at `AuthoredShips.cs:2661` and the reprice alternative (`device_place_cost` 3→2 + `device_parts` 2→1 + ONE crate, moves P4/P5) stays FILED, not taken. Revisit only if the playtest feels flat. **(ii) The typed `doors` verb's shape is RATIFIED** (id · DECK n AT x,y · state, REPAIRED tier) **and `vents` IS the second noun** — shipped same day (`lane/moss-vents-verb`; `VENT_D1` lists with `· BOARD FAULT`, actuation refusal untouched). Further nouns remain unchartered (OD-P's never-implement-from-the-vision clause stands). **(iii) SHELF/RUG keep the honest refusal until M4-6** — buttons stay on the palette, refusing with the honest sentence; wire-or-remove decided AT M4-6, not before | D7 content (closes session H's ⭐⭐) · MOSS directory verbs (`doors`/`vents` shipped shapes) · M4-6 |
| R | **THE THIRD PILLAR — THIS WAR OF MINE** (owner-direct, 2026-08-04, in conversation; **AMENDED same day on owner follow-up**: *"it should be more than a tone — an important part of gameplay"*): the target gameplay is **RimWorld × Factorio × This War of Mine**, and TWoM is a **GAMEPLAY PILLAR** — scarcity that cannot be fully relieved, who-to-wake / who-to-risk triage, consequences carried by named people, endurance not power fantasy. Scoped by three follow-ups, all recommendations adopted: **(i) TRIAGE IS EMERGENT FROM REAL SCARCITY** — the sim authors the can't-save-everyone moments (air, food, parts, time genuinely insufficient at moments; the O2/CO2 over-thaw punishment is the seed), NEVER scripted dilemmas and never dice — scarcity TUNING becomes chartered M4/M5 work. **(ii) DETERMINISTIC MENTAL BREAKS** — psychological state gates BEHAVIOUR (refuse dangerous orders, stop working, withdraw), driven by deterministic thresholds over the hashed mood/memory state — T12's missing half; RimWorld's mental-break mechanism (RW§4) worn with TWoM's tone. **(iii) LANDS INSIDE M4 + M5** — M4-1's Persona design charter grows a TWoM-gameplay section (triage, breaks, grief), M5-1's ending carries the survivors-and-cost payoff; no new milestone, queue order stands. RimWorld stays the MECHANISM authority (breaks are RW§4's shape); TWoM is the authority for what the mechanisms are FOR. ⛔ **Scope clause: nothing is implementable before the M4-1 charter** — no break table, no scarcity retune, no misery meter (TARGET §2; breaks are computed consequences, never fed bars, never rolls); file ideas against M4-1/M5-1. Recorded with the same-day drift check: PROCESS §2 gains the lane-selection gate + `rows:` disclosure | TARGET §1/§2/T12 amended · PROCESS §1/§2 amended · M4-1 and M5-1 charters (written at M4 open, this row sets their TWoM-gameplay section) |

From OD-K, now chartered as **M3-14**: the **vacuum-work ladder** (playerForced bypass →
opt-in deadly work givers → self-rescue suppression, RW§2.4's `Danger` ladder as the
analogue). **OD-M item 7 ships rungs 2+3+4**; `WorksiteSafety`'s refusal is still silent.

## 6. Live defects on `main` (filed, scheduled or owned — not a self-executing queue)

- **D-1 CLOSED** (both halves, 2026-07-30): M2-11 took deck 1 genuinely off-network
  (demand 20.40 → 14.30 kW, sim-hour-7 blackout gone); M2-12 made generation ride
  `EffectiveRate` (repairing a wing steps the ledger). Residue filed in HANDOVER: shed
  lamps flicker at 0.5 Hz on a flat bank (§13.11 family) · `Device.Rate` now scales
  generators (a MOSS throttle lever, nothing writes it today) · no wire carries
  powered-ness per device (`oper` is wear-only).
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
