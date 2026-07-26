# The character simulation — Big Five substrate, marks, and behaviour that surfaces — implementation plan

**Status:** PLAN ONLY. Nothing in this document is built. The branch carries this file and nothing
else. Three independent reviews (architecture/determinism, game-design/legibility,
psychological-validity/governance) gate it before any work package is chartered.

**The brief it serves (Garvin, verbatim in substance):** an *in-depth character simulation* —
possibly using **Big Five personality traits**; **personal history that shapes the way the person
thinks and acts now**; and **how incidents and current relationships impact him or her**.

**The one-line answer this plan gives:** adopt the Big Five as the **hashed generative substrate**
of a crew member's disposition, reject it as the **player-facing surface**, and make **every axis
buy a behaviour the player can watch on the standard play ship** — while personal history and
incidents live in a second, separate kind of state (**marks**) that history-blind `Mood` reads but
never stores. The whole thing runs in the deterministic offline sim core; an LLM may *narrate* a
personality, it never *is* one.

---

## 0. What was verified vs what is assumed

The reviewers should check this section first. Every claim below was read in this worktree
(`main` @ `96221cc`) at the cited line; the assumptions are separated and numbered.

### 0.1 Verified

**Character today is a dialogue prop, not a simulation.**
- `sim/Sim.Core/Citizens/PersonaSheet.cs:26-32` — `Traits` is `string[]` (*"3 from the trait
  pool"*), beside `Values`, `Fears`, `Secrets`, `RaidBackstory`, `SpeechStyle`,
  `RelationshipNotes`. The trait pool is twelve words (`PersonaSheet.cs:100-105`).
- The whole mind layer is **host-owned and unhashed**: `CitizenMemory.cs:165-166` — *"minds are
  not covered by Simulation.StateHash"*; `PersonaSheet.cs:36-37` — `RelationshipSecrets` is
  *"NOT hashed (excluded from the MEMS StateChecksum)"*. The MEMS checksum deliberately folds
  **structure only**, never prose (`CitizenMemory.cs:227-231`, `:470-517`).
- Consumers of `Traits`: dialogue prompt assembly and the roster wire
  (`hosts/web/GameSession.cs:1216` puts `traits` on the roster). **No sim system reads a trait.**
  A "meticulous" crew member and a "cowardly" one behave identically.

**`Mood` is hashed but deliberately memoryless.**
- Folded into the state hash at `sim/Sim.Core/Simulation.cs:404`; recomputed **fully every pass**
  at `sim/Sim.Core/Systems/NeedsSystem.cs:163-167`, with the contract stated at `:157-158`:
  *"Mood holds no history of its own, so nothing else may write it and expect the value to survive
  a second."* Its real range is −135..+20, *"NOT a percentage and NOT centred on zero"*
  (`NeedsSystem.cs:159-161`).
- Mood's consumers: `SocialSystem.RollPair`'s argument gate (`SocialSystem.cs:147-149`) and the
  Director chain — `ShipMetrics.cs:86` turns mean mood into `Morale`, `DirectorSystem.cs:82`
  weights tension with it, and `DirectorSystem.cs:41-46` names `WearPressure` *"the one sanctioned
  path by which crew mood reaches the economy."*
- `docs/MECHANICS.md` §13.4: `Fatigue` saturates at 1.0 after ~16 h with **no reducer anywhere**,
  so **mood is permanently ≤ −5 for every crew member from day 1 onward** — measured slice
  crew-mean −37.7 to −26.4. This compresses any mood-differentiation a character system builds,
  and this plan accounts for it (§5.3).

**The social/memory layer exists and is real sim machinery, not prose.**
- `SocialSystem.cs` — a sparse directed opinion graph, SYSS-saved, `'SOCL'`-checksummed
  (`:289-310`); deterministic argument/bond rolls from a forked stream (`:85`, `:144-163`);
  hysteresis relationship tiers (`:171-192`); one clamp entry point `Nudge` (`:206-226`).
- `CitizenMemory.cs` — capped episodic memory (`Cap = 120`, `:29`), rule-table event→memory writes
  (`MemorySystem.Tick`, `:263-309`), and the note that its importances are **consts, not defs**,
  because `SimDefs.cs` is an integrator-gated spine file (`:219-221`).
- `Chronicle.cs` / `HistorySystem.cs` — deterministic templated ship log with a hash-exempt
  `ProseOverride` slot for later LLM prose (`Chronicle.cs:19-26`); events are readable for exactly
  one tick after publish, so 1 Hz readers register `IntervalTicks => 1`
  (`HistorySystem.cs:72-75`).

**The cautionary precedent is already in the codebase: hashed personality-adjacent state that
nothing reads.** `Citizen.Health`, `Citizen.Morale` and `Citizen.Archetype` are saved and hashed
(`Simulation.cs:415-417`, CITZ v5) and **never written or read by any system**
(`docs/MECHANICS.md` §13.4, measured: Health and Morale are 1.00 for everyone always, and Morale
is what the CREW WATCH morale bar displays — a constant). `CitizenMind.FollowingPlayer` is the
same defect in the mind layer (§13.3). **This plan's central discipline — no axis ships without
its behaviour — exists because the repo has already shipped this failure three times.**

**The seams this plan hooks, verified individually:**
- Job recruitment gate: `JobSystem.cs:140` — `if (citizen.IsRecruitableForWork) TryAssign(...)`;
  `Citizen.cs:73` (`IsIdleForWork`), `:103` (`IsRecruitableForWork`). `JobSystem.cs` is
  integrator-owned by its own doc (`:11`) though not on the `CLAUDE.md` spine list.
- The selection pass is per-citizen and its refusal stamps are per-pass scratch:
  `JobSystem.cs:229` (`NextGen()` per `TryAssign`), `IJobSource.cs:125-132` (stamping contract),
  so a per-citizen candidate veto that stamps what it skips is contract-legal.
- Self-serve threshold: `SustenanceSystem.cs:100`, `:214`, `:228` compare Hunger/Thirst against
  `sim.Defs.Sustenance.NeedThreshold` (0.5, `SimDefs.cs:569`).
- Flee threshold: `SafetySystem.cs:61` reads `needs.FleeSuffocation` (0.5, `SimDefs.cs:562`);
  SafetySystem *"owns no saved state"* (its class doc) and returns to work below **half** the flee
  threshold.
- Wander cadence and radius: `CitizenSystem.cs:72-74` (`IdleCooldown`,
  `TryRandomWalkableTileNear`), `SimDefs.cs:260-283` (`CitizenDefs`; the deck confinement is a
  literal, `:273-281`, and this plan does not touch it).
- Social gates: `SocialSystem.cs:149-161` (`ArgumentChancePerPass` / `BondChancePerPass` behind
  mood + opinion gates); familiarize accrual at `:101-102`.
- The hoisted-instance pattern for cross-system reads: `SystemStack.cs:22-24` (Director built
  once, passed to `MachineWearSystem`, ticked at `:61`; consumers read *"the previous cadenced
  pass's value"*, `DirectorSystem.cs:38-39`). Lazy by-type resolution of an optional stack system
  is also an established pattern (`IJobSource.cs:74-76`). Registration order is load-bearing and
  fixes the SYSS fold order (`SystemStack.cs:40-49`).
- The parallel-store + `IStatefulSystem` route adds save + hash **without touching SaveWriter/
  SaveReader or `Simulation.StateHash`**: `CitizenMemory.cs:222-231` (MEMS *"rides the existing
  SYSS chapter — no SaveWriter/Reader edit"*), `Simulation.cs:385-390` (SYSS systems own their own
  checksums).
- Relationship seeding as a separate boot step after the stack exists is precedent
  (`PersonaSheet.cs:238-239`); authored-persona construction is RNG-free by contract
  (`PersonaSheet.cs:234-238`); generated-persona construction forks per citizen id and never
  advances `sim.Rng` (`PersonaSheet.cs:90-94`, `:176`).
- Death events survive the dead citizen's store removal by carrying the name, and the SOCL edges
  of a dead citizen persist (nothing removes edges on death; `SocialSystem` only skips `Dead` in
  accrual, `:92`) — so "how did the survivor feel about the dead" is readable one tick after a
  death (`HistorySystem.cs:92-97` documents the same-tick-removal hazard and its fix).
- The five determinism pins and the ritual for moving them: `CLAUDE.md` "Determinism proof"
  (scenario `00e0a2dadb8e5076`, tick-3000 `4be2e77864fb7409`, slice `c565a68b810f588d`, defs
  defaults `5a471d12643b64f9`, defs rules-inclusive `3f23ce5bd40283c8`). The def-field ritual:
  `content/core/SimDefs/README.def` "HANDOVER INVARIANT" (default + parser + checksum fold
  appended at END + equivalence test, one commit).
- The E2 charter this must mesh with: `docs/ECONOMY-PLAN.md:100-115` — *"Skills as new hashed
  `Citizen` state (never an extension of the unhashed persona)"*; mood as the second yield/defect
  modulator; *"the modulation is a pure function, never RNG."* And the governing principle doc:
  `docs/design/perilune-automation-and-souls.md` §4.1 (*material, not cosmetic*; *mood mostly
  emergent, never a meter you top up*) and §4.2 (*a mistake is a computed consequence, not luck*).
- The display surface is deferred by owner decision: the Persona window seam,
  `docs/design/perilune-console-retirement.plan.md` §1.5.4 (*"marked, not designed"*), and the
  `CREW_INTERACTION` pin in `client/test/surface-boundary.test.js` (CLAUDE.md "ONE door" invariant).
- Crew rosters this plan will differentiate: the grid ship's eight
  (`sim/Sim.Gen/AuthoredShips.cs:982-994`, all `AutoWander=true`, idle ~67 % of a sim-day per the
  CLAUDE.md snapshot — **idle time is the canvas most of this feature paints on**) and the slice's
  eight authored personas (`AuthoredShips.cs:452-673`).

### 0.2 Assumed (each is a review target)

- **A-1.** Registering one new `IStatefulSystem` whose seed folds unconditionally moves exactly
  the three StateHash pins (scenario, tick-3000, slice) and no golden else — by the W0-6 precedent
  (`CLAUDE.md`, four empty economy systems, *"Exactly 2 goldens moved each fold"* plus the
  scenario hash). **Predicted, not measured.** The deck-wander lane's lesson (*two pins held
  against expectation — so measure, never predict*) applies; WP-A measures.
- **A-2.** Float arithmetic in the new system is deterministic on the project's targets to the
  same degree the existing float state (`Mood`, opinions, needs) already relies on. No new class
  of float use is introduced (no transcendental functions on the tick path; decay uses a
  precomputed per-pass multiplier, §4.4).
- **A-3.** A host/worldgen boot step can reach the registered `PsycheSystem` instance the same way
  hosts reach other stack systems today (the `IJobSource.cs:74-76` lazy-resolution pattern, or the
  hoist). If no by-type lookup helper exists, the hoist alone suffices — `SystemStack` already
  demonstrates it — at the cost of one more integrator-reviewed line.
- **A-4.** The wander RNG consumed in `CitizenSystem.cs:74` is the per-concern forked stream E0-1
  introduced (not `sim.Rng` directly), so the extraversion re-draw (§3.2-E) perturbs no other
  system's stream. Verify at implementation; if it is `sim.Rng`, the seam forks its own stream
  first.
- **A-5.** Effect sizes proposed in §3.2 (the ±20–35 % bands) are **starting values for
  measurement**, not tuned truth. Every one is a def field; the acceptance protocol (§9.3) is what
  decides them.

---

## 1. The central architectural fact, and the shape of the move

The gap between the brief and the code is **not** "add more traits". Personality today lives
entirely in the host-owned prose layer and feeds *what a crew member says* (dialogue prompts) and
*what a tooltip shows* (roster traits) — and **nothing about what they do**. The brief asks for
character that *acts*: history shaping present behaviour, incidents and relationships changing what
a person does *now*. That state must therefore live where behaviour lives: in the deterministic,
hashed, saved sim core, consumed by the systems that decide movement, work, safety, eating and
arguing.

Equally important is what must **not** move: `Mood` stays memoryless. Its contract
(`NeedsSystem.cs:157-158`) is load-bearing — every consumer can trust that mood is a pure function
of the present, recomputed at 1 Hz. A design about history must not quietly turn mood into a
stateful accumulator; instead it gives mood a **stateful input**. History lives in a place designed
to hold it (marks, §4), and mood reads it the same way it reads hunger: as one more term in a full
recomputation.

So the model is two layers plus a projection:

```
PSYCHE AXES  (hashed, fixed at generation)  ──┐
                                              ├── deterministic modulations at 7 named seams (§3, §5)
MARKS        (hashed, event-written, decaying)┘        │
                                                       ▼
PROSE        (unhashed, host-owned: PersonaSheet, MEMS, Chronicle)
             becomes a VIEW of the two layers above — narration, never authority
```

The prose layer is not demoted — it is finally *grounded*. Today the twelve trait words are rolled
independently of everything; after this plan they are derived from the axes, so the word the
tooltip shows and the behaviour the map shows can never disagree.

---

## 2. Position on Big Five — adopted as substrate, rejected as surface, bound by warrant

The owner suggested Big Five; this section argues it rather than accepting it.

### 2.1 What it buys here

1. **Continuous variation.** The current trait pool draws 3 of 12 words; a 100-crew ship repeats
   itself within the first two dozen. Five continuous axes give every generated crew member a
   distinct disposition, cheaply (20 bytes), forever.
2. **Principled coverage with validated signs.** Big Five is the best-replicated *descriptive*
   taxonomy of adult personality variation. We use it exactly descriptively: as a **prior over
   behavioural parameters** — the literature's directional claims (conscientiousness ↔
   industriousness and impulse control; neuroticism ↔ threat sensitivity and stress reactivity;
   extraversion ↔ social approach; agreeableness ↔ interpersonal conflict; openness ↔
   exploration/learning) map one-to-one onto decision points this sim already has (job initiation,
   need deferral, flee threshold, proximity seeking, argument gates, wander scope, and — at E2 —
   learning rate). It is not asked to *generate* behaviour; it parameterises behaviour the sim
   already generates.
3. **Trait–state discipline for free.** The model was built to describe *stable* dispositions. That
   maps cleanly onto the design split this plan needs anyway: axes are stable (fixed at
   generation, §3.3), and everything the brief calls "history" and "incidents" is *state* — marks
   (§4) — which is also the psychologically defensible reading (adult trait rank-order stability
   is high; life events move states and specific behaviours far more than they move traits).

### 2.2 Where it fails alone, and the hybrid that follows

A naive OCEAN→action mapping produces five sliders that all read as "slightly more or less likely
to do the thing anyway" — invisible depth, which fails the project's thesis outright. Players
remember **words and incidents**, not scalar vectors. RimWorld's discrete traits are legible
because each owns a visible behaviour; Dwarf Fortress's continuous facets are deep and famously
illegible. The two genre data points bracket the answer:

- **Axes are hashed truth** (continuous, generative, never player-facing as bare numbers).
- **The surface is derived language and derived behaviour flags**: the existing twelve-word pool
  becomes a deterministic projection of axis extremes (e.g. `meticulous` ⇔ C ≥ +0.6, `restless` ⇔
  C ≤ −0.6, `garrulous` ⇔ E ≥ +0.6, `quiet…` speech ⇔ E ≤ −0.6, `haunted`/`cowardly` ⇔ N ≥ +0.6,
  `unbending` ⇔ A ≤ −0.6, `stoic` ⇔ N ≤ −0.6 — full table in the WP), plus mark-derived state
  lines ("Grieving — Tomas died two days ago") and prediction lines ("breaks for meals early";
  "will not work deck 5").
- **The axis-warrant rule (binding on every WP):** *an axis does not ship until at least one sim
  system reads it and a player-visible behaviour differs because of it.* This is the direct lesson
  of `Citizen.Health`/`Morale`/`Archetype` (§0.1): hashed state without a consumer is not depth,
  it is a lie with a checksum. Openness has the weakest v1 warrant and is therefore scheduled
  last and explicitly allowed to slip to E2 (§3.2-O) rather than shipping unread.

### 2.3 What is deliberately not adopted

No facets, no HEXACO/Honesty-Humility, no axis drift over a campaign, no player-visible
psychometric vocabulary ("your crew member is high in neuroticism" never appears in UI — the
derived words carry it). And one epistemic line for the governance reviewer: **this is not a claim
to simulate human psychology.** It is a claim to generate *legible, consistent characters* whose
variation borrows the sign structure of a validated descriptive model. Determinism makes them
predictable; predictability is the point (the player must be able to *know* a crew member), and it
is also precisely what real personality is not.

---

## 3. The model, layer 1: `PsycheState` axes

### 3.1 State, storage, save, hash

Per citizen, in a new parallel store owned by a new **`PsycheSystem : ISimSystem,
IStatefulSystem`** (seed `'PSYC'`), mirroring the `CitizenMinds`/`SocialSystem` store patterns
(list for deterministic iteration, dictionary for lookup only):

```
sealed class PsycheState {
    uint  CitizenId;
    float O, C, E, A, N;          // fixed at generation; [-1, +1]; 0 = neutral
    // -- marks (layer 2, §4) --
    List<Mark> Marks;             // capacity 16, fixed; lowest-weight eviction
    float PeakSuffocation;        // near-death tracker (§4.2), reset on recovery
    sbyte PeakDeck;
    // -- derived, recomputed each 1 Hz pass, hashed (they are read cross-system
    //    with one-pass latency, so they are state, not scratch) --
    float MoodPressure;           // Σ mark weight × kind mood-weight (× N gain)
    long  NextWorkReadyTick;      // conscientiousness dawdle (§3.2-C)
}
struct Mark { byte Kind; sbyte Deck; uint Subject; long Tick; float Weight; }
```

- **Why floats:** `Mood`, opinions and needs are all `float` (`Citizen.cs:46-50`,
  `OpinionEdge.Opinion`); axes in [−1, +1] match the house representation and multiply cleanly
  against def scalars. Hash folds bit patterns via the existing `XxHash64.Combine(float)`.
- **Why a parallel store and not fields on `Citizen`:** the `IStatefulSystem` route ships save +
  hash with **zero** edits to `SaveWriter`/`SaveReader`/`Simulation.StateHash` (the MEMS precedent,
  `CitizenMemory.cs:222-231`) — three spine files untouched. The one spine edit is the
  `SystemStack` registration + hoist. E2's charter (*"skills as new hashed `Citizen` state"*,
  `ECONOMY-PLAN.md:102`) is satisfied in spirit — hashed, saved, deterministic sim state, never an
  extension of the unhashed persona — and the store is documented as migratable onto `Citizen` if
  the integrator later prefers one CITZ chapter (an explicit reversibility note, not a hidden
  fork of E2's plan).
- **Checksum:** `'PSYC'` folds count, then per state: CitizenId, the five axis bit patterns,
  PeakSuffocation, PeakDeck, MoodPressure, NextWorkReadyTick, Marks.Count, then per mark Kind,
  Deck, Subject, Tick, Weight. Count-before-entries per the prefix-free fold doctrine
  (`Simulation.cs:299-308`). No strings anywhere in the state — prose belongs to MEMS.
- **Save:** SYSS chapter, `StateVersion => 1`, capture/restore field order mirrored 1:1, future
  version skipped cleanly (the `DirectorSystem.cs:113-115` pattern). Round-trip test in the same
  commit — the "add a field ⇒ save + hash + round-trip in the SAME commit" invariant applies to
  every field above from day one.

### 3.2 The seams — one axis, one owned behaviour, bounded

Every modulation below obeys three global guardrails, each with its own test:

- **G-1 Neutral is identity.** At axis value 0 and no marks, every multiplier is exactly 1.0 and
  every shift exactly 0.0. A sim full of neutral psyches is behaviour-identical to a sim without
  the system (§9.2's twin test). This is the property that lets the scenario and tick-3000 pins
  hold through the behavioural WPs (their crew stay neutral) and makes every modulation auditable.
- **G-2 The situation dominates.** Modulations are bounded shifts inside survivable bands; **no
  axis or mark value may disable a survival behaviour** — flee still fires for everyone
  (§3.2-N bounds), self-serve eating/drinking still fires for everyone (§3.2-C bounds), vacuum
  kills everyone at the same rate. Personality tilts choices; physics settles arguments. (This is
  also the psych-validity position: person–situation interactionism, with strong situations
  flattening trait expression.)
- **G-3 No dice.** `PsycheSystem` forks no RNG stream and rolls nothing. Every consequence is a
  computed function of hashed state — `automation-and-souls.md` §4.2 verbatim. (The one existing
  roll it *modulates* — SocialSystem's argument/bond chance — already has its own forked stream;
  the modulation moves the threshold, not the dice.)

| axis | seam (file:line today) | mechanism | the player sees |
|---|---|---|---|
| **C** conscientiousness | `JobSystem.cs:140` recruit gate | on job completion, `PsycheSystem` stamps `NextWorkReadyTick = now + dawdle`, where `dawdle = max(0, −C) × work_dawdle_max_s` (default 240 s at C=−1). **Deliberately one-sided:** today's job pickup is same-tick, so the identity point (C=0 ⇒ dawdle 0) *is* the shipped behaviour and there is nothing for C>0 to shorten — high C expresses through the second seam and grief resistance instead (§4.6). The gate becomes `IsRecruitableForWork && psyche.WantsWork(citizen)` — one integrator-reviewed line | after finishing a job the diligent crew member walks straight to the next; the lax one wanders a few minutes first. On a ship that is idle 67 % of the day, this is the single most visible differentiator |
| **C** (2nd) | `SustenanceSystem.cs:214,228` | effective self-serve threshold = `NeedThreshold + C × selfserve_shift_max`, clamped to [0.3, 0.85] (0.85 keeps a wide margin below starvation — hunger is mood-only until 1.0 and eating resets it, `NeedsSystem.cs:20-27`) | who drops work for lunch first, who finishes the weld hungry |
| **N** neuroticism | `SafetySystem.cs:61` | `fleeAt = FleeSuffocation × (1 − N × flee_shift_max)`, `flee_shift_max ≤ 0.3` so the band is [0.35, 0.65] around the shipped 0.5 — always well under lethal 1.0 with travel margin (the SafetySystem doc's own safety argument still holds at 0.65) | when air goes bad, the anxious one runs first; the steady one works longest — and *both always run* |
| **N** (2nd) | `NeedsSystem.cs:163-167` | the mark term (§4.5) enters mood as `− MoodPressure`, and `MoodPressure` is computed with gain `(1 + N × stress_gain_max)` — the same loss wounds the sensitive crew member more deeply and for longer | mood divergence after a shared incident; downstream, who ends up in arguments |
| **E** extraversion | `CitizenSystem.cs:74` wander target | **at E = 0: exactly one draw, taken as-is — today's code path and today's RNG-stream consumption, so a neutral crew member's wander trajectory is bit-identical** (G-1 includes the stream). At E ≠ 0: K draws (K = `wander_social_draws`, a fixed count whenever the branch is taken, for boundedness), each scored by same-room living-crew occupancy; pick argmax (E>0) / argmin (E<0); ties → first drawn. Deck confinement untouched (the Z pin is a literal and stays one) | who idles in the mess with the others, who idles alone at the far end of the spine |
| **E** (2nd) | `SocialSystem.cs:101-102` | per-direction familiarize accrual × `(1 + E_from × familiarize_gain_max)` | the extravert's RELATIONS web fills in faster |
| **A** agreeableness | `SocialSystem.cs:149-161` | argument chance × `(1 − min(A_a,A_b) × argument_gate_gain_max)`; bond chance × `(1 + max-based symmetric form)`. The mood/opinion gates are untouched — A modulates *propensity inside an open gate*, and note honestly: with fatigue-saturated mood the argument mood gate is permanently open for all crew today (§0.1), so A is the *effective* differentiator until beds exist | over days, who feuds and who bonds — directly visible on the RELATIONS web |
| **O** openness | `CitizenSystem` wander radius; **charter: E2** | v1 (weak, stated as weak): wander radius × `(1 + O × wander_radius_gain_max)`, X/Y only. The **real** consumer is chartered, not built: E2 skill acquisition rate × `(1 + O × learning_gain)` — written into this plan as a contract line for the E2 lane | rovers vs homebodies now; fast cross-trainers at E2 |

**Why the C seam is not a distance bias in job selection:** the dispatcher's argmin is a threaded
running minimum with a strict-`<` contract and registration-order tie-breaks
(`JobSystem.cs:234-247`, `IJobSource.cs:115-124`); injecting per-citizen distance scaling there
corrupts the filtering of every source after the biased one and is exactly the class of change the
dispatcher exists to refuse. The recruit-gate delay achieves the visible behaviour ("slow to start
work") without touching arbitration. The mark-driven deck veto (§4.6) likewise uses the sanctioned
stamp-and-skip path, not distance.

### 3.3 Generation, authoring, and the prose projection

- **Generated crew:** axes rolled at worldgen from a **forked** stream (`Fork(PSYC_STREAM +
  citizen.Id)` — the `PersonaGenerator.CreateMind` pattern, `PersonaSheet.cs:90-94`, `:176`),
  advancing `sim.Rng` never. Distribution: sum of two uniform draws, scaled to [−1,1] (cheap
  triangular — mild central tendency so extremes are notable, not the norm; no Gaussian machinery).
- **Authored crew:** `CitizenSpec` (`Sim.Gen`) gains five optional axis fields; `AuthoredShips`
  sets them for the slice and grid eight, RNG-free (the `CreateAuthoredMind` contract,
  `PersonaSheet.cs:234-238`). Grid crew are authored to *spread* — the standard play ship is the
  legibility acceptance rig (§9.3). Scenario-host `AddCitizen` crew stay neutral (identity).
- **The prose projection:** `PersonaGenerator.CreateMind` stops rolling `Traits` independently and
  derives them from the citizen's axes via the fixed table (§2.2); axis extremes also bias (not
  determine) `SpeechStyle` selection. Authored personas are checked the other way: a lint-style
  test asserts each slice crew member's authored trait words are *consistent* with their authored
  axes under the same table (a "meticulous" sheet over C=−0.8 fails the build). Fears/Values stay
  pooled prose. All of this is host/mind-layer work — unhashed, pin-free — and it is what makes
  the tooltip stop lying.
- **The LLM boundary is unchanged:** backends still reach the sim only through the validated
  `CitizenEffect` whitelist (`CitizenEffects.cs:15-19` — *"anything not representable here is
  unrepresentable"*), and **this plan adds no effect kind**. Axes and marks are never writable by
  any narrative source; the dialogue layer may *read* them (prompt colour: "you are grieving") the
  same way it reads mood today. Fully playable offline, by construction.

---

## 4. The model, layer 2: marks — history that acts

### 4.1 What a mark is

A **mark** is one bounded, hashed record of something that happened to this person and still
weighs on them: `{Kind, Deck, Subject, Tick, Weight}`. Marks are the durable state the brief's
"personal history" and "incidents" clauses require, and they are deliberately **numbers, not
prose**: the MEMS episodic memory (`CitizenMemory.cs`) keeps remembering in words for dialogue and
the eulogy; marks remember in weights for behaviour. One event may write both — through the same
event bus, into two stores with two jobs. *MEMS is what they say about it; PSYC is what it does to
them.*

### 4.2 v1 kinds — strictly bound to events and state that exist

| kind | written when (all verified sources) | Subject / Deck | initial weight |
|---|---|---|---|
| **Bereavement** | `CitizenDiedEvent` read next tick; weight from the survivor's SOCL tier toward the dead at death — `GetRelation` (`SocialSystem.cs:74-75`; edges persist past death, §0.1) | dead cid / 0 | `bereavement_weight_{closefriend,friend,other}` (defaults 1.0 / 0.6 / 0.15 — a stranger's death is a ship-wide MEMS memory already, `CitizenMemory.cs:206-207`; the *mark* is for losing someone who mattered) |
| **NearDeath** | `PsycheSystem`'s 1 Hz pass tracks `PeakSuffocation`/`PeakDeck`; when Suffocation recovers below `FleeSuffocation/2` (SafetySystem's own return-to-work level) after a peak ≥ `near_death_threshold` (default 0.8), write and reset | 0 / peak deck | `near_death_weight` (default 0.8) |
| **Feud** | `RelationshipChangedEvent` with `NewRel == Enemy` (`SocialSystem.cs:123-129`) | other cid / 0 | `feud_weight` (default 0.5); removed (not decayed) if the pair later leaves Enemy |
| **RaidTrauma** | seeded at generation/authoring — every survivor of the Lien raid carries one, weight rolled from the persona fork (generated) or authored (slice/grid) | 0 / 0 | authored; floor > 0 (the backstory is permanent) |

**What the brief names that has NO sim event yet — stated, not smuggled:** *betrayal* and *rescue*
have no mechanical source (no combat, no rescue verb, no promise-breaking signal — the latter is
already a known deferral, `CitizenMemory.cs:211-213`). Their `MarkKind` values are **reserved in
the enum and not written by v1**. They arrive when a system can emit them (raiders, the
promise-window contract request), and reserving the ids now is what keeps the save format stable
then. A reviewer should treat any v1 code path that *writes* them as a defect.

### 4.3 Bounds

Capacity 16 per citizen, fixed; on overflow the lowest-weight mark is evicted unless the newcomer
is the lowest (the `CitizenMemory.Add` policy, `:37-44`). At 24 bytes a mark, the whole mark store
for a 200-crew ship is < 80 KB. Unbounded history is unhashable and unaffordable; 16 weighted,
decaying slots is a *character*, not an archive — the archive is MEMS and the Chronicle.

### 4.4 Decay

Per 1 Hz pass: `Weight *= decay_per_pass`, where `decay_per_pass` is precomputed from
`mark_half_life_hours` (default 48 h — matching the MEMS recency half-life of 2 sim-days,
`CitizenMemory.cs:30`) once per tick from defs (parallel-sim safety: read each pass like
`NeedsSystem` reads its defs, `NeedsSystem.cs:78`). Per-kind floors: `bereavement_floor_closefriend`
(default 0.15) and the RaidTrauma floor — grief for a close friend never fully leaves; it becomes
a quiet permanent term, which is both honest and cheap. A mark below `mark_epsilon` with floor 0 is
removed (swap-remove is forbidden — order is hashed; remove-at preserving order, off the tick hot
path and O(16)).

### 4.5 Marks → mood: the memoryless contract, kept

`PsycheSystem`'s 1 Hz pass recomputes `MoodPressure = Σ Weight × mood_weight[Kind] ×
(1 + N × stress_gain_max)` per citizen. `NeedsSystem.cs:163-167` gains one term:

```
citizen.Mood = MoodBase − …existing four terms… − psyche.MoodPressure(citizen)   // 0 when absent
```

Mood remains **fully recomputed every pass from current state** — `MoodPressure` is current state
(the durable thing is the mark, not the mood). The contract sentence at `NeedsSystem.cs:157-158`
stays true and its doc comment is updated to name the new input in the same commit. Latency: one
1 Hz pass (the Director-hoist convention, `DirectorSystem.cs:38-39`); `PsycheSystem` registers
**between `SocialSystem` and `ExplorationSystem`** (§6), so NeedsSystem reads last pass's pressure.
Downstream, this is how history reaches the economy **through the one sanctioned channel and no
other**: mark → mood → `ShipMetrics.Morale` → Director tension → `WearPressure`
(`DirectorSystem.cs:41-46`). This plan opens no second private channel into the economy; the
behavioural seams act on *labour supply through visible behaviour* (a person walking, resting,
refusing), which is the operator-model spirit — and at E2 the operator's yield function consumes
`Mood`, which marks already feed.

### 4.6 Marks → behaviour: the two v1 consequences

1. **Deck aversion (NearDeath).** While a NearDeath mark's weight ≥ `deck_aversion_min_weight`
   (default 0.4), the citizen refuses auto-work whose `JobTarget.Z` equals the mark's deck: each
   `IJobSource.Select` calls a shared static `PsycheVeto.Blocks(psyche, citizen, pos)` where it
   already checks backoffs, stamping what it skips — per-pass scratch stamps, contract-legal
   (`JobSystem.cs:229`, `IJobSource.cs:125-132`). Bounds, all three load-bearing:
   the veto never applies to `Flee` (SafetySystem doesn't dispatch through sources anyway),
   never to Eat/Drink (SustenanceSystem doesn't either — verified seam list §0.1), and never to
   the citizen's **current** deck (a person cannot be trapped by their own fear). A player
   `MoveCitizenCommand` overrides it — orders are orders; what the player cannot do is make the
   auto-dispatcher send them back. The job a fearful citizen refuses stays on the board for
   everyone else — no livelock, just visible, explicable labour allocation: *"Sato won't go back
   to deck 5."* It decays away as the mark does.
2. **Grief slows the hand (Bereavement).** Active Bereavement weight adds its own dawdle term:
   `dawdle += Weight × grief_dawdle_s × (1 − C × grief_damp)` — **additive**, not a multiplier on
   the C-dawdle, so grief visibly slows *everyone* (a high-C crew member's base dawdle is zero,
   §3.2-C, and a multiplier would make their grief invisible); conscientiousness damps it rather
   than erasing it. Identity holds: no mark ⇒ no term. A grieving crew member takes longer to
   return to work, scaled by how much the dead person mattered *to them* (the SOCL tier at death).
   This is the brief's third clause closing the loop: **a current relationship changes how an
   incident lands, and the incident changes present behaviour.**

### 4.7 Marks → narration

`PsycheSystem` publishes `MarkFormedEvent {CitizenId, Kind, Subject, Weight}` (and
`MarkFadedEvent` when a floor-less mark expires). Consumers in this plan: `HistorySystem` adds one
templated line per formation ("Okonjo has not been the same since Novak died") — `HistorySystem` is
not a spine file and already owns the event→line pattern. MEMS consumption (an episodic memory per
mark) is filed as a **contract request**, not done here, because MemorySystem's importances are
integrator-gated consts (`CitizenMemory.cs:219-221`). The eulogy and Chronicle get mark-aware prose
for free through HistorySystem's entries.

---

## 5. Incidents and current relationships acting NOW — the assembled loops

Reading §3 and §4 together, the brief's three clauses become five closed, watchable loops:

1. **Disposition → daily texture.** C/E/O shape the idle 67 % of the grid ship's day: who starts
   work instantly, who lingers, who idles in company, who roams far. No event needed; visible in
   the first watched hour.
2. **Disposition → social structure.** A and E shape the SOCL web's growth and conflict rate; over
   days the RELATIONS view shows *this* crew's particular web, not a generic one.
3. **Relationship × incident → history.** A death writes Bereavement scaled by the survivor's
   actual relationship tier at that moment. Eight crew get eight different marks from one event —
   the difference IS the relationship.
4. **History → present behaviour.** Marks push mood (through the memoryless recompute), slow the
   grieving, and keep the nearly-killed off the deck that nearly killed them — each with a
   one-line, player-legible explanation the Persona window can show.
5. **History → economy, through the one door.** Mark pressure → mood → Morale → Director →
   `WearPressure` today; mood → operator yield at E2. No new channel.

### 5.3 The fatigue confound, named

`docs/MECHANICS.md` §13.4: fatigue saturates for everyone at ~16 h and never recovers, flooring
mood at ≤ −5 permanently. Two consequences this plan owns rather than hides: (a) mood-mediated
differentiation is compressed until a fatigue reducer exists (beds are inert furniture today), so
v1's *visible* differentiation deliberately rides behaviour seams (dawdle, flee, wander, veto)
more than mood; (b) the argument gate's mood condition is already permanently open for all crew,
so the A-axis modulation is measurable immediately (§9.3). The plan does **not** fix fatigue — out
of scope, already a §13 known gap — but any reviewer measuring mood spreads must control for the
saturated floor.

---

## 6. The seams in tick order

`SystemStack.CreateDefault` (`SystemStack.cs:20-67`), one hoisted instance, registration between
`SocialSystem` and `ExplorationSystem`:

```
var psyche = new PsycheSystem();                    // hoisted (Director precedent, :22-24)
...
new CitizenSystem(psyche),        // reads: E wander bias, O radius scale (prev-pass state)
new JobSystem(psyche),            // reads: WantsWork gate (:140) + PsycheVeto via sources
new SustenanceSystem(psyche),     // reads: C self-serve shift
...
new NeedsSystem(psyche),          // reads: MoodPressure (prev pass) in the mood recompute
new SafetySystem(psyche),         // reads: N flee shift
new SocialSystem(psyche),         // reads: E familiarize gain, A gate gains
psyche,                           // ← ticks HERE: consumes events (deaths, relationship
                                  //   changes) published up-stack this tick readable now;
                                  //   reads this tick's settled Suffocation (NeedsSystem
                                  //   already ran); recomputes MoodPressure/decay at 1 Hz;
                                  //   IntervalTicks = 1 for the event reads (bus is
                                  //   double-buffered — HistorySystem.cs:72-75), decay and
                                  //   derived-state work gated to the 1 Hz boundary
new ExplorationSystem(), ...
```

Every consumer takes the instance as an **optional constructor parameter defaulting to null** and
is exactly identity when absent (the "inert, not throw, when the system it needs is absent"
convention, `IJobSource.cs:76`) — so every existing test that builds partial stacks is untouched,
and the null-psyche path *is* the G-1 identity leg. All consumers read **previous-pass** derived
state; one second of latency on a disposition is imperceptible and buys freedom from ordering
fights. Registration position is load-bearing for the SYSS fold order and is therefore fixed here,
in the plan, not chosen by the implementing lane (`SystemStack.cs:47-49` precedent).

**Spine inventory for the whole plan:** `SystemStack.cs` (registration + hoist + consumer
params) — one integrator-reviewed package touch. `Simulation.cs`, save chapters, `Commands`,
`GlyphColor`, `WireFormat`, `CitizenEffect` set: **untouched** (WireFormat only if a later
Persona-window lane wants a `psyche` channel — not this plan). `JobSystem.cs` is integrator-owned
by file doc and gets the one-line gate change in the same integrator package.

---

## 7. Costs, stated honestly

- **Per-citizen bytes (hashed state):** axes 20 + peak tracker 5 + derived 12 + marks ≤ 16 × 24 =
  384 → **≈ 421 B/citizen** hashed and saved; 8 crew ≈ 3.4 KB, a 200-crew ship ≈ 84 KB. The MEMS
  store already carries ~120 prose entries per minded citizen; PSYC is small beside it.
- **Per-tick work:** every tick — event span reads (usually empty). Per 1 Hz pass — O(citizens ×
  marks) float multiplies (8 × 16 on the slice), the mood-pressure sums, and the dawdle stamps.
  Zero steady-state allocation: fixed-capacity mark lists, struct entries, no dictionary
  iteration, no LINQ; a mark *formation* allocates only if the list grows past its prebuilt
  capacity, which it cannot (capacity 16 built at store creation).
- **StateChecksum cost:** ~(10 + 5 × marks) Combines per citizen ≈ 90 worst-case — noise against
  the measured 14,657 device-name Combines already in the fold (`Simulation.cs:341-345`), and
  `StateHash` is not a tick path (`:278`).
- **Def fields:** one new `[psyche]` scalar section, **~20 fields** (the §3.2/§4 named knobs:
  9 axis scalars, ~11 mark/decay/veto scalars). Each ships under the four-part one-commit ritual
  (`README.def` "HANDOVER INVARIANT"), appended to the checksum fold — so **both defs pins move
  with each def-adding WP**, and the WP table says which.
- **Pins, predicted (measure per WP, never quote the prediction):** WP-A moves scenario +
  tick-3000 + slice (unconditional `'PSYC'` fold; A-1) and neither defs pin (no fields yet).
  Behavioural WPs move the defs pins (new fields) and the **slice** golden (authored non-neutral
  axes + AutoWander crew); scenario and tick-3000 are *predicted* to hold — scenario crew are
  neutral `AddCitizen` crew, Perilune's two are neutral and `HoldPosition = true`
  (`AuthoredShips.cs:170-171`) — but the deck-wander lane held two pins against expectation for
  two *different* reasons, so each WP measures all five and records why each moved or held.

---

## 8. What the Persona window must be able to show (not designed here)

The window itself is deferred by owner decision (`console-retirement.plan.md` §1.5.4; the
`CREW_INTERACTION` pin). This plan's obligation is that the model be *showable* in one. Everything
below is derivable from PSYC + SOCL + MEMS with **no further sim state**:

1. **Identity line** — the derived trait words (the axis projection, §3.3), speech style, roles.
2. **State line** — the top active marks rendered: *"Grieving Novak — two days"*, *"Shaken — a
   close call on deck 5"*, with weight-driven emphasis and honest fading.
3. **Prediction lines** — behaviour flags computed from the same functions the sim runs:
   *"Slow to return to work"* (dawdle > threshold), *"Will not take work on deck 5"* (veto
   active), *"Breaks for meals early"*, *"Flees danger early"*. These are the legibility payoff:
   the player can check a prediction against the map within minutes.
4. **Relationships** — the existing RELATIONS data (tiers, opinions), plus which marks reference
   which people (Bereavement/Feud subjects).
5. **History** — MEMS top-k memories and the Chronicle/eulogy lines, including the
   mark-formation lines (§4.7).

A future `psyche` wire channel (or roster extension) carries 1–3; it is a `WireFormat` change and
belongs to the Persona-window lane, not this one.

---

## 9. Work packages

House format: disjoint file sets, one reviewable claim each, spine flags explicit, small enough
for one Opus implementer and one independent reviewer to kill. Per the standing orchestration
rules: each package in its own worktree, private log filenames, every named mutation physically
applied and watched to go red.

| WP | what | files (disjoint) | reviewable claim | spine? | pins (measure!) |
|---|---|---|---|---|---|
| **WP-A** | `PsycheSystem` + store + save/hash/round-trip + registration + hoist + null-param consumers (all identity) + generation fork (axes rolled, nothing read yet) | `sim/Sim.Core/Citizens/PsycheSystem.cs` (new); `sim/Sim.Core/SystemStack.cs`; one-line optional ctor params in the 6 consumer systems; `tests/…/PsycheStateTests.cs` (new) | save/load round-trips byte-identically; `'PSYC'` folds; **twin test: a stack with neutral PsycheSystem vs without it — every `Citizen` field identical over 3 000 ticks** (G-1); axis roll advances `sim.Rng` by zero draws | **yes** (`SystemStack`) | scenario + tick-3000 + slice (fold-only, predicted); defs pins hold |
| **WP-B** | the C seam: dawdle + self-serve shift + `[psyche]` defs (first tranche) + slice/grid authored axes | `PsycheSystem.cs`†; `JobSystem.cs` (the one gate line — integrator); `SustenanceSystem.cs`; `SimDefs.cs`/`DefsParser.cs` (def ritual); `AuthoredShips.cs` (CitizenSpec axes); tests | on the slice with authored C-spread, per-citizen idle share spreads measurably (§9.3-M1) and the all-neutral leg is byte-identical to WP-A; identity at axis 0 holds *by construction* (one-sided/shift forms, §3.2), asserted per seam — def defaults may be non-zero | **yes** (integrator gate line; defs are spine-adjacent) | slice + both defs move; scenario/tick-3000 predicted hold |
| **WP-C** | the N seam: flee shift + stress gain | `PsycheSystem.cs`†; `SafetySystem.cs`; `NeedsSystem.cs` (the one mood term + doc-comment update, same commit); defs tranche; tests incl. a **bounds test: N=±1 never disables flee and never exceeds the [0.35, 0.65] band** (G-2) | flee onset ticks differ by authored N in a bad-air fixture; identical at N=0 | no | slice + defs move |
| **WP-D** | marks: formation (Bereavement/NearDeath/Feud/RaidTrauma), decay, floors, eviction, `MoodPressure`, `MarkFormedEvent` → HistorySystem line | `PsycheSystem.cs`†; `HistorySystem.cs`; events file; defs tranche; tests | a death writes tier-scaled marks to survivors (driven: befriend, kill, assert weights); decay halves on schedule; cap evicts lowest; **reserved kinds are never written** (§4.2) | no | slice + defs move |
| **WP-E** | marks → behaviour: deck veto (`PsycheVeto` + the four `Select` call sites) + grief dawdle gain | `PsycheSystem.cs`†; `Jobs/PsycheVeto.cs` (new); one-line calls in `DigJobSource.cs`/`HaulJobSource.cs`/`BuildJobSource.cs`/`DeconstructJobSource.cs`; tests | a marked citizen never auto-takes marked-deck work while others do (driven both ways); the three veto bounds (§4.6) each have a test whose mutation bites; no dispatcher throw (stamping proven under exhaustion) | no | slice + defs move |
| **WP-F** | the E + A social seams + E wander bias | `PsycheSystem.cs`†; `SocialSystem.cs`; `CitizenSystem.cs`; defs tranche; tests | argument/bond counts over 3 sim-days differ by authored A pairing (§9.3-M3); extravert idles co-located more than introvert (measured room-share); neutral leg identical | no | slice + defs move |
| **WP-G** | the prose projection: traits derived from axes; authored-consistency lint; O wander scale (the weak seam, labelled weak) + the E2 contract note in `ECONOMY-PLAN.md` | `PersonaSheet.cs` (generator only); `AuthoredShips.cs`†; `CitizenSystem.cs`†; `docs/ECONOMY-PLAN.md`; tests | generated trait words are a pure function of axes; every slice sheet passes the consistency lint; O=±1 changes wander spread | no | slice + defs move (O field); mind-layer parts pin-free |
| **WP-H** | docs + re-pin: `MECHANICS.md` (new § + §13 updates — including striking the "no sim system reads a trait" sentence this plan makes false), `CLAUDE.md` pins table, `HANDOVER.md`, memory | docs only, integrator on main | every quoted number re-measured on the merged tree | re-pin commit | — |

† sequential on the shared file; {WP-C, WP-D} may run in parallel after WP-B only if `PsycheSystem.cs`
is pre-split (formation vs modulation partials); default is the serial chain.

**Order and dependency reasoning:** A → B → C → D → E → F → G → H.
- **A first, and it is deliberately *almost* a violation of its own axis-warrant rule:** it ships
  axes nothing reads. It is tolerated for exactly one review cycle because (i) it is the
  fold-only pin move, batched once (the W0-6 precedent), and (ii) the rule is enforced at the
  *lane* level: **the lane may not merge to main until WP-B and WP-C are green** — the plan's
  own acceptance says so, and the integrator holds the merge.
- **B before C–F:** B carries the def-section scaffolding, the `CitizenSpec` authoring channel and
  the first behavioural proof; every later seam reuses all three.
- **D before E:** the veto consumes marks.
- **G last:** the projection should describe axes that already act; deriving prose from inert
  axes would re-create today's lie in a new form.

### 9.2 The identity gate (runs in every WP)

Two legs, both driven: (1) the WP-A twin test (neutral system vs no system, field-identical
citizens at tick 3 000); (2) from WP-B on, an **all-neutral occupancy leg** — `--ship slice
--days 1` with authored axes zeroed by a test hook must produce byte-identical occupancy tables
and StateHash trajectory to the same build with the seam code paths compiled in and the shipped
(non-zero) def scalars — identity must come from the axis-0/no-mark construction, not from
zeroed defs. Any drift in a neutral leg is a G-1 violation and blocks the WP.

### 9.3 Acceptance measurements (the depth-that-surfaces gate)

- **M1 (C):** slice, 1 sim-day, authored C spread [−0.8 … +0.8]: per-citizen idle-`None` share
  spread ≥ 5 pp between C extremes (idle is ~67 % of the day; a dawdle that does not move whole
  percentage points is cosmetic — `automation-and-souls.md` §4.1). Expect the *ship* A1/occupancy
  aggregate to move; that is the feature, and the A1 trap note applies: do not read A1 as the
  success metric, read the per-citizen spread.
- **M2 (N):** bad-air fixture: flee onset tick strictly ordered by N across three crew; all three
  survive.
- **M3 (A/E):** slice, 3 sim-days: argument events per low-A pair ≥ 2× the high-A pair count at
  equal co-location (measured, seed-paired); extravert co-located idle share ≥ 1.5× introvert's.
- **M4 (marks):** kill one slice crew member at a scripted tick; assert the CloseFriend survivor's
  MoodPressure, dawdle and History line, and their decay curve at day boundaries.
- **M5 (the legibility protocol, the one that matters):** grid ship, one observed sim-day, the
  eight authored crew spread across the axes. A person given the axis sheet and the running game
  — not the logs — matches **≥ 6 of 8** crew to their descriptions from behaviour alone. This is
  a human gate, like the console-retirement play-through gate, and it is the project's thesis
  ("a person you can know") made falsifiable.

---

## 10. Honest limits, and what is deliberately not designed

1. **The Persona window** — deferred by owner decision; §8 is the contract, not the design.
2. **Skills and the operator yield function** — E2's, untouched; this plan writes the O→learning
   and mood→yield contract lines into E2's charter and stops there.
3. **Betrayal, rescue, broken promises** as mark sources — no emitting mechanics exist; kinds
   reserved, unwritten (§4.2).
4. **Axis drift** (personality change over a campaign) — not designed; axes are fixed. If ever
   wanted, it is a new design decision, not a tuning knob.
5. **The fatigue confound** (§5.3) — named, controlled for in measurement, not fixed here.
6. **Mood stays a linear sum** — no diminishing returns, no interaction terms beyond the N gain;
   the formula's shape is NeedsSystem's, this plan only adds a term.
7. **`Faction`/`Health`/`Morale`/`Archetype`** stay dead — this plan does not adopt or repair the
   raider-groundwork fields; it only cites them as the warning.
8. **No new wire channel, no UI work** — the modern surfaces show nothing new until the
   Persona-window lane; v1's visibility is *behaviour on the map* plus HistorySystem lines, which
   the Chronicle and eulogy already surface.
9. **Effect sizes are priors** (A-5) — every band in §3.2 is a def default awaiting M1–M5; the
   plan commits to the *mechanisms* and the *bounds*, not the numbers.
10. **Crew-scale ceiling untested** — the pass is O(n × marks) and the social pass is already
    O(n²); nothing here worsens the asymptotics, but no 200-crew measurement exists and none is
    claimed.

---

## 11. Wrong if — the ways an implementer could satisfy the letter and betray the plan

- **W-1 Neutral is not identity.** Any modulation whose value at axis 0 / no marks differs from
  shipped behaviour. Two subtle forms both count: a formula whose neutral point is not the shipped
  behaviour (e.g. a symmetric `(1−C)/2 × max` dawdle, which is max/2 at C=0 — the reason §3.2-C is
  the one-sided `max(0,−C)` form), and a seam that changes **RNG-stream consumption** at neutral
  (e.g. always drawing K wander candidates — the reason §3.2-E branches before the extra draws).
  Identity must hold in the *trajectory*, streams included, not merely in the formula's output.
  The identity legs (§9.2) exist to catch exactly this; deleting or weakening them to make a leg
  pass is the betrayal.
- **W-2 An axis ships unread.** Hashed axes with no consumer = `Citizen.Health` again. The lane
  gate (§9 order note) is the enforcement; an implementer who lands WP-A and stalls has shipped
  the defect this plan was written against.
- **W-3 Cosmetic magnitudes — or unbounded ones.** A dawdle of 3 seconds nobody can see satisfies
  every unit test and is theatre (`automation-and-souls.md` §4.1); a flee shift that can reach
  1.0 disables survival (G-2). Both directions are wrong; M1–M3 and the bounds tests are the
  fence, and both must have mutations that bite.
- **W-4 Personality in the arbitration.** Implementing C or the veto as a per-citizen distance
  bias inside the argmin (`JobSystem.cs:234-247`) breaks the strict-`<` threading contract for
  every source downstream. Sanctioned forms only: the recruit gate, and stamp-and-skip in
  `Select`.
- **W-5 Dice in the psyche.** Any `SimRng` use inside `PsycheSystem.Tick` or its helpers.
  Generation forks at worldgen; the tick path computes.
- **W-6 Prose in the hash.** A mark that carries a string, or an unbounded mark list. Prose
  belongs to MEMS; PSYC folds numbers only.
- **W-7 The LLM writes the psyche.** Any new `CitizenEffect` kind touching axes or marks, or any
  host path that does. Narration reads; it never writes.
- **W-8 Mood grows memory.** Writing history into `Citizen.Mood` directly, or making the mood
  recompute read anything but current-pass/previous-pass state. The contract comment at
  `NeedsSystem.cs:157-158` must remain true and updated in the same commit as the new term.
- **W-9 Reserved mark kinds written.** v1 code emitting Betrayal/Rescue/BrokenPromise (§4.2).
- **W-10 Guard tests that cannot bite.** Raw-text grepping without comment-stripping, mutations
  described but never applied, `git checkout` in a mutation loop, unquoted flag variables in
  measurement scripts — the four repo traps (`CLAUDE.md` "Traps"), each of which has already
  produced green-confident-wrong results in this repo. Every WP review applies its named
  mutations physically.
- **W-11 Predicted pins quoted as measured.** Every WP measures all five pins and records the
  *reason* each moved or held; "predicted hold" appearing in a commit message as "held" without a
  run is the deck-wander lane's lesson ignored.
- **W-12 Numbers instead of character.** Surfacing the axes as five bare sliders with no derived
  words and no prediction lines satisfies "showable" and fails legibility; §8's items 1–3 are the
  contract. Conversely, hiding the *behaviour flags* while showing prose reduces the sim to
  tooltip depth — the flags are the proof the words are true.

---

*Companion docs: `perilune-automation-and-souls.md` (the operator model this feeds),
`perilune-console-retirement.plan.md` §1.5 (the Persona seam this will one day fill),
`docs/ECONOMY-PLAN.md` E2 (the skills lane this must mesh with), `docs/MECHANICS.md` §13.3–13.4
(the dead-state precedents this plan is designed never to repeat).*
