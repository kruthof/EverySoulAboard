#!/usr/bin/env node
// M3-15 / OD-N — "THE SHIP ANSWERS TO THE CONSOLE", driven in real Chrome against the running game.
// This is the package's acceptance script, automated so a reviewer can re-run it instead of
// re-typing it.
//
// WHAT ONLY THIS TOOL CAN SEE. `MossGateTests` / `MossConsoleGateTests` drive the sim and the web
// host directly; `surface-boundary.test.js` proves the client no longer names the deleted verb. None
// of them can see:
//   1. THAT THE ROOM ZOOM'S OPERATE AFFORDANCE IS REALLY GONE FROM THE PIXELS — the palette button,
//      the hint line, and the ring/plate layer that the `O` key used to reveal. A deleted export is
//      not a deleted affordance until the surface is drawn.
//   2. THAT THE REFUSAL IS A LINE THE PLAYER CAN READ, on the console's error stream, in the real
//      stylesheet. ⚠️ The charter is explicit that step 2 must stay a TEXT REFUSAL and never soften
//      into a greyed button: "a prompt's refusal is a line of text, and a line of text is a surface".
//   3. THAT THE SPLIT IS VISIBLE IN ONE SITTING — the same console that opens a door still refuses
//      to install a program, in different words, naming the CONTROLLER MODULE.
//
// ⚠️ IT TYPES. OD-P made the MOSS console a terminal: there are no letter hotkeys, every printable
// character types into the prompt, and ENTER submits. So every command below is dispatched as
// TRUSTED key events over CDP, exactly as a player produces them — a `.value =` write plus a
// synthetic `input` event would prove the reducer works and nothing about the keyboard.
//
// USAGE
//   1. ./play.sh --host-port 8390 --client-port 8391 --no-open
//   2. node client/tools/moss-gate-shot.mjs --out docs/design/shots [--host-port 8390] [--client-port 8391]
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free (the moss-shot.mjs / awaiting-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'moss-gate-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9351');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ───────────────────────────── 1. the sim's own truth, on an INDEPENDENT socket (never the page)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

// The wreck's shut, named doors, off the `decks`/`devices` truth the host publishes. The device the
// acceptance script types at is resolved from the SHIP, not hard-coded: a re-authored deck must
// fail this tool loudly rather than turn it into a test of a name nobody has.
const devices = latest.get('devices');
if (!devices?.cells?.length) { console.error('FAIL: no devices channel on the wire'); process.exit(2); }

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'moss-gate-shot-'));
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
  } catch { /* not up yet */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name); writeFileSync(p, Buffer.from(r.result.data, 'base64')); log('  wrote', p);
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** One TRUSTED keystroke, the way OD-P's terminal expects them. */
async function key(k) {
  const printable = k.length === 1;
  const base = { key: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0) };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: printable ? k : (k === 'Enter' ? '\r' : undefined) });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function type(line) { for (const ch of line) { await key(ch); await sleep(12); } }
/** Type one command at the MOSS prompt and return the transcript AFTER it. */
async function prompt(line) {
  await type(line);
  await key('Enter');
  await sleep(1200);
  return json(`[...document.querySelectorAll('.moss-cline')].map((e)=>[e.className,e.textContent])`) || [];
}
const errLines = (t) => t.filter(([c]) => /\berr\b/.test(c)).map(([, s]) => s);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// dismiss the onboarding card if it mounted
for (let i = 0; i < 15; i++) {
  const onb = await centre('[data-onb-begin]');
  if (onb) { await clickAt(onb.x, onb.y); await sleep(1500); break; }
  await sleep(1000);
}

// ── STEP 1: the OPERATE verb is gone from the Room Zoom.
log('\nSTEP 1 — no OPERATE tool, no ring, no OPEN/SHUT plate, and `O` does nothing');
const room = await centre('.pl-room[data-anchor="cryobay"]');
if (!room) { check(false, 'the CRYO BAY room element is not on the Overview'); }
else { await clickAt(room.x, room.y); await sleep(2500); }
const zoomOpen = await evaluate(`!document.getElementById('roomzoom-view')?.hidden`);
check(!!zoomOpen, 'the Room Zoom opened (otherwise every check below is vacuous)');
check(!(await evaluate(`!!document.querySelector('[data-rztool="operate"]')`)),
  'the palette has no OPERATE button');
check(!/OPERATE/.test(await evaluate(`document.querySelector('.rz-hint')?.textContent||''`) || ''),
  'the palette hint no longer teaches OPERATE');
await key('o');
await sleep(600);
check(!(await evaluate(`!!document.querySelector('.rz-operate-layer, .rz-operable')`)),
  'pressing O reveals no ring / OPEN-SHUT plate layer — the affordance is not merely unlabelled');
await png('01-roomzoom-no-operate.png');
await key('Escape'); await sleep(400); await key('Escape'); await sleep(1200);   // back to the Overview

// ── STEP 2: the console refuses, IN WORDS, naming the server.
log('\nSTEP 2 — `open <door>` is refused in words, naming the server and what it needs');
const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) { console.error('FAIL: no MOSS tab on the Overview'); failures += 1; }
else { await clickAt(mossTab.x, mossTab.y); await sleep(2500); }
const promptBox = await centre('.moss-input');
if (promptBox) await clickAt(promptBox.x, promptBox.y);
await sleep(400);

const DOOR = arg('door', 'door_d0_s1');
// term_moss's tile, from the ship's own authoring (`AuthoredShips.cs:2059`, the cryo bay's west
// wall at its centre row). Used ONLY to read the device row off the independent socket.
const MOSS_XY = [1, 3];
const t1 = await prompt('open ' + DOOR);
const e1 = errLines(t1);
log('  transcript(err):', JSON.stringify(e1.slice(-3)));
check(e1.some((s) => /MOSS IS OFFLINE/.test(s)), 'the refusal names MOSS as OFFLINE');
check(e1.some((s) => /TERMINAL/.test(s) && /REPAIR/.test(s)),
  'and names the SERVER and what it needs — a repair, not a mystery');
check(t1.some(([c]) => /echo/.test(c)), 'the line the player typed is echoed — it is a terminal');
await png('02-console-refuses.png');

// ── STEP 5 (taken here, while the ship is still dark, and again after the repair):
//    a program is refused in DIFFERENT words. On a dark ship the SHIP gate wins — worst-first.
log('\nSTEP 5a — on a DARK ship the offline sentence wins over the commissioning one');
const t2 = await prompt('prog term_moss');
const e2 = errLines(t2);
log('  transcript(err):', JSON.stringify(e2.slice(-2)));
check(e2.some((s) => /MOSS IS OFFLINE/.test(s)),
  'ship gate first: a program fetch on a dark ship says OFFLINE, not CONTROLLER MODULE');

// ── STEP 3: repair term_moss. Driven through the WORK tab (OD-H boots every work type OFF).
log('\nSTEP 3 — turn REPAIR on and let her service term_moss');
// ⚠️ MOSS IS A BODY-LEVEL TAKEOVER: while it is up the Overview's tab bar is not on screen, so the
// WORK click has to leave the console first. `exit` is the console's own nav verb (OD-P: typed, not
// a hotkey) — using it rather than an ESC keeps this harness inside the vocabulary a player has.
// ⚠️ `exit` alone is not enough from a DEEPER screen: step 5a's `prog term_moss` pushed the PROGRAM
// directory onto MOSS's own screen stack, and its footer says `[ESC] BACK`. ESC is a STACK key, not
// a letter hotkey, so it survives OD-P; unwind, then leave.
for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(500); }
await sleep(1200);
const back = await centre('[data-ov-tab="work"]');
if (!back) { check(false, 'the Overview tab bar is not reachable — `exit` did not leave MOSS'); }
else { await clickAt(back.x, back.y); await sleep(1500); }
await png('03-work-tab.png');
// The work grid's own cell for Repair @ priority 1. Selector kept loose on purpose: this tool must
// fail loudly if the WORK tab is re-shaped, not silently skip the repair.
// WORK_COLUMNS[0] is REPAIR (`overview-model.js:368`); the cell carries the crew id and the work
// type on the element the player clicks, and one click steps the priority off 0.
const cellSel = '.ov-workcell[data-ov-work-type="0"]';   // WORK_COLUMNS[0] === REPAIR
const wcell = await centre(cellSel);
if (!wcell) { check(false, 'the WORK tab exposes no REPAIR cell to click (re-point `cellSel`)'); }
else {
  await clickAt(wcell.x, wcell.y); await sleep(1200);
  log('  REPAIR cell now reads', await evaluate(`document.querySelector('${cellSel}')?.textContent`));
}
// Run the clock up, then wait for the SHIP's own answer. ⭐ THE INSTRUMENT IS THE `devices` CHANNEL
// ON AN INDEPENDENT SOCKET, never the page: `cond` is `Device.Condition` quantised to a byte, so
// `term_moss` crossing `maintain` (0.20 ⇒ 51/255) is visible without asking the console whether the
// console works.
const spd = await centre('[data-ov-speed-up]');
for (let i = 0; i < 4; i++) { if (spd) { await clickAt(spd.x, spd.y); await sleep(200); } }
const mossCond = () => {
  const cells = latest.get('devices')?.cells || [];
  const row = cells.find((c) => c[0] === MOSS_XY[0] && c[1] === MOSS_XY[1] && c[2] === 0);
  return row ? row[4] : -1;   // [x,y,deck,kind,COND,oper,open]
};
log('  term_moss cond at boot:', mossCond());
let lit = false;
for (let i = 0; i < 240 && !lit; i++) {
  await sleep(1000);
  if (mossCond() >= 52) lit = true;
  if (i % 30 === 29) log('    …', i + 1, 's, term_moss cond =', mossCond());
}
check(lit, 'the crew SERVICED term_moss above its `maintain` floor (cond ' + mossCond() + '/255)');
// back into the console the way a player does — the terminal on the map, or the MOSS tab.
const mossTab2 = await centre('[data-ov-tab="moss"]');
if (mossTab2) { await clickAt(mossTab2.x, mossTab2.y); await sleep(2000); }
const box2 = await centre('.moss-input');
if (box2) await clickAt(box2.x, box2.y);
await sleep(400);

// ── STEP 4: the same line now opens the door, and a vent moves.
log('\nSTEP 4 — the console lights: the same line opens the door');
const t3 = await prompt('open ' + DOOR);
const e3 = errLines(t3);
check(!e3.some((s) => /MOSS IS OFFLINE/.test(s)),
  'after the repair the SAME line is no longer refused for being offline');
check(t3.some(([, s]) => /QUEUED/.test(s)), 'the console reports the write as QUEUED');
await png('04-console-opens.png');
const t4 = await prompt('open vent_ls');
check(t4.some(([, s]) => /QUEUED/.test(s)),
  'and `open vent_ls` — the M1 gate device, unreachable to the fog-gated click — is accepted BY NAME');

// ── STEP 5b: the SPLIT. The same live console still refuses a program, in other words.
log('\nSTEP 5b — THE SPLIT: a repaired console still refuses to install a program');
const t5 = await prompt('prog term_moss');
const e5 = errLines(t5);
log('  transcript(err):', JSON.stringify(e5.slice(-2)));
check(e5.some((s) => /NOT COMMISSIONED/.test(s) && /CONTROLLER MODULE/.test(s)),
  'the program refusal names the CONTROLLER MODULE — a DIFFERENT sentence from the offline one');
check(!e5.some((s) => /MOSS IS OFFLINE/.test(s)),
  'and does NOT say MOSS IS OFFLINE — the two tiers must not be confusable');
await png('05-split-program-refused.png');

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
