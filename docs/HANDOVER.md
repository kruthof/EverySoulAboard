# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-04, session H CLOSED — TWELVE lanes landed overnight on the owner's direction, playtest in 3 days)

**Gate on `main` (`58b375b`): FULL `./ci.sh` exit 0 — 1876 dotnet + 1297 node, twin MATCH
`7bdd0d6f7756dfdc`** (the final merge's tree is byte-identical to its gated lane tree,
tree-hash-verified; re-measure before quoting). **Pin table (CLAUDE.md authoritative,
UNCHANGED): P1 `7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52` · P3 `43a1a5c25713faec` · P4
`661fcdd4b89f1e87` · P5 `558a1c0a4985f5ea`. NO PIN MOVED ×12 lanes.**

**The owner's overnight direction (2026-08-03, verbatim): "i cannot builld anything except
the walls.. there is still no way to defreeze others" — both were AUDITED, then closed.**
Two driven audits first (scratchpad artifacts): BUILD — every furniture tool was fully
wired; the blocker was 3-Parts price vs 1 aboard, refused SILENTLY (and FLOOR's default
swept a no-op; SHELF/RUG drew client-local lies). THAW — the arc WORKS (119/119); no
surface taught it (9 stalls ranked; the CM chain sat behind doors no surface could name).

**Twelve merges** (each 1 Opus implementer + 1 independent reviewer; every review verdict
enforced): **chip-collision** (armed-owns-shadow on `.rz-mat/acc-chip`, class-swept) ·
**brownout-cadence** (episode backoff 1h→8h cap; day-6 ring 155, ZERO eviction, horizon
→~7.6 d; SubjectB layout literal-pinned) · **rig-hardening** (rig-lib.mjs: verifiedClick /
verified dismissal ×13 sites / actuation witness — a MOSS-live sweep SHUT 8 DOORS, filed;
fatal paths kill Chrome, 10 leaks→0) · **palette-honesty** (price+stock on chips, cost row,
refusals out loud, FLOOR names the armed material, SHELF/RUG stop lying; price pinned by
3-way def↔default↔command agreement) · **parts-affordability D7** (7 cabin-stores Parts
crates; first bunk in the first hour, driven; ⭐ see owner list) · **onboarding-thaw** (the
card says the seven can be WOKEN + MOSS row + CRAFT line; discharged the card's own owed
note) · **gate-sentences** (offline refusal names TERM_MOSS/deck/tile + the asked noun;
commission refusal names the machine-shop recipe — all derived) · **moss-autoscroll** (the
console follows its newest line; parked readers hold — HELP was 7-of-14 hidden) ·
**pod-poll-spam** (bay poll stands down after one unanswered period; typed refusals print
by construction) · **rig-premises** (heater/thaw rigs true again post-D7; "nothing loose"
is unreachable IN THE OPENING STATE — a conjunction ending at the frontier, measured) ·
**palette-three-tools** (GROWBED/MEDBED/TABLE join, priced, zero CSS; purse-decides rig) ·
**moss-doors-verb** (⭐ typed `doors` lists every door at the REPAIRED tier; ⭐⭐ its outcome
test is THE FIRST DRIVEN LIVE-PLAYER CHAIN PROOF: repair → doors → open by printed ids →
CRAFT → Regolith→Scrap→Parts→CM ~6.7 sim-h → commission ACCEPTED off a crafted module).

## Open on the owner (playtest 2026-08-07 — THREE DAYS OUT; ⭐ = decide before it)

- ⭐⭐ **THE BANDS DON'T OVERLAP (D7's measured finding):** one furniture piece needs 3
  Parts aboard; at 3 Parts aboard the wreck STOPS BROWNING OUT (9 episodes/day→0, wing_b
  0.10→0.80 — autonomy lifts it once Repair is granted) and thaw rung 4 cheapens. Shipped:
  the ruled route (author stock, OD-F) with the trade taken. One-line revert
  (`AuthoredShips.cs:2661`). Alternatives measured & filed at the site: unstageable cache ·
  reprice `device_place_cost` 3→2 + `device_parts` 2→1 + ONE crate (keeps the crisis,
  moves P4/P5). **Rule: keep the cache, or trade?** Commissioning pace measured UNCHANGED.
- ⭐ **`doors` verb ratification:** shipped as a defect closure in OD-P's typed style
  (owner's "ls to read directories" is the precedent, NOT the authorization — OD-P says
  "never implement from this row"). Ratify the shape? And is `vents` the second noun?
- ⭐ **SHELF/RUG (M4-6 wire-or-remove):** they now refuse honestly instead of lying;
  buttons kept pending your call.
- Should maintenance eat the furnishing budget at all (per-kind reserve — sim-core)? ·
  NO-CONSUMABLE badge unreachable in the OPENING state (frontier pacing fact, not D3) ·
  ACCEPTS row: 10 chips boot lit (lit=accepted reads as 10 armed buttons — invert the
  vocabulary?) · crew dock `.rz-crew.sel` hover/selected collision (3rd instance of the
  class) · Chronicle severity tie: a brownout usually out-headlines ORDER DROPPED ·
  FLOOR default kept + toast (deviation, argued from your OD-G) — ratify · furniture as a
  real pawn job (the RimWorld answer; L, spine, post-playtest) · carried batch from 08-02
  (bench wait · heater tier · rung-1 · vacuum services class · UI list) unchanged.

## Open — unscheduled (new ★ this session; full receipts in MECHANICS §13.44–§13.48)

- ★ Room Zoom furniture layer flickers ±1 piece at rest (product, cause unmeasured,
  fog-gated projection suspected) · ★ ContextAction on a dark ship: standard surface shows
  SILENCE on refused device clicks (nothing renders the `status` channel) · ★ MOSS-live
  stray clicks actuate doors, no confirm/undo (product hazard, measured: 8 doors shut by
  one sweep) · ★ klaxon is again the dominant ring producer (~28/day; horizon ~7.6 d) ·
  ★ save-tick event-loss family: §13.44.5 + §13.45.5 + brownout compat band (old words
  2–15 edges flip RecordsAFault — a persistence lane owes a migration) · ★ HELP is 13
  lines in a ~7-line pane (footer is the mitigation) · ★ `.moss-console` has no scroll
  affordance · ★ pushed `pods`/terminal-state channel would retire the poll · ★ carried/
  reserved Parts make the build refusal an upper bound (silent when ≥3 aboard all
  reserved) · ★ ledger staleness ≤1.2 s can toast a refusal over a success (benign) ·
  ★ mixed FLOOR sweep overcounts committed tiles · D5 family / spend-visible / Chronicle
  residuals carried (stateful PowerSystem · episode-boundary saves · `IsWanting` sawtooth
  · no pin covers the wreck · fault-log right-edge clip).
- Tooling ★: gate-sentences-shot + commission-shot share the count-diff `prompt()` defect
  (doors-shot's echo anchor is the fix) · onboarding-shot room-click flake (1-in-3) + not
  yet on rig-lib · work-tab-shot's incompatible local `waitFor` · `--place-cost` defs echo
  · 17 rigs verify dismissal by hand · NOTHING GATES client/tools (now 42 tools).

## Next

1. **The playtest 2026-08-07.** The chain test's action recipe IS the playtest script
   (DoorsVerbTests, ~6.7 sim-h at speed). First-hour risks all closed; the board's biggest
   remaining unknown is the ⭐⭐ brownout trade — decide it first.
2. Owner triage above, then M4 opens after the gate (M4-1 Persona design first).
3. Candidate small lanes if wanted: crew-dock `.sel` collision (same fix shape as the
   palette, third instance) · MOSS scroll affordance ("▾ N MORE", CREW-tab precedent).

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
