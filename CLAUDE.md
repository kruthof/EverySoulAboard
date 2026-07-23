# PERILUNE — project guide for Claude

A RimWorld-depth colony sim aboard a drifting ship where every crew member is a person
you can talk to. Deterministic UnityEngine-free C# sim, semantic glyph projection,
web/TUI skins, MOSS automation DSL, LLM-driven crew (multi-provider, offline-capable),
AI sprite pipeline. Clean-room successor to `../moonbase` (Unity is gone entirely).

## Read first
- **`docs/HANDOVER.md`** — current state, what's landed, the rituals (hash-move,
  def-field, worktree lanes), backlog, and what's next. Read before touching code.
- **`docs/VISION.md`** — what we're building and why it isn't RimWorld.
- **`docs/ARCHITECTURE.md`** — module map, invariants, LLM runtime, content packs.
- **`docs/MECHANICS.md`** — how the game actually works *as implemented* (every number
  cited `file:line`), plus the "Known gaps — wired but not connected" list. Supersedes
  `legacy/GDD.md` §4–5 wherever they disagree; read §13 before trusting a mechanic.
- **`docs/PLAN.md`** — phases, the 10 parallel workstreams, conflict rules. Find your
  lane here before touching code.
- **`docs/ECONOMY.md`** + **`docs/ECONOMY-PLAN.md`** — the economic redesign (2026-07-22,
  DESIGN ONLY, nothing built). `ECONOMY.md` is the design authority for matter, labour and
  value; `ECONOMY-PLAN.md` is the wave/lane execution plan. Read `ECONOMY.md` §1 before
  touching anything economic — it is a measured indictment of the shipped economy.
- `docs/legacy/` — the moonbase-era design docs (GDD, TDD, LLM_CITIZENS, MOSS_SPEC,
  SIMULATION_ARCHITECTURE, TUI, HANDOVER). Mechanism detail there is still
  authoritative where the new docs don't supersede it.

## Status snapshot (2026-07-22) — economy Wave 0 COMPLETE, `main` merged in
**Read `docs/HANDOVER.md` "Economy Wave 0 — COMPLETE, START HERE" first.** The economy
programme's Wave 0 (behaviour-free plumbing that must land before any economy lane spawns)
is **DONE — all six packages merged on `lane/economy-w0`**:
W0-1 hash packs un-aliased · W0-2 `EffectKind` widened · W0-3 `JobsDirty` split into
tile/item/site/citizen flags · W0-4 `JobSystem` split into an `IJobSource` dispatcher ·
W0-5 the `[production]` node table · W0-1b the 13 saved-but-unhashed fields hashed
(`Path`/`PathIndex`/`MoveCooldown` were live tick state hashing **equal**) · W0-6 the four
empty economy systems registered (`ZONE`/`PROD`/`ORES`/`TRAD` SYSS, one batched pin move).
Every package was Opus-implemented + independently Opus-reviewed; four of six were sent back
at least once. **`main` — through the MOSS terminal, render light-pools and the movement
fixes — is now merged into the branch; the gate and pin are re-measured on the merged tree**
(see "Determinism proof" below). **Next: land the branch on `main`, then the B-1/B-2/B-3
shipping-bug commits (`ECONOMY.md` §1.5), then the E-lanes spawn (E0-1 recruitability first).**

### Earlier snapshot (playtest rounds 3–4 + MOSS terminal)
**`docs/HANDOVER.md` "Playtest round 4" then "round 3"** — **`docs/MECHANICS.md`** is the
authority on how the sim actually behaves (its §13 lists what is *wired but not connected*),
the slice has a working build/dig economy, crew work is legible on the map, crew no longer
promise physical work they cannot do, the ship stage was relit + de-blurred + lit with real
pools and grounding shadows, and pawns now face where they walk and no longer blink.
**`docs/design/perilune-art-direction.md`** is the art authority — the sprite regen is
DECIDED-NOT-NOW (design first, regenerate last); nothing generated, no credits spent.
Known-honest limits: the dig is a **boot-window** economy (crew idle again after ~4 sim-min
of digging), the stage is still far flatter than Prison Architect, and the CO2 problem is a
**gas-transport bug** (no diffusion term), not a dispatch gap.

**MOSS terminal COMPLETE 2026-07-22** (five lanes, each Opus-gated, spec
`docs/design/perilune-moss-terminal.spec.md`): clicking MOSS replaces the whole window with a
Fallout-style amber CRT — a one-screen ledger of all 8 ship systems (LOAD/STATE/LAST FAULT),
SYSTEM DETAIL, FAULT LOG, a **PROGRAM** in-terminal IDE (source editor + diagnostics + audit +
Install, a view of `model.program` over the DSL), and a live `>` prompt that reads and commands
devices through the DSL's own adapters (no new `ISimCommand`). `ShipSystems.Compute` is a **pure**
report next to `ShipMetrics` — no sim field, no hash fold, pins unmoved. Every gauge is derived
from live sim state or shown OFFLINE with a reason: the mock's MEDICAL/COMMS/GRAV-RING rows are
inert or absent in the sim, so they were replaced by THERMAL/FABRICATION/NAV-SENSORS. The screen
honestly surfaces the three live economy bugs (life_support DEGRADED at 16,677 ppm while capacity
reads 58%; the dry hydro tank; the freezing thermal loop). Nothing deferred.

### Earlier snapshot (2026-07-21)
P0 + P1 + **P2 complete** on the automated side ("The Talking Ship" slice; tag
`v2-talking-ship` pending the human playtest + blind screenshot A/B). Live: async LLM
runtime + three adapters (Anthropic/OpenAI-compat/Ollama) with `.env` auto-route,
ConversationHub talking web host, MEMS-persisted crew minds, Chronicle + verbatim
eulogy, registered Director (gentled 1.35 lever), build/refit walls+doors, relationship
types, the 8-crew authored slice (`--ship slice`), a ~99%-parity WebGL2 client with
lighting/dialogue/MOSS-IDE/motion, and `P2ExitTests`. **560 dotnet + 188 node tests
green** via `./ci.sh`. Live-provider smoke on record ($0.0045, `docs/SMOKE-P2.md`).
A post-tag playtest-feedback round landed 2026-07-21 (sprite matte/hysteresis/click
fixes, plain-first-person dialogue prompt, regenerated pawn idles + slice portraits,
`roster`/`build` wire), and the **Console UI rebuild landed the same day** (`710c5d2`,
triple-review): the client now wears the warm Space Mono console from
`docs/design/perilune-game-ui.dc.html` — roster-fed CREW WATCH, READOUT, tabbed
bottom console with live BUILD/CHRONICLE, draggable panels; specs beside the mock
(`perilune-game-ui.{interaction,visual}-spec.md`) are the UI contract — see HANDOVER
"The Console UI rebuild". Conversation history now reaches the model (`9b16c07`,
Opus-gated + live-probed: transcript threaded hub→adapters, anti-meta prompt) — see
HANDOVER "Conversation history fix". **Playtest round 2 landed 2026-07-21 evening**
(four Opus-gated lanes — see HANDOVER "Playtest round 2"): continuous pawn-slide
interpolation (no more dart/park/snap), player lines echoed in chat + one-click close
+ per-crew CONVERSATION LOG in the biography (durable MEMS summaries now written),
the **RELATIONS tab** (crew relationship web, `relations` wire, secret bonds, spec
`perilune-game-ui.relations-spec.md`), and console visibility polish (wire-backed
build ghosts via `designs`, paused-ship nudge, CREW traits, MOSS terminal directory
via `terminals`, Escape exits RELATIONS). **560 dotnet + 188 node** green via
`./ci.sh`; all determinism pins unmoved. **Render WP-0 "a crisp ship stage"** landed
2026-07-22 (reviewed + corrected): trilinear minify + `imageSmoothingEnabled`, a 4px
edge-REPLICATED atlas border (tile-seam luma 12.36 → 1.11, −91%), an integer tile
pitch + rounded origin (`tilePitch`/`transform` in `client/src/render/camera.js`), and
`MAX_TILE_DEVICE_PX = 128` — max zoom is now 1:1 with the source art, never an upscale.
The pawn slide is deliberately NOT snapped (added in tile space before the pitch
multiply); the PAWN SLIDE INVARIANT test drives both real executors to pin that.
Next up: P3 "The Voyage" (PLAN.md).

## Layout
`sim/` (Sim.Core, Sim.Dsl, Sim.Gen, Sim.Glyph, Sim.Llm, Sim.Content — all headless) ·
`hosts/` (web, tui, scenario) · `client/` (the shipping browser face) ·
`tests/Perilune.Tests` · `content/core/` (SimDefs *.def + rules/*.moss +
DeviceLayout.json) · `art/spritegen/` (Gemini image pipeline).

## Invariants — do not break (inherited, test-enforced)
- **Sim core is deterministic & engine-free**: 10 Hz fixed tick, input only via
  `ISimCommand`, RNG only via forked `SimRng`, zero alloc in tick paths. Every saved
  field is hashed — add a field ⇒ save + hash + round-trip test in the SAME commit.
- **Projection is pure**: `GlyphMapper.Project`/`ScreenComposer` never mutate the sim;
  fog gate first; `GlyphColor` + golden formats append-only.
- **Def field ships in ONE commit**: default + parser key + checksum fold + equivalence
  coverage (`content/core/SimDefs/README.def`).
- **Hosts own file IO; sim takes text.** InvariantCulture everywhere (dev machine is
  de-DE — culture bugs are live).
- **LLM never touches sim state directly** — only validated `CitizenEffect`s applied at
  tick boundaries. The game must stay fully playable offline (TemplateBackend).
- **spritegen**: never hand-edit the SPRITEGEN block in `hosts/web/Client.html`; new
  art direction = new spec; work dirs stay out of git except processed/selection.
- **Spine files** (Simulation.cs, SystemStack, save chapters, GlyphColor, WireFormat,
  Commands, CitizenEffect set) change only through the integrator lane — see PLAN.md.

## Work in a worktree — ALWAYS (hard rule)

**Every Claude Code instance works in its own git worktree on its own branch. Never edit
the main checkout directly.** This is not the parallel-lane ritual (PLAN.md) — that governs
*agents within* a session. This governs *every session*, including a solo one, including a
"quick fix", including doc-only work.

```bash
git worktree add ../perilune-wt/<lane> -b lane/<lane>   # start here, before touching anything
cd ../perilune-wt/<lane> && ./ci.sh                     # verify IN-worktree
# merge back with the /merge skill, or the integrator merges --no-ff and re-gates on main
```

- The **only** work that happens on the main checkout is the integrator's merge and the
  per-wave re-pin commits (`ci.sh` + `CLAUDE.md` + `MECHANICS.md` + `HANDOVER.md` + memory).
- **Never `git add -A` / `git commit -a`.** Stage explicit paths. Another instance's
  in-flight files may be sitting in the tree, and committing them is silent corruption.
- If `git status` shows files you did not touch, **stop and look** — you are sharing a tree
  with someone. Do not assume they are yours and do not revert them.

*Why this is a hard rule: on 2026-07-22 two instances worked the same checkout at once. The
economy audit watched six `sim/Sim.Llm/` files flip to `M` mid-measurement — they belonged to
another session's Ollama work. Measurements taken against a tree someone else is editing are
worthless, `git status` stops meaning anything, and one instance can trivially commit
another's half-finished work.*

## Working here
- Tests: `~/.dotnet/dotnet test tests/Perilune.Tests --nologo` (`./ci.sh` runs the full
  gate — dotnet + node, ~4 min wall since V6 runs real sim-days). Counts move with every
  lane and are re-measured per commit; **re-measure before quoting**. The merged tree =
  Wave 0's six packages + `main`'s MOSS terminal / render / Ollama test surface; the current
  gate count and pin live in "Determinism proof" below and in `ci.sh`.
  Golden rewrite only when intended: `UPDATE_GOLDEN=1 ... --filter ...`, say why.
- Determinism proof: `~/.dotnet/dotnet run --project hosts/scenario -- --days 3 --seed 42`
  (with shipped rules: final hash `__REPIN_SCENARIO__` — pinned in ci.sh; adding hashed
  state moves it, update ci.sh + here + memory in the same commit). Tick-3000 golden is
  `__REPIN_TICK3000__`; the slice tick-3000 golden is `__REPIN_SLICE__`. (The three B-bugs
  B-1/B-2/B-3 all move pins off the same base and land together; these three literals plus the
  defs checksum are set to their combined measured values by the integration re-pin commit.)
  All three moved THREE times on 2026-07-22, each time a pure fold change with zero behaviour
  change: economy **W0-1** (un-aliasing the citizen + item hash packs) took
  `26907c23d7e48a5c` / `401c9b96aff338a7` / `b31ba82f50cf395c` →
  `3afc99d90e849aa0` / `d807c509743d1b9d` / `21ad26192d778d95`; economy **W0-1b**
  (folding the **thirteen** saved-but-unhashed fields — crew Name/PrevPos/AutoWander/Path/
  PathIndex/MoveCooldown/IdleCooldown, `ItemStack.Label`, `Device.Name`, the save header's
  `NextEntityId`, `RoomAnchor.Name` and `ScriptEntry.TerminalId`/`.Source`) took those to
  `ffefe9a9a42d8e7e` / `6071adb8fa781440` / `ab47cefd840247c4`; and economy **W0-6**
  (registering four empty economy systems — `ZONE`, `PROD`, `ORES`, `TRAD` — whose seeds fold
  unconditionally) took those to `616ed4a84a9f6e87` / `3cf25daf3ca40e0b` / `72f7023ef9f1cd73`.
  Exactly 2 goldens moved each fold, both the tick-3000 hash files. **B-3** (the CO2
  partial-pressure diffusion term, `AtmosphereSystem.DiffuseAcrossDoors`) then moved all three
  to the current values above — the first move that is a real behaviour change, not a fold: gas
  now crosses open doors, and its new `diffusion_coefficient` def moved the defs checksum
  `08b73814d97c7be3` → `e3a80302b513a7aa`. Still only the two tick-3000 goldens moved.
- Play (two terminals): `~/.dotnet/dotnet run --project hosts/web -- --port 8330 --ship slice`
  + `python3 client/serve.py` → http://localhost:8331 (T talks to selected crew).
  The host's own page (:8323) is the LEGACY skin — no dialogue UI. Terminal skin:
  `... --project hosts/tui -- --play` · agent/CI eyes: `--dump --days 1 --metrics`.
- Live LLM: auto-route is **local-first** — a local Ollama serving `mistral` wins over any
  cloud key (ollama → anthropic → openai → template), so dialogue costs $0 by default; boot
  prints `dialogue backend: ollama/mistral`, or one line saying why it fell back. A plain
  repo-root `.env` (`claude_key` / `openai_key` / `ollama_host` / `ollama_model`) still
  works; explicit `PERILUNE_LLM_DIALOGUE_BACKEND` always wins. Ollama runs as a brew service
  (`curl localhost:11434/api/version` to check). The env-gated smoke (zero CI surface;
  `--backend ollama` is free, the cloud ones spend cents) is
  `... --project hosts/scenario -- llm-smoke --backend all` (results in `docs/SMOKE-P2.md`).
- Sprites: `python3 art/spritegen/run.py --spec <spec.json> --stage all`
  (`GEMINI_API_KEY` env or repo-root `.env`). Slice frame: `node art/screenshot-test/slice-shot.mjs`.
- Commit style: one commit per reviewed work package; substantive changes get a dual
  review before commit.
