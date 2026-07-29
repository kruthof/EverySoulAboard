// Tests for the PURE Overview view-model (client/src/ui/overview-model.js). No DOM, no GPU. Proves:
// the click→action classification honours the single disambiguation rule, the lens grade + tint
// mapping is honest (no fabricated water/power atmos), the selected→current-room join, the deck-rail
// pip list + delta, the Escape rung reducer (every rung incl. the added Level-2 ascent), the atmos
// formatters, and the tile projection round-trips through the real scene transform.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { makeTransform } from '../src/ui/overview-scene.js';
import {
  tileAt, overviewClickAction, lensGrade, lensSlotTint, GRADE_TINT, currentRoom,
  deckPips, deckDelta, overviewEscape, fmtO2, fmtCo2, fmtTemp, powerLabel, tabIsInert,
  ORDER_TOOLS, ORDER_LABEL, isOrderTool, orderHintLine, orderPlacedLine,
  ERASE_TOOL, ERASE_LABEL, isEraseTool, markNameAt, erasePlacedLine,
} from '../src/ui/overview-model.js';
// The un-designate precedence itself lives in `room-model.js` and is SHARED by both surfaces —
// imported here so the Overview's expected payload is derived from the same table the controller
// runs on, rather than from a second literal that could quietly agree with a broken one.
import { eraseTarget, tileOrders } from '../src/ui/room-model.js';
// ACCEPT_ALL + stockFilterLabel are used ONLY to prove this surface names NO accept-set any more:
// `defaultStockFilter` went with the seam (see `room-model.test.js`, which now imports it).
import { ACCEPT_ALL, stockFilterLabel } from '../src/ui/stock-filter-model.js';
import { MARK_KIND_NAMES } from '../src/wire/messages.js';
import { LEDGER_ROW_IDS } from '../src/ui/ledger-model.js';
import { codeOnly, callBlocks } from './code-only.js';
import { DocumentLite as DomDocument, Element as DomEl, fire } from './dom-lite.js';

const FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);
const decks = decodeDecks(decode(JSON.stringify(FIX.decks)));
const rooms = decodeRooms(decode(JSON.stringify(FIX.rooms)));
const view = decksView(decks, rooms);
const frame = FIX.frame;

// ---- command-bar tab gating (CHRONICLE kept but inert) ----

test('CHRONICLE is inert; BUILD/CREW/MOSS/RELATIONS are not', () => {
  assert.equal(tabIsInert('chron'), true);            // kept in the bar, but clicking does nothing
  for (const t of ['build', 'crew', 'moss', 'relations']) {
    assert.equal(tabIsInert(t), false, t + ' must stay actionable');
  }
});

// ---- click classification (IX-O-11/12/13/15/19) ----

test('building is zoom-only: an armed build tool never builds on the Overview — it falls through', () => {
  // walls/floors are placed inside the Room Zoom, not on the ship schematic. A stale wall/door/cancel
  // from the shared console slot is ignored here; the click resolves by the normal hit rule.
  for (const tool of ['wall', 'door', 'cancel']) {
    assert.deepEqual(overviewClickAction(tool, { pawnCid: 5 }), { type: 'select', cid: 5 });
    assert.deepEqual(overviewClickAction(tool, { roomAnchor: 'reactor' }), { type: 'enterRoom', anchor: 'reactor' });
    assert.deepEqual(overviewClickAction(tool, {}), { type: 'none' });
  }
});

test('the move order classifies as a move target over any hit', () => {
  assert.deepEqual(overviewClickAction('move', { roomAnchor: 'mess' }), { type: 'move' });
});

test('with no tool: pawn > terminal > add-room > room > space (the single disambiguation rule)', () => {
  assert.deepEqual(overviewClickAction(null, { pawnCid: 42, roomAnchor: 'mess' }),
    { type: 'select', cid: 42 });
  assert.deepEqual(overviewClickAction(null, { addRoomSlot: 3 }), { type: 'addroom', slot: 3 });
  assert.deepEqual(overviewClickAction(null, { roomAnchor: 'reactor' }),
    { type: 'enterRoom', anchor: 'reactor' });
  assert.deepEqual(overviewClickAction(null, { hallSlot: 2 }), { type: 'none' });
  assert.deepEqual(overviewClickAction(null, {}), { type: 'none' });
});

// ---- WP-5: the ORDERS bar, PURE half (the precedence decision + the readback) ----

test('the ORDERS bar arms the two POINT-AT-A-THING verbs, in the console\'s own order', () => {
  assert.deepEqual([...ORDER_TOOLS], ['dig', 'strip']);
  for (const t of ORDER_TOOLS) {
    assert.equal(isOrderTool(t), true, t + ' must classify as an order tool');
    assert.ok(ORDER_LABEL[t], t + ' has no bar label');
  }
  // BUILDING IS ZOOM-ONLY: no build kind may sneak into the bar. `move` is a crew order, not a
  // designation, and it has its own branch — it must not be an order tool either.
  //
  // AND NEITHER IS `stockpile`, WHICH IS THE POINT OF THIS PACKAGE. A stockpile authors a REGION out
  // of nothing and its extent is the whole decision (one stack per zoned tile, so area == capacity),
  // while this surface has no drag gesture at all — so it lives on the Room Zoom palette, where a
  // drag sweeps a filled rectangle. `ROOM_TOOLS` is asserted to hold it in room-model.test.js, and
  // `surface-boundary.test.js` proves the union of the two tables still covers every console verb.
  for (const t of ['wall', 'floor', 'door', 'cancel', 'move', 'stockpile', null, undefined, '']) {
    assert.equal(isOrderTool(t), false, String(t) + ' must NOT classify as an order tool');
  }
  // …and the LABEL table went with it: a leftover label is how a button comes back by accident.
  assert.equal(ORDER_LABEL.stockpile, undefined,
    'ORDER_LABEL still carries a STOCKPILE label. The bar renders one button per ORDER_TOOLS entry, ' +
    'so a stale label is inert TODAY — and it is exactly the thing a future author reads as ' +
    'evidence that the verb belongs here.');
});

// The counterpart of the pure assertion above, and the one that would catch the whole package being
// reverted by hand: `stockpile` armed must fall through to the ORDINARY HIT RULE rather than
// designating a single tile at schematic altitude. Clicking a room ENTERS it — which is where the
// tool now is, so the fall-through is also the migration path.
test('an armed STOCKPILE is not an order HERE — the click resolves by the hit rule', () => {
  assert.deepEqual(overviewClickAction('stockpile', { roomAnchor: 'hold' }),
    { type: 'enterRoom', anchor: 'hold' },
    'STOCKPILE armed on the Overview still designates a tile. It must fall through: the verb moved ' +
    'to the Room Zoom, and a click on a room should take the player there.');
  assert.deepEqual(overviewClickAction('stockpile', { pawnCid: 9 }), { type: 'select', cid: 9 });
  assert.deepEqual(overviewClickAction('stockpile', {}), { type: 'none' });
  // NON-VACUITY: the same hits under a verb that DID stay produce 'order', so the assertions above
  // are about `stockpile` and not about a classifier that stopped working altogether.
  assert.deepEqual(overviewClickAction('dig', { roomAnchor: 'hold' }), { type: 'order', tool: 'dig' });
});

test('WP-5: an armed ORDER tool takes the click from EVERY hit — pawn, terminal, ＋ADD ROOM, room', () => {
  // The three overtaken hits are measured holes, not hypotheticals — see overviewClickAction's doc:
  // crew stand ON the grid ship's dig designations; a device is exactly what STRIP targets; and
  // WP-1's wreck-fill put the debris in the halls, where the ＋ADD ROOM chip lives.
  const everyHit = { pawnCid: 7, terminalId: 'con-3', addRoomSlot: 2, roomAnchor: 'hold', hallSlot: 2 };
  for (const tool of ORDER_TOOLS) {
    assert.deepEqual(overviewClickAction(tool, everyHit), { type: 'order', tool });
    // and one hit at a time, so a single mis-ordered branch cannot hide behind the others
    for (const hit of [{ pawnCid: 7 }, { terminalId: 'con-3' }, { addRoomSlot: 2 }, { roomAnchor: 'hold' }, {}]) {
      assert.deepEqual(overviewClickAction(tool, hit), { type: 'order', tool },
        `${tool} lost the click to ${JSON.stringify(hit)}`);
    }
  }
});

test('WP-5: the order branch changes NOTHING for move, build tools, or the un-armed hit rule', () => {
  // Regression fence around the inserted line. MOVE still wins (it is above the new branch, and the
  // two can never both match — one slot, one string).
  assert.deepEqual(overviewClickAction('move', { pawnCid: 7, roomAnchor: 'hold' }), { type: 'move' });
  // Build tools still fall through to the hit rule (building is zoom-only).
  for (const tool of ['wall', 'floor', 'door', 'cancel']) {
    assert.deepEqual(overviewClickAction(tool, { pawnCid: 5 }), { type: 'select', cid: 5 });
    assert.deepEqual(overviewClickAction(tool, { terminalId: 'con-1' }), { type: 'terminal', tid: 'con-1' });
    assert.deepEqual(overviewClickAction(tool, { addRoomSlot: 1 }), { type: 'addroom', slot: 1 });
    assert.deepEqual(overviewClickAction(tool, { roomAnchor: 'reactor' }), { type: 'enterRoom', anchor: 'reactor' });
    assert.deepEqual(overviewClickAction(tool, {}), { type: 'none' });
  }
  // And the un-armed ladder is untouched, rung by rung.
  assert.deepEqual(overviewClickAction(null, { pawnCid: 5, terminalId: 't', addRoomSlot: 1, roomAnchor: 'r' }),
    { type: 'select', cid: 5 });
  assert.deepEqual(overviewClickAction(null, { terminalId: 't', addRoomSlot: 1, roomAnchor: 'r' }),
    { type: 'terminal', tid: 't' });
  assert.deepEqual(overviewClickAction(null, { addRoomSlot: 1, roomAnchor: 'r' }), { type: 'addroom', slot: 1 });
  assert.deepEqual(overviewClickAction(null, { roomAnchor: 'r' }), { type: 'enterRoom', anchor: 'r' });
  assert.deepEqual(overviewClickAction(null, { hallSlot: 4 }), { type: 'none' });
  // There is NO build action on this surface, under any armed tool or hit. (Non-vacuity for the
  // whole sweep: at least one action really was produced.)
  const seen = new Set();
  for (const tool of [null, 'move', 'wall', 'floor', 'door', 'cancel', ...ORDER_TOOLS]) {
    for (const hit of [{}, { pawnCid: 1 }, { terminalId: 't' }, { addRoomSlot: 0 }, { roomAnchor: 'r' }, { hallSlot: 0 }]) {
      seen.add(overviewClickAction(tool, hit).type);
    }
  }
  assert.ok(!seen.has('build'), `overviewClickAction produced a 'build' action: ${[...seen]}`);
  assert.ok(seen.size >= 6, `only ${seen.size} action types produced — the sweep is not exercising the ladder`);
});

test('the ORDERS readback names the DECK in every branch, and NAMES NO MASK in any', () => {
  // The deck is the whole point: the order verbs carry no z on the wire, so "which deck does this
  // land on?" is answerable only by what the surface says.
  for (const armed of [null, 'move', 'wall', 'stockpile', ...ORDER_TOOLS]) {
    assert.match(orderHintLine(armed, 5), /DECK 5/, `the hint for armed=${armed} does not name the deck`);
    assert.match(orderHintLine(armed, 0), /DECK 0/);
  }
  assert.match(orderHintLine('dig', 1), /DIG/);
  assert.match(orderHintLine('strip', 1), /STRIP/);
  // NO BRANCH NAMES AN ACCEPT-SET ANY MORE — the mask moved to the Room Zoom with the verb, and a
  // readback that still advertised a filter would be advertising a setting for a tool this bar
  // cannot arm. The extra `FOOD` argument is passed on purpose: a surviving third parameter would
  // show up here as an accept-set in the output.
  const FOOD = 1 << 3;
  for (const armed of [null, 'move', 'dig', 'strip', 'stockpile']) {
    assert.ok(!/ACCEPTS/.test(orderHintLine(armed, 2, FOOD)),
      `the ORDERS readback for armed=${armed} still names an accept-set. The mask seam left this ` +
      'surface with the STOCKPILE verb (overview-model.js header); naming a filter here promises a ' +
      'setting the bar has no tool for.');
    assert.equal(orderHintLine(armed, 2, FOOD), orderHintLine(armed, 2, ACCEPT_ALL),
      `orderHintLine still READS a third argument for armed=${armed}`);
  }
  // NON-VACUITY, both halves: `stockFilterLabel` still spells masks differently (so "no ACCEPTS" is
  // a fact about this function and not about a dead label function), and the un-armed line points
  // the player at where the verb went rather than silently dropping it.
  assert.notEqual(stockFilterLabel(FOOD), stockFilterLabel(ACCEPT_ALL));
  assert.match(orderHintLine(null, 2), /STOCKPILE ARE ZOOM-ONLY/,
    'the un-armed readback no longer says where STOCKPILE went. A player who used this bar three ' +
    'times will read a missing button as a deleted verb.');
  // InvariantCulture-safe: no thousands separators / locale digits leak in from a big deck number.
  assert.match(orderHintLine(null, 1234), /DECK 1234/);
});

// `orderPlacedLine` — the readback the Overview had no equivalent of at all until the owner reported
// that a strip order there produced no feedback anywhere (HANDOVER §4g). PURE, so it is pinned here
// next to the hint line it answers; the wiring is driven in the DOM section below.
test('orderPlacedLine names the verb, the tile and the deck — and never re-teaches the hotkey', () => {
  for (const tool of ORDER_TOOLS) {
    const line = orderPlacedLine(tool, 24, 1, 3);
    assert.match(line, /ORDERED/, `${tool}: the line does not say an order was placed`);
    assert.match(line, /24,1/, `${tool}: the line does not name the tile`);
    assert.match(line, /DECK 3/, `${tool}: the line does not name the deck the verb is scoped to`);
    // The label is ORDER_LABEL minus its `[G]`/`[V]` prefix — the verb, not the affordance.
    assert.ok(!/\[[A-Z]\]/.test(line), `${tool}: the hotkey prefix leaked into the toast`);
    assert.ok(line.includes(ORDER_LABEL[tool].replace(/^\[[A-Z]\]\s*/, '')),
      `${tool}: the toast spells the verb differently from the bar button beside it`);
  }
  // The two verbs are DISTINGUISHABLE — a line that read the same for both would tell the player
  // nothing about which tool was armed, which is the state this whole surface makes easy to lose.
  assert.notEqual(orderPlacedLine('dig', 1, 1, 0), orderPlacedLine('strip', 1, 1, 0));

  // NOT A CLAIM THAT THE SIM ACCEPTED IT. `orderPayloads` promises only the attempt (the sim
  // re-validates and an illegal tile is a silent no-op), so the wording must stay `ORDERED` and must
  // never assert the outcome — that would rebuild on the client the exact lie just removed from
  // `GameSession.HandleStrip`.
  assert.ok(!/CONDEMNED|DESIGNATED|DONE/.test(orderPlacedLine('strip', 1, 1, 0)));

  // A tool this bar does not lower says nothing at all rather than inventing a line for it.
  assert.equal(orderPlacedLine('stockpile', 1, 1, 0), '', 'STOCKPILE is zoom-only on this surface');
  assert.equal(orderPlacedLine('wall', 1, 1, 0), '');
  assert.equal(orderPlacedLine(null, 1, 1, 0), '');
  // InvariantCulture-safe: integers only, no locale digits or separators.
  assert.match(orderPlacedLine('dig', 1234, 5678, 90), /1234,5678 ON DECK 90/);
});

test('a MOSS terminal hit classifies as `terminal` (opens MOSS); pawn wins, terminal beats the room', () => {
  // a bare terminal → open its MOSS program
  assert.deepEqual(overviewClickAction(null, { terminalId: 'con-3' }), { type: 'terminal', tid: 'con-3' });
  // a crew member standing ON a console still selects as a pawn (pawns sit on top)
  assert.deepEqual(overviewClickAction(null, { pawnCid: 7, terminalId: 'con-3' }),
    { type: 'select', cid: 7 });
  // the terminal beats the room it sits in (you want MOSS, not room-zoom)
  assert.deepEqual(overviewClickAction(null, { terminalId: 'con-3', roomAnchor: 'command' }),
    { type: 'terminal', tid: 'con-3' });
  // building is zoom-only: an armed build tool does NOT win — the terminal hit still resolves.
  assert.deepEqual(overviewClickAction('wall', { terminalId: 'con-3' }), { type: 'terminal', tid: 'con-3' });
});

// ---- lens grade + tint (IX-O-29/30) ----

test('lensGrade grades oxygen / co2 / temperature / pressure honestly', () => {
  assert.equal(lensGrade('oxygen', { o2: 0.21 }), 'good');
  assert.equal(lensGrade('oxygen', { o2: 0.16 }), 'warn');
  assert.equal(lensGrade('oxygen', { o2: 0.10 }), 'bad');
  assert.equal(lensGrade('co2', { co2ppm: 400 }), 'good');
  assert.equal(lensGrade('co2', { co2ppm: 1500 }), 'warn');
  assert.equal(lensGrade('co2', { co2ppm: 16677 }), 'bad');
  assert.equal(lensGrade('temperature', { tempK: 295 }), 'good');
  assert.equal(lensGrade('temperature', { tempK: 275 }), 'cold');
  assert.equal(lensGrade('pressure', { pressureKPa: 101 }), 'good');
});

test('lensGrade never fabricates a reading it does not have', () => {
  assert.equal(lensGrade('none', { o2: 0.21 }), null);
  assert.equal(lensGrade('water', { o2: 0.21 }), null); // rooms carries no per-room H₂O
  assert.equal(lensGrade('power', { o2: 0.21 }), null); // power is a per-slot flag, not atmos
  assert.equal(lensGrade('oxygen', null), null);
});

test('lensSlotTint derives the power lens from the slot active flag', () => {
  assert.equal(lensSlotTint('power', { active: true }), GRADE_TINT.good);
  assert.equal(lensSlotTint('power', { active: false }), GRADE_TINT.bad);
  assert.equal(lensSlotTint('none', { active: true }), null);
  assert.equal(lensSlotTint('oxygen', { atmos: { o2: 0.21 } }), GRADE_TINT.good);
});

// ---- current-room join (VS-O-62/63) ----

test('currentRoom finds the bound room a crew tile falls in, else null', () => {
  const slots = view[0].slots;
  const occ = slots.find((s) => s.occupied);
  const inside = { x: occ.rect.x + 1, y: occ.rect.y + 1 };
  const r = currentRoom(inside, slots);
  assert.equal(r.anchorName, occ.anchorName);
  assert.equal(currentRoom({ x: -5, y: -5 }, slots), null);
  assert.equal(currentRoom(null, slots), null);
});

// ---- deck rail (VS-O-49/51 / IX-O-26) ----

test('deckPips lists every deck highest-first with the active one flagged', () => {
  const pips = deckPips(view, 0);
  assert.equal(pips.length, 8);
  assert.equal(pips[0].deck, 7);            // highest on top
  assert.equal(pips[pips.length - 1].deck, 0);
  assert.equal(pips.find((p) => p.active).deck, 0);
});

test('deckPips falls back to a single active pip before decks land', () => {
  assert.deepEqual(deckPips(null, 3), [{ deck: 3, active: true }]);
  assert.deepEqual(deckPips([], 2), [{ deck: 2, active: true }]);
});

test('deckDelta is the relative Cmd.deck step', () => {
  assert.equal(deckDelta(5, 2), 3);
  assert.equal(deckDelta(1, 4), -3);
});

// ---- Escape rung reducer (IX-O-35) ----

test('overviewEscape follows the rung order incl. the Level-2 ascent', () => {
  assert.equal(overviewEscape({ armed: true, dialogueOpen: true, mossActive: true }), 'disarm');
  assert.equal(overviewEscape({ armed: false, dialogueOpen: true, mossActive: true }), 'dialogue');
  assert.equal(overviewEscape({ armed: false, dialogueOpen: false, mossActive: true }), 'moss');
  assert.equal(overviewEscape({ relationsActive: true }), 'relations');
  assert.equal(overviewEscape({ roomZoomOpen: true }), 'ascend');
  assert.equal(overviewEscape({}), 'none');
  assert.equal(overviewEscape({ relationsActive: true, roomZoomOpen: true }), 'relations');
});

// ---- tile projection round-trip (IX-O-19) ----

test('tileAt inverts the scene transform back to a sim tile', () => {
  const t = makeTransform(view[0].slots, frame);
  const [sx, sy] = t.project(8 + 0.5, 8 + 0.5); // centre of tile (8,8)
  assert.deepEqual(tileAt(t, sx, sy, frame), { x: 8, y: 8 });
  // out of bounds → null
  const [ox, oy] = t.project(frame.w + 4, frame.h + 4);
  assert.equal(tileAt(t, ox, oy, frame), null);
  assert.equal(tileAt(null, 0, 0, frame), null);
});

// ---- atmos formatters (VS-O-63) ----

test('the atmos formatters are InvariantCulture-safe', () => {
  assert.equal(fmtO2(0.209), '21%');
  assert.equal(fmtCo2(16677.4), '16677 ppm');
  assert.equal(fmtTemp(293.15), '20°C');
  assert.equal(fmtTemp(288.4), '15°C');
  assert.equal(powerLabel(true), 'ON');
  assert.equal(powerLabel(false), 'OFF');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-5, DRIVEN: the real `overview-view.js` controller over `dom-lite`.
//
// WHY DRIVEN AND NOT SCANNED. The whole risk of this package is in two behaviours a source scan
// cannot see. (1) THE SUPPRESSION: with an order armed, a click on a room must NOT enter the room.
// (2) THE LOWERING: this is now the THIRD independent path that turns these verbs into wire
// payloads (the console's `paletteOrders`, the Room Zoom's `orderCmd`, and this surface's
// `orderPayloads`), and the day any two disagree is the day one surface sends a message the host
// reads differently. Neither is a token. So the controller is instantiated and every assertion
// below reads the payloads that came out of the INJECTED `send`, or a hook that was or was not
// called. (The standing rule, `docs/HANDOVER.md` §4: "if a module has an injectable seam, a source
// scan is not an acceptable instrument".)
//
// PARITY IS PINNED BY IMPORT, NOT BY LITERAL. Every expected payload is compared against what
// `paletteOrders(verb, x, y, mask)` ACTUALLY returns, imported from `controls.js` — so a drift on
// EITHER side reddens. `orderPayloads` deliberately does not CALL `paletteOrders`; if it did, a
// drift there would move both sides together and equality would stay green through it. Two absolute
// wire-shape pins are kept alongside (a `Cmd.stockpile` change moves both paths at once, so
// equality alone would not see it).
//
// THE DOM IS A STUB, and its limits are stated rather than worked around:
//   • `dom-lite` parses no markup. `innerHTML` is stored as a STRING (which is how the bar's own
//     markup is asserted, exactly as `room-model.test.js` reads `rz-palette`), and `querySelector`
//     returns a memoised STAND-IN per selector so the paint helpers write into real nodes.
//   • Consequently `_el.toolBtns` holds stand-ins with no `data-ov-tool`, so the `.on` armed-state
//     CLASS on the rendered buttons is NOT proven here — the same limit WP-4 recorded. What IS
//     proven is the armed STATE (the shared `Hud` slot) and the surface's own readback (the hint
//     line, a real node this code writes into), which is what a player actually reads.
//   • The SVG CTM is the IDENTITY, so viewBox units are client pixels and a tile centre is
//     `transform.project(tx + .5, ty + .5)` — the same projection `tileAt` inverts above.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** dom-lite + the four extras `overview-view.js` needs: innerHTML, querySelector(All), closest and
 *  the reconcile-list DOM (firstElementChild / insertBefore). Subclassed here so the shared helper
 *  keeps its narrow contract. */
class OvEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._html = '';
    this._qs = new Map();
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  /** A memoised stand-in per selector: no markup parser, but a STABLE node, so `setText`/`setCls`
   *  write somewhere a test can read back. Returning null instead would make every paint helper a
   *  silent no-op and every assertion below vacuous. */
  querySelector(sel) {
    if (!this._qs.has(sel)) this._qs.set(sel, new OvEl(this.ownerDocument, 'div'));
    return this._qs.get(sel);
  }
  /** One stand-in per selector. The sensor-log painter indexes slot 0 unconditionally, so an empty
   *  list would crash the controller rather than test it. */
  querySelectorAll(sel) { return [this.querySelector('all:' + sel)]; }
  get firstElementChild() { return this.childNodes.find((c) => c.nodeType === 1) || null; }
  get nextElementSibling() {
    const p = this.parentNode;
    if (!p) return null;
    const i = p.childNodes.indexOf(this);
    return p.childNodes.slice(i + 1).find((c) => c.nodeType === 1) || null;
  }
  insertBefore(node, ref) {
    if (node.parentNode) node.remove();
    node.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(node); else this.childNodes.splice(i, 0, node);
    return node;
  }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (sel.startsWith('.')) { if (n.classList.contains(sel.slice(1))) return n; }
      else if (sel.startsWith('#')) { if (n._id === sel.slice(1)) return n; }
      else if (n.tagName === sel.toUpperCase()) return n;
      n = n.parentNode;
    }
    return null;
  }
}
class OvDoc extends DomDocument {
  constructor() { super(); this.body = new OvEl(this, 'body'); }
  createElement(tag) { return new OvEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

/** The ids `overview-view.js` looks up, plus the five `hud.js` writes UNGUARDED on a frame dispatch
 *  (`setChip` / `reflectLens` — see `room-model.test.js`, which registers the same five). */
const OV_IDS = [
  'overview-view', 'ov-stage', 'ov-toast', 'ov-nudge', 'ov-topbar', 'ov-deckrail', 'ov-crewwatch',
  'ov-readout', 'ov-lens', 'ov-cmd', 'ov-sensor', 'ov-ledger', 'ov-picker',
  's-deck', 's-lens', 'legendcard', 'crew-count', 'crewlist',
  // ⚠️ ADDED FOR THE PAUSED-NUDGE LEG (M1-C review, 2026-07-29) — trap 4's corollary: if the harness
  // cannot model what the guard needs to see, fix the harness. `nudgeOnIntent` asks `isPaused()`,
  // which reads `Hud.getStatus()`, whose only writer is `renderStatus` — and that paints six
  // console-shell ids on the way past (`hud.js:246-262`). Without them the erase branch's `if
  // (target)` guard is unreachable in node, and it was: deleting it left the whole suite green.
  's-speed', 's-msg', 's-runstate', 's-pauselabel', 'b-pause', 's-speedchip',
];

/** A fresh document carrying every id the controller looks up. */
function makeOvDoc() {
  const d = new OvDoc();
  for (const id of OV_IDS) {
    const e = new OvEl(d, 'div');
    e._id = id;
    if (id.startsWith('ov-')) e.className = id;   // `#ov-stage` really does carry `.ov-stage`
    d.register(id, e);
  }
  return d;
}

const ovDoc = makeOvDoc();
globalThis.document = ovDoc;
/** A window stub that RECORDS its listeners WITH THEIR PHASE. `overview-view.js` binds
 *  `pointerup`/`pointercancel` there — the clear for the press latch that stops a release beginning
 *  off the schematic from resolving on it — so the shared no-op stub would leave that half of the
 *  gesture undrivable and the guard below unfalsifiable. Same shape and same reason as
 *  `room-model.test.js`'s `makeRzWindow`. ONE bag is right here because there is exactly one mount.
 *
 *  ⚠️ THE PHASE IS RECORDED BECAUSE IT IS LOAD-BEARING, and a phase-blind stub let a one-word
 *  regression through review with the whole suite green: adding a third argument `true` to those two
 *  `window.addEventListener` calls moves the clear to CAPTURE, where it runs BEFORE `_stage`'s own
 *  handler, empties the latch every time, and kills the entire room-entry gesture SILENTLY.
 *  `dom-lite`'s `fire` walks parents only and cannot model phase at all, which is why `firePointer`
 *  below exists and why nothing in this file dispatches a pointer event any other way. */
const ovWinListeners = {};
globalThis.window = {
  addEventListener(t, fn, opts) {
    const capture = opts === true || !!(opts && opts.capture === true);
    (ovWinListeners[t] = ovWinListeners[t] || []).push({ fn, capture });
  },
  removeEventListener() {},
};

/**
 * Dispatch a pointer event IN THE BROWSER'S OWN PHASE ORDER: window CAPTURE listeners first, then
 * the element path from the target up through its ancestors, then window BUBBLE listeners. One
 * shared event object throughout, so `stopPropagation` behaves.
 *
 * It re-implements `dom-lite`'s `fire` walk rather than calling it, deliberately: `fire` builds its
 * OWN event and knows nothing about window, so sandwiching it between two window phases would hand
 * the three phases three different event objects — and the middle one would be the only one that
 * could stop propagation. Eight lines is the cheaper honesty.
 */
function firePointer(target, type, extra) {
  const e = {
    type, target, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; },
    stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  const windowPhase = (capture) => {
    for (const l of (ovWinListeners[type] || []).slice()) {
      if (l.capture !== capture) continue;
      l.fn(e);
      if (e.propagationStopped) return true;
    }
    return false;
  };
  if (windowPhase(true)) return e;             // …runs BEFORE the target. This is the mutation trap.
  let n = target;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) {
      fn(e);
      if (e.propagationStopped) return e;
    }
    n = n.parentNode;
  }
  windowPhase(false);                          // …runs AFTER the target, which is what the fix wants.
  return e;
}

/** A node that is NOT under the schematic — a HUD island. A release here is how a press that began
 *  on the scene ends somewhere else, and it reaches window through the ordinary bubble path. */
const ovOffScene = new OvEl(ovDoc, 'div');
// A SYNCHRONOUS rAF: `scheduleRepaint` coalesces into one frame, and every assertion below wants to
// read the surface immediately after the state change that should have repainted it.
//
// IT MUST RETURN 0, and that is not a detail. `scheduleRepaint` does `_raf = raf(() => { _raf = 0;
// … })`: run synchronously, the callback clears the latch and THEN the return value is assigned, so
// a truthy handle latches `_raf` forever and every later repaint is silently dropped. Measured — it
// presented as "arming does not update the readback" and as a stale click transform.
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };

// Resolved AFTER the globals above — these modules touch `document` at init.
const Hud = await import('../src/ui/hud.js');
const Overview = await import('../src/ui/overview-view.js');
const { paletteOrders } = await import('../src/input/controls.js');

/** The live deck transform for the deck currently on screen — the same one the controller caches. */
const ovTransform = (deck = FIX.frame.deck) =>
  makeTransform(view.find((d) => d.deck === deck).slots, FIX.frame);

/**
 * Mount the real controller onto `doc` and give the scene the two SVG APIs `pointToTile` needs.
 * IDENTITY CTM ⇒ viewBox units are client pixels, so a tile centre is `transform.project(x+.5,y+.5)`.
 *
 * Feeding the shared HUD caches the SAME capture the pure assertions above run on means the surface
 * shows the real grid ship, not a hand-built one. NO roster is dispatched: `renderRoster` builds the
 * CONSOLE's crew rows, which dom-lite cannot host.
 */
function mountOverview(doc, opts) {
  globalThis.document = doc;
  Overview.initOverview(opts);
  const root = doc.getElementById('overview-view');
  const stage = doc.getElementById('ov-stage');
  root.appendChild(stage);   // in the real page `#ov-stage` is inside `#overview-view`
  const svg = stage.querySelector('svg.pl-overview');
  svg.getScreenCTM = () => ({ inverse: () => ({}) });
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } });
  Hud.renderDecks(FIX.decks);
  Hud.renderRooms(FIX.rooms);
  Hud.renderFrame(FIX.frame);   // …and this repaint is what populates the click transform
  // ⚠️ `nudge` comes from THIS doc, not from the module-level `ovDoc`. They are DIFFERENT
  // documents — `mountOverview(makeOvDoc(), …)` builds its own — so `ovDoc.getElementById` hands
  // back an element the controller has never seen, and a leg asserting on it fails for a reason
  // that looks exactly like the feature being broken. (It did, once, in review.)
  return { root, stage, cmd: doc.getElementById('ov-cmd'), svg, toast: doc.getElementById('ov-toast'),
    nudge: doc.getElementById('ov-nudge') };
}

/** The pointer payload for a press at the CENTRE of sim tile (tx,ty). */
function tileAtEvent(tx, ty, deck = FIX.frame.deck) {
  const [sx, sy] = ovTransform(deck).project(tx + 0.5, ty + 0.5);
  return { clientX: sx, clientY: sy, detail: 1, button: 0 };
}

/**
 * Press AND release at the centre of sim tile (tx,ty) on `stage`'s surface, targeted at `target`.
 *
 * ⚠️ THIS USED TO FIRE A BARE `click`, AND THAT IS THE CHANGE, NOT AN ACCIDENT (BUG-B, 2026-07-26).
 * The scene resolves its gesture on `pointerup` now, because `paintScene` rebuilds the whole SVG on
 * every 10 Hz repaint and Chrome fires NO `click` at all when that lands between mousedown and
 * mouseup. Every assertion these helpers carry is unchanged; what changed is that they now drive
 * the gesture a player actually makes rather than the event the browser was failing to deliver.
 * Two legs below drive the halves separately.
 */
function clickTile(target, tx, ty, deck = FIX.frame.deck) {
  const at = tileAtEvent(tx, ty, deck);
  firePointer(target, 'pointerdown', at);
  firePointer(target, 'pointerup', at);
}

// ── the harness ──
//
// ⚠️ WP-5's THROWAWAY PROBE MOUNT IS GONE, and its absence is the package. It existed to reach the
// un-injected `_getStockFilter` default that `initOverview` only overrode when handed a function.
// There is no such option and no such default on this surface any more — the whole mask seam moved
// to the Room Zoom with the STOCKPILE verb — so the probe would now be measuring a variable that
// does not exist. The equivalent probe lives in `room-model.test.js`, against `initRoomZoom`.
const ovSent = [];
let ovEntered = [];          // onEnterRoom calls
let ovAdded = [];            // onAddRoom calls
const { root: ovRoot, stage: ovStage, cmd: ovCmd, toast: ovToast, nudge: ovNudgeEl } = mountOverview(makeOvDoc(), {
  send: (o) => ovSent.push(o),
  onEnterRoom: (anchor) => ovEntered.push(anchor),
  onAddRoom: (deck, slot) => ovAdded.push([deck, slot]),
});

/** A scene click at the CENTRE of sim tile (tx,ty), targeted at `target`. Returns what `send` got. */
function ovClick(target, tx, ty, deck = FIX.frame.deck) {
  ovSent.length = 0; ovEntered = []; ovAdded = [];
  clickTile(target, tx, ty, deck);
  return ovSent.slice();
}

/** A scene-layer node the way `overviewScene` emits one: a class + its dataset, inside the stage. */
function ovTarget(cls, data) {
  const el = new OvEl(ovDoc, 'div');
  el.className = cls;
  Object.assign(el.dataset, data || {});
  ovStage.appendChild(el);
  return el;
}

/** Arm a tool the way a player does — a click on a bar button carrying `data-ov-tool`, dispatched
 *  through the surface root's REAL delegated handler (`onHudClick`). Clicking it again disarms. */
const ovToolBtns = new Map();
function ovArm(tool) {
  let b = ovToolBtns.get(tool);
  if (!b) {
    b = new OvEl(ovDoc, 'button');
    b.dataset.ovTool = tool;
    ovRoot.appendChild(b);
    ovToolBtns.set(tool, b);
  }
  fire(b, 'click', { detail: 1 });
}

/** The ORDERS bar's live readback line (a real node the controller writes into). */
const ovHint = () => ovRoot.querySelector('.ov-orderhint').textContent;
const ovOrdersHdr = () => ovRoot.querySelector('.ov-ordershdr').textContent;

/** PER-TEST RESET — in a hook, not inline, so one failing assertion cannot leave a tool armed and
 *  cascade into the next test. AUTHORITATIVE rather than a mirror of what the test thinks it armed:
 *  toggling the armed tool against itself is `nextArmedTool`'s own disarm. */
afterEach(() => {
  if (typeof Hud === 'undefined') return;
  for (let i = 0; i < 8 && Hud.getArmedTool() != null; i++) Hud.armTool(Hud.getArmedTool());
  Hud.renderFrame(FIX.frame);
  ovSent.length = 0; ovEntered = []; ovAdded = [];
});

// ── the bar itself ──

// Without this every arming test below would pass against a bar the player has no buttons for: the
// tests arm through a `data-ov-tool` node they construct themselves. This reads the markup the
// controller actually wrote. (Same reasoning, same shape, as room-model.test.js's palette test.)
test('WP-5 driven: the command bar PAINTS an ORDERS island with all three verbs, labelled', () => {
  const html = ovCmd.innerHTML;
  assert.ok(html.length > 0, 'the command bar painted nothing — this assertion would be vacuous');
  assert.match(html, /class="hud ov-orders"/, 'no ORDERS island in the command bar');
  for (const tool of ORDER_TOOLS) {
    assert.ok(html.includes('data-ov-tool="' + tool + '"'), `no ORDERS button for '${tool}'`);
    assert.ok(html.includes('>' + ORDER_LABEL[tool] + '<'),
      `the '${tool}' button is missing its label '${ORDER_LABEL[tool]}'`);
  }
  // BUILDING IS ZOOM-ONLY — the bar must not have grown a build kind — AND NEITHER MAY STOCKPILE
  // COME BACK. This is the assertion that fails if someone "restores" the third button: everything
  // else in this file is driven through `data-ov-tool` nodes the tests construct themselves, so a
  // re-added button would be invisible to all of them.
  for (const kind of ['wall', 'floor', 'door', 'cancel', 'stockpile']) {
    assert.ok(!html.includes('data-ov-tool="' + kind + '"'),
      `the Overview command bar arms '${kind}'. Building AND stockpile are ZOOM-ONLY: a stockpile ` +
      'authors a region and this surface cannot drag one (overview-model.js header).');
  }
  assert.ok(!html.includes('STOCKPILE'),
    'the ORDERS bar still SAYS "STOCKPILE" somewhere in its markup — a label with no tool');
  // …and the BUILD hint that points into the Room Zoom is still there beside it.
  assert.match(html, /CLICK A ROOM TO BUILD INSIDE IT/);
});

// MUTATIONS this one catches, BOTH of which survived a 639-green suite before it existed:
//   · `setHidden(_el.orders, true)` — the bar is painted and NEVER SHOWN. Every other assertion in
//     this file reads the markup string or the readback node, and both survive an invisible bar.
//   · `setHidden(_el.orders, tab !== 'build' || armed != null)` — the bar vanishes exactly when an
//     order is armed, i.e. at the one moment its readback has something to say.
// The BUILD-tab leg is the non-vacuity: a stand-in element starts `hidden === false`, so "it is
// shown" alone is also satisfied by deleting the `setHidden` call outright. Something must PROVE the
// call happens, and hiding with the tab is that proof.
test('WP-5 driven: the ORDERS bar is SHOWN on the BUILD tab, armed or not — and leaves with it', () => {
  const bar = ovRoot.querySelector('.ov-orders');
  const buildHint = ovRoot.querySelector('.ov-place');
  assert.equal(Hud.getTab(), 'build');
  assert.equal(bar.hidden, false, 'the ORDERS bar is painted but never shown — the whole verb is ' +
    'unreachable, and the markup/readback assertions in this file all survive that');
  ovArm('dig');
  assert.equal(Hud.getArmedTool(), 'dig');             // non-vacuity: it really is armed
  assert.equal(bar.hidden, false,
    'the ORDERS bar vanishes while an order is ARMED — the one moment its readback matters');
  ovArm('dig');
  assert.equal(bar.hidden, false);
  // …and it leaves with the BUILD tab, exactly as the BUILD hint beside it does. This leg is what
  // proves `setHidden` is called at all rather than the stub merely defaulting to visible.
  Hud.selectTab('crew');
  assert.equal(bar.hidden, true, 'the ORDERS bar outlives the BUILD tab it belongs to');
  assert.equal(buildHint.hidden, true, 'its sibling BUILD hint no longer hides either — the tab ' +
    'gating is gone from the whole command bar, not just from the ORDERS island');
  Hud.selectTab('build');
  assert.equal(bar.hidden, false, 'the ORDERS bar never comes back');
});

test('WP-5 driven: the bar arms and disarms through the ONE shared slot, and says so', () => {
  assert.equal(Hud.getArmedTool(), null);
  assert.match(ovHint(), /ZOOM-ONLY/, 'the un-armed readback should teach the rule');
  ovArm('strip');
  assert.equal(Hud.getArmedTool(), 'strip', 'the bar button did not arm the shared slot');
  assert.match(ovHint(), /STRIP/, 'the readback does not reflect the armed tool');
  ovArm('dig');                                  // a different tool REPLACES, never stacks
  assert.equal(Hud.getArmedTool(), 'dig');
  assert.match(ovHint(), /DIG/);
  ovArm('dig');                                  // the same button again → disarm
  assert.equal(Hud.getArmedTool(), null);
  assert.match(ovHint(), /ZOOM-ONLY/);
  // The KEY path (controls.js G/Z/V) writes the SAME slot through `armFromKey`, so the bar reflects
  // it too — the two arming paths cannot drift because there is only one slot.
  Hud.armFromKey('strip');
  assert.equal(Hud.getArmedTool(), 'strip');
  assert.match(ovHint(), /STRIP/);
});

// ── the lowering, and its parity with the other two surfaces ──

// ⚠️ THIS TEST REPLACES TWO WP-5 TESTS THAT NO LONGER HAVE A SUBJECT — "STOCKPILE emits BOTH
// commands, byte-equal to paletteOrders" and "an UN-INJECTED ORDERS bar paints ACCEPT-ALL". Both
// moved to `room-model.test.js` with the verb and the mask seam. What is left HERE is the negative,
// and it is the load-bearing half of this package: an armed STOCKPILE must send NOTHING from the
// schematic.
//
// IT DRIVES THE REAL CONTROLLER rather than asserting on `ORDER_TOOLS`, because there are two
// independent ways the verb could come back — the table, and a `stockpile` branch left standing in
// `orderPayloads`. The pure test above covers the first. This covers the pair.
//
// NON-VACUITY IS EXPLICIT AND NECESSARY (the WP-5 "starts-in-the-asserted-state" lesson): "sent
// nothing" is also what a broken harness produces, so the same click under DIG must send exactly
// one order, and the same click under STOCKPILE must still ENTER THE ROOM — proof the click was
// delivered and resolved, not swallowed.
test('an armed STOCKPILE designates NOTHING from the Overview — and still enters the room', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  ovArm('stockpile');
  assert.equal(Hud.getArmedTool(), 'stockpile', 'the shared slot did not take stockpile at all — ' +
    'the assertions below would then be about a click with nothing armed');
  const sent = ovClick(room, 12, 5);
  assert.deepEqual(sent, [],
    'the Overview zoned a tile. STOCKPILE moved to the Room Zoom because a zone\'s EXTENT is its ' +
    'capacity (one stack per tile) and this surface has no drag gesture — a single-tile zone from ' +
    'the schematic is the affordance that decision removed.');
  assert.deepEqual(ovEntered, ['hold'],
    'the click did not reach the hit rule either — so "sent nothing" here proves nothing');
  // …and no `filter` leaked out on its own, which is the shape a half-reverted lowering would make.
  assert.deepEqual(sent.filter((o) => o.cmd === 'filter'), []);
  ovArm('stockpile');

  // POSITIVE CONTROL: the identical gesture under a verb that DID stay lowers exactly one order.
  ovArm('dig');
  assert.deepEqual(ovClick(room, 12, 5), paletteOrders('dig', 12, 5),
    'DIG stopped designating too — the harness is broken, not the boundary');
});

test('WP-5 driven: DIG and STRIP each emit exactly one order, byte-equal to paletteOrders', () => {
  for (const [tool, tx, ty] of [['dig', 28, 16], ['strip', 22, 3]]) {
    ovArm(tool);
    const sent = ovClick(ovStage, tx, ty);
    assert.deepEqual(sent, paletteOrders(tool, tx, ty), `${tool} lowers differently from the console`);
    assert.equal(sent.length, 1, `${tool} must not carry a filter`);
    assert.notEqual(sent[0].cmd, 'build',
      `${tool} was routed through Cmd.build — BuildSystem knows nothing about designations`);
    assert.equal(sent[0].on, 1);
    ovArm(tool);                                   // disarm before the next verb
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// M1-C — ERASE ON THE OVERVIEW. Taking an order back at deck altitude.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ EVERY LEG BELOW IS ITS OWN `test()`, DELIBERATELY, and this is the fifth trap being designed
// around rather than tripped over: `assert` throws, so a multi-leg test reports only its FIRST
// failing leg and a leg that cannot bite is indistinguishable from one that can. Splitting them is
// also what makes the charter's MUTATION 5 legible — remove THIS surface's erase branch and leave
// the Room Zoom's, and the failures name the Overview and nothing else. (Run blinded, and the
// package report records the result.)
//
// The Overview reads the `marks` channel and NOT `zones` — it draws no zone layer — so its erase is
// exactly as good as the host's own ranking, which is what `tileOrders`' header argues is honest.

/** Dispatch a `marks` message on the deck currently on screen, from `[x,y,kindName]` triples. The
 *  name→byte direction is taken from the wire module's OWN table rather than re-typed here: a
 *  hand-mirrored kind order would let this rig and the decoder be wrong together. */
function ovSetMarks(rows, deck = FIX.frame.deck) {
  Hud.renderMarks({ type: 'marks', cells: rows.map(([x, y, k]) => {
    const kind = MARK_KIND_NAMES.indexOf(k);
    assert.ok(kind >= 0, `no such mark kind '${k}' — the rig would emit a row the decoder drops`);
    return [x, y, deck, kind];
  }) });
}
// The mark cache is shared module state on hud.js — every leg below clears it so a later test in
// this file (or a later file sharing the import) cannot inherit a hand-built designation.
afterEach(() => { if (typeof Hud !== 'undefined') Hud.renderMarks(null); });

// ⚠️ THE SILENT-WALL TRAP, PINNED. `hud.js`'s `KEY_EVENT` map falls back to `'keyB'` for a kind it
// does not know, so the half-done version of this change — bind C in `controls.js`, forget the
// `erase: 'keyC'` row — does not produce an inert key. IT ARMS WALL. Nothing about that is visible
// from the console-model side (`nextArmedTool({t:'keyC'})` is correct there), so it is pinned HERE,
// against the real `armFromKey`, which is the function that consults the map.
//
// MUTATION: delete `erase: 'keyC'` from KEY_EVENT ⇒ `armFromKey('erase')` arms 'wall' ⇒ RED.
// MUTATION: bind `keyC` to something other than erase in console-model ⇒ RED.
test('M1-C: armFromKey(\'erase\') really arms ERASE — not WALL, which is the fallback', () => {
  for (let i = 0; i < 8 && Hud.getArmedTool() != null; i++) Hud.armTool(Hud.getArmedTool());
  Hud.armFromKey('erase');
  assert.equal(Hud.getArmedTool(), ERASE_TOOL,
    'the C key armed ' + JSON.stringify(Hud.getArmedTool()) + '. `KEY_EVENT` in hud.js falls back ' +
    'to `keyB`, so a missing row here is not an inert key — it is WALL, silently.');
  Hud.armFromKey('erase');
  assert.equal(Hud.getArmedTool(), null, 'a second C did not disarm');
  // Non-vacuity: the same seam still routes the older kinds correctly, so a green above is not a
  // getter that has stopped moving.
  Hud.armFromKey('strip');
  assert.equal(Hud.getArmedTool(), 'strip');
  Hud.armFromKey('strip');
});

test('M1-C driven: the ORDERS bar PAINTS an ERASE button, labelled and hotkeyed', () => {
  const html = ovCmd.innerHTML;
  assert.ok(html.length > 0, 'the command bar painted nothing — this assertion would be vacuous');
  assert.ok(html.includes('data-ov-tool="' + ERASE_TOOL + '"'), 'no ORDERS button for erase');
  assert.ok(html.includes('>' + ERASE_LABEL + '<'), `the erase button is missing its label '${ERASE_LABEL}'`);
  // It is NOT an order, and nothing must quietly make it one — that would route it through
  // `orderPayloads` and lower it to a designation instead of cancelling one.
  assert.ok(!ORDER_TOOLS.includes(ERASE_TOOL), 'erase joined ORDER_TOOLS — it paints nothing');
  assert.equal(isOrderTool(ERASE_TOOL), false);
  assert.equal(isEraseTool(ERASE_TOOL), true);
  for (const t of [...ORDER_TOOLS, 'wall', 'move', null, 'nope']) assert.equal(isEraseTool(t), false);
});

// MUTATION 1 (restated as a payload assertion): hard-code `true` in `erasePayloads` ⇒ `on:1` ⇒ RED.
// MUTATION 5: delete the `case 'erase'` branch from the Overview's click switch ⇒ nothing is sent
//   ⇒ RED here, and RED on nothing in room-model.test.js. Run BLINDED of the Room Zoom legs.
test('M1-C driven: ERASE clears the order the Overview can see on the tile', () => {
  ovSetMarks([[12, 5, 'dig'], [13, 5, 'strip'], [14, 5, 'stockpile'], [15, 5, 'debris']]);
  ovArm(ERASE_TOOL);
  assert.deepEqual(ovClick(ovStage, 12, 5), [{ cmd: 'dig', x: 12, y: 5, on: 0 }]);
  assert.deepEqual(ovClick(ovStage, 13, 5), [{ cmd: 'strip', x: 13, y: 5, on: 0 }]);
  // ONE command for a zone, never the paint path's `Cmd.stockpile` + `Cmd.filter` pair:
  // `DesignateStockpileCommand` OFF clears the accept-filter itself, so a trailing mask would orphan
  // one on a tile that is no longer a zone (sim/Sim.Core/Commands/Commands.cs:186).
  assert.deepEqual(ovClick(ovStage, 14, 5), [{ cmd: 'stockpile', x: 14, y: 5, on: 0 }]);
  // DEBRIS IS TERRAIN — the player never ordered it, so there is nothing to take back.
  assert.deepEqual(ovClick(ovStage, 15, 5), [], 'erasing plain rubble sent a command');
  ovArm(ERASE_TOOL);
});

// MUTATION: make `markNameAt` ignore its deck argument ⇒ RED (the deck-1 row would answer a deck-0
//   click). MUTATION: make it ignore x or y ⇒ RED on the neighbour leg.
test('M1-C driven: an unordered tile sends NOTHING, and the surface SAYS so', () => {
  ovSetMarks([[12, 5, 'dig']]);
  ovArm(ERASE_TOOL);
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  assert.deepEqual(ovClick(ovStage, 13, 5), [],
    'a neighbouring tile with no order emitted a command — the lookup is not per-coordinate');
  assert.equal(ovToast.hidden, false, 'the toast was written but never un-hidden');
  assert.match(ovToast.textContent, /NOTHING TO ERASE/,
    'an erase that cleared nothing said nothing. Sending no command is CORRECT here, which is ' +
    'exactly why the surface has to say it: silence is indistinguishable from a broken tool.');
  // …and the confirming half is not vacuous — the same gesture on the ordered tile DOES report.
  ovToast.textContent = 'SENTINEL';
  assert.equal(ovClick(ovStage, 12, 5).length, 1);
  assert.match(ovToast.textContent, /ERASED DIG/, 'a successful erase did not confirm');
  ovArm(ERASE_TOOL);
});

// ⚠️ THE FOUR HIT SHAPES, ONE AT A TIME — WIDENED IN REVIEW (2026-07-29), and the narrow version it
// replaces was a measured survivor, not a hypothetical: with the leg pinned only against a ROOM hit,
// moving `isEraseTool` below `pawnCid` left 991/991 GREEN, and moving it below pawn + terminal +
// ＋ADD ROOM left 991/991 GREEN as well. The sibling control (the same move on `isOrderTool`) reddens
// 13, which is what a live guard looks like. The comment in `overviewClickAction` claims erase "sits
// in the same tier as 'order'"; this is that claim, pinned to the same width WP-5 pins its own.
//
// It matters in play rather than in theory: on the standard ships crew stand ON the debris they are
// digging, so "arm ERASE, click the tile a pawn is standing on" is the ORDINARY gesture, and losing
// it to `select` would look exactly like a dead tool.
test('M1-C: an armed ERASE takes the click from EVERY hit — pawn, terminal, ＋ADD ROOM, room', () => {
  const everyHit = { pawnCid: 7, terminalId: 'con-3', addRoomSlot: 2, roomAnchor: 'hold', hallSlot: 2 };
  assert.deepEqual(overviewClickAction(ERASE_TOOL, everyHit), { type: 'erase' });
  for (const hit of [{ pawnCid: 7 }, { terminalId: 'con-3' }, { addRoomSlot: 2 }, { roomAnchor: 'hold' }, { hallSlot: 2 }, {}]) {
    assert.deepEqual(overviewClickAction(ERASE_TOOL, hit), { type: 'erase' },
      `ERASE lost the click to ${JSON.stringify(hit)}`);
  }
  // …and it changes nothing for the hits when erase is NOT armed — the fence around the new branch.
  assert.deepEqual(overviewClickAction(null, { pawnCid: 7 }), { type: 'select', cid: 7 });
  assert.deepEqual(overviewClickAction('move', everyHit), { type: 'move' });
});

// The same four shapes DRIVEN, because the pure test above cannot see whether the controller's
// `case 'erase'` actually runs for them: `overviewClickAction` could classify perfectly while the
// view resolved the click somewhere else.
test('M1-C driven: ERASE owns the click over a pawn, a terminal, ＋ADD ROOM and a room', () => {
  ovSetMarks([[12, 5, 'dig'], [28, 16, 'dig'], [22, 3, 'dig'], [30, 12, 'dig']]);
  const targets = [
    ['pawn', ovTarget('pl-pawn', { cid: '4' }), 28, 16],
    ['terminal', ovTarget('pl-terminal', { tid: 'term_hydro' }), 22, 3],
    ['＋ADD ROOM', ovTarget('pl-addroom', {}), 30, 12],
    ['room', ovTarget('pl-room', { anchor: 'hold' }), 12, 5],
  ];
  ovArm(ERASE_TOOL);
  for (const [name, node, x, y] of targets) {
    assert.deepEqual(ovClick(node, x, y), [{ cmd: 'dig', x, y, on: 0 }],
      `an armed ERASE lost the click to the ${name} hit — the tool would read as dead there`);
  }
  assert.deepEqual(ovEntered, [], 'a room opened as well — the click was resolved twice');
  assert.equal(Hud.getArmedTool(), ERASE_TOOL,
    'ERASE disarmed itself after one click. Taking back a painted region is many clicks, not one; ' +
    'only MOVE is one-shot.');
  ovArm(ERASE_TOOL);
});

// ⚠️ R1 — THE MISS MUST NOT GO SILENT INSIDE A ROOM, which is where it went silent for the whole of
// this package's first draft. `orderSuppressionToast` replaces the verb's own line with
// "ERASE ARMED — ESC TO DISARM" on any room/＋ADD ROOM hit. For an ORDER that is right — the mark
// appearing IS the confirmation — but an erase MISS sends no command and changes no pixel, so
// suppression put it straight back into silence on exactly the tiles that matter (every device a
// player wants to un-condemn is inside a room).
//
// ⭐ NOTHING CAUGHT IT, AND THE REASON IS THE LESSON: this package's own measured ship-fact — all 20
// of the wreck's deck-0 debris tiles are in HALLS — is why the browser rig's Overview leg never lands
// on a room rect at all. The correction that made the rig honest is what created the blind spot, and
// the node leg that DOES hit a room rect asserted only the payload. A ship-shape finding that narrows
// your instrument has to be followed by asking what the narrowed instrument can no longer see.
//
// MUTATION: restore `if (!orderSuppressionToast(ERASE_TOOL, hit)) toast(...)` ⇒ RED on the in-room
//           legs and GREEN on the hall legs, which is precisely the shape of the shipped defect.
test('M1-C driven: the erase line survives INSIDE a room — the miss is never silent', () => {
  ovSetMarks([[12, 5, 'dig']]);
  const room = ovTarget('pl-room', { anchor: 'hold' });
  ovArm(ERASE_TOOL);

  // (1) the MISS, inside a room. The line the player needs is the one that says nothing happened.
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  assert.deepEqual(ovClick(room, 13, 5), [], 'the fixture tile is not bare — the leg would be vacuous');
  assert.equal(ovToast.hidden, false, 'the toast was written but never un-hidden');
  assert.match(ovToast.textContent, /NOTHING TO ERASE/,
    'inside a room the erase miss was replaced by the ARMED refusal, so a correct no-op is once ' +
    'again indistinguishable from a broken tool — the exact defect this package exists to remove');
  // …and the refusal is APPENDED, not dropped: the room did not open and that still needs saying.
  assert.match(ovToast.textContent, /ESC TO DISARM/,
    'the in-room refusal vanished with the suppression — a player who clicked a room and got ' +
    'neither the room nor an explanation is the report `orderSuppressionToast` was written for');

  // (2) the HIT, inside a room: the verb's own line, still with the refusal appended.
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  assert.equal(ovClick(room, 12, 5).length, 1);
  assert.match(ovToast.textContent, /ERASED DIG/, 'a successful in-room erase did not confirm');
  assert.match(ovToast.textContent, /ESC TO DISARM/);

  // (3) THE CONTROL that proves (1) and (2) are about ERASE and not about the toast in general:
  // an ORDER tool inside a room is STILL suppressed, and must be — its confirmation is the mark.
  ovArm(ERASE_TOOL); ovArm('dig');
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  ovClick(room, 12, 5);
  assert.match(ovToast.textContent, /DIG ARMED/,
    'the ORDER branch lost its suppression too — this fix must be narrow to ERASE');
  assert.ok(!/ORDERED/.test(ovToast.textContent), 'the order branch now says both lines at once');
  ovArm('dig');
});

// The two surfaces must lower an identical target identically. Byte-equality is asserted against the
// Room Zoom's OWN emission for the same target — read out of `room-model.test.js`'s rig? No: that rig
// is another file. What is compared here is the SHARED derivation both controllers run
// (`eraseTarget`∘`tileOrders`) against what THIS controller actually sent, so a surface that quietly
// grew its own precedence reddens.
test('M1-C driven: the Overview lowers the SHARED target, not a private one', () => {
  ovSetMarks([[12, 5, 'dig'], [13, 5, 'strip'], [14, 5, 'stockpile']]);
  ovArm(ERASE_TOOL);
  for (const [x, y, mark] of [[12, 5, 'dig'], [13, 5, 'strip'], [14, 5, 'stockpile']]) {
    const target = eraseTarget(tileOrders(mark, false));
    const sent = ovClick(ovStage, x, y);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].cmd, target,
      `the Overview sent '${sent[0].cmd}' where the shared precedence says '${target}'`);
    assert.equal(sent[0].on, 0, 'an erase rode with on:1 — it PAINTED instead of clearing');
  }
  // Non-vacuity: the helper this leg trusts really does discriminate.
  assert.equal(eraseTarget(tileOrders('debris', false)), null);
  ovArm(ERASE_TOOL);
});

// ⚠️ THE NUDGE CONDITION, PINNED — ADOPTED IN REVIEW (2026-07-29). The erase branch guards the
// paused nudge with `if (target)`, carrying a sentence about why; the guard SURVIVED DELETION with
// the whole suite green, so the sentence was justifying an untested line. Pin the flip or drop the
// sentence; this pins the flip.
//
// The reset is a manual `hidden = true` between the arm and the click, because arming is itself an
// intent and nudges (`afterToolToggle`). `paint()` writes only when the derived visibility differs
// from the element and nothing else on this surface repaints the nudge, so a manual hide is a clean
// zero that does not reach into the controller's private state.
//
// MUTATION: `nudgeOnIntent()` unconditionally ⇒ RED on the MISS leg.
// MUTATION: delete the call ⇒ RED on the HIT leg.
test('M1-C driven: a paused ship is nudged when an Overview erase LANDS, and not on a miss', () => {
  const nudge = ovNudgeEl;
  assert.ok(nudge, 'no #ov-nudge in the MOUNTED doc — every assertion below would be vacuous');
  ovSetMarks([[12, 5, 'dig']]);
  Hud.renderStatus({ type: 'status', paused: true });
  try {
    ovArm(ERASE_TOOL);
    // (a) the HIT. A command only reaches the sim on a tick, so on a stopped ship the mark the
    //     player just cancelled is still on the floor — which is what the nudge is for.
    nudge.hidden = true;
    assert.equal(ovClick(ovStage, 12, 5).length, 1, 'the fixture tile carries no order — leg vacuous');
    assert.equal(nudge.hidden, false,
      'a designation was cancelled on a STOPPED ship and nothing said so');
    // (b) the MISS. No command went out, so nothing is waiting on the sim and "press space to run
    //     the ship" would be the affordance firing with nothing to say.
    nudge.hidden = true;
    assert.deepEqual(ovClick(ovStage, 13, 5), [], 'the neighbouring tile was not bare');
    assert.equal(nudge.hidden, true, 'an erase that cleared NOTHING still nudged about the pause');
    // (c) CONTROL: the ORDER branch is untouched — a DIG on the same stopped ship still nudges.
    ovArm(ERASE_TOOL); ovArm('dig');
    nudge.hidden = true;
    ovClick(ovStage, 12, 5);
    assert.equal(nudge.hidden, false, 'the guard leaked out of the erase branch and silenced DIG too');
    ovArm('dig');
  } finally {
    Hud.renderStatus({ type: 'status', paused: false });
    nudge.hidden = true;
  }
});

// PURE, and it belongs beside the driven legs because it is the wording they assert on.
test('M1-C: the ORDERS bar readback and the erase toast say what will happen and what did', () => {
  assert.match(orderHintLine(ERASE_TOOL, 1), /ERASE/);
  assert.match(orderHintLine(ERASE_TOOL, 1), /ON DECK 1$/,
    'the erase hint must name the deck like every other line on this bar — the verb is deck-scoped ' +
    'and carries no z on the wire');
  assert.notEqual(orderHintLine(ERASE_TOOL, 1), orderHintLine(null, 1),
    'ERASE armed reads the same as nothing armed');
  // The toast, both outcomes, including the tile and the deck.
  assert.equal(erasePlacedLine('dig', 12, 5, 1), '↺ ERASED DIG ▸ 12,5 ON DECK 1');
  assert.equal(erasePlacedLine('stockpile', 0, 0, 2), '↺ ERASED STOCKPILE ▸ 0,0 ON DECK 2');
  assert.equal(erasePlacedLine(null, 12, 5, 1), '↺ NOTHING TO ERASE ▸ 12,5 ON DECK 1');
  // NEVER EMPTY. `toast('')` un-hides an empty box for 2.6 s, which reads as a glitch; the miss case
  // is the one that most needs words, so it must not be the one that returns ''.
  for (const t of ['dig', 'strip', 'stockpile', null, undefined]) {
    assert.ok(erasePlacedLine(t, 1, 2, 0).length > 0, `erasePlacedLine(${t}) returned an empty line`);
  }
  // …and `orderPlacedLine` still refuses erase, so the two vocabularies cannot be swapped by accident.
  assert.equal(orderPlacedLine(ERASE_TOOL, 12, 5, 1), '');
});

// MUTATION: make `markNameAt` return the first row regardless of deck ⇒ RED.
test('M1-C: markNameAt is exact in x, y AND deck', () => {
  const marks = [
    { x: 4, y: 6, deck: 0, mark: 'dig' },
    { x: 5, y: 6, deck: 0, mark: 'strip' },
    { x: 4, y: 6, deck: 1, mark: 'stockpile' },
  ];
  assert.equal(markNameAt(marks, 4, 6, 0), 'dig');
  assert.equal(markNameAt(marks, 5, 6, 0), 'strip');
  assert.equal(markNameAt(marks, 4, 6, 1), 'stockpile', 'the deck is not part of the lookup');
  assert.equal(markNameAt(marks, 4, 6, 2), '');
  assert.equal(markNameAt(marks, 9, 9, 0), '');
  for (const junk of [null, undefined, 'nope', 42]) assert.equal(markNameAt(junk, 4, 6, 0), '');
});

test('WP-5 driven: an order tool STAYS armed — painting a zone is many clicks, not one', () => {
  // Only MOVE is one-shot (`Hud.toolUsed` disarms it). A designation tool that disarmed itself
  // would make zoning a storage room a click-arm-click-arm grind, and the console does not do that.
  ovArm('strip');
  const first = ovClick(ovStage, 12, 5);
  assert.equal(Hud.getArmedTool(), 'strip', 'the tool disarmed itself after one designation');
  const second = ovClick(ovStage, 13, 5);
  assert.deepEqual(first, paletteOrders('strip', 12, 5));
  assert.deepEqual(second, paletteOrders('strip', 13, 5));
  assert.equal(Hud.getArmedTool(), 'strip');
});

test('WP-5 driven: a designation carries NO deck coordinate — it lands on the deck being shown', () => {
  ovArm('dig');
  const sent = ovClick(ovStage, 30, 12);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['cmd', 'on', 'x', 'y'],
    'a designation payload grew a field. It must carry no deck/z: the host applies the order to the ' +
    'session\'s CURRENT deck, which is the deck the schematic is showing, and that is what makes ' +
    'the ORDERS bar deck-scoped rather than ship-wide.');
  ovArm('dig');
  ovArm('strip');
  const stripped = ovClick(ovStage, 30, 12);
  assert.deepEqual(Object.keys(stripped[0]).sort(), ['cmd', 'on', 'x', 'y']);
  assert.equal(stripped.length, 1, 'a STRIP order grew a second payload');
});

test('WP-5 driven: the bar follows the deck on screen — header and readback both re-point', () => {
  assert.match(ovOrdersHdr(), /DECK 0$/);
  ovArm('dig');
  assert.match(ovHint(), /ON DECK 0/);
  Hud.renderFrame({ ...FIX.frame, deck: 3 });      // the player rides the deck rail up
  assert.match(ovOrdersHdr(), /DECK 3$/, 'the ORDERS header still names the deck the player left');
  assert.match(ovHint(), /ON DECK 3/);
  // ⚠️ HONEST LIMIT, measured: all eight decks of this fixture share ONE transform (identical slot
  // geometry, so identical tile extent), so a click cannot be shown to resolve differently per deck
  // — the surface's own words are the only OBSERVABLE deck scoping here, which is exactly why the
  // deck is written into both of them.
  const a = ovTransform(0), b = ovTransform(3);
  assert.deepEqual([a.KX, a.KY, a.ext], [b.KX, b.KY, b.ext],
    'the decks no longer share a transform — this test can now assert the stronger geometric form');
});

test('WP-5 driven: a click outside the deck frame designates NOTHING', () => {
  ovArm('strip');
  assert.deepEqual(ovClick(ovStage, FIX.frame.w + 4, 3), [],
    'an off-deck click sent an order — `tileAt` is no longer bounds-checking against the frame, so ' +
    'the ORDERS bar can address tiles that are not on the deck it is showing');
  assert.deepEqual(ovClick(ovStage, 3, FIX.frame.h + 4), []);
  assert.equal(ovClick(ovStage, FIX.frame.w - 1, FIX.frame.h - 1).length, 1,
    'the last in-bounds tile stopped working — the bound is off by one, not absent');
});

// ── the suppression: an armed order owns the click ──

test('WP-5 driven: an armed order suppresses ROOM ENTRY (and un-armed still enters)', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  // POSITIVE CONTROL FIRST — without it, "did not enter" proves only that the hit-test never saw
  // this node, which is exactly how a suppression test passes while suppressing nothing.
  assert.deepEqual(ovClick(room, 12, 5), [], 'an un-armed room click must send no order');
  assert.deepEqual(ovEntered, ['hold'], 'the un-armed room click did not enter the room at all — ' +
    'the hit-test is not seeing this node, so the suppression assertion below would be vacuous');
  for (const tool of ORDER_TOOLS) {
    ovArm(tool);
    const sent = ovClick(room, 12, 5);
    assert.deepEqual(ovEntered, [], `${tool} armed, and the click ENTERED THE ROOM as well`);
    assert.deepEqual(sent, paletteOrders(tool, 12, 5), `${tool} did not designate the tile`);
    ovArm(tool);
  }
});

test('WP-5 driven: an armed order suppresses ＋ADD ROOM (and un-armed still commissions)', () => {
  const hall = ovTarget('pl-hall', { slot: 6 });
  const chip = new OvEl(ovDoc, 'div');
  chip.className = 'pl-addroom';
  hall.appendChild(chip);
  assert.deepEqual(ovClick(chip, 12, 5), [], 'an un-armed ＋ADD ROOM click must send no order');
  assert.deepEqual(ovAdded, [[0, 6]], 'the un-armed chip click did not open the room picker — the ' +
    'hit-test is not seeing this node, so the suppression assertion below would be vacuous');
  // WP-1's wreck-fill put the debris in the HALLS, and this chip is the only interactive thing in
  // one. If it won the click, the halls would be un-diggable AND the click would commission a room.
  ovArm('dig');
  const sent = ovClick(chip, 12, 5);
  assert.deepEqual(ovAdded, [], 'DIG armed, and the click opened the room picker instead');
  assert.deepEqual(sent, paletteOrders('dig', 12, 5));
});

test('WP-5 driven: an armed order designates over a PAWN and over a TERMINAL', () => {
  // The two hits whose suppression is unobservable here (`selectCrewByCid` is inert without a
  // console roster; `selectTab('moss')` would tear the surface down mid-suite) — so this drives the
  // half that matters and the PURE test above pins the precedence itself.
  const pawn = ovTarget('pl-pawn', { cid: '4' });
  const term = ovTarget('pl-terminal', { tid: 'con-3' });
  ovArm('dig');
  // `--ship grid`'s crew stand ON its dig designations (HANDOVER §4b limit 2), so this is the
  // difference between a working verb and one that is dead exactly where it is needed.
  assert.deepEqual(ovClick(pawn, 28, 16), paletteOrders('dig', 28, 16));
  ovArm('dig');
  ovArm('strip');
  // A device is precisely what STRIP targets (DeviceSalvage, E0-5).
  assert.deepEqual(ovClick(term, 22, 3), paletteOrders('strip', 22, 3));
  assert.equal(Hud.getTab(), 'build', 'the terminal hit opened MOSS as well as designating');
});

test('WP-5 driven: with NOTHING armed the schematic still behaves exactly as before', () => {
  const room = ovTarget('pl-room', { anchor: 'reactor' });
  assert.equal(Hud.getArmedTool(), null);
  assert.deepEqual(ovClick(room, 12, 5), []);
  assert.deepEqual(ovEntered, ['reactor']);
  assert.deepEqual(ovClick(ovStage, 12, 5), [], 'bare space must stay a no-op');
  assert.deepEqual(ovEntered, []);
});

// ── BUG-B: the scene gesture resolves on POINTERUP, because `click` is not delivered ───────────
//
// THE BUG, AS MEASURED IN CHROME (2026-07-26, `--ship grid`, deck 0, `body.overview-open` asserted
// before every trial — §4f's boot-window artifact). `paintScene` assigns `_stage.innerHTML` on EVERY
// repaint, at the wire's 10 Hz. A click spans mousedown→mouseup; when a rebuild lands between them
// the mousedown target is detached, Chrome finds no common ancestor for the pair and fires NO
// `click` EVENT AT ALL — so `hitTest` is never reached and the click produces nothing, not a wrong
// action.
//
//   control   — no repaint during the press ................................ 19/20 entered
//   treatment — ONE `stage.innerHTML = stage.innerHTML` strictly between down and up ...... 0/10
//
// ⚠️ AN HONEST LIMIT, STATED RATHER THAN FAKED. `dom-lite` DOES NOT IMPLEMENT CHROME'S CLICK-TARGET
// RULE — it synthesises no `click` from a press pair at all — so it CANNOT reproduce "the click is
// never delivered", and nothing below claims to. What these legs pin is the two things node can
// prove, and which together make the browser's behaviour moot: (1) the seam IS `pointerup`, so a
// surviving `click` binding reddens, and (2) a release on the node that REPLACED the pressed one
// still resolves — which is precisely what the browser hands the surface after a mid-press rebuild.
// The browser half of the proof is the re-run measurement recorded in `overview-view.js`'s header.

test('BUG-B: the scene gesture is bound to POINTERUP — a bare `click` on a room does nothing', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  ovEntered = [];
  fire(room, 'click', tileAtEvent(12, 5));
  assert.deepEqual(ovEntered, [],
    'a bare `click` entered the room, so the scene is still listening on `click` — the one event ' +
    'Chrome does not deliver when a repaint lands mid-press (measured 0/10 in that case).');
  // NON-VACUITY: the same node at the same coordinates, driven as a real press → release, enters.
  clickTile(room, 12, 5);
  assert.deepEqual(ovEntered, ['hold'],
    'the press/release gesture does not enter either, so this node is not being hit-tested at all ' +
    'and the assertion above proves nothing');
});

test('BUG-B regression: a scene REBUILD strictly between press and release keeps the gesture', () => {
  const pressed = ovTarget('pl-room', { anchor: 'hold' });
  firePointer(pressed, 'pointerdown', tileAtEvent(12, 5));
  // The 10 Hz repaint the player cannot avoid: `paintScene` assigns `_stage.innerHTML`, which empties
  // the stage. Then detach the pressed node, which is what that assignment does to it in a browser.
  Hud.renderFrame(FIX.frame);
  pressed.remove();
  assert.equal(pressed.parentNode, null,
    'the pressed node was NOT detached, so this test never reproduces a mid-press rebuild and would ' +
    'pass against the shipped bug');
  const live = ovTarget('pl-room', { anchor: 'hold' });   // the node the rebuild put back in its place
  assert.notEqual(live, pressed, 'the release is landing on the very node that was pressed');
  ovEntered = [];
  firePointer(live, 'pointerup', tileAtEvent(12, 5));
  assert.deepEqual(ovEntered, ['hold'],
    'the release on the REBUILT node did not enter the room. This is the owner\'s report: a press ' +
    'longer than the 100 ms render period spans a rebuild essentially always.');
});

test('BUG-B: a release over the schematic whose press began ELSEWHERE resolves nothing', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  ovEntered = [];
  firePointer(room, 'pointerup', tileAtEvent(12, 5));      // the press landed on a HUD island, not here
  assert.deepEqual(ovEntered, [],
    'a bare release entered a room. Moving off `click` must not throw away its one real guarantee — ' +
    'that press and release belong to the same surface — or dragging off a HUD button onto the ' +
    'schematic enters whatever it happens to land on.');
  // NON-VACUITY: the identical release, this time with its press in front of it, must enter.
  clickTile(room, 12, 5);
  assert.deepEqual(ovEntered, ['hold'], 'the harness cannot enter this room at all');
});

test('BUG-B: a press that ENDS off the schematic cannot arm a later release', () => {
  const ups = ovWinListeners.pointerup || [];
  const cancels = ovWinListeners.pointercancel || [];
  assert.ok(ups.length > 0,
    'nothing is bound to window `pointerup`, so the off-scene release below reaches nothing and ' +
    'every assertion after it is vacuous');
  assert.ok(cancels.length > 0, 'nothing is bound to window `pointercancel`');
  // ⚠️ THE PHASE, ASSERTED BY NAME. The driven legs below DO catch a capture-phase registration —
  // `firePointer` runs window capture before the target — but they fail as "the room did not open",
  // which sends the next author hunting through the hit rule. This one names the actual cause. It
  // reads the phase the SOURCE passed to `addEventListener`, recorded at registration; it is not a
  // source scan and a comment cannot satisfy it.
  assert.ok(ups.every((l) => l.capture === false) && cancels.every((l) => l.capture === false),
    'the window latch clear is registered in CAPTURE phase. It then runs BEFORE `_stage`\'s own ' +
    'pointerup handler, empties `_downOnScene` every time, and the entire room-entry gesture dies ' +
    'SILENTLY — the exact bug this package fixed, reintroduced by a third argument. It must stay ' +
    'bubble phase: `_stage` sits below window on the same event and must read the latch first.');
  const room = ovTarget('pl-room', { anchor: 'hold' });

  firePointer(room, 'pointerdown', tileAtEvent(12, 5));
  firePointer(ovOffScene, 'pointerup', tileAtEvent(12, 5));                     // released over a HUD island; the stage never saw it
  ovEntered = [];
  firePointer(room, 'pointerup', tileAtEvent(12, 5));     // …and later, an unrelated release over the scene
  assert.deepEqual(ovEntered, [],
    'the press latch survived a release that happened off the schematic, so a stale press arms ' +
    'somebody else\'s gesture');

  firePointer(room, 'pointerdown', tileAtEvent(12, 5));
  firePointer(ovOffScene, 'pointercancel', tileAtEvent(12, 5));                 // the browser taking the pointer away mid-press
  firePointer(room, 'pointerup', tileAtEvent(12, 5));
  assert.deepEqual(ovEntered, [], 'pointercancel did not clear the press latch');

  clickTile(room, 12, 5);
  assert.deepEqual(ovEntered, ['hold'], 'the harness cannot enter this room at all');
});

// ⚠️ THE RELEASE TARGET IS WHAT IS HIT-TESTED, AND NOTHING PINNED THAT UNTIL THIS TEST. The
// regression test above presses and releases on two different nodes that resolve to THE SAME ROOM,
// so an implementation that stashed the press target and hit-tested that instead SURVIVED it — the
// load-bearing mechanism there is the seam, not the choice of target. That choice is a separate
// behavioural claim `onSceneGesture`'s doc makes out loud ("a short drag from a hall into a room now
// enters that room"), and a claim in a comment that no test exercises is the shape this repo keeps
// paying for. Both directions are driven, because only the pair distinguishes the two designs:
// press-target hit-testing fails the first leg AND wrongly passes the second.
test('BUG-B: the RELEASE target decides — a press dragged hall→room enters, room→hall does not', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  const hall = ovTarget('pl-hall', { slot: 6 });
  const at = tileAtEvent(12, 5);

  ovEntered = [];
  firePointer(hall, 'pointerdown', at);          // …the press begins on bare hall
  firePointer(room, 'pointerup', at);            // …and is released over a bound room
  assert.deepEqual(ovEntered, ['hold'],
    'a press dragged from a hall into a room did not enter it, so the gesture is resolving against ' +
    'the PRESS target. `onSceneGesture` claims the opposite in its own doc.');

  ovEntered = [];
  firePointer(room, 'pointerdown', at);          // …and the exact inverse
  firePointer(hall, 'pointerup', at);
  assert.deepEqual(ovEntered, [],
    'a press that began on a room but was RELEASED over bare hall still entered the room — which is ' +
    'what stashing the press target looks like from the outside. A hall has no anchor and is not ' +
    'enterable (`overviewClickAction` has no hallSlot branch).');

  // NON-VACUITY: the ordinary same-node gesture still works, so neither leg above is measuring a
  // harness that simply cannot enter rooms.
  clickTile(room, 12, 5);
  assert.deepEqual(ovEntered, ['hold'], 'the harness cannot enter this room at all');
});

test('BUG-B: a SECONDARY-button press/release on the schematic resolves nothing', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  const at = tileAtEvent(12, 5);
  ovEntered = [];
  firePointer(room, 'pointerdown', { ...at, button: 2 });
  firePointer(room, 'pointerup', { ...at, button: 2 });
  assert.deepEqual(ovEntered, [],
    'a right-button press entered the room. `click` never fired for a secondary button, and moving ' +
    'to the pointer seam must not widen the gesture.');
  clickTile(room, 12, 5);
  assert.deepEqual(ovEntered, ['hold'], 'the harness cannot enter this room at all');
});

// ── the armed-order refusal, said out loud (the second silent way a room "will not open") ──────

test('an armed order that REFUSES a room says so at the point of the click', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  const hall = ovTarget('pl-hall', { slot: 6 });
  const chip = new OvEl(ovDoc, 'div');
  chip.className = 'pl-addroom';
  hall.appendChild(chip);
  ovArm('dig');

  // A SENTINEL rather than an empty toast: "the toast is empty" is also what deleting the feature
  // produces, and it is what the toast already holds. Only a CHANGE off the sentinel is evidence.
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  const sent = ovClick(room, 12, 5);
  assert.deepEqual(sent, paletteOrders('dig', 12, 5), 'the designation itself stopped working');
  assert.deepEqual(ovEntered, [], 'the room opened after all — there would be nothing to explain');
  assert.equal(ovToast.hidden, false, 'the toast was written but never un-hidden');
  assert.match(ovToast.textContent, /DIG ARMED/,
    'the refusal did not name the verb that caused it — "nothing happened" is the bug being fixed');
  assert.match(ovToast.textContent, /ESC/, 'the refusal did not say how to get out of the mode');

  // ＋ADD ROOM is refused by the same rule and must explain itself the same way.
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  assert.deepEqual(ovClick(chip, 12, 5), paletteOrders('dig', 12, 5));
  assert.deepEqual(ovAdded, [], 'the picker opened, so the suppression under test did not happen');
  assert.match(ovToast.textContent, /DIG ARMED/, 'a suppressed ＋ADD ROOM click stayed silent');
  ovArm('dig');
});

// ⚠️ THIS TEST CHANGED WHEN THE OVERVIEW GAINED ORDER FEEDBACK (2026-07-26), and the change is a
// narrowing, not a weakening. It used to assert that a pawn hit designates in TOTAL SILENCE. That
// silence was never the rule worth having — it was a side effect of this surface having no
// order-placed toast at all, which is the other half of the owner's report: arm STRIP on the
// Overview, click a MedBed, and NOTHING anywhere said the order had been placed, while the Room Zoom
// has toasted every committed order since WP-2.
//
// What the original test actually protected, and what is still protected here: the REFUSAL wording
// (`… ARMED — ESC TO DISARM`) must stay narrow. It explains why a room did not open, and on
// `--ship grid` the crew stand exactly ON the dig debris (HANDOVER §4b limit 2), so firing a refusal
// over every pawn would fire on nearly every click of DIG's hot path and train the player to ignore
// the toast. That reasoning is about the REFUSAL, never about confirmation — a confirmation that
// fires whenever an order lands is exactly the Room Zoom's behaviour and exactly the parity asked
// for. So: a pawn hit now CONFIRMS and must never REFUSE.
test('the REFUSAL wording stays narrow: a pawn hit confirms the order, a room hit explains the refusal', () => {
  const pawn = ovTarget('pl-pawn', { cid: '4' });
  const room = ovTarget('pl-room', { anchor: 'hold' });
  ovArm('dig');
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  assert.deepEqual(ovClick(pawn, 28, 16), paletteOrders('dig', 28, 16),
    'the pawn designation broke, so the wording below is not the rule being tested');
  assert.ok(!/ARMED/.test(ovToast.textContent),
    'DIG claimed a REFUSAL over a pawn. Nothing was refused — the designation landed — and on '
    + '--ship grid the crew stand exactly ON the dig debris (HANDOVER §4b limit 2), so this would '
    + 'fire on nearly every click of the verb\'s hot path and train the player to ignore the toast.');
  assert.match(ovToast.textContent, /DIG ORDERED/,
    'a designation that LANDED said nothing at all — the Overview\'s half of the owner\'s report');
  assert.equal(ovToast.hidden, false, 'the confirmation was written but never un-hidden');

  // NON-VACUITY, both directions: the same armed tool over a ROOM writes the REFUSAL instead, so
  // "confirms" above is a real discrimination and not a toast that says one thing everywhere.
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  assert.deepEqual(ovClick(room, 12, 5), paletteOrders('dig', 12, 5));
  assert.match(ovToast.textContent, /DIG ARMED/, 'a refused room stopped explaining itself');
  assert.ok(!/ORDERED/.test(ovToast.textContent),
    'both toasts fired for one click and raced for the same element — one of them is invisible');
  ovArm('dig');
});

// The Overview's half of the owner-reported bug, on the verb he reported it with.
test('THE LIVE BUG: arming STRIP and clicking furniture on the Overview says something', () => {
  const room = ovTarget('pl-room', { anchor: 'hold' });
  ovArm('strip');
  ovToast.textContent = 'SENTINEL'; ovToast.hidden = true;
  // Deliberately NOT a room/＋ADD ROOM hit — a bare stage click, which is what a click on a device
  // inside the schematic is. Measured before the fix: the command went out and `#ov-toast` stayed
  // empty and hidden, so the ORDERS bar's `⚒ STRIP ▸ CLICK A WALL OR DEVICE ON DECK 0` was the only
  // thing on screen and it says the same thing before and after the click.
  const sent = ovClick(ovStage, 24, 1);
  assert.deepEqual(sent, paletteOrders('strip', 24, 1), 'the strip designation itself stopped working');
  assert.equal(ovToast.hidden, false, 'the Overview still gives NO feedback for a placed strip order');
  assert.match(ovToast.textContent, /STRIP ORDERED/, 'the confirmation does not name the verb');
  assert.match(ovToast.textContent, /24,1/, 'the confirmation does not name the tile');
  assert.match(ovToast.textContent, /DECK/, 'the confirmation does not name the deck it landed on');
  assert.ok(!/\[V\]/.test(ovToast.textContent),
    're-teaching the hotkey at the moment it was just used is noise, not an affordance');
  ovArm('strip');
});

// ── the wiring main.js owns (a declared STRUCTURAL guard, and why it has to be one) ──

// ⚠️ THIS TEST IS THE INVERSE OF THE ONE WP-5 SHIPPED. WP-5 asserted that `initOverview` IS handed
// `Hud.getStockFilter()`, because the ORDERS bar's STOCKPILE painted with it. The verb moved to the
// Room Zoom and the mask moved with it, so the assertion here is that the Overview is handed NO mask.
//
// ⚠️ AND ITS NON-VACUITY ANCHOR MOVED AGAIN AT WP-6, which is the only reason to read this comment.
// It used to be the `initRoomZoom` block: *"the SAME regex must be shown to match somewhere in the
// SAME file — the `initRoomZoom` block — before the absence means anything."* WP-6 gave the Room Zoom
// its own ACCEPTS chips and its own `_stockFilter`, so `initRoomZoom` is handed no mask either and
// that anchor is gone. The regex is now anchored on the two `installInput` blocks, which still wire
// `Hud.getStockFilter()` for the console's own canvas path — a stronger anchor, since there are two
// of them and `input.test.js` pins them independently.
//
// AN ABSENCE ASSERTION IS THE DANGEROUS KIND: a typo'd regex, a call block that failed to parse, or
// a renamed getter all produce "absent" and all pass. So the SAME regex must be shown to match
// somewhere in the SAME file before the absence means anything. That is what makes this a guard
// rather than a wish.
//
// It is STRUCTURAL and says so, exactly as `input.test.js:204` does for the sibling claim about the
// two `installInput` blocks: main.js is the composition root, it takes no injection of its own, and
// importing it would boot a WebSocket. Trap 1 is handled — comments are stripped before matching.
test('main.js hands the Overview NO accept-mask — the seam went to the Room Zoom with the verb', () => {
  const main = readFileSync(fileURLToPath(new URL('../src/main.js', import.meta.url)), 'utf8');
  const WIRE = /getStockFilter:\s*\(\)\s*=>\s*Hud\.getStockFilter\(\)/;
  // `callBlocks` (client/test/code-only.js) brace-matches the argument object over CODE ONLY — a
  // `{` in a comment or a `}` in a string derails a raw walk silently, which is CLAUDE.md trap 1.
  const calls = callBlocks(main, 'initOverview');
  assert.equal(calls.length, 1, 'expected exactly one initOverview({…}) call in main.js, found ' +
    calls.length + ' — this guard reads the first, so a second one would go unchecked');
  const call = calls[0];
  assert.ok(call.includes('send:'), `the initOverview block did not parse (${call.length} chars)`);
  assert.ok(!WIRE.test(call),
    'main.js still hands the Overview the shared stockpile accept-mask. Nothing on that surface ' +
    'reads it: the ORDERS bar arms DIG and STRIP, neither of which carries a filter. A live ' +
    'injection point with no reader is what a later package mistakes for a wiring bug and "fixes" ' +
    'by putting the STOCKPILE button back — see overview-model.js\'s header for why it left.');
  assert.ok(!/stockpile/i.test(call),
    'the initOverview call block still mentions stockpile in code — the ORDERS bar has no such tool');
  // NON-VACUITY, and it is the whole reason this test can be trusted: the identical regex MUST match
  // somewhere in main.js. Without this leg, renaming `Hud.getStockFilter` (or breaking `callBlocks`)
  // would make the absence above true for entirely the wrong reason and the guard would go quiet.
  const inputs = callBlocks(main, 'installInput');
  assert.equal(inputs.length, 2, 'expected two installInput({…}) calls in main.js (the WebGL2→' +
    `Canvas2D fallback re-installs), found ${inputs.length}`);
  for (const [i, block] of inputs.entries()) {
    assert.match(block, WIRE,
      `installInput block #${i + 1} does not wire Hud.getStockFilter, so the regex above matched ` +
      'NOTHING in main.js and the absence assertion is vacuous. (The console canvas path still ' +
      'reads the shared mask; WP-9 removes it with the shell.)');
  }
  // …and the seam it USED to be anchored on is gone, deliberately (WP-6): the Room Zoom owns its own
  // mask now, set by the ACCEPTS chips on its palette. This is pinned rather than left implicit
  // because a later lane "restoring" that wiring would silently put the brush back on a mask no
  // player can reach — the exact defect WP-6 was written to fix.
  const rz = callBlocks(main, 'initRoomZoom');
  assert.equal(rz.length, 1, 'expected exactly one initRoomZoom({…}) call in main.js, found ' + rz.length);
  assert.ok(!WIRE.test(rz[0]),
    'main.js hands the Room Zoom `Hud.getStockFilter()` again. The ONLY writer of that value is the ' +
    'onclick on the DEPRECATED console shell\'s ACCEPTS chips (hud.js), so re-wiring it pins every ' +
    'zone painted on the standard surface at ACCEPT-ALL for ever and makes the Room Zoom\'s own ' +
    'chips inert. The palette owns the mask — see roomzoom-view.js\'s `_stockFilter`.');
});

// ── the ledger ──

test('WP-5: the porting ledger is EMPTY — the standard surface is verb-complete', async () => {
  const src = readFileSync(fileURLToPath(new URL('./surface-boundary.test.js', import.meta.url)), 'utf8');
  // Stripped FIRST, with the shared quote-aware stripper — the ledger's own explanatory comment
  // names `stockpile`, so a raw match would read the prose as a live entry.
  const block = /const KNOWN_GAPS = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(codeOnly(src));
  assert.ok(block, 'KNOWN_GAPS could not be located in surface-boundary.test.js — this check is vacuous');
  const entries = block[1].trim();
  assert.equal(entries, '',
    `KNOWN_GAPS still holds ${JSON.stringify(entries)}. WP-5 was the last porting package; every ` +
    'verb the player can reach on the deprecated console is now on the standard surface.');
  // Non-vacuity: the comment-stripper must not be what makes this pass — a real entry must survive it.
  const seeded = 'stockpile: \'WP-5\',\n  // a comment\n';
  assert.notEqual(codeOnly(seeded).trim(), '');
});

// ── the E0-8 LEDGER island, DRIVEN ──
//
// ⚠️ THIS TEST EXISTS BECAUSE A SCAN WAS NOT ENOUGH, and the gap was found by mutation, not by
// reading. `ledger-model.test.js` scans `overview-view.js` for `ledgerRows`, and that scan SURVIVED
// the mutation `const rows = ledgerRows(msg);` → `const rows = [];` — the island stops painting, the
// identifier is still in the file, and the suite stayed green. A scan can only ever prove the
// controller MENTIONS the model. Only driving it proves the player sees a number.
//
// dom-lite gives ONE memoised stand-in per selector, so `querySelectorAll('.ov-ledrow')` is a single
// slot and the controller paints row 0 (MATTER) into it. That is enough: the mutation above empties
// the row list, so row 0 goes hidden and its label never gets written.
test('the LEDGER island paints the ship\'s matter census on the Level-1 Overview', () => {
  Hud.renderLedger({
    type: 'ledger', tick: 864000, window: 36000, total: 731, stacks: 710, unknown: 0, crew: 8,
    matter: [['Corpse', 1], ['Potato', 699], ['ControllerModule', 31]],
    partsPerDay: 0, matterPerDay: 9, daysOfWater: 0.5, o2TrendDays: -1,
    tankL: 12, tankCapL: 1000, greyL: 20, o2mol: 18885.6,
    notes: [['matter', 'MATTER NOTE'], ['days_of_water', 'WATER NOTE'],
            ['caveat', 'NO AIR RESERVE ABOARD']],
  });

  const island = ovRoot.querySelector('.ov-ledger .ov-hdr');
  assert.equal(island.textContent, 'LEDGER', 'the island must render its header from live state');

  const row = ovRoot.querySelectorAll('.ov-ledger .ov-ledrow')[0];
  assert.equal(row.hidden, false, 'row 0 must be SHOWN when the wire carried a ledger');
  assert.equal(row.querySelector('.ov-ledlabel').textContent, 'MATTER');
  assert.equal(row.querySelector('.ov-ledval').textContent, '731 u');
  assert.equal(row.querySelector('.ov-ledsub').textContent, '+9.0/d');
  assert.equal(row.title, 'MATTER NOTE',
    'the host derivation note must ride the row as its title — a limit that does not travel with ' +
    'its number gets read off (DA-M3)');

  const census = ovRoot.querySelector('.ov-ledcensus');
  assert.match(census.textContent, /Potato 699/, 'the per-kind census is the check on a saturated bar');
  assert.equal(census.hidden, false);

  // The caveat is ALWAYS-VISIBLE TEXT, not a hover title. Every other limit on this island rides a
  // row's `title`, which is the channel a player is least likely to read; this one does not.
  const caveat = ovRoot.querySelector('.ov-ledcaveat');
  assert.equal(caveat.textContent, 'NO AIR RESERVE ABOARD');
  assert.equal(caveat.hidden, false);

  // …and the empty state is the honest alternative, not rows of zero.
  Hud.renderLedger(null);
  assert.equal(ovRoot.querySelector('.ov-ledempty').hidden, false,
    'with no ledger on the wire the island says so instead of painting zeroes');
  assert.equal(ovRoot.querySelectorAll('.ov-ledger .ov-ledrow')[0].hidden, true);
});

// ⚠️ THE SLOT COUNT, DRIVEN — and it needed a DIFFERENT read of the stub than the test above.
// `querySelectorAll` memoises ONE stand-in per selector, so it can never tell four row slots from
// five; `innerHTML` is stored as a STRING, and that string is what the controller actually built at
// init. This is the only observation in this harness that can see the count at all.
//
// It matters because `paintLedger` walks the SLOTS and reads `rows[i]`: a model row beyond the slot
// count is silently dropped, the model tests stay green, and the player sees nothing. E0-9's FOOD
// row is the fifth and would have been the first casualty of the hard-coded 4 that used to be here.
//
// MUTATION (applied, RED, reverted): `for (let i = 0; i < LEDGER_ROW_IDS.length; i++)` → `i < 4`
// in `overview-view.js` ⇒ RED here and nowhere else in the suite.
test('the LEDGER island builds one row slot per MODEL row, not a hard-coded count', () => {
  const slots = (document.getElementById('ov-ledger').innerHTML.match(/ov-ledrow/g) || []).length;
  assert.equal(slots, LEDGER_ROW_IDS.length,
    `the island built ${slots} row slots for ${LEDGER_ROW_IDS.length} model rows. Rows past the ` +
    'slot count are never painted — a green model and an invisible number.');
  assert.equal(LEDGER_ROW_IDS.length, 5,
    'EQUALITY, not a floor: a sixth row must be a deliberate edit here, because it is also a ' +
    'decision about how tall this island may grow over the LENS card beneath it');
});
