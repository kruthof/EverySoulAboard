# Simulation Architecture — Guiding Document

*Adopted 2026-07-18 (second design pivot). This is the project's north star; TDD.md holds the
concrete engineering decisions, GDD.md the fiction and content. Where documents conflict, this
one wins on philosophy, the TDD on mechanism.*

We are not building a traditional building game. We are building a **living scientific
simulation** where the player's ship becomes a persistent society over decades — inspired by
Dwarf Fortress, RimWorld and Factorio, set aboard a scientifically plausible spacecraft.

**The simulation is the game.** Rendering, UI and graphics are only different ways of
visualizing it.

## Fundamental principle

The simulation is completely independent from Unity. Unity is responsible for rendering,
animation, UI, sound, effects, camera and input — nothing else. The simulation owns all game
truth and must run headless from the command line (`dotnet run --project tools/ScenarioRunner`),
simulating years of gameplay without rendering anything.

*Status: enforced since M0 — `Moonbase.Sim.Core`/`Sim.Dsl` compile with `noEngineReferences`;
the ScenarioRunner harness is the remaining deliverable.*

## Simulation layers

No system exists in isolation; every system influences several others.

1. **Physical** — decks, rooms, hull, walls, doors, structural integrity, atmosphere, pressure,
   temperature, radiation, coolant, power, lighting, piping, wiring, comm network. Everything
   exists because it physically exists. Nothing teleports.
   *Built: rooms/atmosphere/power/piping/lighting/doors. Missing: thermal dynamics, coolant,
   radiation, structural integrity, comms.*
2. **Machine** — every machine is a simulated object with efficiency, wear, maintenance,
   failure modes, operating temperature, power draw, throughput, repair history. **Machines
   never fail randomly; failures emerge from operating conditions.**
   *Built: power draw/tiers/throughput skeletons. Missing: wear, efficiency, maintenance,
   temperature coupling, failure emergence — the biggest depth gap.*
3. **Resource** — O2/N2/CO2, water, waste, food, electricity, coolant, spare parts, fuel, heat
   move through networks and obey conservation laws. Nothing appears magically.
   *Built: gases (mole-conserving), water, food, power, salvage chain. Missing: waste, heat as
   a resource, fuel.*
4. **Citizen** — profession, education, skills, experience, personality, health, fatigue,
   stress, beliefs, memories, relationships, goals, current task. Citizens are deterministic
   simulation entities — **not controlled by an LLM**. They persist, remember, learn, age.
   *Built: needs/health/jobs/pathing. Designed (LLM_CITIZENS.md): personality, memories.
   Missing: skills/experience, aging, beliefs, goals.*
5. **Social** — friendships, rivalries, trust, authority, politics, departments, families,
   traditions, rumors, conflicts — emerging from events, never scripted.
   *Designed (GDD 4.10), not built.*
6. **Historical** — accidents, discoveries, deaths, promotions, sabotage, marriages,
   breakthroughs, policy changes become history; citizens remember it; it shapes behavior.
   *New as a system; previously only flavor.*
7. **Knowledge** — knowledge is not global. People know only what they learned, observed, were
   told, or documented. Knowledge can disappear: experts die, documentation rots.
   Institutional knowledge is a resource. (MOSS scripts found on terminals are already
   documentation-as-gameplay — this layer generalizes that.)
   *New — not previously designed. The most novel layer.*

## Tick model

Different cadences per system (already the SimClock pattern): movement 10–20 Hz, atmosphere
5 Hz, power 5→1 Hz, thermal 2 Hz, machines 2→1 Hz, health 1 Hz, social ~minutes, politics
~hourly, historical processing ~daily. Not everything runs every frame.

## Philosophy: no random events

Create systems that naturally produce interesting situations. The canonical cascade:

pump overheats → efficiency drops → coolant flow drops → reactor temp rises → radiators
overload → greenhouse loses cooling → food production falls → morale drops → maintenance
postponed → a second machine fails.

Never "10% chance of reactor failure."

## LLM integration

The LLM is the conversational interface, never the simulation. The simulation decides facts,
memories, knowledge, emotions, goals, permissions, and the set of possible actions; the LLM
decides wording, personality, tone, explanation, dialogue. Conversation outcomes enter the sim
only as sim-validated selections from sim-computed whitelists (see LLM_CITIZENS.md) — the LLM
never mutates state directly.

## Data-driven definitions

Machines, resources, diseases, jobs, plants, materials, policies, research and events should be
defined in data files rather than hardcoded logic wherever practical. *(Status 2026-07-19:
DONE for all current tuning — machines, thermal, atmosphere, water, hydroponics, sustenance,
needs, wear/maintenance, recipes, movement, exploration live in `StreamingAssets/SimDefs/*.def`
(fail-soft parser, checksummed, bit-exact default equivalence proven); designer rules are MOSS
scripts in `SimDefs/rules/*.moss`. See `docs/TUI.md`. Diseases/policies/research remain future
content classes.)*

## Determinism & saving

Given identical seed, save, and player actions, the simulation always produces identical
results. Never Unity random; never frame-rate dependent. Saves contain only simulation state;
everything visual is reconstructed. *(Enforced by permanent twin-run hash + round-trip tests.)*

## View modes

*(Status 2026-07-19: the canonical visualization is now the glyph projection —
`Sim.Glyph` GlyphBuffer rendered by the terminal client (Architecture + Systems via
lens overlays) and the flat-2D browser client. Unity's 3D iso view is frozen. The
modes below remain the conceptual target; "Detail View" is deferred.)*

Three interchangeable visualizations of one simulation:

- **Architecture View** — construction & ship management: rooms, decks, modules, construction,
  crew distribution. *(= today's deck/z-slice view.)*
- **Systems View** — engineering diagnostics: overlays for power, coolant, atmosphere,
  pressure, O2, water, heat, comms, structural stress. *(= the GDD's overlay lenses; to build.)*
- **Detail View** — immersive inspection of individual rooms in high detail: inspect equipment,
  talk to crew, watch work. Nothing changes in the simulation; only the visualization.
  *(New; the Heavy Station Kit art targets this.)*

## World model decision (2026-07-18, user-approved)

The ship is simulated and shown as a **2D side cross-section** (Oxygen-Not-Included
topology): world = length × decks, one room deep (y = 1). The main Architecture view IS
the simulation truth — no hidden beam axis. Consequences: machines are passable (crew
steps around them in the abstracted depth; doors remain the only dynamic blockers);
conduits/pipes are service-tray overlays sharing tiles with machines, with vertical
risers connecting decks; ladders/lift shafts are the deck-to-deck paths. The earlier
isometric renderer is retained as the basis for the future Detail view.

## UX reference (concept mockup, 2026-07-18)

The approved concept sheet ("Space Colony Sim — hard science, real consequences, living
people") pins the target interface; build toward these elements:

- **Ship cross-section as the main stage**: labeled compartments (bridge, command, medbay,
  quarters, hydroponics, observatory, reactor, engineering, fabrication, storage, life
  support), each glowing with its function; crew visible at work inside rooms.
- **Systems sidebar**: live percentages for power, oxygen, CO2, water, food, heat, structural,
  health, morale + an alert stack (e.g. "fungal blight detected", "power grid overloaded").
- **Event log**: day-stamped history feed ("Day 142.12 — Blight detected in Bay 3") — the
  Historical layer's face. Time control in days with pause/speed steps.
- **Current priorities**: a short player-set goal list that conversation outcomes can feed
  ("I can prioritize power to the farm").
- **Dialogue panel**: portrait, profession, age, relationship standing (with a running score),
  mood, and a **"knows about" list** — the Knowledge layer surfaced directly in conversation;
  free-text exchanges grounded in what the citizen actually knows; reply options that create
  sim commitments.
- **Overlay quadrants** (Systems View): atmosphere/pressure heatmap, power grid as a node
  graph with load, temperature heatmap, crew activity map (working/idle/resting/eating/injured).
- **Detail View**: full-3D room interiors (e.g. hydroponics bay under grow lights) with live
  room telemetry (O2, temp) — inspection only.
- **Citizen status cards**: portrait, profession, energy/hunger/mood bars, current task.
- **Research tree**: e.g. air filtration → CO2 scrubber upgrade / water recovery → hydroponics
  efficiency → fungal blight treatment → closed-loop system — institutional capability growth.

## Gameplay philosophy

The player manages an institution, not individuals. People come and go; the ship survives. The
real protagonist is the civilization developing inside the spacecraft — over decades, with
aging, succession, and generational knowledge transfer. Direct citizen control exists only as
the hour-zero lone-survivor opening and fades as society forms.

## Design goal

Every interesting story emerges from interacting systems, never from scripts. Success sounds
like: *"The algae collapse started because our senior botanist died five years ago, nobody
understood the old nutrient recycling process anymore, maintenance was delayed by an EVA
accident, and by the time we noticed, the greenhouse ecosystem had already shifted."*

## Roadmap deltas from this pivot (2026-07-18)

Immediate (fold into current M3 wrap-up):
- `tools/ScenarioRunner` headless CLI + standalone csproj proving years-per-minute simulation.

M4 (re-scoped — "Depth of Matter" before threats):
- **ThermalSystem** (heat generation by machines/citizens, radiators, coolant loop) and
  **machine condition** (wear, efficiency, maintenance jobs, condition-driven failure) — the
  cascade backbone.
- Data-driven definition files for machines/recipes/crops.
- Systems View overlays (power/atmo/thermal/water lenses).

M5 (unchanged core + additions): LLM citizens (per LLM_CITIZENS.md, conformant), skills/
experience, aging + calendar; art pass incl. first Detail View room.

M6 (new): Knowledge & History layers — per-citizen skill/knowledge records, documentation
artifacts (MOSS scripts, manuals), knowledge transfer (teaching, apprenticeship), historical
event records feeding memories/behavior; social layer per GDD.

Threats/occupation (former M4 content) follow after the depth layers — pirates become another
pressure on an institution, not the core loop.
