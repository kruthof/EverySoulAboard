// Matte scrub tests — the PURE white-backdrop remover (render/matte.js). Playtest finding: two
// generated pawn walk frames shipped with an opaque white matte behind the figure (the pipeline
// keys GREEN; the image model painted white, so the key missed) and pawns "blinked white" every
// time that frame cycled in. The scrub floods from the border across transparent + near-white
// pixels and clears the near-white ones; enclosed white detail (eyes, highlights) survives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubMatte } from '../src/render/matte.js';

/** Build a w*h RGBA buffer filled with one pixel value. */
function buf(w, h, [r, g, b, a]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; }
  return d;
}
const px = (d, w, x, y) => d.slice((y * w + x) * 4, (y * w + x) * 4 + 4);
const set = (d, w, x, y, [r, g, b, a]) => { const o = (y * w + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a; };

test('an opaque white matte inset in a transparent margin is cleared (the shipped defect shape)', () => {
  // 8x8 transparent frame with an opaque white 4x4 inset and a dark 2x2 "figure" inside it.
  const w = 8, h = 8;
  const d = buf(w, h, [0, 0, 0, 0]);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) set(d, w, x, y, [255, 255, 255, 255]);
  for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) set(d, w, x, y, [40, 40, 60, 255]);
  const cleared = scrubMatte(d, w, h);
  assert.equal(cleared, 16 - 4, 'the white ring cleared, the figure kept');
  assert.deepEqual([...px(d, w, 2, 2)].slice(3), [0], 'matte corner is transparent now');
  assert.deepEqual([...px(d, w, 3, 3)], [40, 40, 60, 255], 'figure pixels untouched');
});

test('enclosed white detail inside a figure survives (no reachable path from the border)', () => {
  const w = 6, h = 6;
  const d = buf(w, h, [0, 0, 0, 0]);
  // a solid dark 4x4 figure with one white "eye" pixel in its middle
  for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) set(d, w, x, y, [30, 30, 30, 255]);
  set(d, w, 2, 2, [255, 255, 255, 255]);
  const cleared = scrubMatte(d, w, h);
  assert.equal(cleared, 0, 'nothing reachable to clear');
  assert.deepEqual([...px(d, w, 2, 2)], [255, 255, 255, 255], 'the eye survives');
});

test('a clean transparent-background sprite is a byte-for-byte no-op', () => {
  const w = 5, h = 5;
  const d = buf(w, h, [0, 0, 0, 0]);
  set(d, w, 2, 2, [200, 40, 40, 255]); // a red pixel — bright but chromatic, not matte
  const before = [...d];
  assert.equal(scrubMatte(d, w, h), 0);
  assert.deepEqual([...d], before);
});

test('light-grey mattes clear too; saturated brights never do', () => {
  const w = 4, h = 1;
  const d = new Uint8ClampedArray([
    210, 210, 215, 255,   // light grey matte — cleared
    255, 255, 255, 255,   // white matte — cleared
    255, 200, 120, 255,   // bright but saturated (skin/amber) — kept (walls the fill)
    0, 0, 0, 0,           // already transparent
  ]);
  const cleared = scrubMatte(d, w, h);
  assert.equal(cleared, 2);
  assert.equal(d[3], 0);
  assert.equal(d[7], 0);
  assert.deepEqual([...d.slice(8, 12)], [255, 200, 120, 255]);
});

test('garbage tolerance: null / zero-size / short buffers change nothing and return 0', () => {
  assert.equal(scrubMatte(null, 4, 4), 0);
  assert.equal(scrubMatte(new Uint8ClampedArray(0), 0, 0), 0);
  assert.equal(scrubMatte(new Uint8ClampedArray(8), 4, 4), 0, 'short buffer rejected');
});
