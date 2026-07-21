# HANDOVER — PERILUNE (2026-07-21, P2 complete, tag suggestion `v2-talking-ship`)

For the next session. Read `CLAUDE.md` first, then this top to bottom. Design intent
lives in `VISION.md`, mechanism in `ARCHITECTURE.md`, phasing/lanes in `PLAN.md`;
moonbase-era mechanism detail (save format, tick model, MOSS, atmosphere math) is
still authoritative in `legacy/TDD.md` + `legacy/TUI.md` where not superseded.

## Where the project stands

- **P0 done** (`v0-baseline`): migration from `../moonbase`, rename, build hygiene, `ci.sh`.
- **P1 done** (`v1-foundations`): the six foundation lanes composed (social, nav,
  offline LLM runtime, content packs, shipgen gates, structured client).
- **P2 done** — "The Talking Ship" vertical slice. The **automated** exit bar is met:
  a live conversation runtime with three real providers, a talking web host, persisted
  crew minds, chronicle + eulogy from real memories, a registered Director, build/refit,
  an 8-crew authored slice, a near-parity WebGL2 client with dialogue/lighting/MOSS UI,
  and the phase-exit proof (`P2ExitTests`) that ties it all together. Suite:
  **524 dotnet tests + 115 node render tests**, all green via `./ci.sh` (exit 0).
  The two **human** exit bars remain open on Garvin (see the end): the 60-minute
  unscripted playtest and the blind screenshot A/B. Tag `v2-talking-ship` when they land.

Every P2 work package went through the per-package **independent Opus gate** (below);
`(Opus-gated PASS)` in `git log v1-foundations..HEAD` marks each one.

## What exists and works (each with its own test surface)

1. **Async LLM runtime** (`sim/Sim.Llm`) — `IAsyncEnumerable<ChatDelta> SendAsync`;
   `PrepareTurn` (pure snapshot) / `CompleteTurn` (manifest-gated dispatch) split;
   `SyncChatBackend` keeps TemplateBackend byte-identical to the old path. `PromptBuilder`
   is pure and provider-neutral: frozen strict-tool schema, cache-annotated stable blocks,
   prefix-stable renders, player-speech quarantine (injection corpus gate-proven).
2. **Three live adapters** behind `IChatBackend` — `AnthropicBackend` (SSE streaming,
   `cache_control` breakpoints, strict `propose_effect` tool), `OpenAiCompatBackend` and
   `OllamaBackend` (JSON-envelope parser; deltas buffered to one `TextDelta` by contract,
   because the effect envelope tails the reply). Injectable HTTP handlers ⇒ **zero network
   in tests**. Gemini has a settings slot but still routes Template.
3. **Dispatcher / cost / settings** (`LlmDispatcher`, `CostMeter`, `LlmSettings`) —
   breaker→Template degrade chain terminated so a turn can never fail; observed-`TurnComplete`
   hardening (not `!errored`); decimal `CostMeter` with a defined shed order; settings
   precedence env > `.env` > toml with key redaction. Well-known `.env` aliases
   (`claude_key` / `openai_key` / `geminie_key` / `ollama_host`) map to canonical slots,
   and the web host **auto-routes dialogue** to a live backend when a bare key is present
   (Anthropic haiku default > OpenAI; explicit config wins; Ollama/Gemini never auto-selected;
   narration/bulk paths untouched). A plain repo-root `.env` now "just works".
4. **ConversationHub — the talking host** (`hosts/web`, spine commit `ee82e3b`) — the web
   host holds a real end-to-end conversation over the socket. Thread affinity is enforced
   by two debug tripwires: `PrepareTurn` runs on the sim thread between ticks; the immutable
   `TurnPlan` is the only thing crossing to the background dialogue task; accepted effects
   go through a `PendingEffectBuffer` drained at the next tick (LLM never touches sim state
   directly). Session flow `talk`/`say`/`bye`, seq-numbered deltas + authoritative lines,
   say-in-flight queuing, `llmstatus` (~1 Hz: backend/degraded/costPerHour/queue depths) and
   `chron` chronicle wire. Personas are generated at boot on a forked RNG (no StateHash move).
5. **MEMS persistence** (`N3`) — `MemorySystem : IStatefulSystem` persists minds / personas /
   secrets / facts through the existing `SYSS` walk under FourCC `'MEMS'`; structural checksum
   folds; scenario pin honestly unmoved (stack-asymmetry gate-verified). Mind state itself
   stays **unhashed** (flood-vs-twin hash equality proven) — persistence, not determinism input.
6. **Chronicle + Eulogy** (`N4`/`N5`) — pure per-day `Chronicle` renderer over
   `HistorySystem` (severity ladder + `ProseOverride` slot). Eulogies are spoken by the dead
   crew member's closest friend, quoting **verbatim** shared memories; anti-hallucination and
   decoy-exclusion gate-proven, and name matching is **Ordinal whole-word** (Ada never claims
   Adam/radar memories). `HistoryEntry` gained `Kind`/`SubjectA`/`SubjectB` (append-only,
   StateVersion 2 with v1 fallback).
7. **Director v0, registered** (`N6` + spine `200fe97`) — `DirectorSystem` ('DRCT') computes a
   tension curve and drives exactly one sim-legal lever, `MachineWear` `WearPressure`
   (ctor + one multiply, x1 identity gate-proven over 10k ticks). Registration fallout: the
   default `max_wear_pressure` was **gentled 2 → 1.35** (def-field ritual both sides) because
   the sharper cap killed a marginal generated ship inside V6's one-day horizon; the M2 stress
   path still cranks wear via an in-test override.
8. **Build / refit v0** (`M1` + spine `af1e98d`) — `BuildSystem` ('BULD') with `DesignateBuildCommand`
   (Designate/Cancel on the ordinary inbox): designate → haul materials → construct/deconstruct
   **walls and doors**, with material conservation, reflood honesty on independent geometry, and
   job-board bit-purity when the system is absent all gate-proven.
9. **Relationship types** (`S1`) — `RelationType` enum (None / Friend / CloseFriend / Rival / Enemy),
   a hysteresis classifier, and deterministic argument/bond rolls off a contained forked stream;
   `SOCL` v2. Memory writes for argument/bond/relationship/promise + a conversation summary (`N2`).
10. **The authored slice** (`AuthoredShips.PeriluneSlice()` + `PopulateSlice`, `SliceSeed = 20260721`)
    — the P2 ship: **8 authored crew** (Amara Okonkwo, Priya Raghavan, Dmitri Volkov, Salif Camara,
    Nadia Hassan, Tomas Ferreira, Grace Oyelaran, Wei Chen) with minds, secrets backed by facts,
    seeded relationships, and a matter budget balanced for 3-day unattended survival + a
    wear-stress brownout. Selected everywhere with **`--ship slice`** (never seen by CI, which
    runs the 2-crew reference); slice goldens are separate (`slice_boot_deck*`, `slice_personas.json`,
    `slice_tick3000_hash.txt`).
11. **Client — the shipping face** (`client/`) — WebGL2 executor behind `?exec=webgl2`
    reaches **~99% parity** with the Canvas2D reference (98.56% @ zoom36, 99.64% @ zoom90,
    tol 40/255, bar 90%), with a silent Canvas2D fallback on context loss. Sim-driven
    **lighting** composited fog-gated-by-construction into both executors; **dialogue UI**
    wired to the canonical chat contract (line-authoritative reducer, portrait resolver with
    silhouette fallback, `llmstatus` chip); **MOSS terminal IDE** over the moss wire
    (editor + diagnostics + audit log, full-matrix state machine); **motion/animation** runtime
    (walk frames, device on/off/broken states) with `compose` still time-free. Typing in
    chat/terminal no longer fires game shortcuts (guard-first `isTextEntryTarget`; Escape stays
    live). Portraits: an **append-only 16-entry manifest** (`pk_<fnv1a32>` keys, silhouette
    fallback) — A2's 8 persona-conditioned busts + A3's 8 authored-slice-crew busts.
12. **Screenshot rig + advisory metrics** (`art/screenshot-test/`, `X1`) — a deterministic
    slice frame (`node art/screenshot-test/slice-shot.mjs`; cold-run byte-identical
    reproduction gate-proven) plus three **advisory** gates that can never fail CI:
    sprite coverage **86.9%** (bar ≥60%), lighting dynamic range **2.80×** (bar ≥2.5×),
    style-lock hue-distance **0.0000** vs `accepted.png` (bar ≤0.20). `ci.sh` scores the
    committed frame Chrome-free. The blind 3-viewer A/B ritual is documented in
    `art/screenshot-test/PROTOCOL.md`. See it for the lighting recipe (why deck 1, why there
    is deliberately **no** brownout command — the slice is one ship-wide power network).
13. **`llm-smoke`** (`hosts/scenario -- llm-smoke --backend all`, `docs/SMOKE-P2.md`) — the
    env-gated live-provider verb, **never referenced by `ci.sh` or the suite**. First live run
    on record: Anthropic `claude-haiku-4-5` streamed 6–8 text deltas/turn (~$0.65/hr
    extrapolated), OpenAI `gpt-4o-mini` single-shot by design (~$0.12/hr), Ollama SKIPPED
    (no local server). Total spend **$0.0045**; keys scrubbed (gate 401-probed).
14. **`P2ExitTests`** (`006504d`) — seven proofs on one `PeriluneSlice` arc:
    conversation→memory/reveal, MEMS save/load, natural bond formation, breach-physics
    death → verbatim eulogy headlining the chronicle, Director alive, full-arc twin
    determinism, and offline cost **$0**. Mutation-probed (it catches neutered
    eulogy/MEMS/Director) and it reproduces the documented pre-existing save-reload thermal
    ULP drift on base. 88 ms. This is the P2 contract — keep it green.

## Running / testing the game

```bash
./ci.sh                                     # the full gate — run before/after anything (exit 0)
~/.dotnet/dotnet run --project hosts/web    # PLAY: http://localhost:8323 (proven skin)
~/.dotnet/dotnet run --project hosts/web -- --ship slice          # the P2 8-crew slice
# Structured client (WebGL2 executor via ?exec=webgl2, UI/lighting/dialogue/MOSS):
~/.dotnet/dotnet run --project hosts/web -- --port 8330   # terminal 1
python3 client/serve.py                                   # terminal 2 → http://localhost:8331
~/.dotnet/dotnet run --project hosts/tui -- --play               # terminal skin
~/.dotnet/dotnet run --project hosts/tui -- --dump --days 1 --metrics   # agent/CI eyes
~/.dotnet/dotnet run --project hosts/tui -- --dump --ship slice  # dump the slice
~/.dotnet/dotnet run --project hosts/scenario -- gen --seed 7 --validate # gates demo
# Live LLM (spends cents, env-gated, zero CI surface — .env at repo root):
~/.dotnet/dotnet run --project hosts/scenario -- llm-smoke --backend all
node art/screenshot-test/slice-shot.mjs     # the repeatable slice frame (headless Chrome)
```

## The rituals (cost time to learn — don't relearn)

- **Independent-Opus per-package gate (how P2 was built):** every work package is verified
  by a *separate* Opus reviewer that never saw it implemented — **blind spec** (does the diff
  match the contract) → **CI battery** (the full `./ci.sh` in-worktree) → **adversarial pass**
  (mutation probes, culture probes, injection corpus, hash-honesty checks) → a written
  **PASS/FAIL**. Merge only on PASS; a re-gate follows any fixup (see `1c773b4`). The
  `(Opus-gated PASS xN)` tally in each merge subject is this gate's receipt. It caught real
  defects live (CostMeter race, hung-backend timeout, the eulogy whole-word LOW finding,
  the V6-killing wear cap). Do not skip it — the gate is why 40 commits landed clean.
- **Hash-move ritual:** adding ANY hashed state (new `IStatefulSystem`, saved field)
  intentionally moves the reference hash. In the SAME commit: regenerate the tick-3000 golden
  (`UPDATE_GOLDEN=1 ... --filter Tick3000`) **and** the slice golden if the slice moved, update
  the pinned hash in `ci.sh` + `CLAUDE.md` + auto-memory, and say why. P2 moved it three times
  (S1 relationship events, BuildSystem 'BULD' fold, Director 'DRCT' fold + gentled def); N1/N3
  were verified honestly **un**moved. Current scenario pin `26907c23d7e48a5c`; current tick-3000
  golden `401c9b96aff338a7`; current slice tick-3000 golden `d1710ab6a1fe50ce`.
- **Def-field ritual:** one commit = `CreateDefault` value + parser key + checksum fold (append
  before the rules fold) + shipped `.def` verbatim + a consumption-tripwire test.
  `social.def` / `build.def` / `director.def` are clean examples (S1 did it x15).
- **Parallel worktree lanes:** spawn agents into their own git worktrees
  (`git worktree add ../perilune-wt/<lane> -b lane/<lane>`), exclusive write paths per
  `PLAN.md`, no spine edits, verify with `./ci.sh` in-worktree, integrator merges `--no-ff`
  + re-gates on main. Spine changes (Simulation, SystemStack, save chapters, GlyphColor,
  WireFormat, Commands, CitizenEffect, top-level def registry) travel as a **contract request**
  in the PR description and land in a dedicated serialized spine lane, small and append-only
  (one enum row, one chapter registration, one stack insertion). P2 ran ~10 lanes + spine waves
  this way with zero cross-lane corruption.
- **New test files** under `tests/Perilune.Tests/` auto-compile (SDK default items); new `sim/`
  source DIRECTORIES need a csproj glob (tests csproj is integrator-owned).
- Suite quirk: V6 survivability gate tests run real sim-days — the dotnet suite is ~3 min wall.
  Node 24 needs the glob form: `node --test "client/test/*.test.js"`.
- de-DE machine: test output prints `Bestanden!`/`Fehler`; culture bugs are live —
  InvariantCulture in every wire/dump/parse path, analyzers CA1305/CA1310 warn.

## Next: P3 — The Voyage (PLAN.md has the full list)

Nav/sensors full loop (survey → contact → burn → rendezvous); derelict generation
(ShipGen archetype + generated-history engine + away-mission dual-sim); campaign Act I
(recapture) playable start → first sortie survived; content-pack packaging with a DLC
dry-run pack that installs into an existing save and uninstalls without bricking it.
The obvious P3 groundwork already flagged below: hosts finally consume `Sim.Content`.

## Known issues / backlog (not regressions)

- **Prompt prefix below the cacheable minimum.** `PromptBuilder` sets two `cache_control`
  breakpoints, but the slice's assembled prefix is only ~970 input tokens on Haiku and the
  haiku-class minimum cacheable prefix is **2048 tokens**, so caching silently never engages
  (`cache_read` flat at 0 across all turns, confirmed live). Not an adapter bug — a
  content/prompt-size matter. Fix is more persona/context/memory in the prefix. (`SMOKE-P2.md` §1.)
- **Effect elicitation is unsolved.** Live models discuss authored secrets **in prose** but do
  not emit a `RevealInfo` / `propose_effect` tool call (both Anthropic and OpenAI, this run).
  The wire/persona/secret data reaches the model correctly; the models just don't structure the
  reveal. This is prompt work owed **before** the playtest. (`SMOKE-P2.md` §findings.)
- **Save-reload thermal ULP drift** — pre-existing, documented and reproduced by `P2ExitTests`
  on base (last-bit float drift across a save/reload of the thermal field). Not a P2 regression.
- **ConversationHub has no backoff/cooldown** — it re-probes the primary backend every turn
  through its bespoke pump (it can't use `LlmDispatcher` because the dispatcher re-runs
  `PrepareTurn` off the sim thread). Give it `LlmDispatcher` parity — snapshot-kept-on-sim-thread
  dispatch with breaker cooldown — someday.
- **MOSS dry-run still unbuilt** — the wire/schema reserves the `dryrun` op (W3), no evaluator
  behind it yet. Cut from P2 scope (see `PLAN.md` WS-MOSS).
- **`RoomState.cs:258` CA2014** stackalloc-in-loop (real hazard) still open; plus
  `PeriluneGoldenTests.cs:65` CA1305 and `InspectorModelTests.cs:80` CA1310 culture warnings.
- **Hosts still don't consume `Sim.Content`** — deliberate; the switch is the P3 campaign pack.
- `sweep --count 100` is ~20 min wall (V6 real sim-days) — fine ad hoc, not for CI.

## Open on Garvin (the human exit bars + setup)

- **The blind screenshot A/B.** Drop a genuine RimWorld interior at
  `art/screenshot-test/reference-rimworld.png`, rebuild `sheet.py`, and run the 3-viewer blind
  verdict (`PROTOCOL.md` §3): the slice frame must win ≥2 of 3 and no viewer calls it "the cheap
  one". A loss halts WS-ART/WS-CLIENT feature work — it is the art bar, not a CI test.
- **The 60-minute unscripted playtest** — the human P2 exit bar: a tester plays the slice for an
  hour and **names a crew member** when retelling it. (Do the prompt/elicitation work above first
  so a reveal can actually land.)
- **Ollama** — install it locally only if you want to exercise the third live provider path
  (`ollama_host` in `.env`); the smoke SKIPs it cleanly when the server is absent.
