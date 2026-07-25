# PERILUNE — project guide for Claude

> **Game title: Every Soul Aboard** (decided 2026-07-23). "Perilune" is the internal **codename** —
> the repo, the `Perilune.*` C# namespaces, and the ship MSV *Perilune* keep it; nothing in code is
> renamed by the title decision. See `docs/VISION.md` for the naming note.

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

## Status snapshot (2026-07-25) — **E0-4 LANDED on `main`, and its headline claim is RETRACTED**

**Read `docs/HANDOVER.md`'s top section before quoting any stockpile number from anywhere.**
E0-4 (filtered stockpile zones) is on `main` (`0be9d70`) — chartered as **six** work packages
(WP-1…WP-6) and shipped **eight** (WP-7 a scope expansion for a pre-existing engine bug; WP-4b a
send-back redo), each Opus-implemented and **independently** Opus-reviewed. **Its central published
claim was FALSE.**

**⛔ RETRACTED — "a wrong-deck stockpile is a severe throughput regression" was never measured.**
`StockpileHarness.SelectStockpile` gated candidates on the `TileFlags.Walkable` flag with **no
reachability test**, so `--stockpile far` zoned **3 of its 4 slice tiles inside the authored sealed
observatory** (`sim/Sim.Gen/AuthoredShips.cs:93` `DoorClosed = true`; `Simulation.IsWalkable` refuses
a closed door; nothing in the sim ever opens a door). What the `far` column measured was an
unreachable-tile **haul livelock** — a pre-existing engine bug — not a cross-deck haul cost. **Every
previously published `far` number is void**: throughput `6`/`2`/`9`, ~49 % `HaulPickup` against
~0.0 % `HaulDeliver`, and A1 "50.000 %". A reachability gate (`sim.Paths.FindPath` from every live
crew member; host-side, pin-neutral) landed with the re-measure, and slice geometry came out
**807 walkable / 657 reachable / 150 unreachable (19 %)**. `--stockpile far --days 1` collapsed from
**~43 min of wall clock to 24 s**; that collapse *is* the retraction. (The **~43 min** is
contemporaneous prose — **no timing artifact survives**; the 24 s and the ~72 s 3-day legs are from
recorded `.time` files.)

**`ECONOMY.md` §8's −14 % wrong-deck regression is NEITHER CONFIRMED NOR REFUTED — and the slice
cannot settle it.** End-of-run `ControllerModule` is **matter-bound**, not labour-bound
(`MECHANICS.md` §13.15): every unmodified leg ends on the *identical* ground stock `Corpse=1
Potato=699 ControllerModule=31` with zero Regolith/Scrap/Parts left, and `far 40`'s entire haul cost
is **1.6 crew-hours against ~352 crew-hours of post-cliff idle** — it would have to be ~200× larger,
landing during h1–h28, to cost one module. **"31 in every leg" is a saturated instrument, not a null
result. Never write "disproved".**

**What IS measured and stands** (slice, 3 sim-days = 2 592 000 ticks, one seed, n = 1): cross-deck
haul **works** (deliveries land on deck 1 via the ladders in every zoned leg); at equal zone size
(N = 40) a *reachable* far-deck stockpile costs **+0.109 pp** of crew time and **+0.6 pp** of on-job
travel against a bench-side one; **per delivery it costs ~1.5×**, and that ratio is a **lower bound**;
and with `--strip 40` headroom the metric does resolve (50 → 51) while **far still equals bench**.

**§8's MECHANISM is real, and WP-4's bench rule is what suppresses it — the lane's best result.**
With the bench rule reverted (`_benchWanted` forced to 0, a measurement-only local revert, never
committed) a **far-deck** zone raises on-job travel **+3.2–4.1 pp** *and raises crafting occupancy*
(21.71 → 22.09 %) while idle `None` falls ~1 pp — literally §8's "the downstream station's fetcher
must walk them back". With a **bench-side** zone crafting occupancy *falls*. **The sign flips with
placement**, so it is the §8 round-trip and not merely "more hauling". **How much of §8 the rule
removes is DELIBERATELY NOT QUANTIFIED**: the fraction is ~47 %, ~81 %, ~65 % or **~0 %** purely
according to which contrast you pick. Per delivery it is **1.57× with the rule and 1.57× without**
(the `--strip 40` legs) — the rule does not make a wrong-deck haul *cheaper*, it makes **2.1–3.2×
fewer of them happen**. Any single percentage would be cherry-picked.

**A1 trap, four times in one lane:** `filtered-far 40` "PASSES" A1 at **25.219 %** with throughput
**31 — identical to the FAILING baseline**. A1 counts *busy* crew and haul is busywork.

**Also landed with it.** A real pre-existing bug fixed (WP-7: an unreachable stockpile tile no longer
livelocks the haul board — it was burning ~8 crew at 50 % duty), at an honest cost — the bug went from
**expensive-and-visible to cheap-and-invisible**: a zone painted where no crew can reach now simply
never fills, silently, with nothing anywhere to say so (`MECHANICS.md` §13.17; a live follow-up).
Also the **economy-modularity audit** + its architecture-boundary test
(`docs/design/perilune-economy-modularity.md`), and the **console-retirement programme** — see
**THE STANDARD SURFACE** invariant below: `--ship grid` wearing Overview + Room Zoom is the **one**
standard UI, `--ship slice` is the **headless measurement fixture**, and the `.app` console shell is
deprecated and closed to new work. E0-4's WP-5 built the whole ACCEPTS filter onto that deprecated
shell, which is why the invariant is mechanised rather than written down.

**Gate on `main`: 979 dotnet + 529 node**, `./ci.sh` exit 0. **There are FIVE pins now, not four** —
see "Determinism proof" below. E0-4 moved **none** of them: no sim-state field, no def scalar, and
it is inert without player intent (no authored ship zones a stockpile).

Earlier, still current (2026-07-24, docs-only): the **automation player-journey** design
(`docs/design/perilune-automation-player-journey.md`). Below is the E0-5 record.

## Status snapshot (2026-07-23) — **E0-5 (deconstruct/strip)** landed on `main`, before E0-4
**E0-5 is LANDED on `main`** (merged `--no-ff` from `lane/e0-5-deconstruct`; six commits, four work
packages, each Opus-implemented + independently Opus-reviewed **PASS**). Taken **before E0-4** by
Garvin's decision against `ECONOMY-PLAN`'s written order: A1 measured **matter**, not labour, as the
binding constraint (`docs/HANDOVER.md` "E0-5 before E0-4"), and deconstruct is the only E0 lane that
*creates* matter. **Deconstruct is now a first-class verb mirroring `BuildSystem`:** a passive
`DeconstructSystem` registry (`'STRP'`) + `DeconstructJobSource` + `JobKind.Deconstruct=11`, the
`strip` verb across web/TUI/client (key **V**), and `GlyphColor.Deconstruct` (appended, index 26).
**Walls → `Regolith` (`floor(wall_material × wall_recovery)`); devices → `Parts × Condition`** (giving
`Condition` its second consumer — every other reader was display-only). Guardrail: **`IsPressureHull`**
(a wall adjacent to void or map edge is never strippable — the canvas edge). Stripping an interior
bulkhead merges rooms + equalises gas for free via `Rooms.MarkDirty()`. Device strip un-registers the
MOSS adapter (a *feature* — break your own automation) and writes a `DeconstructCompletedEvent` to the
Chronicle. **The place→strip matter faucet is closed:** `PlaceDeviceCommand` now charges
`device_place_cost` Parts (all-or-nothing, refuses when unaffordable), so the round trip is strictly
lossy (66.7% recovery at pristine, in `ECONOMY.md` §9.6's 50–70% band). **Measured** (slice, 3 days,
new `occupancy --strip N` harness): `--strip 40` lifts the post-cliff h29–h72 busy floor
**1.480% → 13.198%** and flips **A1 24.979% (FAIL) → 37.424% (PASS)**; matter conserves (40 walls →
40 Regolith → up the ladder to +19 `ControllerModule`). **Inert without player intent** — the
verb-less occupancy path and every pin are byte-identical to baseline. Pins: scenario
`85ac8c44`→`00e0a2dadb8e5076` (WP-1 `'STRP'` seed fold, fold-only), tick-3000
`9b834cffc232ce7f`→`4be2e77864fb7409`, slice `8c6b2544`→`1f8f2225ee568de9`, defs
`e56d33a2`→`5a471d12643b64f9` (three def packages). **Deferred to E0-6:** furniture costing machine
Parts is a placeholder (give furniture its own strip currency); the material *teleports* on placement
(no haul); MOSS write-only scripts against a stripped device fail silently. ~~**Next: E0-4** (filtered
stockpile zones) — **do not zone stockpiles in any authored ship until it lands** (keeps the measured
−14% throughput regression latent).~~ See `docs/HANDOVER.md` "E0-5" at the top.

> **⚠️ RETRACTED 2026-07-25 — the struck sentence is history, not guidance, and it contains the exact
> claim this file's top snapshot voids.** (a) **E0-4 has landed**, so "Next" and "until it lands" are
> false. (b) **There is no "measured −14 % throughput regression"** — that is `ECONOMY.md` §8's figure,
> E0-4 **never reproduced it**, and the slice **cannot settle** it (throughput there is matter-bound).
> **Not disproved — unsettleable.** (c) The advice *"do not zone stockpiles in any authored ship"*
> **still stands**, but its justification has now evaporated twice: the throughput reason was never
> valid, and the unreachable-tile livelock reason was fixed by WP-7. **The surviving reason is a DESIGN
> DECISION, not a measurement** — a zone is the player's decision, so authoring one deletes that
> decision, and it would move pins on lanes that currently move none. Do not go looking for a number
> behind it; there isn't one, and a design reason cannot evaporate the way a measurement can. See the
> top snapshot, `docs/HANDOVER.md`'s E0-4 section, and `MECHANICS.md` §13.18.

## Status snapshot (2026-07-23) — **E0-2 (work-rate rebase + movement retune + crew-safety guard)** landed on `main`
**E0-2 is LANDED on `main`** (`39702a3`, Opus-implemented + independently Opus-reviewed PASS, three
legible commits). The L1 **work-rate rebase (~10×)** — dig 6s→10min, wall 6s→4min, door 4s→3min,
maintenance 20s→15min, crafting 600/900/1800s — plus the **movement retune** `ticks_per_tile` 5→10,
landed together (the retune alone costs 29% of production, so never before E0-1). This is the
biggest *feel* change since the slice: human-pace crew doing watchable, minutes-long work. The 10×
maintenance value exposed a latent crew-safety gap (crew stood in lethal air for a 15-min service
and died on generated ships); fixed in-package with a **`SafetySystem` + `JobKind.Flee`** — a
working crew member whose local air turns lethal (`Suffocation ≥ flee_suffocation`, tile
unbreathable) drops its job, releases reservations, and paths to the nearest breathable tile,
resting until recovered before returning. General self-preservation, **inert on healthy ships**.
Pins: scenario `a53d8505`→`85ac8c44233284e9`, slice golden `9a84a72f`→`8c6b2544fac36d63`, defs
checksum `60147a5`→`e56d33a2e46b5644`; tick-3000 golden held. **Decision (Garvin):** keep the 10×
value, make crew self-preserving. **Next: E0-3** (dig/stockpile/strip verbs on the web client —
review the new UI surface first). See `docs/HANDOVER.md` "E0-2" at the top.

## Status snapshot (2026-07-23) — + **wall drag-build & authoritative materials** on top of E0-1
**Wall drag-build + hashed wall/floor materials** landed on `main` (7 commits, each Opus-implemented +
independently Opus-reviewed): RimWorld-style press-drag-release wall/floor building in the Room Zoom
(walls trace the dragged rectangle's perimeter, floors fill it) with a live material-skinned preview,
a 6-swatch material picker (WALL/FLOOR), and built walls/floors now rendered in their chosen material.
Sim: a per-tile hashed `World.Material` byte plane (S1); `BuildKind.Floor` + `PendingBuild.Material`
(S2); view-only `materials` wire channel. Material sets a tile's identity + skin, NOT a differentiated
cost (every build still consumes `Regolith`; floors 1 Regolith/20 ticks, v1 literals). Moved the
scenario/tick-3000/slice pins once (S1's all-zero fold) — see "Determinism proof". Legacy on-map
console drag-build is a fast-follow; see `docs/design/perilune-wall-drag-material.plan.md`.

## Status snapshot (2026-07-23) — economy Wave 0 + the B-bugs + **E0-1 recruitability** landed on `main`
**Read `docs/HANDOVER.md` "E0-1 — labour supply (recruitability)" first, then "Economy Wave 0
— COMPLETE".** **E0-1 (recruitability) is LANDED on `main`** (`c643293`, Opus-implemented +
independently Opus-reviewed PASS): `Citizen.IsIdleForWork` no longer vetoes a wander path, so
wandering crew are offered work and self-serve (measured 6/6 recruited vs 2/6 with the fix
reverted; all 8 slice crew take work at tick 1, was t31), and a new `wander_radius_tiles` def
field (default 8, Chebyshev-bounded sampler) preserves the slice's anti-pile-on desync. It moved
the slice golden (`994aa1ac`→`d93165a4`) and defs checksum (`81ae90b`→`60147a5`); both StateHash
pins held. **Player-control note (decided — Garvin, revisit at E0-3):** an active
`MoveCitizenCommand` order is now interruptible by auto self-serve/work; `HoldPosition` is the
strict-control escape hatch. **Next: E0-2 (10× work-rate rebase + parked movement retune, behind
E0-1 never before it) and E0-3 (dig/stockpile/strip verbs on the web client).**
Below is the still-current Wave 0 record. Economy Wave 0
(behaviour-free plumbing, six packages) is **landed on `main`**, and on top of it the three
**shipping-bug fixes B-1/B-2/B-3** (`ECONOMY.md` §1.5) landed together:
W0-1 hash packs un-aliased · W0-2 `EffectKind` widened · W0-3 `JobsDirty` split into
tile/item/site/citizen flags · W0-4 `JobSystem` split into an `IJobSource` dispatcher ·
W0-5 the `[production]` node table · W0-1b the 13 saved-but-unhashed fields hashed ·
W0-6 four empty economy systems registered (`ZONE`/`PROD`/`ORES`/`TRAD`) · **B-1** the ownerless
reservation leak (`ItemStack.ReservedForJob:bool`→`ReservedBy:uint` owner id; a released stranded
claim) · **B-2** the hydroponics water leak (a self-throttling greywater makeup floor,
`WaterDefs.MakeupFloorLiters`, keeps the food loop alive past day 1.2) · **B-3** the CO2
gas-transport bug (`AtmosphereDefs.DiffusionCoefficient`: partial-pressure diffusion across open
doors reaches the scrubbers; life_support Degraded→Nominal on the slice). Every package was
Opus-implemented + independently Opus-reviewed; the three B-bugs each took **one send-back**
before PASS (legacy-save sentinel / vacuous test / stale doc). Pins re-measured on the combined
tree (see "Determinism proof" below). (E0-1 has since landed on top — see the status snapshot
above; next is E0-2 then E0-3, `ECONOMY-PLAN.md`.)

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
green** via `./ci.sh` *(as of 2026-07-21 — `main` is 979 + 529 today; see "Working here")*.
Live-provider smoke on record ($0.0045, `docs/SMOKE-P2.md`).
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
`./ci.sh` *(2026-07-21 figures — current is 979 + 529)*; all determinism pins unmoved.
**Render WP-0 "a crisp ship stage"** landed
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
- **THE STANDARD SURFACE — build UI on it and nowhere else** (decided 2026-07-25, binding).
  There is exactly **one** standard UI: **`--ship grid`** wearing the **Level-1 Overview**
  (`client/src/ui/overview-view.js`) plus the **Level-2 Room Zoom**
  (`client/src/ui/roomzoom-view.js`). The console `.app` shell in `client/index.html` +
  `client/src/ui/hud.js` is the **old path**: deprecated, scheduled for deletion, and **closed
  to new work** (`hud.js` survives the deletion only as the shared wire-cache/state layer both
  modern surfaces already read). **`--ship slice` is the headless measurement fixture** for the
  economy programme — driven by `hosts/scenario`, no UI, and it needs no face. *Why this is an
  invariant and not a preference:* E0-4's WP-5 built an entire stockpile ACCEPTS filter onto the
  console — implemented, independently reviewed, merged — and nobody noticed the surface was
  wrong until the running game was opened. Mechanised in
  `client/test/surface-boundary.test.js` (verb parity + a `KNOWN_GAPS` ledger that only pays down;
  the console shell's id census **and** four `hud.js` widget counts are pinned by equality — the id
  census alone would have missed WP-5's *first* draft, which added no id) and
  `tests/Perilune.Tests/SurfaceBoundaryTests.cs`
  (every `WireFormat` channel must have a consumer in `client/src/main.js`). Plan:
  `docs/design/perilune-console-retirement.plan.md`.
- **ONE door from the map to a person** (`plan §1.5.4`, owner decision). All crew interaction
  consolidates into a single **Persona window** (design deferred). The entries through which a
  player reaches a crew member are pinned as `CREW_INTERACTION` in
  `client/test/surface-boundary.test.js`: the Persona seam **replaces** `talkSelectedCrew` /
  `openBioForSelected`, it does not join them, and a lane that scatters a second crew-interaction
  affordance onto any surface fails a test. The same assertion pins `SHIP_STATE_REACH` — the exact
  set of `hud.js` symbols a modern surface may reach, which is also the specification for WP-9's
  `hud.js` → `ship-state.js` split.

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

## Traps that have each cost this project real work — read before writing a guard test or a mutation harness

These are not style notes. Each one shipped a **green gate over a broken claim**, and each was
rediscovered at full cost.

### 1. A guard that matches raw source text is satisfied by the thing it guards against, COMMENTED OUT

A test that greps a source file for evidence of a fix will pass when the fix is present **and** when
the fix is sitting in a comment. On **2026-07-25 this landed independently in four packages** — in
**CSS**, in **C#**, and **twice in JavaScript**. Every one of those tests looked correct and passed
its suite.

**The countermeasure, both halves required:**
1. **Strip comments before matching, quote-aware** so string literals survive (a quoted `//` or
   `/* */` must not blind the stripper and swallow the rest of the file). Live implementations to
   copy, not re-derive: `client/test/surface-boundary.test.js:205` (JS, `codeOnly`) and `:264`
   (HTML `<!-- … -->` — a commented-out `<div` also corrupts a depth tracker),
   `client/test/relations-view.test.js:45` (JS) and `:78` (CSS),
   `tests/Perilune.Tests/SurfaceBoundaryTests.cs:82` (`CodeOnly`, C#/JS).
2. **A negative control proving comments do NOT trip the scan** — otherwise the guard fires on prose,
   which teaches people to delete explanatory comments to appease a test. Examples:
   `client/test/surface-boundary.test.js:967`, `:985`, `:1004`, `:1013`;
   `tests/Perilune.Tests/SurfaceBoundaryTests.cs:238-253`.

The general form of this defect — **a test whose named mutation cannot bite** — is the single most
common review finding in this repo. E0-4 produced **six** of them; every E0-4 and E0-5 work package
failed its first independent review on one. **Physically apply every mutation you name, watch it go
red, and revert.** A mutation you only *described* is not evidence.

### 2. `git checkout` must NEVER appear in a mutation loop

It has cost this project work **twice**: once destroying an uncommitted test written by an earlier
session, once discarding an agent's own in-flight edits. `git checkout -- <file>` restores the *last
commit*, not the state you were in — so any uncommitted work in that file is gone, silently.

**The rule that prevents it: the restore source is an in-memory copy taken BEFORE the first
mutation.** Read the file into a variable (or a `.orig` sidecar outside the repo), mutate, restore
from that copy. Never from git.

**And restore with `shutil.copy` + `os.utime`, never `shutil.copy2`.** `copy2` preserves mtime, so a
restored source looks *older* than `bin/`, MSBuild skips the rebuild, and the next `dotnet test`
silently runs the **previous** mutation's assembly. This presented as a reproducible 3-test
regression that passed when the tests were run individually. Delete `bin/` + `obj/` when in doubt.
The same shape bites the scenario host: `dotnet build tests/Perilune.Tests` followed by
`dotnet run --no-build --project hosts/scenario` runs a **stale scenario binary**, so a mutation can
look inert when it is not.

### 3. Two shell traps that produced findings out of nothing

- **An unquoted `$flags` in a loop** made three "stockpile" measurement legs run **flagless**, and
  they produced baseline-identical output that looked like a real finding.
- **A grep with no non-vacuity check** is the same defect: assert your matcher matches *something*
  before you believe that it matched nothing.

## Working here
- Tests: `~/.dotnet/dotnet test tests/Perilune.Tests --nologo` (`./ci.sh` runs the full
  gate — dotnet + node, ~8 min wall since V6 runs real sim-days; the dotnet stage alone
  is ~6.5 min). Counts move with every
  lane and are re-measured per commit; **re-measure before quoting**. **Measured on `main`
  @ `7d24ff5` (2026-07-25): 979 dotnet + 529 node, `./ci.sh` exit 0.** Every "560 dotnet + 188
  node" below is a 2026-07-21 historical figure, true only of that date — do not quote it as
  current. Per-branch counts measured in isolation **do not add on merge**: E0-4's five side
  branches read 918–928 apiece and the merged lane read 943 passing of 946: three tests that
  passed on every branch **failed once the packages met** (see "Determinism proof" and `docs/HANDOVER.md`).
  Golden rewrite only when intended: `UPDATE_GOLDEN=1 ... --filter ...`, say why.
- Determinism proof — **FIVE pins, all gate-enforced as of 2026-07-25**, not four:

  | pin | value | enforced by |
  |---|---|---|
  | scenario `--days 3 --seed 42` | `00e0a2dadb8e5076` | `ci.sh:31` (also twin-run equality) |
  | tick-3000 golden | `4be2e77864fb7409` | `tests/Perilune.Tests/Golden/perilune_tick3000_hash.txt` |
  | slice tick-3000 golden | `1f8f2225ee568de9` | `Golden/slice_tick3000_hash.txt` |
  | defs **defaults** (`SimDefs.Default.Checksum`) | `5a471d12643b64f9` | `DefsChecksumTests.cs:69` |
  | defs **rules-inclusive** (the host's `defs:` print) | `3f23ce5bd40283c8` | `DefsChecksumTests.cs:146` |

  Run it with `~/.dotnet/dotnet run --project hosts/scenario -- --days 3 --seed 42`. Adding hashed
  state moves a pin ⇒ update `ci.sh` + here + `MECHANICS.md` + memory in the SAME commit.
  **The last two rows are new on 2026-07-25 and matter more than they look.** The
  rules-inclusive value had **never** been pinned, and the defaults value `5a471d12643b64f9` was
  asserted **nowhere in the repo** — `DefsChecksumTests` only checked internal consistency — so every
  "all four pins hold" claim written before today rested, for that one pin, on a *printed* value
  rather than an enforced one (found by the economy-modularity audit,
  `docs/design/perilune-economy-modularity.md` §0.2). The two are **different values for different
  things** and have been confused repeatedly: `3f23ce5bd40283c8` is what every occupancy run prints
  at the top of its output; **never paste it into the defaults pin.** Both are now asserted by name.
  **Last mover: E0-5** (deconstruct/strip) for the first four. **E0-4 moved nothing** — no hashed
  field, no def scalar, and its whole measurement surface is opt-in host-side flags. Before that,
  **E0-2** (work-rate rebase 10× + movement retune `ticks_per_tile` 5→10 +
  a crew-safety `SafetySystem`/`JobKind.Flee` guard) was the last REAL behaviour
  change (human-pace crew, minutes-long watchable work): it moved the scenario hash
  (`a53d8505`→`85ac8c44233284e9`), the slice golden (`9a84a72f`→`8c6b2544fac36d63`) and the defs
  checksum (`60147a5`→`e56d33a2e46b5644`, the changed work-rate defs + the new `flee_suffocation`
  field); the tick-3000 golden held (`9b834cffc232ce7f` — the default ship's 2 crew neither move
  nor work within 3000 ticks). Earlier movers off the `494ad0b0 / 0f66ffdf / 994aa1ac` base:
  **E0-1** (recruitability) moved the slice golden (`994aa1ac`→`d93165a4`) and the defs
  checksum (`81ae90b`→`60147a5`), holding both StateHash pins; then the **wall-drag +
  authoritative-materials** feature added a per-tile `World.Material` byte plane folded last into
  `HashInto` (an all-zero fold, zero behaviour change), moving the scenario hash
  (`494ad0b0`→`a53d8505`), the tick-3000 golden (`0f66ffdf`→`9b834cffc232ce7f`) and the slice
  golden again (`d93165a4`→`9a84a72f`); its `BuildKind.Floor` + `PendingBuild.Material` were
  pin-neutral. (The three B-bugs
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
  to `494ad0b0` / `0f66ffdf` / `994aa1ac` — the first move that is a real behaviour change, not a
  fold: gas now crosses open doors, and its new `diffusion_coefficient` def moved the defs checksum
  `08b73814d97c7be3` → `81ae90bdd049f745`. Still only the two tick-3000 goldens moved. From that
  base the chain runs E0-1 → wall-drag/materials → E0-2 → E0-5 → **today's table above**.
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
