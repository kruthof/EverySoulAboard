#!/usr/bin/env node
// Regenerate the committed golden display lists under client/test/golden/. Run this ONLY when
// a rendering change is intended, and explain the diff in the commit message (the golden test
// is otherwise the tripwire). Usage:
//
//   node client/tools/regen-goldens.mjs
//
// Each golden is the deterministic DisplayList composeScene() produces for a fixed (frame,
// camera) pair from client/test/cases.js.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { goldenCases } from '../test/cases.js';
import { GOLDEN_DIR, composeGolden } from '../test/helpers.js';

mkdirSync(GOLDEN_DIR, { recursive: true });
for (const c of goldenCases()) {
  const out = join(GOLDEN_DIR, c.name + '.json');
  const text = composeGolden(c.frame, c.camera, c.lights);
  writeFileSync(out, text, 'utf8');
  const ops = text.split('\n').length - 3; // minus '[', ']' and trailing blank
  console.log(`wrote ${c.name}.json  (${ops} ops)`);
}
console.log('goldens regenerated.');
