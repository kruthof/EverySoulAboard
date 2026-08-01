# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-01 session C, IN PROGRESS — doc sweep + M3-3 merged, M3-15 in flight)

**Gate on `main` (`03b2153`): 1599 dotnet + 1138 node, twin hashes MATCH at P1
`25f604dd61b221fb`** (re-measure before quoting). **No pin moved this session** — the
CLAUDE.md pin table stands (last mover M3-2, tag `pin/m3-a`). Next pin row: M3-b (M3-7).

**Session mode**: owner away ~8 h (authorized autonomous run); the orchestrator is merging
the M3 queue in order, one Opus implementer + one independent reviewer per package, design
choices documented in the queue rows (`perilune-m3.packages.md` §3 — the full records).

**M3-3 ThawGate + ThawCommand** (`8baafab`, merge `03b2153`, 1 send-back): the thaw is
askable and EARNED — a `thaw` op in `HandleMoss` lowers to `ThawCommand`; `ThawGate.
Evaluate` (zero-alloc static, NOT a system) answers the six terms in charter order;
refusals carry a named reason AND a number (`NEEDS 1 SEALS — SHIP HAS 0`, `SCRUBBING
COVERS 3 OF 4`); the price is charged LAST (a refusal never bills — byte-identical,
mutation-proven); no MOSS adapter for `CryoPod` (a program can never empty the bay);
gate/ledger agreement pinned by assertion, not call. Both owed debts paid (`PodIdentity
Tests` thaw leg; M3-6's six-edge band sweep). The send-back: term 1's OD-9 conjuncts were
covered by NOTHING — the reviewer deleted them and 83/83 stayed green, with a run-ending
driven consequence (dead sleeper accepted, 3 CM billed, bay bricked forever); fixed with
per-conjunct isolation legs + exact-sentence literals, both killing mutations re-run RED.
⚠️ NOT reachable from the browser UI (no client sender) — M3-4/M3-13 by name. §13.30.

**Doc-anchor sweep** (`d66fe0d`, merge `96fc527`, 1 send-back — its own half sweep):
every `AuthoredShips.cs` citation in the M3 charters re-measured (40 corrected, 11
verified correct, zero survivors); the `term_moss` pin re-pointed to
`TheMossTerminal_BootsUnCommissioned` (`WreckShipTests.cs:1252-1264`; `:741-752` is a
`NumberWord` helper); MECHANICS reconciled with M3-14's `forced: true` reality (all five
sites — the false "only" was copied verbatim from `SafetySystem.cs:129-133`'s own stale
doc comment) and §13.23a now carries the OD-N/OD-O outcome (reachability answered as a
MECHANISM, survivability dissolved for `vent_d1` alone — the class half open).

## Integrator decisions this session (review these)

1. Housekeeping discharged: all 8 stale review-*/spike worktrees verified (only review
   checkouts / merge commits of already-merged lanes) and pruned; branches `review/m1-i`
   and `lane/vision-synthesis` kept as refs; `lane/spike-dispatch` DELETED to match
   ROADMAP §2's "branch destroyed" record (its commits self-marked THROWAWAY NEVER MERGES).
2. Doc-sweep D4 extension accepted: the same blocker-split correction applied at
   `packages.md:229` (one edit beyond the send-back's named items; reviewer endorsed).
3. ROADMAP rows N/O anchors fixed in place (`:2057`→`:2059`, `:2167`→`:2169`; re-measured).
4. M3-15 launched on merged main (`03b2153`) in `lane/moss-gate`.

## Next

1. **M3-15 (6b) IN FLIGHT** → review → merge → **M3-4 POD BAY** → **M3-13** (same
   integration window as M3-4) → **M3-16 (8b)** → M3-5 → then the pin rows per queue.
2. Owner manual check (carried): OD-P (`42f59ca`) still owed a look — in MOSS, `l`/`p`
   must TYPE into the prompt; `log`/`prog` + Enter navigate; DETAIL bare `log` inherits.
3. M3-4 must consume M3-3's filed set (below): debounce/render-the-command's-own-verdict
   for the same-tick double thaw; the countdown badge must not re-derive `MinutesLeft`.

## Open on the owner

- **Playtest date 2026-08-07** — confirm or move. Script caution: M3-11's player row is
  not delivered until M3-15 merges (door), M3-16 (air).
- **Unsurvivable vacuum services as a CLASS** — OD-O dissolved `vent_d1` only
  (`wear.def:17`; suit / segmented service / accumulation are the named options).
- **NEW — rung-1 pacing** (M3-3, measured): the wreck boots with 10 loose Seals, so rung 1
  (1 Seals) is free the moment MOSS is commissioned; the early ladder is content-cheap.
- Browser eyeball items (carried): M3-14's five steps · M3-6 capsule count · M3-11 wrecked
  vent + 0.000 kPa first screen · power-lens conduit glyphs · deck-1 legibility · M2-12 arc.
- Carried: crew docks clip 27-char labels · Prioritise names the TYPE not the instance ·
  off-switch never pre-empts · "Awaiting orders" short form · onboarding Space row ·
  work-type ▸ reach ranking arguably invertible · BUILD label collision · ascending-only
  click cycle · door art unphotographed · `'/'` glyph.

## Open — unscheduled (filed, unowned)

- **⭐ `PrioritiseJobCommand` accepts-then-silently-drops** (GENERAL defect, driven): any
  order to a walkable-but-UNREACHABLE worksite is accepted (`TryFindStagingTile` never
  asks reachability), sets the hold, then evaporates — no badge, no dock row. Playtest-
  relevant. Related: do NOT add `ReasonAir` for repair orders (`ReasonNoApproach` exists).
- **M3-3 filed set**: optimistic `ok:true` on a second same-tick thaw request (M3-4's
  button must debounce or render the command's own verdict) · `Headroom.FoodUnits` counts
  carried+reserved stock while the rung price reads loose-only (M3-4 renders the number) ·
  `ARefusedThaw…ByteIdentical` compares a census across a real `sim.Tick()` — latent
  false-RED · `EveryRefusalReaches…` asserts its count floor before its problems list
  (old test; the new term-1 test has the ordering right) · `MinutesLeft(0f)` says 4 min
  where the truth is 239 s (M3-4's badge must not re-derive and disagree).
- **Doc/citation residue** (from the sweep + reviews, all re-measured): `AuthoredShips.cs:
  1613`'s IN-CODE citation ":2210" (locker at `:2366-2370`) · `packages.md:730-731`
  "does not exist" claim stale since M3-2 · `packages.md:590` cites `:80` for
  `CryoPodFailBelow` (measured `:83`) · MECHANICS `:764` AutoWander `:255`→`:264` ·
  MECHANICS `:3610` ":598 POSITIVE scan" lands in the next test's summary · MECHANICS §5.1
  flee guard lacks the M3-14 `HeldByOrder` exception · §13.25 heading still says the
  right-click "is M2-10" (merged) · `JobContext.cs:89` is a sixth `HeldByOrder` reader,
  unreachable until M3-7 — needs a clause when M3-7 lands · pre-wreck-region MECHANICS
  anchors (`:1810` RoleNow `:354`→`:583` · `:1966` RevealDifficulty `:369-551`→`:598-771`
  · `:2796` slice span stops mid-`SliceCrew`).
- **M3-2 filed set** (carried): a pod finishing with NO free exit tile blocks the whole bay
  forever, silently (M3-3/M3-4 own the surface) · nothing pins `CryoSystem`'s tick
  allocation · sub-fail mid-cycle freeze silent · thawed pawns boot `AutoWander=true` ·
  `ThawSecondsPerCycle` promotes to `cryo.def` in the next P4/P5 mover · CA1305 at
  `PeriluneGoldenTests:65`.
- **MOSS console filed set** (carried): PROGRAM-screen prompt renders but can never submit
  (M3-4's window) · `↑`-history/ESC-clear LEDGER-only · `log` on FAULTLOG re-opens
  (deliberate) · `moss-model-fake.js` unguarded `KEY_ROUTE` copy · vanished-tid PROGRAM
  selection keeps a dead editor mounted.
- **FREEZE as a player verb** — named follow-on (OD-M item 6).
- Carried (full prose in `docs/history/` and the trap ledger): wrapper-predicate census
  lesson ×3 · no per-device powered-ness wire · shed-lamp flicker · `Device.Rate` scales
  generators, unwritten · `IceChainMemoTests` flake · M2-17/M2-21/M2-5 residuals ·
  stale-citation sweep candidates (MECHANICS `:62`/`:2008`/`:2741`, ECONOMY.md:72,74,
  moss-terminal.spec.md:417, `Commands.cs:777`) · de-CH wording · §13.1 CO2 gap ·
  `WorkIncapable` off the `work` wire (M3-7) · `designs` not fog-gated · needy-machine
  scans · unskinned glyphs · D-3 social gate · `Commands.cs` retracted sentence.

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-28 | (six lanes) | wreck ship ships: operate verb, wrecked art, devices channel; ADD ROOM stops conjuring air | green, all pins |
| 07-29 am | audit + spike | no code: metric audit (A1 retired), dispatch spike refuted `TryAssign` seam, OD-A…OD-C | n/a |
| 07-29 | m1 wave | machines visible, `vent_ls` operable, honest first screen, ERASE tool | green |
| 07-29 pm | m1-f/h/d/i/k | morale bar gone, craft thrash gone, unreachable reason on tile, 11 repair consumables, pawn select+MOVE in Room Zoom | green |
| 07-29 pm | m2-1 + m1-l | work-priority state (hashed, OFF), every compartment IS a room | green, P1–P3 re-pinned `pin/m2-a` |
| 07-29 late | doc-restructure | docs only: TARGET/ROADMAP/PROCESS/TRAPS created; CLAUDE.md + HANDOVER cut ~10× | green, pins held |
| 07-30 | nine lanes | **the RimWorld loop's first act is playable**: boot "Awaiting orders" → WORK tab → she works → off → finishes-then-waits; priorities RANK | green, P1/P3 re-pinned `pin/m2-e` |
| 07-30 pm | five lanes | **the DIRECT ORDER works**: why-line · pre-emption mid-service · right-click order holds 121 sim-s · demo 5/6 | green, pins UNMOVED |
| 07-30 night | power-network · power-wear · rebaseline · m3-charters | **M2 CLOSED, phase-1 exit gate MET**: deck 1 honestly off-network · repairing wings steps 10.6→17.4 kW live · A3 measured first time ever · M3 chartered (14 pkgs) | green, pins UNMOVED, tag `pin/m2-d`, worktrees pruned 18 |
| 07-31 | m3-batch · pod-identity · vacuum-ladder | **the M3 gate cleared (OD-M) and a DIRECT ORDER CROSSES THE FRONTIER** (rungs 2+3+4); pods single-use; playtest named 2026-08-07 | green, pins UNMOVED, worktrees pruned 3 |
| 07-31 B | pod-census | **the thaw ladder is AUTHORED** (rungs 1–7, `ThawGate.RungOf`); census 12/1/7/4 self-consistent | green, pins UNMOVED, APPROVE first pass |
| 07-31 B | deck1-vent · od-n-charter | **deck 1 is ONE repair from air, and the ship learns who it answers to**: `vent_d1` authored; OD-N + OD-O recorded; M3-15/M3-16 chartered | green, pins UNMOVED, 1 send-back each, worktrees pruned 2 |
| 07-31 B | cryo-system | **A POD CYCLES**: a named person steps out — 4 sim-min, one at a time, single-use honoured | green, **PIN M3-a: P1/P2/P3 MOVED fold-only**, tag `pin/m3-a`, 1 doc-only send-back |
| 07-31 B | moss-input | **the MOSS terminal takes typing again** (owner-reported live); dom-lite's four blur rules self-pinned | node 1132 (+12), APPROVE + 3 additions, owner VERIFIED |
| 07-31 B | moss-hotkeys | **OD-P: the MOSS console is a TERMINAL** — printables type, `log`/`prog` navigate; screenshot harness proves WHICH screen it drew | node 1138 (+6), 1 send-back, spec amended |
| 08-01 C | doc-anchor-sweep | docs only: 40 stale charter anchors corrected (zero survivors), `term_moss` pin re-pointed, MECHANICS reconciled with M3-14 + OD-N/OD-O | green, pins UNMOVED, 1 send-back (its own half sweep) |
| 08-01 C | thaw-cmd | **the thaw is EARNED**: ask via the MOSS `thaw` op and the ship answers yes, or no with a named reason and a number; six terms, refusal never bills; both owed debts paid | green, pins UNMOVED, 1 send-back (term-1 coverage), tests 1580→1599 |
