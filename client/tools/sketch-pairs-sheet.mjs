#!/usr/bin/env node
// sketch-pairs-sheet.mjs — PRISTINE BESIDE ITS TWIN, AT `strong`, FOR THE OWNER'S EYE.
//
// ⛔ THE QUESTION THIS SHEET EXISTS TO ANSWER IS FUNCTIONAL, NOT DECORATIVE, and it is the one risk
// the owner's `strong` ruling actually carries. `haloScope: 'all'` puts a paper knockout 1.9 units
// wider than its own ink under EVERY element, so each element bites whatever was drawn before it —
// the experiment saw pristine legs and louvres coming away with white chunks. In this game "which
// machines are broken" is FEEDBACK the player acts on (invisible feedback is broken feedback,
// binding 2026-07-26), so a pristine piece that reads as wrecked is a functional defect, not a taste.
//
// `client/test/sketch-adoption.test.js` pins the half a string can decide: every pair differs by
// more than treatment noise, measured as ink length (weakest at adoption: `door-sliding`, 1.54% of
// its own ink / 184 units), and the damage always dominates the treatment's drift. What NO test can
// decide is whether a person looking at the two pictures can tell them apart at a glance. That is
// this sheet, and the owner is the instrument.
//
// ⭐ THE PAIRS ARE CHOSEN BY MEASUREMENT, NOT BY TASTE: the eight WEAKEST pairs by that same ink
// metric, so the sheet shows the owner the hardest cases rather than the flattering ones. A sheet of
// the eight most obviously-damaged twins would be true and useless.
//
// Each cell also carries the piece at 22 px — the Overview's furniture size on the wreck's decks —
// because a pair that is tellable apart on a 200-px card and identical on a tile has not solved
// anything.
//
// NO HOST, NO CDP (fittings-sheet.mjs's rule; docs/TRAPS.md #5 — a leaked headless Chrome
// OOM-kills somebody else's gate).
//
// USAGE
//   node client/tools/sketch-pairs-sheet.mjs --out client/tools/shots-sketch-adoption
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/sketch-pairs.png --window-size=1500,2100 <out>/sketch-pairs.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import * as FT from '../src/items/fittings.js';
import * as MC from '../src/items/machines.js';
import * as PF from '../src/items/paper-fixtures.js';
import * as PR from '../src/items/paper-resources.js';
import { FITTING_IDS } from '../src/items/fittings.js';
import { MACHINE_IDS } from '../src/items/machines.js';
import { FIXTURE_IDS } from '../src/items/paper-fixtures.js';
import { PAPER_RESOURCE_IDS, BUILD as PR_BUILD } from '../src/items/paper-resources.js';
import { buildWrecked, WRECKED, wreckedState } from '../src/items/wrecked.js';
import { INK, PAPER, SKETCH_LEVEL } from '../src/items/helpers.js';
import { flatten } from '../test/sketch-geom.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-sketch-adoption'));
const CELL = +arg('cell', '200');
const N = +arg('n', '8');
mkdirSync(OUT, { recursive: true });

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const CATS = [
  ['fittings', FITTING_IDS, (id, o) => FT[camel(id)](o)],
  ['machines', MACHINE_IDS, (id, o) => MC[camel(id)](o)],
  ['paper-fixtures', FIXTURE_IDS, (id, o) => PF[camel(id)](o)],
  ['paper-resources', PAPER_RESOURCE_IDS, (id, o) => PR_BUILD[id](o)],
];

const marksOf = (svg) => [...svg.replace(/<defs>[\s\S]*?<\/defs>/g, '').matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
const inkLength = (d) => flatten(d).reduce((acc, poly) => {
  let L = 0;
  for (let i = 0; i + 1 < poly.length; i += 1) L += Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
  return acc + L;
}, 0);
const sumLen = (ds) => ds.reduce((a, d) => a + inkLength(d), 0);

// ── rank every treated pair by how little it differs ─────────────────────────────────────────
const pairs = [];
for (const [cat, ids, build] of CATS) {
  for (const id of ids) {
    const e = WRECKED[id];
    if (!e || e.mockLabel != null) continue;   // a warm mock twin is not in this idiom (21 fittings)
    const p = build(id, { w: CELL, h: CELL, idPrefix: `pp-${id}` });
    const t = buildWrecked(id, { w: CELL, h: CELL, idPrefix: `pp-${id}` });
    const A = new Set(marksOf(p));
    const B = new Set(marksOf(t));
    const diff = sumLen([...A].filter((d) => !B.has(d))) + sumLen([...B].filter((d) => !A.has(d)));
    const total = sumLen([...A]);
    pairs.push({ cat, id, share: diff / total, diff, p, t, state: wreckedState(id) });
  }
}
pairs.sort((a, b) => a.share - b.share);
const shown = pairs.slice(0, N);

/** A builder's `<g>` FRAGMENT is not a document — it draws nothing until it is inside an `<svg>`.
 *  The first render of this page was eight rows of empty boxes for exactly that reason. */
const doc = (frag, side) => `<svg width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">${frag}</svg>`;
const tile = (frag) => `<span class="t">${doc(frag, 22)}</span>`;
const cellOf = (id, build) => build(id, { w: 22, h: 22, idPrefix: `tp-${id}` });

const rows = shown.map((r) => {
  const build = CATS.find(([c]) => c === r.cat)[2];
  return `<section class="row">
  <h2>${r.id}<span>${r.cat} · badge ${r.state || '—'} · differs by ${(r.share * 100).toFixed(2)}%
  of its own ink (${r.diff.toFixed(0)} units)</span></h2>
  <div class="cells">
    <figure class="cell"><header>pristine</header>${doc(r.p, CELL)}</figure>
    <figure class="cell"><header>twin</header>${doc(r.t, CELL)}</figure>
    <figure class="cell tiles"><header>at 22 px — the Overview's furniture size</header>
      ${tile(cellOf(r.id, build))}${tile(buildWrecked(r.id, { w: 22, h: 22, idPrefix: `tw-${r.id}` }))}
    </figure>
  </div></section>`;
}).join('\n');

const CSS = `
  body{margin:0;background:#E7E0D2;font-family:'Space Mono',ui-monospace,monospace;color:${INK};padding:38px}
  h1{font-family:'Instrument Serif',ui-serif,Georgia,serif;font-size:36px;margin:0 0 2px}
  .lead{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin:0 0 26px;max-width:1180px;line-height:2}
  .row{margin:0 0 22px}
  .row h2{font-family:'Instrument Serif',ui-serif,Georgia,serif;font-size:20px;font-weight:400;margin:0 0 8px;display:flex;gap:14px;align-items:baseline}
  .row h2 span{font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:#8A7F6C}
  .cells{display:flex;gap:12px;align-items:flex-start}
  .cell{margin:0;background:${PAPER};border:1px solid #C6BBA2;padding:10px 12px 12px}
  .cell header{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin-bottom:4px}
  .cell svg{display:block}
  .tiles .t{display:inline-block;margin-right:10px;background:${PAPER}}
  .note{background:${PAPER};border-left:3px solid #7B2C22;padding:14px 18px;font-size:11px;line-height:1.9;max-width:1180px;margin:0 0 30px}
`;

writeFileSync(join(OUT, 'sketch-pairs.html'), `<!doctype html><html><head><meta charset="utf-8">
<title>pristine vs wrecked at ${SKETCH_LEVEL}</title><style>${CSS}</style></head><body>
<h1>Pristine beside its twin, at <em>${SKETCH_LEVEL}</em></h1>
<p class="lead">the ${N} WEAKEST pairs of the ${pairs.length} treated ones, ranked by how little the
two drawings differ in ink · the hardest cases, not the flattering ones</p>
<div class="note"><b>What to look for.</b> At <b>${SKETCH_LEVEL}</b> the paper knockout runs under
every element, so each element takes a bite out of whatever was drawn before it — legs, louvres,
slats. The question is not whether the pristine piece looks rougher; it is whether you can tell,
<b>at a glance and at 22&nbsp;px</b>, which of the two is the broken one. If a pair collapses, name it:
the fix is the owner's call between keeping <code>strong</code> and running <code>strong</code> with
the per-element halo off, and neither is being made without you.</div>
${rows}
</body></html>`);

process.stdout.write(`wrote ${join(OUT, 'sketch-pairs.html')} — ${shown.length} of ${pairs.length} `
  + `pairs at ${SKETCH_LEVEL}; weakest ${shown[0].id} at ${(shown[0].share * 100).toFixed(2)}%\n`);
