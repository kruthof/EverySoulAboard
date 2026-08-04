# HANDOVER — rolling archive

*Content pruned from `docs/HANDOVER.md` by the end-of-session ritual (`docs/PROCESS.md` §1)
lands here, newest at the top, with its original date. The frozen pre-restructure record
(through 2026-07-29, all § anchors intact) is `HANDOVER-2026-07.md`.*

## Archived 2026-08-01 (session C): the 2026-07-31 session-B current-state block

*Archived verbatim when session C rewrote the block. The package records live on in
`perilune-m3.packages.md` §3 queue rows (M3-6/M3-11/M3-2) and ROADMAP §5 (OD-N/OD-O);
still-open items were carried forward into the live HANDOVER.*

**Gate on `main` (`ff013e4`): 1580 dotnet + 1120 node, twin hashes MATCH at P1
`25f604dd61b221fb`** (re-measure before quoting). ⚠️ **PIN ROW M3-a EXECUTED, tag
`pin/m3-a`: P1/P2/P3 moved FOLD-ONLY for `CryoSystem`'s SYSS seed** (P2 `1c036ffd53b8f106`,
P3 `37c85c1ed445895e`; cause MEASURED — interface dropped ⇒ all three old values return;
P4/P5 held, no def field). Reviewer reproduced the pins AND the causal mutation
independently. Next pin row: **M3-b (M3-7)**, not soon.

**M3-2 CryoSystem** (`ff013e4`, one send-back — five stale anchors, doc-only): a pod
CYCLES — 4 sim-min (`ThawSecondsPerCycle=240`, named constant), ONE at a time (lowest
`Device.Id` elected; the owner's "only one after the other"), wrecked pods never cycle
and never block (OD-9), opened pods never re-cycle (§13.27), completion opens the pod +
`AddCitizen` named from `Device.Name` (`pod_ozawa`→`Ozawa`) on the first walkable
device-free 4-neighbour (+X,−X,+Y,−Y) + `CitizenThawedEvent`. Emergency-thaw bit STORED
(SYSS, folded, round-tripped, zero non-test writers) — M3-5 writes it. `SaveWriter`/
`SaveReader` needed NO change (SYSS is generic over `IStatefulSystem`). MECHANICS §13.29.

Merged that session, in order (each: Opus implementer + separate independent reviewer;
FULL RECORDS in the §3 queue rows of `perilune-m3.packages.md`):
- **M3-6 pod census + rungs** (`a6ce8d3`, APPROVE first pass) — the thaw ladder is
  AUTHORED (`ThawGate.RungOf`, rungs 1–7, MECHANICS §13.28); NOTHING consumes it until
  M3-3; **band-edge behavioural sweep OWED to M3-3 mutation 6(b) by name**.
- **M3-11 deck-1 vent** (`8d206ca`, 1 send-back) — `vent_d1` above the cryo riser (ONE
  exemption; CUT 23 · EXEMPT 1 · ADDED 8); deck 1 boots 0.000 kPa; a repair fills the
  hall past 80 kPa. Devices 611→612, demand 14.30→**14.80 kW** (LS tier 6.20). **BOTH
  delivery blockers filed in order**: (1) REACHABILITY — order accepted then silently
  dropped (`TryFindStagingTile` never asks reachability); (2) SURVIVABILITY — 900 s
  service vs ~90 s vacuum air, no accumulation.
- **OD-N + OD-O recorded, M3-15 (6b) + M3-16 (8b) chartered** (`505cf3e`, docs-only,
  1 send-back). OD-N: doors AND vents MOSS-only; server = `term_moss`; **SPLIT GATE —
  repaired (≥ MaintainBelow 0.20) ⇒ console/manual actuation; commissioned (1×CM) ⇒
  programs/pod bay** — chosen after the measured deadlock (0 CM aboard, chain behind
  14/16 shut doors); measured: **the console is gated by NOTHING today**. OD-O: `vent_d1`
  = the first PROGRAMMING PUZZLE (mechanically fine, CONTROL BOARD DEAD, workaround
  `every 1s: set(vent_d1.rate, max)`; **NOT a pattern — ONE authored instance**); its
  survivability blocker dissolves. Owner vision line: **"MOSS should be the OS of the
  ship."** The puzzle is deliberately SPLIT ACROSS THE GATE (diagnose at console tier,
  the fix needs commission).

Integrator decisions that session: (1) M3-15/M3-16 queue ids are half-steps (6b/8b) to
avoid staling three live "position N" citations; M3-16's `set rate`-is-console-tier is the
CHARTER's ruling (endorsed by review), the any-Terminal predicate is the integrator's
(term_nav back door theoretical: unreachable at boot, per the driven census). (2) M3-11
merged with the chartered outcome recorded as "reachable in principle, not in practice" —
ROADMAP/TARGET did NOT mark its player row delivered; the 2026-08-07 playtest script must
not include "repair the deck-1 vent" as a working beat. (3) OD-O scoped to mechanism + ONE
instance despite "repeatable pattern" being offered — the owner's own follow-up softened
it; recorded verbatim in row O.

The 2026-07-31 "Next" list (all now discharged or carried into the live file): M3-3 →
M3-15 → M3-4 → M3-13 → M3-16 queue order · owner manual check of the MOSS console input
fix (`f74844a` VERIFIED WORKING by the owner 07-31; OD-P `42f59ca` still owed a look) ·
8 unmerged review-*/spike worktrees housekeeping candidate.

---

## Archived 2026-08-03 (session E): the session-D current-state block, verbatim

## Current state (2026-08-02, session D CLOSED — ⭐ THE PLAYTEST IS UNBLOCKED, T13 DONE)

**Gate on `main` (`ba3008f` + docs): FULL `./ci.sh` exit 0, re-measured on `main` itself
after all four merges — 1801 dotnet + 1218 node, twin hashes MATCH at P1** (re-measure
before quoting). **Pin table** (CLAUDE.md is
authoritative): P1 `7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52` · P3 `43a1a5c25713faec` ·
P4 `661fcdd4b89f1e87` · P5 `558a1c0a4985f5ea`. **NO PIN MOVED this session** — all four
packages measured pin-neutral (D3's hold is VACUOUS by OD-H and labelled so in its commit;
its real instruments are `RepairReserveTests` + four restated `WreckRepairEconomyTests` legs).

**FOUR merges**, each one Opus implementer + one independent reviewer:
- **M3-17 `commission`** (`47249fa`, APPROVE first pass) — the typed `commission` verb at
  the MOSS console (REPAIRED tier), lowering to the existing `CommissionDeviceCommand` at
  the real `commission_cost = 1`; refusal family 4→6 sentences, pairwise + first-four-words
  distinct; a refusal never bills (mutation-proven). THE PLAYTEST BLOCKER, CLOSED.
- **D2 `ladder-pacing`** (`f0e8a38`) — the thaw ladder decays in DAYS: bands re-keyed
  uniform 0.08, every pod 0.07 above its floor (OWNER RULING: ~70 sim-h headroom, ladder
  0.99→0.51; the withdrawn ~100 h draft put Torres ~220 sim-h from PERMANENT loss). First
  driven crossing sim-h 65 vs 9 pre-D2. New derived always-visible `alerts` bar
  (`WireFormat.Alerts.cs`, `WireFormat.cs` zero-diff) names the capsule ~22 sim-h ahead —
  deliberately NOT the Chronicle (D6 evicts). OD-M item 1's curve byte-unchanged.
- **D3 `repair-reserve`** (`1fdd693`, 1 send-back: two dead guards restored as measured
  2×2s) — auto-maintenance declines the ship's last **4** loose consumable units
  (`AutonomousRepairReserve`, a named constant at the one `FindNearestConsumable` funnel
  all three deciding sites share); a direct order still spends them. Unattended boot
  recovery now clears 7 of 11 wrecks; the four left (incl. `wing_b`, power) are each one
  order away, driven.
- **D4 `vacuum-visible`** (`ba3008f`, 1 send-back: the water lens fabricated a vacuum
  reading — fixed as override-never-source) — airless rooms ship real `rooms` rows, the
  pressure lens paints vacuum red, the readout reads 0.0 kPa instead of hiding, a held
  worker's label reads `· NO AIR`, the Prioritise offer reads `NO AIR AT THE WORKSITE —
  SHE MAY DIE` (9th `DeviceCell` element, asked from the sim's staging rule). RimWorld's
  shape: order accepted, danger VISIBLE, never a confirm. Rung 4 untouched, zero sim diff.

**⭐ T13 DISCHARGED — the arc witnessed in the UNMODIFIED game** (`ba3008f`, two passes,
34 checks, 0 failures, repo byte-untouched): dark refusal → real right-click repair of
`term_moss` (36→255) → typed door verbs (halls 0→70 kPa) → benches → Regolith→Scrap→Parts→
ControllerModule censused rise-by-rise at the wire → `COMMISSION ACCEPTED` with the ledger
CM 1→0 at that moment (boot printed `defs 558a1c0a4985f5ea` = P5, so no overlay possible)
→ POD BAY 12 rows → `thaw 2` → Ozawa walks (crew 1→2). **5.47 sim-hours end to end**,
shots `docs/design/shots/t13-*.png` (7). REPAIR stayed OFF by intent (D3's design);
nobody died (the pressure lens made the frontier readable); D5 did NOT reproduce (all
five direct orders started).

## Open on the owner (before the 2026-08-07 playtest — FIVE DAYS OUT)

- **Eyeball the new shots**: `t13-*` (the arc) · `vacuum-02`/`vacuum-05` (D4's lens +
  offer) · deep-capsule Room Zoom art now renders at Condition 0.51–0.75 (unverified in
  browser) · the readout label is now `PRES · TEMP · PWR`.
- **T13-run finding — nothing prices the WAIT**: MachineShop 30 sim-min/batch, Recycler
  40; the commissioning chain is ~4 sim-h of one pawn standing at benches. Pacing call.
- **T13-run finding — the wreck's one boot Part is spent invisibly** by the first repair
  order (`term_moss` eats 1 Parts + 0 Seals; nothing says which consumable an order eats),
  so the chain must craft 2 Parts, not 1.
- **D6 is WORSE than filed**: day-0 Chronicle AND sensor log are 100 % brownout pairs —
  not one repair/craft/commission/thaw line survived the 200-ring. (D1 confirmed too: an
  ordinary thaw writes no line.) A Chronicle fix is now first-hour-visible material.
- Carried: heater power TIER + boot affordability (M3-10) · rung-1 pacing (10 loose
  Seals) · rung 1 of the vacuum ladder needs a named home · unsurvivable vacuum services
  as a CLASS (D4 treats one path's visibility) · the Room Zoom opens with BUILD armed
  (first screen in a room is a build palette) · playtest date confirm.
- Carried UI items: crew docks clip labels (now with a payload: `Servicing X · NO AIR` is
  31 chars vs ~26) · Prioritise names the TYPE · off-switch never pre-empts · "Awaiting
  orders" short form · onboarding Space row · work-type▸reach inversion · BUILD label
  collision · ascending click cycle · door art · `'/'` glyph · Rell reads `general crew`
  beside authored people · a sleeping crew member is drawn standing.

## Open — unscheduled (filed, unowned; the load-bearing subset)

- **NEW class (D3)**: 22 fixtures seed exactly 4 units (= the reserve); audited low-risk
  by reading, NOT by mutation — "a reserve makes any ≤4-unit fixture behave like a broke
  ship" is a class and wants a sweep. Also: at the reserve, crew repeatedly jury-rig
  `[0.25,0.40)` machines instead of a 0.9 service — crew time the owner hasn't seen.
- **NEW (D2)**: nothing warns of the PERMANENT `fail` crossing (Torres ~410 sim-h;
  distance is not a message) — M5-2's natural second alert row · the bar names the capsule
  nearest in CONDITION, not in time (deep pods wear ~8 % slower, float-ulp edge) · Torres
  crosses the 0.5 strip-cliff at sim-h ~8.6 (census cosmetic, flagged in ship prose).
- **NEW (D4)**: breached-to-space compartments still ship NO `rooms` row (merged into the
  void sink — honest header) · `hazard` field unconsumed in client (label carries it) ·
  the devices dirty-gate's only `Air` instrument is the `SameAs` unit test ·
  `WhyLineTests.NoBaseLabel` guarantee narrowed by the `·` separator.
- **NEW (M3-17)**: `MossGate.requestedTid` is live code with zero instrument (client
  always sends `@console`) · `commission <arg>` silently drops its argument · the MOSS tab
  remount reprints the READY banner (harness-visible) · `CmdKind.Commission` palette path
  still sender-less (kept, `HandleOperate` precedent).
- **Carried classes**: NOTHING GATES `client/tools/*.mjs` (now 32 tools) · the M3-9 filed
  set (out-of-band claimants, `SustenanceSystem` after `JobSystem`, wear-lever saturation,
  duty-cycle retune, sleeper can't eat) · D5 accepted-then-dropped (NOT reproduced in the
  T13 run — evidence it may be geometry-specific) · D7 wire accepts priority for incapable
  type · older sets in the queue rows and `docs/history/`.

## Next

1. **Owner triage of the playtest-facing items above** (shots eyeball, the wait pacing,
   the invisible-Parts spend, D6/D1 Chronicle) — all are first-hour-visible.
2. **The playtest 2026-08-07.** The game is arc-complete for it: order → repair → MOSS →
   commission → thaw, all reachable unmodified, dangers visible, prices announced.
3. M4 opens after the playtest gate (M4-1 Persona design first; M4-8 owns the operate
   handler + `hud.js` retirement; M4-5 the onboarding rewrite).


---

## Archived 2026-08-03 (session F ritual) — session E current-state block, verbatim

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


---

## Archived 2026-08-03 (session G ritual): session F's current-state block

*(Verbatim from HANDOVER.md as session G found it; session F's log row stays in the live
table. Gate then: main `dbaff5f`, 1841 dotnet + 1247 node, pins UNMOVED ×5. Session F's
three merges: faultlog-dedupe `29964ed` · whyline-shot-flake `c9e83f5` · d5-drop-reason
`dbaff5f`. The open items session G closed: ring saturation (merged `c316936`), the
Overview-dock-bare badge (merged `41bc3d0`), b3-R's log silence (merged `025e529`,
owner-ruled), the palette armed-state (merged `472721d`, owner-approved), deep-capsule art
(owner: intact correct), headline order (owner: death first stands). All other open items
were carried forward into session G's rewritten block.)*

---

## Archived 2026-08-04 (session H ritual): session G's current-state block

*(Session G's block is superseded by session H's rewrite; its log row stays live. Gate then:
main `5d9deb0`, 1850 dotnet + 1257 node. Session G's four merges: overview-dock-badge
`41bc3d0` · ring-saturation `c316936` · palette-armed-state `472721d` ·
b3r-dropped-order-chronicle `025e529`. Everything open from that block was either closed by
session H's twelve merges (ring horizon, palette collisions ×3 classes, build silence,
thaw teaching, MOSS console scrolling/spam, doors directory) or carried into session H's
rewritten lists.)*
