#!/usr/bin/env node
// operate-shot.mjs — SCREENSHOT the OPERATE verb on the STANDARD SURFACE, on `--ship wreck`.
//
// ⚠️ WHY THIS EXISTS. Every assertion about this verb reads a STRING or a wire payload. A perfectly
// formed SVG chip paints nothing if its container has zero height or if an opaque sprite is stacked
// on top of it, and a toast that is written to a `hidden` node is byte-identical to one a player can
// read — so no test in this repo can tell those apart. `marks-shot.mjs`'s header records what that
// cost: a mutation-green mark layer that drew every mark outside its own viewBox. This tool is the
// same rig, pointed at the OPERATE verb, and it is committed rather than left in a scratchpad.
//
// IT ALSO ANSWERS THE ONE QUESTION ASSERTIONS CANNOT: is the verb REACHABLE? The premise's opening
// move is "open the vent, push the air outward", and reachable means a player can get from the boot
// Overview to a vent's OPEN/SHUT control without knowing a keystroke. So the room is entered with a
// REAL pointer click on `.pl-room[data-anchor]`, the tool is armed with a REAL click on the palette
// button, and the tile is clicked at its real screen coordinates.
//
// USAGE
//   1. ./play.sh --host-port 8362 --client-port 8363 --no-open
//   2. node client/tools/operate-shot.mjs --out docs/design/shots [--host-port 8362] [--client-port 8363]
//
// Exits non-zero if the host will not answer, if no operable device can be found inside a room the
// Overview can enter, or if Chrome never paints — a green run with no pictures is the failure this
// tool exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8362');
const CLIENT_PORT = +arg('client-port', '8363');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'operate-');
const DECK = +arg('deck', '0');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9335');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// ───────────────────────────────────────────────────────────── 1. read the ship over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
// DECK IS GLOBAL SESSION STATE on the host — step TOWARD the target with the right sign.
for (let i = 0; i < 16; i++) {
  const cur = latest.get('frame')?.deck | 0;
  if (cur === DECK) break;
  send({ cmd: 'deck', dz: Math.sign(DECK - cur) });
  await sleep(450);
}
await sleep(1500);
if ((latest.get('frame')?.deck | 0) !== DECK) { console.error('FAIL: could not reach deck ' + DECK); process.exit(2); }

// Decoded by the CLIENT'S OWN modules, never re-parsed here, so this tool cannot drift from what the
// surface believes.
const { decodeDecks, decodeRooms, decodeDevices } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, isOperableKind, OPERABLE_KINDS } = await import('../src/ui/room-model.js');

const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const roomRects = deckSlots(dView, DECK)
  .filter((s) => s.anchorName)
  .map((s) => ({ anchor: s.anchorName, x: s.rect.x, y: s.rect.y, w: s.rect.w, h: s.rect.h }));
log('rooms on deck', DECK + ':', roomRects.map((r) => `${r.anchor}@${r.x},${r.y} ${r.w}x${r.h}`).join(' | ') || '(none)');

const devices = (decodeDevices(latest.get('devices')) || []).filter((d) => d.deck === DECK);
const inRoom = (d) => roomRects.find((r) => d.x >= r.x && d.x < r.x + r.w && d.y >= r.y && d.y < r.y + r.h);
const operable = devices.filter((d) => isOperableKind(d.kind) && inRoom(d));
const NAME = Object.fromEntries(Object.entries(OPERABLE_KINDS).map(([n, k]) => [k, n]));
log(`devices on deck ${DECK}: ${devices.length} | operable AND inside an enterable room: ${operable.length}`);
for (const d of operable)
  log(`  ${NAME[d.kind]} @ ${d.x},${d.y} in ${inRoom(d).anchor} — cond=${d.cond} oper=${d.oper} open=${d.open}`);
if (!operable.length) { console.error('FAIL: no door or vent inside an enterable room on deck ' + DECK); process.exit(3); }

const vent = operable.find((d) => d.kind === OPERABLE_KINDS.AirVent);
const door = operable.find((d) => d.kind === OPERABLE_KINDS.Door);
// The REFUSAL fixture: a device on the same surface that OPERATE must turn down. Preferred is a
// door/vent the sim has given up on (`oper === 0`, the host's WRECKED advisory); if the shipped ship
// authors none, fall back to a NON-OPERABLE device, which is the host's kind refusal. Which one was
// photographed is printed, never assumed.
const wrecked = operable.find((d) => !d.oper);
const otherKind = devices.find((d) => !isOperableKind(d.kind) && inRoom(d));
const refusal = wrecked || otherKind;
log('REFUSAL FIXTURE:', wrecked ? 'a WRECKED door/vent (oper=0)' : (otherKind ? 'a non-operable device kind' : 'NONE'));

const primary = vent || door;
if (!primary) { console.error('FAIL: neither a vent nor a door is reachable'); process.exit(3); }
const room = inRoom(primary);
log('PRIMARY target', NAME[primary.kind], primary.x + ',' + primary.y, 'in room', room.anchor);

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'operate-shot-'));
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
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '2') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
/** The centre of the first element matching `sel`, in viewport coords, or null. */
const centre = async (sel) => {
  const s = await evaluate(`JSON.stringify((()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})())`);
  return (s && s !== 'null') ? JSON.parse(s) : null;
};
/** The visible toast text, or '' — read from the LIVE node including its `hidden` flag, because a
 *  toast written into a hidden node is exactly the invisible-feedback failure this verb exists to
 *  remove and it is textually identical to a visible one. */
const toast = async () => await evaluate(
  `(()=>{const t=document.getElementById('rz-toast');if(!t)return '(no #rz-toast)';return t.hidden?'(HIDDEN) '+t.textContent:t.textContent;})()`);
/** A tight crop around the live toast. Call it BEFORE any full-page capture — the toast hides itself
 *  after 2600 ms and a full screenshot costs most of a second on this rig. */
async function toastCrop(name) {
  const c = await evaluate(`JSON.stringify((()=>{const t=document.getElementById('rz-toast');if(!t||t.hidden)return null;const r=t.getBoundingClientRect();if(!r.width)return null;const pad=30;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})())`);
  if (c && c !== 'null') return png(name, JSON.parse(c));
  log('  (the toast was already hidden — no crop for ' + name + ')');
  return null;
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// DISMISS THE ONBOARDING TAKEOVER FIRST — it swallows both the screenshot and the room click.
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) {
  console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it');
  process.exit(8);
}

await png('01-overview.png');

// ── Level 2: enter the room with the REAL entry gesture ──
const rc = await centre(`.pl-room[data-anchor="${room.anchor}"]`);
if (!rc) { console.error('FAIL: .pl-room[data-anchor="' + room.anchor + '"] is not in the Overview DOM'); process.exit(7); }
log('clicking room', room.anchor, 'at', rc.x.toFixed(0) + ',' + rc.y.toFixed(0));
await clickAt(rc.x, rc.y);
await sleep(3500);
await png('02-roomzoom-unarmed.png');
const chipsBefore = await evaluate(`document.querySelectorAll('.rz-operate-layer .rz-operable').length`);
log('chips with NO tool armed:', chipsBefore, '(must be 0)');

// ── arm OPERATE with a real click on the shipped palette button ──
const btn = await centre('[data-rztool="operate"]');
if (!btn) { console.error('FAIL: no OPERATE button on the Room Zoom palette — the verb is unreachable'); process.exit(9); }
log('OPERATE button at', btn.x.toFixed(0) + ',' + btn.y.toFixed(0), `(${btn.w.toFixed(0)}x${btn.h.toFixed(0)})`);
await clickAt(btn.x, btn.y);
await sleep(1200);
const chipsArmed = await evaluate(`document.querySelectorAll('.rz-operate-layer .rz-operable').length`);
const chipBox = await evaluate(`JSON.stringify((()=>{const g=document.querySelector('.rz-operate-layer');if(!g)return null;const r=g.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),vis:getComputedStyle(g).visibility,disp:getComputedStyle(g).display,op:getComputedStyle(g).opacity};})())`);
log('chips with OPERATE armed:', chipsArmed, '| layer box =', chipBox);
if (!chipsArmed) { console.error('FAIL: arming OPERATE drew no chips — the affordance is invisible'); process.exit(10); }
await png('03-roomzoom-operate-armed.png');

// ── the tile geometry: map a sim tile to screen coords through the LIVE layer rect ──
const layer = await evaluate(`JSON.stringify((()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();const vb=e.getAttribute('viewBox').split(' ').map(Number);return {x:r.x,y:r.y,w:r.width,h:r.height,vw:vb[2],vh:vb[3]};})())`);
const L = JSON.parse(layer);
const U = 32;
// `preserveAspectRatio="xMidYMid meet"` — the same letterbox `tileFromCanvasXY` inverts.
const s = Math.min(L.w / L.vw, L.h / L.vh);
const offX = L.x + (L.w - L.vw * s) / 2, offY = L.y + (L.h - L.vh * s) / 2;
const screenOf = (tx, ty) => ({ x: offX + ((tx - room.x) * U + U / 2) * s, y: offY + ((ty - room.y) * U + U / 2) * s });

// ── the toggle, twice, photographed either side ──
const p1 = screenOf(primary.x, primary.y);
log(`clicking ${NAME[primary.kind]} tile ${primary.x},${primary.y} at ${p1.x.toFixed(0)},${p1.y.toFixed(0)}`);
await clickAt(p1.x, p1.y);
await sleep(2500);
log('TOAST after toggle 1:', JSON.stringify(await toast()));
// ⚠️ THE CROP IS TAKEN FIRST. `toast()` hides itself after 2600 ms and a full-page
// `captureScreenshot` costs most of a second on this rig — the first run photographed an empty
// corner because the toast had already gone by the time the crop was requested. A picture of the
// feedback is the whole point of this tool, so it is taken before the picture of the room.
await toastCrop('04-toggle-1-toast.png');
await png('04-toggle-1.png');

await clickAt(p1.x, p1.y);
await sleep(2000);
log('TOAST after toggle 2:', JSON.stringify(await toast()));
await toastCrop('05-toggle-2-toast.png');
await png('05-toggle-2.png');

// ── the DOOR, when one shares the room. Both KINDS must be photographed, not one twice: `Door` and
// `AirVent` take DIFFERENT sim commands (`SetDoorStateCommand` vs `SetDeviceStateCommand`) and only
// the door has a lock branch, so a picture of the vent alone leaves half the verb unphotographed.
const alsoDoor = (primary.kind === OPERABLE_KINDS.AirVent ? door : vent);
if (alsoDoor && inRoom(alsoDoor)?.anchor === room.anchor) {
  const dp = screenOf(alsoDoor.x, alsoDoor.y);
  log(`clicking ${NAME[alsoDoor.kind]} tile ${alsoDoor.x},${alsoDoor.y}`);
  await clickAt(dp.x, dp.y);
  await sleep(2000);
  log('TOAST after the DOOR toggle:', JSON.stringify(await toast()));
  await toastCrop('05b-door-toggle-toast.png');
  await png('05b-door-toggle.png');
} else log('(no second KIND inside this room — only one of door/vent is photographed)');

// ── the refusal ──
if (refusal) {
  const rp = screenOf(refusal.x, refusal.y);
  log(`clicking REFUSAL fixture (kind ${refusal.kind}) at tile ${refusal.x},${refusal.y}`);
  await clickAt(rp.x, rp.y);
  await sleep(2000);
  log('TOAST after the refusal click:', JSON.stringify(await toast()));
  await toastCrop('06-refusal-toast.png');
  await png('06-refusal.png');
} else log('(no refusal fixture on this deck — the refusal picture is NOT taken; say so in the report)');

// ── a bare floor tile: the client-side "nothing here" answer ──
let bare = null;
for (let y = room.y; y < room.y + room.h && !bare; y++)
  for (let x = room.x; x < room.x + room.w && !bare; x++)
    if (!devices.some((d) => d.x === x && d.y === y)) bare = { x, y };
if (bare) {
  const bp = screenOf(bare.x, bare.y);
  await clickAt(bp.x, bp.y);
  await sleep(1500);
  log('TOAST on a bare tile:', JSON.stringify(await toast()));
  await toastCrop('07-bare-tile-toast.png');
  await png('07-bare-tile.png');
}

// ── the palette, cropped, so the new button is legible next to its fifteen siblings ──
const pal = await evaluate(`JSON.stringify((()=>{const e=document.getElementById('rz-palette');const r=e.getBoundingClientRect();const pad=8;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})())`);
if (pal && pal !== 'null') await png('08-palette.png', JSON.parse(pal));

try { cdp.close(); ws.close(); } catch { /**/ }
chrome.kill('SIGKILL');
rmSync(userDir, { recursive: true, force: true });
log('OK');
process.exit(0);
