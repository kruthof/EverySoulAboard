# M3 — THE SECOND SOUL: the buildable packages

*Written **2026-07-30**, at M2-close, **per `docs/ROADMAP.md` §4's own instruction** — "charters get
written at end of M2, not before". This file is to M3 what
`docs/design/perilune-roadmap-q3.packages.md` §5 is to M2: the seams, the pin impacts, the mutation
tables, the conflict matrix. `docs/ROADMAP.md` stays the status authority; this file is never the
status of anything.*

**INPUTS, in order of authority.**

1. **OD-L** (`ROADMAP.md` §5, binding, 2026-07-30) — **the opening arc is POD-DRIVEN.** The pawn
   wakes to a ship of frozen/dead crew and the goal is unfreezing them. MOSS controls freeze/unfreeze
   **per pod** and states each pod's **failure reason — the reason IS the hint what to repair next**.
   Pods form an **escalating repair ladder**: each successive pod's repair item needs a deeper
   production chain — **chain DEPTH is the difficulty curve**, refining OD-11's Parts-count
   escalation. The WORK tab stays high-level prioritisation; per-target detail comes through
   right-click prioritise (re-ratifying **OD-A**) and the **POD BAY**.
2. **OD-A · OD-B · OD-E · OD-G · OD-H · OD-I · OD-J · OD-K** — the standing ledger. OD-K's fourth
   delegated call, **the vacuum-work ladder, is still unchartered**; this file gives it an id (§4,
   **M3-14**).
3. **`docs/design/rimworld-reference.md`** — the mechanism authority. Cited by section throughout;
   **§1.5, §2.2, §2.4, §2.6, §3.5, §5.1–§5.2, §6.1 and §8.4 are the sections M3 actually rests on.**
4. **`docs/design/perilune-wreck-start.plan.md` §3.3, §3.4, §3.4.1, §4 W5** — the thaw's original
   spec. Most of M3-2…M3-5 is that spec, re-cut into shippable packages and **corrected where the
   tree has moved past it** (§12 of this file lists every correction).
5. `docs/MECHANICS.md` §13.22, §13.23 · `docs/TARGET.md` §3 rows T11–T15 · `docs/PROCESS.md` §2–§3.

**HOUSE FORMAT.** Every charter below carries CLASS · PLAYER SENTENCE (`TODAY THE PLAYER…/AFTER
THIS…`) or an explicit INFRASTRUCTURE marker · LANE · SIZE · SEAM with `file:line` · PIN IMPACT ·
SPINE? · MUTATIONS table · ACCEPTANCE · CONFLICTS. The two standing requirements —
**(A) pin-neutrality is PROVED by `git diff -- tests/Perilune.Tests/Golden/ ci.sh content/` = 0
lines**, and **(B) a source-text guard uses the shipped stripper plus a negative control carrying a
later real comment** — apply to every package here and are not restated per charter
(`…q3.packages.md` §1).

⚠️ **EVERY `file:line` IN THIS FILE WAS READ ON `lane/m3-charters` @ `712d891`.** §13 states which
claims were read and which were inherited. **Re-verify before building on one** — the M3 outline in
`…q3.packages.md` §6 carried **three** stale citations and **one wrong census**, all found by
opening the files (§12).

---

## 1. THE MILESTONE, AND WHAT CLOSES IT

> *"I can earn a second crew member, choose which one, and the choice changes what my ship can do —
> and the third, fourth and fifth do not all arrive at once."*

**The exit gate (`ROADMAP.md` §1, verbatim):** a second thaw is **earned and chosen**; thaws 3–5
**don't arrive in one sim-hour**; the new soul's **WORK row differs from Rell's**. **Hard 60-minute
owner playtest at the end of week 9.**

**How OD-L changes the shape of that gate.** Before OD-L the thaw was a *price* (Parts) against a
*headroom* (scrubbing, food). Under OD-L it is a **repair objective per pod**, and the pod bay
**names the objective**. That converts three vague sentences into one legible loop:

```
open MOSS → POD BAY lists the capsules → each row states WHY it will not cycle
   → the reason names a thing to repair or an item to make
      → the player repairs / makes it (WORK tab, or right-click Prioritise — OD-A)
         → the row goes green → thaw → a person steps out
```

⭐ **AND THE LADDER IS ALREADY IN THE CONTENT.** `content/core/SimDefs/recipes.def:19-22` is a
three-step chain and nothing else:

| depth | item | made by | from |
|---|---|---|---|
| 0 | `Seals` | — | authored aboard (10 units — `AuthoredShips.cs:2078` 2 + `:2246` 8) |
| 1 | `Scrap` | `SalvageRecycler` | 4 `Regolith` → 3 `Scrap` |
| 2 | `Parts` | `Fabricator` | 2 `Scrap` → 1 `Parts` |
| 3 | `ControllerModule` | `MachineShop` | 2 `Parts` → 1 `ControllerModule` |

⇒ **OD-L's "deeper production chain" needs no new recipe, no new `ItemKind` and no new def row.**
Depth 3 already costs `1 CM = 2 Parts = 4 Scrap = 6 Regolith` **and three working benches** — and on
the wreck all three benches boot wrecked. The ladder's difficulty is *how much of the ship you had to
bring back to life*, which is exactly the phase-1 loop.

**Anti-goal restated for this milestone:** we are not building a thaw *economy*. OD-B parks E1–E4.
Every number in M3 is a **content dial on one ship**.

---

## 2. THE PIN CHAIN — four published rows, one standing deep lane

**Rule unchanged** (`…q3.packages.md` §2): one deep lane owns the whole table, **no two rows run
concurrently**, each row gets its **own** re-pin commit touching `ci.sh` + `CLAUDE.md` +
`MECHANICS.md` + `HANDOVER.md` + memory together, plus a `pin/<row>` tag where named.

**The five pins as `CLAUDE.md` states them today** — ⚠️ **re-measure before quoting; these were read
from the doc, not driven**: P1 `81733e27709f36e4` · P2 `482fd40c070b54e0` ·
P3 `94c29d5f6408d91c` · P4 `0c5ddbc07e41f07d` · P5 `09900b9a44119272`. Last mover **M2-2**
(`pin/m2-e`); **M2-12 (`pin/m2-d`) discharged with NO move** and is the designated power rollback
point.

### The chain, in EXECUTION order (letters are historical ids, not ordinals)

| # | lane | package | expected to move | why | rollback point |
|---|---|---|---|---|---|
| **M3-a** | `lane/cryo-system` | **M3-2** | **P1 P2 P3** | Registering a system folds its `SYSS` seed **unconditionally** — W0-6 measured exactly this on four *empty* systems. ⭐ **AND A SECOND CAUSE THIS FILE ADDS:** M3-2 also ships the emergency-thaw **"has fired" bit** as storage (§5 M3-2, §11 coupling 1), which is a new hashed+saved field on its own. **P4/P5 expected to HOLD** — `CryoPod`'s `machines.def` row **already landed in W3** and P4/P5 already moved for it; this package adds no def field (see the literal-vs-def ruling in M3-3). | ⭐ **tag `pin/m3-a`**, all five values recorded in the tag's own commit |
| **M3-d** | `lane/heater` | **M3-10** | **P4 P5** | A new `machines.def` row + a new `DeviceKind` grows **both** `Machines` and `Recipes` (`new RecipeDef[d.Machines.Length]` — two arrays for one enum member). **P1 P2 P3 hold IFF no pinned ship gets one** — and the charter's ruling is that none does. | ⭐ **tag `pin/m3-d`** |
| **M3-b** | `lane/skill-consumers` | **M3-7** | **P1 P2 P3** | Work rates change on every ship that does work. ⚠️ **+P4 P5 IF the multiplier lands as a def field — and the charter rules it a LITERAL, so they should hold. MEASURE.** | — |
| **M3-c** | `lane/rest` | **M3-9** | ⛔ **ALL FIVE** | Fatigue recovery is a behaviour change **and** needs def scalars. It also removes a flat mood deficit, which feeds `ShipMetrics.Morale` → `DirectorSystem.cs:82` → `_wearPressure` → `MachineWearSystem` ⇒ **machine wear rates change on every ship.** | ⭐ **tag `pin/m3-c`** |

> ### ⭐ WHY THIS EXECUTION ORDER AND NOT ALPHABETICAL
>
> **M3-a first** — nothing else in the milestone exists until a pod can cycle, and it is a SPINE lane
> (save chapter + `SystemStack`) that must not sit behind three other pin movers.
> **M3-d second** — `MachineDefs.cs:101` and `machines.def:62` both say *"there is no heater device in
> the game"*, and `WorksiteSafety.CanStageWorkerAt` counts thermal, so **a freezing compartment is
> unworkable and the pressure frontier terminates at the heated core.** Every thaw-curve measurement
> taken before the heater lands is a measurement of a ship the player cannot expand. **It is the one
> pin row that invalidates other people's numbers by being late.**
> **M3-b third, M3-c LAST — and that is a risk ruling, not a preference.** M3-9 (REST) is the biggest
> pin mover in the milestone (all five, plus a wear-rate change on every ship) and it is **the only
> pin row that appears nowhere in the exit gate**. It is therefore scheduled where a slip costs the
> least. ⚠️ **If week 9 gets tight, M3-9 is the row that slips. Say so out loud rather than
> discovering it.**

> ⚠️ **TWO PIN ROWS IN FLIGHT AT ONCE IS THE FAILURE THE CHAIN EXISTS FOR** (`ROADMAP.md` §8 risk 3).
> `git tag pin/*` before starting any of these four.

---

## 3. THE MERGE ORDER

Numbered; this is the order the integrator merges `--no-ff` into `main` and re-gates. **Bold rows are
pin-chain rows and RUN ALONE.**

⛔ **A GATE, NOT A LANE, SITS AT POSITION 0: the M3 owner-decision batch (§10).** Six items, one
message, three-day default-to-recommendation. **Items 1, 2 and 6 change what packages 3, 4 and 5
contain**, and item 6 (*is FREEZE a player verb?*) decides M3-1's answer outright. `Device.Name`'s
double duty must be answered **before `CryoSystem` freezes a save chapter**, not after.

⚠️ **PRECONDITION CARRIED FROM M2, NOT RE-CHARTERED HERE: `M2-17`** (teach the occupancy harness to
author a grid, INFRA) is **still unmerged** — `ROADMAP.md` §3 row 22. Under OD-H/OD-I an unattended
fixture run does **no work at all**, so **every occupancy or throughput number quoted anywhere in M3
is meaningless until M2-17 lands.** It does not block the thaw chain; it blocks *measuring* it.

| # | lane | package | notes |
|---|---|---|---|
| **0** | — | **THE OWNER BATCH (§10)** | ⛔ A gate. Items 1/2/6 are inputs to 3/4/5. |
| 1 | `lane/pod-identity` | **M3-1** | INFRASTRUCTURE (design). Answers `Device.Name`'s double duty. ⛔ **Before 5.** |
| 2 | `lane/vacuum-ladder` | **M3-14** | ⭐ **OD-K's unchartered fourth call, given an id here.** Independent of the whole thaw chain; pin-neutral; it is what lets a direct order cross the frontier at all. Merge it early — it is the only M3 package that makes an *existing* M2 verb reach further. |
| 3 | `lane/pod-census` | **M3-6** | ⚠️ Claims `AuthoredShips.cs` — **strictly serialized, and M2-11 is a PAST claimant whose census this may move** (§9). **Before 6**: M3-3's gate reads the rungs this authors. |
| 4 | `lane/deck1-vent` | **M3-11** | ⚠️ Same file as 3. **After 3.** Its shape is owner batch item 2. |
| **5** | **`lane/cryo-system`** | **M3-2** | ⛔ **PIN M3-a. RUNS ALONE.** SPINE (`SystemStack`, save chapters, `Simulation`). → tag `pin/m3-a`. Needs 1. |
| 6 | `lane/thaw-cmd` | **M3-3** | SPINE (`Commands`). Needs 5 and 3. |
| 7 | `lane/pod-bay` | **M3-4** | The MOSS **POD BAY** screen — *this is what finally gives "restore MOSS" a job*. Needs 6. |
| 8 | `lane/thaw-blocked` | **M3-13** | Needs 7. ⚠️ **Merge inside the same integration window as 7** — a pod bay whose rows refuse without a reason is OD-L's own premise broken on delivery. |
| 9 | `lane/emergency-thaw` | **M3-5** | Needs 5 (the bit) and 6 (the mechanism it must NOT share). Pin-neutral **only because 5 shipped the storage** — if it is not there, this becomes a second re-pin. |
| **10** | **`lane/heater`** | **M3-10** | ⛔ **PIN M3-d. RUNS ALONE.** → tag `pin/m3-d`. |
| **11** | **`lane/skill-consumers`** | **M3-7** | ⛔ **PIN M3-b. RUNS ALONE.** SPINE-adjacent (the `work` wire gains columns). |
| 12 | `lane/skill-display` | **M3-12** | Needs 11. ⭐ **Owns the milestone demo** (§8). |
| 13 | `lane/sleeper-personas` | **M3-8** | Writing, host-side. Needs 6 (the `CitizenThawedEvent` it hangs on). |
| **14** | **`lane/rest`** | **M3-9** | ⛔ **PIN M3-c. RUNS ALONE.** → tag `pin/m3-c`. **Last by risk ruling (§2).** |

⚠️ **A HARD HUMAN GATE SITS AFTER 14: the 60-minute owner playtest at the end of week 9.** This
project has carried the P2 60-minute bar **unmet since 2026-07-21**. The integrator **names the date
when M3-1 merges** (`ROADMAP.md` §8 risk 4). If the gate says the thaw curve is not fun, **M4 and M5
are the budget that pays for fixing it — which is only true if the gate happens while that budget
still exists.**

---

## 4. THE COUNTS, AND THE INFRASTRUCTURE LEDGER

⛔ **RE-DERIVE FROM THE HEADINGS ON THE TREE YOU ARE ON — `grep -n '^### M3-' docs/design/perilune-m3.packages.md`
is the whole method.** `…q3.packages.md` §9's standing note applies verbatim to this section: a count
is a measurement of a tree, and that section was wrong four separate ways in one quarter.

| milestone | packages | PLAYER | INFRASTRUCTURE | cap (⌊n/5⌋) | headroom |
|---|---:|---:|---:|---:|---|
| **M3** *(chartered here)* | **14** | **13** | **1** (M3-1) | **2** | **1** |

**M3 = 14** — M3-1…M3-13 from the `ROADMAP.md` §4 outline, **plus M3-14**, the vacuum-work ladder.
The outline estimated 13; the fourteenth is OD-K's delegated call, which had no id anywhere.

### ⭐ WHY THE VACUUM LADDER IS **M3-14** AND NOT AN M2 ID

The brief left the numbering to this document. **M3-14 is the call**, for four reasons, in order of
weight:

1. **M2 is closed as a player arc.** `ROADMAP.md` §3 shows M2-1…M2-12 all merged; the only M2 row
   left is **M2-17, an INFRASTRUCTURE re-baseline**. Adding a fifteenth *player* package to a closed
   milestone re-opens a milestone whose exit gate has already been demonstrated (07-30, demo 5/6 +
   M2-12's lights).
2. **It is chartered against M3's own content.** The ladder's value is that a direct order can cross
   the pressure frontier — and **the frontier is what M3's thaw curve is made of.** In M2 it would
   have been a verb with nowhere interesting to go; in M3 it is how the player reaches the wrecked
   benches that make the ladder's depth-2 and depth-3 items.
3. **Published ids are stable and gaps are not reused** (`…q3.packages.md` §11): M2-7 is struck,
   M2-13…M2-16 never existed, and **neither range may be reused.** The next free id in the M2 range
   is M2-22 — which would put a *new* package number *after* the milestone's re-baseline and read as
   an M2 slip in every future summary.
4. **Nothing forces it earlier.** I looked for the reason it could not wait and did not find one:
   `WorksiteSafety.CanStageWorkerAt` (`SafetySystem.cs:125-128`) refuses **autonomous** work in
   unbreathable air, which is the RimWorld-analogous behaviour and is **correct**
   (`rimworld-reference.md` §8.4, which retracted the opposite claim). What is missing is only the
   *override ladder on top*, and the only override that matters today — a **player-forced** order —
   did not exist until **M2-9 landed on 2026-07-30**. ⇒ **The ladder could not have been chartered
   into M2 any earlier than the last week of M2 anyway.**

**Classification notes** (so a reviewer can check them):
- **M3-1 is INFRASTRUCTURE** — its deliverable is a document. `…q3.packages.md` §9 note 1: design
  packages are INFRASTRUCTURE and **giving one a fabricated player sentence is the exact failure the
  class field exists to stop.**
- **The split-sentence rule is NOT used in M3.** It was used exactly once, by M2-1, and a second
  claimant is the signal it has become a loophole. Every other package here has its own sentence.
- **A re-pin commit is not a package** — M3-2, M3-7, M3-9, M3-10 each carry one as a ritual tail and
  count once.
- **M3-6 absorbs the ladder's content authoring** rather than spawning a fifteenth package. OD-L's
  "content authoring for the chain depths is new M3 scope" is one authored table in a file M3-6
  already opens; a separate package for it would be padding.

---

## 5. THE CHARTERS

### M3-1 — `Device.Name`'s double duty, decided *(INFRASTRUCTURE)*

**CLASS: INFRASTRUCTURE (design)** · **LANE: `lane/pod-identity`** · **SIZE: S**

⛔ **NO PLAYER SENTENCE, deliberately.** Its deliverable is a decision plus the paragraph that
records it. Writing a fake sentence here is the failure the CLASS field exists to prevent.

**THE COLLISION, both halves re-verified this session.**

- `Device.Name` **is the MOSS registry key**: `MossBindings.RegisterAdapters` registers every adapter
  **by name** (`sim/Sim.Dsl/MossBindings.cs:14-41`, `registry.Register(device.Name, …)` at `:32` and
  `:40`), and `Simulation.StateHash` folds it **for that reason, in a comment that says so**
  (`sim/Sim.Core/Simulation.cs:553-555`: *"`MossBindings.cs` registers every MOSS adapter BY NAME, so
  a restore that changed one silently unbinds every player program, no error"*).
- The wreck's pods **already encode a person in it**: `AuthoredShips.cs:1856` is
  `Name = "pod_" + pod.Who.ToLowerInvariant()`, and `AuthoredShips.cs:1727-1728` names
  `pod_vance`/`pod_sokolov`/`pod_iqbal`/`pod_osei` as the four `Broken` ones.

⇒ One field cannot be a **stable automation identifier** and a **mutable "who is in the box"**.

**THE DECISION THIS PACKAGE MUST TAKE, and the shape of the answer:**

> ⭐ **THE COLLISION ONLY EXISTS IF A POD IS EVER RE-OCCUPIED.** A pod that is thawed once and never
> refilled has a name that is true forever and never mutates — so `Name` stays the registry key,
> carries the sleeper, and **no new field is needed anywhere.**
>
> ⇒ **The whole of M3-1 reduces to one question, and it is OWNER BATCH ITEM 6: is FREEZE a player
> verb?** OD-L says *"MOSS controls freeze/unfreeze per pod"*, which reads either as *"MOSS is the
> surface where a pod's frozen state is controlled"* (thaw only) or as *"the player may put a crew
> member back in a box"* (re-occupancy).
>
> **RECOMMEND (a): thaw only in M3.** `Name` remains the registry key AND the sleeper's identity, a
> pod is single-use, and M3-1 lands as **a recorded non-change** — a paragraph in `MECHANICS.md`
> plus a test pinning that no code path writes `Device.Name` after boot.
> **If the owner takes (b), M3-1 becomes a real design package**: the occupant must leave `Name`,
> and the only options that do not add a `Device` field are (i) a parallel sim-side occupancy map
> (new hashed state, new save chapter — a second pin cause inside M3-a) or (ii) a naming convention
> that separates slot from occupant (`pod_a1` as the key, occupant elsewhere), **which is a rename of
> every authored pod and therefore moves nothing pinned but breaks every existing player program that
> named a pod.**

**SEAM (the files the decision binds).** `sim/Sim.Core/Entities/Device.cs:37-49` (the `CryoPod`
comment already states the intended field mapping: `IsOpen` / `Name` / `Condition`, and *"W5 adds
`Progress`. NO new `Device` field."*) · `sim/Sim.Core/Simulation.cs:553-555` · `MossBindings.cs:14-41`
· `AuthoredShips.cs:1740-1780` (`PodSpec` + `WreckPods`) · `:1856`.

**PIN IMPACT: NONE — it writes no code.** ⛔ **But it CONSTRAINS `pin/m3-a`**: option (b)(i) adds a
hashed field to M3-2's commit. Answer it first.

**SPINE? No** (docs), **but it is an integrator-lane merge** because `MECHANICS.md` lives on the main
checkout.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | A code path writes `Device.Name` after boot | the immutability pin — **driven**, not scanned: boot the wreck, snapshot every device name, run 3 000 ticks with a thaw executed, assert the multiset is unchanged |
| 2 | The pin is written as a text scan for `\.Name =` | ⚠️ **refuse it in review.** Trap 1 + trap 4: a scan is satisfied by a comment and defeated by `device.Name=x`. Record the state, not the spelling |

**ACCEPTANCE.** No browser step. The deliverable is (i) the answer written into `MECHANICS.md` §13,
(ii) the immutability test, (iii) one line in `ROADMAP.md` §5 if the owner's answer creates a new OD.

**CONFLICTS.** `MECHANICS.md` — integrator only.

**SIZE: S** — one decision, one driven test. **It is S *because* the recommendation is a non-change;
under batch answer (b) it is M.**

---

### M3-14 — the vacuum-work ladder: a direct order may cross the frontier *(OD-K's fourth call)*

**CLASS: PLAYER** · **LANE: `lane/vacuum-ladder`** · **SIZE: M**

> **TODAY THE PLAYER IS MISLED ABOUT** an order they gave in an airless compartment: the sim refuses
> it **silently and forever**, and a right-click *Prioritise* on a machine behind the frontier is
> accepted by the menu and then dropped by the dispatcher. **AFTER THIS** a direct order **goes
> anyway** — the pawn walks into vacuum because *you told her to* — and the menu and the job agree
> about which orders are offerable.

**THE ANALOGUE, cited rather than derived.** `rimworld-reference.md` **§2.4 (`Danger`) and §8.4 (the
four-rung override ladder)**. RimWorld and Perilune made **the same** base choice — autonomous work
does not enter vacuum, refused at the dispatcher (RW: region danger threaded through the path search,
`Verse/Region.cs:434-436` + `DangerUtility.cs:7-25`; Perilune: `WorksiteSafety.CanStageWorkerAt`).
§8.4's own retraction box is binding here: *"the directive points **toward keeping it**"*. **What
Perilune lacks is the ladder on top.** The three rungs this package builds, in RimWorld's own order:

| rung | RimWorld | this package |
|---|---|---|
| **2. `playerForced` bypass** | `NormalMaxDanger` returns `Deadly` when `pawn.CurJob.playerForced` | a job claimed under **M2-9's held order** (`Citizen.HeldByOrder`) bypasses `CanStageWorkerAt` |
| **3. menu/job agreement** | `FloatMenuMakerMap.makingFor == p` **also** returns `Deadly`, so the menu is built with the ceiling already raised — *"one rule, not two"* | the Room Zoom's *Prioritise* menu offers exactly what the forced job will accept — **the menu asks the same predicate, with the same bypass flag** |
| **4. suppressible self-rescue** | `JobGiver_FindOxygen` returns null on `PlayerForcedJobNowOrSoon` — *"the player can order a colonist to stay and suffocate, implemented deliberately as one clause"* | `SafetySystem`'s `JobKind.Flee` does **not** pull a pawn off a held order |

⛔ **RUNG 1 IS DELIBERATELY OUT OF SCOPE, AND THE REASON IS STATED SO IT IS NOT REDISCOVERED.**
RimWorld's rung 1 is a **per-work-giver** `MaxPathDanger` override — 23 of 83 givers hardcode
`Deadly` (*"this job is worth dying for"*), and the 24th, `WorkGiver_DoBill`, overrides **downward**.
Perilune's analogue is a per-work-type tolerance, and OD-K's delegated call asks for it **opt-in**.
**Opt-in means a per-citizen, per-work-type column — which is a second `Citizen` byte, a CITZ chapter
bump and a pin lane.** That is M3-7's shape, not this package's. ⇒ **Filed by name: "rung 1, the
opt-in deadly work givers, rides M3-b or nothing."** ⚠️ **And the deviation is recorded**: RimWorld
does not make rung 1 opt-in; we would, because a pawn who autonomously walks into vacuum and dies is
the *invisible-feedback-is-functional* failure with a body attached.

**SEAM.**
`sim/Sim.Core/Systems/SafetySystem.cs:104-158` — `WorksiteSafety.CanStageWorkerAt(sim, tile)` at
`:125-128` is the whole rule (`!CanCycle || doorway || IsBreathable`), and its own doc comment at
`:95-100` already says why the seam is there: *"`CanStageWorkerAt` is public so a future wire channel
can ask it per tile and finally say so."*
**It is asked at exactly three sites, and this package must find all three** — `JobContext.cs:80`
(*"asked here and NOWHERE ELSE in the job system"*, `:64`), `MachineWearSystem.cs:667` and `:706`.
⚠️ **That comment at `JobContext.cs:64` is a claim about the job system only; the two wear-system
sites are outside it. A lane that reads the comment and stops has patched one third of the rule** —
this is `M2-0`'s five-entry-site finding repeating in a different file (`ROADMAP.md` §8 risk 2).
Client half: `client/src/ui/roomzoom-view.js` (M2-10's context menu) + `client/src/ui/prioritise-model.js`.

**PIN IMPACT: PIN-NEUTRAL — and it is neutral by construction, which is the good kind.** Every pinned
run is unattended: no command is ever enqueued, so **no job is ever `HeldByOrder`**, so the bypass
branch is never taken. ⚠️ **Prove it with check (A) AND with a non-vacuity control** — a fixture that
*does* issue a held order into vacuum must show the behaviour changing, or the neutrality claim is
the "pin held because nothing exercised it" shape that `pin/m2-d` was tagged for.

**SPINE? Partly** — `SafetySystem.cs` is not on the spine list, but `Commands.cs` is if the bypass
needs a flag on `PrioritiseJobCommand`. **Prefer reading `Citizen.HeldByOrder` (M2-19's field, already
hashed and saved) over adding a command flag** — no new state, no chapter, and the release semantics
are already pinned (the `JobKind` setter clears the hold on `None`).

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Delete the bypass at `JobContext.cs:80` only, leaving `MachineWearSystem`'s two | ⚠️ **the three-site leg.** A held repair order on a machine in a vacuum compartment must land — and the fixture must target a machine whose service is staged by `MachineWearSystem`, not only a dig |
| 2 | Bypass for **any** job, not only a held one | the autonomy leg: an unheld pawn with Repair@1 and a needy machine in vacuum **stays put**. ⚠️ RW§8.4: this is the rung-0 behaviour we are KEEPING |
| 3 | Let `Flee` pre-empt a held order | the self-rescue-suppression leg (RW§8.4 rung 4). ⚠️ **Blind the legs** (fifth trap): assert *both* that she stays and that her `Suffocation` rises, in separate tests |
| 4 | The menu offers *Prioritise* on a tile the bypassed rule would still refuse | the menu/job agreement leg — RW§8.4 rung 3, *"one rule, not two"*. **Record the predicate call at the seam** (trap 4), never scan for a spelling |
| 5 | Suppress `Flee` for **all** pawns, not only the held one | the two-pawn leg — with one crew member these are indistinguishable, so **the fixture must carry two** (M2-18's precedent) |

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` (`--ship wreck`). Enable **Repair**. She services machines in the core and **never**
   enters a sealed hall — unchanged, and this is the leg that proves rung 0 survived.
2. Enter a sealed vacuum compartment in the Room Zoom, right-click a wrecked machine →
   **Prioritise: repair X** is **offered**.
3. She walks in, works, and her `Suffocation` climbs on the crew dock.
4. She does **not** flee mid-order. **She may die.** ⭐ *That is the feature — the player ordered it,
   and RimWorld ships exactly this clause.*
5. Cancel / complete the order → autonomy resumes and she leaves.

⚠️ **STEP 4 IS THE ONE A REVIEWER WILL WANT TO SOFTEN. Do not.** A bypass that quietly rescues the
pawn is a bypass the player cannot reason about, and it re-creates the silent refusal in a nicer
costume.

**CONFLICTS.** `SafetySystem.cs` / `JobContext.cs` / `MachineWearSystem.cs` — serialize against **any**
M3 dispatch work; `roomzoom-view.js` — serialize against M2-10's shipped menu (§9).

**SIZE: M** — one predicate, three call sites, one client-side agreement, and a five-leg mutation
table with two blinded legs.

---

### M3-6 — the pod census, and the ladder's rungs *(authored and asserted)*

**CLASS: PLAYER** · **LANE: `lane/pod-census`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** tell which capsules are people and which are graves, and **nothing
> stops a later edit changing how many souls the game contains.** **AFTER THIS** the bay's census is
> pinned by hand-written literals, and **each intact pod carries the rung of the repair ladder that
> will open it** (OD-L).

⛔ **THE OUTLINE'S CENSUS IS WRONG AND THIS IS THE CORRECTION.** `…q3.packages.md` §6 says
*"pods 8 · open at boot 1 · intact 5 · wrecked 2"*. **Read off `AuthoredShips.cs:1760-1782` this
session, the shipped census is:**

| | count | who |
|---|---:|---|
| capsules | **12** | three rows of four |
| open at boot | **1** | `Rell` (1.00) |
| intact + occupied | **7** | Lindqvist .94 · Ozawa .91 · Ferreira .88 · Mbeki .86 · Bahri .83 · Nakamura .81 · Torres .78 |
| wrecked (dead) | **4** | Vance .04 · Sokolov .07 · Iqbal .03 · Osei .06 |
| **thaws available** | **7** | the design target is **8 living**, one already awake |

⚠️ **AND THE FILE ITSELF RECORDS THE EXACT MISTAKE THE OUTLINE REPEATED** (`AuthoredShips.cs:1332-1336`):
*"AN EARLIER DRAFT OF THIS SHIP AUTHORED EIGHT CAPSULES OF WHICH TWO WERE WRECKED … it read an answer
about what the wrecked-pod ART DEPICTS as an answer about how many crew are RECOVERABLE."*
⇒ **The 8/1/5/2 in the outline is that dead draft, quoted forward.** Ninth trap shape adjacent: a
correct correction in one file did not reach the document that consumed it.

**⭐ THE LADDER, AND WHERE ITS RUNG LIVES — settled here, with the precedent cited.**

OD-L needs a per-pod repair requirement. Three places it could live:

| option | cost |
|---|---|
| a new hashed `Device` field | ⛔ refused — `Device.cs:46-49` and wreck-plan W5.1 both say **NO new `Device` field**, and it is a second pin cause inside `pin/m3-a` |
| a new def node (`[thaw]` rungs) | moves **P4 P5** for a table nobody tunes at runtime |
| ⭐ **derive the rung from the pod's authored `Condition`, via a literal band table in `ThawGate`** | **no new state, no def field, no pin** — and the per-ship dial is a number that is *already* authored per pod, *already* hashed, *already* saved, and whose documented meaning is *"how badly the raid treated it"* (`Device.cs:47`) |

⇒ **Option 3, on the M2-1 precedent, quoted because it is the same argument**: *"it is a rule, not a
tunable, and it therefore adds no hashed state and moves neither defs checksum."* ⚠️ **And the repo's
own warning applies to the alternative: a def field pinned only by the checksum is NOT pinned.**

**The rungs themselves are OWNER BATCH ITEM 1.** The recommended table, and the authored `Condition`
each pod needs to land on it:

| rung | band | item | depth | pods (recommended) |
|---|---|---|---|---|
| 0 | ≥ 0.90 | 1 × `Seals` | found aboard | Lindqvist .94 · Ozawa .91 |
| 1 | 0.85 – 0.90 | 1 × `Parts` | Scrap → Parts | Ferreira .88 · Mbeki .86 |
| 2 | 0.80 – 0.85 | 2 × `Parts` | ×2 | Bahri .83 · Nakamura .81 |
| 3 | < 0.80 | 1 × `ControllerModule` | Parts → CM, **needs the MachineShop alive** | Torres .78 |

**Nothing in the shipped `Condition` array has to change to land this.** That is the point of choosing
`Condition` as the carrier: **the ladder is already authored and nobody knew.**

**SEAM.** `sim/Sim.Gen/AuthoredShips.cs:1740-1782` (`PodSpec` + `WreckPods`) · `:1856` (the naming) ·
`:1310-1340` (the header block that states the counts in prose — **it must be corrected in the same
commit or the file contradicts itself**) · `tests/Perilune.Tests/WreckShipTests.cs:60-210` (the
existing hand-written literals — `CryoPodFailBelow = 0.10f` at `:80`, the eight-living assertion at
`:90`, the wrecked-pod walk at `:117-137`).

⚠️ **`WreckShipTests`'s literals are deliberately hand-written and NOT derived from the table**
(`AuthoredShips.cs:1325-1327`) — **so a content change cannot pass silently.** Keep that property.
**Do not "improve" the test by reading `WreckPods`.**

**PIN IMPACT: PIN-NEUTRAL IF WRECK-ONLY — MEASURE.** The wreck is behind no pin. ⚠️ **The band table
lands in `ThawGate` (M3-3), not here** — this package authors numbers and asserts them.

**SPINE? No.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Change one pod from intact to wrecked | the census leg — **and it must name the count that moved**, not merely fail |
| 2 | Move a pod's `Condition` across a band edge (0.90 → 0.895) | ⭐ **the ladder leg, and it is the one this package exists for.** The rung it resolves to must change, driven through `ThawGate` |
| 3 | Author a pod at exactly a band edge (0.90) | the boundary leg — **pick `>=` or `>` and pin it.** RW§6.1's own lesson: `CapableOf` is a strict `>`, so *"a capacity sitting exactly at `minForCapable` is NOT capable"* — an edge that nobody chose is an edge somebody will hit |
| 4 | Assert the census by reading `WreckPods` instead of by literal | ⚠️ **the vacuity leg — refuse it in review.** A test derived from the table under test can never fail |
| 5 | Leave the prose header at 8/1/5/2 while the table says 12/1/7/4 | the self-consistency leg: a source scan of the header block against the literals, with `codeOnly` + a negative control |

**ACCEPTANCE.** Wire/driven only; the browser beat belongs to M3-4. **But the integrator opens the
Room Zoom on the cryo bay once and counts twelve capsules, four of them wearing the wrecked twin and
a `Corpse` stack** (`MECHANICS.md` §13.22d — the art join landed 2026-07-28).

**CONFLICTS.** ⛔ `AuthoredShips.cs` — **strictly serialized**; claimants M1-A ✅, M1-I ✅, M2-11 ✅,
**M3-6, M3-11** (§9). Rebase, never merge blind.

**SIZE: M** — the authoring is small; the census correction reaches a prose header, a test file of
hand-written literals, and a document that has been quoting the wrong number.

---

### M3-11 — a deck-1 vent: somewhere to put the people

**CLASS: PLAYER** · **LANE: `lane/deck1-vent`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** ever open the ship's upper deck: all eight deck-1 halls peak at
> **0.000 kPa forever** and no verb changes it. **AFTER THIS** repairing one authored machine gives
> the upper deck air — and the thaw curve has somewhere to put seven people.

> ### ⛔ THE OUTLINE CALLS THIS "ONE LINE OF CONTENT". IT IS NOT, AND HERE IS THE MEASUREMENT.
>
> **The good news first, and it is decisive: a deck-1 vent WORKS, and no vertical gas term is
> needed.** `MECHANICS.md` §13.23a names three ways out — *"author a deck-1 vent · add a vertical
> transport term · accept the dead deck"* — and the first one is real, because an `AirVent` injects
> into **its own room** from an unmodelled reserve (`AtmosphereSystem.cs:123-145`). **The grid ship
> already proves it**: `vent_corr_up` at `(34,9,1)` (`AuthoredShips.cs:150`) and `vent_spine_1` at
> `(4, SpineY0, GridWreckDeck)` (`:1084`) pressurise deck 1 on `--ship grid` today.
> ⇒ **OD-E is NOT violated.** OD-E's standing refusal is *"no vertical gas term is SHIPPED FILED"*.
> Authoring a vent adds no term.
>
> **The bad news, and it is why this is not one line: the vent needs POWER, and M2-11 just took
> deck 1 genuinely off-network.** `AtmosphereSystem.cs:123` gates the vent on
> `IsOpen && Powered && IsOperational`. `WreckCutDeck1Risers` (`AuthoredShips.cs:2331-2400`) deletes
> the deck-0 tray tile under **every** deck-1 device — *"that tile is the tap its riser came up
> through, and the raiders pulled the lot"* — leaving **23 of 611 devices off-network, exactly
> deck 1** *(inherited figure, not re-driven here)*. **A deck-1 vent authored today is inert.**
>
> **And the player cannot fix that with any verb.** `PlaceDeviceCommand.IsPlaceableFurniture`
> (`Commands.cs:583-600`) is Bed · Desk · Chair · Locker · PlantPot · Light · GrowBed · MedBed ·
> Table — *"deliberately excludes doors, life-support, power, crafting, sensors and every other
> functional machine — those ship at authoring only."* **No conduit, no vent.** Conduits also take no
> maintenance, so there is nothing to repair either.

**⇒ THE THREE OPTIONS ARE OWNER BATCH ITEM 2.** The charter is written against the recommendation:

⭐ **RECOMMENDED (a): author a deck-1 vent AND the single riser tap that feeds it, with the vent
authored WRECKED (`Condition` below `AirVent`'s fail floor of 0.10).** Then:
- deck 1 is still dead **in play at boot** — OD-E's spirit intact, and the halls still read 0.000 kPa
  on the first screen;
- **the act that opens the upper deck is a REPAIR ORDER** — the phase-1 exit-gate shape OD-K already
  ratified (*"order a repair, the lights come back"*), now *"order a repair, the deck breathes"*;
- it costs **one device + one tray tile** of authoring, and the deck-1 vent has a name the pod bay
  can put in a refusal (*"NO BERTH — UPPER DECK AIRLESS"*).

**SEAM.** `sim/Sim.Gen/AuthoredShips.cs:2019-2050` (the dead-deck block) · `:2331-2400`
(`WreckCutDeck1Risers` — ⛔ **the riser exemption goes INSIDE this helper, whose own doc comment says
it must run after the last deck-1 device is authored, because it reads the deck-1 device list**) ·
`AtmosphereSystem.cs:123-145` · the grid precedent at `:150` / `:1084`.

**PIN IMPACT: PIN-NEUTRAL (wreck content) — MEASURE.** ⛔ **BUT IT MOVES TWO NUMBERS M2-11 PINNED IN
PROSE AND IN A TEST**: the off-network census (23 of 611) and the flat demand (14.30 kW). ⚠️
**Re-derive both from the merged tree** and correct `WreckCutDeck1Risers`'s doc comment in the same
commit — trap 8: *a merged file's truth is a number neither lane could compute*, and M2-11's own
send-back was **a pin comment that stated the net as the deletion count.** ⚠️ **Quote the exemption
count separately from the cut count. Do not restate the net.**

**SPINE? No.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Author the vent but not the riser | the power leg: the vent reads `Powered == false` and the hall stays at 0.000 kPa. ⚠️ **This is the failure mode the package exists to avoid — it must have its own red test, because it is indistinguishable from "not built yet"** |
| 2 | Author the vent already repaired | the frontier leg: at boot the hall must still read 0.000 kPa. ⭐ *Without this the package silently deletes the milestone's own repair beat* |
| 3 | Repair the vent, run 3 000 ticks, assert nothing | the driven leg: the hall's pressure must **rise past a breathable floor**, and `CanStageWorkerAt` must go **true** on a tile inside it |
| 4 | Restore more than one tap | the census leg — the off-network count must be **exactly** its new value, re-derived, and named as an addition |
| 5 | Close it by re-pressurising on room creation | ⛔ **cannot be mutated — the command is gone (M1-L-b).** Recorded so a reader knows the historical wand is unreachable, not merely discouraged |

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh`. Open the deck rail → deck 1. The halls read **0.000 kPa**; the vent draws its wrecked
   twin.
2. Right-click the vent → **Prioritise: repair `vent_d1`** *(this is the M2-10 verb, unchanged)*.
   ⚠️ **The route to it crosses vacuum — so this step is only reachable after M3-14 (position 2).**
3. She crosses, repairs it.
4. The hall's pressure climbs; open its door; the deck becomes workable.

**CONFLICTS.** ⛔ `AuthoredShips.cs` — **serialize behind M3-6**. ⚠️ **M2-11 is a past claimant whose
measured census this changes** (§9). Coupled to **M3-14**: without it, acceptance step 2 is
unreachable on the shipping ship.

**SIZE: M** — two authored objects, one helper exemption, and a re-derivation of another lane's
measurement.

---

### M3-2 — `CryoSystem`: a pod cycles

**CLASS: PLAYER** · **LANE: `lane/cryo-system`** · **SIZE: L** · ⛔ **PIN CHAIN M3-a — RUNS ALONE**

> **TODAY THE PLAYER CANNOT** open a capsule at all — the pods are props. **AFTER THIS** a pod
> **cycles**: it counts down on screen, opens, and a named person steps out.

**Verified this session:** `grep -rn "CryoSystem"` returns **five hits, every one an assertion that it
does not exist** — `Device.cs:37`, `AuthoredShips.cs:1295`, `WreckShipTests.cs:42`,
`client/src/ui/onboarding.js:29`, `client/test/onboarding.test.js:475`.

**SEAM.**
- **new** `sim/Sim.Core/Systems/CryoSystem.cs` · registered in `sim/Sim.Core/SystemStack.cs`.
- ⭐ **NO NEW `Device` FIELD.** `Device.cs:46-49` already states the mapping and it is correct:
  occupied/open = `IsOpen`, who = `Name`, raid damage = `Condition`, **the cycle = `Progress`** —
  all four hashed (`Simulation.cs:~545-555`) and saved (DEVC v1/v2/v3).
- **the entry:** `Simulation.AddCitizen(name, tile)` (`Simulation.cs:199`), which takes its id from
  the already-hashed `_nextEntityId`.
- **the event:** a `CitizenThawedEvent` on the bus, mirroring `DeconstructCompletedEvent`.

⛔ **AND IT SHIPS ONE FIELD IT DOES NOT READ: the emergency-thaw "has fired" bit.** M3-5 needs it;
M3-5 is a separate lane; **a new hashed field discovered in M3-5 is a SECOND re-pin.** This is exactly
M2-1 → M2-19's shape (*storage first, reader later*), and it worked. ⇒ **M3-2 adds the bit, saves it,
hashes it, round-trips it, and asserts it is never set. M3-5 sets it.** (Wreck-plan W5.5: *"Budget one
bit… discovering it in W5b would be a second re-pin."*)

**PIN IMPACT: ⛔ P1 P2 P3 — registering a system folds its `SYSS` seed UNCONDITIONALLY** (W0-6 measured
exactly this on four *empty* systems), **plus the new hashed bit.** **P4 P5 EXPECTED TO HOLD** —
`CryoPod`'s `machines.def` row landed in W3 and this package adds no def field. **Measure; do not
predict** — `pin/m2-d` is the standing reminder that a predicted move can be a bit-identical window.

**SPINE? YES** — `SystemStack`, `Simulation`, `SaveWriter`/`SaveReader`. **Integrator lane, runs
alone.** → tag `pin/m3-a`.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | `CryoSystem.Tick` becomes a no-op | driven: set `Progress`, tick, the pod opens and a citizen exists |
| 2 | Open the pod without adding a citizen | the person leg — *the whole feature is the person* |
| 3 | Allow a second pod to start while one is cycling | the one-at-a-time leg (§3.4 option C — **the owner's stated mechanic**, "only one after the other") |
| 4 | Cycle a pod whose `Condition < fail` | ⛔ the OD-9 leg: **a wrecked pod's sleeper is dead and it must never cycle.** ⚠️ Fixture must assert the pod is below `fail` *before* driving, or the leg is vacuous |
| 5 | Round-trip a **mid-cycle** ship through save/load | ⭐ the byte-identity leg. **This is the one state the feature invents and the one a save test otherwise misses** |
| 6 | Place the new citizen on a wall / inside furniture | the tile leg — nearest walkable 4-neighbour, **deterministic tie-break required** |
| 7 | Register the system but leave `Tick` empty, and claim pin-neutrality | ⚠️ **the anti-leg**: prove the seed folded. W0-6's four EMPTY systems moved three pins — **an empty system is not a neutral system** |
| 8 | Set the emergency bit anywhere in this package | the storage-only leg — M3-2 stores it and never writes it |

**ACCEPTANCE.** Driven, plus a browser beat once M3-3/M3-4 land: **the Room Zoom draws a countdown on
the capsule and then a person standing beside it.** ⚠️ **The countdown badge is a client-side flourish
over `Device.Progress`** and is not this package's — do not build it here.

**CONFLICTS.** ⛔ SPINE: `Simulation.cs`, `SystemStack.cs`, `SaveWriter.cs`, `SaveReader.cs` —
integrator only, one at a time. Serialize against **every** other pin row.

**SIZE: L** — a new registered system, a new hashed bit, a save-chapter interaction, all five pins
re-measured, and the milestone's central mechanic.

---

### M3-3 — `ThawGate` + `ThawCommand`: the thaw is earned

**CLASS: PLAYER** · **LANE: `lane/thaw-cmd`** · **SIZE: L**

> **TODAY THE PLAYER CANNOT** ask for a thaw. **AFTER THIS** they can — and the ship answers **yes**,
> or **no with a named reason and a number**.

**⛔ THE THAW IS A MOSS *SCREEN* VERB, NOT A MOSS *LANGUAGE* VERB. This is not reversible later
without breaking saves.** `ScriptRuntime.Tick` consults **no device at all** — not `Powered`, not
`Condition`, not `Scriptable` — so a ten-line installed program could **empty the cryo bay
unattended**, which is the precise opposite of the owner's *"only one after the other"* and the
opposite of *control-not-conveyance*. ⇒ **A new `moss` op beside `sys`/`exec`/`open`/`set`/`audit` in
`GameSession.HandleMoss` (`hosts/web/GameSession.cs:399-446`), carrying `tid` + the pod name, lowering
to a `ThawCommand`. NO adapter is registered for a `CryoPod`; `MossBindings.cs`'s switch
(`:29-42`) is not touched.**

**⛔ AND THE GATE CANNOT CALL THE LEDGER.** `ArchitectureBoundaryTests` allows the identifier
`ShipLedger` in **exactly one file**, deliberately with **no scope filter** — a scope filter was the
fourth trap shape — and `ShipLedger.Sample` allocates per call while a command executes inside
`Simulation.Tick`. ⇒ **`ThawGate`, a zero-alloc static in `sim/Sim.Core/`, reading the same live state
the ledger reads, pinned by a test that requires the two to AGREE on a driven ship.** One source of
truth **by assertion, not by call.**

**THE CONTRACT, in order — and every step resolves from sim state, host-side never:**

| # | term | rule | the refusal it produces |
|---|---|---|---|
| 1 | **the pod** | `Kind == CryoPod && !IsOpen && Powered && Condition >= fail` | `POD — NO SIGNAL` (permanent; OD-9) |
| 2 | **the console** | a `Terminal` with `Name == tid`, `Powered && IsOperational && Scriptable` | `NO CONSOLE — MOSS IS OFFLINE` |
| 3 | **the cycle** | no pod anywhere with `Progress > 0` | `POD 3 IS CYCLING — 4 min` |
| 4 | ⭐ **the rung** *(OD-L, NEW)* | the item the pod's `Condition` band names is aboard, in the count it names | ⭐ **`NEEDS 1 CONTROLLER MODULE — SHIP HAS 0`** — *this is the reason that IS the hint* |
| 5 | **the headroom** | scrubbing · food · water · O₂, each a **named term with a number** | `SCRUBBING COVERS 3 OF 4` |
| 6 | **the price** | all-or-nothing, **charged LAST**, so a refusal never bills the player | — |

⭐ **OD-L REPLACES `thaw_cost_base + LivingCrew × thaw_cost_step`, AND THAT IS A DELETION WORTH
STATING.** The wreck plan's §3.4.1 recommended two def scalars *because OD-9 had removed the per-pawn
price and nothing replaced it*. **OD-L replaces it** — with a per-pod item requirement whose
difficulty is chain depth. ⇒ **Do not ship `thaw_cost_base`/`thaw_cost_step`. They would be a second,
invisible price beside the ladder, and P4/P5 would move for a dial nobody turns.** The rung table is a
**literal in `ThawGate`** (M3-6's ruling).

⚠️ **KEEP THE HEADROOM TERMS ANYWAY, AND KNOW WHICH ONE BITES.** From §3.3/§3.4.1, **inherited, not
re-driven**: standing O₂ reads ~99 crew-days and **can never say no** — keep it in the report, never
let it bind. **Scrubbing is a step function** (~3.663 crew per working scrubber) — a *tier unlock*,
excellent as one, useless as a pacer. **Food is the only continuous term**, and it stops biting the
moment a grow bed is repaired. ⇒ **The pacing is the ladder. The headroom is the ship talking.**

**THE ANALOGUE FOR THE REFUSAL — cited, and it decides the shape.** `rimworld-reference.md` §2.2:
*"RimWorld's answer to an impossible order is a refusal at the point of the click — the context menu
greys the entry and states the reason … It does NOT accept the order and then fail silently."* And
§2.2's own boxed conclusion: *"This is the single most transferable fact in §2 for Perilune."*
⇒ **The POD BAY greys the row and states the reason. A pod bay that accepts a thaw and then does
nothing is the exact defect this milestone is built to avoid.**

**SEAM.** **new** `sim/Sim.Core/ThawGate.cs` · `sim/Sim.Core/Commands/Commands.cs` (`ThawCommand`,
precedent `MoveCitizenCommand`) · `hosts/web/GameSession.cs:399-446` (`HandleMoss`, the new op) ·
`hosts/web/WireFormat*.cs` (the reply). ⚠️ **The wreck's console is
`term_moss`, authored at `Condition 0.14`, `scriptable: false` (`AuthoredShips.cs:1952`) and pinned
that way by `WreckShipTests.cs:741-752`** — *"MOSS is DARK until a ControllerModule is spent on it"*.
⇒ **Term 2 is not hypothetical on the shipping ship: the player must repair AND commission the
terminal before any thaw is possible.** That is the milestone's opening objective and it is already
authored.

**PIN IMPACT: PIN-NEUTRAL (prove by check A).** A command nobody sends changes nothing — the E0-5
shape. ⚠️ **`ThawGate` must not be registered as a system**; it is a static. Registering it would move
P1/P2/P3 for nothing.

**SPINE? YES** — `Commands`, `CmdKind`, `WireFormat`. Integrator lane.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | `Execute` becomes a no-op | driven: send → tick → the pod's `Progress > 0` |
| 2 | Charge the price **before** the last refusal | the billing leg: a refused thaw leaves the ship's matter **byte-identical** |
| 3 | Skip term 2 (the console) | the WHERE leg — thaw from an uncommissioned terminal must refuse. ⚠️ Fixture must assert `Scriptable == false` first |
| 4 | Evaluate term 2 host-side in `GameSession` | ⭐ the single-authority leg: **record the call at the seam** (trap 4). *"A host-side check is not replayed on load, not folded into the hash, and not present in the TUI"* |
| 5 | Accept a thaw while another pod cycles | term 3 |
| 6 | Ignore the rung (term 4) | ⭐ **the OD-L leg.** Strip the required item from the ship and assert the refusal **names the item and the count** |
| 7 | Return a bare `return;` on refusal, house-style | ⛔ **the silence leg.** Every refusal must produce a reason the host can render — *"if it follows the `ISimCommand` house style of a bare `return;` … would be nothing"* |
| 8 | Call `ShipLedger` from `ThawGate` | the architecture leg — **already red by an existing guard**; assert it stays that way |
| 9 | Write `ThawGate`'s suite as four ratio assertions | ⚠️ **SEVENTH TRAP SHAPE, named in the plan's own R-6.** A suite of ratios **cannot see a 2× scale error** — E0-9's whole gate went green with `DaysOfFood` 2× wrong. **At least one proportional FLOOR, in absolute units.** |

**ACCEPTANCE.** Driven, one test per refusal reason. The browser beat is M3-4's.

**CONFLICTS.** SPINE. Serialize against M3-4, M3-13, M3-7, M3-12, M3-8 on `GameSession.cs` (§9) and
against **M3-14** on `Commands.cs`.

**SIZE: L** — six gate terms, a new static, a new wire op, nine mutation legs, and a trap this
project has already paid for once.

---

### M3-4 — the MOSS **POD BAY**

**CLASS: PLAYER** · **LANE: `lane/pod-bay`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** see who is aboard, who is dead, or what is standing between them and
> the next person. **AFTER THIS** MOSS shows a **POD BAY**: twelve capsules, four *NO SIGNAL*, one
> open, seven named — **and every closed row states why it will not cycle.**

⭐ **THIS IS WHAT FINALLY GIVES "RESTORE MOSS" A JOB**, and under OD-L it is the milestone's primary
screen: *the reason IS the hint what to repair next.*

**SEAM — and the surface question, answered rather than assumed.**
`client/src/ui/moss-screen.js` (835 lines) + the pure `client/src/ui/moss-model.js`, whose
`SCREEN = { LEDGER, DETAIL, FAULTLOG, PROGRAM }` (`:27`) gains a **fifth: `PODBAY`**. Host side:
`GameSession.HandleMoss` + a new `WireFormat.MossPods(tid, rows)`.

⚠️ **IS THIS THE STANDARD SURFACE? VERIFIED, AND THE ANSWER IS YES — BY ONE THREAD.**
`MossScreen` is imported by **`client/src/ui/hud.js:30` and nothing else**, and `hud.js` is the
deprecated `.app` console shell. **But the MOSS screen is a full-screen TAKEOVER reachable from the
Overview**: `overview-model.js:322` classifies a terminal hit as `{type:'terminal'}` and
`overview-view.js:1181` handles it — `case 'terminal': Hud.selectTab('moss');` — *"clicking a console
on the map opens MOSS (IX-M1)"*. ⇒ **The POD BAY is reachable from the standard surface and this
package is legitimate.** ⛔ **But the DOOR runs through `hud.js`, which M4-8 deletes.** ⇒ **M3-4 must
not deepen the `hud.js` coupling** (no new state in the shell; the model owns everything), and
**M4-8's charter must re-home the MOSS door.** Recorded here so a future reader can tell *excluded*
from *missed* — this is the E0-4 WP-5 failure (*"shipped onto the wrong surface and nobody caught
it"*) checked for and cleared, not ignored.

**THE ROW, and its columns are the design:**

```
POD BAY                                            term_moss · COMMISSIONED
  #  OCCUPANT     STATE       WHY / WHAT IT NEEDS
  1  RELL         OPEN        —
  2  OZAWA        SEALED      READY — 1 SEALS                        [THAW]
  3  VANCE        NO SIGNAL   —
  7  TORRES       SEALED      NEEDS 1 CONTROLLER MODULE — SHIP HAS 0
  9  LINDQVIST    CYCLING     4 MIN
```

⚠️ **THE REASON COLUMN IS NOT DECORATION — IT IS OD-L's ENTIRE MECHANIC.** A row that says
`SEALED` with a blank reason is the package failing, not the package minus polish.

**PIN IMPACT: PIN-NEUTRAL** (client + a read-only wire message). Check (A).

**SPINE? Partly** — a new `WireFormat` message goes in a **new `partial` file**
(`WireFormat.Pods.cs`); `WireFormat.cs` should have a zero diff.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Render the list from a client-side guess instead of the wire | the source leg — **record the message at the seam** |
| 2 | Show a wrecked pod as thawable | the OD-9 leg |
| 3 | Blank the reason column | ⭐ **the OD-L leg** — a driven assertion that each refused row carries a non-empty reason **with a number in it where the gate produced one** |
| 4 | Offer `[THAW]` on a row the gate would refuse | ⚠️ **RW§2.2 + §8.4 rung 3, menu/job agreement.** The affordance and the command must share **one** rule. **Ask the same predicate; do not re-derive** |
| 5 | Register the key handler in the capture phase | ⚠️ **BUG-B's exact shape** — capture runs first and **silently kills the gesture with the suite green.** Use the stub that **records the phase argument**; a text scan for `addEventListener(…, true)` is defeated by the `{capture:true}` options form |
| 6 | Put the pod list in `hud.js` state | the coupling leg — the model owns it (M4-8) |

**ACCEPTANCE (browser, < 5 min).** ⭐ **THIS IS THE M3 MILESTONE DEMO'S SPINE** (§8).
1. `./play.sh`. Repair and **commission** `term_moss`.
2. Click it on the Overview → MOSS opens → **POD BAY**.
3. Twelve rows. Four *NO SIGNAL*. One OPEN. Seven sealed, **each with a reason**.
4. Pick one whose reason is `1 SEALS` → **[THAW]** → it cycles.
5. Pick another mid-cycle → refused, **`POD n IS CYCLING`**.

**CONFLICTS.** `moss-screen.js` / `moss-model.js` — serialize against **M3-13**. `GameSession.cs` (§9).
⚠️ **`hud.js` — a declared NON-claim** (M4-8 owns it).

**SIZE: M** — one new screen in an existing, well-factored model; the risk is all in the reason column
agreeing with the sim.

---

### M3-13 — every thaw refusal reaches the screen, with a number

**CLASS: PLAYER** · **LANE: `lane/thaw-blocked`** · **SIZE: M**

> **TODAY** — meaning the day M3-3 lands — **THE PLAYER IS MISLED ABOUT** a thaw that will not
> happen: the gate knows exactly why and the screen says nothing. **AFTER THIS** every refusal the
> gate can make reaches a surface **with the number that produced it**.

**Why it is chartered separately rather than assumed inside M3-3/M3-4.** The binding memory
*invisible-feedback-is-functional* has cost this project **three owner reports** for this exact shape,
and *"the join is a separate package"* is R3's own early-warning phrase. Same rule as M2-18, which is
the working precedent: the sim owns the predicate, the host asks it, the client renders it, and
**neither side re-derives.**

**THE TWO SURFACES, AND THEY MUST AGREE.** M2-18 established the discipline: *"one player confusion,
two surfaces, and they must agree — neither package invents a second vocabulary."*

1. **The POD BAY row** (M3-4's reason column) — the WHERE and the WHY of the thaw.
2. **The `blocked` channel on the tile** — for the repair the reason *points at*. ⚠️ **A pod-ladder
   item the ship cannot make is a repair order that will stall, and the existing
   `ReasonNoConsumable = 2` (`WireFormat.Blocked.cs:382`, client mirror
   `messages.js:535` / `'NO PARTS OR SEALS ABOARD'` at `:569`) is the wrong sentence for
   `ControllerModule`.** ⇒ Either widen the existing reason's text or add `ReasonNoInput = 5`.
   **RECOMMEND widening the existing one** — the reason codes are a mirrored pair and every addition
   costs both sides; the label is host-authored text, not a protocol change.

⛔ **AND ONE OPEN DEFECT LANDS SQUARELY HERE, CARRIED FROM `HANDOVER.md`:** *"The Prioritise menu is
offered on never-serviceable machines (CryoPod `maint = 0`): click → toast fires → sim refuses
silently, nothing on `blocked`. The cryo bay is full of these."* **M3 is the milestone that makes the
cryo bay the main screen**, so this stops being a filed nuisance and becomes a first-hour defect.
⇒ **M3-13 closes it**: `CryoPod`'s `maint = 0` is the **opt-out**, deliberately
(`MECHANICS.md` §13.22c — at `maint = 0.30` the lone pawn spent the ship's entire consumable stock
nursing corpses, and *"three of the four dead sleepers stopped reading as dead inside a day, with no
player input"*). The menu must **not offer** a repair the sim will never take.

**SEAM.** `hosts/web/GameSession.cs:2285` (`BlockedReason`) · `hosts/web/WireFormat.Blocked.cs:332-546`
(the five reason codes) · `client/src/wire/messages.js:529-570` (the mirror) ·
`client/src/ui/blocked-overlay.js` (the legend) · `client/src/ui/prioritise-model.js` (the menu gate)
· `moss-screen.js` (the pod bay's reason column).

**PIN IMPACT: PIN-NEUTRAL.** **SPINE? YES** — `WireFormat`. Integrator.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Return the refusal with no number | the number leg: *"SCRUBBING COVERS 3 OF 4"*, not *"NOT ENOUGH SCRUBBING"* |
| 2 | Re-derive any refusal host-side | the single-authority leg, **recorded at the seam** |
| 3 | Rank the rung refusal above the console refusal | the precedence leg — **pick an order and pin it.** A player told *"needs 1 CM"* on a ship with no working MOSS has been told the wrong thing |
| 4 | Offer *Prioritise* on a `maint == 0` device | ⭐ the serviceability leg — driven on a `CryoPod`, with a **non-vacuous control** on a device that *is* serviceable |
| 5 | Emit the pod-bay reason and the tile reason from two different strings | the one-vocabulary leg (M2-18/M2-20 precedent) |

**ACCEPTANCE (browser, < 5 min).**
0. On a fresh game, **before repairing anything**: open MOSS → the bay lists seven sealed pods and
   **every one carries a reason**. Nothing is silent.
1. Right-click a capsule in the Room Zoom → **no Prioritise entry** *(it is never serviceable)*.
2. Order a repair the ladder needs and cannot pay for → the tile says so, with the item named.

**CONFLICTS.** `GameSession.cs`, `WireFormat.Blocked.cs`, `messages.js`, `moss-screen.js` — serialize
against M3-3, M3-4 (§9).

**SIZE: M.**

---

### M3-5 — the emergency thaw, and the ending it implies

**CLASS: PLAYER** · **LANE: `lane/emergency-thaw`** · **SIZE: M**

> **TODAY THE PLAYER** loses the run the first time their one pawn dies — in minute three, silently.
> **AFTER THIS** the ship wakes one more soul **by itself, once**, and says so; and when there is no
> intact pod left, **the run ends on screen.**

⛔ **IT LIVES IN `CryoSystem`. IT IS NOT A HOLE IN `ThawCommand`. This is OD-10, decided, and it is
the half a lane will be tempted to get wrong.** *"`ThawCommand` is a player-reachable `ISimCommand`.
Any bypass inside it — a `skipGate` flag, a nullable pod argument, an early return before the term
list — is a code path the player can reach, and the first player who finds it uses it as the normal
route."* ⇒ **`CryoSystem.Tick` owns it and `ThawCommand` never learns it exists.** The two share the
*mechanism* (`Progress` → cycle → `AddCitizen`) and share **none** of the gate.

**What it bypasses, stated so nobody has to infer it:** the console, the price, the rung, the headroom
and the cycle exclusion. **All of it, correctly** — every one of those gates presumes a living crew
member to satisfy them, and there is none. **But it is a NAMED EXCEPTION with its own branch and its
own test**, never an emergent consequence of a gate returning true on an empty ship.

**Two rules the decision did not answer and this charter does:**
1. **It cycles the nearest INTACT pod** — one a normal thaw would accept on term 1 alone. A wrecked
   pod would cycle, open, and deliver **nothing**, leaving the player staring at an open capsule with
   a body in it. **Deterministic tie-break required.**
2. **When no intact pod remains, the run is over** — OD-10 option A, accepted alongside B. **A real
   lose state fires**, at the one moment it is honest: the player has spent every soul aboard.

⚠️ **HOW MUCH LOSE SCREEN IS OWNER BATCH ITEM 4.** M5-1 owns *THE ENDING*. **RECOMMEND: M3-5 ships
the sim-side state + the `CitizenDiedEvent`/Chronicle lines + a one-line banner, and M5-1 builds the
screen.** Shipping a full ending here duplicates M5-1; shipping *nothing* means the loss is silent,
which is the failure mode the package exists to close.

**The three moments, all REQUIRED — the whole feature is a message:**

| moment | what the player sees |
|---|---|
| the last pawn dies | the death, then — **without a pause** — a pod cycling. *If the grace is silent the player believes the game ended and quits* |
| the emergency pod opens | a Chronicle line naming **both** people: *"With ⟨name⟩ dead, the ship woke ⟨name⟩."* The death line is already automatic (`HistorySystem` on `CitizenDiedEvent`); the wake is the new one |
| it happens a second time | ⛔ **it does not.** Once per run — *"protects minute three without protecting hour three"* |

**SEAM.** `sim/Sim.Core/Systems/CryoSystem.cs` (M3-2's file) · the "has fired" bit **M3-2 already
shipped** · `HistorySystem` · `hosts/web/GameSession.cs` (the banner).

**PIN IMPACT: PIN-NEUTRAL — ⛔ AND ONLY BECAUSE M3-2 SHIPPED THE BIT.** If the bit is not already
hashed and saved, **this package becomes a second re-pin** and must go back on the chain. **Check
before starting** (§11 coupling 1).

**SPINE? No** — provided the bit exists.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Fire twice | the once-per-run leg: a **second** `LivingCrew == 0` cycles nothing |
| 2 | Select a wrecked pod | ⚠️ fixture: **nearest pod wrecked, next-nearest intact**; assert the *intact* one opened — and **run this leg with the others blinded** (fifth trap: `assert` throws, so only the first leg of a multi-leg test reports) |
| 3 | Add a bypass parameter to `ThawCommand` | ⛔ the architecture leg — **assert `ThawCommand` has no path that skips the gate**, recorded at the seam |
| 4 | Fire with an intact pod but skip the Chronicle | the message leg — **both** lines |
| 5 | Save/load across the fired flag | byte-identical round trip |
| 6 | No intact pod remains and nothing happens | the ending leg |

**ACCEPTANCE.** Driven (kill the only pawn on a prepared ship). **Browser:** the banner and the
Chronicle line, verified once by the integrator.

**CONFLICTS.** `CryoSystem.cs` — serialize behind M3-2. `GameSession.cs` (§9).

**SIZE: M.**

---

### M3-10 — a heater

**CLASS: PLAYER** · **LANE: `lane/heater`** · **SIZE: M** · ⛔ **PIN CHAIN M3-d — RUNS ALONE**

> **TODAY THE PLAYER CANNOT** make a cold compartment workable — **there is no heater device in the
> game**, and a radiator only takes heat *out*. **AFTER THIS** they can warm a compartment, and the
> pressure frontier stops terminating at the heated core.

**Verified:** `MachineDefs.cs:101` and `machines.def:62` both say it in their own words, and
`MECHANICS.md` §13.22e records it as measured on the wreck: *"the ship freezes outside the cryo bay
and no authored value fixes it."*

**⭐ WHY IT IS AN M3 PACKAGE AND NOT A NICE-TO-HAVE.** `WorksiteSafety.CanStageWorkerAt`
(`SafetySystem.cs:125-128`) resolves through `AtmosphereSafety.IsBreathable`, which **counts
thermal**. A freezing compartment is therefore **unworkable** — so the player cannot repair the
machines in it, cannot push the frontier past it, and **the thaw curve terminates.** *This is a
content hole that blocks M3's own gate.*

**SEAM.** `sim/Sim.Core/Entities/Device.cs` (`Heater = 28`, ⛔ **appended, never inserted** —
`CryoPod = 27` is the current tail) · `sim/Sim.Core/Entities/MachineDefs.cs` +
`sim/Sim.Core/Defs/SimDefs.cs` (a `Machines` row) · `content/core/SimDefs/machines.def` ·
`sim/Sim.Glyph/Glyphs.cs` (a glyph) · `ThermalSystem` (the term) ·
`Commands.cs:583-600` (**`IsPlaceableFurniture` — the player must be able to place one, or the verb is
authoring-only and the package delivers nothing**) · `client/src/items/` (art).

⚠️ **THE THIRD TRANSCRIPTION.** A `machines.def` row exists in **three** hand-written places —
`MachineDefs.Table`, `SimDefs.CreateDefault`, and the `.def` file. **All three, one commit** (the
one-commit def ritual), **plus a behavioural consumer test** — *a def field pinned only by the
checksum is NOT pinned.*

**PIN IMPACT: ⛔ P4 P5** — a new `DeviceKind` grows **`Machines` AND `Recipes`** (`new
RecipeDef[d.Machines.Length]` — two arrays for one enum member) and adds a def row.
**P1 P2 P3 HOLD IFF no pinned ship gets one — and the ruling is that none does.** ⚠️ **Measure
anyway.** → tag `pin/m3-d`.

**SPINE? YES** — `Device.cs`'s enum. Integrator lane, runs alone.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | The heater adds no heat | driven: a cold room's temperature rises with one powered heater |
| 2 | It heats while unpowered / below `fail` | the two gates, separately |
| 3 | ⭐ Heat a room and assert only the temperature | ⚠️ **the leg that matters: `CanStageWorkerAt` must flip from FALSE to TRUE on a tile in that room.** *A heater that warms a room nobody can work in has delivered nothing* |
| 4 | Insert `Heater` before `CryoPod` in the enum | ⛔ the append-only leg |
| 5 | Update `machines.def` but not `MachineDefs.Table` | the three-transcription leg |
| 6 | Author one onto a pinned ship | ⚠️ **the pin-scope leg — assert no pinned ship has one**, so P1/P2/P3 stay out of this row |
| 7 | Leave it off `IsPlaceableFurniture` | the reachability leg — **the player must be able to place one** |

**ACCEPTANCE (browser, < 5 min).** `./play.sh` → open a cold sealed hall (temperature on the crew
readout) → place a heater → power it → **the temperature climbs and an order painted in that hall
starts progressing**, where the identical order in the next cold hall does not.

**CONFLICTS.** `Device.cs`, `machines.def`, `SimDefs.cs` — serialize against **every** pin row.
`Commands.cs` — against M3-3 and M3-14 (§9).

**SIZE: M** — the code is one thermal term; the size is the def ritual times three plus a pin row.

---

### M3-7 — SKILLS: the consumers

**CLASS: PLAYER** · **LANE: `lane/skill-consumers`** · **SIZE: L** · ⛔ **PIN CHAIN M3-b — RUNS ALONE**

> **TODAY THE PLAYER CANNOT** tell one crew member from another in anything but a name: everyone
> works at the same rate at everything. **AFTER THIS** who does a job **changes how fast and how well
> it is done** — and choosing *which* soul to thaw finally means something.

**⭐ THIS IS WHY THE GRID CAME FIRST:** a second column on a table M2 already built and already paid
the chapter bump for. **`Citizen.Skill` (`Citizen.cs:144`) is the LAST reserved CITZ v8 field with no
reader** — written by `SaveWriter.cs:284` with the comment *"reserved (M3-7), zeroed, read by
nothing"*, read back at `SaveReader.cs:322`, folded at `Simulation.cs:504`. **The storage exists. This
package is the reader.**

**THE ANALOGUE, and it forbids the obvious first draft.** `rimworld-reference.md` **§5.2**: *"Skill
never gates **whether**, only **how well**."* And **§5.1's own warning against a single multiplier**:
*"Skill does not do one thing. For Construction it is speed **and** failure; for Crafting it is
quality **only**; for Cooking it is unlock-then-speed. **A single 'skill → work speed' multiplier is
not the RimWorld model.**"* Every skill-driven stat is published as `base + bonus × level`
(Construction Speed `0.30 + 0.0875`; Mining Speed `0.04 + 0.12`).

⇒ **v1 RULING, and it is a deliberate simplification with its deviation stated: ONE curve —
`rate = base + bonus × Skill` — applied per work type with per-type `(base, bonus)` LITERALS**, not a
single global multiplier and not a def table. **Literals, on the M2-1 precedent** (*a rule, not a
tunable*), which is what keeps **P4/P5 out of this row.** ⚠️ **The deviation from RimWorld is that
quality and failure rolls are NOT modelled** — TARGET §2 forbids dice in outcomes, so *"no dice"*
and *"skill affects quality"* cannot both hold in v1. **Skill affects RATE. Say so; do not let a
later lane 'complete' it with a roll.**

**⚠️ AND THE SECOND HALF, WHICH IS NOT OPTIONAL: `WorkIncapable` IS NOT ON THE `work` WIRE.**
`WireFormat.Work`'s `WorkCell` is `(Cid, WorkType, Priority)` and nothing else
(`WireFormat.Work.cs:88-93`). `Citizen.WorkIncapable` (`Citizen.cs:128`) and
`CanTakeWorkType` (`:268`) exist and are read by the dispatcher, **but the WORK tab cannot grey a
row**, so *incapable* and *player-blanked* are indistinguishable on screen. **RW§1.6 keeps them
strictly separate in the TAB — blank versus a struck cell — and M2-9's own §2.2 ruling already pins
that an order beats a priority-0 grid but NEVER `WorkIncapable`.** ⇒ **The wire gains two columns
here: `skill` and `incapable`.** M3-12 draws them.

**SEAM.** `sim/Sim.Core/Entities/Citizen.cs:144` · the work-rate consumers (`JobWork`,
`CraftingSystem`, `MachineWearSystem`, `BuildJobSource`, `DeconstructSystem`) ·
`hosts/web/WireFormat.Work.cs:88-134` · `hosts/web/GameSession.cs` (`BuildWork`/`SendWork`).

⛔ **IT CANNOT LIVE IN THE HOST-SIDE PERSONA LAYER.** *"The whole mind/persona/fact layer is host
state, gate-proven out of determinism"* (`Simulation.cs:390-391`). **Skill changes work rates ⇒
sim-canonical by definition.**

**PIN IMPACT: ⛔ P1 P2 P3** — work rates change on every ship that does work. **P4 P5 EXPECTED TO
HOLD** (literals, no def field) — **measure.** ⚠️ **A pinned run that does no work sees nothing:
check the non-vacuity before believing a held pin** (M2-12's lesson — *no pin sees the generation
term*). **And this row is the reason M2-17 matters**: after the veto, an unattended fixture does no
work at all.

**SPINE? YES** — `WireFormat`. New channel columns go in the existing `WireFormat.Work.cs` partial
with a version bump; `WireFormat.cs` zero diff.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Skill has no effect on rate | driven: two pawns, same job, different `Skill` ⇒ **different completion ticks** |
| 2 | Apply the curve to only one work type | the per-type leg — **one test per consumer**, not one test per package |
| 3 | Make skill gate *whether* | ⛔ **RW§5.2's leg**: a `Skill = 0` pawn must still take the job |
| 4 | Drop `incapable` from the wire | the column leg — the client must receive it |
| 5 | Conflate `incapable` with `priority == 0` | ⚠️ **RW§1.6's leg** — pin them as two distinct wire values |
| 6 | Ship the curve as a def field | the pin-scope leg: assert P4/P5 hold and no `.def` diff exists |
| 7 | Assert the effect as a ratio only | ⚠️ **seventh trap** — a ratio suite cannot see a 2× scale error. **One absolute floor in ticks.** |

**ACCEPTANCE.** Driven for the rates. Browser beat is M3-12's.

**CONFLICTS.** `Citizen.cs` — serialize against **M3-9**. `WireFormat.Work.cs`, `GameSession.cs` —
against M3-12 (§9). The job-system consumers — against **M3-14**.

**SIZE: L** — one curve, five consumers, two new wire columns, a pin row, and a named deviation from
the analogue.

---

### M3-12 — skills in the WORK tab

**CLASS: PLAYER** · **LANE: `lane/skill-display`** · **SIZE: S → M**

> **TODAY THE PLAYER CANNOT** see why they would give a job to one soul rather than another. **AFTER
> THIS** the WORK tab shows each crew member's skill in each work type — **and the new soul's row
> reads differently from Rell's.** ⭐ *That sentence is the milestone's exit gate, verbatim.*

**SEAM.** The WORK tab, on the standard surface (`client/src/ui/overview-view.js` +
`overview-model.js`) · the two columns M3-7 put on the wire.

**THE ANALOGUE.** RW§1.7 (column order, and whether the player may reorder it — **they may not; OD-J
fixes ours**) and **RW§1.6 (incapable vs disabled)**: RimWorld shows a **blank** cell for
player-blanked and a **struck/greyed** cell for incapable. ⇒ **Two distinct renderings, never one.**
⚠️ **`HANDOVER.md` already files the collision this must respect**: *"WORK tab's `BUILD` label
collides with the BUILD tab"* and *"the ascending-only click cycle deviates from RimWorld's
two-gesture pair"* — **both are carried owner items, not this package's to resolve. Do not fix them
here; do not make them worse.**

**PIN IMPACT: PIN-NEUTRAL** (client). Check (A).

**SPINE? No.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Render skill from a client guess | the wire-source leg, recorded at the seam |
| 2 | Render incapable identically to blank | ⚠️ **RW§1.6's leg** — two crew, one incapable of a type, one with it blanked: **the two cells must differ** |
| 3 | Show the skill but let the player edit it | the read-only leg |
| 4 | Drop the column when the roster grows | the two-crew leg — **the fixture must carry a thawed second soul**, which is the whole point |

**ACCEPTANCE — ⭐ THIS IS M3'S MILESTONE DEMO, and it is written to be FALSIFYING.** Max speed
throughout.

> ⚠️ *A demo of the form "open the pod bay and thaw someone" passes on a ship where the gate never
> refuses. **The demo therefore runs the REFUSING direction first.***

1. `./play.sh`. Open MOSS → **the terminal is dark.** *(Nothing is thawable; the bay says so.)*
2. Repair + commission `term_moss` → **POD BAY**: twelve rows, four *NO SIGNAL*, one OPEN, seven
   sealed with **seven reasons**.
3. Thaw the `1 SEALS` pod. **She steps out, is named in the Chronicle, appears in CREW WATCH.**
4. ⭐ **THE DECISIVE STEP: open the WORK tab. Her row is NOT Rell's** — different skills, and at
   least one cell **struck** where she is incapable.
5. Try the next pod: **refused, `NEEDS 1 PARTS — SHIP HAS 0`.** ⭐ *This is the leg the old flat-price
   design could not produce, and the leg that proves OD-L shipped.*
6. Make the Parts (Regolith → Scrap → Parts across two benches you had to repair) → thaw → **a third
   person.**
7. Try to thaw two at once: **`POD n IS CYCLING`.**
8. ⭐ **Watch the clock: thaws 3–5 must NOT all land inside one sim-hour.** *(The exit gate's own
   sentence; if they do, the ladder's rungs are too shallow — that is a content dial in M3-6, not a
   code defect.)*

**CONFLICTS.** `overview-view.js` / `overview-model.js` — serialize against M2-3's shipped WORK tab
and against M4-* (§9).

**SIZE: S → M** — two columns, **plus the milestone demo**, which is the integrator's post-merge
acceptance (the M2-10 precedent).

---

### M3-8 — authored persona sheets for the sleepers

**CLASS: PLAYER** · **LANE: `lane/sleeper-personas`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** meet the person they woke — a thawed citizen arrives with **no mind
> attached at all**. **AFTER THIS** each of the seven is a written person before you open her pod,
> and she is that person the second she steps out.

**⚠️ THE GAP, restated because revision 1 of the wreck plan glossed it.** `AuthoredShips.PopulateSlice`
weaves minds into an authored crew **at boot**; a thaw happens **at runtime**, so **nothing attaches a
mind.** ⇒ **`CryoSystem` publishes `CitizenThawedEvent`; the host observes it and attaches the persona
from the roster.** ⛔ **The sim must remain fully playable with no mind attached** — the offline
invariant — so this is a **host-side enrichment, never a sim dependency.**

**SEAM.** `sim/Sim.Gen/AuthoredShips.cs:577-790` is the existing pattern (persona sheets) ·
`hosts/web/GameSession.cs` (the observer) · the LLM/persona layer, which is **outside determinism by
gate** (`Simulation.cs:390-391`).

**Writing, not engineering** — seven sheets, each with a backstory that explains a skill spread and at
least one `WorkIncapable` bit, so M3-12 step 4 has something to draw.

**PIN IMPACT: PIN-NEUTRAL** — host state, gate-proven out of determinism. Check (A).

**SPINE? No.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Thaw with the persona layer absent entirely | ⭐ **the offline leg: the sim must still run and the citizen must still exist.** *This is the invariant, not a nicety* |
| 2 | Attach the wrong roster entry | the name-match leg: the persona attached matches `pod.Name`'s occupant |
| 3 | Attach at boot instead of on the event | the runtime leg |
| 4 | Fold the persona into `StateHash` | ⛔ **the determinism leg — already red by an existing gate**; assert it stays red |

**ACCEPTANCE.** Thaw two different pods; the two people read as two people in CREW WATCH and in the
(M4) dossier. ⚠️ **`panels.js` is four-of-eight fabricated (`◇ SAMPLE`) until M4-3 — do not fix it
here, and do not let the demo claim a dossier this package did not make true.**

**CONFLICTS.** `AuthoredShips.cs` (§9 — behind M3-6 and M3-11). `GameSession.cs` (§9).

**SIZE: M** — the code is an observer; the size is seven people written well enough to be worth
waking.

---

### M3-9 — REST

**CLASS: PLAYER** · **LANE: `lane/rest`** · **SIZE: L** · ⛔ **PIN CHAIN M3-c — RUNS ALONE**

> **TODAY THE PLAYER IS MISLED ABOUT** their crew: **every crew member on every ship is permanently
> exhausted.** `Citizen.Fatigue` saturates at 1.0 after ~16 h and **nothing anywhere reduces it**
> (`NeedsSystem`'s own header: *"Fatigue has NO reducer anywhere in v0 (there are no beds yet), so it
> climbs to 1 over ~16 h and stays there"*), and the comment at `Citizen.cs:50` — *"1 = exhausted
> (slows work)"* — **is false: nothing reads it.** **AFTER THIS** crew sleep, and being tired means
> something.

**THE ANALOGUE, and it decides the mechanism.** `rimworld-reference.md` **§3.5's boxed rule, confirmed
twice independently**: ⭐ **"Needs do NOT interrupt a job in progress. The need check is a job-SELECTION
filter, evaluated between jobs."** *A hungry RimWorld colonist finishes its wall before it eats.*
⇒ **REST enters as a claimant in M2's arbitration, evaluated between jobs — NOT as a fifth
out-of-band interrupt.** ⚠️ **This is the single most important sentence in this charter**: an
out-of-band rest claim would silently undo M2-8's pre-emption contract and M2-19's sticky hold, both
of which are pinned by property rather than by call site. **And RW§4.4: rest affects mood and immunity
only — no work or combat stat.** ⇒ **Do not make tiredness a work-rate multiplier in v1** (that is
M3-7's axis and it would double-count).

**Bed exists**: `machines.def:43` authors a `Bed` row (all-zero: no draw, no wear, no maintenance) and
`Device.cs:17` calls it *"crew bunk (rest anchor; behavior lands with the needs pass)"*. It is also
**player-placeable** (`Commands.cs:587`). **This is the needs pass.**

**SEAM.** `sim/Sim.Core/Systems/NeedsSystem.cs` (the Fatigue ramp) · a rest job/claimant in
`sim/Sim.Core/Jobs/` · `content/core/SimDefs/needs.def` (recovery scalars) · `Citizen.cs:50`
(**the false comment, corrected in the same commit**).

**PIN IMPACT: ⛔ ALL FIVE.** Behaviour change (P1 P2 P3) **and** def scalars (P4 P5). ⚠️ **AND A THIRD
CAUSE THAT IS EASY TO MISS AND IS THE EXPENSIVE ONE:** removing the permanent fatigue deficit changes
`ShipMetrics.Morale` → `DirectorSystem.cs:82` (`d.WeightMoraleDeficit * (1f - m.Morale)`) →
`_wearPressure` (`:58`) → `MachineWearSystem` ⇒ **machine wear rates change on every ship in the
repo.** → tag `pin/m3-c`.

**SPINE? YES** — a new claimant touches the job system. Integrator lane, runs alone.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Fatigue still never falls | driven: a pawn with a bed reaches `Fatigue < 0.1` |
| 2 | Rest interrupts a job in progress | ⛔ **RW§3.5's leg** — a pawn mid-service **finishes**, then rests |
| 3 | Rest bypasses the work grid / a held order | the M2 leg: a **held order** (M2-19) is not stolen by fatigue |
| 4 | No bed on the ship | the graceful leg — she rests worse, not never (RW§4.4: ground 0.8 vs bed 1.0) |
| 5 | Make fatigue multiply work rate | ⛔ the scope leg — **v1 does not**, and the pin story assumes it does not |
| 6 | Claim pin-neutrality on wear | ⚠️ **the Director leg** — assert the wear-rate path actually moved, so nobody 'discovers' it later |

**ACCEPTANCE (browser, < 5 min).** Watch one pawn over a sim-day at max speed: she works, **finishes a
job**, walks to a bunk, sleeps, wakes, works. The crew dock's task line says so at each step.

**CONFLICTS.** `Citizen.cs` — serialize against **M3-7**. The job system — against **M3-14** and
against M2's shipped `JobSystem.cs` contract. Every pin row.

**SIZE: L** — a need, a job, a bed, def scalars, five pins, and a wear-rate change on every ship.

---

## 6. WHAT THIS MILESTONE DELIBERATELY DOES **NOT** BUILD

Recorded so a future reader can tell *excluded* from *missed*.

- **Rung 1 of the vacuum ladder** (per-work-type deadly tolerance) — needs a hashed column; filed onto
  M3-b or nothing (§5 M3-14).
- **A thaw economy.** OD-B parks E1–E4. Every M3 number is a content dial on one ship.
- **Passions, skill XP, skill decay** (RW§5.1). v1 skill is a static byte. **RimWorld's XP cap and
  "rusting" are real mechanisms we are not adopting yet** — say so rather than half-building them.
- **Quality and failure rolls** (RW§5.1) — TARGET §2 forbids dice in outcomes.
- **Health capacity gating** (RW§6.1, T14) — M4-4 decides real-or-delete.
- **The vertical gas term** (OD-E) — M3-11 routes around it, deliberately.
- **The Persona window** (T16) — M4-1/M4-2. M3-8 writes the sheets; **it does not build the door.**
- **The full lose screen** — M5-1 (owner batch item 4).
- **`Device.Rate` as a MOSS throttle** — filed by M2-12, phase 2.

---

## 7. TARGET ROWS THIS MILESTONE MOVES

| row | today | after M3 |
|---|---|---|
| **T11** skills gate output, never whether | missing | **DONE** (M3-7 + M3-12) |
| **T12** needs/mood | partial | **partial → rest DONE** (M3-9); mood still gates nothing |
| **T13** thaw loop: earn & choose a second soul through MOSS | missing | **DONE** (M3-2…M3-6, M3-13) |
| **T8** a refused order says WHY | partial | **partial →** every *thaw* refusal named (M3-13); other order refusals still filed |
| **T15** schedules | missing, unscheduled | ⭐ **DECIDED** — owner batch item 3, not built (recommendation: defer) |
| **T7 / T5 / T6** direct orders | DONE | **reach further** (M3-14) |

---

## 8. M3's FIVE-MINUTE DEMO

**Owned by M3-12**, run by the integrator on the merged tree after position 12, exactly as M2-10's
demo was. The falsifying script is M3-12's ACCEPTANCE, steps 1–8. **Steps 4, 5 and 8 are the ones a
reviewer who skips cannot tell the milestone shipped.**

⛔ **THE FALLBACK, STATED NOW SO IT IS A DECISION LATER AND NOT AN IMPROVISATION:** if the schedule
slips, ship **M3-2/M3-3/M3-4/M3-13 WITHOUT skills** — the thaw mechanism is independent of the grid —
and add M3-7/M3-12 after. **It costs the exit gate's third clause** (*"the new soul's WORK row differs
from Rell's"*), which becomes *"the choice is a name in a list."* **Do not instead drop M3-13**: a pod
bay that refuses silently fails OD-L's own premise.

---

## 9. THE CONFLICT MATRIX — files with more than one claimant

| file / area | claimants | rule |
|---|---|---|
| `sim/Sim.Gen/AuthoredShips.cs` | M1-A ✅, M1-I ✅, **M2-11 ✅**, **M3-6**, **M3-11**, M3-8 | ⛔ **Strictly serialized. M3-6 → M3-11 → M3-8.** ⚠️ ⭐ **M2-11 IS A PAST CLAIMANT WHOSE MEASURED CENSUS M3-11 CHANGES** — the off-network count (23 of 611) and the flat demand (14.30 kW) live in `WreckCutDeck1Risers`'s doc comment and in `WreckPowerNetworkTests`. **Re-derive both from the MERGED tree; quote the exemption and the cut separately** (M2-11's own send-back was a comment that stated the net as the deletion count). **A package that touches an authored ship adds its row BEFORE it starts** — M1-I's retrospective addition is the standing warning. |
| `sim/Sim.Core/Simulation.cs` · `Save/SaveWriter.cs` · `Save/SaveReader.cs` · `SystemStack.cs` | **M3-2** (+M3-5 **only if** the bit was missed) | ⛔ **SPINE — integrator lane only, one at a time.** |
| `sim/Sim.Core/Commands/Commands.cs` | **M3-3** (`ThawCommand`), **M3-14** (the forced-order bypass, **if** it needs a flag), **M3-10** (`IsPlaceableFurniture`) | ⛔ **SPINE. Serialize.** ⚠️ **M3-14 should read `Citizen.HeldByOrder` and touch this file NOT AT ALL** — prefer that. |
| `sim/Sim.Core/Systems/SafetySystem.cs` · `Jobs/JobContext.cs` · `Systems/MachineWearSystem.cs` | **M3-14** (three call sites), M3-9 (a new claimant), M2-2/M2-5/M2-9/M2-19 ✅ | ⛔ **Serialize.** ⚠️ **`JobContext.cs:64` claims `CanStageWorkerAt` is asked "NOWHERE ELSE in the job system" — TRUE, and there are two more sites OUTSIDE it.** A lane that trusts the comment patches one third of the rule. |
| `sim/Sim.Core/Entities/Citizen.cs` | **M3-7** (`Skill`), **M3-9** (`Fatigue`, and the false comment at `:50`) | Serialize; M3-7 first. ⚠️ **Standing refusal carried from M2-2: `IsRecruitableForWork` MUST NOT absorb the work grid.** |
| `sim/Sim.Core/Entities/Device.cs` · `MachineDefs.cs` · `Defs/SimDefs.cs` · `content/core/SimDefs/machines.def` | **M3-10** | ⛔ **Three hand transcriptions of one row + the def file. One commit, plus a behavioural consumer test.** Serialize against every pin row. |
| `hosts/web/GameSession.cs` | **M3-3**, **M3-4**, **M3-13**, **M3-5**, **M3-7**, **M3-8** — and M1-D/M1-E/M2-4/M2-6/M2-9/M2-18/M2-20 ✅ | ⛔ **Serialize. This is the single largest merge hazard in the quarter — six new claimants on top of seven landed ones**, and the merge that broke `DeviceCell` was a **silent auto-merge on a field list, not a conflict git flagged.** ⭐ **M3-3 owns the thaw vocabulary; M3-4 and M3-13 CONSUME it** (the M2-20 ↔ M2-6 precedent). |
| `hosts/web/WireFormat*.cs` | **M3-3**, **M3-4** (new `WireFormat.Pods.cs`), **M3-13** (`Blocked`), **M3-7** (`Work`) | ⛔ **SPINE — integrator.** **New channels go in NEW `partial` files; `WireFormat.cs` keeps a zero diff.** |
| `client/src/ui/moss-screen.js` · `moss-model.js` | **M3-4**, **M3-13** | Serialize. ⚠️ **`moss-model.js`'s signatures are FROZEN by spec §2** and its purity is enforced by a source scan — a new `SCREEN` member is an additive change, a signature change is a contract break. |
| `client/src/ui/hud.js` | ⭐ **M3-4 (DECLINES IT)**, M4-8 | ⭐ **A row that exists to record a DELIBERATE non-claim.** `hud.js:30` is the only importer of `MossScreen` and `hud.js` owns the MOSS tab; **M3-4 adds no state there.** ⛔ **M4-8 must re-home the MOSS door** (`overview-view.js:1181` → `Hud.selectTab('moss')`), or deleting the shell deletes the pod bay's only entrance. |
| `client/src/ui/overview-view.js` · `overview-model.js` | **M3-12**, M2-3 ✅, M2-20 ✅, M4-* | Serialize. ⚠️ ⛔ **`'work'` MUST NEVER JOIN `INERT_TABS`** (`overview-model.js:335-345`, the file says so itself). |
| `client/src/ui/roomzoom-view.js` · `prioritise-model.js` | **M3-14**, **M3-13**, M1-C ✅, M2-10 ✅, M2-20 ✅ | Serialize. ⚠️ **M2-10's `DEVICE_KIND_NAMES` is pinned member-for-member against `Device.cs` — M3-10's new `Heater` member breaks that pin by construction.** ⭐ **M3-10 must add the name in its own commit.** |
| `client/src/wire/messages.js` | **M3-13**, **M3-4**, M3-7 | The reason-code mirror. Serialize; **every addition costs both sides.** |
| `tests/Perilune.Tests/WreckShipTests.cs` | **M3-6**, **M3-11**, **M3-2**, **M3-3** | ⛔ **Serialize, and re-derive every count from the MERGED tree.** ⚠️ **Its literals are hand-written and NOT derived from `WreckPods`, deliberately — keep it that way** (`AuthoredShips.cs:1325-1327`). |
| `tests/Perilune.Tests/BlockedChannelTests.cs` | **M3-13**, M1-D/M1-E/M2-18/M2-9 ✅ | Serialize. It carries named tripwires; **exclude by name, never weaken.** |
| `client/test/surface-boundary.test.js` | **M3-4**, **M3-12**, M4-2 | ⚠️ **Every claimant moves an equality-pinned census. Re-derive from the MERGED file with the shipped `codeOnly` stripper; never adjust either branch's figure.** |
| `ci.sh` · `CLAUDE.md` · `MECHANICS.md` · `HANDOVER.md` · `Golden/` | **M3-1** and **every re-pin commit** (M3-2, M3-10, M3-7, M3-9) | ⛔ **Integrator only.** Land M3-1 in a quiet window before `pin/m3-a`. |

### ⭐ THE COUPLINGS GIT CANNOT SEE

| # | pair | the shared thing | what it costs if ignored |
|---|---|---|---|
| **1** | **M3-2 ↔ M3-5** | the emergency-thaw **"has fired" bit** | **No shared file at merge time.** M3-2 ships storage it never reads; M3-5 ships the reader. **If M3-2 forgets it, M3-5 becomes a SECOND re-pin** and must go back on the chain — the one thing the chain rule exists to prevent. ⇒ **M3-5's first act is to assert the field exists and round-trips.** |
| **2** | **M3-6 ↔ M3-3** | the ladder's **band edges** — authored `Condition`s in one file, the literal band table in another | **Two files, one number set, no compiler between them.** Nudging a pod from 0.90 to 0.895 silently re-orders the whole ladder **with both suites green.** ⇒ **M3-6's mutation 2 must be driven THROUGH `ThawGate`, not asserted against the table.** |
| **3** | **M3-11 ↔ M2-11 (landed)** | the wreck's power census | M3-11's tests can pass on its own branch and be wrong in the merged tree. **Trap 8: re-derive from the merged tree.** |
| **4** | **M3-10 ↔ M3-2/M3-3/M3-12** | the frontier's reach | **Every thaw-curve measurement taken before the heater lands is a measurement of a ship the player cannot expand.** The demo's step 8 (thaws 3–5 not in one sim-hour) is **not meaningful** until M3-10 has merged. |
| **5** | **M3-7 ↔ M2-2/M2-5 (landed)** | `TryAssign`'s veto and band loop | Skills feed the same arbitration the veto and the cross-family ranking own. **The file's own header says it is "the only file in the job system the integrator reviews."** |
| **6** | **M3-14 ↔ M2-19 (landed)** | `Citizen.HeldByOrder` | M2-19 measured that **the hold's whole bite is the pre-emption path** and that **neither read point is individually pinned — the PROPERTY is.** M3-14 adds a third read point. **Pin the property again from the new site.** |
| **7** | **M3-4 ↔ M4-8** | the door to MOSS | Deleting `hud.js` deletes the pod bay's only entrance. Named in the matrix above. |

---

## 10. THE M3 OWNER-DECISION BATCH

**One batch per milestone. Six items. One message. Three-day default-to-recommendation.** Everything
settleable from an existing OD or from `rimworld-reference.md` **has been settled and cited** — §11
lists those, so the batch is not padded with questions that already have answers.

---

**ITEM 1 — THE LADDER'S RUNGS.** *(binds M3-6, M3-3; blocks position 3)*

OD-L fixes the *mechanism* (chain depth) but not the *table*. Seven thawable pods; the shipped chain
has four usable depths (`Seals` found · `Scrap` · `Parts` · `ControllerModule`).

| option | shape |
|---|---|
| **A** | **4 rungs across 7 pods**, count-escalating inside a rung — the table in §5 M3-6 |
| **B** | 7 distinct rungs — **needs 3 new recipes and probably a new `ItemKind`** (new def rows ⇒ P4/P5, new content) |
| **C** | 2 rungs (cheap/expensive) — simplest, but thaws 3–7 all cost the same and the demo's step 8 fails |

⭐ **RECOMMEND A.** It uses content that already exists, needs **no def field and no pin**, and the
per-ship dial is a number already authored per pod. **The rungs land on the shipped `Condition` array
without changing a single value** (§5 M3-6's table).

---

**ITEM 2 — IS THE UPPER DECK OPENED IN M3 AT ALL?** *(binds M3-11; blocks position 4)*

The outline calls M3-11 *"one line of content"*. It is not: an `AirVent` needs **power**, and M2-11
deliberately took deck 1 **genuinely off-network** — and **no player verb can build a conduit or a
vent** (`Commands.cs:583-600`).

| option | shape |
|---|---|
| **A** | **Author a deck-1 vent + one riser tap, vent authored WRECKED** ⇒ the deck is dead at boot and **a repair order opens it** |
| **B** | **Do not open deck 1 in M3.** The thaw curve lives on deck 0's five sealed halls, which is plenty of room for 8 crew. **M3-11 is deleted from the milestone**, count → 13 |
| **C** | Build the vertical gas term — ⛔ **large, and OD-E is a standing refusal** |

⭐ **RECOMMEND A.** It converts a filed dead end into the milestone's second repair objective, keeps
OD-E intact (no gas term), and gives the pod bay a diegetic refusal (*"NO BERTH — UPPER DECK
AIRLESS"*). ⚠️ **Cost stated: it re-derives two figures M2-11 measured** (§9).
⚠️ **B is a real option and cheaper.** If the week-9 gate is the priority, take B and file A.

---

**ITEM 3 — T15, SCHEDULES.** *(`TARGET.md` §3 says "decide at M3"; binds nothing until answered)*

| option | shape |
|---|---|
| **A** | **Do not build a schedule grid in M3.** Adopt RW§3.5's *mechanism* — **needs are a job-SELECTION filter evaluated between jobs, never an interrupt** — inside M3-9's REST, and revisit the 24-slot grid after the week-9 gate |
| **B** | Build the grid in M3 as **M3-15** — 24 slots × 5 assignments per pawn ⇒ **new hashed state, a CITZ chapter bump, a pin row, and a second control surface competing with the WORK tab** |

⭐ **RECOMMEND A**, and the reason is RimWorld's own: **§3.5 shows the schedule is not a shift roster —
it is a think-node priority that changes where work sits relative to needs.** With **one need
(rest) and one work priority system**, the grid has almost nothing to express yet. **T15's row moves
to "decided: deferred, mechanism adopted in M3-9"**, which is a decision, not a slip.
⚠️ **If the owner takes B it is M3-15, it is a pin row, and M3 goes to 15 packages / cap 3.**

---

**ITEM 4 — HOW MUCH LOSE SCREEN DOES M3-5 SHIP?** *(binds M3-5)*

OD-10 decided that when no intact pod remains, **the run is over**. M5-1 owns *THE ENDING*.

| option | shape |
|---|---|
| **A** | **Sim state + Chronicle lines + a one-line banner.** M5-1 builds the screen |
| **B** | A full lose screen in M3 — duplicates M5-1 |
| **C** | Sim state only, no surface — ⛔ **the loss is silent**, which is the failure this package exists to close |

⭐ **RECOMMEND A.**

---

**ITEM 5 — DOES A THAWED SOUL ARRIVE WITH HER WORK GRID OFF?** *(binds M3-2/M3-8/M3-12 and the exit
gate's own wording)*

OD-H/OD-I say **the grid boots OFF, one rule, off everywhere — fixtures too.** They were decided about
the *boot* pawn. RW§1.5 gives a **new arrival a skill-ranked default grid**. And the exit gate says
*"the new soul's WORK row differs from Rell's"* — **differs how, if every cell is off?**

| option | shape |
|---|---|
| **A** | **Thawed souls arrive OFF too.** The row differs by **skills and incapables**, not by priorities — which is exactly what M3-12 draws. OD-H/OD-I untouched |
| **B** | Thawed souls arrive with RimWorld's skill-ranked defaults — **matches RW§1.5, contradicts OD-H's "work is opt-in"** and means a thaw silently changes what the ship does |

⭐ **RECOMMEND A.** OD-H is the more recent and more specific decision, OD-I already extended it to
*"fixtures too"*, and A keeps the opening's whole premise (*the ship waits on you*) true for every
soul, not just the first. **The gate's sentence is satisfied by the skill columns.** ⚠️ **Flagged
rather than assumed because it is the exit gate's own wording.**

---

**ITEM 6 — IS *FREEZE* A PLAYER VERB?** *(binds M3-1; blocks position 1, and therefore position 5)*

OD-L says *"MOSS controls freeze/unfreeze per pod"*. Two readings.

| option | shape |
|---|---|
| **A** | **Unfreeze only.** MOSS *reports* each pod's frozen state and *thaws*. A pod is single-use ⇒ **`Device.Name` never mutates ⇒ M3-1 is a recorded non-change and no new state exists anywhere** |
| **B** | **Freeze is a real verb** — put a crew member back in a box to relieve food/air pressure. Diegetically excellent and a genuine pressure valve. ⛔ **But it makes a pod's occupant MUTABLE, which is exactly the `Device.Name` collision M3-1 exists for**: the name is the MOSS registry key and a restore that changed one *"silently unbinds every player program, no error"* (`Simulation.cs:553-555`). Paying for it means either a new hashed occupancy map (a second pin cause inside `pin/m3-a`) or renaming every authored pod (which breaks every existing player program that named one) |

⭐ **RECOMMEND A FOR M3, WITH B FILED AS A NAMED FOLLOW-ON.** A is free and B is not, and B's cost
lands inside the milestone's largest pin lane. ⚠️ **This is the batch's blocking item: M3-1 cannot be
written until it is answered, and M3-2 cannot freeze a save chapter until M3-1 is.**

---

## 11. WHAT WAS SETTLED FROM AN EXISTING OD OR FROM THE ANALOGUE *(so the batch stays honest)*

| question | settled by | answer |
|---|---|---|
| Thaw = MOSS language verb or screen verb? | wreck plan W5.3 + automation-souls (*control-not-conveyance*) | **SCREEN verb.** `ScriptRuntime.Tick` consults no device, so a program could empty the bay |
| Where does the emergency thaw live? | **OD-10, decided** | `CryoSystem`, **never** a hole in `ThawCommand` |
| Can a wrecked pod be thawed or repaired? | **OD-9, decided** | **No, permanently.** `maint = 0` is the opt-out and `MECHANICS.md` §13.22c measured what happens without it |
| One thaw at a time — hard rule or emergent? | wreck plan §3.4, decided | **Hard rule**, `Device.Progress` + `CryoSystem` |
| A new `Device` field for the pod? | `Device.cs:46-49` + W5.1 | **No.** Four existing hashed fields carry it |
| Does an order override a work-type OFF? | **M2-9's §2.2 ruling, PINNED** | Order beats a priority-0 grid, **never** `WorkIncapable`, **never** staging *(M3-14 changes the third clause deliberately, per RW§8.4 rung 2)* |
| Does autonomous work enter vacuum? | **RW§8.4, whose first draft said the opposite and was retracted** | **No — and keeping `CanStageWorkerAt` is the RimWorld-analogous choice.** Only the ladder on top is missing |
| Does skill gate *whether* a pawn can work? | **RW§5.2** | **Never.** Only how well |
| One global skill multiplier? | **RW§5.1** | **No** — per-work-type curves. v1 ships rate only, and the quality deviation is stated |
| Blank vs incapable in the WORK tab? | **RW§1.6** | **Two distinct renderings**, never one |
| Do needs interrupt a job in progress? | **RW§3.5's boxed rule, confirmed twice** | **No.** Selection filter between jobs |
| Where does the rung requirement live? | **M2-1's literal-vs-def precedent** | A **literal band table** keyed off the pod's already-authored `Condition`. *A rule, not a tunable* |
| Does a deck-1 vent need the vertical gas term? | `MECHANICS.md` §13.23a + `AuthoredShips.cs:150`/`:1084` (the grid ship does it today) | **No.** A vent injects into **its own room**. OD-E is not violated |
| Does `thaw_cost_base`/`thaw_cost_step` ship? | **OD-L supersedes §3.4.1** | **No.** The ladder is the price |
| Is the MOSS screen the standard surface? | `overview-view.js:1181` + `overview-model.js:322` | **Reachable from it** — a takeover launched by an Overview click. Legitimate; the *door* is a M4-8 problem |

---

## 12. CORRECTIONS TO THE M3 OUTLINE, FOUND BY OPENING THE FILES

*Verified on `lane/m3-charters` @ `712d891`. Each is a claim in `…q3.packages.md` §6 or in the wreck
plan that is **false on this tree**.*

1. ⛔ **THE POD CENSUS.** §6 M3-6 says *"pods 8 · open at boot 1 · intact 5 · wrecked 2"*. The shipped
   ship is **12 · 1 · 7 · 4** (`AuthoredShips.cs:1760-1782`). ⭐ **And `AuthoredShips.cs:1332-1336`
   records that exact wrong draft and why it was wrong** — *"it read an answer about what the
   wrecked-pod ART DEPICTS as an answer about how many crew are RECOVERABLE."* **The correction was
   made in the code and never reached the document that consumed it.** The whole `thaws available`
   number, and therefore the whole ladder's length, was wrong by 2.
2. **`Device.Name`'s citations are stale.** §6 M3-1 cites `Simulation.cs:470-471` and
   `AuthoredShips.cs:1678`. **Read this session: `Simulation.cs:553-555` and
   `AuthoredShips.cs:1856`.** The *claims* are true; the line numbers are not.
3. **`grep "CryoSystem"` returns five hits, not three.** §6 M3-2 says three (`Device.cs`,
   `AuthoredShips.cs`, `WreckShipTests.cs`); the client has two more
   (`client/src/ui/onboarding.js:29`, `client/test/onboarding.test.js:475`). ⚠️ **The client ones
   matter**: `onboarding.test.js:478` asserts the card **must not promise a thaw**. **M3 must flip
   that test, and it is in a file no M3 charter named.**
4. **The wreck's consumable stock is `1 Parts + 10 Seals`, not `1 Parts + 2 Seals`.**
   `AuthoredShips.cs:2077-2078` (the reactor stock) **plus `:2246` (M1-I's locker, 8 more)** — and
   `:1600` records that the source comment itself said `2` until 2026-07-30. ⚠️ **M2-9's mutation-3
   fixture instruction ("strip Parts/Seals/Swarf first") is still correct but the number it names is
   not.**
5. **`thaw_cost_base` / `thaw_cost_step` are superseded by OD-L** (§5 M3-3). The wreck plan's §3.4.1
   recommendation was written **before** OD-L existed and its premise (*"nothing replaces the deleted
   per-pawn price"*) is now false.
6. **M3-11 is not "one line of content."** An `AirVent` requires `Powered`
   (`AtmosphereSystem.cs:123`), deck 1 is now genuinely off-network (M2-11), and **no player verb can
   place a conduit or a vent** (`Commands.cs:583-600`). §5 M3-11 + owner batch item 2.
7. **M3-4's seam is real but its surface needed checking.** `MossScreen` is imported **only** by the
   deprecated `hud.js` — the E0-4 WP-5 shape. **Cleared** by `overview-view.js:1181`, and the
   residual `hud.js` dependency is now a matrix row instead of a surprise.
8. **The `work` wire carries no skill and no `incapable` column** (`WireFormat.Work.cs:88-93`), so
   **M3-12 cannot be "pin-neutral client work" unless M3-7 ships the columns.** §6 chartered them as
   independent; they are not.

---

## 13. WHAT I VERIFIED VS WHAT I TOOK ON FAITH

**READ THIS SESSION, in the file, on this tree** — every `file:line` in §5 and §9, and specifically:
`AuthoredShips.cs` (`WreckPods` 1760-1782 · the header 1310-1340 · `pod_` 1856 · `term_moss` 1952 ·
the dead deck 2019-2050 · stock 2077-2078 + 2246 · `WreckCutDeck1Risers` 2331-2400 · the grid's
deck-1 vents 150 and 1084) · `Device.cs` (kinds 5-49, fields 66-120) · `Simulation.cs:553-555` ·
`MossBindings.cs:14-41` · `SafetySystem.cs:95-158` · `JobContext.cs:64,80` ·
`MachineWearSystem.cs:667,706` · `AtmosphereSystem.cs:110-150` · `Commands.cs:565-624` ·
`Citizen.cs` (50, 128, 144, 205-276) · `SaveWriter.cs:284` / `SaveReader.cs:322` ·
`NeedsSystem.cs` header · `WireFormat.Blocked.cs` (332/350/382/484/546) · `WireFormat.Work.cs:88-134`
· `messages.js:529-570` · `GameSession.cs:399-446` · `moss-model.js:27` · `hud.js:30` ·
`overview-view.js:1181` · `overview-model.js:322,335-345` · `machines.def:43,62,66` · `recipes.def` ·
`build.def` · `WreckShipTests.cs` (42-210, 741-752) · `MECHANICS.md` §3 (the same-deck-only table),
§13.22, §13.23a · `rimworld-reference.md` §2.2, §2.4, §3.5, §4.4, §5.1-5.2, §6.1, §8.4.

**TAKEN ON FAITH — inherited from a doc or a source comment, NOT re-driven here.** ⚠️ **Anyone whose
package depends on one of these must re-measure it:**

- The **five pin values** (read from `CLAUDE.md`, not run).
- **M2-11's census** — 23 of 611 devices off-network, flat demand 14.30 kW (read from
  `WreckCutDeck1Risers`'s doc comment and `ROADMAP.md`).
- **M2-12's curve** — 10.65 → 13.47 → 17.40 kW, floor 9.00, divergence windows at perilune t=3261 /
  slice t=7011 (read from `ROADMAP.md` and the brief). ⚠️ **M2-12's standing instruction applies to
  M3-10 and M3-11: any lane touching tick-3000 horizon, battery capacity or authored wing `Condition`
  must re-measure the divergence window.**
- **The headroom arithmetic** — 3.663 crew per working scrubber, `FoodUnitsPerCrewPerDay = 1.389`,
  O₂ ≈ 99 crew-days on grid (wreck plan §3.3/§3.4.1, driven there, not here).
- **`ArchitectureBoundaryTests`'s `LedgerOwners` rule** and the `ShipLedger.Sample` allocation
  (quoted from the wreck plan).
- **Test counts** — none are quoted anywhere in this file, deliberately. *A count you did not measure
  yourself is not evidence, even from `CLAUDE.md`.*
