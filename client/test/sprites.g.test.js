// WS-ART A1 — the generated sprite manifest (client/assets/sprites.g.js) contract.
//
// Three guarantees, all machine-checked so the animation-state schema can grow without
// the base art or the wave-1 client ever regressing:
//   1. APPEND-ONLY: the four pre-existing exports (SPRITE_TILE / SPRITE_FACING /
//      SPRITE_NO_ROTATE / SPRITE_URIS) are byte-identical to `main`. We snapshot main's
//      values as sha256 over their canonical JSON — a compact byte-identity proof that
//      does not duplicate ~700 KB of base64 into the test.
//   2. WELL-FORMED new maps: SPRITE_STATES (role -> {state: dataURI}) and SPRITE_FRAMES
//      (role -> [dataURI, ...]) only mention roles that exist in SPRITE_URIS, carry real
//      PNG data URIs, and every frame cycle has >= 1 frame. Empty maps are valid — the
//      wave-1 client that predates these keys simply keeps using SPRITE_URIS.
//   3. IDEMPOTENT extract: running client/tools/extract-sprites.mjs twice produces the
//      exact same file, and that file matches what is committed (Client.html in sync).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SPRITE_TILE,
  SPRITE_FACING,
  SPRITE_NO_ROTATE,
  SPRITE_URIS,
  SPRITE_STATES,
  SPRITE_FRAMES,
} from '../assets/sprites.g.js';

const here = dirname(fileURLToPath(import.meta.url)); // client/test
const spritesFile = join(here, '..', 'assets', 'sprites.g.js');
const extractor = join(here, '..', 'tools', 'extract-sprites.mjs');

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

// Snapshot of main's pre-existing values (computed from `git show main:...sprites.g.js`).
// If the base art is ever intentionally re-generated these move — and that must be a
// deliberate, explained commit, never a silent side effect of the animation schema.
const MAIN = {
  SPRITE_TILE: 128,
  SPRITE_FACING: '257c2899dd5cdb836f1c2b1069833ffe2f1a13598401b3ba26da27bea392de8f',
  SPRITE_NO_ROTATE: 'eb1ba4e6cb5b1e9aa0e1feb1d153cace2d1071b80fc560d2f25d0f1547b2761f',
  SPRITE_URIS: '5ba8d52c441a5930628343140f62f45962582362595c35b292ece2d6a18fac47',
};

const isPngDataUri = (s) => typeof s === 'string' && s.startsWith('data:image/png;base64,') && s.length > 64;

test('pre-existing exports are byte-identical to main (append-only)', () => {
  assert.equal(SPRITE_TILE, MAIN.SPRITE_TILE, 'SPRITE_TILE changed');
  assert.equal(sha(SPRITE_FACING), MAIN.SPRITE_FACING, 'SPRITE_FACING changed');
  assert.equal(sha(SPRITE_NO_ROTATE), MAIN.SPRITE_NO_ROTATE, 'SPRITE_NO_ROTATE changed');
  assert.equal(sha(SPRITE_URIS), MAIN.SPRITE_URIS, 'SPRITE_URIS changed');
});

test('SPRITE_STATES is well-formed (roles exist, values are PNG data URIs)', () => {
  assert.equal(typeof SPRITE_STATES, 'object');
  assert.ok(SPRITE_STATES && !Array.isArray(SPRITE_STATES));
  for (const [role, stateMap] of Object.entries(SPRITE_STATES)) {
    assert.ok(role in SPRITE_URIS, `SPRITE_STATES role '${role}' not in SPRITE_URIS`);
    assert.ok(stateMap && typeof stateMap === 'object' && !Array.isArray(stateMap));
    assert.ok(Object.keys(stateMap).length >= 1, `SPRITE_STATES['${role}'] is empty`);
    for (const [state, uri] of Object.entries(stateMap)) {
      assert.ok(isPngDataUri(uri), `SPRITE_STATES['${role}']['${state}'] is not a PNG data URI`);
    }
  }
});

test('SPRITE_FRAMES is well-formed (roles exist, cycles are non-empty PNG data URIs)', () => {
  assert.equal(typeof SPRITE_FRAMES, 'object');
  assert.ok(SPRITE_FRAMES && !Array.isArray(SPRITE_FRAMES));
  for (const [role, cycle] of Object.entries(SPRITE_FRAMES)) {
    assert.ok(role in SPRITE_URIS, `SPRITE_FRAMES role '${role}' not in SPRITE_URIS`);
    assert.ok(Array.isArray(cycle), `SPRITE_FRAMES['${role}'] is not an array`);
    assert.ok(cycle.length >= 1, `SPRITE_FRAMES['${role}'] has < 1 frame`);
    for (let i = 0; i < cycle.length; i++) {
      assert.ok(isPngDataUri(cycle[i]), `SPRITE_FRAMES['${role}'][${i}] is not a PNG data URI`);
    }
  }
});

test('extract-sprites.mjs is idempotent and in sync with Client.html', () => {
  const committed = readFileSync(spritesFile);
  execFileSync(process.execPath, [extractor], { stdio: 'ignore' });
  const first = readFileSync(spritesFile);
  execFileSync(process.execPath, [extractor], { stdio: 'ignore' });
  const second = readFileSync(spritesFile);
  assert.ok(first.equals(second), 'extractor is not idempotent (two runs differ)');
  assert.ok(committed.equals(first), 'committed sprites.g.js is stale vs Client.html — re-run the extractor');
});
