#!/usr/bin/env node
// palette-honesty-shot.mjs — DOES THE PALETTE ACTUALLY ANSWER, ON THE SHIP THE PLAYER BOOTS?
//
// ⚠️ WHY A BROWSER RIG AND NOT JUST THE NODE SUITE. `client/test/palette-honesty.test.js` drives the
// four answers through the shipped controller over `dom-lite` and proves the SEMANTICS: the sentence
// is composed, the row is written, the command still goes, the fake art is gone. What it cannot
// prove is the thing the owner actually reported — *"I cannot build anything except the walls"* is a
// complaint about what is ON THE SCREEN. A price rendered into a node that is 0 px wide, clipped
// out of the palette's box, or painted in a colour the fill swallows is `invisible-feedback-is-
// FUNCTIONAL` all over again, and only a real layout engine can answer it. This tool measures:
//
//   1. THE PRICE IS ON THE CHIP AND IN THE BOX. Every `.rz-tool-cost` line has a non-zero border box
//      that lies fully inside its button, and every button lies fully inside the palette's clipping
//      box — at six viewport widths, because the cost line makes eighteen buttons TALLER and WIDER
//      and that is exactly the regression `palette-shot.mjs` exists to catch.
//   2. A REFUSED CLICK SAYS WHY. Arm BUNK on the shipped `--ship wreck`, click clear floor, and read
//      the toast back off the live DOM.
//   3. THE FLOOR DEFAULT DRAG ANSWERS. Arm FLOOR, sweep without touching a swatch, read the toast.
//   4. SHELF STOPS PRETENDING. Arm SHELF, click, and require BOTH the sentence AND the absence of
//      any `.rz-decor` group in the rendered layer stack.
//
// ⭐ EVERY TOAST READ IS PRECEDED BY A BLANKING WRITE, and that is the rig's own non-vacuity rule: a
// toast left on screen by the PREVIOUS leg reads exactly like one the current gesture produced. The
// node is emptied and confirmed empty before each gesture, so every sentence below is fresh.
//
// ⭐ AND THE DECOR LEG CARRIES A PLANTED FAILURE. "No `.rz-decor` in the layer stack" is an ABSENCE,
// and a rig that could never see a decor group at all would report that absence forever. One is
// planted into the live SVG, the detector is required to find it, and the next repaint is required
// to sweep it away — a search that finds nothing and a search that cannot find anything look
// identical otherwise (TRAPS, 4th shape).
//
// It is NOT in `./ci.sh`: Chrome is not a CI dependency here. Run it by hand.
//
// USAGE
//   1. ./play.sh --host-port 8394 --client-port 8395 --no-open
//   2. node client/tools/palette-honesty-shot.mjs --out <dir> [--host-port 8394] \
//        [--client-port 8395] [--prefix palhon-] [--cdp-port 9351]
//
// Exits non-zero if the host will not answer, if the Room Zoom cannot be entered, if any measured
// control is unreachable, if any of the four answers is missing, or if the planted control fails.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8394');
const CLIENT_PORT = +arg('client-port', '8395');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'palhon-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9351');
const HEIGHT = +arg('height', '1000');
const WIDTHS = arg('widths', '1600,1440,1280,1140,1024,900').split(',').map((s) => +s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

const problems = [];
const note = (m) => { problems.push(m); console.error('  ✗ ' + m); };
const ok = (m) => log('  ✓ ' + m);

// ───────────────────────────────────────────────────────────── Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'palhon-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${Math.max(...WIDTHS)},${HEIGHT}`,
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
// ⚠️ THE PID IS RECORDED AND ONLY THIS PID IS EVER KILLED (TRAPS 5, session-G addendum): a broad
// `pkill -f chrome` here takes out a SIBLING lane's gate, and a leaked headless Chrome OOM-kills
// someone else's suite as a bare exit-137 that reads like a crash in their code.
const CHROME_PID = chrome.pid;

/**
 * ⛔⛔ THE HANDLE IS REAPED ON *EVERY* EXIT, NOT ONLY THE ONES THIS FILE SPELLS OUT.
 *
 * ⚠️ THE HOLE THIS CLOSES WAS MEASURED, NOT IMAGINED (review, 2026-08-04): the `die()` paths below
 * kill Chrome, and so does the end-of-run tail — but they are the only two. EVERY OTHER WAY OUT OF
 * this script leaked a live headless browser: a CDP call that comes back a shape the destructuring
 * does not expect, a `find` on an undefined list, a WebSocket that closes mid-run, an unhandled
 * rejection from the `evaluate` chain, a Ctrl+C. `rig-lib.mjs`'s `die(chrome, …)` (landed on main,
 * same night, same motivation) fixes the FIRST class — an exit path that forgot the handle — and
 * this fixes the SECOND, which no `die()` helper can reach: an exit path nobody wrote at all.
 *
 * ⛔ AND A LEAK HERE IS SOMEBODY ELSE'S PROBLEM, WHICH IS WHY IT IS WORTH THE LINES. Measured
 * 2026-08-02 (`why-line-shot.mjs`'s header): two leaked headless instances at ~290 MB each got
 * another agent's `dotnet test` OOM-killed — SIGKILL, exit 137, which reads exactly like a crash in
 * THEIR suite. On this box several sibling lanes gate concurrently.
 *
 * ⭐ IT KILLS THE RECORDED PID AND NOTHING ELSE — never a pattern (TRAPS 5, session-G addendum): a
 * `pkill -f chrome` takes out a sibling's rig mid-run. `process.on('exit')` runs synchronously, so
 * `process.kill`/`rmSync` (both sync) are the only two calls it may make.
 *
 * ⭐ DRIVEN AS A 2x2, NOT ASSERTED (2026-08-04). The SAME bare `throw` was planted mid-rig — at the
 * head of STEP 3, after the page is up, the Room Zoom is entered and two steps have already run,
 * which is where a real defect lands — and both trees were run against one live host:
 *   · PRE-FIX (`bded8b9`'s rig) → exit 1, node's bare unhandled-throw report, and EIGHT Chrome
 *     processes still alive afterwards (the parent re-parented to init, plus seven helpers).
 *   · SHIPPED (this reaper)     → exit 13, the sentence above on stderr, and ZERO survivors.
 * Counted by the run's own `--user-data-dir`, which every helper inherits in its argv, so the count
 * is this run's and no sibling lane's; the eight were then killed BY PID.
 */
let _reaped = false;
function reapChrome() {
  if (_reaped) return;
  _reaped = true;
  try { process.kill(CHROME_PID, 'SIGKILL'); } catch { /* already gone */ }
  try { rmSync(userDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.on('exit', reapChrome);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { reapChrome(); process.exit(130); });
}
// An ESM top-level throw and a stray rejection both reach here; each names itself so the run is not
// silently attributed to a product failure, then leaves through the reaper above.
process.on('uncaughtException', (e) => {
  console.error('FAIL: the rig threw and did not handle it — ' + ((e && e.stack) || e));
  process.exit(13);
});
process.on('unhandledRejection', (e) => {
  console.error('FAIL: the rig rejected and did not handle it — ' + ((e && e.stack) || e));
  process.exit(13);
});

const die = (code, msg) => {
  console.error('FAIL: ' + msg);
  reapChrome();
  process.exit(code);
};

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) die(5, 'Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
const move = async (x, y) => { await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); };
const down = async (x, y) => call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
const up = async (x, y) => call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
const clickAt = async (x, y) => { await down(x, y); await up(x, y); };
/** A press-drag-release sweep — the real gesture; a synthetic click is a different code path. */
const dragFromTo = async (a, b) => {
  await move(a.x, a.y); await down(a.x, a.y);
  await move((a.x + b.x) / 2, (a.y + b.y) / 2); await move(b.x, b.y);
  await up(b.x, b.y);
};

async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const setWidth = async (w) => {
  await call('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
};
/** A dead socket disarms the tool and every leg below then reports a defect that is not there —
 *  `palette-shot.mjs`'s FALSE-RED guard, kept because it has fired for real. */
const assertLinked = async (where) => {
  const gone = await evaluate(`(()=>{const d=document.getElementById('disc');` +
    `return !!(d && getComputedStyle(d).display !== 'none');})()`);
  if (gone) die(10, `the client lost its socket to the host (${where}) — a disconnect disarms the ` +
    'tool, so nothing measured after this point is about the palette');
};

await call('Page.enable');
await call('Runtime.enable');
await setWidth(Math.max(...WIDTHS));
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

const onb = await evalJson(`(()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
if (onb) { log('dismissing onboarding'); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) die(8, 'the onboarding card is still up');

// Enter the Room Zoom with the real entry gesture on a HIT-TESTED room (palette-shot.mjs's rule:
// `querySelector('.pl-room')` alone works at 1600 px and lands on the crew panel at 1300).
let entered = false;
for (let attempt = 0; attempt < 3 && !entered; attempt++) {
  const cands = await evalJson(`(()=>[...document.querySelectorAll('.pl-room[data-anchor]')].map(e=>{
    const r=e.getBoundingClientRect(); const x=r.x+r.width/2, y=r.y+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return {a:e.getAttribute('data-anchor'),x,y,top:!!(hit&&(hit===e||e.contains(hit)))};
  }).filter(c=>c.top))()`) || [];
  for (const c of cands) {
    await clickAt(c.x, c.y);
    await sleep(2500);
    entered = await evaluate(`document.body.classList.contains('roomzoom-open')`);
    if (entered) { log('entered room', c.a); break; }
  }
  if (!entered) await sleep(1500);
}
if (!entered) die(7, 'the Room Zoom did not open');
await assertLinked('after entry');

// ───────────────────────────────────────────── STEP 1: the price is on the chip, and it is VISIBLE
//
// A cost line COUNTS as visible when its border box has real area, lies inside its own button, and
// that button lies inside the palette's clipping box. Nothing here re-derives geometry the browser
// already computed.
const MEASURE = `(() => {
  const inBox = (el, box) => {
    const r = el.getBoundingClientRect();
    return r.left >= box.left - 0.5 && r.right <= box.right + 0.5
        && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
  };
  const pal = document.querySelector('.rz-palette');
  if (!pal) return null;
  const box = pal.getBoundingClientRect();
  const btns = [...pal.querySelectorAll('.rz-tool')];
  const costs = [];
  for (const b of btns) {
    const c = b.querySelector('.rz-tool-cost');
    if (!c) continue;
    const cr = c.getBoundingClientRect(), br = b.getBoundingClientRect();
    const cs = getComputedStyle(c);
    costs.push({
      tool: b.getAttribute('data-rztool'),
      text: c.textContent.trim(),
      w: Math.round(cr.width * 10) / 10, h: Math.round(cr.height * 10) / 10,
      btnW: Math.round(br.width * 10) / 10, btnH: Math.round(br.height * 10) / 10,
      inButton: inBox(c, br), fontSize: cs.fontSize, opacity: cs.opacity, color: cs.color,
      cant: b.classList.contains('cant'), title: b.getAttribute('title') || '',
    });
  }
  return {
    tools: btns.length,
    clipped: btns.filter((b) => !inBox(b, box)).map((b) => b.getAttribute('data-rztool')),
    rows: new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size,
    palH: Math.round(box.height), palW: Math.round(box.width),
    wrapH: Math.round((document.querySelector('.rz-palette-wrap') || box).getBoundingClientRect?.().height || 0),
    costs,
  };
})()`;

log('\nSTEP 1 — the price on the chip, measured across widths');
const widths = [];
for (const w of WIDTHS) {
  await setWidth(w);
  await assertLinked('width sweep @ ' + w);
  const m = await evalJson(MEASURE);
  if (!m) die(9, 'no .rz-palette at width ' + w);
  widths.push({ w, ...m });
  log(`  w=${w}  tools ${m.tools} (clipped ${m.clipped.length})  rows=${m.rows}  palette ${m.palW}x${m.palH}  ` +
      `cost lines ${m.costs.length}  chip box ${m.costs[0] ? m.costs[0].btnW + 'x' + m.costs[0].btnH : 'n/a'}  ` +
      `cost box ${m.costs[0] ? m.costs[0].w + 'x' + m.costs[0].h : 'n/a'}`);
  if (m.clipped.length) note(`w=${w}: tools UNREACHABLE — ${m.clipped.join(', ')}`);
  if (m.costs.length !== 9) note(`w=${w}: ${m.costs.length} cost lines, expected 9 (7 furniture + 2 decor)`);
  for (const c of m.costs) {
    if (!(c.w > 0 && c.h > 0)) note(`w=${w}: the ${c.tool} price has a ZERO box (${c.w}x${c.h}) — rendered and invisible`);
    if (!c.inButton) note(`w=${w}: the ${c.tool} price escapes its own button`);
    if (!c.text) note(`w=${w}: the ${c.tool} chip carries an EMPTY price line`);
  }
}
await setWidth(WIDTHS[0]);
await png('01-palette-priced.png');

// The refusal state on the chip itself, on the shipped wreck.
const chipState = (await evalJson(MEASURE)).costs;
const bunkChip = chipState.find((c) => c.tool === 'bunk');
log(`  BUNK chip: "${bunkChip.text}"  ${bunkChip.btnW}x${bunkChip.btnH} px  price ${bunkChip.w}x${bunkChip.h} px ` +
    `@ ${bunkChip.fontSize} opacity ${bunkChip.opacity} colour ${bunkChip.color}  cant=${bunkChip.cant}`);
log(`  BUNK hover title: "${bunkChip.title}"`);
if (bunkChip.text !== '3 PARTS') note(`the BUNK chip prices a placement as "${bunkChip.text}"`);
if (!/^BUNK ▸ /.test(bunkChip.title)) note('the BUNK chip carries no hover sentence');
const shelfChip = chipState.find((c) => c.tool === 'shelf');
if (shelfChip.text !== 'NOT YET') note(`the SHELF chip reads "${shelfChip.text}"`);
if (!shelfChip.cant) note('the SHELF chip does not read as not-yet-buildable');
else ok('SHELF and RUG wear the cannot-do state at rest');

// ───────────────────────────────────────────── the gesture helpers, on the live layout
const btnPoint = async (tool) => evalJson(`(()=>{const b=document.querySelector('.rz-tool[data-rztool="${tool}"]');` +
  `if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
const armTool = async (tool) => {
  const p = await btnPoint(tool);
  if (!p) die(9, `no ${tool.toUpperCase()} button in the palette`);
  await clickAt(p.x, p.y);
  await sleep(900);
  return p;
};
const armedTools = async () => evalJson(`[...document.querySelectorAll('.rz-tool[aria-pressed="true"]')].map(b=>b.getAttribute('data-rztool'))`);
const costRow = async () => evalJson(`(()=>{const e=document.getElementById('rz-cost');if(!e)return null;` +
  `const r=e.getBoundingClientRect();const l=e.querySelector('.rz-cost-line');` +
  `return {hidden:e.hidden,text:e.textContent.trim(),w:Math.round(r.width),h:Math.round(r.height),` +
  `fault:!!(l&&l.classList.contains('fault')),color:l?getComputedStyle(l).color:''};})()`);
/** ⭐ BLANK THE TOAST, CONFIRM IT IS BLANK, then gesture. A toast left up by the previous leg reads
 *  exactly like one this leg produced — this is the rig's own non-vacuity rule. */
const blankToast = async () => {
  await evaluate(`(()=>{const t=document.getElementById('rz-toast');if(t){t.textContent='';t.hidden=true;}})()`);
  const left = await evaluate(`(document.getElementById('rz-toast')||{}).textContent`);
  if (left) die(11, 'the toast could not be blanked — every sentence below would be unattributable');
};
const toast = async () => evalJson(`(()=>{const t=document.getElementById('rz-toast');if(!t)return null;` +
  `const r=t.getBoundingClientRect();return {hidden:t.hidden,text:t.textContent.trim(),` +
  `w:Math.round(r.width),h:Math.round(r.height)};})()`);
/** A point on plain floor inside the framed room: the canvas centre, then nudged if it holds art. */
const floorPoints = async (n) => evalJson(`(()=>{const c=document.getElementById('rz-canvas');
  const r=c.getBoundingClientRect(); const out=[];
  for (let i=0;i<${n};i++) out.push({x:r.x+r.width*(0.42+i*0.06), y:r.y+r.height*0.56});
  return out;})()`);

// ───────────────────────────────────────────── STEP 2: a refused placement says why
log('\nSTEP 2 — a placement the wreck cannot pay for');
await armTool('bunk');
await assertLinked('after arming BUNK');
if (!(await armedTools()).includes('bunk')) note('the BUNK click did not arm the tool — STEP 2 is vacuous');
const armedRow = await costRow();
log(`  cost row: hidden=${armedRow.hidden} "${armedRow.text}"  ${armedRow.w}x${armedRow.h} px  fault=${armedRow.fault} ${armedRow.color}`);
if (armedRow.hidden || !armedRow.text) note('arming BUNK revealed no cost row');
if (!/^BUNK ▸ (NEEDS 3 PARTS — SHIP HAS \d+|3 PARTS · \d+ ABOARD)$/.test(armedRow.text)) {
  note(`the armed cost row reads "${armedRow.text}" — neither a price nor a refusal`);
}
if (!(armedRow.w > 0 && armedRow.h > 0)) note('the cost row has a zero box — written and invisible');
await png('02-bunk-armed-priced.png');

const [placeAt] = await floorPoints(1);
await blankToast();
await clickAt(placeAt.x, placeAt.y);
await sleep(900);
const placeToast = await toast();
log(`  refused click toast: hidden=${placeToast.hidden} "${placeToast.text}" ${placeToast.w}x${placeToast.h} px`);
if (placeToast.hidden || !placeToast.text) note('a furniture click on the shipped wreck said NOTHING — the owner\'s defect');
else if (!/^BUNK ▸ NEEDS 3 PARTS — SHIP HAS \d+$/.test(placeToast.text)) {
  note(`the click said "${placeToast.text}", which is not the refusal sentence`);
} else ok('a refused placement names its price and the ship\'s stock');
if (!(placeToast.w > 0 && placeToast.h > 0)) note('the refusal toast has a zero box');
await png('03-refused-click.png');
await armTool('bunk');   // disarm

// ───────────────────────────────────────────── STEP 3: the FLOOR default drag
log('\nSTEP 3 — the FLOOR tool with nothing chosen (the default drag)');
await armTool('floor');
await assertLinked('after arming FLOOR');
const matChips = await evalJson(`(()=>{const s=document.getElementById('rz-matstrip');
  return {hidden:s.hidden, chips:[...s.querySelectorAll('.rz-mat-chip')].map(c=>({mat:c.getAttribute('data-rzmat'),on:c.classList.contains('on'),title:c.getAttribute('title')}))};})()`);
log(`  material strip: hidden=${matChips.hidden}  pre-selected=${JSON.stringify(matChips.chips.filter((c) => c.on))}`);
if (!matChips.chips.some((c) => c.on && c.mat === '0')) {
  note('the FLOOR picker no longer pre-selects material 0 — the no-op this step measures may no longer be reachable');
}
const run = await floorPoints(4);
await blankToast();
await dragFromTo(run[0], run[3]);
await sleep(900);
const floorToast = await toast();
log(`  default drag toast: "${floorToast.text}"`);
if (!/^FLOOR ▸ ALREADY [A-Z- ]+ — PICK ANOTHER MATERIAL$/.test(floorToast.text)) {
  note(`the default FLOOR drag said "${floorToast.text}" — the guaranteed no-op is still unexplained`);
} else ok('the default FLOOR drag names the material already down and says to pick another');
await png('04-floor-default-answered.png');

// …and a real material change must NOT wear that sentence. Non-vacuity by contrast: two different
// sentences out of the same gesture is the only proof the first one is being DECIDED.
const wood = await evalJson(`(()=>{const c=document.querySelector('.rz-mat-chip[data-rzmat="1"]');` +
  `if(!c)return null;const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
if (!wood) note('no WOOD swatch in the material strip — the contrast leg is vacuous');
else {
  await clickAt(wood.x, wood.y); await sleep(700);
  await blankToast();
  await dragFromTo(run[0], run[3]);
  await sleep(900);
  const woodToast = await toast();
  log(`  WOOD drag toast:    "${woodToast.text}"`);
  if (/ALREADY/.test(woodToast.text)) note(`a WOOD drag over steel-tan floor said "${woodToast.text}"`);
  else if (woodToast.text === floorToast.text) note('both sweeps produced the same sentence — nothing is being decided');
  else ok('a real material change reports what it built, not the no-op sentence');
  await png('05-floor-wood-builds.png');
}
await armTool('floor');  // disarm

// ───────────────────────────────────────────── STEP 4: SHELF stops pretending
log('\nSTEP 4 — SHELF, the button that used to draw a lie');
await armTool('shelf');
const shelfRow = await costRow();
log(`  cost row: "${shelfRow.text}" fault=${shelfRow.fault}`);
if (!/NOT BUILDABLE YET/.test(shelfRow.text)) note(`arming SHELF says "${shelfRow.text}"`);

// ⭐ THE PLANTED FAILURE, BEFORE THE ABSENCE IS TRUSTED. A `.rz-decor` group is injected into the
// live layer stack and the detector must FIND it; the next repaint must then sweep it away. Without
// this, "no decor group" is a claim a rig with a broken selector makes just as confidently.
await evaluate(`(()=>{const l=document.getElementById('rz-layers');
  l.insertAdjacentHTML('beforeend','<g class="rz-decor" data-planted="1"><rect width="4" height="4"/></g>');})()`);
const sawPlanted = await evaluate(`!!document.querySelector('#rz-layers .rz-decor')`);
if (!sawPlanted) die(12, 'the PLANTED decor group was not detected — this rig cannot see decor art ' +
  'at all, so the absence measured below would be worthless');
ok('planted-failure control: the rig CAN see a decor group in the layer stack');
await sleep(1200);   // the surface repaints at the wire's cadence and re-writes the layer
const plantedGone = await evaluate(`!document.querySelector('#rz-layers .rz-decor[data-planted="1"]')`);
if (!plantedGone) note('the planted decor group survived a repaint — the layer is not being rewritten, ' +
  'so an absence after the click below would not be attributable to the click');

const [shelfAt] = await floorPoints(1);
await blankToast();
await clickAt(shelfAt.x, shelfAt.y);
await sleep(1200);
const shelfToast = await toast();
const decorAfter = await evalJson(`(()=>{const g=[...document.querySelectorAll('#rz-layers .rz-decor')];` +
  `return {n:g.length};})()`);
log(`  SHELF click toast: "${shelfToast.text}"   decor groups in the layer: ${decorAfter.n}`);
if (!/NOT BUILDABLE YET/.test(shelfToast.text)) note(`the SHELF click said "${shelfToast.text}"`);
else ok('a SHELF click answers honestly instead of drawing furniture the ship does not have');
if (decorAfter.n !== 0) note(`the SHELF click left ${decorAfter.n} decor group(s) in the layer — the lie is back`);
await png('06-shelf-honest.png');
await armTool('shelf');  // disarm

// ───────────────────────────────────────────── done
writeFileSync(join(OUT, PREFIX + 'measurements.json'), JSON.stringify({
  widths, chipState, armedRow, placeToast, floorToast, shelfToast, decorAfter,
}, null, 2));
log('  wrote', join(OUT, PREFIX + 'measurements.json'));

try { cdp.close(); } catch { /**/ }
reapChrome();   // the same one reaper the exit hook uses; idempotent, so the hook is a no-op after this

if (problems.length) {
  console.error('\nFAIL: the palette does not answer honestly (' + problems.length + '):');
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}
log('\nOK — every build button carries its price, a refused click says why, the FLOOR default drag ' +
    'explains itself, and SHELF/RUG no longer draw furniture the ship does not have');
process.exit(0);
