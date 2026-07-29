#!/usr/bin/env node
// blocked-reach-shot.mjs — THE M1-D ACCEPTANCE RUN: what the shipping game does with
// `WireFormat.ReasonUnreachable`, driven live and photographed. `blocked-shot.mjs` is the sibling rig
// for the AIR and NO_APPROACH reasons; this one is about the third.
//
// ⛔⛔ READ THIS BEFORE READING THE PICTURES. **THE CHARTER'S 7-STEP DEMO CANNOT BE PERFORMED ON THE
// SHIPPING SHIP, AND THAT IS A MEASURED FINDING ABOUT THE SHIP, NOT A LIMITATION OF THIS TOOL.**
// Three separate facts, each measured by this rig against a live `./play.sh` host:
//
//   (1) **ALL FOUR of `--ship wreck`'s deck-0 Doors BOOT SHUT** (`(10,3) (8,9) (3,16) (35,2)`, all
//       `open=0` on the `devices` channel at tick 0). The demo's opening move — "arm O and shut two
//       doors" — is therefore a no-op on the shipping game.
//   (2) **SHUTTING THEM PARTITIONS NOTHING.** With every one of them shut, the single thawed crew
//       member still wanders x=2..31 across deck 0, in and out of the cryobay rect. The deck is
//       loop-connected around its doors, so no compartment a player can seal exists.
//   (3) **EVERYTHING THAT *IS* DISCONNECTED IS ALSO AIRLESS**, so `ReasonAir` correctly outranks the
//       reach question there. Driven: designating all 20 deck-0 debris tiles produces 20 blocked rows
//       and they are AIR and NO_APPROACH — never reason 3, which is the precedence rule working.
//   ⇒ On the shipped wreck a player currently has NO WAY to create a breathable-but-unreachable
//     order through the standard verbs. The reason is not dead — `BlockedChannelTests` drives it end
//     to end on a constructed pocket, and `JobSourceBackoffTests` drives all four carriers — but it
//     is a WRECK-GEOMETRY case that does not exist yet on this ship.
//
// ⛔ AND A SECOND FINDING, ABOUT THE VERB THE CHARTER CHOSE. A **BUILD** behind a shut door cannot
// reach this reason at all, whatever the geometry. `BuildJobSource.TryReserveMaterialFor` checks a
// path to the MATERIAL and never to the SITE, so the claim SUCCEEDS, the pawn walks to the Regolith,
// and `ProgressHaulToBuild` phase A then abandons on `TryPathToAdjacent(site)` — a path that records
// NO back-off. That IS the 480 000-tick livelock, and nothing stamps it. The charter's line that
// `_matRetryAt` "is the one the 480 000-tick scenario actually trips" is FALSE whenever material is
// reachable; `_matRetryAt` fires only when NO material is reachable. FILED, NOT FIXED: the fix is one
// write in a sim abandon path and this package is pin-neutral by charter.
//
// SO WHAT THIS RIG ACTUALLY DOES, and every part of it is reported rather than assumed:
//   A. drives the live host: censuses the doors, shuts any that are open, sweeps DIG over the debris
//      field, and prints the resulting `blocked` census — the live proof of (1)(2)(3) above.
//   B. photographs the LIVE blocked layer in the Level-2 Room Zoom (AIR / NO_APPROACH rows), which is
//      the end-to-end proof that this package did not break the layer it extends.
//   C. photographs reason 3 by pushing a `blocked` payload into the RUNNING CLIENT's own `hud.js`
//      through a dynamic `import()` — ES-module caching makes that the SAME instance `main.js`
//      dispatches into, i.e. the real `case 'blocked'` path with a synthetic payload. THE HOST IS NOT
//      MODIFIED and the file is named `-injected` so nobody can mistake it for a live capture. This
//      is `blocked-shot.mjs --air-demo`'s own device, inherited rather than reinvented, and it is
//      here for the same reason: the reason code exists, the ship has nowhere to show it yet.
//
// USAGE
//   1. ./play.sh --host-port 8430 --client-port 8431 --no-open
//   2. node client/tools/blocked-reach-shot.mjs --out docs/design/shots [--host-port 8430]
//
// Exits non-zero if the host will not answer, if the live blocked layer paints nothing, or if the
// injected reason-3 badge or its key row does not appear. A green run with no pictures is the
// failure this tool exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8430');
const CLIENT_PORT = +arg('client-port', '8431');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'blocked-reach-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9341');
const REASON_UNREACHABLE = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
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

const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');

function deckOf(d) { return deckSlots(decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms'))), d); }
const devicesOf = (deck) => (latest.get('devices')?.cells || []).filter((c) => (c[2] | 0) === deck);
const blockedOf = (deck) => (latest.get('blocked')?.cells || []).filter((c) => (c[2] | 0) === deck);
const reachRows = (deck) => blockedOf(deck).filter((c) => (c[4] | 0) === REASON_UNREACHABLE);
const pawn = () => latest.get('roster')?.crew?.[0];
const census = (deck) => {
  const by = {};
  for (const c of blockedOf(deck)) { const k = `order${c[3]}/reason${c[4]}`; by[k] = (by[k] || 0) + 1; }
  return JSON.stringify(by);
};

async function gotoDeck(deck) {
  for (let i = 0; i < 16; i++) {
    const cur = latest.get('frame')?.deck | 0;
    if (cur === deck) return true;
    send({ cmd: 'deck', dz: Math.sign(deck - cur) });
    await sleep(450);
  }
  return (latest.get('frame')?.deck | 0) === deck;
}

const DECK = 0;
if (!await gotoDeck(DECK)) die(2, 'could not reach deck ' + DECK);
await sleep(1500);

// ── A(i): the door census — finding (1) ──
const doors = devicesOf(DECK).filter((c) => (c[3] | 0) === 2);   // DeviceKind.Door
log(`A1  deck ${DECK} DOORS: ${doors.map((c) => `(${c[0]},${c[1]}) open=${c[6]}`).join('  ') || 'NONE'}`);
const openDoors = doors.filter((c) => (c[6] | 0) === 1);
log(`A1  of ${doors.length} doors, ${openDoors.length} are OPEN at boot`
  + (openDoors.length === 0 ? '  ⇒ the demo\'s "shut two doors" step is a NO-OP on this ship' : ''));
for (const d of openDoors) { send({ cmd: 'operate', x: d[0], y: d[1], deck: DECK }); await sleep(700); }
await sleep(1500);
log('A1  after OPERATE: ' + devicesOf(DECK).filter((c) => (c[3] | 0) === 2)
  .map((c) => `(${c[0]},${c[1]}) open=${c[6]}`).join('  '));

// ── A(ii): sweep DIG over the debris field and watch — findings (2) and (3) ──
const debris = (latest.get('marks')?.cells || []).filter((c) => (c[2] | 0) === DECK && (c[3] | 0) === 0);
log(`A2  debris tiles on deck ${DECK}: ${debris.length}`);
for (const m of debris) send({ cmd: 'dig', x: m[0], y: m[1], on: 1 });
for (let i = 0; i < 6; i++) { send({ cmd: 'speed', delta: 1 }); await sleep(200); }
await sleep(8000);
log(`A2  blocked rows: ${blockedOf(DECK).length}  ${census(DECK)}`);
const roam = new Set();
for (let i = 0; i < 8; i++) { await sleep(4000); const p = pawn(); if (p) roam.add(`${p.x},${p.y}`); }
const xs = [...roam].map((s) => +s.split(',')[0]);
log(`A2  the one thawed crew member roamed x=${Math.min(...xs)}..${Math.max(...xs)} with every door shut`
  + '  ⇒ the deck is loop-connected around its doors');
log(`A2  reason-3 rows on the LIVE ship: ${reachRows(DECK).length}`
  + (reachRows(DECK).length === 0
    ? '  ⇒ EXPECTED, and it is finding (3): everything disconnected here is also airless, and AIR outranks reach'
    : '  ⇒ a live case exists after all — photograph it and correct this rig\'s header'));
if (blockedOf(DECK).length === 0) die(4, 'the LIVE blocked layer is empty, so section B would '
  + 'photograph an unbadged room and prove nothing');

// The room to photograph is DERIVED FROM THE BLOCKED ROWS, never named: the rig must enter the room
// that actually contains badges, or it photographs an empty floor and calls it evidence.
let room = null, RECT = null;
for (const slot of deckOf(DECK)) {
  const R = slot.rect;
  const hits = blockedOf(DECK).filter((c) => c[0] >= R.x && c[0] < R.x + R.w && c[1] >= R.y && c[1] < R.y + R.h);
  if (hits.length) { room = slot.anchorName; RECT = R; break; }
}
// ⚠️ NAMED BLIND SPOT, INHERITED AND RE-MEASURED — this is M1-C's ninth-trap finding hitting the
// next rig. EVERY live blocked row on this ship sits on a HALL tile, and the Level-2 Room Zoom is
// entered PER ROOM: there is no room to click that contains one. So section B (photograph the LIVE
// layer) is NOT PERFORMABLE on the shipping wreck, and the rig says so and continues to section C
// rather than quietly photographing an empty floor.
let liveInRoom = !!room;
if (!room) {
  const first = deckOf(DECK)[0];
  if (!first) die(4, 'deck ' + DECK + ' has no room rect at all, so the Room Zoom cannot be entered');
  room = first.anchorName; RECT = first.rect;
  log('B   ⛔ NOT PERFORMABLE: every live blocked row on this ship is on a HALL tile, and the Room '
    + 'Zoom is entered per ROOM. This is the same narrowing M1-C recorded (all 20 deck-0 debris '
    + 'tiles are in halls). Falling through to section C in room "' + room + '".');
} else {
  log(`B   photographing room "${room}" rect ${RECT.x},${RECT.y} ${RECT.w}x${RECT.h} — `
    + `${blockedOf(DECK).filter((c) => c[0] >= RECT.x && c[0] < RECT.x + RECT.w && c[1] >= RECT.y && c[1] < RECT.y + RECT.h).length} badge(s) inside it`);
}

// ───────────────────────────────────────────────── 2. photograph it, then finish the demo
const userDir = mkdtempSync(join(tmpdir(), 'blocked-reach-shot-'));
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
if (!wsUrl) { chrome.kill('SIGKILL'); die(5, 'Chrome never opened a DevTools endpoint'); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '3') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

const onbBox = await evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onbBox && onbBox !== 'null') {
  const { x: bx, y: by } = JSON.parse(onbBox);
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x: bx, y: by, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(2500);
}
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) die(8, 'the onboarding card is still up');

const rect = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${room}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (!rect || rect === 'null') die(7, `.pl-room[data-anchor="${room}"] not in the DOM`);
const { x: cx, y: cy } = JSON.parse(rect);
for (const type of ['mousePressed', 'mouseReleased'])
  await call('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
await sleep(4000);

async function reportDom(tag) {
  const n = await evaluate(`document.querySelectorAll('.rz-blockeds .rz-blocked').length`);
  const un = await evaluate(`document.querySelectorAll('.rz-blocked-unreachable').length`);
  const key = await evaluate(`(document.getElementById('rz-zonekey')||{}).textContent||''`);
  log(`${tag}: .rz-blocked=${n} .rz-blocked-unreachable=${un}`);
  log(`  key text = "${String(key).trim()}"`);
  return { n, un, key: String(key) };
}
// ── B: the LIVE layer (AIR / NO_APPROACH), which this package must not have broken ──
const live = await reportDom('ROOM ZOOM (LIVE rows)');
if (liveInRoom && !live.n) die(9, 'the Room Zoom drew NO blocked badge although the wire carries rows '
  + 'inside this room — the layer is emitting a string nobody paints, which is what this tool exists '
  + 'to catch');
await png('live-layer.png');

// ── C: reason 3, INJECTED through the page's own hud.js (see this file's header) ──
const cells = [];
for (let i = 0; i < 3; i++) cells.push([RECT.x + 1 + i, RECT.y + 1, DECK, 2, REASON_UNREACHABLE]);
const ok = await evaluate(`(async()=>{const H=await import('/src/ui/hud.js');`
  + `H.renderBlocked({type:'blocked',cells:${JSON.stringify(cells)}});return true;})()`);
if (!ok) die(10, 'could not reach the page\'s own hud.js module, so reason 3 could not be photographed '
  + 'at all — say so rather than shipping the live picture as if it covered the new reason');
await sleep(2500);
const inj = await reportDom('ROOM ZOOM (reason 3, INJECTED — host unmodified)');
if (!inj.un) die(11, 'a reason-3 row reached the client and NOTHING drew an `rz-blocked-unreachable` '
  + 'badge. The host can now say it and the surface cannot show it.');
if (!/REACHED/i.test(inj.key)) die(11, 'the visible key does not name the reason — a badge with no '
  + 'words is the silence this channel exists to remove, wearing a new costume');
await png('reason3-injected.png');
const clip = await evaluate(`JSON.stringify((()=>{const es=[...document.querySelectorAll('.rz-blocked-unreachable')];if(!es.length)return null;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const e of es){const r=e.getBoundingClientRect();x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.width);y1=Math.max(y1,r.y+r.height);}const pad=40;return {x:Math.max(0,x0-pad),y:Math.max(0,y0-pad),width:(x1-x0)+pad*2,height:(y1-y0)+pad*2};})())`);
if (clip && clip !== 'null') await png('reason3-injected-crop.png', JSON.parse(clip));

cdp.close();
chrome.kill('SIGKILL');
log('done — A (live drive), B (live layer), C (reason 3, injected). Read the header before quoting C.');
process.exit(0);
