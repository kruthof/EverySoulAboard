# PERILUNE — Vision & Differentiation

*Written 2026-07-20 at the founding of this repo (clean-room successor to `moonbase/`).
This document is the product north star. `ARCHITECTURE.md` says how, `PLAN.md` says when
and by whom. Legacy design history lives in `docs/legacy/` — still valid where not
superseded here.*

## One sentence

**A RimWorld-depth colony simulation aboard a drifting ship where every crew member is a
person you can actually talk to — and the game's story is written between you and them.**

## The pitch

RimWorld generates stories through systems and asks you to imagine the people. PERILUNE
generates the same systemic depth — atmosphere physics, power cascades, emergent failure,
factions — and then puts *real conversation* on top: crew who remember what happened to
them, hold grudges about it, tell you about it in their own voice, grieve their dead, and
change their behavior because of what you said to them. The emotional connection RimWorld
players invent in their heads is, here, an actual feature.

Pitch line: *"Dwarf Fortress meets Oxygen Not Included, crewed by people who remember."*

## The four pillars

1. **The simulation is the game.** Deterministic, UnityEngine-free, headless-runnable.
   No random events — every crisis emerges from operating conditions (a pump wears out
   because it ran hot because the radiator was starved because...). This is inherited
   from the moonbase codebase and is non-negotiable.

2. **People, not pawns.** Every citizen has a persona, episodic memory, relationships,
   knowledge, and a biography that accumulates. The LLM layer performs the character;
   the sim adjudicates everything. Free-form talk, bounded outcomes (the `CitizenEffect`
   whitelist). Works with Anthropic, OpenAI, Google, any OpenAI-compatible endpoint,
   Ollama local, or fully offline via templates — the game never *requires* a network.

3. **The ship is a society that travels.** The world is not a place events visit;
   it is a vessel that visits places. Expansion content, mid-game variety, and the
   answer to "is a single ship enough?" all come from the voyage structure (below),
   not from planetfall colony-building — that would make us RimWorld-minus.

4. **Automation is diegetic.** MOSS, the in-fiction scripting language, remains the
   mechanical differentiator for the engineer-brained half of the audience: the ship's
   nervous system is a language you learn by reading dead crew's scripts.

## The emotional engine (what "LLM integration" concretely means)

The differentiator is not "chatbot crew." It is a layered narrative machine, every layer
grounded in sim truth:

- **Conversation** — free-text dialogue with any citizen, streaming, in character,
  with sim-computed capability manifests bounding what talk can *do* (agree to jobs,
  reveal real facts, make promises the sim enforces). Designed in
  `legacy/LLM_CITIZENS.md`; carried forward with a multi-provider backend.
- **Memory & biography** — sim events become memory entries with importance/recency
  retrieval; old memories compact into a life summary. Every citizen's biography is
  readable in-game and grows without any LLM (templates); the LLM makes it *prose*.
- **The Chronicle** — the ship's log as a first-class artifact: day-stamped history
  (already a sim system) periodically rendered into written entries in the voice of
  whichever citizen currently holds the quartermaster/log-keeper role. Deaths produce
  eulogies delivered by the closest friend, referencing *real shared memories*. The
  chronicle survives the citizens who wrote it — late-game, reading year-one entries
  written by people now dead is the intended emotional payload.
- **The Director** — PERILUNE's answer to RimWorld's storyteller, with one hard rule:
  **the Director never rolls dice and never spawns events.** It watches the sim's real
  state (tension curve: resource margins, morale, threat posture, time since last
  crisis) and modulates *pacing through sim-legal levers only*: when the Lien schedules
  their next sortie within their doctrine window, when a trade tramp accepts a hail,
  when a solar storm forecast lands. It also *surfaces* drama: foreshadowing through
  found logs, chronicle emphasis, camera/alert suggestions. Failure cascades stay
  100% physical; the Director chooses when the world's exogenous actors act, inside
  bounds the player can read in the difficulty screen. (Honesty contract: physics
  constants never change with difficulty.)
- **Knowledge as mortality** — knowledge lives in people and documents, not in a global
  tech tree. When the only person who understood the nutrient recycler dies, that
  knowledge is gone unless she taught someone or wrote it down. This makes death
  mechanically grievable — the sim reason to feel what the chronicle makes you feel.

## World structure: the voyage (differentiation + content engine)

The game is structured as an open-ended voyage in acts. Act I is the proven GDD
scenario (`legacy/GDD.md`): last survivor aboard the Lien-occupied MSV Perilune,
recapture her deck by deck, rebuild a society. It remains the shipped campaign opening.

What follows answers "is the ship enough?" — the ship leaves, and **destinations come
to the map as ships and stations, not planets**:

- **Ports of call** — derelict vessels, dead stations, quarantine hulks, rendezvous
  with other ships. Each is a *bounded away-map* generated by the same procedural
  ship generator that builds playable ships — one generator, two jobs: your ship,
  and every place you visit. A generated derelict comes with a generated *history*
  (what failed, in what order, per the no-random-events cascade logic) whose traces
  are laid down physically: logs, bodies, barricades, a MOSS script that tells you
  exactly how they tried to save themselves. Sim-generated history, LLM-rendered
  prose, physically explorable — this is the content engine.
- **The Bridge: navigation & sensors as gameplay** — the ship gets a diegetic
  mini-computer: a nav/sensor console (same terminal fiction as MOSS) showing what the
  ship's *instruments* actually see. Space is a real, deterministic sim layer — a coarse
  system chart with drifting objects (comets, wrecks, stations, planetary bodies),
  reachable by burns that spend real delta-v and take real transit time. Nothing is
  revealed by magic: a contact exists in the game only when a powered antenna/telescope
  with line of sight and enough signal-to-noise picked it up, and *detections are
  knowledge* — they live in the sensor logs and in the heads of the crew who were on
  watch. A comet is a water-ice rendezvous; an unexplained thermal blip is next month's
  away mission; and `sensors.*`/`nav.*` are MOSS-readable, so players script their own
  sky surveys. The scientific-instrument fantasy (reading squiggly telemetry and
  *understanding* it) is the same fantasy as the atmosphere gauges — real units,
  honest physics, playable simplifications, all flagged.
- **Away missions** — a shuttle crew (your named people, with their skills, fears, and
  relationships) enters the away-map; the mothership sim keeps running. Risk is real:
  who you send matters, and who comes back changes the society.
- **The long arc** — fuel, destination choices, and encounters give the sandbox a
  spine: Act II self-sufficiency under way, Act III the destination decision. Losing
  the ship is the only game over; the epitaph is the Chronicle itself.

This structure is deliberately **modular**: a port-of-call *type* (new site archetypes,
new factions, new cargo, new persona pools, new arcs) is exactly the shape of a DLC.

## Business design: DLC-ready from day one (RimWorld model)

RimWorld's expansions work because the base game is a systems engine and expansions are
*content + one new system each*, layered without breaking saves or mods. We adopt that
shape structurally:

- **Everything is a content pack.** The base game itself ships as packs (`core`,
  `campaign-recapture`). A pack = manifest + `.def` files (machines, crops, thermal…)
  + MOSS rule scripts + sprite specs/sets + site archetypes + persona/trait/secret pools
  + narrative arc definitions. The engine enumerates packs; nothing in `Sim.Core` knows
  any pack by name.
- **Append-only compatibility discipline** (already proven in the codebase: chaptered
  saves with versioned readers, append-only enums, one-commit def rule) is what makes
  "install DLC mid-save" work: packs add chapters/defs; removing a pack degrades
  gracefully (missing defs → warn + default, like today's fail-soft def parser).
- **The art pipeline is a content factory.** spritegen (Gemini image API) turns a spec
  JSON into an integrated, style-enforced sprite set in one command — meaning a DLC's
  art cost is a spec + curation pass, not an artist-month. Same for portraits later.
- **Candidate DLC shapes** (design targets to keep the seams honest, not commitments):
  *Ports of Call* (site archetype packs), *Ideologies* (belief systems + traditions +
  the social layer deepened), *Generations* (births, aging, succession, education),
  *The Freeport* (trade/economy/diplomacy), *Biosphere* (crops, diseases, medicine),
  language/voice packs for citizen dialogue.
- **Mod surface = the same surface.** Because DLC uses only public content-pack
  channels, a modding community gets the identical toolkit for free — RimWorld's
  actual retention engine.

## Art ambition: strictly better than RimWorld, on a narrower surface

RimWorld's visual bar is low — small static top-down sprites, flat lighting, almost no
animation. We intend to beat it decisively, and the way we can afford to is *focus*:
every art dollar goes to one controlled surface (ship interiors, the crew, space seen
through sensors and windows) instead of being spread across biomes, terrain, flora and
fauna we don't need. The fidelity bar, concretely (targets owned by WS-ART/WS-CLIENT
in `PLAN.md`):

- **Native 128 px tiles** (double RimWorld's density; the shipped cyberpunk set is
  already 128) with per-asset scale grounding, facings, and per-crew stable variants.
- **Light is simulation.** Dynamic per-room lighting driven by the power sim — powered,
  brownout-amber, emergency-red, dead-dark; emissive machine states; breach and vacuum
  read visually. The art direction and the power system are the same feature.
- **Motion**: crew walk/carry/work cycles, machine animation states, door pressure
  hiss, atmosphere particles (venting fog, drifting dust), a living ship — not a
  diorama of statues.
- **Portraits** as identity anchors (persona-conditioned generation; portraits carry
  emotional connection in a colony sim — invest there, not in facial animation).
- **Cohesion enforced by pipeline, not discipline**: spritegen's palette-lock /
  hue-harmonisation, seam metrics, and regression contact sheets keep every asset —
  including future DLC packs — in one style by construction.
- **The screenshot test** (P2 exit): one unstaged frame of the slice ship must read
  *obviously* better than a RimWorld frame — density, lighting, mood. If it doesn't,
  WS-ART/WS-CLIENT stop feature work until it does.

## What we are explicitly NOT building

- Planetfall colony-building — not an ambition limit but a focus decision: competing
  with a decade of RimWorld's biome/creature content breadth would dilute exactly the
  art and sim budget we're concentrating to *beat* it on fidelity per screen.
- A 3D presentation. Dead. The glyph→skin projection is the presentation architecture;
  the web (sprite) skin is the shipping face — 2D at better-than-RimWorld fidelity.
- LLM-as-simulation. The LLM never decides facts, owns state, or rolls outcomes.
- Multiplayer, consoles, mobile. Desktop (macOS first, Windows at beta) via a packaged
  web client; browser dev-mode forever.

## Success criteria (the feel test)

- A player tells a story about their run and names crew members unprompted.
- A death makes a player stop playing for a minute — because the eulogy quoted a
  conversation *they had*.
- A non-programmer ships their first MOSS script; an engineer golfs their life support.
- A modder ships a content pack we didn't anticipate within a month of the tools docs.
- Streamers generate unrepeatable anecdotes (the LLM texture makes each run's *telling*
  unique, while determinism makes each run's *physics* fair).
