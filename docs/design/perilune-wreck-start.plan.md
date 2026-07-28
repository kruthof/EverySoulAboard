# The wreck start — premise, opening, core loop, and a wave charter

**Status: DESIGN ONLY. 2026-07-28 — REVISION 2.**
**Lane:** `lane/wreck-design`. The whole diff is this file plus a pointer in `docs/HANDOVER.md`.

> ## ⚠️ REVISION 2 — read this box before anything else
>
> Revision 1 was written before the owner stated the **thaw mechanic**, and before four lanes
> built parts of this charter. **The premise of §2 has changed and §2 is rewritten from scratch.**
>
> **THE THAW MECHANIC, in the owner's own words, and it is the spine of the opening:**
>
> > *"The idea is that we have 8 pawns all in the pods, one gets [defrosted] right at the
> > beginning and that's the one the user controls at the beginning. The others have to be
> > defrosted via the MOSS terminal but only one after the other so the user does not have to
> > manage 8 pawns right from the beginning. This is an important game mechanic."*
>
> ⇒ **The opening is a ONE-PAWN game.** Everything in revision 1's beat sheet that assumed a
> crew has been rewritten. §2 is the section to read.
>
> **What is now BUILT (four lanes, gated, none merged):** `lane/device-condition` (the `devices`
> wire channel), `lane/wrecked-art` (70 twins + 2 capsules), `lane/damaged-authoring` (**W1**),
> `lane/recovery-economy` (**W2** + the salvage rule + `ItemKind.Swarf`).
>
> **What this revision CORRECTS in itself.** Struck text is kept, not deleted — the diagnosis is
> the point. Six claims of revision 1 are now falsified: the `-1f` sentinel (§4 W1), *"a cryo pod
> needs no new hashed sim state"* (§0.5, §4 W5), *"W2 may move P1/P2/P3"* (measured: it does not),
> *"the wreck's lit core will draw no doors at all"* (§2 beat 1 / OD-7), *"salvage feeds
> production"* (it feeds **repair** — there is no Swarf→Parts path), and **the count of job
> sources** (four dispatcher sources, not six; three more claimants recruit outside the
> dispatcher).
>
> **Six owner decisions have landed and are no longer open** — OD-1, OD-2, OD-3, OD-4, OD-6 and
> OD-7 move to §7.0 as a decision record. **One new open item is INFERRED, not stated, and is
> flagged as such throughout: what a WRECKED OCCUPIED POD means** (§7 OD-9).

**Owner decisions 1–4 of the original brief are settled and designed to**, not re-argued.

> **Every number in this document is either (a) MEASURED by a command quoted beside it, or
> (b) labelled UNMEASURED.** This repo's most expensive recurring failure is reasoning over
> design vocabulary instead of driving the sim, so the two are kept typographically apart.
> All measurements were taken in this worktree, Release, `n = 1`, on `main` @ `d4b860a`.
> **Revision 2's measurements are in Appendix A rows 8–11 and were taken on a machine running
> nothing else; every wall-clock number is soft.**

---

## 0. Executive summary — what changed in my head while measuring

Five findings reordered the plan in revision 1. **Revision 2 adds three more, and the first of
them is the largest single result in this document.** Read all eight before the beat sheet.

1. **The opening loop the owner wants is already expressible in the shipped sim, except for
   one verb.** Vent, door, power, breathability, flee, worksite-refusal, maintenance, salvage,
   build — all of it exists. What does not exist is *a cryo pod and a thaw*, and *any way for
   the game to tell the player why a repair order is doing nothing*.

2. **`WorksiteSafety.CanStageWorkerAt` is not an obstacle to the premise — it IS the premise.**
   A raided ship is airless; work is only possible where the crew can breathe; therefore the
   core loop is a pressure frontier pushed outward one compartment at a time. Designing
   *against* this rule would be fighting the best mechanic we already own.

3. **⛔ THE SHIPPED SALVAGE RULE MAKES A WRECK WORTHLESS, BY EXPLICIT DESIGN.**
   `DeconstructSystem.cs:278-281` — *"`floor(deconstruct.device_parts × Condition)` = 2 for a
   pristine machine at shipped values, and **0 below Condition 0.5** — a wreck is worth
   nothing, which is the point."* The owner's art badges every wrecked piece at **0 %–35 %**.
   Under today's rule, **stripping the entire dead half of a wrecked ship yields zero Parts.**
   Owner decision 3's faucet ("salvaging the dead half feeds the living half") does not exist
   yet and is not a tuning tweak — it is a rule that has to be rewritten. ~~This is §7 OD-1.~~
   ✅ **RESOLVED (rev 2): OD-1 decided as option B and BUILT — `ItemKind.Swarf`. The diagnosis
   stood; see §4 W2 and §7.0 for why the shipped rule was not a bug.**

4. **⛔ `AddRoomCommand` IS A FREE, INSTANT, UNCONDITIONAL PRESSURISATION WAND.**
   `sim/Sim.Core/Commands/Commands.cs:600-666`: it force-unlocks and force-opens every
   bordering door and calls `RoomState.Pressurize(room)` — 101.3 kPa, 21 % O₂, from nothing,
   for free, with no vent, no power, no material, no time. On the standard surface it is the
   Overview's `＋ADD ROOM` chip. **On a wreck it deletes the entire core loop in one click.**
   ~~This is §7 OD-2 and it is the highest-stakes decision in the document.~~
   ✅ **RESOLVED (rev 2): OD-2 decided as option C — `＋ADD ROOM` SPLITS, naming is free and AIR IS
   EARNED. It is now §4 W4b, a blocking wave, and it is the change that makes the pressure
   frontier a loop rather than a formality.**

5. ~~**A cryo pod needs NO new hashed sim state.**~~ **PARTLY RETRACTED (rev 2) — the FIELDS
   claim survives; the PIN claim does not.** `Device` already carries `IsOpen` (hashed
   `Simulation.cs:454`, saved DEVC), `Name` (hashed `:469`), `Condition` (hashed `:466`),
   `Powered` (hashed `:456`) and `Progress` (hashed `:464`), and **no new `Device` field is
   needed.** But the owner's *"only one after the other"* is enforced by a **pod cycle**, a
   cycle has to be counted down by *something*, and the only honest home for it is a new
   `CryoSystem` — and **registering a system folds its seed unconditionally, which moved all
   three state pins for W0-6's four EMPTY systems** (`CLAUDE.md`, "Determinism proof"). ⇒ **W5
   moves all five pins, not two.** Full working in §4 W5.

### Revision 2's three findings

6. ⭐ **THE ONE-PAWN SCHEDULE IS A STRICT PRIORITY LADDER, AND IT IS UPSIDE-DOWN FOR THE WRECK.**
   The dispatcher does not consult hunger, thirst or fatigue at any point, and
   `SystemStack.Build` fixes the order in which an idle crew member is offered work
   (`SystemStack.cs:33-37`): **`JobSystem` ▸ `SustenanceSystem` ▸ `CraftingSystem` ▸
   `MaintenanceSystem`.** Two shipped source comments state the consequence as intent —
   `SustenanceSystem.Tick`: *"A citizen doing anything else — hauling, digging, building — is
   skipped entirely, which is the whole reason this system is registered after JobSystem"*; and
   `MachineWearSystem.RecruitForNeediest`: *"claimed now — earlier systems already ran"*.
   ⇒ With one pawn, **anything the player has painted outranks eating, drinking, crafting and
   maintenance, in that order** — and maintenance, the thing the wreck premise is *about*, is
   dead last. **At eight crew this is invisible: MEASURED, loading grid's dispatcher board with
   200 strip designations left Maintain occupancy at 0.782 % → 0.782 %, starts 10 → 9, and
   `None` still 72.86 %** (Appendix A rows 9–10) — grid never saturates its crew, so the ladder
   never binds. **It binds exactly when hands are scarce, which is the one-pawn case, and that
   case is UNMEASURED because no one-crew ship exists to drive.** §2 and §6 R-12/R-13.

7. **THE FIRST THAW IS THE ENTIRE MATTER LADDER, AND IT IS ~3.4 CREW-HOURS OF PURE BENCH TIME.**
   MOSS is the thaw console, MOSS needs a commissioned `Terminal`, commissioning costs one
   `ControllerModule` (`Commands.cs:507-540`), and a `ControllerModule` is three conversions
   deep. **MEASURED off the shipped bills** (`production.def:118-119`, `recipes.def:22`):
   `Regolith:4 → Scrap:3` @ 2 400 s · `Scrap:2 → Parts:1+Seals:1` @ 900 s ·
   `Parts:2 → ControllerModule:1` @ 1 800 s. **⇒ 8 400 crew-seconds of bench for one module**,
   on top of repairing and powering all three benches. **That is the opening, and it is a good
   one** — but it means `thaw_cost` must be priced in **Parts**, not modules, or every thaw is a
   fresh 2.3-crew-hour chain. §2 beats 5–7.

8. **THE SALVAGE THESIS SURVIVED, BUT NOT IN THE SHAPE REVISION 1 ARGUED.** OD-1 was decided as
   option B (`ItemKind.Swarf`) — but **Swarf does not feed production, it feeds REPAIR**, and
   that is not a tuning choice: `ProductionDefs.TryGetBill` resolves a station's bill at
   **ordinal 0 only**, and all three benches already carry one, so a `recycle_swarf` node
   *parses, checksums, is reachable, and never runs* (`production.def`, the shipped lane's own
   driven finding). ⇒ The wreck's salvage is spent as the **bottom maintenance rung**
   (`wear.swarf_service_condition = 0.45`). ⚠️ **The same wall is waiting for the `Degraded`
   bit: there is nowhere for a "reprocess spoiled Parts" bill to run either.** §4 W9.

---

## 1. The premise and the fiction

### 1.1 The owner's statement of intent, verbatim

From the imported item set (`scratchpad/item-set-remote.dc.html`, section **"Wrecked — post-raid
state"**), which is the art brief and therefore the fiction brief:

> *"Day 1: the raid left every system dead. Every item above has a broken twin here — scorched,
> cracked, breached, screens dark, wiring hanging loose — that the thawed crew must repair or
> rebuild. Each keeps one identifying feature so it still reads as the same object. The badge
> shows remaining condition; loose resources can't be 'repaired', so they get a spoiled/slagged
> state instead of a percentage."*

Two new static pieces beside it: `CRYO CAPSULE · OCCUPIED` and `CRYO CAPSULE · OPEN`.
70 wrecked twins, badged `0 %`–`35 %`, plus 8 loose resources badged `—`:
`REGOLITH · CONTAMINATED`, `POTATO · SPOILED`, `SCRAP · SLAGGED`, `PARTS · SEIZED`,
`CONTROLLER · FRIED`, `SEALS · PERISHED`, `ICE · MELTED`, `CORPSE · UNSHROUDED`.

Those eight are exactly the eight `ItemKind`s that carry ground art. `MetalOre = 1` is
deliberately absent from both sets — it has zero references in `sim/` outside the glyph table
and is dead E3 mining vocabulary (`sim/Sim.Core/Entities/ItemStack.cs:6`).

### 1.2 The fiction, reconciled against the shipped noun list

The sim's vocabulary is small and I have not invented anything outside it.

| Fiction | Shipped noun | Where |
|---|---|---|
| MSV *Perilune*, boarded and stripped while under way | the ship | — |
| The crew who were awake are dead or taken | `ItemKind.Corpse` stacks, authored with `Label` = a name | `ItemStack.cs:7`, `ShipPlan.cs:97-103` |
| The crew who were frozen survived — **ALL EIGHT, one thawed at boot, seven through MOSS** | `DeviceKind.CryoPod` (new), `IsOpen = false`, `Name = "pod_<who>"`, `Progress` = the cycle | §4 W5 |
| The raiders vented most compartments | `plan.PressurizedAnchors` omits them | `ShipPlanBuilder.cs:87-95` |
| They shot up the machinery | `DeviceSpec.Condition` (**`float?`**, 🟢 shipped) at 0.0–0.35 | §4 W1 |
| They cut through bulkheads | `'R'` debris terrain (`AsciiWorld.cs:39-42`) — collapsed deckhead |
| The rubble | `ItemKind.Regolith` → **`Rubble`** | `ItemStack.cs:5`; §4 W10 |
| They left the stores spoiled or slagged | authored `ItemSpec` stacks + the `Degraded` bit | §4 W9 *(was OD-3)* |
| MOSS is dark | `Device.Scriptable = false` on every device | `Device.cs:97`, `MossBindings.cs:28` |

### 1.3 "Regolith" and the digging

**The digging survives, and it is the *right* opening job — but not as mining.**
`ItemKind.Regolith`'s own source comment already says what it is:
`ItemStack.cs:5` — *"legacy name: debris spoil from cleared sections"*.
`DigJobSource` only ever offers work on a tile whose wall is `TileDefs.Debris`
(`DigJobSource.cs:42`); there is no ore, no seam, no mining anywhere in the sim. **Digging is
already "clear the collapsed deckhead out of this compartment", which is precisely the first
thing you do after a boarding.** The fiction does not need a new mechanic; it needs the
identifier renamed.

⇒ **Renaming `ItemKind.Regolith` to `Rubble` is a pure rename with no hashed-value change** —
the enum's numeric value stays 0, so no save and no pin moves — but it touches the glyph table,
the client `ITEMS` registry, four independently-derived accept masks (`ItemStack.cs:22-33`),
`BuildSystem.Material` (`BuildSystem.cs:58`), the ledger's kind names (`ShipLedger.cs:356`) and
every test string. ~~**It is a decision, not a task** — §7 OD-6.~~
**DECIDED (owner, rev 2): `Rubble`. It is now W10, and it RUNS ALONE.**

**The "no pin moves" claim is now MEASURED rather than asserted, and it turned on one thing I
had not checked.** P4 folds parsed def *values*, not def *file bytes*, and the item name in
`production.def:118` (`Regolith:4`) is parsed to the byte `0` — so retyping it is invisible to
the checksum. **P5 additionally folds each `rules/*.moss` file's name and SOURCE BYTES**, so a
rule naming the item *would* move it. There is **exactly one shipped rule**,
`content/core/SimDefs/rules/overheat_guard.moss`, it is 10 lines, and it names `ship.heat` and
nothing else — **verified by reading the whole file**. ⇒ **W10 moves no pin. Re-verify this
before landing it, because it depends on the rule set staying this small.**

### 1.4 What the raid left behind, and what it did not

**It did not take the hull.** Walls, floors, doors, conduits, pipes and ladders survive — they
are terrain and utility overlays, and the ship must remain a connected, walkable space or the
premise is unplayable. `IsPressureHull` already refuses to let the player strip a hull wall
(E0-5), so the canvas edge is safe.

**It took or wrecked everything with a `Condition`.** That is exactly the set `machines.def`
gives a non-zero `wear` column: doors, vents, scrubbers, terminals, solar wings, batteries,
lights, grow beds, tanks, reclaimers, the fabricator, the machine shop, the recycler, radiators,
the telescope, the ice melter. Ladders, conduits and pipes are `0 0 0 0` and are *never*
maintained (`machines.def:29`, `:33`, `:36`) — which is what keeps the wreck traversable.

---

## 2. The opening beat sheet — ONE PAWN, the first ~3 sim-hours

> ### ⚠️ REWRITTEN IN REVISION 2. Revision 1's beat sheet assumed a crew.
> The owner's thaw mechanic makes the opening a **one-pawn game**: eight sleepers, one thawed at
> boot, the other seven released **one at a time through the MOSS terminal**. That is not a
> re-skin of the old beat sheet — it changes what every beat costs, because **one person cannot
> haul, dig, repair and cook at once**, and the sim has a fixed opinion about which of those
> they do first (§0 finding 6).

**Reading key.** ✅ = the verb and the answering system exist today, unmodified.
🟢 = **BUILT this run on an unmerged lane** (named). 🔶 = the verb exists but answers wrongly on
a wreck. ❌ = must be built. "sim-min" is simulation time; the crew work at the E0-2 human-pace
rebase (a wall is 4 min, a device strip is 90 s, a maintenance service is **900 s = 15 sim-min**,
`wear.def:17`).

---

### 2.0 What happens to the job sources when there is one pair of hands

**There are not six job sources. MEASURED-BY-SOURCE, exhaustively.** There are **four**
dispatcher sources — `DigJobSource`, `HaulJobSource`, `BuildJobSource`, `DeconstructJobSource`,
in that registration order (`JobSystem.DefaultSources()`) — plus **three claimants that recruit
outside the dispatcher entirely** (`SustenanceSystem`, `CraftingSystem`, `MaintenanceSystem`)
and **one pre-emptor** (`SafetySystem`, which drops a job mid-work).

With eight crew, which of them gets a given pawn is a statistical curiosity. **With one pawn it
is the whole schedule**, and the schedule is fixed by `SystemStack.cs:27-62`:

| # | claimant | how it takes the pawn | what it costs, once taken |
|---|---|---|---|
| 1 | `JobSystem` — dig ▸ haul ▸ build ▸ strip | `TryAssign` on any citizen with `JobKind == None` | dig 10 min · wall build 4 min · wall strip 2 min · device strip 90 s |
| 2 | `SustenanceSystem` — eat / drink | only if still `None` after (1) | until fed |
| 3 | `CraftingSystem` — craft | only if still `None` after (2) | **2 400 s / 900 s / 1 800 s per batch** |
| 4 | `MaintenanceSystem` — maintain | only if still `None` after (3) | **900 s per service** |
| — | `SafetySystem` — flee | **pre-empts anything** | drops the job, releases reservations |

**Three consequences, and the first two are hazards.**

- ⚠️ **A painted order outranks eating.** `JobSystem.TryAssign` consults **no need at all** —
  not `Hunger`, not `Thirst`, not `Fatigue` (verified by reading the whole of
  `JobSystem.cs:220-275`). A pawn is re-offered work on the very tick its last job ends, before
  `SustenanceSystem` ever sees it idle. **So a continuously non-empty, reachable dispatcher board
  is a starvation shape** — the same family as the `MaintenanceSystem` livelock this repo closed
  last week. **UNMEASURED at one pawn; MEASURED not to bite at eight** (Appendix A rows 9–10).
- ⚠️ **A painted order also outranks maintenance and crafting**, which on a wreck are *the game*.
  A player who paints two hundred strip orders and walks away has, with one pawn, stopped the
  ship healing itself and stopped the benches running, **silently**.
- ✅ **But the wreck's default state is a QUIET BOARD.** Dig, haul, build and strip are *all*
  player-painted (a wreck authors no designations and zones no stockpile — `MECHANICS.md`
  §13.18), so a lone pawn with nothing painted falls straight through to eat ▸ craft ▸ maintain.
  **The ladder is right by default and wrong under load**, which is the best a content decision
  can do here.

**⇒ RECOMMENDATION, and it is cheap: W3 authors NO designations, and W4's channel is what makes
the load case visible.** The durable fix is **W7** (per-crew work priorities) — and note that a
one-pawn opening promotes W7 from *"a nice RimWorld affordance, after W8"* to *"the only way to
tell your one person to stop stripping and go eat"*. **I am not recommending W7 move ahead of
the ship** (it moves all five pins and it is the biggest lane in this document), but the owner
should know the tension exists. §6 R-12.

---

### Beat 0 — cold open. One pod cycles. Seven do not.

**What the player sees.** One deck. One lit, pressurised compartment — the cryo bay. **Eight
`CRYO CAPSULE · OCCUPIED`.** Everything else on the deck is a wrecked twin at 0 %–35 %. One
capsule's badge counts down; it opens; **one** pawn steps out onto the deck plate. The other
seven stay shut, and they stay shut until the player earns them.

**Verb:** none — the player does nothing.
**System:** ❌ **must be built**, and the honest shape has not changed: there is no boot-time
scripted event of any kind. Author **pod 0 `IsOpen = true` with its citizen present**
(`CitizenSpec`) and **pods 1–7 `IsOpen = false`** with the sleeper's name in `Device.Name`.
The game opens one tick after the first thaw rather than staging it; the countdown badge is a
client-side flourish over `Device.Progress`, which W5 gives a real meaning anyway.
⇒ **Recommendation unchanged: author the first crew member awake.** §4 W3 + W5.

⚠️ **This is the first place the INFERRED owner item bites.** If a wrecked pod's sleeper is
alive-but-unreachable (§7 OD-9's working assumption), pods 1–7 are authored at a low `Condition`
and each must be **repaired before it can be cycled** — which is a per-pawn matter price and is
the cleanest available pacing lever. **Do not build it as settled.**

---

### Beat 1 — "I am alone". Orientation, 0–2 sim-min.

**What the player does.** Pans the Level-1 Overview; enters the Room Zoom; clicks the one pawn.

**Verbs:** deck change ✅, room entry ✅, crew select ✅, pause/speed ✅
(`GameSession.cs:2129-2132`).
**System:** the `map`/`crew`/`materials`/`marks`/`items` wire channels, all shipping, plus
🟢 `devices` (`lane/device-condition`) — which **carries `Condition` to the client for the first
time and deliberately draws nothing yet.**

⚠️ **The `devices` channel arrives with a written CONDITION attached, and the wreck is the lane
that will trip it.** Its header records that it costs **~6 % of every render, two-thirds of that
in serialization**, and makes a **delta / dirty-version scheme a REQUIREMENT on whichever lane
first draws the data** — which on this plan is the wrecked-twin join. **Budget it inside that
package; do not discover it there.**

~~⚠️ **What the player sees here is the door bug from `HANDOVER.md`'s top block** … the wreck's
lit core will draw no doors at all … **Blocking dependency on the wreck start.** §7 OD-7.~~
**⛔ RETRACTED (rev 2) — and it was wrong in both halves.** The door-art lane landed:
`'+'` (closed) is skinned by `sliding-door` and `'X'` (locked) by `blast-door` through
`GLYPH_SUBSTITUTE`, so **shut doors draw, which is the half the pressure frontier actually
needs.** And `'/'` (open) is **deliberately** unskinned — `glyph-map.js:130`: *"an open doorway
is a gap, and a gap is what both surfaces already draw"*. **OD-7 is CLOSED, not blocking.**
What *was* real underneath it is that `AddRoomCommand` force-opens every bordering door, so an
allocated room's doors all became gaps — and **owner decision 2 deletes that force-open**
(§4 W4b). **One command, two owner reports, one fix.**

---

### Beat 2 — "I can't breathe out there". The frontier appears. 2–5 sim-min.

**What the player does.** Walks the one pawn toward the next compartment. Either the door is
shut, or it is open and the pawn's Suffocation climbs; at `flee_suffocation = 0.5`
(`needs.def:34`) `SafetySystem` drops whatever it was doing and paths it back to breathable air
(`SafetySystem.cs:227-234`). ~45 s of exposure.

**Verbs:** move order ✅ (`MoveCitizenCommand`, `Commands.cs:56`), door open/close ✅
(`SetDoorStateCommand`, `Commands.cs:4`), pressure/oxygen/CO2/temperature lenses ✅
(`GameSession.cs:2074-2079`).
**Systems:** `AtmosphereSystem` ✅, `NeedsSystem` ✅, `SafetySystem` ✅.

**This beat needs nothing built and it teaches the whole game.** It is the strongest thing the
shipped sim already does and the wreck start is the first ship that puts it in front of a new
player in minute three.

⚠️ **AND WITH ONE PAWN IT ACQUIRES A HARD-LOSE STATE THAT DID NOT EXIST BEFORE.** `SafetySystem`
saves a crew member who *can* reach air; a player who walks their only pawn deep into vacuum
past the flee margin loses it — **and cannot thaw a replacement, because thawing needs a
repaired, powered, commissioned MOSS terminal and the pawn was the only pair of hands.**
**Seven people stay frozen forever and the game is over in minute three, with no message.**
This is not a bug in any shipped system; it is a property of a one-pawn opening, and it is
**§7 OD-10, open on the owner.** The two honest shapes are *(a)* accept it and say so loudly
(a real lose screen), or *(b)* an **emergency thaw**: pod 1 cycles automatically, once, when the
living crew count reaches zero. I recommend **(b) plus a lose screen when the pods run out** —
it protects minute three without protecting hour three.

---

### Beat 3 — "why is nothing happening?". The silent refusal. 5–8 sim-min.

**What the player does.** Paints a DIG or a repair order in the airless compartment next door.

**What happens today:** ❌ **nothing. Forever. Silently.**
`JobWork.TryPathToAdjacent` (`JobContext.cs:73-88`) asks `CanStageWorkerAt` for each of the four
approach tiles; all four fail; the site takes a 50-tick backoff (`DigJobSource.cs:106-108`) and
is re-probed every 5 s for the rest of the game. No toast, no tint, no reason. `MECHANICS.md`
§13.21 records this as an accepted cost with a follow-up filed.

⇒ ❌ **ON THE WRECK THIS IS NOT A FOLLOW-UP. IT IS A LAUNCH BLOCKER — AND ONE PAWN MAKES IT
WORSE, NOT BETTER.** On `--ship grid` the refusal is reachable but rare: **re-measured this
revision, `occupancy --ship grid --days 2 --maint-audit` still reports
`unstageable dig/strip/build 0 / 0 / 0`** (Appendix A row 9), because grid's player-reachable
work is all in breathable air. On a wreck **the majority of every order the player paints in the
first hour will be refused** — and with eight crew a refused order is masked by seven other
people visibly working, while **with one pawn a refused order means the entire ship is
motionless.** A refusal that looks identical to a broken verb, on a ship where nothing else is
moving, will read as a broken game. `CanStageWorkerAt` was made `public` for exactly this.
§4 W4.

**Required, not optional:** a sparse view-only `blocked` wire channel, and a Room-Zoom
treatment that says *"no air — nobody can work here"* on the designated tile.

---

### Beat 4 — "make one more room breathable". The frontier moves. 8–20 sim-min.

**⭐ OWNER DECISION 2 LANDS HERE, AND IT IS WHAT TURNS THIS BEAT FROM A FORMALITY INTO THE LOOP:
`＋ADD ROOM` SPLITS. NAMING IS FREE. AIR IS EARNED.** Allocating a compartment names and types
it and nothing more; pressurising it becomes a working, powered, repaired vent moving gas over
time. §4 W4b is the package.

**What the player does.** Allocates the compartment (free), shuts the doors around it, then
**makes its air** — which now means finding the vent, repairing it, and getting power to it.

**The five things that must be true for a compartment to become workable** — all five are
already modelled, and this is the loop:

| # | Requirement | Mechanism | Verb today |
|---|---|---|---|
| 1 | Doors shut, or it bleeds to vacuum | `FlowAcrossDoor`, `AtmosphereSystem.cs:206-274` | ✅ door open/close |
| 2 | A vent in the room, **open** | `AtmosphereSystem.cs:123-150`, 30 mol/s from an unmodelled reserve | 🔶 see below |
| 3 | The vent **powered** | `PowerSystem`; needs conduit → network → SolarWing | ✅ indirectly |
| 4 | The vent `Condition ≥ fail` (0.10 for an AirVent, `machines.def:27`) | `Device.IsOperational`, `Device.cs:104` | 🟢 `lane/recovery-economy` |
| 5 | Temperature ≥ −10 °C (`needs.def:22`) | `ThermalSystem` — **there is no heater in the game** | ❌ see §6 R-4 |

🔶 **Requirement 2 has no verb on the standard surface.** `SetDeviceStateCommand`
(`Commands.cs:32`) toggles `IsOpen` on any device and is wired to the MOSS console
(`GameSession.cs:473-484`) and the TUI — **not to the Room Zoom.** So *opening a vent*, the
single most important physical act in the wreck's core loop, is today reachable only through a
text terminal. ⇒ **A `vent` verb on the Room Zoom is required, and after owner decision 2 it is
no longer optional polish — it is the only way to make air at all.** §4 W4b.

~~🔶 **`＋ADD ROOM` short-circuits all five.** See §7 OD-2. Until that is decided, beat 4 has a
one-click cheat.~~ **RESOLVED — OD-2 decided as option C.**

⚠️ **Requirement 4 is where the wreck's economy enters the pressure loop, and it is a good
join.** A wrecked `AirVent` is authored below `wear.wreck_threshold = 0.25`, so 🟢 W2 refuses to
jury-rig it for free: **the player's first vent costs a consumable, and on a fresh wreck the only
consumable in existence is `Swarf` from a stripped machine.** ⇒ **Beat 6 (salvage) now precedes
beat 4 (air) in play, even though it comes after it in this document.** That inversion is the
single biggest change owner decision 3 made to the opening, and W3's authoring must respect it:
**the boot compartment must contain at least one strippable wrecked device**, or the loop cannot
bootstrap. There is no circularity — stripping needs no bench and no consumable — but there is a
hard authoring precondition, and it belongs in W3's acceptance.

**Measured, so nobody has to guess whether the vent is fast enough:** `vent_mol_per_second = 30`
(`atmosphere.def:19`), pass Dt = 0.2 s. A 60-tile compartment is 150 m³; filling it to 101.3 kPa
at 293 K takes ≈ 6 240 mol ⇒ **≈ 208 s ≈ 3.5 sim-min at one vent.** *(Arithmetic over shipped
defs; not driven. Worth a driven check in W4's acceptance.)*

---

### Beat 5 — "the machines are dead". Repair enters. 20–40 sim-min.

**What the player does.** Nothing, at first: `MaintenanceSystem` recruits on its own, every
second, for any device below its `maint` threshold (`MachineWearSystem.cs:200`).

**What happened before this run:** 🔶 **the ship healed itself, for free, with empty hands.**
`RestoredCondition` (`MachineWearSystem.cs:394-399`): Parts in hand → `1.0`; Seals in hand →
`0.9`; **empty hands → `jury_rig_condition = 0.6`** (`wear.def:18`). 0.6 is above every `maint`
threshold in `machines.def` (max 0.4), so **one 900 s pass with nothing in hand took any
wrecked device permanently out of the needy set.**

**What happens now:** 🟢 **BUILT on `lane/recovery-economy`.** `wear.wreck_threshold = 0.25`:
below it an empty-handed jury-rig is **refused at RECRUITMENT**, not in the work phase — which
is the right seam and for a measured reason (refusing after the 900 s countdown would recreate
the `MaintenanceSystem` livelock the worksite-safety package just closed, 47 640 job starts for
2 services). The ladder is now **four rungs**:

| in hand | restored to | precondition |
|---|---|---|
| Parts | 1.00 | — |
| Seals | 0.90 | — |
| nothing | 0.60 | **only at or above `wreck_threshold`** |
| **`Swarf`** | **0.45** | **only BELOW `wreck_threshold`** — the rung for a machine the free repair was refused to |

⚠️ **OWNER DECISION 5, TAKEN KNOWINGLY, AND IT IS VISIBLE IN THE FIRST HOUR.** `Terminal`,
`Light` and `WaterTank` all carry `maint = 0.20` (`machines.def`), which is **below** the 0.25
threshold — so all three have an **empty free-repair band on every ship**: they become needy
only once they are already wrecked, and can therefore *never* be bodged without matter. **The
`Terminal` is the MOSS box**, so this is not an edge case on the wreck ship — **it is the price
of the thaw console**, and it is the reason beat 7 costs what it costs.

⇒ ~~This is owner decision 3 and it is correct: **below a wreck threshold, jury-rig must be
refused.** §4 W2.~~ **Shipped. §4 W2 is now a record, not a charter.**

**How big the repair backlog is, so the pacing is on the record.**
MEASURED anchor: `occupancy --ship grid --days 6 --maint-audit` → **88 services completed** at
**1.999 % Maintain occupancy** with 8 crew; `--days 12` → **272 services**, **3.063 %**. The
system is nowhere near saturated. **The wreck's damaged set is now BOUNDED rather than guessed:**
`--ship grid` boots **1 250 devices of which 1 104 are utility overlays** (1 088 Conduit +
16 Pipe — measured by `lane/device-condition`, and conduits/pipes/ladders are `wear = 0` and
*must not* be wrecked, since they are what keeps the hull traversable and powerable). ⇒ **at most
146 tile-resident devices on a grid-shaped ship**, and the wear-bearing subset of those is
**UNMEASURED until W3 builds the ship**. Upper bound on the backlog: `146 × 900 s = 131 400`
crew-seconds = **36.5 crew-hours**. **At ONE pawn that is 36 sim-hours of nothing else**, and
it is the pacing curve the premise wants — it exists the moment free jury-rigging stops, which
it now has.

⚠️ **A NEW HAZARD REVISION 1 MISSED, AND IT COMES FROM W1 MEETING `machines.def`.** W1 lets a
plan author *any* device damaged — **including furniture**, which the `devices` channel
deliberately carries. But furniture is `0 0 0 0`: `maint = 0`, so
`MaintenanceSystem.RecruitForNeediest`'s `if (d.Condition >= MaintainBelow) continue;` skips it
forever; and `fail = 0`, so `IsOperational` is true at any condition. **⇒ A SMASHED BED IS
PERMANENTLY UNREPAIRABLE AND FULLY FUNCTIONAL.** It looks broken, behaves perfectly, and no verb
in the game fixes it — the exact *"an item that looks broken and behaves normally is a lie the
player will find in ten minutes"* failure revision 1 rejected for loose resources, arriving
through a different door. **The only recourse is STRIP (1 Swarf) + rebuild (3 Parts).**
⇒ **W3 must either author furniture pristine, or W6 must give a bed a `fail` threshold so a
smashed one stops working.** Either is fine; silently authoring smashed furniture is not.

**Verbs:** none needed — maintenance is automatic. **What IS needed is legibility**: the player
must be able to see that a device is dead, what consumable it wants, and that the ship has none.
🟢 the `devices` channel plus the E0-8/E0-9 ledger cover most of this — **but the "no consumable
aboard" refusal is a THIRD silent refusal and is W4's job.** §6 R-1.

---

### Beat 6 — "where does anything come from?". The salvage answer. **This beat moved EARLIER.**

**What the player does.** Paints STRIP on a wrecked machine in the compartment they can breathe
in — and this is now, in play, roughly the *first* productive thing they do, because beats 4
and 5 both need a consumable that does not otherwise exist.

~~**What happens today:** ⛔ **they get nothing.**~~ **⛔ RETRACTED — OWNER DECISION 3 SETTLED
IT AND `lane/recovery-economy` BUILT IT.** The shipped rule was
`floor(device_parts 2 × Condition)`, i.e. **0 Parts below Condition 0.5**, with the source
comment *"a wreck is worth nothing, which is the point"* — against art that badges every wrecked
twin at **0 %–35 %**. The cliff is now **a change of currency, not the end of the curve**:

| Condition | yield | changed? |
|---|---|---|
| 1.00 | 2 Parts | no — byte-identical |
| 0.50 … 0.99 | 1 Part | no — byte-identical |
| **0.00 … 0.49** | **1 `Swarf`** (`deconstruct.device_swarf`) | **NEW — was 0** |

**The boundary is derived, not written down**: the code pays Swarf exactly when the Parts figure
floors to 0, so it tracks `device_parts` automatically and there is no `0.5` anywhere.
**Letting a working machine rot still costs you** (2 Parts → 1 Part → 1 Swarf is strictly
monotone), which is what the original rule was protecting and what any replacement had to keep.
Walls still pay 1 Regolith condition-independently (`deconstruct.def`), and dug debris still
pays.

⚠️ **AND THE THESIS IS NARROWER THAN REVISION 1 CLAIMED. `Swarf` DOES NOT FEED PRODUCTION.**
It has exactly one source (this yield) and exactly one sink (the 0.45 maintenance rung). **There
is no Swarf → Parts path at all**, so *"salvage the dead half to feed the living half"* is true
of **repair** and false of **manufacture**. That is not a tuning choice — `TryGetBill` resolves a
station's bill at **ordinal 0 only** and all three benches already carry one, so the
`recycle_swarf` node that would convert it *parses, checksums, is reachable through `TryGetNode`,
and never runs*. **A fourth conversion needs a fourth station or a bill-selection rule with
per-station save state (E-PROD), not a def edit.** §4 W9 hits the identical wall.

⇒ **The round trip stays lossy exactly as E0-5 WP-3 left it: 3 Parts out
(`build.device_place_cost`), at most 2 back.**

---

### Beat 7 — "wake someone up". **THE THAW, AND IT GOES THROUGH MOSS.** ~2–4 sim-hours in.

**⭐ This is the beat the owner's mechanic is about, and it is the reason "restore MOSS first"
finally has a purpose instead of a slogan.**

**What the player does.** Repairs, powers and **commissions** the ship's `Terminal`; opens the
MOSS screen; picks a sleeper; the game either cycles the pod, or says why not.

**Why MOSS is a real gate and not a fiction.** `Device.Scriptable` defaults `true`, so a wreck
authors it `false` (🟢 W1 shipped exactly this field), and the **only** way to set it is
`CommissionDeviceCommand`, which spends **one `ControllerModule`** (`Commands.cs:507-540`).
So the thaw console has a matter price, paid once, and **MEASURED off the shipped bills** that
price is the whole ladder:

| step | bill | work | for ONE module |
|---|---|---|---|
| strip 3 wrecked devices for Swarf | — | 90 s each | 270 s |
| service the 3 benches (Swarf rung → 0.45) | — | 900 s each | 2 700 s |
| strip 8 interior walls for Regolith | — | 120 s each | 960 s |
| `Regolith:4 → Scrap:3` | `recycle_stock` | 2 400 s | ×2 = 4 800 s |
| `Scrap:2 → Parts:1+Seals:1` | `fab_components` | 900 s | ×2 = 1 800 s |
| `Parts:2 → ControllerModule:1` | `[recipes]` | 1 800 s | ×1 = 1 800 s |
| | | | **12 330 s ≈ 3.43 crew-hours** |

*(Arithmetic over `production.def:118-119`, `recipes.def:22`, `deconstruct.def`, `wear.def` —
every bill MEASURED by reading the shipped file; the totals are arithmetic and are labelled as
such. It EXCLUDES every metre walked, the Terminal's own repair, and the SolarWing repair that
powers any of it. It is a FLOOR, not an estimate.)*

⇒ ⭐ **THE FIRST THAW IS THE ENTIRE MATTER LADDER, EXECUTED BY ONE PERSON**, and it lands at
roughly sim-hour 4–6. **That is the opening, and it is a good one** — the player spends the
first hours alone, and the reward is another person.

⇒ ⚠️ **THEREFORE `thaw_cost` MUST BE PRICED IN `Parts`, NOT IN `ControllerModule`s.** One module
buys the console, once. If every *subsequent* thaw also cost a module, thaws 2–8 would be seven
more 2.3-crew-hour bench chains — **~16 crew-hours of pure crafting to fill the ship**, and the
pacing stops being "one after the other" and becomes "one, and then you stop playing".
**Recommendation: `thaw_cost` in Parts, tuned so a thaw costs meaningfully less than the console
did.** §4 W5.

**Verb:** ❌ a `thaw` op on the MOSS screen — must be built (§4 W5).
**Gate:** ❌ `ThawGate` — must be built (§3.3), and it is **three orthogonal gates, not one**
(§3.4).
**Cost:** charged all-or-nothing via the existing `LooseMatter.TryPay` helper
(`Commands.cs:456`), the same shape `PlaceDeviceCommand` and `CommissionDeviceCommand` use.

---

### Beat 8 — "MOSS is dark". **The automation door — and now also the DOOR TO THE OTHER SEVEN.**

**What the player does.** Opens the MOSS terminal and finds it will not accept a program —
**and, after this plan, will not thaw anyone either.**

**What works today:** ✅ `Device.Scriptable = false` blocks `SetScriptCommand`
(`Commands.cs:111`) and blocks the device from ever entering the MOSS adapter registry
(`MossBindings.cs:28`). ✅ It already has a matter-priced restore path:
`CommissionDeviceCommand` spends one `ControllerModule` and sets `Scriptable = true`
(`Commands.cs:507-540`). ✅ It defaults `true` (`Device.cs:97`) — *"every device the ship was
authored with came commissioned"* — so a wreck must author it `false`, which is one more
un-authorable device field alongside `Condition` (§4 W1).

⛔ **What does NOT work, and must be stated plainly:**
- `Scriptable` does **not** stop the MOSS screen opening. `GameSession.HandleMoss` validates
  only that the terminal id string is non-empty (`GameSession.cs:347`).
- It does **not** stop the `systems` ledger computing. `ShipSystems.Compute` is a pure report
  over live state (`GameSession.cs:1450`) and gates on nothing.
- It does **not** stop an already-installed program running. `ScriptRuntime.Tick`
  (`ScriptRuntime.cs:155-188`) consults **no device at all** — not `Powered`, not `Condition`,
  not `Scriptable`. The gate is entirely at bind time.
- Nothing in `sim/` gates MOSS on a `DeviceKind.Terminal` existing. A terminal is not even
  MOSS-addressable as a device (`MossBindings.cs:29-42`).

⇒ ~~**"Restore MOSS first" is honestly modelled as *"you cannot install or change a program
until you have spent a ControllerModule on a terminal"*, and nothing more.**~~
**⇒ REVISION 2 — "AND NOTHING MORE" IS NOW FALSE, BY OWNER DECISION. The thaw is the second
thing `Scriptable` gates, and it is the more important one.** A darkened *screen* is still a
client-side presentation over the same flag; what changes is that **the flag now stands between
the player and seven people.** That makes the four ⛔ bullets above load-bearing rather than
pedantic, and W5 must close the ones that matter:

| ⛔ shipped hole | does it matter for the THAW? | what W5 does |
|---|---|---|
| `Scriptable` does not stop the MOSS *screen* opening | **no** — the screen must open, to *show* the refusal | nothing |
| it does not stop `ShipSystems.Compute` | **no** — a read-only report is right | nothing |
| it does not stop an installed program running | **no** — no program can thaw (see below) | nothing |
| nothing gates MOSS on a `Terminal` *existing*, and a terminal is not MOSS-addressable | **YES** | `ThawCommand` validates the terminal by name, **sim-side** |

⚠️ **AND ONE DESIGN DECISION FALLS OUT OF THE THIRD ROW, WHICH IS WHY IT IS LISTED.**
`ScriptRuntime.Tick` consults **no device at all** — not `Powered`, not `Condition`, not
`Scriptable`. So if the thaw were a **DSL verb** (a `CryoPodAdapter` registered in
`MossBindings`), a ten-line MOSS program could **empty the cryo bay unattended**, and there is
no device state the runtime would check to stop it. **That is the exact opposite of the owner's
"only one after the other".**
⇒ ⭐ **THE THAW IS A MOSS *SCREEN* VERB, NOT A MOSS *LANGUAGE* VERB.** It is a new `moss` op
beside `sys`/`exec`/`open`/`set`/`audit` (`GameSession.HandleMoss`), it lowers to an
`ISimCommand`, and **no adapter is registered for a `CryoPod`.** This is also the
automation-souls principle (`control, not conveyance`) landing on a concrete case.

---

### Beat-sheet summary — what must be built for the ONE-PAWN opening to work at all

| # | Thing | Beat | Wave | State |
|---|---|---|---|---|
| 1 | Author a device damaged (`Condition`, `Scriptable`) | 0, 5, 8 | W1 | 🟢 built, unmerged |
| 2 | Refuse jury-rig below a wreck threshold; the `Swarf` rung | 5, 6 | W2 | 🟢 built, unmerged |
| 3 | Carry `Condition` to the client | 1, 5 | W0 | 🟢 built, unmerged |
| 4 | The wrecked twins + the two capsules | 0, 5 | W0 | 🟢 built, unmerged |
| 5 | The wreck ship itself — **and no designations on it** | all | W3 | ❌ |
| 6 | **Say why an order is refused** | 3, 4, 5 | W4 | ❌ blocking |
| 7 | Split `＋ADD ROOM`; a `vent` verb on the Room Zoom | 4 | W4b | ❌ blocking |
| 8 | Cryo pods + the MOSS thaw + the gate + the cycle | 0, 7, 8 | W5 | ❌ |
| 9 | The `Degraded` bit (the eight spoiled resources) | 0, 5 | W9 | ❌ |
| 10 | `Regolith` → `Rubble` | fiction | W10 | ❌ |
| ~~11~~ | ~~Skin `'/'` (open door)~~ | ~~1~~ | ~~OD-7~~ | ✅ **closed — `'/'` is deliberately a gap** |
| ~~12~~ | ~~Decide the salvage rule~~ | ~~6~~ | ~~OD-1~~ | ✅ **decided: `Swarf`** |
| ~~13~~ | ~~Decide `＋ADD ROOM`~~ | ~~4~~ | ~~OD-2~~ | ✅ **decided: split it** |

---

## 3. The core loop

### 3.1 The loop, in one paragraph

**You wake up alone. Strip a dead machine for `Swarf`; spend the `Swarf` repairing the machine
that lets you push the pressure frontier out by one compartment; salvage what is now behind you;
climb the matter ladder until you can commission the MOSS terminal; and when the ship measurably
supports one more soul, spend Parts through MOSS to thaw one — and now you have twice the hands
and twice the draw.**

**Revision 2's one-line version: `SALVAGE → REPAIR → AIR → SALVAGE MORE → MOSS → A PERSON`.**
The person is the reward, seven times, and each one makes the next loop faster and the ship's
draw higher. **The first pass of that loop is performed by ONE pair of hands and costs ~3.4
crew-hours of bench time alone** (§2 beat 7).

The frontier is the game's map-level progress bar and it is already a real, hashed, visible
thing: `Room.PressureKPa`, `Room.O2Fraction`, `Room.CO2Ppm`, `Room.TemperatureK`. The lenses to
read it ship today.

### 3.2 Why the loop is stable rather than a runaway

Each thaw adds `o2_per_person_per_second = 3.04e-4` mol/s of draw and
`co2_per_person_per_second = 2.73e-4` mol/s of CO₂ (`atmosphere.def:17-18`), against a scrubber
that removes `0.001` mol/s (`atmosphere.def:20`) — i.e. **one working scrubber covers ~3.7
people**, and CO₂ is *not clamped* when breathing exceeds scrubbing (`AtmosphereSystem.cs:187`).
Crossing `co2_narcosis_ppm = 40 000` makes a compartment unbreathable, which makes it
unworkable, which is the loop's own punishment for over-thawing. **This is the negative feedback
the design needs and it is already implemented.**

Each thaw also adds hunger at `1/172 800` s⁻¹ and thirst at `1/86 400` s⁻¹ (`needs.def:26-27`),
against a `DaysOfFood` runway the ledger already reports honestly post-E0-9.

### 3.3 The thaw headroom test — and the constraint that shapes it

**The constraint.** A thaw must be *validated inside the sim* — `ISimCommand.Execute(Simulation)`
(`ISimCommand.cs:9-12`) — so the headroom computation must read deterministic sim-side state and
cannot read the host-side ledger cache.

**⛔ And it cannot simply call `ShipLedger.Sample` either, for a reason that is easy to get
wrong.** `ShipLedger` lives at `sim/Sim.Core/ShipLedger.cs` and `Commands.cs` lives at
`sim/Sim.Core/Commands/Commands.cs` — **the same module.** `ArchitectureBoundaryTests.cs:519`
denies *every* file under `sim/Sim.Core` except `ShipLedger.cs` the identifier `ShipLedger`,
deliberately without a scope filter, because a scope filter was the trap that let a helper on a
tick path through. A `ThawCommand` naming the ledger goes **RED**, and correctly: `Sample`
allocates an `int[]` per call (`ShipLedger.cs:441`) and a command executes inside
`Simulation.Tick` (`Simulation.cs:248-250`).

**⇒ The design: a new zero-alloc `ThawGate` static in `sim/Sim.Core/`, reading the same live
state the ledger reads, pinned by a test that requires the two to AGREE on a driven ship.**
One source of truth by *assertion*, not by call. Four terms, each already live state:

| Term | Reads | Rule |
|---|---|---|
| **Air** | Σ `Room.O2Moles` over rooms ≥ 50 kPa, ÷ `living × o2_per_person_per_second × 86 400` | ≥ a def'd floor in crew-days |
| **Scrubbing** | count of `DeviceKind.Scrubber` with `Powered && IsOperational`, × `scrubber_mol_per_second`, vs `(living + 1) × co2_per_person_per_second` | strict surplus |
| **Water** | Σ `Device.StoredLiters` over `WaterTank` | ≥ a def'd per-crew floor |
| **Food** | `Units[Potato]` ÷ `(living + 1) × FoodUnitsPerCrewPerDay` | ≥ a def'd day floor |
| **The pod** | `IsOpen == false && Powered && Condition ≥ machines[CryoPod].fail` | all three (⚠️ **and see OD-9** — the working assumption is a stricter repair floor) |
| **The console** *(rev 2)* | a `DeviceKind.Terminal` whose `Name == tid`, with `Powered && IsOperational && Scriptable` | all four |
| **The cycle** *(rev 2)* | no pod anywhere with `Progress > 0` | one at a time |
| **The price** | `LooseMatter.Affordable(sim, Parts, thaw_cost)` | all-or-nothing, charged last |

⚠️ **THE CONSOLE TERM IS WHY THE GATE CANNOT LIVE IN THE HOST.** The MOSS screen is host-side
(`GameSession.HandleMoss`), and it would be very easy to check "is this terminal alive?" there,
where the device is already in hand. **Do not.** A host-side check is not replayed on load, not
folded into the hash, and not present in the TUI — so the same thaw would be legal on one
surface and not another. **Every term above is resolved inside `ThawCommand.Execute(Simulation)`
from sim state, and the host's only job is to send the `tid` and render the reason it gets
back.**

**⚠️ MEASURED, AND IT KILLS THE OBVIOUS FIRST DRAFT: standing O₂ is not a scarcity in this
sim.** `ledger --ship grid` reports **`O2 99.0 crew-d`** at h1, still **98.6 crew-d** at h56 —
i.e. the ship holds ninety-nine crew-days of standing oxygen and is losing it at a rate the
ledger itself refuses to band (`[not depleting]` for most hours). An O₂-crew-days gate would
permit all eight thaws in the first minute. **The binding terms are SCRUBBING and FOOD.**
Grid's food runway at h1 is **2.07 d** and its water reads **`[0.64 d]`** at h2 before the loop
catches up — those are numbers that can say no.
*(Command: `~/.dotnet/dotnet run --project hosts/scenario -c Release -- ledger --ship grid`.)*

**Why the terms are a conjunction and not a score.** A weighted score is a number the player
cannot act on. Four named terms, each of which independently says NO with a reason, is a screen:
*"THAW REFUSED — scrubbing covers 3 of 4."* That is also the only shape that survives §6 R-6.

### 3.4 Gradual thawing — **WHERE, WHEN, and HOW MANY AT ONCE are three different gates**

> **REWRITTEN IN REVISION 2.** The owner's mechanic does not *replace* the headroom decision —
> it **locates** it. Revision 1 conflated the two; they are orthogonal and each fails
> differently, so the doc now names all three and says which does what.

| gate | question it answers | mechanism | how it says no |
|---|---|---|---|
| **WHERE** | *through what?* | the **console term** — a repaired, powered, commissioned `Terminal` | *"NO CONSOLE — MOSS is offline"* |
| **WHEN** | *may I, now?* | the **headroom terms** + the **price** | *"THAW REFUSED — scrubbing covers 3 of 4"* |
| **HOW MANY AT ONCE** | *can I do all seven?* | the **cycle** | *"POD 3 IS CYCLING — 4 min"* |

**WHERE is a one-off matter price** (one `ControllerModule`, §2 beat 7) and once paid it stays
paid. **WHEN is re-evaluated on every thaw** and is what makes the ship's state matter. **HOW
MANY AT ONCE is the owner's explicit pacing requirement** and is the one this revision had to
choose a mechanism for.

**The owner's stated goal is "so the user does not have to manage 8 pawns right from the
beginning." Is one-at-a-time a HARD RULE or an EMERGENT consequence of cost?**

| option | what enforces it | how it fails |
|---|---|---|
| **A — emergent only.** Price + headroom pace the thaws; nothing forbids two at once. | `thaw_cost` in Parts, and the four headroom terms. | **A prepared player empties the bay in one minute** — which revision 1 called "the reward for playing well" and which the owner has now, in effect, ruled against. And the failure is silent: nothing tells the player the pacing existed. |
| **B — hard rule, no new state.** A pod is single-use; the pacing curve is the *number of pods*. | authoring. | Does not pace anything. Eight pods still open in eight seconds. **Revision 1 recommended this and it does not meet the brief.** |
| **C — hard rule, a pod CYCLE.** Thawing sets `Device.Progress` on the pod; a `CryoSystem` counts it down; **no thaw is accepted while any pod is cycling.** | one existing hashed field + one new system. | Costs **P1/P2/P3** — registering a system folds its seed unconditionally (the W0-6 precedent, `CLAUDE.md`). |

⇒ ⭐ **RECOMMENDATION: C, and it is a hard rule.** Three reasons, in order of weight.
**(1)** The owner called this *"an important game mechanic"* and named the shape
(*"only one after the other"*) — a mechanic stated that plainly should be enforced, not
approximated by prices someone will retune later.
**(2)** It costs **no new hashed field**: `Device.Progress` is already hashed
(`Simulation.cs:464`) and already saved (DEVC v2), where `CraftingSystem` uses it for exactly
this shape — a countdown on a device.
**(3)** It is the only option that gives the client something to *draw*, which is beat 0's
countdown badge and the `CRYO CAPSULE · OCCUPIED` art's whole reason to exist.

**Take A as well, not instead** — the price and the headroom terms still shape *when*, and they
are what make the ship's state matter. C only stops the bay emptying in one gesture.

⚠️ **STATE THE COST PLAINLY: C makes W5 a five-pin wave.** A new `DeviceKind` already moves
P4/P5; the `CryoSystem` registration moves P1/P2/P3 on top. **That is one re-pin, not two, and
it is the reason W5 must run alone** (§4). Do not let a later package "just add a small system"
to a wave that was budgeted as pin-neutral.

---

## 4. Wave charter

**Determinism pins (all five, from `CLAUDE.md`), for the "which pin moves" column:**
`P1` scenario `--days 3 --seed 42` = `43345ff0c9d62684` · `P2` tick-3000 golden
`5a7224821810b478` · `P3` slice tick-3000 golden `7d846c14c5901e4d` · `P4` defs **defaults**
`62a1bb2633c447be` · `P5` defs **rules-inclusive** `4c15dffe98a2cda8`.
*(P1 and P5 verified holding in this worktree by running the twin and reading the `defs:` line.)*

**Equality-pinned guards that a lane may have to bump:**
`client/test/surface-boundary.test.js` (`KNOWN_GAPS`, `KNOWN_GAPS_SEALED`, the console id census,
four `hud.js` widget counts, `SHIP_STATE_REACH`, `CREW_INTERACTION`) ·
`tests/Perilune.Tests/SurfaceBoundaryTests.cs` (every `WireFormat` channel needs a consumer in
`client/src/main.js`) · `NO_DEVICE_GLYPH_ART` / `NO_GROUND_ITEM_SPRITE` /
`NO_FURNITURE_SPRITE` ledgers in `client/src/items/glyph-map.js` ·
`tests/Perilune.Tests/ArchitectureBoundaryTests.cs` `LedgerOwners`.

---

### **W0 — condition wire + wrecked art** 🟢 **BUILT, GATED, UNMERGED** *(rev 2)*

~~Two lanes are building this in parallel with me.~~ **Both landed.** What revision 1 asked for
as an interface, and what actually shipped:

| revision 1 asked for | shipped |
|---|---|
| a view-only sparse channel carrying per-device `Condition`, x-first | ✅ `hosts/web/WireFormat.Devices.cs`, `[x,y,deck,kind,cond,oper]`, read from `sim.Devices` directly — **`WireFormat.cs` has a ZERO diff** (it was already `partial`) |
| a client join from `(kind, condition)` derived from the registry | ⏸ **deliberately NOT built yet — nothing draws the data.** The channel is exposed to the Room Zoom as `deviceConditionAt(tx,ty)` and stops there. |
| no sim-side change, P1–P5 hold | ✅ |
| 70 wrecked twins + 2 capsules | ✅ `lane/wrecked-art`: `client/src/items/wrecked.js`, `client/src/items/cryo.js`, gallery shots in `docs/design/shots/` |

⚠️ ⭐ **A CONDITION CAME WITH IT, AND IT IS BINDING ON THIS PLAN, NOT ON THAT LANE.**
`WireFormat.Devices.cs`'s header records that the channel costs **~6 % of every render, two
thirds of it in serialization**, and makes **a delta / dirty-version scheme a written CONDITION
on whichever lane FIRST DRAWS THE DATA.** On this plan that lane is the wrecked-twin join.
⇒ **Budget the delta scheme inside the art-join package. It is not a follow-up and it is not
optional; it was accepted as a condition of merging the channel at all.**

⚠️ **Utility overlays are deliberately NOT on the channel** (Conduit + Pipe = **1 104 of grid's
1 250 devices**, measured by that lane; `wear = 0` in the defs, and not tile-resident). **This
is also the number that bounds the wreck's damaged set: at most 146 devices, not 1 250** — see
§2 beat 5.

⚠️ **Loose resources still have no condition and cannot get one this way** — `ItemStack` has no
such field and the `items` channel carries `[x,y,deck,kind,count]`. The eight wrecked-resource
pieces therefore have **no key to render off**. ~~§7 OD-3.~~ **DECIDED — this is now W9, the
`Degraded` bit.**

---

### **W1 — author a device damaged, and dark** 🟢 **BUILT, GATED, UNMERGED** (`lane/damaged-authoring`)

**Goal.** Let a `ShipPlan` say a device boots at `Condition = 0.14` with `Scriptable = false`.
**Shipped as** `float? Condition` and `bool? Scriptable` on `DeviceSpec` (`sim/Sim.Gen/ShipPlan.cs`),
plumbed through `ShipPlanBuilder`, `RoomDresser`, `RoomOutfitter` and `AuthoredShips`.
**Pins: NONE moved — MEASURED, not predicted.** `git diff main...lane/damaged-authoring --
ci.sh tests/Perilune.Tests/Golden/ content/` is **0 lines**.

> ### ⛔ **THE `-1f` SENTINEL WAS WRONG AND IS RETRACTED — and the way it was wrong is worth
> keeping, because it is a shape that will recur.**
>
> ~~**The sentinel is load-bearing.** `DeviceSpec` is a struct, so `default` gives
> `Condition = 0f`, which would wreck every device on every existing ship. Use a sentinel
> (`Condition = -1f` meaning "leave the field initialiser alone") …~~
>
> **The first sentence was right and the conclusion drawn from it was exactly backwards.**
> `DeviceSpec` is a struct, so every spec that any authored ship emits comes into existence as
> **zeroed memory** — whether written `new DeviceSpec { … }` (an object initialiser runs the
> implicit parameterless ctor, which zeroes), `default(DeviceSpec)`, or as an element of a
> `DeviceSpec[]`. **Zeroed memory reads `0f`, never `-1f`.** So a `-1f`-means-unset sentinel
> would have been **missed on every one of the ~1 250 specs that needed it, and hit only on the
> ones that opted in** — i.e. it would have booted the entire repo **wrecked** while looking, in
> the diff, like a careful safety measure. The repo pins `<LangVersion>9.0</LangVersion>` in all
> four csproj, which forbids struct instance field initialisers outright; **and the conclusion
> holds even without that pin, because `default(T)` and array elements bypass a field
> initialiser whether or not the language allows one.**
>
> ⇒ **`Nullable<float>` is the one encoding whose "unspecified" state survives all three ways a
> struct comes into existence.** It costs nothing — it is itself a struct, and authoring is not
> a tick path.
>
> ⇒ **The general rule, and the reason this box exists: a magic-value sentinel on a STRUCT field
> is only safe if the magic value is the zero value.** Reach for `Nullable<T>` instead, or make
> "unset" mean `0`.

**What still stands from revision 1's charter**, and did ship: the acceptance test that builds an
unmodified `PeriluneGrid()` and asserts every device reads `Condition == 1f` and
`Scriptable == true`; no touch to `Device.cs`; no third field.

---

### **W2 — the recovery rule + the salvage rule** 🟢 **BUILT, GATED, UNMERGED** (`lane/recovery-economy`)

**Shipped as TWO commits**, and they are the halves this document called W2 and OD-1:

1. `wear.wreck_threshold = 0.25` — below it an empty-handed jury-rig is **refused at
   recruitment**, exactly where revision 1 said to put it and for the reason it gave (refusing in
   the work phase would burn 900 s per attempt and recreate the livelock the worksite package
   just closed). Plus a **fourth rung**: `wear.swarf_service_condition = 0.45`, offered **only**
   to a machine already below the threshold.
2. `ItemKind.Swarf = 9` + `deconstruct.device_swarf = 1` — a wrecked device now yields 1 Swarf
   where it used to yield nothing. **OD-1 option B, as recommended.**

**Pins — MEASURED on the branch, and revision 1's prediction was WRONG in the safe direction.**

| pin | revision 1 predicted | measured |
|---|---|---|
| P1 scenario · P2 tick-3000 · P3 slice | *"must be MEASURED; entirely plausible they move"* | **HELD** — `git diff main...lane/recovery-economy -- ci.sh tests/Perilune.Tests/Golden/` is **0 lines** |
| P4 defs defaults | move | **moved** `62a1bb2633c447be` → **`df93cbd628644785`** |
| P5 defs rules-inclusive | move | **moved** `4c15dffe98a2cda8` → **`fc65c6682d5bee59`** |

⚠️ **Those two values are branch-local and go stale the moment anything else merges ahead of
them.** They are recorded here so the integrator has a starting point, **not** so a later lane
copies them. **Re-measure.**

**Three things the shipped package got right that revision 1 did not think of:**
- **The Parts arm is untouched at every Condition**, so *letting a machine rot* still costs you
  the difference between 2 Parts and 1. The cliff stays honest for rot; only its far side
  stopped being empty.
- **`device_swarf = 1` and not 2, for monotonicity.** At 2, a wreck would pay two 0.45 services
  against a half-condition machine's one 1.0 overhaul — **the cliff would invert and optimal
  play would be to let everything rot before stripping it.**
- **The boundary is derived, not written down.** The code pays Swarf exactly when the Parts
  figure floors to 0, so the split tracks `device_parts` automatically and there is no `0.5`
  anywhere in code or defs.

⚠️ **The refusal is still SILENT** — the same §13.21 shape as the worksite rule, and it is now
the **third** one (worksite · no-consumable · thaw). **W4 must surface it, and W4 is blocking for
this reason as much as for its own.** §6 R-1.

⚠️ **OWNER DECISION 5 IS A REAL COST AND IT IS ACCEPTED, NOT PATCHED.** `wreck_threshold = 0.25`
sits **above** `Terminal`, `Light` and `WaterTank`'s `maint = 0.20`, so all three have an
**empty free-repair band on every ship in the game** and can never be bodged without matter. The
owner took this knowingly: **a `Terminal` is the MOSS box, so restoring MOSS genuinely costs
Parts** — and after the thaw mechanic that is a feature, not a wart (§2 beat 7). **Do not
"fix" it by lowering the threshold without re-reading this paragraph.**

---

### **W3 — `--ship wreck`**

**Goal.** A new authored ship. **`--ship grid` is untouched** so every measured number in the
economy docs stays comparable (owner decision 1).
**Files.** `sim/Sim.Gen/AuthoredShips.cs` (a new `PeriluneWreck()` + a `WreckSeed`) ·
`hosts/tui/SimHost.cs:12` (`ShipChoice.Wreck`, appended) · `:108-111` (routing) · `:87-90`
(default seed) · `hosts/tui/DumpMode.cs:208-220` (`ParseShip`) · `hosts/web/Program.cs:54-65` ·
`hosts/scenario/Program.cs:103/200/871` (three verbs) .
**Pins.** **NONE** — a ship nothing pins. Explicitly **do not** flip any host default here.
**What it authors** (all expressible today except the two W1 fields):
- the grid lattice (`SlotGridPlanner`, 8 slots/deck) — reuse it; it is the standard surface's
  geometry and the Overview knows how to draw it;
- **the cryo bay**: one typed, pressurised, powered compartment on deck 0 with 8 pods
  *(pods need W5; author the bay in W3 and the pods in W5)*;
- **every other compartment airless** — omit from `plan.PressurizedAnchors`;
- **every wear-bearing device at 0.02–0.35 `Condition`, `Scriptable = false`** (W1);
- **debris** in the compartments the raiders cut through — `'R'` in `DeckRows`, undesignated;
- **corpses** — `ItemSpec { Kind = Corpse, Label = "<name>" }`, the crew who were awake;
- **spoiled stores** — ~~see §7 OD-3~~ **W9's `Degraded` bit; until W9 lands, author them as
  ordinary stacks and accept that they look fine**;
- **exactly one goal** (`GoalKind`), matching grid's single-goal precedent (`AuthoredShips.cs:1169`).
**⚠️ The one thing to get right and the reason this wave is not trivial.** `--ship grid` boots
**1 250 devices**, of which **1 104 are utility overlays — 1 088 Conduit + 16 Pipe** *(MEASURED
by `lane/device-condition`, which built the census to justify excluding them from its channel;
the 1 250 total is independently MEASURED — `occupancy --ship grid --days 2 --maint-audit`
prints `devices in bad air 226 (of 1250)`, re-verified this revision)*. **Conduits, pipes and
ladders must NOT be wrecked** — they are `0 0 0 0` in `machines.def`, they are what makes the
ship traversable and powerable, and wrecking them would need a different mechanism anyway.
~~The wreck's damaged set is the ~120 wear-bearing devices~~ ⇒ **the wreck's damaged set is at
most 146 tile-resident devices, and the wear-bearing subset of THOSE is what W3 must count and
publish. 146 is a bound, not a census.**

**⚠️ FOUR AUTHORING PRECONDITIONS THE ONE-PAWN OPENING ADDS (rev 2), each of them checkable:**

1. **NO DESIGNATIONS AND NO ZONES.** Not merely "don't zone a stockpile" (`MECHANICS.md` §13.18)
   — **nothing pre-painted at all.** With one pawn the dispatcher outranks eating, crafting and
   maintenance (§2.0), so a wreck that boots with work on the board boots with its lone crew
   member locked out of the systems the premise is about.
2. **THE BOOT COMPARTMENT MUST CONTAIN AT LEAST ONE STRIPPABLE WRECKED DEVICE.** With W2 shipped,
   *every* repair below 0.25 needs a consumable, and on a fresh wreck the only consumable in
   existence is `Swarf` from a strip. No strippable device in breathable air ⇒ **the loop cannot
   bootstrap and the game is unwinnable from tick 0.** There is no circularity (stripping needs
   no bench and no consumable), but there is a hard precondition. **Assert it in a test.**
3. **AUTHOR FURNITURE PRISTINE** (or wait for W6). Furniture is `maint = 0`, so
   `MaintenanceSystem` never recruits for it, and `fail = 0`, so it works at any condition. **A
   smashed bed would be permanently unrepairable and fully functional** — §2 beat 5.
4. **THE CRYO BAY MUST BE SURVIVABLE WITHOUT PLAYER ACTION.** It is the only compartment the
   lone pawn starts in; if its air, power or thermal state can drift, the game ends while the
   player is reading the tutorial. **Census its temperature at day 1, 3 and 10** (§6 R-4).

**Must NOT.** Change `PeriluneGrid()`, `PeriluneSlice()` or `Perilune()` by one byte. Flip a
default. Zone a stockpile. Paint a designation.
**Acceptance.** `--ship wreck` boots; `occupancy --ship wreck --days 1` runs; **the ONE crew
member survives day 1**; the four preconditions above are each asserted; all five pins held;
`git diff` to the three existing authored ships is 0 lines. **Publish the wear-bearing device
count** — every later wave's pacing arithmetic depends on it and it is UNMEASURED until this one.
**Depends on:** W1 (merged). **This wave is large enough to split** into W3a (geometry + air +
debris) and W3b (damage pass + stores) if the first `occupancy` run is a surprise.

---

### **W4 — the invisible-failure channel** *(REQUIRED, not a follow-up)*

**Goal.** The game says why an order is doing nothing.
**Files.** `hosts/web/WireFormat.Blocked.cs` (new; `WireFormat` is already `partial`, so
`WireFormat.cs` takes a **zero diff** — the `items` channel's pattern) ·
`hosts/web/GameSession.cs` (one builder + one dispatch line) ·
`client/src/ui/roomzoom-view.js`, `client/src/ui/overview-view.js` (a tint + a reason) ·
`client/src/main.js` (the consumer `SurfaceBoundaryTests.cs` requires).
**What it carries.** For every tile the player has designated (`Designated`, `Pending` strip,
`PendingBuild`) whose four approach tiles all fail `CanStageWorkerAt`: `[x, y, deck, reason]`,
x-first. Read from `sim.World` + `WorksiteSafety` **directly, never from the projection** (the
`marks` lesson). Reasons, from `AtmosphereSafety.IsBreathable`'s four branches
(`SafetySystem.cs:13-19`): `vacuum` · `thin` · `co2` · `cold`/`hot`. Add W2's reason as a fifth:
`no_consumable`.
**Pins.** **NONE** — view-only, host-side, nothing in `sim/` changes.
**Guards.** `SHIP_STATE_REACH` and the WireFormat-consumer census both move by one; both are
equality pins and both are ratified in review.
**Cost, to be MEASURED not argued.** Compare `marks` (+61 µs/render forever) and `items`
(grid 7 rows / 124 B / ~0.9 µs against a ~392 µs render). This channel is **empty on a healthy
ship** — measured: `unstageable dig/strip/build 0 / 0 / 0` on grid at 12 days — which is the
`zones` shape, not the `marks` shape.
**Must NOT.** Read the projection. Change `CanStageWorkerAt`. Widen the channel to "every tile"
(1 250-tile decks × 8).
**⚠️ Trap warning, sixth shape.** Any predicate here over "what a glyph resolves to" is defeated
by `GLYPH_SUBSTITUTE`. **Do not build this off glyphs.** It is a tile-state channel.
**Acceptance.** Paint a dig in an airless compartment on `--ship wreck`, in a **browser**, and
photograph the tile saying why. Assertions alone are not evidence for this one — that is the
`marks` lesson and the invisible-feedback lesson, both binding.
**Parallel:** with W1, W2, W6. **Blocking:** the wreck is not shippable without it.

### **W4b — ⭐ PROMOTED: `＋ADD ROOM` SPLITS. NAMING IS FREE, AIR IS EARNED.**

> ~~*(small; may fold into W4)*~~ **NO LONGER SMALL AND MUST NOT FOLD INTO W4.**
> **Owner decision (rev 2), binding:** pressurising stops being part of the `＋ADD ROOM` gesture
> and becomes **a working, powered, repaired vent moving gas over time.** This is OD-2 option C,
> decided. **It is the change that makes the pressure frontier a loop rather than a formality**,
> and it is therefore the second most important wave in this document after W5.

**Goal, in two halves that must land together or the game breaks.**

**HALF 1 — take the wand away.** `AddRoomCommand` (`sim/Sim.Core/Commands/Commands.cs:600-666`)
today does three things; it keeps only the first.

| step | what it does now | after |
|---|---|---|
| 1. name + type | `rooms.SetAnchor(_anchorName, _probe, _type)` | **kept, unchanged — this is the free part** |
| 2. force the doors | for every bordering `Door`: `d.IsLocked = false;` then `d.IsOpen = true` + a `DoorStateChangedEvent` | **DELETED** |
| 3. make the air | `RoomState.Pressurize(room)` — 101.3 kPa, 21 % O₂, from nothing, free, instant | **DELETED** |

**HALF 2 — give the player the vent.** Wire `SetDeviceStateCommand`'s `IsOpen` toggle
(`Commands.cs:32`) to a Room-Zoom affordance on `AirVent` — and on `Door`, which is also
console-only on the standard surface today. **Without half 2, half 1 makes air unobtainable on
every surface except a text terminal.**

**⚠️ THE LOAD-BEARING PART IS NOT THE `Pressurize` DELETION. IT IS THE REJECTION PREDICATE.**
The command's double-commission guard is `if (room.TotalMoles > 0) return;` — *"already a live
(pressurised) room"*. **After the split, "named" and "has air" stop being the same thing**, so
a named-but-airless room is a legitimate state and `TotalMoles == 0` no longer means "not yet
commissioned". ⇒ **the guard must move from gas to ANCHOR: refuse if this room already has an
anchor.** Miss this and a player can re-type an allocated room forever, and — worse — re-type a
*furnished* one that happens to have been vented. **This is the single most likely way to ship
this wave wrong.**

**What it breaks, named so nobody discovers it in review.**
`tests/Perilune.Tests/AddRoomCommandTests.cs` pins the current behaviour in two tests, and
**both change meaning, not merely value**:
- `CommissionEmptyHall_IsDeterministic_AndMakesTheSlotALiveRoom` asserts
  `hallRoomAfter.TotalMoles > 0` — **that assertion INVERTS.** Its anchor assertions
  (`anchor.Name`, `anchor.Type`, `RoomIdAt`) all survive unchanged, and they are the ones that
  were always testing the right thing. **Rename the test**: it no longer makes a "live room".
- `Commission_IsRejected_OnAnAlreadyLiveRoom` is built on the gas predicate. It must become
  `Commission_IsRejected_OnAnAlreadyNamedRoom`, **and it needs a second leg**: rejected on a
  furnished (gassed) room *and* on an allocated (airless, named) one. ⚠️ **Run each leg with the
  other blinded** — `assert` throws, so a dead second leg is indistinguishable from a live one
  (the fifth trap shape, `CLAUDE.md`).

**What it fixes for free.** Deleting step 2 is the fix for the owner's *"the doors vanish when
you allocate a room"* report. Combined with the door-art lane (`'+'` → `sliding-door`, `'X'` →
`blast-door`, `'/'` deliberately a gap), an allocated compartment will draw **shut doors**,
which is exactly the pressure-frontier readout the wreck needs. **One command, two owner
reports.**

**What it costs on `--ship grid`, stated honestly.** Grid's *boot* is unaffected — its rooms are
pressurised by `ShipPlanBuilder`, not by this command. Grid's *play* changes: **a commissioned
hall now starts airless**, and with the worksite-safety rule that means a player who allocates a
room and paints work in it gets **silence**. ⇒ ⭐ **W4 IS A HARD PREREQUISITE OF W4b, ON GRID AS
WELL AS ON THE WRECK.** Landing W4b first ships a regression to the one standard surface.

**Pins.** **P1/P2/P3 must be MEASURED.** No hashed *field* changes, but the command's effect on
door state and room gas is hashed state, so any pinned run that drives it moves. Nothing in the
three pinned runs calls `AddRoomCommand` today — **verify, do not assume.** P4/P5 hold unless a
def scalar lands with the vent verb.

⚠️ **The verb cannot be ledgered as a gap.** `KNOWN_GAPS` is **empty** and
`KNOWN_GAPS_SEALED = ['dig', 'stockpile', 'strip']`
(`client/test/surface-boundary.test.js:133-144`) — the ratchet has one direction left, so a new
key **fails**. The verb gets ported or it does not exist.
**Verb parity is not sufficient** — port the *feedback* too (did it open? is it powered? is it
operational? **is it repaired?**), which is the binding lesson from WP-6.

**Acceptance.** In a **browser**, on `--ship wreck`: allocate a compartment, watch it stay
airless and its doors draw shut; open a repaired, powered vent; watch pressure climb and the
compartment become workable. **Photograph all three states.** Plus a driven check of revision 1's
UNMEASURED fill-time arithmetic (≈208 s for a 60-tile compartment at
`vent_mol_per_second = 30`) — **if a compartment takes twenty sim-minutes to fill, this wave has
a pacing problem and the number must be found before the art is drawn, not after.**

---

### **W5 — ⭐ THE THAW: `DeviceKind.CryoPod` + `CryoSystem` + `ThawCommand` + `ThawGate`, THROUGH MOSS**

> **REWRITTEN IN REVISION 2 around the owner's mechanic.** This is the largest wave in the plan
> and **it runs alone**: it moves **all five pins**, it touches a spine file (`Device.cs`'s enum
> and `SystemStack`), and it is the one feature the whole opening is built to reach.

**Goal.** Eight souls in boxes; **one thawed at boot**; the other seven released **one at a time,
through a MOSS terminal the player had to repair, power and commission.**

**Files.** `sim/Sim.Core/Entities/Device.cs` (`CryoPod = 27`, **appended** — `IceMelter = 26` is
the current tail, verified) · `sim/Sim.Core/Entities/MachineDefs.cs` +
`sim/Sim.Core/Defs/SimDefs.cs` (a `Machines` row) · `content/core/SimDefs/machines.def` (a row) ·
`content/core/SimDefs/build.def` (`thaw_cost`) · `sim/Sim.Glyph/Glyphs.cs` (a glyph) ·
**`sim/Sim.Core/Systems/CryoSystem.cs` (new)** · **`sim/Sim.Core/SystemStack.cs` (registration)**
· `sim/Sim.Core/ThawGate.cs` (new) · `sim/Sim.Core/Commands/Commands.cs` (`ThawCommand`) ·
`hosts/web/GameSession.cs` (a new `moss` op + a `CitizenThawedEvent` observer) ·
`client/src/ui/moss-screen.js` (the pod list) · `client/src/items/cryo.js` (🟢 already built) ·
`sim/Sim.Gen/AuthoredShips.cs` (8 pods in the bay).

---

#### W5.1 — What new sim state a pod needs

**⭐ NO NEW `Device` FIELD.** Every concept lands on a field `Device` already hashes and saves:

| Concept | Field | Already hashed | Already saved |
|---|---|---|---|
| occupied / open | `IsOpen` | `Simulation.cs:454` (b8) | DEVC v1 |
| who is inside | `Name` | `:469` | DEVC v1 |
| pod damaged (⚠️ **OD-9**) | `Condition` | `:466` | DEVC v3 |
| pod unpowered | `Powered` | `:456` (b10) | DEVC v1 |
| **the cycle** *(rev 2)* | **`Progress`** | **`:464`** | **DEVC v2** |

**A frozen soul is NOT a `Citizen`.** It is a named, closed pod. This avoids a `Frozen` bit on
the citizen flag word — which would have moved all three state pins **and** bumped the CITZ save
chapter — and it avoids eight inert citizens distorting every `LivingCrew` denominator in the
ledger from tick 0. **That reasoning stands and is the best part of revision 1's W5.**

> ### ⛔ **BUT "NO NEW HASHED SIM STATE ⇒ ONLY P4/P5 MOVE" IS RETRACTED.**
> ~~**P1/P2/P3 must hold** and that must be measured: no existing ship has a pod, so nothing
> should move.~~
>
> **The pin move does not come from a field. It comes from a SYSTEM.** The owner's *"only one
> after the other"* is enforced by a pod cycle (§3.4 option C), a cycle must be counted down by
> something, and that something is a new `CryoSystem` registered in `SystemStack`. **Registering
> a system folds its seed unconditionally — that is exactly how W0-6 moved all three state pins
> by registering four EMPTY systems** (`CLAUDE.md`, "Determinism proof").
> ⇒ **W5 moves ALL FIVE PINS.** P4/P5 from the new `DeviceKind` (which grows `Machines`
> **and** `Recipes`, sized `new RecipeDef[d.Machines.Length]` — **two arrays for one enum
> member**) plus `thaw_cost`; P1/P2/P3 from the `CryoSystem` seed.
>
> **This is one re-pin, not two, and it is the reason W5 runs alone.** Budget it; do not
> discover it.

---

#### W5.2 — What the thaw validates, and where

**THE CONSTRAINT, restated because it is the thing that shapes the whole design.** A thaw is
validated inside `ISimCommand.Execute(Simulation)` (`ISimCommand.cs:9-12`), which runs inside
`Simulation.Tick`. It therefore **cannot read the host-side ledger cache**, and it **cannot call
`ShipLedger.Sample` either**: `ArchitectureBoundaryTests`'s `LedgerOwners` allows the identifier
`ShipLedger` in **exactly one file** (`ShipLedger.cs`), deliberately with **no scope filter**,
because a scope filter was the fourth trap shape. A `ThawCommand` naming the ledger goes RED, and
correctly — `Sample` allocates an `int[]` per call.

⇒ **`ThawGate`, a zero-alloc static in `sim/Sim.Core/`, reading the same live state the ledger
reads, pinned by a test that requires the two to AGREE on a driven ship.** One source of truth by
**assertion**, not by call. The full term list is §3.3; the three gates it composes are §3.4.

**The command's contract, in order, and every step resolves from sim state:**

1. **the pod** — exists, `Kind == CryoPod`, `IsOpen == false`, `Powered`, `Condition ≥ fail`
   ⚠️ **and, under OD-9's working assumption, `Condition ≥ a repair floor` — flag it, do not
   settle it**
2. **the console** — a `DeviceKind.Terminal` whose `Name == tid`, `Powered`, `IsOperational`,
   **`Scriptable == true`**. *This is the "MOSS is WHERE you thaw" gate and it is the whole
   reason `Scriptable` matters.*
3. **the cycle** — no pod anywhere has `Progress > 0`
4. **the headroom** — `ThawGate`'s terms; **scrubbing and food are the binding ones, MEASURED
   (§3.3): standing O₂ is 99 crew-days on grid and could never say no**
5. **the price** — `LooseMatter.TryPay(sim, ItemKind.Parts, thaw_cost)`, all-or-nothing,
   **charged last** so a refusal never bills the player
6. **a REASON for every refusal** — see W5.4

---

#### W5.3 — The thaw is a MOSS **screen** verb, not a MOSS **language** verb

⭐ **This is a design decision and it is not reversible later without breaking saves.**

The MOSS console already has a device-command path: `ExecConsole` runs one prompt line through
the DSL's own adapters, and `MossBindings.RegisterAdapters` is where a `CryoPodAdapter` would go.
**Do not put one there.** `ScriptRuntime.Tick` consults **no device at all** — not `Powered`,
not `Condition`, not `Scriptable` — so a ten-line installed program could **empty the cryo bay
unattended**, with nothing in the runtime able to stop it. That is the precise opposite of the
owner's *"only one after the other"*, and it is also `control, not conveyance` (the
automation-souls principle) landing on a concrete case.

⇒ **A new `moss` op, beside `sys` / `exec` / `open` / `set` / `audit` in
`GameSession.HandleMoss`, carrying `tid` + the pod's name. It lowers to a `ThawCommand`.
NO adapter is registered for a `CryoPod`, and `MossBindings.cs`'s switch is not touched.**

---

#### W5.4 — How a thawed crew member enters the world

1. `CryoSystem` sees a pod whose `Progress` has run out. It sets `IsOpen = true`, clears
   `Progress`, and calls **`sim.AddCitizen(pod.Name, tile)`** (`Simulation.cs:197-202`), which
   takes its id from the already-hashed, already-saved `_nextEntityId`.
2. **The tile.** The pod's own tile is fine — devices do not block (`IsWalkable` gates only on
   `Door`, and no shipped machine sets `Blocks`) — but prefer the nearest walkable 4-neighbour so
   the new pawn is not standing inside furniture in the art. **Deterministic tie-break required.**
3. **The persona.** ⚠️ **A GAP REVISION 1 GLOSSED.** `AuthoredShips.PopulateSlice` weaves minds
   into an authored crew **at boot**; a thaw happens **at runtime**, so nothing attaches a mind.
   ⇒ **`CryoSystem` publishes a `CitizenThawedEvent`; the host observes it and attaches the
   persona from the roster.** The sim must remain playable with no mind attached at all (the
   offline invariant), so this is a host-side enrichment, never a sim dependency.
4. **The Chronicle.** The event is written, exactly as `DeconstructCompletedEvent` is. **Waking a
   named person is the most narratively significant thing that happens in the first six hours and
   it must be in the log.**
5. **Save/load.** A thawed crew member is an ordinary `Citizen`; an unthawed pod is an ordinary
   `Device`. A pod **mid-cycle** is a `Device` with `Progress > 0`, which DEVC v2 already stores.
   **Round-trip a mid-cycle ship and require byte-identity** — that is the one state this feature
   invents and it is the one a save test will otherwise miss.

**Must NOT.** Insert into `DeviceKind` (append only). Add a field to `Citizen` or to `Device`.
Call `ShipLedger` from `ThawGate`. Register a `CryoPod` adapter in `MossBindings`. Put the
console check host-side. **Price `thaw_cost` in `ControllerModule`s** (§2 beat 7).

**Acceptance.** Thaw refused with a **named** reason for each of the six contract steps, driven,
one test per reason; permitted on a prepared ship; Parts charged exactly once and **not at all on
a refusal**; a second thaw refused while the first pod is cycling; the pod reads `IsOpen = true`
afterwards and cannot be thawed twice; a save/load round trip of a **mid-cycle** ship is
byte-identical; all five pins re-measured and re-pinned **in this wave's own commit**.
⚠️ **`ThawGate`'s suite is where the SEVENTH TRAP SHAPE is waiting** — see §6 R-6. It is four
ratios, and a suite of ratio assertions cannot see a scale error.

**Depends on:** W3 (a ship with a bay), W4 (or the refusals are invisible).
**This wave is large enough to split**: W5a = pod device + cycle + art + authoring (pins move
here); W5b = `ThawGate` + `ThawCommand` + the MOSS screen (pin-neutral on top of W5a).
**⇒ SPLITTING IS RECOMMENDED**, precisely so the five-pin re-measure happens in the smaller,
duller half.

---

### **W6 — REST: give `Fatigue` a reducer, and a bed a purpose**

**Goal.** The owner asked for *"repair a bed"* as an early task. Today that task is decoration.
**MEASURED-BY-SOURCE, exhaustively:** `Citizen.Fatigue` has **exactly six references** in
non-test code — one write (`NeedsSystem.cs:154`, monotone `Math.Min(1f, …)`), one mood read
(`:166`), the hash (`Simulation.cs:404`), save/load (`SaveWriter.cs:253`, `SaveReader.cs:254`),
and one TUI display (`InspectorModel.cs:85`). **No decrement anywhere.** It saturates at 1.0
after ~16 h (`fatigue_per_second = 1/57 600`) and stays there for the rest of the run, costing
a flat 25 mood forever. `DeviceKind.Bed = 17`'s own comment says it: *"rest anchor; behavior
lands with the needs pass"* (`Device.cs:23`). `machines.def:44` gives it `0 0 0 0`.
**Files.** `sim/Sim.Core/Entities/Citizen.cs` (`JobKind.Sleep = 12`, **appended**) ·
a new `sim/Sim.Core/Systems/RestSystem.cs` · `sim/Sim.Core/SystemStack.cs` (registration) ·
`content/core/SimDefs/needs.def` (a threshold + a recovery rate) · `SimDefs.cs` · `DefsParser.cs`.
**Pins.** **P4 and P5 move** (two def fields). **P1, P2 and P3 WILL ALL MOVE** — this changes
what crew do with their time on every ship, which is the point. Budget for it; it is the
largest determinism change since E0-5.
**⚠️ It changes the whole mood curve, and mood is not cosmetic.** `Mood` feeds `SocialSystem`'s
argument threshold, and `ShipMetrics.Morale` feeds `DirectorSystem.Tick` (`DirectorSystem.cs:80`)
which drives `_wearPressure` which `MachineWearSystem` reads (`MachineWearSystem.cs:48`).
**Removing a flat −25 mood penalty from every crew member on every ship will change machine
wear rates.** Say so in the package; measure it.
**Must NOT.** Land in the same milestone as W2 without measuring them separately — both touch
what maintenance does, and *"two lanes fixing the same function differently merge textually and
are wrong together"* is a standing lesson.
**Acceptance.** A driven test: a crew member at `Fatigue = 0.9` with a reachable, breathable bed
takes `JobKind.Sleep` and comes back below the threshold; with no bed, does not. Plus the
re-measured A1/occupancy curve on grid **before and after**, published side by side.
**Parallel:** with W4. **Independent of the wreck** — it is a general fix the wreck merely
motivates. It could land before the wreck ship and probably should, to get its pin move out of
the way alone.

⚠️ **TWO REVISION-2 ADDITIONS.**
**(a) `JobKind.Sleep` enters the one-pawn ladder, and it must enter it correctly.** §2.0 shows
the dispatcher outranks every out-of-band claimant. A `RestSystem` registered **after**
`JobSystem` gives you a lone pawn who strips walls until it drops; registered **before**, it
gives you one who sleeps through an emergency. **Neither is right, and the honest answer is that
`SafetySystem`'s pre-emption is the model to copy** — rest interrupts work above a hard
threshold, exactly as fleeing does. **Say which you built and measure it at one pawn.**
**(b) It is also the cheapest fix for the smashed-furniture lie** (§2 beat 5): if a `Bed` gets a
non-zero `fail`, a wrecked bed stops working, and W3 may author furniture damaged after all.
**That is a `machines.def` row change and it moves P4/P5** — fold it into this wave or leave
furniture pristine, but do not let the two waves each assume the other did it.

---

### **W7 — the RimWorld work-priority grid** *(own lane, AFTER the start ships — owner decision 4)*

**Goal.** A per-crew × work-type 1–4 priority table, RimWorld-shaped.
**What exists today: nothing.** `ECONOMY.md:474-482` calls the current arrangement *"the only
differentiation the system has, and it is an accident"*, and it is right. Ties resolve, in this
order: **distance** (strict `<`, `DigJobSource.cs:84-89` and three siblings) → **source
registration order** (`JobSystem.cs:71-80`: Dig, Haul, Build, Deconstruct) → **that source's own
board order** → **citizen entity store order** (`JobSystem.cs:134-141`). There is no skill, no
aptitude, no opt-out. The only per-crew gates are the binary `HoldPosition` (`Citizen.cs:73`)
and `OrderedMove && HasPath` (`:103`).
**The seam, which is the only part this document commits to.** `JobSystem.TryAssign`
(`JobSystem.cs:220-273`) already runs a strict-improvement tournament across sources for one
citizen. A priority table enters as a **per-(citizen, JobKind) multiplier or veto applied inside
that loop** — nothing else in the dispatcher needs to change, and `IJobSource` needs no new
method. `MaintenanceSystem` (`MachineWearSystem.cs:367-384`) and `CraftingSystem`
(`CraftingSystem.cs:475`) recruit *outside* that loop, by nearest-idle, and would each need the
same veto — **that is three call sites, and forgetting the last two is how this lane ships
half-done.**
**Pins.** All five. New per-citizen hashed state ⇒ CITZ save chapter version bump ⇒ P1/P2/P3;
def'd defaults ⇒ P4/P5.
**Must NOT** be started before the wreck start is playable. **Charter only.**

⚠️ **REVISION 2 — THE ONE-PAWN OPENING RAISES W7'S VALUE AND I AM STILL NOT MOVING IT.**
§2.0 shows that with one pawn the dispatcher's four boards outrank eating, crafting and
maintenance, and W7's veto is the only way a player could ever say *"stop stripping and go
eat"*. **But W7 moves all five pins, needs three call sites, and is the biggest lane in this
document; the wreck does not need it to be playable, because a wreck authors no designations and
a lone pawn therefore falls through to the out-of-band claimants by default** (§4 W3
precondition 1). ⇒ **W7 stays after W8. The owner should know the tension exists, and it is
recorded in §6 R-12 rather than resolved here.**

---

### **W8 — flip the default to `--ship wreck`** *(last)*

`hosts/web/Program.cs:44` and `play.sh`. Owner decision 1: **only when wreck is playable.**
Pin-neutral. The banner and `CLAUDE.md`'s "Play" section change in the same commit.

---

### **W9 — the `Degraded` bit on `ItemStack`** *(NEW in rev 2 — owner decision 3)*

**Goal.** The eight wrecked loose resources stop being a lie. **One flag bit on `ItemStack`**:
spoiled food does not feed, seized Parts need reprocessing, perished Seals do not service.
**This is OD-3 option B, decided, and the owner accepted its pin move deliberately.**

> ### ⛔⛔ **SPINE FILES. INTEGRATOR LANE ONLY. MUST NOT RUN CONCURRENTLY WITH ANY OTHER
> PIN-MOVING LANE.**
> `ItemStack`, the ITEM save chapter and `Simulation.HashInto` are all named in `CLAUDE.md`'s
> spine-file invariant. **P1/P2/P3 all move** — even an all-zero fold moves them, which is
> exactly what W0-1b measured when it folded thirteen saved-but-unhashed fields. **The def field
> ritual applies in full if any scalar lands with it (P4/P5).** And *"every saved field is hashed
> — add a field ⇒ save + hash + round-trip test in the SAME commit."*

**Where it bites, three consumers, each a real behaviour change:**
- `SustenanceSystem.TryStartEat` must not select a `Degraded` `Potato`.
- `MaintenanceSystem.FindNearestConsumable` must not select `Degraded` `Parts` or `Seals`
  — **the fourth rung's `allowSwarf` parameter is the pattern to copy**, it is one predicate.
- `CraftingSystem`'s input selection must not consume a `Degraded` input.

> ### ⚠️ **AND THE REPROCESSING BILL HAS NOWHERE TO RUN — THE IDENTICAL WALL `Swarf` HIT.**
> Owner decision 3 says degraded goods are *"reprocessed before they become Parts"*. **There is
> no station free to reprocess them.** `ProductionDefs.TryGetBill` resolves a station's bill at
> **ordinal 0 only**, and all three benches already carry one (`recycle_stock` on the
> SalvageRecycler, `fab_components` on the Fabricator, the `[recipes]` row on the MachineShop).
> A fourth conversion node **parses, checksums, is reachable, and never runs** — driven, not
> read, by `lane/recovery-economy`'s own tests. **Displacing an existing bill is not an option:**
> dropping `recycle_stock` kills Regolith → Scrap and with it every Part on every ship.
>
> ⇒ **Two exits, and they are not equal.**
> **(a) A fourth station kind** — one appended `DeviceKind` (`Reprocessor`), one bill, no
> selection rule, no new save state. **RECOMMENDED.** It is also good fiction: a wreck salvage
> bench is a thing you would build.
> **(b) Wait for E-PROD's bill-selection rule**, which needs per-station save state (which bill
> is mid-batch) — the `PROD` blob. **That is a programme, not a wave.**
>
> ⚠️ **UNTIL ONE OF THEM SHIPS, `Degraded` IS A ONE-WAY DEBUFF.** Say that out loud in the
> package. A player who cannot ever un-spoil anything has been handed a punishment with no verb,
> which is the same shape as every invisible-refusal defect in this repo.

**Also in scope.** The `items` wire channel grows one field
(`[x,y,deck,kind,count]` → `…,degraded`) — **it is the KEY the eight wrecked-resource art pieces
have never had** (§4 W0), and it closes OD-3. The `SurfaceBoundaryTests` consumer census and the
`items` tuple's own equality pins move by one; both are ratified in review.
**Depends on:** nothing mechanically. **Runs alone.**
**Best sequenced:** *after* W5, so the two five-pin waves do not collide, and *before* the
wrecked-resource art join, which is blocked on its key.

---

### **W10 — `ItemKind.Regolith` → `Rubble`** *(NEW in rev 2 — owner decision 4)*

**Goal.** The fiction's noun. `Regolith` is lunar-mining vocabulary inherited from moonbase; the
enum's own comment already calls it *"debris spoil from cleared sections"*, and `DigJobSource`
only ever offers work on a `TileDefs.Debris` wall. **There is no ore, no seam and no mining
anywhere in the sim.**

> ### ⛔ **RUNS ALONE — and not because of pins.**
> **It moves NO pin** (§1.3, measured: the numeric value stays `0`; P4 folds parsed *values*, not
> def *bytes*; P5 additionally folds `rules/*.moss` **source bytes** and the one shipped rule,
> `overheat_guard.moss`, names only `ship.heat` — **whole file read**). It runs alone because it
> touches **`sim/`, `content/`, client art ids and tests simultaneously**, so it conflicts
> textually with every other lane at once and a clean auto-merge would prove nothing.
> ⚠️ **`CLAUDE.md`'s standing lesson applies directly: a clean auto-merge is NOT a clean merge.**

**Surface, so the size is on the record**: the enum member · the glyph table · the client `ITEMS`
registry and its art id · **four independently-derived accept masks** (`ItemStack.cs:22-33`) ·
`BuildSystem.Material` · `ShipLedger`'s kind names · `production.def:118`'s `Regolith:4` ·
`deconstruct.def`'s prose · and every test string.
**Must NOT.** Renumber the enum. Change any yield, cost or rate "while we're here".
**Acceptance.** All five pins **measured** to hold; `git diff --stat` shows only renames;
**a driven save/load of a pre-rename save** — the byte enum is append-only and a rename must be
provably invisible to a save.

---

### Dependency graph *(rev 2)*

```
🟢 W0  condition wire + wrecked art ─┐   BUILT, unmerged
🟢 W1  damaged authoring ────────────┼──► W3 ──► W5a ──► W5b ──► W8
🟢 W2  wreck rule + Swarf ───────────┘      ▲       ▲
                                            │       │
   W4   the "why nothing happens" channel ──┴───────┘   BLOCKING for both
   W4b  ＋ADD ROOM splits + the vent verb ──┘           BLOCKING, and needs W4 first
   W6   REST ───── independent; moves 3 pins; land it ALONE
   W9   Degraded ─ independent; moves 3 pins; INTEGRATOR LANE; runs ALONE
   W10  Rubble ─── independent; moves 0 pins; runs ALONE (textual conflict, not determinism)
   W7   work priorities ──── after W8
```

**Merge order for what is already built:** W0 (client-only, safest) → W1 (pin-neutral) → W2
(P4/P5 — **the integrator re-pins**). Doing W2 last means exactly one defs re-pin for the three.

**Can run in parallel:** (W4, W6) · (W4, W3) once W1 is merged · (W3, W6).
**MUST run alone:** **W4b** (it changes a shipped command's contract and inverts two existing
tests) · **W5a** (five pins) · **W6** (three pins) · **W9** (three pins + spine files) ·
**W10** (touches every layer textually).
**NEVER parallel:** W2 with W6 (both change what maintenance does — the standing
*"two lanes fixing the same function differently merge textually and are wrong together"*
lesson) · **W5a with W6 or W9** (three concurrent state-pin moves cannot be attributed) ·
**W4b before W4** (it ships a silent regression to the one standard surface).

---

## 5. What this does to the economy programme

### 5.1 The position

> **The wreck start does not answer E0's failed gate — it makes A1 the wrong question, and it
> replaces the faucet decision with a better one. E1 stays gated, but on a different fork.**

### 5.2 E0's gate: measured, and diagnosed

`~/.dotnet/dotnet run --project hosts/scenario -c Release -- occupancy --ship grid --days 1`:

```
None 82.85 %   Dig 1.77 %   Craft 15.35 %   Maintain 0.00 %   Haul 0.00 %
h16 8.9 %  ·  h17–h24 all 0.0 %
A1 (busy at sim-hour 24, target >= 25 %):  work 0.000 %   FAIL
debris tiles left 40 (dig work remaining: 0) · stockpile tiles zoned 0
ground stock  Potato=211  Scrap=1  ControllerModule=8  Seals=16
```

**Grid is not matter-starved at hour 24. It is DEMAND-starved.** `ledger --ship grid` shows
matter *rising* the whole way: **63 u in 38 stacks at h1 → 236 u in 229 stacks at h24 → 356 u at
h48.** The board is empty because *nothing is designated*: 40 debris tiles remain with
`dig work remaining: 0` (they are behind sealed airless doors), zero stockpiles are zoned, and
`DigJobSource` is the only non-empty board at tick 0.

**⇒ A1 measures whether the crew are busy. On grid at h24 they are idle because the player has
not been asked to do anything.** That is a *content* failure, not an economy failure, and it is
the sixth costume of the A1 trap: a number that is honest about busy-ness and silent about
whether the game has a game in it.

### 5.3 What the wreck start actually supplies

**Demand, in quantity, from tick 0, with no player designation required.**
MEASURED anchors: grid completes **88 services in 6 sim-days** at **1.999 %** Maintain occupancy,
and **272 in 12 days** at **3.063 %** — the maintenance subsystem is running at a few percent of
capacity because grid boots every device at `Condition = 1f` (~~`DeviceSpec` has no Condition
field~~ — 🟢 **it does now, `lane/damaged-authoring`; grid simply does not use it**). A wreck
authoring **at most 146** wear-bearing devices below threshold puts up to
`146 × 900 s = 36.5 crew-hours` of Maintain work on the board **before the player clicks
anything** *(arithmetic over `wear.def:17`; the 146 bound is measured, the wear-bearing subset is
UNMEASURED pending W3)*.

⚠️ **AND REVISION 2 SHARPENS THIS INTO THE PLAN'S BEST PACING ARGUMENT: THAT BACKLOG IS SERVED
BY ONE PAIR OF HANDS.** 36.5 crew-hours against a single pawn is **36 sim-hours of work that
cannot be finished**, and every hour of it is a reason to want another person. The demand
problem and the pacing problem have the same answer, and the answer is the thaw.

**And a second, sharper observation from the same runs.** At 12 sim-days grid reports
`needy machines at end 9, of which in UNBREATHABLE air 8`. **The wreck loop already exists on
the shipping ship, in miniature: machines the crew cannot reach because the air is dead.** The
wreck start is not a new mechanic. It is the existing mechanic made central.

### 5.4 Where the thesis "the wreck IS the faucet" survives and where it fails

**It survives for walls and rubble.** A stripped wall pays `floor(2 × 0.5) = 1` Regolith
regardless of condition (`deconstruct.def:39`); dug debris pays Regolith; both feed
`SalvageRecycler` → `Fabricator` → `MachineShop`, which E0-6 made honestly lossy at 4:3.

**⛔ It FAILED for devices — DIAGNOSIS UPHELD, DEFECT CLOSED.** `DeconstructSystem.cs:278-281`
was `floor(device_parts 2 × Condition)`, **"0 below Condition 0.5 — a wreck is worth nothing,
which is the point"**, against art badging the wrecked twins at **0 %–35 %**. **Under that rule
the entire dead half of a wrecked ship yielded exactly zero.** The owner accepted the finding and
`lane/recovery-economy` closed it with `ItemKind.Swarf` (§4 W2). **This paragraph is kept because
the diagnosis is the reusable part: the shipped rule was not a bug, it was a correct rule for a
different game, and it took driving the numbers to see that the premise had changed under it.**

**⚠️ BUT THE THESIS SURVIVES IN A NARROWER FORM THAN REVISION 1 CLAIMED, AND THE DIFFERENCE
MATTERS TO E1.** `Swarf` feeds **REPAIR**, not **MANUFACTURE**: one source (the wreck yield), one
sink (the 0.45 maintenance rung), **and no conversion to Parts at all** — blocked not by taste
but by `TryGetBill`'s ordinal-0 resolution with all three benches occupied (§4 W9's box).
⇒ **"Salvaging the dead half feeds the living half" is TRUE of keeping machines alive and FALSE
of building anything new.** The only faucet into *production* is still walls and debris →
Regolith.

⇒ **E1 remains gated, and the fork has moved twice.** `HANDOVER.md` framed it as *"does
`--ship grid` get its own ice hold?"*; revision 1 re-framed it as *"what does a dead machine
yield?"*; **that is now answered, and the live question is *"where does the fourth conversion
run?"*** — the `Reprocessor` station in §4 W9, which both `Swarf` and `Degraded` need and
neither can have today. The ice chain stays orthogonal: it is a *water* faucet, it works, and the
wreck can author a hold the same way the slice does (200 `ItemSpec` rows, `AuthoredShips.cs:483`).
Grid's water, meanwhile, is **still conjured** — measured this run: `ice melters 0 (no ice chain
⇒ the B-2 makeup floor is ACTIVE at 20 L)`.

### 5.5 The concrete recommendation to the economy programme

1. **Retire A1 as E0's exit gate on `--ship grid`.** It has been satisfiable by busywork four
   times over (`CLAUDE.md`) and it is now measured as reporting a content gap. Keep it as a
   *regression* statistic on grid, never as a *goal*.
2. **Do not open E1 against grid.** `HANDOVER.md` is right and the wreck does not change it.
3. ⭐ **Re-charter E0's exit gate on `--ship wreck`, as a THROUGHPUT statement, not a busy-ness
   one:** *"one crew member, starting alone in a wrecked ship, can reach a second thaw."*
   That is a single measurable event, it cannot be satisfied by hauling in circles, and it
   requires the faucet, the repair rule, the pressure loop, the console and the thaw all to work.
   **REVISION 2 STRENGTHENS THIS RATHER THAN CHANGING IT: the owner's mechanic makes "the second
   thaw" a first-class, player-visible goal rather than a metric I invented** — and §2 beat 7
   now gives it a predicted cost (**≥ 12 330 crew-seconds ≈ 3.4 crew-hours of bench and strip
   work alone**), so the gate has a number to be measured *against* instead of only a
   pass/fail. **Publish the measured time-to-second-thaw beside the predicted floor.**
4. **A3 ("can build a wall at day 3") has still never been measured. Measure it on the wreck.**

---

## 6. Risks and traps specific to this work

**R-1 — The silent refusal, and it now compounds.** §2 beat 3. The worksite rule refuses
silently (`MECHANICS.md` §13.21); W2 adds a *second* silent refusal (no consumable); W5's thaw
gate would be a *third* if it followed the `ISimCommand` house style, which is a bare `return;`
with no reason (`Commands.cs:100`, `:320-322`, `:493-494` — the pattern is documented as
deliberate three times). **Three invisible refusals in the first thirty minutes of the game is
the whole game being invisible.** W4 is the countermeasure and it is why W4 is blocking.
*Binding precedent: "invisible feedback is FUNCTIONAL" — it cost three owner reports.*

**R-2 — The self-healing ship. 🟢 CLOSED by `lane/recovery-economy`, and the trap it names is
still live as a MERGE-ORDER risk.** Without W2 a wrecked ship repairs itself to `Condition 0.6`
with empty hands in one 900 s pass per device and the premise evaporates in the first sim-hour.
**The trap is that W3 without W2 will LOOK like it works**, because the ship comes back to
life — just not for any reason the player caused. ⇒ **Do not build `--ship wreck` against a tree
that does not have W2 merged.** It is the one dependency in this plan that fails silently and
positively.

**R-3 — ~~`＋ADD ROOM` deletes the loop in one click~~ → THE SPLIT'S REJECTION PREDICATE.**
The wand is decided away (OD-2 option C, §4 W4b). **The residual risk moved and got sharper:**
the command's double-commission guard is `if (room.TotalMoles > 0) return;`, and after the split
"named" and "has air" stop being the same thing — so **a lane that deletes `Pressurize` and
leaves the gas predicate standing ships a command that can re-type an allocated room forever, and
can re-type a furnished one that happens to have been vented.** The guard must move to the
anchor. **This is the most likely way to ship W4b wrong and it is not what anyone will be looking
at**, because the interesting part of the diff is the deletion.

**R-4 — Thermal, which nobody has looked at.** `IsBreathable` includes temperature
(`SafetySystem.cs:18`, `hypothermia_c = -10`), **there is no heater device in the game**, and
the only ways to warm a compartment are machine waste heat and body heat
(`ThermalSystem.cs:104-119`). A room the player has just repressurised, in a cold hull, with
nothing running in it, can drift below −10 °C and become permanently unworkable with **no verb
that fixes it**.
**MEASURED, and it does NOT bite on grid:** `devices in bad air` reads **exactly 226 of 1250** at
2, 6 **and** 12 sim-days — no pressurised compartment crosses the thermal line in twelve days.
**UNMEASURED on a wreck**, where far more compartments are unpowered and hull-adjacent.
⇒ **W3's acceptance must include a temperature census at day 1, 3 and 10.** If compartments do
cross, the honest fixes are a heater device or a radiator-off default — both design decisions.

**R-5 — A wreck ship makes every existing measurement incomparable.** Owner decision 1 already
guards this by keeping grid untouched. The discipline that must survive contact: **never publish
a wreck number in a sentence that also contains a grid number** without saying which ship. The
A1 history in `CLAUDE.md` is five costumes long precisely because that discipline slipped.

**R-6 — The seventh trap shape is waiting for `ThawGate`.** A gate built from *ratios*
("scrubbing covers 3.7 crew", "19 days of food") is **scale-invariant**, and a suite of ratio
assertions **cannot see a scale error** — E0-9's entire gate went green with `DaysOfFood`
over-stated by exactly 2×. `ThawGate` is four ratios. **Its test suite must contain a
PROPORTIONAL floor and a four-cell inclusion table whose decisive cell is
*mutation + assertion regressed → GREEN*.**

**R-7 — Trap 4: a guard whose scope filter excludes the violation.** W4's channel will want a
guard like *"every refused designation appears in the `blocked` channel"*. Non-vacuity by
population count will not prove it. **Plant a known-refused tile and require it to be named.**

**R-8 — Trap 1, in a new place.** W2's and W5's guards will be tempted to grep
`MachineWearSystem.cs` / `Commands.cs` for the new rule. Strip comments quote-aware
(`tests/Perilune.Tests/SurfaceBoundaryTests.cs:82`) and carry a negative control — or better,
**drive the sim**, which for both of these is cheap.

**R-9 — Trap 3, false RED, on this machine.** The dev box is **de-DE**: MSBuild says
`Fehler`/`erfolgreich`, and `^ *error CS` never matches because the token appears mid-line after
the path. **Test your harness's parser against a real de-DE line before believing a red.**

**R-10 — The art is 72 new pieces and the join is the risk, not the drawing. 🟢 THE DRAWING IS
DONE (`lane/wrecked-art`); THE JOIN IS UNBUILT, WHICH IS EXACTLY THE HALF THIS RISK NAMED.**
⚠️ **And rev 2 adds a second condition to it: the join package also owes the `devices` channel's
delta / dirty-version scheme** (§4 W0) — the channel was merged on the written understanding that
whichever lane first *draws* the data pays for it, and on this plan that lane is this one.
`GLYPH_SUBSTITUTE` is not homogeneous in registry `kind` (5 `functional`, 1 `cosmetic`), so any
predicate over *what a glyph resolves to* is defeated by substitution — that shipped DEMOLISH
dead on every lamp with the suite **green before and after the fix**. The wrecked-twin join must
key off `(DeviceKind, Condition)` from the wire, **derived from the registry**, never off a
glyph and never hand-mirrored into two view files.

**R-11 — `AddRoomCommand` force-unlocks doors, including Lien-owned locks. 🟢 FIXED BY W4b, as a
side effect.** `Commands.cs:640` sets `IsLocked = false` unconditionally, bypassing
`SetDoorStateCommand`'s interlock (`:21`). Latent today; on a wreck with locked compartments it
is a free skeleton key. **Deleting the door-forcing step removes it — note that W4b's value is
therefore three owner-visible fixes, not one** (the wand, the vanishing doors, the skeleton key).

---

### Revision 2's risks — all three come from having ONE pawn

**R-12 — ⭐ THE ONE-PAWN PRIORITY LADDER, AND IT IS THE LARGEST UNRESOLVED DESIGN RISK IN THIS
DOCUMENT.** §2.0. The dispatcher outranks eating, crafting and maintenance, and it consults **no
need at all**. At eight crew this is invisible — **MEASURED: 200 strip designations on grid left
Maintain occupancy at 0.782 % → 0.782 %, starts 10 → 9, `None` still 72.86 %** (Appendix A rows
9–10), because grid never saturates its crew. **At one pawn it is the entire schedule and it is
UNMEASURED, because no one-crew ship exists to drive.**
**The mitigations, in the order they should be tried:**
1. **W3 authors no designations** — cheap, and makes the default case correct.
2. **W4 makes the load case visible** — the player at least sees that their orders are why
   nothing else is happening.
3. **W7** — the only real fix, and it is after W8 (§4 W7).
⚠️ **THE FIRST THING W3'S `occupancy --ship wreck --days 1` MUST BE READ FOR IS WHETHER THE LONE
PAWN EVER EATS.** Do not read the A1 line first.

**R-13 — THE MINUTE-THREE HARD LOSE.** §2 beat 2. A player who walks their only pawn into vacuum
loses it, **and cannot thaw a replacement**, because thawing needs a repaired, powered,
commissioned MOSS terminal and the pawn was the only pair of hands. **Seven people stay frozen
and the game is over, silently, in minute three.** This is not a bug in any shipped system — it
is a property of a one-pawn opening, and it is **§7 OD-10**. It is also the *only* risk in this
document that a new player will meet before they understand any of the mechanics.

**R-14 — THE FIVE-PIN PILE-UP.** Revision 2 turns one wave into four that each move state pins:
**W5a** (the `CryoSystem` seed), **W6** (rest changes what everyone does), **W9** (a hashed bit
on `ItemStack`), and W7 later. `CLAUDE.md`'s standing lesson is that **per-branch counts do not
add on merge and three concurrent pin movers cannot be attributed** — a moved hash tells you
*that* something changed, never *what*. ⇒ **§4's dependency graph marks all four "runs alone",
and that is a hard constraint, not a preference.** The cheapest ordering is **W5a → W6 → W9**,
each with its own re-pin commit, because W5a's move is the one everything else waits on.

---

## 7. OWNER DECISIONS — the record, and what is still open

> **REWRITTEN IN REVISION 2.** Six of revision 1's eight items have been decided or closed. They
> are kept as a **record** rather than deleted, because in three of them the *reason* the answer
> came out the way it did is the reusable part. **What is still open is §7.1, and it is short.**

---

### 7.0 THE DECISION RECORD — closed, do not re-argue

| # | question | answer | where it lives now |
|---|---|---|---|
| **OD-1** | What does a wrecked machine yield when stripped? | **Option B — a new low-grade kind.** `ItemKind.Swarf = 9`; `deconstruct.device_swarf = 1`; the Parts arm untouched at every Condition. | 🟢 `lane/recovery-economy`; §4 W2 |
| **OD-2** | Does `＋ADD ROOM` survive on the wreck? | **Option C — SPLIT IT. Naming is free, air is earned.** `Pressurize` and the door-forcing are deleted; the vent becomes the tool. | §4 W4b — **promoted to a blocking wave** |
| **OD-3** | What ARE the eight wrecked loose resources? | **Option B — one `Degraded` bit on `ItemStack`**, and the P1–P3 pin move is taken deliberately. | §4 W9 |
| **OD-4** | Where does `wreck_threshold` live, and does it change existing ships? | **0.25, global, and the empty free-repair band on `Terminal`/`Light`/`WaterTank` is ACCEPTED knowingly.** | 🟢 `lane/recovery-economy`; §4 W2 |
| **OD-6** | Rename `ItemKind.Regolith`? | **Yes — `Rubble`.** | §4 W10, **runs alone** |
| **OD-7** | Skin `'/'` (the open door)? | **CLOSED, and the question was malformed.** | §2 beat 1 |

**Three of those six are worth a sentence each on *why*, because the reasoning transfers.**

**OD-1 — the shipped rule was not a bug.** `"a wreck is worth nothing, which is the point"` was a
correct rule for a game where you do not start on a wreck; it existed to stop a strip/rebuild
loop minting Parts, and its comment said so. **The premise changed under it.** The replacement
had to keep the round trip lossy (3 Parts out, at most 2 back) *and* keep rot expensive
(2 Parts > 1 Part > 1 Swarf, strictly monotone) — which is why `device_swarf = 1` and not 2.
⇒ **When a shipped rule contradicts a new premise, check whether the rule is wrong or the
premise is new. Here it was the premise, and the fix had to preserve everything the old rule was
actually protecting.**

**OD-4 — a def that is inert everywhere is a def nobody tests.** Revision 1 offered `0.0` (inert
by construction, P1–P3 guaranteed to hold) and recommended against it. The owner took `0.25`,
**and the pin risk revision 1 flagged did not materialise: P1/P2/P3 HELD, measured on the
branch** (§4 W2). The *behavioural* cost did materialise and was accepted: `Terminal`, `Light`
and `WaterTank` carry `maint = 0.20`, below the threshold, so all three have an **empty
free-repair band on every ship in the game.** The owner took it knowing what it means — **a
`Terminal` is the MOSS box, so restoring MOSS genuinely costs Parts** — and after the thaw
mechanic that is the single best-motivated price in the plan.

**OD-7 — the question was malformed, and that is the lesson.** Revision 1 asked *"skin `'/'`"* and
called it blocking, on the reasoning that *which doors are shut* is the frontier's readout.
**The readout needs SHUT doors to draw, and they do**: `'+'` → `sliding-door`, `'X'` →
`blast-door`. `'/'` is **deliberately** unskinned — *"an open doorway is a gap, and a gap is what
both surfaces already draw"* (`glyph-map.js:130`). What was really wrong was **`AddRoomCommand`
force-opening every bordering door**, so allocated compartments turned all their doors into
gaps. ⇒ **The symptom was in the art layer and the defect was in a command. Chase the state, not
the pixel.**

---

## 7.1 STILL OPEN

---

### **OD-9 — ⚠️ WHAT IS A WRECKED, OCCUPIED POD?** ⭐ *INFERRED, NOT STATED — the highest-stakes open item*

> ### ⛔ **THE OWNER DID NOT ANSWER THIS. THEY ANSWERED THE THAW MECHANIC INSTEAD.**
> Everything below is **my working assumption**, written so W5 has something to build against.
> **It must not be treated as settled by any later wave, and the alternative must not be built
> without asking again.**

**The question.** The owner's art has two capsule pieces — `CRYO CAPSULE · OCCUPIED` and
`CRYO CAPSULE · OPEN` — and 70 wrecked twins badged 0 %–35 %. **A pod is a `Device` and W1 lets a
plan author any device damaged. So what does a pod at `Condition = 0.08` mean?**

**THE WORKING ASSUMPTION, and why it fits.** All eight crew are stated to be recoverable
(*"we have 8 pawns all in the pods"*, and the other seven *"have to be defrosted"* — not *"if
they survived"*). ⇒ **The occupant is ALIVE, and the POD is what is broken. A damaged pod must be
REPAIRED before its sleeper can be cycled.**

**Why this reading is also the best design, if it is right.**
- It gives **each successive thaw a per-pawn matter price** that is *authorable* — the owner can
  pace the whole opening by choosing eight pod conditions, with no code and no def.
- It reuses the entire repair loop the wreck already teaches. A pod below `wreck_threshold` needs
  a consumable, exactly like every other machine.
- It gives `ThawGate`'s **pod term** something to say beyond `Powered` — *"POD 4 IS DAMAGED —
  needs Parts."*

**THE ALTERNATIVE, which is a different game and must not be built by accident.** A wrecked pod's
sleeper is **dead**: the pod yields an `ItemKind.Corpse` with a name, and the ship's crew ceiling
is whatever survived. That is a strong, bleak, entirely defensible design — the corpse art is
already drawn (`CORPSE · UNSHROUDED`), and `AuthoredShips` already authors named corpses. **It is
also unrecoverable: a player who loses four sleepers to authoring has lost half the game before
touching anything.**

**⇒ THE ASK: one sentence from the owner.** *"A damaged pod is repaired before its sleeper wakes"*
or *"a badly damaged pod's sleeper is dead."* **W5 builds the first; do not let it build the
second by defaulting.**

---

### **OD-10 — ⚠️ THE MINUTE-THREE HARD LOSE.** *(NEW in rev 2)*

A one-pawn opening has a failure the eight-crew ship never had: **walk your only pawn into vacuum
and the game is over, with seven people still frozen and nothing on screen to say so.** Thawing a
replacement is impossible — it needs a repaired, powered, commissioned MOSS terminal, and the
pawn was the only pair of hands. §6 R-13.

| option | what it does | cost |
|---|---|---|
| **A — accept it, loudly.** A real lose screen the moment `LivingCrew == 0`. | Honest. Permadeath of the run is a legitimate genre choice. | One screen. But it fires in **minute three**, before the player has learned that vacuum kills. |
| **B — the emergency thaw.** Pod 1 cycles automatically, once, when `LivingCrew` reaches 0. | Protects minute three without protecting hour three: it is a **one-time** grace, and when the pods run out the lose screen from (A) fires anyway. | A branch in `CryoSystem` and a Chronicle entry. **Recommended, with A.** |
| **C — make the first pawn unkillable.** | ⛔ **Refuse.** It teaches the player that vacuum is survivable, which is the one lesson beat 2 exists to prevent. | — |

**Recommendation: B plus A.** ⚠️ **And note B is not free of design content** — an automatic
thaw bypasses the console, the price and the headroom gate, i.e. **every gate the plan just
built.** That is defensible as an emergency, but it must be a *named exception in `CryoSystem`*,
not a hole in `ThawCommand`, or the first player to find it will use it as the normal path.

---

### **OD-11 — What does `thaw_cost` buy, and in what currency?** *(NEW in rev 2)*

**Not whether to charge — the owner's brief already prices a thaw. The question is the
currency**, and §2 beat 7's arithmetic makes it consequential rather than cosmetic.

- **One `ControllerModule` is ~2.3 crew-hours of bench time** (`Regolith:4 → Scrap:3` @ 2 400 s ·
  `Scrap:2 → Parts:1+Seals:1` @ 900 s · `Parts:2 → ControllerModule:1` @ 1 800 s, measured off
  the shipped bills). **One is already spent commissioning the terminal.**
- **If every thaw also cost a module**, thaws 2–8 are seven more full chains — **~16 crew-hours
  of pure crafting to fill the ship** — and the pacing stops being *"one after the other"* and
  becomes *"one, and then you stop playing"*.

**Recommendation: `thaw_cost` in `Parts`**, tuned so a thaw costs meaningfully less than the
console did. **The console is the one-off gate; the thaw is the recurring one.**
**The owner may prefer it slower** — this is a pacing dial and it is theirs. **What must not
happen is the number being picked without this arithmetic in front of it.**

---

### **OD-5 — Are the frozen crew authored people, or generated?** *(still open, and now MUCH more important)*

The slice has eight hand-written `AuthoredPersona`s (`AuthoredShips.cs:577-790`); grid has none
and takes whatever `PersonaGenerator` produces.

⭐ **REVISION 2 RAISES THIS FROM A NICE-TO-HAVE TO A LOAD-BEARING QUESTION**, because the owner's
mechanic makes *"who do I wake next?"* **a decision the player makes seven times**, in the game's
first day, at a real matter price. Revision 1 called the eight "the emotional core of the
premise"; the thaw mechanic makes them **the core loop's reward**.

**Recommendation: authored, and written as a SET** — a medic, an engineer, a hydroponicist, a
pilot — so that *who you wake* is a real choice. **Cost: eight persona sheets; it is writing, not
engineering.**

⚠️ **AND THE COLLISION WITH W7 IS NOW THE POINT, NOT A FOOTNOTE.** **Without skills, "who you
wake" has no mechanical consequence, only a narrative one** — every thawed pawn is an identical
pair of hands with a different name. The player will notice by the third thaw.
⇒ **If the owner wants the choice to matter MECHANICALLY, W7 moves ahead of W8** and the plan
gets longer. **If narrative differentiation is enough for v1, say so explicitly** — that is a
legitimate answer, and it is much cheaper. **This is the decision that sizes the whole
programme.**

---

### **OD-8 — Does the wreck ship get an ice hold?** *(still open)*

The slice's costs 200 `ItemSpec` rows and one `IceMelter` (`AuthoredShips.cs:393-394`,
`:458-485`) and buys ~22.5 sim-days of water. Grid does not have one and its water is **still
conjured** by B-2's makeup floor — measured this run (`ice melters 0`).
**Recommendation: yes, and put it BEHIND THE FRONTIER** — a hold the player has to reach. It
turns the water faucet into a *goal* rather than a boot condition, which is exactly what the
wreck premise wants and what grid could never do.
**Cost: ~10 lines of authoring, reusing a shipped helper.** This also folds in the standing
question of whether B-2's makeup floor should stay on a ship that has a real water chain.

⚠️ **Rev 2 note: with ONE pawn, "behind the frontier" has to be reachable by one person inside
the water runway**, or the recommendation is a death sentence rather than a goal. **W3 must
measure the lone pawn's time-to-hold against the ship's authored water, and publish both.**

---

## 8. What I did NOT settle, deliberately

- ~~The two in-flight lanes' internals (condition wire, wrecked art)~~ — **both landed; §4 W0
  records what shipped and the one condition it carries.**
- W7's data model. Charter only, per owner decision 4 — **and §2.0 raises its value without
  moving it.**
- The persona writing (OD-5) — **which revision 2 promotes to the decision that sizes the
  programme.**
- Any number in W3's damage pass — the count of wear-bearing devices on a wreck is
  **UNMEASURED** and must come from the built ship, not from me. **Revision 2 supplies only a
  BOUND: at most 146** (1 250 devices minus 1 104 utility overlays).
- **Whether the one-pawn ladder actually starves a lone pawn.** §2.0 proves the *ordering* from
  source and measures that it does **not** bite at eight crew; **the one-pawn case cannot be
  driven until W3 exists.** I have deliberately not guessed at it, and W3's acceptance is where
  it gets answered.
- **The vent fill time.** Revision 1's ≈208 s is arithmetic over `atmosphere.def:19` and stays
  UNMEASURED. **After owner decision 2 it is the tempo of the core loop**, so W4b's acceptance
  drives it rather than my re-deriving it here.
- Whether the thaw screen's pod list lives in the MOSS screen, the Room Zoom, the Overview, or
  the deferred Persona window. **My recommendation is the MOSS screen and §4 W5.3 argues why the
  thaw is a MOSS op** — but the surface-boundary question survives that recommendation:
  **`CREW_INTERACTION` is a pinned set and the Persona seam REPLACES `talkSelectedCrew` /
  `openBioForSelected` rather than joining them.** A thaw affordance is a *device* interaction,
  not a *crew* interaction, and W5 must argue that explicitly or it fails
  `client/test/surface-boundary.test.js`. ⚠️ **This gets harder, not easier, under the thaw
  mechanic — because the thing the player is choosing IS a person**, and the first lane that
  puts a portrait on the MOSS screen has scattered a second crew-interaction affordance onto a
  surface. **Say the argument out loud in the package.**

---

## Appendix A — every measurement in this document, with its command

All in `/Users/garvin/Research/Code/perilune-wt/wreck-design`, `-c Release`, `n = 1`,
`main` @ `d4b860a`, 2026-07-28.

| # | Command | What it gave |
|---|---|---|
| 1 | `dotnet run --project hosts/scenario -- --days 3 --seed 42` | twin hashes MATCH `43345ff0c9d62684` (P1 holds); `defs: 4c15dffe98a2cda8` (P5 holds) |
| 2 | `… occupancy --ship grid --days 1` | None 82.85 % · Dig 1.77 % · Craft 15.35 % · **A1 work 0.000 % FAIL** · busy 0.0 % from h17 · debris 40 left, dig remaining 0 · stockpiles 0 · `Potato=211 Scrap=1 ControllerModule=8 Seals=16` · ice melters 0 · 8/8 alive |
| 3 | `… occupancy --ship grid --days 2 --maint-audit` | **1 250 devices, 226 in bad air** · 10 Maintain starts, 11 services · unstageable dig/strip/build **0/0/0** · needy at end 0 |
| 4 | `… occupancy --ship grid --days 6 --maint-audit` | **88 services**, Maintain **1.999 %** · bad air **226** · unstageable 0/0/0 |
| 5 | `… occupancy --ship grid --days 12 --maint-audit` | **272 services**, Maintain **3.063 %** · bad air **226** · **needy at end 9, of which 8 in UNBREATHABLE air** · unstageable 0/0/0 |
| 6 | `… ledger --ship grid` | matter 63 u/38 stacks @h1 → 236 u/229 @h24 → 356 u @h48 · food **2.07 d** @h1 → 30.78 d @h48 · water `[0.64 d]` @h2 → pinned 1000 L `[not depleting]` · **O2 99.0 → 98.6 crew-d over 56 h** |
| 7 | `dotnet run --project hosts/tui -- --ship grid --dump` | deck-1 slots 3, 5, 7 unexplored/sealed; slot 6 renders as `%` debris — the 40 undesignated debris tiles |

### Revision 2's measurements (2026-07-28, same worktree, base `main` @ `d4b860a`)

| # | Command / method | What it gave |
|---|---|---|
| 8 | `… occupancy --ship slice --days 1` | **Reproduces the baseline**: None 73.97 % · Dig 4.22 % · Craft 21.78 % · **Maintain 0.00 %** · Eat 0.00 % · Drink 0.02 % · A1 2.844 % FAIL · 8/8 alive · 864 000 ticks in 6.1 s |
| 9 | `… occupancy --ship grid --days 2 --maint-audit` | **Reproduces Appendix row 3 exactly** — 1 250 devices, 226 in bad air, Maintain **0.782 %**, **10** starts, unstageable **0/0/0**, needy at end 0 |
| 10 | `… occupancy --ship grid --days 2 --strip 200 --maint-audit` | **THE ONE-PAWN LADDER'S NEGATIVE RESULT.** 200 strip designations on the board: Maintain **0.782 % → 0.782 %**, starts **10 → 9**, Deconstruct 0.57 %, **`None` still 72.86 %**, unstageable still 0/0/0. ⇒ **a loaded dispatcher board does NOT suppress maintenance at 8 crew** — grid never saturates its hands. **The ladder is real (source-measured) and does not bite here.** |
| 11 | source, exhaustive read | `SystemStack.cs:27-62` claimant order · `JobSystem.cs:220-275` consults **no** need · `SustenanceSystem.Tick`'s and `MachineWearSystem.RecruitForNeediest`'s own comments stating the ordering as intent · `JobSystem.DefaultSources()` = **four** sources · `DeviceKind` tail = `IceMelter = 26` · `machines.def` `maint` for Terminal/Light/WaterTank = **0.20** · `production.def:118-119` + `recipes.def:22` bills · `content/core/SimDefs/rules/` holds **one** rule and it names only `ship.heat` |
| 12 | `git diff --stat main...<branch> -- ci.sh tests/Perilune.Tests/Golden/ content/` | **`lane/damaged-authoring`: 0 lines (all five pins held).** **`lane/recovery-economy`: 0 lines for `ci.sh` + goldens (P1/P2/P3 held); P4 → `df93cbd628644785`, P5 → `fc65c6682d5bee59`** (branch-local, stale on merge — **re-measure**) |

**UNMEASURED and labelled as such in the text:** the vent fill time (≈208 s, arithmetic over
`atmosphere.def:19` — **now W4b's acceptance**); the wreck's wear-bearing device count
(**bounded at ≤ 146**, census pending W3); the repair backlog total (**≤ 36.5 crew-hours**,
arithmetic); **the first-thaw critical path (≥ 12 330 crew-seconds ≈ 3.4 crew-hours — arithmetic
over shipped bills, a FLOOR, excluding all walking)**; thermal drift on an unpowered wreck
compartment; **and whether a lone pawn starves under a loaded board — the central open
measurement, and it cannot be taken until `--ship wreck` exists.**

⚠️ **NOTHING IN THIS DOCUMENT WAS MEASURED WITH `./ci.sh`, DELIBERATELY** (this is a design lane
and the instruction was not to run it). **Every pin claim above is a `git diff` against the
pinned files, not a gate run.** A diff of 0 lines proves nobody *edited* a pin; it does not prove
the gate is green. **The integrator runs the gate.**
