// Typing isolation (playtest finding): keys typed into the dialogue say box or the
// MOSS terminal textarea must never trigger game shortcuts — and must not be
// preventDefault'ed away from the field. The guard is the pure, duck-typed
// isTextEntryTarget; the window keydown handler bails (except Escape) when it's true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isTextEntryTarget } from '../src/input/controls.js';
import { codeOnly, callBlocks } from './code-only.js';

const here = dirname(fileURLToPath(import.meta.url));

test('text-entry elements are recognized', () => {
  assert.equal(isTextEntryTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('game surfaces are not text entry', () => {
  assert.equal(isTextEntryTarget({ tagName: 'CANVAS' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'DIV' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(isTextEntryTarget(null), false);
  assert.equal(isTextEntryTarget(undefined), false);
  assert.equal(isTextEntryTarget({}), false);
});

// ---- click assist (playtest finding: walking crew are hard to hit) ----
// crewTileNear snaps a canvas-pixel click to the nearest crew member's CURRENT tile when the
// click lands within ~0.7 tile of either slide endpoint (current tile, or the tile a walker is
// sliding from); a click near no one returns null (plain tile click).

import { crewTileNear } from '../src/input/controls.js';

// identity-ish camera: tile 26, zoom 1, centered so tile (x,y) draws at x*26,y*26.
const cam = { x: 0, y: 0, z: 1, viewW: 520, viewH: 520, tile: 26 };

test('a click on a standing pawn snaps to its tile even from a neighbouring tile edge', () => {
  const f = { crew: [[4, 4, 0, 7]] };
  // tile (4,4) center; click 12px off into tile (5,4) territory still snaps
  const cx = (4.5) * 26 + 260, cy = (4.5) * 26 + 260;
  assert.deepEqual(crewTileNear(f, null, cam, cx + 14, cy), { x: 4, y: 4 });
  assert.equal(crewTileNear(f, null, cam, cx + 60, cy), null, 'far away → no snap');
});

test('a mid-slide walker is clickable at BOTH endpoints and snaps to the current tile', () => {
  const f = { crew: [[6, 4, 0, 7]] };
  const motion = { '6,4': { walking: true, fromX: 5, fromY: 4 } };
  const fromCx = (5.5) * 26 + 260, cy = (4.5) * 26 + 260;
  assert.deepEqual(crewTileNear(f, motion, cam, fromCx, cy), { x: 6, y: 4 },
    'clicking the visually-lagging body selects the crew (current tile)');
  const curCx = (6.5) * 26 + 260;
  assert.deepEqual(crewTileNear(f, motion, cam, curCx, cy), { x: 6, y: 4 });
});

test('nearest crew wins; empty/absent crew lists never snap', () => {
  const f = { crew: [[2, 2, 0, 1], [4, 2, 0, 2]] };
  const cy = (2.5) * 26 + 260;
  const nearSecond = (4.2) * 26 + 260;
  assert.deepEqual(crewTileNear(f, null, cam, nearSecond, cy), { x: 4, y: 2 });
  assert.equal(crewTileNear({ crew: [] }, null, cam, 100, 100), null);
  assert.equal(crewTileNear(null, null, cam, 100, 100), null);
  assert.equal(crewTileNear({}, null, cam, 100, 100), null);
});

// ---------------- armed palette tool → wire orders (E0-3 / E0-5 / E0-4 WP-5) ----------------
// The mouse-click and Enter-key paths both lower an armed tool through paletteOrders, so this is
// the single point where "which verbs does this tool send" is decided — and therefore the single
// point worth pinning. Routing an order tool through Cmd.build would hand a designation to
// BuildSystem, which has no idea what one is: a silent no-op the player would read as a dead UI.
//
// Since E0-4 WP-5 the seam returns a LIST, because painting a filtered stockpile means two wire
// messages. The alternative — one payload from the seam plus an inlined second `session.send` at
// the mouse-up site — is exactly the drift this function was written to prevent, and T5/T6 below
// exist to make it impossible to reintroduce quietly.

import { paletteOrders, installInput } from '../src/input/controls.js';
import { ACCEPT_ALL } from '../src/ui/stock-filter-model.js';
import { transform } from '../src/render/camera.js';

test('paletteOrders: build kinds lower to exactly ONE Cmd.build at the clicked tile', () => {
  assert.deepEqual(paletteOrders('wall', 4, 9), [{ cmd: 'build', kind: 'wall', x: 4, y: 9, material: 0 }]);
  assert.deepEqual(paletteOrders('door', 0, 0), [{ cmd: 'build', kind: 'door', x: 0, y: 0, material: 0 }]);
  assert.deepEqual(paletteOrders('cancel', 7, 2), [{ cmd: 'build', kind: 'cancel', x: 7, y: 2, material: 0 }]);
});

// MUTATION: append a `Cmd.filter(x, y, ACCEPT_ALL)` to the 'dig' branch ⇒ length 2 ⇒ fails. Only
// the stockpile tool carries a filter; a dig or strip order that also wrote a zone filter would
// leave accept-all entries on tiles that are not stockpiles at all, folded into the ZONE hash.
test('paletteOrders: dig and strip still lower to exactly ONE order of their OWN verb', () => {
  assert.deepEqual(paletteOrders('dig', 58, 7), [{ cmd: 'dig', x: 58, y: 7, on: 1 }]);
  assert.deepEqual(paletteOrders('strip', 3, 4), [{ cmd: 'strip', x: 3, y: 4, on: 1 }]); // E0-5
  // A palette click always MARKS; clearing is the CANCEL tool's job, not a hidden toggle. If this
  // ever became a toggle, a sweep across mixed tiles would flip some on and some off.
  assert.equal(paletteOrders('dig', 1, 1)[0].on, 1);
  assert.notEqual(paletteOrders('dig', 1, 1)[0].cmd, 'build');
});

// MUTATION: swap the two array elements ⇒ deepEqual fails. Both messages land in the same command
// drain before any system runs, so the intermediate state is unobservable TODAY — but
// DesignateStockpileCommand's OFF path clears the filter, so the reverse order breaks the moment an
// OFF path is added here. Pinning the order now costs nothing and closes that door.
test('paletteOrders: a stockpile paint sends presence THEN the complete filter', () => {
  assert.deepEqual(paletteOrders('stockpile', 12, 5, 0b0001000), [
    { cmd: 'stockpile', x: 12, y: 5, on: 1 },
    { cmd: 'filter', x: 12, y: 5, mask: 8 },
  ]);
  // Accept-nothing is a real mask, not a falsy omission.
  assert.deepEqual(paletteOrders('stockpile', 1, 1, 0)[1], { cmd: 'filter', x: 1, y: 1, mask: 0 });
});

// MUTATION: `if (!Number.isFinite(mask)) return [Cmd.stockpile(x, y, true)];` — i.e. "say nothing
// when there is no filter" ⇒ length 1 ⇒ fails. This is THE staleness bug: an absent registry entry
// means accept-all, but a tile that already carries a restrictive entry KEEPS it, so a player who
// restricted a zone to FOOD, set the palette back to all-on and repainted those tiles would be
// looking at a zone that still refuses everything but food — with no tint, badge or readout
// anywhere that could tell them. Every repaint must re-assert the whole truth.
test('paletteOrders: a mask-less stockpile paint still asserts ACCEPT-ALL, never silence', () => {
  const orders = paletteOrders('stockpile', 1, 1);
  assert.equal(orders.length, 2);
  assert.equal(orders[1].mask, ACCEPT_ALL);
  assert.equal(paletteOrders('stockpile', 1, 1, NaN)[1].mask, ACCEPT_ALL);
  assert.equal(paletteOrders('stockpile', 1, 1, 'nonsense')[1].mask, ACCEPT_ALL);
});

test('paletteOrders: MOVE and an empty slot own no tile order (their branches handle them)', () => {
  for (const t of ['move', null, undefined, '', 'nonsense', 'bunk']) {
    assert.deepEqual(paletteOrders(t, 3, 3), [], String(t) + ' must not lower to a tile order');
  }
});

// ---------------- click / Enter parity, driven through installInput ----------------
// The behavioural form of the claim above. A fake DOM of exactly the surface controls.js touches
// (the same "smallest DOM the module actually uses" discipline as client/test/dom-lite.js) —
// node has EventTarget and AbortSignal built in, which is all installInput's listener wiring needs.

/** The pixel centre of tile (tx,ty) for a camera, through the SAME transform the renderer uses. */
function tileCentrePx(camera, tx, ty) {
  const { ox, oy } = transform(camera);
  const p = Math.max(1, Math.round(camera.tile * camera.z));
  return { px: ox + tx * p + p / 2, py: oy + ty * p + p / 2 };
}

function fakeCanvas(w, h) {
  const el = new EventTarget();
  el.width = w; el.height = h;
  el.parentElement = { classList: { add() {}, remove() {} } };
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h });
  return el;
}

function evt(type, props) { return Object.assign(new Event(type), props); }

// MUTATION: inline `session.send(Cmd.filter(t.x, t.y, getStockFilter()))` in the mouse-up branch
// only (the precise defect the seam exists to forbid) ⇒ the mouse recording has 3 messages and the
// Enter recording has 2 ⇒ the deepEqual between them fails.
test('click and Enter emit the IDENTICAL order sequence for the same tile', () => {
  const camera = { x: 0, y: 0, z: 1, viewW: 520, viewH: 520, tile: 26 };
  const canvas = fakeCanvas(520, 520);
  const frame = { w: 64, h: 32, crew: [] };
  const sent = [];
  const session = { send: (o) => sent.push(o) };
  globalThis.window = new EventTarget();

  const dispose = installInput({
    canvas, camera, session,
    getFrame: () => frame,
    draw() {}, toggleSprites() {},
    getArmedTool: () => 'stockpile',
    getStockFilter: () => 0b0001000,
  });
  try {
    // The inspection cursor starts at (32,10) — click the same tile so the two paths are comparable.
    const { px, py } = tileCentrePx(camera, 32, 10);
    canvas.dispatchEvent(evt('mousedown', { button: 0, clientX: px, clientY: py }));
    globalThis.window.dispatchEvent(evt('mouseup', { button: 0, clientX: px, clientY: py, shiftKey: false }));
    const byMouse = sent.splice(0);

    globalThis.window.dispatchEvent(evt('keydown', { key: 'Enter' }));
    const byEnter = sent.splice(0);

    assert.deepEqual(byMouse, [
      { cmd: 'stockpile', x: 32, y: 10, on: 1 },
      { cmd: 'filter', x: 32, y: 10, mask: 8 },
    ], 'a mouse paint sends presence then the whole filter');
    assert.deepEqual(byEnter, byMouse, 'the keyboard path sends byte-identical orders');
  } finally {
    dispose();
    delete globalThis.window;
  }
});

// MUTATION A: add a second `Cmd.filter(` at one of the call sites ⇒ the controls.js count is 2 ⇒
// fails. MUTATION B: pass `getStockFilter` to only the first installInput block in main.js, leaving
// the WebGL2→Canvas2D fallback bare — the easy real-world miss, which would silently paint every
// zone accept-all after a context loss, on a client that shows no filter anywhere ⇒ the two main.js
// counts differ ⇒ fails.
//
// Declared honestly as a STRUCTURAL guard, not a behavioural one: it reads source text. The
// behavioural claim is the parity test above; this one catches the second install site, which no
// single-canvas behavioural test can reach.
test('the filter order is constructed ONLY in the palette seam, and BOTH inputs are wired', () => {
  const src = (rel) => readFileSync(join(here, rel), 'utf8');
  // CODE ONLY, everywhere below (CLAUDE.md trap 1). These two files carry long explanatory comments
  // that NAME both tokens counted here — `Cmd.filter` and `paletteOrders` — so a raw count is one
  // edited comment away from a wrong number, and the assertion would then read as a real finding.
  // Measured at the switch: every count below is unchanged (1 / 2 / 2 / 3), so this strictly
  // strengthens and moves nothing.
  const controls = codeOnly(src('../src/input/controls.js'));
  const main = src('../src/main.js');
  const count = (s, needle) => s.split(needle).length - 1;

  assert.equal(count(controls, 'Cmd.filter('), 1,
    'exactly one Cmd.filter construction in controls.js — the seam');
  assert.equal(count(controls, '= paletteOrders('), 2,
    'exactly two call sites (mouse-up and Enter) lower a tool through the seam');
  // Each `installInput({ … })` ARGUMENT OBJECT must carry `getStockFilter`, matched over that
  // block's own braces rather than by counting the token across the whole file.
  //
  // WHY NOT A WHOLE-FILE COUNT (which is what this was, and it broke on the first legitimate second
  // reader). `count(main, 'getStockFilter:') === count(main, 'installInput({')` was both TOO BROAD
  // and TOO WEAK. Too broad: it silently assumed `installInput` is the only thing in main.js that
  // takes a stock filter, and console-retirement WP-5 gave `initOverview` the same getter — the
  // ORDERS bar paints with the SAME mask, which is the point — so the count went 3 vs 2 with every
  // install site correctly wired. Too weak: 2 === 2 is equally satisfied by BOTH getters sitting in
  // one block and NONE in the other, which is precisely the miss it was written to catch. Per-block
  // matching fixes both and says WHICH block is wrong. MUTATION B still reddens; verified.
  //
  // `callBlocks` strips comments and string literals FIRST (CLAUDE.md trap 1): a `{` in a comment
  // and a `}` in a string each derail a raw brace walk, silently, while green.
  const blocks = callBlocks(main, 'installInput');
  assert.ok(blocks.length >= 2, 'main.js really does install input twice');
  for (const [i, block] of blocks.entries()) {
    assert.ok(block.includes('getStockFilter:'),
      `installInput block #${i + 1} does not pass getStockFilter (the fallback re-install included) ` +
      '— that block would silently paint every zone accept-all');
    // Non-vacuity: a brace walk that ran away to EOF would contain everything and prove nothing.
    assert.ok(block.length < main.length / 2 && block.includes('canvas, camera, session'),
      `installInput block #${i + 1} did not parse as one argument object (${block.length} chars)`);
  }
});
