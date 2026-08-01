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
