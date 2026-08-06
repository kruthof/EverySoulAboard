#!/usr/bin/env node
// sketch-sheet.mjs — THE LEVEL COMPARISON, kept after the adoption as the control page.
//
// ⚠️ NOT AN EXPERIMENT ANY MORE (2026-08-05): the owner adopted `strong` catalogue-wide, so the
// builders return a TREATED fragment and this sheet asks them for the RAW one (`{ sketch: false }`).
// Without that its `original` column would be `strong` and every comparison on the page would be
// against the wrong baseline. The page is still worth keeping: it is where the four levels stand
// beside each other, and it is what the owner's next ruling on the halo would be made from.
//
// ⛔ WHY THIS EXISTS AND WHY IT IS NOT A TEST. The question the owner asked — "the furniture looks
// good, but is a bit in a different style to the pawns… let's make it a little more into that sketchy
// direction" — has no assertion. `sketch.js` could satisfy every string check in the world and still
// draw furniture that is merely NOISY rather than HAND-DRAWN, and the emitted text would be
// indistinguishable from the working case. So the treatment is PHOTOGRAPHED, at three intensities,
// beside the thing it is being matched to.
//
// ⭐ THE PAWN IS IN EVERY CELL, AT TRUE RELATIVE SCALE, AND THAT IS THE WHOLE INSTRUMENT. A fitting
// looked at alone can be judged only against memory; the owner's sentence is comparative ("a bit in a
// different style to the pawns"), so the comparison has to be IN THE PICTURE. A sheet of sketched
// furniture with no figure beside it cannot answer the question it was made for.
//
// NO HOST, NO CDP, NO MODULE LOADING IN THE PAGE — `fittings-sheet.mjs`'s rule, for its reasons.
//
// USAGE
//   node client/tools/sketch-sheet.mjs --out client/tools/shots-sketch
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/sketch-sheet.png --window-size=1500,2400 <out>/sketch-sheet.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as FT from '../src/items/fittings.js';
import { SPECS, geometryFor } from '../src/items/fittings.js';
import { TILE, PAPER, INK } from '../src/items/helpers.js';
import { pawnSprite } from '../src/render/pawn-svg.js';
import { sketch, LEVEL_IDS, LEVELS } from '../src/render/sketch.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-sketch'));
const CELL = +arg('cell', '168');
mkdirSync(OUT, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PAWN'S OWN CENTIMETRE — derived, once, and stated so it can be re-derived
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `pawnSprite` draws into a 16 × 24 viewBox with the feet at (8, 23) and the figure group scaled by
// `SPRITE_K = 0.1447`. The three BUILDS are 152 figure units from sole to crown, so a pawn's BODY is
// 152 × 0.1447 = 21.99 box units tall. Calling a crew member 170 cm gives the box unit its size in
// centimetres, and from there a pawn can be placed at ANY px-per-cm the fittings are drawn at.
//
// ⛔ THE ALTERNATIVE — eyeballing a scale that "looks about right" — IS THE ONE THING THIS SHEET MUST
// NOT DO. The whole judgement being asked for is whether a fitting and a figure belong to the same
// drawing, and a figure at the wrong size makes that judgement impossible in either direction: too
// small and every fitting looks heavy, too large and every fitting looks flimsy.
const PAWN_BODY_UNITS = 152 * 0.1447;
const PAWN_HEIGHT_CM = 170;
const CM_PER_PAWN_UNIT = PAWN_HEIGHT_CM / PAWN_BODY_UNITS;   // ≈ 7.73 cm per viewBox unit
const PAWN_FEET_UNIT = 23;

/** The five sample pieces: two furniture, one big machine, and the owner's two newest (31, 33). */
const SAMPLES = ['dining-table', 'bunk-bed', 'locker', 'capsule-sealed', 'cell-sound'];

/** The pawn who stands in every cell. ONE descriptor, so the figure is the same drawing throughout
 *  and the only thing changing across a row is the furniture. */
const PAWN = { cid: 'raghavan', role: 'hydroponics' };

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * ONE CELL: a fitting in a `side × side` box, a pawn standing beside it on the SAME floor line.
 *
 * The fitting's px-per-cm inside the box is `geometryFor(spec).k · side / TILE` — `k` is the drawing
 * scale `fittings.js` derives so a piece fills `BOX`, and `side / TILE` is the normalisation
 * `helpers.scene.render` applies on top. Both are READ from the shipped modules, never re-typed: a
 * sheet that derives the scale a second way is a sheet that can be pixel-perfect while the game draws
 * something else, which is the failure `roomzoom-sheet.mjs`'s header records.
 */
function cell(id, level, side, seedTag) {
  const g = geometryFor(SPECS[id]);
  const s = (g.k * side) / TILE;                    // px per cm, on screen, in this cell
  const floorY = side / 2 + (g.k * (g.ey / 2 + g.z0) * side) / TILE;

  const raw = FT[camel(id)]({ w: side, h: side, idPrefix: `${seedTag}-${id}-${level}`, sketch: false });
  const art = level === 'original' ? raw : sketch(raw, { level, seed: id });

  const pw = 16 * CM_PER_PAWN_UNIT * s;
  const ph = 24 * CM_PER_PAWN_UNIT * s;
  const pawnX = side + Math.max(4, side * 0.02);
  const pawnY = floorY - PAWN_FEET_UNIT * CM_PER_PAWN_UNIT * s;
  const figure = `<g transform="translate(${pawnX.toFixed(2)} ${pawnY.toFixed(2)}) `
    + `scale(${(CM_PER_PAWN_UNIT * s).toFixed(4)})">`
    + `<svg width="16" height="24" viewBox="0 0 16 24" overflow="visible">`
    + pawnSprite(PAWN, { idPrefix: `${seedTag}-p-${id}-${level}` })
    + '</svg></g>';

  const w = pawnX + pw;
  return { svg: `<svg width="${w.toFixed(0)}" height="${side}" viewBox="0 0 ${w.toFixed(2)} ${side}">`
    + art + figure
    // the floor the two of them share — drawn faintly, because an eye judging "same drawing?" needs
    // to see that they are standing on the same line and not merely near each other
    + `<path d="M0 ${floorY.toFixed(2)} L${w.toFixed(2)} ${floorY.toFixed(2)}" stroke="${INK}"`
    + ' stroke-width="0.6" opacity="0.22" fill="none"/></svg>', w, s };
}

const COLS = ['original', ...LEVEL_IDS];

const rows = SAMPLES.map((id) => {
  const spec = SPECS[id];
  const cells = COLS.map((lv) => {
    const c = cell(id, lv, CELL, 'sheet');
    return `<figure class="cell"><header>${lv}</header>${c.svg}</figure>`;
  }).join('');
  return `<section class="row"><h2>${id}<span>${spec.w} × ${spec.d} × ${spec.h} cm</span></h2>`
    + `<div class="cells">${cells}</div></section>`;
}).join('\n');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TILE STRIP — 22 / 32 / 48 px, the sizes a fitting is ACTUALLY shown at
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⛔ THIS IS THE ROW THAT DECIDES THE EXPERIMENT, not the 250-px cards. The Overview sizes furniture
// at `max(10, tileSize * 1.7)` (`ui/overview-scene.js:380`), which on the wreck's decks lands around
// 22 px, and the Room Zoom draws a piece at its true 0.95 px/cm. A treatment that is beautiful on a
// card and mud at 22 px has not made the furniture sketchier — it has made it dirtier. Every cell
// carries the pawn at the SAME px-per-cm, so the strip also answers the second half: whether the
// pawn's own hand still reads at that size, i.e. whether there is anything left to converge WITH.
const TILE_PX = [22, 32, 48];
const strip = TILE_PX.map((px) => `<div class="trow"><span class="tl">${px}px</span>${
  SAMPLES.map((id) => `<div class="tgrp"><span class="tid">${id}</span>${
    COLS.map((lv) => {
      const c = cell(id, lv, px, `t${px}`);
      return `<span class="tcell" title="${id} · ${lv} · ${px}px">${c.svg}</span>`;
    }).join('')}</div>`).join('')}</div>`).join('\n');

const CSS = `
  body{margin:0;background:#E7E0D2;font-family:'Space Mono',ui-monospace,monospace;color:${INK};padding:38px}
  h1{font-family:'Instrument Serif',ui-serif,Georgia,serif;font-size:36px;margin:0 0 2px}
  .lead{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin:0 0 26px;max-width:1180px;line-height:2}
  .row{margin:0 0 26px}
  .row h2{font-family:'Instrument Serif',ui-serif,Georgia,serif;font-size:20px;font-weight:400;margin:0 0 8px;
    display:flex;gap:14px;align-items:baseline}
  .row h2 span{font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.16em;color:#8A7F6C}
  .cells{display:flex;gap:12px;flex-wrap:nowrap}
  .cell{margin:0;background:${PAPER};border:1px solid #C6BBA2;padding:10px 12px 12px}
  .cell header{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin-bottom:4px}
  .cell svg{display:block}
  .trow{display:flex;align-items:flex-end;gap:16px;margin-bottom:20px;flex-wrap:wrap}
  .tl{font-size:10px;color:#8A7F6C;width:38px}
  .tgrp{display:flex;align-items:flex-end;gap:3px;background:${PAPER};border:1px solid #C6BBA2;padding:6px 7px 4px;position:relative}
  .tid{position:absolute;top:-13px;left:0;font-size:8px;letter-spacing:.1em;color:#A79C86}
  .tcell svg{display:block;background:${PAPER}}
  .note{background:${PAPER};border-left:3px solid #7B2C22;padding:14px 18px;font-size:11px;line-height:1.9;
    max-width:1180px;margin:0 0 30px}
`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>the sketch treatment — furniture against the pawns</title><style>${CSS}</style></head><body>
<h1>The sketch treatment</h1>
<p class="lead">original · subtle · medium · strong &nbsp;·&nbsp; every cell carries the same pawn at
true relative scale (a ${PAWN_HEIGHT_CM} cm crew member, ${CM_PER_PAWN_UNIT.toFixed(2)} cm per pawn
viewBox unit) standing on the fitting's own floor line &nbsp;·&nbsp; deterministic: seeded from the
piece id, no clock, no RNG</p>
<div class="note"><b>What each level turns on.</b>
<b>subtle</b> — corner overshoot ${LEVEL_IDS.map(() => '').join('')}0.9u, bow ≤1.6u, ramp gain 1.25×, no knockout, mechanical hatch.
<b>medium</b> — overshoot 2.0u, bow ≤3.2u, ramp 1.55×, paper knockout on the silhouette only, loosened hatch.
<b>strong</b> — overshoot 3.6u, bow ≤5.5u, ramp 1.9×, knockout everywhere, doubled silhouette, loosened hatch.
Amplitudes are in the fitting's own 128-unit drawing space, so they scale WITH the piece — which is
exactly why the tile strip at the bottom is the row that decides anything.</div>
${rows}
<h1 style="margin-top:34px">At the sizes the game actually draws them</h1>
<p class="lead">22 px is the Overview's furniture size on the wreck's decks · 32 and 48 px bracket the
Room Zoom · each group is original / subtle / medium / strong, pawn included at the same scale</p>
${strip}
</body></html>`;

writeFileSync(join(OUT, 'sketch-sheet.html'), html);

// The tile strip ALONE, on its own page — so it can be photographed at a device scale factor that
// makes a 22-px tile legible to a person without shrinking the rest of the sheet into nothing. The
// SVG is identical; only the page around it changes.
writeFileSync(join(OUT, 'sketch-tiles.html'), `<!doctype html><html><head><meta charset="utf-8">
<title>the sketch treatment at tile size</title><style>${CSS}</style></head><body>
<h1>At the sizes the game actually draws them</h1>
<p class="lead">22 px is the Overview's furniture size on the wreck's decks (max(10, tileSize·1.7),
overview-scene.js:380) · 32 and 48 px bracket the Room Zoom · each group is
${COLS.join(' / ')} — pawn included at the same scale</p>
${strip}</body></html>`);

// ⭐ THE DETERMINISM CHECK RUNS HERE TOO, not only in the node suite — because this tool is the thing
// a person actually runs, and a wobble that is stable in a unit test and unstable in the sheet would
// be discovered by a diff of two screenshots and blamed on the renderer.
let stable = true;
for (const id of SAMPLES) {
  const raw = FT[camel(id)]({ w: CELL, h: CELL, idPrefix: `chk-${id}`, sketch: false });
  for (const lv of LEVEL_IDS) {
    if (sketch(raw, { level: lv, seed: id }) !== sketch(raw, { level: lv, seed: id })) stable = false;
    if (sketch(raw, { level: lv, seed: id }) === sketch(raw, { level: lv, seed: `${id}!` })) stable = false;
  }
}
process.stdout.write(`wrote ${join(OUT, 'sketch-sheet.html')} — ${SAMPLES.length} pieces × `
  + `${COLS.length} columns + ${TILE_PX.length} tile rows · determinism (+ seed control): `
  + `${stable ? 'PASS' : 'FAIL'}\n`);
if (!stable) process.exit(3);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SHEET TWO — ONE KNOB AT A TIME
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE THREE-LEVEL SHEET ABOVE CANNOT ATTRIBUTE ANYTHING, and pretending otherwise is how a taste
// judgement gets recorded as a finding. Every level moves FIVE knobs together, so "medium looks
// right" says nothing about WHICH of overshoot, bow, pressure, knockout and hatch did the work —
// and the answer matters, because four of the five are nearly free and one of them (the knockout) is
// the expensive, destructive one. So each knob is also driven ALONE, at `medium`'s value, against a
// baseline where every other knob is off.
//
// This is the same discipline the repo applies to a pin move: a 2×2, driven, rather than a claim.

/** `medium`, with everything off except the named knob. */
const OFF = Object.freeze({
  label: 'off', overshoot: 0, wave: 0, waveMax: 0, lump: 0,
  ramp: 1, silBoost: 1, interior: 1, haloWiden: 0, haloScope: 'none', doubles: false, hatch: false,
  ground: false, interiorOvershoot: 1,
});
const M = LEVELS.medium;
const KNOBS = [
  ['original', null],
  ['caps only', { ...OFF }],
  ['+ overshoot (flat)', { ...OFF, overshoot: M.overshoot, interiorOvershoot: 1 }],
  ['+ overshoot (silhouette only)', { ...OFF, overshoot: M.overshoot, interiorOvershoot: M.interiorOvershoot }],
  ['+ bow', { ...OFF, wave: M.wave, waveMax: M.waveMax, lump: M.lump }],
  ['+ pressure', { ...OFF, ramp: M.ramp, silBoost: M.silBoost, interior: M.interior }],
  ['+ knockout', { ...OFF, haloWiden: M.haloWiden, haloScope: M.haloScope }],
  ['+ hatch', { ...OFF, hatch: true }],
  ['+ ground rule', { ...OFF, ground: true }],
  ['ALL (= medium)', M],
  ['HAND (no knockout)', LEVELS.hand],
];

const KCELL = +arg('kcell', '250');
const KPIECES = ['dining-table', 'locker'];

function knobCell(id, label, lvl, side) {
  const g = geometryFor(SPECS[id]);
  const s = (g.k * side) / TILE;
  const floorY = side / 2 + (g.k * (g.ey / 2 + g.z0) * side) / TILE;
  const raw = FT[camel(id)]({ w: side, h: side, idPrefix: `k-${id}-${label.replace(/\W/g, '')}`, sketch: false });
  const art = lvl ? sketch(raw, { level: lvl, seed: id }) : raw;
  const pawnX = side + 4;
  const pawnY = floorY - PAWN_FEET_UNIT * CM_PER_PAWN_UNIT * s;
  const w = pawnX + 16 * CM_PER_PAWN_UNIT * s;
  return `<figure class="cell"><header>${label}</header>`
    + `<svg width="${w.toFixed(0)}" height="${side}" viewBox="0 0 ${w.toFixed(2)} ${side}">${art}`
    + `<g transform="translate(${pawnX.toFixed(2)} ${pawnY.toFixed(2)}) scale(${(CM_PER_PAWN_UNIT * s).toFixed(4)})">`
    + `<svg width="16" height="24" viewBox="0 0 16 24" overflow="visible">`
    + pawnSprite(PAWN, { idPrefix: `kp-${id}-${label.replace(/\W/g, '')}` })
    + `</svg></g><path d="M0 ${floorY.toFixed(2)} L${w.toFixed(2)} ${floorY.toFixed(2)}" stroke="${INK}"`
    + ' stroke-width="0.6" opacity="0.22" fill="none"/></svg></figure>';
}

const knobHtml = `<!doctype html><html><head><meta charset="utf-8">
<title>the sketch treatment — one knob at a time</title><style>${CSS}
  .cells{flex-wrap:wrap}
</style></head><body>
<h1>One knob at a time</h1>
<p class="lead">every cell is <b>medium</b>'s value for ONE knob with the other four OFF · the last
cell is all five together · "caps only" is round linecaps and linejoins and nothing else — the
cheapest possible change, and the control that says whether the rest of the treatment is doing
anything at all</p>
${KPIECES.map((id) => `<section class="row"><h2>${id}<span>${SPECS[id].w} × ${SPECS[id].d} × ${SPECS[id].h} cm</span></h2>`
  + `<div class="cells">${KNOBS.map(([label, lvl]) => knobCell(id, label, lvl, KCELL)).join('')}</div></section>`).join('\n')}
</body></html>`;
writeFileSync(join(OUT, 'sketch-knobs.html'), knobHtml);
process.stdout.write(`wrote ${join(OUT, 'sketch-knobs.html')} — ${KPIECES.length} pieces × ${KNOBS.length} knob columns\n`);
