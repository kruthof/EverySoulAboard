# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-02, session C CLOSED — ⭐ THE M3 QUEUE IS COMPLETE, 16/16, DEMO PASSED)

**Gate on `main` (`9d3bbd7`): 1775 dotnet + 1205 node, twin hashes MATCH at P1
`7bdd0d6f7756dfdc`** (re-measure before quoting). **Pin table** (CLAUDE.md is authoritative):
P1 `7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52` · P3 `43a1a5c25713faec` · P4
`661fcdd4b89f1e87` · P5 `558a1c0a4985f5ea`. **Four pin rows executed this session**, tags
`pin/m3-e` (M3-15, P1 — the scenario Terminal, gate measured inert) · `pin/m3-d` (M3-10,
P4/P5 — the Heater) · `pin/m3-b` (M3-7, P1/P2/P3 fold-only — six skills; ⚠️ no pin sees the
rate term) · `pin/m3-c` (M3-9, P1/P4/P5 — REST; ⚠️ the day-3 line does not move, THE HASH IS
THE ONLY EVIDENCE). No pin row stands open.

**FOURTEEN merges** (one docs sweep + 13 packages: M3-3, M3-15, M3-4, M3-13, M3-16, M3-5,
M3-10, M3-7, M3-12, M3-8, M3-9 + the demo shots), each with one Opus implementer + one
independent reviewer; **every package had exactly one send-back, every one a real defect**
(full records: the §3 queue rows of `perilune-m3.packages.md`; MECHANICS §13.30–§13.40).

**⭐ THE M3 MILESTONE DEMO PASSED — 43 checks, 0 failures** (shots `m3-demo-*.png`, merge
`9d3bbd7`). All three exit-gate clauses HOLD, measured: a second thaw earned AND chosen
(two offered, five refused with numbered reasons; Lindqvist over Ozawa was a priced
choice); **thaws 3–5 span 6.93 sim-hours**, paced by real production (the full
Regolith→Scrap→Parts→ControllerModule chain was PLAYED, plus the scrubbing step function);
**Lindqvist's WORK row differs from Rell's in SHAPE** — five cells to Rell's six, no MINE
cell at all, every number cross-checked at the wire. The sleep beat witnessed. ⚠️ **ONE
CAVEAT: the arc is not reachable in unmodified play** — see the blocker below.

## ⛔ THE PLAYTEST BLOCKER (2026-08-07 is FIVE DAYS OUT)

**No shipping surface can send the `commission` wire command.** `HandleCommission` exists
(`GameSession.cs:1332`); no client/TUI sender does (grep-verified twice, incl. by the demo).
The opening arc dead-ends at commissioning: the player can reach the benches and CRAFT the
ControllerModule with no overlay (the demo proved the material deadlock OD-N feared is
GONE) — what's missing is purely A BUTTON. Natural fix fits OD-P: a typed `commission`
verb at the MOSS console (~one day, incl. its refusal sentences joining the pinned family).
**Asked the owner in-session; awaiting the answer.** Until it lands, T13 stays near-DONE
(the witnessed unmodified-game run is still owed).

## Open on the owner (triage before the playtest)

- **The commissioning button** (above) — the one blocker.
- **⭐ NEW, demo D3 — the work grid is a SOFT-LOCK**: all-six-types-on spends all 10 Seals
  in ~4 sim-h; at 0 consumables no bench can be repaired and the run terminally stalls at
  2 crew (driven to day 7). The demo survived by leaving REPAIR OFF and using direct
  orders. This is "REPAIR eats the ladder's currency" measured to its end state.
- **⭐ NEW, demo D2 — the thaw ladder DECAYS silently**: capsule wear crosses rung band
  edges in 10–30 sim-h (`AuthoredShips.cs:1886`'s ~480 h reassurance measures the wrong
  threshold); Mbeki jumped `2 PARTS`→`1 CONTROLLER MODULE` in 100 sim-min, unannounced.
- **NEW, demo D4 — a direct order into a still-depressurising hall kills silently** (she
  walked in and died; M3-14 carries the order by design, nothing prices the crossing).
- The heater's power TIER + its boot affordability (M3-10) · rung-1 pacing (10 loose
  Seals) · rung 1 of the vacuum ladder needs a new named home (OD-M 7B pointed at M3-b,
  discharged) · unsurvivable vacuum services as a CLASS · playtest date confirm.
- Browser eyeball items (carried): OD-P typed console (`42f59ca`) · M3-14's five steps ·
  power-lens conduit glyphs · deck-1 legibility · `docs/design/shots/` now ~40 MB.
- Carried UI items: crew docks clip labels · Prioritise names the TYPE · off-switch never
  pre-empts · "Awaiting orders" short form · onboarding Space row (+ it still teaches the
  pre-OD-N first order, M4-5) · work-type▸reach inversion · BUILD label collision ·
  ascending click cycle · door art · `'/'` glyph · Rell reads `general crew` beside
  authored people (M4-2/M4-3) · a sleeping crew member is drawn standing.

## Open — unscheduled (filed, unowned; the load-bearing subset)

- **⭐ Demo findings**: D1 an ordinary thaw writes NO Chronicle line (only the emergency
  thaw does — the demo script's "named in the Chronicle" is unsatisfiable) · D5 =
  `PrioritiseJobCommand` accepts-then-silently-drops (GENERAL, carried) · D6 the Chronicle
  drowns in brownout spam (a capped ring; real events pushed out) · D7 the wire accepts a
  work priority for an incapable type (invisible, vetoed state).
- **M3-9 filed set**: extend the M2 property net for out-of-band claimants AS A CLASS
  (Sticky/Preemption pin `IsRecruitableIgnoringJob`, blind to the next need system) ·
  `SustenanceSystem` after `JobSystem` (eating loses to work) · the Director's wear lever
  saturates on a quiet ship · the 60%-awake duty cycle vs §4.4's 70.6% (a
  `fatigue_per_second` retune = its own pin row) · a sleeper cannot eat/drink (benign now).
- **Surface/harness classes**: NOTHING GATES `client/tools/*.mjs` (a harness reading a
  dead DOM contract is found by grep, not tests — bit twice this session) ·
  `moss-gate-shot`/`pod-bay-shot` carry the latent VK_DELETE `'.'` bug ·
  `BLOCKED_ORDER_NAMES` lacks `OrderRepair` (the next one-liner) · the `podsAsked` yank
  window · `HeadlessVent.TryInvoke` skips `DeviceFault` (drift risk) · the wait-state
  dot-ink collision · `.ov-workskill.untrained` has no CSS rule.
- **Older carried sets** (M3-2/M3-4/M3-13/M3-16 residuals, doc-citation residue, the
  `CryoSystem` tick-allocation pin gap, FREEZE-as-verb, `ThawSecondsPerCycle`→`cryo.def`,
  no-exit-tile pod, faulted-device CLEAR path, per-KIND-bit channel note, wrapper-predicate
  census lesson, per-device powered-ness wire, shed-lamp flicker, `Device.Rate` scales
  generators, §13.1 CO2 gap, D-3 social gate, de-CH wording): full prose in the queue rows,
  MECHANICS §13.3x filed lists, and `docs/history/`.

## Next

1. **The commissioning verb** (owner answer pending — if yes, one lane: typed `commission`
   at the console + the refusal family + the witnessed unmodified run that discharges T13).
2. Owner triage of D2/D3/D4 before the 2026-08-07 playtest (all three are first-hour).
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
| 08-02 C | m3-demo | **⭐ THE M3 EXIT GATE HOLDS, MEASURED**: 43/43 — a second thaw earned and chosen · thaws 3–5 span 6.93 sim-h · her row differs in SHAPE; 7 findings filed (2 first-hour: the ladder decays silently; the work grid soft-locks) | demo, 18 shots, **commissioning still needs a button** |
