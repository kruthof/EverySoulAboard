# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-31 session B — M3-6 merged, queue position 3)

**Gate on `main` (`a6ce8d3` + session docs): every `./ci.sh` leg green, 1562 dotnet +
1120 node, twin hashes MATCH at P1 `81733e27709f36e4`** (re-measure before quoting; +3 on
1559 = exactly M3-6's three tests). `main` had NOT moved since the lane was cut, so the
merged tree is byte-identical to the tree implementer AND reviewer both gated — TRAPS 8
satisfied by identity. **All five pins unmoved.** Next pin row is still **M3-a (M3-2
CryoSystem, RUNS ALONE)** — one non-pin package (M3-11) sits before it.

Earlier today (session A, `351acf0`): OD-M recorded (all recommendations, 1A…8A —
amends OD-E, deviates from OD-K's rung list), M3-1 pod-identity merged (pods single-use,
`Device.Name` immutable, thaw leg owed to M3-3), M3-14 vacuum ladder merged (a direct
order crosses the frontier and she may die; nine sites). Details: the §3 queue rows in
`perilune-m3.packages.md` + ROADMAP §5.

This session merged **M3-6 — the pod census, and the ladder's rungs** (`3b3d5e3`,
APPROVE first pass):
- **New `sim/Sim.Core/ThawGate.cs`** — `RungOf(Condition)`, the OD-M item 1 band table as
  a pure zero-alloc static: rungs 1–7 = 1×Seals · 2×Seals · 1×Parts · 2×Parts · 1×CM ·
  2×CM · 3×CM over edges 0.92/0.90/0.87/0.85/0.82/0.80; depth 0,0,2,2,3,3,3; the
  commissioning gate is the PROLOGUE, not a rung; `Scrap` deliberately unused. **Lower
  edges uniformly INCLUSIVE (`>=`), pinned at exactly 0.90 → rung 2** (RW§6.1's
  edge-nobody-chose lesson). NOTHING consumes it until M3-3 — MECHANICS **§13.28**.
- `WreckShipTests` (+409): the seven intact pods land on rungs 1–7 by HAND-WRITTEN
  literals (never derived from `WreckPods` or the table — mutation 4 refused by
  construction); boundary leg; prose-header self-consistency scan with a non-vacuity
  control (deliberate, stated `codeOnly` INVERSION — the census prose IS the artefact;
  positive-claims-only because the header records the dead draft on purpose).
- `AuthoredShips.cs` NOT touched: header + census literals were already correct at
  12/1/7/4. The stale **8/1/5/2 swept from FOUR docs** (q3.packages outline row +
  wreck-start ×2 + q3.plan — the ninth-trap shape's fourth occurrence, class-swept).
- **The band-edge BEHAVIOURAL sweep stays OWED to M3-3 mutation 6(b) by name** (test
  header says so; M3-3's charter accepts it over all six interior edges).
- Pin-neutral proven: check A = 0 lines, P1 twin unmoved, P4 unmoved. Reviewer
  independently re-ran every mutation (+2 probes of its own) and every ci leg.

## Integrator decisions this session (review these)

1. Merged with `main` unmoved — full-gate-on-merged-tree satisfied by tree identity.
2. **Stale-census sweep widened past the chartered one row** to all four live quoting
   docs ("sweep the class, not the list" — M2-12's lesson).
3. Reviewer observations triaged: **handed to M3-11 by name** (in its queue window) —
   widen the header scan's anchor to the SECOND prose census on `WreckPods`' own
   `<summary>` (`AuthoredShips.cs:1745-1752`; reviewer proved it survivable today) ·
   `Commands.cs:753,778` citation drift (real line is `:777`; predates M3-6, inherited
   from OD-M item 1's own text) → stale-citation sweep list · §13.28's `:1760-1772`
   range fixed to `:1760-1777` in the session-docs commit.
4. M3-6's integrator eyeball (Room Zoom: twelve capsules, four wrecked + `Corpse`)
   joins the browser-owed list — the package changed no runtime behaviour and the art
   census is unchanged since 07-28; the full browser beat is M3-4's by charter.

## Next (the M3 queue, `perilune-m3.packages.md` §3)

1. **M3-11 deck-1 vent** (`lane/deck1-vent`) — same file as M3-6, now unblocked; shape =
   OD-M item 2 (deck 1 boots dead, player MAY bring it back; authored vent + riser tap,
   vent wrecked; NO vertical gas term). ⚠️ M2-11 is a past claimant whose measured census
   this changes — re-derive 23/611 + 14.30 kW from the merged tree. Carries M3-6's
   handoff: widen the prose-census scan anchor.
2. Then **M3-2 CryoSystem (PIN M3-a, RUNS ALONE, needs M3-1 ✅)** → M3-3 ThawGate (owes
   `PodIdentityTests` its thaw leg + M3-6's band-edge sweep) → M3-4 POD BAY → M3-13
   (same window as M3-4) → …
3. **Queue-head parallelism: there is none by design** (asked 07-31): M3-11 is serialized
   behind M3-6 on `AuthoredShips.cs`; M3-2 is a pin lane that runs alone; everything
   after needs M3-2/M3-3. One lane at a time until M3-3 lands.
4. Housekeeping candidate: 8 unmerged review-*/spike worktrees kept from the audit
   (commits not in main — verify wanted, then prune). `pod-census` worktree pruned.

## Open on the owner

- **Playtest date 2026-08-07** — confirm or move.
- Browser eyeball items (extension down two sessions running): M3-14's five acceptance
  steps · M3-6's capsule count (Room Zoom: twelve, four wearing the wrecked twin +
  `Corpse`) · Power-lens bulkhead conduit glyphs (M2-11 F-5) · deck-1 "risers cut"
  legibility · the M2-12 repair arc watched by a human.
- Carried: crew docks clip 27-char labels · Prioritise menu names the device TYPE not the
  instance · M2-8/M2-2 off-switch never pre-empts · "Awaiting orders" short form ·
  onboarding card Space row · work-type ▸ reach ranking arguably invertible · BUILD label
  collision · ascending-only click cycle · door art unphotographed · `'/'` glyph.

## Open — unscheduled (filed, unowned)

- **A repair order's APPROACH refusal is still silent, and M3-14 WIDENED its reach** —
  the air gate used to refuse at issue time; now a boot-state (doors shut) vacuum order is
  accepted, held, and refused downstream by geometry, silently (held=true took=true
  startedWork=false, stationary 300 sim-s, self-clears ~tick 12000). `ReasonNoApproach`
  exists in the vocabulary; do NOT add `ReasonAir` for repair orders (documented at
  `AddUnfixableRow`).
- **MECHANICS is stale in four places about the ladder** (M3-14 filed; integrator file):
  `:1118-1119` "safety and approach are never overridden" · `:1850` flee claim ·
  §13.25 b2 "nowhere survivable" no longer a refusal · §13.21 needs a ladder line.
- **FREEZE as a player verb** — named follow-on (OD-M item 6): occupant mutability costs
  an occupancy map inside `pin/m3-a` or renaming every authored pod.
- **Wrapper-predicate census lesson** (cost one send-back): a call-site census over one
  predicate's NAME cannot see a wrapper carrying it (`IsUnfixableWreck` wraps
  `CanStageWorkerAt`); sweep the wrapper too. M2-0's shape, third occurrence.
- Carried: no wire carries per-device powered-ness (`oper` wear-only, §13.25 b2) · shed
  lamps 0.5 Hz flicker on flat bank (§13.11) · `Device.Rate` scales generators, unwritten
  · `IceChainMemoTests` zero-alloc flake · M2-17 residuals (A2's question, A3 qualitative,
  `TryParseSpec` last-dup-wins) · stale-citation sweep candidates (MECHANICS
  `:62`/`:2008`/`:2741`, ECONOMY.md:72,74, moss-terminal.spec.md:417,
  `Commands.cs:753,778`-as-quoted-in-ThawGate/§13.28/OD-M-item-1 — real line `:777`) ·
  de-CH not de-DE in the trap ledger's wording · §13.1 CO2 gap · M2-21 residuals ·
  `WorkIncapable` not on the `work` wire (M3-7 owns) · M2-5 distance tie · `designs` not
  fog-gated · needy-machine scans · unskinned glyphs · D-3 social gate · `Commands.cs`
  retracted sentence still greps verbatim below its retraction block.

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
