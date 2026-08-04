#!/usr/bin/env node
// M2-20 — "THE SHIP IS WAITING ON YOU", driven in real Chrome against the running game. This is
// OD-G's demo and it is the FIRST TEN SECONDS OF A NEW GAME, automated so a reviewer can re-run it.
//
// WHAT ONLY THIS TOOL CAN SEE. `client/test/awaiting-orders.test.js` pins the derivation, the
// stylesheet and the payload line on both surfaces — but there is no jsdom in this repo and
// `dom-lite` parses no markup, so three of this package's claims are outside any node harness:
//   1. THE CLASS ACTUALLY REACHES THE ELEMENT and the stylesheet resolves it to a DIFFERENT COLOUR
//      from the idle row. "Invisible feedback is FUNCTIONAL" is binding here (three owner reports):
//      a distinction the player cannot see is indistinguishable from no distinction at all.
//   2. THE RENDERED TEXT IS THE HOST'S FIELD — compared against the SAME roster message read off an
//      INDEPENDENT WebSocket, so the page cannot be its own witness. That is the single-authority
//      claim recorded at the seam (§13.6) rather than scanned for.
//   3. IT CHANGES UNDER A CHANGED INPUT and changes BACK: switch REPAIR on and the word must go;
//      switch it off and the word must return. A static screenshot cannot tell a live word from a
//      hard-coded one.
// It also walks the charter's acceptance steps 1–5, including "she is visibly alive" (step 2 —
// ⚠️ if she is standing still, STOP: waiting and hung have just become the same picture).
//
// USAGE
//   1. ./play.sh --host-port 8348 --client-port 8349 --no-open
//   2. node client/tools/awaiting-shot.mjs --out docs/design/shots [--host-port 8348] [--client-port 8349]
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (same rule as moss-shot.mjs / work-tab-shot.mjs).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8348');
const CLIENT_PORT = +arg('client-port', '8349');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'awaiting-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9341');
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
const roster0 = latest.get('roster');
if (!roster0?.crew?.length) { console.error('FAIL: no roster on the wire'); process.exit(2); }
const rell = roster0.crew[0];
const rosterTask = () => (latest.get('roster')?.crew || []).find((c) => c.cid === rell.cid)?.task || '';
const rosterPos = () => {
  const c = (latest.get('roster')?.crew || []).find((x) => x.cid === rell.cid);
  return c ? `${c.x},${c.y},${c.deck}` : '?';
};
log(`crew: ${rell.name} (cid ${rell.cid}) — task '${rell.task}'`);
check(Array.isArray(latest.get('work')?.cells) && latest.get('work').cells.length === 0,
  'OD-H: the `work` payload is EMPTY at boot — nothing is switched on for anybody');
check(rell.task === 'Awaiting orders',
  `the HOST's own word at boot is '${rell.task}' — OD-G says the ship is waiting on the player`);

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'awaiting-shot-'));
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
/** The task cell of a dock row, as the PLAYER sees it: text, classes, resolved colour + style. */
const cell = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const s=getComputedStyle(e);`
  + `const r=e.getBoundingClientRect();return {text:e.textContent,cls:e.className,color:s.color,`
  + `style:s.fontStyle,w:Math.round(r.width),h:Math.round(r.height)};})()`);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// ── STEP 3 (taken first, because the card is on top of everything): the card names the first order
log('\nSTEP 3 — the onboarding card names THE FIRST ORDER');
// ⚠️ POLLED, NOT A FIXED SLEEP. A run of this tool once reported "the first screen does not name
// the WORK tab" because the card had simply not mounted yet at the 6-second mark — a FALSE RED that
// reads exactly like the real defect (`CLAUDE.md` trap 3). The card is a `localStorage` one-shot in
// a fresh Chrome profile, so it WILL come; waiting for it is the honest instrument.
let cardText = '(no card)';
for (let i = 0; i < 20 && cardText === '(no card)'; i++) {
  cardText = await evaluate(`document.querySelector('.onb-card')?.textContent||'(no card)'`);
  if (cardText === '(no card)') await sleep(1000);
}
check(/WORK/.test(cardText), 'the first screen names the WORK tab');
check(/put her to work/i.test(cardText), 'and says what it is for');
await png('01-card.png');
// THE ONBOARDING CARD, DISMISSED AND VERIFIED GONE (shared helper, 2026-08-03). The one-shot
// this replaces could SILENTLY SKIP a card that had not painted yet, and every click below
// then landed on a full-screen modal instead of the ship.
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ── STEPS 1+2: touch nothing. Her row says she is waiting, and she is visibly alive.
log('\nSTEPS 1-2 — touch nothing: the row says WAITING, and she moves');
const boot = await cell('.ov-crewtask');
log('  CREW WATCH:', JSON.stringify(boot));
check(boot?.text === rosterTask(),
  `the row renders the HOST's field verbatim ('${boot?.text}' vs the wire's '${rosterTask()}')`);
check(/\bwaiting\b/.test(boot?.cls || ''), 'the row carries the `waiting` state class');
check((boot?.w || 0) > 0 && (boot?.h || 0) > 0, 'the row is actually laid out (non-zero box)');
await png('02-boot-crewwatch.png');

const p0 = rosterPos();
let moved = false;
for (let i = 0; i < 30 && !moved; i++) { await sleep(1000); if (rosterPos() !== p0) moved = true; }
check(moved, `she is VISIBLY ALIVE — she wandered from ${p0} to ${rosterPos()}. ⚠️ If this fails, `
  + 'STOP: "waiting" and "hung" have just become the same picture.');
check(rosterTask() === 'Awaiting orders',
  `…and her row still reads the awaiting sentence while she wanders ('${rosterTask()}')`);

// ── the ROOM ZOOM dock says the same thing (mutation 4, in pixels)
log('\nSTEP 2b — the ROOM ZOOM dock says the same thing');
const anchors = await json(`Array.from(document.querySelectorAll('.pl-room[data-anchor]')).map(e=>e.dataset.anchor)`);
if (anchors?.length) {
  const rc = await centre(`.pl-room[data-anchor="${anchors[0]}"]`);
  await clickAt(rc.x, rc.y); await sleep(3500);
  const rz = await cell('.rz-crewtask');
  log('  ROOM ZOOM dock:', JSON.stringify(rz));
  check(rz?.text === rosterTask(), `the second dock renders the same host field ('${rz?.text}')`);
  check(/\bwaiting\b/.test(rz?.cls || ''), 'and carries the same state class — the two docks agree');
  await png('03-roomzoom-dock.png');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(2000);
} else check(false, 'no room to click — the Room Zoom leg could not run');

// ── STEP 4: give the order. She takes it, and the word goes.
log('\nSTEP 4 — open WORK, set REPAIR, she takes the job and the word goes');
const tab = await centre('[data-ov-tab="work"]');
check(!!tab, 'the WORK tab is on the command bar');
await clickAt(tab.x, tab.y); await sleep(1200);
await png('04-work-tab.png');
const c0 = await centre('.ov-worklist .ov-workrow .ov-workcell');
await clickAt(c0.x, c0.y); await sleep(1200);
check(JSON.stringify(latest.get('work')?.cells) === JSON.stringify([[rell.cid, 0, 1]]),
  'THE SIM HOLDS IT: the `work` channel carries [cid, REPAIR, 1]');

// Run the clock: a service is minutes of wall time at 1x. The speed command goes down THIS tool's
// own socket (the same seam work-tab-shot.mjs uses): index 1 -> 4, i.e. 1 000 tps. The SIM is
// untouched by it — the same fixed 10 Hz tick, just more of them per wall-second.
ws.send(JSON.stringify({ cmd: 'speed', delta: 3 }));
await sleep(1500);
log('  speed is now', latest.get('status')?.speed);
let took = null;
for (let i = 0; i < 40 && !took; i++) {
  await sleep(1000);
  const t = rosterTask();
  if (t && !/^Awaiting/.test(t) && !/^Idle/.test(t)) took = t;
}
check(!!took, `she took the job on her own: '${took}'`);
const working = await cell('.ov-crewtask');
log('  CREW WATCH while working:', JSON.stringify(working));
check(!/\bwaiting\b/.test(working?.cls || ''),
  'the waiting class is GONE now that she has an order — the word is live, not painted once');
check(working?.color !== boot?.color,
  `and the row's resolved colour CHANGED (${boot?.color} -> ${working?.color}). ⭐ THIS IS THE `
  + 'rendered-output-under-a-changed-input leg: two states, two pixels.');
await png('05-working.png');

// ── STEP 5: take the order away again. Autonomy resumes under the grid ⇒ the word comes back.
log('\nSTEP 5 — switch REPAIR back off: the word RETURNS (OD-G\'s second clause)');
const c1 = await centre('.ov-worklist .ov-workrow .ov-workcell');
for (let i = 0; i < 4; i++) { await clickAt(c1.x, c1.y); await sleep(500); }   // 1 -> 2 -> 3 -> 4 -> off
check(JSON.stringify(latest.get('work')?.cells) === JSON.stringify([]),
  'the grid is empty again — REPAIR is back off');
let back = false;
for (let i = 0; i < 60 && !back; i++) { await sleep(1000); back = rosterTask() === 'Awaiting orders'; }
check(back, `her row reads the awaiting sentence again once the current job ends ('${rosterTask()}')`);
const again = await cell('.ov-crewtask');
check(/\bwaiting\b/.test(again?.cls || ''), 'and the class is back with it');
check(again?.color === boot?.color, 'at the same colour it had at boot');
await png('06-waiting-again.png');
ws.send(JSON.stringify({ cmd: 'speed', delta: -3 }));   // leave the host as we found it

try { cdp.close(); } catch { /* already gone */ }
chrome.kill('SIGKILL');
log(failures ? `\nFAILED — ${failures} check(s)` : '\nOK — all checks passed');
process.exit(failures ? 1 : 0);
