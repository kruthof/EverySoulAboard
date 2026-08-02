# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

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
| 08-02 D | commission · repair-reserve · ladder-pacing · vacuum-visible | **⭐ THE PLAYTEST IS UNBLOCKED**: typed `commission` at the real cost · the grid no longer bankrupts the ship (reserve of 4) · the ladder decays in DAYS with a named-capsule warning bar · the vacuum is VISIBLE (red lens, 0.0 kPa readout, `· NO AIR`, warned offer) · **T13 DONE — the whole arc witnessed unmodified, 5.47 sim-h, Ozawa walks** | green ×4 post-merge + final gate on `main` (exit 0), pins UNMOVED, tests →1801/1218 |
