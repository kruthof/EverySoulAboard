# MOSS — Language Specification (v0)

*MOSS: "Malapert Operations Script Shell" — the in-fiction base automation language. Design rationale in [GDD.md](GDD.md) §6, implementation architecture in [TDD.md](TDD.md) §4. Implemented hand-written in the `Sim.Dsl` assembly (zero dependencies, no UnityEngine).*

Design goals: readable aloud by a non-programmer; bounded execution by construction (no user loops or function definitions in v0 — `every` is the only repetition); real units in literals; errors are in-game diagnostics, never crashes.

## 1. Example programs

```
# LSS controller, Hab-3  (found on Okafor's terminal — comments are part of the fiction)
every 5s:
  if hab3.o2 < 19.5%: open(valve_o2_hab3)
  if hab3.o2 > 21.5%: close(valve_o2_hab3)

when hab3.co2 > 5000ppm:
  alarm("CO2 HIGH HAB-3")
  set(scrubber_hab3.rate, max)

alarm when hab3.pressure < 90kPa, "PRESSURE DROP HAB-3"
```

v1+ (not in v0): `on <event>(<scope>):` handlers (`raid_detected`, `power_deficit`, `breach`), `let` arithmetic beyond simple cases, script-to-script messaging.

## 2. Grammar (EBNF-ish)

```
program    := line*                     // indentation-scoped like Python (one level deep in v0)
stmt       := every | when | alarmwhen | if | command | let
every      := "every" DURATION ":" block          // every 5s: / every 2m:
when       := "when" expr ":" block               // edge-triggered (fires on false→true)
alarmwhen  := "alarm" "when" expr [ "," STRING ]  // alarm when hab3.co2 > 0.5%, "CO2 high"
if         := "if" expr ":" block [ "else" ":" block ]
command    := IDENT "(" args? ")"                 // open(valve_o2_main), set(pump1.rate, 50%)
let        := "let" IDENT "=" expr
block      := command (";" command)* | NEWLINE INDENT stmt+ DEDENT
expr       := or-expr with:  and or not   < <= > >= == !=   + - * /
primary    := NUMBER [unit] | STRING | "max" | "min" | IDENT ("." IDENT)*   // hab3.o2, door_a.open
DURATION   := NUMBER ("s"|"m"|"h")
unit       := "%" | "ppm" | "kPa" | "C" | "kW"
```

~20 token types. Keywords: `every when alarm if else let and or not true false max min`.
Comments: `#` to end of line. Case-insensitive keywords, case-sensitive identifiers.

## 3. Semantics

- **Scheduling:** the `ScriptRuntime` sim system ticks every program at 10 Hz. `every Ns:` blocks fire when the tick counter crosses the interval. `when` and `alarm when` conditions are evaluated every tick and are **edge-triggered**: the block/alarm fires once on the false→true transition and re-arms when the condition returns to false.
- **Values:** numbers (double), booleans, strings. Unit suffixes are scaling/formatting metadata on number literals; comparisons between a suffixed literal and a device property compare in the property's canonical unit (`19.5%` on `o2` means O2 fraction; `5000ppm` on `co2` means ppm; mismatched units are a compile-time diagnostic).
- **Device access:** `name.property` reads through the `DeviceRegistry` (players name devices in the inspector UI; rooms auto-named from room designations — naming a room "Hab-3" makes `hab3.*` addressable). Commands (`open`, `close`, `lock`, `arm`, `set`, `alarm`, `log`) resolve through `IScriptable.TryInvoke`.
- **Effects:** actuator commands do not mutate the sim directly — they emit `ISimCommand`s applied same-tick after the script phase. Scripts are therefore order-independent among themselves; conflicting commands on the same device in the same tick resolve last-writer-wins with an audit-log warning.
- **Sandboxing:** budget 1,000 interpreter steps per script per tick, 50,000 global. Overrun halts the script with a `BudgetExceeded` error and raises an in-game alarm on its terminal.
- **Errors:** compile diagnostics `(line, col, message, severity)` render inline in the terminal editor. Runtime errors (deleted device, type mismatch) halt the offending statement, log to the terminal's audit log, and raise a Notice-level alert; the rest of the program keeps running.
- **Hot reload:** saving in the terminal recompiles at the next tick boundary; edge-trigger latches and timers reset. No partial reload.
- **Persistence & determinism:** script source text is sim state — saved in the `DSLS` chapter and included in `StateHash`. Interpreter execution is deterministic (no RNG, no wall-clock access; `every` is tick-counter based).

## 4. v0 scriptable device surface

| Device | Properties (read) | Commands |
|---|---|---|
| Room (`hab3`) | `o2` (%), `co2` (ppm), `pressure` (kPa), `temp` (C), `powered` | — |
| Valve | `open`, `flow` | `open()`, `close()` |
| Door | `open`, `locked` | `open()`, `close()`, `lock()`, `unlock()` |
| Pump | `rate`, `running` | `set(rate, x)`, `start()`, `stop()` |
| Scrubber | `rate`, `saturation` | `set(rate, x)` |
| Breaker | `on`, `load` (kW) | `open()`, `close()` |
| Light | `on`, `mode` | `on()`, `off()` |
| Sensor | `value` | — |
| Turret | `armed`, `ammo` | `arm()`, `safe()` |
| Terminal (self) | `steps_used` | `alarm(msg)`, `log(msg)` |
| Ship (`ship`, read-only) | `power`, `o2`, `co2` (ppm), `water`, `food`, `heat`, `morale` — normalized 0..1 dashboard readouts (co2 excepted); `ship.o2` is fraction-of-nominal, NOT the % scale of room `o2` | — |

Designer rules (`StreamingAssets/SimDefs/rules/*.moss`) use this same language and device surface; they run in a separate budgeted interpreter registered just before the player runtime (player scripts win same-tick conflicts) and are content, not save state.

Scriptability gate (GDD §6): a device is addressable only if it has a **controller module** installed (salvaged or crafted) — scriptability is a resource, not a menu.

## 5. Test plan

- Golden tests: lexer → token dump; parser → AST S-expression dump (committed fixtures).
- Interpreter unit tests against `FakeDeviceRegistry`.
- Property test: arbitrary token soup never throws uncaught — always yields diagnostics.
- Integration (SimHarness ASCII world): script + mini-world, assert door opens on tick N; budget-overrun script halts with alarm; edge-trigger fires exactly once per transition.
