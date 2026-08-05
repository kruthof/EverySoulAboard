// M1-K — PAWN CONTROL IN THE ROOM ZOOM, driven end to end through the shipping controller.
//
// THE REPORT THIS FILE EXISTS FOR (owner, playtest 2026-07-29):
//   *"being in zoom mode, we have no list of the pawns and it looks like we also lost the pawn we
//    selected at the ship level. also we cannot select a pawn by clicking on him. i.e. in zoom mode
//    we have no control over the pawn."*
//
// THREE OF THOSE FOUR CLAUSES WERE TRUE AND ONE WAS A MISDIAGNOSIS, and the difference is why the
// first test below is a BASELINE rather than a fix:
//   · "no list of the pawns" — true. There was none.
//   · "we lost the pawn we selected" — the SELECTION WAS NEVER LOST. `frame.sel` rides every frame
//     and `GameSession._selected` is untouched by room entry; the Room Zoom simply never READ it, so
//     nothing on screen said who was selected. Indistinguishable, to a player, from cleared.
//   · "we cannot select a pawn by clicking on him" — the hit test HAS EXISTED since the surface's
//     birth commit and resolves the right cid. It produced no visible pixel, because the readout it
//     was specified against (interaction spec IX-Z-30) lives in `#panels`, which `styles.css` sets to
//     `display:none` for `body.roomzoom-open`. So it was never broken; it was never VISIBLE.
//   · "no control over the pawn" — true. `MoveCitizenCommand` was issuable from the Overview and
//     from the deprecated console, and from nowhere inside a room.
//
// ⚠️ AND ONE KEY DID WORK, WHICH WAS WORSE THAN NONE. `input/controls.js` binds a BUBBLE-phase window
// keydown at boot and it stayed live under the Room Zoom: `M` sent a real `Cmd.move()` to the
// console's INVISIBLE inspection cursor (hardcoded `{x:32,y:10}`), `T` opened a dialogue inside the
// hidden `#panels`, `Enter` did one or the other, and the arrow keys moved that invisible cursor.
// The last section of this file pins the stand-down that closes it, BY RECORDING WHAT ARRIVED AT THE
// SEAM rather than by scanning source (CLAUDE.md trap 4: a key binding scan is defeated by a comment,
// by whitespace and by every equivalent spelling).
//
// EVERY VISUAL CLAIM HERE IS ASSERTED AGAINST RENDERED OUTPUT — the real `#rz-layers` markup after a
// real repaint — never against module state. "The selection survives room entry" is a claim about
// what a player can SEE, and a state-inspection version of it would have passed on `main`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDecks, decodeRooms, selectedCrewCid } from '../src/wire/messages.js';
import {
  roomTileRect, ROOM_TOOLS, TOOL_LABEL, paletteCommand, isSweepTool,
  crewRoomSlot, shipCrewRows, roomScene, scenePlacement,
} from '../src/ui/room-model.js';
import { decksView } from '../src/ui/decks-model.js';
import { installInput } from '../src/input/controls.js';
import { codeOnly, callBlocks } from './code-only.js';
import { DocumentLite, Element } from './dom-lite.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const src = (rel) => readFileSync(join(CLIENT, rel), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 0. THE PURE MODEL — the two derivations the dock rests on.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const DECKS_JSON = JSON.stringify({
  type: 'decks',
  decks: [{
    deck: 0,
    slots: [
      // [slotIndex, x, y, w, h, anchorName, roomType, occupied, active] — the shipped tuple order,
      // read off `decodeSlot` in `client/src/wire/messages.js`, not copied from another fixture.
      [0, 4, 6, 6, 5, 'quarters', 5, true, true],
      [1, 14, 6, 6, 5, 'hold', 3, true, true],
      // ⭐ THREE UNBOUND SLOTS, ADDED WHEN REVIEW FOUND THE OCCUPANCY GUARD UNPINNED — and a THIRD
      // survivor was found while fixing it that review had not named. `crewRoomSlot` refuses a slot
      // that is `!occupied` OR has no `anchorName`, and with only BOUND slots in the fixture
      // **NEITHER HALF COULD BITE**: dropping `!s.occupied` survived GREEN (review's finding) and so
      // did dropping `!s.anchorName` (found here, by physically applying the twin).
      //
      // ⚠️ ALL THREE ARE SHAPES THE HOST NO LONGER EMITS, AND THE COUNT THAT USED TO STAND HERE WAS
      // A PRE-M1-L CENSUS QUOTED INSIDE THE PACKAGE THAT FALSIFIES IT. It read "`--ship wreck` 13 of
      // 16 slots and `--ship grid` 51 of 64 are unoccupied". RE-DERIVED ON THE MERGED TREE
      // (2026-07-29): **0 of 16 and 0 of 64.** Occupancy is geometry now, so every slot on every
      // shipped ship reports `occupied:true` with a non-blank anchor — measured off the committed
      // live capture `fixtures/decks-wreck.json` (16 slots, 0 unoccupied, 0 blank anchor) and, for
      // grid, driven through a live host by
      // `EveryCompartmentIsARoomTests.Grid_EverySlotOnEveryDeckLeavesTheHostOccupiedAndNamed`.
      // ⇒ **NEITHER HALF OF THE CONDITION CAN BITE ON THE LIVE WIRE — the guard is INERT on today's
      // host, not merely redundant.** It is kept as future-proofing (the host still computes the two
      // flags separately and `ResolveSlot`'s early return still returns `false`), and these three
      // fixtures pin each half separately so the day it comes back cannot arrive silently. What they
      // are NOT, any of them, is evidence about the wire as it stands.
      //   · slot 2 — the once-REALISTIC unbound shape: unoccupied AND unnamed. Either half refuses
      //     it, which is precisely why it cannot separate them on its own.
      //   · slot 3 — unoccupied but NAMED (hypothetical). The only fixture that makes the
      //     `!s.occupied` half bite.
      //   · slot 4 — occupied but UNNAMED (hypothetical). The only fixture that makes the
      //     `!s.anchorName` half bite; without it `crewRoomSlot` would return `{anchor: ''}`, a
      //     navigation target that resolves to `null` on the very next `roomTileRect` call.
      [2, 0, 12, 6, 5, '', 0, false, false],
      [3, 8, 12, 6, 5, 'ghost', 5, false, true],
      [4, 16, 12, 6, 5, '', 0, true, true],
    ],
  }],
});
const ROOMS_JSON = JSON.stringify({
  type: 'rooms',
  rooms: [['quarters', 1, 0.209, 512, 101.3, 293, 96], ['hold', 1, 0.209, 512, 101.3, 293, 96]],
});
const DVIEW = decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON)));
const QUARTERS = roomTileRect(DVIEW, 'quarters');
const HOLD = roomTileRect(DVIEW, 'hold');

// FOUR souls. ⭐ `RYN` IS THE SECOND CREW MEMBER IN THE FOCUSED ROOM, and she exists because review
// found the BASELINE pawn-click test could not bite. With only `ADA` inside `quarters`, the roster's
// first entry and the crew member under the pointer were THE SAME PERSON, so the mutation that test
// names — select `crew[0].cid` instead of `hit.cid` — chose Ada either way and survived 18/18 GREEN.
// The consequence was not theoretical: `--ship grid` puts EIGHT crew in one room, where that defect
// is a live wrong-pawn selection. Every driven click below that means "the one under the pointer"
// now clicks RYN, who is NEVER `crew[0]`.
const ADA = { cid: 7, name: 'Ada Vale', role: 'engineer', deck: 0, x: 5, y: 7, task: 'Maintain scrubber' };
const BO = { cid: 9, name: 'Bo Ashby', role: 'medic', deck: 0, x: 15, y: 7, task: 'Idle' };
const CY = { cid: 11, name: 'Cy Marsh', role: 'pilot', deck: 0, x: 1, y: 1, task: 'Idle' };
const RYN = { cid: 13, name: 'Ryn Coe', role: 'hauler', deck: 0, x: 8, y: 9, task: 'Idle' };
const CREW = [ADA, BO, CY, RYN];

test('the fixture itself resolves — two rooms, four souls, TWO of them in the focused room', () => {
  assert.ok(QUARTERS && HOLD && QUARTERS.anchor !== HOLD.anchor,
    'the two-room fixture did not resolve; every driven test below would be measuring nothing');
  assert.equal(crewRoomSlot(DVIEW, ADA).anchor, 'quarters');
  assert.equal(crewRoomSlot(DVIEW, RYN).anchor, 'quarters');
  assert.notEqual(CREW[0].cid, RYN.cid,
    'RYN must not be the roster\'s FIRST entry, or the pawn-click test goes back to being unable to '
    + 'tell "the cid under the pointer" from "the first crew member" — the exact hole review found');
  assert.equal(crewRoomSlot(DVIEW, BO).anchor, 'hold');
  assert.equal(crewRoomSlot(DVIEW, CY), null, 'the hall soul must resolve to NO room — she is the '
    + 'case the dock has to answer without a navigation target, and a fixture where every crew '
    + 'member is in a room cannot exercise it');
});

test('crewRoomSlot refuses a wrong-deck match — the rect alone is not the answer', () => {
  const offDeck = { ...ADA, deck: 1 };
  assert.equal(crewRoomSlot(DVIEW, offDeck), null,
    'a crew member standing at the SAME x/y one deck up resolved into this deck\'s room — the deck '
    + 'filter is not biting, and every ship with more than one deck stacks its rects');
  assert.equal(crewRoomSlot(null, ADA), null);
  assert.equal(crewRoomSlot(DVIEW, null), null);
});

// ⭐ THE UNBOUND-SLOT GUARD, WITH ITS TWO HALVES SEPARATED. Review found that dropping `!s.occupied`
// survived the whole file GREEN; applying its twin here found that dropping `!s.anchorName` survived
// too. Neither half was pinned, and a fixture of only bound slots is why.
//
// ⚠️ EACH LEG IS RUN WITH THE OTHER'S FIXTURE PRESENT BUT NAMED SEPARATELY, because `assert` throws
// and only the FIRST failing leg of a multi-leg test reports (the fifth trap shape). Slot 2 — the
// realistic shape — is asserted too, and it deliberately CANNOT separate the halves: either one
// refuses it. That is stated rather than left as an apparent third pin.
//
// MUTATION: `if (!s || !s.anchorName) continue;`  (the `!s.occupied` half dropped)  ⇒ RED on leg 2.
// MUTATION: `if (!s || !s.occupied) continue;`    (the `!s.anchorName` half dropped) ⇒ RED on leg 3.
test('crewRoomSlot refuses an UNBOUND slot — both halves, each pinned by its own shape', () => {
  // LEG 1 — the realistic unbound slot (unoccupied AND unnamed). Refused by either half alone, so it
  // proves the guard exists and proves NOTHING about which half is doing the work.
  assert.equal(crewRoomSlot(DVIEW, { deck: 0, x: 2, y: 14 }), null,
    'a crew member standing on an ordinary unbound hall slot resolved to a room');

  // LEG 2 — unoccupied but NAMED. The ONLY shape that makes the `!s.occupied` half bite.
  assert.equal(crewRoomSlot(DVIEW, { deck: 0, x: 10, y: 14 }), null,
    'an UNOCCUPIED slot that still carries an anchor name was accepted as a room. `roomTileRect` '
    + 'looks a room up by anchor and would resolve it, so the dock would offer a navigation target '
    + 'into a slot the host says holds no room.');

  // LEG 3 — occupied but UNNAMED. The ONLY shape that makes the `!s.anchorName` half bite. Asserted
  // on the RETURNED ANCHOR, not merely on null, so the failure message says what came back.
  const unnamed = crewRoomSlot(DVIEW, { deck: 0, x: 18, y: 14 });
  assert.equal(unnamed, null,
    `a slot with an EMPTY anchorName was accepted as a room (returned ${JSON.stringify(unnamed)}). `
    + 'Its anchor is \'\', and `roomTileRect(dView, \'\')` returns null — so the crew dock would draw '
    + 'a row whose click navigates nowhere and says nothing.');

  // NON-VACUITY: the three probe points must actually be INSIDE their slots, or all three legs pass
  // by missing every rect. Asserted against the shipped decoder's own view of the fixture.
  const slots = DVIEW.find((d) => d.deck === 0).slots;
  for (const [sx, sy, idx] of [[2, 14, 2], [10, 14, 3], [18, 14, 4]]) {
    const s = slots.find((q) => q.slotIndex === idx);
    assert.ok(s && sx >= s.rect.x && sx < s.rect.x + s.rect.w && sy >= s.rect.y && sy < s.rect.y + s.rect.h,
      `probe ${sx},${sy} is not inside fixture slot ${idx} — that leg passes by missing the rect`);
  }
});

// MUTATION: build `here` from a second rect test instead of from `roomCrew` ⇒ this still passes, and
// that is why the DRIVEN leg further down compares the dock's HERE rows against the DRAWN pawns.
test('shipCrewRows lists the WHOLE SHIP, marks who is here, and carries a navigation target', () => {
  const rows = shipCrewRows(CREW, DVIEW, QUARTERS, 9);
  assert.deepEqual(rows.map((r) => r.cid), [7, 9, 11, 13],
    'the dock dropped someone. It is the whole ship by decision (the owner report is about a pawn '
    + 'selected ELSEWHERE), so a room filter here would reproduce the complaint.');
  assert.deepEqual(rows.map((r) => r.here), [true, false, false, true]);
  assert.deepEqual(rows.map((r) => r.selected), [false, true, false, false],
    'the selected flag did not follow the cid it was given');
  assert.deepEqual(rows.map((r) => r.anchor), ['quarters', 'hold', null, 'quarters']);
  assert.equal(rows[2].deck, 0, 'the hall soul must still carry a DECK — it is the only "where" '
    + 'the dock can honestly print for her');
  // A null selection selects nobody — not row 0, which is what `Number(null) | 0 === 0` would do
  // if the cid comparison were numeric-coerced rather than string-keyed.
  assert.deepEqual(shipCrewRows(CREW, DVIEW, QUARTERS, null).map((r) => r.selected),
    [false, false, false, false], 'a null selection lit a row');
  // …and the selected flag really is keyed to the cid it is GIVEN, not to a position: selecting the
  // LAST crew member must light the last row and nothing else. Without this, `selected: i === 1`
  // would satisfy the deepEqual above.
  assert.deepEqual(shipCrewRows(CREW, DVIEW, QUARTERS, RYN.cid).map((r) => r.selected),
    [false, false, false, true], 'the selected flag is positional, not keyed to the cid');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE DRIVEN RIG — the real controller over a DOM stub, with the parent chain and the geometry
//    the delegated click handlers actually need.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Selector matching for `closest`, over exactly the three forms this surface's handlers use. */
function matchesSel(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  const attr = /^\[([-\w]+)\]$/.exec(sel);
  if (attr) return el.getAttribute(attr[1]) !== null;
  const eq = /^\[([-\w]+)="([^"]*)"\]$/.exec(sel);
  if (eq) return el.getAttribute(eq[1]) === eq[2];
  return false;
}

class RzEl extends Element {
  constructor(doc, tag) {
    super(doc, tag);
    this.id = '';
    this._html = '';
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
  // `innerHTML` is a STRING here, exactly as it is in the three sibling rigs: the chrome this
  // surface writes with `innerHTML` (breadcrumb, palette, minimap) is read back by assertions as
  // markup, never walked as nodes. The crew dock is the exception and it is built with
  // `createElement`/`appendChild` precisely so that it CAN be walked — see `buildChrome`.
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  get firstElementChild() { return null; }
  insertBefore(el) { return this.appendChild(el); }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (matchesSel(n, sel)) return n;
      n = n.parentNode;
    }
    return null;
  }
}
class RzDoc extends DocumentLite {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  'rz-crewdock',
  // console ids `hud.js`'s frame/roster dispatch writes through — the same set the sibling rigs
  // register, for the same reason: `renderFrame`/`renderRoster` are the real receive path.
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
const doc = new RzDoc();
for (const id of RZ_IDS) { const e = new RzEl(doc, 'div'); e.id = id; doc.register(id, e); }
globalThis.document = doc;
// The Room Zoom binds `keydown` in CAPTURE and `mouseup` on window; the console's keydown is BUBBLE.
// Both phases are modelled so the leak section below can dispatch through the real order.
const winListeners = { capture: [], bubble: [] };
globalThis.window = {
  addEventListener(t, fn, opts) {
    if (t !== 'keydown') return;
    (opts === true || !!(opts && opts.capture === true) ? winListeners.capture : winListeners.bubble).push(fn);
  },
  removeEventListener() {},
};

// Resolved AFTER the globals — both modules touch `document` at import time. Rebuilt here rather
// than imported from a sibling test module: two lanes editing one test module is the merge shape
// that has already broken this repo once.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const el = (id) => doc.getElementById(id);
const layers = () => el('rz-layers').innerHTML;
const sent = [];       // what the ROOM ZOOM sent
const hudSent = [];    // what the SHARED SELECTION FLOW (hud.js) sent

/** The frame the host would send: a floor, the three crew, and `sel` on one of their tiles. */
function frameMsg(selCid) {
  const w = 24, h = 20;
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  const who = CREW.find((c) => c.cid === selCid) || null;
  return {
    type: 'frame', deck: 0, w, h, lens: 'none', cells,
    crew: CREW.map((c) => [c.x, c.y, 0, c.cid]),
    sel: who ? [who.x, who.y] : [-1, -1],
  };
}

let primed = false;
/** Mount the surface once, then re-drive it into a known state for each test. */
function prime(selCid) {
  if (!primed) {
    primed = true;
    RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
    // `_send` is assigned by `initConsole`'s FIRST statement; everything after it is console chrome
    // this rig does not model, so the throw is expected and named. The capture is NOT assumed —
    // the very first driven test asserts a real command arrives through it, so a rig that failed to
    // capture `_send` fails loudly instead of passing vacuously.
    try { Hud.initConsole({ send: (o) => hudSent.push(o) }); } catch { /* chrome, not state */ }
    // The parent chain the delegated `onHudClick` walks, and the geometry `tileFromCanvasXY` needs.
    // 6 px of `.rz-layers` inset is irrelevant here: the rect IS the layer's box.
    const root = el('roomzoom-view');
    for (const id of ['rz-canvas', 'rz-crewdock', 'rz-palette', 'rz-toast']) el(id).parentNode = root;
    el('rz-layers').parentNode = el('rz-canvas');
    el('rz-layers')._rect = sceneRectFor(QUARTERS);
    Hud.renderDecks(decode(DECKS_JSON));
    Hud.renderRooms(decode(ROOMS_JSON));
  }
  Hud.renderFrame(frameMsg(selCid));
  Hud.renderRoster({ type: 'roster', crew: CREW });
  sent.length = 0; hudSent.length = 0;
  RoomZoom.exitRoom();
  RoomZoom.enterRoom('quarters');   // synchronous repaint (this rig has no rAF)
}

/** Fire an event through the element's parent chain with one shared event object. */
function fire(target, type, extra) {
  const e = {
    type, target, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; },
    stopPropagation() { e.propagationStopped = true; },
    button: 0, detail: 1, ...(extra || {}),
  };
  let n = target;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) {
      fn(e);
      if (e.propagationStopped) return e;
    }
    n = n.parentNode;
  }
  return e;
}

// ⭐ VR-P3 — TILE → POINTER, THROUGH THE SHIPPED PROJECTION. The surface is a cabinet-oblique
// cutaway now, so `(tx - rx) * 32 + 16` points at a tile metres from the one it names. Both helpers
// go through `roomScene`/`scenePlacement` — the objects the layers are drawn with — so the point a
// test clicks IS the point the pawn is drawn at. The rect is the scene's own viewBox at 1:1, which
// makes `sceneFit` the identity (the old rig's one-unit-per-px trick, restated in the new space).
function sceneRectFor(focus) {
  const vb = roomScene(focus).viewBox;
  return { left: 0, top: 0, width: vb.w, height: vb.h };
}

/** Click the canvas at the projected FLOOR CENTRE of an absolute sim tile, through the real
 *  hit-test math. */
function clickTile(tx, ty) {
  const [px, py] = scenePlacement(roomScene(QUARTERS), QUARTERS).foot(tx, ty);
  return fire(el('rz-canvas'), 'click', { clientX: Math.round(px), clientY: Math.round(py) });
}

/** The crew dock's row button for a cid, straight out of the live DOM (never rebuilt by hand). */
function crewRow(cid) {
  const list = el('rz-crewdock').childNodes[1];
  return (list ? list.childNodes : []).find((n) => n.getAttribute('data-rzcrew') === String(cid)) || null;
}

/** Arm a palette tool the way a hotkey does, through the real capture-phase handler. */
function pressKey(key) {
  const e = {
    key, target: { tagName: 'DIV' }, propagationStopped: false, defaultPrevented: false,
    stopPropagation() { e.propagationStopped = true; },
    preventDefault() { e.defaultPrevented = true; },
  };
  for (const fn of winListeners.capture.slice()) fn(e);
  if (!e.propagationStopped) for (const fn of winListeners.bubble.slice()) fn(e);
  return e;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. ⭐ THE BASELINE. The pawn click that has existed since `a84d3e7` and has never had a test.
//    Written BEFORE the changes below so they are measured against a pin rather than against
//    nothing — if this file only ever holds two tests, it is this one and the one after it.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THIS TEST'S CENTRAL LEG COULD NOT BITE UNTIL REVIEW FOUND IT, and the reason is worth keeping
// in front of the next reader: the file claimed "if this file only ever holds two tests, it is this
// one", and its named mutation — `hit.cid` → `crew[0].cid` — SURVIVED 18/18 GREEN when physically
// applied. The fixture held exactly ONE crew member in the focused room, so the roster's first entry
// and the pawn under the pointer were the same person, and the only other leg was a bare-floor click
// where `hit` is falsy either way. The test could not tell "the cid under the pointer" from "the
// first crew member in the room" — and on `--ship grid`, which puts eight crew in one room, that
// distinction is a live wrong-pawn selection. ⇒ **A SECOND OCCUPANT IS THE FIX; the discriminating
// click is on RYN, who is the LAST roster entry and the second occupant of `quarters`.**
//
// MUTATION: `Hud.selectCrewByCid(crew[0].cid)`                       ⇒ RED (selects ADA, not RYN).
// MUTATION: `const hit = roomCrew(crew, _focus)[0];`                 ⇒ RED (both legs).
// MUTATION: drop the `_armed == null` guard                          ⇒ RED (the armed leg selects).
test('BASELINE: a click on a pawn with NO tool armed selects THAT crew member, by cid', () => {
  prime(null);
  assert.ok(hudSent.length === 0, 'the rig started dirty');

  clickTile(ADA.x, ADA.y);
  assert.deepEqual(hudSent, [{ cmd: 'click', x: ADA.x, y: ADA.y }],
    'the pawn hit test did not reach the shared selection flow. If this is EMPTY the rig failed to '
    + 'capture hud.js\'s `_send` and every selection assertion in this file is vacuous — check the '
    + '`initConsole` capture in `prime()` before touching the controller.');

  // ⭐ THE DISCRIMINATING LEG. RYN stands in the SAME room as ADA and is the LAST roster entry, so a
  // click on her tile can only produce her tile if the handler read the tile. `crewClickTarget`
  // resolves the cid to a fresh x/y off `frame.crew`, so the command's coordinates ARE the identity
  // assertion — a handler that selected `crew[0]` would send Ada's 5,7 instead of Ryn's 8,9.
  hudSent.length = 0;
  clickTile(RYN.x, RYN.y);
  assert.deepEqual(hudSent, [{ cmd: 'click', x: RYN.x, y: RYN.y }],
    'clicking the SECOND occupant of the room did not select HER. This is the leg review found '
    + 'missing: with one occupant, "the cid under the pointer" and "the roster\'s first entry" are '
    + 'the same person and the test cannot tell them apart.');
  assert.notDeepEqual(hudSent, [{ cmd: 'click', x: ADA.x, y: ADA.y }],
    'the click resolved to the FIRST crew member rather than the one under the pointer');

  // …and a click on an EMPTY tile of this room must select nobody at all.
  hudSent.length = 0;
  clickTile(QUARTERS.rx + 4, QUARTERS.ry + 4);
  assert.deepEqual(hudSent, [], 'a click on bare floor selected someone');

  // While a tool IS armed the canvas click belongs to the tool (IX-Z-31) — pinned here because the
  // MOVE tool added by this package is the first tool whose click LOOKS like a selection gesture.
  hudSent.length = 0;
  pressKey('g');                       // arm DIG
  clickTile(ADA.x, ADA.y);
  assert.deepEqual(hudSent, [], 'an armed tool\'s click still selected the pawn under it');
  pressKey('g');                       // disarm
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. ⭐ THE OWNER'S ACTUAL COMPLAINT: the selection must be VISIBLE after room entry.
//    Asserted against DRAWN OUTPUT. A state-inspection version of this passes on `main`.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: revert `pawnSvg(roomCrew(...), _focus, selCid)` to `pawnSvg(roomCrew(...))` ⇒ nothing is
// ever selected in the layer ⇒ RED. MUTATION: `const selCid = null` in `repaint` ⇒ RED here and in
// the dock test below (which is the point of deriving it ONCE).
test('SELECTION SURVIVES ROOM ENTRY — and the Room Zoom SHOWS it', () => {
  prime(null);
  const unselected = layers();
  assert.ok(unselected.length > 0, 'the Room Zoom drew nothing — `enterRoom()` did not repaint, so '
    + 'every assertion here would be vacuous');
  assert.ok(!unselected.includes('rz-sel-pool'),
    'a selection pool is drawn with NOBODY selected — the layer is not reading `frame.sel`');

  // The host says Ada is selected. She was selected on the Overview; entering a room changes nothing
  // about that, and until M1-K the Room Zoom never read it.
  prime(ADA.cid);
  const selected = layers();
  assert.notEqual(selected, unselected, 'the drawn output did not change when a crew member became '
    + 'selected — the surface is still blind to `frame.sel`, which IS the owner\'s report');
  assert.ok(selected.includes('rz-sel-' + ADA.cid),
    'the selection pool is not keyed to the SELECTED cid — a constant id would draw the same pool '
    + 'under whoever happened to be first');
  assert.ok(selected.includes('rz-sel-pool'), 'no selection pool in the drawn output');

  // …and it FOLLOWS the selection rather than latching. Bo is not in this room, so selecting him
  // must take the pool off Ada and put none on screen — which is itself honest: the dock is what
  // tells you where he went.
  prime(BO.cid);
  assert.ok(!layers().includes('rz-sel-pool'),
    'the pool survived the selection moving to a crew member who is not in this room — the layer '
    + 'latched instead of following the frame');
});

// MUTATION: `surnameOf(c.name)` → `''` ⇒ no pill is drawn ⇒ RED. MUTATION: paint every label amber
// ⇒ the "only one reads amber" leg ⇒ RED.
test('EVERY pawn in the room carries its NAME, and exactly one plate reads SELECTED', () => {
  prime(null);
  const plain = layers();
  assert.ok(plain.includes('VALE'), 'the occupant has no name on this surface — VS-Z-29\'s "no name '
    + 'tag" rule was retracted at M1-K because the readout it pointed at is `display:none` here');
  assert.ok(plain.includes('rz-nametag'), 'the name is not in its own labelled group');
  assert.equal((plain.match(/rz-nametag sel/g) || []).length, 0,
    'a label reads SELECTED with nobody selected');

  prime(ADA.cid);
  const lit = layers();
  assert.equal((lit.match(/rz-nametag sel/g) || []).length, 1,
    'exactly one label must read selected — it is how a player tells which pawn the dock row is '
    + 'talking about');
  // ⭐ VR-P3 — THE SELECTED PLATE IS **INVERTED**, NOT AMBER. This leg used to read
  // `lit.includes('#f2b563')`; under ruling E3 there is one accent and it is spent on orders and
  // faults, so "this is the one you picked" is said the way the design says it — a SOLID INK plate
  // with PAPER type, the inverted selected row. That is a channel a hue check could not see and a
  // recolour cannot fake: it asserts the plate's fill AND the type's, which must swap together.
  const selPlate = /<g class="rz-nametag sel">\s*<rect[^>]*fill="#14120F"[^>]*\/><text[^>]*fill="#EBE4D1"/;
  assert.match(lit, selPlate,
    'the selected name plate is not the inverted ink plate — either its fill or its type is still '
    + 'reading the unselected way round');
  // …and an UNSELECTED plate is the other way round, or "inverted" means nothing.
  assert.match(lit, /<g class="rz-nametag">\s*<rect[^>]*fill="#EBE4D1"[^>]*\/><text[^>]*fill="#14120F"/,
    'an unselected name plate is not paper-with-ink — every plate looks selected');

  // The plate must sit INSIDE the scene's own viewBox, not past its bottom edge: the scene reserves
  // a bottom margin for the floor-front dimension arrow, and a plate hung below that is clipped away
  // exactly where the player is most likely to be looking for it (the front row).
  const vbH = roomScene(QUARTERS).viewBox.h;
  const ys = [...lit.matchAll(/<rect x="[-\d.]+" y="([-\d.]+)" width="[\d.]+" height="13"/g)]
    .map((m) => Number(m[1]));
  assert.ok(ys.length > 0, 'the name-plate rect could not be located — this leg is reading nothing');
  for (const y of ys) {
    assert.ok(y + 13 <= vbH,
      `a name plate ends at ${y + 13}, past the scene's ${vbH}-unit viewBox — it would be clipped`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE CREW DOCK — the list the owner asked for, by name.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: pass `roomCrew(crew, _focus)` to `paintCrewDock` instead of `shipCrewRows(...)` ⇒ the
// dock lists one soul ⇒ RED on the first leg (and the whole point of the decision is lost).
test('the dock lists EVERY soul aboard, says where each one is, and lights the selected row', () => {
  prime(BO.cid);
  const rows = el('rz-crewdock').childNodes[1].childNodes;
  assert.equal(rows.length, CREW.length,
    'the dock is not the whole ship. That is the decision recorded in `shipCrewRows` — a room-scoped '
    + 'dock cannot show a crew member selected at ship level who is standing anywhere else, which is '
    + 'the owner\'s report verbatim.');
  assert.match(el('rz-crewdock').childNodes[0].textContent, new RegExp(CREW.length + ' ABOARD'));

  const texts = rows.map((r) => r.textContent);
  assert.ok(texts[0].includes('VALE') && texts[0].includes('HERE'),
    'the soul standing in this room is not marked HERE');
  // The room's DISPLAY name, read off the resolved fixture rather than typed: `deckSlotView` labels
  // a slot from its roomType (`roomLabel`), not from its anchor, so a hand-typed 'HOLD' here would
  // be asserting the anchor string and would pass whether the row printed a name or not.
  assert.ok(texts[1].includes('ASHBY') && texts[1].includes(HOLD.displayName.toUpperCase()),
    'a soul in another room must name that room — it is the answer to "where do I go to find him"');
  assert.ok(texts[2].includes('MARSH') && texts[2].includes('DECK 0'),
    'a soul in a HALL has no room to name, and the honest fallback is the deck');
  assert.ok(texts[3].includes('COE') && texts[3].includes('HERE'),
    'the SECOND soul in this room is not marked HERE — with only one HERE row, "HERE" could be a '
    + 'property of the first row rather than of standing in the room');

  assert.equal(rows[1].getAttribute('aria-pressed'), 'true',
    'the selected row does not say so in words — colour alone is not a state a screen reader can read');
  assert.deepEqual(rows.map((r) => r.classList.contains('sel')), [false, true, false, false]);

  // The HERE marking must agree with the pawn layer, or the dock and the floor are two sources.
  const drawn = layers();
  assert.ok(drawn.includes('VALE'), 'the dock says Ada is HERE and no pawn named VALE was drawn');
  assert.ok(drawn.includes('COE'), 'the dock says Ryn is HERE and no pawn named COE was drawn');
  assert.ok(!drawn.includes('ASHBY'), 'the dock says Bo is elsewhere and a pawn named ASHBY was drawn');
});

// MUTATION: rebuild the row nodes on every repaint (drop the `_crewSig` guard) ⇒ RED, because the
// node identity changes under an unchanged crew. That is §4h: a node torn down between mousedown and
// mouseup fires no `click` in Chrome at all.
//
// ⚠️ THE IDENTITY COMPARISONS ARE `assert.ok(a === b)` AND NOT `assert.equal(a, b)`, AND THE REASON
// IS A MEASURED FALSE RED. `assert.equal` on two DOM nodes builds its failure message by inspecting
// both, and these nodes are deeply cyclic (`parentNode` up to the root, `ownerDocument` holding a Map
// of every registered element). The first version of this test DID detect the mutation and then spent
// **192 seconds** rendering the diff — reported by the harness as `fail=1` on the FILE with no named
// test, which is trap 3 exactly: a red for the wrong reason wearing a plausible failure count.
// `assert.ok` on a pre-computed boolean inspects nothing.
test('a repaint MUTATES the dock rows in place — it never rebuilds the node under the pointer', () => {
  prime(null);
  const before = crewRow(ADA.cid);
  assert.ok(before, 'no row for the crew member — the dock did not paint');
  // A roster rebroadcast with a moved pawn and a changed task: everything a repaint normally carries.
  // ⚠️ DERIVED FROM `CREW`, not re-typed. A hand-listed roster here silently DROPPED a crew member
  // when the fixture grew a fourth soul, which changes the cid SET — so the dock legitimately
  // rebuilt its rows and this test failed for a reason that had nothing to do with what it pins.
  Hud.renderRoster({
    type: 'roster',
    crew: CREW.map((c) => (c.cid === ADA.cid ? { ...c, x: c.x + 1, task: 'Haul parts' } : c)),
  });
  RoomZoom.exitRoom(); RoomZoom.enterRoom('quarters');
  assert.ok(crewRow(ADA.cid) === before, 'the row node was replaced by an ordinary repaint. The '
    + 'roster rebroadcasts on every crew tile-step; a node torn down between mousedown and mouseup '
    + 'fires no `click` at all, which is §4h — and this dock exists to be clicked.');
  assert.match(before.textContent, /Haul parts/,
    'the row did not follow the roster in place — surviving a repaint is worthless if it survives '
    + 'by being stale');

  // POSITIVE CONTROL: a MEMBERSHIP change really does rebuild. Without this leg, "never rebuilds"
  // is satisfied by a dock that is built once and never looks at the roster again.
  Hud.renderRoster({ type: 'roster', crew: [ADA, BO] });
  RoomZoom.exitRoom(); RoomZoom.enterRoom('quarters');
  assert.equal(el('rz-crewdock').childNodes[1].childNodes.length, 2, 'the dock ignored a death');
  Hud.renderRoster({ type: 'roster', crew: CREW });
  RoomZoom.exitRoom(); RoomZoom.enterRoom('quarters');
  assert.equal(el('rz-crewdock').childNodes[1].childNodes.length, CREW.length,
    'the dock ignored a thaw');
  assert.ok(crewRow(ADA.cid) !== before,
    'the row node survived a membership change — the rebuild branch is unreachable, so the guard '
    + 'above is pinning a dock that can never update its rows at all');
});

// MUTATION: drop the `row.here` early return in `onCrewRow` ⇒ clicking the soul already on screen
// re-enters the room and toasts ⇒ RED on the third leg.
test('clicking a dock row SELECTS them, and goes to where they are (the colonist-bar rule)', () => {
  prime(null);
  // (1) SELECT — the shared flow, at the wire.
  fire(crewRow(BO.cid), 'click');
  assert.deepEqual(hudSent, [{ cmd: 'click', x: BO.x, y: BO.y }],
    'the dock row did not reach the shared selection flow');

  // (2) GO THERE — the room on screen is now HIS room, and the drawn pawn proves it (the caption and
  //     breadcrumb are written as markup, so the LAYER is the honest witness).
  const drawn = layers();
  assert.ok(drawn.includes('ASHBY'), 'clicking a crew member in another room did not take the '
    + 'player to that room — RimWorld\'s colonist bar both selects and moves the camera');
  assert.ok(!drawn.includes('VALE'), 'the old room is still being drawn');
  assert.match(el('rz-toast').textContent, /ASHBY/, 'nothing said where the click went');

  // (3) …and a crew member ALREADY on screen navigates nowhere: the glow is the whole feedback.
  prime(null);
  hudSent.length = 0;
  el('rz-toast').textContent = '';
  fire(crewRow(ADA.cid), 'click');
  assert.deepEqual(hudSent, [{ cmd: 'click', x: ADA.x, y: ADA.y }], 'the HERE row did not select');
  assert.equal(el('rz-toast').textContent, '',
    'clicking the soul standing in front of you toasted a navigation that did not happen');
  assert.ok(layers().includes('VALE'), 'the HERE row navigated away from its own room');
});

// MUTATION: `toast(...)` → nothing in the hall branch of `onCrewRow` ⇒ RED. The row still selects,
// so a test that only checked the selection would pass with the click looking swallowed.
test('a crew member in a HALL still selects, and the surface SAYS why it did not move', () => {
  prime(null);
  el('rz-toast').textContent = '';
  fire(crewRow(CY.cid), 'click');
  assert.deepEqual(hudSent, [{ cmd: 'click', x: CY.x, y: CY.y }], 'the hall row did not select');
  assert.match(el('rz-toast').textContent, /MARSH.*DECK 0/,
    'the hall row is silent — a click that selects but cannot navigate must say so, or it reads as '
    + 'a dead row (invisible-feedback-is-FUNCTIONAL)');
  assert.ok(layers().includes('VALE'), 'a hall click moved the room focus somewhere');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE MOVE VERB — the order the owner could not give.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('MOVE is on the palette, in its own class, and is NOT swept', () => {
  assert.ok(ROOM_TOOLS.includes('move'),
    'ROOM_TOOLS lost MOVE. It is the only pawn-directed tool on either standard surface at room '
    + 'scale, and without it `MoveCitizenCommand` is unreachable from inside a room.');
  assert.ok(TOOL_LABEL.move, 'a tool with no label paints an empty button');
  assert.deepEqual(paletteCommand('move'), { cls: 'move', verb: 'move' });
  assert.equal(isSweepTool('move'), false,
    'MOVE became a sweep. A drag would emit one move order per tile in the rectangle, of which only '
    + 'the last could survive — one destination, one click.');
});

// MUTATION: swap the send order to `Cmd.move()` then `Cmd.cursor(...)` ⇒ RED. This is not pedantry:
// `MoveCitizenCommand` is built from `GameSession._cursor`, so the cursor IS the destination and a
// reversed pair sends the crew member wherever the mouse last hovered.
test('MOVE lowers to cursor-then-move, at the clicked tile, for the SELECTED crew member', () => {
  prime(ADA.cid);
  pressKey('m');
  clickTile(QUARTERS.rx + 3, QUARTERS.ry + 2);
  assert.deepEqual(sent, [
    { cmd: 'cursor', x: QUARTERS.rx + 3, y: QUARTERS.ry + 2 },
    { cmd: 'move' },
  ], 'the MOVE tool did not lower to the Overview\'s own two messages, in the Overview\'s own order');
  assert.match(el('rz-toast').textContent, /VALE/,
    'the order named nobody — "who did I just send" is the question the surface has to answer');
  pressKey('m');
});

// MUTATION: delete the `cid == null` guard in `doMove` ⇒ the pair goes out with nothing selected,
// the host answers `"no crew selected"` into a `_status` this surface never renders, and the click
// is COMPLETELY silent ⇒ RED on both legs here.
test('MOVE with nothing selected SENDS NOTHING and says so — the host refusal reaches no player', () => {
  prime(null);
  pressKey('m');
  clickTile(QUARTERS.rx + 3, QUARTERS.ry + 2);
  assert.deepEqual(sent, [],
    'a move order went out with no crew selected. The host refuses it, but its refusal lands in '
    + '`GameSession._status`, which no modern surface renders — so the click would look identical '
    + 'whether it worked or not.');
  assert.match(el('rz-toast').textContent, /NO CREW SELECTED/,
    'the refusal is silent on the surface that produced it');
  pressKey('m');
});

// MUTATION: bind M to `arm('operate')` (the neighbouring branch, and the realistic copy-paste slip)
// ⇒ RED, because the operate tool answers an empty tile with its own toast and sends nothing.
test('the M hotkey arms MOVE — and does not steal a key an existing tool answers', () => {
  prime(ADA.cid);
  pressKey('M');                                   // upper case: the `h` mistake, twice measured
  clickTile(QUARTERS.rx + 2, QUARTERS.ry + 2);
  assert.deepEqual(sent.map((o) => o.cmd), ['cursor', 'move'], 'upper-case M did not arm MOVE');
  pressKey('M');
  // …and the five older tool keys still deliver theirs. Without this, "route every key to move"
  // passes the leg above.
  prime(ADA.cid);
  for (const [k, marker] of [['g', 'dig'], ['v', 'strip'], ['o', 'operate'], ['c', 'erase']]) {
    pressKey(k);
    const html = el('rz-palette').innerHTML;
    assert.ok(html.length > 0, 'the palette is not painted in this rig — the leg below reads nothing');
    sent.length = 0;
    clickTile(QUARTERS.rx + 2, QUARTERS.ry + 2);
    assert.deepEqual(sent.map((o) => o.cmd).includes('move'), false,
      `arming '${marker}' with [${k}] and clicking a tile sent a MOVE order — M has taken another `
      + 'tool\'s binding');
    pressKey(k);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. ⛔ THE INVISIBLE-CURSOR KEY LEAK — recorded AT THE SEAM, never scanned for.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The smallest canvas `installInput` touches (the shape `input.test.js` already uses). */
function fakeCanvas(w, h) {
  const c = new EventTarget();
  c.width = w; c.height = h;
  c.parentElement = { classList: { add() {}, remove() {} } };
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h });
  return c;
}
function evt(type, props) { return Object.assign(new Event(type), props); }

/** Drive the CONSOLE keymap with a given suspension state and return everything it sent. */
function consoleKeys(keys, suspended) {
  const savedWindow = globalThis.window;
  const out = [];
  globalThis.window = new EventTarget();
  const dispose = installInput({
    canvas: fakeCanvas(520, 520),
    camera: { x: 0, y: 0, z: 1, viewW: 520, viewH: 520, tile: 26 },
    session: { send: (o) => out.push(o) },
    getFrame: () => ({ w: 64, h: 32, deck: 0, crew: [[32, 10, 0, 7]], sel: [32, 10] }),
    draw() {}, toggleSprites() {},
    isSuspended: () => suspended,
  });
  try {
    for (const k of keys) globalThis.window.dispatchEvent(evt('keydown', { key: k }));
  } finally { dispose(); globalThis.window = savedWindow; }
  return out;
}

// MUTATION: delete the `if (isSuspended() && !TIME_KEYS.has(k)) return;` line ⇒ RED on the first
// leg. MUTATION: make the stand-down unconditional (drop the TIME_KEYS half) ⇒ RED on the second,
// which is the leg that keeps the Room Zoom's own nudge chip honest.
test('the console keymap STANDS DOWN under a Level-2 takeover — M, T and Enter send nothing', () => {
  // The three keys that did real damage. `M` moved the SELECTED crew member to the console's
  // invisible inspection cursor at a hardcoded {x:32,y:10}; `T` opened a dialogue inside the hidden
  // `#panels`; `Enter` did one or the other. The fixture deliberately puts a selected crew member on
  // that exact hardcoded tile, so `M` and `T` and `Enter` are ALL live in the control below — a
  // fixture with no selection would make three of these vacuous.
  assert.deepEqual(consoleKeys(['m', 'T', 'Enter', 'ArrowLeft', 'w', 'r', '1'], true), [],
    'the deprecated console keymap is still acting while a Level-2 surface owns the screen. `M` '
    + 'sends a real Cmd.move() to a cursor that is drawn NOWHERE on that surface — a keystroke that '
    + 'silently walks a pawn to a hardcoded coordinate is worse than a keystroke that does nothing.');

  // THE TIME KEYS ARE EXEMPT, and that is load-bearing rather than generous: the Room Zoom's own
  // paused-ship nudge reads "‖ HOLD — CLICK OR PRESS SPACE TO RUN THE SHIP". A blanket stand-down
  // makes that chip's own instruction a lie on the surface that prints it.
  assert.deepEqual(consoleKeys([' ', '+', '-'], true).map((o) => o.cmd), ['pause', 'speed', 'speed'],
    'the stand-down swallowed the ship\'s clock. The Room Zoom nudge tells the player to press '
    + 'SPACE; if SPACE is suppressed there, the nudge is the bug.');

  // NON-VACUITY, and it is the whole reason this test is not a source scan: the same keys, NOT
  // suspended, must still do everything they always did. A `consoleKeys` that could never send
  // anything would satisfy the first assertion perfectly.
  // ⚠️ `o.cmd || o.type` — the wire has TWO payload shapes and reading only `cmd` made this leg
  // report `undefined` for every conversation command: `Cmd.talk` is `{type:'talk', cid}` while
  // `Cmd.move` is `{cmd:'move'}` (`wire/session.js:116` vs the game-ui block above it). A
  // non-vacuity control that silently cannot see one of the three keys it names is the shape this
  // whole section exists to avoid.
  const live = consoleKeys(['m', 'T', 'Enter', 'ArrowLeft'], false).map((o) => o.cmd || o.type);
  assert.ok(live.includes('move'), 'the console no longer sends a move order even when it is LIVE — '
    + 'the stand-down has broken the deprecated surface instead of standing it down');
  assert.ok(live.includes('talk'), 'the console no longer talks when live');
  assert.ok(live.includes('cursor'), 'the console no longer moves its cursor when live');
});

// MUTATION: pass `isSuspended` to only the FIRST installInput block in main.js — the WebGL2→Canvas2D
// fallback left bare, which brings the whole leak back after a context loss, silently ⇒ RED.
test('BOTH main.js installInput blocks pass the suspension seam', () => {
  const main = src('src/main.js');
  const blocks = callBlocks(main, 'installInput');
  assert.ok(blocks.length >= 2, 'main.js really does install input twice (the WebGL2→Canvas2D '
    + 'fallback re-installs); this parse found fewer, so it is reading something else');
  blocks.forEach((block, i) => {
    assert.ok(codeOnly(block).includes('isSuspended:'),
      `installInput block #${i + 1} does not pass isSuspended. Wiring only one leaves the `
      + 'invisible-cursor M/T/Enter leak live after a WebGL2 context loss, with nothing on screen '
      + 'to say the keymap came back.');
  });
  // NEGATIVE CONTROL for the comment stripper: a COMMENTED-OUT wiring must NOT satisfy the scan.
  // The fixture carries a LATER REAL COMMENT, because a naive `/\*[\s\S]*?\*\//` stripper finds no
  // match in a fixture whose only `/*` is unterminated and returns the input unchanged — a control
  // that passes whether the stripper works or not (CLAUDE.md, the 2026-07-27 trap).
  const blinded = 'a({ /* isSuspended: () => x, */ b: 1 }); /* a later real comment */ c();';
  assert.equal(codeOnly(callBlocks(blinded, 'a')[0]).includes('isSuspended:'), false,
    'a commented-out wiring satisfies this scan (CLAUDE.md trap #1) — the stripper is not stripping');
  const control = 'a({ isSuspended: () => x, b: 1 }); /* a later real comment */ c();';
  assert.equal(codeOnly(callBlocks(control, 'a')[0]).includes('isSuspended:'), true,
    'the control cannot even see a REAL wiring, so the assertion above is proving nothing');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE BOUNDARY — this package must not open a second door from the map to a person.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: add `Hud.talkSelectedCrew()` to the crew-row handler ⇒ RED. This is `plan §1.5.4`, an
// OWNER DECISION: all crew interaction consolidates into ONE deferred-design Persona window, so a
// dock that grew a TALK or BIO button would be exactly the scattering the census forbids.
// SELECTING is not interacting — `selectCrewByCid` is on SHIP_STATE_REACH and is deliberately NOT
// in CREW_INTERACTION — which is why this dock is legal at all.
test('the crew dock reaches the SELECTION flow and no crew-interaction seam', () => {
  const code = codeOnly(src('src/ui/roomzoom-view.js'));
  assert.ok(code.includes('Hud.selectCrewByCid('),
    'the Room Zoom no longer routes selection through the shared flow — a private selection path '
    + 'would drift from the Overview\'s and from the cross-deck pending-click handling it carries');
  for (const seam of ['talkSelectedCrew', 'openBioForSelected', 'openPersona']) {
    assert.ok(!code.includes(seam),
      `roomzoom-view.js reaches hud.js's '${seam}'. THE BOUNDARY (docs/design/`
      + 'perilune-console-retirement.plan.md §1.5.4, an owner decision): there is exactly ONE door '
      + 'from the map to a person and its design is deferred. A crew dock may SELECT; it may not '
      + 'talk, open a dossier, or grow a third name.');
  }
  // NON-VACUITY: the scan must be able to SEE such a call if one were there.
  assert.ok(codeOnly('x(); Hud.talkSelectedCrew(); /* a later real comment */ y();')
    .includes('talkSelectedCrew'), 'the boundary scan cannot see the thing it forbids');
  assert.equal(codeOnly('x(); // Hud.talkSelectedCrew();\n/* a later real comment */ y();')
    .includes('talkSelectedCrew'), false,
    'the boundary scan fires on a COMMENT, which teaches people to delete explanatory prose');
});

test('the amended VS-Z-29 says what this surface now draws', () => {
  const spec = src('../docs/design/perilune-roomzoom.visual-spec.md');
  assert.match(spec, /VS-Z-29/, 'the pawn rule vanished from the visual spec');
  assert.ok(/RETRACTED|AMENDED/.test(spec.slice(spec.indexOf('VS-Z-29'), spec.indexOf('VS-Z-29') + 2000)),
    'VS-Z-29 still reads "No name tag" with no retraction beside it, while the shipped surface draws '
    + 'one. A code comment quietly disagreeing with a spec is how a surface ends up with two '
    + 'contracts — the whole reason this assertion exists.');
});
