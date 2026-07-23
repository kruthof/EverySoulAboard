# PERILUNE LEVEL-1 SHIP OVERVIEW — INTERACTION SPEC v1

Authoritative interaction contract for the NEW Level-1 Overview view
(`client/src/ui/overview-view.js` + `overview-model.js`), the warm SVG deck schematic mocked in
`docs/design/perilune-game-ui-warm.dc.html`. It is the paired half of
`docs/design/perilune-overview.visual-spec.md` (VS-O-*). Every requirement is numbered IX-O-nn
for review reference. One behavior per requirement — no options.

The Overview is a distinct top-level VIEW, a sibling of the RELATIONS web and the MOSS terminal
takeover: it swaps the WebGL tile canvas for a live SVG schematic + floating HUD islands, driven
by the SAME wire and the SAME command vocabulary (`Cmd.*`) the console already speaks. It
introduces **no new selection model and no new sim command** — every action LOWERS to an existing
`Cmd` (`client/src/wire/session.js`).

Conventions (aligned with `perilune-game-ui.interaction-spec.md`):
- **Authoritative state** = what the wire last said (`frame`, `status`, `metrics`, `roster`,
  `designs`, `decks`, `rooms`, …). The view never latches its own copy of anything the wire
  carries. The only view-latched state is: the armed tool, the active tab, and the transient
  acknowledgments (placement pulse, pending row style).
- **selCid** = `selectedCrewCid(frame)` (`wire/messages.js`), `null` when no crew is selected.
- **frame.deck** is the authoritative shown deck; **frame.lens** the authoritative lens.
- New pure derivations named `xxx()` live in `overview-model.js`, node-tested (per the client
  design log `client/README.md` and the node-test golden discipline; the sim determinism pin is
  `616ed4a84a9f6e87` in `ci.sh` — these views move no sim state).

---

## 0. Scope & precedence (IX-O-01 … IX-O-05)

**IX-O-01** — This spec governs interaction on the Level-1 Overview surface: room clicks, pawn
clicks, build placement over the schematic, deck switching, lens selection, the HUD command bar,
and the Escape stack while the Overview is the active view. Where this spec and the Overview mock
conflict, THIS spec resolves it and the resolution is final.

**IX-O-02** — **Room-detail defers to `perilune-roomzoom.*`.** A room click TRANSITIONS to
Level 2 (Room Zoom); everything that happens after the transition — the zoomed room's controls,
per-tile interaction, occupant actions, the way back up — is owned by the roomzoom spec. This
spec owns only the trigger and the return-to-Overview rung (IX-O-11, IX-O-34).

**IX-O-03** — **Shared behaviors defer to `perilune-game-ui.interaction-spec.md`.** Selection
resolution (`selectedRosterEntry`, `crewClickTarget`, cross-deck pending click), the caution
state machine, clock/speed/morale derivations, the wire-backed build-ghost model (IX-38/IX-39),
the readout action semantics (IX-51/52/53), and the honest tab/tool sets (IX-21/IX-70) are
reused verbatim from the console spec. This spec pins only Overview-specific flows and the points
where the schematic changes how an existing behavior is triggered. **Data-channel shapes defer to
`perilune-wire-channels.spec.md`** — the `decks`/`rooms` channels are referenced, never
redefined. **Palette defers to `perilune-art-direction-warm.md`.**

**IX-O-04** — **All decks exist from cold start.** The `decks` channel enumerates up to 8 decks;
every one is navigable immediately (there is no "unlock a deck" flow). A deck may be mostly
HALLS (unbound slots, VS-O-35) awaiting build-out, but it is always present, always switch-able,
and always shows the 8-slot grid + spine.

**IX-O-05** — **Data sources.** Room geometry is the fixed 8-slot template (VS-O-25); the live
slot tile-rects, the slot↔room binding (`anchorName`), and each slot's `roomType` come from the
view-only `decks` channel (per deck) — and the client derives each room's material/floor colors
and display name from that `roomType` (VS-O-26). Per-room ATMOSPHERE (o2/co2/temp) is the
SEPARATE `rooms` channel, joined by `anchorName`. Pawn positions come from the existing `roster`
(`deck`/`x`/`y`), the same source as the console's on-map work markers. Build ghosts come from the
existing `designs` channel. Deck list comes from the `decks` channel. The Overview adds NO
fog-gated data — it shows own-ship knowledge (decks, rooms, roster, designs) exactly as the
console does.

---

## 1. View + level model (IX-O-06 … IX-O-10)

**IX-O-06** — The Overview is Level 1: one whole deck seen at once as a fixed, centered
schematic. **There is no free pan or zoom at Level 1** — the hull is a fixed composition
(VS-O-13). Navigation between spaces is by deck switch (IX-O-26) and by descending into a room
(IX-O-11). This is the deliberate contrast with the tile canvas: the Overview is the map, Room
Zoom is the room.

**IX-O-07** — The Overview is entered/left like RELATIONS and MOSS — a view swap, not a modal.
Entering it hides the tile-canvas console surface and shows the schematic + floating islands;
leaving it restores whatever surface the player came from. Which chrome affordance selects the
Overview (a top-level view switch) is owned by the console shell; this spec assumes the Overview
is the active view for every requirement below.

**IX-O-08** — While the Overview is active, the wire keeps flowing and the view stays live: every
`frame`/`roster`/`designs`/`rooms`/`metrics`/`status`/`log` message repaints its surface
immediately (pawns move, ghosts appear, atmos updates, the caution chip flips) with no user
action. The Overview never freezes a snapshot.

**IX-O-09** — Exactly two view-latched overlay modes sit on top of the plain Overview: (a) the
armed-tool slot (build/move input mode), (b) the floating P2 panels (dialogue / citizen /
terminal) inherited from the console. Tabs are NOT modes — a bottom-bar tab selects which command
content shows; only an armed tool changes click semantics (mirrors console IX-1).

**IX-O-10** — All selected/active visuals — selected pawn glow + tag (VS-O-42/47), selected crew
row (VS-O-58), active lens button, active deck pip, pause chip — render from authoritative wire
state on the next matching message, never from click optimism (mirrors console IX-3).

---

## 2. Room click → Room Zoom (IX-O-11 … IX-O-14)

**IX-O-11** — Each BOUND room (VS-O-26) carries an invisible click hit-rect covering its slot,
above the tinted floor/glow/furniture (which are all `pointer-events:none`, VS-O-27) but below
the pawns (VS-O-46), so a click that lands on a pawn selects the pawn (IX-O-15) and a click on
bare floor descends. A non-drag click on a room's hit-rect, WITH NO TOOL ARMED, transitions to
Level 2 (Room Zoom) for that room, passing the room `id` + `deck`. The transition target and its
payload contract are owned by `perilune-roomzoom.*`; this spec only fires it.

**IX-O-12** — Room-click while a BUILD tool is armed does NOT zoom — the click is a placement
(IX-O-19). Room-click while the MOVE order is armed does NOT zoom — the click is the move target
(IX-O-40). Arming any tool suppresses the zoom trigger; the zoom is the no-tool default. This is
the single disambiguation rule for a floor click.

**IX-O-13** — A HALL (unbound slot, VS-O-35) does not zoom. Its only interactive element is the
`＋ ADD ROOM` chip (VS-O-36): clicking it, with no tool armed, arms the build flow for that slot
(the room build-out). The exact build-out gesture (which `Cmd`, whether it opens a room-type
picker) is bounded by what the sim supports; v0 lowers to the existing build vocabulary
(`Cmd.build`) targeting the slot's tiles, and if the sim has no room-commission command yet the
chip is rendered but inert with a `title` saying so (never a dead-looking-live control — console
IX-21 honesty rule). Resolve the exact command when the wire channel spec lands.

**IX-O-14** — The room hit-rect click is a DOM/SVG click, not a tile-canvas click; it works
whether or not the P2 panels are open and never issues a `Cmd.click`. Zoom carries no wire
traffic beyond whatever `perilune-roomzoom.*` requests on entry.

---

## 3. Pawn click → select (IX-O-15 … IX-O-18)

**IX-O-15** — Only pawns on `frame.deck` render (VS-O-39); each is a `z-index:5` clickable
container (VS-O-41) above the room hit-rects. A non-drag click on a pawn SELECTS that crew member
by LOWERING to the existing selection path: resolve the pawn's current tile and send
`Cmd.click(x, y)` — the exact same wire call a CREW WATCH row uses (console IX-45). No new
selection message, no client-side "selected" latch.

**IX-O-16** — Selection truth is host-side only (mirrors console IX-40): the selected pawn glow
(VS-O-42), the amber surname tag (VS-O-47), the selected crew row (VS-O-58), and the readout
(VS-O-61) all derive from `selectedRosterEntry(frame, roster)` on each frame — never from the
click. A click the host does not confirm (crew stepped off the tile) simply does not select, and
the pawn is right there to click again.

**IX-O-17** — Pawn click and CREW WATCH row click are equivalent by construction — both end in
`Cmd.click` on the crew's fresh tile; the host answers with `citizen` + `frame.sel`. The row
click reuses the console's `crewRowClick` (same-deck → click fresh tile; cross-deck → deck switch
+ pending click, console IX-41/42). There is one selection flow; the Overview adds a second
trigger (the pawn), not a second path.

**IX-O-18** — Clicking bare space (the star field / hull art / a gap with no room, pawn, or HUD)
is a no-op. There is no "deselect" — the wire has none (console IX-13); selection persists until
another crew is selected.

---

## 4. Build placement over the schematic (IX-O-19 … IX-O-25)

**IX-O-19** — With a BUILD tool armed (`wall` / `door` / `cancel`), a non-drag click on the ship
container (VS-O-13) is a PLACEMENT: project the click into sim-tile coordinates (via the slot
tile-rects `[x,y,w,h]` and the deck's tile origin on the `decks` channel — NOT the mock's free
26px pixel grid, which is a mock artifact), and send exactly one `Cmd.build(kind, x,
y)`. The click sends `build` INSTEAD of `Cmd.click` — no selection, no zoom, no room descent
while armed (IX-O-12). Out-of-bounds / non-floor clicks are dropped view-side.

**IX-O-20** — Confirmation is the wire, never optimism: an accepted designation appears on the
`designs` channel and renders as a persistent wire-backed ghost (VS-O-72); an illegal one never
enters `Pending` and no ghost lingers. The Overview reuses the console's ghost model wholesale —
`designsOnDeck` / `designGlyph` / `ghostState` / `ghostLabel`, and the starved/supplied/ready
supply states (defer to console IX-38/IX-39). The Overview NEVER draws a client-invented ghost.

**IX-O-21** — While a build tool is armed, room floors and halls become the placement surface:
their hover/zoom affordances are suppressed (VS-O-38), the container cursor is `crosshair`, and
the ghost layer previews accepted designations as they land. Drag on the container still pans
nothing at Level 1 (there is no pan, IX-O-06); a press-drag is simply not a placement click
(a 4px Manhattan threshold distinguishes click from drag, matching the console).

**IX-O-22** — Placement acknowledgment: each placement click fires a single ≤160 ms fading
tile-outline pulse at the clicked tile (amber for wall/door, ember-red for cancel), drawn by the
view layer, expiring before the next frame — it acknowledges the INPUT, not the outcome (defer to
console IX-36; VS-O-75).

**IX-O-23** — Tool arming: the PLACE palette buttons (VS-O-68) arm/disarm via the console's pure
`nextArmedTool` reducer — clicking a tool arms it (disarming any other, single slot), clicking
the armed tool again disarms. The B and X keys toggle `wall` / `cancel` and surface the BUILD tab
(console IX-10/IX-23). The shipping palette is `WALL · DOOR · ⌫ CANCEL` only (console IX-21); no
P3-fiction tools.

**IX-O-24** — `⌫ CANCEL` honesty is inherited verbatim: it cancels a PENDING designation and
refunds staged material; it does not demolish built structure (console IX-31). Its `title` is
"Cancel a queued build order (refunds staged material)". While `cancel` is armed, a click on an
existing ghost revokes that designation.

**IX-O-25** — Arming/placing while the sim is paused fires the "PRESS SPACE TO RUN" nudge near
the pause chip (defer to console IX-38's `nextNudge`/`nudgeVisible`) — the classic "I built
something and nothing happened" moment is answered the same way in both views.

---

## 5. Deck switching (IX-O-26 … IX-O-28)

**IX-O-26** — The deck rail (VS-O-49) drives deck switching: clicking a deck pip sends
`Cmd.deck(targetDeck − frame.deck)` (the wire is relative-delta only; the host clamps). The
active pip renders from `frame.deck` on the next frame, never latched on click. Keyboard R/F
(and `>`/`<`) step decks exactly as they do in the console (unchanged). **Integrator note:** the
approved plan's `Cmd.deckTo(z)` is SUPERSEDED by the already-shipped relative `Cmd.deck(delta)`
(`session.js` `deck:(dz)`); this spec correctly uses `Cmd.deck(delta)` and no `deckTo` is needed.

**IX-O-27** — On deck change the whole schematic re-registers: the `decks` channel for the new
deck rebinds the eight slots (rooms + halls) — geometry, `anchorName`, `roomType` — the `rooms`
channel refreshes their atmosphere, pawns filter to the new `frame.deck`, and ghosts filter via
`designsOnDeck`. All of this is driven by the arriving `frame`/`decks`/`rooms`/`roster` messages —
the view holds no per-deck cache the wire does not (it renders the latest wire truth).

**IX-O-28** — An armed build tool SURVIVES a deck change (deck-hopping to keep placing walls is a
core loop — console IX-30). A pending cross-deck crew-row click (IX-O-17) resolves on the first
frame whose `frame.deck` matches the target, then sends `Cmd.click` (console IX-42); if the
deadline passes or another click supersedes it, it is dropped silently.

---

## 6. Lens overlays (IX-O-29 … IX-O-31)

**IX-O-29** — The LENS row (VS-O-65) selects the atmospheric/power overlay: clicking a lens
button sends `Cmd.lens(name)`; the active button renders from `frame.lens` on each frame
(never optimism). The shipping row is the sim's SEVEN lenses with digit-hotkey labels
`1 ∅ · 2 PRES · 3 O₂ · 4 CO₂ · 5 TEMP · 6 PWR · 7 H₂O` (indices matching `LENSES`, so the printed
digit IS the hotkey — console IX-91); the mock's six-slot styling is the visual grammar, the
count is reality (VS-O-66). Keys 1–7 select lenses (unchanged from the console).

**IX-O-30** — A non-`none` lens recolors the room floors by the per-room grade for that metric —
the schematic's floors are the surface the lens annotates (as the tile canvas is in the console).
The grade→color ramps defer to `perilune-game-ui.visual-spec.md` VS-7 and
`perilune-art-direction-warm.md`; the per-room metric values come from the `rooms` channel. Lens
`none` restores the resting material tints (VS-O-33).

**IX-O-31** — With a lens active, a legend of what the grades mean shows as a small overlay near
the LENS island (reusing the console's `legend` wire content). It is display-only
(`pointer-events:none`) and hidden when the lens is `none` (console IX-93 pattern).

---

## 7. HUD command bar + readout actions (IX-O-32 … IX-O-43)

**IX-O-32** — The menu-tabs island (VS-O-69) selects which command content the bottom-center
surface shows. The shipping tab set is `BUILD · CREW · RELATIONS · MOSS · CHRONICLE` (the console's
honest set — console IX-70); the four wire-less tabs (REFIT/ORDERS/SHIP/NAV) are omitted, not
rendered as dead placards. Default active tab on Overview entry: BUILD (its palette doubles as
the "this deck is editable" hint). Exactly one tab active; switching away from BUILD disarms an
armed build tool (console IX-30).

**IX-O-33** — **RELATIONS from the Overview.** Selecting the RELATIONS tab swaps the schematic's
central ship layer for the relations web, exactly as it swaps the tile canvas in the console —
the floating HUD islands stay, the ship layer is replaced (console IX-R1 precedent). A web node
click selects that crew through the ONE shared selection flow (`Cmd.click` on their tile —
console IX-R2), keeping the pawn/row/readout in lockstep. Leaving RELATIONS restores the
schematic.

**IX-O-34** — **MOSS from the Overview.** Selecting the MOSS tab is the full-window terminal
TAKEOVER (console IX-M1) — it replaces the entire Overview (schematic + islands) with the
phosphor terminal, exactly as it replaces the console. Leaving MOSS (its own Escape stack
resolving out, or another tab) restores the Overview. The MOSS terminal is unchanged by this
spec; the Overview is simply the surface it takes over.

**IX-O-35** — **Escape stack (Overview).** Implemented as the view's `onEscape`, in priority
order:
1. If a tool is armed (`armed !== null`) → disarm it (stop; consume the key).
2. Else if a dialogue panel is open → close the active dialogue (existing bye path).
3. Else if the MOSS takeover is active → hand Escape to MOSS's own inner stack (console IX-M2).
4. Else if the RELATIONS tab is active → return to BUILD, restoring the schematic (console IX-R10
   precedent).
5. Else if the view is at **Level 2** (a Room Zoom is open over/after the Overview) → ascend to
   Level 1 (the Overview). The Level-2 side of this rung is owned by `perilune-roomzoom.*`; this
   spec only guarantees Level 1 is the thing Escape returns TO.
6. Else → no-op. Escape never deselects crew (no wire deselect) and never closes the citizen
   card or terminal drawer (they close via their × only).

This is the console's `escapeTarget` rung order (console IX-13 + IX-R10 + IX-M2) with one added
rung — the Level-2→Level-1 ascent — slotted below RELATIONS/MOSS and above no-op. Keep it a pure
reducer (`overviewEscape`), node-tested.

**IX-O-36** — B/X (build/cancel), Space (pause), R/F (deck), 1–7 (lens), T (talk), M (move), P
(sprites), Arrows/WASD-equivalents behave as the console's keyboard map defines them (console
IX-10), after the text-entry guard (typing in a chat box or MOSS editor never arms a tool). The
Overview adds no new key binding; it inherits the map.

**IX-O-37** — CREW tab: the roster long-form table (console IX-72), row click = the selection
flow (IX-O-17). CHRONICLE tab: the chronicle, requested once per connection (console IX-74).
These reuse the console's tab content wholesale — the Overview houses them in the floating
bottom-center surface rather than a solid bar, but the behavior is identical.

**IX-O-38** — The CREW WATCH dock rows (VS-O-58) select via the same `crewRowClick`: same-deck →
`Cmd.click` on the fresh tile; cross-deck → `Cmd.deck` + pending click (IX-O-17/28). A row click
is a DOM click and works identically while a tool is armed (it never places a build). Latency
feedback: the clicked row gets a transient `.pending` amber-border style that clears on the next
roster/frame render (console IX-44).

**IX-O-39** — The dock is the answer to "who is aboard" for crew NOT on the shown deck — a crew
member on another deck has no pawn (VS-O-48) but always a dock row; clicking it deck-switches to
them (IX-O-38). The dock header count is the live living-crew count from the `roster`
(`CREW WATCH — {n} SOULS`).

**IX-O-40** — Readout `[T] OPEN CHANNEL — TALK`: enabled iff `selCid != null`; click →
`Cmd.talk(selCid)` (console IX-51). The `[T]` accelerator is truthful (the T key does exactly
this).

**IX-O-41** — Readout `[M] MOVE`: the guided arm-then-click move order (console IX-52) — click
arms `move` (disarming anything else); the next non-drag click on an in-bounds floor tile sends
`Cmd.cursor(x, y)` then `Cmd.move()`, then disarms. While armed, a floor click is the move target,
NOT a room zoom (IX-O-12). The M key is the instant expert equivalent (`Cmd.move()` selected →
cursor). Exits: Esc, clicking `[M]` again, arming a build tool, selection loss (the move verb
lost its subject → disarm), disconnect.

**IX-O-42** — Readout `[B] BIO`: opens the citizen card panel from the cached `citizen` payload,
enabled iff the cache holds the selected cid (console IX-53). The accelerator honesty follows the
console: the B KEY is BUILD, so `[B]` on this button is the console's known tension — resolve it
the console's way (the label reads `BIO`/`BIOGRAPHY` and the bracket defers to console IX-53's
ruling). Do not invent a second B binding.

**IX-O-43** — All three readout actions render disabled (reduced opacity, no pointer events) when
no crew is selected (VS-O-76 / console IX-55); the verbs stay visible so the action set is
learnable, but they cannot fire without a subject.

---

## 8. Degraded & edge states (IX-O-44 … IX-O-47)

**IX-O-44** — Pause / speed / caution chips (VS-O-55) are the console's exactly: pause from
`status.paused` → `Cmd.pause()`; speed label from `status.speed`; caution derived 1 Hz from
`metrics` via the shared `cautionState` (console IX-84). One danger language across both views.

**IX-O-45** — Disconnect: the console's full-viewport `LINK LOST — RECONNECTING…` overlay covers
the Overview too (the Overview is a view under the same shell). On disconnect the armed tool is
cleared and any pending cross-deck click dropped (console IX-96); on reconnect the snapshot replay
(`frame`/`roster`/`designs`/`rooms`/`decks`/`status`/`metrics`/`log`) repopulates every schematic
surface with no user action.

**IX-O-46** — Empty roster (all dead / pre-first-roster): no pawns render on the schematic; the
CREW WATCH dock shows `0 SOULS` + `No souls aboard.` (VS-O-77); the readout shows the empty state
(IX-O-43). A dead crew while selected drops to the empty state on the next roster (console IX-98);
an open citizen card for the dead crew stays open as a record until closed.

**IX-O-47** — Before the `rooms`/`decks` channels have landed on connect: the schematic renders
the fixed 8-slot template with every slot as a HALL (VS-O-35) and the deck rail as the single
active pip (VS-O-51) — the honest "nothing bound yet" state, not a spinner. Rooms and decks
populate as their channels arrive. Pawns render as soon as the first `roster` lands, positioned
on whatever deck `frame.deck` reports.

---

## Test obligations (summary)

New pure, node-tested functions in `overview-model.js` (client/test/): the deterministic
starfield generator (`stars()` — pixel-stable across runs), `floorBg`, `glowColor`, the click→
tile projection (`tileAt`), the room-hit vs pawn-hit vs hall-hit disambiguation, the
`overviewEscape` rung reducer (IX-O-35, every rung), and the deck-pip→delta mapping. Shared
derivations (`selectedRosterEntry`, `crewClickTarget`, `nextArmedTool`, `cautionState`,
`clockHHMM`, `moraleColor`, `surnameOf`, `designsOnDeck`, `ghostState`, the cross-deck pending
reducer) are IMPORTED from `console-model.js` — not re-forked — so both views share one contract.
No test pins a DOM id/class (existing convention).
