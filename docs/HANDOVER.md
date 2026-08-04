# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved) and
`docs/history/HANDOVER-archive.md` (rolling).*

## Current state (2026-08-03, session G CLOSED — four lanes landed, playtest in 4 days)

**Gate on `main` (`025e529`): FULL `./ci.sh` exit 0 — 1850 dotnet + 1257 node, twin hashes
MATCH at P1** (final gate ran on the byte-identical b3-R lane tree, tree-hash-verified
equal; re-measure before quoting). **Pin table (CLAUDE.md authoritative, UNCHANGED):** P1
`7bdd0d6f7756dfdc` · P2 `cb09b584a5f15e52` · P3 `43a1a5c25713faec` · P4 `661fcdd4b89f1e87`
· P5 `558a1c0a4985f5ea`. **NO PIN MOVED ×4 lanes** — every hold measured; the two sim-side
lanes' holds are VACUOUS and say why (no pinned fixture fires an alarm twice or holds an
order — only `PrioritiseJobCommand` sets `HeldByOrder`, proven by sweep).

**FOUR merges**, each one Opus implementer + one independent reviewer:
- **overview-dock-badge** (`41bc3d0`, APPROVE + 3 observations taken) — first-hour risk
  closed: a stuck order's reason shows on the OVERVIEW (crew dock row in fault red +
  `ORDER STUCK — …` readout), rendered live from the SAME host row as the Room Zoom badge
  (join = append-only 7th `blocked` element `Cid`; the one spine touch, M3-13's precedent).
  Named costs (§13.25 b3″): per-tile dedupe outranks the owner (2 crew / 1 machine ⇒ the
  second gets no dock line) · a co-occurring D4 `· NO AIR` clause is replaced by the
  blocked sentence (structurally possible, not shown reachable; hover keeps it).
- **ring-saturation** (`c316936`, 1 send-back) — the other first-hour risk closed: repeats
  of one alarm coalesce into a single in-place-rewritten ring entry per sim-hour run
  (§13.44, D6's shape, sim-side so Chronicle AND fault log fix at once). Unattended-wreck
  ring 200/200-saturated → 49 at day 1.5; machine failures + boot lines SURVIVE. Horizon
  day ~1.4 → ~4.2, NOT removed (brownout cadence ~24/day now dominates — filed). Send-back
  closed: the save-on-a-firing-tick residual is FILED (§13.44.5 — 1 tick in 600 while a
  klaxon sounds, PERMANENT; the reverted-coalescer control self-heals) instead of argued
  impossible, and `AlarmQuietTicks`' VALUE is pinned with its sizing sentence.
- **palette-armed-state** (`472721d`, 1 send-back; owner approved the lane same day) — the
  palette stops reading INERT: armed OWNS the shadow channel + brighter fill/border. Root
  cause measured: `:hover` had borrowed the ARMED border colour, and the cursor is always
  on the just-clicked button. Send-back closed: the reflow guard is a predicate over the
  rule's DECLARED properties (border-shorthand hole shut) and the rig goes RED against the
  exact pre-fix CSS (byte-identity had passed it). Placement keeps the tool armed —
  deliberate. Same collision filed: `.rz-acc-chip` (identical), `.rz-mat-chip` (near).
- **b3r-dropped-order-chronicle** (`025e529`, APPROVE) — ⭐ owner-ruled same day: every
  death of a player-held order writes `ORDER DROPPED — <crew> let go of <machine>: <the
  sim's own reason>` into the ring (`HistoryKind.OrderDropped`, §13.45; severity 5, never
  under LAST FAULT). **b3-R's silence is CLOSED for the LOG** — Displaced/CargoLost drops
  leave a durable trace; the badge half stays refused (live-re-ask, by design); §13.25d
  still owns re-issue.

## Open on the owner (playtest 2026-08-07 — FOUR DAYS OUT)

- RESOLVED TODAY (4): palette armed-state (ruled + SHIPPED) · b3-R shape = Chronicle line
  (ruled + SHIPPED) · deep-capsule art — INTACT IS CORRECT (closed, no work) · headline —
  DEATH FIRST STANDS (closed, no work).
- Carried from 08-02: ~4 sim-h bench wait (RULED: playtest measures it) · heater power TIER
  + boot affordability · rung-1 pacing · rung 1 needs a named home · unsurvivable-vacuum
  services as a CLASS · playtest date confirm. Carried UI: Prioritise names the TYPE ·
  off-switch never pre-empts · "Awaiting orders" short form · onboarding Space row ·
  work-type▸reach inversion · BUILD label collision · ascending click cycle · door art ·
  `'/'` glyph · Rell reads `general crew` · sleeping crew drawn standing.

## Open — unscheduled (the load-bearing subset; ★ = new this session)

- D5 family: order not re-issued when the route opens (§13.25d) · no-staging-tile silent at
  issue time (b2) · pre-click route clause on the offer · tenth path (deconstruct
  mid-service bypasses the funnel, publishes nothing — defensible) · neither repair walk
  re-asks whether the machine still WANTS service · no player-moved-on badge retirement ·
  ★ Overview dock dedupe: 2 crew on 1 machine ⇒ the second crew's dock line absent.
- Chronicle residuals: stateful-PowerSystem package (moves P1/P2/P3) · episode-boundary
  saves · ★ §13.44.5 + §13.45.5 save-tick event-loss SIBLINGS (one closer: save-boundary
  event delivery) · ★ brownout cadence ~24/day is now the DOMINANT ring producer (ring
  still saturates ~day 4.2 — D6's ledger) · P1 ring 200/200 Bond · `IsWanting` sawtooth ·
  no pin covers `--ship wreck` · fault-log lines clip at right edge · throttled chron
  re-request · ★ client FAULT LOG screen carries non-fault kinds (pre-existing since D1;
  the guarded LAST-FAULT column ≠ a guarded screen) · ★ severity-5 tie: a brownout usually
  holds the headline over ORDER DROPPED (nicety) · ★ the alarm text says the opposite of
  the condition ("THERMAL LOAD HIGH" while the ship freezes — §13.2 standing) · ★ a MOSS
  `alarm()` with an interpolated message never coalesces (latent — only a literal ships)
  and `DslValue.ToString` is not culture-guarded.
- spend-visible carryover: why-line price clause · D4 `air` element no MECHANICS section ·
  offer prices a machine the command refuses (pristine) · `NoService` silent ·
  carried-stack price flip · spend-through-fog rung question.
- UI polish ★: `.rz-acc-chip` hover/armed colour collision (IDENTICAL to the palette
  defect) · `.rz-mat-chip` near-collision · `:active` not collision-proofed · "seventeen"
  stale repo-wide (`ROOM_TOOLS.length` is 18) · neither palette instrument judges CONTRAST
  (declared human call on the PNGs).
- Tooling: unverified-click shape in three rigs (vacuum / dropped-order / zoom-pawn) · ten
  tools one-shot the onboarding dismissal · a rig retry can ACTUATE A DOOR · warm-host
  selection survives between runs · ★ 6-element `blocked` backward-safety leg NOT taken
  (single-tree deploy; integrator-ruled) · ★ `RecruitabilityTests` zero-alloc leg flaky
  under CPU contention (green ×3 alone) · M-PURITY scans raw text · `moss.jsonl` fixture
  drift · NOTHING GATES `client/tools/*.mjs` (now 39 tools, re-counted).

## Next

1. **The playtest 2026-08-07.** Both named first-hour risks are CLOSED (the Overview says
   why; the log survives a day at speed; a dying order is never silent — badge live where
   honest, log line always). The board is as clean as it gets before the gate.
2. Owner triage: the carried batch above.
3. M4 opens after the playtest gate (M4-1 Persona design first). Cheap pre-playtest
   candidate if one more lane is wanted: the `.rz-acc-chip` colour collision — the palette
   defect's second instance, same fix shape, same rig.

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-29 | m1 wave + m2-1 + doc-restructure | machines visible · vent operable · honest first screen · work-priority state · doc spine | green, `pin/m2-a` |
| 07-30 | fourteen lanes over three waves | **the RimWorld loop's first act + the DIRECT ORDER + M2 CLOSED (phase-1 exit gate MET)**; M3 chartered | green, `pin/m2-e` · `pin/m2-d` |
| 07-31 | m3-batch · pod-identity · vacuum-ladder | **M3 gate cleared (OD-M); a direct order crosses the frontier**; playtest named 2026-08-07 | green, pins UNMOVED |
| 07-31 B | pod-census · deck1-vent · od-n · cryo-system · moss-input · moss-hotkeys | **the thaw ladder authored · deck 1 one repair from air · OD-N/OD-O/OD-P · A POD CYCLES · the MOSS terminal types** | green, **`pin/m3-a`** |
| 08-01 C | doc-anchor-sweep · thaw-cmd · moss-gate · pod-bay · thaw-blocked · board-fault · emergency-thaw | **the thaw is EARNED · the ship answers to MOSS · typed `pods` shows the bay · the badge names the item · the vent puzzle · the ship wakes one more soul by itself** | green, **`pin/m3-e`**, tests →1690/1180 |
| 08-02 C | heater · skill-consumers · skill-display · sleeper-personas · rest | **a heater exists (and `place` was INERT — found+fixed) · who works changes how fast · the WORK tab shows it with ABSENT cells · seven written souls · crew SLEEP** | green, **`pin/m3-d` · `pin/m3-b` · `pin/m3-c`**, tests →1775/1205 |
| 08-02 C | m3-demo | **⭐ THE M3 EXIT GATE HOLDS, MEASURED**: 43/43 — a second thaw earned and chosen · thaws 3–5 span 6.93 sim-h · her row differs in SHAPE; 7 findings filed (2 first-hour: the ladder decays silently; the work grid soft-locks) | demo, 18 shots, commissioning needed a button (closed 08-02 D) |
| 08-02 D | commission · repair-reserve · ladder-pacing · vacuum-visible | **⭐ THE PLAYTEST IS UNBLOCKED**: typed `commission` at the real cost · the grid no longer bankrupts the ship (reserve of 4) · the ladder decays in DAYS with a named-capsule warning bar · the vacuum is VISIBLE · **T13 DONE — the whole arc witnessed unmodified, 5.47 sim-h, Ozawa walks** | green ×4 post-merge + final gate on main (exit 0), pins UNMOVED, tests →1801/1218 |
| 08-03 E | chronicle-signal · spend-visible · dock-labels · roomzoom-build · d5-dropped-orders | **the log tells the story (brownout ticker gone; repair/commission/thaw write lines) · the order names its price (`· SPENDS 1 PARTS`) · `· NO AIR` survives both docks (+hover) · a room opens as a ROOM (`TOOLS ▸`) · ⭐ D5 ROOT-CAUSED (reachability, deterministic) — an unreachable order says NO WAY TO WALK TO IT** | green ×5 post-merge + final gate on main, pins UNMOVED ×5 (chronicle holds part-vacuous, labelled), 83 rig checks on merged main, tests →1831/1240 |
| 08-03 F | faultlog-dedupe · whyline-shot-flake · d5-drop-reason | **the fault log lists each fault ONCE (was ×2 + headline ×3 — double-sourced, not undeduped) · the why-line rig no longer coin-flips (and its STEP-4 check was VACUOUS — closed with a driven 2×2) · ⭐ the sim SAYS WHY it let go: a mid-order drop wears its reason (route/approach/named item), §13.25 b3 closed, b3-R named honestly** | green ×3 in-lane + final gate on main `dbaff5f` (exit 0, twin MATCH), pins UNMOVED ×5, tests →1841/1247 |
| 08-03 G | overview-dock-badge · ring-saturation · palette-armed-state · b3r-dropped-order-chronicle | **the OVERVIEW says why an order is stuck (dock row + `ORDER STUCK` readout, live off the badge's own row) · a standing klaxon writes ONE line (ring 200/200→49; faults + boot lines survive; horizon ~1.4→~4.2 d) · the tool palette PRESSES (hover had borrowed the armed border colour) · ⭐ a dying order writes `ORDER DROPPED` to the LOG (b3-R silence closed, owner-ruled same day)**; 4 owner rulings in-session; 2 send-backs + 1 fix-back closed | green ×4 in-lane (each on its main-merged tree) + final gate on main `025e529` (exit 0, twin MATCH), pins UNMOVED ×5, tests →1850/1257 |
