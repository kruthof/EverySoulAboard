# PERILUNE — MOSS TERMINAL SPEC ("the phosphor ledger", v1, 2026-07-22)

The interaction, visual and data contract for the **MOSS terminal**: a full-screen amber CRT
console that replaces the entire game window and reports every ship system on one screen.
Keyboard-first, with a live command prompt.

A sibling of `perilune-game-ui.{interaction,visual}-spec.md` and
`perilune-game-ui.relations-spec.md`. It inherits their tokens and type scale where it does not
override them. Requirements are numbered **IX-M** (interaction), **VS-M** (visual) and **DA-M**
(data / honesty). One behaviour per requirement. Where this spec and a sibling conflict, **this
spec is final for the MOSS surface**.

Design target: the supplied mock `1a PHOSPHOR LEDGER — one screen, whole ship, keyboard-first`,
in the spirit of the Fallout 4 terminals — phosphor amber on near-black, monospace, no chrome,
everything reachable from the keyboard.

> **This spec is the parallelism unlock.** Three lanes build against it simultaneously
> (`moss-systems` = sim/host/wire · `moss-model` = the pure client brain · `moss-screen` = the
> DOM/CRT face). The wire shapes in §1 and the model API in §2 are **frozen**: a lane that needs
> one changed raises it as a contract request rather than editing unilaterally.
>
> **Implementers are expected to push back with evidence.** §5's derivations were written from a
> read-only survey, not from having built them. If a derivation is wrong or dishonest against
> source, correct it *and* amend this spec in the same commit, citing `file:line`. That has
> happened four times on this project and was right every time.

---

## 0. The honesty rule (why this spec exists at all)

`docs/MECHANICS.md` §13 catalogues what is "wired but not connected", and it exists because a
64-minute economy and a permanently-dead food chain both shipped behind HUD bars reading 1.00.
A screen whose entire purpose is *"the truth about this ship, at a glance"* is the single worst
place in the codebase to render an invented number.

**DA-M1 — every gauge is derived from live sim state, or it is not on the screen.** No constant,
no placeholder, no "reasonable-looking" value. A system whose hardware does not exist renders
`OFFLINE` with a stated reason, never a plausible percentage.

**DA-M2 — the mock's `MEDICAL SUITE`, `COMMS ARRAY` and `GRAV RING` rows are deliberately absent.**
`MedBed`/`MedCabinet` are inert furniture (0 draw, 0 wear, no system reads them,
`MachineWearSystem.cs:54` skips `WearPerHour <= 0`). Comms and gravity do not exist anywhere in
`sim/` or `hosts/` — no `DeviceKind`, no system, no def, no string. They are replaced by three
rows that are real: `THERMAL`, `FABRICATION`, `NAV / SENSORS`. Row count and visual density are
unchanged from the mock.

**DA-M3 — a row states its own limits.** Where a derivation is a proxy, the DETAIL screen says so
in plain words (see IX-M22). `HULL INTEGRITY` is mean device condition, and its detail screen must
say that no hull-stress model exists (`ShipMetrics.cs:12` already carries that admission as a
comment — surface it).

**DA-M4 — `LIFE SUPPORT` may not report NOMINAL off nameplate capacity alone.** Measured
(`MECHANICS.md` §13.1): worst-room CO₂ climbs 500 → 17,644 ppm over 3 days *while every scrubber
is healthy and at 2.3× nameplate*, because scrubbers are room-local and `FlowAcrossDoor` has no
diffusion term. Its STATE is driven by **worst-room CO₂ ppm**, not by capacity.

---

## 1. Wire contract (frozen)

### 1.1 `systems` — the cached ledger channel

A cached state channel alongside `roster` / `designs` / `terminals` / `relations`: rebuilt each
render, deduped, and snapshot-replayed on connect (add `"systems"` to the catch-up key list in
`GameSession.Snapshot`). Built **read-only on the sim thread** inside `Render` — no mutation, no
RNG, no `Nudge`-class side effects. Not fog-gated (a ship's own telemetry is fixed crew knowledge,
the same deliberate rule as `roster`).

```
{"type":"systems","hull":"7741","day":213,"uptime":5112074,
 "rows":[[id,label,load,state,faultDay,faultText,advisory],...]}
```

| field | type | meaning |
|---|---|---|
| `hull` | string | Ship designation. Deterministic from the world seed — a **name**, not a gauge (DA-M1 does not apply to identity strings). Stable for a given ship. |
| `day` | int | `TickCount / SimClockUtil.TicksPerDay`. |
| `uptime` | int | Raw `TickCount`. The client formats it (§2, `uptimeText`) — the host never ships a preformatted duration, because that is a culture bug waiting to happen on this de-DE machine. |
| `id` | string | Stable snake_case key: `reactor`, `life_support`, `water_reclaim`, `hydroponics`, `thermal`, `fabrication`, `hull_integrity`, `nav_sensors`. Used by `moss sys` and by `open <system>`. |
| `label` | string | Display text, already uppercase (`LIFE SUPPORT`, `NAV / SENSORS`). |
| `load` | int | `0..100`, or **`-1`** meaning "no meaningful load" → renders an empty bar and `--`. |
| `state` | int | `0` NOMINAL · `1` ATTEND · `2` DEGRADED · `3` OFFLINE. Append-only ladder. |
| `faultDay` | int | Day of the newest attributable fault, or **`-1`** for none. |
| `faultText` | string | Fault summary, uppercase, no day prefix (the client composes `DAY {n} · {text}`). `""` when `faultDay` is `-1`. |
| `advisory` | string | One or two sentences of plain prose about this row, rendered under the rule when the row is selected (the mock's `> REACTOR: coolant loop B running 4°K warm…`). `""` renders nothing. Host-derived, deterministic, **never LLM text**. |

Rows are emitted in the fixed order above (presentation order is a host decision, not a client
sort — same rule as the relations ring).

### 1.2 `moss` op `sys` — system detail, on demand

DETAIL is **not** on the pushed channel: a per-device breakdown would re-send on every condition
tick and dwarf the ledger. It is fetched like `moss open`/`moss audit`.

```
→ {"cmd":"moss","op":"sys","tid":"reactor"}
← {"type":"moss","ev":"sys","tid":"reactor","devices":[[name,kind,condition,powered,rate,deck,x,y,note],...]}
```

`condition` and `rate` are ints `0..100` (percent — the wire carries no floats for these; the sim
holds `Condition`/`Rate` as `0..1` floats and the host rounds once, `MidpointRounding.AwayFromZero`,
InvariantCulture). `powered` is `0|1`. `note` is `""` or a short reason string
(`"WORN — MAINTENANCE DUE"`, `"UNWIRED"`, `"FAILED"`).

### 1.3 `moss` op `exec` — the command prompt

```
→ {"cmd":"moss","op":"exec","tid":"@console","text":"close door_storage"}
← {"type":"moss","ev":"exec","tid":"@console","ok":true,"lines":[[stream,"text"],...]}
```

`stream` is `0` echo · `1` output · `2` error. `ok` is false when the line did not parse or the
target did not resolve.

**IX-M40 — the prompt grants NO authority the DSL does not already have.** Command execution
resolves the target through the **same `DeviceRegistry` / `IScriptable` adapters the MOSS
interpreter uses** (`sim/Sim.Dsl/DeviceAdapters.cs`, `DeviceRegistry.cs`) and calls the same
`TryInvoke`. Therefore the verb whitelist is inherited, not re-declared: doors get
`open`/`close`/`lock`/`unlock`; utility devices (`AirVent`, `Scrubber`, `SolarWing`, `GrowBed`,
`WaterTank`, `Reclaimer`) get `open`/`close`/`set <name>.rate <number|max|min>`; rooms and `ship`
are **read-only** and must stay so. Every write leaves as an existing `SetDoorStateCommand` /
`SetDeviceStateCommand` on the ordinary inbox and lands at the next tick boundary. **No new
`ISimCommand` is introduced by this feature.** If a lane finds itself writing one, stop — that is
a contract request, and it means the design drifted.

**IX-M41 — reads are free, writes are audited.** `status`, `open`, `log`, `prog`, `help`, `clear`,
`exit`, and property reads (`ship.power`, `hydro.co2`, `vent_ls.rate`) are pure client/host reads.
Every *write* additionally appends to the `@console` audit ring so the player's own commands sit
in the same log as the DSL's, attributable and reviewable.

**IX-M42 — the prompt is bounded.** Input is capped at 240 characters host-side (not only in the
DOM), and a malformed line is a typed error response, never an exception and never a silent no-op.
Player text from this path **never reaches an LLM prompt** and is never echoed into sim state
beyond the audit ring — the `player_speech` quarantine rationale applies here too.

---

## 2. Pure model API (frozen)

`client/src/ui/moss-model.js` — **pure**, node-tested, zero DOM, zero timers, zero `Date.now()`
outside an injected clock. All rendering decisions live here; `moss-screen.js` is glue.

The stub with these exact signatures ships with this spec so the `moss-screen` lane can import a
real module while the `moss-model` lane fills the bodies in parallel. **Only the `moss-model`
lane edits `moss-model.js`.**

```js
export const SCREEN = { LEDGER: 'ledger', DETAIL: 'detail', FAULTLOG: 'faultlog', PROGRAM: 'program' };
export const STATE  = { NOMINAL: 0, ATTEND: 1, DEGRADED: 2, OFFLINE: 3 };

// ---- lifecycle / reducers (model in, model out; never mutate the argument) ----
export function openMoss();                          // → fresh model, SCREEN.LEDGER, row 0 selected
export function reduceSystems(model, msg);           // `systems` channel; preserves selection by row ID
export function reduceMossEvent(model, msg);         // moss ev: sys | exec | source | diag | audit | rterror
export function reduceChron(model, msg);             // `chron` channel → the FAULT LOG source
export function reduceLog(model, msg);               // `log` channel tail → FAULT LOG live section

// ---- input (pure state machines; return {model, effects}) ----
export function keyPress(model, key, mods);          // ArrowUp/Down, Enter, l/L, Escape, Tab, PageUp/Down
export function editPrompt(model, text);             // → model (prompt buffer only)
export function submitCommand(model, text);          // → {model, effects}
export function parseCommand(text);                  // → {verb, args, raw, kind}  ('nav' | 'device' | 'read' | 'bad')

// ---- pure formatters (the look) ----
export function loadBar(loadPct, width);             // → "[████▒▒▒▒]"; loadPct -1 → "[        ]"
export function loadText(loadPct);                   // → "61%" | "--"
export function stateCell(state);                    // → { text: 'ATTEND', warn: true }
export function faultCell(faultDay, faultText);      // → "DAY 190 · SCRAM DRILL" | "—"
export function uptimeText(ticks);                   // → "5112:07:44" (H:MM:SS, InvariantCulture)
export function headerLines(model);                  // → the two title lines
export function footerHints(model);                  // → per-screen key hints, e.g. "[↑↓] SELECT ROW"
export function ledgerView(model);                   // → { rows, selectedIndex, advisory }
export function detailView(model);                   // → { title, devices, notes, loading }
export function faultLogView(model);                 // → { title, entries, filterId }
export function consoleLines(model);                 // → the `>` transcript, newest last, bounded
```

**Effects** are requests the DOM layer fulfils — the model never touches the socket:

| effect | meaning |
|---|---|
| `{k:'moss', op:'sys', tid}` | fetch a system detail |
| `{k:'moss', op:'exec', text}` | run a prompt line |
| `{k:'moss', op:'open', tid}` | load a terminal's program source (PROGRAM screen) |
| `{k:'chron'}` | request the chronicle |
| `{k:'exit'}` | leave MOSS, restore the ship view |

**M-PURITY** — `moss-model.js` must contain no `document`, no `window`, no `fetch`, no
`Date.now()`/`new Date()`, no `Math.random()`. A node test asserts this by source scan, and the
lane may not weaken it.

---

## 3. Interaction (IX-M)

| # | Requirement |
|---|---|
| **IX-M1** | Activating the `MOSS` tab **replaces the whole window**. The top bar, CREW WATCH, READOUT, the stage and the bottom console are all hidden — not merely covered. Nothing of the game console shows through. Any other tab restores the ship view. The ship canvas and `composeScene`/executors are never touched; MOSS simply is not drawing them. |
| **IX-M2** | **ESC is the way out** and it is a stack, innermost first: PROGRAM → DETAIL/FAULTLOG → LEDGER → ship view (`setTab('build')`). ESC while the prompt has text clears the prompt first. This extends the existing pure `escapeTarget` rung in `console-model.js` (interaction-spec IX-13, relations-spec IX-R10); the ordering armed tool → dialogue → MOSS-stack → relations-exit → nothing is invariant. |
| **IX-M3** | `↑`/`↓` move the ledger selection, clamped at both ends (no wrap — a wrapping list in a diagnostic table is a misread waiting to happen). `PageUp`/`PageDown`/`Home`/`End` jump. The selected row is the one whose `advisory` renders below the rule. |
| **IX-M4** | `ENTER` on a ledger row opens SYSTEM DETAIL for that row and emits `{k:'moss',op:'sys',tid:id}`. DETAIL shows a spinner-free honest `LOADING…` line until the reply arrives (never a fabricated table). |
| **IX-M5** | `L` opens the FAULT LOG. From LEDGER it opens unfiltered; from DETAIL it opens filtered to that system (`filterId`). `L` again, or ESC, returns. |
| **IX-M6** | `P` opens the PROGRAM screen: the terminal directory from the existing `terminals` channel, and on selection the MOSS IDE for that terminal. (The `moss-programs` lane implements the IDE half; the shell, the key and the directory ship with `moss-screen`.) |
| **IX-M7** | Rows are also **clickable**, and a click selects without activating; a double-click activates (= `ENTER`). Keyboard-first does not mean mouse-hostile. Hit targets span the full row width, as the mock's selection band does. |
| **IX-M8** | The `>` prompt is **always focused by default** on the LEDGER screen: typing anywhere goes to it without clicking. Navigation keys (`↑`/`↓`/`ENTER`/`L`/`P`/`ESC`) are intercepted **before** the prompt only while the prompt buffer is **empty** — once the player has typed a character, `↑`/`↓` are command history and `ENTER` submits. This is the one genuinely fiddly rule in the spec; it must be a table in `moss-model.js` and node-tested in both buffer states. |
| **IX-M9** | Prompt history: `↑`/`↓` on a non-empty buffer walk previously submitted lines (bounded, newest first). Submitting appends. Duplicate consecutive lines collapse. |
| **IX-M10** | Commands: `HELP` · `STATUS` · `OPEN <system>` · `LOG [system]` · `PROG [terminal]` · `CLEAR` · `EXIT`, plus device verbs per IX-M40 and bare property reads (`ship.power`). Verbs and system names are **case-insensitive and space-tolerant** (`open life support` == `OPEN life_support`). An unknown verb answers with the one-line `HELP` pointer, never a stack trace. |
| **IX-M11** | Typing in the MOSS prompt must not fire game shortcuts. The existing guard-first `isTextEntryTarget` rule (interaction-spec) covers this; MOSS's own keys are handled inside the MOSS view only. |
| **IX-M12** | The screen re-renders on every `systems` message, but **selection is preserved by row `id`**, never by index — a row set that changes length must not move the cursor under the player's hand. |
| **IX-M13** | Disconnected/stale: if no `systems` message has arrived, the ledger shows `NO TELEMETRY — LINK DOWN` and the prompt refuses device writes with a typed error. It never shows an empty table that reads as "all systems nominal". |
| **IX-M22** | DETAIL renders, under the device table, a plain-prose **DERIVATION** note stating exactly how this row's LOAD and STATE are computed and what the proxy's limits are (DA-M3). This text is part of the feature, not a comment. |

---

## 4. Visual (VS-M)

The mock is the reference. Deviations must be recorded here with a reason (the relations spec's
VS-R5 is the precedent).

| # | Requirement |
|---|---|
| **VS-M1** | **Palette — phosphor amber on near-black.** Background `#151008`-class true-dark (the mock's page is near-black with a warm cast); primary phosphor `#ff9f45`-class amber; dim/secondary amber at ~55% luminance for the header rule, hints and inactive text; warning amber-white for `⚠`. No blues, no greens, no pure `#fff`. The existing console tokens are *warm* already — reuse them where they match and add a `--moss-*` block rather than editing the shared tokens. |
| **VS-M2** | **Type — one monospace, one size.** Space Mono (already bundled offline under `client/assets/fonts/`, OFL) at a single body size with generous letter-spacing, uppercase for all structural text. Column alignment is by monospace grid, not by CSS table cells — the table must stay aligned when a value is `--`. |
| **VS-M3** | **The selection band** is a full-bleed solid amber row with dark text (inverted), carrying the horizontal scanline texture visible in the mock, and a `>` caret in the left gutter. Unselected rows show a blank gutter of the same width so nothing shifts on move. |
| **VS-M4** | **The load bar** is text, not a DOM widget: `[` + filled cells + stipple cells + `]`, monospace, so it aligns with everything else. The filled run uses solid blocks; the remainder uses a stipple/checker glyph at reduced opacity (the mock's dotted tail). Bar width is fixed at 8 cells. A `-1` load renders `[` + 8 spaces + `]` and `--`. |
| **VS-M5** | **CRT treatment, restrained**: a fine horizontal scanline overlay, a soft vignette, and a subtle text glow. It must remain legible — the treatment is a *skin over correct text*, and if any of it costs readability it goes. It is a single overlay element with `pointer-events:none`, never a per-character effect. |
| **VS-M6** | **Header**: two lines — `MOSS ▮ MODULAR OPERATIONS & SYSTEMS SUPERVISOR — REV 4.2.1` and `PERILUNE HULL {hull} · DAY {day} · UPTIME {uptime}` — then a full-width horizontal rule. A matching rule closes the table above the advisory block. |
| **VS-M7** | **Footer hints** sit at the bottom in dim amber, bracket-key style, per-screen: `[↑↓] SELECT ROW · [ENTER] SYSTEM DETAIL · [L] FAULT LOG · [ESC] BACK TO SHIP`. |
| **VS-M8** | **`⚠`** trails `ATTEND` and `DEGRADED` only. `NOMINAL` and `OFFLINE` carry no glyph. `OFFLINE` renders in dim amber, not warning colour — it is an absence, not an alarm. |
| **VS-M9** | **Responsive floor**: the layout holds down to 1024px wide by reducing padding, and the `LAST FAULT` column truncates with an ellipsis before any other column gives ground. Below that the fault column drops entirely. The table never horizontally scrolls the page. |
| **VS-M10** | **Reduced motion**: the cursor blink and any scanline drift respect `prefers-reduced-motion`. The block cursor becomes a steady block. |

---

## 5. Derivations — the honest table (verify against source; correct with evidence)

Citations are from the read-only survey and **must be re-verified by the `moss-systems` lane**.
`MaintainBelow` / `FailBelow` are per-`DeviceKind` def thresholds (`MachineDefs.cs:38-64`) and give
the NOMINAL / ATTEND / DEGRADED ladder for free: a row is DEGRADED if any member device is below
`FailBelow` (i.e. `!IsOperational`), ATTEND if any is below `MaintainBelow`, else NOMINAL — *unless
a row-specific rule below overrides it*.

| Row | LOAD | STATE | Notes / traps |
|---|---|---|---|
| `reactor` | `Σ DrawKW(wanting) ÷ Σ GenerationKW` over the power network, clamped 0..100 | brownout ⇒ DEGRADED; battery reserve < 25% ⇒ ATTEND | **There is no reactor.** The "reactor" is 2× `SolarWing` (6 kW each) in a room named `reactor` (`RoomOutfitter.cs:20-27`). `ShipMetrics.Power` is **not** this number — it is `served/demand`, a *shed indicator* that saturates at 1.0. Generation is condition-blind by design (`PowerSystem.cs:174-179`). |
| `life_support` | scrubber capacity vs crew CO₂ production (defs × census × `EffectiveRate`) | **worst-room CO₂ ppm bands it** (DA-M4), not capacity | Scrubbers never gate on a CO₂ reading; vents draw from an infinite reserve. The ATTEND/DEGRADED bands must be chosen so the shipping slice's real 500→17,644 ppm arc is *visible*, because it is a real failure. |
| `water_reclaim` | `ShipMetrics.Water` (tank fill fraction) | reclaimer `Condition` ladder; any tank at 0 L ⇒ ATTEND | `tank_hydro` hits 0.0 L on day 1.2 on the shipping slice (a live bug, `ECONOMY-PLAN.md` B-2). This row should show that. |
| `hydroponics` | mean `GrowBed.Progress` | growbed condition ladder; no water available ⇒ ATTEND | Frozen mid-crop beds are the visible symptom of B-2. |
| `thermal` | radiator rejection (5 kW each, `MachineDefs.cs:71`) vs heat load | `ShipMetrics.Heat` bands | The shipped `overheat_guard` rule fires 2,579×/3 days and its message is **backwards** (the ship freezes to −12.9 °C). Do not repeat its claim; report the measured temperature. |
| `fabrication` | powered ÷ total industry devices (`Fabricator`, `MachineShop`, `SalvageRecycler`) | condition ladder | — |
| `hull_integrity` | `ShipMetrics.Structural` = mean `Condition` over devices with `WearPerHour > 0` | breached anchor (probe resolves to room 0) ⇒ DEGRADED; sealed room under `LowPressureKPa` ⇒ ATTEND | **Proxy** — `ShipMetrics.cs:12` says so itself. The breach derivation already exists, deterministic, at `CitizenContext.cs:155-193`; reuse it rather than re-deriving. No breach event is ever published, so `LAST FAULT` is legitimately `—`. |
| `nav_sensors` | `-1` (`--`) | **always `OFFLINE`** while no `Telescope` is placed | `NavSystem` is fully built, saved, hashed and ten-tested, and **provably inert**: no ship generator or authored ship places a `Telescope`, so the sensor pass never runs. Fault text: `NO SENSOR HARDWARE`. If a telescope is ever placed this row must come alive on its own — derive the OFFLINE state from the device census, never hardcode it. |

### 5.1 Fault attribution — a known-weak join, documented not hidden

`AlarmRaisedEvent` carries **no device id**; `HistorySystem.Add` passes `subjectA = 0` for alarms
(`HistorySystem.cs:89`), and `SourceId` is a *string* (the device `Name`, or the terminal id for a
MOSS `alarm()`). So a fault is attributed to a row by **matching device names in the group against
the entry text** — a string join, and the lane must say so in a doc comment.

Two consequences to design around rather than discover later:

1. The 200-entry history ring is roughly **87% brownout spam by day 3** (`MECHANICS.md` §13.8), so
   non-power rows will frequently have no attributable fault. `—` is the correct, honest render.
2. `MaintenanceSystem` publishes **nothing on repair** (`MachineWearSystem.cs:262` — "completion is
   a notice, not an alarm"), so faults can be shown but recoveries cannot. A fault line is
   therefore "the last thing that went wrong", **not** "the current problem". Word the column
   accordingly and say it in the DETAIL derivation note.

---

## 6. Test obligations

| Lane | Must prove |
|---|---|
| `moss-systems` | Determinism (twin sims produce byte-identical `systems` payloads) · InvariantCulture on every number (de-DE probe) · **no hashed state added** (scenario + tick-3000 + slice pins unmoved, asserted as *twin hashes match*, never as a literal) · `nav_sensors` is OFFLINE *because the census finds no `Telescope`*, proven by a test that places one and watches the row come alive · the exec path introduces **no new `ISimCommand`** · an abuse corpus (overlong, malformed, injection-shaped, `ship.*` write attempts) yields typed errors and zero sim mutation. |
| `moss-model` | The IX-M8 key-routing table in **both** buffer states · selection preserved by id across a row-set change (IX-M12) · `loadBar`/`uptimeText`/`faultCell` formatting incl. `-1` sentinels · command parsing incl. case/space tolerance and unknown verbs · **M-PURITY** by source scan · reducers never mutate their argument. |
| `moss-screen` | Full takeover leaves no game chrome visible (IX-M1) · the ESC stack order (IX-M2) · click/double-click row semantics (IX-M7) · reduced-motion (VS-M10) · a live-pixel check that the ledger reads correctly at 1024px and at full width (VS-M9). |

Every package additionally runs `./ci.sh` **in-worktree** and passes an independent Opus gate
(blind spec → CI battery → adversarial/mutation pass → written PASS/FAIL), per `HANDOVER.md`
"The rituals".

---

## 7. Deliberate non-goals for v1

- **No LLM prose on this screen.** The advisory line is host-derived and deterministic. A crew
  member's *opinion* about the reactor belongs in dialogue, where it is attributable to a person.
- **No writes to `ship.*` or rooms.** They are read-only in the DSL and stay read-only here.
- **No new `DeviceKind`s.** Making the mock's medical/comms/grav rows true is real content work
  with a hash move behind it, and it is not this feature (see DA-M2).
- **The `dryrun` op stays unbuilt** — it remains reserved (`HANDOVER.md` backlog).
