#!/usr/bin/env node
// marks-shot.mjs — SCREENSHOT the `marks` layer on the STANDARD SURFACE, both altitudes.
//
// ⚠️ WHY THIS EXISTS. Every assertion about the `marks` channel reads a STRING. A perfectly formed
// SVG string paints nothing if its container has zero height, if a `display:none` rule catches it,
// or if an opaque furniture sprite is stacked on top of it — and the emitted text is BYTE-IDENTICAL
// in the working and the broken case, so no test in this repo can tell those apart. WP-2 shipped a
// mutation-green mark layer that drew every mark at 800–1024 inside a 384-unit viewBox: invisible in
// the running game, nothing red. `lane/strip-visible` then had to be confirmed on a browser rig
// rather than by the suite. This tool is that rig, committed rather than left in a scratchpad — the
// `wp8-capture.mjs` pointer has already rotted twice (see `capture-marks.mjs`'s header).
//
// WHAT IT DOES. Drives a LIVE `--ship grid` host over its own WebSocket with the same `stockpile`
// and `strip` verbs a player's click lowers to, then drives real Chrome over the DevTools protocol:
// navigates the standard client, screenshots the Level-1 Overview, dispatches a REAL pointer click
// on the room (the actual entry gesture, `pointerdown`/`pointerup` on `.pl-room[data-anchor]`, not a
// synthetic `.click()`), and screenshots the Level-2 Room Zoom. It also emits tight CROPS around the
// one tile that is both zoned and condemned, which is the case two independent channels now draw on.
//
// It is DELIBERATELY NOT headless-`--screenshot`: that flag cannot click, so it can only ever see
// Level 1. `art/screenshot-test/slice-shot.mjs` is the `--screenshot` pattern and targets the LEGACY
// WebGL client on `--ship slice`; this is its Level-2-capable sibling for the standard surface.
//
// USAGE
//   1. ./play.sh --host-port 8360 --client-port 8361 --no-open
//   2. node client/tools/marks-shot.mjs --out <dir> [--host-port 8360] [--client-port 8361]
//
// Exits non-zero if the host will not answer, if no zoned+condemned tile can be produced, or if
// Chrome never paints — a green run with no pictures is the failure this tool exists to prevent.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8360');
const CLIENT_PORT = +arg('client-port', '8361');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'marks-');
const DECK = +arg('deck', '1');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9333');
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
// DECK IS GLOBAL SESSION STATE on the host, so it may be anywhere when this tool connects — step
// TOWARD the target with the right sign rather than only upward (an increment-only loop silently
// walks past it and every tile lookup below then reads the wrong deck).
for (let i = 0; i < 16; i++) {
  const cur = latest.get('frame')?.deck | 0;
  if (cur === DECK) break;
  send({ cmd: 'deck', dz: Math.sign(DECK - cur) });
  await sleep(450);
}
await sleep(1500);
if ((latest.get('frame')?.deck | 0) !== DECK) { console.error('FAIL: could not reach deck ' + DECK); process.exit(2); }

const frame = latest.get('frame');
if (!frame) { console.error('FAIL: no frame'); process.exit(2); }
const marksOf = () => (latest.get('marks')?.cells || []).filter((c) => (c[2] | 0) === DECK);
const markAt = (x, y) => (marksOf().find((c) => c[0] === x && c[1] === y) || [])[3];
const cellAt = (x, y) => { const c = frame.cells[y * frame.w + x]; return Array.isArray(c) ? c : null; };

// rooms on this deck, decoded by the CLIENT'S OWN modules — never re-parsed here, so this tool
// cannot drift from what the surface actually believes the geometry is.
const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, itemForGlyph } = await import('../src/ui/room-model.js');
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const roomRects = deckSlots(dView, DECK)
  .filter((s) => s.anchorName)
  .map((s) => ({ anchor: s.anchorName, x: s.rect.x, y: s.rect.y, w: s.rect.w, h: s.rect.h }));
log('rooms on deck', DECK + ':', roomRects.map((r) => `${r.anchor}@${r.x},${r.y} ${r.w}x${r.h}`).join(' | ') || '(none)');

// Pick a DEVICE tile inside a bound room: zone it, then condemn it.
//
// ⚠️ PREFER A TILE THE ROOM ZOOM ACTUALLY SKINS AS FURNITURE (`itemForGlyph`). The whole point of
// question 3 is whether the amber ✕ lands ON TOP of an opaque sprite or underneath it, and a device
// whose glyph has no skin draws nothing to be buried by — photographing that tile would answer the
// question vacuously. The first run of this tool picked glyph 104, which has no skin, and the
// picture could not settle the stacking question at all.
let target = null, fallback = null;
for (const r of roomRects) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const c = cellAt(x, y);
      if (!c || (c[1] | 0) !== 8 || (c[0] | 0) === 35 || markAt(x, y)) continue;
      const cand = { x, y, room: r.anchor, glyph: c[0], skinned: !!itemForGlyph(c[0] | 0) };
      if (cand.skinned) { target = cand; break; }
      if (!fallback) fallback = cand;
    }
  if (target) break;
}
target = target || fallback;
if (target && !target.skinned)
  log('⚠️ no SKINNED device tile found — the stacking question cannot be answered from these pictures');
if (!target) { console.error('FAIL: no un-marked device tile inside a bound room on deck ' + DECK); process.exit(3); }
log('TARGET device tile', target);

// zone a small rectangle around it (so the tint is unmistakable), then condemn the device
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
  send({ cmd: 'stockpile', x: target.x + dx, y: target.y + dy, on: 1 });
await sleep(1500);
send({ cmd: 'strip', x: target.x, y: target.y, on: 1 });
await sleep(2500);
const kind = markAt(target.x, target.y);
log(`after ZONE+STRIP: marks kind at (${target.x},${target.y}) = ${kind} (2=stockpile 3=strip); ` +
    `frame fg = ${cellAt(target.x, target.y)?.[1]}`);
if (kind !== 3) { console.error('FAIL: the zoned+condemned tile does not ship `strip` — nothing to photograph'); process.exit(4); }
const census = {}; for (const c of marksOf()) census[c[3]] = (census[c[3]] || 0) + 1;
log('marks census on deck (0=debris 1=dig 2=stockpile 3=strip):', JSON.stringify(census));

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'marks-shot-'));
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
    const r = await fetch(`http://localhost:${CDP_PORT}/json/list`);
    const list = await r.json();
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

// DISMISS THE ONBOARDING TAKEOVER FIRST. `onboarding.js` opens a full-screen card on a fresh
// profile, and it swallows both the screenshot and the room click — the first run of this tool
// photographed the card and reported "0 marks in the Room Zoom", which is exactly the kind of
// false negative a picture is supposed to prevent. Dismissed with a REAL pointer click on its own
// BEGIN button, not by removing the node, so the surface reaches its normal post-onboarding state.
const onbBox = await evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onbBox && onbBox !== 'null') {
  const { x: bx, y: by } = JSON.parse(onbBox);
  log('dismissing the onboarding card at', bx.toFixed(0) + ',' + by.toFixed(0));
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x: bx, y: by, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(2500);
}
const stillUp = await evaluate(`!!document.querySelector('[data-onb-begin]')`);
if (stillUp) { console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it'); process.exit(8); }

// ── Level 1: the Overview ──
const ovMarks = await evaluate(`document.querySelectorAll('.pl-marks .mk').length`);
const ovStrip = await evaluate(`document.querySelectorAll('.pl-marks .mk-strip').length`);
const ovBox = await evaluate(`JSON.stringify((()=>{const g=document.querySelector('.pl-marks');if(!g)return null;const r=g.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vis:getComputedStyle(g).visibility,disp:getComputedStyle(g).display,op:getComputedStyle(g).opacity};})())`);
log('OVERVIEW: .mk groups =', ovMarks, '| mk-strip =', ovStrip, '| layer box =', ovBox);
await png('overview.png');

// crop around the condemned tile, located from the live DOM rather than recomputed in this script
const ovClip = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-marks .mk-strip');if(!e)return null;const r=e.getBoundingClientRect();const pad=90;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})())`);
if (ovClip && ovClip !== 'null') await png('overview-crop.png', JSON.parse(ovClip));
else log('  (no .mk-strip in the Overview DOM — no crop)');

// ── Level 2: the Room Zoom, entered with a REAL pointer click on the room ──
const rect = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${target.room}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (!rect || rect === 'null') { console.error('FAIL: room element .pl-room[data-anchor="' + target.room + '"] not in the DOM'); process.exit(7); }
const { x: cx, y: cy } = JSON.parse(rect);
log('clicking room', target.room, 'at', cx.toFixed(0) + ',' + cy.toFixed(0));
for (const type of ['mousePressed', 'mouseReleased'])
  await call('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
await sleep(4000);

const rzMarks = await evaluate(`document.querySelectorAll('.rz-marks .mk').length`);
const rzStrip = await evaluate(`document.querySelectorAll('.rz-marks .mk-strip').length`);
const rzZones = await evaluate(`document.querySelectorAll('.rz-zones *').length`);
const rzBox = await evaluate(`JSON.stringify((()=>{const g=document.querySelector('.rz-marks');if(!g)return null;const r=g.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vis:getComputedStyle(g).visibility,disp:getComputedStyle(g).display,op:getComputedStyle(g).opacity};})())`);
// PAINT ORDER, from the live DOM: is the strip mark AFTER the furniture sprite in document order?
const order = await evaluate(`JSON.stringify((()=>{const svg=document.querySelector('.rz-marks')?.ownerSVGElement||document.querySelector('svg');if(!svg)return null;const all=[...svg.querySelectorAll('*')];const f=all.findIndex(n=>n.classList&&[...n.classList].some(c=>c.startsWith('rz-f-')||c==='rz-furniture'));const g=all.findIndex(n=>n.classList&&n.classList.contains('rz-marks'));return {furnitureIdx:f,marksIdx:g,marksAfterFurniture:g>f};})())`);
log('ROOM ZOOM: .mk =', rzMarks, '| mk-strip =', rzStrip, '| zone nodes =', rzZones);
log('  mark layer box =', rzBox);
log('  DOM paint order =', order);
await png('roomzoom.png');
const rzClip = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.rz-marks .mk-strip');if(!e)return null;const r=e.getBoundingClientRect();const pad=110;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})())`);
if (rzClip && rzClip !== 'null') await png('roomzoom-crop.png', JSON.parse(rzClip));
else log('  (no .mk-strip in the Room Zoom DOM — no crop)');

// ── Level 2 again, on the WRECK room: debris and dig, the two kinds the zoned room has none of.
// Without this the Room Zoom pictures only ever show STRIP, and "do the marks paint at all?" would
// be answered for one kind out of three at this altitude.
const wreck = roomRects
  .map((r) => ({ r, n: marksOf().filter((c) => c[0] >= r.x && c[0] < r.x + r.w && c[1] >= r.y && c[1] < r.y + r.h
                                                && (c[3] === 0 || c[3] === 1)).length }))
  .sort((a, b) => b.n - a.n)[0];
if (wreck && wreck.n > 0) {
  log('wreck room:', wreck.r.anchor, 'with', wreck.n, 'debris/dig marks');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(2500);
  const wr = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${wreck.r.anchor}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
  if (wr && wr !== 'null') {
    const { x: wx, y: wy } = JSON.parse(wr);
    for (const type of ['mousePressed', 'mouseReleased'])
      await call('Input.dispatchMouseEvent', { type, x: wx, y: wy, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
    await sleep(4000);
    const wDeb = await evaluate(`document.querySelectorAll('.rz-marks .mk-debris').length`);
    const wDig = await evaluate(`document.querySelectorAll('.rz-marks .mk-dig').length`);
    const wBox = await evaluate(`JSON.stringify((()=>{const g=document.querySelector('.rz-marks');if(!g)return null;const r=g.getBoundingClientRect();return {w:r.width,h:r.height,vis:getComputedStyle(g).visibility,disp:getComputedStyle(g).display,op:getComputedStyle(g).opacity};})())`);
    log(`WRECK ROOM ZOOM: mk-debris = ${wDeb} | mk-dig = ${wDig} | layer box = ${wBox}`);
    await png('roomzoom-wreck.png');
    const wClip = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.rz-marks .mk-dig')||document.querySelector('.rz-marks .mk-debris');if(!e)return null;const r=e.getBoundingClientRect();const pad=130;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})())`);
    if (wClip && wClip !== 'null') await png('roomzoom-wreck-crop.png', JSON.parse(wClip));
  } else log('  (the wreck room element is not in the Overview DOM)');
}

// clean up the orders so the host is left as found
send({ cmd: 'strip', x: target.x, y: target.y, on: 0 });
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
  send({ cmd: 'stockpile', x: target.x + dx, y: target.y + dy, on: 0 });
await sleep(1200);
try { cdp.close(); ws.close(); } catch { /**/ }
chrome.kill('SIGKILL');
rmSync(userDir, { recursive: true, force: true });
process.exit(0);
