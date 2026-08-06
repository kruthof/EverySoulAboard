#!/usr/bin/env node
// place-census-shot.mjs — THE 30-PRESS CENSUS. How many ordinary presses on open floor actually
// reach the sim as a `place` command, and of those, how many the sim then refuses in silence.
//
// ⛔ WHY IT EXISTS. The owner, 2026-08-05: *"the ghost shows items are placeable in all open areas
// — how it should be — but the actual building only works in some, which makes no sense; something
// is broken."* There are TWO candidate causes for that one sentence and they need different fixes,
// so this tool measures the SPLIT rather than the symptom:
//
//   (a) THE CLICK NEVER LEAVES THE CLIENT (BUG-B at Level 2). `onCanvasClick` was bound to `click`,
//       and `paintLayers` replaces `_layers.innerHTML` on every coalesced wire repaint (~10/s). A
//       repaint between mousedown and mouseup detaches the pressed node, Chrome finds no common
//       ancestor and FIRES NO `click` AT ALL. Not a wrong action — NO action.
//   (b) THE SIM REFUSES IT IN SILENCE. `PlaceDeviceCommand.Execute` returns early on six separate
//       clauses and says nothing; the client used to promise only the attempt.
//
// The two are told apart by INSTRUMENTING THE WIRE: `WebSocket.send` is wrapped at document start,
// so every outgoing command is recorded whether or not the sim ever sees it. `sent` counts (a);
// `sent - landed`, classified against the tile's own state, counts (b).
//
// ⚠️ THE PRESS DURATION IS THE MEASUREMENT, NOT A NICETY. A press of a few milliseconds mostly
// misses the repaint window and mostly works; the owner's ordinary press is comfortably over 100 ms
// and spans a repaint essentially always (overview-view.js's BUG-B note measured 19/20 vs 0/10 on
// the plate for exactly this reason). `--hold` defaults to 140 ms. A rig that pressed and released
// in the same millisecond would report the bug as absent.
//
// USAGE
//   1. ./play.sh --host-port 8650 --client-port 8651 --no-open
//   2. node client/tools/place-census-shot.mjs --host-port 8650 --client-port 8651 \
//        --out client/tools/shots-place-census
//
// Exits non-zero when fewer than `--floor` of the presses reach the wire (default 28/30).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, verifiedClick, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8650');
const CLIENT_PORT = +arg('client-port', '8651');
const OUT = resolve(arg('out', 'client/tools/shots-place-census'));
const PREFIX = arg('prefix', 'census-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9391');
const TOOL = arg('tool', 'table');
const N = +arg('presses', '30');
const HOLD = +arg('hold', '140');
const FLOOR = +arg('floor', '28');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('  x FAIL ' + msg); } else log('  ok  ' + msg); return ok; };

// ───────────────────────────────────────────────────────────── 1. the wire, read as the client does
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);

const { decodeDecks, decodeRooms, decodeDevices } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');
const { partsUnits } = await import('../src/ui/ledger-model.js');

const DECK = (latest.get('frame')?.deck | 0);
const paused = !!latest.get('status')?.paused;
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);
if (!slots.length) { console.error('FAIL: deck ' + DECK + ' has no enterable room'); process.exit(3); }
const devicesAt = () => (decodeDevices(latest.get('devices')) || []).filter((d) => d.deck === DECK);

const frame = latest.get('frame');
const clearIn = (r) => {
  const out = [];
  for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) {
    for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46) out.push({ x: tx, y: ty });
    }
  }
  return out;
};
const scored = slots.map((s) => ({ s, free: clearIn(s.rect) })).sort((a, b) => b.free.length - a.free.length);
const ROOM = scored[0];
if (ROOM.free.length < N) { console.error(`FAIL: no room with ${N} clear interior tiles`); process.exit(3); }
const focus = { deck: DECK, rx: ROOM.s.rect.x, ry: ROOM.s.rect.y, rw: ROOM.s.rect.w, rh: ROOM.s.rect.h };
const parts0 = partsUnits(latest.get('ledger'));
log(`SIM RUNNING: ${!paused}   (a census on a PAUSED ship measures nothing — BUG-B needs repaints)`);
log(`WORKING ROOM: ${ROOM.s.anchorName} @${focus.rx},${focus.ry} ${focus.rw}x${focus.rh}, ${ROOM.free.length} clear tiles`);
log(`PARTS ABOARD: ${parts0} — a placement costs 3, so at most ${Math.floor(parts0 / 3)} of ${N} presses CAN land`);
const TILES = ROOM.free.slice(0, N);

// ───────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'place-census-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1600,1000'),
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid', chrome.pid, '(killed on every exit path)');

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) die(chrome, 5, 'Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const v = await evaluate(`JSON.stringify(${expr})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 2 } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(chrome, 6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const mouse = (type, x, y, buttons = 0) => call('Input.dispatchMouseEvent',
  { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, buttons });
const moveTo = (x, y) => mouse('mouseMoved', x, y, 0);
async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, 0);
  await mouse('mousePressed', x, y, 1);
  await mouse('mouseReleased', x, y, 0);
}
/** ⭐ AN ORDINARY HUMAN PRESS — down, HOLD, up. The hold is the whole instrument (see the header). */
async function pressAt(x, y, holdMs) {
  await mouse('mouseMoved', x, y, 0);
  await mouse('mousePressed', x, y, 1);
  await sleep(holdMs);
  await mouse('mouseReleased', x, y, 0);
}

await call('Page.enable');
await call('Runtime.enable');

// ⭐⭐ THE WIRE INSTRUMENT, INSTALLED AT DOCUMENT START so it wraps the socket the client opens
// rather than one it has already opened. Every outgoing frame is parsed and stashed; nothing is
// blocked, delayed or rewritten, so the page under measurement behaves exactly as it ships.
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__sent = [];
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try { const o = JSON.parse(data); if (o && o.cmd) window.__sent.push({ t: Date.now(), o }); } catch (e) { /* not ours */ }
      return orig.apply(this, arguments);
    };
  })();`,
});
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });
check((await evaluate('Array.isArray(window.__sent)?1:0')) === 1,
  'the wire instrument survived navigation (a census read off a missing array would print 0 sent '
  + 'and look exactly like a total click failure)');

// ───────────────────────────────────────────────────────────── 3. into the room, arm the tool
await verifiedClick({
  what: `the Room Zoom is open on ${ROOM.s.anchorName}`,
  target: () => centre(`.pl-room[data-anchor="${ROOM.s.anchorName}"] rect`),
  settled: async () => (await evaluate("document.body.classList.contains('roomzoom-open')?1:0")) === 1,
  clickAt, log, chrome, code: 7,
});
const layerBox = await waitFor('#rz-layers laid out', async () => evalJson(
  "(()=>{const e=document.getElementById('rz-layers');if(!e)return null;const b=e.getBoundingClientRect();return b.width?{x:b.x,y:b.y,w:b.width,h:b.height}:null;})()"),
{ chrome, code: 8 });
const { roomScene, scenePlacement, sceneFit } = await import('../src/ui/room-model.js');
const scene = roomScene(focus);
const fit = sceneFit(scene, layerBox.w, layerBox.h);
const place = scenePlacement(scene, focus, scene.s * 100);
const screenOf = (tx, ty) => {
  const [sx, sy] = place.foot(tx, ty);
  return { x: layerBox.x + fit.offX + sx * fit.s, y: layerBox.y + fit.offY + sy * fit.s };
};
await verifiedClick({
  what: `the ${TOOL.toUpperCase()} tool is armed`,
  target: () => centre(`[data-rztool="${TOOL}"]`),
  settled: async () => (await evaluate(`document.querySelector('[data-rztool="${TOOL}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
  clickAt, log, chrome, code: 9,
});

// ⭐ THE REPAINT RATE, MEASURED RATHER THAN ASSUMED. If `#rz-layers` is NOT being replaced during a
// press then a green census below proves nothing about BUG-B — it proves the ship was idle. The
// probe stamps the layer node and counts how many times the stamp is gone over one second.
const repaintsPerSec = await evaluate(`(async () => {
  let gone = 0;
  for (let i = 0; i < 10; i++) {
    const l = document.getElementById('rz-layers');
    const first = l && l.firstElementChild;
    if (first) first.__stamp = 1;
    await new Promise((r) => setTimeout(r, 100));
    const now = document.getElementById('rz-layers');
    const f2 = now && now.firstElementChild;
    if (first && (!f2 || f2.__stamp !== 1)) gone++;
  }
  return gone;
})()`);
log(`  #rz-layers was torn down ${repaintsPerSec}× in 1 s — the window BUG-B needs`);
check(repaintsPerSec >= 3,
  `the canvas really is repainting under the pointer (${repaintsPerSec}/s). A census on a quiet `
  + 'canvas cannot see the bug it exists to measure');

// ───────────────────────────────────────────────────────────── 4. THE CENSUS
await png('01-armed-before-the-census.png');
const before = devicesAt();
const sentBefore = await evaluate('window.__sent.length');
const rows = [];
for (const t of TILES) {
  const p = screenOf(t.x, t.y);
  const n0 = await evaluate("window.__sent.filter(s=>s.o.cmd==='place').length");
  await pressAt(p.x, p.y, HOLD);
  await sleep(220);
  const n1 = await evaluate("window.__sent.filter(s=>s.o.cmd==='place').length");
  const toastNow = await evaluate("(document.getElementById('rz-toast')||{}).textContent||''");
  rows.push({ tile: `${t.x},${t.y}`, sent: n1 - n0, toast: String(toastNow).slice(0, 70) });
}
await sleep(2500);
const after = devicesAt();
const sentAll = await evalJson("window.__sent.filter(s=>s.o.cmd==='place').map(s=>s.o.x+','+s.o.y)");
const sent = rows.filter((r) => r.sent > 0).length;
const landedTiles = after.filter((d) => !before.some((b) => b.x === d.x && b.y === d.y));
const parts1 = partsUnits(latest.get('ledger'));

log('\n──────────────── THE CENSUS ────────────────');
for (const r of rows) log(`  tile ${r.tile.padEnd(7)} sent=${r.sent}  toast="${r.toast}"`);
log(`\n  presses            ${N}`);
log(`  place cmds SENT    ${sent}/${N}   ← (a) click loss = ${N - sent}`);
log(`  devices LANDED     ${landedTiles.length}   at ${landedTiles.map((d) => d.x + ',' + d.y).join(' ')}`);
log(`  REFUSED BY THE SIM ${sent - landedTiles.length}   ← (b) sent, and the sim did not place`);
const mute = rows.filter((r) => r.sent > 0 && !r.toast).length;
log(`  …OF WHICH SILENT   ${Math.max(0, mute - landedTiles.length)}   ← the defect: a refusal with no sentence`);
log(`  PARTS ${parts0} → ${parts1}  (3 per placement)`);
log(`  tiles the client sent for: ${JSON.stringify(sentAll)}`);
log('────────────────────────────────────────────\n');
writeFileSync(join(OUT, PREFIX + 'census.json'), JSON.stringify({
  room: ROOM.s.anchorName, deck: DECK, presses: N, holdMs: HOLD, repaintsPerSec,
  sent, landed: landedTiles.length, parts0, parts1, rows,
}, null, 2));
await png('02-after-the-census.png');
// ⭐ ONE MORE PRESS, PHOTOGRAPHED WHILE THE SENTENCE IS STILL UP. The toast clears itself after
// 2.6 s, so a shot taken at the end of the census catches an empty box — measured, on the first
// draft of this line, which wrote nothing at all and looked like a capture failure.
{
  const p = screenOf(TILES[0].x, TILES[0].y);
  await pressAt(p.x, p.y, HOLD);
  await sleep(400);
  const said = await evaluate("(document.getElementById('rz-toast')||{}).textContent||''");
  log(`  the sentence on screen: "${said}"`);
  const box = await evalJson("(()=>{const e=document.getElementById('rz-toast');if(!e)return null;const r=e.getBoundingClientRect();return r.width?{x:Math.max(0,r.x-24),y:Math.max(0,r.y-16),width:r.width+48,height:r.height+32}:null;})()");
  await png('03-the-refusal-sentence.png', box || undefined);
}

// ⭐⭐ DEFECT (b)'s OWN CHECK. A press that reached the wire and placed nothing must have produced a
// sentence. `mute` counts presses that said nothing at all; the ACCEPTED placements are legitimately
// silent (the piece appearing IS the feedback), so they are the allowance and nothing else is.
check(mute <= landedTiles.length,
  `${mute} presses said NOTHING, against ${landedTiles.length} that actually placed something. `
  + 'Every other one is a refusal the player cannot hear, which is indistinguishable from a broken '
  + 'verb (docs/TRAPS.md Part C).');
check(sent >= FLOOR,
  `${sent}/${N} ordinary presses on open floor reached the wire as a \`place\` command `
  + `(floor ${FLOOR}). Every miss is a press the sim NEVER SAW.`);

try { cdp.close(); } catch { /* already gone */ }
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* already gone */ }
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
