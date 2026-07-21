// WS-ART A2 — the generated portrait manifest (client/assets/portraits.g.js) + its glue.
//
// Guarantees:
//   1. The manifest LOADS and is well-shaped: { pk_key: { file } }, every key a pk_ key,
//      every file a string, and every referenced PNG actually exists on disk.
//   2. The registry glue (portraits-registry.js) turns it into the { key -> src } map the
//      wave-1 resolver wants, and a KNOWN key resolves to an image portrait.
//   3. An UNKNOWN key (or a citizen with no portrait) still falls back to the procedural
//      silhouette — the mandatory always-a-face guarantee, unbroken by this pipeline.
//
// The manifest may legitimately be empty (portrait art not yet generated / API blocked);
// the file-existence and fallback guarantees hold either way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PORTRAITS } from '../assets/portraits.g.js';
import { portraitRegistry } from '../assets/portraits-registry.js';
import { resolvePortrait } from '../src/ui/portraits.js';

const here = dirname(fileURLToPath(import.meta.url)); // client/test
const assetsDir = join(here, '..', 'assets');

test('portraits.g.js is a well-shaped { pk_key: { file } } manifest', () => {
  assert.equal(typeof PORTRAITS, 'object');
  assert.ok(PORTRAITS && !Array.isArray(PORTRAITS));
  for (const [key, entry] of Object.entries(PORTRAITS)) {
    assert.match(key, /^pk_[0-9a-f]{8}$/, `portrait key '${key}' is not a pk_ key`);
    assert.ok(entry && typeof entry === 'object', `entry for '${key}' is not an object`);
    assert.equal(typeof entry.file, 'string', `entry.file for '${key}' is not a string`);
    assert.match(entry.file, /^portraits\/pk_[0-9a-f]{8}\.png$/, `entry.file for '${key}' looks wrong`);
  }
});

test('every manifest entry points at an existing PNG on disk', () => {
  for (const [key, entry] of Object.entries(PORTRAITS)) {
    assert.ok(existsSync(join(assetsDir, entry.file)), `missing file for '${key}': ${entry.file}`);
  }
});

test('the registry glue exposes exactly the manifest keys', () => {
  assert.deepEqual(Object.keys(portraitRegistry).sort(), Object.keys(PORTRAITS).sort());
  for (const src of Object.values(portraitRegistry)) {
    assert.equal(typeof src, 'string');
    assert.ok(src.length > 0);
  }
});

test('a known portrait key resolves to an image (when any portrait exists)', () => {
  const keys = Object.keys(PORTRAITS);
  if (keys.length === 0) {
    // No portrait art yet — the resolver must still hand back a silhouette for any key.
    assert.equal(resolvePortrait({ cid: 'x', portrait: 'pk_deadbeef' }, portraitRegistry).kind, 'silhouette');
    return;
  }
  const key = keys[0];
  const p = resolvePortrait({ cid: 'anyone', name: 'Some One', portrait: key }, portraitRegistry);
  assert.equal(p.kind, 'image');
  assert.equal(p.key, key);
  assert.equal(p.src, portraitRegistry[key]);
});

test('an unknown key and an absent portrait both fall back to the silhouette', () => {
  assert.equal(resolvePortrait({ cid: 'ghost', portrait: 'pk_00000000' }, portraitRegistry).kind, 'silhouette');
  assert.equal(resolvePortrait({ cid: 'ghost' }, portraitRegistry).kind, 'silhouette');
  assert.equal(resolvePortrait({ cid: 'ghost', portrait: null }, portraitRegistry).kind, 'silhouette');
});
