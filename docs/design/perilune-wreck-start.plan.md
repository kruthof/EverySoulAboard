# The wreck start — premise, opening, core loop, and a wave charter

**Status: DESIGN ONLY. Nothing built. 2026-07-28.**
**Lane:** `lane/wreck-design`. The whole diff is this file plus a pointer in `docs/HANDOVER.md`.
Owner decisions 1–4 (below) are **settled and designed to**, not re-argued.

> **Every number in this document is either (a) MEASURED by a command quoted beside it, or
> (b) labelled UNMEASURED.** This repo's most expensive recurring failure is reasoning over
> design vocabulary instead of driving the sim, so the two are kept typographically apart.
> All measurements were taken in this worktree, Release, `n = 1`, on a machine running nothing
> else, on `main` @ `d4b860a`.

---

## 0. Executive summary — what changed in my head while measuring

Five findings reorder the plan. Read these before the beat sheet.

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
   yet and is not a tuning tweak — it is a rule that has to be rewritten. This is §7 OD-1.

4. **⛔ `AddRoomCommand` IS A FREE, INSTANT, UNCONDITIONAL PRESSURISATION WAND.**
   `sim/Sim.Core/Commands/Commands.cs:600-666`: it force-unlocks and force-opens every
   bordering door and calls `RoomState.Pressurize(room)` — 101.3 kPa, 21 % O₂, from nothing,
   for free, with no vent, no power, no material, no time. On the standard surface it is the
   Overview's `＋ADD ROOM` chip. **On a wreck it deletes the entire core loop in one click.**
   This is §7 OD-2 and it is the highest-stakes decision in the document.

5. **A cryo pod needs NO new hashed sim state.** `Device` already carries `IsOpen` (hashed
   `Simulation.cs:454`, saved DEVC), `Name` (hashed `:469`), `Condition` (hashed `:466`) and
   `Powered` (hashed `:456`). An *occupied* pod is `IsOpen = false`; an *open* pod is
   `IsOpen = true` — which is **exactly the owner's two new art pieces**. The soul inside is
   the pod's `Name`. Thawing calls `sim.AddCitizen`. Only the two defs checksums move, because
   a new `DeviceKind` grows the `Machines` and `Recipes` arrays that
   `SimDefs.ComputeChecksum` folds (`SimDefs.cs:880`, `:768`, `:954`).

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
| The crew who were frozen survived | `DeviceKind.CryoPod` (new), `IsOpen = false`, `Name = "pod_<who>"` | §4 W5 |
| The raiders vented most compartments | `plan.PressurizedAnchors` omits them | `ShipPlanBuilder.cs:87-95` |
| They shot up the machinery | `DeviceSpec.Condition` (new authoring field) at 0.0–0.35 | §4 W1 |
| They cut through bulkheads | `'R'` debris terrain (`AsciiWorld.cs:39-42`) — collapsed deckhead |
| The rubble | `ItemKind.Regolith` | `ItemStack.cs:5` |
| They left the stores spoiled or slagged | authored `ItemSpec` stacks | §7 OD-3 |
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

⇒ **Renaming `ItemKind.Regolith` to `Rubble` (or `Spoil`) is a pure rename with no hashed-value
change** — the enum's numeric value stays 0, so no save and no pin moves — but it touches the
glyph table, the client `ITEMS` registry, four independently-derived accept masks
(`ItemStack.cs:22-33`), `BuildSystem.Material` (`BuildSystem.cs:58`), the ledger's kind names
(`ShipLedger.cs:356`) and every test string. **It is a decision, not a task** — §7 OD-6.

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

## 2. The opening beat sheet — the first ~30 minutes

**Reading key.** ✅ = the verb and the answering system exist today, unmodified.
🔶 = the verb exists but answers wrongly on a wreck. ❌ = must be built.
"sim-min" is simulation time; the crew work at the E0-2 human-pace rebase (a wall is 4 min, a
maintenance service is **900 s = 15 sim-min**, `wear.def:17`).

---

### Beat 0 — cold open. The pod cycles.

**What the player sees.** One deck. One lit compartment. Eight `CRYO CAPSULE · OCCUPIED`.
Everything else on the deck is a wrecked twin at 8 %–30 %. One capsule's badge counts down; it
opens; one pawn steps out onto the deck plate.

**Verb:** none — the player does nothing.
**System:** ❌ **must be built.** There is no boot-time scripted event of any kind. The cheapest
honest shape: the first pod is authored `IsOpen = true` and its citizen is authored present
(`CitizenSpec`), i.e. **the game opens one tick after the thaw rather than staging it**. A real
cycling animation is a client-side flourish over the same state.
⇒ **Recommendation: author the first crew member awake.** Do not build an opening cutscene
system for one beat. §4 W3.

---

### Beat 1 — "where am I". Orientation, 0–2 sim-min.

**What the player does.** Pans the Level-1 Overview; enters the Room Zoom; clicks the pawn.

**Verbs:** deck change ✅, room entry ✅, crew select ✅, pause/speed ✅
(`GameSession.cs:2129-2132`).
**System:** the `map`/`crew`/`materials`/`marks`/`items` wire channels, all shipping.

⚠️ **What the player sees here is the door bug from `HANDOVER.md`'s top block.** Every
allocated compartment's doors are force-opened, `'/'` is unskinned, so **the wreck's lit core
will draw no doors at all.** Fixing `'/'` is an art decision already open on the owner; on the
wreck ship it stops being cosmetic, because *which doors are shut* is the core-loop readout.
⇒ **Blocking dependency on the wreck start.** §7 OD-7.

---

### Beat 2 — "I can't breathe out there". The frontier appears. 2–5 sim-min.

**What the player does.** Walks the pawn toward the next compartment. Either the door is shut,
or it is open and the pawn's Suffocation begins to climb; at `flee_suffocation = 0.5`
(`needs.def:34`) `SafetySystem` drops whatever it was doing and paths it back to breathable air
(`SafetySystem.cs:227-234`). ~45 s of exposure.

**Verbs:** move order ✅ (`MoveCitizenCommand`, `Commands.cs:56`), door open/close ✅
(`SetDoorStateCommand`, `Commands.cs:4`), pressure/oxygen/CO2/temperature lenses ✅
(`GameSession.cs:2074-2079`).
**Systems:** `AtmosphereSystem` ✅, `NeedsSystem` ✅, `SafetySystem` ✅.

**This beat needs nothing built and it teaches the whole game.** It is the strongest thing the
shipped sim already does and the wreck start is the first ship that puts it in front of a new
player in minute three.

---

### Beat 3 — "why is nothing happening?". The silent refusal. 5–8 sim-min.

**What the player does.** Paints a DIG or a repair order in the airless compartment next door.

**What happens today:** ❌ **nothing. Forever. Silently.**
`JobWork.TryPathToAdjacent` (`JobContext.cs:73-88`) asks `CanStageWorkerAt` for each of the four
approach tiles; all four fail; the site takes a 50-tick backoff (`DigJobSource.cs:106-108`) and
is re-probed every 5 s for the rest of the game. No toast, no tint, no reason. `MECHANICS.md`
§13.21 records this as an accepted cost with a follow-up filed.

⇒ ❌ **ON THE WRECK THIS IS NOT A FOLLOW-UP. IT IS A LAUNCH BLOCKER.** On `--ship grid` the
refusal is reachable but rare — measured, `occupancy --ship grid --days 12 --maint-audit` reports
`unstageable dig/strip/build 0 / 0 / 0`, because grid's player-reachable work is all in
breathable air. On a wreck **the majority of every order the player paints in the first hour
will be refused**, and a refusal that looks identical to a broken verb will read as a broken
game. `CanStageWorkerAt` was made `public` for exactly this. §4 W4.

**Required, not optional:** a sparse view-only `blocked` wire channel, and a Room-Zoom
treatment that says *"no air — nobody can work here"* on the designated tile.

---

### Beat 4 — "make one more room breathable". The frontier moves. 8–20 sim-min.

**What the player does.** Shuts the doors around the target compartment, then makes its air.

**The four things that must be true for a compartment to become workable** — all four are
already modelled, and this is the loop:

| # | Requirement | Mechanism | Verb today |
|---|---|---|---|
| 1 | Doors shut, or it bleeds to vacuum | `FlowAcrossDoor`, `AtmosphereSystem.cs:206-274` | ✅ door open/close |
| 2 | A vent in the room, **open** | `AtmosphereSystem.cs:123-150`, 30 mol/s from an unmodelled reserve | 🔶 see below |
| 3 | The vent **powered** | `PowerSystem`; needs conduit → network → SolarWing | ✅ indirectly |
| 4 | The vent `Condition ≥ fail` (0.10 for an AirVent, `machines.def:27`) | `Device.IsOperational`, `Device.cs:104` | 🔶 see §4 W2 |
| 5 | Temperature ≥ −10 °C (`needs.def:22`) | `ThermalSystem` — **there is no heater in the game** | ❌ see §6 R-4 |

🔶 **Requirement 2 has no verb on the standard surface.** `SetDeviceStateCommand`
(`Commands.cs:32`) toggles `IsOpen` on any device and is wired to the MOSS console
(`GameSession.cs:473-484`) and the TUI — **not to the Room Zoom.** So *opening a vent*, the
single most important physical act in the wreck's core loop, is today reachable only through a
text terminal. ⇒ **A `vent` verb on the Room Zoom is required.** §4 W4b.

🔶 **`＋ADD ROOM` short-circuits all five.** See §7 OD-2. Until that is decided, beat 4 has a
one-click cheat.

**Measured, so nobody has to guess whether the vent is fast enough:** `vent_mol_per_second = 30`
(`atmosphere.def:19`), pass Dt = 0.2 s. A 60-tile compartment is 150 m³; filling it to 101.3 kPa
at 293 K takes ≈ 6 240 mol ⇒ **≈ 208 s ≈ 3.5 sim-min at one vent.** *(Arithmetic over shipped
defs; not driven. Worth a driven check in W4's acceptance.)*

---

### Beat 5 — "the machines are dead". Repair enters. 20–40 sim-min.

**What the player does.** Nothing, at first: `MaintenanceSystem` recruits on its own, every
second, for any device below its `maint` threshold (`MachineWearSystem.cs:200`).

**What happens today:** 🔶 **the ship heals itself, for free, with empty hands.**
`RestoredCondition` (`MachineWearSystem.cs:394-399`): Parts in hand → `1.0`; Seals in hand →
`0.9`; **empty hands → `jury_rig_condition = 0.6`** (`wear.def:18`). 0.6 is above every `maint`
threshold in `machines.def` (max 0.4), so **one 900 s pass with nothing in hand takes any
wrecked device permanently out of the needy set.**

⇒ This is owner decision 3 and it is correct: **below a wreck threshold, jury-rig must be
refused.** §4 W2.

**How long the un-fixed self-heal takes, so the size of the problem is on the record.**
MEASURED anchor: `occupancy --ship grid --days 6 --maint-audit` → **88 services completed** at
**1.999 % Maintain occupancy** with 8 crew; `--days 12` → **272 services**, **3.063 %**. The
system is nowhere near saturated. UNMEASURED arithmetic on top: a wreck authoring ~120
wear-bearing devices all below threshold is `120 × 900 s = 108 000` crew-seconds =
**30 crew-hours**, which **one** thawed crew member cannot finish inside 30 sim-hours of
uninterrupted work. That is the pacing curve the premise wants, and it exists the moment
free jury-rigging stops.

**Verbs:** none needed — maintenance is automatic. **What IS needed is legibility**: the player
must be able to see that a device is dead, that it needs Seals or Parts, and that the ship has
none. The condition wire (in flight) plus the E0-8/E0-9 ledger cover most of this.

---

### Beat 6 — "where do Parts come from?". The salvage question. 40+ sim-min.

**What the player does.** Paints STRIP on the dead half of the ship.

**What happens today:** ⛔ **they get nothing.** `DeconstructSystem.cs:278-281`:
`floor(device_parts × Condition)` with `device_parts = 2` ⇒ **0 Parts below Condition 0.5**, and
the owner's art badges every wrecked piece at **0 %–35 %**. Walls still pay
(`floor(wall_material 2 × wall_recovery 0.5) = 1` Regolith, condition-independent,
`deconstruct.def:39`), and dug debris still pays. **Devices pay nothing.**

⇒ **The faucet owner decision 3 assumes does not exist.** §7 OD-1 is the fork. Note the
existing rule is not a bug: it was written to stop a strip/rebuild loop minting Parts, and its
comment says so. Any replacement must keep the round trip lossy
(`device_place_cost = 3` Parts out, `build.def:36`).

---

### Beat 7 — "wake someone up". The thaw. ~1 sim-hour in.

**What the player does.** Clicks an occupied pod. The game either thaws, or says why not.

**Verb:** ❌ `thaw` — must be built (`ThawCommand`, §4 W5).
**Gate:** ❌ `ThawGate` — must be built (§3.3).
**Cost:** Parts (owner decision 2), charged all-or-nothing via the existing `LooseMatter.TryPay`
helper (`Commands.cs:456`), the same shape `PlaceDeviceCommand` and `CommissionDeviceCommand`
already use.

---

### Beat 8 — "MOSS is dark". The automation door. deferred past the first hour.

**What the player does.** Opens the MOSS terminal and finds it will not accept a program.

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

⇒ **"Restore MOSS first" is honestly modelled as *"you cannot install or change a program until
you have spent a ControllerModule on a terminal"*, and nothing more.** A darkened *screen* is a
client-side presentation over the same flag, and is cheap. Do not claim more than that.

---

### Beat-sheet summary — what must be built for the opening to work at all

| # | Thing | Beat | Wave |
|---|---|---|---|
| 1 | Author a device damaged (`Condition`, `Scriptable`) | 0, 5, 8 | W1 |
| 2 | Refuse jury-rig below a wreck threshold | 5 | W2 |
| 3 | The wreck ship itself | all | W3 |
| 4 | **Say why an order is refused** | 3 | W4 |
| 5 | A `vent` verb on the Room Zoom | 4 | W4b |
| 6 | Cryo pod + thaw + gate | 0, 7 | W5 |
| 7 | Skin `'/'` (open door) | 1 | OD-7 |
| 8 | Decide the salvage rule | 6 | OD-1 |
| 9 | Decide `＋ADD ROOM` | 4 | OD-2 |

---

## 3. The core loop

### 3.1 The loop, in one paragraph

**Push the pressure frontier out by one compartment; salvage what is behind you; spend the
salvage repairing the machines that let you push again; when the ship measurably supports one
more soul, spend Parts to thaw one — and now you have twice the hands and twice the draw.**

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
| **The pod** | `IsOpen == false && Powered && Condition ≥ machines[CryoPod].fail` | all three |
| **The price** | `LooseMatter.Affordable(sim, Parts, thaw_cost)` | all-or-nothing, charged last |

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

### 3.4 Gradual thawing

Owner: *"able to thaw one person, then after a time another."* Two mechanisms, and I recommend
**both**, because they fail differently:

1. **The headroom gate** paces thaws against the ship's real state. It can be satisfied all at
   once by a player who prepares well — which is correct, and is the reward for playing well.
2. **A pod recharge time** (`Device.Progress`, already hashed at `Simulation.cs:464` and saved
   DEVC v2, currently used by crafting) gives a hard floor between thaws regardless of
   preparation, so the *first hour* cannot become eight pawns.

⇒ **Recommendation: gate = the four terms; floor = one thaw per pod, pods are single-use until
the crew build more.** A pod that has been opened is spent. This makes the *number of pods*
the pacing curve, it is authorable, and it needs no timer state at all.

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

### **W0 — condition wire + wrecked art** *(ALREADY IN FLIGHT — not chartered here)*

Two lanes are building this in parallel with me. **I have deliberately not designed their
internals.** What the rest of this charter needs from them, stated as an interface so the waves
can be planned against it:

- a **view-only** wire channel carrying per-device `Condition`, sparse, x-first tuple
  (`materials`/`zones`/`marks`/`items` are all x-first — checked in source);
- a client join from `(kind, condition)` to the wrecked twin, **derived from the registry**, not
  hand-mirrored into the two view files (the device-sprite lesson, `HANDOVER.md`);
- **no** sim-side change, so P1–P5 all hold.

⚠️ **Loose resources have no condition and cannot get one this way** — `ItemStack` has no such
field and the `items` channel carries `[x,y,deck,kind,count]`. The eight wrecked-resource
pieces therefore have **no key to render off**. §7 OD-3.

---

### **W1 — author a device damaged, and dark**

**Goal.** Let a `ShipPlan` say a device boots at `Condition = 0.14` with `Scriptable = false`.
**Files.** `sim/Sim.Gen/ShipPlan.cs` (2 fields on `DeviceSpec`, currently 6 fields at
`:78-86`) · `sim/Sim.Gen/ShipPlanBuilder.cs` (2 lines beside `:31-33`).
**Pins.** **NONE.** `Device.Condition` already folds (`Simulation.cs:466`) and saves (DEVC v3);
`Scriptable` already folds (`:457`) and saves (DEVC v5). No new hashed state, no save version
bump, no defs change. Every existing plan omits both fields.
**The sentinel is load-bearing.** `DeviceSpec` is a struct, so `default` gives
`Condition = 0f`, which would wreck every device on every existing ship. Use a
sentinel (`Condition = -1f` meaning "leave the field initialiser alone") and **a test that
builds an unmodified `PeriluneGrid()` and asserts every device reads `Condition == 1f` and
`Scriptable == true`.**
**Must NOT.** Touch any authored ship. Touch `Device.cs`. Add a third field "while we're here".
**Acceptance.** `./ci.sh` exit 0; all five pins held; `git diff -- content/ tests/Golden/ ci.sh`
is 0 lines; a driven test proving a plan authoring `Condition = 0.2` produces a device that
`MaintenanceSystem` recruits for on the first pass.
**Parallel:** with W4, W6.

---

### **W2 — the recovery rule: below a wreck threshold, jury-rig is refused**

**Goal.** A device below `wear.wreck_threshold` cannot be restored with empty hands. It needs
Seals (→ 0.9) or Parts (→ 1.0). Above the threshold, behaviour is byte-identical to today.
**Files.** `sim/Sim.Core/Systems/MachineWearSystem.cs` · `content/core/SimDefs/wear.def` ·
`sim/Sim.Core/Defs/SimDefs.cs` (field, default, checksum fold) ·
`sim/Sim.Core/Defs/DefsParser.cs` (parser key) ·
`content/core/SimDefs/README.def` — **the def-field-in-one-commit ritual, all five parts.**
**Pins.** **P4 and P5 move** (a new folded def field, appended like `SealServiceCondition` at
`SimDefs.cs:1085`). **P1/P2/P3 must be MEASURED, not predicted.** They move iff any device on
the scenario / default / slice ships falls below the threshold *while the ship holds no free
Parts and no free Seals* within the pinned window. `wear` runs to 0.020/h
(`machines.def:38-40`) and the scenario twin runs 3 sim-days, so this is entirely plausible.
**Where the refusal goes, and it matters.** Put it in `RecruitForNeediest`, in the **same skip
branch as "nowhere to stand"** (`MachineWearSystem.cs:210-218`), *not* in the work phase.
That branch is already `_recruitSkip`-per-pass and never remembered, so the machine becomes
serviceable on the very pass a Seals stack appears — no new state, no new livelock shape, and
no crew member walks 900 s to achieve nothing.
⚠️ **This refusal is ALSO silent** — the same §13.21 shape as the worksite rule. It must be
surfaced by W4 in the same milestone, or W2 ships a second invisible failure.
**Must NOT.** Change `jury_rig_condition`, `seal_service_condition`, or the Parts-before-Seals
tier order. Touch `RestoredCondition`.
**Acceptance.** A driven test: a device at 0.2, no Parts, no Seals anywhere ⇒ **no crew member
is ever assigned `JobKind.Maintain` for it**, over 2 000 ticks; introduce one Seals stack ⇒
serviced to 0.9 within one service time. Plus the **inclusion control**: revert the guard and
require the first assertion to go red.
**Depends on:** nothing. **Best measured with:** W1.

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
- **spoiled stores** — see §7 OD-3 for what these can actually be;
- **exactly one goal** (`GoalKind`), matching grid's single-goal precedent (`AuthoredShips.cs:1169`).
**⚠️ The one thing to get right and the reason this wave is not trivial.** `--ship grid` boots
**1 250 devices**, of which **≈1 088 are conduits** *(census from `AuthoredShips.cs:1025-1026` +
`AddConduits`; the 1 250 total is MEASURED — `occupancy --ship grid --days 2 --maint-audit`
prints `devices in bad air 226 (of 1250)`)*. **Conduits, pipes and ladders must NOT be
wrecked** — they are `0 0 0 0` in `machines.def`, they are what makes the ship traversable and
powerable, and wrecking them would need a different mechanism anyway. The wreck's damaged set is
the ~120 wear-bearing devices, not the 1 250.
**Must NOT.** Change `PeriluneGrid()`, `PeriluneSlice()` or `Perilune()` by one byte. Flip a
default. Zone a stockpile (`MECHANICS.md` §13.18 — the surviving reason is a design decision).
**Acceptance.** `--ship wreck` boots; `occupancy --ship wreck --days 1` runs; the crew survive
day 1; all five pins held; `git diff` to the three existing authored ships is 0 lines.
**Depends on:** W1. **This wave is large enough to split** into W3a (geometry + air + debris)
and W3b (damage pass + stores) if the first `occupancy` run is a surprise.

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

### **W4b — a `vent` verb on the Room Zoom** *(small; may fold into W4)*

Wire `SetDeviceStateCommand`'s `IsOpen` toggle to a Room-Zoom affordance on `AirVent`
(and on `Door`, which today is also console-only on the standard surface). Pin-neutral.
⚠️ **It cannot be ledgered as a gap.** `KNOWN_GAPS` is now **empty** and
`KNOWN_GAPS_SEALED = ['dig', 'stockpile', 'strip']`
(`client/test/surface-boundary.test.js:133-144`) — the ratchet has one direction left, so a new
key **fails**. The verb gets ported or it does not exist.
**Verb parity is not sufficient** — port the *feedback* too (did it open? is it powered? is it
operational?), which is the binding lesson from WP-6.

---

### **W5 — `DeviceKind.CryoPod` + `ThawCommand` + `ThawGate`**

**Goal.** A soul in a box, and a priced, gated way out of it.
**Files.** `sim/Sim.Core/Entities/Device.cs` (`CryoPod = 27`, **appended**) ·
`sim/Sim.Core/Entities/MachineDefs.cs` + `sim/Sim.Core/Defs/SimDefs.cs:570` (a `Machines` row) ·
`content/core/SimDefs/machines.def` (a row) · `content/core/SimDefs/build.def` (`thaw_cost`) ·
`sim/Sim.Glyph/Glyphs.cs` (a glyph) · `sim/Sim.Core/ThawGate.cs` (new) ·
`sim/Sim.Core/Commands/Commands.cs` (`ThawCommand`) · `hosts/web/GameSession.cs` (a wire verb) ·
`client/src/items/` (the two art pieces) · `sim/Sim.Gen/AuthoredShips.cs` (8 pods in the bay).
**Pins.** **P4 and P5 move.** A new `DeviceKind` grows `Machines` (folded per row,
`SimDefs.cs:880`) **and** `Recipes`, which is sized `new RecipeDef[d.Machines.Length]`
(`SimDefs.cs:768`) and folded per entry (`:954`) — so **two arrays grow for one enum member.**
Plus `thaw_cost`. **P1/P2/P3 must hold** and that must be *measured*: no existing ship has a pod,
so nothing should move — but `Machines.Length` changing is exactly the kind of thing that
surprises people.
**⭐ NO NEW HASHED SIM STATE.** The whole feature lands on fields `Device` already has:

| Concept | Field | Already hashed | Already saved |
|---|---|---|---|
| occupied / open | `IsOpen` | `Simulation.cs:454` (b8) | DEVC v1 |
| who is inside | `Name` | `:469` | DEVC v1 |
| pod damaged | `Condition` | `:466` | DEVC v3 |
| pod unpowered | `Powered` | `:456` (b10) | DEVC v1 |

**A frozen soul is NOT a `Citizen`.** It is a named, closed pod. Thawing calls
`sim.AddCitizen` (`Simulation.cs:197-202`), which takes its id from the already-hashed,
already-saved `_nextEntityId`. This avoids a `Frozen` bit on the citizen flag word — which would
have moved **all three** state pins and bumped the CITZ save chapter — and it avoids eight
inert citizens distorting every `LivingCrew` denominator in the ledger from tick 0.
**The persona** comes from the host's roster, exactly as `AuthoredShips.PopulateSlice`
(`AuthoredShips.cs:800-838`) already weaves minds into an authored crew.
**Must NOT.** Insert into `DeviceKind`. Add a field to `Citizen`. Call `ShipLedger` from
`ThawGate` (`ArchitectureBoundaryTests.cs:519` — it will go red, and it is right to).
**Acceptance.** Thaw refused with a named reason on a starved ship; permitted on a fed one;
Parts charged exactly once, all-or-nothing; the pod reads `IsOpen = true` afterwards and cannot
be thawed twice; a save/load round trip of a half-thawed ship is byte-identical.
**Depends on:** W3. **This wave is large enough to split**: W5a = pod device + art + authoring;
W5b = `ThawGate` + `ThawCommand` + the client screen.

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
**Parallel:** with W1, W4. **Independent of the wreck** — it is a general fix the wreck merely
motivates. It could land before the wreck ship and probably should, to get its pin move out of
the way alone.

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

---

### **W8 — flip the default to `--ship wreck`** *(last)*

`hosts/web/Program.cs:44` and `play.sh`. Owner decision 1: **only when wreck is playable.**
Pin-neutral. The banner and `CLAUDE.md`'s "Play" section change in the same commit.

---

### Dependency graph

```
W0 (in flight) ─┐
W1 ─────────────┼──► W3 ──► W5 ──► W8
W2 ─────────────┘           ▲
W4 / W4b ───────────────────┘   (blocking: no wreck ships without W4)
W6  ──── independent, land it alone, it moves three pins
W7  ──── after W8
```
**Parallel-safe pairs:** (W1, W4), (W1, W6), (W2, W4), (W4, W6).
**Never parallel:** W2 with W6 (both change what maintenance does).

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
capacity because grid boots every device at `Condition = 1f` (`DeviceSpec` has no Condition
field, `ShipPlan.cs:78-86`). A wreck authoring ~120 wear-bearing devices below threshold puts
`120 × 900 s = 30 crew-hours` of Maintain work on the board **before the player clicks
anything** *(arithmetic over `wear.def:17`; the device count is UNMEASURED pending W3)*.

**And a second, sharper observation from the same runs.** At 12 sim-days grid reports
`needy machines at end 9, of which in UNBREATHABLE air 8`. **The wreck loop already exists on
the shipping ship, in miniature: machines the crew cannot reach because the air is dead.** The
wreck start is not a new mechanic. It is the existing mechanic made central.

### 5.4 Where the thesis "the wreck IS the faucet" survives and where it fails

**It survives for walls and rubble.** A stripped wall pays `floor(2 × 0.5) = 1` Regolith
regardless of condition (`deconstruct.def:39`); dug debris pays Regolith; both feed
`SalvageRecycler` → `Fabricator` → `MachineShop`, which E0-6 made honestly lossy at 4:3.

**⛔ It FAILS for devices, and this is measured off the shipped rule, not inferred.**
`DeconstructSystem.cs:278-281`: `floor(device_parts 2 × Condition)`, **"0 below Condition 0.5 —
a wreck is worth nothing, which is the point."** The owner's art badges the wrecked twins at
**0 %–35 %**. **Under the shipped rule the entire dead half of a wrecked ship yields exactly
zero Parts, and Parts are the currency every repair, every placement and every thaw is priced
in.** The wreck is currently a *worse* faucet than grid, not a better one.

⇒ **E1 remains gated, but the fork moves.** `HANDOVER.md` frames it as *"does `--ship grid` get
its own ice hold?"*. On a wreck-first game the question becomes **"what does a dead machine
yield?"** (§7 OD-1). The ice chain is orthogonal: it is a *water* faucet, it works, and the
wreck can author a hold the same way the slice does (200 `ItemSpec` rows, `AuthoredShips.cs:483`).
Grid's water, meanwhile, is **still conjured** — measured this run: `ice melters 0 (no ice chain
⇒ the B-2 makeup floor is ACTIVE at 20 L)`.

### 5.5 The concrete recommendation to the economy programme

1. **Retire A1 as E0's exit gate on `--ship grid`.** It has been satisfiable by busywork four
   times over (`CLAUDE.md`) and it is now measured as reporting a content gap. Keep it as a
   *regression* statistic on grid, never as a *goal*.
2. **Do not open E1 against grid.** `HANDOVER.md` is right and the wreck does not change it.
3. **Re-charter E0's exit gate on `--ship wreck`, as a THROUGHPUT statement, not a busy-ness
   one:** *"one crew member, starting alone in a wrecked ship, can reach a second thaw."*
   That is a single measurable event, it cannot be satisfied by hauling in circles, and it
   requires the faucet, the repair rule, the pressure loop and the thaw all to work.
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

**R-2 — The self-healing ship.** Without W2, a wrecked ship repairs itself to `Condition 0.6`
with empty hands in one 900 s pass per device and the premise evaporates in the first sim-hour.
Owner decision 3 already names this; the trap is that **W3 without W2 will look like it works**,
because the ship comes back to life — just not for any reason the player caused.

**R-3 — `＋ADD ROOM` deletes the loop in one click.** §7 OD-2. This is the highest-stakes item
in the document and it is a *design* decision, not a bug: the command is correct for grid.

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

**R-10 — The art is 72 new pieces and the join is the risk, not the drawing.**
`GLYPH_SUBSTITUTE` is not homogeneous in registry `kind` (5 `functional`, 1 `cosmetic`), so any
predicate over *what a glyph resolves to* is defeated by substitution — that shipped DEMOLISH
dead on every lamp with the suite **green before and after the fix**. The wrecked-twin join must
key off `(DeviceKind, Condition)` from the wire, **derived from the registry**, never off a
glyph and never hand-mirrored into two view files.

**R-11 — `AddRoomCommand` force-unlocks doors, including Lien-owned locks.**
`Commands.cs:640` sets `IsLocked = false` unconditionally, bypassing `SetDoorStateCommand`'s
interlock (`:21`). Latent today; on a wreck with locked compartments it is a free skeleton key.

---

## 7. OPEN OWNER DECISIONS

---

### **OD-1 — What does a wrecked machine yield when stripped?** ⭐ *highest economic stakes*

**The situation.** `DeconstructSystem.cs:278-281`: `floor(device_parts 2 × Condition)`, **zero
below Condition 0.5**, with the source comment *"a wreck is worth nothing, which is the point."*
The art badges the wrecked twins **0 %–35 %**. Owner decision 3 assumes salvage is the faucet.
**These cannot both be true.**

| Option | What it does | Cost |
|---|---|---|
| **A — leave it.** Devices yield nothing; the faucet is walls, debris and authored stores. | Keeps the strip/rebuild loop provably lossy. The wreck's matter budget becomes purely *authored*, i.e. finite and hand-tuned. | Free. But it makes "salvage the dead half" false, and the player strips a hundred devices for nothing. |
| **B — yield a NEW low-grade item** (`Swarf`/`Slag`) at a condition-independent rate, which the `SalvageRecycler` upgrades at a loss. | Salvage always pays *something*; the loss lives in the conversion, not in the yield; it matches the art's `SCRAP · SLAGGED` / `PARTS · SEIZED` vocabulary exactly. | One appended `ItemKind` (**P1–P3 hold** — existing kind values are unchanged and `ItemStack.Kind` folds by value, `Simulation.cs:440`); **P4/P5 move** as soon as it gets a production bill, because recipes fold their `ItemKind` operands (`SimDefs.cs:954-961`, `RecipeDef` at `:1148-1154`). Plus four accept-mask derivations (`ItemStack.cs:22-33`) and one art piece. **E1 already names `Swarf` and "the metal cycle's real loss".** |
| **C — raise `device_parts` and keep the multiply.** | One number. | Re-opens the mint the rule closed: a pristine device would return ≥ its 3-Part place cost. Refused unless `device_place_cost` rises with it, which re-prices the whole build economy. |

**Recommendation: B.** It is the only option that makes the fiction true, it lands the item the
art already draws, it keeps the loss where E0-6 put it (in the conversion), and **it is the
faucet E1 is currently blocked on** — which means one decision unblocks two programmes.
**Cost of B: one `ItemKind`, one bill, one art piece, and a wave.**

---

### **OD-2 — Does `＋ADD ROOM` survive on the wreck ship?** ⭐ *highest design stakes*

`AddRoomCommand` (`Commands.cs:600-666`) force-unlocks and force-opens every bordering door and
calls `RoomState.Pressurize` — **101.3 kPa of 21 % O₂ from nothing, free, instant, no vent, no
power, no material, no time.** It is the Overview's `＋ADD ROOM` chip and it is *correct for
grid*, where commissioning an empty hall is a colony-management verb.

**On the wreck it is a one-click win button for beat 4**, which is the core loop.

| Option | Cost |
|---|---|
| **A — leave it.** | The pressure frontier is decorative. Do not build the loop. |
| **B — price it.** Charge Parts/Seals via `LooseMatter.TryPay` and require a working vent in the compartment. | ~20 lines in one command. **Changes grid's behaviour**, so it is a shared-surface decision, and it may move P1–P3 if any test drives it. |
| **C — split it.** `＋ADD ROOM` keeps *naming and typing* a compartment (free, always allowed); **pressurising becomes the vent's job** and is deleted from the command. | Cleanest fiction: you *designate* a room, then you *make its air*. Removes the `Pressurize` call and the door-forcing. **Grid's boot behaviour is unaffected** (its rooms are pressurised by `ShipPlanBuilder`, not by this command), but grid's *play* changes: a commissioned hall would start airless. |
| **D — per-ship behaviour.** | ⛔ **Refuse.** There is no per-ship command variation anywhere in the sim and inventing one to dodge a design decision would be the worst outcome in this document. |

**Recommendation: C**, with B as the fallback if C proves too disruptive to grid's existing
tests. C is the option that makes the vent — a device that already exists, already works, and
already has no verb — into the game's central tool.
**⚠️ Either way, C and B both remove the door force-open, which is also what makes the door art
vanish (see OD-7).** Two owner reports converge on this one command.

---

### **OD-3 — What ARE the eight wrecked loose resources?**

The art has `REGOLITH · CONTAMINATED`, `POTATO · SPOILED`, `SCRAP · SLAGGED`, `PARTS · SEIZED`,
`CONTROLLER · FRIED`, `SEALS · PERISHED`, `ICE · MELTED`, `CORPSE · UNSHROUDED`.
**`ItemStack` has no condition, no quality and no state field, and the `items` wire channel
carries `[x, y, deck, kind, count]` — there is no key to render them off.**

| Option | Cost |
|---|---|
| **A — eight new `ItemKind`s** (9…16), each with its own recipe to restore it. | P1–P3 hold (existing kind values unchanged); **P4/P5 move** the moment any of them gets a recipe (`SimDefs.cs:954-961`). **Doubles the item vocabulary** — every stockpile accept mask, ledger slot, glyph and art join grows, and `ShipLedger.KindCount` changes. Big. |
| **B — one flag bit on `ItemStack`** (`Degraded`), + one wire field. | **New hashed state ⇒ P1/P2/P3 all move + an ITEM save chapter bump.** But it is *one* bit and it composes with every kind. Restoration is one recipe per kind, or one generic "reprocess". |
| **C — art only, no mechanic.** The wrecked resource art is used for the wreck's *authored* stacks and means nothing to the sim. | Cheapest. But an item that looks broken and behaves normally is a lie the player will find in ten minutes. |
| **D — fold into OD-1's `Swarf`.** The "spoiled" resources are simply *not* the shipped kinds — they are the one new low-grade kind, drawn eight ways for flavour. | Elegant, but eight art pieces for one kind is a lot of drawing for one noun. |

**Recommendation: B**, and take the pin move deliberately in its own wave. It is one bit, it is
general, and it is the only option that makes `POTATO · SPOILED` behave like spoiled food —
which E1's spoilage-on-a-temperature-curve work wants anyway.

---

### **OD-4 — Where does the `wreck_threshold` live, and does it change existing ships?**

Defs are a **single global graph**; there is no per-ship def override, and `--ship` does not
select a `--data` directory. So a `wear.wreck_threshold` applies to grid, slice and the
scenario twin too.

- **Default 0.0** ⇒ inert by construction on every ship (no `Condition` is below 0), P1–P3
  guaranteed to hold, **but the wreck cannot use it** without a content-pack mechanism that does
  not exist.
- **Default ~0.25** ⇒ works everywhere, and **may move P1/P2/P3** — a `Fabricator` at
  `wear = 0.020/h` reaches 0.25 in ~37 sim-hours, inside the scenario twin's 3-day window, and
  the twin ship has no Fabricator but *does* have wearing devices and no Parts production.

**Recommendation: 0.25, measure, and take the pin move if it comes.** A def that is inert
everywhere is a def nobody tests.
**Cost:** one wave's worth of pin re-measurement.

---

### **OD-5 — Are the frozen crew authored people, or generated?**

The slice has eight hand-written `AuthoredPersona`s (`AuthoredShips.cs:577-790`); grid has none
and takes whatever `PersonaGenerator` produces. The wreck's eight are the emotional core of the
premise — the player thaws them one at a time and each is a decision about who they need next.

**Recommendation: authored, and written as a set** — a medic, an engineer, a hydroponicist, a
pilot — so that *who you wake* is a real choice. **Cost: eight persona sheets, and it is
writing, not engineering.** Note this collides pleasantly with W7: without skills, "who you wake"
has no mechanical consequence, only a narrative one. **If the owner wants the choice to matter
mechanically, W7 moves ahead of W8.**

---

### **OD-6 — Rename `ItemKind.Regolith`?**

Its own comment already calls it *"debris spoil from cleared sections"* (`ItemStack.cs:5`).
Pure rename, numeric value unchanged, **no pin moves** — but it touches the glyph table, the
client registry, four accept-mask derivations, `BuildSystem.Material`, the ledger's kind names
and every test string.
**Recommendation: yes, and do it in W3's wave** while the fiction is being written, or never.
**Cost: a mechanical rename across ~30 files, and one afternoon of test-string churn.**

---

### **OD-7 — Skin `'/'` (the open door).** *(already open; now blocking)*

`HANDOVER.md` has this as an art decision. **On the wreck it becomes structural**: which doors
are shut is the pressure frontier's readout, and today an open door draws nothing.
**Recommendation: skin it before W3 lands.** **Cost: one art piece.**

---

### **OD-8 — Does the wreck ship get an ice hold?**

The slice's costs 200 `ItemSpec` rows and one `IceMelter` (`AuthoredShips.cs:393-394`,
`:458-485`) and buys ~22.5 sim-days of water. Grid does not have one and its water is **still
conjured** by B-2's makeup floor — measured this run.
**Recommendation: yes, and put it behind the frontier** — a hold the player has to reach. It
turns the water faucet into a *goal* rather than a boot condition, which is exactly what the
wreck premise wants and what grid could never do.
**Cost: ~10 lines of authoring, reusing a shipped helper.** This also folds in the standing
question of whether B-2's makeup floor should stay on a ship that has a real water chain.

---

## 8. What I did NOT settle, deliberately

- The two in-flight lanes' internals (condition wire, wrecked art) — not mine to design.
- W7's data model. Charter only, per owner decision 4.
- The persona writing (OD-5).
- Any number in W3's damage pass — the count of wear-bearing devices on a wreck is
  **UNMEASURED** and must come from the built ship, not from me.
- Whether the thaw screen lives in the Room Zoom, the Overview, or the deferred Persona window.
  **`CREW_INTERACTION` is a pinned set and the Persona seam REPLACES `talkSelectedCrew` /
  `openBioForSelected` rather than joining them** — a thaw affordance is a *device* interaction,
  not a *crew* interaction, and W5 must argue that explicitly or it fails
  `client/test/surface-boundary.test.js`.

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

**UNMEASURED and labelled as such in the text:** the vent fill time (≈208 s, arithmetic over
`atmosphere.def:19`); the wreck's wear-bearing device count (~120); the self-heal total
(~30 crew-hours); thermal drift on an unpowered wreck compartment.
