# HANDOVER — PERILUNE (2026-07-22, P2 complete + playtest rounds 1–4 + Console UI rebuild + RELATIONS tab + the mechanics reference + MOSS terminal + the economy redesign + **economy Wave 0 COMPLETE (`main` merged in)**, tag `v2-talking-ship`)

## AAA UI-polish programme — 2 waves MERGED to main (2026-07-23)

On top of the warm SVG rework, an AAA polish pass landed in two reviewed, `ci.sh`-gated waves — pin
`494ad0b05a154ccb` **UNMOVED** (view-only/client + one additive view-only wire field; the regolith
count is derived, not hashed). Each package was Opus-implemented + independently Opus-reviewed clean.

- **Wave 1 — `lane/ui-polish` (merge `edfc870`)**: six shipped-UI fixes on the two-level Overview.
  (1) PAUSE chip toggles a loud `▶ RESUME` state (was an invisible text-only swap); (2) SPEED is now
  an interactive `« value »` stepper (was a dead read-only chip — no handler existed in the new UI);
  (3) idle caution reads `SYSTEMS NOMINAL` + tooltip and the chip is a button → MOSS; (4) the LLM
  backend chip restored on the Overview (`◈ BACKEND`, fed by `hud.getLlm`); (5) the ~300px BIO card
  rebuilt into a large crew **DOSSIER** (identity/NEEDS/STANDING/PERSONALITY/RELATIONSHIPS/BACKSTORY/
  MEMORIES/LOG — real fields live, not-yet-wired sections wear a `◇ SAMPLE` badge; no skill/injury
  model, the sim has neither); (6) ESC now closes the DOSSIER (new `dossier` rung in `escapeTarget`).
- **Wave 2 — `lane/first-impression` (merge `ba3ba8a`)**: two roadmap P0s. A **STORES chip** —
  the host emits loose build-material on the `metrics` wire (`WireFormat.Metrics` additive optional
  `regolith`; `MaterialNote` shares `LooseMaterialUnits()`) and the top bar shows `◆ REGOLITH N`,
  red/blink at 0 (fixes the "starved wall ghost with no HUD reason"). And **boot onboarding** —
  `client/src/ui/onboarding.js`, a one-time localStorage-gated intro ("Your crew are people." +
  TALK/BUILD verbs + controls ref) plus a persistent `?` reopener = the game's only help surface.

**The roadmap:** `docs/design/perilune-user-journey-review.md` — a 5-agent journey audit (onboarding ·
build/economy · crew · systems/MOSS · nav/IA) with a cross-journey P0/P1/P2 backlog. Verdict: "the
pieces meet a AAA bar; the product doesn't yet" — silence (onboarding), invisibility (sim models more
than the UI shows), dead ends (alarm/log/lens connect to nothing). **Next best steps (unshipped):**
the closed diagnostic loop (chip→MOSS-focused-on-fault + actionable faults), decouple the master alarm
from the unfixable CO₂ condition, and **widen the `citizen` wire to make the DOSSIER's `◇ SAMPLE`
sections live** (data already in `sim/Sim.Core/Citizens/*`, outside `StateHash` → determinism-safe).

## Warm SVG visual/UI rework — COMPLETE (2026-07-23), parallel programme

A second programme landed on `main` alongside the economy work: the **warm SVG visual/UI
rework** — a from-scratch two-level ship UI that supersedes the cold "derelict" WebGL look.
Design authority + plan: `/Users/garvin/.claude/plans/we-have-to-do-eager-pebble.md`,
`docs/design/perilune-art-direction-warm.md`, `perilune-overview.*`, `perilune-roomzoom.*`,
`perilune-wire-channels.spec.md`, `perilune-item-mapping.md`, and the five imported
`.dc.html` mocks. **Pure SVG everywhere** (no Gemini raster; the WebGL renderer is *parked*,
its goldens byte-identical). Orchestrated autonomously, every artifact Opus-implemented +
independently Opus-reviewed (incl. headless-Chrome visual gates).

**What shipped (Phases 0–5, all merged, each behind its own reviewed lane):**
- **P1 SVG asset layer** — `client/src/theme/warm-tokens.js`+`warm.css` (palette/ROOM_MATERIAL/
  ROLE_HUE), the 60-piece parametric item library `client/src/items/*`, front-facing pawns
  `client/src/render/pawn-svg.js` (in-world + roster chip; retires raster crew portraits).
- **P2a grid ship** `--ship grid` (`AuthoredShips.PeriluneGrid`, `SlotGridPlanner`,
  `ShipPlan.SlotGrid` — authoring/view-only, NOT hashed): depth 8, all decks present, deck 0
  furnished / deck 1 half / decks 2–7 empty "halls". Pinned `slice`/`Perilune` untouched.
- **P2b view-only wire channels** `decks`/`rooms`/`decor` (`WireFormat.cs` spine-additive; host
  derives occupied/active/anchorName from live `RoomState`; client decode + `decks-model.js`).
- **P3 Overview** (Level 1) — `overview-scene.js` (pure SVG deck schematic; glow-pools keyed on
  `occupied`, not `active`) + `overview-view.js`/`overview-model.js`: **the default SHIP surface
  when the `decks` channel is populated**, warm floating HUD, click→scene-CTM-invert→`Cmd`. Parks
  the WebGL canvas; `--ship slice` keeps the legacy tile view.
- **P4 Room Zoom** (Level 2) — `roomzoom-view.js`/`room-model.js`/`deck-minimap.js` (click a room →
  detailed warm build/decorate room) + `PlaceDeviceCommand`/`RemoveDeviceCommand` (furniture,
  whitelisted; rides existing hashed Device state).
- **P5 `AddRoomCommand`** — commission an empty hall into a live typed room (SetAnchor re-type +
  door open + Pressurize; no new hashed field) + the Overview ＋ADD ROOM room-type picker.

**Determinism:** the seed-42 pin **`494ad0b05a154ccb` is UNMOVED** by the entire rework (every lane
view-only/content/isolated-sim). Counts on `main`: **807 dotnet + 461 node**.
**Playtest fixes (2026-07-23, all live-verified on `--ship grid`):** #1 HUD *flicker* — the Overview
rebuilt every HUD island via `innerHTML=` ~5–10 Hz, tearing down the button under the cursor and
eating clicks; fixed with keyed in-place reconciliation (the `hud.js reconcileRows` pattern). #2
*older systems felt broken* — was mostly #1 eating clicks; also restored the click-a-map-terminal →
MOSS affordance. #3 *couldn't build* — the grid ship shipped with **zero regolith** and held crew, so
wall ghosts starved; seeded regolith + made crew workable in `PeriluneGrid` (a wall now builds ~tick
257). **Round 2:** the Room Zoom had the *same* per-frame `innerHTML` rebuild (I fixed the Overview
but missed Room Zoom) — flickered on placing furniture and ate the ‹ back click; fixed with the same
keyed reconciliation (palette/breadcrumb/minimap stable; ‹ and ESC both exit). The CHRONICLE command-bar
tab is now inert-but-present (was dumping to the legacy console). Both new interactive views
(Overview + Room Zoom) now reconcile in place — no button flickers or eats clicks. Pin still
`494ad0b05a154ccb`. **Play it:**
`~/.dotnet/dotnet run --project hosts/web -- --port 8330 --ship grid` + `python3 client/serve.py`.
**Deferred (honest):** in the Overview, the RELATIONS/MOSS/CHRONICLE tabs delegate to the existing
console surfaces (v1); the `decor` channel is wired but empty (no authored decor yet); built-wall
demolish is a no-op; large grid rooms read a touch sparse (content/polish). Memory:
`warm-svg-rework-state.md`.

---

> **Newest first, and this is where you start:** read **"Economy Wave 0 — COMPLETE,
> START HERE"** immediately below. Wave 0 is the behaviour-free plumbing that must land
> before any economy lane spawns; **all six packages are merged on `lane/economy-w0`, and
> `main` is now merged into the branch** (bringing playtest round 4, the render light-pools
> + movement fixes, and the **MOSS terminal** — COMPLETE on `main`, spec
> `docs/design/perilune-moss-terminal.spec.md`). After that, "The economy redesign" explains
> *why* (design authority `docs/ECONOMY.md` + `docs/ECONOMY-PLAN.md`), "Playtest round 4"
> then "round 3" are the newest *landed* state, and `docs/MECHANICS.md` is the authority on
> how the sim actually behaves (its §13 lists what is wired but not connected).

## Economy Wave 0 — COMPLETE, START HERE (2026-07-22)

**Wave 0 (all six packages) is LANDED on `main`, and on top of it the three shipping-bug fixes
B-1/B-2/B-3 (`ECONOMY.md` §1.5) are LANDED too** (2026-07-23). Combined gate on `main`, measured
after integration: **`./ci.sh` exit 0, twin hashes MATCH**. Pins re-measured on the combined
tree (all three B-bugs move pins off the same base, integrated in one pass):

| pin | value | pre-B-bugs |
|---|---|---|
| 3-day scenario (`ci.sh`) | `494ad0b05a154ccb` | `616ed4a84a9f6e87` |
| tick-3000 golden | `0f66ffdf9f90f766` | `3cf25daf3ca40e0b` |
| slice tick-3000 golden | `994aa1ac661aa1cc` | `72f7023ef9f1cd73` |
| defs checksum | `81ae90bdd049f745` | `08b73814d97c7be3` |

Every package was Opus-implemented and independently Opus-reviewed; **the three B-bugs each took
one review send-back before PASS** (B-1 a legacy-save sentinel that reintroduced the leak, B-2 a
vacuous survival test, B-3 stale MECHANICS prose + a vacuous vacuum test — the review method
catching the author's blind spot every time). **Next: the E-lanes spawn — E0-1 recruitability
first (`ECONOMY-PLAN.md`).** Everything below is the historical record of how Wave 0 and the
B-bugs went.

**How it got here (record):** Wave 0 was cut from `main` @ `3efd181`; `main` advanced 35 commits
(MOSS terminal, render, movement, Ollama, art rev 2, playtest round 4); the branch merged `main`
in twice (re-measured pin-neutral each time) and landed at `7f67f2a`. The three B-bugs were then
built as parallel Opus worktree lanes off `7f67f2a`, each independently reviewed, and integrated
onto `main` in one pass with a combined re-pin. The eight `ECONOMY-PLAN.md` corrections were
folded in during Wave 0.

### State of the six Wave 0 packages

| pkg | what | status | pin |
|---|---|---|---|
| W0-1 | un-alias the citizen + item hash packs | **merged**, 2 review rounds | moved |
| W0-2 | widen `EffectKind` `byte`→`ushort` | **merged**, 2 review rounds | neutral, proven |
| W0-3 | split `JobsDirty` into tile/item/site/citizen | **merged**, 1 round + F1 test | neutral, proven |
| W0-4 | `JobSystem` (842 lines) → `IJobSource` dispatcher | **merged**, 3 review rounds | neutral, proven (twice — see below) |
| W0-5 | the `[production]` node table | **merged**, 3 review rounds | neutral, proven |
| W0-1b | hash the 13 saved-but-unhashed fields | **merged**, 2 review rounds | moved |
| W0-6 | register the four economy systems empty | **merged**, 1 review round | moved |

**ALL SIX MERGED, and `main` is now merged into the branch. Final gate (`lane/economy-w0`
with `main` folded in), measured 2026-07-22: 786 dotnet + 356 node green, `./ci.sh` exit 0,
`determinism: twin hashes MATCH (616ed4a84a9f6e87)`.** (B-3 later moved this to
`494ad0b05a154ccb` — see the pin table.) The pre-`main`-merge branch gate was
713 dotnet + 207 node; `main` added 73 dotnet + 149 node (the MOSS terminal / render / Ollama
surface) and moved no pin.

Pins as they stand after the **B-1/B-2/B-3 shipping-bug fixes** landed together (2026-07-23).
All three move pins off the same base and were integrated in one pass, then re-measured as a
combined tree (`ci.sh` and the two golden files agree):

| pin | value | pre-B-bugs |
|---|---|---|
| 3-day scenario (`ci.sh`) | `494ad0b05a154ccb` | `616ed4a84a9f6e87` |
| tick-3000 golden | `0f66ffdf9f90f766` | `3cf25daf3ca40e0b` |
| slice tick-3000 golden | `994aa1ac661aa1cc` | `72f7023ef9f1cd73` |
| defs checksum | `81ae90bdd049f745` | `08b73814d97c7be3` |

What each bug moved (all real behaviour changes, not pure folds): **B-1** (reservation owner)
moves the slice golden only — a staged crafting input the slice used to strand forever is now
released. **B-2** (greywater makeup floor, `WaterDefs.MakeupFloorLiters`=20 L) moves the
scenario hash and the shipping tick-3000 golden — the floor fires as the pool runs dry (at the
first Water tick on the un-primed 2-crew reference ship). **B-3** (CO2 partial-pressure
diffusion, `AtmosphereDefs.DiffusionCoefficient`=0.5) moves all three sim pins plus the defs
checksum — gas now crosses open doors so the hash inputs genuinely differ.

W0-3 landed pin-neutral (it *proved* the optimisation fires — an item-only `AddItem` no
longer walks the O(W·H·D) tile pass — while assignments stay byte-identical; it also shipped
the F1 positive haul-assignment test that converts the whole missed-rescan class from
invisible-to-CI to caught). W0-6 moved all three pins by registering four empty stateful
systems (`ZONE`/`PROD`/`ORES`/`TRAD`; their checksum seeds fold unconditionally) and shipped
the old-save compat test §3.3 required. Pre-W0-6 values were `ffefe9a9a42d8e7e` /
`6071adb8fa781440` / `ab47cefd840247c4`. **Wave 0 is closed; the next pin move belongs to
E0-2 (the work-rate rebase) or the first E-lane that adds hashed state. The `main`-merge is
done and re-measured (pin-neutral); the next re-measure is on `main` itself after the
integrator lands the branch. Never carry a literal forward.**

### W0-4's neutrality is now proven a second way — the whole point of adding W0-1b

W0-4 merged **before** W0-1b on this branch. W0-1b measured its slice golden
`ab47cefd840247c4` on a branch that did **not** contain W0-4. The five-package integration
branch contains both, and its `Slice_Tick3000_StateHash_IsStable` produces **exactly
`ab47cefd840247c4`** (verified 2026-07-22). So adding the dispatcher refactor to a fold that
can finally *see* path state changed nothing. Combined with the fold-independent 66-assignment
sequence pin (assignments byte-identical to pre-refactor code), W0-4 is neutral **both** ways:
identical assignments, and an unmoved pin on the one fold that was blind to routing before.
This retires the "prove it" that was unprovable when the wave started.

### Two deviations from `ECONOMY-PLAN.md` §0, both deliberate

1. **W0-4 ran before W0-3.** Both own `JobSystem.cs` so they cannot be parallel, and the
   dirty-flag split maps far more naturally onto per-source rescan responsibility than onto
   the monolith. W0-4's report contains a **worked recommendation for W0-3** — read it
   before starting: gate the dispatcher's single world tile pass on `TilesDirty` alone (a
   two-line change that kills the `AddItem`-forces-full-rescan hazard with **no source
   edits**), then pass a `[Flags] JobBoardDirty what` argument through `IJobSource.Rescan`
   rather than adding `RescanItems`/`RescanSites` members — the per-source derivations are
   genuinely not separable (`HaulJobSource` needs tiles *and* items; `BuildJobSource` needs
   pending *and* citizens *and* items). Also: the tile pass must run before any source's
   `Rescan` (asserted only by a comment today), `CandidateCount` must stay honest across a
   partial rescan because it is *behaviour* not an optimisation, and no dirty flag is
   proposed for "a citizen changed job" — either add a fourth or document that the citizen
   pass always runs.
2. **W0-1b was added to the wave** (a third pin move against a budgeted two). It hashes 13
   saved-but-unhashed fields; `Path`/`PathIndex`/`MoveCooldown` were **live tick state
   hashing equal**, so W0-4's "neutral — prove it" was literally unprovable and **E0-1**'s
   whole content (redefining `HasPath` = `PathIndex < Path.Count`) had no canary. It found
   four more fields on review (`NextEntityId`, `RoomAnchor.Name`, two MOSS `ScriptEntry`
   fields) and located the `RemapGas` reload-drift bug (below). A hard prerequisite, done.

### What is left, in order — START HERE for the next session

**Wave 0 AND the B-1/B-2/B-3 shipping-bug fixes are all LANDED on `main`** (2026-07-23). Steps
1–3 below are DONE (kept as record); the live next step is step 4, the E-lanes.

1. **DONE — `main` merged into `lane/economy-w0`, re-measured, and landed on `main`.** `main`
   had advanced 35 commits since the cut (the MOSS terminal programme, render light-pools +
   movement fixes, Ollama merge `15a0b7b`, art rev 2, playtest round 4). Conflicts were doc-only
   (no sim source on both sides). The pre-B-bug landed gate was 786 dotnet + 356 node, pin
   `616ed4a84a9f6e87` (the `main`-merge was pin-neutral); the B-bugs then moved the pins to the
   combined values in the pin table above.
2. **DONE — the eight `ECONOMY-PLAN.md` corrections** were folded in during the wave, each
   measured and reproduced by a second agent.
3. **DONE — B-1 / B-2 / B-3** (`ECONOMY.md` §1.5) landed together as three `--no-ff` merges + one
   combined re-pin: **B-1** ownerless reservation leak (`ReservedForJob:bool`→`ReservedBy:uint`),
   **B-2** hydroponics water leak (self-throttling greywater makeup floor), **B-3** CO₂
   gas-transport (partial-pressure diffusion across open doors, which E1's finite air reserve
   required first). Each was Opus-implemented + independently Opus-reviewed, one send-back each.
4. **NEXT — the E-lanes spawn, E0-1 recruitability first.** It is the hard prerequisite for
   everything, and it now *has* a canary: W0-1b hashed the path fields, so a routing change is
   finally visible to the pin (before W0-1b it was not). E0-2 (the 10× work-rate rebase +
   parked movement retune) lands *behind* E0-1, never before — measured, the retune alone
   costs 29 % of production and halves recruitability.

**Process note for the next integrator (learned this session): the machine is shared by
multiple Claude sessions.** A background `ci.sh` waiter that does `pgrep -f "dotnet test"`
will match *another session's* test run (and often its own shell), so it hangs forever — two
lane agents got stuck this way and had to be told to run their gate **foreground**. Brief
implementer agents to run `./ci.sh` foreground, or verify their gate yourself as integrator.
Also: `git status` showing files you did not touch means you are sharing a tree — stop and
look, never `git add -A`.

### The measurement that should change how you think about this codebase

Instrumented on the pre-refactor `JobSystem`, on the pinned 3-day scenario:

```
INSTR TryAssignCalls=10365760 Dig=0 Haul=0 BuildHaul=0 Build=0 Progress=0
```

**10.4 million dispatch calls, zero job assignments** — every one returns at the empty-board
guard. `perilune_tick3000_hash.txt` likewise reaches zero. `slice_tick3000_hash.txt` reaches
**48 `Dig` only**. So **no determinism pin in this repository constrains haul, build-haul or
build assignment, the cross-source argmin, registration tie-breaks, backoff timing, or the
reservation fan-out.** `tests/Perilune.Tests/JobDispatchTests.cs` is the *only* thing that
does — it is load-bearing in a way its filename does not advertise, and the next person to
"simplify" a job source will assume otherwise because `ci.sh` is green. This is
`ECONOMY-PLAN.md` §5.3's A9 warning confirmed empirically; **A9's slice-based economy canary
closes the gap for free**, and until it lands, treat `JobDispatchTests` as a pin.

### Corrections to `ECONOMY-PLAN.md` and `ECONOMY.md` — all measured, none yet applied

**These are integrator-owned edits still outstanding. Apply them before the E-lanes spawn.**

1. **§5.1's hash-honesty claim is false.** It says a per-field mutation table "would have
   caught both W0-1 bit-aliases". It would not: against the old fold, mutating `ItemKind`
   4→128 still moves a bit, so that row **passes**. A single-field table finds *dropped* and
   *truncated* fields; only a **collision pair** (two distinct states built to hash equal)
   finds an *alias*. Reproduced twice, independently. §5.1 should read "a per-field mutation
   table **plus**, for any field sharing a word with another, an explicit collision-pair
   test." `StateHashHonestyTests.cs` ships both shapes and is the template.
2. **§3.2's "the defs checksum is unmoved" is false for scalar fields.** Appending a fold
   for a field whose shipped value equals its compiled default still moves
   `CreateDefault().Checksum` — measured `08b73814d97c7be3 → 18c26618041a5e0a` with all 30
   defs tests green. Shipped-equals-default guarantees *parsed == default*, not *default ==
   yesterday's*. W0-5 is neutral only because it made its fold a no-op on an empty table
   (the `RuleDef` precedent). Every def-field lane should budget for a moved defs checksum
   and a `SaveReader` warning on pre-existing saves.
3. **§4.5's "stamp arrays are indexed by store position" is wrong** — they are indexed by
   **board** position. The real hazard is not "removing items during a scan", it is **any
   rescan between `Select` and `TryClaim`**, which is exactly the shape an extraction source
   refreshing its ore board would reach for. `IJobSource.cs` now states it correctly, so the
   plan is the odd one out. Fix before three lanes copy the pattern.
4. **§4.4 understates `Pack(Int3)`.** Not just "aliases on negative coordinates and breaks
   past 2^20": X occupies bits 0–31 **unmasked**, so X↔Y alias from bit 20, Y↔Z from bit 40,
   and z truncates above 2^24. *Any* single negative coordinate is `0xFFFFFFFF` and floods
   all three fields. Also "reuse the one shared helper" is misleading advice — **the shared
   helper is the defect**; it should read "reuse it *and* fix it to masked 21/21/6 fields
   before any lane grows the ship".
5. **§3.1's five-site pin ritual is wrong twice.** `CLAUDE.md` has **two** pin sites,
   `MECHANICS.md` has two plus `file:line` cites, and the two golden `.txt` files are a
   further site the list omits. And the fifth named site — auto-memory — **contains no pin
   literal at all**, so it is vacuous as written. Replace the list with
   `grep -rnE '\b[0-9a-f]{16}\b' docs CLAUDE.md ci.sh tests`, which cannot go stale. (It
   already caught two stale pins the hand list missed.)
6. **§3.5 says zero-alloc is asserted "in seven test files"** — it is eight now.
7. **§5.1's mandatory set is not universally applicable.** W0-4 adds no hashed or serialized
   state, so save round-trip, tick-1000 re-compare, def-field, defs-checksum and de-DE items
   are all N/A there. Say so, or reviewers score packages against gates they cannot fail.
8. **§4 trap 10's mechanism is imprecise.** `float.Parse("0.5")` yields 5 under de-DE only
   because its *default* styles include `AllowThousands`. With an explicit
   `NumberStyles.Float`, `"0.85"` under de-DE does not parse as 85 — it **fails to parse**.
   Same hazard, different symptom, and the symptom is what people search for.
9. **`ECONOMY.md` §10's per-unit loss figures are not expressible in an integer item
   model — DECISION PARKED FOR GARVIN, see below.**

### Decisions parked for Garvin

**§10's loss figures must be restated as integer ratios.** W0-5 originally shipped a float
`yield` column; with flooring, `floor(n·y)/n = y` only when `n·y` is integral, so 0.85 needs
batch multiples of **20** and §10's 0.93 reclaimer needs **100**. The shipped example
advertised 0.85 and actually delivered **75 %**, and one node-level yield gave *different*
effective efficiencies per output port (50 % and 66.7 % from a declared 85 %). **I made the
container call**: the float column is gone; loss is the integer input:output ratio
(`Scrap:20 → Regolith:17` **is** exactly 85 %). This is exact, culture-free, float-free,
deletes determinism traps 7 and 10 from that table, and makes the closed-mass axiom
checkable at parse. **What is NOT mine and is still open: renumbering `ECONOMY.md` §10's
efficiencies to ratios.** `ECONOMY.md` is the design authority and Garvin approved those
numbers; someone must decide the batch granularity (a coarser ratio may be better design
than a faithful 100:93). **Nothing in E0 depends on it** — the table ships empty.

**Also worth Garvin's eye:** the reshape moves cost onto logistics. `AllInputsStaged` is
all-or-nothing and `StepFetch` carries one stack per trip, so `Scrap:20` stages twenty units
before a batch starts — ~5× the round-trips of `Scrap:4`, landing directly on the labour
budget A1 measures. Documented in `production.def` and §13.12, but it is a design
consequence, not just an implementation note.

### New packages discovered during Wave 0 — none started, all justified

| pkg | what | why | cost |
|---|---|---|---|
| **`Pack(Int3)` masking** | mask to 21/21/6 and de-duplicate the helper (`Simulation.cs:351` and `BuildSystem.cs:230` are character-identical copies) | any negative coordinate floods all three fields; z corrupts `RoomAnchor.Type` above 2^20 | pin move |
| **`RemapGas` idempotence** | `RoomState.Recompute` is not gas-idempotent; a load leaves `Dirty = true`, and `RemapGas` (`Rooms/RoomState.cs:322-340`) rebuilds room moles as a sum of per-tile shares, so recomputing an *unchanged* partition perturbs O2/CO2/N2/T at ~6e-15 relative | **a plain save→reload is not bit-exact today.** This is the long-known "thermal ULP drift" — it was never just thermal, it is all three gases, and the cause is now located. A player who saves and reloads gets a slightly different ship, forever | pin move, behaviour change |
| **`RoomType` 17th row** | `Type` has 4 usable bits at 60–63 and `RoomType` already declares exactly 16 members | the 17th silently folds onto `None` | pin move |
| **`SaveReader` enum validation** | `SaveReader.cs:254` reads `JobKind` as an unvalidated byte | a corrupt byte is silently ignored; the error should name the *save*, not surface as an array index 30 frames later | small |

### Process notes that earned their keep

- **Four of six packages were sent back at least once** — exactly the rate `ECONOMY-PLAN.md`
  §6.3 predicted. Budget for it.
- **Independent review found what self-review could not, every single time.** The clearest
  case: W0-2's author shipped two passing width tests, and the reviewer applied the exact
  defect the package existed to prevent — a `(byte)` cast at **both** shipped producers of
  `CitizenEffectAppliedEvent.Kind` — and got **611/611 green**. The tests pinned the
  consumer side and stepped straight over both producers.
- **Fixes introduce the defect class they fix.** Happened twice: W0-5's second-node warning
  had an overlay-retarget hole, and W0-4's `bestDist` guard silently invalidated one of its
  own round-1 named mutations. **Re-review every fix round.**
- **Named mutations go stale like any other documentation.** Requiring the reviewer to
  *apply* them (§5.2.5) is what caught that.
- **Both sides push back and both are sometimes right.** Implementers corrected the plan on
  §5.1, §3.2 and §10; reviewers corrected implementers on bit arithmetic, test honesty and
  scope. Two agents independently reproduced each doc correction before it was adopted — do
  not let a design correction propagate on one agent's say-so.


For the next session. Read `CLAUDE.md` first, then this top to bottom. Design intent
lives in `VISION.md`, mechanism in `ARCHITECTURE.md`, phasing/lanes in `PLAN.md`;
moonbase-era mechanism detail (save format, tick model, MOSS, atmosphere math) is
still authoritative in `legacy/TDD.md` + `legacy/TUI.md` where not superseded.

## The economy redesign (2026-07-22) — START HERE

**Status: design complete, approved end-to-end by Garvin, ZERO code written.** The next
agent's job is to start executing it. Read `docs/ECONOMY.md` §1 first — it is a measured
indictment of the shipped economy — then `docs/ECONOMY-PLAN.md` §0 and §8.

**How it was produced.** Five independent read-only review lanes (current-economy audit,
logistics & labour, comparative genre design, external supply, architecture & invariant
cost), each forbidden from editing the repo, each measuring against the real host stack
rather than reading docs. Their reports are session scratchpad only; everything load-bearing
was folded into the two documents. The round-3 method — read-only diagnosis first, fix lanes
briefed with verified findings — was used deliberately and worked again.

**What they found (all MEASURED on the shipping slice, not inferred).**

- The material economy is **dead at sim-minute 64**. 48 debris tiles cleared by tick 1,416;
  last Regolith consumed at tick 38,451. Three walls designated at tick 3,000 build in 73 s;
  the same three designated at day 1 sit at **0/6 forever**. The player's only economic verb
  is functional for about an hour and then *impossible*, not merely slow.
- **The labour ledger is worse than the mass ledger.** 0.503 % of crew-ticks are economic
  work over 3 days; **79.8 % is random wander-walking**; all three haul `JobKind`s log
  **exactly 0 ticks**. `IsIdleForWork` requires `!HasPath` (`Citizen.cs:63`), so a wandering
  citizen is unrecruitable by all four dispatchers — **the effective crew is 1.43 of 8**.
- **The decisive number:** priced at today's work rates the *fully built* economy consumes
  **0.7 %** of the labour budget. No quantity of new item kinds fixes that. Order of
  operations is labour supply → work rates → matter.
- **Three live bugs on the shipping build**, none of them design questions:
  1. An **ownerless reservation leak** (`CraftingSystem.cs:183`) permanently strands the
     slice's last `Parts` — invisible to `FindNearestParts` but visible to `StagedUnits` — so
     **every machine repair for the rest of the game is a jury-rig at 0.6**. Root cause:
     `ReservedForJob` is a `bool` where it needs an owner id.
  2. **Hydroponics destroys 0.256 L per litre irrigated** → 903 of 1,400 L gone in 28 h →
     food production permanently dead on **day 1.2**, while the HUD food bar reads 1.00.
  3. CO₂ gas transport (already on record below).
- Two **latent** hash defects, harmless today and fatal later: the item pack aliases
  `ItemKind`'s high bit onto `ReservedForJob` (`Simulation.cs:272-275`) and the citizen pack
  overlaps `JobWorkTicks` with `CarryingItemId` (`:255-260`). Not determinism breaks —
  **canary blindness in exactly the fields an economy stresses.**
- **`NavSystem` is fully built, saved, hashed, ten tests — and provably inert.** No ship
  generator or authored ship ever places a `Telescope`, so `Tick` returns early every tick.
- **CI never exercises the material economy at all** (the 2-crew ship has zero designations
  and `HoldPosition` crew). That is how a 64-minute economy shipped unnoticed.

**The design, in one sentence.** A closed mass ledger with the voyage as its only faucet,
where the efficiency of every conversion is a fact held in a living person's head — *"what
will you take apart, who still knows how, and what does it cost to keep what you already
have?"*

**Decisions Garvin has already made** (full log, `ECONOMY.md` §13 — do not reopen without
editing that list): 10× work-rate rebase · sleep, in E1 · **the full programme E0→E4**, not
a staged approval · a slice economy canary enters CI · `Regolith` → `Stock` presentation
rename (enum row 0 never renumbered) · fix the three live defects immediately. Also on
record: a **trading-hub DLC** is planned, so `ECONOMY.md` §9.7 specifies the seven seams the
base game must leave — and the one trap, that a hub is a *converter that takes a cut*, never
a faucet. The only deferred question is the hub's currency shape, and nothing in E0–E2
depends on it.

**Where the next agent actually starts.** `ECONOMY-PLAN.md` §0 and §8. The opening wave, in
order:

1. **Wave 0** — six integrator-owned commits, two pin moves, behaviour-free: un-alias the two
   hash packs · widen `EffectKind` (2 bits left) · split `JobsDirty` · **refactor `JobSystem`
   into an `IJobSource` dispatcher** (842 lines, a *de facto* second spine file that three
   economy lanes all want — this is the parallelism unlock) · the `[production]` node table ·
   register the economy systems empty. **No lane may spawn before this lands.**
2. **B-1/B-2/B-3** — the three live bugs. B-3 (CO₂ transport) specifically precedes E1's
   finite air reserve, or the reserve just kills the crew faster and reads as a balance
   failure.
3. **E0-1 recruitability**, then **E0-3 the missing web verbs** (`dig`/`stockpile`/`strip` —
   they exist in the sim and only the TUI can reach them; adding them unblocks three
   `JobKind`s and the `AgreeTask` conversation verb at near-zero sim cost).

**Two constraints that are easy to lose and expensive to get wrong.** The approved 10× work
rebase and the parked movement retune **land behind E0-1, never before** — measured, the
retune alone costs 29 % of production and drops recruitable crew-ticks 17.9 % → 9.3 %.
And **pin literals are integrator-only**: lanes assert `twin hashes MATCH` and never the
literal `26907c23d7e48a5c`, which goes stale the moment another lane merges.

**The gate the whole programme is judged on:** A1 — *crew are > 25 % busy at sim-hour 24*
(today: **0.0 %**). A conversion graph with finite ore is a longer boot window, not a durable
loop, and A1 is what tells the difference. Full gate list: `ECONOMY.md` §12.

## The MOSS terminal — "the phosphor ledger" (2026-07-22) — LANDED

Garvin asked for a true Fallout-4-style terminal: click MOSS and, instead of the ship, you get a
full-window amber CRT that reports every system aboard on one screen. Landed on main via **four
Opus-gated worktree lanes** off a frozen contract. Spec: **`docs/design/perilune-moss-terminal.spec.md`**
(the interaction/visual/data contract — IX-M / VS-M / DA-M; read §0 first, it is the honesty rule).
The MOSS *language* (`sim/Sim.Dsl`) is unchanged and still runs in the background; this is a new
**face** over the ship's telemetry.

**What shipped.** Four screens — **LEDGER** (the mock: 8 rows, LOAD bar / STATE / LAST FAULT),
**SYSTEM DETAIL** (per-device breakdown + a host-authored DERIVATION note), **FAULT LOG**, and a
**PROGRAM** shell + terminal directory. A live `>` prompt reads (`ship.power`, `hydro.co2`,
`status`) and commands devices (`close door_storage`, `set vent_hydro.rate max`). Full takeover
(top bar / CREW WATCH / READOUT / stage / bottom console all hidden — the ship canvas is never
touched, MOSS just isn't drawing it); ESC is a stack out (PROGRAM → DETAIL/FAULTLOG → LEDGER →
ship). New cached `systems` wire channel + `moss` ops `sys`/`exec`.

**The design decisions that shaped it** (asked and answered up front):
- **Honest rows only.** Of the mock's 8 rows, only 4 exist in the sim. MEDICAL SUITE is inert
  furniture (0 draw, 0 wear, no system reads it); COMMS ARRAY and GRAV RING do not exist anywhere
  in `sim/` or `hosts/`. Rather than fake three gauges on the one screen whose whole purpose is the
  truth about the ship (`MECHANICS.md` §13 exists because dead systems shipped behind HUD bars
  reading 1.00), they were replaced by **THERMAL / FABRICATION / NAV-SENSORS**, all real. Row count
  and visual density match the mock. `DA-M1..M4` make this a rule: every gauge is derived from live
  sim state or shown `OFFLINE` with a stated reason (NAV is honestly OFFLINE — no `Telescope` is
  ever placed, and the row comes alive on its own if one ever is).
- **The prompt commands devices, but grants no new authority.** It resolves targets through the
  **same `DeviceRegistry`/`IScriptable` adapters the DSL interpreter uses**, so the verb whitelist
  is inherited, not re-declared, and every write leaves as an existing `SetDoorState`/`SetDeviceState`
  command at a tick boundary. **No new `ISimCommand`.** Routing it through `MossCompiler` was
  investigated and rejected: `SetProgram("@console", …)` would have folded a player's typo into the
  determinism hash. `ship.*` and rooms stay read-only.
- **No hash move.** `ShipSystems.Compute`/`ComputeDetail` is a pure on-demand report next to
  `ShipMetrics` — no sim field, no `IStatefulSystem`, no def, no fold. Scenario/tick-3000/slice pins
  all unmoved.

**It is a diagnostic instrument pointed at the live economy bugs**, and deliberately does not
smooth them over: on the slice at day 3 it reads `LIFE SUPPORT — LOAD 58% / DEGRADED / 16,677 ppm`
(capacity coping, air poisonous — both true, the room-local-scrubber bug B-3), `WATER RECLAIM` /
`HYDROPONICS` ATTEND on the dry `tank_hydro` (B-2), `THERMAL` DEGRADED at −15.7 °C.

**Suite after merge: 680 dotnet + 356 node** green via `./ci.sh`; `26907c23d7e48a5c` and both
tick-3000/slice goldens unmoved (nothing hashed was added). Lanes: `moss-systems` (sim/host/wire,
PASS after a FAIL — a reactor row that read *lower* load as power failed, a ledger that laundered
NaN into NOMINAL, a note describing the rule its own code replaced), `moss-model` (the pure client
brain, PASS ×2 — its client-side derivation copy had drifted to a *reciprocal* of the host's),
`moss-screen` (the DOM/CRT face, PASS ×2 — Backspace was dead in the prompt, invisible to a node
harness whose `preventDefault` is a no-op; the fix included closing that harness blindness, now
spec §6.1: trusted-key CDP verification is obligatory for any lane touching keys here), and
`moss-programs` (the PROGRAM in-terminal IDE, PASS after a FAIL — its CDP proof drove the *fake*
model, so the check could not fail for a real-model regression; the integrator re-verified the
repointed check both directions against the shipping model). The review method (independent gate
per package, blind spec → in-worktree `ci.sh` → adversarial mutation pass) again caught
**disjoint** classes the author could not: **six** tests that could not fail — two of them inside
the tools that enforce the anti-vacuous rule — plus two duplicated-fact drifts, three rows that
lied, a dead Backspace, and a silently-dropped `source` reply.

**The PROGRAM screen** (`moss-programs`, the last lane) is a working in-terminal IDE — source
editor + gutter/diagnostic markers + diagnostics list + audit pane + Install + runtime-error
banner. It is a **view of `model.program`** (kept live by `reduceMossEvent` delegating
source/diag/audit/rterror to `terminal-model.js`), a single source of truth reusing the shipped
pure editor brain rather than a second copy. It closed a real pre-existing seam bug: the
directory-click path sent `moss open` but never opened the terminal in the model, so
`model.program.tid` stayed null and the tid-match **silently dropped the source reply**; new pure
`selectProgram`/`editProgramDraft`/`beginProgramCompile` reducers fix it. The refill rule refills
the textarea from `draft` (never `installed`), so a stray render never clobbers a mid-type caret.
`terminal.js`'s floating `TerminalDrawer` (the deck-console editor path) is untouched — the
PROGRAM screen is a second presentation of the same model shape.

**Near-term cleanup, non-blocking** (recorded in spec §6.1): `ShipSystems` gates the `systems`
wire on **wall**-clock (~16.7 sim-min max staleness at 1000× speed — v2 is to gate on
`TickCount`); the ppO₂ life-support band is correct but unreachable on shipped content (vents
inject from an unmodelled reserve).

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
2. **Sprite regen — DECIDED 2026-07-22 by Garvin: NOT NOW.** Order of work is
   **(a) revise the sprite AND ship design → (b) fix it → (c) only then regenerate, at the
   best resolution, to match Prison Architect's crispness.** No spritegen run, no API
   credits, no SPRITE_URIS pin move until (a) and (b) are done. This matches the art
   lane's own finding below: a resolution-only regen is wasted money. Rationale kept: 
   PA magnified 6× is visibly bilinear-blurred and still reads crisp — its quality is
   hard outlines, flat fills, low detail density, NOT resolution. Our pawns carry ~2,285
   unique colours each. A pure resolution regen costs credits, moves the SPRITE_URIS pin
   and the style anchor, and would still go to mush. Only pawns retain 1024² sources
   (re-processable to 256 for **$0**); every other asset exists only as 128px output.
3. **Movement retune** — fully measured, NOT landed (moves the CI pin). See below.
   **SUPERSEDED 2026-07-22 by the economy redesign:** it is now `ECONOMY-PLAN.md` E0-2 and it
   **must land behind E0-1 (recruitability)**, bundled with the approved 10× work-rate rebase
   as one integrator-gated commit. Landing it standalone is a measured −29 % production /
   −48 % recruitability regression. Do not take it from this section.
4. **CO2** — re-scoped: it is a **gas-transport bug**, not a dispatch gap. See below.
   **Now scheduled** as `ECONOMY-PLAN.md` B-3, and it must precede E1's finite air reserve.
5. **`Morale` / `Health` are never written by any system** yet three crew surfaces render
   them (CREW WATCH bar, CREW tab, READOUT) as a constant 100%. Design question.
   **Still open** — the economy redesign does not resolve it, but it touches the same
   surfaces, so decide it before E0-8 (the ledger) reworks the crew readouts.

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

## Playtest round 4 (2026-07-22) — the art bible + the movement defects, all LANDED

Follows round 3 in the same session. Counts after: **631 dotnet + 237 node**;
`26907c23d7e48a5c`, `401c9b96aff338a7`, slice `b31ba82f50cf395c` all unmoved.

### The art-direction revision (`docs/design/perilune-art-direction.md` + `art/spritegen/spec_derelict256.json`)

**Garvin's ruling on the regen: NOT NOW.** Order is (a) revise the sprite AND ship
design → (b) fix it → (c) only then regenerate at the best resolution to match Prison
Architect's crispness. **(a) is done; nothing has been generated and no credits spent.**

Rev 1 landed, an independent reviewer re-measured it and returned *"not yet safe to
spend against"*, and rev 2 fixed it. **The measured colour/value core survived exactly**
(the §8 grade-transfer table, the §9/§11 hexes, the `GRADE.floor` supersession, AD-33's
`16+108+12+104+16 = 256` wall stack, AD-18). **Every comparative claim against the PA
reference failed** — each had been measured on a sample that was not like-for-like:

- **"The crew are already at parity with PA" is WITHDRAWN.** Our 40×40 sample was ~50%
  dead flat margin scoring zero; PA's window is fully covered textured dirt plus a cast
  shadow. On identical ground: PA guards **+5.0..+8.4**, ours **+11.1..+17.6** — our
  pawns are *busier*. **Pawns are NOT exempt from the regen.** (This was relayed to
  Garvin as fact before it was checked. It was wrong.)
- Outline-less sprites **21 → 8** (3 terrain that should be, 3 matte-corrupted, 2 genuine).
  The interim renderer-dilate stopgap that count justified is withdrawn.
- Wrong-side lighting **10 → 8**; green-matte defects **2 → 3** (`anchor_table` missed).
- **`G-LIT` was unusable** — its own recipe scored 45/48 sprites below the bar, including
  on-model art. **`G-COL ≤112` did not bracket the reference** (3 of 7 PA guards score
  115–120); it had been fitted to the doc's own max sample. Both re-derived.
- Raw unique-RGB is genuinely **not** a discriminator (PA guards 1,727–2,109) — that
  conclusion stands, and is why the gates are |lap| / quantised-colour / value-split.

Every number now publishes its method in §1.7 including the seven guard coordinates, so
it is falsifiable rather than asserted.

**Rulings** (both were self-contradictory in rev 1): outlines are **UNIFORM** (only a
uniform weight is gateable and holdable by an image model; AD-6's dilate rejection is
re-argued on the ground that survives — a dilate cannot ink an *internal* edge), with a
new `G-INK` gate. Walls **BAKE** and drop world-continuity (baking needs no new sampling
capability in either executor and does not break WP-0's UV clamp / edge replication);
repeat rhythm comes from 4 bounded phase rolls.

**Four integration blockers rev 1 asserted away, now scoped as required work**:
`variantUris()`/`VARIANT` (`client/src/render/sprites.js`) does not load the new states;
`run.py:403` `stage_integrate` crashes on a partial work dir (so the "$0 pawn re-process
proof" is not executable as written); `rasterplan.js CELL = 128` and `packAtlas`'s
`maxWidth` 512 are hard-coded (at 256px cells → a 16384² texture); and `clampCam`'s `0.5`
self-invalidates the 8px outline derivation at 256.

**F1 PLATE is deliberately quieter**: PA's *circulation* floors measure 4.6/7.0 against
its yard's 8.3–12.5 — its clarity comes from indoor floors being nearly unpatterned under
high-contrast objects. PLATE gets its own G-DET band (5–9), bolts deleted, drainage moved
to GRID. Cost estimate: 45 assets × 4 candidates = **180 images**, order $20–40; re-check
the price before committing.

### Render WP-3 + WP-1 (light pools, grounding shadows) and the pass-order fix

Two commits, deliberately split so the movement fix could land on its own merit.

- **Pass ordering** — `passIndexOf` in `webgl/batch.js` is now the single authority on
  pass membership for **both** backends, and canvas2d walks buckets instead of the raw
  row-major op list. See the movement section below for why.
- **WP-3 light pools** — a pure `client/src/render/lightfield.js`: powered `*` emitters
  throw radial pools with 3-ray penumbra wall occlusion, sampled at **tile corners** so
  the field is continuous, emitted as a vertex-coloured multiply mesh reusing the existing
  flat program (one draw call). Fog gate independently verified: 451 mesh quads over the
  boot frame, **0 over `hull`, 0 over `void`**.
- **WP-1, shadow half only** — outlines are the art's job per the bible.

Review caught three things, all fixed. (i) The shadow was an **unsheared full-size offset
copy**: pawns read as a second dark pawn and the square terminal became a hard-edged black
rectangle a full tile across. Now squashed+sheared to **AD-3** (315° azimuth, 55° elevation
— the old `LIGHT_DIR` was 36.9°, not a diagonal). (ii) The advisory lighting-range drop was
**real, not a metric artefact**: `AMBIENT_LIT` applied `0.700` to *every* powered tile,
partly undoing the round-3 relight that had raised deck p50 17→41. Now `0.883`, with the
cast moved into red and the pool's warmth into blue so contrast is bought in chroma where
it is nearly free (p90 −25.6% → −9.3%, std −19.6% → −8.1%). Widening `LIGHT_RADIUS` to game
the metric was rejected and is now itself a caught mutation. (iii) **"17 mutation probes,
all caught" was false** — three survived, including the canvas2d `multiply` blend the
whole backend-parity claim rests on. Matrix re-run: 26/26.

**Honest residual**: under a multiply-only pass, pool *geometry* in a powered room is
~0.10 luma. Real brightness pools need an **additive** term — a follow-up, not done.

### The movement defects — "they blink, and they moonwalk"

Garvin: *"when pawns move from right to left, every step it looks they appear out of
nothing… plus they move backwards"*, then *"they still blink when they go up, down or
moonwalk.. only forward works great."* That second report was the key: E and S clean while
W and N blink is *structurally* what row-major draw order produces, and "south" could not
be explained by it at all. **Three separate causes**, none of them a stale build
(`serve.py` already sends `Cache-Control: no-store`) and none a WP-0 regression (bisected
byte-identical pre-WP-0):

1. **Terrain over entities.** `compose.js` emits ops row-major *per tile*; canvas2d walked
   them raw. A westward-sliding pawn is drawn one tile RIGHT of the tile it now occupies,
   so the next tile's opaque floor — drawn later — painted over it. Coverage of the pawn
   quad by later draws: **W and N 100% at step start, E and S 0%.** WebGL2 was immune (it
   batches terrain before entities) but **canvas2d is the shipping default**. Fixed by the
   bucketed walk above; independently verified **0% in all four directions**.
2. **Entities over entities.** The entity pass was still row-major *inside itself*. A pawn
   mid-step is drawn one tile back, so the tile it just vacated — where a device reappears
   the moment the citizen glyph stops masking it — is drawn later and repaints the body.
   Measured pawn-ink at the step boundary behind a growbed: **W 330/1045 (−68%), N
   316/1022 (−69%)**; impossible for E/S. Fixed: sliding pawns are a second sub-batch
   drawn after all settled entities, in both backends.
3. **Tile-exact culling.** A pawn whose tile straddled the viewport edge was composed out
   entirely — a one-tile-early disappearance at every edge in **every** direction, and the
   only thing that could blink a south-bound pawn. Fixed: `CULL_PAD = 1`.

**Moonwalk.** There were **zero directional pawn variants** (both walk frames are drawn
facing east) and no mirror in either backend; `motion.js` already computed a `facing`
value that **nothing read**, and vertical steps clobbered it. Now a **sticky `flipX`** —
set on `dx<0`, cleared on `dx>0`, *untouched by vertical steps*, reset on discontinuity.
canvas2d mirrors with `translate`/`scale(-1,1)`; webgl2 swaps `u0`↔`u1` **inside the same
cell rect**, so no new atlas cell and WP-0's replicated `ATLAS_BORDER` is untouched.
Measured bbox shift: **1 device px at 128 px/tile** (all five pawn images are centred to
within 1px, and `paintUnderglow` is a symmetric ellipse, so mirroring causes no jump).

**The silhouette mirrors; the shadow QUAD does not.** `shadowQuad`'s corners encode AD-3's
single key light, so mirroring them would swing every shadow the instant a pawn turned.
The flip is applied in source space, *after* the cell→quad matrix. Pinned by test.

**Known, deliberately not fixed:** a mirrored pawn's **baked-in light step** lands on the
upper-right, against AD-3 ("every sprite, every state, every frame"). The renderer's own
cast shadow still obeys the bible, so it reads correctly at gameplay zoom. The honest fix
is **west-facing walk art** — recorded in `motion.js` and queued for the regen.

Goldens moved: `boot_zoomed`, `boot_lit`, `lens_temperature`, `selection` + their
`passes/` twins (one added ring of tiles from `CULL_PAD`, verified a pure addition;
`boot_full` is fit-to-map and did not move). `accepted.png` was re-baselined once in round
3 per PROTOCOL.md §2 and not again.

### Still open after round 4

- **Sprite mirroring is renderer-only** — west-facing walk *art* is still owed (above).
- **Movement retune** (`ticks_per_tile 5→10`) — measured, ready, unlanded; moves the CI pin.
- **CO2** — a gas-transport bug (no diffusion term), not a dispatch gap. Needs a design call.
- **`Morale`/`Health`** — never written by any system; three crew surfaces render 100%.
- **The dig is a boot-window economy** — crew idle again after ~4 sim-min.
- **Additive light term** for real brightness pools.
- The **selection reticle does not slide** (both backends) — confirmed, not fixed.

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

## Ollama / mistral — the local dialogue backend (2026-07-22) — LANDED

The third provider path went from never-executed to the **default**. Full measurements and
the reproduce recipe are in `docs/SMOKE-P2.md` §"Ollama / mistral run". Headlines:

- **Local-first auto-route.** With no `dialogue.backend` configured, a ready local Ollama now
  outranks a cloud key: ollama → anthropic → openai → template. Boot prints
  `dialogue backend: ollama/mistral`; when the server is absent it says so in one line and
  falls back exactly as before. "Ready" means a host verified the server is serving *the
  wanted model* — a bare port check would let an empty server steal the route from a working
  key and 404 every turn. **`LlmSettings.Parse` stays pure**: readiness is a *parameter*, and
  the single socket lives in `LoadFromEnvironment` (the already-documented sole IO seam),
  which parses twice — pass 1 purely to learn which model to probe for. Dialogue is now $0.
- **The shipped pipeline produced ~ZERO effects on any non-tool backend, and it was the
  PARSER, not the prompt.** `EffectEnvelopeParser` dropped well-formed effects over a missing
  `magnitude` that `ConversationService.TryTranslate` never reads for `RevealInfo`/`AgreeTask`.
  Under the old prompt *every* envelope mistral emitted omitted magnitude while picking the
  right row unaided — so the reveal was lost every time, after the model got it right.
  Measured on the real `ProviderPrompt` bytes, n=64, scored to the sim: **1/64 → 29/64**.
  **The first effects a non-tool backend has landed in this repo.** Should help the
  OpenAI-compat path too; **unmeasured — re-run `llm-smoke --backend openai`.**
- **Two prompt changes were tried, measured, and REVERTED** (an envelope-instruction rewrite
  and a kind-annotated effect-target list). They added p = 0.22 of nothing on the real prompt,
  and the rewrite cost a **28% false-positive rate** plus a 4× rate of raw effect JSON leaking
  into the player-visible line. See the review lesson below — this is the most important thing
  in this section.
- **Leniency is gated two ways, both on RISK not semantics.** `EndConversation` is excluded
  from the magnitude forgiveness even though it qualifies, because `ConversationHub.cs:371`
  treats a dispatched one as authoritative — forgiving it had the crew **hang up on a player
  who said hello**, and fired on 11/24 turns where the player had just asked for work. And the
  manifest row must BE the kind the model claimed (the tool path always enforced this at
  `AnthropicBackend.cs:412`; the envelope path never did, and the leniency made an `AgreeTask`
  aimed at a `SetDisposition` row into a live dig assignment).
  **Residual, recorded honestly: 7.3% of no-op turns still fire something** (was 0%, but that
  0% came with 1/64 on the turns that mattered).
- **Native tool calling was measured and rejected.** Ollama advertises
  `capabilities:["tools"]` for mistral; 0/8 turns produced real `message.tool_calls` (the
  model writes `propose_effect(...)` into the prose instead). `supportsTools` stays false.
  `legacy/LLM_CITIZENS.md` §7 assumes otherwise — it is wrong for this model.
- **Two residency hints** now ride every request (`keep_alive: "30m"`,
  `options.num_ctx: 8192`). Both server defaults fail silently: 5-minute unload → a full
  4.4 GB reload inside the hub's 60 s budget; and an over-long prompt is truncated from the
  FRONT, i.e. the system rules and persona.

Suite **631 dotnet + 207 node** green via `./ci.sh`; scenario `26907c23d7e48a5c`, tick-3000
and slice pins all unmoved (nothing hashed was touched — this lane is entirely host/LLM-side).

### Review lesson from this lane (the expensive one)

Both gates were worth their cost and caught **disjoint** classes of defect, again. The
engineering gate killed 31/31 mutations but also found a two-pass config seam with **zero**
coverage — replacing its body with a constant left all 624 tests green. The LLM gate did
something no test could: it **refused to reuse the author's probe script**, rebuilt
`ProviderPrompt.BuildMessages` byte-for-byte, ran 526 live turns, and showed the author's
headline numbers were measured on a prompt the game does not send (2 capability rows instead
of 6, no `[SHIP]` block, a `temperature` the adapter never sends) and scored "well-formed
JSON" instead of "survives `TryTranslate`". The prompt work was reverted on that evidence.

Three rules earned the hard way, for anyone touching prompts here:

1. **Measure the bytes the game actually sends.** A hand-written approximation of a prompt is
   not the prompt, and the difference reversed the conclusion.
2. **Score to the sim.** "The model emitted valid JSON" is an upper bound, not a yield.
   `TryTranslate` and `EffectValidator` reject plenty that parses.
3. **Always measure the no-op turns.** An elicitation change is only half-measured until you
   know what it fires on a greeting. The reverted rewrite looked like a win on every turn the
   author tested and hung up on the player 5/24 times on "Hey Amara."

Watch-outs for the next session: the brew service did **not** start via `brew services start`
on this machine (silent exit 0, no log) and needed a `launchctl kickstart` once; it is
`started` now with `RunAtLoad`, but if dialogue silently goes cloud again, check
`curl localhost:11434/api/version` first. And a 7B is not Haiku — expect blander lines and
re-measure prompt changes over **many samples**, never one smoke (round-2's lesson, now
doubly true).

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
- **Hash-move ritual:** adding ANY hashed state (new `IStatefulSystem`, saved field) — or
  restructuring the fold itself — intentionally moves the reference hash. In the SAME commit:
  regenerate the tick-3000 golden
  (`UPDATE_GOLDEN=1 ... --filter Tick3000`) **and** the slice golden if the slice moved, update
  the pinned hash in `ci.sh` + `CLAUDE.md` + `MECHANICS.md` + auto-memory, and say why. P2 moved
  it three times (S1 relationship events, BuildSystem 'BULD' fold, Director 'DRCT' fold + gentled
  def); N1/N3 were verified honestly **un**moved. Economy **W0-1** (2026-07-22) moved all three
  at once by un-aliasing the citizen + item hash packs — a pure fold restructure, no sim
  behaviour changed, and exactly 2 goldens moved (both the tick-3000 hash files; every frame,
  persona and layout golden was byte-identical, which is the check that the cause really was
  the fold). Economy **W0-1b** (same day) moved all three again for the same kind of reason:
  **thirteen** fields were **saved but not hashed** — crew `Name`/`PrevPos`/`AutoWander`/
  `Path`/`PathIndex`/`MoveCooldown`/`IdleCooldown`, `ItemStack.Label`, `Device.Name`, the save
  header's `NextEntityId`, `RoomAnchor.Name` and `ScriptEntry.TerminalId`/`.Source` — so two
  sims at different path progress, or differing only in whether a crew member wanders, hashed
  EQUAL. **Nine were found by the package and four more by its independent review, after the
  package had already declared the audit complete** — budget a second reader for that audit,
  it is not a test the suite can run. Again a pure fold change, again exactly 2 goldens moved
  (both tick-3000 hash files; every frame, persona and layout golden byte-identical). Current
  scenario pin `ffefe9a9a42d8e7e`; current tick-3000 golden `6071adb8fa781440`; current slice
  tick-3000 golden `ab47cefd840247c4` (W0-1's values were `3afc99d90e849aa0` / `d807c509743d1b9d` /
  `21ad26192d778d95`).
  **Also part of the ritual now:** any newly hashed field ships a row in
  `tests/Perilune.Tests/StateHashHonestyTests.cs` — mutate that field alone, assert the hash
  moves. That table is what makes "it's hashed" a measured claim rather than a hopeful one.
  **And the audit that table cannot do:** a table built *from* the fold can only test fields
  the fold already has, so any commit that adds saved state must also read `SaveWriter`
  beside `StateHash` field-for-field. That is how W0-1b's nine were found — by reading, not
  by a red test. The matching restore proof is `SaveRestoreRunOnTests` (save → load → tick
  1000 → re-compare on the populated slice; ECONOMY-PLAN §5.1).
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
  **Escalated 2026-07-22 to a hard rule covering every SESSION, not just spawned agents —
  see `CLAUDE.md` "Work in a worktree — ALWAYS".** Two instances shared the main checkout that
  day and the economy audit watched another session's files change mid-measurement. Nobody
  edits the main checkout except the integrator merging; never `git add -A`; if `git status`
  shows files you did not touch, stop and look.
- **New test files** under `tests/Perilune.Tests/` auto-compile (SDK default items); new `sim/`
  source DIRECTORIES need a csproj glob (tests csproj is integrator-owned).
- Suite quirk: V6 survivability gate tests run real sim-days — the dotnet suite is ~3 min wall.
  Node 24 needs the glob form: `node --test "client/test/*.test.js"`.
- de-DE machine: test output prints `Bestanden!`/`Fehler`; culture bugs are live —
  InvariantCulture in every wire/dump/parse path, analyzers CA1305/CA1310 warn.

## Next: the economy programme, then P3 — The Voyage (PLAN.md has the full list)

> **Ordering, decided 2026-07-22.** The economy redesign (top of this file) is the approved
> next body of work and it comes **first** — E0 through E2 all land inside the closed ship
> and need no nav stack. **E3 *is* P3's economic half**: the voyage becomes the only faucet,
> so nav/sensors, derelict salvage and away missions arrive as the economy's supply lines
> rather than as separate features. Read `ECONOMY-PLAN.md` §1 before planning P3 work — the
> two are one programme, and E3 additionally owns the trading-hub DLC seams (`ECONOMY.md`
> §9.7) and makes the content-pack prerequisite below non-negotiable.

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

- **Ownerless reservation leak — LIVE on the shipping slice** (`CraftingSystem.cs:183`).
  A staged crafting input is stamped `ReservedForJob` with no owner and only
  `ConsumeStagedInputs` ever clears it, so the ship's last `Parts` unit ends up reserved by
  nobody: invisible to `MachineWearSystem.FindNearestParts` but visible to `StagedUnits`, so
  the bench waits at 1/2 forever and **every machine repair for the rest of the game is a
  jury-rig at 0.6**. Fix is `ReservedForJob : bool` → `ReservedBy : uint` (moves the pins).
  Scheduled as `ECONOMY-PLAN.md` B-1; full write-up `ECONOMY.md` §1.5.
- **Hydroponics is the water leak — LIVE.** A round trip through a grow bed returns
  0.8 × 0.93 = 0.744, i.e. **0.256 L destroyed per litre irrigated**. Measured: 903 of the
  slice's 1,400 L gone in 28 sim-hours, `tank_hydro` at 0.0 L from day 1.2, all three beds
  frozen mid-crop — **food production permanently dead on day 1.2** while the HUD food bar
  reads 1.00 (it saturates at 40 potatoes for 8 crew, `ShipMetrics.cs:83`). Scheduled as
  `ECONOMY-PLAN.md` B-2.
- **Two latent hashed bit-packs alias** (`Simulation.cs:272-275` and `:255-260`): `ItemKind`'s
  high bit over `ReservedForJob`, and `JobWorkTicks` bits 32–47 over `CarryingItemId`. Not
  determinism breaks — **canary blindness** in exactly the fields an economy stresses, and a
  >65,535-tick job is an ordinary economy number. Scheduled as `ECONOMY-PLAN.md` W0-1.
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
- **Save-reload gas/thermal ULP drift** — pre-existing, documented and reproduced by
  `P2ExitTests` on base. **Cause located 2026-07-22 (W0-1b), confirmed and sharpened by its
  review, still unfixed.** The save is not the cause: on a *single* sim with no partition
  change, `MarkDirty()` + `RecomputeIfDirty()` alone moves `StateHash` and perturbs **20 of 22
  rooms**. `Recompute` unconditionally calls `RemapGas` (`Rooms/RoomState.cs:322-340`), which
  rebuilds gases as a sum of per-tile shares via a **reciprocal multiply** (`1.0 / TileCount`,
  `:331`) and rebuilds `TemperatureK` by a *different* route, a weighted mean
  `tempWeighted / shareSum` — so a fix aimed only at the mole sums would leave temperature
  drifting. **`Recompute` is not gas-idempotent: recomputing an UNCHANGED partition perturbs
  O2/CO2/N2 and T in the last bits.** A reload merely triggers it (`SaveReader` leaves
  `Dirty = true` by design). Measured on the slice at T=300: bit-exact at load, essentially
  every room drifting on the first tick after, and the drift **grows** with run-on (~2.7e-15
  relative → ~1.5e-14 by N=1000). Crew, items, devices, RNG, tick, wastewater and every system
  fold stay bit-exact for 1000 ticks. So a plain save/load is *not* bit-exact under run-on,
  and the whole-`StateHash` §5.1 comparison only holds when both sims take the same recompute
  (`SaveRestoreRunOnTests` does exactly that; its second test pins the drift's blast radius at
  a band that permits rather than requires the drift, so a fix cannot redden it). Fixing it
  means skipping the remap when the partition is unchanged, or remapping by total — a
  behaviour change and a pin move, so it is its own package. Not a P2 or W0-1b regression.
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
- ~~**Ollama** — install it locally only if you want to exercise the third live provider
  path~~ **DONE 2026-07-22** — installed, running as a brew service, `mistral` pulled, and
  now the auto-routed default. See "Ollama / mistral" below.
