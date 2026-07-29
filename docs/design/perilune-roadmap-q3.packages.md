# The next three months — the BUILDABLE PACKAGES

*Derived 2026-07-28 on `lane/roadmap` from `docs/design/perilune-roadmap-q3.plan.md` (revision 1,
`d2113b1`), base `main` @ `72fbca4`. **This is the implementation document.** The plan says what and
why and in what order; this says who does what, against which line, with which mutation, and how a
human checks it in a browser.*

**Binding inputs, in precedence order:** `OWNER-VISION.md` · ⭐ **OD-G / OD-H** (2026-07-29 — the
newest, and they REVERSE a decision this document published) · **OD-A / OD-B / OD-C** (the three owner
decisions of 2026-07-28) · the OD-1…OD-12 record in `docs/design/perilune-wreck-start.plan.md` §7 ·
the approved plan · the invariants and the **Traps** section in `CLAUDE.md`.

---

> ## ⛔ REVISION 3 — TWO OWNER DECISIONS REVERSED M2'S DEFAULT *(2026-07-29)*
>
> **OD-G: the pawn boots idle and waiting; the first thing that happens in the game is the player
> giving an order, after which normal autonomy resumes under a visible work grid.**
> **OD-H: the work grid DEFAULTS OFF. A pawn does a work type only once the player enables it.**
>
> ⛔ **This reverses M2-1's chartered *"default every work type to 3 for every pawn"* — quoted rather
> than cited by line, because §12.13's own lesson is that a line number is part of a justification and
> this file's line numbers moved twice today. **Find it under M2-1's *"THE SHAPE"*, where the reversal
> is applied in place.** The owner accepted the consequences explicitly: a pin move and a
> re-baseline.**
>
> **⭐ THE REASON THE REVERSAL WAS NEEDED IS THE REASON THIS DOCUMENT EXISTS.** Default-3 was chosen
> *"so shipped dispatch behaviour is the closest thing to today's"* — i.e. **to keep M2-1 off the pin
> chain's behaviour column. A COST ARGUMENT DECIDED A DESIGN QUESTION**, which is the exact failure
> mode plan §3.1 names by name (*"'it is the biggest lane' is a COST argument being used as an ORDER
> argument"*). And it did not merely cost a little legibility: **default-3 foreclosed OD-G by
> construction** — a pawn whose every work type is enabled cannot boot waiting for an order.
>
> **The full re-charter, with every voided claim listed, is at the top of §5.** Do not read revision
> 2's M2 rows without it: **§5's REVISION 3 block supersedes them wherever they disagree.**

---

> ## ⛔ REVISION 2 — THE M2-0 SPIKE LANDED AND REFUTED THE SEAM M2 WAS BUILT ON *(2026-07-29)*
>
> **`scratchpad/SPIKE-M2-0-findings.md`. The spike BUILT the adopted shape and MEASURED it, so it
> outranks every analysis in this document, in the plan, and in the integrator's send-back.** This is
> the R1 uncertainty resolving, exactly as chartered — and it resolved *against* the plan.
>
> ### 1. ⛔ THE ADOPTED SHAPE IS A MEASURED NO-OP FOR THE OWNER'S OWN CASE
>
> Shape (c) — *"`TryAssign` iterates bands and asks each push recruiter whether it has a claimable job
> at band b"* — was built and driven on `--ship wreck`:
>
> | config | first `Deconstruct` | verdict |
> |---|---:|---|
> | Repair@1 / Decon@4, painted **t=0** | 54 652 | ✅ inversion |
> | **Decon@1 / Repair@4, painted mid-chain** | **54 652** | ❌ **byte-identical to baseline** |
>
> **The second row is the owner's sentence — *"my order matters more than your maintenance"* — and it
> does nothing.** Instrumented cause: **`JobSystem` saw the pawn idle on ZERO of the 54 450
> maintenance-chain ticks**, because `MaintenanceSystem.Tick` runs `DriveWorkers` **then**
> `RecruitForNeediest` and therefore frees and re-claims the same pawn **inside one tick**. The
> dispatcher never gets a look-in.
>
> ⇒ ⭐ **PRIORITY CANNOT LIVE IN THE DISPATCHER. No dispatcher-side banding can reorder a push
> recruiter.** M2-5 is re-chartered as **ONE ARBITRATION POINT WITH FIVE ENTRY SITES** — both a
> *defer* half and a *push gate* half, **neither sufficient alone, measured**:
>
> | | t=0 inversion | the running-chain case |
> |---|---|---|
> | defer only *(what revision 1 specified)* | ✅ | ❌ **no-op** |
> | push gate only | ❌ lost | ✅ 7 232 |
> | **both** | ✅ | ✅ **7 232 (7.3×)** |
>
> ### 2. ⭐ EQUAL BAND — DECIDED, NOT LEFT OPEN
>
> The spike found equal band is **not a tie-break, it is deprioritisation**: Repair@2 + Decon@2 both
> claimable at t=0 and the order waits out the entire chain (54 632), decided by an arbitrary *"push
> before pull"* — **and shipped `main`'s implicit tie-break is the opposite.**
> ⇒ **DECIDED (integrator, on RimWorld's answer): within a band, ties break by the work type's
> POSITION IN THE WORK LIST** — a fixed, authored, top-to-bottom order the player **can see in the
> grid**. The column order *is* the tie-break, so nothing is arbitrary and nothing is hidden.
> ⛔ **Revision 1's "strictly-higher band" recommendation is SUPERSEDED and struck.**
>
> ### 3. ⭐ PRE-EMPTION'S RISK ROW IS INVERTED — it is the CHEAPEST and SAFEST leg
>
> **Zero lines in `sim/`. Three host lines. One tick** (order at t=231 → `Deconstruct` at t=232), on
> `SafetySystem`'s own path — and it is **`Simulation.CancelJob`**, not `JobWork.AbandonJob`, that
> runs. **All three "hard cases" measured SAFE.** ⇒ **M2-7 (the pre-emption POLICY design package) is
> RETRACTED — the engine already answers it**, and its owner-batch item is replaced.
>
> ⚠️ **But pre-emption alone is useless:** the pre-empted pawn was re-claimed by `MaintenanceSystem`
> **within the same tick** (idle 11 of 30 000). ⇒ ⭐ ***"That machine, now" is not CANCELLING, it is
> HOLDING***, and nothing in the sim expresses it. **New package M2-19 — the sticky claim**, a second
> hashed bool whose **storage batches into M2-1's chapter bump** (free, W0-1b's shape).
>
> ### 4. ⚠️ A NEW HAZARD, AND IT IS SILENT AND MULTI-SIM-HOUR
>
> **An over-reporting defer query stalls everything at or below its band.** With 4 pawns the order was
> **never served in 40 000 ticks** (40 782 at 200 k), because `CraftingSystem`'s defer query cannot see
> `AllInputsStaged` / `_buildWantsMaterial` — computed later in its own `Tick`. **A defer query must be
> as strong as the actual claim, and you cannot make it so without doing the path, which is the
> expensive part.** No error, no log; it looks exactly like *"the pawn is busy."* M2-5 gains a required
> driven **multi-pawn** leg.
>
> ### 5. ⛔ A NEW FOUND DEFECT, LIVE ON `main` TODAY — and the grid EXPOSES it on day one
>
> With Repair off, the pawn enters a **30-tick `Craft` recruit→abandon thrash forever — 33 % of all
> crew-ticks.** Leg A's own baseline trace proves it exists on `main` unmodified. It is invisible
> **only because the maintenance monopoly absorbs the pawn — which is exactly what shipping a
> work-priority grid stops doing.** ⇒ **§0.1 below, and chartered as M1-H, to be fixed BEFORE or WITH
> M2.**
>
> ### 6. ⚠️ THE `54 650` FIGURE WAS DOING DOUBLE DUTY, AND *I* REPEATED THE ERROR
>
> It is an **absolute tick** — where `Deconstruct` starts, and the length of the maintenance chain.
> **It is NOT a wait.**
>
> | order painted | first `Deconstruct` | actual wait |
> |---|---:|---:|
> | t=0 (pawn idle) | **t=1** | **0** |
> | t=2000 (pawn mid-service) | t=54 652 | **52 652** |
>
> ⇒ **With the order painted at t=0, repair does NOT beat a painted strip order — the order wins at
> tick 1**, because `JobSystem` ticks before `MaintenanceSystem` and the pawn is idle. So *"does
> Repair@1 beat a painted strip order"* was satisfiable **both ways** on the shipped sim, purely by
> paint timing. Revision 1's send-back called it a wait; **that was wrong and the correction is
> published here rather than quietly dropped.** ⭐ *This is the third time in three revisions that a
> number in this document meant something other than what it was used for. **A measurement carries its
> units and its baseline, or it is not a measurement.***
>
> ### 7. WHAT SURVIVED, NOW MEASURED RATHER THAN ARGUED
>
> **`IJobSource.Select`'s signature genuinely does not need to change** — run the existing, unmodified
> argmin once per band over only the sources at that band; `bestDist` threading works unchanged inside
> a band. **Zero signature change, zero change across the four sources.** *Both prior analyses
> over-charged for this.* And **cost is not a blocker**: paired A/B/A/B, 8 pawns, 200 k ticks,
> **7.91 s → 7.96 s**; a forced worst case is ~2 % and **not separated from noise**. ⚠️ *The query
> still wants a memo — **for correctness of the defer, not for speed.***
>
> ### 8. SIZING, REPLACED BY MEASUREMENT
>
> `sim/` diff **6 files / 120 non-comment lines**. Veto **~1 day** · bands **3–5 days** · **push gate
> 2–3 days, and this is where the design risk lives** · pre-emption **~1 day**.
> **Ceremony ≈ mechanism, and it is paid ONCE if they ship together.** ⇒ §2 and §5 now state where
> that is already true in this document's structure and where it is not.

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
> pin chain and its two rollback tags · the merge order · §12's corrections · §13's standing rules.
> ⛔ **SUPERSEDED BY REVISION 2 (above), which is newer and was MEASURED:** the band-loop-only shape
> and the strictly-higher-band rule are **struck**. *Both survived independent review and both were
> wrong — which is the case for building the thing before chartering four packages around it.*

---

## 0. Provenance — what in here was verified, and how

> ### ⏳ LANE STATUS AS OF REVISION 2
> **`lane/wreck-visible` (M1-A)** and **`lane/first-screen` (M1-B)** are in flight.
> ✅ **`lane/spike-dispatch` (M2-0) HAS LANDED** — `scratchpad/SPIKE-M2-0-findings.md`. It refuted the
> adopted seam; §5 is re-chartered against it. The branch is destroyed, as chartered.

### 0.1 ⛔ A FOUND DEFECT, LIVE ON `main` TODAY, AND THE GRID EXPOSES IT ON DAY ONE

> **With Repair disabled the pawn enters a 30-tick `Craft` recruit→abandon thrash, forever —
> 33 % of all crew-ticks.** Measured by the M2-0 spike; **Leg A's own baseline trace proves it exists
> on unmodified `main`**, where `MaintenanceSystem` can only take the pawn at t=201 *because
> `CraftingSystem` had already abandoned it.*

⚠️ **It is invisible today for exactly one reason: the maintenance monopoly absorbs the pawn — which
is precisely what a work-priority grid stops doing.** ⇒ **The grid does not cause it; the grid
*reveals* it, on day one, as "my crew member vibrates in place and never works."**

⇒ **Chartered as M1-H and scheduled BEFORE M2-1.** Filing it without a package is what this document
exists to prevent. *(This is the sixth defect found by driving the sim rather than reading it, in a
quarter that has not started.)*

> ### ⚠️⚠️ THE `33 %` FIGURE IS PROVISIONAL AND IS UNDER CHALLENGE — FLAGGED, NOT EDITED *(revision 3, 2026-07-29)*
>
> **`lane/craft-thrash` (M1-H) reports it could not reproduce *"33 % of all crew-ticks in a loop that
> never ends."*** Its best reproduction is **3.575 % of a sim-day, burning out after ~1.2 sim-hours**,
> and **the M2-0 spike's committed harness contains no `Craft` instrumentation**, so the 33 % is **not
> reproducible from committed code.** ⚠️ *That review was still running when this was written; treat
> the challenge itself as provisional too.*
>
> ⛔ **DELIBERATELY NOT EDITED, per the house rule that a retraction is stated in place and loudly.**
> Both numbers are quoted here so a reader sees the disagreement rather than the survivor.
> **Every citation of `33 %` in this document, so no reader meets it unflagged:**
> §0.1 (here, the canonical statement) · the **REVISION 2** block's item 5 · **M1-H**'s player sentence
> and its second acceptance note · **M2-0**'s "return on one throwaway branch" table · **§11** row 1 ·
> **§12.14**'s closing clause.
>
> ⭐ **WHAT DEPENDS ON IT, AND WHAT DOES NOT — this is the part that matters for scheduling.**
> **Nothing structural depends on the magnitude.** M1-H's *seam* is a structural fact
> (`grep -n "RetryTicks\|_retryAt\|backoff"` returns **nothing** in either push recruiter, while every
> `IJobSource` has stamped one since W0-4 — §12.14), and it stands at 33 %, at 3.575 %, or at 0 %.
> What the magnitude decides is **urgency and ordering**, and at 3.575 % *"it burns out after ~1.2
> sim-hours"* is a materially different claim from *"forever"*.
> ⇒ **If the challenge stands, M1-H is still correct and is no longer obviously the first thing to
> start** — and it is a **pin-chain head** on which two more rows now sit (M1-b, and M2-a behind it).
> ⚠️ **A pin-chain head justified by a number that did not reproduce is worth re-deciding before the
> chain moves, not after.** *(This document does not re-decide it: the review is still running, and
> M1-H is in flight.)*
> ⚠️ **AND THE SHAPE IS THE REPO'S OWN:** *"a measurement carries its units and its baseline, or it is
> not a measurement"* — written in **REVISION 2 §6**, about a different number, in this same file.

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
| **M1-a** | `lane/craft-thrash` | **M1-H** | **P1 P2 P3 — expected; measure.** | ⭐ **NEW IN REVISION 2.** The `Craft` recruit→abandon thrash is a real behaviour change on any ship with a bench and an unsatisfiable bill. **P4/P5 hold** — the backoff reuses `JobWork.UnreachableRetryTicks`, a literal already on the determinism path. ⛔ **Do not add a def field.** | — |
| **M1-b** | `lane/craft-staging` | **M1-I** | **P1 P2 P3 — expected; measure.** | ⭐ **NEW IN REVISION 3.** `CraftingSystem.TryFindStagingTile` (`CraftingSystem.cs:487-498`) tests walkability only where every other worker-staging site in the sim also asks `WorksiteSafety.CanStageWorkerAt`. Adding it changes which pawns are claimed on any ship with a bench, which is every pinned ship. **P4/P5 hold — no def field; the predicate already exists.** ⚠️ **If `lane/craft-thrash` (M1-a) has not yet passed review when you read this, FOLD THIS IN and delete this row** — it is the same file, the same function family and the same measured trace, and folding saves an entire re-pin. | — |
| **M1-c** | `lane/build-haul-backoff` | **M2-21** | **P1 P2 P3 — expected; measure.** | ⭐ **NEW IN REVISION 3.** A build order behind a shut door is held as `HaulToBuild` for **3 000 ticks with 2 999 abandons and ZERO backoff stamps** — *the original 480 000-tick livelock*, measured by M1-D's review. A stamp on a dispatch path changes claim timing on any ship with an unreachable build site. **P4/P5 hold** — reuses `JobWork.UnreachableRetryTicks`. ⚠️ **Executes at merge position 7b (after M1-D, whose `IsBackedOff` mirror it consumes) even though its id is in the M2 range** — it must be measured while the fixtures still do work, i.e. **before M2-e**. | — |
| **M2-a** | `lane/work-state` | M2-1 | **P1 P2 P3** | New hashed `Citizen` state ⇒ CITZ chapter bump ⇒ `Simulation.StateHash` fold changes on every ship. ⭐ **REVISION 3: this is now true for TWO reasons, not one** — the chapter bump *and* the default value itself, which is hashed. Default-OFF and default-3 are different pins. **P4/P5 expected to HOLD** — see the note below. | ⭐ **tag `pin/m2-a`** on `main`, with all five values recorded in the tag's own commit |
| **M2-e** | `lane/work-veto` | **M2-2** | ⭐ **P1 AND P3 EXPECTED TO MOVE. P2 MAY HOLD — measure, do not predict.** | ⭐ **NEW IN REVISION 3, and it is a DIRECT CONSEQUENCE OF OD-H.** Revision 2 chartered M2-2 pin-neutral because *"at the all-default grid the veto never fires"*. **Under OD-H the all-default grid is every work type OFF, so the veto fires on every pawn on every ship from tick 0.** P2 may hold because `AuthoredShips.Perilune()`'s two crew are `HoldPosition = true` and take no work today — ⚠️ **that is the deck-confined-wander shape exactly, where two pins held against expectation. MEASURE.** | ⭐ **tag `pin/m2-e`** — the first *behaviour* row of M2, and the one that can turn every measurement fixture inert. Record all five values in the tag's own commit |
| ~~**M2-b**~~ | ~~`lane/preempt`~~ | ~~M2-8~~ | ⛔ **REMOVED FROM THE CHAIN IN REVISION 2.** | M2-0 measured pre-emption at **0 lines in `sim/`** and three host lines; at shipped defaults nothing pre-empts. It is **pin-neutral, proven by check (A)**, and holding a serialization slot for it was costing the chain a step for nothing. ⚠️ *It is still integrator work — it is off the CHAIN, not off the integrator's desk.* | — |
| **M2-c** | `lane/power-network` | M2-11 | **UNKNOWN — and the answer depends on a decision inside the package.** Wreck-only authoring ⇒ pin-neutral (the wreck is not pinned). A change to `PowerSystem`'s claim rule ⇒ **P2 P3** (and P1 only if the scenario ship has a network — it is single-deck, so a 6-way vs 4-way claim is likely identical). | §0.2: `AuthoredShips.cs:1441-1443` believes deck 1 is off-network; measured, 0 of 626 devices are. | — |
| **M2-d** | `lane/power-wear` | M2-12 | **P2 P3.** P1 unknown — measure. P4/P5 expected to hold (no def field; `EffectiveRate` already exists). | `EffectiveRate` on the generation term alters the power balance on `perilune` and `slice`. | ⭐ **tag `pin/m2-d`** — **the designated rollback point for the whole power package.** If the resulting curve is wrong, return to a measured tree; do not tune forward from an unmeasured one. |
| **M3-a** | `lane/cryo-system` | M3-2 | **P1 P2 P3** | Registering a system folds its SYSS chapter and checksum seed unconditionally. W0-6 measured exactly this on four *empty* systems. | — |
| **M3-b** | `lane/skill-consumers` | M3-7 | **P1 P2 P3**, and **P4 P5** if the work-rate multiplier lands as a def field | Work rates change on every ship. | — |
| **M3-c** | `lane/rest` | M3-9 | **P1 P2 P3 P4 P5** | Fatigue recovery is a behaviour change *and* needs def scalars. It also removes a flat −25 mood, which feeds `ShipMetrics.Morale` → `DirectorSystem.cs:82` → `_wearPressure` → `MachineWearSystem`. **Machine wear rates change on every ship.** | — |
| **M3-d** | `lane/heater` | M3-10 | **P4 P5**, plus **P1 P2 P3** if any pinned ship gets one | A new `machines.def` row. | — |

> ⭐ **M2-1 SHOULD NOT ADD A DEF FIELD, and that is a design instruction, not an observation.** The
> default priority (⛔ **OFF under OD-H — revision 2 said 3 and that is VOID**) and the work-type count
> (6) belong as **literals**, on the deck-confined-wander
> precedent: *"it is a rule, not a tunable, and it therefore adds no hashed state and moves neither
> defs checksum."* A def field would put P4/P5 on the chain's head for nothing. ⚠️ And note the
> repo's own warning: **a def field pinned only by the checksum is NOT pinned** — `swarf_service_condition`
> moved with zero behavioural tests seeing it.
> ⚠️ ⭐ **AND THE ARGUMENT SURVIVES THE REVERSAL WHILE ONE OF ITS PREMISES DIES.** *"No def field"* was
> right for its own reason (a rule, not a tunable) and stays right. But revision 2 also reasoned that
> default-3 *"keeps shipped dispatch behaviour the closest thing to today's"* — **that premise is now
> void, and it was never a reason for the literal-vs-def choice in the first place.** Two claims sat in
> one paragraph and only one of them was load-bearing; separating them is the *"code right,
> justification false"* discipline (§13.11) applied to this document's own prose.

> ⭐ **THE CHAIN'S LETTERS ARE HISTORICAL, NOT ORDINAL.** Execution order is
> **M1-a → M1-b → M2-a → M2-e → M2-c → M2-d → M3-a…**. `M2-b` is struck (revision 2) and is **not
> reused** — published ids are stable, which is the same rule that keeps the `M2-13…M2-16` gap open
> (§11). Read the table top to bottom, not alphabetically.

> ⚠️ **THE ROLLBACK TAGS ARE NOT OPTIONAL.** ⭐ **A chain of eight re-pins is now a chain of ELEVEN**
> — counted from the table above, not computed: `M1-a · M1-b · M1-c · M2-a · M2-e · M2-c · M2-d ·
> M3-a · M3-b · M3-c · M3-d`. It has no natural place to stand
> back up, because every later pin is measured against the earlier ones. A tag costs one command;
> discovering you needed one costs a re-derivation of every pin after it.
> ⇒ ⭐ **REVISION 3 ADDS A THIRD TAG, `pin/m2-e`**, and the reason is specific rather than defensive:
> **M2-e is the row that can turn every measurement fixture inert.** If the resulting game is wrong,
> the honest move is to return to a measured tree, and there are now **three pin movers between
> `pin/m2-a` and `pin/m2-d`** where revision 2 had one.

---

## 3. THE MERGE ORDER

Numbered, and this is the order the integrator merges `--no-ff` into `main` and re-gates. Rows in
**bold** are pin-chain rows and run alone.

| # | lane | package | notes |
|---|---|---|---|
| 1 | `lane/wreck-visible` | **M1-A** | ⏳ IN FLIGHT. Merge first — everything in M1/M2 that touches the wreck's visible machines assumes it. |
| 2 | `lane/first-screen` | **M1-B** | ⏳ IN FLIGHT. Merge second so M1-C can rebase onto its `controls.js` / `overview-view.js` edits. |
| 3 | `lane/craft-thrash` | **M1-H** | ⛔ **PIN M1-a. Runs alone.** ⭐ NEW IN REVISION 2 — a live `main` defect the grid exposes on day one. **Must precede 8.** |
| **3b** | `lane/craft-staging` | **M1-I** | ⛔ **PIN M1-b. Runs alone.** ⭐ NEW IN REVISION 3 — the tick-0 claim on an unreachable bench. **Same file as 3; strictly serialized behind it, and FOLD INTO 3 if 3 has not yet passed review.** |
| 4 | `lane/blocked-reach` | **M1-D** | Can start tonight; merges here. ⚠️ **Integrator lane** (`WireFormat` + `IJobSource`). ⭐ **Semantically coupled to 1 — re-run its tests AND its browser acceptance after 1 merges.** |
| 4 | `lane/undesignate` | **M1-C** | Rebase onto 2 before review. |
| 5 | `lane/morale-bar` | **M1-F** | |
| 6 | `lane/refusal-reasons` | **M1-E** | After 3 — same functions in `GameSession.cs`. ⭐ Also coupled to 1 (fog gate); re-run after 1. |
| 7 | `lane/premise-fix` | **M1-G** | Docs; integrator lane (`CLAUDE.md` lives on the main checkout). |
| **7b** | `lane/build-haul-backoff` | **M2-21** | ⛔ **PIN M1-c. Runs alone.** ⭐ NEW IN REVISION 3 — the silent BUILD haul, *the original 480 000-tick livelock*. **After 4** (it consumes M1-D's mirrored `IsBackedOff`) and ⛔ **before 11**, because from 11 onward no fixture does any work without an authored grid. ⚠️ Id is M2-range, position is M1-window — see its charter. |
| — | `lane/spike-dispatch` | **M2-0** | ⚠️ **NEVER MERGES.** Throwaway branch, week 1, in parallel with M1. Its deliverable is three measured legs. |
| **8** | **`lane/work-state`** | **M2-1** | **PIN M2-a.** Runs alone. → tag `pin/m2-a`. |
| 9 | `lane/work-wire` | **M2-4** | ⭐ **MOVED UP IN REVISION 3 (was 10).** Spine (`Commands`, `CmdKind`, `WireFormat`). **BLOCKING.** |
| 10 | `lane/work-tab` | **M2-3** | ⭐ **MOVED UP IN REVISION 3 (was 11).** Needs 9. **BLOCKING — see the ruling below.** |
| **11** | **`lane/work-veto`** | **M2-2** | ⛔ ⭐ **PIN M2-e. RUNS ALONE — NEW IN REVISION 3 (was position 9, pin-neutral).** → tag `pin/m2-e`. ⚠️ **Integrator lane** — it edits `TryAssign`. |
| 12 | `lane/awaiting-orders` | **M2-20** | ⭐ **NEW IN REVISION 3 — OD-G's package.** Needs 10 and 11. ⚠️ **The day 11 merges, a pawn with nothing enabled stands still and no surface says why.** Merge this within the same integration window or the game reads as broken. |
| 13 | `lane/work-blocked` | **M2-18** | ⭐ **PROMOTED IN REVISION 3 (was 13, after M2-5).** Needs 11 and M1-D's channel work; **no longer needs M2-5.** Under OD-H its refusal is the DEFAULT experience, not an edge case. |
| 14 | `lane/band-loop` | **M2-5** | Needs 11. Same file as 11 (`JobSystem.cs`) — strictly serialized. |
| 15 | `lane/why-line` | **M2-6** | Needs 11/14 for the reason to be true, and **12 for its vocabulary**. |
| ~~—~~ | ~~`lane/preempt-policy`~~ | ~~**M2-7**~~ | ⛔ **RETRACTED IN REVISION 2** — the engine already answers it. |
| 16 | `lane/preempt` | **M2-8** | Integrator, **pin-neutral**. ⚠️ Not demonstrable until 17. |
| 17 | `lane/sticky-claim` | **M2-19** | ⭐ NEW IN REVISION 2. Integrator; pin-neutral **only if 8 landed its storage**. |
| 18 | `lane/prioritise-cmd` | **M2-9** | Spine. Needs 16 **and** 17. |
| 19 | `lane/prioritise-ui` | **M2-10** | Needs 18. |
| **20** | **`lane/power-network`** | **M2-11** | **PIN M2-c.** Runs alone. |
| **21** | **`lane/power-wear`** | **M2-12** | **PIN M2-d.** Runs alone. → tag `pin/m2-d`. **Order 20-before-21 is a ruling, not a preference.** |
| 22 | `lane/rebaseline` | **M2-17** | INFRASTRUCTURE. After 21 — measuring before the power term lands measures a tree nobody will play. ⭐ **REVISION 3 gives it harness scope**: under OD-H an unattended fixture run does **no work at all**, so every occupancy leg must author a grid before it means anything. |
| 23+ | M3 lanes | see §6 | Order within M3 is outlined, not fixed. |

> ### ⭐ THE RE-ORDER IS A RULING, AND IT GENERALISES *(new in revision 3)*
>
> **THE CONTROL SURFACE FOR AN OPT-IN SYSTEM LANDS BEFORE THE GATE THAT MAKES IT OPT-IN.**
> Revision 2 merged the veto (M2-2) at 9 and the grid that operates it (M2-4/M2-3) at 10–11.
> **Under OD-H that ordering leaves `main` in a state where no crew member can do any work and no
> surface can enable any** — for the duration of two lanes. That is not a theoretical hazard: the
> integrator gates on `main` after every merge, and a human opening the game between 9 and 11 would
> find a correctly-implemented milestone that looks exactly like a total regression.
>
> ⇒ **M2-4 and M2-3 are no longer "the UI half"; they are BLOCKING dependencies of M2-2.** A grid that
> nothing reads (9–10, before the veto) is **inert and harmless** — the E0-5 shape. A veto with no
> grid is **an unplayable game**. The asymmetry decides the order.
>
> ⚠️ **AND THE INTEGRATOR SHOULD TREAT 11 + 12 + 13 AS ONE WINDOW.** They are separate lanes with
> separate reviews — the merge order is not the review order — but `main` should not sit overnight
> between them.

⚠️ **A GATE, not a lane, sits between 21 and 22:** the **M3 owner decision batch** (§3.5 of the plan).
Seven items, one message, three-day default-to-recommendation. `Device.Name`'s double duty must be
answered **before `CryoSystem` freezes a save chapter**, not after.

⚠️ **A HARD HUMAN GATE sits at the end of week 9**, after M3: a real 60-minute owner playtest. It is on
the calendar because a plan with all its human gates in the last week has none.

---

## 4. M1 — SEE IT, AND KNOW WHY *(weeks 1–2)*

> *"I can see every wrecked machine on my ship, I can open the vent that starts the air, and when I
> paint an order that cannot happen the game tells me why — and lets me take it back."*

**Running tally: PLAYER 8 / INFRASTRUCTURE 1 / cap 1.** *(⭐ **9 packages after revision 3 added
M1-I**; was 8 after revision 2 added M1-H. cap = ⌊9/5⌋ = 1. **M1 is STILL AT CAP** — M1-I is `PLAYER`
and carries a real sentence, so it consumes no infrastructure budget.
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

**SEAM — AND THERE ARE ~~FIVE~~ SIX DRAW SITES ACROSS THREE FILES, NOT ONE.** *(Revision 0 named only
the CREW WATCH bar. Revision 2 named five. ⚠️ **CORRECTED BY THE IMPLEMENTER, 2026-07-29: there are
SIX** — the console READOUT's `.ro-morale` line was missed by the "all five verified this session"
claim, and the line numbers in rows 1–3 were already stale because M1-B had landed on `overview-view.js`
in between. **Both are the house shape "a package's code can be right and its justification false"
(§13.11), here in the charter itself.** Row 5 is split below into 5a/5b/5c; the SCOPE decision is
unchanged — all three are `hud.js` and all three stay.)*

| # | site | `file:line` **(re-derived on the merged tree, 2026-07-29)** | in scope? |
|---|---|---|---|
| 1 | CREW WATCH bar markup | `client/src/ui/overview-view.js:688` (`ov-morale` / `ov-morale-fill`) — *charter said `:675`* | ✅ **remove** |
| 2 | its element cache | `client/src/ui/overview-view.js:695` — *charter said `:682`* | ✅ **remove** |
| 3 | its per-frame fill + colour | `client/src/ui/overview-view.js:712-715` (`moraleColor(mv)`) — *charter said `:699-702`* | ✅ **remove** |
| 4 | the dossier MORALE meter | `client/src/ui/panels.js:313-315` | ✅ **remove** |
| 5a | the console CREW WATCH row's morale track/fill | `client/src/ui/hud.js:958,960,988,991` | ⛔ **OUT OF SCOPE — stated, not missed** |
| 5b | the console CREW table's `'tc-morale'` | `client/src/ui/hud.js:1015`, painted at `:1047-1049` | ⛔ **OUT OF SCOPE — stated, not missed** |
| 5c | ⚠️ **the console READOUT's `.ro-morale` line — NOT IN THE CHARTER'S TABLE AT ALL** | `client/src/ui/hud.js:1188` | ⛔ **OUT OF SCOPE — same reason** |

⚠️ **AND ONE THING THE TABLE IS RIGHT TO EXCLUDE BUT THE PROSE BELOW WAS NOT: `hud.js:175`'s doc
ledger.** It called morale REAL *"so the DOSSIER card can show the REAL morale/current-task"* — and
`enrichCitizen` is reached from the **standard** surface (`overview-view.js`'s `ovBio` →
`hud.js:167-172` → `panels().citizen(...)`), so that sentence describes the same card `panels.js:219`
describes. **The `hud.js` exclusion covers DRAW SITES and the equality-pinned census; it does not
cover ledgers**, and the census reads `codeOnly(raw)` so a comment cannot move it. Corrected in the
package. Also note `hud.js:34`'s `['morale','Morale']` is `ShipMetricsSnapshot.Morale` — the real,
computed ship metric — and is **not** a citizen-field site.

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
| 4 | ⭐ **PAIRED POSITIVE CONTROL: set ~~`Citizen.Hunger = 0.8f`~~ a REAL roster field on the same fixture and render** | ⭐ **SOMETHING MUST CHANGE.** Leg 3 alone is a **bare negative**, satisfied by a renderer that has stopped drawing *anything* — a broken fixture, a crashed builder, a stubbed `render()` all pass it. **Run 3 and 4 on the same fixture in the same test file and require 4 to fire.** Without 4, leg 3 is the "guard satisfied by its own subject commented out" shape wearing a rendering costume |

⚠️ **LEG 4's NAMED FIELD WAS UNUSABLE, MEASURED (implementer, 2026-07-29): `Citizen.Hunger` REACHES
NO CLIENT SURFACE.** `BuildRoster` (`hosts/web/GameSession.cs`) emits cid/name/role/mood/task/
portrait/morale/deck/x/y/traits and **no need at all**; the `citizen` message carries
role/mood/traits/portrait/log; `grep -ri "hunger\|thirst\|fatigue" client/src/` returns **nothing**.
Substituted with **`task`** (the host's `TaskLabel(c)`) and **`mood`** (`mind.ActiveEmotion(tick)`),
which are the CREW WATCH's and the dossier's own real fields. **The leg's INTENT is unchanged and is
what matters** — prove the instrument is live with a field that *is* still drawn.
⚠️ Legs 3+4 were then run in **four** forms, and the extra two are the load-bearing ones: morale
driven into an **existing** element's style (no new element ⇒ the census is structurally blind), and
the painter **stubbed to draw nothing** (⇒ the morale half goes GREEN and only the positive control
fires). That last pair is the evidence for this row existing at all.
| 5 | Revert `panels.js:219`'s ledger correction | the ledger-vs-drawing consistency test |

⚠️ **Legs 3+4 together are the point.** A guard that only asserts *"no element with class
`ov-morale`"* is satisfied by a bar renamed. Assert on **rendered output under a changed input**, and
prove the instrument is live with a field that *is* still drawn.

**ACCEPTANCE (browser, < 5 min).** `./play.sh` → the CREW WATCH row for Rell shows her name, her task,
~~and her real needs~~ — **and no morale bar anywhere.** Open the dossier: **no MORALE meter**, and
~~the needs that *are* drawn still move when the sim moves~~ the surface keeps repainting from live
sim state.

⚠️ **THE STRUCK CLAUSES WERE NOT SATISFIABLE AS WRITTEN (implementer, 2026-07-29).** The CREW WATCH
row draws name / role / task and **no need**; the dossier's Health/Food/Water/Rest meters are
◇ SAMPLE — deterministically seeded per cid, so they never move — and they *say so*, wearing a
`◇ SAMPLE` badge under a card-level legend. **That is a DISCLOSED placeholder, which is not the same
defect as an undisclosed constant wearing a gauge**, so it is not a second instance of this bug; it is
worth filing for the owner separately as *"the dossier's needs are fabricated"*. Verified instead:
`.ov-morale` = 0, `.ov-morale-fill` = 0, CSS rules matching `.ov-morale` = 0, no `MORALE` anywhere in
the dossier, meter labels exactly `[Health, Food, Water, Rest, Affinity, Trust]`, every remaining
morale-classed node inside the `display:none` `.app` shell — and the clock advancing
`DAY 0 · 00:10 → 00:12` over 75 s with the surface repainting.

**CONFLICTS.** `overview-view.js` — **rebase onto `lane/first-screen` (M1-B)**; serialize against
M1-C and M2-3. Also `panels.js` — **serialize against M4-3/M4-4**, which rewrite the same card.

**SIZE: S.**

---

### M1-H — the `Craft` recruit→abandon thrash *(NEW IN REVISION 2)*

**CLASS: PLAYER** · **LANE: `lane/craft-thrash`** · **SIZE: M** · ⚠️ **INTEGRATOR LANE**
⛔ **MUST LAND BEFORE M2-1**

> **TODAY THE PLAYER IS MISLED ABOUT** what their crew member is doing: measured by the M2-0 spike,
> a pawn spends **33 % of all crew-ticks** in a **30-tick `Craft` recruit→abandon loop that never
> ends** — claimed, released, re-claimed, forever, with the task line flickering and no work done.
> **AFTER THIS** an impossible bill backs off instead of re-offering itself every second.

> ### ⚠️ WHY IT IS URGENT RATHER THAN OLD
> It is **live on `main` today** — Leg A's unmodified baseline trace proves it, because
> `MaintenanceSystem` can only take the pawn at t=201 *once `CraftingSystem` has abandoned it*. It is
> invisible **for exactly one reason: the maintenance monopoly absorbs the pawn**, and shipping a
> work-priority grid is *precisely* the thing that stops that happening. ⇒ **M2 does not cause this
> bug; M2 uncovers it, on day one, as "my one crew member vibrates in place and never works."**
> Fixing it after M2 means the first bug report of the milestone is unfalsifiable — the same argument
> that puts M1 before M2 at all.

**SEAM — and the root cause is a one-line structural asymmetry, verified this session.**
`CraftingSystem` recruits **outside the dispatcher** (`FindNearestIdle` at `:164`, `JobKind.Craft`
set at `:167`) and has **TEN `Abandon` call sites** (`:130`, `:185`, `:220`, `:233`, `:259`, `:279`,
`:285`, `:307`, `:324`, `:330`), several of whose own comments say *"retries next second"* /
*"the standing bill retries next second"*. `Abandon` (`:616-620`) clears `JobKind` and
`JobWorkTicks` — **and nothing else.**

> ⭐ **`grep -n "RetryTicks\|_retryAt\|backoff" sim/Sim.Core/Systems/CraftingSystem.cs` RETURNS
> NOTHING. Same for `MachineWearSystem.cs`.**
> Every `IJobSource` stamps `JobWork.UnreachableRetryTicks = 50` on a refused candidate
> (`DigJobSource.cs:107`, `DeconstructJobSource.cs:147`, `BuildJobSource.cs:210`/`:223`,
> `HaulJobSource.cs:311`/`:543`) — the dispatcher's own doc comment calls a source that refuses without
> stamping *"a SILENT HANG"* and **throws** naming the offender (`JobSystem.cs:259-272`).
> ⇒ **The two push recruiters are held to none of that**, because they never pass through the
> dispatcher. `CraftingSystem` re-offers the same impossible bill at **1 Hz** (`IntervalTicks => 10`)
> forever. **The fix is to give the push recruiters the backoff the pull sources have had since W0-4**,
> not to special-case a symptom.

**PIN IMPACT: ⛔ P1, P2, P3 EXPECTED TO MOVE — MEASURE.** This is a real behaviour change on any ship
with a bench and a reachable-but-unsatisfiable bill. **P4/P5 hold** if the backoff reuses
`JobWork.UnreachableRetryTicks` (a literal already on the determinism path) — ⛔ **do not add a def
field for it.** ⚠️ **It therefore JOINS THE PIN CHAIN as a new head row `M1-a`, ahead of `M2-a`.**
See §2.

**SPINE? Borderline; treat as integrator** (a sim system's claim protocol).

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Delete the backoff stamp | ⭐ **the driven thrash leg: one pawn, Repair disabled, an unsatisfiable bill, 30 000 ticks — assert `Craft` claim COUNT is bounded** (single digits), not that the pawn is idle. ⚠️ *A test asserting "the pawn is idle" passes on the thrash, because the pawn IS idle on 29 of every 30 ticks* |
| 2 | Stamp on only ONE of the ten `Abandon` sites | ⭐ **the site-coverage legs.** ⚠️ **Each of the ten reachable sites needs its own blinded leg, or nine can be missing with the suite green** — this is M2-2's four-site shape with ten sites. *(Sites unreachable on any authored ship are declared as such **in the package's record**, with the reason, rather than silently skipped.)* |
| 3 | Stamp but never expire | the recovery leg: make the bill satisfiable and require work to start within `UnreachableRetryTicks + 1` |
| 4 | Apply the backoff to a **satisfiable** bill | the no-regression leg: normal crafting throughput must be unchanged |
| 5 | Add a def field for the interval | the P4/P5 pin — this package must not move them |

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → select Rell → watch the **task line**.
2. Today: it flickers between a craft task and `Idle` on a ~3-second cycle, indefinitely.
3. After: it settles — either she crafts, or she does something else and **stays** doing it.
4. Open MOSS → the FABRICATION row's fault log stops churning.

⚠️ **A SECOND, HONEST ACCEPTANCE, because step 2 is subtle at 1× speed:** run
`hosts/scenario -- --dump --days 1 --metrics` before and after and compare the **Craft job-start
count**. The spike's own instrument is the right one; a 33 % crew-tick share is not something a human
reliably sees, and saying so is better than pretending the browser check is sufficient.

**CONFLICTS.** `sim/Sim.Core/Systems/CraftingSystem.cs` — **serialize against M2-2 and M2-5**, which
edit the same recruiter. Also `MachineWearSystem.cs` if the fix generalises to both push recruiters
(**recommended**).

**SIZE: M** — ten call sites, ten blinded legs, and a pin move.

---

### M1-I — the tick-0 claim on a bench she can never reach *(NEW IN REVISION 3)*

**CLASS: PLAYER** · **LANE: `lane/craft-staging`** · **SIZE: S** · ⚠️ **INTEGRATOR LANE**
⛔ **PIN CHAIN M1-b — RUNS ALONE, IMMEDIATELY BEHIND M1-H**

> **TODAY THE PLAYER IS MISLED ABOUT** the very first thing their only crew member does. On
> `--ship wreck` at **tick 0**, `CraftingSystem` claims her for `machineshop_1` — **a bench in a
> sealed, airless hall she can never reach, for a bill needing 2 Parts against the ship's 1.**
> *(Driven, reported by the tick-0 investigation, 2026-07-29.)* **AFTER THIS** the crafting recruiter
> is held to the same staging rule as every other worker-staging site in the sim, and the claim does
> not happen.

> ### ⭐ THE CAUSE IS ONE MISSING LINE, AND THE SIM ALREADY KNOWS IT IS MISSING
>
> | site | asks `sim.IsWalkable`? | asks `WorksiteSafety.CanStageWorkerAt`? |
> |---|---|---|
> | `JobWork.TryPathToAdjacent` (`sim/Sim.Core/Jobs/JobContext.cs:73-80`) | yes | ✅ **yes** (`:80`) |
> | `MaintenanceSystem.TryFindStagingTile` (`MachineWearSystem.cs:567-579`) | yes | ✅ **yes** (`:573`) |
> | *(and `MachineWearSystem.cs:541`)* | — | ✅ yes |
> | **`CraftingSystem.TryFindStagingTile` (`CraftingSystem.cs:487-498`)** | yes (`:492`) | ⛔ **NO** |
>
> **Line 573 is the entire difference.** ⚠️ **And the repo has already written down that this file is
> the exception without noticing it is a bug:** `JobContext.cs:64` says the rule *"is asked here and
> NOWHERE ELSE in the job board"*, and `MachineWearSystem.cs:553-554` calls itself *"the second and
> last"* place applying it. **Both statements are true and both are about the JOB BOARD** —
> `CraftingSystem` recruits **outside** it, which is the same structural asymmetry §12.14 names and
> M1-H fixes the other half of. ⇒ **One gap, three consequences** (§12.14), and this is the third.

**SEAM.** `sim/Sim.Core/Systems/CraftingSystem.cs:487-498` — add
`if (!WorksiteSafety.CanStageWorkerAt(sim, n)) continue;` after the walkability test at `:492`,
matching `MachineWearSystem.cs:573` **verbatim in shape and order**. `WorksiteSafety` is declared at
`sim/Sim.Core/Systems/SafetySystem.cs:104`, the predicate at `:125-128`.

> ### ⚠️ WHY IT IS ITS OWN PACKAGE, AND WHEN IT SHOULD NOT BE
>
> **It belongs inside M1-H and the only thing stopping that is timing.** Same file, same recruiter,
> same measured trace — and the two interact: M1-H gives the recruiter a backoff so it stops
> re-offering an impossible bill, while this stops it *offering the bill at all* for an unstageable
> bench. **Shipping M1-H alone leaves a pawn that politely backs off from a bench she could never have
> used** — expensive-and-visible becoming cheap-and-invisible, this repo's named failure class
> (`MECHANICS.md` §13.17). ⇒ **RULING: if `lane/craft-thrash` has not yet passed independent review
> when this is read, FOLD THIS IN and delete both this package and chain row M1-b — the saving is one
> entire re-pin.** It is chartered separately only because `lane/craft-thrash` was in flight and under
> review on 2026-07-29, and **adding scope to a lane under review is how send-backs multiply.**
>
> ⛔ **AND IT MUST NOT RIDE INSIDE M2-2.** M2-2 is already an integrator lane at five sites carrying
> its own pin move; a second, unrelated `sim/` behaviour change inside it would make M2-2's measured
> pin move unattributable — which is the one thing §3.2's whole batching rule exists to prevent.

**⭐ WHY IT IS NOT MADE MOOT BY OD-H, and this is the reason it stays in the quarter at all.**
With every work type off at boot (OD-H), `CraftingSystem`'s recruiter is vetoed and the tick-0 claim
**disappears from the wreck's opening** — ⚠️ **masked, not fixed.** It returns in full the moment the
player switches `Craft` on, which is a gesture M2 exists to give them. **A defect that OD-H hides is
a defect M2 hands back to the player**, and it would arrive attributed to the grid.

**PIN IMPACT: ⛔ P1, P2, P3 EXPECTED TO MOVE — MEASURE, DO NOT PREDICT.** Any ship with a bench whose
canonical-order first walkable neighbour is unbreathable changes which pawn is claimed and when.
**P4/P5 HOLD** — no def field; the predicate and its thresholds already exist and are already hashed.
⚠️ **A held P1/P2/P3 is a legitimate outcome and is NOT evidence the fix is inert** — it means no
pinned ship happens to have an unbreathable staging tile in the first four-neighbour slot. **If they
hold, say so and prove non-vacuity with a driven fixture instead** (see mutation 1).

**SPINE? Borderline; treat as integrator** (a sim system's claim protocol, and a pin-chain row).

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Delete the `CanStageWorkerAt` line | ⭐ **THE HEADLINE LEG, and it must be DRIVEN on a purpose-built fixture, never on a pinned ship.** A bench whose only walkable neighbour is unbreathable; require that no pawn is ever claimed for it across ≥ 5 000 ticks. ⚠️ **Non-vacuity by INCLUSION (§13.4): the same fixture with the tile made breathable must produce a claim** — otherwise "never claimed" is satisfied by a bench nobody wanted |
| 2 | Apply the check **before** `IsWalkable` instead of after | the order leg — ⚠️ **`CanStageWorkerAt` on a non-walkable tile is a question the shipped code never asks, and a reviewer must not assume it is total.** Mirror `MachineWearSystem.cs:572-573`'s order exactly |
| 3 | Return the **first** neighbour unconditionally (ignore both tests) | the canonical-order leg: staging must still pick `Neighbor4` order (+x, −x, +y, −y) among *eligible* tiles, not merely *some* eligible tile |
| 4 | Make `CanStageWorkerAt` always return `true` | ⚠️ **the shared-predicate leg** — assert that `CraftingSystem` calls **the sim's own predicate**, by recording the call at the seam (§13.6), **not** by scanning for the name. Re-deriving the rule locally is how two answers drift apart |
| 5 | Add a def field to soften the rule for crafting | the P4/P5 pin — this package must not move them, and *"crafting is different"* is exactly the softening `WorksiteSafety` was written to refuse |

⚠️ **DO NOT "FIX" THIS BY MAKING THE BILL SATISFIABLE OR BY MOVING THE BENCH.** The wreck's
`machineshop_1` bill needing 2 Parts against 1 aboard is authoring, and the sealed hall is the
premise. **The defect is that the recruiter does not ask.**

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → select Rell at tick 0, **before touching anything.**
2. Today: her task line names a craft task at `machineshop_1` — a bench in a hall she cannot enter.
3. After: at tick 0 she is **not** claimed for it, and stays whatever the ladder below crafting makes
   her *(eat ▸ maintain, per `AuthoredShips.cs:1514-1521`; ⇒ after M2-2, **nothing at all** — which is
   OD-G, and M2-20 is what makes it read as deliberate)*.

**CONFLICTS.** `sim/Sim.Core/Systems/CraftingSystem.cs` — ⛔ **strictly serialized behind M1-H**, and
against M2-2, M2-5, M2-19 (four other claimants on one recruiter; see §10).

**SIZE: S — one line of implementation, and the package is its fixture and its pin.** Say both.

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

> # ⛔ REVISION 3 — OD-G AND OD-H, AND WHAT THEY VOID *(2026-07-29)*
>
> **Two owner decisions, taken after revision 2 was published, reverse a default this document
> chartered and add an opening beat it had no row for. Everything below in §5 is read through this
> block; where revision 2 and revision 3 disagree, revision 3 is newer and binding.**
>
> > **OD-G — THE OPENING IS AN ORDER, THEN AUTONOMY RESUMES.** The pawn boots **idle and waiting**.
> > The first thing that happens in the game is the player giving an order. After that first order
> > completes, normal autonomy resumes under a visible work grid.
> > *(Rejected: "she waits until told, always" — furthest from RimWorld and unworkable at 8 crew.
> > Rejected: "she works from tick 0 but legibly" — does not remove the movie feeling on the opening
> > beat.)*
> >
> > **OD-H — THE WORK GRID DEFAULTS OFF. WORK IS OPT-IN.** A pawn does a work type only once the
> > player enables it. ⚠️ **The owner accepted the consequences explicitly: a pin move and a
> > re-baseline.**
>
> ### ⛔ 1. CLAIMS PUBLISHED IN REVISIONS 0–2 THAT ARE NOW VOID
>
> | # | the published claim | status |
> |---|---|---|
> | V1 | M2-1: *"**Default every work type to 3 for every pawn**, so shipped dispatch behaviour is the closest thing to today's and the grid is opt-in"* | ⛔ **REVERSED BY OD-H.** The default is **OFF**. |
> | V2 | M2-2 PIN IMPACT: *"**PIN-NEUTRAL, EXPECTED — and this one is genuinely provable.** At the all-default grid (every work type at 3, nothing off) the veto never fires, so every pinned ship is byte-identical."* | ⛔ **VOID — INVERTED.** Under OD-H the all-default grid is every work type **off**, so the veto fires on **every pawn on every ship from tick 0**. M2-2 **joins the pin chain** as row **M2-e**. |
> | V3 | M2-5: *"At all-default priorities the arbitration reproduces `main` byte-identically, **which keeps this package OFF the pin chain**"* — the entire justification for the v1 work-list order `Mine · Haul · Construct · Deconstruct · Craft · Repair` | ⛔ **THE JUSTIFICATION IS VOID; THE CONCLUSION SURVIVES FOR A DIFFERENT REASON.** At the new defaults **nothing is enabled, so there is nothing to arbitrate** — *every* work-list order is pin-neutral at defaults. ⇒ **The pin-neutrality argument no longer selects an order, and the compromise it forced is no longer paid for.** Owner batch item 7 re-opened. |
> | V4 | M2-8 PIN IMPACT: *"At shipped defaults **no band outranks another** (M2-5's authored work-list order reproduces `main`)… so nothing pre-empts on a pinned ship"* | ⚠️ **REASONING ROTTED, CONCLUSION STANDS.** The true reason is now simpler and stronger: **at defaults nothing is enabled, so nothing is claimed, so nothing can be pre-empted.** Corrected in place. |
> | V5 | M2-6 mutation 1: *"Emit the reason clause unconditionally, **including at all-default priorities**"* | ⛔ **THE STATE IT NAMES NO LONGER EXISTS.** Re-chartered, not retired — see M2-6. |
> | V6 | M2-3 ACCEPTANCE step 2: *"every cell reads **3**"*; step 5: *"Set **Craft** to *off*"* | ⛔ **VOID.** Every cell reads **off**; the demo now runs the *enabling* direction, which is also what makes it the milestone's first honest demo. |
> | V7 | M2-9 mutation 2: *"Prioritise a machine the pawn's work grid has **off**"* framed as an edge case | ⚠️ **It is now the DEFAULT case**, and OD-G narrows the option space — see M2-9 and owner batch item 5. |
> | V8 | M2-18: *"an order that stalls because the only crew member who could take it has that work type switched off"* framed as *"the refusal M2 itself creates"*, SIZE S, merge position 13 | ⚠️ **PROMOTED.** Under OD-H this is not a refusal M2 creates at the margin; it is **the default experience of every order painted before the work type is enabled.** |
> | V9 | §3 merge order: veto (M2-2) at 9, wire (M2-4) at 10, tab (M2-3) at 11 | ⛔ **RE-ORDERED.** M2-4 → 9, M2-3 → 10, M2-2 → 11. Between the old 9 and 11 `main` would have had **no work and no way to enable any**. See the ruling in §3. |
>
> ### ⭐ 2. WHY THE REVERSAL WAS NEEDED — the failure mode is this document's own
>
> Default-3 was chosen *"so shipped dispatch behaviour is the closest thing to today's"* — that is, to
> keep a pin from moving. **A COST ARGUMENT DECIDED A DESIGN QUESTION.** Plan §3.1 names exactly this
> shape (*"'it is the biggest lane' is a COST argument being used as an ORDER argument, and that is the
> documented failure mode"*) and the priority audit that produced this roadmap was commissioned
> because agents had *"chosen the METRIC, and the metric chose the work."* ⇒ **The same mistake, one
> layer down, inside the document written to correct it.**
> ⚠️ **And it was not a small cost.** Default-3 **foreclosed OD-G by construction**: a pawn with every
> work type enabled cannot boot idle and waiting, so the opening beat the owner wanted was
> unreachable from the chartered default *no matter what else M2 built*. **A default is a design
> decision wearing an implementation detail's clothes.**
>
> ### ✅ 3. WHAT OD-G COSTS TO BUILD — the answer is "almost nothing, and then one real package"
>
> **The mechanism falls out of OD-H for free, and that is measured, not hoped.** With every work type
> off, the pawn is refused at all five gated entry sites (M2-2), so:
> - the **dispatcher** never assigns her — the four `IJobSource` boards are empty at boot anyway
>   (`AuthoredShips.cs:1514-1521`, pinned by `WreckShipTests.cs:780-799`), and *"a quiet board falls
>   through to eat ▸ craft ▸ maintain"*;
> - **`CraftingSystem`** does not claim her at tick 0 (the claim at `CraftingSystem.cs:167`);
> - **`MaintenanceSystem`** does not take her at ~tick 201 (the claim at `MachineWearSystem.cs:251`).
>
> ⛔ **THAT IS WHY M2-2 MUST COVER THE TWO PUSH RECRUITERS OR OD-G IS NOT DELIVERED.** They are the
> only two sites that put work on a pawn with zero player input *and* bypass the dispatcher entirely —
> *(driven, reported by the tick-0 investigation, 2026-07-29: sim-hour 1 is **100 % busy**, ~1.5
> sim-hours continuous, 9 services, and **every Parts and Seal aboard spent by end of day 1**)*. A veto
> that ships in `TryAssign` only leaves OD-G exactly as undelivered as revision 2's defer-only band
> loop left OD-A. **It is the same half-done shipment, one package earlier.**
>
> **What is NOT free is that a waiting pawn is indistinguishable from a broken one.** Nothing on any
> surface says *"she is waiting for you"* — and the live design position at
> `client/src/ui/overview-view.js:701-708` deliberately **refuses** to say it:
> > *"writing something like `AWAITING ORDERS` would imply the ship is waiting on the player, when an
> > idle crew member may simply have nothing reachable to do."*
>
> ⭐ **Under OD-G the ship IS waiting on the player, so that comment is now a correct rule applied to a
> world that no longer exists.** It is not deleted casually: the distinction it protects — *deliberately
> unassigned* vs *nothing reachable to do* — becomes **more** important under OD-H, not less, because
> both states are now common. ⇒ **M2-20, chartered below.**
>
> ### ⚠️ 4. THE THREE CONSEQUENCES THAT ARE NOT IN ANY PACKAGE'S BODY
>
> 1. ⛔ **THE MEASUREMENT FIXTURES GO INERT.** `--ship slice` and `--ship grid` exist to be driven
>    unattended by `hosts/scenario`. With every work type off, **an unattended run does no work at
>    all**, and every occupancy/A1/A2/A3 leg measures a ship where nobody works. **This is not a
>    regression to hunt; it is the harness needing to author a grid.** ⇒ scope added to **M2-17**, and
>    it is an **owner batch item** (new item 8) because the alternative — fixtures that default *on*
>    while the game defaults *off* — is two rules for one field, and this repo has been bitten by a
>    hand-maintained divergence four times.
> 2. ⚠️ **A WORK TYPE SWITCHED OFF MID-JOB IS AN UNANSWERED QUESTION, AND IT IS THE DEFAULT GESTURE.**
>    Under OD-H the player will toggle constantly. `HaulJobSource.cs:365` sets
>    `JobKind.HaulDeliver` **inside `Progress`, not inside a claim** — so a pawn who picked up under
>    Haul-enabled transitions to delivering it through **no gate at all**. ⇒ **RULING (integrator, in
>    M2-2): the veto is a CLAIM-TIME gate; a running job completes.** Anything else drops cargo on the
>    floor as a side effect of a settings change. **Pre-emption (M2-8) is the deliberate way to
>    interrupt, and it is a different verb.**
> 3. ✅ **AN UNASSIGNED PAWN IS STILL ALIVE ON SCREEN — CHECKED, AND THE ANSWER IS YES.** Idle wander
>    (`CitizenSystem.cs:70-79`) sets a path and **never** a `JobKind`, so it is untouched by the veto
>    and is what an unassigned pawn *does*; **the wreck's boot pawn is authored `AutoWander = true`**
>    (`AuthoredShips.cs:1936-1941`, *"so the ship is not a still photograph while the pawn is idle"*).
>    **A pawn who is waiting AND frozen would read as a hung game, and she is not frozen.** ⚠️ *This
>    was written as an open measurement in this revision's first draft and closed by reading the file
>    — recorded that way because a charter that asks for a measurement someone could have taken by
>    opening one file is a charter wasting a lane's day.*
>
> ### ✅ 5. WHAT SURVIVES REVISION 3 UNCHANGED
>
> The five-entry-site shape and both halves of M2-5 · pre-emption's inverted risk row (M2-8) · the
> sticky claim (M2-19) and its storage batching into M2-1 · the whole power package (M2-11, M2-12) and
> its ruling on order · M2-0's measurements · every mutation table not named in §1 above.
> ⚠️ **M2-5's *equal-band tie-break by work-list position* survives; only the choice of the v1 ORDER is
> re-opened.**

**Running tally: PLAYER 15 / INFRASTRUCTURE 2 / cap 3.** *(⭐ **17 packages after revision 3 added
M2-20 and M2-21**; 15 after revision 2 retracted M2-7 and added M2-19. Cap = ⌊17/5⌋ = 3, so M2 keeps
**1 slot of headroom**. **M1-I** is chartered into **M1**, not M2, because it is a live `main` defect
on the same file and the same pin as M1-H; **M2-21** carries an M2 id on M2's budget but **executes in
the M1 window** — see its charter for why those two facts diverge.)*
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
>    mutation 9.)
> 4. ⭐ **REPLACED IN REVISION 2 — the STICKY CLAIM's RELEASE RULE (M2-19).** *(The old item, the
>    pre-emption policy, is **withdrawn**: M2-0 measured all three hard cases and the engine already
>    answers them — see the retracted M2-7.)* **When does a direct order stop holding the pawn?**
>    *Recommend: on completion, on a new order, on death, or on genuine inability — and **not** on a
>    timeout, which makes the hold a race the player cannot see.* ⛔ **A hold never outranks
>    `SafetySystem`.**
> 5. **Does an explicit *Prioritise* order override the work grid?** *Recommend: yes (RimWorld's
>    answer) — but never physics.* (M2-9 mutation 2.)
>    ⭐ **REVISION 3 NARROWS THIS ITEM AND STRENGTHENS THE RECOMMENDATION.** Under OD-H the grid starts
>    **all off**, so *"the machine's work type is off"* is not an edge case — **it is the state of every
>    machine on the ship at boot.** If the answer is *no*, then the player's very first right-click —
>    the gesture OD-G says opens the game — is **refused**, and the only opening move left is a trip to
>    the WORK tab. ⚠️ **The blast radius has changed even though the question has not**, and that is
>    exactly the kind of drift a batch item goes stale through. *Recommendation unchanged in direction,
>    now load-bearing: **yes**.*
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
> 7. ⭐ **THE WORK-LIST ORDER — RE-OPENED IN REVISION 3, BECAUSE THE CONSTRAINT THAT FORCED THE
>    COMPROMISE IS GONE.** *(Revision 2 recommended `Mine · Haul · Construct · Deconstruct · Craft ·
>    Repair` **because it exactly reproduces shipped precedence and therefore kept M2-5 off the pin
>    chain** — while saying in the same breath that `Haul` second is a poor default and that RimWorld
>    puts hauling near the bottom.)*
>    ⛔ **Under OD-H that argument buys nothing: at the new defaults nothing is enabled, so there is
>    nothing to arbitrate and EVERY order is pin-neutral at defaults.** The compromise was being paid
>    for with a saving that no longer exists.
>    ⇒ ***Recommend: author the PLAY order now, in v1.*** A RimWorld-shaped candidate, offered as a
>    starting point and not as a decision: **`Repair · Construct · Craft · Deconstruct · Mine · Haul`**.
>    ⚠️ **The implementer must still MEASURE the pin consequence** — "pin-neutral at defaults" is a
>    statement about the default grid, and M2-2 has already moved P1/P3 by then, so M2-5's neutrality
>    is measured **against the new baseline, not against `main`**. ⚠️ **And `JobDispatchTests`' pinned
>    assignment sequence is no longer a reliable tripwire for this** — under OD-H it is exercising a
>    fixture whose crew must be explicitly granted work types before the sequence means anything.
> 8. ⭐ **NEW IN REVISION 3 — DO THE MEASUREMENT FIXTURES DEFAULT OFF TOO?** OD-H is about the player's
>    crew; `--ship slice`, `--ship grid` and `hosts/scenario`'s hand-built ship are **instruments**.
>    With the rule applied uniformly, an unattended fixture run does **no work at all** and every
>    occupancy leg in the repo measures a ship where nobody works.
>    **(a) ONE RULE, OFF EVERYWHERE** — `Citizen`'s default is off, no exceptions, and **M2-17 teaches
>    the occupancy harness to author a grid per leg.** **(b) FIXTURES AUTHORED ALL-ON** —
>    `AuthoredShips` grants slice/grid/perilune crew every work type at a middle band, so the fixtures
>    keep behaving and only the wreck changes.
>    ***Recommend (a).*** (b) is cheaper today and is **two rules for one field**, which is the
>    hand-maintained divergence this repo has been bitten by four times (`MachineDefs.Table`, the two
>    `NON_FURNITURE` sets, the two `ROLE_TO_ITEM` tables, the id→painter join). ⚠️ **State the cost of
>    (a) honestly: the P1 scenario run stops exercising the job system**, so a determinism pin keeps
>    its determinism and loses coverage. **That cost is real and is not hidden by choosing (a) — it is
>    paid by M2-17's harness change.**
> 9. ⭐ **NEW IN REVISION 3 — DOES A NEWLY THAWED CREW MEMBER ALSO BOOT WITH EVERY WORK TYPE OFF?**
>    OD-G is stated about *the* pawn and the *opening*; M3 wakes a second, third and fourth.
>    **(a) UNIFORM** — every pawn is opt-in, so each thaw is followed by an assignment gesture.
>    **(b) INHERIT** — a new thaw copies the grid of an existing crew member (RimWorld's "manage work"
>    convenience). **(c) NEW THAWS BOOT ALL-ON** — only the opening pawn is special.
>    ***Recommend (a)***, and say why: it is OD-H taken literally, it makes *"who do I wake"* a decision
>    with an immediate consequence (OD-5's own requirement), and **(c) is a second rule again**. ⚠️ **It
>    must be answered before M3-2 freezes the `CryoSystem` save chapter**, alongside the `Device.Name`
>    item already queued there.
> 10. ⭐ **NEW IN REVISION 3 — WHAT COUNTS AS "THE FIRST ORDER"?** OD-G says the game opens with the
>    player giving one. **(a) ANY player command that results in the pawn taking a job** — including
>    enabling a work type in the WORK tab, which OD-H makes the primary gesture. **(b) ONLY a targeted
>    order** — a painted designation, or *Prioritise* on a machine.
>    ***Recommend (a)***: under OD-H the grid *is* the order surface, and a definition that excludes it
>    would make the game's own opening unteachable. ⚠️ **This is the definition M2-20's teaching surface
>    and its acceptance both key off, so it cannot be left implicit.**
> 11. ⭐ **NEW IN REVISION 3 — THE VOCABULARY FOR A PAWN WHO IS DELIBERATELY UNASSIGNED**, and it
>    **contradicts a deliberate, documented design position** (`overview-view.js:701-708`: *"writing
>    something like `AWAITING ORDERS` would imply the ship is waiting on the player"*). Under OD-G the
>    ship **is** waiting on the player. ⛔ **But the distinction that comment protects survives and gets
>    sharper:** *no work type enabled* and *nothing reachable to do* are different facts and must not
>    share a word. ***Recommend: two words, not one*** — one for **unassigned** (the player has enabled
>    nothing she can do) and one for **idle** (she is enabled and has nothing to do), with the existing
>    dim-grey/amber legibility rule kept exactly as it is. **Chartered as M2-20**; the exact strings are
>    reversible and are the owner's to overrule.

---

### ✅ M2-0 — THE R1 SPIKE — **LANDED, AND IT REFUTED THE SEAM**

**CLASS: INFRASTRUCTURE** · **LANE: `lane/spike-dispatch`** *(destroyed, as chartered)* · **SIZE: S**
· **STATUS: ✅ COMPLETE — `scratchpad/SPIKE-M2-0-findings.md`**

**What it answered.** Plan §8 item 1: *whether M2's dispatch rewrite is three days or three weeks.*
The answer is **neither** — it is a **different mechanism** from the one three documents had adopted.

> ### ⭐ THE RETURN ON ONE THROWAWAY BRANCH, ITEMISED — because this is the argument for ever building a spike again
>
> | it found | what it changed |
> |---|---|
> | **The adopted seam is a measured no-op for OD-A's own case** | M2-5 re-chartered: two halves, five entry sites |
> | **Equal band is deprioritisation, not a tie-break** | M2-5's equal-band rule DECIDED (work-list position), with a **pin-neutral v1 order** that would otherwise have been found by moving a pin |
> | **Pre-emption is 0 lines in `sim/`, and all three "hard cases" are already safe** | **M2-7 deleted**, M2-8 **L → S** and **off the pin chain** |
> | **A hold, not a cancel, is the unbuilt part** | **M2-19 created** — and its bool batched into M2-1's chapter bump **for free**, which is only possible because the spike ran *before* the chain started |
> | **An over-reporting defer query stalls a band silently for 40 000 ticks** | M2-5 gained a required multi-pawn leg for a class a one-pawn fixture cannot see |
> | **A 30-tick `Craft` thrash burning 33 % of crew-ticks, live on `main`** | **M1-H created**, ahead of the whole chain |
> | **`Select`'s signature genuinely need not change; cost is ~0** | a ruling promoted from argued to measured |
> | **`54 650` was an absolute tick, not a wait** | a number three documents had reasoned from, corrected |
>
> ⇒ **One day of throwaway code deleted a package, moved another off the pin chain, created two new
> ones, and corrected a figure the entire milestone was sized against.** ⭐ **Charter the spike before
> the chain, not after** — every one of those savings depended on nothing having been re-pinned yet.

**THE THREE LEGS AS RUN.** Leg A (baseline control, mandatory) · Leg B (the inverting criterion) ·
Leg C (pre-emption). ⚠️ **Leg A is what made the rest interpretable**, and it is what proved the
`Craft` thrash pre-dates every change: *"Maintenance can only take the pawn at t=201 because Crafting
had already abandoned it."*

> ⛔ **AND THE SPIKE'S OWN FALSE-PASS TRAP FIRED EXACTLY AS PREDICTED — in the other direction.**
> This charter warned that *"does Repair@1 beat a painted strip order"* passes on the shipped sim with
> nothing built. **It is worse than that: it was satisfiable BOTH ways, purely by paint timing** —
> painted at t=0 the order wins at **tick 1** on unmodified `main`; painted at t=2000 it waits
> **52 652**. ⇒ **A criterion that a baseline satisfies in one configuration and fails in another is
> not a criterion; it is a coin.** Leg A is the only thing that could have shown that, and it did.

**PIN IMPACT: N/A — the branch is destroyed.** ⚠️ **Its measurements are behaviour of a throwaway
tree, not of `main`** — except Leg A's, which are `main`'s and are cited as such.

**MUTATIONS: none.** It was a measurement; its trap was the false pass, handled by Leg A.

---

### M2-1 — per-citizen work-type priorities *(the state)*

**CLASS: PLAYER** · **LANE: `lane/work-state`** · **SIZE: L** · ⛔ **PIN CHAIN M2-a — RUNS ALONE**

> **TODAY THE PLAYER CANNOT** say which of their crew does which kind of work. `Citizen` has no
> skill, no work-type mask, no priority and no work-rate multiplier — verified across the full field
> list at `sim/Sim.Core/Entities/Citizen.cs:7-124`; the only per-citizen work gate in the entire type
> is the boolean `IsRecruitableForWork` at `:103`. **AFTER THIS** the state exists to say it, and the
> next four packages give it a filter, a wire, a table and a reason line.

**SEAM.**
- `sim/Sim.Core/Entities/Citizen.cs` — add the priority bytes, **the reserved skill byte, and the reserved sticky-claim bool**.
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
- **Priorities 1–4 plus off**, 1 highest.
  ⛔ ⭐ **DEFAULT: EVERY WORK TYPE *OFF*, FOR EVERY PAWN — OD-H, BINDING, AND IT REVERSES THIS
  DOCUMENT'S PUBLISHED CHARTER.** *(Revision 2 said: "Default every work type to 3 for every pawn, so
  shipped dispatch behaviour is the closest thing to today's and the grid is opt-in." **That sentence
  is void.** It chose a default to avoid a pin move — a cost argument deciding a design question — and
  it foreclosed OD-G by construction. See §5's REVISION 3 block.)*
  ⚠️ **THE PIN CONSEQUENCE OF THE DEFAULT VALUE ITSELF IS THIS PACKAGE'S, NOT M2-2's.** The priority
  bytes are hashed state, so *"all off"* and *"all 3"* are **different hashes on every ship** even
  though neither is read by anything yet. **The behaviour consequence is M2-2's** (chain row M2-e).
  Two packages, two separately attributable moves — which is the whole point of §3.2.
  ⚠️ **The fixture question — do `--ship slice` / `--ship grid` / the scenario ship get an authored
  grid instead of the OFF default — is OWNER BATCH ITEM 8 and it lands HERE if the answer is (b).**
  If it does, this package also claims `sim/Sim.Gen/AuthoredShips.cs` (see §10) and its pin move
  changes shape. **Do not start this lane before item 8 is answered or has defaulted to its
  recommendation.**
- ⭐ **Land TWO more fields' STORAGE in this same commit, zeroed and with no consumer** — the **skill
  byte** (M3-7's) and, ⭐ **NEW IN REVISION 2, the STICKY-CLAIM bool** (`HeldByOrder`, M2-19's). The
  chapter is bumping anyway; W0-1b folded **thirteen** saved-but-unhashed fields in one pin move.
  This costs M2-1 nothing and saves **two** entire re-pins. Plan §3.1 — *the one place batching is
  correct.*
  ⚠️ **IT IS DECIDED HERE OR IT IS NOT DECIDED.** If M2-1 ships without the sticky-claim bool, M2-19
  needs its own chapter bump and its own chain slot — and by then it is unavoidable. **The spike found
  the need for that bool AFTER revision 1 froze this package's field list; catching it now is the
  entire value of having run the spike before starting the chain.**
- ⛔ **NO DEF FIELD.** Six work types and the default (⭐ **now OFF**) are **literals**, on the
  deck-confined-wander precedent. This is what keeps **P4 and P5 off the head of the pin chain**, and
  it is true independently of *which* default is chosen — ⚠️ **the "no def field" ruling and the
  "default 3" ruling were published in one paragraph and only the first was load-bearing.** OD-H kills
  the second and leaves the first standing.
- **`HoldPosition` stays** as the all-or-nothing escape hatch; the grid does not replace it. *(Whether
  it survives long-term is an M2 owner-batch item.)*

**PIN IMPACT: P1, P2, P3 MOVE. P4, P5 EXPECTED TO HOLD — measure, do not predict.**
⭐ **REVISION 3: unchanged in kind, and now true for two independent reasons.** (i) New hashed
`Citizen` state ⇒ CITZ chapter bump ⇒ the fold changes on every ship — this was always true. (ii) The
**default VALUE is itself hashed**, so OD-H's reversal moves these three pins even if the chapter
layout were unchanged. ⚠️ **Do not present (ii) as a new cost of OD-H — it is the same three pins,
moving once.** OD-H's *additional* cost is M2-2's move (chain row M2-e), which is a **behaviour**
change and is separately attributable. The re-pin commit carries
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
| 5b | Drop the **sticky-claim bool** from the writer / reader / fold | ⭐ **three more blinded legs, NEW IN REVISION 2.** Same reserved-field trap as row 3: a bool that is always `false` is indistinguishable from a bool that is never written |
| 6 | ⭐ Change the default from **off** to any of 1–4 | the defaults test **and** the newly re-pinned P1/P2/P3. ⚠️ **Assert the default by NAME (`off`), not by its encoded value** — *"0"* and *"off"* are the same byte and different claims, and a later packing change that shifts the encoding must redden this. ⛔ *(Revision 2's row said "from 3 to 2". Void — OD-H.)* |
| 6b | ⭐ **NEW IN REVISION 3.** Default **one** work type on (e.g. `Haul`) and the rest off | ⚠️ **the OD-G leg, and it must be DRIVEN on `--ship wreck` from tick 0.** With everything off the pawn must take **no job of any kind** for ≥ 5 000 ticks; with one type on she must take that kind. **A test that only asserts "all off ⇒ idle" is satisfied by a package that never grants any work at all** — the non-vacuity half is mandatory (§13.4). *(This leg cannot bite until M2-2 lands the veto; ⇒ **it is chartered here and IMPLEMENTED in M2-2**, and M2-2's reviewer must check it arrived. Stated so it is "deferred by name" and not "missed".)* |
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

### M2-2 — the work-type veto: **ELEVEN CLAIM SITES · FIVE GATES · THREE EXCLUSIONS** *(re-derived in revision 3)*

**CLASS: PLAYER** · **LANE: `lane/work-veto`** · **SIZE: M → L** · ⚠️ **INTEGRATOR LANE**
⛔ ⭐ **PIN CHAIN M2-e — RUNS ALONE.** *(Revision 2 chartered this pin-neutral at merge position 9.
**Both are void under OD-H** — see the PIN IMPACT section.)*

> **TODAY THE PLAYER CANNOT** stop a crew member from taking a kind of work. **AFTER THIS** a work
> type set to *off* is refused at **every** place the sim can put a job on a pawn — and because OD-H
> makes *off* the default, **this is the package that delivers OD-G's opening beat.**

> ### ⛔ THE COUNT WAS WRONG, AND IT WAS WRONG IN THE DIRECTION THAT SHIPS HALF-DONE
>
> Revision 2 called this *"the FOUR-SITE veto"*. **Re-derived from the code in revision 3 — not taken
> on trust from the row — the census is `11 / 5 / 3`, and the fifth gate was never named in any
> revision.** The working is below; every line was read on `main` @ `ac6a17c`.
>
> ⚠️ **M2-5's SEAM section also says "five entry sites" and means a DIFFERENT five** — it counts
> `JobSystem.cs:118` (`BeginTick`'s fan-out) as an arbitration site, which is correct for *arbitration*
> and wrong for a *veto*: `BeginTick` fans out to boards, it does not commit a pawn. **Two packages,
> two different fives, one of them previously written as four.** ⇒ **The tables below are the
> authority for M2-2; do not reconcile them by picking a number.**

**⭐ THE WORKING — every site in `sim/` that writes a non-`None` `JobKind` or commits a pawn.**

| # | `file:line` | what it does | gate |
|---|---|---|---|
| A1 | `sim/Sim.Core/Jobs/JobSystem.cs:140` | `if (citizen.IsRecruitableForWork) TryAssign(...)` — the only door into auto-work for the four `IJobSource`s | **G1** |
| A2 | `sim/Sim.Core/Jobs/JobSystem.cs:219-273` | `TryAssign` — the argmin (`:237`), its guard (`:243`), then `TryClaim` (`:257`). Assigns nothing itself | **G1** |
| A3 | `Jobs/Sources/DigJobSource.cs:99` | `JobKind.Dig` in `TryClaim` (`:288`) | via G1 |
| A4 | `Jobs/Sources/HaulJobSource.cs:298` | `JobKind.HaulPickup` in `TryClaim` (`:292`) | via G1 |
| A5 | `Jobs/Sources/HaulJobSource.cs:365` | `JobKind.HaulDeliver` — ⚠️ **an IN-JOB TRANSITION inside `Progress`, not a claim** | ⛔ **not a gate — see the ruling below** |
| A6 | `Jobs/Sources/BuildJobSource.cs:202` | `JobKind.Build` in `TryClaim` (`:194`), ready-site branch | via G1 |
| A7 | `Jobs/Sources/BuildJobSource.cs:263` | `JobKind.HaulToBuild` — same `TryClaim`, needs-material branch. **Same work type (`Construct`) as A6** | via G1 |
| A8 | `Jobs/Sources/DeconstructJobSource.cs:139` | `JobKind.Deconstruct` in `TryClaim` (`:133`) | via G1 |
| A9 | `Systems/CraftingSystem.cs:167` | `recruit.JobKind = JobKind.Craft;` — recruit at `:164` via `FindNearestIdle` (`:467`, gate `:475`). **Bypasses the dispatcher entirely** | **G2** |
| A10 | `Systems/MachineWearSystem.cs:251` | `recruit.JobKind = JobKind.Maintain;` in `MaintenanceSystem.RecruitForNeediest` (`:189`, called from `MaintenanceSystem.Tick:160`) — recruit at `:248` via `FindNearestIdle` (`:418`, gate `:426`). **Bypasses the dispatcher entirely** | **G3** |
| A11 | `Systems/CitizenSystem.cs:70-79` | idle wander — sets a **path** and `JobKind` **stays `None`** | ⛔ **never gated — it is what an unassigned pawn DOES (OD-G). See M2-20** |
| B2 | `sim/Sim.Core/Effects/EffectValidator.cs:141` | `citizen.JobKind = JobKind.Dig;` from the LLM `AgreeTask` effect. Its only idleness gate is `:110` `if (citizen.JobKind != JobKind.None) return false;` — **it does not consult `IsRecruitableForWork`, so it ignores `HoldPosition` AND `OrderedMove` today** | **G4** |
| B2′ | `sim/Sim.Core/Effects/CapabilityComputer.cs:70-76` | ⭐ **THE FIFTH GATE, NAMED FOR THE FIRST TIME IN REVISION 3.** The mirror that decides whether the dig is **offered to the model at all**; its own comment reads *"mirrors the EffectValidator gate (wander path doesn't veto)"* | **G5** |

⛔ **G5 IS NOT OPTIONAL, AND OMITTING IT SHIPS A LYING CREW MEMBER.** Gate `EffectValidator` alone and
the model is still *offered* the dig, the crew member still **agrees in dialogue**, and the sim then
silently refuses. That is the exact defect the 2026-07-21 playtest round fixed under the heading
*"crew no longer promise physical work they cannot do"*, re-introduced by the package that gates the
other half. ⚠️ **`CapabilityComputer` and `EffectValidator` are a hand-mirrored pair whose own comment
says they mirror each other — that is the join this repo has been bitten by four times.**
⭐ **RULING (integrator): the LLM effect pipeline is BOUNDED BY the grid and never overrides it.** The
`CitizenEffect` whitelist exists so the model cannot exceed player-granted authority; a work type the
player switched off is the clearest possible statement of that authority. *(This is a ruling, not an
owner item: it follows from the standing `CLAUDE.md` invariant "LLM never touches sim state directly"
and from the binding **LLM-ready, not LLM-powered** memory.)*

> ### ⛔ A5 IS A TRAP: THE VETO IS A CLAIM-TIME GATE, AND A RUNNING JOB COMPLETES
>
> `HaulJobSource.cs:365` sets `JobKind.HaulDeliver` **inside `Progress`**, so a pawn who picked up a
> stack while `Haul` was enabled transitions to delivering it through **no gate at all**. Under OD-H
> the player toggles constantly, so this is not a corner: **it is a gesture they will make while a
> pawn is mid-haul, on day one.**
> ⭐ **RULING (integrator): gate at CLAIM, never mid-job.** A veto applied at A5 would drop cargo on
> the floor as a side effect of a settings change; `Simulation.CancelJob`'s contract is to *"drop
> carried cargo where they stand and release pickup reservations"* (`Simulation.cs:161-164`) and that
> is a **deliberate verb**, not a consequence of a checkbox. **Pre-emption (M2-8) is how a player
> interrupts.** ⚠️ **Pin this with a leg (mutation 8), because "we decided not to gate here" and "we
> forgot this site" are indistinguishable in a diff.**

> ⛔ **AND THREE DOORS ARE EXCLUDED BY NAME — SURVIVAL AND NEEDS ARE NOT WORK.**
> `SustenanceSystem.cs:82` recruits on `IsIdleForWork`, deliberately **not** `IsRecruitableForWork`;
> `Citizen.cs:86-90` states the rule — *"a move order suppresses WORK, never SURVIVAL… An order the
> player gave must not be a way to starve someone."*
> ⚠️ **AND THERE IS A SECOND DOOR, WHICH REVISION 0 MISSED:** `SustenanceSystem.cs:83-84` is
> `else if (citizen.HoldPosition && !citizen.Dead && !citizen.HasPath) TryServeInPlace(sim, citizen);`
> — **a veto placed at `:82` leaves this path completely ungated.** Both must stay open.
> **Eat and Drink are not work types.** The plan of record's M2 Contents item 2 lists
> `SustenanceSystem` among the sites; **that is an error and this package must not follow it.** §12.3.

**SEAM.** One predicate — `bool CanTakeWorkType(Citizen, WorkType)` on `Citizen` — asked at **five**
gates. **G1** asks it inside `TryAssign` via `IJobSource.HandledKinds`
(`sim/Sim.Core/Jobs/IJobSource.cs:44-49`, already read once at registration into `JobSystem._byKind`,
`:91-108`). **G2** and **G3** ask it inside their `FindNearestIdle` loops beside the existing
`IsRecruitableForWork` check (`CraftingSystem.cs:475`, `MachineWearSystem.cs:426`). **G4** asks it in
`EffectValidator`'s guard chain (`:110-122`) before `:141`. **G5** asks it in
`CapabilityComputer.cs:70-76`, so the capability is never offered.

⛔ ⭐ **DO NOT FOLD THE GRID INTO `IsRecruitableForWork`.** It is tempting under OD-H — a pawn with
every type off is never recruitable, so a single `&& HasAnyWorkEnabled` at `Citizen.cs:103` looks like
it closes G1–G3 in one line. **Refuse it.** `IsRecruitableForWork` is a **per-citizen** property
(*"held + player-ordered crew never self-assign"*, `JobSystem.cs:140`) and the veto is a
**per-(citizen, work type)** question; collapsing them makes `Repair@1 / Haul@off` indistinguishable
from `all off`, silently changes `PlayerOrderPrecedenceTests`' subject, and pre-empts M2-19's own use
of the same property. ⚠️ **It has exactly three production callers today**
(`JobSystem.cs:140`, `CraftingSystem.cs:475`, `MachineWearSystem.cs:426`) — *"only three"* is what
makes the shortcut look safe and is not a reason it is correct.

**SPINE? YES — integrator lane.** *(Corrected in revision 1: revision 0 said "No" while editing
`TryAssign`, and then called the same file integrator-lane under M2-5. `JobSystem.cs:26-27` says of
itself: **"the last two exist because this is the only file in the job system the integrator
reviews."** Any package touching `TryAssign` is integrator work. M2-2 and M2-5 are therefore both
integrator lanes and are **strictly serialized** against each other.)*

**PIN IMPACT: ⛔ ⭐ P1 AND P3 EXPECTED TO MOVE. P2 MAY HOLD. P4/P5 HOLD (no def field). MEASURE — DO
NOT PREDICT. ⇒ PIN CHAIN ROW `M2-e`, RUNS ALONE, TAG `pin/m2-e`.**

> ⛔ **REVISION 2's PIN IMPACT IS VOID AND ITS INVERSION IS THE CLEANEST ILLUSTRATION IN THIS
> DOCUMENT OF WHY A DEFAULT IS A DESIGN DECISION.** It read: *"PIN-NEUTRAL, EXPECTED — and this one is
> genuinely provable. At the all-default grid (every work type at 3, nothing off) the veto never
> fires, so every pinned ship is byte-identical… **If a pin moves here, the default is wrong, not the
> pin.**"* **The reasoning was valid and its premise has been reversed by the owner.** Under OD-H the
> all-default grid is every work type **off**, so the veto fires on **every pawn on every ship from
> tick 0** — the package goes from provably neutral to a behaviour change on every ship, on the same
> code, by a one-value change made two packages upstream.
> ⚠️ ⭐ **AND THE OLD SENTENCE NOW READS BACKWARDS: *"if a pin moves here, the default is wrong"* would
> today instruct an implementer to undo OD-H.** That is what a rotted justification does when it is
> left in place — it keeps giving orders. *(§13.11.)*

**Expected, per ship, and every row is a prediction to be MEASURED and not quoted:**

| pin | ship | expectation | why |
|---|---|---|---|
| **P1** | `hosts/scenario`'s hand-built `BuildScenario` | **moves** | its 2 crew come from `sim.AddCitizen`, which sets no flags — `HoldPosition = false`, so they take work today and will stop |
| **P2** | `--ship perilune` | ⭐ **MAY HOLD** | `AuthoredShips.Perilune()`'s two crew are `HoldPosition = true` (`AuthoredShips.cs:170-171`), so they take no work today and the veto has nothing to refuse |
| **P3** | `--ship slice` | **moves** | 8 working crew |
| **P4 / P5** | — | **hold** | no def field |

⚠️ **P2 holding is the deck-confined-wander shape exactly** — *"two pins held against expectation, and
they held for two DIFFERENT reasons"*. **A held P2 is not evidence the veto is inert.** Prove
non-vacuity separately, with a driven fixture (mutation 6).
⚠️ **AND IF OWNER BATCH ITEM 8 RESOLVES TO (b)** — fixtures authored all-on — **this table changes
completely and P1/P3 may hold too.** State which world you measured in.

**MUTATIONS — THE TABLE IS THE PACKAGE. ⭐ FIVE POSITIVE LEGS NOW, NOT FOUR.**

| # | mutation | must go red |
|---|---|---|
| 1 | Delete the veto at **`TryAssign` only** (G1) | the dispatcher leg |
| 2 | Delete it at **`MachineWearSystem.cs:426` only** (G3) | the **Repair** leg — a pawn with Repair off must not be recruited for a Maintain service. ⭐ **This is half of OD-G**: it is what stops maintenance taking the boot pawn at ~tick 201 |
| 3 | Delete it at **`CraftingSystem.cs:475` only** (G2) | the **Craft** leg. ⭐ **The other half of OD-G**: it is what stops the tick-0 claim on `machineshop_1` |
| 4 | Delete it at **`EffectValidator.cs:141` only** (G4) | the **LLM-effect** leg — drive an `ApplyCitizenEffectCommand` granting a dig at a pawn with Mine off |
| 4b | ⭐ **NEW IN REVISION 3.** Delete it at **`CapabilityComputer.cs:70-76` only** (G5) | ⭐ **THE OFFER LEG — the gate no revision named.** Compute the capability set for a pawn with Mine off and require the dig **absent from it**. ⚠️ **G4 alone leaves a crew member who AGREES IN DIALOGUE to work the player forbade, and then does nothing** — the 2026-07-21 *"crew no longer promise physical work they cannot do"* defect, re-introduced. **Blind it of leg 4: gating one of a hand-mirrored pair is the failure, and a test that passes with either present cannot see it** |
| 5 | Invert the predicate (`off` means enabled) | **all five** positive legs |
| 6 | ⭐ **NEW IN REVISION 3 — THE OD-G LEG (chartered in M2-1 mutation 6b, implemented here).** Grant the pawn one work type instead of none | ⭐⭐ **THE MILESTONE'S OPENING BEAT, DRIVEN ON `--ship wreck` FROM TICK 0.** Required both ways: **(i)** all off ⇒ `JobKind == None` on **every** tick for ≥ 5 000 ticks, and **(ii)** one type on ⇒ she takes **that** kind. ⚠️ **(i) alone is satisfied by a package that never grants any work at all**; (ii) is its non-vacuity half (§13.4) and is **not optional** |
| 7 | ⭐ **NEW IN REVISION 3.** Gate the veto on `IsRecruitableForWork` instead of per work type | the mixed-grid leg: `Repair@1 / Haul@off` must be **distinguishable from all-off** — she repairs and does not haul. *(The tempting one-line shortcut; see the SEAM.)* |
| 8 | ⭐ **NEW IN REVISION 3.** Add a veto at **`HaulJobSource.cs:365`** (the `HaulDeliver` in-job transition) | ⛔ **must be REFUSED — a negative leg pinning a RULING.** Drive a pawn mid-haul **carrying a stack**, switch `Haul` off, and require the delivery to **complete** with the stack **not** on the floor. ⚠️ **Without this leg, "we ruled not to gate here" and "we missed this site" are indistinguishable in a diff**, and the next lane completing the set will gate it |

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
the five positive legs so a lane adding a sixth veto cannot merge without meeting them.
⭐ **AND UNDER OD-H THEY ARE NO LONGER EXOTIC FIXTURES.** *"All six work types set to off"* was
revision 2's deliberately hostile configuration; **it is now the shipped default**, so N1–N3 describe
the state of **every pawn on every ship at boot**. ⇒ **A regression here starves the boot pawn of
`--ship wreck` in the first sim-hour of a new game.** Raise their severity accordingly.

⚠️ **EACH OF ROWS 1–4b MUST BE RUN WITH THE OTHER FOUR LEGS BLINDED, AND EACH MUST FIRE ALONE.**
`assert` throws, so a multi-leg test reports only its first failure and a dead leg is
indistinguishable from a live one. **A single test covering only `TryAssign` passes with four of
five vetoes missing — that is the half-done shipment, verbatim.**

⚠️ **EVERY LEG MUST BE DRIVEN, NEVER SCANNED.** *"Verb parity is not sufficient"* — for the third time
in this repo. A scan for the predicate's name at five call sites is satisfied by five calls that do
nothing.

**ACCEPTANCE.** ⭐ **NO LONGER BLOCKED — M2-3 AND M2-4 NOW LAND FIRST** (§3's re-order), so this
package has a real browser acceptance for the first time:
1. `./play.sh` → WORK tab → every cell reads **off**; Rell is doing nothing and says so (M2-20).
2. Set **Repair** to **3**. She walks to the neediest machine and services it.
3. Set it back to **off** mid-service → *(per the CLAIM-TIME ruling)* **she finishes the service**,
   then does not take another.
⚠️ **Step 3 is the ruling made visible**, and a reviewer should watch it rather than read it.

**CONFLICTS.** `JobSystem.cs` (**strictly serialized against M2-5**), `MachineWearSystem.cs`,
`CraftingSystem.cs` (**and against M1-H, M1-I** — four claimants on one recruiter, §10),
`EffectValidator.cs`, ⭐ **`CapabilityComputer.cs` (new)**, `Citizen.cs`.

**SIZE: ⭐ M → L**, and revision 3 says what makes it L rather than leaving the letter to argue:
**a fifth gate**, **a pin move with its own rollback tag**, **and the fact that its default is now the
shipped one** — every negative leg that used to describe a hostile configuration now describes boot.
*(Revision 2 said M and counted "four sites and the six-row blinded mutation table". The site count
was wrong and the pin was wrong; the letter followed both.)*

---

### M2-3 — the WORK tab ⛔ **BLOCKING UNDER OD-H**

**CLASS: PLAYER** · **LANE: `lane/work-tab`** · **SIZE: M** · ⛔ ⭐ **BLOCKING — MERGES BEFORE M2-2**

> **TODAY THE PLAYER CANNOT** see or change who does what — there is no surface for it anywhere.
> **AFTER THIS** they open a WORK tab on the Overview, see every pawn against six work types, and set
> each cell off or 1–4.

> ### ⛔ ⭐ REVISION 3 — THIS IS NO LONGER "THE UI HALF". IT IS THE GAME'S PRIMARY CONTROL SURFACE.
>
> Revision 2 scheduled this **after** the veto (positions 11 and 9) and described its acceptance as a
> convenience over a dispatcher that already worked. **Under OD-H nothing works until somebody enables
> it, and this tab is the only place that can be done.** ⇒
> - **It merges at position 10, BEFORE M2-2 at 11.** A grid that nothing reads is inert and harmless;
>   a veto with no grid is **an unplayable game**. (§3's ruling.)
> - ⭐ **It is the milestone's first honest demo, not its fourth.** M2-1's split-sentence rule already
>   names *"the demo is M2-3's"* — that promise was written when M2-3 was optional, and OD-H has made
>   it load-bearing. **A reviewer must not accept M2-2 without this present and working.**
> - ⚠️ **It cannot be "chartered and scheduled" and then slip.** Under revision 2, M2-3 slipping cost
>   legibility. **Under OD-H, M2-3 slipping ships a game in which no crew member can ever do
>   anything.** That is the split-sentence rule's own stated failure (*"if M2-1 lands and M2-3 does
>   not land in M2, the sentence was fabricated after all"*) with a much larger blast radius.

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

**ACCEPTANCE (browser, < 5 min).** ⭐ **REWRITTEN IN REVISION 3 — it now runs the ENABLING direction,
which is both the true default and the only falsifying version.**
1. `./play.sh` → open the **WORK** tab.
2. Rell has a row with six columns; ⭐ **every cell reads `off`** — *(revision 2 said "every cell reads
   **3**". Void — OD-H.)* — and each renders **visibly disabled, not "0"**.
3. ⭐ **She is doing nothing, and the Overview says so** (M2-20's vocabulary, if it has landed;
   before it, this step is the reason M2-20 exists).
4. Click **Repair** to **3**. ⭐ **She goes and repairs something.** *(This step is the whole
   milestone's premise in one gesture, and it is the step the shipped sim cannot produce.)*
5. Reload the page → **the values survive** (they came back over the wire, not from local state).
6. Set **Repair** back to *off* → she finishes what she is doing and takes nothing new.

⚠️ **Steps 4 and 6 need M2-2 to be present to pass, and M2-3 merges FIRST.** That is deliberate and it
is stated rather than papered over: **run steps 1, 2, 3 and 5 at M2-3's own review** (they are the
package's real subject — the grid renders, round-trips and persists), and **re-run the full five-step
sequence as M2-2's acceptance.** ⛔ **Do not weaken the acceptance to what the package can demonstrate
alone; record it as deferred by name, with the package that discharges it.**

**CONFLICTS.** `overview-view.js`, `overview-model.js`, `surface-boundary.test.js`. Serialize against
M1-C, M1-F, ⭐ **M2-20 (new)**.

**SIZE: M** — the two-pawn fixture and the census guards.

---

### M2-4 — the `work` wire channel and `SetWorkPriorityCommand` ⛔ **BLOCKING UNDER OD-H**

**CLASS: PLAYER** · **LANE: `lane/work-wire`** · **SIZE: M** · ⛔ ⭐ **BLOCKING — MERGES BEFORE M2-2**

> **TODAY THE PLAYER CANNOT** send a priority to the sim — there is no verb. **AFTER THIS** the click
> in M2-3 reaches `Citizen`.

> ⭐ **REVISION 3 — MOVED FROM MERGE POSITION 10 TO 9, AND ITS INERTNESS ARGUMENT IS NOW A FEATURE
> RATHER THAN A CONCESSION.** *"A command nobody sends changes nothing"* was written as a
> pin-neutrality proof. Under OD-H it is also the **safety argument for landing this before the
> veto**: the wire and the command can sit on `main` doing nothing at all until M2-2 gives the bytes a
> reader, and that window is exactly what keeps `main` playable across the milestone. **The E0-5 shape
> is doing two jobs here; say both.**

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
> ### ⛔ REVISION 2 — WHAT FOLLOWED FROM THAT WAS BUILT, MEASURED, AND IS A NO-OP FOR THE OWNER'S CASE
>
> Revision 1 concluded: *"ONE TINY NEW INTERFACE — before the argmin at band b, `TryAssign` asks each
> push recruiter whether it has a claimable band-b job, and leaves the pawn idle for it."*
> **M2-0 built exactly that.** Result:
>
> | config | first `Deconstruct` | verdict |
> |---|---:|---|
> | Repair@1 / Decon@4, painted t=0 | 54 652 | ✅ inversion |
> | **Decon@1 / Repair@4, painted mid-chain** | **54 652** | ❌ **byte-identical to baseline** |
>
> **The second row is OD-A's own sentence and it does nothing.** Instrumented:
> **`JobSystem` saw the pawn idle on ZERO of the 54 450 maintenance-chain ticks**, because
> `MaintenanceSystem.Tick` runs `DriveWorkers` **then** `RecruitForNeediest` — it frees and re-claims
> the same pawn **inside one tick** and the dispatcher never gets a look-in.
>
> ⇒ ⭐⭐ **PRIORITY CANNOT LIVE IN THE DISPATCHER. A defer query is a HALF, and it is the half the
> owner does not care about.**

> ### ⭐ THE RE-CHARTERED SHAPE: ONE ARBITRATION POINT, FIVE ENTRY SITES, TWO HALVES — BOTH REQUIRED
>
> Not a smarter `TryAssign`. **One arbitration function**, asked at the same five sites M2-2 vetoes
> at, in which every recruiter can ask every other *"do you have something better for this pawn?"*
>
> **(a) THE DEFER HALF** — `TryAssign` runs the existing argmin **once per band** over only the
> sources at that band, and defers to a push recruiter holding a better band.
> **(b) THE PUSH GATE** — ⭐ **the half revision 1 did not have.** `MaintenanceSystem` and
> `CraftingSystem` must **ask before claiming**, and must **not re-claim** a pawn whose best available
> work sits at a better band. *This is the only half that can reach a pawn already inside a chain,
> because the chain never yields to the dispatcher.*
>
> **Measured, and neither half is sufficient alone:**
>
> | | t=0 inversion | the running-chain case |
> |---|---|---|
> | defer only | ✅ | ❌ **no-op** |
> | push gate only | ❌ **lost** | ✅ 7 232 |
> | **both** | ✅ | ✅ **7 232 — a 7.3× improvement** |
>
> ⚠️ **A REVIEWER MUST REFUSE A PACKAGE THAT SHIPS ONLY (a).** It passes a t=0 demo, it passes a
> plausible test suite, and it delivers nothing the owner asked for. **That is this milestone's
> half-done shipment, and it now has a measured signature.**

> ### ✅ WHAT THE SPIKE MADE CHEAPER — the surviving ruling, now measured rather than argued
>
> **`IJobSource.Select`'s signature does NOT need to change.** Banding by *source participation* — run
> the existing, unmodified argmin once per band over only that band's sources — gets lexicographic
> ordering for free; `bestDist` threading works unchanged inside a band. **Up to 4 passes instead of
> 1. Zero signature change, zero change across the four sources.** *Both prior analyses over-charged
> for this.* **A reviewer must still reject any implementation that changes `Select`'s signature.**
>
> ⛔ **AND STILL NOT A `SystemStack` REORDER.** A reorder inverts a fixed *global* precedence — Repair
> beats Haul for every pawn always — so it cannot express Haul@1/Repair@4 and delivers none of OD-A.

> ### ⭐ EQUAL BAND — DECIDED, WITH ITS RATIONALE. NOT AN OPEN QUESTION.
>
> ⚠️ **The spike found equal band is not a tie-break — it is DEPRIORITISATION.** Repair@2 + Decon@2,
> both claimable at t=0: the order waits out the **entire chain (54 632)**, and the winner is decided
> by an arbitrary *"push before pull"* — while **shipped `main`'s implicit tie-break is the opposite**
> (t=1). Deterministic, and arbitrary. **There is no correct behaviour for free.**
>
> > **DECIDED (integrator, on RimWorld's answer — the owner's stated preferred resolution for an open
> > design question): WITHIN A PRIORITY BAND, TIES BREAK BY THE WORK TYPE'S POSITION IN THE WORK
> > LIST — a fixed, authored, top-to-bottom order the player CAN SEE IN THE GRID.**
>
> **Why this and not the alternatives.** RimWorld does exactly this, and it is *the reason its grid is
> legible*: **the column order IS the tie-break**, so nothing is arbitrary and nothing is hidden. A
> player who wants repair to win a tie moves it left — the same gesture that explains it.
> ⛔ **Do not leave equal band to "push before pull", to `SystemStack` order, or to
> `DefaultSources()` registration order.** All three are invisible to the player and all three are
> accidents of implementation history.
>
> **⇒ AUTHOR THE v1 ORDER EXPLICITLY AND PIN IT.** ⭐ **And there is a v1 order that is free:**
>
> > **`Mine · Haul · Construct · Deconstruct · Craft · Repair`**
>
> This **exactly reproduces shipped precedence** — `JobSystem`'s four pull sources in
> `DefaultSources()` order (`JobSystem.cs:73-80`), then `CraftingSystem` (`SystemStack.cs:35`), then
> `MaintenanceSystem` (`:37`). ⇒ **At all-default priorities the arbitration reproduces `main`
> byte-identically**, which keeps this package OFF the pin chain and makes it *inert without player
> intent* — the E0-5 shape.
> ⚠️ **BUT IT IS A DESIGN COMPROMISE AND MUST BE DECLARED AS ONE:** `Haul` second is a poor default
> (RimWorld puts hauling near the bottom), and this order was chosen for **pin-neutrality**, not for
> play. ⇒ **Added to M2's owner batch as item 7.** Re-ordering the list later is a deliberate,
> visible pin move — which is the honest shape, because the player can see the order change.
>
> ### ⛔ ⭐ REVISION 3 — THE SAVING THAT BOUGHT THAT COMPROMISE NO LONGER EXISTS
>
> **The paragraph above is left standing because its arithmetic is correct and its conclusion is
> now void, and this document shows both rather than the survivor.** Under **OD-H** there is no
> configuration in which *"all-default priorities"* means *"every source participating"*: **the
> default is every work type OFF, so at defaults there is nothing to arbitrate and EVERY work-list
> order is pin-neutral.**
> ⇒ ⛔ **The v1 order was chosen for a pin saving that OD-H has already spent** — M2-2 moves P1/P3 two
> packages earlier — **so `Haul` second is now a poor default bought with nothing.**
> ⇒ **Owner batch item 7 is RE-OPENED with the opposite recommendation: author the PLAY order in v1.**
> ⚠️ **AND THE NEUTRALITY PROOF ITSELF CHANGES BASELINE.** *"Reproduces `main` byte-identically"* is no
> longer the right check, because `main` by then has M2-2's re-pin in it. **The check is: does the
> all-default run stay byte-identical to the tree this package branched from** — which is a different
> sentence, and the one an implementer must actually run.
> ⭐ **What survives untouched: the RULING that within a band ties break by work-list position.** That
> was decided on RimWorld's answer and on legibility (*"the column order IS the tie-break"*), not on
> pins. **Only the choice of the v1 order was ever a pin argument, and only it is re-opened.**

> ### ⚠️ A NEW HAZARD THE SPIKE FOUND: AN OVER-REPORTING DEFER QUERY SILENTLY STALLS THE BAND
>
> With **4 pawns**, the order was **never served in 40 000 ticks** — it took **40 782**. Cause:
> `CraftingSystem`'s defer query **cannot see `AllInputsStaged` / `_buildWantsMaterial`**, which are
> computed later in its own `Tick`, so it **over-reports claimability** and every pawn at or below its
> band waits for work it will never be offered.
>
> ⭐ **THE TRADE-OFF, STATED RATHER THAN SOLVED: a defer query must be as strong as the actual claim,
> and you cannot make it so without doing the path — which is the expensive part.** So the query is
> **optimistic by construction**, and an over-report costs **multi-sim-hour stalls with no error and
> no log — it looks exactly like "the pawn is busy."**
> ⇒ **Required: a driven MULTI-PAWN leg** (≥4 pawns, a station with un-staged inputs, ≥40 000 ticks)
> asserting the low-band order **is** served. ⚠️ **A one-pawn fixture cannot see this class at all**,
> and one-pawn fixtures are the default on the wreck.
> ⇒ **And the memo the spike recommends is for CORRECTNESS OF THE DEFER, NOT FOR SPEED** — say so in
> the code, or the next reader deletes it as a ~1 % perf item (the `HasIceChain` lesson).

**SEAM — five entry sites, and the arbitration is ONE function.**
⚠️ ⭐ **REVISION 3: THIS "FIVE" AND M2-2's "FIVE" ARE DIFFERENT FIVES, AND A LANE THAT CONFLATES THEM
WILL GATE THE WRONG PLACE.** M2-2's five are **claim gates**; this package's five are **arbitration
points**, and the sets differ by two members: this one counts `JobSystem.cs:118` (`BeginTick`'s
fan-out, which commits no pawn) and **does not** count `CapabilityComputer.cs:70-76` (which offers a
capability rather than arbitrating between two). ⛔ **Do not reconcile them by picking a number** —
re-derive against M2-2's `11 / 5 / 3` table before writing either.

`JobSystem.TryAssign` (`sim/Sim.Core/Jobs/JobSystem.cs:220-273`; the argmin at `:237`, its guard at
`:243`) · `JobSystem.cs:118` (`BeginTick` fan-out — the model for the new one) ·
`MaintenanceSystem.RecruitForNeediest` (`sim/Sim.Core/Systems/MachineWearSystem.cs:189`, recruiting at
`:248` via `FindNearestIdle` `:418`) · `CraftingSystem` (`:164` via `FindNearestIdle` `:467`) ·
`EffectValidator.cs:141`.
⚠️ **`JobKind.Maintain` and `JobKind.Craft` have NO `IJobSource`** — `JobSystem.DefaultSources()`
(`:73-80`) registers Dig/Haul/Build/Deconstruct and `_byKind[6]`/`_byKind[7]` are **null**. That is
*why* the push gate cannot be expressed inside the dispatcher, and it is now measured rather than
inferred.
⛔ **Promoting maintenance to a full `IJobSource` remains rejected** — it silently amends
neediest-first to nearest-needy, which OD-A requires be preserved.

**PIN IMPACT: PIN-NEUTRAL — ⭐ AND UNDER OD-H IT IS NEUTRAL FOR A STRONGER REASON THAN THE ONE
REVISION 2 GAVE, WHICH MEANS THE OLD PROOF NO LONGER PROVES IT.**
*(Revision 2: "PIN-NEUTRAL **if** the v1 work-list order above is authored — and it MUST be proven."
**The conditional is void:** at the OD-H default nothing is enabled, so no order participates in any
band and **no work-list order can move a pin at defaults.**)*
⇒ **Prove it with check (A) against the tree this lane branched from — NOT against `main` as it stood
before M2-2's re-pin.** ⚠️ **`JobDispatchTests`' pinned assignment sequence is no longer the tripwire
it was**: under OD-H that fixture's crew must be granted work types explicitly before the sequence
exercises anything, so **a held sequence may mean "the fixture does nothing" rather than "the
arbitration is faithful"**. ⛔ **Confirm the fixture is non-vacuous before quoting it as evidence** —
this is §13.4 applied to a guard the previous revision leaned on.

**SPINE? YES — integrator lane.** `JobSystem.cs`'s own header: *"the only file in the job system the
integrator reviews."*

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | ⭐ **Ship the DEFER half only** (delete the push gate) | ⭐⭐ **THE HEADLINE LEG, and the one this package exists for.** The **running-chain** case: Decon@1 / Repair@4, order painted **mid-chain** at t=2000. Must serve at ~**7 232**, not 54 652. ⚠️ **The t=0 inversion leg PASSES with this mutation applied — that is exactly how the no-op shipped in the spike.** Run it blinded |
| 2 | Ship the PUSH GATE half only (delete the defer) | the **t=0 inversion** leg — Repair@1 / Decon@4 painted at t=0 must NOT be stolen by the low-band order |
| 3 | Collapse the band loop to a single pass | the ranking test: Repair@1/Haul@4 with a haul job **nearer** than the repair |
| 4 | ⭐ Change the authored work-list order (swap `Craft` and `Repair`) | ⭐ **the equal-band leg AND the byte-identity control.** Repair@2 + Decon@2 must resolve by list position. ⚠️ ⭐ **REVISION 3: the control's BASELINE changes** — *"byte-identical to `main`"* is void, because `main` carries M2-2's re-pin by then and its default grid is all-off. **The control is: byte-identical to the tree this lane branched from, with an EXPLICITLY GRANTED grid on the fixture** — an all-default control under OD-H is vacuous, since no order participates at all |
| 5 | Make the arbitration query always return `false` | the seam leg — **driven dispatch outcome, never a scan for the method's signature** (*"verb parity is not sufficient"*, for the fourth time) |
| 6 | Make it always return `true` | the idle-starvation leg |
| 7 | Reverse band iteration (4 → 1) | the ordering test |
| 8 | Skip the `d >= bestDist` guard inside a band | the argmin-integrity test — *"enforced here rather than trusted"* |
| 9 | Let a band-1 source claim a job `CanStageWorkerAt` refuses | ⚠️ **a priority may NEVER override physics** |
| 10 | ⭐ Make `CraftingSystem`'s defer query over-report (return `true` ignoring staged inputs) | ⭐ **THE MULTI-PAWN STALL LEG.** ≥4 pawns, ≥40 000 ticks, assert the low-band order **is** served. ⚠️ **This is the spike's own accidental bug**, it is silent, and **a one-pawn fixture cannot see it** |
| 11 | Ask the arbitration at four of the five sites | ⚠️ each omitted site gets a **blinded** leg — M2-2's shape, one level up |

**ACCEPTANCE.** M2-10's milestone demo, and ⭐ **its step 5 (the mid-chain flip) is THE acceptance for
this package** — it is the leg the defer half alone cannot produce.

**CONFLICTS.** `JobSystem.cs` (**strictly serialized against M2-2**), `MachineWearSystem.cs` and
`CraftingSystem.cs` (**and against M1-H**, which adds the backoff to the same recruiters).

**SIZE: L — measured, not estimated.** The spike's own numbers: band loop ~58 lines / **3–5 days**;
**push gate ~30 lines / 2–3 days, and this is where the design risk lives.** What makes it L is
**not** the band loop (~30 lines) — it is the **claimability queries**, which are optimistic by
construction and whose failure mode is a silent multi-sim-hour stall.

> ### ⚠️ WHY THIS LEG IS THE RISKY ONE — the spike's verdict, kept
> 1. **It half-works, and the working half is the half the owner does not care about.**
> 2. **Its failure mode is silent** — C2 was byte-identical to baseline. **A green suite proves
>    nothing here.**
> 3. **Its correct form is not local** — it touches every recruiter, not just integrator-owned
>    `JobSystem`.
> 4. **Its query is optimistic by construction**, and an over-report is a multi-sim-hour stall.

---

### M2-6 — the `why` line ⭐ **RE-CHARTERED IN REVISION 3, NOT RETIRED**

**CLASS: PLAYER** · **LANE: `lane/why-line`** · **SIZE: S**

> **TODAY THE PLAYER IS MISLED ABOUT** their crew's autonomy: the task line says *what* she is doing
> and never *why that job and not another*, so "she is ignoring my order" and "she ranked it lower"
> are indistinguishable. **AFTER THIS** it reads *"Stripping — Repair is priority 4"*.

> ### ⭐ WHY IT SURVIVES OD-H, AND WHAT MOVED
>
> **Its mutation 1 named a state that OD-H deletes:** *"emit the reason clause unconditionally,
> **including at all-default priorities**"* assumed a default in which every work type is enabled and
> nothing outranks anything — **the state in which there is genuinely nothing to say.** Under OD-H
> the all-default state is *"she is doing nothing because you have enabled nothing"*, which is the
> most important thing the line will ever say. ⇒ **The mutation is re-specified below, and the
> package's subject widens by one state.**
>
> ⛔ **AND ITS BOUNDARY WITH M2-20 IS DECLARED RATHER THAN DISCOVERED.**
> **M2-20 OWNS THE VOCABULARY** — the words for *unassigned* and *idle*, and the rule for which is
> which. **M2-6 CONSUMES IT** and adds the ranking clause on top. ⚠️ **Two packages writing prose about
> the same pawn on the same wire field is exactly how a repo acquires two names for one predicate** —
> `IsBackedOff` (§12.11), `codeOnly`, the two `NON_FURNITURE` sets. **M2-6 must not invent a second
> word for "doing nothing", and a reviewer must check that it did not.**

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
| 1 | ⭐ **RE-SPECIFIED IN REVISION 3.** Emit the ranking clause when **exactly one** work type is enabled | the "say nothing when there is nothing to say" leg — *"Repairing — Repair is priority 1"* when Repair is the **only** thing she is allowed to do is noise, and it is the state most players will be in for their first sim-hour. ⛔ *(Revision 2's version — "including at all-default priorities" — named a state OD-H deletes and **cannot be applied as an executable mutation**. Void.)* |
| 1b | ⭐ **NEW IN REVISION 3.** Emit the ranking clause for a pawn with **no** work type enabled | ⛔ **must be REFUSED.** She is not doing job X in preference to job Y; she is **unassigned**, which is M2-20's word and not a ranking. ⚠️ **A clause here is the "cheap-and-invisible wrong answer" shape — plausible prose over a state it does not describe** |
| 2 | Name the wrong work type in the clause | the mapping test, driven with **two** work types at different bands ⭐ **and both ENABLED** — under OD-H a two-work-type fixture must grant them explicitly or the leg is vacuous |
| 3 | Mutate `TaskLabel` to allocate per call | the zero-alloc / no-RNG assertion |
| 4 | Read the priority from a host-side copy rather than `Citizen` | the freshness leg: change the priority, require the next frame's line to follow |
| 5 | ⭐ **NEW IN REVISION 3.** Use M2-20's *unassigned* word for a pawn who is enabled but has nothing reachable to do | ⛔ **must go red** — the two states are different facts and the `overview-view.js:701-708` comment is right that conflating them is a lie. **This is the single-vocabulary leg, and it lives here because M2-6 is the second consumer** |

**ACCEPTANCE (browser, < 5 min).** ⭐ **Step 0 added in revision 3.**
0. At boot, before enabling anything: her line says she is **unassigned** — not "Idle", not a ranking.
1. Enable **Repair 1 / Haul 4**, paint a strip order, and read her task line: it names what she is
   doing **and the priority that chose it**. Flip to Repair 4 / Haul 1 and watch the clause change.
2. Switch everything off again → the line returns to **unassigned**, not to a stale ranking.

**CONFLICTS.** `GameSession.cs` — serialize against M1-D, M1-E, M2-4, M2-9, ⭐ **M2-20 (new — the
same `TaskLabel` builder)**.

**SIZE: S.**

---

### ~~M2-7 — the PRE-EMPTION POLICY~~ ⛔ **RETRACTED IN REVISION 2 — THE ENGINE ALREADY ANSWERS IT**

**CLASS: ~~INFRASTRUCTURE~~ — WITHDRAWN. Not a package. Its budget slot is returned.**

Revision 1 chartered a design package to decide *when a pawn may be taken off a job it is halfway
through*, on the grounds that the question *"has no precedent here and three named hard cases."*
**M2-0 measured all three. The engine already has an answer, and the answer is safe:**

| hard case | ⛔ what revision 1 feared | ✅ what the engine actually does — **measured** |
|---|---|---|
| mid-haul **carrying cargo** | the stack is lost or leaks a reservation | **dropped at the pawn's tile**, `CarriedBy → 0`, `ReservedBy → 0`, **re-enters the haul board.** Not destroyed, not leaked |
| mid-craft **against a bill** | partial work forfeit | ⭐ **station progress FULLY SURVIVES** — `recycler_1.Progress` **0.474 → 0.474**, and **0.486 at +300 ticks because another worker resumed the batch.** Progress lives on the `Device`, not the pawn |
| mid-build **with material delivered** | the material is lost | **the site keeps it** (`req=2 delivered=2` unchanged); only the pawn's own `WorkTicks` countdown is lost |
| *(fourth, unasked)* mid-maintain **with Parts in hand** | — | Parts **dropped intact and unreserved**; `Device.Condition` untouched |

⚠️ **AND THE PATH IS NOT THE ONE REVISION 1 NAMED.** It is **`Simulation.CancelJob`**, not
`JobWork.AbandonJob` — *"and it is the stronger one."* Revision 1's seam note pointed an implementer
at the weaker path.

⇒ **There is no policy to decide. There is a behaviour to pin**, and the pins move into **M2-8**.
⭐ **The owner-batch item this replaced is now M2's item 4: the STICKY CLAIM's release rule (M2-19)**
— because the spike found *that* is the part which is genuinely unbuilt.

> ⭐ **THE DURABLE LESSON, and it is the third time this document has learned it:** revision 1 sized
> this at **L** and called it *"the hard part"*; it is **0 lines in `sim/`** and **the safest leg in
> M2**. **The estimate was built from the absence of precedent, not from the code** — and *"there is
> no precedent for X"* is a statement about what someone has read, never about what the engine does.
> ⇒ **A design package chartered because a question feels hard must first be asked of the running
> sim.** One driven afternoon deleted an entire package and inverted a risk row.

---

### M2-8 — PRE-EMPTION *(risk row INVERTED in revision 2)*

**CLASS: PLAYER** · **LANE: `lane/preempt`** · **SIZE: S** · ⚠️ **INTEGRATOR LANE** · ✅ **PIN-NEUTRAL
— OFF THE PIN CHAIN**

> **TODAY THE PLAYER CANNOT** change their mind about a busy crew member. **Nothing in the sim can
> take a busy pawn back**: `IsRecruitableForWork` (`Citizen.cs:103`) reduces to `IsIdleForWork`
> (`:73`), which requires `JobKind == JobKind.None`, and the only pre-emption anywhere is
> `SafetySystem.cs:229-239` (`sim.CancelJob(c)` at `:233`).
> **AFTER THIS** a raised priority reaches a working pawn — measured, **order at t=231 →
> `Deconstruct` at t=232. One tick.**

> ### ✅ REVISION 2 — THIS IS THE CHEAPEST AND SAFEST LEG IN M2, NOT THE SCARIEST
>
> Revisions 0 and 1 sized this **L** and called it *"a mechanism the sim has exactly one instance of…
> whose POLICY is a design question with no precedent here."* **M2-0 built it:**
>
> - **ZERO lines in `sim/`.** Three host-side lines, modelled on `SafetySystem:232-238`:
>   `sim.CancelJob(c); c.ClearPath(); c.OrderedMove = false;`
> - **One tick** from order to new job.
> - **All three "hard cases" measured SAFE** — see the retracted M2-7 above for the table.
> - The path that runs is **`Simulation.CancelJob`**, *"not `JobWork.AbandonJob`, and it is the
>   stronger one."*
>
> ⇒ **`SIZE: L → S`. `PIN CHAIN M2-b → OFF THE CHAIN` (pin-neutral, prove with check (A)).
> `M2-7` retracted. Risk row R1b inverted.**
> ⚠️ **The estimate was built from the absence of precedent, not from the code.** Three days of design
> package and a pin-chain slot were budgeted for something that is three lines and already correct.

> ### ⛔ AND THE PART THAT IS ACTUALLY UNBUILT: PRE-EMPTION ALONE IS USELESS
>
> Measured: the pre-empted pawn was **re-claimed by `MaintenanceSystem` within the same tick** —
> **idle 11 ticks of 30 000.** You cancel her job and she goes straight back to it.
>
> ⇒ ⭐⭐ ***"That machine, now" is NOT CANCELLING. It is HOLDING.*** And nothing in the sim expresses a
> hold: `OrderedMove` is the closest analogue and it *"only suppresses work during a walk"*
> (`Citizen.cs:92-102`). **That is `M2-19`, and M2-8 is inert in play without it.**
> ⚠️ **A reviewer must not accept M2-8's demo without M2-19 present** — a one-tick pre-emption
> followed by a same-tick re-claim looks, on screen, exactly like nothing happening.

**SEAM.** `Simulation.CancelJob` (the flee path's own call, `SafetySystem.cs:233`) · `JobSystem.Tick`
(`:140`, `if (citizen.IsRecruitableForWork) TryAssign(...)`) gains a pre-emption check for **busy**
pawns · the per-source abandon paths, which already exist and are measured correct.
⚠️ **Do NOT route through `JobContext.AbandonJob` (`JobContext.cs:93`)** — revision 1's seam note
named it and it is the weaker path; `Simulation.CancelJob` is what `SafetySystem` uses and what the
spike measured.

**PIN IMPACT: PIN-NEUTRAL — prove with check (A).**
⚠️ ⭐ **REVISION 3: THE CONCLUSION STANDS AND ITS REASON HAS ROTTED — corrected in place rather than
left to be re-derived.** *(Revision 2 argued: "At shipped defaults **no band outranks another**
(M2-5's authored work-list order reproduces `main`) and no `PrioritiseJobCommand` exists, so nothing
pre-empts on a pinned ship." **The first clause is void** — under OD-H the shipped default is not
"every band equal", it is "no work type enabled at all".)*
⇒ **The true reason is simpler and strictly stronger: at the OD-H defaults nothing is enabled, so
nothing is claimed, so there is nothing to pre-empt.** ⚠️ *Still measured, not assumed — and note that
the new reason removes a dependency: M2-8's neutrality **no longer rests on M2-5's authored work-list
order**, which owner batch item 7 has re-opened. **A package whose pin argument depends on another
package's un-decided design choice is a package that will be re-measured; this one no longer is.***

**SPINE? YES** (`Simulation.cs`, `JobSystem.cs`). **Integrator lane.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Make the pre-emption check a no-op | the driven Repair@1-mid-haul test |
| 2 | Route through `JobWork.AbandonJob` instead of `Simulation.CancelJob` | ⭐ **the CARGO leg — the case that loses matter if it is wrong.** Drive a pawn **carrying a stack**, pre-empt, and assert the stack is **on the ground at the pawn's tile with `CarriedBy == 0` and `ReservedBy == 0`**, and that it re-enters the haul board. *(The spike measured `CancelJob` as correct here; this leg pins that the correct path stays wired.)* |
| 3 | Pre-empt a pawn in `JobKind.Flee` | ⛔ must be **refused** — survival outranks everything |
| 4 | Pre-empt a pawn in `JobKind.Eat` / `Drink` | ⛔ must be **refused** (§12.3) |
| 5 | Pre-empt at equal band with no explicit order | the inertness leg: the all-default control must stay byte-identical. ⚠️ ⭐ **REVISION 3: under OD-H the all-default control has NO CLAIMED JOBS AT ALL, so it is byte-identical for a reason that has nothing to do with pre-emption — i.e. VACUOUS.** ⇒ **The control must GRANT the fixture a grid at equal bands** and then require nothing to pre-empt. *(§13.4: a green that means "my instrument sees nothing" is not a green.)* |
| 6 | Leave `sim.JobsDirty` unset after the cancel | the board-rebuild leg — a pre-emption that skips it leaves a phantom assignment |
| 7 | ⭐ Pre-empt mid-craft and **reset `station.Progress`** | ⭐ **the SURVIVAL leg, and it pins a measured behaviour rather than a hope.** `recycler_1.Progress` must read **0.474 → 0.474** across the pre-emption, and must **advance** when another worker resumes. Progress lives on the `Device` — a future refactor moving it to the pawn silently deletes a batch |
| 8 | Pre-empt mid-build and delete the delivered material | `req=2 delivered=2` must be unchanged |

⚠️ **Rows 3 and 4 are NEGATIVE guards** and must be run blinded of the positive ones. A suite that
only proves pre-emption *works* is satisfied by one that fires on everything, and the failure mode is
a crew member who starves while being reassigned.

**ACCEPTANCE (browser, < 5 min).** The pre-emption leg of M2-10's milestone demo — ⚠️ **and it is not
demonstrable until M2-19 lands** (see above).

**CONFLICTS.** Spine + `JobSystem.cs`. Serialize against M2-5, M2-19.

**SIZE: S — measured (~1 day), not estimated.** *(Revision 1 said L. That was wrong and the correction
is published rather than quietly re-scored.)*

---

### M2-19 — THE STICKY CLAIM: *"that machine, now"* means **holding**, not cancelling *(NEW IN REVISION 2)*

**CLASS: PLAYER** · **LANE: `lane/sticky-claim`** · **SIZE: M** · ⚠️ **INTEGRATOR LANE**

> **TODAY THE PLAYER CANNOT** keep a crew member on the job they just pointed at. Even with
> pre-emption, the pawn is **re-claimed by `MaintenanceSystem` within the same tick** — measured,
> **idle 11 ticks of 30 000.** **AFTER THIS** a direct order sticks until it is done.

> ⭐ **WHY IT IS ITS OWN PACKAGE AND NOT A LINE IN M2-9.** The spike's sharpest finding is a
> re-framing, not a number: ***the hard part of a direct order is not cancelling; it is HOLDING the
> pawn afterwards, and that is unbuilt.*** `OrderedMove` (`Citizen.cs:84`) is the closest analogue in
> the codebase and it *"only suppresses work during a walk"* — it clears on arrival, which is the one
> moment a held pawn most needs to stay held.

**SEAM.**
- **A second hashed bool on `Citizen`** (working name `HeldByOrder`), checked by
  `IsRecruitableForWork` (`Citizen.cs:103`) **and** by both push recruiters' `FindNearestIdle`
  (`MachineWearSystem.cs:426`, `CraftingSystem.cs:475`) — ⚠️ **the same five-site discipline as M2-2;
  a hold enforced only in the dispatcher is re-claimed by a push recruiter in the same tick, which is
  the exact defect this package exists to fix.**
- ⭐ **ITS STORAGE BATCHES INTO M2-1's COMMIT, ZEROED AND UNREAD** — beside the reserved skill byte.
  The CITZ chapter is bumping anyway; **W0-1b folded thirteen saved-but-unhashed fields in a single
  pin move.** ⇒ **This package is then PIN-NEUTRAL and off the chain.**
  ⚠️ **This must be decided when M2-1 is written, not when M2-19 is** — a second chapter bump costs a
  whole re-pin, and by then it is unavoidable.

> ### ⭐ THE OWNER-BATCH ITEM THAT REPLACES PRE-EMPTION POLICY: WHEN DOES THE HOLD RELEASE?
> The mechanism is trivial; **the release rule is the design.** Candidates, and they are not
> equivalent: on job completion · on a new direct order · on the pawn becoming unable to continue
> (unreachable, unbreathable) · on death · on the player clearing it explicitly · **never** (a
> permanent assignment).
> **RECOMMEND: completion, a new order, death, or genuine inability — and NOT a timeout.** A timeout
> makes the hold a race the player cannot see. ⛔ **And a hold must NEVER outrank `SafetySystem`** —
> a held pawn in lethal air still flees, on the same rule that a move order does not starve someone.

**PIN IMPACT: PIN-NEUTRAL *if* the storage landed in M2-1.** Prove with check (A). ⚠️ **If M2-1
shipped without it, this package moves P1/P2/P3 and joins the chain** — state which at charter time.

**SPINE? YES** (`Citizen` semantics + `JobSystem`). **Integrator lane.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Check the hold in `IsRecruitableForWork` **only** | ⭐ **THE HEADLINE LEG.** Drive a held pawn for 30 000 ticks with a needy machine present and assert `MaintenanceSystem` **never** claims her. ⚠️ **A dispatcher-only hold passes a naive test and fails this one — it is the same-tick re-claim, measured** |
| 2 | Check it in the two push recruiters only | the dispatcher leg, blinded |
| 3 | Never release the hold | the release legs — one per decided condition, each blinded |
| 4 | Let the hold survive `JobKind.Flee` | ⛔ **must be refused.** A held pawn in lethal air still flees |
| 5 | Let the hold suppress Eat / Drink | ⛔ **must be refused** (§12.3) |
| 6 | Drop the bool from the save writer / reader / hash fold | three blinded round-trip legs (M2-1's shape) |

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → right-click `battery_2` → **Prioritise: repair**.
2. She drops what she was carrying and walks.
3. ⭐ **Set max speed and watch for a full sim-minute: she stays on `battery_2`** — she is not stolen
   back by the maintenance rule, and the task line keeps naming the machine you chose.
4. When it completes, she returns to normal autonomy under the grid.

**CONFLICTS.** `Citizen.cs` (**M2-1 must land its storage first**), `JobSystem.cs`,
`MachineWearSystem.cs`, `CraftingSystem.cs`. Serialize against M2-2, M2-5, M2-8, M1-H.

**SIZE: M** — the five-site discipline and the release rule, not the bool.

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
| 2 | Prioritise a machine the pawn's work grid has **off** | ⚠️ **decide and pin it.** RECOMMEND: an explicit order **overrides the grid** (RimWorld's own answer — a right-click order beats a work setting) but **never overrides `CanStageWorkerAt`**. Whichever is chosen, a leg must pin it. ⛔ ⭐ **REVISION 3 — THIS IS NO LONGER AN EDGE CASE. Under OD-H every machine on the ship is "a machine the work grid has off" at boot**, so if the answer is *no override*, the player's **first right-click is refused** and OD-G's opening beat is only reachable through the WORK tab. **Owner batch item 5, and the option space has narrowed even though the question has not.** ⚠️ A `no-override` answer also makes this leg's fixture the *default* fixture, not a special one |
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
5. ⭐ **THE DECISIVE STEP, and revision 2 makes it explicit: do this WHILE SHE IS MID-SERVICE, not
   while she is idle.** Let her start a Maintain service, *then* flip to **Repair 4, Decon 1**.
   **She abandons the service and goes to the strip order** — measured at **~7 232** against a
   baseline of **54 652 (7.3×)**.
   ⚠️ ⭐ **THIS IS THE ONLY STEP THAT DISTINGUISHES A COMPLETE M2-5 FROM A HALF ONE.** The defer half
   alone produces a result **byte-identical to the shipped sim** here, and every other step in this
   demo still passes. **A reviewer who skips step 5 cannot tell the milestone shipped.**
   *(And do not run it from an idle pawn: painted at t=0, an order wins at tick 1 on unmodified
   `main`. See revision 2 §6.)*
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
>
> ### ⭐ REVISION 3 — OD-H MATERIALLY SHRINKS RISK 2, AND THAT IS WORTH SAYING BEFORE THE OWNER DECIDES
>
> Risk 2 above is *"the standing maintenance rule may spend the three consumables before the player
> can direct them"* — `RecruitForNeediest` picks the **lowest-Condition** device on the ship, and
> `wing_c` (0.06) is among the lowest. **Under OD-H `Repair` is off until the player switches it on,
> so the maintenance rule does not run at all at boot.** ⇒ **The player now chooses when the ship
> starts spending its three consumables**, which is precisely the *"my order matters"* loop OD-A asks
> for, arriving as a side effect of a default.
> ⛔ **It does NOT resolve the soft-lock** — once Repair is on, `RecruitForNeediest` is still
> neediest-first and can still spend the Parts on a scrubber. **Batch item 6 stands, unchanged, with
> its recommendation still deliberately withheld.**
> ⚠️ **AND M2-12'S REQUIRED MEASUREMENT MUST NOW SAY WHICH GRID IT RAN WITH.** *"Measure and state
> where the authored Parts and Seals actually go in an unattended 2-sim-hour run"* has **no defined
> answer under OD-H** — an unattended run spends nothing, because nothing is enabled. ⇒ **Run it with
> `Repair` explicitly granted, and say so.** *(Third instance in this revision of the same shape: a
> measurement instruction that silently assumed the old default.)*

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

> ### ⛔ ⭐ REVISION 3 — OD-H GIVES THIS PACKAGE REAL SCOPE, AND WITHOUT IT EVERY LEG MEASURES NOTHING
>
> **Under OD-H an unattended fixture run does NO WORK AT ALL.** `--ship slice` and `--ship grid` exist
> to be driven headless; their crew boot with every work type off, so from M2-2 onward **every
> occupancy leg in the repo measures a ship where nobody works, and reports it as a number.**
> ⚠️ **That is not a regression to hunt — it is a harness that no longer states its own preconditions.**
> ⇒ **REQUIRED, and it is the package's largest part:** the occupancy harness must **author a work
> grid explicitly per leg** and **print it beside the result**, so a number can never again be quoted
> without the grid that produced it.
> ⛔ **AND IT MUST CARRY ITS OWN NON-VACUITY CHECK, BY INCLUSION:** a leg that reports `0 %` busy is
> now **the expected output of a correctly-working game**, and is therefore indistinguishable from a
> broken harness. **Require at least one leg with a granted grid to report non-zero work before any
> zero is believed.** *(This is §13.4 and the de-DE parser lesson in one: a green meaning "my
> instrument is broken" now has a second spelling, and it reads `A1 = 0.000 %`.)*
> ⚠️ **`A1 = 0.000 %` on `--ship grid` is ALREADY the measured post-E0 result** (`e0-complete-gate-failed`),
> **so the two causes are now confusable by construction.** Anyone quoting an A1 number after M2-2
> must say which grid the crew had. **A1 is a regression statistic under OD-B and may never be
> optimised toward — that rule is unchanged and this makes it easier to break by accident, not
> harder.**
> ⚠️ **This scope depends on OWNER BATCH ITEM 8.** Under answer (b) — fixtures authored all-on — most
> of it evaporates and the package returns to SIZE S. **State which answer you are building against.**

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

### M2-18 — the refusal M2 itself creates ⭐ **PROMOTED IN REVISION 3**

**CLASS: PLAYER** · **LANE: `lane/work-blocked`** · **SIZE: S → M** · ⛔ ⭐ **MERGES IMMEDIATELY BEHIND
M2-2 (position 13) — no longer behind M2-5**

> **TODAY** — meaning the day M2-2 lands — **THE PLAYER IS MISLED ABOUT** an order that stalls because
> the only crew member who could take it has that work type switched off. It looks exactly like a
> broken verb. **AFTER THIS** the tile says so.

> ### ⛔ ⭐ UNDER OD-H THIS IS NOT A MARGINAL REFUSAL. IT IS THE DEFAULT EXPERIENCE.
>
> Revision 2 chartered this as *"the refusal M2 itself creates"* — a new edge introduced by giving the
> player a switch. **Under OD-H every work type is off at boot, so the FIRST order a new player paints
> is refused for exactly this reason**, on a ship with exactly one crew member.
> ⇒ **`ReasonWorkTypeOff` becomes the most-emitted refusal in the game on day one**, and without it the
> opening reads: *paint a strip order, nothing happens, forever, silently.*
> ⚠️ **That is the 480 000-tick silent stall wearing new clothes**, and the binding memory
> *invisible-feedback-is-functional* has already cost this project **three owner reports** for the
> same shape.
> ⇒ **It stops being "needs 9 and 12" and becomes "needs 11".** It does **not** need M2-5: a work type
> that is *off* is refused by the veto alone, and ranking has nothing to do with it. *(Revision 2's
> dependency on M2-5 was inherited from its merge position, not derived from its seam — a dependency
> that was never checked.)*
> ⚠️ **AND IT IS NOW PARTLY REDUNDANT WITH M2-20, WHICH IS A GOOD PROBLEM STATED EARLY:** M2-20 says
> *"she is unassigned"* on the **pawn**; this says *"nobody aboard is assigned that work"* on the
> **tile**. **One player confusion, two surfaces, and they must agree.** ⛔ **Neither package invents a
> second vocabulary; M2-20 owns the words** (see M2-6's boundary note).

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

**ACCEPTANCE (browser, < 5 min).** ⭐ **Step 0 added in revision 3, because it is now the FIRST thing a
new player does.**
0. `./play.sh` on a fresh game, **before opening the WORK tab at all**: paint a STRIP order. The tile
   says **nobody aboard is assigned that work** — it does not sit silent.
1. Open the WORK tab, set **Deconstruct** to **3** → the reason clears and she goes.
2. Set it back to *off*, paint another order → the reason returns.

**CONFLICTS.** `GameSession.cs`, `WireFormat.Blocked.cs` — serialize against M1-D, M1-E, ⭐ **M2-20**
(they describe the same confusion on two surfaces and must share one vocabulary).

**SIZE: S → M** — one question on a channel M1 built, ⭐ **plus the vocabulary agreement with M2-20 and
a two-pawn fixture on a one-pawn ship.**

---

### M2-20 — THE SHIP IS WAITING ON YOU *(NEW IN REVISION 3 — OD-G's package)*

**CLASS: PLAYER** · **LANE: `lane/awaiting-orders`** · **SIZE: M**
⛔ **MERGES IN THE SAME INTEGRATION WINDOW AS M2-2**

> **TODAY THE PLAYER CANNOT** tell a crew member who is **waiting for an order** from one who is
> **broken, stuck, or has nothing to do** — and from the day M2-2 lands, *waiting* is how every crew
> member on every new game begins. **AFTER THIS** the opening reads as a game handing the player its
> first move, and a deliberately unassigned pawn is visibly different from an idle one.

> ### ⭐ WHY THIS IS A PACKAGE AND NOT A LINE IN M2-2 — the mechanism is free, the legibility is not
>
> **OD-G's MECHANISM falls out of OD-H for nothing**, and that is the finding, not the package:
> with every work type off, M2-2's five gates refuse the dispatcher, `CraftingSystem` and
> `MaintenanceSystem`, and the four job boards are already empty at boot
> (`AuthoredShips.cs:1514-1521`, pinned by `WreckShipTests.cs:780-799`). **The pawn boots idle and
> waiting with no new sim code at all.**
>
> ⇒ **What is left is the whole risk: a waiting pawn and a hung game look identical.** This repo has a
> binding memory for exactly that — ***invisible feedback is FUNCTIONAL***, three owner reports — and
> the state OD-G creates is the largest instance of it the project has shipped, because it is **the
> first ten seconds of a new game**.

> ### ⛔ IT CONTRADICTS A LIVE, DELIBERATE DESIGN POSITION, AND THAT POSITION IS HALF RIGHT
>
> `client/src/ui/overview-view.js:701-708`, verbatim:
> > *"A row that shows "Idle" in dim grey is the honest answer and it is also the legibility
> > mechanism: the eye reads the amber rows as "work is happening", so a dock of grey rows is a TRUE
> > signal that nothing is. On `--ship grid` that will be most of the day (crew there do not
> > auto-wander), and the choice was deliberate — **writing something like "AWAITING ORDERS" would
> > imply the ship is waiting on the player, when an idle crew member may simply have nothing
> > reachable to do.**"*
>
> ⭐ **Under OD-G the ship IS waiting on the player, so the objection's premise is gone — but the
> DISTINCTION it protects survives and gets sharper.** Under OD-H **both** states are now common:
> *unassigned* (you have enabled nothing she can do) and *idle* (she is enabled and has nothing
> reachable). ⇒ **The comment is not deleted as wrong. It is amended: it identified a real hazard and
> then chose the wrong side of it for a world where only one of the two states existed.**
> ⚠️ **A lane that simply writes `AWAITING ORDERS` over the top of that comment has repeated the
> mistake in the other direction**, and a reviewer must refuse it: **two states, two words.**
> ⛔ **THE COMMENT MUST BE CORRECTED IN PLACE, NOT DELETED** — it is the record of a decision, and the
> repo's rule is that a retraction is stated where the claim was made (§13.11).

**SEAM.**
- `hosts/web/GameSession.cs:2622-2632` — `TaskLabel`'s `default:` branch, which today emits
  `"Walking to …(no task)"` / `"Holding position"` / `"Idle"`. ⭐ **This is where the vocabulary lives,
  and it is the SINGLE authority** — both standard surfaces already read it (*"the host's own words,
  so the two surfaces cannot disagree"*, `overview-view.js:701-702`). ⛔ **Do not add a client-side
  derivation; that is the two-sources-for-one-layer defect the `marks` channel exists to remove.**
- `client/src/ui/overview-view.js:697-708` — the CREW WATCH task line and its dim/amber rule.
  **Correct the comment in place.**
- `client/src/ui/roomzoom-view.js:700` — the same line on the second surface.
- ⭐ **The teaching surface: `client/src/ui/onboarding.js`.** M1-B has already been through this card
  once (*"the first screen stops lying"*); this package adds **the first order** to it.

**⭐ THE THREE THINGS IT MUST DELIVER, and only the first is prose.**
1. **TWO WORDS, NOT ONE.** One for *unassigned*, one for *idle*. ⚠️ **The exact strings are
   REVERSIBLE and are OWNER BATCH ITEM 11** — ship the recommendation if it is unanswered after three
   days, and mark it as such in the milestone record.
2. ✅ **THE PAWN IS ALREADY ALIVE ON SCREEN — VERIFIED, NOT ASSUMED, AND THE RISK IS DISCHARGED.**
   Idle wander (`CitizenSystem.cs:70-79`) sets a **path** and never a `JobKind`, so it is untouched by
   M2-2's veto and is what an unassigned pawn *does*. **The wreck's boot pawn is authored
   `AutoWander = true`** (`sim/Sim.Gen/AuthoredShips.cs:1936-1941`, whose own comment reads
   *"AutoWander so the ship is not a still photograph while the pawn is idle; deck-confined"*, and
   `:1535` states it again). ⇒ **No content change, no `AuthoredShips.cs` claim, no escalation.**
   ⚠️ ⭐ **BUT THE `overview-view.js:701-708` COMMENT IS STALE ABOUT THIS TOO, AND THAT MATTERS FOR THE
   AMENDMENT:** it reasons from *"on `--ship grid` … crew there do not auto-wander"* — which was true
   when it was written and **was reversed on 2026-07-25** by the deck-confined-wander lane
   (`AuthoredShips.cs:1123`, grid crew are now `AutoWander = true`, *"the standard play ship should not
   be a still photograph"*). ⇒ **The comment is wrong in TWO clauses, not one**, and a lane amending it
   must fix both. **This package still owns the leg that PINS the behaviour** (a pawn with no work
   enabled still moves), because *"it is authored true today"* is a statement about a tree.
   ⛔ **Do not delete the wander to make "waiting" legible** — the words are deliverable 1's job.
3. **THE FIRST ORDER MUST BE TEACHABLE.** The onboarding card must name the gesture that starts the
   game. ⚠️ **OWNER BATCH ITEM 10 defines what counts as "the first order"** — if it is *"any player
   command that results in the pawn taking a job"*, the card teaches the WORK tab; if it is *"a
   targeted order only"*, it teaches STRIP or *Prioritise*. **The card cannot be written before that
   item is answered, and that dependency is stated here rather than discovered by the lane.**

**PIN IMPACT: PIN-NEUTRAL** — host-side prose and client rendering, and **no `sim/` diff at all** now
that deliverable 2 is discharged by verification rather than by a content change. Check (A).

**SPINE? No** — `GameSession.TaskLabel` is not a spine file. ⚠️ **But it is the quarter's most
contended file (six claimants, §10), so serialize.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Emit the *unassigned* word for a pawn who **is** enabled and merely has nothing to do | ⭐ **THE HEADLINE LEG — the distinction the old comment protects.** Two driven fixtures, **blinded of each other**: (a) all work off ⇒ *unassigned*; (b) `Haul` on with nothing haulable ⇒ *idle*. ⚠️ **A single test covering only (a) is satisfied by a package that renames "Idle"** |
| 2 | Emit *idle* for a pawn with everything off | the mirror of 1, blinded |
| 3 | Derive the word client-side instead of reading the host's task field | the single-authority leg — **record the value at the seam** (§13.6), never scan for the string |
| 4 | Emit the word on **one** surface only | the two-surface leg: Overview **and** Room Zoom. ⚠️ *"The two surfaces cannot disagree"* is the comment's own claim and nothing pins it |
| 5 | Make `TaskLabel` allocate per call while adding the branch | the zero-alloc / no-RNG assertion `TaskLabel` already carries |
| 6 | Keep the dim-grey styling for the *unassigned* row identical to *idle* | ⚠️ **decide and pin it.** The dim/amber rule is *"a TRUE signal that nothing is happening"* and **it stays** — but *unassigned* and *idle* must be **distinguishable in rendered output**, not only in a string a test reads. **Assert on rendered output under a changed input** (M1-F's leg-3/4 shape) |
| 7 | Remove the first-order line from the onboarding card | the card census — ⚠️ **M1-B's own guard shape; do not invent a second one** |

⚠️ **LEGS 1 AND 2 MUST EACH FIRE ALONE.** `assert` throws (§13.3), and *"two words"* is precisely the
claim a single-leg test cannot make.

**ACCEPTANCE (browser, < 5 min) — ⭐ THIS IS OD-G's DEMO, AND IT IS THE FIRST TEN SECONDS OF THE GAME.**
1. `./play.sh` on a fresh game. **Do not touch anything.**
2. Rell's row reads **unassigned** — not "Idle", not blank — and **she is visibly alive** (moving, or
   deliberately not, per deliverable 2's measured answer).
3. The onboarding card names **the first order** and the key that gives it.
4. Give that order. **She takes it.**
5. When it completes, **she returns to autonomy under the grid** — she keeps doing what you enabled,
   and reads *unassigned* again only if you enabled nothing else. ⭐ *This is OD-G's second clause, and
   step 5 is the only step that tests it.*

**CONFLICTS.** `hosts/web/GameSession.cs` (serialize against M1-D, M1-E, M2-4, M2-6, M2-9, M2-18) ·
`client/src/ui/overview-view.js` (against M1-B, M1-C, M1-F, M2-3) · `client/src/ui/roomzoom-view.js`
(against M1-C, M2-10) · `client/src/ui/onboarding.js` (**against M1-B, and against M4's card
rewrite**).

**SIZE: M** — ⚠️ **and what makes it M is the two blinded fixtures and the four-file vocabulary
agreement, not the words.** *(Sizing a prose package S because "it is only a string" is how the
`why` line's cousins get under-reviewed.)*

---

### M2-21 — the silent BUILD haul *(NEW IN REVISION 3 — measured by M1-D's review, 2026-07-29)*

**CLASS: PLAYER** · **LANE: `lane/build-haul-backoff`** · **SIZE: M** · ⚠️ **INTEGRATOR LANE**
⛔ **PIN CHAIN M1-c — RUNS ALONE, AT MERGE POSITION 7b**

> **TODAY THE PLAYER IS MISLED ABOUT** a build order behind a shut door: **the site is held as
> `HaulToBuild` for 3 000 ticks with 2 999 abandons, ZERO backoff stamps and ZERO `blocked` rows.**
> *(Driven, reported by the M1-D review, 2026-07-29.)* Nothing on any surface says anything.
> **AFTER THIS** it backs off like every other refused claim, and the `blocked` channel can see it.

> ### ⛔ THIS IS THE ORIGINAL 480 000-TICK LIVELOCK, AND IT IS THE FOURTH INSTANCE OF ONE ASYMMETRY
>
> **Cause, measured:** `BuildJobSource.TryReserveMaterialFor` pathfinds citizen → **material** only;
> `ProgressBuildHaul` phase A abandons on `TryPathToAdjacent(site)` and **stamps nothing**. So the
> claim succeeds on a reachable *material* and fails on an unreachable *site*, forever, at the board's
> full rate.
> ⇒ **§12.14's structural asymmetry now has four consequences, not three:** M1-H (`CraftingSystem`
> abandons without stamping), M1-I (`CraftingSystem` stages without asking), **M2-21 (`BuildJobSource`
> abandons a phase without stamping)**, and M2-5's five-site problem. ⚠️ **The first three are one
> defect wearing three costumes: a claim path that refuses without recording the refusal.**
> ⛔ **A reviewer should ask, of this package, whether the OTHER three sources have the same phase-A
> hole** — `HaulJobSource` and `DeconstructJobSource` stamp at their claim sites (`:311`/`:543`,
> `:147`), **but stamping at CLAIM is not the same as stamping in PROGRESS**, and that is exactly the
> distinction this defect turns on. **Census it; do not assume.**

**SEAM.** `sim/Sim.Core/Jobs/Sources/BuildJobSource.cs` — `TryReserveMaterialFor` and
`ProgressBuildHaul`'s phase A. The stamp value is `JobWork.UnreachableRetryTicks = 50`
(`JobContext.cs:55`), already on the determinism path. ⛔ **Do not add a def field.**
⚠️ **`IsBackedOff` ALREADY HAS A CANONICAL NAME AND M1-D IS MIRRORING IT** onto this very source
(`HaulJobSource.cs:137`, *"THE ONE DEFINITION OF 'BACKED OFF'"*; §12.11). ⛔ **This package must use
M1-D's mirrored query, not invent a second predicate** — which is why it merges **after** M1-D
(position 4), not before.

**⭐ WHY IT IS SCHEDULED HERE — the integrator's reasoning, recorded so it can be challenged.**
*"The fix is one line but it is a **write on a dispatch path**, so it moves pins."* Under OD-H the
milestone has **already committed to a pin move and a re-baseline**, so this rides along near-free
rather than being filed as a known silence. ⚠️ **But it lands BEFORE M2-2 (position 11), not after**,
and that is a ruling: **from M2-2 onward every fixture boots with no work enabled, so a driven leg
proving "a build order behind a shut door now backs off" needs a harness that authors a grid — which
does not exist until M2-17 at position 22.** ⇒ **Measure it while the fixtures still work.**

> ⚠️ **THE ID AND THE POSITION DISAGREE, DELIBERATELY.** The **id** is in the M2 range because the
> package is chartered onto M2's budget and its pin wave; the **merge position** is 7b because it must
> be measurable. ⭐ **The chain letter records WHEN, the package id records WHOSE BUDGET — this is the
> first row in the quarter where those two facts diverge, and it is written down rather than
> reconciled by renumbering** (ids are stable once published, §11).

**PIN IMPACT: ⛔ P1, P2, P3 EXPECTED TO MOVE — MEASURE.** A backoff stamp on a dispatch path changes
claim timing on any ship with a build site whose material is reachable and whose site is not.
**P4/P5 HOLD** — reuses an existing literal. ⚠️ **If all three hold, that is a statement about the
pinned ships' geometry, not about the fix** — prove non-vacuity with the driven fixture below.

**SPINE? YES — `sim/Sim.Core/Jobs/`.** Integrator lane. ⛔ **Strictly serialized against M1-D, M2-2,
M2-5.**

**MUTATIONS.**

| # | mutation | must go red |
|---|---|---|
| 1 | Delete the phase-A stamp | ⭐ **THE HEADLINE LEG, and it must assert a COUNT, not a state.** The measured signature is **3 000 ticks / 2 999 abandons / 0 stamps**. Drive a build site behind a shut door and assert the abandon count is **bounded** (single digits), **not** that the pawn is idle — ⚠️ *the pawn IS idle on almost every tick of the livelock, so an idleness assertion passes on the bug* (M1-H's lesson, verbatim) |
| 2 | Stamp in `TryReserveMaterialFor` but not in `ProgressBuildHaul` | the phase-A leg, blinded — ⚠️ **this is the actual shipped bug and a package that "adds a backoff to BuildJobSource" can pass a naive test while reproducing it** |
| 3 | Stamp but never expire | the recovery leg: open the door and require work to start within `UnreachableRetryTicks + 1` |
| 4 | Emit no `blocked` row for the backed-off site | ⭐ **the visibility leg** — the whole point is that M1-D's channel can now see it. ⚠️ **`IsBackedOff` is cleared wholesale on `JobBoardDirty.Tiles` and expires after 50 ticks** (§12.11), so **the reason will blink out on a one-pawn ship**; M1-D's latch decision governs, and this package must say in writing which side it took |
| 5 | Apply the backoff to a **reachable** site | the no-regression leg: normal build throughput unchanged |
| 6 | Add a def field for the interval | the P4/P5 pin |

**ACCEPTANCE (browser, < 5 min).**
1. `./play.sh` → build a wall section behind a shut door.
2. Today: nothing happens, forever, silently.
3. After: the tile carries a **reason** and the crew member does something else.
4. Open the door → she goes.

**CONFLICTS.** `sim/Sim.Core/Jobs/Sources/BuildJobSource.cs` and `sim/Sim.Core/Jobs/*` — **M1-D,
M2-2, M2-5** (§10). Both goldens. Runs alone.

**SIZE: M** — ⚠️ *"the fix is one line"* is the implementation, not the package. **What makes it M is
the driven livelock fixture, the census of the other three sources, and a pin move.**
⛔ **A reviewer must refuse an S sizing argued from the diff.**

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
| **M1** | ⭐ **9** | ⭐ **8** | **1** (M1-G) | 1 | ⚠️ **AT CAP** |
| **M2** | ⭐ **17** | ⭐ **15** | **2** (M2-0 ✅ landed · M2-17) | 3 | **1** |
| **M3** *(outline)* | 13 | 12 | **1** (M3-1) | 2 | 1 |
| **M4** *(sketch)* | 8 | 7 | **1** (M4-1) | 1 | ⚠️ **AT CAP** |
| **M5** *(sketch)* | 7 | 7 | **0** | 1 | 1 |
| **QUARTER** | ⭐ **54** | ⭐ **49** | **5** | **10** | **5** |

⭐ **RE-COUNTED IN REVISION 3, FROM THE MERGED TREE, ROW BY ROW — not adjusted.** M1 gains **M1-I**
(9 = A,B,C,D,E,F,G,H,I). M2 gains **M2-20** and **M2-21** (17 = M2-0,1,2,3,4,5,6,8,9,10,11,12,17,18,
19,20,21 — M2-7 retracted, M2-13…M2-16 never existed, §11). ⚠️ **All three new packages are `PLAYER`
and carry real sentences, so the infrastructure column does not move and no cap is breached.**
⚠️ **`M2-21` is counted under M2 because that is whose budget it is chartered onto, even though it
merges at position 7b** — see its charter.

⛔ **AND A STALE FIGURE IN THIS SECTION'S OWN PROSE IS CORRECTED RATHER THAN CARRIED.** The paragraph
below read *"this document charters 50 and 6"* while the table beside it said **51 and 5** — it had
not been recomputed since revision 1 added M1-H, retracted M2-7 and added M2-19.
**Against the plan's projection (~76 packages, ≤15 infrastructure): this document charters 54 and 5.**
The difference is not optimism — it is that M3/M4/M5 are outline and sketch, and **their charters will
add packages when they are written.** ⚠️ **The infrastructure ratio, however, is the number to watch:
at 5 of 54 the quarter is at 9.3 %, comfortably inside 20 %, but M1, M2 and M4 are each individually
AT CAP.** Chartering one more infrastructure package in any of those three is a **refusal**, and the
only way past it is an explicit owner override recorded by name and date.
⚠️ ⭐ **THE STALE-PROSE-BESIDE-A-CORRECT-TABLE SHAPE IS THIS DOCUMENT'S OWN §13.11**, and it survived
two revisions and one independent review. **A count in prose and a count in a table are two
transcriptions of one fact, which is the join this repo has been bitten by four times.**

**Four notes on the classification, so a reviewer can check it:**
0. ⭐ **THE SPLIT-SENTENCE RULE IS USED EXACTLY ONCE, BY M2-1** — the one place a package with no demo
   of its own is chartered `PLAYER`. It is defended in M2-1's own charter, its co-packages
   (M2-2/M2-3/M2-4) are chartered rather than promised, and **the demo is named and owned by M2-3**.
   ⚠️ **If a second package ever claims this rule, that is the signal it has become a loophole**, and
   the reviewer should refuse it. *(Recomputed in revision 1: relabelling M2-1 `INFRASTRUCTURE` takes
   M2 to 4 of 15 against a cap of 3 — a refusal requiring a named owner override. That is the
   arithmetic the rule is load-bearing against, and it is stated so nobody has to redo it.)*
1. **Design packages are INFRASTRUCTURE** (M3-1, M4-1). Their deliverable is a document; they have no
   demo, and giving them a fabricated player sentence is the exact failure §6 exists to stop.
   ⭐ **REVISION 2 DELETED ONE OF THEM (M2-7) BY MEASURING ITS QUESTION**, which is the cheapest way a
   budget slot has ever been returned in this project. ⚠️ **Before chartering a design package, ask
   its question of the running sim.** *"There is no precedent for X"* is a statement about what
   someone has read, never about what the engine does.
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
| `sim/Sim.Gen/AuthoredShips.cs` | **M1-A** (in flight), M2-11, M3-6, M3-11, ⭐ **M2-1 (CONDITIONAL)** | ⛔ **Strictly serialized.** M1-A owns it now. ⭐ **REVISION 3 — ONE conditional claimant, and its condition is a decision not yet taken: M2-1 claims this file only if owner batch item 8 resolves to (b)**, fixtures authored all-on. ⚠️ **A conditional claim is still a claim** — recorded so the integrator is not surprised by a lane that was supposed to touch only `Citizen.cs`. ✅ *(M2-20 was listed here in this revision's first draft and is **withdrawn**: the wreck's boot pawn is already `AutoWander = true` at `:1936-1941`, verified, so the package needs no content change. A conditional claim that resolves to "no claim" is deleted, not left standing as insurance.)* |
| `sim/Sim.Core/Jobs/JobSystem.cs` | M2-2, M2-5, M2-8, **M2-19** | ⛔ **Strictly serialized.** Integrator-reviewed by its own doc comment. *(M2-19 added in revision 3 — its own charter names `JobSystem.cs` under CONFLICTS and the matrix had not recorded it.)* |
| `sim/Sim.Core/Entities/Citizen.cs` | M2-1, M2-2, **M2-19** | M2-1 first, alone. *(M2-19 added in revision 3 — it lands `HeldByOrder`'s reader on the type whose storage M2-1 ships.)* ⚠️ ⭐ **And a standing refusal, recorded where a lane will be tempted by it: `IsRecruitableForWork` (`:103`) MUST NOT absorb the work grid.** See M2-2's SEAM. |
| `Simulation.cs` / `SaveWriter.cs` / `SaveReader.cs` | M2-1, M2-8, M3-2 | ⛔ **SPINE — integrator lane only, one at a time.** |
| `hosts/web/GameSession.cs` | M1-D, M1-E, M2-4, M2-6, M2-9, M2-18, ⭐ **M2-20** | ⛔ **Serialize.** ⚠️ *This file is the single largest merge hazard in the quarter — **seven** claimants after revision 3, and the merge that broke `DeviceCell` was a silent auto-merge on a field list, not a conflict git flagged.* ⭐ **AND M2-20 + M2-6 BOTH WRITE PROSE INTO ONE BUILDER (`TaskLabel`, `:2556`, `default:` branch at `:2622-2632`)** — the shape no delta gate can catch, because two different lanes each produce a perfectly valid string. **M2-20 owns the vocabulary; M2-6 consumes it.** |
| `hosts/web/WireFormat*.cs` | M1-D, **M1-E**, M2-4, M2-9, M2-18 | ⛔ **SPINE — integrator.** New channels go in **new `partial` files** (`WireFormat.cs` should have a zero diff). *(M1-E was missing from revision 0's matrix; it may add a refusal reply code to `WireFormat.Operate.cs`.)* |
| `client/src/ui/overview-view.js` | **M1-B** (in flight), M1-C, M1-F, M2-3, ⭐ **M2-20** | M1-B first; the rest rebase onto it, then serialize. ⚠️ **M2-20 amends the `:701-708` comment IN PLACE** — a lane that deletes it has removed the record of a decision, not a stale note. |
| `client/src/ui/roomzoom-view.js` | M1-C, M2-10, ⭐ **M2-20** | Serialize. *(M2-20 touches the task line at `:700` — the second surface of one vocabulary.)* |
| ⭐ **`client/src/ui/onboarding.js`** | **M1-B**, **M2-20**, M4-5 | ⭐ **New row (revision 3).** M1-B fixed the factually-wrong `B` row; **M2-20 adds the FIRST ORDER**; M4-5 is the full content rewrite. ⛔ **Serialize, and M4-5 must not restore what M2-20 added** — the same instruction the `panels.js` row carries for M1-F ↔ M4-3, and for the same reason. |
| `client/src/input/controls.js` | **M1-B** (in flight), M1-C | M1-C rebases onto M1-B. |
| **`client/src/ui/panels.js`** | **M1-F**, M4-3, M4-4 | ⭐ **New row.** M1-F removes the MORALE meter (`:313-315`) and corrects the REAL/SAMPLE ledger (`:219`); M4-3/M4-4 rewrite the same card. **M1-F lands first and M4-3 must re-read the ledger, not restore it.** |
| **`client/src/ui/hud.js`** | **M1-F (declines it)**, M4-8 (WP-9) | ⭐ **New row, and it exists to record a DELIBERATE non-claim.** `hud.js:951-953`, `:981-984`, `:1008` still draw morale. M1-F leaves them: the shell is **closed to new work** and `TABLE_CELLS` sits inside an equality-pinned widget census. **They die with WP-9 at M4-8.** ⚠️ Written down so a future reader can tell *"excluded"* from *"missed"*. |
| **`tests/Perilune.Tests/BlockedChannelTests.cs`** | **M1-A** (semantically), M1-D, M1-E, M2-18 | ⭐ **New row — FOUR claimants and revision 0 had none.** It carries a **named tripwire** at `:351` and `:412`: *"they are UNEXPLORED at tick 0 and so fog-gated off this channel. **If boot fog ever changes, this assertion is the tripwire and the fix is to exclude them by name, not to weaken it.**"* M1-A changes boot fog. It also carries `:794-811`, the pin that `ReasonNoConsumable` is **never emitted** — **M1-E must leave it passing; M2-9 flips it.** ⛔ **Serialize, and re-derive every row count from the MERGED tree.** |
| `client/test/surface-boundary.test.js` | M1-C, M2-3, M2-4, M2-10, M4-2 | ⚠️ **Every claimant moves an equality-pinned census.** **Re-derive the number from the MERGED file with the shipped `codeOnly` stripper; never adjust either branch's figure.** |
| `sim/Sim.Core/Jobs/*` (sources + `IJobSource`) | M1-D, **M2-21**, M2-2, M2-5 | ⭐ **New row (revision 2); FOURTH CLAIMANT ADDED IN REVISION 3.** M1-D mirrors `IsBackedOff` onto three sources; ⭐ **M2-21 stamps a backoff in `BuildJobSource`'s phase A and CONSUMES M1-D's mirrored query — it must not invent a second predicate (§12.11)**; M2-2/M2-5 edit `TryAssign` and `HandledKinds` consumers. **Serialize — all four are integrator lanes, M1-D first, M2-21 second.** |
| `sim/Sim.Core/Systems/CraftingSystem.cs` | **M1-H**, ⭐ **M1-I**, M2-2, M2-5, M2-19 | ⭐ **New row (revision 2); FIFTH CLAIMANT ADDED IN REVISION 3.** M1-H adds the backoff at ten `Abandon` sites; ⭐ **M1-I adds `CanStageWorkerAt` at `:492`**; M2-2 vetoes at `:475`; M2-5 adds the arbitration query at `:164`; M2-19 checks the hold at `:475`. ⛔ **FIVE claimants on one recruiter — strictly serialize; M1-H first, M1-I immediately behind it or folded into it.** ⚠️ **Three of the five edit `FindNearestIdle`'s loop body within a few lines of `:475`**, which is precisely the silent-auto-merge shape that produced the `DeviceCell` field-list defect. |
| `sim/Sim.Core/Systems/MachineWearSystem.cs` | **M1-H** (if generalised), M2-2, M2-5, M2-9, **M2-12** (reads `IsUnfixableWreck`), M2-19 | Serialize. ⚠️ ⭐ **REVISION 3: `MachineWearSystem.cs:567-579` is M1-I's REFERENCE IMPLEMENTATION — M1-I copies its shape into `CraftingSystem` and does NOT edit this file.** A non-claim, recorded so a future reader can tell *excluded* from *missed*. |
| `CLAUDE.md` / `MECHANICS.md` / `HANDOVER.md` | M1-G and **every re-pin commit** | ⛔ **Integrator only.** Land M1-G in a quiet window between pin-chain rows. |

### ⭐ THE COUPLINGS GIT CANNOT SEE — named, because a clean auto-merge is not a clean merge

| pair | the shared thing | what it costs if ignored |
|---|---|---|
| **M1-A ↔ M1-D** *(merge positions 1 and 3)* | `TileFlags.Explored` at boot. Every `blocked` row is fog-gated on it (`GameSession.cs:2311`). | **No shared file.** M1-D's tests and its browser acceptance can pass on its own branch and be wrong in the merged tree. ⇒ **M1-D re-runs both after M1-A merges and says so in its merge note.** |
| **M1-A ↔ M1-E** | same | same |
| **M1-A ↔ `BlockedChannelTests.cs`** | the boot-fog tripwire at `:351`/`:412`, about `--ship grid` | If M1-A generalises the fog rule, both go red. **The fix is the test's own: exclude the grid designations by name. ⛔ Never weaken the assertion.** |
| **M1-E ↔ M2-9** | `BlockedChannelTests.cs:794-811` | M1-E must leave `ReasonNoConsumable` **un-emitted and pinned**; M2-9 flips the same pin. If M1-E emits it, it has silently taken M2-9's package. |
| **M2-2 ↔ M2-5** | `TryAssign`'s veto and its band loop are the same lines | Both are integrator lanes on the file whose own header says it is *"the only file in the job system the integrator reviews."* |
| ⭐ **M2-20 ↔ M2-6 ↔ M2-18** *(NEW IN REVISION 3)* | **ONE VOCABULARY FOR "THIS PAWN IS DOING NOTHING", across three packages and two surfaces.** M2-20 owns the words; M2-6 adds the ranking clause to the same `TaskLabel` string; M2-18 says the tile-side half (*"nobody aboard is assigned that work"*). | **No conflicting lines — they conflict on MEANING, which git cannot see at all.** Three packages describing one player confusion is how a repo acquires two names for one predicate (`IsBackedOff`, `codeOnly`, the two `NON_FURNITURE` sets). ⛔ **M2-20 lands first; the other two consume it. A reviewer of M2-6 or M2-18 must check that no third word was invented.** |
| ⭐ **M2-2 ↔ EVERY MEASUREMENT FIXTURE** *(NEW IN REVISION 3)* | **Not a file — a precondition.** From M2-2 onward `--ship slice`, `--ship grid` and the scenario ship boot with **no work enabled**, so anything driven unattended measures a ship where nobody works. | **`A1 = 0.000 %` becomes both the correct output AND the broken-harness output**, and `A1 = 0.000 %` on grid is already the measured post-E0 result — so the two causes are confusable by construction. ⛔ **Every occupancy number quoted after M2-2 must state the grid its crew had**, and M2-17 carries the non-vacuity check. ⚠️ **This is why M2-21 merges at 7b: it needs a fixture that still works.** |
| ⭐ **M1-H ↔ M1-I ↔ M2-21** *(NEW IN REVISION 3)* | **One structural asymmetry in three costumes** (§12.14): two claim paths that refuse without recording the refusal, and one staging path that never asks. | Landing any one alone leaves a defect that *looks* fixed — **M1-H without M1-I gives a pawn who backs off politely from a bench she could never have used.** ⛔ **Measure the three against one another**, and if `lane/craft-thrash` has not passed review, **fold M1-I into it.** |

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
⭐ **REVISED IN REVISION 2: `lane/spike-dispatch` has LANDED and its slot is taken by `lane/craft-thrash`
(M1-H)** — the live `main` defect the spike found.

| # | lane | package | why tonight |
|---|---|---|---|
| **1** | **`lane/craft-thrash`** | **M1-H — the `Craft` thrash** | ⭐ **NEW IN REVISION 2, and it takes the landed spike's slot.** A pawn burns **33 % of all crew-ticks** in a 30-tick recruit→abandon loop **on `main` today**, and it is invisible only because the maintenance monopoly absorbs the pawn — **which the grid stops doing on day one.** ⛔ **It is PIN M1-a and must precede M2-1**, so starting it tonight is what keeps the chain from stalling in week 3. Seam is exact: `CraftingSystem.cs`'s ten `Abandon` sites have **no backoff**, while every `IJobSource` has stamped one since W0-4. |
| ~~1b~~ | ~~`lane/spike-dispatch`~~ | *(original charter, kept for the record)* **M2-0 — the R1 spike** | ⭐ **The highest-information hour available.** It answers the single largest uncertainty in the quarter (*is M2's dispatch rewrite three days or three weeks?*), it sizes M3/M4/M5, and it also settles M2-5's equal-band decision — the thing that determines whether M2-5 joins the pin chain. It is a **throwaway branch that never merges**, so it collides with nothing and can run beside everything. ⚠️ **Leg A is mandatory; without it the spike is uninterpretable, and the version without it returned a FALSE PASS.** |
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

> ### ⭐ REVISION 3 — WHAT THE "DO NOT START" LINE NOW MEANS, AND ONE ADDITION
>
> M2-0 has landed, so *"wait for the spike's answer"* is discharged. ⛔ **`lane/work-state` (M2-1) is
> now blocked on a DIFFERENT thing: OWNER BATCH ITEM 8** — whether the measurement fixtures inherit the
> OFF default or are authored all-on. **That answer changes M2-1's file list (it may claim
> `AuthoredShips.cs`) and the shape of its pin move.** Starting it before the item is answered *or has
> defaulted to its recommendation after three days* means measuring a pin twice.
> ⭐ **AND TWO LANES BECAME STARTABLE IN REVISION 3, both because they are live `main` defects
> independent of every M2 decision:** `lane/craft-staging` (**M1-I**, behind or folded into M1-H) and
> `lane/build-haul-backoff` (**M2-21**, behind M1-D). ⚠️ **Both are pin-chain rows, so neither runs
> concurrently with another pin mover** — and **M2-21 must be measured before M2-2 turns the fixtures
> inert.**

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

**12.14 ⭐ THE TWO PUSH RECRUITERS ARE HELD TO NONE OF THE DISPATCHER'S CLAIM CONTRACT.**
`grep -n "RetryTicks\|_retryAt\|backoff" sim/Sim.Core/Systems/CraftingSystem.cs` and the same over
`MachineWearSystem.cs` **both return nothing.** Every `IJobSource` stamps
`JobWork.UnreachableRetryTicks = 50` on a refused candidate (`DigJobSource.cs:107`,
`DeconstructJobSource.cs:147`, `BuildJobSource.cs:210`/`:223`, `HaulJobSource.cs:311`/`:543`), and the
dispatcher **throws** at a source that does not, calling it *"a SILENT HANG — no exception, no log,
the sim just stops advancing"* (`JobSystem.cs:259-272`). ⇒ **`CraftingSystem` and `MaintenanceSystem`
recruit outside that contract and are bound by none of it**, which is the root cause of §0.1's
33 %-of-crew-ticks thrash. ⚠️ **This is the same structural asymmetry that makes M2-5 a five-site
problem rather than a dispatcher problem, and M1-H a prerequisite rather than a nice-to-have — one
gap, three consequences.**

**12.13 A SHIPPED SOURCE COMMENT CARRIES A STALE LINE NUMBER, AND M5-6'S IMPLEMENTER WILL FOLLOW IT.**
`client/src/ui/roomzoom-view.js:1087` says *"`sim/Sim.Core/Systems/DeconstructSystem.cs:345` is
`return device.Kind != DeviceKind.Door;`"*. **`:345` is now a doc-comment line about `CryoPod`**; the
actual refusal is `:378`, `if (device.Kind == DeviceKind.Door) return false;`. The comment's *claim*
is still true and its *citation* is not — fix the citation inside M5-6 rather than filing it.
⚠️ *This is the shape the repo has hit repeatedly: **a package's code can be right and its
justification false.** A line number is part of the justification.*

---

### ⭐ ADDED IN REVISION 3 — verified against `main` @ `ac6a17c`, not against `72fbca4`

**12.15 ⭐ `CapabilityComputer.cs:70-76` IS A FIFTH GATE AND NO REVISION HAD NAMED IT.**
`EffectValidator.cs:141` writes `JobKind.Dig` from the LLM `AgreeTask` effect, and the *mirror* that
decides whether that capability is **offered to the model at all** lives at
`sim/Sim.Core/Effects/CapabilityComputer.cs:70-76` — its own comment reads
*"mirrors the EffectValidator gate (wander path doesn't veto)"*. ⇒ **Gating only `EffectValidator`
ships a crew member who AGREES IN DIALOGUE to work the player forbade and then does nothing** — the
defect the 2026-07-21 playtest round closed under *"crew no longer promise physical work they cannot
do"*. ⚠️ **Both halves also share a real hole today:** their only idleness test is
`EffectValidator.cs:110` `if (citizen.JobKind != JobKind.None) return false;`, which **never consults
`IsRecruitableForWork`**, so **a `HoldPosition` pawn can be given a dig by conversation.** *(That is a
pre-existing defect, not one M2 creates; M2-2 closes it as a side effect and should say so rather
than claim it.)*

**12.16 ⭐ `CraftingSystem` IS THE ONLY WORKER-STAGING SITE IN THE SIM THAT DOES NOT ASK
`WorksiteSafety.CanStageWorkerAt`.** Full census of the predicate's call sites in `sim/`:
`JobContext.cs:80`, `MachineWearSystem.cs:541`, `MachineWearSystem.cs:573` — **three, and
`CraftingSystem.TryFindStagingTile` (`:487-498`) is not among them.** ⚠️ **Two shipped comments state
the census correctly and neither is a bug report:** `JobContext.cs:64` says the rule *"is asked here
and NOWHERE ELSE in the job board"* and `MachineWearSystem.cs:553-554` calls itself *"the second and
last"*. **Both are true — `CraftingSystem` recruits outside the job board.** ⇒ **Chartered as M1-I.**
*(This is §12.14's asymmetry producing a third consequence, and §0.1's tick-0 claim on `machineshop_1`
is what it looks like in play.)*

**12.17 ⭐ `HaulJobSource.cs:365` IS AN IN-JOB TRANSITION, NOT A CLAIM — and the distinction becomes
load-bearing the day the work grid ships.** `JobKind.HaulDeliver` is set inside `Progress`, so a pawn
who picked up a stack under `Haul` enabled reaches delivery through **no gate**. Under OD-H the player
toggles work types constantly, so *"switch Haul off while she is carrying something"* is a day-one
gesture. **RULING in M2-2: the veto is CLAIM-TIME; a running job completes**, and the ruling carries a
negative leg so that *"we decided"* and *"we missed it"* are distinguishable in a diff.
⚠️ **The same question exists for `BuildJobSource.cs:263` (`HaulToBuild`) and is NOT the same answer**
— that one *is* inside `TryClaim` (`:194`), so it is gated. **Two adjacent-looking sites, two
different classifications; census, do not pattern-match.**

**12.18 ⚠️ THIS DOCUMENT'S OWN §9 PROSE DISAGREED WITH ITS OWN §9 TABLE FOR TWO REVISIONS.**
The table read **51 packages / 5 infrastructure**; the sentence beneath it read *"charters 50 and 6"*.
It survived revision 2 and an independent review. **Corrected in revision 3 to 54 and 5, re-counted
row by row from the merged tree.** *(§13.11 and §13.8 in one: a count in prose and a count in a table
are two transcriptions of one fact.)*

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
