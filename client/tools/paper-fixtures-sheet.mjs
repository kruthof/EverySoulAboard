#!/usr/bin/env node
// paper-fixtures-sheet.mjs — RENDER THE FOURTEEN PAPER FIXTURES ONTO ONE PAGE, so they can be
// looked at. Sibling of `client/tools/fittings-sheet.mjs`, same shape, same reason.
//
// ⚠️ WHY THIS EXISTS. `client/test/paper-fixtures.test.js` proves things about STRINGS: that every
// ellipse is level, that no member is buried under a later opaque face, that the accent is spent on
// exactly two hazards. None of that is a picture. A builder can satisfy every one of those and still
// draw a door whose proportions are wrong or whose ink dissolves at the 22 px the Overview actually
// shows a piece at — and the emitted text is indistinguishable from the working case. This repo's
// standing rule is that invisible feedback is broken feedback, so the set is also PHOTOGRAPHED.
//
// NO HOST, NO CDP, NO MODULE LOADING IN THE PAGE: the SVG is generated here, in node, and inlined —
// `file://` refuses ES-module imports, and a tool that needs a running game to draw a door is a tool
// nobody runs twice.
//
// USAGE
//   node client/tools/paper-fixtures-sheet.mjs --out client/tools/shots-paper-fixtures
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/sheet.png --window-size=1520,1800 <out>/paper-fixtures-sheet.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SPECS, FIXTURE_IDS, SIZES, STUB_PLANE } from '../src/items/paper-fixtures.js';
import * as PF from '../src/items/paper-fixtures.js';
import { PAPER, INK } from '../src/items/helpers.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-paper-fixtures'));
const CELL = +arg('cell', '240');
mkdirSync(OUT, { recursive: true });

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const NUM = new Map(FIXTURE_IDS.map((id, i) => [id, String(i + 1).padStart(2, '0')]));

/**
 * The dimension line the design document's footer asks for — THE OBJECT, plus where it is fixed.
 *
 * ⛔ IT IS `SPECS[id].dim`, READ, NOT COMPUTED FROM `w × d × h` AND `z0`. That is what this function
 * used to do and it was wrong on ten of the eleven rows that carry a `z0`, on the one artifact the
 * set is judged from: `w × d × h` is the PICTURE's box — it holds the wall stub, the frame and the light
 * spill — and `z0` is the lowest z the DRAWING puts ink at, which for a hung piece is below the
 * fitting. A 240 × 14 × 14 conduit tray hung at 220 cm captioned "264 × 26 × 248 CM, HUNG 204".
 *
 * ⛔ AND IT IS NOT RE-TYPED HERE EITHER. A table of true dimensions in this tool would be a second
 * source of truth that no test and no render can contradict; the string lives beside the painter
 * whose numbers it describes, and this tool prints it.
 */
function dimensionLine(id) {
  const s = SPECS[id];
  const plane = STUB_PLANE[id];
  if (!plane) return `${s.dim} · TAKES FLOOR`;
  // The two doors stand ON the deck inside a bulkhead — no `z0`, so no mounting height to give.
  if (s.z0 == null) return `${s.dim} · IN A ${plane === 'over' ? 'DECKHEAD' : 'BULKHEAD'}`;
  return s.dim;
}

/** The drawing's own box, kept in the hint beside `size` — it is real, it is just not the object. */
const boxLine = (id) => {
  const s = SPECS[id];
  return s.round ? `box ∅${s.w} × ${s.h}` : `box ${s.w}×${s.d}×${s.h}`;
};

const cards = FIXTURE_IDS.map((id) => {
  const svg = PF[camel(id)]({ w: CELL, h: CELL, idPrefix: `sheet-${id}`, state: 'on' });
  return `<figure class="card">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${id}</span></header>
  <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${svg}</svg>
  <figcaption><span class="dim">${dimensionLine(id)}</span><span class="hint">${boxLine(id)} · size ${SIZES[id].w}×${SIZES[id].h}</span></figcaption>
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
  /* ⚠️ STACKED, NOT justify-between. The dimension line is now the OBJECT's and runs to ~55
     characters on the doors; side by side with the box hint the two spans interleaved and the
     caption read as one scrambled number. The line that answers "what is this fitting" gets the
     card's full width; the picture's own box and size hint sit under it, muted. */
  figcaption { display: flex; flex-direction: column; gap: 3px; font-size: 8.5px; line-height: 1.45; letter-spacing: .08em; color: ${INK}; border-top: 1px solid rgba(20,18,15,.3); padding-top: 8px; }
  .dim { font-weight: 700; }
  .hint { color: #A79C86; }`;

writeFileSync(join(OUT, 'paper-fixtures-sheet.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Perilune paper fixtures</title>
<style>${CSS}</style></head><body><main><h1>The ship's architecture — paper/ink (lane/paper-fixtures)</h1>
${cards}
</main></body></html>`);
console.log('wrote', join(OUT, 'paper-fixtures-sheet.html'), '·', FIXTURE_IDS.length, 'fixtures');

// ── the UNPOWERED sheet ──────────────────────────────────────────────────────────────────────
// Ten of the fourteen have a lit part, and a wreck boots with every one of them dark. A piece that
// only reads when it is powered is a piece the player never sees on day one.
const dark = FIXTURE_IDS.map((id) => `<figure class="card">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${id}</span><span class="hint">OFF</span></header>
  <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${
  PF[camel(id)]({ w: CELL, h: CELL, idPrefix: `dark-${id}`, state: 'off' })}</svg>
</figure>`).join('\n');
writeFileSync(join(OUT, 'paper-fixtures-dark.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>paper fixtures, unpowered</title>
<style>${CSS}</style></head><body><main><h1>Unpowered — the state a wreck boots in</h1>
${dark}</main></body></html>`);
console.log('wrote', join(OUT, 'paper-fixtures-dark.html'));

// ── TILE SIZES ───────────────────────────────────────────────────────────────────────────────
// ⚠️ 22 IS THE ROW THAT MATTERS. The Overview sizes furniture at `max(10, tileSize * 1.7)`
// (`ui/overview-scene.js`), and on the wreck's decks that lands around ~22 px per piece. That is the
// SMALLEST size any of these is actually shown at in the shipping game.
const tiles = [22, 32, 48, 72].map((px) => `<div class="row"><span>${px}px</span>${
  FIXTURE_IDS.map((id) => `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" title="${id}">${
    PF[camel(id)]({ w: px, h: px, idPrefix: `t${px}-${id}`, state: 'on' })}</svg>`).join('')}</div>`).join('\n');
writeFileSync(join(OUT, 'paper-fixtures-tiles.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>paper fixtures at tile size</title><style>
  body { margin:0; background:#E7E0D2; font-family:'Space Mono',monospace; padding:24px; }
  .row { display:flex; align-items:center; gap:6px; margin-bottom:18px; flex-wrap:wrap; }
  .row > span { width:44px; font-size:10px; color:#8A7F6C; }
  svg { background:${PAPER}; outline:1px solid #CFC3A9; }
</style></head><body>${tiles}</body></html>`);
console.log('wrote', join(OUT, 'paper-fixtures-tiles.html'));

// ── THE TWINS ────────────────────────────────────────────────────────────────────────────────
// Each twin beside its pristine piece. A twin that no longer reads as the same object is the one
// failure `wrecked.test.js` cannot see: its join is by itemId, and a wrong drawing keyed correctly
// is still a wrong drawing.
const { buildWrecked, wreckedState } = await import('../src/items/wrecked.js');
const pairs = FIXTURE_IDS.map((id) => `<figure class="card wide">
  <header><span class="n">${NUM.get(id)}</span><span class="name">${id}</span>
    <span class="hint">${wreckedState(id)}</span></header>
  <div class="pair">
    <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${
  PF[camel(id)]({ w: CELL, h: CELL, idPrefix: `pr-${id}`, state: 'on' })}</svg>
    <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${
  buildWrecked(id, { w: CELL, h: CELL, idPrefix: `wr-${id}` })}</svg>
  </div>
</figure>`).join('\n');
writeFileSync(join(OUT, 'paper-fixtures-twins.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>the fourteen twins</title><style>
  body { margin:0; background:#E7E0D2; font-family:'Space Mono',monospace; }
  main { padding:32px; display:flex; flex-wrap:wrap; gap:16px; }
  .card { margin:0; background:${PAPER}; border:1px solid #C6BBA2; padding:12px; }
  .card header { display:flex; gap:8px; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#8A8272; }
  .card .name { color:${INK}; }
  .hint { margin-left:auto; color:#7B2C22; }
  .pair { display:flex; gap:8px; }
</style></head><body><main>${pairs}</main></body></html>`);
console.log('wrote', join(OUT, 'paper-fixtures-twins.html'));
