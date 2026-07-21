# PERILUNE — project guide for Claude

A RimWorld-depth colony sim aboard a drifting ship where every crew member is a person
you can talk to. Deterministic UnityEngine-free C# sim, semantic glyph projection,
web/TUI skins, MOSS automation DSL, LLM-driven crew (multi-provider, offline-capable),
AI sprite pipeline. Clean-room successor to `../moonbase` (Unity is gone entirely).

## Read first
- **`docs/VISION.md`** — what we're building and why it isn't RimWorld.
- **`docs/ARCHITECTURE.md`** — module map, invariants, LLM runtime, content packs.
- **`docs/PLAN.md`** — phases, the 10 parallel workstreams, conflict rules. Find your
  lane here before touching code.
- `docs/legacy/` — the moonbase-era design docs (GDD, TDD, LLM_CITIZENS, MOSS_SPEC,
  SIMULATION_ARCHITECTURE, TUI, HANDOVER). Mechanism detail there is still
  authoritative where the new docs don't supersede it.

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
- Tests: `~/.dotnet/dotnet test tests/Perilune.Tests --nologo` (baseline 182 green).
  Golden rewrite only when intended: `UPDATE_GOLDEN=1 ... --filter ...`, say why.
- Determinism proof: `~/.dotnet/dotnet run --project hosts/scenario -- --days 3 --seed 42`
  (with shipped rules: final hash `802d053d7f867e89`).
- Play: `~/.dotnet/dotnet run --project hosts/web` → http://localhost:8323 ·
  terminal: `... --project hosts/tui -- --play` · agent/CI eyes: `--dump --days 1 --metrics`.
- Sprites: `python3 art/spritegen/run.py --spec <spec.json> --stage all`
  (`GEMINI_API_KEY` env or repo-root `.env`).
- Commit style: one commit per reviewed work package; substantive changes get a dual
  review before commit.
