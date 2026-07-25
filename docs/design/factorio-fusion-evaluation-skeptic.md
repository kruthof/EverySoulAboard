# Red-team verdict: "Combine Factorio elements into Every Soul Aboard"

*Skeptic lane. Read-only. Evaluated against the strongest version of the idea, not a strawman.*

**The idea (director):** scarce resources + a limited crew extracting materials from ship
structures/comets → "combine elements from Factorio: to process materials the player has to
*automate things, build production chains* — leveraged by pawn skill. Intertwine resource
management + an automation game + RPG elements."

**One-line verdict: ADOPT-NARROWLY — but only the two halves the game already committed to
(a deeper skill-gated production graph + MOSS duty-cycle optimization); REJECT the third
half outright (Factorio as a genre-frame: logistics automation, throughput-optimization as
the core loop, self-running factories). The design corpus already refuses that third half on
measured evidence, and calling it "Factorio" is precisely the framing that would reintroduce
it.**

The honest read: ~two-thirds of what the director describes is *already the approved plan*
wearing a new genre label. The remaining third is the dangerous third, and it is dangerous in
exactly proportion to how literally "an automation game" is taken.

---

## 1. The identity objection — automation-as-optimization competes with the people for the screen

This is the sharpest version, and it is not about any single feature. It is about **what the
game tunes toward.**

Factorio's core dopamine is the *self-running factory*: the fantasy is your **absence** — you
design a system so it produces without you, and the reward is watching belts move while you
walk away to the next bottleneck. Its success metric is throughput-per-minute and
interventions-eliminated.

Every Soul Aboard's entire thesis is the opposite. Pillar 2 — "People, not pawns" — is
"every citizen is a person you can *actually talk to*" (`VISION.md:16-17`, `:37-41`). The
success criteria are: a player names crew unprompted; **a death makes a player stop playing
for a minute** because the eulogy quoted a conversation they had (`VISION.md:219-222`). The
art budget is deliberately narrowed to one surface — *ship interiors, the crew, space through
sensors* (`VISION.md:182-187`) — and the P2 exit gate is a screenshot that reads better than
RimWorld on **crew density and mood**, not on factory legibility (`VISION.md:202-204`).

These two reward curves point in opposite directions and **you cannot tune for both at once.**
A factory that runs itself is a factory the player is *not watching crew operate*. Every
attention-minute the player spends staring at a production ratio or a bottleneck is a minute
not spent in the ConversationHub, not reading the Chronicle, not grieving Okafor. The
automation layer does not merely coexist with the people-pillar; on the scarcest resource in
the whole design — **player attention** — it is a direct competitor, and it is a *stickier*
competitor, because optimization loops are famously more compulsive than social ones. The risk
is not that automation is bad. It is that automation is *good enough to win the attention war
the game exists to make the people win.*

The design corpus already saw this exact hazard and named it in one sentence:

> "If MOSS could produce matter it would become **Factorio-with-worse-belts and would automate
> away the people, killing pillar 2**." (`ECONOMY.md:216-220`)

The corpus is not neutral on the word "Factorio." It uses it as the name of the failure mode.

---

## 2. The decision-contradiction — the idea runs straight at a MEASURED, DECIDED anti-logistics stance

This is the load-bearing objection, because it is not a matter of taste. `ECONOMY.md` §8 is an
explicit decision made on measurement:

> "**Do not build belts, drones or logistics automation. Hauling stays crew labour.** It is one
> of the two largest labour sinks in the genre, and automating it away removes the thing that
> makes crew visible on screen — **which was round 3's complaint.**" (`ECONOMY.md:588-589`)

And again in the "explicitly do NOT build" list: "No belts, drones or logistics automation
(§8)" (`ECONOMY.md:904`).

The evidence this decision rests on, that the idea must overturn to proceed:

1. **The round-3 playtest finding** that crew were not visibly doing work — the complaint was
   *invisibility of labour*. Two of the last four landed work-packages exist to fix exactly
   this: E0-2's ~10× work-rate rebase explicitly answers "I am not sure if they truly work on
   something" by turning a 2-second task into a 15-minute visible service call
   (`ECONOMY.md:434-436`, `CLAUDE.md` E0-2 snapshot). **Hauling is named as one of the two
   largest labour sinks in the genre** (`ECONOMY.md:588`) — i.e. it is a large fraction of the
   *visible-work budget the team just spent four work-packages buying back.*
2. **The measurement that hauling is where crew-visible labour lives.** §1.3 measured on-job
   time at 47.2% travel (`ECONOMY.md:99-104`); the whole point of keeping hauling manual is
   that walking crew *are* the animation of a living ship (`VISION.md:191-194`).

A Factorio logistics layer — belts, drones, inserters, any "the materials move themselves"
mechanic — **automates away the single largest chunk of visible crew labour**, undoing round
3's fix and the E0-2 investment in the same stroke. To adopt it, the director must overturn a
decision that was made *on a playtest complaint and a labour measurement*, not on a hunch. That
is a high bar, and the idea as literally stated clears none of it.

**The steelman rebuttal, addressed:** "the director said *elements* of Factorio, not belts."
True — and the narrow version (below) survives. But the phrase "an automation game" and "the
player *has to* automate things" is a genre-frame, not a feature request, and genre-frames set
tuning targets. If the target becomes "the player automates material processing," logistics
automation is the natural gravity well that frame falls into, because that is what makes a
Factorio production chain *feel* like Factorio. The decision-contradiction binds against the
frame even where it does not bind against every possible feature.

---

## 3. The genre-failure-mode import — Factorio is infinite-scaling; this game is deliberately closed and contracting

Factorio is the purest infinite-scaling optimization game in the medium: renewable ore patches,
production that scales without bound, and a research tree that is the definition of an
un-losable global unlock. Every one of those three is a thing Every Soul Aboard's design
*explicitly engineers against.*

- **The axiom is a closed box.** "The hull is a closed thermodynamic box. Every gram aboard
  came through an airlock… **The voyage is the only faucet.**" (`ECONOMY.md:180-186`). Factorio's
  fun *requires* an infinite input; this game's identity *requires* there isn't one. §9.6 is
  categorical: "a renewable internal faucet is **a lie the player can see**" (`ECONOMY.md:729`).
  A production-chain game where you "automate things to process all materials needed" only feels
  good if the materials keep coming — which is the faucet the axiom forbids.
- **The differentiator is subtraction, not construction.** "RimWorld asks *what will you build?*
  PERILUNE asks *what will you take apart, who still knows how, and what does it cost to keep
  what you already have?*" (`ECONOMY.md:196-198`). Factorio is the apotheosis of *build more*.
  The game has deliberately chosen the opposite verb (deconstruct is a first-class verb;
  E0-5 just landed it — `CLAUDE.md`).
- **E4 is explicitly designed against saturation** — the exact failure mode Factorio embodies.
  "RimWorld's wealth→raid curve **saturates**… Perilune's escape is that upkeep (S1 + S4) is a
  **rate, not a threshold**" (`ECONOMY.md:372-376`, `ECONOMY-PLAN.md:134-140`). The design's
  answer to "how do we keep the late economy interesting" is *superlinear upkeep on reclaimed
  volume* — **the more you build/automate, the more it costs to keep alive.** That is the
  anti-Factorio: in Factorio, scale is free-and-good; here, scale is a rising tax. Bolting a
  Factorio production-optimization loop onto a game whose endgame lever *punishes* scale is
  importing an engine that fights the chassis.

So: the idea smuggles in *both* failure modes the roadmap is built to avoid — the renewable
internal faucet (§9.6) and economic saturation (E4). Not because the director wants them, but
because they are load-bearing to the genre the frame invokes. You cannot take "elements of
Factorio's production-automation feel" without leaning on the infinite-input assumption that
makes that feel possible.

---

## 4. The substrate/scope reality — it is premature AND on sand

Even granting the idea were vision-compatible, the ground it would build on does not exist yet.

- **The conversion graph is 4 items deep and half of it is dead.** The shipped ladder is
  Scrap→Parts→ControllerModule, single-input/single-output, and the terminal product **has zero
  consumers** (`ECONOMY.md:271-289`, §5). Factorio's fun is a *wide, deep interlocking graph*;
  this game has a 3-hop line that dead-ends in a paperweight.
- **The economy TERMINATES at sim-hour 28, measured, on every ship.** Every ship converts its
  finite starting matter into unused `ControllerModule` and then idles at ~1.5% busy forever
  (`MECHANICS.md:1659-1712`). A1 (>25% busy at hour 24) currently reads 24.979% — FAIL — and
  the finding is that *matter, not labour, is the binding constraint* (`MECHANICS.md:1705-1712`).
  **You cannot build an automation-optimization layer on an economy that runs out of everything
  in a day.** There is nothing to optimize the flow *of*.
- **The team is mid-E0.** Of E0's eight work-packages, four have landed (E0-1/2/3/5); E0-4, E0-6
  (the conversion-loss graph itself), E0-7 (ice→water, the recurring supply), and E0-8 (the
  ledger — the metrics still *lie*, food reads 1.00 while dead) are not built
  (`ECONOMY-PLAN.md:72-81`). E1–E4 are entirely unbuilt and already an approved P4-scale
  programme pulled forward (`ECONOMY-PLAN.md:8-9`). Throughput is one dual-reviewed work-package
  at a time, ~4-of-6 sent back before merge (`ECONOMY-PLAN.md:441`). A Factorio layer is not a
  feature that slots into that queue; it is a *fifth phase* competing with a backlog that
  already stretches past E4.

**What would have to be TRUE first, before this is even discussable:**
1. E0-6 has landed — the multi-node `[production]` graph is real, conversion is lossy, and
   `ControllerModule` finally has a consumer (kills the dead-item, closes the matter incinerator).
2. E0-7 (ice→water) and E3 (the voyage) exist — i.e. there is a *durable, legitimate faucet*, so
   there is a sustained material flow for automation to act on at all.
3. E2 skills exist — the "leveraged by pawn skill" half has a substrate (yield/defect modulated
   by skill + held Procedure, `ECONOMY.md:485-506`).

Until all three, "add a production-automation layer" is building the fourth storey on a building
that is currently one-and-a-half storeys and on fire at hour 28.

---

## 5. The redundancy question — MOSS already IS the automation game, in-genre and diegetic

This is the objection that should most give the director pause, because it suggests the itch is
*already scratched better than Factorio would scratch it.*

- **Automation is Pillar 4.** "Automation is diegetic. MOSS… remains **the mechanical
  differentiator for the engineer-brained half of the audience**: the ship's nervous system is a
  language you learn by reading dead crew's scripts." (`VISION.md:48-50`). The game already has
  a designed, shipped, complete automation surface for exactly the audience Factorio targets.
- **The MOSS terminal is DONE** — a full IDE, live device scripting, `every`/`when`/`alarm`
  handlers over real device adapters (`MOSS_SPEC.md` §1-4; `CLAUDE.md` "MOSS terminal COMPLETE").
  The engineer-optimization loop is *build*, not aspiration.
- **The design already assigned MOSS its economic role, and it is precisely the safe Factorio
  element:** "MOSS buys duty cycle, never matter. A scrubber scripted to run only above 1,200 ppm
  halves its wear *and* its power draw." (`ECONOMY.md:216-218`). This is the *optimize-your-
  system* fantasy — the good half of Factorio — delivered **without belts, without a faucet, and
  in-fiction.** It optimizes *when and how hard machines run against upkeep and power*, which is
  exactly the "leveraged, intertwined" loop the director is reaching for, and it composes with
  the closed-box axiom instead of breaking it.

The pointed conclusion: **when the director says "Factorio," the in-genre thing they can
actually have is "make MOSS matter more."** The redundancy is not that MOSS overlaps a bit with
Factorio — it is that MOSS is the *correctly-shaped, already-built, pillar-4* version of the
same desire, and reaching past it to Factorio proper trades a differentiator the game owns for a
genre it would lose a fair fight in (Factorio, Satisfactory, Dyson Sphere Program are a decade
ahead on belts; the game's own note calls the belt version "Factorio-with-**worse**-belts",
`ECONOMY.md:217`). The game beats ONI/Factorio "on people, not thermodynamics"
(`ECONOMY.md:897`) — and not on logistics either.

---

## 6. Honest verdict, steelman-proofed

**ADOPT-NARROWLY the two halves already committed; REJECT the Factorio frame and any logistics
automation; DEFER-nothing (the safe parts are already scheduled).**

Concretely, the narrowest version I could live with — and it requires *zero new genre*:

- **YES: a deeper, lossy, skill-gated production graph.** This is E0-6 (the `[production]` node
  table + conversion loss, `ECONOMY.md:342-349`, §5) plus E2 (yield/defect by skill + held
  Procedure, `ECONOMY.md:485-506`). This *is* "production chains intertwined with RPG skill."
  It is already approved. Badge it "Factorio-flavoured depth" if it helps morale; change no plan.
- **YES: MOSS as the optimization layer** — duty-cycle scripting that trades player cleverness
  for upkeep/power savings (`ECONOMY.md:216-218`), grown per `WS-MOSS` (`PLAN.md:209-212`). This
  is the engineer-audience automation fantasy, in-genre. Deepen MOSS before inventing anything.
- **NO: belts, drones, inserters, logistics automation, self-running material transport** — the
  measured §8 decision stands; hauling stays crew labour (`ECONOMY.md:588-589`).
- **NO: "an automation game" as a tuning target or core-loop frame** — because the reward curve
  points away from the people-pillar (§1 above), and because it drags in the two forbidden
  failure modes (§3).

**Does the objection still bind against the advocate's best version?** Assume the advocate builds
the smartest possible Factorio-fusion: no belts, "automation" means MOSS duty-cycling a deep
skill-gated production graph, all inside the closed-mass ledger. Interrogate it and it collapses
into *the plan the game already has* (E0-6 + E2 + WS-MOSS growth) with a Factorio sticker on it.
At that point the "adopt" is real but the "Factorio" is decorative — the advocate has not added a
genre, they have renamed three approved lanes. And the *moment* the advocate adds one genuinely
Factorio-defining element to earn the label — belts, a self-running factory, an infinite input,
throughput-per-minute as the win condition — it hits one of the four walls above (§8 decision,
§9.6 faucet-lie, E4 saturation, or the attention-war with pillar 2). So the objection binds
exactly where it should: it blesses the depth, and it refuses the genre. The two are separable,
and separating them is the whole answer.

**The one framing risk to flag to the director:** the danger here is not a bad idea, it is a
*good idea mislabelled.* "Deeper skill-gated production + more MOSS" is excellent and mostly
funded. "Let's make it an automation game" is a mission-creep vector that, taken at its word,
would spend the scarce build budget re-fighting Factorio on Factorio's turf while diluting the
one pillar (people) the whole project is a bet on. Adopt the substance; refuse the label.
