# Factorio Fusion — the Advocate's verdict

*Written 2026-07-24 as the ADVOCATE lane for the director's "can we fuse Factorio into this?"
question. READ-ONLY design work; nothing built. A separate skeptic lane red-teams the same idea —
this document does not hedge into their job. It builds the strongest, most vision-compatible
version and shows the interlock. Binding context: `docs/VISION.md`, `docs/ECONOMY.md` (esp. §8),
`docs/ECONOMY-PLAN.md`, `docs/legacy/MOSS_SPEC.md`, `sim/Sim.Core/Systems/CraftingSystem.cs`,
`sim/Sim.Core/Defs/ProductionDefs.cs`.*

---

## 0. Thesis (5 lines)

1. **Factorio's magic is not belts — it is the production graph as a legible, diagnosable,
   balanceable object.** That primitive already has a home in this codebase (`ProductionDefs.cs`,
   the `[production]` node table) and survives translation whole.
2. **The belt/drone/inserter mechanism must be dropped** — `ECONOMY.md` §8 forbids it, correctly,
   because automating hauling deletes the crew from the screen (pillar 2, VISION §30).
3. **The automation the player earns here is CONTROL, not CONVEYANCE**: MOSS already scripts *when
   and how hard a device runs* (`MOSS_SPEC.md` §1), gated by an installed `ControllerModule`
   (`MOSS_SPEC.md`:74) — which is exactly the currency `ECONOMY-PLAN` E0-6 gives its one consumer.
4. **The RPG layer is load-bearing because the graph's edge weights live in a person's head**:
   pawn skill + held `Procedure` set each converter's yield-ratio and defect-rate (`ECONOMY.md`
   §6.4, E2), so "who runs the line" changes what the line produces.
5. **The fusion is real and buildable** as an extension of E0-6 + E2 + the E-MOSS lane, and it
   honours every anti-goal — no infinite scaling (E4 upkeep is a *rate*, `ECONOMY.md` §5), no crew
   invisibility, no spatial belt-porn.

---

## 1. What of Factorio's magic to import — primitives vs mechanisms

The director's instinct is right, but the thing worth importing has to be separated from its
famous packaging. Factorio ships *fun primitives* riding on *spatial mechanisms*. Only the
primitives survive contact with this game's pillars.

### 1.1 The fun primitives — all of these translate

| Factorio primitive | What it actually is | Does it survive here? |
|---|---|---|
| **Production-graph legibility** | You can *see* the whole chain: iron→plate→gear→belt, who feeds whom | **Yes, natively.** The graph is already data: `ProductionNode` is N-input/M-output with an explicit id and station (`ProductionDefs.cs:53-104`). The graph exists; it just has no *screen* yet — that is E0-8's ledger. |
| **Bottleneck diagnosis-and-solve** | "Why is my science stalled?" → walk the chain, find the starved node, fix the ratio | **Yes, and it is *sharper* here** because the constraint is triple: matter *and* crew-hours *and* Seals. `CraftingSystem` already exposes the failure shapes (a starved bill, a stranded input) at `CraftingSystem.cs:141-156`. |
| **Ratio balancing** | 2 furnaces feed 3 assemblers; get the numbers right and nothing starves or backs up | **Yes.** Loss is an integer input:output ratio by design (`ProductionDefs.cs:6-18` — `Scrap:20→Regolith:17` is exactly 85%). Balancing converter throughputs so nothing strands is *literally* the failure `ECONOMY.md` §8 describes (wrong-deck stockpile → material stranding). **⚠️ 2026-07-25:** ~~measured … −14% throughput~~ — §8's −14 % was **never reproduced** and the slice cannot settle it (`MECHANICS.md` §13.18). The *mechanism* stands and is what this row rests on; the number does not. |
| **Progressive capability unlock** | The tech tree; "just one more science pack" | **Yes, but re-shaped.** No research tree (`ECONOMY.md` §11 forbids it — global un-losable unlock is the opposite of knowledge-as-mortality). The unlock is **scriptability itself**: each device you bring under MOSS control costs a `ControllerModule` (`MOSS_SPEC.md`:74). "Just one more device under script" is the itch, and it has a real matter price. |
| **"Just one more factory" compulsion** | The dopamine of an expanding, self-running base | **Yes, bounded.** It survives as "just one more converter under script, just one more deck reclaimed" — but `ECONOMY.md` §5's superlinear upkeep (S1+S4) means every addition costs *rate*, so it never saturates into a free megabase (§5, and the E4 anti-goal in `ECONOMY-PLAN`:139). |

### 1.2 The mechanisms — all of these get dropped or replaced

| Factorio mechanism | Why it dies here | Replacement |
|---|---|---|
| **Belts** | Spatial matter-conveyance automation. `ECONOMY.md` §8: "Do not build belts… automating [hauling] away removes the thing that makes crew visible on screen." | **Crew hauling stays manual** (`CraftingSystem.StepFetch`, `CraftingSystem.cs:264-320`). The "logistics puzzle" moves from *routing belts* to *placing stations so crew walk less* — the pre-positioning-buffer finding (`ECONOMY.md` §8's stockpile-beside-the-bench). |
| **Inserters** | Machine-to-machine matter hand-off | Dropped. Staging tiles + crew carry (`CraftingSystem.cs:29-31`). |
| **Logistic/construction drones** | Deletes the hauler entirely | **Explicitly forbidden** (`ECONOMY.md` §11). The hauler is a named person. |
| **Infinite scaling / megabase** | Factorio's endgame *is* unbounded throughput | **Dropped as the failure mode to avoid** (`ECONOMY-PLAN`:138-140 names it by name). Upkeep as a rate is the escape. |
| **Spatial factory-porn** | The base *is* the art | Dropped. The art is the ship and her people (VISION §180-204). The "your base is yours" satisfaction is answered by refit + the Chronicle (VISION §125-151), not by belt spaghetti. |

**The one-sentence separation:** *Import the graph, the bottleneck loop, the ratio math and the
unlock compulsion; drop the belts, the drones and the infinity.* Everything below is how.

---

## 2. The crux — reconciling with §8's anti-logistics-automation decision

This is the section the whole evaluation turns on. `ECONOMY.md` §8 is not a soft preference; it is
a *measured* decision ("automating it away removes the thing that makes crew visible on screen —
which was round 3's complaint"). The advocate's job is not to override it. It is to show that
**Factorio's automation satisfaction lives in a different organ than the one §8 protects**, and
that this game already has that organ half-built.

### 2.1 The category error §8 quietly exposes

Factorio conflates two things that are separable: **conveyance** (moving matter between machines)
and **control** (deciding when, how hard, and under what conditions a machine runs). A belt does
both — it moves the plate *and* encodes the policy "feed the assembler continuously." Factorio's
players *think* they are enjoying the conveyance; what they are actually enjoying is authoring the
*control policy* and watching it execute. The belt is just the control language's syntax.

**PERILUNE already has a control language, and it is not belts. It is MOSS.**

MOSS scripts a device's duty cycle from live sim state: `every 5s: if hab3.co2 > 5000ppm:
set(scrubber_hab3.rate, max)` (`MOSS_SPEC.md`:15-17). It is edge-triggered, bounded, deterministic,
saved and hashed (`MOSS_SPEC.md`:47-54). It reads room gas, device state, and `ship.*` dashboards
(`MOSS_SPEC.md` §4). It commands through the same adapters the console prompt uses
(`perilune-moss-terminal.spec.md`:159-174). This is *exactly* the "author a policy, watch it run,
tune it" loop — with zero conveyance.

### 2.2 The reconciliation, mechanically

> **Conveyance stays crew labour (§8 satisfied). Control becomes the automation game (Factorio
> satisfied). The scarce resource that gates control is `ControllerModule`/`Circuits` (E0-6/E2).
> The payoff is freeing scarce crew from babysitting duty cycles so they do higher-value work —
> so labour stays the binding constraint and crew stay on screen.**

Three moving parts, each already scheduled:

1. **`CraftingSystem` already auto-runs the machine.** A powered station "wants to run its recipe
   whenever inputs exist" (`CraftingSystem.cs:8-11`) and recruits its own worker
   (`CraftingSystem.cs:158-166`). So the *machine* is automated; the *hauling* is not. This is the
   §8-legal split, already in the code. What is *missing* is player control over the machine's
   policy — and that is what MOSS adds.

2. **The `ControllerModule` gate turns "script this device" into a matter decision.** Today a
   device is MOSS-addressable only with a controller module installed (`MOSS_SPEC.md`:74:
   "scriptability is a resource, not a menu"). `ControllerModule` is the terminal product of the
   very chain the player is running (`recipes.def:22`: `MachineShop Parts:2 → ControllerModule:1`)
   and currently has **zero consumers** — an accident `ECONOMY.md` §1.1 calls a matter incinerator.
   E0-6 gives it its one consumer: *scriptability gating* (`ECONOMY-PLAN`:79). So **automating your
   production costs you production output.** That is a Factorio decision — "do I spend the plate on
   a new assembler or on more science?" — rendered in this game's currency.

3. **The payoff is legible and crew-preserving.** A scrubber scripted to run only above 1,200 ppm
   halves its wear *and* its power draw (`ECONOMY.md` §2.2). The crew member who would otherwise be
   walked to that scrubber every service call (`MaintenanceSystem`, `MachineWearSystem.cs:92-211`)
   is freed — not deleted — to do the higher-value work the labour ledger is starving for
   (`ECONOMY.md` §1.7: the economy consumes 0.7% of labour today; §6.1 wants 15-35%). **MOSS buys
   duty cycle, never matter** (`ECONOMY.md` §2.2). The hauler still hauls; the machinist still
   machines; the scrubber-servicer is redeployed, not removed.

### 2.3 Why this is *more* Factorio, not less

Factorio's control layer is spatially expressed and therefore capped in expressiveness — a belt
can encode "feed continuously," a splitter "balance two ways," a circuit network a little boolean
logic. MOSS is a real (bounded) language: conditionals, thresholds, edge triggers, `every` timers,
ship-wide readouts (`MOSS_SPEC.md` §2-3). The player can encode policies Factorio's belts cannot:
*"run the recycler only when the Scrap buffer is below 20 AND no builder is waiting on Regolith"* —
which is literally the hand-coded priority the sim enforces today at `CraftingSystem.cs:412-418`
(`FetchBlockedForBuilds`), but authored by the player instead of the engine. Handing that decision
to the player *is* the automation game.

And the failure modes are already wired for drama: a stripped device un-registers its MOSS adapter,
so you can break your own automation by deconstructing a valve (E0-5, landed — `CLAUDE.md` status;
`ECONOMY.md` §9.3). A wrong script poisons the aft crew (§2.2's scrubber, inverted). Automation
here has *stakes* Factorio's belts never carry, because the machine is keeping people alive.

---

## 3. Where pawn SKILL leverages it (the RPG layer, load-bearing)

The director's third ingredient — "leveraged by the skill of a pawn" — is where this stops being
ONI-with-scripting and becomes PERILUNE. The differentiator `ECONOMY.md` §2.2 already commits to is
"the efficiency of every conversion is a fact held in a living person's head." Factorio has no
person; its assembler runs at a fixed rate forever. Here the graph's **edge weights are people.**

Three hooks, all scheduled for E2 (`ECONOMY-PLAN`:90-96), all making the RPG layer mechanical:

### 3.1 Skill sets the converter's yield-ratio and defect-rate

`ECONOMY.md` §6.4 mechanism 1: every conversion carries `yield` and `defect_chance` modulated by
the worker's skill *and* whether they hold the relevant `Procedure`. Unskilled + no procedure →
55% yield, 20% defect; skilled + procedure → 105% yield, 1% defect. This maps directly onto the
production graph: the *same* `ProductionNode` (`ProductionDefs.cs:53`) produces different real
output depending on who is bound to the station via `JobKind.Craft` (`CraftingSystem.cs:161`).

**A defective Part installs normally and fails early** (`ECONOMY.md` §6.4) — surfacing as a *later*
crisis through the existing wear/failure path (`MachineWearSystem.cs:76-87`). This is the
no-random-events pillar (VISION §32-35) working *for* the fusion: bad work is not a dice roll, it
is a deterministic time bomb you can trace back to who staffed the bench.

**Determinism constraint the advocate accepts and designs around:** `ProductionDefs` is
deliberately float-free (`ProductionDefs.cs:42-51`), and `ECONOMY-PLAN` §4 trap 7 forbids a
per-pass float multiplier (`station.Progress += 1f / WorkSeconds` is order-fragile). So skill must
select among **integer-ratio bill variants once per completed batch**, or drive a per-batch
forked-RNG defect roll — never a per-pass float. The best version: a node declares a *skilled* and
*unskilled* output ratio, and the worker's skill picks which fires at completion
(`CraftingSystem.cs:187-201`, the single completion point). Clean, hashable, float-free.

### 3.2 Maintenance quality is personal — and it moves a line on the ledger

`ECONOMY.md` §6.4 mechanism 2 + the existing `MaintenanceSystem`: today a serviced machine goes to
`Condition = 1f` with parts or `JuryRigCondition` (0.6) without (`MachineWearSystem.cs:257-261`).
E2 makes the *full* overhaul personal: the specialist restores to 1.0 *and resets the wear clock*;
a stranger restores to 0.85. When the specialist dies, the ship's Parts consumption measurably
rises (`ECONOMY.md` §6.4). **Knowledge-as-mortality becomes a slope on the E0-8 ledger you can
watch move** (VISION §80-83; the ledger is `ECONOMY-PLAN` E0-8). This is the RPG layer as an
*economic input*, not a stat readout — the thing §2.2 says nobody in the genre does.

### 3.3 Automation quality is itself skill-gated — the fusion's keystone

Here is the move that ties all three ingredients (resource management + automation + RPG) into one
knot: **MOSS lets you *assign eligibility*, but the person still sets the quality.** A script can
say "run this MachineShop bill," but the bill's yield depends on who the dispatcher binds to it. So
the player's automation policy and the crew's skills *compose*: you script *which* line runs and
*when*, and you staff it with *who* — and getting a scarce specialist onto your highest-value
converter, then scripting the low-value converters to run only when she is idle, is the strategic
core. Conversation gets economic content here too (§6.4 mechanism 3): *"Amara, would you write down
how you run the recycler?"* becomes a real request producing a `Procedure` that survives her and
lifts the yield of whoever holds it — unblocking the `AgreeTask` verb that is `Dig`-only today
(`EffectValidator.cs:110`, per §6.4).

---

## 4. The concrete mechanic — one buildable slice

**Name: "The Scriptable Converter Line."** It extends E0-6 (the `ControllerModule` consumer + `Seals`
+ conversion loss) and reaches forward into E2 (skill yield/defect) and the E-MOSS lane (read-only
`stock.*`/`prod.*` adapters, `ECONOMY-PLAN`:156). The production-graph substrate it needs already
exists (W0-5, `ProductionDefs.cs`). Nothing here invents a new spine file.

### 4.1 The loop

The player runs the shipped chain — `Regolith → Scrap → Parts → ControllerModule`
(`recipes.def:20-22`) — feeding it from deconstruct (E0-5, landed) and the ice/forward-hold cargo
(E0-7). Each converter is a `Device` running a standing bill (`CraftingSystem.cs:102-116`). To bring
a converter *under script* — so MOSS can gate its duty cycle from live state — the player installs a
`ControllerModule` in it (`MOSS_SPEC.md`:74). Then they author a policy:

```
# Player-authored, on the fab-deck terminal
every 10s:
  if scrap.buffer < 20 and not builders.waiting_regolith:
    set(recycler_1.enabled, true)
  else:
    set(recycler_1.enabled, false)
```

(`scrap.buffer` and `builders.waiting_regolith` are the new read-only `stock.*`/`ship.*` bindings
the E-MOSS lane exposes over the E0-8 ledger; `recycler_1.enabled` is the one new *actuator* verb —
a bill gate, not a matter mover.)

### 4.2 The scarce inputs (all four ledgers bind)

- **`ControllerModule`** — the terminal product of the chain itself. Scripting a device *spends the
  output you were building the chain to make.* (E0-6 consumer.)
- **`Circuits`** — not manufacturable early; salvage and trade only (`ECONOMY.md` §3.1 T2, E2). Gates
  how many `ControllerModule`s can ever exist → a hard ceiling on how much of the ship is ever
  scriptable. This is the "tech gate" without a tech tree.
- **`Seals`** — every scripted device's duty cycle still burns the never-ending maintenance drain
  (`ECONOMY.md` §5 S1, E0-6). Automation does not stop upkeep; it *reshapes* it.
- **Crew-hours** — the binding constraint (`ECONOMY.md` §1.7). Every haul, craft and repair on the
  line is still a person walking (`CraftingSystem.cs:264-320`).

### 4.3 The skill hooks

The bound worker's skill + held `Procedure` picks the converter's output ratio at batch completion
(§3.1, `CraftingSystem.cs:187-201`), and a defective batch seeds a later machine failure
(`MachineWearSystem.cs:76`). The specialist's maintenance resets the wear clock (§3.2). MOSS gates
*which line runs when*; the roster decides *how well.*

### 4.4 The automation surface

Read-only ledger bindings (`stock.*`, `prod.*`, existing `ship.*`) + one actuator: `set(dev.enabled,
bool)` as a bill gate. No new conveyance, no matter-moving verb — `CitizenEffects` never gets a
resource effect (`ECONOMY.md` §9.5). The MOSS terminal IDE to author it already ships
(`perilune-moss-terminal.spec.md`, the PROGRAM pane).

### 4.5 The failure / decision moments

- **Install the `ControllerModule` or bank it?** Scripting deck-3's recycler costs the module you'd
  have traded for `Circuits`. (The Factorio "science-or-expansion" fork, in ship currency.)
- **Trust the script through a crisis?** A scrubber scripted to idle below 1,200 ppm saves wear and
  power (§2.2) — but if the forecast is wrong the aft crew breathe poison while the script waits.
- **Staff the good line or the scripted line?** Your specialist lifts the MachineShop's yield, but
  she is also the only one who resets the reclaimer's wear clock (§3.2-3.3).
- **Strip a scripted device and you break your own automation** — the adapter un-registers (E0-5,
  landed; `ECONOMY.md` §9.3). Selling a valve silently kills the script that read it.

### 4.6 The acceptance shape

This slice is *felt* when a playtester says "I scripted the recycler to back off so the builders
could eat, and when Amara died the Parts started piling up wrong" — which fuses `ECONOMY.md` §12.2's
falsifiable tests #2 ("when Amara died our parts consumption went up") and the automation payoff into
one sentence. Measured gates it must not regress: A1 (busy-fraction > 25% at hour 24) and the
conservation property (`ECONOMY.md` §12.1 A1/A5) — automation must free labour *and* keep the mass
ledger exact.

---

## 5. The anti-goals I accept (explicitly)

1. **No infinite scaling.** Every scripted, running device burns `Seals` forever (§5 S1) and every
   pressurised deck leaks (S4). Upkeep is a **rate, not a threshold** (`ECONOMY.md` §5;
   `ECONOMY-PLAN`:138-140 names Factorio's megabase saturation as *the* genre failure to avoid). The
   `Circuits` ceiling caps how much is ever scriptable. You cannot build a self-running base that
   coasts — the graph you automate is the graph you must keep feeding and maintaining.
2. **No crew invisibility.** MOSS automates *control*, never *conveyance*. Every input is still
   carried by a named person (`CraftingSystem.cs:264-320`); automation *redeploys* crew to
   higher-value work, it never removes them (§2.2). Belts/drones stay forbidden (`ECONOMY.md` §11).
3. **No spatial belt-porn.** No belts, inserters, splitters or logistics networks. The spatial layer
   stays rooms, staging tiles and crew paths. The "logistics puzzle" is station placement to shorten
   walks (`ECONOMY.md` §8's pre-positioning-buffer), not routing.
4. **No research tree.** The unlock is scriptability-per-device (matter) + found/taught `Procedure`s
   (knowledge-as-mortality), never a global un-losable tech tree (`ECONOMY.md` §11).
5. **No second faucet, no matter from MOSS.** Automation buys duty cycle, never matter (§2.2). The
   voyage stays the only faucet (§2.1).

---

## 6. Honest risks — even in the best version

1. **[BIGGEST] The automation is textual, and Factorio's magic is that it is *visual*.** A belt is
   legible at a glance to anyone; a MOSS script is a program. Factorio broadened the automation
   audience precisely by making the control layer spatial and wordless. Replacing that with a
   language — even a bounded, readable-aloud one (`MOSS_SPEC.md` §0) — lands the fusion for the
   engineer half of the audience (VISION §48-51 explicitly targets them) and risks bouncing off
   everyone else. The mitigation is real but partial: the MOSS terminal already surfaces the whole
   ship as a legible dashboard (`perilune-moss-terminal.spec.md`), and the *ledger-balancing* half
   of the fusion (§1.1 ratio math) is visual and needs no scripting at all — so a non-programmer can
   still play the resource-management-and-diagnosis game and only engineers script the control layer.
   But the honest statement is: **this fusion makes the *automation* pillar an engineer's pillar,
   where Factorio made it everyone's.** Sell the graph-balancing loop as the mass-audience hook and
   MOSS-scripting as the depth ceiling — not the other way round.

2. **Machine-level production is *already* automated, so the marginal "set it and forget it" thrill
   MOSS adds may feel thin.** Standing bills already self-run and self-recruit
   (`CraftingSystem.cs:8-11,158-166`). The genuinely *new* fun has to come from the ledger-balancing
   + skill-quality + duty-cycle-control layers, not from "scripting a machine to run" — because the
   machine already runs. If the team pitches this as "now your factory runs itself," players will
   find the factory is three benches that already ran themselves. Pitch it as *"now you control the
   policy and the people behind the numbers."*

3. **`Circuits` scarcity could strangle the whole organ.** If `Circuits` (salvage/trade only, E2)
   are too scarce, most players never mint a `ControllerModule` for scripting and the automation
   layer stays the niche toy MOSS somewhat already is. Too abundant and the `ControllerModule`
   decision (§4.5) evaporates. This is a tuning knife-edge with no shipped data — it needs the E2
   measurement pass, and it interacts with the voyage cadence (`ECONOMY.md` §10).

4. **Skill-modulated yield is a determinism trap wearing a feature's clothes.** The obvious
   implementation — a float yield multiplier — is exactly what `ProductionDefs.cs:42-51` and
   `ECONOMY-PLAN` §4 trap 7 forbid. The best version (integer-ratio bill variants selected once per
   batch, §3.1) is clean but constrains how *granular* skill can feel: you get "unskilled ratio" vs
   "skilled ratio," not a smooth curve. Acceptable, but a real expressiveness cost the design must
   own up front.

5. **The fusion's payoff depends on E0-8 shipping a *truthful* ledger first.** Ratio-balancing and
   bottleneck-diagnosis are invisible without per-converter rate displays, and today `ShipMetrics`
   *lies* (`ECONOMY.md` §7.3: `Food` reads 1.00 while food production is dead). If E0-8 ships before
   the automation layer and ships honest, the fusion has its screen; if it slips, the "Factorio
   diagnosis loop" has nothing to diagnose against. Hard dependency, correctly ordered in
   `ECONOMY-PLAN` (E0-8 precedes E2).

---

## 7. Verdict

**Import it — but import the graph, not the belts.** Factorio's genuinely great primitive is the
production chain as a legible, diagnosable, balanceable object, and this codebase already holds that
object (`ProductionDefs.cs`) waiting for a screen. The automation-satisfaction half survives *only*
if it is re-seated from conveyance (which §8 rightly forbids) into control (which MOSS already is),
gated by the scarce `ControllerModule`/`Circuits` currency E0-6/E2 already schedule, and made
RPG-load-bearing by skill setting the graph's edge weights (E2). Built that way, the fusion needs no
new spine file, breaks no invariant, honours every anti-goal, and turns three existing-but-disjoint
systems (the production graph, MOSS, and the unbuilt skill layer) into one knot that is more
recognisably *this game* than any of them alone. The single thing to go in eyes-open about: this
makes the automation pillar an engineer's pillar. Lead with the balancing loop for everyone;
let MOSS be the depth ceiling.
