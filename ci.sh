#!/bin/sh
# PERILUNE CI gate — the full no-Unity verification ritual.
# Usage: ./ci.sh   (from the repo root; dotnet SDK expected at ~/.dotnet)
set -eu
DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
cd "$(dirname "$0")"

echo "== tests =="
"$DOTNET" test tests/Perilune.Tests --nologo

# hosts/web is the SHIPPING host but nothing else here compiles it: the test csproj pulls in only
# WireFormat/GameSession/ConversationHub, and the smokes below run tui + scenario. A compile error
# in Program.cs (backend chain, boot wiring) used to sail through a green gate. Seconds to close.
echo "== hosts/web builds =="
"$DOTNET" build hosts/web/PeriluneWeb.csproj --nologo -v q > /dev/null

echo "== client render tests =="
if command -v node >/dev/null 2>&1; then
  node --test "client/test/*.test.js"
else
  echo "node not found — skipped"
fi

echo "== TUI dump smoke =="
"$DOTNET" run --project hosts/tui -- --dump --days 1 --metrics > /dev/null

echo "== determinism proof (seed 42, 3 days) =="
OUT="$("$DOTNET" run --project hosts/scenario -- --days 3 --seed 42)"
printf '%s\n' "$OUT" | tail -3
printf '%s\n' "$OUT" | grep -q "twin hashes MATCH" || { echo "FAIL: twin hashes diverged"; exit 1; }
# ⛔⛔ D1/D6 (2026-08-02) DID NOT MOVE THIS LITERAL, AND THE HOLD IS VACUOUS — read this before
# trusting the pin below to cover the history ring. That package changed what every brownout,
# repair, thaw and commission writes into HistorySystem.Entries, which IS hashed state (the 'HIST'
# StateChecksum folds tick+kind+SubjectA+SubjectB of every entry, and it now folds a network id and
# an edge count that used to be 0). All five pins held anyway. The cause is the FIXTURE, measured by
# instrumenting Report() in hosts/scenario/Program.cs and printing a census of the ring at each day
# boundary (patched, run, restored from an in-memory copy, mtime moved forward — TRAPS 2):
#     SCRATCH-CAUSES brownoutEntries=0 thawLines=0 repairLines=0 commissionLines=0 cryoPodsOnShip=0
# on all three days. THIS FIXTURE'S RING IS 200/200 `Bond` ENTRIES. It publishes no brownout edge in
# three sim-days, authors NO CryoPod at all, completes no repair (OD-H boots every work type off and
# nothing here enqueues a command) and issues no commission — so all four halves of the package are
# reached ZERO times here. The four independent stubs were run anyway and every one read
# 7bdd0d6f7756dfdc, identical to the shipped tree and to main before the lane.
# ⭐ THE SAME CODE MOVES A HASH HARD WHERE IT IS REACHED. On --ship wreck (the ship ./play.sh boots,
# which NO pin covers), driven: at tick 200 000 the pre-fix writer reads 291fedc58c4720ed with a ring
# of 200 entries, all Brownout; the shipped tree reads 79c6641856fb779f with 9 entries (3 Alarm +
# 4 Generic + 2 Brownout). At tick 864 000: 2686a42ad8c1cf46 (200/200) vs 84a8c59eb1eebb9f (30).
# ⛔ AND THE WRECK IS WHERE A DETERMINISM REGRESSION HID, FOUND BY REVIEW AND NOT BY ANY PIN. Because
# PowerSystem is not IStatefulSystem, a reload re-publishes a duplicate BrownoutChangedEvent; the
# first draft of the coalescer folded it into a hashed, never-evicted field, so a save taken mid-
# brownout stopped replaying (HIST eff48a500b403996 vs eff48a500b4e5117 — one episode 1036 edges
# against 1037). Closed for MID-EPISODE saves by an idempotency rule derived from the ring, driven
# with the documented §13.10 matched recompute: save@135000 + 60 000 ticks reads StateHash
# 8b66921d15d45c9b on BOTH sims; the pre-first-edge control at save@100000 reads 1cd7a257831108b3 on
# both. ⛔ NOT closed for a save taken on an episode's OPENING tick — the rule drops a duplicate edge
# and cannot reconstruct one the loaded sim never published, so the entry's hashed tick stamp
# differs permanently (+10 ticks at the wreck's 164361 episode, +80 at 200371, compounding). Swept
# window: 1-11 ticks per ~36000-tick episode. That is FILED RESIDUAL 2; the honest fix is the same
# stateful-PowerSystem package, and MECHANICS §13.43.2 carries the numbers. Instruments:
# ChronicleSignalTests.TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode and
# EpisodeBoundarySaves_DoNotReplay_ThisIsFiledResidual2. NO PIN SEES ANY OF THIS.
# P2/P3 held for the WINDOW: tick 3000 precedes the first brownout edge on every authored plan
# (wreck 128 361, slice 191 331) and neither perilune nor slice authors a CryoPod. P4/P5 held
# genuinely — no def field exists; the episode window is a code constant (M2-1's rule-not-tunable
# precedent). Instruments: ChronicleSignalTests + ChronicleTests, and nothing else. See
# MECHANICS §13.43. This is M2-12's "no pin sees the generation term" in a third costume.
# ⭐⭐ M3-9 (PIN M3-c, 2026-08-02): 3d23665a724e853d -> 7bdd0d6f7756dfdc. CREW SLEEP. Until this row
# `Citizen.Fatigue` had NO reducer anywhere (NeedsSystem's own header said so), so every crew member
# on every ship saturated at 1.0 after ~16 h and stayed there. `RestSystem` is the reducer: a crew
# member who is BETWEEN JOBS and past needs.def `fatigue_rest_threshold` walks to a Bed, sleeps, and
# wakes at Fatigue 0 — and NeedsSystem's ramp is GATED while she sleeps (RimWorld's rest meter falls
# only while awake; an ungated ramp made the real recovery `recovery x effectiveness - ramp` and a
# deck sleep took 63.6 sim-h). NOT fold-only: a BEHAVIOUR change on every ship.
#
# ⚠️ AND THE DAY-3 SUMMARY LINE DOES NOT MOVE — say it plainly, because it is the trap. All four
# cells below print `pop 2 / hydro 98.1 kPa / water 0.0 L / potatoes 371`; the ONLY evidence this pin
# moved is the hash, which folds per-citizen Fatigue/Mood/JobKind. A reader who checks the printed
# line for a behaviour change will conclude, wrongly, that nothing happened.
#
# THE CAUSE, DECOMPOSED AS A DRIVEN 2x2 (needs.def edited in place, restored from an in-memory copy):
#                            crew never sleep (threshold 2)   crew sleep (shipped 0.75)
#   mood_fatigue_weight 25   3d23665a724e853d  <- THE OLD PIN  7bdd0d6f7756dfdc  <- SHIPPED
#   mood_fatigue_weight 0    455d352944081b14                  97f43a5a7f90bae2
# => (1) with the trigger out of reach this hash returns EXACTLY to its old value, so the ENTIRE move
# is the sleep BEHAVIOUR and the new system's mere presence (registration, JobKind.Sleep = 12, three
# def fields, the WorkTypeMap row, the gated ramp) is PIN-NEUTRAL, measured. (2) The bottom row's
# cells differ from each other, so sleeping moves the pin INDEPENDENTLY of mood: the labour a
# sleeping pawn does not do is itself a state change.
#
# ⚠️ AND THE THIRD CAUSE, WHICH IS THE EXPENSIVE ONE: Fatigue reaches Citizen.Mood, which reaches
# ShipMetrics.Morale, which weights DirectorSystem's tension, which moves _wearPressure, which scales
# MachineWearSystem => MACHINE WEAR RATES CHANGED ON EVERY SHIP IN THE REPO. Asserted out loud by
# RestSystemTests.TheWearPath_ACTUALLY_Moves_WhenFatigueFalls rather than left to be discovered.
#
# ⚠️ P2/P3 HELD, AND THE HOLD IS THE WINDOW, NOT A DEAD SYSTEM. Tick 3000 is 300 sim-seconds, where
# Fatigue reaches ~0.0052 against a 0.75 trigger — nobody aboard CAN sleep. Control, driven: with
# fatigue_rest_threshold at 0.001 both goldens MOVE (perilune cb09b584a5f15e52 -> c4001c0b66e3e4e9,
# slice 43a1a5c25713faec -> 78e2cc40adc39c45). Do not read "P2/P3 held" as "the goldens cover rest";
# the instrument is RestSystemTests and nothing else. P4/P5 moved for the three [needs] scalars.
# M3-7 (PIN M3-b, 2026-08-02): 13674ebc4f8a14a9 -> 3d23665a724e853d. `Citizen.Skill` — M2-1's last
# reserved byte — WIDENED to a per-work-type array of six (CITZ v8 -> v9, OD-M item 8A), so the
# citizen fold now folds six bytes where it folded one. FOLD-ONLY, and measured rather than argued:
# with the widened array present, every consumer live and the fold reverted to
# `Combine(h, (ulong)c.SkillsRaw[0])`, this hash was still 13674ebc4f8a14a9 and BOTH tick-3000
# goldens were green against their OLD values. The day-3 line is byte-identical either way
# (pop 2 / hydro 98.1 kPa / water 0.0 L / potatoes 371).
# ⚠️ AND THE RATE TERM — the point of the package — IS INVISIBLE TO ALL THREE PINS. Say it plainly:
# M3-7 makes work rate depend on WHO does the job, and NO PINNED FIXTURE DOES ANY WORK. Measured as a
# 2x2, not assumed: with EVERY crew member forced to skill 20 (a 2.24x-3.00x rate change) the three
# pinned runs are BIT-IDENTICAL with the rate seam live and with it stubbed out
# (P1 baf85f1209ce5ea3 both ways; perilune 3fa8982abae9456b both ways; slice b4a2380ffc416ec2 both
# ways). The cause is OD-H + M2-2: every work type boots OFF and no pinned run enqueues a command, so
# no job is ever claimed and no work tick is ever assigned. This is M2-12's "no pin sees the
# generation term" in a second costume, and M2-17's lesson exactly — an unattended fixture does no
# work, so a held pin here is VACUOUSLY held. The rate curve's instrument is SkillConsumerTests
# (driven, absolute tick counts, one leg per consumer), and nothing else.
# M3-15 (PIN M3-e, 2026-08-01): 25f604dd61b221fb -> 13674ebc4f8a14a9. OD-N gated the two remote-
# actuation commands (SetDoorStateCommand / SetDeviceStateCommand) on MossGate.IsServerLive, and THIS
# FIXTURE HAD NO TERMINAL. `BuildScenario`'s life-support watch installs on `term_main`, which was a
# bare script id with no device behind it, so the gate was shut here forever and the watch's
# `open(vent)` — which fires in DAY 2, when hydro dips below its 96 kPa trigger — was refused
# (hydro 96.2/98.4/97.7 -> 96.2/95.1/94.3 kPa). The fix taken (integrator, option 2) authors
# `term_main` as a REAL Terminal at (17,3,0), beside the c_leg1 conduit so PowerSystem wires it, so
# the watch keeps firing through the gate — hydro is back to 96.2/98.4/98.1.
#
# THE 2x2, DRIVEN, BECAUSE THE HEADLINE IS THE FOURTH CELL AND NOT THE SECOND:
#   no term_main, gate ON  -> 6d6e009299e6e86e   (the watch is refused; the window loses its only
#                                                 script->device actuation path)
#   no term_main, gate OFF -> 25f604dd61b221fb   (the pre-OD-N baseline, returned to THE DIGIT)
#      term_main, gate ON  -> 13674ebc4f8a14a9   <- SHIPPED
#      term_main, gate OFF -> 13674ebc4f8a14a9   <- IDENTICAL
# => ON THE SHIPPED TREE THE GATE IS INERT ON THIS PIN. Every bit of the move is the one authored
# device (a Terminal draws 0.1 kW and sheds 0.1 kW of waste heat into a compartment this fixture
# keeps deliberately tight); NONE of it is the gate refusing anything, and none of it is cached state
# -- MossGate holds no instance field, no mutable static, no def field and no save chapter. There was
# no zero-move option. P2/P3/P4/P5 all HELD (no def field, no new DeviceKind; the authored ships
# carry `term_hydro` at 1.000 so the gate is open on them before the first tick).
# M3-2 (PIN M3-a, 2026-07-31): 81733e27709f36e4 -> 25f604dd61b221fb. CryoSystem joined the stack as
# an IStatefulSystem, so its 'CRYO' StateChecksum seed now folds into Simulation.StateHash on EVERY
# ship (Simulation.cs:605-608 folds a system seed ONLY through that interface). FOLD-ONLY, and
# MEASURED as such rather than argued: with the identical system registered and ticking but the
# interface removed from its declaration, this hash was still 81733e27709f36e4 and both tick-3000
# goldens were green against their OLD values. The scenario ship has no CryoPod, so nothing about
# its run changed — the day-3 line reads pop 2 / hydro 97.7 kPa / water 0.0 L / potatoes 371 before
# and after.
# M2-2 (PIN M2-e, 2026-07-30): c1bac287230e184e -> 81733e27709f36e4. The work-type VETO landed, so
# the work grid M2-1 stored is now READ at five gates — and under OD-H every work type boots off.
# NOT fold-only this time and deliberately so: this is a BEHAVIOUR change on every ship, on the same
# state, because the default two packages upstream is now consulted. On the scenario ship the one
# live work path is Maintain (20 devices; Scrubber/Reclaimer cross their maint threshold at ~50 h of
# the 72 h run), and it no longer runs unbidden — measured, not predicted.
# M2-1 (PIN M2-a, 2026-07-29): 02257f5bce961570 -> c1bac287230e184e. The CITZ chapter gained the
# per-citizen work-priority grid, the WorkIncapable mask and two reserved fields (Skill, HeldByOrder),
# so Simulation.StateHash's citizen fold changed on every ship. FOLD-ONLY: with the identical state
# present but excluded from the fold, this hash was still 02257f5bce961570 and the full dotnet suite
# was 1330/1330 green — measured, not asserted. Nothing reads the new state.
# ⭐⭐ M4-9 (PIN M4-b, 2026-08-05): 7bdd0d6f7756dfdc -> 7c70c1befe848cc7. THE FIRST MENTAL BREAK.
# Citizen gains FIVE hashed fields (CITZ v9 -> v10): BreakDwell, BreakThresholdPct, BreakTier,
# BreakEndsAtTick, BreakReprieveUntilTick — and MentalBreakSystem joins the stack after Safety.
# P2 cb09b584a5f15e52 -> 55437c9e5f5d4c95; P3 43a1a5c25713faec -> 6f1fcfda3312c87a.
# P4/P5 HELD (661fcdd4b89f1e87 / 558a1c0a4985f5ea) — every ladder constant is a LITERAL, on M2-1's
# rule-not-tunable precedent, so no def field was added; measured twice, through DefsChecksumTests
# and through this host's own `defs:` print.
#
# ⛔ THE 2x2, DRIVEN, AND THE SECOND CELL IS THE ONE THAT MATTERS:
#   ladder LIVE  + 5 fields folded      -> 7c70c1befe848cc7   <- SHIPPED
#   ladder STUBBED + 5 fields folded    -> d9a67767ec2d1986   <- DIFFERS FROM SHIPPED
#   ladder LIVE  + fields NOT folded    -> 7bdd0d6f7756dfdc   <- returns to the old pin TO THE DIGIT
#   ladder STUBBED + fields NOT folded  -> 7bdd0d6f7756dfdc
# READ IT AS FOUR CELLS AND NOT TWO. Rows 3 and 4 are IDENTICAL, so with the new state out of the
# fold the ladder changes NOTHING this fixture can see: no job moves, no position moves, no break
# fires. But rows 1 and 2 DIFFER, so the ladder does WRITE on this fixture — and what it writes is
# the DWELL COUNTER. Instrumented at the end of the pinned run: both crew read
# `mood=-37.06 dwell=174880 tier=None` against a minor threshold of -34.15 and a required dwell of
# 864000 units. ⇒ P1's crew are 20.2 % of the way to a break and NOBODY BREAKS IN THE WINDOW.
# ⇒ THE MOVE IS: the widened fold, PLUS the counter's own accumulation. It is NOT a behaviour change.
#
# ⛔ SO SAY THE VACUITY OUT LOUD, BECAUSE THE M4-1 CHARTER PREDICTED IT BY NAME (§2's instrument
# table): NO PIN SEES THE TIER DERIVATION, THE RESET RULE, OR ANY OF THE THREE BEHAVIOURS. Under
# OD-H every work type boots off and no pinned run enqueues a command, so no pinned fixture ever
# reaches a break. This is M2-12's "no pin sees the generation term" and M3-7's "no pin sees the rate
# term" in a fourth costume. The ONLY instrument is MentalBreakTests (28 legs, driven, absolute
# thresholds, one blinded leg per behaviour), and nothing else.
# ⚠️ THE DAY-3 SUMMARY LINE DOES NOT MOVE — `pop 2 / hydro 98.1 kPa / water 0.0 L / potatoes 371`,
# byte-identical to main. As at M3-9, the ONLY evidence is the hash.
printf '%s\n' "$OUT" | grep -q "7c70c1befe848cc7" || { echo "FAIL: reference hash changed (expected 7c70c1befe848cc7) — if intended, update ci.sh + CLAUDE.md + memory in the same commit"; exit 1; }

echo "== screenshot-test metrics (advisory) =="
if command -v python3 >/dev/null 2>&1 && [ -f art/screenshot-test/accepted.png ]; then
  python3 art/spritegen/metrics.py art/screenshot-test/accepted.png --accepted art/screenshot-test/accepted.png --renderstats art/screenshot-test/renderstats.json || true
else
  echo "python3 or committed accepted.png absent — skipped (advisory)"
fi

echo "== OK =="
