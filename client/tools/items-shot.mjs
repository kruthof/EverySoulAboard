#!/usr/bin/env node
// items-shot.mjs — SCREENSHOT the `items` layer on the STANDARD SURFACE, in real Chrome.
//
// ⚠️ WHY THIS EXISTS, and it is the `marks-shot.mjs` argument repeated because it applied again.
// Every assertion about the `items` channel reads a STRING. A perfectly formed SVG string paints
// nothing if its container has zero height, if an opaque sprite is stacked over it, or — the failure
// mode unique to THIS layer — if the text is legible in a 32-unit viewBox and illegible once the
// browser has scaled it. The emitted text is BYTE-IDENTICAL in the readable and the unreadable case,
// so no test in this repo can tell them apart. WP-2 shipped a mutation-green mark layer that drew
// every mark at 800–1024 inside a 384-unit viewBox: invisible in the running game, nothing red.
//
// WHAT IT DOES. Reads the `items` channel off a LIVE `--ship grid` host, picks the room with the most
// ground stock on the chosen deck, then drives real Chrome over the DevTools protocol: navigates the
// standard client, dismisses the onboarding card with a real pointer click, enters the room with the
// real entry gesture, and screenshots Level 2 plus a tight crop of one stack. It reports the facts a
// picture alone cannot be trusted for — stack count, the layer's client box, the badge's RENDERED
// font size in CSS px, and the DOM paint order of the item layer against the furniture layer.
//
// ⚠️ VOCABULARY, 2026-07-27: this tool was written when the layer drew a LABEL PLATE (`REGO 40`) on
// every stocked tile. The ground-item art package replaced that with a SPRITE plus a count badge, and
// demoted the plate to the no-art fallback (MetalOre; a kind byte from a newer host). The selectors
// are unchanged and still right — `.rz-items .rz-item` is one group per stocked tile either way, and
// `.rz-items text` is every badge or chip the layer emits — so what a run reports is now: how many
// stacked tiles drew, and what text sits on them (mostly bare counts now, `+N KINDS` on a crowded
// tile, a `REGO 40`-shaped chip only where a kind has no piece).
//
// NO SIM COMMANDS ARE SENT, unlike marks-shot: `--ship grid` boots with ground stock already on the
// floor (measured: 7 stacks / 32 units, ItemsChannelTests.The_Boot_Census_Per_Ship_Is_Pinned), so
// there is nothing to arrange. That also means this tool photographs the shipped boot state rather
// than one it manufactured.
//
// USAGE
//   1. ./play.sh --host-port 8360 --client-port 8361 --no-open
//   2. node client/tools/items-shot.mjs --out <dir> [--deck 0] [--host-port 8360] [--client-port 8361]
//
// Exits non-zero if the host will not answer, if no room on the deck carries stock, or if Chrome
// never paints — a green run with no pictures is the failure this tool exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8360');
const CLIENT_PORT = +arg('client-port', '8361');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'items-');
const DECK = +arg('deck', '0');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9337');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// ───────────────────────────────────────────────────────────── 1. read the sim over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
// DECK IS GLOBAL SESSION STATE on the host — step toward the target with the right sign.
for (let i = 0; i < 16; i++) {
  const cur = latest.get('frame')?.deck | 0;
  if (cur === DECK) break;
  send({ cmd: 'deck', dz: Math.sign(DECK - cur) });
  await sleep(450);
}
await sleep(1500);
if ((latest.get('frame')?.deck | 0) !== DECK) { console.error('FAIL: could not reach deck ' + DECK); process.exit(2); }

const itemsMsg = latest.get('items');
if (!itemsMsg) { console.error('FAIL: the host never sent an `items` payload — the channel is not on the wire'); process.exit(2); }

// Decoded by the CLIENT'S OWN modules — never re-parsed here, so this tool cannot drift from what
// the surface actually believes.
const { decodeDecks, decodeRooms, decodeItems } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');
const rows = (decodeItems(itemsMsg) || []).filter((r) => r.deck === DECK);
log(`items on deck ${DECK}: ${rows.length} stacks, ${rows.reduce((s, r) => s + r.count, 0)} units`);

const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const roomRects = deckSlots(dView, DECK).filter((s) => s.anchorName)
  .map((s) => ({ anchor: s.anchorName, x: s.rect.x, y: s.rect.y, w: s.rect.w, h: s.rect.h }));
const scored = roomRects.map((r) => ({
  r, n: rows.filter((it) => it.x >= r.x && it.x < r.x + r.w && it.y >= r.y && it.y < r.y + r.h).length,
})).sort((a, b) => b.n - a.n);
log('rooms on deck', DECK + ':', scored.map((s) => `${s.r.anchor}(${s.n})`).join(' | ') || '(none)');
if (!scored.length || scored[0].n === 0) {
  console.error('FAIL: no room on deck ' + DECK + ' contains ground stock — nothing to photograph');
  process.exit(3);
}
const target = scored[0].r;
log('TARGET room', target.anchor, 'with', scored[0].n, 'stacks');

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'items-shot-'));
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

// DISMISS THE ONBOARDING TAKEOVER FIRST — it swallows both the screenshot and the room click.
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
const rect = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${target.anchor}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (!rect || rect === 'null') { console.error('FAIL: room element .pl-room[data-anchor="' + target.anchor + '"] not in the DOM'); process.exit(7); }
const { x: cx, y: cy } = JSON.parse(rect);
log('clicking room', target.anchor, 'at', cx.toFixed(0) + ',' + cy.toFixed(0));
for (const type of ['mousePressed', 'mouseReleased'])
  await call('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
await sleep(4000);

const stacks = await evaluate(`document.querySelectorAll('.rz-items .rz-item').length`);
const words = await evaluate(`JSON.stringify([...document.querySelectorAll('.rz-items text')].map(t=>t.textContent))`);
// THE LEGIBILITY NUMBER. `font-size` is authored in viewBox units; what matters is the CSS px the
// browser actually paints after `preserveAspectRatio` scales the layer. Anything under ~9 px is a
// finding, not a picture to admire.
const px = await evaluate(`JSON.stringify((()=>{const t=document.querySelector('.rz-items text');if(!t)return null;const r=t.getBoundingClientRect();return {authored:t.getAttribute('font-size'),renderedH:+r.height.toFixed(2),renderedW:+r.width.toFixed(2)};})())`);
const box = await evaluate(`JSON.stringify((()=>{const g=document.querySelector('.rz-items');if(!g)return null;const r=g.getBoundingClientRect();const s=getComputedStyle(g);return {x:+r.x.toFixed(0),y:+r.y.toFixed(0),w:+r.width.toFixed(0),h:+r.height.toFixed(0),vis:s.visibility,disp:s.display,op:s.opacity};})())`);
// PAINT ORDER, from the live DOM: is the item layer AFTER the furniture layer?
const order = await evaluate(`JSON.stringify((()=>{const svg=document.querySelector('.rz-items')?.ownerSVGElement;if(!svg)return null;const all=[...svg.querySelectorAll('*')];const f=all.findIndex(n=>n.classList&&n.classList.contains('rz-furniture'));const g=all.findIndex(n=>n.classList&&n.classList.contains('rz-items'));const p=all.findIndex(n=>n.classList&&n.classList.contains('rz-pawns'));return {furnitureIdx:f,itemsIdx:g,pawnsIdx:p,itemsAfterFurniture:g>f};})())`);
// THE CHIP THAT SHOULD BE GONE: any VS-Z-25 unknown chip left in the room, by its letter.
const chips = await evaluate(`JSON.stringify([...document.querySelectorAll('#rz-layers text')].filter(t=>t.getAttribute('fill')==='#57503f').map(t=>t.textContent))`);
log('ROOM ZOOM: .rz-item stacked tiles =', stacks);
log('  badge/chip words =', words);
log('  first badge text metrics =', px);
log('  item layer box =', box);
log('  DOM paint order =', order);
log('  remaining unknown-glyph chips in the room =', chips);
await png('roomzoom.png');

const clip = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.rz-items .rz-item');if(!e)return null;const r=e.getBoundingClientRect();const pad=110;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})())`);
if (clip && clip !== 'null') await png('roomzoom-crop.png', JSON.parse(clip));
else log('  (no .rz-item in the Room Zoom DOM — no crop)');

if (!stacks) { console.error('FAIL: the item layer is not in the Room Zoom DOM at all'); chrome.kill('SIGKILL'); process.exit(9); }

cdp.close(); ws.close(); chrome.kill('SIGKILL');
log('done');
process.exit(0);
