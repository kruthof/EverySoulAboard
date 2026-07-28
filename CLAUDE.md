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

## Status snapshot (2026-07-28, later) — **THE WRECK START: the game is being re-premised**

> **Read `docs/design/perilune-wreck-start.plan.md` (branch `lane/wreck-design`) before touching
> gameplay or economy work, and the `wreck-start-decided` memory before quoting any of it.**

**Gate on `main`: `./ci.sh` exit 0, 1181 dotnet + 876 node, twin hashes MATCH `43345ff0c9d62684`,
P1–P3 HELD, and P4/P5 MOVED** (see the pin table — two new def fields). Four lanes, each
Opus-implemented and **independently** Opus-reviewed, **every one taking a send-back**, every
send-back verified by the integrator in the tree before merge. Counts are a **UNION, not a sum**:
the branches read 1142 / 1140 / 1122 apiece.

**THE OWNER HAS RE-PREMISED THE OPENING.** The old start — 8 crew all sprinting to dig regolith
because `DigJobSource` is the only non-empty board at tick 0 — is retired as fiction *and* as a first
impression. The new one: a bay of cryo capsules, everyone frozen, **ONE pawn thaws and is the entire
player force**; the ship was raided, the unfrozen are dead or gone, the infrastructure is wrecked.
The rest thaw **one at a time THROUGH THE MOSS TERMINAL** — which is what finally gives "restore
MOSS" a job. ⚠️ **"Regolith" was never lunar soil**: `ItemStack.cs:5` calls it *"legacy name: debris
spoil from cleared sections"* — the fiction was always cutting a collapsed deckhead out of a wrecked
hold. It is being renamed **`Rubble`**.

**⇒ THE CORE LOOP IS A PRESSURE FRONTIER, and it falls out of a rule that already shipped.**
`WorksiteSafety.CanStageWorkerAt` hard-refuses staging a worker on a non-breathable tile — **thermal
counts** — so on a raided ship **work is only possible where the crew can already breathe**. Design
with it. ⚠️ **And the refusal is SILENT**, which on the wreck is the *default* experience, not an edge
case: the `blocked` channel is therefore a REQUIREMENT, not a follow-up.

**What landed:** `DeviceSpec.Condition`/`.Scriptable` so a ship can be authored wrecked (nothing
shipped moved a bit) · the **`devices` wire channel** — the client had *never* been told a machine's
condition, both SVG surfaces read only `cell[0]` · **70 wrecked art twins + 2 cryo capsules** ·
**`wear.wreck_threshold = 0.25`** (a wrecked machine can no longer be wished better) and
**`ItemKind.Swarf = 9`** (a stripped wreck is finally worth something).

### ⚠️ A CLEAN AUTO-MERGE IS NOT A CLEAN MERGE — the trap fired again, in this run

The damaged-authoring lane seeds a test Scrubber at Condition **0.2** and asserts maintenance
recruits it; the recovery lane's floor at **0.25** correctly refuses it. Two lanes, no overlapping
lines, **git reported NO CONFLICT and the tree was still wrong** — one red test, caught only because
the lane merged `main` into itself and re-ran the FULL gate instead of trusting the auto-merge.

### ⚠️ THE RUN'S OTHER STANDING LESSONS

- **A package's code can be right and its JUSTIFICATION false — that was 4 of 5 required fixes on one
  lane.** `wreck_threshold`'s prose claimed the floor sits below every `maint` threshold; **three
  kinds sit at 0.20 and lose their free band entirely**, and the lane's own test in the same commit
  asserted the opposite of the prose beside it. `(max 0.40)` was the tell: **taking the max is valid
  for a `>` bound over all kinds and invalid for a `<` bound.**
- **A def field pinned only by the checksum is NOT pinned.** `swarf_service_condition` moved 0.45 →
  0.55 with **zero behavioural tests seeing it** — its only assertion was `Is.EqualTo(the field under
  test)`. Self-derivation is the seventh trap wearing a new coat, and it shipped in the very commit
  that fixed it on the sibling field.
- **`verb parity is NOT sufficient`, for the third time.** `deviceConditionAt` — the seam its whole
  package exists to deliver — could `return null` for everything with all 843 node tests green,
  because it was pinned by a scan for its own signature.
- **A hand-maintained id→implementation join is invisible when wrong.** Swapping two art painters
  left the entire suite green (and **still does on `main`'s pristine registry**). Fixed by DERIVING
  the join from the painter naming convention, with the pristine set as its non-vacuity floor.
- ⚠️ **`MachineDefs.Table` is a DEAD DUPLICATE.** Its header claims `SimDefs.CreateDefault` copies it
  verbatim; **it does not** — `SimDefs.cs:570` holds a second hand-maintained literal and nothing
  joins them. A mutation to that table changes nothing and **looks exactly like a passing guard**.
- **A measurement harness needs its own non-vacuity check.** One lane's parser looked for
  `Fehlgeschlagen`; the real de-DE line is `Fehler <Name>`. It matched nothing and reported that as
  "no failures" — a green meaning "my instrument is broken".

## Status snapshot (2026-07-28) — **FOUR LANES: the livelock, the food lie, the invisible door, the memo**

**Gate on `main`: `./ci.sh` exit 0, 1122 dotnet + 821 node, twin hashes MATCH `43345ff0c9d62684`,
ALL FIVE PINS HELD — and `git diff` to `tests/Perilune.Tests/Golden/`, `ci.sh` and `content/` is
0 lines across the whole run.** Four lanes, each Opus-implemented and **independently** Opus-reviewed,
**every one taking a send-back**. Counts are a **UNION, not a sum** — the four branches read
1102/1104/1107/1097 apiece.

**1. The `MaintenanceSystem` livelock is CLOSED** (§5 item 2). Nothing in the dispatcher asked whether
a crew member could **survive** at the tile it was parked on. `WorksiteSafety.CanStageWorkerAt` now
asks. `--ship grid`, 14 sim-days, reproduced to the digit by review: Maintain 16.245 → 2.974 %, Flee
4.325 → **0.000 %**, job starts **47 640 → 298**, of which fled 18 301 → 0, and **services completed
311 → 309**. ⇒ **47 342 removed job starts cost TWO services.** The old curve read **91 % busy and
would have scored A1 PASS** at 2 services/hour.

⚠️ **THE HARD REFUSAL'S JUSTIFICATION WAS FALSE, and only DRIVING the sim found it.** The package
argued "the shortest fixed-tile job is a 90 s device strip, so the rule denies only work that could
never land". **`BuildSystem.cs:254 FloorConstructTicks = 20` — a floor build is TWO SECONDS**, and it
completes in vacuum in 6.9 s against a 45 s deadline. Also **"unbreathable" includes THERMAL**: a
fully pressurised but freezing room now refuses all work. **The cost is ACCEPTED, not patched** —
duration-awareness would couple the rule to job length and re-open every marginal case.

⚠️ **The accepted cost is E0-4 WP-7's trade again (§13.17): expensive-and-visible → CHEAP-AND-INVISIBLE.**
An order painted in airless air now never progresses, **silently**, and it is reachable in play on
grid. No toast, no tint, no reason. `CanStageWorkerAt` is public so a wire channel can surface it —
**filed as a follow-up, not fixed.**

**2. E0-9's food gap — AND THE CHARTER WAS WRONG ABOUT ITS OWN PREMISE** (§5 item 5, pin-neutral).
`ECONOMY-PLAN` commissioned this as *"surface the honest number that already exists in the `ledger`
verb"*. **That number was not honest.** It divided only by `potato_hunger_value`, assuming Hunger
fills once per sim-day; `needs.def hunger_per_second = 1/172800` fills it in **two**. Every runway was
under-reported by **exactly half** — grid read **9.5 days where the truth is 19.0**. Corrected **in
place, in the charter row that commissioned the package**. Confirmed by review by **driving** the sim,
not re-checking arithmetic: 1.300 u/crew/day measured vs the new model's 1.389 (0.936) and the retired
formula's 2.778 (0.468). `ShipMetrics.Food` is **untouched** — that pin move is deferred, not avoided.

**3. A closed door drew a dashed box with a raw `+` in the shipping game — LIVE, not latent.** The
charter (*"make the two `NON_FURNITURE` sets agree"*) was **stale in every clause**: there is only
**one** set, and forcing agreement with the set that *does* differ would have made a door draw
**nothing**. `NO_FURNITURE_SPRITE.Door`'s justification was false in **both** halves — no layer on
either surface ever drew a door, and "0 such tiles on grid" is really **8 on deck 0, all inside a room
rect**. **⇒ OPEN DEFECT "DOOR-NO-REMOVAL": a built door has NO removal verb on any surface.**
**⇒ UNAPPROVED VISUAL SCOPE:** doors now draw on the Level-1 Overview for the first time (three at
boot, deck 1 only); shots in `docs/design/shots/`, **LOCKED unphotographed**.

**4. `HasIceChain` memoised** (§5 item 3, pin-neutral): 91 721 250 device slots/sim-day → **1 250**,
worth **~90 ms of an ~8.2 s sim-day — ~1 %, NOT separated from noise** (paired A/B/B/A, n=8, on a
machine running four concurrent suites). **A COUNT OF SLOTS IS NOT A SPEED-UP.** The key is sufficient
**by inspection and pinned by nothing** — `EntityStore<T>.Items` is a public mutable `List<T>` — and
**a stale answer is invisible on grid by construction**, which is why the tests pin the FLIP.

### ⚠️ THE SEVENTH TRAP SHAPE — a suite of RATIO assertions cannot see a SCALE error

E0-9 exists to fix a **2×** error. Review then mutated `DaysOfFood` to over-state by exactly 2× and
ran the **full gate on a pristine copy: 1104 dotnet + 806 node, ALL GREEN.** Every other assertion in
the file was a ratio, and **ratios are scale-invariant**; the one absolute-scale pin asserted
`FoodUnits > 0` at half the claimed runway — and **halving the modelled rate doubles the claim, so
HALF of the claim IS the true runway**. It survived on float epsilon, and no tolerance could fix it.
⇒ **Only a PROPORTIONAL floor can pin scale.** ⚠️ **The implementer had DISCLOSED the survival and
filed it as a preference about mutation choice, not as a hole in the guard** — that reframing is the
thing to catch in your own work. Countermeasure: a **four-cell** inclusion table, whose decisive cell
is *mutation + assertion regressed → GREEN* (proving nothing else in the suite sees it).

### ⚠️ THIS RUN'S OTHER STANDING LESSONS

- **A package repeated the exact defect it existed to retract.** The door lane wrote *"a door is taken
  apart with STRIP"* into six places and **asserted it in a test**. STRIP **explicitly refuses doors**
  (`DeconstructSystem.cs:345`; a live host answers `"cannot strip door"`).
- **A review can be wrong in the same way.** It corrected a stale sum to "7 and 33"; the true count,
  measured off the shipped registry, is **19 + 8 + 7 = 34** — giving a door art moved the *device-row*
  count too. The assertion is written as a sum, so it stayed green through **both** wrong versions.
  ⇒ **re-count, never compute.**
- **Trap 3 (FALSE RED) bit three separate agents in one night**, twice through a build-error grep that
  could not match this machine's **de-DE** MSBuild output (`erfolgreich` vs `Erfolgreich`; and `^ *error CS`
  never matches, because the token appears mid-line after the path). **Test your harness's own parser
  against a real de-DE line before you believe a red.**
- **Concurrency has a cost you must state, not hide.** Four lanes on one machine took the dotnet stage
  from ~6.5 min to ~10 min. Correctness is unaffected; **every wall-clock number taken that day is
  soft**, and the packages say so beside their timings.

## Status snapshot (2026-07-27) — **GROUND-ITEM ART: the piles have faces, and a lamp stopped being demolishable**

**Gate on `main`: `./ci.sh` exit 0, 1097 dotnet + 801 node, twin hashes MATCH `43345ff0c9d62684`,
all five pins HELD.** Pin-neutrality is **measured, not argued**:
`git diff -- sim/ hosts/ content/ tests/ ci.sh` is **0 lines** — the whole package is client-side.

**Imported from the owner's claude.ai/design project via the `claude_design` MCP** and diffed
block-by-block **by label** (not by file order — that is what surfaced the redraws):
**68 pieces — 8 NEW, 9 CHANGED, 51 byte-identical, 0 removed.** Spec:
`docs/design/perilune-item-set.dc.html`. The 9 changed are device pieces redrawn on the owner's
report that *"the current ones were difficult to understand"*, and they are a **separate commit**
so any one of them reverts alone.

**Shipped:** 8 builders in `client/src/items/resources.js`; a **fourth registry kind `resource`**
whose kind-byte → art join is **derived from `ITEMS`**, not a fourth transcription of `ItemKind`;
`NO_GROUND_ITEM_SPRITE` paid down **9 → 1**; and the corpse made visible *at all* by removing `'&'`
from a `NON_FURNITURE` list now **shared** by both surfaces instead of re-declared in each.
**`MetalOre` deliberately gets NO art** — zero references anywhere in `sim/` outside the glyph
table, so it is dead E3 mining vocabulary. **The label plate is DEMOTED, not deleted:** it remains
the no-art fallback for `MetalOre` and for a kind byte from a newer host.

### ⚠️ THE SIXTH TRAP SHAPE — a predicate over "what a glyph resolves to" is defeated by SUBSTITUTION

**A live, player-visible regression that shipped green and was caught only by independent review.**
Ground art gave `resource` rows glyphs, so bare truthiness would have called a spoil pile a device.
The guard asked instead *"is the piece skinning this glyph a `functional` row?"* — and
**`GLYPH_SUBSTITUTE` exists precisely so a device can wear ANOTHER piece's art.** One of its six
entries maps `'*'` (`DeviceKind.Light`) onto **`wall-lamp`, a COSMETIC row**. So every Light
classified as `empty`, `roomzoom-view.js` hit its `default: break`, and **the click was dropped with
no command, no toast and no pulse.** `RoomOutfitter` puts a Light at the centre of **every room on
`--ship grid`** and lamps are player-placeable: **you could build a lamp and never remove it.**

⇒ **A substitution means "a device wearing another piece's art", so the BORROWED row's `kind` is not
a fact about the tile.** Ask what a piece is **NOT** (`_id && !isResourceItem(_id)`), never what it
is. **`GLYPH_SUBSTITUTE` is not homogeneous in registry `kind`** — 5 `functional`, 1 `cosmetic` —
and any future predicate over it has the same trap waiting.

⚠️ **THE HAZARD WAS NOT PRE-EXISTING, and the first write-up of it here said otherwise.** On `main`
bare truthiness was **correct**; this package's own art created the hazard and its first guard
over-corrected. ⚠️ **THE SUITE WAS 796/796 GREEN BEFORE AND AFTER THE FIX** — nothing pinned either
behaviour, so the gate could see neither the break nor the repair. Fixing it exposed a further hole
review had not filed: dropping the `_id &&` half left **800/800 green** and would classify an
unmapped glyph as a device.

⚠️ **A FALSE RED, hit by the integrator while verifying the fix (`CLAUDE.md` trap 3, live).** The
first mutation run reported **7 reds** and read like a strong confirmation; it was a
`ReferenceError` from an import the mutation removed. Re-run with the module left loadable it is a
clean semantic RED on **3** correctly-named tests. **A false RED does not look like an explosion —
it looks like a plausible failure count.**

## Status snapshot (2026-07-27) — **the `items` channel: a ground stack has a COUNT**

**Gate on `main`: `./ci.sh` exit 0, 1097 dotnet + 783 node, twin hashes MATCH `43345ff0c9d62684`,
all five pins HELD.** `git diff` to `sim/` is **empty** (not comment-only). Opus-implemented,
independently Opus-reviewed, **one send-back**, and both send-back fixes re-verified by the
integrator before the merge.

**Ground item stacks reached both SVG surfaces ONLY as a single glyph char in the projection**
(`GlyphMapper.cs:136`), which is lossy **three** ways — all three confirmed by driving the sim:
**(1) no count** (a 1-stack and a 40-stack produce a byte-identical `GlyphCell`); **(2) topmost-only**,
and **worse than filed** — `EntityStore.Items` is a plain list and nothing merges stacks, so two
stacks of **ONE kind** also collapse; **(3) devices erase items** — pass 4 assigns the device glyph
unconditionally *after* pass 3. **The fix is a channel, not a better reader** (the `marks` lesson).

New sparse view-only **`items`** channel (`hosts/web/WireFormat.Items.cs`), read from `sim.Items`
**directly, never from the projection**. Tuple `[x,y,deck,kind,count]` — deliberately NOT the
charter's deck-first, because `materials`/`zones`/`marks` are all x-first (checked in source).
**`WireFormat.cs` has a ZERO diff** — it was already `partial`, which is better than WP-3's
one-token pattern. Carried items are **skipped** (their `Pos` mirrors the carrier: a carried stack
is a fact about a *person*), pinned by a control that clears `CarriedBy` and requires the row to
appear. `SHIP_STATE_REACH` 26 → 27 (`getItems`), ratified in review.

**The Room Zoom draws a label PLATE (`REGO 40`) — a NEW VISUAL VOCABULARY, ratified deliberately,
not sprite art.** Room STORAGE on `--ship grid` — the room that showed seven dashed placeholder
chips — now shows **7 plates and ZERO unknown-glyph chips**, verified in a browser by two agents
independently. **Ground-item art remains a separate package**; `NO_GROUND_ITEM_SPRITE` is untouched.
**Cost is MEASURED, not argued** — grid **7 rows / 124 B / ~0.9 µs** against a ~392 µs render
(**0.2 %**), slice 212 rows / 2.8 KB / ~14 µs (~4.5 %); both upper bounds, n=1, Debug. Compare
`marks`' +61 µs.

⚠️ **New latent harm, recorded not hidden:** `NON_FURNITURE` omits `'+'` and `'X'`, so a closed door
inside a room rect chips — and a ground stack on that tile now **suppresses the chip**, so the door
draws *nothing*. Doubly latent (0 such tiles on grid today). The real fix is to make the two
`NON_FURNITURE` sets agree, not to narrow the suppression.

### ⚠️ THE FIFTH TRAP SHAPE — `assert` throws, so only the FIRST leg of a multi-leg test reports

A test whose name claims two guarantees ("deck **and** rect") reports only its **first** failing
leg, because `assert` throws. **A second leg that cannot bite is therefore indistinguishable from
one that can** — the suite is green either way and the name asserts both. This shipped here: the
wrong-deck fixture row sat on the **same tile** as an in-room row, so it folded into an existing
entry and moved only an invisible aggregate; deleting the deck filter outright left **782/782
green** while the rect halves *did* bite. **Countermeasure: run each leg with the others BLINDED
and require each to fire on its own.** A fixture must also carry **both failure shapes** — a
wrong-deck row on a *free* tile (caught by the tile list) and one on an *occupied* tile (caught
only by the aggregate); a fixture with only the first still misses the fold. The other four shapes
are below.

## Status snapshot (2026-07-27) — **the E0-6/E0-7 WAVE + E0-8: the economy's faucet was fake**

**Gate on `main`: `./ci.sh` exit 0. ALL FIVE PINS MOVED** — the wave is the biggest determinism
change since E0-5, and the re-pin is in the same commit as this text (the ritual).

**E0-6 — the shipped `SalvageRecycler` was `1 Regolith → 2 Scrap`. Mass creation, in the production
table since before the programme started.** 62 Regolith became 124 Scrap became 31 modules; **every
unit past the first 62 was conjured.** Now 4:3, with `work_s` scaled so the per-unit work rate is
byte-identical. Arithmetic predicts the sim to the unit (0.375× ⇒ 11.6, measured **11**).
⚠️ **IT MAKES THE STANDARD PLAY SHIP MEASURABLY WORSE — A1 24.990 % → 0.000 %, work stops after h16
— and E0-7 DOES NOT REPAIR THAT**, because the ice is authored into `--ship slice` only
(`MECHANICS.md` §13.20). **Whether `--ship grid` gets its own ice is OPEN ON THE OWNER.** Also
shipped: `Seals` as a maintenance rung, and `ControllerModule`'s first consumer (commissioning a
device for MOSS) — **which has NO BUTTON and is provably inert in every unattended run.**

**E0-7 — ice → melter → water**, 1 600 authored units ⇒ **~22.5 sim-days**. ⚠️ **That runway is a
property of an UNCAPPED greywater pool, not of the ice economy: ~66 % of every litre melted is
warehoused and never used** (filed as an OPEN DEFECT). Review found a **priority inversion** — the
melter claimed tank headroom ahead of free recycled water — worth **−33 % ice burned** for identical
food and tanks, **and it had no test at all**.

**E0-8 — the ledger**, pin-neutral. Its audit is the lasting part: **`ShipMetrics` is read inside
`DirectorSystem.Tick` and folded into `StateHash`**, so the lying metrics already drive device wear
and correcting one is a pin move. `Power` reads **0.833 where the truth is 1.000** on the standard
play ship, and **the error's sign flips by ship**. `Food` is clamped so 699 potatoes and 40 both read
1.000 — the food term contributes **exactly zero** to Director tension. **The charter's own premise
is stale**: production is alive (76 → 731 units), the clamp is the liar.

### ⚠️ A1 IN A FIFTH COSTUME — never quote it without throughput beside it

The merged `--strip 40` leg reads A1 **28.771 PASS → 21.153 FAIL** while **throughput is identical at
19** and both robust statistics **improve** (mean 29.779 → 33.261; floor 2.577 → 6.198). Neighbouring
hours: **h23 30.7 % · h24 21.2 % · h25 34.4 %** — a 13.2 pp swing across three hours and **A1 samples
the trough**. It nearly shipped as a published regression.

### ⚠️ THE FOURTH TRAP SHAPE — a guard whose SCOPE FILTER excludes the violation

E0-8 added a guard that the ledger can never be called from a tick path, finding systems by scanning
for `": ISimSystem"`. Review built the violation — a plain helper (not a system) calling it, plus one
line in `DirectorSystem.Tick` calling the helper. **The ledger was on the tick path and the guard was
GREEN.** Over 20 files scanned, every non-vacuity floor passed, and **the violation was never in
scope.** ⇒ **Non-vacuity by POPULATION COUNT proves a matcher matched something; it never proves it
would match the thing. Make non-vacuity an INCLUSION test — plant a known violation and require it be
caught.** The other three shapes: a guard satisfied by its own subject commented out; a mutation red
for the wrong reason (a crash); **and a correct assertion satisfied by an unrelated code path** — a
right answer from the wrong branch, which lives wherever several paths return one sentinel.

### ⚠️ TWO LANES FIXING THE SAME FUNCTION DIFFERENTLY MERGE TEXTUALLY AND ARE WRONG TOGETHER

Both E0-6 and E0-7 fixed `DefsParser`'s `[production]` handling. **They do not compose — the seeding
supersedes the guard**, measured: deleting E0-6's guard leaves its own test GREEN; reverting E0-7's
seeding reddens 8. Git flagged **14** conflicts and the semantic ones were elsewhere: twelve tests
broken by a station name, a mask guard that had inverted into asserting the opposite of the truth, a
test whose subject evaporated (it probed bits that are now real kinds), and a player-visible label
where one lane's item got a name and the other's silently read `"cargo"`. **Git's conflict markers
are the floor, not the ceiling.**

## Status snapshot (2026-07-27) — **three packages: the player-visible gaps, and a sweep for dead guards**

Landed overnight on top of the `marks` channel, each Opus-implemented and independently
Opus-reviewed, **every one taking at least one send-back**. **Gate on `main` @ `0f27412`:
`./ci.sh` exit 0, 1019 dotnet + 737 node, all five pins held.**

1. **Device sprites** (`bfaa192`) — GrowBed `"`, Terminal `T`, Telescope `x` had no client art, so
   the Room Zoom drew a **debug placeholder carrying the raw letter** in the shipping game (owner
   report, §4l). The art already existed in `client/src/items/index.js`; the defect was that
   glyph→itemId was **hand-mirrored** into two view files. Both `ROLE_TO_ITEM` tables deleted;
   `client/src/items/glyph-map.js` derives it from `ITEMS`. **The guard is the point**: it reads the
   sim's own `DeviceKind`/`ForDevice` and calls the real `buildItem` per kind.
   ⚠️ **THE CLASS IS NOT CLOSED** — seven more chips (`,`×6, `f`) sit in STORAGE from
   `Glyphs.ForItem`. Ledgered in `NO_GROUND_ITEM_SPRITE`, pinned by equality, **art is a separate
   package** (no loose-pile builder exists among the 60 pieces, and a stack's **count** has no
   channel in `buildItem` — 1 unit and 40 render identically).
2. **Palette overflow** (`0f27412`) — the Room Zoom palette clipped with the scrollbar
   **deliberately hidden**, so STOCKPILE/STRIP/DEMOLISH were unreachable *and* unadvertised. Onset
   measured at **1249 px, not the filed ~1140**, and it **travels with the room name**. Fixed by
   wrapping; `width:max-content` is load-bearing and was found only by re-measuring.
3. **Test hygiene** (`bb2e983`) — a systematic sweep for **tests whose named mutation cannot bite**.
   Fixed the three known, found **four more dead guards already shipped** (two fixed, two retracted
   as genuinely unfixable), and one live-bug shape: `moss-screen.js:271`'s capture registration
   survived `{capture:false}` while the legacy spelling went red. Ledger of the rest, with an
   **honest scope boundary** — and review found two more survivors immediately inside it, including
   **a test that passes if the system under test does nothing at all**.

### ⚠️ NEW TRAP — a negative control for a comment stripper needs a LATER REAL COMMENT

**This landed independently in TWO packages on the same day** and was caught both times only by
physically substituting the broken stripper. A control asserting *"a quoted `/*` does not blind the
stripper"* whose fixture contains **no closing `*/`** is **vacuous**: the naive
`replace(/\/\*[\s\S]*?\*\//g,'')` finds no match, returns the input unchanged, and the control passes
whether the stripper is correct or broken. The real `styles.css` has 160 `/*` tokens, so on the file
being guarded the naive stripper **would** be blinded. **Fixture must contain a later real comment,
and prefer mutating the SHIPPED stripper's own quote branch over substituting a stand-in** — the
stand-in only proves you catch one spelling of the mistake. Live examples:
`client/test/moss-screen.test.js`, `client/test/palette-layout.test.js`.

### ⚠️ NEW TRAP — a clean auto-merge is NOT a clean merge when two lanes add the same exported name

Both the palette and test-hygiene lanes independently added a `cssCodeOnly` to
`client/test/code-only.js`. The definitions landed at **different offsets, so git reported NO
CONFLICT** and produced two `export function cssCodeOnly` in one module — a SyntaxError that crashed
**8 test files with 503 of 737 tests collected**. Worse than the crash: the two implementations
**differed in 7 of 10 behaviours and neither was a superset**, and the property that would have
vanished silently (line fidelity, 1457 vs 1301 newlines) was **pinned by neither parent**. Resolve
by *measuring both against a case table*, never by textual precedence, and **re-run BOTH parents'
negative controls against the survivor**.

### ⚠️ A CSS COMMENT IS NOT WHITESPACE — the correction that nearly became folklore

`.a/*x*/.b` is the **compound `.a.b`**, not a descendant (CSS Syntax L3 §4.3.2 consumes a comment and
emits **no token**; verified in Chrome). Two shared-module comments asserted the opposite as the
justification for `cssCodeOnly` emitting a space. **The decision is right for a different reason:** as
a text filter, emitting nothing **FUSES** identifiers (`.rz/*x*/-palette` → the string
`.rz-palette`, a rule Chrome discards as invalid, handed to the guard as the very selector it
watches — a fabricated false positive), while a space can only **SPLIT** a token into something the
guard ignores.

## Status snapshot (2026-07-26) — **the `marks` channel: a designation no longer blinks out**

Both modern surfaces now source their mark layer from a new sparse view-only **`marks`** channel
(`hosts/web/WireFormat.Marks.cs`) read from `TileFlags.Designated` / `TileFlags.Stockpile` /
`DeconstructSystem.Pending` / the debris terrain planes — **never from the projection**. `MARK_FOR_FG`
is retired. **`GlyphMapper` passes 3/4/5 can no longer erase a mark**, so a designation survives a
crew member standing on it, an item stored on it and a device occupying it. This is the channel
`docs/HANDOVER.md` calls *the `designations` channel*; it shipped as **`marks`** because it carries
**debris**, which is terrain and not an order. **Gate: `./ci.sh` exit 0, 1018 dotnet + 694 node, all
five pins HELD** — the lane's entire `sim/` diff is comment-only, verified mechanically.

**⚠️ THE LESSON: PASS 1 IS NOT THE FRAME.** The first draft mirrored `GlyphMapper` pass 1's
precedence "deliberately and exactly" — but `GlyphMapper.cs:163` re-applies `Deconstruct` **after**
pass 1, unconditionally, so pass 1 never gets the last word on a condemned device. A condemned device
**inside a stockpile zone** therefore drew **no strip mark at all**: a fresh instance of the bug that
cost three owner reports, introduced by the package built to remove it, and **hidden behind a header
asserting as a design guarantee that the kinds "cannot legally coexist on one tile"** (they coexist
after two commands). Precedence is now **dig ▸ strip ▸ stockpile ▸ debris — an order outranks a
zone**. **Verified in a browser, not only in assertions** (`client/tools/marks-shot.mjs`, committed).
Cost, accepted: **+61 µs/render forever** — unlike `zones` this channel is **never empty**.

**Also open, found the same day from live play and NOT caused by any lane:** GrowBed `"`, Terminal
`T` and Telescope `x` have **no client sprite**, so the Room Zoom draws a debug placeholder carrying
the raw letter in the shipping game (`docs/HANDOVER.md` §4l). No test can see it — the client is
honestly reporting it has no art — and the two surfaces mirror that table by hand, so the gap reopens
with the next `DeviceKind`. Fix it with a guard, not three sprites.

## Status snapshot (2026-07-25) — **the DECK-CONFINED IDLE WANDER: the standard play ship is alive**

The eight crew of `--ship grid` — the one standard play ship — are now **`AutoWander = true`**
(`sim/Sim.Gen/AuthoredShips.cs`), so an idle crew member moves instead of standing on its boot tile.
They are idle **~67 % of a sim-day**, so this is most of what the ship looks like. It is safe only
because of the change underneath it: **`PathService.TryRandomWalkableTileNear` no longer boxes Z by
the wander radius — it pins the sampled Z to `origin.Z`.** An idle wander cannot change deck. That is
a **LITERAL, not a def field**, deliberately: it is a rule (idle crew do not climb ladders for
nothing), not a tunable, and it therefore adds no hashed state and moves neither defs checksum. The
X/Y box is **untouched** — same fixed 3-draw zero-alloc shape, same corner behaviour, same local
dispersal.

**Why the flag could not simply be flipped.** The default `wander_radius_tiles` (8) is **≥ the grid
ship's depth** (`GridDepth = 8`), so the old box saturated the whole world and a **single idle draw**
could land a crew member on any of the eight decks — six of which boot airless but are walkable from
the ladder trunk. **Measured, `occupancy --ship grid --days 1`, three legs:**

| leg | crew alive | `Flee` share of crew-ticks | idle crew-ticks SPENT WALKING | A1 work @ h24 | idle `None` |
|---|---|---|---|---|---|
| shipped (`AutoWander=false`) | 8/8 | 0.00 % | **0** | 24.938 % | 67.19 % |
| flag flipped only (old sampler) | 8/8 | **4.46 %** | — | 24.990 % | 62.73 % |
| **this change** (flag + deck-bounded) | 8/8 | **0.00 %** — *exactly* 0 of 6 912 000 crew-ticks | **3 529 866** | 24.990 % | 67.15 % |

**Two results, and the second one is the point of the feature.** (1) The **4.46 % → 0.00 %** `Flee`
collapse. (2) **THE SHIP IS VISIBLY ALIVE: jobless movement goes 0 → 3 529 866 crew-ticks over one
sim-day — 76.06 % of all idle time spent walking, 51.07 % of the entire sim-day** (measured in
independent review by instrumenting idle crew-ticks carrying a live path; this is a direct
measurement, not the earlier inference from `None` holding at ~67 %).

Note what result (1) is *not*: the older claim that *"an idle wander is a death sentence here"* was
**wrong and is retracted** — the middle leg keeps 8/8 crew alive and its productive work is *higher*
than shipped. The argument was always **waste**, not lethality: crew walking out of vacuum for nothing
on the ship a new player is watching. A1 is unchanged at **24.990 % (still FAIL)** and that is
expected — wander is not a labour lever.

⚠️ **One consequence future ships will meet: an idle crew member never wanders BACK to the deck it
came from, so crew slowly accumulate on their last job's deck** (deck-0 crew-ticks 2 161 920 →
1 702 000 over the same day, also measured in review). Harmless on the grid ship — deck 1 is
pressurised, and self-serve/jobs route through `FindPath`, which is unbounded — but **not** harmless
on a ship whose upper decks are not survivable. Confinement bounds the idle DRAW, never the crew
member.

Pins: **one moved, four held, and two of those held against expectation** (see "Determinism proof").
Slice tick-3000 golden `1f8f2225ee568de9`→`c565a68b810f588d` (the slice's crew wander too). The
scenario `--days 3 --seed 42` pin was *predicted* to move and did not — **and the reason is the map,
not the crew: that run is `hosts/scenario/Program.cs`'s hand-built `BuildScenario`, one `string[]` to
`AsciiWorld.Build`, so `world.Depth == 1` and the old Z bounds already collapsed to `zLo = zHi = 0`.
It could not have moved under any crew flags** (its 2 crew come from `sim.AddCitizen`, which sets no
flags: `AutoWander = false`, `HoldPosition = false`). So **`ci.sh` was not edited**. Tests:
`tests/Perilune.Tests/DeckConfinedWanderTests.cs`, all three **driven, never scanned**, with a
non-vacuity control that replays the old Z box and measures it leaving the deck on
**87.5 % of 3 200 draws**.

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
   copy, not re-derive: **`client/test/code-only.js` (JS, `codeOnly` — the SHARED module since
   WP-5, 2026-07-26; it used to live at `surface-boundary.test.js:205`, which is now only a comment
   about the extraction, so IMPORT it rather than copying)** and `surface-boundary.test.js:264`
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

### 3. A FALSE RED — a mutation that goes red for the wrong reason (found 2026-07-26, WP-4)

Everything above hunts false **greens**. This is the mirror image, it is newer, and it is harder to
spot **because red looks like success**.

WP-4's harness mutated `roomzoom-view.js` by substituting `isStructuralTool` back into two call
sites — **from a file that no longer imported it.** Both mutations died on
`ReferenceError: isStructuralTool is not defined`. **They proved the module cannot load; they proved
nothing about the semantics they claimed to pin.** With the import restored as part of the mutation,
one was a genuine RED (n=9) and **the other was a survivor** — a real hole that a false RED had been
hiding. Two of 23 claimed REDs were bogus, and the defect was found only because an independent
reviewer applied a *third* mutation by hand.

**The insidious part, measured:** the crash reddened **only 2 tests**. A false RED does **not**
present as an obvious explosion — it presents as a small, plausible failure count, which is exactly
what a semantic RED looks like.

**The countermeasures:**
1. **A mutation must leave the module loadable.** If it removes or renames an identifier the module
   still references, restore the reference as part of the same mutation.
2. **Distinguish a crash from a semantic failure in the harness itself**, and report it as such —
   WP-4's now prints `!! CRASH (not a semantic RED)`. A harness that only counts red/green cannot
   tell you which kind you got.
3. **Sanity-check the failure set, not just the count.** A mutation to one call site that reddens a
   suspiciously broad or suspiciously narrow set of tests is worth reading before believing.

### 4. When a guard must pin *how* an API was called, record the argument at the seam — do not scan for it

Found 2026-07-26 (BUG-B). **This is the first countermeasure in this section that REMOVES the need for
a text scan rather than hardening one**, and it generalises well beyond its package.

A source scan for `addEventListener(…, true)` is defeated three ways: by a comment (trap 1), by
whitespace, and — decisively — by the **equivalent `{ capture: true }` options form**, which is a
different string for the same call. **A stub that records the argument at registration and asserts on
it is runtime state**: it needs no comment stripping, it catches every spelling, and it catches a
*partial* regression on one binding of several.

The bug it was written for: the Overview's window latch clear must stay **bubble** phase; a third
argument moves it to capture, where it runs before the element's own handler and **silently kills the
entire room-entry gesture with the suite green** (`docs/HANDOVER.md` §4h). Live implementation to copy:
the window stub + phase assertion in `client/test/overview-model.test.js`. **Verified by mutation: the
`{capture:true}` spelling reddens it and would have escaped a text scan.**

Corollary, from the same package: **if a harness cannot model the thing your guard needs to see, fix
the harness.** `client/test/dom-lite.js` had no concept of event phase, which is *why* the regression
was invisible; it now dispatches window capture → element path → window bubble with **one shared event
object** (three objects would leave only the middle phase able to `stopPropagation`).

### 5. Two shell traps that produced findings out of nothing

- **An unquoted `$flags` in a loop** made three "stockpile" measurement legs run **flagless**, and
  they produced baseline-identical output that looked like a real finding.
- **A grep with no non-vacuity check** is the same defect: assert your matcher matches *something*
  before you believe that it matched nothing.

## Working here
- Tests: `~/.dotnet/dotnet test tests/Perilune.Tests --nologo` (`./ci.sh` runs the full
  gate — dotnet + node, ~8 min wall since V6 runs real sim-days; the dotnet stage alone
  is ~6.5 min). Counts move with every
  lane and are re-measured per commit; **re-measure before quoting**. **Measured on `main` after the
  ground-item art merge (2026-07-27): 1097 dotnet + 801 node, `./ci.sh` exit 0, all five pins held**
  (pin-neutrality measured: `git diff -- sim/ hosts/ content/ tests/ ci.sh` is 0 lines).
  *(Superseded:* after the `items` channel merge, **1097 dotnet + 783 node**.*)*
  ⚠️ **A STALE COUNT SURVIVED IN THIS FILE FOR A WHOLE RUN, and it is the reason "re-measure" is in
  bold.** The line below read **737 node** and was quoted as current; the `items` lane measured `main`
  itself from a pristine `git archive` copy and found **755**, independently confirmed by review. The
  18-test gap was never explained — nothing in the run that wrote 737 accounts for it. **A count you
  did not measure yourself is not evidence, even when this file states it.**
  *(Superseded:* **after the three-package overnight run (2026-07-27, `0f27412`): 1019 dotnet + 737
  node** — the node figure is now known to have been WRONG or already stale when written.*)*
  **Per-branch counts do NOT add on merge — measured again this run:** the palette
  branch read 713 node alone and the merged result is 737, a **union**, not 713 + anything.
  *(Superseded:* **after the `marks` merge (2026-07-26, `11b2ffb`): 1018 dotnet + 694 node**.*)* *(Superseded, and kept because the paragraph below reasons about it:* **measured on `main`
  after the WP-6 merge (2026-07-26): 1002 dotnet + 678 node, `./ci.sh` exit 0**
  (+6 dotnet — strip-visible touched `sim/Sim.Glyph/GlyphMapper.cs`, the first sim-side change since
  the deck-confined wander; **all five pins held and no golden moved**).*) Every "560 dotnet + 188
  node" below is a 2026-07-21 historical figure, true only of that date — do not quote it as
  current. Per-branch counts measured in isolation **do not add on merge**: E0-4's five side
  branches read 918–928 apiece and the merged lane read 943 passing of 946: three tests that
  passed on every branch **failed once the packages met** (see "Determinism proof" and `docs/HANDOVER.md`).
  Golden rewrite only when intended: `UPDATE_GOLDEN=1 ... --filter ...`, say why.
- Determinism proof — **FIVE pins, all gate-enforced as of 2026-07-25**, not four:

  | pin | value | enforced by |
  |---|---|---|
  | scenario `--days 3 --seed 42` | `43345ff0c9d62684` | `ci.sh:31` (also twin-run equality) |
  | tick-3000 golden | `5a7224821810b478` | `tests/Perilune.Tests/Golden/perilune_tick3000_hash.txt` |
  | slice tick-3000 golden | `7d846c14c5901e4d` | `Golden/slice_tick3000_hash.txt` |
  | defs **defaults** (`SimDefs.Default.Checksum`) | `df93cbd628644785` | `DefsChecksumTests.cs:75` |
  | defs **rules-inclusive** (the host's `defs:` print) | `fc65c6682d5bee59` | `DefsChecksumTests.cs:156` |

  **Last mover: THE WRECK START's recovery economy (2026-07-28) — P4 and P5 only.** Two def fields
  in one wave (`wear.wreck_threshold` + `wear.swarf_service_condition`, and `deconstruct.device_swarf`)
  took P4 `62a1bb2633c447be`→`df93cbd628644785` and P5 `4c15dffe98a2cda8`→`fc65c6682d5bee59`.
  **P1–P3 HELD and that is measured, not predicted**: no shipped ship has a device below the 0.25
  floor inside the pinned windows, and the first behavioural divergence on `--ship grid` is at
  **sim-hour 630** — 630 hours of byte-identical output. `ci.sh` needed no edit (it pins P1 only).
  The three lanes merged beside it (`devices` channel, damaged-device authoring, wrecked art) moved
  **nothing**, verified mechanically.

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
  **The `marks` channel (2026-07-26) moved NONE of the five** — worth stating because it **does touch
  `sim/`**: its entire `sim/` diff is comment-only (a `GlyphMapper.cs` retraction note), verified
  mechanically with `git diff main...HEAD -- sim/ | grep '^+' | grep -v '^+\s*//'` → empty. That is
  the check to copy when a lane must edit a sim file for prose reasons.
  **Last mover: the DECK-CONFINED WANDER (2026-07-25) — ONE pin, the slice golden,
  `1f8f2225ee568de9`→`c565a68b810f588d`.** `PathService.TryRandomWalkableTileNear` no longer boxes Z
  by the radius; it pins the idle draw to `origin.Z`. The slice's crew are `AutoWander = true`, so
  their cross-deck draws changed and their tick-3000 state with them. **The other four HELD, and two
  of them held against expectation — so measure, never predict.** **They held for two DIFFERENT
  reasons, and conflating them is a mistake this lane made and had corrected in review.** The scenario
  `--days 3 --seed 42` pin was *expected* to move and did **not**, because of the MAP: that run is
  `hosts/scenario/Program.cs`'s hand-built `BuildScenario`, a single-deck 22×6 ASCII map, and
  `AsciiWorld.Build` over one `string[]` gives `world.Depth == 1` — so the old `origin.Z ± radius`
  bounds already clamped to `zLo = zHi = 0` and **that pin could not have moved under any crew
  flags**. (Its 2 crew come from `sim.AddCitizen`, which sets no flags, so they are
  `AutoWander = false` **and `HoldPosition = false`** — *not* held. Do not repeat the earlier draft's
  claim that they are.) `ci.sh:31` needed no edit at all. The tick-3000 golden held for the OTHER
  reason, on a different ship: `AuthoredShips.Perilune()`'s two crew really are
  `HoldPosition = true` (`AuthoredShips.cs:170-171`), so nothing there wanders.
  Both defs checksums held because the deck confinement is
  a **literal, not a def field** — it is a rule (idle crew do not climb ladders for nothing), not a
  tunable, and it deliberately buys no new hashed state. Before that: **E0-5** (deconstruct/strip)
  moved the first four. **E0-4 moved nothing** — no hashed
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
- **Play: `./play.sh`** — one command, one terminal, one game. It builds the host, starts it
  plus `client/serve.py`, waits until both actually answer, prints the single URL
  (`http://localhost:8331/?port=8330`) and opens it; Ctrl+C stops **both** (no orphaned
  `PeriluneWeb`/`serve.py`). A busy port is named, not swallowed. Override with
  `./play.sh --host-port N --client-port N` (or `PERILUNE_HOST_PORT`/`PERILUNE_CLIENT_PORT`);
  `--no-open` skips the browser. **There is no ship to choose** — `hosts/web` defaults to
  `--ship grid`, the one standard surface (Level-1 Overview + Level-2 Room Zoom).
  The host's own page (:8323 by default, :8330 under play.sh) is the LEGACY skin — no dialogue UI.
- **Test fixtures, not games** (they still work; never offer them to a player):
  `--ship slice` — the 8-crew economy measurement fixture, driven headless by `hosts/scenario`
  (`--dump --days 1 --metrics`, the occupancy legs); `--ship perilune` — the generated/layout
  ship behind the tick-3000 determinism goldens, and still `SimHost.Build`'s own default
  parameter (only `hosts/web`'s player-facing default moved to Grid). Run either directly:
  `~/.dotnet/dotnet run --project hosts/web -- --port 8330 --ship slice`. Terminal skin:
  `... --project hosts/tui -- --play`.
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
