#!/usr/bin/env node
// paper-resources-shot.mjs — PHOTOGRAPH THE NINE GROUND STACKS ON THE LIVE SHIP.
//
// ⚠️ WHY THIS EXISTS AND WHY IT IS SEPARATE FROM `paper-resources-sheet.mjs`. The sheet draws each
// piece from node, on a page of its own, at a size that flatters it. That proves the BUILDER works
// and nothing else. What it cannot see is the only question that matters for this set: does a pile
// survive being drawn by the REAL ground-item layer, on a real deck, under a count badge, at the
// size the Room Zoom actually gives it — and does the wire's kind BYTE reach the piece a player is
// meant to see? A perfectly formed fragment paints nothing if its box is empty, if a layer above it
// is opaque, or if the join resolved to the wrong row (which looks like art, just the wrong art).
//
// It therefore prints a STOCK CENSUS read off the live wire before it takes a picture — every kind
// byte the ship really carries, and the itemId the client resolves it to — because "the room looks
// right" is not the same claim as "these tiles drew the pieces this package authored".
//
// USAGE
//   1. ~/.dotnet/dotnet run --project hosts/web -- --port 8442 --ship wreck
//      python3 client/serve.py 8443
//   2. node client/tools/paper-resources-shot.mjs --out client/tools/shots-paper-resources
//
// ⚠️ PICK PORTS NOBODY ELSE HAS (TRAPS-5). This box runs several lanes at once; a sibling's client
// server on the port you assumed answers your WebSocket with a 404 and the tool reports "no host"
// about a host that is running perfectly. Check with `lsof -nP -iTCP -sTCP:LISTEN` first.
//
// ⚠️ A FAILURE AFTER THE CHROME SPAWN LEAKS a headless Chrome and its CDP port — the committed
// convention of every other shot tool here, recorded rather than re-engineered. If you hit it, kill
// the recorded PID; never `pkill -f chrome`, which takes a sibling lane's gate down with it.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8442');
const CLIENT_PORT = +arg('client-port', '8443');
const OUT = resolve(arg('out', 'client/tools/shots-paper-resources'));
const PREFIX = arg('prefix', 'live-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9361');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
mkdirSync(OUT, { recursive: true });

// ───────────────────────────────────────────────────────────── 1. read the ship over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://127.0.0.1:${HOST_PORT}/ws`);
  ws.onopen = res;
  ws.onerror = () => rej(new Error('nothing speaking the game protocol on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);

const { decodeDecks, decodeRooms, decodeItems } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, roomItemTiles, itemIdForStockKind } = await import('../src/ui/room-model.js');
const { STOCK_KINDS } = await import('../src/ui/stock-filter-model.js');
const { PAPER_RESOURCE_IDS } = await import('../src/items/paper-resources.js');

const items = decodeItems(latest.get('items'));
if (!items || !items.length) die(3, 'the items channel carries no stacks — is this --ship wreck?');
const view = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));

const NAME_OF = new Map(STOCK_KINDS.map((e) => [e.kind, e.name]));
const kinds = [...new Set(items.map((i) => i.kind))].sort((a, b) => a - b);
log(`STOCK CENSUS on the live wire: ${items.length} stacks, ${kinds.length} kinds`);
let warm = 0;
for (const k of kinds) {
  const id = itemIdForStockKind(k);
  const paper = PAPER_RESOURCE_IDS.includes(id);
  if (!paper) warm += 1;
  const n = items.filter((i) => i.kind === k).reduce((a, i) => a + i.count, 0);
  log(`  kind ${String(k).padStart(2)} ${String(NAME_OF.get(k)).padEnd(17)} ×${String(n).padStart(4)}`
    + ` → ${JSON.stringify(id)}${paper ? '' : '   ⛔ NOT A PAPER ROW'}`);
}
if (warm) die(4, `${warm} live kind(s) still resolve to warm art — the join did not move`);

// The rooms worth photographing, chosen by what the ship really stocks rather than by name.
const rooms = [];
for (const deck of [0, 1]) {
  for (const s of deckSlots(view, deck)) {
    const r = s.rect;
    const tiles = roomItemTiles(items, { deck, rx: r.x, ry: r.y, rw: r.w, rh: r.h });
    const n = tiles.reduce((a, t) => a + t.stacks.length, 0);
    if (n) rooms.push({ deck, anchor: s.anchorName, name: s.displayName, stacks: n, tiles: tiles.length });
  }
}
if (!rooms.length) die(4, 'no room on this ship holds stock — nothing to photograph');
for (const r of rooms) log(`STOCKED ROOM deck ${r.deck} ${r.anchor} (${r.name}): ${r.stacks} stacks on ${r.tiles} tiles`);

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'paper-res-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid ' + chrome.pid + ' (kill THIS pid, never `pkill -f chrome`)');

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) { chrome.kill('SIGKILL'); die(5, 'Chrome never opened a DevTools endpoint'); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
// ⚠️ `returnByValue` hands back the STRING these snippets stringify — PARSE IT (door-shot.mjs's scar).
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const click = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
};
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '2') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://127.0.0.1:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(7000);

const onb = await evaluate("JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())");
if (onb && onb !== 'null') { const { x, y } = JSON.parse(onb); await click(x, y); await sleep(2500); }
if (await evaluate("!!document.querySelector('[data-onb-begin]')")) die(8, 'the onboarding card is still up');

const escape = async () => {
  for (const type of ['keyDown', 'keyUp']) {
    await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  }
  await sleep(1800);
};

async function toDeck(deck) {
  for (let i = 0; i < 16; i += 1) {
    const cur = latest.get('frame')?.deck | 0;
    if (cur === deck) break;
    send({ cmd: 'deck', dz: Math.sign(deck - cur) });
    await sleep(450);
  }
  await sleep(1200);
}

async function enterRoom(anchor) {
  await escape();
  const box = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${anchor}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
  if (!box || box === 'null') die(7, `room element .pl-room[data-anchor="${anchor}"] not in the DOM`);
  const { x, y } = JSON.parse(box);
  await click(x, y);
  await sleep(3500);
}

await escape();
await toDeck(0);
await sleep(2500);
await png('0-overview-deck0.png');

let n = 0;
for (const r of rooms) {
  await toDeck(r.deck);
  await enterRoom(r.anchor);
  n += 1;
  await png(`${n}-${r.anchor}.png`);
  // ⚠️ THE COUNT THE PICTURE CANNOT MAKE: how many stack groups the ground-item layer really put in
  // the DOM of THIS room, read out of the live document. A screenshot of an empty floor and a
  // screenshot of a floor whose piles are drawn under an opaque layer look identical.
  const drawn = await evaluate("JSON.stringify((()=>{const g=document.querySelectorAll('#rz-layers .rz-stack');"
    + "return {groups:g.length, kinds:[...new Set([...g].map(e=>e.getAttribute('data-kind')))].sort()};})())");
  log(`  ${r.anchor}: DOM says ${drawn} (wire said ${r.stacks} stacks)`);
  const box = await evaluate("JSON.stringify((()=>{const e=document.getElementById('rz-layers');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})())");
  if (box && box !== 'null') {
    const b = JSON.parse(box);
    await png(`${n}-${r.anchor}-crop.png`, { x: b.x, y: b.y + b.h * 0.25, width: b.w * 0.6, height: b.h * 0.55 });
  }
}

log('OK — the ground stacks are photographed on the live ship. The owner judges the art;');
log('this tool only claims the pieces REACH the screen and that the join lands on the paper rows.');
cdp.close();
chrome.kill('SIGKILL');
process.exit(0);
