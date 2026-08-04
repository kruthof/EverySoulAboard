# PROCESS — how a session works here

*Written 2026-07-29 from the owner's audit of two weeks of agent work. The audit's verdict:
agents did not invent an agenda, but they chose the METRIC, and the metric chose the work —
44% of lifetime commits went to test/guard churn against 6% for `sim/Sim.Core`, while the
owner's named first-class input (work priorities) was deferred three times. This file exists
so that never happens again. It is short on purpose. Follow it.*

## 0. The optimization target (what replaces every metric)

**We do not optimize metrics. We optimize toward the target game** (`docs/TARGET.md`):
RimWorld's colony loop first, then the MOSS automation layer on top. A package is chosen
because it moves a checklist row in `docs/TARGET.md` §3 or a milestone gate in
`docs/ROADMAP.md` — never because it improves a number. The only numbers with standing:

- **`./ci.sh` exit 0** (the gate) and the **five determinism pins** (`CLAUDE.md` table).
- **Milestone exit gates** — always phrased as something a *player does* ("order a repair,
  the lights come back"), verified by playing/driving the actual game, never by a proxy
  statistic. A1 is retired; any utilization/busyness number is a regression statistic only
  and is never quoted without throughput beside it.

## 1. Session lifecycle

**Start (5 minutes, not more):**
1. Read `CLAUDE.md` (auto-loaded), `docs/HANDOVER.md` (short now — read all of it),
   and the `docs/ROADMAP.md` row you're about to work.
2. `git worktree add ../perilune-wt/<lane> -b lane/<lane>` — ALWAYS, even for docs.
3. Re-measure anything you're about to quote (test counts, pins, censuses). A number in a
   doc is only true of the tree it was measured on.

**Work:** one package per lane. The session instance ORCHESTRATES ONLY (binding owner
authorization, 2026-07-25): implementation runs in an **Opus 5 subagent**; every artifact
it produces is reviewed by a **separate, independent subagent** (fresh context, none of the
implementer's reasoning) before merge. Send-backs go back to the implementer; the
integrator re-verifies the fix in the tree. Review is scoped to **code seams, not art** —
the owner judges art from browser screenshots.

**End (the handover ritual — this is how the next session starts fast):**
1. Update `docs/HANDOVER.md`'s **Current state** block — REWRITE it, don't append. Hard cap
   ~120 lines. Move anything no longer current to `docs/history/HANDOVER-archive.md`
   (rolling; the frozen pre-restructure record is `docs/history/HANDOVER-2026-07.md`).
2. Append ONE line to the HANDOVER session log table: date · lane · what a player can now
   do that they couldn't · gate result — **ending with `rows:` — the TARGET §3 rows /
   ROADMAP gates the session moved, or the word `none`** (see §2, "drift is disclosed").
3. Update `docs/TARGET.md` checklist rows and `docs/ROADMAP.md` package status that your
   merge changed. If a pin moved: `ci.sh` + `CLAUDE.md` pin table + `MECHANICS.md` + memory
   in the SAME commit (the hash-move ritual).
4. New durable lessons go to `docs/TRAPS.md` (full prose) + one index line in `CLAUDE.md`
   ONLY if they cost real work and will recur. Not every finding is a lesson.

## 2. Scope discipline (the anti-rabbit-hole rules)

- **The lane-selection gate (2026-08-04 — owner-directed drift check).** Before a lane
  starts, write three one-line answers into its charter or HANDOVER entry:
  (1) which `TARGET.md` §3 row or `ROADMAP.md` gate it moves — or which VERBATIM owner
  sentence directed it; (2) the player sentence (an INFRASTRUCTURE lane instead names the
  row/gate it unblocks, by id); (3) whether the next milestone's human gate would notice.
  A lane that answers none of the three is META-WORK — rig hardening, guards about guards,
  DOM tests for shipped affordances, renames, harness witnesses are meta-work by default —
  and meta-work never runs as its own lane: it rides inside a lane that does answer, or it
  stays filed. Owner triage can override; nothing else can.
- **Drift is disclosed, not discovered.** Every session-log row ends with `rows:` — the
  TARGET §3 rows / ROADMAP gates moved, or `none`. A `none` session is legitimate only
  when owner-directed (triage, playtest prep, a ruling batch). After TWO consecutive
  `none` sessions, the next session MUST take the topmost unmerged ROADMAP row — no
  candidate-lane shopping. The HANDOVER open lists are an ARCHIVE, not a queue: in the
  handover ritual, a ★ finding neither owner-triaged nor promoted within three sessions
  moves to `docs/history/`, and the "candidate small lanes" list may only contain lanes
  that pass the three-question gate.
- **A package delivers a player-visible outcome.** If you cannot write the outcome as one
  sentence a player would notice, the package is not ready to implement — take it back to
  the roadmap.
- **Sub-questions get filed, not chased.** Anything discovered mid-package that is not
  required for the package's outcome goes into HANDOVER's OPEN list as one line. It does
  not grow the package. The integrator triages the OPEN list against the roadmap; it is
  not a work queue that self-executes.
- **Found a defect?** File it (one line, where, evidence). Fix it only if it blocks the
  package's outcome or the owner asked. "SHIP IT FILED" is an owner-approved state.
- **Design questions belong to the owner.** If a package needs a decision the docs don't
  hold (a default, a mechanic's shape, content), check `docs/design/rimworld-reference.md`
  first — for mechanisms, RimWorld's shape IS the decision (binding, 2026-07-29). If
  RimWorld doesn't answer it, write the question in HANDOVER "OPEN ON THE OWNER" and pick
  the smallest reversible interim. Never resolve an open owner decision by implementing.
- **Time-box instrumentation.** Building a measurement harness is justified only when the
  package's exit gate needs the number. A harness gets its own non-vacuity check (it must
  detect a planted failure) and no more investment than that.

## 3. Test discipline (where the two weeks went)

The repo's test culture caught real bugs — every trap in `docs/TRAPS.md` earned its place —
but the audit shows the marginal guard now costs more than it saves. The rules:

**A package writes these tests, and only these:**
1. **The outcome test** — drives the sim/UI and asserts the package's player-visible
   outcome happened. Driven, never scanned. This is the test that matters.
2. **The contract tests the invariants demand** — new hashed field ⇒ save + hash +
   round-trip in the same commit; new def field ⇒ the one-commit def ritual; new wire
   channel ⇒ a consumer in `client/src/main.js` (existing guards enforce these).
3. **Named-mutation verification for anything load-bearing** — physically apply the
   mutation, watch it go red for the right reason, revert from an in-memory copy. If you
   name it, you run it. If you don't need to name it, don't write the guard.

**A package does NOT write:**
- Guards against hypothetical future regressions nobody has made yet.
- Text scans where a driven assertion is possible (and if a scan is unavoidable, use the
  shared `codeOnly` strippers + a negative control — see TRAPS 1).
- New metrics, new harness legs, new census pins "while we're here".
- Tests of a sibling package's behaviour (file an OPEN line instead).

**Review send-backs are for defects in the package's claim**, not for demanding more
guards. A reviewer who wants an extra guard files it as an observation; the integrator
decides. (Measured: review is ~22% of spend and the fastest phase — keep it, keep it
scoped.)

## 4. Merging (the short version — full detail in TRAPS 8)

1. In the lane: merge `main` INTO the lane, run the FULL `./ci.sh`, then merge `--no-ff`
   to main (or use `/merge`). A clean auto-merge is NOT a clean merge.
2. Re-derive every censused number from the merged tree.
3. Counts are a UNION, not a sum — re-measure, never add.
4. Spine files (`Simulation.cs`, `SystemStack`, save chapters, `GlyphColor`, `WireFormat`,
   `Commands`, `CitizenEffect`) change only through the integrator lane.

## 5. Where things go (so docs stay lean)

| what | where |
|---|---|
| What the game is + mechanism checklist | `docs/TARGET.md` |
| What to build next, package queue | `docs/ROADMAP.md` |
| Current state, OPEN lists, session log | `docs/HANDOVER.md` (capped; overflow → `docs/history/`) |
| How the sim behaves as implemented | `docs/MECHANICS.md` (file:line cited) |
| RimWorld's actual mechanisms | `docs/design/rimworld-reference.md` |
| Process lessons with receipts | `docs/TRAPS.md` |
| Finished lane records, retired programmes | `docs/history/` — never load-bearing, never read at session start |

The doc set a fresh session must read is `CLAUDE.md` (auto-loaded) plus its "Read first"
three: `HANDOVER.md`, the `ROADMAP.md` row (+ its packages.md charter), `TARGET.md`.
Everything else is looked up on demand. Keeping those lean IS part of every merge — a
session that leaves HANDOVER over its cap has not finished.
