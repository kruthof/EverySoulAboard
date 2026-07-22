# HANDOVER — PERILUNE (2026-07-22, P2 complete + playtest rounds 1–3 + Console UI rebuild + RELATIONS tab + the mechanics reference, tag `v2-talking-ship`)

> **Newest first:** start at "Playtest round 3 (2026-07-22)" — six landed lanes, the
> ship-visuals plans, and five decisions parked for Garvin. `docs/MECHANICS.md` is now
> the authority on how the sim actually behaves; its §13 "known gaps" lists what is
> wired but not connected. Counts: **607 dotnet + 207 node**.

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

## The Console UI rebuild (2026-07-21, commit `710c5d2`) — LANDED

The client UI was rebuilt to Garvin's target design
**`docs/design/perilune-game-ui.dc.html`** (annotated; header comment first). The full
specs the build was reviewed against live next to it:
`perilune-game-ui.interaction-spec.md` (IX-*, keyboard/build/selection/drag/edge
behavior) and `perilune-game-ui.visual-spec.md` (VS-*, tokens/type/layout/states +
contrast audit). Read those before touching the console — they are the contract.

What shipped (client-only; wire untouched): warm Space Mono console skin (fonts
bundled offline under `client/assets/fonts/`, OFL) · top bar with deck stepper,
DAY·HH:MM clock from `metrics.dayFrac`, pause/speed/lens/LLM chips and a client-derived
caution chip · CREW WATCH fed by the `roster` wire (keyed in-place row reconciliation
by cid — never rebuild rows, it eats clicks/focus/portraits) · READOUT from the
frame+roster join ([T] TALK, [M] MOVE arm-then-click, BIOGRAPHY opens the citizen
card — the `citizen` msg no longer auto-opens it) · bottom console with
BUILD/CREW/MOSS/CHRONICLE tabs (REFIT/ORDERS/SHIP/NAV deliberately omitted — no wire),
wall/door/**cancel** palette (never "demolish": host Cancel only revokes pending
designations), 7-lens row (keys 1–7), sensor log = `log` wire tail · draggable panels
(pointer capture in `panel-base.js`) · new `Cmd.build`/`Cmd.chron`, roster/chron
decoding · B/X armed-tool keys with the Escape stack (armed tool → dialogue → nothing)
· pure derivations in `client/src/ui/console-model.js` (node-tested; clock, caution,
speed label, surname, selection join, cross-deck pending-click with supersession,
armed-tool transitions).

Review record: independent engineering gate PASS (mutation probes 3/3, de-DE culture
pass) · HCI review + re-gate PASS · visual art-director review + re-gate PASS on live
pixels (CDP-driven tab/breakpoint/portrait-flash probes). Suite: **530 dotnet + 153
node** via `./ci.sh`; scenario/tick-3000/slice hashes unmoved (client-only).

## Conversation history fix (2026-07-21, commit `9b16c07`) — LANDED

Second playtest defect of the day: crew had no memory one sentence back, and replies
sometimes went meta ("I should behave like I am this person"). Root cause: the
transcript path in `PromptBuilder.Build` existed but every live call site passed
null — `SendAsync` carried only the current utterance, the hub's `ChatSession` shell
was dead code, and the sync `Ask` path never handed its transcript to `Respond`.
Fixed by `ConversationRequest.Transcript` (append-only DTO field, TemplateBackend
byte-identity test-pinned), fed by all three adapters; the hub keeps a real
per-session transcript with a lock-free InFlight-gated handoff (appends by the
background driver before the volatile release; immutable snapshot taken sim-side
behind the `!InFlight` gate; failed turns record nothing; bounded 2×MaxExchanges).
Historical player lines go through the same `player_speech` quarantine as the latest
utterance; turn N's layout is a byte-prefix of turn N+1's, so both `cache_control`
breakpoints stay on the stable prefix — and the growing suffix should finally push
the assembled prompt past the haiku 2048-token cacheable minimum in longer chats
(re-check the `cache_read` backlog item next smoke). `GlobalSystemBlock` dropped the
"roleplaying" actor-framing for direct identity + an explicit no-meta rule (the
propose_effect elicitation + quarantine sentences survive byte-identical).
Independent gate PASS (race-hunt clean, injection corpus inert on history, mutation
probes killed incl. a review-round strengthened failed-turn test). **Live-probe
verified** the same day: two-turn exchange with Amara over the real Anthropic route —
turn 2 recalled a planted name + object verbatim, in character, zero meta (cents
spent, zero CI surface). Suite: **541 dotnet + 153 node**; hashes unmoved.

## Playtest round 2 (2026-07-21 evening) — four Opus-gated lanes, all LANDED

Garvin played again and filed six findings; all actionable ones landed the same
evening via four worktree lanes, each with its own independent Opus gate (the
ritual: blind spec → in-worktree `./ci.sh` → adversarial/mutation probes →
PASS; fixups re-gated). Recon for the round was done by four parallel explore
agents whose root-cause reports drove the lane contracts.

1. **Motion** (`b770e88`, gate PASS ×2 after one fixup). "Pawns run and stutter
   square-to-square": the client faked each 500 ms sim step as a fixed 130 ms
   frame-anchored glide (≈7.7 tiles/s dart, then ~370 ms parked, snapping when
   any OTHER crew's step re-sent a frame). `motion.js` now runs a per-cid
   step-anchored slide: EMA-estimated per-step interval (80–1200 ms clamp,
   500 ms default — auto-adapts to sim speed), mid-slide re-steps anchor from
   the current interpolated position, offsets survive step-less frames.
   Gate-found H1 fixup (`79cc4fe`): `isAnimWalking` is slide-aware so the walk
   sprite holds for the whole glide (webgl2 atlas bake+sample gates share one
   `nowMs` and cannot diverge; frozen `?t=` path falls back to the 2-frame
   hold, byte-identical). Client-only; true pace (2 tiles/s at 1×) is now what
   the eye sees — if still too fast, that's a `ticks_per_tile` def change
   (hash-move ritual), deliberately not done here.
2. **Dialogue** (`0fb9861`, gate PASS). (a) The hub now emits the player's
   utterance as an authoritative `"you"` chat line at dispatch — ordering
   player → deltas → crew holds in both the immediate and queued-say paths,
   and a failed turn still shows what was said. (b) One X/Escape closes a chat
   for good: pure `chatPanelAction` decision table — `start` is the sole
   (re)open trigger; trailing end/delta events fold into the reducer but never
   recreate DOM. (c) BIOGRAPHY gained a bounded per-cid CONVERSATION LOG
   (append-only trailing `"log"` field on the `citizen` msg + new `bio`
   re-request cmd), and the previously-unwired `WriteConversationSummary` now
   fires at conversation end (`PumpEndedSummaries`, sim-thread, unhashed mind
   state, write-once) — conversations finally persist into MEMS memories. The
   summary embeds only template text + the crew's own words, never verbatim
   player text (injection-checked by the gate).
3. **Relations** (`e43db8e`, gate PASS incl. live CDP pixel probe) — the
   player-requested RELATIONS tab to a provided visual mock. New cached
   `relations` channel (append-only `WireFormat.Relations`, read-only
   `Social.Edges` walk on the sim thread — NEVER `Nudge` from the wire path —
   snapshot catch-up like roster, not fog-gated). Client: the tab swaps the
   ship viewport for a `.stage`-overlay SVG ring of the living crew — mutual-
   regard edge colors (avg of both directions; close ≥45 / warm ≥15 / hostile
   ≤−15, boundaries in `relations-model.js`), dashed = secret, focus via node
   or CREW WATCH click (the ONE shared selection), boxed authored-note tags,
   READOUT gains both-direction regard rows. `AuthoredRelationship` gained an
   UNHASHED `Secret` flag; exactly one lore-grounded pair is marked (Nadia
   Hassan ↔ Salif Camara — "she stitched his burns; he owes her"). Contract:
   `docs/design/perilune-game-ui.relations-spec.md` (IX-R*/VS-R*; VS-R5
   documents the deliberate focused-edges-keep-tier-hue deviation from the
   mock; IX-R10 the Escape rung).
4. **Console visibility polish** (`1410988`, gate PASS incl. live pixels) —
   round-2's "there is nothing to do" finding: everything was wired but
   invisible. New cached `designs` channel (read-only `BuildSystem.Pending`
   mirror) drives persistent dashed designation ghosts glued to the camera
   (authoritative — a ghost exists only once `CanDesignate` passed; IX-38
   supersedes IX-35's optimistic-ghost ban for wire-backed ghosts). Arming/
   designating while paused surfaces a `‖ HOLD — PRESS SPACE` nudge (the sim
   boots paused — the root cause of "nothing happens"). The `roster` wire
   gained append-only persona `traits` feeding a compacted CREW tab with a
   visible scrollbar + `▾ N MORE` affordance (closes the old CREW-scroll
   backlog item). New `terminals` channel gives the MOSS tab a clickable
   terminal directory — opens the IDE cross-deck via `moss open`, deliberately
   NOT `Cmd.click` (no power toggle; IX-73). Escape's final rung exits
   RELATIONS back to BUILD.

Suite after the round: **560 dotnet + 188 node** via `./ci.sh`; scenario
(`26907c23d7e48a5c`), tick-3000 (`401c9b96aff338a7`) and slice
(`d1710ab6a1fe50ce`) pins all verified unmoved (nothing hashed was added —
Secret/traits/logs are host-owned or unhashed persona state).

Round-2 finding NOT addressed by code: "there is not really anything else to
do" beyond the above is P3 scope (nav/sensors loop, derelicts, campaign) —
the polish lane makes the existing verbs visible; P3 adds new ones.

## Playtest round 3 (2026-07-22) — six lanes, all LANDED on main

Garvin played the slice and reported three things, plus a visual bar and a docs ask:

1. "I can see the building option of a wall, but nothing happens, no one builds anything."
2. "People run way too fast around, it's disturbing."
3. "I am not sure if they truly work on something, as they just walk around… there was a
   CO2 problem, and the life-support lead wrote that she is fixing it, but did not do
   anything visual."
4. A Prison Architect screenshot: "more than 10 years old… much more crisp and polished
   than our ship (not talking about our new UI, that is good)", and later: "even at
   highest zoom, each sprite is super crisp."
5. "Ensure the game mechanics are well documented in the code base."

**Method that worked and is worth repeating.** Three *read-only* diagnostic lanes ran
first and were forbidden from editing anything; only then were fix lanes briefed with
the verified findings so they could not re-derive (or re-invent) the diagnosis. Every
package then got BOTH an author self-review and an INDEPENDENT reviewer. Those two gates
caught **disjoint** classes of defect — see "Review lessons" below. Four of six packages
were sent back with must-fixes before merging.

**Final gate: 607 dotnet + 207 node green; `26907c23d7e48a5c` unmoved all session.**
Slice golden moved `d1710ab6a1fe50ce` → **`b31ba82f50cf395c`** (work economy). 2-crew
tick-3000 `401c9b96aff338a7` unmoved.

### What landed

- **Slice work economy** (`b09eba8`). The build system was never broken. The slice
  shipped exactly 2 Regolith (a wall costs 2), the SalvageRecycler ate both within ~50 s
  of boot on a standing bill, and the 48 debris tiles were never designated so the only
  in-sim Regolith source never ran. Added `ShipPlan.DigDesignations`; the slice now
  designates its 48 tiles **and opens `door_aft`** — which was closed, making the entire
  field unreachable (designation alone was bit-identical to baseline). Crafting no longer
  outbids pending builds for Regolith; `_anyFreeMaterial` (bool) → a free-unit **count**
  so scarce material finishes one site instead of stranding several. A wall designated at
  tick 3000 used to stall at `0/2` forever; it completes at **3487**.
- **Legibility + dialogue honesty** (`db4e8e1`). `TaskLabel` names the object and
  distinguishes en route ("Heading to service scrubber_ls", no map tag) from at work;
  task line in CREW WATCH; on-map work markers joined from the roster's existing
  `deck/x/y/task` (**no wire change**); `designs` wire appends `delivered`/`required`
  (append-only, elements 5–6) so a starved ghost stops looking like a worked one; prompt
  gains a promise-ban plus a `[SHIP]` block so crew speak to real conditions.
- **Render WP-0** (`9e9cdff`) — see the detailed section below.
- **Stage relight** (`0bf1ce9`). Deck luma p50 **17 → 41**, p95 57 → 116; three-state
  separation (space 4.6 / hull+fog 38.5 / unlit floor 60.0 / lit floor 112.7); per-crew
  accent. Style anchor re-baselined per PROTOCOL.md §2 (`bdcdd57`); lighting range
  2.80× → 4.59×.
- **`docs/MECHANICS.md`** (`9f6ec7b`, 1467 lines). The as-implemented mechanics
  reference the repo never had. Every number cited `file:line` or `def-key`, verified
  against source — explicitly NOT copied from `legacy/GDD.md`/`TDD.md`, which are
  aspirational and disagree with the code in **14 recorded places**. Its §13 "known gaps —
  wired but not connected" is the institutional memory whose absence let these bugs ship.
- **Doc-comment uplift** (`d913a15`). Ten thin foundational sim files brought to the
  house standard set by `BuildSystem`/`CraftingSystem`. Proven comment-only by
  comment-stripped token-stream comparison.

### Caveats recorded rather than smoothed over

- **The dig is a BOOT-WINDOW economy, not a durable one.** Crew are ~39% busy over the
  first 10 sim-min but clear all 48 tiles in under 4, and decay to ~10% by 3 h and ~4% by
  7 h. The test is named `CrewWorkTheBootWindow_FirstTenSimMinutes` deliberately. **A
  recurring work source is real, open design work** — this is the durable form of
  "they just walk around".
- **The stage is still far flatter than PA.** 41 vs PA's 123 deck p50; lit-floor
  p50→p95 spread 13 luma vs PA's ~55.
- The crew accent is baked into the sprite bitmap at load, so 8 crew share **3** hues
  (CREW WATCH uses 6 by cid hash). Per-soul discs need draw-time work.

### Open decisions for Garvin (nothing below was taken unilaterally)

1. **Max-zoom clamp.** `MAX_TILE_DEVICE_PX = 128` makes max zoom 1:1 (was a 5× upscale)
   but also clamps the **default** Retina view 72 → 64 CSS px/tile (~12% wider on load).
   One constant reverts it.
2. **Sprite regen.** Only worth funding **bundled with a hard-edge art spec**. Measured:
   PA magnified 6× is visibly bilinear-blurred and still reads crisp — its quality is
   hard outlines, flat fills, low detail density, NOT resolution. Our pawns carry ~2,285
   unique colours each. A pure resolution regen costs credits, moves the SPRITE_URIS pin
   and the style anchor, and would still go to mush. Only pawns retain 1024² sources
   (re-processable to 256 for **$0**); every other asset exists only as 128px output.
3. **Movement retune** — fully measured, NOT landed (moves the CI pin). See below.
4. **CO2** — re-scoped: it is a **gas-transport bug**, not a dispatch gap. See below.
5. **`Morale` / `Health` are never written by any system** yet three crew surfaces render
   them (CREW WATCH bar, CREW tab, READOUT) as a constant 100%. Design question.

### Movement retune — measured, ready, NOT landed

`ticks_per_tile = 5` @10 Hz = **2 tiles/s**. The client interpolation is NOT at fault
(displayed speed matches sim to 0.4%; `b770e88` did its job). The bigger half is
`PathService.TryRandomWalkableTile` picking a uniformly random tile **ship-wide, all
decks** → mean ~21–29-tile marches, crew moving **82% of all ticks**, 99.4% of it wander.

Landing shape (measured in a throwaway copy, full suite run 4×): `ticks_per_tile = 10`,
`idle_ticks_between_wanders = 90`, `DEFAULT_STEP_MS = 1000`, `WALK_FPS 6 → 3`.
`MAX_STEP_MS = 1200` hard-caps `ticks_per_tile` at 12. Cost: def-field ritual both sides
(`SimDefs.CreateDefault`, doc comments, `citizen.def`, the mirrored `CitizenSystem.cs:19`
const, `DefsDefaultTests` literal), scenario pin → **`3076969310f97c25`**, slice golden,
`ci.sh`, `CLAUDE.md`, this file. The 2-crew tick-3000 golden does NOT move (those crew are
`HoldPosition`). `idle ≥ ~300` breaks `P2ExitTests` P4 (a second crew member parks in the
sealing cabin) — 60/120 are safe. **Better second lane: a `wander_radius_tiles` def field**
capping wander DISTANCE, which preserves the desynchronisation `AuthoredShips.cs:235-241`
depends on.

### CO2 — the fix is transport, not dispatch

Verified from a clean-room boot: `AtmosphereSystem.FlowAcrossDoor` moves gas only on a
pressure delta with **no diffusion term**. Five scrubbers cover 2.29× crew production, yet
scrubber rooms sit at **exactly 0 ppm** while the crew corridor climbs 500 → 6,243 →
11,961 → **17,644 ppm** over 3 days. Only ~42% of production ever reaches a scrubber.
Sending a crew member to service a *healthy* scrubber fixes nothing. Related: the ship
also **freezes** to −12.9 °C (below the −10 °C hypothermia threshold) while the one
shipped MOSS rule, `overheat_guard` — commented "inert under the shipped defaults" —
fires **2,579 times in 3 days** saying the ship is too *hot*.

### The ship-visuals plans (two Opus design agents; PLANS ONLY, not built)

Renderer lane (sized impact/effort, disjoint enough to run as parallel worktrees):
**WP-1 silhouette + drop shadow** (5/2 — bake a dilated dark rim into each atlas cell,
plus a second offset black quad per entity before the entity batch; *this plus WP-0 is
most of "why PA reads crisp"*) · **WP-2 wall autotiling + extrusion** (5/4 — an 8-bit
neighbour mask in `glyphs.js`, `terrain:wall:{mask}`, ≤47 cells; **no wire change**, the
client already holds the glyph grid) · **WP-3 light pools** (5/3 — a pure `lightfield.js`
emitting a vertex-coloured multiply mesh; the flat program already carries per-vertex
rgba so gradients are free) · **WP-4 floor variants + grout + wall-base AO** (3/2, needs
WP-2) · **WP-5 ghosted room-name floor typography** (3/3 — needs a NEW append-only
`rooms` wire message; cheapest as a DOM overlay) · **WP-6 animated designation dashes**
(2/2) · **WP-7 texture-array migration + 256px art** (4/5, last; `sprites.g.js` is already
1 MB of inline base64).

Art lane: **A** value relight ✔done · **B** three-state separation ✔done · **E** crew
accent ✔done · **C** room-type floor tint (5/2, needs per-tile tint + room type on the
wire) · **D** per-tile wear jitter (4/2) · **F** ghosted room labels (4/2) · **J**
grounding shadows (4/2) · **G** new hard-edge spec, `tile_px: 256`, ≤64 colours/sprite
(5/4, full regen) · **H** 4–5 authored floor materials (5/3, needs WP-2) · **I** re-process
surviving 1024² pawns to 256 (3/1, **$0**).
Target look, agreed: *"a cold ship with warm rooms in it"* — hard high-value graphite hull
against true black, room identity by floor alone, saturation reserved for crew/hazards,
wear as the signature (a derelict, not a prison).
**Biggest trap flagged:** every visual package perturbs `client/test/golden/` and the
`passes` fixtures, and `UPDATE_GOLDEN=1` will bake a regression silently. Never let two
lanes regenerate the same golden; eyeball `slice-shot.mjs` output before baking.

### Review lessons (why both gates stay)

Self-review reliably caught the author's own mechanical errors: a **fake test suite**
(all 10 passed with both fixes disabled), a z-index collision, a per-frame forced reflow,
and — the best catch of the session — that adding one `DeviceSpec` would have **silently
rebound all eight crew portraits**, because `_nextEntityId` is shared and citizens are
added after devices while the portrait pipeline keys on `pk_fnv1a32(seed, citizenId)`.
Independent review reliably caught what the author could not see: the `[SHIP]` block
instructing the model to **deny real faults** (it never read `Device.Powered`, and life
support is a brownout shed tier); a new **permanent crafting-chain deadlock** introduced
by the work-economy fix; a doc comment inventing a `SetJob` effect that does not exist;
and **three separate tests that could not fail** (a tautological colour pin, an untested
`prop` class, and a pawn-slide "guard" that recomputed the transform inside the test and
survived the exact mutation it claimed to catch).
Reviewers were wrong too, and implementers were told to push back with evidence: the
"~20% reaches the scrubbers" figure (really **42%**), a stale test count read from
`CLAUDE.md` instead of measured, a fixture that hid an in-flight race by luck, and the
half-texel UV inset the orchestrator specified — which was **wrong** (128 px across 127
texels; corroborated by 1:1 frames being byte-identical without it).

## Render WP-0 — "a crisp ship stage" (2026-07-22, reviewed + corrected)

Renderer only: projection stays pure, no sim / host / wire / def touched. The
stage read soft next to Prison Architect; three verified causes.

1. **Filters.** MIN `NEAREST_MIPMAP_LINEAR` → `LINEAR_MIPMAP_LINEAR` (the one
   that matters — the old pair aliased *and* blurred at once); canvas2d gets
   `imageSmoothingEnabled` + quality `high`. MAG `LINEAR` is **inert today** and
   the source says so: the pitch ceiling means tile quads are never magnified,
   and at exactly 1:1 LINEAR ≡ NEAREST (1:1 frames byte-identical, RMSE 0.000).
   The max-zoom crispness win comes from the CEILING, not the filter.
2. **Atlas gutter 1px → `ATLAS_BORDER` 4px of edge-REPLICATED pixels**, owned
   exclusively per cell (so the packer's gutter is `2 * ATLAS_BORDER`; a shared
   gutter would let neighbours overwrite each other's protection). Replicated,
   not transparent — premultiplied zero would ring every sprite with a dark
   halo. Tile-seam luma on a flat lit floor: 12.36 → 1.11 (**−91%**). The exact
   bleed guarantee is **mip 2**, not mip 3: placements are 8-aligned, so at mip
   3 the border is 0.5 texel and a rim tap picks ~25% neighbour — but the
   reachable LOD is ~1.7–2.2, so mip-3 weight is ≲0.2 (≲5% on a 1px rim). Soft
   bound, documented at `ATLAS_BORDER`. `packAtlas` now returns `pad` so
   `_replicateEdges` CHECKS the gutter instead of assuming the default.
3. **Integer pixel grid.** `tilePitch()` quantizes device-px-per-tile and
   `transform()` rounds the origin, so every tile seam lands on a device pixel.
   Plus `MAX_TILE_DEVICE_PX = 128` — max zoom is 1:1 with the 128px source art
   instead of a 5× upscale (default opening zoom moved 72 → 64 CSS px/tile so
   the default stops contradicting the ceiling at Retina dpr=2).

`UV_INSET_TEXELS` is deliberately **0**, with the measurement in the source: the
textbook half-texel inset maps 128 px across 127 texels and costs 25% of the
luma gradient / 46% of Laplacian variance / 35% of HF energy at exactly 1:1.

**The pawn slide is NOT snapped** — it is added in tile space *before* the pitch
multiply and stays a continuous float. The PAWN SLIDE INVARIANT test drives the
REAL `WebGL2Executor` and `Canvas2DExecutor` (recorders in place of the GPU /
canvas sink) and reads back device positions; the first version re-derived the
formula inside the test and pinned nothing. Proven to fail under (a) rounding
the pawn position in `webgl2.js`, (b) adding the slide after the pitch multiply,
(c) rounding `dx` in `canvas2d.js`. **Never let this test recompute the formula.**

### Interaction risk to re-measure after the matte/palette lane lands

Lane `worktree-agent-a5f0196b55ab76168` touches `matte.js` / `palette.js` /
`sprites.js`. No file overlap with WP-0, so it will merge clean — but two
things genuinely interact and should be re-measured, not assumed:

- (a) that lane's `floor` grade is a ~3× contrast stretch meant to "pull the
  latent plate seams out of the noise". That re-amplifies exactly the seam
  contrast WP-0 cut by 91%. Re-shoot the flat-lit-floor seam-luma measurement
  after both land.
- (b) its `paintUnderglow` paints a saturated disc into the sprite's transparent
  margin, i.e. **at the cell edge** — which `_paintCell`'s clip may cut and
  `_replicateEdges` will then replicate 4px outward. That is the one case where
  the soft mip-3 rim above becomes visible. Check a zoomed-out establishing
  frame for haloed pawns before accepting.

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

**Before/alongside P3, in rough priority order:** (1) fix the host GameSession wedge
on unclean websocket drops (backlog below) — it will bite the next playtest; (2)
re-run `llm-smoke` + a multi-turn live probe to re-measure the two SMOKE-P2 items
now that history flows (elicitation + `cache_read`, both flagged below); (3) the two
human exit bars still open on Garvin (blind screenshot A/B — the new Console UI
should be in the A/B frames — and the 60-minute playtest). (The CREW-tab scroll
affordance item landed in the round-2 polish lane.)

## Known issues / backlog (not regressions)

- **Prompt prefix below the cacheable minimum.** `PromptBuilder` sets two `cache_control`
  breakpoints, but the slice's assembled prefix is only ~970 input tokens on Haiku and the
  haiku-class minimum cacheable prefix is **2048 tokens**, so caching silently never engages
  (`cache_read` flat at 0 across all turns, confirmed live). Not an adapter bug — a
  content/prompt-size matter. Fix is more persona/context/memory in the prefix. (`SMOKE-P2.md` §1.)
  **Update 2026-07-21 (`9b16c07`):** the transcript now grows the prompt each turn, but as
  volatile *suffix* — the cacheable *prefix* is unchanged, so this item stands until the prefix
  itself grows. Re-measure on the next smoke.
- **Effect elicitation is unsolved.** Live models discuss authored secrets **in prose** but do
  not emit a `RevealInfo` / `propose_effect` tool call (both Anthropic and OpenAI, this run).
  The wire/persona/secret data reaches the model correctly; the models just don't structure the
  reveal. This is prompt work owed **before** the playtest. (`SMOKE-P2.md` §findings.)
  **Update 2026-07-21:** the prompt-rework smoke (`7bf9234`) plus conversation history
  (`9b16c07`) both moved this — re-verify live with a multi-turn secret-probing exchange
  before declaring it closed; single-turn `llm-smoke` alone can't prove it anymore.
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
- **Host `GameSession` can wedge after unclean websocket drops** (spotted by review
  tooling during the Console re-gate, pre-existing): raw sockets dropped without a
  close handshake left the session loop not rendering/draining commands until restart;
  the client then shows stale chips with no disconnect overlay. Worth a look before
  P3 playtests.
- **`RelationshipSecrets` is not MEMS-persisted** (relations gate LOW): the secret
  flag is boot-authored and correctly unhashed, but `WritePersona` persists
  `RelationshipNotes` and not `RelationshipSecrets` — after a save/reload the
  Nadia↔Salif edge renders solid instead of dashed. Fix is a deliberate MEMS
  chapter-format decision (append, version bump), not a quick patch.
- **Motion cosmetics** (motion gate LOWs): on a 1×→5× speed jump the EMA interval
  lags ~7 steps (pawns briefly trail up to ~2 tiles, self-correcting); and
  `crewTileNear` click-assist only offers the from-tile candidate on the step
  frame itself, not during carried step-less frames. Both minor.
- **`paintDesignGhosts` rebuilds the layer's innerHTML every draw()** (polish gate
  LOW): bounded (shown-deck pending designs only) but worth a node-reuse pass;
  the visual spec also wasn't amended for `.design-layer` (IX-38 documents it).
- **ConversationHub micro-issues** (from the history-fix gate review, pre-existing):
  a stale-`Ended` read can dispatch one redundant turn on a just-ended session;
  `PrepareTurn` re-snapshots persona/context every turn so those bytes can drift
  mid-conversation (cache efficiency only, prefix still stable per turn); `_sessions`
  entries are never removed over a long host run. None are regressions; none
  memory-unsafe.

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
