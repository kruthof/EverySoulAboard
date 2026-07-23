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

## Status snapshot (2026-07-22)
**Read `docs/HANDOVER.md` "Playtest round 4" then "round 3"** — newest state, and the
open items are listed at the end of round 4. Rounds 3–4: **`docs/MECHANICS.md`** is now
the authority on how the sim actually behaves (its §13 lists what is *wired but not
connected*), the slice has a working build/dig economy, crew work is legible on the map,
crew no longer promise physical work they cannot do, the ship stage was relit + de-blurred
+ lit with real pools and grounding shadows, and pawns now face where they walk and no
longer blink. **`docs/design/perilune-art-direction.md`** is the art authority — the
sprite regen is DECIDED-NOT-NOW (design first, regenerate last); nothing generated, no
credits spent.
**680 dotnet + 356 node** green; `26907c23d7e48a5c` unmoved; slice golden is now
`b31ba82f50cf395c`. Known-honest limits: the dig is a **boot-window** economy (crew idle
again after ~4 sim-min of digging), the stage is still far flatter than Prison Architect,
and the CO2 problem is a **gas-transport bug** (no diffusion term), not a dispatch gap.

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
- Tests: `~/.dotnet/dotnet test tests/Perilune.Tests --nologo` (631 green; `./ci.sh`
  runs the full gate — 631 dotnet + 237 node, ~3 min wall since V6 runs real sim-days).
  (Counts MEASURED 2026-07-22 after all six lanes merged, not carried forward: figures
  quoted mid-session drifted behind the lanes still in flight. Re-measure before quoting.)
  Golden rewrite only when intended: `UPDATE_GOLDEN=1 ... --filter ...`, say why.
- Determinism proof: `~/.dotnet/dotnet run --project hosts/scenario -- --days 3 --seed 42`
  (with shipped rules: final hash `26907c23d7e48a5c` — pinned in ci.sh; adding hashed
  state moves it, update ci.sh + here + memory in the same commit). Tick-3000 golden is
  `401c9b96aff338a7`; the slice tick-3000 golden is `b31ba82f50cf395c`
  (moved 2026-07-21 by the slice work-economy lane — the slice now boots with a
  designated aft dig; the 2-crew pins are untouched).
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
