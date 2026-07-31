# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-31 session — the M3 gate cleared, positions 0–2 merged)

**Gate on `main` (`351acf0` + session docs): `./ci.sh` exit 0, 1559 dotnet + 1120 node,
twin hashes MATCH at P1 `81733e27709f36e4`** (re-measure before quoting; the dotnet count
is the post-merge union 1546+1+11+1). **All five pins unmoved all session.** No pin row
touched; next pin row is **M3-a (M3-2 CryoSystem, runs alone)**.

**THE M3 OWNER BATCH IS ANSWERED — OD-M** (owner, 07-31: *"follows all recommendations"*,
commit `7e3abb6`): **1A 2A 3A 4A 5A 6A 7B 8A**. Item 2 AMENDS OD-E's headline (deck 1
boots dead and MAY be brought back; no-vertical-gas-term stands); item 7 DEVIATES from
OD-K's rung list (rungs 2+3+4 ship; rung 1 deferred by name to M3-7); item 6 = unfreeze
only; item 8 = six-byte `Citizen.Skill` inside M3-7's M3-b bump. Ledger: `ROADMAP.md` §5.

Merged, in order:
- **M3-batch (docs)** — OD-M recorded, OD-E amended in place, OD-L gains the unfreeze-only
  clause, T15 → decided-deferred, §10 stamped answered. One send-back (OD-M binds cell
  short one package — M3-8; ROADMAP §4 still commissioning T15) + a class sweep of
  "batch still reads open" texts. ROADMAP line cites re-measured, nothing shifted.
- **M3-1 pod-identity** — the recorded non-change: `Device.Name` keeps BOTH duties (MOSS
  registry key + sleeper identity), pods are single-use, MECHANICS **§13.27** +
  `PodIdentityTests` (driven: boot wreck, 3000 commanded ticks, name map + multiset
  unchanged; mutation proven red for the semantic reason, reproduced independently by the
  reviewer). **The thaw leg is OWED to M3-3 by name** — the test header says so.
  APPROVE first pass.
- **M3-14 vacuum ladder** — a direct order crosses the pressure frontier: rungs 2+3+4
  (`CanStageWorkerAt(forced)` read off `Citizen.HeldByOrder`; no new state). **NINE
  decision sites, not the charter's seven**: the implementer found the eighth
  (`PrioritiseJobCommand` — spine touch, integrator-accepted: two argument values, no
  payload/ctor/wire change), the reviewer's census found a fifth `IsUnfixableWreck` site
  (`OperateAdvisory` said "NO PARTS ABOARD" about a ship holding four Parts — send-back,
  fixed, mutation-pinned). Rung 0 KEPT (autonomous work never enters vacuum); rung 4
  unsoftened — **she does not flee and may die**, pinned by `Rung4_SheMayDie…` with an
  un-ordered bystander control. Pin-neutral proven three ways (check A = 0; non-vacuity
  control drives a held order into vacuum; P1 twin re-measured). 25 needy machines on the
  wreck are order-only today, incl. `vent_ls` and every deck-1 light.

Every package: Opus implementer + separate independent reviewer; two send-back rounds,
both fixed and re-verified. Reviewer drove acceptance on the shipping ship (doors open:
she takes the order, works in vacuum, suffocates, dies — the chartered behaviour).
**Browser eyeball still owed** (extension down again): the five M3-14 acceptance steps
watched by a human in `./play.sh`.

## Integrator decisions this session (review these)

1. **The week-9 60-min owner playtest is NAMED: 2026-08-07** (duty fired on M3-1's merge,
   §3 of the charter doc). Adjust it, owner, not silently.
2. **M3-14's spine touch accepted** (Commands.cs, two argument values) — stopping would
   have left the package undeliverable; reviewer verified minimality byte-level.
3. Two honest mutation survivors ACCEPTED as argued+verified, not papered: scenario-host
   parity unpinned (`--maint-audit` unreachable from tests); `JobContext` bypass
   unreachable until a held order can be a dig (M3-7's shape).

## Next (the M3 queue, `perilune-m3.packages.md` §3)

1. **M3-6 pod census** (`lane/pod-census`) — claims `AuthoredShips.cs` (strictly
   serialized; M2-11 a past claimant); authors the re-keyed rung ladder
   `3 → 0 0 2 2 3 3 3` (OD-M item 1); band-edge mutation deferred by name to M3-3.
2. Then M3-11 deck-1 vent (same file, after M3-6; shape = OD-M item 2) →
   **M3-2 CryoSystem (PIN M3-a, RUNS ALONE, needs M3-1 ✅)** → M3-3 ThawGate (owes
   `PodIdentityTests` its thaw leg) → M3-4 POD BAY → M3-13 (same window as M3-4) → …
3. Housekeeping candidate: 8 unmerged review-*/spike worktrees kept from the audit
   (commits not in main — verify wanted, then prune). This session's three lane worktrees
   pruned after merge.

## Open on the owner

- **Playtest date 2026-08-07** — confirm or move.
- Browser eyeball items (extension down two sessions running): M3-14's five acceptance
  steps · Power-lens bulkhead conduit glyphs (M2-11 F-5) · deck-1 "risers cut" legibility
  · the M2-12 repair arc watched by a human.
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
  `:62`/`:2008`/`:2741`, ECONOMY.md:72,74, moss-terminal.spec.md:417 — prose decision) ·
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
