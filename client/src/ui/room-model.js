// ROOM-ZOOM view-model — PURE. Every derivation the Level-2 Room Zoom controller
// (client/src/ui/roomzoom-view.js) needs that is more than a straight DOM write lives here,
// node-tested, with no DOM and no wire access: the focused-room tile-rect lookup, the fit
// transform + click→tile hit-testing (the responsive generalisation of the mock's fixed 1488/32
// math), the channel clamps (cells → items, crew, designs, decor) to the room rect, the palette
// tool → command class map, the demolish classifier + its precedence, the armed-tool reducer, and
// the ESC rung. Authority: docs/design/perilune-roomzoom.{visual,interaction}-spec.md (VS-Z / IX-Z).
//
// InvariantCulture-safe throughout (round + ASCII string concat only; no locale APIs). Nothing here
// is hashed, touches the sim, or mutates its arguments.

// The ONE glyph → itemId derivation, straight out of the `ITEMS` registry and SHARED verbatim with
// the Level-1 Overview, so the two SVG surfaces cannot come to skin the same glyph differently.
// (It used to be `SPRITE_FOR_GLYPH` from `../render/glyphs.js` plus a local hand mirror — see below.)
import { itemIdForGlyphChar } from '../items/glyph-map.js';
// The registry itself, for the two questions a glyph char cannot answer: is this piece a RESOURCE
// (a pile, drawn by the item layer and never demolishable), and which piece skins a given sim
// `ItemKind` NAME. Derived from `ITEMS`, never transcribed.
// (`isDeviceItem` is deliberately NOT imported — see `demolishTarget`, which must not ask it.)
import { RESOURCE_ITEM_BY_KIND_NAME, isResourceItem, buildItem } from '../items/index.js';
// ⚠️ `markForFg` is GONE (the `marks` channel): the kind arrives on the wire, decoded once by
// `roomzoom-view.js` and handed to `roomMarkTiles`. The vocabulary itself is unchanged.
import { markVariant, markCellSvg } from './mark-overlay.js';
import { dragModeForTool } from './build-drag-model.js';
// The client's ONE mirror of the sim's `ItemKind` enum (pinned against ItemStack.cs by
// stock-filter-model.test.js). Imported for its labels rather than re-declared — a second table here
// would be a hand mirror of a hand mirror, which is the defect `items/glyph-map.js` removed.
import { STOCK_KINDS } from './stock-filter-model.js';
// The ONE reason→sentence table, beside the reason codes it belongs to. Imported rather than
// re-written here: a second copy of the wording is a second thing to update when a reason is added,
// and a surface that says something different from the decoder about the same code is the two-source
// defect the `blocked` channel itself exists to argue against.
// ⭐ M3-13 — `blockedReasonSentence`, NOT `BLOCKED_REASON_TEXT`: a row can carry a `detail` that
// changes the sentence (`no_consumable` names the item), and the table alone cannot see it.
import { blockedReasonSentence, SPEND_UNKNOWN } from '../wire/messages.js';
// VR-P3 — THE CABINET-OBLIQUE KIT. The Level-2 surface is a perspective CUTAWAY now, and every
// number in it comes through this module: one projection, shared with the fittings (P2), the plate
// miniatures (P4) and the catalogue. Two derivations of one projection is exactly how the Overview
// and the Room Zoom came to skin the same glyph two different ways (`oblique.js`'s own header).
import {
  PX_PER_CM, roomFrame, room as obliqueRoom, fhDef, fhRef, haloText, haloRuns, monoTextWidth, poly,
  INK as OB_INK, PAPER as OB_PAPER, ATTEND as OB_ATTEND, n as obN,
} from '../render/oblique.js';

/* eslint-disable no-multi-spaces */

/** The logical tile unit (VS-Z-15): one grid cell = one tile = 32 logical units.
 *
 *  ⚠️ SINCE VR-P3 IT IS NO LONGER THE SURFACE'S DRAWING UNIT — it is the unit the tile-scoped
 *  LAYER BUILDERS (`markCellSvg`, `blockedCellSvg`, `itemStackSvg`) still draw one cell in, which is
 *  then MAPPED onto that tile's projected floor parallelogram (or stood upright on it) by the
 *  `scenePlacement` object. Keeping the builders in a square unit cell is what lets `mark-overlay.js`
 *  stay SHARED with the Level-1 Overview, whose tiles really are axis-aligned boxes. */
export const U = 32;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Palette (VS-Z-46 / IX-Z-14). The seventeen tools in visual order; each maps to exactly one command
// class + wire verb (IX-Z-15). `deviceKind` is the sim DeviceKind name for functional furniture
// (Device.cs); `itemId` is the item-set piece for cosmetic decor.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The palette tools, in the visual order the bar renders them (VS-Z-46). WALL + FLOOR carry a
 *  material picker and drag-build; DOOR is a single structural placement; DIG, STOCKPILE and STRIP
 *  are the three ORDER verbs (WP-4 brought dig/strip; stockpile came down from the Overview when
 *  the altitude rule was corrected — `overview-model.js`'s header holds the argument), kept in the
 *  console's own `ORDER_KINDS` order and grouped at the destructive end beside DEMOLISH.
 *
 *  ERASE sits IMMEDIATELY AFTER the three verbs it undoes and deliberately NOT beside DEMOLISH: the
 *  two are the most confusable pair on this bar (DEMOLISH takes a THING off the floor, ERASE takes
 *  an ORDER off a tile), and putting them adjacent would make a mis-click cost a building.
 *
 *  MOVE sits IMMEDIATELY BEFORE DEMOLISH, which keeps the bar's existing grouping intact: everything
 *  before DIG builds something, DIG…ERASE are orders on tiles, and MOVE acts on a thing ALREADY THERE
 *  (a person) with one click and no sweep. DEMOLISH stays last, at the destructive end, for the same
 *  mis-click reason ERASE is kept away from it.
 *
 *  ⛔ ⭐ OPERATE STOOD BETWEEN ERASE AND MOVE UNTIL M3-15 (OD-N, 2026-07-31) DELETED IT. Doors and
 *  vents are actuated through the MOSS console now and through nothing else, so OPERATE's slot is
 *  gone. The paragraph above used to describe OPERATE + MOVE as a PAIR; only MOVE is left.
 *  (That sentence read "the bar is 17 tools, not 18" until M3-10 added HEATER and made 18 the
 *  right answer for a different reason. The COUNT lives in `room-model.test.js`, which is a pin;
 *  a number in prose beside a pin is how a doc goes stale, so it is not restated here.)
 *
 *  ⚠️ MOVE IS THE FIRST PAWN-DIRECTED TOOL ON THIS PALETTE and that is a real widening of the bar's
 *  vocabulary — see the `move` row in PALETTE_CMD for the argument and for what RimWorld does
 *  instead.
 *
 *  ⭐ HEATER (M3-10) sits at the END of the functional run, after PLANT and before the ORDER block.
 *  It is the first tool on this bar that is neither decor nor a designation but a piece of SHIP
 *  PLANT the player installs, and it is here for the reason the package exists: a heater the player
 *  cannot place is a def row. Its position keeps the build/place run contiguous — inserting it
 *  anywhere earlier would move every hotkey after it.
 *
 *  ⭐⭐ GROWBED / MEDBED / TABLE (2026-08-04) — THE THREE VERBS THE SIM ALREADY HAD AND THE PLAYER
 *  DID NOT. They are appended for HEATER's exact reason, one step further along: `TryFurnitureKind`
 *  has switched on `"growbed"`, `"medbed"` and `"table"` since the Room Zoom's palette was first
 *  wired (`hosts/web/GameSession.cs`, the three cases immediately ABOVE heater's), and
 *  `PlaceDeviceCommand.IsPlaceableFurniture` has whitelisted `GrowBed`/`MedBed`/`Table` for as long
 *  as it has whitelisted `Bed` — so the sim would accept all three from the first tick and NO
 *  SURFACE COULD ASK. The host's own comment beside those cases named the gap out loud ("wire-
 *  reachable but have no palette button… a verb only the wire can reach is a verb the player does
 *  not have"). All three also have real art already in the registry (`hydroponics` / `med-bed` /
 *  `dining-table`, `client/src/items/index.js`), so the placed device draws itself.
 *
 *  ⚠️ THEY GO AFTER HEATER, AT THE END OF THE FUNCTIONAL RUN, for the reason HEATER's paragraph
 *  gives and for one more: every tool before them keeps its index, so no existing chip moves under
 *  a player's muscle memory and no hotkey shifts. They carry NO hotkey of their own — neither does
 *  HEATER, and inventing three letters for three new tools is a keymap decision, not a palette one.
 *
 *  ⛔ THIS IS THE BAR'S LARGEST SINGLE WIDENING (18 → 21) AND THE PALETTE WRAPS, so it is a LAYOUT
 *  change as much as a vocabulary one. Measured, not assumed, by `client/tools/palette-shot.mjs` at
 *  six widths before and after — see the package report; the row count grows and nothing clips,
 *  which is exactly what `flex-wrap:wrap` + the un-capped wrapper were fixed to guarantee. */
export const ROOM_TOOLS = Object.freeze([
  'wall', 'floor', 'door', 'bunk', 'desk', 'chair', 'locker', 'shelf', 'lamp', 'rug', 'plant',
  'heater', 'growbed', 'medbed', 'table',
  'dig', 'stockpile', 'strip', 'erase', 'move', 'demolish',
]);

/** Tool → uppercase palette label (⌫ prefix on demolish, VS-Z-46). The ▦ is the same glyph the
 *  Overview's bar used and the console's hint uses, so the verb reads identically wherever it is
 *  named; the hotkey is NOT in the label here (the palette states hotkeys in its hint line). */
export const TOOL_LABEL = Object.freeze({
  wall: 'WALL', floor: 'FLOOR', door: 'DOOR', bunk: 'BUNK', desk: 'DESK', chair: 'CHAIR',
  locker: 'LOCKER', shelf: 'SHELF', lamp: 'LAMP', rug: 'RUG', plant: 'PLANT', heater: 'HEATER',
  growbed: 'GROWBED', medbed: 'MEDBED', table: 'TABLE',
  dig: '⛏ DIG', stockpile: '▦ STOCKPILE', strip: '⚒ STRIP', erase: '↺ ERASE',
  move: '➤ MOVE', demolish: '⌫ DEMOLISH',
});

// ⛔ `GHOST_ABBR` IS DELETED (VR-P3 review). It was VS-Z-31's two-letter ghost badge — `WA`, `FL`,
// `DO` stamped inside a queued order's box — and the cutaway's ghost says the whole word plus its
// PRICE on an oxblood leader (`roomzoom-view.js ghostSvg`: `WALL · 3 PARTS`, off the wire). The
// table had no importer anywhere in `client/` at the moment VR-P3 landed, and an exported constant
// that nothing reads is the next reader's invitation to draw the old badge back.

const PALETTE_CMD = Object.freeze({
  wall:  { cls: 'structural', verb: 'build',  kind: 'wall' },
  floor: { cls: 'structural', verb: 'build',  kind: 'floor' },
  door:  { cls: 'structural', verb: 'build',  kind: 'door' },
  bunk:  { cls: 'functional', verb: 'place',  kind: 'bunk',   deviceKind: 'Bed' },
  desk:  { cls: 'functional', verb: 'place',  kind: 'desk',   deviceKind: 'Desk' },
  chair: { cls: 'functional', verb: 'place',  kind: 'chair',  deviceKind: 'Chair' },
  locker:{ cls: 'functional', verb: 'place',  kind: 'locker', deviceKind: 'Locker' },
  plant: { cls: 'functional', verb: 'place',  kind: 'plant',  deviceKind: 'PlantPot' },
  lamp:  { cls: 'functional', verb: 'place',  kind: 'lamp',   deviceKind: 'Light' },
  // M3-10. `kind: 'heater'` is the wire string `GameSession.TryFurnitureKind` switches on, and
  // `deviceKind: 'Heater'` is the sim enum member the ghost/erase paths name; the two are different
  // vocabularies on purpose and every row here carries both.
  heater:{ cls: 'functional', verb: 'place',  kind: 'heater', deviceKind: 'Heater' },
  // ⭐⭐ 2026-08-04 — the three the sim accepted and the palette never offered. Same TWO vocabularies
  // as every row above: `kind` is the WIRE string `GameSession.TryFurnitureKind` switches on (its
  // `case "growbed"` / `"medbed"` / `"table"`, verified against that switch by
  // `prioritise-menu.test.js`'s derivation rather than transcribed here), and `deviceKind` is the sim
  // enum member (`DeviceKind.GrowBed`/`MedBed`/`Table`, all three on
  // `PlaceDeviceCommand.IsPlaceableFurniture`'s whitelist since it was written). `cls: 'functional'`
  // is what earns them the whole palette-honesty affordance set for free — `build-cost-model.js`
  // asks the CLASS, never a list of tool names, so the `3 PARTS` chip line, the `.cant` state, the
  // armed cost row and the refusal toast all arrive with the row and none of them needed a table
  // entry. (That is the design; it is pinned by a driven leg rather than assumed.)
  growbed:{ cls: 'functional', verb: 'place', kind: 'growbed', deviceKind: 'GrowBed' },
  medbed:{ cls: 'functional', verb: 'place',  kind: 'medbed', deviceKind: 'MedBed' },
  table: { cls: 'functional', verb: 'place',  kind: 'table',  deviceKind: 'Table' },
  rug:   { cls: 'cosmetic',   verb: 'decor',  itemId: 'rug' },
  // — lane/paper-machines — `itemId` was `'bookshelf'` (the warm row) until 2026-08-05; it is the
  // paper `book-case` now. ⛔ THE TOOL PLACES NOTHING, AND THE FIRST DRAFT OF THIS COMMENT SAID IT
  // DID. `roomzoom-view.js`'s `cls === 'cosmetic'` branch toasts `decorRefusalText(_armed)` and stops
  // — SHELF and RUG stopped writing decor on 2026-08-04, on purpose, because the piece vanished on
  // reload and no other surface could see it. `addDecor` survives in this module with no caller in
  // `client/src`, and the host's `decor` channel is a static empty list (`GameSession.cs:2800-2801`).
  // So this row is a FORWARD-LOOKING rewire: if the decor path ever returns, the tool draws the paper
  // piece rather than the warm one. Nothing about the tool, the verb, the class or what a click does
  // moved. ⚠️ It also does not answer M4-6 ("wire it or remove it"), which is the owner's, and open.
  shelf: { cls: 'cosmetic',   verb: 'decor',  itemId: 'book-case' },
  // ORDER class (console-retirement WP-4) — a DESIGNATION, not a build. It consumes no material and
  // changes no geometry: it marks a tile as intent and the sim's job board picks it up. `verb` is the
  // wire verb NAME (`dig`/`stockpile`/`strip`), which is what makes it emphatically NOT a build:
  // routing an order through `Cmd.build` would hand it to `BuildSystem`, which knows nothing about
  // designations (`client/src/input/controls.js:52-58` spells this out for the console's own
  // lowering).
  //
  // ⚠️ STOCKPILE IS THE ONE ORDER THAT LOWERS TO **TWO** WIRE COMMANDS — `Cmd.stockpile` then
  // `Cmd.filter`, always both, always that order. Its `cls` is what routes it through the sweep, and
  // `roomzoom-view.js`'s `orderPayloads` is what knows about the pair; this table deliberately does
  // not, so that "which class sweeps" and "what does one tile emit" stay separable.
  dig:   { cls: 'order',      verb: 'dig' },
  stockpile: { cls: 'order',  verb: 'stockpile' },
  strip: { cls: 'order',      verb: 'strip' },
  // ⛔ THE `operate` ROW IS DELETED (M3-15, OD-N). It was its own class — not `order`, not swept,
  // the only tool whose target was a specific DEVICE rather than a tile — and all three of those
  // facts are now facts about the MOSS console instead.
  // ERASE class — the un-designate verb (M1-C). Its OWN class, and emphatically NOT `order`:
  //   IT IS NOT A DESIGNATION AND IT CARRIES NO VERB OF ITS OWN. Every `order` row names the ONE
  //   wire verb its tile emits; erase names none, because which verb it sends is a property of THE
  //   TILE (`eraseTarget` below), not of the tool. Routing it through `orderPayloads` — whose whole
  //   contract is "stay byte-identical to `paletteOrders`" — would either break that contract or
  //   require `paletteOrders` to grow a branch the console can never reach.
  // It IS swept and it IS tile-scoped, so `isSweepTool` and `roomDragMode` both name it explicitly
  // rather than inferring it from the class, and both are pinned.
  erase: { cls: 'erase',      verb: null },
  // MOVE class — the "go here" order for the SELECTED crew member (M1-K). Its own class, and the
  // FIRST tool on this palette whose SUBJECT is a person rather than a tile.
  //
  // ⚠️ THE DISTINCTION THAT DECIDES ITS CLASS: every other row here is a function of the TILE alone
  // — click a tile, the tile changes (or an order lands on it). This one is a function of the tile
  // AND of a selection that lives on the HOST (`GameSession._selected`, set only by `ContextAction`).
  // With nothing selected the host answers `"no crew selected"` and does nothing, so the client must
  // ask before it sends; no other class has a precondition outside the room at all. That is why it
  // is not `order` (it paints no designation and reaches no job board), not the deleted `operate` (that verb
  // targets a device standing on the tile and refuses an empty one — MOVE wants an EMPTY tile), and
  // emphatically not swept: `isSweepTool` is `structural || order || erase`, and a drag would emit
  // one move order per tile in the rectangle, of which only the last could possibly survive.
  //
  // ⚠️ RIMWORLD DOES THIS WITH A RIGHT-CLICK, NOT A TOOL, and this is a deliberate divergence rather
  // than an oversight. In RimWorld you select a pawn and right-click a destination to get "Go here".
  // Two reasons that gesture is not taken here, in order of weight:
  //   1. RIGHT-CLICK ON THIS SURFACE IS SPOKEN FOR. M2-10 ("Prioritise: repair X" by right-click on
  //      the standard surface) is a separate, later package and the right-button seam is the one it
  //      needs. Squatting on it now would either force that package to unpick this one or produce
  //      two right-click meanings on one canvas.
  //   2. THE CLIENT ALREADY HAS AN IDIOM FOR THIS EXACT ORDER. The Level-1 Overview arms a MOVE tool
  //      (`overview-view.js`'s `ovMove` → `Hud.armTool('move')`) and lowers the click to
  //      `Cmd.cursor` + `Cmd.move` — the same two messages this tool sends. Mirroring the sibling
  //      surface costs the player no new concept; inventing a second gesture for one order would.
  // ⇒ FLAGGED FOR `docs/design/rimworld-reference.md`: if that reference lands and says the
  //   right-click IS the thing to mirror, this row is where the disagreement is, and the fix is to
  //   ADD the right-click alongside — not to move the tool — because M2-10 must arrive first.
  //
  // `verb` is the wire verb NAME, as every other row's is; the PAIR it lowers to (`Cmd.cursor` then
  // `Cmd.move`) lives in `roomzoom-view.js`'s `doMove`, for the same separation `stockpile` uses.
  move: { cls: 'move',        verb: 'move' },
  demolish: { cls: 'demolish', verb: null },
});

/**
 * Classify a palette tool into its command class + wire verb (IX-Z-15). Unknown → 'none'. PURE.
 * @param {string|null} tool
 * @returns {{cls:'structural'|'functional'|'cosmetic'|'order'|'erase'|'move'|'demolish'|'none', verb:string|null, kind?:string, deviceKind?:string, itemId?:string}}
 */
export function paletteCommand(tool) {
  const c = tool && PALETTE_CMD[tool];
  return c ? { ...c } : { cls: 'none', verb: null };
}

/** True for the drag-build structural tools (wall / floor / door). Wall + floor also carry a
 *  material picker; door is single-tile. PURE. */
export function isStructuralTool(tool) {
  return paletteCommand(tool).cls === 'structural';
}

/** True for the ORDER tools (dig / stockpile / strip) — designations, never builds. PURE. */
export function isOrderTool(tool) {
  return paletteCommand(tool).cls === 'order';
}

/** True for the ERASE tool — the un-designate verb (M1-C). PURE. */
export function isEraseTool(tool) {
  return paletteCommand(tool).cls === 'erase';
}

/**
 * True for every tool committed by the press-drag-release SWEEP gesture rather than by a plain
 * click: the structural trio plus the three order verbs. This is the sibling set the Room Zoom's
 * `onCanvasDown`/`onCanvasUp` gate on, and it is a FUNCTION rather than a literal list precisely so
 * that adding a tool to `PALETTE_CMD` with a swept class cannot leave one of the three gesture sites
 * behind — that drift is what `paletteOrders` was extracted to prevent on the console. PURE.
 */
export function isSweepTool(tool) {
  return isStructuralTool(tool) || isOrderTool(tool) || isEraseTool(tool);
}

/**
 * The drag mode a Room-Zoom tool sweeps with (build-drag-model.js vocabulary). ORDER tools sweep a
 * FILLED rectangle — a dig or a strip is a region of intent (RimWorld's mine/deconstruct gesture),
 * not an outline; the wall tool's `perimeter` would leave the middle of a swept wreck untouched,
 * which is the opposite of what a player dragging across rubble asks for. Every other tool defers to
 * `dragModeForTool` unchanged. The sim re-validates every tile and silently no-ops an illegal one
 * (`Cmd.dig`'s contract, `client/src/wire/session.js:67-77`), so a fill that crosses clean floor
 * costs nothing.
 *
 * FOR STOCKPILE `fill` IS NOT A PREFERENCE, IT IS THE MECHANIC. `JobWork.IsFreeStockpileTile` asks
 * "Stockpile + Walkable + empty" — ONE STACK PER TILE — so the swept AREA is the zone's capacity:
 * a 5×8 drag is 40 stacks. A `perimeter` sweep would silently deliver a hollow zone of 22, and a
 * `single` sweep would make the verb's only real parameter a matter of clicking forty times. PURE.
 */
export function roomDragMode(tool) {
  return (isOrderTool(tool) || isEraseTool(tool)) ? 'fill' : dragModeForTool(tool);
}

/**
 * The armed-tool reducer (IX-Z-14/16): a single mutually-exclusive slot. Clicking a tool arms it;
 * clicking the armed tool again disarms (toggle to null); any other tool replaces. Disconnect /
 * exit / deck-change disarm. PURE.
 * @param {string|null} current
 * @param {{t:'toggle'|'set'|'clear', tool?:string}} action
 * @returns {string|null}
 */
export function nextRoomTool(current, action) {
  const a = action || {};
  if (a.t === 'clear') return null;
  if (a.t === 'set') return (ROOM_TOOLS.indexOf(a.tool) >= 0) ? a.tool : current;
  if (a.t === 'toggle') {
    if (ROOM_TOOLS.indexOf(a.tool) < 0) return current;
    return current === a.tool ? null : a.tool;
  }
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ERASE — the un-designate verb (M1-C). SHARED BY BOTH STANDARD SURFACES.
//
// Until this landed the client could paint an order and never take it back: one STRIP drag across
// the cryo bay condemned eight capsules and no gesture in `client/` undid it. Nothing below the
// client was missing — `DesignateDigCommand`/`DesignateStockpileCommand`/`DesignateDeconstructCommand`
// all take `on:false` and the TUI has sent it since E0-5 (`hosts/tui/GameLoop.cs`). This is the
// client half, and it is deliberately three tiny pure functions rather than a branch in each view.
//
// ⚠️ WHAT THE PRECEDENCE IS ACTUALLY FOR — CORRECTED IN REVIEW (2026-07-29), because the first
// version of this header named a case that is measurably a NO-OP. It said: *"the Room Zoom draws
// stockpile from `zones`, not from `marks`, so a strip order INSIDE a zone reaches that surface as
// two independently-drawn facts and which one an erase takes off is a decision no host ranking can
// make."* THE DRAWING IS FILTERED; THE REPORTING IS NOT. `markLayerSvg` skips the stockpile kind,
// but `roomMarkTiles` still REPORTS it (its own header says so, in bold, and gives this exact
// reason), so on an EXPLORED tile a zoned tile always arrives on `marks` too and `zoned` cannot
// change the answer for it. Driven case table: `zoned` moves the result for `debris` and for an
// EMPTY mark, and for nothing else.
//
// SO THE PRECEDENCE'S REAL JOB IS THE OPPOSITE OF WHAT WAS WRITTEN: it is what makes `zoned`
// HARMLESS. `tileOrders('strip', true)` is the two-element set {strip, stockpile}, and it must
// resolve to the same verb the Overview's singleton {strip} resolves to, or the two surfaces would
// peel a shared tile in different orders. Rank stockpile first and they do — which is why the
// mutation bites. The rule is the host's own, quoted: *"AN ORDER OUTRANKS A ZONE, AND THAT IS THE
// WHOLE RULE"* (`hosts/web/GameSession.cs` `BuildMarks`), and agreeing with it is the whole content.
//
// ⚠️ AND THE CASE `zones` REALLY COVERS IS FOG, NOT ZONES. `BuildMarks` is fog-gated
// (`GameSession.cs:2053`, *"an unexplored tile emits nothing"*); `BuildZones` is NOT
// (`GameSession.cs:1974-1999` walks every Stockpile-flagged tile); and `DesignateStockpileCommand`
// has no Explored precondition — only `Walkable`, and only on the ON path (`Commands.cs:173`). So a
// zone painted on an unexplored tile exists on `zones` and NOT on `marks`, and reading `zones` is
// what lets the Room Zoom erase it.
//
// ⇒ KNOWN LIMIT, RECORDED RATHER THAN FIXED: **the two surfaces can disagree about a fogged zone.**
// The Room Zoom clears it; the Overview reads only `marks`, sees nothing, and answers NOTHING TO
// ERASE forever. Latent on `--ship wreck` (`InteriorKnownAtBoot = true`, so nothing is fogged) and
// live in mechanism on any crew-vision ship. Closing it means either fog-gating `BuildZones` — a
// fog-of-war change, which is what `BuildMarks`' own comment declines to make from a rendering fix —
// or giving the Overview the `zones` channel. Both are decisions, not tidy-ups.
//
// Peeling one layer per click is deliberate over clearing everything at once: a player cancelling a
// dig painted inside a stockpile zone means the dig, and a verb that also deleted their zone would
// be a destructive surprise with no undo of its own.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The order kinds ERASE can clear, in the order it clears them (one per click). An ORDER outranks a
 *  ZONE — `hosts/web/GameSession.cs` `BuildMarks`' own precedence, minus `debris`, which is TERRAIN
 *  and not an order: nothing the player did put it there, so nothing they can do takes it back. */
export const ERASE_PRECEDENCE = Object.freeze(['dig', 'strip', 'stockpile']);

/**
 * What ORDERS a tile carries, from the two facts a surface can see about it: the `marks` kind NAME
 * (`decodeMarks`' `mark`: 'dig' | 'strip' | 'stockpile' | 'debris' | '' | null) and whether the
 * `zones` channel lists the tile. `debris` and an absent mark contribute nothing.
 *
 * ⚠️ `zoned` CHANGES THE ANSWER FOR EXACTLY TWO MARK SHAPES — 'debris' and ABSENT — and for no
 * other; the earlier claim that it was needed for a strip-inside-a-zone tile is FALSE and is
 * corrected in the section header above. On an EXPLORED tile a zone always reaches `marks` too, so
 * for every mark shape except those two the `zones` half is redundant and the precedence is what
 * keeps it harmless. Its real subject is the FOGGED zone: `BuildZones` has no fog gate and
 * `BuildMarks` does, so a zone on an unexplored tile exists only on `zones`.
 *
 * The Overview passes `false` because it does not read `zones` at all. That is NON-LOSSY for every
 * EXPLORED tile — both surfaces produce the identical peel sequence, verified by driving them — and
 * it is the fogged-zone limit recorded in the header for the rest. PURE.
 * @param {string|null} mark   a `decodeMarks` mark NAME, or '' / null for a tile with no mark
 * @param {boolean} [zoned]    true when the `zones` channel lists this tile
 * @returns {{dig:boolean, strip:boolean, stockpile:boolean}}
 */
export function tileOrders(mark, zoned) {
  const m = mark == null ? '' : String(mark);
  return {
    dig: m === 'dig',
    strip: m === 'strip',
    stockpile: m === 'stockpile' || zoned === true,
  };
}

/**
 * Which ONE order an erase click on this tile takes off, or null when the tile carries none. PURE.
 * @param {{dig?:boolean, strip?:boolean, stockpile?:boolean}|null} orders  `tileOrders` output
 * @returns {'dig'|'strip'|'stockpile'|null}
 */
export function eraseTarget(orders) {
  if (!orders) return null;
  for (const kind of ERASE_PRECEDENCE) if (orders[kind]) return kind;
  return null;
}

/** The `marks` kind NAME at a room-local tile, or '' — over `roomMarkTiles` output (tx/ty are ORIGINAL
 *  tile coordinates, so the caller passes world tiles, not local ones). PURE. */
export function roomMarkNameAt(markTiles, tx, ty) {
  if (!Array.isArray(markTiles)) return '';
  for (const m of markTiles) if (m && (m.tx | 0) === (tx | 0) && (m.ty | 0) === (ty | 0)) return m.mark || '';
  return '';
}

/** True when `roomZoneTiles` output lists this tile as zoned. Same coordinate contract. PURE. */
export function roomTileZoned(zoneTiles, tx, ty) {
  if (!Array.isArray(zoneTiles)) return false;
  for (const z of zoneTiles) if (z && (z.tx | 0) === (tx | 0) && (z.ty | 0) === (ty | 0)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Focused-room tile-rect (VS-Z-14 / IX-Z). GEOMETRY lives on the `decks` slot — the tile-rect
// `[rx,ry,rw,rh]` + deck — never on `rooms`. The display name is the slot's CLIENT-DERIVED label.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Find the focused room's framing from a decksView, by anchorName (IX-Z entry) or slotIndex.
 * Returns `{anchor, deck, slotIndex, roomType, displayName, rx, ry, rw, rh}` or null when no slot
 * matches (a vanished room — IX-Z-51). A blank anchorName never matches. PURE.
 * @param {Array<{deck:number, slots:Array}>|null} dView  decksView(decks, rooms) output
 * @param {string} anchorName
 * @param {number} [slotIndex]  optional disambiguator when several decks share an anchor name
 * @returns {{anchor:string, deck:number, slotIndex:number, roomType:number, displayName:string, rx:number, ry:number, rw:number, rh:number}|null}
 */
export function roomTileRect(dView, anchorName, slotIndex) {
  if (!Array.isArray(dView) || !anchorName) return null;
  for (const d of dView) {
    if (!d || !Array.isArray(d.slots)) continue;
    for (const s of d.slots) {
      if (!s || s.anchorName !== anchorName) continue;
      if (slotIndex != null && s.slotIndex !== slotIndex) continue;
      const r = s.rect || {};
      return {
        anchor: anchorName, deck: d.deck | 0, slotIndex: s.slotIndex | 0,
        // M1-L review: the `|| anchorName` fallback is DELETED here (and at `crewRoomSlot` and
        // `overview-model.js currentRoom`). It was the last path from an internal id to a caption.
        roomType: s.roomType | 0, displayName: s.displayName || '',
        rx: r.x | 0, ry: r.y | 0, rw: r.w | 0, rh: r.h | 0,
      };
    }
  }
  return null;
}

/** The slots of one deck from a decksView, or [] (for the minimap). PURE. */
export function deckSlots(dView, deck) {
  const d = Array.isArray(dView) ? dView.find((e) => e && (e.deck | 0) === (deck | 0)) : null;
  return d && Array.isArray(d.slots) ? d.slots : [];
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// VR-P3 — THE ROOM CUTAWAY: the scene, its placements, and the INVERSE that resolves a click.
//
// The Level-2 surface used to be a PLAN: a CSS-gradient floor with a flat stack of axis-aligned
// tile boxes drawn over it, in a `rw*U × rh*U` logical space. It is now the design's cabinet-oblique
// CUTAWAY — floor quad, back wall, hatched left wall, dashed cut edges — and every tile-addressed
// layer is placed onto it through ONE object (`scenePlacement`) rather than through per-layer maths.
//
// ── THE METRE MAPPING, DECIDED AND STATED ────────────────────────────────────────────────────
// The wire carries a room's TILE RECT and nothing else: no metres, no ceiling. The design draws one
// room, an 8.6 × 2.8 × 2.4 m galley, and it is furnished "at true dimensions" from a catalogue whose
// thirty pieces are specified in CENTIMETRES (`items/fittings.js` SPECS) — so a scale is not
// optional here: a 260 cm bench has to be 260 cm of floor or the room is a diagram of nothing.
//
//   ⭐ ONE TILE IS ONE METRE (`M_PER_TILE`), which is RimWorld's own cell size and therefore the
//     analogue this repo is bound to (CLAUDE.md: "for every mechanism decision, RimWorld's
//     implementation is the analogue"). It is also what makes the catalogue land: a 200 cm cot fills
//     two tiles, a 46 cm chair a fifth of one, and the wreck's 12 × 8 compartments come out
//     12.0 × 8.0 m — a real ship's compartment rather than a doll's house.
//   ⭐ THE CEILING IS 2.4 m (`ROOM_HEIGHT_M`), MEASURED OFF THE DESIGN and not invented: the doc's
//     own prose says "the room is now 2.4 m to the ceiling and the larder reaches most of the way up
//     it", and its dimension arrow reads `2.4 M`. It is a CONSTANT because the sim has no per-room
//     height to read; the day one exists this is the single place that changes.
//
// ── THE INVERSE ──────────────────────────────────────────────────────────────────────────────
// The projection is x-is-x, height-is-height plus one depth vector, so it inverts in closed form on
// the FLOOR PLANE (z = 0) — see `tileFromScenePoint`. A pointer is a 2-D point and the plane is the
// assumption that makes it a tile; that assumption is stated rather than hidden, and its one honest
// consequence is recorded there: clicking the TOP of a tall fitting resolves to the floor tile the
// top face covers, not to the tile the fitting stands on. Every other reading of a 2-D point in a
// 3-D scene needs a depth buffer, which an SVG string does not have.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** One sim tile is one METRE of floor — see the section header for why. */
export const M_PER_TILE = 1;
/** The compartment's ceiling, in metres. Measured off the design; the wire carries no height. */
export const ROOM_HEIGHT_M = 2.4;
/** px per cm for the Level-2 cutaway — the charter's `room` scale, read from the kit, never typed. */
export const ROOM_SCALE = PX_PER_CM.room;
/** The ONE `#fh` hatch namespace this surface emits (`fhDef('rz')` → `<pattern id="rz-fh">`). */
export const RZ_ID = 'rz';
/**
 * The scene's margins around the cutaway, in scene px.
 *  `top` reserves the in-SVG title + stat line (the design sets them at y=24 and y=42, with the
 *  room's highest ink at y=64.4 — so 64 is the doc's own number, not a guess).
 *  `right` holds the right-hand cut-edge dimension arrow and its halo label (the design's `2.4 M`
 *  sits at x=909 against a room whose right-most ink is 981 — the arrow is INSIDE, the label past
 *  it, so the margin is the label's own width).
 *  `bottom` holds the floor-front dimension arrow (`8.6 M` at y=456 under a floor edge at y=452).
 */
export const SCENE_PAD = Object.freeze({ left: 58, right: 104, top: 64, bottom: 74 });

/** Round to 2 dp, −0 normalised — the kit's own `n()`, re-exported through one name so this file
 *  never grows a second rounding rule. */
const nn = obN;

/**
 * THE SCENE for a focused room: its metres, its frame, and the viewBox that holds all of it.
 *
 * The viewBox is DERIVED from the room rather than fixed at the design's 1076×510, because rooms
 * vary and the design draws exactly one. `preserveAspectRatio="xMidYMid meet"` then scales the whole
 * scene into whatever box the canvas offers — the same contract the flat layer stack used, so the
 * responsive behaviour is unchanged and the click math (below) inverts the same two transforms.
 *
 * @param {{rx:number, ry:number, rw:number, rh:number}|null} focusRoom
 * @returns {{wM:number, dM:number, hM:number, s:number, frame:object, areaM2:number,
 *            viewBox:{x:number,y:number,w:number,h:number}, viewBoxAttr:string}}
 */
export function roomScene(focusRoom) {
  const rw = Math.max(1, focusRoom ? focusRoom.rw | 0 : 1);
  const rh = Math.max(1, focusRoom ? focusRoom.rh | 0 : 1);
  const s = ROOM_SCALE;
  const wM = rw * M_PER_TILE, dM = rh * M_PER_TILE, hM = ROOM_HEIGHT_M;
  const wPx = s * wM * 100, hPx = s * hM * 100;
  const [depthX, depthY] = [0.4 * s * dM * 100, 0.6 * s * dM * 100];
  // The front-left floor corner: far enough right for the left wall's depth run, far enough down
  // that the back wall's TOP (the scene's highest ink) clears the title band.
  const x0 = SCENE_PAD.left;
  const y0 = SCENE_PAD.top + hPx + depthY;
  const frame = roomFrame(wM, dM, hM, s, { x: x0, y: y0 });
  return Object.freeze({
    wM, dM, hM, s, frame, rw, rh,
    areaM2: rw * rh * M_PER_TILE * M_PER_TILE,
    viewBox: Object.freeze({
      x: 0, y: 0,
      w: nn(x0 + wPx + depthX + SCENE_PAD.right),
      h: nn(y0 + SCENE_PAD.bottom),
    }),
    viewBoxAttr: '0 0 ' + nn(x0 + wPx + depthX + SCENE_PAD.right) + ' ' + nn(y0 + SCENE_PAD.bottom),
  });
}

/**
 * THE ONE PLACEMENT OBJECT every tile-addressed layer is drawn through.
 *
 * Three idioms, and which one a layer takes is a statement about WHAT IT IS:
 *   • `cell(tx,ty)`  — a `matrix(...)` that maps a `unit × unit` UPRIGHT cell onto the tile's
 *     projected floor parallelogram. For PAINT ON THE FLOOR: a designation, a zone, a scrim. The
 *     unit cell's TOP edge maps to the tile's NEAR edge, because the plan view looked down the
 *     +y axis and the cutaway looks along it — low `ty` is nearest the viewer.
 *   • `stand(tx,ty)` — a `translate(...)` that stands a `unit × unit` cell UPRIGHT with its bottom
 *     centre on the tile's floor centre. For THINGS THAT STAND ON THE FLOOR: a pile, a wall skin, a
 *     label plate. Text goes here and never in `cell` — sheared, mirrored type is unreadable.
 *   • `foot(tx,ty)` / `front(tx,ty)` — the raw projected floor points (tile centre, tile front-left),
 *     for anything that does its own drawing (a pawn, a fitting, a leader line).
 *
 * `unit` is the cell size the LAYER BUILDERS draw in (`U`), NOT a room dimension; the matrix is what
 * carries it to the tile's real size on screen.
 *
 * @param {object} scene `roomScene` output
 * @param {{rx:number, ry:number}} focusRoom
 * @param {number} [unit]
 */
export function scenePlacement(scene, focusRoom, unit = U) {
  const P = scene.frame.project;
  const rx = focusRoom ? focusRoom.rx | 0 : 0;
  const ry = focusRoom ? focusRoom.ry | 0 : 0;
  const cm = M_PER_TILE * 100;
  const corners = (tx, ty) => {
    const x = ((tx | 0) - rx) * cm, y = ((ty | 0) - ry) * cm;
    return {
      // NEAR edge = the LOW-`ty` side, which is the tile's own `y` in room space.
      nearLeft: P(x, y, 0), nearRight: P(x + cm, y, 0),
      farLeft: P(x, y + cm, 0), farRight: P(x + cm, y + cm, 0),
      centre: P(x + cm / 2, y + cm / 2, 0),
      frontCentre: P(x + cm / 2, y, 0),
    };
  };
  return Object.freeze({
    unit,
    corners,
    /** The unit cell → this tile's floor parallelogram, as an SVG `matrix(a b c d e f)`. */
    cell(tx, ty) {
      const c = corners(tx, ty);
      const a = (c.nearRight[0] - c.nearLeft[0]) / unit, b = (c.nearRight[1] - c.nearLeft[1]) / unit;
      const cc = (c.farLeft[0] - c.nearLeft[0]) / unit, d = (c.farLeft[1] - c.nearLeft[1]) / unit;
      return 'matrix(' + nn(a) + ' ' + nn(b) + ' ' + nn(cc) + ' ' + nn(d) + ' '
        + nn(c.nearLeft[0]) + ' ' + nn(c.nearLeft[1]) + ')';
    },
    /** The unit cell, UPRIGHT, bottom-centre on the tile's floor centre. */
    stand(tx, ty) {
      const c = corners(tx, ty).centre;
      return 'translate(' + nn(c[0] - unit / 2) + ' ' + nn(c[1] - unit) + ')';
    },
    /**
     * The tile's floor CENTRE in scene px — where a person's feet or a fitting's anchor go.
     *
     * ⭐ FRACTIONAL-TOLERANT, for the pawn glide: `corners` floors its inputs with `| 0` (it must —
     * `cell`/`stand`/`quad` describe a whole tile's parallelogram), so this one computes the centre
     * DIRECTLY instead of going through it. For an INTEGER `tx`/`ty` the arithmetic is the same
     * expression `corners` evaluates and the result is identical to the digit; a fractional argument
     * now lands between the two tile centres instead of snapping back to the lower one.
     */
    foot(tx, ty) {
      const fx = Number.isFinite(tx) ? tx : 0, fy = Number.isFinite(ty) ? ty : 0;
      return P((fx - rx) * cm + cm / 2, (fy - ry) * cm + cm / 2, 0);
    },
    /** The tile's NEAR-LEFT floor corner in scene px — a fitting's own cm origin. */
    front(tx, ty) { return corners(tx, ty).nearLeft; },
    /** The tile's floor quad as a closed `d`, for an outline that lies in the plane. */
    quad(tx, ty) {
      const c = corners(tx, ty);
      return poly([c.nearLeft, c.nearRight, c.farRight, c.farLeft]);
    },
  });
}

/**
 * THE INVERSE — a point in SCENE coordinates → the absolute sim tile whose FLOOR it lands on, or
 * null when it falls outside the room.
 *
 * Closed form, because the projection is two multiplications and no matrix:
 *     px = x0 + s·x + 0.4·s·y          py = y0 − s·z − 0.6·s·y
 * On the floor plane z = 0, so `y = (y0 − py) / (0.6·s)` and then `x = (px − x0 − 0.4·s·y) / s`.
 *
 * ⚠️ THE PLANE IS AN ASSUMPTION AND IT HAS ONE MEASURED CONSEQUENCE: a point on the TOP FACE of a
 * tall fitting resolves to the floor tile that face covers, which is further BACK than the tile the
 * fitting stands on. At the cutaway's 2.4 m ceiling that is up to ~3 tiles of error on the tallest
 * pieces — a real miss, not a rounding one. That is a TRUE STATEMENT ABOUT THIS FUNCTION and it stays
 * true; what changed is that it is no longer the surface's answer.
 *
 * ⭐⭐ VR-P3-a IS CLOSED, AND THE ROUTE IS THE ONE THIS HEADER NAMED (VR-P3 review, MINOR 7). The
 * paragraph that stood here said the alternative "needs the browser's own picking, which a pure model
 * cannot have" — true of THIS FUNCTION, false of the SURFACE. `roomzoom-view.js`'s `tileAt` now
 * resolves the pointer from `e.target` first (every standing piece carries `data-tile` and
 * `pointer-events="visiblePainted"`) and falls through to this inverse only on bare floor, which is
 * the plane this closed form is exactly right about. What a PURE model cannot have is a depth buffer;
 * what the VIEW cannot have is an excuse. The old plan view had no such case because nothing had
 * height.
 *
 * ⛔ SO DO NOT READ THIS FUNCTION AS "THE CLICK MAP". It is one of two tiers, and the tier that is
 * wrong about anything with height. Reaching for it directly from a handler re-opens the defect —
 * measured on the wreck's cryo bay before the fix: 16 of 18 drawn fittings designated a different
 * tile through this path and 2 designated none at all.
 * PURE.
 */
export function tileFromScenePoint(sx, sy, scene, focusRoom) {
  if (!scene || !focusRoom) return null;
  const s = scene.s;
  if (!(s > 0)) return null;
  const f = scene.frame;
  const yCm = (f.y0 - sy) / (0.6 * s);
  const xCm = (sx - f.x0 - 0.4 * s * yCm) / s;
  const cm = M_PER_TILE * 100;
  if (xCm < 0 || yCm < 0 || xCm >= scene.rw * cm || yCm >= scene.rh * cm) return null;
  const tx = Math.floor(xCm / cm) + (focusRoom.rx | 0);
  const ty = Math.floor(yCm / cm) + (focusRoom.ry | 0);
  return clampTileToRoom(tx, ty, focusRoom) ? { x: tx, y: ty } : null;
}

/**
 * The `preserveAspectRatio="xMidYMid meet"` fit of a scene viewBox into a `w × h` px element: ONE
 * scale, centred on both axes. The rendered SVG and the click math share this derivation, so they
 * cannot drift — which is the property `roomFit` had and this replaces.
 *
 * ⚠️ IT REPLACES `roomFit`, WHICH IS DELETED RATHER THAN KEPT ALONGSIDE. `roomFit` described the
 * PLAN's `rw*U × rh*U` box; that box no longer exists, and a second fit descriptor for a space
 * nothing draws in is the shape of stale model this file's own headers keep retracting.
 * PURE.
 */
export function sceneFit(scene, w, h) {
  const vb = scene && scene.viewBox;
  if (!vb || !(vb.w > 0) || !(vb.h > 0) || !(w > 0) || !(h > 0)) {
    return { s: 0, offX: 0, offY: 0, vbW: vb ? vb.w : 0, vbH: vb ? vb.h : 0 };
  }
  const s = Math.min(w / vb.w, h / vb.h);
  return { s, offX: (w - vb.w * s) / 2, offY: (h - vb.h * s) / 2, vbW: vb.w, vbH: vb.h };
}

/**
 * Resolve a client-space pointer to an absolute sim tile, or null (IX-Z-10/11). Same SIGNATURE and
 * same contract as the plan-view version it replaces — `rect` is the SVG element's bounding box —
 * but the two transforms it inverts are now the viewBox fit and the cabinet oblique.
 * PURE.
 * @param {number} clientX @param {number} clientY
 * @param {{left:number, top:number, width:number, height:number}} rect
 * @param {{rx:number, ry:number, rw:number, rh:number}} focusRoom
 * @returns {{x:number, y:number}|null}
 */
export function tileFromCanvasXY(clientX, clientY, rect, focusRoom) {
  if (!rect || !focusRoom || !rect.width || !rect.height) return null;
  const scene = roomScene(focusRoom);
  const fit = sceneFit(scene, rect.width, rect.height);
  if (!(fit.s > 0)) return null;
  const sx = (clientX - rect.left - fit.offX) / fit.s;
  const sy = (clientY - rect.top - fit.offY) / fit.s;
  return tileFromScenePoint(sx, sy, scene, focusRoom);
}

/** The scene point (in CLIENT px) a tile's floor centre sits at — the inverse direction of
 *  `tileFromCanvasXY`, for the one transient that lives outside the SVG (`.rz-pulse-tile`). PURE. */
export function tileClientBox(tx, ty, rect, focusRoom) {
  if (!rect || !focusRoom || !rect.width || !rect.height) return null;
  const scene = roomScene(focusRoom);
  const fit = sceneFit(scene, rect.width, rect.height);
  if (!(fit.s > 0)) return null;
  const p = scenePlacement(scene, focusRoom);
  const c = p.corners(tx, ty);
  const xs = [c.nearLeft[0], c.nearRight[0], c.farLeft[0], c.farRight[0]];
  const ys = [c.nearLeft[1], c.nearRight[1], c.farLeft[1], c.farRight[1]];
  const toX = (v) => fit.offX + v * fit.s;
  const toY = (v) => fit.offY + v * fit.s;
  const left = toX(Math.min(...xs)), right = toX(Math.max(...xs));
  const top = toY(Math.min(...ys)), bottom = toY(Math.max(...ys));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * THE CUTAWAY ITSELF: the shared hatch def, then the room — floor quad, floor grid, back wall,
 * hatched left wall, solid front edge and the two dashed cut edges — straight out of `oblique.room`.
 *
 * ⭐ THE FLOOR GRID **IS** THE BUILD GRID, and that is the one place this call diverges from the
 * design's defaults. `oblique.room` defaults to a 60 cm grid and 5 depth bands, which is a drawing
 * convention; here the grid has a job — it is the surface a player designates tiles on — so it is
 * asked for one line per METRE across and one band per TILE back. The old `gridSvg`'s
 * `rgba(255,255,255,.05)` hairlines are deleted with the plan they belonged to: the grid is the
 * design's own 0.5-wide ink at 0.2 opacity now, and it lands exactly on the tiles.
 *
 * `vacuum` swaps the floor's grid for a DASHED one and dims the wall faces — the airless idiom, see
 * `roomStatLine`.
 */
export function roomCutawaySvg(scene, opts = {}) {
  const o = opts || {};
  const body = obliqueRoom(scene.wM, scene.dM, scene.hM, scene.s, {
    x: scene.frame.x0, y: scene.frame.y0,
    hatch: fhRef(RZ_ID),
    gridCm: M_PER_TILE * 100,
    depthDivs: Math.max(1, scene.rh),
  });
  if (!o.vacuum) return body;
  // THE AIRLESS ROOM. The floor grid becomes a DASHED grid and the walls lose a third of their ink:
  // a compartment with no air is a compartment that is not really a room yet. It is a treatment of
  // the DRAWING rather than a wash over it, because a scrim over the whole floor would dim every
  // order, mark and zone painted on it — the exact misreading `blocked-overlay.js` refuses to make.
  return body
    .replace(/(<g fill="none" stroke="[^"]*" stroke-width="0.5")/, '$1 stroke-dasharray="3 4"')
    .replace(/stroke-width="2.2"/g, 'stroke-width="2.2" stroke-opacity="0.62"');
}

/** The shared `#rz-fh` hatch def — emitted ONCE per surface root (the id-collision pin). */
export function roomHatchDef() { return '<defs>' + fhDef(RZ_ID) + '</defs>'; }

/**
 * THE IN-SVG TITLE AND STAT LINE — the design's serif 24px headline over its mono 9px stat line.
 *
 * ⛔ EVERY CLAUSE IS WIRE DATA. The design's own stat line reads
 * `24.1 M² · 5 OF 9 FITTINGS BUILT · SEATS 5 OF 3 ABOARD`, and the third clause is the emotional
 * payload of the whole screen. **`SEATS` IS NOT AVAILABLE AND IS NOT INVENTED** — no channel carries
 * a seat count, and ruling E11 forbids a UI lane writing the sentence itself. The clause this
 * surface CAN say truthfully has the same shape and the same payload: how many of the souls aboard
 * are standing in this compartment right now (`roomCrew` against the roster). `N OF M ABOARD, HERE`.
 *
 * The FITTINGS clause is `placed OF placed+pending`, both derived (`roomCells` with an itemId, plus
 * `roomDesigns`) — the design's "5 OF 9 FITTINGS BUILT" exactly.
 *
 * @param {{areaM2:number, placed:number, pending:number, here:number, aboard:number,
 *          vacuum?:boolean}} s
 */
export function roomStatLine(s) {
  return roomStatClauses(s).map((c) => c.t).join(STAT_SEP);
}

/** The separator between stat clauses — declared once, because the SPLIT builder below and the
 *  joined string above must agree about it to the character. */
const STAT_SEP = ' · ';
/** The stat line's ordinary ink (charter §1 micro-label) and the ONE clause allowed the accent. */
const STAT_INK = '#6B6252';
/** The stat line's design type: mono 9 / 1.6 tracking, at x = 9 in the scene's title band. */
const STAT_X = 9, STAT_Y = 42, STAT_SIZE = 9, STAT_TRACK = 1.6;

/**
 * THE STAT LINE AS CLAUSES, each with the ink it is entitled to — the split `roomStatLine` joins.
 *
 * ⛔⛔ THIS EXISTS BECAUSE THE ONE-STRING VERSION SPENT THE ACCENT ON EVERYTHING (VR-P3 review,
 * MAJOR 4). `roomTitleSvg` set `fill: vacuum ? OB_ATTEND : …` on the WHOLE `<text>`, so an airless
 * compartment printed its area, its fitting count and its crew count in oxblood as well as its
 * `NO AIR` — while this function's own comment and `roomTitleSvg`'s own comment both said only the
 * trailing clause took it. Charter §1 allows ONE accent and spends it on attention; a stat line
 * entirely in the attention colour says the area is an emergency.
 *
 * The returned array is the ONLY place the clause list is written; `roomStatLine` joins it and
 * `roomTitleSvg` sets each run's ink. PURE.
 *
 * @param {{areaM2:number, placed:number, pending:number, here:number, aboard:number,
 *          vacuum?:boolean}} s
 * @returns {{t:string, fill?:string}[]}
 */
export function roomStatClauses(s) {
  const o = s || {};
  const area = (o.areaM2 | 0);
  const placed = o.placed | 0, pending = o.pending | 0;
  const here = o.here | 0, aboard = o.aboard | 0;
  const parts = [
    { t: area + '.0 M²' },
    { t: placed + ' OF ' + (placed + pending) + ' FITTINGS BUILT' },
    { t: here + ' OF ' + aboard + ' ABOARD, HERE' },
  ];
  // The airless clause rides the stat line rather than a badge of its own: it is a fact about the
  // compartment, in the row that states facts about the compartment, and it is the ONE clause here
  // that is allowed the accent (charter §1 — oxblood is attention).
  if (o.vacuum) parts.push({ t: 'NO AIR', fill: OB_ATTEND });
  return parts;
}

/**
 * The in-SVG headline + stat line as one `<g>`.
 *
 * ⭐ ONLY THE `NO AIR` CLAUSE TAKES THE ACCENT — see `roomStatClauses`. The line is one `<text>` with
 * one `<tspan>` for the accented clause, so the words still sit on one baseline with one halo.
 *
 * ⭐ AND IT IS SCALED TO FIT (VR-P3 review, MINOR 3). At the design's fixed 9 px the line is ~366 px
 * of type; a 1 × 1 compartment's whole viewBox is 295 px, so the sentence ran off the right edge and
 * the player read `… 1 OF 3 A`. It is FITTED instead of TRUNCATED because every clause is a fact
 * about the room and the last one is the airless warning — dropping characters off the end drops the
 * one clause that matters most. The size never grows past the design's 9.
 */
export function roomTitleSvg(scene, s) {
  const o = s || {};
  const title = 'Compartment ' + ((o.slotIndex | 0) + 1) + ' · ' + String(o.roomName == null ? '' : o.roomName);
  const runs = roomStatClauses(o).flatMap((c, i) => (i ? [{ t: STAT_SEP }, c] : [c]));
  const stat = runs.map((r) => r.t).join('');
  const avail = Math.max(1, (scene && scene.viewBox ? scene.viewBox.w : 0) - STAT_X * 2);
  const full = monoTextWidth(stat, STAT_SIZE, STAT_TRACK);
  const k = full > avail ? avail / full : 1;
  return '<g class="rz-title">'
    + haloText(title, 8, 24, { size: 24, font: 'serif', fill: OB_INK, stroke: OB_PAPER, anchor: 'start' })
    + haloRuns(runs, STAT_X, STAT_Y, {
      size: nn(STAT_SIZE * k), font: 'mono', tracking: nn(STAT_TRACK * k), fill: STAT_INK,
      stroke: OB_PAPER, anchor: 'start',
    })
    + '</g>';
}

/**
 * THE DIMENSION ARROWS — the design's three: the width along the floor front, the depth up the left
 * wall (rotated to lie along it) and the ceiling height on the right cut edge.
 *
 * They are what makes the drawing a DRAWING rather than a picture, and they are the cheapest honest
 * statement of the metre mapping: a player who wonders how big the bench is can read the room.
 * Every number comes from `roomScene`, so a room that is 12 tiles across says `12.0 M` and cannot
 * say anything else.
 */
export function roomDimensionsSvg(scene) {
  const f = scene.frame, s = scene.s;
  const c = f.corners;
  const one = (d) => (Math.round(d * 10) / 10).toFixed(1) + ' M';
  const tick = (x1, y1, x2, y2) => '<path d="M' + nn(x1) + ' ' + nn(y1) + ' L' + nn(x2) + ' ' + nn(y2)
    + '" fill="none" stroke="' + OB_INK + '" stroke-width="0.5" opacity="0.5"/>';
  const line = (x1, y1, x2, y2) => '<path d="M' + nn(x1) + ' ' + nn(y1) + ' L' + nn(x2) + ' ' + nn(y2)
    + '" stroke="' + OB_INK + '" stroke-width="0.9"/>';
  const head = (x, y, dx, dy) => {
    // A 7-px barb, square to the run — the design's own `l7.0 -2.6 l0.0 5.2 Z` generalised.
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    return '<path d="M' + nn(x) + ' ' + nn(y) + ' L' + nn(x + ux * 7 + px * 2.6) + ' ' + nn(y + uy * 7 + py * 2.6)
      + ' L' + nn(x + ux * 7 - px * 2.6) + ' ' + nn(y + uy * 7 - py * 2.6) + ' Z" fill="' + OB_INK + '"/>';
  };
  const lab = (t, x, y, rot, anchor) => '<g transform="rotate(' + nn(rot) + ' ' + nn(x) + ' ' + nn(y) + ')">'
    + haloText(t, x, y, { size: 9, font: 'mono', tracking: 1.3, fill: OB_INK, anchor }) + '</g>';

  // 1 — WIDTH, under the floor's front edge.
  const wy = c.frontLeft[1] + 22;
  const w = tick(c.frontLeft[0], c.frontLeft[1], c.frontLeft[0] - 9.1, wy + 3.4)
    + tick(c.frontRight[0], c.frontRight[1], c.frontRight[0] - 9.1, wy + 3.4)
    + line(c.frontLeft[0] - 6.8, wy, c.frontRight[0] - 6.8, wy)
    + head(c.frontLeft[0] - 6.8, wy, 1, 0) + head(c.frontRight[0] - 6.8, wy, -1, 0)
    + lab(one(scene.wM), (c.frontLeft[0] + c.frontRight[0]) / 2 - 6.8, wy - 6, 0, 'middle');
  // 2 — DEPTH, rotated to run along the left wall's floor line.
  const dx0 = c.frontLeft[0] - 24, dy0 = c.frontLeft[1] + 10;
  const dx1 = c.backLeft[0] - 24, dy1 = c.backLeft[1] + 10;
  const ang = Math.atan2(dy1 - dy0, dx1 - dx0) * 180 / Math.PI;
  const d = tick(c.frontLeft[0], c.frontLeft[1], dx0, dy0) + tick(c.backLeft[0], c.backLeft[1], dx1, dy1)
    + line(dx0, dy0, dx1, dy1) + head(dx0, dy0, dx1 - dx0, dy1 - dy0) + head(dx1, dy1, dx0 - dx1, dy0 - dy1)
    + lab(one(scene.dM), (dx0 + dx1) / 2 - 15, (dy0 + dy1) / 2, ang, 'middle');
  // 3 — HEIGHT, on the right cut edge.
  const hx = c.frontRight[0] + 22;
  const h = tick(c.frontRight[0], c.frontRight[1], c.frontRight[0] + 30, c.frontRight[1])
    + tick(c.frontRightTop[0], c.frontRightTop[1], c.frontRightTop[0] + 30, c.frontRightTop[1])
    + line(hx, c.frontRight[1], hx, c.frontRightTop[1])
    + head(hx, c.frontRight[1], 0, -1) + head(hx, c.frontRightTop[1], 0, 1)
    + lab(one(scene.hM), hx + 12, (c.frontRight[1] + c.frontRightTop[1]) / 2, 0, 'start');
  return '<g class="rz-dims">' + w + d + h + '</g>';
}

/**
 * THE DOOR PLATES + HALO LABELS. Every tile of the room's boundary that carries a door glyph gets a
 * plate on the wall it sits in and a mono label outside it naming where it goes.
 *
 * ⚠️ IT NAMES ONLY WHAT THE WIRE KNOWS. The design's labels read `‹ 5 · CORRIDOR` and `7 · HOLD ›`
 * — a compartment NUMBER and its NAME on the other side of the door. The `decks` channel carries
 * both for every slot, so the neighbour is LOOKED UP (`neighbourAt`), never invented; a door onto
 * nothing this client can name gets the bare `DOOR` and no arrow, which is the honest answer.
 *
 * @param {object} scene @param {{rx,ry,rw,rh}} focusRoom
 * @param {{tx:number,ty:number,side:'left'|'right'|'back'|'front',label:string}[]} doors
 */
export function roomDoorsSvg(scene, focusRoom, doors) {
  if (!Array.isArray(doors) || !doors.length) return '';
  const P = scene.frame.project;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const cm = M_PER_TILE * 100, dh = 200; // a 2.0 m doorway in a 2.4 m wall
  const vbW = scene.viewBox ? scene.viewBox.w : 0;
  const out = [];
  for (const d of doors) {
    if (!d) continue;
    const x = ((d.tx | 0) - rx) * cm, y = ((d.ty | 0) - ry) * cm;
    let pts, lx, ly, anchor;
    if (d.side === 'left') {
      pts = [P(0, y, 0), P(0, y + cm, 0), P(0, y + cm, dh), P(0, y, dh)];
      const a = P(0, y + cm / 2, dh);
      lx = a[0] - 22; ly = a[1] - 8; anchor = 'end';
    } else if (d.side === 'right') {
      // ⛔ NO PLATE ON THE RIGHT, AND THAT IS THE CUTAWAY BEING HONEST. The right wall is the one the
      // drawing has CUT AWAY — that is what its dashed edge says — so a solid door plate hanging in
      // that empty space would contradict the two dashed lines beside it. The door is still SAID:
      // the label goes at the cut edge, with the design's `›` pointing out of the room.
      pts = null;
      const a = P(scene.rw * cm, y + cm / 2, dh);
      lx = a[0] + 10; ly = a[1] - 8; anchor = 'start';
    } else if (d.side === 'front') {
      // ⛔ THE NEAR WALL IS CUT AWAY TOO — same rule as the right, same reason. It is still SAID: the
      // label goes UNDER the floor's front edge, where the width dimension already lives, so a way
      // out of the room is never silently missing from the drawing.
      pts = null;
      const a = P(x + cm / 2, 0, 0);
      lx = a[0]; ly = a[1] + 34; anchor = 'middle';
    } else { // back (or an unclassified door — drawn on the back wall, which is the one we can see)
      pts = [P(x, scene.rh * cm, 0), P(x + cm, scene.rh * cm, 0),
        P(x + cm, scene.rh * cm, dh), P(x, scene.rh * cm, dh)];
      const a = P(x + cm / 2, scene.rh * cm, dh);
      lx = a[0]; ly = a[1] - 12; anchor = 'middle';
    }
    if (pts) {
      // The CLASS is a test + stylesheet hook and it is the only thing that separates "a door plate
      // was drawn" from "a door label was written": on the right and front walls the cutaway draws
      // NO plate on purpose (see above), so a census that could not tell the two apart would read a
      // label-only door as a plate and never see the plate layer disappear.
      out.push('<path class="rz-door-plate" d="' + poly(pts) + '" fill="' + OB_PAPER + '" stroke="'
        + OB_INK + '" stroke-width="1.5"/>');
    }
    out.push(haloText(d.label, clampLabelX(lx, d.label, anchor, vbW), ly, {
      size: DOOR_LABEL_SIZE, font: 'mono', tracking: DOOR_LABEL_TRACK, fill: '#6B6252', anchor,
    }));
  }
  return '<g class="rz-doors">' + out.join('') + '</g>';
}

/** The door labels' type — one place, so the clamp below and the label agree about their width. */
const DOOR_LABEL_SIZE = 8.5, DOOR_LABEL_TRACK = 1.3;
/** How close to the viewBox edge a clamped label is allowed to sit, in scene px. */
const LABEL_MARGIN = 2;

/**
 * KEEP A DOOR LABEL INSIDE THE SCENE (VR-P3 review, MINOR 2).
 *
 * ⛔ THE DEFECT, MEASURED. `SCENE_PAD.left` is 58 px and a left-hand door's label is set at the wall
 * with `text-anchor="end"`, so it runs LEFT from its anchor: `‹ 2 · CORRIDOR` at 8.5/1.3 is ~92 px of
 * type against ~55 px of room to the left of it, and the first characters fell outside the viewBox
 * and were CLIPPED — a 1 × 1 compartment lost the whole `‹ 2 ·` prefix, and the wreck's 12 × 8 front
 * row put a left label at x ≈ −60. A door the player cannot read is a way out of the room the drawing
 * does not mention, which is the exact silence `roomDoorsSvg`'s own header refuses on the right wall.
 *
 * ⭐ IT CLAMPS RATHER THAN GROWING THE PAD, and that is a choice with a reason: the pad is part of the
 * SCENE (it sizes the viewBox, which sizes every tile on screen), so deriving it from the longest
 * neighbour NAME would let one compartment's caption shrink the room next door. A clamped label may
 * ride over the hatched left wall; it is haloed (`paint-order="stroke"`, a 3.4 px paper knockout), so
 * it stays readable there, and it is INSIDE the picture, which is the property that was missing.
 * PURE.
 */
function clampLabelX(x, label, anchor, vbW) {
  const w = monoTextWidth(label, DOOR_LABEL_SIZE, DOOR_LABEL_TRACK);
  // Where the label's LEFT edge sits relative to its anchor, per `text-anchor`.
  const lead = anchor === 'end' ? -w : anchor === 'middle' ? -w / 2 : 0;
  let v = x;
  if (vbW > 0 && v + lead + w > vbW - LABEL_MARGIN) v = vbW - LABEL_MARGIN - w - lead;
  // LEFT LAST, so it wins when a label is wider than the whole scene: a caption that starts at the
  // left edge and overruns the right is readable from its first character; one pushed off the left
  // loses the `‹ N ·` prefix that says WHICH compartment it opens onto, which is the payload.
  if (v + lead < LABEL_MARGIN) v = LABEL_MARGIN - lead;
  return nn(v);
}

/**
 * The room's boundary doors, from the frame's own glyphs. A door glyph (`'+'` closed, `'X'` blast,
 * `'/'` open doorway) on the room's edge row/column is a way out; the label names the neighbouring
 * slot when `decks` describes one.
 *
 * ⚠️ EDGE ONLY, and that is not a shortcut: an interior door is a partition inside one compartment
 * and has no "where does it go" to state, so labelling it would be inventing a destination.
 * PURE.
 */
export function roomDoorTiles(frame, focusRoom, dView) {
  const out = [];
  if (!frame || !focusRoom || !Array.isArray(frame.cells)) return out;
  if ((frame.deck | 0) !== (focusRoom.deck | 0)) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const rw = focusRoom.rw | 0, rh = focusRoom.rh | 0;
  const slots = Array.isArray(dView) ? deckSlots(dView, focusRoom.deck) : [];
  const nameAt = (tx, ty) => {
    for (const s of slots) {
      if (!s || !s.anchorName || s.slotIndex === (focusRoom.slotIndex | 0)) continue;
      const r = s.rect || {};
      if (tx >= (r.x | 0) && tx < (r.x | 0) + (r.w | 0) && ty >= (r.y | 0) && ty < (r.y | 0) + (r.h | 0)) {
        return { n: (s.slotIndex | 0) + 1, name: s.displayName || '' };
      }
    }
    return null;
  };
  for (let ty = ry; ty < ry + rh; ty++) {
    for (let tx = rx; tx < rx + rw; tx++) {
      const onLeft = tx === rx, onRight = tx === rx + rw - 1;
      const onBack = ty === ry + rh - 1, onFront = ty === ry;
      if (!onLeft && !onRight && !onBack && !onFront) continue;
      const cell = frame.cells[ty * (frame.w | 0) + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0] | 0;
      if (code !== 43 && code !== 88 && code !== 47) continue; // + X /
      const side = onLeft ? 'left' : onRight ? 'right' : onBack ? 'back' : 'front';
      const nb = nameAt(side === 'left' ? tx - 1 : side === 'right' ? tx + 1 : tx,
        side === 'back' ? ty + 1 : side === 'front' ? ty - 1 : ty);
      const label = nb && nb.name
        ? (side === 'left' ? '‹ ' + nb.n + ' · ' + nb.name
          : side === 'right' ? nb.n + ' · ' + nb.name + ' ›'
            : nb.n + ' · ' + nb.name)
        : 'DOOR';
      out.push({ tx, ty, side, label });
    }
  }
  return out;
}

/** True when (tx,ty) is inside the room's tile-rect (IX-Z-11). PURE. */
export function clampTileToRoom(tx, ty, focusRoom) {
  if (!focusRoom) return false;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  return tx >= rx && tx < rx + (focusRoom.rw | 0) && ty >= ry && ty < ry + (focusRoom.rh | 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Channel clamps to the room rect (VS-Z-14 / IX-Z-28). A frame cell, crew member, design or decor
// renders only when it is inside `[rx,ry,rw,rh]` AND on the room's deck — the Level-2 "just this
// room" contract.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Glyph code points the floor / wall / structure layers own (never an item on a tile) — mirrors
 * overview-scene's NON_FURNITURE (`. # space % @ /`). Exported ONLY so the two surfaces can be
 * pinned equal by a test; nothing outside this module and `overview-scene.js` should read it.
 *
 * ⚠️ `'&'` (38, CORPSE) WAS IN THIS SET UNTIL THE GROUND-ITEM ART PACKAGE (2026-07-27) AND ITS
 * REMOVAL IS THE ONE SURFACE CHANGE THAT PACKAGE MADE. A corpse is not floor, not wall and not
 * structure — it is a `ItemKind` lying on a tile, exactly like Regolith — but it was filtered here on
 * BOTH SVG surfaces, so it reached neither furniture layer and drew NOTHING AT ALL: not a wrong
 * thing, nothing (`NO_GROUND_ITEM_SPRITE`'s `Corpse` entry recorded that as the one kind that did not
 * chip, and recorded WHY). Art alone could not have made it appear. The other six codes are
 * untouched, and the change is exactly one number in exactly two files, deliberately: `'%'` (37,
 * debris) in particular MUST stay — removing it fills a wreck with 33 dashed unknown chips, measured
 * (see the DEBRIS block below).
 *
 * ⚠️ "MAKE THE TWO `NON_FURNITURE` SETS AGREE" IS A STALE INSTRUCTION AND `docs/HANDOVER.md` STILL
 * CARRIES IT — MEASURE BEFORE ACTING ON IT. There has been exactly ONE set since the ground-item art
 * package: this frozen list, imported by `overview-scene.js:47`. The disagreement that actually
 * remained was between THIS set and `STRUCTURE_CODES` (`[35, 43, 47, 88]`, further down this file),
 * which contains `'+'` (43) and `'X'` (88) while this one does not.
 *
 * ⚠️ AND FORCING THOSE TWO TO AGREE WOULD HAVE BEEN THE WRONG FIX. They answer different questions:
 * this set is "which layer owns the tile's drawing", `STRUCTURE_CODES` is "is this built structure
 * DEMOLISH cannot take apart" (it is read by `demolishTarget` and by nothing else — there is no
 * structure LAYER, see below). Adding 43/88 here would have made a closed door draw NOTHING, which
 * is the failure the door package (2026-07-27) exists to end. The door glyphs are now skinned
 * instead: `'+'` by `sliding-door`, `'X'` by `blast-door` through `GLYPH_SUBSTITUTE`. `'/'` (47)
 * stays here on purpose — an open doorway is a gap, ledgered as `NO_DEVICE_GLYPH_ART`.
 *
 * ⚠️ THE CLAIM THAT A "STRUCTURE LAYER" DRAWS DOORS WAS FALSE ON BOTH SURFACES, and it stood in
 * `device-sprite-coverage.test.js`'s allowlist as the reason `Door` was excused from the art guard.
 * `roomMaterialTiles` (below) emits `kind:'wall'` for glyph 35 and `kind:'floor'` for glyph 46 and
 * nothing else; the Overview's compartments come from the `decks` slot rects, not from frame codes.
 * Nothing anywhere drew a door. The same entry claimed **zero** in-rect door tiles on `--ship grid`;
 * driven over the committed capture, deck 0 has **8 door tiles and all 8 are inside a room rect**,
 * deck 1 likewise 8 with **3 of them CLOSED**. The "doors sit on room boundaries" premise was wrong.
 */
export const NON_FURNITURE_CODES = Object.freeze([46, 35, 32, 37, 64, 47]); // . # space % @ /
const NON_FURNITURE = new Set(NON_FURNITURE_CODES);

// ⚠️ `ROLE_TO_ITEM` IS GONE FROM THIS FILE (2026-07-26), quoted here so a grep for it lands on the
// reason: it was a hand-written `{scrubber:'o2-scrubber', watertank:'oxygen-tank', …}` object with a
// comment saying it *"mirrors overview-scene's ROLE_TO_ITEM so the two SVG views skin the same glyph
// identically"* — and the Overview carried the mirror-image copy with the mirror-image comment. Two
// hand mirrors of a table `ITEMS` already states once, reached through a THIRD table
// (`SPRITE_FOR_GLYPH`, glyph → sprite role). The chain had a hole in it — `GrowBed` `"`, `Terminal`
// `T` and `Telescope` `x` reached no role, so hydroponics and the MOSS terminal drew the VS-Z-25
// dashed unknown chip in the shipping game (HANDOVER §4l). The derivation lives in
// `items/glyph-map.js` and both surfaces now call the same function.

/** The warm itemId a glyph code maps to, or '' (unmapped → the unknown chip, VS-Z-25). PURE. */
export function itemForGlyph(code) {
  if (NON_FURNITURE.has(code)) return '';
  return itemIdForGlyphChar(String.fromCharCode(code));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE DEVICE-TILE FALLBACK — a device whose GLYPH a pawn is standing on
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⭐ THE OWNER'S DEFECT, 2026-08-05: *"when the pawn works across a capsule, the capsule disappears
// until the pawn is out of the cell."* CONFIRMED, and it is not about working:
//
//   `GlyphMapper` writes ONE glyph per tile in six passes and later passes overdraw earlier ones
//   (`sim/Sim.Glyph/GlyphMapper.cs:13-23`). Pass 4 writes the device; PASS 5 WRITES
//   `Glyphs.Citizen` OVER THE WHOLE CELL UNCONDITIONALLY (`GlyphMapper.cs:185-195`, only `Bg` and
//   `Attr` survive). So a device with a crew member on it has no device glyph on the frame AT ALL,
//   `roomCells` saw 64 in `NON_FURNITURE_CODES` and dropped the tile, and the fitting left the
//   drawing until she moved. `WireFormat.Devices.cs:261-266` describes this loss in its own header
//   and names the remedy: *"THE FIX IS A CHANNEL, NOT A BETTER READER."*
//
// ⚠️ AND IT FIRES ON A PAWN MERELY WALKING PAST, which the owner's wording understates.
// `CitizenSystem.cs:51-54` snaps `citizen.Pos` to the DESTINATION tile the instant a step begins and
// holds it for `ticksPerTile` while the presenter interpolates; pass 5 projects `Pos`. The device is
// therefore blanked for the whole ~1 s traversal, starting before she is visibly on the tile.
//
// THE CHANNEL WAS ALREADY HERE. `roomDeviceConditions` / `deckDeviceConditions` (below) already
// build a per-tile Map off the `devices` wire channel, and both surfaces already hand it to their
// furniture pass — to read `cond` and NOTHING ELSE. All that was missing was a way to name the
// PIECE from a channel row, which is what the two functions below are.
//
// ⛔ WHY THIS IS NOT `wear.js`'s ROAD NOT TAKEN, AND WHY THE FIRST DRAFT WAS ANYWAY. That module
// refuses to key art off the wire's `kind` byte because `DeviceKind → itemId` is not a function —
// TRUE, and the fix threads that needle by going kind → REST GLYPH → piece, so the ONE join every
// other tile on both surfaces uses (`itemIdForGlyphChar`) is the only thing that ever names a piece.
// `Glyphs.ForDevice` IS a function; what is not a function is the reverse.
//
// ⛔⛔ THE FIRST DRAFT DID NOT DO THAT AND SHIPPED THE SIXTH TRAP IN ITS OWN COSTUME. It derived
// kind → piece by scanning `ITEMS` for a `functional` row whose `deviceKind` matched AND whose own
// id was a value of `GLYPH_TO_ITEM` — which silently returned `''` for every device whose art is
// BORROWED, because a substituted piece is another kind's row and `wall-lamp` is `cosmetic`
// outright. SIX kinds, found by independent review, driven at the seam and live on the wreck (Rell
// on the Light at (1,1): `rz-f-1-1` absent, the caption reading "25 PLACED" instead of 26):
//
//     Light → wall-lamp · WaterTank → oxygen-tank · SalvageRecycler → water-recycler
//     Radiator → space-heater · MedCabinet → locker · IceMelter → cooker
//
// ⇒ A fix for "a pawn deletes the machine she stands on" that deleted six kinds of machine when a
// pawn stood on them. `GLYPH_SUBSTITUTE`'s own header names all six, and so does the `wear.js`
// paragraph this package edited in the same commit: **borrowed art means the registry row is not a
// fact about the device.** Going through the glyph removes the functional/cosmetic distinction
// entirely, because `deriveGlyphToItem` has already folded the substitutions in.
//
// ⛔ AND IT IS NOT A CACHE, WHICH IS THE OTHER DESIGN THAT WOULD HAVE PASSED THE OWNER'S TEST. A
// "remember the last glyph on this tile" memo also survives a pawn — and leaves a GHOST of a
// deconstructed machine on screen forever. Every answer here comes from the CURRENT frame's
// `devices` payload, so a device that is gone is gone (pinned by its own leg in
// `devices-model.test.js`).

/** `Glyphs.Citizen` — the ONE overwrite this fallback repairs. Narrow on purpose: `'/'` (an open
 *  doorway) and `'.'`/`'#'` are not losses, they are the tile's own truth, and restoring a piece
 *  under them would put a door back in a doorway the sim says is open. */
export const CITIZEN_GLYPH_CODE = 64;

/**
 * `Glyphs.ForDevice` MIRRORED BY KIND NAME — the rest glyph of every `DeviceKind`.
 *
 * ⚠️ A MIRROR OF THE SIM, WITH A MECHANICAL PIN, NOT A SECOND AUTHORITY. `room-model.test.js`
 * PARSES `sim/Sim.Glyph/Glyphs.cs`'s own switch and asserts this table matches it arm for arm, and
 * that the two have the same length — so a 30th kind, or a moved char, fails by name instead of
 * rotting. Same idiom as `DEVICE_KIND_NAMES` above (pinned against the C# enum by
 * `prioritise-menu.test.js`) and `STOCK_KINDS`.
 *
 * ⚠️ IT LIVES HERE RATHER THAN IN `items/glyph-map.js` BECAUSE IT IS NOT ABOUT ART. Every value is a
 * glyph; what each glyph DRAWS is `glyph-map.js`'s question, and this table deliberately does not
 * know the answer — that is the whole point of routing through `itemIdForGlyphChar`. `Conduit` and
 * `Pipe` share `'~'` (an intentional, documented collision in the C#), and neither has a piece; they
 * resolve to `''` through the same join as everything else rather than through a special case.
 */
export const DEVICE_REST_GLYPH = Object.freeze({
  Door: '+', AirVent: '^', Scrubber: 'S', Ladder: 'H', Terminal: 'T', SolarWing: 'G', Battery: 'B',
  Conduit: '~', Light: '*', GrowBed: '"', WaterTank: 'O', Pipe: '~', Reclaimer: 'R', Fabricator: 'F',
  MachineShop: 'M', SalvageRecycler: 'Y', Radiator: '=', Bed: 'b', Table: 't', Chair: 'h',
  MedBed: 'd', MedCabinet: 'C', Locker: 'L', Desk: 'D', PlantPot: 'P', Telescope: 'x',
  IceMelter: 'I', CryoPod: 'K', Heater: 'E',
});

/**
 * `GlyphMapper.DeviceGlyph`'s STATE OVERRIDES, for the one state bit the wire actually carries.
 *
 * `Device.IsOpen` is tuple element 6 of the `devices` channel and is the SAME field the mapper reads
 * to choose `'k'` from `'K'` and `'/'` from `'+'` — so this reads a published fact rather than
 * re-deriving a rule. `'/'` is here as itself, NOT as an empty string: an open doorway is a gap, and
 * the decision that a gap draws nothing already lives in `items/glyph-map.js` (ledgered by name as
 * `NO_DEVICE_GLYPH_ART`), where `itemIdForGlyphChar('/')` returns `''`. Writing `''` here would be a
 * second copy of that decision in a second file, which is the hand-mirror defect this module's own
 * `ROLE_TO_ITEM` note exists to warn about.
 *
 * ⚠️ FILED, NOT FIXED: A LOCKED DOOR UNDER A PAWN DRAWS AS A CLOSED ONE. `DeviceGlyph` has THREE
 * door states (`'X'` locked, `'/'` open, `'+'` shut) and the channel carries only `open`, so the
 * third is not on the wire and this fallback cannot see it. A degradation of one occluded tile's
 * art, not a regression: before this fix the door vanished entirely.
 */
export const DEVICE_OPEN_GLYPH = Object.freeze({ CryoPod: 'k', Door: '/' });

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The itemId a `devices`-channel row's tile should wear, or `''` when nothing should be drawn.
 * PURE and tolerant: an unknown kind byte, a missing row and a glyph nothing skins all answer `''`.
 * @param {{kind:number, open:number}|undefined} row a `roomDeviceConditions` / `deckDeviceConditions` value
 * @returns {string} an itemId in `ITEMS`, or ''
 */
export function itemForDeviceRow(row) {
  if (!row) return '';
  const name = DEVICE_KIND_NAMES[row.kind | 0];
  if (!name) return '';
  const glyph = (row.open | 0) && hasOwn(DEVICE_OPEN_GLYPH, name)
    ? DEVICE_OPEN_GLYPH[name]
    : DEVICE_REST_GLYPH[name];
  return typeof glyph === 'string' ? itemIdForGlyphChar(glyph) : '';
}

/**
 * The in-room furniture cells → item placements (VS-Z-19). Each non-floor/wall cell inside the room
 * rect on the room's deck becomes `{tx, ty, itemId, code}`; an unmapped glyph carries `itemId:''`
 * (the caller draws the unknown chip). Fog/blank cells are dropped. PURE.
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @param {Map<string,object>} [deviceCond] the `devices` channel by "tx,ty" — OPTIONAL, and it is
 *   what lets a tile a crew member is standing on keep its device (see `itemForDeviceRow`). Rows it
 *   restores carry `occluded: true`, so a caller can tell "the frame said so" from "the channel did".
 * @returns {{tx:number, ty:number, itemId:string, code:number, occluded?:boolean}[]}
 */
export function roomCells(frame, focusRoom, deviceCond) {
  const out = [];
  if (!frame || !focusRoom || !Array.isArray(frame.cells)) return out;
  if ((frame.deck | 0) !== (focusRoom.deck | 0)) return out;
  const dev = deviceCond instanceof Map ? deviceCond : new Map();
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (let ty = Math.max(0, ry); ty < Math.min(frame.h | 0, y1); ty++) {
    for (let tx = Math.max(0, rx); tx < Math.min(frame.w | 0, x1); tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0] | 0;
      if (NON_FURNITURE.has(code)) {
        // A PAWN IS NOT A REASON TO UNBUILD A MACHINE — see the fallback's header above. `deviceCond`
        // is optional so every other caller and every existing test keeps its two-argument shape;
        // without it this branch simply cannot fire and the behaviour is exactly what it was.
        if (code !== CITIZEN_GLYPH_CODE) continue;
        const itemId = itemForDeviceRow(dev.get(tx + ',' + ty));
        if (!itemId) continue;
        out.push({ tx, ty, itemId, code, occluded: true });
        continue;
      }
      out.push({ tx, ty, itemId: itemForGlyph(code), code });
    }
  }
  return out;
}

/**
 * ⭐ THE TILE A CREW MEMBER'S FEET ARE DRAWN IN — `Math.round` of the glide position, falling back
 * to the integer sim tile when the host publishes no glide. PURE.
 *
 * <p><b>`Math.round` IS THE EXACT ANSWER HERE, NOT AN APPROXIMATION OF ONE, and the whole of
 * `roomCrew` below rests on that.</b> `scenePlacement.foot(fx,·)` returns
 * `P((fx − rx)·cm + cm/2, …)`, while tile `T`'s floor quad spans `[(T − rx)·cm, (T − rx + 1)·cm]`.
 * The foot lies inside tile `T`'s quad exactly when `T ≤ fx + 0.5 ≤ T + 1`, i.e. when
 * `|T − fx| ≤ 0.5` — which is the definition of `T = Math.round(fx)`. So the drawn feet are ALWAYS
 * inside the quad of the tile this function names, with equality only when they stand on the
 * quad's own edge. Truncation (`| 0`) would name the wrong tile for the whole second half of every
 * step, which is mutation M15.</p>
 */
export function drawnTile(c) {
  if (!c) return { x: 0, y: 0 };
  return {
    x: Math.round(Number.isFinite(c.fx) ? c.fx : (c.x | 0)),
    y: Math.round(Number.isFinite(c.fy) ? c.fy : (c.y | 0)),
  };
}

/**
 * The crew standing in the room (VS-Z-27) — the list the cutaway DRAWS, the `N HERE` caption counts,
 * and the dock's HERE flag is taken from. Roster entries on the room's deck whose feet land inside
 * the rect. PURE.
 *
 * ⭐⭐ <b>MEMBERSHIP IS THE DRAWN TILE, NOT THE SIM TILE, AND THAT IS A CORRECTION — the first draft
 * of the pawn glide used the sim tile here and it put a crew member ON A WALL.</b> Review measured
 * it on `--ship wreck`: 14 of 319 live frames (4.4%) drew a figure outside the focused room's floor,
 * with a screenshot of Rell standing on the CRYO BAY'S BACK WALL at wire `5,7|5,7.8`. Both halves
 * were wrong, in opposite directions, because the sim takes its tile step FIRST and pays for it over
 * the next `ticksPerTile` ticks:
 *   · ENTERING (`x:4, fx:3.1`) — the sim tile was already inside, so she was drawn, 0.4 tile OUTSIDE
 *     the room quad. The cutaway has no floor there; the only thing to stand on is the back wall.
 *   · LEAVING (`x:7, fx:6.1`) — the sim tile was already outside, so she VANISHED from the cutaway
 *     while her body was still a full tile inside it, and the hit test at her drawn tile returned
 *     null: a figure you can see and cannot click.
 *
 * <b>Deciding on the drawn tile closes both, and closes them by CONSTRUCTION rather than by a
 * clamp:</b> `drawnTile` names the tile whose quad contains the feet (see its header), so if that
 * tile is in the room then the feet are on the room's floor — there is no position a member can
 * occupy that is off the floor, and no clamp is needed to keep her on it. Leaving, she stays drawn
 * until her body crosses the threshold; entering, she appears as it crosses, standing on the room's
 * edge, and slides in from there. She is never drawn where there is nothing to stand on.
 *
 * <b>The two-source rule is PRESERVED, which is why this is one function and not two.</b>
 * `shipCrewRows`'s HERE flag and `_capHere` both read this list, so "HERE" still means exactly what
 * the pawn layer draws — the invariant that comment has always claimed. What does NOT follow the
 * glide is anything that is a SIM fact rather than a drawing: `crewClickTarget` addresses the host
 * by `frame.crew`'s integer tile (the host resolves a click through `Citizen.Pos`, so it must), and
 * `crewRoomSlot` answers "which room do I navigate to" off the sim tile. See `pawn-glide.test.js`.
 *
 * @param {Array|null} crew  roster crew list
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 */
export function roomCrew(crew, focusRoom) {
  const out = [];
  if (!Array.isArray(crew) || !focusRoom) return out;
  for (const c of crew) {
    if (!c || (c.deck | 0) !== (focusRoom.deck | 0)) continue;
    const d = drawnTile(c);
    if (clampTileToRoom(d.x, d.y, focusRoom)) out.push(c);
  }
  return out;
}

/**
 * ⭐ WHO DID THE PLAYER JUST CLICK — the Room Zoom's pawn hit test, which resolves a FLOOR TILE
 * (`tileFromCanvasXY`) rather than a DOM element, and therefore had to learn about the glide.
 *
 * <p>⚠️ IT WAS A REGRESSION THE MOMENT THE FIGURES STARTED SLIDING, and the affordance it breaks is
 * the one the owner reported by name at the 2026-07-29 playtest (<i>"we cannot select a pawn by
 * clicking on him"</i>). The sim takes a tile step FIRST and pays for it over the next
 * `ticksPerTile` ticks, so mid-walk `c.x`/`c.y` is ALREADY the destination while the body is still
 * drawn on the tile behind it. A hit test that only asked `c.x === tile.x` therefore missed the
 * figure the player was aiming at for up to a full second per tile, and selected her by clicking
 * the empty tile ahead of her. Measured live on `--ship wreck`: the roster published
 * `tile=(7,2) frac=(8,2)` — a whole tile apart.</p>
 *
 * <p><b>ONE RULE, ONE PASS, NO SIM-TILE FALLBACK.</b> The candidates are `roomCrew`, which is the
 * DRAWN list, and the tile matched is `drawnTile`. An earlier draft added a second pass on the sim
 * tile "as a fallback"; it is deleted, because with `roomCrew` deciding on the drawn tile that pass
 * could only ever fire for a figure that is NOT DRAWN on the clicked tile — selecting an invisible
 * pawn from bare floor. A crew member with no glide at all is unaffected: `drawnTile` falls back to
 * her sim tile, so the pre-glide behaviour is reproduced exactly.</p>
 *
 * <p>⚠️⚠️ <b>THIS HEADER USED TO SAY "YOU CAN CLICK EXACTLY WHAT YOU CAN SEE", AND SINCE THE
 * CLIENT-SIDE TWEEN (2026-08-05) THAT SENTENCE IS FALSE OF THIS FUNCTION.</b> It is true of the
 * SAMPLE — this matches the tile of the newest thing the host said — and the client now deliberately
 * draws the figure BETWEEN the last two samples, so for most of every render interval the body is
 * standing one tile short of what this function answers, and on a HELD ship it stays there for as
 * long as the player leaves it held. Independent review measured `round(drawn) != round(sample)` on
 * <b>11.0% of moving frames</b>, and a held-ship click drive at 14/17 against a base client's 11/12.
 * <b>The fix is not in here.</b> A pure model cannot know where a view's interpolator has drawn
 * anything, and it must not: this function is also the answer for a client with no tween, for the
 * first repaint of a room, and for `prefers-reduced-motion` (where the tween reads at `u = 1` and the
 * two agree exactly). `roomzoom-view.js` asks its OWN tween first — `crewDrawnAtTile`, at the same
 * clock reading `placePawns` writes with — and falls back to this. The claim that survives here is
 * the narrower and still load-bearing one: <b>this never selects somebody the room has not
 * admitted.</b></p>
 *
 * @param {Array|null} crew roster crew list @param {object} focusRoom the room rect
 * @param {number} tx @param {number} ty absolute sim tile under the pointer
 */
export function crewHitAtTile(crew, focusRoom, tx, ty) {
  const x = tx | 0, y = ty | 0;
  for (const c of roomCrew(crew, focusRoom)) {
    const d = drawnTile(c);
    if (d.x === x && d.y === y) return c;
  }
  return null;
}

/**
 * WHICH BOUND ROOM a crew member is standing in, anywhere on the ship — `{anchor, slotIndex, deck,
 * displayName}` — or `null` when they are in a hall, in an unbound slot, or on a deck the `decks`
 * channel has not described. PURE.
 *
 * It is the inverse of `roomCrew`: that answers "who is in THIS room", this answers "which room is
 * THIS person in", and the crew dock needs both — one to mark a row HERE, the other to know where
 * clicking a row should take you.
 *
 * WHY THE SLOT TEST IS `!s.occupied || !s.anchorName`. `deckSlotView` emits a slot for EVERY hall
 * position, bound or not, so an unbound slot is a rect a crew member can legitimately be standing
 * inside. Accepting one would hand the caller a navigation target with an empty anchor, and
 * `roomTileRect` — which is what the caller passes it to — looks a room up BY anchor name and would
 * answer `null` on the very next call: a dock row whose click goes nowhere and says nothing.
 *
 * ⚠️ THE SENTENCE THAT STOOD HERE HAS NOW BEEN WRONG TWICE, AND THE SECOND TIME WAS THIS PACKAGE'S
 * OWN DOING. It first read *"`occupied` IS PART OF THE TEST, not decoration"*, which overstated it;
 * the correction that replaced it cited *"`--ship wreck` 13 of 16 slots and `--ship grid` 51 of 64
 * are unoccupied"* — **a PRE-M1-L census, quoted inside the package that falsifies it.**
 *
 * **RE-DERIVED ON THE MERGED TREE (2026-07-29). THE TRUE FIGURE IS `0` OF 16 AND `0` OF 64.**
 * Occupancy is geometry now, so every slot on every shipped ship reports `occupied:true` with a
 * non-blank anchor — measured off the committed live capture `client/test/fixtures/decks-wreck.json`
 * (16 slots, 0 unoccupied, 0 blank anchor) and, for grid, driven through a live host by
 * `tests/Perilune.Tests/EveryCompartmentIsARoomTests.Grid_EverySlotOnEveryDeckLeavesTheHostOccupiedAndNamed`
 * (64/64 occupied, 64/64 named).
 *
 * ⇒ **NEITHER HALF OF THIS CONDITION CAN BITE ON THE LIVE WIRE ANY MORE — the whole test is inert
 * on today's host, not merely redundant.** That is a stronger statement than the one it replaces and
 * it is said out loud rather than left as a comfortable "either half suffices". The test is kept
 * deliberately, as FUTURE-PROOFING for a host that emits an unbound slot again (the two flags are
 * computed separately, and `ResolveSlot`'s early return still returns `false`), and
 * `client/test/zoom-pawn.test.js` pins each half with its own fixture so that day cannot arrive
 * silently. **All three of those fixtures are now HYPOTHETICAL shapes — none of them is evidence
 * about the wire as it stands.**
 *
 * @param {Array<{deck:number, slots:Array}>|null} dView  decksView output
 * @param {{deck:number, x:number, y:number}|null} crewEntry  one roster row
 * @returns {{anchor:string, slotIndex:number, deck:number, displayName:string}|null}
 */
export function crewRoomSlot(dView, crewEntry) {
  if (!Array.isArray(dView) || !crewEntry) return null;
  const deck = crewEntry.deck | 0, x = crewEntry.x | 0, y = crewEntry.y | 0;
  for (const d of dView) {
    if (!d || (d.deck | 0) !== deck || !Array.isArray(d.slots)) continue;
    for (const s of d.slots) {
      if (!s || !s.occupied || !s.anchorName) continue;
      const r = s.rect || {};
      const rx = r.x | 0, ry = r.y | 0;
      if (x < rx || x >= rx + (r.w | 0) || y < ry || y >= ry + (r.h | 0)) continue;
      return {
        anchor: s.anchorName, slotIndex: s.slotIndex | 0, deck,
        // M1-L review: `|| s.anchorName` DELETED — see `roomTileRect`. `anchor` still carries the id
        // (it is the wire key the Room Zoom looks up); `displayName` must never become one.
        displayName: s.displayName || '',
      };
    }
  }
  return null;
}

/**
 * THE ROOM ZOOM'S CREW DOCK — one row per soul ABOARD, in roster order, each carrying whether they
 * are in the focused room, whether they are the selected crew member, and where to go to find them.
 * PURE (no DOM, no wire, no formatting — the view applies `surnameOf`/`watchTask`, exactly as the
 * Overview's CREW WATCH does, so the two docks cannot come to word one roster row two ways).
 *
 * ⭐ IT IS THE WHOLE SHIP, NOT THE ROOM, AND THAT IS THE DECISION THIS FUNCTION EXISTS TO RECORD.
 * The alternative — list only `roomCrew(...)` — was rejected for two reasons and one of them is the
 * owner's report itself:
 *   1. The report is *"we also lost the pawn we selected at the ship level"*. A dock that lists only
 *      the current room CANNOT show a crew member selected on the Overview who is standing anywhere
 *      else, so on the exact complaint it would still read as "she is gone".
 *   2. RimWorld's own answer is the COLONIST BAR: every colonist on the map, always, regardless of
 *      where the camera is, and clicking one selects them and moves the camera to them. This is the
 *      analogue the owner asked for by standing directive.
 * THE COST, STATED RATHER THAN HIDDEN: the dock is as long as the crew, so on a full ship it is a
 * taller island than a room-scoped list would be, and it raises the question a room-scoped list
 * never has to answer — "what does clicking someone in another room do?". The answer is RimWorld's:
 * `anchor`/`slotIndex` are what the click NAVIGATES to, and a crew member in a hall (no bound room)
 * carries `anchor: null`, which the view must treat as "select, and say where they are" rather than
 * as a dead row.
 *
 * @param {Array|null} crew  roster crew list
 * @param {Array|null} dView  decksView output (for the room lookup)
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}|null} focusRoom
 * @param {number|null} selCid  the selected crew id (`selectedCrewCid(frame)`), or null
 * @returns {{cid:*, entry:object, here:boolean, selected:boolean, anchor:string|null,
 *            slotIndex:number, deck:number, roomName:string|null}[]}
 */
export function shipCrewRows(crew, dView, focusRoom, selCid) {
  const list = Array.isArray(crew) ? crew : [];
  // `roomCrew` rather than a second rect test: HERE must mean exactly what the pawn layer draws,
  // and that layer is `pawnSvg(roomCrew(...))`. A row marked HERE beside a room with no such pawn in
  // it is the kind of two-source disagreement this file's other clamps exist to prevent.
  const here = new Set(roomCrew(list, focusRoom).map((c) => String(c.cid)));
  const sel = selCid == null ? null : String(selCid);
  const out = [];
  for (const c of list) {
    if (!c || c.cid == null) continue;
    const key = String(c.cid);
    const room = crewRoomSlot(dView, c);
    out.push({
      cid: c.cid,
      entry: c,
      here: here.has(key),
      selected: sel !== null && key === sel,
      anchor: room ? room.anchor : null,
      slotIndex: room ? room.slotIndex : -1,
      deck: c.deck | 0,
      roomName: room ? room.displayName : null,
    });
  }
  return out;
}

/**
 * The pending build designations inside the room (VS-Z-30). Design cells
 * `[x, y, deck, kind, delivered, required]` on the room's deck inside the rect → objects. PURE.
 * @param {Array|{cells:Array}|null} designs
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{x:number,y:number,kind:number,delivered:number,required:number}[]}
 */
export function roomDesigns(designs, focusRoom) {
  const cells = Array.isArray(designs) ? designs : (designs && designs.cells) || [];
  const out = [];
  if (!focusRoom) return out;
  for (const c of cells) {
    if (!Array.isArray(c) || (c[2] | 0) !== (focusRoom.deck | 0)) continue;
    if (!clampTileToRoom(c[0] | 0, c[1] | 0, focusRoom)) continue;
    // element 6 (material) is APPEND-ONLY — absent on old hosts → 0 (default skin).
    out.push({ x: c[0] | 0, y: c[1] | 0, kind: c[3] | 0, delivered: c[4] | 0, required: c[5] | 0, material: c[6] | 0 });
  }
  return out;
}

/**
 * The cosmetic decor pieces inside the room (VS-Z-34). Accepts both the wire shape
 * ({deck,x,y,itemId,…}) and the local view shape ({deck,x,y,itemId}); clamps to the rect + deck.
 * PURE.
 * @param {Array|null} decor
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 */
export function roomDecor(decor, focusRoom) {
  const out = [];
  if (!Array.isArray(decor) || !focusRoom) return out;
  for (const d of decor) {
    if (!d || (d.deck | 0) !== (focusRoom.deck | 0)) continue;
    if (clampTileToRoom(d.x | 0, d.y | 0, focusRoom)) out.push(d);
  }
  return out;
}

/**
 * The in-room wall/floor MATERIAL tiles to skin (C4). Every wall glyph ('#') inside the room rect
 * becomes a `{tx,ty,kind:'wall',mat}` (so built partitions render with their material — default 0
 * when absent from the sparse `materials` channel); a floor glyph ('.') is emitted ONLY when it
 * carries a non-default material. `materials` is the decoded sparse channel [{x,y,deck,kind,mat}].
 * PURE — never mutates its arguments.
 *
 * ⭐ THE OWNER'S DEFECT, 2026-08-05: *"when building e.g. a mat or carpet, as soon as the pawn
 * stands on the corresponding square, the carpet disappears until the pawn is out of the square."*
 * CONFIRMED, and it is the LITERAL SIBLING of the device-occlusion defect the fallback block above
 * (`roomCells` / `itemForDeviceRow`) closed the same day — same cause, same passes, same remedy:
 *
 *   `GlyphMapper` writes ONE glyph per tile in six passes and later passes overdraw earlier ones.
 *   Pass 1 writes the terrain ('.'/'#'); PASS 5 WRITES `Glyphs.Citizen` OVER THE WHOLE CELL
 *   UNCONDITIONALLY (`sim/Sim.Glyph/GlyphMapper.cs:183-195`, only `Bg` and `Attr` survive). So a
 *   materialed floor with a crew member on it carries code 64, matched NEITHER of the two arms
 *   below, and the carpet left the drawing until she moved.
 *
 * ⚠️ AND IT FIRES ON A PAWN MERELY WALKING PAST, which the owner's wording understates —
 * `CitizenSystem.cs:51-54` snaps `citizen.Pos` to the DESTINATION tile the instant a step begins and
 * holds it there for the whole `ticksPerTile` while the presenter interpolates, so the carpet is
 * blanked for the ~1 s traversal, starting before she is visibly on the tile.
 *
 * ⛔ THE `materials` CHANNEL IS THE AUTHORITY; THE GLYPH ONLY EVER GATED VISIBILITY — SO THERE IS
 * NO STALE GHOST. Every answer below still comes from the CURRENT frame's `materials` payload
 * (`GameSession.BuildMaterials` re-walks `level.Material` each render and drops every `mat == 0`
 * tile), so a floor whose material is reset or whose tile is unbuilt vanishes at once, pawn or no
 * pawn — it is not a "remember the last glyph here" memo, which would leave a ripped-up carpet on
 * screen forever. Pinned by its own leg in `room-model.test.js`.
 *
 * ⛔ AND THE CITIZEN ARM READS THE CHANNEL'S OWN `kind` BYTE, NOT "floor by construction". The
 * channel carries wall-vs-floor per tile from `level.Wall[idx]` — the SAME world plane pass 1 reads
 * to choose '#' over '.' — so the occluded tile is classified by the authority the visible tiles are
 * classified by, one step removed, instead of by an assumption about where pawns can stand. (The
 * assumption happens to hold — a wall tile is not `TileFlags.Walkable` and `PathService` routes only
 * over walkable tiles, so a citizen glyph can never mask glyph 35 — but a rule that is true is still
 * weaker than a fact that is published, and this way the arm cannot rot if that ever changes.)
 *
 * ⛔ NARROW ON PURPOSE, exactly as `CITIZEN_GLYPH_CODE`'s own doc-comment says: pass 5 is the ONE
 * overwrite repaired here. Pass 3 (ground items) and pass 4 (devices) also overdraw a materialed
 * floor and are NOT repaired by this — a stack or a bed standing on a carpet still shows default
 * floor around its sprite. Measured, not assumed (`room-model.test.js` drives a 'b' over a
 * materialed tile and asserts the drop), and FILED rather than chased: those two are a different
 * package, they are far less visible than a pawn walking through, and widening this arm to "any
 * non-default channel entry emits" would have to re-answer the wall/floor precedence the two
 * frame-driven arms below settle.
 *
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @param {Array<{x:number,y:number,deck:number,kind:number,mat:number}>|null} materials
 * @returns {{tx:number,ty:number,kind:'wall'|'floor',mat:number,occluded?:boolean}[]}
 */
export function roomMaterialTiles(frame, focusRoom, materials) {
  const out = [];
  if (!frame || !focusRoom || !Array.isArray(frame.cells)) return out;
  if ((frame.deck | 0) !== (focusRoom.deck | 0)) return out;
  const matAt = new Map();
  if (Array.isArray(materials)) {
    for (const m of materials) {
      // The ROW, not just the byte: the citizen arm below needs the channel's own wall/floor `kind`.
      if (m && (m.deck | 0) === (focusRoom.deck | 0)) matAt.set((m.x | 0) + ',' + (m.y | 0), m);
    }
  }
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (let ty = Math.max(0, ry); ty < Math.min(frame.h | 0, y1); ty++) {
    for (let tx = Math.max(0, rx); tx < Math.min(frame.w | 0, x1); tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0] | 0;
      const row = matAt.get(tx + ',' + ty);
      const mat = row ? (row.mat | 0) : 0;
      if (code === 35) out.push({ tx, ty, kind: 'wall', mat });          // '#' wall → always skinned
      else if (code === 46 && mat) out.push({ tx, ty, kind: 'floor', mat }); // '.' floor → only if non-default
      // `row &&` is not redundant with `mat` — it is written out because a later edit that widens
      // this arm must not reach `row.kind` through an absent row. (Measured: dropping only `&& mat`
      // made the no-row leg die by TypeError instead of by assertion — a FALSE RED, TRAPS 3.)
      else if (code === CITIZEN_GLYPH_CODE && row && mat) {
        // A PAWN IS NOT A REASON TO TAKE UP THE CARPET — see this function's header. The channel says
        // what the tile is made of AND whether it is wall or floor; the frame lost only the terrain
        // glyph. `mat` is still required, so a pawn on a DEFAULT floor adds nothing (the same
        // non-default rule the '.' arm above obeys), and `occluded` lets a caller tell "the frame
        // said so" from "the channel did", exactly as `roomCells` marks its restored devices.
        out.push({ tx, ty, kind: (row.kind | 0) === 0 ? 'wall' : 'floor', mat, occluded: true });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DEBRIS + DESIGNATION MARKS (console-retirement WP-2; re-sourced by the `marks` channel).
//
// ⚠️ THE HEADING SENTENCE IS NOW FALSE AND IS KEPT QUOTED: *"The one place in this file that reads
// `cell[1]` — the projected `GlyphColor` foreground byte — rather than `cell[0]`."* This file reads
// NO byte for marks any more. `GlyphMapper` writes the mark colour into `cell[1]` in pass 1 and then
// overwrites it in pass 3 (ground items), pass 4 (devices) and pass 5 (citizens), so the mark layer
// was an honest view of the FRAME and a lossy view of the SIM. The kinds now arrive on the `marks`
// wire channel, read from `TileFlags.Designated` / `TileFlags.Stockpile` / the `DeconstructSystem`
// registry / the terrain planes. See `hosts/web/WireFormat.Marks.cs`.
//
// WHY IT IS A LAYER OF ITS OWN and not a fix to `roomCells`. Every debris and dig-designation cell
// in the shipped capture carries glyph code 37 (`'%'`), which is in `NON_FURNITURE` above, so
// `roomCells` skips it — and it must keep skipping it.
//
// ⚠️ THE FIRST DRAFT OF THIS COMMENT GAVE THE WRONG REASON, and it is quoted here rather than
// deleted so that anyone who grepped the old wording lands on the correction. It said removing 37
// from `NON_FURNITURE` would *"push debris through `SPRITE_FOR_GLYPH`/`ROLE_TO_ITEM` (which have no
// mapping for it, so it would still draw nothing) while silently reclassifying the tile for
// `roomCells`' two other readers, `itemForGlyph` and `demolishTarget`'s device branch."* **All three
// clauses are false, measured by physically removing 37 from the set** (independent review):
//   • it does NOT "still draw nothing" — it draws THIRTY-THREE pieces of junk. `roomCells` then
//     emits 33 cells at code 37 with `itemId:''`, and `furnitureSvg`'s else-branch
//     (`roomzoom-view.js:429-438`) renders the VS-Z-25 dashed "unknown" chip for each, carrying a
//     literal `%` glyph. That is the OPPOSITE of the claim, in the very file the claim was in.
//   • `itemForGlyph(37)` returns `''` either way — no item claims the glyph `'%'` (then: there was
//     no `'%'` key in `SPRITE_FOR_GLYPH`, `render/glyphs.js:13-19`), so it is UNCHANGED, not
//     reclassified.
//   • `demolishTarget` at such a tile returns `{kind:'empty', verb:null}` either way — its device
//     branch (below) requires a truthy `itemForGlyph(code)`, and 37 is not in `STRUCTURE_CODES`.
//     Also UNCHANGED.
// THE TRUE REASON IS STRONGER: loosening the set does not merely fail to draw debris, it fills the
// wreck with 33 dashed unknown-glyph chips — a worse lie than invisibility, because a chip claims
// "something here we do not skin yet" about a tile whose meaning the client knows perfectly well.
// The mark layer instead keys on nothing in the frame at all, which is also what makes it work for a
// strip mark on a WALL (code 35, likewise `NON_FURNITURE`) — a case no amount of furniture
// reclassification could reach. (That clause used to read *"keys on the fg byte alone and never on
// the glyph"*; the conclusion survived the re-sourcing, the mechanism did not.)
//
// NOTE THE TWO SURFACES DIFFER HERE, and the mirrored comment in `overview-scene.js` is correct for
// its own file: `furnitureLayer` does `if (!itemId) continue`, so on the Overview an unmapped glyph
// really does draw nothing. The Room Zoom has an unknown-chip fallback and the Overview does not.
//
// The mark vocabulary itself — what each mark looks like — is `mark-overlay.js`, shared verbatim
// with the Level-1 Overview so one mark kind cannot come to mean two different things on the two
// surfaces. The wire kind → name table is `wire/messages.js` (`MARK_KIND_NAMES`), mirroring
// `hosts/web/WireFormat.Marks.cs`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The debris / designation marks inside the room (WP-2). Every in-rect, on-deck cell of the decoded
 * `marks` channel becomes `{tx, ty, mark, kind}`; everything else is dropped. PURE.
 *
 * ⚠️ IT NO LONGER READS THE FRAME. The old contract is quoted and negated so a grep for it lands
 * here: *"Every in-rect, on-deck cell whose fg byte carries a mark becomes `{tx, ty, mark, fg,
 * code}`"* and *"this function's job is to say what the FRAME contains"*. Both are FALSE since the
 * `marks` channel. `fg` and `code` are gone from the output with the source they came from — they
 * were the projected `cell[1]`/`cell[0]` bytes, and `cell[1]` is exactly the lossy byte this channel
 * replaces (`GlyphMapper` passes 3/4/5 overwrite it for a ground item, a device and a standing crew
 * member). Nothing outside the tests ever read them.
 *
 * IT REPORTS ALL FOUR KINDS, INCLUDING STOCKPILE, even though `markLayerSvg` draws only three — and
 * this reason is UNCHANGED and now stronger. The function's job is to say what the SIM contains, and
 * a derivation that silently omits one of the four kinds is a derivation whose output cannot be
 * trusted as a census: a caller asking "is this tile already spoken for?" (WP-4's DIG and STRIP
 * sweeps both must, and so must anything that comes to explain a tile in the readout) would get "no"
 * for a zoned tile. The drawing decision belongs to the layer that draws, and it is made there.
 * @param {{x:number,y:number,deck:number,kind:number,mark:string}[]|null} marks  decodeMarks() output
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{tx:number, ty:number, mark:string, kind:number}[]}
 */
export function roomMarkTiles(marks, focusRoom) {
  const out = [];
  if (!Array.isArray(marks) || !focusRoom) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (const m of marks) {
    if (!m || (m.deck | 0) !== (focusRoom.deck | 0)) continue;
    const tx = m.x | 0, ty = m.y | 0;
    if (tx < rx || tx >= x1 || ty < ry || ty >= y1) continue;
    out.push({ tx, ty, mark: m.mark, kind: m.kind | 0 });
  }
  return out;
}

/**
 * The Room Zoom's mark layer as one SVG string in room-local logical units (`U` per tile), or ''.
 * PURE — a string builder, no DOM, so the gate can see it draw (the `zone-overlay.js` lesson: a
 * builder that lives inside the view can be made to return '' with the whole suite still green).
 *
 * STOCKPILE MARKS ARE DELIBERATELY NOT DRAWN HERE, and this is the one place the two surfaces
 * differ in output. WP-3 already paints this room's stockpile tiles from the `zones` wire channel
 * (`zone-overlay.js` `zoneLayerSvg`, called one line above this layer in `roomzoom-view.js`), and
 * drawing both would stack two slate tints on the same tile.
 *
 * ⚠️ HALF THE OLD REASON HAS EXPIRED, and it is quoted rather than deleted because it is the exact
 * claim the `marks` channel falsifies: *"that source is strictly better: it survives an item being
 * stored on the tile (which overwrites `cell[1]`) and it carries the RESTRICTED and BACKED-OFF
 * states this byte cannot express."* The first half is NO LONGER A DIFFERENCE — a `marks` stockpile
 * cell survives a stored item, a device and a standing crew member exactly as `zones` does, because
 * neither rides the projection now. The second half stands and is the whole surviving reason:
 * `zones` carries the per-tile accept mask and the haul back-off bit, and this layer's vocabulary has
 * no way to say either. `roomMarkTiles` still REPORTS the mark, so nothing is hidden from a caller.
 * (If a later package replaces the zone layer wholesale, delete this filter with it.)
 *
 * @param {{tx:number, ty:number, mark:string}[]} marks  roomMarkTiles output
 * @param {{rx:number, ry:number}} focusRoom  the room rect's origin, for the local transform
 * @param {number} [unit]
 * @returns {string}
 */
export function markLayerSvg(marks, focusRoom, unit = U, place = null) {
  if (!Array.isArray(marks) || !marks.length || !focusRoom) return '';
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const out = [];
  for (const m of marks) {
    if (!m || m.mark === 'stockpile') continue; // WP-3's zoneLayerSvg owns this tile — see above
    // VR-P3 — A MARK IS PAINT ON THE FLOOR, so it goes in the FLOOR PLANE: the unit cell is built at
    // the origin and mapped onto the tile's projected parallelogram by `place.cell`. With no `place`
    // the cell is laid out plan-style at its tile offset, which is what the Level-1 Overview's own
    // `markCellSvg` call does and what every isolated model test drives — the two are the same
    // vocabulary at two altitudes, which is the whole reason `mark-overlay.js` is a shared module.
    const at = place ? [0, 0] : [(m.tx - rx) * unit, (m.ty - ry) * unit];
    const cell = markCellSvg(m.mark, at[0], at[1], unit, unit, markVariant(m.tx, m.ty));
    if (!cell) continue;
    out.push(place ? '<g transform="' + place.cell(m.tx, m.ty) + '">' + cell + '</g>' : cell);
  }
  return out.length ? '<g class="rz-marks" pointer-events="none">' + out.join('') + '</g>' : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE GROUND ITEM LAYER (the `items` channel).
//
// WHAT IT REPLACES. A ground stack used to reach this surface as ONE CHARACTER, via the frame's
// glyph byte, and `roomCells` → `furnitureSvg` rendered it as the VS-Z-25 dashed "unknown" chip
// carrying that raw letter — `,` for Regolith, `f` for Potato, and seven more. Independent review
// photographed exactly that on `--ship grid` deck 0, room STORAGE: seven dashed boxes with ASCII in
// them, in the shipping game (`client/test/device-sprite-coverage.test.js`, NO_GROUND_ITEM_SPRITE).
//
// THE LETTER BOX WAS NOT MERELY UGLY, IT WAS LOSSY THREE WAYS, and none of the three could have been
// fixed by drawing better art:
//   1. NO COUNT. `GlyphMapper` pass 3 never writes `ItemStack.Count`, so a stack of 1 and a stack of
//      40 are the byte-identical cell. The number was not on the wire to render.
//   2. TOPMOST ONLY. Pass 3 ASSIGNS the cell per item, and the sim never merges stacks, so N stacks
//      on one tile collapse to whichever is last in store order.
//   3. DEVICES ERASE ITEMS. Pass 4 writes the device glyph to the same cell unconditionally,
//      AFTERWARDS, and every device kind is non-blocking — so a stack on a machine's tile was drawn
//      nowhere at all.
// The fix is the channel, not a better reader (`hosts/web/WireFormat.Items.cs`), which is the same
// lesson the `marks` channel recorded one package earlier.
//
// ⚠️ THE PARAGRAPH THAT STOOD HERE IS NOW HISTORY AND IS QUOTED, BECAUSE THE THING IT DESCRIBES IS
// WHAT CHANGED: *"THIS IS NOT THE GROUND-ITEM ART PACKAGE… There is still no ground-pile piece in the
// warm 60-piece set, so what this layer draws is a LABEL PLATE — kind and count in words and digits —
// not a sprite."* THE ART LANDED (2026-07-27, the re-imported 68-piece mock), so the plate has given
// way to the piece.
//
// WHAT THE LAYER DRAWS NOW, and why the count did NOT go with the plate. The channel exists to carry
// the one fact no projection byte could ever hold — a stack of 1 and a stack of 40 write the
// identical `GlyphCell` — so dropping the number the moment art arrived would have discarded the
// whole point of the channel. Each drawn stack is therefore SPRITE + COUNT BADGE: the piece says
// WHAT, a small dark numeral badge says HOW MANY. The badge appears only for `count > 1`; a single
// unit is what the sprite already means, and a `1` on every stack on a hold floor is noise that makes
// the numbers that matter harder to find. THERE IS NO STACK CAP IN THE SIM (the slice boots with
// stacks in the hundreds and `--strip 40` runs them up), so the badge's font is FITTED to its digits
// exactly as the plate's was — a fixed size overflows into the neighbouring tile at three digits and
// then misattributes stock to a tile that has none.
//
// THE PLATE IS NOT DELETED — IT IS DEMOTED TO THE NO-ART FALLBACK, which is why `itemKindLabel`
// survives. Two cases still have no piece to draw: `ItemKind.MetalOre`, deliberately unskinned
// (nothing in `sim/` produces or consumes it), and any kind byte a future host sends that this client
// has never heard of — which `decodeItems` deliberately KEEPS rather than dropping. Both get the old
// label chip (`ORE 12`, `? 3`). Falling back to nothing would put an empty tile over a full one,
// which is the exact invisibility this channel removes.
//
// VERIFIED IN A BROWSER, NOT ONLY IN ASSERTIONS (`client/tools/items-shot.mjs`, committed — the
// `marks-shot.mjs` rule: a perfectly formed SVG string paints nothing if its box is empty or its text
// is scaled to nothing, and the emitted bytes are identical either way). MEASURED on a live
// `--ship grid` host, deck 0, room STORAGE — the exact room independent review photographed with
// seven dashed chips carrying `,` ×6 and `f` ×1: **7 plates reading REGO 4 ×6 and FOOD 8, ZERO
// unknown-glyph chips left in the room**, the layer box 497×114 CSS px and visible, the first plate's
// text rendering **25 px tall** from an authored font-size of 6.5 viewBox units, and the item layer
// after the furniture layer in DOM order. The one thing the picture could NOT settle is loss 3 in a
// browser — there is no wire verb that spawns a stack, so a stack on a device tile is pinned by the
// driven test in `room-model.test.js` and not by a photograph.
//
// ⚠️ HALF OF THE OVERVIEW NOTE HAS EXPIRED, and it is quoted rather than deleted because the half
// that survives is the one a future lane will trip over. It read: *"THE LEVEL-1 OVERVIEW IS
// DELIBERATELY NOT CHANGED… `overview-scene.js`'s furniture layer does `if (!itemId) continue`, so a
// ground stack has always drawn NOTHING there — not a wrong thing, nothing."*
//   FALSE SINCE THE GROUND-ITEM ART (2026-07-27), and not because anything was ported: the Overview
// reads the SAME `itemIdForGlyphChar` derivation, so the moment `,`/`f`/`&` resolved to real pieces
// its furniture layer began drawing them off the FRAME. Measured in a browser on `--ship grid` deck
// 0: room STORAGE drew nothing there before and now shows its piles.
//   WHAT IS STILL TRUE, and is the KNOWN LIMIT: the Overview has no COUNT. Its art comes from the
// projection, which carries none, keeps only the topmost stack and is erased by any device on the
// tile — the three losses this channel exists to undo, still fully in force one altitude up. At its
// ~15×13 design-px tile a badge of digits is not legible, so closing that would need a different
// vocabulary (a density dot, a per-room total on the room card), which is a design question and not
// this package's. The Overview's `main.js` dispatch feeds `Hud.getItems()` all the same, so whoever
// takes that decision has the data waiting.
//
// IT SPEAKS A THIRD VISUAL LANGUAGE ON PURPOSE. Amber dashed = "an order is queued here"
// (`mark-overlay.js`, the build ghosts); slate = "a zone" (`zone-overlay.js`). Stock is neither an
// order nor a zone — it is a thing lying on the floor — so its BADGE (and the no-art label chip it
// falls back to) is a dark panel with a warm rubble-grey edge, the same grey the debris chunks use,
// because that is what loose matter looks like on both surfaces already. The pile itself now speaks a
// fourth language, which is no language at all: it is just the thing, drawn.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Round to 2dp with no `-0` — the `n()` discipline both surfaces use (InvariantCulture-safe:
 *  arithmetic + ASCII concat only, no locale API). Local rather than imported from mark-overlay.js,
 *  which does not export it. */
function n2(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }

/**
 * Kind byte → the SHORT plate label. Derived from `STOCK_KINDS` — the client's ONE mirror of the sim's
 * `ItemKind` enum, pinned member-for-member against `sim/Sim.Core/Entities/ItemStack.cs` by
 * `stock-filter-model.test.js` — so this file adds no second spelling of the enum.
 *
 * FOUR CHARACTERS, because a 32-unit tile cannot hold `CONTROLLERMODULE` and because at four the nine
 * labels are still all DISTINCT (REGO ORE CORP FOOD SCRA PART CTRL SEAL ICE). At three they are not
 * unique in spirit — `SEA`/`SCR` — and the distinctness is not an accident to be trusted silently:
 * `items-model.test.js` asserts it, so a tenth `ItemKind` whose label collides fails a test instead of
 * quietly making two piles look like one.
 */
const ITEM_LABEL = Object.freeze(Object.fromEntries(
  STOCK_KINDS.map((e) => [e.kind, e.label.replace(/\s+/g, '').slice(0, 4)]),
));

/** The plate label for a kind byte, or '?' for a kind this client has never heard of. PURE.
 *  `?` rather than dropping the row: an unknown kind is still a real, located, counted pile, and
 *  drawing an empty tile over a full one is the exact invisibility this channel removes. */
export function itemKindLabel(kind) {
  const l = ITEM_LABEL[kind | 0];
  return l === undefined ? '?' : l;
}

/**
 * The ground item stacks inside the room, AGGREGATED PER TILE AND KIND. Every in-rect, on-deck entry
 * of the decoded `items` channel is folded into its tile; within a tile, stacks of one kind are
 * SUMMED. PURE.
 *
 * WHY THE CLIENT AGGREGATES AND THE HOST DOES NOT. The wire is one row per `ItemStack`, verbatim, so
 * the channel stays a faithful census — a summed number exists nowhere in the sim, and a later
 * consumer that needs stack granularity (anything reasoning about `ItemStack.ReservedBy`) would have
 * to add a channel to get it back. Aggregation is a DISPLAY decision — a player reading a floor wants
 * "40 REGOLITH", not "7 + 20 + 13" — so it is made here, in the display layer, where it is visible and
 * node-testable.
 *
 * ORDER IS FIRST-APPEARANCE, tiles and kinds alike, inherited from the host's store order. Nothing
 * here sorts: a client sort would be a second, silently divergent authority over what "topmost" means,
 * and the host's order is the same one `GlyphMapper` pass 3 draws in.
 *
 * ⚠️ THERE IS NO `total` FIELD, and it is worth a line because there WAS one for a day. It summed
 * every unit on the tile, NOTHING in the client ever read it, and a per-tile census nobody consumes
 * is a second number that can silently disagree with `stacks` — the exact shape of the duplicate
 * authorities this package exists to collapse. A caller that wants it can `reduce` over `stacks`,
 * which is one expression and cannot drift. (Found in independent review; the field's only reader
 * was a test asserting the field.)
 *
 * @param {{x:number,y:number,deck:number,kind:number,count:number}[]|null} items  decodeItems() output
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{tx:number, ty:number, stacks:{kind:number,count:number}[]}[]}
 */
export function roomItemTiles(items, focusRoom) {
  const out = [];
  if (!Array.isArray(items) || !focusRoom) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  const byTile = new Map();
  for (const it of items) {
    if (!it || (it.deck | 0) !== (focusRoom.deck | 0)) continue;
    const tx = it.x | 0, ty = it.y | 0;
    if (tx < rx || tx >= x1 || ty < ry || ty >= y1) continue;
    const key = tx + ',' + ty;
    let tile = byTile.get(key);
    if (!tile) { tile = { tx, ty, stacks: [] }; byTile.set(key, tile); out.push(tile); }
    const kind = it.kind | 0, count = it.count | 0;
    const seen = tile.stacks.find((s) => s.kind === kind);
    if (seen) seen.count += count; else tile.stacks.push({ kind, count });
  }
  return out;
}

/**
 * Sim `ItemKind` BYTE → the warm resource itemId that skins it, or `''`. TWO derivations chained,
 * neither of them a transcription: `STOCK_KINDS` maps the byte to the C# member NAME (and is pinned
 * member-for-member against `ItemStack.cs` by `stock-filter-model.test.js`), and the `ITEMS` registry
 * maps that name to a piece (`RESOURCE_ITEM_BY_KIND_NAME`). A kind with no piece — `MetalOre`, or a
 * byte from a newer host — resolves to `''` and falls back to the label chip. PURE.
 */
const ITEM_ID_BY_KIND = Object.freeze(Object.fromEntries(
  STOCK_KINDS.map((e) => [e.kind, RESOURCE_ITEM_BY_KIND_NAME[e.name] || '']),
));

/** The warm itemId for a sim `ItemKind` byte, or `''` when nothing skins it. PURE. */
export function itemIdForStockKind(kind) {
  const id = ITEM_ID_BY_KIND[kind | 0];
  return id === undefined ? '' : id;
}

/**
 * The per-device WEAR STATE inside the room, keyed by tile. Every in-rect, on-deck row of the decoded
 * `devices` channel becomes `'tx,ty' → {tx, ty, kind, cond, oper, open}`; everything else is dropped.
 * PURE.
 *
 * ⛔ SUPERSEDED (W0b, 2026-07-28). The paragraph here read *"NOTHING DRAWS THIS YET, ON PURPOSE. The
 * join it exists for … is a SEPARATE PACKAGE against `client/src/items/`, a directory a parallel lane
 * owns."* **Both clauses are now false**, and this is the one function whose output the Room Zoom
 * actually feeds into `furnitureSvg`: `roomzoom-view.js` derives `_deviceCond` from it once per
 * repaint and hands it to the furniture layer, which asks `client/src/items/wear.js` for the piece or
 * its post-raid twin. Its deck-wide sibling `deckDeviceConditions` does the same for the Overview.
 *
 * (The identical claim was retracted in three other places in the same package and missed here, which
 * is exactly how a stale comment survives: the copies that are read get fixed and the copy that is
 * TRUE of the live path does not.)
 *
 * ⇒ `cond` FEEDS THE WRECKED-TWIN JOIN ABOVE. ⚠️ `open` — the seventh element, appended by the
 * OPERATE verb on the same day — WAS drawn by `operateLayerSvg` and by nothing else, and M3-15 (OD-N)
 * deleted that layer, so `open` is carried here with no client reader at all. It is kept for shape
 * parity with the channel and with `deckDeviceConditions` (see that function's own note); dropping it
 * would make this model a lossy view of a row the host still sends.
 *
 * A MAP AND NOT A LIST, unlike `roomMarkTiles`/`roomItemTiles`. Those two layers can legitimately hold
 * several rows per tile (an order and a zone; several stacks), so a list is their honest shape. A
 * tile-resident device is ONE PER TILE by construction — `Simulation.AddDevice` writes `_deviceGrid`
 * for every non-overlay kind and the overlays are not on this channel — so the consumer's question is
 * always "what is on THIS tile?", and a list would make every caller write the same linear scan.
 * LAST ROW WINS on the impossible duplicate, matching `GlyphMapper` pass 4, which assigns rather than
 * merges; it is not silently dropped, because a channel that disagreed with the sim about one-per-tile
 * is a fact worth being able to see rather than one to paper over.
 *
 * @param {{x:number,y:number,deck:number,kind:number,cond:number,oper:number,open:number,serv:number,air:number,spend:number}[]|null} devices
 *        decodeDevices() output
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {Map<string,{tx:number,ty:number,kind:number,cond:number,oper:number,open:number,serv:number,air:number,spend:number}>}
 */
export function roomDeviceConditions(devices, focusRoom) {
  const out = new Map();
  if (!Array.isArray(devices) || !focusRoom) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (const d of devices) {
    if (!d || (d.deck | 0) !== (focusRoom.deck | 0)) continue;
    const tx = d.x | 0, ty = d.y | 0;
    if (tx < rx || tx >= x1 || ty < ry || ty >= y1) continue;
    out.set(tx + ',' + ty, {
      tx, ty, kind: d.kind | 0, cond: d.cond | 0, oper: d.oper | 0, open: d.open | 0,
      // ⭐ M3-13 — `serv` (1 = this KIND can ever be serviced) is what `prioritiseOffer` asks before
      // it promises a repair. ⚠️ THE FALLBACK IS 1, matching `decodeDevices`: an absent value must
      // mean the OLD behaviour (menu offered), never "withdraw the verb from the whole ship".
      serv: d.serv === undefined ? 1 : (d.serv | 0),
      // ⭐ D4 — `air` (1 = a servicer could stand at this machine WITHOUT the player's order waiving
      // the air rule) is what `prioritiseOffer` asks before it promises a repair with no mention of
      // the vacuum. ⚠️ THE FALLBACK IS 1, matching `decodeDevices`: an absent value means the OLD
      // behaviour (offer with no hazard clause), never "warn on every machine aboard".
      air: d.air === undefined ? 1 : (d.air | 0),
      // ⭐⭐ `spend` (which consumable a service here would eat) is what `prioritiseOffer` asks before
      // it promises a repair the ship's last Part pays for. ⚠️ THE FALLBACK IS THE SENTINEL AND NOT A
      // KIND — the other three fall back to their OLD BEHAVIOUR and so does this one: before the
      // element existed the offer named no price, so absent means SAY NOTHING.
      spend: d.spend === undefined ? SPEND_UNKNOWN : (d.spend | 0),
    });
  }
  return out;
}

/**
 * The same layer for a WHOLE DECK — what the Level-1 Overview needs, which has no focus rect.
 *
 * ⚠️ A SEPARATE FUNCTION AND NOT A NULLABLE `focusRoom`, which was the first shape tried. A rect
 * argument that means "everything" when omitted reads at every call site as "I forgot the rect", and
 * the two surfaces would then differ by an absence rather than by a name. It is also not the Room
 * Zoom's function with a full-deck rect passed in: the Overview never has a rect to pass, and
 * inventing `{rx:0, ry:0, rw:frame.w, rh:frame.h}` at the call site would put frame geometry into a
 * device query that does not otherwise need it.
 *
 * Same key (`"x,y"`), same value shape and the same LAST-ROW-WINS rule as `roomDeviceConditions`, so
 * `client/src/items/wear.js` sees one contract from both surfaces.
 *
 * @param {{x:number,y:number,deck:number,kind:number,cond:number,oper:number,open:number,serv:number,air:number,spend:number}[]|null} devices
 *        decodeDevices() output
 * @param {number} deck
 * @returns {Map<string,{tx:number,ty:number,kind:number,cond:number,oper:number,open:number,serv:number,air:number,spend:number}>}
 */
export function deckDeviceConditions(devices, deck) {
  const out = new Map();
  if (!Array.isArray(devices)) return out;
  const dz = deck | 0;
  for (const d of devices) {
    if (!d || (d.deck | 0) !== dz) continue;
    const tx = d.x | 0, ty = d.y | 0;
    // `open` is carried for SHAPE PARITY with `roomDeviceConditions`, not because this deck-scoped
    // model has a consumer for it — and since M3-15 (OD-N) deleted the OPERATE affordance, NEITHER
    // model has one: no client surface draws OPEN⇄SHUT any more. It is here because `client/src/items/wear.js` is
    // the ONE join both surfaces call, and a field present on one model and absent on the other is
    // two contracts wearing one name: the day anything in `wear.js` keys on `open`, the Overview
    // would silently read `undefined` and draw a different picture from the Room Zoom for the same
    // machine. ⚠️ ADDED AT THE MERGE of the (since-deleted) OPERATE verb with the wear join — the
    // verb added `open` to the room-scoped model only, and `wear-join.test.js`'s shape-parity
    // assertion is what caught the divergence. The parity outlives the verb.
    // ⭐ M3-13 — `serv` is carried here for the SAME SHAPE-PARITY reason `open` is, and the reason
    // is now live rather than hypothetical: `wear.js` is the one join both surfaces call, and a
    // field present on the room model and absent on the deck model is two contracts wearing one
    // name. The Overview has no right-click repair menu, so it has no consumer today.
    out.set(tx + ',' + ty, {
      tx, ty, kind: d.kind | 0, cond: d.cond | 0, oper: d.oper | 0, open: d.open | 0,
      serv: d.serv === undefined ? 1 : (d.serv | 0),
      // ⭐ D4 — `air` is carried here for the SAME SHAPE-PARITY reason `open` and `serv` are: one
      // join (`items/wear.js`) reads both models, and a field on one and not the other is two
      // contracts wearing one name. Same 1-default as `decodeDevices`.
      air: d.air === undefined ? 1 : (d.air | 0),
      // ⭐⭐ `spend` is carried here for the SAME SHAPE-PARITY reason, with the same sentinel default
      // as `decodeDevices`. The Overview has no right-click repair menu, so it has no consumer today.
      spend: d.spend === undefined ? SPEND_UNKNOWN : (d.spend | 0),
    });
  }
  return out;
}

/**
 * ⭐ M2-10 — THE `DeviceKind` ENUM, BY INDEX: `DEVICE_KIND_NAMES[byte]` is the sim's own member name.
 * The `devices` channel carries `kind` on every row (`decodeDevices`, `wire/messages.js`), and
 * `roomDeviceConditions` keeps it — so a surface can name the machine standing on a tile from the
 * SIM'S OWN IDENTITY rather than from the picture drawn there.
 *
 * ⚠️ IT IS THE **ONE** TABLE. It absorbed `OPERABLE_KINDS` (M2-10) and then OUTLIVED it: M3-15 (OD-N)
 * deleted the OPERATE affordance and the operable pair with it, so this array is the client's only
 * mirror of `DeviceKind`. A second naming predicate beside it is the defect, not the fix.
 *
 * ⚠️ IT IS A HAND MIRROR OF A C# ENUM AND IT IS PINNED BY DERIVATION, not by this comment:
 * `client/test/prioritise-menu.test.js` PARSES `sim/Sim.Core/Entities/Device.cs` and requires this
 * array to equal every member IN ORDER, by name and by index. A renumber, an insertion, or an
 * appended member reddens there — the technique `stock-filter-model.test.js` uses on `ItemStack.cs`
 * and `palette.test.js` on `GlyphColor.cs`.
 *
 * ⚠️ WHY NAMING FROM THE ART WOULD BE WRONG, MEASURED. `itemForGlyph` resolves a tile's glyph to a
 * registry piece, and `items/glyph-map.js`'s `GLYPH_SUBSTITUTE` deliberately lets a device WEAR
 * ANOTHER PIECE'S ART where the set has no piece of its own: `WaterTank` wears `oxygen-tank`,
 * `Radiator` wears `space-heater`, `SalvageRecycler` wears `water-recycler`, `MedCabinet` wears
 * `locker`, `Light` wears `wall-lamp`, `IceMelter` wears `cooker`. A name taken from the picture is
 * therefore WRONG on all six — the sixth trap shape, stated with its receipts. (M2-10's first draft
 * did exactly that and was CONFIDENTLY wrong on FIVE of them; the sixth, `wall-lamp`, is the one
 * COSMETIC borrow, and its own `functional`-only filter happened to catch that one and say "MACHINE".
 * Measured by running the guard, not by counting this list.)
 */
export const DEVICE_KIND_NAMES = Object.freeze([
  'Door', 'AirVent', 'Scrubber', 'Ladder', 'Terminal', 'SolarWing', 'Battery', 'Conduit', 'Light',
  'GrowBed', 'WaterTank', 'Pipe', 'Reclaimer', 'Fabricator', 'MachineShop', 'SalvageRecycler',
  'Radiator', 'Bed', 'Table', 'Chair', 'MedBed', 'MedCabinet', 'Locker', 'Desk', 'PlantPot',
  'Telescope', 'IceMelter', 'CryoPod',
  // M3-10. Appended in the SAME COMMIT that appends `Heater = 28` to `Device.cs`, because
  // `prioritise-menu.test.js`'s by-name-and-index pin reads that enum and fails the instant the two
  // tables differ in length — by construction, not by risk. `Heater` is ALSO the one entry in this
  // table that is not a borrow: `ITEMS['space-heater']` has carried `deviceKind: 'Heater'` since the
  // warm set was drawn, so this is the name matching the picture for once rather than in spite of it.
  'Heater',
]);

/**
 * The sim `DeviceKind` member name for a wire `kind` byte, or `''` when the byte names nothing. PURE
 * and TOTAL — the `typeof` guard is `isOperableKind`'s, for its reason: `null | 0`, `undefined | 0`
 * and `NaN | 0` are all **0**, and `DeviceKind.Door` **IS 0**, so the obvious one-liner answers
 * "Door" for every absent value.
 */
export function deviceKindName(kind) {
  if (typeof kind !== 'number' || !Number.isFinite(kind)) return '';
  return DEVICE_KIND_NAMES[kind | 0] || '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE BLOCKED-ORDER LAYER (the `blocked` channel).
//
// WHAT IT REPLACES: NOTHING, and that is the point. `WorksiteSafety.CanStageWorkerAt` is a LIVE
// PREDICATE the sim asks and then discards — it stamps no tile, saves no state, and leaves no trace
// in the projection. So an order painted where the crew cannot breathe was not merely drawn badly;
// there was no fact anywhere on the client to draw. The order sat there wearing its ordinary amber
// ring, looking exactly like an order that is about to be done, forever.
//
// This is the invisible-feedback rule the repo has already paid three owner reports for: a
// designation the player cannot understand is indistinguishable from a broken verb. It is also the
// specific follow-up `sim/Sim.Core/Systems/SafetySystem.cs`'s own header files against itself —
// *"CanStageWorkerAt is public so a future wire channel can ask it per tile and finally say so."*
//
// ONE BADGE PER TILE, so this returns a de-duplicated LIST rather than the raw rows. The host emits
// one row per queued SITE and does not arbitrate (see `hosts/web/WireFormat.Blocked.cs`: two orders
// on one tile is believed unreachable and deliberately not relied upon). Two rows on a tile would say
// the same actionable thing twice and stack two scrims, so the FIRST wins here. That is not the same
// call `roomMarkTiles` makes — marks keeps every row because a caller asks it "what is on this tile?"
// as a census — and the difference is that this list exists ONLY to be drawn.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * This room's blocked orders, one entry per TILE, in the host's emission order.
 *
 * Each entry carries the wire codes, both vocabulary names, the player-facing `reasonText` and a
 * composed `label` for the `<title>`. The text comes from `blockedReasonSentence` in
 * `wire/messages.js` — the ONE entry point — rather than being written again here.
 *
 * ⭐ M3-13 — AND IT IS A CALL, NOT A TABLE LOOKUP, because a row can now carry a `detail` that
 * changes the sentence: `no_consumable` names the item the order is waiting for. Indexing
 * `BLOCKED_REASON_TEXT` here (as this function did until M3-13) would silently keep the generic
 * sentence on the one surface a player actually looks at, with the wire carrying the answer and
 * every test green — the shape of the `marks` channel's "pass 1 is not the frame" defect.
 *
 * ⚠️ A ROW THIS CLIENT CANNOT NAME IS STILL DRAWN, with a "reason unknown to this client" text.
 * `decodeBlocked` deliberately keeps such a row and the reasoning carries straight through: the
 * payload of a blocked row is "THIS TILE IS STUCK", and that survives a reason code from a newer
 * host. Dropping it would draw a clear tile over a stuck one — silence, which is the exact failure
 * this channel exists to remove, arriving through the client instead of through the sim. PURE.
 *
 * @param {{x:number,y:number,deck:number,order:number,reason:number,orderName:string,reasonName:string}[]|null} blocked
 *        decodeBlocked() output
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{tx:number,ty:number,order:number,reason:number,orderName:string,reasonName:string,reasonText:string,label:string}[]}
 */
export function roomBlockedTiles(blocked, focusRoom) {
  const out = [];
  if (!Array.isArray(blocked) || !focusRoom) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  const seen = new Set();
  for (const b of blocked) {
    if (!b || (b.deck | 0) !== (focusRoom.deck | 0)) continue;
    const tx = b.x | 0, ty = b.y | 0;
    if (tx < rx || tx >= x1 || ty < ry || ty >= y1) continue;
    const key = tx + ',' + ty;
    if (seen.has(key)) continue;   // one badge per tile — see the header above
    seen.add(key);
    const reasonName = b.reasonName || '';
    const reasonText = blockedReasonSentence(reasonName, b.detail)
      || 'STUCK — REASON UNKNOWN TO THIS CLIENT';
    const orderName = b.orderName || 'ORDER';
    out.push({
      tx, ty, order: b.order | 0, reason: b.reason | 0, orderName, reasonName, reasonText,
      label: orderName.toUpperCase() + ' BLOCKED — ' + reasonText,
    });
  }
  return out;
}

// Layer geometry, in tile-fraction-free logical units (the tile is `unit` on a side and the caller's
// viewBox scales the whole layer, so small numbers here are large on screen).
const STACK_MAX_SLOTS = 2;      // beyond this the last slot summarises — a 32-unit tile holds two
const SPRITE_SIDE_1 = 1.15;     // sprite box as a multiple of `unit`, one kind on the tile
const SPRITE_SIDE_N = 0.72;     // …and two. (Furniture uses 1.6; a pile reads smaller than a machine.)
const BADGE_H = 8;
const BADGE_INSET = 1.5;        // margin from the tile edge
// VR-P3 — THE COUNT BADGE IN THE PAPER DIALECT. It was a dark plate with a rubble-grey edge and
// cream digits, which was the warm set's way of saying "loose matter, not an order". On paper the
// same statement is the DEFAULT ink-on-paper plate and NO ACCENT AT ALL: charter §1's last dialect
// rule is *"no accent = nothing to see"*, and a pile of regolith is precisely a thing with nothing
// to decide about it. Spending oxblood or a dash on it would make every full floor shout.
const BADGE_FILL = '#EBE4D1';   // PAPER
const BADGE_EDGE = '#14120F';   // INK, hairline
const BADGE_TEXT = '#14120F';   // INK
const ADVANCE = 0.62;           // the advance width of this surface's monospace stack, in em

/**
 * What one tile's item layer draws, slot by slot: up to `STACK_MAX_SLOTS` entries, each either a
 * `{kind, count}` or the summary `{more: n}`. A tile with more kinds than slots spends its last one
 * saying how many are hidden rather than picking arbitrary winners — the same contract the label
 * plate's `+N KINDS` row had, and for the same reason. PURE.
 * @param {{kind:number,count:number}[]|null} stacks
 * @returns {{kind?:number, count?:number, more?:number}[]}
 */
export function itemStackSlots(stacks) {
  const list = Array.isArray(stacks) ? stacks : [];
  if (!list.length) return [];
  const take = (s) => ({ kind: s.kind | 0, count: s.count | 0 });
  if (list.length <= STACK_MAX_SLOTS) return list.map(take);
  const head = list.slice(0, STACK_MAX_SLOTS - 1).map(take);
  head.push({ more: list.length - (STACK_MAX_SLOTS - 1) });
  return head;
}

/** A dark fitted text chip centred on (cx, bottom-anchored at `bottom`), at most `maxW` wide. The
 *  count badge and the no-art label chip are the same object at two lengths. PURE. */
function chipSvg(text, cx, bottom, maxW, k = 1) {
  const len = text.length || 1;
  // ⚠️ `k` IS THE CELL'S SCALE AGAINST `U`, and it is not decoration. The cutaway draws a tile ~95
  // scene px wide; a badge whose height and font cap are hard-coded to the plan view's 32-unit tile
  // renders a third the size it should and the count is unreadable — measured on the first render.
  // The FIT is unchanged and is still the load-bearing half: the font is computed from `maxW`, so a
  // four-digit count can never spill onto the neighbouring tile at any `k`.
  const H = BADGE_H * k;
  const fs = Math.min(6.5 * k, (maxW - 2.5 * k) / (ADVANCE * len));
  const w = Math.min(maxW, len * ADVANCE * fs + 2.5 * k);
  const x = cx - w / 2;
  const y = bottom - H;
  // The class is a test hook and nothing else styles it: `k` is the ONE thing this function scales by
  // and it survived a mutation to `1` with the whole suite green, so the plate has to be findable in
  // the ASSEMBLED scene to be measured there (`room-model.test.js`, the count-badge scale leg).
  return '<rect class="rz-chip" x="' + n2(x) + '" y="' + n2(y) + '" width="' + n2(w) + '" height="' + n2(H)
    + '" rx="2" fill="' + BADGE_FILL + '" stroke="' + BADGE_EDGE + '" stroke-width="' + n2(k) + '"/>'
    + '<text class="rz-chip-text" x="' + n2(cx) + '" y="' + n2(y + H / 2) + '" font-size="' + n2(fs)
    + '" fill="' + BADGE_TEXT + '" text-anchor="middle" dominant-baseline="central" '
    + 'font-family="\'Space Mono\', ui-monospace, monospace">' + text + '</text>';
}

/**
 * The Room Zoom's ground-item layer as one SVG string in room-local logical units (`unit` per tile),
 * or ''. PURE — a string builder, no DOM, so the gate can see it draw. (That is the `zone-overlay.js`
 * lesson: a builder that lives inside the view can be made to return '' with the whole suite green.)
 *
 * Every slot is one of three things and never a fourth:
 *   • a kind WITH art  → `buildItem(...)` + a count badge when `count > 1`
 *   • a kind WITHOUT art (MetalOre, or a byte from a newer host) → the label chip, `ORE 12` / `? 3`
 *   • the overflow slot → the chip `+N KINDS`
 *
 * THE FONT SIZE IS COMPUTED, NOT CHOSEN, and that is load-bearing rather than fussy — there is no
 * stack cap in the sim, so a fixed size spills a four-digit count across the neighbouring tile and
 * misattributes stock to a tile that has none. Fitting it means a badge can never lie about which
 * tile it belongs to, at the cost of small text on a very full one.
 *
 * @param {{tx:number,ty:number,stacks:{kind:number,count:number}[]}[]} tiles  roomItemTiles output
 * @param {{rx:number, ry:number}} focusRoom  the room rect's origin, for the local transform
 * @param {number} [unit]
 * @returns {string}
 */
export function itemStackSvg(tiles, focusRoom, unit = U, place = null) {
  if (!Array.isArray(tiles) || !tiles.length || !focusRoom || !(unit > 0)) return '';
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const out = [];
  for (const t of tiles) {
    const slots = itemStackSlots(t && t.stacks);
    if (!slots.length) continue;
    // VR-P3 — A PILE **STANDS ON** THE FLOOR, so it is drawn UPRIGHT at the tile's floor centre and
    // emphatically NOT sheared into the floor plane the way a mark is. The badge carries DIGITS, and
    // digits laid into a cabinet-oblique parallelogram are mirrored and slanted — unreadable, which
    // is the one failure mode a count badge cannot have.
    const lx = place ? 0 : ((t.tx | 0) - rx) * unit;
    const ly = place ? 0 : ((t.ty | 0) - ry) * unit;
    const n = slots.length;
    const k = unit / U;                       // the badge's own scale — see `chipSvg`
    const side = unit * (n === 1 ? SPRITE_SIDE_1 : SPRITE_SIDE_N);
    const slotW = unit / n;
    const bottom = ly + unit - BADGE_INSET * k;
    let body = '';
    for (let i = 0; i < n; i += 1) {
      const slot = slots[i];
      const cx = lx + slotW * (i + 0.5);
      const cy = ly + unit * (n === 1 ? 0.46 : 0.42);
      const maxW = slotW - BADGE_INSET * 2 * k;
      if (slot.more) {
        body += '<g class="rz-stack" data-kind="more">'
          + chipSvg('+' + slot.more + ' KINDS', cx, bottom, maxW, k) + '</g>';
        continue;
      }
      const itemId = itemIdForStockKind(slot.kind);
      body += '<g class="rz-stack" data-kind="' + (slot.kind | 0) + '">';
      if (itemId) {
        body += '<g transform="translate(' + n2(cx - side / 2) + ' ' + n2(cy - side / 2) + ')">'
          + buildItem(itemId, {
            w: side,
            h: side,
            idPrefix: 'rz-it-' + (t.tx | 0) + '-' + (t.ty | 0) + '-' + i,
          })
          + '</g>';
        // THE COUNT. Only past 1: a single unit is what the sprite already says, and a `1` on every
        // stack in a hold is noise over the numbers that matter.
        if ((slot.count | 0) > 1) body += chipSvg(String(slot.count | 0), cx, bottom, maxW, k);
      } else {
        // No piece for this kind — the old label plate, kept as the honest fallback.
        body += chipSvg(itemKindLabel(slot.kind) + ' ' + (slot.count | 0), cx, bottom, maxW, k);
      }
      body += '</g>';
    }
    // No escaping: every character here comes from ITEM_LABEL (our own ASCII table), from `| 0`
    // arithmetic, or from a pure builder. Nothing on this layer is player- or host-authored text.
    // ⭐ VR-P3-a — A PILE SAYS WHICH TILE IT IS ON, AND ITS OWN INK IS PRESSABLE, for the same reason
    // `furnitureSvg`'s pieces do: `place.stand` puts it UPRIGHT on the floor centre, so its body hangs
    // over the tile behind it and the floor-plane inverse resolved a press on the pile to that tile.
    // One tile of error rather than the fittings' three, and the same defect. The `pointer-events` is
    // per-item and `visiblePainted`, so the empty paper inside a pile's box still falls through to the
    // floor — the group below stays `none` so nothing but drawn ink is a target.
    out.push('<g class="rz-item" data-tile="' + (t.tx | 0) + ',' + (t.ty | 0)
      + '" pointer-events="visiblePainted"'
      + (place ? ' transform="' + place.stand(t.tx | 0, t.ty | 0) + '"' : '') + '>' + body + '</g>');
  }
  return out.length ? '<g class="rz-items" pointer-events="none">' + out.join('') + '</g>' : '';
}

/**
 * The `"tx,ty"` keys of every tile the item layer draws on — what `furnitureSvg` uses to drop what it
 * would otherwise stack UNDERNEATH this layer. PURE.
 *
 * ⚠️ WHAT IT SUPPRESSES GREW WITH THE ART, AND THE GROWTH IS THE POINT. It used to suppress only the
 * VS-Z-25 unknown chip, because that was the only thing a ground glyph could produce. Now `,` and `&`
 * resolve to REAL PIECES through `itemForGlyph`, so the frame-derived furniture layer would draw the
 * pile a SECOND time — from the projection, which has no count, keeps only the topmost stack and is
 * erased by any device on the tile. Two piles on one tile, one of them lying. The authority for a
 * ground stack is the `items` channel; `roomzoom-view.js`'s `furnitureSvg` therefore skips a
 * RESOURCE piece (and the chip) on these tiles and never a device's own art.
 */
export function itemStackTileKeys(tiles) {
  const keys = new Set();
  if (!Array.isArray(tiles)) return keys;
  for (const t of tiles) {
    if (t && itemStackSlots(t.stacks).length) keys.add((t.tx | 0) + ',' + (t.ty | 0));
  }
  return keys;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Demolish classification (IX-Z-24/25). A tile is classified into exactly one of
// {pending, device, decor, built-wall, empty} in a fixed precedence; the highest-precedence layer
// present is what one DEMOLISH click acts on.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// Built structure glyphs (walls + doors) — demolishing these is v1-honest no-op (IX-Z-24).
//
// ⚠️ IT IS NOT A RENDER LAYER AND NEVER WAS. This set is read by `demolishTarget` below and by
// NOTHING else in the client — grep it. `device-sprite-coverage.test.js` used to excuse `Door` from
// the art guard on the strength of "drawn by the Room Zoom's STRUCTURE layer"; there is no such
// layer, and the doors drew a dashed chip for it. It deliberately does NOT equal `NON_FURNITURE`:
// `'+'` (43) and `'X'` (88) are structure the player cannot DEMOLISH *and* furniture the surfaces
// must DRAW, and both facts are true at once. Keeping them here is what stops a door classifying as
// a `device` now that its glyph resolves to real art, and that precedence is pinned in
// `room-model.test.js`.
//
// ⚠️ THE REASON THIS COMMENT GAVE FOR THAT WAS FALSE, and it is quoted rather than deleted because
// the package that wrote it exists to retract exactly this species of claim. It read: *"a door is
// taken apart with STRIP, not with `Cmd.remove`"*. **STRIP EXPLICITLY REFUSES DOORS.**
// `sim/Sim.Core/Systems/DeconstructSystem.cs:345` is `return device.Kind != DeviceKind.Door;`, and
// the doc comment above it (`:320`) says why: *"a door is `BuildSystem`'s OUTPUT, so its inverse is
// build-cancel, not strip. Two owners for one object's lifetime is the bug."* Driven against a live
// host, a closed door answers `"cannot strip door"` where a wall and a Scrubber both answer
// `"designate strip"`.
//
// THE DECISION IS UNCHANGED AND IS BETTER SUPPORTED THAN IT WAS ARGUED. Keeping the door codes here
// is right because `Cmd.remove` lowers to `RemoveDeviceCommand`, which gates on
// `PlaceDeviceCommand.IsPlaceableFurniture` (`Commands.cs:566`, switch at `:342-357`) — a nine-kind
// decor whitelist that excludes `Door` INDEPENDENTLY of anything the client believes. So a
// `Cmd.remove` at a door would be a **silent sim no-op**: a click that costs a round trip, changes
// nothing, and tells the player nothing. This set is what keeps the client from sending it.
//
// ⚠️ AND THE HONEST CONSEQUENCE, RECORDED RATHER THAN HIDDEN: **a BUILT door has no removal verb at
// all, on any surface.** DEMOLISH refuses it (here), STRIP refuses it (`DeconstructSystem.cs:345`),
// and build-cancel only revokes a *pending* order — once `BuildSystem.Complete` has spawned the
// device there is nothing left to cancel. A player can build a door with the DOOR tool and then
// never remove it. That is a real gap in the sim's verb set, not a client bug, and it is not this
// package's to close; the client's job is to stop lying about which verb would do it.
//
// Exported as a list for the same reason `NON_FURNITURE_CODES` is: so a test can pin the partition
// against the SHIPPED set instead of a transcription of it. Nothing outside this module reads it.
export const STRUCTURE_CODE_LIST = Object.freeze([35, 43, 47, 88]); // # + / X
const STRUCTURE_CODES = new Set(STRUCTURE_CODE_LIST);

/** The glyph code at (tx,ty) in the frame, or -1 (off-grid / no frame). PURE. */
function codeAt(frame, tx, ty) {
  if (!frame || !Array.isArray(frame.cells)) return -1;
  const w = frame.w | 0, h = frame.h | 0;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return -1;
  const cell = frame.cells[ty * w + tx];
  return Array.isArray(cell) ? (cell[0] | 0) : -1;
}

/**
 * Classify a DEMOLISH target at (tx,ty) into exactly one layer + its wire verb, in the fixed
 * precedence pending → device → decor → built-wall → empty (IX-Z-24/25). PURE.
 *   pending     → verb 'cancel'       (Cmd.build('cancel') → BuildSystem.Cancel)
 *   device      → verb 'remove'       (Cmd.remove → RemoveDeviceCommand; sim lane, defensive)
 *   decor       → verb 'decor-remove' (view-only local removal)
 *   built-wall  → verb null           (honest no-op — cancel only revokes queued orders)
 *   empty       → verb null           (dropped no-op)
 * @param {number} tx @param {number} ty
 * @param {Array|{cells:Array}|null} designs
 * @param {Array|null} decor
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @returns {{kind:'pending'|'device'|'decor'|'built-wall'|'empty', verb:string|null}}
 */
export function demolishTarget(tx, ty, designs, decor, frame) {
  const dCells = Array.isArray(designs) ? designs : (designs && designs.cells) || [];
  for (const c of dCells) {
    if (Array.isArray(c) && (c[0] | 0) === tx && (c[1] | 0) === ty) {
      return { kind: 'pending', verb: 'cancel' };
    }
  }
  const code = codeAt(frame, tx, ty);
  // ⚠️ ASK WHAT THE PIECE IS **NOT**. This branch was the bare truthiness of `itemForGlyph(code)`
  // until the ground-item art package (2026-07-27), and on `main` that was CORRECT, not a latent
  // bug: every glyph in `GLYPH_TO_ITEM` resolved to a device, either directly (a `functional` row
  // carrying its own `Glyphs.ForDevice` char) or through `GLYPH_SUBSTITUTE`. THIS PACKAGE CREATED
  // THE HAZARD by giving `resource` rows glyphs — `,` (Regolith), `&` (Corpse) and six more now
  // resolve too, so bare truthiness would classify a spoil pile as `device` and send `Cmd.remove`
  // at a tile with no device on it.
  //
  // AND ITS FIRST GUARD WAS OVER-BROAD, WHICH IS WHY THE PREDICATE READS THE WAY IT DOES. Asking
  // `isDeviceItem(...)` — "is the piece skinning this glyph a `functional` row?" — silently broke
  // DEMOLISH on a **Light**: `GLYPH_SUBSTITUTE` maps `'*'` (DeviceKind.Light) onto `wall-lamp`,
  // which is a COSMETIC row, so a real, placeable, player-built device classified as `empty`,
  // `roomzoom-view.js` hit its `default: break`, and the click was dropped with no command, no
  // toast and no pulse. A substitution means "a device wearing another piece's art", so the
  // BORROWED piece's registry `kind` says nothing about the tile. The only kind that means "no
  // device stands here" is `resource`, so that is the one this asks about. Pinned both ways, over
  // the whole ledger rather than the one glyph, in `room-model.test.js`.
  //
  // ⛔⛔ FILED 2026-08-05, AND ITS SEVERITY WENT **UP** WHEN THE PAWN-OCCLUSION FALLBACK LANDED —
  // WHICH IS THE WHOLE REASON THIS PARAGRAPH IS HERE RATHER THAN IN A BACKLOG. This branch still
  // reads `itemForGlyph(code)` off the frame, so a device with a crew member standing on it
  // classifies as `empty` and DEMOLISH is silently dropped (`roomzoom-view.js`'s `default: break`).
  //   BEFORE the fallback that was SELF-CONSISTENT: the device was invisible, so refusing to
  //   demolish something the player could not see was not a lie.
  //   AFTER it, the surface DRAWS the capsule under her and the verb refuses it. Picture and verb
  //   disagree, and the refusal is silent — the binding "invisible feedback is FUNCTIONAL" shape,
  //   pointing the other way: the feedback is now visible and the VERB is the thing that is missing.
  // ⇒ THE CLOSE: give this function the same `deviceCond` Map (`roomzoom-view.js` already holds it
  // and already hands it to `roomCells` twice) and fall through to `itemForDeviceRow(dev.get(...))`
  // when `code` is `CITIZEN_GLYPH_CODE`, exactly as `roomCells` does.
  // ⛔ NOT DONE HERE, DELIBERATELY, AND THE REASON IS THAT IT IS NOT ONE LINE: it changes this
  // function's signature, its caller, and the `WEAR_SEAM_CENSUS` reference count in
  // `devices-model.test.js` (a fourth re-measure in one lane), and it needs its own driven
  // press-through-to-`Cmd.remove` test — the seam `demolishTarget`'s Light tests already cover for
  // borrowed art. A verb change belongs to a package that can drive the verb.
  const _id = itemForGlyph(code);
  if (code >= 0 && !NON_FURNITURE.has(code) && !STRUCTURE_CODES.has(code)
      && _id && !isResourceItem(_id)) {
    return { kind: 'device', verb: 'remove' };
  }
  if (Array.isArray(decor)) {
    for (const d of decor) {
      if (d && (d.x | 0) === tx && (d.y | 0) === ty) return { kind: 'decor', verb: 'decor-remove' };
    }
  }
  if (STRUCTURE_CODES.has(code)) return { kind: 'built-wall', verb: null };
  return { kind: 'empty', verb: null };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Local cosmetic-decor store (IX-Z-23/29). View-only, session-only, NEVER a sim entity — placing /
// removing is instant + local. Pure list transforms (never mutate the argument).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Append a decor piece (one per tile; a new piece replaces any existing at that tile). PURE. */
export function addDecor(list, deck, x, y, itemId) {
  const base = Array.isArray(list) ? list.filter((d) => !(d.deck === deck && d.x === x && d.y === y)) : [];
  return base.concat([{ deck: deck | 0, x: x | 0, y: y | 0, itemId: String(itemId) }]);
}

/** Remove the decor piece at (deck,x,y). PURE. */
export function removeDecor(list, deck, x, y) {
  return Array.isArray(list) ? list.filter((d) => !(d.deck === deck && d.x === x && d.y === y)) : [];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ESC rung (IX-Z-40). The Room Zoom's own two-rung stack: a keypress either disarms the armed tool
// OR pops the room to the Overview, never both (IX-Z-41). A dialogue rung sits between so a panel
// closes first when one is open. PURE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{armed:boolean, dialogueOpen?:boolean, roomOpen:boolean}} s
 * @returns {'disarm'|'dialogue'|'exit'|'pass'}
 */
export function escStackRung(s) {
  if (s && s.armed) return 'disarm';
  if (s && s.dialogueOpen) return 'dialogue';
  if (s && s.roomOpen) return 'exit';
  return 'pass';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE THREE CHROME SENTENCES (VS-Z-12 caption · VS-Z-45 palette label · VS-Z-48 hint). PURE.
//
// ⚠️ THE DEFECT THIS EXISTS FOR WAS PRESENTATION, NOT STATE, and the distinction is the whole
// package. The filed complaint reads *"the Room Zoom opens with BUILD armed"* — and it does NOT:
// `enterRoom` sets `_armed = null` (IX-Z-01), as do the room swap, the crew-row jump and exit.
// What a player MET on the first frame were three simultaneous announcements of a mode that was
// not on:
//     palette label   BUILD ▸ QUARTERS
//     hint line       PICK A TOOL · WALL/FLOOR: CHOOSE A MATERIAL, DRAG TO SWEEP A RUN · …
//     canvas caption  QUARTERS · BUILD DETAIL · 3 PLACED
// Three imperatives to build, and not one word about the two things the disarmed surface actually
// does: a click selects the pawn under it (IX-Z-30) and a right-click opens the PRIORITISE menu
// (M2-10). "Invisible feedback is FUNCTIONAL" cuts both ways — a surface that advertises the verb
// it is NOT in is the same defect wearing the opposite sign.
//
// ⛔ THE RIMWORLD CITE IS DELIBERATELY NARROW, because the reference does not answer the question
// this package asks and inventing a §-number for it is the thing CLAUDE.md forbids. What §2.2 DOES
// state, source-grade, is the mechanism the neutral hint now advertises: *"Select one colonist,
// right-click a target … choose from the context menu"* — a verb reached with no designator in
// hand at all, i.e. the disarmed surface is a WORKING surface, not a waiting room. §2.1 is the
// other half: a designation is *"a request made to the world"* that the player picks up as a paint
// tool; picking one up is an act, and the label may say so once it has happened. What the
// reference states NOTHING about is the Architect menu's boot state, so no claim here rests on it.
//
// Keyed on ONE input — is a tool armed — so the label, the hint and the caption cannot come to
// disagree about which mode the surface is in. Everything else is a fact about the room.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The hint line with NOTHING armed: where you are and the three things you can do from here.
 *
 * ⚠️ IT SAYS **A MACHINE**, NOT "A TILE", AND THE FIRST DRAFT SAID THE WRONG ONE. `prioritiseOffer`
 * refuses a tile with no `devices` row SILENTLY and on purpose (`prioritise-model.js`: *"a stray
 * right-click on bare floor is not an intent aimed at anything"*, pinned twice in
 * `prioritise-menu.test.js`). On the shipped cryo bay most tiles ARE bare floor, so
 * `RIGHT-CLICK A TILE TO PRIORITISE A JOB` invited the one gesture that answers with nothing —
 * this package's own thesis inverted, an advertised verb that is not there. The wording follows the
 * model's own two sentences: the menu row reads `PRIORITISE: REPAIR {name}` and its no-selection
 * refusal already says *"RIGHT-CLICK THE MACHINE"*.
 */
export const ZOOM_HINT_IDLE =
  'CLICK A CREW MEMBER TO SELECT THEM · RIGHT-CLICK A MACHINE TO PRIORITISE ITS REPAIR · ' +
  'PICK A TOOL ABOVE TO BUILD · ESC RETURNS TO THE SHIP';

/** The hint line with a tool armed — the per-tool crib sheet that shipped as the surface's ONLY
 *  hint. Its leading `PICK A TOOL · ` is gone (a tool IS picked, so the imperative was stale the
 *  moment it could be read) and `ESC DISARMS` is appended, which is what `escStackRung` has always
 *  done on this rung and nothing on the surface said. */
export const ZOOM_HINT_ARMED =
  'WALL/FLOOR: CHOOSE A MATERIAL, DRAG TO SWEEP A RUN · CLICK TO PLACE · ' +
  'DIG [G] / STOCKPILE [Z] / STRIP [V]: DRAG A REGION TO ORDER THE CREW · ' +
  'ERASE [C]: DRAG OVER PAINTED ORDERS TO TAKE THEM BACK · ' +
  'MOVE [M]: PICK A CREW MEMBER, THEN CLICK WHERE THEY SHOULD GO · DEMOLISH REMOVES A GHOST · ' +
  'ESC DISARMS';

/**
 * What the palette label, the hint line and the canvas caption say right now.
 *
 * `capLead` and `capPlaced` are the caption's TWO nodes rather than one string because VS-Z-12
 * colours the count `#f2b563` and the rest reduced-alpha cream; concatenating them here would
 * either lose the colour or put markup in a pure function.
 *
 * @param {{armed:string|null, roomName:string, placed?:number, crewHere?:number}} s
 * @returns {{armed:boolean, label:string, hint:string, capLead:string, capPlaced:string}}
 */
export function zoomChrome(s) {
  const o = s || {};
  const armed = o.armed != null && o.armed !== '';
  const room = String(o.roomName == null ? '' : o.roomName);
  const placed = o.placed | 0;
  const here = o.crewHere | 0;
  return {
    armed,
    // ⭐ THE LABEL STILL NAMES THE PALETTE — IX-Z-02 declares it always visible, so a blank label
    // would leave eighteen unexplained buttons rather than a de-emphasised group. `TOOLS` is the
    // noun for a shelf of tools; `BUILD` is the verb for a mode, and it returns when the mode does.
    // Deliberately NOT near the WORK tab's `BUILD` column header (a separate carried owner item
    // with a standing HOLD test) — this vocabulary moves away from that collision, never into it.
    label: (armed ? 'BUILD ▸ ' : 'TOOLS ▸ ') + room,
    hint: armed ? ZOOM_HINT_ARMED : ZOOM_HINT_IDLE,
    // Disarmed the caption says WHERE YOU ARE AND WHO IS WITH YOU; armed it says which detail of
    // the room you are editing. `HERE` is the crew dock's own word for "standing in this room"
    // (`shipCrewRows(...).here`), so the footer and the dock cannot word one fact two ways.
    capLead: room + ' · ' + (armed ? 'BUILD DETAIL' : (here ? here + ' CREW HERE' : 'NO CREW HERE')) + ' · ',
    capPlaced: placed + ' PLACED',
  };
}
