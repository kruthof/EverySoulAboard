# TRAPS — the full ledger of testing/process failures that cost this project real work

*Split out of `CLAUDE.md` on 2026-07-29 so the always-loaded file stays lean. `CLAUDE.md`
keeps the one-line index with the SAME NUMBERING — test comments cite "CLAUDE.md trap 3" or
"the fifth trap shape", and those numbers are stable here. ⚠️ Disambiguation (an inherited
collision, not a renumbering): some shipped test comments say "trap N" while describing the
**Nth SHAPE** (e.g. `DevicesDeltaTests.cs:52` "trap 4" = the 4th shape; `IceChainMemoTests.cs:29`
"trap 5" = the 5th shape) — when a citation's description doesn't match Part A, check Part B.
Every entry below shipped a green gate over a broken claim at least once, and each was
rediscovered at full cost.*

**The one-sentence summary of the whole file: a mutation you only *described* is not
evidence. Physically apply every mutation you name, watch it go red for the RIGHT reason,
and revert from an in-memory copy.**

---

## Part A — the five numbered traps (cited as "CLAUDE.md trap N")

### Trap 1 — a raw-text guard is satisfied by the thing it guards against, commented out

A test that greps source for evidence of a fix passes when the fix is present **and** when it
sits in a comment. Landed independently in **four packages in one day** (2026-07-25) — CSS, C#,
twice JS. Countermeasure, both halves required:

1. **Strip comments before matching, quote-aware** (a quoted `//` or `/* */` must not blind
   the stripper). Import the shared implementations, never re-derive:
   `client/test/code-only.js` (`codeOnly`, `cssCodeOnly`) and
   `tests/Perilune.Tests/SurfaceBoundaryTests.cs` (`CodeOnly`).
2. **A negative control proving comments do NOT trip the scan** — otherwise the guard fires on
   prose and teaches people to delete explanatory comments. Examples:
   `client/test/surface-boundary.test.js` (several), `SurfaceBoundaryTests.cs:238-253`.

Sub-trap (twice in one day, both caught only by physically substituting a broken stripper):
a negative control for a comment stripper whose fixture has a quoted `/*` but **no later real
comment** is vacuous — the naive stripper finds no match and passes either way. The fixture
must contain a later real comment, and prefer mutating the SHIPPED stripper's own quote branch
over substituting a stand-in.

Related: **a CSS comment is not whitespace** — `.a/*x*/.b` is the compound `.a.b` (CSS Syntax
L3 §4.3.2 emits no token). `cssCodeOnly` still emits a space, for a different, correct reason:
as a text filter, emitting nothing can FUSE identifiers into the very selector a guard
watches (a fabricated false positive), while a space can only SPLIT a token into something
the guard ignores.

### Trap 2 — `git checkout` must NEVER appear in a mutation loop

Cost work twice: once destroying an uncommitted test from an earlier session, once discarding
an agent's own in-flight edits. `git checkout -- <file>` restores the last COMMIT, not the
state you were in.

- The restore source is an **in-memory copy taken before the first mutation** (or a `.orig`
  sidecar outside the repo). Never git.
- Restore with `shutil.copy` + `os.utime`, **never `shutil.copy2`** — `copy2` preserves mtime,
  MSBuild skips the rebuild, and the next `dotnet test` silently runs the PREVIOUS mutation's
  assembly. Presented as a reproducible 3-test regression that passed individually. Delete
  `bin/` + `obj/` when in doubt.
- Same shape in the scenario host: `dotnet build tests/...` then
  `dotnet run --no-build --project hosts/scenario` runs a **stale scenario binary**, so a
  mutation can look inert when it is not.
- **The restore mtime must land NEWER than the last build output** (2026-08-02, hit by THREE
  agents independently in one session — two implementers and a reviewer). Restoring the
  original file with its *original* mtime (`os.utime` to the saved stamp, or `ORIG_MTIME + 1`
  when the mutant was built later) leaves the source OLDER than `bin/`/`obj/`, MSBuild skips
  the rebuild, and the "clean" revert run tests the MUTANT assembly — a false red that reads
  exactly like a real one (the D3 reviewer's first `ci.sh` reported a genuine-looking
  regression this way). Restore with mtime set FORWARD of build outputs (`time.time() + 1`),
  and assert byte-for-byte restoration separately from the mtime.

### Trap 3 — a FALSE RED: a mutation that goes red for the wrong reason

The mirror of every false green, and harder to spot **because red looks like success**.
WP-4's harness substituted an identifier back into a file that no longer imported it; both
mutations died on `ReferenceError` — proving the module cannot load, nothing about the
semantics. With the import restored, one was a genuine RED and **the other was a survivor** a
false RED had been hiding. The insidious part, measured: the crash reddened only 2 tests — a
false RED presents as a small, plausible failure count, exactly like a semantic RED.

1. A mutation must leave the module loadable — restore references it breaks as part of the
   same mutation.
2. The harness must distinguish crash from semantic failure and say so (`!! CRASH`).
3. Sanity-check the failure SET, not just the count.

de-DE corollary (bit three agents in one night, then again as "ninth shape" fuel): this
machine's MSBuild/VSTest output is German. `^ *error CS` never matches (token is mid-line);
failures print `Nicht bestanden:`/`Fehler <Name>`, not `Fehlgeschlagen`. **Test your
harness's parser against a real de-DE line before you believe a red — or a green.** A parser
that matches nothing reports "no failures", which is a green meaning "my instrument is
broken". A measurement harness needs its own non-vacuity check.

### Trap 4 — pinning HOW an API was called: record the argument at the seam, don't scan for it

A source scan for `addEventListener(…, true)` is defeated by a comment, by whitespace, and —
decisively — by the equivalent `{ capture: true }` options form. **A stub that records the
argument at registration and asserts on it is runtime state**: no comment stripping, every
spelling, and it catches a partial regression on one binding of several. Live implementation:
the window stub + phase assertion in `client/test/overview-model.test.js`.

Corollary: **if a harness cannot model the thing your guard needs to see, fix the harness**
(`client/test/dom-lite.js` gained event phases for exactly this reason — dispatched with ONE
shared event object across capture/target/bubble).

### Trap 5 — shell traps that produce findings out of nothing

- An unquoted `$flags` in a zsh loop made three "stockpile" measurement legs run **flagless**;
  baseline-identical output that looked like a real finding.
- A grep with no non-vacuity check: assert your matcher matches *something* before believing
  it matched nothing.

**Addendum (2026-08-03, session E — five agents on one shared box, three shapes in one day):**

- **A waiter that can find itself never exits.** `until ! ps aux | grep -q '[c]i.sh'` and
  `pgrep -f "<lane>/ci.sh"` both matched the WAITER'S OWN command line — the `[c]` bracket
  trick defeats *grep finds itself*, not *the waiter finds itself*. Cost: two agents read
  ~15-min hangs as running gates; one queued gate never started. **Wait on a PID
  (`while kill -0 $pid`) or a sentinel line in a log — never on a pattern your own argv
  contains.** Sibling: a stale `--filter` after a test RENAME returns exit 0 — a filter
  matching nothing looks exactly like a pass; re-check the filter after every rename.
- **A broad `pkill -f` is an attack on every other agent on the machine.** Twice in one
  session (`pkill` on a test-host pattern; `pkill -f "hosts/web"`) an agent killed a
  SIBLING lane's process mid-run — one hit a reviewer's gate, one hit a verification rig's
  host. The victim's failure reads as ITS OWN flake. **Kill only PIDs you recorded when
  you spawned them; use dedicated ports; never a pattern that can match someone else's
  process.**
- **A leaked headless Chrome fails SOMEBODY ELSE'S gate as an OOM `SIGKILL` (exit 137)**
  that reads exactly like a test-suite crash — trap 3's family (red for the wrong reason),
  one process boundary removed. `process.on('exit')` does not fire on SIGINT/SIGTERM, so a
  Ctrl+C'd rig still leaks. Related: SIGINT does not stop a detached web host (no tty ⇒
  `CancelKeyPress` never fires) — the next host on that port dies `HttpListenerException
  (48)`, or worse, a rig silently talks to the PREVIOUS, poisoned host. **SIGTERM + poll
  the port free before starting the next.**

---

## Part B — the trap SHAPES (cited as "the Nth trap shape")

Numbered in discovery order; the ordinals are load-bearing in test comments.

### 4th shape — a guard whose SCOPE FILTER excludes the violation

E0-8's guard found systems by scanning for `": ISimSystem"`; the violation was a plain helper
called from `DirectorSystem.Tick`. The ledger was on the tick path and the guard was green.
**Non-vacuity by population count proves the matcher matched something, never that it would
match the thing. Make non-vacuity an INCLUSION test — plant a known violation and require it
be caught.**

### 5th shape — `assert` throws, so only the FIRST leg of a multi-leg test reports

A test named for two guarantees ("deck AND rect") reports only its first failing leg. A second
leg that cannot bite is indistinguishable from one that can. **Run each leg with the others
blinded and require each to fire on its own.** A fixture must carry BOTH failure shapes (e.g.
a wrong-deck row on a free tile AND on an occupied tile — the second is caught only by the
aggregate; a fixture with only the first misses the fold).

### 6th shape — a predicate over "what a glyph resolves to" is defeated by SUBSTITUTION

`GLYPH_SUBSTITUTE` exists so a device can wear another piece's art; one entry maps a Light
onto a COSMETIC row, so "is the piece skinning this glyph functional?" misclassified every
lamp and dropped the click — with the suite green before AND after the fix. **A substitution
means the borrowed row's `kind` is not a fact about the tile: ask what a piece is NOT, never
what it is.**

### 7th shape — a suite of RATIO assertions cannot see a SCALE error

E0-9 existed to fix a 2× error; review mutated `DaysOfFood` to over-state by exactly 2× and
the FULL gate stayed green. Ratios are scale-invariant; the one absolute pin (`> 0`) survived
because half of an inflated claim IS the true runway. **Only a PROPORTIONAL floor can pin
scale.** Countermeasure: the four-cell inclusion table, whose decisive cell is
*mutation + assertion regressed → GREEN* (proving nothing else in the suite sees it). Also:
the implementer had DISCLOSED the survival but filed it as a preference about mutation choice
— that reframing is the thing to catch in your own work.

### 8th shape — a merged file's truth is a number NEITHER lane could compute

Two lanes re-counted the same census honestly against the tree each could see; both wrote 4,
the merged file held 5. git reported NO CONFLICT on the counted file. **Re-derive every
censused number from the MERGED file with the shipped `codeOnly` stripper; treat "nothing
calls this yet" as a statement about a TREE, which a merge changes.**

Companion hazards from the same merge — git's conflicts were the safe part:
- A field list **auto-merged silently** (one lane appended a 7th element, the other added
  `SameAs`), leaving a delta gate that ignored `Open` — a door toggle would stop
  re-serializing, suite green. Caught by hand; verified by mutation (removing the clause
  reddens five independent guards).
- Positional parsers asserting a six-element tuple went red and were RIGHT to — fix the width
  and the parser together, never the width alone.
- Two wear models became two contracts (`roomDeviceConditions` gained `open`,
  `deckDeviceConditions` did not) — caught by a shape-parity assertion.
- Two lanes adding the same exported name (`cssCodeOnly`) at different offsets: NO CONFLICT,
  a SyntaxError module, and the two implementations differed in 7/10 behaviours with neither
  a superset. Resolve by measuring both against a case table; re-run BOTH parents' negative
  controls against the survivor.
- Two lanes fixing the same function differently merge textually and are wrong together
  (E0-6/E0-7 in `DefsParser`): deleting one lane's guard left its own test green. **Git's
  conflict markers are the floor, not the ceiling — after any multi-lane merge, merge `main`
  back into the lane and re-run the FULL gate before trusting the auto-merge.**

### 9th shape — a correct finding that NARROWS an instrument creates a blind spot

M1-C correctly measured that all deck-0 debris is in halls and correctly adapted its browser
rig — which is exactly why the rig never landed on a room rect, where its one live bug was
(the erase toast suppressed inside every room, three written claims saying otherwise).
**A ship-shape finding that narrows an instrument must be followed by asking what the
narrowed instrument can no longer see.** Same night: a guard structurally unreachable in the
node harness (it read `isPaused()`, whose only writer needs console ids the rigs lack — it
survived deletion because it could never run).

---

## Part C — standing verdicts to reuse (not new shapes, but rules with receipts)

- **Verb parity is NOT sufficient** (three times): a verb can be present and INERT. Port a
  verb's PARAMETERS and FEEDBACK in the same package, and pin the seam by driving it, not by
  scanning for its signature.
- **Invisible feedback is FUNCTIONAL** (cost three owner reports): a designation the player
  cannot see is indistinguishable from a broken verb. Verify in the running game.
- **A def field pinned only by the checksum is NOT pinned** — `Is.EqualTo(the field under
  test)` is self-derivation. Every def scalar needs a behavioural consumer test.
- **A hand-maintained id→implementation join is invisible when wrong** — derive joins from
  the registry/naming convention, with the pristine set as a non-vacuity floor.
- **A count you did not measure yourself is not evidence, even from CLAUDE.md** — test
  counts, censuses and pins are only true of the tree they were measured on. Re-measure.
- **A package's code can be right and its JUSTIFICATION false** — 4 of 5 required fixes on
  one lane were prose. Check the argument beside the diff, especially any `max`/`min` used
  across kinds (max is valid for a `>` bound, invalid for a `<` bound).
- **A1's five costumes**: a busyness metric scored a livelock producing zero services at 91%
  busy, "passed" on identical throughput, and sampled trough hours. Never quote a utilization
  number without throughput beside it. (A1 itself is retired as a goal — regression statistic
  only.)
