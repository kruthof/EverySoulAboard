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

**Why this exists.** Six of the eight deck-0 slots on the shipping game render as blank `＋ADD ROOM`
boxes while containing `fabricator_1` at 0.11, `machineshop_1` 0.13, `recycler_1` 0.09,
`scrubber_ls` 0.08, `reclaimer_ls` 0.12 and **`vent_ls` 0.15 — the premise's own opening move**;
`vent_ls` reads `Explored = false` at tick 0, tick 600 and tick 36 000 (`MECHANICS.md` §13.22c,
§13.23c), so it never reaches the `devices` channel and gets no OPERATE chip. Meanwhile the sensor
log announces `fabricator_1: MACHINE FAILURE` for a machine the player cannot see. **Everything in
M2 is undemonstrable until this is fixed**, and — the harder point — a repair order that does nothing
because the machine is unseen is indistinguishable from a repair verb that is broken. That confusion
has cost this project three owner reports already (`invisible-feedback-is-functional`).

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
   The reachability gate already exists host-side from E0-4 WP-7. Measured consequence today: two
   legal verbs (arm OPERATE, shut two doors; arm WALL, drag two tiles) produce ghosts frozen at 0/2,
   a pawn reading `"Idle"` and **`blocked` = zero rows, held for 480 000 ticks**.
5. **Resolve the `designs`/`blocked` fog asymmetry.** `BuildDesigns` (`GameSession.cs:1715-1729`)
   emits every pending site with **no fog gate**; `AddIfBlocked` **is** gated on `TileFlags.Explored`
   (`GameSession.cs:2311`). So a build ghost draws where its reason cannot. OD-C removes most of the
   occasions; the asymmetry itself should still be closed, because it will recur on genuinely
   unsurveyed space.
6. **The silent-refusal sweep.** Enumerate every refusal the sim can make and require each to reach a
   surface: unbreathable worksite (`SafetySystem.cs:104-128`, `CanStageWorkerAt` — thermal counts),
   unreachable stockpile (`MECHANICS.md` §13.17), a machine below `wear.wreck_threshold` with no
   consumable, a locked door (`GameSession.cs:1066-1071`), and a closed occupied cryo pod
   (`DeconstructSystem.cs:400`). This is a **census with an inclusion test**, not a feature.
7. **Cheap and owed: measure A2 and A3 once, on the wreck.** A3 has never been measured in the
   repo's life; A2 not since E0-1. Under OD-B they are **baselines, never goals** — recorded and not
   optimised toward. They are cheap now and they will never be cheaper.

**REUSES.** The `blocked` channel and its overlay (`hosts/web/WireFormat.Blocked.cs`,
`client/src/ui/blocked-overlay.js`) · `WorksiteSafety.CanStageWorkerAt` · E0-4 WP-7's reachability
gate · `TileFlags.Explored` and `ExplorationSystem` · the `marks` channel and `mark-overlay.js` ·
the 16-tool Room Zoom palette (`client/src/ui/room-model.js:51-54`) · the wire's existing
`Cmd.dig(x,y,false)` / `Cmd.strip(x,y,false)` off-path, already handled by the TUI
(`hosts/tui/…/GameLoop.cs:322`) · `hosts/scenario`'s occupancy harness for the A2/A3 baselines.

**NEW.** An authored-explored flag on `ShipPlan`/`AuthoredShips`; a cancel/erase tool (or an
erase modifier) on the Room Zoom and the Overview ORDERS bar; a third term in `BlockedReason`; one
fog decision applied consistently across `designs`.

**Dependency.** None — it is the entry point. It cannot move later, because it is the only milestone
every subsequent milestone's demo depends on.

**Size: SMALL–MEDIUM.** Almost all host-side and client-side; the sim change is authoring, not
mechanism. **Pin risk is the thing to check, not the code:** if the explored flag is authored on the
wreck only, all five pins hold and that must be *measured*, not argued (`git diff --
tests/Perilune.Tests/Golden/ ci.sh content/` = 0 lines, the ground-item lane's own check). If it
becomes a general rule about hull tiles, P1–P3 move and it joins the pin chain in §3.2.

**FIVE-MINUTE BROWSER DEMO.** `./play.sh` → deck 0 shows eight slots, six now containing visible
wrecked machines with their wrecked art → enter the life-support hall → press **O** → click
`vent_ls` → it opens and the compartment starts venting → arm **B** (WALL) and drag two tiles in a
vacuum hall → the tiles carry a written reason instead of nothing → press the erase tool and click
them → the ghosts go away.

---

### M2 — THE ORDER *(weeks 3–6)*

> **Player-facing statement.** *"I can tell Rell that repairing machines matters more than carrying
> rubble, or right-click one specific broken machine and say 'that one, now' — and when she fixes the
> reactor wing, the lights come on."*

This is the milestone the whole quarter is built around. It is the owner's own worked example of the
loop, and **today it is not expressible in either half.**

**What is measured to be missing.**
- **`Citizen` has no skill, no work-type mask, no priority and no work-rate multiplier.** Full field
  list verified at `sim/Sim.Core/Entities/Citizen.cs:7-81`; the only per-citizen work gate in the
  entire type is `IsRecruitableForWork` at `:103`, a boolean. `git log -- '*Skill*' '*Priority*'
  '*WorkType*' '*Assign*'` returns **zero commits in 555**.
- **Dispatch is a distance-only tournament with no per-citizen filter.** `TryAssign`
  (`sim/Sim.Core/Jobs/JobSystem.cs:220-273`); the decisive line is `:243`
  `if (cand < 0 || d >= bestDist) continue;`. Ties break by source registration order
  (`:71-80`: Dig, Haul, Build, Deconstruct), then board order, then citizen store order.
- **Power is condition-blind on BOTH sides.** `sim/Sim.Core/Systems/PowerSystem.cs:185` is
  `_generation[d.NetworkId] += def.GenerationKW;` with no `Condition`, no `IsOperational`, no
  `EffectiveRate`; the file says so itself at `:175-179` — *"a wrecked SolarWing still supplies its
  full kW"*. ⚠️ **A CORRECTION TO THE INPUT REPORTS: demand is condition-blind too**
  (`PowerSystem.cs:187-188`, `IsWanting` at `:262-266`). There is **no asymmetry to exploit** — both
  sides must be decided together, and gating only generation makes every wreck strictly harder.

> #### ⭐ THE SIZING FINDING, AND IT IS NOT IN ANY EXISTING CHARTER
>
> The plan of record locates W7's seam as *"a per-(citizen, JobKind) multiplier or veto applied
> inside that loop — nothing else in the dispatcher needs to change"*
> (`wreck-start.plan.md:1984-1991`). **Under OD-A that is insufficient, and the reason is the system
> stack, not the dispatcher.**
>
> `SystemStack.cs:33-37` registers `JobSystem` **before** `SustenanceSystem`, `CraftingSystem` and
> `MaintenanceSystem`. Each of those three recruits a worker *outside* `TryAssign`, by nearest-idle,
> and only from citizens still `JobKind == None` after the dispatcher has had them
> (`SustenanceSystem.cs:147,194` · `CraftingSystem.cs:167` with `FindNearestIdle` at `:467-484` ·
> `MaintenanceSystem.RecruitForNeediest` at `MachineWearSystem.cs:189-258` with `FindNearestIdle` at
> `:418-435`). **Repair is one of those three.** So a veto placed inside `TryAssign` can stop a pawn
> hauling, but it can never make Repair *outrank* Haul — the dispatcher has already run.
> ⇒ **OD-A's frame requires the maintenance and crafting claims to enter the same tournament (or the
> dispatcher to defer to them), which is a change to the stack's evaluation order.** That order is
> explicitly load-bearing for the determinism seed (`SystemStack.cs:40-42`, `:47-49`), so **the
> re-ordering is itself a pin move even before the new `Citizen` state.**
>
> **And there is a fourth out-of-loop assigner nobody has counted.** `EffectValidator.cs:141` writes
> `citizen.JobKind = JobKind.Dig;` directly from the LLM effect pipeline, bypassing `TryAssign` and
> **not consulting `IsRecruitableForWork`**. The plan-of-record's warning that *"forgetting the last
> two is how this lane ships half-done"* is right about the shape and **wrong about the count: it is
> four, plus `SafetySystem`'s pre-emption (`SafetySystem.cs:234`)**.

**Contents, in landing order.**
1. **The state.** Per-citizen work-type priorities as hashed `Citizen` state, RimWorld-shaped:
   ~6–8 work types, each *disabled* or *1–4*. ⭐ **Land the skill field's STORAGE in the same
   commit, zeroed and with no consumer** (see §3.2 — this is the one place batching is correct).
2. **The dispatch unification.** Priority band first, distance within the band; the three push
   recruiters and `EffectValidator` brought under the same rule. Charter as **two commits** — the
   veto without reordering, then the pre-emption — so a moved hash can be attributed.
3. **Repair becomes a work type.** `MaintenanceSystem.RecruitForNeediest` is not thrown away; it is
   brought under the grid, exactly as OD-A specifies. Its machine choice (lowest `Condition`, store
   order) becomes the autonomy half.
4. **The direct order.** Right-click a machine → *"Prioritise: repair wing_c"* → the pawn drops its
   job and goes now.
5. **The Work tab** on the standard surface (Overview), pawns × work types. ⚠️ **Never on the
   console `.app` shell** — that is the invariant E0-4's WP-5 broke.
6. **Condition-gated power, both sides**, landing last so a verb exists to answer it.
7. **The `why` line.** `GameSession.TaskLabel` (`:2556-2634`) already builds an honest prose sentence
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

**NEW.** Per-citizen work state; a priority-aware, band-then-distance dispatcher; the stack-order
change; a `PrioritiseJobCommand`; the Work tab; a `Condition` term on both sides of `PowerSystem`.

**Dependency, and why it cannot move earlier.** It needs **M1**. A grid whose effects you cannot see
is a table of numbers: if `fabricator_1` is invisible and a stalled order is silent, "Rell will not
repair it" and "Rell cannot see it" look identical, and the first serious bug report of the
milestone will be unfalsifiable. It also needs M1's un-designate, because the first thing a player
does with a new frame is change their mind. It does **not** need the thaw, and it must **not** wait
for it (§3.1).

**Size: LARGE — and the UI is not what makes it large.** Three things do: (a) the **pin ritual** —
new hashed `Citizen` state bumps the CITZ save chapter ⇒ P1/P2/P3, def'd defaults ⇒ P4/P5, **all
five**, plus a second, separately-attributable move for the stack re-order; (b) the **dispatch
unification** above; (c) every occupancy and A1/A2/A3 number in the repo is invalidated the day it
lands, and under OD-B that is a *re-baseline*, not a regression hunt.

**FIVE-MINUTE BROWSER DEMO.** `./play.sh` → open the **WORK** tab → Rell's row: set *Repair* to 1 and
*Haul* to 4 → close → paint six STRIP orders in the next hall → she ignores them and walks to
`wing_c` → the task line reads *"Repairing wing_c — Repair is your priority 1"* → right-click
`battery_2` → **Prioritise: repair** → she drops `wing_c` and walks to the battery → when the wing
completes, the deck's power readout rises and a dark room's lights come on. *(At max speed; the
repair is 900 s of sim time.)*

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
3. **Make the gauges honest or stop drawing them.** `Citizen.Morale` is **never written outside its
   initialiser** (`Citizen.cs:34`, `= 1f`) — and it is the value the shipping CREW WATCH morale bar
   displays. **The visible morale bar is a constant.** `Citizen.Health` is likewise never written
   (`Citizen.cs:31`) despite a doc comment claiming *"damaged by hypoxia, cold and struggle"*.
   `Persona.RoleNow` is a cosmetic string (`MECHANICS.md` §13.5). A constant presented as a gauge is
   a lie to the player; make it real or delete the bar.
4. **The onboarding card (WP-C).** It teaches exactly **TALK** and **BUILD** and the keys `T`/`B`/`M`
   (`client/src/ui/onboarding.js:18-27`, `:39-46`) — naming none of DIG, STOCKPILE, STRIP, OPERATE,
   the Room Zoom, the deck rail, or the work grid. ⭐ **And it is factually wrong**: `:21` teaches
   *"B — open their dossier"*, but `B` arms the BUILD/WALL tool (`controls.js:257`,
   `roomzoom-view.js:1259`); `openBioForSelected` has **no keyboard binding anywhere**, so the
   `[B] BIO` label at `overview-view.js:319` advertises a hotkey that does not exist. **The first
   thing a new player reads is wrong about a key and teaches the one verb the owner stood down.**
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
→ the intro card names the verbs the game actually has, and every key it lists does what it says.

---

### M5 — A RUN WITH A SHAPE *(weeks 12–13)*

> **Player-facing statement.** *"I can sit down, play the wreck for an hour, and the session has a
> beginning, a middle and an ending I can tell someone about."*

**Contents.** A stated mid-game goal and an ending (the lose screen from M3 plus a *"the ship is
yours"* state) · alerts, so a crisis reaches the player without them watching for it · save/load from
the UI · `ItemKind.Regolith → Rubble` (OD-6, decided; **moves no pin** but touches sim, content,
client art ids and tests at once, so it **runs alone** — a clean auto-merge would prove nothing) ·
the device-removal hole (**a built door cannot be removed by any verb on any surface** —
`DeconstructSystem.cs:378` refuses `Door`, DEMOLISH refuses it, `Cmd.remove` is gated out;
`roomzoom-view.js:1084-1102`) · an art and legibility pass on the wreck · **a real 60-minute owner
playtest** and the P2 blind-A/B screenshot verdict, both of which are exit bars this project has
carried unmet since 2026-07-21.

**REUSES.** Everything. This milestone adds almost no mechanism; it makes what exists into a session.

**Dependency.** Everything before it. An hour-long session needs a reward loop (M3), a reason to give
orders (M2), and feedback when they fail (M1).

**Size: MEDIUM**, and deliberately under-filled — it is where the quarter's slack lives.

**FIVE-MINUTE BROWSER DEMO.** Start, play for five minutes, quit, reload the save, and be in the same
place with the same people doing the same things.

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
  never runs two pin-movers concurrently. Published order:
  **M2-a** citizen work state (+ the reserved skill field) → **M2-b** dispatch/stack re-order →
  **M2-c** the `PowerSystem` condition term → **M3-a** `CryoSystem` → **M3-b** skills' consumers →
  **M3-c** rest → **M3-d** the heater def row. Each gets its own re-pin commit
  (`ci.sh` + `CLAUDE.md` + `MECHANICS.md` + `HANDOVER.md` + memory, in the same commit — the ritual).
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
record as such.** The batches:

- **M1:** the fog rule's scope (wreck-only authoring vs. a general hull rule — the pin difference).
- **M2:** how many work types, and their names · does `HoldPosition` survive or become "everything
  disabled" · does a priority ever override `CanStageWorkerAt` (**recommend: never**).
- **M3:** OD-12 the pod census (**recommend two wrecked**) · OD-11 `thaw_cost` escalation
  (**recommend `base + LivingCrew × step`, in Parts**) · OD-8 the ice hold (**recommend yes, behind
  the frontier**) · how many skill axes (**recommend small: ~6 work types, one hashed byte each**) ·
  the dead deck (**recommend: author a deck-1 vent; it is one line of content and it unblocks the
  frontier**) · does the heater ship as a device or a def change to an existing one.
- **M4:** the Persona window's shape (this one genuinely needs him — there is no design doc) ·
  `Morale`/`Health`: make real or delete · does the onboarding card mention TALK at all.
- **M5:** what the ending is.

### 3.6 Where this plan contradicts a document on `main`, named explicitly

1. **W7's position** — plan of record: seventh. Here: second (M2). Grounds: OD-A, and §3.1.
2. **W7's fusion of skills and priorities** — plan of record: *"the two halves are one wave."* Here:
   split across M2 and M3, with the storage batched. Grounds: §3.1.
3. **W7's seam description** — plan of record: *"nothing else in the dispatcher needs to change."*
   Here: the stack order must change too, and the recruiter count is **four**, not three (§M2).
4. **W9's position** — plan of record: in the wave order. Here: dropped from the quarter (§3.4).
5. **`ECONOMY-PLAN.md`'s E0→E4 approval** — narrowed to E0 by OD-B, by the same owner who gave it.
6. **A stale test comment**, for the record: `client/test/surface-boundary.test.js:832` says the
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
life-support hall, arm **O**, and open `vent_ls`. Pressure starts falling next door and rising here;
the frontier moves one compartment. You paint a strip order on a dead recycler and she ignores it,
because you told her repair matters more, and the task line tells you that in words. You right-click
`wing_c`: *Prioritise: repair.* She drops what she is doing and walks. Fifteen sim-minutes later the
deck's power readout climbs and **a dark room's lights come on** — the thing the owner described in
his first sentence about this game, happening on screen.

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

**R1 — The priority-grid dispatch rewrite is larger than it looks. (HIGH / HIGH)**
The seam described in every existing charter is insufficient (see §M2's sizing box): repair, crafting
and eating are *push* recruiters that run **after** `JobSystem` in a load-bearing stack order, so a
veto inside `TryAssign` cannot make Repair outrank Haul.
*Early warning:* a package proposes "a per-(citizen, JobKind) veto inside the loop" and its charter
does not mention `SystemStack.cs`, or counts three recruiters instead of four.
*Mitigation:* **spike it first** — one throwaway branch, the veto with no UI, driven at one pawn,
measuring whether Repair@1 beats a painted strip order; the spike's answer sizes the milestone.
Charter the rewrite as two separately-attributable commits (veto, then pre-emption). Require a driven
one-pawn measurement, never a scan.

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
> chartered **explicitly as INFRASTRUCTURE**, with no player sentence and no demo, and is **capped at
> one in five chartered packages in any rolling two-week window.** The cap is the enforcement; the
> label is what makes the cap countable.
>
> **(4) THE MILESTONE LEDGER.** Every milestone's record ends with a table of its packages, each
> tagged `PLAYER` or `INFRASTRUCTURE`, with the ratio computed. A milestone that closes above the cap
> says so in its own record. **A number you did not write down is a rule you did not have.**

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
**~25 % of gross effort** goes to send-backs, retractions and re-verification (measured: 6 of the 40
most recent commits are `Send-back:`/`Merge fix:`, 4 contain explicit retractions, 3 are browser
verifications) · **every package takes at least one send-back** (observed, without exception) · **at
most one pin-moving lane in flight at any time** · concurrency has a measured wall-clock cost (four
lanes took the dotnet stage from ~6.5 to ~10 minutes).

That is roughly **250 packages of nominal capacity** over 13 weeks. **This plan names on the order of
80.** I am deliberately planning to about a third of nominal, and the reasons are the plan's, not
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
5. **`Regolith → Rubble`** (W10). *The player is told they are carrying lunar soil on a starship.*
6. **The device-removal hole.** *The player can build a door they can never take down.*
7. **RUG and SHELF made real, or removed.** *The player places furniture that does not exist.*
8. **Performance: memoise the "no consumable aboard" answer.** A machine below the wreck floor with
   no consumable stays needy forever and is re-evaluated at 1 Hz through up to three full item-store
   scans; the wreck authors hundreds by design. **INFRASTRUCTURE** — and it must be *measured* before
   it is built, because the last two performance items in this repo measured at ~1 % and *inert*.

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
   owner playing M3's demo. Budget a real playtest in week 9, not week 13.
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
