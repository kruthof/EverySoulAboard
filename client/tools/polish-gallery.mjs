#!/usr/bin/env node
// polish-gallery.mjs — BEFORE / AFTER for the designer-polish lane, one row per CHANGED piece.
//
// ⚠️ THE POPULATION IS MEASURED, NOT TYPED. Every catalogue id is rendered from BOTH trees and the
// emitted SVG compared byte-for-byte; a piece is in this gallery only if its drawing actually moved.
// A commit message's claim about which pieces it touched is NOT the input — that claim is the thing
// this gallery exists to check, and on this lane it is wrong for two of the five modules.
//
// ⚠️ MATERIALS ARE RENDERED AT THEIR OWN ASPECT. A skin's builder branches on `g.hCm` (the wall
// skins carry a 2.4 m course the floors do not), so a square 240×240 render silently takes the chip
// path and two pieces that DID change would have compared equal. Walls go 95×228, floors 95×95 —
// the Room Zoom's own boxes — exactly as `paper-materials.test.js` derives them.
//
// THE 22 px STRIP IS AT TRUE DEVICE PIXELS. `--force-device-scale-factor=1` and `scale: 1` on the
// clip: the question is whether the ink survives at 22 REAL pixels, and a 3× capture of a vector
// answers an easier one.
//
// ONE CHROME, ONE RECORDED PID (TRAPS-5), killed on exit and on SIGINT.
//
// USAGE
//   node client/tools/polish-gallery.mjs --main <path-to-main-worktree> --out <dir>

import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const LANE = resolve(arg('lane', process.cwd().replace(/\/client$/, '')));
const MAIN = resolve(arg('main', ''));
const OUT = resolve(arg('out', 'client/tools/shots-polish'));
const CDP_PORT = +arg('cdp-port', '9394');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CELL = 190;
const TILES = [22, 32];
if (!MAIN) { console.error('FAIL: --main <path to a worktree at main> is required'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ── 1. LOAD BOTH TREES ───────────────────────────────────────────────────────────────────────
async function loadTree(root) {
  const items = await import(`${root}/client/src/items/index.js`);
  const mats = await import(`${root}/client/src/items/paper-materials.js`);
  const wrecked = await import(`${root}/client/src/items/wrecked.js`);
  return {
    buildItem: items.buildItem,
    ITEMS: items.ITEMS,
    buildWrecked: wrecked.buildWrecked,
    WRECKED: wrecked.WRECKED,
    MATERIAL_SPECS: mats.SPECS,
    mods: {
      fittings: (await import(`${root}/client/src/items/fittings.js`)).FITTING_IDS,
      machines: (await import(`${root}/client/src/items/machines.js`)).MACHINE_IDS,
      'paper-fixtures': (await import(`${root}/client/src/items/paper-fixtures.js`)).FIXTURE_IDS,
      'paper-resources': (await import(`${root}/client/src/items/paper-resources.js`)).PAPER_RESOURCE_IDS,
      'paper-materials': mats.MATERIAL_IDS,
    },
  };
}
const A = await loadTree(MAIN);
const B = await loadTree(LANE);

// A material's box is its OWN aspect; everything else is the square catalogue card.
const boxFor = (T, mod, id, cell) => {
  if (mod !== 'paper-materials') return { w: cell, h: cell };
  const sp = T.MATERIAL_SPECS[id];
  return { w: cell, h: Math.round(cell * sp.h / sp.w) };
};
const draw = (T, mod, id, cell, pfx) => {
  try { return T.buildItem(id, { ...boxFor(T, mod, id, cell), idPrefix: pfx }); } catch (e) { return null; }
};
const drawTwin = (T, id, cell, pfx) => {
  if (!T.WRECKED[id]) return null;
  try { return T.buildWrecked(id, { w: cell, h: cell, idPrefix: pfx }); } catch { return null; }
};

// ── 2. THE CHANGED SET, DERIVED ──────────────────────────────────────────────────────────────
const rows = [];
for (const [mod, ids] of Object.entries(B.mods)) {
  for (const id of ids) {
    if (!A.mods[mod].includes(id)) { rows.push({ mod, id, added: true }); continue; }
    // ⛔ THE SAME `idPrefix` ON BOTH SIDES. Every def a fragment registers is namespaced by the
    // prefix, so comparing an 'a'-prefixed render against a 'b'-prefixed one reports EVERY piece
    // that owns a pattern as changed — 77 of 82 here, against a true 59. The prefix is not part of
    // the drawing; feeding it into the diff measures the harness, not the art.
    const a = draw(A, mod, id, 240, 'p'), b = draw(B, mod, id, 240, 'p');
    const at = drawTwin(A, id, 240, 't'), bt = drawTwin(B, id, 240, 't');
    const pChanged = h(a || '') !== h(b || '');
    const tChanged = h(at || '') !== h(bt || '');
    if (pChanged || tChanged) rows.push({ mod, id, pChanged, tChanged, hasTwin: !!bt });
  }
}
const byMod = {};
for (const r of rows) (byMod[r.mod] = byMod[r.mod] || []).push(r);
console.log(`${rows.length} changed pieces:`,
  Object.entries(byMod).map(([m, v]) => `${m} ${v.length}/${B.mods[m].length}`).join(' · '));

// ── 3. THE PAGE ──────────────────────────────────────────────────────────────────────────────
const PAPER_BG = '#F5F0E2';
const svgOf = (frag, box, cls) => frag == null
  ? `<div class="miss" style="width:${box.w}px;height:${box.h}px">did not build</div>`
  : `<svg class="${cls}" width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}">${frag}</svg>`;

function tileStrip(T, mod, id, pfx) {
  return TILES.map((px) => {
    const box = boxFor(T, mod, id, px);
    let frag; try { frag = T.buildItem(id, { ...box, idPrefix: `${pfx}${px}` }); } catch { frag = null; }
    return `<div class="tcell"><div class="thold">${svgOf(frag, box, 'tile')}</div><span>${px}</span></div>`;
  }).join('');
}

let body = '';
for (const [mod, list] of Object.entries(byMod)) {
  body += `<h2>${mod} <em>${list.length} of ${B.mods[mod].length} changed</em></h2>\n<div class="grid">\n`;
  for (const r of list) {
    const boxA = boxFor(A, mod, r.id, CELL), boxB = boxFor(B, mod, r.id, CELL);
    const twinA = r.hasTwin ? drawTwin(A, r.id, CELL, `ta-${r.id}`) : null;
    const twinB = r.hasTwin ? drawTwin(B, r.id, CELL, `tb-${r.id}`) : null;
    body += `<div class="row" data-piece="${r.id}">
      <div class="name">${r.id}${r.tChanged ? ' <b>+twin</b>' : ''}</div>
      <div class="pair">
        <figure><figcaption>main</figcaption>${svgOf(draw(A, mod, r.id, CELL, `ga-${r.id}`), boxA, 'art')}</figure>
        <figure><figcaption>lane</figcaption>${svgOf(draw(B, mod, r.id, CELL, `gb-${r.id}`), boxB, 'art')}</figure>
        ${r.hasTwin ? `<figure class="tw"><figcaption>main twin</figcaption>${svgOf(twinA, { w: CELL, h: CELL }, 'art')}</figure>
        <figure class="tw"><figcaption>lane twin</figcaption>${svgOf(twinB, { w: CELL, h: CELL }, 'art')}</figure>` : ''}
      </div>
      <div class="tiles">
        <div class="tgroup"><span class="tlab">main</span>${tileStrip(A, mod, r.id, `sa-${r.id}-`)}</div>
        <div class="tgroup"><span class="tlab">lane</span>${tileStrip(B, mod, r.id, `sb-${r.id}-`)}</div>
      </div>
    </div>\n`;
  }
  body += `</div>\n`;
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>designer-polish before/after</title><style>
  html,body{margin:0;background:#3E3A33;color:#E8E2D2;font:13px/1.4 ui-sans-serif,system-ui,sans-serif}
  header{padding:20px 24px 4px}
  h1{font-size:20px;margin:0 0 6px} header p{margin:0;color:#B5AC97;max-width:80ch}
  h2{margin:28px 24px 8px;font-size:15px;color:#F0E9D6;border-bottom:1px solid #5A5348;padding-bottom:5px}
  h2 em{font-style:normal;color:#B5AC97;font-weight:400;font-size:12px;margin-left:8px}
  .grid{display:flex;flex-direction:column;gap:14px;padding:0 24px}
  .row{background:#4A453C;border-radius:4px;padding:10px 12px;display:flex;gap:16px;align-items:flex-start}
  .name{width:150px;flex:none;font:12px/1.3 ui-monospace,monospace;color:#F0E9D6;padding-top:16px}
  .name b{color:#D9A441;font-weight:600}
  .pair{display:flex;gap:10px;flex:none}
  figure{margin:0;display:flex;flex-direction:column;gap:3px}
  figcaption{font:10px/1 ui-monospace,monospace;color:#B5AC97;text-align:center}
  .art{display:block;background:${PAPER_BG}}
  figure.tw .art{outline:1px solid #6B6355}
  .miss{background:#7B2C22;color:#fff;font:10px/1 monospace;display:flex;align-items:center;justify-content:center}
  .tiles{display:flex;flex-direction:column;gap:8px;padding-top:14px}
  .tgroup{display:flex;align-items:flex-end;gap:8px;background:#F5F0E2;padding:6px 8px;border-radius:3px}
  .tlab{font:9px/1 ui-monospace,monospace;color:#8A8272;width:26px}
  .tcell{display:flex;flex-direction:column;align-items:center;gap:2px}
  .thold{display:flex;align-items:flex-end;min-height:32px}
  .tile{display:block;background:${PAPER_BG}}
  .tcell span{font:9px/1 ui-monospace,monospace;color:#8A8272}
</style></head><body>
<header><h1>designer-polish — before / after</h1>
<p>Left of each pair is <b>main</b>, right is <b>lane/designer-polish</b>. Twin columns are the
post-raid drawing. The strips at the right are the pieces at <b>22 px and 32 px, true device
pixels</b> — 22 px is the size the Overview draws furniture at on the wreck's decks. The population
is derived by rendering every catalogue id in both trees and diffing the emitted SVG, so a piece
appears here only if its drawing actually moved.</p></header>
${body}</body></html>`;

const pageFile = join(OUT, 'gallery.html');
writeFileSync(pageFile, html);
console.log('wrote', pageFile);

// ── 4. ONE CHROME, ONE RECORDED PID ──────────────────────────────────────────────────────────
const userDir = mkdtempSync(join(tmpdir(), 'polish-gallery-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1500,1200',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
const CHROME_PID = chrome.pid;
console.log('chrome pid', CHROME_PID);
let killed = false;
const killChrome = () => {
  if (killed) return; killed = true;
  try { process.kill(CHROME_PID, 'SIGKILL'); } catch { /* gone */ }
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
  } catch { /* not up */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); killChrome(); process.exit(5); }

let msgId = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++msgId; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: 'file://' + pageFile });
await sleep(2500);

const dims = await evaluate('JSON.stringify({w:document.body.scrollWidth,h:document.body.scrollHeight})');
const { w, h: pageH } = JSON.parse(dims);
console.log(`page is ${w}×${pageH}`);
const shot = await call('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true, fromSurface: true,
  clip: { x: 0, y: 0, width: w, height: pageH, scale: 1 },
});
const pngFile = join(OUT, 'gallery.png');
if (shot.result?.data) { writeFileSync(pngFile, Buffer.from(shot.result.data, 'base64')); console.log('wrote', pngFile); }
else console.error('FAIL: no screenshot data');

// ⭐ THE 22 px INK MASS, MEASURED RATHER THAN EYEBALLED — this lane files a residual that says
// `spoil-heap` got LIGHTER at tile size, and "lighter" is a number, not an opinion. Coverage is the
// share of non-paper pixels in the 22 px tile, read off the same canvas the strip is drawn from.
const mass = await evaluate(`(async () => {
  const out = {};
  for (const el of document.querySelectorAll('.row')) {
    const id = el.dataset.piece;
    const groups = el.querySelectorAll('.tgroup');
    const vals = [];
    for (const g of groups) {
      const svg = g.querySelector('svg.tile');
      if (!svg) { vals.push(null); continue; }
      const s = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      const done = new Promise((r) => { img.onload = r; img.onerror = r; });
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
      await done;
      const c = document.createElement('canvas');
      c.width = svg.width.baseVal.value; c.height = svg.height.baseVal.value;
      const cx = c.getContext('2d');
      cx.fillStyle = '${PAPER_BG}'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      // TWO NUMBERS, BECAUSE "LIGHTER" IS AMBIGUOUS AND THE TWO ANSWERS DISAGREE HERE.
      //   cover — share of pixels under a luminance threshold: how much of the tile is marked.
      //   dens  — mean darkness against the paper: how HEAVY the marks are.
      // A piece can gain coverage (more, finer strokes) while losing density (the bold one went),
      // which is exactly the trade this lane's spoil-heap residual is filed about.
      let ink = 0, n = 0, sum = 0;
      const PAPER_LUM = 0.299 * 0xF5 + 0.587 * 0xF0 + 0.114 * 0xE2;
      for (let i = 0; i < d.length; i += 4) {
        n++; const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        if (lum < 200) ink++;
        sum += Math.max(0, PAPER_LUM - lum) / PAPER_LUM;
      }
      vals.push(n ? { cover: ink / n, dens: sum / n } : null);
    }
    out[id] = vals;
  }
  return JSON.stringify(out);
})()`);
if (mass) {
  const m = JSON.parse(mass);
  const lines = ['piece,main_cover,lane_cover,cover_delta_pct,main_dens,lane_dens,dens_delta_pct'];
  const drops = [];
  for (const [id, v] of Object.entries(m)) {
    if (v[0] == null || v[1] == null) continue;
    const dc = v[0].cover ? ((v[1].cover - v[0].cover) / v[0].cover) * 100 : 0;
    const dd = v[0].dens ? ((v[1].dens - v[0].dens) / v[0].dens) * 100 : 0;
    lines.push(`${id},${v[0].cover.toFixed(4)},${v[1].cover.toFixed(4)},${dc.toFixed(1)},`
      + `${v[0].dens.toFixed(4)},${v[1].dens.toFixed(4)},${dd.toFixed(1)}`);
    if (dc < -20 || dd < -20) drops.push([id, dc, dd, v[1].dens]);
  }
  lines.sort();
  writeFileSync(join(OUT, 'ink-mass-22px.csv'), lines.join('\n') + '\n');
  console.log('wrote', join(OUT, 'ink-mass-22px.csv'));
  drops.sort((a, b) => Math.min(a[1], a[2]) - Math.min(b[1], b[2]));
  console.log('\n⚠️ pieces that LOST more than 20% of their 22 px coverage OR density:');
  for (const [id, dc, dd] of drops) console.log(`   ${id.padEnd(22)} cover ${dc.toFixed(1)}%  density ${dd.toFixed(1)}%`);
  if (!drops.length) console.log('   (none)');
  // ⛔ THE ABSOLUTE FLOOR, NOT JUST THE DELTA — the SEVENTH TRAP SHAPE. A set of deltas cannot see a
  // piece that was ALREADY too faint to read at 22 px and stayed that way.
  const faint = Object.entries(m).filter(([, v]) => v[1] && v[1].dens < 0.05)
    .map(([id, v]) => [id, v[1].dens]).sort((a, b) => a[1] - b[1]);
  console.log('\n⚠️ FAINTEST at 22 px in absolute terms (lane, mean ink density < 0.05):');
  for (const [id, d] of faint) console.log(`   ${id.padEnd(22)} ${d.toFixed(4)}`);
  if (!faint.length) console.log('   (none)');
}

killChrome();
console.log('\ndone —', rows.length, 'pieces in', OUT);
