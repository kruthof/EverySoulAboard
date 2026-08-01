# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-31 session B — M3-6 + M3-11 merged, OD-N/OD-O recorded, M3-15/M3-16 chartered)

**Gate on `main` (`505cf3e` + session docs): 1567 dotnet + 1120 node, twin hashes MATCH at
P1 `81733e27709f36e4`** (re-measure before quoting; the code tree is `8d206ca`'s, fully
gated in-lane; `505cf3e` added docs only). **All five pins unmoved all session.** Next pin
row is **M3-a (M3-2 CryoSystem, RUNS ALONE — start it in a clean window, no other lane)**.

Merged this session, in order (each: Opus implementer + separate independent reviewer):
- **M3-6 pod census + rungs** (`a6ce8d3`, APPROVE first pass) — the thaw ladder is
  AUTHORED: `ThawGate.RungOf(Condition)`, rungs 1–7 (1×Seals → 3×CM, depth 0,0,2,2,3,3,3),
  lower edges INCLUSIVE (`>=`, pinned 0.90 → rung 2); hand-written literals; NOTHING
  consumes it until M3-3 (MECHANICS §13.28); **band-edge behavioural sweep OWED to M3-3
  mutation 6(b) by name**. Stale 8/1/5/2 census swept from four docs.
- **M3-11 deck-1 vent** (`8d206ca`, one send-back — record defects, fixed+re-verified) —
  `vent_d1` at (10,1,1) above the cryo vent's riser (the ONE exemption; CUT 23 · EXEMPT 1
  · ADDED 8, stated separately); deck 1 boots 0.000 kPa everywhere; a repair fills the
  hall past 80 kPa and staging flips true. Re-derived: devices 611→**612**, flat demand
  14.30→**14.80 kW** (LS tier 5.70→6.20), off-network still 23 but no longer = deck 1.
  **BOTH delivery blockers filed, in order**: (1) REACHABILITY — the order is accepted
  then silently dropped (every deck-1 door boots shut; `TryFindStagingTile` checks the
  staging tile's walkability, never its reachability); (2) SURVIVABILITY — after opening
  the door by hand she dies ~1/10 into the 900 s service (~90 s of vacuum air, no
  cross-attempt accumulation). M3-6's handoff landed (the `WreckPods` `<summary>` census
  scan gap is closed, asymmetry reproduced).
- **OD-N + OD-O charter lane** (`505cf3e`, docs-only, one send-back — trap 8 in its own
  words: five anchors moved under a mid-lane merge of main). **OD-N** (owner-direct):
  doors AND vents answer only to MOSS; the OPERATE click verb dies; the server IS
  `term_moss`; **SPLIT GATE — repaired (≥ MaintainBelow 0.20, NOT fail 0.02 which is
  already true at boot) ⇒ console (manual actuation); commissioned (1×CM, OD-M 1A
  unchanged) ⇒ programs/pod bay**. The split was chosen after the measured deadlock (0 CM
  aboard; chain behind shut doors; 14/16 doors boot shut; benches + `vent_ls` unreachable).
  Measured en route: **the MOSS console is gated by NOTHING today** — `open door_d0_s1`
  works at tick 0. **OD-O** (owner-direct): the deck-1 vent becomes the game's first
  PROGRAMMING PUZZLE — `vent_d1` re-authored mechanically fine but CONTROL BOARD DEAD
  (`CONTROLLER FAULT`), workaround = `every 1s: set(vent_d1.rate, max)` (all verbs exist;
  `when` is edge-latched and IS the natural wrong answer); program-only; **explicitly NOT
  a pattern — an authorable story tool, exactly ONE instance in M3**. M3-11's
  survivability blocker DISSOLVES for this vent. Chartered: **M3-15 pos 6b (integrator
  lane, spine), M3-16 pos 8b** (fault = bit 12 of the device state word, fold-neutral
  while false, own DEVC bump; `pin/m3-a` only as measured fallback). The puzzle is SPLIT
  ACROSS THE GATE deliberately: diagnose+probe at console tier, the fix needs commission.

## Integrator decisions this session (review these)

1. M3-15/M3-16 queue ids are half-steps (6b/8b) to avoid staling three live "position N"
   citations; M3-16's `set rate`-is-console-tier is the CHARTER's ruling (endorsed by
   review), the any-Terminal predicate is the integrator's (term_nav back door is
   theoretical: unreachable at boot, per the driven census).
2. M3-11 merged with the chartered outcome recorded as "reachable in principle, not in
   practice" — ROADMAP/TARGET do NOT mark its player row delivered; the 2026-08-07
   playtest script must not include "repair the deck-1 vent" as a working beat.
3. OD-O scoped to mechanism + ONE instance despite "repeatable pattern" being offered —
   the owner's own follow-up softened it; recorded verbatim in row O.

## Next (the M3 queue, `perilune-m3.packages.md` §3)

1. **M3-2 CryoSystem (PIN M3-a, RUNS ALONE, needs M3-1 ✅)** — the one standing pin lane;
   check `git tag pin/*` first. ⚠️ Its save chapter may be asked to carry M3-16's fault
   bit ONLY if bit-12 fold-neutrality measures false — read M3-16's design question (a)
   before freezing the chapter.
2. Then M3-3 ThawGate (owes `PodIdentityTests` its thaw leg + M3-6's band-edge sweep) →
   **M3-15 (6b, integrator/spine: the OD-N gate + OPERATE removal)** → M3-4 POD BAY →
   M3-13 (same window) → **M3-16 (8b, the vent puzzle)** → …
3. Housekeeping candidate: 8 unmerged review-*/spike worktrees from the audit (verify
   wanted, then prune). All three of this session's lane worktrees pruned.

## Open on the owner

- **Playtest date 2026-08-07** — confirm or move. ⚠️ Script caution from item 2 above.
- **Unsurvivable vacuum services as a CLASS** — OD-O dissolves it for `vent_d1` only;
  every other deck-1 machine still pairs a 900 s service with ~90 s of air (suit /
  segmented service / accumulation are the named options; `wear.def:17`).
- Browser eyeball items (extension down two sessions running): M3-14's five acceptance
  steps · M3-6's capsule count · M3-11's wrecked vent + 0.000 kPa first screen ·
  Power-lens bulkhead conduit glyphs (M2-11 F-5) · deck-1 "risers cut" legibility · the
  M2-12 repair arc watched by a human.
- Carried: crew docks clip 27-char labels · Prioritise menu names the device TYPE not the
  instance · M2-8/M2-2 off-switch never pre-empts · "Awaiting orders" short form ·
  onboarding card Space row · work-type ▸ reach ranking arguably invertible · BUILD label
  collision · ascending-only click cycle · door art unphotographed · `'/'` glyph.

## Open — unscheduled (filed, unowned)

- **⭐ `PrioritiseJobCommand` accepts-then-silently-drops is a GENERAL defect** (M3-11
  review, driven): any order to a walkable-but-UNREACHABLE worksite is accepted
  (`TryFindStagingTile` never asks reachability), sets the hold, then evaporates in
  `DriveWorker`'s abandon path — no badge, no dock row. Plausibly matters for the
  playtest more than the vent. Related: the M3-14-widened silent APPROACH refusal
  (`ReasonNoApproach` exists; do NOT add `ReasonAir` for repair orders).
- **~15 stale `AuthoredShips.cs` anchors across five charters** (§5 M3-1/M3-2/M3-6/
  M3-11/M3-8, §11, §12 of `perilune-m3.packages.md`) — M3-11's +155 lines moved them;
  the OD-N lane fixed only its own (a half sweep is worse than none — sweep candidate).
- **Pre-existing CLAIM defect**: §5 M3-3 + §12 cite `WreckShipTests.cs:741-752`/`:749` as
  pinning `term_moss scriptable: false` — wrong before the merge too; the real pin is
  `TheMossTerminal_BootsUnCommissioned` (~`:1251-1262`).
- **TARGET.md metric gap** (charter finding): no checklist row exists for "how the ship is
  commanded" / MOSS as a player surface — M3-15/M3-16 move no row and say so; owner/
  integrator may want a row rather than silence.
- **MECHANICS stale set** (integrator file): the four M3-14 ladder spots (`:1118-1119` ·
  `:1850` flee · §13.25 b2 · §13.21) + §13.23a's two-blocker record now needs the OD-N/
  OD-O outcome folded in (survivability dissolved for `vent_d1`; console opens doors).
- **FREEZE as a player verb** — named follow-on (OD-M item 6); occupancy map inside
  `pin/m3-a` or renaming every authored pod.
- Carried: wrapper-predicate census lesson (M2-0's shape ×3) · no wire carries per-device
  powered-ness (`oper` wear-only) · shed lamps 0.5 Hz flicker (§13.11) · `Device.Rate`
  scales generators, unwritten · `IceChainMemoTests` zero-alloc flake · M2-17 residuals ·
  stale-citation sweep candidates (MECHANICS `:62`/`:2008`/`:2741`, ECONOMY.md:72,74,
  moss-terminal.spec.md:417, `Commands.cs:753,778`-as-quoted — real line `:777`) · de-CH
  not de-DE in the trap ledger · §13.1 CO2 gap · M2-21 residuals · `WorkIncapable` not on
  the `work` wire (M3-7 owns) · M2-5 distance tie · `designs` not fog-gated ·
  needy-machine scans · unskinned glyphs · D-3 social gate · `Commands.cs` retracted
  sentence still greps verbatim.

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
| 07-30 night | power-network · power-wear · rebaseline · m3-charters | **M2 CLOSED, phase-1 exit gate MET**: deck 1 honestly off-network · repairing wings steps 10.6→17.4 kW live and the lights stay on · the harness states its grid, A3 measured first time ever · M3 charters adopted (14 pkgs, 8-item owner batch gates the queue) | green, pins UNMOVED, tag `pin/m2-d`, worktrees pruned 18 |
| 07-31 | m3-batch · pod-identity · vacuum-ladder | **the M3 gate cleared (OD-M, all recommendations) and a DIRECT ORDER CROSSES THE FRONTIER**: right-click a machine in vacuum → offered → she walks in, works, may die (rungs 2+3+4, nine sites agree); pods decided single-use, `Device.Name` immutability pinned; playtest date named 2026-08-07 | green, pins UNMOVED, worktrees pruned 3 |
| 07-31 B | pod-census | **the thaw ladder is AUTHORED**: each intact pod's price now derives from its `Condition` (rungs 1–7, depth 0,0,2,2,3,3,3, `ThawGate.RungOf`) — content that exists and nothing consumes until M3-3; census 12/1/7/4 self-consistent, stale 8/1/5/2 swept from four docs | green, pins UNMOVED, APPROVE first pass |
| 07-31 B | deck1-vent · od-n-charter | **deck 1 is ONE repair from air, and the ship learns who it answers to**: `vent_d1` authored (repair fills the hall past 80 kPa, both delivery blockers filed in order); OD-N (doors+vents MOSS-only, split gate repair→console / commission→programs) + OD-O (the vent becomes the first PROGRAMMING PUZZLE, one instance, not a pattern) recorded; M3-15 (6b) + M3-16 (8b) chartered against driven measurements (tick-0 ungated console; 0 CM aboard; 14/16 doors shut) | green, pins UNMOVED, 1 send-back each, worktrees pruned 2 |
