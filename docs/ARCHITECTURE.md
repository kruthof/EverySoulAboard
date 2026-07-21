# PERILUNE — Architecture

*2026-07-20. How the game in `VISION.md` is built. `PLAN.md` holds phasing and the
parallel-workstream contracts. Inherited mechanism detail (save format, tick model,
MOSS internals, atmosphere math) lives in `docs/legacy/TDD.md` and remains authoritative
where this document doesn't supersede it.*

## Ground truth (inherited, proven, non-negotiable)

Carried over from the moonbase codebase with its test suite:

1. **Deterministic plain-C# sim core** (`Sim.Core`): 10 Hz fixed tick, cadenced systems
   via one authoritative `SystemStack`, input only via `ISimCommand` inbox, RNG only via
   forked `SimRng`, zero allocations in tick paths, `Simulation.StateHash` over every
   saved field. Twin-run + allocation-cop + save-round-trip tests enforce all of it.
2. **Pure glyph projection** (`Sim.Glyph`): sim → semantic `GlyphBuffer` (glyph char +
   semantic color/attr ids). Projection never mutates the sim (hash tripwire tests).
   Fog gate first. `GlyphColor` append-only. Skins own every pixel.
3. **Hosts own IO; the sim core is file-IO-free.** Parsers take text (`DefsParser`,
   `DeviceLayoutFile`, `RulesLoader`); hosts read files. InvariantCulture in every
   wire/dump/parse path (dev machine is de-DE; culture bugs are live).
4. **Data-driven tuning**: `.def` files (fail-soft parser, checksummed, bit-exact
   default-equivalence proven by test). A def field ships in ONE commit: default value +
   parser key + checksum fold + equivalence coverage.
5. **MOSS** (`Sim.Dsl`): budgeted, deterministic, persisted interpreter. Designer rules
   are content and run before player scripts (player wins ties).
6. **Chaptered append-only saves** (MBSV): versioned chapters, older versions load with
   defaults, newer-than-known throws. This discipline is also the DLC-compatibility
   mechanism.

## Repo layout

```
perilune/
  CLAUDE.md  README.md
  docs/                      VISION / ARCHITECTURE / PLAN + legacy/
  sim/                       .NET solution — ALL game truth, headless
    Sim.Core/                world, systems, entities, saves, effects  (no IO, no UI)
    Sim.Dsl/                 MOSS lexer/parser/interpreter/runtime
    Sim.Gen/                 ship generation: programme→planner→outfitter→dresser,
                             site/derelict generation, generated-history engine
    Sim.Glyph/               pure projection to semantic GlyphBuffer
    Sim.Llm/                 provider-agnostic LLM runtime (see below; refs Sim.Core only)
    Sim.Content/             content-pack discovery/manifest/load-order (text in, POCOs out)
  hosts/
    web/                     PeriluneWeb — WebSocket/HTTP host, session, wire format
    tui/                     PeriluneTui — ANSI terminal skin + --dump text frames (agent/CI eyes)
    scenario/                ScenarioRunner — headless years-per-minute + determinism proof
  client/                    the shipping face: browser client (canvas → WebGL as it grows)
  tests/                     Perilune.Tests — the whole suite incl. golden frames/wire
  content/
    core/                    base content pack: SimDefs/ (*.def + rules/*.moss),
                             DeviceLayout.json; grows a pack.toml manifest with Sim.Content
    campaign-recapture/      Act I authored content (ship layout, personas, arcs)
  art/
    spritegen/               spec-driven Gemini image pipeline (generate→select→process→integrate→shot)
    specs live with their consuming pack; work dirs under art/spritegen/work/ (gitignored candidates)
```

Dependency rule (enforced by project references):
`Sim.Core ← {Sim.Dsl, Sim.Gen, Sim.Glyph, Sim.Llm, Sim.Content} ← hosts`.
Nothing under `sim/` references a host or the client. `Sim.Llm` sees only `Sim.Core`
(the effect spine). The client speaks only the wire protocol.

## The projection stack (presentation)

```
Simulation (truth, 10 Hz, deterministic)
   │ GlyphMapper.Project — pure, fog-gated, zero-alloc
   ▼
GlyphBuffer: W×H (glyph, semantic fg/bg, attr) + side-channels (crew variants, selection)
   ├─► hosts/tui    ANSI skin + text dumps        (dev/CI/agent eyes — never cut)
   └─► hosts/web ──► client/                      (the game people buy)
```

The wire carries **semantic ids only** — the client owns every pixel, so art direction
changes (or a DLC restyle) never touch the sim or the wire. The client grows from the
proven vanilla-canvas skin *past* RimWorld fidelity in stages (the concrete bar lives
in VISION.md "Art ambition"): layered WebGL sprite renderer (floor/wall/furniture/
pawn/overlay layers, per-tile facing/variants), a sim-driven dynamic lighting pass
(power states, emissives, breach effects), animation states, HTML/CSS
for all UI chrome (inspector panels, dialogue window, terminal IDE, chronicle reader —
a huge velocity advantage over engine-native UI), packaged with Tauri for desktop at
beta. Wire format may gain a binary frame encoding when profiling demands it; the
JSON schema stays the reference implementation and CI golden.

## The LLM runtime (`Sim.Llm`)

Design authority: `legacy/LLM_CITIZENS.md` (effect spine, memory, prompts, validation,
async queue). This section supersedes its single-vendor assumptions:

- **Provider abstraction, one interface**: `IChatBackend` with capability flags
  (streaming, native tool-calls, strict schemas, JSON mode). Adapters:
  - `AnthropicBackend` (Messages API, prompt caching, strict tools)
  - `OpenAiCompatBackend` — one adapter covering OpenAI itself **and** every
    OpenAI-compatible server (OpenRouter, LM Studio, vLLM, llama.cpp-server, Groq…):
    base-URL + key + model id are just settings.
  - `GeminiBackend` (native, since the art pipeline already carries Google credentials)
  - `OllamaBackend` (local; tools where the model supports them, JSON-envelope fallback)
  - `TemplateBackend` (offline, feature-complete, ships first, is also the test harness
    and the runtime degradation target)
- **Model routing by role, not vendor**: dialogue / narration / bulk (summaries,
  compaction, enrichment) are separate routes, each independently assignable to any
  configured backend+model. Local-bulk + API-dialogue is an expected configuration.
- **The contract that keeps it safe** is provider-independent and lives sim-side:
  capability manifests computed by the sim, enum-bounded tool schemas, `EffectValidator`
  re-validation + clamps at tick boundaries, player text quarantined as in-fiction
  speech. A fully jailbroken model can talk weird; it cannot mint resources. Backends
  that lack strict tools degrade to the JSON envelope — the validator path is identical.
- **Narrative producers are consumers of the same runtime**: Chronicle rendering,
  eulogies, derelict-history prose, persona enrichment are P2 background jobs in the
  same priority queue (P0 live dialogue, P1 conversation summaries, P2 everything
  else), batched where latency is irrelevant.
## The space layer (nav & sensors)

The voyage (VISION.md) adds two ordinary sim systems — deterministic, hashed, def-tuned
like every other:

- **NavSystem**: a coarse 2D system chart (no orbital mechanics beyond deterministic
  Keplerian-ish drift — the honest simplification, flagged in-fiction). The ship has
  delta-v (fuel), burns are commands, transits take sim time. The hull interior sim is
  unchanged; the chart is a second, much smaller world the same `Simulation` ticks.
- **SensorSystem**: contacts enter the game only via powered sensor devices
  (antenna, telescope, thermal imager — real `Device`s on the power grid with real
  waste heat). Detection = deterministic signal-to-noise vs. range/emission check.
  Detections are *knowledge artifacts* (sensor logs + crew memory), not global map
  state — feeding the knowledge layer and conversation ("Vasquez saw something on the
  night watch").
- **Bridge console**: a client-side terminal skin over `nav.*`/`sensors.*` — the same
  read-only namespace pattern as `ship.*`, so MOSS scripts can automate sky surveys
  and alarm on new contacts. Discovery → rendezvous → away mission is the content loop.

- **The Director is a sim system, not an LLM.** It computes the tension curve from sim
  state and actuates only through sim-legal levers (exogenous-actor scheduling windows).
  Its *outputs* may be narrated by the LLM; its *decisions* are deterministic and
  hashed like any system state.

## The content-pack system (`Sim.Content`) — the DLC/mod substrate

- A pack is a directory with a `pack.toml` manifest (id, version, dependencies,
  load-order hints) plus channels the engine already speaks or will speak:
  `defs/*.def`, `rules/*.moss`, `layout/*.json`, `sites/*.def` (site archetypes),
  `personas/*.def` (trait/value/fear/secret/name pools), `arcs/*.def` (narrative arc
  definitions), `sprites/` (spec + integrated set), `text/` (templates, log fragments).
- **Load model**: deterministic order (dependencies, then explicit order, then id);
  later packs override by key where the channel allows it, defs merge fail-soft with
  warnings. The resolved pack list + per-pack content checksums fold into the sim's
  `defs:` checksum so determinism and golden tests see content identity.
- **Save compatibility**: saves record the active pack manifest. Loading with a pack
  missing → the same fail-soft degradation as a deleted def line (warn, defaults,
  never brick); loading with a new pack added → additive chapters/defs appear.
  This is exactly RimWorld's "expansions layer onto saves" behavior.
- `Sim.Content` does discovery/parsing/merging as pure text→POCO functions; hosts hand
  it directories. Sim.Core stays IO-free and pack-ignorant.

## Testing & CI strategy (unchanged philosophy, wider scope)

- `dotnet test tests/Perilune.Tests` is the gate for everything sim-side: twin-run
  determinism, allocation cop, save round-trips, defs equivalence, projection purity,
  golden frames/screens/wire, ship-survival canaries, MOSS battery.
- Every workstream in `PLAN.md` lands with its own test surface; golden files and
  append-only enums are the cross-team contract enforcement.
- LLM code tests against `TemplateBackend` + fake HTTP handlers; no test ever needs
  a network. ScenarioRunner remains the determinism proof and the perf harness.
- Client: golden-frame render tests (headless canvas snapshot vs committed PNGs) +
  Playwright smoke driving the real host.

## Platform & packaging

macOS-first development (`~/.dotnet/dotnet`, no Unity anywhere). Dev loop: run
`hosts/web`, open browser. Ship shape: Tauri-packaged client + bundled .NET host
(single process, localhost loopback, same wire). Windows verified from beta.
The TUI host is kept green forever — it is how agents and CI *see* the game.
