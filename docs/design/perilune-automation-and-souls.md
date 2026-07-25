# Automation & Souls — the design principle for every economic/automation feature

**Status:** DESIGN AUTHORITY (director decision, Garvin, 2026-07-24). Binds every upcoming economic,
automation, production, trade, and away-mission feature (E0-6 onward, and all DLC). Nothing built by
this doc — it is the lens through which the E-lanes are designed. Supersedes the *conclusion* (not the
measurement) of `ECONOMY.md` §8's "no belts" note; see §8 there for the pointer back here.

> **The one line:** *Automation exists to free a scarce person to do the one thing that can never be
> automated — be a person. The factory runs so the humans matter more.*

---

## 0. Why this doc exists

Over 2026-07-24 the director explored fusing Factorio-style automation into *Every Soul Aboard*. Two
independent evaluations (an advocate steelman and a red-team; archived beside this doc) plus the design
conversation converged on a coherent position. This doc is that position, written as principles so
every later feature can be checked against it. **Every upcoming work package that touches production,
automation, trade, skills, or mood MUST be designed against §3's three-clause test and §4's operator
model.**

## 1. The two failure modes, and the target between them

Automation lives on a spectrum with a failure mode at each end:

```
FACTORIO ───────────────── TARGET ───────────────── THE SIMS
soulless optimization    autonomous people        stakeless soap opera
crew invisible,          under existential         ambient, player a
player absent            pressure                  spectator
```

- **Factorio failure (pull left):** optimization-porn; belts move matter so humans don't; crew go
  invisible; the fantasy is *your absence*. This is what `ECONOMY.md` §8 measured and feared.
- **Sims failure (pull right):** autonomous characters with rich inner lives but **no binding
  scarcity and no failure state**; the player watches a comfortable soap opera and manages comfort
  meters. Removing *decisions* (not chores) is what causes this drift.

The target is RimWorld's tense middle — *"The Sims meets a survival strategy game"* — where autonomy
serves **drama** and scarcity forces **decisions**. The director's stated lean: **automation-forward,
but only as much as the "souls matter" pillar can digest.** §3 and §4 are how we honour that lean
without sliding to either failure mode.

## 2. What automation is here — control, not conveyance

Factorio conflates two things its players actually enjoy separately: **conveyance** (moving matter A→B)
and **control** (deciding when/how hard a machine runs). The belt is just the *syntax* of a control
policy. *Every Soul Aboard* already owns a control language that moves zero matter: **MOSS** (pillar 4),
which scripts device duty cycles from live sim state.

- **Conveyance stays crew labour.** Hauling is one of the two largest labour sinks in the genre and it
  is what keeps crew visible on screen. We do **not** automate transport across the ship. (`ECONOMY.md`
  §8's measured decision, preserved.)
- **Control is the automation game.** MOSS scripting a device — "run the scrubber when CO₂ > X, hold
  the melter when the tank is low" — is the Factorio-shaped fun, in-genre and already shipped as a
  terminal. E0-6 gives `ControllerModule` its one consumer: *gating MOSS scriptability*. That is the
  automation currency (§3.3).

The production **graph** is the other thing worth stealing from Factorio — its legibility, the
"diagnose the bottleneck, fix the ratio" loop. That is a **screen** on an existing substrate
(`ProductionDefs`' `[production]` node table), delivered by E0-8's ledger. Steal the graph legibility;
never the belts.

## 3. The three-clause test — apply to every automation feature

Before shipping any automation, it must pass all three:

1. **It removes a chore, never a decision.** Re-issuing the same order, micro-routing a hauler,
   clicking "collect" — remove these. Food that never runs out, auto-trade that always wins, a threat
   that never forces a tradeoff — these *remove decisions* and are the Sims/idle poison. If the feature
   nets out to "the player has less to decide," pull it back.
2. **It carries a specific soul's fingerprint** (see §4). Anonymous automation ("the machine just
   does it") erodes the pillar. Automation whose quality, brain, and failure mode belong to a *named
   crew member* deepens it.
3. **It is gated behind the scarcest currency** (`ControllerModule`/`Circuits`). Because you can never
   afford to automate everything, humans always have work the machines couldn't take, and *what to
   automate* stays a permanently scarce, interesting decision. **This is the self-balancing throttle
   for "as much as souls-matter can digest": one knob** — make the currency scarcer to turn automation
   down, less scarce to turn it up.

## 4. The operator model — how souls and automation become ONE game

**The centerpiece.** Automation is not a machine that replaces a person; it is a machine **operated by
a person**, whose state modulates its output. This is what dissolves the belt/souls tension: an
automated line that *requires* an operator — loading feedstock, clearing jams, tending the process —
does not delete the crew member from the screen; it gives them a **station**. It satisfies the *spirit*
of `ECONOMY.md` §8 (keep crew visible and mattering) even where the letter said "no."

**Mood + skill are the throughput.** The bound operator's competence and mental state set the line's
yield and defect rate:
- a **skilled, happy** operator pushes the line past nominal;
- a **depressed, grieving, or drunk** operator is slow and causes real failures — a jam, a spill that
  wastes scarce matter, spoilage, a defect that trips the wear/overhaul path;
- two operators who **feud** can't run a line together.

**This makes the two games one feedback loop, not two parallel ones:**
- **mood/skill → efficiency** makes the crew's emotional life an *economic input*;
- **production outcome → drama** makes the factory a place where a person's state becomes *visible and
  consequential*.

The LLM-persona/relationship pillar stops being *beside* the economy and becomes *wired into* it. That
coupling is the harmonization: souls and automation no longer compete for player attention because they
are the same system.

### 4.1 Two guardrails so the operator model doesn't rot

- **The operator's effect must be MATERIAL, not cosmetic.** If a bad mood is a decorative −5%, the
  person is decoration and you are back to faceless automation. Real jams, real spoilage, a real spill
  of scarce matter. The *magnitude* of the human's effect is what decides whether this harmonizes or is
  theatre.
- **Mood must be mostly EMERGENT, not a meter you top up.** The Sims trap is "keep everyone's happiness
  bar full." Mood comes from the *situation* — scarcity, loss, who died, who's feuding — so managing it
  means managing the ship's human predicament, not clicking comfort buttons. You never "fix" a
  depressed pawn with a spa; you deal with *why*, or you live with the jammed line. Keep needs
  abstracted to **mood**, RimWorld-style, never Sims-style micro-needs (bladder/hygiene) — that keeps
  the player managing the *colony*, not each *person's comfort*.

### 4.2 Determinism (non-negotiable, pillar 1)

"A drunk pawn makes a mistake" must be a **deterministic function of hashed mood/skill state**, never a
runtime RNG dice roll. A mistake is a *computed consequence*, not luck — which also makes it feel
*earned*. Mood becomes hashed `Citizen` state (E2's home); yield/defect a pure function of skill ×
mood × held `Procedure`.

### 4.3 Processing automation (yes) vs transport belts (cautious)

The operator model works *cleanly* for **processing automation at a station** — a machine line an
operator runs: it *adds* a soul-surface and removes no haulers. It is *weaker* for **transport belts
across the ship** — even with an operator, one belt-tender can replace three visible haulers, quietly
losing crew-on-screen. So:
- **Yes:** production/processing lines with a human operator whose mood + skill set throughput/defects.
- **Cautious:** cross-ship conveyance that displaces haulers — adopt only where the operator role is
  genuinely as rich as the hauling it replaces (it usually isn't). Keep hauling as crew labour; put the
  automation game at the **workbench**.

## 5. The purpose of the extracted matter — defensive tech (closes the dead-end)

The shipped economy's fatal flaw: all matter converts up into `ControllerModule`, which **nothing
consumes** (A6 dead item; the economy terminates at sim-hour 28). The automation/extraction chain needs
a **terminal sink**, and the director's answer is **defensive technology** — shields, laser weapons —
built from high-value extracted materials. This retroactively justifies the entire
extract → convert → automate chain being built now: it finally has somewhere to *go*.

## 6. The voyage layer — outposts, and trade with a face

Two extraction/logistics patterns, both bounded so they never become idle faucets:

### 6.1 Planetary/comet outposts — absence is the *intended* fantasy
The player lands crew, sets up **skill-gated, MOSS-controlled** extraction, and voyages on, returning
periodically. This is the *one* context where "it runs without me" does **not** cannibalise the
people-pillar — because you physically left, and the crew who matter are back on the ship, present and
visible. It is the RimWorld-caravan / build-leave-return loop the genre already proves beloved.
- **Offline production = accrual-on-return**, not tick-simulation of an unattended base (cheap and
  deterministic-friendly).
- **Bound the sprawl:** few outposts, each gated by scarce `ControllerModule`; return trips cost fuel
  and time; the site depletes/degrades/gets raided while unattended. Autonomy is *paid for* in risk.
- A reason to return that **isn't just a full buffer** (the site changed; a threat moved in; a deeper
  deposit) — else it is idle-game collection tedium.

### 6.2 Trading outposts — auto-sell via a hub, controlled by MOSS
Instead of flying back to collect, an outpost can **auto-liquidate** via a trading hub under a MOSS
policy ("sell when price > X, hold when < Y, route to hub A over B"). This is E3's trading-hub DLC seam
(`ECONOMY-PLAN` §E3) and it finally gives MOSS a *worthy object*.
- **The risk it introduces is the idle money-printer.** Auto-sell decouples value-extracted from
  player-attention — the definition of an idle layer. It is only safe as a *bounded* faucet:
  **prices move against you** (flooding a hub crashes its price — E3's deterministic price formation +
  faction scarcity), **standing gates access and the hub takes a cut**, and **the trip costs** (fuel,
  time, the site unattended). A saturated market earns pennies, so the MOSS policy must be *clever*,
  not merely *on* — that is the automation game.
- **Trade through a person, not a menu.** The hub is a **resident quartermaster persona** (E3's
  non-crew personas resident at a site) who negotiates, remembers your last deal, and reports via the
  LLM (*proposing, never adjudicating* — the sim resolves the `ISimCommand`). Even the auto-sell layer
  has a face; "every soul aboard" extends to the sites you trade with. This is what stops the hub from
  becoming optimization-porn.
- **Both collection modes coexist as a spectrum:** auto-sell for *fungible commodities* (low attention,
  price-bounded); physical return-and-collect for *high-value, bulky, or contraband* goods (the
  shield/laser materials — tangible, deliberate, crew-present). **The rule:** the more autonomous the
  outpost, the less reason to be there — so autonomy is paid for in scarcity and risk, and the
  interesting decisions move to *policy-authoring* and *crisis-response*, never to collection. **The
  auto-sell economy funds the human story; it must never BE the story.**

## 7. How each roadmap phase must account for these principles

| phase | what it must carry from this doc |
|---|---|
| **E0-6** (`ControllerModule` → MOSS scriptability gating; conversion loss) | This is the automation **currency** (§3.3) and the self-balancing throttle. Design the gating so *what to automate* is a scarce decision, not a checkbox. |
| **E0-8** (the ledger) | The production-**graph legibility** screen (§2) — the visual, no-scripting entry point to the automation game. Lead with this as the mass-audience hook; MOSS is the depth ceiling. |
| **E2** (skills; yield/defect by skill; `Circuits` gate) | Add **mood** as the *second* yield/defect modulator beside skill (§4). Mood becomes hashed `Citizen` state; yield/defect a deterministic function of skill × mood × `Procedure`. This is where the operator model becomes real. |
| **E3** (nav, mining, salvage, trade, DLC seams) | The outpost + trading-hub loops (§6). Persist per-site state; the quartermaster persona; deterministic price formation; LLM-proposes-never-adjudicates. Design the away-mission crew-transfer contract to support non-crew resident personas. |
| **E4** (Appraisal → threat; the Director) | The **Director forcing periodic irreversible choices** is what keeps autonomy from becoming ambient (anti-Sims). Upkeep stays a **rate, not a threshold** — never import Factorio's infinite-scaling saturation. |

## 8. Anti-goals (explicit)

- **No infinite scaling / megabase.** Upkeep is a rate, not a threshold (E4). Factorio's saturation is
  the failure mode the roadmap is built to avoid.
- **No crew invisibility.** Conveyance stays crew labour; automation stations people, never erases them.
- **No Sims micro-needs.** Mood, not bladder/hygiene meters. Manage the situation, not comfort bars.
- **No faceless trade.** Hubs have a persona; the LLM proposes, the sim adjudicates.
- **No cosmetic operators.** The human's effect on a line is material or the feature is theatre.
- **No idle money-printer.** Auto-sell is a bounded faucet behind moving prices, standing, and risk.

## 9. Open questions / to tune later

- The magnitude curve for mood → throughput/defect: enough to matter, not so swingy the economy is
  frustratingly unpredictable. Catastrophic failures should be rare-but-memorable, not constant.
- The exact scarcity level of `ControllerModule`/`Circuits` — the one knob for the automation dial.
- Whether any *transport* automation ever earns its keep under the operator model (§4.3) — default no.
- Accrual-on-return fidelity for outposts (how much the unattended base "remembers").

---

*Archived alongside this doc: `factorio-fusion-evaluation-advocate.md` (steelman) and the skeptic
red-team, the two independent evaluations that fed these principles.*
