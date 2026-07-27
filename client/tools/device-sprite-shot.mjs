#!/usr/bin/env node
// device-sprite-shot.mjs — PHOTOGRAPH the device furniture on the STANDARD SURFACE.
//
// ⚠️ WHY THIS EXISTS. `client/test/device-sprite-coverage.test.js` proves the shipping Room Zoom
// writes item SVG rather than the VS-Z-25 "unknown glyph" chip. It proves that about a STRING. A
// perfectly formed `<g class="pl-item">` paints nothing if its container has no height, if a
// stacking rule buries it, or if the piece draws off its own viewBox — and the emitted text is
// byte-identical in the working and the broken case. HANDOVER §4l was found by a person looking at
// the screen, so it is settled by a person looking at the screen.
//
// It is a straight sibling of `client/tools/marks-shot.mjs` (read its header — three run-costing
// lessons live there): drive a live `--ship grid` host, drive real Chrome over CDP, dismiss the
// onboarding takeover with a REAL click, enter the room with a REAL pointerdown/pointerup.
//
// ⚠️ THE HONESTY TRAP IT IS BUILT AROUND, learned by `marks-shot.mjs` at the cost of a whole run:
// A PICTURE OF A TILE WITH NO GROW BED PROVES NOTHING. This tool therefore CENSUSES the room's own
// frame first, refuses to run if the room carries none of the glyphs under test, prints exactly
// which tiles carry which, and crops around a tile it has located in the LIVE DOM.
//
// USAGE
//   1. ~/.dotnet/dotnet run --project hosts/web -- --port 8420 --ship grid   (and client/serve.py)
//   2. node client/tools/device-sprite-shot.mjs --out <dir> --prefix sprites-before-

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8420');
const CLIENT_PORT = +arg('client-port', '8421');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'sprites-');
const ROOM = arg('room', 'hydro');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9345');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// THE GLYPHS UNDER TEST — the three §4l kinds, plus a control glyph the surface has always skinned.
const UNDER_TEST = { '"': 'GrowBed', T: 'Terminal', x: 'Telescope' };

// ───────────────────────────────────────────────────────────── 1. the sim, over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, itemForGlyph } = await import('../src/ui/room-model.js');

// Find the deck the target room lives on, then STEP TOWARD IT (deck is global session state on the
// host; an increment-only loop walks straight past — marks-shot.mjs lesson 1).
const dv = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
let want = null;
for (const d of dv) {
  for (const s of deckSlots(dv, d.deck)) if (s.anchorName === ROOM) want = { deck: d.deck, slot: s };
}
if (!want) { console.error('FAIL: no room anchored "' + ROOM + '" on any deck'); process.exit(2); }
log('room', ROOM, 'is on deck', want.deck, 'rect', JSON.stringify(want.slot.rect));

for (let i = 0; i < 16; i++) {
  const cur = latest.get('frame')?.deck | 0;
  if (cur === want.deck) break;
  send({ cmd: 'deck', dz: Math.sign(want.deck - cur) });
  await sleep(450);
}
await sleep(1500);
const frame = latest.get('frame');
if (!frame || (frame.deck | 0) !== want.deck) { console.error('FAIL: could not reach deck ' + want.deck); process.exit(2); }

// ── THE NON-VACUITY CENSUS. Which tiles in this room carry the glyphs under test? ──
const r = want.slot.rect;
const found = {};
const tiles = [];
for (let y = r.y; y < r.y + r.h; y++) {
  for (let x = r.x; x < r.x + r.w; x++) {
    const c = frame.cells[y * frame.w + x];
    if (!Array.isArray(c)) continue;
    const ch = String.fromCharCode(c[0] | 0);
    if (!(ch in UNDER_TEST)) continue;
    found[ch] = (found[ch] || 0) + 1;
    tiles.push({ x, y, ch, kind: UNDER_TEST[ch], skinned: !!itemForGlyph(c[0] | 0) });
  }
}
log('CENSUS of room', ROOM, '— glyphs under test:', JSON.stringify(found));
for (const t of tiles) log(`   (${t.x},${t.y}) ${t.ch} = ${t.kind}  skinnedByThisBuild=${t.skinned}`);
if (!tiles.length) {
  console.error('FAIL: this room carries NONE of the glyphs under test — a screenshot of it would\n' +
                'prove nothing. That is the exact vacuous picture marks-shot.mjs cost a run to learn.');
  process.exit(3);
}

// ───────────────────────────────────────────────────────────── 2. real Chrome, over CDP
const userDir = mkdtempSync(join(tmpdir(), 'sprite-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

async function png(name, clip) {
  const res = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '3') } } : { format: 'png' });
  const data = res.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// Dismiss the onboarding takeover with a REAL click on its own BEGIN button (marks-shot lesson 2:
// the first run of that tool photographed the card and reported a false negative).
const onbBox = await evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onbBox && onbBox !== 'null') {
  const { x: bx, y: by } = JSON.parse(onbBox);
  log('dismissing the onboarding card at', bx.toFixed(0) + ',' + by.toFixed(0));
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x: bx, y: by, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(2500);
}
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) {
  console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it');
  process.exit(8);
}

await png('overview.png');

// ── Level 2: enter the room with a REAL pointer gesture ──
const rect = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${ROOM}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (!rect || rect === 'null') { console.error('FAIL: .pl-room[data-anchor="' + ROOM + '"] not in the DOM'); process.exit(7); }
const { x: cx, y: cy } = JSON.parse(rect);
log('clicking room', ROOM, 'at', cx.toFixed(0) + ',' + cy.toFixed(0));
for (const type of ['mousePressed', 'mouseReleased'])
  await call('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
await sleep(4000);

// ── WHAT THE LIVE DOM SAYS. Counted, not eyeballed: how many dashed unknown chips are in the room,
// and what letters do they carry? This is the measurement the picture illustrates.
const chips = await evaluate(`JSON.stringify((()=>{
  const g=document.querySelector('.rz-furniture'); if(!g) return {err:'no .rz-furniture layer'};
  const texts=[...g.querySelectorAll('text')].map(t=>t.textContent);
  const dashed=[...g.querySelectorAll('rect[stroke-dasharray="3 2"]')].length;
  const pieces=[...g.querySelectorAll('g.pl-item')].length;
  const box=g.getBoundingClientRect();
  const cs=getComputedStyle(g);
  return {chipLetters:texts,dashedRects:dashed,items:pieces,
          box:{w:Math.round(box.width),h:Math.round(box.height)},vis:cs.visibility,op:cs.opacity};
})())`);
log('ROOM ZOOM furniture layer:', chips);

await png('roomzoom.png');

// Crop around the FIRST tile under test, located in the live DOM by its own transform. The Room Zoom
// draws each piece at translate(lx, ly) in room-local units; find it by index instead, using the
// glyph census above and the room rect the client itself believes in.
const t0 = tiles[0];
const clip = await evaluate(`JSON.stringify((()=>{
  const layers=document.getElementById('rz-layers'); if(!layers) return null;
  const svg=layers.querySelector('svg')||layers; const b=svg.getBoundingClientRect();
  const vb=(svg.getAttribute&&svg.getAttribute('viewBox')||'').split(/\\s+/).map(Number);
  if(vb.length!==4) return null;
  const sx=b.width/vb[2], sy=b.height/vb[3];
  const lx=(${t0.x} - ${r.x})*32, ly=(${t0.y} - ${r.y})*32;
  const pad=48;
  return {x:Math.max(0,b.x+lx*sx-pad), y:Math.max(0,b.y+ly*sy-pad), width:32*sx+pad*2, height:32*sy+pad*2};
})())`);
if (clip && clip !== 'null') {
  log(`cropping around the ${t0.kind} at (${t0.x},${t0.y})`);
  await png('roomzoom-crop.png', JSON.parse(clip));
} else log('  (could not locate the room SVG viewBox — no crop)');

cdp.close(); ws.close(); chrome.kill('SIGKILL');
log('done.');
process.exit(0);
