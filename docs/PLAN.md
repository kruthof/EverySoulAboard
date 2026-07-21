# PERILUNE — Implementation Plan

*2026-07-20. The execution companion to `VISION.md` (what) and `ARCHITECTURE.md` (how).
This plan is written to be run by **up to 10 parallel implementation agents plus one
integrator**. Everything here assumes the migrated baseline: 182 headless tests green,
ScenarioRunner determinism proof, working TUI/web skins, spritegen pipeline.*

## Why this codebase can be parallelized (the enabling contracts)

Parallel agent work dies on shared mutable surfaces. This architecture already has the
containment walls; the plan's job is to assign work so nobody crosses them unreviewed:

1. **The sim is modular by system.** A `*System` in the `SystemStack` owns its state,
   its save chapter, its defs section, its events. Two agents adding two systems touch
   disjoint files except for four *spine files* (below).
2. **Append-only enums & golden files** make cross-cutting contracts machine-checked:
   `GlyphColor`, glyph chars, save chapter FourCCs, the wire schema, `CitizenEffect`
   vocabulary. You extend; you never reorder or repurpose.
3. **Def rule**: a def field ships in ONE commit (default + parser key + checksum fold +
   equivalence test). Content tuning never blocks on code review.
4. **Projection purity + fog gate** mean presentation agents cannot corrupt the sim
   even by accident — hash tripwires fail their PR, not the game.
5. **Hosts own IO; the wire is semantic.** Client, art, and sim agents share only a
   schema document, not code.

### Spine files (integrator-gated, serialize all changes through one owner)

`Simulation.cs`, `SystemStack.cs`, `SaveWriter/SaveReader` chapter registry,
`GlyphColor`/glyph tables, `WireFormat.cs`, `Commands.cs`, the `CitizenEffect` record
set, `MachineDefs`/`SimDefs` top-level registry. Rule: an agent needing a spine change
writes the diff *in its PR description first*; the integrator applies spine changes in
a dedicated serialized lane (they are always small: one enum row, one chapter
registration, one system insertion into the stack order with a stated cadence).

### The integration loop (every workstream, every merge)

`~/.dotnet/dotnet test tests/Perilune.Tests` all green → ScenarioRunner twin-hash →
golden updates only when intended and explained in the commit → one commit per reviewed
work package. New systems must land with: save chapter + hash fold + round-trip test +
determinism coverage + zero-alloc compliance *in the same commit* (the inherited law).

---

## Phases

### P0 — Clean room (this week; mostly done the day this doc was written)
Migration from `moonbase/` (done by agent, verified 182 green), new docs, first commit.
Remaining P0 tasks, single-agent, sequential:
- **P0.1** Namespace rename `Moonbase.*` → `Perilune.*` (mechanical, whole-tree, one
  commit, goldens should NOT change — StateHash hashes state, not type names; verify).
- **P0.2** `sln` hygiene: `Directory.Build.props` (LangVersion, nullable, InvariantCulture
  analyzers), `.editorconfig`, CI script (`ci.sh`: test + dump smoke + scenario smoke).
- **P0.3** Delete/park legacy web-client hacks not carried forward; tag `v0-baseline`.

### P1 — Foundations (unblocks all 10 lanes; ~2–3 weeks of parallel work)
Goal: every workstream has its substrate and contract so P2 can run fully parallel.
- Sim.Content pack loader (WS-CONTENT) — packs enumerate, checksum-fold, override rules.
- Sim.Llm effect spine + TemplateBackend end-to-end (WS-LLM) — headless conversation
  round-trip test: outbox → template backend → validated effect → tick-boundary apply.
- Client skeleton (WS-CLIENT): WebGL layered renderer over the existing wire, feature
  parity with today's canvas skin (this is a port, not an invention).
- ShipGen validation gates V1–V7 runnable from ScenarioRunner CLI (WS-SHIPGEN).
- Space-layer spine: NavSystem/SensorSystem v0 (chart exists, one comet, one burn,
  one telescope device, detection math, save+hash) (WS-NAV).
- Social graph v0: pairwise opinion scores + mood-reason list (WS-SOCIAL).

**P1 exit test (the integration proof):** a headless scenario boots a *generated* ship,
a citizen forms an opinion, a telescope detects a comet, a template-backend conversation
yields a validated `RevealInfo`, and twin-run hashes match. That one test exercises six
workstreams' contracts.

### P2 — Vertical slice: "The Talking Ship" (the emotional-engine proof)
One authored ship, ~8 crew, no combat. Success = the VISION feel-test moments exist:
- Live LLM dialogue (Anthropic + one OpenAI-compat + Ollama) with streaming, memories,
  promises kept/broken, capability manifests.
- Chronicle v1: day entries rendered from HistorySystem; a death produces a eulogy
  referencing real shared memories.
- Client: inspector panels, dialogue window, citizen cards, portraits (art pipeline),
  readability at two zoom levels, first sim-driven lighting pass — and the
  **screenshot test** (VISION.md "Art ambition"): one unstaged slice frame must read
  obviously better than RimWorld or WS-ART/WS-CLIENT halt feature work until it does.
- Director v0: tension curve computed; one lever (Lien sortie window from legacy
  campaign OR life-support stress via designer rules) modulated within visible bounds.
- MOSS terminal IDE in-client (editor + diagnostics + audit log).

**Exit:** a 60-minute unscripted playtest where a tester names a crew member when
retelling it. (Plus: all automated gates, LLM cost meter shows <$0.50/hr defaults.)

### P3 — The Voyage (differentiation proof)
- Nav/sensors full loop: survey → contact → burn → rendezvous.
- Derelict generation: ShipGen archetype + generated-history engine (cascade replay →
  physical traces + logs) + away-mission mode (second sim instance, crew transfer,
  return merges consequences).
- Campaign Act I (recapture, from legacy GDD) playable start → first sortie survived.
- Content-pack packaging: `core` + `campaign-recapture` actually load as packs;
  a demo third pack ("one new comet type + one site archetype + one sprite set")
  built end-to-end as the DLC dry run.

**Exit:** a full session: recapture opening → first derelict boarded → a crew member
dies out there → the eulogy lands → the chronicle records it. DLC dry-run pack installs
into an existing save and uninstalls without bricking it.

### P4 — Society & depth
Knowledge/teaching/succession, aging + generations, factions + the Kagame-trial-class
systemic events, economy/trade (Freeport), full threat archetypes, Director v1,
Ollama-tier degradation polish, mod-tools documentation pass.

### P5 — Beta
Tauri packaging (macOS, then Windows), performance hardening (binary wire frames if
profiling demands), save-migration soak, difficulty/accessibility, store page assets
from the art pipeline, external playtests, localization scaffolding decision.

---

## The 10 workstreams (parallel lanes)

Each lane lists: owned paths (exclusive write access), contracts consumed/produced,
and its P1/P2 deliverables. Lanes touch spine files only via the integrator.

**WS-SOCIAL — Relationships & society** (`sim/Sim.Core/Social/`, social defs/tests)
Opinion graph, mood reasons, relationship types, faction clustering, systemic social
events. Produces: social state consumed by LLM prompts + Director. P1: opinion graph
v0. P2: relationship types + argument/bond events with memory writes.

**WS-PEOPLE — Skills, knowledge, lifecycle** (`sim/Sim.Core/People/`, related defs)
Skills/XP, teaching/apprenticeship, knowledge artifacts (documents as items), aging,
succession. Produces: knowledge records consumed by conversation manifests ("knows
about") and by WS-NARRATIVE. P1: skills v0 + knowledge record type. P2: teaching +
documentation items; death deletes unshared knowledge (the grief mechanic).

**WS-MATTER — Machines, economy, construction, cascade depth** (`sim/Sim.Core/Systems/`
matter systems, `content/core/SimDefs/`)
Coolant loop, machine failure modes, repair chains, stockpile/economy polish, new
devices — and the **build/refit vertical** (VISION "Making her yours"): designate →
haul materials → construct/deconstruct interior walls, doors, devices, floors;
compartment conversion with the atmosphere sim enforcing the seal-and-pressurize
cost. Also owns defs hygiene repo-wide. P1: coolant + failure-mode v1 as the cascade
showcase. P2: the slice ship's full matter loop balanced + build/refit v0 (wall/door/
device construction). P3: the hold as open build volume in the campaign.

**WS-SHIPGEN — Procedural ships & sites** (`sim/Sim.Gen/`)
Generator stages (Hull→Spine→Assign→…), validation gates V1–V7, site archetypes
(derelict, station, hulk), the generated-history engine (deterministic cascade replay
laying physical traces + log skeletons). P1: gates + `gen --seed N --validate` +
`sweep --count 100`. P2: generated ships pass survivability; P3: derelicts + history.

**WS-NAV — Space, navigation & sensors** (`sim/Sim.Core/Space/`, nav/sensor defs)
The system chart, delta-v/burn model, sensor devices + detection math,
detections-as-knowledge, `nav.*`/`sensors.*` MOSS namespaces. P1: spine v0 (one comet,
one telescope, one burn, saved+hashed). P2: survey gameplay + bridge-console data
feeds. P3: rendezvous → away-mission handoff with WS-SHIPGEN.

**WS-LLM — Provider runtime & effect spine** (`sim/Sim.Llm/`)
`IChatBackend` + adapters (Template first, then Anthropic, OpenAI-compat, Gemini,
Ollama), priority queue, capability manifests → strict tools/JSON envelope, validator
+ clamps, settings/keychain, cost meter, degradation chain. P1: spine + Template
round-trip headless. P2: three live providers + streaming + caching + cost meter.
Consumed by WS-NARRATIVE and the client dialogue UI.

**WS-NARRATIVE — Memory, chronicle, Director** (`sim/Sim.Core/Memory/`,
`sim/Sim.Core/Director/`, narrative content in packs)
Memory entries/retrieval/compaction, persona pools, the Chronicle renderer, eulogies,
found-log generation, Director tension curve + levers. The sim half is deterministic;
prose rendering consumes WS-LLM as P2 background jobs. P1: memory v0 (rule-table
writes, retrieval). P2: chronicle + eulogy + Director v0.

**WS-CLIENT — The shipping face** (`client/`, `hosts/web/` wire additions via
integrator)
WebGL layered renderer, camera, HTML UI shell (inspector, dialogue, citizen cards,
alerts, terminal IDE, chronicle reader, bridge console), input, Tauri at P5. P1:
parity port of the canvas skin + golden render tests. P2: the slice UI. Never blocks
on sim lanes: builds against recorded wire fixtures.

**WS-ART — Pipeline & content art** (`art/spritegen/`, sprite specs in packs)
Owns the VISION.md fidelity bar jointly with WS-CLIENT: 128 px density, animation
frame sets/state variants, portraits (persona-conditioned prompts), palette/theming
per pack, contact-sheet curation UX, style-lock regression shots, seam metrics.
P1: portrait pipeline v0 + one full ship tileset refresh + first animation-state
sprite sets (machine on/off/broken, pawn walk frames). P2: slice art complete —
and passes the screenshot test. Produces sprite sets consumed by WS-CLIENT via the
SPRITEGEN integration contract (never hand-edited).

**WS-MOSS — Automation & terminals** (`sim/Sim.Dsl/`)
v1 language (`on event:`, variables, script messaging), controller-module gating,
compute-as-resource, audit/dry-run tooling, designer-rule content, `nav./sensors./
ship.` namespace growth (with WS-NAV). P1: `on event:` + dry-run. P2: terminal IDE
backend contract for the client (compile diagnostics over the wire).

**WS-CONTENT — Packs, saves, DLC substrate** (`sim/Sim.Content/`, `content/`)
Pack manifest/discovery/merge, load-order determinism, checksum folding, save-manifest
+ graceful missing-pack degradation, the DLC dry-run pack (P3), modding docs (P4).
Smallest lane by volume, highest leverage for the business model — the integrator
often runs it directly.

### The integrator (the 11th chair — the main session, me)
Owns spine files, merge order, golden-file arbitration, cross-lane API disputes,
phase-exit test authorship, and the P0 tasks. Also owns this document — lanes change
scope only by editing PLAN.md through the integrator.

### Conflict rules (what makes 10 lanes actually safe)
- Exclusive write paths per lane as listed; a PR touching another lane's path or a
  spine file without an integrator note is rejected on sight.
- Cross-lane needs travel as **contract requests** (new event type, new def field, new
  wire field, new effect) — small, append-only, integrator-applied, then both lanes
  build against it.
- Golden files: only the lane that owns the *cause* of a diff may regenerate, with the
  why in the commit message.
- Every lane keeps the TUI dump green — it is how agents see the game and how CI sees
  everything.

---

## DLC readiness checklist (enforced from P1, audited each phase exit)

- [ ] No system in `Sim.Core` references a content pack by name.
- [ ] Every new tunable is a def field (one-commit rule), every new enum append-only.
- [ ] Saves record the pack manifest; missing-pack load degrades with warnings, never
      bricks (test exists and runs in CI).
- [ ] Site archetypes, persona pools, arcs, crops/machines/devices, sprite sets, and
      MOSS rule bundles are all pack channels — the P3 dry-run pack proves it.
- [ ] The art pipeline can produce a pack-consistent sprite set from a spec alone.
- [ ] Modding surface == DLC surface (no privileged internal channel).

## Risks (top 5, with owners)

1. **LLM emotional quality is a product bet, not an engineering certainty** — the slice
   (P2) exists to test it early; fallback posture: the sim+chronicle alone must still
   be a good RimWorld-like (WS-NARRATIVE keeps the template path first-class). 
2. **10-lane merge friction** — mitigated by spine serialization + append-only
   contracts; integrator watches lead-time-to-merge as the health metric.
3. **Client fidelity gap vs RimWorld** — WS-CLIENT is a port-then-polish lane with
   golden render tests; art pipeline throughput (WS-ART) is the real fidelity lever.
4. **Away-mission dual-sim complexity** (P3) — contained: second `Simulation` instance
   with a defined crew-transfer/return-merge contract; prototyped headless first.
5. **Cost/latency of LLM at scale** — inherited budget design (caching, routing,
   degradation chain, only-conversing-citizens-cost) + cost meter from P2 day one.
