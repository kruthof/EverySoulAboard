#!/usr/bin/env node
// Regenerate the committed WebGL RenderPass goldens under client/test/golden/passes/. Run this
// ONLY when a batcher change is intended, and explain the diff in the commit message (the pass
// golden test is otherwise the tripwire). Usage:
//
//   node client/tools/regen-pass-goldens.mjs
//
// Each golden is the deterministic RenderPass list buildPasses() produces for the same fixed
// (frame, camera) pairs as the DisplayList goldens (client/test/cases.js), at timeSec=0.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { goldenCases } from '../test/cases.js';
import { PASS_GOLDEN_DIR, composePassGolden } from '../test/helpers.js';

mkdirSync(PASS_GOLDEN_DIR, { recursive: true });
for (const c of goldenCases()) {
  const out = join(PASS_GOLDEN_DIR, c.name + '.json');
  const text = composePassGolden(c.frame, c.camera);
  writeFileSync(out, text, 'utf8');
  console.log(`wrote passes/${c.name}.json`);
}
console.log('pass goldens regenerated.');
