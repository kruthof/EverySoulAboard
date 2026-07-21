# HANDOVER — PERILUNE (2026-07-21, P2 complete + playtest-feedback round, tag `v2-talking-ship`)

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
  unscripted playtest and the blind screenshot A/B. The tag marks the automated milestone (v0/v1 convention); the playtest + A/B verdicts append here when they land.

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

## Playtest-feedback round (2026-07-21, after the tag) — what landed

Garvin played the slice and filed six findings. Five are FIXED on main; the sixth (the
full UI redesign) is deliberately deferred to a fresh session — see "Next session" below.

1. **Pawns blinked white / flip-flopped walking↔standing.** Root causes, both fixed:
   (a) two v1 walk frames shipped an opaque white matte (the model ignored the green
   screen, the key pass missed). Fixed at the source (art regenerated, below) AND with a
   runtime safety net — `client/src/render/matte.js`, a pure border-flood scrub run once
   at sprite load (`SpriteAssets._scrub`), node-tested. (b) a pathing pawn often steps
   only every 2nd–3rd wire frame, so `walking` flickered. `motion.js` now carries
   `sinceStep` + `WALK_HOLD_FRAMES` hysteresis (`isAnimWalking`) — the walk SPRITE holds
   across small gaps while the slide stays step-gated.
2. **LLM dialogue read like stage direction.** `PromptBuilder.GlobalSystemBlock` now
   demands: first person, plain simple English, ONLY the spoken words (no *leans
   forward*, no narration, no quotes) — and explicitly says a reveal/agreement/goodbye
   must ALSO call `propose_effect` ("saying it without the tool call does nothing"),
   which is the first swing at the known effect-elicitation gap. NOT yet validated
   against live providers — run `llm-smoke` before the playtest and check both the tone
   and whether `propose_effect` now fires.
3. **Walking crew were hard to click.** `crewTileNear` in `client/src/input/controls.js`
   snaps a canvas click to the nearest crew member's CURRENT tile when the click lands
   within ~0.7 tile of either slide endpoint (mid-walk bodies count). Node-tested.
4. **Standing pawns stared up into the camera.** That gaze was literally in the v1 spec
   prompts. `spec_cyberpunk80s_v2.json` (new spec per the art invariant; work dir
   `work/cyberpunk80s-128-v2` cloned from v1 so ONLY the 9 pawn units regenerated)
   redoes the three idles as level three-quarter-profile gazes in the walk-frame
   perspective, and regenerates the walk frames with hard green-screen wording. The
   sprites.g.test.js SPRITE_URIS pin moved deliberately (explained in the test file).
   Advisory note: the slice-shot lighting-range metric now reads 2.34× (bar 2.5×, WARN,
   advisory-only) — the new pawn luma shifted the auto-picked blocks; `accepted.png` was
   NOT re-accepted (still PASSes style-lock at 0.1254 ≤ 0.20) — re-accepting is the
   human A/B ritual's call.
5. **Female crew had male busts (Grace was a bearded white man).** The portrait prompts
   never carried appearance, so the model drifted. `run.py portrait_prompt` now weaves an
   explicit `appearance` line; `personas_slice_authored.json` gained appearance fields
   (gender/ethnicity/age grounded in each backstory's pronouns and name);
   `spec_portraits_slice_v2.json` regenerates all 8 slice busts in ONE consistent painted
   style. Same pk_ keys → same files refreshed; manifest untouched (append-only proven by
   the existing portraits tests). Host side, `GameSession.Portrait()` now maps the 8
   authored crew to gender-matching pawn variants (F → `pawn_c`, M → `pawn_b`/`pawn`)
   via a name-keyed view table (`SliceVariant`) — sim carries no appearance state (a
   possible future def/persona field, noted, not built).
6. **UI "very basic": no movable chats, no build UI, no sensors** → the redesign, next
   session (below). Its WIRE groundwork already landed here, tested
   (`WebRosterBuildTests`): a `roster` channel (per living crew: cid/name/role/mood/
   morale/task/portrait/deck/x/y — deliberately not fog-gated, own-crew intercom
   knowledge; in `Snapshot()` catch-up) and `{"cmd":"build","kind":"wall|door|cancel",
   "x","y"}` → `DesignateBuildCommand` on the current deck (legality stays sim-side in
   `CanDesignate`, tick-boundary applied).

Suite after this round: **530 dotnet + 125 node** via `./ci.sh`. Scenario/tick-3000/slice
hashes unmoved (no sim state was added; verify pins in `ci.sh` still match).

## Next session: the UI rebuild ("Perilune Game UI" design)

Garvin supplied a target design — imported to
**`docs/design/perilune-game-ui.dc.html`** (annotated; read its header comment first).
Warm Space Mono console: top status bar (ship/deck/day/time/pause/speed/caution chip) ·
left CREW WATCH sidebar (avatars, surname, role, morale bar — feed from the new `roster`
channel; clicking a row should select without hunting pawns) · center = the existing
canvas (keep executors/input untouched) · right READOUT panel (selected crew, traits,
task, memory + [T] TALK / [M] MOVE / [B] BIO) · bottom bar (BUILD/REFIT/…/CHRONICLE
tabs — BUILD palette is live via the new build command; LENS SELECT row; SENSOR LOG).
Also wanted: movable/draggable chat panels (panel-base.js has no drag yet). Rebuild
`client/index.html` + `styles.css` + `ui/hud.js` around this; the wire needs nothing new
for v1 of it. Keep the node ui tests honest (`ui.test.js` etc. pin DOM ids). The design's
static deck mock is replaced by the real canvas; room-overlay lenses on the canvas
already exist host-side.

## Running / testing the game

```bash
./ci.sh                                     # the full gate — run before/after anything (exit 0)
# PLAY (the game: dialogue UI, lighting, portraits, MOSS IDE — two terminals):
~/.dotnet/dotnet run --project hosts/web -- --port 8330 --ship slice   # terminal 1
python3 client/serve.py                                   # terminal 2 → http://localhost:8331
#   (click a crew member, press T to talk; ?exec=webgl2 for the GL executor)
# The page the HOST itself serves (:8323 default) is the LEGACY reference skin —
# no dialogue UI, no T key; it fooled a playtest once, so the host prints this at boot.
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
