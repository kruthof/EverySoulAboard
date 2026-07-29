# The next three months — the BUILDABLE PACKAGES

*Derived 2026-07-28 on `lane/roadmap` from `docs/design/perilune-roadmap-q3.plan.md` (revision 1,
`d2113b1`), base `main` @ `72fbca4`. **This is the implementation document.** The plan says what and
why and in what order; this says who does what, against which line, with which mutation, and how a
human checks it in a browser.*

**Binding inputs, in precedence order:** `OWNER-VISION.md` · **OD-A / OD-B / OD-C** (the three owner
decisions of 2026-07-28) · the OD-1…OD-12 record in `docs/design/perilune-wreck-start.plan.md` §7 ·
the approved plan · the invariants and the **Traps** section in `CLAUDE.md`.

---

> ## REVISION 1 — what changed and why *(2026-07-29, after independent review + an integrator adjudication)*
>
> Revision 0 took a **send-back with 15 required fixes**. The reviewer verified against code
> throughout and **most of its findings are measurements revision 0 did not have.** One finding was
> **overstated and the integrator adjudicated it**; that adjudication is applied below, not the
> reviewer's version.
>
> | # | what changed | why |
> |---|---|---|
> | **1** | ⭐ **`18.00 kW` IS UNREACHABLE AND IS CORRECTED TO `17.40 kW` EVERYWHERE.** ⛔ **But the demo is NOT re-chartered and M2-12 is NOT blocked** — the Comfort threshold is **14.30 kW**, and `17.40 ≥ 14.30`, so the lights still come on and the owner's sentence still lands. | The wreck carries exactly **1 Parts + 2 Seals** (`AuthoredShips.cs:1888-1889`). Parts→1.0, Seals→0.9 ⇒ `6.00 + 5.70 + 5.70 = 17.40`. Arithmetic re-derived in this session from `machines.def:30` (SolarWing gen **6 kW**) and `Device.cs:120`. |
> | **2** | ⭐⭐ **PROMOTED, and it is bigger than the number: THE WRECK'S REPAIR ECONOMY IS FINITE, and that is a SOFT-LOCK SHAPE.** Added to **M2's owner decision batch** with three options, stated as behaviour. ⛔ **Not resolved by implementing.** | `IsUnfixableWreck` (`MachineWearSystem.cs:463-472`) refuses every device below `wreck_threshold = 0.25` when no consumable is aboard, and free jury-rig is refused there too. Spend the three consumables elsewhere and `wing_b` (0.18) / `wing_c` (0.06) are unfixable — **with no message saying so.** |
> | **3** | **M1-D's "headline discovery" is RETRACTED — the repo already has the API and already wrote the prescription.** `HaulJobSource.cs:137` is `public bool IsBackedOff(Int3, long, out long)` and calls itself *"THE ONE DEFINITION OF 'BACKED OFF'"*; `WireFormat.Blocked.cs:78-100` states the whole fix. **Mirror that name on the other three sources.** | ⚠️ Revision 0 presented as new a thing the codebase had already named. Letting the repo acquire two names for one predicate is the drift this document exists to prevent. |
> | **4** | **M1-D's limit section was incomplete and its reason will BLINK OUT.** The backoff **expires after 50 ticks** and is **wholesale cleared** on `JobBoardDirty.Tiles`. On a one-pawn ship the reason vanishes while the situation is unchanged. Both limits written in; a driven past-expiry leg added; the latch is now a stated decision. | That is precisely the invisible-feedback failure the `marks` channel exists to prevent, re-introduced by the package built to remove it. |
> | **5** | **M1-D mutation 5 (the stockpile leg) is DELETED — it had no carrier.** | `BuildBlocked` walks **three** registries (dig tiles `GameSession.cs:2418-2425`, strip `:2427-2433`, build `:2435+`). There is no stockpile walk, and adding one is **refused by name** at `WireFormat.Blocked.cs:114-121` — the `zones` channel already carries it via `ZoneFlagBackedOff` and the Room Zoom already draws it. Replaced with a build-**material** leg, which is a real fourth carrier. |
> | **6** | **M2-2's negative `SustenanceSystem` leg is re-specified — it could not be applied as written**, and a **second** leg added for `TryServeInPlace`. | There is no `WorkType` for Eat/Drink to pass, so "add a veto" was not an executable mutation. And a veto at `:82` leaves `:83-84`'s `HoldPosition` path ungated. |
> | **7** | **M2-3's mutation 6 is REPLACED by a positive assertion**, recorded at the seam. | It **could not bite**: it is E0-4 WP-5's first draft verbatim — a tab mounted into the existing `#panels` adds no console-shell id (`surface-boundary.test.js:600`) and no `hud.js` widget, so **both** pinned censuses hold. |
> | **8** | **M1-F named 1 of 5 morale draw sites**, missed `panels.js:219`'s false ledger entry, and its mutation 2 was a bare negative. All three fixed. | Verified: `overview-view.js:675,682,699-702` · `hud.js:951-953,981-984,1008` · `panels.js:313-315`. |
> | **9** | **THIRTEEN `file:line` citations corrected**, several being the exact line a ruling is quoted from. | ⚠️ **This document's own §12.9 says a line number is part of a justification.** It applies here. |
> | **10** | **M2-1's `PLAYER` classification is defended by a stated rule, and the cap recomputed.** | RF-15: on revision 0's own evidence (*"deliberately invisible"*, *"the honest answer is that there isn't one"*) it looked like the cheat the cap exists to prevent. |
> | **11** | **M2-12's scale guard was ONE-SIDED** (a uniform ×1.25 survives `≥ 10.0`). Now a two-sided absolute band. | The seventh trap, half-defended. |
> | **12** | **Conflict matrix gained `BlockedChannelTests.cs` (4 claimants, previously no row), `panels.js`/`hud.js`, and M1-E on `WireFormat*.cs`.** ⭐ **And M1-A ↔ M1-D is named as a semantic coupling git cannot see.** | The tripwire at `BlockedChannelTests.cs:351`/`:412` says in its own words: *"If boot fog ever changes, this assertion is the tripwire and the fix is to exclude them by name, not to weaken it."* M1-A changes boot fog. They merge at positions 1 and 3. |
> | **13** | **M1-E gained the mutation that pins the direction which actually rots** (plant a *new* refusal site). §11 reconciled with M1-D's integrator-lane status. M2-9's fixture must strip the authored consumables. `ShipMetrics.Morale` named as a different, real thing. `M2-13…M2-16` gap noted. | RF-11, R11, R9, R7, R1. |
>
> **Unchanged, because review endorsed them:** the four-site table and its blinded mutations · the
> band-loop shape and the strictly-higher-band rule · the pin chain and its two rollback tags · the
> merge order · §12's eight corrections · §13's standing rules.

---

## 0. Provenance — what in here was verified, and how

> ### ⏳ IN FLIGHT AS OF THIS REVISION
> **`lane/wreck-visible` (M1-A)**, **`lane/first-screen` (M1-B)** and **`lane/spike-dispatch` (M2-0)**
> are running now. ⚠️ **M2-0's three legs will RE-SIZE M2 when they land** — specifically they settle
> whether M2-5's strictly-higher-band rule holds shipped behaviour byte-identical, and therefore
> whether M2-5 joins the pin chain and the merge order grows a row. **Re-read §5 and §2 the day the
> spike reports.**

Every `file:line` below was read **in this session against `main` @ `72fbca4`**, not copied from the
plan. That check was not ceremonial: **it found eight corrections to the plan of record and to the
plan this document derives from**, and one of them (§12.3) would have shipped a bug that stops crew
eating. Read §12 before implementing anything in M2.

**Not re-measured here, and flagged as inherited:** the gate counts. The plan measured `./ci.sh` in
this worktree at **exit 0 · 1 286 dotnet · 953 node · twin hashes MATCH `02257f5bce961570`**, and
that agrees with `CLAUDE.md`. I did **not** re-run it — a 10-minute gate run tells a packaging
document nothing it does not already have, and the plan's measurement is nine hours old in a tree
nobody has touched since. ⚠️ **Every lane re-measures its own tree anyway; that is the ritual, and a
count from here is not evidence.** The five pin values *were* re-read from the files that hold them
(`ci.sh:31`, the two `Golden/*.txt`, `DefsChecksumTests.cs:110-120`) and are reproduced in §2.

**How to use this document.** Find your package. Read its charter block top to bottom before opening
an editor. The **SEAM** section is where you start; you should not have to search. The **MUTATIONS**
table is not advice — it is the acceptance bar for the package's tests, and a reviewer will ask you
to show each row going red **in your own tree**, physically applied and reverted.

---

## 1. The charter block — the required fields, and why each exists

Every package below carries these. A package missing one is not chartered.

| field | what it is | the failure it prevents |
|---|---|---|
| **CLASS** | `PLAYER` or `INFRASTRUCTURE`. No third value, no blank. | §6(3a) of the plan: a cap you discover after breaching is not a cap. |
| **PLAYER SENTENCE** | *"Today the player cannot ___ / is misled about ___."* Subject must be a person playing the game. | A package whose justification is a metric. `INFRASTRUCTURE` packages carry **no** sentence — writing a fake one is the exact failure §6 exists to stop. |
| **SEAM** | The files and functions, with `file:line`. | An implementer searching for where to start, and finding the wrong file (see §12.1, §12.2). |
| **PIN IMPACT** | `PIN-NEUTRAL (must be proven)`, or the named pins that move and why. `UNKNOWN — measure` is a legitimate answer. | Predicting a pin. `CLAUDE.md`: *"measure, never predict"* — two pins held against expectation in the deck-confined-wander lane. |
| **SPINE?** | Yes ⇒ **integrator lane only** (`Simulation.cs`, `SystemStack`, save chapters, `GlyphColor`, `WireFormat`, `Commands`, the `CitizenEffect` set). | A parallel lane editing a spine file. |
| **MUTATIONS** | A table: mutation → the test(s) that must go red. | The repo's dominant defect — *a test whose named mutation cannot bite*. |
| **ACCEPTANCE** | A numbered browser sequence a human performs in under five minutes. | Plumbing that ships before anything draws it (R3). |
| **LANE** | `lane/<name>`. Every package gets its own worktree. | The hard rule in `CLAUDE.md`. |
| **CONFLICTS** | Which packages must not run concurrently, and on which files. | A clean auto-merge that is not a clean merge (traps 7, 8). |
| **SIZE** | S / M / L, **and what makes it that size**. | "Large" used as an ordering argument (§3.1 of the plan). |

### Two standing requirements that apply to every package, stated once

**(A) PIN-NEUTRALITY IS PROVED, NOT CLAIMED.** Any package not on the pin chain (§2) runs, in its own
worktree, before it asks for review:

```bash
git diff -- tests/Perilune.Tests/Golden/ ci.sh content/    # must be 0 lines
```

*"Client-only" and "pin-neutral" are different claims. A lane that touches `hosts/` or `sim/` can only
make the second.*

**(B) A SOURCE-TEXT GUARD USES THE SHIPPED STRIPPER AND CARRIES A LATER REAL COMMENT.** If a test
matches raw source, it imports `codeOnly` from `client/test/code-only.js` (JS/CSS) or uses
`CodeOnly` in `tests/Perilune.Tests/SurfaceBoundaryTests.cs:82` (C#/JS), **and** it carries a negative
control whose fixture contains a **later real comment** — a fixture with an unclosed `/*` is vacuous
against the naive stripper and passes whether the stripper works or not. Where a guard must pin *how*
an API was called, **record the argument at the seam** (the `client/test/overview-model.test.js`
window stub) rather than scanning for a spelling.

---

## 2. The pin chain — one standing deep lane, published order, named rollback points

**Rule (plan §3.2): batch the LANE, never the COMMIT.** One deep lane owns this whole table. No two
rows run concurrently. Each row gets its **own** re-pin commit touching `ci.sh` + `CLAUDE.md` +
`MECHANICS.md` + `HANDOVER.md` + memory together — a combined re-pin destroys the only thing the pins
are for.

**The five pins as they stand today, re-read from the files this session:**

| pin | value | held by |
|---|---|---|
| P1 scenario `--days 3 --seed 42` | `02257f5bce961570` | `ci.sh:31` |
| P2 tick-3000 golden (`perilune`) | `326c68e00f2df496` | `tests/Perilune.Tests/Golden/perilune_tick3000_hash.txt` |
| P3 slice tick-3000 golden | `3fb1798a3a50cba0` | `Golden/slice_tick3000_hash.txt` |
| P4 defs **defaults** | `0c5ddbc07e41f07d` | `DefsChecksumTests.cs:110` |
| P5 defs **rules-inclusive** | `09900b9a44119272` | `DefsChecksumTests.cs:120` |

### The chain

| # | lane | package | expected to move | why | rollback point |
|---|---|---|---|---|---|
| **M2-a** | `lane/work-state` | M2-1 | **P1 P2 P3** | New hashed `Citizen` state ⇒ CITZ chapter bump ⇒ `Simulation.StateHash` fold changes on every ship. **P4/P5 expected to HOLD** — see the note below. | ⭐ **tag `pin/m2-a`** on `main`, with all five values recorded in the tag's own commit |
| **M2-b** | `lane/preempt` | M2-8 | **UNKNOWN — measure.** Expected P1 P2 P3 *only if* a pre-emption actually fires on a pinned ship. | Pre-emption only fires on a strictly-higher band or an explicit `PrioritiseJob`; at shipped defaults neither exists, so this may be inert. **Do not assume; drive it.** | — |
| **M2-c** | `lane/power-network` | M2-11 | **UNKNOWN — and the answer depends on a decision inside the package.** Wreck-only authoring ⇒ pin-neutral (the wreck is not pinned). A change to `PowerSystem`'s claim rule ⇒ **P2 P3** (and P1 only if the scenario ship has a network — it is single-deck, so a 6-way vs 4-way claim is likely identical). | §0.2: `AuthoredShips.cs:1441-1443` believes deck 1 is off-network; measured, 0 of 626 devices are. | — |
| **M2-d** | `lane/power-wear` | M2-12 | **P2 P3.** P1 unknown — measure. P4/P5 expected to hold (no def field; `EffectiveRate` already exists). | `EffectiveRate` on the generation term alters the power balance on `perilune` and `slice`. | ⭐ **tag `pin/m2-d`** — **the designated rollback point for the whole power package.** If the resulting curve is wrong, return to a measured tree; do not tune forward from an unmeasured one. |
| **M3-a** | `lane/cryo-system` | M3-2 | **P1 P2 P3** | Registering a system folds its SYSS chapter and checksum seed unconditionally. W0-6 measured exactly this on four *empty* systems. | — |
| **M3-b** | `lane/skill-consumers` | M3-7 | **P1 P2 P3**, and **P4 P5** if the work-rate multiplier lands as a def field | Work rates change on every ship. | — |
| **M3-c** | `lane/rest` | M3-9 | **P1 P2 P3 P4 P5** | Fatigue recovery is a behaviour change *and* needs def scalars. It also removes a flat −25 mood, which feeds `ShipMetrics.Morale` → `DirectorSystem.cs:82` → `_wearPressure` → `MachineWearSystem`. **Machine wear rates change on every ship.** | — |
| **M3-d** | `lane/heater` | M3-10 | **P4 P5**, plus **P1 P2 P3** if any pinned ship gets one | A new `machines.def` row. | — |

> ⭐ **M2-1 SHOULD NOT ADD A DEF FIELD, and that is a design instruction, not an observation.** The
> default priority (3) and the work-type count (6) belong as **literals**, on the deck-confined-wander
> precedent: *"it is a rule, not a tunable, and it therefore adds no hashed state and moves neither
> defs checksum."* A def field would put P4/P5 on the chain's head for nothing. ⚠️ And note the
> repo's own warning: **a def field pinned only by the checksum is NOT pinned** — `swarf_service_condition`
> moved with zero behavioural tests seeing it.

> ⚠️ **THE ROLLBACK TAGS ARE NOT OPTIONAL.** A chain of eight re-pins has no natural place to stand
> back up, because every later pin is measured against the earlier ones. A tag costs one command;
> discovering you needed one costs a re-derivation of every pin after it.

---

## 3. THE MERGE ORDER

Numbered, and this is the order the integrator merges `--no-ff` into `main` and re-gates. Rows in
**bold** are pin-chain rows and run alone.

| # | lane | package | notes |
|---|---|---|---|
| 1 | `lane/wreck-visible` | **M1-A** | ⏳ IN FLIGHT. Merge first — everything in M1/M2 that touches the wreck's visible machines assumes it. |
| 2 | `lane/first-screen` | **M1-B** | ⏳ IN FLIGHT. Merge second so M1-C can rebase onto its `controls.js` / `overview-view.js` edits. |
| 3 | `lane/blocked-reach` | **M1-D** | Can start tonight; merges here. ⚠️ **Integrator lane** (`WireFormat` + `IJobSource`). ⭐ **Semantically coupled to 1 — re-run its tests AND its browser acceptance after 1 merges.** |
| 4 | `lane/undesignate` | **M1-C** | Rebase onto 2 before review. |
| 5 | `lane/morale-bar` | **M1-F** | |
| 6 | `lane/refusal-reasons` | **M1-E** | After 3 — same functions in `GameSession.cs`. ⭐ Also coupled to 1 (fog gate); re-run after 1. |
| 7 | `lane/premise-fix` | **M1-G** | Docs; integrator lane (`CLAUDE.md` lives on the main checkout). |
| — | `lane/spike-dispatch` | **M2-0** | ⚠️ **NEVER MERGES.** Throwaway branch, week 1, in parallel with M1. Its deliverable is three measured legs. |
| **8** | **`lane/work-state`** | **M2-1** | **PIN M2-a.** Runs alone. → tag `pin/m2-a`. |
| 9 | `lane/work-veto` | **M2-2** | ⚠️ **Integrator lane** — it edits `TryAssign` (corrected in revision 1). |
| 10 | `lane/work-wire` | **M2-4** | Spine (`Commands`, `CmdKind`, `WireFormat`). |
| 11 | `lane/work-tab` | **M2-3** | Needs 10. |
| 12 | `lane/band-loop` | **M2-5** | Needs 9. Same file as 9 (`JobSystem.cs`) — strictly serialized. |
| 13 | `lane/work-blocked` | **M2-18** | Needs 9 and 12; needs M1-D's channel work. |
| 14 | `lane/why-line` | **M2-6** | Needs 9/12 for the reason to be true. |
| 15 | `lane/preempt-policy` | **M2-7** | Docs. Can run any time from week 3; **must land before 16.** |
| **16** | **`lane/preempt`** | **M2-8** | **PIN M2-b.** Runs alone. |
| 17 | `lane/prioritise-cmd` | **M2-9** | Spine. Needs 16. |
| 18 | `lane/prioritise-ui` | **M2-10** | Needs 17. |
| **19** | **`lane/power-network`** | **M2-11** | **PIN M2-c.** Runs alone. |
| **20** | **`lane/power-wear`** | **M2-12** | **PIN M2-d.** Runs alone. → tag `pin/m2-d`. **Order 19-before-20 is a ruling, not a preference.** |
| 21 | `lane/rebaseline` | **M2-17** | INFRASTRUCTURE. After 20 — measuring before the power term lands measures a tree nobody will play. |
| 22+ | M3 lanes | see §6 | Order within M3 is outlined, not fixed. |

⚠️ **A GATE, not a lane, sits between 21 and 22:** the **M3 owner decision batch** (§3.5 of the plan).
Seven items, one message, three-day default-to-recommendation. `Device.Name`'s double duty must be
answered **before `CryoSystem` freezes a save chapter**, not after.

⚠️ **A HARD HUMAN GATE sits at the end of week 9**, after M3: a real 60-minute owner playtest. It is on
the calendar because a plan with all its human gates in the last week has none.

---

## 4. M1 — SEE IT, AND KNOW WHY *(weeks 1–2)*

> *"I can see every wrecked machine on my ship, I can open the vent that starts the air, and when I
> paint an order that cannot happen the game tells me why — and lets me take it back."*

**Running tally: PLAYER 6 / INFRASTRUCTURE 1 / cap 1.** (Cap = ⌊7/5⌋ = 1. **M1 is AT CAP.**
Chartering a second infrastructure package in M1 is a **refusal** requiring an owner override recorded
by name and date.)

---

### M1-A — the wreck's interior is known at boot *(OD-C)* ⏳ IN FLIGHT

**CLASS: PLAYER** · **LANE: `lane/wreck-visible`** · **SIZE: M**

**Not re-specified here.** It is in flight with uncommitted work in `sim/Sim.Gen/AuthoredShips.cs`,
`ShipPlan.cs`, `ShipPlanBuilder.cs`, `SlotGridPlanner.cs`, and it also carries W4b's debt of naming
wreck deck-0 slot 3.

**What every other package needs to know about it:**
- Its acceptance criterion is **the player opens `vent_ls` in a running game** (OD-C, verbatim).
- The fog gate that keeps `vent_ls` off the `devices` channel is in **`BuildDevices`
  (`hosts/web/GameSession.cs:2210`)**, and the gate itself is **`:2230`** —
  `if ((world.GetFlags(p) & TileFlags.Explored) == 0) continue;`, *"mirroring GlyphMapper pass 4"*.
  *(Revision 0 cited `:1045`/`:1111-1112`; that is a different function's `IsExplored` helper on the
  OPERATE path, not the `devices` gate.)* M1-A does not touch that gate; it changes what
  `TileFlags.Explored` reads at boot. The authoring seam is `sim/Sim.Gen/FogReveal.cs:82` /
  `World.cs:114`.
- **PIN IMPACT is the thing to check, not the code.** Wreck-only authoring ⇒ all five hold, and that
  must be **measured** with check (A), not argued. A general rule about hull tiles ⇒ P1–P3 move and
  it joins §2's chain. This is plan §8 item 8 and it is still open.

> ### ⚠️ TWO HAZARDS M1-A CARRIES THAT ARE NOT IN ITS OWN FILES
>
> **(a) A NAMED TRIPWIRE FIRES IF THE FOG RULE GENERALISES — and it is about `--ship grid`, not the
> wreck.** `tests/Perilune.Tests/BlockedChannelTests.cs:351` and `:412` both carry, verbatim:
> > *"Note that `--ship grid` authors 20 dig designations in the hold, 10 of them blocked; **they are
> > UNEXPLORED at tick 0 and so fog-gated off this channel. If boot fog ever changes, this assertion
> > is the tripwire and the fix is to exclude them by name, not to weaken it.**"*
>
> ⇒ If M1-A authors explored space **wreck-only**, these hold. If it becomes a general rule, **both go
> red and the fix is prescribed by the test itself.** ⛔ **Do not weaken the assertion.** This is also
> the cheapest available check on whether M1-A stayed inside its charter.
>
> **(b) ⭐ M1-A ↔ M1-D IS A SEMANTIC COUPLING GIT CANNOT SEE, AND THEY MERGE AT POSITIONS 1 AND 3.**
> Every `blocked` row is fog-gated on `TileFlags.Explored` (`GameSession.cs:2311`), and M1-A changes
> what that reads at boot. **No file is shared, so git will report no conflict and the tree can still
> be wrong** — the exact shape that produced one red test in the damaged-authoring / recovery-economy
> merge. ⇒ **M1-D must re-run its full test set AND its browser acceptance AFTER M1-A merges**, in a
> tree containing both, and say so in its merge note. The same applies to M1-E.

- **CONFLICTS:** owns `sim/Sim.Gen/` for the duration. **M2-11 (`lane/power-network`) and M3-6/M3-11
  also edit `AuthoredShips.cs` — none may run concurrently with it.** Semantically coupled to **M1-D**
  and **M1-E** via `TileFlags.Explored`, and to `BlockedChannelTests.cs` via the tripwire above.

---

### M1-B — the first screen stops lying ⏳ IN FLIGHT

**CLASS: PLAYER** · **LANE: `lane/first-screen`** · **SIZE: S**

**Not re-specified here.** Scope: the onboarding card rewrite and the `B`-key lie.

**Verified this session, for the record, so the lane can be reviewed against facts:**
- `client/src/ui/onboarding.js:21` teaches `['B', 'open their dossier']`.
- `client/src/input/controls.js:257` is `else if (k === 'b' || k === 'B') onBuildKey('build');` —
  **`B` arms BUILD.**
- `client/src/ui/overview-view.js:319` renders `'[B] BIO'`, advertising a hotkey that exists nowhere.
- `onboarding.js:18-27` names Click / T / B / M / Space / 1–7 / R,F / WASD and **none** of DIG,
  STOCKPILE, STRIP, OPERATE, the Room Zoom, the deck rail.

**CONFLICTS:** `controls.js`, `onboarding.js`, `overview-view.js`. **M1-C and M1-F must rebase onto it.**

---

### M1-C — UN-DESIGNATE on the standard surface

**CLASS: PLAYER** · **LANE: `lane/undesignate`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** take back an order they painted. One STRIP drag across the cryo bay
> permanently condemns eight capsules and there is no gesture anywhere in `client/` that undoes it.
> **AFTER THIS THEY CAN** arm an ERASE tool and click, drag or sweep any painted order away.

**SEAM.**
- The code admits the gap in its own words, twice, and both comments are the docstrings you are
  replacing: `client/src/ui/overview-view.js:967-969` and `client/src/ui/roomzoom-view.js:1172-1174`
  — *"`on` is always true: this surface paints intent and never erases it… `Cmd.dig(x, y, false)`
  rides the wire and the TUI sends it, but no surface in `client/` does."*
- The wire and the sim already carry the whole capability. **Nothing new is needed below the client:**
  - `DesignateDigCommand` (`sim/Sim.Core/Commands/Commands.cs:138-158`) — `_on:false` clears
    `TileFlags.Designated`. Note `:152`: the "is it Debris" legality check is `if (_on && …)`, so the
    OFF path is deliberately precondition-free.
  - `DesignateStockpileCommand` (`:160-197`) — `_on:false` also clears the E0-4 accept-filter
    (`:186`), so an erase leaves no orphan in the ZONE hash.
  - `DesignateDeconstructCommand` (`:258-280`) → `DeconstructSystem.Cancel` (`:457`), which is
    *"pure forgetting"* — a deconstruct stages no material and holds no reservation.
  - The TUI is the working precedent: `hosts/tui/GameLoop.cs` toggles all three.
  - `GameSession.HandleStrip` (`:778-786`) already decodes `on` from `i`.
- **The client seam:** `orderPayloads(tool, x, y)` in `overview-view.js:971` and
  `paletteCommand`/`orderPayloads` in `client/src/ui/room-model.js` + `roomzoom-view.js`.
- **The palette:** `ROOM_TOOLS` at `client/src/ui/room-model.js:51-54` (16 entries today).

**DESIGN DECISION, taken here so the lane does not re-litigate it: ship a 17th tool `erase`, not a
modifier.** Rationale: right-click is being claimed by M2-10 (*Prioritise*), a shift-modifier is
undiscoverable and unadvertisable, and RimWorld's own answer is a dedicated cancel tool in the Orders
tab. `erase` clears **whichever** order occupies the tile (dig ▸ strip ▸ stockpile precedence,
matching `marks`' own precedence at `GameSession.cs:2071`), so the player does not have to know which
verb painted it.

**PIN IMPACT: PIN-NEUTRAL.** Client-only plus, at most, nothing in `hosts/`. Prove with check (A).

**SPINE? No.**

**⚠️ AN EQUALITY-PINNED CENSUS MOVES, DELIBERATELY.** `client/test/room-model.test.js:121` asserts
`ROOM_TOOLS.length === 16`. This package takes it to 17. That is a **surface decision** and the
assertion's own message says so — move it in the same commit, with the reason in the commit message.
`:1656`, `:1660` and `:1663` derive from `ROOM_TOOLS.length` and follow for free; do not hand-edit
them. `client/test/surface-boundary.test.js`'s `KNOWN_GAPS_SEALED = ['dig','stockpile','strip']`
(`:144`) is **not** affected — `erase` is a standard-surface tool, not a console verb being ported.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | In `orderPayloads`, hard-code `true` for the erase path (`Cmd.dig(x, y, true)`) | the erase round-trip test — the tile must still carry the designation after an erase |
| 2 | Delete the `erase` entry from `ROOM_TOOLS` | the palette census (17) **and** the button-count assertions at `:1656-1663` |
| 3 | Make the erase precedence pick stockpile before strip | the precedence test on a tile carrying **both** a strip order and a stockpile zone |
| 4 | Drop the sweep/drag path so erase is click-only | the drag-erase test |
| 5 | Remove the Overview's erase branch, leaving the Room Zoom's | the Overview leg — **run this leg BLINDED of the Room Zoom leg** (fifth trap: `assert` throws, so only the first leg of a multi-leg test reports) |

⚠️ **THE FIXTURE MUST CARRY BOTH FAILURE SHAPES** — a tile with one order and a tile with two — or
mutation 3 folds into an aggregate and cannot be seen.

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → enter any room in the Room Zoom.
2. Arm **DIG**, drag across four debris tiles → four dig marks appear.
3. Arm **ERASE**, click one → **that mark goes away, the other three stay.**
4. Drag ERASE across the remaining three → all gone.
5. Arm **STRIP**, click a wall → mark appears. Arm ERASE, click it → gone.
6. Back out to the Overview, paint a dig on the deck plan, and erase it there too.

**CONFLICTS.** `roomzoom-view.js`, `overview-view.js`, `room-model.js`, `overview-model.js`,
`controls.js` (new hotkey). **Must rebase onto `lane/first-screen` (M1-B) before review.** Conflicts
with **M2-3** (`lane/work-tab`, `overview-view.js`) and **M2-10** (`lane/prioritise-ui`,
`roomzoom-view.js`) — neither runs concurrently.

**SIZE: M**, and what makes it M is the *sweep* path and the precedence rule, not the wire.

---

### M1-D — the `blocked` channel's third question: can any crew member PATH here?

**CLASS: PLAYER** · **LANE: `lane/blocked-reach`** · **SIZE: M** · ⚠️ **INTEGRATOR LANE**

> **TODAY THE PLAYER IS MISLED ABOUT** why nothing is happening: two legal verbs (arm OPERATE, shut
> two doors; arm WALL, drag two tiles) produce build ghosts frozen at 0/2, a pawn reading `"Idle"`,
> and **`blocked` = zero rows, held for 480 000 ticks.** The game says the order is fine.
> **AFTER THIS** the tile carries a written reason: nobody can reach it.

**SEAM.**
- `BlockedReason` at `hosts/web/GameSession.cs:2285` asks exactly two questions — *is a neighbour
  walkable* (`:2292`) and *is it breathable* (`:2294`, `WorksiteSafety.CanStageWorkerAt`). It returns
  `NotBlocked` (`:2252`, `-1`), `WireFormat.ReasonAir` (`:2296`) or `WireFormat.ReasonNoApproach`.
- `AddIfBlocked` at `:2302-2317` is the single fog+bounds gate.
- The reason vocabulary is `hosts/web/WireFormat.Blocked.cs:277` / `:295` / `:312`, and the client
  mirror is `client/src/wire/messages.js:521-543` with `BLOCKED_REASON_NAMES` at `:533`.
- The overlay is `client/src/ui/blocked-overlay.js` (`blockedCellSvg` at `:103`, the one-row-per-reason
  legend at `:148-173`).

> ### ⭐ THE REPO ALREADY HAS THE API AND ALREADY WROTE THE PRESCRIPTION. USE THEM.
>
> ⚠️ *Revision 0 presented "the backoff is private per source" as a discovery. It is written down on
> `main`, in the file this package edits, and one source has already made it public.*
>
> **`WireFormat.Blocked.cs:78-100` states the entire fix**, in its own words, as *"⛔ OMITTED (2) —
> 'no crew can PATH here'"*:
> > *"MEASURED: `FindPath` is a whole-region sweep… running it per designated tile × up to 4
> > neighbours × every live crew member on every render at 10 Hz is not a shippable cost.
> > STRUCTURAL: the sim ALREADY KNOWS the answer — each source stamps `_retryAt` — but
> > `DigJobSource`, `BuildJobSource` and `DeconstructJobSource` keep it PRIVATE. **`HaulJobSource` is
> > the one that made it public (`IsBackedOff`…), and the honest fix is to mirror that on the other
> > three and ASK — not to re-derive a reachability answer host-side.**"*
>
> ⇒ **Do NOT use `StockpileHarness.IsReachableByAnyCrew`** (it runs `FindPath` from every crew member).
> ⇒ **Do NOT invent a name.** The shipped signature is
> **`public bool IsBackedOff(Int3 pos, long tick, out long untilTick)`** at
> `sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:137`, whose doc comment calls itself **"THE ONE
> DEFINITION OF 'BACKED OFF'"** and deliberately exposes **no `IEnumerable<Int3>`** (*"there is
> deliberately no `IEnumerable<Int3>` here to tempt anyone into shipping Dictionary layout order over
> the wire"* — an `IJobSource` rule-4 determinism constraint). **Mirror that exact shape** onto
> `DigJobSource` (`_retryAt`, `:28`), `DeconstructJobSource` (`_retryAt`, `:46`) and `BuildJobSource`
> (`_readyRetryAt` `:210`, `_matRetryAt` `:223`), lift it to `IJobSource`, and fan out from
> `JobSystem` so `GameSession` asks one question.
> **⇒ THIS IS A `sim/` CHANGE, NOT A HOST-ONLY ONE**, and it is the cheapest of the two open wins that
> header names — the other (`DigJobSource`'s site list, worth **8.45 µs of a ~517 µs render, ~1.6 %,
> for ZERO rows**) *"composes with the `IsBackedOff` mirror above — the same lane can do both."*
> **RECOMMEND: take both.** Stamp value: `JobWork.UnreachableRetryTicks = 50` (`JobContext.cs:55`).

> ### ⚠️ THREE LIMITS, IN THE CHARTER. THE SECOND ONE IS A DEFECT IF IT IS NOT DECIDED.
>
> **(1) IT UNDER-CLAIMS.** The backoff is stamped only for tiles somebody actually **tried** to reach.
> A tile nobody has attempted carries no stamp. That is the direction `WireFormat.Blocked.cs`'s header
> already commits to (*"a SUBSET of the truly-refused sites, never a superset"*). Write it into the new
> reason's doc comment. ⛔ Do **not** patch it with a second host-side `FindPath` — a reason derived
> from a second implementation can disagree with the behaviour it explains.
>
> **(2) ⭐ IT EXPIRES, AND ON A ONE-PAWN SHIP THE REASON WILL BLINK OUT WHILE NOTHING HAS CHANGED.**
> Two mechanisms, both verified: the stamp lasts **50 ticks** (`JobContext.cs:55`), and
> `HaulJobSource.ForgetBackoffsOnTileChange` (`:487-489`) **clears the whole map** on any
> `JobBoardDirty.Tiles`. Re-stamping requires a pawn to *attempt the claim again* — and a pawn busy on
> a 900 s Maintain service will not, for **9 000 ticks**. ⇒ **The tile carries a reason for 5 seconds
> and then goes silent for fifteen minutes, with the door still shut.**
> ⛔ **This is the invisible-feedback failure the `marks` channel exists to prevent, re-introduced by
> the package built to remove it** — the `marks` lesson verbatim: *a designation the player cannot see
> is indistinguishable from a broken verb.*
> **⇒ A DECISION THIS PACKAGE MUST TAKE AND WRITE DOWN. RECOMMEND: the CLIENT latches.** The overlay
> keeps the last non-empty reason for a tile until either a row with a *different* reason arrives or
> the tile leaves the order registry entirely. Rationale: it needs no sim change, it cannot
> over-claim (the tile is still an unstarted order either way), and the alternative — extending the
> backoff — is a determinism-path tuning change to `UnreachableRetryTicks` that affects the
> dispatcher's cost on every ship. ⚠️ **Whichever is chosen, the driven leg below is mandatory.**
>
> **(3) IT IS NOT THE SAME PREDICATE AS "UNREACHABLE".** `IsBackedOff` means *"a claim was attempted
> and failed recently"*. The reason's wire label and the client's legend text must say the weaker,
> true thing.

**PIN IMPACT: PIN-NEUTRAL — and it must be proven, not claimed**, because it touches `sim/`. The
addition is a read-only accessor over non-hashed, non-serialized state (`HaulJobSource.cs:30` says so
of `_retryAt` in its own words: *"never saved, never hashed, never restored"*). Check (A), plus
`git diff main...HEAD -- sim/ | grep '^+' | grep -v '^+\s*//'` read line by line.

**SPINE? YES — `WireFormat` AND an `IJobSource` contract change.** ⇒ **integrator lane** (see §11's reconciliation).
The reason is append-only: `ReasonUnreachable = 3` (2 is taken, see §12.4).

**MUTATIONS.**

⚠️ **THE CARRIER SET IS THREE REGISTRIES, NOT FOUR — verified, and revision 0 got this wrong.**
`BuildBlocked` walks exactly: **dig tiles** (the `TileFlags.Designated` plane, `GameSession.cs:2418-2425`)
· **strip** (`DeconstructSystem.Pending`, `:2427-2433`) · **build** (`BuildSystem.Pending`, `:2435+`).
⛔ **There is NO stockpile walk and one must not be added.** `WireFormat.Blocked.cs:114-121` refuses it
by name — *"⛔ NOT DUPLICATED (3) — the stockpile haul back-off. They are already covered,
authoritatively, and adding them here would be the two-sources-for-one-layer defect the `marks` channel
exists to remove: `WireFormat.ZoneFlagBackedOff` carries it on the `zones` channel (fed by
`HaulJobSource.IsBackedOff`) and the Room Zoom ALREADY DRAWS IT."* ⇒ **Revision 0's mutation 5 (a
`HaulJobSource`-only leg) had no carrier and is deleted.** The fourth leg below is the build
**material** backoff (`_matRetryAt`), which is a genuinely distinct carrier from build-**ready**
(`_readyRetryAt`) and is the one the 480 000-tick scenario actually trips.

| # | mutation | must go red |
|---|---|---|
| 1 | Make `IsBackedOff` `return false;` in `JobSystem`'s fan-out | the driven reachability test — **this is the "verb parity is not sufficient" shape; the seam the package exists to deliver must be pinned by a DRIVEN result, never by a scan for its own signature** |
| 2 | `return false` in **`BuildJobSource._matRetryAt` only** | the build-**material** leg — **the 480 000-tick scenario**; blinded of the other legs |
| 3 | `return false` in **`BuildJobSource._readyRetryAt` only** | the build-**ready** leg, blinded |
| 4 | `return false` in **`DigJobSource` only** | the dig leg, blinded |
| 5 | `return false` in **`DeconstructJobSource` only** | the strip leg, blinded |
| 6 | Delete the fog gate at `GameSession.cs:2311` for the new reason | the fog test — an unreachable tile in unexplored space must not leak |
| 7 | Reorder `BlockedReason` so the new question runs before the air question | the precedence test: a tile that is **both** airless and unreached must report **air** (the player's next action differs, and `WireFormat.Blocked.cs:284` argues this at length) |
| 8 | Remove `'unreachable'` from `BLOCKED_REASON_NAMES` | the client decode test **and** the legend test |
| 9 | ⭐ **Delete the latch** (or, if the sim-side answer was chosen, shorten the persistence) | ⭐ **THE PAST-EXPIRY LEG, and it is the one revision 0 did not have.** Fixture: one pawn, a designated build behind a shut door, the pawn then given a long job elsewhere. Drive **past `UnreachableRetryTicks` + a `JobBoardDirty.Tiles` event** — e.g. 600 ticks — and require the row to **still be there**. Without this leg the package ships a reason that is correct for 5 seconds and silent thereafter, and the whole suite is green |
| 10 | Return `true` unconditionally | the clear leg: open the door, drive, require the row to **vanish** |

**NON-VACUITY, BY INCLUSION — both directions, and both are required.** Do not settle for *"the
harness matched something"*. **Plant the violation:** a designated tile walled off by a shut door,
driven past `UnreachableRetryTicks`, must produce a row with reason 3. **Then plant the negative:**
open the door, drive again, require the row to vanish (mutation 10). A guard that only proves the row
appears is satisfied by a channel that reports every tile forever.

⚠️ **AND ONE MUTATION THAT MUST *NOT* GO RED:** with M1-A merged, `BlockedChannelTests.cs:351` and
`:412`'s leg-isolation assertions must still pass. **If they fire, M1-A generalised the fog rule and
the fix is theirs, not yours — exclude the grid designations by name, never weaken the assertion.**

**ACCEPTANCE (browser, < 5 min).** This is the plan's own measured 480 000-tick scenario, reproduced:
1. `./play.sh` → Room Zoom, a hall with two doors.
2. Arm **O** (OPERATE), click both doors → they read SHUT.
3. Arm **B** (WALL), drag two tiles **inside** the now-sealed hall → two ghosts.
4. Set max speed. Wait ~10 sim-seconds.
5. **Both ghost tiles now carry a written reason, and the legend row says the crew cannot reach them.**
6. ⭐ **Wait a full sim-minute without touching anything. The reason is STILL THERE.** *(This is the
   step that fails if the latch decision was skipped, and it is the reason a human runs this demo
   rather than trusting the suite.)*
7. Arm **O**, re-open one door → the reason clears on its own.

⚠️ **THIS ACCEPTANCE MUST BE RE-RUN AFTER `lane/wreck-visible` (M1-A) MERGES**, in a tree containing
both — every `blocked` row is fog-gated on `TileFlags.Explored` and M1-A changes what that reads at
boot. Git will report no conflict. Say in the merge note that it was re-run.

**CONFLICTS.** `hosts/web/GameSession.cs` (`BlockedReason`, `AddIfBlocked`), `WireFormat.Blocked.cs`,
`client/src/wire/messages.js`, `client/src/ui/blocked-overlay.js`, `sim/Sim.Core/Jobs/*` (four sources
+ `IJobSource`), `tests/Perilune.Tests/BlockedChannelTests.cs`. **Serialize against M1-E** (same two
functions) **and against M2-18** (same channel). ⭐ **Semantically coupled to M1-A** — no shared file,
real coupling.

**SIZE: M** — the `IJobSource` mirror across three sources, the latch decision, and the ten-row
mutation table. **Not** the reason code, and **not** the discovery: the API and the prescription were
already on `main`.

---

### M1-E — the silent-refusal census, and the refusals that can be surfaced today

**CLASS: PLAYER** · **LANE: `lane/refusal-reasons`** · **SIZE: M**

> **TODAY THE PLAYER IS MISLED ABOUT** why a STRIP order on an occupied cryo capsule does nothing.
> The sim refuses it (`DeconstructSystem.cs:400`), the mark never appears, and no surface says a word
> — on the ship whose entire premise is those capsules. **AFTER THIS** the click answers, in writing,
> at the instant of the click.

**SEAM — and read this before you plan the work, because two of the plan's five refusals cannot be
carried the way it assumes.**

The census, enumerated and adjudicated against the code this session:

| # | refusal | site | reaches a surface today? | this package |
|---|---|---|---|---|
| 1 | unbreathable worksite (**thermal counts**) | `WorksiteSafety.CanStageWorkerAt`, via `GameSession.cs:2294` | ✅ `ReasonAir` | ledger only |
| 2 | no walkable approach | `GameSession.cs:2296` | ✅ `ReasonNoApproach` | ledger only |
| 3 | no crew can reach it | — | ❌ | **M1-D** |
| 4 | machine below `wear.wreck_threshold` with no consumable | `MaintenanceSystem.IsUnfixableWreck` (in `sim/Sim.Core/Systems/MachineWearSystem.cs`) | ❌ — **and it CANNOT be surfaced yet** | **deferred to M2-9, by name** |
| 5 | locked door on OPERATE | `GameSession.cs:1066-1071` | ✅ one-shot `EmitOperate(… OperateRefused …)` | ledger only |
| 6 | STRIP on a closed occupied cryo pod | `DeconstructSystem.cs:400` | ❌ | **this package** |

> ⭐ **§12.4 — `ReasonNoConsumable` IS ALREADY BUILT AND DELIBERATELY UN-EMITTED.**
> `WireFormat.Blocked.cs:312` declares it, `client/src/wire/messages.js:543` already names it
> *"NO PARTS OR SEALS ABOARD"*, and `tests/Perilune.Tests/BlockedChannelTests.cs:794-811` **pins that
> this host never emits it.** The vocabulary is done. **What is missing is an ORDER to hang it on:**
> `blocked` rows are read from the two **order registries** (`GameSession.cs:2432` walks
> `DeconstructSystem.Pending`), and there is no repair order in the game. ⇒ **Emission is chartered
> in M2-9, in one line, against a name already on the wire.** Do not force it here by inventing a
> pseudo-order; that is the second-authority mistake the channel's header refuses.

> ⭐ **§12.5 — REFUSAL 6 CANNOT BE A `blocked` ROW EITHER, AND FOR A DIFFERENT REASON.**
> `DeconstructSystem.Designate` (`:435-452`) is `if (!CanDesignate(...)) return false;` — **it refuses
> without registering.** There is no pending site, so no row can exist. ⇒ It must be a **one-shot
> click reply on the OPERATE precedent**: `GameSession.HandleStrip` (`:778-786`) asks the same
> predicate before enqueueing and emits a refusal the client shows at the cursor, exactly as
> `EmitOperate(pos, WireFormat.OperateRefused, …)` does at `:1067`. The code's own comment at
> `DeconstructSystem.cs:397-400` says *"the `blocked` channel is the surface that should carry it"* —
> **that comment is wrong about the mechanism and this package corrects it in place.**

**Contents, therefore:**
1. **The refusal ledger** — a single enumerated table in `hosts/web/WireFormat.Blocked.cs`'s header
   (the existing home of this argument), each row naming its site, its carrier and whether it is
   discharged. Guarded by an **inclusion test**, not a count.
2. **Refusal 6 surfaced** as a one-shot strip reply.
3. **Refusal 5's advisory wording checked** against the OPERATE work that shipped 2026-07-28 — the
   status snapshot records that run *"twice mis-stated all four as refusals"* when three are
   advisories on an accepted toggle. Re-read `GameSession.cs:1066-1071` and `:1158-1173` and fix any
   prose that survived.

**PIN IMPACT: PIN-NEUTRAL.** Host + client only. Check (A). If a `sim/` edit is needed for prose,
apply the `marks`-lane check: `git diff main...HEAD -- sim/ | grep '^+' | grep -v '^+\s*//'` → empty.

**SPINE? Partly** — if refusal 6 needs a new `WireFormat` reply code, integrator lane. It may not:
`WireFormat.Operate.cs`'s refusal shape may be reusable verbatim. **Decide that in the package and say
which.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Delete the pod check from `HandleStrip` so the command is enqueued blind | the driven test: click STRIP on an occupied pod → **a refusal must be emitted**, not silence |
| 2 | Invert the pod check to `device.IsOpen` | the control leg: an **open** pod is empty furniture and **is** strippable (`DeconstructSystem.cs:395-401`) — this must stay accepted |
| 3 | Add a fabricated row to the ledger for a refusal that has no site | the ledger's inclusion test — **plant a known violation and require it be caught**; a population count proves a matcher matched something, never that it would match the thing |
| 4 | Remove a real row from the ledger | the ledger's completeness test, which enumerates refusal sites from source with `CodeOnly` |
| 5 | ⭐ **PLANT A NEW REFUSAL SITE IN `sim/` — a fresh `return false` on a player-reachable path — and leave the ledger untouched** | ⭐ **THE COMPLETENESS TEST MUST GO RED.** This is the only direction that actually rots: a ledger is not at risk of losing a row, it is at risk of the code **growing one**. ⚠️ Mutation 4 (delete a row) is satisfied by a hard-coded list; **only this one proves the guard reads the code.** If the enumeration cannot see a planted site, the ledger is a transcription and must be re-scoped to say so |
| 6 | Emit `ReasonNoConsumable` from anywhere in this package | `BlockedChannelTests.cs:810` must **stay red** — ⚠️ this package must leave that pin **intact and passing**; if it goes green-by-emission you have taken M2-9's work |

⚠️ **Mutations 4 and 5's guard scans source text ⇒ requirement (B) applies in full**: `CodeOnly` plus a
negative control whose fixture contains a **later real comment**.

⚠️ **RE-RUN AFTER M1-A MERGES**, for the same fog reason as M1-D.

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → Room Zoom → the cryo bay.
2. Arm **STRIP**, click a capsule that reads occupied → **a refusal appears at the cursor, in words.**
3. Click the one open capsule → **it takes the mark** (the control — the verb is not just switched off).
4. Arm **O**, click a locked door → the existing refusal still reads correctly.
5. Arm **O**, click a wrecked but unlocked vent → it **toggles**, with an advisory, **not** a refusal.

**CONFLICTS.** `GameSession.cs`, `WireFormat.Blocked.cs`. **Serialize against M1-D.**

**SIZE: M** — the census and its inclusion test, not the one-shot reply.

---

### M1-F — the morale bar stops drawing a constant

**CLASS: PLAYER** · **LANE: `lane/morale-bar`** · **SIZE: S**

> **TODAY THE PLAYER IS MISLED ABOUT** their one crew member's morale: the CREW WATCH bar is fed by
> `Citizen.Morale`, which is **never written outside its initialiser**. The bar is a constant painted
> to look like a reading. **AFTER THIS** the bar is gone, and nothing on the first screen pretends to
> a number the sim does not compute.

**SEAM — AND THERE ARE FIVE DRAW SITES ACROSS THREE FILES, NOT ONE.** *(Revision 0 named only the
CREW WATCH bar. All five verified this session.)*

| # | site | `file:line` | in scope? |
|---|---|---|---|
| 1 | CREW WATCH bar markup | `client/src/ui/overview-view.js:675` (`ov-morale` / `ov-morale-fill`) | ✅ **remove** |
| 2 | its element cache | `client/src/ui/overview-view.js:682` | ✅ **remove** |
| 3 | its per-frame fill + colour | `client/src/ui/overview-view.js:699-702` (`moraleColor(mv)`) | ✅ **remove** |
| 4 | the dossier MORALE meter | `client/src/ui/panels.js:313-315` | ✅ **remove** |
| 5 | the console CREW table's morale track/fill and `TABLE_CELLS`' `'tc-morale'` | `client/src/ui/hud.js:951-953`, `:981-984`, `:1008` | ⛔ **OUT OF SCOPE — and stated, not missed** |

⛔ **`hud.js` IS DELIBERATELY LEFT ALONE, and the reason is the invariant, not laziness.** It is the
deprecated console `.app` shell, **closed to new work**, and `TABLE_CELLS` (`:1008`) is inside the
equality-pinned widget census `surface-boundary.test.js` holds. Touching it moves a census for a
surface scheduled for deletion at **M4-8 (WP-9)**, which is where the morale track dies with the rest
of the shell. ⚠️ **Write that into the package's own record** — a future reader must be able to tell
"deliberately excluded" from "not found".

**⭐ AND ONE THING THAT IS NOT A DRAW SITE BUT IS PART OF THE LIE:** `client/src/ui/panels.js:219`'s
own ledger comment lists **morale** among the fields it calls **REAL** — *"REAL — carried by the wire
today: portrait, name, role, current emotion, **morale**, traits…"*. **The ledger must be corrected in
the same commit.** A ledger that misclassifies its own subject is how the next lane re-adds the bar in
good faith.

**⭐ AND A FIELD-NAME TRAP AN IMPLEMENTER WILL WALK INTO.** `Citizen.Morale`
(`sim/Sim.Core/Entities/Citizen.cs:34`, *"Raider resolve 1..0; breaking triggers withdraw/surrender
(RaiderSystem)"* — **there is no `RaiderSystem`**) is **NOT** `ShipMetricsSnapshot.Morale`.
The latter is **real and computed**, from mean crew `Mood`, and it is load-bearing: it weights
`DirectorSystem`'s tension (`sim/Sim.Core/Director/DirectorSystem.cs:82`,
`d.WeightMoraleDeficit * (1f - m.Morale)`) which moves `_wearPressure` (`:58`) which
`MachineWearSystem` reads. ⛔ **Do not touch it, do not "unify" the two, and do not let a review
conflate them.** The constant is the per-citizen field; the ship metric is fine.

**⚠️ DO NOT DELETE `Citizen.Morale`.** It is saved and hashed. Removing it is a pin move for a
cosmetic fix, and whether morale becomes real is an **M4-4 decision** the plan explicitly keeps open.
This package removes bars. That is all it does, and the charter says so to stop scope from arriving
in review.

**PIN IMPACT: PIN-NEUTRAL** — client (and at most a roster wire field left emitted-but-undrawn).
Check (A).

**SPINE? No** (unless the roster field is removed — **do not remove it**).

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Re-add the morale bar element to the CREW WATCH row builder | the equality-pinned CREW WATCH element census |
| 2 | Re-add the MORALE meter to the dossier | the `panels.js` section census — **blinded of leg 1**, or a shared count folds them |
| 3 | Set `Citizen.Morale = 0.4f` in a test sim and render | ⚠️ **NOTHING may change on screen** — the negative half |
| 4 | ⭐ **PAIRED POSITIVE CONTROL: set `Citizen.Hunger = 0.8f` on the same fixture and render** | ⭐ **SOMETHING MUST CHANGE.** Leg 3 alone is a **bare negative**, satisfied by a renderer that has stopped drawing *anything* — a broken fixture, a crashed builder, a stubbed `render()` all pass it. **Run 3 and 4 on the same fixture in the same test file and require 4 to fire.** Without 4, leg 3 is the "guard satisfied by its own subject commented out" shape wearing a rendering costume |
| 5 | Revert `panels.js:219`'s ledger correction | the ledger-vs-drawing consistency test |

⚠️ **Legs 3+4 together are the point.** A guard that only asserts *"no element with class
`ov-morale`"* is satisfied by a bar renamed. Assert on **rendered output under a changed input**, and
prove the instrument is live with a field that *is* still drawn.

**ACCEPTANCE (browser, < 5 min).** `./play.sh` → the CREW WATCH row for Rell shows her name, her task,
and her real needs — **and no morale bar anywhere.** Open the dossier: **no MORALE meter**, and the
needs that *are* drawn still move when the sim moves.

**CONFLICTS.** `overview-view.js` — **rebase onto `lane/first-screen` (M1-B)**; serialize against
M1-C and M2-3. Also `panels.js` — **serialize against M4-3/M4-4**, which rewrite the same card.

**SIZE: S.**

---

### M1-G — the premise correction

**CLASS: INFRASTRUCTURE** *(docs only; no player sentence, and inventing one would be the exact
failure §6 exists to prevent)* · **LANE: `lane/premise-fix`** · **SIZE: S**

**What it is.** `CLAUDE.md`'s headline framing of the opening move — *"open the vent, push the air
outward"* — describes **a mechanic the sim has never implemented.** Verified this session at
`sim/Sim.Core/Systems/AtmosphereSystem.cs:136-146`: an `AirVent` **injects** dry Earth mix *"from an
unmodelled reserve"* into **its own room**, and *"venting into room 0 is refused outright"*. There is
no neighbour term. **Nothing falls next door.**

**SEAM.** `CLAUDE.md`'s status snapshots · `docs/VISION.md` · `docs/MECHANICS.md` · any demo script
that repeats it.

**GATED ON THE M1 OWNER DECISION BATCH.** Two answers, both cheap:
- **(recommended)** change the premise's wording — the injection model already produces the frontier
  the design wants;
- or give the vent a source room and a sign, which is a **new gas mechanic** and does not belong in a
  two-week milestone.

**PIN IMPACT: PIN-NEUTRAL** (docs). **SPINE? `CLAUDE.md` lives on the main checkout ⇒ integrator.**

**MUTATIONS: none — it is prose.** Its guard is the owner batch, not a test. *(A package whose
deliverable is a document does not get a fabricated mutation table; that is what the
INFRASTRUCTURE label is for.)*

**ACCEPTANCE: none — INFRASTRUCTURE carries no demo.**

**CONFLICTS.** `CLAUDE.md`, `MECHANICS.md` — collides with every re-pin commit. Land it in a quiet
window between pin-chain rows.

---

## 5. M2 — THE ORDER *(weeks 3–6)*

> *"I can tell Rell that repairing machines matters more than carrying rubble, or right-click one
> specific broken machine and say 'that one, now' — and when she fixes the reactor wing, the lights
> come on."*

**Running tally: PLAYER 12 / INFRASTRUCTURE 3 / cap 3.** (15 packages; cap = ⌊15/5⌋ = 3.
**M2 is AT CAP.** A fourth infrastructure charter is a **refusal**.)
⚠️ *M2-1 is `PLAYER` under the **split-sentence rule** stated in its own charter — the one load-bearing
exception in this document. Re-checked in revision 1: relabelling it `INFRASTRUCTURE` would take M2 to
**4 of 15 against a cap of 3**, i.e. straight into a refusal, which is precisely why the rule is
written down and countable rather than applied silently.*

> ### ⭐ M2'S OWNER DECISION BATCH — one message, each item with a recommendation and a blast radius
> *(Plan §3.5's rule: anything unanswered after three days takes the recommendation, is marked
> REVERSIBLE, and is listed in the milestone's record as such.)*
>
> 1. **How many work types, and their names.** *Recommend the six in M2-1.*
> 2. **Does `HoldPosition` survive, or become "everything disabled"?** *Recommend: survives.*
> 3. **May a priority ever override `CanStageWorkerAt`?** *Recommend: **never**.* (Pinned by M2-5
>    mutation 7.)
> 4. **The pre-emption policy** — M2-7's table. *Recommend: droppable everywhere except mid-haul
>    carrying cargo, where the cargo is set down first.*
> 5. **Does an explicit *Prioritise* order override the work grid?** *Recommend: yes (RimWorld's
>    answer) — but never physics.* (M2-9 mutation 2.)
> 6. ⭐ **NEW IN REVISION 1 — THE FINITE REPAIR ECONOMY, and it is a soft-lock shape.** The wreck
>    carries **1 Parts + 2 Seals**; `IsUnfixableWreck` (`MachineWearSystem.cs:463-472`) permanently and
>    silently refuses every device below `wreck_threshold = 0.25` once no consumable remains, and
>    `wing_b` (0.18) and `wing_c` (0.06) are both below it. **Three options — (a) author more
>    consumables · (b) let the free jury-rig reach below the floor for generation-only devices ·
>    (c) accept it and surface it via `ReasonNoConsumable`, which M2-9 already emits.** Full statement,
>    including the `Swarf` escape route and the 0.10 kW margin it leaves, in **M2-12**.
>    ⛔ **Recommendation deliberately withheld — this is a difficulty-curve decision, not an
>    engineering one.** ⚠️ **M2-12 must also measure and report where the standing maintenance rule
>    spends those three consumables in an unattended run**, because if the answer is "not the wings"
>    the soft-lock is the default outcome rather than a mistake the player has to make.

---

### M2-0 — THE R1 SPIKE *(week 1, in parallel with M1; NEVER MERGES)*

**CLASS: INFRASTRUCTURE** · **LANE: `lane/spike-dispatch`** · **SIZE: S**

**What it answers.** Plan §8 item 1: *whether M2's dispatch rewrite is three days or three weeks.*
This is the single largest uncertainty in the quarter and it sizes M3, M4 and M5.

> ⛔ **THE SPIKE AS ORIGINALLY WRITTEN RETURNED A FALSE PASS, and that is the whole point of this
> package.** *"Does Repair@1 beat a painted strip order"* **passes on the shipped sim with nothing
> built**, because a 900 s Maintain service monopolises the pawn (measured: **54 650 ticks — 1 h 31
> min of sim time**). A spike whose passing leg the unmodified codebase also passes has measured
> nothing.

**THE THREE LEGS. All three are required; the spike is uninterpretable without leg A.**

- **Leg A — BASELINE CONTROL (mandatory).** The shipped sim, no changes, one pawn on `--ship wreck`.
  Record the exact order of events and the tick numbers. **Publish it even though it is boring.**
- **Leg B — THE INVERTING CRITERION.** With a throwaway veto: **Haul@1 / Repair@4**. Require the
  observed order to **invert** — the pawn strips and does **not** service. **This is a result the
  shipped sim cannot produce**, which is precisely why it is the criterion.
- **Leg C — PRE-EMPTION.** Flip to Repair@1 mid-service and require the pawn to be **taken back**.

**SEAM (for the throwaway, which must be as ugly as it likes).** `JobSystem.TryAssign`
(`sim/Sim.Core/Jobs/JobSystem.cs:220`, decisive line `:243`); `MaintenanceSystem.RecruitForNeediest`
(`sim/Sim.Core/Systems/MachineWearSystem.cs:189`) and its `FindNearestIdle` (`:418`);
`Citizen.IsRecruitableForWork` (`sim/Sim.Core/Entities/Citizen.cs:103`).

**DELIVERABLE.** A written answer to three questions, with tick numbers: (1) does the band loop as
specified in M2-5 produce leg B? (2) what does pre-emption actually cost to build, having tried it?
(3) **does the strictly-higher-band rule (M2-5's decision) hold shipped behaviour byte-identical at
all-default priorities?** — because if it does not, M2-5 joins the pin chain and M2 grows a row.

**PIN IMPACT: N/A — the branch is destroyed.** ⚠️ **It must NOT be merged, and its measurements must
not be quoted as behaviour of anything on `main`.**

**MUTATIONS: none.** It is a measurement, and its own trap is the false pass, handled by leg A.

⚠️ **`git checkout` MUST NOT APPEAR IN THIS SPIKE'S HARNESS.** Restore from an in-memory copy taken
before the first mutation, and restore with `shutil.copy` + `os.utime`, never `copy2` — a preserved
mtime makes MSBuild skip the rebuild and the next run silently executes the previous mutation's
assembly.

**CONFLICTS: none** (throwaway worktree).

---

### M2-1 — per-citizen work-type priorities *(the state)*

**CLASS: PLAYER** · **LANE: `lane/work-state`** · **SIZE: L** · ⛔ **PIN CHAIN M2-a — RUNS ALONE**

> **TODAY THE PLAYER CANNOT** say which of their crew does which kind of work. `Citizen` has no
> skill, no work-type mask, no priority and no work-rate multiplier — verified across the full field
> list at `sim/Sim.Core/Entities/Citizen.cs:7-124`; the only per-citizen work gate in the entire type
> is the boolean `IsRecruitableForWork` at `:103`. **AFTER THIS** the state exists to say it, and the
> next four packages give it a filter, a wire, a table and a reason line.

**SEAM.**
- `sim/Sim.Core/Entities/Citizen.cs` — add the priority bytes **and the reserved skill byte**.
- `sim/Sim.Core/Save/SaveWriter.cs:43` (`CitizenChapter = "CITZ"`), `:110`, `:227`; the mirror in
  `SaveReader.cs:113`, `:234`. **CITZ version bump.**
- `sim/Sim.Core/Simulation.cs` — the citizen hash pack (the W0-1 un-aliasing work and W0-1b's
  thirteen-field fold are the shape to copy; see `Simulation.cs:421`).
- `tests/Perilune.Tests/` — save round-trip in the **same commit** (invariant).
- `ArchitectureBoundaryTests`' `("Skill", "does not exist anywhere in sim/ yet")` row — **this
  package deletes it.**

**THE SHAPE, decided so the lane does not re-litigate it** *(integrator, `DESIGN-NOTE-priority-grid-seam.md`)*:
- **SIX work types**, mapped to what exists rather than invented: `Mine` (Dig) · `Haul` ·
  `Construct` (Build + HaulToBuild) · `Deconstruct` · `Repair` (Maintain) · `Craft`.
- ⛔ **`Eat` / `Drink` / `Flee` are NEVER work types and are never gated.** Needs and
  self-preservation are not work. RimWorld agrees — you cannot switch off eating. **See §12.3: the
  plan of record lists `SustenanceSystem` as an assignment site and it must not be gated.**
- **Priorities 1–4 plus off**, 1 highest. **Default every work type to 3 for every pawn**, so shipped
  dispatch behaviour is the closest thing to today's and the grid is opt-in.
- ⭐ **Land the skill byte's STORAGE in this same commit, zeroed and with no consumer.** The chapter
  is bumping anyway; W0-1b folded **thirteen** saved-but-unhashed fields in one pin move. This costs
  M2 nothing and saves M3 an entire re-pin. Plan §3.1 — *the one place batching is correct.*
- ⛔ **NO DEF FIELD.** Six work types and a default of 3 are **literals**, on the deck-confined-wander
  precedent. This is what keeps **P4 and P5 off the head of the pin chain**.
- **`HoldPosition` stays** as the all-or-nothing escape hatch; the grid does not replace it. *(Whether
  it survives long-term is an M2 owner-batch item.)*

**PIN IMPACT: P1, P2, P3 MOVE. P4, P5 EXPECTED TO HOLD — measure, do not predict.**
New hashed `Citizen` state ⇒ CITZ chapter ⇒ the fold changes on every ship. The re-pin commit carries
`ci.sh` + `CLAUDE.md` + `MECHANICS.md` + `HANDOVER.md` + memory. **Then tag `pin/m2-a` and record all
five values in the tag's own commit.**

⚠️ **`JobDispatchTests`' pinned assignment sequence must NOT move in this package.** This package adds
state that nothing reads. If that sequence moves here, something is reading the new bytes and the
package is not what its charter says.

**SPINE? YES** — `Simulation.cs`, save chapters. **Integrator lane only.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Drop the priority bytes from `WriteCitizens` | save round-trip |
| 2 | Drop them from `ReadCitizens` | save round-trip |
| 3 | Drop the skill byte from the writer (leave priorities) | save round-trip — ⚠️ **the reserved byte must be pinned by its own leg, blinded of the priority legs**, or "reserved and zeroed" is indistinguishable from "not written". This is the seventh-trap shape: an unread field asserted only against itself is not pinned |
| 4 | Drop the priority bytes from the `Simulation` hash fold | the hash-honesty test — every saved field is hashed |
| 5 | Drop the skill byte from the fold | same, blinded |
| 6 | Change the default from 3 to 2 | the defaults test **and** the newly re-pinned P1/P2/P3 |
| 7 | Alias two work types onto the same bit/slot | the round-trip test with **distinct** values per work type — ⚠️ this is `RoomType.Cryo = 16` wearing a new coat: **six work types × 3 bits = 18 bits; check your packing does not fold two onto one word**, and write the arithmetic into the test's message the way `StateHashHonestyTests.cs:134` did |

⚠️ **Mutation 7 is the one that has actually bitten this repo.** `RoomType.Cryo = 16` hashed
identically to `None` because `16 << 60` is zero, and a comment had **predicted it in writing** four
days earlier. Do the packing arithmetic in the test, not in your head.

> ### ⭐ ITS CLASSIFICATION, DEFENDED — because on the face of it this looks like the cheat the cap exists to prevent
>
> Revision 0 chartered this `PLAYER` while also writing *"deliberately invisible"* and *"the honest
> answer is that there isn't one"* under ACCEPTANCE. **Review was right to call that out**, and the
> resolution is a stated rule rather than a re-label:
>
> > **THE SPLIT-SENTENCE RULE.** When ONE player sentence is split across several packages **solely to
> > make a pin move separately attributable**, the sentence attaches to the package that **carries the
> > pin**, and the remaining packages inherit it. The split must be declared at charter time, the
> > packages must land **in the same milestone**, and the **demo is named and owned by one of them**.
>
> Here: the sentence is *"the player cannot say which of their crew does which kind of work"*, the
> pin-carrying package is **M2-1**, the co-packages are **M2-2 / M2-3 / M2-4**, and **the demo is
> M2-3's**. ⚠️ **If M2-1 lands and M2-3 does not land in M2, the sentence was fabricated after all** —
> that is R3 exactly, and it is why the split is declared rather than discovered.
>
> **Why not simply mark it INFRASTRUCTURE:** that would be the *other* dishonesty. This package is not
> a re-pin, a save migration, a provider bump or a guard repair — it is the first quarter of a player
> feature, and labelling it infrastructure would consume a scarce budget slot **and** let a real
> feature dodge the demo requirement. §6(3c) already rules that *"a pin-moving package counts once,
> under whatever its own sentence made it."*
>
> ⛔ **A reviewer applying this rule must check that the co-packages are chartered, not promised.**
> The rule is a load-bearing exception, so it is written down and countable — and this document uses
> it **exactly once**. **If a second package ever claims it, that is the signal the rule has become a
> loophole.**

**ACCEPTANCE.** ⚠️ **This package is deliberately invisible, and it is covered by the split-sentence
rule above.** Its acceptance is the gate plus the pin ritual; **the browser demo is M2-3's**, and
M2-3 must be chartered and scheduled inside M2 before this package is started.

**CONFLICTS.** Owns `Citizen.cs`, `SaveWriter.cs`, `SaveReader.cs`, `Simulation.cs` for the duration.
**Nothing else runs.**

**SIZE: L**, and what makes it L is the **pin ritual and the packing**, not the fields.

---

### M2-2 — the FOUR-SITE work-type veto

**CLASS: PLAYER** · **LANE: `lane/work-veto`** · **SIZE: M** · ⚠️ **INTEGRATOR LANE**

> **TODAY THE PLAYER CANNOT** stop a crew member from taking a kind of work. **AFTER THIS** a work
> type set to *off* is refused at **every** place the sim can put a job on a pawn.

> ### ⭐ THIS IS THE PACKAGE THE PLAN OF RECORD WARNS SHIPS HALF-DONE. THE SITES, VERIFIED:

| # | site | `file:line` | what it does today |
|---|---|---|---|
| 1 | `JobSystem.TryAssign` | `sim/Sim.Core/Jobs/JobSystem.cs:220-273`, decisive line `:243` | the distance-only argmin across the four `IJobSource`s |
| 2 | `MaintenanceSystem.FindNearestIdle` | `sim/Sim.Core/Systems/MachineWearSystem.cs:418-434`, called from `:248` | nearest recruitable pawn, outside the dispatcher |
| 3 | `CraftingSystem.FindNearestIdle` | `sim/Sim.Core/Systems/CraftingSystem.cs:467-483`, called from `:164` | identical shape, outside the dispatcher |
| 4 | `EffectValidator` | `sim/Sim.Core/Effects/EffectValidator.cs:141` | `citizen.JobKind = JobKind.Dig;` written **directly from the LLM effect pipeline**, bypassing `TryAssign` and **not consulting `IsRecruitableForWork`** |

> ⛔ **THERE IS A FIFTH SITE — TWO ENTRY POINTS — AND NEITHER MAY BE GATED.**
> `SustenanceSystem.cs:82` recruits on `IsIdleForWork`, deliberately **not** `IsRecruitableForWork`;
> `Citizen.cs:86-90` states the rule — *"a move order suppresses WORK, never SURVIVAL… An order the
> player gave must not be a way to starve someone."*
> ⚠️ **AND THERE IS A SECOND DOOR, WHICH REVISION 0 MISSED:** `SustenanceSystem.cs:83-84` is
> `else if (citizen.HoldPosition && !citizen.Dead && !citizen.HasPath) TryServeInPlace(sim, citizen);`
> — **a veto placed at `:82` leaves this path completely ungated.** Both must stay open.
> **Eat and Drink are not work types.** The plan of record's M2 Contents item 2 lists
> `SustenanceSystem` among the sites; **that is an error and this package must not follow it.** §12.3.

**SEAM.** One predicate — `bool CanTakeWorkType(Citizen, WorkType)` on `Citizen` — asked at sites 1–4.
Site 1 asks it via `IJobSource.HandledKinds` (`sim/Sim.Core/Jobs/IJobSource.cs:44-49`, already read
once at registration into `JobSystem._byKind`, `:91-108`). Sites 2 and 3 ask it inside their
`FindNearestIdle` loops beside the existing `IsRecruitableForWork` check. Site 4 asks it before
`:141`.

**SPINE? YES — integrator lane.** *(Corrected in revision 1: revision 0 said "No" while editing
`TryAssign`, and then called the same file integrator-lane under M2-5. `JobSystem.cs:26-27` says of
itself: **"the last two exist because this is the only file in the job system the integrator
reviews."** Any package touching `TryAssign` is integrator work. M2-2 and M2-5 are therefore both
integrator lanes and are **strictly serialized** against each other.)*

**PIN IMPACT: PIN-NEUTRAL, EXPECTED — and this one is genuinely provable.** At the all-default
grid (every work type at 3, nothing off) the veto never fires, so every pinned ship is byte-identical.
Prove with check (A) **and** by confirming `JobDispatchTests`' pinned sequence does not move. ⚠️ **If
a pin moves here, the default is wrong, not the pin.**

**MUTATIONS — THE TABLE IS THE PACKAGE.**

| # | mutation | must go red |
|---|---|---|
| 1 | Delete the veto at **`TryAssign` only** | the dispatcher leg |
| 2 | Delete it at **`MachineWearSystem.cs:426` only** | the **Repair** leg — a pawn with Repair off must not be recruited for a Maintain service |
| 3 | Delete it at **`CraftingSystem.cs:475` only** | the **Craft** leg |
| 4 | Delete it at **`EffectValidator.cs:141` only** | the **LLM-effect** leg — drive an `ApplyCitizenEffectCommand` granting a dig at a pawn with Mine off |
| 5 | Invert the predicate (`off` means enabled) | all four positive legs |

**⭐ AND THE TWO NEGATIVE LEGS, RE-SPECIFIED — revision 0's version could not be applied.**
*(It said "ADD a veto at `SustenanceSystem.cs:82`", which is not an executable mutation: **there is no
`WorkType` for Eat or Drink to pass.** Both legs below are ordinary driven tests, not mutations, and
they must go red only if someone later gates the path.)*

| # | leg | fixture and criterion |
|---|---|---|
| **N1** | **A starving pawn with EVERY work type off must still eat.** | One citizen · **all six work types set to `off`** · `HoldPosition = false` · `Hunger` driven past the eat threshold · a reachable, unreserved `Potato` stack on a breathable tile. **Drive and require `citizen.JobKind == JobKind.Eat`**, then require `Hunger` to fall. ⚠️ Assert the **outcome**, not the absence of a call |
| **N2** | ⭐ **The `HoldPosition` door must stay open too.** | Same, but `HoldPosition = true` and the food **on the citizen's own tile** — the `TryServeInPlace` path at `SustenanceSystem.cs:83-84`. Require the need to be served. **A veto placed at `:82` leaves this path ungated, so N1 alone cannot see a regression here**, and a future lane "completing the set" would hit `:83` next |
| **N3** | Same shape for **Thirst / `JobKind.Drink`** | the second need; blinded of N1 |

⚠️ **N1–N3 must each fire alone with the others blinded**, and they must be in the **same file** as
the four positive legs so a lane adding a fifth veto cannot merge without meeting them.

⚠️ **EACH OF ROWS 1–4 MUST BE RUN WITH THE OTHER THREE LEGS BLINDED, AND EACH MUST FIRE ALONE.**
`assert` throws, so a multi-leg test reports only its first failure and a dead leg is
indistinguishable from a live one. **A single test covering only `TryAssign` passes with three of
four vetoes missing — that is the half-done shipment, verbatim.**

⚠️ **EVERY LEG MUST BE DRIVEN, NEVER SCANNED.** *"Verb parity is not sufficient"* — for the third time
in this repo. A scan for the predicate's name at four call sites is satisfied by four calls that do
nothing.

**ACCEPTANCE.** Blocked until M2-3 gives the grid a UI; until then, driven tests only. **This package
and M2-3 must land in the same milestone** (R3) and the demo is M2-3's.

**CONFLICTS.** `JobSystem.cs` (**strictly serialized against M2-5**), `MachineWearSystem.cs`,
`CraftingSystem.cs`, `EffectValidator.cs`, `Citizen.cs`.

**SIZE: M** — four sites and the six-row blinded mutation table.

---

### M2-3 — the WORK tab

**CLASS: PLAYER** · **LANE: `lane/work-tab`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** see or change who does what — there is no surface for it anywhere.
> **AFTER THIS** they open a WORK tab on the Overview, see every pawn against six work types, and set
> each cell off or 1–4.

**SEAM.** The **standard surface only**: `client/src/ui/overview-view.js` +
`client/src/ui/overview-model.js`. The tab machinery exists (`INERT_TABS` at `overview-model.js:262`,
tab selection at `overview-view.js:1024`) — **the WORK tab must not become a second `INERT_TAB`**.
Reads the `work` wire cache M2-4 lands; writes through M2-4's command.

⛔ **NEVER ON THE CONSOLE `.app` SHELL.** That is the invariant E0-4's WP-5 broke — implemented,
independently reviewed, merged, and nobody noticed the surface was wrong until the running game was
opened. `client/index.html` + `client/src/ui/hud.js` are **closed to new work**.

**PIN IMPACT: PIN-NEUTRAL** (client). Check (A).

**SPINE? No.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Make a cell click send nothing | the click→command test — **record the argument at the seam** (a command-recording stub), do not scan for `Cmd.workPriority` |
| 2 | Send the wrong work-type index | the same test, asserting the **decoded payload**, not that *a* command was sent |
| 3 | Send the wrong citizen id when two pawns are rostered | the two-pawn leg — ⚠️ a one-pawn fixture cannot see this, and the wreck ships with one pawn, so **the fixture must carry two** |
| 4 | Render from a stale cache instead of the live `work` channel | the update test: change the value host-side, require the cell to follow |
| 5 | Add `'work'` to `INERT_TABS` | the tab-reachability test — this is the `chron` failure shape, and `chron` is **emitted, cached and unreachable** today |
| 6 | ⭐ **Re-parent the tab's root out of the Overview root** (e.g. into the body-level `#panels`) | ⭐ **THE POSITIVE SURFACE PIN — and revision 0's version could not bite.** *(It said "mount into `#panels`/the `.app` shell ⇒ the console censuses fail." **They do not.** That is E0-4 WP-5's first draft verbatim: a tab mounted into an existing container adds **no** new console-shell id, so `surface-boundary.test.js:600`'s `CONSOLE_SHELL_IDS.length === CONSOLE_SHELL_ID_CEILING` holds, and it creates no `hud.js` widget, so all four widget counts hold. **That is exactly why WP-5's first draft was not caught.**)* ⇒ **Assert POSITIVELY: capture the element the tab mounts into at the seam and require it to be a descendant of the Overview root.** An id census is a guard against *growth*; this needs a guard against *placement* |

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → open the **WORK** tab.
2. Rell has a row with six columns; every cell reads **3**.
3. Click **Repair** down to **1** and **Haul** up to **4**.
4. Reload the page → **the values survive** (they came back over the wire, not from local state).
5. Set **Craft** to *off* → the cell renders visibly disabled, not "0".

**CONFLICTS.** `overview-view.js`, `overview-model.js`, `surface-boundary.test.js`. Serialize against
M1-C, M1-F.

**SIZE: M** — the two-pawn fixture and the census guards.

---

### M2-4 — the `work` wire channel and `SetWorkPriorityCommand`

**CLASS: PLAYER** · **LANE: `lane/work-wire`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** send a priority to the sim — there is no verb. **AFTER THIS** the click
> in M2-3 reaches `Citizen`.

**SEAM.**
- `sim/Sim.Core/Commands/Commands.cs` — a new `SetWorkPriorityCommand : ISimCommand`. Follow
  `MoveCitizenCommand` (`:56`) as the per-pawn precedent and `SetStockpileFilterCommand` (`:198`) as
  the precondition-light precedent (an illegal request is a **silent no-op**, never a throw on the
  receive thread).
- `hosts/web/GameSession.cs:2764` — `CmdKind` gains `WorkPriority`. The tolerant JSON reader is at
  `:2819`.
- `hosts/web/WireFormat.*.cs` — a sparse view-only `work` channel. ⭐ **`WireFormat.cs` should have a
  ZERO diff**: it is already `partial`, which the `items` lane proved is better than WP-3's
  one-token pattern. **Add `WireFormat.Work.cs`.**
- **Tuple order:** `[cid, workType, priority]`. ⚠️ **Do not lead with deck** — the six existing sparse
  channels (`materials`, `zones`, `marks`, `items`, `devices`, `blocked`) all lead `x,y,deck`, and
  this one is keyed by **citizen**, not tile. One decoder shape per keying, checked in source.
- `client/src/wire/messages.js` — the decoder.
- `tests/Perilune.Tests/SurfaceBoundaryTests.cs` — **every `WireFormat` channel must have a consumer
  in `client/src/main.js`.** `SHIP_STATE_REACH` in `client/test/surface-boundary.test.js:825-847`
  gains `getWork` and must be **ratified in review**, not slipped in.

**PIN IMPACT: PIN-NEUTRAL.** A command nobody sends changes nothing; the channel is view-only. Check
(A). ⚠️ **Inert without player intent** is the E0-5 shape and it is the right one — say so in the
charter and prove it, don't assume it.

**SPINE? YES** — `Commands`, `WireFormat`, `CmdKind`. **Integrator lane.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Make `SetWorkPriorityCommand.Execute` a no-op | the driven end-to-end: enqueue → tick → read `Citizen` |
| 2 | Clamp priority to 1–4 but accept 0 as 1 | the *off* leg |
| 3 | Apply to citizen index instead of id | the two-pawn leg (ids are not indices after a death) |
| 4 | Emit the `work` channel from the projection instead of `sim.Citizens` | the "read from the sim, never from the projection" test — the `marks`/`items` lesson |
| 5 | Drop the delta gate's comparison of the `priority` element | ⚠️ **the eighth trap, wearing this package's clothes.** `DeviceCell`'s field list auto-merged silently and left a delta gate that ignored `Open`; a door toggle would have stopped re-serializing with the suite green. **Pin the delta gate element by element, and verify by mutation that removing the clause reddens more than one guard** |
| 6 | Remove `getWork` from `SHIP_STATE_REACH` | the census |

⚠️ **A POSITIONAL PARSER'S WIDTH GUARD IS LOAD-BEARING.** If any test asserts the `work` tuple's
element count, **fix the width and the parser together, never the width alone** — a width guard going
red on a positional parser is the parser refusing the tree, and it is what caught the seven-element
`devices` bug.

**ACCEPTANCE.** Wire-level: with the host running, send a `workPriority` message on the socket and
read the `work` channel back changed. The browser demo is M2-3's.

**CONFLICTS.** Spine files. Serialize against M2-9 (also `Commands` + `CmdKind`).

**SIZE: M** — the spine ritual and the delta gate, not the command.

---

### M2-5 — cross-family ranking: the band loop and the recruiter-claim query

**CLASS: PLAYER** · **LANE: `lane/band-loop`** · **SIZE: L**

> **TODAY THE PLAYER CANNOT** say that repair matters *more* than hauling. A work type can be on or
> off (M2-2) but nothing ranks two kinds of work against each other: dispatch is a **distance-only
> tournament** and the source order is a **tie-break, not a priority** (`JobSystem.cs:31-38` says so
> in its own words). **AFTER THIS** Repair@1 / Haul@4 means what it says.

> ### ⭐ THE SHAPE — an integrator ruling, and a reviewer must reject any other
>
> **⛔ NOT a lexicographic comparison key.** The argmin is **distributed**: **`JobSystem.cs:237`** is
> `int cand = _sources[s].Select(sim, citizen, bestDist, gen, out int d);` — the running minimum
> threaded *through* the providers — and the guard that enforces it is **`:243`**
> (`if (cand < 0 || d >= bestDist) continue;`, *"enforced here rather than trusted"*).
> `IJobSource`'s contract makes it binding. A `(priority, distance)` key changes `Select`'s signature
> and the contract of every source. **A reviewer must reject any implementation that changes
> `IJobSource.Select`'s signature.** *(Revision 0 cited `:234`, which is the loop's local
> declarations. **The line a ruling is quoted from must be the line the ruling is about.**)*
>
> **✅ ITERATE BANDS ON THE OUTSIDE, KEEP THE ARGMIN UNTOUCHED ON THE INSIDE:**
> ```
> for band in 1..4:
>     restrict the source set to those whose work type sits at `band` for THIS citizen
>     run the EXISTING distance argmin over just those sources
>     if it claims a job: return
> ```
> Within a band the `bestDist` threading is byte-for-byte shipped behaviour.
>
> **⭐⭐ AND THE PART NEITHER PRIOR SHAPE ADDRESSED: `JobKind.Maintain` AND `JobKind.Craft` HAVE NO
> `IJobSource` AT ALL.** Verified: `JobSystem.DefaultSources()` (`:73-80`) registers Dig, Haul, Build,
> Deconstruct; `_byKind` (`:91-108`) is indexed by `JobKind`, and `JobKind.Craft = 6` /
> `JobKind.Maintain = 7` (`Citizen.cs:133-134`) are **null**. `HandledKinds` supplies four of the six
> work types and **misses exactly the two OD-A is about.** ⇒ **A band loop fails in precisely the same
> place a flat veto does: there is nothing in the dispatcher to rank.**
>
> ⇒ **ONE TINY NEW INTERFACE.** Before running the argmin at band *b*, `TryAssign` asks each **push
> recruiter** (`MaintenanceSystem`, `CraftingSystem`) *"do you have a claimable band-*b* job for this
> citizen?"* — and **leaves the pawn idle for it if so.**
> **No `Select` change, no `HandledKinds` change, no stack reorder** — and **neediest-first is
> preserved**, which OD-A requires. *(Promoting maintenance to a full `IJobSource` is rejected for
> exactly that: it silently amends neediest-first to nearest-needy.)*
>
> ⛔ **AND NOT A `SystemStack` REORDER.** Struck in the plan's revision 1: a reorder inverts a **fixed
> global** precedence — Repair beats Haul for every pawn always — so it cannot express Haul@1/Repair@4
> and **delivers none of OD-A**, while costing a pin move and lifting `MaintenanceSystem` above
> `MachineWearSystem`, changing the service interleave.

> ### ⭐ THE DECISION THIS PACKAGE MUST TAKE, WITH A RECOMMENDATION: what happens at EQUAL band?
>
> Today `JobSystem` ticks before `SustenanceSystem`/`CraftingSystem`/`MachineWearSystem`
> (`SystemStack.cs:33-37` — `JobSystem` at `:33`, `SustenanceSystem` `:34`, `CraftingSystem` `:35`, `MachineWearSystem` `:36`, `MaintenanceSystem` `:37`), so `TryAssign` wins every race and the push recruiters get leftovers.
> If the recruiter query fires at **equal** band, that inverts — **and every pinned ship's interleave
> changes.**
>
> **RECOMMEND: the query fires only when the recruiter's band is STRICTLY HIGHER than the best
> available pull-source band. At equal band, fall through to today's argmin.**
> Rationale: (a) it expresses Repair@1/Haul@4, which is the whole point; (b) at all-default (band 3
> everywhere) **nothing fires and shipped behaviour is byte-identical**, keeping this package off the
> pin chain; (c) it is the E0-5 shape — *inert without player intent*.
> ⚠️ **M2-0's leg B and its byte-identity check are what confirm or refuse this.** If the spike says
> the strictly-higher rule cannot produce leg B, this package joins §2's chain and the merge order
> grows a row. **Do not discover that in week 5.**

**SEAM.** `sim/Sim.Core/Jobs/JobSystem.cs:220-273` (`TryAssign`) · `JobSystem.cs:118`
(`BeginTick` fan-out, the model for the new fan-out) · the new interface, implemented by
`MaintenanceSystem` (`sim/Sim.Core/Systems/MachineWearSystem.cs:140`, recruiter at `:189`) and
`CraftingSystem` (`:164`).

**PIN IMPACT: PIN-NEUTRAL IF the strictly-higher rule is adopted — and it MUST be proven, not
assumed.** Check (A) plus `JobDispatchTests`' pinned assignment sequence held. ⚠️ **If that sequence
moves, read the diff — do not regenerate it.**

**SPINE? Borderline — `JobSystem.cs` is integrator-reviewed by its own doc comment** (*"the only file
in the job system the integrator reviews"*). Treat as **integrator lane.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Collapse the band loop to a single pass over all sources | the ranking test: Repair@1/Haul@4 with a haul job **nearer** than the repair — the pawn must repair |
| 2 | Make the recruiter query always return `false` | the Maintain leg — ⚠️ **the seam the package exists to deliver, and the "verb parity" shape**: it must be pinned by a **driven** dispatch outcome, never by a scan for the method's signature |
| 3 | Make it always return `true` | the idle-starvation leg: a pawn must not sit idle forever waiting for a recruiter that has nothing |
| 4 | Fire the query at **equal** band | ⚠️ **the byte-identity leg** — the all-default control must stay identical; this is the mutation that proves the pin-neutrality claim rather than asserting it |
| 5 | Reverse band iteration (4 → 1) | the ordering test |
| 6 | Skip the `d >= bestDist` guard inside a band | the argmin-integrity test — that guard is *"enforced here rather than trusted"* (`JobSystem.cs:238-242`) |
| 7 | Let a band-1 source claim a job that `CanStageWorkerAt` refuses | ⚠️ **a priority may NEVER override physics.** M2's owner batch recommends *never*, and this leg pins it |

**ACCEPTANCE.** M2-3's demo, run in the **inverting** direction — see M2-10's, which is the milestone
demo. Driven tests here.

**CONFLICTS.** `JobSystem.cs` — **strictly serialized against M2-2.** Also `MachineWearSystem.cs`,
`CraftingSystem.cs`.

**SIZE: L**, and what makes it L is the two work types with **no `IJobSource`** and the byte-identity
proof, not the loop.

---

### M2-6 — the `why` line

**CLASS: PLAYER** · **LANE: `lane/why-line`** · **SIZE: S**

> **TODAY THE PLAYER IS MISLED ABOUT** their crew's autonomy: the task line says *what* she is doing
> and never *why that job and not another*, so "she is ignoring my order" and "she ranked it lower"
> are indistinguishable. **AFTER THIS** it reads *"Stripping — Repair is priority 4"*.

**SEAM.** `hosts/web/GameSession.TaskLabel` at `:2556` — an existing, honest, allocation-conscious
prose builder that already ships on the roster wire to **both** standard surfaces
(`client/src/ui/overview-view.js:697`, `:747`; `client/src/ui/roomzoom-view.js:700`). **No wire shape
moves** — `task` is a pre-existing roster field. This is the owner's axis 5 (*autonomy legible*) for
almost nothing, on a seam that already exists.

**PIN IMPACT: PIN-NEUTRAL** (host, read-only; `TaskLabel`'s own comment: *"PURE READ… nothing here
mutates the sim or touches the RNG"*). Check (A).

**SPINE? No.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Emit the reason clause unconditionally, including at all-default priorities | the "say nothing when there is nothing to say" leg — a reason on every line is noise |
| 2 | Name the wrong work type in the clause | the mapping test, driven with **two** work types at different bands |
| 3 | Mutate `TaskLabel` to allocate per call | the zero-alloc / no-RNG assertion |
| 4 | Read the priority from a host-side copy rather than `Citizen` | the freshness leg: change the priority, require the next frame's line to follow |

**ACCEPTANCE (browser, < 5 min).** Set Rell to Repair 1 / Haul 4, paint a strip order, and read her
task line: it names what she is doing **and the priority that chose it**. Flip to Repair 4 / Haul 1
and watch the clause change.

**CONFLICTS.** `GameSession.cs` — serialize against M1-D, M1-E, M2-4, M2-9.

**SIZE: S.**

---

### M2-7 — the PRE-EMPTION POLICY

**CLASS: INFRASTRUCTURE** *(deliverable is a decided policy table; no player sentence — the sentence
belongs to M2-8, which implements it)* · **LANE: `lane/preempt-policy`** · **SIZE: S**

**What it decides.** *When may a pawn be taken off a job it is halfway through?* This has no precedent
in the repo and **three named hard cases**. R1b: *a pre-emption package that ships a mechanism and
defers the rule to "the caller"* is the early-warning sign.

| hard case | the question | RECOMMENDATION (M2 owner batch) |
|---|---|---|
| **mid-haul carrying cargo** | the pawn holds a stack; dropping the job must not delete it | **Droppable, but the cargo is SET DOWN FIRST** at the pawn's current tile, as a free ground stack. `Simulation.CancelJob` already releases cargo and reservations *"as on death"* (`SafetySystem.cs:231-233`) — check whether that path **drops** or **destroys**, and pin whichever it is |
| **mid-craft against a bill** | partial work at a station | **Droppable; progress is forfeit.** `CraftingSystem` re-derives its worker by scanning for a `Craft` pawn at the station (`:455-464`), so an abandoned station simply re-recruits |
| **mid-build with material delivered** | material sits on the site | **Droppable; the material STAYS on the site.** `BuildSystem`'s ledger is per-site (`Delivered`/`Required`), not per-pawn, and the `designs` wire already renders a starved ghost distinctly |
| **`SafetySystem`'s flee** | may a priority pre-empt a flee? | ⛔ **NEVER.** Survival outranks every order — `Citizen.cs:90` (*"exactly as E0-2's `SafetySystem` still lets them flee lethal air"*), and `Citizen.cs:137-138` states it as a dispatch rule: `Flee` is **"not None, so no dispatcher recruits a fleeing crew until it has recovered in safe air"** |
| **Eat / Drink** | may a priority pre-empt a need? | ⛔ **NEVER.** §12.3 |

**⭐ WHAT IS THE OWNER'S, NOT THE IMPLEMENTER'S:**
1. **Whether a pre-emption is even desirable at one pawn.** Plan §8 item 2 — W6 observes the same
   tension for sleep and concludes *"neither is right."* **Resolved by driving it and showing the
   owner both.**
2. **The threshold.** Does *any* higher band pre-empt, or only a band-1 job / an explicit
   *Prioritise*? **Recommend: only a STRICTLY higher band, or an explicit `PrioritiseJobCommand`** —
   consistent with M2-5's equal-band rule and the same inertness argument.
3. **Whether cargo is set down or carried onward** to the new job.

**SEAM (for the doc, so M2-8 has somewhere to start).** `Simulation.CancelJob` ·
`JobContext.AbandonJob` (`sim/Sim.Core/Jobs/JobContext.cs:93`) — *"Reservations are the CALLER's to
release first — this only clears job/work/path state"* · the sim's **one** existing pre-emption,
`SafetySystem.cs:229-239` (the `CancelJob` at `:233`, then `c.JobKind = JobKind.Flee` at `:234`).

**PIN IMPACT: N/A** (docs). **SPINE? No.** **MUTATIONS: none — it is a document.**
**ACCEPTANCE: none — INFRASTRUCTURE.**

**⚠️ IT MUST LAND BEFORE M2-8.** Ship the mechanism **behind** the decided policy, not the other way
round.

---

### M2-8 — PRE-EMPTION

**CLASS: PLAYER** · **LANE: `lane/preempt`** · **SIZE: L** · ⛔ **PIN CHAIN M2-b — RUNS ALONE**

> **TODAY THE PLAYER CANNOT** change their mind about a busy crew member. **Nothing in the sim can
> take a busy pawn back**: `IsRecruitableForWork` (`Citizen.cs:103`) reduces to `IsIdleForWork` (`:73`), which requires `JobKind == JobKind.None`, and
> the only pre-emption anywhere is `SafetySystem.cs:229-239` (`sim.CancelJob(c)` at `:233`). Measured: a player's strip order waited
> **54 650 ticks — 1 h 31 min of sim time — behind six chained 900 s Maintain services.**
> **AFTER THIS** a raised priority reaches a working pawn.

> ⭐ **THIS IS WHY M2 IS LARGE, AND WHY A PERFECT GRID SHIPPED ALONE WOULD NOT HAVE MOVED THAT NUMBER
> BY ONE TICK.** The player would set Repair@4 / Haul@1, wait an hour and a half, and reasonably
> conclude the grid does not work. **Job-duration monopoly is the dominant term.**

**SEAM.** `Simulation.CancelJob` (the flee path's own call, `SafetySystem.cs:233`) ·
`JobContext.AbandonJob` (`JobContext.cs:93`) — *"the release is already normalised"*, which is what
makes the mechanism cheap · `JobSystem.Tick` (`:140`, `if (citizen.IsRecruitableForWork) TryAssign(...)`)
gains a pre-emption check for **busy** pawns · the per-source abandon paths, which already exist.

**PIN IMPACT: UNKNOWN — MEASURE.** Expected pin-neutral: at shipped defaults no band is strictly
higher and no `PrioritiseJobCommand` exists yet, so nothing should ever pre-empt on a pinned ship.
⚠️ **This is exactly the kind of expectation that has been wrong twice in this repo.** It sits on the
pin chain **because it might move**, and it runs alone so that if it does, the move is attributable.

**SPINE? YES** (`Simulation.cs`, and `JobSystem.cs` by its own review rule). **Integrator lane.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Make the pre-emption check a no-op | the driven Repair@1-mid-haul test |
| 2 | Pre-empt without calling the cargo release | ⚠️ **the CARGO leg — the case that loses matter if it is wrong.** Drive a pawn **carrying a stack**, pre-empt it, and assert the stack exists on the ground with `ReservedBy == 0`. **R1b's mitigation is explicit: the demo must pre-empt a carrying pawn** |
| 3 | Pre-empt a pawn in `JobKind.Flee` | ⛔ must be **refused** — survival outranks everything |
| 4 | Pre-empt a pawn in `JobKind.Eat` / `Drink` | ⛔ must be **refused** (§12.3) |
| 5 | Pre-empt at **equal** band | the inertness leg: the all-default control must stay byte-identical |
| 6 | Leave `sim.JobsDirty` unset after the abandon | the board-rebuild leg — `AbandonJob` sets `Items | Citizens` *"so no caller can under-trigger"*, and a pre-emption that skips it leaves a phantom assignment |
| 7 | Pre-empt mid-build and delete the delivered material | the build-site ledger leg |

⚠️ **Rows 3 and 4 are NEGATIVE guards** and must be run blinded of the positive ones. A test suite
that only proves pre-emption *works* is satisfied by a pre-emption that fires on everything, and the
failure mode is a crew member who starves while being reassigned.

**ACCEPTANCE (browser, < 5 min).** The pre-emption leg of the milestone demo — see M2-10.

**CONFLICTS.** Spine + `JobSystem.cs`. Runs alone.

**SIZE: L** — the policy it implements, the cargo case, and the pin position. The mechanism itself is
small, and saying so in the charter is what keeps the estimate honest.

---

### M2-9 — `PrioritiseJobCommand` *(the direct order, sim + wire)*

**CLASS: PLAYER** · **LANE: `lane/prioritise-cmd`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** point at one specific broken machine and say *"that one, now"*.
> **AFTER THIS** the sim has the verb.

**SEAM.** `sim/Sim.Core/Commands/Commands.cs` — new `PrioritiseJobCommand : ISimCommand`, precedent
`MoveCitizenCommand` (`:56`). `hosts/web/GameSession.cs:2764` `CmdKind` gains `Prioritise`; the reader
at `:2819`. Consumer of M2-8: **it cannot ship before pre-emption exists.**

⭐ **AND IT DISCHARGES `ReasonNoConsumable`.** With a repair order in an order registry, the
`blocked` channel finally has something to hang refusal 4 on: a machine below `wear.wreck_threshold`
with no Parts/Seals aboard. The predicate is `MaintenanceSystem.IsUnfixableWreck` — **public on
purpose**, and its doc comment says why: *"a view-only `blocked` wire channel needs to be able to ask
the same question the dispatcher asks rather than re-deriving it — re-deriving is how the two answers
drift apart."* The constant (`WireFormat.Blocked.cs:312`) and the client label
(`client/src/wire/messages.js:543`, *"NO PARTS OR SEALS ABOARD"*) are **already built**.
⇒ **This package emits it, in one line, and flips `BlockedChannelTests.cs:794-811` from
"pinned as never emitted" to "pinned as emitted for exactly this case."**

**PIN IMPACT: PIN-NEUTRAL** — a command nobody sends changes nothing. Check (A). *(Inert without
player intent, the E0-5 shape.)*

**SPINE? YES** — `Commands`, `CmdKind`, `WireFormat`. **Integrator lane.** Serialize against M2-4.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | `Execute` becomes a no-op | driven: enqueue → tick → the named pawn is on the named machine |
| 2 | Prioritise a machine the pawn's work grid has **off** | ⚠️ **decide and pin it.** RECOMMEND: an explicit order **overrides the grid** (RimWorld's own answer — a right-click order beats a work setting) but **never overrides `CanStageWorkerAt`**. Whichever is chosen, a leg must pin it |
| 3 | Prioritise a machine below `wreck_threshold` with no consumable and emit **nothing** | the `ReasonNoConsumable` leg. ⚠️ ⭐ **THE FIXTURE MUST STRIP THE AUTHORED CONSUMABLES FIRST.** The wreck ships `1 Parts + 2 Seals` (`AuthoredShips.cs:1888-1889`) **and `Swarf` counts** (`IsUnfixableWreck` passes `allowSwarf: true`, `MachineWearSystem.cs:471`), so on the shipped ship `IsUnfixableWreck` returns **false** and this leg is **vacuous** — it would pass with the emission deleted. Remove every Parts / Seals / Swarf stack from the fixture and assert the predicate is `true` **before** driving the order |
| 4 | Re-derive "is there Parts aboard" host-side instead of calling `IsUnfixableWreck` | the single-authority leg — assert the host calls the sim's predicate, **by recording the call at the seam**, not by scanning for the name |
| 5 | Let the order survive the pawn's death | the cleanup leg |

**ACCEPTANCE.** Wire-level driven test; the browser demo is M2-10's.

**CONFLICTS.** Spine. Serialize against M2-4, M2-6, M1-D, M1-E (`GameSession.cs`).

**SIZE: M.**

---

### M2-10 — *Prioritise: repair X* on the standard surface

**CLASS: PLAYER** · **LANE: `lane/prioritise-ui`** · **SIZE: M**

> **TODAY THE PLAYER CANNOT** reach a machine with an order. **AFTER THIS** they right-click a
> machine in the Room Zoom and choose *Prioritise: repair `wing_c`*.

**SEAM.** `client/src/ui/roomzoom-view.js` — the machine tiles come from the `devices` channel, whose
client join is `client/src/items/wear.js` via `buildTileItem` (`roomzoom-view.js:653`). ⚠️ **The
target must be on the `devices` channel to be clickable, which is exactly why M1-A comes first**: six
of eight deck-0 slots render as blank `＋ADD ROOM` boxes today.

⛔ **Room Zoom only in v1.** The Overview is deck-level and its machine glyphs are not
individually addressable; a second entry point is scope, not parity.

**PIN IMPACT: PIN-NEUTRAL** (client). Check (A).

**SPINE? No.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Right-click sends no command | click→command, **recorded at the seam** |
| 2 | Send the machine at the wrong tile | the two-machine fixture |
| 3 | Register the context handler with `{capture: true}` | ⚠️ **BUG-B's exact shape.** Capture phase runs before the element's own handler and **silently kills the gesture with the suite green.** Use the window/element stub in `client/test/overview-model.test.js` that **records the phase argument** — a text scan for `addEventListener(..., true)` is defeated by a comment, by whitespace, and decisively by the `{capture:true}` options form |
| 4 | Offer the menu on a tile with no device | the empty-tile leg |
| 5 | Offer it on a device whose `deviceConditionAt` is `null` (not on the channel) | the fog leg — the menu must not promise an order the sim cannot take |

**ACCEPTANCE — ⭐ THIS IS M2'S MILESTONE DEMO, and it is written to be FALSIFYING, not confirming.**

> ⚠️ *A demo of the form "Repair@1 beats a painted strip order" **passes on the shipped sim with
> nothing built**, because Maintain monopolises the pawn. So the demo runs the **inverting**
> direction.*

1. `./play.sh` → open the **WORK** tab → Rell: **Haul 1, Repair 4**.
2. Paint six STRIP orders in the next hall.
3. **She strips, and she does NOT go to `wing_c`.** ⭐ *This is the leg the shipped sim cannot produce.*
4. Her task line reads *"Stripping — Repair is priority 4"*.
5. Flip to **Repair 1, Haul 4** → **she abandons the strip mid-job** and walks to `wing_c`.
   ⭐ *This is the pre-emption leg (M2-8).*
6. Right-click `battery_2` → **Prioritise: repair** → she drops `wing_c` and walks.
7. When the wing completes, generation steps **10.65 → 13.47 kW**, the benches come back, and **a
   dark room's lights come on.** ⭐ *This is M2-11 + M2-12.*

*(Max speed throughout; a service is 900 s of sim time.)*

**CONFLICTS.** `roomzoom-view.js` — serialize against M1-C.

**SIZE: M.**

---

### M2-11 — the off-network authoring defect

**CLASS: PLAYER** · **LANE: `lane/power-network`** · **SIZE: M** · ⛔ **PIN CHAIN M2-c — RUNS ALONE**

> **TODAY THE PLAYER IS MISLED ABOUT** their ship's power: the wreck was authored believing deck 1
> carries no conduit and therefore neither draws nor runs — **measured, 0 of 626 devices are
> off-network**, because `PowerSystem`'s claim rule is 6-way and a deck-1 device claims the deck-0
> conduit through **−z**. The authoring's intent and the sim's behaviour have never agreed.
> **AFTER THIS** the ledger the player reads is the ledger the ship has.

> ⛔ **ORDER IS A RULING, NOT A PREFERENCE: THIS LANDS BEFORE M2-12.** Gating generation on condition
> against a demand figure that is wrong by 6.10 kW produces a curve nobody can interpret and a
> rollback point nobody can stand on.

**SEAM.** `sim/Sim.Gen/AuthoredShips.cs:1441-1443` (the false belief, in a comment) ·
`sim/Sim.Core/Systems/PowerSystem.cs:171-189` — `if (d.NetworkId == 0) continue;` at **`:183`** is the
off-grid branch, and the claim rule is what assigns `NetworkId`.

**⭐ THE DECISION INSIDE THE PACKAGE, AND IT DETERMINES THE PIN IMPACT:**
- **(a) Content answer** — author deck 1 genuinely off-network on the wreck. **Wreck-only ⇒ pin-neutral**
  (the wreck is behind no pin). Flat demand becomes **14.30 kW** against the current **20.40 kW**.
- **(b) Rule answer** — make `PowerSystem`'s claim rule 4-way (no cross-deck claim). **Every ship ⇒
  P2 and P3 move; P1 probably holds** (the scenario ship is `hosts/scenario/Program.cs`'s hand-built
  single-deck map, `world.Depth == 1`, so a 6-way vs 4-way claim is identical — **measure, do not
  predict**; this is the same reasoning that made the deck-confined-wander pin hold).
- **RECOMMEND (a)**, and correct the comment either way. A cross-deck power claim through a deck plate
  is arguably correct physics for a ship with risers; the wreck's fiction is that *the raiders cut
  them*, which is content.

**PIN IMPACT: see above — UNKNOWN until the decision is taken.** It sits on the chain because it
**might** move P2/P3, and it runs alone so the move is attributable.

**SPINE? No** under (a); **yes** under (b).

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Revert the authoring/rule change | the census test: *N* of 626 devices are off-network, with *N* asserted as a **number measured on the merged tree** |
| 2 | Assert the count without driving the sim (a source scan for the conduit authoring) | ⚠️ **must be rejected in review.** §12 / the eighth trap: **re-derive every censused number from the MERGED tree**, and treat "nothing is off-network" as a statement about a TREE |
| 3 | Change flat demand and leave the number in the comment | the comment-vs-code test — `AuthoredShips.cs:1429-1433` currently claims *"~12.6 kW of total demand, every tier served from tick 0 and stays served"* and **both halves are false** |

**ACCEPTANCE (browser, < 5 min).** `./play.sh --ship wreck` → MOSS → the POWER row's demand figure
matches the authored budget. Enter a deck-1 hall: **its machines read unpowered**, and the fiction
(the risers were cut) is legible on screen rather than in a comment.

**CONFLICTS.** `AuthoredShips.cs` — **serialize against M1-A, M3-6, M3-11.** Runs alone (pin chain).

**SIZE: M.**

---

### M2-12 — `EffectiveRate` on the generation term

**CLASS: PLAYER** · **LANE: `lane/power-wear`** · **SIZE: M** · ⛔ **PIN CHAIN M2-d — RUNS ALONE**
⭐ **ROLLBACK POINT: tag `pin/m2-d`**

> **TODAY THE PLAYER CANNOT** make repairing a machine turn a light on — *the owner's own first
> sentence about this game.* `sim/Sim.Core/Systems/PowerSystem.cs:185` is
> `_generation[d.NetworkId] += def.GenerationKW;` with no `Condition`, no `IsOperational`, no
> `EffectiveRate`, and the file says so itself at `:174-179`: *"a wrecked SolarWing still supplies its
> full kW."* A wing at 0.06 generates exactly what a wing at 1.00 does.
> **AFTER THIS** repairing a wing steps generation and the benches come back.

> ⭐ **AND IT FIXES A LIVE BLACKOUT.** Measured on `--ship wreck` **today**, with generation
> condition-blind: **h0 = 16/16 lit, 15.00 kWh stored → h7 = 0/16 lit, 0.00 kWh.** The battery drains
> and never recovers. **The wreck was authored against a power model that was never built.**

**THE RULE — extend the principle, do not break it.**
> *Wear is expressed at the point where a device's output is produced. For a device whose output is a
> service, that is its consuming system via `EffectiveRate`. **For a device whose output IS power,
> that point is the power ledger itself.***

Verified: every existing `EffectiveRate` consumer is a device that consumes power **in order to do
something else** — scrubber (`AtmosphereSystem.cs:156`), vent (`:142`), radiator (`ThermalSystem.cs:96`),
reclaimer (`WaterSystem.cs:515`). **A generator has no downstream system in which its wear could be
expressed**, so the principle routes its wear to a place that does not exist.
`Device.EffectiveRate = Rate * (0.5f + 0.5f * Condition)` (`Device.cs:120`).

**⛔ THREE HARD CONSTRAINTS, EACH A RULING:**
- **(8b) `IsOperational` STAYS OUT of the generation term.** With it, boot generation is **7.47 kW**
  and `wing_c` at 0.06 contributes *literally nothing* — the repair cliff the reviewer and the plan
  both argued against. **`EffectiveRate` alone gives the gradient**, and the gradient is the owner's
  sentence in arithmetic:
  > authored wings → **10.65 kW** (Industry and Comfort shed) → repair `wing_c` → **13.47 kW**
  > (**the benches run**) → repair the rest → **17.40 kW** (**the lights come on**).
  ⚠️ *`DESIGN-NOTE-generator-wear.md` recommends using both; the plan's revision 1 overrules it on a
  measured curve. **The plan wins.** Do not re-derive this in the lane.*

> ### ⭐ REVISION 1 — THE CEILING IS `17.40 kW`, NOT `18.00 kW`. THE DEMO STILL LANDS.
>
> **Arithmetic, re-derived in this session and checkable in four files.** `machines.def:30` gives
> SolarWing `gen = 6` kW. `Device.cs:120` gives `EffectiveRate = Rate * (0.5f + 0.5f * Condition)`.
> `AuthoredShips.cs:1779-1781` authors `wing_a` **0.31**, `wing_b` **0.18**, `wing_c` **0.06**.
>
> | state | arithmetic | kW |
> |---|---|---:|
> | boot | `6(0.655) + 6(0.59) + 6(0.53)` | **10.65** |
> | `wing_c` → 1.00 (Parts) | `3.93 + 3.54 + 6.00` | **13.47** |
> | ⛔ all three → 1.00 | `6.00 × 3` | *18.00 — **UNREACHABLE*** |
> | ✅ **best achievable** | `6.00` (Parts→1.0) `+ 5.70 + 5.70` (Seals→0.9) | **17.40** |
>
> **Why 18.00 cannot happen: the wreck carries exactly `1 Parts` and `2 Seals`**
> (`AuthoredShips.cs:1888-1889`), and the repair ladder is `Parts → 1.00`, `Seals → 0.90`,
> `Swarf → 0.45`, empty hands `→ 0.60` (`wear.def:18-19`, `:57`). Only **one** wing can reach 1.00.
> ⇒ **Correct `18.00` to `17.40` everywhere it appears.**
>
> ⛔ **AND THAT IS ALL THAT CHANGES.** The Comfort threshold is **14.30 kW** (the flat demand after
> M2-11 takes deck 1 off-network). **`17.40 ≥ 14.30`, so the lights come on and the owner's sentence
> still lands.** Do **not** re-charter the demo, do **not** mark this package blocked, and do **not**
> "fix" it with a content change to the authored wings. **State the precondition instead:** the demo's
> step 4 requires the player to have spent the Parts and both Seals **on the wings**.
> ⚠️ *The `14.30` figure is inherited from the plan's measurement, not re-derived here. **The driven
> winnability check below is what confirms it**, and it must print the served-tier table, not just a
> total.*
- **(8c) DEMAND STAYS FLAT.** Do not scale `draw` by `EffectiveRate` — that rewards a wrecked ship
  with a smaller bill. *"A worn scrubber pays full price for reduced output"* is a deliberate penalty,
  and touching it is out of scope.
- **(8d/R) A DRIVEN WINNABILITY CHECK ON `--ship wreck` BEFORE MERGE.** The wings are authored at
  0.31 / 0.18 / 0.06; multiplying by `0.5 + 0.5·Condition` may put life support below the line on
  tick 1. **Measure it, in the running game, and print the served-tier table.** If it does, **the
  answer is a content change to the authored ship, not a softening of the rule.**

> ### ⭐⭐ THE FINDING UNDERNEATH THE NUMBER, AND IT IS BIGGER: THE WRECK'S REPAIR ECONOMY IS FINITE
>
> **⛔ THIS IS AN OWNER DECISION. IT GOES IN M2'S DECISION BATCH AND IS NOT RESOLVED BY IMPLEMENTING.**
>
> **The behaviour, stated as behaviour.** `MaintenanceSystem.IsUnfixableWreck`
> (`sim/Sim.Core/Systems/MachineWearSystem.cs:463-472`) is:
> ```csharp
> if (device.Condition >= sim.Defs.Wear.WreckThreshold) return false;      // 0.25
> return FindNearestConsumable(sim, device.Pos, allowSwarf: true) == null;
> ```
> — so **any device below `wreck_threshold = 0.25` with no consumable aboard is refused a service,
> permanently and silently**, and the free jury-rig (`→ 0.60`) is refused there too. The wreck ships
> **1 Parts + 2 Seals** (`AuthoredShips.cs:1888-1889`). `wing_b` is **0.18** and `wing_c` is **0.06**
> — both below the floor.
> ⇒ **If the player spends those three on scrubbers, the power curve becomes permanently unreachable,
> and nothing anywhere says so.** That is a soft-lock shape, and it is the *cheap-and-invisible*
> failure class this repo has now filed four times.
>
> **⭐ TWO THINGS THE OWNER MUST BE TOLD ALONGSIDE IT, both of which soften it and neither of which
> resolves it:**
> 1. **`Swarf` is a producible fourth rung and `allowSwarf: true` is unconditional here.** Stripping a
>    wrecked machine yields Swarf (`deconstruct.device_swarf`), a Swarf service restores to **0.45**
>    (`wear.def:57`), and 0.45 is **above** the 0.25 floor — after which the free jury-rig reaches
>    **0.60**. ⇒ The floor is escapable *if the player strips something first*.
>    **Free-only ceiling: `6 × (0.5 + 0.5 × 0.6) = 4.80 kW` per wing, `14.40 kW` for three.** Against a
>    14.30 kW threshold that is a **0.10 kW margin** — ⚠️ **arithmetic, not a measurement. The driven
>    check must confirm or refuse it, and a 0.7 % margin is not a design, it is a coincidence.**
> 2. ⚠️ **THE STANDING MAINTENANCE RULE MAY SPEND THE THREE CONSUMABLES BEFORE THE PLAYER CAN DIRECT
>    THEM.** `RecruitForNeediest` (`MachineWearSystem.cs:189`) picks the **lowest-Condition** device on
>    the ship, and `wing_c` (0.06) is among the lowest on the wreck. **The package must MEASURE and
>    STATE where the authored Parts and Seals actually go in an unattended 2-sim-hour run** — if the
>    answer is "the wings", the risk is small; if it is "three scrubbers", the soft-lock is the default
>    outcome rather than a mistake the player has to make.
>
> **THE THREE OPTIONS, for the batch — recommendation deliberately withheld, this is a design call:**
> **(a)** author more consumables on the wreck (cheapest, changes the difficulty curve);
> **(b)** let the free jury-rig reach below the wreck floor **for generation-only devices**
> (a targeted rule change; narrow, and defensible on the same "output IS power" logic as this whole
> package); **(c)** accept it and **surface it** — a machine that is permanently unfixable says so, on
> the machine, via `ReasonNoConsumable`, which **M2-9 already emits**.
> ⚠️ *Option (c) is the only one that is free if the answer is "leave it", and it is why M2-9's
> emission is chartered before this decision is due.*

**PIN IMPACT: P2 AND P3 MOVE.** Both tick-3000 goldens — it alters the power balance on
`--ship perilune` and `--ship slice`. **P1 unknown — measure** (the scenario ship is hand-built; it may
have no generator at all). **P4/P5 expected to hold — no def field; `EffectiveRate` already exists,
is already hashed through `Condition`, and is already the shipped vocabulary for exactly this.**
⚠️ *The plan's revision 0 assumed this package was pin-neutral. It is not.*

**⭐ AFTER THE RE-PIN: TAG `pin/m2-d` AND RECORD ALL FIVE VALUES IN THE TAG'S OWN COMMIT.** This is
the designated rollback point for the whole power package.

**SPINE? Borderline — `PowerSystem` is a sim system, not a spine file, but the pin position makes it
integrator work.** **Integrator lane.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Revert the `EffectiveRate` factor | the gradient test: three wings at three conditions produce three **distinct** generation totals |
| 2 | **Add** `IsOperational` to the generation term | ⚠️ **the CLIFF guard, a negative leg**: a wing at 0.06 must contribute **more than zero** |
| 3 | Apply `EffectiveRate` to `draw` as well | the flat-demand guard |
| 4 | Set the floor to `Condition` instead of `0.5 + 0.5·Condition` | the floor test — assert the **arithmetic**, not a ratio |
| 5 | Scale generation by a constant **0.8** | ⚠️ ⭐ **THE SCALE GUARD — the seventh trap.** A ratio suite is blind to scale: E0-9's whole gate went green with `DaysOfFood` over-stated 2×. |
| 5b | Scale generation by a constant **1.25** | ⭐ **THE OTHER SIDE, and revision 0's guard was ONE-SIDED.** A floor of `≥ 10.0 kW` is **survived by ×1.25** (10.65 → 13.31), so a uniform over-statement ships green. ⇒ **The assertion must be a TWO-SIDED ABSOLUTE BAND on a measured figure** — boot generation on `--ship wreck` within `10.65 ± 0.05 kW`, and the repaired ceiling within `17.40 ± 0.05 kW`. Both mutations must redden it, and **each must be run with the other reverted** |

**⭐ THE FOUR-CELL INCLUSION TABLE is required for mutation 5**, because a scale error is exactly the
shape that survives ratios: *(mutation + assertion present → RED)*, *(no mutation + assertion present →
GREEN)*, *(mutation + assertion removed → GREEN)* — **and the decisive cell,
*(mutation + assertion regressed → GREEN)***, proving nothing else in the suite sees it.

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → MOSS → POWER reads generation ≈ **10.65 kW**, Industry and Comfort **shed**.
2. Right-click `wing_c` → **Prioritise: repair** (M2-10). Max speed.
3. When it completes, POWER reads ≈ **13.47 kW** and **the benches run**.
4. Repair the remaining wings, **spending the Parts on one and both Seals on the others** → ≈ **17.40 kW** and **a dark room's lights come on**. ⚠️ *17.40, not 18.00: only one wing can reach 1.00 because the wreck carries one Parts. See the ceiling box above — and note the precondition, because a player who spent those three elsewhere cannot perform this step.*
5. Run to sim-hour 8 → **the lights are still on.** *(This is §0.1's blackout, gone.)*

**CONFLICTS.** `PowerSystem.cs`, both goldens. Runs alone.

**SIZE: M in code — one term — and L in ceremony.** Say both.

---

### M2-17 — the re-baseline

**CLASS: INFRASTRUCTURE** *(its subject is a metric, not a player — plan RF-4, and this document will
not invent a sentence for it)* · **LANE: `lane/rebaseline`** · **SIZE: S**

**What it is.** Every occupancy and A1/A2/A3 number in the repo is invalidated the day M2 lands.
Under **OD-B** that is a **re-baseline, not a regression hunt**: A1 is retired as a goal and survives
only as a regression statistic. **A3 has never been measured in the repo's life; A2 not since E0-1.**

**SEAM.** `hosts/scenario` (`--dump --days 1 --metrics`, the occupancy legs) on `--ship grid` **and**
`--ship wreck`.

**⚠️ THE HARNESS NEEDS ITS OWN NON-VACUITY CHECK.** One lane's parser looked for `Fehlgeschlagen`;
the real de-DE line is `Fehler <Name>`. It matched nothing and reported that as *"no failures"* — a
green meaning *"my instrument is broken"*. **Test your parser against a real de-DE line before you
believe any result**, and quote wall-clock numbers as **soft** if other lanes are running.

**PIN IMPACT: PIN-NEUTRAL** (measurement only). **SPINE? No.**
**MUTATIONS: none — it is a measurement.** Its guard is the parser non-vacuity check above.
**ACCEPTANCE: none — INFRASTRUCTURE.**

⚠️ **A1 MAY BE REPORTED AND NEVER OPTIMISED TOWARD.** A package justified by an A1 number is R2's
early-warning sign and must be refused at charter time.

---

### M2-18 — the refusal M2 itself creates

**CLASS: PLAYER** · **LANE: `lane/work-blocked`** · **SIZE: S**

> **TODAY** — meaning the day M2-2 lands — **THE PLAYER IS MISLED ABOUT** an order that stalls because
> the only crew member who could take it has that work type switched off. It looks exactly like a
> broken verb. **AFTER THIS** the tile says so.

**Why it is chartered at all.** R3, and the binding memory *invisible-feedback-is-functional*: a
designation the player cannot see is indistinguishable from a broken verb, and that has cost this
project **three owner reports**. The plan's M2 REUSES section says *"M1's `blocked` channel for every
refusal this creates"* — **this package is that sentence, chartered rather than assumed**, because
"the join is a separate package" is R3's own early-warning phrase.

**SEAM.** `hosts/web/GameSession.cs:2285` (`BlockedReason`) gains a fourth question; a new
`WireFormat.ReasonWorkTypeOff = 4`; the client mirror at `client/src/wire/messages.js:521-543`; the
legend at `client/src/ui/blocked-overlay.js:148`.

⚠️ **THE ANSWER MUST COME FROM THE SIM'S OWN PREDICATE** (`Citizen.CanTakeWorkType`, M2-2), asked over
the live crew — **never re-derived host-side.** Same rule as `IsUnfixableWreck`: re-deriving is how
the two answers drift apart.

**PIN IMPACT: PIN-NEUTRAL.** **SPINE? YES** — `WireFormat`. Integrator.

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Return `NotBlocked` for the work-type case | the driven leg: one pawn, Deconstruct off, a painted strip order |
| 2 | Report it when **any** pawn has it off, rather than **all** | the two-pawn leg — ⚠️ with one crew member these are indistinguishable, so **the fixture must carry two** |
| 3 | Rank it above `ReasonAir` | the precedence leg: airless **and** work-type-off must report **air** |
| 4 | Re-derive the predicate host-side | the single-authority leg, recorded at the seam |

**ACCEPTANCE (browser, < 5 min).** Open the WORK tab, set **Deconstruct** to *off*, paint a STRIP
order, and read the tile: it says nobody aboard is assigned that work. Turn Deconstruct back on →
the reason clears and she goes.

**CONFLICTS.** `GameSession.cs`, `WireFormat.Blocked.cs` — serialize against M1-D, M1-E.

**SIZE: S** — one question, on a channel M1 built.

---

## 6. M3 — THE SECOND SOUL *(weeks 7–9)* — OUTLINE DETAIL

> *"I can earn a second crew member, choose which one, and the choice changes what my ship can do —
> and the third, fourth and fifth do not all arrive at once."*
>
> **This milestone IS OD-B's re-chartered gate, verbatim.**

**Granularity note, stated rather than padded:** these are named, sequenced and seamed. They are
**not** fully specified — the M3 owner batch has seven open items and at least three of them change
what these packages contain. **Specify M3 in full at the end of M2**, with four weeks of actuals.

**Estimated: 13 packages · INFRASTRUCTURE ≤ 2 (cap ⌊13/5⌋ = 2).**

| id | package | class | lane | seam / note | pin |
|---|---|---|---|---|---|
| **M3-1** | **`Device.Name`'s double duty — DECIDE IT** | INFRA (design) | `lane/pod-identity` | ⭐ **A collision nobody has filed, and both halves are verified.** W5 puts the sleeper's identity in `Device.Name` — but `Device.Name` is **already the MOSS registry key**: `Simulation.cs:470-471` folds it into the hash with the reason *"`MossBindings.cs:20-32` registers every MOSS adapter BY NAME, so a restore that changed one silently unbinds every player program, no error."* And the wreck's pods **already** encode a person in it: `AuthoredShips.cs:1678` is `Name = "pod_" + pod.Who.ToLowerInvariant()`. ⇒ One field cannot be a stable automation identifier **and** a mutable "who is in the box"; the two meanings diverge the first time a pod is emptied and re-used. One field cannot be a stable automation identifier *and* a mutable "who is in the box". **RECOMMEND: keep `Name` as the registry key; carry the sleeper elsewhere.** ⛔ **Decide before M3-2 freezes the save chapter.** | n/a |
| **M3-2** | **`CryoSystem`** | PLAYER | `lane/cryo-system` | Verified: `grep -rn "CryoSystem" --include="*.cs" .` returns **three hits, all comments asserting its absence** (`Device.cs:37`, `AuthoredShips.cs:1289`, `WreckShipTests.cs:42`). ⭐ **No new `Device` field is needed** — occupied/open is `IsOpen`, the cycle is `Progress`, both already hashed and saved (DEVC v1/v2). | ⛔ **M3-a: P1 P2 P3** (SYSS fold; W0-6 measured exactly this on four *empty* systems) |
| **M3-3** | **`ThawGate` + `ThawCommand`** | PLAYER | `lane/thaw-cmd` | ⚠️ **The thaw is a MOSS SCREEN verb, not a MOSS LANGUAGE verb** — `ScriptRuntime.Tick` consults no device, so a ten-line installed program could empty the bay unattended. SPINE (`Commands`). | pin-neutral (prove) |
| **M3-4** | **The MOSS POD BAY screen** | PLAYER | `lane/pod-bay` | `client/src/ui/moss-screen.js`, `GameSession.HandleMoss`. ⭐ *This is what finally gives "restore MOSS" a job.* | pin-neutral |
| **M3-5** | **Emergency thaw + the lose screen** | PLAYER | `lane/emergency-thaw` | In `CryoSystem`, **never** as a hole in `ThawCommand` (OD-10, decided). | with M3-2 |
| **M3-6** | **The pod census, authored and asserted** | PLAYER | `lane/pod-census` | Print and assert `pods 8 · open at boot 1 · intact 5 · wrecked 2 · thaws available 5` so a later edit cannot drift it silently. OD-11/OD-12 are the pacing dial seen twice: **set the census first, then tune the price.** ⚠️ Conflicts `AuthoredShips.cs`. | pin-neutral if wreck-only — **measure** |
| **M3-7** | **SKILLS — the consumers** | PLAYER | `lane/skill-consumers` | ⭐ *This is why the grid comes first:* a second column on a table M2 already built and already paid the chapter bump for. Changes work rates ⇒ sim-canonical by definition; cannot live in the host-side persona layer (*"the whole mind/persona/fact layer is host state, gate-proven out of determinism at P2"*, `Simulation.cs:390-391`). | ⛔ **M3-b: P1 P2 P3**, +P4 P5 if a def field |
| **M3-8** | **Authored persona sheets for the sleepers** | PLAYER | `lane/sleeper-personas` | Writing, not engineering. Pattern at `AuthoredShips.cs:577-790`. | pin-neutral |
| **M3-9** | **W6 — REST** | PLAYER | `lane/rest` | `Citizen.Fatigue` saturates at 1.0 after ~16 h and **nothing anywhere reduces it** (`NeedsSystem.cs:26`; the `// 1 = exhausted (slows work)` comment at `Citizen.cs:49` is **false**). Every crew member on every ship carries a flat −25 mood forever. ⚠️ **Removing it changes machine wear rates on every ship** — `ShipMetrics.Morale` → `sim/Sim.Core/Director/DirectorSystem.cs:82` (`d.WeightMoraleDeficit * (1f - m.Morale)`, verified) → `_wearPressure` (`:58`) → `MachineWearSystem`. **Rest must enter under M2's priority frame** or it becomes a fifth out-of-band claimant. | ⛔ **M3-c: ALL FIVE** |
| **M3-10** | **A HEATER** | PLAYER | `lane/heater` | *"There is no heater device in the game; a radiator can only take heat out"* (`MachineDefs.cs:101`, `machines.def:62`, `AuthoredShips.cs:1384` — all three say it). Because `CanStageWorkerAt` counts **thermal**, a freezing compartment is unworkable, so **the pressure frontier cannot expand past the heated core and the thaw curve terminates.** ⭐ **This is a content hole that blocks M3's own gate.** | ⛔ **M3-d: P4 P5** (+P1–P3 if a pinned ship gets one) |
| **M3-11** | **A deck-1 vent** | PLAYER | `lane/deck1-vent` | `W4b-DEAD-DECK`: no vertical gas term, both `AirVent`s on deck 0, all eight deck-1 halls peak at 0.000 kPa forever. Owner decided **ship it filed** — that stands, but **a thaw curve needs somewhere to put people.** One line of content. ⛔ **Do NOT close it by re-pressurising in `AddRoomCommand`** — that is the wand W4b deleted on a binding owner decision. | pin-neutral (wreck content) |
| **M3-12** | **Skills in the WORK tab** | PLAYER | `lane/skill-display` | The M3 demo's last beat: *"her row in the WORK tab has different skills from Rell's."* | pin-neutral |
| **M3-13** | **The M3 refusal surfaces** | PLAYER | `lane/thaw-blocked` | Every headroom refusal the thaw gate can make must reach the screen with a **number**. Same rule as M2-18; chartered rather than assumed. | pin-neutral |

**M3'S FIVE-MINUTE DEMO.** At max speed: repair and commission the MOSS terminal → open MOSS → a
**POD BAY** screen listing eight capsules, five intact, two wrecked and named *NO SIGNAL*, one open →
pick one → a refusal **with a written reason** if the ship cannot carry her yet, or a cycle that runs
and opens → she steps out, is named in the Chronicle, appears in CREW WATCH, and **her row in the WORK
tab has different skills from Rell's**.

⭐ **THE FALLBACK, STATED NOW SO IT IS A DECISION LATER AND NOT AN IMPROVISATION:** if M2 slips, ship
**M3-2/M3-3/M3-4 WITHOUT skills** — the thaw mechanism is independent of the grid — and add M3-7 as
planned. It costs one milestone's worth of *"the choice is a name in a list."*

⚠️ **HARD HUMAN GATE AT THE END OF WEEK 9: a real 60-minute owner playtest.** This project has carried
the P2 60-minute bar **unmet since 2026-07-21**. If the gate says the thaw curve is not fun, **M4 and
M5 are the budget that pays for fixing it — which is only true if the gate happens while that budget
still exists.**

---

## 7. M4 — THE PERSON *(weeks 10–11)* — SKETCH ONLY

> *"I can click anyone aboard and get one window that tells me who they are, what they're doing, why,
> and how they are — and every number in it is true."*

**Detailed specification ten weeks out is fiction, and this section says so rather than padding.**
What follows is the package list and the seams; the charters get written at the end of M3.

**Estimated: 8 packages · INFRASTRUCTURE ≤ 1.**

| id | package | note |
|---|---|---|
| **M4-1** | **The Persona window — DESIGN** (INFRA) | ⚠️ **There is no design document.** §1.5.4 is explicitly *"marked, not designed"*: layout, tabs, whether it hosts orders and whether it surfaces a transcript are all open. **R9: this milestone opens with a design package and an owner review, not with code.** |
| **M4-2** | **The Persona window — BUILD** | The seam is one function body (`openPersonaForSelected`). The census that guards it is `client/test/surface-boundary.test.js:856` — `CREW_INTERACTION = ['openBioForSelected', 'talkSelectedCrew']`, which the Persona window must **shrink to one, not join.** |
| **M4-3** | **Stop lying in the dossier** | `client/src/ui/panels.js:297-420` is **four of eight sections fully fabricated** and one half fabricated: NEEDS (`:328`), YOUR STANDING (`:338`), BACKSTORY (`:389`), RECENT MEMORIES (`:394`) — all from `SAMPLE_*` at `:248-266`, each wearing a `◇ SAMPLE` badge (`:273`). Identity, traits, relationships and the conversation log are **real**. |
| **M4-4** | **`Health` / `Morale`: make real or delete** | `Citizen.Health` (`:31`) is **never written by any system** despite a doc comment claiming *"damaged by hypoxia, cold and struggle"*; `Citizen.Archetype` (`:35`) is saved and hashed **with no reader anywhere**; `Persona.RoleNow` is cosmetic. ⚠️ **Owner decision.** *(`Morale`'s constant bar was pulled forward to M1-F; what remains here is the decision, not the bar.)* Making them real ⇒ pin chain. |
| **M4-5** | **The onboarding card's full rewrite (WP-C)** | It teaches exactly TALK and BUILD (`onboarding.js:18-27`, `:39-46`), naming none of DIG, STOCKPILE, STRIP, OPERATE, the Room Zoom, the deck rail or the work grid. **The first thing a new player reads teaches the one verb the owner stood down.** *(M1-B fixed the factually-wrong `B` row; this is the content rewrite.)* |
| **M4-6** | **RUG and SHELF: wire or remove** | `roomzoom-view.js:988-991`, module-local `_decor`. **The player places furniture that does not exist, will not save, and no crew member can ever see.** |
| **M4-7** | **CHRONICLE made reachable** | `chron` is emitted, cached, and unreachable — `INERT_TABS = ['chron']` at `overview-model.js:262`, and `overview-view.js:1024` refuses to select it. **The Chronicle is VISION's stated emotional payload and the standard surface cannot open it.** R3's own named instance. |
| **M4-8** | **WP-9 — the console deletion** | `hud.js` splits into the shared `ship-state.js` plus the dying `.app` chrome. Its own record deflates it: *"the anti-recurrence goal was met at WP-0, not at WP-9"* — *"cleanup that can wait for a quiet week."* ⚠️ **Carries a hard human gate: a person must play `--ship grid` end to end first, and "no agent can be that human."** **Schedule it here; let it slip without guilt.** |

---

## 8. M5 — A RUN WITH A SHAPE *(weeks 12–13)* — SKETCH ONLY

> *"I can sit down, play the wreck for an hour, and the session has a beginning, a middle and an
> ending I can tell someone about."*

**Estimated: 7 packages + save/load's own lane · INFRASTRUCTURE ≤ 1.**

| id | package | note |
|---|---|---|
| **M5-1** | **THE ENDING** | The lose screen (M3-2's branch fires it when no intact pod remains) and a *"the ship is yours"* state with a **stated condition**. ⭐ **This is what the player sentence promises and it is the only item that must land.** |
| **M5-2** | **ALERTS** | So a crisis reaches the player instead of waiting to be noticed. **Without alerts an hour-long session is an hour of watching.** |
| **M5-3** | **A stated mid-game goal** | |
| **M5-4** | **Art and legibility pass on the wreck** | Judged from browser shots by the owner (binding: *review seams, not art*). ⚠️ **Second hard human gate: a real 60-minute playtest + the P2 blind-A/B screenshot verdict** — both bars unmet since 2026-07-21. |
| **M5-5** | **`ItemKind.Regolith → Rubble`** (OD-6, decided) | Pin-neutral, but touches sim, content, client art ids and tests at once ⇒ **runs alone**; a clean auto-merge would prove nothing. `ItemStack.cs:5` already calls it *"legacy name: debris spoil from cleared sections"*. |
| **M5-6** | **The device-removal hole** | A built door cannot be removed by any verb on any surface: `DeconstructSystem.cs:378` is `if (device.Kind == DeviceKind.Door) return false;` (verified), DEMOLISH refuses it, and `roomzoom-view.js:1084-1102` carries the open defect **DOOR-NO-REMOVAL** in its own words — *"a player who clicks DEMOLISH on a door is sent to a verb that will refuse it."* |
| **M5-7** | ⚠️ **SAVE/LOAD — SIZED, AND NOT PROMISED** | **It does not exist outside the test suite.** `SaveWriter`/`SaveReader` live at `sim/Sim.Core/Save/` and are referenced **only under `tests/`**; no host writes or reads a save file; `CmdKind` (`GameSession.cs:2764`) has no verb. It is **four things**: host file IO (a home nobody has chosen) · a restore path (`Simulation` is built by `SimHost.Build`; nothing re-enters it from a file) · wire resync (`GameSession` keeps *one global* session and every delta gate assumes continuity) · and **the unhashed layer** — personas, MEMS minds and the Chronicle are deliberately outside determinism (`Simulation.cs:390-391`: *"the whole mind/persona/fact layer is host state, gate-proven out of determinism at P2"*), so **a save that restores the sim but not the people restores a ship of strangers.** ⇒ **Its own milestone-sized lane, and explicitly the quarter's release valve.** |

> ⭐ **THE DESIGN BET M5 MAKES, NAMED, WITH ITS FALLBACK.** The wreck has **no antagonist and no event
> system.** All tension is endogenous: wear, air, heat, food, and the rising draw of each person you
> wake. That is VISION pillar 1 taken literally, and it is a bet.
> **Early warning that the bet is losing:** the middle of a session goes quiet.
> **The fallback:** the **Director already exists, is registered, and is gentled to a 1.35 lever**
> with a hard rule that it never rolls dice. Widening that lever is a tuning change.
> ⛔ **Do not answer a quiet middle by building an event system** — that breaks pillar 1 to fix a
> pacing problem.

---

## 9. COUNTS, AND THE INFRASTRUCTURE LEDGER

| milestone | packages | PLAYER | INFRASTRUCTURE | cap (⌊n/5⌋) | headroom |
|---|---:|---:|---:|---:|---|
| **M1** | 7 | 6 | **1** (M1-G) | 1 | ⚠️ **AT CAP** |
| **M2** | 15 | 12 | **3** (M2-0, M2-7, M2-17) | 3 | ⚠️ **AT CAP** |
| **M3** *(outline)* | 13 | 12 | **1** (M3-1) | 2 | 1 |
| **M4** *(sketch)* | 8 | 7 | **1** (M4-1) | 1 | ⚠️ **AT CAP** |
| **M5** *(sketch)* | 7 | 7 | **0** | 1 | 1 |
| **QUARTER** | **50** | **44** | **6** | **10** | **4** |

**Against the plan's projection (~76 packages, ≤15 infrastructure): this document charters 50 and 6.**
The difference is not optimism — it is that M3/M4/M5 are outline and sketch, and **their charters will
add packages when they are written.** ⚠️ **The infrastructure ratio, however, is the number to watch:
at 6 of 50 the quarter is at 12 %, comfortably inside 20 %, but M1, M2 and M4 are each individually
AT CAP.** Chartering one more infrastructure package in any of those three is a **refusal**, and the
only way past it is an explicit owner override recorded by name and date.

**Four notes on the classification, so a reviewer can check it:**
0. ⭐ **THE SPLIT-SENTENCE RULE IS USED EXACTLY ONCE, BY M2-1** — the one place a package with no demo
   of its own is chartered `PLAYER`. It is defended in M2-1's own charter, its co-packages
   (M2-2/M2-3/M2-4) are chartered rather than promised, and **the demo is named and owned by M2-3**.
   ⚠️ **If a second package ever claims this rule, that is the signal it has become a loophole**, and
   the reviewer should refuse it. *(Recomputed in revision 1: relabelling M2-1 `INFRASTRUCTURE` takes
   M2 to 4 of 15 against a cap of 3 — a refusal requiring a named owner override. That is the
   arithmetic the rule is load-bearing against, and it is stated so nobody has to redo it.)*
1. **Design packages are INFRASTRUCTURE** (M2-7, M3-1, M4-1). Their deliverable is a document; they
   have no demo, and giving them a fabricated player sentence is the exact failure §6 exists to stop.
2. **A re-pin commit is NOT a package** (§6(3c)). M2-1, M2-8, M2-11, M2-12, M3-2, M3-7, M3-9, M3-10
   each carry a re-pin as their **ritual tail** and count **once**, under their own sentences.
3. **A guard fix riding inside a PLAYER package is not a separate charter.** M1-C's palette census
   move, M2-4's delta gate, M2-12's four-cell inclusion table — all ride inside their packages. Only a
   guard fix chartered **for its own sake** counts, and **this document charters none**: the plan
   capped guard-hardening as a programme, and that cap is respected.

---

## 10. THE CONFLICT MATRIX — files with more than one claimant

| file / area | claimants | rule |
|---|---|---|
| `sim/Sim.Gen/AuthoredShips.cs` | **M1-A** (in flight), M2-11, M3-6, M3-11 | ⛔ **Strictly serialized.** M1-A owns it now. |
| `sim/Sim.Core/Jobs/JobSystem.cs` | M2-2, M2-5, M2-8 | ⛔ **Strictly serialized.** Integrator-reviewed by its own doc comment. |
| `sim/Sim.Core/Entities/Citizen.cs` | M2-1, M2-2 | M2-1 first, alone. |
| `Simulation.cs` / `SaveWriter.cs` / `SaveReader.cs` | M2-1, M2-8, M3-2 | ⛔ **SPINE — integrator lane only, one at a time.** |
| `hosts/web/GameSession.cs` | M1-D, M1-E, M2-4, M2-6, M2-9, M2-18 | ⛔ **Serialize.** ⚠️ *This file is the single largest merge hazard in the quarter — six claimants, and the merge that broke `DeviceCell` was a silent auto-merge on a field list, not a conflict git flagged.* |
| `hosts/web/WireFormat*.cs` | M1-D, **M1-E**, M2-4, M2-9, M2-18 | ⛔ **SPINE — integrator.** New channels go in **new `partial` files** (`WireFormat.cs` should have a zero diff). *(M1-E was missing from revision 0's matrix; it may add a refusal reply code to `WireFormat.Operate.cs`.)* |
| `client/src/ui/overview-view.js` | **M1-B** (in flight), M1-C, M1-F, M2-3 | M1-B first; the rest rebase onto it, then serialize. |
| `client/src/ui/roomzoom-view.js` | M1-C, M2-10 | Serialize. |
| `client/src/input/controls.js` | **M1-B** (in flight), M1-C | M1-C rebases onto M1-B. |
| **`client/src/ui/panels.js`** | **M1-F**, M4-3, M4-4 | ⭐ **New row.** M1-F removes the MORALE meter (`:313-315`) and corrects the REAL/SAMPLE ledger (`:219`); M4-3/M4-4 rewrite the same card. **M1-F lands first and M4-3 must re-read the ledger, not restore it.** |
| **`client/src/ui/hud.js`** | **M1-F (declines it)**, M4-8 (WP-9) | ⭐ **New row, and it exists to record a DELIBERATE non-claim.** `hud.js:951-953`, `:981-984`, `:1008` still draw morale. M1-F leaves them: the shell is **closed to new work** and `TABLE_CELLS` sits inside an equality-pinned widget census. **They die with WP-9 at M4-8.** ⚠️ Written down so a future reader can tell *"excluded"* from *"missed"*. |
| **`tests/Perilune.Tests/BlockedChannelTests.cs`** | **M1-A** (semantically), M1-D, M1-E, M2-18 | ⭐ **New row — FOUR claimants and revision 0 had none.** It carries a **named tripwire** at `:351` and `:412`: *"they are UNEXPLORED at tick 0 and so fog-gated off this channel. **If boot fog ever changes, this assertion is the tripwire and the fix is to exclude them by name, not to weaken it.**"* M1-A changes boot fog. It also carries `:794-811`, the pin that `ReasonNoConsumable` is **never emitted** — **M1-E must leave it passing; M2-9 flips it.** ⛔ **Serialize, and re-derive every row count from the MERGED tree.** |
| `client/test/surface-boundary.test.js` | M1-C, M2-3, M2-4, M2-10, M4-2 | ⚠️ **Every claimant moves an equality-pinned census.** **Re-derive the number from the MERGED file with the shipped `codeOnly` stripper; never adjust either branch's figure.** |
| `sim/Sim.Core/Jobs/*` (sources + `IJobSource`) | M1-D, M2-2, M2-5 | ⭐ **New row.** M1-D mirrors `IsBackedOff` onto three sources; M2-2/M2-5 edit `TryAssign` and `HandledKinds` consumers. **Serialize — all three are integrator lanes.** |
| `sim/Sim.Core/Systems/MachineWearSystem.cs` | M2-2, M2-5, **M2-12** (reads `IsUnfixableWreck`), M2-9 | Serialize. |
| `CLAUDE.md` / `MECHANICS.md` / `HANDOVER.md` | M1-G and **every re-pin commit** | ⛔ **Integrator only.** Land M1-G in a quiet window between pin-chain rows. |

### ⭐ THE COUPLINGS GIT CANNOT SEE — named, because a clean auto-merge is not a clean merge

| pair | the shared thing | what it costs if ignored |
|---|---|---|
| **M1-A ↔ M1-D** *(merge positions 1 and 3)* | `TileFlags.Explored` at boot. Every `blocked` row is fog-gated on it (`GameSession.cs:2311`). | **No shared file.** M1-D's tests and its browser acceptance can pass on its own branch and be wrong in the merged tree. ⇒ **M1-D re-runs both after M1-A merges and says so in its merge note.** |
| **M1-A ↔ M1-E** | same | same |
| **M1-A ↔ `BlockedChannelTests.cs`** | the boot-fog tripwire at `:351`/`:412`, about `--ship grid` | If M1-A generalises the fog rule, both go red. **The fix is the test's own: exclude the grid designations by name. ⛔ Never weaken the assertion.** |
| **M1-E ↔ M2-9** | `BlockedChannelTests.cs:794-811` | M1-E must leave `ReasonNoConsumable` **un-emitted and pinned**; M2-9 flips the same pin. If M1-E emits it, it has silently taken M2-9's package. |
| **M2-2 ↔ M2-5** | `TryAssign`'s veto and its band loop are the same lines | Both are integrator lanes on the file whose own header says it is *"the only file in the job system the integrator reviews."* |

> ⚠️ **A CLEAN AUTO-MERGE IS NOT A CLEAN MERGE, and this repo has proved it four times.** Two lanes
> with no overlapping lines produced one red test (the 0.2 vs 0.25 threshold). Two lanes each added
> `export function cssCodeOnly` at different offsets and produced a module that would not load. Two
> lanes each re-counted the same census **honestly** and **both were stale in the merged file**. And
> `DeviceCell`'s field list auto-merged silently, leaving a delta gate that ignored `Open`.
> ⇒ **Every lane in this table merges `main` into itself and re-runs the FULL gate before asking for
> review. Do not trust the auto-merge, and re-derive every censused number from the merged tree.**

---

## 11. WHAT TO START TONIGHT

**Three lanes, chosen for information value and for not colliding with the two already in flight.**

| # | lane | package | why tonight |
|---|---|---|---|
| **1** | **`lane/spike-dispatch`** | **M2-0 — the R1 spike** | ⭐ **The highest-information hour available.** It answers the single largest uncertainty in the quarter (*is M2's dispatch rewrite three days or three weeks?*), it sizes M3/M4/M5, and it also settles M2-5's equal-band decision — the thing that determines whether M2-5 joins the pin chain. It is a **throwaway branch that never merges**, so it collides with nothing and can run beside everything. ⚠️ **Leg A is mandatory; without it the spike is uninterpretable, and the version without it returned a FALSE PASS.** |
| **2** | **`lane/blocked-reach`** | **M1-D — the third question** | Closes the measured **480 000-tick silent stall** — the most legible defect on the shipping game. Its files (`GameSession.cs`, `WireFormat.Blocked.cs`, `blocked-overlay.js`, `sim/Sim.Core/Jobs/`) are **disjoint from both in-flight lanes' files**. ⚠️ **IT IS AN INTEGRATOR LANE** (it appends a `WireFormat` reason and lifts a method onto `IJobSource`) — see the reconciliation below. ⚠️ Start from `WireFormat.Blocked.cs:78-100` and `HaulJobSource.cs:137`, which **already contain the prescription and the API**; do not re-derive them. ⭐ **Semantically coupled to M1-A — re-run everything after M1-A merges.** |
| **3** | **`lane/undesignate`** | **M1-C — un-designate** | The most-requested missing gesture, wire and sim already complete, and it unblocks M2 (*"the first thing a player does with a new frame is change their mind"*). ⚠️ **It shares `controls.js` and `overview-view.js` with `lane/first-screen`.** Start it now, but **rebase onto `lane/first-screen` before asking for review**, and expect the `ROOM_TOOLS.length === 16` census to move to 17 deliberately. |

> ### ⚠️ RECONCILING §11 WITH THE INTEGRATOR-LANE RULE *(new in revision 1 — revision 0 told three
> lanes to start at once while one of them is integrator-only, and did not say who does what)*
>
> **`lane/spike-dispatch` and `lane/undesignate` are ordinary lanes** — any implementing agent takes
> them, in its own worktree, reviewed by a separate agent (the binding orchestration rule).
> **`lane/blocked-reach` is integrator work** and must be taken by whoever is holding the integrator
> role, because it appends to `WireFormat` and changes an `IJobSource` contract.
> ⇒ **If the integrator is already occupied merging `lane/wreck-visible` and `lane/first-screen`
> (positions 1 and 2), start it SECOND rather than in parallel** — and note that this is the natural
> order anyway, since M1-D must re-run against M1-A once it lands.
> **In that case the third parallel lane tonight is `lane/premise-fix` (M1-G)**: docs-only, zero code
> conflict, and it unblocks the M1 owner decision batch, which is the quarter's stated binding
> constraint (R5).

**Do NOT start tonight:** anything on the pin chain (§2). `lane/work-state` is the head of the chain
and should wait for M2-0's answer — starting it before the spike is exactly the *"a cost argument used
as an order argument"* mistake in reverse.

> ### ⚠️ THE PACKAGE IDS ARE NOT CONTIGUOUS, AND THAT IS DELIBERATE
> **`M2-13`, `M2-14`, `M2-15` and `M2-16` DO NOT EXIST.** Revision 0 drafted and then folded them:
> a "Repair as a work type" package (redundant — it is M2-2 plus M2-5), a `HoldPosition` migration
> (there are no saves to migrate, §0.4), a `SHIP_STATE_REACH` census package (a guard chartered for
> its own sake, refused under the capped guard-hardening programme), and a demo-verification package
> (it rides inside every charter). **Ids are stable once published**, so the gap is recorded rather
> than closed by renumbering — a renumber would invalidate every cross-reference in §3, §9 and §10.

---

## 12. CORRECTIONS FOUND WHILE WRITING THIS — verified against `main` @ `72fbca4`

**These are corrections to the plan of record and to the approved plan. Read them before implementing
M2.**

**12.1 THERE IS NO `MaintenanceSystem.cs`.** `MaintenanceSystem` is a second class **inside**
`sim/Sim.Core/Systems/MachineWearSystem.cs`, declared at `:140`. `RecruitForNeediest` is at `:189` and
its recruiter `FindNearestIdle` at `:418-434`. An implementer told to open `MaintenanceSystem.cs` will
not find it.

**12.2 `EffectValidator.cs` IS NOT UNDER `sim/Sim.Llm/`.** It is
`sim/Sim.Core/Effects/EffectValidator.cs`, and the assignment is at `:141`
(`citizen.JobKind = JobKind.Dig;`). Its guard chain is at `:110-122` — it checks
`citizen.JobKind != JobKind.None` (`:111`) but **never `IsRecruitableForWork`**, confirming the plan's
finding that it bypasses every per-citizen gate.

**12.3 ⛔ THE PLAN'S M2 CONTENTS ITEM 2 LISTS FIVE ASSIGNMENT SITES AND ONE OF THEM MUST NOT BE
GATED.** It names *"`TryAssign`, `SustenanceSystem`, `CraftingSystem`, `MaintenanceSystem` — plus
`EffectValidator.cs:141`."* **`SustenanceSystem` must be excluded.** It recruits on `IsIdleForWork`
(`SustenanceSystem.cs:82`), **deliberately not** `IsRecruitableForWork`, and `Citizen.cs:86-90` states
the rule: *"a move order suppresses WORK, never SURVIVAL… An order the player gave must not be a way
to starve someone."* `DESIGN-NOTE-priority-grid-seam.md` decision 2 agrees: **Eat/Drink/Flee are never
work types.** ⇒ **Four sites, and the fifth is a trap.** A lane following the plan's Contents item 2
literally would ship a game where switching off enough work types starves a crew member.
**M2-2's mutation 5 is a negative guard that pins this.**

**12.4 ⭐ `ReasonNoConsumable` IS ALREADY BUILT — AND M1 CANNOT EMIT IT.**
`WireFormat.Blocked.cs:312` declares it; `client/src/wire/messages.js:543` already names it
*"NO PARTS OR SEALS ABOARD"*; `BlockedChannelTests.cs:794-811` **pins that this host never emits it.**
The vocabulary is complete. What is missing is an **order to hang it on** — `blocked` rows are read
from the order registries (`GameSession.cs:2432`), and there is no repair order until **M2-9**.
⇒ The plan's M1 item 6 lists this refusal in a two-week milestone that structurally cannot discharge
it. **Re-homed to M2-9, by name, in one line.**

**12.5 ⭐ THE CLOSED-CRYO-POD REFUSAL CANNOT BE A `blocked` ROW EITHER.**
`DeconstructSystem.Designate` (`:435`) opens `if (!CanDesignate(sim, pos, kind)) return false;` — **it
refuses without registering**, so there is no pending site for a row. The refusal at `:400` must be a
**one-shot click reply** on the OPERATE precedent (`GameSession.cs:1067`, `EmitOperate(pos,
WireFormat.OperateRefused, …)`). ⚠️ **`DeconstructSystem.cs:397-400`'s own comment says
*"the `blocked` channel is the surface that should carry it"* — that comment is wrong about the
mechanism, and M1-E corrects it in place.**

**12.6 M1-D IS A `sim/` CHANGE, NOT A HOST-ONLY ONE — but this was NOT a discovery.** The per-tile
unreachable backoff the plan correctly identifies as the right instrument is `private readonly` in
three of four sources (`DigJobSource.cs:28`, `DeconstructJobSource.cs:46`, `BuildJobSource`
`_readyRetryAt` `:210` / `_matRetryAt` `:223`; stamp value `JobWork.UnreachableRetryTicks = 50`,
`JobContext.cs:55`). Reading it requires lifting a query onto `IJobSource`, so the package is **M, not
S**, and must prove pin-neutrality rather than claim it.
⚠️ **REVISION 1 RETRACTS THE FRAMING.** Revision 0 presented this as new; **it is written down on
`main` in the file M1-D edits** (`WireFormat.Blocked.cs:78-100`), and `HaulJobSource` has already made
its own public with the canonical name. See **§12.11** — the name is `IsBackedOff`, and the durable
lesson is that *"this session found X"* is worth checking against the tree before it is written down.

**12.7 `ROOM_TOOLS.length` IS EQUALITY-PINNED AT 16** (`client/test/room-model.test.js:121`), with
three derived button-count assertions at `:1656`, `:1660`, `:1663`. M1-C moves it to 17 deliberately.
`KNOWN_GAPS_SEALED = ['dig','stockpile','strip']` (`surface-boundary.test.js:144`) is **not**
affected — `erase` is a standard-surface tool, not a console verb being ported.

**12.8 `JobContext.AbandonJob` IS AT `JobContext.cs:93`**, not `:95` (`:95` is the method body's first
line). Cite the method, not the line, when handing it to a lane.

**12.10 ⭐ THE `blocked` CHANNEL CARRIES THREE ORDER REGISTRIES AND MUST NOT CARRY A FOURTH.**
`BuildBlocked` walks dig tiles (`GameSession.cs:2418-2425`), strip (`:2427-2433`) and build (`:2435+`).
A stockpile walk is **refused by name** at `WireFormat.Blocked.cs:114-121` — the `zones` channel
already carries it (`WireFormat.ZoneFlagBackedOff`, fed by `HaulJobSource.IsBackedOff`) and the Room
Zoom already draws it (`zone-overlay.js`'s `rz-zone-backedoff`, *"NOT REACHED"* in the zone key).
Adding one *"would be the two-sources-for-one-layer defect the `marks` channel exists to remove."*
⚠️ **Any package proposing a fourth registry on this channel must overrule that ruling explicitly, by
name, not silently.**

**12.11 ⭐ `IsBackedOff` ALREADY EXISTS AND ALREADY HAS A CANONICAL NAME.**
`sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:137` is
`public bool IsBackedOff(Int3 pos, long tick, out long untilTick)`, documented as **"THE ONE
DEFINITION OF 'BACKED OFF'"**, and `WireFormat.Blocked.cs:78-100` already prescribes mirroring it onto
the other three sources. ⛔ **Do not invent `IsBackedOffAt` or any variant.** ⚠️ **And it is NOT a
reachability predicate** — it means *"a claim was attempted and failed within the last 50 ticks"*
(`JobContext.cs:55`), it is **cleared wholesale** on `JobBoardDirty.Tiles`
(`HaulJobSource.cs:487-489`), and on a one-pawn ship it therefore **goes false while the situation is
unchanged.** Any consumer must decide, in writing, whether it latches.

**12.12 ⭐ THE WRECK'S REPAIR ECONOMY IS FINITE, AND `IsUnfixableWreck` MAKES IT PERMANENT.**
`AuthoredShips.cs:1888-1889` ships **1 Parts + 2 Seals**. `MachineWearSystem.cs:463-472` refuses every
service to a device below `wreck_threshold = 0.25` once no consumable remains — and free jury-rig is
refused there too. `wing_b` (0.18) and `wing_c` (0.06) are below it. ⇒ **The `18.00 kW` ceiling quoted
throughout the plan of record is unreachable; the true ceiling is `17.40 kW`** (`6.00 + 5.70 + 5.70`).
⚠️ **The demo still lands** — the Comfort threshold is 14.30 kW — **but the soft-lock is real and is an
owner decision** (M2's batch item 6, stated in M2-12).

**12.13 A SHIPPED SOURCE COMMENT CARRIES A STALE LINE NUMBER, AND M5-6'S IMPLEMENTER WILL FOLLOW IT.**
`client/src/ui/roomzoom-view.js:1087` says *"`sim/Sim.Core/Systems/DeconstructSystem.cs:345` is
`return device.Kind != DeviceKind.Door;`"*. **`:345` is now a doc-comment line about `CryoPod`**; the
actual refusal is `:378`, `if (device.Kind == DeviceKind.Door) return false;`. The comment's *claim*
is still true and its *citation* is not — fix the citation inside M5-6 rather than filing it.
⚠️ *This is the shape the repo has hit repeatedly: **a package's code can be right and its
justification false.** A line number is part of the justification.*

---

## 13. THE STANDING RULES A REVIEWER APPLIES TO EVERY PACKAGE HERE

Compressed from `CLAUDE.md`'s Traps section and this repo's eight recorded trap shapes. **A reviewer
who checks nothing else should check these.**

1. **Physically apply every named mutation, watch it go red, revert.** A mutation you only *described*
   is not evidence. **Every** E0-4 and E0-5 work package failed its first independent review on this.
2. **A mutation must leave the module loadable.** A crash is a **FALSE RED** and it presents as a
   small, plausible failure count — not as an explosion. Report crashes as crashes.
3. **Blind every leg of a multi-leg test.** `assert` throws, so only the first failing leg reports,
   and a dead second leg is indistinguishable from a live one.
4. **Non-vacuity by INCLUSION, never by population count.** Plant the violation and require it caught.
   A count proves a matcher matched *something*; it never proves it would match *the thing*.
5. **A source-text guard uses the shipped stripper and a negative control with a LATER REAL COMMENT.**
6. **To pin *how* an API was called, record the argument at the seam.** Never scan for a spelling.
7. **A ratio suite cannot see a scale error.** Pin at least one **absolute, proportional** floor.
8. **Re-derive every censused number from the MERGED tree.** *"Nothing calls this yet"* is a statement
   about a **tree**, which a merge changes.
9. **`git checkout` must NEVER appear in a mutation loop.** Restore from an in-memory copy taken
   before the first mutation, with `shutil.copy` + `os.utime` — never `copy2`.
10. **Test your harness's own parser against real output before you believe a red or a green.** This
    machine is **de-DE**; `^ *error CS` never matches, and `Fehlgeschlagen` is not the failure line.
11. **A package's code can be right and its JUSTIFICATION false** — that was 4 of 5 required fixes on
    one lane. Re-read your own charter's claims at review.
12. **Verify in a browser, not only in assertions.** Every serious player-visible defect this project
    has found came from someone opening the game and looking.
