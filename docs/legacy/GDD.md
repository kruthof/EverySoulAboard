# PERILUNE — Game Design Document

> **Revision note (2026-07-18):** This document was pivoted from a moon-base setting (Malapert Deep, lunar lava tube) to a shipboard setting: the game now takes place aboard the drifting colony/mining vessel **MSV Perilune**, with pirates occupying her aft decks. The pivot is narrative and world-structure only — the deterministic sim, per-room atmosphere, power grid, MOSS, citizens, economy, and milestone architecture are unchanged. Code and the TDD still use legacy names (`rock` tiles, dig jobs, `Moonbase.*` namespaces, solar/`SolarFeed`) until the M3 rename pass.

*Working title: PERILUNE — now the ship's name. Project codename: moonbase (legacy).*
*Companion documents: [TDD.md](TDD.md) (technical architecture), [LLM_CITIZENS.md](LLM_CITIZENS.md) (LLM citizen layer), [MOSS_SPEC.md](MOSS_SPEC.md) (automation language), [REQUIREMENTS.md](REQUIREMENTS.md).*

---

## 1. High Concept & Working Titles

**High concept:** You are the last known survivor of the **MSV Perilune**, a deep-system colony and mining vessel seized by debt-repossession pirates and left drifting off the shipping lanes. The raiders are still aboard — they hold the aft decks, stripping her for parts, and they think everything forward of frame 60 is vacuum-dead. Alone in the dark, depressurized bow, you explore compartment by compartment, restore power and air, and discover who else lived. What begins as a survival crawl becomes a Dwarf Fortress-deep colony simulation: every rescued crew member is a fully conversational individual, every compartment has real atmosphere physics, and the ship's nervous system is a scripting language you write yourself on in-game terminals. Reclaim her deck by deck, automate everything, and deal with the occupiers who believe — with paperwork — that this ship is theirs.

Pitch line: *"Dwarf Fortress meets Oxygen Not Included aboard a pirate-occupied derelict, staged like Aliens: Dark Descent, wired together with a programming language you learn in-fiction."*

**Working titles (in preference order):**
1. **PERILUNE** — the lowest point of a lunar orbit; the ship is named for the low skimming burn that made her owners' fortune, and the game finds her at her lowest point. Evocative, ownable, one word, and now diegetic. *(Selected.)*
2. **AIRTIGHT** — names the core verb of the game (sealing, pressurizing, surviving).
3. **MSV PERILUNE** — the full registry as title, à la *Frostpunk*'s place-as-protagonist.
4. **ADRIFT** — accurate, but crowded namespace on Steam.

---

## 2. Narrative Frame

### The ship
**MSV Perilune**, laid down 2081, commissioned 2093: a kilotonne-class mobile refinery and colony support vessel — six decks, an elongated pressure hull, twin solar wings, a fusion main drive, and a cargo hold amidships big enough to echo. Her design doubles as gameplay systems:
- **Twin solar wings** on external trunks → power system, and a reason the occupiers can cut your power from outside the hull.
- **Bulk cargo of water-ice and ore concentrate** in the forward holds → water chain and salvage economy.
- **Sealed, fire-damaged, and vented compartments** everywhere → a pre-made volume that justifies DF-style expansion without ever leaving the hull: the frontier is *behind bulkheads*, not underground.

Operator: **SEHC (Selene Extraction & Habitats Consortium)** — the Perilune hauled ice and platinum-group concentrate between the lunar polar operations and the deep-system stations; her maiden **perilune burn** — a full-hold slingshot skimming the lunar south pole — made SEHC's name, and the founder renamed the ship after it. Complement before the raid: 214, crew and families.

### The raid backstory
SEHC went insolvent eight months ago. Its creditors sold the lien on the hull to **Asterion Recovery Group** — "the Lien" — nominally a salvage-and-repossession contractor, functionally pirates: ex-corporate security in surplus hard-suits who "repossess" crewed vessels. Nineteen days before the game starts, the Lien's tender **ARG Distraint** matched velocity, breached the main dock, killed anyone who resisted, and pulled the main drive's fusion initiator so the prize couldn't run. Pulled mid-burn, the Perilune fell off her transfer trajectory — she is now on a ballistic drift widening from the shipping lanes. Nobody is coming. And the Lien didn't leave — **that's the key**: they live aboard the aft decks, the Distraint grappled alongside, stripping the ship *slowly* because an intact, productive hull is worth more than scrap. This explains persistent occupation mechanically (sorties escalate as your reclaimed decks' visible value grows) and tonally (they are bailiffs with guns, with paperwork, which is worse than mustache-twirling villains).

The Lien's structure gives threat variety: **Assessors** (corridor recon drones and hull crawlers — they *appraise* you before moving on you), **Recovery Teams** (sortie squads out of the occupied zones), occasional **external boarders** (fresh teams arriving by cutter at an unsecured lock), and late-game **the Receiver**, the human administrator running the operation from the Distraint, who can be negotiated with, bought off, or destroyed.

### Survivor archetypes (first ~15 finds; each is a system tutorial in human form)
- **Dr. Imara Okafor, hydroponics bay officer** — sealed herself in Hydroponics Bay 2, kept plants alive by hand-cycling valves for 19 days. Teaches the food chain; her hand-written valve schedule is literally the player's first MOSS script found on paper.
- **Tomás Reyes, reactor tech** — trapped behind an over-pressure door in the auxiliary reactor annex, alive because the compartment held pressure. Teaches power. Guilt-ridden: he sealed the door with two colleagues outside it.
- **Chief Ada Brandt, master-at-arms** — wounded, hiding in the armory with the ship's last three carbines. Teaches defense; hard-liner faction seed.
- **Purser Yusuf Kagame** — found alive and well-fed in the officers' shelter. Environmental storytelling implies he gave the Lien the docking handshake. Society-conflict seed: citizens who learn this will demand exile, trial, or worse.
- **The Deck Six crew** — four engineering hands who sealed themselves in a cofferdam aft of the machine shop when the trunks vented; reached mid-game by cutting through collapsed bulkheads. Teach salvage & refit, arrive as a pre-bonded social clique with their own opinions — and Deck Six borders occupied territory.
- **Madvi Chen, 11 years old** — a crew family's daughter who hid in a ventilation plenum. The colony's conscience and its most protected asset; children change citizens' risk tolerance and morale math.

### Discovery-driven storytelling
No cutscenes. Three channels:
1. **Environmental** — bulkheads barricaded from the inside; a mess table still set; scorch fans around the main dock; a hydroponics rack where someone ate the seed potatoes; compartments where CO2 scrubber cartridges were stacked by people who understood exactly how they would die and in what order.
2. **Logs & terminals** — every terminal has a local filesystem: personnel logs, maintenance tickets ("VALVE O2-MAIN STICKING, WHO KEEPS CLOSING MY WORK ORDERS"), and *scripts written by the dead*, which are both story and literal gameplay unlocks (Section 6).
3. **The living** — free-form LLM conversation with survivors is the primary lore delivery. Reyes will tell you what happened at the reactor door only if trust is high enough; Kagame will lie, and the lie is detectable by cross-referencing docking-log terminals the player can actually read.

### Arc
- **Hours 0–2 (alone):** wake in a forward maintenance bolt-hole, suit O2 counting down. Restore a local battery bus, reach a terminal, read your first script, repressurize one corridor. First body. First log. Claustrophobic, near-silent — and somewhere aft, felt through the deck plating, *someone else's machinery is running*.
- **Hours 2–8 (first sparks):** find Okafor and Reyes. First harvest, first stable hab compartment — and the moment your running lights come back on, the forward decks stop being written off as dead. First Assessor drone in a corridor (dread clock starts). First sortie ~day 12–14 in-game: small, survivable by sealing doors — teaches that **doors and atmosphere are weapons**.
- **Hours 8–30 (colony):** 8–15 citizens, jobs board running, first player-authored automation, cutting into sealed decks begins, the Kagame question detonates socially.
- **Long game (30h+):** 30–60 citizens, full automation, hold-scale industry, escalating Lien campaigns (wing-cut sieges, vent-crawl infiltration, external boardings), the Receiver arc (expel them / pay the lien / take *their* ship / relight the drive), births, and the open-ended sandbox of running a self-sufficient city in a hull.

---

## 3. Core Gameplay Loops

**Minute loop (the DF loop):** notice alert → inspect (compartment panel / citizen panel / graph) → issue orders (designate, build, prioritize, or hand-operate a valve) → watch consequences propagate through the sim. Pausable real-time, speeds 1× / 3× / 10×; auto-pause on threats.

**Hour loop:** *Explore → Restore → Automate → Grow.* Push the frontier one sealed bulkhead at a time (each unexplored compartment is a gamble: vacuum? survivor? cache? corpse? *occupier?*), bring it onto the power/air grid, replace the manual routine you've been doing with a MOSS script, then spend the freed attention on expansion — more citizens, more compartments, deeper decks.

**Session loop (2–4 h):** a milestone (Section 9) plus one **sortie cycle**: Assessor sighting → prep window (2–4 in-game days) → sortie or boarding → aftermath (repairs, wounded, morale, funerals, loot). The sortie cycle is the game's heartbeat; between beats, the colony sim breathes.

**The meta-loop is attention economics:** the player has one pair of eyes; the ship's demands grow superlinearly; MOSS is how you spend engineering time to buy back attention. Everything in the design serves this trade.

---

## 4. Simulation Systems Inventory

Breadth-first mandate: every system ships a **v0 skeleton** that is *real* (actually simulated, actually connected to its neighbors) but minimal. Integration order: 4.1 → 4.2 → 4.4 → 4.15 → 4.9/4.10 → 4.6 → 4.13 → everything else. Rule: **no system enters v0 until it reads/writes at least two neighbors.**

### 4.1 World Grid & Decks (substrate)
- **Purpose:** the DF-style spatial truth everything else lives on.
- **Spec:** tiles are **1 m × 1 m × 2.5 m** (one z-level = one deck). Authored deck plan, elongated hull footprint ~**160×40 tiles, 6 decks**: Deck 1 command, Decks 2–3 habitat (the survivable bow start), Deck 4 industry/hydroponics, Deck 5 holds, Deck 6 engineering/drive — aft sections of 4–6 plus the main dock held by the Lien at start. Chunked storage; each tile: material, floor/wall/void flags, room ID, contents. **The hull is a hard, inviolable boundary** — no procedural terrain, no digging outward; the map is a ship, authored like a level, reclaimed like a colony.
- **v0:** static hand-authored 3-deck bow section, walls/doors/floors, A* pathing on one deck + ladder trunks. No refit yet, but the data model supports it from day one (sealed/debris tiles are the legacy `rock` tile under the hood — see revision note).
- **v1+:** full refit (cut/build interior walls, convert compartments), structural collapse (cutting load paths drops deck sections — spans > 8 tiles unsupported sag, generous at 0.16 g), per-tile heat conduction into structure, the great hold volume.

### 4.2 Atmosphere & Life Support (the flagship system)
- **Purpose:** air is the game's currency of safety; compartments are the unit of survival.
- **Key playability decision:** **per-compartment lumped simulation, not per-tile.** Each sealed compartment is one node with pressure (kPa), gas mix (O2/N2/CO2 partial pressures), temperature. Doors/vents/breaches are edges in a room graph; flow ∝ pressure differential × aperture. Per-tile gas only exists transiently at breach fronts (a visual/hazard wavefront, not a full CFD). This is the single biggest realism-for-playability trade: it keeps 60+ compartments cheap, and lumped rooms are *more legible* to players than tile diffusion.
- **v0:** pressure + O2% + CO2 ppm per compartment; doors open/close; one breach type; humans consume O2 / emit CO2; one scrubber device, one O2 valve device, hypoxia/hypercapnia damage. This alone makes exploration tense.
- **v1+:** thermal per compartment (radiators, heat from machines and bodies — a real spacecraft problem: **rejection, not heating, is the fight**), humidity (condensation, mold on crops), airlock cycling with gas reclaim (pump-down saves 90% of air vs. venting), fire (O2-dependent — and this hull has already burned once), ore-dust ingress from the holds (abrades machines, causes "dust lung" health condition), suit O2 as portable rooms.

### 4.3 Power Grid
- **Purpose:** everything above runs on it; blackouts cascade into air failures — the classic ONI/DF death spiral, embraced.
- **v0:** one bus: producers (port solar wing, batteries), consumers with kW draws, breaker on/off. Deficit → priority-ordered brownout (life support last).
- **v1+:** multiple isolatable bus segments (the Lien cuts wing trunk lines during sorties; you script failovers), the **reactor-restart problem** — the wings alone can't carry a full colony, so mid-game hinges on repairing and lighting the 40 kW auxiliary fission unit deep in occupied-adjacent engineering — heat output of every consumer feeding the thermal sim, scriptable load-shedding as premier MOSS content.

### 4.4 Water Chain
- **Purpose:** the loop that ties salvage → life support → food together.
- **v0:** single potable tank; citizens drink; hydroponics consumes; a recycler returns 93% of wastewater; cargo ice → water at a melter.
- **v1+:** grey/black/potable grades, electrolysis (water → O2 + H2; your air *is* your water, a real coupling), recovery expeditions to the forward ice holds and (EVA, later) the external tank farm, leaks.

### 4.5 Food & Hydroponics
- **Purpose:** kcal clock on colony growth; the most "alive" compartments on the ship.
- **v0:** one crop (potato), grow beds with light + water + time → harvest → kcal in a stockpile; citizens eat 2,200 kcal/day; starvation debuffs.
- **v1+:** 4 crops with distinct profiles — **potato** (kcal workhorse), **soy** (protein, morale-food ingredient), **dwarf wheat** (long cycle, big payoff, bread = +morale), **spirulina vats** (ugly kcal + CO2 scrubbing bonus — plants participate in the atmosphere sim, O2 out / CO2 in, at ~5% of a scrubber's rate per bed so it flavors but doesn't trivialize). Crop diseases, nutrient dosing (N-P-K as craftable from recycled biomass), cooking chain (raw → meals, morale multiplier), seed banks as raidable treasure.

### 4.6 Salvage & Refit
- **Purpose:** the DF expansion fantasy, shipboard: the colony grows *through* the ship; sealed decks are the frontier.
- **v0:** designate-to-clear on debris/sealed tiles (mechanically the dig system; code still says `rock`), citizens with cutting torches at slow rates, yields scrap metal + occasional intact parts/cargo ice, cleared volume becomes compartments after sealing + pressurizing (breached sections are *vacuum* — sealing and gassing them is the cost of expansion; this is the game's signature colony-growth friction). **The hull is inviolable**: you refit inward, never outward.
- **v1+:** section variety (debris chokes → fused blast bulkheads → collapsed deck plating → the main hold void, a cathedral-scale space when breached — a scripted awe moment), equipment tiers (hand torch → plasma cutter → salvage robot, all scriptable), spoil logistics (scrap is also raw material for plate, patches, and ballistic shielding), structural load paths (cut the wrong frame and the deck above sags), the sealed Deck Six cofferdam with survivors inside.

### 4.7 Crafting, Workshops & Research
- **Purpose:** resource sinks, job content, and the tech gate.
- **v0:** three workstations — **Fabricator** (parts from metal), **Machine Shop** (devices from parts), **Recycler** (salvage → materials). Recipes with labor time. Research = *found, not queued*: reading data slates / examining wrecked machines unlocks recipes. (Breadth-first: no research tree UI in v0; discovery-based unlocks reuse the exploration system.)
- **v1+:** proper engineering-bench research using found artifacts as prerequisites (you research the *broken Lien turret you salvaged*, not an abstract tree node), quality tiers, chemical plant (electrolysis products, propellant late-game — the Burn ending needs reaction mass), device firmware crafting (Section 6).

### 4.8 Citizens — Needs, Moods, Health
- **Purpose:** citizens are the stakes; every system failure lands on a body with a name.
- **v0 needs (5):** O2/air (environmental, not a meter — being in a bad compartment hurts you), food, water, sleep, safety. Simple mood scalar (−100..+100) from need satisfaction + recent events; mood gates work speed and, below −60, "breaks" (v0: refuses work, hides in quarters).
- **v1+:** comfort, social, purpose/meaning (assignments matching skills/traits), privacy (own quarters), grief with funerals as a real morale system; health model with specific conditions — hypoxia, CO2 narcosis, decompression barotrauma, radiation dose (mSv accumulator from EVA time and solar-storm events — inside the hull ≈ shielded, outside = costed), dust lung, wounds, infection; a medbay chain; traits (12–20, e.g. *Claustrophile, Tinkerer, Lien Defector, Devout, Insomniac*) that bias moods, skills, and — crucially — **LLM persona prompts**, so mechanical traits and conversational personality are the same data.

### 4.9 Jobs & Labor Allocation
- **Purpose:** DF's core interface: the player designates *what*, citizens decide *who/when*.
- **v0:** global job types (Haul, Build, Clear, Farm, Operate, Repair, Guard — "Clear" is the legacy Mine job) + per-citizen priority table (RimWorld-style 1–4 grid — proven, readable, do not innovate here). Skill levels 0–10 affect speed/quality and grow with use.
- **v1+:** schedules (sleep/work/recreation blocks — matters when the ship runs shifts through crises), work-crew assignment for expeditions, citizens *negotiating* jobs via conversation (Section 4.15 hooks), burnout, and apprenticeship (skill transfer, matters for the 20-year colony).

### 4.10 Social Relations & Society
- **Purpose:** the difference between a spreadsheet and a society; the system LLM conversation makes uniquely deep here.
- **v0:** pairwise opinion scores (−100..+100) nudged by proximity, shared events, trait compatibility; opinions visible in inspector; low mutual opinion → work-together penalty, occasional argument event.
- **v1+:** relationship types (friend/rival/partner/family), **factions as emergent clusters** with named ideologies seeded by archetypes — Brandt's *Hardliners* (militarize, exile Kagame, push aft now), Okafor's *Gardeners* (grow, forgive, feed everyone), later a *Belowdecks* clique (hold-dwellers who think the lit decks are a target). Faction pressure produces demands, elections/council mechanics, and the game's best crises: the **Kagame trial** is a systemic event, not a scripted one — its outcome (exile out an airlock? labor? pardon?) is decided by faction weights the player has been shaping for 20 hours, including through direct conversation.
- **LLM integration surface (gameplay side; see [LLM_CITIZENS.md](LLM_CITIZENS.md) for the pipeline):** the sim publishes to each citizen a **fact sheet** (needs, mood, relationships, faction, recent memories as event log lines, known secrets); conversation can emit a bounded set of **sim effects** — the contract that keeps talk from breaking the sim (`CitizenEffect` whitelist: job preferences, map-marker reveals, opinion changes, faction moves, task agreements with deadlines, confessions, refusals). Persuasion difficulty is a sim-side check (opinion of player + trait + mood + faction stance) that the conversation layer is *told about* ("Reyes trusts you: moderate; he is grieving") so the LLM roleplays the resistance the sim requires. Free-form talk, mechanically bounded outcomes.

### 4.11 Economy
- **Purpose:** scarcity accounting internally; a relief valve externally.
- **v0:** no currency — a colony stockpile + rationing policies (per-need: Full/Standard/Short rations, morale consequences). Labor *is* the economy (job-hours are the scarce good), which the jobs UI already expresses.
- **v1+:** internal ledger only if it earns its keep (personal property — own quarters, keepsakes — as morale objects, not markets); **external trade** with two contactable parties: the *Freeport tramps* (independent haulers who dodge the Lien and match velocity for a few risky hours; irregular, price-gouging, bring luxuries/medicine/people) and eventually **the Lien itself** — paying down the lien in refined platinum concentrate as an actual endgame path. Trade emissions raise Appraisal (visible wealth attracts the Assessors) — economy and threat are one dial.

### 4.12 Occupation, Sorties & Boarding (threat & defense)
- **Purpose:** the drumbeat; the reason atmosphere, doors, and automation are martial systems. The Lien is not a periodic raid from off-map — **they live here**: authored occupation zones hold the aft sections of Decks 4–6 and the main dock, with the Distraint grappled outside.
- **Escalation model — "Appraisal":** a visible-ish score of your reclaimed decks' assessed value (population, powered compartments, stockpile value, trade activity, light and heat signatures the Assessors can read through the hull) drives sortie size/frequency on a cadence of roughly one sortie per 15–25 in-game days, with an Assessor recon event telegraphing 2–4 days ahead. Player can *manage Appraisal down* (hide stockpiles, dark-run reclaimed compartments) — running silent inside your own ship as a colony-wide strategy.
- **v0:** one threat type (Recovery Team sortie, 3–6 breachers from the occupied-zone boundary), enemies path, shoot, grab loot, withdraw aft when carrying capacity or casualties hit thresholds — **they are burglars, not exterminators**, which makes early sorties survivable and losses story-generating (they took the seed bank, not your lives). Occupation zones are static and authored in v0, changing only at scripted beats. Defenses v0: doors (lockable, breachable), 2 turret types (a scripted sentry and a manual heavy), citizen guards with 2 weapon types.
- **v1+:** threat archetypes — **Boundary Sortie**, **Wing Cut** (they EVA out and sever your solar trunk lines, then wait; a *systems* siege solved by the reactor and load-shedding scripts), **Vent Crawl** (they come through the ducts; your pressure sensors — scriptable — are the counter), **External Boarding** (a fresh cutter latches at an unsecured lock — new zone attempt), **Snatch** (kidnap a named citizen → rescue arc into occupied territory). Dynamic zone control (you push the boundary bulkheads aft; they counter-push). Defense depth: pressure warfare (vent a corridor the breachers are in — brutally effective, horrifies your citizens, morale/faction cost: *the game's central moral lever*), blast doors, decoy stockpiles, MOSS-driven defense grids (Section 6), and the Receiver endgame (Section 9).

### 4.13 Population Growth
- **Purpose:** slow, precious growth; each new person is an event, never a spawn.
- **v0:** rescue only — survivors found sealed in shirtsleeve pockets of the dead decks (hand-placed) at a designed pace: 2 in hour one, ~12 by hour ten, ~20 total findable.
- **v1+:** three channels — **rescue** (deep decks + the Deck Six cofferdam), **refugees** (Freeport tramps bring escapees from other Lien repossessions — vetting minigame: one late-game refugee is a Lien plant, discoverable through conversation and docking-log detective work), **births** (partnered citizens, opt-in colony policy, 9-month gestation; children are non-workers with big morale/protection effects who reach working age in **4 game-years** — flagged simplification, tuned so a 60-hour save sees its first shipborn teenagers). Target curve: 1 → 15 (10 h) → 35 (30 h) → 60–80 (long game). Hard-ish cap ~100 for perf and legibility.

### 4.14 Exploration, Fog & Salvage
- **Purpose:** the first ten hours' engine; wreck → resources pipeline.
- **v0:** unexplored tiles dark; explored-but-unseen compartments greyed (last-known-state, DF-style); compartments contain authored salvage, bodies (recoverable, funeral system later), logs, survivors. Opening a door to a vacuum compartment while standing in a pressurized corridor is the tutorial for the atmosphere sim, taught by near-death.
- **v1+:** hull EVA exploration (the severed comms mast, the solar wing roots, the Distraint's grapple points, the external tank farm) with suit O2/radiation budgets; deep-hold spelunking among the cargo stacks.

### 4.15 MOSS — the Automation DSL (see Section 6 and [MOSS_SPEC.md](MOSS_SPEC.md))
- **v0:** the interpreter with `every <t>:`, `when <cond>:`, `if/then`, device reads (`hab3.o2`), device commands (`open/close/set`), `alarm("msg")`. Ten scriptable device types: valve, door, pump, scrubber, breaker, light, sensor, turret (safe/armed), alarm, logger. One terminal UI.
- **v1+:** variables, arithmetic, `on event:` handlers (breach_detected, power_deficit), script-to-script messaging, per-device firmware requirements, dry-run simulator, and hardware limits (a terminal runs N script-lines per tick — computation as a shipboard resource; more automation → build more compute cores → they draw power and heat: automation is physically embodied in the hull).

---

## 5. Science Grounding — Numbers & Honest Simplifications

**Atmosphere (per compartment):**
- Nominal: **101.3 kPa**, 21% O2 / 78% N2, CO2 **< 1,000 ppm**. (A realistic 70 kPa / 26% O2 low-pressure ship was considered and rejected — sea-level numbers are what players half-remember from school, and legibility wins.)
- O2 partial pressure: hypoxia symptoms **< 16 kPa** ppO2, unconsciousness **< 10 kPa**, death timer **< 6 kPa**. Fire risk flag above 25% O2 fraction.
- CO2: alarm **5,000 ppm** (real 8-hour limit), impairment (work/mood debuff) **10,000 ppm**, narcosis **40,000 ppm**, lethal **80,000 ppm**. CO2 is the silent killer and the game's best dread mechanic: compartments fail by scrubber death long before O2 runs out — *realistic and dramatic*.
- Human metabolism: **0.84 kg O2 in / 1.04 kg CO2 out / person / day**; a sealed 4×5×2.5 m compartment (50 m³) holds one resting person for ~2.5 days before CO2, not O2, incapacitates them — this exact math is written on a bulkhead in marker by a dead engineer in an early compartment. The numbers are real; use them as horror.
- **Simplified away:** N2 partial-pressure effects, decompression sickness, per-tile gas diffusion (compartment-lumped, Section 4.2), humidity in v0.

**Power:** solar wings **50 kW** combined (available ~85% of the time; outages are attitude/shadowing events from the ship's slow tumble, plus battle damage), auxiliary fission unit **40 kW** steady (KRUSTY-descendant, cold since the raid — restarting it is the mid-game power arc), ship battery bank **200 kWh** start. Draws: scrubber 0.4 kW, hydro bed 0.6 kW (LED grow light dominated), fabricator 3 kW, turret idle 0.1 / firing 2 kW, electrolyzer **4.5 kWh per kg O2** (real ~4.5–7). **Simplified:** no voltage/AC-DC, single lossless bus per segment, ideal batteries.

**Water/food:** drinking 3.5 L/p/day, total use 20 L/p/day, recycler **93%** recovery (ISS-class), so net loss ~1.4 L/p/day → cargo-ice recovery quota from the forward holds. Food **2,200 kcal/p/day**; intensive hydroponics ~**25 m²/person** for full closure (NASA-derived) → 25 grow tiles/person, deliberately kept honest so food area is a real driver of clear-and-pressurize expansion. Potato cycle 70 in-game days shortened to **12** (flagged ~6× time compression on all biology; physics runs real-time, biology runs fast — players never notice, colonies stay playable).

**Environment:** gravity is **~0.16 g** from the slow end-over-end maintenance spin the crew put on the hull before the drive died — *flagged simplification*: treated as uniform on every deck (no gradient, no Coriolis), chosen over zero-g because floors, hauling, and falling are load-bearing gameplay. Referenced in fall damage, structural-collapse generosity, and hauling capacity (citizens carry 3× Earth-plausible mass — say it in a tooltip, players love it). Radiation: hull + water jacket shield the interior to ~zero; EVA ~1 mSv/day gameplay-abstracted dose; solar-storm events (v1+) force shelter-in-place in the shielded core. **Simplified:** thermal vacuum physics reduced to per-compartment lumped heat + radiator capacity numbers; no orbital mechanics anywhere — the drift is scenery, not sim.

**Presentation rule:** every gauge shows real units (kPa, ppm, kW, kcal, mSv, L). Units are the game's aesthetic as much as the lighting is.

---

## 6. MOSS — How the DSL Creates Gameplay Depth

**Fiction:** MOSS ("Modular Operations Script Shell") is the Perilune's shipboard control language — the dead crew ran her on it, and every terminal still holds their scripts. **Learning MOSS is archaeology**: the tutorial is reading a dead man's pump script, with his comments (`# if you're reading this, scrubber 4 is lying to you, trust the ppm sensor in the duct`). Found scripts are simultaneously documentation, lore, and copy-paste-able tools — and on a ship, the language is even more diegetic: MOSS *is* the vessel's nervous system, and reclaiming her means learning to speak it.

**Syntax (v0 grammar, exactly this small — full spec in [MOSS_SPEC.md](MOSS_SPEC.md)):**
```
every 5s:
  if hab3.o2 < 19.5%: open(valve_o2_hab3)
  if hab3.o2 > 21.5%: close(valve_o2_hab3)

when hab3.co2 > 5000ppm:
  alarm("CO2 HIGH HAB-3")
  set(scrubber_hab3.rate, max)

on breach_detected(dock):
  close(door_dock_inner); lock(door_dock_inner)
  arm(turret_d1, turret_d2)
```
Readable aloud, no hostile punctuation, units in literals. A non-programmer can pattern-match their way from Okafor's paper valve schedule to their first working script in minutes; that moment is the game's hook for half its audience.

**Progression ladder (the automation arc *is* the difficulty curve):**
1. **Hands (h 0–3):** you personally click valves. The game makes this tolerable but tedious *on purpose*.
2. **Found scripts (h 2–6):** run the dead crew's scripts on their terminals. Edit a threshold. First taste of leverage.
3. **Authored control loops (h 5–15):** thermostat-class scripts per compartment. Freed attention → expansion.
4. **Device unlock economy:** you can't script what lacks a **controller module** — salvaged from wrecked sections or crafted at the machine shop. "Which 10 devices get my controllers?" is a real strategic choice; scriptability is a *resource*, not a menu.
5. **Coordination (h 15–30):** cross-system scripts — load-shedding on power deficit, airlock interlocks, harvest→haul signaling. Terminal compute limits force refactoring and more compute cores (Section 4.15).
6. **Defense grids (h 25+):** sortie-mode scripts: lockdown cascades, turret arming, and the dark endpoint — `on breach(corridor_c): open(vent_c_ext)` — venting occupied corridors. The language will let you; your citizens will remember.

**Failure as drama — designed, not accidental:** scripts execute exactly as written against a live atmosphere sim, so classic bugs become stories: inverted comparison quietly venting O2 overnight (citizens wake up hypoxic and *terrified of the terminals* — trust in automation is a morale trait); dueling scripts oscillating a door during a sortie; a lockdown script that seals a citizen in with the breachers. Safety net tuned for tragedy-not-frustration: an **audit log** on every terminal (every command, timestamped — post-mortems are gameplay and detective fiction), a **dry-run simulator** (v1) that runs a script against a snapshot, and `alarm()` as the free, always-safe verb. No undo. The game's motto, printed on the terminal boot screen: **"MOSS does what you said."**

---

## 7. UI/UX Concept

**Camera/view:** fixed-angle 3D isometric (yaw locked to 4×90° snaps, gentle zoom 8–40 m). **Deck-slicing** is the load-bearing UI: PgUp/PgDn (and scroll+modifier) moves the view plane one deck; everything above the slice cuts away with a clean sectional cap (URP shader cutaway) so a sliced deck reads like a lit architectural drawing of that floor — DF's z-levels as ship's plans, with Dark Descent's lighting. Decks above render as a faint frame-line ghost; the deck below as darkened depth.

**Exterior orbit camera (new, signature):** one keypress toggles out to an orbitable exterior view — the full hull, small against the nebula, your reclaimed compartments visible as lit windows and running lights, the Distraint grappled to her aft quarter. Read-only in v0 (no orders from outside; it's for orientation, dread, and beauty). Window tiles in the interior view show the same starfield, parallax-correct. Greybox hull at M1; art pass at M5.

**Overlay lenses (hotkeys 1–7), the DF-readability answer:** Normal / **Atmosphere** (compartment tint by O2, CO2 icon-pips, pressure numbers, flow arrows at doors) / Power (bus lines, kW badges) / Thermal / Jobs (who's doing what, idle flags) / Security (turret arcs, door lock states, occupation-zone boundary, last-seen hostiles) / **Script** (every controlled device glows with its owning terminal; the automation nervous system made visible — also the marketing screenshot).

**Build & designate:** RimWorld-proven model — build menu (compartments/devices/furniture ghost-placed, materials hauled by citizens), designations (clear, deconstruct, haul), **zones** (stockpile w/ filters, room-role assignment: Quarters/Farm/Med — room roles feed morale and MOSS namespaces: designating "Hab-3" is what makes `hab3.o2` addressable — naming compartments is literally an engineering act).

**Inspection:** click-through panels. Compartment panel: gauges (kPa/O2%/CO2 ppm/°C), device list, event log. Citizen panel: portrait, needs bars, mood + reasons list ("Ate fresh bread +6 / Saw a corpse −8 / Kagame walks free −12"), health, skills/priorities row, relationships, and the **Talk** button — conversation opens as an overlay while the sim pauses (v0; letting the world run during talk is a v1+ experiment).

**Terminal/IDE:** full-screen takeover styled as diegetic flat-panel: file list, editor with syntax highlight + inline errors, device browser (every reachable device with live values — doubles as debug view), audit log tab, RUN/STOP. Monospace, phosphor-amber on near-black; the coziest screen in a hostile ship.

**Alerts:** right-edge stack, three severities — Notice (grey, e.g. harvest done), Warning (amber, CO2 5,000 ppm), **Critical** (red + auto-pause + camera-jump offer: breach, sortie, citizen down). Every alert deep-links to its subject. Player-authored `alarm()` calls appear in the same stack, so MOSS scripts speak the UI's native language.

---

## 8. Art & Audio Direction

**Look targets:** *Aliens: Dark Descent*'s oppressive readability; secondary references *Alien: Isolation* (material honesty, CRT UI) and *SOMA* (abandoned-vessel storytelling).

**URP lighting recipe (Unity 6, Forward+):**
- **Darkness is the default state and light is a simulated resource:** every luminaire is a powered device on the grid. Restoring a compartment's power visibly *changes the game's look* — the art direction and the power sim are the same feature.
- Ambient near-black (~0.02 intensity, cool 8,000 K tint); starlight through window tiles is a cold rim, never a fill. Volumetric feel faked cheaply: additive cone/shaft meshes + URP decal light pools + heavy dust particles in beams (true URP volumetrics too costly for a solo project by default; a purchased volumetric asset — see ASSET_SUGGESTIONS.md — can upgrade this at M5).
- **Three-light compartment grammar:** (1) practical key — cool white 6,500 K ceiling strips when powered; (2) state accent — emergency circuits: amber 2,200 K on battery, red rotating on alarm (rotating beacon = animated light cookie, cheap and extremely Dark Descent); (3) device speech — every machine has emissive status LEDs (green/amber/red) so the sim state is diegetically readable before any overlay opens.
- Post: ACES tonemap, restrained bloom (threshold high — only emissives bloom), vignette 0.25, film grain 0.1, slight teal-shadow/amber-highlight grade. Shadows: real-time point/spot shadows budgeted ~8 casters on-screen (Forward+ handles the rest shadowless; at iso distance nobody notices).
- Cutaway caps (Section 7) get a dedicated matte material so deck slices look intentional, not broken.

**The exterior vista (new, the calm-contrast beat):** the orbit camera's space is designed as the game's one standing beauty shot — the Perilune's elongated hull in silhouette against a slow nebula, a hard distant sun, a deep parallax starfield; skybox + hull hero model, greybox until the M5 art pass. Direction: **warm awe against cold interior dread** — the first time the player restores a full habitat deck and toggles outside to see her windows lit is the signature emotional beat, scored (see below) and screenshot-engineered. The same vista glimpsed through window tiles is the interior's only free warmth; windows are morale objects for citizens for the same reason.

**Environment build — modular kit on the 1 m grid:** corridor kit (straight/corner/T/junction + damaged variants), compartment shells in 1 m increments, **trim-sheet texturing** (2–3 trim atlases + tileables carry 80% of surfaces — the only viable solo-dev art strategy), a greeble set (pipes/conduits/vents that also visualize which systems serve a compartment — art doubling as sim UI again), decal library (grime, scorch, blood, stenciled signage: "HAB-3", "O2 MAIN", frame numbers, worn safety notices — signage does wayfinding and world-building for free). Characters: ~8 modular bodies × material/decal variation + strong portraits (portraits carry identity in a DF-like; invest there, not in facial animation).

**Soundscape (sound is half the atmosphere budget):**
- **The ship is an instrument:** layered compartment tone driven by sim state — powered = 50 Hz electrical hum + air-handler wash; unpowered = your suit fans and the hull's slow thermal ticking; vacuum = near-silence with structure-borne conduction only (muffled low-pass world — vacuum has a *sound design*, and it's wrong-feeling quiet). And underneath everything, felt more than heard: the occupiers' machinery aft, carried through the frames.
- Signature SFX: pressure-differential door hiss scaled to actual ΔkPa (the sim drives the sample — players learn to *hear* pressure), scrubber chug, distant unexplained clangs on a random timer (pure dread, occasionally *not* random when a Vent Crawl is coming — teaching players to fear a sound, then weaponizing it), the three-tone Lien proximity klaxon, and MOSS terminal keys.
- Implementation: Unity Audio + mixer snapshots per state (explore / alert / sortie / vacuum) is sufficient; adopt FMOD only if snapshot blending proves limiting.
- **Music policy: almost none.** Silence and machinery by default; music is an *event grammar* — a low sustained drone cue when an Assessor is sighted (players will dread that note), percussive minimal kit during sorties, and one warm sparse piano theme reserved exclusively for milestone moments (first harvest, first rescue, and above all the lit-windows exterior reveal). Scarcity is what makes the warm theme land.

---

## 9. Progression, Difficulty & Win/Lose Framing

**Frame:** survival sandbox with authored milestone spine; DF's "losing is fun" adapted to a ship you *care* about keeping.

**Milestones (achievement-tracked, narratively voiced as ship's status-board entries):**
1. **Still Breathing** — restore one pressurized, powered compartment (h ~1).
2. **Not Alone** — first survivor (h ~2).
3. **First Harvest** (h ~5).
4. **They Know You're Here** — survive sortie 1 (h ~6–8).
5. **The Ship Thinks** — first player-authored script runs 24 h without an alarm (h ~10).
6. **Amidships** — full habitat deck pressurized; population 15 (h ~15).
7. **Deep Power** — auxiliary reactor restarted; survive a Wing Cut siege (h ~20–25).
8. **Deck Six** — cut through to the sealed engineering cofferdam and its trapped crew (h ~25–30).
9. **The Hold** — breach and begin colonizing the cathedral-scale main hold (h ~30+).
10. **The Receiver** — endgame branch: **Fortress** (expel the Lien from the hull entirely and repel the "Final Recovery" assault), **Settlement** (pay off the lien in refined platinum — trade/industry victory), **Repossession** (board and take the *Distraint*, grappled alongside — the one squad-flavored setpiece, executed with your citizens and your scripts), or **the Burn** (rebuild the drive initiator, shear the grapples, and relight the main drive for the shipping lanes). All roll into open-ended sandbox; the status board simply gets a last entry: *"Lien: DISCHARGED."*

**Difficulty curve:** hours 0–3 scripted-tight (the authored deck plan controls the pacing); 3–15 the sim takes over with Appraisal-driven sorties scaling to actual reclaimed value (self-balancing: bright, rich decks get hit harder); 15+ difficulty comes from complexity compounding — more compartments, people, scripts, and social factions than one attention span can hold, which is exactly the pressure MOSS exists to relieve. Difficulty settings adjust sortie cadence, resource density, and biology speed — never the physics numbers (the atmosphere math is the same on every difficulty; it's the game's honesty contract).

**Losing:** before the first rescue, player-character death = game over (roguelike-tense opening). After, the PC becomes the (respawnable-by-succession) leader of a crew that persists; **crew extinction** (population 0) is the true loss and produces a DF-style epitaph timeline of the ship. Deaths, sorties, and disasters write into the ship's chronicle — losing a citizen should read like losing a character in a story you co-wrote, because you did.

---

## 10. Three Biggest Design Risks

1. **LLM citizens vs. deterministic sim (coherence and exploit risk).** Free-form conversation that can emit sim effects invites "sweet-talk the sim" exploits and canon drift. Mitigation: the **bounded effect contract + sim-side persuasion checks** (4.10, [LLM_CITIZENS.md](LLM_CITIZENS.md)): the LLM performs the character, the sim adjudicates the outcome, and anything outside the effect vocabulary is flavor only. This boundary must be designed early and enforced ruthlessly. (Latency/cost/offline-mode fallbacks also live here — the templated degraded mode is required, not optional.)

2. **The DSL audience split.** MOSS is the differentiator *and* a filter: too shallow and programmers churn, too required and non-programmers bounce at hour six. Mitigations baked in: found-script archaeology as pedagogy, copy-paste-first culture, the game fully completable at ladder step 3 (thermostat scripts) with deeper automation as mastery, and possibly a v1+ visual "patch-panel" front-end that compiles to MOSS text. Needs playtesting with non-programmers earlier than feels comfortable.

3. **Breadth-first integration collapse (solo-dev scope).** Sixteen interlocked systems in skeletal form is the plan's strength and its failure mode: N systems → N² interactions, and "skeletal" can quietly mean "sixteen things that don't compose." The pivot adds one honest line item here: **persistent occupation AI** (zone control, boundary logic, sorties that come from *inside* the map) is more scope than spawn-raid-despawn; mitigation is that v0 occupation is cosmetic — static authored zones, sorties are the same burglar-raid behavior spawned at a zone boundary instead of a map edge, and dynamic territory waits for v1. Other mitigations: the room-graph atmosphere decision (biggest single complexity reducer), a strict shared substrate (one grid, one tick, one device/port abstraction that atmosphere, power, water, and MOSS all speak — MOSS addressability *is* the integration test), and the rule that no system enters v0 until it reads/writes at least two neighbors. The ~100-citizen cap and per-compartment (not per-tile) sims are the perf insurance.
