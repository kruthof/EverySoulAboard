// ⭐ M2-10 — *PRIORITISE: REPAIR X* ON THE STANDARD SURFACE, driven end to end through the shipping
// Room Zoom controller.
//
// WHAT THE PLAYER COULD NOT DO BEFORE THIS FILE'S SUBJECT EXISTED: reach a machine with an order.
// Every verb on this surface was a PAINTED DESIGNATION (dig/stockpile/strip) or a TOOL-ARMED CLICK
// (build/place/operate/move); none of them says *"you, go fix that"*. RimWorld's answer is a
// right-click on the thing, and so is this one.
//
// ⚠️ THE HOST HALF IS A CONCURRENT LANE (M2-9) AND NOTHING HERE TOUCHES IT. The wire contract is
// FIXED by the integrator — `{cmd:'prioritise', cid, x, y, deck}` — and it is asserted BY RECORDING
// WHAT ARRIVES AT THE SEAM (`CLAUDE.md` trap 4: never a text scan for the identifier). Until M2-9
// merges the order goes nowhere; that is a sequencing fact, not a defect, and the milestone demo
// (packages.md:3029-3052) runs post-merge.
//
// ⚠️ THE PHASE OF THE `contextmenu` REGISTRATION IS PINNED BY NAME, and it is BUG-B's exact shape.
// `overview-model.test.js` measured what happened the last time a listener on this codebase moved to
// capture: it ran ahead of the handler below it, killed the whole gesture, and the suite stayed
// GREEN. A text scan cannot close that — the third argument has a boolean spelling, an options-object
// spelling (`{capture:true}`, which a naive truthiness recorder ALSO mis-files, see `dom-lite.js`'s
// own header), and both are defeated by a comment. So the phase is RECORDED AT REGISTRATION by the
// element stub and asserted as a value, with a negative control below proving the recorder itself
// normalises all three spellings correctly.
//
// EVERY LEG BELOW IS ITS OWN `test()`. `assert` throws, so a multi-leg test reports only its first
// failure and a dead later leg is indistinguishable from a live one (the fifth trap).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { Cmd } from '../src/wire/session.js';
import { roomTileRect, U } from '../src/ui/room-model.js';
import { decksView } from '../src/ui/decks-model.js';
import { deviceDisplayName, prioritiseCrew, prioritiseOffer } from '../src/ui/prioritise-model.js';
import { DocumentLite, Element } from './dom-lite.js';

// ═════════════════════════════════════════════════════════════════ 0. THE PURE OFFER MODEL

test('deviceDisplayName names the PIECE THE SURFACE DRAWS, upper-cased', () => {
  assert.equal(deviceDisplayName('solar-panel'), 'SOLAR PANEL');
  assert.equal(deviceDisplayName('battery-bank'), 'BATTERY BANK');
  assert.equal(deviceDisplayName('o2-scrubber'), 'O2 SCRUBBER');
});

// ⚠️ THE SIXTH TRAP, ASKED AS "WHAT IS THIS PIECE **NOT**". `GLYPH_SUBSTITUTE` lets a device wear
// another piece's art and `itemForGlyph` resolves resource glyphs too, so an unguarded join would
// label a machine `REGOLITH` — a confident wrong reason, which is worse than the generic word.
// MUTATION: drop the `row.kind !== 'functional'` clause ⇒ the two resource legs fail by name.
test('a NON-functional registry piece never names a machine — it falls back to MACHINE', () => {
  assert.equal(deviceDisplayName('regolith'), 'MACHINE',
    'a RESOURCE piece was used to name an installed machine. `itemForGlyph` resolves ground-stack '
    + 'glyphs, and `GLYPH_SUBSTITUTE` lets a device wear a borrowed row, so the registry `kind` is '
    + 'the only thing that makes an id evidence about what is INSTALLED on a tile.');
  assert.equal(deviceDisplayName('rug'), 'MACHINE', 'a COSMETIC piece is not a machine either');
  assert.equal(deviceDisplayName(''), 'MACHINE');
  assert.equal(deviceDisplayName(undefined), 'MACHINE');
  assert.equal(deviceDisplayName('no-such-piece-at-all'), 'MACHINE');
});

test('the fixture ids used above really are in the registry with the kinds this test claims', () => {
  // NON-VACUITY. Every assertion in the two tests above would also pass if `regolith` and `rug`
  // simply did not exist — the fallback answers MACHINE for an unknown id too. This leg is the
  // INCLUSION test that separates "correctly refused" from "never found" (trap 4's shape).
  assert.notEqual(deviceDisplayName('solar-panel'), 'MACHINE',
    'the registry no longer carries `solar-panel` as a functional piece, so the refusal legs above '
    + 'are vacuous — they are refusing ids that are absent rather than ids that are the wrong kind');
});

test('prioritiseCrew: the SELECTION wins whenever there is one', () => {
  assert.deepEqual(prioritiseCrew(13, [{ cid: 7 }, { cid: 13 }]), { cid: 13, reason: '' });
  assert.deepEqual(prioritiseCrew(7, [{ cid: 7 }]), { cid: 7, reason: '' });
});

// ⭐ THE ONE-CREW INTERIM (integrator, 2026-07-30) — flagged for the owner in the report, not settled
// here. `--ship wreck` is a one-pawn ship and the opening beat is "order a repair, the lights come
// back"; a selection ritual in front of the game's first order is the movie-not-a-game shape.
test('prioritiseCrew: nothing selected + exactly ONE soul aboard ⇒ she is the one', () => {
  assert.deepEqual(prioritiseCrew(null, [{ cid: 9 }]), { cid: 9, reason: '' });
});

// MUTATION: answer `list[0].cid` when nothing is selected ⇒ this goes red. A silent wrong-pawn order
// is precisely the defect `zoom-pawn.test.js`'s RYN fixture exists to catch on the other path.
test('prioritiseCrew: nothing selected + SEVERAL aboard ⇒ NO cid, and a reason in words', () => {
  const r = prioritiseCrew(null, [{ cid: 7 }, { cid: 13 }]);
  assert.equal(r.cid, null, 'with several crew and no selection the client must not guess a pawn');
  assert.match(r.reason, /NO CREW SELECTED/);
});

test('prioritiseCrew: a row with no usable cid is not counted toward "exactly one"', () => {
  // `undefined | 0` is 0, and cid 0 is the host's own NOBODY sentinel — a malformed row counted as
  // the single soul aboard would send an order addressed to nobody and look accepted.
  assert.equal(prioritiseCrew(null, [{ name: 'ghost' }]).cid, null);
  assert.deepEqual(prioritiseCrew(null, [{ name: 'ghost' }, { cid: 4 }]), { cid: 4, reason: '' });
  assert.equal(prioritiseCrew(null, []).cid, null);
  assert.equal(prioritiseCrew(null, null).cid, null);
});

test('prioritiseOffer: a tile with NO devices row is refused, and refused SILENTLY', () => {
  const r = prioritiseOffer({ dev: null, itemId: 'solar-panel', selCid: 7, crew: [{ cid: 7 }] });
  assert.equal(r.ok, false);
  assert.equal(r.silent, true, 'a stray right-click on bare floor is not an intent aimed at '
    + 'anything; a toast on every one of them trains the player to ignore the toast that matters');
});

test('prioritiseOffer: a REAL target with nobody to order is refused OUT LOUD', () => {
  const r = prioritiseOffer({ dev: { cond: 40 }, itemId: 'solar-panel', selCid: null,
    crew: [{ cid: 7 }, { cid: 13 }] });
  assert.equal(r.ok, false);
  assert.equal(r.silent, false, 'this is the `doMove` shape: the host\'s own refusal for a missing '
    + 'selection lands in `_status`, which this surface renders nowhere, so a silent refusal here is '
    + 'indistinguishable from a broken verb');
  assert.match(r.reason, /NO CREW SELECTED/);
});

test('prioritiseOffer: an accepted offer carries the cid and the labelled row', () => {
  const r = prioritiseOffer({ dev: { cond: 40 }, itemId: 'battery-bank', selCid: null, crew: [{ cid: 9 }] });
  assert.equal(r.ok, true);
  assert.equal(r.cid, 9);
  assert.equal(r.label, 'PRIORITISE: REPAIR BATTERY BANK');
});

// ═════════════════════════════════════════════════════════════════ 1. THE WIRE CONTRACT

// The integrator's FIXED contract for the concurrent M2-9 lane. Asserted as a whole-object equality
// so an EXTRA key is a failure too: the host's `WebCommand.Parse` reads named ints, and a stray field
// is a payload two lanes would then have to agree about after the fact.
test('Cmd.prioritise carries cmd + cid + x + y + deck, and nothing else', () => {
  assert.deepEqual(Cmd.prioritise(7, 34, 6, 0), { cmd: 'prioritise', cid: 7, x: 34, y: 6, deck: 0 });
  assert.deepEqual(Cmd.prioritise(13, 2, 3, 1), { cmd: 'prioritise', cid: 13, x: 2, y: 3, deck: 1 });
});

test('Cmd.prioritise keeps every field integral — the host reads JSON ints', () => {
  assert.deepEqual(Cmd.prioritise(7.9, 34.2, 6.7, 0.5),
    { cmd: 'prioritise', cid: 7, x: 34, y: 6, deck: 0 });
});

// ═════════════════════════════════════════════════════════════════ 2. THE DRIVEN RIG
//
// dom-lite plus the four extras `roomzoom-view.js` needs (innerHTML, querySelector(All), closest,
// getBoundingClientRect) — AND an `addEventListener` that RECORDS THE PHASE ARGUMENT. Rebuilt here
// rather than imported from a sibling test module: two lanes editing one test module is the merge
// shape that has already broken this repo once.

/** Selector matching over exactly the forms this surface's handlers use. */
function matchesSel(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  const attr = /^\[([-\w]+)\]$/.exec(sel);
  if (attr) return el.getAttribute(attr[1]) !== null;
  return false;
}

/** ⚠️ THE PHASE NORMALISER, WRITTEN ONCE. Not `!!opts`: `{capture:false}` is an OBJECT, therefore
 *  TRUTHY, and a bare truthiness test files a BUBBLE registration as CAPTURE — the live hole
 *  `dom-lite.js`'s header records having found. The recorder can be wrong in both directions, so it
 *  gets its own negative control below. */
const isCapture = (opts) => opts === true || !!(opts && opts.capture === true);

class RzEl extends Element {
  constructor(doc, tag) {
    super(doc, tag);
    this.id = '';
    this._html = '';
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
    /** type → [{fn, capture}] in registration order. The ONLY record of the third argument. */
    this.phases = {};
  }
  addEventListener(t, fn, opts) {
    (this.phases[t] = this.phases[t] || []).push({ fn, capture: isCapture(opts) });
    super.addEventListener(t, fn);
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  // The two `hud.js` reaches for while reconciling the CONSOLE's crew-watch rows off the same
  // `renderRoster` this rig drives (`reconcileRows`). Same pair `zoom-pawn.test.js` carries.
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

// MUTATION (on the RECORDER, not on the subject): weaken `isCapture` to `!!opts` ⇒ the third leg
// fails. Without this control the phase assertion rests on a stub nobody has checked, which is
// exactly how the same defect hid in `dom-lite.js` until it was measured.
test('the phase recorder itself normalises all three spellings of the third argument', () => {
  const probe = new RzEl(new RzDoc(), 'div');
  const noop = () => {};
  probe.addEventListener('contextmenu', noop);
  probe.addEventListener('contextmenu', noop, true);
  probe.addEventListener('contextmenu', noop, { capture: true });
  probe.addEventListener('contextmenu', noop, { capture: false });
  assert.deepEqual(probe.phases.contextmenu.map((r) => r.capture), [false, true, true, false],
    'the recorder mis-files a spelling. `{capture:false}` is a truthy OBJECT, so a bare `!!opts` '
    + 'test reports a BUBBLE registration as CAPTURE — and then the guard below is asserting a fact '
    + 'about the stub instead of a fact about the surface.');
});

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  'rz-crewdock', 'rz-ctx',
  // console ids `hud.js`'s frame/roster dispatch writes through — the same set the sibling rigs
  // register, for the same reason: `renderFrame`/`renderRoster` are the real receive path.
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
const doc = new RzDoc();
for (const id of RZ_IDS) { const e = new RzEl(doc, 'div'); e.id = id; doc.register(id, e); }
globalThis.document = doc;
globalThis.window = { addEventListener() {}, removeEventListener() {} };

// Resolved AFTER the globals — both modules touch `document` at import time.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":0,"slots":[[0,4,6,12,8,"quarters",5,true,true]]}]}';
const ROOMS_JSON = '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96]]}';
const RECT = roomTileRect(decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON))),
                          'quarters');

// ⭐ THE TWO-MACHINE FIXTURE (charter mutation 2). WING and CELL are DIFFERENT tiles carrying
// DIFFERENT pieces, so "send the machine at the wrong tile" — the first device, the focus origin, the
// room's corner — cannot survive both driven legs.
const WING = [RECT.rx + 1, RECT.ry + 1];   // SolarWing, worn, ON the devices channel
const CELL = [RECT.rx + 5, RECT.ry + 3];   // Battery, worn, ON the devices channel — the SECOND one
const BARE = [RECT.rx + 3, RECT.ry + 1];   // bare floor: no glyph, no row  (charter mutation 4)
// ⭐ THE FOG TILE (charter mutation 5). A machine the FRAME draws with no `devices` row behind it.
// It is a real shape, not a contrivance: `SendDevices` is dirty-version gated, so a frame can arrive
// ahead of the channel, and `BuildDevices` is fog-gated on `TileFlags.Explored` besides. The host
// resolves a prioritise order through the same population, so a menu here is a button that looks
// live and cannot work.
const FOG = [RECT.rx + 7, RECT.ry + 1];

const ADA = { cid: 7, name: 'Ada Vale', role: 'engineer', deck: 0, x: RECT.rx + 2, y: RECT.ry + 4 };
const RYN = { cid: 13, name: 'Ryn Coe', role: 'hauler', deck: 0, x: RECT.rx + 6, y: RECT.ry + 5 };

/** The frame the host would send: floor, three machine glyphs, the given crew, and `sel` on one. */
function frameMsg(crew, selCid) {
  const w = 24, h = 20;
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  const put = (t, code) => { cells[t[1] * w + t[0]] = [code, 0, 0, 0]; };
  put(WING, 'G'.charCodeAt(0));   // → 'solar-panel'
  put(CELL, 'B'.charCodeAt(0));   // → 'battery-bank'
  put(FOG, 'S'.charCodeAt(0));    // → 'o2-scrubber', drawn but NOT on the devices channel
  const who = crew.find((c) => c.cid === selCid) || null;
  return {
    type: 'frame', deck: RECT.deck, w, h, lens: 'none', cells,
    crew: crew.map((c) => [c.x, c.y, 0, c.cid]),
    sel: who ? [who.x, who.y] : [-1, -1],
  };
}

const sent = [];
let primed = false;
/** Mount once, then re-drive into a known state per test. Returns nothing; every test re-primes. */
function prime(crew, selCid) {
  if (!primed) {
    primed = true;
    RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
    const root = doc.getElementById('roomzoom-view');
    // The parent chain the delegated `onHudClick` walks, and the geometry `tileFromCanvasXY` needs.
    for (const id of ['rz-canvas', 'rz-palette', 'rz-toast', 'rz-ctx']) {
      doc.getElementById(id).parentNode = root;
    }
    doc.getElementById('rz-layers').parentNode = doc.getElementById('rz-canvas');
    doc.getElementById('rz-layers')._rect = { left: 0, top: 0, width: RECT.rw * U, height: RECT.rh * U };
    Hud.renderDecks(decode(DECKS_JSON));
    Hud.renderRooms(decode(ROOMS_JSON));
    // The `devices` channel — WING and CELL only. FOG and BARE are deliberately absent.
    Hud.renderDevices(decode(JSON.stringify({
      type: 'devices',
      cells: [
        [WING[0], WING[1], RECT.deck, 5, 40, 0, 0],   // SolarWing (DeviceKind 5), worn, inoperative
        [CELL[0], CELL[1], RECT.deck, 6, 90, 1, 0],   // Battery   (DeviceKind 6), worn, operational
      ],
    })));
  }
  Hud.renderFrame(frameMsg(crew, selCid));
  Hud.renderRoster({ type: 'roster', crew });
  sent.length = 0;
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

const canvas = () => doc.getElementById('rz-canvas');
const menu = () => doc.getElementById('rz-ctx');
const toastText = () => doc.getElementById('rz-toast').textContent;
const atTile = (t) => ({ clientX: (t[0] - RECT.rx) * U + U / 2, clientY: (t[1] - RECT.ry) * U + U / 2 });
/** The player's gesture: right-click the canvas over an absolute sim tile. */
const rightClick = (t) => fire(canvas(), 'contextmenu', atTile(t));
/** The menu's ONE row — found through the real DOM the controller built, never fabricated. */
const menuRow = () => menu().childNodes.find((c) => c.getAttribute
  && c.getAttribute('data-rzctx') === 'prioritise');
/** Click that row the way a player does — through the surface root's delegated handler. */
const clickRow = () => fire(menuRow(), 'click', {});
/** Everything that reached the wire except the hover cursor chatter. */
const orders = () => sent.filter((o) => o.cmd !== 'cursor');

test('the rig really drives the surface (non-vacuity floor for every leg below)', () => {
  prime([ADA], null);
  assert.ok(RECT && RECT.deck === 0, 'the room fixture did not resolve');
  assert.ok(doc.getElementById('rz-layers').innerHTML.length > 0,
    'the Room Zoom drew nothing — enter() did not repaint, so no driven leg is measuring anything');
  assert.ok(RoomZoom.deviceConditionAt(WING[0], WING[1]),
    'the devices channel did not reach the surface — every driven leg below is vacuous');
  assert.ok(RoomZoom.deviceConditionAt(CELL[0], CELL[1]), 'the SECOND machine is not on the channel');
  assert.equal(RoomZoom.deviceConditionAt(FOG[0], FOG[1]), null,
    'the FOG tile has a devices row, so the fog leg is testing nothing');
  assert.ok(menuRow(), 'the menu row was never built — the click leg cannot be driven');
});

// ═════════════════════════════════════════════════════════════════ 3. THE FIVE CHARTER MUTATIONS

// ⭐ MUTATION 1 — "right-click sends no command". RECORDED AT THE SEAM: the exact JSON that reached
// the injected `send`, not a source scan for `Cmd.prioritise`.
// APPLY: delete the `_send(Cmd.prioritise(...))` line in `doPrioritise` ⇒ this reddens on an empty
// `orders()`; replace it with a `toast(...)` ⇒ same.
test('right-click a machine ▸ click the row ▸ ONE prioritise order, in the fixed wire shape', () => {
  prime([ADA], null);
  rightClick(WING);
  assert.equal(menu().hidden, false, 'the menu did not open over a machine on the devices channel');
  clickRow();
  assert.deepEqual(orders(), [{ cmd: 'prioritise', cid: ADA.cid, x: WING[0], y: WING[1], deck: RECT.deck }],
    'the order that reached the wire is not the integrator-fixed contract '
    + '{cmd:"prioritise", cid, x, y, deck}. M2-9 parses exactly these keys.');
});

// ⭐ MUTATION 2 — "send the machine at the wrong tile". The two-machine fixture: the SECOND device,
// at a different x AND a different y from the first, so sending the first machine's tile, the focus
// origin, or the room's corner all fail here while passing the leg above.
test('right-clicking the SECOND machine orders THAT tile — not the first one on the channel', () => {
  prime([ADA], null);
  rightClick(CELL);
  clickRow();
  assert.deepEqual(orders(), [{ cmd: 'prioritise', cid: ADA.cid, x: CELL[0], y: CELL[1], deck: RECT.deck }],
    'the order names a tile the player did not right-click');
});

test('and the row NAMES the machine it is about — the two fixtures read differently', () => {
  prime([ADA], null);
  rightClick(WING);
  assert.equal(menuRow().textContent, 'PRIORITISE: REPAIR SOLAR PANEL');
  prime([ADA], null);
  rightClick(CELL);
  assert.equal(menuRow().textContent, 'PRIORITISE: REPAIR BATTERY BANK',
    'the row shows the same label for two different machines — the name is not derived per tile');
});

// ⭐ MUTATION 3 — "register the context handler with {capture:true}". BUG-B's exact shape.
// APPLY: change `_canvas.addEventListener('contextmenu', onCanvasContext)` to
// `..., onCanvasContext, {capture:true})` (or `, true`) ⇒ this leg reddens and names the phase.
test('the contextmenu handler is registered on the canvas in the BUBBLE phase', () => {
  const regs = canvas().phases.contextmenu || [];
  assert.equal(regs.length, 1,
    'the Room Zoom registers ' + regs.length + ' contextmenu listeners on `.rz-canvas`, not 1');
  assert.equal(regs[0].capture, false,
    'the right-click handler is registered in CAPTURE phase. That is BUG-B\'s exact shape: '
    + '`overview-model.test.js` measured a capture registration on this codebase running ahead of '
    + 'the handler below it, killing the gesture SILENTLY with the whole suite green. It also '
    + 'diverges from the four sibling canvas gestures (mousedown/mousemove/click, all bubble), so '
    + 'the surface would have two registration idioms and no stated reason for either. The phase is '
    + 'read off the third argument recorded AT REGISTRATION — not scanned for in the source, which '
    + 'a comment, whitespace, or the `{capture:true}` options spelling all defeat.');
});

// ⭐ MUTATION 4 — "offer the menu on a tile with no device". APPLY: delete the `if (!o.dev)` early
// return in `prioritiseOffer` ⇒ the menu opens on bare floor and this reddens.
test('right-clicking BARE FLOOR opens nothing and sends nothing', () => {
  prime([ADA], null);
  rightClick(BARE);
  assert.equal(menu().hidden, true, 'the menu opened on a tile with no machine on it');
  clickRow();   // …and the row, if it were somehow live, must still have no target
  assert.deepEqual(orders(), [], 'a right-click on bare floor reached the wire');
});

// ⭐ MUTATION 5 — "offer it on a device whose deviceConditionAt is null". APPLY: in
// `onCanvasContext`, fall back to the frame — e.g. `dev: deviceConditionAt(...) || (tileItemId(...)
// ? {} : null)` ⇒ the menu opens over a machine the host will refuse and this reddens. It is the
// leg that separates "no device" from "device not on the channel": BARE has no glyph either, so
// mutation 4's fixture alone cannot catch a frame fallback.
test('a machine the FRAME draws but the devices channel does not carry is NOT offered', () => {
  prime([ADA], null);
  assert.equal(RoomZoom.deviceConditionAt(FOG[0], FOG[1]), null, 'fixture check: no row for FOG');
  rightClick(FOG);
  assert.equal(menu().hidden, true,
    'the menu was offered on a machine that is not on the `devices` channel. The host resolves a '
    + 'prioritise order through the same fog-gated population, so this is a button that looks live '
    + 'and cannot work — and the client would be promising an order the sim cannot take.');
  assert.deepEqual(orders(), []);
});

// ═════════════════════════════════════════════════════════════════ 4. WHICH PAWN, DRIVEN

test('with a pawn SELECTED the order goes to her, not to the roster\'s first row', () => {
  prime([ADA, RYN], RYN.cid);   // RYN is never crew[0] — the wrong-pawn mutation cannot hide
  rightClick(WING);
  clickRow();
  assert.deepEqual(orders(),
    [{ cmd: 'prioritise', cid: RYN.cid, x: WING[0], y: WING[1], deck: RECT.deck }]);
});

test('with NO selection and SEVERAL aboard the menu is withheld and says why', () => {
  prime([ADA, RYN], null);
  rightClick(WING);
  assert.equal(menu().hidden, true, 'the client guessed a pawn rather than asking for one');
  assert.deepEqual(orders(), []);
  assert.match(toastText(), /NO CREW SELECTED/,
    'a withheld menu with no words is indistinguishable from a broken gesture');
});

// ═════════════════════════════════════════════════════════════════ 5. THE BOX BEHAVES LIKE A MENU

test('the right-click suppresses the browser\'s own context menu — on a machine AND on floor', () => {
  prime([ADA], null);
  assert.equal(rightClick(WING).defaultPrevented, true);
  prime([ADA], null);
  assert.equal(rightClick(BARE).defaultPrevented, true,
    'the native menu is suppressed only where the game answers, so the right button behaves '
    + 'differently depending on what is under it — which is how a player learns not to trust it');
});

test('the box lands under the pointer', () => {
  prime([ADA], null);
  const at = atTile(CELL);
  rightClick(CELL);
  assert.equal(menu().style.left, String(Math.round(at.clientX)) + 'px');
  assert.equal(menu().style.top, String(Math.round(at.clientY)) + 'px');
});

// ⭐ THE EDGE CLAMP. A row naming a machine is ~220 px wide, so a right-click near the right or
// bottom edge of the viewport would put the menu's ONLY control partly off-screen — an order the
// player can see and cannot click, which is `invisible-feedback-is-FUNCTIONAL` in its most literal
// form. The clamp is inert in this rig by default (`getBoundingClientRect` returns zeros, the window
// stub has no `innerWidth`), so this leg SUPPLIES both, which is also the non-vacuity floor: without
// a measurable box and a viewport there is nothing to clamp against.
// MUTATION: delete both `if (box && …)` lines in `openCtx` ⇒ this reddens with the raw pointer x.
test('a menu that would overflow the viewport is pulled back on screen', () => {
  prime([ADA], null);
  const box = menu();
  box._rect = { left: 0, top: 0, width: 220, height: 34 };
  globalThis.window.innerWidth = 300;
  globalThis.window.innerHeight = 300;
  try {
    const at = atTile(CELL);
    assert.ok(at.clientX + 220 > 300,
      'the fixture does not overflow, so this leg would pass with no clamp at all');
    rightClick(CELL);
    assert.equal(box.style.left, '80px', 'the menu was not pulled back inside the viewport');
  } finally {
    delete globalThis.window.innerWidth;
    delete globalThis.window.innerHeight;
    box._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
});

test('a LEFT click on the floor dismisses an open menu', () => {
  prime([ADA], null);
  rightClick(WING);
  assert.equal(menu().hidden, false);
  fire(canvas(), 'click', atTile(BARE));
  assert.equal(menu().hidden, true);
});

test('leaving the room takes the menu down with it', () => {
  prime([ADA], null);
  rightClick(WING);
  RoomZoom.exitRoom();
  assert.equal(menu().hidden, true,
    'the menu survived room exit — its target tile belongs to a room that is no longer on screen');
});

test('the row is spent on click: a second click sends nothing more', () => {
  prime([ADA], null);
  rightClick(WING);
  clickRow();
  assert.equal(orders().length, 1);
  clickRow();
  assert.equal(orders().length, 1,
    'clicking the closed menu\'s row sent a SECOND order. `doPrioritise` must clear its target.');
});
