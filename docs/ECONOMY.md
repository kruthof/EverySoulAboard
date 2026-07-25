# PERILUNE — The Economic System

*Design authority for matter, labour and value. Written 2026-07-22 against `main` @ `3efd181`,
synthesised by the integrator from five independent read-only review lanes (audit of the
current economy, logistics & labour, comparative genre design, external supply, architecture
& invariant cost). Companion: `ECONOMY-PLAN.md` (how and in what order).*

*Relationship to the other docs: `VISION.md` says what the game is; this document says what its
economy is and why. `MECHANICS.md` remains the authority on what is **implemented today** — and
§1 below is a measured indictment of exactly that. Nothing in this document is built. Where a
number is marked MEASURED it was observed on the shipping slice this session; where it is
marked PROPOSED it is a design target that has not been tuned against a running game.*

---

## 0. How to read this

Sections **1–2** are the diagnosis and the axiom — read them even if you read nothing else.
Sections **3–8** are the design. Section **9** is the voyage. Section **10** collects every
proposed number in one place so tuning has a single home. Sections **11–13** are scope
discipline, acceptance tests, and the decisions that are Garvin's, not mine.

Three phrases are used precisely throughout:

- **Faucet / source** — something that puts matter into the world.
- **Drain / sink** — something that takes matter out, permanently.
- **Cycle** — a loop that returns matter at less than 100 %; the loss is the drain.

---

## 1. The diagnosis — what the measurements actually say

Three ledgers run in any colony sim: **mass**, **energy**, **time**. Perilune fails all three,
and it fails the time ledger by three orders of magnitude. Every figure here was MEASURED this
session against the real 24-system host stack with shipped defs, booting
`AuthoredShips.PeriluneSlice()` — the exact `--ship slice` configuration a player runs.

### 1.1 The mass ledger dies at 64 sim-minutes

The slice's entire lifetime stock of build material is **62 units of Regolith** — 14 authored
plus 1 per debris tile from a 48-tile field (`JobSystem.cs:542`). There is no other source of
it anywhere in the codebase.

| event | tick | sim-time |
|---|---|---|
| all 48 debris tiles cleared | 1,416 | **2.36 min** |
| free Regolith first hits zero | 38,451 | **64.1 min** |
| ControllerModule count reaches its terminal value (31) | ~39,600 | ~66 min |

Then nothing, for the remaining 70 sim-hours.

**The headline consequence.** Three walls designated at tick 3,000 complete in 733 ticks
(73 s) — the round-3 build fix genuinely works. The same three walls designated at day 1 sit
at **0/6 material for two further sim-days and forever after**. The player's only economic
verb on the shipping client (`build wall|door|cancel` is the entire web command surface,
`GameSession.cs:955-987`) is functional for about an hour and then *permanently inoperative*.
Not slow — impossible.

**Two of seven `ItemKind`s are dead.** `MetalOre` has no producer and no consumer anywhere.
`ControllerModule` — the terminal output of the whole three-stage chain — has **zero
consumers**; 31 units accumulate on one tile and do nothing. The chain is a matter
incinerator, and it is what ate the player's build material.

### 1.2 The energy ledger is an accident

Generation is a constant **12.0 kW** (2 × SolarWing, summed condition-blind and
operational-blind, `PowerSystem.cs:185`) against **19.1 kW** of demand. Idle crafting stations
draw their full 6.5 kW whether or not anyone is at the bench (`IsWanting`,
`PowerSystem.cs:262-266`). Both batteries read **0.0 kWh from day 0.3 onward, forever**.

Industry still runs ~62 % of the time because the 1 Hz balance loop flaps charge/discharge on
a one-second sawtooth. **That sawtooth is the entire industrial throttle in the game**, and it
is a bug shape, not a knob.

### 1.3 The time ledger is the real catastrophe

| window | economic work | wander-walking | idle |
|---|---|---|---|
| 3 sim-days, 8 crew | **0.503 %** | **79.80 %** | 19.69 % |

All three haul `JobKind`s: **exactly 0 ticks in 3 sim-days.** Over 3 days the ship's total
productive labour is ~29 crew-hours out of 576, and 81 % of it happens in the first hour.
Instantaneous busy-fraction is 0.0 % in every 30-minute bucket after sim-minute 100.

Two structural causes, both measured, neither previously recorded:

**(a) Wander pre-empts work — the effective crew is 1.43 people, not 8.**
`IsIdleForWork` (`Citizen.cs:63`) requires `!HasPath`, so a citizen mid-wander is
unrecruitable by *all four* dispatchers. `TryRandomWalkableTile` (`PathService.cs:77-89`)
samples uniformly from the entire world, all decks.

| | shipped (`ticks_per_tile=5`) | after the proposed movement retune (`=10`) |
|---|---|---|
| crew-ticks recruitable | **17.9 %** | 9.3 % |
| crew-ticks locked in a wander leg | **71.7 %** | 76.1 % |
| ticks with **zero** recruitable crew | **21.1 %** | **46.1 %** |
| mean wander lock-out | 14.9 s | 30.7 s |

**(b) Hauling already dominates, and concurrency is capped at `#stations`.**
On-job time is **47.2 % travel / 52.8 % work**; haul jobs are 100 % travel. One
`ControllerModule` costs 261 tiles of walking (130 s) against 140 s of bench work. Crafting
allows exactly one worker per station (`CraftingSystem.cs:397-406`); measured maximum
concurrency **3**, with 57.4 % of ticks at exactly two crew working and six idle. Adding crew
changes nothing.

### 1.4 Only one resource is conserved, and it has no source

| resource | verdict |
|---|---|
| Air (O₂/N₂) | **conjured** — `AirVent` injects from an explicitly infinite reserve (`Device.cs:6`, `AtmosphereSystem.cs:41-50`) |
| CO₂ | **destroyed** — a scrubber deletes it; no filter saturation, no captured-carbon stock (`AtmosphereSystem.cs:34-36`) |
| Heat | conjured and destroyed |
| Power | constant source, no fuel, no day/night |
| **Water** | **conserved, and strictly monotone decreasing** — no ice, no melter, no electrolyser, no resupply |

The water arithmetic is exact and damning. A round trip through a grow bed returns
0.8 × 0.93 = **0.744**, i.e. **0.256 L destroyed per litre irrigated**. MEASURED: 3,384 L
irrigated over 28 sim-hours destroys 866 L, plus 37 L of drinking loss = **903 L of the ship's
1,400 L**, matching the observed 1400 → 497 exactly. `tank_hydro` reads **0.0 L** from day 1.2
and the three grow beds freeze mid-crop, forever. Food production is permanently dead on
day 1.2 while the HUD food bar reads **1.00** (it saturates at 40 potatoes for 8 crew,
`ShipMetrics.cs:83`).

### 1.5 Three live defects that are not design problems

These are bugs on the shipping build. They must be fixed *before or alongside* the economy,
never *by* it.

1. **An ownerless reservation leak, live on the slice.** `CraftingSystem.cs:183` stamps a
   staged input `ReservedForJob = true` as "the station's claim", but `ItemStack` has no owner
   field and the only code that clears the flag is `ConsumeStagedInputs`. MEASURED at tick
   108,000: the ship's **last remaining `Parts` unit is reserved by nobody**, invisible to
   `MachineWearSystem.FindNearestParts` (`:369`) but visible to `StagedUnits` — so the
   MachineShop waits at 1/2 forever and **every machine repair for the rest of the game is a
   jury-rig at `Condition = 0.6`**. That is the exact failure the round-3 review fought,
   arriving through a different door. Root cause: `ReservedForJob` is a `bool` where it needs
   to be an owner id.
2. **Hydroponics is the water leak** (§1.4). Not a balance nit — it kills the food loop on
   day 1.2 with no player-visible signal.
3. **CO₂ transport** — already on record from round 3 (`HANDOVER.md`): `FlowAcrossDoor` has no
   diffusion term, so scrubber rooms sit at 0 ppm while the crew corridor climbs to 17,644 ppm.

Two further **latent** defects, harmless today and fatal later: the item hash pack aliases
`ItemKind`'s high bit onto `ReservedForJob` (`Simulation.cs:272-275`), and the citizen job pack
overlaps `JobWorkTicks` with `CarryingItemId` on bits 32–47 (`:255-260`). Neither breaks
determinism; both make the canary **blind** in precisely the fields an economy stresses.

### 1.6 And CI never sees any of it

The 2-crew reference ship has zero designations and `HoldPosition` crew: zero digs, zero
crafts, zero builds, ever. `RegProd = 0, RegCons = 0` after a full sim-day. **Every economic
behaviour measured above is protected only by the slice golden, which `ci.sh` does not run.**

### 1.7 The finding that constrains every proposal below

Price the *entire* proposed economy — every recipe, every maintenance call, every haul — at
today's work rates:

| activity | crew-s/day |
|---|---|
| maintenance (10.6 jobs) | 850 |
| crafting (~10.6 batches) | 530 |
| harvest + cook + haul food | 800 |
| hauling everything else (~60 trips) | 2,700 |
| **total** | **≈ 4,900** |

Against 8 crew × 86,400 s = **691,200 crew-s/day**, that is **0.7 %**.

> **No number of new item kinds fixes an economy that consumes 0.7 % of the labour supply.**
> The mass ledger is not the bottleneck. The labour ledger is. Every genre incumbent gets its
> labour sink from *construction, growing and hauling* at human-legible work rates — not from
> upkeep. This inverts the natural order of work: **fix labour supply and work rates first,
> then matter.**

---

## 2. The axiom and the differentiator

### 2.1 The axiom

> **The hull is a closed thermodynamic box. Every gram aboard came through an airlock.
> Entropy converts ordered mass into disordered mass at a rate proportional to how much ship
> you are keeping alive. The voyage is the only faucet.**

Everything below derives from that sentence. It is also a hard honesty contract: if a system
would create matter from nothing, it is wrong, and the fix is a supply line, not a bigger
number.

### 2.2 The differentiator

Five candidates were evaluated. The pick is the **product of two**:

> **PERILUNE's economy is a closed mass ledger with the voyage as its only faucet, where the
> efficiency of every conversion is a fact held in a living person's head.**
>
> RimWorld asks *what will you build?* PERILUNE asks *what will you take apart, who still
> knows how, and what does it cost to keep what you already have?*

Why the pair and not either alone:

- **Closed mass alone is ONI with a smaller asteroid** — a fair-fight loss against a decade-old
  incumbent with better thermodynamics. (ONI also cheats: its asteroid is effectively infinite
  mass, so scarcity there is convenience and heat, not inventory.) Our world is 64×20×2 tiles —
  finite by construction and small enough to *display*. A ledger reading *"Metal: 3.4 t — 1.9 t
  installed, 0.8 t stock, 0.3 t swarf, 0.4 t unrecovered"* is a screen no competitor can show.
- **Knowledge alone is a stat modifier** — RimWorld skills with extra steps, invisible without
  a ledger to move. Nobody in the genre makes knowledge a *losable, teachable, documentable,
  lootable economic input*. RimWorld has skills (a number on a pawn) and research (a global
  unlock that cannot be lost). DF has legendary craftsdwarves (a value multiplier).
- **Together they pose a decision RimWorld structurally cannot:** *this compartment is worth
  400 kg of stock; taking it apart costs six days of Okonkwo's hands, and she is the only
  person who knows the reclaimer.* Mass, labour and mortality in one choice.

Two supporting angles, deliberately kept in the weak form:

- **MOSS buys duty cycle, never matter.** A scrubber scripted to run only above 1,200 ppm
  halves its wear *and* its power draw. If MOSS could produce matter it would become
  Factorio-with-worse-belts and would automate away the people, killing pillar 2.
- **The Chronicle records the ledger.** *"Day 214 — we spent the last of the Kestrel's plate on
  the aft bulkhead"*, in the quartermaster's voice.

### 2.3 The economic identity of the ship

The hardest question in the whole design is *what does a drifting ship sell?* The answer, and
it is already half-built:

> **She is a machine shop that eats derelicts, and a water hauler that knows where the comets
> are.**

She does not mine value, she **refines** it: Scrap → Parts → ControllerModule already exists
(`recipes.def`), and controller modules are canonically scarce and universally wanted. Her
secondary exports are her own past cargo (she is a GDD-canonical ice-and-concentrate hauler)
and **her crew's expertise as a service** — which makes losing a specialist an event on the
balance sheet as well as in the Chronicle.

---

## 3. The resource model

### 3.1 Five tiers

**T0 — Conserved substances.** Pools, not items: room gas nodes, tanks, the mass ledger.
Gas (O₂/CO₂/N₂ + a finite bottled reserve), water (potable / grey / ice), metal (distributed
across structure / scrap / stock / parts / swarf), volatiles (biomass / food / waste / carbon).

**T1 — Feedstocks.** Bulk, fungible, stockpiled, hauled: `Regolith` (the build stock),
`Scrap`, `Ice`, `MetalOre`.

**T2 — Components.** The maintenance currency, deliberately at two turnover speeds:
- `Seals` — cheap, high-turnover. The filters-and-gaskets tier. Every scheduled service burns
  one. **This is the drain that never stops.**
- `Parts` — mid-value; restores a machine to Condition 1.0.
- `Circuits` — scarce, not manufacturable early. Gates `ControllerModule`, i.e. gates MOSS
  scriptability. This is where `ControllerModule` finally earns its place in the chain.

**T3 — Installed capital.** Devices, walls, doors, conduit, pipe. Mass locked away.
Deconstruction returns a fraction as `Scrap`. **Deconstruct is a first-class verb.**

**T4 — Non-fungible.** No stack count, not bulk-haulable:
- **Procedures** — knowledge as a physical document. Lootable, burnable, and the only way
  knowledge outlives its holder.
- **Crew skill and held knowledge** — §6.4.

### 3.2 The item kinds, staged

`ItemKind` is a byte enum in a hashed save (`ItemStack.cs:3-12`). **Append only; never
renumber.** Ten new rows plus one revival, deliberately spread across phases so each lands
with its consumer in the same commit:

| # | kind | phase | producer | consumer |
|---|---|---|---|---|
| 0–6 | *existing* | — | — | `ControllerModule` gains its consumer in E2 |
| 7 | `Seals` | E0 | Fabricator | every scheduled maintenance call |
| 8 | `Ice` | E0 | authored hold cargo; later a comet harvester | `IceMelter` → water network |
| 9 | `Swarf` | E1 | maintenance and machining residue | recycler, at a loss |
| 10 | `Meal` | E1 | Galley (cook step) | eating |
| 11 | `Volatiles` | E1 | GasPlant | refills the finite vent reserve |
| 12 | `Procedure` | E2 | a crew member spending hours writing | teaching; conversion yield/defect |
| 13 | `Circuits` | E2 | not manufacturable early — salvage and trade only | MachineShop → ControllerModule |
| 14 | `Propellant` | E3 | Electrolyser (water + power) | burns, station-keeping, sorties |
| 15 | `Concentrate` | E3 | authored hold cargo only | **nothing in-sim** — pure export |
| 1 | `MetalOre` *(revive)* | E3 | asteroid strip, derelict stripping | SalvageRecycler at a better ratio than rubble |

`Compost` and a nutrition model are deliberately **not** in v1 (§11).

**Naming note.** `Regolith` is a legacy lunar name on a starship. It should be *aliased* in
presentation (to `Stock` or `Plate`), never renumbered — enum row 0 is load-bearing in every
save. Deferred as a cosmetic decision (§13).

---

## 4. The conversion graph

```
        ╔═════════════ THE VOYAGE — the only faucet (E3/P3) ═════════════╗
        ║  comet / ice field      derelict hull        tramp rendezvous  ║
        ║      │ Ice, N₂              │ Scrap, Parts,       │ Circuits,  ║
        ║      │                      │ Ore, Procedures,    │ medicine,  ║
        ║      │                      │ people              │ people     ║
        ╚══════╪══════════════════════╪═════════════════════╪════════════╝
               v                      v                     v
 ┌───────────────────────────── THE HULL (closed) ──────────────────────────────┐
 │                                                                              │
 │  ICE ──melter──> WATER ─┬── drink ─────> GREY ──reclaimer 93%──┐             │
 │                         │                                      ├──> WATER    │
 │                         ├── irrigate ──> BIOMASS ──harvest─────┤   (−7%)     │
 │                         │        (−7% transpiration, retuned)  │             │
 │                         └── electrolyse ──> O₂ + H₂ ──> PROPELLANT           │
 │                                                                              │
 │  BIOMASS ──cook (labour)──> MEALS ──eat──> WASTE ──> reclaimer               │
 │                     └── spoil (temperature curve) ──> waste                  │
 │                                                                              │
 │  O₂ ──breathe──> CO₂ ──scrubber──> CARBONATE ─┬─ regenerate (+H₂, power) ──> O₂
 │                                                └─ VENT ──> LOST FOREVER      │
 │                                                                              │
 │  DEBRIS / SEALED DECKS ──cut (labour)──┐                                     │
 │  HULK SALVAGE (E3) ────────────────────┼──> SCRAP ──recycler 85%──> STOCK    │
 │  DECONSTRUCT 70% ──────────────────────┘        ^                    │       │
 │                                                 │                    ├─fab─> SEALS
 │                                       SWARF ────┘ (recycle 60%)      ├─fab─> PARTS
 │                                         ^                            └─shop─> CTRL
 │                                         │                              (+CIRCUITS)
 │  WALLS / DOORS / DEVICES <──────────────┴── wear ── PARTS + SEALS ──maintenance
 │        ^                                                                     │
 │        └──────────── build (STOCK) ────────────                              │
 └──────────────────────────────────────────────────────────────────────────────┘
   permanent losses: reclaimer 7% · transpiration 7% · recycler 15% · swarf 40% ·
   deconstruct 30% · hull leak · airlock cycling · vented carbonate · corpses
```

Read it as **three cycles and one arrow**:

- **The water/air cycle** is nearly closed and leaks a small constant amount. It sets the
  **voyage cadence**.
- **The metal cycle** is lossy at every hop, and its consumer is machine wear, which scales
  with how much ship you keep running. It sets the **salvage cadence**.
- **The biological cycle** turns water + power + labour into calories; it is the
  labour-heaviest loop and the one population growth taxes directly.
- **The one arrow in from outside is the voyage.** That is the whole design.

### 4.1 The graph is a redesign of the recipe table, not a field addition

`Recipes` is `new RecipeDef[d.Machines.Length]` indexed by `(int)DeviceKind`
(`SimDefs.cs:558`), single-input/single-output, and `[recipes]` rows keyed by station name
**overwrite each other**. A many-node graph cannot be expressed in it. The fix is additive —
keep `Recipes[]` and its checksum fold exactly as-is, add a `[production]` node table keyed by
node id, and have the crafting system prefer a station's *bill* and fall back to the legacy
array when no bill exists. Done first, this is cheap; discovered late, it forks the crafting
system. See `ECONOMY-PLAN.md` W0-5.

---

## 5. The sinks

An economy is interesting exactly as long as its drains keep pace with its sources. Perilune
today has one real drain (machine wear) at ~1 % of a crew-day, and one one-shot source.

| # | sink | status | scales with |
|---|---|---|---|
| S1 | **Machine wear** → Parts + Seals | built, under-tuned ~10× | **machine-hours running** |
| S2 | **Metabolism** — O₂→CO₂, food→waste, water→grey | built | **population** |
| S3 | **Conversion loss** — every converter returns < 100 % | missing (currently mass-*creating*) | throughput |
| S4 | **Hull leak** — `mol/day ∝ HullTiles × pressure` | missing | **pressurized volume** |
| S5 | **Airlock cycling** — each EVA dumps a lock volume unless pumped down | missing | voyage activity |
| S6 | **Spoilage** — raw food → waste on a temperature curve | missing (couples free to the thermal sim) | food stock × temperature |
| S7 | **Carbonate disposal** — regenerate (power + H₂ + labour) or **vent it, gone forever** | missing | population |
| S8 | **Construction / refit** | built | player ambition |
| S9 | **Appraisal → threat** — visible wealth/heat/light drives Lien sortie cadence | missing (GDD §4.12) | everything above |
| S10 | **The lien** — the endgame sink | missing | endgame |
| S11 | **Trade spread** — every exchange takes a cut, permanently | missing (E3) | trade volume |

**S1 + S4 + S9 are the triple that makes keeping the ship cost more the more ship you keep.**
That is Perilune's answer to Factorio's infinite research: **superlinear upkeep on reclaimed
volume**. It needs no new content to keep scaling, and — unlike RimWorld's wealth→raid curve,
which saturates and leaves the late game with no sinks — upkeep is a *rate*, not a threshold,
so it never runs out of headroom.

### 5.1 The three sinks worth building first, and why

**S1 (wear) is already correctly shaped** — condition decays, hot rooms decay faster, Parts
restore fully, empty hands jury-rig to 0.6. It is under-tuned and missing a consumable tier.
Adding `Seals` gives it a drain that never stops.

**S3 (conversion loss) is the axiom made mechanical.** Today the graph *creates* mass
(1 Regolith → 2 Scrap). Every hop must return less than it took, and the loss must be visible
in the ledger.

**S7 (carbonate) is the best decision in the design.** A scrubber currently deletes CO₂. Make
it produce carbonate instead, and the player must either spend power and hydrogen to
regenerate the oxygen, or **vent it — 8.3 kg/day of mass gone forever**. Legible, awful,
tempting. This is the moment the CO₂ problem stops being the round-3 bug and becomes the
game's signature choice. *(It does not replace the transport fix — diffusion must still work
— but it gives the fixed system something to be about.)*

---

## 6. The labour model — the half everyone underestimates

§1.7 established that the mass economy cannot fill a crew's day. This section is therefore the
load-bearing half of the design.

### 6.1 Fix labour supply before anything else

Two changes, in this order, before any content:

**(L0) Make crew recruitable.** `IsIdleForWork`'s `!HasPath` term (`Citizen.cs:63`) must
become "has no *job* path" — a wandering citizen is available, and taking a job cancels the
wander. And `TryRandomWalkableTile` (`PathService.cs:77-89`) must gain a `wander_radius_tiles`
bound so wander stops being a ship-wide cross-deck march. Together these move the effective
labour pool from **1.43 of 8** toward the full crew.

**This is a hard prerequisite, not a nice-to-have.** The already-measured movement retune
(`ticks_per_tile 5 → 10`) and the work-rate rebase below both make the labour famine *worse*:
the retune alone drops recruitable crew-ticks 17.9 % → 9.3 %, raises zero-crew ticks 21.1 % →
46.1 %, and costs **29 % of production**. Landing either retune before L0 would be a
regression wearing the costume of a fix. The prior "better second lane: a `wander_radius_tiles`
def field" note in `HANDOVER.md` was right, and it is now a blocker rather than an option.

**(L1) Rebase work rates ~8–15×.** Target: *a crew member completes 8–20 discrete, watchable
tasks per sim-day, not 400.*

| task | now | PROPOSED | rationale |
|---|---|---|---|
| `DigWorkTicks` | 60 (6 s) | 6,000 (10 min) | GDD §4.6: "citizens with cutting torches at slow rates" |
| `wall_construct_ticks` | 60 (6 s) | 2,400 (4 min) | |
| `door_construct_ticks` | 40 (4 s) | 1,800 (3 min) | |
| `maintenance_work_seconds` | 20 | 900 (15 min) | a real service call |
| SalvageRecycler `work_s` | 20 | 600 | a batch, not a beat |
| Fabricator `work_s` | 30 | 900 | |
| MachineShop `work_s` | 40 | 1,800 | the precision step |

This *also* directly answers playtest round 3's complaint #3 ("I am not sure if they truly work
on something"): a fifteen-minute service call with a named target is visible; a two-second one
is not.

**(L2) Implement sleep.** `Fatigue` rises to 1.0 in 16 h and **nothing reduces it**
(`MECHANICS.md` §13.4); `Bed` is inert furniture. Sleep removes ~33 % of the labour budget and,
more importantly, makes shift scheduling a real decision — *who is awake when the scrubber
fails at 03:00* is a story.

**Projected result of L0 + L1 + L2:** the §1.7 activity table becomes ≈ 70,000 crew-s/day
against a waking budget of 8 × 16 h = 460,800 s → **≈ 15 %**, and a single active refit project
(a 48-tile compartment reclaim ≈ 40,000 crew-s) pushes it to **25–35 %**. Busy, never
saturated, with idle hands available when a crisis calls.

### 6.2 One arbiter, not four dispatchers

There are four independent recruiters today: `JobSystem.TryAssign` plus `SustenanceSystem`,
`CraftingSystem` and `MaintenanceSystem`, each doing its own `FindNearestIdle`. **Any global
policy — priorities, zones, skills, bills — would have to be implemented four times or it is
not a policy.** This is the single biggest architectural obstacle to a deep economy, and the
fix (refactoring `JobSystem` into a dispatcher over pluggable `IJobSource` providers) is also
the thing that lets economy lanes run in parallel at all.

Concurrency is separately capped at one worker per station (`CraftingSystem.cs:397-406`),
measured maximum 3. Multi-worker stations or more stations both raise it; each new station
also adds a fetch leg, so raising it trades bench time for walking.

### 6.3 Reservations need an owner

`ItemStack.ReservedForJob : bool` must become `ReservedBy : uint` (0 = free). This single
change kills the §1.5 leak, makes `Simulation.CancelJob` total, and makes "who is coming for
this?" answerable — which a container/zone system requires anyway. It is a hashed field and it
moves all three pins.

Two further reservation gaps a container economy makes structural: **destinations** are not
reserved (two haulers routed to the same free stockpile tile; the second drops its cargo on
the floor), and the system **reasons in units while reserving in stacks** — the round-3
`_anyFreeMaterial` → `_freeMaterialUnits` fix is the precedent, and any multi-unit cost must
decrement a running budget inside the selection pass.

### 6.4 WHO does the work — pillar 2, made mechanical

There are **no skills, no aptitudes, no work priorities** in the codebase: `grep -rni
"skill|aptitude|workpriorit|proficien" sim/ content/` returns zero hits. `Persona.RoleNow` is a
string read only by prose and wire paths, living in *host-owned unhashed* state — so Amara
Okonkwo's `RoleNow = "life-support lead"` does not make her likelier to service a scrubber,
reach one first, or be told about one. That is exactly the round-3 complaint: the dialogue
layer can promise a role the sim cannot honour. **Any skill system must be new hashed
`Citizen` state, not an extension of the persona.**

Ties currently resolve to entity store order, so citizen index 0 wins every distance tie on the
ship, forever. That is the only differentiation the system has, and it is an accident.

Three mechanisms, in increasing ambition:

1. **Yield and defect, not quality tiers.** Every conversion carries `yield` and
   `defect_chance` modulated by the worker's skill *and* whether they hold the relevant
   `Procedure`. Sketch: unskilled + no procedure → 55 % yield, 20 % defect; skilled +
   procedure → 105 % yield, 1 % defect. A **defective Part installs normally and then fails
   early** — bad work surfaces as a *later crisis*, which is the no-random-events pillar
   working for us rather than against us.
2. **Maintenance quality is personal.** Amara's service restores Condition to 1.0 *and* resets
   the wear clock; a stranger's restores to 0.85. When she dies, the ship's Parts consumption
   measurably rises until someone relearns it. **Knowledge-as-mortality becomes a line on a
   graph the player can watch move** — the mechanism VISION promises and PLAN defers to P4;
   the economy is what gives it teeth, because the loss is *quantified*.
3. **Conversation gets economic content.** *"Amara, would you write down how you do the
   recycler?"* becomes a real request with a real cost (her hours) and a real payoff (a
   `Procedure` that survives her). Today `AgreeTask` — the single richest LLM verb — is
   hard-limited to `Dig` (`EffectValidator.cs:110`) and, on the slice, alive for about four
   sim-minutes before the last designated debris tile is cleared. **A crew member can never be
   talked into crafting, hauling, building or repairing anything.** For a game whose pillar is
   "every crew member is a person you can talk to", the conversation layer has exactly one
   economic verb and it expires in the first four minutes. An economy with tasks worth agreeing
   to is precisely what unblocks it.

---

## 7. What the player actually does

### 7.1 The verbs the shipping client is missing

The web command surface is `cursor / click / move / deck / lens / speed / pause /
build(wall|door|cancel)` plus the dialogue family (`GameSession.cs:955-987`). It **cannot dig,
zone a stockpile, set a bill, cancel a bill, prioritise, order a haul, or see a resource
ledger.** The dig and stockpile commands exist in the sim and are reachable only from the TUI
(`GameLoop.cs:304,309-320`).

That is why `HaulPickup` / `HaulDeliver` measured **0 ticks in 3 sim-days**: `Rescan` only
builds haul candidates when a free stockpile tile exists, and there is no verb to create one.
**Adding the dig and stockpile verbs to the web client unblocks three `JobKind`s and
`AgreeTask` at nearly zero sim cost, and is the highest value-per-effort item in the whole
design.**

New verbs the economy needs: `dig`, `stockpile` (with a filter), `strip`/`deconstruct`, `bill`
(set/cancel/repeat-until-N), `priority`, and a read-only `ledger` channel.

### 7.2 The decision loops

**Minute to minute (the alert loop).**
- Jury-rig the scrubber free at Condition 0.6, or spend a `Part` for 1.0? *(Already
  implemented — it only needs Parts to be scarce for the choice to exist.)*
- Open the bulkhead and let the good corridor air mix with the bad, or keep the seal and let
  the aft crew breathe 12,000 ppm for another hour?
- Which of the two failing life-support machines gets the last `Seal`?
- Who walks it — the nearest hands, or the person who actually knows the machine?

**Hour to hour (the project loop).**
- Which compartment to cut open next: mass yield against the permanent upkeep and gas cost of
  pressurizing it. **The first time reclaiming a deck makes the ship *worse* is the moment
  this economy has landed.**
- Build or repair? Both want `Stock`, and the job board must make you choose.
- Farm area against workshop area in the hold — VISION's blank page.
- Vent the carbonate (8.3 kg/day gone) or spend power and hydrogen to close the loop?
- Deconstruct the gym for its 70 % — a real, slightly shameful decision.

**Session to session (the voyage loop, §9).** Delta-v is the meta-currency; each destination
is a different tier; who goes on the away team is your best machinist who is also the only
person keeping the reclaimer alive.

### 7.3 The ledger is a screen, and it is the differentiator made visible

`ShipMetrics` today lies: `Food` saturates at 40 potatoes and reads **1.00** while food
production is permanently dead; `Power` reads 1.00 during a 62 % brownout duty; `Water` reads
0.50 while the hydro tank is empty and total inventory has fallen 64 %. There is no ledger, no
rate display, no days-of-supply anywhere.

The economy needs new `ShipMetrics` members — `MassLedger`, `PartsPerDay`, `DaysOfWater`,
`DaysOfAir` — computed **incrementally in the owning system** and exposed as a snapshot, never
by adding scans to a function whose own doc says "call from UI at ~1 Hz, never per tick". These
same aggregates are the natural new MOSS `ship.*` bindings and the Director's new tension
inputs, so the wire, def and MOSS surfaces move together.

---

## 8. Storage and logistics

Today: one boolean tile flag (`TileFlags.Stockpile`), one writer, no shipped ship designating
any, no filters, no priority, no containers, no capacity, no stack merging (MEASURED: 294
potatoes in **269 stacks**; 31 ControllerModules as 31 separate stacks on one tile), no
spoilage, and a one-stack-of-unbounded-size carry model.

**What the design needs, and what it must NOT do.**

- **Filtered stockpile zones with priorities** — the near-universal genre answer. `TileFlags`
  has exactly **one bit left** and the `TILE` save chapter is **exact-version-gated**, so
  widening the flags array would move the world hash *and* brick every existing save. Zones
  must therefore live in a **registry with its own save chapter**, keyed by packed position —
  never in tile flags. The last bit stays reserved.
- **Stack merging and a stack cap.** Unbounded stack growth is an entity-count leak: every
  stack is a hashed entity, a save record, and a candidate in every O(items) nearest-scan in
  four systems.
- **Kind-bucketed item indexes.** `TryAssign` is O(board) per retry iteration and
  `TryReserveMaterialFor` rescans *all* items on every iteration; `CraftingSystem` scans items
  per station per second. With a conversion graph this shape does not survive.
- **Do not build belts, drones or logistics *conveyance*.** Hauling stays crew labour. It is one
  of the two largest labour sinks in the genre, and automating *transport* away removes the thing
  that makes crew visible on screen — which was round 3's complaint. **REFRAMED (director,
  2026-07-24) — see `docs/design/perilune-automation-and-souls.md`:** this measurement stands, but
  its *conclusion* is now "automate **control**, not **conveyance**" — MOSS scripting a device's
  duty cycle (gated by scarce `ControllerModule`, E0-6) is the automation game and moves zero
  matter; and *processing* automation at a bench is welcome **when it is operated by a named crew
  member whose mood + skill set its throughput and defects** (the operator model), because that
  *stations* the person on screen rather than erasing them. The blanket "no automation" reading is
  superseded; the "no cross-ship conveyance that replaces visible haulers" reading is preserved.

**A warning from measurement.** Stockpiles are not automatically good. Enabling them
experimentally: a stockpile *beside* the benches acts as a pre-positioning buffer (craft
walking 13.0 % → 8.0 %, throughput 28 → 31). A stockpile on the **wrong deck** is catastrophic
— on-job travel rises to **75.7 %**, throughput drops 14 %, and material strands in the wrong
place. Root cause: crafting **outputs** spawn unreserved, so the haul board immediately drags
them to the stockpile, from which the downstream station's fetcher must walk them back. **A
zone system without a "don't haul what a bench wants" rule is a throughput regression.**

---

## 9. External supply and the voyage

### 9.1 The honest audit

`NavSystem` is real: registered in the stack, saved, hashed (`'NAVS'`), def-tuned, ten tests.
It is also **provably inert in every shipped scenario**. No ship generator or authored ship
ever places a `Telescope`, so `Tick` returns early every tick. `AddContact` is called only from
tests. Both nav events are consumed by nothing. `BeginBurnCommand` has no wire route and no UI.
`ContactKind`'s three rows are hashed and nothing branches on them. MOSS cannot address a
telescope, so VISION's scriptable sky survey is 0 % built.

Two model gaps will bite any design: **the ship has position but no velocity and arrival
teleports**, so "on station at a comet" decays the instant you arrive as the target drifts
away; and `transit_speed_mm_per_s = 0.5` is **500 km/s (0.17 c)** with a flat 100 m/s burn
cost, so delta-v is a counter of "ten burns, ever", not a resource.

Beyond nav: no site archetypes, no derelicts, no history engine (the gate suite encodes "ships
must live" — the opposite of what a site needs). The content-pack seam is **two channels wide**,
**no host loads packs at all**, and no save records a manifest — so "everything is a content
pack" is currently false in the shipping binary, and the P3 DLC dry run would discover it at
the worst possible moment.

### 9.2 One external material, four uses

```
                     ┌─→ potable water ──→ crew drink
   ICE (external) ──→│                  ──→ hydroponics irrigation
                     ├─→ VOLATILES (O₂/N₂ make-up) ──→ pressurising new rooms
                     └─→ PROPELLANT (H₂/O₂) ──────────→ delta-v → the next port
```

Water is drink, crops, **air, and fuel**. This is GDD-canonical ("your air *is* your water")
and it makes the comet rendezvous the reason the voyage exists rather than a side activity.
Every other channel — salvage, trade, hull scavenging — becomes a *substitute* for an ice run,
which is what makes them a choice rather than a checklist.

### 9.3 The channels

**Extraction.** Three tiers; pick per resource, do not build all three. Recommended: a
**harvester device on your own ship** (no away-map, no second sim) for ice and volatiles — it
converts "arriving somewhere" into a change in the *interior* economy, delivers the durable
work source, and reuses maintenance, wear, hauling and brownout pressure wholesale. **Asteroid
mining reuses the away-map**, where `JobKind.Dig` is already the mining verb and `MetalOre` is
already declared: the player designates, crew dig, haulers carry to the shuttle — zero new
verbs, and the mine is *physically explorable* rather than a yield roll. **Gas-giant scooping
is cut** (VISION: destinations are ships and stations, not planets); coma scooping survives as
one def row.

**Salvage** is where Perilune beats every competitor, because the generator that builds your
ship also builds the corpse. `Sim.Gen` gains a **damage pass**: run the deterministic cascade
replay from a seeded initial fault, and write out tile damage, device conditions, named corpses
consistent with the story, and the MOSS scripts that were the crew's actual attempt to save
themselves. **Yield is not a table — the material you get is the material that is there.** The
def-driven yield table seeds the *generator's placement*, never a loot roll. A stripped
derelict stays on the chart as a hulk with nothing left, and the Chronicle records who you took
apart. The gate suite must be **forked**: sites need reachability-from-the-dock, hazard
legibility, history coherence, yield floor/ceiling and determinism — not survivability.

**Trade** is barter with a valuation index and **no player-held currency**. Goods carry a base
value only so a barter can be evaluated; price formation is deterministic and def-driven
(`base × port_scarcity × standing × condition × spread`, where spread is a function of
`(faction, day)` and takes no RNG). Credit is a *relationship*, not a number — the lien-payoff
ending is "standing with Asterion reaches DISCHARGED", not a bank balance. **Trading raises
Appraisal**, so economy and threat are one dial and the Director still never rolls dice.

**Scavenging your own hull** is the inverse of `BuildSystem` and the cheapest
emotionally-loaded mechanic on the list: 50 % recovery on walls, `Parts × condition` on
devices. The consequences all have systems already — cutting a wall merges rooms and
redistributes gas (strip the wrong bulkhead and you decompress the mess hall); **deleting a
named device un-registers its MOSS adapter, so you can break your own automation by selling a
valve**; and the room loses its role, which crew *remember*. **Never allow stripping the
pressure hull itself** — VISION: the hull is the canvas edge.

### 9.4 The voyage as the economic clock

Replace the flat burn cost with a **coast-and-brake** model, flagged in-fiction as the honest
simplification:

```
Δv_spent = |v_target − v_ship| + Δv_transfer        (player chooses Δv_transfer ≥ 0)
t_days   = 23.15 × distance_Mm / Δv_transfer_mps
```

| example | distance | Δv_transfer | transit |
|---|---|---|---|
| near comet, fast | 50 Mm | 400 m/s | 2.9 days |
| near comet, thrifty | 50 Mm | 120 m/s | 9.6 days |
| far derelict, fast | 300 Mm | 400 m/s | 17.4 days |
| far derelict, thrifty | 300 Mm | 150 m/s | 46.3 days |

**Every burn is "spend water to buy days".** Days cost food, water, air, wear, morale and
Director tension; propellant costs water. The player is always choosing which resource to be
short of. Each destination gives one resource family and denies the others — and "stay put"
must remain a row on that table, so leaving is a decision the player owns rather than a
treadmill.

`NavSystem` additionally needs `ShipVelX/ShipVelY` and station-keeping, or §9.1's teleport gap
makes harvesting impossible.

### 9.5 Risk is physical, never a roll

Away-mission death must come from the same `NeedsSystem` that kills people at home. **Suit
oxygen is the clock** (a new hashed `SuitO2` consumed at the existing per-person rate; in
vacuum a breached suit already kills in 90 s). **Cargo mass is the temptation** — carried mass
adds to `ticks_per_tile`, so "one more load" is an arithmetic-legible gamble against the suit
clock. **The site's own physics is the hazard**, and every hazard must be a gauge the player
can read *before* stepping into it. And time on the mothership keeps running: send your only
life-support lead and the scrubbers go unmaintained while she is away — the opportunity cost is
the real risk on most runs.

The emotional wiring needs almost nothing new: deaths out there publish `CitizenDiedEvent` on
the mothership bus, so eulogy, memory, history and Chronicle fire exactly as they do for an
interior death. Add a history kind for away-loss (so the Chronicle can write a different kind
of sentence), an away-loss memory row carrying *where and why*, and a port-of-call entry so the
voyage log has chapter breaks. A log reading *"D142 — on station at comet C-4. D148 — Okafor
did not come back."* is the entire product promise in two lines.

**Guardrail:** never let the LLM decide who dies, what a run yields, or what a trade is worth.
`CitizenEffects` has no resource effect and must never get one. Trade and salvage reach the sim
as ordinary `ISimCommand`s from the player, or as Director-scheduled *windows* — never as
effects.

### 9.6 The near-term faucet problem, and the honest answer

The voyage is P3+. The economy is dead at sim-minute 64 **today**. The temptation is a
renewable internal source — and that is exactly the failure mode that produced the one-shot
dig; it must not be reintroduced under a new name. Renewable internal extraction is
*fictionally illegal*: the hull is inviolable, there is nothing to mine, and a renewable
internal faucet is a lie the player can see.

Three honest, finite, fictionally-correct internal faucets are available **now**:

1. **The unreclaimed ship itself.** Act I is "recapture her deck by deck": sealed, vented,
   fire-damaged decks are the fiction's own large finite salvage field. The slice ships 48
   debris tiles; the fiction supports hundreds.
2. **The GDD-canonical forward-hold cargo.** She is an ice-and-concentrate hauler. Authored
   `Ice` in the forward holds is a large finite stock that also *rehearses the comet loop
   exactly* — the same haul/melt/store cycle, just without a drill upstream.
3. **Deconstruct at a loss.** Matter already installed, recoverable at 50–70 %.

Combined with lossy recycling (so matter *cycles* instead of terminating) and the ~10× work
rate rebase (so the same matter costs ten times the labour), these give weeks of durable play
with no faucet lie — and each is the training-wheels version of its P3 external analogue:
dig → asteroid strip, ice hold → comet, deconstruct → derelict salvage.

### 9.7 Forward compatibility: the trading-hub DLC

*Recorded 2026-07-22 at Garvin's request. **Not** in the base-game scope; this section exists so
that base-game work leaves the right seams and a hub ships later as content + one system, the
RimWorld expansion shape VISION already commits to.*

**The product shape.** A trading hub is a *persistent, revisitable, dockable place with
residents* — a station where crew go aboard, talk to a quartermaster who remembers them, and
buy and sell. It is not a menu. That distinction is the whole reason it belongs in Perilune
rather than in any other colony sim, and it is also what makes the seams non-trivial: a hub is
closer to an away-map with memory than to a contact with a price list.

#### The one trap that would break the axiom

> **A trading hub is not a faucet. It is a converter, and it takes a cut.**

Mass entering the ship through a hub must be exactly mass leaving it, minus the spread. The
failure mode is easy to walk into and hard to walk back: a hub that sells unlimited goods for
an abstract currency the player can farm is a **renewable internal faucet with extra steps** —
precisely what §9.6 forbids, wearing a shop front. Three rules keep it honest:

1. **The hub's own stock is finite and modelled**, regenerating on supply lines that exist in
   the fiction (and that the player's own actions can disturb). "Infinite stock at a price" is
   the thing not to build.
2. **The player can only acquire what they can pay for in real goods or real labour.** Refined
   salvage, past cargo, and crew expertise are the exports (§2.3) — the hub is where those
   finally have somewhere to go.
3. **The spread is a permanent loss**, and it belongs on the sinks table (§5) as an ordinary
   drain. Trading is not free money; it is a conversion with a cost, like every other converter
   in §4.

#### The seven seams that must exist in the base game

None of these is hub-specific work. Each is something the base economy wants anyway, shaped so
a hub is additive rather than a rewrite.

| # | seam | why a hub needs it | when it lands |
|---|---|---|---|
| 1 | **Value at a single chokepoint.** One valuation function every price path calls; `goods.def` carries `base_value` as inert data long before anything reads it. | A dynamic market is then a *swap of one implementation*, not an edit to every trade site. | `goods.def` in E0 (already scheduled as inert data), the chokepoint in E3 |
| 2 | **A settlement abstraction.** One code path that moves goods in both directions and asserts conservation across the exchange. | Barter today, credit later, hub-with-a-balance later still — all become the same call. Without it, "add a wallet" means touching every trade path. | E3 |
| 3 | **Stable, pack-qualified site ids.** `core.comet_dirty`, `ports.freeport_dock`. | A save must be able to reference "the hub you have standing with" across pack install *and* uninstall. Ids invented late are ids that churn. | E3, with `sites.def` |
| 4 | **Persistent per-site state, in its own save chapter.** Stock levels, prices, standing, standing offers, what you sold them last time. | The derelict design already needs a `Stripped` flag; **persistent site state is that idea generalised**, and it is much cheaper to design once than to add a second mechanism for hubs. | E3 |
| 5 | **Counterparties are people.** Hub residents carry `PersonaSheet`s and are reachable by the conversation runtime. | A quartermaster who remembers you is the entire reason this is a Perilune hub. Concretely: **E3's away-mission crew-transfer contract must support non-crew personas resident at a site**, not just transferred crew. Retrofitting that is a contract change; allowing for it now is a sentence in a brief. | E3 |
| 6 | **Trade reaches the sim as `ISimCommand` only.** The model may *propose*; the sim adjudicates and prices. | A hub is exactly where someone will be tempted to let a model agree a price. `CitizenEffects` has no resource effect and must never get one (§9.5). If an "offer accepted" effect is ever wanted, it validates against a **sim-computed** price and never a model-stated one. | reserve the shape in E3 |
| 7 | **Deterministic price formation.** A pure function of `(faction, day, sim state)`, or a hashed accumulator — **never runtime RNG**. | Prices are player-visible and MOSS-readable; an RNG draw would couple the market to movement and move every pin (§ the RNG trap in `ECONOMY-PLAN.md` §4.6). | E3 |

#### What the DLC then adds

Rows in `sites.def` / `goods.def` / `factions.def` / `prices.def`, a persona pool, arcs, a
sprite set — **plus exactly one new system**: the dynamic market that replaces the base game's
static scarcity table. That is the *Freeport* shape VISION already names as a candidate DLC,
and it is the "content + one new system" pattern the whole business design rests on.

**This makes E3's content-pack prerequisite non-negotiable.** §9.1 records that the pack seam
is two channels wide, **no host loads packs at all**, and no save records a manifest. A hub DLC
cannot exist until generic pack channels, a host that loads them, and a `PACK` save chapter
land. That work was already scheduled in E3; a planned hub promotes it from "should" to "must".

#### The one open fork

The base game deliberately ships **no player-held currency** (§9.3, §11): barter with a
valuation index, and credit as a *relationship* rather than a number. "Buy and sell" implies a
balance, so the hub forces the question. Three shapes, all reachable through seam 2:

- **(a) Pure barter**, hub included — two-column manifest, no balance ever.
- **(b) Faction-scoped credit** — a saved, hashed balance *per faction*, which is standing with
  a number attached. Selling at the Freeport gives you Freeport credit, not universal money.
- **(c) Universal currency** — marks the player holds and spends anywhere.

*Recommendation: **(b)**.* It gives the player a real balance to buy and sell against, keeps
"credit is a relationship" intact, makes each hub a place with its own economy rather than an
ATM, and it is the only one of the three that composes with the lien endgame (which is already
expressed as standing reaching DISCHARGED). (c) is the one that most easily degenerates into
the faucet trap above, because universal money is farmable anywhere and spendable everywhere.
**Deferred** — nothing in E0–E2 depends on it, and seam 2 keeps all three live.

---

## 10. The numbers, in one place

Every figure derived from constants already in `content/core/SimDefs/`. **PROPOSED values are
design targets, not tuned results.**

**Machine wear demand.** Parts/day per machine = `24 × wear_per_hour / (1 − maint)` = `40 ×
wear` for the 0.4-threshold kinds. A slice-scale ship (5 scrubbers, 4 vents, 2 reclaimers,
3 radiators, 3 grow beds, 3 workstations, 10 lights, 8 doors, 2 solar, 2 batteries,
3 terminals) burns **≈ 10.6 Parts/day**. That is the ship's metabolic rate in components, and
it is computed from shipped defs, not invented.

**Therefore the debris field is 4.5 days of upkeep** (1 Regolith ≈ 1 Part; 48 tiles ≈ 48
Parts). That is the honest size of the faucet the game ships today. The tuning formula:

```
days_of_upkeep_from_a_salvage_field = tiles × yield_per_tile × recycle_efficiency / parts_per_day
```

PROPOSED: `yield_per_tile = 3`, recycler `1 Scrap → 0.85 Stock` → the slice's 48-tile field
becomes **≈ 11 days** of upkeep. Enough to matter, short enough to force the voyage.

**Steady-state metal loss.** Maintenance *installs* a Part; the old one becomes `Swarf`,
recoverable at 60 %. Steady-state loss = 40 % of 10.6 = **4.2 Part-equivalents/day** ≈ 2 tonnes
over a 100-day voyage. So a derelict worth boarding should yield **1–5 t of recoverable metal =
50–250 days of upkeep** → **one substantial hulk every 2–4 sim-months**, which is exactly the
pacing VISION's ports-of-call structure wants.

**Water.** Drinking is ~1 L/person/day, reclaimed at 93 % → net 0.07 L/person/day. Irrigation
is the current disaster (§1.4): `grow_bed_water_per_second = 0.02` = 1,728 L/day/bed, of which
20 % is unrecovered. **Re-express irrigation per crop, not per second**: PROPOSED
`water_per_crop = 20 L`, and raise `transpiration_recapture_fraction` 0.8 → 0.93 (defensible:
a closed hull condenses well). Ship total then ≈ **36.6 L/day at 8 crew**, i.e. ~1,460 L over
40 days ≈ 3 tanks → **a comet/ice rendezvous roughly every 40–60 sim-days.** The fiction and
the mechanic agree without anyone forcing them to.

**Air.** 8 crew consume **210 mol O₂/day** and produce 189 mol CO₂/day. Replace the infinite
vent reserve with a finite bottled reserve; PROPOSED opening reserve **3,000 mol ≈ 14 days**.
Regeneration: electrolysis costs **7.6 L water/day** for the full 210 mol — the coupling that
makes water the master ledger. Pressurising a fresh 50 m³ compartment costs
`n = PV/RT ≈ 2,079 mol`, so a full reserve is ~48 compartments of homesteading. **This single
change converts the refit loop from free to externally supplied**, which is the tightest
possible binding between the build itch and the voyage.

**Food.** Hunger fills at 0.5/day and a potato removes 0.36 → **1.39 potatoes/person/day**
≈ 11.1/day at 8 crew. A grow bed at `grow_seconds_per_crop = 600` yields **144/day** — a 39×
surplus, which is why 285 potatoes were measured lying around. PROPOSED
`grow_seconds_per_crop = 28,800` (8 h, 3 crops/day/bed) → **one bed feeds two crew**. The
slice's 3 beds then produce 9/day against 11.1 needed: **the shipped ship boots in a mild,
immediately-legible food deficit.** That is a gift — a first-hour problem with an obvious
action (build a fourth bed) that teaches the whole economy.

**Storage sets the voyage cadence.** With the hydro leak retuned and a large tank variant
(~12,000 L), endurance ≈ **32 sim-days** per leg. Propellant at 2 m/s per unit and 10 L water
per unit makes the shipped `initial_delta_v_mps = 1000` equal to 5,000 L of water — ten times
the slice's current storage, so **the player's first strategic act in the voyage is building
tankage**.

---

## 11. What we explicitly do NOT build

Scope discipline is what keeps this shippable. Each line is a specific temptation with its
reason for refusal.

- **No currency or market model *in the base game*.** No supply/demand curves, no inflation.
  Trade is barter by manifest — a two-column screen. *A price model is weeks of tuning producing
  exactly one feeling ("the numbers moved"), which Appraisal produces for free.* The dynamic
  market is deliberately reserved as the trading-hub DLC's "one new system"; §9.7 specifies the
  seams that keep it additive, and building it early would spend the DLC's whole hook.
- **No per-tile mass or per-tile gas.** Rooms stay lumped. *O(tiles) work in the tick path for
  fidelity nobody can see, and it breaks the zero-alloc invariant.*
- **No element/phase-change table.** No melting points, no liquid sim, no gas mixing beyond the
  existing three species. *That is ONI's moat and their engine was built for it. We beat them
  on people, not thermodynamics.*
- **No item quality tiers.** Use yield % and defect chance on the recipe, and `Condition` on
  the device — both already exist. *Quality tiers multiply the item table by seven and every UI
  that touches items, for a signal we get more cheaply and more diegetically from defects that
  fail later.*
- **No research tree or research queue.** Knowledge is found and taught. *A tech tree is a
  global, un-losable unlock — the exact opposite of knowledge-as-mortality.*
- **No belts, drones or logistics automation** (§8).
- **No carry weight, vehicles or multi-stack inventories.** One stack per citizen stays. *The
  interesting constraint is trips, and trips are already counted.* (Away-mission cargo mass is
  the one deliberate exception, §9.5.)
- **No nutrition/vitamin model or cooking skill matrix.** One cook step, two food items.
- **No per-item durability.** Durability lives on devices (`Condition`) only; `Swarf` is the
  item-level expression of wear and it is a *flow*, not a per-stack field. *Per-item durability
  is a hashed field on every stack — save size, checksum churn and a round-trip test for a
  feeling `Condition` already delivers.*
- **No second job for `ControllerModule`.** It gates MOSS scriptability. One job. *The current
  chain's terminal product has zero consumers; the fix is one consumer, not an economy of its
  own.*
- **No second faucet "just for the slice."** If the slice starves, the answer is the voyage
  arriving on schedule or a bigger opening stock — never a renewable internal source that
  contradicts the fiction (§9.6).

---

## 12. Acceptance — how we know it landed

### 12.1 The measured gates

These are project-level acceptance criteria, not per-lane tests, and each names the window it
actually proves (the round-3 honest-naming precedent: a test called `EconomyIsSustainable` that
runs ten sim-minutes is a lie).

| # | gate | today | target |
|---|---|---|---|
| A1 | crew busy-fraction at **sim-hour 24** | **0.0 %** | **> 25 %** |
| A2 | recruitable crew-ticks | 17.9 % | > 60 % |
| A3 | player can build a wall at **day 3** | impossible | routine |
| A4 | `HaulPickup`/`HaulDeliver` ticks over 3 days | **0** | material |
| A5 | mass conservation: mined + traded in == consumed + stored + decayed − losses, over 3 sim-days | n/a | holds exactly |
| A6 | `ItemKind`s with no producer or no consumer | **2** | **0** |
| A7 | water inventory at day 3 | 497 / 1400 L, food dead since day 1.2 | stable within design loss |
| A8 | Parts consumed by maintenance over 3 days | **0** (leak) | matches the ~10.6/day model |
| A9 | economy exercised by `ci.sh` | **not at all** | a slice-based economy canary runs in CI |

### 12.2 The falsifiable design test

The economy has landed when a playtester says one of these unprompted:

1. *"I couldn't afford to pressurize Deck 3."* — upkeep-scales-with-size is felt.
2. *"When Amara died our parts consumption went up."* — knowledge is on the ledger.
3. *"I tore down the gym for the metal."* — deconstruct-as-verb is felt.
4. *"We had to go to the comet or we'd have run out of water in three weeks."* — the voyage
   is the faucet.

Three of the four are also VISION's own success criteria.

---

## 13. Decisions — ALL SETTLED 2026-07-22 by Garvin

Nothing below was taken unilaterally; each was put to Garvin as an open decision and each is
now on record. **The full programme E0 → E4 is approved.** This section is the decision log —
if a later session wants to revisit one, it changes *this* list first.

1. **Work-rate rebase magnitude — DECIDED: 10× (§6.1 L1).** The table in §6.1 is the target.
   It moves all three determinism pins and every golden, and it is the single biggest change
   to how the game *feels* since the slice shipped. **Constraint that survives the decision:
   it lands behind L0 (recruitability), never before** — the measured retune costs 29 % of
   production and halves recruitability on its own.
2. **Sleep — DECIDED: yes, in E1 (§6.1 L2).** Removes ~33 % of the labour budget and makes
   shift scheduling a real decision. A genuine new mechanic, not a tuning change: it interacts
   with every crisis-response expectation, so E1's acceptance measurement must re-check A1
   against the *waking* budget, not the calendar budget.
3. **Scope — DECIDED: the full programme, E0 through E4.** Not E0+E1 with later phases
   separately approved. Three consequences that change work *upstream*, recorded here because
   they are cheap now and expensive to retrofit:
   - **The ledger (E0-8) must expose an Appraisal-summable wealth figure from day one.** E4's
     Appraisal → threat lever sums visible wealth, heat and light signature; if `MassLedger`
     ships without a total-value roll-up, E4 either re-walks every entity or bolts on a second
     aggregate.
   - **Faction standing (E3) is a persisted scalar, designed as such, not an afterthought.**
     E4's lien payoff is "standing with Asterion reaches DISCHARGED"; that requires standing to
     be saved, hashed and Chronicle-visible from the moment trade lands.
   - **Population growth (E4) is the multiplier on the metabolic drain**, so the §10 food,
     water and air rates must be expressed *per capita* throughout and never hard-tuned to
     eight crew. Any def field that silently assumes the slice's crew count is a bug against
     E4.
4. **Slice economy canary in CI — DECIDED: yes (A9).** A bounded canary, not the full slice
   golden. CI's blindness to the material economy is how a 64-minute economy shipped unnoticed.
5. **`Regolith` → `Stock` presentation rename — DECIDED: yes (§3.2).** Presentation alias only.
   Enum row 0 is **never** renumbered. Folded into whichever lane touches the item wire.
6. **The three live defects in §1.5 — DECIDED: fix immediately**, independently of the
   programme's sequencing. The ownerless reservation leak and the hydroponics water leak are
   bugs on the shipping build, not design questions. Note that the reservation-owner fix (§6.3)
   moves the pins whenever it lands, so it is scheduled as an integrator commit rather than a
   drive-by.
7. **Trading-hub DLC currency shape — DEFERRED, and safe to defer.** Garvin has committed to a
   trading hub as later DLC content (§9.7). The one question it forces is whether the player
   ever holds a balance: pure barter, faction-scoped credit, or universal currency.
   *Recommendation: faction-scoped credit* — it is the only one that composes with the lien
   endgame and the only one that resists becoming a farmable faucet. **Nothing in E0–E2 depends
   on the answer**, because §9.7 seam 2 (the settlement abstraction) keeps all three reachable.
   The answer is genuinely needed only when E3's trade work begins.
