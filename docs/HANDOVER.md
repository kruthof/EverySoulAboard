# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-04, session I CLOSED — three owner-triage lanes landed same-day, playtest in 3 days)

**Gate on `main` (`489bd78`): the final merge's tree is byte-identical to its gated lane
tree (tree-hash-verified); the TRAPS-8 chain ran the FULL `./ci.sh` in every lane — last
reading 1889 dotnet + 1312 node, twin MATCH `7bdd0d6f7756dfdc` (re-measure before
quoting). Pin table (CLAUDE.md authoritative, UNCHANGED): P1 `7bdd0d6f7756dfdc` · P2
`cb09b584a5f15e52` · P3 `43a1a5c25713faec` · P4 `661fcdd4b89f1e87` · P5
`558a1c0a4985f5ea`. NO PIN MOVED ×3 lanes.**

**THREE OWNER RULINGS (2026-08-04, in-session — recorded as OD-Q in ROADMAP §5):**
⭐⭐ **D7 brownout trade — KEEP THE CACHE** (ships as-is; one-line revert stays at
`AuthoredShips.cs:2661`; the reprice alternative stays filed, not taken) · ⭐ **`doors`
RATIFIED and `vents` IS the second noun** (shipped same day, below) · ⭐ **SHELF/RUG keep
the honest refusal until M4-6** (buttons stay).

**Three merges** (each 1 Opus implementer + 1 independent reviewer; every verdict
enforced): **vents-verb** (typed `vents` lists the wreck's 3 vents in the doors grammar at
the REPAIRED tier — same predicate as the exec arm; `VENT_D1` carries `· BOARD FAULT`
because listing is reading and the workaround loop needs the id, while the actuation
refusal is untouched; new `Ask.Vents`, and the pairwise refusal walk now DISCOVERS enum
members — the 9th-shape blindness the hand-list had; outcome test: repair → `vents` →
open a healthy vent by the printed id; reviewer APPROVE, fix-back ×3 text/test-shape) ·
**crew-sel-collision** (the chip-collision class's THIRD instance closed — `.rz-crew.sel`
owns inset+ring, a channel `:hover`/`:active` cannot produce; hover a warm neutral; the
class-sweep guard WIDENED, `STATE_CLASSES ['.on','.sel']` with per-member spelling pinned —
the planted `.sel` violation the chip lane measured GREEN now reds; SEND-BACK closed
text-only: the rig comment named `--deck 1`, an invocation that exits before its own
section — grid crew never leave deck 0, driven 7 runs across two reviews) ·
**moss-scroll-affordance** (`▾ N MORE` on the MOSS console — a passive SIGN per OD-P,
counting each `.moss-cline` by its OWN box because MOSS lines wrap, a gate-sentence
refusal is TWO line boxes, measured 43.53 vs 21.77; ⭐ REVIEW CAUGHT A REAL REGRESSION:
the sign's clearance padding grew `scrollHeight` and collapsed the autoscroll lane's 24px
follow slack to ~1px, driven A/B — fixed by subtracting the live padding at the seam,
`shouldFollowTail` sha-identical, the slack band now pinned BOTH sides and unit-visible;
re-review APPROVE).

## Open on the owner (playtest 2026-08-07 — the three ⭐ pre-playtest calls are RULED)

- Should maintenance eat the furnishing budget at all (per-kind reserve — sim-core)? ·
  NO-CONSUMABLE badge unreachable in the OPENING state (frontier pacing fact, not D3) ·
  ACCEPTS row: 10 chips boot lit (invert the vocabulary?) · Chronicle severity tie: a
  brownout usually out-headlines ORDER DROPPED · FLOOR default kept + toast (deviation,
  argued from your OD-G) — ratify · furniture as a real pawn job (the RimWorld answer; L,
  spine, post-playtest) · carried batch from 08-02 (bench wait · heater tier · rung-1 ·
  vacuum services class · UI list) unchanged.

## Open — unscheduled (★ new this session; receipts in the merge commits + MECHANICS §13.44–§13.49)

- Carried: Room Zoom furniture layer flickers ±1 piece at rest · ContextAction SILENCE on
  refused device clicks · MOSS-live stray clicks actuate doors, no confirm/undo · klaxon
  dominant ring producer (~28/day) · save-tick event-loss family (§13.44.5 + §13.45.5 +
  brownout compat band) · HELP is now FOURTEEN lines in the ~7-line pane (the ▾ sign +
  footer mitigate; the pane is still 22vh) · pushed `pods`/terminal-state channel would
  retire the poll · carried/reserved Parts make the build refusal an upper bound · ledger
  staleness ≤1.2 s toast race (benign) · mixed FLOOR sweep overcounts · D5 family /
  spend-visible / Chronicle residuals (stateful PowerSystem · episode-boundary saves ·
  `IsWanting` sawtooth · no pin covers the wreck · fault-log right-edge clip).
- ★ NEW: the CREW-tab `▾ N MORE` precedent has NO DOM test (`hud.js` `updateCrewMore`
  unexercised — found reading it as the precedent) · the clearance guard is
  PADDING-SHAPED (`padBottomPx` reads `padding-bottom` only; a margin/spacer/border
  clearance would silently reintroduce the slack regression — IX-M16's prose is the only
  cover) · `_updateConsoleMore` does O(rows) rect reads per scroll event + a
  `getComputedStyle` per render (unmeasured) · `.crew-more`/`.moss-more` share a
  byte-identical declaration prefix (cost two reviewers a false-green anchor each) ·
  `background` vs `background-color` longhand can copy the selected fill past the colour
  legs (the shadow channel still separates) · `.rz-mini-slot.cur` is the alphabet's
  remaining spelling (measured NOT a collision — no hover rule to borrow from) · vents:
  the BOARD FAULT column reads `DeviceFault.BlocksActuation` ≡ `Faulted` today,
  predicate-vs-field UNPINNED (an inert mutation, said out loud) · OPEN-is-not-air
  asymmetry (`vent_d1` prints OPEN while injecting nothing at rate 0 — honest about the
  shutter, filed) · MECHANICS §13.31 tier-table line refs were stale on main and are
  +43 lines worse.
- Tooling ★: `vents-shot.mjs` filed (the vents verb has no Chrome witness; client path is
  doors', asserted through the real screen module) · carried: gate-sentences-shot +
  commission-shot count-diff `prompt()` defect · onboarding-shot flake · work-tab-shot
  `waitFor` · 17 rigs verify dismissal by hand · NOTHING GATES client/tools (43 tools) ·
  stale "seventeen" counts in `palette-layout.test.js` (the new "twenty" makes the
  contradiction visible) · zoom-pawn-shot §5b exits 0 unmeasured on `--ship wreck`
  (declared convention, loudly logged).

## Next

1. **The playtest 2026-08-07.** All three pre-playtest ⭐ rulings are in. The chain test's
   action recipe IS the playtest script (DoorsVerbTests, ~6.7 sim-h at speed); typed
   `vents` now covers the deck-1 puzzle's noun the same way `doors` covered the
   fabrication doors.
2. Owner triage above, then M4 opens after the gate (M4-1 Persona design first).
3. Candidate small lanes if wanted: `vents-shot.mjs` (Chrome witness, doors-shot is the
   template) · the CREW-tab affordance DOM test (the precedent's own hole, found this
   session) · the `.crew-more`/`.moss-more` shared-prefix disambiguation (one-line rename
   or comment, saves the next reviewer a false green).

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-29 | m1 wave + m2-1 + doc-restructure | machines visible · vent operable · honest first screen · work-priority state · doc spine | green, `pin/m2-a` |
| 07-30 | fourteen lanes over three waves | **the RimWorld loop's first act + the DIRECT ORDER + M2 CLOSED (phase-1 exit gate MET)**; M3 chartered | green, `pin/m2-e` · `pin/m2-d` |
| 07-31 | m3-batch · pod-identity · vacuum-ladder | **M3 gate cleared (OD-M); a direct order crosses the frontier**; playtest named 2026-08-07 | green, pins UNMOVED |
| 07-31 B | pod-census · deck1-vent · od-n · cryo-system · moss-input · moss-hotkeys | **the thaw ladder authored · deck 1 one repair from air · OD-N/OD-O/OD-P · A POD CYCLES · the MOSS terminal types** | green, **`pin/m3-a`** |
| 08-01 C | doc-anchor-sweep · thaw-cmd · moss-gate · pod-bay · thaw-blocked · board-fault · emergency-thaw | **the thaw is EARNED · the ship answers to MOSS · typed `pods` shows the bay · the badge names the item · the vent puzzle · the ship wakes one more soul by itself** | green, **`pin/m3-e`**, tests →1690/1180 |
| 08-02 C | heater · skill-consumers · skill-display · sleeper-personas · rest | **a heater exists (and `place` was INERT — found+fixed) · who works changes how fast · the WORK tab shows it with ABSENT cells · seven written souls · crew SLEEP** | green, **`pin/m3-d` · `pin/m3-b` · `pin/m3-c`**, tests →1775/1205 |
| 08-02 C | m3-demo | **⭐ THE M3 EXIT GATE HOLDS, MEASURED**: 43/43 — a second thaw earned and chosen · thaws 3–5 span 6.93 sim-h; 7 findings filed | demo, 18 shots |
| 08-02 D | commission · repair-reserve · ladder-pacing · vacuum-visible | **⭐ THE PLAYTEST IS UNBLOCKED**: typed `commission` · reserve of 4 · decay in DAYS with warning · vacuum VISIBLE · **T13 DONE — the whole arc witnessed unmodified** | green ×4 + final gate, pins UNMOVED, tests →1801/1218 |
| 08-03 E | chronicle-signal · spend-visible · dock-labels · roomzoom-build · d5-dropped-orders | **the log tells the story · the order names its price · NO AIR survives docks · TOOLS ▸ · ⭐ D5 ROOT-CAUSED — NO WAY TO WALK TO IT** | green ×5 + final gate, pins UNMOVED ×5, tests →1831/1240 |
| 08-03 F | faultlog-dedupe · whyline-shot-flake · d5-drop-reason | **each fault ONCE · the rig stops coin-flipping · ⭐ the sim SAYS WHY it let go (§13.25 b3 closed, b3-R named)** | green ×3 + final gate `dbaff5f`, pins UNMOVED ×5, tests →1841/1247 |
| 08-03 G | overview-dock-badge · ring-saturation · palette-armed-state · b3r-dropped-order-chronicle | **the OVERVIEW says why an order is stuck · a klaxon writes ONE line (ring 200/200→49) · the palette PRESSES · ⭐ ORDER DROPPED in the log (b3-R closed, owner-ruled)**; 4 owner rulings in-session | green ×4 + final gate `025e529`+docs `5d9deb0`, pins UNMOVED ×5, tests →1850/1257 |
| 08-04 H | TWELVE lanes (owner-directed, AFK): chip-collision · brownout-cadence · rig-hardening · palette-honesty · parts-affordability(D7) · onboarding-thaw · gate-sentences · moss-autoscroll · pod-poll-spam · rig-premises · palette-three-tools · moss-doors-verb | **"can't build / can't defreeze" AUDITED then CLOSED: every build button priced+honest, first bunk affordable (⭐⭐ brownout trade FILED for the owner), 3 new tools · the card TEACHES the thaw, MOSS refusals name the next step, the console scrolls+stops spamming, typed `doors` ends the secret-door stall · the log survives a WEEK · rigs can't coin-flip or leak · ⭐⭐ THE LIVE-PLAYER CHAIN PROVEN DRIVEN (repair→doors→craft→CM→commission, ~6.7 sim-h)** | 12× in-lane full gates + final tree ≡ gated tree (exit 0, twin MATCH), pins UNMOVED ×5, tests →1876/1297 |
| 08-04 I | vents-verb · crew-sel-collision · moss-scroll-affordance (owner-triage; THREE same-day rulings → OD-Q) | **⭐⭐ D7 RULED keep-the-cache · `doors` RATIFIED and typed `vents` SHIPS (the deck-1 puzzle's noun is learnable; BOARD FAULT visible in the listing) · picking a crew row visibly ARMS it (3rd chip-collision instance closed, guard widened to discover `.sel`) · the MOSS console says `▾ N MORE` — and its review CAUGHT the sign eating the autoscroll slack (fixed at the seam, both sides of the band pinned)** | 3× in-lane full gates + TRAPS-8 re-gates ×2 + final tree ≡ gated tree, pins UNMOVED ×5, tests →1889/1312 |
