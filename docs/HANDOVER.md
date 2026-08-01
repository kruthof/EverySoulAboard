# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-31 session B — M3-6/M3-11/M3-2 merged, OD-N/OD-O recorded, PIN M3-a MOVED)

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

Merged this session, in order (each: Opus implementer + separate independent reviewer;
FULL RECORDS in the §3 queue rows of `perilune-m3.packages.md` — this is the index):
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

1. **M3-3 ThawGate** (owes `PodIdentityTests` its thaw leg + M3-6's band-edge sweep;
   needs M3-2 ✅ + M3-6 ✅) → **M3-15 (6b, integrator/spine: OD-N gate + OPERATE
   removal)** → M3-4 POD BAY → M3-13 (same window) → **M3-16 (8b, the vent puzzle)** → …
2. **Owner manual check** (input fix `f74844a` VERIFIED WORKING by the owner 07-31; OD-P
   `42f59ca` still owed a look): in MOSS, `l` and `p` must TYPE into the prompt (nothing
   opens); `log` + Enter / `prog` + Enter navigate; on a system's DETAIL, bare `log`
   opens that system's filtered log.
3. Housekeeping candidate: 8 unmerged review-*/spike worktrees from the audit (verify
   wanted, then prune). ALL of this session's lane worktrees pruned (5 lanes).

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
  OD-O outcome folded in (survivability dissolved for `vent_d1`; console opens doors) +
  two older drifted anchors M3-2's sweep deliberately left (§13.27 `:1856`→ measured
  `:1963`; §13.28 `:1760-1777`→ measured `:1865-1882` — sibling packages' records).
- **MOSS console filed set** (from the input-fix + OD-P reviews, all pre-existing):
  a command typed on the PROGRAM screen can never be submitted (the prompt renders there
  but IX-M11 gives the IDE every key — the one screen where the terminal lies; hide the
  prompt row or route it, M3-4's window) · off-LEDGER `↑`-history and ESC-clear-first are
  LEDGER-only · `log` on an open FAULTLOG re-opens rather than toggles (deliberate, ESC
  closes) · `moss-model-fake.js` carries an unguarded copy of `KEY_ROUTE` (the double can
  drift from the shipping table; benign while the class guard sits on the real one) ·
  vanished-tid PROGRAM selection keeps a dead editor mounted.
- **M3-2 filed set**: a pod finishing with NO free exit tile blocks the whole bay forever,
  silently (deliberate refusal, unrecorded queue consequence — M3-3/M3-4 own the surface) ·
  nothing pins `CryoSystem`'s tick allocation (`StateHashHonestyTests:805` excludes
  stateful systems) · a pod wearing below `fail` mid-cycle freezes silently (unreachable
  at shipped wear rates) · thawed pawns boot `AutoWander=true` (implementer's choice,
  matches Rell — one line to flip) · `ThawSecondsPerCycle` promotes to `cryo.def` in the
  next package that moves P4/P5 anyway · pre-existing CA1305 at `PeriluneGoldenTests:65`.
- **FREEZE as a player verb** — named follow-on (OD-M item 6); occupancy map inside
  `pin/m3-a` or renaming every authored pod.
- Carried (unchanged this session — full prose in `docs/history/HANDOVER-2026-07.md` and
  the trap ledger): wrapper-predicate census lesson ×3 · no per-device powered-ness wire ·
  shed-lamp flicker · `Device.Rate` scales generators, unwritten · `IceChainMemoTests`
  flake · M2-17/M2-21/M2-5 residuals · stale-citation sweep candidates (MECHANICS
  `:62`/`:2008`/`:2741`, ECONOMY.md:72,74, moss-terminal.spec.md:417, `Commands.cs:777`) ·
  de-CH wording · §13.1 CO2 gap · `WorkIncapable` off the `work` wire (M3-7) · `designs`
  not fog-gated · needy-machine scans · unskinned glyphs · D-3 social gate ·
  `Commands.cs` retracted sentence.

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
| 07-31 B | cryo-system | **A POD CYCLES**: set a capsule counting and a named person steps out beside it — 4 sim-min, one at a time, wrecked pods never, single-use honoured; emergency-thaw bit stored for M3-5 | green, **PIN M3-a: P1/P2/P3 MOVED fold-only (cause measured), P4/P5 held**, tag `pin/m3-a`, 1 doc-only send-back |
| 07-31 B | moss-input | **the MOSS terminal takes typing again** (owner-reported live): the PROGRAM editor no longer blurs on wire renders (subtree built once — `replaceChildren(sameNode)` blurs too, measured in Chrome); a declined key lands in the prompt incl. AltGr on de-DE; dom-lite's four blur rules self-pinned (each was silently inert alone) | node 1132 (+12), APPROVE + 3 review additions, **owner VERIFIED working** |
| 07-31 B | moss-hotkeys | **OD-P: the MOSS console is a TERMINAL** — `l`/`p` type into the prompt (an `ls` command is now possible later); `log`/`prog` navigate, bare `log` on DETAIL inherits the filter, ENTER submits wherever the prompt shows; the screenshot harness now proves WHICH screen it drew (its verdict used to echo the request) | node 1138 (+6), 1 send-back (harness on deleted keys), spec amended |
