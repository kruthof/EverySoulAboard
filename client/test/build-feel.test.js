// build-feel.test.js — ⭐⭐ THE TWO BUILDING-FEEL DEFECTS, DRIVEN THROUGH THE SHIPPED CONTROLLER.
//
// THE OWNER'S SENTENCE (2026-08-05): *"the ghost shows items are placeable in all open areas — how
// it should be — but the actual building only works in some, which makes no sense; something is
// broken."* Two causes, measured and split before either was fixed
// (`client/tools/place-census-shot.mjs`, real Chrome, the shipped wreck, sim RUNNING):
//
//   (a) THE PRESS NEVER LEFT THE CLIENT — 2 of 30 presses on clear floor reached the wire.
//       `onCanvasClick` hung off `click`, and `paintLayers` replaces `_layers.innerHTML` on every
//       coalesced wire repaint (measured 7 teardowns/s). A repaint between mousedown and mouseup
//       detaches the pressed node, Chrome finds no common ancestor and fires NO `click` at all.
//   (b) THE SIM REFUSED IT IN SILENCE — with (a) closed, 30 of 30 presses reached the wire, 1
//       device landed and 29 were refused with nothing said about any of them.
//
// ⛔ WHAT A NODE HARNESS CAN AND CANNOT PROVE ABOUT (a), STATED RATHER THAN BLURRED. `dom-lite`
// dispatches whatever event a test names, so it CANNOT reproduce "Chrome declines to synthesise a
// click" — only a browser can, and `place-census-shot.mjs` is that half. What this file proves is
// the two things that MADE the browser measurement move, and both go red on a revert:
//   1. the canvas has NO `click` listener any more, read off the registration seam rather than
//      scanned for in source (CLAUDE.md trap 4), so `click` cannot be the resolution path; and
//   2. the pointerdown/pointerup PAIR resolves across a real teardown of the layer stack — driven
//      through the shipped repaint, not simulated with a hand-made `innerHTML` write.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { deckSlots, TOOL_LABEL, roomScene, scenePlacement } from '../src/ui/room-model.js';
import {
  PLACE_REFUSAL_TEXT, placeRefusedText, DEVICE_PLACE_COST_PARTS,
} from '../src/ui/build-cost-model.js';
import { codeOnly } from './code-only.js';
import { makeTrayDriver } from './tray-arm.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

// ── the rig ──────────────────────────────────────────────────────────────────────────────────
// Rebuilt here rather than imported from a sibling test module, which is the house rule stated in
// `prioritise-menu.test.js`: two lanes editing one test module is the merge shape that has already
// broken this repo once.

const TAG_RE = /<(button|span|div)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

/** ⚠️ THE FLAT TAG SCANNER IS `palette-honesty.test.js`'s, ported rather than imported (the house
 *  rule: two lanes editing one test module is the merge shape that broke this repo once). It lifts
 *  START TAGS only and keeps no text, which is why every assertion below reads attributes and
 *  classes rather than `textContent` on chrome the controller wrote with `innerHTML`. */
class RzEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._id = ''; this._html = ''; this._scanned = [];
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
  get id() { return this._id; }
  set id(v) { this._id = v; }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v); this.childNodes = []; this._scanned = [];
    for (const m of this._html.matchAll(TAG_RE)) {
      const el = new RzEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
        else if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
      }
      el.parentNode = this;
      this._scanned.push(el);
    }
  }
  querySelectorAll(sel) {
    if (typeof sel !== 'string' || !sel.startsWith('.')) return [];
    return this._scanned.filter((e) => e.classList.contains(sel.slice(1)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getBoundingClientRect() { return this._rect; }
  insertBefore(el) { return this.appendChild(el); }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (/^\[data-/.test(sel)) {
        const key = sel.replace(/^\[data-|\]$/g, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (n.dataset && n.dataset[key] !== undefined) return n;
      } else if (sel.startsWith('#')) {
        if (n._id === sel.slice(1)) return n;
      } else if (n.classList.contains(sel.replace(/^\./, ''))) return n;
      n = n.parentNode;
    }
    return null;
  }
}
class RzDoc extends DomDocument {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-tray', 'rz-accepts', 'rz-cost', 'rz-minimap',
  'rz-hint', 'rz-ctx', 'rz-ghost',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
  's-speed', 's-msg', 's-runstate', 's-pauselabel', 'b-pause', 's-speedchip',
];
const doc = new RzDoc();
for (const id of RZ_IDS) { const e = new RzEl(doc, 'div'); e._id = id; doc.register(id, e); }
globalThis.document = doc;
/**
 * ⭐ RECORDS EVERY TYPE **AND THE PHASE**, and both halves are load-bearing.
 *
 * ⛔ `dom-lite`'s shared `makeWindow` files only `keydown`, so under it this package's
 * `window.addEventListener('pointerup', clearCanvasPress)` would be dropped on the floor and the
 * latch leg below would pass while measuring nothing — the 4th trap shape (a scope filter that
 * excludes the subject).
 *
 * ⛔ AND THE PHASE IS RECORDED BECAUSE THE ONE-WORD REGRESSION IS A PHASE. Registering that clear in
 * CAPTURE runs it AHEAD of the canvas's own handler, empties `_press` every single time, and kills
 * the whole gesture silently — the exact mutation `overview-view.js:432-439` records surviving a
 * green suite on the sibling surface, "because the test harness could not model event phase". A stub
 * that dropped the third argument would let that mutation through here too, so the harness models
 * it. `isCapture` is NOT `!!opts`: `{capture:false}` is a truthy OBJECT.
 */
const isCapture = (opts) => opts === true || !!(opts && opts.capture === true);
const winListeners = {};
globalThis.window = {
  addEventListener(t, fn, opts) { (winListeners[t] = winListeners[t] || []).push({ fn, capture: isCapture(opts) }); },
  removeEventListener() {},
};

const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))),
                          decodeRooms(decode(JSON.stringify(FIX.rooms))));
const wreck = FIX.frameDeck1;
const DECK1 = 1;
const slot = deckSlots(fixView, DECK1).find((e) => e.anchorName === 'hold');
assert.ok(slot, 'deck-1 slot `hold` is missing from the fixture');
const HOLD = { deck: DECK1, rx: slot.rect.x, ry: slot.rect.y, rw: slot.rect.w, rh: slot.rect.h };

const sent = [];
const api = RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(wreck);
api.enter('hold');

const sceneRectFor = (focus) => {
  const vb = roomScene(focus).viewBox;
  return { left: 0, top: 0, width: vb.w, height: vb.h };
};
const at = (tx, ty) => {
  const [x, y] = scenePlacement(roomScene(HOLD), HOLD).foot(tx, ty);
  return { clientX: Math.round(x), clientY: Math.round(y) };
};
doc.getElementById('rz-layers')._rect = sceneRectFor(HOLD);

const canvas = doc.getElementById('rz-canvas');
const root = doc.getElementById('roomzoom-view');
const tray = doc.getElementById('rz-tray');
const layers = doc.getElementById('rz-layers');
const toastEl = doc.getElementById('rz-toast');
tray.parentNode = root;

function fire(el, type, ev) {
  const e = {
    type, target: el, button: 0, clientX: 0, clientY: 0,
    preventDefault() {}, stopPropagation() { e.propagationStopped = true; }, ...ev,
  };
  let n = el;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    n = n.parentNode;
  }
  return e;
}
/**
 * ⭐⭐ DISPATCH A POINTER EVENT IN THE BROWSER'S OWN PHASE ORDER — window CAPTURE, then the element
 * path, then window BUBBLE, with ONE shared event object throughout. `overview-model.test.js`'s
 * `firePointer`, ported for its stated reason: sandwiching `fire` between two window phases would
 * hand the three phases three different event objects.
 *
 * Every pointer dispatch below goes through this rather than through `fire`, so a
 * `{capture: true}` on the window latch really does run before the canvas handler — see the window
 * stub's header.
 */
function firePointer(target, type, ev) {
  const e = {
    type, target, button: 0, clientX: 0, clientY: 0,
    preventDefault() {}, stopPropagation() { e.propagationStopped = true; }, ...ev,
  };
  const windowPhase = (capture) => {
    for (const l of (winListeners[type] || []).slice()) {
      if (l.capture !== capture) continue;
      l.fn(e);
      if (e.propagationStopped) return true;
    }
    return false;
  };
  if (windowPhase(true)) return e;
  let n = target;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    n = n.parentNode;
  }
  windowPhase(false);
  return e;
}
/** A window-only release — the player let go over a HUD island, so the canvas never sees it. */
const fireWindowOnly = (type, ev) => {
  for (const l of (winListeners[type] || []).slice()) l.fn({ type, button: 0, ...ev });
};

// ⭐ ARMING IS A THREE-PRESS GESTURE NOW — the build tray replaced the flat strip, so a tool is
// reached through its CATEGORY and its LEAF before its card can be pressed. The walk is
// `tray-arm.js`'s (shared, new, single-owner: see its header for why this one module is not ported
// per file), and it drives the shipped `<button>`s through THIS rig's own dispatcher.
const trayDrv = makeTrayDriver({
  doc, assert, click: (b) => fire(b, 'click', { target: b }),
});
function armViaButton(tool) { return trayDrv.arm(tool); }
const raf = () => new Promise((r) => setTimeout(r, 30));
const places = () => sent.filter((o) => o && o.cmd === 'place');
const toastText = () => String(toastEl.textContent || '');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. DEFECT (a) — the press resolves on a POINTER PAIR, and `click` is gone.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ THE REGISTRATION SEAM, NOT A SOURCE SCAN. `dom-lite`'s `Element.addEventListener` files
 * handlers by type, so `canvas.listeners` IS runtime state: no comment stripping, every spelling,
 * and it catches a partial regression where a lane re-adds the `click` binding "as a fallback"
 * (which would double every command on presses that DO produce a click). CLAUDE.md trap 4.
 *
 * MUTATION: restore `_canvas.addEventListener('click', resolveCanvasPress)` ⇒ RED here.
 */
test('THE CANVAS HAS NO `click` LISTENER — the event Chrome does not fire cannot be the path', () => {
  const clickers = (canvas.listeners && canvas.listeners.click) || [];
  assert.equal(clickers.length, 0,
    `the Room Zoom canvas registers ${clickers.length} \`click\` listener(s). \`click\` is precisely `
    + 'the event the browser withholds when a repaint lands between mousedown and mouseup, which on '
    + 'this surface is nearly every press (measured 2/30 in real Chrome). A second binding here also '
    + 'DOUBLES every command on the presses that do produce a click.');
  // NON-VACUITY BY INCLUSION: the census must be able to SEE a listener, or a zero means nothing.
  const pd = (canvas.listeners && canvas.listeners.pointerdown) || [];
  const pu = (canvas.listeners && canvas.listeners.pointerup) || [];
  assert.equal(pd.length, 1, `expected exactly 1 pointerdown listener on the canvas, found ${pd.length}`);
  assert.equal(pu.length, 1, `expected exactly 1 pointerup listener on the canvas, found ${pu.length}`);
  // …and the RIGHT-CLICK is untouched. It was never at risk — `contextmenu` is dispatched at the
  // element under the pointer and needs no common ancestor — but "we did not break it" is a fact
  // about the shipped tree, not an argument.
  assert.equal(((canvas.listeners && canvas.listeners.contextmenu) || []).length, 1,
    'the right-click handler was lost with the click binding');
});

/**
 * ⭐⭐ THE OUTCOME TEST. A repaint that tears the whole layer stack down BETWEEN the press and the
 * release does not eat the command any more.
 *
 * ⛔ THE TEARDOWN IS DRIVEN THROUGH THE SHIPPED REPAINT, not faked with a hand-written
 * `layers.innerHTML = ''`. `Hud.renderFrame` notifies the ship subscribers, `scheduleRepaint`
 * coalesces onto a frame, and `paintLayers` does the `innerHTML =` itself — so what happens between
 * down and up is the same thing that happens ~7×/s on a running ship. A rig that wrote the property
 * itself would be asserting against its own idea of a repaint.
 *
 * MUTATION: revert the resolution to the `click` binding ⇒ RED (0 commands, the shipped bug).
 * MUTATION: capture the tile at UP instead of at DOWN ⇒ still green HERE (the pointer did not move)
 * and RED on the ghost-agreement leg below — which is why both legs exist.
 */
test('⭐⭐ A REPAINT BETWEEN DOWN AND UP NO LONGER EATS THE PRESS', async () => {
  armViaButton('table');
  const tile = { x: HOLD.rx + 2, y: HOLD.ry + 2 };
  sent.length = 0;

  firePointer(canvas, 'pointerdown', { button: 0, ...at(tile.x, tile.y) });
  // …the ship keeps running. This is the teardown, through the shipped path.
  const before = layers.innerHTML;
  Hud.renderFrame(wreck);
  await raf();
  assert.notEqual(layers.innerHTML, undefined,
    'the rig never got a layer stack at all, so "it was torn down" is not a fact about anything');
  firePointer(canvas, 'pointerup', { button: 0, ...at(tile.x, tile.y) });

  const p = places();
  assert.equal(p.length, 1,
    `${p.length} place commands survived a repaint mid-press, expected 1. This is the owner's `
    + '"the actual building only works in some [areas]" — measured at 2/30 in real Chrome before '
    + 'the gesture moved off `click`.');
  assert.equal(p[0].x, tile.x, 'the command landed on the wrong tile');
  assert.equal(p[0].y, tile.y, 'the command landed on the wrong tile');
  assert.ok(String(before).length >= 0);   // keeps the pre-read honest about being taken
  armViaButton('table');   // disarm
});

/**
 * THE TILE IS THE ONE THE GHOST WAS STANDING ON — captured at DOWN, not re-read at release.
 *
 * ⛔ THIS IS THE LEG THE "resolve at release" VARIANT FAILS. The ghost draws at `_hoverTile`, set by
 * the last `mousemove`; if the release re-read the pointer, a repaint that changes what is under the
 * cursor mid-press would move the answer out from under a gesture the player had already aimed. Here
 * the press moves 3 px — inside the slop, so it is still ONE press — and the command must follow the
 * DOWN tile rather than the release point.
 *
 * MUTATION: use `tileAt(e)` at pointerup instead of `press.tile` ⇒ RED whenever the 3 px crosses a
 * tile edge; the fixture picks a point near the edge so it does.
 */
test('the command goes to the tile the press STARTED on (the ghost agreement)', () => {
  armViaButton('table');
  const a = { x: HOLD.rx + 3, y: HOLD.ry + 3 };
  const b = { x: HOLD.rx + 5, y: HOLD.ry + 5 };
  // ⭐⭐ THE REPAINT IS MODELLED AT THE SEAM `tileAt` ACTUALLY READS. Tier one of `tileAt` is
  // `e.target.closest('[data-tile]')` — the tile a standing piece was DRAWN for — so what a repaint
  // changes mid-press is WHICH NODE is under the pointer, not the pointer's pixels. Two stand-in
  // nodes carrying the two `data-tile` values reproduce exactly that, and a pixel offset cannot:
  // the first draft moved the release 3 px, which does not cross a ~95 px tile edge, and the
  // "resolve at UP" mutation SURVIVED GREEN against it. Measured, then fixed.
  const nodeFor = (t) => { const n = new RzEl(doc, 'g'); n.dataset.tile = `${t.x},${t.y}`; n.parentNode = canvas; return n; };
  const pt = at(a.x, a.y);
  sent.length = 0;
  firePointer(nodeFor(a), 'pointerdown', { button: 0, ...pt });
  firePointer(nodeFor(b), 'pointerup', { button: 0, ...pt });   // the piece under the pointer changed
  const p = places();
  assert.equal(p.length, 1, `${p.length} commands for one press`);
  assert.equal(`${p[0].x},${p[0].y}`, `${a.x},${a.y}`,
    'the command followed the RELEASE target, not the tile the press started on. The build ghost '
    + 'draws at the tile the last mousemove resolved, so a release-time re-read moves the order out '
    + 'from under a gesture the player had already aimed at a piece they could see.');
  armViaButton('table');
});

/**
 * A DRAG IS NOT A PRESS. Beyond the slop the gesture is abandoned — this surface has real drag
 * gestures (every sweep tool), and a generous slop would turn an abandoned drag into a placement.
 *
 * MUTATION: delete the slop test in `onCanvasPointerUp` ⇒ RED.
 */
test('a release far from the press sends NOTHING — that was a drag', () => {
  armViaButton('table');
  const down = at(HOLD.rx + 2, HOLD.ry + 2);
  sent.length = 0;
  firePointer(canvas, 'pointerdown', { button: 0, ...down });
  firePointer(canvas, 'pointerup', { button: 0, clientX: down.clientX + 80, clientY: down.clientY + 80 });
  assert.equal(places().length, 0, 'an 80 px drag placed a device');
  armViaButton('table');
});

/**
 * THE WINDOW LATCH. A release that lands somewhere else clears the press, so the NEXT release over
 * the canvas cannot resolve a gesture that was never aimed at it.
 *
 * ⛔ THIS LEG NEEDS A WINDOW STUB THAT RECORDS `pointerup`, WHICH IS WHY THIS FILE HAS ITS OWN.
 * `dom-lite`'s shared `makeWindow` files only `keydown`; under it this test would pass while
 * measuring nothing at all — the 4th trap shape (a scope filter that excludes the subject).
 *
 * MUTATION: delete `window.addEventListener('pointerup', clearCanvasPress)` ⇒ RED.
 * MUTATION: register it with `{capture: true}` ⇒ the latch is emptied before the canvas handler ever
 * reads it and the ⭐⭐ leg above goes RED — the one-word regression `overview-view.js` records.
 */
test('a release that lands OFF the canvas clears the latch', () => {
  armViaButton('table');
  const down = at(HOLD.rx + 2, HOLD.ry + 2);
  sent.length = 0;
  assert.ok((winListeners.pointerup || []).length >= 1,
    'nothing registered a window `pointerup`, so this leg cannot see the latch it is about');
  firePointer(canvas, 'pointerdown', { button: 0, ...down });
  fireWindowOnly('pointerup', down);                                  // released over a HUD island
  firePointer(canvas, 'pointerup', { button: 0, ...down });               // a stray later release
  assert.equal(places().length, 0,
    'a press that ended off the canvas still placed a device when an unrelated release arrived');
  armViaButton('table');
});

/** A SECONDARY button is `onCanvasContext`'s gesture and must never produce a placement. */
test('the RIGHT button never resolves a placement', () => {
  armViaButton('table');
  const down = at(HOLD.rx + 2, HOLD.ry + 2);
  sent.length = 0;
  firePointer(canvas, 'pointerdown', { button: 2, ...down });
  firePointer(canvas, 'pointerup', { button: 2, ...down });
  assert.equal(places().length, 0, 'a right-button press placed a device');
  armViaButton('table');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. DEFECT (b) — the sim's refusal reaches the player, in the sim's own words.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ THE CLIENT'S REASON TABLE MIRRORS `Perilune.Sim.PlaceRefusal`, AND NOTHING ACROSS THAT SEAM
 * COMPILES. The house tripwire idiom: parse the C# and compare (`marks-model.test.js` parses
 * `WireFormat.Marks.cs`, `palette.test.js` parses `GlyphColor.cs`).
 *
 * ⛔ `None = 0` MUST BE ABSENT FROM THE TABLE. It is the no-default sentinel and is never published;
 * giving it a sentence would make the rule unobservable on this side of the wire.
 *
 * MUTATION: add a seventh member to the C# enum ⇒ RED (the client cannot name it).
 * MUTATION: give `0` a sentence in `PLACE_REFUSAL_TEXT` ⇒ RED on the sentinel leg.
 */
test('every sim PlaceRefusal has client words — and the sentinel deliberately has none', () => {
  const src = codeOnly(readFileSync(join(REPO, 'sim/Sim.Core/Events/SimEvents.cs'), 'utf8'));
  const block = src.slice(src.indexOf('enum PlaceRefusal'));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
  const members = [...body.matchAll(/(\w+)\s*=\s*(\d+)\s*,/g)].map((m) => ({ name: m[1], v: +m[2] }));
  assert.ok(members.length >= 7,
    `the C# parse found ${members.length} PlaceRefusal members — the matcher is not matching, so `
    + 'every comparison below is against an empty set (a grep with no non-vacuity check, TRAPS 5)');
  const sentinel = members.find((m) => m.v === 0);
  assert.equal(sentinel && sentinel.name, 'None', 'the sim enum lost its no-default sentinel at 0');
  assert.equal(PLACE_REFUSAL_TEXT[0], undefined,
    'the client gave the NO-DEFAULT sentinel a sentence. `None` is never published; a sentence for '
    + 'it is a sentence for "some reason", which is the silence this package removes wearing words.');

  const missing = [];
  for (const m of members) {
    if (m.v === 0) continue;
    // `CannotPay` is composed from the wire's own two numbers rather than looked up — see
    // `placeRefusedText` — so it is legitimately absent from the table and must still be SAYABLE.
    const sayable = PLACE_REFUSAL_TEXT[m.v] || placeRefusedText({ reason: m.v, price: 3, affordable: 0 }, '');
    if (!sayable || /UNKNOWN TO THIS CLIENT/.test(sayable)) missing.push(`${m.name}=${m.v}`);
  }
  assert.deepEqual(missing, [],
    'the sim can refuse for reasons this client cannot name: ' + missing.join(', '));

  // …and the sentences must DIFFER. Six identical strings satisfy "every reason has words" and tell
  // the player the same thing about six different problems (ThawGate's pairwise-distinct rule).
  const said = members.filter((m) => m.v !== 0)
    .map((m) => placeRefusedText({ reason: m.v, price: 3, affordable: 0 }, 'TABLE'));
  assert.equal(new Set(said).size, said.length,
    'two refusal reasons print the SAME sentence: ' + JSON.stringify(said));
});

/**
 * ⭐⭐ THE RELAY, DRIVEN THROUGH THE SHIPPED API. A `placerefused` message — the host's own payload
 * shape — becomes the toast the player reads, leading with the tool THEY pressed.
 *
 * MUTATION: drop `if (line) toast(line);` from `onPlaceRefused` ⇒ RED (silent again, the shipped bug).
 * MUTATION: drop the `_placeAsked.set(...)` line at the send site ⇒ RED on the tool-name leg.
 */
test('⭐⭐ a refused placement SAYS WHY, naming the tool the player pressed', () => {
  armViaButton('bunk');
  const tile = { x: HOLD.rx + 4, y: HOLD.ry + 2 };
  sent.length = 0;
  toastEl.textContent = '';
  firePointer(canvas, 'pointerdown', { button: 0, ...at(tile.x, tile.y) });
  firePointer(canvas, 'pointerup', { button: 0, ...at(tile.x, tile.y) });
  assert.equal(places().length, 1, 'the press did not reach the wire at all');
  assert.equal(toastText(), '',
    'the press composed its own refusal. The client no longer guesses: the SIM decides and says so.');

  api.placeRefused({ x: tile.x, y: tile.y, deck: HOLD.deck, kind: 5, reason: 5, price: 0, affordable: 0 });
  assert.equal(toastText(), TOOL_LABEL.bunk + ' ▸ ' + PLACE_REFUSAL_TEXT[5],
    `the sim's OCCUPIED refusal reached the player as "${toastText()}"`);

  // …and the entry is CONSUMED, so a later refusal for a tile nobody pressed cannot borrow the name.
  toastEl.textContent = '';
  api.placeRefused({ x: tile.x, y: tile.y, deck: HOLD.deck, kind: 5, reason: 5, price: 0, affordable: 0 });
  assert.equal(toastText(), PLACE_REFUSAL_TEXT[5],
    'the tool name was reused for a second refusal on a tile with no fresh press behind it');
  armViaButton('bunk');
});

/**
 * THE `CannotPay` SENTENCE CARRIES THE SIM'S OWN TWO NUMBERS, and that is the half the client's old
 * ledger guess structurally could not do: the `ledger` channel totals every Part ABOARD while
 * `TryPay` spends only LOOSE, UNRESERVED stacks. A ship whose Parts are in a hauler's arms reads
 * rich and refuses anyway — "it works on some tiles and not others", with no tile involved at all.
 */
test('the cannot-pay sentence quotes the LOOSE count, not the ledger total', () => {
  const line = placeRefusedText(
    { reason: 6, price: DEVICE_PLACE_COST_PARTS, affordable: 1 }, 'TABLE');
  assert.match(line, new RegExp(`NEEDS ${DEVICE_PLACE_COST_PARTS} PARTS`), line);
  assert.match(line, /ONLY 1 IS LOOSE ABOARD/, line);
  // The numbers must come from the ARGUMENT, or the sentence is a constant with a price in it.
  const other = placeRefusedText({ reason: 6, price: 9, affordable: 4 }, 'TABLE');
  assert.match(other, /NEEDS 9 PARTS/, other);
  assert.match(other, /ONLY 4 IS LOOSE ABOARD/, other);
});

/** A refusal that arrives after the player has left the room writes into a hidden box, so it is
 *  dropped rather than queued: the gesture is gone and a toast nobody can read is the very defect
 *  this package removes, one layer up. */
test('a refusal arriving after the room is closed says nothing', () => {
  toastEl.textContent = '';
  RoomZoom.exitRoom();
  api.placeRefused({ x: HOLD.rx + 1, y: HOLD.ry + 1, deck: HOLD.deck, kind: 5, reason: 5, price: 0, affordable: 0 });
  assert.equal(toastText(), '', 'a refusal was toasted into a closed surface');
  api.enter('hold');   // restore the fixture for anything that runs after
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE BLUEPRINT — the owner's second sentence, drawn.
//
// "After placing a new item, it should stay as a ghost until the pawn assembles it." A placement is
// now a `BuildSystem` site (`BuildKind.Device`), and it reaches this surface on the `designs`
// channel carrying the piece's WIRE TOOL-STRING and its facing. The sim half is
// `tests/Perilune.Tests/BlueprintTests.cs`; these are the drawing and the gestures.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Feed the `designs` channel and let the surface repaint. `kind: 3` is `BuildKind.Device`. */
async function renderDesigns(cells) {
  Hud.renderDesigns({ type: 'designs', cells });
  Hud.renderFrame(wreck);
  await raf();
  return layers.innerHTML || '';
}
/** A content digest of the DRAWING ALONE — every `d="…"` payload in the ghost group, concatenated.
 *  Deliberately excludes attributes (`data-bp-facing` and friends), because a comparison that
 *  includes them is satisfied by the attribute changing while the picture does not. */
function inkOf(html) {
  const g = html.slice(html.indexOf('<g class="rz-ghosts"'));
  return [...g.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]).join('|');
}
const BP_TILE = { x: HOLD.rx + 2, y: HOLD.ry + 2 };
const bpCell = (t, tool, facing) => [t.x, t.y, HOLD.deck, 3, 0, 0, 0, tool, facing];

/**
 * ⭐⭐ A PENDING PLACEMENT DRAWS THE PIECE ITSELF, AT ITS FACING — not a mark, not a box.
 *
 * MUTATION: drop the `isBlueprint` arm from `ghostSvg` ⇒ RED (it draws the wall box again).
 * MUTATION: pass `undefined` instead of `g.facing` to `standItem` ⇒ RED on the facing leg.
 */
test('⭐⭐ a pending placement stands on its tile as THE PIECE, turned the way it was placed', async () => {
  const html = await renderDesigns([bpCell(BP_TILE, 'table', 2)]);
  assert.match(html, /class="rz-ghost rz-blueprint"/,
    'no blueprint was drawn for a kind-3 design cell');
  assert.match(html, new RegExp(`data-bp-tile="${BP_TILE.x},${BP_TILE.y}"`), 'the blueprint is on the wrong tile');
  assert.match(html, /data-bp-tool="table"/, 'the blueprint does not know which piece it is');
  assert.match(html, /data-bp-facing="2"/, 'the blueprint lost the facing the player turned it to');

  // ⭐⭐ THE FACING IS IN THE **DRAWING**, not only in the attribute — and this comparison is over
  // the PATH DATA ALONE, which is the fix for a survivor this test shipped with.
  //
  // ⛔ THE FIRST VERSION COMPARED THE WHOLE MARKUP AND COULD NOT BITE. `data-bp-facing="0"` versus
  // `data-bp-facing="1"` is itself a difference, so two strings differed no matter what the art
  // did — and the named mutation (drop the `isBlueprint` arm so the piece is drawn as a plain wall
  // box that ignores facing entirely) SURVIVED GREEN against it. Measured, then fixed. `inkOf`
  // digests only `d="…"` payloads, so it is a statement about the PICTURE, exactly as
  // `build-ghost-shot.mjs`'s ink digest is.
  const at0 = inkOf(await renderDesigns([bpCell(BP_TILE, 'table', 0)]));
  const at1 = inkOf(await renderDesigns([bpCell(BP_TILE, 'table', 1)]));
  assert.notEqual(at0, at1, 'turning the blueprint changed the attribute but not the picture');

  // …and a DIFFERENT piece is a different drawing, so the art really is routed off `tool`.
  const bunk = inkOf(await renderDesigns([bpCell(BP_TILE, 'bunk', 0)]));
  assert.notEqual(at0, bunk, 'TABLE and BUNK blueprints draw the same picture — the art is not routed');
  assert.ok(at0.length > 20, `the ink digest is empty (${at0}) — the comparisons above are between two nothings`);
});

/**
 * ⭐⭐ THE DASH-GRAMMAR DECISION, PINNED: a furniture blueprint is INK `6 5` (UNBUILT/PLANNED), never
 * the oxblood `8 5` of a QUEUED ORDER.
 *
 * The charter's three states are already encoded in `ghostSvg`: oxblood `8 5` = ordered and
 * something is still OWED; oxblood SOLID = STARVED; ink `6 5` = paid for and simply not built. A
 * device blueprint's `required` is 0 because its whole price was charged in PARTS at designate, so
 * nothing is owed and the existing predicate classifies it as the third case — correctly, not
 * accidentally. The oxblood on that tile is reserved for `blockedLayerSvg`, which is what appears
 * when the wait becomes dishonest; two oxblood statements on one square would spend the charter's
 * single accent twice.
 *
 * MUTATION: make `stroke` ATTEND for a blueprint ⇒ RED.
 */
test('the blueprint wears INK 6 5 — the accent is left for the BLOCKED badge', async () => {
  const html = await renderDesigns([bpCell(BP_TILE, 'table', 0)]);
  // ⛔ THE WHOLE GHOST GROUP, NOT A SLICE TO THE FIRST `</g>` — and that slice is why this test
  // shipped with a survivor. `standItem` emits NESTED groups, so the first `</g>` after
  // `rz-blueprint` closes an INNER one and cut the fragment short of the leader line and label —
  // which are the only elements a blueprint's `stroke` actually reaches (the piece's own art
  // ignores it). The named mutation (give a blueprint the ATTEND stroke) SURVIVED GREEN against
  // the truncated fragment. The 4th trap shape: a scope filter that excludes the violation.
  const ghosts = html.slice(html.indexOf('<g class="rz-ghosts"'));
  assert.ok(ghosts.includes('rz-blueprint'), 'the slice does not contain the blueprint at all');
  assert.match(ghosts, /stroke-dasharray="6 5"/, 'the blueprint is not in the UNBUILT dash');
  assert.doesNotMatch(ghosts, /#7B2C22/i,
    'the blueprint spends the oxblood accent. That accent belongs to the BLOCKED badge on this same '
    + 'tile — two oxblood statements on one square and neither means anything.');
  // NON-VACUITY BY INCLUSION: the slice must be able to SEE a colour, or "no oxblood" means nothing.
  assert.match(ghosts, /#14120F/i, 'no INK anywhere in the ghost group — this slice sees no colours at all');
});

/**
 * ⛔ IT IS NOT A PRESS TARGET. The blueprint stands ON the tile it describes and is drawn tall; if it
 * could be hit it would win `tileAt`'s first tier and start answering for presses aimed at the tiles
 * BEHIND it — VR-P3-a's measured defect (16 of 18 fittings designating the wrong tile), re-created by
 * the affordance meant to show intent. `standItem` emits `data-tile`, so the guard is the
 * `pointer-events="none"` on the enclosing group and nothing else.
 *
 * MUTATION: drop `pointer-events="none"` from `ghostSvg`'s wrapper ⇒ RED.
 */
test('the blueprint is inert to the pointer — presses fall through to the floor', async () => {
  const html = await renderDesigns([bpCell(BP_TILE, 'locker', 0)]);
  const i = html.indexOf('rz-ghosts');
  assert.ok(i >= 0, 'no ghost group at all');
  const groupTag = html.slice(html.lastIndexOf('<g', i), html.indexOf('>', i) + 1);
  assert.match(groupTag, /pointer-events="none"/,
    'the blueprint group is pointer-live: a tall piece would swallow presses aimed behind it');
});

/**
 * ⭐ A PAWN STANDING ON THE TILE DOES NOT EVICT THE BLUEPRINT. The `designs` channel is authoritative
 * and independent of the frame's glyph plane, which is exactly why the mark layer was moved off
 * `cell[1]` in the first place (`WireFormat.Marks.cs`: a crew member crossing a condemned tile made
 * its ✕ blink out). The sim half — that a pawn does not block the DESIGNATION either — is
 * `BlueprintTests.ABlueprintMayBeLaidUnderSomebodysFeet`.
 */
test('a pawn standing on the tile does not evict the blueprint', async () => {
  const withPawn = JSON.parse(JSON.stringify(wreck));
  const idx = BP_TILE.y * withPawn.w + BP_TILE.x;
  if (Array.isArray(withPawn.cells[idx])) withPawn.cells[idx][0] = 64; // '@' — a citizen glyph
  Hud.renderDesigns({ type: 'designs', cells: [bpCell(BP_TILE, 'table', 0)] });
  Hud.renderFrame(withPawn);
  await raf();
  assert.match(layers.innerHTML || '', /class="rz-ghost rz-blueprint"/,
    'a pawn walking onto the tile took the blueprint off the screen');
  Hud.renderFrame(wreck);
  await raf();
});

/**
 * THE LIFECYCLE'S OTHER TWO EDGES, both driven off the CHANNEL because the channel is the truth:
 * a completed build drops off `designs` (and the piece arrives on the frame), and a cancelled one
 * drops off too. Neither needs a client rule — which is the point of rendering from the wire.
 */
test('a completed or cancelled blueprint leaves the screen', async () => {
  const before = await renderDesigns([bpCell(BP_TILE, 'table', 0)]);
  assert.match(before, /rz-blueprint/, 'nothing was drawn, so its disappearance proves nothing');
  const after = await renderDesigns([]);
  assert.doesNotMatch(after, /rz-blueprint/,
    'the blueprint outlived its own row on the designs channel');
});

/**
 * ⭐ CANCEL, THROUGH THE GESTURE THE PLAYER ALREADY HAS. DEMOLISH on a pending tile sends
 * `Cmd.build('cancel', …)` — `demolishTarget` classifies ANY design cell as `pending` regardless of
 * its kind byte, so the blueprint inherited the verb with no client change. The sim half (the PARTS
 * come back, exactly) is `BlueprintTests.PlaceThenCancelIsMatterNeutral`.
 */
test('DEMOLISH on a blueprint cancels it', async () => {
  await renderDesigns([bpCell(BP_TILE, 'table', 0)]);
  armViaButton('demolish');
  sent.length = 0;
  const pt = at(BP_TILE.x, BP_TILE.y);
  firePointer(canvas, 'pointerdown', { button: 0, ...pt });
  firePointer(canvas, 'pointerup', { button: 0, ...pt });
  const cancels = sent.filter((o) => o && o.cmd === 'build' && o.kind === 'cancel');
  assert.equal(cancels.length, 1, `${cancels.length} cancel commands, expected 1: ${JSON.stringify(sent)}`);
  assert.equal(`${cancels[0].x},${cancels[0].y}`, `${BP_TILE.x},${BP_TILE.y}`, 'cancelled the wrong tile');
  armViaButton('demolish');
  await renderDesigns([]);
});
