# Retiring the console skin — implementation plan

**Status:** PLAN ONLY. Nothing in this document is built. No production code or test was changed on
this lane; the branch carries this file and nothing else.

**Decisions it serves (Garvin, 2026-07-25).**

1. There is **one** standard UI from now on: `--ship grid` wearing the **Level-1 Overview** +
   **Level-2 Room Zoom**. The console `.app` skin is the old path and goes. Sequencing: port the
   missing verbs onto the modern surface first, verify the game is playable there, then delete the
   console.
2. **MOSS and RELATIONS are must-preserve** — re-homed, never deleted. CHRONICLE and CREW are empty
   and low-stakes.
3. **Free-text conversation is replaced, not preserved and not ported** (governance; §1.5). The game
   must ship fully playable without it. Positioning is **LLM ready**, not LLM powered. All crew
   interaction later consolidates into one **Persona window** whose design is deferred and is *not*
   designed here.
4. `--ship slice` stays what it is: the **headless measurement fixture** for the economy programme,
   driven by a host with no UI. It needs no modern face (§8).

**The motivation is anti-recurrence, not tidiness.** E0-4 spent a whole work package (WP-5) building
the stockpile `ACCEPTS ▸` filter onto the deprecated console — `client/index.html:96-104`,
`client/src/ui/hud.js:297-311`, `client/src/ui/hud.js:526-532` — and nobody noticed until the running
game was looked at. So the success criterion is not "the verbs moved". It is **a future lane cannot
build on the wrong surface by accident**, mechanised. §3 is that package, and it is not last.

---

## 0. The four findings that shape everything below

1. **The Overview does not merely *delegate* to the console — it *is* the console's state layer wearing
   a different skin.** `client/src/ui/hud.js` is two things fused into one 1291-line file: (i) the
   authoritative wire-message cache + the single armed-tool/tab/selection state machine, which the
   Overview and Room Zoom both read (`overview-view.js:18`, `roomzoom-view.js:14` — both
   `import * as Hud from './hud.js'`), and (ii) the console's DOM chrome. **Deleting the console is
   therefore a *split* of `hud.js`, not a deletion of it.** Anyone who deletes `.app` from
   `index.html` without doing that split gets a white page: `renderMetrics` (`hud.js:159`),
   `renderLog` (`hud.js:186`), `renderLegend` (`hud.js:200`), `renderInspect` (`hud.js:205`),
   `renderStatus` (`hud.js:211`), `reflectLens` (`hud.js:231`), `buildLensButtons` (`hud.js:241`) and
   `setChip` (`hud.js:46`) all dereference `$(id)` with **no null guard**.

2. **Only ONE of the 495 node tests is coupled to the console page, and NO node test imports
   `hud.js` at all.** Measured at HEAD `fd73d1b`: `node --test "client/test/*.test.js"` → **495 pass,
   0 fail** (`client/package.json:7`). `client/test/moss-screen.test.js` is the sole file that reads
   `index.html`/`styles.css` (`:119`, `:120`, `:823`, `:830`, `:842`, `:852`), and its IX-M1 test
   *derives* the covered set from the real `index.html` body roots (`:115-117`) — so it will need
   updating, not deleting. `client/test/ui.test.js:2-3` states the reason for the rest: *"the
   panels.js / hud.js DOM shells are exercised in the browser, not here."* **The deletion is nearly
   test-free. That is the risk, not the relief** — there is no safety net under the split in §7, so
   the verification in §7.4 has to be human and explicit.

3. **RELATIONS today *drops the player into the console skin*, and that is a live visual regression on
   the modern surface, not a hypothetical.** `overview-view.js:299` gates the Overview on
   `SHIP_TABS.has(Hud.getTab())` with `SHIP_TABS = new Set(['build','crew'])` (`:47`). Selecting
   RELATIONS from the Overview command bar calls `Hud.selectTab('relations')` (`:638`) → `setTab`
   (`hud.js:688`) → `_tab='relations'` → `shouldShow()` false → `body.overview-open` removed
   (`:305`) → `styles.css:911` stops hiding `.app` → **the whole console reappears**, with
   `#relations-view` inside `.stage` (`index.html:53-65`). MOSS does *not* have this problem: it is a
   body-level sibling (`index.html:154`) and `body.moss-open` hides `.app`, `#panels` and
   `#overview-view` outright (`styles.css:902-904`, `:913`), so MOSS works identically from either
   surface. CHRONICLE is honest about it — `overview-model.js:76-88`: *"CHRONICLE still renders as a
   tab button … but is INERT … selecting it would un-hide the old `.app` and strand the player."*

4. **The HANDOVER's three prerequisites for an Overview ORDERS layer are two, not three, and one of
   them is smaller than written.** `docs/HANDOVER.md:715-717` names *"debris authored into the grid
   ship, a designation wire channel (the frame's raw `GlyphColor` bytes only serve the legacy
   canvas), and a decision to break the schematic rule."* Verified against today's code in §4.1: the
   debris claim holds, the schematic-rule claim holds, and the **wire-channel claim is wrong for
   dig/stockpile/strip** — those three designations already ride the frame in
   `cell[1]` and both SVG surfaces simply throw the byte away. A new channel *is* needed, but only
   for the two things genuinely absent from the wire: the **per-tile accept mask** and the
   **unreachable back-off**.

---

## 1. Inventory — the console **shell** vs the **surfaces it hosts**

This distinction is the spine of the plan. The **shell** is the `.app` frame: top bar, CREW WATCH
sidebar, READOUT sidebar, the legacy tile canvas + its stage overlays, the bottom console (tab row,
PLACE palette, ACCEPTS row, LENS SELECT, SENSOR LOG). It is `index.html:11-128`. The **surfaces** are
things that merely happen to be reached *through* the shell today and are independently real.

### (d) Depended upon by the Overview / Room Zoom today — MUST be preserved

Not a list of nice-to-haves: if any of these goes, the modern surface stops working.

| what | where | who consumes it |
|---|---|---|
| the wire caches + getters | `hud.js:56-113` (`_frame`…`_connected`; `getFrame`/`getRoster`/`getDecks`/`getRooms`/`getDesigns`/`getTerminals`/`getDecor`/`getMaterials`/`getStatus`/`getMetrics`/`getLog`/`getLlm`/`getTab`/`isConnected`/`isMossActive`/`getSelectedEntry`) | `overview-view.js:297,308-316,366-367,531-532,541`; `roomzoom-view.js:204,220-224,261,532` |
| the ship-update subscription | `hud.js:91-94` (`onShipUpdate`/`notifyShip`) | `overview-view.js:124`; `roomzoom-view.js:87` |
| the ONE armed-tool slot + its reducer | `hud.js:59,118-124,432,441-447` over `console-model.js:250` `nextArmedTool` | `overview-view.js:580,639`; `main.js:74,284-286` |
| the stockpile accept-mask | `hud.js:64,436` (`getStockFilter`) | `main.js:75,284` → `controls.js:116,166,269` |
| the tab state machine | `hud.js:116,688-715` (`selectTab`/`setTab`) | `overview-view.js:592,638,643` |
| the shared crew-selection flow incl. **cross-deck** | `hud.js:126,764-767,834-845` (`selectCrewByCid`→`selectCrew`→`crewRowClick`) over `console-model.js:182,193,209` | `overview-view.js:591,640`; `roomzoom-view.js:534` |
| TALK / BIO seams | `hud.js:128,130-135` | `overview-view.js:645,647` |
| the Escape stack | `hud.js:491-504` over `console-model.js:494` `escapeTarget` | `main.js:73,279` |
| MOSS creation + takeover | `hud.js:734-750` (`reflectMossView`) | `overview-view.js:592,643` |
| `console-model.js` as a pure library | 38 exports, `console-model.js:19-494` | imported by **6** modules: `controls.js:11`, `render/matte.js`, `hud.js:18-25`, `moss-screen.js`, `overview-model.js`, `overview-view.js:24-27` |
| the `panels` layer (dossier / MOSS drawer; + the conversation window being replaced, §1.5) | `panels.js:35` mounts `#panels` (`index.html:148`, a **body-level sibling**) | `hud.js:1208`; reached from `overview-view.js:645,647` |

**`console-model.js` is misnamed, not console-only.** Do not delete it and do not rename it in the
same package as anything else (a rename touching 6 importers is its own reviewable unit, and is
optional — see §7.3).

### (a) Already on the modern surface — nothing to do

- Deck stepper / clock / DAY · pause / speed / CAUTION / LLM / STORES chips — `overview-view.js:181-195`,
  painted `:365-416`. Richer than the console's (`b-caution` is clickable → MOSS, `:643`).
- CREW WATCH dock with portraits + morale — `overview-view.js:210-215`, `:435-467`.
- SELECTED readout with traits, task, current-room atmos, TALK/MOVE/BIO — `:218-254`, `:472-520`.
- LENS island (7 buttons) — `:257-259`, `:524-526`.
- SENSOR LOG (last 5) — `:276-282`, `:540-571`.
- Deck rail — `:420-431`. Build ghosts — `overview-scene.js:456` `ghostLayer`; Room Zoom
  `roomzoom-view.js:394-416` `ghostSvg` (with the starved/ready supply-ledger look).
- Build/decorate verbs — `roomzoom-view.js` + `room-model.js:27-56`, with drag-build
  (`build-drag-model.js`) and the material picker (`build-material-model.js`), which the console
  never had.
- **The `#panels` layer** (dossier card + MOSS IDE drawer) already renders over the Overview:
  `styles.css` hides `#panels` only under `body.moss-open` (`:903`) and `body.roomzoom-open`
  (`:1147`) — **not** under `body.overview-open`. The dossier is reached from the Overview at
  `overview-view.js:647` → `hud.js:130-135`. The free-text conversation window that shares this
  layer is **slated for replacement, not for porting** — see §1.5.

### (b) Console-only and must be ported or re-homed

| # | thing | console home | why it must move |
|---|---|---|---|
| B1 | **DIG / STOCKPILE / STRIP verbs** | palette `hud.js:275-295`; keys `controls.js:256-261`; lowering `controls.js:69-87` `paletteOrders` | the three economy verbs E0-3/E0-4/E0-5 built. Absent from `ROOM_TOOLS` (`room-model.js:27-29`) and from `overviewClickAction` (`overview-model.js:66-75`, which returns **no** build/order action by design) |
| B2 | **ACCEPTS ▸ filter chips** | `index.html:101-104`; built `hud.js:297-311`; reflected `hud.js:526-532`; model `stock-filter-model.js` | E0-4's player-facing half. Nothing equivalent on either modern surface |
| B3 | **RELATIONS** | `#relations-view` inside `.stage`, `index.html:53-65`; rendered `hud.js:773-822`; regard rows in the readout `hud.js:1176-1196`; CSS `styles.css:242-294`, `:333-346` | **explicitly must keep working.** Today it un-hides the console (finding 3) |
| B4 | **on-map WORK markers** | `hud.js:664-684` over `console-model.js:397` `workMarkers` / `:380` `taskTag`; CSS `styles.css:228-241` | the only place the map answers *"is this person actually working?"*. `overview-scene.js:400-407` tags pawns with **surname only** |
| B5 | **CREW WATCH task line** | `hud.js:926-931,957-959` over `console-model.js:388` `watchTask`; CSS `styles.css:161-170` | same honesty rule, dim-when-idle. The Overview crew row shows name/role/morale only (`overview-view.js:446-450`) |
| B6 | **paused-ship nudge** | `index.html:36`; `hud.js:463-477` over `console-model.js:412,424,433` | "you armed a tool while the ship is on HOLD" — the classic first-run *nothing-happened* moment. The Overview has a `toast` (`overview-view.js:689`) that can carry it for ~6 lines of glue |
| B7 | **MOSS *entry* from the map** | tab row `hud.js:262-269`; terminal directory tab `hud.js:1065-1101` | MOSS itself is shell-independent (finding 3). Entry from the Overview already exists twice — terminal click `overview-view.js:592` and CAUTION chip `:643`. What is lost is only the **directory list** of terminals; the Overview's `terminalLayer` (`overview-scene.js:457`) already draws them on the map |

### (c) Console-only and safe to drop

| thing | console home | why dropping is safe |
|---|---|---|
| the **legacy tile canvas** + `composeScene` + Canvas2D/WebGL2 executors as the *play* surface | `index.html:47`; `main.js:157-171` | it is the old skin. ⚠️ **Do not delete the render stack** — `client/test/` carries 100 tests over it (`scene` 22, `webgl` 22, `lightfield` 19, `webgl2` 14, `matte` 13, `lighting` 9, `compose` 8) and `client/tools/shot.mjs` parity harness depends on it. §7.2 keeps it as a dev route, deleting only its status as *the* game view |
| the **bottom-console tab row** as navigation | `index.html:89`; `hud.js:262-269` | superseded by `overview-view.js:269-270` `OV_TABS` |
| **CHRONICLE** pane | `index.html:111`; `hud.js:1104-1129` | already inert from the Overview (`overview-model.js:87`), and empty in play. Carrying it over = one `#chron-view` body sibling + `Cmd.chron()` on open ≈ 40 lines. Cost it, do not sequence on it |
| **CREW tab** long-form table | `index.html:106-109`; `hud.js:989-1051` | already dead from the Overview: `crew` **is** in `SHIP_TABS` (`overview-view.js:47`), so selecting it keeps `overview-open` and the table stays behind a hidden `.app`. Its unique columns (mood, traits, deck) all exist in the dossier (`panels.js`) |
| **`legend` + `inspect` wire channels' renderers** | `hud.js:198-206`; `index.html:48-51` | ⚠️ **honest loss.** The lens legend card and the tile-inspector text have **no home** on either SVG surface. The Overview's lens wash (`overview-view.js:347-361`) is self-explanatory and the READOUT covers crew inspection, but *device* inspection text is genuinely lost. Recommend: keep the two `render*` functions as null-guarded no-ops (2 lines) rather than deleting the channels host-side, and re-home later if missed |
| **LENS SELECT** pane, **SENSOR LOG** pane, top-bar duplicates | `index.html:118-126`, `:13-37` | duplicated by the Overview islands |
| the **PLACE palette** as a widget | `index.html:91-95` | replaced by the Room Zoom palette (`roomzoom-view.js:149-157`) + §4's ORDERS bar |

---

## 1.5 Free-text conversation: replaced, not ported

**Governance decision (Garvin, binding).** The game must ship **fully playable without free-text
conversation**. The product is **LLM *ready*** — a user can integrate a model easily — and does not
depend on one. The reason is governance: limiting liability exposure. All crew interaction will later
consolidate into **one Persona window** that also carries the in-depth character-simulation
information; **its design is explicitly deferred and is not designed here.**

**This is stronger than the standing `CLAUDE.md` invariant.** That invariant says *"The game must stay
fully playable offline (TemplateBackend)"* — it removes the *cloud* dependency, not the conversation.
The new bar removes the conversation itself. Anyone reading the old invariant as sufficient will
under-deliver.

### 1.5.1 Playability finding: does play depend on conversation today?

**Mechanically, no. Presentationally, yes — in exactly one place.**

- **Goals: no dependency.** `GoalKind` is the complete set `PressurizeAnchor`, `ClearAllDebris`,
  `ExploreAnchor` (`sim/Sim.Core/Systems/GoalSystem.cs:8`, evaluated `:118`, `:130`, `:144`). The
  three authored goals are `AuthoredShips.cs:196-198`. **No goal requires typing at a character.**
- **The Director: no dependency.** `sim/Sim.Core/Director/DirectorSystem.cs` contains no reference to
  conversation, chat or talk (grepped).
- **Work: no dependency, and this is measured, not argued.** `hosts/scenario` runs the full system
  stack for sim-days with **no conversation surface at all** and produces working crew — that is what
  every A1 / occupancy / `--strip` / `--stockpile` measurement in the economy programme *is*. Since
  E0-1, crew self-serve work off `IsIdleForWork` without being asked.
- **One real coupling: `AgreeTask`.** `ApplyCitizenEffectCommand` is the sole gate through which a
  backend's `CitizenEffect` reaches the sim (`sim/Sim.Core/Effects/ApplyCitizenEffectCommand.cs:5`),
  and `CitizenMemory` consumes the resulting events (`sim/Sim.Core/Citizens/CitizenMemory.cs:301`),
  including *"(Accepted AgreeTask) → 0.7 'promise' for the citizen"* (`:210`). So today, asking a crew
  member to do something and having them agree is a **conversation-only pathway** into memory and
  relationships. Removing conversation makes that pathway **go quiet** — it does not break anything
  (no event, no memory, no hash change; the pinned ships never converse), but it is a real capability
  the Persona window will have to carry. **Flagged as the single functional thing that falls away.**
- ⚠️ **The one hard presentational dependency: first-run onboarding.** `client/src/ui/onboarding.js`
  teaches **TALK as one of the game's two verbs** — the ◈ TALK card at `:40-42` (*"press T to open a
  channel. They remember what you say"*), the controls row at `:20` (*"T — talk to the selected
  crew"*), and the lede at `:35-38`. This is *the* onboarding surface (`main.js:260-261`, and it
  doubles as the game's only help screen via `?`). **With conversation gone it teaches a verb that
  does not exist.** It must be rewritten, and that is not optional cleanup — it is the first thing a
  new player reads.

### 1.5.2 What chat owns, so nothing is lost by accident

| owner | what it holds | fate |
|---|---|---|
| `client/src/ui/chat.js` (166 lines) | the pure stream reassembler: `initChatState` `:29`, `chatPanelAction` `:43`, `citizenLog` `:55`, `reduceChat` `:77`, `reduceChatAll` `:126`, `getSession` `:131`, `streamingText` `:136`, `sessionModel` `:150`, `PLAYER_WHO` `:26` | **retained, unwired.** It is a pure module with no DOM. Keeping it costs nothing and it is the natural substrate if the Persona window ever surfaces an opted-in transcript |
| `client/src/ui/panels.js` dialogue half | `dialogue()` `:65`, `hasDialogue()` `:77`, `closeDialogue()` `:79`, `closeActiveDialogue()` `:89`, `activeDialogueSid` `:28`, `onSend` `:18`, `onBye` `:20` | **stubbed** (see 1.5.3). ⚠️ `panels.js:11` imports `PLAYER_WHO, citizenLog` from `chat.js` **for the dossier's CONVERSATION LOG** — so the dossier is coupled to chat.js. Either the log section goes with the conversation, or `citizenLog` stays imported. Recommend: **keep the import, drop the section from the card**, and let the Persona window decide later |
| `client/src/input/controls.js` | `T` → `talkSelected()` `:231`, `:127-131`; `Enter`-on-selected-crew fallback `:271` | **`T` unbound; the Enter fallback collapses to the plain tile click.** `input.test.js` covers `paletteOrders`/`crewTileNear`, not `talkSelected` — no test blocks this |
| `client/src/ui/hud.js` | `talkSelectedCrew` `:128`, `renderChat` `:1238`, `_chat` `:1203`, `onDialogueSend`/`onDialogueClose` `:1224,1226`, `closeActiveDialogue` `:1230`, the `dialogueOpen` Escape rung `:494` | **stubbed**; the `dialogueOpen` rung becomes permanently false, so `escapeTarget` (`console-model.js:494`) needs no change |
| `client/src/main.js` | `Hud.onDialogueSend` `:270`, `Hud.onDialogueClose` `:271`, `case 'chat'` `:224` | the two bindings go; **keep `case 'chat'` as a no-op forward** so an opted-in integration is one line from live |
| `client/src/ui/overview-view.js` | `[T] OPEN CHANNEL — TALK` button `:234`, handler `:645` | **becomes the Persona-window seam** (1.5.4) |
| `client/src/ui/onboarding.js` | the TALK verb card + controls row | **rewritten** (1.5.1) |

### 1.5.3 What must be stubbed or removed for a playable-without-conversation build

1. **Unbind `T`** (`controls.js:231`) and drop the Enter-on-selected-crew branch (`:271`).
2. **Remove the `[T] OPEN CHANNEL — TALK` button's chat behaviour** (`overview-view.js:645`) — the
   *button* stays as the Persona seam; only its wiring changes.
3. **Do not send `talk`/`say`/`bye`** from the client. Leave `Cmd.talk`/`Cmd.say`/`Cmd.bye`
   (`wire/session.js`) defined and the host parse intact — those are the integration surface.
4. **Drop the dossier's CONVERSATION LOG section** (`panels.js` citizen card), keeping `citizenLog`
   imported and unused-but-live.
5. **Rewrite the onboarding card** to two verbs the shipped game actually has. Recommended pairing:
   **▣ BUILD** (unchanged, `onboarding.js:43-45`) and **⛏ ORDERS** (dig / zone / strip — the verbs
   this whole plan is porting). Replace the `T` controls row with `G / Z / V`. Keep *"Your crew are
   people"* — the character simulation is real and is not conversation; the lede should promise
   *observation and relationship*, not typing.
6. **Do not remove anything host-side or sim-side.** See 1.5.5.

### 1.5.4 The Persona window seam — marked, not designed

Leave exactly one seam, in one place, and write "deferred" next to it rather than a guess:

- `overview-view.js:234` — the readout's primary action button. Retarget it from
  `Hud.talkSelectedCrew()` to `Hud.openPersonaForSelected()`, a **new one-line seam in `ship-state.js`**
  that today opens the existing dossier card (`hud.js:130-135`) and carries a `TODO(persona)` naming
  this document. That gives the button an honest destination immediately, keeps the crew↔player
  interaction consolidated in **one** place as instructed, and means the Persona window replaces one
  function body rather than being threaded through five surfaces.
- **Nothing else may grow crew-interaction affordances in the meantime.** WP-0's surface guard (§3.1)
  is the right enforcement point: add `openPersonaForSelected` to its census as the **only** sanctioned
  crew-interaction entry, so a later lane that scatters a second one fails a test.

**Not designed here, deliberately:** the window's layout, its tabs, how traits/relationships/needs/
history are arranged, whether it hosts orders, and whether it ever surfaces a transcript.

### 1.5.5 What is load-bearing for "LLM ready" — do not gut it in a later cleanup

A future cleanup lane reading "chat is gone" could delete all of this. It must not. These are the
**integration surface a user opts into**, and several are also load-bearing for the *shipped* sim:

| keep | why |
|---|---|
| `sim/Sim.Llm/` — the three adapters + `TemplateBackend` + `EffectEnvelopeParser` | the integration surface itself. `.env` auto-route + the env-gated smoke (`hosts/scenario -- llm-smoke`) stay the opt-in path |
| `hosts/web/ConversationHub.cs` | sockets-free orchestration, per-session transcript, retry/timeout budget, and the durable MEMS summary write (`:280`) |
| `sim/Sim.Core/Effects/` — `CitizenEffects.cs`, `ApplyCitizenEffectCommand.cs`, `EffectValidator.cs` | **the `CitizenEffect` set is a spine file.** It is the *only* validated path from any narrative source into the sim, and the Persona window will need it |
| `sim/Sim.Core/Citizens/CitizenMemory.cs` (the `'MEMS'` `IStatefulSystem`) | **hashed sim state**, folded via `StateChecksum` (`:225`, `:349`), and a consumer of many events besides effects. Nothing about it is conversation-specific |
| `sim/Sim.Core/Citizens/PersonaSheet.cs`, `sim/Sim.Core/Memory/Eulogy.cs` | the character simulation the Persona window will surface. The verbatim eulogy is a shipped feature with no conversation dependency |
| `hosts/web/GameSession.cs`'s `talk`/`say`/`bye` parse + the `chat` wire channel | leave defined and unreferenced-by-the-client. Deleting them makes integration a host change instead of a client toggle |
| `tests/Perilune.Tests/WebConversationTests.cs`, `WebTranscriptTests.cs`, `EffectKindWidthTests.cs`, `tests/Perilune.Tests/Llm/` | **all stay green.** They test the integration surface, not the shipped UI |
| `client/src/ui/chat.js`; `client/test/dialogue.test.js` (7 tests); the chat half of `client/test/ui.test.js` (of 17) | pure models + their tests. **No test deletion here** — see §7.5 |

**Vocabulary discipline for every doc, commit message and UI string produced by this programme:**
"LLM ready", "opt-in integration", "character simulation". Never "LLM-powered", never "talk to your
crew" as a shipped promise.

---

### Explicitly out of scope

`hosts/web/Client.html` (1.09 MB) is a **fourth**, separate legacy surface served by the same host at
`/` (`WebHost.cs:107-120`) on the same port that serves `/ws` to the modern client (`WebHost.cs:94`).
**Do not touch it in this programme.** It is load-bearing for the sprite pipeline in both directions
— `art/spritegen/run.py:44,47` writes its SPRITEGEN block (forbidden to hand-edit,
`CLAUDE.md` "Invariants"), `client/tools/extract-sprites.mjs:18-22` reads it, and
`client/test/sprites.g.test.js:88-95` asserts the extractor is idempotent and in sync with it, so
deleting the file turns a node test red. Retiring it is a separate lane with an art-pipeline
prerequisite.

---

## 2. Verdict on the delegation question

**The Overview depends on the console's *state layer*, hard, and on the console's *shell* in exactly
one place that matters: RELATIONS.** Everything else the Overview "delegates" resolves as follows —
MOSS is shell-independent and already reachable two ways from the Overview; CHRONICLE is already
inert-by-design rather than delegated; CREW is already a no-op from the Overview. So the scary
version of the finding ("the console is a live dependency, deleting it means re-homing five
surfaces") is **wrong**. The true shape is:

> One file (`hud.js`) must be split. One surface (RELATIONS) must be re-homed. Two habits (work
> markers, crew task line) and one affordance (paused nudge) should be carried over. Everything else
> either already lives on the modern surface or is safe to drop.

That is a materially smaller job than the brief feared, and the sequencing the decision asks for
(port → verify → delete) is **not** impossible or disproportionately expensive. It is the right order
for an independent reason given in §9.2.

---

## 3. The anti-recurrence guard — WP-0, and it goes FIRST

The failure mode is not ignorance; it is that "which surface is current?" lived only in prose that a
lane author would have to go looking for. `ArchitectureBoundaryTests.cs` is the repo's own proof that
a mechanised boundary catches drift in hours, and its class doc states the philosophy to copy:
*"Crossing one deliberately means editing the allowlist in this file IN THE SAME COMMIT as the
crossing … That edit is the point: it makes an architectural decision visible in a diff instead of
invisible in a merge."*

Three layers, cheapest first. **All three land before any porting**, so every later package in this
plan is itself checked by them.

**3.1 A node source-scan guard: `client/test/surface-boundary.test.js` (new).**
Precedent for the technique already exists in this suite — `client/test/input.test.js:205-219`
counts string occurrences in `src/input/controls.js` and `src/main.js`; `client/test/palette.test.js:21`
parses `sim/Sim.Glyph/GlyphColor.cs`; `client/test/stock-filter-model.test.js:23,130` parses
`sim/Sim.Core/Entities/ItemStack.cs` **and** `hosts/tui/Ui/StockFilterModel.cs`. Cross-language,
text-scanning guards are house style here. Assertions:

- **The console-id denylist.** A frozen list of the shell's element ids (`palette`, `stockfilter`,
  `stockfilter-row`, `tabs`, `crewlist`, `crewtable`, `ro-body`, `metrics`, `log`, `legend`,
  `legendcard`, `inspect`, `hint`, `lensbtns`, `s-deck`, `s-lens`, `s-day`, `s-caution`, `s-nudge`,
  `s-llmchip`, `b-talk`, `b-move`, `b-bio`, `b-pause`, `b-faster`, `b-slower`, `b-deckup`,
  `b-deckdown`, `tab-build`, `tab-crew`, `tab-moss`, `tab-chron`, `tab-relations`) must appear in
  **zero** files under `client/src/` once WP-9 lands. Before WP-9, the same list is an
  **allowlist-with-owner**: each id may appear only in `hud.js`, and the count is pinned — so a new
  lane adding a widget to the console makes the count move and the test names the surface rule in its
  failure message.
- **The surface census.** Every `client/src/ui/*-view.js` must be reachable from `main.js`, and the
  set of body-level surface roots in `index.html` must equal a pinned list. This is the same
  derive-from-the-real-page trick `moss-screen.test.js:115-117` already uses, pointed at surface
  ownership instead of takeover coverage.
- **The verb parity assertion (the WP-5 tripwire).** For each of `dig`, `stockpile`, `strip`: if the
  verb appears in `controls.js`'s `paletteOrders` (`controls.js:69-87`), it must also appear in the
  modern surface's tool table. This is the single test that would have caught E0-4's mistake, and it
  is ~15 lines. **Pin it in WP-0 as `todo`-shaped (asserting the *current* truth plus a named
  failure message) and flip it to strict in WP-6** so it never sits red.

**3.2 A dotnet guard for the host side.** Extend `ArchitectureBoundaryTests` (or a sibling
`SurfaceBoundaryTests` — preferred, so the existing file's allowlists stay legible) with: any new
`WireFormat` channel must be consumed by at least one `client/src/` file. Uses the existing
`RepoRoot()` probe (`ArchitectureBoundaryTests.cs`, the `ci.sh` + `sim/Sim.Core` two-landmark walk).
This catches the inverse mistake — a host channel built for a surface that never reads it.

**3.3 Prose, but placed where a lane author cannot miss it.** One paragraph in `CLAUDE.md` under
"Invariants" naming `--ship grid` + Overview/Room Zoom as *the* surface and `--ship slice` as the
headless measurement fixture; the same in `docs/PLAN.md`'s lane rules and at the top of
`docs/HANDOVER.md`. Prose alone is what failed; prose **plus** 3.1 is the belt and braces.

**3.4 Remove the console's entry point.** Deferred to WP-9 (§7) on purpose: until the verbs are
ported, the console is the only place the player can dig. Making it unreachable early would break the
game between packages, which §9.2 argues is the one outcome to avoid.

---

## 4. Content and verbs on `--ship grid`

### 4.1 Verifying the HANDOVER's three prerequisites

**(i) "debris authored into the grid ship" — TRUE, and it is worse than "no debris".**
`AuthoredShips.PeriluneGrid()` (`sim/Sim.Gen/AuthoredShips.cs:741`) has no `Goals` and no debris —
its own comment says so at `:837-838`: *"the grid ship seeds NO diggable regolith (its decks are
pre-carved, not a collapse to clear)."* And `DesignateDigCommand` refuses a non-debris tile outright:
`sim/Sim.Core/Commands/Commands.cs:116` — `if (_on && sim.World.GetWall(_pos) != TileDefs.Debris) return;`.
So **DIG is a guaranteed silent no-op on the standard play ship.** It cannot be demonstrated, cannot
be acceptance-tested there, and a player clicking it gets nothing with no explanation.

The other two verbs are fine: STOCKPILE needs only a walkable tile (`Commands.cs:137`) and the grid
ship has loose items to haul (8 `Potato` + 24 `Regolith` in storage, `AuthoredShips.cs:833,842-843`);
STRIP targets standing walls and devices, of which the grid ship has many, with the `IsPressureHull`
guard protecting the hull columns. **STRIP is in fact the grid ship's substitute matter source** —
it is the only verb there that *creates* `Regolith`.

**The fix, and a correction to the record.** `docs/design/perilune-debris-and-skills.md:39-66` already
proposes exactly the right thing — wreck-fill some `RoomType.None` hall slots with debris + dead
devices — and says at `:64-66` that it *"changes generated ship layout ⇒ it moves the scenario pin and
the tick-3000 goldens."* **That claim is wrong when the change is confined to `PeriluneGrid()`.** The
scenario pin is seed-42 *procedural* (`ci.sh:28-31`), `perilune_tick3000_hash.txt` is `Perilune()`,
`slice_tick3000_hash.txt` is the slice, and the defs checksum is defs. **No golden covers the grid
ship** — the only test that touches it is `tests/Perilune.Tests/AddRoomCommandTests.cs`. So
wreck-filling grid halls is **pin-free**, provided:

- the wreck-fill helper is called **only** from `PeriluneGrid()` and adds **no new `.def` field**
  (a def field would move `DefsChecksumTests`'s pinned `5a471d12643b64f9`); and
- **deck 1 slot 3 is left alone.** `AddRoomCommandTests.cs:26-30` `FirstEmptyHall` takes the *first*
  `RoomType.None` slot — `Hall(1, 3)` at `AuthoredShips.cs:753` — and asserts its centre probe
  resolves to a sealed, airless, non-vacuum-sink room (`:51-55`). Putting a debris **wall** on that
  centre tile would change what `RoomAt(probe)` returns. Wreck-fill decks 2–7, which no test reads.

This makes the grid-content package **much cheaper than the record implies** and removes the pin
ritual from the critical path. It must still be measured, not asserted — see §10.

**(ii) "a designation wire channel" — WRONG for the three verbs, RIGHT for two other things.**
The designations are already on the wire. `GlyphMapper.Project` recolours the terrain that carries
them — `sim/Sim.Glyph/GlyphMapper.cs:83-86` *(corrected 2026-07-25 by WP-2's review; this doc said
`:82-85`, which starts on a comment and **excludes the Deconstruct line the same sentence names**)*:
`TileFlags.Designated` → `GlyphColor.Designate`,
`TileFlags.Stockpile` → `GlyphColor.Stockpile`, and the deconstruct registry → `GlyphColor.Deconstruct`
— and those bytes ride every frame as `cell[1]` (`client/src/wire/messages.js:7-8`:
*"A frame cell: [glyphCode, fgColorId, bgColorId, attrBits]"*). Indices are stable and appended:
`Designate` = 15, `Stockpile` = 16, `Deconstruct` = 26 (`sim/Sim.Glyph/GlyphColor.cs:28,29,39`).

> **⚠️ AMENDED 2026-07-25 by WP-2, which built on this paragraph and found it TRUE BUT NARROWER THAN
> IT READS.** A designation reaches the wire only if **no later `GlyphMapper` pass repaints the tile**.
> Pass 1 writes the designation colour (`:83-86`), but pass 3 (items, `:110`), pass 4 (devices, `:123`)
> and pass 5 (citizens, `:138`) each overwrite `fg` wholesale. Measured consequences, all three live:
> a **strip mark on a device NEVER reaches the wire** (so WP-2 shipped strip marks for **walls only**);
> a **crew member standing on a designated tile hides its mark** — and on `--ship grid` the crew
> cluster in the hold at x25-32 y15-16, exactly where the dig designations are; and a **stockpile tint
> vanishes the moment an item is stored on the tile**, which is the *normal* state of a working
> stockpile. The last of these is why the Overview and the Room Zoom will visibly disagree about a
> full stockpile until **WP-6** has the Overview read the `zones` channel (which already exists and is
> immune, being fed from the job board rather than from `cell[1]`). **The fix for all three is a
> channel, not a better reader** — `cell[1]` is lossy by construction here.

Both SVG surfaces throw the byte away. `room-model.js:223-239` `roomCells` reads only `cell[0]` and
**skips** `NON_FURNITURE` — which includes `37`, i.e. `'%'`, i.e. `Glyphs.Debris`
(`room-model.js:195`; `sim/Sim.Glyph/Glyphs.cs:17`). `overview-scene.js:53` has the same set. So
**debris is invisible in both the Overview and the Room Zoom today**, and so are stockpile zones and
strip marks. Reading `cell[1]` is a pure-model change in `room-model.js` / `overview-scene.js`, both
of which are node-tested (`room-model.test.js` 22 tests, `overview-scene.test.js` 14) — cheap and
verifiable.

Genuinely **absent** from the wire, and needing a new channel:

- **the per-tile stockpile accept mask.** Stated in the code itself, `controls.js:80-82`:
  *"there is no wire channel for a filter, see MECHANICS §13"*. This is E0-4 feedback gap 1 (§5).
- **the unreachable back-off set.** `HaulJobSource.BackedOffStockpileTiles`
  (`sim/Sim.Core/Jobs/Sources/HaulJobSource.cs:108`) is a **count**: `=> _tileRetryAt.Count`, over
  `private readonly Dictionary<Int3,long> _tileRetryAt` (`:53`). The brief's "one line from being
  enumerable" is accurate — an `IEnumerable<Int3>` (or a `TryGetBackoff(Int3, out long)`) beside the
  existing count, in the same diagnostic-surface style the file already documents at `:103-107`. This
  is E0-4 feedback gap 3.

Recommended shape: **one new sparse channel, `zones`**, carrying `[[x,y,deck,mask,flags],…]` for
every stockpile tile — mask = the accept-set, flags = a bit for "backed off / unreachable". Modelled
on the existing sparse `materials` channel (`WireFormat.cs:485-487`, decoded
`messages.js:346-360`). One channel, not two, because both facts are per-stockpile-tile and both are
consumed by the same badge. It is a **new** `WireFormat` method, so no existing web golden moves
(`Golden/web_frame_boot.json`, `web_frame_boot_crew.json` pin the default-ship *frame*).

**(iii) "a decision to break the schematic rule" — TRUE, and here is the recommendation.**
The rule is written twice and deliberately: `overview-model.js:49-52` (*"BUILDING IS ZOOM-ONLY …
there is NO 'build' action here"*) and `overview-view.js:263-268` (*"Building is ZOOM-ONLY … the
BUILD tab carries no tile-build tools — just a hint pointing the player into a room"*). See §4.2.

### 4.2 Room-scoped vs map-scoped — the real conceptual problem, and how to resolve it

It is a real problem, not a technicality. `roomzoom-view.js` clamps **everything** to the focused
room: clicks (`room-model.js:168-178` `tileFromCanvasXY` returns `null` outside the rect),
drag-builds (`roomzoom-view.js:576-578` `roomBounds()`), and rendering
(`roomCells`/`roomCrew`/`roomDesigns`/`roomDecor`, `room-model.js:223-292`). Meanwhile:

- **DIG** targets debris, which — post wreck-fill — sits inside hall slots. **Room-scoped fits.**
- **STRIP** targets walls and devices inside compartments. **Room-scoped fits**, and it is the safer
  home: the `IsPressureHull` guard means the hull is never strippable anyway, and a room-scoped
  gesture makes the *partition* the obvious target.
- **STOCKPILE** is where it breaks. A stockpile is a *logistics decision about the ship*: you zone the
  storage room because the crew hauling from deck 3 need somewhere to put things. Painting it one
  room at a time, having entered that room through the Overview, is the wrong altitude — and the
  ACCEPTS filter compounds it, because the filter is a **preference across paints**
  (`hud.js:60-64`: *"A PREFERENCE, not part of the armed transition … it survives disarm, tab
  switches and Escape"*).

**Recommendation: split by altitude rather than forcing one home.**

- **Room Zoom gains DIG and STRIP** as two more `ROOM_TOOLS` (`room-model.js:27`), classed
  `'order'` in `PALETTE_CMD` (`:43-56`) alongside the existing `structural`/`functional`/`cosmetic`/
  `demolish`. They inherit drag-sweep for free by joining `isStructuralTool`'s sibling set — a debris
  field and a wall run both want a sweep, and `buildDragTiles` (`build-drag-model.js`) is already
  clipped to `roomBounds()`.
- **The Overview gains a deck-scoped ORDERS bar** carrying STOCKPILE (+ ACCEPTS) and, for
  convenience, DIG/STRIP. This **breaks the schematic rule, and it should be broken *narrowly and
  explicitly***: the rule's own justification is that *walls* are placed inside rooms. A designation
  is not construction — it consumes no material and changes no geometry, it marks intent. The
  distinction already exists in the code: `console-model.js:229` `isOrderTool` vs `:220` `isBuildTool`,
  and `controls.js:53-56` spells it out (*"Same gesture, different verb — routing an order tool
  through `Cmd.build` would hand it to BuildSystem, which knows nothing about designations"*). So the
  amended rule is **"BUILDING is zoom-only; ORDERS are deck-scoped"**, which is a sharper rule than
  the one it replaces, and `overviewClickAction` (`overview-model.js:66`) gains an `'order'` branch
  ahead of `'enterRoom'` — an armed order tool must suppress the room-entry click, exactly as
  `armed === 'move'` already does at `:67`.
- The Overview's tile resolution for this already exists and is already tested: `pointToTile`
  (`overview-view.js:616-624`) → `tileAt(_ctx.transform, …)` (`overview-model.js`) → the shared
  `makeTransform` invert (`overview-scene.js:107-109`), used today by the MOVE order
  (`overview-view.js:586-589`). **No new hit-testing is required.** Precision caveat: the schematic
  is a non-uniform affine squeeze of a whole deck into a 705×234 box (`overview-scene.js:38`), so one
  tile is a handful of pixels — fine for sweeping a zone, marginal for picking one wall. Hence
  DIG/STRIP living in *both* places, with the Room Zoom as the precise instrument.

---

## 5. The three E0-4 feedback gaps, designed in

These are being rebuilt anyway; re-inheriting them would be a choice.

**Gap 1 — a filtered stockpile tile has no visual indicator anywhere.** Needs the `zones` channel
(§4.1 ii). Design: a stockpile tile renders as a zone tint in both SVG surfaces (from `cell[1] === 16`),
and a **filtered** tile additionally carries a corner badge. Do **not** try to encode which 7 kinds
are accepted per tile — use `stockFilterLabel` (`stock-filter-model.js`, already written and used at
`hud.js:541`) for a compact "FOOD" / "3 KINDS" string, shown on hover/selection, with the badge
carrying only *"restricted"*. Pure derivation, node-testable, no new colour id (so `GlyphColor` — a
spine file — is **not** touched).

**Gap 2 — chips affect only future paints, with nothing saying so.** This is a *wording and
placement* fix, not a mechanism: the ACCEPTS row header currently reads `ACCEPTS ▸`
(`index.html:103`) and each chip's title says *"Accept … in stockpiles painted from now on"*
(`hud.js:308`) — true, and invisible. On the ORDERS bar, label it
`ACCEPTS ▸ (applies to tiles you paint next)` and add the count of already-painted tiles that differ.
The data for that count is the same `zones` channel. Cheap, and it removes a whole class of
"I changed the filter and nothing happened" report.

**Gap 3 — a zone where no crew can reach silently never fills.** WP-7 fixed the livelock and, as its
own author noted, traded expensive-and-visible for cheap-and-invisible. With the `flags` bit on the
`zones` channel: the tile renders **UNREACHABLE** (dim + hatch + a one-line reason in the readout).
Note the semantics honestly — `_tileRetryAt` is a *retry stamp*, cleared wholesale on any tile-board
rebuild (`HaulJobSource.cs:453`) and per-tile on proof of reachability (`:503`) — so the indicator is
*"no hauler has reached this recently"*, not a proof of permanent unreachability. Label it that way;
the alternative (a real reachability query) is a sim change and out of scope.

**These three are the strongest argument for doing the port at all.** They are impossible on the
console (no channel, no SVG layer) and natural on the modern surface.

---

## 6. Work packages

**Spine files** (`CLAUDE.md`: integrator lane only): `Simulation.cs`, `SystemStack`, save chapters,
`GlyphColor`, `WireFormat`, `Commands`, the `CitizenEffect` set. **Two packages touch one:** WP-3 and
WP-4 both add a `WireFormat` method. `GlyphColor` is deliberately **not** touched (§5 gap 1).
No package touches `Simulation.cs`, save chapters, `Commands`, `SystemStack` or `CitizenEffect` — the
three verbs already have their `ISimCommand`s (`Commands.cs:102`, `:124`, `:162`, `:222`) and their
wire parse (`GameSession.cs` `CmdKind`, the `filter` case, `HandleFilter`). **B1 is a UI-side port,
confirmed.**

| WP | what | files (disjoint) | reviewable claim | spine? |
|---|---|---|---|---|
| **WP-0** | anti-recurrence guard, layers 3.1–3.3 | `client/test/surface-boundary.test.js` (new); `tests/Perilune.Tests/SurfaceBoundaryTests.cs` (new); `CLAUDE.md`, `docs/PLAN.md`, `docs/HANDOVER.md` | the guard fails on a seeded violation and passes on HEAD; the verb-parity test names the surface rule in its message | no |
| **WP-1** | wreck-fill grid halls, decks 2–7 | `sim/Sim.Gen/AuthoredShips.cs` (grid block only); `tests/Perilune.Tests/GridWreckTests.cs` (new) | debris tiles + dead devices exist on decks 2–7; `AddRoomCommandTests` still green; **all five pins byte-identical, measured** | no |
| **WP-2** | surfaces read `cell[1]`: debris / zone / strip marks in both SVG views | `client/src/ui/room-model.js`, `client/src/ui/overview-scene.js`, + their two test files | a designated tile renders differently from an undesignated one, in both views, asserted on the fg byte | no |
| **WP-3** | the `zones` channel (mask + backoff bit) | `sim/Sim.Core/Jobs/Sources/HaulJobSource.cs` (enumerator only); `hosts/web/WireFormat.cs`; `hosts/web/GameSession.cs`; `client/src/wire/messages.js`; `tests/…/ZonesChannelTests.cs` (new) | channel emits mask + backoff for every stockpile tile; **inert (absent/empty) on a ship with no stockpile**, so no existing golden moves | **yes** (`WireFormat`) |
| **WP-4** | Room Zoom gains DIG + STRIP | `client/src/ui/room-model.js`†, `client/src/ui/roomzoom-view.js`, `client/test/room-model.test.js` | both verbs sweep, clipped to the room, emitting the same payloads `paletteOrders` emits | no |
| **WP-5** | Overview ORDERS bar: STOCKPILE + DIG/STRIP, deck-scoped | `client/src/ui/overview-model.js`, `client/src/ui/overview-view.js`, `client/test/overview-model.test.js` | an armed order tool suppresses room-entry; a click lowers to the same payloads; the amended schematic rule is written into `overview-model.js`'s doc | no |
| **WP-6** | ACCEPTS chips on the ORDERS bar + the three §5 indicators | `client/src/ui/stock-filter-model.js`, `client/src/ui/overview-view.js`†, `client/src/ui/zone-badge.js` (new), `client/styles.css`; flip WP-0's parity test to strict | a filtered tile is visibly filtered; an unreachable tile is visibly unreachable; the chips say they apply to future paints | no |
| **WP-7** | re-home RELATIONS as a body-level sibling | `client/index.html`, `client/styles.css`, `client/src/ui/relations-view.js` (new, lifted from `hud.js:754-822,1176-1196`), `client/src/ui/hud.js`, `client/src/ui/overview-model.js` (drop `relations` from any inert/delegating path) | selecting RELATIONS from the Overview shows the web **without** the console reappearing; regard rows appear in the Overview readout | no |
| **WP-8** | carry over work markers, crew task line, paused nudge | `client/src/ui/overview-scene.js`†, `client/src/ui/overview-view.js`†, `client/test/overview-scene.test.js` | a working pawn is tagged with its task; an idle one is not; arming while paused surfaces the nudge | no |
| **WP-C** | conversation stand-down + onboarding rewrite + the Persona seam (§1.5.3–1.5.4) | `client/src/input/controls.js`, `client/src/ui/onboarding.js`, `client/src/ui/panels.js`, `client/src/ui/hud.js`†, `client/src/ui/overview-view.js`†, `client/src/main.js` | the game boots, plays and completes a goal with **no conversation surface reachable**; the intro card teaches only verbs that exist; `openPersonaForSelected` is the sole crew-interaction entry; `WebConversationTests`/`WebTranscriptTests`/`Llm/`/`dialogue.test.js` **all still green** | no |
| **WP-9** | **the deletion** (§7) | `client/index.html`, `client/styles.css`, `client/src/ui/hud.js` → split, `client/src/main.js`, `client/test/moss-screen.test.js`, `client/test/input.test.js`, `client/src/ui/console-model.js` (prune) | the game is fully playable with `.app` gone; node suite green with a **stated, intended** count change | no |

† A file appearing in two rows is a genuine ordering constraint, not a conflict, provided the rows
run in the stated order. WP-4/WP-5/WP-6 must be **sequential** on `overview-view.js`/`room-model.js`.

### Order, and why

```
WP-0 ──┬── WP-1 ──┬── WP-2 ── WP-4 ── WP-5 ── WP-6
       │          │
       ├── WP-3 ──┘
       ├── WP-7
       ├── WP-8
       └── WP-C   (must land BEFORE WP-9 — see below)
                              …all above green… ── WP-9
```

**WP-C's position is a real constraint, not a preference.** It must land **before** WP-9 and **after**
WP-5, for two reasons. (i) It *removes* a verb from the onboarding card, so the card must have a
replacement verb to teach — and ORDERS only exists after WP-5. Landing WP-C first would leave the
intro card teaching nothing but BUILD. (ii) It is the only package that changes what the game *is*
rather than where it is drawn, so it wants the modern surface already proven under it. It shares
`hud.js` and `overview-view.js` with WP-6/WP-7/WP-9, so it runs **sequentially** with them, not in
parallel.

- **WP-0 first, unconditionally.** It is cheap, it is the *point* of the exercise, and every package
  after it is then checked by it. Doing it last would repeat E0-4's mistake inside the very lane
  meant to prevent it.
- **WP-1 before WP-2/WP-4/WP-5.** Without debris on the grid ship, the DIG verb and the debris
  rendering have nothing to render or exercise, and any acceptance test for them is vacuous — the
  exact defect `docs/HANDOVER.md` and the E0-4 orchestration memory both record as *the* recurring
  review failure ("the test whose named mutation cannot bite", 6 instances in E0-4).
- **WP-2 before WP-4/WP-5.** Arming a DIG tool over invisible debris is not a portable verb.
- **WP-3 before WP-6.** The indicators need the channel.
- **WP-9 last, and only after a human plays `--ship grid` end to end.**

**Parallel-safe:** {WP-1, WP-3, WP-7, WP-8} after WP-0 — four disjoint file sets, four worktrees.
WP-2→WP-4→WP-5→WP-6→WP-C→WP-9 is a serial chain on shared files (`overview-view.js`, `hud.js`,
`room-model.js`). Per the E0-4 orchestration memory: **each package gets its own worktree AND private
log filenames.**

### What the second ruling deleted from this plan

Stated rather than shrunk quietly, as asked:

- **WP-D is gone entirely.** It was "make the conversation window reachable from the Room Zoom" —
  `styles.css:1147` hides `#panels` under `body.roomzoom-open`, and `roomzoom-view.js:645-658` does not
  handle `T`. That was a gap in a feature that is now being replaced, so closing it would have been
  work spent on something scheduled for removal. **The underlying CSS fact still matters** for the
  Persona window: whoever designs it must decide whether `#panels` should be visible under
  `body.roomzoom-open`, or whether the Persona window is a body-level sibling like MOSS. Recorded here
  so the decision is not rediscovered.
- **"Dialogue already works on the Overview" stopped being a *payoff*** and became a fact about a
  surface being retired. It is now only relevant as the reason the *dossier* and *MOSS drawer* survive
  console deletion for free (`#panels` is a body sibling).
- **The "headline feature" framing is withdrawn** throughout. Nothing in this plan sequences on
  conversation.

---

## 7. The deletion package (WP-9), in detail

### 7.1 `index.html`

Delete `<div class="app">` … `</div>`, i.e. **`index.html:11-128` — 118 of 158 lines.** What survives:
`#overview-view` (`:134`), `#roomzoom-view` (`:140`), `#disc` (`:142-144`), `#panels` (`:148`),
`#moss-view` (`:154`), the `<script type="module">` (`:156`). WP-7 will have added `#relations-view`
as a sibling by then. **The canvas must not simply vanish** — see 7.2.

### 7.2 The canvas and the render stack

Keep every file under `client/src/render/`. 100 node tests cover it (§0 finding 2) and
`client/tools/shot.mjs` is the executor-parity harness. What changes is its **status**: the canvas
element moves out of `.app` into a hidden dev container shown only under `?legacy=1`, and `main.js`
gates `layout()`/`draw()`/`Hud.paintStageOverlays()` on it. This is the honest version — deleting the
executors would delete a fifth of the client test suite for no gain, and the parity harness is how
the WebGL2 path stays trustworthy.

### 7.3 `hud.js` — the split

`hud.js` is 1291 lines. Split into:

- **`client/src/ui/ship-state.js`** (keep, ~590 lines): everything in inventory row **(d)** — the
  caches + getters (`:56-113`), `onShipUpdate`/`notifyShip` (`:91-94`), the action seams
  (`:116-135`), `enrichCitizen` (`:140-155`), the armed-tool slot
  (`:432,436,441-447,451-457,481-483`), `handleEscape` (`:491-504`), `setConnected` (`:509-521`),
  `setTab` minus its DOM (`:688-715`), `reflectMossView` (`:734-750`), the selection flow
  (`:764-767,834-845`), the panels/chat layer (`:1202-1275`), `renderLlmStatus` minus its chip
  (`:1279-1290`), and each `render*` dispatcher reduced to *cache + notify + forward-to-MOSS*.
- **Deleted (~580 lines):** `renderMetrics`' DOM (`:159-168`), `renderLog`' DOM (`:186-194`),
  `renderStatus`' DOM (`:211-221`), `reflectLens` (`:230-234`), `buildLensButtons` (`:239-248`),
  `initConsole`'s wiring (`:256-347`), `reflectArmed` (`:523-545`), `pulseAt` (`:547-566`), the whole
  stage-overlay block (`:571-684`), the crew-watch/table block (`:847-1051`), `renderMossTab`
  (`:1065-1101`), `renderChronBlock` (`:1104-1129`), `refreshSelection`'s DOM (`:1140-1171`),
  `paintNudge`/`nudgeIfPaused` (`:463-477`), `setChip` (`:46`).
- **Moved out in WP-7 (~120 lines):** `relEdges`/`reflectRelationsView`/`renderRelationsWeb`
  (`:754-822`) + `regardSectionsHtml` (`:1176-1196`) → `relations-view.js`.
- **Kept as null-guarded no-ops (2 lines):** `renderLegend`, `renderInspect` — see inventory (c).
- **Kept deliberately despite looking dead:** `renderChat` as a no-op forward and the `chat.js`
  import. WP-C will already have stood the conversation wiring down
  (`hud.js:128,1224,1226,1230,1238`) and added `openPersonaForSelected`. These lines are exactly what
  a reviewer flags as "unused, delete it"; the answer is §1.5.5 — they are the opt-in integration
  surface, and deleting them turns integration from a client toggle into a host change.

`main.js` loses `Hud.initConsole` (`:252`), `Hud.buildLensButtons` (`:262`), the five topbar button
bindings (`:263-267`), and `Hud.paintStageOverlays()` from `draw()` (`:170`). It keeps the whole
`onMessage` switch (`:203-246`) — every channel still has a consumer.

### 7.4 `styles.css`

Delete the console-shell regions: `.app` frame (`:72-78`), top bar (`:79-134`), crew watch
(`:135-170`), stage + ghosts + work marks (`:171-241`), readout (`:295-332`), bottom console incl. the
E0-4 chip block and the MOSS/CREW tab panes (`:347-480`). **≈ 400 of 1230 lines.** `:242-294`
(RELATIONS web) and `:333-346` (regard sections) **move** in WP-7. Everything from `:481` on stays —
disconnect overlay, floating panels, dossier, MOSS drawer, MOSS terminal, Overview, onboarding,
motion, breakpoints, Room Zoom.

### 7.5 Tests: which die, and the honest count

**Answer: essentially none die; two are edited.** This is the counter-intuitive result and it needs to
be visible in the commit message rather than discovered later.

| file | tests | fate |
|---|---|---|
| `moss-screen.test.js` | 45 | **edited, not deleted.** Its IX-M1 takeover test derives the covered set from the real `index.html` body roots (`:115-117`) and its four CSS-text tests read `styles.css` (`:823,830,842,852`). Removing `.app` shrinks the covered set — the assertion must be re-derived, and that edit is the test doing its job |
| `input.test.js` | 12 | **edited.** `:205-219` counts `Cmd.filter(` / `= paletteOrders(` / `getStockFilter:` / `installInput({` occurrences in `controls.js` and `main.js`; `main.js` changes in 7.3. WP-6 should have already retargeted this at the modern surface |
| `console-model.test.js` | 45 | **survives as-is, but ~8 tests then cover dead code.** `hintLine`, `chronHeader`, `nextNudge`/`nudgeVisible`/`NUDGE_MS`, `moreBelow`, `soulsLabel` exist only for console chrome. WP-8 rescues `nextNudge`/`nudgeVisible` (the paused nudge) and `watchTask`/`taskTag`/`workMarkers`; the rest (`hintLine`, `chronHeader`, `moreBelow`) become genuinely orphaned. Recommend **pruning them in a separate, named commit** so a deliberate test deletion is a visible act, not a side effect |
| `dialogue.test.js` (7) + the chat half of `ui.test.js` (17) | 24 | **untouched and must stay green.** Per §1.5.5 the conversation *models* are retained as the opt-in integration surface; only the *wiring* is stood down in WP-C. A green `dialogue.test.js` after WP-C is the evidence that "LLM ready" was preserved rather than gutted |
| everything else (26 files, 369 tests) | 369 | **untouched** — pure models, wire contracts, renderer, asset pipeline |

**Expected count movement: from 495 down by roughly 3–8**, all from the deliberate `console-model`
prune, plus whatever WP-0/WP-2/WP-4/WP-5/WP-6/WP-7/WP-8 *add* (each package brings tests, so the net
is very likely **up**). **Re-measure and state the number in the commit message** — do not quote 495
or these deltas as fact at landing time.

Dotnet side: **zero** tests die. No `tests/Perilune.Tests/*.cs` file references `client/`.

### 7.6 Verification that nothing else regressed

1. `./ci.sh` green, all five pins byte-identical (four state/defs pins + the rules-inclusive
   checksum), node count stated and explained.
2. `client/test/surface-boundary.test.js` (WP-0) flips its console-id allowlist to a **denylist of
   zero occurrences** — the mechanised proof the shell is gone rather than merely hidden.
3. `moss-screen.test.js`'s re-derived IX-M1 set is the mechanised proof MOSS still takes over cleanly.
4. **A human plays `--ship grid`** and checks a written list: read the rewritten intro card and confirm
   every verb it names exists; dig a wreck-filled hall; zone a stockpile with a restrictive filter and
   see the badge; paint a zone nothing can reach and see UNREACHABLE; strip a partition; watch a hauler
   get a work tag; open the dossier from the Overview readout (the Persona seam); open RELATIONS and
   MOSS and CHRONICLE-if-carried; pause and arm and see the nudge; **confirm no conversation surface is
   reachable by any key or click**; complete a goal; disconnect and reconnect.
   `client/tools/shot.mjs` / `moss-shot.mjs` give before/after frames for the record.

---

## 8. TUI and scenario host — impact

**Both are unaffected. Nothing they use is being deleted.**

- **No code is shared between `client/` and `hosts/tui/`, and none can be.** `client/` has no C# and
  is compiled by no `.csproj`; `hosts/tui/PeriluneTui.csproj` compiles only `sim/Sim.Core`,
  `Sim.Dsl`, `Sim.Gen`, `Sim.Glyph`.
- **`hosts/tui/Ui/StockFilterModel.cs` is E0-4's TUI half and stays exactly as is.** The TUI keeps its
  own verb surface: `Terminal/KeyDecoder.cs:24` (`d` → Dig), `:26` (`v` → Strip), dispatch `:100,102`;
  `GameLoop.cs:62` (`_stockMask`), `:203,205`, `:310` `DesignateDig()`, `:326` `DesignateStockpile()`
  with the deliberate stockpile-then-filter ordering at `:341-349`, `:354` `StepStockFilterKind()`,
  `:361` `ToggleStockFilterKind()`, `:368` `ReportStockFilter()`, `:376` `DesignateStrip()`;
  `Terminal/AnsiPaint.cs:47,49` colour `Designate` and `Deconstruct`. It is compiled into the test
  assembly (`tests/Perilune.Tests/Perilune.Tests.csproj:37`) and covered by
  `StockpileFilterVerbTests.cs` (9 tests, three of them directly on `StockFilterModel` at `:397`,
  `:432`, `:460`).
- **One live cross-skin tripwire must keep passing:** `client/test/stock-filter-model.test.js:130`
  parses `hosts/tui/Ui/StockFilterModel.cs` and compares its labels to the JS `STOCK_KINDS`. WP-6
  touches `stock-filter-model.js`, so that test is the guard against the two skins' vocabularies
  drifting. Do not weaken it.
- **`hosts/scenario` has zero dependency on `client/` or on `Client.html`.** `ScenarioRunner.csproj`
  compiles only `sim/*`; every mention of the client in its sources is prose. `--ship slice` remains
  its measurement ship, and `StockpileHarness.cs` / `StripHarness.cs` remain the opt-in sources
  behind `occupancy --stockpile`/`--strip`. **`ci.sh:28` continues to gate the pinned
  `00e0a2dadb8e5076`.**

**On the slice, and the question this plan retires.** The slice needs no modern face: it is the
headless measurement fixture, driven by a host with no UI. For the record, since it was investigated
before the scope correction and the answer is cheap: authoring `SlotDescriptor` entries would have
moved **no** pin. `ShipPlan.SlotGrid` is plan-level and view-only (`sim/Sim.Gen/ShipPlan.cs:38-51`:
*"NEVER copied into World/ZLevel state, a save chapter, or `World.HashInto` … It therefore moves NO
determinism hash"*), `World.HashInto` folds only `Floor`/`Wall`/`Flags`/`RoomId`/`Material`
(`sim/Sim.Core/World/World.cs:133-137`), no save chapter mentions slots
(`Save/SaveWriter.cs:41-48`), and `GameSession.BuildDecks()` is a read-only join of that field with
live `RoomState` (`hosts/web/GameSession.cs:1297-1379`). What *is* hashed nearby, and would have bitten
anyone who touched it, is `RoomAnchor` — `Name`, `Probe` and `Type`, folded **in list order** at
`sim/Sim.Core/Simulation.cs:481-489`. **This question is closed. Do not reopen it.**

---

## 9. Honest cost, ranking, and the state between packages

### 9.1 Ranking by payoff-per-cost

| rank | WP | cost | payoff |
|---|---|---|---|
| 1 | **WP-0** guard | XS | the entire stated motivation; prevents the next WP-5 |
| 2 | **WP-1** grid wreck-fill | S (level data only; pin-free per §4.1) | makes DIG demonstrable *and* testable; turns eight sealed halls into a reason to play |
| 3 | **WP-2** read `cell[1]` | S (two pure files, both node-tested) | debris/zones/strip become visible for the first time on either SVG surface |
| 4 | **WP-7** RELATIONS re-home | S–M | closes the one place the modern surface still exposes the old skin |
| 5 | **WP-5** ORDERS bar | M | the verbs become reachable where the game is actually played |
| 6 | **WP-4** Room Zoom DIG/STRIP | S | the precise instrument; near-free given `room-model.js`'s existing shape |
| 7 | **WP-3** `zones` channel | M (spine: `WireFormat`) | unblocks all three §5 indicators |
| 8 | **WP-6** chips + indicators | M | fixes three known feedback gaps rather than re-inheriting them |
| 9 | **WP-8** work markers / task line / nudge | S | restores three honesty affordances the console had and the Overview lacks |
| 10 | **WP-C** conversation stand-down + onboarding rewrite + Persona seam | S–M (mostly deletion + one rewritten card) | satisfies the governance bar; the onboarding rewrite is the highest-visibility change in the whole plan — it is the first thing a new player reads |
| 11 | **WP-9** deletion | M (the `hud.js` split is fiddly and **untested**) | the actual goal; lowest payoff-per-cost, which is exactly why it goes last |

Total: **11 packages.** Rough shape, offered as a shape and not a schedule: six small (WP-0, 1, 2, 4,
8 + the `console-model` prune), five medium (WP-3, 5, 6, 7, C, 9 — with WP-9 the riskiest per line
because §0 finding 2 means nothing catches a mistake in it). The dominant cost is **not** the porting;
it is **WP-9's split plus the human verification in §7.6**, precisely because the console shell has
zero automated coverage. **WP-C is cheap in lines and expensive in judgement** — the code is mostly
unbinding, but rewriting the game's only onboarding/help surface is a writing task with no test to
check it.

### 9.2 What the game looks like *between* packages — and why the chosen order is right

The worst outcome is a window where neither surface is complete. **The chosen order never has one**,
for a structural reason: **nothing is removed until WP-9.** Through WP-0…WP-8 the console keeps
working exactly as it does today, and `--ship slice` on the console remains a complete fallback the
whole time. Concretely, after each package:

- **WP-0:** identical game, plus a failing-on-violation guard.
- **WP-1:** identical console play; `--ship grid` gains diggable content. **First moment `--ship grid`
  is worth playing.**
- **WP-2:** the modern surface stops lying about designations.
- **WP-4/5/6:** the modern surface reaches parity on the verbs and then exceeds the console (three
  indicators the console can never have). **After WP-6 the decision's "verify the game is playable
  there" milestone is met**, and WP-9 becomes safe to schedule.
- **WP-7/8:** the last regressions close.
- **WP-C:** the governance bar is met. ⚠️ **This is the one package that makes the game briefly
  *smaller* rather than better** — a verb is removed and its replacement (the Persona window) is
  deferred by decision. The mitigation is its position: by WP-C the player has three new order verbs,
  three new indicators, RELATIONS, work markers and a task line, so the net motion of the surface is
  still forward. Landing WP-C early — before the ORDERS work — would produce exactly the "neither
  surface is complete" window this plan is built to avoid, because the intro card would have one verb
  left to teach.
- **WP-9:** the console goes, having already been redundant for several packages.

**One recommendation against the literal brief.** The brief implies deletion is the finish line.
Treat **WP-6 as the finish line for the *decision*** and WP-9 as cleanup that can wait for a quiet
week. The anti-recurrence goal is met at **WP-0**, not at WP-9 — a lane cannot accidentally build on
the console once a test says so, whether or not the file is still there. Deleting under time pressure,
with no test net under the `hud.js` split, is the one way this plan could make the game worse.

**Two things that would change the plan if true, and should be checked before dispatch.**
(i) The grid ship has **three** crew, two workable (`AuthoredShips.cs:826-828`), against the slice's
eight — whether a 3-crew ship is *satisfying* to play is a design question this plan does not answer,
and if the answer is no, a "re-crew the grid ship" package belongs before WP-5.
(ii) The grid ship has **no goal at all** (`plan.Goals` is never touched in `PeriluneGrid()`), so
there is nothing to complete; WP-1 is the natural place to add a `ClearAllDebris`-shaped one.

---

## 10. What I did not read, and did not verify

- **I ran nothing.** No `ci.sh`, no `dotnet test`, no `dotnet run`, no browser. Every claim here is
  from source reading, except the node test count (**495 pass / 0 fail at HEAD `fd73d1b`**, measured
  by running `node --test` per file). The pin values quoted in §4.1 were read out of `ci.sh:31`,
  `Golden/perilune_tick3000_hash.txt`, `Golden/slice_tick3000_hash.txt` and
  `DefsChecksumTests.cs:69` — **not** re-measured.
- **The §4.1 claim that wreck-filling the grid ship is pin-free is derived, not measured.** It rests
  on: no golden or test references `PeriluneGrid` except `AddRoomCommandTests.cs`; the scenario pin is
  seed-42 procedural; the tick-3000 goldens are `Perilune()` and the slice. It **contradicts**
  `docs/design/perilune-debris-and-skills.md:64-66`. **WP-1 must measure before landing** and, if the
  measurement disagrees with me, the doc is right and I am wrong.
- **I did not read `hosts/web/Client.html`** (1.09 MB) beyond locating its SPRITEGEN markers
  (`:211`, `:287`). It appears in a repo-wide stockpile grep, so it has *some* stockpile surface; I
  cannot say which, or what parity it has with `client/`. §1 declares it out of scope on that basis.
- **I did not read** `client/src/ui/moss-model.js` (909), `moss-screen.js` (835), `panels.js` (429)
  or `client/src/items/*` in full — only enough to establish their independence from the console shell
  (`panels.js:35` mounts `#panels`; `moss-screen.js:101-110` touches only `body.moss-open` and
  `#moss-view`). If either has a hidden `.app` dependency I did not find, WP-9 grows.
- **The RELATIONS finding (§0.3) is settled statically, not at runtime.** The chain is
  `overview-view.js:47,299,305,638` + `hud.js:688` + `styles.css:902-913` and is unambiguous, but I
  did not open a browser to watch the console reappear.
- **§9.2's playability judgements are judgements**, not measurements. Whether a 3-crew, goal-less
  grid ship is *fun* is not something I can establish from source.
- I did not verify the `i`/`I` TUI filter-key dispatch line numbers (only `d` → Dig at
  `KeyDecoder.cs:100` and `v` → Strip at `:102`).
- **§1.5.1's playability finding is a search result, not a proof of absence.** I grepped
  `GoalSystem.cs`, `DirectorSystem.cs`, `onboarding.js`, `AuthoredShips.cs`'s goal lines and the
  `CitizenEffect` apply path. I did **not** read the MOSS DSL rules under `content/core/rules/*.moss`,
  the `ScriptSpec`/`ScriptEntry` surface, or `hosts/tui/GameLoop.cs`'s help text, any of which could
  name a conversation verb. **WP-C must grep for `talk`/`say`/`bye`/`Conversation` across
  `content/`, `hosts/tui/` and the docs before declaring the stand-down complete.**
- **I did not read `hosts/web/ConversationHub.cs` or `sim/Sim.Llm/` in full** — only enough to
  establish that `ApplyCitizenEffectCommand` is the sole sim entry point
  (`sim/Sim.Core/Effects/ApplyCitizenEffectCommand.cs:5`), that `CitizenMemory` consumes the resulting
  events (`sim/Sim.Core/Citizens/CitizenMemory.cs:301`, and the `AgreeTask` promise at `:210`), and
  that the hub writes a durable MEMS summary (`ConversationHub.cs:280`). §1.5.5's keep-list is
  therefore a *floor*, not a complete audit. A cleanup lane should treat anything under
  `sim/Sim.Llm/` or `sim/Sim.Core/Effects/` as keep-by-default.
- **I did not verify that the shipped `TemplateBackend` produces nothing player-visible once the
  client stops sending `talk`.** The client-side stand-down (§1.5.3) is sufficient for the
  *reachability* bar, but if any host path can originate a `chat` message unprompted, WP-C needs a
  host-side guard too. Unchecked.
- `docs/MECHANICS.md:1829` still says *"`Stockpile` is one boolean tile flag with no filters"* — stale
  since E0-4. Out of scope here; worth a one-line fix by whoever next edits that file.
