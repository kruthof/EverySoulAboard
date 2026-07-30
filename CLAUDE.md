# PERILUNE — project guide for Claude

> **Game title: Every Soul Aboard** (decided 2026-07-23). "Perilune" is the internal
> **codename** — the repo, the `Perilune.*` namespaces, and the ship MSV *Perilune* keep it.

**The game: RimWorld × Factorio on a wrecked ship — built in that order.** Phase 1 (NOW) is
the RimWorld loop: order → pawn does it → the ship visibly changes. Phase 2 (later, owner-
gated) is the automation game via MOSS — control-not-conveyance, operated by named souls.
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
**5** shell traps — unquoted `$flags`, greps with no non-vacuity check.

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
  | P1 scenario `--days 3 --seed 42` | `c1bac287230e184e` | `ci.sh:36` (+ twin-run equality) |
  | P2 tick-3000 golden | `482fd40c070b54e0` | `Golden/perilune_tick3000_hash.txt` |
  | P3 slice tick-3000 golden | `0dcbff3e167750d8` | `Golden/slice_tick3000_hash.txt` |
  | P4 defs defaults checksum | `0c5ddbc07e41f07d` | `DefsChecksumTests.cs` |
  | P5 defs rules-inclusive (`defs:` print) | `09900b9a44119272` | `DefsChecksumTests.cs` |

  Last mover: M2-1 (PIN M2-a, 2026-07-29) — P1/P2/P3 for the CITZ v8 fold; P4/P5 held.
  P4 and P5 are different values for different things; never paste the occupancy header's
  hash into the defaults pin. Golden rewrite only when intended: `UPDATE_GOLDEN=1 …
  --filter …`, say why.
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
