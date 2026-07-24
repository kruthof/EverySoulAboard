// Typing isolation (playtest finding): keys typed into the dialogue say box or the
// MOSS terminal textarea must never trigger game shortcuts — and must not be
// preventDefault'ed away from the field. The guard is the pure, duck-typed
// isTextEntryTarget; the window keydown handler bails (except Escape) when it's true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTextEntryTarget, paletteOrder } from '../src/input/controls.js';

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

// ---------------- armed palette tool → wire order (E0-3) ----------------
// The mouse-click and Enter-key paths both lower an armed tool through paletteOrder, so this is
// the single point where "which verb does this tool send" is decided — and therefore the single
// point worth pinning. Routing an order tool through Cmd.build would hand a designation to
// BuildSystem, which has no idea what one is: a silent no-op the player would read as a dead UI.

test('paletteOrder: build kinds lower to Cmd.build at the clicked tile', () => {
  assert.deepEqual(paletteOrder('wall', 4, 9), { cmd: 'build', kind: 'wall', x: 4, y: 9, material: 0 });
  assert.deepEqual(paletteOrder('door', 0, 0), { cmd: 'build', kind: 'door', x: 0, y: 0, material: 0 });
  assert.deepEqual(paletteOrder('cancel', 7, 2), { cmd: 'build', kind: 'cancel', x: 7, y: 2, material: 0 });
});

test('paletteOrder: dig and stockpile lower to their OWN verbs, marking (never clearing)', () => {
  assert.deepEqual(paletteOrder('dig', 58, 7), { cmd: 'dig', x: 58, y: 7, on: 1 });
  assert.deepEqual(paletteOrder('stockpile', 12, 5), { cmd: 'stockpile', x: 12, y: 5, on: 1 });
  // A palette click always MARKS; clearing is the CANCEL tool's job, not a hidden toggle. If this
  // ever became a toggle, a sweep across mixed tiles would flip some on and some off.
  assert.equal(paletteOrder('dig', 1, 1).on, 1);
  assert.equal(paletteOrder('stockpile', 1, 1).on, 1);
});

test('paletteOrder: MOVE and an empty slot own no tile order (their branches handle them)', () => {
  for (const t of ['move', null, undefined, '', 'nonsense', 'bunk']) {
    assert.equal(paletteOrder(t, 3, 3), null, String(t) + ' must not lower to a tile order');
  }
});
