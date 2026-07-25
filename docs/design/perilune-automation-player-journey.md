# How the automation player plays *Every Soul Aboard*

> **Audience:** the automation enthusiast — you have a few hundred hours in Factorio,
> Satisfactory, Oxygen Not Included, or you live in RimWorld's work-priorities screen. You want to
> know: *how do I play THIS game as an automation person, and why isn't it just a factory game?*
>
> **Status:** design narrative — a player's-eye view, written to be easy to understand. It is
> **honest about what is built vs. planned**; see the box at the end. Nothing here invents a
> mechanic beyond the design authority.
>
> **Derived from:** `docs/design/perilune-automation-and-souls.md` (the binding principle),
> `docs/VISION.md` pillar 4, `docs/legacy/MOSS_SPEC.md` +
> `docs/design/perilune-moss-terminal.spec.md` (the automation interface, built),
> `docs/ECONOMY.md` + `docs/ECONOMY-PLAN.md` (the matter ladder and the roadmap), and the two
> Factorio-fusion evaluations archived beside the principle doc.

---

## TL;DR (read this if you read nothing else)

- You **extract matter** by tearing the ship apart, **refine it up a four-step ladder**
  (Regolith → Scrap → Parts → **ControllerModule**), and spend the scarce top rung to make a
  machine **scriptable**. Then you write **MOSS** — the ship's in-fiction automation language — to
  control that machine. Repeat, deeper.
- The twist: **automation here is never faceless.** Every automated line is *run by a named crew
  member*, and their **mood and skill deterministically set how much it makes and how often it
  fails.** Optimizing production and caring about a person are the *same activity*.
- You automate **control, not conveyance.** You script *when and how hard a machine runs*. You do
  **not** lay belts — hauling stays a visible human walking across the deck. That is on purpose.
- The whole thing is throttled by **one scarce currency** (ControllerModule). You can never afford
  to automate everything, so *what to automate* is always an interesting decision.
- It is **not Factorio** (crew are invisible there; here they're the point) and **not the Sims**
  (people have no economic stakes there; here their moods are an economic input).

A definitions cheat-sheet, because three words do a lot of work:

- **MOSS** — the ship's scripting language. It reads live sensors and commands devices. You write
  short rules like *"when CO₂ gets high, run the scrubber harder."* It moves **zero** matter — it
  only decides machine *behavior*.
- **ControllerModule** — the top of the matter ladder and the **scarcest thing in the economy.**
  You install one in a machine to make that machine *MOSS-scriptable*. Scriptability is a resource
  you pay for, not a menu you toggle.
- **Operator** — the named crew member bound to an automated line. The line is *theirs*; their
  state is the line's throughput.

---

## The opening vignette

You tore down the gym.

Nobody uses it — you needed the metal more than the treadmills. Stripping the walls gave you a
pile of Regolith (the ship's raw build-stock), which you fed up the ladder: melted to Scrap,
machined into Parts, and finally, spending three days of a specialist's hands, one gleaming
**ControllerModule**. You installed it in the fabricator on Deck 3. That made the fabricator
*scriptable*, so you sat down at the amber terminal and wrote a short MOSS rule: run the recycler
only when the Scrap buffer is low, and never while a builder is waiting on Regolith.

Now that line runs itself. Sort of.

Because the line is **Amara's**. She's the operator — the one who loads the feedstock and clears
the jams — and today Amara is grieving. Reyes died on the aft deck last week, and she held the
funeral in the mess hall two doors down. So today the fabricator's output is *down*, and there was
a spilled batch that wasted scarce matter, and it is not a bug and it is not bad luck. It is
because of *her*, and you know exactly why, because you were there.

That is the game. The factory and the people are one system. You cannot tune the output without
tending the person, and you cannot ignore the person because the balance sheet won't let you.

---

## The core loop you'll live in

Here is the automation player's day, from "I do everything by hand" to "my ship largely runs
itself, and I tune it":

**1. Extract matter.** The ship is a closed box — *every gram aboard came through an airlock*.
There is no ore patch spawning forever. Your matter comes from **taking things apart**: strip a
wall for its metal, deconstruct a device you no longer need, later harvest ice off a comet or
gut a derelict. This is the game's signature verb. RimWorld asks *what will you build?* — this game
asks *what will you take apart, and what does it cost to keep what you already have?*

**2. Refine up the ladder.** Raw matter climbs a short, legible chain:

```
   Regolith  →  Scrap  →  Parts  →  ControllerModule
   (raw          (melted    (the        (the scarce
    build-        feed)      repair      automation
    stock)                   currency)   currency)
```

Every hop is **meant to lose a little** — by design the chain should return less than it took (a
closed box can't have a free multiplier). *(That conversion loss is design intent, planned for
E0-6; today's recipes aren't lossy yet — see the honest box.)* Parts keep your machines alive;
ControllerModule is the rare prize at the top.

**3. Spend the scarce rung to buy scriptability.** A machine is a dumb appliance until you install
a ControllerModule in it. Then, and only then, MOSS can address it. So *automating a machine costs
you the very thing you were building the chain to make.* That's a real decision — the same
"do I spend this on expansion, or bank it?" fork Factorio players know, rendered in this game's
currency.

**4. Write MOSS to control the machine.** Now you author a policy — a few lines that decide when
the machine runs, how hard, and under what conditions — and watch it execute. This is the
Factorio-shaped fun (author a rule, watch it run, tune it) with **no belts involved.**

**5. Repeat, deeper.** Each machine you bring under script frees you from babysitting it, and every
ControllerModule you spend is one you didn't bank. Over a long game your ship goes from *you doing
everything by hand* to *a nervous system you wrote, humming along, that you tune when something
drifts.*

The "just one more" itch is here — but it's *"just one more device under script, just one more deck
reclaimed,"* and every addition costs upkeep forever, so it never saturates into a free megabase.

---

## What actually makes MOSS scripting feel good

MOSS ("Malapert Operations Script Shell") is a small, readable language. It's designed so a
non-programmer can read a script aloud and understand it, and so it can never hang the game (there
are no user loops — a timer called `every` is the only repetition). Here's a **real** script,
straight from the spec — a life-support controller someone left on a terminal:

```
# LSS controller, Hab-3
every 5s:
  if hab3.o2 < 19.5%: open(valve_o2_hab3)
  if hab3.o2 > 21.5%: close(valve_o2_hab3)

when hab3.co2 > 5000ppm:
  alarm("CO2 HIGH HAB-3")
  set(scrubber_hab3.rate, max)
```

Read it top to bottom: every five seconds, top up the oxygen if the room's O₂ drops below 19.5%,
close the valve once it's back above 21.5%; and the *first* moment CO₂ crosses 5000 ppm, sound an
alarm and slam the scrubber to full. Real units, real thresholds, edge-triggered so the alarm fires
once instead of screaming every tick.

The interface for this is **already built and shipping**: the MOSS terminal is a full-screen amber
CRT — a Fallout-style phosphor ledger that reports every ship system on one screen (LIFE SUPPORT,
REACTOR, THERMAL, FABRICATION…), a fault log, an in-terminal code editor with diagnostics and an
Install button, and a live `>` command prompt you can type device commands into right now. And it
holds itself to a brutal honesty rule: **every gauge is derived from live sim state, or it isn't on
the screen.** A system whose hardware doesn't exist reads `OFFLINE` with a stated reason — never a
plausible-looking fake number. When your automation is lying to you, you find out.

The intended depth ceiling (planned) is that MOSS reads the *production ledger* too — buffer
levels, whether builders are starved — so you can write policies a belt never could. An
illustrative example of that future style (the `stock.*` bindings here are **planned, not yet
shipped**):

```
# ILLUSTRATIVE — the ledger bindings below are planned, not built today
every 10s:
  if scrap.buffer < 20 and not builders.waiting_regolith:
    set(recycler_1.enabled, true)
  else:
    set(recycler_1.enabled, false)
```

*"Run the recycler only when Scrap is low AND no builder is waiting on raw stock"* — that's a
control policy a Factorio belt can't express. Authoring that decision **is** the automation game.

---

## The twist that makes it *our* game: the operator model

This is the part no factory game has, and it's the whole point.

In Factorio, an assembler runs at a fixed rate forever and the crew are invisible. In *Every Soul
Aboard*, an automated line's **edge weights live in a person's head.** The line has a named
**operator**, and:

- a **skilled, happy** operator pushes the line *past* nominal — more output, near-zero defects;
- a **depressed, grieving, or drunk** operator is slow and causes *real* failures — a jam, a spill
  that wastes scarce matter, a defective Part that installs fine and then fails early and trips a
  crisis weeks later;
- two operators who **feud** can't run a line together at all.

And — this is a hard rule of the whole engine — **it's deterministic, never a dice roll.** "A drunk
pawn makes a mistake" is a *computed consequence of that person's mood and skill*, not a random
number. That's what makes it feel *earned* rather than unfair: bad output is always traceable back
to a specific person in a specific state, and you can go find out why.

So the two things you thought were separate games are actually one feedback loop:

- **mood + skill → efficiency** makes the crew's emotional life an *economic input*;
- **production outcome → drama** makes the factory a place where a person's state becomes *visible
  and consequential*.

Optimizing your production line and caring about your people stop being two competing demands on
your attention. They are the *same action*. When you ask *"which of my six crew should run the
high-value fabricator?"* you are simultaneously doing production optimization and casting a
character into a role in a story.

Two guardrails keep this from rotting into theatre:

- **The human's effect is material, not cosmetic.** A bad mood isn't a decorative −5%. It's a real
  jam, a real spilled batch of matter you can't get back. If it were cosmetic, the person would be
  decoration and you'd be back to faceless automation.
- **Mood is mostly emergent, not a bar you top up.** You don't fix a depressed operator with a spa.
  Their mood comes from the *situation* — who died, who's feuding, how scarce things are — so
  managing it means managing the ship's human predicament, not clicking comfort buttons. You deal
  with *why they're grieving*, or you live with the jammed line.

---

## Control, not conveyance — why there are no belts

The single design decision that separates this from every factory game: **you automate a machine's
*control*, never the *conveyance* of matter between machines.**

- **Control** = deciding *when, how hard, and under what conditions* a machine runs. That's MOSS.
  That's the automation game, and it's fully in-genre.
- **Conveyance** = moving matter from A to B. In Factorio that's belts and drones. Here, **it stays
  a human walking.** A named crew member picks up the Scrap and carries it to the bench.

Why keep hauling manual on purpose? Because hauling is one of the two biggest labour sinks in the
genre, and *walking crew are the animation of a living ship.* Automate the hauling and you delete
the people from the screen — which is the one thing this game exists not to do. Factorio's fantasy
is *your absence*: you build a system so it runs without you and walk away. This game's fantasy is
the opposite — the ship is full of people you can talk to, and they need to stay on screen.

The insight underneath: Factorio players *think* they enjoy the belts, but what they actually enjoy
is **authoring a control policy and watching it execute.** The belt is just the *syntax* of that
policy. MOSS is a better syntax for it — a real (bounded) language with conditionals and thresholds
— that happens to move zero matter. So you get the control-authoring fun without the crew-erasing
conveyance.

Concretely: **processing automation at a workbench = yes** (a machine an operator runs — it *adds*
a person's station, removes no haulers). **Belts that carry matter across the ship = deliberately
no** (one belt-tender would quietly replace three visible haulers). The automation game lives at
the bench, not on the conveyor.

---

## The scarcity throttle — one knob

Here's the elegant part. There's exactly **one dial** that governs how much of your ship you can
automate: the scarcity of **ControllerModule** (and the even-rarer **Circuits** that gate how many
ControllerModules can ever exist — Circuits aren't manufacturable early; you salvage or trade for
them).

Because you can *never afford to automate everything*, there's always work the machines couldn't
take, so the crew always matter, and *what to automate* stays a permanently scarce, interesting
choice rather than a checkbox you eventually tick for everything.

This is also how the design self-balances the tension between "automation-forward" and "keep the
people central." Turn the currency scarcer and automation dials *down*; make it less scarce and it
dials *up*. One knob tunes how much automation the "souls matter" side of the game can digest —
no elaborate balancing act, just: *how rare is the module?*

---

## What an automation session actually feels like

Hour to hour, these are the decisions you're making — and notice how many of them are *human*
decisions wearing an engineering hat:

- **The slightly shameful deconstruct.** *"Do I tear down the gym for its metal?"* (Stripping is
  lossy — a wall returns only about half its build-stock today; the 70% figure in the design docs is
  a target, not the shipped number.) The
  crew used that gym. Stripping it is a real, faintly guilty choice — mass yield against morale and
  the memory of a place. The first time reclaiming a deck makes the ship *worse* (more to power,
  more to maintain, more to leak) is the moment this economy has landed.

- **Install the module, or bank it?** Scripting Deck 3's recycler costs you the ControllerModule
  you'd otherwise have traded for scarce Circuits. Every automation you build is an automation you
  *didn't* build somewhere else.

- **Script the policy, or babysit it?** A scrubber scripted to idle below 1,200 ppm saves wear and
  power — but if your forecast is wrong, the aft crew breathe poison while the script sits there
  waiting for the threshold. Trusting your own automation through a crisis is a real gut-check.

- **Which soul on which line?** Your one specialist lifts the fabricator's yield *and* is the only
  person who can properly overhaul the reclaimer. Put her on the high-value line and script the
  low-value ones to run only when she's idle — that composition of *what runs when* (MOSS) with
  *who runs it* (the roster) is the strategic core.

- **You can break your own automation.** Strip a device that a script was reading, and the script
  silently dies — the machine un-registers from MOSS when you deconstruct it. Selling a valve can
  kill the rule that depended on it. Your automation has *stakes* a Factorio belt never carries,
  because these machines are keeping people alive.

The through-line: the interesting decisions are all about **policy-authoring and crisis-response**,
never about clicking "collect." The chores are automated away; the *decisions* never are.

---

## The voyage layer (planned) — where the extracted matter finally goes

Everything above has a known gap the design is honest about: right now, the top of the ladder
(ControllerModule) has **nothing to spend it on** beyond scriptability, so a ship eventually
converts its finite matter into a pile of modules and stops. The voyage layer is the planned answer
— and it's designed carefully so it never becomes an idle money-printer.

**Defensive tech is the terminal sink.** High-value extracted materials go into **shields and laser
weapons** — the consumer the matter ladder never had. This is what finally justifies the whole
*extract → refine → automate* chain: it gives the matter somewhere to *go*.

**Outposts you set up and leave.** You land crew on a comet or planetoid, set up a **skill-gated,
MOSS-controlled** extraction site, and voyage on — returning periodically. This is the *one* place
where "it runs without me" is the *intended* fantasy and doesn't cannibalize the people-pillar,
because you physically left, and the crew who matter are back on the ship, present and visible.
Offline production **accrues while you're away** (a simple return-time tally, not a simulated ghost
base). It's paid for in risk: the site depletes, degrades, or gets raided while unattended, and the
return trip costs fuel and time. There's always a reason to come back that *isn't* just a full
buffer — the site *changed*, a threat moved in, a deeper deposit opened up.

**Trading outposts that auto-sell — through a face.** Instead of flying back to collect, an outpost
can auto-liquidate its output at a trading hub *under a MOSS policy* — *"sell when the price is
above X, hold below Y, route to hub A over hub B."* This finally gives MOSS a worthy object. And
it's bounded so it never prints free money: **prices move against you** (flood a hub and its price
crashes), the hub **takes a cut and gates on your standing**, and the trip **costs**. A saturated
market earns pennies, so your MOSS policy has to be *clever*, not merely *on* — which is exactly the
automation game again. Crucially, **the hub is a person**: a resident quartermaster who negotiates,
remembers your last deal, and reports to you in their own voice (the game's LLM layer performs the
character; the sim adjudicates the actual trade). Even the auto-sell layer has a face. *Every soul
aboard* extends to the souls you trade with. **The auto-sell economy funds the human story — it
must never be the story.**

---

## Why it isn't Factorio, and why it isn't the Sims

The design steers deliberately between two failure modes:

```
FACTORIO ───────────────── THIS GAME ───────────────── THE SIMS
soulless optimization      autonomous people           stakeless soap opera
crew invisible,            under real pressure          people with no economic
the fantasy is             (souls & automation          stakes; you're a
your absence               are one system)              spectator of comfort meters
```

- **Not Factorio.** Factorio's crew are invisible and the win condition is throughput-per-minute
  with the player eliminated. Here the crew are the *point*, hauling stays human so they stay on
  screen, and the economy is a *closed, contracting* box — you tear down to get matter, upkeep is a
  *rising tax* on everything you keep alive, and there is no infinite ore patch. A game built to
  reward your absence and a game built to make you care about eight specific people point in
  opposite directions; this one commits to the second. (The design corpus literally uses the word
  "Factorio" as the *name* of the failure mode to avoid.)

- **Not the Sims.** The Sims gives you people with rich inner lives but *no binding scarcity and no
  failure state* — you manage comfort bars and watch a soap opera. Here, mood is an *economic input*
  with material consequences, scarcity forces real decisions, losing the ship is the only game over,
  and you manage the *situation* (RimWorld-style mood from what actually happened) rather than each
  person's bladder. Autonomy serves *drama*, and scarcity forces *choices*.

The target is RimWorld's tense middle: *"the Sims meets a survival strategy game,"* where the
automation you build and the souls who run it are the same feedback loop, not two games competing
for your attention.

---

## Honest box: built today vs. planned

The codebase culture is honesty-first, so here's the straight story. Do not read the planned items
as playable today.

**Built and shipping now:**

- **The MOSS language and the MOSS terminal** — the full phosphor-ledger CRT: whole-ship status,
  fault log, an in-terminal code editor with diagnostics + Install, and a live command prompt that
  reads and commands real devices. This is the automation *interface*, and it's done.
- **The matter ladder exists in data** — Regolith → Scrap → Parts → ControllerModule is a real
  crafting chain today.
- **Deconstruct / strip is a first-class verb** — you can tear down walls (→ Regolith) and devices
  (→ Parts scaled by their condition) to reclaim matter, right now.
- **The player verbs on the web client** — dig, stockpile, strip — landed.
- **Machines auto-run and self-recruit** — a powered bench already runs its recipe and pulls a
  worker; the hauling to and from it is a real crew member walking.

**Designed, but NOT yet built (this doc's "the intended experience," not a shipped fact):**

- **The operator model** — mood + skill setting a line's throughput and defect rate. This is the
  centerpiece of the whole pitch, and it is *design*, not code. Skills aren't hashed crew state yet;
  mood isn't wired into production. (Roadmap: E2.)
- **ControllerModule's real cost as an automation gate** — today ControllerModule has *no consumer*
  and the economy runs down within about a sim-day. Making scriptability actually cost the module,
  with conversion loss up the ladder, is planned (E0-6).
- **The production-graph ledger** — the honest at-a-glance screen for buffers, rates, and
  bottlenecks (the no-scripting, mass-audience entry to the automation game). Planned (E0-8). Today
  some ship metrics still lie (food reads "fine" while food production is dead); the ledger's job is
  to stop that before anything is tuned against it.
- **The voyage layer** — outposts, accrual-on-return, auto-sell trading hubs with a quartermaster
  persona, and the nav/sensor systems behind them. Designed with seams reserved (E3); largely
  unbuilt.
- **Defensive tech (shields, lasers) as the terminal matter sink.** Designed as the answer to
  "where does the matter go"; not built (E3/E4).

The one honest caveat to sit with: this fusion makes the automation pillar most fully an
**engineer's** pillar (MOSS is a language, not a wordless belt). The plan for the rest of the
audience is to lead with the *visual* ledger-and-bottleneck loop — diagnose the chain, fix the
ratio, no scripting required — and let MOSS scripting be the depth ceiling for those who want it.
