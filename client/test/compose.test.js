// Golden display-list tests. composeScene is a pure function of (frame, camera, assets), so we
// feed the committed wire fixture + fixed camera states and assert the produced DisplayList
// byte-for-byte against committed goldens. No GPU/canvas needed. Regenerate intended changes
// with: node client/tools/regen-goldens.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { goldenCases } from './cases.js';
import { GOLDEN_DIR, composeGolden, loadBootFrame, cameras, ASSETS } from './helpers.js';
import { composeScene } from '../src/render/compose.js';

const KNOWN_OPS = new Set(['hull', 'void', 'floor', 'debris', 'wall', 'entity', 'wash', 'cursor', 'reticle']);

for (const c of goldenCases()) {
  test(`golden display list: ${c.name}`, () => {
    const produced = composeGolden(c.frame, c.camera, c.lights);
    const goldenPath = join(GOLDEN_DIR, c.name + '.json');
    let golden;
    try {
      golden = readFileSync(goldenPath, 'utf8');
    } catch {
      assert.fail(`missing golden ${c.name}.json — run: node client/tools/regen-goldens.mjs`);
    }
    assert.equal(
      produced, golden,
      `DisplayList for '${c.name}' drifted from its golden. If intended, regenerate with ` +
      `node client/tools/regen-goldens.mjs and explain the diff in the commit.`,
    );
  });
}

test('display list uses only the known op vocabulary', () => {
  const boot = loadBootFrame();
  const ops = composeScene(boot, cameras(boot).full, ASSETS);
  for (const o of ops) {
    assert.ok(KNOWN_OPS.has(o.op), `unexpected op '${o.op}'`);
    assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y), `op coords must be integers: ${JSON.stringify(o)}`);
  }
});

test('composeScene is deterministic (pure)', () => {
  const boot = loadBootFrame();
  const cam = cameras(boot).full;
  const a = JSON.stringify(composeScene(boot, cam, ASSETS));
  const b = JSON.stringify(composeScene(boot, cam, ASSETS));
  assert.equal(a, b);
});

test('composeScene never mutates the frame it is given', () => {
  const boot = loadBootFrame();
  const before = JSON.stringify(boot);
  composeScene(boot, cameras(boot).full, ASSETS);
  assert.equal(JSON.stringify(boot), before);
});
