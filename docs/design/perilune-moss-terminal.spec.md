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
{"type":"systems","hull":"7741","day":213,"uptime":184036640,
 "rows":[[id,label,load,state,faultDay,faultText,advisory],...]}
```

| field | type | meaning |
|---|---|---|
| `hull` | string | Ship designation. Deterministic from the world seed — a **name**, not a gauge (DA-M1 does not apply to identity strings). Stable for a given ship. |
| `day` | int | `TickCount / SimClockUtil.TicksPerDay`. |
| `uptime` | int | Raw `TickCount`. The client formats it (§2, `uptimeText`) — the host never ships a preformatted duration, because that is a culture bug waiting to happen on this de-DE machine. **[CORRECTED]** `Simulation.TickCount` is a 64-bit `long` and ships as one; JSON draws no int/long distinction, but a reader must not assume it fits in 32 bits forever. |
| `id` | string | Stable snake_case key: `reactor`, `life_support`, `water_reclaim`, `hydroponics`, `thermal`, `fabrication`, `hull_integrity`, `nav_sensors`. Used by `moss sys` and by `open <system>`. |
| `label` | string | Display text, already uppercase (`LIFE SUPPORT`, `NAV / SENSORS`). |
| `load` | int | `0..100`, or **`-1`** meaning "no meaningful load" → renders an empty bar and `--`. |
| `state` | int | `0` NOMINAL · `1` ATTEND · `2` DEGRADED · `3` OFFLINE. Append-only ladder. |
| `faultDay` | int | Day of the newest attributable fault, or **`-1`** for none. **No row ever invents a day**: `-1` unless a real history entry attributes to the row. |
| `faultText` | string | Fault summary, uppercase, no day prefix (the client composes `DAY {n} · {text}`). `""` when `faultDay` is `-1`. |
| `advisory` | string | One or two sentences of plain prose about this row, rendered under the rule when the row is selected (the mock's `> REACTOR: coolant loop B running 4°K warm…`). `""` renders nothing. Host-derived, deterministic, **never LLM text**. |

Rows are emitted in the fixed order above (presentation order is a host decision, not a client
sort — same rule as the relations ring).

### 1.2 `moss` op `sys` — system detail, on demand

DETAIL is **not** on the pushed channel: a per-device breakdown would re-send on every condition
tick and dwarf the ledger. It is fetched like `moss open`/`moss audit`.

> **[CORRECTED] MOSS ops are keyed by `"type"`, not `"cmd"` — in §1.2 and §1.3 both.** The survey
> wrote `{"cmd":"moss",…}`, which is silently dropped: `WebCommand.Parse` reads `"cmd"` first and, if
> it is non-null, switches and **returns without falling through** to the `"type"` switch
> (`GameSession.cs:1249-1262`). `"moss"` is not a case there, so it hits `default` → `Kind.Unknown` →
> ignored by the session, with no error anywhere. The doc comment at `GameSession.cs:1244-1246`
> states the split, and the three shipped ops (`open`/`set`/`audit`) already use `"type"`. `sys` and
> `exec` join the SAME `HandleMoss` switch `CmdKind.Moss` already routes to: no new command family,
> no new parse branch. A test drives both ops through the real `Parse` for exactly this reason — a
> handler test that constructs a `WebCommand` directly cannot see a dropped command.

```
→ {"type":"moss","op":"sys","tid":"reactor"}
← {"type":"moss","ev":"sys","tid":"reactor","derivation":"…",
   "devices":[[name,kind,condition,powered,rate,deck,x,y,note],...]}
```

> **Amended 2026-07-22 by `moss-screen`, with evidence.** §1.2 and §1.3 originally wrote the
> *request* as `{"cmd":"moss",...}`. That message is **silently dropped by the shipped host**:
> `GameSession.WebCommand.Parse` (`hosts/web/GameSession.cs:955-968`) dispatches anything carrying
> a `"cmd"` key through the view-command switch, which has no `moss` case and falls to `default`
> ⇒ `Kind.Unknown` ⇒ ignored. The whole MOSS family — like `talk`/`say`/`bye`/`chron`/`bio` — is
> keyed by `"type"` (`GameSession.cs:975-986`), which is also what the existing client helper
> `Cmd.moss` already emits (`client/src/wire/session.js:71`). Requests are therefore `"type"`-keyed
> here and in §1.3. Pinned by `client/test/moss-screen.test.js` ("MOSS wire ops are keyed by type").

`condition` and `rate` are ints `0..100`, **or `-1` when the underlying float is not finite** (percent —
the wire carries no floats for these; the sim holds `Condition`/`Rate` as `0..1` floats and the host
rounds once, `MidpointRounding.AwayFromZero`, InvariantCulture). A `-1` here means *unreadable*, not
zero, and the row's `note` says `READING NOT FINITE`. `powered` is `0|1`. `kind` is the append-only `DeviceKind` byte. `note` is `""` or
a short reason string (`"FAILED"`, `"UNWIRED"`, `"UNPOWERED"`, `"WORN — MAINTENANCE DUE"`,
`"READING NOT FINITE"`). **[CORRECTED]** A `WaterTank` always prints its LITRES here
(`"497.1 L"`, `"0.0 L — DRY, BELOW ONE DRINK"`), because `water_reclaim`'s STATE turns on a level no
other column shows: the slice's dry tank holds **0.02 L, not 0**, and a player told "a tank is dry"
with no way to see the number would reasonably conclude the row is broken. This uses the existing
`note` field — the device tuple shape is unchanged, so `moss-model` needs no update.

> **[CORRECTED — additive contract change, `moss-model` please read.]** `derivation` is a **new
> APPEND-ONLY top-level field** carrying IX-M22's plain-prose DERIVATION note. It costs a reader that
> ignores it nothing, and it closes a real hole: §2's `detailView` promised `notes` with no wire
> source, so the only way to render IX-M22 would have been to hardcode the prose client-side — a
> second, unversioned copy of a derivation, free to drift out of truth from the code it describes.
> That is exactly the failure DA-M3 exists to prevent, on the one screen least able to afford it. The
> note now ships from the host that computed the row (`ShipSystems.Derivation`), deterministic and
> never LLM text. **`moss-model`: take `notes` from `msg.derivation`, do not author it.**

### 1.3 `moss` op `exec` — the command prompt

```
→ {"type":"moss","op":"exec","tid":"@console","text":"close door_storage"}
← {"type":"moss","ev":"exec","tid":"@console","ok":true,"lines":[[stream,"text"],...]}
```

`stream` is `0` echo · `1` output · `2` error. `ok` is false when the line did not parse or the
target did not resolve.

**Stream 0 is not rendered by this client** (amended 2026-07-22, `moss-model` lane). The client
echoes the player's line into the `>` transcript at *submit* time, before the request leaves —
instantly, and whether or not the link is alive — so also rendering the host's echo prints every
command twice. This is the same rule `ConversationHub` follows for player speech (emit at dispatch,
do not wait for the round trip). `moss-systems` may keep emitting stream 0 for the audit ring and
for other consumers; it is simply not load-bearing for this screen, and a reply whose *only* line is
a stream-0 echo renders nothing (a failed one still surfaces its failure).

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

**[AS BUILT] The host parses; the adapters decide.** `GameSession.ExecConsole` tokenises the line and
hands the verb straight to `IScriptable.TryInvoke` on the target it resolved from `_host.Registry` —
the same registry `MossBindings.RegisterAdapters` fills for the interpreter. The whitelist is
therefore inherited literally: add a verb to `DoorAdapter` and it works at the prompt with no second
list to update, and `ship`/rooms stay read-only because `ShipMetricsAdapter`/`RoomAdapter` refuse
every verb. Running the line through `MossCompiler`/`Interpreter` instead was **investigated and
rejected** — recorded here so nobody re-opens it:

1. the prompt's grammar is not MOSS's (`close door_storage` vs `close(door_storage)`), so a
   translation step is unavoidable either way;
2. `Interpreter`, `MossAuditLog` and `MossRuntimeException` are all `internal` to `Sim.Dsl`;
3. **decisively**, `ScriptRuntime.SetProgram("@console", …)` registers a ProgramState that
   `ScriptRuntime.StateChecksum` enumerates — a player *typo* would move the determinism hash — and a
   failing statement publishes an `AlarmRaisedEvent` that `HistorySystem` (an `IStatefulSystem`)
   folds into its own checksum. Either alone disqualifies it for a feature that adds no hashed state.

**[AS BUILT] Host-side vs client-side verbs.** The host `exec` op owns the **device verbs**, the
**bare property reads**, and `help`. The navigation verbs (`status`, `open <system>`, `log`, `prog`,
`clear`, `exit`) are pure client state and never need a round trip — `moss-model` resolves them as
`kind:'nav'` and they should not be sent. An unknown verb answers `UNKNOWN COMMAND '…' — TYPE HELP`,
`ok:false`, never a stack trace.

**IX-M41 — reads are free, writes are audited.** `status`, `open`, `log`, `prog`, `help`, `clear`,
`exit`, and property reads (`ship.power`, `hydro.co2`, `vent_ls.rate`) are pure client/host reads.
Every *write* additionally appends to the `@console` audit ring so the player's own commands sit
in the same log as the DSL's, attributable and reviewable. **[AS BUILT]** That ring is **host-side**
(a bounded 64-entry list on `GameSession`, matching `MossAuditLog.Capacity`) and is served by the
existing `moss audit` op when `tid == "@console"`. It is deliberately *not* a `ScriptRuntime`
per-program ring, for reason (3) under IX-M40. Entries use the interpreter's own text shape —
`close(door_aft)`, `set(vent_ls.rate, 0.5)` — so player and program lines read as peers.

### 1.4 `moss` op `pods` — the POD BAY (added 2026-08-01, M3-4)

```
→ {"type":"moss","op":"pods","tid":"@console"}
← {"type":"moss","ev":"pods","tid":"@console","term":"term_moss","moss":"COMMISSIONED",
   "note":"HEADROOM FOR 2 CREW …","rows":[[n,pod,occupant,state,stateWord,why,reason,can],…]}
```

`state` is the append-only code `0 OPEN · 1 SEALED · 2 NO SIGNAL · 3 CYCLING` and `stateWord` is its
word; `why` is the `ThawRefusal` ordinal and `reason` is `ThawGate.DescribeRow`'s sentence; `can` is
`0|1`, the gate's own verdict. **Both halves of each pair ship** for the reason §1.3's thaw reply
gives: a code with no sentence is unrenderable and a sentence with no code is unstylable. `can` is
carried explicitly rather than derived from `why == 0` so that no client is ever tempted to compute
thawability from a state word.

`term` is the console the SIM resolved (`ThawGate.CommissionedConsoleName`) — the prompt addresses
the `@console` pseudo-tid, which has no device behind it, and `Device.Scriptable` has never reached
the wire, so a client choosing a terminal would be guessing at the one fact the gate turns on. **The
client sends `term` straight back with a `thaw`.**

⛔ **The op is REFUSED, never answered with an empty bay.** Ship gate first
(`MossGate.IsServerLive` ⇒ the OFFLINE sentence), then the commissioned tier (⇒ the CONTROLLER
MODULE sentence) — worst-first, ship before target, the same ordering §1.2's ops use. Both refusals
travel as an ordinary `ev:exec` stream-2 line, so they render on whatever screen the player is on.
⚠️ **The bay is a request/reply op, not a pushed channel**, and the client polls it (1 Hz) while the
screen is up: `GameSession.Send` drops a byte-identical channel payload, so re-asking on the pushed
`systems` message would stall exactly on a quiet ship.

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
export function keyPress(model, key, mods);          // ArrowUp/Down, Enter, Escape, Tab, PageUp/Down, Home/End
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

**[CORRECTED] `detailView`'s `notes` comes off the wire**, from the `derivation` field the `sys`
reply now carries (§1.2). The model formats and wraps it; it does not author it. There is exactly one
copy of every derivation's prose, and it lives next to the code that computes the derivation.

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

> **Amended 2026-07-31 by `moss-hotkeys` (OD-P).** The `keyPress` comment above enumerated `l/L`
> among the keys the model sees. That is no longer true and the SIGNATURE is unchanged — this is a
> comment fix, recorded because §2 is the block a future lane copies its stub from, and a stale
> enumeration there is how a deleted binding gets quietly re-added. **No printable character is
> passed to the model as a navigation key**; `keyPress` sees them, routes them `'pass'`, and reports
> `handled:false` so the DOM lets them type. See the OD-P note under §3's table for the ruling and
> the ENTER rule it adds off the LEDGER.

### 2.1 What the DOM lane consumes (reconciled 2026-07-22 against `lane/moss-model` `b17d451`)

§2 froze the *signatures* but not the *shapes* they return. The model lane's landed bodies settle
them; this records what `moss-screen.js` actually reads, so a future change to either side has one
place to check.

| read | shape |
|---|---|
| `model.screen` · `model.prompt` · `model.detail.tid` · `model.selectedId` | the screen switch, the prompt echo, the DETAIL subject, the id-keyed selection |
| `keyPress()` | `{model, effects, handled, route}` — **`handled` is load-bearing** (below) |
| `ledgerView()` | `{rows, selectedIndex, advisory, linked, notice}` |
| `ledgerView().rows[i]` | **already formatted**: `{id,label,load,bar,loadText,state,stateText,warn,fault,advisory,selected}` |
| `detailView().devices[i]` | **already formatted**: `{name,kind,conditionText,poweredText,rateText,place,note,…}` |
| `detailView().notes` | `string[]` — derivation prose, `FAULT_CAVEAT` last |
| `faultLogView()` | `{title, entries:{day,text,live}[], filterId:string|null}`; the title ALREADY names the filtered system |
| `consoleLines()[i]` | `{stream:0\|1\|2, text}` — stream 0 already carries its own `> ` |
| `footerHints()` | `string[]`; the DOM joins with ` · ` (VS-M7) |

Three rulings the DOM depends on:

- **`handled` decides `preventDefault`, not "did anything change".** The screen offers every key to
  `keyPress` and swallows it only when the model claims it, which is IX-M8's table applied without
  the DOM re-implementing it. The earlier heuristic ("did the model return a new object?") is wrong
  in both directions — a clamped `ArrowUp` at row 0 changes nothing yet IS handled.
- **`keyPress` is the only entry point for `Enter`**; with a non-empty buffer it submits.
- **`linked`, not `rows.length`, is IX-M13's verdict.** "The link is down" and "the link is up and
  reports nothing" are different claims and the screen renders them differently.

**IX-M7 still has no reducer, and that costs the DOM a workaround worth naming.** A row click is
expressed by walking the clamped `ArrowUp`/`ArrowDown` navigation — but IX-M8 routes those keys to
command *history* once the prompt has text, so `moss-screen.js:_selectIndex` must run the walk on a
prompt-cleared copy of the model and restore the buffer afterwards. It is correct and node-tested
("a row click with a half-typed command moves the CURSOR, not the command line"), but it is a
workaround for a missing verb. **Follow-up contract request: add `selectRow(model, id) → model`**
(pure, no effects) and let the click be one call. Not taken now because it would mean editing
another lane's file mid-flight.

---

## 3. Interaction (IX-M)

| # | Requirement |
|---|---|
| **IX-M1** | Activating the `MOSS` tab **replaces the whole window**. The top bar, CREW WATCH, READOUT, the stage and the bottom console are all hidden — not merely covered. Nothing of the game console shows through. Any other tab restores the ship view. The ship canvas and `composeScene`/executors are never touched; MOSS simply is not drawing them. |
| **IX-M2** | **ESC is the way out** and it is a stack, innermost first: PROGRAM → DETAIL/FAULTLOG → LEDGER → ship view (`setTab('build')`). ESC while the prompt has text clears the prompt first. This extends the existing pure `escapeTarget` rung in `console-model.js` (interaction-spec IX-13, relations-spec IX-R10); the ordering armed tool → dialogue → MOSS-stack → relations-exit → nothing is invariant. |
| **IX-M3** | `↑`/`↓` move the ledger selection, clamped at both ends (no wrap — a wrapping list in a diagnostic table is a misread waiting to happen). `PageUp`/`PageDown`/`Home`/`End` jump. The selected row is the one whose `advisory` renders below the rule. |
| **IX-M4** | `ENTER` on a ledger row opens SYSTEM DETAIL for that row and emits `{k:'moss',op:'sys',tid:id}`. DETAIL shows a spinner-free honest `LOADING…` line until the reply arrives (never a fabricated table). |
| **IX-M5** | `LOG` opens the FAULT LOG. From LEDGER it opens unfiltered; from DETAIL it opens filtered to that system (`filterId`); `LOG <system>` names the filter explicitly. ESC returns. **Amended 2026-07-31 (OD-P) — see the note below this table:** the verb was the `L` key, which is deleted; a bare `LOG` inherits the current screen's subject, which is the whole of what `L` did, and ESC is now the only close (a command is not a toggle). |
| **IX-M6** | `PROG` opens the PROGRAM screen: the terminal directory from the existing `terminals` channel, and on selection the MOSS IDE for that terminal. `PROG <terminal>` opens straight into one terminal's source. (The `moss-programs` lane implements the IDE half; the shell, the command and the directory ship with `moss-screen`.) **Amended 2026-07-31 (OD-P):** the verb was the `P` key, which is deleted. |
| **IX-M7** | Rows are also **clickable**, and a click selects without activating; a double-click activates (= `ENTER`). Keyboard-first does not mean mouse-hostile. Hit targets span the full row width, as the mock's selection band does. |
| **IX-M8** | The `>` prompt is **always focused by default** on the LEDGER screen: typing anywhere goes to it without clicking. Navigation keys (`↑`/`↓`/`ENTER`/`L`/`P`/`ESC`) are intercepted **before** the prompt only while the prompt buffer is **empty** — once the player has typed a character, `↑`/`↓` are command history and `ENTER` submits. This is the one genuinely fiddly rule in the spec; it must be a table in `moss-model.js` and node-tested in both buffer states. **Clarified 2026-07-22** (the enumerated set above is `↑ ↓ ENTER L P ESC`, but IX-M3 gives `PageUp`/`PageDown`/`Home`/`End` a ledger meaning too, so the two rules were ambiguous together): `PageUp`/`PageDown` stay **navigation in both buffer states**, because they cannot type a character and mean nothing in a one-line input; `Home`/`End` are navigation only while the buffer is empty and otherwise belong to the text cursor. A held `Ctrl`/`Alt`/`Meta` always passes the key to the browser (`Ctrl-L` is not ours); `Shift` alone does not change routing. **Amended 2026-07-31 (OD-P) — see the note below this table:** `L` and `P` are **struck from the intercepted set**, which is now `↑ ↓ ENTER ESC PageUp PageDown Home End` — no printable character is routed in either buffer state. One rule is added: `ENTER` on a **non-empty** buffer submits on **every screen that shows the prompt** (LEDGER, DETAIL, FAULTLOG), because a letter typed there now lands in that buffer and the line must be sendable; PROGRAM is unchanged (its IDE owns the keys). |
| **IX-M9** | Prompt history: `↑`/`↓` on a non-empty buffer walk previously submitted lines (bounded, newest first). Submitting appends. Duplicate consecutive lines collapse. |
| **IX-M10** | Commands: `HELP` · `STATUS` · `OPEN <system>` · `LOG [system]` · `PROG [terminal]` · `PODS` · `THAW <n\|capsule\|name>` · `CLEAR` · `EXIT`, plus device verbs per IX-M40 and bare property reads (`ship.power`). **Amended 2026-08-01 (M3-4):** `PODS` and `THAW` are the POD BAY's two words — see **IX-M14** below. Verbs and system names are **case-insensitive and space-tolerant** (`open life support` == `OPEN life_support`). An unknown verb answers with the one-line `HELP` pointer, never a stack trace. |
| **IX-M11** | Typing in the MOSS prompt must not fire game shortcuts. The existing guard-first `isTextEntryTarget` rule (interaction-spec) covers this; MOSS's own keys are handled inside the MOSS view only. |
| **IX-M12** | The screen re-renders on every `systems` message, but **selection is preserved by row `id`**, never by index — a row set that changes length must not move the cursor under the player's hand. |
| **IX-M13** | Disconnected/stale: if no `systems` message has arrived, the ledger shows `NO TELEMETRY — LINK DOWN` and the prompt refuses device writes with a typed error. It never shows an empty table that reads as "all systems nominal". |
| **IX-M14** | **⭐ Added 2026-08-01 by `pod-bay` (M3-4).** `PODS` opens the **POD BAY**, the fifth screen: one row per cryo capsule — `# · OCCUPANT · STATE · WHY / WHAT IT NEEDS` — where STATE is `OPEN`/`SEALED`/`NO SIGNAL`/`CYCLING` and **every closed row states why it will not cycle, with the number that produced it** (OD-L). ⛔ **Unlike every other screen here, the COMMAND does not open it — the REPLY does.** The bay is COMMISSION-gated (M3-3 term 2), so the ask can come back as a refusal, and a screen opened by the command would sit empty beside the sentence explaining why it is empty. The header names the console and **which of OD-N's three MOSS states it is in** (DARK · REPAIRED · COMMISSIONED); the other two states are stated by the refusal on the transcript, at the point of the ask (RW §2.2). `↑`/`↓`/`PageUp`/`PageDown`/`Home`/`End` move the capsule cursor, `ENTER` thaws the selected one, and `THAW <n\|capsule\|name>` does the same from the prompt — **one rule, three doors** (RW §8.4 rung 3): all three ask the row's own `can` bit, which is `ThawGate.Evaluate`'s verdict, and a refused capsule answers with the gate's own sentence. A thaw is **single-flight** until the bay's own rows show the ship moved. No printable key is bound (OD-P holds). |
| **IX-M22** | DETAIL renders, under the device table, a plain-prose **DERIVATION** note stating exactly how this row's LOAD and STATE are computed and what the proxy's limits are (DA-M3). This text is part of the feature, not a comment. |

> **Amended 2026-07-31 by `moss-hotkeys`, on an owner decision (OD-P).** The single-letter screen
> keys `L` (FAULT LOG) and `P` (PROGRAM) are **deleted**, and no printable character may be bound
> again. Verbatim: *"I do not like these shortcuts like 'L' or 'P' — we need to expand the MOSS OS
> and part might be 'ls' command later, to read directories.. but as soon as we press l, the log
> opens."* With MOSS as the ship's OS (OD-N), **the console is a real terminal: a printable
> character always types into the prompt, and every screen is reached by a typed command** — the
> `LOG` / `PROG` / `OPEN` / `STATUS` / `CLEAR` / `EXIT` vocabulary IX-M10 already defines and
> `GameSession.ConsoleHelp` already advertises. Only keys a terminal also owns (`ENTER`, `ESC`,
> arrows, `PageUp`/`PageDown`, `Home`/`End`, `TAB`) navigate. This touches IX-M5, IX-M6, IX-M8 and
> VS-M7 above; §2's frozen model signatures are unchanged — `KEY_ROUTE` lost two rows of DATA.
>
> Two consequences worth stating, because a weaker replacement would have been the easy mistake:
> a bare `LOG` **inherits the current screen's subject**, so the DETAIL-filtered log `L` used to
> open is still one word; and `ENTER` now submits on DETAIL/FAULTLOG when the buffer is non-empty,
> without which the prompt on those screens would visibly accept a command and silently drop it.
> Pinned by `client/test/moss-model.test.js` (the four `OD-P:` tests, incl. a class-wide guard that
> no single-character key is in `KEY_ROUTE`) and `client/test/moss-screen.test.js`.

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
| **VS-M7** | **Footer hints** sit at the bottom in dim amber, per-screen: `[↑↓] SELECT ROW · [ENTER] SYSTEM DETAIL · TYPE: LOG, PROG, HELP · [ESC] BACK TO SHIP`. A bracket is a **key**; a `TYPE:` fragment is a **command line**. **Amended 2026-07-31 (OD-P):** the `[L] FAULT LOG` / `[P] PROGRAMS` hints named keys that no longer exist; the two screens keep their signpost as the words to type. No hint may name a single-letter key again. |
| **VS-M8** | **`⚠`** trails `ATTEND` and `DEGRADED` only. `NOMINAL` and `OFFLINE` carry no glyph. `OFFLINE` renders in dim amber, not warning colour — it is an absence, not an alarm. |
| **VS-M9** | **Responsive floor**: the layout holds down to 1024px wide by reducing padding, and the `LAST FAULT` column truncates with an ellipsis before any other column gives ground. Below that the fault column drops entirely. The table never horizontally scrolls the page. |
| **VS-M10** | **Reduced motion**: the cursor blink and any scanline drift respect `prefers-reduced-motion`. The block cursor becomes a steady block. |

### 4.1 Recorded deviations from the mock (`moss-screen`, 2026-07-22)

Per the rule above, with reasons. Frames: `node client/tools/moss-shot.mjs`.

- **VS-M7a — the key hints are pinned to the bottom of the window, not to the bottom of the
  content.** The mock is a fixed-aspect terminal; a 1440×900 browser window is far taller than the
  ledger's 8 rows, and following the mock literally left the hints floating in the middle of a black
  field. The table, the closing rule, the advisory and the prompt stay packed directly under the
  header exactly as in the mock; only the hint line drops to the floor, which is the ordinary
  terminal status-bar reading. (`.moss-body{flex:0 1 auto}` + `.moss-foot{margin-top:auto}`.)
- **VS-M2a — the measure is capped at `112ch` and centred.** Unbounded, the ledger's ~75-cell line
  sat in the top-left corner of a 2560px panel with 1500px of dead space beside it. The cap is in
  `ch`, so the measure follows the type rather than a pixel guess, and the type itself is
  `clamp(12px, 1.05vw, 21px)` — one size per viewport, never a reflow of the grid (VS-M2 holds).
- **VS-M8a — the `⚠` cell is width-pinned in CSS (`width:calc(1ch + letter-spacing)`).** Space Mono
  has no `⚠`, so it comes from a fallback face whose advance is not one cell; without the pin, an
  `ATTEND ⚠` row would push `LAST FAULT` a fraction of a cell out of line with its neighbours. The
  column text itself is still space-padded to the grid — this pins one glyph, not a layout.
- **VS-M4a — the load-bar cell is width-pinned the same way**, for the same reason: `█` and `▒` also
  come from a fallback face, so `[████▒▒▒▒]` and `[        ]` do not advance identically and every
  column after them sat ~1.2px apart between a loaded row and a `--` row.
- **The vignette scales with the viewport** (`clamp(90px,9vw,200px)`) rather than a fixed spread: at
  1024px a fixed 180px vignette swallowed a quarter of the screen, which is the "costs legibility ⇒
  it goes" clause of VS-M5 applied to its own treatment.

---

## 5. Derivations — the honest table (AS BUILT, 2026-07-22)

**Built and verified** by the `moss-systems` lane in `sim/Sim.Core/ShipSystems.cs`. Rows marked
**[CORRECTED]** differ from the read-only survey this spec was written from; each carries its
evidence. Every citation below was re-verified against source.

`MaintainBelow` / `FailBelow` are per-`DeviceKind` def thresholds (`MachineDefs.cs:38-64`) and give
the NOMINAL / ATTEND / DEGRADED ladder for free: a row is DEGRADED if any member device is below
`FailBelow` (i.e. `!IsOperational`), ATTEND if any is below `MaintainBelow`, else NOMINAL — *unless
a row-specific rule below overrides it*.

> **[CORRECTED] LOAD is the row's PRIMARY GAUGE, not uniformly a utilisation.** The survey's table
> already mixes three meanings (utilisation, fill level, crop progress, mean condition) and that is
> fine — but it must be *said*, because a column headed LOAD that silently means four things is the
> same class of misread as an invented number. Each row's DETAIL screen states which it is
> (`ShipSystems.Derivation`, IX-M22).
>
> **[CORRECTED] `ShipSystems.Compute` takes an optional second argument, the `HistorySystem`.**
> History is not on `Simulation` — it is a stack system the host owns (`SimHost.History`). A caller
> without one gets a complete ledger whose LAST FAULT column is honestly empty. No new sim state.
>
> **[CORRECTED] A row whose hardware does not exist is OFFLINE with a stated reason, load `-1`** —
> generalised from `nav_sensors` to every row (DA-M1 already implies it): `fabrication` with no
> industry machines, `water_reclaim` with no tanks and no reclaimer, `hydroponics` with no beds,
> `reactor` with nothing that generates. **The reason goes in `advisory`, never in `faultText`**: an
> absence of hardware is not a fault and has no day (see `nav_sensors` below).
>
> **[CORRECTED] A non-finite reading is OFFLINE with a stated reason, never a healthy zero.** If any
> input a row consumes is `NaN` or infinite, the row renders load `-1`, STATE `OFFLINE` and an
> `INSTRUMENT UNREADABLE` advisory naming the instrument. This was a real laundering path: `Pct(NaN)`
> returned 0, `Fixed1(NaN)` printed `"0.0"`, and a NaN room lost every comparison silently while
> still counting as pressurised — so one poisoned float rendered **eight NOMINAL rows** and a
> fabricated `mean O2 0%`, while the command prompt read the same field back as `NaN`. The two halves
> of one feature disagreeing about one number is the worst possible failure on a screen whose purpose
> is "the truth about this ship". The prompt additionally **rejects non-finite `set` values**
> (`NumberStyles.Float` parses the `NaN` symbol, and both `UtilityDeviceAdapter`'s `< 0f` guard and
> `Commands.cs:47`'s clamp are NaN-blind) — but the *rendering* fix is the load-bearing one, since a
> MOSS program can already reach NaN through `0/0` (`Interpreter.cs:407-408`), so this is not an
> IX-M40 authority question.
>
> **[CORRECTED] Every row's DERIVATION note ends with the same caveat**, because it is true of every
> row and a player must not read LAST FAULT as "the current problem": *"LAST FAULT is the last thing
> that went wrong on this row, NOT the current problem: nothing is published when a machine is
> repaired, so a fault line never clears itself."* (§5.1 consequence 2, `MachineWearSystem.cs:262`.)

| Row | LOAD | STATE | Notes / traps |
|---|---|---|---|
| `reactor` | `Σ DrawKW(wanting) ÷ Σ GenerationKW` over wired devices — **[CORRECTED]** the DENOMINATOR carries the off-grid gate too (`PowerSystem.cs:184` skips off-grid devices entirely, generation and battery charge included). Ungated, one stray unwired `SolarWing` took the row from `LOAD 50%` to `LOAD 25%`: a player deconstructing a conduit run would watch the reactor report the ship as *less* loaded. Clamped 0..100. "Wanting" mirrors the private `PowerSystem.IsWanting` (`PowerSystem.cs:262-266`): a vent only wants power while open. | brownout ⇒ DEGRADED; **[CORRECTED]** generating hardware aboard but *none of it wired* ⇒ DEGRADED (otherwise a ship with no conduits renders a quiet `--`/NOMINAL while every device is dark); battery reserve < 25% of WIRED capacity ⇒ ATTEND | **There is no reactor.** The "reactor" is 2× `SolarWing` (6 kW each) in a room named `reactor` (`RoomOutfitter.cs:20-27`). `ShipMetrics.Power` is **not** this number — it is `served/demand`, a *shed indicator* that saturates at 1.0. Generation is condition-blind by design (`PowerSystem.cs:174-189`). **[CORRECTED]** `PowerSystem` exposes no brownout accessor (`_wasBrownout` is private, `PowerSystem.cs:71`), so the brownout is derived from its OBSERVABLE consequence: a wanting, wired, drawing device whose `Powered` is false has been shed by the tier walk (`PowerSystem.cs:203-234` stamps exactly that). No new public API on a spine file. |
| `life_support` | crew CO₂ production ÷ scrubber removal capacity (`atmosphere.def` × living census × `EffectiveRate`) | **worst-room CO₂ ppm bands it** (DA-M4), not capacity | Scrubbers never gate on a CO₂ reading; vents draw from an infinite reserve. **[CORRECTED — bands now chosen]**: `< 1,000` NOMINAL · `≥ 1,000` ATTEND · `≥ 2,000` DEGRADED · `≥ needs.def co2_narcosis_ppm` (40,000) OFFLINE. The 1,000/2,000 figures are the "stale"/"bad" wording the crew themselves use (`CitizenContext.cs:67,69`); the narcosis figure is read live from `sim.Defs` because it is the ppm number with a *damage* consumer (`NeedsSystem.cs:130,132` — **[CORRECTED]** an earlier revision cited `:52`, which is class-doc prose about SocialSystem; the spec claimed every citation was re-verified and this one was not). **[CORRECTED — ppO₂ too]** STATE is the WORSE of the CO₂ ladder and a worst-room ppO₂ ladder (`< hypoxia_ppo2_kpa` DEGRADED, `< severe_hypoxia_ppo2_kpa` OFFLINE). DA-M4’s own logic — band off the measured quantity that damages crew — applies identically to oxygen, and `NeedsSystem.cs:130,132` reads ppO₂ and CO₂ through the *same* two-rung test. Banding on CO₂ alone let a single hypoxic compartment sit behind a NOMINAL row on the screen named LIFE SUPPORT, contradicted only by a ship-wide MEAN in the advisory — and a mean is exactly what hides one bad room. No ATTEND rung for ppO₂: `needs.def` defines no third threshold and this row does not invent one. Not reachable on the slice. Measured on the slice this puts the row at DEGRADED from day 1 (6,060 ppm) through day 3 (16,677 ppm) while LOAD stays at 52–58% — i.e. the bar says "coping" and the STATE says "poisoned", which is the truth. |
| `water_reclaim` | stored litres ÷ total tank capacity (== `ShipMetrics.Water`) | reclaimer/tank condition ladder; **[CORRECTED]** any tank holding less than one drink (`sustenance.def drink_liters`, 0.5 L) ⇒ ATTEND | `tank_hydro` runs dry on the shipping slice (a live bug, `ECONOMY-PLAN.md` B-2). **The survey's `= 0 L` test does not catch it**: measured at day 3 the tank holds **0.02 L**, so a literal zero test reads NOMINAL and hides the exact failure this row exists to show. `< drink_liters` is the sim's OWN dry test — a tank below it is invisible to a thirsty crew member (`SustenanceSystem.cs:126,220,261`). With it the row reads ATTEND at day 3, as it should. |
| `hydroponics` | mean `GrowBed.Progress` | growbed condition ladder; a bed whose fluid network cannot cover one second of irrigation ⇒ ATTEND | Frozen mid-crop beds are the visible symptom of B-2. The dry test mirrors `WaterSystem.TryDrawWater` (`WaterSystem.cs:215-228`) **read-only**, epsilon included — `TryDrawWater` itself mutates and is never called from the report. Known cold-start artifact: at tick 0 no fluid network exists yet, so every bed reads dry for that one instant. That is what `HydroponicsSystem` would also find at tick 0. |
| `thermal` | total waste heat (powered operational `HeatKW` + `thermal.def citizen_heat_w` × living crew) ÷ radiator rejection (`RadiatorRejectKW` × `EffectiveRate`). **[CORRECTED]** DOORS and devices whose tile resolves to vacuum/a door marker are excluded, matching all four of `ThermalSystem`'s gates rather than only the vent one: a door is a conduction edge and its `HeatKW` is dropped by design (`ThermalSystem.cs:70-78`), and a device in no room heats nothing (`:83`). The slice has 19 powered doors worth 0.95 kW — a ~6% overstatement of ship waste heat. | **[CORRECTED]** measured room temperature, not `ShipMetrics.Heat`: any pressurised compartment outside `needs.def hypothermia_c … heat_stroke_c` ⇒ DEGRADED, outside 10–35 °C ⇒ ATTEND | The shipped `overheat_guard` rule fires 2,579×/3 days and its message is **backwards** (the ship freezes to −12.9 °C). Do not repeat its claim; report the measured temperature. **Why the correction:** `ShipMetrics.Heat` is a *count* of rooms in the comfort band, so it can read a healthy 0.95 while one compartment sits at −13 °C inflicting hypoxia-rate damage on anyone who walks in. Banding off the danger thresholds — the only temperatures with a real consumer (`NeedsSystem`) — is what "report the measured temperature" actually requires. Measured on the slice: NOMINAL day 0 → ATTEND day 1 (3.9 °C) → DEGRADED day 3 (−15.7 °C). |
| `fabrication` | powered+operational ÷ total industry devices (`Fabricator`, `MachineShop`, `SalvageRecycler`) | condition ladder; none aboard ⇒ OFFLINE | Powered is not busy — no machine exposes a run-state (`ThermalSystem.cs:103-106` documents the same gap), so an idle powered fabricator is indistinguishable from a working one. Said in the DETAIL note. |
| `hull_integrity` | `ShipMetrics.Structural` = mean `Condition` over devices with `WearPerHour > 0` | breached anchor (probe resolves to room 0) ⇒ DEGRADED; sealed room under `LowPressureKPa` (80) ⇒ ATTEND | **Proxy** — `ShipMetrics.cs:12` says so itself. The breach derivation is reused from `CitizenContext.cs:155-193` (mirrored, not referenced: `Sim.Core` must not depend on `Sim.Llm`). **[CORRECTED]** This row makes **no history join at all**, rather than one that finds nothing: nothing publishes a breach event, so any name match here would be an unrelated maintenance alarm rendered as a hull fault. `LAST FAULT` is `—` by construction. |
| `nav_sensors` | `-1` (`--`) while no telescope exists; once one is placed, powered+operational ÷ total | **`OFFLINE` derived from the device census** finding no `Telescope`. **[CORRECTED]** `faultDay` is `-1` and `faultText` is `""`; the reason lives in `advisory` (`NO SENSOR HARDWARE — no telescope is installed…`). | `NavSystem` is fully built, saved, hashed and ten-tested, and **provably inert**: its sensor pass is gated on `AnyPoweredTelescope` (`NavSystem.cs:104,121-128`) and no ship generator or authored ship places one. Never hardcoded — a test places a telescope and watches the row come alive, then wrecks it and watches the ladder (not a hardcode) put it back to OFFLINE. **Why the correction:** the survey's `NO SENSOR HARDWARE` *fault text* contradicts §1.1 (`faultText` is `""` when `faultDay` is `-1`), and §1.1 is the one that is right. An absence of hardware is not a fault and has no day; the only way to render it as one is to fabricate a timestamp, which collapses to `DAY 0 · NO SENSOR HARDWARE` on a diagnostic screen — exactly what DA-M1 forbids. STATE already says `OFFLINE`; ADVISORY says why. |

### 5.1 Fault attribution — a known-weak join, documented not hidden

`AlarmRaisedEvent` carries **no device id**; `HistorySystem.Add` passes `subjectA = 0` for alarms
(`HistorySystem.cs:89`), and `SourceId` is a *string* (the device `Name`, or the terminal id for a
MOSS `alarm()`). So a fault is attributed to a row by **matching device names in the group against
the entry text** — a string join, and the lane must say so in a doc comment.

**[CORRECTED] A row may additionally declare one structural `HistoryKind` as its own**, because the
name join alone cannot see a fault that names no device. Only `reactor` does: a brownout entry names
a *network*, not a device (`HistorySystem.cs:104-110`). **And that structural match must be narrowed
to the fault, not the recovery**: `HistoryKind.Brownout` covers *both* sentences HistorySystem writes
from `BrownoutChangedEvent`, and the entry does not carry the direction. Left unnarrowed, the shipped
slice renders `DAY 2 · POWER NETWORK 1 RECOVERED` in a column headed LAST FAULT — measured, and
exactly the class of misread this spec exists to stop. The implementation matches HistorySystem's own
literal (`"browned out"`); a test pins that `RECOVERED` never reaches the column.

Three consequences to design around rather than discover later:

1. The 200-entry history ring is roughly **87% brownout spam by day 3** (`MECHANICS.md` §13.8), so
   non-power rows will frequently have no attributable fault. `—` is the correct, honest render.
   Measured on the slice at day 3: only `reactor` has an attributable fault. Every other row is `—`.
2. `MaintenanceSystem` publishes **nothing on repair** (`MachineWearSystem.cs:262` — "completion is
   a notice, not an alarm"), so faults can be shown but recoveries cannot. A fault line is
   therefore "the last thing that went wrong", **not** "the current problem". Word the column
   accordingly and say it in the DETAIL derivation note.
3. **[CORRECTED] Designer-rule alarms never attribute to a row.** `DesignerRuleSystem` publishes
   `AlarmRaisedEvent` with the *rule name* as `SourceId`, so `overheat_guard`'s 2,579 alarms carry no
   device name and match nothing. The `thermal` row therefore shows `—` while that rule screams. That
   is the correct outcome twice over: the join genuinely cannot see it, and the rule's claim is
   backwards anyway (DA-M1, §5 `thermal`).

> **Open contract question raised by `moss-screen`, for `moss-systems` to settle.** §1.1 says
> `faultText` is `""` whenever `faultDay` is `-1`, but §5's `nav_sensors` row specifies
> `Fault text: NO SENSOR HARDWARE` for a row that has no fault day at all. The DOM renders whichever
> the host sends (`faultCell(-1, text)` falls back to the text, else `—`), so nothing breaks either
> way — but the two clauses disagree and the client fixture currently follows §1.1 (empty
> `faultText`, the reason carried in `advisory`). Pick one; "NO SENSOR HARDWARE is an absence, not a
> fault, so it belongs in the advisory" is the reading that keeps `LAST FAULT` meaning one thing.

---

## 6. Test obligations

| Lane | Must prove |
|---|---|
| `moss-systems` | Determinism (twin sims produce byte-identical `systems` payloads) · InvariantCulture on every number (de-DE probe) · **no hashed state added** (scenario + tick-3000 + slice pins unmoved, asserted as *twin hashes match*, never as a literal) · `nav_sensors` is OFFLINE *because the census finds no `Telescope`*, proven by a test that places one and watches the row come alive · the exec path introduces **no new `ISimCommand`** · an abuse corpus (overlong, malformed, injection-shaped, `ship.*` write attempts) yields typed errors and zero sim mutation. |
| `moss-model` | The IX-M8 key-routing table in **both** buffer states · selection preserved by id across a row-set change (IX-M12) · `loadBar`/`uptimeText`/`faultCell` formatting incl. `-1` sentinels · command parsing incl. case/space tolerance and unknown verbs · **M-PURITY** by source scan · reducers never mutate their argument. |
| `moss-screen` | Full takeover leaves no game chrome visible (IX-M1) · the ESC stack order (IX-M2) · click/double-click row semantics (IX-M7) · reduced-motion (VS-M10) · a live-pixel check that the ledger reads correctly at 1024px and at full width (VS-M9) · **the prompt can be CORRECTED** — Backspace/Delete/caret keys/Tab reach the input, proven with TRUSTED key events (§6.1). |
| `moss-programs` | The PROGRAM IDE (IX-M6) is a **VIEW of `model.program`** — the single source of truth kept live by `reduceMossEvent`; no second `terminal-model` instance that can drift · `selectProgram(model, tid)` opens the terminal in the model so the `source` reply is **not dropped** by terminal-model's tid guard (proven by a source event *dropped-before / accepted-after* selection) · edits and Install route back through the pure `editProgramDraft` / `beginProgramCompile` reducers and emit `moss set` / `moss audit` · **the textarea refill rule holds both directions** — authoritative on `source`, a no-op mid-type, and refills from `draft` (never `installed`) so a live edit is never clobbered · **the embedded `<textarea>` is provable with TRUSTED keys against the SHIPPING model** — source loads through the real `model.program` (revert the tid-gap fix → the phase goes red), mid-buffer typing stays coherent, Install compiles — driven over CDP by `moss-shot.mjs`'s PROGRAM phase, which drives `src/ui/moss-model.js` not the fake (§6.1). |

Every package additionally runs `./ci.sh` **in-worktree** and passes an independent Opus gate
(blind spec → CI battery → adversarial/mutation pass → written PASS/FAIL), per `HANDOVER.md`
"The rituals".

### 6.1 The prompt must be provable with TRUSTED keys (added 2026-07-22, from a gate FAIL)

**Any lane that touches keyboard handling on this screen runs `node client/tools/moss-shot.mjs`,
whose `--keys` phase drives the prompt over CDP.** This is not optional polish; it closes a class of
defect the node suite is structurally blind to.

What happened: `moss-screen.js` swallowed every key whose name is longer than one character, on the
reasoning that such a key "cannot type". It also matched `Backspace`, `Delete`, `ArrowLeft/Right`,
`Home`, `End` and `Tab` — so the command prompt could be typed into but **never corrected**. A
player who mistyped `open reacotr` had no way back except ESC, which throws the whole line away. All
39 node tests were green.

They were green because a stub `preventDefault` can only *record* the call; it cannot suppress a
default action the stub never performs in the first place. `client/test/dom-lite.js:editable()` now
models the one default that matters, so node catches this specific bug — but the general lesson
stands: **default-action behaviour is only observable in a real browser with real key events.**
`Input.dispatchKeyEvent` produces trusted events; a synthetic `new KeyboardEvent(...)` does not and
would have passed just as happily.

Corollary for implementers: the DOM layer may swallow a key on its own account only via the
explicit `SCROLL_KEYS` allowlist, and never for an event originating in a text field. Everything
else is `keyPress().handled`. A "keys like this can't type" heuristic is how this went wrong.

The rule now covers **every editable surface on the screen, not just the `>` prompt.** The
`moss-programs` lane added the PROGRAM editor's `<textarea>` — a second text field — so
`moss-shot.mjs` grew a PROGRAM phase. **That phase drives the SHIPPING model:**
`moss-preview.html` now imports `../src/ui/moss-model.js` (the real bodies are merged; the fake was
only a build-time stand-in), so the phase's model-level assertions run against the code that ships,
and are not a test-that-cannot-fail. It proves: (1) the source reaches the buffer **through the real
model** — the tid-gap fix (`selectProgram` opening the terminal so the reply is accepted); revert
that fix and the phase goes red with "program.tid is null". (2) mid-buffer typing stays COHERENT —
it types between two characters and asserts they land where the caret was; this catches a refill
that writes DIVERGENT content on a keystroke (e.g. `installed` for `draft`), which reorders the text.
(3) Install enables and compiles. Caveat for the next lane: this does NOT prove the refill's `!==`
guard — an unconditional write of the identical `draft` string does not move Chrome's caret, so that
guard is a redundant-write skip, not caret protection; the load-bearing direction (refill from
`draft`, not `installed`) is node-pinned.

---

## 6.1 Known limitations of the shipped ledger (recorded, not smoothed over)

Disclosed by the `moss-systems` lane after its independent gate. None is a blocker; all are the kind
of thing this project records rather than discovers twice.

1. **Fault attribution stays a weak string join.** Designer-rule alarms carry the *rule name* as
   `SourceId` (`DesignerRuleSystem.cs:183,191`), so `overheat_guard`'s 2,579 alarms attribute to
   nothing. Measured on the slice at day 3: only `reactor` has an attributable fault; every other row
   is `—`. Correct, but thin.
2. **`hydroponics` and `reactor` both read pessimistically at tick 0.** Before the first tick no
   fluid or power network exists, so every bed reads dry and generation reaches nothing. Literally
   true for that instant, and exactly what `HydroponicsSystem`/`PowerSystem` would find — but it is a
   cold-start artifact, not a fault.
3. **`fabrication` cannot distinguish idle from busy** — no machine exposes a run-state. Stated in
   its DERIVATION note.
4. **The ppO₂ band is unreachable on shipped content.** Measured worst ppO₂ on the slice at day 3 is
   18.7 kPa, comfortably above `hypoxia_ppo2_kpa` (16). The ladder is real and tested, but nothing in
   shipped content exercises it — so it is unproven against emergent play, not merely unproven.
5. **"Up to 1 s stale" is WALL time, not sim time** (`GameSession.cs:782` gates on `nowWall`). One
   wall-second at a `tps`-ticks-per-second speed is `tps/10` sim-seconds of ledger age (the sim runs
   at 10 Hz). So worst-case staleness is ~1 sim-second at 1×, **~1.67 sim-minutes at 100×** and
   **~16.7 sim-minutes at 1000×** — minutes, not hours. On a *diagnostic* screen that still
   materially understates the staleness, and a player watching a fast-forwarded ship is exactly who
   is watching this screen. The dedupe means a stale payload is not re-sent, so the client cannot
   tell the difference. **Candidate fix for v2: gate on `TickCount` rather than wall time** (inherited
   from `_metricsAtWall`; changing the cadence under a fixup was the wrong move).
6. **`ship.*` prompt reads share a mutable cache.** `ShipMetricsAdapter` caches its snapshot for one
   *sim-second* keyed on `TickCount / TicksPerSecond`, and one instance is registered on the shared
   `DeviceRegistry` for `DesignerRuleSystem`, `ScriptRuntime` and now the MOSS prompt alike. Whoever
   reads first within a sim-second fixes the snapshot the others see. The cadence is a pure function
   of the tick, so both determinism twins recompute at the same ticks — and the gate could **not**
   produce a divergence over 1,300 slice ticks. Recorded as **latent**, not as a bug.
7. **`MECHANICS.md` §13.1 carries the same bad citation this spec did** — it attributes the 40,000 ppm
   damage consumer to `NeedsSystem.cs:52`, which is class-doc prose about `SocialSystem`. The real
   consumers are `NeedsSystem.cs:130,132`. Left for the doc's owning lane rather than edited here
   mid-wave.

---

## 7. Deliberate non-goals for v1

- **No LLM prose on this screen.** The advisory line is host-derived and deterministic. A crew
  member's *opinion* about the reactor belongs in dialogue, where it is attributable to a person.
- **No writes to `ship.*` or rooms.** They are read-only in the DSL and stay read-only here.
- **No new `DeviceKind`s.** Making the mock's medical/comms/grav rows true is real content work
  with a hash move behind it, and it is not this feature (see DA-M2).
- **The `dryrun` op stays unbuilt** — it remains reserved (`HANDOVER.md` backlog).
