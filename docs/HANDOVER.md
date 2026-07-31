# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-30 night session — M2 IS CLOSED, the M3 charters are adopted)

**Gate on `main` (`5831758` + session docs): `./ci.sh` exit 0, 1546 dotnet + 1119 node,
twin hashes MATCH at P1 `81733e27709f36e4`** (pin table in `CLAUDE.md`; re-measure before
quoting). **All five pins unmoved all session.** Pin rows `M2-c` (discharged, no move) and
`M2-d` (discharged, no move, **tag `pin/m2-d`** = the power-package rollback point) leave
the chain; next pin rows are `M3-a…d` (assigned in the M3 charters).

**THE PHASE-1 EXIT GATE IS MET** (OD-K: *"order a repair, the lights come back"*) — driven
live on the shipping game over the wire this session: generation stepped **10.6 → 13.5
(worst wing repaired with the Parts) → 15.6 → 17.4 kW** against 14.3 kW demand; twelve
sim-hours later the bank sat at 67.7 kWh and climbing. The blackout is impossible now.

Merged, in order:
- **M2-11** deck 1 genuinely off-network — decision (a), content-only. 23 of 611 devices
  off-network (`WreckCutDeck1Risers`: 23 tray taps deleted, 8 bulkhead runs added, net
  −15); demand 20.40 → **14.30 kW**; the sim-hour-7 blackout closed as a side effect.
  D-1 half 1 closed. One send-back (a net-stated-as-deletion pin comment; a helper assert
  that swallowed legs — A/B-proven load-bearing).
- **M2-12** generation rides `EffectiveRate` — one term (`PowerSystem.cs:235`). Curve
  10.65 → 13.47 (benches) → **17.40 ceiling on boot stock, without crafting** (Parts are
  producible; 18.00 is late-game, not impossible); floor 9.00, never a cliff (8b honoured).
  Winnability PASSES unattended (LS+Defense served h0–h24). ⚠️ **NO PIN MOVED where the
  charter predicted P2/P3** — both goldens sit inside a bit-identical float window
  (perilune diverges t=3261, slice t=7011, measured twice independently); P1 structurally
  blind. **No pin sees the generation term — `GenerationWearTests`' two-sided ±0.05 bands
  are the sole instrument.** Two send-backs (5 statements-vs-reality incl. a bank-bridged
  can't-fail winnability leg; then 4 missed citation mirrors — sweep the class, not the
  list).
- **M2-17** the re-baseline — the occupancy harness authors its grid per leg via
  `SetWorkPriorityCommand` (OD-I's cost paid), prints it beside every number, refuses a
  vacuous zero by exit code. MECHANICS **§13.26**: grid's A1 was ALREADY 0.000 % pre-M2
  (economy ends at h16 on matter); **A3 measured for the first time ever** (granted wall
  completes in ~4–5 sim-min; Construct ALONE suffices — HaulToBuild maps to Construct).
  One send-back (a backwards work-type caveat in shipped output; `all@0` slipping the
  refusal, proven by mutation).
- **M3 charters adopted** — `docs/design/perilune-m3.packages.md` (2047 lines, 14 packages
  incl. new **M3-14** vacuum-work ladder, pin rows M3-a…d, conflict matrix). Three review
  rounds. Headline catches: the outline's pod census was wrong by two thaws (shipped:
  **12/1/7/4**); the MOSS commissioning gate (1 ControllerModule) inverts OD-L's depth
  curve unless the rungs are re-keyed (batch item 1); the sparse `work` wire cannot carry
  incapable-ness (new `workcaps` channel chartered); six false VERIFIED citations across
  two revisions, owned in the doc's §13 box.

Every package: Opus implementer + separate independent reviewer; five send-back rounds
total, all fixed and re-verified. Two integrator fix-forwards, both reviewer-pre-approved
(M2-12's four citation one-liners; the M3 gate paragraph's item count).

## Delegated decisions this session (owner said "decide on my behalf" — review these)

1. **M3 charters drafted in parallel with M2-17** (docs vs harness, no file overlap) — a
   mild deviation from "charters at end of M2"; both landed clean.
2. **M3-14 numbering**: the OD-K vacuum-ladder call got an M3 id (M2 was closing).
3. Everything product-shaping went into the M3 **owner batch, not decided** — including
   two items that AMEND standing rulings if accepted (item 2 would reverse OD-E's "deck 1
   stays dead" headline; item 7 chooses the ladder's rungs, which RW-ref says is yours).

## Next (the M3 queue, `perilune-m3.packages.md` §3)

1. **THE OWNER BATCH — a gate, not a lane.** EIGHT items, one message, three-day
   default-to-recommendation; items 1/2/6/7/8 change what packages 2/3/4/5/11 contain.
   **Nothing merges past position 1 until it is answered.**
2. Then: M3-1 pod-identity (INFRA design) → M3-14 vacuum ladder → M3-6 pod census →
   M3-11 deck-1 vent → **M3-2 CryoSystem (PIN M3-a, runs alone)** → M3-3 ThawGate →
   M3-4 POD BAY → … (full order in the charter doc).
3. Housekeeping candidate: 8 unmerged review-*/spike worktrees kept from the audit
   (commits not in main — verify wanted, then prune).

## Open on the owner

- **The M3 owner batch (8 items)** — the gate above; recommendations inline.
- Browser-extension eyeball items (extension was down all session; game verified over the
  wire instead): Power-lens bulkhead conduit glyphs on 8 hull tiles (M2-11 F-5) · deck-1
  "risers cut" fiction legibility · the M2-12 repair arc watched by a human.
- Carried: crew docks clip 27-char labels (demo FAIL, fix the TEXT) · Prioritise menu
  names the device TYPE not the instance · M2-8/M2-2 off-switch never pre-empts ·
  "Awaiting orders" short form · onboarding card Space row · work-type ▸ reach ranking
  arguably invertible · BUILD label collision · ascending-only click cycle · door art
  unphotographed · `'/'` glyph · blind A/B + 60-min playtest at week 9.

## Open — unscheduled (filed, unowned)

- **No wire carries per-device powered-ness** — `oper` is wear-only; 18 of 23 unpowered
  deck-1 devices read operational in the Room Zoom (measured live). Family: §13.25 b2.
- **Shed lamps flicker at 0.5 Hz forever on a flat bank** (M2-12; §13.11 family — a
  battery bursts any charge inside one balance second).
- `Device.Rate` now scales generators (a MOSS throttle lever; nothing writes it today).
- `IceChainMemoTests` zero-alloc pin flaked once (1720 bytes, shared process, `==0` no
  tolerance) — the test's design call, not a power-package defect.
- M2-17 residuals: grant read-back captured only at t=0 · raw-int interpolations behind
  an "every figure" comment · pre-existing `:N0` tick line (de-CH apostrophes) ·
  `TryParseSpec` last-duplicate-wins, untested · A2 no longer answers its own question
  (per-citizen vs per-work-type; owner call) · A3's "routine" is qualitative.
- Stale-citation sweep candidates (pre-existing): MECHANICS `:62`/`:2008`/`:2741` + two
  filename-less Balance cites; ECONOMY.md:72,74 and moss-terminal.spec.md:417 are stale
  AND their prose asserts the pre-M2-12 model — needs a prose decision, not a line edit.
- **The dev machine's locale is de-CH, not de-DE** (apostrophe group separator `864'000`)
  — the trap ledger's wording should be corrected; the invariant-culture rule is unchanged.
- Carried: §13.1 CO2 gap · M2-21 residuals · `WorkIncapable` not on the `work` wire
  (M3-7's `workcaps` charter now owns it) · M2-5 distance tie · `designs` not fog-gated ·
  needy-machine scans · unskinned glyphs · D-3 social gate · ULP drift (archived).

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-28 | (six lanes) | wreck ship ships: operate verb, wrecked art, devices channel; ADD ROOM stops conjuring air | green, all pins |
| 07-29 am | audit + spike | no code: metric audit (A1 retired), dispatch spike refuted `TryAssign` seam, OD-A…OD-C | n/a |
| 07-29 | m1 wave | machines visible, `vent_ls` operable, honest first screen, ERASE tool | green |
| 07-29 pm | m1-f/h/d/i/k | morale bar gone, craft thrash gone, unreachable reason on tile, 11 repair consumables, pawn select+MOVE in Room Zoom | green |
| 07-29 pm | m2-1 + m1-l | work-priority state (hashed, OFF), every compartment IS a room | green, P1–P3 re-pinned `pin/m2-a` |
| 07-29 late | doc-restructure | docs only: TARGET/ROADMAP/PROCESS/TRAPS created; CLAUDE.md + HANDOVER cut ~10× | green, pins held |
| 07-30 | nine lanes | **the RimWorld loop's first act is playable**: boot "Awaiting orders" → WORK tab → she works → off → finishes-then-waits; priorities RANK | green, P1/P3 re-pinned `pin/m2-e` |
| 07-30 pm | five lanes | **the DIRECT ORDER works**: why-line · pre-emption mid-service · right-click order holds 121 sim-s · demo 5/6 | green, pins UNMOVED |
| 07-30 night | power-network · power-wear · rebaseline · m3-charters | **M2 CLOSED, phase-1 exit gate MET**: deck 1 honestly off-network · repairing wings steps 10.6→17.4 kW live and the lights stay on · the harness states its grid, A3 measured first time ever · M3 charters adopted (14 pkgs, 8-item owner batch gates the queue) | green, pins UNMOVED, tag `pin/m2-d`, worktrees pruned 18 |
