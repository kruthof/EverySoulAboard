# TARGET — what we are building, and what "progress" means

*2026-07-29, synthesized from the owner's decisions (OD-A…OD-K, the product thesis, the
playtest verdicts) and the design corpus (`VISION.md`, the factorio-fusion evaluations,
`perilune-automation-and-souls.md`, `perilune-wreck-start.plan.md`). This file is the
optimization target. A work package exists to move a row in §3 or a gate in
`docs/ROADMAP.md` — never to improve any other number.*

## 1. The game, in order

**Every Soul Aboard is RimWorld × Factorio × This War of Mine on a wrecked ship — built in
that order.** (Third axis recorded 2026-08-04, OD-R.)

1. **Phase 1 (NOW): the RimWorld loop.** Order → pawn does it → the ship visibly changes.
   You wake one pawn in a post-raid cryo wreck; you decide who does what (work priorities,
   direct orders); repairing, salvaging and pressurizing pushes a breathable frontier
   outward; each earned thaw adds a person with different skills and a different work row.
   **Until this loop is fun, nothing else is the work.** For every mechanism decision,
   RimWorld's implementation is the analogue — `docs/design/rimworld-reference.md` §1–§3 and
   §6.1 are source-grade; cite them, do not re-derive. (Mechanism = RimWorld's; defaults may
   deliberately differ where the owner decided: work grid boots OFF, pawn boots idle.)
2. **Phase 2 (NEXT, not now): the automation game — MOSS, not belts.** Factorio's substance
   without its mechanisms: a legible production ledger, integer ratios, bottleneck
   diagnosis, and **control-not-conveyance** automation written in MOSS — scripting duty
   cycles, thresholds and policies, never conveyors that erase visible haulers. Every
   automated line is **operated by a named soul** whose mood + skill deterministically set
   throughput and defect rate — so the character game and the factory game are one feedback
   loop. Scriptability is bought with the scarcest currency (`ControllerModule`), so *what
   to automate* stays a hard choice. Binding three-clause test for any automation feature:
   removes a chore never a decision · carries a specific soul's fingerprint · gated behind
   scarcity. (`docs/design/perilune-automation-and-souls.md` is the design authority.)
3. **Always: people, not pawns — and This War of Mine is the third GAMEPLAY PILLAR**
   (OD-R, 2026-08-04, amended same day: *"more than a tone — an important part of
   gameplay"*). Crew are persons — memory, relationships, a chronicle, a voice (LLM-ready,
   never LLM-required) — and the survival game they live in is This War of Mine's:
   scarcity that cannot be fully relieved, choices about who to wake and who to risk,
   consequences carried by named people and told by the Chronicle — endurance, not power
   fantasy. Three scoping clauses (OD-R): **triage is EMERGENT from real scarcity** — the
   sim produces the can't-save-everyone moments (over-thaw's O2/CO2 punishment is the
   seed), never scripted dilemmas, never dice; **psychological state gates BEHAVIOUR** —
   deterministic mental breaks (refuse, stop, withdraw) from thresholds over the hashed
   mood/memory state, T12's missing half, RW§4's mechanism worn with TWoM's tone; **it
   lands inside M4 + M5** — M4-1's Persona charter grows a TWoM-gameplay section, M5-1's
   ending carries the survivors-and-cost payoff. RimWorld stays the mechanism authority;
   TWoM is the authority for what the mechanisms are FOR. Nothing is implementable before
   the M4-1 charter; file ideas against M4-1/M5-1. Ship playable fully offline; all crew
   interaction through one Persona window.

**The premise** (`perilune-wreck-start.plan.md`): the MSV *Perilune* was raided under way;
everyone awake is dead, the machines are shot, MOSS is dark. One pod cycles. The loop:
`SALVAGE → REPAIR → AIR → SALVAGE MORE → MOSS → A PERSON`. The pressure frontier is the
progress bar; a thawed person is the reward; over-thawing punishes itself through the
already-implemented O2/CO2 balance. The thaw goes through the MOSS terminal — the
automation surface is the door to every remaining soul.

## 2. Anti-goals (each has cost us already, or defines the genre line)

- **No metric-chosen work.** A1 scored a livelock at 91% busy as PASS, five times. Gates
  are player sentences, verified in the running game.
- **No belts, drones, logistics networks, or throughput-per-minute win condition.** Hauling
  stays crew labour so crew stay on screen. (Both the advocate and skeptic evaluations
  landed here.)
- **No dice in outcomes.** A jam is a computed consequence of a hashed mood/skill state,
  never a runtime roll. The Director schedules; physics never changes with difficulty.
- **No Sims micro-needs, no cosmetic operators** (a decorative −5% is worse than nothing).
- **No misery meters.** TWoM-as-gameplay (OD-R) still means COMPUTED consequences: breaks,
  refusals and grief come from deterministic thresholds over hashed state — never a bar the
  player feeds, never a runtime roll, never a scripted dilemma. Sadness that changes no
  decision is a decoration (the cosmetic-operator rule, applied to tone).
- **No planetfall colony game, no 3D, no multiplayer.**
- **No new UI off the standard surface** (Overview + Room Zoom; test-enforced).

## 3. The mechanism checklist (the RimWorld-parity target)

Status of the mechanisms the Phase-1 loop is made of. **This table is the metric.** A row
moves DONE only when the mechanism works in the shipping game (`./play.sh`), not when its
state exists. Update it in the same commit as the merge that moves it; re-verify a row
before building on it. RW§ = `docs/design/rimworld-reference.md` section.

| # | mechanism | RW§ | status |
|---|---|---|---|
| T1 | Work-type priority grid per pawn (1–4, 1 highest, blank=won't; OFF by default per OD-H) | §1.2, §1.5 | DONE (M2-1 state + M2-2 veto + M2-3 UI; grid drives behaviour in ./play.sh, demo 07-30) |
| T2 | WORK tab on the standard surface + wire channel | §1.7 | DONE (M2-3 + M2-4, merged 07-30; the game's primary control surface) |
| T3 | Dispatcher honours the grid at every claim site (11 sites, 5 gates, 3 exclusions) | §1.8 | DONE (M2-2, merged 07-30; boot is all-off and she waits — demo-verified) |
| T4 | Cross-family ranking + tie-break by work-list order (OD-J) | §1.3 | DONE (M2-5 both halves; demo: Deconstruct@1 beat Repair@4 over 1011 sim-s, 0 servicing samples). KNOWN LIMIT: pull-vs-pull equal band still ties by distance (filed) |
| T5 | Right-click "Prioritise: repair X" forced order | §2.2 | DONE (M2-9 + M2-10; demo step 6: order crossed the ship and landed). M3-14 (07-31): a held order now crosses the pressure frontier — RW§8.4 rungs 2+3+4; she does not flee and may die, pinned by name. D4 (08-02): the danger is now VISIBLE first — airless rooms paint red under the pressure lens, the offer reads `NO AIR AT THE WORKSITE — SHE MAY DIE`, her label reads `· NO AIR` while held there (RW's shape: visible, never confirmed). Names the device TYPE, not the authored instance — owner item |
| T6 | Pre-emption + sticky ordered claim (order wins NOW and HOLDS) | §2.2 | DONE (M2-8 + M2-19 + M2-9's writer; demo: mid-service abandon 60 s into 900 s, hold survived 121 sim-s against a needier machine) |
| T7 | Direct orders: move, operate, erase; pawn selection in Room Zoom | §2.1 | DONE, re-shaped by OD-N (M3-15, 08-01): the click OPERATE verb is REMOVED for doors and vents — they answer only to a live MOSS server (repair `term_moss` ⇒ console; commission ⇒ programs); move/erase/selection unchanged. The M1 gate sentence (`open vent_ls`) is expressible for the first time |
| T8 | A stalled/refused order says WHY, on the tile | §2.4 (`JobCondition`) | partial, advanced by M3-13 (08-01), D5 (08-03) and the D5 follow-on (08-03 F): the `blocked` badge NAMES THE ITEM a stalled repair waits for (`NEEDS PARTS — …`, `BlockedCell.Detail`), the right-click menu refuses never-serviceable machines out loud, an ordered machine the crew cannot walk to wears `ReasonNoRoute` / *NO WAY TO WALK TO IT* from the frame after the click, and ⭐ the sim now PUBLISHES WHY every `DriveWorker` abandon fired (`OrderDroppedEvent`, a no-default `JobDropReason` — the compiler stops a future arm shipping mute), so a player-held order dropped MID-ORDER wears its reason live (route / approach / named item) — §13.25 b3 CLOSED from the ruled side, and ⭐ (08-03 G, owner-ruled) every drop now writes an `ORDER DROPPED` Chronicle line (`HistoryKind.OrderDropped`, §13.45) — **b3-R's SILENCE is closed for the LOG**: a `Displaced`/`CargoLost` drop leaves a durable trace even though no honest LIVE badge exists (per-worker transients, no standing fact to re-ask; the badge half stays refused by design and §13.25d owns re-issue). Remaining silent: the issue-time no-staging-tile refusal (b2 geometry) · the other §13.25 b2 refusals · the tenth path outside the funnel (machine deconstructed mid-service bypasses `Abandon`, publishes nothing — defensible, filed) |
| T9 | Designations survive & are erasable (dig/strip/stockpile/erase) | §2.1 | DONE (marks channel + M1-C) |
| T10 | Repair is a work type with visible effect — repair a wing, lights come back | OD-A/OD-K | DONE (M2-11 + M2-12, merged 07-30; driven live: 10.6 → 17.4 kW across three ordered repairs, lights stay on past h12 — the phase-1 exit gate). KNOWN LIMIT: no pin sees the generation term; GenerationWearTests' bands are the sole instrument |
| T11 | Skills gate output, never whether (passions later) | §5 | DONE in mechanism, live on the wreck (M3-7 rate curve at six sites + M3-12 WORK-tab display + M3-8 authored spreads, all merged 08-02): a thawed sleeper works at her authored rate and her row differs from Rell's in numbers AND cells; skill never gates whether (7-leg pin). KNOWN LIMITS: no pin sees the rate term (`SkillConsumerTests` is the only instrument) · nothing levels (the spread is for the run) · quality/failure deliberately not modelled (no dice, TARGET §2) |
| T12 | Needs/mood: rest, food; mood as consequence not meter | §4 | advanced by M3-9 (08-02): crew SLEEP — she finishes her job, walks to a bunk (or the deck, worse), sleeps ~8-10 sim-h, wakes, works; fatigue reaches mood → Director tension → machine wear (a consequence, no meter). Remaining: mood still gates no crew behaviour directly — **OD-R (08-04) DIRECTS this half: deterministic mental breaks (refuse/stop/withdraw) are chartered M4 scope, RW§4's mechanism with TWoM's tone**; eating loses to work (SustenanceSystem after JobSystem, filed); no mood freeze while asleep |
| T13 | Thaw loop: earn & choose a second soul through MOSS | premise | **DONE (2026-08-02, witness run on `ba3008f`)**: the whole arc witnessed in the UNMODIFIED game — dark ship refuses `commission` with the ship sentence · `term_moss` repaired by a real right-click order · doors opened by typed console verbs · benches repaired · Regolith→Scrap→Parts→ControllerModule censused rise-by-rise at the wire · `COMMISSION ACCEPTED` at the real cost (ledger CM 1→0 at that moment; boot printed `defs 558a1c0a4985f5ea` = P5, so no overlay) · POD BAY 12 rows each with reason+number · `thaw 2` → Ozawa walks (crew 1→2). 5.47 sim-h end to end, shots `t13-*.png`. The commissioning verb itself is M3-17 (merged 08-02) — the demo's missing button |
| T14 | Health: capacity-gated work (downed ≠ disabled) | §6.1 | missing (M4-4 decides real-or-delete) |
| T15 | Schedules (sleep/work/rec blocks) | §3.5 | decided: deferred — RW§3.5 mechanism adopted in M3-9 (needs are a job-SELECTION filter between jobs, never an interrupt); the 24-slot grid is revisited after the week-9 gate (owner batch item 3, 2026-07-31) |
| T16 | Persona window (ONE door to a person) | — | queued (M4-1/M4-2) |
| T17 | Alerts ("a separate system informs the player") | §2.6 note | queued (M5-2) |
| T18 | Save/load in the shipping game | — | missing (M5-7, explicitly not promised) |

Phase-2 rows (do not start before the owner opens Phase 2): production ledger UI ·
operator model (mood/skill → throughput) · MOSS device commissioning with a button ·
ControllerModule as the automation gate · defensive-tech terminal sink · trading outposts.

## 4. What already works (don't rebuild it)

The deterministic sim substrate (10 Hz, hashed, save/round-trip), atmosphere with real gas
math, power/thermal/water/hydroponics, jobs + hauling + building + deconstruct, machine
wear/maintenance, MOSS language + terminal + adapters, the LLM runtime with offline
fallback, the wreck ship, the two-level standard UI, and the art pipeline.
`docs/MECHANICS.md` documents all of it `file:line` — and its §13 lists what is wired but
NOT connected. Read §13 before trusting any mechanic.
