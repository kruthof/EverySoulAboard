// Shared test scaffolding: loads the committed wire fixture, builds the fixed camera states,
// derives the lens / selection scenarios, and serializes a DisplayList to a stable golden
// string. Imported by both the tests and tools/regen-goldens.mjs so a golden and its assertion
// are produced by identical code.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { clampCam } from '../src/render/camera.js';
import { composeScene } from '../src/render/compose.js';
import { buildPasses } from '../src/render/webgl/batch.js';
import { C } from '../src/render/palette.js';
import { SPRITE_FACING, SPRITE_NO_ROTATE } from '../assets/sprites.g.js';

const here = dirname(fileURLToPath(import.meta.url));           // <wt>/client/test
// The wire fixture is the real captured boot frame owned by tests/Perilune.Tests (read-only;
// we never modify it — single source of truth for the wire shape).
const FIXTURE = join(here, '..', '..', 'tests', 'Perilune.Tests', 'Golden', 'web_frame_boot.json');
export const GOLDEN_DIR = join(here, 'golden');

/** Sprite facing metadata the pure composer consumes (small; from the generated module). */
export const ASSETS = { facing: SPRITE_FACING, noRotate: SPRITE_NO_ROTATE };

const VIEW_W = 1664, VIEW_H = 520, TILE = 128;

/** The committed boot frame, freshly parsed each call (tests never share mutable state). */
export function loadBootFrame() {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

/** A clamped camera descriptor. `z` is pre-clamp; clampCam applies fit/limits like the runtime. */
function makeCamera(frame, x, y, z) {
  const cam = { x, y, z, viewW: VIEW_W, viewH: VIEW_H, tile: TILE };
  clampCam(cam, frame);
  return cam;
}

/** Named camera fixtures. `full` fits the whole map; `zoomed` frames a mid-ship subset. */
export function cameras(frame) {
  return {
    full: makeCamera(frame, frame.w / 2, frame.h / 2, 0.01), // 0.01 → clamps up to fitZoom
    zoomed: makeCamera(frame, 28, 9, 0.9), // ~14×4 tile window over the mid-ship rooms
  };
}

/** First floor ('.') tile in row-major order — a deterministic, always-explored pick. */
export function firstFloorTile(frame) {
  for (let i = 0; i < frame.cells.length; i++) {
    if (frame.cells[i][0] === 46) return { x: i % frame.w, y: (i / frame.w) | 0 };
  }
  return { x: 0, y: 0 };
}

/**
 * Synthetic lens frame: paints a LensWarn bg wash over every explored non-fog tile (the boot
 * fixture carries no lens, so we derive one to exercise the wash op — clearly labelled).
 */
export function deriveLensFrame(frame) {
  const f = JSON.parse(JSON.stringify(frame));
  f.lens = 'temperature';
  for (const cell of f.cells) {
    const fog = cell[0] === 32 && cell[1] === C.Unknown;
    const voidTile = cell[0] === 32 && cell[1] === C.Void;
    if (!fog && !voidTile) cell[2] = C.LensWarn; // bg id → WASH tints
  }
  return f;
}

/** Synthetic selection frame: selects (and lists as crew) the first floor tile. */
export function deriveSelectionFrame(frame) {
  const f = JSON.parse(JSON.stringify(frame));
  const t = firstFloorTile(f);
  f.sel = [t.x, t.y];
  f.crew = [[t.x, t.y, 1]];
  return f;
}

/** A camera centred on a tile at the given zoom, so that tile is guaranteed visible. */
export function cameraOn(frame, x, y, z) {
  return makeCamera(frame, x + 0.5, y + 0.5, z);
}

/** Stable golden serialization: one op per line, insertion-ordered keys, trailing newline. */
export function serialize(ops) {
  return '[\n' + ops.map((o) => JSON.stringify(o)).join(',\n') + '\n]\n';
}

/** Compose + serialize in one step (the golden production path). */
export function composeGolden(frame, camera) {
  return serialize(composeScene(frame, camera, ASSETS));
}

export const PASS_GOLDEN_DIR = join(here, 'golden', 'passes');

/**
 * The WebGL RenderPass golden path: compose → buildPasses. timeSec is fixed (0) so the reticle
 * phase is stable; buildPasses is pure so this is byte-for-byte reproducible.
 */
export function composePasses(frame, camera, opts = { timeSec: 0 }) {
  return buildPasses(composeScene(frame, camera, ASSETS), opts);
}

/**
 * Stable golden serialization for RenderPass lists: one pass block per name, one op per line,
 * insertion-ordered keys, trailing newline. Mirrors serialize()'s readable-diff shape.
 */
export function serializePasses(passes) {
  const blocks = passes.map((p) => {
    const body = p.ops.map((o) => '  ' + JSON.stringify(o)).join(',\n');
    return '"' + p.name + '": [' + (p.ops.length ? '\n' + body + '\n' : '') + ']';
  });
  return '{\n' + blocks.join(',\n') + '\n}\n';
}

/** Compose → buildPasses → serialize in one step (the pass-golden production path). */
export function composePassGolden(frame, camera) {
  return serializePasses(composePasses(frame, camera, { timeSec: 0 }));
}
