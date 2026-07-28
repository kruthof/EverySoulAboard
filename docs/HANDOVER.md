# HANDOVER — Every Soul Aboard *(codename PERILUNE)*

**Last updated 2026-07-27.** Game title is **Every Soul Aboard**; "Perilune" stays the internal
codename (repo, `Perilune.*` namespaces, and the ship MSV *Perilune* all keep it — nothing in code
is renamed). Tag `v2-talking-ship`.

## ⇒⇒ START HERE — the 2026-07-28 orientation. READ THIS BLOCK ONLY; everything below is history.

> ### ⇒ FOUR LANES LANDED OVERNIGHT (2026-07-28) — §5 items 2, 3 and 5 are DONE
>
> **Gate on `main`: `./ci.sh` exit 0, 1122 dotnet + 821 node, twin hashes MATCH `43345ff0c9d62684`,
> ALL FIVE PINS HELD.** `git diff` to `tests/Perilune.Tests/Golden/`, `ci.sh` and `content/` is
> **0 lines across the entire run** — including the lane that changed job dispatch. Counts are a
> **UNION, not a sum**: the four branches read 1102 / 1104 / 1107 / 1097 apiece.
>
> Each lane Opus-implemented, **independently** Opus-reviewed, **every one took a send-back**, and
> every send-back was verified by the integrator in the tree before the merge.
>
> **§5 item 2 — the `MaintenanceSystem` livelock is CLOSED.** `WorksiteSafety.CanStageWorkerAt` asks
> the question nothing in the dispatcher asked: can a crew member **survive** at the tile it is about
> to be parked on. Grid, 14 sim-days, reproduced to the digit by review: **job starts 47 640 → 298,
> services 311 → 309.** ⇒ 47 342 removed starts cost **two** services. The old curve read **91 % busy
> and would have scored A1 PASS** at 2 services/hour.
>
> **§5 item 5 — E0-9's food gap, and the charter was wrong about its own premise.** The "honest"
> number the charter pointed at was itself **2× wrong** (grid read 9.5 days where the truth is 19.0).
> Corrected **in place, in the charter row that commissioned it**. `ShipMetrics.Food` untouched.
>
> **§5 item 3 — `HasIceChain` memoised.** 91.7 M slots/sim-day → 1 250, worth **~1 % and not separated
> from noise**. **A count of slots is not a speed-up**, and that is now recorded in three places.
>
> **§5 item 4 — capping `WastewaterLiters` is MEASURABLY INERT** and was therefore **not built**. Ice
> burn and food come out byte-identical at every cap from 4 000 L down to 100 L, at 3 and 10 days, on
> slice and grid. The ~22.5-day runway reproduces and is **not a property of the pool**. ⇒ the cap is
> **bookkeeping honesty, not an economy fix**. The lever that would move it — melter backpressure on
> pool saturation rather than tank headroom — is **a design call, OPEN ON THE OWNER**.
>
> **Plus a live player-visible bug nobody had chartered:** a closed door drew a **dashed box with a raw
> `+`** in the shipping game. One player gesture away, and the coverage guard **structurally could not
> see it**.
>
> ⚠️ **A SEVENTH TRAP SHAPE is in `CLAUDE.md`: a suite of RATIO assertions cannot see a SCALE error.**
> A 2× over-statement of `DaysOfFood` passed the **entire gate green**, in the very package that exists
> to fix a 2× error.
>
> ### ⇒⇒ WHERE THE ECONOMY PROGRAMME ACTUALLY IS (2026-07-28) — read this before opening `ECONOMY-PLAN.md`
>
> **E0 IS PACKAGE-COMPLETE. ALL NINE WORK PACKAGES HAVE LANDED** — E0-1 labour supply · E0-2
> work-rate rebase + movement retune · E0-3 player verbs · E0-4 filtered stockpiles · E0-5
> deconstruct/strip · E0-6 conversion loss + `Seals` · E0-7 ice → melter → water · E0-8 the ledger ·
> **E0-9 the food gap (2026-07-28)**. Nothing in `ECONOMY-PLAN.md` §1's E0 table is outstanding.
>
> **AND E0'S OWN EXIT GATE IS FAILED ON THE SHIP THAT IS THE GAME.** E0 is defined by a number —
> *"A1 ≥ 25 % busy at sim-hour 24, and A3 'can build a wall at day 3'"*. **Re-measured on `main`
> AFTER all four lanes merged** (`occupancy --ship grid --days 2`, Release, n=1):
>
> ```
> A1 (busy at sim-hour 24, target >= 25 %):  any 0.000 %   work 0.000 %   FAIL
> debris tiles left 40 (dig work remaining: 0) · stockpile tiles zoned 0
> ground stock: Potato=342  Scrap=1  ControllerModule=8  Seals=5
> ice melters 0 (no ice chain ⇒ the B-2 makeup floor is ACTIVE at 20 L — water is being conjured)
> ```
>
> Grid flatlines from ~h20 with two isolated spikes (h41 30.8 %, h48 6.8 % — maintenance that now
> *completes*, post-livelock-fix). **⇒ The checklist is done and the thing the checklist was for did
> not happen.** Say that plainly to anyone who asks whether E0 is finished.
>
> **WHY, and it is not mysterious:** E0-6 closed the fake faucet (the recycler was `1 Regolith →
> 2 Scrap`, conjuring matter); **E0-7 built the real faucet and authored it into `--ship slice` ONLY.**
> The measurement fixture got the fix; the game did not. Grid converts its whole finite matter budget
> into `ControllerModule` by ~h28 and idles forever — which is exactly what that ground-stock line is.
>
> ⚠️ **AND GRID'S WATER IS STILL CONJURED.** `ice melters 0` means **B-2's greywater makeup floor is
> holding the pool at 20 L out of nothing**. We closed the fake *matter* faucet on the standard ship
> and left a fake *water* faucet running on it. Recorded here because no other document says it.
>
> **⇒ THE SEQUENCING CONSEQUENCE, which is the reason this section exists.** The next phase, **E1
> "Entropy bites", is ENTIRELY DRAINS** — spoilage on a temperature curve, hull leak, `Swarf` and the
> metal cycle's real loss, the finite bottled-air reserve, carbonate. **Starting E1 against a ship that
> already dies at h28 with no faucet makes a dead economy die faster and teaches nothing.**
>
> ⇒ **E1 IS GATED BEHIND §4 ITEM 1 — "does `--ship grid` get its own ice hold (or another faucet)?"**
> That single **content decision, which is the OWNER'S**, is what stands between "E0's packages are
> done" and "E0's goal is met". Everything technical is already in place: the ice chain works, the
> melter works, ground-item art means 1 600 units would render as ice and not as dashed letter-boxes,
> and E0-9's ledger can now honestly report the runway. **Do not open E1 before this is decided.**
>
> Two things to fold into that same decision: (a) should **B-2's makeup floor stay** on a ship that has
> a real water chain — it is a second faucet and an invisible one; (b) are grid's **40 debris tiles
> behind sealed airless doors** meant to be reachable work — after the worksite-safety rule, painting
> them does **nothing, silently** (see the follow-up below).
>
> ⚠️ **A3 ("can build a wall at day 3") HAS NEVER BEEN MEASURED.** Not by this run, not by any earlier
> one that I can find. **Do not report E0's gate as "half met" — one criterion is measured FAIL and the
> other is UNKNOWN.**
>
> ### ⚠️⚠️ OWNER REPORT FROM LIVE PLAY (2026-07-28), AND THE CAUSE IS FOUND — READ BEFORE TOUCHING DOOR ART
>
> **The report, verbatim:** *"doors are only drawn in front of empty rooms; as soon as I allocate
> them, they become overwritten."*
>
> **It is NOT a rendering bug and NOT a layer-order bug.** `Commands.cs:630-646` — the
> commission/allocate path — **force-opens and unlocks every door bordering the compartment**, by
> design and with a comment saying why (*"so the room is enterable and its air joins the ship"*). An
> open door is `Glyphs.DoorOpen` `'/'`, and the door package **DELIBERATELY LEFT `'/'` UNSKINNED**
> (`client/src/items/glyph-map.js:130-134`, ledgered as `NO_DEVICE_GLYPH_ART`) on the rationale that
> *"an open doorway is a gap, and the asymmetry is what lets a player see which doors are shut."*
>
> ⇒ **Allocate a room ⇒ its doors open ⇒ their glyph becomes `'/'` ⇒ no art ⇒ the door draws nothing.
> Permanently, because nothing ever closes them again.**
>
> **This was measured on the merge night and NOBODY CONNECTED IT.** The review's own boot census reads:
> deck 0 — **8 doors, all OPEN, all in NAMED (allocated) rooms**; deck 1 — **3 CLOSED, all in
> blank-`anchorName` (unallocated) halls**. That is precisely the correlation the owner is describing,
> sitting in the review report as two neutral rows. **The census was read as geometry ("are doors
> inside room rects?") and never as a JOIN against door STATE.**
>
> ⚠️ **THE RATIONALE FOR LEAVING `'/'` UNSKINNED IS THEREFORE REFUTED BY PLAY, not by argument.** On a
> ship anyone has actually played, **almost every door is open**, so the "asymmetry" does not
> communicate "which doors are shut" — it communicates "this ship has no doors". The art is visible
> only in the compartments the player has *not* commissioned yet.
>
> **The fix is a piece, not a predicate:** skin `'/'` (a recessed leaf / open door pocket — something
> that reads as *a doorway with its door retracted*, not as a wall gap), then retire `'/'` from
> `NO_DEVICE_GLYPH_ART` and from `NON_FURNITURE_CODES`. **It is an ART decision and therefore the
> owner's** — the third of three door pieces, beside `sliding-door` (closed) and `blast-door` (locked).
> Do **not** "fix" it by making commissioning leave doors shut: that would change hashed sim state
> (`Device.IsOpen`), move pins, and break the air-joining the comment exists to guarantee.
>
> ⚠️ **Lesson worth keeping, and it is a NEW shape:** a census that measures *geometry* cannot see a
> defect that lives in *state*. Both halves were measured, on the same night, by the same review — and
> the join between them was never made. **When you census tiles for an art gap, join against every
> state the art keys on.**
>
> ### ⇒ NEW, OPEN ON THE OWNER — added by this run
>
> 1. **A built door has NO removal verb on any surface** ("DOOR-NO-REMOVAL"). DEMOLISH refuses it,
>    STRIP refuses it, `Cmd.remove` is a silent no-op, build-cancel only revokes a *pending* order —
>    and the toast currently points the player at STRIP, which is a dead end. Giving a door an un-build
>    verb is a **design decision**, recorded not fixed.
> 2. **The door art has had no human eye on it.** Doors now draw on the **Level-1 Overview for the
>    first time** (three pieces at boot, deck 1 only). `blast-door` for LOCKED vs `sliding-door` for
>    CLOSED is an aesthetic call; the LOCKED state is **unphotographed**. Shots: `docs/design/shots/`.
> 3. **The OPEN-doorway piece (`'/'`) — the owner report above.** This is now the *first* door
>    question, ahead of item 2: on a played ship almost every door is open, so **this is the piece the
>    player actually sees**, and today it does not exist.
>
> ### ⇒ THE FOLLOW-UP THIS RUN CREATED — the honest cost of closing the livelock
>
> **An order painted in an airless compartment now never progresses, SILENTLY.** This is E0-4 WP-7's
> trade again (`MECHANICS.md` §13.17): expensive-and-visible → **cheap-and-invisible**. It is
> **reachable in play on grid** (two unopened wreck slots, 40 debris tiles behind sealed airless
> doors). The player gets no toast, no tint, no reason — twenty strip marks and silence, forever.
> The only instrument is a print inside a measurement harness the player never runs.
>
> ⇒ **Surface it on the wire.** `CanStageWorkerAt` was made **public for exactly this**. This is the
> largest un-owned piece now, and it is the direct descendant of the lesson that cost three owner
> reports: **a designation the player cannot understand is indistinguishable from a broken verb.**
>
> ### ⇒ what remains of §5, unchanged in order
>
> Item 1 (ground-item art) ✅ · **item 2 ✅** · **item 3 ✅** · **item 4 answered by measurement — do
> not build it expecting an economy change** · **item 5 ✅**. What is left is §4's owner-open list, the
> two new owner items above, and the invisible-failure channel.



> ### ⇒ LATEST: GROUND-ITEM ART LANDED (2026-07-27) — §5 step 1 is DONE
>
> **Gate on `main`: `./ci.sh` exit 0, 1097 dotnet + 801 node, twin hashes MATCH, all five pins HELD**
> — pin-neutrality **measured**: `git diff -- sim/ hosts/ content/ tests/ ci.sh` is **0 lines**.
>
> Imported from the owner's claude.ai/design project via the `claude_design` MCP; diffed
> block-by-block **by label**, which is what revealed that **9 existing device pieces had also been
> redrawn** ("the current ones were difficult to understand"). **68 pieces: 8 new, 9 changed, 51
> byte-identical.** The redraws are a separate commit and revert independently.
>
> **§5 step 1 is discharged.** Eight ground pieces ship; the owner reviewed and approved the art
> from a rendered gallery. `MetalOre` deliberately has **no** art (dead kind). The label plate is
> **demoted, not deleted** — still the no-art fallback. **This unblocks the grid-faucet decision
> (§4 item 1): authoring ice into `--ship grid` would no longer put dashed letter-boxes in a hold.**
>
> ⚠️ **The remaining §5 order is UNCHANGED**, and step 2 — the **`MaintenanceSystem` livelock** — is
> now the largest un-owned piece: a real bug on the game that reads as **91 % busy** and would score
> **A1 PASS** while completing **0 services**.
>
> ⚠️ **A SIXTH TRAP SHAPE is in `CLAUDE.md`**: a predicate over *what a glyph resolves to* is
> defeated by `GLYPH_SUBSTITUTE`, because a substitution means "a device wearing another piece's
> art" — the borrowed row's `kind` is not a fact about the tile. It shipped as a **live regression**
> (DEMOLISH dead on every lamp, click silently dropped) with the suite **green before AND after the
> fix**. Caught by a review deliberately **scoped to code seams only**, the owner judging the art.
>
> ⚠️ **Six of the eight new pieces have NEVER been rendered in the running game** — nothing places
> Scrap, Parts, ControllerModule, Seals, Ice or Corpse on `--ship grid`. Tests and gallery only.
> Also **no driven test anywhere** pins that a device DEMOLISH sends `Cmd.remove`
> (`roomzoom-view.js:875` is unpinned) — a real follow-up.
>
> ### ⇒ the `items` channel LANDED (2026-07-27, earlier the same day)
>
> **Gate on `main`: `./ci.sh` exit 0, 1097 dotnet + 783 node, twin hashes MATCH `43345ff0c9d62684`,
> all five pins HELD, `sim/` diff EMPTY.** Opus-implemented, independently Opus-reviewed, one
> send-back, both fixes re-verified by the integrator.
>
> **What it changes for §5's roadmap.** Step 1 (ground-item art) was chartered on the premise that
> the hard part is `buildItem` having no count channel. **That premise was half wrong in each
> direction.** Easier: `buildItem(id, opts)` already forwards arbitrary `opts` to builders, so a
> `count` key is not a signature change. Harder: **the client never RECEIVED a count at all** —
> ground stacks reached both SVG surfaces only as one glyph char, and that projection loses the
> count, loses all but the topmost stack on a tile (**including two stacks of the same kind** —
> nothing merges them), and loses any stack sharing a tile with a device (pass 4 overwrites pass 3).
> **No builder work could have recovered data that never left the sim.** So the art package was
> split, and this is its first half.
>
> **Step 1 is now UNBLOCKED but NOT DONE.** The channel ships an honest **label plate** (`REGO 40`)
> — a **new visual vocabulary, ratified deliberately**, not sprite art. Room STORAGE on `--ship
> grid` went from seven dashed placeholder chips to **7 plates and zero chips**. What remains is the
> art itself, and it opens with a **design question that is the owner's, not an agent's**: the warm
> 60-piece set has **no** pile, ore, crop, scrap, part or module piece, and its three containers are
> *cosmetic decor* — standing one in would assert "a crate is here" about spilled spoil.
> `docs/design/perilune-art-direction.md` governs the **raster** pipeline and says nothing about the
> SVG set, so **nobody has yet decided what loose stock looks like.**
>
> **A constraint the art package must not discover late:** every builder is a **pure** function,
> "no DOM, no clock, no randomness — same input ⇒ byte-identical output"
> (`client/src/items/helpers.js:1-7`). A pile that reads as scattered must derive its scatter from
> `opts` (index, tile position), **never** from RNG — otherwise it surfaces as a golden-frame flake
> rather than an obvious bug.
>
> **Corpse is NOT a builder problem and should stay out of the art package:** `'&'` is in
> `NON_FURNITURE` on *both* SVG surfaces, so a corpse reaches neither furniture layer and draws
> nothing. That is a surface change.
>
> **Also new, recorded not hidden:** a ground stack on an in-rect door tile now suppresses the
> door's placeholder chip, so the door draws *nothing*. Doubly latent (0 such tiles on grid today);
> the real fix is to make the two `NON_FURNITURE` sets agree.
>
> **A fifth trap shape is now in `CLAUDE.md`** — `assert` throws, so only the FIRST leg of a
> multi-leg test reports, and a second leg that cannot bite is indistinguishable from one that can.
> Blind each leg and require it to fire alone.
>
> **Everything else in §5 is unchanged and still the order I would take it** — the
> `MaintenanceSystem` livelock (a real bug on the game, invisible to A1) is now the largest
> un-owned piece.

### 1. The tree

> ⚠️ **UPDATED 2026-07-27 — the table below is CORRECT; the two lines under it are NOT.**
> **Read the bold heading as "ALL FIVE PINS HELD", not "MOVED".** Nothing has moved a pin since
> `af46d4f`; the packages after it (the **`items` channel**, the **ground-item art**) are
> client-side, measured — `git diff -- sim/ hosts/ content/ tests/ ci.sh` is **0 lines** for each.
> Gate as of this edit: `./ci.sh` exit 0, **1097 dotnet + 801 node**, working tree clean, nothing in
> flight.
>
> **⚠️ THIS BOX DELIBERATELY NAMES NO COMMIT — `git log --oneline -1` is the only answer that cannot
> go stale.** The line it replaced named one, and a *blind-read audit found that stale within the
> hour*, because the very next commit was the one fixing this paragraph. **That is the third
> stale-pointer defect in this file in two days** (the others: a node count quoted forward for a
> whole run while wrong by 18, and this section pointing three packages back). **A handover that
> pins a SHA in prose is writing its own expiry date. Name the invariant, not the position.**

**`main` @ `af46d4f` *(superseded — see the box above)*. `./ci.sh` exit 0.**
**ALL FIVE PINS MOVED** — the biggest determinism change since E0-5, re-pinned in `af46d4f` together
with `ci.sh`, both goldens, both checksum literals and the prose (the ritual):

| pin | value |
|---|---|
| scenario `--days 3 --seed 42` | `43345ff0c9d62684` |
| tick-3000 golden | `5a7224821810b478` |
| slice tick-3000 golden | `7d846c14c5901e4d` |
| defs **defaults** | `62a1bb2633c447be` |
| defs **rules-inclusive** (host's `defs:` print) | `4c15dffe98a2cda8` |

**Re-measure counts before quoting them.** They moved every package this run.

### 2. ⚠️ THE ONE THING THAT REORDERS THE ROADMAP

**`--ship grid` IS THE GAME.** `play.sh` → `hosts/web` → `Program.cs:44 var ship = ShipChoice.Grid`.
There is no ship to choose. `--ship slice` is a **headless measurement fixture with no UI**, and
`--ship perilune` backs the tick-3000 goldens. **Nearly every economy number in this file was measured
on the slice.** Two separate claims were published this run by extrapolating slice → game; both were
wrong. **When you report a number, say which ship.**

**The consequence, discovered by the owner asking "where do I see the ice?":** E0-7's ice chain is
authored inside `AddSliceMatter` only, `IceMelter` is not in `IsPlaceableFurniture`, and `Ice` is in
`NO_GROUND_ITEM_SPRITE` with `chips: true`. So on the game: **the ice is not there, cannot be built,
and would render as a dashed box with an `i` in it if it were.** The melter wears the **cooker**
sprite as a stand-in.

⇒ **GROUND-ITEM ART IS A PREREQUISITE FOR THE ECONOMY WORK BEING VISIBLE AT ALL, not a follow-up to
it.** Authoring ice into grid today would put 1 600 units of dashed letter boxes in a cargo hold. The
previously-recorded ordering (economy first, art later) is **inverted**.

### 3. What landed (seven packages, 2026-07-26→27)

Each Opus-implemented and independently Opus-reviewed. **Every one took at least one send-back;
several took three.** Newest first: **the E0-6/E0-7 wave** (`7935c2c`, re-pin `af46d4f`) ·
**E0-8 the ledger** (pin-neutral) · **palette overflow** · **device sprites** · **test hygiene** ·
**the `marks` channel** · (see §4k–§4m and `MECHANICS.md` §13.19–§13.20 for the records).

**The headline: the economy's faucet was fake.** The shipped `SalvageRecycler` was
`1 Regolith → 2 Scrap` — mass creation, in the table since before the programme started. Half of
everything the ship produced was conjured. Closed; the arithmetic now predicts the sim to the unit.

### 4. ⚠️ OPEN ON THE OWNER — do not resolve these by implementing

1. **Does `--ship grid` get its own ice hold (or another faucet)?** E0-6 closed the fake one and
   **E0-7 does not repair the game** — grid is A1 **0.000 %** with work stopping after **h16**, worse
   than before this run. This is the biggest open item and it is a **content** decision. **Read §2
   first** — it probably needs ground-item art before it needs a decision.
2. **The five §12 character-simulation decisions** (§4c).
3. **§4f's hall-zoning decision.**
4. **WP-9** (delete the console shell) — hard gate: *"only after a human has played `--ship grid` end
   to end"*. No agent can be that human.

### 5. Next, in the order I would take it

1. ~~**Ground-item art**~~ — ✅ **DONE 2026-07-27, in two packages** (the `items` channel, then the
   art). **Every technical claim in the struck text below was wrong, which is why it is struck and
   not merely ticked:** it said *six* builders (**eight** shipped), listed **MetalOre** (which
   deliberately got **no** art — it has zero references in `sim/` outside the glyph table and cannot
   appear in the game), called Corpse "a separate decision" (it shipped, and needed a **surface**
   change, not a decision), and named the COUNT CHANNEL as *"a registry-signature change touching
   every builder's call path"* — **wrong in both directions**: `buildItem(id, opts)` already
   forwarded arbitrary opts so no signature changed, while the client was never **sent** a count at
   all, so no builder work could have recovered it. **⇒ This is the roadmap's own warning about
   reasoning from a design doc instead of measuring.**
   > ~~six builders (Regolith, MetalOre, Potato, Scrap, Parts, ControllerModule); Corpse is a
   > separate decision. The real design question is the COUNT CHANNEL: `buildItem(id, opts)` cannot
   > express stack size, so 1 unit and 40 render identically — a registry-signature change touching
   > every builder's call path. Nothing in the 60-piece set is a loose pile; crates would assert "a
   > container is here" about loose spoil.~~
> ⚠️ **ITEMS 2–5 BELOW ARE ALL SETTLED AS OF 2026-07-28 — kept because their DIAGNOSES are still the
> record, struck where the outcome differs from what they predicted. See the orientation block at the
> top of this file.** 2 ✅ closed (and its *"278 transitions in one hour"* framing understates it:
> **47 640 job starts over 14 days, and removing 47 342 of them cost TWO services**). 3 ✅ done, and
> **its own charter oversold it — the win is ~1 %, not separated from noise**. 4 ⛔ **answered by
> measurement and NOT BUILT: a cap is inert**, and *"the ice runway is a property of that pool"* is
> **REFUTED** — the runway reproduces unchanged at every cap down to 100 L. 5 ✅ done, and its
> parenthetical **"(31.5 crew-days)"** is **the 2× bug itself**, published in the backlog that
> commissioned the fix.

2. **The `MaintenanceSystem` livelock — a real bug on the game, invisible to A1.** From ~h265 on grid,
   crew burn **70–80 % of all crew-time forever** in `Maintain → Flee → Maintain` against machines in
   unbreathable compartments: measured **278 transitions in one hour, 0 services completed**. It reads
   as **91 % busy** and would score **A1 PASS**. Same class as the haul livelock fixed by E0-4 WP-7,
   never fixed for maintenance. **A second instance exists on `Deconstruct`** (stripping airless decks
   livelocks at 71 % / 25 % Flee with zero progress).
3. **`HasIceChain` perf** — walks **91 721 250 device slots per sim-day on grid**, the ship that can
   never benefit, because its pool sits at the 20 L floor. Fix is one field memoised against
   `sim.DeviceTopologyVersion`, which `WaterSystem.Tick` already tracks 14 lines away; pin-neutral.
   **Charter it on the 91.7 M figure — "42.5 %" is a share of passes, not of CPU.**
4. **Cap `sim.WastewaterLiters`** — filed as an OPEN DEFECT in `WaterSystem.cs`. ~66 % of every litre
   melted is warehoused and never used, so the ice runway is a property of that pool and not of the
   ice economy. Needs a def field and a design call.
5. **E0-9's FOOD GAP** — Food is the charter's named liar, the honest number exists in the harness
   (31.5 crew-days), and nothing reaches the player.

### 6. ⚠️ MEASUREMENT DISCIPLINE — this run's most expensive lessons

- **A1 counts BUSY crew and haul is busywork. NEVER quote it without throughput beside it.** It has
  now fooled this project **five** times. The fifth nearly shipped as a published regression: the
  merged `--strip 40` leg reads **28.771 PASS → 21.153 FAIL** with **throughput IDENTICAL at 19** and
  both robust statistics *improving*, because A1 samples the trough of a curve swinging **13.2 pp
  across three adjacent hours**. **A1 moved down while the economy moved up.**
- **Four distinct shapes of test-that-cannot-bite are now in `CLAUDE.md`.** The fourth generalises:
  **non-vacuity by POPULATION COUNT proves a matcher matched something; it never proves it would match
  the thing.** Make non-vacuity an **INCLUSION test** — plant a known violation, require it be caught.
- **Git's conflict markers are the floor, not the ceiling.** Two lanes fixing the same function
  differently merge textually and are wrong together (this wave: the `[production]` seeding
  *supersedes* the guard; git flagged 14 conflicts and the semantic ones were elsewhere).
- **The design docs describe intent; the mechanics are in the code and in what the sim does when you
  run it.** Three published claims this run came from reasoning over `ECONOMY.md`'s vocabulary instead
  of measuring. All three were wrong. The agent that put it best, after finding four in its own work:
  *"I have been wrong about which line my test reaches every time I did not run the mutation."*

### 7. Claims RETRACTED this run — do not re-inherit them

- ~~"Half the runway was counterfeit."~~ Closing the faucet changes **duration** by ~+3 %; it removes
  ~44 % of the **output**. The recycler's seconds-per-unit owns the clock, not the ratio.
- ~~"A degradation spiral ends the game."~~ Jury-rig is free, infinite, and sets Condition 0.6 — above
  every failure threshold. **461 jury-rigs / 0 overhauls over 19 sim-days.**
- ~~"The Seals surplus proves nothing burns it."~~ A **3-day artefact**. Grid — no melter, no ice
  anywhere — produces 16 and burns them **16 → 5 → 2 → 0 by day 4**.
- ~~"`ControllerModule` needs a consumer to extend supply."~~ **A sink is not a faucet.** It gives the
  player something to spend on; it does not add matter.
- ~~"The ice buys ~15 sim-days."~~ **~22.5**, after a priority inversion was fixed — and that number
  is a property of the uncapped pool (item 4 above), not of the ice.

## ⇒ START HERE — the SUPERSEDED 2026-07-25 orientation (kept: §4a–§4m are still the package records)

**This block is the only thing you must read before you touch anything. Everything below it is
history, newest first.** The section immediately after this one is E0-4's landed record, and it is a
**RETRACTION** — read it before you quote any stockpile number from anywhere, but do not read it as
"what to do next". What to do next is §4 of this block.

### 1. The tree, measured — not quoted

- **`main` is at `11b2ffb`** — the **`marks` channel** landed 2026-07-26 (§4k), the ninth package of
  this run and the first since WP-6. It is the *"biggest un-owned piece"* this block used to point at
  under the name **`designations`**; it shipped as **`marks`** because it carries debris, which is
  terrain and not an order. **Gate re-run on `main` after the merge: `./ci.sh` exit 0, node 694/694,
  twin hash `00e0a2dadb8e5076` MATCH, all five pins held.** *(The dotnet count is **1018**, measured
  by the reviewer on a tree `git diff` proves byte-identical to this merge; the integrator's own
  `ci.sh` run piped the count away, so treat 1018 as verified-by-identity rather than re-read here.)*
- *(Superseded, kept because everything below §4k still describes it:* **`main` was at `b464842`**,
  working tree clean, no worktrees open, nothing in flight.*)*
  **Landed 2026-07-25→26, in merge order — EIGHT packages:** **WP-2** (§4b) · the
  **character-simulation design** (§4c — docs-only, **five owner decisions open**) · **WP-4** (§4d) ·
  **WP-5** (§4e, the ledger reached empty) · **the stockpile move** (§4f, owner decision, rewrote the
  altitude rule) · **BUG-B** the Overview click loss (§4h) · **strip-visible** (§4g) · **WP-6** (§4j).
  The deck-confined wander landed before all of them (§4a).
- **Gate: `./ci.sh` exit 0, 1002 dotnet + 678 node**, re-measured on `main` after the WP-6 merge.
  Twin hash `00e0a2dadb8e5076`. **No pin has moved since the deck-confined wander** — all eight
  packages are pin-neutral, **including `strip-visible`, which DID touch `sim/`**
  (`GlyphMapper.cs`, +6 dotnet tests). It held because `anyStrip` is false on every authored ship, so
  its new branch cannot fire in a golden scenario — **verified, not assumed.** Everything else in the
  run was client-only.
- **`KNOWN_GAPS` IS EMPTY**, and `surface-boundary.test.js` asserts it. **On the standard surface a
  player can now dig, strip AND zone** — dig/strip at either altitude, **stockpile in the Room Zoom
  only** (§4f rewrote the altitude rule; §4e's version is superseded). The honest phrasing of the
  milestone is **"verb-complete with no undo"**, and §4f **widened** that gap: every order verb is now
  swept, so a mis-drag costs a rectangle for all three.
- **⚠️ THREE THINGS WAIT ON THE OWNER — do not resolve any of them by implementing.**
  **(i)** §4f's **hall-zoning** decision — a stockpile can only be painted inside a bound room;
  recommendation is option **(c)**, ＋ADD ROOM already is the path, and the reviewer's argument is that
  this is the altitude rule being consistent with itself. **(ii)** the **five §12 decisions** in the
  character-sim design (§4c). **(iii)** **WP-9** (§4 step 7) — its own gate is *"only after a human
  has played `--ship grid` end to end"*, which no agent can satisfy. **WP-C is NOT in this list** — its
  decision is already taken and binding, so it is buildable now; it is flagged in §4's table only
  because it rewrites the game's one help screen and no test can check that writing.
- **✅ §4g's FIRST defect is FIXED (`lane/strip-visible`, 2026-07-26): a condemned device is now
  visible.** `GlyphMapper` pass 4 re-applies `GlyphColor.Deconstruct` over a condemned device's own
  colour (keeping its glyph), so a strip order on a desk/bed/locker/lamp/plant ships fg 26 and draws
  the amber ring + ✕ exactly as a condemned wall always did; both surfaces now draw their mark layer
  **above** their furniture layer so the recovered byte is not then hidden by the desk's own sprite.
  The lying status line and the Overview's total silence on a placed order went with it.
  **§4g's `designations`/`strips` CHANNEL IS STILL UNBUILT AND STILL WORTH BUILDING** — the fg byte
  cannot survive a crew member standing on a condemned tile (pass 5) or an item landing on one
  (pass 3), and it is still the complete source for all three `cell[1]` limits. It is no longer
  URGENT, because the verb a player reported as broken now visibly works.
- *(Superseded:* 996 + 641 @ the WP-5 merge; 996 + 621 @ WP-4; 996 + 607 @ `38ff68b`; 996 + 589 @
  `98f0e63`.*)*
- *(Superseded, kept for the counts' provenance:* **993 dotnet + 589 node**, measured off `3aecf4b`
  (~8 min wall; the dotnet stage alone is ~6.5 min). **Re-measure before you quote this.** Counts have
  gone stale in this file repeatedly, and per-branch counts **do not add on merge** — E0-4's five side
  branches read 918–928 apiece and the merged lane read 943. (Today's last two packages *were* exactly
  additive, which is luck, not a rule: WP-3 landed 993 + 564, WP-8 took node to 589.)*
- **Five pins, all gate-enforced, all measured on `main` @ `98f0e63`:**

  | pin | value | enforced by |
  |---|---|---|
  | scenario `--days 3 --seed 42` | `00e0a2dadb8e5076` | `ci.sh:31` (+ twin-run equality) |
  | tick-3000 golden | `4be2e77864fb7409` | `tests/Perilune.Tests/Golden/perilune_tick3000_hash.txt` |
  | slice tick-3000 golden | **`c565a68b810f588d`** | `Golden/slice_tick3000_hash.txt` |
  | defs **defaults** (`SimDefs.Default.Checksum`) | `5a471d12643b64f9` | `DefsChecksumTests.cs:69` |
  | defs **rules-inclusive** (the host's `defs:` print) | `3f23ce5bd40283c8` | `DefsChecksumTests.cs:146` |

  *(All five re-verified on `main` @ `b464842` after the WP-6 merge — the "measured on `98f0e63`"
  above is the value's provenance, not the last time it was checked.)*
  The last two are **different values for different things** and have been confused repeatedly:
  `3f23ce5bd40283c8` is what every occupancy run prints at the top of its output — never paste it into
  the defaults pin. **Last mover: the deck-confined wander** (`61dea33`), which moved the slice golden
  `1f8f2225ee568de9`→`c565a68b810f588d` and **held the other four**. `ci.sh` needed no edit, and §4a
  records why — the reason is not the obvious one.

**Landed on `main` on 2026-07-25** (`git log --first-parent`) — the run BEFORE the overnight one.
For the 2026-07-26 run see §1's eight-package list and §4a–§4j:

| # | commit | what |
|---|---|---|
| 1 | `0be9d70` | **E0-4** filtered stockpile zones — chartered as six packages, shipped **eight** |
| 2 | `fd73d1b` | the **economy-modularity audit** + `ArchitectureBoundaryTests.cs` + the two defs pins |
| 3 | `d43f545` | the architecture-allowlist fix — **deliberately merged with no review round** (recorded below) |
| 4 | `da90e36` | **WP-7** RELATIONS re-homed as a body-level sibling — fixed a **live** regression |
| 5 | `5708151` | **WP-0** the surface-boundary guard (the `KNOWN_GAPS` ledger lives here) |
| 6 | `7d24ff5` | **WP-1** `--ship grid` made playable: a wreck to dig, a goal, eight crew |
| 7 | `2316c58` | the **E0-4 record retraction** (the section below this block) |
| 8 | `8d5aebf` | the **console-retirement plan**, `docs/design/perilune-console-retirement.plan.md` (docs only) |
| 9 | `7ba1ec9` | **one game, one command**: `./play.sh`, and `hosts/web` defaults to `--ship grid` |
| 10 | `e26a56c` | **WP-3** the `zones` wire channel + the zone overlay, key and tooltips |
| 11 | `3aecf4b` | **WP-8** on-map work markers, the crew-watch task line, the paused-ship nudge — **and a host pause bug** |

**How WP-3 touched a SPINE file, and the pattern to copy.** `hosts/web/WireFormat.cs` is on the spine
list (`CLAUDE.md` "Invariants": integrator lane only). WP-3 needed a whole new `zones` channel there.
**Its entire diff to that file is ONE TOKEN** — `class` → `partial class` — with the channel itself in
a sibling `hosts/web/WireFormat.Zones.cs`. That is the cleanest example in this repo of how to touch a
spine file: make the spine edit trivially reviewable and put the substance next door. Copy it.

**A shipped bug fixed in passing, worth knowing about because it made the game lie.** WP-8 found that
**pause was applied to the sim and never broadcast**: the ship stopped while the top bar still read
`❚❚ HOLD`. The mechanism is worth remembering because it will recur in any throttled render loop —
`viewChanged` was a **per-iteration local** that was discarded whenever the render throttled, and only
a *tick* reopened the render gate, which a paused sim never produces. It is now folded into a sticky
`_viewDirty` (`hosts/web/GameSession.cs:89`, folded `:226`, gated `:227`, cleared `:230`).
Independently re-measured: **every pause was lost and every unpause was delivered** — unpausing
restarts ticking, which reopens the gate — and that single mechanism reconciles the three different
loss rates quoted while the work was in progress (7/8, 9/10, 5/10; they differ only in how many trials
happened to be pauses). **No over-broadcast**: 9.88 → 9.92 msgs/s, and 0 msgs while paused with no
input.

### 2. What the game *is*, in five facts. Get these wrong and you will build the wrong thing.

1. **There is ONE game and ONE command: `./play.sh`.** No `--ship`, no ports to pick, one URL, Ctrl+C
   stops both processes (`play.sh`; `hosts/web/Program.cs:44` `var ship = ShipChoice.Grid`).
   **`--ship slice` and `--ship perilune` are TEST FIXTURES, not games** — slice is the headless
   economy measurement fixture driven by `hosts/scenario`, perilune is the ship behind the tick-3000
   goldens. Never offer either to a player.
2. **The standard surface is the Level-1 Overview (`client/src/ui/overview-view.js`) + the Level-2
   Room Zoom (`client/src/ui/roomzoom-view.js`).** The console `.app` shell (`client/index.html:11-128`
   + `client/src/ui/hud.js`) is **deprecated, closed to new work, and scheduled for deletion**. This is
   a binding `CLAUDE.md` invariant ("THE STANDARD SURFACE"), mechanised in
   `client/test/surface-boundary.test.js` and `tests/Perilune.Tests/SurfaceBoundaryTests.cs`. **Altitude
   rule: BUILDING is Room-Zoom-scoped; ORDERS are deck-scoped** (plan §4.2).
3. **DIG, STOCKPILE, STRIP and the ACCEPTS chips DO NOT EXIST on the standard surface.** Blunt version:
   on the ship a player actually plays you can build and decorate and you **cannot dig, zone or strip**.
   That is the debt ledger `KNOWN_GAPS` (`client/test/surface-boundary.test.js:132`), and it holds
   exactly three entries — `dig` → WP-4, `stockpile` → WP-5, `strip` → WP-4. Garvin hit this twice in
   one day looking for menu items that were never ported. The verbs are fully built in the sim and on
   two *other* surfaces (the deprecated console and the TUI); only the standard surface lacks them.
   **What WP-3 did change:** the game can now **explain why a stockpile zone is not filling** — floor
   marks, a visible key (`STOCKPILE` / `ACCEPTS FOOD` / `NO HAULER REACHED THIS RECENTLY`) and a
   per-tile tooltip, verified in Chrome at five viewports. So a zone is now legible on the standard
   surface; it is still not *creatable* there. Reading came before writing, deliberately.
4. **LLM-ready, not LLM-powered** (owner decision, binding, plan §1.5). The game must ship **fully
   playable with no free-text conversation surface reachable** — a governance/liability stance, and it
   is *stronger* than the old "playable offline (TemplateBackend)" invariant, which removed the cloud
   dependency and not the conversation. All crew interaction later consolidates into **one Persona
   window whose design is deferred**; the seam is `openPersonaForSelected` and `CREW_INTERACTION`
   (`client/test/surface-boundary.test.js:793`) fails a lane that scatters a second door to a person.
   Vocabulary discipline in every doc, commit and UI string: "LLM ready", "opt-in integration",
   "character simulation" — never "LLM-powered", never "talk to your crew" as a shipped promise.
5. **Automation & souls is the binding principle for all economic/automation work**
   (`docs/design/perilune-automation-and-souls.md`; the play-experience reading is
   `docs/design/perilune-automation-player-journey.md`): control-not-conveyance, the operator model
   (mood + skill = throughput), gated by scarcity. **Measured state: 0 % implemented** — see §6 item 4.

### 3. In flight right now

**NOTHING. `main` is settled and gated at `b464842`, the working tree is clean, and `git worktree
list` shows only the main checkout.** All eight packages of the 2026-07-25→26 run are merged,
re-gated and recorded (§4a–§4j). **No lane is open and no agent is running.**

**The porting chain is DONE through WP-6.** What remains in the console-retirement programme is
**WP-C** and **WP-9** (§4 steps 6 and 7), and **both need the owner** — see §1's three-things list.
The largest *un-owned* piece of work is the **`designations` channel** (§4g/§4i), which is
unscheduled and does not need a decision, only a charter.

**Two-thirds of the packages in this run took exactly one send-back before PASS** — WP-2, WP-4, WP-5,
BUG-B; the stockpile move, strip-visible and WP-6 passed first time, which is the first time that has
happened in this repo. **Treat a first-round PASS as a result to check, not a fast one** — of the three
that passed first time, two were reviewed on the reviewer's own live rig and the third had its
headline claim re-measured independently. **Start at §4 step 8**, the summary of what is actually
next.

### 4. NEXT STEPS — in this order. Do not infer the order; it is written down.

> **⇒ READ THIS FIRST — STEPS 1–5 HAVE ALL LANDED. As of 2026-07-26 the actionable list is short:**
>
> | what | needs the owner? | where |
> |---|---|---|
> | ~~**The `designations` channel**~~ — ✅ **LANDED 2026-07-26 as the `marks` channel** | — | **§4k** |
> | **Unskinned device glyphs** — GrowBed `"`, Terminal `T`, Telescope `x` have **no client sprite**, so the Room Zoom draws a debug placeholder with the raw letter in it. Found by Garvin from live play; pre-existing; no test can see it | **no** | §4l |
> | **The palette clips below ~1140 px** — STOCKPILE/STRIP/DEMOLISH scroll off with **no affordance** (`scrollbar-width:none` + a `::-webkit-scrollbar{display:none}` rule hide it deliberately) | **no** | §4g |
> | `shelf`/`rug` are client-local decor that STRIP can never touch — a trap on a palette where everything else is real | **yes** (design) | §4g |
> | **WP-C** — the conversation stand-down + onboarding rewrite | **not to AUTHORISE** — that decision is taken and binding — but it rewrites the game's ONLY help screen, the first thing a new player reads, and **no test can check it** | step 6 |
> | **WP-9** — delete the console shell | **YES, HARD GATE.** The plan's own words: *"only after a human has played `--ship grid` end to end"*. **No agent can be that human**, and the package is a SPLIT of `hud.js` (wire cache + armed-tool state machine + console chrome, fused; both modern surfaces import it) with almost no test net | step 7 |
> | The character-sim design's **five §12 decisions** | **YES** | §4c |
> | §4f's **hall-zoning** decision | **YES** | §4f |
>
> **⇒ ✅ THE PARAGRAPH BELOW IS DISCHARGED — the channel LANDED on 2026-07-26 as `marks` (§4k), and
> it did close what it promised: passes 3, 4 and 5 can no longer erase a mark, photographed on the
> standard surface. Read it for the reasoning, which held up, not as a thing still to do. Its ONE
> wrong prediction is instructive and is recorded in §4k: it said the channel closes "plan §5's gap 1
> on the Overview". It does NOT — gap 1 needs the accept MASK, which lives on `zones`, not here. What
> the channel actually did for gap 1 is UNBLOCK it, by removing the second-producer objection §4j
> declined it on. Nothing reads fg-16 any more.**
>
> **The `designations` channel is what I would charter next.** It is not urgent — the verb the owner
> reported as broken now visibly works (§4g) — but it is the single change that closes the most
> outstanding limits at once: the strip mark **blinking out** when a crew member crosses a condemned
> tile (pass 5) or an item lands on one (pass 3), **and** plan §5's gap 1 on the Overview, which
> §4j had to record as *narrowed* precisely because no byte-level fix can carry restriction at
> ship scale. Model it on `hosts/web/WireFormat.Zones.cs`, mirroring `DeconstructSystem.Pending`.
> `WireFormat` is a **spine file** — use WP-3's pattern: the spine edit is **one token**
> (`class` → `partial class`) with the substance in a sibling file.
>
> **Do NOT re-offer** having the Overview read the `zones` channel — declined with reasons in §4j, and
> the reviewer asked specifically that it not be raised again; offer the `designations` channel instead.

Most of what follows is the **console-retirement programme**,
`docs/design/perilune-console-retirement.plan.md` (826 lines, on `main` at `8d5aebf`). It is 11
packages; **WP-0, WP-1, WP-2, WP-3, WP-4, WP-5, WP-6, WP-7 and WP-8 are landed — only WP-C and WP-9
remain, and both need the owner.** **Its dependency graph is §6 "Order, and why";
its per-package file sets are §6's table; its honest limits are §10.** Read §6 before dispatching
anything — a package taken out of order produces a vacuous acceptance test, which is this repo's most
common review failure. **Step 1 below is NOT part of that programme** — it is a standalone `sim/` lane
that goes ahead of it by decision, because it is the cheapest change that makes the standard play ship
look alive, and it is the only step here that moves determinism pins.

> **⚠️ STANDING RULE — if a module has an injectable seam, a source scan is not an acceptable
> instrument.** A text scan asserts that tokens are **co-present**; it can never assert that token A
> *causes* behaviour B. **Five instances of that defect landed in one package today — and the fifth was
> introduced by the fix for the previous four.** Tightening the patterns cannot close the class, only
> that shape of it. What worked, twice, on the first try: **replace the scan with a driven test.**
> `client/test/dom-lite.js` already exists (four tests use it; `getElementById`, `dataset`, `closest`,
> `addEventListener`) and `initOverview({ send })` already injects the sender, so **a dozen lines can
> drive a handler and assert the command that comes out.** This is **binding for WP-9**, the riskiest
> remaining change.

> **And the through-line of the whole session: every significant defect today was found by *doing*,
> not by reasoning.** Physically applying the mutation; opening the browser; measuring with a `Range`
> instead of trusting `getClientRects`. In each case the reasoning was competent, the result was wrong,
> and the suite was green. **A mutation you only described is not evidence.**

> **The review discipline is not optional, and it is what caught real defects in every single package
> that landed today: one agent implements, a *separate* agent reviews, and the reviewer physically
> applies every mutation the tests name and watches it go red.** Every E0-4 and E0-5 package failed its
> first independent review, most of them on "a test whose named mutation cannot bite"; both of today's
> final two packages took one send-back each. The two traps that have cost this project real work are
> written up with `file:line` countermeasures in **`CLAUDE.md`, "Traps that have each cost this project
> real work"** — read that section before you write a guard test or a mutation harness.

> **⚠️ THE ORCHESTRATION RULE — binding, owner decision (Garvin, 2026-07-25). The session instance does
> NOT implement.** Every work package is executed by **two Opus 5 subagents: one implements, a second
> and separate one reviews.** The instance that reads this file **orchestrates only** — it charters the
> package, creates the worktree, dispatches the two agents, adjudicates send-backs, and does the
> integration (merge, re-pin, `HANDOVER.md`, memory). It does not write the package's code and it does
> not review its own dispatch. *Why it is a rule and not a preference:* the implement-then-independently-
> review discipline caught a real defect in **every** package that landed on 2026-07-25, and the defects
> it caught were overwhelmingly of one shape — a test whose named mutation cannot bite — which is
> precisely the shape an author cannot see in their own work. An orchestrator who implements has
> silently collapsed the two roles back into one. **Give the implementer its own worktree and its own
> log filenames** (E0-4's lesson: shared filenames across parallel packages corrupt measurements), and
> tell it explicitly that a separate reviewer will physically apply every mutation its tests name.

> **⚠️ The plan's `client/` line numbers have DRIFTED, because WP-1, WP-7 and WP-8 landed after it was
> written. Re-locate every symbol by NAME, never by line.** Measured examples: `hud.js` is **1210**
> lines, not the plan's 1291 (WP-7 lifted ~90 out, WP-8 put ~10 back); `overview-view.js`'s TALK button
> is `:241` with its handler at `:652`, not `:234`/`:645`; `overviewClickAction` is `:67`, not `:66`;
> the stale `MECHANICS.md` line the plan cites as `:1829` is now `:2090`. The plan's *reasoning* has
> held up under verification everywhere it was checked; only its coordinates rotted.

**1. ~~THE DECK-CONFINED WANDER~~ — ✅ LANDED `61dea33`, merged `98f0e63`. Do not re-do it; read §4a
for what it measured and for the one number in it that is a known property rather than a win.** The
charter below is kept because its *reasoning* is the model for the next sim lane — and because one of
its predictions was wrong in an instructive way (it predicted the scenario pin would move; it could
not have). **Next actionable step is 2, WP-2.**
- **The problem, and why it is a cause and not a symptom.** All eight grid crew are
  `AutoWander = false` (`sim/Sim.Gen/AuthoredShips.cs:967`), so idle crew stand still and the ship
  reads as lifeless. Simply flipping the flag walks them into vacuum:
  `PathService.TryRandomWalkableTileNear` (`sim/Sim.Core/Path/PathService.cs:157`) boxes **Z** along
  with X and Y (`:167-168`), and the default `wander_radius_tiles` (8) is **≥ the grid ship's depth
  (8)** (`AuthoredShips.cs:764` `GridDepth = 8`), so the box saturates the whole world and **one idle
  draw can land a crew member on any of the eight decks** — six of them airless from tick 0, walkable
  because the ladder trunk reaches them. **Bounding the Z extent of the sampler to the crew member's
  own deck fixes the cause.** Flipping `AutoWander` without it treats the symptom and adds a hazard.
- **Record the overstatement, so it is not inherited.** *"An idle wander is a death sentence here"* was
  **wrong**. Measured with `AutoWander = true` over one sim-day: **8/8 alive**, work **24.990 %** against
  **24.938 %**, and **4.46 % of all crew-ticks in `JobKind.Flee`** (`AuthoredShips.cs:745-756`).
  Survivable but **wasteful** — crew walking out of vacuum for nothing, on the ship a new player is
  watching. That is the real argument, and it is a weaker and more honest one.
- **Files:** `sim/Sim.Core/Path/PathService.cs` (the sampler's Z bounds), the def side if the deck
  confinement is expressed as a def rather than a literal, and `sim/Sim.Gen/AuthoredShips.cs` for the
  `AutoWander` flip and its header note. A new def field ships in **ONE** commit — default + parser key
  + checksum fold + equivalence coverage (`CLAUDE.md` invariant, `content/core/SimDefs/README.def`).
- **⚠️ THIS WILL MOVE PINS, AND THE PIN MOVE IS THE POINT OF THE COMMIT — not an accident inside it.**
  Expect the slice golden and the scenario hash to move; a def field also moves the defs checksum(s).
  The full ritual in the **same** commit: measure, then update `ci.sh` + the golden files + `CLAUDE.md`
  ("Determinism proof") + this file + memory, each stating the old value, the new value and **why**.
  **This is normal here** — E0-1, E0-2 and E0-5 each took a deliberate pin move. A pin that moves
  without a stated reason is the failure; a pin that moves with one is the ritual working.
- **Discipline:** its own worktree, its own branch, one implementer and a **separate** reviewer.
- **Wrong if:** it flips `AutoWander = true` without bounding the sampler (that is the hazard, measured
  above); if it bounds X/Y as a side effect and changes local dispersal (the box's corner behaviour and
  the fixed 3-draw, zero-alloc, RNG-stream-stable shape are deliberate — see the method's own doc
  comment); if it re-pins without re-measuring; or if it changes pins and `ci.sh` in **different**
  commits.
- ⚠️ **One number to re-measure rather than inherit.** The whole-day idle share on the grid ship was
  quoted in conversation as **`None` = 67.19 % of crew-ticks** and that figure is **recorded nowhere in
  this repo** — do not cite it until it is measured. What *is* on record: the standard play ship reads
  **A1 FAIL — 24.938 % busy at sim-hour 24**, and that floor is **Craft 31.00 %**, not the wreck (dig is
  1.77 % of crew-ticks and finishes around h13; see `8159e6f`'s attribution correction). Those are the
  numbers a before/after belongs against.

### 4a. The deck-confined wander — LANDED (`61dea33`, merged `98f0e63`, 2026-07-25)

**What shipped.** `PathService.TryRandomWalkableTileNear` bounds Z to `origin.Z` (a **literal, not a
def field** — owner decision: deck confinement is a rule, not a tunable), and the eight grid crew are
`AutoWander = true`. The X/Y box, the 10-attempt loop and the **fixed 3-draw RNG shape are
byte-identical** — the reviewer checked that at `SimRng.NextInt(1)` rather than trusting the comment,
because a 2-draw version would silently re-roll every wander stream.

**Measured, grid ship, `occupancy --ship grid --days 1`, default seed, n = 1** — three legs, because
the middle one is what makes the case:

| leg | alive | `Flee` | A1 work @ h24 | idle `None` |
|---|---|---|---|---|
| A shipped (`AutoWander=false`) | 8/8 | 0 / 6 912 000 | 24.938 % FAIL | 67.19 % |
| B flag flipped only, old sampler | 8/8 | **308 120 / 6 912 000 = 4.46 %** | 24.990 % FAIL | 62.73 % |
| C landed (flag + deck-bounded) | 8/8 | **0 / 6 912 000, exactly** | 24.990 % FAIL | 67.15 % |

Leg B reproduces the previously-recorded 4.46 % / 24.990 % / 24.938 % **exactly**, which is the
harness self-check that makes leg C's zero believable. Both legs were re-measured independently by the
reviewer at raw crew-tick precision, not from the rounded prints.

**The headline is not the `Flee` zero — it is that the ship is now alive, and that was MEASURED, not
inferred.** Instrumented idle crew-ticks with a live path: **0 → 3 529 866** over one sim-day —
**76.06 % of idle time spent walking, 51.07 % of the entire sim-day.** The implementer had honestly
flagged "I did not open a browser"; the reviewer closed the gap with a number instead. **A1 is
unmoved at 24.990 % FAIL** — wandering is not work, and this lane never claimed it was.

**⚠️ A known property, not a win, and it will bite a future ship.** An idle crew member never wanders
*back* to a deck it left, so crew slowly accumulate on their last job's deck (deck-0 crew-ticks
2 161 920 → 1 702 000). Harmless *here* because deck 1 is pressurised and because jobs, sustenance and
flee all path through the **unbounded** `FindPath` — `TryRandomWalkableTileNear` has exactly one
production caller (`CitizenSystem.cs:74`, the idle wander). **On a ship whose upper decks are not
survivable, re-examine this before authoring crew there.**

**Pins: the slice golden moved `1f8f2225ee568de9`→`c565a68b810f588d`; the other four held, and
`ci.sh` correctly received no edit.** The charter predicted the scenario hash would move and **it could
not have** — and the first draft's stated reason for that was *wrong* in a way worth keeping on record,
because it is the exact failure mode the "measure, never predict" rule exists to catch. The `--days 3
--seed 42` run is **not** the 2-crew ship with `HoldPosition = true`; it is `BuildScenario`
(`hosts/scenario/Program.cs:648`), a hand-built **single-deck** ASCII map whose crew come from
`sim.AddCitizen` with **no flags set at all**. At `world.Depth == 1` the *old* bounds already evaluated
to `zLo = zHi = 0`, so that pin was provably immune. `HoldPosition = true` is the correct reason for
the **tick-3000** golden — a different ship (`AuthoredShips.cs:170-171`). Two ships, two reasons; the
draft had chained them into one.

**Process note worth inheriting.** Review found **zero** code or test defects — twelve mutations
applied (the implementer's five plus seven the reviewer invented), none survived — and **four
prose-truth defects**, including the pin reasoning above and the fact that the exact sentence the
commit declared retracted was **still standing verbatim in `SimDefs.cs`**, the def field's own
canonical documentation. The lesson is narrow and real: *this lane's code was right and its
explanation of itself was wrong in four places.* Retractions were then written as **quoted-and-negated**
text rather than deletions, so that someone grepping the old wording lands on the retraction — that is
now the house technique, and it is how this defect was found in the first place.

**2. ~~WP-2 — make debris and designations visible.~~ — ✅ LANDED `9c71878`+`fd02799`, merged `38ff68b`.
Read §4b before building on it: three of its six recorded outcomes are LIMITS, not wins.** The charter
below is kept because WP-4 and WP-5 inherit its file set. **Next actionable step is 3, WP-4.**
- **Do:** read `cell[1]` (the projected `GlyphColor` foreground byte) in both SVG surfaces and render
  a designated tile differently from an undesignated one — debris, stockpile zone tint, strip mark.
- **Files:** `client/src/ui/room-model.js`, `client/src/ui/overview-scene.js`, plus their two node
  test files. Both surfaces today take `cell[0]` and throw `cell[1]` away
  (`room-model.js:233`, `:321`, `:345`; `overview-scene.js:314`) — **the designations already ride the
  wire**; no new channel is needed for these three.
- **Unblocks:** WP-4 and WP-5. Arming a DIG tool over invisible debris is not a portable verb.
- **Wrong if:** it invents a new wire channel for dig/stockpile/strip (they are already on the frame);
  it touches `GlyphColor` (a spine file, deliberately untouched by the whole programme); or its
  acceptance is asserted over hand-crafted cells instead of the real fixture — WP-1 recaptured
  `client/test/fixtures/overview-grid.json` specifically so this test could be driven from a live
  capture carrying both fg byte 4 (Debris) and 15 (Designate).

### 4b. WP-2 — debris and designations made visible — LANDED (`9c71878` + `fd02799`, merged `38ff68b`)

**What shipped.** A new shared `client/src/ui/mark-overlay.js` holds the fg-byte table
(`4→debris, 15→dig, 16→stockpile, 26→strip`) plus one rect-parameterised SVG cell builder, used by
**both** surfaces so a byte cannot come to mean two things by hand-mirror drift. It draws as a **floor
layer** — `overview-scene.js`'s `markLayer()` between `pl-rooms` and `pl-furniture`; `room-model.js`'s
`roomMarkTiles()` + `markLayerSvg()`, wired into `roomzoom-view.js` with the accepted WP-3 footprint
(one import + one `body +=`). Debris renders as rubble; **a designation is the same rubble plus an
amber dashed order ring** — reusing the dialect the build ghosts already speak. **Gate: 996 dotnet
(unchanged, client-only) + 607 node, `./ci.sh` exit 0 on `main`. No pin moved**; no golden and no
`ci.sh` line is in the lane's diff.

**Why a separate layer and not simply un-skipping the glyph — the reason on record was WRONG and is
corrected in place.** All 33 debris/designation cells share glyph code **37 (`%`)**, which sits in
`NON_FURNITURE` on both surfaces, so both rendered as nothing. The first draft justified the new layer
by claiming that removing 37 from that set *"would still draw nothing"*. **Measured, by physically
removing it: `roomCells` then yields 33 cells at code 37 and `furnitureSvg`'s else-branch
(`roomzoom-view.js:429-438`) draws the VS-Z-25 dashed unknown-glyph chip carrying a literal `%` for
each.** It does not draw nothing — it draws 33 junk chips, which is a *worse* lie than invisibility: a
chip claims "something here we don't skin yet" about a tile whose meaning the client knows exactly.
Two further claims in that sentence (that `itemForGlyph` and `demolishTarget`'s device branch get
reclassified) are also false — both are unchanged either way. The decision was right and its stated
reason was wrong; the correction is **quoted-and-negated** at `room-model.js:342`/`:345`, so a grep for
the old wording lands on it. **The twin comment in `overview-scene.js:342` is TRUE for its own
surface** (`furnitureLayer` does `if (!itemId) continue`) and now says why the two differ.

**The review is why this is worth reading.** Round 1 shipped with 5 of the reviewer's 15 mutations
**surviving the full 605-test suite green**. The worst: dropping the room-local transform in
`markLayerSvg` draws every mark at 800–1024 inside a **384-unit viewBox** — the Room Zoom's entire mark
layer **invisible in the running game**, with nothing red. Cause: the geometry assertion recomputed the
transform *in the test* and never read the emitted SVG, so it re-asserted clamping already covered
three tests above. The fix copies `zone-overlay.test.js:106-111` — parse the emitted
`<rect x= y= width= height=>` and pin the numbers. Round-2 re-review applied **29 mutations, 29 red**,
including two that settle the obvious objection that the new test merely restates constants both sides
import: an **off-by-one tile** (stays inside the viewBox, so the bound cannot catch it) and an inset
changed **in the implementation only** — both RED. It is a transform pin, not a constants restatement.
The stockpile swatch's "reused verbatim from WP-3" is likewise *measured*: drifting `ZONE_FILL` on the
**`zone-overlay.js` side only** goes red, which a copied literal could not do.

**⚠️ Three of the six outcomes are LIMITS, not wins — do not inherit them as capability.**
1. ~~**Strip marks are delivered for WALLS ONLY.**~~ **✅ CLOSED 2026-07-26 (`lane/strip-visible`).**
   *As recorded here:* a strip mark on a **device** never reached the wire — `GlyphMapper` pass 4
   (`sim/Sim.Glyph/GlyphMapper.cs:123`) repainted the device's colour over `GlyphColor.Deconstruct`;
   the charter said "strip mark" and what shipped was narrower.
   **⚠️ AND IT WAS FILED AS A LIMIT WHEN IT WAS A BUG.** Listing it here — accurately — is what let it
   sit for a package while the owner reported the verb as broken **three times**. The diagnosis was
   correct and complete on this line the whole time. *The lesson is not "write better limits": it is
   that a limit which makes a shipped verb indistinguishable from a broken one is a **bug**, and
   belongs in the next package rather than in a list.* Pass 4 now re-applies the strip colour over a
   condemned device while keeping its glyph (§4g).
2. **A crew member standing on a designated tile hides its mark** (pass 5, `:138`). Not hypothetical —
   on `--ship grid` the crew cluster in the hold at x25-32 y15-16, exactly where the dig designations
   are.
3. **`stockpile` (16) and `strip` (26) rendering is covered by SYNTHETIC cells only.** Neither byte
   appears anywhere in the fixture, so nothing proves the *shipped game* draws them. The tests label
   this honestly and separate it from the fixture-driven acceptance — but it is coverage by
   construction, not by capture.
   **Partly narrowed 2026-07-26, and the remaining half is the honest one.** The **sim** half of
   fg 26 is now driven end to end against the real projection — `StripVerbTests` designates through
   the real command, reads the real registry and asserts the real `GlyphMapper` output, for a device
   AND a wall in one sim. The **client** half is still synthetic: the node tests plant fg 26 into a
   cell of the real capture rather than capturing a frame that already carries one, because no
   authored ship condemns anything at boot. Closing that needs a capture taken *after* a designation,
   which nothing in the pipeline produces today.

**Carried forward to WP-6 (recorded here so it is not rediscovered):** the two surfaces will **visibly
disagree about a stockpile that has things in it.** The Overview's fg-16 tint vanishes the moment an
item is stored on the tile (`GlyphMapper` pass 3); the Room Zoom's `zones`-fed tint does not, because
it comes from a strictly better source. The `zones` channel already exists and the Overview could read
it. The Room Zoom's deliberate suppression of fg-16 is **de-duplication, not inconsistency** — its rect
is geometrically and stylistically identical to `zone-overlay.js:72-74`, verified.

**Two smaller things worth knowing.** The new geometry test is **deliberately over-tight** — it
duplicates `rubble()`'s `0.12`/`0.76` insets, so a purely cosmetic change to the rubble shape now
reddens a *geometry* test. That is the safe direction, but someone will hit it. And the `fd02799`
commit message claims **"+18 net assertions"**; measured, it is **+12** (268 → 280 `assert.*`, tests
61 → 63). Both removals were replaced by strictly more, and all 17 round-1 mutations were re-run to
confirm no old coverage left with them.

**⚠️ An inherited pointer that has now rotted twice: `client/test/fixtures/overview-grid.json`'s own
`note` tells a maintainer to regenerate it with `scratchpad/wp8-capture.mjs`, which exists NOWHERE in
the repo.** WP-2's two new failure messages were reworded to warn rather than propagate it, but
**regenerating that fixture is now an undocumented manual procedure**, and WP-4/WP-5/WP-6 all depend on
it. Whoever next needs a recapture should write the script into the repo, not the scratchpad.

### 4c. The character-simulation design — LANDED docs-only (`0a630ec`, 2026-07-26). **NOTHING IS BUILT.**

`docs/design/perilune-character-simulation.plan.md`. Planned by **Fable** from an owner brief (*an
in-depth character simulation, possibly Big Five, personal history shaping how a person thinks and acts
now, incidents and current relationships modulating behaviour*), then reviewed by **three independent
Opus 5 agents on three lenses** — architecture/determinism, game-design/legibility, psychological-
validity/governance — plus two focused re-reviews. **All three: ADOPT WITH CHANGES.** Three commits are
kept separate (`a592e5e` r1, `bf54b1d` r2, `b28a532` r3) so each review stays legible against the
version it reviewed. **No code, no defs, no pins; the gate is untouched.**

**⚠️ §12 HOLDS FIVE DECISIONS THAT ARE THE OWNER'S AND ARE NOT TAKEN.** Each carries a recommendation
and a specified refusal path: ① charter axis drift now or later; ② give `--ship grid` social ignition
(authored relationships including a **negative** pair, plus minority RaidTrauma on the flagship eight);
③ may a late flee be survivable-only-sometimes; ④ Openness in v1; ⑤ name **assignment** as the player
verb this substrate exists to enable. **Do not resolve any of them by implementing.**

**The plan's shape changed under review, and how it changed is the most useful thing here.** It began
Big-Five-first. It ends **marks-as-engine, Big Five as the prior**. Two reviewers reached that
independently — one from the extreme-environment literature (in isolated/confined/extreme settings
behavioural variance is **state**-dominated; trait screening predicts poorly, state monitoring predicts
well), one from drama — while the third proved the marks layer **cannot fire on `--ship grid` at all**.
That collision produced the **event-supply audit** (§0.2), now the section the rest of the plan rests
on, and its finding that **idle movement is the only high-bandwidth channel this game has** is what
promotes the opinion-weighted co-location wander to the load-bearing visibility mechanism.

**Three findings were defects that read as features. Keep them; they are the transferable lessons.**
1. **An arithmetic defect that silently voided two other features.** A bond-relief step at `×0.9` per
   event against a **measured 2 611 bond events/sim-day** (`MECHANICS.md` §13.7) is `0.9^650 ≈ 10⁻³⁰`
   per citizen per day — it annihilated the 96 h half-life written in the same section, and a mark that
   retires in hours never accumulates dwell, so **chartered axis drift could never deposit.** Now gated
   on tier crossings (29/day) plus a hashed rate limit.
2. **A control whose polarity certified the hole it appeared to block.** A test asserting Feud *cannot*
   fire on the unseeded ship is **green today** and goes red *when the fix lands* — the opposite of the
   red-until-ignition gate it was described as. Now a **positive** test on the shipped grid ship.
3. **Two chartered changes that fight.** `SocialSystem` decay relaxes edges **toward zero
   symmetrically** (`SocialSystem.cs:107-114`), so the retune that keeps the positive graph off its
   clamp also drags the authored −40 pair back toward neutral — and `Enemy` needs ≤ −60. Tuning either
   one alone breaks the other; WP-F must now measure **both legs**.

**Structural facts it established about THIS codebase, useful beyond this design.** `CitizenSystem.cs:30`
uses the **raw shared `sim.Rng`**, not a forked stream, and `Rng.State` folds into `StateHash` — so a
change in draw *count* moves a pin with no field changed, and "neutral-is-identity" is a **whole-sim**
property, not a per-citizen one. There is **no `JobCompletedEvent`** (all 17 event structs enumerated);
there are **nine** genuine completion sites across six systems, and `PromiseBrokenEvent`
(`SimEvents.cs:93`) is **declared but never published**. A new `IStatefulSystem` genuinely ships save +
hash with **one** spine edit against **four** for fields on `Citizen` (`SaveWriter.cs:120-134`,
`SaveReader.cs:160-172`, `Simulation.cs:504-506`). Of **18 goldens exactly two are StateHash-derived**.
`DefsParser.cs` carries **117** parser keys.

### 4d. WP-4 — DIG + STRIP in the Room Zoom — LANDED (`d8b5948` + `8419a5f`, merged 2026-07-26)

**What shipped.** Two new `ROOM_TOOLS` classed **`'order'`** — a fourth command class beside
structural/functional/cosmetic, whose `verb` holds the **wire verb name** and never `'build'` — plus
`isOrderTool`, `isSweepTool` (structural ∪ order, the set all three gesture sites gate on, a function
rather than a literal list so a future tool cannot be wired into one site and forgotten at the others)
and `roomDragMode`. Lowering is `orderCmd` → `Cmd.dig`/`Cmd.strip`. **G arms DIG, V arms STRIP**
(the console's own bindings), and the `built-wall` DEMOLISH toast now names STRIP — that branch was a
dead end before this package existed. **An order drag sweeps the FILLED rectangle**: a designation is
a *region* of intent, and a perimeter would leave the middle of a swept wreck untouched. **Gate on
`main`: 996 dotnet (unchanged, client-only) + 621 node, `./ci.sh` exit 0, twin hash
`00e0a2dadb8e5076`, no pin moved.** `KNOWN_GAPS` is down to **one entry** (`stockpile`, WP-5's).

**Verified end-to-end against the real host — which no test in the suite does.** `G` → drag → exactly
8 `{cmd:'dig',x,y,on:1}` row-major at the right coordinates, **zero `build`**; `V` → drag → 4 strips,
the toast, and the four walls **immediately rendering WP-2's amber ✕**. That is the first time the two
packages were seen working together.

**Why the `fill` decision is right and is NOT a parity break — measured, not assumed.** The console
**cannot sweep at all**: its canvas drag is **pan** (`client/src/input/controls.js:163-166`) and
`paletteOrders` fires only on `press && !press.moved`, so one click = one tile. The TUI is one keypress
= one tile (`hosts/tui/GameLoop.cs:313-322`). **No surface had a designation gesture to be parity
with**, and the Room Zoom was already the only surface that sweeps anything.

**⚠️ THE PACKAGE SHIPPED CORRECT CODE TWICE. Both review rounds found only wrong explanations of it** —
zero code defects across two independent rounds. That is a rare and instructive shape, and the two
defects are both about *evidence*, not behaviour:
1. **A named mutation that could not bite.** The comment claimed that reverting a guard at
   `onCanvasClick` would double-fire the order. Applied exactly as written: **621 pass / 0 fail.**
   Mechanism: past that bail, `onCanvasClick`'s tail is an if/else-if chain over `pc.cls` handling only
   `functional`/`cosmetic`/`demolish` — there is **no `order` branch and no `structural` branch** — so an
   armed order falls through and sends nothing. **The bail cannot prevent a double-fire because there is
   no second fire to prevent.** It is a defensive *second* guard; the first is a branch that does not
   exist. Now withdrawn quoted-and-negated, and the **source** comment at the bail says so too, which is
   where the next author looks. The replacement is a legitimate **two-edit** mutation, and the reviewer
   proved it properly by running three legs: adding an `order` branch alone **survives**, dropping the
   bail alone **survives**, both together go **RED** — leg 1 is what convicts, because it shows the bail
   is precisely what neutralises the hazard the branch creates.
2. **Two headline sweeps that could not tell `fill` from `perimeter`.** The drags were 3×2 and 2×2 —
   **every tile is on the border**, so the two modes coincide and the comments claimed to pin a fill they
   could not see. Now 3×3 with an explicit interior-tile assertion at `(29,15)`, and STRIP uses the
   **identical 3×3 gesture as the WALL control** so one gesture over one tile-set commits **9 for an
   order against 8 for a wall**, asserted as a contrast in the same test. Reverting `roomDragMode` now
   reddens **6** tests, up from 2.

**⚠️ MY CHARTER NAMED AN ACCEPTANCE CRITERION THAT COULD NOT FAIL, and it is on record here so it is not
repeated.** *"A drag sweeps and is clipped to `roomBounds()`"* is **inert on ordinary mouse input**:
`onCanvasDown` bails on a null tile, `onCanvasMove` assigns `_drag.end` only when non-null, and
`tileFromCanvasXY` → `clampTileToRoom` rejects out-of-room points — so **both endpoints are always
in-room, and the bounding box of two points inside an axis-aligned rectangle is inside it.** Dropping
the `roomBounds()` argument reddens **exactly one** test, the shrink-mid-sweep one; the fixture-driven
out-of-room-debris drag stays **green**, proving it exercises `tileFromCanvasXY` and not the clip. The
implementer caught this and wrote the test that actually bites; both tests now carry the caveat in
their own prose.

**⚠️ Limits, not wins — the reviewer's wording, kept deliberately:**
1. **A mis-dragged STRIP cannot be undone from any client surface.** Fill-mode sweeps plus **no
   un-designate anywhere in `client/`** (`Cmd.dig(x,y,false)` rides the wire; nothing sends it) mean one
   wrong drag condemns a whole **w×h rectangle** with no recovery — DEMOLISH revokes queued *builds*,
   not designations. The console's blast radius was one tile per misclick. **The TUI *can* un-designate**
   (`hosts/tui/GameLoop.cs:322`), so this is a **client gap, not a game gap** — that distinction is the
   difference between a missing feature and a missing surface, and it is what makes this cheap to close.
2. **The `roomBounds()` clip is inert on ordinary mouse input** (above). Anyone reading "clipped to the
   room" should know the effective guard is `tileFromCanvasXY`.
3. **The `.on` armed-state palette toggle is not covered by the suite** — `dom-lite`'s
   `querySelectorAll` returns `[]`, so arming is driven through a constructed node. Verified in Chrome;
   still untested. A palette-markup test blocks the "satisfiable by an unrendered palette" failure.

**3. ~~WP-4 — DIG + STRIP in the Room Zoom palette.~~ — ✅ LANDED, see §4d. Next actionable step is 4,
WP-5.**
- **Do:** two new `ROOM_TOOLS` (`client/src/ui/room-model.js:27`) classed `'order'` in `PALETTE_CMD`,
  joining `isStructuralTool`'s sibling set so they inherit drag-sweep clipped to `roomBounds()`.
- **Files:** `client/src/ui/room-model.js`, `client/src/ui/roomzoom-view.js`,
  `client/test/room-model.test.js`.
- **⚠️ WP-3 is already sitting in `roomzoom-view.js`, nominally WP-4's file, and that is ACCEPTED, not
  a trespass** (decided 2026-07-25). It was forced, not casual: `SurfaceBoundaryTests` requires every
  `WireFormat` channel to have a **real** consumer in the client and a stub `case` was explicitly
  forbidden, so the new `zones` channel needed a genuine renderer, and the Room Zoom was the
  least-contended home. The footprint is deliberately minimal — **one import, one `body +=` line, and
  one self-contained function**. Expect to merge over it rather than escalate it. **WP-6 may replace
  that zone layer wholesale** when it lands the filtered/unreachable badges; it is a first home, not a
  contract.
- **Unblocks:** deletes **two** `KNOWN_GAPS` entries (`dig`, `strip`).
- **Wrong if:** it routes an order through `Cmd.build` (BuildSystem knows nothing about designations —
  `client/src/input/controls.js:54-55` spells this out); if it emits a payload that differs from what
  `paletteOrders` already emits; or if it lands without deleting its ledger lines.

> **⚠️ THE LEDGER RATCHET — the one mechanical rule every porting package obeys.**
> `KNOWN_GAPS` (`client/test/surface-boundary.test.js:132`) holds exactly `dig`, `stockpile`, `strip`.
> **Each porting package DELETES ITS OWN ENTRY in the same commit that lands the verb.** A ported verb
> whose entry is left behind **fails as stale**; a new entry fails against `KNOWN_GAPS_SEALED`
> (`:142`), the WP-0 high-water census — because a new entry means somebody just built a verb on the
> surface we are deleting, which is the exact WP-5 mistake this guard exists to prevent. The ledger
> shrinks or it fails. When WP-9 lands it must be **empty**, and that is asserted too.

### 4e. WP-5 — the ORDERS bar — LANDED (`f5b70ee` + `c39b66a`, merged 2026-07-26). **THE LEDGER IS EMPTY.**

**What shipped.** STOCKPILE (with its ACCEPTS mask), DIG and STRIP on the Level-1 Overview command
bar, **deck-scoped**, filling the `ORDER_TOOLS` seam WP-0 registered and left absent. New pure exports
in `overview-model.js`: `ORDER_TOOLS`, `ORDER_LABEL`, `isOrderTool`, `orderHintLine`. The buttons carry
`data-ov-tool` and route through the **existing** `onHudClick` branch — the bar adds no second arming
path, it fills one that was already wired and empty, so arming stays `Hud.armTool`'s single exclusive
slot and bar / palette / keys cannot disagree. **Gate on `main`: 996 dotnet (unchanged) + 641 node,
`./ci.sh` exit 0, twin hash `00e0a2dadb8e5076`, no pin moved.**

**`KNOWN_GAPS` IS NOW EMPTY**, and `surface-boundary.test.js` asserts it. Every designation the console
can express, the standard surface can express — with better affordances than the console had.

**The precedence decision overrode the charter, and the override was right.** `'order'`
short-circuits **everything**, second only to `'move'` — not merely ahead of `'enterRoom'` as the
charter's minimum said. An armed tool is a **mode**, and a mode owns the click (the console's IX-32/33
and the Room Zoom's `isSweepTool` bail already do exactly this). The minimum would have shipped three
**measured** holes: crew cluster at x25-32 y15-16 **exactly where the dig designations are** (§4b limit
2), so select-wins makes the debris you most want dug undiggable; **a device is precisely what STRIP
targets**, so terminal-wins ships the verb inert over its own subject matter; and WP-1 put the debris in
the **halls**, where ＋ADD ROOM is the only interactive thing — so addroom-wins would block the dig
**and commission a room**, which is the loudest possible wrong outcome. Accepted cost, stated: with an
order armed you cannot select, open MOSS or enter a room. Escape disarms; a second click un-arms.

**The review found one hole and the fix is better than the ask.** The ORDERS bar's **visibility was
pinned by nothing** — two mutations survived a fully green 639-test suite, the worse one hiding the bar
**exactly when an order is armed**, i.e. at the only moment its readback matters. The instructive part
is the fix: a dom-lite stand-in starts `hidden === false`, so asserting *"the bar is shown"* would
**itself have survived deleting the `setHidden` call outright**. The load-bearing leg is therefore the
opposite direction — switch tabs and assert the bar goes hidden — which proves the call happens at all.
Confirmed in re-review by a third mutation (delete the call): **RED**.

**A debt paid down that outlives this package.** `codeOnly` — the quote-aware comment stripper
`CLAUDE.md` trap 1 names as the thing to copy — is now the **shared `client/test/code-only.js`**,
imported rather than re-derived, and proven by a **matched pair**: a poisoned comment (stray `{`, lone
`'`) stays **GREEN**, the same poison **plus** dropped wiring goes **RED**, and (re-review's third leg)
dropping the wiring with **no** poison reddens identically — so the poison neither creates nor masks the
failure. Blinding the shared stripper reddens **6 tests across four guards**. ⚠️ **Two test files still
carry their own copy** (`room-model.test.js`, `zone-model.test.js`); their stale "copied from
`surface-boundary.test.js:205`" pointers and `CLAUDE.md`'s were corrected in the integration commit.
**New consumers must IMPORT the shared module.**

**⚠️ Limits, not wins — the reviewer's wording, and item 1 is the biggest hole in the milestone:**
1. **No client surface can un-designate.** `Cmd.dig/stockpile/strip(x,y,false)` ride the wire and the
   **TUI sends them** (`hosts/tui/GameLoop.cs:322`); no client surface does. A mis-placed order has no
   undo on the standard surface — **one tile from the Overview, a swept rectangle from the Room Zoom.**
   A *client* gap, not a game gap: it is one new lowering on a wire command that already exists.
2. **`Enter` with an order armed fires at a tile the Overview never shows.** `controls.js:273-277`
   lowers `paletteOrders` at the console's **inspection cursor**; `overview-view.js` moves that cursor
   only on the move path (`:704`), never on hover or on an order. **Pre-existing**, but WP-5 widened
   exposure by making arming reachable without ever touching the console. Cheap fix for WP-6/WP-9: move
   the cursor on Overview hover, or make `Enter` a no-op while `body.overview-open`.
3. **Deck-scoping is asserted, not demonstrated.** All 8 decks of `--ship grid` share **one** slot
   geometry (measured: one distinct slot-extent signature across 8 decks), so no test can show a click
   resolving differently per deck. The suite pins that **equality** — so it reddens the day a ship
   differs — and pins that order payloads carry **no deck/z key**. The real guarantee is the host
   applying orders to the session's current deck.

**⇒ THE MILESTONE, in the reviewer's words — it drove all three verbs against a live host on both
surfaces: the standard surface is "VERB-COMPLETE WITH NO UNDO", and that phrasing is deliberate.**
*"A player does not experience a verb set; they experience a loop. Every one of these three verbs is a
one-way door: you can tell the crew to dig, zone or strip, and you cannot tell them to stop. The sim
has the capability and the TUI uses it. So the surface is complete in the sense that it can say
everything the game can hear, and incomplete in the sense that it can only ever say yes. That is a real
gap and it will be the first thing a playtester hits — most likely by zoning a room they meant to walk
into, which is now easier precisely because arming is easier."* It does **not** block plan §9.2's
milestone; it is written down so the missing half is a **scheduled item and not a discovery**.

### 4f. STOCKPILE moved to the Room Zoom — LANDED (`971413a`, merged 2026-07-26). **AMENDS §4e.**

**Owner decision (Garvin), taken hours after WP-5 landed, and he was right on every count.** *"A
stockpile is an area x×y where a certain amount of items can be stored — that is naturally a zoom-area
task."* Verified before chartering: **`JobWork.IsFreeStockpileTile` asks "Stockpile + Walkable + empty"
— ONE STACK PER TILE, so the AREA IS THE CAPACITY**; `client/src/ui/overview-view.js` has **zero**
drag handlers, so painting a 5×8 zone there was **40 clicks**; and `ROOM_TOOLS` **lacked `stockpile`
entirely**, so the verb that most needs area-painting was absent from the only surface that sweeps.

**What shipped.** `stockpile` left `ORDER_TOOLS` and joined `ROOM_TOOLS` classed `'order'`, inheriting
`isSweepTool` + `roomDragMode`'s **filled rectangle clipped to `roomBounds()`**; **Z** arms it. Dig and
strip stay on both surfaces. The ACCEPTS mask moved with the verb — a swept tile emits `Cmd.stockpile`
**then** `Cmd.filter`, always both, always that order, garbage/missing mask → **ACCEPT-ALL, never
silence** — and the mask is read **once per committed sweep, not per tile**, because a per-tile read
could paint one rectangle with two filters. **Gate: 996 dotnet (unchanged) + 649 node, exit 0, no pin
moved. PASS on the first review round — the first package in this programme to manage it.**

**⇒ THE ALTITUDE RULE IS REWRITTEN ON A DIFFERENT AXIS. This supersedes §4e's version.**

> **ORDERS THAT POINT AT AN EXISTING THING are deck-scoped; ORDERS THAT AUTHOR A REGION are zoom-only,
> exactly like BUILDING.**
> *deck-scoped:* DIG · STRIP — you point at debris, a wall, a device.
> *zoom-only:* WALL/FLOOR/DOOR · **STOCKPILE** — you author an extent out of nothing.

WP-5's wording — *"a designation consumes no material and changes no geometry"* — is **quoted-and-negated
in place** in `overview-model.js`'s header. It is true of dig and strip and **false of stockpile**, and
it named the wrong axis: the axis is **"does the player choose the extent?"**

**⚠️ AN OPEN DECISION FOR THE OWNER — NOT A LIMIT, and it has a defensible answer already in the game.**
A stockpile can now only be painted **inside a bound room**: `enterRoom` resolves by anchor name, halls
have none (`overviewClickAction` has no `hallSlot` branch, and a slot with no `anchorName` cannot be
entered at all), so **a bare hall or corridor cannot be zoned from any client surface** — the Overview
could do it until this package. Three options, the third being the reviewer's and the one it argues for:
- **(c) ＋ADD ROOM already IS the path** — commissioning a room in a hall makes that slot bound and
  named, hence enterable, hence zonable. Under the new rule this is not a workaround but **the rule
  being consistent with itself: a stockpile is an authored region, and so is a room.** It costs the
  player one extra step in exactly the case where they were authoring a region anyway, and **neither
  (a) nor (b) needs building.**
- **(b) a hall-scoped Overview gesture** — *cheaper than it looks*: reuses `pointToTile` (exists,
  tested) and `buildDragTiles` (pure, already bounds-clippable) plus three listeners. Its real cost is
  the precision caveat plan §4.2 already records (fine for sweeping a zone, marginal for one wall) — and
  sweeping a zone is precisely the case. But it **partly re-opens the altitude rule**, so it needs the
  owner.
- **(a) enterable hall pseudo-rooms** — *dearer than it looks*: a new "enter an unnamed slot" action,
  chrome tolerating a nameless room, and a decision on whether the full build palette is legal in a
  hall, which reopens "building is zoom-only *inside a room*".

**⚠️ Limits — the reviewer's wording. Item 1 is now WORSE than it was, and that is this package's cost.**
1. **No client surface can un-designate**, and **after this package EVERY order verb is swept**, so the
   blast radius is a rectangle for all three — **a mis-dragged stockpile is now as expensive to get
   wrong as a mis-dragged strip.** The surface remains **verb-complete with no undo**, and this package
   **widened** the cost of that gap rather than narrowing it.
2. **`Enter` with an order armed fires at a tile the Overview never shows** (`controls.js:273-277`).
   Pre-existing; **narrowed slightly** here, since stockpile — the verb with the largest silent blast
   radius — is no longer armable from the Overview's own bar.
3. **Deck-scoping is asserted, not demonstrated** (§4e item 3, unchanged).
4. **The `ORDER_TOOLS` line in `MODERN_TOOL_TABLES` is currently deletable with the suite green** — with
   `stockpile` gone, `ORDER_TOOLS` ⊆ `ROOM_TOOLS`. **Disclosed in source rather than mechanised**, and
   the reviewer *measured* that it re-arms automatically: a deck-scoped verb that is not also a
   Room-Zoom tool makes deletion RED (n=3) against an intact-registry control (n=2). **A documented
   dormancy, not a hole** — a literal restatement would be the tautological shape and would need editing
   on every legitimate table change.

**⚠️ An instrument note that will bite the next live browser test.** The reviewer's first attempt at the
Overview leg *appeared to contradict the package* — a stockpile pair was sent and no room was entered.
It was a **boot-window artifact**: the console is briefly the live surface before `overview-open` is
applied, so the click went to `controls.js`'s canvas. Two tells caught it — `body.className` was `""`,
and `armTool` toggles (the second call silently disarmed). **Any live Overview test must assert
`body.overview-open` before clicking.**

**4. ~~WP-5 — the deck-scoped ORDERS bar on the Overview.~~ — ✅ LANDED, see §4e, AMENDED by §4f.
Next actionable step is 5, WP-6 — but read §4g first: the `designations` channel is arguably ahead of
it, because it fixes a verb that currently looks broken to a player.**

### 4h. BUG-B — the Overview room gesture resolves on `pointerup`, not `click` (`ce44a3b`, merged 2026-07-26)

**Owner report, twice:** *"Opening the zoom view is still not perfect. Often, entering zoom view
requires multiple clicks on a room to respond."*

`paintScene` does `_stage.innerHTML = svg` **unconditionally** at the wire's 10 Hz render rate
(`hosts/web/GameSession.cs:35` `RenderSeconds = 1.0/10.0`). A click spans mousedown→mouseup; a rebuild
between them **detaches the pressed node**, Chrome finds no common ancestor and **fires no `click` at
all**. Not a wrong action — **no action**, because no handler runs. **The same bug was fixed once in
this file for the HUD islands** (the *"MOSS button doesn't work"* report, `overview-view.js:85-96`)
**and the SVG scene was explicitly exempted on the false premise that its clicks are "resolved
synchronously before the next repaint."** That clause is quoted-and-negated in place, under a
**⛔ DO NOT ADD A THIRD ARGUMENT** warning.

**Measured three times by three different agents — diagnosis, implementation, and an independent
reviewer on its own CDP rig** (fresh page load per trial, `#onboarding`.hidden and `body.overview-open`
asserted, down/up dispatched from one connection so latency cannot smuggle a repaint into a control
leg):

| leg | shipped (`click`) | fixed (`pointerup`) |
|---|---|---|
| one rebuild strictly between down and up | **0/10**, *0 native `click` delivered* | **10/10** |
| **long press 300 ms — the owner's gesture** | **0/10**, 0 clicks | **10/10** |
| long press 800 ms | **0/5**, 0 clicks | **5/5** |
| instant press, no forced rebuild | **4/5** | 5/5 |

**The `0 native clicks delivered` column is what settles the mechanism rather than the outcome**:
Chrome delivers nothing in every failing leg, and *also* nothing in every passing treatment leg — the
fix works because it **no longer needs a click**, not because it recovers one. **The 4/5 row is why
this read as flakiness**: without an intervening repaint the shipped build usually does work.
⚠️ **The earlier control figure of 19/20 does NOT reproduce** — two independent rigs measured 4/5 and
6/10, i.e. the shipped bug is **worse** than first recorded, because natural repaints land inside even
an instant press.

**The pointer-down repaint deferral was ARGUED AWAY, not deferred, and the argument was verified.**
The seam removes the dependency on node identity **by construction**, so the deferral is belt-and-braces
over a hazard this surface no longer has — and a stuck flag would **freeze the ship**, which is worse
than the bug. Measured support: the only hover/active rule touching a scene node is
`.pl-pawn:hover .pl-tag-crowded` (`client/styles.css:875`), and `overview-scene.js` emits **zero
focusable nodes**, so a rebuild drops neither visual press state nor keyboard focus.

**⚠️ The keyed reconcile for the scene is a SCHEDULED ITEM, not a known-better fix.** It solves a
different problem — node identity across a repaint — which this gesture no longer has. **It becomes
REQUIRED the moment this surface grows anything needing node identity across a repaint: a drag, or a
`<title>` tooltip** (the scene emits none today; `zone-overlay`'s four live on the Room Zoom).
Converting `overview-scene.js` from a string builder is a rewrite, not an edit, and it would move the
widget counts `surface-boundary.test.js` pins by equality.

**Closed in review — a ONE-WORD regression that killed the whole gesture with the suite green.** The
window latch clear must stay **bubble** phase; a third argument moves it to **capture**, where it runs
before `_stage`'s handler and the latch is always empty. `dom-lite` could not model event phase at all,
so the harness now dispatches pointer events in the browser's own order — **window capture → element
path → window bubble, one shared event object** (three objects would leave only the middle phase able
to `stopPropagation`). Reintroducing the regression as `true`, as `{capture:true}`, **or on only one of
the two bindings** each redden **17** tests, and a named phase assertion reports the *cause* rather than
"the room did not open". The reviewer probed the harness in the dangerous direction: dropping the window
bubble phase, and running bubble before the element path, **both redden** — the new phases are
load-bearing, not decorative.

**Two further silent "the room will not open" paths — one fixed, one deliberately left.** An armed
order owns the click and now toasts `<TOOL> ARMED — ESC TO DISARM`, **deliberately only on room and
＋ADD-ROOM hits**, never a pawn or terminal: on `--ship grid` the crew stand exactly on the dig debris
(§4b limit 2), so a pawn-hit toast would fire on DIG's hot path and train the player to ignore it. And
a **MOSS terminal chip outranks the room it sits inside** (`term_hydro`, ~15.5×13.5 px inside
hydroponics) — left alone because it is *not* silent (MOSS takes the whole window) and demoting it
would make map consoles unreachable at Level 1. **Comment only; the `hitTest` diff adds no executable
line.**

### 4g. THE THREE DEFECTS — two FIXED on `lane/strip-visible`, the channel still open

> ### ✅ FIXED 2026-07-26 (`lane/strip-visible`) — read this before the diagnosis below
>
> The owner reported this **three times**, the last time precisely: *"I can see the button, I can see
> the square when I hover over the furniture, but after clicking, the square disappears."* (The square
> is the tool's hover **preview**, which correctly clears on release; what should have replaced it is
> the persistent condemned mark.)
>
> **Defect 1 — the invisible device mark: FIXED.** `GlyphMapper` pass 4 now re-applies
> `GlyphColor.Deconstruct` over a condemned device's own colour while **keeping its glyph**, mirroring
> pass 1's wall emitter. Route chosen deliberately over the `strips` channel (defect 3 below): ~4 lines
> in the mapper, no client change, no spine file, no new hashed state, **no pin moved**. `anyStrip`
> short-circuits so a strip-free frame pays one bool per device. Both surfaces additionally moved their
> mark layer **above** their furniture layer — a recovered byte drawn under an opaque desk sprite would
> reproduce the reported symptom exactly. That reorder is **measured inert** for every pre-existing
> mark (debris/dig ride glyph 37, which is in both `NON_FURNITURE` sets, so the layers were disjoint).
> Pinned by `tests/Perilune.Tests/StripVerbTests.cs` (device + **wall non-vacuity control** in one sim)
> and `client/test/room-model.test.js`.
>
> **Defect 2 — the lying status line: FIXED.** `HandleStrip` now reports `designate strip` /
> `cannot strip <kind>` / `cannot strip this tile` / `already condemned` / `clear strip` /
> `nothing to clear here`. The `CanDesignate` pre-check **never gates the command** — the sim stays
> the only authority and the command is enqueued either way.
>
> **Also fixed, same report:** the **Overview gave no feedback at all** for a placed order
> (`#ov-toast` stayed empty and hidden). It now toasts `⚒ STRIP ORDERED ▸ x,y ON DECK n` through the
> existing toast idiom; the narrower **refusal** toast (`… ARMED — ESC TO DISARM`) still wins when a
> room actually refused to open, so exactly one toast fires per click.
>
> **Defect 3 — the `designations`/`strips` channel: STILL UNBUILT, still the right long-term fix**,
> just no longer urgent. See the remaining-limits paragraph below.
>
> **Not touched, deliberately:** `shelf` and `rug` are client-local decor with no `deviceKind`, so
> strip can never touch them — giving them one is a design decision, not a bug fix. The palette
> overflow that clips STRIP below ~1140 px is also still open.
>
> ---
>
> **⚠️ §4b LIMIT 1 IS NARROWED, NOT CLOSED — the reviewer's verdict, and do not record it as closed.**
> The old wording (*"strip marks are delivered for walls only"*) is now false and struck. The honest
> replacement: **strip marks are delivered for walls and devices, but NOT through a crew member or a
> ground item.** The fix routes through the `cell[1]` fg byte, so it can only beat **pass 4**. **Pass 3**
> (ground item stacks) and **pass 5** (living citizens) still overwrite the byte, and **every device kind
> is non-blocking** (`content/core/SimDefs/machines.def` — `blocks = false` in all **26** rows, counted),
> so a device tile is walkable. **A crew member standing on a condemned desk, or an item dropped on it,
> still erases its ✕ for as long as they are there — and on `--ship grid` crew walk constantly, so a
> condemned tile's mark will BLINK OUT AND BACK as people cross it.** Only the `strips`/designations
> channel (defect 3) fixes that, because it does not ride the projection at all.
>
> **⇒ THE GENERAL LESSON, and it has now cost THREE owner reports: §4b called this "cosmetic" and it was
> not.** A designation the player cannot see is **indistinguishable from a verb that does not work** —
> the two cost the same to report and far more to diagnose, and this one consumed a full diagnosis
> agent, two implementation rounds and three review passes. **A limit that says "the order still
> happens, the player just isn't told" is a FUNCTIONAL limit on a game whose entire loop is issuing
> orders.** Weigh invisible-feedback findings that way in future rather than filing them beside
> rendering polish.
>
> **Verification worth inheriting:** the reviewer reproduced the owner's exact gesture on a CDP rig —
> `.rz-marks` **0 → 1** child on the clicked desk, still there after ~20 repaints, **and still there
> after a full page reload and re-entry** (so it is sim state, not a client artefact); live DOM order
> `rz-furniture` then `rz-marks`, with no pawn layer above. It also confirmed the equivalent-mutant
> handling by measurement rather than argument: gating the enqueue **without** an `on` escape hatch —
> the realistic mistake — goes **RED**; **with** the escape hatch it survives, which is what makes it a
> true equivalent.

**Reported by Garvin from live play, 2026-07-26: *"strip means deconstruct and recycle? if so it does
not work — I cannot place the command on a table."* Diagnosed: the verb WORKS and the feedback does
not.** `HandleStrip` (`hosts/web/GameSession.cs:678-687`) auto-detects — `TryGetDeviceAt` → 
`DeconstructKind.Device`, else `Wall` — and `DeconstructSystem.CanDesignate` (`:331`) accepts **every
device kind except a Door**. So the order registers and the crew will service it. **But `GlyphMapper`
pass 4 repaints the device's own colour over `GlyphColor.Deconstruct`, so the designation never reaches
the client.** §4b recorded that as "strip marks are delivered for walls only" and treated it as
cosmetic. **It is not cosmetic: invisible feedback is indistinguishable from a broken verb, and a
player hit it within a day.** *(Both sentences are the ORIGINAL diagnosis, kept verbatim as the
record of what was wrong; pass 4 no longer behaves this way — see the fix box above.)*

**One channel closes all three recorded `cell[1]` limits** (§4b, and the plan §4.1 ii amendment) —
**of which the first is now closed by other means, so the channel's remaining prize is the other
two**: ~~the invisible device strip~~ *(fixed in the mapper, see the box above)*; a mark **hidden
under a standing crew member** (and on `--ship grid` the crew
cluster *exactly* where the dig designations are); and the **stockpile tint that vanishes the moment an
item is stored on the tile** — the normal state of a working stockpile, and the Overview/Room-Zoom
disagreement §4b carried to WP-6. Feed it from the `DeconstructSystem`/dig registries, **not** from the
glyph fg byte. `WireFormat` is a spine file — use WP-3's pattern: the spine edit is **one token**
(`class` → `partial class`) with the channel in a sibling file.

**A SECOND, SEPARATE DEFECT found in the same investigation, and it is cheap:** **a rejected designation
produces no feedback anywhere.** `DeconstructSystem.Designate` returns `false` on refusal, `HandleStrip`
**discards the result** and sets `_status = "designate strip"` either way. Accepted and silently-refused
are indistinguishable to the player. This matters most for the third finding below.
*(**FIXED** — see the box at the top of this section. The implementation asks
`DeconstructSystem.CanDesignate` rather than reading `Designate`'s return, because the command lands at
the next tick boundary and the host has no return value to read at click time; the pre-check reports
and never gates.)*

**⚠️ And a third, which is a genuine trap for a player:** `shelf` and `rug` are **`cosmetic` in
`PALETTE_CMD` with `verb: 'decor'` — view-only, client-local, NOT sim devices at all.** So there is no
device on the tile, `HandleStrip` falls back to `Wall`, `GetWall(pos)` is not a wall, and the
designation is **silently rejected**. Stripping a shelf or a rug is genuinely a no-op, and it looks
exactly like stripping a desk (which works but is invisible). **Two different failures wearing the same
face.**
- **Do:** STOCKPILE (+ ACCEPTS) and, for convenience, DIG/STRIP on the Level-1 Overview, deck-scoped.
  `overviewClickAction` (`client/src/ui/overview-model.js:67`) gains an `'order'` branch **ahead of**
  `'enterRoom'`, so an armed order tool suppresses room entry exactly as `armed === 'move'` already
  does. Hit-testing already exists and is tested (`overview-view.js:616-624` → `tileAt` → the shared
  `makeTransform` invert) — **no new hit-testing.**
- **Files:** `client/src/ui/overview-model.js`, `client/src/ui/overview-view.js`,
  `client/test/overview-model.test.js`. The test registry entry is already waiting:
  `MODERN_TOOL_TABLES` names `['../src/ui/overview-model.js', 'ORDER_TOOLS']`
  (`surface-boundary.test.js:153`) and an absent export is skipped, not an error — **`ORDER_TOOLS` is
  the seam WP-5 fills.**
- **Unblocks:** deletes the `stockpile` ledger entry. Plan §9.2: **after WP-6 the owner decision's
  "verify the game is playable there" milestone is met**, and only then is WP-9 safe to schedule.
- **Wrong if:** it puts *building* on the Overview. The amended rule is narrow and must be written
  into `overview-model.js`'s own doc comment: **"BUILDING is zoom-only; ORDERS are deck-scoped"**, on
  the grounds that a designation consumes no material and changes no geometry — it marks intent.

### 4m. The overnight run — three packages LANDED (2026-07-27, `bfaa192` · `bb2e983` · `0f27412`)

**Gate on `main` @ `0f27412`: `./ci.sh` exit 0, 1019 dotnet + 737 node, all five pins held.** Worktrees
removed, nothing in flight. Each package Opus-implemented, independently Opus-reviewed, **every one
took at least one send-back**, and two took three rounds.

**1. Device sprites (`bfaa192`) — §4l closed for devices, NOT for ground items.** The art already
existed; the defect was the hand-mirrored `ROLE_TO_ITEM` in two view files. Now derived from `ITEMS`
via `client/src/items/glyph-map.js`, with a guard that reads the sim's own `DeviceKind`/`ForDevice`
and calls the **real `buildItem`** per kind. **Review found the guard's first parser accepted only
`Name = 26,`** — the two most natural ways to add an enum member (no trailing comma; implicit value)
both **SURVIVED 711/711 green**. Closed, and the three count floors tightened to **equality**, so the
enum growing is now the moment someone answers *"does it have art?"*.
**⚠️ AND THE FIRST DRAFT CLAIMED THE CLASS WAS CLOSED.** Review photographed **seven more chips one
room away in STORAGE** — `,`×6 and `f` — from `Glyphs.ForItem`, which the guard structurally could not
see. Retracted in place; the guard now enumerates `ForItem` too and the **six chipping kinds** sit in
`NO_GROUND_ITEM_SPRITE`, pinned by equality, each failing as **STALE** if its glyph gains art.
**Corpse is genuinely exempt** (`'&'` is in `NON_FURNITURE` on both surfaces) and that was measured,
not asserted. Numbers to keep straight: **7 chip instances** on the ship today from **2 kinds**;
**6 kinds** that chip if present.

**2. Palette overflow (`0f27412`).** See `CLAUDE.md`'s snapshot. **Filed severity was understated** —
onset **1249 px, not ~1140**, and it **travels with the room name**. Two send-backs, both this repo's
signature defect: a negative control that could not bite, then a matcher comparing selectors by exact
string so the bug could be re-declared verbatim under `#roomzoom-view .rz-palette` with the suite
green. **The `endsWith` fix the orchestrator proposed would itself have had a hole** — the palette
carries `class="hud rz-palette"`, so matching is by **subject** (rightmost compound, split into simple
selectors).

**3. Test hygiene (`bb2e983`).** A systematic sweep for tests whose named mutation cannot bite. Four
**already-shipped dead guards** found (two fixed, two retracted as genuinely unfixable — verified
against a **1063-culture sweep** plus a hostile `NumberFormatInfo` clone), plus one live-bug shape at
`moss-screen.js:271`. **Two self-disclosures worth more than a clean report:** its own named mutation
could not bite, and its first harness **manufactured false greens** because its output parser did not
match the runner's format.

**⚠️ THE PATTERN OF THE NIGHT, and it is the reason the review discipline is not optional.** Every one
of the three packages shipped a **guard that could not catch the thing it named**, and **not one was
found by reading** — each took an independent agent physically substituting the broken implementation.
Two were the *same* fixture defect in two lanes on the same day (see `CLAUDE.md`'s new trap). The
third was a matcher that could not see its own named declarations in different syntax.

**⚠️ OPEN, and needing the owner.** **(a) DEMOLISH destroys what STRIP recovers, one button away.**
The sprite package made GrowBed a DEMOLISH target — one click, no confirmation, no undo on this
surface, **no matter recovered** (`RemoveDeviceCommand` salvages nothing where STRIP pays
`floor(device_parts × Condition)`), and **no `growbed` entry in `PALETTE_CMD`**, so it cannot be
rebuilt. Kept because GrowBed joins `MedBed` and `Table`, already one-way demolishable — consistency,
not a new capability. **(b) A lying affordance, pre-existing, now 12 kinds → 14:** the client offers
DEMOLISH and fires the *success* pulse for kinds outside `PlaceDeviceCommand.IsPlaceableFurniture`
(Terminal and Telescope among them), and the sim silently drops the command.

**Follow-ups logged, none blocking:** ground-item art (**six new builders**, plus the **count channel**
design question — `buildItem(id, opts)` cannot express stack size, so 1 unit and 40 render
identically); a **capture-based** palette guard (commit `measurements.json` + pin a hash of its
inputs) — deferred as a new mechanism deserving its own review; `:is()`/`:where()` spellings evade
`simples()`; two byte-identical comment-scan lines now sit in `code-only.js`; `ci.sh` should print a
dead child's exit reason; and the `DeconstructSystemTests.cs` ledger entries (`:1493` — a test that
passes if `Reap` and `Tick` do nothing — and `:751`).

**A gate flake, bounded rather than solved.** One `ci.sh` run failed at **file level** in
`webgl.test.js`, a file untouched by any of this work. It did **not** reproduce in **24 runs**,
including four rounds of 3× concurrent at load 21.60 on a 10-core box. Its signature — whole file
uncollected, no assertion — is what `node --test` prints when a per-file **child process dies**.
**Read: environmental contention, not a gate defect — and definitively not a one-in-five flake.**

### 4k. The `marks` channel — a designation no longer blinks out — LANDED (`11b2ffb`, 2026-07-26)

**What shipped.** Both modern surfaces now source their mark layer from a new sparse view-only wire
channel — `marks {"type":"marks","cells":[[x,y,deck,kind],..]}` — read from `TileFlags.Designated`,
`TileFlags.Stockpile`, `DeconstructSystem.Pending` and the debris terrain planes, **never from the
projection**. `MARK_FOR_FG`/`markForFg` are retired quoted-and-negated. **This closes §4b's limits:**
passes 3, 4 and 5 can no longer erase a mark, so a designation survives a crew member standing on it,
an item stored on it, and a device occupying it. New: `hosts/web/WireFormat.Marks.cs`,
`tests/Perilune.Tests/MarksChannelTests.cs`, `client/test/marks-model.test.js`,
`client/tools/capture-marks.mjs`, `client/tools/marks-shot.mjs`.

**Gate: `./ci.sh` exit 0, 1018 dotnet + 694 node, all five pins HELD** and re-measured after the
precedence fix rather than assumed. **The lane touches `sim/` and its entire `sim/` diff is
comment-only** — verified mechanically (`git diff main...HEAD -- sim/ | grep '^+' | grep -v '^+\s*//'`
→ empty), which is why a `GlyphMapper` edit moved no pin.

**Named `marks`, not `designations`.** Every earlier reference in this file (§4g, §4j, the START HERE
block) calls it *the `designations` channel*. It carries **debris**, which is terrain and not an
order, so that name would have been a lie for a quarter of the payload — and splitting debris off
would have left the mark layer with two sources forever, which is the defect being removed. The
rename is recorded in `WireFormat.Marks.cs`'s header where a grep for the old word lands on it.

**⚠️ THE LESSON — PASS 1 IS NOT THE FRAME, and it nearly re-shipped the invisible-strip bug.** The
first draft ranked stockpile above strip, mirroring `GlyphMapper` pass 1 *"deliberately and exactly"*.
But `GlyphMapper.cs:163` re-applies `GlyphColor.Deconstruct` **after** pass 1, unconditionally, so
pass 1's ranking **never gets the last word on a condemned device**. Result: a condemned device
**inside a stockpile zone** drew no strip mark at all — the channel said `stockpile`, `markLayerSvg`
skips stockpile because `zones` owns that tile, and no ✕ was drawn anywhere. On `main` it had worked,
via the fg-26 byte. **A fresh instance of the exact bug that cost three owner reports, introduced by
the package built to remove it.** Precedence is now **dig ▸ strip ▸ stockpile ▸ debris — an order
outranks a zone.**

**Why it survived to review is the part to inherit.** The header asserted, as a *design guarantee*,
that the kinds *"cannot legally coexist on one tile"* and that the channel *"cannot come to disagree
with the frame about what a tile IS"*. Both are false — a device sits on a walkable tile, so two
commands produce the collision. **The false guarantee is what stopped anyone looking.** Same species
as §4a's four prose-truth defects: correct-looking code with a wrong explanation of itself, where the
explanation is the thing that hides the bug. Retracted in place; `GlyphMapper.cs:80` now carries a
note that its own identical clause is false for stockpile and that **pass 4, not that block, decides
a condemned device** — with an explicit *"do not copy this again"*.

**⚠️ IT WAS PHOTOGRAPHED, and that is why the fix is trusted.** `client/tools/marks-shot.mjs` (**in
the repo**, not a scratchpad — the `wp8-capture.mjs` pointer has already rotted once) drives a live
`--ship grid` host over CDP, dismisses onboarding with a real click and enters a room with a real
`pointerdown`/`pointerup`. Verified by eye at both altitudes: a 3×3 zone reads as slate fill with
**blue** dashed borders, the condemned tile in it swaps to an **amber** dashed ring plus a heavy ✕
**drawn over its locker sprite** (live DOM `furnitureIdx 373 < marksIdx 420`), and crew stand on
dig-marked tiles with the rubble and rings fully drawn — the pass-5 case that no fg byte could ever
survive. Container measured live: `.pl-marks` 729.8 × 238.4 px, `visibility: visible`, `opacity: 1`.
**Two runs were needed to answer honestly** — the first picked a tile the Room Zoom does not skin, so
there was no sprite for the ✕ to be buried by and the picture answered the question vacuously.

**Two mutation SURVIVORS that are NOT holes**, both settled by argument against the reviewer's
finding: `markVariant(tx,ty) = (tx*7 + ty*13) % 3` and **7 ≡ 13 ≡ 1 (mod 3)**, so it reduces to
`(tx+ty) % 3` — commutative, so an argument swap is **provably unkillable**, an equivalent mutant and
not untested code. (The killable half is pinned byte-for-byte, and both tests assert the
commutativity, so retuning those coefficients breaks loudly — measured: 7→8 goes RED.) Likewise a
wrong-plane debris read: no shipped verb can produce a standing wall over a debris floor
(`AsciiWorld.cs:40-41` writes `Debris` to both planes; `DigJobSource.cs:138-139` and
`DeconstructSystem.cs:487-488` clear to `Floor`; `BuildSystem.cs:106` refuses a wall build over a
non-zero wall). Both pinned synthetically instead.

**⚠️ Cost, measured and accepted — this channel is NOT `zones`.** `zones` is free because nobody zones
a stockpile; **`marks` is never empty** (the Perilune ship ships 48 debris marks at boot, and an early
test asserting the channel was inert on the default ship was **wrong and was retracted mid-package**).
`GameSession.Send` dedupes by string equality, so the payload is rebuilt and compared every render:
**+61 µs per render, forever** (345.2 vs 284.0 µs over 4 000 renders) — ~0.06 % of one core at 10 Hz.
Revisit if a future ship has a much larger wreck; the census test is where the number lives.
**The payload COUNT is a snapshot, not a constant** — the fog gate keeps revealing, so 35/446 B and
50/626 B were both measured minutes apart. **60 (fully revealed) is the only stable number.**

**Three findings recorded, none blocking** (the reviewer's G1/G3/G5). **G1:** `MarksChannelTests.cs`
says *"drop `MarkIc` from **any of the four** `ToString` calls ⇒ this fails"* — it fails for X, Y and
Deck, but `Kind` is non-negative so that one survives. **A named mutation that cannot bite, inside the
test written to fix a named mutation that could not bite.** One word too broad; zero practical impact.
**G3:** the dig × strip unreachability argument cites `CanDesignate`, which is the **Wall** path only —
`DeconstructSystem.cs:335-348`'s Device path checks nothing about the tile. The conclusion holds for a
different reason (`Commands.cs:330-331` `PlaceDeviceCommand` requires `Walkable` **and** `wall == Void`),
measured at **0 of 50** rubble tiles accepting a strip order. **Cite `PlaceDeviceCommand`, not only
`CanDesignate`.** **G5:** a dead local + `GC.KeepAlive` at the end of `MarksChannelTests.cs`.

**⚠️ A FOLLOW-UP LEFT OPEN DELIBERATELY, and it is not this package's bug.**
`ZonesChannelTests.Zones_Serialization_Is_InvariantCulture:66-80` is an **unbiteable test** — every
field is a non-negative `int`/`ulong`, `int.ToString()` uses "G" which never groups, and .NET renders
Latin digits for **every** built-in culture, so **no culture can perturb it**. The only reachable knob
is `NegativeSign`. It is confirmed to be **the ancestor the marks version was copied from**, and it was
left untouched to keep this package's scope tight. Whoever fixes it should check for further copies.

**Plan §5 gap 1 is UNBLOCKED, not closed.** A restriction indicator on the Overview needs the accept
**mask**, which rides `zones`, not this channel. What changed is that §4j's objection is gone: nothing
reads the fg-16 byte any more, so having the Overview read `zones` no longer creates a second producer
for the same tint. That is now a small, clean package.

### 4l. Unskinned device glyphs — OPEN, found from live play (2026-07-26)

**Garvin, from a screenshot of the running game: dashed boxes containing raw ASCII letters where
furniture should be.** They are `roomzoom-view.js`'s VS-Z-25 *unknown glyph* chip — a development
stopgap — **shipping to the player**. The sim gives each device a letter (`sim/Sim.Glyph/Glyphs.cs:35`
`ForDevice`) and the client maps letters to art (`client/src/render/glyphs.js:13` `SPRITE_FOR_GLYPH`).
**Three kinds have no entry: GrowBed `"`, Terminal `T`, Telescope `x`.** Everything else maps.

**Not obscure:** hydroponics is the food loop and the Terminal is the door into the whole MOSS CRT.
**Pre-existing** — nothing in the `marks` lane touches it; it has looked like this since the SVG
surfaces were built.

**⚠️ Why no test caught it, and why the fix should be a guard and not three sprites.** The client is
emitting *correct* text — it is honestly reporting that it has no art. Nothing is broken, so nothing
goes red; it reads as wrong only when a person looks at the screen. **And the two surfaces mirror that
sprite table BY HAND**, so the same gap reopens the next time a `DeviceKind` is added. Charter it as:
enumerate `ForDevice` against `SPRITE_FOR_GLYPH` **mechanically** (do not trust the list above), add
the missing art, and add the assertion that every `DeviceKind` resolves to a real sprite. **Third
instance in one day of the "no test can see this" shape** — see §4g and §4k.

### 4j. WP-6 — the ACCEPTS chips, and the accept-mask made reachable at last (merged 2026-07-26)

**The owner asked: *"is it correct that we have one global stockpile, i.e. we do not set filters?"* —
IT WAS.** The accept-mask has been per-tile in the sim since E0-4 and every painted tile emits
`Cmd.filter(x, y, mask)`, but the **only** writer of the client's mask was the `onclick` on the
**deprecated console shell's** chips (`hud.js`), so on the standard surface it was pinned at
`defaultStockFilter()` forever: **every zone accepted everything, permanently.**

**⇒ THE LESSON, and it is the sharpest one this programme has produced: A VERB CAN BE PRESENT AND
INERT. Verb parity is necessary and NOT SUFFICIENT.** This is E0-4's original mistake — filter UI on
the wrong surface — **surviving one package past the guard written to catch it**, because WP-0's parity
assertion checks *verbs* and `stockpile` was present and passing the whole time. The ledger reached
empty (§4e) with the verb reachable and its **options** unreachable.

**What shipped.** The chips now sit on the **Room Zoom palette** beside the tool that paints with them
(the plan said the ORDERS bar; §4f moved the verb, so the chips followed) — revealed on arm as a
sibling of the material strip and **mutually exclusive with it, so zero net height** on a palette that
already clips below ~1140 px. Seven real `<button>`s with `type="button"` and `aria-pressed`:
keyboard-reachable and screen-reader-legible. New pure `client/src/ui/accepts-row.js`;
`stock-filter-model.js` **untouched** and its TUI cross-skin tripwire intact.
**Gate: 1002 dotnet (unchanged) + 678 node, exit 0, no pin moved.**

**Measured live off an intercepted socket, and this one number is the package:** six chips off, a 4×2
drag emits **8 `stockpile`+`filter` pairs, every filter carrying `mask: 8`, not 127** — zone-before-
filter on every tile, zero `build`. Flipping ORE back on then reads
`APPLIES TO TILES YOU PAINT NEXT · 8 ZONED TILES IN THIS ROOM KEEP A DIFFERENT FILTER`.

**An existing guard was REMOVED, and the removal was correct.** `room-model.test.js`'s wiring scan
named WP-6 in its own text as the thing it was watching for. But `getStockFilter` is now **entirely
absent** from `roomzoom-view.js` and from `main.js`'s call, so there is no option left to forget and
**a scan for a line that must not exist guards air.** The property it protected is now pinned *better*
— behaviourally, end-to-end: chip click → the mask the row shows → the mask every swept tile emits. A
chip click that fails to move the mask reddens **8** tests. That is `CLAUDE.md` traps item 4 applied as
intended: **runtime state beats text.**

**⚠️ DECLINED, and it should NOT be re-offered — offer the `designations` channel instead.** Having the
Overview read the `zones` channel would create a **second producer for the same tint**, forcing the
fg-16 suppression in `markLayerSvg` to move in lockstep or the Overview stacks two tints — **the exact
bug WP-3 hit with the material layer**, which this programme has already paid for once. And it banks a
*partial* fix where §4g's single `designations` channel closes passes 3, 4 and 5 together.

**⚠️ PLAN §5's THREE FEEDBACK GAPS: TWO CLOSED, ONE NARROWED.**
- **Gap 2 (chips affect only future paints, with nothing saying so) — CLOSED.** The wording is
  *visible*, not buried in a `title=` nobody hovers, and the count of already-zoned tiles that disagree
  is the other half.
- **Gap 3 (no indicator for the backed-off set) — CLOSED IN MECHANISM, with a caveat worth keeping:**
  the bit rides the wire, the client derives it, the hatch and key render it, and the wording refuses to
  claim unreachability — but **nobody has yet seen it fire on a real haul retry**, because the sim will
  not produce one on demand. The rendering leg is covered **synthetically** (decode → derive → SVG →
  DOM all real; only the frame's origin fabricated), and labelled so.
- **Gap 1 (a filtered tile has no visual indicator) — NARROWED.** Closed on the **Room Zoom** (wedge +
  `<title>` + a key naming the filter in words). **Not closed on the Overview**, which renders the
  stockpile tint from `cell[1]`'s fg-16 byte and *cannot carry restriction at all*. **A player looking
  at the schematic still cannot tell a filtered zone from an unfiltered one. That closes with the
  `designations` channel (§4g) and not before.**

**Known and disclosed:** four `esc` call sites in `accepts-row.js` are uncovered and **unreachable by
construction** (all interpolated model text is ASCII from a frozen table; verified by measurement, not
argument) — the calls are kept as a contract so an eighth `ItemKind` or a player-typed name cannot walk
in. The mismatch count is **room-scoped and says so**; a player with zones in three rooms sees three
counts and never a ship total.

**⚠️ An instrument note, from a finding the reviewer RETRACTED.** Its first pass showed the mismatch
line never appearing across 0.3 s / 1 s / 3 s and a forced repaint — it looked like a real defect. It
was the instrument: the chip click had not landed, so the mismatch was genuinely zero and the row was
right to stay quiet. **Any live chip test must assert the mask actually moved before reading the
consequence.** That is the *second* time a coalesced-repaint/stale-read nearly produced a confident
wrong finding in this programme (§4h was the first).

**5. ~~WP-6 — ACCEPTS chips on the ORDERS bar + the three missing indicators.~~ — ✅ LANDED, see §4j.
The charter below is superseded: the chips went to the ROOM ZOOM (§4f moved the verb), the
"flip WP-0's parity test to strict" item was already automatic
(`surface-boundary.test.js:322-327`), and WP-3's indicator layer was EXTENDED, not replaced.**
- **Do:** the accept-mask chips, plus the three feedback gaps E0-4 shipped without (plan §5): a
  **filtered** tile carries a corner badge (`stockFilterLabel` already exists,
  `client/src/ui/stock-filter-model.js`); the chips **say** they apply to tiles painted next, with a
  count of already-painted tiles that differ; and an **UNREACHABLE** tile renders dim + hatched with a
  one-line reason. **WP-3 already shipped the channel and a first rendering of all three** — WP-6 is
  free to replace that layer wholesale rather than extend it.
- **Files:** `client/src/ui/stock-filter-model.js`, `client/src/ui/overview-view.js`,
  `client/src/ui/zone-badge.js` (new), `client/styles.css`; **and flip WP-0's parity test to strict.**
- **Wrong if:** it labels the back-off bit as proof of permanent unreachability. `_tileRetryAt` is a
  **retry stamp**, cleared wholesale on any tile-board rebuild
  (`sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:453`) and per-tile on proof of reachability (`:503`),
  so the honest label is *"no hauler has reached this recently"* — which is exactly what WP-3's key
  already says. A real reachability query is a sim change and out of scope. Also wrong if it weakens
  `client/test/stock-filter-model.test.js:130` — the live cross-skin tripwire that parses
  `hosts/tui/Ui/StockFilterModel.cs` and compares its labels to the JS `STOCK_KINDS`.

**6. WP-C — the conversation stand-down + the onboarding rewrite + the Persona seam.** Plan §1.5.3.
- **Must land after WP-5 and before WP-9, and that position is a constraint, not a preference:** it
  *removes* a verb from the onboarding card, so the card needs a replacement verb to teach, and ORDERS
  only exists after WP-5.
- **Do:** unbind `T` (`client/src/input/controls.js:231`) and the Enter-on-selected-crew branch
  (`:271`); retarget the `[T] OPEN CHANNEL — TALK` button (`client/src/ui/overview-view.js:241`,
  handler `:652`) to `openPersonaForSelected`; drop the dossier's CONVERSATION LOG section; **rewrite
  `client/src/ui/onboarding.js`** — it teaches TALK as one of the game's two verbs (`:20`, `:40-42`)
  and is also the only help screen (`?`).
- **Wrong if it deletes anything host-side or sim-side.** Plan §1.5.5 is the keep-list and it is a
  *floor*: `sim/Sim.Llm/`, `hosts/web/ConversationHub.cs`, `sim/Sim.Core/Effects/`,
  `CitizenMemory.cs` (**hashed sim state**), `PersonaSheet.cs`, `Eulogy.cs`, the host's
  `talk`/`say`/`bye` parse, `client/src/ui/chat.js`. `client/test/dialogue.test.js` (7) and the chat
  half of `client/test/ui.test.js` **must still be green afterwards** — that is the evidence "LLM
  ready" was preserved rather than gutted. Also wrong if it declares the stand-down complete without
  grepping `talk`/`say`/`bye`/`Conversation` across `content/`, `hosts/tui/` and the docs (plan §10
  flags §1.5.1's finding as a search result, not a proof of absence), and without checking whether any
  host path can originate a `chat` message unprompted.
- **The one thing that genuinely falls away:** `AgreeTask` — asking a crew member to do something and
  having them agree is today a conversation-only pathway into memory and relationships
  (`sim/Sim.Core/Citizens/CitizenMemory.cs:210`). Nothing breaks; a capability goes quiet, and the
  Persona window will have to carry it.

**7. WP-9 — delete the console shell. THE PROGRAMME'S SINGLE RISKIEST CHANGE. Last, and only after a
human has played `--ship grid` end to end** against plan §7.6's written checklist.
- **Why it is the riskiest:** it is a **split of `hud.js`, not a deletion of it.** That file is the
  authoritative wire-message cache *and* the single armed-tool/tab/selection state machine *and* the
  console's DOM chrome, all fused — **both modern surfaces import it** (`overview-view.js:18`,
  `roomzoom-view.js:14`). Eight writers dereference `$(id)` with **no null guard**, so pulling `.app`
  out of `index.html` without doing the split gives a **white page**.
- **And it has almost no test net.** Precisely: `client/test/relations-view.test.js:331` imports it at
  runtime to drive the RELATIONS/STATE seam, and `surface-boundary.test.js` / `ui.test.js` /
  `dialogue.test.js` read it as **text** (id census, four widget counts pinned by equality, import
  specifiers). Nothing exercises its console chrome or its wire cache. **This corrects the plan**,
  whose §0 finding 2 says *"NO node test imports `hud.js` at all"* — true when it was written and
  false since WP-7. The conclusion is unchanged and is the plan's own: the deletion is nearly
  test-free, and **that is the risk, not the relief.** The standing rule above is **binding here**: the
  split must be verified by driven tests through `dom-lite.js`, not by source scans.
- **The specification for the split already exists**: `SHIP_STATE_REACH`
  (`client/test/surface-boundary.test.js:780`) is the exact set of `hud.js` symbols a modern surface
  may reach, pinned by equality — it is simultaneously the bridge allowlist and the contract for
  `hud.js` → `ship-state.js`.
- **⚠️ Plan §7.3's line-number map is STALE and will send you to the wrong lines** — see the drift
  warning above. **Re-locate every symbol by name.**
- **Wrong if:** it deletes the render stack (keep `client/src/render/` — ~100 node tests and the
  executor-parity harness live there; the canvas moves into a `?legacy=1` dev container); if it
  deletes `console-model.js` (misnamed, imported by six modules, **not** console-only); if it deletes
  `renderChat`/the `chat.js` import (plan §7.3 — those are the opt-in integration surface and a
  reviewer *will* flag them as dead); or if it leaves `KNOWN_GAPS` non-empty.
- **A recommendation from the plan, against the literal brief, and it is sound:** treat **WP-6 as the
  finish line for the decision** and WP-9 as cleanup that can wait for a quiet week. The
  anti-recurrence goal was met at **WP-0**, not at WP-9 — a lane cannot accidentally build on the
  console once a test says so, whether or not the file still exists.

### 5. Decisions TAKEN on 2026-07-25 — settled, not open. Do not reopen without the owner.

**Nothing in this section is parked.** Each was an open question at the end of the day and each was
decided; they are recorded here so a fresh instance does not spend a round re-arguing them.

**(a) The deck-confined wander — DO IT, and first.** Decided; it is **§4 step 1** above, with the
mechanism, the files, the measured overstatement it corrects, and the deliberate re-pin. Not repeated
here.

**(b) The `--ship slice` RELATIONS behaviour change — ACCEPTED. Do not revert it.** WP-7 re-homed
`#relations-view` as a body-level sibling with its own switch, so `body.relations-open` now hides
`.app` **and** `#overview-view` outright (`client/styles.css:1176-1178`). On the standard ship that
*is* the fix — it is what stopped the deprecated console reappearing over the modern game. On
`--ship slice`, where the console *is* the surface, RELATIONS therefore changes from an in-stage
overlay (tab bar still visible) to a **full-window takeover**. **That consequence is accepted:**
`slice` is a **test fixture, not a game** (§2 fact 1), and spending work to preserve a nicety on a
deprecated surface is waste. A later lane that "fixes" this is doing negative work.

**(c) WP-3's footprint in `roomzoom-view.js` — ACCEPTED.** Nominally WP-4's file; it was forced, not
casual. See §4 step 3.

**(d) The missing `materials` replay — a real bug, fixed as a FOLLOW-UP, not now.** WP-3 found it while
adding its own channel, added `"zones"` to the snapshot list and deliberately left `materials` alone
rather than widen its own diff. See §6 item 2. Correct call: it is small, real, and unrelated to the
current chain, so it does not jump the queue.

### 6. Owed follow-ups — real work, nobody owns any of it

These are not nice-to-haves; each is a known-wrong thing in the tree or the record.

1. **`docs/design/perilune-economy-modularity.md` §1.4 is stale and was NOT re-audited.** Its LOC
   ledger predates E0-4: it lists `HaulJobSource.cs` at **257** lines (now **512**) and
   `StockZoneSystem.cs` at **58** (now **300**, `sim/Sim.Core/Stock/StockZoneSystem.cs`), and its
   claim that *"four of the six economy systems are empty stubs"* (`:222-228`) is now **false** —
   `StockZoneSystem` is a real registry with a packed-sorted store. **Owner-shaped job:** re-run the
   §1.4 inventory against `main`, restate the "real economy" total and the 16 %-of-`Sim.Core` figure,
   and say which stubs actually remain (`ProductionSystem`, `OreRegistrySystem`, `TradeSystem`). Also
   correct §7 step 1's *"All four pins must hold"* — there are five.
2. **`materials` is never replayed to a reconnecting tab — a real bug, deliberately deferred.**
   `GameSession.Snapshot()` (`hosts/web/GameSession.cs:159`) catches a freshly-connected tab up from
   its channel list — and **`materials` is not in it**, even though the channel is broadcast like any
   other at `:1074`. **Consequence:** a tab that reconnects does not get the wall/floor material layer
   back **until the next material change**, so built walls render in the default skin until someone
   builds again. Found by WP-3 while adding `zones` to that same list; it added its own key and
   **deliberately left `materials` alone** rather than widen its diff, which was the right call.
   **Owner-shaped job:** add `"materials"`, and assert the replay — the honest test is that *every*
   channel a client consumes appears in `Snapshot()`, which generalises the bug instead of patching one
   instance of it.
3. **The WP-5 cost disclosure is wrong in BOTH halves.** `hosts/tui/GameLoop.cs:56-60` and
   `client/src/ui/stock-filter-model.js:38-45` both claim zoning any tile *"permanently arms"* the
   `filtered` fast path in `HaulJobSource` — **WP-6 killed that**, because an accept-all mask now
   stores **no** registry entry. And both give the exponent as `O(items × stockpile-tiles)`; it was
   `O(items × tiles²)`. Recorded rather than fixed at the time because the correcting package was
   docs-only. **Owner-shaped job:** two comment edits, one commit, no behaviour change; verify against
   `StockZoneSystem`'s current collapse behaviour rather than against the comments.
4. **The `ApplyWork` / `WorkRate` seam** — the modularity audit's **highest payoff-per-cost move**
   (§6, §7 step 1): a ~40-line, **pin-neutral** change replacing five independent copies of the same
   work decrement (`DigJobSource.cs:135`, `BuildJobSource.cs:405`, `DeconstructJobSource.cs:180`,
   `MachineWearSystem.cs:248`, `CraftingSystem.cs:173`) with one helper whose `WorkRate` returns the
   literal `1` today. It satisfies three requirements at once — maintainability, portability, and the
   binding operator model E2 cannot ship without. **Held deliberately until the console programme
   settles**: it touches `Jobs/`, and the audit itself says land it after E0-4 rather than beside it.
   **Its honest limit, so nobody over-claims the precedent:** the shipped `MachineWearSystem` channel
   (`Citizen.Mood` → `ShipMetrics.Morale` → `DirectorSystem.WearPressure` → wear, injected,
   def-weighted, degrading to `× 1f` when absent) gives the **signature** and not the **signal** — it
   reads a **crew-wide mean** off a pure aggregate report at **~0.1 Hz** through a **deliberately
   smoothed** lever, while the operator model needs **this citizen's mood at this workbench, per tick,
   un-smoothed**. That per-citizen read is itself the crossing
   `Economy_KnowsNothingAboutSoulsPresentationOrPhysiology` guards, and the precedent does **not**
   pre-authorise it (`MachineWearSystem` never touches `Citizen.Mood`). **Budget step 1 as the
   signature and E2 as the signal.** Two traps at the sites: `MachineWearSystem.cs:248` decrements by
   `Interval`, not 1, so the helper needs a `ticks` argument; `CraftingSystem.cs:173` is a **read**,
   not a decrement.
5. **WP-3: the zone key's DOM mount is unguarded, and no sim-produced back-off has been seen.** Two
   source assertions guard the key's *presence*, but **nothing drives the mount** — removing the
   skeleton div, or forcing `hidden = true`, was caught only because the reviewer asked for it. And
   nobody has watched a **sim-produced** back-off hatch in a browser: the on-screen state was injected
   through the same `Hud.renderZones` door the wire uses, and every link in the chain is pinned
   separately, but the end-to-end path has not been observed. **First E0-6 backlog line.** This is a
   textbook case for the standing rule in §4 — drive it, do not scan it.
6. **WP-8: `C1` proves co-presence, not routing.** It asserts the nudge's click handler and
   `Cmd.pause()` are *both present*, not that one reaches the other: **two mutations pass the entire
   node suite** (554 tests as it stood mid-package; 589 on `main` today) — `if (false && …)`, and
   re-pointing the Overview branch at `Cmd.deck(0)`. The cause is C1's
   own `||` fallback, which the skeleton attribute satisfies. **Fix: drop the fallback, or drive it**
   through `dom-lite.js` and assert the command that comes out.
7. **WP-8: the overlap acceptance excludes crowded pills**, so "hide it" satisfies "don't overlap it".
   The exclusion is the right call, but nothing pins that the roomy cases produce **no** crowded
   labels. **One `assert.ok(!l.crowded)` inside the existing loop closes it.**
8. **A player-facing unreachable-zone indicator** — WP-7's own recommendation. WP-7 traded an
   expensive-and-visible bug for a **cheap-and-invisible** one: a zone painted where no crew can reach
   simply never fills. **WP-3 has now paid most of this down** (the key, the hatch, the tooltip); what
   remains is the MOSS fault row and a log line.
9. **The five E0-4 follow-ups nobody owns**, listed in full in the section below this block
   ("Follow-ups this lane owes"): `bench` mode should skip `HasDevice` tiles (moves a published row);
   collapse the three `AcceptAllMask` derivations into one and **delete** the cross-derivation bridge
   test; `BenchStockpile_StillFills`'s coupling to `SelectStockpile`; **a labour-bound ship** — the
   honest prerequisite for ever quoting a wrong-deck cost again; and the uncovered
   `Console.WriteLine` call site at `hosts/scenario/Program.cs:491` (the warning's *text* is pinned,
   but deleting the *call* leaves the gate green).
10. **`docs/MECHANICS.md:2090`** still says *"`Stockpile` is one boolean tile flag with no filters"* —
    stale since E0-4. One-line fix, flagged by the plan's §10 (which cites it as `:1829`, itself
    already drifted) and never taken.
11. **Wording nit, not a defect.** The nudge reads "CLICK OR PRESS SPACE TO RUN THE SHIP". That is true
    on every *pointer* path (verified on both surfaces with real key events) and false on exactly one
    *keyboard* path, by deliberate design: a keyboard user who arms a tool with Enter keeps focus on
    that button, so SPACE re-activates the tool. **That user is not stranded** — the chip is
    keyboard-reachable (visible focusable 35 of 36). Recorded so nobody "discovers" it as a bug.

### 7. Worktree hygiene

`perilune-wt/` is **already pruned to four**: `main`, `handover` (this lane), `wp3-zones-channel` and
`wp8-markers`. **The last two are merged and safe to remove** —
`git worktree remove ../perilune-wt/<lane>` then `git branch -d lane/<lane>`.

- **Do not prune on someone else's behalf.** The hard rule (`CLAUDE.md` "Work in a worktree") exists
  because two instances once shared a checkout and a measurement was taken against a tree another
  session was editing. Removing a worktree that looks idle is the same class of mistake. Confirm with
  the owner, or leave it.
- One branch is genuinely unmerged and has no worktree: **`lane/e0-4-haul-diagnosis`** (`487d924`,
  "BUG STILL OPEN"), whose bug WP-7 has since fixed. Superseded — read it before deleting it.

## E0-4 — filtered stockpile zones: **LANDED on `main` (2026-07-25), and its headline claim is RETRACTED**

**⚠️ Before quoting ANY `--stockpile far` number from this file, from `ECONOMY.md` §8, or from any
commit message, read this section. This is a RETRACTION, not an extension.** Everything below this
section is history, newest first; where it disagrees with this section, **this section wins**.

E0-4 is on `main` (`0be9d70`, merged `--no-ff` from `lane/e0-4-stockpile-zones`). It was chartered as
**six** work packages (WP-1…WP-6) and shipped **eight**: WP-7 was an orchestrator scope expansion
(a pre-existing engine bug the lane tripped over) and **WP-4b** was a send-back redo, plus one
integration-fix package for three tests that only failed once the packages met. Each was
Opus-implemented and **independently** Opus-reviewed. Lane plan
`docs/design/perilune-e0-4-stockpile-zones.plan.md`. **Gate on `main` @ `7d24ff5`: `./ci.sh` exit 0,
979 dotnet + 529 node, five pins byte-identical.** The full measured tables and every `file:line`
live in **`MECHANICS.md` §13.17** (what is wired but not connected) and **§13.18** (the retraction);
`ECONOMY.md` §8 now carries a correction box. This section is the narrative record.

### ⛔ WITHDRAWN: the `far` column, and the thesis that rested on it

**"A wrong-deck stockpile is a severe throughput regression" was never measured.**
`StockpileHarness.SelectStockpile` gated candidates on the `TileFlags.Walkable` **flag** with **no
reachability test**, and ordered them by distance-to-nearest-bench *descending*. Walkability says
nothing about connectivity: **150 of the slice's 807 walkable tiles (19 %) are unreachable**, sitting
inside the authored observatory behind a door built closed (`sim/Sim.Gen/AuthoredShips.cs:93`
`DoorClosed = true`; `Simulation.IsWalkable` refuses a closed door; **nothing in the sim ever opens a
door**). Distance-descending ranked every one of them above every legal tile, so `--stockpile far`
zoned a **sealed compartment** and measured an unreachable-tile **haul livelock** — a pre-existing
engine bug — and not a cross-deck haul cost at all.

**Every `far` number this lane published is void:** throughput **`6`**, **`2`** and **`9`**;
`HaulPickup` **~49 %** against `HaulDeliver` **~0.0 %**; on-job travel **~0.2–0.3 %**; and A1
**"50.000 % PASS"**. The reframing built on them — *"the wrong-deck regression is primarily a FILTER
problem, the bench rule is the secondary round-trip fix"* — is withdrawn with them. WP-4b's `2 → 9`
movement was real but **mis-attributed**: its mechanism was "the filter removes ~723 Potato from the
pool feeding a livelock", not "the filter pays down a cross-deck haul cost". **No cross-deck distance
was ever paid in any of those runs.**

**The retraction is the wall clock.** A reachability gate now runs in the harness
(`sim.Paths.FindPath` from every live crew member; host-side, no sim change, pin-neutral).
`--stockpile far --days 1` went from **~43 min of wall clock to 24 s** (the **~43 min** is
contemporaneous prose — **no timing artifact survives**, and two contemporaneous sources disagree on
whether it was the 1-day or the 3-day leg; the post-gate numbers are recorded `.time` files, 71.3–73.3 s
across 23 three-day legs); at 3 sim-days every leg now
runs in **~72 s**. `far 4` zones `(60,1,1) (61,10,1) (59,1,1) (60,2,1)` after the gate skips
`(58,15,1) (58,14,1) (57,15,1) (58,13,1) (57,14,1) (56,15,1)`. **Two honest limits of the gate,
disclosed:** it is a **t = 0 snapshot** that never re-runs, and it is **∃-any-live-crew** where the
engine's delivery predicate is *this-carrier-now* — a `HoldPosition` crew member counts as a witness
yet can never haul (measured inert on the slice: 0 of 40 picks affected).

### ⚠️ `ECONOMY.md` §8's −14 % is NEITHER CONFIRMED NOR REFUTED — and the slice **cannot settle it**

**Do not let the record drift into "the regression was disproved". It was not.**

End-of-run `ControllerModule` — the metric this lane aimed its acceptance at — is **matter-bound, not
labour-bound**. `MECHANICS.md` §13.15 already said so and **named this lane**. Every unmodified leg
(baseline, `bench 4/40`, `far 4/40`, `filtered-far 4/40`) ends on the *identical* ground stock
`Corpse=1 Potato=699 ControllerModule=31` with **zero Regolith/Scrap/Parts left**: the ladder converts
the ship's whole matter budget by ~h28 and idles. `far 40`'s entire haul cost is **1.6 crew-hours
against ~352 crew-hours of post-cliff idle** (h29–h72 × 8 crew) — it must be **~200× larger** *and*
land as contention during h1–h28 to move the count by one module.

**So "31 in every leg" is UNINFORMATIVE — a saturated instrument, not a null result.** The first
version of the re-measurement read that saturation as a refutation and was **sent back for it**.
Settling §8 needs a ship whose economy is **labour-bound**; the slice is not one.

### ✅ What IS measured and stands (slice, 3 sim-days = 2,592,000 ticks, one seed, **n = 1**)

| leg | modules | haul % | on-job travel | delivery legs | A1 h24 |
|---|---|---|---|---|---|
| no flag (baseline) | 31 | 0.000 | — | 0 | 24.979 FAIL |
| `bench 40` | 31 | 0.169 | 4.6 % | 74 | 24.979 FAIL |
| `far 40` | 31 | 0.278 | 5.2 % | 80 | 24.979 FAIL |
| `filtered-far 40` | 31 | 0.115 | 4.2 % | 31 | **25.219 PASS** ⚠️ |
| `strip 40` (headroom, no zone) | 50 | 0.000 | — | 0 | 37.424 PASS |
| `strip 40 + bench 40` | 51 | 0.146 | 2.9 % | 63 | 37.417 PASS |
| `strip 40 + far 40` | 51 | 0.332 | 3.6 % | 91 | 37.479 PASS |
| `strip 40 + filtered-far 40` | 50 | 0.137 | 2.9 % | 40 | 37.622 PASS |

- **Cross-deck haul works.** Deliveries land on deck 1 via the ladders in every zoned leg. That
  refutes the **stranding** half of §8's "catastrophic" — material is not marooned. It bounds no cost.
- **A reachable far-deck stockpile is nearly harmless at equal capacity.** At N = 40 it costs
  **+0.109 pp** of crew time and **+0.6 pp** of on-job travel over a bench-side zone (with
  `--strip 40`: **+0.186 pp** and **+0.7 pp**).
- **Per delivery it costs ~1.5× a bench-side one** — the normalised figure, not a total: 0.00348 vs
  0.00228 %-of-crew-time per leg at N = 40; 0.00365 vs 0.00232 with `--strip 40`. **That 1.5× is a
  LOWER BOUND:** an abandoned leg is counted but carries fewer ticks, so over-counted legs inflate the
  denominator and bias the ratio *downward*. (Bias is small here — `Flee` 0.00 %, 8/8 crew alive in
  every leg, so abandons are path-loss only.)
- **With headroom the metric resolves and placement still does not move it:** `--strip 40` reads
  **50 → 51**, and **far still equals bench**.
- **The harness is sound:** the `--strip 40` leg reproduces `MECHANICS.md` §13.15's published E0-5
  numbers to the digit (31 → 50, A1 37.424).

### ✅ §8's MECHANISM is real, and WP-4's bench rule is what suppresses it — the lane's best result

§8's named root cause is *"crafting **outputs** spawn unreserved, so the haul board drags them to the
stockpile, from which the downstream station's fetcher must walk them back"*. WP-4's bench rule
(`sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:216`) deletes exactly that: `_benchWanted` =
`{Regolith, Scrap, Parts}` is dropped from the candidate pool first, `Corpse` is hard-excluded
(`:208`), `MetalOre` is a dead kind no system creates — leaving only `Potato` and `ControllerModule`
haulable, and **neither is an input to any bench**. So every unmodified leg above measures "is there a
regression?" **on a tree that already contains the fix.**

With the rule reverted (`_benchWanted` forced to 0 — a **measurement-only local revert, never
committed**; independently replicated by the textually different edit of deleting the guard, and
bit-identical on all three re-run legs):

| revert leg | modules | haul % | on-job travel | delivery legs |
|---|---|---|---|---|
| `bw0 + bench 40` | 31 | 0.357 | 5.0 % | 156 |
| `bw0 + far 40` | 31 | 0.762 | **9.3 %** | 244 |
| `bw0 + strip 40 + bench 40` | 51 | 0.389 | 3.1 % | 202 |
| `bw0 + strip 40 + far 40` | 51 | 0.795 | 6.8 % | 263 |

**The double dissociation — the cleanest evidence this lane produced, and it replicates in BOTH
horizons.** With a **far-deck** zone the revert costs **+3.2–4.1 pp** of on-job travel **and crafting
occupancy RISES**: **21.71 % → 22.09 % (+0.38 pp)** with `--strip 40`, and **12.52 % → 12.72 %
(+0.20 pp)** without it — while idle `None` falls in both (75.35 % → 74.37 % with headroom, 84.85 % →
84.10 % without). The *stations*, not the haulers, do the extra walking: §8's sentence observed
directly for the first time. With a **bench-side** zone crafting occupancy **FALLS**, again in both
horizons (**21.64 % → 21.33 %** with headroom, **12.48 % → 12.12 %** without), at a cost of only
**+0.2–0.4 pp**.

| revert, crafting occupancy | with `--strip 40` | without |
|---|---|---|
| **far-deck** zone | 21.71 → **22.09 %** (+0.38) | 12.52 → **12.72 %** (+0.20) |
| **bench-side** zone | 21.64 → **21.33 %** (−0.31) | 12.48 → **12.12 %** (−0.36) |

**The sign flips with placement in both horizons**, so this is the §8 round-trip and **not merely
"more hauling happens"** — a volume story would push crafting the same way regardless of *where* the
zone is. That validates WP-4 as a wrong-deck mitigation far better than any throughput number would
have. **Note the contrast with the magnitude question:** the *direction* is horizon-independent; every
*fraction* is not.

### ⛔ DELIBERATELY NOT QUANTIFIED: how much of §8 the bench rule removes

**No future edit should supply a single percentage, and one that does is cherry-picking.** The
fraction depends entirely on which contrast is chosen — **all four rows below are the `--strip 40`
(matter-headroom) legs**, which is load-bearing, not a footnote (see the warning under the table):

| contrast (**`--strip 40` legs**) | fraction |
|---|---|
| far's **absolute** on-job travel (6.8 → 3.6 %) | ~47 % |
| the **far-minus-bench travel penalty** (+3.7 → +0.7 pp) | ~81 % |
| haul **volume** (263 → 91 delivery legs) | ~65 % |
| the **per-delivery** penalty (**1.57× with the rule, 1.57× without**) | **~0 %** |

> **⚠️ WITHOUT HEADROOM THE LAST ROW FLIPS SIGN — label the horizon or the table misleads.** Re-derive
> the per-delivery penalty from the **un-stripped** rows of the table above and you get **1.52× with
> the rule** (`far 40` 0.278/80 = 0.00348 vs `bench 40` 0.169/74 = 0.00228) against **1.37× without**
> (`bw0 + far 40` 0.762/244 vs `bw0 + bench 40` 0.357/156). At N = 40 with no `--strip`, the bench rule
> makes the per-delivery penalty **larger, not equal** — the opposite of "~0 %". A reader re-deriving
> from our own published rows and finding 1.52 ≠ 1.37 would reasonably conclude the record is wrong.
> **It is not: "~0 %" is a `--strip 40` statement.** This is exactly why the magnitude is declined —
> even the *sign* of "does the rule change the per-delivery cost?" is horizon-dependent.

**The rule does not make a wrong-deck haul cheaper. It makes 2.1–3.2× fewer of them happen**, by
returning `{Regolith, Scrap, Parts}` to the pool. **Direction and placement-dependence are measured;
magnitude is not.** Quote absolute pp and never ratios: **on the `--strip 40` legs** the rule's removal
adds **+0.463 pp** of haul cost on the far deck against **+0.243 pp** beside the benches — as a *ratio*
bench is hit harder there (**2.66× vs 2.39×**), which inverts the story and is the wrong axis.
(**Without headroom**, same axis: **+0.484 pp** far against **+0.188 pp** bench, ratios **2.74× vs
2.11×** — the pp ordering is stable across horizons, the ratio ordering is not, which is the whole
argument for quoting pp.) And **§8's magnitude is never approached**: worst on-job travel anywhere is
**9.3 %** against §8's **75.7 %**, ~8× short, and it never costs a module.

### ⚠️ The A1 trap, for the fourth time in one lane

`filtered-far 40` is the **only** unmodified leg whose A1 "PASSES" — **25.219 %** against the 25 %
target — and its throughput is **31, identical to the FAILING baseline**. A1 counts crew who are
**busy**, and **haul is busywork**. The withdrawn "50.000 % PASS" was pure livelock: crew claiming and
abandoning, producing nothing. **Never read A1 as production.**

Remedy landed with the retraction: the plain verb-less `occupancy --ship slice --days 3` report — the
exact run whose `31` was misread into the retracted claim — now prints an unconditional ⚠️ matter-
headroom warning beside `ground stock`, naming `--strip N` as the remedy, guarded by
`StockpileHarness.MatterHeadroomWarning(int)` and a test that asserts the message keeps naming the
remedy. Exactly **one** added line; the other 100 are byte-identical, verified by stash/diff.
**Disclosed residual:** the single `Console.WriteLine` **call site** (`hosts/scenario/Program.cs:491`)
is **uncovered** — the tests project does not compile `Program.cs` — so the *text* of the warning is
pinned but **deleting the call leaves the gate green.** The guard covers the message, not its
emission.

### What else the lane shipped

- **A real pre-existing bug fixed (WP-7).** An unreachable stockpile tile no longer livelocks the haul
  board (72,928 pickup starts per 30k slice ticks → **918 / 2.254 %**; it was burning ~8 crew at ~50 %
  duty). **Its honest cost: the bug went from expensive-and-visible to cheap-and-invisible** — a zone
  painted where no crew can reach now simply never fills, **silently**, with no indicator on any
  surface, no MOSS fault row and no log line. Arguably a worse *play* experience than the livelock,
  which at least showed activity. `MECHANICS.md` §13.17-(1); **a live follow-up, first E0-6
  candidate.** The fix also **degrades with terrain churn** (up to 93 % defeat under adversarial
  `Tiles` dirtying, gracefully; escape hatch recorded in §13.17-(2)).
- **The packages.** WP-1 filled the W0-6-empty `StockZoneSystem` (`ZONE` v1→v2, packed-sorted
  registry, absent entry = accept-all); WP-2 added `SetStockpileFilterCommand` and made haul honour
  the filter; WP-3 the opt-in `occupancy --stockpile <bench|far|filtered-far> [--stockpile-n N]`
  harness; WP-4 the bench rule; WP-5 the filter UI; WP-6 made an accept-all mask store **no** registry
  entry, so the haul fast path stays reachable; WP-7 the livelock fix; WP-4b the reachability gate and
  the re-measurement above.
- **The `bench` leg was MISLABELLED — label corrected, measurement unchanged.** `--stockpile bench 4`
  picks `(13,5,0)`, `(16,5,0)`, `(22,6,0)` — **the three benches themselves, distance 0** — plus
  `(13,4,0)`, the one genuinely adjacent tile, because `DesignateStockpileCommand`
  (`sim/Sim.Core/Commands/Commands.cs:137`) gates only on `Walkable` with **no device exclusion**. A
  player can do this too; it is not a harness artifact. It is a stockpile **on and beside** the
  benches, not one "hugging" them. **Follow-up recorded, not taken:** make `bench` mode skip
  `HasDevice` tiles so the mode means what it says — **that moves the published bench row and requires
  re-running the 3-day A/B**, and nobody has quantified how much it would change.

### The architecture boundary test fired for real, within minutes — and one merge deliberately skipped review

**This is the economy-modularity audit's single best evidence of value, and it earned its keep the day
it landed.** The audit shipped an architecture-boundary test with an allowlist of sanctioned
`sim.Systems` reaches, **measured pre-E0-4**. E0-4's WP-2 had added a `sim.Systems` reach in
`HaulJobSource` to resolve `StockZoneSystem` once (mirroring `DeconstructJobSource` — legitimate, and
exactly the kind of thing the allowlist exists to make *visible* rather than to forbid). The two
landed within minutes of each other and **the gate went red on `main` immediately**, which is the
test doing its job on its first real encounter. Fixed by an allowlist entry plus the doc figures
(`d43f545`, `49e42d4`).

> **⚠️ DELIBERATE DEVIATION FROM THE REVIEW DISCIPLINE, recorded here on purpose.** `d43f545` was
> merged **without an independent review round** — the only merge that day that was not independently
> reviewed. **Integrator's rationale:** a red gate sitting on `main` is worse than an unreviewed
> allowlist bump, and three directional mutations were run to prove the entry was correct and
> narrow. **This is stated because the record elsewhere says E0-4's packages were "each independently
> Opus-reviewed", which is true of the packages and NOT of everything merged that day.** A deliberate
> deviation belongs in the record, not only in a scratchpad.

### Follow-ups this lane owes, and nobody yet owns

1. **A player-facing unreachable-zone indicator** — WP-7's own recommendation. `BackedOffStockpileTiles`
   (`HaulJobSource.cs:108`) is one line from being enumerable and would ride the existing view-only
   wire channel beside `designs`/`materials`, plus a MOSS "UNREACHABLE ZONE" fault row.
   Projection-pure, pin-neutral. **First E0-6 item.**
2. **Two stale code comments** (`hosts/tui/GameLoop.cs:56-60`, `client/src/ui/stock-filter-model.js:38-45`):
   the WP-5 cost disclosure is wrong in both halves — WP-6 made accept-all store no entry, so the
   `filtered` fast path is *not* permanently armed, and the exponent was `O(items × tiles²)`, not
   `O(items × tiles)`. Recorded rather than fixed because the correcting package was docs-only.
3. **`bench` mode should skip `HasDevice` tiles** (see above) — moves a published row.
4. **`economy-modularity` §1.4 is stale and was NOT re-audited.** Its LOC ledger (`HaulJobSource`
   257 → 512, `StockZoneSystem` 58 → 300) and its "four of the six economy systems are empty stubs"
   claim both predate E0-4; `StockZoneSystem` is no longer a stub. **Someone must own this.**
5. **A labour-bound ship** — the honest prerequisite for ever quoting a wrong-deck cost again.
6. **Collapse the three `AcceptAllMask` derivations** into one — make every site consume
   `StockZoneSystem.AcceptAllMask`, then **delete** (do not maintain) the cross-derivation bridge
   test. Until then the host-side `& AcceptAllMask` in `GameSession.HandleFilter` is redundant *only
   while the three derivations agree at `0x7F`*, and **no test can bite it** (`MECHANICS.md`
   §13.17-(10)). Decision on record: keep the line, document the divergence condition, no status
   accessor.
7. **`BenchStockpile_StillFills` is coupled to `SelectStockpile(far: false, 4)`** rather than
   declaring its tiles — accepted as a one-way ratchet, not fixed (`MECHANICS.md` §13.17-(11)).

### ⇒ NEW PROGRAMME in flight: console retirement (owner decisions 2026-07-25)

`--ship grid` wearing the **Level-1 Overview** + **Level-2 Room Zoom** is now **the one standard UI**;
the `.app` console shell is deprecated and **closed to new work**; `--ship slice` is the **headless
measurement fixture** and needs no face. This is a binding `CLAUDE.md` invariant (**THE STANDARD
SURFACE**), mechanised in `client/test/surface-boundary.test.js` +
`tests/Perilune.Tests/SurfaceBoundaryTests.cs`, **because E0-4's WP-5 built the entire stockpile
`ACCEPTS ▸` filter onto the deprecated console — implemented, independently reviewed, merged — and
nobody noticed until the running game was opened.** Plan:
`docs/design/perilune-console-retirement.plan.md` (826 lines, on `lane/console-retirement` — it is
**not on `main`**, though `CLAUDE.md` already cites it).

> **⇒ CORRECTED later the same day: the plan IS on `main`**, merged at `8d5aebf`. The sentence above
> was true when written and is kept only so the sequence is traceable.

Landed on `main`: WP-0 surface guard, WP-1 grid playability, WP-7 RELATIONS re-home. **Not yet
dispatched, deliberately:** WP-3 zones wire channel (**touches `WireFormat`, a SPINE file — integrator
lane only**, and it is the serial critical path for WP-2/WP-6) and WP-8 markers/task-line/nudge.

> **⇒ CORRECTED later the same day: WP-3 and WP-8 were both dispatched, reviewed and merged**
> (`e26a56c`, `3aecf4b`), each after one send-back. WP-3's `WireFormat` edit came out to **one token**
> (`class` → `partial class`), with the channel in a sibling `hosts/web/WireFormat.Zones.cs`. See
> **⇒ START HERE** at the top of this file for the settled state and the next steps.
**Key findings:** `hud.js` is 1291 lines of *fused* shared-state + console chrome that **both** modern
surfaces import, so retirement is a **split, not a delete**, and 8 writers deref `$(id)` unguarded
(pull `.app` without the split ⇒ white page); designations **already ride the wire** (both SVG
surfaces discard `cell[1]`); debris is **invisible in both** today; and the biggest risk is that the
`hud.js` split has **no test net** (no node test imports it).

### ⇒ Two lessons that cost real work today and must not be rediscovered

Both are written up with `file:line` countermeasures in **`CLAUDE.md`, "Traps that have each cost this
project real work"**. In one line each:

1. **A guard that matches raw source text is satisfied by the thing it guards against, COMMENTED
   OUT.** This landed independently in **four** packages today — in CSS, in C#, and twice in
   JavaScript — and every one of those tests looked correct and passed its suite. The countermeasure
   is a **quote-aware comment stripper** (so string literals survive) **plus a negative control**
   proving comments do *not* trip the scan. It is the general form of this repo's most common review
   finding: **a test whose named mutation cannot bite.** E0-4 produced six.
2. **`git checkout` must never appear in a mutation loop.** It cost this project work **twice** — once
   destroying an uncommitted test written by an earlier session, once discarding an agent's own
   in-flight edits. **The rule: the restore source is an in-memory copy taken BEFORE the first
   mutation**, never git. Beside the pre-existing `shutil.copy2` mtime trap (restoring with `copy2`
   preserves mtime, MSBuild skips the rebuild, and the *previous* mutation's assembly runs).

**Two more from this integration, worth carrying:** per-branch review + a clean `git merge-tree` does
**not** imply a green merged lane — WP-6 and WP-7 were each reviewed PASS in isolation, merged
textually clean, and **three tests failed only once the packages met** (all three were stale tests,
merged behaviour correct). And per-branch gate counts **do not add**: E0-4's branches read 918–928
apiece, the merged lane read 943 passing of 946.

**Landed on `main` (2026-07-24, docs-only):** `docs/design/perilune-automation-player-journey.md`
— an easy-to-understand design of *how an automation enthusiast plays the game*, grounded in the
binding automation-&-souls principle. Opus-written + independently Opus-reviewed. No code, no pins.
(Not part of E0-4; a standalone reference. See memory `automation-player-journey-doc`.)

## Orientation — the E0-4-era version (2026-07-25, midday). **SUPERSEDED by ⇒ START HERE at the top.**

> **Kept, not current.** The block at the top of this file is the orientation a fresh instance should
> read; this one is retained for its detail on the five pins and on how to read the retraction. Its
> points 0–4 are still accurate. **Its closing "In flight" line is not** — see the correction there.

0. **⚠️ E0-4 IS LANDED on `main`, and its published far-leg thesis is RETRACTED.** Read the
   **top section of this file** in full before quoting any stockpile number — it is a retraction, not
   an extension. Short version: "a wrong-deck stockpile is a severe throughput regression" was **never
   measured** (the `far` harness leg zoned a **sealed room**; what it measured was an unreachable-tile
   haul livelock), cross-deck haul works, and `ECONOMY.md` §8's −14 % is **neither confirmed nor
   refuted — the slice cannot settle it**, because throughput there is matter-bound. **Do not record
   §8 as disproved.** The lane plan `docs/design/perilune-e0-4-stockpile-zones.plan.md` is the
   authority on the lane's *shape* (but **not** on its far-leg numbers); the automation/souls
   principle `docs/design/perilune-automation-and-souls.md` governs future economy work. **The
   section further down titled "E0-4 — filtered stockpile zones: IN PROGRESS" is SUPERSEDED HISTORY**
   — it is kept so old numbers can be traced to their retraction, not as guidance.
1. **Read "A1 MEASURED" further below** — what the economy actually does today, and the reason it
   is still the frame for everything in E0: it **terminates at sim-hour 28** and is **matter-bound**.
   E0-4 spent a work package rediscovering that. The E0-5-before-E0-4 sequencing case beneath it is
   settled history (both landed, in that order, and the order was right). Everything below the E0-4
   section is history, newest first.
2. **`docs/MECHANICS.md` is the authority on behaviour**, and its **§13** lists what is wired but
   not connected. **§13.15** is the current occupancy measurement; **§13.17** is E0-4's
   wired-but-not-connected list and **§13.18** is the `--stockpile far` retraction — read §13.18
   before quoting any stockpile figure. **§13.6** is closed.
3. **Work in a worktree — always** (`CLAUDE.md` hard rule), even for doc-only work. Never edit the
   main checkout; never `git add -A`.
4. **Re-measure before quoting numbers.** Test counts and pins move every lane, and the counts in
   this file have repeatedly gone stale (894 and 914 both appeared while the true lane value was
   918). **`main` @ `7d24ff5` measures 979 dotnet + 529 node** (`./ci.sh` exit 0). Per-branch counts
   measured in isolation **do not add on merge** — E0-4's five side branches read 918–928 apiece and
   the merged lane read 943. **There are now FIVE pins, not four**, and all five are gate-enforced:
   scenario `00e0a2dadb8e5076` (`ci.sh:31`), tick-3000 `4be2e77864fb7409` and slice
   `1f8f2225ee568de9` (golden files), defs-**defaults** `5a471d12643b64f9`
   (`DefsChecksumTests.cs:69`) and defs-**rules-inclusive** `3f23ce5bd40283c8`
   (`DefsChecksumTests.cs:146`). **These last two are different values for different things and have
   been confused repeatedly**: `3f23ce5bd40283c8` is what every occupancy run prints at the top of its
   output — never paste it into the defaults pin. **Both were pinned for the first time on
   2026-07-25**: the rules-inclusive value had never been asserted, and the defaults value appeared
   **nowhere** in `ci.sh`, `tests/`, `sim/`, `hosts/` or `content/`, so every "all four pins hold"
   claim written before today rested on a *printed* value for that one (found by the
   economy-modularity audit, `docs/design/perilune-economy-modularity.md` §0.2). E0-4 moved none of
   the five.

**Landed so far:** P2 complete + playtest rounds 1–4 + Console UI rebuild + RELATIONS tab + the
mechanics reference + MOSS terminal + the economy redesign + economy **Wave 0** + **E0-1**
recruitability + **E0-2** work-rate rebase + **E0-3** player verbs & order precedence + **E0-5**
deconstruct/strip + **E0-4** filtered stockpile zones (**with its far-leg thesis retracted** — see the
top section) + wall drag-build & materials + drifting starfield + the **A1 measurement** + the
**economy-modularity audit** + the **automation & souls** design principle.
**In flight (NOT complete on `main`):** the **console-retirement programme** — WP-0/WP-1/WP-7 landed,
WP-3 (a `WireFormat` SPINE edit) and WP-8 not yet dispatched.

> **⇒ CORRECTED later the same day: WP-3 (`e26a56c`) and WP-8 (`3aecf4b`) have landed too, and
> NOTHING is in flight.** Five of the programme's 11 packages are done (WP-0, WP-1, WP-3, WP-7, WP-8);
> the remaining order is WP-2 → WP-4 → WP-5 → WP-6 → WP-C → WP-9, behind one non-programme sim lane.
> **⇒ START HERE** at the top of this file is the authority on all of it.

## ⛔ SUPERSEDED HISTORY (2026-07-24) — E0-4 as it looked mid-lane. Kept so old numbers can be traced.

> **This whole section is superseded by the E0-4 section at the top of this file (2026-07-25).** It is
> retained **only** so a reader who meets one of its numbers elsewhere can trace it to its retraction.
> **Nothing in it is guidance.** Where it disagrees with the top section — on merge state, on branch
> layout, on the pin count, on what §8 does and does not say — **the top section wins.** Its
> `far`-column figures were already known confounded when it was written; the corrections that came
> *after* it are the ones marked ⚠️ **CORRECTED 2026-07-25** inline below.

## E0-4 — filtered stockpile zones: IN PROGRESS on `lane/e0-4-stockpile-zones` (2026-07-24), READ IF RESUMING

**Status: nothing is on `main`.** *(⚠️ **SUPERSEDED 2026-07-25** — E0-4 merged to `main` at `0be9d70`;
all five branches below are merged and their worktrees are spent.)* The lane branch carries WP-1/2/3/4;
four further packages sit
**reviewed PASS and unmerged on their own branches** (WP-3-rigor, WP-5, WP-6, WP-7) plus a
diagnosis branch; **WP-4b is implemented but SEND-BACK and must NOT be committed as-is** — its
implementation is sitting **uncommitted in the lane worktree** (`hosts/scenario/Program.cs`,
`hosts/scenario/StockpileHarness.cs`). Orchestrated the same way as E0-5 (plan agent → per-WP Opus
implementer → **independent** Opus reviewer → integrator). Lane plan:
**`docs/design/perilune-e0-4-stockpile-zones.plan.md`**. Worktree:
`../perilune-wt/e0-4-stockpile-zones`.

**This section is a RETRACTION, not an extension.** The lane's own published record has now been
corrected three times for claims outrunning measurement. Read the retraction block first; then
treat every `far`-leg number previously written down as void.

### ⛔ RETRACTED: "a wrong-deck stockpile is a severe throughput regression" was NEVER MEASURED

The `--stockpile far` harness leg does not measure a wrong deck. It measures a **sealed room**.

`StockpileHarness.SelectStockpile` (`hosts/scenario/StockpileHarness.cs:70`) gates candidates on
the `TileFlags.Walkable` flag alone (`:90`) with **no reachability test**, and orders them by
distance-to-nearest-bench *descending*. On the slice that deterministically lands **3 of its 4
tiles inside the authored sealed observatory** — `sim/Sim.Gen/AuthoredShips.cs:93` builds it with
`DoorClosed = true`, `Simulation.IsWalkable` refuses a closed door, and **nothing in the sim ever
opens a door**. Those tiles are `Walkable` but **unreachable**.

`JobWork.IsFreeStockpileTile` (`sim/Sim.Core/Jobs/JobContext.cs:115-121`) has **no reachability
term**, so a single unreachable free tile holds the per-item candidate gate permanently open while
delivery can never succeed. The result is a **2-tick claim/abandon livelock** across ~8 crew at
~50 % duty — which is the entire "49 % HaulPickup" signal the lane published.

Controls (30,000 slice ticks) — **reachability, not distance and not deck, is the differentiator**:

| zoned tiles | pickup starts | deliveries | pickup share |
|---|---|---|---|
| `bench` 4 (all reachable) | 10 | 9 | 0.913 % |
| **`(60,1,1)` alone — far deck, REACHABLE** | **2** | **2** | **0.175 %** |
| the 3 observatory tiles alone (unreachable) | 72,928 | 0 | 31.191 % |
| `far` 4 (1 reachable + 3 not) | 48,857 | 2 | 21.548 % |

Reachability was confirmed independently with `sim.Paths.FindPath` from every crew member:
`(58,15,1) (58,14,1) (57,15,1)` are reachable by **no** crew member; `(60,1,1)` and all four
`bench` tiles are reachable by some.

**Consequences, all of which must survive into whatever is written next:**
- **`ECONOMY.md` §8's −14 % wrong-deck regression is not reproduced by any run in this lane.**
  ~~It is neither confirmed nor refuted here — it was never actually tested.~~
  **⚠️ CORRECTED 2026-07-25:** it *was* subsequently tested, as far as this ship allows — a
  reachability gate, a re-measured `far` column, `--strip 40` matter headroom, and a
  measurement-only revert of the bench rule. It is **still neither confirmed nor refuted, and the
  slice cannot settle it**: end-of-run throughput there is matter-bound, so the metric has no power
  (see the top section, and `MECHANICS.md` §13.18). "Never actually tested" is no longer the reason;
  "the instrument cannot move" is.
- **Cross-deck haul demonstrably WORKS.** The deliveries in the reachable-far leg carried Potato
  from `(29,6,0)` on deck 0 to `(60,1,1)` on deck 1 via the ladders. A *reachable* far-deck
  stockpile costs **0.175 %** of crew time and delivers.
- Every `far`-column number in this lane's prior record — the `6`, the `2` **and** the `9` — is
  the same sealed room measured three ways. **All of it must be re-measured.**
- The livelock is **PRE-EXISTING, not introduced by E0-4**: measured at the lane's parent
  `6911d18` it is *worse* (33.5 % churn). It is **undocumented in `MECHANICS §13`**; §6.2 step 4
  documents the `UnreachableRetryTicks = 50` backoff discipline that `ProgressPickup` violates.
- A characterization test asserting the **broken** behaviour on purpose is committed on
  `lane/e0-4-haul-diagnosis` (`487d924`,
  `tests/Perilune.Tests/HaulUnreachableStockpileLivelockTests.cs`). It goes RED when the bug is
  fixed; **WP-7 inverts it.**

### Four further statements in the prior record are FALSE — corrected here

1. **"WP-4b is UN-STARTED — nothing was written." FALSE.** A complete WP-4b implementation was
   found uncommitted in the lane worktree and verified (it builds; it ran a 3-day measurement to
   completion). It is send-back for *other* reasons (below), not for not existing.
2. **"An endless pick-up-and-re-drop thrash." FALSE.** Crew **never pick anything up** — the claim
   is released before carry state changes. Nothing is ever carried and nothing is ever re-dropped.
   The shape is claim/abandon, not carry/drop.
3. **The `far` and `bench` test counts in the prior record are stale, and the per-branch counts do
   NOT add.** `894` is `main`'s gate; `914` was this section's own stale claim; `918` is the
   measured lane count pre-WP-5 (matching WP-4's commit message). Per-branch measured counts are
   in the branch table below; **each was measured in isolation on top of the lane base, so they
   overlap and cannot be summed — the merged-lane gate must be re-measured from scratch.**
4. **"`--stockpile bench` is a stockpile hugging the benches." MISLEADING.**
   `DesignateStockpileCommand.Execute` (`sim/Sim.Core/Commands/Commands.cs:134-138`) gates only on
   `Walkable` with **no device exclusion**, so bench tiles are legal candidates at distance **0**
   and legal zone tiles — a player can do this too; it is not a harness artifact. `--stockpile
   bench 4` picks `(13,5,0)`, `(16,5,0)`, `(22,6,0)` — **the three benches themselves** — plus
   `(13,4,0)`. So **3 of 4 zone tiles are ON the benches; exactly one is adjacent.** Second-order:
   crafting outputs spawn at `worker.Pos` (`sim/Sim.Core/Systems/CraftingSystem.cs:196`) and the
   worker stands *adjacent* to the station, so outputs can land on `(13,4,0)` — the one genuinely
   adjacent zoned tile — where `HaulJobSource`'s "already stored" guard
   (`sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:122`) skips them, so **they never enter the haul
   pool at all.** The bench-leg *conclusion* still holds directionally (throughput held at
   baseline 31, near-zero haul at 0.026 + 0.021 % — what a working pre-positioning buffer looks
   like), but the **label** was wrong in two places (this file, and
   `hosts/scenario/StockpileHarness.cs:21-22`). Cheap fix taken: correct the wording. Recorded
   follow-up **not** taken: make `bench` mode skip `HasDevice` tiles so the mode means what it
   says — **that moves the published bench row and requires re-running the 3-day A/B**; nobody has
   quantified how much it would change.

**And the reframing that rested on all of it is withdrawn:** "the wrong-deck regression is
primarily a FILTER problem, the bench rule is the secondary round-trip fix" was derived from the
confounded `far` column and **is not supported**. WP-4b's `2 → 9` throughput movement is real but
**mis-attributed**: its mechanism is "the filter removes ~723 Potato from the pool feeding a
livelock", **not** "the filter pays down a cross-deck haul cost" — no cross-deck distance is ever
paid in that run. ~~`ECONOMY.md` §8 still needs a correction; **we do not yet know what it should
say.**~~

> **⚠️ CORRECTED 2026-07-25 — the withdrawal above STANDS, and we now know what §8 should say.** The
> `ECONOMY.md` §8 correction is written (its box under "A warning from measurement"). The reframing
> stays withdrawn, but the **opposite** finding turned up: §8's *mechanism* is **positively
> supported**, and **WP-4's bench rule is what suppresses it**. With the rule reverted
> (measurement-only), a **far-deck** zone raises on-job travel **and** raises crafting occupancy while
> a **bench-side** zone lowers it — the sign flips with placement, which is the §8 round-trip rather
> than "more hauling". **How much of §8 the rule removes is deliberately NOT quantified.** See the top
> section and `MECHANICS.md` §13.18.

### The design (DECIDED — Garvin, 2026-07-24 — "Choice A")

Stockpile *presence* stays on `TileFlags.Stockpile` (bit 4, E0-3); only the *filter* (a per-tile
`ulong AcceptMask`, bit k = accept `ItemKind` k) moves into the `ZONE` SYSS registry
(`StockZoneSystem`), keyed by packed position; **absent registry entry = accept-all** (back-compat
with every E0-3 stockpile and every old save, zero migration). The full presence-migration
("Choice B") was **rejected** — `ECONOMY.md` §8 forbids *filters* in `TileFlags`, not the presence
bit. Reserved bit 7 untouched.

### Branches — five side branches, all unmerged, nothing on `main`

| branch | head | verdict |
|---|---|---|
| `lane/e0-4-stockpile-zones` | `395a65a` | the LANE. WP-1/2/3/4 + plan + hand-off commits. **WP-4b is UNCOMMITTED in this worktree.** |
| `lane/e0-4-wp3-rigor` | `42e5b27` | **PASS**, polish applied. Test-file only; `StockpileHarness.cs` byte-identical to lane HEAD. 918 dotnet + 485 node. |
| `lane/e0-4-wp5-filter-ui` | `1e52b0e` | **PASS** (implemented → reviewed → send-back fixed → re-reviewed). |
| `lane/e0-4-wp6-mask-collapse` | `35bacc9` | **PASS**, polish applied. Sim edit. 926 dotnet + 485 node; four pins byte-identical, goldens untouched vs lane base. |
| `lane/e0-4-wp7-unreachable-backoff` | `5b72e04` | **PASS**, editorial applied. Sim edit. 928 dotnet + 485 node; four pins byte-identical, goldens untouched. **Scope expansion — separable (see open decisions).** |
| `lane/e0-4-haul-diagnosis` | `487d924` | diagnosis only, no sim change. Characterization test asserting the BROKEN livelock; goes RED once WP-7 lands. |

**WP-1** `765897f` + F1-fix `79d56bb` (**PASS**) — filled the W0-6-empty `StockZoneSystem` as
`DeconstructSystem`'s twin: `struct StockZone{Int3 Pos; ulong AcceptMask}`, packed-sorted registry,
`SetFilter`/`ClearFilter`/`TryGetFilter`/`Accepts`, `Pack`/`InsertSorted` (the deliberate 4th
copy), `ZONE` save **v1→v2** (version-BRANCH: a v1 marker-byte blob upgrades to accept-all),
`StateChecksum` fold (**an empty registry folds a bare `Seed` — byte-identical to today, which is
what holds the pins**), and a `Simulation.StockZones` reference accessor (no new hashed/saved
field). No `SystemStack` edit — W0-6 pre-registered `ZONE`. Review F1: the v1→v2 bump orphaned a
neighbouring named mutation in `EconomySystemRegistrationTests`; re-targeted to the v2 format.

**WP-2** `e88e548` (**PASS**) — `SetStockpileFilterCommand(pos, mask)`, the one new command;
`DesignateStockpileCommand` OFF now also `ClearFilter`s (no orphan entries); and **haul honours the
filter** (a kind-ed `IsFreeStockpileTile` overload, a per-item candidate gate, `TryPathToFree
Stockpile` filtering destinations, a lazy `StockZones` resolve in `BeginTick`). No bench rule. The
reviewer empirically proved the `filtered` fast path is byte-identical to no-filter for an
accept-all mask.

**WP-3** `a7d3f3d` (**SEND-BACK on test rigor only; fixed on `lane/e0-4-wp3-rigor`**) — the opt-in
`occupancy --stockpile <bench|far> [--stockpile-n N]` harness (host-only, mirrors E0-5's
`StripHarness`; the verb-less default path stays byte-identical), plus occupancy reporting of
Haul %, throughput (`ControllerModule` end-count), on-job travel % and `stockpile tiles zoned`. The
*measurement machinery* was fully reproduced by the reviewer and is sound — it is the
**interpretation** of the `far` leg that the retraction above voids. The two review findings were
non-biting named mutations (F1 `SelectStockpile_IsIdenticalAcrossTwoRuns` cannot detect a missing
tie-break, since identical input gives identical `Sort` output; F2 an `N ≤ 0` guard redundant with
the `picks.Count < n` loop), both fixed at `42e5b27`.

**WP-4** `c6df011` (**PASS**) — the "don't haul what a bench wants" rule: a `_benchWanted` mask in
`HaulJobSource.Rescan` (`sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:129`) that keeps a
bench-wanted kind out of the haulable pool entirely, ceding it to `CraftingSystem.StepFetch`. Four
named-mutation tests + a `JobDispatchTests` zero-alloc refactor; 918 dotnet green; four pins held.
**Its far measurement measured the sealed room** and is void. The rule itself is unit-proven as the
intermediate round-trip fix and stands on that evidence, not on the `far` column.

**WP-4b** — **implemented, REVIEWED, SEND-BACK. Do not commit as-is.** It adds a `filtered-far`
harness mode (the same tiles as `far`, plus a `SetStockpileFilterCommand` per painted tile with a
Potato-rejecting mask). The **plumbing is verified correct** (same tiles as `far`, filter live at
t = 0, command ordering safe in both orders) — it is the claims around it that fail:
- **F1 — the missing test is the ORCHESTRATOR'S fault, not the author's.** WP-4b *did* ship a test
  (`EnqueueFilteredFar_RejectsPotato_AcceptsTerminalGood`), run and passing 7/7. While backing out
  unrelated orchestrator edits, `git checkout --` on
  `tests/Perilune.Tests/StockpileHarnessTests.cs` reverted the WP-4b test along with them; the
  reviewer then correctly found no test. **Original text preserved at
  `scratchpad/mine-StockpileHarnessTests.cs`** (it also carries superseded orchestrator edits —
  take only the test method, and prefer the stronger test the reviewer specified). The absence
  bites: mutating `far: true` → `false` **and** deleting the `SetStockpileFilterCommand` enqueue
  still gives 918 passed, 0 failed.
- **F2 — `RejectPotatoMask`'s stated rationale is FALSE, proven empirically.** The doc argues the
  mask exercises "the WP-2 filter + WP-4 bench-rule pair". It cannot: the bench-rule `continue`
  (`HaulJobSource.cs:129`) runs **before** the filter check (`:130`), and `benchWanted = 0x31` =
  `{Regolith, Scrap, Parts}` — exactly the kinds the mask "still accepts", whose bits are therefore
  never consulted. `Corpse` is hard-excluded upstream (`:121`) and **`MetalOre` is a dead kind no
  system ever creates**. The only live bit is `ControllerModule`. Measured: this mask and
  `MaskOf(ControllerModule)` produce a **byte-identical item world and crew state over 60k slice
  ticks** (non-vacuity guard: 601 haul crew-ticks occurred). The junk high bits are **57 bits of
  hashed state carrying zero behaviour** (folded verbatim by `StateChecksum`), which makes this
  harness's zone checksum un-comparable with any client-authored mask.
- **F3** — the reachability confound, confirmed independently (see the retraction).
- **F4/F5/F6** — the reviewer supplied exact replacement wording for every overclaiming passage in
  `StockpileHarness.cs` and `Program.cs`; a `(default …)` doc claim with no default in the
  signature; and stale `<bench|far>` / "Two modes" / "accept-all" comments.

Its 3-day measurement completed (`occupancy --ship slice --days 3 --stockpile filtered-far
--stockpile-n 4`, 2'592'000 ticks in **7694.6 s**; full output at
`scratchpad/MEASUREMENT-filtered-far-3day.txt`) and is recorded here **only as a record of what was
run, not as evidence for anything** — it measures the sealed room:

> **⚠️ THE WHOLE TABLE BELOW IS SUPERSEDED, 2026-07-25.** Every cell measures a sealed compartment,
> and every one of these legs was re-run on a tree with a reachability gate and with WP-7's livelock
> fix. **The replacement table is in the top section of this file and in `MECHANICS.md` §13.18.** The
> numbers are kept here only so a reader who meets a `6`, a `2`, a `9`, a "~49 % HaulPickup" or a
> "50.000 % PASS" elsewhere can find them and learn that they are void. **After the re-measure, all
> four of these legs read throughput 31** — the baseline value — because the metric is matter-bound
> and cannot move. The 7694.6 s wall clock is itself the tell: post-gate, a 3-day leg runs in ~72 s.

| | baseline | `far` pre-rule | `far` post-WP-4 | `filtered-far` |
|---|---|---|---|---|
| throughput (end `ControllerModule`) | **31** | ~~6~~ VOID | ~~2~~ VOID | ~~9~~ VOID |
| HaulPickup | 0.00 % | ~~49.233 %~~ VOID | ~~~49 %~~ VOID | ~~47.371 %~~ VOID |
| HaulDeliver | 0.00 % | ~~0.017 %~~ VOID | — | ~~0.003 %~~ VOID |
| on-job travel | — | ~~0.2 %~~ VOID | — | ~~0.3 %~~ VOID |
| A1 (h24) | 24.979 % FAIL | ~~50.000 %~~ VOID | — | ~~50.000 %~~ VOID |

End state: `debris tiles left 0`, `stockpile tiles zoned 4`, ground stock `Regolith=38 Corpse=1
Potato=723 Scrap=12 Parts=1 ControllerModule=9`, crew 8/8; busy pinned at **exactly 50.0 %** h8–h72
(a 4-of-8-crew plateau). **A1's 50 % "PASS" is the trap, for the third time in this lane** — crew
are busy claiming and abandoning haul jobs, not producing. The honest reading of the whole table is
that `HaulPickup ~47 %` against `HaulDeliver ~0.00 %` with on-job travel `~0.3 %` is the livelock's
signature, present in the accept-all `far` leg too. *(The A1 trap then recurred a **fourth** time
after the re-measure, on real numbers: `filtered-far 40` "PASSES" at 25.219 % with throughput 31,
identical to the FAILING baseline.)*

**WP-5** `1e52b0e` (**PASS**) — the filter UI, the only surface through which a player can reach
`SetStockpileFilterCommand`: a client kind-palette, a `filter` wire message, a TUI filter arg. No
glyph or golden move.

**WP-6** `35bacc9` (**PASS**) — an accept-all filter stores **no** registry entry, so the haul fast
path stays reachable. **Integrator note: the cross-derivation contiguity assertion in this package
is a BRIDGE — delete it (do not maintain it) once WP-5's sites consume
`StockZoneSystem.AcceptAllMask`.**

### WP-7 `5b72e04` — the engine fix for the livelock (PASS), and its caveat

An unreachable stockpile tile no longer livelocks the haul board. Design: a per-tile `_tileRetryAt`
backoff — **transient scratch, never saved and never hashed, which is what keeps it pin-neutral** —
written only in `TryPathToFreeStockpile`, honoured at all three read sites. Plus `_backoffWakeAt`,
which the suggested design **lacked**: a tile backoff acts through `Rescan`'s gate and `Rescan` only
runs on `JobsDirty`, so without a wake-up a zone that went quiet while backed off would be
**permanently dead**. That costs ~0.3 % of crew-ticks (a re-probe every 5 s) versus the no-wake
variant — a deliberate, documented liveness-vs-cost trade. It reuses `UnreachableRetryTicks = 50`.

Measured (30,000 slice ticks):

| leg | pickup starts | deliveries | share | wall |
|---|---|---|---|---|
| observatory ×3 (unreachable) **before** | 72,928 | 0 | 31.191 % | 51,210 ms |
| observatory ×3 **after** | **918** | 0 | **2.254 %** | ~1,262 ms |
| far reachable `(60,1,1)` before → after | 2 → 2 | 2 → 2 | unchanged | — |
| `bench` 4 before → after | 10 → 10 | 9 → 9 | unchanged | — |

(The `918 / 2.254 %` figure is the **final** design; an earlier variant measured `915 / 1.884 %`.
The difference was traded for "a deconstruct re-opens a zone immediately" — see the escape hatch.)

Two must-fixes it addressed: **`HaulJobSource`'s `foreach` over a `Dictionary` violated
`IJobSource`'s rule 4** ("use `Dictionary`/`HashSet` for LOOKUP ONLY and never iterate them — that
is a determinism rule"); it was the only collection iteration in `sim/Sim.Core/Jobs/`, safe today
only because `Int3.GetHashCode` is arithmetic and `Dictionary` layout is a pure function of the
insert/remove sequence — both true, neither promised. Fix taken: don't iterate — `Clear()` on a
`Tiles`-dirty rescan plus per-tile `Remove` driven by the ordered `_stockpiles` list, with expiry
moved entirely into `IsPathworthy` and pinned by a new test. And **no zero-alloc test**, against a
`CLAUDE.md` hard invariant, when WP-4 *in this same lane* shipped one; now measured and pinned at
0 bytes / 3000 ticks with a live hauler and preconditions sampled *inside* the window. 10 named
mutations, 5 sole-guarded. The reviewer also **disproved its own proposed simplification**: gating
the wake on `!anyFreeStockpile` reintroduces the dead-zone bug on a filtered board.

**⚠️ Honest limit — WP-7's fix DEGRADES WITH TERRAIN CHURN** (measured by the reviewer; this
belongs in any future debugging of "my late-game ship started livelocking again"):

| terrain churn | pickup starts / 30k | share |
|---|---|---|
| untouched slice (10 `Tiles`-dirty ticks per 30,000) | 918 | 2.254 % |
| `Tiles` dirty **every** tick (adversarial) | 67,742 | **28.873 %** |
| no fix at all | 72,928 | 31.191 % |

Up to **93 % defeat under continuous churn**, because every `Tiles`-dirty rescan discards every
stamp. It degrades *gracefully* (never worse than pre-WP-7, never incorrect, only wasted crew
time), which is why it was judged non-blocking. Calibration: 10 `Tiles`-dirty ticks cost +0.37 pp.
**Escape hatch if it ever bites: drop the `Tiles` clear and rely on expiry alone** — that is the
measured 1.884 % variant, costing only ≤ 5 s of re-open latency after a deconstruct.

**Known, inherited, and verified by nobody:** `_tileRetryAt`/`_backoffWakeAt` are transient, so a
reloaded game starts with an empty map where a live one would have entries, and can diverge by up
to one re-probe cycle. **This is identical in kind to the pre-existing `_retryAt`** in
Haul/Dig/Deconstruct — **not introduced by WP-7** — and no test in the suite would catch either.
Nobody has checked it.

**WP-7's own recommendation, which the orchestrator endorses:** the engine fix makes the bug
*cheap* but not *legible*. A player who paints a zone into a sealed room now sees a normal-looking
zone that simply never fills, with no explanation anywhere — arguably a worse play experience than
the livelock, which at least showed visible activity. The data is already free
(`BackedOffStockpileTiles` is one line from being enumerable) and would ride the existing view-only
wire channel beside `designs`/`materials`, plus a MOSS "UNREACHABLE ZONE" fault row. Projection-
pure, pin-neutral, composes with WP-5's tile-decoration layer.

### The four pins — byte-identical on every branch so far, and must stay so at integration

> **⚠️ CORRECTED 2026-07-25 — there are FIVE pins, not four, and only three of these four were ever
> gate-enforced.** The defs value `5a471d12643b64f9` was asserted **nowhere** in the repo (grep across
> `ci.sh`, `tests/`, `sim/`, `hosts/`, `content/`), so every "all four pins hold" claim on this lane —
> the orchestrator's and the agents' — rested on a **printed** value for that one. Both defs
> checksums are now asserted by name (`DefsChecksumTests.cs:69` and `:146`), the rules-inclusive
> `3f23ce5bd40283c8` for the first time ever. Found by the economy-modularity audit
> (`docs/design/perilune-economy-modularity.md` §0.2).

- scenario `00e0a2dadb8e5076`
- tick-3000 `4be2e77864fb7409`
- slice `1f8f2225ee568de9`
- defs `5a471d12643b64f9` — this is **`SimDefs.Default.Checksum`**, and it is **NOT** the scenario
  host's rules-inclusive `defs:` print, which is `3f23ce5bd40283c8`. **These are different things
  and have been confused before** (the `3f23ce5b` value appears at the top of every occupancy
  run's output; do not paste it into a pin).
- **(added 2026-07-25)** defs rules-inclusive `3f23ce5bd40283c8` — the host's `defs:` print, now a
  pin in its own right rather than a value to be warned about.

E0-4 is inert without player intent, exactly like E0-5 — no authored ship zones a stockpile — and
**no def scalar was added**, so the defs checksum is not expected to move at all.

### Merge order, and the one conflict to expect

> **⚠️ DONE 2026-07-25.** Merged in the order below plus a `wp67-merge-fix` package. **Exactly ONE
> conflict occurred in the whole integration** — `docs/HANDOVER.md`, E0-5 block, resolved by taking
> `main`'s wording, as predicted. The `StockpileHarnessTests.cs` conflict predicted below **did not
> occur**. What *did* happen was not a conflict at all: **three tests that passed on every branch
> failed once the packages met** (WP-6's accept-all-stores-no-entry against WP-7's and WP-5's fixtures
> asserting an entry exists). All three were stale tests; merged behaviour was correct. **Lesson:
> per-branch review plus a clean `git merge-tree` does not imply a green merged lane.**

`lane/e0-4-wp3-rigor` (`42e5b27`) → `lane/e0-4-wp5-filter-ui` (`1e52b0e`) →
`lane/e0-4-wp6-mask-collapse` (`35bacc9`) → `lane/e0-4-wp7-unreachable-backoff` (`5b72e04`) →
the WP-4b redo. Then `./ci.sh` on the lane, then `--no-ff` to `main` and re-gate.

Expect **one** small end-of-file conflict in `tests/Perilune.Tests/StockpileHarnessTests.cs` —
WP-4b appends a `filtered-far` test at the end of the class and the WP-3 rigor fix edits the
earlier tests and may append helpers there too; both branch from the same lane HEAD. **Resolve by
keeping BOTH** (independent additions); the WP-3-rigor reviewer verified this merges clean with
`git merge-tree`.

### What REMAINS before E0-4 can close, in order

> **⚠️ ALL FIVE ITEMS BELOW ARE DONE (2026-07-25), one of them differently than written.** Item 1's
> re-measurement produced the **retraction at the top of this file**, and its *first* conclusion
> ("throughput flat across all zone configurations ⇒ no regression") was **sent back** — the metric is
> matter-bound and had no power. Item 4's downstream rewrite is the top section plus `ECONOMY.md` §8's
> correction box plus `MECHANICS.md` §13.17/§13.18. Item 5's `MECHANICS §13` entries are §13.17. The
> `O(items × tiles²)` exponent note is **still owed as a code-comment fix** (`hosts/tui/GameLoop.cs:56-60`,
> `client/src/ui/stock-filter-model.js:38-45`) and is **now wrong in a second way** — WP-6 made an
> accept-all mask store no entry, so the `filtered` fast path is *not* permanently armed either.

1. **WP-4b redo** — it is SEND-BACK; do not commit the working-tree version as-is. In order:
   (a) add a **reachability gate** to `StockpileHarness.SelectStockpile` — a tile no crew can
   `FindPath` to is not a legal measurement tile; (b) **re-measure the WHOLE `far` column** — the
   `6` and the `2` are as confounded as the `9`, and WP-7 makes all of them stale by construction
   anyway (that mode zones the observatory tiles). 3-day legs take ~45 min – 2 h each; **run them
   serially and do not build in that worktree while one runs**; (c) rewrite the comments to what
   the re-measured numbers actually say (the reviewer supplied exact replacement wording, F4 a–e);
   (d) **restore and strengthen the test** (see F1 — text at
   `scratchpad/mine-StockpileHarnessTests.cs`; take only the test method).
   **Sequencing decision (orchestrator): re-measure AFTER WP-7 lands**, since WP-7 changes haul
   behaviour and a re-measurement taken before it would be obsolete immediately.
2. **Merge in the order above**, resolving the one expected conflict.
3. **Re-measure the gate counts on the merged lane.** Every per-branch count in the table above was
   measured in isolation on top of the lane base; **they do NOT add.**
4. **Rewrite the downstream record.** This is the largest remaining piece and it is a
   **retraction**: `ECONOMY.md` §8's framing, `MECHANICS §13`'s missing livelock entry, and this
   section's own `far` column. Also owed, unchanged from before: the WP-5 cost disclosure
   **understates an exponent** — three passages (the WP-5 commit message,
   `stock-filter-model.js`'s `defaultStockFilter`, and `GameLoop.cs`) say
   `O(items × stockpile-tiles)` where the true cost is `O(items × stockpile-tiles²)`, because
   `AnyFreeStockpileAccepts` loops S tiles and each `IsFreeStockpileTile` calls `TryGetFilter`,
   itself a linear scan of S entries. The mechanism is described correctly and the `file:line`
   citation is right; only the exponent is wrong — and **WP-6 removes the problem**, so those
   passages need rewriting once it lands regardless.
5. **`MECHANICS.md` §13 entries owed** (from WP-5, deliberately outside its file set, plus
   carry-overs): a filtered stockpile tile has **no visual indicator anywhere** — filtered and
   unfiltered tiles are indistinguishable, and an honest indicator needs a new wire channel (its
   own package); a stored all-accept entry will **not** auto-accept a future `ItemKind` 7 (WP-6 may
   make this moot — re-check after it lands); the TUI filter is a **two-key pending mask** (`i`
   cycles kind, `I` toggles), not a per-tile editor; a chip toggle affects only **future** paints,
   so an existing zone is unchanged until repainted with nothing to say so; the stockpile verb
   lives in `.app`, which `body.overview-open` hides, so on any ship with a populated `decks` grid
   the verb is reachable only in the legacy tile view (pre-existing); and a mis-placed stack on a
   filter-rejecting tile is **not** re-hauled off it (inherited from the "already stored" guard —
   carried from WP-2's review).

### Two open decisions for Garvin — neither taken unilaterally

> **⚠️ RESOLVED 2026-07-25.** (1) **WP-7 landed inside E0-4** — the merge order was taken as written.
> (2) **The player-facing unreachable-zone indicator was NOT taken** and is recorded as the first E0-6
> item; the decision was to stop growing this lane. It matters: see `MECHANICS.md` §13.17-(1) — the
> engine fix made the bug cheap but **invisible**, so a zone painted into a sealed room now silently
> never fills.

1. **WP-7 is an orchestrator scope expansion.** E0-4 was chartered as filtered stockpile zones;
   WP-7 is a sim-level haul-dispatch fix for a **pre-existing** bug the lane merely tripped over.
   It is **PASS and separable** — it lives entirely on its own branch and can be held back, landed
   in E0-4, or promoted to its own lane. It is included in the merge order above on the
   orchestrator's judgement only.
2. **The player-facing unreachable-zone indicator** (WP-7's recommendation, above) — recommended,
   and the argument that it belongs in **E0-4** is that this lane ships player-authored zones and
   this is the first way a player can author one that silently does nothing. **Sequence it after
   WP-5.** Not started.

### Non-blocking notes carried forward

- N4: `client/src/wire/session.js` imports from `ui/` — inverts layering, no cycle today.
- N8: two adapted `paletteOrders` tests carry no named mutation (grandfathered from E0-3).
- The WP-5 two-row console layout is verified at **one viewport (1600×1000)** only; `styles.css`
  has `@media` rules at ~1360/1180 px that were not exercised. Judged non-blocking by review
  (`.console-menu{overflow:hidden}` clips rather than spills).
- **Repo-wide methodology trap, learned the expensive way in WP-7:** a mutation harness using
  `shutil.copy2` **preserves mtime** — restoring a mutated source made it look older than `bin/`,
  MSBuild skipped the rebuild, and the next `dotnet test` silently ran the PREVIOUS mutation's
  assembly. It presented as a reproducible 3-test regression that passed when each test was run
  individually. Fixed with `shutil.copy` + `os.utime` and everything re-run from a deleted
  `bin/`+`obj/`. **Any agent using a copy-restore mutation harness needs the same fix.**
- This lane has now produced **six** tests that did not bite what they claimed to (five found by
  reviewers, one found by WP-7's implementer against its own work). Independent review is earning
  its keep here more than in any prior lane. *(⚠️ **2026-07-25** — and the count kept rising through
  integration. The recurring shape got a name and a countermeasure: **a guard that matches raw source
  text is satisfied by the thing it guards against, commented out.** See `CLAUDE.md`, "Traps that have
  each cost this project real work".)*

**Open items flagged in the plan** (§8 hazards, §12 out-of-scope): the far-regression reproduction
(hazard 8.1) — ~~**still open, and now known never to have been performed**~~ **⚠️ CLOSED
2026-07-25 as NOT SETTLEABLE ON THE SLICE** (not as "not reproducible", and emphatically not as
"disproved"): it *was* performed — reachability gate, re-measured `far` column, `--strip 40`
headroom, and a measurement-only revert of the bench rule — and the answer is that **end-of-run
throughput on this ship is matter-bound, so the metric has no power to detect the regression it was
aimed at.** §8's *mechanism* is separately confirmed and its *magnitude* is unreached (worst travel
9.3 % against 75.7 %). **Reopening this needs a labour-bound ship, not another run**; the
64-`ItemKind` mask ceiling (flagged, not fixed); no stack merging / priorities / containers (later
E-STOCK packages); no `stock.def` (deferred until a real tunable exists).

**Reminder: still do not zone stockpiles in any authored ship.** The reason has changed — it is
not the unmeasured −14 %; ~~it is that until WP-7 lands, an unreachable zoned tile livelocks the haul
board.~~

> **⚠️ CORRECTED 2026-07-25 — the advice stands, and the reason has changed a THIRD time.** WP-7 has
> landed, so an unreachable zoned tile no longer livelocks the board. **The reason now is that a zone
> is the player's decision**: authoring one deletes that decision, and it would move the pins on a
> lane that currently moves none. The **throughput** reason was never valid and is retracted, and the
> **livelock** reason is now fixed. What did *not* go away is `MECHANICS.md` §13.17-(1) — a zone
> painted where no crew can reach now fills **never, and silently**.
>
> **⇒ THE SURVIVING REASON IS A DESIGN DECISION, NOT A MEASUREMENT. Do not go hunting for the number
> behind it — there isn't one, and there does not need to be.** That is *why* it is the durable
> reason: the two dead reasons were **empirical** and both evaporated (one was never valid, one got
> fixed), whereas a design reason can only be changed **by decision**. It is also not post-hoc — the
> lane plan gave it independently at
> `docs/design/perilune-e0-4-stockpile-zones.plan.md:82-86`, before this retraction existed.

## E0-5 — deconstruct/strip: LANDED on `main` (2026-07-23), before E0-4, START HERE

**Taken before E0-4 by Garvin's decision** (the "E0-5 before E0-4" case below). Six commits on
`lane/e0-5-deconstruct`, four work packages, each Opus-implemented + **independently Opus-reviewed
PASS**. Plan: `docs/design/perilune-e0-5-deconstruct.plan.md`. **`./ci.sh` exit 0, twins match,
894 dotnet + 485 node.**

**What landed — deconstruct is now a first-class verb mirroring `BuildSystem`:**
- **`DeconstructSystem`** (`'STRP'`, passive `ISimSystem + IStatefulSystem`, no-op `Tick` except a
  narrow `Reap` of vanished sites) + **`DeconstructJobSource`** + **`JobKind.Deconstruct = 11`** +
  **`DesignateDeconstructCommand`** (three-arg: pos + kind + explicit on-flag; sim resolves the
  device id). Registered right after `BuildSystem` in `SystemStack`; `DefaultSources` appends it last.
- **Walls → `Regolith`** = `floor(wall_material × wall_recovery)` (1 at shipped 2×0.5). **Devices →
  `Parts`** = `floor(device_parts × Condition)` — **`Condition`'s second consumer** (every other
  reader was display-only). Yield is `Regolith` **not `Scrap`**, deliberately diverging from
  `ECONOMY.md` §5's diagram: the shipped recycler *consumes* Regolith to make Scrap, so a Scrap yield
  would skip a hop and make stripping strictly better than digging. Revisit at E0-6.
- **`IsPressureHull` guardrail** — a wall adjacent to void or the map edge is never strippable (the
  canvas edge, VISION). **Honest limit:** in-plane 4-neighbour only, no z-term; and the slice is
  carved from solid mass (no `Void` tile), so on it the predicate reduces to the map-edge ring
  (328/1705 walls) — a *canvas-edge* guard, not yet a *vacuum* guard. The `CanDesignate` hull check
  is the real guardrail; `DeconstructSystemTests` pins it.
- **Consequences all wired, none faked:** stripping an interior bulkhead merges rooms + equalises gas
  for free (`Rooms.MarkDirty()` → `AtmosphereSystem`; measured on the real slice: two rooms at 101.35
  and 0.00 kPa → merged at 76.84 kPa). Device strip un-registers its MOSS adapter (a *feature* — break
  your own automation) and writes a **`DeconstructCompletedEvent`** to the Chronicle
  (`HistoryKind.DeconstructCompleted = 10`).
- **The `strip` verb across all five surfaces** (web/TUI/client), key **V** (`X`/`S`/`D` were taken),
  and **`GlyphColor.Deconstruct` appended** (index 26 — append-only; no golden moved because no
  authored ship designates).

**The place→strip matter faucet — found by review, closed in-lane.** WP-2's reviewer measured that
`PlaceDeviceCommand` charged nothing while a stripped device yielded 2 Parts: place→strip→repeat minted
**1 Part / 476 ticks with zero matter** (vs 15,000 ticks + 1 Regolith through the legit ladder) into
the one never-ending sink. WP-3 charges **`device_place_cost` Parts** to place (all-or-nothing, refuses
when unaffordable, a refusal is a bit-for-bit no-op) — charging *the currency it refunds* closes the
labour exploit a Regolith cost would leave open. Round trip is strictly lossy: **66.7 %** recovery at
pristine, inside `ECONOMY.md` §9.6's 50–70 % band.

**Measured — the number the lane exists to produce** (`occupancy --ship slice --days 3`, a new opt-in
`--strip N` harness that designates N *reachable* interior walls at t=0):

| | h29–h72 mean work | A1 (h24) | end `ControllerModule` |
|---|---|---|---|
| baseline (no strip) | **1.480 %** | 24.979 % **FAIL** | 31 |
| `--strip 40` | **13.198 %** | **37.424 % PASS** | 50 |

Deconstruct lifts the post-cliff floor **9×** and flips A1. Matter conserves: 40 walls → 40 Regolith →
idle crew craft it up the ladder to **+19 `ControllerModule`** (nothing minted or destroyed; no
leftover Regolith/Scrap/Parts). **Inert without player intent** — the verb-less occupancy path and all
four pins are byte-identical to baseline; *any* movement there would be a bug.

**⚠️ Two record corrections this lane forced:**
1. The A1/§13.15 claim "0.0 % from h29 onward, forever" **overstates it** — the floor is **1.480 %**,
   not zero. `MachineWearSystem` is the one demand source that survives the cliff (wear is a rate, and
   the overhaul consumes `Parts` without feedstock): spikes at h45/h46/h62/h68. §13.15 is corrected.
2. The handover's own E0-5 guardrail ("re-run occupancy, check the flatline lifts") was
   **unsatisfiable as written** — deconstruct is player-designated and no authored ship designates
   anything, so the lane had to ship its own `--strip N` measurement surface to make the check
   meaningful. Inert-without-the-flag is now an assertion, not a hope.

**Deferred (E0-6, all recorded in `MECHANICS §13`):** furniture costs machine `Parts` to place — a
placeholder until furniture gets its own strip currency; placement material **teleports** (no haul, no
distance — a real staged-haul placement is `BuildSystem`'s shape); MOSS *write-only* scripts against a
stripped device fail **silently** (only reads break legibly); the `Scrap`-yield deconstruct of the
diagram; and a hull *stress* model. `Conduit`/`Pipe` are un-strippable (a consequence of
`IsUtilityOverlay` keeping them off the device grid, not a designed rule).

**Next: E0-4** (filtered stockpile zones). E0-5 created the haul traffic that makes E0-4's "don't haul
what a bench wants" rule measurable — but **do not zone stockpiles in any authored ship until E0-4
lands**, to keep the ~~measured −14 % wrong-deck throughput regression~~ latent. E0-5's own guardrail held:
no authored ship designates a strip.

> **⚠️ RETRACTED, 2026-07-25 — this paragraph is kept as history, not as guidance.** The "measured
> −14 % wrong-deck throughput regression" is `ECONOMY.md` §8's figure, and E0-4 **never reproduced
> it** — the runs that appeared to were zoning a sealed compartment (see the E0-4 section at the top
> of this file). The advice "do not zone stockpiles in any authored ship" still stands, but the
> operative reason is now the **unreachable-tile haul livelock**, not an unmeasured throughput cost.
>
> **⚠️ AMENDED LATER THE SAME DAY, once E0-4 landed.** The livelock reason is now **also** gone —
> WP-7 fixed it. **The advice still stands; only its justification keeps evaporating**, which is
> itself worth noticing. The operative reason is now simply that **a zone is the player's decision**
> (authoring one deletes it, and would move pins this lane does not move) — **a DESIGN DECISION, not a
> measurement, which is exactly why it is the one that survived**: measurements evaporate, decisions
> only change by decision. E0-4 did **not** disprove
> §8's −14 %: it showed the slice **cannot settle it**, because throughput there is matter-bound.
> And what replaced the livelock is quieter, not gone — an unreachable zone now fills **never, and
> silently** (`MECHANICS.md` §13.17-(1)).

## A1 MEASURED — the economy is finite and TERMINATES at sim-hour 28 (2026-07-23), START HERE

**`ECONOMY-PLAN.md` §E0's goal is a number nobody had ever checked.** Measured now, after E0-1/2/3:

```
dotnet run --project hosts/scenario -- occupancy --ship slice --days 3
```

**A1 (≥ 25 % busy at sim-hour 24) = 24.979 % — FAIL by 0.02 points.** The pass/fail is the least
interesting part. Full detail in **`docs/MECHANICS.md` §13.15**, which supersedes §13.6's
`None 99.92 %` table.

**E0-1/E0-2 worked.** `None` fell **99.92 % → 85.28 %** over 3 sim-days; busy went 0.08 % → 14.72 %.
The labour pool really did open up.

**But the problem has moved, and the new one is worse.** The busy curve by sim-hour:

`80 % → 75 % → 37.5 % (h3–18) → 25 % (h19–27) → 12.5 % (h28) → 0.0 % from h29 onward, forever.`

The plateaus are exact crew fractions (3/8, then 2/8) — a couple of crew on long crafting bills,
not a busy ship. End-of-run state says why:

- **`debris tiles left: 0`** — the authored 48-tile field is dug out by ~h2, and **nothing
  regenerates debris**, so `JobKind.Dig` can never be assigned on that ship again.
- **`stockpile tiles zoned: 0`** — haul stays structurally unreachable unless the player zones one.
- **`ground stock: Potato=699, ControllerModule=31`** — no `Regolith`/`Scrap`/`Parts` left. The ship
  spent its **entire finite matter budget** manufacturing `ControllerModule`, which **nothing in the
  repo consumes** (sole producer `MachineShop: Parts 2 → ControllerModule 1`, `SimDefs.cs:606`).
  That is `ECONOMY.md`'s A6 dead-`ItemKind`, confirmed by measurement.

**Not slice-specific:** `--ship grid` dies sooner — A1 at hour 24 = **0.000 %**.

**The binding constraint is now MATTER, not LABOUR.** This reframes the rest of E0:

- **E0-5** (deconstruct — a real one-way matter source), **E0-7** (ice → water — a recurring haul
  source) and **E0-6** (conversion loss, and the one thing that gives `ControllerModule` a consumer)
  are the lanes that actually extend the runway. Consider pulling one forward.
- **E0-4** (filtered stockpile zones) moves haul off 0.00 % but **adds no matter**, so it does not
  extend the 28-hour runway. Still worth doing — just don't expect A1 to move much.
- **Tuning `wander_radius_tiles` is premature** while the constraint is matter, not labour.

The harness is a new `occupancy` verb on the scenario host (`--ship perilune|slice|grid`,
`--days`, `--seed`). The CI-pinned verb-less default path is untouched. It reports the occupancy
table, an hourly busy curve (the shape matters — a decaying spike and a flat line average the
same and mean opposite things), the A1 headline, and an end-of-run "why did work run out"
diagnostic. Busy is reported two ways on purpose: **any** (incl. eat/drink/flee) and **work**
(productive only) — a crew 25 % busy eating has not met A1's intent.

---

## RECOMMENDED NEXT: E0-5 before E0-4 — the case, and the counter-case

**This argues against `ECONOMY-PLAN.md`'s written order.** The plan lists E0-4 (filtered
stockpile zones) next; the A1 measurement above is the reason to reconsider. **The plan has not
been edited** — it remains the authority until Garvin decides. Read both sides and pick.

### The case FOR E0-5 (deconstruct/strip) first

1. **The measurement says matter binds, not labour — and E0-4 adds no matter.** Every ship
   converts its finite starting matter into `ControllerModule` and then idles forever. E0-4
   reorganises haul traffic; it creates nothing to haul. It cannot move the h28 cliff.
2. **The cliff is a dead game, not a balance problem.** After sim-hour 28 there is *no player
   action* that creates work — dig is impossible (no debris regenerates), craft is out of
   feedstock, build has no material. E0-5 is the **only lane in E0** that lets a player create
   matter from what is already aboard, without new content or nav work.
3. **It is the decision the whole design is built around.** `ECONOMY.md` names it twice as the
   signature moment: *"Deconstruct the gym for its 70 % — a real, slightly shameful decision"*
   (§546) and *"I tore down the gym for the metal — deconstruct-as-verb is felt"* (§948). §2's
   thesis sentence is a deconstruct decision. Shipping it turns a dead ship into a dilemma.
4. **It refills the loop that just starved.** 50 % wall recovery + `Parts × condition` feeds
   `Scrap → Parts`, which is precisely the feedstock crafting exhausted by h28.
5. **Plan-stated bonus:** it gives `Condition` its second consumer, and it is the mechanism the
   two-tier debris design note (`docs/design/perilune-debris-and-skills.md`) depends on.

### The case AGAINST — take this seriously, it is measured

1. **`ECONOMY.md` §593-597 warns, from measurement, that stockpiles are not automatically good.**
   A zone on the wrong deck sends on-job travel to ~~**75.7 %**~~ and drops throughput ~~**14 %**~~,
   because *crafting outputs spawn unreserved, so the haul board drags them to the stockpile and the
   downstream station's fetcher walks them back*. **"A zone system without a 'don't haul what a
   bench wants' rule is a throughput regression."** That rule is E0-4's payload. E0-5 produces
   `Scrap` that wants hauling ⇒ doing it first pours traffic into exactly the unfiltered system
   the measurement condemns.
   **⚠️ CORRECTED 2026-07-25 (E0-4).** The two struck figures are **not reproduced** — worst on-job
   travel observed anywhere is **9.3 %**, and no zone placement moved throughput in any
   configuration — and the quoted third sentence is **unsupported** by the only experiment that
   speaks to it. **But this is NOT a refutation:** the slice's throughput metric is matter-bound and
   **cannot settle** §8 (`MECHANICS.md` §13.18). The *mechanism* in italics above is the part that
   held up — it is now positively observed, and it is placement-dependent. **The sequencing decision
   this bullet supported was still the right one**, for the reason in the recommendation below, not
   for these numbers.
2. **`'ZONE'` is already registered and waiting** (W0-6), and E0-4 establishes the storage design
   (a registry + its own save chapter, keyed by packed position) that later lanes build on.
3. **E0-3 shipped stockpile on `TileFlags.Stockpile` (bit 4); E0-4 migrates it off.** Every lane
   in between is more migration surface — though in practice little should accrete on it.

### Recommendation: E0-5 first, then E0-4 immediately, as a PAIR

The regression risk in (1) is real but currently **latent**: authored ships zone **0 stockpile
tiles**, so it only bites when a player opts in. And weigh the magnitudes honestly — a ~~−14 %
throughput hit~~ on an economy that **stops entirely after 28 hours** is a rounding error against
the stopping. Fix the cliff, then optimise the traffic into it.

> **⚠️ 2026-07-25 — this paragraph reasoned correctly from a number that turned out to be
> unmeasured, and it got the right answer for a better reason than it knew.** "A rounding error
> against the stopping" understates it: the 28-hour stop is not merely larger than the haul cost, it
> **saturates the very metric** the haul cost would have to move. E0-4 measured `far 40`'s whole haul
> cost at **1.6 crew-hours against ~352 crew-hours of post-cliff idle** — ~200× too small to cost one
> `ControllerModule`. That is exactly why the slice cannot settle §8, and why "fix the cliff first"
> was right.

There is also a positive reason to take them in this order rather than merely a tolerable one:
**E0-5 creates the haul traffic that makes E0-4 measurable at all.** Tuning a filtered-zone system
today would be tuning against zero traffic — E0-4's own acceptance ("don't haul what a bench
wants") cannot be demonstrated until something is actually being hauled.

**Guardrails if you take E0-5 first:**
- **Do not zone stockpiles in any authored ship** until E0-4 lands — ~~keep the regression latent~~.
  **⚠️ 2026-07-25: the ADVICE STANDS, the JUSTIFICATION IS VOID.** There is no measured regression to
  keep latent; §8's −14 % was never reproduced and the slice cannot settle it. The reason to keep
  authored ships zone-free is that **a zone is the player's decision** and authoring one would both
  delete that decision and move pins — **a design decision, not a measurement; there is no number
  behind it to look for.** See the E0-4 section at the top of this file.
- **Re-run `occupancy` immediately after E0-5** (`--ship slice --days 3`) and check whether the
  h29+ flatline actually lifts. If deconstruct yield is too small to matter, that is a tuning
  finding worth having before E0-4, not after.
- Keep E0-5's guardrail from the plan: **never the pressure hull.**

**If you disagree and take E0-4 as written, that is defensible** — just expect A1 to stay ~25 %
and the h28 cliff to remain, and don't read that as E0-4 failing.

---

## E0-3 — player verbs (dig + stockpile) + order precedence: LANDED on `main` (2026-07-23)

**Three commits on `lane/e0-3-verbs`.** Plan: `docs/design/perilune-e0-3-verbs.plan.md`.
**Gate: `./ci.sh` exit 0, 846 dotnet + 483 node green, and NO pin moved** — scenario
`85ac8c44233284e9` (twins match), tick-3000 `9b834cffc232ce7f`, slice `8c6b2544fac36d63`, defs
`e56d33a2e46b5644`, all held. Projection is pure, and the one new hash-fold bit contributes 0 on
every pinned ship (no crew carries an order in flight), so the citizen flag word stays bit-identical.

**Surface decision (Garvin): the LEGACY CONSOLE, not the AAA Overview.** Surveyed before briefing,
as E0-2's handover asked. The Overview is `SlotGrid`-driven and the code says so itself —
`GameSession.cs:1150` *"Empty on ships with no slot grid (Perilune/PeriluneSlice)"*,
`overview-view.js:15` *"an empty `decks` (e.g. --ship slice) never shows the [Overview]"*. The ship
carrying the debris, the 8 crew and the `ClearAllDebris` goal is **`--ship slice`**, which plays on
the legacy console canvas; `--ship grid` has the modern face but nothing to dig. `overview-model.js:51`
also states the rule *"BUILDING IS ZOOM-ONLY … there is NO 'build' action here"* — the Overview is a
schematic on purpose. **An Overview ORDERS layer is a live follow-up**, and it needs three things
this lane did not do: debris authored into the grid ship, a designation wire channel (the frame's
raw `GlyphColor` bytes only serve the legacy canvas), and a decision to break the schematic rule.

**`strip` was NOT in scope** — no `JobKind.Strip` or deconstruct system exists and **E0-5** already
owns that brief (50 % wall recovery, `Parts × condition`, never the pressure hull).

**What landed:**
1. **The two verbs** — `dig` / `stockpile` in the web parser → the existing `DesignateDigCommand` /
   `DesignateStockpileCommand`. The `on` flag is EXPLICIT rather than a host-side read of world
   state, so a sweep is idempotent and the host never races the sim. ⛏ DIG / ▤ STOCKPILE palette
   buttons, keys **G** and **Z** (`Z` not `H` — lowercase `h` is already vim cursor-left, so that
   binding would have been silently dead). `GlyphColor.Designate` (15) and `.Stockpile` (16) get
   their FIRST emitter in `GlyphMapper.Project`; the client palette has carried both colours since
   it was written, so **no wire-format, enum or palette change was needed**.
2. **Order precedence** (the E0-1 revisit) — hashed `Citizen.OrderedMove` (CITZ v6→v7, folded as
   flag-word bit 4) + `IsRecruitableForWork` = `IsIdleForWork && !(OrderedMove && HasPath)`, guarding
   the three WORK recruiters. `SustenanceSystem` deliberately still uses `IsIdleForWork`: **an order
   suppresses work, never survival**. The `&& HasPath` term is load-bearing — self-serve and flee
   overwrite the path wholesale, and a bare flag surviving that would strand a crew member
   permanently unrecruitable.

**⚠️ A stale measurement was corrected — read this before quoting `§13.6`.** Writing the acceptance
tests against the *real* slice showed **part of the briefed gap had already closed**. `§13.6`'s
"48 debris tiles, **0 designated**", `digTargets = 0` and "`AgreeTask` is dead code" stopped being
true at commit `5e2bd41` (2026-07-21): the slice **authors** its dig seed
(`DesignateDebrisRect(plan, 57, 6, 62, 13, z: 0)` → `ShipPlanBuilder.cs:63`). Re-measured
(`SliceDigLoopTests`): **48 debris, 48 designated, 0 stockpile**; `AgreeTask` **legal at boot**.

| briefed as | actually |
|---|---|
| dig verb unblocks `JobKind.Dig` | already reachable via the authored seed; **E0-1** made it get worked |
| dig verb unblocks `AgreeTask` | already legal since `5e2bd41` |
| dig verb's real value | designating work the **author did not place** — the slice post-seed, and **every generated ship**, which authors none |
| stockpile verb unblocks haul | **correct — the unqualified win.** Nothing anywhere authors a stockpile, so `HaulJobSource` could never build a haul candidate in ANY shipped configuration |

`docs/MECHANICS.md` §13.6 is rewritten to match, keeping the correction visible. **The first
commit's message repeats the stale claim** — it was written before the re-measurement; the third
commit corrects the record.

**Next: E0-4** (filtered stockpile zones as a registry with its own save chapter — NEVER in
`TileFlags`, one bit left and `TILE` is exact-version-gated), then E0-5 deconstruct/strip, E0-6
conversion loss, E0-7 ice→water, E0-8 the ledger + A1. **Job occupancy has NOT been re-measured
post-E0-1/2/3** — `§13.6`'s `None 99.92 %` is pre-E0-1 and must not be quoted as current; that
measurement belongs to E0-8/A1 along with tuning `wander_radius_tiles` (still 8, untuned).

**Design note parked alongside (nothing built, does not block E0-4):**
`docs/design/perilune-debris-and-skills.md` — two-tier debris (rubble anyone can haul vs dead
machinery that must be *disassembled*) placed in the **empty hall slots** of the grid ship, plus
per-person skill trees as a **view** over E2's scalars + `Procedure` rather than a point-spending
minigame. Mostly connects things that already exist (the `Regolith→Scrap→Parts` ladder, E0-5's
`Parts × condition`, E2's yield/defect). Two live tensions recorded there: item **quality tiers**
are an existing `ECONOMY.md` non-goal (use yield %/defect instead), and a tree must not become
"RimWorld skills with extra steps". The one cheap, high-value piece is **wreck-filling some grid
slots** — it fixes the standing asymmetry that `--ship grid` has the AAA UI but zero debris while
`--ship slice` has the debris but cannot show the Overview at all.

---

## E0-2 — work-rate rebase + movement retune + crew-safety guard: LANDED on `main` (2026-07-23)

**E0-2 is on `main`** (`39702a3`, merged `--no-ff` from `lane/e0-2-work-rate`; three legible
commits `9c43f12` retunes · `accef26` guard · `bc006ef` durable Flee save/load test).
Opus-implemented + independently Opus-reviewed **PASS** (all six test mutations applied and
confirmed failing; the `JobKind.Flee` lifecycle, search determinism, and `IsBreathable`/`NeedsSystem`
agreement all verified). This is the biggest *feel* change since the slice shipped.

**What it does — two coupled parts:**
1. **L1 work-rate rebase (~10×)** + **movement retune** `ticks_per_tile` 5→10, landed TOGETHER (the
   retune alone costs 29% of production, so it lands behind E0-1, never before). Values (ECONOMY.md
   §6.1): `DigWorkTicks` 60→6000, `wall_construct_ticks` 60→2400, `door_construct_ticks` 40→1800,
   `maintenance_work_seconds` 20→900, recipes SalvageRecycler/Fabricator/MachineShop 20/30/40 →
   600/900/1800. `DigWorkTicks` stays a const with a `TODO(E-MINE/E3)` to move to `mining.def`. The
   result: a crew member does a handful of watchable, minutes-long tasks per day, not 400 two-second
   beats — directly answering playtest round-3's "I can't tell if they're really working".
2. **Crew-safety guard** (`SafetySystem`, 1 Hz after `NeedsSystem`; new `JobKind.Flee`;
   `flee_suffocation`=0.5 def field in `needs.def`). The 10× maintenance value exposed a latent gap:
   a working crew member had NO response to bad air and would stand at a machine for the full 15-min
   service and suffocate on generated ships (V6 survivability failed for all seeds; the slice/scenario
   are immune — `HoldPosition` crew self-serve in place). Now: when a working crew member's
   `Suffocation ≥ flee_suffocation` AND its tile is unbreathable (`AtmosphereSafety.IsBreathable`, the
   exact negation of `NeedsSystem`'s vacuum/hypoxia/CO2-narcosis/thermal bands), it `CancelJob`s
   (cargo dropped, reservations released) and takes `Flee`, pathing via `PathService.FindNearestBreathable`
   to the nearest breathable tile, and stays undispatchable until breathing AND recovered below
   `0.5×flee_suffocation` (rests before returning — no death-ratchet). `JobKind.Flee` (not `None`+path)
   is deliberate: the relaxed E0-1 idle gate would re-dispatch a `None` fleeing crew straight back into
   the vacuum every tick (traced deadlock). All four dispatch sites skip a `Flee` crew unchanged.

**Pins (current — supersedes wall-drag/E0-1 tables below):**

| pin | value | pre-E0-2 |
|---|---|---|
| 3-day scenario (`ci.sh`) | `85ac8c44233284e9` | `a53d8505013dc25d` (moved) |
| tick-3000 golden | `9b834cffc232ce7f` | `9b834cffc232ce7f` (HELD) |
| slice tick-3000 golden | `8c6b2544fac36d63` | `9a84a72f6ab67386` (moved) |
| defs checksum (`SimDefs.Default`) | `e56d33a2e46b5644` | `60147a57e27c5c31` (moved) |

The retunes moved scenario + slice + defs; the tick-3000 golden held (default ship's 2 crew neither
move nor work within 3000 ticks). The crew-safety guard is **inert on every pinned ship** (pinned crew
never suffocate → `JobKind` never becomes `Flee`), so it moved only the defs checksum further (the new
field). Gate on merged `main`: **`./ci.sh` exit 0, twin hashes MATCH, 828 dotnet + 476 node green.**
(Defs-checksum note: the docs track `SimDefs.Default.Checksum`; the scenario host's `defs:` print is a
different rules-inclusive fingerprint — measure the former with a `SimDefs.Default.Checksum` build, not
the host print.)

**What E0-2 left for later (`MECHANICS §13`):** crafting stations whose `WorkSeconds` changed are still
not reachable in the shipped slice; `DigWorkTicks` should migrate to `mining.def` at E-MINE (E3).

**Next: E0-3** — dig/stockpile/strip verbs on the web client (the first economy work that touches the
new AAA UI / Overview+Room-Zoom surface; review that UI before briefing). Then the rest of E0
(`ECONOMY-PLAN.md` §E0): E0-4 stockpile zones, E0-5 deconstruct, E0-6 conversion loss, E0-7 ice→water,
E0-8 the ledger (+A1 measurement). Player-control note still open from E0-1: a `MoveCitizenCommand`
order is interruptible by auto-behaviour; revisit at E0-3.

---

## Game title: **Every Soul Aboard** (decided 2026-07-23)

The game is now titled **Every Soul Aboard**. "Perilune" is retained as the internal **codename**:
the repo, the `Perilune.*` C# namespaces, and the ship MSV *Perilune* in fiction all keep it —
**no code namespaces or the repo folder are renamed** by this decision (that would be a large,
separate refactor). Documented in `docs/VISION.md` (the naming note + pitch) and `CLAUDE.md`. If a
full codename→title rename is ever wanted, it's an explicit workstream, not implied by this.

## Drifting parallax starfield (ship-motion backdrop): LANDED on `main` (2026-07-23, `8614b42`)

The Overview's 220-star backdrop now **drifts slowly right-to-left** so the ship reads as moving
forward. Client-only, cosmetic; a single lane (`lane/star-drift` @ `c64c288`), Opus-implemented.

**Why it wasn't a one-liner:** the Overview scene SVG is rebuilt via `_stage.innerHTML =` on every
repaint (each wire update), so any animation *inside* it restarts every frame and never moves. The
fix hoists the backdrop out of the per-repaint SVG into the **build-once** skeleton, where the
void+nebula washes already lived (the persistent CSS `.ov-space`/`.ov-neb` layer is byte-identical
to the old in-SVG `spaceLayer` — `--void-gradient` and the nebula colors match exactly; the SVG
copy was redundant and hid it).

- **`overview-scene.js`** — drop the redundant in-SVG `spaceLayer`/`nebula`; add exported
  `starLayerSvg()` that renders the seeded 220-star field **twice** side-by-side (x=0 and
  x=`VIEW_W`). `starfield()` stays pure + tested. The per-repaint scene body no longer draws space.
- **`overview-view.js`** — inject `starLayerSvg()` into the skeleton once, above the nebula and
  below the interactive `.ov-stage` (original z-order preserved).
- **`styles.css`** — `@keyframes plnStarDrift` translates `.ov-stars-drift` `0 → −1300px` (one full
  tile = `VIEW_W`; 1px = 1 SVG user unit) over **120s linear infinite**. The two tiles are
  identical, so the wrap is seamless. Guarded by `prefers-reduced-motion`.
- **`overview-preview.html`** — mirror the layer so the dev harness stays representative (it links
  `warm.css` not `styles.css`, so the keyframes are inlined there).

**Determinism:** none moved — client-only, no sim/hash surface. **476 node tests green** on the
merged tree (incl. the 14 overview-scene tests; `starfield()` determinism pin unchanged).
Speed lever = the `120s` in `styles.css`. Room Zoom (`.rz-space`) has no starfield today — drift
there is a fast-follow if wanted.

## Wall drag-build + authoritative wall/floor materials: LANDED on `main` (2026-07-23, `70e0b95`)

RimWorld-style **click-drag** wall/floor building with a live orientation-aware preview + **authoritative
hashed** wall/floor material selection (the 12 MATERIAL pieces of the item set). Seven commits, each
Opus-implemented + independently Opus-reviewed. Design/plan: `docs/design/perilune-wall-drag-material.plan.md`.

**In the Room Zoom (the current build face, `--ship grid` → Overview → click a room):** arm WALL or FLOOR
→ a **material swatch strip** (6 wall / 6 floor item-set skins) appears → pick one → **press-drag across
the floor** and release. Walls trace the dragged rectangle's **perimeter** (a 1-wide drag = a straight
run, a wide drag = an enclosing ring); floors **fill** the box; door + non-structural tools stay single
click. A plain click is the degenerate 1-tile drag. Built walls + non-default floors now **render with
their material skin** (interior partitions were previously invisible).

**Sim/wire:**
- **S1** per-tile hashed `ZLevel.Material` byte plane (0=default), folded last into `World.HashInto`,
  saved in the TILE chapter (v1→v2, pre-v2 reads 0). `World.Get/SetMaterial` (inert, no RecomputeFlags).
- **S2** `BuildKind.Floor=2` (re-material a floor tile), `PendingBuild.Material` (StateVersion 1→2),
  `Designate/CanDesignate/DesignateBuildCommand(material)`, `Complete` writes `SetMaterial`. Floors cost
  1 Regolith / 20 ticks (v1 literals; TODO `BuildDefs`). Pin-neutral.
- **W1/W2** `Cmd.build(kind,x,y,material)`; host `HandleBuild` floor + material; `designs` tuple appends
  material (elem 7); view-only sparse `materials` channel (`WireFormat.Materials`/`BuildMaterials`) projects
  the World plane → client skins built tiles.

**Honest caveats:** material = tile identity + skin, NOT a differentiated cost (every build still consumes
`Regolith`; no glass/timber item kinds exist). Drag + picker are Room-Zoom-only — the **legacy on-map
console is a fast-follow**. Latent (revisit when demolish-of-built lands): `SetMaterial` isn't cleared on
`SetWall(pos,0)`; one Material byte/tile means wall-over-floor overwrites the floor byte.

**Determinism (combined w/ E0-1):** scenario `a53d8505013dc25d` (twins match), tick-3000 `9b834cffc232ce7f`,
slice `9a84a72f6ab67386`, defs `60147a57e27c5c31` (E0-1's; unmoved by this feature). `ci.sh` green.

## E0-1 — labour supply (recruitability): LANDED on `main` (2026-07-23), START HERE for the economy

**The first E-lane is on `main`** (`c643293`, merged `--no-ff` from `lane/e0-1-recruitability`
@ `f3b5d93`). Opus-implemented + independently Opus-reviewed **PASS** (all four named test
mutations applied and confirmed failing; every pin reproduced). E0-1 is the hard prerequisite
that unblocks every other economy lane — it moves the effective labour pool from a measured ~1.43
of 8 toward the full crew.

**What it does — two levers:**
1. **`Citizen.IsIdleForWork` dropped `&& !HasPath`** → now `!Dead && !HoldPosition && JobKind ==
   JobKind.None`. A wandering crew member (`AutoWander`) is almost always mid-wander-path, so the
   old gate hid it from the dispatcher (`JobSystem:136`), self-serve (`SustenanceSystem:82`) and
   the maintain/craft recruiters. The path takeover was already clean — a job claim re-paths from
   `citizen.Pos` (`JobWork.TryPathToAdjacent`), overwriting the wander path — so no takeover
   machinery was added. **Measured: 6/6 crew recruited vs 2/6 with the fix reverted; all 8 slice
   crew take work at tick 1 (was: first at t31).**
2. **`wander_radius_tiles` def field** (default **8**, `PathService.TryRandomWalkableTileNear`, a
   Chebyshev-box bounded sampler wired into `CitizenSystem:65`; full six-site def ritual). Radius
   is the lever — NOT idle-time — because reducing wander cadence would re-synchronise the crew's
   needs and revive the anti-pile-on hypoxia deadlock `AuthoredShips.cs:235-241` guards against.
   Bounded wander keeps crew dispersed locally AND near job sites. Default is UNTUNED pending the
   A1 measurement.

**Pins (current — supersedes the B-bug tables below):**

| pin | value | pre-E0-1 |
|---|---|---|
| 3-day scenario (`ci.sh`) | `494ad0b05a154ccb` | `494ad0b05a154ccb` (HELD) |
| tick-3000 golden | `0f66ffdf9f90f766` | `0f66ffdf9f90f766` (HELD) |
| slice tick-3000 golden | `d93165a481ebb344` | `994aa1ac661aa1cc` (moved) |
| defs checksum | `60147a57e27c5c31` | `81ae90bdd049f745` (moved) |

Both StateHash pins HELD because the scenario and perilune tick-3000 ships carry non-wandering /
`HoldPosition` crew — they never enter the labour or wander paths E0-1 changed (proven
empirically: an RNG-consuming sampler swap would have moved those hashes had those ships wandered).
The slice golden moved (regenerated single-owner, cause stated) and the defs checksum moved (new
scalar fold). Gate on the merged tree: **`./ci.sh` exit 0, twin hashes MATCH, 811 dotnet + 461
node green.**

**Player-control semantics — DECIDED (Garvin, 2026-07-23):** relaxing `IsIdleForWork` makes an
active `MoveCitizenCommand` order (which carries a `JobKind==None` path) newly interruptible by
auto self-serve AND auto-work. The self-serve interrupt (divert to drink/eat on a real threshold
crossing) is live now; the sharper edge — an auto-DIG assignment hijacking an explicit order — is
LATENT because the web client has no dig/stockpile verb yet (`MECHANICS §13.6`). Decision:
**leave as-is, `HoldPosition` is the strict-control escape hatch; revisit at E0-3** when the dig
verb makes the auto-work edge reachable. The reviewer ruled this a design question, not a merge
blocker.

**What E0-1 left unconnected (`MECHANICS §13.6`):** it fixed the *recruiter* half of the near-zero
labour pool; the *designation* half is still a gap — the web client has no dig/stockpile/strip
verb, so `AgreeTask` stays dead. That is **E0-3**. And the wander radius default (8) is untuned.

**Next: E0-2** (10× work-rate rebase + the parked movement retune, landed together as ONE
integrator-gated commit, BEHIND E0-1 never before it — the retune alone costs 29% of production
and halves recruitability) **then E0-3** (dig/stockpile/strip verbs on the web client — review the
new AAA UI surface first, below). See `ECONOMY-PLAN.md` §E0.

---

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
catching the author's blind spot every time). (E0-1 recruitability has since landed on top — see
the E0-1 section at the top of this file; next is E0-2 then E0-3.) Everything below is the
historical record of how Wave 0 and the B-bugs went.

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
