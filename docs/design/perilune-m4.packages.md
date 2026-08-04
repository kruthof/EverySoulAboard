# M4 — THE PERSON: the buildable packages

*Written **2026-08-04**, at M3-close, per `docs/ROADMAP.md` §4's own instruction — "charters get
written at end of M3, not before". This file is to M4 what `docs/design/perilune-m3.packages.md` is
to M3 and what `docs/design/perilune-roadmap-q3.packages.md` §5 is to M2: the seams, the pin impacts,
the mutation tables, the conflict matrix. **`docs/ROADMAP.md` stays the status authority; this file
is never the status of anything.***

> ### ⛔ THE LANE-SELECTION GATE (`docs/PROCESS.md` §2, owner-directed 2026-08-04) — ANSWERED FIRST
>
> 1. **Which `TARGET.md` §3 row / `ROADMAP.md` gate, or which VERBATIM owner sentence?**
>    **OD-R**, `ROADMAP.md` §5 row R, owner-direct 2026-08-04 and **amended the same day**:
>    *"it should be more than a tone — an important part of gameplay"*, whose binds cell names this
>    document by function — *"**M4-1 and M5-1 charters (written at M4 open, this row sets their
>    TWoM-gameplay section)**"*. Reinforced by `HANDOVER.md` "Next" item 2 (*"M4 opens after the
>    gate — M4-1 Persona design first"*) and by **M4-1 being the topmost unmerged row of the M4
>    outline** (`ROADMAP.md:95-97`).
> 2. **The player sentence — or, for an INFRASTRUCTURE lane, the row/gate it unblocks BY ID.**
>    ⛔ **No player sentence, deliberately** (see §5 M4-1). It unblocks, by id: **T16** (Persona
>    window — `TARGET.md:97`, *"queued (M4-1/M4-2)"*) via **M4-2**; **T12's remaining half** (*"mood
>    still gates no crew behaviour directly"* — `TARGET.md:93`) via the break design; **T14** (health
>    capacity gating — `TARGET.md:95`, *"M4-4 decides real-or-delete"*) via M4-4's owner item; and the
>    M4 exit gate's `◇ SAMPLE` clause via **M4-3**.
> 3. **Would the next milestone's human gate notice?** **Yes — M4's human gate IS the Persona
>    window.** `ROADMAP.md:25`: *"One click → one Persona window: who she is, what she's doing, why,
>    how she is — no `◇ SAMPLE` anywhere; Chronicle reachable."* There is no version of that gate
>    that is met without this document being written first.

**INPUTS, in order of authority.**

1. **OD-R** (`ROADMAP.md` §5 row R, binding, 2026-08-04, **amended same day**) — This War of Mine is
   a **GAMEPLAY PILLAR**, scoped by three clauses: **(i)** triage is **EMERGENT from real scarcity**
   (never scripted, never dice; scarcity TUNING becomes chartered M4/M5 work); **(ii)** **DETERMINISTIC
   MENTAL BREAKS** — psychological state gates BEHAVIOUR (refuse dangerous orders · stop working ·
   withdraw) via thresholds over hashed mood/memory state, T12's missing half, RW§4's mechanism worn
   with TWoM's tone; **(iii)** it **lands inside M4 + M5** — this charter grows a TWoM-gameplay
   section, M5-1's ending carries the payoff, **no new milestone, queue order stands**. ⛔ **Scope
   clause: nothing is implementable before this charter.**
2. **OD-Q** (2026-08-04) — item **(iii)**: *"SHELF/RUG keep the honest refusal until M4-6 … wire-or-
   remove decided **AT** M4-6, not before."* ⇒ **M4-6's charter below does not pre-empt that call and
   this document does not ask it.** Items (i)/(ii) bind nothing here.
3. **OD-M · OD-N · OD-P · OD-K · OD-H · OD-J · OD-A** — the standing ledger. OD-P's *"no charter may
   press a letter hotkey — type the command"* binds any acceptance script that touches MOSS; OD-H
   (work boots OFF) is the reason every pin-neutrality argument in §2 has a vacuity clause.
4. **`docs/design/rimworld-reference.md`** — the mechanism authority. **The sections M4 actually
   rests on: §4 (the break ladder — `:953-1116`), §6.1 (capability gating — `:1346-1418`), §8.6 (the
   mood collision — `:1811-1844`), §8.8 (the LLM boundary — `:1868-1885`), §8.9 (the determinism tax
   — `:1887-1899`), §1.6 (incapable vs disabled).** ⚠️ §4 opens by declaring itself shallow
   (`:955-956`: *"what a lane would need to decide whether to build one, not to build it"*) — **this
   charter EXTENDS it and says where.**
5. **`docs/design/perilune-console-retirement.plan.md` §1.5.4 (`:220-235`) and §1.5.5 (`:237-262`)** —
   the seam, the five deliberately-open items, and the "LLM ready" keep-list plus its **vocabulary
   discipline**.
6. **`docs/design/perilune-character-simulation.plan.md`** — the marks/opinions/axes architecture
   (§1, `:241-268`), what marks DO (§3.4, `:404-431`), the surface contract (§8, `:685-719`), and
   **§12's five open owner decisions** (`:891-923`).
7. `docs/MECHANICS.md` §13.4, §13.5, §13.7, §13.9, §13.37–§13.40, §13.43–§13.45 · `docs/TARGET.md`
   §1.3, §2, rows T12/T14/T16 · `docs/PROCESS.md` §2–§3 · `docs/design/perilune-m3.packages.md` §6
   (what M3 deliberately left for M4).

**HOUSE FORMAT.** Every charter below carries CLASS · PLAYER SENTENCE (`TODAY THE PLAYER…/AFTER
THIS…`) or an explicit INFRASTRUCTURE marker · LANE · SIZE · SEAM with `file:line` · PIN IMPACT ·
SPINE? · MUTATIONS table · ACCEPTANCE · CONFLICTS. The two standing requirements —
**(A) pin-neutrality is PROVED by `git diff -- tests/Perilune.Tests/Golden/ ci.sh content/` = 0
lines**, and **(B) a source-text guard uses the shipped stripper plus a negative control carrying a
later real comment** — apply to every package here and are not restated per charter
(`…q3.packages.md` §1, `…m3.packages.md` preamble).

**VOCABULARY DISCIPLINE — binding on every charter, commit message, test name and UI string this
milestone produces** (`console-retirement.plan.md:260-262`, verbatim): *"**'LLM ready', 'opt-in
integration', 'character simulation'. Never 'LLM-powered', never 'talk to your crew' as a shipped
promise.**"* The Persona window is a **standard-surface artifact reachable from the Overview** (the
MOSS-takeover precedent, `…m3.packages.md:2705`) — **not terminal-styled, not a MOSS noun** unless a
later row charters one (OD-P reserves nouns).

⚠️ **EVERY `file:line` IN THIS FILE WAS READ ON `lane/m4-1-persona-design` @ `2e4ce40`** (the merge
of `lane/twom-gameplay-pillar`, i.e. `main` at M3-close). §13 states which claims were read on this
tree, which were driven, and which were inherited. ⛔ **Re-verify before building on one.** The July
M4 sketch in `…q3.packages.md` §7 (`:3691-3710`) is **known-stale in at least four places and §12
lists them** — most sharply, **`openPersonaForSelected` does not exist anywhere in the tree**; the
shipped seam is `Hud.openBioForSelected` (`client/src/ui/hud.js:199`) reached from
`client/src/ui/overview-view.js:1658`. **A count you did not measure yourself is not evidence, even
from this file.**

---

## 1. THE MILESTONE, AND WHAT CLOSES IT

> *"I can click anyone aboard and get one window that tells me who she is, what she's doing, why, and
> how she is — and every number in it is true."*

**The exit gate (`ROADMAP.md:25`, verbatim):** *"One click → one Persona window: who she is, what
she's doing, why, how she is — **no `◇ SAMPLE` anywhere**; Chronicle reachable."*

**The four clauses, and which package owns each — because three of the four are already half-answered
somewhere else on the surface and the gate is about consolidating them, not inventing them:**

| clause | where it is answered TODAY | who owns it in M4 |
|---|---|---|
| **who she is** | Overview readout name + role + trait chips (`overview-view.js:1227-1237`); the dossier's identity band (`panels.js:325-334`, REAL) | **M4-2** (the window) + **M4-3** (stop lying) |
| **what she's doing** | `GameSession.TaskLabel` — a rich sentence with verb + object + tile + `· NO AIR` + M2-6's ranking clause (`hosts/web/GameSession.cs:4399-4501`), drawn WHOLE in the Overview readout (`overview-view.js:1238-1246`) and TRUNCATED in both docks | **M4-2** — the window is the surface where the whole sentence always fits |
| **why** | the same label's ranking clause, plus the `blocked` channel's ORDER STUCK line (`overview-view.js:1247-1252`) | **M4-2**; ⭐ and this is where `ROADMAP.md:55`'s filing lands (*"Room Zoom has NO readout at all → clause unreachable there, filed to M4 Persona"*) |
| **how she is** | ⛔ **NOWHERE, HONESTLY.** `Citizen.Mood` reaches no client at all; the roster's `mood` is a STRING that is empty on any run without a conversation; `morale` is a measured constant 1.00 | **M4-2 + the break design** — see §5 M4-1's ⭐ TWoM section and DESIGN QUESTION (e) |

**The human gate.** M4's gate is the window itself, opened in `./play.sh` on `--ship wreck` against a
crew of at least two (Rell + one thawed sleeper), because **the milestone's whole claim is that two
people read differently** — M3-8 authored the spread and M3-12 drew it, and the Persona window is
where the spread becomes a person rather than a row.

> ### ⛔ ⭐ THE PLAYTEST CLAUSE — THIS CHARTER IS WRITTEN **BEFORE** THE 60-MINUTE OWNER PLAYTEST, BY OWNER DIRECTION, AND ITS FINDINGS AMEND IT
>
> **The M3 human gate is the 60-minute owner playtest on 2026-08-07** (`…m3.packages.md:243-247`;
> named when M3-1 merged). `HANDOVER.md`'s "Next" puts M4-1 immediately after it *and* directs that
> the charter be written now. Both are true and the resolution is stated rather than discovered:
>
> ⇒ **This document is a PRE-PLAYTEST charter. Its findings AMEND it before M4-2 implements, and the
> amendment is an edit to this file (dated, in place), never a new document.** M3's own file was
> amended in place four times and that is the precedent.
>
> **The sections most exposed to revision, named now so a reader can tell an amendment from a
> mistake:**
>
> | section | why it is exposed |
> |---|---|
> | **§5 M4-1 DESIGN QUESTION (a) — the window's LAYOUT** | a playtest is the only instrument that can say whether five bands in one scroll is one window or five. **The highest-variance item in the file.** |
> | **§5 M4-1's ⭐ TWoM section — the break TIERS' default thresholds** | the thresholds must be measured against a **re-driven post-M3-9 mood envelope** (§5 M4-1, MUST RE-MEASURE). If the playtest says the ship is already too punishing, the tuning moves before the mechanism does. |
> | **§5 M4-5 — the onboarding rewrite** | the playtest IS the first-hour instrument. A rewrite chartered against a guess and contradicted by an hour of watching is wasted; **M4-5's content is deliberately under-specified here for that reason.** |
> | **§10 item 1 — where the first break BUILDS** | if the playtest says the loop is not yet fun, `…m3.packages.md:243-247`'s own warning applies — *"M4 and M5 are the budget that pays for fixing it"* — and a new package is the first thing to lose. |
> | **§8 — the five-minute demo** | its decisive step assumes a thawed sleeper, which assumes the thaw curve survives the playtest unchanged. |
>
> ⚠️ **What the playtest CANNOT amend:** OD-R's scope clause, the `CREW_INTERACTION` one-door rule
> (`CLAUDE.md:84-85`), the standard-surface invariant, and TARGET §2's anti-goals. Those are decided;
> a playtest finding against one of them is an owner-decision request, not an amendment.

---

## 2. THE PIN CHAIN

**Rule unchanged** (`…q3.packages.md` §2, `…m3.packages.md` §2): **one standing deep lane owns the
whole table, no two rows run concurrently**, each row gets its own re-pin commit touching `ci.sh` +
`CLAUDE.md` + `MECHANICS.md` + `HANDOVER.md` + memory together, plus a `pin/<row>` tag.
⚠️ **TWO PIN ROWS IN FLIGHT AT ONCE IS THE FAILURE THE CHAIN EXISTS FOR** (`ROADMAP.md` §8 risk 3).
`git tag pin/*` before starting any row below.

**The five pins as `CLAUDE.md` states them today** — ⚠️ **read from the doc, not driven by this lane;
RE-MEASURE BEFORE QUOTING**: P1 `7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52` · P3 `43a1a5c25713faec` ·
P4 `661fcdd4b89f1e87` · P5 `558a1c0a4985f5ea`. Last mover **M3-9** (`pin/m3-c`, 2026-08-02).

### The chain, in the order it should execute

| # | lane | package | expected to move | why | rollback point |
|---|---|---|---|---|---|
| **M4-a** | `lane/m4-4-health` | **M4-4** | ⛔ **DEPENDS ENTIRELY ON §10 ITEM 2, AND EVERY NON-TRIVIAL ANSWER MOVES PINS.** Under (A) real: **P1 P2 P3** (a written `Citizen.Health` changes hashed state on every ship from tick 1) **+ P4 P5** if the floor lands as a def scalar. Under (B) delete: **P1 P2 P3** — ⭐ **removing** a hashed field moves the fold exactly as adding one does, plus a CITZ v9→v10 branch. Under (C) keep-and-retire-the-display: **NONE.** | `Citizen.Health` (`:32`), `Morale` (`:35`) and `Archetype` (`:38`) are all folded today. ⭐ **The charter's own finding: there is NO zero-pin option that changes anything, and §10 item 2 must be answered knowing that.** | ⭐ **tag `pin/m4-a`**, all five values recorded in the tag's own commit |
| **M4-b** | `lane/breaks` | ⭐ **the first break** (§10 item 1 decides its id — M4-9, inside M4-4, or M5) | ⛔ **P1 P2 P3**, and **P4 P5 too** unless every scalar is a literal | **A new hashed per-citizen field is unavoidable**: the dwell counter is the deterministic replacement for RimWorld's stochastic mean-time-to-break (§5 M4-1's ⭐ TWoM section) and it must survive a save, so it folds. RW§8.9 (`:1887-1899`) prices this exactly: *"the ritual for one new hashed field is a single commit carrying default + parser key + save version branch + checksum fold + round-trip test + a re-measured pin"*. ⚠️ **P4/P5 hold only if the tier thresholds ship as LITERALS** — M2-1's rule-not-tunable precedent, which M3-7 and M3-2 both used. **The charter RECOMMENDS literals** (a break threshold is a rule, not a dial) and says so in §5. | ⭐ **tag `pin/m4-b`** |
| **M4-c** | `lane/social-ignition` | ⭐ **only if §10 item 4 = yes** | **P1 P2 P3** | Seeding SOCL bonds at thaw writes **hashed sim state from inside `CryoSystem`** — M3-8's competence half is the precedent and the reason the persona half was deliberately kept host-side (`MECHANICS.md:5786-5793`). ⛔ **If item 4 is refused this row does not exist.** | ⭐ **tag `pin/m4-c`** |

### ⭐ EXPECTED PIN-NEUTRAL, AND WHY EACH ONE IS NEUTRAL FOR A DIFFERENT REASON

| package | why neutral | what would break the neutrality |
|---|---|---|
| **M4-1** | writes no code | nothing |
| **M4-2** | client-only; the window reads channels that already ship (`roster`, `citizen`, `workcaps`, `relations`, `blocked`) | a new WIRE channel is still pin-neutral (hosts are outside the fold) — but a **sim** read it needs and does not have is not |
| **M4-3** | the fabricated sections are replaced from **host-owned, unhashed** state (`PersonaSheet`, `CitizenMind`) — `sim/Sim.Core/Citizens/PersonaSheet.cs` is not in any save chapter | authoring Rell a SKILL SPREAD would be hashed. **M3-8 measured both options pin-neutral and decided on design** — do not re-open it as a pin question (§11) |
| **M4-5** | client copy | — |
| **M4-6** | ⛔ **NOT DECIDABLE HERE — OD-Q(iii) rules at M4-6.** "Wire" is a sim change; "remove" is client-only | the wire-or-remove answer itself |
| **M4-7** | `chron` is host-rendered on demand from an existing ring; the cid carry (DESIGN QUESTION (f)) adds **host** fields only | rendering the Chronicle on a **tick** path would be an allocation change, not a fold change — still not a pin, but it breaks `Chronicle.cs:52-53`'s stated allocation contract |
| **M4-8** | deletion of client chrome | ⛔ the dead `operate`/`HandleOperate` host handlers it sweeps are **host** code; deleting `CmdKind.Operate` from the **command enum** would renumber a hashed vocabulary — **check before assuming** |

> ### ⛔ ⚠️ SAY THE VACUITY RISK OUT LOUD, BECAUSE IT HAS BITTEN THIS REPO THREE TIMES
>
> M2-12 (*"no pin sees the generation term"*), M3-7 (*"no pin sees the rate term"* — a driven 2×2
> proving all three pinned runs bit-identical with the seam live and stubbed) and D1/D6 (*"the hold
> is VACUOUS ×4"*) are the same finding in three costumes: **under OD-H every work type boots OFF and
> no pinned fixture enqueues a command, so an unattended fixture does no work and a held pin is
> VACUOUSLY held.**
>
> ⛔ **THE BREAK MECHANISM IS THE MOST EXPOSED THING IN THIS MILESTONE TO EXACTLY THAT.** A break
> fires when a person's mood sits below a threshold for a dwell period. **On `--ship slice` and on
> P1's hand-built `BuildScenario` the crew do essentially nothing**, so the question *"does the
> pinned fixture ever reach the break threshold?"* has to be **DRIVEN, not argued**, in the break
> package's own commit — and the answer determines whether P1/P2/P3 move for the RIGHT reason (a
> behaviour change) or for a fold-only reason.
>
> ⇒ **The instrument that actually covers each new mechanism, named now so nobody reads a held pin as
> coverage:**
>
> | mechanism | its ONLY instrument | what the pins can say about it |
> |---|---|---|
> | break tier derivation (one tunable → three tiers) | a driven `MentalBreakTests` with **absolute** thresholds and a clamp leg | nothing |
> | the dwell counter's reset rule | the same suite, driven across a threshold crossing in both directions | nothing |
> | the sleep pause | a driven leg pairing `JobKind.Sleep` against a non-sleeping control | **P1 might move** — M3-9 proved the sleep gate is reachable on P1's fixture, so this is the ONE break-design clause a pin can see |
> | the refuse/stop/withdraw behaviours | driven per-behaviour legs, **one per verb, blinded** (5th trap) | nothing under OD-H |
> | `Citizen.Health` becoming real | `HealthTests` + a re-driven P1 | P1/P2/P3 move, and the move is genuine |
>
> ⭐ **AND THE 2×2 THE BREAK PACKAGE OWES ITS RE-PIN COMMIT** (M3-9's shape, and it is not optional):
> put the break threshold **out of reach** and re-run P1. If P1 returns to `7bdd0d6f7756dfdc`
> **exactly**, the whole move is the break BEHAVIOUR and the mechanism's mere presence is
> **pin-neutral, measured**. If it does not, the fold moved too and both causes must be separated
> before the tag is written.

---

## 3. THE MERGE ORDER

Numbered; this is the order the integrator merges `--no-ff` into `main` and re-gates. **Bold rows are
pin-chain rows and RUN ALONE.**

⛔ **POSITION 0 IS A GATE: THE M4 OWNER BATCH (§10).** Five items. **Items 1 and 2 block positions 4
and 4b; item 4 blocks 4c; item 5 blocks position 6.** Nothing else in the queue is gated.

⚠️ **PRECONDITION CARRIED FROM M3, NOT RE-CHARTERED HERE: the 60-minute owner playtest, 2026-08-07**
(§1's playtest clause). It does not block position 1 — this document — and it **does** block position
2 by owner direction.

⚠️ **SECOND PRECONDITION, AND IT IS THE MILESTONE'S ONE ORDERING TENSION:** `…q3.packages.md:3710`
gives M4-8 a **hard human gate** (*"a person must play `--ship grid` end to end first — no agent can
be that human"*) and `ROADMAP.md:153` schedules WP-9 *"inside M4-8, **not before the Persona
re-home**"*. **But `console-retirement.plan.md:224-229` puts `openPersonaForSelected` in
`ship-state.js`, which does not exist until M4-8 splits it out of `hud.js`.** ⇒ **The circle is cut in
§9 coupling 1 and the resolution is chartered in M4-2's SEAM: M4-2 lands the seam in `hud.js` beside
the four crew seams already there, ON `SHIP_STATE_REACH` — the list whose own header says it IS the
split specification — and M4-8 moves the whole list at once.** No package waits for the other.

| # | lane | package | notes |
|---|---|---|---|
| **0** | — | **THE OWNER BATCH (§10)** | ⛔ **GATE. Five items, one message, three-day default-to-recommendation.** Items 1+2 are inputs to positions 4/4b; item 4 to 4c; item 5 to 6. **Every item states its silence default, not just its recommendation** — M3's own lesson (its item 2's silence default was the opposite of the recommendation, and only an affirmative adoption saved it). |
| 1 | `lane/m4-1-persona-design` | **M4-1** | **THIS DOCUMENT.** INFRASTRUCTURE (design). No pin impact, no code. Merges before the playtest; **amended in place by the playtest's findings** (§1). |
| 2 | `lane/persona-window` | **M4-2** | ⭐ **THE MILESTONE.** Runs after the playtest. Moves **three** equality-pinned censuses in ONE commit (`CREW_INTERACTION` shrinks to one, `SHIP_STATE_REACH` gains a name, `FORBIDDEN_REACH` is re-checked for non-vacuity) — §9's sharpest matrix row. Also inherits the `escapeTarget` rung and the `T`/Enter third door. |
| 3 | `lane/dossier-truth` | **M4-3** | ⚠️ **Same file as 2** (`panels.js` dies or is gutted by 2; 3 decides which). **After 2.** Its content is the wire-widening the `◇ SAMPLE` clause of the exit gate needs. |
| **4** | **`lane/m4-4-health`** | **M4-4** | ⛔ **PIN ROW (`pin/m4-a`) IFF §10 item 2 ≠ (C).** RUNS ALONE. Also the natural home for the break mechanism if §10 item 1 = (a). |
| **4b** | **`lane/breaks`** | ⭐ **the first break** | ⛔ **PIN ROW (`pin/m4-b`). RUNS ALONE, and never concurrently with 4.** Exists only under §10 item 1 = (a) or (b). **If (b) — a ninth package — its id is M4-9** (§4's numbering rule). |
| **4c** | **`lane/social-ignition`** | ⭐ **bonds at thaw** | ⛔ **PIN ROW (`pin/m4-c`). Exists only under §10 item 4 = yes.** Serialize against 4 and 4b; three pin rows in one milestone is already the outer limit of the chain rule. |
| 5 | `lane/onboarding-rewrite` | **M4-5** | ⚠️ **After 2**, because the card must teach the affordance that ships, not the one that was chartered. ⛔ **Must not restore what M2-20 added** (`…q3.packages.md:3825`) and must not re-lead with TALK (`onboarding.js:225-227` pins VERBS[0] and the no-second-headline-TALK rule). |
| 6 | `lane/chronicle-reachable` | **M4-7** | Blocked by §10 item 5 (the severity tie) only for its headline behaviour; the reachability half is unblocked. ⛔ **`INERT_TABS` is itself pinned** (`overview-model.js:342`, and `:352-356` warns about it) — the removal and the pin move in one commit. |
| 7 | `lane/m4-6-decor` | **M4-6** | ⛔ **OD-Q(iii): the wire-or-remove call is TAKEN AT THIS ROW, by the owner, not before.** This charter deliberately does not ask it (§10's honesty note). |
| 8 | `lane/wp9-console-deletion` | **M4-8** | ⛔ **HARD HUMAN GATE first** (`…q3.packages.md:3710`). **Last by construction**: it deletes the file every other package still reaches through. *"Schedule it here; let it slip without guilt."* |

> ### ⭐ WHY THIS ORDER AND NOT THE OUTLINE'S
>
> The `ROADMAP.md:95-97` outline reads M4-1…M4-8 in id order. **Three rows move:**
>
> **M4-7 (Chronicle) drops below M4-5.** It is in the exit-gate sentence and it is *cheap* — the
> `chron` channel is complete, cached and already replayed on connect (`WireFormat.cs:696-710`;
> `GameSession.cs:2185` day-rollover, `:5079` on demand). ⚠️ **Cheap is exactly why it must not go
> first**: `INERT_TABS` and the Overview tab strip are `overview-view.js`/`overview-model.js`, the
> same two files M4-2 rewrites the readout in, and a tab landing before the window means merging the
> window into a moved tab strip. **Serialize behind M4-2, not before it.**
>
> **M4-6 (RUG/SHELF) drops to 7.** Not a scheduling preference — **OD-Q(iii) makes it a decision that
> happens AT the row.** Putting it early would mean asking the owner in this batch, which OD-Q
> explicitly refused.
>
> **The break row (4b) is inserted after M4-4 and before M4-5**, so that the two pin rows sit adjacent
> and the standing deep lane is occupied once rather than twice with a gap. ⚠️ **If the playtest
> squeezes the milestone, 4b is the row that slips** — it is the only row that moves no clause of the
> exit-gate sentence. **Say so now rather than discovering it**, exactly as M3 said it about M3-9.

---

## 4. THE COUNTS, AND THE INFRASTRUCTURE LEDGER

⛔ **RE-DERIVE FROM THE HEADINGS ON THE TREE YOU ARE ON —
`grep -n '^### M4-' docs/design/perilune-m4.packages.md` is the whole method.** `…q3.packages.md`
§9's standing note applies verbatim: a count is a measurement of a tree, and that section was wrong
four separate ways in one quarter; `…m3.packages.md` §4 was then wrong once more by being written
before its milestone stopped growing.

| milestone | packages | PLAYER | INFRASTRUCTURE | cap (⌊n/5⌋) | headroom |
|---|---:|---:|---:|---:|---|
| **M4** *(chartered here)* | **8** | **7** | **1** (M4-1) | **1** | ⛔ **0 — AT CAP** |
| **M4** *(if §10 item 1 = (b))* | **9** | **8** | **1** | **1** | ⛔ **0 — still AT CAP** |

**M4 = 8** — M4-1…M4-8 exactly as `ROADMAP.md:95-97` lists them. **No package is added by this
document**; the ninth, if it exists, is created by an owner answer (§10 item 1) and not by a charter.

> ### ⛔ THE INFRASTRUCTURE CAP IS A REFUSAL AND M4-1 IS ITS ONE SLOT
>
> `…q3.packages.md:3749` marks **M4 = 8 packages, 1 INFRASTRUCTURE, cap ⌊8/5⌋ = 1 — "AT CAP"**, and
> `:3771-3777` states the consequence: *"Chartering one more infrastructure package in M1 or M4 is a
> **refusal**, and the only way past it is an explicit owner override recorded by name and date."*
>
> ⇒ ⛔ **M4-1 IS THAT SLOT AND IT IS NOW SPENT.** Anything in this milestone that wants to be a
> design package, a rig, a harness, a guard-about-a-guard or a re-baseline **is not chartered and
> does not become chartered by being useful.** Under `PROCESS.md` §2's lane-selection gate such work
> is **META-WORK by default** and *"never runs as its own lane: it rides inside a lane that does
> answer, or it stays filed."*
>
> ⭐ **AND THE PRECEDENT THE SLOT IS SPENT ON IS NAMED:** `…q3.packages.md:3798-3803` — *"Design
> packages are INFRASTRUCTURE (M3-1, M4-1). Their deliverable is a document; they have no demo, and
> giving them a fabricated player sentence is the exact failure §6 exists to stop. … **Before
> chartering a design package, ask its question of the running sim.** 'There is no precedent for X' is
> a statement about what someone has read, never about what the engine does."*

**Classification notes** (so a reviewer can check them):

- **M4-1 is INFRASTRUCTURE** and carries **no** player sentence. M3-1 is the structural model
  (`…m3.packages.md:310-377`).
- **Every other M4 package is PLAYER**, including M4-8. ⚠️ **M4-8 is the one that reads like
  infrastructure and is not**: deleting the `.app` shell removes ~115 of `index.html`'s 154 lines
  from the player's screen, and the standard surface it leaves is the thing the player uses. Its
  player sentence is written in §5.
- **The split-sentence rule is NOT used in M4.** It was used once, by M2-1; a second claimant is the
  signal it has become a loophole (`…m3.packages.md:298-299`). Every package here has its own
  sentence, or is INFRA and says so.
- **A re-pin commit is not a package** — M4-4 and the break row each carry one as a ritual tail and
  count once.
- ⭐ **The break mechanism does NOT get a free id from this document.** Where it builds is §10 item 1,
  and if the answer is (b) the id is **M4-9** — the next free number in the M4 range. `…q3.packages.md`
  §11's rule stands: **published ids are stable and gaps are never reused.**

---

## 5. THE CHARTERS

*In charter order, not merge order. M4-1 first because everything else is written against it.*

### M4-1 — the Persona window, designed *(INFRASTRUCTURE)*

**CLASS: INFRASTRUCTURE (design)** · **LANE: `lane/m4-1-persona-design`** · **SIZE: L**

⛔ **NO PLAYER SENTENCE, deliberately.** Its deliverable is a document plus an owner review. Writing a
fake sentence here is the failure the CLASS field exists to prevent (M3-1's own words,
`…m3.packages.md:314-315`).

**WHAT IT UNBLOCKS, BY ID** (the lane-selection gate's answer 2): **T16** via M4-2 · **T12's remaining
half** via §10 item 1's package · **T14** via §10 item 2 · the exit gate's `◇ SAMPLE` clause via M4-3
· `ROADMAP.md:55`'s Room-Zoom filing · `MECHANICS.md:5771`'s "Incapable Of" filing · `ROADMAP.md:140`'s
**D-3**.

**THE DELIVERABLE LIST.** `console-retirement.plan.md:234` leaves **five** things open *"deliberately"*
and they are this package's spine; the tree and the filings add **eight more**. All thirteen are
answered below — as a **RULING** (settleable from an existing OD or from the analogue: §11 carries the
citation), a ⛔ **DESIGN QUESTION** (a fork the docs do not decide, priced with options), or an
**OWNER BATCH ITEM** (§10).

| # | the open item | source | disposition |
|---|---|---|---|
| 1 | the window's **layout** | `console-retirement.plan.md:234` | ⛔ **DESIGN QUESTION (a)** |
| 2 | its **tabs** | `:234` | ⛔ **DESIGN QUESTION (a)** — same fork |
| 3 | how **traits / relationships / needs / history** are arranged | `:234` | **RULED** — five bands, §5's layout ruling |
| 4 | whether it **hosts orders** | `:234` | **RULED — NO**, from the analogue (§11) |
| 5 | whether it ever surfaces a **transcript** | `:234` | **RULED — NOT IN v1** (§11) |
| 6 | the `controls.js` **T-key / Enter third door**'s fate | `controls.js:174,284,331` | ⛔ **DESIGN QUESTION (b)** |
| 7 | the **mount** (`#panels` visibility vs a body-level sibling like MOSS) | `console-retirement.plan.md:585-589` | ⛔ **DESIGN QUESTION (c)** |
| 8 | does **Room Zoom grow a readout**, or does the window answer there? | `ROADMAP.md:55`, `MECHANICS.md:3151` | **RULED — the window answers** (§11) |
| 9 | **Rell's unauthored identity** | `MECHANICS.md:5884-5894`, `SleeperAptitudes.cs:69-73` | **RULED** — M4-3 authors her SHEET; her spread stays 0 (§11) |
| 10 | what **RELATIONSHIPS** shows when the graph is empty | `…m3.packages.md:240`, `MECHANICS.md:5818-5824` | ⛔ **DESIGN QUESTION (d)** + **§10 item 4** |
| 11 | the **"Incapable Of"** surface | `MECHANICS.md:5771` | **RULED — the window carries it**, no wire change (§11) |
| 12 | **per-person history** without a cid on a Chronicle line | `Chronicle.cs`, `HistorySystem.cs:62-66` | ⛔ **DESIGN QUESTION (f)** |
| 13 | how **"how she is"** gets an honest data source | measured: `Citizen.Mood` reaches no client | ⛔ **DESIGN QUESTION (e)** — and it is the one the ⭐ TWoM section answers |

---

#### THE LAYOUT RULING — five bands, in the exit gate's own order

**The gate sentence is four questions and the window is their answer, in the order asked.** Five
bands, one per answer plus the one the analogue adds:

```
┌─ PERSONA · <NAME> ─────────────────────────────────────────────┐
│  IDENTITY      portrait · name · role · where she is           │  ← "who she is"
│                trait chips · a one-line written identity       │
├────────────────────────────────────────────────────────────────┤
│  DOING & WHY   the WHOLE TaskLabel sentence, never truncated   │  ← "what she's doing" + "why"
│                + the ranking clause + the ORDER STUCK reason   │
├────────────────────────────────────────────────────────────────┤
│  HOW SHE IS    a computed STATE LINE in words, and what it     │  ← "how she is"
│                MEANS she will refuse.  ⛔ NO BAR, NO NUMBER.   │
├────────────────────────────────────────────────────────────────┤
│  CAN & CANNOT  six work types with skill 0–20; a type she can  │  ← RW§1.6 + RW§6.1's own surface
│                NEVER do is listed as such, with its source     │
├────────────────────────────────────────────────────────────────┤
│  TIES & HISTORY  relationships (authored prose + live edges)   │  ← the payload VISION names
│                + her own lines from the Chronicle              │
└────────────────────────────────────────────────────────────────┘
```

**Why this grouping is a ruling and not a taste call.** RimWorld's Bio / Health / Needs / Social tabs
are the analogue and they group the *same* content the *same* way: **Bio** = identity + backstory +
**"Incapable Of"** (`rimworld-reference.md:1346`-§6.1 and §1.6, and `MECHANICS.md:5771` names that tab
by name as the surface Perilune lacks); **Health** = capacities; **Needs** = mood and its thresholds;
**Social** = relations. ⇒ **The CONTENT grouping is settled by the analogue** (§11). What the analogue
does **not** settle is whether those groups are TABS or BANDS — RimWorld's window is persistent,
docked and re-opened constantly; ours is opened by a click on a map and dismissed by Esc. **That fork
is DESIGN QUESTION (a).**

⭐ **The two bands that do not exist anywhere in the game today are HOW SHE IS and TIES & HISTORY, and
they are the two the exit gate and OD-R respectively care most about.** The other three are
consolidation of surfaces that already work.

---

#### ⛔ DESIGN QUESTION (a) — ONE SCROLL, OR TABS

| # | option | cost / verdict |
|---|---|---|
| 1 | ⭐ **One scrolling column, five bands, all present** | ⭐ **RECOMMENDED for v1.** The gate is *"ONE click → ONE window"* and four of its clauses are in different bands; tabs mean the gate's own sentence needs three more clicks to verify. Cheapest to build, cheapest to test (one DOM tree), and the honest empty-state rule (`invisible feedback is FUNCTIONAL`, binding 2026-07-26) is trivial to satisfy — an empty band SAYS it is empty. **Cost: vertical length.** Measured constraint: the dossier it replaces already mounts full-height into `#panels` (`styles.css:428`, `position:fixed;inset:0`), so the room exists. |
| 2 | Four tabs on RimWorld's own split | ⛔ **REFUSED for v1, kept as the named fallback.** It is the analogue's shape, but RimWorld's window is a persistent docked inspector and ours is a modal takeover — **porting the tab split without the persistence ports the cost and not the benefit** (the *verb parity is NOT sufficient* rule, binding 2026-07-26, applied to layout). ⚠️ **If the playtest says the scroll is too long, this is the amendment**, and it is cheap because the band boundaries are already the tab boundaries. |
| 3 | Two windows (a glance card + a deep dossier) | ⛔ **REFUSED.** It re-creates the readout/dossier split M4 exists to end and it re-grows `CREW_INTERACTION` to two entries — the exact thing `surface-boundary.test.js:1013-1014` was *requested* to prevent. |

⚠️ **Whatever ships, the band ORDER is the gate sentence's order and that part is not optional** — a
reviewer checking the gate reads top to bottom.

---

#### ⛔ DESIGN QUESTION (b) — THE THIRD DOOR: `T` AND ENTER-ON-SELECTED-CREW

**MEASURED ON THIS TREE, and the pin cannot see it.** `client/src/input/controls.js:174-177`:

```js
function talkSelected() {
  …
  if (cid != null) { session.send(Cmd.talk(cid)); return true; }
```

It sends **directly on the session** and never through `hud.js`. `CREW_INTERACTION`'s scan
(`surface-boundary.test.js:920-940`) enumerates symbols imported **out of hud.js** and filters them by
`/^(talk|openPersona|openBio|converse|chat)/i` (`:999`) — **a direct `Cmd.talk` send matches nothing
in it.** The door is live on the Overview: bound to `T` (`controls.js:284`) and to Enter-on-selected-
crew (`controls.js:331`), suspended only inside Room Zoom (`controls.js:167,281`;
`client/src/main.js:82,375`). And `client/src/ui/onboarding.js` still teaches it.

⇒ **There are THREE doors from the map to a person and the census pins TWO.** This is the **4th trap's
shape** — *a guard whose scope filter excludes the violation* — and it is the sharpest thing this
charter found by opening files.

| # | option | cost / verdict |
|---|---|---|
| 1 | ⭐ **Retarget `T` and Enter to OPEN THE PERSONA WINDOW; `Cmd.talk` leaves the client entirely** | ⭐ **RECOMMENDED.** The keys keep working, the destination becomes the one door, and the host-side `talk`/`say`/`bye` parse plus the `chat` channel **stay defined and unreferenced-by-the-client** exactly as `console-retirement.plan.md:255` requires. ⚠️ **`T` for "Persona" is a bad mnemonic** — OD-P forbids letter hotkeys *inside MOSS* only, so a rebind is legal here; **`P` is free and `T` should be retired with the verb.** Names the onboarding coupling (§9). |
| 2 | Delete `T`/Enter and leave the button | ⛔ **REFUSED.** Enter-on-a-selected-thing is a keyboard contract the whole surface uses; deleting only this arm makes Enter mean "click the tile under the cursor" for crew and something else for everything else. |
| 3 | Leave it | ⛔ **REFUSED.** It ships a third door into a milestone whose entire premise is one door, and the shipped test would stay green while it happened. |

⛔ **AND THE GUARD MUST BE WIDENED IN THE SAME COMMIT, OR THE DOOR GROWS BACK INVISIBLY.**
`CREW_INTERACTION`'s scan must additionally see **direct `Cmd.<crew-verb>(…)` sends from any
non-`CONSOLE_OWNER` module**, with a **planted-violation control both ways** (a search that finds
nothing and a search that cannot find anything look identical — the standing rule). ⚠️ **This is
M4-2's obligation, not a later sweep**: a widened guard landing a week after the retarget pins a hole
that has already been filled and proves nothing.

---

#### ⛔ DESIGN QUESTION (c) — WHERE THE WINDOW MOUNTS

**MEASURED.** `#panels` is a body-level sibling (`client/index.html:144`; `styles.css:428`
`position:fixed;inset:0;pointer-events:none;z-index:30`) and it is **display:none under two body
classes**: `body.moss-open` (`styles.css:874`) and `body.roomzoom-open` (`styles.css:1326`). It is
**deliberately visible over RELATIONS** (`styles.css:1808` says so in a comment).

| # | option | cost / verdict |
|---|---|---|
| 1 | ⭐ **A new body-level container (`#persona`), sibling to `#roomzoom-view`, visible over BOTH standard surfaces** | ⭐ **RECOMMENDED.** ⛔ **The decisive fact is measured, not aesthetic: `#panels` is hidden under `body.roomzoom-open`, and the Room Zoom's crew dock is precisely the surface with no readout** (`ROADMAP.md:55`; `MECHANICS.md:3151` measures `.rz-crewtask` at 118 px ≈ 22 chars against the Overview's 264 px `.ov-task`). A window that cannot open where the readout is missing does not close `ROADMAP.md:55`'s filing. It also survives M4-8 by construction — nothing in it is `.app` chrome. |
| 2 | Keep `#panels` and delete the `roomzoom-open` hide rule | ⛔ **REFUSED, and it looks cheaper than it is.** `#panels` also hosts the deprecated dialogue window, which M4-8 deletes; un-hiding the container un-hides both. **And `console-retirement.plan.md:585-589` records this exact question and its own framing** — *"whoever designs it must decide whether `#panels` should be visible under `body.roomzoom-open`, or whether the Persona window is a body-level sibling like MOSS"*. **This charter takes the second.** |
| 3 | Inside `overview-view.js`'s own DOM | ⛔ **REFUSED.** Then it cannot open from Room Zoom at all, and the two surfaces would each need one. |

**THE ESC LADDER IS INHERITED AND IT IS PINNED.** `escapeTarget` (`client/src/ui/console-model.js:756`)
returns `armed → dialogue → dossier → MOSS → relations → none` in strict priority, pinned
value-by-value at `client/test/console-model.test.js:650-657`. ⚠️ **The `dossier` rung sits ABOVE MOSS
and relations**, so a Persona window replacing the dossier inherits that precedence: Esc closes the
Persona window before it closes MOSS. ⇒ **M4-2 renames the rung and moves the pinned test in the SAME
commit**; a rename in one file and a pin in another is how a rung silently disappears.

---

#### ⛔ DESIGN QUESTION (d) — WHAT `TIES & HISTORY` SHOWS WHEN THE GRAPH IS EMPTY

**MEASURED, and the empty case is the SHIPPING case.** The seven authored sleepers'
`Relationships` are **deliberately EMPTY for all seven** (`MECHANICS.md:5818-5824`) — seeding them
would mutate hashed SOCL state from a host at runtime, which M3-8 refused on principle. The bonds
exist only as **prose inside `RaidBackstory`**. And once crew are co-located, `SocialSystem` runs the
other way: **the social graph saturates in a single day** (`MECHANICS.md` §13.7, `:2191`) and **crew
memory is flooded by social spam** (§13.8, `:2211`).

⇒ **The band's real problem is not emptiness. It is that it goes from empty to saturated with nothing
in between, and neither state is a relationship a player can care about.**

| # | option | cost / verdict |
|---|---|---|
| 1 | ⭐ **TWO clearly labelled sources: authored prose bonds from `PersonaSheet` (host-owned, unhashed) + live SOCL edges from the `relations` channel — and an HONEST EMPTY STATE when both are empty** | ⭐ **RECOMMENDED for v1, and it costs nothing hashed.** The prose is already authored and already shipped (`AuthoredShips.cs` `WreckSleepers()`); the `relations` channel already carries directed edges `[fromCid,toCid,opinion,tier,note,secret]` (`messages.js:161-169`). ⛔ **The empty state is written, never hidden**: *"No one aboard knows her yet."* — hiding an empty band is the *invisible-feedback-is-functional* failure, and the dossier's own RELATIONSHIPS section already ships a note for exactly this case (`panels.js:385`). |
| 2 | Seed real SOCL bonds at thaw | ⛔ **NOT THIS CHARTER'S CALL — §10 ITEM 4.** It is hashed sim state written from `CryoSystem` (a pin row, `pin/m4-c`), it is `perilune-character-simulation.plan.md` §12.2 wearing the wreck's costume, **and it is the only honest route to closing D-3 and to making grief legible** (see the ⭐ TWoM section). |
| 3 | Show the saturated graph as-is | ⛔ **REFUSED.** §13.7 measures it saturating in a day; a band that says the same thing about everyone says nothing about anyone. If item 4 is refused, option 1 plus a **tier filter** (show only non-Acquaintance edges) is the fallback. |

---

#### ⛔ DESIGN QUESTION (e) — WHERE "HOW SHE IS" GETS AN HONEST DATA SOURCE

⛔ **THE MEASURED PROBLEM, THREE FACTS, EACH READ ON THIS TREE:**

1. **`Citizen.Mood` reaches no client at all.** A complete reader census across `sim/` + `hosts/`
   finds: `ShipMetrics.cs:86` (the ship-wide mean → `Morale` → Director), `SocialSystem.cs:149` (the
   argument gate), `hosts/tui/Ui/InspectorModel.cs:84` (a TUI debug line), and save/hash. **No wire
   channel carries it.**
2. **The roster's `mood` field is a STRING and it is not `Citizen.Mood`.** It is
   `mind.ActiveEmotion(_sim.TickCount)` (`GameSession.cs:2483`; `CitizenMemory.cs:127` returns `""`
   unless an unexpired `Emotion` was set), and the **only writer anywhere** is
   `EffectValidator.ApplyEmotion`, reachable only from a conversation effect. ⇒ **On a shipped
   offline run, every crew member's `mood` string is empty for the whole game.**
3. **`morale` on the roster is a measured constant.** `Citizen.Morale` (`Citizen.cs:35`) is never
   written by any system; `MECHANICS.md` §13.4 measures **1.00 for every crew member at all times**,
   and the meter was removed at M1-F and is **equality-pinned gone** — `client/test/dossier-honesty.test.js:138`
   pins the meter census to exactly `['Health','Food','Water','Rest','Affinity','Trust']`.

| # | option | cost / verdict |
|---|---|---|
| 1 | Put `Citizen.Mood` on the wire as a **number** and draw a bar | ⛔ **REFUSED TWICE OVER.** (a) `TARGET.md:67-69` — ***"No misery meters … never a bar the player feeds"***; (b) `dossier-honesty.test.js:138`'s equality-pinned meter census reddens by construction, and `panels.js:224-247`'s own ledger comment says why in advance: *"Do not add a field to this REAL list on the strength of it being on the wire; ask whether the sim moves it."* |
| 2 | ⭐ **A computed STATE LINE, in words, plus WHAT IT MEANS SHE WILL REFUSE** | ⭐ **RECOMMENDED, and it is TARGET §2's own instruction applied literally.** The host composes one sentence from the same scalars the sim already holds and ships it as a string — the `perilune-character-simulation.plan.md` §8.1 shape (*prediction chips* on `roster.traits`, *"the numbers never cross the wire"*). Example, and the second clause is the whole point: **"Exhausted and hungry. She will not take a job in vacuum."** |
| 3 | Both | ⛔ **REFUSED** — option 1's two objections are unaffected by adding option 2 beside it. |

> ### ⛔ ⭐ AND THE SEQUENCING RULE THAT FALLS OUT OF OPTION 2, BECAUSE IT CHANGES THE MERGE ORDER
>
> Option 2's first clause (*"Exhausted and hungry"*) is buildable today from `Fatigue`/`Hunger`. **Its
> second clause is not** — today **mood gates no crew behaviour whatsoever** except the argument roll,
> so there is nothing she will refuse and the sentence would have to stop after the adjective.
>
> ⛔ **A state line that stops after the adjective is a COSMETIC OPERATOR** — `TARGET.md:66` bans
> *"a decorative −5%"* and `:69` extends it to tone: *"Sadness that changes no decision is a
> decoration."* **Shipping the band with only its first clause is shipping the thing OD-R's amendment
> exists to forbid.**
>
> ⇒ **THE RULE: the HOW SHE IS band ships with, or after, the first break behaviour.** If §10 item 1
> defers breaks to M5, **M4-2 ships four bands and the fifth is chartered with the breaks** — and the
> exit gate's *"how she is"* clause is then **partially met and said to be**, not quietly filled with
> an adjective. ⚠️ **This is the single most consequential coupling in the milestone and it is why
> §10 item 1 exists.**

---

#### ⛔ DESIGN QUESTION (f) — PER-PERSON HISTORY WITH NO CID ON A CHRONICLE LINE

**MEASURED, and the finding is better than the filing suggested.** `ChronicleDay.Lines` are prose
strings (`Chronicle.cs:16`) with names woven in by `HistorySystem`, and the `chron` wire carries
`{day, headline, lines[]}` and nothing else (`WireFormat.cs:702`; `messages.js:158`). **But the cid is
not missing from the sim — it is DROPPED BY THE RENDERER**: `HistoryEntry` (`HistorySystem.cs:54-78`)
carries **`SubjectA`** (`:63`, *"Primary subject id (citizen or device); 0 = none"*) and **`SubjectB`**
(`:66`), both `uint`, and `CLAUDE.md`'s own pin paragraph records that the `'HIST'` fold folds
*"tick+kind+SubjectA+SubjectB of every entry"*. ⇒ **The identity is already hashed state; only the
renderer forgets it.**

| # | option | cost / verdict |
|---|---|---|
| 1 | Client-side **text-name join** | ⛔ **REFUSED.** `MECHANICS.md` §13.43.3 records exactly this regression class (`ShipSystems.cs:1139-1155`), and the client's own `surnameOf` collides by construction on a crew with shared surnames. **A join on prose is a bug with a schedule.** |
| 2 | ⭐ **`Chronicle.Render` carries `SubjectA`/`SubjectB` out beside each line; the `chron` wire gains two ints per line** | ⭐ **RECOMMENDED.** Additive, **host-side only, no hashed state, NO PIN**, and it costs one field on a struct the sim already fills. The Persona window then filters *her* lines with an integer compare. ⚠️ **It belongs to M4-7 (Chronicle reachable), not M4-2** — one lane owns the channel, and `MECHANICS.md:1708` already reserves a Chronicle-ring seam as *"M4-7's, not to be re-homed opportunistically."* |
| 3 | Surface `CitizenMemory.Episodic` instead | ⛔ **NOT v1, but it is the better long answer and is FILED.** It is genuinely per-person, importance-scored and capped at 120 (`CitizenMemory.cs:29-46`), it is **hashed** (`'MEMS'`), and `console-retirement.plan.md:247` names it *"load-bearing for the Persona window"*. **But it is on no wire**, so it is a new channel plus a consumer — a package, not a clause. |

---

### ⭐⭐ M4-1's TWoM-GAMEPLAY SECTION — WHAT OD-R BINDS THIS CHARTER TO DESIGN

> **OD-R's binds cell, verbatim:** *"M4-1 and M5-1 charters (written at M4 open, **this row sets their
> TWoM-gameplay section**)"*, and its scope clause: ⛔ *"**nothing is implementable before the M4-1
> charter** — no break table, no scarcity retune, no misery meter … file ideas against M4-1/M5-1."*
>
> ⇒ **Everything below is CHARTER-LEVEL: mechanism shape plus the open questions. No code, no def
> row, no number that has not been measured or marked MUST RE-MEASURE.** And OD-R's own division of
> authority governs: **RimWorld is the MECHANISM authority; This War of Mine is the authority for what
> the mechanisms are FOR.**

---

#### TWoM-1 · DETERMINISTIC MENTAL BREAKS (OD-R clause ii)

##### What is DECIDED by the analogue and must not be re-litigated

`rimworld-reference.md` §4.2 (`:999-1012`) and §4.3 (`:1106-1112`). **Adopted as the mechanism, by
`PROCESS.md` §2's binding rule** (*"for mechanisms, RimWorld's shape IS the decision"*):

| # | adopted | source | note |
|---|---|---|---|
| **1** | ⭐ **ONE per-person tunable → THREE DERIVED TIERS.** major = **4/7** of minor; extreme = **1/7** of minor; the minor threshold **clamped** to a band | `:1007-1012` — *"Three tiers, one tunable. A lane copying this should copy the **derivation**, not three numbers: RimWorld exposes one per-pawn stat and computes the other two."* | **The derivation is the adoption. The numbers are not** — see MUST RE-MEASURE below |
| **2** | **TWO INDEPENDENT AXES**: *how happy is this person* (a mood offset) vs *how much unhappiness can this person take* (a threshold offset), and they are different fields | `:1034-1037` — Sanguine/Optimist/Pessimist/Depressive move **mood**; Iron-willed/Nervous/Volatile move the **threshold**; *"a distinction that reads backwards from the trait names"* | ⭐ **The single most portable fact in §4 for an axes-and-marks engine**, and it is what makes traits mean two different things |
| **3** | **AWAKE-AND-ABLE PRECONDITION** — *"To break at all, a pawn must be awake and able to move"* | `:1017-1018` | Half free, half gated — see TWoM-1(d) |
| **4** | **CATHARSIS is an explicit anti-death-spiral device**, not an afterthought (+40 mood for 2.5 days in RimWorld) | `:1015-1017` | The mechanism is adopted; **the implementation cannot be** — see TWoM-1(c) |
| **5** | **The player has NO CONTROL during a break** | `:1014` | ⛔ **COLLIDES WITH PERILUNE'S WHOLE GAME — §10 item 3** |

##### ⛔ The collision this section must open with, because it changes every number

`rimworld-reference.md` §8.6 (`:1811-1844`), and it is stated as a COLLISION in the source:

- `Citizen.Mood` is **recomputed from scratch every pass with no history**
  (`NeedsSystem.cs:200-205`, read on this tree):
  `Mood = MoodBase − Hunger·W_h − Thirst·W_t − Fatigue·W_f − Suffocation·W_s`, shipped defaults
  base 20 / hunger 40 / thirst 30 / fatigue 25 / suffocation 60 (`SimDefs.cs:863-867`) ⇒
  **range −135 … +20, NOT a percentage and NOT centred on zero** — the source line says so itself
  (`NeedsSystem.cs:196-198`).
- There is **no `Thought` type, no thought stack, no mood modifiers, and no mental-break state.**
- §8.6's verdict: *"**'make mood work like RimWorld's' is a request to build a thought system, an
  expiry model, a rate limiter and a break ladder — not to retune four coefficients.**"*

⇒ ⛔ **RIMWORLD'S 35 % / 20 % / 5 % CANNOT BE PASTED INTO THIS GAME.** The **derivation** carries
(one tunable, ×4/7, ×1/7, clamped); the **units** do not. Perilune's tunable is expressed in
**Perilune mood units on a −135…+20 scale**, and its default must be measured, not chosen.

> ### ⛔ ⚠️ MUST RE-MEASURE — THE MOOD ENVELOPE, AND SAYING THIS IS THE POINT OF THE PARAGRAPH
>
> Every published Perilune mood number is **PRE-M3-9** and none has been re-taken:
>
> | number | where | why it is stale |
> |---|---|---|
> | crew-mean **−37.7 / −26.4 / −29.5** at days 1–3; envelope ≈ **[−39.8, −10.5]** | `MECHANICS.md` §13.4 (`:2046-2058`) | the bullet **says so itself**: *"the mood envelope above is a **PRE-M3-9 measurement that has not been re-taken**"* |
> | *"mood is permanently ≤ −5 for every crew member from day 1"* | `rimworld-reference.md:1816-1817` | its premise was *"`Fatigue` has **no reducer**"*. **M3-9 shipped the reducer** (`RestSystem.cs`), and §13.4's fatigue bullet is struck through and marked ✅ CLOSED |
> | the display band **[−60, 0] clamped** | `perilune-character-simulation.plan.md` §8.2 (`:696-707`) | a host-side literal chosen against the same pre-M3-9 envelope |
>
> ⇒ ⛔ **A BREAK THRESHOLD SET FROM AN UNMEASURED ENVELOPE IS THE D-3 DEFECT BEING RE-COMMITTED
> DELIBERATELY.** D-3 is `argument_mood_threshold = 0` against a permanently-negative mood: *"the mood
> term contributes nothing **because it is always true** — the same shape as the `ShipMetrics.Food`
> clamp … where a term that is always saturated reads as if it were doing work"*
> (`rimworld-reference.md:1830-1835`). **A break threshold too high fires for everyone forever; too
> low fires never. Both look like a shipped mechanism.**
>
> ⇒ **The break package's FIRST measurement, before a line of mechanism, is the post-M3-9 mood
> envelope on `--ship wreck` across at least three sim-days with a real crew — day-means AND
> per-citizen min/max — and the thresholds are set against THAT.** The envelope goes into
> `MECHANICS.md` §13.4 in the same commit, replacing the struck numbers.

##### (a) The break ROSTER — RW§4 names TIERS, not behaviours, and OD-R names the behaviours

⚠️ **The hole, stated precisely: `rimworld-reference.md` §4 gives the three-tier ladder, the
thresholds, the trait offsets and the aftermath — and NEVER a table of break TYPES or their selection
weights.** It is not an omission to look up; §4 declares itself shallow by design (`:955-956`). ⇒
**This is the charter's to fill, and it fills it from OD-R's own three verbs** — *refuse dangerous
orders · stop working · withdraw* — which is the only source with standing.

**THE PROPOSED MAPPING — one behaviour per tier, monotone in severity:**

| tier | derived from the tunable | the behaviour | the seam that ALREADY EXISTS |
|---|---|---|---|
| **MINOR** | the tunable itself | ⭐ **SHE REFUSES THE DANGEROUS ORDER.** She still works; she will not cross the pressure frontier | ⭐ **M3-14's rung 2, run backwards.** A held order today bypasses `WorksiteSafety.CanStageWorkerAt` (`SafetySystem.cs:125-128`) because `Citizen.HeldByOrder` is set; a minor break **withdraws that bypass for that person**. One predicate, one existing field, no new job state |
| **MAJOR** | **4/7** of the tunable | **SHE STOPS WORKING.** Every work claim declines; needs (eat/drink/sleep) and flee still run | the job-claim gate. ⛔ **NOT `IsRecruitableForWork`** — M2-2's standing refusal (*"`IsRecruitableForWork` MUST NOT absorb the work grid"*, `…m3.packages.md:2377`) is about the grid, and a break is not the grid, **but the lesson is the same one**: a second meaning stuffed into one predicate is how the M2-0 spike repeated. **A break is its own named gate, asked beside the grid's** |
| **EXTREME** | **1/7** of the tunable | **SHE WITHDRAWS.** She abandons the job, walks somewhere and stays: refuses work AND refuses orders | the idle-movement channel + the `HoldPosition` precedent (`Citizen.cs:21`). M3-9's `RestSystem` is the shipped model for *a system that takes a citizen between jobs without being a work type* |

⭐ **AND THE DEVIATION FROM RIMWORLD IS DELIBERATE AND MUST BE STATED IN THE PACKAGE'S OWN COMMIT:**
RimWorld selects a break **type** from a weighted roster per tier (that is what its "mean time to
break" rate is rolling for). **Perilune has exactly ONE behaviour per tier and no selection at all** —
because a weighted roster is a die, and `TARGET.md:63-65` forbids dice in outcomes. *One tier, one
consequence, no choice* is also the more legible design: a player who sees the same behaviour twice
learns the rule.

##### (b) The deterministic, no-dice replacement for "mean time to break"

⛔ **RimWorld's ladder is a RATE, and rates are rolls.** `:1001-1005` gives *mean time to break* — 10
days below minor, 3 below major, 0.7 below extreme. **That is a per-tick probability. It cannot be
adopted** (`TARGET.md:63-65`: *"A jam is a computed consequence of a hashed mood/skill state, **never
a runtime roll**"*; OD-R restates it: *"breaks are computed consequences, never fed bars, never
rolls"*).

⭐ **THE REPLACEMENT, AND IT PRESERVES THE MEANING EXACTLY: DWELL TIME.**

```
a person breaks at tier T when she has been continuously at or below
tier T's threshold for dwell_ticks[T]     — a hard time, where RimWorld has a mean time
```

- **It is a threshold over hashed state**, which is OD-R's own words for what the mechanism must be.
- **It preserves RimWorld's ORDERING and its shape**: deeper tier ⇒ shorter dwell, so the ladder
  still says *"the worse it is, the faster it comes"*, and a brief dip still costs nothing —
  which is precisely what RimWorld's rate limiter bought (`:984-985`: *"a fixed cause does not
  produce an instant effect; the player gets time to react"*). ⭐ **Perilune has no mood BAR to
  rate-limit, so the dwell counter IS the rate limiter** — the same protection, in the only place
  this architecture has room for it.
- ⛔ **IT COSTS ONE HASHED PER-CITIZEN FIELD**, and that is the pin row (`pin/m4-b`, §2). RW§8.9
  (`:1887-1899`) prices it: default + parser key + save-version branch + checksum fold + round-trip
  test + a re-measured pin, in ONE commit.

**Two sub-decisions the charter takes, with its reasoning, because neither is a fork worth an owner's
time:**

1. **The counter RESETS HARD on crossing back above the threshold** (it does not decay). RimWorld's
   rate model has no memory of how long you were low — the probability is the same on minute one and
   minute nine. A hard reset is the closest analogue and the cheapest state. ⚠️ **A decaying counter
   is the alternative and it is strictly more punishing**; if the playtest says breaks never fire, the
   fix is the threshold, not the reset rule.
2. **The tier thresholds and dwell periods ship as LITERALS, not def fields** — M2-1's
   *rule-not-tunable* precedent, used again by M3-7 (the rate curve) and M3-2 (`ThawSecondsPerCycle`).
   **A break threshold is a rule about what this game is, not a dial.** ⭐ **And it is what keeps P4/P5
   out of `pin/m4-b`.**

##### ⭐ Where the STATEFUL INPUT comes from — and the honest v1 answer

OD-R says *"thresholds over the hashed **mood/memory** state"*. **Mood exists; the memory does not.**
The intended architecture is already designed: `perilune-character-simulation.plan.md` §1 (`:246-247`)
states the contract — ***"`Mood` must stay memoryless: history gets a stateful INPUT to mood (marks →
`MoodPressure`), never a stateful mood"*** — and §3.4 (`:404-412`) specifies
`MoodPressure = Σ Weight × mood_weight[Kind] × (1 + N × stress_gain_max)` entering `NeedsSystem`'s
recompute as one subtracted term, with defaults sized against the shipped terms
(`bereavement 25 / neardeath 15 / raidtrauma 10 / feud 8` against hunger 40 and fatigue 25).

⛔ **BUT THE MARKS ARRAY DOES NOT EXIST IN THE TREE AND IS NOT IN THE M4 EIGHT.** ⇒ Stated as a
sequencing fact, not discovered later:

| v1 (M4) | v2 (the marks engine, unscheduled) |
|---|---|
| the break ladder reads **`Citizen.Mood` alone**, and the **dwell counter supplies the only memory** | the same ladder reads `Mood` **with `MoodPressure` folded in**, so a bereavement or a near-death pushes a person toward a break the way starvation does |
| **one new hashed field** | the marks array (16 × 24 B per citizen) + its decay + its events |
| buildable inside M4 | its own milestone-scale programme |

⭐ **AND THE ARCHITECTURE IS FORWARD-COMPATIBLE BY CONSTRUCTION, WHICH IS WHY THE v1 CUT IS HONEST:**
`MoodPressure` enters as a subtracted term **inside `NeedsSystem`'s existing recompute**, so the break
ladder never learns that its input got a memory. **The v1 ladder is not a stub of the v2 ladder; it is
the same ladder with a shorter input.**

##### (c) The CATHARSIS analogue — the anti-death-spiral device

⛔ **RimWorld's implementation cannot be ported.** *"+40 mood for 2.5 days"* is a **thought**: a timed
entry on a stack. Perilune's mood is closed-form and memoryless and **has no slot for a timed
offset** — putting one there breaks the memoryless contract the whole architecture rests on.

| # | option | cost / verdict |
|---|---|---|
| 1 | ⭐ **A break-recovery MARK with its own decay, contributing a POSITIVE `MoodPressure` term** | ⭐ **RECOMMENDED as the long answer, and it is architecture-consistent by construction** — it is exactly the marks engine's own shape, and `perilune-character-simulation.plan.md` §3.2 already reserves un-written kinds. ⛔ **Not buildable in M4** (no marks array). |
| 2 | ⭐ **A bounded THRESHOLD reprieve: after a break ends, that person's tunable moves so she is harder to break, for a fixed period** | ⭐ **RECOMMENDED FOR v1.** It uses RW§4's **second axis** (`:1034-1037` — threshold offsets are a different thing from mood offsets) instead of inventing a mood slot, and it costs **one more hashed field on a citizen who already gained one** — the dwell counter's own commit, no second pin row. ⚠️ **It is a real deviation from RimWorld, which puts catharsis on the mood axis, and the deviation must be written into the commit rather than glossed.** |
| 3 | No catharsis at all | ⛔ **REFUSED, and the refusal is the whole reason this sub-section exists.** RimWorld calls catharsis *"an explicit anti-death-spiral device"* (`:1016`). Without it, a crew member who breaks is more likely to break again immediately — a spiral with a person's name on it. ⭐ **In a TWoM register that is not tension, it is the game giving up on someone, which is the exact failure OD-R's *"endurance, not power fantasy"* is pointed away from.** |

##### (d) The AWAKE-AND-ABLE precondition, and ⭐ the sleep-freeze gap it closes for free

RimWorld: *"To break at all, a pawn must be awake and able to move"* (`:1017-1018`), and separately
*"while a pawn is asleep or unconscious the bar is **frozen** and break risk is **paused**"* (`:986`).

- **AWAKE — free, and the seam is shipped.** M3-9 already gates `NeedsSystem`'s fatigue ramp on
  `citizen.JobKind != JobKind.Sleep` (`NeedsSystem.cs:190-191`), and its own comment states why that
  gate and no other: *"it is the one fact about sleeping that is already saved, already hashed, and
  already the thing `RestSystem` writes, so the two systems cannot disagree about who is asleep."*
  **The break ladder asks the same predicate.**
- **ABLE TO MOVE — has no analogue today**, and it is `TARGET.md:95`'s **T14** exactly (*"Health:
  capacity-gated work (downed ≠ disabled) — missing (M4-4 decides real-or-delete)"*). ⇒ **The able
  half is gated on §10 item 2.** If item 2 answers (C) keep-and-retire-the-display, the precondition
  ships as *awake* only and the charter says so out loud rather than implying a capacity model exists.

> ### ⭐ AND THIS CLOSES ONE OF T12's THREE NAMED REMAINDERS AS A SIDE EFFECT — SAY IT, BECAUSE IT IS FREE
>
> `TARGET.md:93` lists T12's remainders: *"mood still gates no crew behaviour directly … eating loses
> to work … **no mood freeze while asleep**."*
>
> **The third one is a RimWorld concept that does not translate literally — and its meaning does.**
> RimWorld freezes the *bar*; Perilune has no bar, so there is nothing to freeze. What RimWorld
> actually buys with the freeze is that **a sleeping pawn's break risk does not accumulate**. ⇒
> **PAUSE THE DWELL COUNTER WHILE `JobKind == Sleep`.** One clause, on a predicate already shipped
> and already hashed, and it is the honest analogue of the row.
>
> ⚠️ **AND IT IS THE ONE BREAK CLAUSE A PIN CAN SEE** (§2): M3-9 proved the sleep gate is reachable on
> P1's own fixture, so this clause has a real chance of moving P1 for a real reason. **Drive it; do
> not argue it.**

##### (e) D-3 — the argument gate, and ⭐ a second defect on the same line

**D-3 is filed as `ROADMAP.md:140`: *"social argument gate permanently open on every pair →
unscheduled; **file with M4**."*** This is where it lands, because `SocialSystem` is **mood's one
behavioural consumer today** and a break design that gates behaviour on mood cannot leave the
existing gate unexamined.

**MEASURED ON THIS TREE — `sim/Sim.Core/Social/SocialSystem.cs:144-152`:**

```csharp
float lowMood = a.Mood < b.Mood ? a.Mood : b.Mood;
if (lowMood < defs.ArgumentMoodThreshold && opinionAB <= defs.ArgumentOpinionCeiling
    && _roll.NextFloat() < defs.ArgumentChancePerPass)
```

with `ArgumentMoodThreshold = 0f` (`SimDefs.cs:942`, and the parser key at `DefsParser.cs:378`).

⛔ **TWO DEFECTS ON ONE LINE, AND THE SECOND ONE IS NOT IN D-3's FILING:**

1. **The saturated gate (D-3 as filed).** ⚠️ **AND ITS PREMISE MUST BE RE-MEASURED**: D-3's warrant
   was *"mood is permanently ≤ −5"*, which was true **before M3-9 gave `Fatigue` a reducer**. Crew who
   sleep may now cross 0. ⇒ **D-3 may be partly self-healing and nobody has looked.** The break
   package's envelope measurement answers it in passing — **file the answer, do not assume it.**
2. ⭐ **`_roll.NextFloat()` IS A RUNTIME ROLL, and `TARGET.md:63-65` forbids exactly that** in
   outcomes. It is *deterministic in the replay sense* (a forked `SimRng`, so the hash reproduces) and
   *a die in the design sense* (the same world state produces different behaviour). ⛔ **THIS IS NOT
   THIS CHARTER'S TO RULE — the argument mechanic predates the anti-goal and re-litigating a shipped
   system is out of scope for a design package.** ⇒ **FILED, with the receipt.** What IS ruled here:
   ⛔ **THE BREAK LADDER COPIES NEITHER DEFECT.** No saturated threshold (measure the envelope first)
   and no roll (dwell, not rate).

**The ruling path for D-3 itself:** it closes honestly only when there is a social field to argue
about — which is **§10 item 4** (social ignition at thaw) and `perilune-character-simulation.plan.md`
§12.2. **If item 4 is refused, D-3's honest disposition is a re-measured threshold and nothing else**,
and it should be recorded as *accepted, measured, not closed*.

---

#### TWoM-2 · EMERGENT TRIAGE FROM REAL SCARCITY (OD-R clause i)

**OD-R:** *"the sim authors the can't-save-everyone moments (air, food, parts, time genuinely
insufficient at moments; **the O2/CO2 over-thaw punishment is the seed**), NEVER scripted dilemmas and
never dice — **scarcity TUNING becomes chartered M4/M5 work**."*

##### ⛔ THE M4 / M5 SPLIT, RULED

| | M4 | M5 |
|---|---|---|
| **what it does** | ⭐ **builds the INSTRUMENT: the Persona window makes the people distinguishable enough to triage between** | ⭐ **tunes the SCARCITY, and pays it off in the ending** |
| **why here** | you cannot choose *who to wake and who to risk* between people you cannot tell apart. M3-8 authored seven distinct souls and M3-12 drew the numbers; **M4 is where a spread becomes a person** | `ROADMAP.md:98-99` already owns the levers: **M5-1** the ending · **M5-2** alerts · **M5-3** the mid-game goal |
| **what it must NOT do** | ⛔ **M4 SHIPS NO SCARCITY RETUNE** — see §6 | ⛔ never a scripted dilemma, never a die |

**Why the split falls this way and is not a preference.** OD-R's clause (iii) says *"no new milestone,
**queue order stands**"*. The M4 eight are a Persona window and its dependencies; **not one of them is
a content dial.** A scarcity retune inside M4 would be a ninth package that moves no clause of M4's
exit gate — and `PROCESS.md` §2's lane-selection gate calls that shape by name.

##### ⭐ THE TRIAGE THE GAME ALREADY AUTHORS, MEASURED — and it is the proof the clause is buildable

**The can't-save-everyone moment is already on screen and nobody has called it that.** M3-4's POD BAY
prints, per capsule, the gate's own reason **and its number** — including the headroom line
`SCRUBBING COVERS 3 OF 4`. ⇒ **The sim is already telling the player that waking the next person costs
the ones already awake some air.** That is an emergent, computed, un-scripted triage statement
produced by the O2/CO2 balance OD-R names as the seed.

⇒ **M4's contribution is to put the OTHER half of that trade on screen: not just what the ship can
afford, but WHO you would be waking.** The POD BAY says the cost; the Persona window says the person.
**That pairing is the whole TWoM instrument and it needs no new mechanism.**

##### The two mechanisation rules, binding on every M4/M5 package that touches scarcity

1. ⛔ **A triage moment is a STATE THE SIM REACHES, never an event a Director schedules.** The Director
   may schedule *pressure* (it already does — `DirectorSystem.cs:81-88` weights `(1 − Morale)` into
   `Tension` → `WearPressure` → `MachineWearSystem`); it may never schedule a *choice*.
2. ⛔ **A refusal is COMPUTED FROM THAT PERSON'S OWN HASHED STATE, never rolled and never authored per
   instance.** OD-O's authored fault is the counter-example that proves the rule: it is *"an
   AUTHORABLE STORY TOOL … NO systemic per-device fault mechanic"* (`ROADMAP.md` §5 row O) — one
   authored puzzle, censused as exactly one instance. **A break is the opposite: systemic, computed,
   never authored.**

---

#### TWoM-3 · THE GRIEF REGISTER

**The shipped-SHAPED precedent is designed and cited, not invented.**
`perilune-character-simulation.plan.md` §3.2 (`:357-369`) and §3.4 (`:404-431`):

- **Bereavement** — written on `CitizenDiedEvent`, **tier-scaled from the survivor's SOCL tier toward
  the dead at the moment of death**: `1.0` CloseFriend / `0.6` Friend / **`0.15` other**.
- **Grief slows the hand** — an *additive* dawdle term (`Weight × grief_dawdle_s`), modulated by N and
  by **social support** (bond-relief: *"the crew member with friends heals faster"*). ⚠️ The plan
  **retracts** C-damps-grief as folk psychology; do not re-introduce it.
- **Deck aversion (NearDeath)** — auto-work targeting the marked deck is **refused** via stamp-and-skip
  in each source's `Select`; never vetoes Flee/Eat/Drink/current deck; **player orders override**;
  ~4 sim-days at the 96 h half-life. ⭐ **This is already a deterministic, behaviour-gating REFUSAL
  with a player override — the nearest shipped-SHAPED precedent for OD-R clause (ii), and the
  minor-tier break above is deliberately built in its image.**

> ### ⛔ ⭐ AND THE FINDING THAT MATTERS MOST HERE: GRIEF NEEDS RELATIONSHIPS, AND THE SHIPPING SHIP HAS NONE
>
> **Measured.** All seven authored sleepers ship with `Relationships` **deliberately EMPTY**
> (`MECHANICS.md:5818-5824`); no social bond is seeded at thaw (M3-8's own FILED list,
> `…m3.packages.md:240`); the bonds exist **only as prose** in `RaidBackstory`.
>
> ⇒ **On the shipping wreck, every Bereavement mark would form at the "other" tier — weight 0.15 —
> and the grief register would be a rounding error on the one ship players actually play.** Against
> §3.4's own default (`mood_weight_bereavement = 25`, *"comparable to starving, which is the intended
> register"*), 0.15 × 25 ≈ **3.75 mood**: a cosmetic operator by `TARGET.md:66`'s own definition.
>
> ⇒ ⛔ **THE GRIEF REGISTER IS NOT BUILDABLE ON THE SHIPPING SHIP UNTIL SOMETHING SEEDS BONDS — WHICH
> IS §10 ITEM 4, AND IT IS THE SAME ITEM THAT DECIDES D-3, FEUD'S EXISTENCE, AND WHETHER
> `TIES & HISTORY` HAS CONTENT AT THAW.** One question, four consequences: that is why it is in a
> five-item batch.
>
> ⚠️ **And note what it does NOT gate:** the plan's own reachability analysis (§3.2) says
> Bereavement and NearDeath survive a refusal of ignition — *"their warrants are driven hazard
> fixtures, not the social graph"*. **The MECHANISM survives; the REGISTER on the shipping ship does
> not.** Do not let a later lane read *"Bereavement is reachable"* as *"grief is visible on the
> wreck"*.

##### What the Persona window shows of grief, in v1

⛔ **Nothing computed, because nothing computes it yet — and the band says so rather than inventing
it.** The `TIES & HISTORY` band's v1 content is DESIGN QUESTION (d)'s option 1: authored prose bonds +
live edges + an honest empty state. **When the marks engine lands, the residue lines it guarantees are
this band's content** — `perilune-character-simulation.plan.md:400-405`: on expiry a mark's
`Weight = 0` and it *"persists as an inert residue — no behaviour, no mood, still hashed, still
shown (**'Lost Novak, D14' stays in the Persona window**)"*. ⭐ **That sentence is written against this
window. The band is designed to receive it and is not built around it.**

---

#### ⛔ EVERYTHING ABOVE RESPECTS TARGET §2 — THE FOUR-CLAUSE CHECK, ANSWERED ONE BY ONE

| clause (`TARGET.md:63-69`) | how this design satisfies it |
|---|---|
| **no misery meters** | ⛔ **The window draws NO bar and NO number for mood.** DESIGN QUESTION (e) option 2 ships a computed **state line plus what she will refuse**. `dossier-honesty.test.js:138`'s equality-pinned meter census stays green **and is the mechanised proof** |
| **never a bar the player feeds** | there is no mood input anywhere. Mood is a closed-form function of four needs; the player changes the world, not the person |
| **never a runtime roll** | **dwell time, not mean time.** One behaviour per tier, no weighted roster. ⭐ **And the one existing roll — the argument gate's `_roll.NextFloat()` — is FILED, named, and explicitly NOT copied** |
| **never a scripted dilemma** | triage is a state the sim reaches (the POD BAY's own headroom arithmetic), never an event the Director schedules |
| *(and `:66`, the cosmetic-operator rule)* | ⭐ **the HOW SHE IS band's sequencing rule**: it ships with, or after, the first behaviour it can describe. **An adjective that changes no decision does not ship** |

---

#### SEAM (the files this design binds — every one opened on `2e4ce40`)

**The window's own seam.** `client/src/ui/hud.js:195-205` — the four crew seams as they exist:
`selectCrewByCid` (`:195`), `talkSelectedCrew` (`:197`), `openBioForSelected` (`:199-205`),
`enrichCitizen` (`:207-256`, which joins roster `task` + `relations` onto the raw `citizen` payload
and whose header records the `morale:` join as **dead-and-deliberate, kept because morale's future is
M4-4's open decision**). Reached from `client/src/ui/overview-view.js:1656` (`ovTalk`) and `:1658`
(`ovBio`); the buttons are built at `:438-441`.
**The third door:** `client/src/input/controls.js:174-177`, `:284`, `:331`.
**The pins:** `client/test/surface-boundary.test.js:833` (`SHIP_STATE_REACH`, whose last line `:907`
is `'openBioForSelected','selectCrewByCid','selectTab','talkSelectedCrew','toolUsed'`), `:912`
(`FORBIDDEN_REACH`), `:916` (`CREW_INTERACTION`), asserted `:999-1014`;
`client/test/zoom-pawn.test.js:797-816` (the Room Zoom's *"SELECTING is not interacting"* pin).
**The mount:** `client/index.html:144` (`#panels`), `client/styles.css:428`, `:874`, `:1326`, `:1808`.
**The Esc ladder:** `client/src/ui/console-model.js:756`, pinned `client/test/console-model.test.js:650-657`.
**The mood pipeline:** `sim/Sim.Core/Systems/NeedsSystem.cs:190-205` · `sim/Sim.Core/ShipMetrics.cs:86`
· `sim/Sim.Core/Social/SocialSystem.cs:144-152` · `sim/Sim.Core/Director/DirectorSystem.cs:81-88`.
**The person's state:** `sim/Sim.Core/Entities/Citizen.cs:32` (`Health`), `:35` (`Morale`), `:38`
(`Archetype`), `:71` (`Fatigue`), `:72` (`Mood`), `:153` (`WorkIncapable`), `:193` (`SkillsRaw`);
`sim/Sim.Core/Citizens/PersonaSheet.cs` and `Citizens/CitizenMemory.cs:29-46`, `:108-109`, `:127`.
**The Chronicle:** `sim/Sim.Core/Memory/Chronicle.cs:15-26`, `:105-175` (the severity switch),
`sim/Sim.Core/Systems/HistorySystem.cs:54-78`, `:111` (`MaxEntries = 200`).

**PIN IMPACT: NONE — it writes no code.** ⛔ **But it CONSTRAINS `pin/m4-a`, `pin/m4-b` and
`pin/m4-c`**, and §10 items 1, 2 and 4 each decide whether one of those rows exists at all. **Answer
them before a re-pin commit is written, not after.**

**SPINE? No** (docs). It is an integrator-lane merge only in that `ROADMAP.md`/`TARGET.md` status
updates live on the main checkout — **this package touches neither.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | delete a `file:line` citation's claim from the tree (e.g. rename `CREW_INTERACTION`) | ⚠️ **NOTHING IN THIS REPO CATCHES A STALE CITATION IN A DESIGN DOC, and that is the honest answer.** The mitigation is §13's verified-vs-inherited split plus the commit anchor, not a guard. **Do not write a doc-scanning test for it** — `PROCESS.md` §3's budget, and `…m3.packages.md:77-100` records what a half-swept anchor sweep costs |
| 2 | a later lane implements a break table from this document without an owner answer to §10 items 1–3 | ⛔ **refuse it in review.** OD-R's scope clause and `PROCESS.md` §2's *"Never resolve an open owner decision by implementing"* |
| 3 | a later lane quotes `MECHANICS.md` §13.4's mood envelope as the basis for a threshold | ⛔ **refuse it in review** — the numbers carry a MUST RE-MEASURE and the bullet marks itself pre-M3-9 |
| 4 | the Persona window ships with a morale bar | `client/test/dossier-honesty.test.js:138` — equality-pinned census, **already green today and it is the guard** |
| 5 | a second crew-interaction affordance appears anywhere | `surface-boundary.test.js:999` for the hud.js route; ⛔ **NOTHING for the direct-`Cmd` route until M4-2 widens it** (DESIGN QUESTION (b)) |

**ACCEPTANCE.** No browser step; design packages have no demo (`…q3.packages.md:3798-3803`). The
deliverable is (i) **this file**, (ii) an **owner review** producing §10's answers, (iii) the full gate
green in-lane with `git diff -- tests/Perilune.Tests/Golden/ ci.sh content/` at **0 lines** (standing
requirement A), and (iv) the amendments §1's playtest clause names, applied in place and dated.

**CONFLICTS.** None on code. `ROADMAP.md` / `TARGET.md` / `HANDOVER.md` status changes are the
integrator's at merge — **this lane creates exactly one file and touches nothing else.**

**SIZE: L** — thirteen open items, three of which (the break mechanism, the mood-envelope collision,
the third door) required opening files nobody had opened together.

---

### M4-2 — build it: one click, one window

**CLASS: PLAYER** · **LANE: `lane/persona-window`** · **SIZE: L**

> **TODAY THE PLAYER** gets a person's story through **three doors that disagree**: an Overview
> readout that carries the whole task sentence, a `[B] BIO` card that is **four-of-eight fabricated**,
> and a `T` key nobody documented that opens a chat window in a deprecated shell — **and from the Room
> Zoom, where the crew dock lives, there is no readout at all.** **AFTER THIS** one click on anyone,
> from either surface, opens **one window** that says who she is, what she is doing, why, and what she
> can and cannot do — and the other doors are gone, not hidden.

**THE ANALOGUE.** `rimworld-reference.md` §1.6 (the structural absence of an incapable work type) and
§6.1's own surface note, which `MECHANICS.md:5771` names by name: *"RimWorld puts that in the pawn's
Bio tab ('Incapable Of', with the source on hover). **We have no such surface — the Persona window is
M4**."* The window's CONTENT GROUPING is RimWorld's Bio/Health/Needs/Social split (§11); its LAYOUT is
M4-1 DESIGN QUESTION (a).

**SEAM.**
- `client/src/ui/hud.js:199-205` `openBioForSelected` — **replaced**, not joined. ⭐ **The new export
  lands in `hud.js` beside the other crew seams and ON `SHIP_STATE_REACH`** — see §9 coupling 1 for
  why it does not wait for `ship-state.js`.
- `client/src/ui/overview-view.js:438-441` (the `[T]/[M]/[B]` action row) and `:1656`/`:1658` (the
  handlers). ⚠️ **`console-retirement.plan.md:224` says `overview-view.js:234` is the readout's
  primary action button — MEASURED: on this tree the action row is `:437-443` and the buttons are
  `:438` (`data-ov-talk`), `:440` (`data-ov-move`), `:441` (`data-ov-bio`). Re-derive; the doc is
  from July.**
- `client/src/ui/roomzoom-view.js:1035-1100` `paintCrewDock` + `client/src/ui/room-model.js:680-704`
  `shipCrewRows` — the second door. ⛔ **`zoom-pawn.test.js:797-816` pins that `roomzoom-view.js`
  reaches `Hud.selectCrewByCid(` and NONE of `talkSelectedCrew`/`openBioForSelected`/`openPersona`,
  on the stated principle "SELECTING is not interacting" (`:795-796`).** ⇒ **That pin moves in this
  commit and its principle must be re-stated, not deleted**: after M4-2 the Room Zoom DOES open the
  window, so the pin becomes *"the dock reaches the selection flow and exactly one crew-interaction
  seam"*.
- `client/src/input/controls.js:174-177,284,331` — the third door (DESIGN QUESTION (b)).
- `client/src/ui/console-model.js:756` + `client/test/console-model.test.js:650-657` — the Esc rung.
- `client/index.html:144` + `client/styles.css:428,874,1326` — the mount (DESIGN QUESTION (c)).

**PIN IMPACT: NONE expected, and it is provable.** Client-only; check A (`git diff` on
`Golden/`+`ci.sh`+`content/`) must be **0 lines**. ⚠️ **If this package finds it needs a sim read that
does not exist, STOP** — that is a different package and a pin question.

**SPINE? No** for the client. ⚠️ **Yes if it touches `hosts/web/WireFormat*.cs`** — new channels go in
NEW `partial` files and `WireFormat.cs` keeps a zero diff (M3-4/M3-7's precedent).

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | add `openPersonaForSelected` to `CREW_INTERACTION` **beside** the two instead of replacing them | `surface-boundary.test.js:999` — ⛔ **and the failure message is the design contract** (`:1005-1014`): *"the census shrinking to one is the whole point"*. **The census must end at ONE member** |
| 2 | leave `talkSelectedCrew` exported and unreferenced | ⚠️ **nothing catches it today** — `SHIP_STATE_REACH` is computed from actual reaches, so an unreferenced export simply leaves the list. ⇒ **The package must assert the export is GONE, by name** |
| 3 | retarget the `[B]` button but leave `T`/Enter sending `Cmd.talk` | ⛔ **NOTHING CATCHES IT — that is DESIGN QUESTION (b)'s whole finding.** The widened guard ships in THIS commit with a planted-violation control both ways |
| 4 | mount into `#panels` | driven, not scanned: open the window with `body.roomzoom-open` set and assert it is **visible** — a CSS `display:none` is invisible to every DOM-presence test (`panels.js:9` records exactly this lesson: *"a source scan cannot tell a REMOVED meter"*) |
| 5 | rename the Esc rung without moving the pin | `console-model.test.js:650-657`, by construction |
| 6 | draw a mood/morale meter | `dossier-honesty.test.js:138` |
| 7 | truncate the task sentence in the window | driven: assert the window's task text **equals** the roster's `task` field for a label longer than the Overview's 264 px `.ov-task` (`MECHANICS.md:3151` measures the truncation this window exists to end) |

**ACCEPTANCE (in real Chrome, on `--ship wreck` via `./play.sh`, with at least two crew — thaw one
sleeper first).**
1. Click a crew member in the **Overview** → the window opens; the name matches.
2. Read all bands; the task line is the **whole** sentence including its ranking clause.
3. Press **Esc** → the window closes and MOSS/RELATIONS state is untouched.
4. Enter **Room Zoom**, click a crew member in the dock → **the same window opens.** ⭐ **This is the
   step that closes `ROADMAP.md:55`, and a reviewer who skips it cannot tell the package shipped.**
5. Press the retargeted key on a selected crew member → the same window.
6. Confirm the `[T] OPEN CHANNEL — TALK` button is **gone**, not disabled.
7. Open a crew member with an incapable work type (a thawed sleeper — `SleeperAptitudes` gives every
   one of the seven at least one) → **CAN & CANNOT names it.**

**CONFLICTS.** `overview-view.js`/`overview-model.js` (with M4-7, M4-5) · `roomzoom-view.js` (with
M4-6) · `panels.js` (with M4-3) · `surface-boundary.test.js` (three censuses, ONE commit) ·
`controls.js` + `onboarding.js` (with M4-5). See §9.

---

### M4-3 — the dossier stops lying

**CLASS: PLAYER** · **LANE: `lane/dossier-truth`** · **SIZE: M**

> **TODAY THE PLAYER** reads a character sheet where **four of eight sections are invented** — needs,
> standing, backstory and recent memories are drawn from `SAMPLE_*` pools seeded off the cid, and a
> fifth is half invented — each wearing a `◇ SAMPLE` badge that is honest and useless. **AFTER THIS**
> every section is the simulation, or it is not there.

**MEASURED CENSUS, on this tree** (`client/src/ui/panels.js`; the source-of-truth ledger comment is
`:224-247` and it is worth reading whole — it records that `morale` *"USED TO BE LISTED HERE AND IT WAS
WRONG"*):

| section | line | status |
|---|---|---|
| identity band | `:325-334` | **REAL** |
| the `◇ SAMPLE` legend | `:341` | placeholder banner |
| NEEDS (Health/Food/Water/Rest) | `:343-350` | **◇ SAMPLE**, seeded from cid |
| YOUR STANDING (Affinity/Trust) | `:353-361` | **◇ SAMPLE** |
| PERSONALITY | `:363-383` | traits **REAL**; VALUES / FEARS / Speech **◇ SAMPLE** (`:377-383`) |
| RELATIONSHIPS | `:385-403` | **REAL** (joined from `relations`) |
| BACKSTORY | `:404-407` | **◇ SAMPLE** |
| RECENT MEMORIES | `:409-415` | **◇ SAMPLE** |
| CONVERSATION LOG | `:418-433` | **REAL** |

Pools at `:266-284`; deterministic seeding `seeded`/`pick`/`pickN` at `:251-264`; the badge itself at
`:291` and `:367`.

⭐ **THE FINDING THAT SIZES THE PACKAGE, AND IT IS GOOD NEWS: EVERY FABRICATED SECTION CORRESPONDS TO A
FIELD THE SIM ALREADY HOLDS AND THE WIRE DOES NOT CARRY.** Not on any wire today: `Citizen.Mood`,
`Health`, `Fatigue`, `Hunger`, `Thirst`, `Suffocation`, `Archetype`,
`PersonaSheet.Values/Fears/SpeechStyle/RaidBackstory/Secrets`, `CitizenMind.AffinityToPlayer/TrustToPlayer`,
`CitizenMemory.Episodic`. ⇒ **M4-3 is a WIRE-WIDENING package, not a content package** — and the
widening is **host-side, from unhashed mind state**, so it is pin-neutral (§2).

**THE FOUR DISPOSITIONS, one per fabricated section:**

| section | disposition |
|---|---|
| **NEEDS** | ⛔ **DELETE THE METERS.** `TARGET.md:67-69` forbids the bar; M4-1 DESIGN QUESTION (e) replaces them with the computed state line. ⚠️ **`Health` is `◇ SAMPLE` here for a REASON — it is never written** (§13.4); it lives or dies with §10 item 2 |
| **YOUR STANDING** | **REAL, from `CitizenMind.AffinityToPlayer`/`TrustToPlayer`** (`CitizenMemory.cs:108-109`). ⚠️ **§13.9 measures `TrustToPlayer` as DECORATIVE — `SetDisposition` writes it and nothing reads it.** ⇒ **Show it only if it changes something, or do not show it.** Recommend: **cut in v1**, filed with the marks engine |
| **PERSONALITY** (values/fears/speech) | **REAL, from `PersonaSheet`** — the seven authored sheets carry 2 Values, 2 Fears and a `SpeechStyle` each (`AuthoredShips.cs` `WreckSleepers()`) |
| **BACKSTORY** | **REAL, from `PersonaSheet.RaidBackstory`** — 2–5 authored sentences per sleeper |
| **RECENT MEMORIES** | **REAL, from `CitizenMemory.Episodic`** — or **CUT**. ⚠️ **§13.8 measures crew memory FLOODED BY SOCIAL SPAM**; shipping a memory list that reads *"argued with Ozawa"* twelve times is worse than shipping none. ⇒ **Recommend: cut in v1 and file**, unless M4-7's cid-carry (DESIGN QUESTION (f)) makes the Chronicle the better source |

**⭐ RELL.** `SleeperAptitudes.cs:69-73` — she has **no aptitude row and no authored sheet**: she boots
awake rather than thawing, keeps the fleet-wide level-0 default, and gets a **procedurally generated**
persona (`GameSession.cs:175-185` `GeneratePersonas`; pools at `PersonaSheet.cs:96-130`; `RoleNow`
defaults to `"general crew"`). ⇒ ⛔ **THE FIRST PERSON THE PLAYER MEETS HAS THE THINNEST WRITTEN
IDENTITY, AND THE PERSONA WINDOW MAKES THAT MAXIMALLY VISIBLE.** Filed for M4-2/M4-3 at
`MECHANICS.md:5884-5894` and **pinned by assertion**, so authoring her later reddens a named test.
⇒ **RULED (§11): M4-3 authors Rell a sheet at parity with the seven — traits, values, fears, speech,
a backstory. Her SKILL SPREAD stays 0.** M3-8 measured both spread options **pin-neutral** and decided
on design; **the sheet is host state and moves nothing.** Do not re-open the skill question here.

**PIN IMPACT: NONE.** `PersonaSheet`/`CitizenMind` are host-owned and unhashed
(`MECHANICS.md:5786-5793`'s table: the person half is **NO** to hashed).

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | leave a `SAMPLE_*` pool in the file | driven DOM census: **zero `◇ SAMPLE` badges** in the shipped window, plus a source-scan (shipped `codeOnly` stripper + negative control) that no `SAMPLE_*` identifier survives |
| 2 | wire a section to a field the sim never writes | ⚠️ **this is the whole class of bug the package exists to end**, and `panels.js:236-241` already says the rule: *"Do not add a field to this REAL list on the strength of it being on the wire; **ask whether the sim moves it**."* ⇒ **each newly-REAL section needs a DRIVEN leg proving the value CHANGES in a run** |
| 3 | author Rell a skill spread | the M3-8 assertion at `MECHANICS.md:5884-5894`'s pinned site, by construction |
| 4 | update the REAL/SAMPLE ledger comment without changing the code (or vice versa) | `dossier-honesty.test.js:216-286` pins that the prose ledger and the drawing code **agree**, with planted-violation controls both ways |

**ACCEPTANCE.** Open the window on **Rell** and on a **thawed sleeper**; every band is populated from
the sim; **no `◇ SAMPLE` badge exists anywhere in the client** (this is the exit gate's own clause).

**CONFLICTS.** `panels.js` (M4-2 decides whether it survives), `hud.js:207-256` `enrichCitizen`,
`hosts/web/GameSession.cs` + a new `WireFormat.*.cs` partial, `dossier-honesty.test.js`. See §9.

---

### M4-4 — Health / Morale / Archetype: real or delete

**CLASS: PLAYER** · **LANE: `lane/m4-4-health`** · **SIZE: M under (C), L under (A), M under (B)**

> **TODAY THE PLAYER** is shown a person's health and morale and **both numbers are constants** — no
> system has ever written either — while a third field is saved and hashed with no reader anywhere.
> **AFTER THIS** a person's condition either **changes what she can do**, or it stops being displayed.

**MEASURED** (`MECHANICS.md` §13.4, `:2059-2073`; fields at `Citizen.cs:32,35,38`):

- **`Citizen.Health`** — *"Damaged by hypoxia, cold and struggle"* per its own doc comment, and
  **never written by any system.** Saved, hashed, displayed. **Measured 1.00 for everyone after 3 days
  of CO₂ poisoning and near-hypothermia.**
- **`Citizen.Morale`** — never written; **it is the value the CREW WATCH morale bar displayed**;
  measured **1.00 always**. The bar was removed at M1-F and is equality-pinned gone; what survives is
  in the dying console (`hud.js`), which M4-8 deletes anyway.
- **`Citizen.Archetype`** — saved and hashed with **no reader anywhere**.
- **`Persona.RoleNow`/`RolePreRaid`** — §13.5: four readers, all prose/display; **no sim system
  consults a role.**

**⛔ THE OPTIONS ARE §10 ITEM 2 AND THE CHARTER DOES NOT CHOOSE.** What the charter DOES supply is the
pricing, because the batch cannot be answered without it:

| # | option | what it costs | what T14 becomes |
|---|---|---|---|
| **A** | **Health becomes REAL** at RW§6.1's *shape*: written by hypoxia/cold, and gating work through **ONE low numeric floor** — *"a safety net under the curve, not a competence bar"* (`rimworld-reference.md:1401-1412`) | ⛔ **`pin/m4-a`: P1 P2 P3** (hashed state changes from tick 1 on every ship) **+ P4 P5 if the floor is a def field** — recommend a **literal**. Plus a live job-fail condition (RW's `CapableOf` ends a running job when a capacity drops, `:1413-1416`) | **T14 DONE**, minus the body-part tree |
| **B** | **DELETE** Health + Morale + Archetype from the citizen fold | ⛔ **ALSO `pin/m4-a`: P1 P2 P3.** ⭐ **Removing a hashed field moves the fold exactly as adding one does**, plus a CITZ v9→v10 branch and a migration leg | **T14 stays missing, permanently and on purpose** |
| **C** | **KEEP the fields, retire only the DISPLAY** | ⭐ **PIN-NEUTRAL — the only zero-pin option.** The morale bar already dies with M4-8; this just says so deliberately | **T14 stays missing**; the fields stay dead weight in the hash |

⛔ **AND THE HEADLINE THE BATCH NEEDS: THERE IS NO ZERO-PIN OPTION THAT CHANGES ANYTHING.** A and B
both move three pins. Saying so is the point of this charter's contribution to the item.

⚠️ **RW§6.1 EXPLICITLY DECLINES TO SETTLE IT** (`:1410-1412`): *"**Whether Perilune wants that shape is
not a question this document answers.**"* ⇒ **Not settleable from the analogue** — and
`…m3.packages.md:2697` records what happens when a charter settles from an authority that reserved
the question: *"A cited authority that says 'this is an owner decision' is not a source you can settle
from."*

**PIN IMPACT: see §2 row `M4-a`.** **SPINE?** Yes under A or B (`Citizen.cs` + save chapters +
`Simulation.cs` fold) — **integrator lane, alone.**

**MUTATIONS** (under A).

| # | mutation | must go red |
|---|---|---|
| 1 | write `Health` but never read it | ⛔ **the exact defect this package exists to end.** A driven leg: damage a citizen and assert a job she could take before is refused after |
| 2 | make the floor a competence bar (set it high) | a driven leg pinning that a **degraded but above-floor** citizen still takes the job — RW§6.1's *safety-net-not-competence-bar* shape, asserted, not commented |
| 3 | gate at `>=` instead of `>` | `rimworld-reference.md:1370-1374`: **strict `>`**, so a capacity exactly at the floor is NOT capable. One leg at the exact boundary |
| 4 | the pin-neutrality claim is argued, not measured | the 2×2 in §2: floor out of reach ⇒ P1 returns to its old value exactly |

**ACCEPTANCE** (under A). Drive a crew member into hypoxia in the running game; her Persona window's
**CAN & CANNOT** band changes and a running job ends with a named reason. Under C: the morale bar is
gone from every surface and `MECHANICS.md` §13.4 says the fields are kept-but-dead, by decision.

**CONFLICTS.** `Citizen.cs` · `SaveWriter.cs`/`SaveReader.cs`/`Simulation.cs` (⛔ SPINE) · `hud.js`
(the dying bar) · M4-3's NEEDS disposition · the break design's *able-to-move* precondition. See §9.

---

### M4-5 — the onboarding rewrite

**CLASS: PLAYER** · **LANE: `lane/onboarding-rewrite`** · **SIZE: S**

> **TODAY THE PLAYER'S** first card teaches **TALK and BUILD** — one verb that is about to be retired
> and one that is not the loop — on a ship whose actual opening beat is *repair `term_moss`*.
> **AFTER THIS** the card teaches the first three things a new player must do, in the order the ship
> makes them possible.

**SEAM.** `client/src/ui/onboarding.js`, and ⛔ **its own header is a list of the ways this card has
been wrong before — read `:9-27` and `:76-183` before changing a word.** Two constraints are **pinned
by assertion**: `:225-227` — *"ORDER IS LOAD-BEARING AND IS PINNED: `VERBS[0]` is what a new player
reads first"*, and a stricter rule that the card must not carry a **second headline TALK block**.

**Three inherited obligations, all pre-committed:**
1. ⛔ **Must not restore what M2-20 added** (`…q3.packages.md:3825`).
2. ⛔ **The `T` row's fate is DESIGN QUESTION (b)'s** — the card must teach the key that ships, and it
   must land **after** M4-2 (§3), never before.
3. ⛔ **`console-retirement.plan.md:215-217` already ruled the lede**: *"Keep 'Your crew are people' —
   the character simulation is real and is not conversation; the lede should promise **observation and
   relationship**, not typing."*

⚠️ **DELIBERATELY UNDER-SPECIFIED HERE.** The 60-minute playtest (§1) is the only instrument that can
say what a first hour needs, and a card chartered against a guess and contradicted by an hour of
watching is wasted work. ⇒ **This charter fixes the CONSTRAINTS and leaves the CONTENT to the lane,
written against the playtest's notes.**

**PIN IMPACT: NONE** (client copy). **SPINE? No.**

**MUTATIONS.** (1) TALK leads again → the `VERBS[0]` pin. (2) The card names a key `controls.js` no
longer binds → a driven leg asserting every key the card prints is bound in the live keymap. ⭐ **That
leg does not exist today and it is the guard this package should leave behind** — it rides inside a
lane that answers the gate, which is exactly how `PROCESS.md` §2 permits meta-work.

**ACCEPTANCE.** Boot `./play.sh` cold; follow the card literally; **reach the first repair order
without reading anything else.**

**CONFLICTS.** `onboarding.js` + `onboarding.test.js` (with M4-2's key retarget). See §9.

---

### M4-6 — RUG / SHELF

**CLASS: PLAYER** · **LANE: `lane/m4-6-decor`** · **SIZE: S or M — the answer decides**

> **TODAY THE PLAYER** can press SHELF or RUG on the palette and gets an honest refusal, because those
> two tools reach no sim at all. **AFTER THIS** they either build something the ship remembers, or
> they are gone.

⛔ **OD-Q(iii), 2026-08-04, owner-direct — AND THIS CHARTER OBEYS IT BY NOT ASKING:** *"SHELF/RUG keep
the honest refusal until M4-6 — buttons stay on the palette, refusing with the honest sentence;
**wire-or-remove decided AT M4-6, not before**."* ⇒ ⭐ **THE WIRE-OR-REMOVE CALL IS SCHEDULED, NOT
ASKED. It is deliberately absent from §10** and a batch item for it would be a direct contradiction of
a ruling taken four days earlier.

**MEASURED SEAM.** `client/src/ui/roomzoom-view.js:122` — `let _decor = [];` with the comment *"session-local
cosmetic decor (**never hashed, never wired**)"*; merged into the drawn set at `:491`
(`return wire.concat(_decor)`); removal at `:1682`. The honest refusal is at `:1142-1143`: *"⚠️ THE
DECOR TOOLS ARE PERMANENTLY `.cant` and that is not an affordability claim — SHELF and RUG reach no
sim at all, so 'the ship cannot do this' is simply true of them **until M4-6 rules**."* And `:1446`
records the moment they stopped lying.

**PIN IMPACT.** ⛔ **Not decidable here.** "Wire" is a new furniture kind ⇒ a `machines.def` row or a
furniture enum member ⇒ **P4/P5 at minimum**, and hashed placement ⇒ P1/P2/P3. "Remove" is client-only
⇒ **neutral.** ⇒ **The answer at M4-6 decides whether this row joins the pin chain, and if it does it
is a FOURTH pin row in one milestone** — which is past what the chain rule comfortably carries. **Say
that when the call is made.**

**MUTATIONS.** Under remove: the palette census moves and the tool ids leave `roomzoom-view.js`,
`room-model.js` and the onboarding copy **in one commit** (M3-15's OPERATE-deletion precedent, which
also had to sweep the orphans it named). Under wire: the full def ritual plus a **behavioural consumer
test** — *"a def pinned only by the checksum is NOT pinned"*.

**ACCEPTANCE.** Under remove: the buttons are gone and nothing else on the palette moved. Under wire:
place one, reload, it is still there.

**CONFLICTS.** `roomzoom-view.js` (with M4-2). See §9.

---

### M4-7 — the Chronicle is reachable

**CLASS: PLAYER** · **LANE: `lane/chronicle-reachable`** · **SIZE: M**

> **TODAY THE PLAYER** has a CHRONICLE tab on the standard surface that **refuses to be selected**,
> while the ship writes a full day-by-day chronicle that is rendered, cached and replayed on connect —
> the game's stated emotional payload, emitted and unreachable. **AFTER THIS** the tab opens and the
> run has a story you can read.

**MEASURED.**
- **The tab exists and is inert.** `client/src/ui/overview-model.js:342`
  `export const INERT_TABS = Object.freeze(['chron']);`, consulted by `tabIsInert` at `:346`;
  `overview-view.js:85` calls it *"the one still-inert slot"*. ⚠️ **`overview-model.js:352-356` is a
  standing warning about that array** (*"`'work'` MUST NEVER JOIN `INERT_TABS`"*) and the array is
  pinned by `overview-model.test.js` — **the removal and the pin move in one commit.**
- **The channel is complete.** `{type:'chron', days:[{day, headline, lines[]}]}` —
  `messages.js:157-158`; emitted `WireFormat.cs:696-710` on demand (`GameSession.cs:5079`) and on day
  rollover (`:2185`).
- **The renderer is pure and static.** `sim/Sim.Core/Memory/Chronicle.cs:54-64` — no `ChronicleSystem`
  exists; the producer is `HistorySystem` (a **200**-entry ring, `:111`). `Chronicle.cs:52-53` states
  the allocation contract: *"called ON DEMAND … never on a tick path"*. ⛔ **Do not move it onto one.**
- **Three render sites today and the standard surface is none of them**: the deprecated console tab
  (`hud.js:1203-1228`, dies with M4-8), the MOSS FAULT LOG (`moss-model.js:412-430` — ⛔ **its header
  records that the day HEADLINE is deliberately NOT a row there**, so `log` is a filtered fault view
  and **not** the Chronicle), and the inert Overview tab.

⛔ **`hud.js`'s `renderChronBlock` MAY NOT BE REACHED** — it writes console DOM and `hud.js` is a
`CONSOLE_OWNER` (`surface-boundary.test.js:232`). **The standard surface gets its own renderer.**

**THE CID CARRY (M4-1 DESIGN QUESTION (f)) BELONGS HERE.** `HistoryEntry` already carries `SubjectA`
(`HistorySystem.cs:63`) and `SubjectB` (`:66`) — folded into the hashed `'HIST'` chapter — and
`Chronicle.Render` drops them. Carrying them out and onto the wire is **additive, host-side, no hashed
state, no pin**, and it is what lets the Persona window's `TIES & HISTORY` band show *her* lines.
⚠️ **`MECHANICS.md:1708` reserves a Chronicle-ring seam as "M4-7's, not to be re-homed
opportunistically"** — this package owns it; no other may.

**§10 ITEM 5 — THE SEVERITY TIE, measured precisely so the owner is not asked a vague question.**
`Chronicle.cs:105-175` is the ladder: `RunEnded 12 > EmergencyThaw 11 > Eulogy 9 > Death 8 > Thaw 7 >
Construction/Deconstruct/Repair/Commission 6 > **Brownout 5 = OrderDropped 5** > …`, and **ties resolve
to the EARLIEST entry** via the strict `>` in `Render` (`:84`). ⇒ ⭐ **The reported symptom — *"a
brownout usually out-headlines ORDER DROPPED"* (`HANDOVER.md:62`) — is not a severity bug: they are
DELIBERATELY EQUAL and the brownout simply happens first.** The code argues its own tie at length
(`:154-166`) and the crew-tier precedence above it is **owner-ruled** (`:167-170`, pinned by
`DroppedOrderChronicleTests.ADeathAndAThawStillOutrankADroppedOrder`). ⇒ **The batch item is therefore
narrow and honest: keep the tie (earliest wins), or break it toward the dropped order.**

**PIN IMPACT: NONE** (host + client). **SPINE?** Only if the wire tuple changes shape — new fields go
in a NEW partial with `WireFormat.cs` at zero diff.

**MUTATIONS.** (1) Remove `'chron'` from `INERT_TABS` without moving the pin → `overview-model.test.js`.
(2) Render the Chronicle on a tick path → assert `Chronicle.Render` is called only from a request path
(**record the call at the seam, never a text scan** — trap 4). (3) Reach `hud.js`'s renderer →
`surface-boundary.test.js`'s ownership scan. (4) Carry a cid that is not the entry's → a driven leg on
a two-crew fixture where the wrong join would still look plausible.

**ACCEPTANCE.** In the running game: select CHRONICLE → days render with headlines; roll a day →
a new day appears without a reconnect; open a Persona window → **her** lines are there and someone
else's are not.

**CONFLICTS.** `overview-view.js`/`overview-model.js` (M4-2, M4-5) · `hud.js` (M4-8 deletes the old
renderer) · `Chronicle.cs`/`HistorySystem.cs` · `WireFormat*.cs`. See §9.

---

### M4-8 — WP-9: the console shell is deleted

**CLASS: PLAYER** · **LANE: `lane/wp9-console-deletion`** · **SIZE: L**

> **TODAY THE PLAYER** is looking at two games at once: the standard surface, and a deprecated console
> shell that still occupies **roughly 115 of `index.html`'s 154 lines** and still draws crew tables,
> a morale bar that is a constant, and a chronicle tab nobody can reach. **AFTER THIS** there is one
> game on the screen.

⛔ **HARD HUMAN GATE FIRST** (`…q3.packages.md:3710`): *"a person must play `--ship grid` end to end
first — **no agent can be that human**."* And `ROADMAP.md:153`: *"Console retirement WP-9: scheduled
inside M4-8, **not before the Persona re-home**."* ⇒ **It is last in §3 by construction.**
*"Schedule it here; let it slip without guilt."*

**MEASURED PINNED STATE.**
- `CONSOLE_SHELL_ID_CEILING = 43` (`surface-boundary.test.js:584`), asserted `:604`. ⭐ **The test
  FLIPS at WP-9**: once `.app` is gone it becomes a denylist of zero occurrences.
- `CONSOLE_OWNERS = ['src/ui/hud.js', 'src/ui/ship-state.js', 'src/main.js']` (`:232`) — ⭐
  **`ship-state.js` is listed AHEAD OF ITS EXISTENCE, deliberately.**
- `HUD_DOM_LOOKUP_SITES = 38` / `HUD_CREATE_ELEMENT_SITES = 27` / `HUD_HTML_WRITE_SITES = 9`
  (`:707-709`), strict `===`.
- ⭐ **`SHIP_STATE_REACH` (`:833-908`) IS THE SPLIT SPECIFICATION**, by its own words: everything on
  it moves to `ship-state.js`; everything else is chrome and goes. **Its last line (`:907`) is all
  five crew seams**, so M4-2's new export is on the list M4-8 moves — see §9 coupling 1.

**THREE DEBTS THIS PACKAGE INHERITS BY NAME:**
1. ⛔ ⭐ **THE MOSS DOOR — AND THERE ARE THREE OF THEM, NOT ONE.** M3's coupling 7
   (`…m3.packages.md:2382`) cites `overview-view.js:1181`; ⚠️ **MEASURED ON THIS TREE THAT LINE IS
   INSIDE `paintCrewWatch` AND THE CITATION IS STALE.** The reaches are: **`:1645`** (the tab
   dispatch, `Hud.selectTab(d.ovTab)`, with `['moss','MOSS']` in `OV_TABS` at **`:87`**), **`:1443`**
   (`case 'terminal': Hud.selectTab('moss')` — clicking a console on the map, IX-M1), and **`:1652`**
   (`ovCaution` — the ship-status chip → MOSS diagnostics). ⇒ **Deleting `hud.js` deletes the POD
   BAY's only entrance three times over. Re-home first, delete second, in this package** — and
   **re-derive the reach list rather than trusting this one**, which was already wrong once.
2. **The dead OPERATE handlers** — `GameSession.HandleOperate`, `CmdKind.Operate`,
   `WireFormat.Operate.cs`, `OperateVerbTests.cs` — kept deliberately by M3-15 for this sweep
   (`…m3.packages.md:2315-2320`), plus the `ContextAction` family. ⚠️ **CHECK BEFORE DELETING
   `CmdKind.Operate`: renumbering a command enum is not obviously host-side.**
3. **`ContextAction` SILENCE on refused device clicks** (`HANDOVER.md:70`, carried unscheduled) — the
   surviving handlers are this package's, and the silence itself is a refusal-vocabulary question the
   Persona window's design already answers in principle (*a refusal is a sentence*).

**PIN IMPACT: NONE expected**, with the `CmdKind` caveat above. **SPINE?** No for the client; ⚠️ yes
for any command-enum touch.

**MUTATIONS.** (1) Delete `hud.js` without re-homing MOSS → a driven leg opening the POD BAY from a
cold boot. (2) Leave a `CONSOLE_SHELL_ID` behind → the flipped denylist. (3) The reach list moves but
a symbol is dropped → `SHIP_STATE_REACH` re-derived from actual reaches on the merged tree (⛔ **trap
8: re-derive, never carry a branch's number**).

**ACCEPTANCE.** ⛔ **A HUMAN plays `--ship grid` end to end first.** Then: boot, and every verb the
standard surface offers still works — the MOSS door, the POD BAY, the Chronicle, the Persona window,
the WORK tab, build/erase/prioritise.

**CONFLICTS.** ⛔ **Everything.** It is last for that reason. See §9.

---

### ⭐ M5-1 — FORWARD CHARTER: the ending *(written at M4 open, per OD-R; M5's full document is written at M4's end)*

**CLASS: PLAYER** · **LANE: `lane/m5-1-ending`** · **SIZE: M** · ⚠️ **FORWARD CHARTER — it fixes the
SHAPE and the inherited debts, not the acceptance script.** OD-R's binds cell names *"M4-1 **and
M5-1** charters"* together because **the ending is where the TWoM pillar is paid off**, and a payoff
designed after the mechanisms is a payoff bolted on.

> **TODAY THE PLAYER** reaches the end of a run and gets **a one-line banner**. **AFTER THIS** the run
> ends on a screen that names every soul aboard — who woke, who never did, and what it cost.

**WHAT IS ALREADY BUILT, MEASURED — M5-1 is the second half of a package that shipped.** OD-M item 4 =
**A**: *"sim state + Chronicle lines + a one-line banner; **M5-1 builds the screen**"* (`ROADMAP.md:117`).
M3-5 shipped: `RunEnded` sim state inside `CryoSystem`, the emergency-thaw reprieve, the Chronicle
line, a one-line Overview banner, and the **`ending` wire channel** in its own partial
(`hosts/web/WireFormat.Ending.cs` — verified present on this tree). ⇒ **M5-1 is a SCREEN over a
channel that exists.**

**THE SHAPE, and it is TWoM's rather than a win screen's.**

| the screen says | from |
|---|---|
| **WHO IS ALIVE**, by name, with what she can do | the roster + `workcaps`, i.e. exactly the Persona window's IDENTITY and CAN & CANNOT bands |
| **WHO NEVER WOKE**, by name | ⭐ **the capsules already carry the names** — `AuthoredShips.cs` authors `Name = "pod_" + who` and M3-1 pinned `Device.Name` **immutable after boot**, so a sealed capsule at run's end still says whose it was |
| **WHAT IT COST** | the Chronicle's own day headlines — `RunEnded 12 > EmergencyThaw 11 > Eulogy 9 > Death 8 > Thaw 7` (`Chronicle.cs:127-140`) IS a run summary, already ordered by what mattered |
| **the condition it ended on** | `…q3.packages.md:3723` — *"a 'the ship is yours' state with a **stated condition**"* |

⛔ **A DEBT M5-1 INHERITS BY NAME, FROM M3-5's OWN FILED LIST:** *"both new HistoryKinds render
`[Note]` severity 0 (the ENDING can never be a day headline — **owes a Chronicle change**)"*.
⭐ **MEASURED ON THIS TREE: THE DEBT IS PAID.** `Chronicle.cs:127-128` now reads
`HistoryKind.RunEnded => 12, HistoryKind.EmergencyThaw => 11`, and the surrounding comment records the
sweep — *"FIVE KINDS BELOW EXISTED WITH NO ROW AT ALL UNTIL THIS PACKAGE (EmergencyThaw and RunEnded
since M3-5, filed at MECHANICS §13.35): they fell through to 0 and rendered as '[Note]' … Swept as a
CLASS rather than added one at a time."* ⇒ **Do not re-file it.** ⭐ *This is a filed debt that a
later, unrelated lane discharged, and the only way to know was to open the file.*

**Other M3-5 residuals M5-1 must not re-discover:** the deck term of the emergency tie-break is
behaviourally inert (all 12 capsules z=0) · a capsule with nowhere to open holds the ending open
forever (unreachable today) · a crewless loaded save names *"a crew member"* · **the Overview does not
repaint while MOSS is up** (pre-existing, general — ⚠️ **and the ending banner is an Overview
element**).

**PIN IMPACT: NONE expected** — a screen over an existing channel. ⚠️ **Unless it needs a fact the sim
does not record** (e.g. *"how many capsules never cycled"* — check before assuming; the capsules are
`Device`s and their state is already hashed).

**CONFLICTS (forward).** `overview-view.js` (the banner it replaces) · `WireFormat.Ending.cs` ·
`Chronicle.cs` (with M4-7). ⭐ **And the largest one is not a file: M5-1's roll-call is the Persona
window's content in a different frame.** If M4-2 ships five bands and M5-1 re-derives the same
sentences from the same channels, they will drift. ⇒ **M5-1 reuses M4-2's identity/state composition,
or it states in its own charter why it cannot.**

---

## 6. WHAT THIS MILESTONE DELIBERATELY DOES **NOT** BUILD

*Recorded so a future reader can tell **excluded** from **missed**.*

- ⛔ ⭐ **A SCARCITY RETUNE.** OD-R clause (i) makes scarcity tuning *"chartered M4/M5 work"*; **this
  charter puts it in M5** (§5's TWoM-2 ruling) because not one of the M4 eight is a content dial and
  a ninth that moved no exit-gate clause is the shape `PROCESS.md` §2 names as meta-work. **M4 builds
  the instrument; M5 turns the dial.**
- ⛔ **A BREAK TABLE, A MISERY METER, OR ANY BREAK CODE — before §10 items 1–3 are answered.** OD-R's
  own scope clause. This document designs; it does not authorise.
- **The MARKS ENGINE** (`perilune-character-simulation.plan.md` §3) — the hashed 16-slot mark array,
  its decay, its events, `MoodPressure`. **The break ladder is designed to receive it and does not
  require it** (§5 TWoM-1's v1/v2 table). Unscheduled; not an M4 package.
- **AXIS DRIFT** (char-sim §12.1), **the N band** (§12.3), **Openness's seams** (§12.4). ⭐ **These are
  open on the owner and are DELIBERATELY NOT IN §10's BATCH**, because none of them blocks an M4
  package: nothing in M4-1…M4-8 flees, wanders or drifts. ⚠️ **§12.4 already resolves itself without a
  ruling** — *"absent a ruling, the rule decides"* (O ships iff its recruitment-latency test passes).
  **Asking a question that blocks nothing is how a five-item batch becomes an eight-item batch.**
- **A per-person MEMORY channel** (`CitizenMemory.Episodic` on the wire) — M4-1 DESIGN QUESTION (f)
  option 3. It is the better long answer for `TIES & HISTORY` and it is a package, not a clause.
- **A CONVERSATION TRANSCRIPT in the Persona window** — ruled out for v1 (§11). ⛔ **And everything
  `console-retirement.plan.md` §1.5.5 lists stays**: `sim/Sim.Llm/`, `ConversationHub.cs`,
  `sim/Sim.Core/Effects/` (**a spine file — *"the only validated path from any narrative source into
  the sim, and the Persona window will need it"***), `CitizenMemory.cs`, `PersonaSheet.cs`/`Eulogy.cs`,
  the host's `talk`/`say`/`bye` parse, the `chat` channel, and `chat.js` retained-unwired. **A cleanup
  lane that deletes any of it is deleting the integration surface, not dead code.**
- **A MOSS noun for the Persona window.** OD-P reserves nouns (*"Future MOSS-OS expansion … is VISION,
  not chartered scope — never implement from this row"*), and the window is a standard-surface
  artifact reached from the Overview. **If it is ever reachable through MOSS it is a TYPED noun with
  its own charter row** — do not assume it.
- **Terminal styling for the window.** It is not a MOSS screen; it does not wear phosphor. Stated so
  nobody skins it by analogy.
- **Passions, skill XP, skill decay** (RW§5.1) — M3 excluded them and M4 does not re-open them.
  **Nothing levels**; the spread is for the run (`MECHANICS.md` §13.39.5).
- **Quality and failure rolls** (RW§5.1) — `TARGET.md:63-65`.
- **RimWorld's THOUGHT STACK, expiry model and mood rate limiter** (RW§4.3, §8.6's collision).
  ⭐ **The break LADDER is adopted; the mood ARCHITECTURE under it is not.** Mood stays closed-form and
  memoryless; the dwell counter is the rate limiter.
- **A body-part tree or a capacity model** (RW§6.1's full shape). Even under §10 item 2 = A, M4-4
  ships **one floor**, not `PawnCapacitiesHandler`.
- **The radiator/heater shared silhouette** and the **Room Zoom furniture flicker** — both **M5-4
  art-pass shaped, not M4**, unless the Persona window introduces its own art (it should not; it
  reuses `pawnChip`/`portraits.js`). ⚠️ *The radiator's art is an OWNER call, not a seam call*
  (`MECHANICS.md:5522-5530`).
- **Save/load** (M5-7) · **the device-removal hole** (M5-6) · **the vertical gas term** (OD-E) —
  standing, owner-accepted.
- ⛔ **THE SHELF/RUG WIRE-OR-REMOVE CALL IS NOT EXCLUDED — IT IS SCHEDULED.** OD-Q(iii) puts it **at**
  M4-6. It appears here only so a reader does not look for it in §10.

---

## 7. TARGET ROWS THIS MILESTONE MOVES

| row | today | after M4 |
|---|---|---|
| **T16** Persona window (ONE door to a person) | `queued (M4-1/M4-2)` | **DONE** (M4-2 + M4-3) — the exit gate's own sentence |
| **T12** needs/mood: mood as consequence, not meter | `partial` — rest DONE, *"mood still gates no crew behaviour directly"* | ⭐ **depends entirely on §10 item 1.** Under (a)/(b): **the sleep-pause clause lands and the first break behaviour ships ⇒ T12's headline remainder CLOSES.** Under (c): **T12 does not move**, and the row should say *"designed, deferred to M5"* rather than staying silent |
| **T14** Health: capacity-gated work | `missing (M4-4 decides real-or-delete)` | ⭐ **the row's own sentence is satisfied EITHER WAY — it says "decides".** Under A: **DONE** minus the body-part tree. Under B: **struck**, permanently, on purpose. Under C: **still missing, by decision** |
| **T8** a refused order says WHY | `partial` | ⭐ **partial →** the Persona window is the first surface that answers *why* **for a person** rather than for a tile; and a break refusal is a new refusal that must carry a sentence from day one |
| **T11** skills gate output, never whether | DONE | **reaches further** — the CAN & CANNOT band is the *"Incapable Of"* surface `MECHANICS.md:5771` filed as missing |

⛔ **AND SAY THE GAP OUT LOUD, BECAUSE M3 FOUND THE SAME ONE:** `…m3.packages.md:2335-2345` recorded
that M3-15 and M3-16 moved **no** `TARGET.md` row — *"there is no row they map onto … that is a GAP IN
THE CHECKLIST, not a defect in the packages"*. **M4 has three of those: M4-5 (onboarding), M4-6
(decor) and M4-8 (console deletion) move no row.** ⚠️ **The checklist has no row for *what the player
is taught*, for *what the palette promises*, or for *how many games are on the screen at once*.** ⇒
⛔ **FILED FOR THE INTEGRATOR, NOT FIXED HERE.** `TARGET.md` is not this lane's file, and *"inventing a
row to score ourselves against is the failure `PROCESS.md` §0 exists to prevent"* — writing the row to
fit the package is the same error backwards.

---

## 8. M4's FIVE-MINUTE DEMO

**Owned by M4-2**, run by the integrator on the merged tree after position 3 (M4-3), because the
`◇ SAMPLE` clause of the exit gate is M4-3's. The falsifying script is M4-2's ACCEPTANCE steps 1–7
plus M4-3's.

```
1. ./play.sh (--ship wreck).  Click Rell in the Overview.
      → ONE WINDOW: name, role, where, traits, the whole task sentence, why.
2. Read HOW SHE IS.  Read CAN & CANNOT.
      → no ◇ SAMPLE badge anywhere; a work type she can never do is NAMED, with its source.
3. Esc.  Enter Room Zoom.  Click a crew member in the dock.
      → THE SAME WINDOW.  ⭐ this is the step that closes ROADMAP.md:55.
4. Thaw a sleeper (POD BAY, as T13's witness run did).  Open her.
      → a DIFFERENT PERSON: different traits, different backstory, a different CAN & CANNOT.
5. Open CHRONICLE on the Overview.
      → the run's days, with headlines.  Open her window again → HER lines are in TIES & HISTORY.
```

⛔ **STEPS 3 AND 4 ARE THE ONES A REVIEWER WHO SKIPS CANNOT TELL THE MILESTONE SHIPPED.** Step 3 is
the second door; step 4 is the whole claim that two people read differently — and it needs a real
thaw, which needs the M3 chain, which is why the demo runs on the wreck and not on a fixture.

⛔ **THE FALLBACK, STATED NOW SO IT IS A DECISION LATER AND NOT AN IMPROVISATION:** if the schedule
slips, ship **M4-2 + M4-3 + M4-7** and let M4-5/M4-6/M4-8 slip. **Do not instead drop M4-3**: a
Persona window with four fabricated sections fails the exit gate's own `◇ SAMPLE` clause and is worse
than the dossier it replaced, because it is bigger. ⚠️ **And if §10 item 1 defers the breaks, the
demo's step 2 says *four* bands and the milestone reports the *how she is* clause as PARTIAL** — see
M4-1 DESIGN QUESTION (e)'s sequencing rule.

---

## 9. THE CONFLICT MATRIX — files with more than one claimant

| file / area | claimants | rule |
|---|---|---|
| ⭐ **`client/test/surface-boundary.test.js`** | **M4-2** (THREE censuses), **M4-8**, M3-4 ✅, M3-12 ✅, M3-15 ✅ | ⛔ ⭐ **THE SHARPEST ROW IN THE TABLE. `SHIP_STATE_REACH` (`:833-908`), `CREW_INTERACTION` (`:916`) and `FORBIDDEN_REACH` (`:912`) MUST MOVE IN ONE COMMIT WITH M4-2** — the reach is COMPUTED from actual reaches, so adding the export changes `SHIP_STATE_REACH` whether or not anyone edits it, and removing two changes `CREW_INTERACTION` the same way. ⚠️ **`FORBIDDEN_REACH` is the third because it carries a NON-VACUITY assertion** (`:991-993`: at least one member must still be a real hud.js export) — **a package that deletes hud.js exports can silently empty that guard.** ⛔ **Re-derive from the MERGED file with the shipped `codeOnly` stripper; never adjust either branch's figure** (trap 8). |
| ⭐ **`client/src/ui/hud.js`** | **M4-2** (the new seam + removing two), **M4-8** (deletes the file), M4-3 (`enrichCitizen`) | ⛔ **Serialize: M4-2 → M4-3 → M4-8.** ⚠️ **The DOM counts 38/27/9 (`:707-709`) are strict `===`** — a seam that adds a `createElement` reddens them. **M4-2's window must not create DOM inside hud.js**; the seam is a function that hands off. ⛔ **M4-8 must re-home the MOSS door — THREE reaches, not one** (`overview-view.js:1645` tab dispatch · `:1443` `case 'terminal'` · `:1652` `ovCaution`; ⚠️ **M3's `:1181` citation is STALE on this tree**) or deleting the shell deletes the POD BAY's only entrance (coupling 7, inherited from M3). |
| `client/src/ui/overview-view.js` · `overview-model.js` | **M4-2** (readout + actions), **M4-7** (`INERT_TABS` + the tab), **M4-5** (the card), M3-12 ✅, M2-3/M2-20 ✅ | ⛔ **Serialize: M4-2 → M4-7 → M4-5.** ⚠️ ⛔ **`'work'` MUST NEVER JOIN `INERT_TABS`** (`overview-model.js:352-356`, the file says so itself). |
| `client/src/ui/roomzoom-view.js` · `room-model.js` | **M4-2** (the dock opens the window), **M4-6** (decor), M3-15 ✅, M3-13 ✅, M2-10 ✅ | ⛔ **Serialize.** ⚠️ **`zoom-pawn.test.js:797-816` pins that this file reaches NO crew-interaction seam** — M4-2 inverts that pin **and must re-state its principle** (*"SELECTING is not interacting"*, `:795-796`), not delete it. |
| ⭐ `client/src/input/controls.js` · `client/src/ui/onboarding.js` | ⭐ **M4-2** (retarget `T`/Enter), **M4-5** (the copy) | ⭐ **New row, and it is a two-file fact with no compiler between them.** The card prints key names as **strings**; the keymap binds them in **code**. **Order: M4-2 then M4-5**, and M4-5 leaves behind the driven leg that every key the card prints is bound (§5 M4-5). |
| ⭐ `client/index.html` · `client/styles.css` | ⭐ **M4-2** (the `#persona` mount), **M4-8** (deletes `.app`, ~115 of 154 lines) | ⭐ **New row.** ⛔ **M4-2's mount must be a body-level sibling, NOT inside `.app`** — otherwise M4-8 deletes the Persona window. `styles.css:874` / `:1326` are the two hide rules that made `#panels` unusable; **the new container must not inherit either.** |
| `client/src/ui/panels.js` · `client/test/dossier-honesty.test.js` | **M4-2** (supersedes the card), **M4-3** (truth), **M4-8** (the dialogue window dies) | ⛔ **Serialize: M4-2 → M4-3 → M4-8.** ⚠️ **`dossier-honesty.test.js:138`'s meter census and `:216-286`'s ledger/code agreement pins are the guards against re-adding a morale meter — they must survive the file's replacement, re-pointed at whatever draws the person.** ⭐ **A pin deleted with the file it pinned is a pin deleted.** |
| `client/src/ui/console-model.js` · `client/test/console-model.test.js` | **M4-2** (the Esc rung), **M4-8** | Serialize. The `escapeTarget` ladder is pinned value-by-value (`:650-657`); rename and re-pin in ONE commit. |
| ⭐ `sim/Sim.Core/Entities/Citizen.cs` | ⭐ **M4-4** (`Health`/`Morale`/`Archetype`), ⭐ **the break row** (the dwell counter + the catharsis reprieve), M3-7 ✅, M3-9 ✅ | ⛔ **SPINE-adjacent and STRICTLY SERIALIZED — two pin rows on one struct.** ⚠️ **Standing refusal carried from M2-2: `IsRecruitableForWork` MUST NOT absorb the work grid** — and the break gate must not absorb it either. **A break is its own named predicate.** |
| ⭐ `sim/Sim.Core/Systems/NeedsSystem.cs` | ⭐ **the break row** (reads `Mood`; later receives `MoodPressure`) | ⭐ **New row.** ⛔ **The memoryless contract is load-bearing and stated in the file** (`:194-196`): *"Fully recomputed every pass — Mood holds no history of its own, so **nothing else may write it** and expect the value to survive a second."* **The dwell counter lives OUTSIDE mood.** |
| ⭐ `sim/Sim.Core/Social/SocialSystem.cs` · `content/core/SimDefs/social.def` | ⭐ **D-3's ruling** (§10 item 4's tail) | ⭐ **New row.** ⛔ **`argument_mood_threshold` is a DEF FIELD** (`DefsParser.cs:378`, `SimDefs.cs:565`, folded at `:1228`) ⇒ **changing its default moves P4/P5.** Do not "just retune it" in someone else's lane. |
| `sim/Sim.Core/Memory/Chronicle.cs` · `Systems/HistorySystem.cs` | **M4-7** (the cid carry + the severity tie), M5-1 | ⛔ **M4-7 owns it** (`MECHANICS.md:1708`). ⚠️ **The severity switch is heavily argued in comments and OWNER-RULED in two places** (`:167-170`) — an edit that does not update the argument beside it is a lie in a file whose comments are the record. |
| `hosts/web/GameSession.cs` · `hosts/web/WireFormat*.cs` | **M4-3** (the widening), **M4-7** (chron fields), M4-4, M3-* ✅ | ⛔ **SPINE — integrator. New channels go in NEW `partial` files; `WireFormat.cs` keeps a zero diff.** ⚠️ **The `DeviceCell`/`BlockedCell` lesson: a merge that broke a wire tuple was a SILENT AUTO-MERGE on a field list, not a conflict git flagged.** |
| `ci.sh` · `CLAUDE.md` · `MECHANICS.md` · `HANDOVER.md` · `Golden/` | **M4-1** (none — it touches none of them) and **every re-pin commit** (M4-4, the break row, social ignition) | ⛔ **Integrator only.** ⭐ **M4-1 is listed here to record a DELIBERATE NON-CLAIM: this lane creates exactly one file.** |

### ⭐ THE COUPLINGS GIT CANNOT SEE

| # | pair | the shared thing | what it costs if ignored |
|---|---|---|---|
| ⭐ **1** | **M4-2 ↔ M4-8** | ⭐ **`openPersonaForSelected`'s HOME — and this is the milestone's one ordering circle** | `console-retirement.plan.md:224-229` puts the seam in **`ship-state.js`**, which does not exist until M4-8 splits `hud.js`; M4-8 must not run before the Persona re-home (`ROADMAP.md:153`). ⛔ **THE CUT, CHARTERED: M4-2 lands the seam IN `hud.js`, ON `SHIP_STATE_REACH` — the list whose own header says it IS the split specification (*"everything on this list moves to ship-state.js"*) — and M4-8 moves the whole list at once.** Neither package waits. ⚠️ **If M4-2 instead creates `ship-state.js` early, `CONSOLE_OWNERS` (`:232`) already names it and several tests short-circuit on `readOrNull('src/ui/hud.js')` returning null — a half-split tree is the worst of both.** |
| ⭐ **2** | **M4-2 ↔ the break row** | ⭐ **the HOW SHE IS band** | **No shared file.** M4-2 ships the band's frame; the break row ships the only thing that can honestly fill its second clause. ⛔ **If they land out of order the band is an adjective that changes nothing — a cosmetic operator, banned by `TARGET.md:66` and by OD-R's own amendment.** ⇒ **§10 item 1's answer sets the order, and M4-2's charter carries the four-band fallback.** |
| ⭐ **3** | **the break row ↔ M4-4** | ⭐ **the "able to move" precondition** | RW§4 requires *awake **and able to move***. The awake half is free (M3-9's `JobKind` gate); **the able half exists only if M4-4 answers (A).** ⇒ **Under (B) or (C) the break package ships the precondition as *awake only* and SAYS SO** — a half-quoted analogue is how a rule becomes folklore. |
| ⭐ **4** | **the break row ↔ M3-14 (landed)** | ⭐ **`Citizen.HeldByOrder` — the SAME FIELD, read in OPPOSITE directions** | M3-14's rung 2 says *a held order bypasses `CanStageWorkerAt`*; the minor-tier break says *not for her, not now*. **Two readers of one flag with no compiler between them.** ⚠️ **M2-19 measured that the hold's whole bite is the pre-emption path and that neither read point is individually pinned — the PROPERTY is** (`…m3.packages.md:2400`). ⇒ **The break package adds a read point and must re-pin the property from the new site.** ⭐ **And §10 item 3 is exactly this coupling asked as a design question.** |
| ⭐ **5** | **the break row ↔ D-3 / `SocialSystem`** | ⭐ **`Citizen.Mood` as a BEHAVIOUR GATE — the second one ever** | Today mood gates exactly one behaviour and **its gate is saturated and rolled**. A second gate on the same scalar, built correctly beside a first one built wrongly, invites a later lane to "make them consistent" in the wrong direction. ⇒ **The break package states in its own header that it does NOT copy the argument gate, and why.** |
| ⭐ **6** | **M4-3 ↔ §10 item 2** | **the NEEDS band's `Health` row** | M4-3 must decide what NEEDS becomes, and one of its four meters is a field M4-4 may delete. ⇒ **M4-3 ships the band WITHOUT `Health` under any answer** — the state line is composed from `Hunger`/`Thirst`/`Fatigue`/`Suffocation`, which are all genuinely written. **Then item 2's answer changes nothing in M4-3.** ⭐ *A dependency dissolved by scoping is better than a dependency serialized.* |
| ⭐ **7** | **M4-2 ↔ M4-5 ↔ `controls.js`** | **the key the card prints** | Three artefacts, one fact, two of them strings. See the matrix row; the driven leg is the fix. |
| ⭐ **8** | **M4-7 ↔ M4-2** | **the cid carry** | M4-7 adds `SubjectA`/`SubjectB` to the `chron` wire **for M4-2's band**, and M4-2 merges FIRST. ⇒ **M4-2's `TIES & HISTORY` band ships with the history half EMPTY and honest** (*"no chronicle entries name her yet"*), and M4-7 fills it. ⛔ **Not a stub — an honest empty state**, the same rule DESIGN QUESTION (d) applies to relationships. |
| ⭐ **9** | **M4-6 ↔ OD-Q(iii)** | **the ruling's TIMING** | The call is taken **at** the row. ⇒ **A lane that arrives at M4-6 with the answer already assumed has broken an owner ruling from four days earlier**, and no test will say so. |
| ⭐ **10** | **M4-8 ↔ the MOSS door (inherited coupling 7 from M3)** | ⭐ **THREE reaches into `Hud.selectTab('moss')`**: `overview-view.js:1645` (tab dispatch, `OV_TABS` at `:87`) · `:1443` (`case 'terminal'`) · `:1652` (`ovCaution`) | **Deleting `hud.js` deletes the POD BAY's only entrance.** Named twice in M3's file — ⚠️ **and BOTH times against `:1181`, which is stale on this tree (§12.16).** *A coupling carried forward by citation rather than by measurement is a coupling nobody has re-checked.* |
| ⭐ **11** | **every M4 package ↔ the 2026-08-07 playtest** | ⭐ **the charter itself** | §1's playtest clause. **A lane that implements this document without checking whether the playtest amended its section is implementing a draft.** ⇒ **The integrator dates every amendment in place**, and a lane's first act is to read the section's date. |
| ⭐ **12** | **M4-3 ↔ `dossier-honesty.test.js`** | ⭐ **guards that outlive the file they guard** | If M4-2/M4-3 delete `panels.js`, the meter census and the ledger-agreement pins have nothing to scan and **pass vacuously** — a search that finds nothing and a search that cannot find anything look identical. ⇒ **Re-point them at the Persona window in the same commit, with a planted-violation control proving they still bite.** |

---

## 10. THE M4 OWNER-DECISION BATCH

**One batch per milestone. ⭐ FIVE items. One message. Three-day default-to-recommendation.**
Everything settleable from an existing OD or from `rimworld-reference.md` **has been settled and
cited** — **§11 lists twelve such questions**, so the batch is not padded with things that already
have answers.

> ⚠️ ⭐ **EVERY ITEM STATES ITS SILENCE DEFAULT, NOT JUST ITS RECOMMENDATION — AND THAT IS M3's OWN
> LESSON.** M3's batch was **affirmatively adopted** (*"Owners follows all recommendations"*), which
> mattered because **item 2's silence default was the OPPOSITE of its recommendation**
> (`…m3.packages.md:2416-2419`). A three-day silence is an answer, and it is not always the
> recommendation.
>
> ⚠️ ⭐ **AND THE BATCH IS NOT THE MILESTONE'S COMPLETE DECISION SET.** *"One owner-decision batch per
> milestone"* is a rule about how we **ASK**; it is not a promise the owner will only answer in
> batches. **OD-N and OD-O each arrived owner-direct, hours apart, on the day M3's batch was answered,
> and each added a package.** ⛔ **`ROADMAP.md` §5 is the decision authority, not this section**, and
> a later owner-direct ruling is never back-dated into the table below.
>
> ⛔ ⭐ **TWO THINGS ARE DELIBERATELY NOT ASKED HERE, and saying so is what keeps the batch honest:**
> **(1) the SHELF/RUG wire-or-remove call** — **OD-Q(iii) already ruled that it is decided AT M4-6**,
> so asking it now would contradict a four-day-old ruling; **(2) char-sim §12's items 1, 3 and 4**
> (axis drift · the N band · Openness) — **they block no M4 package**, §12.4 resolves itself absent a
> ruling, and a question that blocks nothing does not belong in a milestone's one batch.

---

**ITEM 1 — WHERE DOES THE FIRST MENTAL BREAK BUILD?**
*(binds §3 position 4b, T12, and M4-2's HOW SHE IS band; blocks the pin chain's second row)*

⛔ **THE PROBLEM IN ONE SENTENCE: OD-R directs the break DESIGN into M4-1 and never names the package
that BUILDS it.** OD-R (iii) says *"no new milestone, queue order stands"*, and the M4 queue is eight
packages, **none of which is a break**.

| # | option | cost | consequence |
|---|---|---|---|
| **A** | ⭐ **A NINTH PACKAGE, `M4-9` — the first mental break** (PLAYER, pin row `pin/m4-b`) | one package, one pin row, one re-pin commit | **T12's headline remainder CLOSES in M4.** M4-2's HOW SHE IS band ships complete. ⭐ **RECOMMENDED** |
| **B** | **Fold it into M4-4** | no new id | ⛔ **M4-4's own question is *real or delete* — and one of its answers is DELETE.** A package that might delete its subject is a bad host for a mechanism that depends on it. **And it makes one package answer two questions**, which is how a send-back becomes two send-backs |
| **C** | **Defer the build to M5** | none in M4 | **T12 does not move in M4**; M4-2 ships **four** bands and the exit gate's *how she is* clause is reported **PARTIAL**. ⛔ **SILENCE DEFAULT** — it is the strict reading of *"queue order stands"* |

**RECOMMEND A.** The mechanism is designed, the seams exist (M3-14's rung 2 read backwards; M3-9's
sleep gate), and it is the row that carries OD-R's amendment into the game rather than into a
document. ⚠️ **But it is the row §3 names as the first to slip if the playtest squeezes the
milestone** — and under C nothing is lost except time, because the design is written either way.

---

**ITEM 2 — `Citizen.Health` / `Morale` / `Archetype`: REAL, DELETE, OR KEEP-AND-STOP-SHOWING?**
*(binds M4-4, T14, M4-3's NEEDS band, the break design's "able to move" precondition; blocks §3 position 4)*

**Measured:** all three are **saved and hashed**; none is **ever written**; `Health` measures **1.00
after 3 days of CO₂ poisoning**, `Morale` **1.00 always**, `Archetype` has **no reader anywhere**
(`MECHANICS.md` §13.4).

| # | option | pins | T14 |
|---|---|---|---|
| **A** | ⭐ **REAL** — `Health` written by hypoxia/cold, gating work through **ONE low floor** (RW§6.1's safety-net shape, `:1401-1412`); `Morale`/`Archetype` still deleted or still dead | ⛔ **P1 P2 P3** (+P4/P5 if the floor is a def field — **recommend a literal**) | **DONE**, minus the body-part tree |
| **B** | **DELETE all three from the fold** | ⛔ **P1 P2 P3** + a CITZ v9→v10 branch | **struck, permanently** |
| **C** | **KEEP, retire only the DISPLAY** | **NONE** | **still missing, by decision** |

⛔ **THE FACT THE ANSWER TURNS ON: THERE IS NO ZERO-PIN OPTION THAT CHANGES ANYTHING.** A and B both
move three pins; only C is free, and C changes nothing about the game.

**RECOMMEND A**, because *"downed ≠ disabled"* is the last RimWorld-parity mechanism the phase-1 loop
is missing, because it gives the break ladder its *able-to-move* half, and because a hashed field that
is never written is a lie the save file carries. ⛔ **SILENCE DEFAULT: C** — the cheap, honest,
non-committal answer, and it leaves T14 exactly where it is.
⚠️ **RW§6.1 explicitly declines to settle this** (`:1410-1412`), which is why it is an owner item and
not a §11 row.

---

**ITEM 3 — ⭐ MAY A PLAYER ORDER OVERRIDE A MENTAL BREAK?**
*(binds the break roster, M3-14's ladder, T5/T6, and the whole feel of the pillar)*

⛔ **THE COLLISION, AND IT IS HEAD-ON.** RimWorld: *"a broken pawn's name turns green, **the player has
no control**, and the break ends by expiry, by arrest, by beating them down, or by a psycast"*
(`rimworld-reference.md:1014-1015`). **Perilune's entire phase-1 loop is the direct order** — M3-14
shipped rungs 2+3+4 so that *"the pawn walks into vacuum **because you told her to**"*, and OD-K/OD-A
put the player's word above the grid.

| # | option | what it says about the game |
|---|---|---|
| **A** | ⭐ **A GRADUATED OVERRIDE: an order still lands at MINOR (she refuses only the dangerous class), is REFUSED at MAJOR, and is IMPOSSIBLE at EXTREME** | ⭐ **RECOMMENDED.** It keeps the direct-order game intact for the common case, makes the ladder *mean* something (each tier takes one more thing away from you), and gives the refusal a sentence the player can act on. **It is a deviation from RimWorld and would be stated as one in the package's commit.** |
| **B** | **RimWorld's answer: no override at any tier** | the analogue, unmodified. ⛔ **SILENCE DEFAULT** — for mechanisms, RimWorld's shape IS the decision, and absent a ruling the analogue wins. ⚠️ **Cost: the first time a break fires, the player's only verb stops working with no ladder and no warning** |
| **C** | **Always overridable** | ⛔ **Then the break gates nothing and OD-R clause (ii) is not implemented.** Listed to be refused |

⚠️ **The roster mapping rides on this item**: minor = *refuse dangerous orders* · major = *stop
working* · extreme = *withdraw* (§5's table). **Under B the minor tier collapses into the major one**
— if no order lands anyway, "she refuses the dangerous order" is not a distinguishable behaviour — so
answering B also means **two tiers, not three**, and the charter would be re-cut accordingly.

---

**ITEM 4 — MAY THE THAWED SLEEPERS ARRIVE WITH REAL SOCIAL BONDS?**
*(binds `TIES & HISTORY`, the grief register, D-3, whether Feud exists at all; blocks §3 position 4c)*

**This is `perilune-character-simulation.plan.md` §12.2 wearing the wreck's costume**, and on this ship
it has **four** consequences instead of one.

**Measured:** the seven authored sleepers ship with `Relationships` **deliberately empty**
(`MECHANICS.md:5818-5824`) — M3-8 refused to seed them because a **host** must not write hashed SOCL
state at runtime. The bonds exist only as prose in `RaidBackstory`.

| what turns on it | if YES | if NO |
|---|---|---|
| `TIES & HISTORY` at thaw | has content the moment she steps out | empty until `SocialSystem` saturates it in a day (§13.7) |
| **grief** | a Bereavement mark can form at CloseFriend (**1.0**) ⇒ ~25 mood, *"comparable to starving, the intended register"* | every bereavement is *other*-tier **0.15** ⇒ ~3.75 mood — **a cosmetic operator on the ship players play** |
| **Feud** | reachable | ⛔ **CUT from v1** — the plan is explicit that it is *"cut, not shipped-but-labelled"* |
| **D-3** | the only honest route to closing it | D-3's honest disposition becomes *accepted, measured, not closed* |

**RECOMMEND YES**, seeded **inside `CryoSystem` at the thaw** (M3-8's competence half is the
precedent: sim-side, hashed, applied at the thaw), for the seven authored sleepers only, from the
bonds their backstories already assert. ⛔ **COST: a third pin row (`pin/m4-c`, P1/P2/P3).**
⛔ **SILENCE DEFAULT: NO** — bonds stay prose, Feud is cut, grief stays *other*-tier, and the pin chain
carries two rows instead of three. ⚠️ **Under NO, `TIES & HISTORY` still ships** (DESIGN QUESTION (d)
option 1: authored prose + live edges + an honest empty state) — **the band does not depend on this
answer; the grief register does.**

---

**ITEM 5 — THE CHRONICLE SEVERITY TIE**
*(binds M4-7; carried from `HANDOVER.md:62`)*

**Measured, and the question is narrower than the filing suggested.** `Chronicle.cs:105-175`:
`Brownout` and `OrderDropped` are **both severity 5**, and `Render`'s strict `>` (`:84`) resolves a tie
to the **earliest** entry. ⇒ ⭐ **The reported symptom — *"a brownout usually out-headlines ORDER
DROPPED"* — is not a mis-ranking; they are deliberately equal and the brownout simply happens first.**
The code argues the tie at length (`:154-166`) and the crew-tier precedence above it is already
**owner-ruled and pinned** (`:167-170`).

| # | option | verdict |
|---|---|---|
| **A** | **Keep the tie (earliest wins)** | ⭐ **RECOMMENDED** and ⛔ **SILENCE DEFAULT.** The comment's argument is sound: a drop must not sink below the flap (*"the order that died is usually the repair the brownout was FOR"*) and must not rise to the work tier (*"here nothing changed at all — that is the whole complaint"*) |
| **B** | **Break the tie toward `OrderDropped` (5 → 5.5, i.e. renumber)** | a day that held both is remembered as *"the fix you ordered never arrived"* rather than *"the power flapped"*. **Cheap** — one switch arm plus the pinned pairings re-derived |

⚠️ **Either way, M4-7 must NOT re-order anything above tier 6** — those pairings are owner-ruled and
pinned by name.

---

### ⭐ WHAT THIS BATCH DOES **NOT** ASK, AND WHY (the honesty note)

| not asked | why |
|---|---|
| SHELF/RUG wire-or-remove | ⛔ **OD-Q(iii) ruled it is decided AT M4-6.** Asking now contradicts it |
| axis drift (char-sim §12.1) | blocks no M4 package; state ships unconditionally in the plan's own WP-A regardless |
| the N band (§12.3) | blocks no M4 package — nothing in M4 flees |
| Openness (§12.4) | ⭐ **resolves itself**: *"absent a ruling, the rule decides"* |
| the assignment verb (§12.5) | it is *"a direction, not a commitment"* by its own words. ⇒ **§11 settles it**: the window is laid out so an assignment verb could land later without a re-layout, and v1 hosts no orders |
| the break threshold's default | **not a decision — a MEASUREMENT.** The break package drives the post-M3-9 mood envelope first (§5's MUST RE-MEASURE box) |
| whether the Persona window surfaces a transcript | **§11 settles it** from `TARGET.md`'s offline-first rule + the vocabulary discipline |

---

## 11. WHAT WAS SETTLED FROM AN EXISTING OD OR FROM THE ANALOGUE *(so the batch stays honest)*

| question | settled by | answer |
|---|---|---|
| **How many doors from the map to a person?** | `CLAUDE.md:84-85` (binding) + `surface-boundary.test.js:1005-1014`'s failure text | **ONE.** *"The Persona window **replaces** these; it does not join them"* — the census **shrinking to one** is the whole point |
| **Does the window host ORDERS?** | **the analogue.** RimWorld's Bio tab hosts none; orders are the map's right-click (RW§2.2) and the Work tab (RW§1.7) — both of which Perilune already ships (M2-9, M2-3) | ⭐ **NO in v1.** A second arbitration entry point is *priority-cannot-live-in-the-dispatcher* in UI clothing. ⚠️ **Laid out so char-sim §12.5's assignment verb could land later without a re-layout** |
| **Does it surface a TRANSCRIPT?** | `TARGET.md:46-47` (*"Ship playable fully offline"*) + `console-retirement.plan.md:260-262`'s vocabulary discipline | **NOT IN v1.** `chat.js` stays retained-unwired as *"the natural substrate if the Persona window ever surfaces an opted-in transcript"*. **Never *"talk to your crew"* as a shipped promise** |
| **How are traits / relationships / needs / history ARRANGED?** | **the analogue.** RimWorld groups Bio (identity + backstory + *Incapable Of*) / Health (capacities) / Needs (mood + thresholds) / Social (relations) | **The same grouping**, as five bands in the exit gate's own order. ⛔ **Only tabs-vs-scroll is left open** (DESIGN QUESTION (a)) |
| **Does Room Zoom grow its own readout?** | `CLAUDE.md:84-85` + `TARGET.md:71` (*"No new UI off the standard surface"*) + M2-6's lesson (two surfaces, one sentence, drift) | ⭐ **NO — the Persona window answers there.** This closes `ROADMAP.md:55`'s filing, and the crew dock stays the selector (`zoom-pawn.test.js:795-796`: *"SELECTING is not interacting"*) |
| **Does the window carry "Incapable Of"?** | **the analogue** — RW§1.6 + §6.1, and `MECHANICS.md:5771` names RimWorld's Bio tab as the surface we lack | ⭐ **YES**, and **no wire change is needed**: `workcaps` already carries `[cid, s0..s5, incapableMask]`. ⚠️ **The WORK tab's second hint line STAYS** (`overview-view.js:590-597`) — one fact, two surfaces, and the grid is where the absence is *seen* |
| **Is the Persona window terminal-styled / a MOSS noun?** | `CLAUDE.md:75-83` (the standard surface) + OD-P (nouns are reserved; *"never implement from this row"*) + `…m3.packages.md:2705` (the MOSS-takeover precedent) | **NO to both.** It is a standard-surface artifact reachable from the Overview. **If it is ever a MOSS noun, that is a TYPED verb with its own charter row** |
| **Does a MORALE meter come back?** | `TARGET.md:67-69` + `dossier-honesty.test.js:138` (equality-pinned) + `panels.js:231-241` (the ledger's own correction) | ⛔ **NO.** *"Do not add a field to this REAL list on the strength of it being on the wire; ask whether the sim moves it"* |
| **How many break TIERS, and how are they derived?** | **RW§4.2 (`:1007-1012`), binding** | ⭐ **THREE, DERIVED FROM ONE TUNABLE**: major = 4/7, extreme = 1/7, minor clamped. *"Copy the **derivation**, not three numbers."* ⛔ **Not re-litigable — it is the mechanism and RimWorld's shape IS the decision** |
| **Are trait mood-offsets and trait threshold-offsets the same axis?** | **RW§4.2 (`:1034-1037`)** | **NO — two independent axes**, and it *"reads backwards from the trait names"* |
| **Do breaks fire while asleep?** | **RW§4.2 (`:986`, `:1017-1018`)** + M3-9's shipped `JobKind.Sleep` gate | ⛔ **NO.** The dwell counter **pauses** while `JobKind == Sleep` — the honest analogue of RimWorld's frozen bar, on a predicate already saved and hashed. ⭐ **This closes T12's *"no mood freeze while asleep"* remainder** |
| **Does the break selection roll?** | `TARGET.md:63-65` + OD-R (*"never rolls"*) | ⛔ **NO. Dwell time, not mean time; one behaviour per tier, no weighted roster.** RimWorld's rate is the one thing in RW§4 that is deliberately NOT adopted, and the deviation is named |
| **Does Rell get an authored persona sheet?** | **M3-8's own ruling** — both spread options measured **pin-neutral** and decided on design (`MECHANICS.md:5884-5894`, pinned by assertion) | **YES for the SHEET** (host state, unhashed, pin-neutral) in M4-3. ⛔ **NO for the skill spread** — that question was answered and is not re-opened |
| **Where does per-person history come from?** | measured: `HistoryEntry.SubjectA/SubjectB` exist and are hashed; `Chronicle.Render` drops them | **Carry them out on the `chron` wire** — additive, host-side, **no pin**. ⛔ **Never a text-name join** (§13.43.3's recorded regression class) |
| **Is `Chronicle.Render` allowed on a tick path?** | `Chronicle.cs:52-53`, its own allocation contract | **NO.** *"called ON DEMAND … never on a tick path"* |
| **May `hud.js`'s chronicle renderer be reached from the standard surface?** | `surface-boundary.test.js:232` (`CONSOLE_OWNERS`) | **NO.** The standard surface gets its own renderer |
| **Does M4 retune scarcity?** | OD-R (iii) *"queue order stands"* + `PROCESS.md` §2's lane-selection gate | ⭐ **NO — M4 builds the instrument, M5 turns the dial** (§5's TWoM-2 ruling) |
| **Is there a systemic fault/refusal mechanic to copy from OD-O?** | **OD-O (iii), the owner's own softening** — *"not a pattern for all devices"*; M3 ships **exactly one** authored instance, censused | **NO.** A break is the opposite of an authored fault: **systemic, computed, never authored per instance** |

---

## 12. CORRECTIONS TO THE M4 OUTLINE, FOUND BY OPENING THE FILES

*Verified on `lane/m4-1-persona-design` @ `2e4ce40`. Each is a claim in `…q3.packages.md` §7, in a
scout brief, or in a filed line, that is **false or stale on this tree**.*

1. ⛔ ⭐ **`openPersonaForSelected` DOES NOT EXIST.** `…q3.packages.md:3696` charters M4-2 as *"one
   function body (`openPersonaForSelected`)"*. **A repo-wide search finds it only in prose and in a
   test's failure message.** The shipped seam is `Hud.openBioForSelected` (`hud.js:199-205`), reached
   from `overview-view.js:1658`. ⇒ **M4-2 CREATES the function; it does not retarget one.**
2. **`CREW_INTERACTION`'s line moved.** §7 cites `surface-boundary.test.js:856`; it is **`:916`** on
   this tree (members unchanged; asserted at `:999`).
3. ⭐ **`SHIP_STATE_REACH` starts at `:833`, not `:838`.** A scout brief carried `:838-908`. The list
   opens at **`:833`** and its crew line is `:907`. ⚠️ *A five-line drift is exactly the size that
   survives a spot-check and lands a lane in a comment block.*
4. **`INERT_TABS` is at `overview-model.js:342`, not `:262`.** §7 M4-7's citation is stale; `:346`
   is `tabIsInert`, and `overview-view.js:1645` is the refusal site.
5. **`panels.js`'s section lines have all moved.** §7 cites `:297-420`, NEEDS `:328`, YOUR STANDING
   `:338`, BACKSTORY `:389`, RECENT MEMORIES `:394`, `SAMPLE_*` `:248-266`, the badge `:273`.
   **Measured: `CitizenCard` is `:315`, NEEDS `:343`, YOUR STANDING `:353`, PERSONALITY `:363`,
   RELATIONSHIPS `:385`, BACKSTORY `:404`, RECENT MEMORIES `:409`, CONVERSATION LOG `:418`,
   `SAMPLE_*` `:266-284`, the badge `:291` and `:367`.** The **claims** are all true; **not one line
   number is.**
6. **`roomzoom-view.js`'s decor lines moved.** §7 M4-6 cites `:988-991`; on this tree `_decor` is
   declared at **`:122`**, merged at **`:491`**, the honest-refusal comment is **`:1142-1143`**, and
   the stopped-lying record is **`:1446`**.
7. ⛔ ⭐ **THE THIRD DOOR — the one nothing in §7 mentions and no pin can see.**
   `controls.js:174-177` sends `Cmd.talk(cid)` **directly on the session**, bypassing `hud.js`
   entirely, bound to `T` (`:284`) and Enter-on-selected-crew (`:331`). ⇒ **`CREW_INTERACTION` pins
   TWO of THREE doors**, and the milestone's central premise is *one door*. **The 4th trap's shape,
   found by reading the file the census does not read.**
8. ⛔ ⭐ **THE CID IS NOT MISSING FROM THE SIM — THE RENDERER DROPS IT.** The filing reads *"nothing
   carries a cid on a Chronicle line"*. **True of the wire and FALSE of the sim**: `HistoryEntry`
   carries `SubjectA` (`HistorySystem.cs:63`) and `SubjectB` (`:66`), both hashed into `'HIST'`.
   ⇒ **DESIGN QUESTION (f) option 2 is cheap because the data is already there.**
9. ⭐ **M3-5's filed Chronicle debt IS ALREADY PAID.** M3-5 filed *"both new HistoryKinds render
   `[Note]` severity 0 — the ENDING can never be a day headline (owes a Chronicle change)"*.
   **Measured: `Chronicle.cs:127-128` reads `RunEnded => 12, EmergencyThaw => 11`**, swept as a class
   by a later lane whose comment says so (`:124-127`). ⇒ **Do not re-file it into M5-1.**
   ⚠️ *A filed debt discharged by an unrelated lane, discoverable only by opening the file.*
10. ⭐ **THE CHRONICLE SEVERITY "TIE" IS DELIBERATE, NOT A BUG.** `HANDOVER.md:62` files *"a brownout
    usually out-headlines ORDER DROPPED"*. **Measured: both are severity 5** (`Chronicle.cs:152-153`)
    and `Render`'s strict `>` (`:84`) gives the headline to the **earliest**. ⇒ **§10 item 5 asks a
    much narrower question than the filing implied.**
11. ⛔ ⭐ **D-3's PREMISE IS STALE AND NOBODY HAS RE-MEASURED IT.** `rimworld-reference.md:1816-1817`
    grounds D-3 on *"`Fatigue` has **no reducer** … mood is permanently ≤ −5"*. **M3-9 shipped the
    reducer** and `MECHANICS.md` §13.4 struck that very sentence. ⇒ **D-3 may be partly self-healing.**
    The break package's envelope measurement answers it in passing.
12. ⭐ **THE MOOD ENVELOPE IS PRE-M3-9 IN THREE DOCUMENTS AT ONCE** — `MECHANICS.md` §13.4's
    −37.7/−26.4/−29.5 and [−39.8, −10.5], `rimworld-reference.md:1816`'s *"≤ −5 forever"*, and
    `perilune-character-simulation.plan.md` §8.2's [−60, 0] display band. **All three descend from the
    same measurement, taken before the reducer existed.** ⇒ **MUST RE-MEASURE, marked in §5.**
13. ⭐ **A SECOND DEFECT ON D-3's LINE, NOT IN ITS FILING:** `SocialSystem.cs:149`'s third conjunct is
    `_roll.NextFloat() < defs.ArgumentChancePerPass` — **a runtime roll**, which is the shape
    `TARGET.md:63-65` forbids in outcomes. Deterministic in the replay sense; a die in the design
    sense. ⛔ **FILED, not ruled** — re-litigating a shipped system is outside a design package.
14. **`console-retirement.plan.md:224`'s seam line is stale.** It cites `overview-view.js:234` as the
    readout's primary action button; **measured, the action row is `:437-443`** and the buttons are
    `:438`/`:440`/`:441`.
15. ⭐ **`SleeperAptitudes` gives EVERY one of the seven at least one `WorkIncapable` bit**
    (Lindqvist cannot Mine · Ozawa cannot Construct · Ferreira cannot Craft · **Mbeki cannot Repair OR
    Craft** · Bahri cannot Haul · Nakamura cannot Deconstruct or Mine · Torres cannot Mine). ⇒ **M4-2's
    acceptance step 7 is satisfiable by any thawed sleeper** — but **not by Rell**, who boots with the
    fleet-wide default and an empty mask. *The window's most RimWorld-shaped band is empty on the only
    person available at boot.*
16. ⛔ ⭐ **M3's COUPLING 7 CITES A LINE THAT IS NOT THE MOSS DOOR, AND THERE ARE THREE DOORS.**
    `…m3.packages.md:2382` and `:2401` both cite `overview-view.js:1181` as *"`→ Hud.selectTab('moss')`,
    the POD BAY's only entrance"*. **Measured: `:1181` is inside `paintCrewWatch` and reaches nothing
    of the kind.** The real reaches are **`:1645`** (the tab dispatch; `OV_TABS` carries
    `['moss','MOSS']` at **`:87`**), **`:1443`** (`case 'terminal': Hud.selectTab('moss')` — clicking
    a console on the map, IX-M1) and **`:1652`** (`ovCaution` → MOSS diagnostics). ⇒ **M4-8's most
    dangerous inherited debt was carried forward twice by citation and never re-measured, and it is
    three times larger than the filing says.** ⭐ *Trap 8's shape in a document rather than a test.*

---

## 13. WHAT I VERIFIED VS WHAT I TOOK ON FAITH

*The distinction `PROCESS.md` and every prior charter demand. **A commit hash beside a citation is a
statement about WHEN it was true, never a reason to trust it now.***

### 13.1 READ ON THIS TREE (`2e4ce40`), file opened, claim checked against the text

- `surface-boundary.test.js` — `CONSOLE_OWNERS:232` · `CONSOLE_SHELL_ID_CEILING:584` (asserted `:604`)
  · `HUD_DOM_LOOKUP_SITES/CREATE_ELEMENT/HTML_WRITE :707-709` · `SHIP_STATE_REACH:833-908` (crew line
  `:907`) · `FORBIDDEN_REACH:912` (non-vacuity `:991-993`) · `CREW_INTERACTION:916` · the assertion
  and its full failure text `:999-1014`.
- `hud.js:195,197,199-205,207-256` · `overview-view.js:437-443,588-598,1656,1658` ·
  `controls.js:174-177,284,331` · `roomzoom-view.js:122,491,570,1035,1142-1143,1446,1682` ·
  `room-model.js:680` · `overview-model.js:342,346,352` · `console-model.js:756` ·
  `console-model.test.js:650-657` · `dossier-honesty.test.js:138` · `panels.js:224-247,251-284,291,
  315,325,343,353,363,367,385,404,409,418` · `styles.css:428,874,1326,1808` · `onboarding.js:225-227`.
- `Citizen.cs:32,35,38,71,72,153,193` · `NeedsSystem.cs:190-205` · `ShipMetrics.cs:13,86` ·
  `SocialSystem.cs:144-152` · `SimDefs.cs:565,942,1228` · `DefsParser.cs:378` ·
  `CitizenMemory.cs:29-46,108-109,127` · `Chronicle.cs:15-26,38-52,54-64,84,105-175` ·
  `HistorySystem.cs:54-78,111` · `GameSession.cs:2103,2426,2471,2483,2492` · the ten
  `hosts/web/WireFormat*.cs` partials **including `WireFormat.Ending.cs`, confirmed present**.
- `rimworld-reference.md` §4 **in full** (`:953-1116`) · §6.1 (`:1346-1418`) · §8.6 (`:1811-1844`) ·
  §8.8 (`:1868-1885`) · §8.9 (`:1887-1899`).
- `ROADMAP.md:20-30,90-100,115-160` (OD-K…OD-R **verbatim**) · `TARGET.md:1-100` · `PROCESS.md:45-95`
  · `HANDOVER.md:25-75,100-125` · `MECHANICS.md:2040-2075,5762-5778` ·
  `character-simulation.plan.md:240-270,345-372,400-435,685-720,885-925` ·
  `console-retirement.plan.md:215-265,580-595` · `…m3.packages.md:1-310,1630-1705,2295-2480,2686-2765`.

### 13.2 DRIVEN — nothing

⛔ **This lane drove NO sim, took NO measurement of its own, and every number in this document is
either quoted from a source read on this tree or explicitly marked MUST RE-MEASURE.** ⚠️ **That is a
limitation, not a virtue**, and `…q3.packages.md:3800-3803` names it: *"**Before chartering a design
package, ask its question of the running sim.**"* ⇒ **The one question this charter could not ask
without driving the sim is the post-M3-9 mood envelope, and it is handed to the break package as its
FIRST measurement rather than guessed at here.** Every threshold in §5 is a shape, never a value.

### 13.3 TAKEN ON FAITH (inherited, not re-opened) — and what it would cost if wrong

| claim | source | if wrong |
|---|---|---|
| the five pin VALUES (P1…P5) | `CLAUDE.md`'s table, read not driven | ⚠️ **§2's rows still stand** — they name which pins move and why, not what they read. **Re-measure before any re-pin commit** (that is the ritual anyway) |
| `Citizen.Health` measures **1.00 after 3 days of CO₂**; `Morale` **1.00 always** | `MECHANICS.md` §13.4 | §10 item 2's framing weakens; the *never written by any system* half is **verified in the source** and is the load-bearing part |
| the social graph **saturates in a single day**; crew memory is **flooded by social spam** | `MECHANICS.md` §13.7/§13.8 | M4-3's *cut RECENT MEMORIES* recommendation and DESIGN QUESTION (d)'s tier-filter fallback weaken. **Neither is a ruling** |
| `TrustToPlayer`/`RevealDifficulty` are **decorative** | `MECHANICS.md` §13.9 | M4-3's *cut YOUR STANDING* recommendation weakens |
| `.rz-crewtask` 118 px ≈ 22 chars vs `.ov-task` 264 px | `MECHANICS.md:3151` | the *"the window is where the whole sentence fits"* argument weakens; **`ROADMAP.md:55`'s filing stands on its own** |
| the 200-entry ring's turnover **horizon ~4.2 d / past a sim-week** | `HistorySystem.cs:429-434`'s own comment | M4-7's per-person history could be thinner than assumed. **Filed, not resolved** |
| M3-8 measured Rell's spread options **pin-neutral both ways** | `…m3.packages.md:240`, `MECHANICS.md` §13.39 | §11's *"do not re-open the skill question"* row weakens; **the SHEET half is host state and is safe regardless** |
| every `…q3.packages.md` §7 line number | July | ⭐ **assumed WRONG by default and re-measured — §12 lists sixteen corrections, and re-derive that COUNT from the headings rather than quoting this cell** |

### 13.4 WHAT THIS DOCUMENT DELIBERATELY DID **NOT** VERIFY

- **The `--ship grid` and `--ship slice` crew.** Every citation about *who is aboard* is about
  **`--ship wreck`**, the ship `./play.sh` boots. The slice's eight authored personas are a separate,
  older set and **no M4 charter is written against them.**
- **Whether any pinned fixture reaches a break threshold.** ⛔ **That is the vacuity question in §2 and
  it must be DRIVEN by the break package, not argued here.**
- **The exact allocation behaviour of a Persona-window repaint.** A client concern, and M4-2's.
- **Whether `CmdKind.Operate` can be removed without renumbering a hashed vocabulary.** Flagged in
  M4-8's charter as **CHECK BEFORE DELETING**; not checked here.

### 13.5 ⭐ THE ONE THING THIS CHARTER WOULD MOST LIKE A REVIEWER TO ATTACK

**The dwell counter.** It is this document's only genuine invention — RW§4 gives a *rate*, TARGET §2
forbids rolling one, and *"a hard time instead of a mean time"* is the charter's own bridge. It is
defensible (it is a threshold over hashed state, it preserves RimWorld's ordering, and it puts the
rate limiter back where a bar-less architecture has room for it) **and nobody has driven it.**
⚠️ **If it is wrong, it is wrong in the direction of being TOO SHARP**: RimWorld's rate means two
identical pawns break at different times, which reads as *people*, while a dwell counter means every
person at the same mood breaks at the same second, which can read as *machinery*. ⭐ **The mitigation
is already in the design and is worth checking: the per-person tunable (RW§4's second axis) means two
people at the same mood are NOT at the same tier** — so the sharpness is absorbed by the thing
RimWorld also uses. **Check that argument before checking anything else in §5.**
