#!/usr/bin/env node
// ⭐⭐ M3-10 — "THE SHIP CAN BE WARMED", driven in real Chrome against the running game. This is the
// package's acceptance script, automated so a reviewer can re-run it instead of re-clicking it.
//
// WHAT ONLY THIS TOOL CAN SEE. `HeaterTests` drives the sim directly and proves place → power →
// heat → `CanStageWorkerAt` flips. None of that can see:
//   1. THAT THE VERB IS REACHABLE. The palette is where a player meets a heater. A `DeviceKind` on a
//      whitelist with no button is a def row, and no C# test can tell the difference.
//   2. THAT THE PALETTE STILL FITS. 17 → 18 buttons. This bar has CLIPPED before, with the
//      scrollbar deliberately hidden, so three verbs were unreachable AND unadvertised.
//   3. THAT THE PIECE DRAWS. `ITEMS['space-heater']` was `deviceStatus:'new'`, `glyph:null` — art
//      nothing projected. If the join is wrong the player gets the VS-Z-25 dashed chip with a raw
//      `E` in it, and the client would be honestly reporting that it has no art (the §4l defect).
//   4. THAT THE TEMPERATURE MOVES ON THE WIRE THE GAME USES, against a CONTROL compartment that has
//      no heater and keeps falling in the same run.
//
// ⚠️ THE VERDICTS COME FROM AN INDEPENDENT SOCKET, NOT FROM THE DOM. This tool opens its own
// WebSocket to the host and reads the `rooms` channel's own `tempK`, so "the temperature climbed"
// is the sim's number and not a label the client painted. The DOM is used for the gestures and for
// the pictures.
//
// ⚠️⚠️ TWO THINGS ARE DRIVEN AND NOT PLAYED, AND BOTH ARE SAID OUT LOUD (the pod-bay-shot.mjs /
// board-fault-shot.mjs precedent, verbatim in technique and in disclosure).
//
// (A) THE PRICE — ⭐ **SETTLED BY RUNNING, 2026-08-04, AND THE PREMISE HAS INVERTED.** The
//     paragraph that stood here was a FLAGGED PREDICTION written by D7 without a browser; it is
//     replaced by what a run actually saw, and nothing below is quoted from it.
//     · WHAT WAS TRUE ONCE: `build.def device_place_cost = 3` PARTS, and `--ship wreck` authored
//       ONE Parts unit on the ground. This harness's first run watched the placement be refused
//       SILENTLY (`0 -> 0` heaters on the devices channel) because the ship could not pay —
//       `PlaceDeviceCommand`'s documented all-or-nothing behaviour, not a bug. So the run needed a
//       `device_place_cost = 0` defs overlay, and the file said so out loud.
//     · ⭐ WHAT IS TRUE NOW, MEASURED ON A SHIPPING HOST WITH NO OVERLAY AT ALL (2026-08-04, this
//       rig, `--ship wreck`, plain `content/core/SimDefs`): the wreck boots EIGHT loose Parts
//       (D7's seven `cabin stores` crates + the original one, `AuthoredShips.PeriluneWreck`), the
//       palette click placed the heater, and the devices channel went `0 -> 1`. THE SHIP CAN PAY.
//     ⇒ SO THE RUN IS NOW THE UNMODIFIED SHIP AND THE UNMODIFIED PRICE, and the disclosure that
//       used to live here is gone because the thing it disclosed is gone. `--prep` survives with a
//       `--place-cost` argument, for the OTHER half of the premise: it is how a reviewer drives the
//       REFUSAL deliberately (a cost the ship cannot meet), and it is this rig's own planted-failure
//       control — see the LEDGER check below, which is what makes the price non-vacuous.
//     ⛔ AND THE LEDGER IS CHECKED, NOT ASSUMED. "The heater appeared" and "the ship paid for it"
//       are two claims: a placement that landed for free would look identical on the devices
//       channel. The run therefore reads loose Parts off its own `items` socket either side of the
//       click and requires the drop to be exactly `device_place_cost`.
//
// (B) THE COLD. The compartment must be COLD before a heater means anything, and
// `--ship wreck` takes SIM-DAYS to get there (measured, unattended: the reactor bay reads 9.24 °C
// on day 1, 3.47 °C on day 3 and crosses `hypothermia_c` on DAY 9). This harness therefore
// FAST-FORWARDS with the game's own speed control — the `speed` wire command the player's own
// `+`/`-` keys send — and nothing else. No defs are patched, no ship is edited, no state is
// injected. `--target-c` says how cold to wait for and `--max-wait-s` bounds it; both are printed.
//   · The SHIP is the shipping ship. The COLD is the shipping ship's own cold, reached by waiting.
//   · The PALETTE, the PLACEMENT, the POWER, the HEAT and the ART are all played, all shipping code.
//   · A reviewer who wants the unmodified price plays the matter ladder first, then runs this
//     against a plain `./play.sh`.
//
// USAGE — ⭐ NO PREP STEP ANY MORE (see (A)): the shipping ship pays the shipping price.
//   1. ~/.dotnet/dotnet run --project hosts/web -- --port 8460 --ship wreck
//      python3 client/serve.py 8461
//   2. node client/tools/heater-shot.mjs --out docs/design/shots
//
// TO DRIVE THE REFUSAL INSTEAD (the planted-failure control for the price, and the state the ship
// is in once its Parts are spent):
//   1. node client/tools/heater-shot.mjs --prep --place-cost 99   # a price the wreck cannot meet
//   2. <the printed host command>, then the same run — the placement and LEDGER checks go red.
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / board-fault-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Decoded by the CLIENT'S OWN modules — this tool cannot drift from what the surface believes.
import { decodeDecks, decodeRooms, decodeDevices } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { deckSlots, roomTileRect, roomFit } from '../src/ui/room-model.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8460');
const CLIENT_PORT = +arg('client-port', '8461');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'heater-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9374');
const TARGET_C = +arg('target-c', '6');       // how cold the working room must get before we place
const MAX_WAIT_S = +arg('max-wait-s', '240'); // wall-clock bound on the fast-forward
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

let failures = 0;
const check = (ok, what) => { log((ok ? '  ✓ ' : '  ✗ FAIL ') + what); if (!ok) failures++; return ok; };

const REPO = resolve(new URL('../..', import.meta.url).pathname);

// ───────────────────────────── --prep: the temp defs overlay, and nothing else
if (process.argv.includes('--prep')) {
  const src = join(REPO, 'content', 'core', 'SimDefs');
  const dst = mkdtempSync(join(tmpdir(), 'heater-defs-'));
  // ⚠️ A COMPLETE COPY, SUBDIRECTORIES INCLUDED. `Sim.Dsl/RulesLoader.cs` reads
  // `<defsDir>/rules/*.moss`; an overlay that skipped them would boot the acceptance host with NO
  // designer rules while this header claimed the only change was a price.
  let copied = 0, rulesCopied = 0;
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) {
      mkdirSync(join(dst, e.name), { recursive: true });
      for (const f of readdirSync(join(src, e.name))) { copyFileSync(join(src, e.name, f), join(dst, e.name, f)); rulesCopied += 1; }
    } else { copyFileSync(join(src, e.name), join(dst, e.name)); copied += 1; }
  }
  const wantRules = readdirSync(join(src, 'rules')).length;
  if (rulesCopied !== wantRules) { console.error(`FAIL: copied ${rulesCopied} of ${wantRules} files under rules/`); process.exit(2); }
  log(`copied ${copied} def files + ${rulesCopied} rules/*.moss`);
  const bd = join(dst, 'build.def');
  const before = readFileSync(bd, 'utf8');
  // ⭐ THE OVERLAY'S PRICE IS AN ARGUMENT NOW, and that is the whole of what changed here. It used
  // to be hard-wired to 0 because the wreck could not afford 3; the wreck can (see (A)), so the
  // overlay's remaining job is the OPPOSITE one — naming a price the ship CANNOT meet, which is how
  // the refusal is driven on demand and how this rig's own planted-failure control is run.
  const cost = arg('place-cost', '0');
  if (!/^\d+$/.test(cost)) { console.error('FAIL: --place-cost must be a non-negative integer'); process.exit(2); }
  const after = before.replace(/^device_place_cost\s*=\s*\d+/m, 'device_place_cost     = ' + cost);
  if (after === before) { console.error('FAIL: device_place_cost not found in build.def'); process.exit(2); }
  writeFileSync(bd, after);
  log(`wrote a defs overlay with device_place_cost = ${cost} (and NOTHING else changed):\n  ` + dst);
  log('\nstart the two halves with:');
  log(`  ~/.dotnet/dotnet run --project hosts/web -- --port ${HOST_PORT} --ship wreck --data ${dst}`);
  log(`  python3 client/serve.py ${CLIENT_PORT}`);
  log('\nthen: node client/tools/heater-shot.mjs --out docs/design/shots');
  process.exit(0);
}

// ───────────────────────────────────────────────── 1. the independent socket (the verdict channel)
mkdirSync(OUT, { recursive: true });
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

/** The `rooms` channel, keyed by anchor name — the SIM's own temperature, not the client's label. */
function roomsNow() {
  const rs = decodeRooms(latest.get('rooms')) || [];
  const out = new Map();
  for (const r of rs) if (r && r.anchorName) out.set(r.anchorName, r);
  return out;
}
const tempC = (anchor) => { const r = roomsNow().get(anchor); return r ? r.tempK - 273.15 : NaN; };

// ───────────────────────────── THE LEDGER SIDE OF THE PLACEMENT (2026-08-04, see header (A))
// `items` cells are ground stacks: [x, y, deck, kind, count, …] (WireFormat's items channel), and
// LOOSE is exactly what "ground stack" means — a carried or reserved unit is not on this channel.
// ⚠️ THE KIND BYTE IS MIRRORED, NOT IMPORTED, like `thaw-blocked-shot.mjs`'s: this file is a tool,
// and the claim below is about what the SHIP's larder does, not about a client module.
const ITEM_PARTS = 5;
const looseParts = () => (latest.get('items')?.cells || [])
  .filter((c) => (c[3] | 0) === ITEM_PARTS).reduce((n, c) => n + (c[4] | 0), 0);
// ⛔ THE PRICE COMES FROM THE DEFS THE HOST IS ACTUALLY RUNNING, never from a literal in this file.
// Default: the shipped `build.def`. Under a `--prep` overlay the host's price is the one `--prep`
// wrote, so the same `--place-cost` argument is passed to the run — a rig that priced the placement
// from the repo while the host ran an overlay would report a false LEDGER failure.
const PLACE_COST = (() => {
  const override = arg('place-cost', null);
  if (override !== null) return +override;
  const src = readFileSync(join(REPO, 'content', 'core', 'SimDefs', 'build.def'), 'utf8');
  const m = /^device_place_cost\s*=\s*(\d+)/m.exec(src);
  if (!m) { console.error('FAIL: device_place_cost not found in content/core/SimDefs/build.def'); process.exit(2); }
  return parseInt(m[1], 10);   // parseInt on a digits-only capture — no locale in the path (de-DE box)
})();

const decks = decodeDecks(latest.get('decks'));
if (!decks) { console.error('FAIL: no `decks` message — is the host up on ' + HOST_PORT + '?'); process.exit(2); }
const dView = decksView(decks, decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, 0);
const roomRects = slots.filter((s) => s.anchorName).map((s) => ({ anchor: s.anchorName, ...s.rect }));

// THE WORKING ROOM and THE CONTROL. Chosen by MEASUREMENT, not by name: the working room is the
// PRESSURISED deck-0 compartment that is coldest right now (a heater in a vacuum hall would warm
// nothing a player can use, and `IsBreathable` would still refuse it for pressure); the control is
// the next-coldest pressurised one, which gets no heater and must keep falling in the same run.
const pressurised = [...roomsNow().values()]
  .filter((r) => r.deck === 0 && r.pressureKPa > 20)
  .sort((a, b) => a.tempK - b.tempK);
log('pressurised deck-0 compartments, coldest first:');
for (const r of pressurised) log(`   ${r.anchorName.padEnd(14)} ${(r.tempK - 273.15).toFixed(2)} C  ${r.pressureKPa.toFixed(1)} kPa  ${r.tileCount} tiles`);
if (pressurised.length < 2) { console.error('FAIL: need two pressurised deck-0 compartments'); process.exit(3); }
const WORK = pressurised[0].anchorName;
const CTRL = pressurised[1].anchorName;
log(`WORKING ROOM: ${WORK}   CONTROL (no heater): ${CTRL}`);

// ───────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'heater-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1280,800'),
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
const evalJson = async (expr) => { const v = await evaluate(`JSON.stringify(${expr})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '2') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const mouse = (type, x, y) => call('Input.dispatchMouseEvent',
  { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
async function clickAt(x, y) { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
async function dragFrom(a, b) {
  await mouse('mousePressed', a.x, a.y);
  await mouse('mouseMoved', (a.x + b.x) / 2, (a.y + b.y) / 2);
  await mouse('mouseMoved', b.x, b.y);
  await mouse('mouseReleased', b.x, b.y);
}
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
/** The Overview's own speed stepper — the « / » buttons a player clicks (overview-view.js:333-335),
 *  which send the same `Cmd.speed(±1)` the +/- keys do. Clicked rather than typed because a click on
 *  a real button is the gesture, and because it cannot be swallowed by a focused text field. */
async function speed(dir, times) {
  const sel = dir > 0 ? '[data-ov-speed-up]' : '[data-ov-speed-dn]';
  for (let i = 0; i < times; i++) {
    const b = await centre(sel);
    // ⚠️ MEASURED, NOT ASSUMED: the stepper lives on the OVERVIEW toolbar, so while the Room Zoom
    // owns the screen these clicks land on nothing and the game quietly stays at 1×. This harness's
    // own first run spent its whole heating phase at 1× and reported "5.78 -> 5.78 C" — a real
    // failure that read exactly like a dead heater. A zero-size or absent button is now fatal.
    if (!b || !b.w || !b.h) { console.error('FAIL: the speed stepper ' + sel + ' is not clickable here — leave the Room Zoom first'); process.exit(10); }
    await clickAt(b.x, b.y);
    await sleep(300);
  }
  return evaluate(`(()=>{const e=document.querySelector('.ov-speedval');return e?e.textContent:'(none)';})()`);
}
/** ESC back to the Level-1 Overview (controls.js's one deliberate key exception). */
async function leaveZoom() {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(1500);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) {
  console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it');
  process.exit(8);
}
await png('01-boot-overview.png');

// ─────────────────────────────────── 3. FAST-FORWARD with the game's own speed control, and only it
log(`\n=== FAST-FORWARD until ${WORK} is below ${TARGET_C} C (bounded at ${MAX_WAIT_S} s wall) ===`);
log(`  ${WORK} starts at ${tempC(WORK).toFixed(2)} C, ${CTRL} at ${tempC(CTRL).toFixed(2)} C`);
const speedLabel = await speed(+1, 4);   // 1x -> 1000x, through the player's own stepper
log('  speed reads:', JSON.stringify(speedLabel));
const t0 = Date.now();
let ffOk = false;
// ⭐ THE CONTROL'S PRE-HEATER DRIFT, RECORDED WHILE NO HEATER EXISTS. It is the evidence behind the
// EXCESS threshold below: whatever the control does in the measurement phase, this says how much of
// it the control was already doing before the heater was placed.
let ctrlPrev = tempC(CTRL), ctrlDriftPre = 0;
while ((Date.now() - t0) / 1000 < MAX_WAIT_S) {
  await sleep(5000);
  const w = tempC(WORK), c = tempC(CTRL);
  ctrlDriftPre = c - ctrlPrev; ctrlPrev = c;
  log(`   t+${Math.round((Date.now() - t0) / 1000)}s  ${WORK} ${w.toFixed(2)} C  |  ${CTRL} ${c.toFixed(2)} C`);
  if (w < TARGET_C) { ffOk = true; break; }
}
log(`  the control's LAST pre-heater interval: ${CTRL} moved ${ctrlDriftPre.toFixed(2)} C in 5 s at this speed `
  + '— the ship\'s own weather, with no heater anywhere');
await speed(-1, 4);   // back to 1x for the gestures
await sleep(1500);
const coldWork = tempC(WORK), coldCtrl = tempC(CTRL);
check(ffOk, `${WORK} reached ${TARGET_C} C by waiting (it is ${coldWork.toFixed(2)} C) — the ship's own cold, not an injected value`);
log(`  COLD BASELINE: ${WORK} ${coldWork.toFixed(2)} C, ${CTRL} ${coldCtrl.toFixed(2)} C`);
await png('02-cold-overview.png');

// ───────────────────────────────────────────────── 4. THE ROOM ZOOM — the palette, then the placement
log('\n=== ROOM ZOOM: the HEATER tool ===');
const rc = await centre(`.pl-room[data-anchor="${WORK}"]`);
if (!rc) { console.error(`FAIL: .pl-room[data-anchor="${WORK}"] is not in the Overview DOM`); process.exit(7); }
await clickAt(rc.x, rc.y);
await sleep(3000);

const clipped = await evalJson(`(()=>{const p=document.getElementById('rz-palette');const pr=p.getBoundingClientRect();const out=[];for(const b of p.querySelectorAll('.rz-tool')){const r=b.getBoundingClientRect();if(r.right>pr.right+0.5||r.left<pr.left-0.5||r.bottom>pr.bottom+0.5||r.top<pr.top-0.5||r.width===0)out.push(b.dataset.rztool);}return out;})()`);
check(Array.isArray(clipped) && clipped.length === 0, `every palette button is inside the palette box (clipped: ${JSON.stringify(clipped)})`);
// 18 -> 21 (2026-08-04): GROWBED, MEDBED and TABLE joined the palette. Moved in the same commit as
// the tools, for the reason `erase-shot.mjs`'s twin of this line gives — neither harness is in
// `./ci.sh`, so a stale literal here dies as a red on the NEXT person's unrelated run.
check((await evaluate(`document.querySelectorAll('#rz-palette .rz-tool').length`)) === 21, 'the palette paints 21 tools (HEATER among them)');
const heaterBtn = await centre('[data-rztool="heater"]');
check(!!heaterBtn, 'the palette carries a HEATER button — without it the verb is unreachable');
const palCrop = await evalJson(`(()=>{const e=document.getElementById('rz-palette');const r=e.getBoundingClientRect();const pad=8;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})()`);
if (palCrop) await png('03-palette-with-heater.png', palCrop);

const room = roomRects.find((r) => r.anchor === WORK);
if (!room) { console.error('FAIL: no room rect for ' + WORK); process.exit(9); }
// ⚠️ THE TILE→SCREEN MAP IS `roomFit`'s, INVERTED — the client's OWN function, not a re-derivation.
// `tileFromCanvasXY` reads `roomFit(focus, w, h)` for {s, offX, offY}; this harness's first draft
// assumed plain `xMidYMid meet` letterboxing off the viewBox (the Overview's rule, copied from
// erase-shot's OVERVIEW leg) and every click missed its tile silently — a placement that never
// happened looks exactly like a placement the sim refused. Importing the real function makes the
// two impossible to disagree.
const focus = roomTileRect(dView, WORK);
if (!focus) { console.error('FAIL: no roomTileRect for ' + WORK); process.exit(9); }
const L = await evalJson(`(()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();return {left:r.left,top:r.top,w:r.width,h:r.height};})()`);
const U = 32;
const fit = roomFit(focus, L.w, L.h);
const screenOf = (tx, ty) => ({
  x: L.left + fit.offX + ((tx - focus.rx) * U + U / 2) * fit.s,
  y: L.top + fit.offY + ((ty - focus.ry) * U + U / 2) * fit.s,
});

const devsIn = () => (decodeDevices(latest.get('devices')) || [])
  .filter((d) => d.deck === 0 && d.x >= room.x && d.x < room.x + room.w && d.y >= room.y && d.y < room.y + room.h);
const HEATER_KIND = 28;
const occupied = new Set(devsIn().map((d) => d.x + ',' + d.y));
let target = null;
for (let y = room.y + 1; y < room.y + room.h - 1 && !target; y++)
  for (let x = room.x + 1; x < room.x + room.w - 1 && !target; x++)
    if (!occupied.has(x + ',' + y)) target = { x, y };
if (!target) { console.error('FAIL: no free tile in ' + WORK); process.exit(9); }
log(`  placing on the free tile ${target.x},${target.y}`);

const heatersBefore = devsIn().filter((d) => d.kind === HEATER_KIND).length;
const partsBefore = looseParts();
log(`  loose Parts before the placement: ${partsBefore} (the price is ${PLACE_COST})`);
await clickAt(heaterBtn.x, heaterBtn.y);
await sleep(900);
await png('04-heater-armed.png');
// ⚠️ A CLICK, NOT A DRAG, AND THE DIFFERENCE IS THE WHOLE GESTURE. `isSweepTool` is
// `structural || order || erase`; HEATER is `functional`, so `roomzoom-view.js`'s `onCanvasDown`
// returns early and the placement rides `onCanvasClick` (`:1268-1273`). This harness's first run
// used `dragFrom(p, p)` — copied from the STRIP leg of erase-shot.mjs, where the tool IS swept —
// and reported `0 -> 0` heaters. That failure is indistinguishable from a broken command, and it
// was the RIG being wrong about the gesture. Recorded rather than quietly fixed.
{
  const p = screenOf(target.x, target.y);
  await clickAt(p.x, p.y);
  await sleep(2500);
}
const toastLine = await evaluate(`(()=>{const t=document.getElementById('rz-toast');if(!t)return '(no toast)';return t.hidden?'(HIDDEN) '+t.textContent:t.textContent;})()`);
log('  TOAST:', JSON.stringify(toastLine));
const heatersAfter = devsIn().filter((d) => d.kind === HEATER_KIND).length;
const partsAfter = looseParts();
check(heatersAfter === heatersBefore + 1,
  `a HEATER landed in ${WORK} on the devices channel (${heatersBefore} -> ${heatersAfter}) — the `
  + 'sim confirmed the placement, not the client');
// ⭐⭐ AND THE SHIP PAID FOR IT. Two claims, not one: a placement that landed FREE — a price seam
// that stopped charging, or a def overlay left behind by a previous run — is byte-identical on the
// devices channel to one that was paid for. This leg is what keeps the price non-vacuous now that
// the wreck can afford it, and it is the leg that goes red under `--prep --place-cost 99` (the
// refusal control), where NOTHING is placed and NOTHING is spent.
check(partsBefore - partsAfter === PLACE_COST,
  `THE SHIP PAID: loose Parts ${partsBefore} -> ${partsAfter} across the click, a drop of `
  + `${partsBefore - partsAfter} against build.def's device_place_cost = ${PLACE_COST} — read off `
  + 'this tool\'s own `items` socket, not off a client label');
const placed = devsIn().find((d) => d.kind === HEATER_KIND);
if (placed) log(`  placed heater: kind=${placed.kind} at ${placed.x},${placed.y} cond=${placed.cond} oper=${placed.oper}`);

// ART: a real piece, not the VS-Z-25 dashed placeholder chip carrying a raw 'E'.
const chip = await evalJson(`(()=>{const n=[...document.querySelectorAll('#rz-layers text')].map(t=>t.textContent.trim()).filter(t=>t==='E');return n.length;})()`);
check(chip === 0, `the heater does NOT draw as a raw-letter chip (found ${chip} bare 'E' glyphs in the room layers)`);
await png('05-heater-placed.png');
const zoomCrop = await evalJson(`(()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()`);
if (zoomCrop) await png('06-heater-roomzoom-crop.png', zoomCrop);

// ────────────────────────────────────────────── 5. IT HEATS — against a control that keeps falling
log('\n=== IT HEATS (and the compartment next door does not) ===');
// The speed stepper is an OVERVIEW control — see speed()'s note. ESC pops the zoom, and the pop is
// VERIFIED rather than slept through.
for (let i = 0; i < 6; i++) {
  await leaveZoom();
  const b = await centre('[data-ov-speed-up]');
  if (b && b.w && b.h) break;
}
log('  speed reads:', JSON.stringify(await speed(+1, 3)));    // 100x
const samples = [];
for (let i = 0; i < 12; i++) {
  await sleep(5000);
  samples.push({ t: (i + 1) * 5, work: tempC(WORK), ctrl: tempC(CTRL) });
  log(`   t+${(i + 1) * 5}s  ${WORK} ${tempC(WORK).toFixed(2)} C  |  ${CTRL} ${tempC(CTRL).toFixed(2)} C`);
}
await speed(-1, 3);
const warmWork = tempC(WORK), warmCtrl = tempC(CTRL);
check(warmWork > coldWork + 1.0,
  `${WORK} CLIMBED with one heater in it: ${coldWork.toFixed(2)} -> ${warmWork.toFixed(2)} C`);
// ⚠️ THE CONTROL IS ASSERTED AS A DISCRIMINATOR, NOT AS "IT FELL". Measured on the shipped wreck,
// `wreck_spine_0` does NOT fall monotonically — it went 7.32 → 7.67 °C between sim-days 2 and 3,
// because the spine is fed by conduction through the doors of compartments whose machines are still
// running. A `warmCtrl < coldCtrl` assertion would therefore be a coin flip on the ship's own
// weather, and a coin flip that happened to land right would look exactly like a working control.
// What the control really has to rule out is "the whole ship warmed".
//
// ⛔⛔ AND THE RATIO THAT USED TO SAY SO WENT RED ON A WORKING HEATER, 2026-08-04 — a FALSE RED
// (TRAPS 3) manufactured by the D7 premise shift, measured by running it. The leg was
// `workDelta > 5 × |ctrlDelta|`, i.e. a ratio whose DENOMINATOR was assumed to be ~0. It is not any
// more: D7's seven `cabin stores` crates took the wreck to 3+ Parts, at which the ship STOPS
// BROWNING OUT (that package's own filed, measured owner call) — machines run continuously, and
// EVERY compartment now drifts WARM. Measured in the run that went red: reactor +8.81 °C with the
// heater, cryobay +1.83 °C without one, ratio 4.8× — under a threshold of 5, while the heater was
// working perfectly. ⭐ AND THE DRIFT IS THE SHIP'S, NOT THE HEATER'S, MEASURED INSIDE THAT SAME
// RUN: the control was already climbing 10.00 → 11.31 °C in the last fast-forward interval BEFORE
// the heater existed, at 1000× — 0.131 °C per 5 s once scaled to the 100× measurement phase, which
// is the 0.15 °C per 5 s it went on doing afterwards. The control's rise is the ship's weather
// continuing at its own rate; the heater did not cause it.
// ⇒ THE DISCRIMINATOR IS NOW AN EXCESS, NOT A RATIO — how much MORE the working room gained than
// the drifting ship — which is immune to a non-zero baseline in both directions. Two legs, not one
// conjunction, so a failure names itself (the blinded-legs shape).
const workDelta = warmWork - coldWork, ctrlDelta = warmCtrl - coldCtrl;
log(`  the ship's own drift this run: ${CTRL} moved ${ctrlDelta.toFixed(2)} C with no heater in it`);
// THE FLOOR IS SET FROM THE MEASUREMENT, and it is stated: the excess measured on the shipping
// wreck was 8.81 − 1.83 = 6.98 °C, so 4.0 leaves ~40 % headroom. A dead heater gives an excess of
// ~0 (the working room drifts with everything else) and so does a ship-wide warming.
check(workDelta - ctrlDelta > 4.0,
  `THE HEAT IS LOCAL, not the whole ship: ${WORK} moved ${workDelta.toFixed(2)} C while ${CTRL} `
  + `moved ${ctrlDelta.toFixed(2)} C in the same run — an EXCESS of `
  + `${(workDelta - ctrlDelta).toFixed(2)} C over the ship's own drift (floor 4.0).`);
check(ctrlDelta < 0.5 * workDelta,
  `…and the control did not merely follow it: ${CTRL} took ${(100 * ctrlDelta / (workDelta || 1e-9)).toFixed(0)}% `
  + `of ${WORK}'s rise (must be under 50% — at ~100% the whole ship warmed and the heater proved nothing).`);
check(warmWork < 45, `and it stayed below heat_stroke_c (${warmWork.toFixed(2)} C)`);
await png('07-heated-overview.png');

log('\n=== SUMMARY ===');
log(`  ${WORK}: ${coldWork.toFixed(2)} C -> ${warmWork.toFixed(2)} C  (one placed heater)`);
log(`  ${CTRL}: ${coldCtrl.toFixed(2)} C -> ${warmCtrl.toFixed(2)} C  (no heater)`);
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
try { ws.close(); } catch { /* ignore */ }
chrome.kill('SIGKILL');
process.exit(failures ? 1 : 0);
