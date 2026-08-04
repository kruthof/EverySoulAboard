# PERILUNE — project guide for Claude

> **Game title: Every Soul Aboard** (decided 2026-07-23). "Perilune" is the internal
> **codename** — the repo, the `Perilune.*` namespaces, and the ship MSV *Perilune* keep it.

**The game: RimWorld × Factorio × This War of Mine on a wrecked ship — built in that
order.** Phase 1 (NOW) is the RimWorld loop: order → pawn does it → the ship visibly
changes. Phase 2 (later, owner-gated) is the automation game via MOSS —
control-not-conveyance, operated by named souls. This War of Mine is the third REGISTER
(OD-R, 2026-08-04): the survival tone — scarcity, who-to-wake triage, consequences carried
by named people — it lands in the M4/M5 charters and **nothing is implementable from it
today** (no moral-choice engine, no misery meters; TARGET §1.3/§2).
**For every mechanism decision, RimWorld's implementation is the analogue**: cite
`docs/design/rimworld-reference.md` (§1–§3, §6.1 are source-grade), do not re-derive from
memory. Defaults may deliberately differ where the owner decided (work grid boots OFF, pawn
boots idle). We do not optimize metrics — we move rows in `docs/TARGET.md` §3 and gates in
`docs/ROADMAP.md`. A1 is retired; never quote a busyness number without throughput.

## Read first (exactly three, then look up on demand)

1. **`docs/HANDOVER.md`** — current state, open items, session log. Short; read all of it.
2. **`docs/ROADMAP.md`** — milestones, the package queue, the owner-decision ledger
   (OD-A…OD-K, binding). Detailed M2 charters: `docs/design/perilune-roadmap-q3.packages.md`.
3. **`docs/TARGET.md`** — what we're building; the mechanism checklist that is the metric.

## How a session runs (full detail: `docs/PROCESS.md` — binding)

- **Pick work**: the topmost unmerged row in `docs/ROADMAP.md` §3, unless `HANDOVER.md`'s
  "Next" section says otherwise or the owner directed something else. Never invent a task
  from a metric or a finding; sub-questions and discovered defects get FILED in HANDOVER's
  open list, not chased.
- **Orchestrate, don't implement**: the main session instance is the ORCHESTRATOR and
  integrator. Implementation runs in an **Opus 5 subagent** in the lane's worktree; every
  produced artifact (code package, design doc, measurement) is then reviewed by a
  **separate, independent subagent** that saw none of the implementer's reasoning.
  Send-backs are fixed by the implementer and re-verified before merge.
- **Document as you finish**: rewrite `HANDOVER.md`'s current-state block (hard cap ~120
  lines — it must never overflow a fresh session's context), append one session-log row,
  update the `TARGET.md` checklist / `ROADMAP.md` statuses your merge changed, and state
  in "Next" what the following session should pick up. History goes to `docs/history/`,
  never accumulates in the live files.

On demand: `docs/MECHANICS.md` (how the sim behaves as implemented, `file:line` cited —
**its §13 lists what is wired but NOT connected; read it before trusting a mechanic**) ·
`docs/design/rimworld-reference.md` (the mechanism authority) · `docs/PROCESS.md` (session
lifecycle, scope & test discipline — read before writing tests) · `docs/TRAPS.md` (the full
trap ledger) · `docs/VISION.md` / `docs/ARCHITECTURE.md` / `docs/PLAN.md` (north star,
module map, workstream contracts) · `docs/history/` (archived records — never load-bearing).
The economy is **PARKED at E0-complete** (OD-B): `docs/ECONOMY*.md` are archived design
history, not a queue.

## Layout

`sim/` (Sim.Core, Sim.Dsl, Sim.Gen, Sim.Glyph, Sim.Llm, Sim.Content — all headless) ·
`hosts/` (web, tui, scenario) · `client/` (the shipping browser face) ·
`tests/Perilune.Tests` · `content/core/` (defs + rules + layout) · `art/spritegen/`.

## Invariants — do not break (test-enforced)

- **Sim core is deterministic & engine-free**: 10 Hz fixed tick, input only via
  `ISimCommand`, RNG only via forked `SimRng`, zero alloc in tick paths. Every saved field
  is hashed — add a field ⇒ save + hash + round-trip test in the SAME commit.
- **Projection is pure**: `GlyphMapper.Project` never mutates the sim; fog gate first;
  `GlyphColor` + golden formats append-only.
- **Def field ships in ONE commit**: default + parser key + checksum fold + equivalence
  coverage — plus a behavioural consumer test (a def pinned only by the checksum is NOT
  pinned).
- **Hosts own file IO; sim takes text.** InvariantCulture everywhere (dev machine is de-DE
  — culture bugs are live, including in your own harness's output parsing).
- **LLM never touches sim state directly** — only validated `CitizenEffect`s at tick
  boundaries. The game stays fully playable offline.
- **Spine files** (Simulation.cs, SystemStack, save chapters, GlyphColor, WireFormat,
  Commands, CitizenEffect set) change only through the integrator lane.
- **THE STANDARD SURFACE — build UI on it and nowhere else** (binding, 2026-07-25). The one
  standard UI is the **Level-1 Overview** (`client/src/ui/overview-view.js`) plus the
  **Level-2 Room Zoom** (`client/src/ui/roomzoom-view.js`), worn today by `--ship wreck`
  (`./play.sh`; was `--ship grid` — the rule is about the two modules, not the ship).
  `--ship grid` is the economy-comparison fixture; **`--ship slice`** is the headless
  measurement fixture driven by `hosts/scenario` — no UI, needs none. The console `.app`
  shell is deprecated and closed to new work (`hud.js` survives only as the shared
  wire-cache/state layer). Mechanised in `client/test/surface-boundary.test.js` +
  `tests/Perilune.Tests/SurfaceBoundaryTests.cs` — the latter pins THIS paragraph.
- **ONE door from the map to a person**: all crew interaction consolidates into the single
  Persona window (M4); `CREW_INTERACTION` is pinned by test.

## Work in a worktree — ALWAYS (hard rule)

Every session works in its own worktree on its own branch — including "quick fixes",
including doc-only work. Never edit the main checkout; the only work there is the
integrator's merge and re-pin commits.

```bash
git worktree add ../perilune-wt/<lane> -b lane/<lane>   # before touching anything
cd ../perilune-wt/<lane> && ./ci.sh                     # verify IN-worktree
```

Never `git add -A` / `commit -a` — stage explicit paths. If `git status` shows files you
did not touch, stop and look: you are sharing a tree. (Two sessions once shared a checkout;
measurements taken against a tree someone else is editing are worthless.)

## Traps index — full prose with receipts in `docs/TRAPS.md` (numbering is stable; test comments cite it)

Traps: **1** raw-text guard satisfied by commented-out code — strip comments (shared
`codeOnly`) + negative control · **2** `git checkout` never appears in a mutation loop —
restore from an in-memory copy, `shutil.copy`+`utime` never `copy2` · **3** a FALSE RED — a
mutation red for the wrong reason (crash ≠ semantic; parse de-DE output correctly) ·
**4** pin HOW an API was called by recording the argument at the seam, never a text scan ·
**5** shell traps — unquoted `$flags`, greps with no non-vacuity check; 2026-08-03
addendum: a waiter whose own argv matches its pattern never exits (wait on a PID, never a
pattern) · broad `pkill -f` kills SIBLING agents' gates/hosts (kill recorded PIDs only) ·
a leaked headless Chrome OOM-kills someone else's gate as exit-137 (reads as a suite crash).

Shapes: **4th** a guard whose scope filter excludes the violation (non-vacuity must be an
INCLUSION test) · **5th** `assert` throws, so only a multi-leg test's first leg reports
(blind the legs; fixture carries both failure shapes) · **6th** glyph substitution defeats
kind predicates (ask what a piece is NOT) · **7th** ratio suites cannot see a 2× scale
error (only a proportional floor pins scale) · **8th** a merged file's truth is a number
neither lane could compute (re-derive censuses from the merged tree; merge `main` into the
lane and re-run the FULL gate — a clean auto-merge is NOT a clean merge) · **9th** a
correct finding that narrows an instrument creates a blind spot (ask what the narrowed
instrument can no longer see).

The core rule under all of them: **physically apply every mutation you name, watch it go
red for the right reason, revert.** And: **a count you did not measure yourself is not
evidence, even from this file** — re-measure before quoting.

## Working here

- **Tests**: `~/.dotnet/dotnet test tests/Perilune.Tests --nologo`; the full gate is
  `./ci.sh` (dotnet + node, ~8 min). Counts move every lane — re-measure, never quote a
  doc's figure; per-branch counts are a UNION on merge, never a sum.
- **Determinism — FIVE pins, all gate-enforced.** Moving one ⇒ update `ci.sh` + this table
  + `MECHANICS.md` + `HANDOVER.md` + memory in the SAME commit, tag `pin/<row>`; one
  standing pin lane, never two concurrent (chain + rollback tags in `docs/ROADMAP.md` §3).

  | pin | value | enforced by |
  |---|---|---|
  | P1 scenario `--days 3 --seed 42` | `7bdd0d6f7756dfdc` | `ci.sh:121` (+ twin-run equality) |
  | P2 tick-3000 golden | `cb09b584a5f15e52` | `Golden/perilune_tick3000_hash.txt` |
  | P3 slice tick-3000 golden | `43a1a5c25713faec` | `Golden/slice_tick3000_hash.txt` |
  | P4 defs defaults checksum | `661fcdd4b89f1e87` | `DefsChecksumTests.cs` |
  | P5 defs rules-inclusive (`defs:` print) | `558a1c0a4985f5ea` | `DefsChecksumTests.cs` |

  ⛔ **NO PIN COVERS `--ship wreck`, THE SHIP `./play.sh` BOOTS — measured by D1/D6, 2026-08-02.**
  That package changed what every brownout, repair, thaw and commission writes into the **hashed**
  history ring (`'HIST'` folds tick+kind+SubjectA+SubjectB of every entry; brownout entries now
  carry a network id and an edge count that were 0), and **all five pins held**. The hold is
  **VACUOUS ×4**, measured not argued: instrumenting P1's own fixture prints
  `brownoutEntries=0 thawLines=0 repairLines=0 commissionLines=0 cryoPodsOnShip=0` on all three
  days — its ring is 200/200 `Bond` — and each of the four halves stubbed independently still reads
  `7bdd0d6f7756dfdc`. P2/P3 held for the WINDOW (tick 3000 precedes the first brownout edge: wreck
  128 361, slice 191 331; neither perilune nor slice authors a CryoPod). P4/P5 held genuinely — no
  def field (the episode window is a code constant, M2-1's rule-not-tunable precedent) and
  `StateVersion` stayed 2. ⭐ The same code moves a hash hard where it IS reached: on the wreck at
  tick 200 000, pre-fix `291fedc58c4720ed` (ring 200/200 Brownout) → shipped `79c6641856fb779f`
  (ring 9). ⛔ **AND A DETERMINISM REGRESSION HID EXACTLY THERE — found by review, invisible to all
  five pins.** `PowerSystem` is not `IStatefulSystem`, so a reload re-publishes a duplicate
  `BrownoutChangedEvent`; the first draft folded it into a hashed, never-evicted field and a save
  taken mid-brownout stopped replaying. Closed FOR MID-EPISODE SAVES by an idempotency rule derived
  from the ring (save@135000 + 60 000 ticks, `8b66921d15d45c9b` both sides, §13.10 matched
  recompute) — but ⛔ **NOT for a save on an episode's OPENING tick**, which is filed residual 2:
  permanent, compounding, narrow (1–11 ticks per ~36 000), and closable only by the same
  stateful-`PowerSystem` package. Instruments: `ChronicleSignalTests` + `ChronicleTests`, nothing else (MECHANICS
  §13.43). M2-12's *"no pin sees the generation term"* in a third costume — and this time what the
  pins could not see was a REGRESSION, not just an absence.
  Last mover: M3-9 (PIN M3-c, 2026-08-02) — **P1 + P4/P5 MOVED, P2/P3 measured HELD**, and the cause
  is a BEHAVIOUR change on every ship: `RestSystem` is the reducer `Citizen.Fatigue` never had, so
  crew who were permanently exhausted now sleep between jobs — and `NeedsSystem`'s ramp is GATED
  while they do (RimWorld's rest meter falls only while awake; ungated it made a deck sleep 63.6
  sim-h). P1 `3d23665a724e853d` → `7bdd0d6f7756dfdc` (twin match), P4 `77a7a8a9e967eab4` →
  `661fcdd4b89f1e87`, P5 `edf1577c32f14e55` → `558a1c0a4985f5ea` (three new `[needs]` scalars; each
  measured twice through two code paths). ⚠️ **THE DAY-3 SUMMARY LINE DOES NOT MOVE** — all four 2×2
  cells print `pop 2 / hydro 98.1 kPa / potatoes 371`, so the ONLY evidence is the hash.
  **THE CAUSE IS A DRIVEN 2×2:** with `fatigue_rest_threshold` put out of reach P1 returns EXACTLY to
  `3d23665a724e853d`, so the whole move is the sleep BEHAVIOUR and the system's mere presence —
  registration, `JobKind.Sleep = 12`, the def fields, the `WorkTypeMap` row, the gated ramp — is
  **pin-neutral, measured**; and at `mood_fatigue_weight = 0` the sleep/no-sleep cells STILL differ
  (`97f43a5a7f90bae2` vs `455d352944081b14`), so sleeping moves the pin independently of mood.
  ⚠️ **THE THIRD CAUSE IS THE EXPENSIVE ONE: MACHINE WEAR RATES CHANGED ON EVERY SHIP** — Fatigue →
  `Citizen.Mood` → `ShipMetrics.Morale` → `DirectorSystem` tension → `_wearPressure` →
  `MachineWearSystem`. Asserted out loud by `RestSystemTests.TheWearPath_ACTUALLY_Moves_WhenFatigueFalls`
  (tension 0.20644 with sleep vs 0.20903 without; the Director's `IStatefulSystem` checksum differs).
  ⚠️ **P2/P3 HELD, AND THE HOLD IS THE WINDOW, NOT A DEAD SYSTEM:** tick 3000 is 300 sim-seconds where
  Fatigue reaches ~0.0052 against a 0.75 trigger. Control, driven — at `fatigue_rest_threshold = 0.001`
  BOTH goldens move (perilune `→ c4001c0b66e3e4e9`, slice `→ 78e2cc40adc39c45`). ⛔ Do not read
  "P2/P3 held" as "the goldens cover rest": the instrument is `RestSystemTests`, and nothing else.
  Before that: M3-7 (PIN M3-b, 2026-08-02) — **P1/P2/P3**, and the cause is a FOLD WIDENING, not a
  behaviour change. `Citizen.Skill` — M2-1's last reserved byte — became the per-work-type
  `SkillsRaw` array of six (CITZ v8 → v9, OD-M item 8A), so the citizen fold folds six bytes where
  it folded one. P1 `13674ebc4f8a14a9` → `3d23665a724e853d` (twin match), P2 `1c036ffd53b8f106` →
  `cb09b584a5f15e52`, P3 `37c85c1ed445895e` → `43a1a5c25713faec`. **FOLD-ONLY, MEASURED:** with the
  widened array present, all six consumers live and the fold reverted to
  `Combine(h, (ulong)c.SkillsRaw[0])`, P1 read `13674ebc4f8a14a9` again and BOTH goldens were green
  against their OLD values. The scenario's day-3 line is byte-identical either way (pop 2 / hydro
  98.1 kPa / water 0.0 L / potatoes 371). **P4/P5 HELD** — the curve is LITERALS, not a def field
  (M2-1's rule-not-tunable precedent); `DefsChecksumTests` green and the `defs:` print still
  `edf1577c32f14e55`.
  ⚠️ **AND SAY THE HARD HALF OUT LOUD: NO PIN SEES THE RATE TERM — the thing the package is FOR.**
  Measured as a 2×2, not assumed: force EVERY crew member to skill 20 (a 2.24×–3.00× rate change)
  and all three pinned runs are **bit-identical with the rate seam live and with it stubbed out**
  (P1 `baf85f1209ce5ea3` both ways; perilune `3fa8982abae9456b` both ways; slice `b4a2380ffc416ec2`
  both ways). Cause: OD-H boots every work type OFF and no pinned run enqueues a command, so no job
  is ever claimed and no work tick is ever assigned. This is M2-12's *"no pin sees the generation
  term"* in a second costume and M2-17's lesson exactly — **an unattended fixture does no work, so a
  held pin here is VACUOUSLY held.** The rate curve's ONLY instrument is `SkillConsumerTests`
  (driven, absolute tick counts, one leg per consumer). ⛔ Do not let a later lane read "P1 held" as
  evidence that work rates are unchanged.
  Before that: M3-10 (PIN M3-d, 2026-08-01) — **P4 AND P5 ONLY**, and the cause is one enum
  member with four tails. `DeviceKind.Heater = 28` grows `Machines` by a row (8 columns through
  the fold loop) AND grows `Recipes`, which `CreateDefault` sizes `new RecipeDef[Machines.Length]`
  (6 more fields for an entry no crafting uses); on top of that the package appends TWO def
  scalars, `heater_output_kw` (5 kW) and `thermal.heater_ceiling_k` (294.15 K). P4
  `0c5ddbc07e41f07d` → `77a7a8a9e967eab4`, P5 `09900b9a44119272` → `edf1577c32f14e55`, each
  measured twice through two loaders (P4: the pin test's `CreateDefault` and
  `DefsEquivalenceTests`' parse of the shipped `.def` files, agreeing to the digit; P5: the pin
  test and `hosts/scenario --days 0 --seed 42`'s own `defs:` print).
  ⛔ **P1/P2/P3 HELD, AND THE HOLD IS MEASURED RATHER THAN ARGUED:** `./ci.sh` green with the
  twin-run match still `13674ebc4f8a14a9` (M3-7 has since moved it) and both tick-3000 goldens
  byte-unchanged — **that run
  IS the proof**; everything below is a cheap alarm that says which fixture moved, never a second
  authority. The reason it holds is that **no fixture behind a pin authors a heater**, so no
  pinned run reaches `ThermalSystem`'s new arm. Mechanised in two halves, because the pins do not
  share a shape: P2/P3 (and grid/wreck) are `ShipPlan`s and are censused by
  `HeaterTests.NoPinnedShipAuthorsAHeater`; ⭐ **P1 is NOT a `ShipPlan` at all** — `ci.sh` runs
  `hosts/scenario --days 3 --seed 42`, whose sim is `Program.cs`'s hand-built `BuildScenario`, so
  it is scanned AT THE SOURCE by `P1sOwnFixtureAuthorsNoHeater` (shared `CodeOnly`, with both an
  inclusion control and a commented-out-code control). Each half has a sibling that plants a
  heater and requires the guard to name it — a search that finds nothing and a search that cannot
  find anything look identical otherwise. `ci.sh` did NOT change at M3-10: its literal is P1's,
  and M3-7 moved it.
  Before that: M3-15 (PIN M3-e, 2026-08-01) — **P1 ONLY**, for OD-N's actuation gate, and the
  cause is a FIXTURE HOLE rather than new state. `SetDoorStateCommand`/`SetDeviceStateCommand`
  now ask `MossGate.IsServerLive` (any Terminal, `Powered`, `Condition >= maintain` 0.20), and
  P1's ship — `hosts/scenario`'s hand-built `BuildScenario` — **authored no Terminal at all**:
  its life-support watch installs on `term_main`, a bare script id with no device
  (`SetScriptCommand` permits that on purpose and names this host as the reason). So the gate
  was shut there forever and the watch's `open(vent)` — which fires in DAY 2, when hydro dips
  below its 96 kPa trigger — was refused; hydro went 96.2/98.4/97.7 → 96.2/95.1/94.3 kPa.
  The fix authors `term_main` as a REAL Terminal at (17,3,0), beside the `c_leg1` conduit so
  `PowerSystem` wires it, and the watch fires through the gate again (hydro back to 96.2/98.4/98.1).
  ⛔ **THE 2×2, DRIVEN, AND THE HEADLINE IS THE FOURTH CELL:** no `term_main` + gate ON reads
  `6d6e009299e6e86e`; no `term_main` + gate OFF returns to `25f604dd61b221fb` TO THE DIGIT;
  `term_main` + gate ON reads `13674ebc4f8a14a9`; and `term_main` + gate OFF reads
  **`13674ebc4f8a14a9`, identical** ⇒ **on the shipped tree the gate is INERT on this pin.** Every
  bit of the move is the one authored device (0.1 kW draw + 0.1 kW waste heat into a compartment
  this fixture keeps deliberately tight); none of it is the gate refusing anything, and none of it
  is cached state — `MossGate` has no instance field, no mutable static, no def field, no save
  chapter. There was NO zero-move option: leaving the fixture terminal-less deletes the pinned
  window's only script→device actuation path.
  **P2/P3/P4/P5 all held for M3-15** — no def field, no new `DeviceKind`, and every authored
  fixture ship carries `term_hydro` at 1.000, so the gate is open on them before the first tick.
  Before that: M3-2 (PIN M3-a, 2026-07-31) P1/P2/P3 for `CryoSystem`'s SYSS seed, FOLD-ONLY and
  measured as such (interface dropped ⇒ all three read their OLD values); M2-2 (PIN M2-e,
  2026-07-30) P1/P3 for the work-type veto; M2-1 (PIN M2-a, 2026-07-29) P1/P2/P3 for the CITZ v8
  fold. P4 and P5 are different values for different things; never paste the occupancy header's
  hash into the defaults pin. Golden rewrite only when intended: `UPDATE_GOLDEN=1 … --filter …`,
  say why.
- **Play: `./play.sh`** — builds host + client server, prints one URL, Ctrl+C stops both.
  Defaults to `--ship wreck` (pinned by `WebHostDefaultShipTests`). Fixtures (never offer
  to a player): `--ship slice` headless via `hosts/scenario --dump/--metrics`; `--ship
  perilune` behind the tick-3000 goldens; `--ship grid` the economy baseline. Direct:
  `~/.dotnet/dotnet run --project hosts/web -- --port 8330 --ship slice`; TUI:
  `--project hosts/tui -- --play`.
- **LLM**: auto-route is local-first (ollama → anthropic → openai → template); `.env` keys;
  boot prints the chosen backend. Env-gated smoke: `--project hosts/scenario -- llm-smoke
  --backend all` (cloud legs cost cents).
- **Sprites**: `python3 art/spritegen/run.py --spec <spec.json> --stage all`.
- **Process**: session lifecycle, orchestration (one implementer + one independent reviewer
  subagent; the session orchestrates only), scope & test budgets, and the session-end
  handover ritual are in `docs/PROCESS.md` — binding. One commit per reviewed package;
  substantive changes get independent review before merge.
