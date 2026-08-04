// First-run onboarding — the one-time intro card and, through the persistent `?` button, the game's
// ONLY help surface. DOM-only, browser-only, mounts over everything. It owns no wire/sim state — it
// is pure presentation and a single localStorage flag.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ EVERY SENTENCE ON THIS CARD IS A CLAIM ABOUT CODE SOMEBODY ELSE OWNS. CHECK IT, DON'T GUESS.
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The card shipped from `d5d574b` (2026-07-23) saying `['B', 'open their dossier']`.
// `B` has never done that: `client/src/input/controls.js:257` arms the BUILD tool, and
// `Hud.openBioForSelected` has NO keyboard binding anywhere. The Overview's own READOUT button is
// labelled `[T] OPEN CHANNEL`, `[M] MOVE`, `[B] BIO` — the `[B]` in THAT label is the same lie, and
// it is where this one was copied from (`ui/overview-view.js:1035`; a click handler, not a key).
// Nobody had driven it. That is the whole defect, and it is why the rows below carry a `bind`: a
// machine-checkable join from what the card SAYS to the branch that implements it. See
// `client/test/onboarding.test.js`.
//
// The other three faults corrected in the same pass (M1-b):
//   • it LED WITH TALK. The owner's binding decision is *ship playable WITHOUT chat, market as
//     LLM-ready* — leading the first screen with a conversation verb was the most misleading thing
//     in the product. TALK is demoted to one control row. It is NOT removed: it works (driven —
//     `T` opens a dialogue panel for the selected crew).
//   • it named ZERO order verbs. DIG / STOCKPILE / STRIP are the player's primary input
//     — "we define tasks" — and five console-retirement work packages exist to put them on this
//     surface. The card mentioned none of them.
//   • its fiction was the pre-wreck one ("a drifting ship, a skeleton crew"). `hosts/web` boots
//     `--ship wreck` (`hosts/web/Program.cs:61`).
//
// ✅ DISCHARGED 2026-08-04 — THE THAW SENTENCE IS ON THE CARD. This note used to read: *"⚠️ WHAT
// THE CARD DELIBERATELY DOES NOT PROMISE. The premise ends '…and the rest thaw one at a time
// through MOSS'. THE PODS STILL DO NOTHING THE PLAYER CAN ASK FOR … So the card states the seven
// sleepers as a FACT and never as a verb. When M3-3/M3-4 land, that is the sentence to add."*
// M3-3 (the `thaw` command) and M3-4 (`pods`/`thaw` on the console) landed 2026-08-01 and M3-17's
// `commission` on 08-02 — AND THE SENTENCE WAS NEVER ADDED. The owner found the hole in live play
// on 08-03: *"there is still no way to defreeze others."* The arc itself works — a driven audit the
// same night walked repair → commission → pods → thaw on the shipped game — so what was missing was
// never the verb. It was the TEACHING, on the one surface whose whole job is teaching.
// So: the LEDE now says the verb and names the place — "Seven sleep on, and MOSS thaws them one at
// a time" — and the controls list carries a MOSS row that hands over the DISCOVERY verb rather than
// the chain: `type HELP`, whose own list is COMMISSION / PODS / THAW (`ui/moss-model.js`
// HELP_LINES, joined in `onboarding.test.js`). That division is deliberate and is this card's whole
// theory of itself: THE CARD TEACHES DOORS, THE THING BEHIND THE DOOR TEACHES ITS OWN VERBS. A card
// that spelled repair → commission → pods → thaw would be four claims about four other people's
// code, ageing at four different rates — the `B`-row shape, four times over.
// ⛔ FOUND DEFECT, REPORTED NOT FIXED — "MOSS-HELP-BELOW-THE-FOLD" (outside this package: it is
// `ui/moss-screen.js` + `styles.css`, and this card owns neither). The row above sends the player to
// `HELP`, and `HELP` answers with TWELVE lines into `.moss-console`, which is
// `max-height:22vh;overflow-y:auto` and **does not scroll to its own newest output**. DRIVEN on the
// shipping game at 1280×800 (`onbthw-mossrow`, 2026-08-04): `clientHeight 157 / scrollHeight 305 /
// scrollTop 0`, **7 of 14 lines visible**, and the three the arc needs — COMMISSION, PODS, THAW —
// are all in the hidden half. The card's promise still holds (the screen's own permanent footer
// reads `TYPE: LOG, PROG, PODS, COMMISSION, HELP`, so two of the three are on screen unconditionally
// and `pods` reaches the third), which is why this is FILED rather than treated as a blocker — but
// it is the palette-overflow shape, on the surface the thaw arc runs through, four days before a
// playtest. It is also the reason this row says `type HELP` rather than spelling the chain: when
// that pane is fixed, the card needs no edit.
//
// ⚠️ AND THE THIRD ADDITION IS THE ONE A PLAYER CANNOT DISCOVER: under OD-H every work type boots
// OFF, so the CRAFT the commissioning module needs (`SimDefs.cs:1007` — the MachineShop recipe that
// makes a `ControllerModule`) never runs until the player switches it on, and the WORK tab is the
// only surface anywhere that can (`ui/overview-model.js:353`). The ◈ ORDER block says so. It is a
// FACT, not an apology: work is opt-in by design.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE SEND-BACK: THE PASS THAT DELETED FALSE SENTENCES SHIPPED TWO NEW ONES. Recorded in full,
// because both were written the same way the `B` row was — from a PLAN, not from the shipped thing.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//   • "Beyond the bay the ship is airless" was FALSE. It copied the CHARTER's one-compartment
//     premise; the shipped ship authors **THREE** pressurised anchors —
//     `AuthoredShips.cs:1893-1896` adds `WreckCryoAnchor`, `"wreck_spine_0"` and
//     `WreckReactorAnchor`, `AuthoredShips.cs:1341` says so in capitals, and
//     `WreckShipTests.ExactlyThreeSpacesBootBreathable_AndTheRestIsVacuum` asserts that exact set.
//     ⇒ WHEN THE CARD AND THE CHARTER DISAGREE, THE SHIP WINS. The charter is a plan; the card is
//     a claim about a running program.
//   • the BUILD block was wrong three ways, and the third one MISDIRECTS INTO A SILENT FAILURE:
//       – "Pick a material" — `toolHasMaterial` is wall/floor ONLY (`build-material-model.js:38`);
//         DOOR carries none.
//       – "drag to sweep a run" — `isSweepTool` is structural + order (`room-model.js:142`).
//         FURNITURE IS A PLAIN CLICK; it never sweeps.
//       – "Building spends REGOLITH" — true for structure (`BuildSystem.cs:57 Material =
//         ItemKind.Regolith`) and FALSE for furniture, which is `PlaceDeviceCommand` and charges
//         `Currency = ItemKind.Parts` (`Commands/Commands.cs:332`), `DevicePlaceCost = 3`
//         (`SimDefs.cs:884`).
//
// ⛔ FOUND DEFECT, "FURNITURE-SILENT-BROKE" — ⭐ **HALF OF IT IS NOW CLOSED; THE OTHER HALF STANDS.**
// AS WRITTEN (pre-D7): the wreck booted with **1** Parts against a cost of **3**.
// `PlaceDeviceCommand.Execute` charges LAST and simply `return`s when it cannot pay, and its own
// header calls a refusal "the same silent no-op every other rejection is". So every bunk, locker
// and lamp a new player placed on the shipping game did nothing, silently, forever — no toast,
// no ghost, no reason. The card previously pointed them straight at it by naming the one resource
// the top bar shows plenty of. It now names PARTS, which at least makes the scarcity legible.
//
// ⚠️ **THE AFFORDABILITY HALF IS CLOSED BY D7 (2026-08-03) AND THIS NOTE'S CENSUS IS STALE** — the
// two lanes crossed: this block was written against a `main` where the wreck held ONE Parts, and
// D7's `cabin stores` (`AuthoredShips.PeriluneWreck`, seven one-unit crates at (2..8,6,0)) landed in
// parallel. The wreck now boots with **8** Parts, and the bunk LANDS — driven on the live shipped
// host: device count +1 and `Affordable(Parts)` 8 → 5, exactly `DevicePlaceCost`. TRAPS 8's shape
// exactly (a merged file's truth is a number neither lane could compute); re-derived here on the
// merged tree, which is why the "1 Parts" figure and "does nothing forever" are struck rather than
// left to rot.
//
// ⛔ **THE VERB IS STILL MUTE, AND THAT IS THE HALF D7 DOES NOT TOUCH.** A refusal is still a silent
// no-op — so the moment the player spends past the cache (2 pieces, or ~h2 of granted Repair, which
// D7 measured), the third click is exactly as unexplained as the first one used to be. This remains
// `MECHANICS.md` §13.17's expensive-and-visible → CHEAP-AND-INVISIBLE shape, live on the standard
// surface, and it is the palette-honesty lane's subject rather than this file's.
//
// ⚠️ DISCLOSED, NOT FIXED — ARMING AN ORDER ON THE SHIP MAP BLOCKS ROOM ENTRY. `G`/`Z`/`V` are
// GLOBAL (`controls.js:262` → `Hud.armFromKey`), and `overviewClickAction` returns `{type:'order'}`
// before it ever reaches `roomAnchor` (`overview-model.js:246` vs `:249`), so after pressing `G` on
// the map a room click does not open the room. ONE ROW OF THIS CARD DISARMS ANOTHER
// ("Click a room — step inside it").
// ⚠️ AND THE SEND-BACK'S OWN DESCRIPTION OF THIS WAS HALF WRONG — it read "does nothing and says
// nothing". DRIVEN in Chrome on `--ship wreck` (`sb-m1b-gprobe`, 2026-07-29): the room does not
// open (CONFIRMED) but the surface is **NOT silent** — `#ov-toast` reads
// `DIG ARMED — ESC TO DISARM` (`overview-view.js:889` → `orderSuppressionToast`, `:934`). So this
// is a legible refusal with a stated remedy, NOT the invisible-feedback class, and it is deliberately
// left alone rather than "fixed" on that mistaken description. THAT CORRECTION IS THE POINT: a
// send-back is a claim about code too, and it gets driven like any other.
//
// EVERY CONTROL BELOW WAS DRIVEN IN REAL CHROME on `--ship wreck` before it was written down, and
// two documented keys were DELETED because driving them showed they do nothing on this surface:
//   • `WASD` — pans the console canvas, which on the standard surface measures 0×0 px. Dead.
//   • `M`   — `controls.js:255` sends `Cmd.move()` at the INSPECTION CURSOR, and the cursor is only
//             moved by canvas mousemove (dead canvas) or the arrow keys. The Overview's `[M] MOVE`
//             button is a different thing entirely (`Hud.armTool('move')`). Pressing `M` produced
//             no visible change. Left off rather than half-explained.
//
// A third row, `1–7` (atmosphere lenses), was dropped for a DIFFERENT reason and it is worth
// separating: that key WORKS (driven — the `on` class moves between `.ov-lensbtn`s). It came off
// because the Overview's lens buttons render their own numbers (`1 ∅  2 PRES  3 O₂ …`), so the row
// documented something already on screen, and the card needed the height. See below.
//
// ⚠️ THE CARD'S HEIGHT IS A CORRECTNESS PROPERTY, not taste. `.onb-card` is
// `max-height:92vh;overflow:auto`, so a card that outgrows the viewport does not break visibly — it
// quietly puts **BEGIN**, its own primary action, below the fold. The first draft of this rewrite
// did exactly that: 785px of content against 656px of card at 1280×800, BEGIN off screen. That is
// the palette-overflow defect (`client/test/palette-layout.test.js`) in a different component.
// This card is **653px, byte-for-byte the footprint of the one it replaces**, measured in Chrome at
// 1600×1000 / 1440×900 / 1280×800 by `client/tools/onboarding-shot.mjs`, which fails when BEGIN is
// out of view. Anything added here must be measured, not eyeballed.
//
// ⚠️ AND THE SEND-BACK'S CORRECTIONS COST 68px THE FIRST TIME THEY WERE WRITTEN — 721px, BEGIN
// clipped at 1280×800, exactly the defect above, caused by the pass that was fixing the copy. It was
// bought back to 653px by MEASUREMENT, not by taste, and the three cuts are worth knowing because
// each is a wrap boundary rather than a word count:
//   • the `T` row's text WRAPPED the two-column key grid, and a wrapped cell makes BOTH cells in
//     that grid row taller — 12px for four extra words. Key-row text has to fit one line (~28 chars).
//   • the BUILD body lost "wall and floor take a material". THE MATERIAL PICKER IS NOW UNMENTIONED,
//     which is a deliberate trade: the old copy's "Pick a material" was FALSE (it is wall/floor
//     only), and silence is not a lie — the picker appears on screen the moment you arm WALL.
//   • the LEDE: 251+ chars wraps to five lines, 250 fits in four. See its own note below.
//
// ✅ RESOLVED BY DELETION — M1-L, 2026-07-29. This note used to read "`＋ADD ROOM` AND THE ROOM-TYPE
// PICKER ARE STILL NOT ON THE CARD, and that is now a MEASURED decision rather than an oversight …
// If the card ever gets more height, this is the first thing to add back." There is nothing to add
// back: the owner deleted the verb (*"we do not need 'add room' that makes no sense on a ship where
// rooms are already existing"*), and the card is CORRECT about the map as a result — every
// compartment is a room you click to enter, which the card already says. The height measurement it
// records (a fifth ship-map row costs a third grid row, ~22px + gap, against a 2px budget) still
// stands and still governs the next row anyone wants to add.
//
// ⭐ AND M2-20 IS THE FIRST PACKAGE TO PAY THAT PRICE RATHER THAN DISCOVER IT. It added the WORK
// row — the FIRST ORDER, which under OD-G/OD-H is the gesture the whole opening waits on — and the
// card immediately went to 682px of content in a 656px box at 1280×800: 26px below the fold,
// exactly as the paragraph above predicts. ⇒ ONE ROW WAS REMOVED TO PAY FOR IT (`Space`, whose
// key the ship teaches in situ — see the note at its former place), and the card measures 653px
// again at all three viewports. **The rule is a ledger, not a warning: adding a ninth row means
// removing one, and the row you remove has to be the one the game already teaches elsewhere.**
//
// ⭐ THE THAW PASS (2026-08-04) PAID THAT PRICE IN WORDS RATHER THAN IN A ROW, and the arithmetic is
// recorded because it is the first time the ledger was settled that way. The MOSS row is the EIGHTH
// row, and the two key grids are 2-column, so it takes group 1 from four rows to five — from two
// grid rows to THREE. MEASURED at 1280×800 (`.onb-card` caps at `92vh` = 655px there; innerHeight is
// 713px in a 1280×800 headless window, not 800):
//     a third grid row in group 1        +29px     (`.onb-kgrid` 51 → 80px: 22px row + 7px gap)
//     the LEDE, 250 chars → 187          −21.6px   (`.onb-lede` 86 → 65px; four rendered line boxes
//                                                   → three, at 13.5px × 1.6)
//     BOTH verb bodies to three lines    −17.25px  (`.onb-verbs` 120 → 103px, at 11.5px × 1.5; the
//                                                   block is `max(ORDER, BUILD)`, so ONE of them
//                                                   shrinking buys NOTHING — which is why the BUILD
//                                                   copy moved in a package that is not about BUILD)
//     ⇒ content 653px → 643px in a 645px card. ⚠️ THE CARD IS 645px AND THE CAP IS 655px — they are
//       different numbers and an earlier draft of this table ran them together. `max-height:92vh`
//       is the CEILING (655px at innerHeight 713); the card is `height:auto` and sits 10px under it,
//       so the 2px that used to look like the whole budget was the card's own border, not headroom.
//     ⚠️ THE THREE DELTAS ARE FRACTIONAL AND THE ROUNDED ONES DO NOT SUM — read them as line boxes,
//       not as pixels: 29 − 21.6 − 17.25 = −9.85 lands on 643, while the rounded element heights
//       (+29 − 21 − 17) say 644. Every figure here is a `getBoundingClientRect` on the shipped card.
//     BEGIN in view and no scrolling at 1600×1000 / 1440×900 / 1280×800 — 643/645 at all three.
// ⚠️ EVERY WORD CUT IS A FACT THE GAME TEACHES IN SITU, which is the same test the `Space` and `1–7`
// rows were removed by: the capsule census ("of twelve capsules four are cracked … one opened —
// that person is your crew") is what the MOSS `pods` screen IS, row by row, with each capsule's own
// condition; the TITLE ("One capsule opened.") and the EYEBROW ("ONE CREW AWAKE") already say the
// player has exactly one person. Nothing that was only on this card was cut.

const SEEN_KEY = 'perilune.introSeen.v1';
let _seenThisSession = false; // fallback when localStorage is unavailable (private mode)

function hasSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return _seenThisSession; }
}
function markSeen() {
  _seenThisSession = true;
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode — session flag covers it */ }
}

/** The ORDER verbs — the player's task-definition vocabulary, and the reason this card exists.
 *  Named here rather than spelled into the prose so the guard can require every one of them to
 *  reach the rendered card, and so adding a fourth is one edit. Kept in the palette's own order
 *  (`ui/room-model.js` ROOM_TOOLS).
 *
 *  ⚠️ OPERATE WAS THE FOURTH AND IS GONE (M3-15, OD-N, 2026-07-31): doors and vents are actuated
 *  from the MOSS console now, so a card teaching a palette verb that no longer exists would be
 *  teaching a lie. ⛔ THIS IS THE ONLY EDIT M3-15 MAKES TO THE ONBOARDING, AND THAT IS DELIBERATE —
 *  OD-N also re-cuts the FIRST ORDER the game teaches (from "repair something so the lights come
 *  back" to "repair the computer"), and that rewrite belongs to M4-5. A half-rewrite here would
 *  collide with it. FILED, not fixed. */
export const ORDER_VERBS = Object.freeze(['DIG', 'STOCKPILE', 'STRIP']);

/**
 * The two headline verbs, in the order the card teaches them.
 *
 * ⚠️ ORDER IS LOAD-BEARING AND IS PINNED: `VERBS[0]` is what a new player reads first, and TALK
 * being there is the exact defect this rewrite removes. The guard asserts no verb HEAD mentions
 * TALK at all, which is stricter than "not first" and is deliberate — a second headline TALK block
 * is the same mistake sitting one column to the right.
 */
// ⚠️ THE HEADING GLYPHS ARE `◈` AND `▣` — the card's own two, kept deliberately. The palette's
// `⛏`/`⚒`/`⇄` are NOT in Space Mono and fall back to a different face at a different weight; `⛏`
// photographed as a small angular mark that does not read as a pickaxe at 12px. Checked in Chrome,
// not assumed.
export const VERBS = Object.freeze([
  {
    head: '◈ ORDER',
    // ⭐ THE SECOND SENTENCE IS OD-H MADE VISIBLE (2026-08-04) — and it is a FACT, not an apology.
    // Every work type boots OFF for every crew member (owner batch 2026-07-29, OD-H: *work is
    // opt-in*), so an order can be legal, reachable and affordable and still never start. CRAFT is
    // named because it is the one the OPENING ARC dead-ends on: commissioning the console costs a
    // `ControllerModule`, which is a MachineShop recipe (`sim/Sim.Core/Defs/SimDefs.cs:1007`) and
    // therefore `WorkType.Craft` (`Entities/Citizen.cs:609`) — and `ui/overview-model.js:353` says
    // the WORK tab is "the ONLY surface anywhere that can switch one on". A player who never finds
    // that cell watches a correct order sit there forever.
    // ⚠️ "Step into a room" CAME OFF to keep this block at three lines (see the header's ledger):
    // the `Click` row two inches below says "a room — step inside it", so the card was saying it
    // twice, and a duplicated sentence is the cheapest 17px on this surface.
    body: 'Take <b>DIG</b>, <b>STOCKPILE</b> or <b>STRIP</b>, drag the tiles. Work types boot ' +
      'OFF — switch <b>CRAFT</b> on in WORK.',
  },
  {
    // ⚠️ TRIMMED BY A PACKAGE THAT IS NOT ABOUT BUILD, and that is the grid's doing rather than a
    // second opinion about this copy: `.onb-verbs` stretches both boxes to `max(ORDER, BUILD)`, so
    // ORDER dropping to three lines buys nothing unless BUILD does too. EVERY FACT SURVIVED — both
    // currencies, the sweep, the single click — only ", other end" and one "spends" came off. The
    // send-back's three corrections are all still here (see the module header).
    head: '▣ BUILD',
    body: 'Same palette. <b>WALL</b>, <b>FLOOR</b>, <b>DOOR</b> sweep a run and spend ' +
      '<b>REGOLITH</b>; furniture is one click, <b>PARTS</b>.',
  },
]);

/**
 * The controls, grouped by the surface they work on — because they are NOT interchangeable and the
 * old flat list is what let a Room-Zoom-only key masquerade as a global one.
 *
 * `bind` is the machine-checkable half: a LIST of `{ file, cond, call }`, each saying "the branch
 * whose condition contains `cond` runs `call`, in `client/src/<file>`".
 * `client/test/onboarding.test.js` joins every one of them to the real, comment-stripped branch.
 * A list, because a row legitimately documents several keys at once (`G / Z / V` is three different
 * calls) and one shared `call` field would have quietly checked only the first.
 *
 * A row may instead carry `bind: null` — but then it MUST carry `why`, and the guard requires it:
 * an unexplained `null` is how a future row silences this join without anyone noticing.
 */
const CTL = 'input/controls.js';
const RZ = 'ui/roomzoom-view.js';
const OV = 'ui/overview-view.js';

export const CONTROL_GROUPS = Object.freeze([
  {
    title: 'CONTROLS · THE SHIP MAP',
    rows: [
      // ⭐ THE FIRST ORDER, AND IT IS THE FIRST ROW BECAUSE IT IS THE FIRST MOVE (M2-20 / OD-G).
      // Under OD-H every work type boots OFF for every crew member, so at boot your crew member is
      // doing nothing and will keep doing nothing until you say she may work — her CREW WATCH row
      // reads "Awaiting orders" the whole time (`GameSession.AwaitingOrdersLabel`).
      // A first screen that does not name this gesture leaves a new player watching a pawn wander
      // and concluding the game is broken; that is the report OD-G came from.
      // ⚠️ WHAT COUNTS AS "THE FIRST ORDER" IS OWNER BATCH ITEM 10, decided by default on
      // 2026-07-29: ANY player command that results in her taking a job, INCLUDING a WORK-tab
      // toggle. If the owner overturns it to "a targeted order only", this row teaches STRIP or
      // Prioritise instead — the row moves, the card's shape does not.
      // ⚠️ TWO BINDS, NOT ONE: opening the tab and setting a cell are different branches of
      // `onHudClick`, and a row that joined only the first would document a tab with no gesture
      // inside it — the `B`-row shape at one remove.
      // ⚠️ 21 CHARACTERS. Key-row text has to fit ONE line (~28 at this grid width): a wrapped cell
      // makes BOTH cells in its grid row taller, which is 12px for four extra words and the card's
      // height is a correctness property (see the module header). "then click a cell" is left off
      // deliberately — the tab prints that instruction itself (`ov-workhint`, overview-view.js).
      { key: 'WORK', text: 'tab — put her to work', bind: [
        { file: OV, cond: 'd.ovTab != null', call: 'Hud.selectTab' },
        { file: OV, cond: 'd.ovWorkCid != null', call: 'onWorkCellClick' }] },
      { key: 'Click', text: 'a room — step inside it',
        bind: null, why: 'a pointer gesture on .pl-room, not a key (ui/overview-view.js onScenePointerUp)' },
      { key: 'R / F', text: 'up / down a deck', bind: [
        { file: CTL, cond: "k === 'r'", call: 'Cmd.deck' },
        { file: CTL, cond: "k === 'f'", call: 'Cmd.deck' }] },
      // ⛔ THE `Space` ROW WAS REMOVED HERE TO PAY FOR THE `WORK` ROW ABOVE, AND THE ARITHMETIC IS
      // WHY IT HAD TO BE PAID RATHER THAN ABSORBED. The two key grids are 2-column, so the card's
      // cost is ceil(n1/2) + ceil(n2/2) grid rows: EIGHT rows cost four, NINE cost five — in any
      // 5/4 or 4/5 split. There is no arrangement of nine rows that is free.
      // MEASURED IN CHROME AT 1280×800 (`client/tools/onboarding-shot.mjs`, 2026-07-30):
      //     eight rows (before)          content 653px in a 655px card   — the 2px budget, exactly
      //     nine rows (WORK added)       content 682px in a 656px card   — 26px BELOW THE FOLD
      //     eight rows (Space removed)   content 653px in a 655px card   — the budget, restored
      // …and 653px at 1600×1000 and 1440×900 too, i.e. byte-for-byte the footprint M1-B measured.
      // ⇒ `Space` is the row the SHIP ITSELF teaches, on screen, at the moment it matters — and that
      // was CHECKED rather than assumed, which this file demands of every sentence on it. Arming a
      // tool while the ship is held raises `#ov-nudge`, whose own label is
      //     "‖ HOLD — CLICK OR PRESS SPACE TO RUN THE SHIP"   (ui/overview-view.js:272)
      // …so the key is written out in the game, next to a click that does the same thing. (The
      // controller is `makeNudge` in `ui/paused-nudge.js`, pinned by console-carryover.test.js
      // group A.) That is the same argument that took the `1–7` lens row off this card — a row
      // documenting something already on screen — and it is the cheapest 26px available.
      // ⚠️ THE KEY STILL WORKS and is still driven by the shot tool; only the ROW is gone.
      // ⚠️ THE TEXT NAMES **CREW WATCH** BECAUSE THIS ROW IS THE ONLY ONE WITH A PREREQUISITE THE
      // CARD OTHERWISE NEVER TEACHES. `talkSelectedCrew` is a no-op with nobody selected, and the
      // only way to select on this surface is clicking a CREW WATCH row (driven — the rig's own
      // `[T]` leg has to click one first or the panel never opens). "the selected crew" quietly
      // assumed a verb the player had not been given.
      { key: 'T', text: 'talk to a name in CREW WATCH', bind: [
        { file: CTL, cond: "k === 't'", call: 'talkSelected' }] },
      // ⭐ THE MOSS ROW — the door the whole thaw arc is behind, and the card had no word for it
      // (2026-08-04). The tab has existed since the console retirement (`OV_TABS` in
      // `ui/overview-view.js` spells it `MOSS`, and this row uses THAT spelling, not a prettier
      // one), but a first screen that lists WORK, Click, R/F and T and stops was telling a new
      // player that the ship's computer is not part of the game.
      // ⚠️ THE TEXT HANDS OVER A VERB, NOT A CHAIN. `type HELP` is the whole instruction because
      // MOSS's own `help` is the rest of the lesson — `HELP_LINES` in `ui/moss-model.js` lists
      // COMMISSION, PODS and THAW with a line each. DRIVEN: `help` is routed by `parseCommand` to
      // `kind:'nav'` and `navCommand`'s `help` arm returns those lines with NO `m.linked` check, so
      // it answers on a dead console — which is exactly the console a new player meets.
      // ⚠️ 25 CHARACTERS, for the same reason the WORK row is 21: a wrapped cell makes BOTH cells in
      // its grid row taller.
      { key: 'MOSS', text: 'tab — a prompt; type HELP', bind: [
        { file: OV, cond: 'd.ovTab != null', call: 'Hud.selectTab' }] },
    ],
  },
  {
    title: 'CONTROLS · INSIDE A ROOM',
    rows: [
      { key: 'G / Z / V', text: 'dig · stockpile · strip', bind: [
        { file: RZ, cond: "k === 'g'", call: "arm('dig')" },
        { file: RZ, cond: "k === 'z'", call: "arm('stockpile')" },
        { file: RZ, cond: "k === 'v'", call: "arm('strip')" }] },
      { key: 'B / X', text: 'build a wall · demolish', bind: [
        { file: RZ, cond: "k === 'b'", call: "arm('wall')" },
        { file: RZ, cond: "k === 'x'", call: "arm('demolish')" }] },
      { key: 'Esc', text: 'put the tool down, then leave',
        bind: null, why: 'an Esc STACK (escStackRung: disarm, then exit) — a rung, not one call' },
    ],
  },
]);

export const EYEBROW = 'MSV PERILUNE · BOARDED AND STRIPPED · ONE CREW AWAKE';
export const TITLE = 'One capsule opened.';
/**
 * ⚠️ EVERY CLAUSE HERE IS CHECKED, AND THE AIR CLAUSE IS THE ONE THAT SHIPPED FALSE.
 * "Beyond the bay the ship is airless" was the CHARTER's premise, not the ship's: `--ship wreck`
 * authors THREE pressurised anchors (cryo bay, `wreck_spine_0`, reactor — `AuthoredShips.cs:1894`,
 * asserted by `WreckShipTests.ExactlyThreeSpacesBootBreathable_AndTheRestIsVacuum`), and the boot
 * census prints `deck 0: 9 anchored spaces, 3 breathable`. Joined to the C# in `onboarding.test.js`.
 *
 * ⭐ AND THE VERB IS HERE NOW (2026-08-04). "Seven sleep on" was a FACT with nothing to do about it
 * for as long as this card has existed — the module header's discharged note is the receipt. It now
 * carries the ask and the place to ask it, in the premise's own words, and stops there: the card
 * does not spell repair → commission → pods → thaw, because the MOSS row hands over `HELP` and
 * `HELP` spells it. ⚠️ SEVEN IS A COUNT OF REAL ROWS, not a round number: `WreckPods`
 * (`sim/Sim.Gen/AuthoredShips.cs:1925`) is twelve capsules, one `Open`, four `Dead` ⇒ seven asleep.
 * Joined to that table in `onboarding.test.js`, because a census in prose goes stale silently.
 *
 * ⚠️ IT IS 187 CHARACTERS BECAUSE OF THE HEIGHT BUDGET, NOT BECAUSE OF TASTE — and it USED to be
 * 250 for the same reason. Measured in Chrome at 1280×800: 251+ chars wraps to FIVE lines, 250 fits
 * in FOUR (86px), and 187 fits in THREE (65px). That fourth line is 21.6px of the 29px the MOSS row
 * costs (the header's ledger has the rest), so the capsule census was spent on it — the thing the
 * MOSS `pods` screen already is, capsule by capsule. Char count is a proxy and the WRAP is the
 * truth: 191 chars also measured FOUR lines, so if you add a word here, re-run
 * `client/tools/onboarding-shot.mjs` at 1280×800 before you commit it.
 */
export const LEDE =
  'Raiders took this ship; everyone awake is dead or gone. Seven sleep on, and MOSS thaws them ' +
  'one at a time. The bay, spine and reactor hold air; the rest is vacuum, and nobody works there.';

/** The card's markup. Exported because the guards assert on the RENDERED STRING: a claim sitting in
 *  a comment cannot reach it, which is `CLAUDE.md` trap 1 removed rather than hardened against. */
export function overlayHtml() {
  const verbs = VERBS.map((v) =>
    '<div class="onb-verb"><div class="onb-verb-h">' + v.head + '</div>' +
      '<div class="onb-verb-b">' + v.body + '</div></div>').join('');
  // ⚠️ ONE `.onb-controls` WRAPPER FOR BOTH GROUPS, not one each. `.onb-controls` carries
  // `margin-top:20px` + a border + `padding-top:16px` — ~37px of chrome — and paying that twice
  // pushed BEGIN below the fold at 1280×800 (measured; see the module header). The second group's
  // heading gets its own top margin inline rather than a new class: this is a height fix, not a new
  // layout, and `styles.css` is shared with other lanes.
  const groups = '<div class="onb-controls">' + CONTROL_GROUPS.map((g, i) => {
    const rows = g.rows.map((r) =>
      '<div class="onb-krow"><kbd class="onb-key">' + r.key + '</kbd><span>' + r.text + '</span></div>').join('');
    return '<div class="onb-controls-h"' + (i ? ' style="margin-top:11px"' : '') + '>' + g.title + '</div>' +
      '<div class="onb-kgrid">' + rows + '</div>';
  }).join('') + '</div>';
  return '' +
    '<div class="onb-card" role="dialog" aria-modal="true" aria-label="Welcome to Perilune">' +
      '<div class="onb-eyebrow">' + EYEBROW + '</div>' +
      '<h1 class="onb-title">' + TITLE + '</h1>' +
      '<p class="onb-lede">' + LEDE + '</p>' +
      '<div class="onb-verbs">' + verbs + '</div>' +
      groups +
      '<button class="onb-begin" data-onb-begin>BEGIN</button>' +
      '<div class="onb-foot">Press <kbd class="onb-key">?</kbd> any time to reopen this.</div>' +
    '</div>';
}

/** Mount the onboarding layer: shows the intro once, installs a persistent `?` reopener + hotkey. */
export function initOnboarding() {
  if (typeof document === 'undefined') return;
  const layer = document.createElement('div');
  layer.id = 'onboarding';
  layer.className = 'onb-layer';
  layer.hidden = true;
  document.body.appendChild(layer);

  const help = document.createElement('button');
  help.className = 'onb-help';
  help.type = 'button';
  help.title = 'Help & controls (?)';
  help.textContent = '?';
  document.body.appendChild(help);

  const open = () => { layer.innerHTML = overlayHtml(); layer.hidden = false; };
  const close = () => { layer.hidden = true; layer.innerHTML = ''; markSeen(); };

  layer.addEventListener('click', (e) => {
    const t = e.target;
    if (t === layer) { close(); return; }               // click the backdrop → dismiss
    if (t && t.closest && t.closest('[data-onb-begin]')) close();
  });
  help.addEventListener('click', open);
  // `?` reopens; Escape closes — but only ours, and only when open (never steal the ship's Esc).
  window.addEventListener('keydown', (e) => {
    const typing = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName || '');
    if (!layer.hidden && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (!typing && e.key === '?') { e.preventDefault(); layer.hidden ? open() : close(); }
  }, true); // capture: our Escape close beats the game's Esc stack while the card is up

  if (!hasSeen()) open();
}
