#!/usr/bin/env node
// paper-resources-sheet.mjs — RENDER THE NINE GROUND STACKS ONTO ONE PAGE, so they can be looked at.
//
// ⚠️ WHY THIS EXISTS, and why it carries a TILE STRIP that `fittings-sheet.mjs` does not.
// `client/test/paper-resources.test.js` proves things about STRINGS. None of that is a picture, and
// for THIS set the picture is the whole claim: these nine are drawn at ~22–48 px in the shipping
// game — the Room Zoom's ground layer and the ship plate's miniatures — and a piece can satisfy
// every assertion in the suite while dissolving into a smudge at the size a player actually sees.
// So the page draws each piece at catalogue size AND at 22 / 32 / 48 px, side by side, on the same
// paper. If two silhouettes collapse into each other in the strip, the set has failed regardless of
// what the guards say.
//
// NO HOST, NO CDP, NO MODULE LOADING IN THE PAGE: the SVG is generated here, in node, and inlined —
// `file://` refuses ES-module imports, and a tool that needs a running game to draw a pile is a tool
// nobody runs twice.
//
// USAGE
//   node client/tools/paper-resources-sheet.mjs --out client/tools/shots-paper-resources
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/paper-resources.png --window-size=1500,2600 <out>/paper-resources.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SPECS, PAPER_RESOURCE_IDS, SIZES, BUILD } from '../src/items/paper-resources.js';
import { PAPER, INK } from '../src/items/helpers.js';
import { WRECKED, buildWrecked } from '../src/items/wrecked.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-paper-resources'));
const CELL = +arg('cell', '230');
const TILES = [22, 32, 48];
mkdirSync(OUT, { recursive: true });

const NUM = new Map(PAPER_RESOURCE_IDS.map((id, i) => [id, String(i + 1).padStart(2, '0')]));

/** the tile strip: the same piece at the three sizes the shipping surfaces really draw it at */
const strip = (id, wrecked) => TILES.map((px) => {
  const svg = wrecked
    ? buildWrecked(id, { w: px, h: px, idPrefix: `t${px}-w-${id}` })
    : BUILD[id]({ w: px, h: px, idPrefix: `t${px}-${id}` });
  return `<div class="tile"><svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${svg}</svg>`
    + `<span>${px}</span></div>`;
}).join('');

const card = (id, wrecked) => {
  const spec = SPECS[id];
  const svg = wrecked
    ? buildWrecked(id, { w: CELL, h: CELL, idPrefix: `sheet-w-${id}` })
    : BUILD[id]({ w: CELL, h: CELL, idPrefix: `sheet-${id}` });
  const dim = spec.round ? `∅ ${spec.w} × ${spec.h} CM` : `${spec.w} × ${spec.d} × ${spec.h} CM`;
  const label = wrecked ? `${id} · damaged` : id;
  return `<figure class="card">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${label}</span></header>
  <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${svg}</svg>
  <div class="strip">${strip(id, wrecked)}</div>
  <figcaption><span>${dim}</span><span class="hint">size ${SIZES[id].w}×${SIZES[id].h}</span></figcaption>
</figure>`;
};

const pristine = PAPER_RESOURCE_IDS.map((id) => card(id, false)).join('\n');
const twins = PAPER_RESOURCE_IDS.filter((id) => WRECKED[id]).map((id) => card(id, true)).join('\n');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Perilune ground stacks — paper/ink</title>
<style>
  body { margin: 0; background: #E7E0D2; font-family: 'Space Mono', monospace; }
  main { padding: 40px; display: flex; flex-wrap: wrap; gap: 18px; }
  h1 { width: 100%; font-family: 'Instrument Serif', serif; font-size: 34px; color: #241E17; margin: 0 0 6px; }
  h2 { width: 100%; font-family: 'Instrument Serif', serif; font-size: 24px; color: #241E17; margin: 22px 0 0; }
  .card { margin: 0; width: ${CELL + 36}px; background: ${PAPER}; border: 1px solid #C6BBA2; padding: 14px; box-sizing: border-box; }
  .card header { display: flex; gap: 8px; align-items: baseline; font-size: 10px; letter-spacing: .16em; color: #8A8272; text-transform: uppercase; }
  .card .name { color: ${INK}; letter-spacing: .1em; }
  .card svg { display: block; }
  .strip { display: flex; gap: 12px; align-items: flex-end; margin: 8px 0; border-top: 1px dashed rgba(20,18,15,.25); padding-top: 8px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .tile span { font-size: 7px; letter-spacing: .1em; color: #A79C86; }
  .tile svg { outline: 1px solid rgba(20,18,15,.18); }
  figcaption { display: flex; justify-content: space-between; font-size: 8.5px; letter-spacing: .1em; color: ${INK}; border-top: 1px solid rgba(20,18,15,.3); padding-top: 8px; }
  .hint { color: #A79C86; }
</style></head><body><main>
<h1>The nine ground stacks — paper/ink</h1>
${pristine}
<h2>…and their damaged twins</h2>
${twins}
</main></body></html>`;

const file = join(OUT, 'paper-resources.html');
writeFileSync(file, html, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// …AND A SECOND PAGE THAT IS NOTHING BUT TILES, because the strip inside a card is judged next to a
// 230 px drawing of the same thing and the eye fills in what it already knows. Here the nine sit in
// a row at the size the game gives them and NOTHING ELSE IS ON THE PAGE, which is the only way to
// see whether two of them have collapsed into each other. Shoot it with a device scale factor so the
// 22 px raster is enlarged rather than re-rendered:
//   "…/Google Chrome" --headless --disable-gpu --force-device-scale-factor=5 \
//     --screenshot=<out>/tiles.png --window-size=420,380 <out>/tiles.html
const tileRow = (px, wrecked) => PAPER_RESOURCE_IDS.map((id) => {
  if (wrecked && !WRECKED[id]) return `<div class="c" style="width:${px}px;height:${px}px"></div>`;
  const svg = wrecked
    ? buildWrecked(id, { w: px, h: px, idPrefix: `x${px}-w-${id}` })
    : BUILD[id]({ w: px, h: px, idPrefix: `x${px}-${id}` });
  return `<div class="c"><svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${svg}</svg></div>`;
}).join('');
const tiles = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ground stacks at tile size</title>
<style>body{margin:0;background:${PAPER};font:6px 'Space Mono',monospace}
.r{display:flex;gap:4px;padding:4px}.c{outline:.5px solid rgba(20,18,15,.2)}
h3{font:7px 'Space Mono',monospace;margin:2px 4px;color:${INK}}</style></head><body>
<h3>pristine ${TILES.join(' / ')} px</h3>
${TILES.map((px) => `<div class="r">${tileRow(px, false)}</div>`).join('')}
<h3>damaged ${TILES.join(' / ')} px</h3>
${TILES.map((px) => `<div class="r">${tileRow(px, true)}</div>`).join('')}
</body></html>`;
writeFileSync(join(OUT, 'tiles.html'), tiles, 'utf8');

process.stdout.write(`wrote ${file}\n  and ${join(OUT, 'tiles.html')}\n`
  + `  ${PAPER_RESOURCE_IDS.length} pieces, tile strip ${TILES.join('/')} px\n`);
