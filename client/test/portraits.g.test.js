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

// E0-7 widened this from "exactly the manifest keys" to "the manifest keys, plus a remap that only
// ever points at manifest FILES". The glue gained SLICE_ID_SHIFT_REMAP: authoring one new device
// onto --ship slice moved every crew id by one, and a portrait key is pk_fnv1a32(seed, citizenId),
// so eight new keys had to resolve to the eight already-baked PNGs or the crew would wear each
// other's faces. Equality was the right assertion while the glue was a pure rename of the manifest;
// it is the wrong one now, and the two properties below are what actually matter.
test('the registry glue exposes the manifest keys, and every extra key reuses a manifest file', () => {
  const manifest = Object.keys(PORTRAITS).sort();
  const exposed = Object.keys(portraitRegistry).sort();
  // 1. NOTHING IS LOST: every generated entry is still reachable under its own key.
  for (const key of manifest) assert.ok(key in portraitRegistry, `manifest key ${key} vanished from the glue`);
  // 2. NOTHING IS INVENTED: EVERY exposed key — remapped or not — must resolve to a file the
  //    generated manifest names, so the glue can never conjure a portrait with no committed PNG
  //    behind it. Compared against PORTRAITS[*].file rather than against portraitRegistry's own
  //    values, because a remap deliberately OVERRIDES the entry for a key it shares with the
  //    manifest (pk_99a431bd is both a baked key and a remap target), and a check written the
  //    lazy way would have compared the override with itself.
  const manifestFiles = Object.values(PORTRAITS).map((e) => e.file);
  for (const key of exposed) {
    const src = portraitRegistry[key];
    assert.ok(manifestFiles.some((f) => src.endsWith(f)),
      `key ${key} points at ${src}, which is not any manifest entry's file`);
  }
  const extra = exposed.filter((k) => !(k in PORTRAITS));
  // 3. NON-VACUITY: the remap is expected to be non-empty today. If it is ever emptied because the
  //    portrait pipeline was re-run against the current ship, this says so instead of silently
  //    degrading to the old equality check.
  assert.ok(extra.length > 0,
    'SLICE_ID_SHIFT_REMAP is empty — if the portraits were regenerated, delete the remap and this ' +
    'assertion together; until then an empty remap means the slice crew have lost their faces');
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
