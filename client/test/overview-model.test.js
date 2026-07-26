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
  ORDER_TOOLS, ORDER_LABEL, isOrderTool, orderHintLine,
} from '../src/ui/overview-model.js';
import { ACCEPT_ALL, defaultStockFilter, stockFilterLabel } from '../src/ui/stock-filter-model.js';
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

test('WP-5: ORDER_TOOLS is the three console order verbs, in the console\'s own order', () => {
  assert.deepEqual([...ORDER_TOOLS], ['dig', 'stockpile', 'strip']);
  for (const t of ORDER_TOOLS) {
    assert.equal(isOrderTool(t), true, t + ' must classify as an order tool');
    assert.ok(ORDER_LABEL[t], t + ' has no bar label');
  }
  // BUILDING IS ZOOM-ONLY: no build kind may sneak into the bar. `move` is a crew order, not a
  // designation, and it has its own branch — it must not be an order tool either.
  for (const t of ['wall', 'floor', 'door', 'cancel', 'move', null, undefined, '']) {
    assert.equal(isOrderTool(t), false, String(t) + ' must NOT classify as an order tool');
  }
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

test('WP-5: the ORDERS readback names the DECK in every branch, and the mask only for STOCKPILE', () => {
  // The deck is the whole point: the order verbs carry no z on the wire, so "which deck does this
  // land on?" is answerable only by what the surface says.
  for (const armed of [null, 'move', 'wall', ...ORDER_TOOLS]) {
    assert.match(orderHintLine(armed, 5, ACCEPT_ALL), /DECK 5/,
      `the hint for armed=${armed} does not name the deck`);
    assert.match(orderHintLine(armed, 0, ACCEPT_ALL), /DECK 0/);
  }
  assert.match(orderHintLine('dig', 1, ACCEPT_ALL), /DIG/);
  assert.match(orderHintLine('strip', 1, ACCEPT_ALL), /STRIP/);
  // The mask is named through the SHARED authority, so a label change lands on every surface at
  // once — asserted by calling stockFilterLabel rather than by re-spelling 'FOOD' here.
  const FOOD = 1 << 3;
  assert.match(orderHintLine('stockpile', 2, FOOD), new RegExp('ACCEPTS ' + stockFilterLabel(FOOD) + '$'));
  assert.match(orderHintLine('stockpile', 2, ACCEPT_ALL), /ACCEPTS ALL$/);
  assert.notEqual(stockFilterLabel(FOOD), stockFilterLabel(ACCEPT_ALL)); // …and the two differ
  // Only STOCKPILE reads the mask — dig/strip must not claim an accept-set they do not carry.
  assert.equal(orderHintLine('dig', 2, FOOD), orderHintLine('dig', 2, ACCEPT_ALL));
  assert.equal(orderHintLine('strip', 2, FOOD), orderHintLine('strip', 2, ACCEPT_ALL));
  assert.ok(!/ACCEPTS/.test(orderHintLine('dig', 2, FOOD)));
  // InvariantCulture-safe: no thousands separators / locale digits leak in from a big deck number.
  assert.match(orderHintLine(null, 1234, ACCEPT_ALL), /DECK 1234/);
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
  'ov-readout', 'ov-lens', 'ov-cmd', 'ov-sensor', 'ov-picker',
  's-deck', 's-lens', 'legendcard', 'crew-count', 'crewlist',
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
globalThis.window = { addEventListener() {}, removeEventListener() {} };
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
  return { root, stage, cmd: doc.getElementById('ov-cmd'), svg };
}

/** Click the centre of sim tile (tx,ty) on `stage`'s surface, targeted at `target`. */
function clickTile(target, tx, ty, deck = FIX.frame.deck) {
  const [sx, sy] = ovTransform(deck).project(tx + 0.5, ty + 0.5);
  fire(target, 'click', { clientX: sx, clientY: sy, detail: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROBE FIRST, on a THROWAWAY document: what does the ORDERS bar paint with when NOBODY injects a
// mask? `initOverview` only overrides `_getStockFilter` when handed a function, so the un-injected
// default is unreachable once the real harness below mounts — and a reviewer's mutation (default →
// 0, i.e. ACCEPT-NOTHING) therefore survived a green suite. It is unreachable in PRODUCTION too
// (main.js wires it, pinned separately), but `overview-view.js` states the default as a property, so
// it gets a test rather than a claim.
//
// It runs at module scope, BEFORE the real mount, so nothing later depends on the throwaway: the
// real `initOverview` overwrites every module-level handle. The one residue is a second
// `Hud.onShipUpdate(scheduleRepaint)` subscription — the same function twice, so a notification
// repaints twice. Idempotent, and worth naming.
const probeSent = [];
mountOverview(makeOvDoc(), { send: (o) => probeSent.push(o) });   // NO getStockFilter
Hud.armTool('stockpile');
clickTile(globalThis.document.getElementById('ov-stage'), 12, 5);
const PROBE_DEFAULT = probeSent.slice();
Hud.armTool('stockpile');                                          // disarm

// ── the real harness ──
const ovSent = [];
let ovEntered = [];          // onEnterRoom calls
let ovAdded = [];            // onAddRoom calls
let ovMask = ACCEPT_ALL;     // the injected accept-mask, read at click time
const { root: ovRoot, stage: ovStage, cmd: ovCmd } = mountOverview(makeOvDoc(), {
  send: (o) => ovSent.push(o),
  onEnterRoom: (anchor) => ovEntered.push(anchor),
  onAddRoom: (deck, slot) => ovAdded.push([deck, slot]),
  getStockFilter: () => ovMask,
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
  ovMask = ACCEPT_ALL;
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
  // BUILDING IS ZOOM-ONLY — the bar must not have grown a build kind.
  for (const kind of ['wall', 'floor', 'door', 'cancel']) {
    assert.ok(!html.includes('data-ov-tool="' + kind + '"'),
      `the Overview command bar arms '${kind}' — building is ZOOM-ONLY (overview-model.js header)`);
  }
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
  ovArm('stockpile');
  assert.equal(Hud.getArmedTool(), 'stockpile');       // non-vacuity: it really is armed
  assert.equal(bar.hidden, false,
    'the ORDERS bar vanishes while an order is ARMED — the one moment its readback matters');
  ovArm('stockpile');
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
  assert.match(ovHint(), /BUILDING IS ZOOM-ONLY/, 'the un-armed readback should teach the rule');
  ovArm('stockpile');
  assert.equal(Hud.getArmedTool(), 'stockpile', 'the bar button did not arm the shared slot');
  assert.match(ovHint(), /STOCKPILE/, 'the readback does not reflect the armed tool');
  ovArm('dig');                                  // a different tool REPLACES, never stacks
  assert.equal(Hud.getArmedTool(), 'dig');
  assert.match(ovHint(), /DIG/);
  ovArm('dig');                                  // the same button again → disarm
  assert.equal(Hud.getArmedTool(), null);
  assert.match(ovHint(), /BUILDING IS ZOOM-ONLY/);
  // The KEY path (controls.js G/Z/V) writes the SAME slot through `armFromKey`, so the bar reflects
  // it too — the two arming paths cannot drift because there is only one slot.
  Hud.armFromKey('strip');
  assert.equal(Hud.getArmedTool(), 'strip');
  assert.match(ovHint(), /STRIP/);
});

// ── the lowering, and its parity with the other two surfaces ──

test('WP-5 driven: STOCKPILE emits BOTH commands, in order, byte-equal to paletteOrders', () => {
  ovMask = 1 << 3;                                 // FOOD only — NOT the accept-all default
  ovArm('stockpile');
  const sent = ovClick(ovStage, 12, 5);
  assert.deepEqual(sent, paletteOrders('stockpile', 12, 5, ovMask),
    'the ORDERS bar and the console lower STOCKPILE differently — one surface is now sending a ' +
    'message the host reads differently from the other');
  // Absolute wire shape too: equality alone would stay green through a change to Cmd.stockpile
  // itself, which moves both paths at once.
  assert.deepEqual(sent, [
    { cmd: 'stockpile', x: 12, y: 5, on: 1 },
    { cmd: 'filter', x: 12, y: 5, mask: 1 << 3 },
  ]);
  assert.equal(sent.length, 2, 'zone-then-filter is two commands, always');
  assert.equal(sent[0].cmd, 'stockpile', 'the ZONE must precede the FILTER — an OFF path clears it');
  // The mask is genuinely READ, not defaulted: a non-default mask must survive to the wire.
  assert.notEqual(sent[1].mask, ACCEPT_ALL);
});

test('WP-5: an UN-INJECTED ORDERS bar paints ACCEPT-ALL — never silence, never accept-nothing', () => {
  // Captured at module scope from a throwaway mount with no `getStockFilter` (see the probe above).
  assert.deepEqual(PROBE_DEFAULT, paletteOrders('stockpile', 12, 5, defaultStockFilter()),
    'with nobody injecting a mask the ORDERS bar no longer falls back to the SHARED ' +
    '`defaultStockFilter()`. Accept-nothing is the dangerous direction — a zone that silently ' +
    'refuses every item looks exactly like one nothing has been hauled to yet.');
  assert.equal(PROBE_DEFAULT.length, 2, 'the un-injected default sent no filter at all');
  assert.equal(PROBE_DEFAULT[1].mask, ACCEPT_ALL);
  assert.equal(defaultStockFilter(), ACCEPT_ALL);          // …and the shared default IS accept-all
  // Non-vacuity: the probe must have exercised the real lowering, not an empty array.
  assert.equal(PROBE_DEFAULT[0].cmd, 'stockpile');
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

test('WP-5 driven: an order tool STAYS armed — painting a zone is many clicks, not one', () => {
  // Only MOVE is one-shot (`Hud.toolUsed` disarms it). A designation tool that disarmed itself
  // would make zoning a storage room a click-arm-click-arm grind, and the console does not do that.
  ovArm('stockpile');
  const first = ovClick(ovStage, 12, 5);
  assert.equal(Hud.getArmedTool(), 'stockpile', 'the tool disarmed itself after one designation');
  const second = ovClick(ovStage, 13, 5);
  assert.deepEqual(first, paletteOrders('stockpile', 12, 5, ovMask));
  assert.deepEqual(second, paletteOrders('stockpile', 13, 5, ovMask));
  assert.equal(Hud.getArmedTool(), 'stockpile');
});

test('WP-5 driven: a designation carries NO deck coordinate — it lands on the deck being shown', () => {
  ovArm('dig');
  const sent = ovClick(ovStage, 30, 12);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['cmd', 'on', 'x', 'y'],
    'a designation payload grew a field. It must carry no deck/z: the host applies the order to the ' +
    'session\'s CURRENT deck, which is the deck the schematic is showing, and that is what makes ' +
    'the ORDERS bar deck-scoped rather than ship-wide.');
  ovArm('dig');
  ovArm('stockpile');
  const zoned = ovClick(ovStage, 30, 12);
  assert.deepEqual(Object.keys(zoned[0]).sort(), ['cmd', 'on', 'x', 'y']);
  assert.deepEqual(Object.keys(zoned[1]).sort(), ['cmd', 'mask', 'x', 'y']);
});

test('WP-5 driven: the bar follows the deck on screen — header and readback both re-point', () => {
  assert.match(ovOrdersHdr(), /DECK 0$/);
  ovArm('stockpile');
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
    assert.deepEqual(sent, paletteOrders(tool, 12, 5, ovMask), `${tool} did not designate the tile`);
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

// ── the wiring main.js owns (a declared STRUCTURAL guard, and why it has to be one) ──

// The driven tests above inject `getStockFilter` and prove the Overview paints with WHATEVER mask it
// is given. What they cannot reach is the one line in `main.js` that decides what it is given — and
// a mutation harness found exactly that hole: deleting `getStockFilter` from the `initOverview` call
// left all 638 tests green while every zone painted from the ORDERS bar silently accepted
// everything, on a client whose ACCEPTS chips are on the other surface.
//
// It is STRUCTURAL and says so, exactly as `input.test.js:204` does for the sibling claim about the
// two `installInput` blocks: main.js is the composition root, it takes no injection of its own, and
// importing it would boot a WebSocket. Trap 1 is handled — comments are stripped before matching,
// with a negative control below proving a commented-out wiring does NOT satisfy it.
test('WP-5: main.js wires the ORDERS bar to the SHARED accept-mask, not to the default', () => {
  const main = readFileSync(fileURLToPath(new URL('../src/main.js', import.meta.url)), 'utf8');
  // `callBlocks` (client/test/code-only.js) brace-matches the argument object over CODE ONLY — a
  // `{` in a comment or a `}` in a string derails a raw walk silently, which is CLAUDE.md trap 1.
  const calls = callBlocks(main, 'initOverview');
  assert.equal(calls.length, 1, 'expected exactly one initOverview({…}) call in main.js, found ' +
    calls.length + ' — this guard reads the first, so a second one would go unchecked');
  const call = calls[0];
  assert.ok(call.includes('send:'), `the initOverview block did not parse (${call.length} chars)`);
  assert.match(call, /getStockFilter:\s*\(\)\s*=>\s*Hud\.getStockFilter\(\)/,
    'main.js no longer hands the Overview the shared stockpile accept-mask, so the ORDERS bar ' +
    'falls back to ACCEPT-ALL and paints a filter the player did not choose — silently, because ' +
    'the ACCEPTS chips live on the other surface. (WP-6 replaces this getter with the bar\'s own ' +
    'chips; it must not simply be removed.)');
  // NEGATIVE CONTROL — the same scan over a source whose wiring is COMMENTED OUT must FAIL.
  // …every occurrence: main.js wires the SAME getter into the two `installInput` blocks as well, and
  // blinding only the first would leave the initOverview one standing and the control passing for
  // the wrong reason.
  const blinded = main.replace(/^(\s*)(getStockFilter: \(\) => Hud\.getStockFilter\(\),)/gm, '$1// $2');
  assert.notEqual(blinded, main, 'the negative control did not comment anything out — it proves nothing');
  const blindedCalls = callBlocks(blinded, 'initOverview');
  assert.equal(blindedCalls.length, 1, 'the blinded source lost its initOverview call entirely');
  assert.ok(!/getStockFilter:\s*\(\)\s*=>\s*Hud\.getStockFilter\(\)/.test(blindedCalls[0]),
    'the scan passes on a source where the wiring is COMMENTED OUT, so it proves nothing at all — ' +
    'this is CLAUDE.md trap #1, which shipped in four packages on one day');
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
