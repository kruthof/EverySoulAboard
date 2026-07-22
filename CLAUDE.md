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
- **`docs/PLAN.md`** — phases, the 10 parallel workstreams, conflict rules. Find your
  lane here before touching code.
- `docs/legacy/` — the moonbase-era design docs (GDD, TDD, LLM_CITIZENS, MOSS_SPEC,
  SIMULATION_ARCHITECTURE, TUI, HANDOVER). Mechanism detail there is still
  authoritative where the new docs don't supersede it.

## Status snapshot (2026-07-21)
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
`./ci.sh`; all determinism pins unmoved. Next up: P3 "The Voyage" (PLAN.md).

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

## Working here
- Tests: `~/.dotnet/dotnet test tests/Perilune.Tests --nologo` (570 green; `./ci.sh`
  runs the full gate — 570 dotnet + 188 node, ~3 min wall since V6 runs real sim-days).
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
- Live LLM: a plain repo-root `.env` (`claude_key` / `openai_key`) auto-routes web-host
  dialogue to a live backend; the env-gated smoke (zero CI surface, spends cents) is
  `... --project hosts/scenario -- llm-smoke --backend all` (results in `docs/SMOKE-P2.md`).
- Sprites: `python3 art/spritegen/run.py --spec <spec.json> --stage all`
  (`GEMINI_API_KEY` env or repo-root `.env`). Slice frame: `node art/screenshot-test/slice-shot.mjs`.
- Commit style: one commit per reviewed work package; substantive changes get a dual
  review before commit.
