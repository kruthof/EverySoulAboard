// draw-reveal.test.js — ⭐⭐ THE PIECE DRAWS ITSELF IN, driven through the shipping controller.
//
// THE OWNER'S SENTENCE (2026-08-06): *"we place an item, first see it as a ghost, the pawn comes and
// constructs it — instead of immediately emerging, could it be DRAWN? like if someone writes on
// paper?"* `build-feel.test.js` proves the blueprint half (the ghost stands until a builder comes);
// this file is what happens at the instant the builder finishes.
//
// ⛔ WHAT A NODE HARNESS CAN AND CANNOT PROVE HERE, SAID FIRST. `dom-lite` has no layout, no CSS
// engine and no animation clock, so it CANNOT see a stroke advance — a `stroke-dashoffset` that
// never moves is byte-identical here to one that draws in over 1.2 s. That half is
// `client/tools/draw-reveal-shot.mjs`, which samples the COMPUTED `stroke-dashoffset` out of real
// Chrome across a frame sequence and fails if it does not fall. What this file proves is everything
// that made that measurement possible and everything a repaint can break: the TRIGGER (a wire
// completion, never a timer), the SUPPRESSION (exactly one copy of the piece in the document at
// every instant), the LIFETIME (the overlay is taken away and the layer takes the piece back), and
// the SCHEDULE (`reveal-model` is pure and deterministic).
//
// ⚠️ THE VACUITY THIS RIG HAD TO DEFEAT, NAMED FIRST — it is `build-ghost.test.js`'s, one layer on.
// `syncReveals` opens `if (!_revealLayer) return;`, and `_revealLayer` is null on any harness whose
// hand-listed id array has no `rz-reveal` (which is EVERY other Room-Zoom rig in this directory).
// On such a rig no reveal ever mounts and every assertion phrased as an absence passes for free. So
// `RZ_IDS` below carries `rz-reveal`, and the FIRST test is an inclusion control that fails loudly
// if it ever stops doing so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { deckSlots, roomScene, roomTileRect } from '../src/ui/room-model.js';
import {
  completedTiles, revealFragment, revealTiming, markKind, INK_CLASS, FILL_CLASS, TOTAL_MS, INK_MS,
} from '../src/ui/reveal-model.js';
import { makeRevealLayer } from '../src/ui/reveal-layer.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { stylesSource } from './styles-source.js';
import { codeOnly } from './code-only.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// The rig — its OWN document and window (`room-model.test.js`'s rig header: `initRoomZoom` binds
// listeners unconditionally on every call, so two mounts over one bag double-fire).
// ═════════════════════════════════════════════════════════════════════════════════════════════

const TAG_RE = /<(button|span|div)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

class RvEl extends DomEl {
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
      const el = new RvEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
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
  closest() { return null; }
}
class RvDoc extends DomDocument {
  constructor() { super(); this.body = new RvEl(this, 'body'); }
  createElement(tag) { return new RvEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

/** ⭐ `rz-reveal` IS IN THIS LIST AND THE FIRST TEST PINS IT — see the vacuity note in the header. */
const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-reveal', 'rz-ghost', 'rz-pawnlay', 'rz-pulse',
  'rz-zonekey', 'rz-toast', 'rz-nudge', 'rz-caption', 'rz-breadcrumb', 'rz-tray', 'rz-accepts',
  'rz-cost', 'rz-minimap', 'rz-hint', 'rz-ctx',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
const doc = new RvDoc();
for (const id of RZ_IDS) { const e = new RvEl(doc, 'div'); e._id = id; doc.register(id, e); }
globalThis.document = doc;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
/**
 * ⛔⛔ A **DEFERRED** rAF WITH AN EXPLICIT FLUSH — and this is a correction, not a preference.
 *
 * The sibling rigs run rAF synchronously (`(fn) => { fn(); return 0; }`), which makes every single
 * wire message its own repaint. That is fine for a surface whose state is a pure function of the
 * latest message, and WRONG for this one: `scheduleRepaint` exists to COALESCE, the shipping client
 * really does paint `frame` + `devices` + `designs` in one frame, and the draw-in's whole trigger is
 * a comparison between two consecutive PAINTS. Under a synchronous rAF the atomic completion — the
 * normal case, the one the live rig photographs — is literally inexpressible, and the split case is
 * the only thing the harness can produce. A rig that can only reproduce the rare path would have
 * reported the common path as broken (it did, for one run: 11 red).
 *
 * So callbacks queue, and a test says WHEN the frame happens. Both cases are then explicit rather
 * than accidental: one `flush()` after three messages is the atomic completion, a `flush()` between
 * two of them is the rAF boundary `completedTiles`' fourth clause exists for.
 *
 * ⛔⛔ AND IT RETURNS A **TRUTHY** HANDLE, WHICH IS THE OPPOSITE OF THE SIBLING RIGS' RULE AND IS
 * CORRECT FOR EXACTLY THE OPPOSITE REASON. `build-ghost.test.js` returns 0 deliberately because
 * under a SYNCHRONOUS rAF the callback's own `_raf = 0` runs BEFORE `_raf = raf(...)` lands, so a
 * truthy handle would latch the flag closed forever. Deferred, the assignment completes long before
 * the callback runs — so the handle must be truthy or `scheduleRepaint`'s `if (_raf) return;`
 * COALESCING LATCH NEVER CLOSES and every message queues its own frame again.
 *
 * ⚠️ THAT WAS MEASURED, NOT REASONED. With a falsy handle, three messages queued three callbacks and
 * `flush()` ran three repaints back to back — so a defect that shows up for ONE frame (the trigger
 * running after the furniture layer, i.e. the piece drawn normally and then suppressed on the very
 * next paint) was repaired by repaints 2 and 3 before any assertion could read it, and its mutation
 * SURVIVED. One frame is one paint, here as in the browser.
 */
let _rafQ = [];
let _rafId = 0;
globalThis.requestAnimationFrame = (fn) => { _rafQ.push(fn); return ++_rafId; };
/** Run the frame. ⚠️ ONE ROUND ONLY — callbacks that re-arm (the pawn tween does) land in the NEXT
 *  queue rather than being drained here, which is what a real animation frame does too. */
function flush() {
  const q = _rafQ;
  _rafQ = [];
  for (const fn of q) fn();
}
/** The reduced-motion answer this rig gives. Flipped ONCE, by the last test in the file. */
let REDUCE = false;
globalThis.matchMedia = (q) => ({ matches: /reduce/.test(String(q)) ? REDUCE : false });

const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))),
                          decodeRooms(decode(JSON.stringify(FIX.rooms))));
const DECK1 = 1;
const slot = deckSlots(fixView, DECK1).find((e) => e.anchorName === 'hold');
assert.ok(slot, 'deck-1 slot `hold` is missing from the fixture');
const HOLD = { deck: DECK1, rx: slot.rect.x, ry: slot.rect.y, rw: slot.rect.w, rh: slot.rect.h };
const BASE_FRAME = FIX.frameDeck1;

RoomZoom.initRoomZoom({ send: () => {} });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(BASE_FRAME);
flush();
RoomZoom.enterRoom('hold');

const layersEl = doc.getElementById('rz-layers');
const revealEl = doc.getElementById('rz-reveal');
const layers = () => String(layersEl.innerHTML || '');

// ── the fixture's tiles, and the two states of them ─────────────────────────────────────────
const T = { x: HOLD.rx + 3, y: HOLD.ry + 3 };            // deep inside the room
const T2 = { x: HOLD.rx + 6, y: HOLD.ry + 4 };           // a second interior tile (two at once)
/** ⭐ ON THE ROOM'S FRONT EDGE — i.e. a tile `roomDoorTiles` will plate and `furnitureSvg` will
 *  therefore NOT draw a fitting on. The boundary-door leg's whole subject. */
const TEDGE = { x: HOLD.rx + 4, y: HOLD.ry };
const KEY = T.x + ',' + T.y;
const GLYPH_TABLE = 't'.charCodeAt(0);          // → `dining-table` (client/src/items/glyph-map.js)
const GLYPH_DOOR = 43;                          // '+' — a sliding door; `roomDoorTiles`' own byte
const bpCellAt = (t, tool, facing) => [t.x, t.y, HOLD.deck, 3, 0, 0, 0, tool, facing];
const bpCell = (tool, facing) => bpCellAt(T, tool, facing);
/** A frame with a finished piece's glyph standing on each `[tile, code]` pair. */
function frameWith(...pairs) {
  const f = JSON.parse(JSON.stringify(BASE_FRAME));
  for (const [t, code] of pairs) {
    const idx = t.y * f.w + t.x;
    assert.ok(Array.isArray(f.cells[idx]), `the fixture has no cell at ${t.x},${t.y}`);
    f.cells[idx][0] = code;
  }
  return f;
}
/** The sim's own evidence that the piece on `T` is built. */
const builtFrame = (code = GLYPH_TABLE) => frameWith([T, code]);
const EMPTY_FRAME = JSON.parse(JSON.stringify(BASE_FRAME));
const deviceRow = (face) => ({ type: 'devices', cells: [[T.x, T.y, HOLD.deck, 3, 255, 1, 0, 1, 1, 5, face]] });

/**
 * ⛔⛔ THE FAKE CLOCK IS INSTALLED FOR A **SYNCHRONOUS BLOCK ONLY**, AND THAT NARROWNESS IS THE
 * POINT. `roomzoom-view.later()` resolves `setTimeout` off the global at CALL time precisely so a
 * rig can hold the animation still — but `node --test` runs its own timeouts in this same process,
 * and a fake left installed across an `await` would take the test runner's clock with it. So the
 * swap wraps exactly the call that arms the timer and is restored in a `finally`.
 *
 * @returns {Array<{fn:Function, ms:number}>} every timer armed inside `body`, in order.
 */
function captureTimers(body) {
  const armed = [];
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { const h = { fake: true, fn, ms }; armed.push(h); return h; };
  globalThis.clearTimeout = (h) => { if (h && h.fake) h.cancelled = true; };
  try { body(); } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
  return armed;
}

/**
 * ⚠️ "NO CLOCK WAS ARMED" HAS TO MEAN "NO **DRAW-IN** CLOCK", AND THE FILTER IS MEASURED RATHER THAN
 * DEFENSIVE. `toast()` arms a 2600 ms timer of its own, and `onCrewRow` ends by toasting the room it
 * just opened — so the crew-dock leg counted that toast as a reveal and failed for a reason that had
 * nothing to do with the draw-in. The window is `revealTiming`'s OWN pinned envelope (`TOTAL_MS` …
 * 1600, asserted in this file), not a magic number: if the schedule's contract moves, its own test
 * moves first and this follows.
 */
const revealClocks = (armed) => armed.filter((t) => t.ms >= TOTAL_MS && t.ms <= 1600);

/** Put the room back to "nothing queued, nothing built" and forget every reveal. */
function reset() {
  RoomZoom.exitRoom();
  Hud.renderRoster({ type: 'roster', crew: [] });
  Hud.renderDesigns({ type: 'designs', cells: [] });
  Hud.renderDevices({ type: 'devices', cells: [] });
  Hud.renderFrame(EMPTY_FRAME);
  _rafQ = [];                 // a frame queued by the room we just left must not fire into this one
  RoomZoom.enterRoom('hold'); // …which repaints directly, not through rAF
}

/** Queue a blueprint on `T`, in ONE frame. */
function queue(tool = 'table', facing = 0) {
  queueAt([bpCell(tool, facing)]);
}

/** Queue blueprints on an arbitrary set of tiles, in ONE frame. */
function queueAt(cells) {
  Hud.renderDesigns({ type: 'designs', cells });
  Hud.renderFrame(EMPTY_FRAME);
  flush();
}

/**
 * ⭐⭐ THE COMPLETION, EXACTLY AS THE WIRE DELIVERS IT. `GameSession` sends `frame` (which carries
 * the glyph) BEFORE `devices` and `designs` inside ONE render pass, `BuildSystem.Complete` does both
 * halves on ONE tick, and `scheduleRepaint` coalesces the three messages into ONE frame — so the
 * honest fixture is three messages and a single `flush()`, and the repaint that reads them is the
 * one that must fire. (The rAF boundary that can split them is its own test, and it must be written
 * as a split rather than produced by accident — see the deferred-rAF note at the top of this rig.)
 * Returns the timers armed.
 */
function complete({ face = 0, code = GLYPH_TABLE } = {}) {
  return captureTimers(() => {
    Hud.renderFrame(builtFrame(code));
    Hud.renderDevices(deviceRow(face));
    Hud.renderDesigns({ type: 'designs', cells: [] });
    flush();
  });
}

const overlay = () => revealEl.childNodes.slice();
const overlayHtml = () => overlay().map((n) => String(n.innerHTML || '')).join('');
/** How many copies of the piece stand on `T` in the SCENE (the layer rebuilt every repaint). */
const sceneCopies = () => (layers().match(new RegExp(`data-tile="${KEY}"`, 'g')) || []).length;
/** Path-data digest — the PICTURE alone, `build-feel.test.js`'s `inkOf` rule (an attribute
 *  comparison is satisfied by the attribute moving while the drawing does not). */
const inkOf = (html) => [...String(html).matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]).join('|');

// ═════════════════════════════════════════════════════════════════════ 0. the inclusion control

test('CONTROL: this rig really mounts the reveal layer (else every absence below is free)', () => {
  assert.ok(RZ_IDS.includes('rz-reveal'),
    'rz-reveal has been dropped from RZ_IDS. `syncReveals` opens `if (!_revealLayer) return;`, so '
    + 'every assertion in this file about what the overlay does or does not hold would pass '
    + 'vacuously against a surface that never mounts one.');
  assert.ok(doc.getElementById('rz-reveal'), 'the document has no #rz-reveal node');
  reset();
  queue();
  complete();
  assert.equal(overlay().length, 1,
    'no reveal group was mounted for a completed blueprint — the layer is inert on this rig and '
    + 'nothing below is measuring the shipped behaviour');
});

// ═════════════════════════════════════════════════════════════════════ 1. the trigger

/**
 * ⭐⭐ THE HEADLINE. A blueprint that a builder finishes mounts the FINISHED PIECE, on its own tile,
 * turned the way the player turned it, annotated to draw itself in.
 *
 * MUTATION: drop the `startReveal` call from `syncReveals` ⇒ RED (no group).
 * MUTATION: key the reveal off the design row's absence alone (drop the `pieceKeys` clause in
 *           `completedTiles`) ⇒ RED on the cancellation test below, GREEN here — which is why both
 *           exist.
 */
test('⭐⭐ DRIVEN: a finished blueprint mounts THE PIECE on its tile, annotated to draw itself', () => {
  reset();
  queue('table', 2);
  assert.equal(overlay().length, 0, 'a reveal mounted for a blueprint nobody has built yet');
  complete({ face: 2 });

  const g = overlay();
  assert.equal(g.length, 1, 'exactly one reveal group should stand for one completion');
  assert.equal(g[0].getAttribute('data-rv-tile'), KEY, 'the reveal is keyed to the wrong tile');
  const html = String(g[0].innerHTML || '');
  assert.ok(html.length > 200, 'the reveal group is empty — there is nothing to draw');
  assert.ok(html.includes(INK_CLASS), 'no stroke in the reveal carries the draw class');
  assert.ok(html.includes('pathLength="1"'),
    'no element carries `pathLength="1"` — without the normalisation the CSS dash covers a fraction '
    + 'of every path and the piece draws in as a scatter of dots');
  assert.match(html, /animation-delay:\d+ms/, 'no element carries a stagger delay');

  // ⭐ AND IT IS THE **SAME PIECE THE LAYER WOULD HAVE DRAWN**, not a lookalike: the drawing is
  // compared against the settled scene's own copy of it after the animation ends.
  const drawn = inkOf(html);
  assert.ok(drawn.length > 100, `the reveal's ink digest is empty (${drawn}) — nothing to compare`);
});

/**
 * ⭐ THE FACING REACHES THE DRAWING, and the comparison is over PATH DATA so an attribute that moved
 * while the picture did not cannot satisfy it (`build-feel.test.js` measured that survivor).
 *
 * MUTATION: pass `0` instead of the joined facing in `startReveal` ⇒ RED.
 */
test('DRIVEN: the reveal is turned the way the piece was placed', () => {
  reset(); queue('table', 0); complete({ face: 0 });
  const at0 = inkOf(overlayHtml());
  reset(); queue('table', 1); complete({ face: 1 });
  const at1 = inkOf(overlayHtml());
  assert.ok(at0.length > 100 && at1.length > 100, 'one of the two reveals drew nothing');
  assert.notEqual(at0, at1, 'turning the finished piece did not change the reveal\'s drawing');
});

/**
 * ⭐⭐ THE FACING FALLS BACK TO THE **BLUEPRINT'S**, NOT TO ZERO, WHEN `devices` HAS NOT ARRIVED.
 * `GameSession` sends `frame` before `devices`, so a repaint can land knowing the piece exists and
 * not yet which way round it is. Reading 0 there would draw the reveal one way and hand over to a
 * settled piece facing another — a visible snap at the one instant this feature exists to smooth.
 *
 * MUTATION: `const facing = row ? (row.face & 3) : 0;` ⇒ RED.
 */
test('⭐⭐ DRIVEN: with the devices row not yet in, the reveal takes the BLUEPRINT\'s facing', () => {
  reset(); queue('table', 0);
  captureTimers(() => { Hud.renderFrame(builtFrame()); Hud.renderDesigns({ type: 'designs', cells: [] }); flush(); });
  const facing0 = inkOf(overlayHtml());
  reset(); queue('table', 1);
  captureTimers(() => { Hud.renderFrame(builtFrame()); Hud.renderDesigns({ type: 'designs', cells: [] }); flush(); });
  const facing1 = inkOf(overlayHtml());
  assert.ok(facing0.length > 100, 'no reveal drew at all — the two comparisons are between nothings');
  assert.notEqual(facing0, facing1,
    'the reveal drew the same picture for two different blueprint facings, so the facing came from '
    + 'the absent devices row (0) rather than from the site the player turned');
});

/**
 * ⛔⛔ A CANCELLED ORDER IS NOT A COMPLETION, and this is the leg that makes the trigger honest. A
 * design row also disappears when the player erases it — nothing is built, nothing must be drawn.
 *
 * MUTATION: drop the `pieceKeys` clause from `completedTiles` ⇒ RED here (a table draws itself onto
 *           an empty floor every time an order is erased).
 */
test('⛔⛔ DRIVEN: erasing a blueprint draws NOTHING — the row went, no piece arrived', () => {
  reset(); queue('table', 0);
  const armed = captureTimers(() => {
    Hud.renderFrame(EMPTY_FRAME);                       // the tile is still bare
    Hud.renderDesigns({ type: 'designs', cells: [] });   // …and the order is gone
    flush();
  });
  assert.equal(overlay().length, 0,
    'a reveal mounted for a CANCELLED order — the client invented a completion the sim never '
    + 'reported, and drew a piece onto a floor that has nothing on it');
  assert.equal(revealClocks(armed).length, 0, 'and no animation clock should have been armed');
});

/**
 * ⛔⛔ A COMPLETION IN A ROOM THE PLAYER IS NOT LOOKING AT DRAWS NOTHING, AND QUEUES NOTHING.
 *
 * Both halves matter and the second is the one that rots: a reveal remembered for "next time" would
 * fire the moment the player walked in, drawing a piece that has been standing there for an hour.
 * `_bpPrev` is emptied on entry and exit, so there is no memory to fire from.
 *
 * MUTATION: drop `clearReveals()` from `enterRoom` ⇒ RED (the first repaint of the room reads every
 *           remembered site as vanished and reveals whatever now stands on those tiles).
 */
test('⛔⛔ DRIVEN: a build finished while the room is CLOSED draws nothing, then or later', () => {
  reset(); queue('table', 0);
  RoomZoom.exitRoom();
  const armed = complete();                    // …the builder finishes while we are on the Overview
  assert.equal(overlay().length, 0, 'a reveal was mounted into a closed surface');
  assert.equal(revealClocks(armed).length, 0, 'an animation clock was armed for a room nobody is looking at');

  RoomZoom.enterRoom('hold');
  assert.equal(overlay().length, 0,
    'walking back into the room replayed a completion that happened while it was closed — the piece '
    + 'has been standing there since before the player arrived and must simply be part of the room');
  assert.equal(sceneCopies(), 1,
    'and the piece must be drawn NORMALLY on entry (this is also the non-vacuity check: without it '
    + 'the assertion above is satisfied by a room that draws nothing at all)');
});

// ═════════════════════════════════════════════════════════════════════ 2. exactly one copy

/**
 * ⭐⭐ THE DOUBLE-DRAW RULE, DRIVEN THROUGH REAL REPAINTS. While the piece is drawing itself in on
 * the overlay, the rebuilt furniture layer draws NOTHING for its tile — so the document holds one
 * copy at every instant, through as many repaints as the wire cares to deliver.
 *
 * ⛔ AND THE NON-VACUITY IS THE FIRST ASSERTION, both ways: before the completion the tile carries
 * no piece at all (so "the scene has none" would be free), and after the animation it carries
 * exactly one. Without those two the middle assertion is satisfied by a surface that never draws
 * furniture.
 *
 * MUTATION: delete the `if (drawing.has(key)) continue;` line in `furnitureSvg` ⇒ RED (two copies).
 * MUTATION: move `syncReveals(...)` to AFTER `furnitureSvg` in `paintLayers` ⇒ RED (the first
 *           repaint paints the piece normally and the overlay's copy on top of it).
 */
test('⭐⭐ DRIVEN: mid-animation there is EXACTLY ONE copy of the piece, across forced repaints', () => {
  reset();
  queue('table', 0);
  assert.equal(sceneCopies(), 0, 'precondition: the tile is bare while the order is queued');

  const armed = complete({ face: 0 });
  assert.equal(revealClocks(armed).length, 1, 'the completion armed no animation clock, or armed more than one');
  assert.equal(overlay().length, 1, 'the overlay holds no copy');
  assert.equal(sceneCopies(), 0,
    'the SCENE is drawing the piece as well as the overlay — two copies of one fitting, one of them '
    + 'fully drawn, standing in the same place');

  // …now force repaints, the way the running ship does five to ten times a second.
  const node = revealEl.childNodes[0];
  for (let i = 0; i < 6; i += 1) {
    Hud.renderFrame(builtFrame());
    flush();
    assert.equal(overlay().length, 1, `repaint ${i}: the overlay grew a second copy`);
    assert.equal(sceneCopies(), 0, `repaint ${i}: the scene started drawing the piece again`);
    assert.equal(revealEl.childNodes[0], node,
      `repaint ${i}: the overlay node was REPLACED. A re-parented element does not restart its `
      + 'animation, it teleports to the end value (pawn-layer.js measured it), so the piece would '
      + 'snap to finished on the first wire frame after it started.');
  }

  // …and the hand-off: the animation's own envelope elapses, the overlay goes, the layer takes over.
  revealClocks(armed)[0].fn();
  assert.equal(overlay().length, 0, 'the overlay copy outlived the animation');
  assert.equal(sceneCopies(), 1,
    'nobody is drawing the piece now. The suppression is still holding the tile down after the '
    + 'reveal ended — the fitting has vanished from the room it was just built in.');
});

/**
 * ⭐ THE OVERLAY LIVES FOR THE WHOLE SCHEDULE, AND FOR THE OWNER'S WINDOW.
 *
 * ⚠️ SAY WHAT THIS LEG CANNOT SEE, because the obvious mutation does not bite and a named mutation
 * that cannot bite is this repo's own recurring defect. On every SHIPPED piece the fill's duration
 * clamps to the ink's, so `timing.total` and `TOTAL_MS` are the same number and swapping one for the
 * other changes nothing here — `revealTiming`'s envelope test is what pins that plumbing, across
 * counts where the two differ. What THIS leg pins is that the clock is armed at all, from the
 * schedule rather than from a shorter constant.
 *
 * MUTATION: arm the timer at `timing.inkMs` (a plausible "one stroke's worth" slip) ⇒ RED — the
 *           overlay would be pulled 880 ms into a 1200 ms drawing.
 */
test('the animation clock is armed for the composed schedule, and the schedule is the owner\'s window', () => {
  reset(); queue('table', 0);
  const armed = complete();
  const clocks = revealClocks(armed);
  assert.equal(clocks.length, 1, 'expected exactly one draw-in timer');
  const ms = clocks[0].ms;
  assert.ok(ms >= TOTAL_MS, `the clock (${ms} ms) is shorter than the stagger window (${TOTAL_MS} ms)`);
  assert.ok(ms <= 1600, `the draw-in runs ${ms} ms — past the owner's ~1.0–1.5 s window`);
  clocks[0].fn();
});

// ═════════════════════════════════════════════════════════════════════ 3. the projection guard

/**
 * ⛔ A REVEAL WHOSE SCENE MOVED UNDER IT FINISHES EARLY. The group is composed ONCE in the scene's
 * coordinates (that is the whole point — nothing rewrites it), so a room whose rect changes leaves
 * it standing in the old projection. Ending it hands the tile straight back to the furniture layer,
 * which is drawn from the new one.
 *
 * MUTATION: delete the `_revealViewBox !== scene.viewBoxAttr` arm ⇒ RED (the piece keeps drawing at
 *           the old scale while the room around it is a different size).
 */
test('a room that RESIZES mid-animation ends the reveal rather than drawing it in the old scene', () => {
  reset(); queue('table', 0);
  const armed = complete();
  assert.equal(overlay().length, 1, 'precondition: a reveal is in flight');
  const vb0 = roomScene(roomTileRect(fixView, 'hold', HOLD.slotIndex) || HOLD).viewBoxAttr;

  // Shrink the `hold` slot on the decks channel — the same door `repaint` re-resolves the focus
  // through, so this is the shipped path and not a poke at module state.
  const decks = JSON.parse(JSON.stringify(FIX.decks));
  for (const d of decks.decks) {
    if ((d.deck | 0) !== DECK1) continue;
    for (const s of d.slots) if (s[5] === 'hold') { s[3] = (s[3] | 0) - 2; }
  }
  Hud.renderDecks(decks);
  Hud.renderFrame(builtFrame());
  flush();
  const view2 = decksView(decodeDecks(decode(JSON.stringify(decks))), decodeRooms(decode(JSON.stringify(FIX.rooms))));
  const f2 = roomTileRect(view2, 'hold');
  assert.notEqual(roomScene(f2).viewBoxAttr, vb0,
    'the fixture edit did not move the room\'s viewBox — this test is measuring nothing');

  assert.equal(overlay().length, 0,
    'the reveal survived a change of projection: it is drawing the piece in the OLD scene\'s '
    + 'coordinates, on a plate that is now a different size');
  assert.equal(sceneCopies(), 1, 'and the layer must have taken the piece back, drawn at the NEW scale');
  for (const t of armed) t.fn();      // the stale clock must be harmless
  assert.equal(overlay().length, 0, 'the elapsed clock resurrected something');
  Hud.renderDecks(FIX.decks);         // restore the fixture for anything after
  flush();
  reset();
});

/**
 * ⛔ A PIECE THAT IS REMOVED WHILE ITS OWN REVEAL IS RUNNING TAKES THE REVEAL WITH IT. Otherwise the
 * overlay is the ONLY copy left — a fitting outliving its own demolition, with no wire row behind
 * it. (Rare, and precisely the kind of arm that is written and then never driven.)
 *
 * MUTATION: delete the `if (!pieces.has(key)) finishReveal(key);` sweep in `syncReveals` ⇒ RED.
 */
test('a piece deleted mid-animation takes its own draw-in with it', () => {
  reset(); queue('table', 0);
  complete();
  assert.equal(overlay().length, 1, 'precondition: a reveal is in flight');
  Hud.renderFrame(EMPTY_FRAME);            // the glyph is gone — demolished under the animation
  flush();
  assert.equal(overlay().length, 0,
    'the overlay is still drawing a fitting the ship no longer has, and it is the only copy in the '
    + 'document — nothing else would ever take it away');
  assert.equal(sceneCopies(), 0, 'and nothing must stand on the tile');
});

/**
 * ⛔⛔ THE CROSS-DECK MINIMAP SWAP — and the ONLY reason this test exists is that a mutation
 * survived, twice, and the second survivor named the real hole.
 *
 * 1. Removing `clearReveals()` from `enterRoom` left the whole suite green: every path that reaches
 *    `enterRoom` has been through `exitRoom`, which clears too.
 * 2. Chasing that led to `onMinimapSlot`, which swaps compartments WITHOUT either call — it assigns
 *    `_focus` and repaints. But deleting its clear ALSO survived, because `syncReveals`' own "retire
 *    anything the sim has taken back" sweep finishes a reveal whose tile the new room does not draw,
 *    and two slots on ONE deck are disjoint rects.
 * 3. What is NOT disjoint is two slots on TWO decks. `_bpPrev` and `_revealing` are keyed `"x,y"`
 *    with no deck in the key (each is only ever read against one `_focus`, which carries the deck)
 *    — and the fixture's deck-1 `hold` and deck-0 `workshop` occupy the SAME RECT, which is the
 *    shipped wreck's shape too. So a site still queued in the hold, plus a swap to the workshop
 *    directly below it, plus a piece standing on those coordinates down there, is read as a
 *    COMPLETION: the client draws a fitting nobody just built, in a room the player has only this
 *    second opened. `onMinimapSlot` handles the cross-deck case explicitly (IX-Z-35), so this is a
 *    reachable gesture and not a contrived one.
 *
 * MUTATION: delete `clearReveals()` from `onMinimapSlot` ⇒ RED.
 */
test('⛔⛔ DRIVEN: a CROSS-DECK minimap swap does not read the old deck\'s sites as completions', () => {
  reset();
  queue('table', 0);                       // a site queued in deck-1 `hold`, still waiting
  assert.equal(overlay().length, 0, 'precondition: nothing is drawing yet');

  // The deck BELOW, at the identical rect, with a finished piece standing on the same coordinates.
  const below = JSON.parse(JSON.stringify(builtFrame()));
  below.deck = 0;
  captureTimers(() => { Hud.renderFrame(below); flush(); });
  const before = layers();

  // The slot is a `<rect class="rz-mini-slot">` inside the minimap SVG — this rig's flat scanner does
  // not lift `rect`s, so the target is built by hand and dispatched through the SHIPPED delegated
  // handler (`#roomzoom-view`'s own `click` listener), not by calling `onMinimapSlot` directly.
  const root = doc.getElementById('roomzoom-view');
  const slot = new RvEl(doc, 'rect');
  slot.setAttribute('data-anchor', 'workshop');           // deck 0, the same rect as deck-1 `hold`
  slot.closest = (sel) => (sel === '.rz-mini-slot' ? slot : null);
  const armed = captureTimers(() => {
    for (const fn of (root.listeners.click || []).slice()) {
      fn({ type: 'click', target: slot, detail: 1, preventDefault() {}, stopPropagation() {} });
    }
  });

  assert.notEqual(layers(), before,
    'the minimap click did not swap the compartment at all — every assertion below is vacuous');
  assert.equal(sceneCopies(), 1,
    'and the piece must be drawn NORMALLY down here (the second non-vacuity check: without it the '
    + 'assertion below is satisfied by a room that draws nothing)');
  assert.equal(overlay().length, 0,
    'the client invented a completion out of the OTHER DECK\'s queued site and drew a piece in, in a '
    + 'compartment the player opened one gesture ago');
  assert.equal(revealClocks(armed).length, 0, 'and armed an animation clock for it');
  reset();
});

/**
 * ⛔⛔ THE **SECOND** FOCUS-SWAP DOOR — the crew dock. Found by review after the minimap door had
 * been fixed with a line of its own, which is exactly why the answer moved to a choke point.
 *
 * `onCrewRow` assigns `_focus` and repaints, through the SAME delegated `#roomzoom-view` handler and
 * with the same consequence: one press on a crew member standing a deck below draws a phantom
 * fitting and suppresses the real piece for 1.2 s, because deck-1 `hold` and deck-0 `workshop`
 * occupy the identical rect and the draw-in state is keyed `"x,y"` with no deck in it.
 *
 * MUTATION: delete the `room !== _revealRoom` arm in `syncReveals` ⇒ RED here AND on the minimap leg.
 */
test('⛔⛔ DRIVEN: the CREW DOCK is a focus swap too, and it cold-starts the draw-in', () => {
  reset();
  queue('table', 0);                        // a site queued in deck-1 `hold`, still waiting

  // Somebody standing a deck below, on the identical rect, with a finished piece on the same tile.
  const below = frameWith([T, GLYPH_TABLE]);
  below.deck = 0;
  Hud.renderRoster({
    type: 'roster',
    crew: [{ cid: 77, id: 77, name: 'Rell Ozawa', deck: 0, x: T.x, y: T.y, task: 'None' }],
  });
  captureTimers(() => { Hud.renderFrame(below); flush(); });
  const before = layers();

  const root = doc.getElementById('roomzoom-view');
  const row = new RvEl(doc, 'div');
  row.setAttribute('data-rzcrew', '77');
  row.closest = (sel) => (sel === '[data-rzcrew]' ? row : null);
  const armed = captureTimers(() => {
    for (const fn of (root.listeners.click || []).slice()) {
      fn({ type: 'click', target: row, detail: 1, preventDefault() {}, stopPropagation() {} });
    }
  });

  assert.notEqual(layers(), before,
    'the crew-dock press did not move the surface to her room at all — every assertion below is '
    + 'vacuous. (`onCrewRow` returns early for a row it cannot resolve; check the roster fixture.)');
  assert.equal(sceneCopies(), 1,
    'and the piece must be drawn NORMALLY down here (the second non-vacuity check)');
  assert.equal(overlay().length, 0,
    'one press on the crew dock invented a completion out of the OTHER DECK\'s queued site and drew '
    + 'a piece in — over a compartment the player opened by clicking a name');
  assert.equal(revealClocks(armed).length, 0, 'and armed an animation clock for it');
  reset();
});

/**
 * ⛔⛔ THE TRIGGER ASKS `pieceTileKeys`, AND THIS IS THE LEG THAT MAKES THAT BITE.
 *
 * "One derivation, two consumers" was mechanised on the FURNITURE LAYER only: restating the rule
 * inline in `syncReveals` was green across the whole suite. It is not decorative. A BOUNDARY DOOR is
 * drawn ONCE, by the cutaway's paper plate, and `furnitureSvg` deliberately draws no sprite for it
 * (VR-P3 review, MINOR 4 — the two overlapped into an unreadable smear on `hall_d0_s1`). A trigger
 * that answered "which tiles get a fitting" its own way would stand a door sprite up in the plated
 * opening and DRAW IT IN, re-creating that exact double-draw one package later.
 *
 * ⛔ BOTH DIRECTIONS ON ONE GLYPH, which is what makes this a statement about the PLATING rather
 * than about doors having no art: the same byte on an INTERIOR tile must reveal.
 *
 * MUTATION: `pieceTileKeys(cells, stocked)` (drop `doorTiles`) in `syncReveals` ⇒ RED.
 */
test('⛔⛔ DRIVEN: a completing BOUNDARY door draws nothing — the cutaway already plated it', () => {
  // (a) the same glyph on an INTERIOR tile DOES reveal — the non-vacuity half, first.
  reset();
  queueAt([bpCellAt(T, 'door', 0)]);
  captureTimers(() => {
    Hud.renderFrame(frameWith([T, GLYPH_DOOR]));
    Hud.renderDesigns({ type: 'designs', cells: [] });
    flush();
  });
  assert.equal(overlay().length, 1,
    'glyph 43 on an INTERIOR tile did not reveal — this test cannot then say anything about the '
    + 'boundary case, because "no reveal" would be true of the glyph rather than of the plating');
  reset();

  // (b) the same glyph on the room's FRONT EDGE — plated by the cutaway, drawn by nobody else.
  queueAt([bpCellAt(TEDGE, 'door', 0)]);
  const armed = captureTimers(() => {
    Hud.renderFrame(frameWith([TEDGE, GLYPH_DOOR]));
    Hud.renderDesigns({ type: 'designs', cells: [] });
    flush();
  });
  const edgeKey = TEDGE.x + ',' + TEDGE.y;
  assert.equal(
    (layers().match(new RegExp(`data-tile="${edgeKey}"`, 'g')) || []).length, 0,
    'precondition: the furniture layer is drawing a fitting on a plated boundary tile, so the '
    + 'suppression question this test asks is not the one the surface is answering');
  assert.equal(overlay().length, 0,
    'the draw-in stood a DOOR SPRITE up in an opening the cutaway had already drawn as a paper '
    + 'plate, and inked it in — the VR-P3 double-draw, re-created by the trigger answering "which '
    + 'tiles get a fitting" its own way instead of asking `pieceTileKeys`');
  assert.equal(revealClocks(armed).length, 0, 'and armed a clock for it');
  reset();
});

/**
 * ⭐⭐ A LATE COMPLETION IS NOT ANIMATED — the corrected atomicity claim, driven.
 *
 * Repaints are rAF-COALESCED, not message-batched, so a frame boundary can land between the `frame`
 * message and the `designs` message even though the SIM does both on one tick. When it does, one
 * repaint draws the piece normally (nothing suppresses it yet) and the next would find "row gone ∧
 * piece present" — so the player would watch the fitting POP IN, VANISH and draw itself. The fourth
 * clause (`drawnBefore`) makes the trigger "it appeared ON THIS REPAINT", and the split case
 * degrades to the pre-package behaviour: it appears, and it stays.
 *
 * MUTATION: drop the `before.has(key)` clause from `completedTiles` ⇒ RED.
 */
test('⭐⭐ DRIVEN: a piece the scene ALREADY drew is not re-animated (the split-repaint case)', () => {
  reset();
  queue('table', 0);
  // REPAINT A — the frame message lands alone and the rAF fires before `designs` arrives.
  captureTimers(() => { Hud.renderFrame(builtFrame()); flush(); });
  assert.equal(sceneCopies(), 1,
    'precondition: with the site still queued and the glyph present, the scene draws the piece '
    + 'normally — that is the state this guard is about');
  assert.equal(overlay().length, 0, 'nothing should be animating yet: the row is still on the channel');
  // REPAINT B — now the site clears.
  const armed = captureTimers(() => { Hud.renderDesigns({ type: 'designs', cells: [] }); flush(); });
  assert.equal(overlay().length, 0,
    'the piece POPPED IN on the previous repaint and is now being taken away and drawn in — the '
    + 'player sees it appear, vanish and re-draw. A completion is only a completion on the repaint '
    + 'the piece first appears.');
  assert.equal(sceneCopies(), 1, 'and it must simply stay where it already was');
  assert.equal(revealClocks(armed).length, 0, 'no clock should have been armed');
  reset();
});

/**
 * ⭐ TWO PIECES FINISHING ON ONE TICK EACH GET THEIR OWN REVEAL — the charter's own requirement,
 * and untested until review said so. A builder finishing the last two bunks of a row is the normal
 * case, not the exotic one.
 *
 * MUTATION: `startReveal(done[0]…)` instead of the loop ⇒ RED.
 */
test('⭐ DRIVEN: two simultaneous completions each get their own reveal, and one clock each', () => {
  reset();
  queueAt([bpCellAt(T, 'table', 0), bpCellAt(T2, 'bunk', 1)]);
  assert.equal(overlay().length, 0, 'precondition: two sites queued, nothing drawing');
  const armed = captureTimers(() => {
    Hud.renderFrame(frameWith([T, GLYPH_TABLE], [T2, 'b'.charCodeAt(0)]));
    Hud.renderDesigns({ type: 'designs', cells: [] });
    flush();
  });
  assert.equal(overlay().length, 2, 'two completions must produce two reveal groups, not one');
  const tiles = overlay().map((n) => n.getAttribute('data-rv-tile')).sort();
  assert.deepEqual(tiles, [KEY, T2.x + ',' + T2.y].sort(), 'the two reveals are on the wrong tiles');
  const two = revealClocks(armed);
  assert.equal(two.length, 2, 'each reveal needs its own clock — one shared clock ends both early');
  assert.equal(sceneCopies(), 0, 'and the scene must be suppressing BOTH');
  // …and they end independently: firing one leaves the other drawing.
  two[0].fn();
  assert.equal(overlay().length, 1, 'ending one reveal took the other one with it');
  two[1].fn();
  assert.equal(overlay().length, 0, 'the second reveal never ended');
  reset();
});

// ═════════════════════════════════════════════════════════════════════ 4. the pure derivations

test('completedTiles: three inputs, and each clause is driven in both directions', () => {
  const prev = new Map([['1,1', { facing: 2 }], ['2,2', { facing: 0 }]]);
  const built = new Set(['1,1', '2,2', '9,9']);

  // both gone, both built ⇒ both complete, in `prev`'s own order
  assert.deepEqual(completedTiles(prev, new Map(), built).map((c) => c.key), ['1,1', '2,2']);
  // one still queued ⇒ only the other
  assert.deepEqual(
    completedTiles(prev, new Map([['1,1', {}]]), built).map((c) => c.key), ['2,2'],
    'a site that is STILL on the channel was reported complete');
  // gone but nothing built ⇒ nothing (the cancellation clause)
  assert.deepEqual(completedTiles(prev, new Map(), new Set()).length, 0,
    'a vanished row with no piece on the tile was reported as a completion');
  // a tile that was never queued is never a completion, however much stands on it
  assert.deepEqual(completedTiles(new Map(), new Map(), built).length, 0);
  // and the payload travels, so the facing fallback has something to read
  assert.equal(completedTiles(prev, new Map(), built)[0].was.facing, 2);
});

test('revealTiming: the last stroke finishes inside the envelope, at every count', () => {
  assert.equal(revealTiming(0).total, 0, 'an empty piece has no schedule');
  // ⚠️ THE ONE-ELEMENT PIECE IS STATED RATHER THAN BANDED. With nothing to stagger against, the
  // window collapses to the single stroke's own duration — 320 ms — and stretching one line over
  // 1.2 s would be a slow line, not a drawing. (No shipped piece is one element; the arm exists
  // because `n - 1` is a divisor.)
  assert.equal(revealTiming(1).total, INK_MS, 'a one-stroke piece should take exactly one stroke');
  assert.equal(revealTiming(1).step, 0, 'and have no stagger at all');
  for (const n of [2, 7, 40, 320, 900]) {
    const t = revealTiming(n);
    const lastDelay = Math.round(t.step * (n - 1));
    assert.ok(t.total >= lastDelay + t.inkMs,
      `n=${n}: the envelope (${t.total}) ends before the last INK stroke does (${lastDelay}+${t.inkMs}). `
      + 'The overlay would be pulled out from under a stroke that is still drawing.');
    assert.ok(t.total >= lastDelay + t.fillMs,
      `n=${n}: the envelope ends before the last FILL does (${lastDelay}+${t.fillMs})`);
    assert.ok(t.total >= TOTAL_MS && t.total <= 1600,
      `n=${n}: the draw-in runs ${t.total} ms, outside the owner's ~1.0–1.5 s window`);
  }
  // ⛔ THE STROKE IS FIXED AND THE STAGGER MOVES — the other way round, a 400-element capsule would
  // draw each stroke in 3 ms, which reads as appearing rather than as being drawn.
  assert.equal(revealTiming(40).inkMs, revealTiming(400).inkMs, 'the per-stroke duration moved with the count');
  assert.ok(revealTiming(40).step > revealTiming(400).step, 'the stagger did not tighten with the count');
});

test('markKind: the halo pass is INK even though the paths carry no stroke of their own', () => {
  // `sketch.js` puts the knockout colour on the wrapping <g>, so judged alone a halo path has no
  // stroke — and would be skipped, i.e. the whole pencil pass would appear instantly.
  assert.equal(markKind({ 'stroke-width': '2' }, { stroke: '#EBE4D1', fill: 'none' }, 'path'), 'ink');
  assert.equal(markKind({ fill: '#EBE4D1', stroke: 'none' }, { stroke: null, fill: null }, 'path'), 'fill');
  assert.equal(markKind({ fill: 'none', stroke: 'none' }, { stroke: null, fill: null }, 'path'), null,
    'an element that paints nothing must not take a slot in the stagger');
  assert.equal(markKind({}, { stroke: null, fill: null }, 'text'), 'fill',
    'an unset fill is BLACK in SVG, not nothing — a warm-set label really is painted');
});

// ── the fragment annotation, against a REAL shipped piece ───────────────────────────────────────

const { standItem } = RoomZoom;
const { scenePlacement } = await import('../src/ui/room-model.js');
const PIECE = standItem('locker', T.x, T.y, scenePlacement(roomScene(HOLD), HOLD), 'rv-test', undefined, 0);

/** Every annotated open tag, in emission order, with its delay and its class. */
function schedule(html) {
  const out = [];
  for (const m of String(html).matchAll(/<([-\w]+)\b([^>]*)>/g)) {
    const attrs = m[2];
    const d = /animation-delay:(\d+)ms/.exec(attrs);
    if (!d) continue;
    out.push({
      tag: m[1], delay: +d[1],
      ink: new RegExp(`class="[^"]*\\b${INK_CLASS}\\b`).test(attrs),
      fill: new RegExp(`class="[^"]*\\b${FILL_CLASS}\\b`).test(attrs),
      pathLength: /pathLength="1"/.test(attrs),
      at: m.index,
    });
  }
  return out;
}

test('⭐⭐ revealFragment: the stagger IS emission order, which is painter order', () => {
  const { html, count } = revealFragment(PIECE);
  const rows = schedule(html);
  assert.ok(count > 30, `a treated locker annotated only ${count} elements — the fixture is not a real piece`);
  assert.equal(rows.length, count, 'the count and the annotated elements disagree');
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].delay >= rows[i - 1].delay,
      `element ${i} is scheduled BEFORE the one emitted in front of it (${rows[i].delay} < ${rows[i - 1].delay}). `
      + 'The piece would draw back-to-front in places, which is exactly what emission order exists to prevent.');
  }
  assert.equal(rows[0].delay, 0, 'the first stroke does not start at zero');
  assert.ok(rows[rows.length - 1].delay > 0, 'every element starts at once — there is no stagger at all');
});

/**
 * ⭐⭐ PENCIL, THEN INK — and it is asserted as a CONSEQUENCE of emission order rather than as a
 * hand-tuned offset. `sketch.drawShape` emits an element's paper knockout group before that
 * element's ink runs, so every halo in a group is scheduled ahead of the first ink emitted after the
 * group closes.
 *
 * MUTATION: reverse the stagger (`step * (n - 1 - idx)`) ⇒ RED here and on the monotonicity leg.
 */
test('⭐⭐ revealFragment: every knockout begins ahead of the ink it makes room for', () => {
  const { html } = revealFragment(PIECE);
  // The halo groups are `sketch.js`'s own: `<g fill="none" stroke="#EBE4D1" …>`.
  const groups = [...html.matchAll(/<g fill="none" stroke="#EBE4D1"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.ok(groups.length > 3,
    `only ${groups.length} knockout groups in a treated locker — the piece is not carrying the halo `
    + 'pass, so this test is measuring nothing (check `SKETCH_LEVEL` is still `strong`)');
  let checked = 0;
  for (const g of groups) {
    const inside = schedule(g[1]);
    if (!inside.length) continue;
    const after = schedule(html.slice(g.index + g[0].length)).filter((r) => r.ink);
    if (!after.length) continue;
    const lastHalo = Math.max(...inside.map((r) => r.delay));
    assert.ok(lastHalo <= after[0].delay,
      `a knockout at ${lastHalo} ms starts AFTER the ink it is carving room for (${after[0].delay} ms) — `
      + 'the pencil is being drawn over the ink');
    checked += 1;
  }
  assert.ok(checked > 3, `only ${checked} halo/ink pairs were actually compared — the loop is vacuous`);
});

test('revealFragment: `pathLength="1"` goes on the strokes and nowhere else', () => {
  const { html } = revealFragment(PIECE);
  for (const r of schedule(html)) {
    assert.equal(r.pathLength, r.ink,
      `a ${r.fill ? 'FILL' : 'INK'} element ${r.pathLength ? 'carries' : 'is missing'} pathLength. `
      + 'On a stroke it is what makes one CSS dash cover every path length; on a fill it is noise.');
  }
});

test('⛔ revealFragment: nothing inside <defs> is touched — a pattern is not a mark on the paper', () => {
  const { html } = revealFragment(PIECE);
  const defs = [...html.matchAll(/<defs>([\s\S]*?)<\/defs>/g)].map((m) => m[1]).join('');
  assert.ok(defs.length > 40,
    'the fixture piece emits no <defs> at all, so this test is vacuous — pick a piece with a hatch');
  assert.ok(!defs.includes(INK_CLASS) && !defs.includes(FILL_CLASS),
    'a <defs> child was annotated. A `<pattern>` TILES: its contents are rasterised per tile, so an '
    + 'animated rule inside one flickers across every hatched face in the piece, at the pattern\'s '
    + 'period, forever.');
  assert.ok(!defs.includes('pathLength'), 'and a definition must not be normalised either');
});

test('⛔ revealFragment: text content survives (the tokeniser its neighbour would have dropped)', () => {
  const src = '<g><text x="1" y="2" fill="#14120F">HOLD 4</text>'
    + '<path d="M0 0 L4 0" stroke="#14120F" stroke-width="1"/></g>';
  const { html, count } = revealFragment(src);
  assert.ok(html.includes('>HOLD 4<'),
    'the label was eaten. `sketch.js` tokenises with `src.match(TAG)` and re-joins the matches, '
    + 'which deletes every text node; copying that here would strip the labels off the warm set for '
    + 'the length of the animation and put them back when the overlay went away.');
  assert.equal(count, 2, 'the label and the stroke are both marks and both take a slot');
});

test('revealFragment: PURE — same bytes twice, and a piece with nothing to draw is refused', () => {
  assert.equal(revealFragment(PIECE).html, revealFragment(PIECE).html, 'not deterministic');
  assert.equal(revealFragment('').count, 0);
  assert.equal(revealFragment('<g><use href="#x"/></g>').count, 0,
    'a fragment with no recognisable mark must report 0 so the caller declines to mount — a mounted '
    + 'empty group suppresses the layer for 1.2 s and puts nothing in its place');
  // the class is APPENDED, never assigned — `pl-sk-ground` / `pl-sk-2nd` are named by guards elsewhere
  const kept = revealFragment('<path class="pl-sk-2nd" d="M0 0 L1 1" stroke="#14120F"/>').html;
  assert.ok(kept.includes('pl-sk-2nd') && kept.includes(INK_CLASS),
    'the treatment\'s own class was overwritten; `sketch-adoption.test.js` identifies the doubled '
    + 'silhouette by that class and nothing else');
});

// ═════════════════════════════════════════════════════════════════════ 4a. the focus-swap census

/**
 * ⭐⭐ THE SWEEP, MADE DURABLE — every site that assigns `_focus`, enumerated, with the rule each one
 * has to obey written next to it.
 *
 * ⛔ THIS EXISTS BECAUSE THE LIST WAS WRONG TWICE. `onMinimapSlot` was found by a mutation, fixed
 * with a line of its own, and `onCrewRow` — the same shape, the same bug — was then found by review.
 * CLAUDE.md's answer to that is *sweep the class, not the list*, so the fix moved to a choke point
 * (`syncReveals`' room-identity check) that every swap reaches because every swap must repaint. This
 * census is the OTHER half: it does not let a THIRD door appear unnoticed, and its failure text
 * carries the one question a new door has to answer.
 *
 * ⚠️ IT PINS THE SET OF ENCLOSING FUNCTIONS, NOT A COUNT. A count is satisfied by a swap moving from
 * one function to another; the names are what a reader can check against the argument.
 */
test('⭐⭐ CENSUS: every `_focus` assignment in the surface is a site this package has considered', () => {
  const src = codeOnly(readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8'));
  const fnAt = (idx) => {
    const before = src.slice(0, idx);
    const m = [...before.matchAll(/(?:^|\n)(?:export\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)].pop();
    return m ? m[1] : '(module scope)';
  };
  const sites = [];
  for (const m of src.matchAll(/(?<![A-Za-z0-9_.])_focus\s*=\s*(?!=)/g)) {
    // ⚠️ THE `let _focus = null;` DECLARATION IS NOT A SWAP. Counting it put a helper's name in the
    // set and made the census fail for a reason that has nothing to do with a door.
    if (/\b(?:let|var|const)\s+$/.test(src.slice(Math.max(0, m.index - 8), m.index))) continue;
    sites.push(fnAt(m.index));
  }
  assert.ok(sites.length >= 4,
    `only ${sites.length} \`_focus\` assignments found — the scan has rotted (it is reading a file `
    + 'whose shape has changed) and this census is measuring nothing');
  assert.deepEqual([...new Set(sites)].sort(), ['enterRoom', 'exitRoom', 'onCrewRow', 'onMinimapSlot', 'repaint'],
    'A NEW SITE ASSIGNS `_focus`. Answer one question before adding it here:\n'
    + '  Does it call `repaint()` afterwards? If YES, nothing more is needed — `syncReveals` compares\n'
    + '  the room identity against `_revealRoom` on every paint and cold-starts the draw-in for you\n'
    + '  (that is the whole reason the per-door calls were removed). If NO — it changes which room is\n'
    + '  on screen without a paint — it must call `clearReveals()` itself, like `exitRoom` does, or\n'
    + '  the previous room\'s queued sites are read as completions in this one: a phantom fitting\n'
    + '  drawn in, and the real piece on that tile suppressed for 1.2 s. Two slots on two decks\n'
    + '  routinely share a rect (the fixture\'s `hold`/`workshop` do, and so does the wreck), and the\n'
    + '  draw-in state is keyed "x,y" with no deck in it.');
});

test('CONTROL: the `_focus` census would SEE a new assignment site', () => {
  // Without this the census passes for a scan that matches nothing — CLAUDE.md's 4th shape, and the
  // exact way a source census rots into decoration.
  const planted = codeOnly('function somethingNew(t) {\n  _focus = t;\n  repaint();\n}\n');
  const hits = [...planted.matchAll(/(?<![A-Za-z0-9_.])_focus\s*=\s*(?!=)/g)];
  assert.equal(hits.length, 1, 'the census pattern does not match a plain `_focus = t;` assignment');
  assert.ok(!/(?<![A-Za-z0-9_.])_focus\s*=\s*(?!=)/.test(codeOnly('if (_focus === t) return;\nx._focus = 1;')),
    'the census pattern matches a COMPARISON or a property write, so it would report sites that are '
    + 'not swaps and train the next lane to widen the allow-list');
});

// ═════════════════════════════════════════════════════════════════════ 4b. the stylesheet

/**
 * ⛔⛔ THE OVERLAY MUST BE TRANSPARENT TO THE POINTER, AND UNTIL REVIEW NOTHING SAID SO — deleting
 * `pointer-events:none` from `.rz-revealer` left the whole suite green.
 *
 * It is not cosmetic and it is not the same trade as its two siblings'. The overlay covers the WHOLE
 * plate (`inset:6px`, the scene's own box), and the piece drawn in it stands UP off its floor point,
 * so a pointer-live overlay would eat presses across the compartment for the 1.2 s of every build —
 * on a surface whose entire job is being clicked, and with `#rz-layers`' own `data-tile` tier sitting
 * underneath it. `.rz-ghostlayer` and `.rz-pawnlay` carry the identical rule for the identical
 * reason (roomzoom.css states both), so all three are pinned together: a guard that named only the
 * new one would be satisfied by a lane that deleted the other two.
 *
 * ⚠️ READ FROM THE CASCADE `client/index.html` ACTUALLY LINKS (`styles-source.js`), not from a file
 * path this test picked — a rule in a stylesheet the page never loads is a rule the player never
 * gets. `codeOnly` first, so a commented-out rule cannot satisfy it.
 */
test('⛔⛔ all three canvas overlays are pointer-transparent, in the stylesheet the page loads', () => {
  const css = codeOnly(stylesSource()).replace(/\s+/g, '');
  for (const cls of ['.rz-revealer', '.rz-ghostlayer', '.rz-pawnlay']) {
    const at = css.indexOf(cls + '{');
    assert.ok(at >= 0, `${cls} has no rule at all in the linked cascade`);
    const block = css.slice(at, css.indexOf('}', at));
    assert.ok(block.includes('pointer-events:none'),
      `${cls} is POINTER-LIVE. It covers the whole plate at the scene's own box, so it shadows `
      + '`tileAt`\'s `data-tile` tier and starts answering for clicks on the floor beneath it.');
  }
});

/**
 * ⚠️ THE KEYFRAMES BLOCK WAS GATE-INVISIBLE, AND THIS ONLY PARTLY CLOSES IT — say which part.
 *
 * Deleting `@keyframes rz-rv-draw` leaves every node test green (there is no CSS engine here) and
 * every screenshot correct (the dash is fail-visible by design: with no animation the whole path
 * draws). So the *feature* silently becomes "the piece appears", which is precisely the
 * pre-package behaviour it replaced — the loudest possible failure to look like success.
 *
 * ⛔ WHAT THIS TEST CAN SAY: the block exists in the cascade the page loads, it carries both
 * properties the two classes need, and both classes name it. ⛔ WHAT IT CANNOT: that the animation
 * RUNS. That is measurable only in a browser, and it is measured in two places, both of which FAIL
 * the run rather than warn — `client/tools/draw-reveal-bench.mjs` (mean computed
 * `stroke-dashoffset` must go 1 → fall → 0, else the whole cost table is a measurement of static
 * SVG) and `client/tools/draw-reveal-shot.mjs` (the same, sampled across the live completion).
 * Neither is on `./ci.sh`. That gap is the ledger line, not a claim this test closes it.
 */
test('the draw-in keyframes and both classes survive in the linked cascade (text, not behaviour)', () => {
  const css = codeOnly(stylesSource()).replace(/\s+/g, '');
  const at = css.indexOf('@keyframesrz-rv-draw{');
  assert.ok(at >= 0,
    'the `rz-rv-draw` keyframes block is gone from the stylesheet the page loads. Nothing else in '
    + 'the gate can see this: the dash is fail-visible, so every piece simply APPEARS — the exact '
    + 'behaviour this package replaced, with a green suite and correct-looking screenshots.');
  const block = css.slice(at, css.indexOf('}}', at));
  assert.ok(block.includes('stroke-dashoffset:1') && block.includes('stroke-dashoffset:0'),
    'the keyframes no longer run the dash from end to end — the strokes cannot draw themselves in');
  assert.ok(block.includes('fill-opacity:0') && block.includes('fill-opacity:1'),
    'the keyframes no longer wash the paper faces in');
  for (const cls of ['.rz-rv-ink', '.rz-rv-fill']) {
    const i = css.indexOf(cls + '{');
    assert.ok(i >= 0, `${cls} has no rule — ${cls === '.rz-rv-ink' ? 'no stroke' : 'no face'} animates`);
    assert.ok(css.slice(i, css.indexOf('}', i)).includes('animation-name:rz-rv-draw'),
      `${cls} does not name the keyframes block, so the elements carrying it animate nothing`);
  }
  assert.ok(css.slice(css.indexOf('.rz-rv-ink{'), css.indexOf('}', css.indexOf('.rz-rv-ink{')))
    .includes('stroke-dasharray:1 1'.replace(/\s+/g, '')),
    'the ink class lost `stroke-dasharray: 1 1`, so `pathLength="1"` normalises a dash nothing uses '
    + 'and the strokes are simply drawn');
});

test('CONTROL: the pointer-events scan reads code, and would notice the rule going away', () => {
  // Without this the loop above passes for a scan that matches anything — CLAUDE.md's 4th shape.
  const blinded = codeOnly(stylesSource()).replace(/\s+/g, '')
    .replace('.rz-revealer{position:absolute;inset:6px;width:calc(100%-12px);height:calc(100%-12px);display:block;pointer-events:none}',
      '.rz-revealer{position:absolute;inset:6px}');
  assert.ok(!blinded.includes('.rz-revealer{position:absolute;inset:6px;width'),
    'the blinding edit did not apply — the shipped rule\'s text has moved, so this control asserts '
    + 'nothing and the guard above may be reading a rule that is not there. Re-find it in '
    + 'client/styles/roomzoom.css; do NOT delete this control.');
  const at = blinded.indexOf('.rz-revealer{');
  assert.ok(!blinded.slice(at, blinded.indexOf('}', at)).includes('pointer-events:none'),
    'the scan finds `pointer-events:none` in a block that no longer has it — it is matching some '
    + 'other rule, and the guard above is vacuous');
});

// ═════════════════════════════════════════════════════════════════════ 5. the layer's own contract

test('reveal-layer: one group per tile, and `mount` on a live key does not stack a second', () => {
  const d = new RvDoc();
  const svg = new RvEl(d, 'svg');
  const lay = makeRevealLayer(svg);
  const a = lay.mount('3,4', '<path/>');
  const again = lay.mount('3,4', '<path d="different"/>');
  assert.equal(lay.size(), 1, 'a second mount for one tile stacked a second copy');
  assert.equal(again, a, 'and it should hand back the live node rather than a new one');
  assert.equal(svg.childNodes.length, 1);
  lay.mount('5,6', '<path/>');
  assert.equal(lay.size(), 2);
  assert.equal(lay.unmount('3,4'), true);
  assert.equal(lay.unmount('3,4'), false, 'unmounting twice must be honest about the second time');
  assert.equal(svg.childNodes.length, 1);
  lay.clear();
  assert.equal(lay.size(), 0);
  assert.equal(svg.childNodes.length, 0, 'clear() left nodes in the document');
});

// ═════════════════════════════════════════════════════════════════════ 6. reduced motion — LAST

/**
 * ⭐ `prefers-reduced-motion` ⇒ INSTANT APPEAR, which is the repo's stepwise-fallback precedent
 * exactly: the honest fallback is TODAY'S BEHAVIOUR, not a degraded animation. Nothing is mounted,
 * nothing is suppressed, and the furniture layer draws the finished piece the moment it exists.
 *
 * ⚠️ IT RUNS LAST AND RE-MOUNTS THE SURFACE, and that is stated rather than hidden: `_reduce` is
 * read ONCE at `buildSkeleton` (deliberately — the query must not be asked ten times a second), so
 * the only honest way to drive the other answer in one process is a second mount. It binds a second
 * set of window listeners; nothing after it dispatches an event, and nothing before it is affected.
 *
 * MUTATION: drop the `if (!_reduce)` guard in `syncReveals` ⇒ RED.
 */
test('⭐ reduced motion: the piece is simply THERE — no overlay, no suppression', () => {
  reset();
  REDUCE = true;
  RoomZoom.initRoomZoom({ send: () => {} });
  RoomZoom.enterRoom('hold');
  queue('table', 0);
  const armed = complete();
  assert.equal(overlay().length, 0, 'a draw-in was mounted for a visitor who asked for reduced motion');
  assert.equal(revealClocks(armed).length, 0, 'and an animation clock was armed');
  assert.equal(sceneCopies(), 1,
    'the piece is not drawn AT ALL. Reduced motion must be the pre-package behaviour — the fitting '
    + 'appears the instant the sim says it exists — never a suppressed tile with nothing on it.');
  REDUCE = false;
});
