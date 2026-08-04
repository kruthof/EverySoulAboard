# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-04, session K CLOSED — M4 CHARTERED IN FULL, playtest in 3 days)

**Gate on `main` (`a7cc2b4`): the merge's tree is byte-identical to its gated lane tree
(tree-hash-verified, `44a6de89…`); the lane ran the FULL `./ci.sh` at its FINAL commit —
1889 dotnet + 1312 node, twin MATCH `7bdd0d6f7756dfdc` (re-measure before quoting). Pin
table (CLAUDE.md authoritative, UNCHANGED): P1 `7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52`
· P3 `43a1a5c25713faec` · P4 `661fcdd4b89f1e87` · P5 `558a1c0a4985f5ea`. Docs-only lane;
`git diff 2e4ce40 -- tests/Perilune.Tests/Golden/ ci.sh content/` = 0 lines.**

**M4 IS CHARTERED — `docs/design/perilune-m4.packages.md` (2132 lines, M3 house format,
citations re-measured on `2e4ce40`).** Forced pick under PROCESS §2 (sessions I+J were
both `rows: none`, so the topmost unmerged ROADMAP row — M4-1 — was mandatory) and named
by OD-R's binds cell (the M4-1/M5-1 charters written at M4 open, against the three
registers). One Opus implementer + one independent reviewer; ONE SEND-BACK (5 MAJOR + 11
MINOR, all fixed and re-verified) + 4 post-approval nits, every verdict enforced. What it
contains:
- **M4-1's Persona design IS the charter's §5**: layout, tabs, orders, transcript, the
  `controls.js` T-key THIRD DOOR (invisible to the `CREW_INTERACTION` census — it bypasses
  hud.js), the mount (body-level sibling, MOSS-takeover precedent), Rell's unauthored
  identity (ruled: M4-3 authors her a sheet, REVERSING M3-8's refusal — and that reddens
  `SleeperPersonaTests.cs:493-494` by construction, named in MUTATIONS), "Incapable Of",
  empty-relationships copy, per-person history without a cid on Chronicle lines. Design
  questions **(a)–(h)** each ruled-or-forked with a routing box (charter's call vs owner
  batch). Keymap census MEASURED: `E` recommended for Persona (`P` is bound —
  `toggleSprites`, `controls.js:282`; the reviewer caught the charter claiming it free).
- **⭐⭐ THE TWoM-GAMEPLAY SECTION (OD-R's mandate)**: deterministic break ladder — RW§4's
  one-tunable→three-tier DERIVATION adopted (not re-litigable), break roster from OD-R's
  verbs (refuse/stop/withdraw), a dwell/DECAYING-counter over hashed mood (hard reset was
  DEFEATED by the measured mood sawtooth — review finding; the leaky integrator is the
  recommended fix, fork (h)), the per-person tunable's HOME priced as fork (g) (traits
  may NOT be the source — `PersonaSheet` is host-owned/unhashed, a hashed break reading it
  is a cross-host determinism violation; the `SleeperAptitudes`-precedent hashed byte is
  recommended), catharsis analogue priced, sleep-freeze clause. Emergent-triage and grief
  registers chartered; TARGET §2 honoured (no dice, no misery meters, no fed bars).
- **Pin chain `M4-a…c`** (M4-4 real-or-delete · the first break · social ignition), each
  with its VACUITY stated (under OD-H no pinned fixture works — instrument tables name
  `MentalBreakTests`-to-be etc. as the sole cover, M3-9's lesson) · **conflict matrix +
  12 couplings** (the three pinned lists move in ONE commit with M4-2; M4-2/M4-8 ordering
  tension — `openPersonaForSelected` belongs in `ship-state.js`, which WP-9 creates) ·
  **M5-1 forward charter** (the ending = survivors-and-cost payoff on M3-5's shipped
  state) · **§10 owner batch, five items, silence defaults stated** (below) · playtest
  clause: **the 08-07 findings amend this charter BEFORE M4-2 implements.**

## Open on the owner (playtest 2026-08-07; then the M4 batch — default-to-recommendation after three days)

- **⭐⭐ THE M4 OWNER BATCH (`perilune-m4.packages.md` §10, five items, each with silence
  default): 1** who builds the first mental break (REC: ninth package M4-9 / silence:
  defer to M5) · **2** `Citizen.Health`/`Morale`/`Archetype` real-or-delete (REC: real,
  RW§6.1 safety-net shape / silence: keep-and-stop-showing; NO zero-pin option exists) ·
  **3** may a player order override a break (REC: graduated by tier / silence: RimWorld's
  no) · **4** may thawed sleepers arrive with real SOCL bonds (REC: yes, seeded in
  `CryoSystem` / silence: no — bonds stay prose, Feud cut, D-3 unclosed) · **5**
  Chronicle severity tie (REC = silence: keep it, earliest wins). Plus the M4-1 design
  itself is under owner review (design questions (a)–(h) are the charter's calls,
  overridable there).
- Carried from 08-02/08-03 (unchanged): maintenance vs furnishing budget · NO-CONSUMABLE
  badge unreachable in the OPENING state · ACCEPTS row 10 chips boot lit · FLOOR default
  + toast ratify · furniture as a real pawn job · bench wait · heater tier · rung-1 ·
  vacuum services class · UI list. (The Chronicle severity tie moved INTO the M4 batch,
  item 5.)

## Open — unscheduled (★ new session K; receipts in the merge commits + the M4 charter §12/§13)

- ★ NEW (session K, filed by the charter lane): the post-M3-9 MOOD ENVELOPE is stale in
  THREE docs (MECHANICS §13.4's numbers pre-date REST; the break package's FIRST required
  measurement is day-means + envelope + sawtooth AMPLITUDE + PERIOD — nothing may be
  tuned before it) · D-3's premise ("Fatigue has no reducer") is stale post-M3-9, may be
  partly self-healing, nobody has looked · `SocialSystem.cs:150`'s `_roll.NextFloat()` is
  a runtime-roll SHAPE TARGET §2 forbids in outcomes (filed, not ruled; the break ladder
  is forbidden from copying it) · M4-5/M4-6/M4-8 move no TARGET row (checklist gap) ·
  `CitizenMemory.Episodic` as a wire channel is the better long answer for per-person
  history (a package, not a clause) · `CmdKind.Operate` removal is CHECK-BEFORE-DELETING
  in M4-8 · M3's coupling 7 undercounted the MOSS doors (three, not one — charter §12.16).

- Carried: Room Zoom furniture layer flickers ±1 piece at rest · ContextAction SILENCE on
  refused device clicks · MOSS-live stray clicks actuate doors, no confirm/undo · klaxon
  dominant ring producer (~28/day) · save-tick event-loss family (§13.44.5 + §13.45.5 +
  brownout compat band) · HELP is now FOURTEEN lines in the ~7-line pane (the ▾ sign +
  footer mitigate; the pane is still 22vh) · pushed `pods`/terminal-state channel would
  retire the poll · carried/reserved Parts make the build refusal an upper bound · ledger
  staleness ≤1.2 s toast race (benign) · mixed FLOOR sweep overcounts · D5 family /
  spend-visible / Chronicle residuals (stateful PowerSystem · episode-boundary saves ·
  `IsWanting` sawtooth · no pin covers the wreck · fault-log right-edge clip).
- ★ (session I): the CREW-tab `▾ N MORE` precedent has NO DOM test (`hud.js` `updateCrewMore`
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

1. **The playtest 2026-08-07.** All three pre-playtest ⭐ rulings are in; the chain test's
   action recipe IS the playtest script (DoorsVerbTests, ~6.7 sim-h at speed). **Its
   findings amend the M4 charter before M4-2 implements** (the charter's §1 exposure
   table names which sections are most revisable).
2. **The owner: review the M4-1 Persona design and answer the §10 batch** (five items,
   silence defaults stated; default-to-recommendation after three days per ROADMAP's
   standing rule). Nothing in M4 implements before this + the playtest amendment.
3. After that, M4's merge order opens at `perilune-m4.packages.md` §3 (M4-2 first unless
   batch item 1 = A inserts M4-9's pin lane; the M4-2/M4-8 ordering tension is chartered).
4. ⛔ The former "candidate small lanes" (`vents-shot.mjs` · CREW-tab DOM test ·
   `.crew-more` rename) stay META-WORK under PROCESS §2 — FILED, not session work.

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
| 08-04 J | twom-axis-drift-guardrails + twom-gameplay-pillar (docs-only, owner-direct) | **OD-R — the game is RimWorld × Factorio × THIS WAR OF MINE, and TWoM is a GAMEPLAY PILLAR** (owner amended same day: "more than a tone"; three follow-ups adopted — emergent triage from real scarcity · deterministic mental breaks gate BEHAVIOUR (T12's missing half) · lands inside M4+M5; nothing implementable before the M4-1 charter) · **the drift check the owner asked for**: PROCESS §2 lane-selection gate + `rows:` disclosure, HANDOVER's meta-work candidates demoted behind owner triage | docs-only ×2, full gate exit 0 each, doc-sentinel tests green; rows: none (owner-directed ruling batch) |
| 08-04 K | m4-1-persona-design (forced topmost row after two `none` sessions) | **M4 CHARTERED IN FULL — THE PERSON** (`perilune-m4.packages.md`, 2132 lines): the Persona design with (a)–(h) ruled-or-forked (keymap census says `E`; the T-key third door named; Rell ruled authored, its pin move named) · **⭐⭐ OD-R's TWoM-gameplay section — the deterministic break ladder priced in hashed fields** (review DEFEATED the hard-reset counter with the measured sawtooth; decaying counter recommended; the tunable's unhashed-trait trap named) · M5-1 forward charter · five-item owner batch with silence defaults; 1 send-back (5 MAJOR + 11 MINOR) + 4 nits, all enforced | docs-only, full gate exit 0 in-lane at FINAL commit, twin MATCH, pins UNMOVED ×5, merge tree ≡ lane tree; rows: M4-1 (T16 + T12's OD-R half → chartered) |
