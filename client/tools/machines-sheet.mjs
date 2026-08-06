#!/usr/bin/env node
// machines-sheet.mjs — RENDER THE THIRTEEN PAPER MACHINES ONTO ONE PAGE, so they can be looked at.
//
// ⚠️ WHY THIS EXISTS, and why it is a SIBLING of `fittings-sheet.mjs` rather than a flag on it.
// `client/test/machines.test.js` proves things about STRINGS: that a hoop is a half-arc, that a pad
// draws below the body it holds up, that no raw hex escapes the seam. None of that is a picture. A
// builder can satisfy every one of those assertions and still draw a machine whose proportions are
// wrong, whose ink dissolves at 22 px, or whose parts overlap into mush — and the emitted text is
// indistinguishable from the working case. This repo's standing rule is that the OWNER JUDGES ART
// FROM SCREENSHOTS, so the set is photographed.
//
// The thirteen have NO CATALOGUE CARD to diff against (see `client/src/items/machines.js`'s header),
// which makes the picture the ONLY authority on whether a reactor reads as a reactor. That is why the
// sheet prints the SPECS beside each piece and why the tile strip goes down to 22 px — the size the
// Overview actually draws furniture at on the wreck's decks.
//
// NO HOST, NO CDP, NO MODULE LOADING IN THE PAGE: the SVG is generated here, in node, and inlined.
//
// USAGE
//   node client/tools/machines-sheet.mjs --out client/tools/shots-machines
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/machines-sheet.png --window-size=1520,2400 <out>/machines-sheet.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SPECS, MACHINE_IDS, SIZES } from '../src/items/machines.js';
import * as MC from '../src/items/machines.js';
import { PAPER, INK } from '../src/items/helpers.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-machines'));
const CELL = +arg('cell', '240');
mkdirSync(OUT, { recursive: true });

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const NUM = new Map(MACHINE_IDS.map((id, i) => [id, 'M' + String(i + 1).padStart(2, '0')]));

const cards = MACHINE_IDS.map((id) => {
  const spec = SPECS[id];
  const svg = MC[camel(id)]({ w: CELL, h: CELL, idPrefix: `sheet-${id}` });
  const dim = spec.round ? `∅ ${spec.w} × ${spec.h} CM` : `${spec.w} × ${spec.d} × ${spec.h} CM`;
  return `<figure class="card">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${id}</span></header>
  <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${svg}</svg>
  <figcaption><span>${dim}</span><span class="hint">size ${SIZES[id].w}×${SIZES[id].h}</span></figcaption>
</figure>`;
}).join('\n');

const CSS = `
  body { margin: 0; background: #E7E0D2; font-family: 'Space Mono', monospace; }
  main { padding: 40px; display: flex; flex-wrap: wrap; gap: 18px; }
  h1 { width: 100%; font-family: 'Instrument Serif', serif; font-size: 34px; color: #241E17; margin: 0 0 6px; }
  .card { margin: 0; width: ${CELL + 36}px; background: ${PAPER}; border: 1px solid #C6BBA2; padding: 14px; box-sizing: border-box; }
  .card header { display: flex; gap: 8px; align-items: baseline; font-size: 10px; letter-spacing: .16em; color: #8A8272; text-transform: uppercase; }
  .card .name { color: ${INK}; letter-spacing: .1em; }
  .card svg { display: block; margin: 6px 0; }
  figcaption { display: flex; justify-content: space-between; font-size: 8.5px; letter-spacing: .1em; color: ${INK}; border-top: 1px solid rgba(20,18,15,.3); padding-top: 8px; }
  .hint { color: #A79C86; }`;

writeFileSync(join(OUT, 'machines-sheet.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Perilune machines — paper/ink</title>
<style>${CSS}</style></head><body><main><h1>The ship's own plant — paper/ink (paper-machines)</h1>
${cards}
</main></body></html>`);
console.log('wrote', join(OUT, 'machines-sheet.html'), '·', MACHINE_IDS.length, 'machines');

// A second sheet at TILE SIZE — the size a machine is actually shown at in the game. 22 px is the
// row that matters: the Overview sizes furniture at `max(10, tileSize * 1.7)`
// (`ui/overview-scene.js:380`), and on the wreck's decks `tileSize` lands around 13.
const tiles = [22, 32, 48, 72].map((px) => `<div class="row"><span>${px}px</span>${
  MACHINE_IDS.map((id) => `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" title="${id}">${
    MC[camel(id)]({ w: px, h: px, idPrefix: `t${px}-${id}` })}</svg>`).join('')}</div>`).join('\n');
writeFileSync(join(OUT, 'machines-tiles.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>machines at tile size</title><style>
  body { margin:0; background:#E7E0D2; font-family:'Space Mono',monospace; padding:24px; }
  .row { display:flex; align-items:center; gap:4px; margin-bottom:18px; flex-wrap:wrap; }
  .row > span { width:44px; font-size:10px; color:#8A7F6C; }
  svg { background:${PAPER}; outline:1px solid #CFC3A9; }
</style></head><body>${tiles}</body></html>`);
console.log('wrote', join(OUT, 'machines-tiles.html'));

// A third sheet — the thirteen post-raid twins, each beside its pristine piece. A twin that no longer
// reads as the same object is the one failure `client/test/wrecked.test.js` cannot see: its join is
// by itemId, and a wrong drawing keyed correctly is still a wrong drawing.
const { buildWrecked, wreckedState } = await import('../src/items/wrecked.js');
const pairs = MACHINE_IDS.map((id) => `<figure class="card wide">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${id}</span>
    <span class="hint">${wreckedState(id)}</span></header>
  <div class="pair">
    <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${
  MC[camel(id)]({ w: CELL, h: CELL, idPrefix: `pr-${id}` })}</svg>
    <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${
  buildWrecked(id, { w: CELL, h: CELL, idPrefix: `wr-${id}` })}</svg>
  </div>
</figure>`).join('\n');
writeFileSync(join(OUT, 'machines-twins.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>the thirteen machine twins</title><style>${CSS}
  .card.wide { width: ${CELL * 2 + 44}px; }
  .hint { margin-left:auto; color:#7B2C22; }
  .pair { display:flex; gap:8px; }
</style></head><body><main>${pairs}</main></body></html>`);
console.log('wrote', join(OUT, 'machines-twins.html'));

// ⛔ THE FOURTH SHEET IS RETIRED — lane/warm-purge, 2026-08-06. It was
// `machines-before-after.html`: *"EACH NEW PIECE BESIDE THE WARM ROW IT REPLACES, which is the
// comparison the owner asked for ('replace the old ones') and the one no other sheet in this repo
// makes."* It drove a `REPLACES` map — `'reactor-plant': 'reactor'`, `'solar-wing': 'solar-panel'`,
// … `'sleeper-pod': 'cryopod'` — through `buildItem` for the warm half.
//
// ⚠️ ITS WARM COLUMN CEASED TO EXIST, AND IT WOULD NOT HAVE FAILED LOUDLY. All thirteen warm rows
// were retired with `client/src/items/objects.js`, and `buildItem` is TOLERANT — an unknown id
// returns the neutral `?` placeholder rather than throwing. So this sheet would have gone on
// rendering, with a column of thirteen question marks, and read as a rendering bug rather than as a
// missing input. A tool that draws a comparison it cannot make is worse than one that refuses.
//
// ⇒ THE COMPARISON IS NOT LOST. `client/tools/warm-purge-sheet.mjs` makes it, for the whole set
// rather than for thirteen rows, and it REFUSES to draw the before/after column without a capture
// taken from a checkout of the pre-purge tree (`--capture` there, then `--before <file>`). That is
// the same picture with the missing input made explicit.
