// ⭐⭐ THE BUILD GHOST — "I want to see it before placing it", driven end to end through the
// shipping controller.
//
// THE OWNER'S SENTENCE (2026-08-05): *"when building a new item, e.g. a table, I want to see it
// before placing it and I want to be able to rotate it (4× rotation)"*. This file is the first half:
// while a build tool is armed, the tile under the pointer carries THE PIECE ITSELF, in the charter's
// UNBUILT dash dialect, before the click. `docs/design/rimworld-reference.md` §12.1 is the analogue
// — *"Placing a blueprint is free and instant (a ghost …)"* — and what is borrowed is the half that
// comes before the blueprint: the armed designator draws the thing under the cursor.
//
// ⛔ EVERY CLAIM HERE IS ASSERTED AGAINST RENDERED MARKUP after a real gesture on the real
// controller — `#rz-ghost`'s own `innerHTML`, read back after a synthetic `mousemove`. A
// state-inspection version ("`_hoverTile` is set") would pass against a ghost that draws nothing,
// which is `invisible-feedback-is-FUNCTIONAL` exactly.
//
// ⚠️ THE VACUITY THIS RIG HAD TO DEFEAT, NAMED FIRST. `paintGhost` opens `if (!_ghost) return;`, and
// every OTHER Room-Zoom rig in this directory builds its document from a HAND-LISTED id array that
// does not contain `rz-ghost` (six of them: room-model, blocked-model, devices-model,
// device-sprite-coverage, palette-honesty, prioritise-menu). On such a rig the ghost silently never
// paints and every assertion phrased as an absence passes for free. So: `RZ_IDS` below carries
// `rz-ghost`, and the FIRST test is an inclusion control that fails loudly if it ever stops doing so.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  deckSlots, roomScene, scenePlacement, paletteCommand, ROOM_TOOLS, ROOM_SCALE, ROOM_HEIGHT_M,
} from '../src/ui/room-model.js';
// The built layer's own floor-swatch size, read from the surface rather than restated here.
import { FLOOR_MAT_PX } from '../src/ui/roomzoom-view.js';
import { ITEMS, buildItem } from '../src/items/index.js';
import { itemIdForGlyphChar } from '../src/items/glyph-map.js';
import { materialItemId } from '../src/ui/build-material-model.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { codeOnly } from './code-only.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), decodeRooms(decode(JSON.stringify(FIX.rooms))));
const wreck = FIX.frameDeck1;
const DECK1 = 1;

function slotFocus(anchor) {
  const s = deckSlots(fixView, DECK1).find((e) => e.anchorName === anchor);
  assert.ok(s, `deck-1 slot ${anchor} is missing from the fixture`);
  return { deck: DECK1, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// The harness — its OWN document and window (see room-model.test.js's rig header: `initRoomZoom`
// binds listeners unconditionally on every call, so two mounts over one bag double-fire).
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** ⭐ `rz-ghost` IS IN THIS LIST AND THE FIRST TEST PINS IT — see the vacuity note in the header. */
const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-ghost', 'rz-pawnlay', 'rz-pulse', 'rz-zonekey', 'rz-toast',
  'rz-nudge', 'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-cost',
  'rz-minimap', 'rz-hint', 'rz-ctx',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];

const TAG_RE = /<(button|span)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

class GhEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; this._scanned = [];
    // ⭐ HOW MANY TIMES THIS NODE'S `innerHTML` HAS BEEN WRITTEN. It is the instrument for the
    // repaint-discipline claim: "hover does not add per-frame innerHTML churn" is a statement about
    // WRITES, and only a counter on the setter can see it. Asserting on the resulting markup cannot
    // — an idempotent rewrite produces identical markup and identical churn.
    this.htmlWrites = 0;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v); this.childNodes = []; this._scanned = []; this.htmlWrites++;
    for (const m of this._html.matchAll(TAG_RE)) {
      const el = new GhEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
        else if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
      }
      el.parentNode = this;
      this._scanned.push(el);
    }
  }
  querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
  querySelectorAll(sel) {
    if (typeof sel !== 'string' || !sel.startsWith('.')) return [];
    const cls = sel.slice(1);
    return this._scanned.filter((e) => e.classList.contains(cls));
  }
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
class GhDoc extends DomDocument {
  constructor() { super(); this.body = new GhEl(this, 'body'); }
  createElement(tag) { return new GhEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const doc = new GhDoc();
for (const id of RZ_IDS) { const e = new GhEl(doc, 'div'); e._id = id; doc.register(id, e); }
globalThis.document = doc;
const winListeners = {};
globalThis.window = { addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); }, removeEventListener() {} };
// rAF is driven SYNCHRONOUSLY here: `scheduleRepaint` coalesces on it, and a test that had to wait
// for a real frame would be a timing test about a repaint rather than a test about a ghost.
// ⚠️ IT MUST RETURN 0, AND THAT IS NOT A DETAIL. `scheduleRepaint` is `if (_raf) return; _raf =
// raf(...)` — with a SYNCHRONOUS raf the callback's own `_raf = 0` runs BEFORE the assignment, so a
// non-zero return leaves the latch permanently closed and every later repaint is silently dropped.
// Measured here: the "a ship frame repaints the stack" leg below went red on its own non-vacuity
// assertion, which is the only reason this was found rather than shipped as a vacuous suite.
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };

const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const HOLD = slotFocus('hold');
const sceneRect = (() => { const vb = roomScene(HOLD).viewBox; return { left: 0, top: 0, width: vb.w, height: vb.h }; })();
/** The client point at a tile's projected floor centre — through the SHIPPED placement object, never
 *  a restatement of it (the rect is the viewBox at 1:1, so `sceneFit` is the identity). */
const atTile = (tx, ty) => {
  const [x, y] = scenePlacement(roomScene(HOLD), HOLD).foot(tx, ty);
  return { clientX: Math.round(x), clientY: Math.round(y) };
};

const sent = [];
const api = RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(wreck);
// ⭐ A LEDGER WITH PARTS IN IT. Without one `partsAboard()` is 0 against the 3-PART price and EVERY
// place tool is permanently refused — which is true of the shipped wreck at boot (that is
// `build-cost-model.js`'s whole subject) and would make the AFFORDABLE ghost untestable. The refusal
// legs in section 4 blank it deliberately, so both states are driven rather than one assumed.
const RICH = { type: 'ledger', matter: [['Parts', 12]] };
const BROKE = { type: 'ledger', matter: [['Parts', 0]] };
Hud.renderLedger(RICH);
api.enter('hold');

const layers = doc.getElementById('rz-layers');
const ghost = doc.getElementById('rz-ghost');
const canvas = doc.getElementById('rz-canvas');
const root = doc.getElementById('roomzoom-view');
const palette = doc.getElementById('rz-palette');
layers._rect = sceneRect;
palette.parentNode = root;

function fire(el, type, extra) {
  const e = {
    type, target: el, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  let n = el;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    n = n.parentNode;
  }
  return e;
}

/** ⭐ AN ORDINARY PRESS ON THE CANVAS — `pointerdown` then `pointerup`, the PAIR the Room Zoom
 *  resolves a single-press gesture on since BUG-B was closed at Level 2 (roomzoom-view.js, the ⛔⛔
 *  block above `_el`). ⛔ `fire(canvas, 'click', …)` no longer reaches ANY handler: the canvas has
 *  no `click` listener at all, because `click` is the event Chrome does not fire when a repaint
 *  lands between down and up — which on this surface is nearly every press (measured 2/30). */
function press(el, extra) {
  fire(el, 'pointerdown', { button: 0, ...extra });
  return fire(el, 'pointerup', { button: 0, ...extra });
}
/** Arm a tool the way a player does — a click on a real `[data-rztool]` chip, through the delegated
 *  handler on the root. Never `arm()` directly: that would test a function, not a surface. */
function armTool(tool) {
  const btn = new GhEl(doc, 'button');
  btn.dataset.rztool = tool;
  btn.setAttribute('data-rztool', tool);
  btn.parentNode = root;
  fire(btn, 'click', {});
}
/** Move the pointer to a tile's floor centre. */
function hover(tx, ty) { fire(canvas, 'mousemove', { button: 0, ...atTile(tx, ty) }); }
/** Move the pointer to a raw client point (for the off-room legs). */
function hoverAt(clientX, clientY) { fire(canvas, 'mousemove', { button: 0, clientX, clientY }); }
function leave() { fire(canvas, 'mouseleave', {}); }
function mouseUp(button = 0) { for (const fn of (winListeners.mouseup || []).slice()) fn({ button }); }

/** The armed slot is authoritative-reset between tests (an assert throws before a trailing disarm). */
afterEach(() => {
  Hud.renderLedger(RICH);
  mouseUp();
  api.exit();
  api.enter('hold');
  layers._rect = sceneRect;
  leave();
});

/** A tile of this room's clear floor — derived, never hand-written, so a recapture moves with it. */
const FLOOR = (() => {
  for (let ty = HOLD.ry + 1; ty < HOLD.ry + HOLD.rh - 1; ty++) {
    for (let tx = HOLD.rx + 1; tx < HOLD.rx + HOLD.rw - 1; tx++) {
      const cell = wreck.cells[ty * wreck.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46) return { x: tx, y: ty };
    }
  }
  assert.fail('the fixture room has no clear floor tile');
  return null;
})();
const FLOOR2 = (() => {
  for (let ty = HOLD.ry + 1; ty < HOLD.ry + HOLD.rh - 1; ty++) {
    for (let tx = HOLD.rx + 1; tx < HOLD.rx + HOLD.rw - 1; tx++) {
      const cell = wreck.cells[ty * wreck.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46 && (tx !== FLOOR.x || ty !== FLOOR.y)) return { x: tx, y: ty };
    }
  }
  assert.fail('the fixture room has only one clear floor tile');
  return null;
})();

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 0. THE RIG ITSELF — the inclusion control that keeps everything below from passing vacuously
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the rig HOSTS the ghost root, and an armed hover really writes into it', () => {
  assert.ok(RZ_IDS.includes('rz-ghost'),
    'rz-ghost must be in RZ_IDS — without it `_ghost` is null, paintGhost returns at line 1, and '
    + 'every assertion in this file passes against a ghost that draws nothing');
  assert.equal(ghost.innerHTML, '', 'nothing armed, nothing hovered ⇒ no ghost');
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  assert.ok(ghost.innerHTML.length > 0, 'an armed hover writes markup into #rz-ghost');
  assert.match(ghost.innerHTML, /class="rz-buildghost/);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE GHOST IS THE PIECE, AT THE TILE THE CLICK WOULD USE
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("the owner's own example: TABLE armed, hover a tile ⇒ the table stands on THAT tile", () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  const html = ghost.innerHTML;
  assert.match(html, new RegExp('data-ghost-tile="' + FLOOR.x + ',' + FLOOR.y + '"'),
    'the ghost names the tile it was drawn for');
  assert.match(html, /data-ghost-tool="table"/);
  // …and it is the REAL piece, not a placeholder box: the `dining-table` builder's own def prefix
  // reaches the markup, which only happens if `standItem` drew it.
  assert.ok(html.includes('rz-gh-table'), 'the fitting builder ran with the ghost id prefix');
  assert.ok(html.length > 400, 'a real three-face fitting, not a stub: ' + html.length + ' chars');
});

test('the ghost MOVES with the pointer — three tiles, three positions, one at a time', () => {
  armTool('bunk');
  const seen = [];
  for (const t of [FLOOR, FLOOR2, FLOOR]) {
    hover(t.x, t.y);
    const m = /data-ghost-tile="(-?\d+,-?\d+)"/.exec(ghost.innerHTML);
    assert.ok(m, 'the ghost is present at every hovered tile');
    seen.push(m[1]);
    // Exactly ONE ghost is ever on screen — a preview that accumulated would draw the player's whole
    // pointer path as furniture.
    assert.equal((ghost.innerHTML.match(/class="rz-buildghost/g) || []).length, 1);
  }
  assert.deepEqual(seen, [FLOOR.x + ',' + FLOOR.y, FLOOR2.x + ',' + FLOOR2.y, FLOOR.x + ',' + FLOOR.y]);
});

test('THE RESOLUTION IS THE CLICK\'S OWN — the ghost tile and the placed tile are the same tile', () => {
  // ⭐⭐ THE PACKAGE'S CENTRAL CLAIM, and it is driven rather than argued: the same pointer position
  // is fed to `mousemove` and to `click`, and the tile the GHOST names is compared to the tile the
  // WIRE COMMAND carries. Any second resolution path — a re-derived inverse, a rounded scene point,
  // a cached rect — shows up here as two different tiles from one point.
  armTool('table');
  const pt = atTile(FLOOR2.x, FLOOR2.y);
  hoverAt(pt.clientX, pt.clientY);
  const shown = /data-ghost-tile="(-?\d+),(-?\d+)"/.exec(ghost.innerHTML);
  assert.ok(shown, 'the ghost drew somewhere');
  sent.length = 0;
  press(canvas, { button: 0, ...pt });
  const place = sent.find((o) => o.cmd === 'place');
  assert.ok(place, 'the click lowered a place command');
  assert.equal(Number(shown[1]), place.x, 'the ghost previewed the tile the order went to (x)');
  assert.equal(Number(shown[2]), place.y, 'the ghost previewed the tile the order went to (y)');
});

test('every tool that PLACES A THING previews one; the tile verbs preview none', () => {
  // Derived from the shipped table, not a hand list — a tool added to `ROOM_TOOLS` joins whichever
  // side of this its own `cls` puts it on, and the count below moves in the same commit.
  const drew = [], silent = [];
  for (const tool of ROOM_TOOLS) {
    armTool(tool);
    hover(FLOOR.x, FLOOR.y);
    (ghost.innerHTML.includes('rz-buildghost') ? drew : silent).push(tool);
    armTool(tool);   // disarm
    leave();
  }
  const places = ROOM_TOOLS.filter((t) => ['structural', 'functional', 'cosmetic'].includes(paletteCommand(t).cls));
  const verbs = ROOM_TOOLS.filter((t) => ['order', 'erase', 'move', 'demolish'].includes(paletteCommand(t).cls));
  assert.deepEqual(drew, places, 'every wall/floor/door, every furniture tool and both decor tools preview');
  assert.deepEqual(silent, verbs,
    'DIG/STOCKPILE/STRIP/ERASE/MOVE/DEMOLISH place no THING — they are functions of what is already '
    + 'on the tile, so there is nothing to preview');
  assert.ok(drew.length >= 15 && verbs.length === 6, 'non-vacuity: ' + drew.length + ' / ' + verbs.length);
});

test('⭐⭐ WALL and FLOOR ghosts DRAW THE SWATCH THE BUILT LAYER DRAWS — same art, same placement', () => {
  // ⛔⛔ THE INSTRUMENT THIS REPLACES BROKE ON A MERGE WITHOUT THE FEATURE BREAKING (review, M1).
  // It asserted `html.includes('rz-gh-wall-mat')` — a string search for an idPrefix-bearing `<defs>`
  // id — and main's paper materials stopped emitting a `<pattern>` at all. The swatch was still
  // drawn; the GUARD was reading a byte the art no longer had to produce. A test that goes red when
  // the art is restyled and green when the placement is wrong is worse than no test.
  //
  // ⇒ THE CLAIM IS NOW EQUALITY WITH THE BUILT LAYER'S OWN OUTPUT, which is the thing that actually
  // has to hold: `materialLayerSvg` puts a wall's skin on the slab's FRONT FACE (`px, py − faceH`,
  // faceW × faceH) and a floor's IN THE FLOOR PLANE (`place.cell`, `FLOOR_MAT_PX`). The ghost must
  // spend the same two expressions or one material draws two ways at two centimetres.
  const scene = roomScene(HOLD);
  const unit = scene.s * 100;
  const place = scenePlacement(scene, HOLD, unit);
  const cm = 100;
  const faceW = ROOM_SCALE * cm;
  const faceH = ROOM_SCALE * ROOM_HEIGHT_M * 100;
  const [px, py] = place.front(FLOOR.x, FLOOR.y);

  armTool('wall');
  hover(FLOOR.x, FLOOR.y);
  const wallHtml = ghost.innerHTML;
  const wantWall = '<g transform="translate(' + px.toFixed(2) + ' ' + (py - faceH).toFixed(2) + ')">'
    + buildItem(materialItemId('wall', 0), { w: faceW, h: faceH, idPrefix: 'rz-gh-wall-mat' }) + '</g>';
  assert.ok(wantWall.length > 120, 'non-vacuity: the built wall skin is real markup, not an empty g');
  assert.ok(wallHtml.includes(wantWall),
    'the WALL ghost does not draw the built wall\'s own front-face skin. The preview and the thing '
    + 'it previews would show one material two ways.');

  armTool('wall');            // disarm
  armTool('floor');
  hover(FLOOR.x, FLOOR.y);
  const wantFloor = '<g transform="' + place.cell(FLOOR.x, FLOOR.y) + '">'
    + buildItem(materialItemId('floor', 0), { w: FLOOR_MAT_PX, h: FLOOR_MAT_PX, idPrefix: 'rz-gh-floor-mat' }) + '</g>';
  assert.ok(wantFloor.length > 120, 'non-vacuity: the built floor skin is real markup');
  assert.ok(ghost.innerHTML.includes(wantFloor),
    'the FLOOR ghost does not lie in the floor plane the way a built floor material does — it was '
    + 'drawing an upright square, which never matched the built idiom even before the merge');

  // …and a NEGATIVE CONTROL for both: the OLD 62-px floated-square idiom must not survive anywhere.
  const oldIdiom = ROOM_SCALE * 62;
  assert.ok(!ghost.innerHTML.includes('w: ' + oldIdiom) && !ghost.innerHTML.includes(oldIdiom.toFixed(2) + '"'),
    'the superseded 62-px swatch idiom is still being emitted somewhere');
});

test('the swatch FOLLOWS THE PICKER — the signature guard carries the material term', () => {
  armTool('wall');
  hover(FLOOR.x, FLOOR.y);
  const first = ghost.innerHTML;
  const chip = new GhEl(doc, 'button');
  chip.dataset.rzmat = '2';
  chip.setAttribute('data-rzmat', '2');
  chip.parentNode = root;
  fire(chip, 'click', {});
  assert.notEqual(ghost.innerHTML, first,
    'a material change must re-draw the ghost — the signature guard has to carry the material term');
  // NON-VACUITY: the two materials really are different art, so the inequality above means something.
  assert.notEqual(buildItem(materialItemId('wall', 2), { w: 40, h: 40, idPrefix: 'x' }),
    buildItem(materialItemId('wall', 0), { w: 40, h: 40, idPrefix: 'x' }));
});

test('DOOR is structural but owns no picker — its ghost invents no material', () => {
  armTool('door');
  hover(FLOOR.x, FLOOR.y);
  assert.ok(ghost.innerHTML.includes('rz-buildghost'), 'the door ghost is drawn');
  assert.ok(!ghost.innerHTML.includes('-mat'),
    'the DOOR ghost drew a material swatch. `toolHasMaterial` is wall/floor; answering for a tool '
    + 'that has no picker is this surface inventing a fact about the tool.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE DIALECT — unbuilt ink dash, reduced opacity, NO oxblood
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the ghost wears the charter\'s UNBUILT dialect: ink dashed 6 5, dimmed, and never oxblood', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  const html = ghost.innerHTML;
  assert.match(html, /stroke-dasharray="6 5"/, 'the charter\'s UNBUILT/PLANNED dash (ruling E3)');
  assert.match(html, /opacity="0\.55"/, 'reduced opacity — this is not built yet');
  assert.ok(!html.includes('#7B2C22'),
    'NO OXBLOOD: the one accent is spent on a QUEUED order (ghostSvg) and a REFUSED one '
    + '(blockedLayerSvg). A preview of a click nobody has made is not an alert.');
});

test('the ghost is NOT a press target — neither the layer nor the group takes pointer events', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  assert.match(ghost.innerHTML, /pointer-events="none"/);
  // …and the ghost group carries NO `data-tile`, so it can never win `tileAt`'s first tier. Its own
  // `data-ghost-tile` is a DIFFERENT attribute on purpose — read by tests and rigs, invisible to
  // `closest('[data-tile]')`.
  assert.ok(!/\bdata-tile=/.test(ghost.innerHTML),
    'a `data-tile` on the ghost would make the preview answer for the click it is previewing');
});

test('the ghost root is a SIBLING of the layer stack, at the same box, with the same viewBox', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  // Same viewBox + same fit ⇒ one scene coordinate is one screen point in both roots. Without this
  // the ghost would be drawn correctly in its own space and land on the wrong tile on screen.
  assert.equal(ghost.getAttribute('viewBox'), layers.getAttribute('viewBox'));
  assert.equal(ghost.getAttribute('preserveAspectRatio'), layers.getAttribute('preserveAspectRatio'));
  assert.ok(ghost.getAttribute('viewBox'), 'non-vacuity: the viewBox is actually set');
  // Its hatch is its OWN namespace — two roots emitting `id="rz-fh"` is a duplicate id in one
  // document, and the failure is silent (a face resolves against the wrong pattern, or none).
  assert.match(ghost.innerHTML, /id="rzg-fh"/);
  assert.ok(!ghost.innerHTML.includes('id="rz-fh"'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. WHEN THE GHOST MUST NOT BE THERE
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('nothing armed ⇒ no ghost, however much the pointer moves', () => {
  hover(FLOOR.x, FLOOR.y);
  hover(FLOOR2.x, FLOOR2.y);
  assert.equal(ghost.innerHTML, '');
});

test('DISARMING takes the ghost away without the pointer moving', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  assert.ok(ghost.innerHTML.includes('rz-buildghost'));
  armTool('table');                       // toggle off — the player clicks the armed chip again
  assert.equal(ghost.innerHTML, '', 'the ghost follows the ARMED SLOT, not only the pointer');
});

test('SWAPPING the armed tool swaps the piece, without the pointer moving', () => {
  armTool('bunk');
  hover(FLOOR.x, FLOOR.y);
  const bunk = ghost.innerHTML;
  armTool('table');
  const table = ghost.innerHTML;
  assert.match(table, /data-ghost-tool="table"/);
  assert.notEqual(table, bunk);
  assert.match(table, new RegExp('data-ghost-tile="' + FLOOR.x + ',' + FLOOR.y + '"'),
    'and it stays on the tile the pointer is still over');
});

test('OFF THE ROOM ⇒ no ghost (the letterbox margin resolves to no tile)', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  assert.ok(ghost.innerHTML.includes('rz-buildghost'));
  hoverAt(-500, -500);                    // far outside the scene — `tileFromCanvasXY` answers null
  assert.equal(ghost.innerHTML, '',
    'a preview that hung on the last legal tile would lie about where the click lands');
});

test('THE POINTER LEAVING THE CANVAS takes the ghost with it', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  assert.ok(ghost.innerHTML.includes('rz-buildghost'));
  leave();
  assert.equal(ghost.innerHTML, '');
});

test('LEAVING THE ROOM takes the ghost with it — it is drawn in the OLD scene\'s coordinates', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  assert.ok(ghost.innerHTML.includes('rz-buildghost'));
  api.exit();
  assert.equal(ghost.innerHTML, '');
  api.enter('hold');
  layers._rect = sceneRect;
});

test('A SWEEP IN PROGRESS owns the screen — the drag preview draws the anchor, the ghost stands down', () => {
  armTool('wall');
  hover(FLOOR.x, FLOOR.y);
  assert.ok(ghost.innerHTML.includes('rz-buildghost'), 'hovering a sweep tool DOES ghost the anchor');
  fire(canvas, 'mousedown', { button: 0, ...atTile(FLOOR.x, FLOOR.y) });
  hover(FLOOR2.x, FLOOR2.y);
  assert.equal(ghost.innerHTML, '',
    'previewSvg is already drawing every tile the release would designate, the anchor included');
  mouseUp();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE REFUSAL STATE — it shows the piece struck through rather than lying about it
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('a tool the ship CANNOT PAY FOR still previews — dimmer, and struck through', () => {
  // DRIVEN through the real channel: 0 Parts against a 3-PART price is `placeIsUnaffordable`, the
  // same predicate that puts `.cant` on the chip. This is the shipped wreck's own boot state.
  Hud.renderLedger(BROKE);
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  const html = ghost.innerHTML;
  assert.match(html, /class="rz-buildghost refused"/, 'the state is on the group, readable by a rig');
  assert.match(html, /opacity="0\.3"/, 'dimmer than the affordable ghost');
  assert.match(html, /stroke-dasharray="1 3"/, 'the strike, in this surface\'s own dotted dialect');
  assert.ok(!html.includes('#7B2C22'), 'and STILL no oxblood — the refusal sentence is the toast\'s job');
  assert.ok(html.includes('rz-gh-table'), 'and it is still the REAL piece, not a substitute');
});

test('a DECOR tool (not in the sim at all) previews in the refusal state', () => {
  armTool('rug');
  hover(FLOOR.x, FLOOR.y);
  assert.match(ghost.innerHTML, /class="rz-buildghost refused"/);
  assert.match(ghost.innerHTML, /data-ghost-tool="rug"/);
});

test('the refusal is the PALETTE\'s answer, reused — not a client-side tile-legality invention', () => {
  // A ghost that decided for itself which SQUARES are legal would put a preview saying NO in front
  // of a command the sim would have accepted (the client never gates the send — `onCanvasClick`).
  // The only refusals it may state are the two the palette already proves: cannot pay, not wired.
  // ⛔ COMMENT-STRIPPED WITH THE SHARED `codeOnly` (CLAUDE.md trap 1: a raw-text guard is satisfied
  // by commented-out code — a tile predicate sitting behind `//` would pass the negative below while
  // being one keystroke from live), and with a NEGATIVE CONTROL, because a scan that finds nothing
  // and a scan that CANNOT find anything read identically.
  const src = codeOnly(readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8'));
  const body = /function ghostRefused\(tool\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(body, 'ghostRefused exists');
  assert.match(body[1], /isDecorTool\(tool\)/);
  assert.match(body[1], /placeIsUnaffordable\(tool, partsAboard\(\)\)/);
  const TILE_PREDICATE = /Walkable|getFlags|cells\[/;
  assert.ok(!TILE_PREDICATE.test(body[1]),
    'it must not grow a tile predicate — the sim is the only authority on which square is legal');
  // NEGATIVE CONTROL: the same predicate, applied to a body that DOES contain the forbidden shape,
  // must fire. Without this, a rotted regex (a renamed function, a changed brace style) would make
  // the assertion above vacuously true forever.
  assert.ok(TILE_PREDICATE.test('  return world.getFlags(t) & Walkable;'),
    'the tile-predicate detector cannot detect a tile predicate — this guard is inspecting nothing');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. REPAINT DISCIPLINE — the reason the ghost has its own root
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐⭐ HOVER NEVER TOUCHES THE LAYER STACK — 40 moves, zero `_layers.innerHTML` writes', () => {
  // ⛔ THE MEASUREMENT THE PACKAGE RESTS ON. `_layers.innerHTML =` rebuilds the whole scene — the
  // cutaway, every fitting, every pawn — and it is what tore down the palette button under the
  // pointer before the chrome was keyed (this file's sibling records that at length). A ghost routed
  // through it would rebuild the world once per mousemove.
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  const layersBefore = layers.htmlWrites;
  const ghostBefore = ghost.htmlWrites;
  const pt = atTile(FLOOR.x, FLOOR.y);
  for (let i = 0; i < 40; i++) hoverAt(pt.clientX + (i % 3) - 1, pt.clientY + (i % 3) - 1);
  assert.equal(layers.htmlWrites, layersBefore, 'the layer stack is not rebuilt by hovering');
  assert.equal(ghost.htmlWrites, ghostBefore,
    '…and 40 moves INSIDE ONE TILE write the ghost zero times — the signature guard, not a timer');
});

test('crossing a tile boundary writes the ghost EXACTLY once, and still not the stack', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  const layersBefore = layers.htmlWrites;
  const ghostBefore = ghost.htmlWrites;
  hover(FLOOR2.x, FLOOR2.y);
  assert.equal(ghost.htmlWrites, ghostBefore + 1);
  assert.equal(layers.htmlWrites, layersBefore);
});

test('a SHIP FRAME repaints the stack and leaves the ghost alone', () => {
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  const layersBefore = layers.htmlWrites;
  const ghostBefore = ghost.htmlWrites;
  Hud.renderFrame(wreck);                 // the real wire path — onShipUpdate → scheduleRepaint
  assert.ok(layers.htmlWrites > layersBefore, 'non-vacuity: a frame really did repaint the stack');
  assert.equal(ghost.htmlWrites, ghostBefore,
    'the ghost is unchanged by a frame that changes nothing about it — the guard is the signature');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE ART DERIVATION — one fact chooses the ghost and the piece that follows it
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('a functional tool\'s ghost art is DERIVED from the registry\'s own deviceKind column', () => {
  // Not a hand table: the palette row's `deviceKind` is matched against `ITEMS`' `deviceKind`, so the
  // ghost and the placed piece are chosen by ONE fact. `lamp` is the documented exception and is
  // asserted as such rather than skipped.
  const byKind = new Map();
  for (const id of Object.keys(ITEMS)) {
    const e = ITEMS[id];
    if (e && e.kind === 'functional' && e.deviceKind && !byKind.has(e.deviceKind)) byKind.set(e.deviceKind, id);
  }
  let derived = 0;
  for (const tool of ROOM_TOOLS) {
    const pc = paletteCommand(tool);
    if (pc.cls !== 'functional') continue;
    if (tool === 'lamp') {
      assert.equal(pc.itemId, 'wall-lamp',
        'LAMP states its art because DeviceKind.Light has no functional ITEMS row — see the '
        + 'PALETTE_CMD comment. If a real luminaire lands, delete the field and this branch.');
      assert.ok(!byKind.has('Light'), 'the hole this exception exists for is still open');
      continue;
    }
    assert.ok(!pc.itemId, tool + ' must DERIVE its art, not state it');
    assert.ok(byKind.has(pc.deviceKind), tool + ' → ' + pc.deviceKind + ' has no registry row');
    derived++;
  }
  assert.ok(derived >= 9, 'non-vacuity: ' + derived + ' tools derived');
});

test('⭐⭐ THE GHOST\'S ART AND THE PLACED PIECE\'S ART ARE CHOSEN BY TWO ROUTES THAT MUST AGREE', () => {
  // ⛔ THE ASYMMETRY, NAMED (review MINOR 5). The GHOST resolves art by scanning `ITEMS` for a row
  // whose `deviceKind` matches the palette row (`ghostArtId`). The PLACED piece resolves it from the
  // frame's GLYPH BYTE (`roomCells` → `itemForGlyph` → `GLYPH_TO_ITEM`, which is derived from the
  // registry's `glyph` column plus `GLYPH_SUBSTITUTE`). Two different columns of the same table, and
  // NOTHING required them to answer the same id — so a registry row could grow a glyph that resolves
  // elsewhere and the player would preview one piece and get another, silently.
  //
  // They agree on all ten placeable tools today. This pins the agreement per PALETTE_CMD row, which
  // is the cheap version: it needs no new table and it fails by naming the tool that split.
  const glyphOfKind = new Map();          // deviceKind → the glyph char its registry row carries
  for (const id of Object.keys(ITEMS)) {
    const e = ITEMS[id];
    if (e && e.kind === 'functional' && e.deviceKind && typeof e.glyph === 'string') glyphOfKind.set(e.deviceKind, e.glyph);
  }
  let checked = 0;
  for (const tool of ROOM_TOOLS) {
    const pc = paletteCommand(tool);
    if (pc.cls !== 'functional') continue;
    const ghostId = RoomZoom.ghostArtId(tool);
    assert.ok(ghostId, tool + ': the ghost resolves no art at all');
    const glyph = glyphOfKind.get(pc.deviceKind);
    if (!glyph) {
      // LAMP: DeviceKind.Light has no functional registry row, so there IS no glyph column to
      // compare against — the documented exception, asserted as such rather than skipped silently.
      assert.equal(tool, 'lamp', tool + ' has no registry glyph for ' + pc.deviceKind);
      continue;
    }
    const placedId = itemIdForGlyphChar(glyph);
    assert.equal(ghostId, placedId,
      tool + ': the GHOST previews `' + ghostId + '` but a placed one draws `' + placedId + '`. The '
      + 'deviceKind scan and the glyph route have split — the player sees one piece and gets another.');
    checked++;
  }
  assert.ok(checked >= 8, 'non-vacuity: only ' + checked + ' tools compared');
});

test('the ghost is the SAME BUILDER the placed piece uses — one drawing, restyled', () => {
  // ⭐ THE ANTI-SECOND-DRAWING PIN. `standItem` is what `furnitureSvg` places a BUILT piece with. If
  // the ghost ever grew its own path list, the two would drift exactly the way the Overview and the
  // Room Zoom once skinned one glyph two ways — and no visual assertion could see it.
  const src = readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8');
  const fn = /function ghostPieceSvg\([\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'ghostPieceSvg exists');
  assert.match(fn[0], /standItem\(itemId, tile\.x, tile\.y, place, idp, undefined, _facing\)/,
    'the THING branch calls the shipped placement builder');
  // …and the proof it actually RAN: the built piece and the ghost, drawn for the same tile, share
  // the same geometry. Compare the ghost's paths to a `standItem` call made here directly.
  const scene = roomScene(HOLD);
  const place = scenePlacement(scene, HOLD, scene.s * 100);
  const built = RoomZoom.standItem('dining-table', FLOOR.x, FLOOR.y, place, 'probe', undefined, 0);
  const geo = (s) => (s.match(/ d="M[^"]{12,}"/g) || []).map((d) => d.replace(/^ d="|"$/g, ''));
  armTool('table');
  hover(FLOOR.x, FLOOR.y);
  const ghostGeo = geo(ghost.innerHTML);
  const builtGeo = geo(built);
  assert.ok(builtGeo.length > 3, 'non-vacuity: the built piece has real geometry');
  for (const d of builtGeo) {
    assert.ok(ghostGeo.includes(d),
      'every path of the built piece appears, byte-identical, in the ghost — the ghost IS the piece');
  }
});
