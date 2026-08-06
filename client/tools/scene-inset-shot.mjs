#!/usr/bin/env node
// scene-inset-shot.mjs — THE OWNER'S PICTURES for the scene inset (2026-08-06).
//
// Three things he asked to see, taken from the running game rather than described:
//   1. A PIECE PLACED FLUSH AGAINST THE BACK WALL — the exact case behind the ruling *"that solution
//      is not acceptable — the user should be able to place something directly at the wall."* The rig
//      arms a real tool, presses the LAST ROW OF FLOOR, and photographs the result. It also
//      photographs the hover GHOST on that row first, because the ghost is what the player sees
//      before committing and it is the half the poché stopgap took away.
//   2. THE ROOM'S NEW PROPORTIONS AT TWO VIEWPORTS — the drawing is the interior now, so a 12 × 8
//      window reads as a 10 × 6 room and the dimension arrows say so.
//   3. (the doorway pair is `doorway-cross-shot.mjs`'s, which also measures it at 60 Hz.)
//
// ⚠️ IT IS A CAMERA, NOT A GATE. The one thing it asserts is that the press it photographs actually
// reached the wire — a screenshot of a refusal captioned "placed at the wall" would be worse than no
// screenshot. Everything else here is for the owner's eye; the measurements live in
// `ring-press-shot.mjs` (the press map) and `doorway-cross-shot.mjs` (the crossing).
//
// USAGE
//   1. ./play.sh --host-port 8676 --client-port 8677 --no-open
//   2. node client/tools/scene-inset-shot.mjs --host-port 8676 --client-port 8677

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, verifiedClick, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8676');
const CLIENT_PORT = +arg('client-port', '8677');
const CDP_PORT = +arg('cdp-port', '9397');
const OUT = resolve(arg('out', 'client/tools/shots-scene-inset'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOOL = arg('tool', 'table');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);

const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, roomInterior, roomScene, scenePlacement, sceneFit } = await import('../src/ui/room-model.js');

const frame = latest.get('frame');
const DECK = frame.deck | 0;
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);

// The room to photograph: one whose LAST FLOOR ROW is clear, so the piece really can go at the wall.
const clearAt = (tx, ty) => {
  const c = frame.cells[ty * frame.w + tx];
  return Array.isArray(c) && (c[0] | 0) === 46;   // '.' plain floor
};
const WANT = arg('anchor', '');
let pick = null;
for (const s of (WANT ? slots.filter((x) => x.anchorName === WANT) : slots)) {
  const f = { deck: DECK, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h };
  const iv = roomInterior(f);
  const back = iv.ry + iv.rh - 1;
  const col = [];
  for (let tx = iv.rx; tx < iv.rx + iv.rw; tx++) if (clearAt(tx, back)) col.push(tx);
  if (col.length >= 3) { pick = { s, f, iv, at: { x: col[Math.floor(col.length / 2)], y: back } }; break; }
}
if (!pick) { console.error('no room on this deck has a clear back-wall row' + (WANT ? ' (--anchor ' + WANT + ')' : '')); process.exit(9); }
const { s: ROOM, f: focus, iv, at } = pick;
log(`ROOM ${ROOM.anchorName} window=${focus.rx},${focus.ry} ${focus.rw}x${focus.rh}  `
  + `floor=${iv.rx},${iv.ry} ${iv.rw}x${iv.rh}`);
log(`PLACE ${TOOL} at ${at.x},${at.y} — the LAST row of floor, flush against the drawn back wall`);

const userDir = mkdtempSync(join(tmpdir(), 'scene-inset-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid', chrome.pid);

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) die(chrome, 5, 'no devtools');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const v = await evaluate(`JSON.stringify(${expr})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
const mouse = (type, x, y, buttons = 0) => call('Input.dispatchMouseEvent',
  { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, buttons });
async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1);
  await sleep(140); await mouse('mouseReleased', x, y, 0);
}
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
  return p;
}
await call('Page.enable'); await call('Runtime.enable');
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { window.__sent = [];
    const o = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { try { const j = JSON.parse(d); if (j && j.cmd) window.__sent.push(j); } catch (e) {} return o.apply(this, arguments); };
  })();`,
});
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

await verifiedClick({
  what: `Room Zoom on ${ROOM.anchorName}`,
  target: () => centre(`.pl-room[data-anchor="${ROOM.anchorName}"]`),
  settled: async () => (await evaluate("document.body.classList.contains('roomzoom-open')?1:0")) === 1,
  clickAt, log, chrome, code: 7,
});
const layerBox = await waitFor('#rz-layers', async () => evalJson(
  "(()=>{const e=document.getElementById('rz-layers');if(!e)return null;const b=e.getBoundingClientRect();return b.width?{x:b.x,y:b.y,w:b.width,h:b.height}:null;})()"),
{ chrome, code: 8 });

// ── 2. the proportions, at two viewports ──
await png('01-room-1600x1000.png');
await call('Emulation.setDeviceMetricsOverride', { width: 1180, height: 760, deviceScaleFactor: 1, mobile: false });
await sleep(600);
await png('02-room-1180x760.png');
await call('Emulation.clearDeviceMetricsOverride');
await sleep(600);

// ── 1. the piece at the wall ──
const { trayLeafFor, categoryOf } = await import('../src/ui/build-tray-model.js');
const LEAF = trayLeafFor(TOOL);
if (!LEAF) die(chrome, 9, `\`${TOOL}\` is in no tray leaf`);
await verifiedClick({
  what: `the ${categoryOf(LEAF)} category is open`,
  target: () => centre(`[data-rzcat="${categoryOf(LEAF)}"]`),
  settled: async () => (await evaluate(
    `document.querySelector('[data-rzcat="${categoryOf(LEAF)}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
  clickAt, log, chrome, code: 9,
});
let subBox = null;
for (let i = 0; i < 20; i++) {
  subBox = await centre(`[data-rzsub="${LEAF}"]`);
  if (subBox || await centre(`[data-rztool="${TOOL}"]`)) break;
  await sleep(150);
}
if (subBox) {
  await verifiedClick({
    what: `the ${LEAF} leaf is open`,
    target: () => centre(`[data-rzsub="${LEAF}"]`),
    settled: async () => (await evaluate(
      `document.querySelector('[data-rzsub="${LEAF}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
    clickAt, log, chrome, code: 9,
  });
}
const cardSel = `.rz-card[data-rztool="${TOOL}"]`;
const isArmed = async () => (await evaluate(
  `document.querySelector(${JSON.stringify(cardSel)})?.classList.contains('on')?1:0`)) === 1;
let armedOk = false;
for (let a2 = 0; a2 < 3 && !armedOk; a2++) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(cardSel)});
    if (e && e.scrollIntoView) e.scrollIntoView({block:'nearest', inline:'center'}); return 1;})()`);
  await sleep(250);
  const box = await centre(cardSel);
  if (!box) die(chrome, 9, `the ${TOOL} card is not in the tray`);
  await clickAt(box.x, box.y);
  for (let i = 0; i < 20 && !armedOk; i++) { await sleep(150); armedOk = await isArmed(); }
}
if (!armedOk) die(chrome, 9, `${TOOL} never armed`);
log(`  verified: ${TOOL} armed`);

const box2 = await evalJson(
  "(()=>{const e=document.getElementById('rz-layers');const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()");
const scene = roomScene(focus);
const fit = sceneFit(scene, box2.w, box2.h);
const place = scenePlacement(scene, focus, scene.s * 100);
const [sx, sy] = place.foot(at.x, at.y);
const P = { x: box2.x + fit.offX + sx * fit.s, y: box2.y + fit.offY + sy * fit.s };

// THE GHOST, on the row that touches the wall — what the poché stopgap refused to draw.
await mouse('mouseMoved', P.x, P.y, 0);
await sleep(500);
await png('03-ghost-at-the-back-wall.png');

// …and the press.
const before = await evaluate("window.__sent.filter(s=>s.cmd==='place').length");
await clickAt(P.x, P.y);
await sleep(900);
const sent = await evalJson(`window.__sent.filter(s=>s.cmd==='place').slice(${before})`);
log('  place commands sent: ' + JSON.stringify(sent));
if (!sent || !sent.length || (sent[0].x | 0) !== at.x || (sent[0].y | 0) !== at.y) {
  die(chrome, 21, 'the press at the wall did not reach the wire as a placement on that tile — a '
    + 'screenshot captioned "placed at the wall" would be a lie');
}
const toast = await evaluate("(document.getElementById('rz-toast')||{}).textContent||''");
log('  the surface says: ' + JSON.stringify(toast));
await png('04-placed-flush-at-the-back-wall.png');
// Let the builder work for a while so the piece itself, not only its blueprint, is in the picture.
await sleep(12000);
await png('05-the-piece-at-the-wall.png');

chrome.kill('SIGKILL');
log('\nDONE — pictures in ' + OUT);
process.exit(0);
