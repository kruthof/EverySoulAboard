#!/usr/bin/env node
// blocked-shot.mjs — SCREENSHOT the `blocked` layer on the STANDARD SURFACE (Level-2 Room Zoom).
//
// ⚠️ WHY THIS EXISTS, and it is the `marks-shot.mjs` argument one channel later. Every assertion
// about this layer reads a STRING. A perfectly formed SVG string paints nothing if its container has
// zero height, if a `display:none` rule catches it, or if an opaque sprite is stacked on top of it —
// and the emitted text is BYTE-IDENTICAL in the working and the broken case, so no test in this repo
// can tell those apart. This channel's ENTIRE PURPOSE is that the player can see why an order is
// doing nothing, so "the assertions are green" is not evidence. `docs/design/shots/` gets the
// pictures and the owner judges the art.
//
// WHAT IT PHOTOGRAPHS, AND IT IS A LIVE CASE, NOT A FIXTURE. `--ship grid` AUTHORS twenty dig
// designations in the hold (a 10x2 rubble block at x 23-32, y 15-16, deck 1) and TEN of them — the
// inner row — have no walkable neighbour at all, so nothing can be staged beside them until the outer
// row is cleared. Those ten badges are on the shipping game's own standard surface, from the first
// frame the crew light that corner. Nothing is planted to produce them.
//
// IT ALSO PAINTS A CONTROL: thirty-two wall-build orders across the same room, in breathable air.
// They are ordinary pending orders and they must be UNBADGED. A picture in which every order carries
// a badge would prove nothing — the interesting claim is that the layer DISCRIMINATES.
//
// ⚠️ THE `air` REASON IS NOT REACHABLE ON THE STANDARD SURFACE OF `--ship grid`, and that is a
// finding rather than a limitation of this tool: the only decks carrying BOUND ROOMS are 0 and 1, and
// every room on both reads ~101.3 kPa. So an airless worksite exists on grid (decks 2-7, the void)
// but never inside a room the Room Zoom can enter. `--air-demo` therefore pushes an `air` payload
// into the LIVE CLIENT's own wire cache — through a dynamic `import()` of the page's own `hud.js`,
// which ES-module caching makes the SAME instance `main.js` dispatches into, i.e. the real
// `case 'blocked'` path with a synthetic payload. The HOST IS NOT MODIFIED and the resulting file is
// named `-air-injected` so nobody can mistake it for a live capture.
//
// USAGE
//   1. ./play.sh --host-port 8372 --client-port 8373 --no-open
//   2. node client/tools/blocked-shot.mjs --out docs/design/shots [--host-port 8372] [--air-demo]
//
// Exits non-zero if the host will not answer, if the blocked rows are not there, or if Chrome never
// paints — a green run with no pictures is the failure this tool exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const HOST_PORT = +arg('host-port', '8372');
const CLIENT_PORT = +arg('client-port', '8373');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'blocked-');
const DECK = +arg('deck', '1');
const ROOM = arg('room', 'hold');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9337');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// ───────────────────────────────────────────────────────────── 1. drive the sim over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
// DECK IS GLOBAL SESSION STATE on the host, so step toward the target with the right sign — an
// increment-only loop silently walks past it (the marks-shot finding, inherited rather than repeated).
for (let i = 0; i < 16; i++) {
  const cur = latest.get('frame')?.deck | 0;
  if (cur === DECK) break;
  send({ cmd: 'deck', dz: Math.sign(DECK - cur) });
  await sleep(450);
}
await sleep(1500);
if ((latest.get('frame')?.deck | 0) !== DECK) { console.error('FAIL: could not reach deck ' + DECK); process.exit(2); }

const blockedOf = () => (latest.get('blocked')?.cells || []).filter((c) => (c[2] | 0) === DECK);
const census = () => {
  const by = {}; for (const c of blockedOf()) by[`order${c[3]}/reason${c[4]}`] = (by[`order${c[3]}/reason${c[4]}`] || 0) + 1;
  return by;
};
log('LIVE blocked rows on deck ' + DECK + ':', blockedOf().length, JSON.stringify(census()));
if (blockedOf().length === 0) {
  console.error('FAIL: nothing is blocked on deck ' + DECK + ' — there is nothing to photograph, and '
    + 'a picture of an unbadged room would be mistaken for evidence that the layer works');
  process.exit(3);
}

// THE CONTROL: ordinary pending orders in the same room, in good air, which must stay UNBADGED.
const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slot = deckSlots(dView, DECK).find((s) => s.anchorName === ROOM);
if (!slot) { console.error('FAIL: room "' + ROOM + '" is not on deck ' + DECK); process.exit(3); }
const R = slot.rect;
log('room', ROOM, 'rect', `${R.x},${R.y} ${R.w}x${R.h}`);
const before = blockedOf().length;
for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) send({ cmd: 'build', kind: 'wall', x, y });
await sleep(3000);
const designs = (latest.get('designs')?.designs || latest.get('designs')?.cells || []).length;
log('CONTROL: painted wall builds across the room —', designs, 'pending designs;',
    'blocked rows', before, '->', blockedOf().length, JSON.stringify(census()));

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'blocked-shot-'));
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
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '3') } } : { format: 'png' });
  const data = r.result?.data;
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

// Dismiss the onboarding takeover with a REAL pointer click on its own button — it swallows both the
// screenshot and the room click, and photographing the card is a false negative wearing a picture.
const onbBox = await evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onbBox && onbBox !== 'null') {
  const { x: bx, y: by } = JSON.parse(onbBox);
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x: bx, y: by, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(2500);
}
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) {
  console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it');
  process.exit(8);
}

await png('overview.png');

// ── Level 2: the Room Zoom, entered with a REAL pointer click on the room ──
const rect = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${ROOM}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (!rect || rect === 'null') { console.error('FAIL: .pl-room[data-anchor="' + ROOM + '"] not in the DOM'); process.exit(7); }
const { x: cx, y: cy } = JSON.parse(rect);
for (const type of ['mousePressed', 'mouseReleased'])
  await call('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
await sleep(4000);

async function reportDom(tag) {
  const n = await evaluate(`document.querySelectorAll('.rz-blockeds .rz-blocked').length`);
  const scrims = await evaluate(`document.querySelectorAll('.rz-blocked-scrim').length`);
  const badges = await evaluate(`document.querySelectorAll('.rz-blocked-badge').length`);
  const ghosts = await evaluate(`document.querySelectorAll('.rz-ghost, [class*="ghost"]').length`);
  const box = await evaluate(`JSON.stringify((()=>{const g=document.querySelector('.rz-blockeds');if(!g)return null;const r=g.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),vis:getComputedStyle(g).visibility,disp:getComputedStyle(g).display,op:getComputedStyle(g).opacity};})())`);
  const key = await evaluate(`(document.getElementById('rz-zonekey')||{}).textContent||''`);
  const keyHidden = await evaluate(`!!(document.getElementById('rz-zonekey')||{}).hidden`);
  log(`${tag}: .rz-blocked=${n} scrims=${scrims} badges=${badges} ghosts=${ghosts}`);
  log(`  layer box = ${box}`);
  log(`  key hidden=${keyHidden} text="${String(key).trim()}"`);
  return n;
}
const drawn = await reportDom('ROOM ZOOM (live, no_approach)');
if (!drawn) {
  console.error('FAIL: the Room Zoom drew NO blocked badge although the wire carries rows — the layer '
    + 'is emitting a string nobody paints, which is exactly what this tool exists to catch');
  process.exit(9);
}
await png('roomzoom.png');
const clip = await evaluate(`JSON.stringify((()=>{const es=[...document.querySelectorAll('.rz-blocked')];if(!es.length)return null;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const e of es){const r=e.getBoundingClientRect();x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.width);y1=Math.max(y1,r.y+r.height);}const pad=40;return {x:Math.max(0,x0-pad),y:Math.max(0,y0-pad),width:(x1-x0)+pad*2,height:(y1-y0)+pad*2};})())`);
if (clip && clip !== 'null') await png('roomzoom-crop.png', JSON.parse(clip));

// ── the `air` reason, INJECTED (see this file's header) ──
if (has('air-demo')) {
  const tiles = [];
  for (let i = 0; i < 4; i++) tiles.push([R.x + 2 + i, R.y + 3, DECK, 2, 0]);   // order=build reason=air
  const ok = await evaluate(`(async()=>{const H=await import('/src/ui/hud.js');`
    + `H.renderBlocked({type:'blocked',cells:${JSON.stringify(tiles)}});return true;})()`);
  if (!ok) log('  (air-demo: could not reach the page\'s hud.js module — skipped)');
  else {
    await sleep(2500);
    await reportDom('ROOM ZOOM (air, INJECTED — host unmodified)');
    await png('roomzoom-air-injected.png');
    const c2 = await evaluate(`JSON.stringify((()=>{const es=[...document.querySelectorAll('.rz-blocked')];if(!es.length)return null;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const e of es){const r=e.getBoundingClientRect();x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.width);y1=Math.max(y1,r.y+r.height);}const pad=40;return {x:Math.max(0,x0-pad),y:Math.max(0,y0-pad),width:(x1-x0)+pad*2,height:(y1-y0)+pad*2};})())`);
    if (c2 && c2 !== 'null') await png('roomzoom-air-injected-crop.png', JSON.parse(c2));
  }
}

cdp.close();
chrome.kill('SIGKILL');
log('done');
process.exit(0);
