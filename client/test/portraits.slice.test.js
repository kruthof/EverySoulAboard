// WS-ART A3 — the authored slice-crew portraits are integrated APPEND-ONLY.
//
// The A2 pass produced 8 SEED-7 procedural portraits; A3 supersedes the persona SOURCE with the
// authored 8-crew slice (AuthoredShips.PeriluneSlice, pk_ keys from dump-personas --ship slice).
// The manifest must be APPEND-ONLY: every A2 procedural key survives AND the 8 authored keys are
// added — never a rewrite that orphans the earlier art. This test reads the committed authored
// fixture (art/spritegen/personas_slice_authored.json) as the source of truth for the 8 keys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PORTRAITS } from '../assets/portraits.g.js';

const here = dirname(fileURLToPath(import.meta.url));          // client/test
const assetsDir = join(here, '..', 'assets');
const fixture = join(here, '..', '..', 'art', 'spritegen', 'personas_slice_authored.json');

const SLICE_KEYS = JSON.parse(readFileSync(fixture, 'utf8')).map((p) => p.key);

// The 8 SEED-7 procedural keys A2 shipped (personas_slice.json) — the append-only base that A3
// must not drop. Pinned here so a regression that rewrites (instead of appends) the manifest fails.
const A2_PROCEDURAL_KEYS = [
  'pk_8244d4ab', 'pk_503e7a52', 'pk_dd8723b5', 'pk_b44b2f04',
  'pk_c2f5d0ef', 'pk_90ef7696', 'pk_1e381ff9', 'pk_f4fc2b48',
];

test('the authored fixture supplies exactly 8 pk_ keys', () => {
  assert.equal(SLICE_KEYS.length, 8);
  for (const k of SLICE_KEYS) assert.match(k, /^pk_[0-9a-f]{8}$/);
  // The two roster anchors documented in the ship-lane merge.
  assert.ok(SLICE_KEYS.includes('pk_4a48938e'), 'Amara Okonkwo key present');
  assert.ok(SLICE_KEYS.includes('pk_99a431bd'), 'Wei Chen key present');
});

test('every authored slice key is a NEW manifest entry with a real PNG', () => {
  for (const k of SLICE_KEYS) {
    assert.ok(PORTRAITS[k], `manifest missing authored key ${k}`);
    assert.ok(existsSync(join(assetsDir, PORTRAITS[k].file)), `missing PNG for ${k}: ${PORTRAITS[k].file}`);
  }
});

test('the manifest is append-only: the 8 A2 procedural keys survive alongside the 8 authored', () => {
  for (const k of A2_PROCEDURAL_KEYS) {
    assert.ok(PORTRAITS[k], `append-only violated — A2 procedural key ${k} was dropped`);
  }
  // No key collisions between the two sets, so the manifest carries all 16.
  for (const k of SLICE_KEYS) assert.ok(!A2_PROCEDURAL_KEYS.includes(k));
  assert.ok(Object.keys(PORTRAITS).length >= 16, 'manifest should carry all 16 portraits');
});
