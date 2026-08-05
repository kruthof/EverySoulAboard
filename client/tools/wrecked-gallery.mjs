#!/usr/bin/env node
// wrecked-gallery.mjs — RENDER the wrecked item set (and the two new cryo capsules) to a real
// browser and photograph it, so the owner judges the art from pictures rather than from a diff.
//
// ⚠️ WHY THIS EXISTS, and it is `marks-shot.mjs` / `items-shot.mjs`'s argument in a third setting.
// Every assertion `client/test/wrecked.test.js` makes reads a STRING. A perfectly formed, balanced,
// id-collision-free `<g>` fragment can still paint an invisible smear: a gradient whose stops are
// all transparent, a shape drawn outside its own viewBox, an inner ring wider than the shape it is
// inside, a pattern whose tile is bigger than the thing it fills. Those are not exotic — this
// package translates 501 CSS layers, and four of the translations (`shade`, `outset`, `stripes`,
// the `'50%'` radius) are new vocabulary invented here. None of them has a test that can see
// "nothing appeared".
//
// ⚠️ IT ALSO DIFFERS FROM ITS THREE SIBLINGS IN ONE IMPORTANT WAY: it drives NO SIM AND NO GAME.
// The wrecked set is deliberately NOT wired to either surface (see `client/src/items/wrecked.js`'s
// header — nothing on the wire carries a condition, so no surface could choose a twin yet). There
// is therefore no running game in which to photograph it, and a tool that waited for one would
// photograph nothing. This renders the registry directly, on the mock's own stage, at the mock's
// own size. That is a WEAKER kind of evidence than a shot of the shipping game and it is stated
// here rather than glossed: it proves the pieces DRAW, not that they read correctly in a room.
//
// WHAT IT PRODUCES
//   <out>/wrecked-1-objects.png .. wrecked-5-cryo.png   the 70 twins, pristine beside wrecked
//   <out>/wrecked-0-cryo-new.png                        the two NEW static cryo capsules, large
//   <out>/wrecked-gallery.html                          the page itself, for a human to open
//
// USAGE
//   node client/tools/wrecked-gallery.mjs --out docs/design/shots
//   node client/tools/wrecked-gallery.mjs --out /tmp/g --html-only     (no Chrome, just the page)
//
// Exits non-zero if any piece fails to build, if Chrome never paints, or — the check that makes the
// run worth trusting — if a piece's rendered bounding box is EMPTY in the live DOM. A gallery of
// blank stages is exactly the failure this tool exists to prevent, and it would look like success.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const OUT = resolve(arg('out', '.'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9351');
// 128 is not a round number chosen for looks: `helpers.js` TILE is 128, so a fragment built at
// 128×128 renders at scale EXACTLY 1 and one SVG unit is one mock pixel. Anything else would make
// the middle column an unfair comparison.
const CELL = +arg('cell', '128');
const STAGE_W = 150;   // the mock's own stage, from the spec's helmet <style>
const STAGE_H = 132;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

const { ITEMS, ITEM_IDS, buildItem } = await import('../src/items/index.js');
const { WRECKED, WRECKED_IDS, NO_WRECKED_TWIN, buildWrecked, wreckedItemId } = await import('../src/items/wrecked.js');

// ───────────────────────────────────────────────────────────── 0. the MOCK's own layers
// ⚠️ THE MIDDLE COLUMN IS THE POINT OF THIS TOOL. Reading a builder against the mock by eye proves
// the numbers were copied; it cannot prove they were copied to a shape that looks the same. So the
// gallery renders the MOCK'S OWN CSS DIVS beside the SVG, from the committed spec, using the mock's
// own stage geometry (150×132, `.obj` anchored at 75,64) — a real visual diff rather than an
// argument about one.
//
// The 70 wrecked pieces live in a `brokenD` array inside `<script type="text/x-dc" data-dc-script>`
// and are NOT in the markup; `renderVals()` is a pure function of nothing, so evaluating it is how
// you read them. (A `class="lbl"` grep finds the 70 PRISTINE labels and the literal `{{b.name}}`,
// and silently misses every wrecked piece — see the spec's own header.)
const SPEC = resolve(new URL('../../docs/design/perilune-item-set.dc.html', import.meta.url).pathname);
let brokenD = null;
try {
  const src = readFileSync(SPEC, 'utf8');
  const m = src.match(/renderVals\(\)\s*\{([\s\S]*?)\n {2}\}\n\}/);
  if (!m) throw new Error('renderVals() not found in ' + SPEC);
  // eslint-disable-next-line no-new-func
  brokenD = new Function(m[1].replace('return { brokenD };', 'return brokenD;'))();
  if (!Array.isArray(brokenD) || brokenD.length !== 70) throw new Error('brokenD is ' + (brokenD || []).length + ', expected 70');
} catch (e) {
  console.error('FAIL: could not read the mock layers — ' + e.message);
  process.exit(2);
}
const mockByLabel = new Map(brokenD.map((b) => [b.name, b]));

// ───────────────────────────────────────────────────────────── 1. build every piece, up front
//
// ⛔ THIS GUARD WAS UNSATISFIABLE AND THE TOOL EXITED 2 ON EVERY RUN SINCE `swarf` LANDED. It
// asserted a twin for EVERY registry row, but `client/src/items/wrecked.js` has carried a deliberate
// `NO_WRECKED_TWIN` ledger since 2026-07-28 — `swarf` (already the wrecked state of a machine),
// joined 2026-08-05 by `cell-spent` (already the wrecked state of a Battery). MEASURED on the parent
// commit as well as here: `main` printed "80 registry rows but 79 wrecked twins" and this tree "84 …
// but 82", so the capsules-and-cells package WIDENED a pre-existing gap from 1 to 2 rather than
// creating one. First filed and left alone as out-of-scope; fixed on review's second pass, because a
// gallery that cannot render is a gallery whose re-pointed `bigCryo` panel below was never once
// LOOKED AT — and the whole reason to re-point it was so somebody would look at it.
//
// The predicate is now the ledger's own invariant, stated in `wrecked.js` as: `WRECKED_IDS` is every
// registry row MINUS `NO_WRECKED_TWIN`, in registry order. `wrecked.test.js` asserts the same thing
// by strict deep-equality; this is the cheap arithmetic form, and it names the ledger so the next row
// added to it does not resurrect the exit 2.
const twinExempt = Object.keys(NO_WRECKED_TWIN).length;
if (WRECKED_IDS.length !== ITEM_IDS.length - twinExempt) {
  console.error(`FAIL: ${ITEM_IDS.length} registry rows − ${twinExempt} ledgered exempt `
    + `(${Object.keys(NO_WRECKED_TWIN).join(', ')}) = ${ITEM_IDS.length - twinExempt}, but `
    + `${WRECKED_IDS.length} wrecked twins`);
  process.exit(2);
}
// ⚠️ `WRECKED_IDS`, NOT `ITEM_IDS` — AND THIS WAS ONLY EVER REACHABLE ONCE THE GUARD ABOVE STOPPED
// EXITING. The loop read `WRECKED[id]` for every REGISTRY row, which is `undefined` for the ledgered
// rows, so the first thing a repaired guard produced was `TypeError: Cannot read properties of
// undefined (reading 'mockLabel')`. Two defects in a row that only the second could expose: the guard
// had been shielding a crash for as long as it had been failing.
//
// ⚠️ AND `mockLabel` IS NULLABLE BY DESIGN. Rows drawn from the owner's own catalogue (`capsule-*`,
// `cell-*`, `battery-bank`) have no MOCK to compare against — the mock is the old HTML spec sheet —
// so they carry `catalogue` instead, and a missing mock is only a failure for a row that claims one.
const pieces = WRECKED_IDS.map((id) => {
  const want = WRECKED[id].mockLabel;
  const mock = want ? mockByLabel.get(want) : null;
  if (want && !mock) { console.error(`FAIL: no mock piece labelled ${JSON.stringify(want)} (for ${id})`); process.exit(2); }
  return {
    id,
    label: want || WRECKED[id].catalogue || id,
    state: WRECKED[id].state,
    kind: ITEMS[id].kind,
    pristine: buildItem(id, { w: CELL, h: CELL, idPrefix: `p-${id}` }),
    wrecked: buildWrecked(id, { w: CELL, h: CELL, idPrefix: `w-${id}` }),
    mock: mock ? mock.layers.map((l) => `<div class="obj" style="${l.s}"></div>`).join('') : '',
    mockState: mock ? mock.state : '(catalogue — no mock)',
  };
});
for (const p of pieces) {
  for (const [which, svg] of [['pristine', p.pristine], ['wrecked', p.wrecked]]) {
    if (!svg || !svg.startsWith('<g') || svg.includes('undefined') || svg.includes('NaN')) {
      console.error(`FAIL: ${p.id} ${which} did not build a clean fragment`);
      process.exit(2);
    }
  }
}
log(`built ${pieces.length} pairs (${pieces.length * 2} fragments)`);

// ───────────────────────────────────────────────────────────── 2. the page
// Sections mirror the registry's own grouping, so a shot is a section and nothing spans two files.
const SECTIONS = [
  ['1-objects', 'OBJECTS', (p, i) => i < 30],
  ['2-walls-floors', 'WALLS & FLOORS', (p, i) => i >= 30 && i < 42],
  ['3-fixtures', 'FIXTURES', (p, i) => i >= 42 && i < 60],
  ['4-resources', 'RESOURCES', (p, i) => i >= 60 && i < 68],
  ['5-cryo', 'CRYO', (p, i) => i >= 68],
];

// ⚠️ THE viewBox MUST MATCH THE w/h THE FRAGMENT WAS BUILT WITH. `item()` centres its body at
// `translate(w/2 h/2)` and scales by `min(w,h)/TILE`, so a fragment built at 300 inside a 150-unit
// viewBox lands in the bottom-right quadrant, twice too big, and is clipped on two sides. That is
// exactly what the first run of this tool produced, and it looked like broken ART rather than a
// broken harness — which is the whole reason the size is a parameter here and not a constant.
const svgBox = (frag, cls, n = CELL) =>
  `<svg class="${cls}" viewBox="0 0 ${n} ${n}" width="${n}" height="${n}">${frag}</svg>`;

// THREE STAGES PER PIECE, and the order is deliberate: the pristine SVG we ship, then the MOCK's
// own CSS divs, then the wrecked SVG this package adds. The two right-hand stages are the diff.
const cell = (p) => `
  <div class="pair" data-id="${p.id}">
    <div class="stages">
      <div class="stage">${svgBox(p.pristine, 'sv pristine')}<div class="tag">svg</div></div>
      <div class="stage wr mock">${p.mock}<div class="badge">${p.mockState}</div><div class="tag">MOCK css</div></div>
      <div class="stage wr">${svgBox(p.wrecked, 'sv wrecked')}<div class="badge">${p.state}</div><div class="tag">svg</div></div>
    </div>
    <div class="lbl">${p.label}</div>
    <div class="sub">${p.id} &middot; ${p.kind} &middot; ${wreckedItemId(p.id)}</div>
  </div>`;

const sectionHtml = ([key, title, pick]) => `
  <section id="sec-${key}">
    <h2>${title}</h2>
    <div class="wrap">${pieces.filter(pick).map(cell).join('')}</div>
  </section>`;

// The two capsules on their own, big — a player meets twelve of them in the first minute of
// `--ship wreck`, so they get judged at a size where the occupant behind the glass is visible.
//
// ⚠️ RE-POINTED 2026-08-05, AND THE OLD IDS ARE NAMED SO THE CHANGE IS NOT MISTAKEN FOR A RENAME.
// This panel read `['cryo-capsule-occupied', 'cryo-capsule-open']` — the warm `items/cryo.js` pieces
// — which held `'K'` / `'k'` until the owner's "Capsules and cells" catalogue section took those
// glyphs over. Those two rows are still REGISTERED (see `items/index.js` for why they were not
// deleted) but nothing on either surface resolves to them any more, so a gallery that judged them
// big was photographing art no player can reach. It now shows the pieces the wreck actually draws,
// plus the Battery's two, which are the other pair this section is about.
const bigCryo = ['capsule-sealed', 'capsule-open', 'cell-sound'].map((id) => `
  <div class="pair big">
    <div class="stages">
      <div class="stage big">${svgBox(buildItem(id, { w: 300, h: 300, idPrefix: `big-${id}` }), 'sv', 300)}</div>
      <div class="stage big wr">${svgBox(buildWrecked(id, { w: 300, h: 300, idPrefix: `bigw-${id}` }), 'sv', 300)}
        <div class="badge">${WRECKED[id].state}</div></div>
    </div>
    <div class="lbl">${WRECKED[id].mockLabel || WRECKED[id].catalogue}</div>
  </div>`).join('');

const html = `<!doctype html><meta charset="utf-8"><title>PERILUNE — wrecked item set</title>
<style>
  body{margin:0;background:#0a0d14;font-family:'Space Mono',ui-monospace,monospace;color:#e8dcc9;padding:28px;}
  h1{font-size:19px;font-weight:400;letter-spacing:.06em;margin:0 0 6px;}
  h2{font-size:14px;font-weight:400;letter-spacing:.12em;color:#e8934a;margin:30px 0 12px;}
  .note{color:#8c8377;font-size:11px;line-height:1.7;max-width:920px;margin-bottom:8px;}
  .wrap{display:flex;flex-wrap:wrap;gap:18px;}
  .pair{display:flex;flex-direction:column;align-items:center;gap:6px;width:${STAGE_W * 3 + 12}px;}
  .pair.big{width:auto;}
  .stages{display:flex;gap:6px;}
  /* THE MOCK'S OWN STAGE, to the pixel: 150x132 with .obj anchored at 75,64 (spec helmet style).
     Matching it is what makes the middle column a comparison instead of a decoration. */
  .stage{position:relative;width:${STAGE_W}px;height:${STAGE_H}px;border-radius:10px;overflow:hidden;
    background:radial-gradient(120% 110% at 50% 42%,#2a2018,#151009);
    box-shadow:inset 0 0 0 1px #2b241c,inset 0 6px 0 rgba(232,147,74,.18);}
  .stage.big{width:300px;height:300px;}
  .stage.wr{background:radial-gradient(120% 110% at 50% 42%,#1d1a18,#0e0c0b);
    box-shadow:inset 0 0 0 1px #2b241c,inset 0 6px 0 rgba(120,70,40,.22);}
  .stage::before{content:"";position:absolute;inset:10px;pointer-events:none;
    background-image:radial-gradient(rgba(255,255,255,.045) 1px,transparent 1px);background-size:18px 18px;}
  .obj{position:absolute;left:75px;top:64px;}
  /* The SVG is placed so its 128-unit design box is CENTRED on the same (75,64) anchor at scale 1:1
     - item() renders at translate(w/2,h/2) scale(min(w,h)/128), so w=h=128 gives scale exactly 1. */
  .sv{position:absolute;left:75px;top:64px;transform:translate(-50%,-50%);}
  .stage.big .sv{left:0;top:0;transform:none;}
  .badge{position:absolute;left:8px;bottom:7px;padding:2px 6px;border-radius:3px;
    background:rgba(58,26,16,.92);color:#e07a5f;font:700 8px 'Space Mono',monospace;letter-spacing:.06em;}
  .tag{position:absolute;right:6px;top:5px;font:700 7px 'Space Mono',monospace;letter-spacing:.1em;color:#6f675d;}
  .stage.mock .tag{color:#e8934a;}
  .lbl{font-size:10px;letter-spacing:.08em;text-align:center;}
  .sub{font-size:8.5px;color:#6f675d;letter-spacing:.04em;text-align:center;}
</style>
<h1>PERILUNE — WRECKED ITEM SET · ${pieces.length} twins · pristine SVG | MOCK css | wrecked SVG</h1>
<div class="note">Left and right are rendered straight from <code>client/src/items/index.js</code>
and <code>client/src/items/wrecked.js</code> at ${CELL}&times;${CELL} (scale 1:1 with the mock).
<b>The MIDDLE stage is the mock's own CSS divs</b>, read out of
<code>docs/design/perilune-item-set.dc.html</code>'s <code>brokenD</code> array and laid out on the
mock's own 150&times;132 stage — so the middle and right stages are a direct fidelity diff. Known,
deliberate departures visible in that diff: PARTS' cogs are real TEETH rather than a conic-gradient
pie, VENT FAN's blades are four sectors, blurred <code>box-shadow</code>s become hard rings, and
drop shadows are dropped. NOT a screenshot of the game: nothing on the wire carries a device
condition yet, so no surface can choose a twin. This proves the pieces DRAW; it does not prove they
read correctly in a room. The badge is the mock's remaining-condition state (&mdash; for the eight
loose resources, which cannot be repaired).</div>
<section id="sec-0-cryo-new"><h2>THE PIECES A PLAYER MEETS FIRST — capsule sealed / open and the sound cell, pristine and wrecked, at 300px</h2>
<div class="wrap">${bigCryo}</div></section>
${SECTIONS.map(sectionHtml).join('')}
`;

const page = join(OUT, 'wrecked-gallery.html');
writeFileSync(page, html);
log('wrote', page);
if (has('html-only')) { log('done (--html-only)'); process.exit(0); }

// ───────────────────────────────────────────────────────────── 3. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'wrecked-gallery-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1500,1200',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const p = list.find((t) => t.type === 'page');
    if (p) wsUrl = p.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: 'file://' + page });
await sleep(2500);

// ⚠️ THE CHECK THAT MAKES THE PICTURES WORTH KEEPING. `getBBox()` is the browser's own measure of
// what a fragment actually laid out; a fragment that emits shapes with no area, or lays them out
// entirely outside the viewBox, reports a degenerate box here while the PNG shows a tidy empty
// stage that looks deliberate. Fail loudly rather than ship a gallery of blanks.
const boxes = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.sv')].map(sv=>{
  const g=sv.querySelector('g'); if(!g) return {w:0,h:0,id:'(no g)'};
  const b=g.getBBox(); const pair=sv.closest('.pair');
  return {id:(pair&&pair.dataset.id)||'big', cls:sv.getAttribute('class'), w:+b.width.toFixed(1), h:+b.height.toFixed(1)};
})) `));
const empty = boxes.filter((b) => b.w < 4 || b.h < 4);
log(`measured ${boxes.length} rendered fragments; smallest box ${Math.min(...boxes.map((b) => Math.min(b.w, b.h))).toFixed(1)}px`);
if (empty.length) {
  console.error('FAIL: these fragments rendered with (near-)zero area — they paint NOTHING:');
  for (const e of empty) console.error('   ', e.id, e.cls, e.w + '×' + e.h);
  chrome.kill('SIGKILL');
  process.exit(6);
}

async function shot(name, sel) {
  const clip = JSON.parse(await evaluate(`JSON.stringify((()=>{const e=document.querySelector('${sel}');
    if(!e)return null;const r=e.getBoundingClientRect();
    return {x:Math.max(0,r.x-8),y:Math.max(0,r.y-8),width:r.width+16,height:r.height+16};})())`));
  if (!clip) { console.error('FAIL: no element for ' + sel); process.exit(7); }
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1500, height: Math.ceil(clip.height + clip.y + 40), deviceScaleFactor: 2, mobile: false,
  });
  await sleep(400);
  const r = await call('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
  const data = r.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p, `(${Math.round(clip.width)}×${Math.round(clip.height)} css px @2x)`);
}

await shot('wrecked-0-cryo-new.png', '#sec-0-cryo-new');
for (const [key] of SECTIONS) await shot(`wrecked-${key}.png`, `#sec-${key}`);

cdp.close(); chrome.kill('SIGKILL');
log('done');
process.exit(0);
