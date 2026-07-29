# The next three months — the high-level plan

*Written 2026-07-28 on `lane/roadmap`, base `main` @ `72fbca4`. **This is a SHAPE-AND-ORDER
document.** It is deliberately not an implementation plan; a separate lane derives that from it.
Every claim about what the code does carries a `file:line` verified against `main` in this session,
not copied from a design doc — this repo has repeatedly published claims that were false when
measured, and four of them are corrected below.*

**Binding inputs, in precedence order:** the owner's statement of how the game is played · the three
owner decisions taken today (**OD-A** repair is a work type under the priority grid · **OD-B** the
economy is parked at E0-complete and A1 is retired as a goal · **OD-C** the ship's interior is known
at boot) · the OD-1…OD-12 record in `docs/design/perilune-wreck-start.plan.md` §7 · the invariants
in `CLAUDE.md`. Where this plan contradicts a document on `main`, the contradiction is named in §3.6.

---

> ## REVISION 1 — what changed and why *(2026-07-28, after independent review + integrator rulings)*
>
> Revision 0 took a send-back with seven required fixes. **The reviewer drove the sim; several of its
> findings are measurements revision 0 did not have.** Nothing below is an argument I won; where I
> disagreed I was overruled or re-measured.
>
> | # | what changed | why |
> |---|---|---|
> | **1** | **M2's sizing box rewritten.** My *"change the stack evaluation order"* conclusion is **REJECTED and removed** from M2's contents and from NEW. I was right that a flat veto is insufficient and **wrong about why**. | A reorder inverts a *fixed global* precedence: it makes Repair beat Haul for every pawn always, cannot express Haul@1/Repair@4, delivers none of OD-A, costs a pin move, and moves `MaintenanceSystem` above `MachineWearSystem`, changing the service interleave. The real cause is that `JobKind.Maintain`/`Craft` have **no `IJobSource` at all**. |
> | **2** | ⭐ **M2 now charters THREE mechanisms, not one** — the work-type filter, cross-family ranking, and **pre-emption as its own package**. | Measured by review: a player's strip order waited **54 650 ticks (1 h 31 min sim)** behind six chained 900 s Maintain services. **Job-duration monopoly is the dominant term and neither the reviewer's nor my original seam addressed it.** |
> | **3** | **"No asymmetry to exploit" is STRUCK** (§M2). | False at the level that matters: a worn scrubber pays full draw for reduced output — a deliberate penalty — but a worn SolarWing's only output *is* power, so its wear is expressed **nowhere**. |
> | **4** | **Generator wear re-ordered and re-scoped**: fix the off-network authoring defect **first**, then gate generation by `EffectiveRate` only. `IsOperational` stays **out**. And it is **not pin-neutral**. | Measured curve, §M2. `IsOperational` produces the cliff both reviewer and I argued against; `EffectiveRate` alone gives the gradient. |
> | **5** | **M1 re-founded on a hard dependency, and trimmed.** Items 5 and 7 floated to overflow. `Citizen.Morale` and the onboarding `B`-key error **pulled forward from M4**. | Under OD-C six of eight deck-0 slots do not reach the `devices` channel, so **M2's right-click has no clickable target**. Debuggability is now the secondary argument, not the primary one. |
> | **6** | **M5 re-sized and its bet named.** Save/load is a project, not a line item — `SaveWriter`/`SaveReader` appear **only under `tests/`**; no host writes or reads one and `CmdKind` has no verb. A human gate moved to week 9. | RF-3. M5's old demo demonstrated save/load, not an ending. |
> | **7** | **Five factual errors corrected** (send-backs are 9 of 40 not 6 · `vent_ls` is `MECHANICS.md` §13.23c not §13.22c · "hundreds" of needy machines is **39 of 626** · an `AirVent` **injects** and does not push air outward · M1's reachability reuse was the wrong source). | RF-6, RF-7. |
> | **8** | **§6's infrastructure cap made enforceable** — classified at charter time, running count published, re-pin commits counted, a **refusal** rather than a retrospective ratio. | RF-5: as written the cap could only be discovered after it had been breached. |
> | **9** | **R1's spike re-specified** — it returned a **FALSE PASS** as written. | Repair already beats a painted strip order today, with no veto at all. |
>
> **Unchanged, because review endorsed them:** §3.1's demolition of *"expensive therefore later"* ·
> §3.2's *batch the lane, never the commit* (and the reserved-skill-byte batching, which survives
> ruling 1 intact) · §3.3's thaw defence · §3.4's drop table · §6's player-sentence rule · the
> measured gate.

---

## 0. Defects found while writing this plan — file these, do not rediscover them

> **These are live on the shipping game today.** They are recorded here because a roadmap that does
> not name what it walked past is how this project has repeatedly rediscovered things at full cost.

**0.1 ⛔ EVERY LIGHT ON THE WRECK GOES OUT PERMANENTLY AT SIM-HOUR 7.** Measured by review on
`--ship wreck`: **h0 = 16/16 lit, 15.00 kWh stored → h7 = 0/16 lit, 0.00 kWh.** The battery drains
and never recovers. `AuthoredShips.cs:1429-1433` claims *"~12.6 kW of total demand, every tier served
from tick 0 and stays served"* — **both halves are false**; true flat demand is **20.40 kW**.
⇒ **The wreck was authored against a power model that was never built.** This is not a consequence of
gating generation on condition (M2) — it is true *today*, with generation condition-blind. It is the
strongest single piece of evidence for M2's power package and it must be fixed inside it, not
afterwards.

**0.2 `AuthoredShips.cs:1441-1443` believes deck 1 carries no conduit and therefore neither draws nor
runs. Measured: 0 of 626 devices are off-network.** `PowerSystem`'s claim rule is 6-way, so a deck-1
device claims the deck-0 conduit through **−z**. The authoring's intent and the sim's behaviour have
never agreed. **Fix this before touching the generation term** (§M2).

**0.3 ⛔ AN `AirVent` INJECTS FROM AN UNMODELLED RESERVE INTO ITS OWN ROOM, AND REFUSES TO VENT INTO
ROOM 0** (`AtmosphereSystem.cs:136-146`). **Nothing "starts falling next door."** ⚠️ **This
contradicts `CLAUDE.md`'s own framing of the premise** — *"open the vent, push the air outward"* — a
mechanic **the sim has never implemented**. Revision 0 of this document repeated the false framing in
two places; both are corrected. **Whether the premise or the sim is wrong is an OWNER decision**, and
it is added to M1's decision batch. It is cheap either way (a vent that draws down a neighbour is a
sign flip and a room-0 rule; a premise that says "flood the compartment" is a wording change) — but
it must not be answered by whoever happens to type the demo script.

**0.4 SAVE/LOAD DOES NOT EXIST OUTSIDE THE TEST SUITE.** `SaveWriter`/`SaveReader` appear only under
`tests/`; no host writes or reads a save file, and `CmdKind` has no verb for it. Every reference in
this repo's docs to saves surviving DLC describes a *capability of the format*, not a shipped
feature. Sized in M5.

**0.5 RUG and SHELF send nothing on the wire** (`roomzoom-view.js:988-991`, module-local `_decor`) —
the player places furniture that does not exist and cannot persist. In M4.

---

## 1. The thesis

**Three months to make the wreck a game you play with people, not a diorama you poke.** Today a
player wakes up alone on a ruined ship, can see about a quarter of it, can paint an order and cannot
take it back, cannot tell their one crew member that fixing the reactor matters more than carrying
rubble, and cannot fix the reactor in a way that turns any lights on. By the end of the quarter they
will: **watch a person wake up** and know who she is; **say what kinds of work matter and who does
them**; **point at a specific broken machine and say "that one, now"**; **watch her go, on her own
judgement, and see the ship change** — power up, air out, a compartment become somewhere you can
stand; **earn a second soul, and choose which one**; and, whenever nothing is happening, **be told
why, on the tile where it isn't happening**. That is the owner's loop, in the owner's order: a
person first, orders second, autonomy inside the frame the player set, and the ship visibly
answering. Nothing in this plan is justified by a throughput number.

---

## 2. The spine — five milestones across 13 weeks

| # | milestone | weeks | the one sentence |
|---|---|---|---|
| **M1** | **SEE IT, AND KNOW WHY** | 1–2 | *"I can see every wrecked machine on my ship, open the vent that starts the air, and when an order can't happen the game tells me why — and lets me take it back."* |
| **M2** | **THE ORDER** | 3–6 | *"I can tell Rell that repair matters more than hauling, or point her at one broken machine — and when she fixes the reactor wing, the lights come on."* |
| **M3** | **THE SECOND SOUL** | 7–9 | *"I can earn a second crew member, choose which one, and the choice changes what my ship can do."* |
| **M4** | **THE PERSON** | 10–11 | *"I can click anyone aboard and get one window that tells me who they are, what they're doing, why, and how they are — and every number in it is true."* |
| **M5** | **A RUN WITH A SHAPE** | 12–13 | *"I can sit down, play the wreck for an hour, and the session has a beginning, a middle and an ending I can tell someone about."* |

Each milestone below states its player sentence, a **five-minute browser demo**, what it **reuses**,
what is **new**, why it **cannot move earlier**, and its **size with the reason it is that size**.

---

### M1 — SEE IT, AND KNOW WHY *(weeks 1–2)*

> **Player-facing statement.** *"I can see every wrecked machine on my ship, I can open the vent that
> starts the air, and when I paint an order that cannot happen the game tells me why — and lets me
> take it back."*

> **Why this comes first — the HARD dependency, corrected in revision 1.** Revision 0 argued
> debuggability. That is true but secondary. **The primary reason is mechanical: M2's right-click
> direct order has no clickable target without M1.** Six of the eight deck-0 slots render as blank
> `＋ADD ROOM` boxes while containing `fabricator_1` at 0.11, `machineshop_1` 0.13, `recycler_1` 0.09,
> `scrubber_ls` 0.08, `reclaimer_ls` 0.12 and **`vent_ls` 0.15 — the premise's own opening move**.
> `vent_ls` reads `Explored = false` at tick 0, tick 600 and tick 36 000 (`MECHANICS.md` **§13.23c** —
> *not* §13.22c, which is the `CryoPod` `maint` opt-out; revision 0 mis-cited it), so it never reaches
> the `devices` channel and gets no OPERATE chip. **A machine that is not on the `devices` channel
> cannot be right-clicked, so OD-A's control half is unreachable by construction.** Meanwhile the
> sensor log announces `fabricator_1: MACHINE FAILURE` for a machine the player cannot see.
>
> *Secondary, and still true:* a repair order that does nothing because the machine is unseen is
> indistinguishable from a repair verb that is broken — a confusion that has already cost this
> project three owner reports (`invisible-feedback-is-functional`).

**Contents.**
1. **OD-C — the ship's interior is authored-explored at boot.** The wreck's own hull and machines are
   known; fog survives only for space the crew has genuinely not surveyed.
2. **Name wreck deck-0 slot 3** (`roomTileRect` needs an `anchorName`) — W4b's own debt, kept
   separate from the fog lane by explicit instruction (`HANDOVER.md` top block, "do not let a fog
   lane absorb it").
3. **UN-DESIGNATE on the standard surface.** There is none, on either surface, and the code admits it
   twice in its own words: `client/src/ui/overview-view.js:967-969` and
   `client/src/ui/roomzoom-view.js:1172-1174` — *"`on` is always true: this surface paints intent and
   never erases it… `Cmd.dig(x, y, false)` rides the wire and the TUI sends it, but no surface in
   `client/` does, the console included."* The wire and the sim already carry it. On the wreck this
   is not a nicety: one STRIP drag across the cryo bay used to permanently delete seven of the eight
   souls a won game ends with (`MECHANICS.md` §13.22a), and there is still no undo for anything else
   you paint.
4. **The `blocked` channel's third question: can any crew member PATH here?** `BlockedReason`
   (`hosts/web/GameSession.cs:2285-2297`) asks only *is a neighbour walkable* and *is it breathable*.
   Measured consequence today: two legal verbs (arm OPERATE, shut two doors; arm WALL, drag two
   tiles) produce ghosts frozen at 0/2, a pawn reading `"Idle"` and **`blocked` = zero rows, held for
   480 000 ticks**.
   ⚠️ **REVISION 1 — the reuse named here was WRONG and would have shipped a performance defect.**
   Revision 0 said *"the reachability gate already exists host-side from E0-4 WP-7."* It does, and it
   is the wrong instrument: `StockpileHarness.IsReachableByAnyCrew` runs `FindPath` **from every crew
   member**, once per headless measurement leg. `BuildBlocked` runs inside `Render`, at up to
   **10 Hz, over every designated tile**. ⇒ **Use the sim's own answer instead — the per-tile
   unreachable backoff the job sources already maintain (`IJobSource.BeginTick`), which is O(1) per
   tile and is, additionally, the *same* answer the dispatcher acts on.** A reason derived from a
   second implementation can disagree with the behaviour it explains; this one cannot.
5. **The two live lies on the first screen** *(pulled forward from M4 in revision 1 — both are
   first-contact defects and neither should wait ten weeks)*:
   **(a)** `Citizen.Morale` is **never written outside its initialiser** (`Citizen.cs:34`, `= 1f`) and
   it is the value the CREW WATCH morale bar draws. **The visible morale bar is a constant.** Pull the
   bar (making it real is an M4 decision; drawing a constant is not defensible in the meantime).
   **(b)** The intro card teaches *"B — open their dossier"* (`onboarding.js:21`). **`B` arms the
   BUILD tool** (`controls.js:257`, `roomzoom-view.js:1259`), and `openBioForSelected` has **no
   keyboard binding anywhere** — so `overview-view.js:319`'s `[B] BIO` label advertises a hotkey that
   does not exist. Fix the key row now; the card's full rewrite stays in M4 with WP-C.
6. **The silent-refusal sweep.** Enumerate every refusal the sim can make and require each to reach a
   surface: unbreathable worksite (`SafetySystem.cs:104-128`, `CanStageWorkerAt` — thermal counts),
   unreachable stockpile (`MECHANICS.md` §13.17), a machine below `wear.wreck_threshold` with no
   consumable, a locked door (`GameSession.cs:1066-1071`), and a closed occupied cryo pod
   (`DeconstructSystem.cs:400`). This is a **census with an inclusion test**, not a feature.

> **FLOATED OUT OF M1 IN REVISION 1 — neither gates M2, and M1 was padded.**
> **(i) The `designs`/`blocked` fog asymmetry.** `BuildDesigns` (`GameSession.cs:1715-1729`) emits
> every pending site with no fog gate while `AddIfBlocked` **is** gated (`:2311`), so a ghost draws
> where its reason cannot. **OD-C removes most of its occasions by revision 0's own admission**, which
> is precisely why it does not belong in a two-week milestone. → **overflow**, ahead of the queue,
> because it will recur on genuinely unsurveyed space.
> **(ii) Measure A2 and A3.** Owed, cheap, and **it breaks this document's own §6 rule — its subject
> is a metric, not a player** (RF-4). It is therefore relabelled **INFRASTRUCTURE**, counted against
> the §6 cap, and floated to overflow. Under OD-B both are **baselines, never goals**. A3 has never
> been measured in the repo's life; A2 not since E0-1. *(Writing a fake player sentence for it would
> have been the exact failure §6 exists to prevent, and revision 0 came within one line of doing it.)*

**REUSES.** The `blocked` channel and its overlay (`hosts/web/WireFormat.Blocked.cs`,
`client/src/ui/blocked-overlay.js`) · `WorksiteSafety.CanStageWorkerAt` · **the job sources' own
per-tile unreachable backoff (`IJobSource.BeginTick`)** — *not* `StockpileHarness`, see item 4 ·
`TileFlags.Explored` and `ExplorationSystem` · the `marks` channel and `mark-overlay.js` ·
the 16-tool Room Zoom palette (`client/src/ui/room-model.js:51-54`) · the wire's existing
`Cmd.dig(x,y,false)` / `Cmd.strip(x,y,false)` off-path, already handled by the TUI
(`hosts/tui/…/GameLoop.cs:322`).

**NEW.** An authored-explored flag on `ShipPlan`/`AuthoredShips`; a cancel/erase tool (or an
erase modifier) on the Room Zoom and the Overview ORDERS bar; a third term in `BlockedReason` sourced
from the dispatcher's own backoff.

**Dependency.** None — it is the entry point. It cannot move later: M2's right-click has no target
without it.

**Size: SMALL–MEDIUM.** Almost all host-side and client-side; the sim change is authoring, not
mechanism. **Pin risk is the thing to check, not the code:** if the explored flag is authored on the
wreck only, all five pins hold and that must be *measured*, not argued (`git diff --
tests/Perilune.Tests/Golden/ ci.sh content/` = 0 lines, the ground-item lane's own check). If it
becomes a general rule about hull tiles, P1–P3 move and it joins the pin chain in §3.2.

**FIVE-MINUTE BROWSER DEMO.** `./play.sh` → deck 0 shows eight slots, six now containing visible
wrecked machines wearing their wrecked art → enter the life-support hall → press **O** → click
`vent_ls` → **the hall's own pressure begins to RISE** → arm **B** (WALL) and drag two tiles in a
vacuum hall → the tiles carry a written reason instead of nothing → press the erase tool and click
them → the ghosts go away → open the CREW WATCH row and there is **no morale bar drawing a constant**
→ press `?` and the `B` row says what `B` actually does.

> ⚠️ **REVISION 1 — THE DEMO'S PHYSICS WAS WRONG AND SO IS THE PREMISE IT CAME FROM.** Revision 0
> wrote *"pressure starts falling next door and rising here"*. **An `AirVent` injects gas from an
> unmodelled reserve into its OWN room and refuses to vent into room 0** (`AtmosphereSystem.cs:136-146`).
> There is no neighbour term. Nothing falls next door. ⇒ `CLAUDE.md`'s framing of the premise —
> *"open the vent, push the air outward"* — describes **a mechanic the sim has never implemented**,
> and this document repeated it. **Added to M1's decision batch** (§3.5): fix the premise's wording, or
> give the vent a source room and a sign. Both are cheap; neither should be settled by whoever types
> the demo script.

---

### M2 — THE ORDER *(weeks 3–6)*

> **Player-facing statement.** *"I can tell Rell that repairing machines matters more than carrying
> rubble, or right-click one specific broken machine and say 'that one, now' — and when she fixes the
> reactor wing, the lights come on."*

This is the milestone the whole quarter is built around. It is the owner's own worked example of the
loop, and **today it is not expressible in either half.**

> ### ⛔ SUPERSEDED IN PART BY OD-G / OD-H *(2026-07-29)* — read `perilune-roadmap-q3.packages.md` §5's REVISION 3 block before implementing anything in M2
>
> **OD-G — the pawn boots idle and waiting; the game opens with the player giving an order, after
> which normal autonomy resumes under a visible work grid.**
> **OD-H — the work grid DEFAULTS OFF; work is opt-in.** ⚠️ *The owner accepted a pin move and a
> re-baseline explicitly.*
>
> **What that voids in this section:** the packages document's chartered *"default every work type to
> 3"* (chosen to keep a pin from moving — **a cost argument deciding a design question**, the exact
> shape §3.1 of this plan names) · the work-type filter's *"four sites"* — **re-derived as eleven claim
> sites, FIVE gates and three named exclusions**, the fifth gate being `CapabilityComputer.cs:70-76`,
> which no revision had counted · and the demo's opening, which now runs the **enabling** direction.
> **Contents item 5 (*"repair becomes a work type"*) and item 8 (POWER) are unaffected.**
> ⭐ **Two new packages follow from it** — **M2-20** (a pawn who is waiting, and a game that says so)
> and **M2-21**, the silent BUILD haul measured on 2026-07-29. **Both are chartered in the packages
> document, not here.**
> ⛔ *(A third, `M1-J` — "the tick-0 claim on a bench she can never reach" — was chartered and **DROPPED
> the same day**: M1-H's merged reachability probe removed the claim, and the wreck's own compartment
> equalises to breathable by ~tick 1 450. **Its premise was contradicted twice in one day.** It survives
> as `packages.md` §12.19 plus a source comment. **The struck sentence is left here rather than deleted
> because it was published, and this plan retracts in place.)*

**What is measured to be missing.**
- **`Citizen` has no skill, no work-type mask, no priority and no work-rate multiplier.** Full field
  list verified at `sim/Sim.Core/Entities/Citizen.cs:7-81`; the only per-citizen work gate in the
  entire type is `IsRecruitableForWork` at `:103`, a boolean. `git log -- '*Skill*' '*Priority*'
  '*WorkType*' '*Assign*'` returns **zero commits in 555**.
- **Dispatch is a distance-only tournament with no per-citizen filter.** `TryAssign`
  (`sim/Sim.Core/Jobs/JobSystem.cs:261-273`); the decisive line is `:284`
  `if (cand < 0 || d >= bestDist) continue;`. Ties break by source registration order
  (`DefaultSources()`: Dig, Haul, Build, Deconstruct), then board order, then citizen store order.
- **Power is condition-blind on BOTH sides.** `sim/Sim.Core/Systems/PowerSystem.cs:185` is
  `_generation[d.NetworkId] += def.GenerationKW;` with no `Condition`, no `IsOperational`, no
  `EffectiveRate`; the file says so itself at `:175-179` — *"a wrecked SolarWing still supplies its
  full kW"*. Demand is condition-blind too (`:187-188`, `IsWanting` at `:262-266`).
  ⛔ **REVISION 1 — MY CONCLUSION FROM THAT, *"there is no asymmetry to exploit"*, IS STRUCK.** It is
  false at the level that matters. A worn **scrubber** pays its full draw for reduced output: its wear
  is already expressed, as a deliberate penalty. A worn **SolarWing's only output IS power**, so its
  wear is expressed **nowhere at all**. The two cases are not symmetric, and the correct move follows
  from that — §"Contents" item 6.

> #### ⭐ THE SIZING FINDING — REWRITTEN IN REVISION 1. I was right that a flat veto is insufficient and **wrong about why**, and the real answer is bigger than either version.
>
> **What every charter says.** The plan of record locates W7's seam as *"a per-(citizen, JobKind)
> multiplier or veto applied inside that loop — nothing else in the dispatcher needs to change"*
> (`wreck-start.plan.md:1984-1991`).
>
> **⛔ WHAT REVISION 0 SAID, AND IT IS REJECTED.** I concluded that OD-A requires changing the system
> stack's evaluation order, because `SystemStack.cs:33-37` runs `JobSystem` before `SustenanceSystem`,
> `CraftingSystem` and `MaintenanceSystem`. **The observation is true and the conclusion does not
> follow.** A reorder inverts a **fixed global precedence**: it makes Repair beat Haul *for every pawn,
> always*. It cannot express Haul@1 / Repair@4 — which is the entire content of *"we define which pawn
> can do what"* — so **it delivers none of OD-A**, while costing a pin move and lifting
> `MaintenanceSystem` above `MachineWearSystem`, changing the service interleave. **Removed from
> Contents and from NEW.**
>
> **⭐ THE ACTUAL CAUSE, measured: `JobKind.Maintain` and `JobKind.Craft` have NO `IJobSource` at
> all.** `_byKind[6]` and `_byKind[7]` are **null**. `HandledKinds` supplies four of the six work
> types and **misses exactly the two OD-A is about**. ⇒ A priority *band loop* fails in precisely the
> same place a flat veto does: there is nothing in the dispatcher to rank. Neither the reviewer's
> first shape nor mine addressed this.
>
> **⇒ THE ADOPTED SHAPE (integrator ruling, shape (c)).** Per-citizen priority bytes as hashed state,
> in one commit, **with the reserved skill byte** (§3.2's batching argument survives intact); the veto
> applied at **all four** assignment sites; and `TryAssign` iterates bands high→low and, *before*
> running the argmin at band *b*, asks each push recruiter whether it has a claimable job at band *b*
> for this citizen — **leaving the pawn idle for it if so.** One tiny new interface. **No `Select`
> change, no `HandledKinds` change, no stack change**, and — decisively — **neediest-first is
> preserved**, which OD-A requires. *(Shape (b), promoting maintenance to a full `IJobSource`, is
> rejected for exactly that: it silently amends neediest-first to nearest-needy.)*
>
> **⭐⭐ AND THE DOMINANT TERM IS NEITHER OF OURS: JOB-DURATION MONOPOLY, PLUS THE TOTAL ABSENCE OF
> PRE-EMPTION.** Measured by review on a driven sim: **a player's strip order waited 54 650 ticks —
> 1 hour 31 minutes of sim time — behind six chained 900 s Maintain services.** `IsRecruitableForWork`
> requires `JobKind == None`, and **nothing in the sim can take a busy pawn back.** The only
> pre-emption that exists anywhere is `SafetySystem.cs:232-238`. ⇒ **A perfect priority grid, shipped
> alone, would not have moved that number by one tick.** The player would set Repair@4, Haul@1, and
> still wait an hour and a half — and would reasonably conclude the grid does not work.
>
> **⇒ M2 THEREFORE CHARTERS THREE MECHANISMS, NOT ONE:**
> **(a)** the per-citizen work-type filter · **(b)** cross-family ranking (the band loop + the
> recruiter query) · **(c) PRE-EMPTION — its own package, its own risk row (R1b), and its own rule for
> when a job may be dropped.** The hard cases are named now rather than discovered: mid-haul carrying
> cargo · mid-craft against a bill · mid-build with material already delivered. **The abandon paths
> already exist per source, and `JobContext.cs:93` already normalises the release** — so the mechanism
> is cheap and the *policy* is the work.
>
> **The fourth assignment site, which nobody had counted.** `EffectValidator.cs:141` writes
> `citizen.JobKind = JobKind.Dig;` directly from the LLM effect pipeline, bypassing `TryAssign` and
> **not consulting `IsRecruitableForWork`**. The plan-of-record's warning that *"forgetting the last
> two is how this lane ships half-done"* is right about the shape and **wrong about the count: four
> sites, plus `SafetySystem`'s pre-emption.**

**Contents, in landing order.**
1. **The state.** Per-citizen work-type priorities as hashed `Citizen` state, RimWorld-shaped:
   ~6–8 work types, each *disabled* or *1–4*. ⭐ **Land the skill field's STORAGE in the same
   commit, zeroed and with no consumer** (see §3.2 — this is the one place batching is correct).
2. ⛔ **THE WORK-TYPE VETO — "four sites" IS VOID; IT IS `11 / 5 / 3`.** Re-derived from the code:
   **eleven claim sites behind FIVE gates** — `TryAssign` (covering the four `IJobSource`s) ·
   `CraftingSystem` · `MaintenanceSystem` · `EffectValidator.cs:141` (which writes a `JobKind` with no
   gate at all) · ⭐ **`CapabilityComputer.cs:70-76`, the offer mirror no revision had counted** — plus
   **three exclusions and two named non-sites.** Full table in `perilune-roadmap-q3.packages.md` §5,
   M2-2.
   ⛔⛔ **AND `SustenanceSystem` MUST NEVER BE GATED — this line listed it and that is the error §12.3
   exists to stop.** It recruits on `IsIdleForWork`, deliberately **not** `IsRecruitableForWork`;
   gating it means **switching off enough work types starves a crew member.** *(Eat, Drink and Flee are
   not work types.)*
3. **Cross-family ranking.** `TryAssign` iterates priority bands high→low; before the argmin at band
   *b* it asks each push recruiter *"do you have a claimable band-b job for this citizen?"* and leaves
   the pawn idle for it if so. **One tiny new interface. No stack reorder, no `HandledKinds` change,
   and neediest-first preserved.**
4. ⭐ **PRE-EMPTION — its own package.** A busy pawn can be taken back. Without it the grid is
   cosmetic for up to **1 h 31 min of sim time** (measured, above). Policy first, mechanism second:
   which job families may be dropped, and in what state.
5. **Repair becomes a work type.** `MaintenanceSystem.RecruitForNeediest` is not thrown away; it is
   brought under the grid, exactly as OD-A specifies. **Its neediest-first machine choice is
   preserved** — that is a requirement, not an implementation detail.
6. **The direct order.** Right-click a machine → *"Prioritise: repair wing_c"* → the pawn drops its
   job and goes now. *(This is a consumer of item 4; it cannot ship before pre-emption exists.)*
7. **The Work tab** on the standard surface (Overview), pawns × work types. ⚠️ **Never on the
   console `.app` shell** — that is the invariant E0-4's WP-5 broke.
8. ⭐ **POWER — and the order within it is a ruling, not a preference.**
   **8a. FIRST, fix the off-network authoring defect (§0.2).** `AuthoredShips.cs:1441-1443` believes
   deck 1 carries no conduit and therefore neither draws nor runs; measured, **0 of 626 devices are
   off-network**, because `PowerSystem`'s claim rule is 6-way and a deck-1 device claims the deck-0
   conduit through **−z**. With deck 1 genuinely off-grid, flat demand is **14.30 kW**.
   **8b. THEN gate generation by `EffectiveRate`.** ⛔ **Keep `IsOperational` OUT of the generation
   term.** With it, boot generation is **7.47 kW** and `wing_c` at 0.06 contributes *literally
   nothing* — the repair cliff both the reviewer and I argued against. `EffectiveRate` alone gives a
   gradient, and the gradient is the owner's sentence in arithmetic:
   > authored wings → **10.65 kW** (Industry and Comfort shed) → repair `wing_c` → **13.47 kW**
   > (**the benches run**) → repair the rest → **18.00 kW** (**the lights come on**).
   **8c. Demand stays FLAT.** Do not scale `draw` by `EffectiveRate` — that rewards a wrecked ship
   with a smaller bill.
   **8d. It also fixes §0.1**, the live h0 16/16 → h7 0/16 blackout, which is true *today* with
   generation condition-blind.
   ⚠️ **8e. This is NOT pin-neutral, and revision 0 assumed it was.** It alters the power balance on
   `--ship perilune` and `--ship slice` — **both tick-3000 goldens**. It joins the pin chain (§3.2).
9. **The `why` line.** `GameSession.TaskLabel` (`:2556-2634`) already builds an honest prose sentence
   per pawn and ships it on the roster wire to *both* standard surfaces (`overview-view.js:697`,
   `:747`; `roomzoom-view.js:700`). It says *what*, never *why that job and not another*. Give it the
   reason: *"Repairing wing_c — Repair is your priority 1"*. This is the owner's axis 5 — *autonomy
   legible* — for almost nothing, on a seam that already exists.

**REUSES.** `MaintenanceSystem.RecruitForNeediest` (the entire repair autonomy, already written and
already measured) · `JobSystem.TryAssign` and its four `IJobSource`s · `TaskLabel` → roster wire →
both surfaces · `WorksiteSafety.CanStageWorkerAt` (a priority cannot override physics) · M1's
`blocked` channel for every refusal this creates · `MoveCitizenCommand` (`Commands.cs:56`) as the
precedent for a per-pawn direct order · the def-field-in-one-commit ritual · the save-chapter /
hash-fold / round-trip ritual · `ArchitectureBoundaryTests`' `("Skill", "does not exist anywhere in
sim/ yet")` row, which becomes the first thing this milestone deletes.

**NEW.** Per-citizen work state (priority bytes + the reserved skill byte); a band-then-distance
dispatcher with a recruiter-claim query; **a pre-emption rule and the policy behind it**; a
`PrioritiseJobCommand`; the Work tab; an `EffectiveRate` term on the **generation** side of
`PowerSystem` only. ⛔ **NOT the stack re-order** — struck in revision 1.

**Dependency, and why it cannot move earlier.** It needs **M1**. A grid whose effects you cannot see
is a table of numbers: if `fabricator_1` is invisible and a stalled order is silent, "Rell will not
repair it" and "Rell cannot see it" look identical, and the first serious bug report of the
milestone will be unfalsifiable. It also needs M1's un-designate, because the first thing a player
does with a new frame is change their mind. It does **not** need the thaw, and it must **not** wait
for it (§3.1).

**Size: LARGE — and revision 1 re-founds the justification.** It is **not** large because of the
stack re-order (struck) and it is **not** large because of the UI. Three things make it large:
**(a) PRE-EMPTION.** A mechanism the sim has exactly one instance of (`SafetySystem.cs:232-238`),
now needed generally, whose *policy* — when may a pawn be taken off a job it is halfway through —
is a design question with no precedent here and three named hard cases.
**(b) THE MULTI-SITE UNIFICATION** *(said "FOUR-SITE"; the census is **`11 / 5 / 3`** — see Contents
item 2 and the packages document's M2-2)*. One rule enforced at five gates, two of which
(`Maintain`, `Craft`) have no `IJobSource` to hang it on and one of which (`EffectValidator`) nobody
had counted.
**(c) THE PIN RITUAL.** New hashed `Citizen` state bumps the CITZ save chapter ⇒ P1/P2/P3, def'd
defaults ⇒ P4/P5 — **all five** — plus a separate, separately-attributable move for the power term
(§0.2 + 8b), which touches **two tick-3000 goldens**.
And a consequence, not a cost: every occupancy and A1/A2/A3 number in the repo is invalidated the day
it lands. Under OD-B that is a **re-baseline, not a regression hunt.**

**FIVE-MINUTE BROWSER DEMO — and it is written to be FALSIFYING, not confirming.** ⚠️ *Revision 0's
demo, like its spike, would have passed on the shipped sim with nothing built: **Repair already beats
a painted strip order today**, because Maintain monopolises the pawn.* So the demo runs the
**inverting** direction:

`./play.sh` → open the **WORK** tab → Rell: **Haul 1, Repair 4** → paint six STRIP orders in the next
hall → **she strips, and she does NOT go to `wing_c`** *(this is the leg the shipped sim cannot
produce)* → the task line says *"Stripping — Repair is priority 4"* → now flip to **Repair 1, Haul
4** → **she abandons the strip mid-job** and walks to `wing_c` *(this is the pre-emption leg)* →
right-click `battery_2` → **Prioritise: repair** → she drops `wing_c` and walks → when the wing
completes, generation steps **10.65 → 13.47 kW**, the benches come back, and a dark room's lights come
on. *(Max speed; a service is 900 s of sim time.)*

---

### M3 — THE SECOND SOUL *(weeks 7–9)*

> **Player-facing statement.** *"I can earn a second crew member, choose which one, and the choice
> changes what my ship can do — and the third, fourth and fifth do not all arrive at once."*

**This milestone IS OD-B's re-chartered gate**, verbatim: *"One crew member, starting alone in a
wrecked ship, can reach a second thaw — and thaws 3, 4 and 5 do not all arrive in the same
sim-hour."*

**Contents.**
1. **W5a — `CryoSystem`.** Today `DeviceKind.CryoPod = 27` exists (`Device.cs:37`) and **there is no
   `CryoSystem` anywhere** — verified: `grep -rn "CryoSystem" --include="*.cs" .` returns three hits,
   all of them comments asserting its absence. The pod is a prop with a `Condition`, a state-picked
   glyph pair and a power draw.
2. **W5b — `ThawGate` + `ThawCommand` + the MOSS pod screen.** The thaw is a **MOSS screen verb, not
   a MOSS language verb** (`wreck-start.plan.md` §W5.3): `ScriptRuntime.Tick` consults no device at
   all, so a ten-line installed program could empty the bay unattended.
3. **W5.5 — the emergency thaw**, in `CryoSystem` and *never* as a hole in `ThawCommand`, plus the
   lose screen when no intact pod remains (OD-10, decided).
4. **OD-11 and OD-12 resolved and printed.** They are the same pacing dial seen twice; set the pod
   census first, then tune the price. The census must be printed and asserted
   (`pods 8 · open at boot 1 · intact 5 · wrecked 2 · thaws available 5`) so a later edit cannot
   drift it silently.
   ⭐ **AND A COLLISION NOBODY HAS FILED, added to M3's decision batch in revision 1: `Device.Name` is
   doing two jobs.** W5's design puts the sleeper's identity in `Device.Name` (*"who is inside"*,
   `Simulation.cs:469`) — but `Device.Name` is **already the MOSS registry key**, and the wreck's
   pods already encode a person in it (`AuthoredShips.cs:1678`). One field cannot be both a stable
   automation identifier and a mutable "who is in the box" without the two meanings diverging the
   first time a pod is emptied and re-used. **Decide it before `CryoSystem` is written**, not after
   the save chapter is frozen.
5. **SKILLS — the mechanical half of OD-5.** *This is why the grid comes first:* the skill is a
   second column on a table M2 already built and already paid the chapter bump for. It changes work
   rates, which is sim-canonical by definition and cannot live in the host-side persona layer
   (gate-proven out of determinism at `Simulation.cs:386-388`).
6. **Authored persona sheets for the sleepers** — writing, not engineering, and cheap. The pattern
   exists (`AuthoredShips.cs:577-790`).
7. **W6 — REST.** `Citizen.Fatigue` saturates at 1.0 after ~16 h and **nothing anywhere reduces it**
   (`NeedsSystem.cs:26` says so in its own words; the `// 1 = exhausted (slows work)` comment at
   `Citizen.cs:49` is **false**). Every crew member on every ship carries a flat −25 mood forever.
   Two people means shifts; *"repair a bed"* is the owner's own named early task; and rest must enter
   under M2's priority frame or it becomes a fifth out-of-band claimant. ⚠️ It changes the mood curve,
   and mood is not cosmetic — `ShipMetrics.Morale` feeds `DirectorSystem.cs:82` which drives
   `_wearPressure` which `MachineWearSystem` reads. **Removing a flat −25 changes machine wear rates
   on every ship.** Measure it; say so.
8. **A HEATER.** *"The ship freezes outside the cryo bay and no authored value fixes it — there is no
   heater device in the game; a radiator can only take heat out"* (`MECHANICS.md` §13.22e). Because
   `CanStageWorkerAt` counts thermal, a freezing compartment is *unworkable*, so **the pressure
   frontier cannot expand past the heated core and the thaw curve terminates.** This is a content
   hole that blocks M3's own gate.
9. **The dead deck.** `W4b-DEAD-DECK`: the sim has **no vertical gas term at all** and the wreck's
   two `AirVent`s are both on deck 0, so all eight deck-1 halls peak at 0.000 kPa forever. The owner
   decided to *ship it filed*; that decision is respected, but a thaw curve needs somewhere to put
   people. **Put "author a deck-1 vent" in this milestone's owner-decision batch** (see §3.5). ⛔ Do
   **not** close it by re-pressurising in `AddRoomCommand` — that is the wand W4b deleted on a binding
   owner decision.

**REUSES.** The MOSS terminal screen and its `moss` op path (`client/src/ui/moss-screen.js`,
`GameSession.HandleMoss`) — this is what finally gives *"restore MOSS"* a job · the cryo art, already
drawn (`client/src/items/cryo.js`) · **no new `Device` field is needed** — occupied/open is `IsOpen`,
who is inside is `Name`, the cycle is `Progress`, all already hashed and saved (`Simulation.cs:454`,
`:469`, `:464`; DEVC v1/v2) · `Simulation.AddCitizen` (`:197-202`) · the Chronicle/`HistorySystem`
and the `DeconstructCompletedEvent` pattern · M2's `Citizen` work table, which the skill field slots
into · `AuthoredPersona`.

**NEW.** `CryoSystem`, `ThawGate`, `ThawCommand`, the MOSS pod screen, the emergency-thaw branch, the
lose screen, skills' *consumers*, `RestSystem` + `JobKind.Sleep`, a heater `DeviceKind` + def row.

**Dependency, and why it cannot move earlier.** OD-5 is binding: *"if the people are identical, the
choice is a name in a list."* Skills are the answer, and skills need a per-pawn table to live in —
which is M2. Independently, the thaw's headroom gate presumes a life-support loop that *works*, which
presumes the repair frame. **The honest counter-argument is in §3.3.**

**Size: LARGE, and the schedule is the cost, not the code.** Three pin-moving waves that cannot run
concurrently (`CryoSystem`'s seed fold; skills' consumers if they add state; rest's behaviour change,
which will move P1–P3 on every ship). Registering an *empty* system moves three pins — W0-6 measured
exactly that.

**FIVE-MINUTE BROWSER DEMO.** At max speed: repair and commission the MOSS terminal → open MOSS →
a **POD BAY** screen listing eight capsules, five intact, two wrecked and named *NO SIGNAL*, one open
→ pick one → a refusal with a written reason if the ship cannot carry her yet, or a cycle that runs
and opens → she steps out, is named in the Chronicle, appears in CREW WATCH, and **her row in the
WORK tab has different skills from Rell's**.

---

### M4 — THE PERSON *(weeks 10–11)*

> **Player-facing statement.** *"I can click anyone aboard and get one window that tells me who they
> are, what they're doing, why, and how they are — and every number in it is true."*

**Why it is here and not earlier.** A Persona window with one person in it is a business card. It
belongs after there are people to compare, and after M2 gives the *"what is she doing and why"* line
real content.

**Contents.**
1. **The Persona window — one door from the map to a person.** ⚠️ **There is no design document for
   it.** The console-retirement plan §1.5.4 is explicitly *"marked, not designed"*: layout, tabs,
   whether it hosts orders, and whether it ever surfaces a transcript are all open. **This milestone
   opens with a design package, not an implementation package.** The seam is one function body
   (`openPersonaForSelected`) and the census that guards it is
   `client/test/surface-boundary.test.js:856` — `CREW_INTERACTION = ['openBioForSelected',
   'talkSelectedCrew']`, which the Persona window must **shrink to one**, not join.
2. **Stop lying in the dossier.** The shipped citizen card (`client/src/ui/panels.js:297-420`) is
   **four of eight sections fully fabricated** and one half fabricated: NEEDS (`:328-336`), YOUR
   STANDING (`:338-346`), BACKSTORY (`:389-392`) and RECENT MEMORIES (`:394-401`) are seeded
   placeholders (`SAMPLE_*` at `:248-266`). Identity, traits, relationships and the conversation log
   are real.
3. **Make the remaining gauges honest — or stop drawing them.** `Citizen.Health` is **never written
   by any system** (`Citizen.cs:31`) despite a doc comment claiming *"damaged by hypoxia, cold and
   struggle"*; `Persona.RoleNow` is a cosmetic string (`MECHANICS.md` §13.5); `Citizen.Archetype` is
   saved and hashed with no reader anywhere. *(`Citizen.Morale`'s constant bar was **pulled forward
   into M1** in revision 1 — it is a first-screen lie and should not wait ten weeks. What remains here
   is the **decision**: does morale become real, or stay gone?)*
4. **The onboarding card's full rewrite (WP-C).** It teaches exactly **TALK** and **BUILD**
   (`client/src/ui/onboarding.js:18-27`, `:39-46`) — naming none of DIG, STOCKPILE, STRIP, OPERATE,
   the Room Zoom, the deck rail, or the work grid. **The first thing a new player reads teaches the
   one verb the owner stood down.** *(The factually-wrong `B` key row was **pulled forward into M1**
   in revision 1 — a card that lies about a keystroke is a bug, not a content task.)*
5. **Two client-local illusions.** RUG and SHELF are palette tools that **send nothing on the wire**
   (`roomzoom-view.js:988-991` — module-local `_decor`). The player places furniture that does not
   exist, will not save and no crew member can ever see. Either wire them or remove them.
6. **WP-9 — the console deletion.** `hud.js` splits into the shared `ship-state.js` plus the dying
   `.app` chrome. Its own record deflates it: *"the anti-recurrence goal was met at WP-0, not at
   WP-9"* — it is *"cleanup that can wait for a quiet week."* It carries a **hard human gate**:
   a person must play `--ship grid` end to end first, and *"no agent can be that human."* Schedule it
   here; let it slip without guilt.
7. **Two channels that reach nobody.** `chron` is emitted, cached, and unreachable — CHRONICLE is an
   `INERT_TAB` (`overview-model.js:262`) and `overview-view.js:1024` refuses to select it. The
   Chronicle is VISION's stated emotional payload and **the standard surface cannot open it.**
   `legend` and `inspect` write only console-shell ids and die with WP-9.

**REUSES.** The roster / `citizen` / `relations` / `chron` wire channels (all four already emitted) ·
`panels.js`'s window chrome, which mounts into body-level `#panels` and therefore survives WP-9 for
free · `relations-view.js` · the persona/MEMS layer, fully built · `surface-boundary.test.js`'s
census as the enforcement mechanism.

**NEW.** A Persona window design and its implementation; honest morale/health (or their removal); a
rewritten onboarding card; a reachable Chronicle.

**Size: MEDIUM.** Mostly client and host. The one part that can move pins is making `Morale`/`Health`
real; if the owner prefers that, it joins the pin chain — otherwise deleting the bars is free.

**FIVE-MINUTE BROWSER DEMO.** Click any pawn → one window opens → it names her, her traits, what she
is doing **and why**, who she is close to, how tired and how hungry she is with numbers that move
when the sim moves, and her recent history — with **no `◇ SAMPLE` badge anywhere in it**. Press `?`
→ the intro card names the verbs the game actually has. Open CHRONICLE from the standard surface and
read the ship's own log, including the entry for the person you just woke.

---

### M5 — A RUN WITH A SHAPE *(weeks 12–13)*

> **Player-facing statement.** *"I can sit down, play the wreck for an hour, and the session has a
> beginning, a middle and an ending I can tell someone about."*

> ### ⚠️ REVISION 1 — M5 WAS A BUCKET, AND ITS DEMO PROVED THE WRONG THING
> Revision 0's demo was *"quit, reload the save, and be in the same place"* — which demonstrates
> **save/load**, not *"a beginning, a middle and an ending"*. Worse, **save/load does not exist**
> (§0.4): `SaveWriter`/`SaveReader` appear only under `tests/`, no host writes or reads one, and
> `CmdKind` has no verb for it. Revision 0 listed a multi-week project as a bullet in a slack
> milestone. **It is now sized honestly and explicitly allowed not to fit.**

**Contents, in priority order — the first three ARE the milestone.**
1. **THE ENDING.** The lose screen (M3's `CryoSystem` branch fires it when no intact pod remains) and
   a *"the ship is yours"* state with a stated condition. **This is what the player sentence promises
   and it is the only item that must land.**
2. **THE MIDDLE.** A stated mid-game goal, and **alerts** — so a crisis reaches the player instead of
   waiting to be noticed. Without alerts an hour-long session is an hour of watching.
3. **An art and legibility pass on the wreck**, judged from browser shots by the owner
   (`review seams, not art`) — and **the second hard human gate: a real 60-minute owner playtest plus
   the P2 blind-A/B screenshot verdict**, both exit bars this project has carried unmet since
   2026-07-21. *(The first human gate is at the end of week 9 — §8 item 4. Revision 1 moved it there
   deliberately: a plan with all its human gates in the last week has none.)*
4. `ItemKind.Regolith → Rubble` (OD-6, decided; **moves no pin**, but touches sim, content, client art
   ids and tests at once, so it **runs alone** — a clean auto-merge would prove nothing).
5. **The device-removal hole** — a built door cannot be removed by any verb on any surface
   (`DeconstructSystem.cs:378` refuses `Door`; DEMOLISH refuses it; `Cmd.remove` is gated out at
   `roomzoom-view.js:1084-1102`).
6. ⚠️ **SAVE/LOAD — sized, and NOT promised.** It is four things, not one: **host file IO** (a home
   nobody has chosen) · **a restore path** (`Simulation` is built by `SimHost.Build`; nothing
   re-enters it from a file) · **wire resync** (every client channel must re-baseline against a
   world it did not watch load — `GameSession` keeps *one global* session and every delta gate
   assumes continuity) · and **the unhashed layer**: personas, MEMS minds and the Chronicle are
   deliberately outside determinism (`Simulation.cs:386-388`), so a save that restores the sim but
   not the people restores a ship of strangers. ⇒ **Its own milestone-sized lane.** If the quarter is
   on schedule it starts here; if not, it is the first thing that moves out, and this plan says so
   now rather than discovering it in week 13.

> **⭐ THE DESIGN BET M5 IS MAKING, NAMED — with its fallback.** This plan gives the wreck **no
> antagonist and no event system.** All tension is endogenous: wear, air, heat, food, and the rising
> draw of each person you wake. That is VISION pillar 1 (*"no random events — every crisis emerges
> from operating conditions"*) taken literally, and it is a **bet**: it assumes the pressure frontier
> plus the thaw curve are enough to carry an hour.
> **The early warning that the bet is losing:** the middle of a session goes quiet — the player has
> repaired what matters, the frontier is stable, and nothing is asking anything of them.
> **The fallback, if it does:** the **Director already exists, is registered, and is gentled to a
> 1.35 lever** with a hard rule that it never rolls dice — it modulates *when* sim-legal pressures
> arrive. Widening that lever is a tuning change, not a new system. **Do not answer a quiet middle by
> building an event system**; that would break pillar 1 to fix a pacing problem.

**REUSES.** Everything. This milestone adds almost no mechanism; it makes what exists into a session.

**Dependency.** Everything before it. An hour-long session needs a reward loop (M3), a reason to give
orders (M2), and feedback when they fail (M1).

**Size: MEDIUM for items 1–5; item 6 is LARGE and is explicitly the quarter's release valve.**

**FIVE-MINUTE BROWSER DEMO.** Load the wreck with one intact pod left, at max speed, and walk the last
crew member into vacuum → **the run ends, on screen, with the ship's chronicle as its epitaph** — and
the ending names the people who were aboard. *(An ending is the only thing you can demonstrate in five
minutes; the middle is demonstrated by the week-9 and week-13 playtests, not by a click sequence.)*

---

## 3. The ordering argument

### 3.1 The work-priority grid: it goes SECOND

The plan of record has it **seventh** — `W0b · W4 → W3 → W4b → W5a → W5b → W6 → W9 → W10 → W7 → W8`
(`wreck-start.plan.md:1091`) — on the stated grounds that *"it moves all five pins and it is the
biggest lane in this document"* (`:397`, `:1962`). **That position does not survive OD-A, and it did
not survive its own reasoning even before OD-A.**

1. **OD-A makes it the mechanism, not a refinement.** Repair is a work type governed by the grid.
   Scheduling repair before the grid builds the override without the frame it overrides.
2. **Its only real blocker is discharged.** W7 *"must NOT be started before `--ship wreck` boots
   (W3)"*. The wreck boots and is the shipping default (`hosts/web/Program.cs:61`,
   `ShipChoice.Wreck`, pinned by `WebHostDefaultShipTests`).
3. **"It is the biggest lane" is a COST argument being used as an ORDER argument, and that is the
   documented failure mode.** The audit names it directly (§3.1 of the priority report): a correct
   invariant produced a wrong queue. Pin cost tells you a wave must **run alone**; it tells you
   nothing about **when**. Four of the remaining waves move all five pins — being expensive cannot
   demote all of them, or nothing ever ships.
4. **It does not go FIRST.** M1 comes first because a grid whose consequences are invisible is a
   table of numbers, and because the milestone that follows it needs its refusals legible to be
   debuggable at all. Two weeks is a cheap insurance premium on a four-week lane.

**And it splits from skills, against the plan of record.** `wreck-start.plan.md:1974` insists *"the
two halves are one wave — a priority without a skill is a preference."* **A preference is exactly
what the owner asked for**: *"we define which player can do what."* In RimWorld a colonist with 0 in
everything still obeys the grid. The priority table answers the owner's axis 4 and OD-A; the skill
table answers OD-5, and OD-5's consumer — *"who do I wake?"* — does not exist until M3.

⚠️ **The split has a real cost and it is paid, not waved away.** Two `Citizen` state additions mean
two CITZ chapter bumps. **Mitigation, and it is the one place batching is correct:** land the skill
field's *storage* in M2's commit, zeroed and unread, and let M3 give it a consumer. The precedent is
exact — W0-1b folded **thirteen** saved-but-unhashed fields in a single pin move. This costs M2
nothing (the chapter is bumping anyway) and saves M3 an entire re-pin.

### 3.2 The determinism-pin tax: batch the LANE, never the COMMIT

**Decision: do not batch pin-moving changes into one re-pin commit. Batch them into one standing
lane.**

The reason is the plan's own: *"concurrent state-pin moves cannot be attributed — a moved hash tells
you *that* something changed, never *what*."* Combining two behaviour changes under one re-pin
destroys the only thing the pins are for. What the input report correctly observes — *"sequenced as
one lane the tax is paid once"* — is true of the **serialization**, not of the commit.

**So:**
- **One standing DEEP LANE owns the whole quarter's pin chain**, publishes its order in advance, and
  never runs two pin-movers concurrently. Published order *(revised in revision 1: the stack re-order
  is struck; the power term is added, because it is **not** pin-neutral — it moves the `perilune` and
  `slice` tick-3000 goldens)*:
  **M2-a** citizen work state (priority bytes + the reserved skill byte) → ~~**M2-b** pre-emption~~ →
  **M2-c** the off-network authoring fix (§0.2) → **M2-d** the `EffectiveRate` generation term →
  **M3-a** `CryoSystem` → **M3-b** skills' consumers → **M3-c** rest → **M3-d** the heater def row.
  ⛔ ⭐ **THIS ORDER IS STALE AND THE PACKAGES DOCUMENT'S §2 IS THE AUTHORITY.** `M2-b` was **struck**
  (the M2-0 spike measured pre-emption at 0 lines in `sim/`), and **four rows have been added since**:
  **M1-a** the `Craft` thrash · **M1-b** the crafting staging rule · **M1-c** the silent BUILD haul ·
  and ⭐ **M2-e, the work-type veto, which OD-H turned from provably pin-neutral into a behaviour
  change on every ship.** ⚠️ ⭐ **A chain of EIGHT re-pins is now a chain of NINE TO ELEVEN, and the
  spread is the honest part** — counted from the packages document's §2 table, not computed:
  ~~`M1-a`~~ **RETRACTED (M1-H measured pin-neutral, all five held)** · `M1-b?` · `M1-c?` · `M2-a` ·
  `M2-e` · **`M2-g`** *(new — OD-J's cost)* · `M2-c` · `M2-d` · `M3-a · M3-b · M3-c · M3-d`, where `?`
  marks a row whose place is **not yet measured** and which leaves the chain if it proves neutral. **Three of the four new rows are live `main` defects found by driving the sim,
  and one is OD-H's own cost.** *(Struck rather than rewritten, because §11's rule is that
  published ids are stable — the letters record history, not sequence.)*
  Each gets its own re-pin commit (`ci.sh` + `CLAUDE.md` + `MECHANICS.md` + `HANDOVER.md` + memory,
  in the same commit — the ritual).
- ⭐ **ROLLBACK POINTS, named in advance** *(new in revision 1)*. A chain of eight re-pins has no
  natural place to stand back up if one is wrong, because every later pin is measured against the
  earlier ones. ⇒ **Tag `main` after M2-a and again after M2-d**, and record both tags with their five
  pin values in the same commit that creates them. **M2-d is the designated rollback point for the
  whole power package**: §0.2 and 8b change ship balance on two goldens, and if the resulting curve is
  wrong the honest move is to return to a measured tree, not to tune forward from an unmeasured one.
  A rollback point costs one tag and one table; discovering you needed one costs a re-derivation of
  every pin after it.
- **Every other lane must be pin-neutral and must PROVE it mechanically**, with the check the
  ground-item lane established: `git diff -- tests/Perilune.Tests/Golden/ ci.sh content/` = 0 lines.
  "Client-only" and "pin-neutral" are different claims; a lane that touches `hosts/` can only make
  the second (`wreck-start.plan.md:1195-1201`).
- **Batch STATE LAYOUT, not behaviour.** When a save chapter must bump anyway, land every field that
  milestone-group will need, zeroed. That is W0-1b's shape and it is the only free lunch here.

### 3.3 The thaw (W5): third, and the counter-argument stated honestly

**It goes third**, and the reason is the owner's own: OD-5 says who you wake must matter
mechanically, and *"if the people are identical, the choice is a name in a list."* A second identical
pair of hands is not a reward; it is a second cursor.

**The honest counter-case, which I do not dismiss.** The thaw is the game's only reward loop; the
pods are inert props today (`Device.cs:37`: *"INERT IN THIS LANE — no CryoSystem, no thaw"*); and
this plan makes the owner wait **six weeks** for the second act. Three things reduce that cost and
they should be checked, not assumed:
1. **M2 has its own reward** — the lights come on. That is the owner's literal example, and it is a
   visible payoff in week 6, not week 9.
2. **The thaw's own gate needs M2 anyway.** `ThawGate`'s binding terms are scrubbing and food
   headroom; on a wreck those come from repairing life support, which is M2.
3. **If M2 slips, the mitigation is to ship W5a/W5b WITHOUT skills** — the thaw mechanism is
   independent of the grid — and add skills in M3 as planned. This is a real fallback, and it costs
   one milestone's worth of "the choice is a name in a list". **State it now so it is a decision
   later and not an improvisation.**

### 3.4 What is DROPPED or PARKED, and what that costs

| what | status | the cost, stated |
|---|---|---|
| **Economy E1–E4** (OD-B) | **PARKED at E0-complete.** Do not open E1. | Grid's water stays conjured by B-2's makeup floor; no ore, trade or production graph; the four empty systems (`ZONE`/`PROD`/`ORES`/`TRAD`, `SystemStack.cs:50-53`) keep folding pins for nothing. **A1 stays FAIL and that is now correct** — it measures "% of crew busy" over a population of one. |
| **A1 as a goal** (OD-B) | **RETIRED.** Regression statistic only. | We lose the only number the economy programme was steered by. That is the point: it scored a livelock at **91 % busy** that produced zero services, and it has fooled this project five times. |
| **P3 "The Voyage"** — nav, sensors, derelicts, away missions | **PARKED for the quarter.** | VISION pillar 3 (*"the ship is a society that travels"*) does not advance; the "is one ship enough?" answer slips a quarter; `NavSystem` keeps ticking one comet. **This is the largest deliberate omission in the plan** and it should be the first thing the owner overrules if he disagrees. |
| **MOSS / WS-MOSS v1** — `on event:`, the dry-run evaluator | **PARKED**, except the thaw screen. | VISION pillar 4 does not advance. **Honest note: parking it costs nothing running.** Excluding the founding import, `sim/Sim.Dsl` has ~56 lines of churn in the repo's entire life. It is a migrated asset, not an ongoing cost, and M3 finally gives the terminal a job. |
| **W9 — the `Degraded` bit** | ⛔ **DROPPED from the quarter** (this is a change to the plan of record). | OD-3 stays open and the eight wrecked-resource art pieces stay unkeyed. **Reason:** the charter's own §4 W9 admits *"the reprocessing bill has nowhere to run"* — all three benches carry a bill at ordinal 0 — so it ships a **one-way debuff**: a punishment with no verb, which is the exact shape of every invisible-refusal defect in this repo. It should follow a `Reprocessor` station, not precede it. |
| **W10 — `Regolith → Rubble`** | **KEPT, in M5 / overflow.** | Nothing. Pin-neutral, owner-decided, and it runs alone for textual reasons only. |
| **Guard-hardening as a PROGRAMME** | **CAPPED.** | Implement + independent review stays (binding orchestration rule, and the strongest thing about this repo). What stops is chartering *packages whose deliverable is a better guard* — 44–52 % of churn, with eleven "owed follow-ups" of which not one is player-facing. A guard fix rides inside the package that needs it. **Cost: some known-dead guards stay dead**, and that is an accepted, named debt. |
| **The character-simulation substrate** | **PARKED pending its five open decisions**, then overflow. | It is a **fifth** five-pin, new-hashed-`Citizen`-state lane that nobody has sequenced against the existing four (`wreck-start.plan.md:2131-2132` sequences four). It also has no cross-reference to W7 in either direction — a roadmap gap this plan closes by naming M2 as the *"assignment verb"* its own §12 item 5 asks to be acknowledged. |

#### The LLM / dialogue runtime — the honest note

`sim/Sim.Llm` is **fully built**: three provider adapters, streaming, capability manifests, the
`CitizenEffect` whitelist, MEMS-persisted minds, eulogies, a cost meter, a local-first auto-route
that makes dialogue cost $0 by default. It was stood down by owner decision
(**LLM-ready, not LLM-powered** — a governance and liability stance, 2026-07-25). It is
VISION pillar 2 and the game's stated differentiator.

**And it is the only thing the shipping game teaches.** `client/src/ui/onboarding.js` — the game's
sole help surface — presents exactly two verbs, `◈ TALK` and `▣ BUILD` (`:39-46`), and a controls
table (`:18-27`) whose first three rows are Click / T / B. It names none of DIG, STOCKPILE, STRIP,
OPERATE or the work grid, and **its `B` row is factually wrong**. So: *the first thing a new player
reads teaches the one verb the owner stood down, and gets a key wrong while doing it.* That is a live
product defect, not a dormant asset.

**This plan does not restart the runtime.** It does two things:
- **M4 rewrites the card** to teach the verbs the game has (WP-C's own checklist), and
- **M4's Persona window puts TALK inside the person rather than at the front door** — so the runtime
  stays shippable and marketable without being load-bearing, which is exactly what
  *LLM-ready-not-LLM-powered* means when it is implemented rather than merely decided.

**One recurring cost worth naming:** ~5 400 lines of provider integration will age against three
vendors' APIs over the quarter. Recommend a standing **one package per month** running the existing
env-gated smoke (`hosts/scenario -- llm-smoke --backend all`; free on Ollama, cents on the cloud) so
the asset does not silently rot. That is the cheapest possible insurance on a pillar.

### 3.5 The real throughput ceiling is owner decisions, not agents

Documented failure mode: **open-on-owner items go stale.** `Morale`/`Health` was filed as an owner
question on 2026-07-22 *"decide it before E0-8 reworks the crew readouts"* — E0-8 landed on 07-27
without it. The character-sim §12 five have been open since 07-26. OD-8, OD-11 and OD-12 are open
now. WP-C has needed the owner since 07-25.

**The rule this plan adopts: every milestone opens with ONE decision batch, put to the owner in a
single message, each item carrying a recommendation and a stated blast radius; anything unanswered
after three days takes the recommendation, is marked REVERSIBLE, and is listed in the milestone's
record as such.**

> ## ⭐ THE DECISION LEDGER — 2026-07-29, TEN DECISIONS IN ONE DAY *(added in revision 3)*
>
> **This table exists because §3.5's own diagnosis applies to §3.5.** Ten decisions were taken on one
> day and were about to live as scattered clauses in two documents; that is exactly how the
> `Morale`/`Health` item went stale for five days and the character-sim five for three.
> **One table, chronological, with where each one BINDS.**
>
> | id | decision | binds |
> |---|---|---|
> | **OD-A** | Repair is a **work type** under the priority grid + a right-click prioritise override — never a paint designation. ⇒ *the grid is a PREREQUISITE, not the seventh lane.* | M2 entire |
> | **OD-B** | Economy **PARKED at E0-complete**; E1 not opened; **A1 retired as a goal** (regression statistic only). | M2-17, M3 |
> | **OD-C** | The ship's interior is **authored-explored at boot**. | M1-A |
> | **OD-D** | ⭐ **THE VENT PREMISE IS REWORDED, NOT REBUILT.** `CLAUDE.md`, `VISION.md` and `MECHANICS.md` all describe the opening move as *"open the vent, push the air outward"*; verified at `AtmosphereSystem.cs:136-146`, an `AirVent` **injects** dry Earth mix *"from an unmodelled reserve"* into **its own room** and *"venting into room 0 is refused outright"*. **There is no neighbour term — the mechanic was never implemented.** ⇒ **Change the WORDING to match the injection model:** you restore a vent and it **fills a compartment**, and the pressure frontier the design wants falls out of that. ⛔ *Rejected: giving the vent a source room and a sign — **a new gas mechanic**, in a sim with no vertical gas term either, and not a two-week milestone's work.* | **M1-G** (`lane/premise-fix`), **docs-only, INFRASTRUCTURE**, and its acceptance is deliberately **none** — it carries no demo, by class. It is M1's **one** infrastructure package (§9). |
> | **OD-E** | ⛔ **DECK 1 STAYS DEAD — a deck-1 vent was OFFERED and DECLINED.** The wreck's eight deck-1 halls can never hold air because **the sim has no vertical gas term at all** — `FlowAcrossDoor` probes `(X±1,Y,Z)`/`(X,Y±1,Z)`, `DiffuseAcrossDoors` uses `Int3.Neighbor4`, `RoomState.FloodRegion` binds `world.Levels[start.Z]`, `RemapGas` runs per-`z` *(verified exhaustively in review 2026-07-28, not by grepping two functions)* — and both `AirVent`s are on deck 0. Measured: eight halls, doors opened, 20 000 ticks ⇒ peak **0.000 kPa**. ⭐ **Because a vent injects into its OWN room, authoring a deck-1 vent WOULD have made the upper deck live. That was put to the owner explicitly and declined**, as was adding a vertical gas term. **The 2026-07-28 decision — ship it FILED and VISIBLE IN PLAY — stands unchanged.** | ⛔ **Binds nothing to build. It is a STANDING REFUSAL**, and its value is that it stops a future lane "fixing" the dead deck as an oversight. ⚠️ **Record alongside it the standing prohibition: do NOT re-pressurise in `AddRoomCommand`** — the air wand W4b deleted on a binding owner decision, **which has already tried to return once.** |
> | **OD-F** | The wreck's finite repair economy: **author more consumables** so it stops being a silent soft-lock. | **M1-I** (`lane/repair-consumables`, in flight) · closes M2 batch item 6 |
> | **OD-G** | **The opening is an ORDER, then autonomy resumes.** The pawn boots idle and waiting; the game opens with the player giving an order. | **M2-20** (new) · M2-2 · M2-3 |
> | **OD-H** | **The work grid DEFAULTS OFF. Work is opt-in.** *(Owner accepted a pin move and a re-baseline.)* | **M2-1 · M2-2 (now a pin row) · M2-3/M2-4 (now blocking) · M2-17** |
> | **OD-I** | **One rule, OFF everywhere** — the measurement fixtures too; **M2-17 teaches the harness to author a grid.** | **M2-1** (unblocked) · **M2-17** |
> | **OD-J** | v1 work-list order = **`Repair · Construct · Craft · Deconstruct · Mine · Haul`**, and **it IS the equal-band tie-break.** | **M2-5** (now pin row `M2-g`) · M2-3's column layout |
>
> ⚠️ ⭐ **OD-D AND OD-E WERE CITED AS A RANGE BEFORE THEY WERE STATED, AND THIS TABLE CARRIED THEM AS
> NAMED GAPS UNTIL THEY WERE.** That is the standard: ***an id in a ledger with no content is a
> question; an invented row is a lie.*** **Two decisions in one day were nearly lost to a range
> notation** — which is the same shape as every stale open-on-owner item §3.5 exists to prevent.
>
> **Plus three DECIDED-BY-DEFAULT (integrator, 2026-07-29), overturnable by the owner on sight:**
> new thaws boot **all-off** (uniform) · **"the first order"** means any player command that makes her
> take a job, including a WORK-tab toggle · a deliberately unassigned pawn gets **two words, not one**
> (*unassigned* vs *idle*).
>
> ⛔ **NOTHING IN M1 OR M2 IS NOW BLOCKED ON AN UNANSWERED ITEM.** The M2 batch's remaining open items
> (1–5) are all non-blocking; **item 5's blast radius has changed without its content changing** — see
> the packages document.

The batches:

- **M1:** the fog rule's scope (wreck-only authoring vs. a general hull rule — the pin difference) ·
  ⭐ **the vent premise (§0.3)**: an `AirVent` **injects** into its own room and refuses room 0, so
  *"open the vent, push the air outward"* has never been implemented. **Recommend: change the
  premise's wording** — the injection model already produces the frontier the design wants, and a
  neighbour-draw term is a new gas mechanic in a milestone that should ship in two weeks.
- **M2:** how many work types, and their names · does `HoldPosition` survive or become "everything
  disabled" · does a priority ever override `CanStageWorkerAt` (**recommend: never**) ·
  ⛔ ~~**the pre-emption policy**~~ — **WITHDRAWN 2026-07-29: the M2-0 spike measured all three hard
  cases and the engine already answers them.** Replaced by **the sticky claim's release rule**
  (recommend: completion, a new order, death or genuine inability — **never a timeout**).
  ⭐ **AND FIVE MORE ITEMS ADDED BY OD-G / OD-H (2026-07-29), stated in full in
  `perilune-roadmap-q3.packages.md` §5's batch as items 7–11 and NOT duplicated here:** the work-list
  order *(re-opened — the pin saving that justified the v1 compromise no longer exists)* · **do the
  measurement fixtures default OFF too** · **does a newly thawed crew member boot with every work type
  off** *(must be answered before M3-2 freezes the `CryoSystem` chapter)* · **what counts as "the
  first order"** · **the vocabulary for a pawn who is deliberately unassigned** *(it contradicts a
  deliberate design position at **`client/src/ui/overview-view.js:721-722`** — ⚠️ **the CLAUSE, not the
  block.** The comment runs `:715-722` and carries **two** claims: the `AWAITING ORDERS` position, which
  is live and is what OD-G overturns, and an auto-wander premise at `:720-721` (*"crew there do not
  auto-wander"*) which is **already false** — grid crew were made `AutoWander = true` on 2026-07-25.
  **Quote around the stale half, not through it.**)*.
  ⚠️ **Item 5 — does an explicit *Prioritise* order override the grid — is unchanged as a question and
  NARROWED as a decision:** under OD-H every machine's work type is off at boot, so a *no* answer
  refuses the player's very first right-click.
- **M3:** OD-12 the pod census (**recommend two wrecked**) · OD-11 `thaw_cost` escalation
  (**recommend `base + LivingCrew × step`, in Parts**) · OD-8 the ice hold (**recommend yes, behind
  the frontier**) · how many skill axes (**recommend small: ~6 work types, one hashed byte each**) ·
  ⛔ ~~the dead deck (**recommend: author a deck-1 vent**)~~ — **STRUCK 2026-07-29. `OD-E` IS BINDING
  AND IT RECORDS THIS EXACT OPTION AS OFFERED AND DECLINED**, 46 lines above, in this same section.
  ⚠️ *A recommendation left standing beneath the decision that refused it is how a "closed" item
  re-opens itself, and it would have read as live to the M3 implementer.* · does the heater ship as a device or a def change to an existing one ·
  ⭐ **the `Device.Name` collision** — one field is both the MOSS registry key and *"who is inside"*
  (**recommend: keep `Name` as the registry key and carry the sleeper elsewhere; decide before
  `CryoSystem` freezes the save chapter**).
- **M4:** the Persona window's shape (this one genuinely needs him — there is no design doc) ·
  `Morale`/`Health`: make real or delete · does the onboarding card mention TALK at all.
- **M5:** what the ending is.

### 3.6 Where this plan contradicts a document on `main`, named explicitly

1. **W7's position** — plan of record: seventh. Here: second (M2). Grounds: OD-A, and §3.1.
2. **W7's fusion of skills and priorities** — plan of record: *"the two halves are one wave."* Here:
   split across M2 and M3, with the storage batched. Grounds: §3.1.
3. **W7's seam description** — plan of record: *"nothing else in the dispatcher needs to change."*
   Here: it needs a band loop **and a recruiter-claim query for the two work types that have no
   `IJobSource` at all** (`_byKind[6]`/`_byKind[7]` are null), the assignment-site count is **four**
   not three, and **pre-emption is a separate mechanism the charter does not mention at all** (§M2).
   *(Revision 0 said "the stack order must change." **That was wrong and is withdrawn** — see §M2.)*
4. **W9's position** — plan of record: in the wave order. Here: dropped from the quarter (§3.4).
5. **`ECONOMY-PLAN.md`'s E0→E4 approval** — narrowed to E0 by OD-B, by the same owner who gave it.
6. ⭐ **`CLAUDE.md`'s statement of the premise** — *"open the vent, push the air outward"* describes a
   mechanic **the sim has never implemented**: an `AirVent` injects from an unmodelled reserve into
   its own room and refuses to vent into room 0 (`AtmosphereSystem.cs:136-146`). This is not a
   roadmap disagreement; it is the repo's own headline description of its opening move being wrong
   about the code. **In M1's decision batch** (§0.3, §3.5).
7. **`AuthoredShips.cs:1429-1433`'s power claim** — *"~12.6 kW of total demand, every tier served
   from tick 0 and stays served"*. **Both halves false**: true flat demand is 20.40 kW and every light
   is out by sim-hour 7 (§0.1). And `:1441-1443`'s belief that deck 1 is off-network is false for
   **all 626 devices** (§0.2).
8. **A stale test comment**, for the record: `client/test/surface-boundary.test.js:832` says the
   `devices` channel has no drawing consumer. **It has one** — `client/src/items/wear.js` joins it to
   the wrecked twins and both surfaces route through `buildTileItem`
   (`overview-scene.js:355`, `roomzoom-view.js:653`). The comment predates the art join's merge.

---

## 4. What success looks like at 13 weeks

**A play session, described concretely.**

You launch `./play.sh`. A capsule badge counts down and **one woman steps out onto the deck plate**.
The intro card names her, tells you where you are, and lists the keys — and every key it lists works.
Around her, deck 0 is on file: eight compartments, six of them holding machines you can see are
broken because they are *drawn* broken. The sensor log is already complaining about the fabricator,
and now you can find it.

You click her. **One window** opens: Rell — wry, devout, meticulous; a mechanic; close to nobody yet;
tired, hungry, unhurt. It says what she is doing and *why*. Nothing in it says `SAMPLE`.

You open the **WORK** tab and give her a shape: Repair 1, Construct 2, Haul 4. You walk her into the
life-support hall, arm **O**, and open `vent_ls`. **The hall's pressure climbs** and the frontier
moves out by one compartment. You paint a strip order on a dead recycler and she ignores it, because
you told her repair matters more, and the task line tells you that in words. You right-click `wing_c`:
*Prioritise: repair.* **She sets down what she was carrying and goes** — the first time in this
project's life that a busy pawn could be taken back. Fifteen sim-minutes later generation steps from
10.65 to 13.47 kW, the benches come back, and **a dark room's lights come on** — the thing the owner
described in his first sentence about this game, happening on screen.

You paint an order in a hall she cannot breathe in. Nothing happens — and the tile says so, in
writing, on the tile. You press erase and take it back.

Two sim-hours in, you have Parts, a repaired bed, a scrubber above water and a MOSS terminal that
answers. You open MOSS and there is a **POD BAY**: eight capsules, one open, five intact, two reading
**NO SIGNAL** — and you understand, without a tutorial, that two people did not survive the raid. You
pick the engineer over the medic, because the benches matter more than anyone's health right now, and
the price is Parts you had to earn. The cycle runs. **Someone else wakes up.** She is in the
Chronicle, she is in CREW WATCH, and her row in the WORK tab is *not the same as Rell's* — she is
better at the benches and worse at everything else, so you give her a different shape.

By the third thaw the ship is drawing more air than one scrubber covers and MOSS refuses you, with a
number. You go and fix that instead. When you quit and come back, everyone is where you left them,
doing what you told them.

**If someone reads only this section, the plan worked if that session is real.** It fails if any of
these is true at week 13: the player still cannot say who does what; repairing a machine still
changes no visible thing; the pods are still props; a stalled order is still silent; or the first
screen still teaches a verb the game does not have.

---

## 5. Risks, ranked

**R1 — The priority-grid rewrite is larger than it looks. (HIGH / HIGH)**
The seam described in every existing charter is insufficient (§M2's sizing box): `JobKind.Maintain`
and `JobKind.Craft` have **no `IJobSource` at all** (`_byKind[6]`/`_byKind[7]` null), so a band loop
fails in the same place a flat veto does; there are **four** assignment sites, not three.
*Early warning:* a package proposes "a per-(citizen, JobKind) veto inside the loop"; or counts three
recruiters; or proposes to fix it by **re-ordering `SystemStack`** — which delivers none of OD-A
because it can only invert a fixed *global* precedence, never express Haul@1/Repair@4.
*Mitigation:* the spike below, then charter as separately-attributable commits (filter → ranking →
pre-emption). Require a **driven** one-pawn measurement, never a scan.

> ⛔ **REVISION 1 — R1's SPIKE AS WRITTEN RETURNED A FALSE PASS, AND THAT IS THE WHOLE POINT OF THIS
> ROW.** Revision 0 specified: *"the veto with no UI, driven at one pawn, measuring whether Repair@1
> beats a painted strip order."* **Repair already beats a painted strip order today, with no veto at
> all** — because a 900 s Maintain service monopolises the pawn (see the 54 650-tick measurement).
> The spike would have passed on an empty branch and reported the milestone as small.
>
> **⇒ THE RE-SPECIFIED SPIKE, with a baseline control and an inverting criterion:**
> **Leg A (BASELINE CONTROL, mandatory):** the shipped sim, no changes. Record the order of events.
> *If this leg is not run, the spike is uninterpretable.*
> **Leg B (INVERTING CRITERION):** with the grid, set **Haul@1 / Repair@4** and require the observed
> order to **invert** — the pawn strips and does **not** service. **This is a result the shipped sim
> cannot produce**, which is precisely why it is the criterion.
> **Leg C (PRE-EMPTION):** flip to Repair@1 mid-service and require the pawn to be **taken back**.
> **A spike whose passing leg the unmodified codebase also passes has measured nothing.** This is the
> fourth trap shape (a guard whose scope excludes the violation) wearing a scheduling costume.

**R1b — Pre-emption's POLICY is the hard part, not its mechanism. (MEDIUM / HIGH)** *(new in revision 1)*
The mechanism exists once (`SafetySystem.cs:232-238`) and the release is already normalised
(`JobContext.cs:93`). The question *when may a pawn be taken off a job it is halfway through* has no
precedent here and three named hard cases: mid-haul carrying cargo, mid-craft against a bill,
mid-build with material delivered.
*Early warning:* a pre-emption package that ships a mechanism and defers the rule to "the caller"; or
a demo that only ever pre-empts an idle-adjacent job.
*Mitigation:* policy is an owner-batch item (§3.5, M2). Ship the mechanism **behind** the decided
policy, and require the demo to pre-empt a *carrying* pawn — the case that loses cargo if it is wrong.

**R2 — Scope creep back into economy and metric work. (MEDIUM / HIGH)**
The gravitational pull is real: 120 of 555 commit subjects mention the economy, and the instruments
are the most legible thing in the repo.
*Early warning:* a package justified by A1, by a ledger number, or by "an internal number is wrong,
now it is right"; a charter citing `ECONOMY-PLAN.md`; a lane touching `ProductionDefs` or the four
empty economy systems.
*Mitigation:* OD-B is binding and A1 may be reported but never optimised toward. The §6 rule catches
it at charter time. Anything genuinely needed from E1 comes back as an owner decision, not as a lane.

**R3 — Plumbing ships before anything draws it. (MEDIUM / HIGH)**
This project's documented failure mode, with named instances: the `devices` channel landed *"drawn by
nobody yet"*; `chron` is emitted, cached, and unreachable because CHRONICLE is an `INERT_TAB`;
`legend` and `inspect` reach only console DOM. Six sparse view channels shipped before the game had a
repair verb.
*Early warning:* a package whose deliverable is a channel, a system, or a hashed field, with the
drawing named as a follow-up — or the phrase "the join is a separate package".
*Mitigation:* **a channel and its drawing land in the same milestone, and the milestone's demo is the
acceptance criterion.** A wave that cannot be demonstrated in a browser inside its own milestone is
not chartered.

**R4 — The five-pin pile-up stalls the calendar. (MEDIUM / MEDIUM)**
Seven pin-moving changes are queued in §3.2 and none may run concurrently.
*Early warning:* two in-flight lanes both say "moves all five pins"; a re-pin commit that cannot say
which change moved which hash.
*Mitigation:* one standing deep lane owns the chain, publishes its order, and every other lane proves
pin-neutrality mechanically. Batch **state layout**, never behaviour.

**R5 — Owner-decision starvation. (MEDIUM / HIGH)**
Documented and recurring (§3.5).
*Early warning:* a milestone charter containing "OPEN ON THE OWNER" with no date; a decision older
than the milestone that depends on it.
*Mitigation:* the one-batch-per-milestone rule with a three-day default-to-recommendation and an
explicit REVERSIBLE label.

**R6 — The wreck's content holes make the mid-game unreachable, and they are not code. (MEDIUM /
MEDIUM)**
Deck 1 can never hold air (no vertical gas term, both vents on deck 0); the ship freezes outside the
core from ~day 5 and **there is no heater device in the game**. Both bite exactly when M3's thaw curve
needs somewhere to put people.
*Early warning:* M3's gate stalls at the second or third thaw with headroom refusals nobody can act
on.
*Mitigation:* both are in M3's decision batch, both have one-line content answers, and both are
cheap. Do not let them be discovered in week 9.

**R7 — The test/guard dose reasserts itself. (MEDIUM / MEDIUM)**
44–52 % of churn; two whole packages existed purely to harden guards.
*Early warning:* a rolling three-day window where the test buckets exceed ~50 % of churn and the
excess carries no player sentence.
*Mitigation:* the capped infrastructure budget in §6. **Do not cut implement + independent review** —
it is measured at ~22 % of spend, it is the fastest phase, and every send-back fix cost more than the
review that found it.

**R8 — Cutting the determinism substrate to go faster. (LOW / SEVERE)**
It is the most misdiagnosed asset here. It is not the reason W7 was seventh; *using pin cost as an
ordering criterion* was.
*Early warning:* any proposal to relax the def-field-in-one-commit rule or to skip a re-pin.
*Mitigation:* none needed beyond naming it. The invariant stays.

**R9 — The Persona window is designed by whoever implements it. (LOW / MEDIUM)**
There is no design document; §1.5.4 is explicitly *"marked, not designed"*, and the layout, the tabs,
whether it hosts orders and whether it surfaces a transcript are all open.
*Early warning:* an implementation package for M4 item 1 with no design package before it.
*Mitigation:* M4 opens with a design package and an owner review, not with code.

---

## 6. The anti-drift rule

**The finding it answers:** the last self-authored backlog (`HANDOVER.md` §5, 2026-07-27) listed five
items and **justified every one by an internal-consistency claim; not one by a player being unable to
do something.** Two were later measured as *~1 %, not separated from noise* and *measurably inert*.

### The rule, in the form a future session applies it

> **THE PLAYER SENTENCE AND THE FIVE-MINUTE DEMO.**
>
> **(1)** No package is chartered without two lines at the top of its charter, written **before** any
> code and re-read at review:
> > **TODAY THE PLAYER CANNOT:** _____
> > **AFTER THIS THEY CAN:** _____
>
> Both must be about a **person playing the game**. A sentence whose subject is a subsystem, a
> channel, a metric, a test, a guard, a hash or an invariant **is not a player sentence** and the
> package is refused.
>
> **(2)** The charter must also carry a **DEMO**: a numbered sequence a human can perform in a
> browser in under five minutes, ending in something they can see. At review, the reviewer must
> either perform it or state that they could not and why. *(This is the repo's own culture written
> down: every serious player-visible defect it has found came from someone opening the game and
> looking.)*
>
> **(3) THE INFRASTRUCTURE BUDGET — the part that makes (1) honest.** Some necessary work has no
> player sentence: a re-pin, a save migration, a provider-API bump, a genuine guard repair. Pretending
> otherwise produces *fabricated* player sentences, which is worse than none. So such work is
> chartered **explicitly as INFRASTRUCTURE**, with no player sentence and no demo.
>
> ### ⚠️ REVISION 1 — THE CAP WAS UNENFORCEABLE AS WRITTEN, AND IT IS NOW A REFUSAL
>
> Revision 0 made it *"capped at one in five in any rolling two-week window"*, audited by a table at
> milestone close. **A cap you can only discover you have breached is not a cap** — the breach is
> already merged, and the only remaining move is to write it down apologetically. Four changes:
>
> **(3a) CLASSIFY AT CHARTER TIME, NOT AT CLOSE.** Every charter carries `PLAYER` or `INFRASTRUCTURE`
> as a required field on the same line as its title. There is no third value and no blank.
> **(3b) PUBLISH A RUNNING COUNT.** The milestone's record carries a live tally — `PLAYER n /
> INFRASTRUCTURE m / cap m_max` — updated when a package is **chartered**, not when it lands.
> **(3c) A RE-PIN COMMIT DOES NOT COUNT.** Stated explicitly, because it is the ambiguity that would
> otherwise consume the whole budget: a re-pin is the *ritual tail* of a package already classified,
> not a package. **A pin-moving package counts once, under whatever its own sentence made it.** By the
> same rule, a guard fix riding inside a `PLAYER` package is not a separate infrastructure charter —
> only a guard fix chartered *for its own sake* is.
> **(3d) IT IS A REFUSAL, NOT A RATIO.** Chartering the (m_max + 1)-th infrastructure package in the
> window **fails**, and the only way past it is an explicit owner override recorded by name and date.
> *This is the mechanism the repo already trusts everywhere else — an equality-pinned ledger that only
> pays down, not a number reported after the fact.*
>
> **(4) PROJECTABILITY — every milestone carries a package count** so the ratio can be projected
> before the window opens, not reconstructed after it closes:
>
> | milestone | est. packages | of which INFRASTRUCTURE (cap 1 in 5) |
> |---|---:|---:|
> | M1 | ~10 | ≤ 2 |
> | M2 | ~22 | ≤ 4 |
> | M3 | ~20 | ≤ 4 |
> | M4 | ~12 | ≤ 2 |
> | M5 | ~12 *(+ save/load, own lane)* | ≤ 2 |
> | **quarter** | **~76** | **≤ 15** |
>
> **A number you did not write down before you needed it is a rule you did not have.**

**Why this shape and not "just require a player sentence":** a bare requirement gets satisfied by
writing a fake sentence, and this repo has already produced a package whose *code was right and whose
justification was false* (four of five required fixes on one lane). The countermeasure is not a
stricter sentence; it is a **counted, labelled exception** — because an exception you must count is
one you must defend.

---

## 7. Throughput assumption, stated in the open so it can be attacked

The repo is **nine days old** and holds 555 commits, a deterministic engine, two UI surfaces, an art
pipeline, an LLM runtime, an economy, a wreck ship and ~2 200 tests. Work is done by parallel Opus
agents in git worktrees, one implementing and a separate one reviewing (binding orchestration rule).

**I assume:** ~**3–5 independently-reviewed packages land per working day** across parallel lanes ·
**~30 % of gross effort** goes to send-backs, retractions and re-verification · **every package takes
at least one send-back** (observed, without exception) · **at most one pin-moving lane in flight at
any time** · concurrency has a measured wall-clock cost (four lanes took the dotnet stage from ~6.5
to ~10 minutes).

> ⚠️ **REVISION 1 — I UNDER-STATED MY OWN CORRECTION RATE, AND IT MADE THE ASSUMPTION MORE OPTIMISTIC
> THAN I CLAIMED IT WAS.** Revision 0 said *"6 of the 40 most recent commits are `Send-back:`/`Merge
> fix:`"*. **It is 9 of 40**, plus 4 explicit retractions and 3 browser re-verifications. So the
> correction share is nearer **30 %** than 25 %, and it is worth naming what that means rather than
> just adjusting a number: **this document is itself an instance of the rate** — it took a send-back
> with seven required fixes, three of which corrected measurements I had asserted. A planning document
> that assumed a 25 % correction rate while being corrected at a higher one was not being conservative;
> it was flattering the plan.

That is roughly **230 packages of nominal capacity** over 13 weeks. **This plan names ~76** (§6's
table). I am deliberately planning to about a third of nominal, and the reasons are the plan's, not
timidity:

1. **The rate is measured over nine days and has never been sustained over thirteen weeks.** Founding
   velocity is not steady-state velocity, and the marginal cost of every change rises as the surface
   grows — this quarter's work is concentrated in the two hardest places in the codebase (the
   dispatcher and hashed `Citizen` state) rather than in greenfield.
2. **Owner decisions, not agent throughput, are the binding constraint** on M3 and M4 (§3.5).
3. ⭐ **Filling capacity is exactly how the drift happened.** Surplus capacity was absorbed by
   internal-consistency work — guard-hardening programmes, a `~1 %` perf memo, a cap later measured
   inert. **The correct response to surplus is to aim it, not to absorb it.**

### The overflow queue — ranked, and every item carries a player sentence

A free lane pulls from the top of this list, never from the parked programmes.

1. **Authored content.** More of the wreck (decks 2+), a second scenario ship, more room archetypes.
   *The player runs out of ship.*
2. **Art.** Portraits (persona-conditioned — VISION calls them the identity anchor), machine
   animation states, the pawn work/carry cycles. *The player cannot tell two crew members apart at a
   glance.*
3. **The Chronicle made reachable and readable** on the standard surface. *The player cannot read the
   ship's own history, which is the stated emotional payload.*
4. **The character-simulation substrate**, once its five §12 decisions close and it is sequenced
   against the pin chain. *The player cannot tell why this person is different from that one.*
5. **The `designs`/`blocked` fog asymmetry** *(floated out of M1 in revision 1 — top of the queue)*.
   *The player sees their own build ghost sitting there doing nothing, with the channel that would say
   why deliberately silent.*
6. **`Regolith → Rubble`** (W10). *The player is told they are carrying lunar soil on a starship.*
7. **The device-removal hole.** *The player can build a door they can never take down.*
8. **RUG and SHELF made real, or removed** (§0.5). *The player places furniture that does not exist.*
9. **Measure A2 and A3 once** *(floated out of M1; **INFRASTRUCTURE**, counted — RF-4)*. It has no
   player sentence and this document will not invent one for it. A3 has never been measured in the
   repo's life. Under OD-B: **baselines, never goals.**
10. **Performance: memoise the "no consumable aboard" answer.** **INFRASTRUCTURE**, and **it must be
    measured before it is built** — the last two performance items in this repo measured at ~1 % and
    *inert*, and were correctly not built.
    ⚠️ **Revision 1 corrects my own inflation of this item.** Revision 0 said *"the wreck authors
    hundreds by design"*, quoting the plan of record. **Measured: 39 needy and 41 below the wreck
    threshold, of 626 devices.** Two orders of magnitude below "hundreds", on a re-scan that is
    O(needy × item-store). ⇒ **This is very likely a non-item**, and it is left here at the bottom
    of the queue rather than deleted only so the next person does not re-derive the number.

---

## 8. Honest uncertainty

**Things I could not determine, and what would resolve each.**

1. ⭐ **Whether M2's dispatch rewrite is three days or three weeks.** This is the single largest
   uncertainty in the plan and it sizes the whole quarter. *Resolved by:* the R1 spike — one
   throwaway branch, the veto with no UI, driven at one pawn. **Do this in week 1, in parallel with
   M1.** If the spike says three weeks, M5 is what gives.
2. **Whether the pre-emption change (repair beating a painted order) is even desirable at one pawn.**
   The plan-of-record's W6 note observes the same tension for sleep: a system registered *after*
   `JobSystem` gives you a pawn who works until it drops; *before*, one who sleeps through an
   emergency; *"neither is right."* `SafetySystem`'s hard pre-emption is the model to copy, but the
   threshold is a design question. *Resolved by:* driving it at one pawn and showing the owner both.
3. **How many skill axes.** OD-5 deliberately left it to W7, and the choice is what the CITZ chapter
   carries forever. *Resolved by:* the M3 decision batch. My recommendation is small — ~6 work types,
   one hashed byte each — on the grounds that five thaw decisions need to be distinguishable, not
   optimisable.
4. **Whether the thaw curve is any fun.** No amount of measurement answers it. *Resolved by:* the
   owner playing M3's demo. ⭐ **A REAL 60-MINUTE PLAYTEST IS A HARD GATE AT THE END OF WEEK 9**
   *(moved forward in revision 1 — revision 0 left every human gate in week 13, which is where a human
   gate goes to die).* This project has carried the P2 60-minute playtest bar **unmet since
   2026-07-21**, and WP-9 carries its own human gate that *"no agent can be that human."* ⇒ **Two
   human gates, week 9 and week 13, both on the calendar now.** If the week-9 gate says the curve is
   not fun, M4 and M5 are the budget that pays for fixing it — which is only true if the gate happens
   while that budget still exists.
5. ✅ **The gate — MEASURED IN THIS WORKTREE, not copied.** `./ci.sh` on `lane/roadmap` @ `72fbca4`:
   **exit 0 · 1 286 dotnet (0 failed, 0 skipped, 10 m 34 s) · 953 node (0 failed) · twin hashes MATCH
   `02257f5bce961570`.** This agrees with `CLAUDE.md`, which is worth stating because it usually does
   not — a stale count survived there for a whole run and was quoted as current. **Re-measure before
   quoting, including from here.** *(Not an uncertainty any more; kept in this section because the
   habit of quoting an unmeasured count is.)*
6. **A3 has never been measured, in the repo's entire life**, and A2 not since E0-1. This plan
   measures both once in M1 as baselines. *Until then, any statement about E0's exit gate is one FAIL
   and two UNKNOWNs — never "half met".*
7. **Whether the Persona window needs the LLM to be worth opening.** *Resolved by:* the M4 design
   package, which must be judged with the runtime off — the offline invariant says it must stand
   without it.
8. **Whether OD-C's fog change is pin-neutral.** It depends on whether the flag is authored per-ship
   or becomes a rule. *Resolved by:* measuring, in the lane, before merging. **Never predict a pin.**
9. **Whether 13 weeks at this pace is 13 weeks.** Nine days of data. *Resolved by:* re-reading this
   section at the end of M2 with four weeks of actuals, and re-planning M4/M5 against them rather
   than against this assumption.
