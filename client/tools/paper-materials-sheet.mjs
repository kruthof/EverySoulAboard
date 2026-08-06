#!/usr/bin/env node
// paper-materials-sheet.mjs — PUT THE TWELVE MATERIALS ON ONE PAGE, so they can be looked at.
//
// ⚠️ WHY, and why a green node suite is not a substitute. Every assertion in
// `client/test/paper-materials.test.js` reads a STRING: that a pitch is 20 cm, that ink covers the
// tile, that a pattern id resolves locally. None of that is a picture. A skin can satisfy all of it
// and still be illegible under the floor plane's shear, or read as the same material as its
// neighbour, or drown a room in line work — and the emitted text is byte-identical to the working
// case. `roomzoom-sheet.mjs`'s header records the same argument for the cutaway.
//
// NO HOST, NO CDP, NO MODULE LOADING IN THE PAGE — the sheet family's rule: `file://` refuses ES
// imports, so the SVG is generated HERE by the SHIPPED builders and inlined.
//
// ⛔ THE SHEARED AND SLAB ROWS GO THROUGH `roomzoom-view.js materialLayerSvg` AND
// `room-model.js scenePlacement`, NOT THROUGH A COPY. That is the whole point of the two lower
// blocks: the flat row says what was drawn, and those two say what the player will actually see —
// a floor pushed through `matrix(1 0 0.4 −0.6 …)` and a wall standing on its oblique slab. A
// re-derivation here would let the page be right while the surface was wrong.
//
// USAGE
//   node client/tools/paper-materials-sheet.mjs --out client/tools/shots-paper-materials
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/paper-materials-sheet.png --window-size=1700,2500 \
//     <out>/paper-materials-sheet.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildItem } from '../src/items/index.js';
import { MATERIAL_IDS, SPECS, SIZES } from '../src/items/paper-materials.js';
import { WALL_MATERIALS, FLOOR_MATERIALS } from '../src/ui/build-material-model.js';
import { roomScene, scenePlacement, roomCutawaySvg, roomHatchDef, M_PER_TILE } from '../src/ui/room-model.js';
import { materialLayerSvg } from '../src/ui/roomzoom-view.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-paper-materials'));
mkdirSync(OUT, { recursive: true });

const LABEL = new Map([...WALL_MATERIALS, ...FLOOR_MATERIALS].map((m) => [m.id, m.label]));
const WALLS = MATERIAL_IDS.filter((id) => SPECS[id].surface === 'wall');
const FLOORS = MATERIAL_IDS.filter((id) => SPECS[id].surface === 'floor');

/** One flat swatch at the piece's own proportion, 1.9 px/cm — big enough to judge line weight. */
function flat(id) {
  const sp = SPECS[id];
  const k = 1.9;
  const w = Math.round(k * sp.w);
  const h = Math.round(k * sp.h);
  return (
    `<figure><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"` +
    ' xmlns="http://www.w3.org/2000/svg">' +
    buildItem(id, { w, h, idPrefix: 'flat-' + id }) +
    `</svg><figcaption>${LABEL.get(id)}<span>${sp.w} × ${sp.h} cm · size ${SIZES[id].w}×${SIZES[id].h}` +
    '</span></figcaption></figure>'
  );
}

/** The palette's own 26 px chip, at 4× so a reader can see what it resolves to. */
function chip(id) {
  return (
    `<figure class="chip"><svg viewBox="0 0 26 26" width="104" height="104"` +
    ' xmlns="http://www.w3.org/2000/svg">' +
    buildItem(id, { w: 26, h: 26, idPrefix: 'chip-' + id }) +
    `</svg><figcaption>${LABEL.get(id)}<span>palette chip, 26 px @4×</span></figcaption></figure>`
  );
}

/**
 * A 3 × 3 patch of ROOM, through the shipping layer: the cutaway, then `materialLayerSvg` fed the
 * tile list `roomMaterialTiles` would produce. `kind:'floor'` tiles are laid sheared through
 * `place.cell`; `kind:'wall'` tiles stand on their slab.
 */
function patch(id, kind) {
  const focus = { deck: 0, rx: 0, ry: 0, rw: kind === 'wall' ? 5 : 3, rh: 3, anchor: 'x' };
  const scene = roomScene(focus);
  const unit = scene.s * 100 * M_PER_TILE;
  const place = scenePlacement(scene, focus, unit);
  const mat = (kind === 'wall' ? WALL_MATERIALS : FLOOR_MATERIALS).find((m) => m.id === id).mat;
  const tiles = [];
  if (kind === 'floor') {
    for (let ty = 0; ty < 3; ty += 1) for (let tx = 0; tx < 3; tx += 1) tiles.push({ tx, ty, kind, mat });
  } else {
    // interior partitions only — the hull filter drops anything on the room's own ring
    for (const tx of [1, 2, 3]) tiles.push({ tx, ty: 1, kind, mat });
  }
  // `materialLayerSvg` reads `_focus` from module state, so mount it the way the surface does.
  const body = roomHatchDef() + roomCutawaySvg(scene, { vacuum: false })
    + materialLayerSvg(tiles, place);
  return (
    `<figure class="patch"><svg viewBox="${scene.viewBoxAttr}" width="440"` +
    ' xmlns="http://www.w3.org/2000/svg">' + body +
    `</svg><figcaption>${LABEL.get(id)}<span>${kind === 'floor'
      ? 'laid SHEARED through place.cell — 3 × 3 m'
      : 'standing on its 1 × 2.4 m slab'}</span></figcaption></figure>`
  );
}

const CSS = `
:root { color-scheme: light; }
body { margin: 0; background: #F4EFE2; color: #14120F;
  font-family: -apple-system, "Helvetica Neue", sans-serif; padding: 40px 44px 60px; }
h1 { font-size: 30px; font-weight: 500; margin: 0 0 4px; letter-spacing: -.01em; }
p.sub { margin: 0 0 34px; color: #6B6252; font-size: 13px; max-width: 80ch; line-height: 1.5; }
h2 { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #8A7F6C;
  border-top: 1px solid #D6CDB8; padding-top: 12px; margin: 40px 0 18px; font-weight: 600; }
.row { display: flex; flex-wrap: wrap; gap: 26px; align-items: flex-end; }
figure { margin: 0; }
figure svg { display: block; background: #EBE4D1; border: 1px solid #D6CDB8; }
figcaption { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #14120F;
  margin-top: 7px; }
figcaption span { display: block; text-transform: none; letter-spacing: 0; color: #8A7F6C;
  font-size: 10px; margin-top: 2px; }
.chip svg { image-rendering: auto; }
.patch svg { background: #EBE4D1; }
`;

const html =
  '<!doctype html><meta charset="utf-8"><title>Perilune · paper materials</title>' +
  `<style>${CSS}</style><body>` +
  '<h1>The twelve materials, on paper</h1>' +
  '<p class="sub">Six walls (1 × 2.4 m) and six floors (1 × 1 m), drawn at one centimetre rule. ' +
  'Row 1 is each skin flat at its own proportion. Row 2 is the palette chip the player picks from. ' +
  'Rows 3 and 4 are the shipping surface: floors laid sheared into the floor plane through ' +
  '<code>scenePlacement().cell()</code>, walls standing on the oblique slab — both drawn by ' +
  '<code>roomzoom-view.js materialLayerSvg</code> itself, not by a copy of it.</p>' +
  '<h2>Walls — flat, 1 × 2.4 m</h2><div class="row">' + WALLS.map(flat).join('') + '</div>' +
  '<h2>Floors — flat, 1 × 1 m</h2><div class="row">' + FLOORS.map(flat).join('') + '</div>' +
  '<h2>Palette chips (26 px, shown at 4×)</h2><div class="row">' +
  MATERIAL_IDS.map(chip).join('') + '</div>' +
  '<h2>Floors as the room lays them — SHEARED, 3 × 3 m</h2><div class="row">' +
  FLOORS.map((id) => patch(id, 'floor')).join('') + '</div>' +
  '<h2>Walls as the room stands them — three interior partitions</h2><div class="row">' +
  WALLS.map((id) => patch(id, 'wall')).join('') + '</div>' +
  '</body>';

const out = resolve(OUT, 'paper-materials-sheet.html');
writeFileSync(out, html);
process.stdout.write(out + '\n');
