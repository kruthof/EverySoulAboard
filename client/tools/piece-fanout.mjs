#!/usr/bin/env node
// piece-fanout.mjs — RENDER EVERY PRISTINE CATALOGUE PIECE ANONYMOUSLY, ONE FILE PER PIECE, so a
// per-piece design review can be fanned out to reviewers who cannot see the piece's NAME.
//
// ⚠️ WHY ANONYMOUS. The sibling sheets in this directory (`fittings-sheet.mjs`, `machines-sheet.mjs`,
// `paper-fixtures-sheet.mjs`, …) all print the itemId beside the drawing, which is right for a
// builder checking their own work and wrong for a reviewer answering "what IS this object?". A
// reviewer who has read `plant-pot` on the card cannot afterwards report that the drawing does not
// read as a plant pot. So the filenames here are `piece-<NN>.png` with NN a SHUFFLED index, the
// cards carry no text at all, and the id → NN map lives only in the manifest this tool prints.
//
// ⚠️ TREATED, AS SHIPPED. Every piece goes through `items/index.js buildItem`, which is the one door
// both SVG surfaces use, so the sketch treatment (`helpers.js item()` → `render/sketch.js`) is ON
// exactly where the shipping game has it on. Nothing here passes `sketch: false` — that flag is the
// geometry guards' door, not a rendering choice.
//
// THREE ARTIFACTS PER PIECE:
//   piece-NN.png       the piece at ~240 px catalogue scale, on paper, nothing else in frame
//   piece-NN-tile.png  the 22/32/48 px tile strip — 22 is the size the Overview really draws
//                      furniture at on the wreck's decks (`ui/overview-scene.js`, tileSize*1.7)
//   piece-NN-twin.png  the post-raid twin, for the pieces whose twin is REPO-AUTHORED
//                      (`wrecked.js NON_MOCK_TWIN`). A piece whose twin is a warm mock
//                      transcription gets no twin file — that mismatch is charter §4's filed P2b
//                      and is not this tool's to hide or to fix.
//
// ONE CHROME, MANY CLIPS. The 82 cards are laid out on ONE page and each is cut out with
// `Page.captureScreenshot { clip }`. Spawning Chrome ~180 times would take minutes and leak a
// process per failure; TRAPS-5 says kill RECORDED PIDs, so exactly one PID is recorded and killed.
//
// USAGE
//   node client/tools/piece-fanout.mjs --out <dir> [--cell 240] [--seed 20260805]

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { buildItem, ITEMS } from '../src/items/index.js';
import { buildWrecked, NON_MOCK_TWIN, WRECKED } from '../src/items/wrecked.js';
import { PAPER } from '../src/items/helpers.js';

import { FITTING_IDS } from '../src/items/fittings.js';
import { MACHINE_IDS } from '../src/items/machines.js';
import { FIXTURE_IDS } from '../src/items/paper-fixtures.js';
import { PAPER_RESOURCE_IDS } from '../src/items/paper-resources.js';
import { MATERIAL_IDS } from '../src/items/paper-materials.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-fanout'));
const CELL = +arg('cell', '240');
const SEED = +arg('seed', '20260805');
const CDP_PORT = +arg('cdp-port', '9391');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TILES = [22, 32, 48];
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. THE POPULATION, DERIVED ───────────────────────────────────────────────────────────────
// Each catalogue module publishes its own id list off its own `SPECS`; nothing is typed here and no
// count is hardcoded. Every id is then required to be a registry row, because `buildItem` is the
// path being photographed and an id the registry does not know draws the "?" placeholder — a silent
// wrong picture that looks exactly like a rendered piece.
const MODULES = [
  ['fittings', FITTING_IDS],
  ['machines', MACHINE_IDS],
  ['paper-fixtures', FIXTURE_IDS],
  ['paper-resources', PAPER_RESOURCE_IDS],
  ['paper-materials', MATERIAL_IDS],
];
const pieces = [];
for (const [mod, ids] of MODULES) {
  for (const id of ids) {
    if (!ITEMS[id]) { console.error(`FAIL: ${mod} publishes '${id}' but the registry has no such row`); process.exit(2); }
    pieces.push({ id, module: mod });
  }
}
const dupes = pieces.map((p) => p.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) { console.error('FAIL: an id appears in two catalogues:', dupes); process.exit(2); }
console.log(`${pieces.length} pristine pieces from ${MODULES.length} catalogues:`,
  MODULES.map(([m, ids]) => `${m} ${ids.length}`).join(' · '));

// ── 2. THE SHUFFLE ───────────────────────────────────────────────────────────────────────────
// Deterministic (seeded) so a rerun produces the SAME NN for the same piece — a reviewer's note
// about piece 41 has to keep meaning piece 41 — but scrambled relative to catalogue order so the
// index leaks neither the name nor the module. Catalogue order would have meant "1..34 are
// fittings", which is a name-shaped hint.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
for (let i = pieces.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
}
pieces.forEach((p, i) => { p.n = i + 1; p.nn = String(i + 1).padStart(2, '0'); });

// A repo-authored twin: drawn here against the paper piece, not transcribed from the warm mock.
const hasRepoTwin = (id) => !!WRECKED[id] && Object.prototype.hasOwnProperty.call(NON_MOCK_TWIN, id);
for (const p of pieces) p.twin = hasRepoTwin(p.id);
console.log(`${pieces.filter((p) => p.twin).length} of them have a repo-authored twin`);

// ── 3. THE PAGES ─────────────────────────────────────────────────────────────────────────────
// No captions, no ids, no borders inside the clip: the clip IS the art box, so the reviewer sees
// the drawing on paper and nothing else. `data-n` is how the clip is found; it never renders.
const safe = (frag) => frag; // fragments are our own emitted SVG — no interpolation of user text

function cardPage(list, build, cell) {
  const cards = list.map((p) => {
    let frag;
    try { frag = build(p); } catch (e) { frag = null; p.buildError = String(e && e.message || e); }
    if (frag == null) return `<div class="slot"><div class="art failed" data-n="${p.nn}"></div></div>`;
    return `<div class="slot"><svg class="art" data-n="${p.nn}" width="${cell}" height="${cell}" `
      + `viewBox="0 0 ${cell} ${cell}">${safe(frag)}</svg></div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>fanout</title><style>
    html,body { margin:0; background:#5a5348; }
    main { display:flex; flex-wrap:wrap; gap:24px; padding:24px; }
    .slot { width:${cell}px; height:${cell}px; }
    .art { display:block; width:${cell}px; height:${cell}px; background:${PAPER}; }
    .failed { background:#7B2C22; }
  </style></head><body><main>${cards}</main></body></html>`;
}

// THE TILE STRIP. Rendered at TRUE device pixels (scale 1, no device-scale-factor games): the whole
// question a 22 px row answers is whether the ink survives at 22 real pixels, and a 3× capture of a
// vector at 22 px answers a different, easier question.
const STRIP_PAD = 12, STRIP_GAP = 16;
const STRIP_W = STRIP_PAD * 2 + TILES.reduce((a, b) => a + b, 0) + STRIP_GAP * (TILES.length - 1);
const STRIP_H = STRIP_PAD * 2 + Math.max(...TILES) + 14;
function stripPage(list) {
  const rows = list.map((p) => {
    const cells = TILES.map((px) => {
      let frag;
      try { frag = buildItem(p.id, { w: px, h: px, idPrefix: `t${px}-${p.nn}` }); } catch { frag = null; }
      const art = frag == null
        ? `<div style="width:${px}px;height:${px}px;background:#7B2C22"></div>`
        : `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" style="display:block;background:${PAPER}">${frag}</svg>`;
      return `<div class="cell"><div class="hold" style="height:${Math.max(...TILES)}px">${art}</div><span>${px}</span></div>`;
    }).join('');
    return `<div class="strip" data-n="${p.nn}">${cells}</div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>tiles</title><style>
    html,body { margin:0; background:#5a5348; }
    main { display:flex; flex-wrap:wrap; gap:20px; padding:20px; }
    .strip { width:${STRIP_W}px; height:${STRIP_H}px; box-sizing:border-box; background:#F5F0E2;
             display:flex; align-items:flex-end; justify-content:center; gap:${STRIP_GAP}px;
             padding:${STRIP_PAD}px; }
    .cell { display:flex; flex-direction:column; align-items:center; gap:2px; }
    .hold { display:flex; align-items:flex-end; }
    .cell span { font:9px/1 ui-monospace,monospace; color:#8A8272; }
  </style></head><body><main>${rows}</main></body></html>`;
}

const pristinePage = cardPage(pieces, (p) => buildItem(p.id, { w: CELL, h: CELL, idPrefix: `pc-${p.nn}` }), CELL);
const twinList = pieces.filter((p) => p.twin);
const twinPage = cardPage(twinList, (p) => buildWrecked(p.id, { w: CELL, h: CELL, idPrefix: `tw-${p.nn}` }), CELL);
const tilePage = stripPage(pieces);

const PAGES = join(OUT, '_pages');
mkdirSync(PAGES, { recursive: true });
writeFileSync(join(PAGES, 'pristine.html'), pristinePage);
writeFileSync(join(PAGES, 'twins.html'), twinPage);
writeFileSync(join(PAGES, 'tiles.html'), tilePage);

// ── 4. ONE CHROME, MANY CLIPS ────────────────────────────────────────────────────────────────
const userDir = mkdtempSync(join(tmpdir(), 'piece-fanout-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1400,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
const CHROME_PID = chrome.pid;
console.log('chrome pid', CHROME_PID);
let killed = false;
const killChrome = () => {
  if (killed) return; killed = true;
  try { process.kill(CHROME_PID, 'SIGKILL'); } catch { /* already gone */ }
  try { rmSync(userDir, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', killChrome);
process.on('SIGINT', () => { killChrome(); process.exit(130); });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(300);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); killChrome(); process.exit(5); }

let msgId = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++msgId; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const jsonOf = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };

await call('Page.enable'); await call('Runtime.enable');

async function shoot(pageFile, list, fileFor, selector) {
  await call('Page.navigate', { url: 'file://' + join(PAGES, pageFile) });
  await sleep(1200);
  const rects = await jsonOf(
    `(()=>{const o={};document.querySelectorAll(${JSON.stringify(selector)}).forEach(e=>{`
    + `const r=e.getBoundingClientRect();o[e.dataset.n]={x:r.x+window.scrollX,y:r.y+window.scrollY,`
    + `w:r.width,h:r.height};});return o;})()`);
  if (!rects) { console.error('FAIL: no elements found on ' + pageFile); return; }
  let ok = 0;
  for (const p of list) {
    const r = rects[p.nn];
    const file = fileFor(p);
    if (!r || !r.w || !r.h) { p[file.key] = 'FAILED'; console.error(`  MISS ${pageFile} n=${p.nn} (${p.id})`); continue; }
    const shot = await call('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, fromSurface: true,
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
    });
    const data = shot.result?.data;
    if (!data) { p[file.key] = 'FAILED'; console.error(`  FAIL capture ${pageFile} n=${p.nn} (${p.id})`); continue; }
    writeFileSync(file.path, Buffer.from(data, 'base64'));
    p[file.key] = file.path;
    ok++;
  }
  console.log(`${pageFile}: ${ok}/${list.length} captured`);
}

await shoot('pristine.html', pieces, (p) => ({ key: 'png', path: join(OUT, `piece-${p.nn}.png`) }), 'svg.art, div.art');
await shoot('tiles.html', pieces, (p) => ({ key: 'tilePng', path: join(OUT, `piece-${p.nn}-tile.png`) }), '.strip');
await shoot('twins.html', twinList, (p) => ({ key: 'twinPng', path: join(OUT, `piece-${p.nn}-twin.png`) }), 'svg.art, div.art');

killChrome();

// ── 5. THE MANIFEST ──────────────────────────────────────────────────────────────────────────
// A piece that failed to render is recorded with `png: 'FAILED'` rather than dropped: a fan-out that
// silently ships 79 of 82 reviews reads exactly like one that shipped all 82.
const manifest = pieces.map((p) => ({
  n: p.n,
  id: p.id,
  module: p.module,
  png: p.png || 'FAILED',
  tilePng: p.tilePng || 'FAILED',
  twinPng: p.twin ? (p.twinPng || 'FAILED') : null,
  ...(p.buildError ? { buildError: p.buildError } : {}),
}));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const bad = manifest.filter((m) => m.png === 'FAILED' || m.tilePng === 'FAILED' || m.twinPng === 'FAILED');
console.log(`wrote ${join(OUT, 'manifest.json')} — ${manifest.length} pieces, ${bad.length} with a FAILED artifact`);
for (const b of bad) console.log('  FAILED:', b.n, b.id, b.module);
