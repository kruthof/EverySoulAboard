# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-01 session C, continued — SEVEN merges, the queue stands at M3-10)

**Gate on `main` (`4a46ee7`): 1690 dotnet + 1180 node, twin hashes MATCH at P1
`13674ebc4f8a14a9`** (re-measure before quoting). ⚠️ **PIN M3-e EXECUTED, tag `pin/m3-e`
(M3-15, P1 only, `25f604dd61b221fb` → `13674ebc4f8a14a9`)**: NOT the gate — measured INERT
on P1 via the full 2×2 — but the one Terminal (`term_main`) authored into `BuildScenario`
so the scenario fixture's LS watch keeps firing through OD-N's gate. Cause: the charter's
neutrality survey covered perilune/slice/grid/wreck and never P1's OWN fixture. P2–P5
held. Next pin row: M3-b (M3-7).

**Session mode**: owner authorized an autonomous run (away ~8 h from ~22:00 07-31; back
and said "continue"); orchestrator merges the M3 queue in order, one Opus implementer +
one independent reviewer per package. **Full package records live in the §3 queue rows of
`perilune-m3.packages.md` — this block is the index.** Merged this session, in order:

- **Doc-anchor sweep** (`96fc527`): 40 stale `AuthoredShips.cs` anchors corrected, zero
  survivors; `term_moss` pin re-pointed (`TheMossTerminal_BootsUnCommissioned`,
  `WreckShipTests.cs:1252-1264`); MECHANICS reconciled with M3-14 + OD-N/OD-O.
- **M3-3 ThawGate** (`03b2153`): the thaw is askable and EARNED — six terms, refusals
  with a named reason AND number, price charged LAST, no MOSS adapter for CryoPod. §13.30.
- **M3-15 MOSS gate** (`f5d7bf0`, tag `pin/m3-e`): doors and vents answer only to a live
  MOSS server; split gate repaired→console / commissioned→programs; OPERATE click deleted;
  **the M1 gate sentence (`open vent_ls`) is expressible for the first time**. §13.31.
- **M3-4 POD BAY** (`f5e8aac`): typed `pods` → twelve capsules, every sealed row states
  the gate's reason with the number; a chosen thaw CYCLES, witnessed in real Chrome;
  `NoConsole` re-worded; the four-sentence refusal family pinned pairwise distinct. §13.32.
- **M3-13 refusals** (`a4c120f`): the tile badge NAMES THE ITEM (`BlockedCell.Detail`)
  and the menu refuses never-serviceable machines out loud (`DeviceCell.serv`). ⚠️ The
  charter's premise was false, corrected ×6: a REPAIR order never wants a ControllerModule
  (repair ladder = Parts ▸ Seals ▸ Swarf). §13.33.
- **M3-16 the malfunctioning board** (`3da64fc`): `vent_d1` mechanically fine, board dead
  (`Faulted` b12 fold-neutral MEASURED; DEVC v6); `open`/`close` refuse for every caller;
  `set rate` doesn't hold; the two-line `every 1s:` program fills the hall past 80 kPa
  (101.3 kPa witnessed). `Deck1VentTests` re-cut kept the POWERED half verbatim. §13.34.
- **M3-5 emergency thaw** (`4a46ee7`): the ship wakes one more soul BY ITSELF, once, and
  the run ends on screen — `EmergencyWatch` in `CryoSystem` (OD-10: `ThawCommand` never
  learns it exists); ⭐ the send-back caught a real regression (the election stamped on a
  paid in-flight cycle — now a counting cycle IS the grace and the reprieve survives,
  semantics pinned against both candidate fixes); lose state + Chronicle + Overview
  banner (`ending` channel). §13.35.
- Every package had exactly ONE send-back, each a real defect (a mutation that couldn't
  bite · an unguarded stated decision · an open-only gate pin · a paid-cycle clobber —
  full prose in the queue rows).

## Integrator decisions this session (review these)

1. **PIN M3-e, option 2** (`term_main` authored real) chosen over ship-as-is: option 1
   would leave the scenario fixture's authored LS watch permanently inert — the pinned
   window would stop exercising the script→vent path (ninth trap) and hydro would coast
   to 94.3 as a side effect. Rollback = the tag.
2. Housekeeping discharged: 8 stale review-*/spike worktrees verified + pruned; branches
   `review/m1-i` + `lane/vision-synthesis` kept; `lane/spike-dispatch` deleted to match
   ROADMAP §2's "branch destroyed" record.
3. ROADMAP rows N/O anchors fixed (`:2059`, `:2169`); doc-sweep D4 extension accepted.
4. T13 marked near-DONE, not DONE: commissioning in the acceptance runs was driven via a
   disclosed temp `commission_cost=0` overlay — one witnessed unmodified-game run still owed.

## Next

1. **M3-10 heater — PIN ROW M3-d, RUNS ALONE** (no standing pin lane; tags checked) →
   **M3-b (M3-7 skill consumers, RUNS ALONE)** → M3-12 → M3-8 → **M3-c (M3-9 REST, last
   by risk ruling)** → the week-9 owner playtest (2026-08-07).
2. Owner manual check (carried): OD-P (`42f59ca`) still owed a look — `l`/`p` TYPE,
   `log`/`prog` navigate, DETAIL bare `log` inherits. Plus the session-C browser beats
   worth an eyeball: the POD BAY (`pods`), the vent puzzle, the MOSS-offline refusals.

## Open on the owner

- **Playtest 2026-08-07** — confirm/move. The thaw arc (repair → commission → pods →
  thaw) now works end-to-end; deck-1 air lands post-commission (M3-16, in flight).
- **⭐ NEW — REPAIR eats the thaw ladder's currency** (M3-4, measured twice): enabling the
  REPAIR work type lets the maintenance board spend 6 of the wreck's 10 Seals + its only
  Parts in ~10 sim-h, and the pawn CARRIES the remaining 4 — every rung reads `SHIP HAS 0`
  with the matter aboard, no way to make her put it down. Rung 1 unreachable in the run
  that unlocked it except by direct order. Pacing + carried-stock dead end — owner call.
- **NEW — rung-1 pacing** (M3-3, measured): 10 loose Seals at boot make rung 1 free at
  commission. Related: the wreck's loose consumables fall 10→2 and stop (larder floor).
- **Unsurvivable vacuum services as a CLASS** (OD-O dissolved `vent_d1` only; `wear.def:17`).
- Browser eyeball items (carried): M3-14's five steps · M3-6 capsule count · M3-11 wrecked
  vent + 0.000 kPa · power-lens conduit glyphs · deck-1 legibility · M2-12 arc · NEW:
  `docs/design/shots/` is now 31 MB (precedent long-established; noted for the owner).
- Carried: crew docks clip labels · Prioritise names the TYPE · off-switch never pre-empts
  · "Awaiting orders" short form · onboarding Space row · work-type ▸ reach inversion ·
  BUILD label collision · ascending click cycle · door art unphotographed · `'/'` glyph.

## Open — unscheduled (filed, unowned)

- **⭐ `PrioritiseJobCommand` accepts-then-silently-drops** (GENERAL defect, driven; the
  APPROACH refusal for a repair order is still silent — do NOT add `ReasonAir`).
- **⭐ `BLOCKED_ORDER_NAMES` lacks `OrderRepair`** (M3-13 review): a repair badge titles
  "1 ORDER STUCK" generic; pinned by literal so nothing catches it. The natural next
  one-liner — this milestone made repair badges the main screen.
- **M3-16 filed set**: the dead `operate` handler answers `OPERATE_OK` on a faulted
  device (unreachable — M4-8's row) · `HeadlessVent.TryInvoke` (scenario host) is a
  second vent `IScriptable` that skips `DeviceFault` — drift risk, unreachable today ·
  TUI toggle silent on a faulted device · a faulted device has NO CLEAR path (deliberate
  for the one instance; revisit if a second is authored) · the deck-breathes beat is
  invisible without the `2 PRES` lens · `moss-gate-shot.mjs`/`pod-bay-shot.mjs` carry a
  latent VK_DELETE `'.'` typing bug (fixed in `board-fault-shot.mjs` only) ·
  `prog <terminal>` opens the directory but selects no row (undocumented, cost a cycle).
- **M3-4/M3-13 review sets**: `podsAsked` yank window (one round trip) · malformed
  `ev:pods` leaves the handshake armed · default bay selection lands on the OPEN row ·
  two commissioned terminals speak through the lower Id · `BlockedCell.Detail` has one
  live value today · a second per-KIND bit should get its own channel, not a ninth element
  · onboarding/`AwaitingOrdersLabel`/M2-18 still teach the pre-OD-N first order (M4-5) ·
  operate host handler is dead player-facing code (M4-8) · `moss-gate-shot.mjs:184-192`
  prose says `exit`, code presses ESC.
- **Doc/citation residue** (carried): `AuthoredShips.cs:1613` in-code ":2210" ·
  `packages.md:730-731` stale claim · `packages.md:590` `:80`→`:83` · MECHANICS `:764`
  AutoWander · `:3610` scan lands in next summary · §5.1 flee guard lacks `HeldByOrder` ·
  §13.25 heading says "is M2-10" · `JobContext.cs:89` sixth `HeldByOrder` reader (M3-7) ·
  pre-wreck-region anchors (RoleNow `:583` · RevealDifficulty `:598-771` · `:2796` span).
- **M3-2 filed set** (carried): no-exit-tile pod blocks the bay silently · nothing pins
  CryoSystem's tick allocation · sub-fail mid-cycle freeze · thawed pawns `AutoWander=true`
  · `ThawSecondsPerCycle` → `cryo.def` at next P4/P5 mover · CA1305 `PeriluneGoldenTests:65`.
- **MOSS console filed set** (carried): PROGRAM-screen prompt renders but can't submit ·
  `↑`-history/ESC-clear LEDGER-only · FAULTLOG `log` re-opens · `moss-model-fake.js`
  unguarded `KEY_ROUTE` copy · vanished-tid PROGRAM keeps a dead editor.
- **FREEZE as a player verb** — named follow-on (OD-M item 6).
- Carried (full prose in `docs/history/` + trap ledger): wrapper-predicate census ×3 · no
  per-device powered-ness wire · shed-lamp flicker · `Device.Rate` scales generators ·
  `IceChainMemoTests` flake · M2-17/M2-21/M2-5 residuals · stale-citation candidates
  (MECHANICS `:62`/`:2008`/`:2741`, ECONOMY.md:72,74, moss-terminal.spec.md:417,
  `Commands.cs:777`) · de-CH wording · §13.1 CO2 gap · `WorkIncapable` off the `work`
  wire (M3-7) · `designs` not fog-gated · needy-machine scans · unskinned glyphs · D-3
  social gate · `Commands.cs` retracted sentence.

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-28 | (six lanes) | wreck ship ships: operate verb, wrecked art, devices channel; ADD ROOM stops conjuring air | green, all pins |
| 07-29 am | audit + spike | no code: metric audit (A1 retired), dispatch spike refuted `TryAssign` seam, OD-A…OD-C | n/a |
| 07-29 | m1 wave | machines visible, `vent_ls` operable, honest first screen, ERASE tool | green |
| 07-29 pm | m1-f/h/d/i/k | morale bar gone, craft thrash gone, unreachable reason on tile, 11 repair consumables, pawn select+MOVE in Room Zoom | green |
| 07-29 pm | m2-1 + m1-l | work-priority state (hashed, OFF), every compartment IS a room | green, P1–P3 re-pinned `pin/m2-a` |
| 07-29 late | doc-restructure | docs only: TARGET/ROADMAP/PROCESS/TRAPS created; CLAUDE.md + HANDOVER cut ~10× | green, pins held |
| 07-30 | nine lanes | **the RimWorld loop's first act is playable** | green, P1/P3 re-pinned `pin/m2-e` |
| 07-30 pm | five lanes | **the DIRECT ORDER works**: why-line · pre-emption · hold 121 sim-s · demo 5/6 | green, pins UNMOVED |
| 07-30 night | power ×2 · rebaseline · m3-charters | **M2 CLOSED, phase-1 exit gate MET**; M3 chartered | green, pins UNMOVED, tag `pin/m2-d` |
| 07-31 | m3-batch · pod-identity · vacuum-ladder | **M3 gate cleared (OD-M); a DIRECT ORDER CROSSES THE FRONTIER**; playtest named 2026-08-07 | green, pins UNMOVED |
| 07-31 B | pod-census | **the thaw ladder is AUTHORED** (rungs 1–7) | green, pins UNMOVED |
| 07-31 B | deck1-vent · od-n-charter | **deck 1 is ONE repair from air; the ship learns who it answers to** (OD-N/OD-O; M3-15/16 chartered) | green, pins UNMOVED |
| 07-31 B | cryo-system | **A POD CYCLES** | green, **PIN M3-a**, tag `pin/m3-a` |
| 07-31 B | moss-input · moss-hotkeys | **the MOSS terminal takes typing; OD-P: it IS a terminal** | node +18, owner VERIFIED |
| 08-01 C | doc-anchor-sweep | docs only: 40 stale anchors corrected, `term_moss` pin re-pointed, MECHANICS reconciled | green, pins UNMOVED, 1 send-back |
| 08-01 C | thaw-cmd | **the thaw is EARNED**: yes, or no with a named reason and a number | green, pins UNMOVED, 1 send-back, tests →1599 |
| 08-01 C | moss-gate | **the ship answers to MOSS**: doors/vents MOSS-only, split gate, OPERATE click deleted, `open vent_ls` expressible | green, **PIN M3-e (P1, cause measured)**, tag `pin/m3-e`, APPROVE 1st pass |
| 08-01 C | pod-bay | **typed `pods` shows the bay; every sealed capsule says why; a chosen thaw CYCLES** (witnessed) | green, pins UNMOVED, 1 send-back, tests →1640/1166 |
| 08-01 C | thaw-blocked | **the tile badge names the item; the menu stops promising the impossible** | green, pins UNMOVED, 1 send-back, tests →1646/1179 |
| 08-01 C | board-fault | **one machine does not answer its switch — the workaround is a two-line MOSS program**: the fault sentence, the puff-and-stall, the `every 1s:` fix, 101.3 kPa witnessed | green, pins UNMOVED (b12 fold-neutral measured), 1 send-back, tests →1674/1179 |
| 08-01 C | emergency-thaw | **the ship wakes one more soul by itself, once, and the run ends on screen**: death → cycling without a pause → "With ⟨name⟩ dead, the ship woke ⟨name⟩." → ALL SOULS banner; a paid cycle is never stamped on | green, pins UNMOVED (packed fold), 1 send-back (a real paid-cycle regression) + 1 measured touch, tests →1690/1180 |
