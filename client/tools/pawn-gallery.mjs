#!/usr/bin/env node
// pawn-gallery.mjs — render the ink figures at every scale they ship at, and photograph them.
//
// ⚠️ WHY: `pawn-svg.js` is a pure string builder, so every test in the suite reads a STRING. A
// perfectly formed two-pass figure is still a failure if the knockout eats the ink at board scale,
// if a prop pokes out of the chip's well, or if a stature difference is invisible. The emitted bytes
// are identical in the legible and the illegible case. This tool is the only thing that can tell
// them apart, and it is the "invisible feedback is FUNCTIONAL" rule (BINDING 2026-07-26) applied to
// art that no host has to be running to draw.
//
// It writes ONE self-contained page — the eight mock crew as chips (16×20), as board sprites over a
// hatched floor and a starfield (the two grounds the knockout has to survive), and at 4× zoom — then
// drives real Chrome to screenshot it.
//
// USAGE   node client/tools/pawn-gallery.mjs --out client/tools/shots-pawns

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

import { pawnSprite, pawnChip, MOCK_CREW, resolvePawnLook } from '../src/render/pawn-svg.js';
import { fhDef, fhRef } from '../src/render/oblique.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-pawns'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

/** One row of sprites at pixel height `h`, on a given background fragment. */
function spriteRow(h, bg, label) {
  const S = h / 24;
  const w = MOCK_CREW.length * h * 0.9 + 40;
  const cells = MOCK_CREW.map((c, i) => {
    const fx = 30 + i * h * 0.9, fy = h + 8;
    return `<g transform="translate(${fx - 8 * S} ${fy - 23 * S}) scale(${S})">${
      pawnSprite({ cid: c.cid, role: c.role })}</g>`;
  }).join('');
  return `<div class="row"><div class="lbl">${label}</div>`
    + `<svg width="${w}" height="${h + 20}" viewBox="0 0 ${w} ${h + 20}">`
    + `<defs>${fhDef('g')}</defs>${bg(w, h + 20)}${cells}</svg></div>`;
}

const paperBg = (w, h) => `<rect width="${w}" height="${h}" fill="#EBE4D1"/>`;
const hatchBg = (w, h) => `<rect width="${w}" height="${h}" fill="${fhRef('g')}"/>`;
const starBg = (w, h) => {
  let dots = '';
  for (let x = 8; x < w; x += 13) for (let y = 6; y < h; y += 11) dots += `<circle cx="${x}" cy="${y}" r="1"/>`;
  return `<rect width="${w}" height="${h}" fill="#E7E0D2"/><g fill="#14120F" opacity="0.22">${dots}</g>`;
};
const gridBg = (w, h) => {
  let g = '';
  for (let x = 0; x < w; x += 16) g += `M${x} 0 L${x} ${h} `;
  for (let y = 0; y < h; y += 16) g += `M0 ${y} L${w} ${y} `;
  return `<rect width="${w}" height="${h}" fill="#EBE4D1"/>`
    + `<path d="${g}" stroke="#14120F" stroke-width="0.5" opacity="0.2" fill="none"/>`;
};

const chips = MOCK_CREW.map((c) => {
  const k = resolvePawnLook(c);
  return `<figure><div class="chipwell"><svg viewBox="0 0 16 20">${pawnChip(c)}</svg></div>`
    + `<figcaption>${c.surname}<br><i>${k.build} · ${k.topper} · ${k.mark} · ${k.prop} · ${k.stature}</i></figcaption></figure>`;
}).join('');

const html = `<!doctype html><meta charset="utf-8"><title>ink figures</title><style>
 body{margin:0;background:#E7E0D2;font-family:ui-monospace,monospace;font-size:10px;color:#4E463A}
 .row{margin:0 0 6px}.lbl{padding:4px 8px;letter-spacing:.14em;text-transform:uppercase;color:#8A7F6C}
 .chips{display:flex;gap:10px;padding:8px 12px;flex-wrap:wrap}
 figure{margin:0;text-align:center;width:96px}
 .chipwell{width:40px;height:50px;margin:0 auto;overflow:hidden;border-radius:6px}
 .chipwell svg{width:100%;height:100%;display:block}
 figcaption{margin-top:4px;font-size:8px;line-height:1.3}
 i{color:#8A7F6C;font-style:normal}
</style>
<div class="lbl">chips — 40px well (the roster dock)</div><div class="chips">${chips}</div>
${spriteRow(37, paperBg, 'sprite · 37 px — the OVERVIEW size (tileSize≈16.7 · S≈1.53)')}
${spriteRow(37, starBg, 'sprite · 37 px on the ink starfield — the knockout doing its job')}
${spriteRow(64, gridBg, 'sprite · 64 px — the ROOM ZOOM size (U=32, PAWN_H=64) over a floor grid')}
${spriteRow(64, hatchBg, 'sprite · 64 px on the 45° wall hatch')}
${spriteRow(148, paperBg, 'sprite · 4× zoom — "the details reward zooming"')}
`;

const page = join(OUT, 'pawns.html');
writeFileSync(page, html);
console.log('wrote', page);

for (const [name, h] of [['pawns', 1400]]) {
  await new Promise((res, rej) => {
    const p = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
      `--screenshot=${join(OUT, name + '.png')}`, `--window-size=1180,${h}`, 'file://' + page,
    ], { stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('chrome exit ' + c))));
    p.on('error', rej);
  });
  console.log('shot', join(OUT, name + '.png'));
}
