# PERILUNE — Requirements & Milestone Acceptance Criteria

*Consolidated from [GDD.md](GDD.md), [TDD.md](TDD.md), [LLM_CITIZENS.md](LLM_CITIZENS.md), [MOSS_SPEC.md](MOSS_SPEC.md).*

## 1. Product requirements (functional)

**FR1 — World & simulation**
- FR1.1 Tile/grid world, 1 m tiles, 2.5 m z-levels (z = deck); authored ship deck plan ~160×40×6 decks with an inviolable hull boundary; clearing debris/sealed sections (legacy `rock` tiles) converts them to (vacuum) rooms.
- FR1.2 Deterministic fixed-tick simulation (10 Hz) with pause/1×/3×/10× speed; identical seeds + command log ⇒ identical state hashes.
- FR1.3 Per-room lumped atmosphere (pressure, O2, CO2, temperature) with door/breach flows; citizens breathe; hypoxia/hypercapnia harm using GDD §5 thresholds.
- FR1.4 Power networks with priority-tier brownouts; light fixtures reflect power state (powered/brownout/emergency/off).
- FR1.5 Water and food chains: tank→drink/hydroponics→recycler loop; grow→harvest→eat with kcal accounting.
- FR1.6 Jobs: designations/bills → job board → citizen allocation via per-citizen priority table; reservations; interruptible job state machines.
- FR1.7 Citizens: needs (air, food, water, sleep, safety in v0), mood scalar with reason list, skills 0–10, pairwise opinions.
- FR1.8 Raids: Appraisal-driven escalation, telegraphed by Assessor recon; v0 Recovery Team burglar behavior; doors/turrets/guards as defense.
- FR1.9 Exploration: fog + last-known-state; authored salvage, logs, and findable survivors.
- FR1.10 Save/load: full state round-trip, hash-equal; rotating autosaves without frame hitches; forward migrations guaranteed from M3.

**FR2 — MOSS automation**
- FR2.1 v0 language per [MOSS_SPEC.md](MOSS_SPEC.md): `every`/`when`/`alarm when`/`if`/commands, unit literals, edge triggering.
- FR2.2 In-game terminal: editor with syntax highlight + inline diagnostics, device browser with live values, audit log, RUN/STOP.
- FR2.3 Sandboxed execution: per-script and global step budgets; overruns alarm in-game, never hang the sim.
- FR2.4 Scriptability gated by installed controller modules (crafted/salvaged resource).
- FR2.5 Script source persists in saves and contributes to the determinism hash.

**FR3 — LLM citizens**
- FR3.1 Any citizen can be talked to in free text; replies stream in character.
- FR3.2 Conversations affect the game only through the `CitizenEffect` whitelist, validated sim-side and applied at tick boundaries; no free-form state mutation exists.
- FR3.3 Backend chain Anthropic → Ollama → Template behind one interface; the game is fully playable offline (template backend feature-complete).
- FR3.4 Personas + memories are sim state, generated deterministically from templates (LLM enrichment optional, async), stored in saves.
- FR3.5 Settings: API key entry with test, Ollama auto-detect, privacy note, cost meter + per-session soft cap with auto-degradation (v1).
- FR3.6 Failures degrade gracefully mid-turn (template completion + status chip); never block the sim or lose state.

**FR4 — Presentation & UX**
- FR4.1 3D isometric view (low-FOV perspective, 90° orbit snaps) over grid sim; z-slice navigation with dollhouse cutaway; levels below dimmed.
- FR4.2 Dark-Descent lighting mood: darkness default, lights are powered devices, three-light room grammar, ACES post stack.
- FR4.3 Overlay lenses: Atmosphere, Power, Thermal, Jobs, Security, Script.
- FR4.4 Build/designate/zone UI (RimWorld model); room naming feeds MOSS namespaces.
- FR4.5 Inspection panels (room gauges in real units; citizen needs/mood-reasons/relationships/Talk).
- FR4.6 Three-severity alert stack with deep links; MOSS `alarm()` feeds the same stack; Critical auto-pauses.
- FR4.7 Sim-state-driven audio (room tone by power state, ΔkPa-scaled door hiss, mixer snapshots explore/alert/raid/vacuum); music only as event grammar.

## 2. Non-functional requirements

- NFR1 60 fps target with 50–200 citizens on Apple Silicon; sim tick ≤ 3 ms @1×; render ≤ 6 ms.
- NFR2 Zero per-tick GC allocations in sim hot paths (enforced by test).
- NFR3 Determinism per platform: twin runs from same seed+commands stay hash-identical (enforced by test from M0).
- NFR4 All sim/DSL/LLM logic testable headless (EditMode / `dotnet test`) without a Unity player.
- NFR5 Art/audio decoupled via ScriptableObject catalogs; missing assets degrade to placeholders, never errors.
- NFR6 LLM cost ≤ ~$0.50/hour default (soft cap), ~$0 offline; API keys stored in OS keychain, never in saves/logs; player-visible privacy note.
- NFR7 macOS first; Windows build verified from M5.
- NFR8 Difficulty settings never alter physics constants (GDD honesty contract).

## 3. Milestone acceptance criteria

| Milestone | Exit criteria (all demonstrable) |
|---|---|
| **M0 Spine** | Headless sim ticks 10,000× with zero post-warmup allocation and stable `StateHash`; twin-run determinism test green; batch-mode CLI test run works. |
| **M1 First slice** | Greybox grid world renders (instanced chunks); camera pan/zoom/orbit + z-slice cutaway; tile picking; one citizen A*-paths incl. one ladder; a door opened to vacuum drains a room's pressure on the debug panel; a MOSS script toggles a door on schedule via the terminal UI. |
| **M2 Breadth 1** | Dig designation mined by a citizen; hauled item reaches a stockpile; powered light goes amber in brownout; citizen dies in vacuum (needs pipeline); save→load→hash-equal; autosave without hitch. |
| **M3 Breadth 2** | Potato grown, harvested, eaten with kcal accounting; item crafted from a bill; water loop runs; all 10 v0 device types scriptable; `when`/`alarm when` + audit log work; alert stack live; authored base start with fog, logs, 2 findable survivors. Save-migration guarantee begins. |
| **M4 Threats+LLM** | Appraisal-telegraphed raid: Recovery Team breaches, loots, leaves; doors/turret defense works. Talking to a survivor (offline template AND Anthropic backend): citizen agrees to a job and reveals a real cache location; effects visible in sim; failure mid-turn degrades gracefully. |
| **M5 Depth** | Opinions + rationing active; Ollama fallback works; real art kit + audio swapped in via catalogs (no code change); three-light grammar + mixer snapshots in; Windows build boots; hour-0–8 arc playable start to first raid. |

## 4. Out of scope (deliberately, for now)

- Multiplayer, modding API, console/mobile platforms, localization (until content stabilizes).
- Cellular gas/fluid simulation, cross-platform replay determinism, baked GI.
- Planetary/lunar surface play and terrain digging — removed by the 2026-07-18 shipboard setting pivot; the hull is a hard boundary.
- Post-M5 content (factions/trial, threat archetypes beyond the v0 boundary sortie, dynamic occupation-zone control, EVA, births, endgame branches) — designed in GDD, scheduled later.

## 5. External prerequisites (owner: Garvin)

- Anthropic API key (needed at M4 for live-backend testing).
- Optional Ollama install with `qwen3:8b` (M5).
- Asset Store purchases per `ASSET_SUGGESTIONS.md` (M5; ~$272 list, less on sale).
- A non-programmer playtester for MOSS onboarding (M3+).
