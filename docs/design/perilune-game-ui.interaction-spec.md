# PERILUNE Client UI Rebuild — INTERACTION SPEC (v1, 2026-07-21)

Authoritative interaction contract for rebuilding `client/index.html` + `client/styles.css`
+ `client/src/ui/hud.js` to the `docs/design/perilune-game-ui.dc.html` design. Ground truth
for wire/DOM constraints is `FACTS.md` (same directory); where the design mock and reality
conflict, this spec resolves the conflict and the resolution is final. Every requirement is
numbered IX-nn for review reference. One behavior per requirement — no options.

Conventions used below:
- **Authoritative state** = what the wire last said (`frame`, `status`, `metrics`, `roster`,
  …). The client never latches its own copy of anything the wire carries.
- **armedTool** = a single client-side slot `null | 'wall' | 'door' | 'cancel' | 'move'`.
  It is the ONLY client-side input mode. Build tools and the move order share it, so they
  are mutually exclusive by construction.
- **selCid** = `selectedCrewCid(frame)` (wire/messages.js:114), `null` when no crew selected.
- All new derivations named `xxx()` below are pure functions in a new
  `client/src/ui/console-model.js`, node-tested (FACTS invariant).

---

## 0. Mode model (read first)

- **IX-1** The client has exactly two overlay layers on top of the plain view: (a) the
  armedTool slot (canvas input mode), (b) floating panels (dialogue / citizen / terminal).
  There is no other client-side mode. Tabs are not modes — the bottom-bar tab merely selects
  which content block renders; only an armed tool changes input semantics.
- **IX-2** Arming any tool disarms the previous one (single slot). Disconnect (IX-96)
  disarms. Nothing else changes armedTool implicitly except the exits listed in IX-30/IX-59.
- **IX-3** All selected/active visual states (crew row, lens button, deck label, pause chip,
  speed chip, BUILD designations) render from authoritative wire state on the next matching
  message — never from click optimism. The only client-latched visuals are: armedTool
  highlight, active tab, panel positions, and the two transient acknowledgments IX-36/IX-44.

---

## 1. Keyboard map — final

The real map in `client/src/input/controls.js` wins over the design mock's hint line.
Additions: B and X (both currently unbound). No existing binding changes or is removed.

- **IX-10** Final map (controls.js order, after the text-entry guard):

  | Key | Action |
  |---|---|
  | P | toggle sprites (unchanged) |
  | Escape | escape stack, see IX-13 |
  | T | talk to selected crew (unchanged; no-op without selection) |
  | W/A/S/D | pan camera (unchanged) |
  | Arrows / hjkl | move inspection cursor (unchanged) |
  | R / F (and > / <) | deck up / down (unchanged) |
  | 1–7 | lens select, index into `LENSES` — all 7 real lenses (unchanged) |
  | Space | pause toggle (unchanged) |
  | + / − | speed delta ±1 (unchanged) |
  | M | instant move order: `Cmd.move()` selected → cursor (unchanged, expert path; the readout button is the guided path, IX-52) |
  | Enter | talk-if-selected else keyboard click at cursor (unchanged) |
  | **B** | **new**: build toggle — if a build tool (`wall`/`door`/`cancel`) is armed, disarm it; else activate the BUILD tab and arm `wall` |
  | **X** | **new**: cancel-order toggle — if `cancel` is armed, disarm; else activate the BUILD tab and arm `cancel` |

- **IX-11** B and X are added to controls.js via a new `onBuildKey(kind)` callback option
  (like `onEscape`), so controls.js stays free of UI imports. They sit AFTER the
  `isTextEntryTarget` guard: typing "b"/"x" in the chat box or MOSS textarea never arms a
  tool (guard unchanged, controls.js:143-155).
- **IX-12** Shift-click move (controls.js:103) is retained exactly as-is when no tool is
  armed. While a tool is armed it is suppressed (IX-33).
- **IX-13** **Escape priority stack**, implemented in main.js's `onEscape` handler
  (controls.js keeps calling a single `onEscape`):
  1. If keydown target is a text-entry element: controls.js already routes only Escape
     through; `onEscape` runs the same stack below (so Esc while typing in the chat box
     with a tool armed disarms the tool first — acceptable and consistent: one stack, no
     special cases beyond the guard itself).
  2. If `armedTool !== null` → disarm it (stop; consume the key).
  3. Else if a dialogue is open → `Hud.closeActiveDialogue()` (existing bye path).
  4. Else → no-op. Esc never deselects crew (there is no deselect on the wire) and never
     closes the citizen card or terminal drawer (they close via their × only).
- **IX-14** Hotkey hint line (bottom bar, left block, `#hotkeys`), exact content:
  `B BUILD · X CANCEL ORDER · ESC EXIT · CLICK SELECT · SHIFT-CLICK MOVE · T TALK · 1–7 LENS · SPACE PAUSE · R/F DECK · +/− SPEED`
  Static text, never changes. (The design's "X DEMOLISH · 1–6 LENS" line is wrong on both
  counts: `cancel` is not demolition — see IX-31 — and there are 7 lenses.)

---

## 2. Build mode state machine

- **IX-20** States: `tab=BUILD` is presentation only; the mode is `armedTool ∈ {wall, door,
  cancel}`. Opening the BUILD tab arms nothing (browsing the palette is not building).
  Canvas click semantics change ONLY while a build tool is armed.
- **IX-21** Palette contents, in order: `WALL`, `DOOR`, `⌫ CANCEL`. **The design's
  bunk/console/scrubber/tray/light tools are OMITTED entirely** — not rendered disabled.
  Rationale (the requested HCI call): a disabled control promises a capability that exists
  but is currently unavailable; these items do not exist in the sim at all (P3 fiction,
  FACTS "do not ship dead buttons"). Rendering them greyed would be a standing lie the
  player probes repeatedly. Three working tools read as a small honest toolset; the palette
  row is append-ready for P3. AAA polish is every control doing exactly what it says.
- **IX-22** Tool selection: clicking a palette button arms that tool (and disarms any
  other). Clicking the armed tool's button again disarms it. Selected-state styling per
  FACTS: armed = bg #3a2a12 / fg #f2b563 / bd #cf7a33; armed `cancel` uses the demolish
  colorway bg #3a1a10 / fg #e07a5f / bd #a53a25; inactive = bg #1a1611 / fg #8c8377 /
  bd #3a332a.
- **IX-23** Keyboard: B and X per IX-10 — they also switch the bottom bar to the BUILD tab
  so the armed tool is always visible when armed. Corollary invariant: **a build tool can
  only be armed while the BUILD tab is the active tab** (IX-30 enforces the converse).
- **IX-30** Exits — armedTool (build kinds) is cleared by: Esc (IX-13), pressing the same
  tool's key/button again (toggle), switching to any other bottom-bar tab, arming the move
  order (IX-2 single slot), and disconnect (IX-96). Nothing else exits: opening panels,
  deck changes, and CREW WATCH row clicks (IX-42) do NOT disarm — deck-hopping to keep
  placing walls is a core loop.
- **IX-31** Cancel-tool honesty: sim-side `BuildSystem.Cancel` removes a **pending
  designation** and refunds staged material; it cannot demolish built structure
  (Commands.cs:161, BuildSystem.cs:138-150). The tool is therefore labeled `⌫ CANCEL`
  (never "DEMOLISH"), with `title` tooltip: "Cancel a queued build order (refunds staged
  material)". Demolition of built walls is P3 and appears nowhere in this UI.
- **IX-32** Placement: while a build tool is armed, a non-drag canvas click on an in-bounds
  tile sends exactly one `Cmd.build(kind, x, y)` (new constructor in session.js, keyed
  `cmd:"build"`; kind is the armed tool: `wall`, `door`, or `cancel`). The click sends
  build INSTEAD of `Cmd.click` — no selection, no device toggle, no crew click-assist
  snap while armed. Out-of-bounds clicks are dropped client-side (existing bounds check).
- **IX-33** While armed, other canvas input is: drag-pan ✓ (unchanged), wheel zoom ✓
  (unchanged), hover → `Cmd.cursor` ✓ (unchanged — the host reticle doubles as the
  placement preview), shift-click move ✗ (suppressed; a modifier must not silently issue
  crew orders mid-building), Enter-at-cursor: sends `Cmd.build` at the inspection cursor
  (keyboard placement parity), not `Cmd.click`.
- **IX-34** Implementation seam: controls.js gains an optional `getArmedTool()` accessor;
  its click/Enter handlers branch on it. No other controls.js behavior changes.
- **IX-35** Confirmation is the wire: designations appear (or don't — legality is decided
  at tick boundary sim-side) in the next frame's cells, ~100 ms. **No client-side ghost
  persistence.** A persistent optimistic ghost is dishonest here — the sim may legally
  refuse (`CanDesignate`), and a lingering ghost over a refusal is fake state.
- **IX-36** Permitted feedback (the one transient): on each placement click, a single
  fading tile-outline pulse at the clicked tile, ≤150 ms, amber for wall/door, ember-red
  for cancel, expiring before the next frame normally lands. It acknowledges the *input*
  ("your order was sent"), not the *outcome*, and never survives into a second frame. Drawn
  by the HUD layer (a positioned div over the stage using the camera transform), NOT by the
  render executors (do-not-touch list).
- **IX-37** While a build tool is armed, the canvas hint line (under the canvas, replacing
  its idle content) reads: `BUILD ▸ WALL — CLICK DECK TO PLACE · ESC EXIT` (resp. `DOOR`;
  for cancel: `CANCEL ▸ CLICK A QUEUED ORDER TO REVOKE · ESC EXIT`). Cursor over the canvas
  becomes `crosshair` while armed (stage class `.arming`).

---

## 3. Crew selection flows

- **IX-40** Selection truth is host-side only. The selected row/readout derive from
  `selCid` + the roster: `selectedRosterEntry(frame, roster)` → the roster entry whose
  `cid === selCid`, else `null`. Pure, node-tested. CREW WATCH row selected styling
  (bd #cf7a33, bg #221b12) renders ONLY from this derivation — never latched on click.
- **IX-41** Row click, same deck (`entry.deck === frame.deck`): resolve the crew's CURRENT
  tile from `frame.crew` by cid (4th tuple element) — the roster snapshot's x/y may be a
  stale tile for a walker; frame is fresher. Fallback to roster x/y when the cid is not in
  frame.crew (fog). Send `Cmd.click(x, y)`. Pure helper `crewClickTarget(frame, entry)`.
- **IX-42** Row click, cross-deck: send `Cmd.deck(entry.deck - frame.deck)` immediately,
  then hold a **pending click** `{cid, rosterX, rosterY, deadline: now+1000ms}`. On the
  first arriving frame with `frame.deck === entry.deck`: resolve the tile per IX-41 and
  send `Cmd.click`. If the deadline passes first (or another row/canvas click supersedes
  it), drop the pending click silently. This two-step is required because roster x/y can go
  stale during the deck switch; frame.crew of the target deck is the only fresh source.
  The pending-click resolution logic is a pure reducer, node-tested.
- **IX-43** Row clicks are panel/DOM clicks, not canvas clicks: they work identically
  whether or not a build tool is armed (IX-30) and never place builds.
- **IX-44** Latency feedback: on row click the row immediately gets a `.pending` style
  (border pulses amber, no fill change). `.pending` clears on the next roster/frame render
  pass regardless of outcome; if the host confirmed, `.selected` (IX-40) takes over
  seamlessly. A missed click (crew walked off the tile) thus visibly settles back to
  unselected — honest, and the row is right there to click again.
- **IX-45** Pawn click and row click are equivalent by construction — both end in
  `Cmd.click` on the crew's tile; the host answers with `citizen` + `frame.sel`. No
  separate client path for either.
- **IX-46** Keyboard traversal of the crew list: **no custom traversal.** Decision: rows
  are `<button>` elements, so native Tab / Shift-Tab / Enter focus-and-activate works for
  free (and Enter on a focused row is a text-entry-free target, so no guard conflict).
  A roving arrow-key scheme would collide with the arrows' cursor role and add a focus
  mode for marginal gain at 8 crew. Revisit at P3 crew counts.
- **IX-47** CREW WATCH header shows the live count from the roster message:
  `CREW WATCH — {n} SOUL{S}` (roster is living-crew only, so the count is the truth).
  Morale bar per row: width `morale*100`%, color thresholds ≥0.75 #5aa77f, ≥0.50 #cf7a33,
  else #c25a3f (design's mock thresholds, pure fn `moraleColor(m)`). Row shows SURNAME
  (last whitespace-separated token of `name`, uppercased — pure fn, InvariantCulture
  `toUpperCase` is fine for ASCII crew names; do not use locale-dependent APIs), role
  (uppercased), initials avatar (first letters of first+last tokens).

---

## 4. READOUT actions

- **IX-50** Readout content derives from `selectedRosterEntry` (IX-40) + the last `citizen`
  message cached per cid (`citizenCache: Map<cid, CitizenMsg>` — populated passively from
  the wire; see IX-53). Shown, in order: name (accent), role · mood (from roster,
  uppercased), trait chips (from citizenCache when present, else the chips row is absent —
  no placeholder), `> {task}` line (roster task label verbatim), morale line
  (`MORALE {pct}%` with IX-47 color). **No memory line** — not on the wire; nothing is
  invented (FACTS). No "room" line — not on the wire.
- **IX-51** `[T] OPEN CHANNEL — TALK`: enabled iff `selCid != null`. Click →
  `Cmd.talk(selCid)`. The `[T]` accelerator label is truthful (IX-10).
- **IX-52** `MOVE ORDER` (guided arm-then-click; the ONE chosen pattern): click the button
  → `armedTool = 'move'` (disarming anything else). While armed: the canvas hint line
  reads `MOVE ORDER ▸ CLICK A TILE — {SURNAME} WILL WALK THERE · ESC EXIT`, the button
  shows the armed style (IX-22 colorway), stage cursor `crosshair`. The next non-drag
  canvas click on an in-bounds tile sends `Cmd.cursor(x, y)` then `Cmd.move()`, then
  disarms. One click, one order. Exits: Esc, clicking the button again, arming any build
  tool, selection loss (selCid becomes null → disarm, the order verb lost its subject),
  disconnect. Shift-click (no tool armed) and the M key remain the expert equivalents —
  three entry points, one wire behavior. Button label carries no `[M]` bracket? It does:
  `[M] MOVE ORDER` — M genuinely performs a move order (the instant variant); the bracket
  advertises the key honestly even though key and button take different paths to
  `Cmd.move()`.
- **IX-53** `BIOGRAPHY`: opens the citizen card panel (`panels().citizen`) from
  `citizenCache[selCid]`. Enabled iff the cache has the selected cid (the host emits
  `citizen` on every click-select, so it is populated by the time a selection exists;
  a fog/edge miss leaves it disabled rather than opening an empty card). **Label carries
  no bracket accelerator** — B is BUILD (IX-10); the design's `[B]` is dropped. A fake
  accelerator on a AAA console is worse than none.
- **IX-54** Behavior change from today, explicit: the `citizen` message **no longer
  auto-opens** the citizen card on every click-select (current renderCitizen behavior).
  It only (a) updates `citizenCache`, (b) live-refreshes the card panel if that cid's card
  is already open. The card opens solely via BIOGRAPHY. Rationale: with a persistent
  readout, the popup on every selection is noise; the readout is the glance surface, the
  card is the dossier.
- **IX-55** Empty state (selCid null or roster miss): readout body shows
  `NO CREW SELECTED` (faint) + one guidance line `Click a pawn or a CREW WATCH row.`
  All three action buttons remain visible but disabled (reduced opacity, no pointer
  events, `disabled` attribute). Visible-disabled is correct here — unlike IX-21's
  nonexistent tools, these verbs exist and merely await a selection; keeping them teaches
  the verb set.

---

## 5. Draggable panels (dialogue / citizen / terminal)

All in `panel-base.js` so every Panel subclass inherits (FACTS requirement). Pointer
events only (covers mouse/touch/pen).

- **IX-60** Drag surface: `.panel-bar` only. `touch-action: none` on the bar. The body,
  inputs, and transcript never drag.
- **IX-61** Sequence: `pointerdown` on the bar → `focus()` (z-bump, existing) +
  `setPointerCapture`; drag begins only after movement exceeds a **4 px** Manhattan
  threshold (matches the canvas pan threshold, controls.js:119) — below it, release is
  just a focus click. During drag, `pointermove` sets inline `style.left/top` =
  panel origin + pointer delta; `style.right/bottom` are set to `auto` once on drag start
  so inline position beats the CSS-class default positioning. `pointerup`/`pointercancel`
  ends the drag and releases capture.
- **IX-62** Close button precedence: `.panel-x` gets `pointerdown` →
  `e.stopPropagation()` (in addition to its existing click stopPropagation), so a press
  on × can never start a drag and always closes.
- **IX-63** Viewport clamping, applied during drag AND on window resize to all open
  panels: `top ∈ [0, viewportH − barHeight]` (the bar is always fully reachable
  vertically), `left ∈ [64 − panelWidth, viewportW − 64]` (at least 64 px of the bar
  stays on-screen horizontally; deliberate mostly-tucked-away parking is allowed).
- **IX-64** Position persistence: session-only. A module-level `Map<panelKey,
  {left, top}>` records the last dragged position; reopening a panel with a stored
  position applies it (re-clamped) instead of the CSS default. Not localStorage — stored
  coordinates go stale across layout changes and sessions; the CSS default is the honest
  cold-start. Keyed by panel key (`chat:<sid>`, `cit:<cid>`, `terminal`), so "the chat
  window stays where I put it" holds per conversation within a session.
- **IX-65** Dragging never changes panel contents, never sends wire traffic, and never
  interacts with armedTool or game keys (pointer capture keeps events off the canvas).
  Text selection during drag is prevented (`user-select: none` on the bar).

---

## 6. Bottom-bar tabs

- **IX-70** Tabs that ship, in order: `BUILD · CREW · MOSS · CHRONICLE`. **REFIT, ORDERS,
  SHIP, NAV are omitted entirely** — same HCI ruling as IX-21 and for the same reason:
  they have no wire, a "coming soon" placard is not a AAA interaction, and the tab row
  is append-ready. Default active tab on load: BUILD (its palette doubles as the hint
  that the deck is editable).
- **IX-71** Tab semantics: exactly one active; clicking switches the content block below
  the tab row (palette row / crew table / moss block / chronicle block share the same
  region). Switching away from BUILD disarms an armed build tool (IX-30). Active tab
  styling per FACTS selected-state colors. Tabs are client-local presentation state —
  no wire traffic on switch, except CHRONICLE's first open (IX-74).
- **IX-72** CREW tab: a compact table of the full roster — SURNAME NAME · ROLE · MOOD ·
  MORALE% · TASK · DECK n — one row per living crew, ordered as the roster message
  orders them (host order; do not client-sort — stable and culture-proof). Row click =
  the exact IX-41/42 selection flow. This is the roster's long-form; CREW WATCH stays
  the glance-form.
- **IX-73** MOSS tab: real guidance, not a dead end — a static block:
  `MOSS terminals live on the deck. Click a console to open its program in the IDE.`
  plus a live line when the terminal drawer is open: `TERMINAL {tid} — IDE OPEN` .
  The tab cannot open a terminal itself (a tid only arrives via the `device` message
  from clicking a console) and does not pretend to.
- **IX-74** CHRONICLE tab: on first activation per connection, send `{"type":"chron"}`
  (new `Cmd.chron()` in session.js). Renders the `chron` message: days newest-first,
  each as `DAY {day} — {headline}` + its lines, scrollable within the bottom bar height.
  Day-rollover chron pushes re-render it live. Empty state before data lands (or when
  `days` is empty): `The chronicle has no entries yet.` — the truth, not a spinner.
- **IX-75** The `chron` and `roster` messages get decoders/typedefs in
  wire/messages.js and dispatch cases in main.js (FACTS: currently dropped). Neither is
  in the snapshot for chat-family messages, but `roster` IS in snapshot replay — CREW
  WATCH populates on connect without user action.

---

## 7. Top bar

Left→right: `MSV PERILUNE` (hardcoded client chrome, FACTS-approved) · deck control ·
(spacer) · DAY/clock · LLM chip · pause chip · speed chip · caution chip.

- **IX-80** Deck control replaces the old sidebar buttons: `▼ DECK {frame.deck} ▲` — the
  label from the latest frame (no deck names; the wire has none), flanked by two chevron
  buttons reusing ids `b-deckdown`/`b-deckup` → `Cmd.deck(∓1)` (host clamps; no
  client-side clamping since the deck count isn't on the wire — a clamped press is a
  visible no-op, acceptable). Keyboard R/F unchanged.
- **IX-81** Clock: `DAY {metrics.day} · {clockHHMM(metrics.dayFrac)}` where
  `clockHHMM(f)` = `floor(f*24)` `:` `floor((f*24 % 1) * 60)`, both zero-padded via
  `String.padStart` (no locale APIs). Day rendered verbatim (0-based, matching the log
  channel's `D<day.dd>` convention). Pure, node-tested, including f=0, f≈1 (23:59, never
  24:00 — clamp f to [0, 1) first).
- **IX-82** Pause chip: reuses id `b-pause` → `Cmd.pause()`. Label shows the ACTION
  (design mock's convention): running → `‖ HOLD`, paused → `► RUN` (fg #e8934a when
  paused). State strictly from `status.paused` — the chip changes only when the status
  message confirms.
- **IX-83** Speed chip: one chip group `[−] {label} [+]` — two 20px hit-zone buttons
  reusing ids `b-slower`/`b-faster` → `Cmd.speed(∓1)`, label from `status.speed` via pure
  map `{paused:'‖', '1x':'1×', '5x':'5×', '20x':'20×', '100x':'100×', '1000x':'1000×'}`
  (unknown values render verbatim — forward-compatible). The wire is relative-delta only,
  so ± affordances are the honest control; there is no click-to-cycle fiction. Presses at
  the ends are host-clamped visible no-ops.
- **IX-84** Caution chip — display only, derived 1 Hz from metrics by pure
  `cautionState(m) → {level:'idle'|'warn'|'alert', label:string}`:
  - **alert** when any of: `co2ppm ≥ 2000`, `oxygen < 0.33`, `power < 0.33`,
    `structural < 0.33`. Label: `MASTER CAUTION`. Style: bg #a53a25, fg #fefbf6, blinking
    (`plnBlink 1.6s`).
  - **warn** when (not alert and) any of: `co2ppm ≥ 1000`, `oxygen < 0.5`, `power < 0.5`,
    `structural < 0.5`, `water < 0.33`, `food < 0.33`. Label: `CAUTION · {cause}` where
    cause is the first tripped in the fixed precedence `O₂ > PWR > STRUCT > CO₂ > H₂O >
    FOOD` (deterministic when several trip). Style: bg #3a2a12, fg #e8934a, blinking.
  - **idle** otherwise. Label `NOMINAL`, faint (#57503f), border chip, no blink, no
    background — present but recessive (a vanishing chip reads as a broken UI; a steady
    NOMINAL reads as a healthy ship).
  The 0.33/0.5 rails deliberately reuse the existing metric-bar thresholds and the
  established co2 1000/2000 rails — one danger language across the UI. Stateless (no
  hysteresis): metrics move slowly at 1 Hz; accepted. Node tests pin every boundary.
- **IX-85** LLM chip: keeps ids `s-llmchip`/`s-llm` and current behavior (hidden until
  first `llmstatus`; backend + `(degraded)` + $/h; `.degraded` class) — relocated to the
  top bar, content unchanged.

---

## 8. Sensor log & lens row

- **IX-90** SENSOR LOG (bottom-right 400px block): shows the **last 5** lines of the
  latest `log` message (wire carries 14; 5 fill the 170px block at the design's line
  height without truncation ellipses), newest at the bottom. Line format: the leading
  `D<day.dd>` token tinted — newest line's token #e8934a, older #8c8377 — remainder
  verbatim. **No conversion of `d.dd` to HH:MM**: the wire gives centiday precision;
  a minutes clock would claim precision the data doesn't have. Pure splitter
  `logLineParts(line)`, node-tested (including lines without the D-token: render whole
  line untinted). Empty state: the existing faint hint line ("— no events yet · unpause
  or speed up to run the ship —").
- **IX-91** LENS SELECT (bottom-middle 440px): **7 buttons** (the design's 6 slots lose;
  the sim has 7 lenses), equal flex width, labels with their key digit:
  `1 ∅ · 2 PRES · 3 O₂ · 4 CO₂ · 5 TEMP · 6 PWR · 7 H₂O` — indices exactly matching
  `LENSES` (`none/pressure/oxygen/co2/temperature/power/water`), so the printed digit IS
  the hotkey. Click → `Cmd.lens(name)`. Container keeps id `lensbtns` + `data-lens`
  attributes (reflectLens contract).
- **IX-92** Active-lens state renders exclusively from `frame.lens` on each frame
  (existing `reflectLens` pattern) — click and keys 1–7 both converge there; no optimism.
  Sub-caption under the row: `1–7 LENS · ATMOSPHERICS & POWER`.
- **IX-93** Legend placement: the old sidebar `#legendcard` becomes a floating overlay
  card anchored to the **top-right corner of the canvas stage** (absolute within the
  stage, above the canvas, non-interactive `pointer-events:none`), visible only when
  `frame.lens !== 'none'`, rendering the `legend` message lines verbatim. Rationale: the
  legend annotates the canvas colors; it belongs on the surface it explains. Keeps ids
  `legendcard`/`legend`.
- **IX-94** The old sidebar `#metrics` bars are superseded by the caution chip +
  lens/legend system in this layout; the `#inspect` lines render as the idle content of
  the canvas hint line (cursor tile inspection is a canvas affair). Both keep their ids;
  `renderMetrics` continues to feed `s-day` (IX-81 replaces its chip content format).

---

## 9. Degraded & edge states

- **IX-95** Disconnect: keep `#disc` as a full-viewport modal overlay —
  `LINK LOST — RECONNECTING…` (blinking token), pointer-events blocking everything
  beneath; session.js already retries at 900 ms and flips it via the existing
  onConnChange. No countdown number (the retry cadence isn't surfaced by session.js;
  don't fake one).
- **IX-96** On disconnect: `armedTool → null` and any pending cross-deck click (IX-42) is
  dropped. Panels stay open (transcripts are the player's record). On reconnect the
  snapshot replay (frame/status/metrics/legend/log/inspect/roster) repopulates every
  authoritative surface without user action; chat panels for sessions the host no longer
  knows simply sit ended/inert until closed.
- **IX-97** Empty roster (all dead / pre-first-roster): CREW WATCH shows header
  `CREW WATCH — 0 SOULS` + one faint line `No souls aboard.`; CREW tab likewise. The
  readout follows IX-55. No skeleton shimmer, no placeholder rows.
- **IX-98** Dead crew while selected: the next roster message lacks the cid →
  `selectedRosterEntry` returns null → readout drops to empty state and the row
  disappears; if the host still reports frame.sel on that tile, the canvas reticle is the
  host's business (client renders what the wire says). An open citizen card for the dead
  crew stays open (it is a record) until closed; `citizenCache` is NOT purged (BIOGRAPHY
  disabled state follows selection, not the cache).
- **IX-99** Mid-conversation death: the chat reducer's existing ended/endReason handling
  is the whole behavior — the dialogue panel shows the ended indicator (title/indicator
  from endReason), input disabled. No auto-close, no client-side eulogizing; the
  Chronicle carries the death (CHRONICLE tab).
- **IX-100** llmstatus degraded: IX-85 chip turns `.degraded`; additionally, dialogue
  panels are NOT blocked or annotated — the game is fully playable offline by design
  (TemplateBackend); degraded is information, not a gate.
- **IX-101** Window too small: the app grid declares `min-width: 1180px; min-height:
  700px`; below that the page scrolls (browser default) — panels never overlap or
  collapse, and layout() keeps working because the stage keeps its real size. The stage
  keeps 14px padding; layout()'s 28px subtraction is preserved verbatim (FACTS coupling).
  The 1920×1000 design is the reference proportion, not a fixed size: side panels fixed
  (250/310px), bottom bar fixed (170px), top bar 46px, center flexes.
- **IX-102** Screenshot rig compatibility: canvas id `c`, stage-parent sizing contract,
  `?exec/?t/?cx/?cy/?zoom` handling, and any DOM `slice-shot.mjs` touches are preserved;
  verify against `art/screenshot-test/slice-shot.mjs` before renaming anything it queries.

---

## Test obligations (summary)

New pure, node-tested functions (client/test/): `clockHHMM`, `cautionState` (every
boundary), `moraleColor`, `surname/initials`, `speedLabel`, `logLineParts`,
`selectedRosterEntry`, `crewClickTarget`, the pending-cross-deck-click reducer, and the
armedTool transition table (arm/disarm/single-slot/exit rules as a pure reducer). No test
pins a DOM id/class (existing convention). ci.sh stays green: 530 dotnet + 125 node
(+ the new node tests).
