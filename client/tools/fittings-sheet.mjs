#!/usr/bin/env node
// fittings-sheet.mjs — RENDER THE THIRTY-FOUR FITTINGS ONTO ONE PAGE, so they can be looked at.
//
// ⚠️ IT ENUMERATES `FITTING_IDS`, SO THE SECTION THE OWNER ADDED ON 2026-08-05 (31–34, capsules and
// cells) ARRIVES HERE BY EXISTING. Nothing below names a count; the window sizes in the USAGE lines
// were re-measured for thirty-four cards.
//
// ⚠️ WHY THIS EXISTS. `client/test/fittings.test.js` proves things about STRINGS: that a hoop is a
// half-arc, that a member's two ends meet, that no raw hex escapes the seam. None of that is a
// picture. A builder can satisfy every one of those assertions and still draw a fitting whose
// proportions are wrong, whose ink is too fine to survive downscaling, or whose parts overlap into
// mush — and the emitted text is indistinguishable from the working case. This repo's standing rule
// is that invisible feedback is broken feedback, so the set is also PHOTOGRAPHED and compared
// against `design-import/Perilune Fittings.dc.html` by eye.
//
// NO HOST, NO CDP, NO MODULE LOADING IN THE PAGE: the SVG is generated here, in node, and inlined —
// `file://` refuses ES-module imports, and a tool that needs a running game to draw a chair is a
// tool nobody runs twice.
//
// USAGE
//   node client/tools/fittings-sheet.mjs --out client/tools/shots-fittings
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/fittings-sheet.png --window-size=1520,3800 <out>/fittings-sheet.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SPECS, FITTING_IDS, SIZES } from '../src/items/fittings.js';
import * as FT from '../src/items/fittings.js';
import { PAPER, INK } from '../src/items/helpers.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-fittings'));
const CELL = +arg('cell', '240');
mkdirSync(OUT, { recursive: true });

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const NUM = new Map(FITTING_IDS.map((id, i) => [id, String(i + 1).padStart(2, '0')]));

const cards = FITTING_IDS.map((id) => {
  const spec = SPECS[id];
  const svg = FT[camel(id)]({ w: CELL, h: CELL, idPrefix: `sheet-${id}` });
  const dim = spec.round ? `∅ ${spec.w} × ${spec.h} CM` : `${spec.w} × ${spec.d} × ${spec.h} CM`;
  return `<figure class="card">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${id}</span></header>
  <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${svg}</svg>
  <figcaption><span>${dim}</span><span class="hint">size ${SIZES[id].w}×${SIZES[id].h}</span></figcaption>
</figure>`;
}).join('\n');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Perilune fittings — paper/ink port</title>
<style>
  body { margin: 0; background: #E7E0D2; font-family: 'Space Mono', monospace; }
  main { padding: 40px; display: flex; flex-wrap: wrap; gap: 18px; }
  h1 { width: 100%; font-family: 'Instrument Serif', serif; font-size: 34px; color: #241E17; margin: 0 0 6px; }
  .card { margin: 0; width: ${CELL + 36}px; background: ${PAPER}; border: 1px solid #C6BBA2; padding: 14px; box-sizing: border-box; }
  .card header { display: flex; gap: 8px; align-items: baseline; font-size: 10px; letter-spacing: .16em; color: #8A8272; text-transform: uppercase; }
  .card .name { color: ${INK}; letter-spacing: .1em; }
  .card svg { display: block; margin: 6px 0; }
  figcaption { display: flex; justify-content: space-between; font-size: 8.5px; letter-spacing: .1em; color: ${INK}; border-top: 1px solid rgba(20,18,15,.3); padding-top: 8px; }
  .hint { color: #A79C86; }
</style></head><body><main><h1>Everything you can build — paper/ink port (P2)</h1>
${cards}
</main></body></html>`;

writeFileSync(join(OUT, 'fittings-sheet.html'), html);
console.log('wrote', join(OUT, 'fittings-sheet.html'), '·', FITTING_IDS.length, 'fittings');

// A second sheet at TILE SIZE — the size a fitting is actually shown at in the Room Zoom. A piece
// that reads on a 240-px card and dissolves at 48 px is a piece that does not work in the game.
//
// ⚠️ 22 IS THE ROW THAT MATTERS AND IT WAS MISSING. The Overview sizes furniture at
// `max(10, tileSize * 1.7)` (`ui/overview-scene.js:380`), and `tileSize` is `min(KX, KY)` fitted to
// the deck's extent — on the wreck's decks that lands around 13, i.e. ~22 px per piece. That is the
// SMALLEST size any of these thirty-four is actually shown at in the shipping game, and a sheet whose
// finest row was 32 px was flattering every one of them by about half again.
const tiles = [22, 32, 48, 72].map((px) => `<div class="row"><span>${px}px</span>${
  FITTING_IDS.map((id) => `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" title="${id}">${
    FT[camel(id)]({ w: px, h: px, idPrefix: `t${px}-${id}` })}</svg>`).join('')}</div>`).join('\n');
writeFileSync(join(OUT, 'fittings-tiles.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>fittings at tile size</title><style>
  body { margin:0; background:#E7E0D2; font-family:'Space Mono',monospace; padding:24px; }
  .row { display:flex; align-items:center; gap:4px; margin-bottom:18px; flex-wrap:wrap; }
  .row > span { width:44px; font-size:10px; color:#8A7F6C; }
  svg { background:${PAPER}; outline:1px solid #CFC3A9; }
</style></head><body>${tiles}</body></html>`);
console.log('wrote', join(OUT, 'fittings-tiles.html'));

// A third sheet — the NINE repo-authored post-raid twins, beside their pristine pieces. A twin that
// no longer reads as the same object is the one failure `client/test/wrecked.test.js` cannot see: its
// join is by itemId, and a wrong drawing keyed correctly is still a wrong drawing.
const { buildWrecked, NON_MOCK_TWIN, wreckedState } = await import('../src/items/wrecked.js');
// ⚠️ FILTERED TO THIS CATALOGUE — `NON_MOCK_TWIN` is the repo-authored ledger for ALL FOUR paper
// catalogues now (paper-resources, paper-fixtures and machines each added their rows to it), and
// this sheet draws its pristine column with `FT[camel(id)]`. Unfiltered it threw
// `FT[camel(...)] is not a function` on the first non-fitting row — a tool broken by a clean
// auto-merge, found by running it (TRAPS 8th shape, in a tool).
const pairs = Object.keys(NON_MOCK_TWIN).filter((id) => typeof FT[camel(id)] === 'function')
  .map((id) => `<figure class="card">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${id}</span>
    <span class="hint">${wreckedState(id)}</span></header>
  <div class="pair">
    <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${
  FT[camel(id)]({ w: CELL, h: CELL, idPrefix: `pr-${id}` })}</svg>
    <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${
  buildWrecked(id, { w: CELL, h: CELL, idPrefix: `wr-${id}` })}</svg>
  </div>
</figure>`).join('\n');
writeFileSync(join(OUT, 'fittings-twins.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>the nine repo-authored twins</title><style>
  body { margin:0; background:#E7E0D2; font-family:'Space Mono',monospace; }
  main { padding:32px; display:flex; flex-wrap:wrap; gap:16px; }
  .card { margin:0; background:${PAPER}; border:1px solid #C6BBA2; padding:12px; }
  .card header { display:flex; gap:8px; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#8A8272; }
  .card .name { color:${INK}; }
  .hint { margin-left:auto; color:#7B2C22; }
  .pair { display:flex; gap:8px; }
</style></head><body><main>${pairs}</main></body></html>`);
console.log('wrote', join(OUT, 'fittings-twins.html'));
