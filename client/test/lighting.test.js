// C4 lighting tests — the pure surface behind the composited light overlay: the RLE plane decode
// (wire/messages.js), the compose fog gate over an untrusted plane, no-lights byte-compat, the
// light-op ordering invariant, and canvas2d↔batch routing parity of the overlay. No DOM/GPU; the
// canvas fill + GL multiply are the thin executor glue, covered by the parity harness, not node.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeScene } from '../src/render/compose.js';
import { buildPasses } from '../src/render/webgl/batch.js';
import { decodeLightPlane } from '../src/wire/messages.js';
import { litOverlay, LIGHT, C } from '../src/render/palette.js';
import { loadBootFrame, cameras, deriveLightPlane, ASSETS } from './helpers.js';

// A tiny 3-wide frame: [fog, floor, floor]. Only tiles 1..2 are explored.
function tinyFrame() {
  return {
    w: 3, h: 1, lens: 'none',
    cells: [
      [32, C.Unknown, C.Unknown, 0], // fog (unexplored)
      [46, C.Floor, C.Floor, 0],     // floor (explored)
      [46, C.Floor, C.Floor, 0],     // floor (explored)
    ],
  };
}
const fullCam = (f) => ({ x: f.w / 2, y: f.h / 2, z: 1, viewW: 4000, viewH: 4000, tile: 128 });

// ---- palette contract ----
test('the light table paints Dead/Emergency/Brownout and treats Powered/Unknown as no-ops', () => {
  assert.ok(litOverlay(1) && litOverlay(2) && litOverlay(3), 'Dead/Emergency/Brownout paint');
  assert.equal(litOverlay(4), undefined, 'Powered is transparent (no overlay)');
  assert.equal(litOverlay(0), undefined, 'Unknown/fog paints nothing');
  assert.equal(LIGHT[1], 'rgba(6,5,14,.72)');
});

// ---- fog gate: never trust the plane ----
test('FOG GATE: a light claimed on an unexplored tile is dropped, never rendered', () => {
  const f = tinyFrame();
  // Adversarial plane: claim a bright Dead(1) overlay on the FOG tile (index 0), Brownout on floors.
  const plane = new Uint8Array([1, 3, 3]);
  const ops = composeScene(f, fullCam(f), ASSETS, plane);
  const lightOps = ops.filter((o) => o.op === 'light');
  // Only the two explored floor tiles get a light op; the fog tile (0,0) is silently dropped.
  assert.deepEqual(lightOps.map((o) => [o.x, o.y, o.state]), [[1, 0, 3], [2, 0, 3]]);
  assert.ok(!lightOps.some((o) => o.x === 0), 'no light op ever lands on the fog tile');
});

test('FOG GATE holds over the real boot frame + its derived plane (which claims light on fog)', () => {
  const boot = loadBootFrame();
  const plane = deriveLightPlane(boot); // deriveLightPlane deliberately sets fog tiles to Dead(1)
  const ops = composeScene(boot, cameras(boot).full, ASSETS, plane);
  for (const o of ops) {
    if (o.op !== 'light') continue;
    const cell = boot.cells[o.y * boot.w + o.x];
    const fog = cell[0] === 32 && cell[1] === C.Unknown;
    assert.ok(!fog, `light op leaked onto fog tile (${o.x},${o.y})`);
  }
});

// ---- RLE decode round-trip ----
test('decodeLightPlane expands run-length pairs back to the exact row-major plane', () => {
  // Encode a known plane the same way the host does (WireFormat.Light), then decode it back.
  const original = new Uint8Array([4, 4, 4, 1, 1, 3, 0, 0, 0, 0]);
  const rle = [];
  for (const s of original) {
    const last = rle[rle.length - 1];
    if (last && last[0] === s) last[1]++; else rle.push([s, 1]);
  }
  assert.deepEqual(rle, [[4, 3], [1, 2], [3, 1], [0, 4]]);
  const plane = decodeLightPlane({ type: 'light', deck: 0, w: 10, h: 1, rle });
  assert.deepEqual([...plane], [...original]);
});

test('decodeLightPlane is tolerant: garbage → null, short runs zero-fill, over-long runs clamp', () => {
  assert.equal(decodeLightPlane(null), null);
  assert.equal(decodeLightPlane({ type: 'frame' }), null);
  assert.equal(decodeLightPlane({ type: 'light', w: 2, h: 1 }), null); // no rle
  // Short run list leaves the rest at 0 (Unknown); an over-long run is clamped to w*h.
  assert.deepEqual([...decodeLightPlane({ type: 'light', w: 4, h: 1, rle: [[3, 1]] })], [3, 0, 0, 0]);
  assert.deepEqual([...decodeLightPlane({ type: 'light', w: 2, h: 1, rle: [[1, 99]] })], [1, 1]);
  assert.deepEqual([...decodeLightPlane({ type: 'light', w: 0, h: 0, rle: [[1, 4]] })], []);
});

// ---- no-lights byte-compat ----
test('no lights (null OR an all-Powered/Unknown plane) is byte-identical to the pre-lighting output', () => {
  const boot = loadBootFrame();
  const cam = cameras(boot).full;
  const base = JSON.stringify(composeScene(boot, cam, ASSETS));
  assert.equal(JSON.stringify(composeScene(boot, cam, ASSETS, null)), base, 'null plane == no arg');
  // A plane that only ever says Powered(4) or Unknown(0) paints nothing → same bytes.
  const dark = new Uint8Array(boot.w * boot.h).fill(4);
  assert.equal(JSON.stringify(composeScene(boot, cam, ASSETS, dark)), base, 'all-Powered adds no ops');
});

// ---- light-op ordering invariant ----
test('within a tile a light op sits after the entity and before the wash', () => {
  // A single explored floor+device tile with a lens wash and a Brownout light on it.
  const f = {
    w: 1, h: 1, lens: 'temperature',
    cells: [[71, C.Device, C.LensWarn, 0]], // 'G' solar device, LensWarn bg → wash
  };
  const ops = composeScene(f, fullCam(f), ASSETS, new Uint8Array([3]));
  const kinds = ops.map((o) => o.op);
  // floor base, entity, light, wash — in that exact relative order.
  assert.deepEqual(kinds, ['floor', 'entity', 'light', 'wash']);
  assert.ok(kinds.indexOf('light') > kinds.indexOf('entity'), 'light after entity');
  assert.ok(kinds.indexOf('light') < kinds.indexOf('wash'), 'light before wash');
});

// ---- executor parity: canvas2d fill vs batch→webgl2 routing read the SAME palette entry ----
test('canvas2d and the batch light pass resolve the identical overlay for every state', () => {
  const boot = loadBootFrame();
  const cam = cameras(boot).zoomed;
  const plane = deriveLightPlane(boot);
  const list = composeScene(boot, cam, ASSETS, plane);
  const lightPass = buildPasses(list, { timeSec: 0 })[2];
  // Every compose light op appears once, in order, in the light pass carrying the same state…
  const composeLights = list.filter((o) => o.op === 'light');
  assert.equal(lightPass.ops.length, composeLights.length);
  assert.ok(composeLights.length > 0);
  for (let i = 0; i < composeLights.length; i++) {
    const a = composeLights[i], b = lightPass.ops[i];
    assert.deepEqual([b.kind, b.x, b.y, b.state], ['light', a.x, a.y, a.state]);
    // …so both executors key the SAME rgba: canvas2d fills litOverlay(state); webgl2 folds the
    // same litOverlay(state) into its multiply. Parity is at the palette, not the pixel.
    assert.equal(litOverlay(a.state), litOverlay(b.state));
    assert.ok(litOverlay(a.state), 'compose only emits visible states (1/2/3)');
  }
});
