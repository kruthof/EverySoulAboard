# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-30 evening session — FIVE merges, the M2 neutral tail is DONE)

**Gate on `main` (`84ac560`): `./ci.sh` exit 0, 1515 dotnet + 1119 node, twin hashes MATCH
at P1 `81733e27709f36e4`** (pin table in `CLAUDE.md`; re-measure before quoting). **All five
pins unmoved all session** — every package pin-neutral, each proven by check A = 0 lines.

**THE DIRECT-ORDER ARC WORKS END TO END** (M2 milestone demo driven headless on the merged
tree, 5/6 steps PASS; screenshots in the session scratchpad `demo/`). Merged, in order:

- **M2-6** the `why` line — the Overview selected readout reads *"Stripping the wall at
  12,10 — Deconstruct is priority 1"* and follows a priority flip; the crew docks
  deliberately show the WHAT half only (send-back: the clause measured INVISIBLE in both
  ellipsized docks; fixed by the M2-20 precedent — text, never dock geometry — split at
  `GameSession.RankingSeparator` ↔ `WHY_SEPARATOR`).
- **M2-8** pre-emption — a strictly higher band takes a busy pawn back in one tick, via
  `Simulation.CancelJob` in `JobSystem.Tick`'s busy branch; Flee/Eat/Drink refuse via
  `WorkTypeMap.TryOf`; equal band never fires. Merged AHEAD of M2-6 (deliberate swap,
  disjoint files, recorded in ROADMAP).
- **M2-19** the sticky claim — `IsRecruitableIgnoringJob` gained `!HeldByOrder`; release =
  the `JobKind` setter clears the hold on `None` (RW§2.2's job-scoped flag; no timeout, no
  re-issue record). MEASURED: claim gates are SUBSUMED (held ⇒ has a job) — the hold's
  whole bite is the pre-emption path, and the PROPERTY is the pin, not either read site.
- **M2-9** `PrioritiseJobCommand` — "that machine, now": cancel → assign → hold, all nine
  refusals BEFORE the cancel. §2.2 PINNED: an order beats a priority-0 grid, never
  `WorkIncapable`, never staging. `ReasonNoConsumable` reaches the `blocked` channel for
  exactly the ordered-unfixable case. Send-back closed 4 defects, headline: the wire parse
  was pinned by NOTHING (a four-way field break survived 0/53 — the shipped-once
  copy-paste shape; now each break has its own red leg).
- **M2-10** right-click *Prioritise: repair X* in the Room Zoom — `{cmd:'prioritise', cid,
  x, y, deck}`, integrator-fixed contract, byte-stable across both lanes' send-backs.
  Send-back closed 2 defects: an INERT z-index fix (a descendant of the surface's
  stacking context can never beat body-level chrome — replaced by the `.ov-nudge`
  geometric clamp, measured) and menu names derived from SUBSTITUTED art (5 of 6 wrong;
  now `DEVICE_KIND_NAMES` pinned member-for-member against `Device.cs`).

**Demo highlights** (falsifying steps): Deconstruct@1 beat Repair@4 for 1011 sim-s with 39
needy machines on board (0 servicing samples) · the mid-service flip ABANDONED a 900 s
service 60 s in (condition 10/255 unchanged — genuinely dropped) · the right-click order
crossed the ship past a needier machine and HELD 121 sim-s, one label, never stolen.
Step 7 (lights come back) is M2-11/M2-12 — the remaining M2 work. Every package: Opus
implementer + separate independent reviewer; three send-backs, all fixed and re-verified.

## Next (from `docs/ROADMAP.md` §3)

1. **M2-11** off-network authoring (pos 20, **PIN CHAIN `M2-c`, RUNS ALONE** — check
   `git tag pin/*` first; last mover `pin/m2-e`).
2. **M2-12** `EffectiveRate` — THE LIGHTS-COME-BACK package, the phase-1 exit gate
   (PIN `M2-d` = rollback point).
3. **M2-17** teach the occupancy harness to author a grid (INFRA; after the veto the P1
   run exercises no job system at all until this lands).
4. Then M2 is closed: write the M3 charters against OD-L (pod ladder) + the vacuum-work
   ladder package id (OD-K delegated call, still unchartered).

## Open on the owner

- **The crew docks vs 27-char labels** (demo's one FAIL): `.ov-crewtask` clips
  `"Stripping the wall at 12,10"` at 145 px — the tile coordinate is eaten, so the dock
  names the wrong tile. Pre-existing base-label width, NOT the why-clause (that is
  correctly stripped). M2-20 precedent says fix the TEXT, not the dock.
- **The Prioritise menu names the device TYPE** ("SOLAR WING"), not the authored instance
  ("wing_a") — `Device.Name` reaches no wire channel; naming instances is a host change.
  Only this half is an owner call; the type names themselves are now correct.
- M2-8/M2-2 interaction: a pawn working a type the player SWITCHES OFF is never
  pre-empted (band reads Off) — she finishes then waits; decided behaviour, may surprise.
- Carried from the overnight session: "Awaiting orders" short form (docks clip the long
  one) · onboarding card dropped its Space row · M2-18's work-type ▸ reach ranking
  arguably invertible · WORK tab's `BUILD` label collides with the BUILD tab · the
  ascending-only click cycle deviates from RimWorld's two-gesture pair · standing art
  items (door art unphotographed, `'/'` glyph, blind A/B + 60-min playtest at week 9/13).

## Open — unscheduled (filed, unowned; integrator triages against the roadmap)

- **The Prioritise menu is offered on never-serviceable machines** (CryoPod `maint = 0`):
  click → toast fires → sim refuses silently, nothing on `blocked`. M2-10's gate is "on
  the devices channel", not "can ever be serviced"; the cryo bay is full of these. Fix
  needs serviceability on a wire. Family: M2-9's four silent refusals (MECHANICS §13.25 b2).
- A legal direct order paints all other strip sites `unreachable` on `blocked` (13 badges,
  one held pawn) — true but noisy; glance and rule.
- M2-8 residue: `ClearPath`/`OrderedMove=false` in `TryPreempt` measured INERT (full suite
  green with both deleted) — only `CancelJob` is pinned; seam comment may overstate.
- `(char)('0'+band)` renders punctuation for an out-of-range stored priority
  (`SaveReader` has no range check) — unreachable in play, the "plausible prose" shape.
- The unfixable badge retires when parts arrive and does NOT return if the ship goes
  empty-handed again — RW's re-issuing `priorityWork` record is not built (§13.25d).
- `Citizen.Skill` is now the LAST reserved CITZ v8 field with no reader (M3-7's).
- Carried: `MECHANICS.md` §13.1 CO2 gap (nothing under `Jobs/` reads `CO2Ppm`) · M2-21
  residuals (per-citizen path failure suppresses the site 50 ticks; `_matRetryAt` never
  pruned) · `WorkIncapable` not on the `work` wire (WORK tab can't grey a row; M3-7/M3-12)
  · M2-5 pull-vs-pull equal-band ties by DISTANCE not `NaturalPriority` · M2-2's G5 offers
  the LLM a dig M2-5 refuses at grant · `designs` not fog-gated while `blocked` is ·
  needy-machine-below-floor scans (3 item-store scans / s / device) · unskinned glyphs
  (GrowBed `"`, Terminal `T`, Telescope `x`) · D-3 social gate open on every pair ·
  save-reload ULP drift (archived) · `WreckedPods_StillReadAsDead` non-vacuity note.
- Housekeeping: ~25 stale worktrees under `../perilune-wt/` from pre-restructure sessions
  (review-*, zoom-*, m1-era lanes) — verify merged, then prune with `git worktree remove`.

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-28 | (six lanes) | wreck ship ships: operate verb, wrecked art, devices channel; ADD ROOM stops conjuring air | green, all pins |
| 07-29 am | audit + spike | no code: metric audit (A1 retired), dispatch spike refuted `TryAssign` seam, OD-A…OD-C | n/a |
| 07-29 | m1 wave | machines visible, `vent_ls` operable, honest first screen, ERASE tool | green |
| 07-29 pm | m1-f/h/d/i/k | morale bar gone, craft thrash gone, unreachable reason on tile, 11 repair consumables, pawn select+MOVE in Room Zoom | green |
| 07-29 pm | m2-1 + m1-l | work-priority state (hashed, OFF), every compartment IS a room | green, P1–P3 re-pinned `pin/m2-a` |
| 07-29 late | doc-restructure | docs only: TARGET/ROADMAP/PROCESS/TRAPS created; CLAUDE.md + HANDOVER cut ~10× | green, pins held |
| 07-30 | nine lanes (m1-g·m2-21·m2-4·m1-l-b·m2-3·m2-2·m2-20·m2-18·m2-5) | **the RimWorld loop's first act is playable**: boot "Awaiting orders" → WORK tab → she works → off → finishes-then-waits; priorities RANK | green, P1/P3 re-pinned `pin/m2-e` |
| 07-30 pm | five lanes (m2-6·m2-8·m2-19·m2-9·m2-10) | **the DIRECT ORDER works**: the task line says WHY ("— Deconstruct is priority 1") · a raised priority takes a busy pawn back mid-service (60 s into 900 s, demo-driven) · right-click "PRIORITISE: REPAIR SOLAR WING" → she crosses the ship and HOLDS 121 sim-s against a needier machine · milestone demo 5/6 (fail = pre-existing dock width) | green, pins UNMOVED (5× check A) |
