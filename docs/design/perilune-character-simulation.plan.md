# The character simulation — marks as the engine, axes as the prior, behaviour that surfaces — implementation plan (r2)

**Status:** PLAN ONLY, **revision 2**. Nothing in this document is built. Revision 1 (`a592e5e`)
was reviewed by three independent Opus lenses (architecture/determinism, game-design/legibility,
psychological-validity/governance); unanimous verdict **ADOPT WITH CHANGES**. This revision is the
response. §13 is the ledger of what changed shape, what was adopted, and what was **rejected with
argument**; §12 collects the questions that are the owner's to take, not this plan's. Retractions
from r1 use the house quoted-and-negated form at the place the claim lived.

**The brief it serves (Garvin, verbatim in substance):** an *in-depth character simulation* —
possibly using **Big Five personality traits**; **personal history that shapes the way the person
thinks and acts now**; and **how incidents and current relationships impact him or her.**

**The one-line answer, revised:** the engine of character is **history and relationship — marks
and the opinion graph — carried on the ship's one high-bandwidth observable channel (idle
movement, 51 % of a sim-day)**; the Big Five is adopted as the hashed **prior** that disposes how
events land and how people move, rejected as the player-facing surface, and bound by a mechanised
warrant — no hashed field this plan adds may ship without a driven test proving its behaviour can
fire and be seen. The whole thing runs in the deterministic offline sim core; an LLM may *narrate*
a personality (through derived words only, never numbers), it never *is* one.

> **r1 framing, retracted.** r1 led with *"adopt the Big Five as the hashed generative substrate"*
> and titled the axes "layer 1", marks "layer 2". Two reviewers independently inverted this —
> the validity lens from the isolated/confined/extreme-environment literature (behavioural
> variance there is dominated by *state* trajectories — stress, loss, friction — not by stable
> trait variance), the design lens from drama (marks are your story generator; axes are
> disposition knobs) — and the third proved r1's marks could not fire on the standard ship at
> all (§0.2). The inversion is adopted: **marks are the engine; axes are the prior.** What
> survives of r1's position on Big Five survives intact in §2.

---

## 0. What was verified vs assumed

Reviewers should check this section first. Every claim in §0.1 was read in this worktree
(`main` @ `96221cc`); §0.2 is the event-supply audit r1 lacked; §0.3 grades the psychological
claims; §0.4 lists what is still assumed.

### 0.1 Verified

**Character today is a dialogue prop, not a simulation.**
- `sim/Sim.Core/Citizens/PersonaSheet.cs:26-32` — `Traits` is `string[]` (*"3 from the trait
  pool"*), beside `Values`, `Fears`, `Secrets`, `RaidBackstory`, `SpeechStyle`,
  `RelationshipNotes`. The trait pool is twelve words (`PersonaSheet.cs:100-105`).
- The whole mind layer is **host-owned and unhashed**: `CitizenMemory.cs:163-164` — *"minds are
  not covered by Simulation.StateHash"* (r1 cited `:165-166`; off by two — the one citation error
  the architecture review found in ~50 checked); `PersonaSheet.cs:36-37` — `RelationshipSecrets`
  is *"NOT hashed"*. The MEMS checksum folds **structure only**, never prose
  (`CitizenMemory.cs:227-231`, `:470-517`).
- Consumers of `Traits`: dialogue prompt assembly and the roster wire
  (`hosts/web/GameSession.cs:1216`), rendered as chips in the shipped readout
  (`client/src/ui/overview-view.js:580-586`). **No sim system reads a trait.** A "meticulous"
  crew member and a "cowardly" one behave identically.

**`Mood` is hashed but deliberately memoryless.**
- Folded at `sim/Sim.Core/Simulation.cs:404`; recomputed **fully every pass** at
  `NeedsSystem.cs:163-167`, contract at `:157-158` (*"Mood holds no history of its own"*); range
  −135..+20 (`:159-161`). Consumers: the SocialSystem argument gate (`SocialSystem.cs:147-149`)
  and the Director chain (`ShipMetrics.cs:86` → `DirectorSystem.cs:82`; `:41-46` names
  `WearPressure` *"the one sanctioned path by which crew mood reaches the economy"*).
- `docs/MECHANICS.md` §13.4: `Fatigue` saturates at ~16 h with no reducer, flooring mood ≤ −5
  for everyone from day 1 — so the argument gate's mood half is **permanently open** for all crew
  (§13.7's own compounding note), and mood-mediated differentiation is compressed (§5.3 there;
  accounted for throughout).
- **Mood has zero player-visible per-crew surface today.** The CREW WATCH bars render
  `e.morale` (`overview-view.js:539-543`), which is `Citizen.Morale` off the roster
  (`GameSession.cs:1216`) — **1.00 for every crew member at all times** (`MECHANICS.md` §13.4:
  *"The visible morale bar is a constant."*). Nothing on either modern surface renders any
  mood-derived value per crew member. §8.2 fixes this.

**The social layer exists, and on the standard ship it is statically frozen.**
- `SocialSystem.cs` — sparse directed opinion graph, SYSS-saved, `'SOCL'`-checksummed
  (`:289-310`); deterministic argument/bond rolls from a forked stream (`:85`, `:144-163`);
  hysteresis tiers (`:171-192`); one clamp entry `Nudge` (`:206-226`).
- **The only `Nudge` caller outside the system itself is authored relationship seeding**
  (`sim/Sim.Gen/AuthoredShips.cs:699`), and the grid eight are bare `CitizenSpec`s with **no**
  authored relationships (`AuthoredShips.cs:982-994`; the `Relationships` arrays at `:476-658`
  belong to the slice). Familiarize is +2/h, decay relaxes **toward zero**
  (`SocialSystem.cs:107-114`), bonds are positive. **On the grid ship, opinion is monotone
  non-decreasing: the argument gate (`opinion ≤ −20`) can never open and `Enemy` can never be
  entered.** §0.2 draws the consequence.
- `docs/MECHANICS.md` §13.7 (measured, slice, one sim-day): **2,611 bond events, 720 argument
  events; every authored edge at its ±100 clamp within 24 h; every stranger pair at ≈ +8.** The
  graph saturates in a day, so anything that *weights by opinion* is weighing a constant by day
  2. **This is a named blocking dependency of §5** (the relationship-carrier seam), not a
  footnote.
- `CitizenMemory.cs` — capped episodic prose memory (`Cap = 120`, `:29`); rule-table
  event→memory writes (`:263-309`); importances are consts because `SimDefs.cs` is
  integrator-gated (`:219-221`). `Chronicle.cs:19-26` — hash-exempt `ProseOverride`.

**The event bus and the event inventory.**
- `EventBus.cs:30` — `Read()` returns the **previous** tick's buffer; buffers swap once per tick
  (`:32-37`). *Nothing published this tick is readable this tick*, regardless of registration
  order. r1's §6 comment claimed otherwise and is retracted (§6). Readers that must not miss
  events register `IntervalTicks => 1` (`HistorySystem.cs:72-75`, `CitizenMemory.cs:216-217`).
- The full event inventory (`SimEvents.cs`): Tile/Rooms/Fog/DoorState changed, AlarmRaised,
  CitizenDied, GoalCompleted, BrownoutChanged, RelationshipChanged, Argument, Bond,
  **PromiseBroken (`SimEvents.cs:93` — defined, published by nothing)**, ConstructionCompleted
  (`:100`), DeconstructCompleted (`:121`), plus effect/MOSS events. **There is no
  `JobCompletedEvent`**; only build and deconstruct completions are evented. §4.2-C specifies
  the completion signal accordingly.

**The cautionary precedent: hashed personality-adjacent state nothing reads.** `Citizen.Health`,
`Citizen.Morale`, `Citizen.Archetype` — saved and hashed (`Simulation.cs:415-417`), never written
or read by any system (`MECHANICS.md` §13.4); `CitizenMind.FollowingPlayer` (§13.3). The warrant
rule (§9.4) exists because this repo has shipped this failure at least four times — and r1
enforced the rule with process ("the integrator holds the merge"), which is the exact control
that failed E0-4's WP-5. §9.4 mechanises it instead.

**The RNG topography of the wander — r1's assumption A-4 was FALSE.**
- `CitizenSystem.cs:29` — `var rng = sim.Rng`: the idle wander draws from the **raw shared sim
  stream**, not a fork. `PathService.cs:172-197` — `TryRandomWalkableTileNear` is a **fixed
  three draws per attempt, up to 10 attempts** (3–30 draws per call), and its own warning
  comment (`:187-193`) records that reshaping this stream moves the slice golden *as a bare
  hash mismatch indistinguishable from an unrelated change*. `Rng.State` folds directly into
  `StateHash` (`Simulation.cs:370-374`). Consequences drawn in §4.1 (the PSYC stream is a WP-A
  decision, not a WP-F retrofit). Verified mitigating fact worth claiming: **`CitizenSystem` is
  the only raw in-tick `sim.Rng` consumer** — every other in-tick user forks (SocialSystem
  `:85`, PersonaGenerator `:176`) — so the blast radius is contained to the wander.

**Seams verified as in r1** (unchanged, spot-checked again): recruit gate `JobSystem.cs:140`;
per-pass refusal stamps `JobSystem.cs:229` + `IJobSource.cs:125-132`; self-serve threshold
`SustenanceSystem.cs:100,214,228` (`NeedThreshold` 0.5, `SimDefs.cs:569`); flee threshold
`SafetySystem.cs:61` (`FleeSuffocation` 0.5, `SimDefs.cs:562`) — **and `:75`: the return-to-work
level is `0.5f * fleeAt`, so modulating `fleeAt` moves BOTH the trip point and the rest point;
§4.2-N and §3.2 own this coupling explicitly**; wander cadence `CitizenSystem.cs:72-74`; social
gates `SocialSystem.cs:149-161`; the hoisted-instance pattern `SystemStack.cs:22-24` + lazy
by-type resolution `IJobSource.cs:74-76`; SYSS parallel-store save/hash without touching
SaveWriter/Reader/`Simulation.StateHash` (`CitizenMemory.cs:222-231`, `Simulation.cs:385-390`);
RNG-free authored construction (`PersonaSheet.cs:234-238`) and the boot-step seeding precedent
(`:238-239`); the `CitizenEffect` whitelist (`CitizenEffects.cs:15-19`); the five pins and both
rituals (`CLAUDE.md` "Determinism proof"; `README.def` "HANDOVER INVARIANT"); the E2 charter
(`ECONOMY-PLAN.md:100-115`); the operator-model guardrails
(`automation-and-souls.md` §4.1–4.2); the Persona seam (`console-retirement.plan.md` §1.5.4).

**Lifecycle facts r1 missed (architecture review; verified here):**
- `Simulation.AddCitizen` (`Simulation.cs:197-202`) has no hook — a runtime-spawned citizen
  would have no psyche unless access is lazy.
- `SaveReader.ReadSystemState` (`SaveReader.cs:160-173`) skips a chapter with no matching
  system; conversely a pre-PSYC save never calls the new system's `RestoreState` — every citizen
  from an old save has no psyche entry.
- `NeedsSystem.Kill` removes the dead from the citizen store (`NeedsSystem.cs:205`); nothing
  would remove a dead citizen's `PsycheState`, which is **hashed** state. §6.2 states the
  lifecycle policy all three facts demand.

**Client facts that bound what "visible" can mean (design review; verified here):**
- Idle pawn labels lose to the de-clutter sweep: `overview-scene.js:454-478` marks colliding
  *idle* labels `crowded`, and `styles.css:874-875` renders a crowded tag at **opacity 0**
  (hover to reveal); only the current deck's crew render at all (`overview-scene.js:485`,
  *"off-deck / fogged crew simply do not render"*). Crew who cluster — exactly what §5 makes
  friends do — become anonymous at the moment the seam fires. §8.3 names the ~20 lines of
  client work as a **dependency**, retracting r1's "no UI work".
- The traits chips row hides when empty (`overview-view.js:586`) — the surface r1's word
  projection would have blanked for ~42 % of generated crew (§2.2).
- `DefsParser.cs` carries **117** value keys today (counted); r1's ~20 across six packages was
  +17 % of the def surface in six defs-pin-moving commits. §7 batches them.

### 0.2 The event-supply audit (new; the Tier-1 finding and its resolution)

r1 designed seams and marks without asking **how often their triggering events occur on the ship
the player actually plays**. The review did the arithmetic; this section adopts it, grounds it in
measured numbers where they exist, and draws the design consequence. Frequencies are per crew per
sim-hour on `--ship grid` unless noted; "review-estimate" values must be **re-measured by the
owning WP before any tuning decision cites them** (A-6).

| channel | frequency on grid | source | verdict |
|---|---|---|---|
| idle wander decisions | **high — the only high-bandwidth channel.** 51.07 % of the entire sim-day is idle crew walking (3 529 866 crew-ticks measured; 76 % of idle time) | `CLAUDE.md` snapshot (measured) | **the carrier.** Whatever this plan wants seen must ride this channel (§5) |
| job completions (C-dawdle trigger) | ~0.5–3, **and only when the board is non-empty at completion** — on a ~75 %-idle ship the dawdle is otherwise absorbed by idle time invisibly | review-estimate | seam kept, r1's claim retracted (§4.2-C); guaranteed visibility rides §8, not the map alone |
| self-serve threshold crossings (C's 2nd seam) | ~0.13 (hunger ~1/day + thirst ~2/day per crew, from the needs-rate defs) | derived from `SimDefs.cs` rates | below floor as a *watchable* seam; kept as a mealtime-ordering tell, claimed as nothing more |
| flee onsets (N seam; NearDeath source) | **exactly 0** — 0 of 6 912 000 crew-ticks in `Flee` | `CLAUDE.md` (measured) | N seam and NearDeath are **latent on grid** by design of the ship, not dead code: they fire on hazard, and hazard is player-caused or future content (§3.2) |
| deaths (Bereavement source) | 0 (8/8 alive every measured day) | `CLAUDE.md` (measured) | same verdict as flee |
| arguments (A seam; Feud source) | **0, structurally**: gate needs opinion ≤ −20; grid opinion is monotone non-decreasing (§0.1) | code analysis | **unreachable until seeded.** §5.4 charters the grid social ignition (owner decision §12.2) |
| bonds | high once co-located (slice: 2 611/day — saturating) | `MECHANICS.md` §13.7 (measured) | usable only after the §13.7 retune (§5.2 dependency) |

**The audit rule this plan adopts, and its scope:** a **disposition seam** (an axis modulation)
must produce, at authored axis spreads, on the order of **≥ 1 observable, attributable event per
crew per sim-hour** on the standard ship — or it may ship only with its §8 surface carrying the
visibility, and may never be *claimed* as map-visible. **Marks are deliberately exempted from the
frequency floor** — a considered disagreement with the review, argued in §13.3: a mark is
valuable *because* it is rare (rare-but-memorable is the register `automation-and-souls.md` §9
demands); what a mark owes instead is a **reachability warrant** — a driven test proving a
concrete path exists, on the standard surface or behind a named content dependency, on which the
mark forms and its behavioural consequence fires (§9.4).

**The design consequence, which reshaped this plan:** the only channel wide enough to carry
character to a watching player is idle movement. The relationship-carrying wander (§5) is
therefore not an enrichment of the E seam — **it is the load-bearing visibility mechanism of the
whole feature** — and the §13.7 saturation retune graduates from confound to prerequisite.

### 0.3 Psychological claims and their standing (new)

r1 had categories for code-verified and engineering-assumed and none for psychological claims,
at least four of which it made in the register of established fact. This table grades every
claim the plan still relies on. "Design-depends" = the mechanism breaks if the claim is false;
"colour" = the claim only motivates.

| claim | standing | design-depends? |
|---|---|---|
| Big Five is the best-replicated descriptive taxonomy of adult personality variation | well-replicated | colour (it is the *prior*, §2) |
| C ↔ industriousness/impulse control; N ↔ threat sensitivity/stress reactivity; E ↔ social approach; A ↔ interpersonal conflict | well-replicated directional findings | yes — the seams borrow these signs |
| O ↔ workplace learning/training proficiency | **contested** — the classic finding is for training proficiency, confounded with *g*, and C predicts training success at least as well. r1's *"validated signs"* heading covered this mapping and overstated it; **retracted.** O's distinctive signature is novelty-seeking and breadth | was design-depends in r1 (O→E2 learning rate); r2 replaces that charter with breadth (§4.2-O) |
| adult trait stability | **overstated in r1.** ~~r1: "axes are FIXED at generation — personality is stable … psychologically defensible (rank-order stability of Big Five in adults)"~~ — retracted as stated. Rank-order stability is high (r ≈ .5–.7 across decades) but is not fixity; mean-level change is systematic and lifelong; and bereavement, unemployment and trauma exposure show measurable Big Five change in large panel studies (SOEP). Fixed axes are a defensible *simplification*; r2 specifies the drift mechanism (§3.5) and hands the charter timing to the owner (§12.1) |
| in isolated/confined/extreme environments, state trajectories dominate behavioural variance over trait variance; trait screening predicts poorly, state monitoring predicts well | replicated in the ICE literature | yes — one of the two arguments for the marks-first inversion |
| resilience is the modal outcome after a potentially traumatic event | well-replicated | yes — §3.2 makes RaidTrauma a minority outcome, retracting r1's universal seeding |
| grief resilience is predicted by C | **folk.** r1 gave high-C grief-damping as a payoff; the actual predictors are N and social support | retracted; C's grief-damping is removed (§3.4.3) |
| introversion = social avoidance | **wrong.** Low E is lower approach motivation; avoidance is anxiety-adjacent or relationship-specific | retracted; the E ≤ 0 argmin branch is cut (§4.2-E) |
| person–situation interactionism: strong situations flatten trait expression | well-replicated | yes — G-2, now scoped to survival (§4.3) |

Also adopted from the governance lens: **the psychometric-vocabulary ban extends from UI to every
external-facing artifact** — store copy, patch notes, prompts. "Big Five"/"OCEAN" are internal
words (§10.2, §11 W-13).

### 0.4 Assumed (each a review target)

- **A-1.** One new unconditionally-folding `IStatefulSystem` moves exactly the three StateHash
  pins, fold-only (W0-6 precedent). Predicted, not measured; WP-A measures all five.
- **A-2.** No new class of float use (no transcendentals on tick paths; decay is a precomputed
  per-pass multiplier).
- **A-3.** Boot-step access to the registered `PsycheSystem` per the hoist / lazy-resolution
  patterns (both verified as patterns; the accessor is implementation detail).
- ~~**A-4** (r1: "the wander RNG … is the per-concern forked stream E0-1 introduced")~~ —
  **FALSE, verified** (§0.1); no longer an assumption but a design input (§4.1).
- **A-5.** Effect-size defaults are priors for measurement, not tuned truth — with the r2
  correction that the *default direction* of error is now known: at this game's observation
  bandwidth **the risk is invisibility, not caricature** (design review), so dispositional
  defaults start loud and G-2 tightness is reserved for survival behaviours (§4.3).
- **A-6 (new).** The review-estimated frequencies in §0.2 are correct within a factor of ~2;
  WP-B re-measures before citing.

---

## 1. The central architectural fact, and the shape of the move

Unchanged from r1 in substance: the gap between the brief and the code is **not** "add more
traits" — personality today feeds what a crew member *says* and *shows*, nothing they *do*, so
character must move into the deterministic, hashed, saved sim core, consumed by the systems that
decide movement, work, safety, eating and arguing. And `Mood` must stay memoryless: history gets
a **stateful input** to mood (marks → `MoodPressure`), never a stateful mood.

What r2 adds to the fact: **the standard ship's social field is statically frozen** (§0.1 — no
authored edges, monotone opinion, unreachable argument gate) **and its only wide observable
channel is idle movement** (§0.2). So the move is not just prose→sim; it is prose→sim **plus
igniting the social field the sim already owns, plus routing the result through the one channel
a player actually watches.**

```
MARKS        (hashed, event-written, event-modulated decay)   ── the ENGINE: history & incident
OPINIONS     (hashed, SOCL — already shipped, needs ignition) ── the RELATIONSHIPS
AXES         (hashed, generation-set, rare bounded drift)     ── the PRIOR: how events land,
                                                                 how people move & choose
        │ deterministic modulations at named seams (§4, §5)
        ▼
BEHAVIOUR    on the idle-movement channel + work/safety/social seams ── what the player watches
        ▼
PROSE        (unhashed, host-owned: PersonaSheet words, MEMS, Chronicle)
             a VIEW of the layers above — narration, never authority, never numbers outbound
```

---

## 2. Position on Big Five — substrate and prior, not surface, not engine

### 2.1 The argument, revised

**Adopted, as in r1:** continuous variation (a 100-crew ship never repeats), a validated
directional prior for exactly the decision points this sim has (§0.3 — with O's mapping
downgraded honestly), and trait–state discipline (axes stable-with-rare-drift; history is
marks).

**Demoted, against r1:** the axes are no longer the primary carrier of character.
~~r1 §3.2-C: "this is the single most visible differentiator"~~ — the event-supply audit (§0.2)
shows the disposition seams collectively supply at most a few attributable events per crew-hour,
while the marks/relationship layer, once ignited, owns the high-bandwidth channel. The axes'
honest jobs: (a) **disposing how events land** (N scales mark pressure; relationship tier scales
bereavement), (b) **colouring the high-bandwidth channel** (E and O shape idle movement), (c)
**generating coherent prose** (§2.2). The warrant rule survives and is mechanised (§9.4): every
axis still must own consumers — it just no longer claims the headline.

**Rejected, as in r1:** Big Five as the player-facing surface. Five sliders read as "slightly
more or less likely anyway"; players remember words and incidents. RimWorld's discrete traits
are legible because each owns a visible behaviour; DF's continuous facets are deep and
illegible. The surface is derived words, mark-derived state lines, and prediction lines (§8).

**Not adopted:** facets, HEXACO, player-visible psychometric vocabulary anywhere (§0.3), and —
pending the owner — axis drift (mechanism §3.5, timing §12.1).

### 2.2 The word projection, redesigned (r1's failed twice, independently)

~~r1: word thresholds at |axis| ≥ 0.6 over the triangular roll~~ — **retracted; it fails
arithmetically and expressively.** Arithmetic: P(|axis| ≥ 0.6) ≈ 0.16 per axis ⇒ ~0.8 expected
words per generated crew member and **P(zero words) = 0.84⁵ ≈ 42 %** — four in ten crew would
render an *empty* traits row on the shipped readout (`overview-view.js:586` hides it): a
legibility regression delivered by the legibility feature, where today every crew member has
exactly 3 words. Expressive: the r1 table made `stoic` and `haunted` contradictory — but
**Volkov is authored with both** (`AuthoredShips.cs:511`), Okonkwo is `gentle` + `unbending`
(`:459`), and both sheets are *truthful about people* — so r1's WP-G lint would have failed on
shipped content and invited "fixing" the personas backwards. And five of the twelve pool words
(`devout`, `superstitious`, `sardonic`, `wry`, arguably `gentle`) have no honest OCEAN mapping,
so r1 §1's *"the word the tooltip shows and the behaviour the map shows can never disagree"* was
false as stated.

**The r2 projection — three word classes, five words always:**

1. **Axis-words.** Every axis contributes exactly one word from a three-band split (low / mid /
   high at ±0.33 — near-equal thirds under the triangular roll, so no empty rows; 3⁵ = 243
   combinations, comparable variety to today's 220). The invariant: **every crew member always
   renders five identity words, one per axis.** The table lives here in the plan (structure
   fixed; final word choice is WP-G's one degree of freedom):

   | axis | low | mid | high |
   |---|---|---|---|
   | O | routine-bound | practical | curious |
   | C | easygoing | steady | meticulous |
   | E | quiet | reserved | garrulous |
   | A | unbending | fair-minded | gentle |
   | N | stoic | level | jumpy |

   `cowardly` is **removed** from every projection — a moral-judgement word bound to a trait the
   design also prices economically (validity lens). `jumpy`/`wary` carry high N.
2. **Mark-words.** `haunted` is not an axis-word — it is a **mark-word**, worn while a heavy
   RaidTrauma/Bereavement mark is active. Volkov becomes representable *mechanically*: low-N
   (`stoic`) **and** heavy RaidTrauma (`haunted`) — a man holding a great deal down. Mark-words
   render beside the five axis-words while active (§8.1).
3. **Free prose.** `devout`, `superstitious`, `sardonic`, `wry` project from nothing and say so —
   flavour the generator may still roll, the lint ignores, and no system reads. This class exists
   without embarrassment; pretending every word is mechanical was r1's overreach.

**`SpeechStyle` is dropped from the projection entirely** (~~r1: "axis extremes also bias …
`SpeechStyle` selection"~~): encoding "avoids eye contact" as low E is a contested, culturally
variable marker, and it would land worst on the crew member the economy already scores lower.
Speech stays free prose.

WP-G's lint checks **axis-words only** (an authored sheet may not carry an axis-word from a band
its authored axis contradicts) and is expected to pass shipped content unmodified.

---

## 3. The engine: marks — history and incident as state

### 3.1 What a mark is

One bounded, hashed record of something that happened to this person and still weighs on them:
`{Kind, Deck, Subject, Tick, Weight}` (24 B). Numbers, never prose — MEMS keeps remembering in
words for dialogue and the eulogy (`CitizenMemory.cs`); marks remember in weights for behaviour.
*MEMS is what they say about it; PSYC is what it does to them.* Capacity 16 per citizen, fixed;
eviction in §3.6.

### 3.2 v1 kinds — bound to events that exist, with reachability warrants

| kind | written when (verified sources) | reachability on the standard surface | initial weight |
|---|---|---|---|
| **Bereavement** | `CitizenDiedEvent` read next tick; weight from the survivor's SOCL tier toward the dead at death (`GetRelation`, `SocialSystem.cs:74-75`; edges persist past death, §0.1) | latent until a death — player-caused or future content; warrant: a driven kill fixture on a grid-derived map (§9.4) | tier-scaled: `bereavement_weight_{closefriend,friend,other}` (1.0 / 0.6 / 0.15) |
| **NearDeath** | 1 Hz peak tracker (`PeakSuffocation`/`PeakDeck`); mark written on recovery below **the def value** `FleeSuffocation / 2` — the def, **not** the per-citizen modulated value, so a high-N crew member's earlier flee does not also redefine what counted as a close call (this confines the `SafetySystem.cs:75` coupling, §0.1, to the flee behaviour itself; named per review) — after a peak ≥ `near_death_threshold` (0.8) | latent until hazard; same warrant class as Bereavement | `near_death_weight` (0.8) |
| **Feud** | `RelationshipChangedEvent` with `NewRel == Enemy` (`SocialSystem.cs:123-129`); removed (not decayed) if the pair later leaves Enemy | **unreachable today** (§0.1 monotone opinion) — reachable only after §5.4's grid social ignition, which is this kind's named dependency, pinned by a red-until-then negative control (§9.4) | `feud_weight` (0.5) |
| **RaidTrauma** | seeded at generation/authoring **as a minority outcome**. ~~r1: "every survivor of the Lien raid carries one … floor > 0 (the backstory is permanent)"~~ — **retracted**: resilience is the modal post-trauma outcome (§0.3); a universal mark differentiates nobody (the `Citizen.Morale` lesson in emotional clothing); and it priced trauma into every crew member's throughput permanently with no exit. r2: a def-tunable minority (`raid_trauma_incidence`, default 0.3) of generated crew, rolled on the persona fork; authored per-crew on slice/grid; **wide weight spread [0.3, 1.0] and a recovery path** (§3.3); a small floor **only** for the heaviest carriers. The *event* stays universal where it lives today — `RaidBackstory` prose and MEMS | authored / rolled |

**Reserved, defined, never written in v1:** Betrayal, Rescue, PromiseBroken. No mechanics emit
them — note `PromiseBrokenEvent` already exists as an **unpublished struct**
(`SimEvents.cs:93`), so that mark kind waits on a *publisher*, not a schema. A v1 code path
writing any reserved kind is a defect (W-9).

### 3.3 Decay — event-modulated, with a residue (r1's timer-only decay retracted twice over)

- **Slow timer baseline**, per-kind half-life defs. ~~r1: one `mark_half_life_hours` (default
  48 h) for all kinds~~ — retracted: at 48 h the deck-aversion threshold (0.4 against an initial
  0.8) is crossed in **one sim-day**, so the one player-facing decision the plan created expired
  before the player had to solve it (design review). Behaviourally-consuming kinds get long
  half-lives (`neardeath_half_life_hours` 96, `bereavement_half_life_hours` 96); pressure-only
  kinds may fade faster (`feud_half_life_hours` 48).
- **Events accelerate healing.** A `BondEvent` involving the marked citizen applies a relief
  step (`Weight ×= grief_event_relief`, default 0.9) — grief eases *because something good
  happened with someone*, which is a story; a timer is a statistic (design review, adopted).
  Deterministic: the bus is deterministic and the step is a pure multiply. **The slow timer is
  retained alongside** — argued in §13.3: purely event-gated grief on an isolated crew member
  never heals and taxes them forever; "never got over it because nothing good ever happened" is
  a story the *long* timer still tells, just slowly.
- **Expiry leaves a residue.** ~~r1: "A mark below `mark_epsilon` with floor 0 is removed"~~ —
  retracted as stated: that deletes exactly the record `VISION.md`'s "a person you can know"
  names as the payload. r2: on expiry, `Weight = 0` and the entry **persists as an inert
  residue** — no behaviour, no mood, still hashed, still shown (*"Lost Novak, D14"* stays in the
  Persona window, §8.1). Eviction (§3.6) consumes residues first; MEMS/Chronicle remain the
  unbounded archive of record.

### 3.4 What marks do

1. **Mood pressure** — `MoodPressure = Σ Weight × mood_weight[Kind] × (1 + N × stress_gain_max)`,
   entering `NeedsSystem`'s full recompute as one subtracted term (memoryless contract kept, doc
   comment updated same commit; §6). Now **visible**, because §8.2 finally gives per-crew mood a
   surface.
2. **Deck aversion (NearDeath)** — while Weight ≥ `deck_aversion_min_weight` (0.4), auto-work
   targeting the marked deck is refused via stamp-and-skip in each source's `Select`
   (contract-legal, §0.1). The three bounds stand: never vetoes Flee, never Eat/Drink, never the
   citizen's current deck; player orders override. At the 96 h half-life the aversion lasts ~4
   sim-days — long enough that the player must actually route around a person, or override them
   and watch the mood cost.
3. **Grief slows the hand (Bereavement)** — an **additive** dawdle term
   (`Weight × grief_dawdle_s`), independent of C. ~~r1: "conscientiousness could damp it:
   × (1 − C × grief_damp)"~~ — **retracted**: C-predicts-grief-resilience is folk (§0.3). What
   *does* modulate grief here, mechanically and defensibly: N (via the pressure gain) and social
   support (via §3.3's bond-relief — the crew member with friends heals faster). That is a
   better sentence than the one it replaces.
4. **Narration** — `MarkFormedEvent`/`MarkFadedEvent`; HistorySystem lines ("Okonjo has not been
   the same since Novak died"); MEMS consumption stays a contract request
   (`CitizenMemory.cs:219-221`); mark-words in the identity row (§2.2).

### 3.5 Drift — history that makes you who you are (mechanism specified; charter = owner call)

~~r1 §10: "Axis drift (personality change over a campaign) — not designed; axes are fixed."~~
Withdrawn as a refusal; the reviews are right that without it, history is a transient
perturbation on a fixed person — close to the opposite of the brief's *"personal history that
shapes the way the person thinks and acts now"*. The mechanism, fully specified so the owner's
decision is about *timing, not shape*:

- When a mark **retires to residue** (§3.3) after having spent ≥ `drift_dwell_days` above
  `drift_min_weight`, it deposits a **permanent axis delta** per a small (kind → axis) def
  table — e.g. Bereavement → N +0.05; NearDeath → N +0.05; Feud → A −0.04; a future Rescue →
  A +0.04. Deposits are **bounded twice**: per event (≤ 0.05) and per life — a per-axis monotone
  `DriftSpent` tracker (5 × float, hashed) caps lifetime |drift| at `drift_lifetime_cap` (0.3).
- Deterministic, event-sourced, rare — a person changed by their life, by a bounded amount, in
  the direction the life pushed. Identity holds (no marks ⇒ no drift). Cost if chartered:
  +20 B/citizen, ~6 def rows, one WP.
- **Owner question §12.1** — with this plan's recommendation to charter it now: it is the
  cheapest honest answer to the brief's second clause, and deferring re-opens the §0.3 stability
  overstatement this revision just retracted.

### 3.6 Bounds and eviction

Capacity 16, fixed at store creation. Eviction: residues first (oldest first), then the
lowest-weight live mark unless the newcomer is lower (the `CitizenMemory.Add` policy, `:37-44`).
Order-preserving removal (order is hashed), O(16), off the hot path.

---

## 4. The prior: axes and their seams

### 4.1 The PSYC stream — decided in WP-A, because A-4 was false

The wander consumes the **raw shared sim stream** in fixed 3-draw packets (§0.1). Consequences,
and the design that absorbs them:

- **Any psyche-driven change in draw *count* on `sim.Rng` moves `StateHash` with no field
  changed** (`Rng.State` folds, `Simulation.cs:370-374`) and de-aligns every downstream
  consumer — seed-paired measurement legs (§9.5) and the neutral-identity property both die.
  Therefore: **WP-A forks a dedicated PSYC stream** (`sim.Rng.Fork(PSYC_STREAM)` once; state
  saved + hashed exactly like SocialSystem's roll stream, `SocialSystem.cs:246-256`), and
  **every psyche-added draw comes from it; no psyche code path ever draws from `sim.Rng`.** The
  base wander draw stays on `sim.Rng` untouched — a neutral ship's `sim.Rng` trajectory is
  bit-identical to today's.
- ~~r1 §3.2-E: "At E ≠ 0: K draws (… a fixed count whenever the branch is taken)"~~ — the shape
  survives; the *cost* was wrong by an order of magnitude: each candidate is a
  `TryRandomWalkableTileNear` call consuming **3–30 draws** (`PathService.cs:185-196`), so the
  E/mark-avoidance branch costs 3K–30K draws — from the PSYC stream, where that is a cost note,
  not a hash hazard. K (`wander_social_draws`) defaults small (4).
- **Retrofit is forbidden:** deciding the stream at WP-F would move the slice pin twice and void
  every measurement taken between (architecture review, adopted verbatim). WP-A lands the fork
  even though WP-A itself draws from it only in tests.
- Honest scope of identity after the fix: an **all-neutral ship is trajectory-identical** to
  today, stream included. On a *mixed* ship, a non-neutral crew member's differently-chosen tile
  changes the world every other crew member reacts to — divergence **through the world is the
  feature working**; divergence through accidental stream-reshuffling is the bug the fork
  removes. W-1 is reworded accordingly.

### 4.2 The seams — two-sided, with signals specified

r1's payoff structure was morally priced: three of five axes were pure-dominance, and with mood
wired toward throughput the shipped game would have computed *"high-C, low-N, high-A people are
better people, and here is the number"* (validity review). r2 gives every axis a real benefit
**and** a real cost, and specifies the trigger signal where r1 hand-waved one.

| axis | benefit | cost | signal & notes |
|---|---|---|---|
| **C** | prompt work start (no dawdle); **E2 contract: personal maintenance quality** — the charter line *"a stranger restores to 0.85, the specialist to 1.0"* (`ECONOMY-PLAN.md:104-105`) gains "…scaled by C" | defers self-serve (works hungrier → deeper mood dips); **perseveration chartered**: slower to abandon an invalid job, resists re-tasking — chartered beside the assignment verb (§5.5), because no re-tasking verb exists yet to resist | **the completion signal (r1 left it unspecified; review flagged it):** there is no `JobCompletedEvent` (§0.1). r2: each job source's *completion site* calls `psyche.NotifyCompleted(citizen)` — one line each at `DigJobSource.cs:135-145`, `BuildJobSource.cs:405-409`, `DeconstructJobSource.cs:180-188`, HaulJobSource's delivery completion, and the `CraftingSystem`/`MaintenanceSystem` completion paths (~6 sites). This **naturally excludes abandonment** — `CancelJob`/flee paths never call it, so a crew member who fled lethal air collects no dawdle — and needs **no** new hashed `PrevJobKind` byte and no event. Alternatives rejected: edge-detecting `JobKind→None` conflates completion with abandonment (`SafetySystem.cs:96` cancels on flee); a `Citizen` flag touches the CITZ fold. Dawdle = `max(0, −C) × work_dawdle_max_s` (one-sided; identity at C ≥ 0 *is* today's same-tick pickup) + the grief term (§3.4.3). Frequency and the retracted headline: §0.2 |
| **N** | flees early — and wherever air actually fails, early flee is **correct** (`SafetySystem` exists because fleeing is right); lower NearDeath exposure | higher mark pressure (grieves harder), more argument exposure via lower mood | `fleeAt = FleeSuffocation × (1 − N × flee_shift_max)`, band **[0.35, 0.80]** — widened *upward* from r1's [0.35, 0.65] so the trade is real: a **low-N** crew member's late flee, deep in a bad section, can genuinely be the one that kills them (G-2 as re-scoped: survival behaviours always *fire*; success is not guaranteed). ~~r1: "the anxious one runs first; the steady one works longest — and both always run"~~ — retracted as quietly valorising low N; both still always *run*, but the steady one runs later on thinner margin, and the plan says so. The `:75` coupling is owned: modulated `fleeAt` also moves the rest point — high-N crew flee earlier **and** rest longer, coherent and stated. Owner tone question §12.3 |
| **E** | E > 0 biases idle co-location toward people — with §5.1, toward *liked* people — and familiarize gain `(1 + E⁺ × familiarize_gain_max)`: the social map fills | high E (with high A) **lingers** (§5.3): sociability has a throughput price; low E "gets more done alone" becomes mechanically true | ~~r1: "score … pick argmax(E>0)/argmin(E<0)"~~ — **the argmin branch is retracted**: introversion-as-avoidance encodes the wrong construct (§0.3). **E ≤ 0 takes the unbiased draw** (today's exact code path and stream). Avoidance exists — emitted by Feud marks (§5.1), where it belongs and is legible ("she avoids *him*", not "she avoids people") |
| **A** | fewer arguments, more bonds inside open gates (`SocialSystem.cs:149-161` scaling); heals faster socially (more bond-relief events, §3.3) | high A lingers with friends (§5.3) and its opinion-weighted wander over-concentrates on liked company. **Low A buys**: no linger, and the §5.1 feud-avoidance term is scaled by `(1 + A)/2` — the disagreeable walk right past their enemy and take the nearby job the agreeable would shun | the review's "takes the job nobody wants" lands on mark-avoidance, without inventing a mood-contagion system that doesn't exist |
| **O** | idle range: wander radius × `(1 + O × wander_radius_gain_max)` (X/Y only; the deck-Z literal untouchable, `SimDefs.cs:273-281`); **E2 contract re-pointed: breadth, not rate** — O biases *which* skills accrue (variety / cross-training) | roams far — longer walk back when work appears (a real, measurable recruitment-latency cost); the homebody is on the spot | ~~r1: "openness's strong consumer is E2 skill acquisition (learning-rate multiplier)"~~ — **retracted**, the weakest mapping of the five (§0.3); the review is right that r1 had O's two seams backwards — wander breadth is the *good* one. **Kept in v1**, a considered partial rejection of "cut O entirely" (§13.3; owner may overrule, §12.4) |

### 4.3 Guardrails, re-scoped

- **G-1 Neutral is identity — trajectory and stream.** At axis 0 / no marks every formula is
  identity **and no psyche code path consumes a `sim.Rng` draw** (§4.1), so an all-neutral
  ship's trajectory, stream included, is bit-identical. Asserted by the twin test and the
  all-neutral leg (§9.5).
- **G-2 The situation dominates — scoped to survival.** ~~r1 applied G-2's band-tightness to
  every modulation~~ — retracted: at this game's observation bandwidth (8 pawns, 810-tile decks,
  3 px bars, surname pills) **the risk is invisibility, not caricature** (design review;
  RimWorld's loud, frankly caricatured traits are the genre proof that rich surrounding story
  absorbs magnitude). r2: survival behaviours (flee, eat, drink) always fire for everyone and
  keep tight bands — though *success* within them is not guaranteed (§4.2-N) — while
  **dispositional** behaviours (dawdle, linger, range, co-location) default loud and are tuned
  *down* against measurement, never up from timidity.
- **G-3 No dice.** `PsycheSystem` computes, never rolls; its one stream (§4.1) serves *sampling*
  (candidate tiles), never outcomes; every consequence is a computed function of hashed state
  (`automation-and-souls.md` §4.2).

### 4.4 Generation, authoring, projection

As r1: axes rolled at worldgen on a forked stream (`Fork(PSYC_STREAM + id)`, the
`PersonaGenerator` pattern, advancing `sim.Rng` never), sum-of-two-uniforms triangular in
[−1, 1]; authored `CitizenSpec` axes for slice/grid, RNG-free; scenario `AddCitizen` crew
neutral. Plus r2: RaidTrauma minority incidence (§3.2), the word projection (§2.2), and the grid
eight's axes designed together with their §5.4 relationships so the standard ship's cast is a
*cast* (pairings proposed in WP-F's charter; owner-approved, §12.2).

---

## 5. Relationships as behaviour — the carrier channel

r1 gestured at relationships (a bereavement coefficient, a gate scalar) and directed **no
behaviour at any specific person** — both reviews' sharpest structural criticism, and the
event-supply audit says the fix must ride idle movement. This section is r2's centrepiece.

### 5.1 Opinion-weighted co-location (the load-bearing seam)

The §4.2-E candidate scoring weighs **who**, not **how many**: for E > 0, candidate tile score =
Σ over living co-located crew of `w(opinion(me→them))` (`w` positive, increasing, def-scaled),
**minus** a feud-avoidance term for any occupant who is the Subject of my active Feud mark,
scaled by `(1 + A)/2` (§4.2-A) — mark-driven and E-independent, so avoidance reads as *about a
person*. E ≤ 0 crew take the unbiased draw; feud-avoidance still applies to them via one
post-draw PSYC-stream re-draw, so "won't share a room with him" holds for introverts too.

This single term converts the wander channel — order of 10² decisions per crew per sim-hour
(from the measured 51 % walking share; WP-F re-measures the count) — into a live rendering of
the opinion graph. *"Okonjo keeps ending up wherever Novak is, and Sato eats alone at the far
end of the spine"* is a sentence a player says out loud; it names two people and needs no panel,
tooltip or text.

### 5.2 The saturation prerequisite (blocking, named)

`MECHANICS.md` §13.7, measured: every authored edge at its ±100 clamp within 24 h, strangers at
≈ +8, 2 611 bonds/day. **A graph pinned at the clamp weights nothing** — §5.1 over a saturated
graph renders uniform mush by day 2. This lane therefore carries a **social-decay retune** as a
prerequisite def change (candidates: `bond_chance_per_pass` down, `DecayPerHour` up, familiarize
shaped; def-only, so defs pins + slice golden move; exact values are WP-F's measured
deliverable, with §13.7's own numbers as the before-leg). Graduated from r1's unnamed confound
to a chartered dependency: **if the retune is refused, §5.1 must not ship**, and the plan says
so rather than shipping a seam that decays into noise.

### 5.3 Lingering (the sociability price)

An idle crew member sharing a room with positive-opinion company extends idle dwell
(`IdleCooldown × (1 + linger_gain × (E⁺ + A⁺)/2 × mean w(opinion))`, bounded ×3, no extra
draws). Friends cluster and *stay*, visibly — and it costs recruitment latency, which is
§4.2-E/A's cost column made real. Identity at neutral.

### 5.4 The grid ship's social ignition (content; owner-gated)

The standard eight get **authored relationships including at least one genuinely negative pair**
(opinion ≤ −40, comfortably inside the −20 argument ceiling) and a minority RaidTrauma spread
(2–3 of 8, varied weights) — otherwise Feud is unreachable (§0.1), arguments never fire, and the
marks layer is inert exactly where players look. A *feel* change to the flagship ship: **owner
decision §12.2**, recommendation yes — the authored-web machinery is already proven
(`AuthoredShips.cs:690-702`), and the grid ship is currently a cast with no play.

### 5.5 The player's verb (named, not built)

Watching plus overriding a veto is observation, not decision — and `automation-and-souls.md`
§3.1 requires features to *add* decisions. The verb this substrate exists to enable is
**assignment** (RimWorld's priorities grid is the genre's trait-legibility engine; `RoleNow` is
cosmetic today, `MECHANICS.md` §13.5). Assignment consumes everything here: C (who starts), O
(who cross-trains), Feud (who cannot crew a station together — the operator model's own §4
example), deck aversion (who refuses the deck), E2 skills. **Not built in this lane**; named as
the destination the way O names E2, so no WP optimises against it. Owner ack §12.5.

---

## 6. The seams in tick order — corrected

Registration (one hoisted instance, between `SocialSystem` and `ExplorationSystem`; consumers
take an optional ctor param defaulting null = identity):

~~r1 §6: "ticks HERE: consumes events (deaths, relationship changes) published up-stack this
tick readable now"~~ — **FALSE and retracted.** `EventBus.Read<T>()` returns the **previous**
tick's buffer (`EventBus.cs:30`; one swap per tick). What registration position actually buys:
(a) `PsycheSystem` reads **this** tick's settled `Suffocation` (NeedsSystem has run — the peak
tracker is honest), and (b) the SYSS fold position is fixed. Event-driven mark formation reads
*yesterday's tick* like every other event consumer, and therefore lives in the **every-tick**
half of the pass (`IntervalTicks => 1`; the 1 Hz-gated half does decay, pressure and dawdle
bookkeeping) — the `HistorySystem.cs:72-75` lesson applied rather than re-learned. Consumers
read previous-pass derived state (the Director-hoist convention, `DirectorSystem.cs:38-39`).

### 6.2 Lifecycle (new; closes the three §0.1 holes with one policy)

**Access is `GetOrCreate`-lazy, and a missing entry IS the neutral psyche.** Consequences, each
tested: a runtime-`AddCitizen`d citizen behaves neutrally with zero setup (`Simulation.cs:
197-202` needs no hook); a **pre-PSYC save** loads with an empty store and every citizen neutral
— old saves keep playing and their characters simply *begin* accruing history from load (stated,
not silent); allocation occurs on first non-neutral touch only, so §7 carries the qualifier
honestly. **Death prunes:** the every-tick half consumes `CitizenDiedEvent` and removes the dead
citizen's `PsycheState` (order-preserving) — it is hashed state, and an immortal roster of dead
minds is both a leak and a hash-surface lie. The dead persist where they belong: in the
survivors' marks, MEMS, the Chronicle and the eulogy.

---

## 7. Costs, restated

- **Hashed bytes/citizen:** axes 20 + peak tracker 5 + derived 12 + marks ≤ 384 = **≈ 421 B**;
  **+20 B `DriftSpent` if §3.5 is chartered** (~441 B). 8 crew ≈ 3.4 KB; 200 crew ≈ 84–88 KB.
- **Per-tick:** every tick — event span reads (usually empty) + completion notifications
  (§4.2-C call sites). 1 Hz — O(citizens × marks) multiplies + the wander scoring's extra
  PSYC-stream draws when a biased branch is taken (3–30 per candidate, K ≤ 4; bounded, measured
  in WP-F). ~~r1: "Zero steady-state alloc"~~ — qualified: zero **after** first touch per
  citizen; `GetOrCreate` allocates once per citizen ever (§6.2).
- **Checksum:** ~(12 + 5 × marks) Combines/citizen + the PSYC stream state — noise against the
  measured 14 657 device-name Combines (`Simulation.cs:341-345`); not a tick path (`:278`).
- **Def fields: one `[psyche]` section, ~26 keys, landing in ONE defs commit (WP-B).**
  ~~r1: def "tranches" across WP-B..G, each marked "spine? no"~~ — retracted as
  self-contradictory (r1 itself cited `CitizenMemory.cs:219-221` calling the def registry
  integrator-gated) and as six defs-pin moves in one lane against a 117-key surface
  (`DefsParser.cs`, counted). r2: WP-B ships the whole section with later-seam scalars defaulted
  inert (the W0-6 batch-the-fold precedent); later WPs *read* existing keys and move no defs
  pin. The one exception: WP-F's §5.2 retune changes the *values* of existing social keys —
  called out in §9.2.
- **Pins per WP:** §9.2's last column — predictions to be measured, never quoted as results
  (A-1, W-11).

---

## 8. The surface — v1 ships its own visibility (r1's deferral retracted)

~~r1 §10 item 8: "No new wire channel, no UI work — … v1's visibility is behaviour on the map
plus HistorySystem lines."~~ **Retracted.** The review showed (a) the map channel under-delivers
for half the seams (§0.2), (b) mood has literally no per-crew surface (§0.1), and (c) the one
strong seam is undercut by label de-cluttering. Three cheap, in-scope fixes:

1. **Identity, state and prediction lines ride `roster.traits` — no wire shape change.** The
   field is already a string array rendered as chips (`overview-view.js:580-586`). v1 ships:
   five axis-words + active mark-words (§2.2) + **prediction chips** computed sim-side from the
   same functions the behaviour runs (*"slow to start"*, *"won't work deck 5"*, *"flees
   early"*, *"lingers with friends"*). W-12 already demanded the flags as proof of the words;
   they now ship with each seam's own package. Chips are host-composed strings; the *numbers*
   never cross the wire (W-13).
2. **The CREW WATCH bar repoints to mood.** One host change: the roster's `morale` field emits
   normalized `Mood` (the `ShipMetrics.cs:86` mapping, clamped) instead of the constant
   `Citizen.Morale`. Eight always-visible per-crew bars stop being a shipped lie (`MECHANICS.md`
   §13.4) and become the mark layer's ambient display — a bar dipping after a death IS the
   history feature, visible from across the room. Wire field name unchanged; client untouched
   for this item.
3. **The label-collision dependency, named:** ~20 lines in `overview-scene.js`/`styles.css` so
   clustered *idle* crew keep identity (crowded tags cycle visibility, or a dot+initial
   fallback) — without it, §5.1 clusters friends and the de-clutter sweep
   (`overview-scene.js:454-478`, `styles.css:874-875`) hides exactly who they are at the moment
   the seam fires. Room-Zoom pawn identity, off-deck visibility and a deck indicator remain out
   of scope and are listed in §10.8.

The Persona window itself stays deferred (owner decision); r1 §8's showables list stands as its
contract, now with residues (§3.3) guaranteeing *"Lost Novak, D14"* survives behavioural expiry.

---

## 9. Work packages, gates, measurements

### 9.1 The lane is SERIAL

~~r1: "disjoint file sets" (and a parallel-safe set in the order note)~~ — retracted:
`SimDefs`/`DefsParser`, `AuthoredShips`, `CitizenSystem` and the consumer ctors cross-cut the
table (architecture review). One worktree, one serial chain; each package still carries one
reviewable claim, one Opus implementer, one independent reviewer, private log filenames, every
named mutation physically applied.

### 9.2 The chain

| WP | what | reviewable claim | spine? | pins (predict → measure) |
|---|---|---|---|---|
| **A** | store + save/hash/round-trip + registration + hoist + null-param consumers + **the PSYC stream fork** (§4.1) + generation + lifecycle (§6.2) | twin test (neutral system vs none: every `Citizen` field identical at tick 3 000 **and `sim.Rng.State` identical**); round-trip incl. a pre-PSYC save; death prunes; axis roll advances `sim.Rng` zero draws | **yes** (`SystemStack`) | scenario + tick-3000 + slice fold-only; defs hold |
| **B** | the whole `[psyche]` def section (once, §7) + C seam (completion-site notifications, dawdle, self-serve shift) + slice/grid authored axes | per-axis differential test for C (§9.4); §0.2 completion frequency re-measured (A-6); abandonment never dawdles (flee fixture); all-neutral leg byte-identical | **yes** (defs; the `JobSystem.cs:140` gate line) | slice + BOTH defs move (the once); scenario/tick-3000 predicted hold |
| **C** | N seam (flee band [0.35, 0.80] + stress gain), the `:75` coupling owned, prediction chips for C/N (§8.1) | flee onset strictly ordered by N; the late-flee-can-die case demonstrated in a deep-hazard fixture (and its survival twin at higher N); differential test N | no | slice moves |
| **D** | marks: formation, decay (event-modulated + residue), pressure, `MarkFormedEvent` → History, RaidTrauma minority; **CREW WATCH mood repoint** (§8.2) | per-kind **fireability** tests (§9.4) incl. the Feud negative control; bond-relief accelerates decay (driven); residue persists at Weight 0; the morale bar varies (the constant-1.0 assertion inverted) | no | slice moves |
| **D2** *(if §12.1 = now)* | drift deposits + `DriftSpent` caps | drift only on qualifying retirement; lifetime cap binds; identity with no marks | no | slice moves |
| **E** | deck veto (`PsycheVeto` + 4 `Select` sites) + grief dawdle + veto prediction chip | veto fires/expires on the 96 h curve; the three bounds each mutation-tested; no dispatcher throw under exhaustion | no | slice moves |
| **F** | **the §13.7 social-decay retune (prerequisite, measured against §13.7's own numbers)** + §5.1 opinion-weighted wander + feud avoidance + §5.3 lingering + E/A gate scaling + **grid social ignition** (§5.4, owner-gated) + the label fix (§8.3) | post-retune the slice web is unsaturated at day 3 (edges off-clamp, tiers still move); co-location tracks opinion (driven pairs); linger costs measurable recruitment latency; differential tests E/A | no | slice + BOTH defs move (retune of *existing* keys — the §7 exception) |
| **G** | word projection (§2.2 table) + axis-word lint + O seams (v1 breadth; E2 breadth contract note in `ECONOMY-PLAN.md`) | five words always; lint passes shipped slice content unmodified (Volkov keeps `stoic` + `haunted`); differential test O | no | slice moves (O seam); prose parts pin-free |
| **H** | docs + re-pin (`MECHANICS.md` incl. striking the now-false *"no sim system reads a trait"*, `CLAUDE.md`, `HANDOVER.md`, memory) | every quoted number re-measured on the merged tree | re-pin | — |

### 9.4 The warrant, mechanised (r1's process gate retracted)

~~r1: "the rule is enforced at the lane level: … the integrator holds the merge"~~ — retracted;
that is the control that failed E0-4's WP-5. Three mechanised layers, each landing with the
field it guards:

1. **Per-axis differential test:** same seed, one crew member at +1 vs −1 on that axis alone,
   assert a named `Citizen`-field trajectory divergence within N ticks. An unread axis cannot
   pass it; a consumer *census* can (a discarded read) — hence trajectory, not census.
2. **Per-mark fireability test:** a driven fixture (grid-derived where possible) in which the
   mark forms **and its behavioural consequence fires** — plus, for Feud, a negative control
   asserting it *cannot* fire on the unseeded grid ship, so §5.4's dependency is a red test,
   not prose, until ignition lands.
3. **Warrant scope = every hashed field this plan adds.** ~~r1 bound the warrant to axes
   only~~ — which is exactly how three of four mark kinds nearly shipped unfireable. A hashed
   field with no test in which its value changes an outcome is W-2.

Evidence standard: **a named event a naive observer can point at**, not an aggregate spread —
aggregates remain as instrumentation, never as proof of visibility.

### 9.5 The observability gates (r1's M5 retracted)

~~r1 §9.3-M5: "A person given the axis sheet and the running game … matches ≥ 6 of 8 crew"~~ —
retracted: unachievable at v1 seam count (chance expectation ≈ 1; realistic ceiling 2–4),
protocol-free (an informed subject has expectancy bias), no failure action — and identification
is the wrong construct: the thesis is *"a person you can know"* (`VISION.md`), and knowing is
**prediction**, not recognition.

- **Tier 1 (blocks the WP; mechanical):** per-seam **event-level** separation on seed-paired
  legs — e.g. *"across ≥ N observed completion events with a non-empty board, the C = +0.8 crew
  member started sooner than the C = −0.8 one in ≥ X % of cases"*; *"across ≥ N wander
  settlements, the E = +0.8 crew member co-located with liked crew ≥ X pp more often"*.
  Thresholds set per WP from the loud-default priors (A-5), reported with N.
- **Tier 2 (blocks the LANE at merge; human):** a **naive** observer — has not read this plan,
  recorded in the protocol — watches the grid ship and answers **forced-choice predictions
  registered before observation** (*"the next job appears on deck 1: does Sato or Vega reach it
  first?"*, *"a death just occurred: whose bar drops furthest?"*), scored against chance at
  stated N and p (≥ 20 questions, binomial p < 0.05). **Failing Tier 2 blocks the merge.** That
  sentence is the gate.
- The identity legs run in every WP: the twin test, and the all-neutral occupancy leg (axes
  zeroed by test hook, shipped non-zero defs, byte-identical trajectory **and** `sim.Rng`
  stream — identity from construction, never from zeroed defs).

---

## 10. Honest limits, and what is deliberately not designed

1. **The conversation surface is stood down and stays down — an explicit non-goal.** No work
   package in this plan touches it. Every mention of "the dialogue layer" in this document
   describes the **opt-in integration surface** (`console-retirement.plan.md` §1.5.5), not a
   shipping deliverable; the shipping build has no reachable free-text conversation (owner
   decision, §1.5 there). r1 used the live present tense and sanctioned prompt enrichment
   without this frame; corrected here and enforced by W-13.
2. **The liability surface grows, and the mitigation is structural.** After this plan the sim
   holds a stable machine-readable psychological profile per crew member — five dimensions, a
   bereavement weight naming a dead crewmate, a trauma weight, a feud record naming a person.
   Two named exposures: it makes the stood-down conversation feature cheaper to rebuild (a
   pressure; unnamed pressures are how stand-downs erode), and a *quantified* profile invites
   the reading that the product administers a psychometric instrument. Mitigations: **the
   prompt-assembly layer may read only the derived WORDS (§2.2), never axis or mark numbers**
   (W-13); psychometric vocabulary stays out of every external artifact (§0.3); and this
   paragraph exists so the pressure cannot erode the stand-down silently.
3. **The Persona window** — deferred (owner); §8's showables are its contract.
4. **Skills / operator yield** — E2's; this plan adds two contract lines (C → maintenance
   quality, O → breadth) and stops.
5. ~~r1 §5 loop 5: "History → economy, through the one door … Mark pressure → mood → Morale →
   Director → WearPressure today"~~ — **withdrawn as a claim of significance.** Traced
   honestly: 8 moods → arithmetic mean → 0.4-weighted clamped tension → a [1, 1.35] wear
   multiplier, over a mood already floored ≤ −5 by saturating fatigue — a whisper, not a
   channel. The *architecture* stands (marks → mood → the one sanctioned path, no second
   channel); the **economic significance is deferred to E2 in words**, where mood becomes an
   operator yield input.
6. **Betrayal / Rescue / PromiseBroken marks** — reserved, unwritten, awaiting publishers
   (§3.2; `PromiseBrokenEvent` exists unpublished).
7. **The fatigue confound** — named (§0.1), controlled for in measurement, not fixed here.
8. **Room-Zoom pawn identity, off-deck crew visibility, a deck indicator** — real §8.3-adjacent
   gaps, out of scope, listed so nobody meets them as surprises.
9. **Crew-scale ceiling untested** (the O(n²) social pass pre-exists; nothing here worsens
   asymptotics; no 200-crew claim is made).
10. **Effect sizes are priors** (A-5), with the loud-default direction now stated.

---

## 11. Wrong if — revised

- **W-1 Neutral is not identity — trajectory and stream.** Any modulation whose value at
  axis 0 / no marks differs from shipped behaviour, **or any psyche code path that consumes a
  `sim.Rng` draw** (the fork is total, §4.1). r1's subtle forms (a symmetric formula's non-zero
  neutral point; changed draw counts) both remain live examples; the second is now structurally
  prevented, not merely forbidden.
- **W-2 A hashed field ships unwarranted** — scope widened from axes to **every** hashed field
  (§9.4.3). The `Citizen.Health` precedent.
- **W-3 Cosmetic or unbounded magnitudes** — with the r2 asymmetry: dispositional seams tuned
  timid (invisible) violate this exactly as survival seams tuned loose do. §4.3 states which
  direction each class errs toward.
- **W-4 Personality in the arbitration** — recruit gate and stamp-and-skip only; never the
  argmin (`JobSystem.cs:234-247`).
- **W-5 Dice in the psyche** — sampling draws from the PSYC stream are not outcomes; an outcome
  roll anywhere is the violation.
- **W-6 Prose in the hash** — marks are numbers; residues too.
- **W-7 The LLM writes the psyche** — no new `CitizenEffect` kind; no host path.
- **W-8 Mood grows memory** — `NeedsSystem.cs:157-158` stays true and is updated in the same
  commit that adds the term.
- **W-9 Reserved mark kinds written in v1.**
- **W-10 Guard tests that cannot bite** — the four repo traps (`CLAUDE.md` "Traps"); every
  named mutation physically applied, watched red, reverted.
- **W-11 Predicted pins quoted as measured** — §9.2's last column is a prediction ledger, not a
  result; every WP measures all five and records why each moved or held.
- **W-12 Numbers instead of character / words without flags** — both directions; §8.1 makes the
  flags a v1 deliverable rather than an aspiration.
- **W-13 (new) Raw psyche numbers cross an external boundary.** No axis value, mark weight,
  `MoodPressure` or drift figure may appear in a prompt, in store copy or patch notes, or on
  the wire beyond §8's defined surface (derived word/flag strings and the normalized mood
  scalar); no external artifact uses psychometric vocabulary. The prompt layer reads words
  (§2.2) — "you are grieving" survives intact. A boundary on *representation*, not on the
  narration §3.4.4 sanctions.
- **W-14 (new) The frequency floor misapplied to marks.** Deleting Bereavement/NearDeath
  because they fire rarely on a healthy ship inverts §0.2's rule: disposition seams owe
  frequency; marks owe reachability and salience. Shipping an unfireable mark and cutting a
  fireable-but-rare one are failures against the same audit.

---

## 12. Open questions for the owner

Nothing below is resolved by this plan; each has a stated recommendation and a bounded blast
radius, and nothing gets built without the owner's word.

1. **Axis drift (§3.5): charter now (WP-D2) or defer to a named later lane?** Recommendation:
   now — the cheapest honest answer to *"history that shapes the way the person thinks and acts
   now"*; the mechanism is fully specified either way. Cost if now: +20 B/citizen, ~6 def rows,
   one WP.
2. **The grid ship's social ignition (§5.4): may the standard eight gain authored relationships
   (including a negative pair) and a minority RaidTrauma spread?** Changes the flagship's feel
   on day one. Recommendation: yes — without it the Feud/argument machinery is unreachable
   where players look. If refused: the marks layer ships **explicitly labelled latent** on grid
   (the §9.4 negative control standing as documentation), and Tier-2 questions avoid social
   predictions.
3. **The N band's upper end (§4.2-N): may a low-N crew member's late flee be
   survivable-only-sometimes (band to 0.80)?** A tone decision — personality-correlated death
   risk on hazard ships (never on the healthy grid ship, where flee is measured 0).
   Recommendation: yes; the alternative keeps N pure-cost, which the validity review correctly
   called moral pricing.
4. **Openness in v1 (§4.2-O): keep the wander-breadth seam (recommendation), or cut O's seams
   entirely** (two reviewers' preference) while still rolling and projecting the axis? Cutting
   costs nothing now but makes O a word with no warrant until E2 — which W-2 tolerates only if
   the axis-word table drops its O row until then. Argued in §13.3.
5. **The assignment verb (§5.5):** acknowledge it as the substrate's intended player verb (a
   direction, not a commitment), so E2/UI lanes design toward it rather than around it.

---

## 13. Review-response ledger

### 13.1 Findings that changed the plan's shape

The inversion (marks engine / axes prior — title, §1–§3); the event-supply audit as §0.2 and
its carrier conclusion (§5 as centrepiece; the §13.7 retune from confound to prerequisite); the
PSYC stream fork moved into WP-A on the falsified A-4; the two-sided repricing of every axis
and the G-2 re-scoping (§4.2–4.3); the word-projection redesign (§2.2); RaidTrauma to
minority-with-recovery; decay to event-modulated-with-residue and longer behavioural
half-lives; def batching and the serial lane (§7, §9.1); the mechanised warrant and the
two-tier observability gate with a merge-blocking human protocol (§9.4–9.5); v1 surface work in
scope (§8); the governance frame (§10.1–10.2, W-13, §0.3).

### 13.2 Findings adopted as stated

The `:163-164` citation fix; the §6 event-ordering correction; the completion-signal gap —
closed via source-site notification, which also dissolves the reviewer's abandonment-conflation
*and* avoids their proposed `PrevJobKind` hashed byte (adopted in substance, improved in
mechanism); the lifecycle policy (§6.2); the `SafetySystem.cs:75` coupling owned and the
NearDeath threshold pinned to the def value; the §5-loop-5 withdrawal; veto-expiry lengthening;
the `cowardly` and `SpeechStyle` removals; the E-argmin cut; the O-seam inversion; the
C-grief-damping removal; the CREW WATCH mood repoint; the label-collision dependency; the
naive-observer protocol.

### 13.3 Findings rejected or narrowed, with argument

1. **"Drop or redesign anything below ~1 event per crew per sim-hour" — narrowed to disposition
   seams; marks exempted (W-14).** A mark's value is concentrated, not amortised: one
   Bereavement that visibly bends a named person for four days is worth more character than a
   thousand biased wander draws, and `automation-and-souls.md` §9 explicitly asks for
   rare-but-memorable over constant. The audit's real lesson for marks is *reachability*, and
   §9.4.2 enforces that with driven fixtures and a negative control instead of a frequency
   floor. Applying the floor as written would delete Bereavement and NearDeath — i.e. the
   brief.
2. **"Cut Openness from v1 entirely" — partially rejected.** The axis stays rolled and worded
   and keeps the wander-breadth seam, *because the review's own analysis upgraded that seam*
   (breadth is O's honest signature, §0.3; and §0.2 rates the wander channel the only
   high-bandwidth carrier). Cutting O's seams while keeping its word violates W-2; cutting the
   word leaves four-word rows and a permanently silent lane in a five-axis state. The cheap,
   warranted seam beats both. Owner may overrule (§12.4).
3. **"Decay grief on events rather than a timer" — hybrid, not replacement.** The event term is
   adopted as the dominant, story-carrying mechanism (§3.3), but a *purely* event-gated decay
   lets an isolated crew member carry a full-weight behavioural tax indefinitely with no
   counterplay — a permanent character state created by the absence of bond luck rather than by
   design. The slow timer bounds the tax; the event term carries the story; the residue keeps
   the memory either way.
4. **"Six defs-pin commits" — the count was right; the implied remedy (fewer knobs) wrong.**
   The scalars are the honest tunable surface A-5 depends on; the fix is batching (§7), with
   WP-F's retune of existing keys as the one flagged exception.

### 13.4 Standing corrections to r1 quotable claims

For grep-ability, every retracted r1 sentence appears quoted-and-struck at the section that
owned it: the substrate-first framing (header); *"the single most visible differentiator"*
(§2.1, §4.2-C); assumption A-4 (§0.4, §4.1); *"published up-stack this tick"* (§6); *"No new
wire channel, no UI work"* (§8); *"zero steady-state allocation"* (§7); *"disjoint file sets"*
(§9.1); the ≥ 6/8 identification gate (§9.5); universal RaidTrauma (§3.2); the ±0.6 word
thresholds and *"can never disagree"* (§2.2); the E argmin (§4.2-E); the O learning-rate
charter (§4.2-O); C grief-damping (§3.4.3); *"history reaches the economy today"* (§10.5);
*"axes are fixed … psychologically defensible"* (§0.3); timer-only decay and delete-on-expiry
(§3.3); *"the anxious one runs first; the steady one works longest"* (§4.2-N); the
axes-only warrant and the process-enforced merge gate (§9.4); *"the integrator holds the
merge"* as an enforcement mechanism (§9.4).

---

*Companion docs: `perilune-automation-and-souls.md` (operator model; §3.1's decision test and
§9's rare-but-memorable register are both load-bearing here), `perilune-console-retirement.plan.md`
§1.5 (the stand-down and the Persona seam), `docs/ECONOMY-PLAN.md` E2 (skills; two contract
lines added by this plan), `docs/MECHANICS.md` §13.3–13.7 (the dead-state precedents and the
two measured confounds — fatigue saturation and social saturation — this plan builds against).*
