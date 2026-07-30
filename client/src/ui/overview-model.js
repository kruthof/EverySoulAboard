// OVERVIEW view-model — PURE. Every derivation the Level-1 warm Overview controller
// (client/src/ui/overview-view.js) needs that is more than a straight DOM write lives here,
// node-tested, with no DOM and no wire access: the click→action classification, the lens recolor
// grade + tint mapping, the selected-crew → current-room join, the deck-rail pip list + delta, the
// Escape rung reducer (with the Level-2 room-zoom rung slotted in), and the small display
// formatters the readout atmos box needs.
//
// Shared derivations (selectedRosterEntry, cautionState, clockHHMM, moraleColor, surnameOf,
// speedLabel, designsOnDeck) are IMPORTED from console-model.js — never re-forked — so the Overview
// and the console speak one contract (interaction-spec IX-O-03). InvariantCulture-safe throughout
// (no locale APIs): round + ASCII only.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE SCHEMATIC ALTITUDE RULE — **ORDERS THAT POINT AT AN EXISTING THING are deck-scoped; ORDERS
// THAT AUTHOR A REGION are zoom-only, exactly like BUILDING.** BINDING (owner decision, Garvin).
// (console-retirement plan §4.2, amended twice; this file is where the plan says the rule lives.)
//
//   deck-scoped, HERE:      DIG · STRIP          — you point at debris, a wall, a device
//   zoom-only, ROOM ZOOM:   WALL/FLOOR/DOOR · **STOCKPILE**  — you author an extent out of nothing
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THE PREVIOUS WORDING IS QUOTED HERE RATHER THAN DELETED — someone grepping it must land on the
// correction, not on a hole. WP-5 wrote: **"BUILDING is zoom-only; ORDERS are deck-scoped"**, on the
// grounds that *"a designation consumes no material and changes no geometry — it marks intent"*, and
// it drew an ORDERS bar with THREE buttons: DIG, STOCKPILE, STRIP.
//
// **The justification is true of dig and strip, FALSE of stockpile, and it names the wrong axis.**
// The axis that does the work is not "does it consume material" — it is **"does the player choose
// the extent?"**
//   · DIG and STRIP mark a thing the world ALREADY CONTAINS: this rubble, this wall, this device.
//     The extent was decided by the ship. You point, and the tile you pointed at is the whole
//     decision — which is why a single click at schematic altitude is an honest gesture for them.
//   · A STOCKPILE has nothing to point at. **You author a region out of nothing, and its extent IS
//     the decision** — the same category as building a room, which is already zoom-only.
//
// And the extent is not a matter of taste, it is the mechanic: `JobWork.IsFreeStockpileTile` asks
// "Stockpile + Walkable + empty", **ONE STACK PER TILE**, so the area literally is the capacity —
// 40 tiles is 40 stacks. Choosing x×y is not incidental to the verb, it is the verb. Meanwhile this
// surface **has no drag gesture at all** (zero mousedown/mousemove/pointerdown in `overview-view.js`
// — it is click-only), so painting a 5×8 zone here is FORTY CLICKS, while the Room Zoom has swept
// filled rectangles since WP-4. The verb that most needs area-painting was the only one that could
// not be swept anywhere. That is what this amendment fixes.
//
// The older rule this all replaces was "nothing is placed on the ship schematic", justified about
// WALLS: a wall has a footprint, a material cost and a geometry consequence, and placing one where a
// tile is a handful of pixels is a mis-click waiting to happen. That reasoning still stands for
// building, and the material/geometry observation about designations is still TRUE — it is simply
// not the thing that decides altitude. Note what did NOT change: dig and strip stay on BOTH
// surfaces, because pointing at an existing thing is a legitimate gesture at either scale.
//
// WRONG IF THIS FILE EVER RETURNS A 'build' ACTION, or if `stockpile` reappears in `ORDER_TOOLS`.
// There is no build branch below and there must not be one: an armed wall/floor/door/cancel leaking
// in from the shared console armed slot is IGNORED here and the click resolves by the ordinary hit
// rule (pinned by test). `stockpile` is likewise not an order tool HERE any more: the Room Zoom owns
// its own armed slot, so the only way the string reaches this surface is the console's surviving Z
// key, and when it does the click falls through to the hit rule — clicking a room ENTERS it, which
// is where the tool now lives. That is the right outcome, not a leak.

import { makeTransform } from './overview-scene.js';

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Click → tile projection (IX-O-19). The scene draws in a 1300×561 viewBox; the caller maps a DOM
// click to viewBox coords (via the SVG CTM) and hands them here with the deck's transform + frame.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The integer sim tile a viewBox point fell in, or null when out of the frame bounds. `transform`
 * is `makeTransform(slots, frame)` (its `.invert` recovers the fractional tile). PURE.
 * @param {{invert:(x:number,y:number)=>[number,number]}|null} transform
 * @param {number} vx @param {number} vy   point in the scene's 1300×561 viewBox space
 * @param {{w:number,h:number}|null} [frame]
 * @returns {{x:number,y:number}|null}
 */
export function tileAt(transform, vx, vy, frame) {
  if (!transform || typeof transform.invert !== 'function') return null;
  const [tx, ty] = transform.invert(vx, vy);
  const x = Math.floor(tx), y = Math.floor(ty);
  if (frame && (x < 0 || y < 0 || x >= frame.w || y >= frame.h)) return null;
  return { x, y };
}

/** Convenience: build the deck transform for a decoded deck-view slot list + frame (re-export). */
export { makeTransform };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The ORDERS bar (console-retirement WP-5) — the deck-scoped designation verbs.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The ORDER verbs the Overview arms, in the bar's visual order — a SUBSET of the console's own
 * `ORDER_KINDS` (`console-model.js`), in its order, because they are the same verbs on a different
 * surface and a divergence in NAME or SPELLING here would be a divergence in the game.
 *
 * ⚠️ IT IS TWO, NOT THREE. `stockpile` was here from WP-5 until the altitude rule was corrected (see
 * the module header): it authors a region, so it lives in the Room Zoom palette (`room-model.js`
 * `ROOM_TOOLS`) where a drag sweeps a filled rectangle. Putting it back would ship a verb whose
 * whole content is an extent onto the one surface that cannot express an extent.
 *
 * This is also the table `client/test/surface-boundary.test.js` MODERN_TOOL_TABLES resolves to prove
 * verb parity with the dying console — and parity is satisfied by the UNION of the modern tables, so
 * moving a verb from here to `ROOM_TOOLS` keeps the ledger empty. Renaming this export is a one-line
 * edit THERE, in the same commit.
 */
export const ORDER_TOOLS = Object.freeze(['dig', 'strip']);

/** Tool → the bar's button label. The hotkey prefix is the console's own binding (`controls.js`
 *  G/V), which still arms through the one shared slot while the Overview is on screen; the ⛏ / ⚒
 *  icons are the Room Zoom's (`room-model.js` TOOL_LABEL), so one verb reads the same on both. */
export const ORDER_LABEL = Object.freeze({
  dig: '[G] ⛏ DIG', strip: '[V] ⚒ STRIP',
});

/** True for a tool the Overview lowers to a DESIGNATION rather than resolving as a hit. PURE. */
export function isOrderTool(tool) {
  return ORDER_TOOLS.indexOf(tool) >= 0;
}

/**
 * ERASE — the un-designate tool (M1-C). It stands OUTSIDE `ORDER_TOOLS` on purpose, in one word: it
 * is not an order. Every entry in that table paints intent and lowers to one named wire verb; erase
 * paints nothing and the verb it sends is a property of the TILE (`room-model.js` `eraseTarget`).
 * Folding it in would have made `orderHintLine`, `orderPlacedLine` and `overviewClickAction` all say
 * "order" about a thing that cancels one, and `MODERN_TOOL_TABLES` would then report the Overview as
 * owning a verb whose real home is the Room Zoom palette.
 *
 * It IS rendered in the same ORDERS bar, beside the two verbs it undoes, because that is where the
 * player is when they change their mind.
 */
export const ERASE_TOOL = 'erase';

/** The ORDERS bar's label for ERASE. `[C]` is `controls.js`'s binding (C for Cancel — X, the obvious
 *  letter, has been the console's own cancel-a-build toggle since IX-11). */
export const ERASE_LABEL = '[C] ↺ ERASE';

/** True for the un-designate tool. PURE. */
export function isEraseTool(tool) {
  return tool === ERASE_TOOL;
}

/**
 * The `marks` kind NAME at a deck tile, or '' — over `decodeMarks` output. The Overview's half of the
 * erase lookup: it reads `marks` and NOT `zones` (it draws no zone layer), which `tileOrders`'
 * header explains is honest rather than lossy. PURE.
 * @param {{x:number,y:number,deck:number,mark:string}[]|null} marks  decodeMarks() output
 * @param {number} x @param {number} y @param {number} deck
 * @returns {string}
 */
export function markNameAt(marks, x, y, deck) {
  if (!Array.isArray(marks)) return '';
  for (const m of marks) {
    if (!m || (m.deck | 0) !== (deck | 0)) continue;
    if ((m.x | 0) === (x | 0) && (m.y | 0) === (y | 0)) return m.mark || '';
  }
  return '';
}

/**
 * WHAT AN ERASE CLICK SAYS BACK, as a toast line — INCLUDING WHEN IT CLEARED NOTHING, which is the
 * half that matters. Erase is the one verb on this surface whose commonest miss is INVISIBLE: click
 * a tile that carries no order and the correct behaviour is to send nothing at all, which looks
 * exactly like a broken tool. `docs/HANDOVER.md` §4g is the same complaint from the other direction.
 *
 * Names the tile and the deck for the same reason `orderPlacedLine` does — the verb is deck-scoped
 * and carries no z on the wire. PURE: ASCII + the verb icon, no locale APIs, no clock.
 * @param {'dig'|'strip'|'stockpile'|null} target  `eraseTarget` output
 * @param {number} x @param {number} y @param {number} deck
 * @returns {string} the toast line (never '')
 */
export function erasePlacedLine(target, x, y, deck) {
  const where = ' ▸ ' + (x | 0) + ',' + (y | 0) + ' ON DECK ' + (deck | 0);
  if (!target) return '↺ NOTHING TO ERASE' + where;
  return '↺ ERASED ' + String(target).toUpperCase() + where;
}

/**
 * The ORDERS bar's one-line readback: what a click will do, and WHICH DECK it will do it on.
 *
 * The deck is in EVERY branch on purpose. "Deck-scoped" is otherwise an invisible property — the
 * order verbs carry no z on the wire (the host applies them to the session's current deck), so the
 * only thing standing between a player and a designation on a deck they are not looking at is that
 * the schematic shows one deck at a time. Saying so is the affordance.
 *
 * ⚠️ NO MASK PARAMETER ANY MORE. WP-5's third branch read `stockFilterLabel(mask)` to name the
 * accept-set in words; that branch — and the whole accept-mask seam on this surface — moved to the
 * Room Zoom with the verb. Naming a filter here would be worse than silent: it would advertise a
 * setting for a tool this bar cannot arm.
 *
 * THE UN-ARMED LINE NAMES WHERE STOCKPILE WENT, and that sentence is the migration: a player who
 * knew the bar had three buttons must not conclude the verb was deleted. PURE, ASCII + the verb
 * icons, no locale APIs.
 *
 * @param {null|string} armed  the shared armed-tool slot
 * @param {number} deck        the deck currently on screen (frame.deck)
 */
export function orderHintLine(armed, deck) {
  const d = ' ON DECK ' + (deck | 0);
  if (armed === 'dig') return '⛏ DIG ▸ CLICK DEBRIS' + d;
  if (armed === 'strip') return '⚒ STRIP ▸ CLICK A WALL OR DEVICE' + d;
  // ERASE names what it TAKES BACK rather than what it points at, because unlike DIG and STRIP its
  // target is not a kind of thing on the map — it is any tile the player has already ordered.
  if (isEraseTool(armed)) return '↺ ERASE ▸ CLICK A PAINTED ORDER TO TAKE IT BACK' + d;
  return 'ORDERS APPLY TO DECK ' + (deck | 0) + ' · BUILDING AND ▦ STOCKPILE ARE ZOOM-ONLY';
}

/**
 * WHAT A PLACED ORDER SAYS BACK, as a toast line. The Overview used to say NOTHING at all when an
 * order landed: the bar's hint (`orderHintLine`) states what a click WILL do and never changes when
 * one happens, `#ov-toast` stayed empty and hidden, and `orderSuppressionToast` fires only on the
 * two hits where a room refused to open. So the whole gesture — arm STRIP, click a bed — produced
 * no feedback anywhere on this surface, while the Room Zoom has shown a 2.6 s toast for the same
 * gesture since WP-2. This is that parity, and it is the surface half of the same report that found
 * the invisible device mark (HANDOVER §4g): a verb the player cannot see working is a verb they
 * report as broken.
 *
 * IT NAMES THE TILE AND THE DECK. The verb is deck-scoped and carries no z on the wire, so "which
 * deck did that land on" is exactly the question `orderHintLine`'s doc says is otherwise invisible;
 * a toast that answered it only before the click would be a strange place to stop. The label comes
 * from `ORDER_LABEL` with its `[G]`/`[V]` hotkey prefix stripped — a toast is a report, not an
 * affordance, and re-teaching the key at the moment the key was just used is noise.
 *
 * DELIBERATELY NOT A CLAIM THAT THE SIM ACCEPTED IT. `orderPayloads` promises the ATTEMPT (the sim
 * re-validates at the tick boundary and an illegal tile is a silent no-op), so the wording is
 * `ORDERED`, not `CONDEMNED` — the same distinction `GameSession.HandleStrip` now draws on the
 * status line. Overstating this would rebuild, on the client, the exact lie just removed from the
 * host. PURE: ASCII + the verb icons, no locale APIs, no clock.
 *
 * @param {string} tool  an ORDER_TOOLS verb
 * @param {number} x @param {number} y  the designated tile
 * @param {number} deck
 * @returns {string} the toast line, or '' for a tool this bar does not lower
 */
export function orderPlacedLine(tool, x, y, deck) {
  if (!isOrderTool(tool)) return '';
  const label = String(ORDER_LABEL[tool] || tool).replace(/^\[[A-Z]\]\s*/, '');
  return label + ' ORDERED ▸ ' + (x | 0) + ',' + (y | 0) + ' ON DECK ' + (deck | 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Click classification (IX-O-11/12/13/15/19). One rule for a floor click: an armed tool decides
// everything; with no tool armed, the DOM hit (pawn > terminal > compartment) decides.
//
// ⭐ M1-L: the `addroom` chip tier and the `hallSlot` miss tier are BOTH GONE. There is no longer a
// hall to be a bare click on — every compartment is a room and every room is enterable — so the
// ladder lost its two hall-shaped rungs and `enterRoom` moved up to be the last hit tier.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Classify an Overview click into an action. `armed` is the shared armed-tool slot
 * (null | 'move' | an ORDER tool | a build tool that leaked in); `hit` is the DOM hit-test result:
 *   { pawnCid?, terminalId?, roomAnchor? }  (all optional; absent = miss)
 *
 * ORDERS THAT POINT AT AN EXISTING THING ARE DECK-SCOPED; BUILDING AND STOCKPILE ARE ZOOM-ONLY (the
 * module header, binding). So there is NO 'build' action here — an armed wall/door/cancel/stockpile
 * leaking in from the shared console slot is ignored and the click falls through to the hit rule —
 * but there IS an 'order' action, and it sits at the TOP.
 *
 * Precedence (single disambiguation rule):
 *   1. the MOVE order armed → 'move' (the move target tile — IX-O-41)
 *   2. an ORDER tool armed → 'order' (the designation target tile — WP-5)
 *   2b. ERASE armed → 'erase' (the un-designate target tile — M1-C; same tier, see the branch)
 *   3. a pawn hit → 'select' (IX-O-15; pawns sit above room hit-rects)
 *   4. a MOSS terminal hit → 'terminal' (opens the MOSS terminal; devices sit above the room)
 *   5. a compartment hit → 'enterRoom' (IX-O-11; Level-2 room zoom — where building happens)
 *   6. empty space outside every compartment → 'none' (IX-O-18)
 *
 * ═══ WHY 'order' SHORT-CIRCUITS EVERYTHING AND NOT MERELY 'enterRoom'. This is the decision WP-5
 * exists to take, and "ahead of enterRoom" — the charter's minimum — would have been WRONG.
 *
 * The general reason is that an armed tool is a MODE, and a mode owns the click. That is not a new
 * rule invented here; it is what the other two surfaces already do with these exact verbs. The
 * console: "while a palette tool is armed a non-drag click sends that tool's orders and nothing else
 * — no selection, no device toggle, no crew snap, shift suppressed" (IX-32/33,
 * `controls.js:174-177`). The Room Zoom: `onCanvasClick` bails outright on `isSweepTool(_armed)`
 * (`roomzoom-view.js:660`) so the sweep owns the gesture. `armed === 'move'` above is the same rule,
 * already on THIS surface. A designation that lost to a hit would make the Overview the one surface
 * where an armed tool is a suggestion.
 *
 * And each of the three hits it now overtakes is a MEASURED hole, not a hypothetical one:
 *   · PAWN. `docs/HANDOVER.md` §4b limit 2: on `--ship grid` the crew cluster in the hold at
 *     x25-32 y15-16 — "exactly where the dig designations are". If `select` won, the debris a player
 *     most wants dug would be the debris they cannot designate, and the failure would look like a
 *     dead button rather than a rule.
 *   · TERMINAL. A device is precisely what STRIP targets (`DeviceSalvage`, E0-5). If `terminal` won,
 *     no device could ever be stripped from the Overview at all — the verb would ship inert over its
 *     own subject matter.
 *   · ＋ADD ROOM. ⚠️ HISTORICAL — the chip was DELETED by M1-L and this rung no longer exists. The
 *     measurement stands as the record of why order-over-hit was right: WP-1's wreck-fill put the
 *     debris in the HALLS, the ＋ADD ROOM chip was "the only interactive thing in a hall", and if
 *     `addroom` had won the click, the halls — where the dig economy actually is — would have been
 *     un-diggable and the click would have commissioned a room instead. It is kept because the
 *     argument it supports (an armed tool is a MODE and owns the click) is unchanged, and because
 *     those hall tiles are now inside ENTERABLE compartments, so the surviving `enterRoom` rung
 *     inherits the whole hazard: with DIG armed, clicking wreck debris must designate it and NOT
 *     open the room. That is now the decisive case rather than a third example of one.
 * The cost of the choice is real and is accepted: with an order armed you cannot select a pawn,
 * open MOSS or enter a room from the schematic. Escape disarms (`overviewEscape` rung 1), which is
 * the same exit the console and the Room Zoom offer, and the bar's own button un-arms on a second
 * click. That is a mode with a visible, one-key way out.
 *
 * ═══ 'move' vs 'order' IS UNOBSERVABLE, and the order between them is therefore not a decision.
 * `armed` is ONE string from ONE mutually-exclusive slot (`hud.js` `_armed`, `nextArmedTool`), so at
 * most one of the two branches can ever match; no input exists that distinguishes them. `move` is
 * left first purely to keep the diff to one inserted line. Do not read a precedence into it.
 * PURE.
 * @param {null|'move'|string} armed
 * @param {{pawnCid?:*, terminalId?:*, roomAnchor?:string}} [hit]
 * @returns {{type:'move'|'order'|'erase'|'select'|'terminal'|'enterRoom'|'none',
 *            tool?:string, cid?:*, tid?:*, anchor?:string}}
 */
export function overviewClickAction(armed, hit) {
  const h = hit || {};
  if (armed === 'move') return { type: 'move' };
  if (isOrderTool(armed)) return { type: 'order', tool: armed };
  // ERASE sits in the same tier as 'order' and for the same reason: an armed tool owns the click, so
  // arming it and clicking a room takes the order off that tile instead of entering the room. Which
  // of the two branches comes first is UNOBSERVABLE — `armed` is one string from one exclusive slot —
  // exactly as the note above says of 'move' vs 'order'. Do not read a precedence into it.
  if (isEraseTool(armed)) return { type: 'erase' };
  if (h.pawnCid != null) return { type: 'select', cid: h.pawnCid };
  if (h.terminalId != null) return { type: 'terminal', tid: h.terminalId };
  if (h.roomAnchor) return { type: 'enterRoom', anchor: h.roomAnchor };
  return { type: 'none' };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Command-bar tab gating. CHRONICLE still renders as a tab button (the slot is kept) but is INERT
// for now — its legacy console surface is not wired to the Overview, so selecting it would un-hide
// the old `.app` and strand the player. Clicking it is a silent no-op; BUILD/CREW/MOSS/RELATIONS are
// unaffected. Pure predicate so the view's click handler stays declarative + node-testable.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Tabs rendered in the command bar but with no action bound (kept visible, but inert). PURE. */
export const INERT_TABS = Object.freeze(['chron']);

/** True when a command-bar tab is present-but-inert (clicking it must do nothing). PURE. */
export function tabIsInert(key) {
  return INERT_TABS.indexOf(key) >= 0;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LENS recolor (IX-O-29/30). A non-`none` lens grades each room by one metric; the grade picks a
// translucent wash painted over the floor. Grades reuse the console's danger language (one meaning,
// one colour). Water has no per-room wire value (rooms carries no H₂O) and power is a per-slot
// `active` flag, not an atmos number — both are handled by the caller, so `lensGrade` returns null
// for them and never fabricates a reading.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** grade → the translucent floor wash (warm STATUS ramp; ~.22–.28 alpha to read as an overlay). */
export const GRADE_TINT = Object.freeze({
  good: 'rgba(90,167,127,.22)',
  warn: 'rgba(207,122,51,.26)',
  bad:  'rgba(194,90,63,.30)',
  cold: 'rgba(90,159,212,.26)',
});

/**
 * The lens grade for one room's atmosphere, or null when the lens carries no per-room reading here
 * (lens `none`, an unknown lens, `power`/`water` which the caller derives, or a null atmos). PURE.
 * @param {string} lens  frame.lens ('none'|'oxygen'|'co2'|'temperature'|'pressure'|'power'|'water')
 * @param {{o2:number,co2ppm:number,tempK:number,pressureKPa:number}|null} atmos
 * @returns {'good'|'warn'|'bad'|'cold'|null}
 */
export function lensGrade(lens, atmos) {
  if (!atmos || !lens || lens === 'none') return null;
  switch (lens) {
    case 'oxygen': {
      const o = atmos.o2;                    // fraction 0..1 (fresh air ≈ 0.21)
      return o >= 0.19 ? 'good' : o >= 0.15 ? 'warn' : 'bad';
    }
    case 'co2': {
      const c = atmos.co2ppm;                // console rails: 1000 warn, 2000 alert
      return c < 1000 ? 'good' : c < 2000 ? 'warn' : 'bad';
    }
    case 'temperature': {
      const k = atmos.tempK;                 // comfortable ≈ 292–298 K; cold end reads cool
      if (k >= 291 && k <= 299) return 'good';
      if (k < 283) return 'cold';
      return 'warn';
    }
    case 'pressure': {
      const p = atmos.pressureKPa;           // sea-level ≈ 101 kPa
      return (p >= 90 && p <= 115) ? 'good' : (p >= 70 && p <= 130) ? 'warn' : 'bad';
    }
    default: return null;                    // power / water / unknown — caller's job or no data
  }
}

/**
 * The lens wash colour for one slot, or null (no wash → resting floor shows). Handles the `power`
 * lens from the slot's `active` flag (the same live power/lit predicate the amber glow reads,
 * VS-O-31/63): active → good, inactive → bad. Atmos lenses defer to `lensGrade`. PURE.
 * @param {string} lens
 * @param {{atmos?:object|null, active?:boolean}} slot   a decoded deck-view slot
 * @returns {string|null}
 */
export function lensSlotTint(lens, slot) {
  if (!lens || lens === 'none' || !slot) return null;
  if (lens === 'power') return GRADE_TINT[slot.active ? 'good' : 'bad'];
  const g = lensGrade(lens, slot.atmos || null);
  return g ? GRADE_TINT[g] : null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Selected crew → current room join (VS-O-62/63). Find the bound room slot whose tile-rect covers
// the crew's tile on the shown deck; surfaces the display name, atmosphere and derived power.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** True when (x,y) lies inside the slot's tile rect. PURE. */
function inRect(rect, x, y) {
  return rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/**
 * The room a crew member stands in, from the deck-view slots, or null when they are in no bound
 * room (a hall / corridor gap). `deckView` is one `decksView` entry's `slots`. PURE.
 * @param {{x:number,y:number}|null} crewTile
 * @param {Array|null} slots
 * @returns {{anchorName:string, displayName:string, atmos:object|null, active:boolean}|null}
 */
export function currentRoom(crewTile, slots) {
  if (!crewTile || !Array.isArray(slots)) return null;
  for (const s of slots) {
    if (s && s.occupied && inRect(s.rect, crewTile.x, crewTile.y)) {
      return {
        anchorName: s.anchorName, displayName: s.displayName || s.anchorName || '',
        atmos: s.atmos || null, active: !!s.active,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Deck rail (VS-O-49/50/51 / IX-O-26). One pip per existing deck, highest deck number on top so
// up/down reads spatially. Before the decks channel lands, only the active deck's pip shows.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The deck-rail pips, highest deck first. `decksView` is the decoded per-deck list ([{deck,slots}]);
 * `activeDeck` is `frame.deck`. Empty/absent decks → a single active pip (the honest "not yet
 * known" state, IX-O-47/51). PURE.
 * @param {Array<{deck:number}>|null} decksView @param {number} activeDeck
 * @returns {{deck:number, active:boolean}[]}
 */
export function deckPips(decksView, activeDeck) {
  const a = (activeDeck | 0);
  const decks = Array.isArray(decksView) ? decksView.map((d) => d.deck | 0) : [];
  if (!decks.length) return [{ deck: a, active: true }];
  const uniq = Array.from(new Set(decks)).sort((x, y) => y - x); // highest first
  return uniq.map((deck) => ({ deck, active: deck === a }));
}

/** The relative `Cmd.deck(delta)` to reach a target deck from the current one (IX-O-26). PURE. */
export function deckDelta(targetDeck, currentDeck) {
  return (targetDeck | 0) - (currentDeck | 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Escape rung reducer (IX-O-35). The console's `escapeTarget` order (armed → dialogue → moss →
// relations → none) with ONE added rung — a Level-2 room-zoom ascends to Level-1 — slotted below
// relations and above no-op. The Level-2 side is owned by the roomzoom lane; here the rung only
// exists so the reducer is complete and future-proof (roomZoomOpen is always false until it lands).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{armed:boolean, dialogueOpen:boolean, mossActive?:boolean, relationsActive?:boolean, roomZoomOpen?:boolean}} s
 * @returns {'disarm'|'dialogue'|'moss'|'relations'|'ascend'|'none'}
 */
export function overviewEscape(s) {
  if (s && s.armed) return 'disarm';
  if (s && s.dialogueOpen) return 'dialogue';
  if (s && s.mossActive) return 'moss';
  if (s && s.relationsActive) return 'relations';
  if (s && s.roomZoomOpen) return 'ascend';
  return 'none';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Readout atmos formatters (VS-O-63). RAW room values → display text; the client owns all
// formatting (%, °C). InvariantCulture-safe: round + string concat only.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** O₂ fraction (0..1) → "NN%". PURE. */
export function fmtO2(o2) {
  const v = typeof o2 === 'number' && isFinite(o2) ? o2 : 0;
  return Math.round(v * 100) + '%';
}

/** CO₂ ppm → "N ppm" (rounded integer). PURE. */
export function fmtCo2(ppm) {
  const v = typeof ppm === 'number' && isFinite(ppm) ? ppm : 0;
  return Math.round(v) + ' ppm';
}

/** Kelvin → "NN°C" (rounded). PURE. */
export function fmtTemp(tempK) {
  const v = typeof tempK === 'number' && isFinite(tempK) ? tempK : 0;
  return Math.round(v - 273.15) + '°C';
}

/** The coarse per-room power state from the slot `active` flag (VS-O-63). PURE. */
export function powerLabel(active) {
  return active ? 'ON' : 'OFF';
}
