# HANDOVER — current state

*This file is REWRITTEN every session (hard cap ~120 lines + the log): the end-of-session
ritual in `docs/PROCESS.md` §1 replaces this block and appends one log row. Everything
older lives in `docs/history/HANDOVER-2026-07.md` (all § anchors preserved — test comments
citing "HANDOVER §4b/§4g/§4k/§4l/§5 item 2, W4b-DEAD-DECK, ULP drift" resolve there).*

## Current state (2026-07-29, doc restructure session)

**Gate on `lane/doc-restructure` (= `main` + docs only): `./ci.sh` exit 0, 1411 dotnet +
1039 node, twin hashes MATCH, ALL FIVE PINS HELD** (P1 `c1bac287230e184e` — the pin table
lives in `CLAUDE.md`; re-measure before quoting).

**Where the project is:** M1 is effectively done, M2 has begun. The last code merges
(2026-07-29): **M2-1** work-priority state (CITZ v8, re-pinned, tag `pin/m2-a`, boots OFF
per OD-H/OD-I) and **M1-L** every-compartment-is-a-room (＋ADD ROOM deleted, OD-K). Before
those: M1-K pawn control in the Room Zoom (send-back debt fixed forward in `da376b8` —
spot-verify the two guards when next in that file), M1-I repair consumables, M1-D
reachability reason, M1-H craft-thrash fix, M1-F morale bar deleted.

**This session (docs only, no sim/client/test changes):** the documentation was
restructured around the re-aim. New: `docs/TARGET.md` (the optimization target + mechanism
checklist), `docs/ROADMAP.md` (the lean queue — replaces the roadmap pair as status
authority), `docs/PROCESS.md` (session lifecycle, scope & test discipline), `docs/TRAPS.md`
(full trap ledger). `CLAUDE.md` cut 1169 → ~150 lines (history archived to
`docs/history/CLAUDE-2026-07.md`); this file cut 5138 → this. Parked/superseded banners
added to `ECONOMY*.md`, the roadmap pair, and `PLAN.md`.

## Next (from `docs/ROADMAP.md` §3 — read the row's charter in packages.md first)

1. **M2-21** silent BUILD haul back-off (pos 7b, PIN `M1-c`) — must be measured **before**
   M2-2 makes its fixtures inert; consumes M1-D's `IsBackedOff`.
2. **M2-4** `work` wire channel + `SetWorkPriorityCommand`, then **M2-3** the WORK tab —
   both BLOCKING under OD-H (control surface must exist before M2-2's veto).
3. Owed, small, non-blocking: **M1-G** vent-premise reword (OD-D, docs-only) · **M1-L-b**
   retire dormant `AddRoomCommand` (SPINE lane, ordinal hazard) · charter the
   **vacuum-work ladder** (OD-K delegation; RW§2.4 is the analogue).

## Open on the owner

Nothing blocking. Standing art/review items: door art + LOCKED state unphotographed · the
OPEN-doorway `'/'` glyph piece doesn't exist · blind screenshot A/B and the 60-min playtest
are the week-9/13 human gates (`ROADMAP.md` §1).

## Open — unscheduled (filed, unowned; not a work queue — integrator triages against the roadmap)

- `designs` not fog-gated while `blocked` is — closed on wreck, still live on
  grid/slice/perilune.
- A machine below the wreck floor with no consumable stays needy forever (3 item-store
  scans at 1 Hz, per device).
- Unskinned device glyphs: GrowBed `"`, Terminal `T`, Telescope `x` draw debug placeholders
  in the Room Zoom (fix with a guard, not three sprites).
- D-3 social argument gate permanently open on every pair — file into M4.
- `MECHANICS.md` drift: §2/§13.23 still describe ＋ADD ROOM as live (deleted by M1-L) and
  the "In-flight work" banner lists four landed packages — reconcile in the M1-L-b lane.
- Save-reload gas/thermal ULP drift (archive: "Save-reload gas/thermal ULP drift").
- The pre-re-aim backlog (LLM elicitation, MOSS dry-run, websocket wedge, analyzer
  warnings, …) is archived in `docs/history/HANDOVER-2026-07.md` "Known issues / backlog"
  — several rows
  are likely obsolete under the re-aim; triage only when a package touches that area.

## Session log (append one row per session; prune when > ~40 rows)

| date | lane | player-visible outcome / result | gate |
|---|---|---|---|
| 07-28 | (six lanes) | wreck ship ships: operate verb, wrecked art, devices channel; ADD ROOM stops conjuring air | green, all pins |
| 07-29 am | audit + spike | no code: metric audit (A1 retired), dispatch spike refuted `TryAssign` seam, OD-A…OD-C | n/a |
| 07-29 | m1 wave | machines visible, `vent_ls` operable, honest first screen, ERASE tool | green |
| 07-29 pm | m1-f/h/d/i/k | morale bar gone, craft thrash gone, unreachable reason on tile, 11 repair consumables, pawn select+MOVE in Room Zoom | green |
| 07-29 pm | m2-1 + m1-l | work-priority state (hashed, OFF), every compartment IS a room | green, P1–P3 re-pinned `pin/m2-a` |
| 07-29 late | doc-restructure | docs only: TARGET/ROADMAP/PROCESS/TRAPS created; CLAUDE.md + HANDOVER cut ~10×; history archived | green, pins held |
