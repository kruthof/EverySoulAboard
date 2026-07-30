#!/usr/bin/env node
// THE WORK TAB (M2-3) — the LIVE-PIXEL / LIVE-WIRE acceptance, driven in real Chrome against the
// running game. It is the charter's browser sequence, automated so a reviewer can re-run it.
//
// WHY IT EXISTS AND WHAT ONLY IT CAN SEE. `client/test/overview-model.test.js` drives the real
// controller, but over `dom-lite` — a stub that parses no markup, computes no styles and applies no
// event defaults. Three of this package's claims are outside what any node harness can answer:
//   1. THE CELL IS VISIBLE AND READS `off`, not `0`, with real CSS applied. "Invisible feedback is
//      FUNCTIONAL" is binding here (it has cost this repo three owner reports): a control the player
//      cannot see is indistinguishable from a broken one, and dom-lite cannot tell them apart.
//   2. THE CLICK LANDS THROUGH THE REAL EVENT PATH, on a node the 10 Hz repaint keeps replacing.
//      That is BUG-B's exact hazard on this surface, and only a browser fires (or fails to fire) the
//      trailing `click`.
//   3. THE VALUE SURVIVES A RELOAD, i.e. it came back over the WIRE and not out of anything this
//      page remembers. A reload is the only instrument that can distinguish those two, and a node
//      harness has no page to reload.
// It also re-checks the placement pin against a REAL document: the island must be a descendant of
// `#overview-view`, not of the deprecated console `.app` shell.
//
// ⚠️ ACCEPTANCE STEPS 4 AND 6 ARE DEFERRED BY NAME TO M2-2 (the priority veto) and are NOT driven
// here. Step 4 ("click Repair to 3 → she goes and repairs something") and step 6 ("set Repair back
// to off → she takes nothing new") need a dispatcher that READS the grid; M2-3 merges FIRST, on
// purpose, because a grid nothing reads is inert and harmless while a veto with no grid is an
// unplayable game. ⛔ Do not weaken M2-2's acceptance to what this tool checks.
//
// USAGE
//   1. ./play.sh --host-port 8348 --client-port 8349 --no-open
//   2. node client/tools/work-tab-shot.mjs --out docs/design/shots [--host-port 8348] [--client-port 8349]
//
// Exits non-zero if the host will not answer, if the WORK tab cannot be opened, if a cell does not
// read `off` at boot, if the click does not reach the sim, or if the value does not survive a
// reload — a green run with no pictures is the failure this class of tool exists to prevent.
// It is NOT wired into ./ci.sh: it needs a browser and a running host, and the gate stays
// browser-free (same rule as moss-shot.mjs / operate-shot.mjs).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8348');
const CLIENT_PORT = +arg('client-port', '8349');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'worktab-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9337');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ────────────────────────────────────────────────────── 1. the ship over the wire (the sim's truth)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
const roster = latest.get('roster');
if (!roster?.crew?.length) { console.error('FAIL: no roster on the wire'); process.exit(2); }
const rell = roster.crew[0];
log('crew aboard:', roster.crew.map((c) => `${c.name} (cid ${c.cid}) — ${c.task}`).join(' | '));
// ⚠️ THE SIM'S OWN ANSWER, read off the channel and never off the page: if the payload is not empty
// at boot, every "the grid reads off" claim below is about a ship where it is TRUE for a different
// reason, and the guard would be passing vacuously.
const bootWork = latest.get('work');
log('`work` at boot:', JSON.stringify(bootWork));
check(Array.isArray(bootWork?.cells) && bootWork.cells.length === 0,
  'OD-H: the `work` payload is EMPTY at boot — every work type is off for every soul');

// ────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'worktab-shot-'));
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
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 2 } } : { format: 'png' });
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
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** Every WORK cell of the first row, as the PLAYER sees it: text, state class, and the two facts a
 *  node harness cannot supply — is it laid out at all, and what colour did the stylesheet resolve. */
const cellsNow = async () => json(
  `[...document.querySelectorAll('.ov-worklist .ov-workrow')[0]?.querySelectorAll('.ov-workcell')||[]]`
  + `.map((c)=>{const r=c.getBoundingClientRect();const s=getComputedStyle(c);`
  + `return {text:c.textContent,cls:c.className,w:Math.round(r.width),h:Math.round(r.height),`
  + `color:s.color,border:s.borderStyle,cid:c.dataset.ovWorkCid,type:c.dataset.ovWorkType};})`);

async function openWorkTab() {
  const tab = await centre('[data-ov-tab="work"]');
  if (!tab) { console.error('FAIL: there is no WORK tab button in the command bar'); process.exit(7); }
  await clickAt(tab.x, tab.y);
  await sleep(1200);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// The onboarding takeover swallows every click and every screenshot below it.
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }

// ── STEP 1: open the WORK tab ──
log('\nSTEP 1 — open the WORK tab');
await openWorkTab();
check(await evaluate(`document.querySelector('.ov-work') && !document.querySelector('.ov-work').hidden`),
  'the WORK island is on screen');
check(await evaluate(`document.body.classList.contains('overview-open')`),
  'the Overview is still the shown surface — the tab did NOT drop the player onto the console shell');
// THE PLACEMENT PIN, against a real document: an id census cannot see a re-parenting.
const parentId = await evaluate(`(document.querySelector('.ov-work')?.parentElement?.id)||'(none)'`);
check(parentId === 'overview-view',
  `the grid's parent is #${parentId} — it must be #overview-view (the standard surface)`);
await png('01-work-tab.png');

// ── STEP 2: a row of six columns, every cell `off` and visibly switched off ──
log('\nSTEP 2 — Rell has a row of six columns, every cell OFF');
const headers = await json(`[...document.querySelectorAll('.ov-workhead .ov-workcolhdr')].map(h=>h.textContent)`);
log('  columns:', JSON.stringify(headers));
check(JSON.stringify(headers) === JSON.stringify(['REPAIR', 'BUILD', 'CRAFT', 'STRIP', 'MINE', 'HAUL']),
  'the columns are OD-J\'s order: Repair · Construct · Craft · Deconstruct · Mine · Haul');
const rowName = await evaluate(`document.querySelector('.ov-worklist .ov-workrow .ov-workname')?.textContent||''`);
// `surnameOf` UPPERCASES (console-model.js:71) — the same derivation the CREW WATCH row uses, shared
// rather than re-spelled so the two docks cannot come to name the same soul differently.
check(rowName.length > 0 && rell.name.toUpperCase().includes(rowName),
  `the row is labelled '${rowName}' — the crew member the wire calls '${rell.name}'`);
const boot = await cellsNow();
log('  cells:', JSON.stringify(boot));
check(boot?.length === 6, 'the row carries six cells');
check(boot?.every((c) => c.text === 'off'), 'every cell reads `off`');
check(boot?.every((c) => c.text !== '0'), '⛔ and NOT "0" — a zero in a grid of numbers reads as a priority');
check(boot?.every((c) => c.cls.includes('off')), 'every cell carries the `off` state class');
check(boot?.every((c) => c.w > 0 && c.h > 0), 'every cell is actually laid out (non-zero box)');
check(boot?.every((c) => c.border === 'dashed'), 'the off cell renders visibly switched-off (dashed, not solid)');
check(JSON.stringify(boot?.map((c) => c.type)) === '["0","1","2","3","4","5"]',
  'each cell carries its own WorkType index, left to right');

// ── STEP 3: what the Overview says she is doing ──
log('\nSTEP 3 — what the Overview says she is doing');
const task = await evaluate(`document.querySelector('.ov-crewtask')?.textContent||'(no task line)'`);
log(`  CREW WATCH task line: '${task}'    (the host's own TaskLabel: '${rell.task}')`);
log('  ⚠️ REPORTED, NOT ASSERTED: OD-G\'s "the pawn boots idle and waiting" is M2-19/M2-20\'s subject,');
log('     not this package\'s. This line records what the shipped ship actually shows today.');

// ── STEP 4 is DEFERRED BY NAME to M2-2 — not driven here. See the header. ──

// ── STEP 5: set a cell, reload, and the value survives ──
log('\nSTEP 5 — set REPAIR, reload the page, the value survives');
const c0 = await centre('.ov-worklist .ov-workrow .ov-workcell');
await clickAt(c0.x, c0.y);
await sleep(900);
const after1 = await cellsNow();
log('  after one click:', after1?.[0]);
check(after1?.[0]?.text === '1', 'one click on an `off` cell sets priority 1 (the highest)');
check(after1?.[0]?.cls.includes('set'), 'the cell now carries the `set` state class');
check(JSON.stringify(latest.get('work')?.cells) === JSON.stringify([[rell.cid, 0, 1]]),
  'THE SIM HOLDS IT: the `work` channel on an independent socket carries [cid, 0, 1]');
await clickAt(c0.x, c0.y); await sleep(700);
await clickAt(c0.x, c0.y); await sleep(900);
const after3 = await cellsNow();
check(after3?.[0]?.text === '3', 'two more clicks walk the cycle to 3');
await png('02-repair-at-3.png');

log('  reloading…');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
const onb2 = await centre('[data-onb-begin]');
if (onb2) { await clickAt(onb2.x, onb2.y); await sleep(2500); }
await openWorkTab();
const reloaded = await cellsNow();
log('  after the reload:', JSON.stringify(reloaded?.map((c) => c.text)));
check(reloaded?.[0]?.text === '3',
  'the value SURVIVED the reload — it came back over the wire, not out of local state');
check(reloaded?.slice(1).every((c) => c.text === 'off'),
  'and only the column that was set survived — the other five are still off');
await png('03-after-reload.png');

// Leave the ship as we found it, so a re-run starts from the same OD-H boot state.
ws.send(JSON.stringify({ cmd: 'workPriority', cid: rell.cid, work: 0, priority: 0 }));
await sleep(800);
log('\nrestored: `work` is now', JSON.stringify(latest.get('work')));

chrome.kill('SIGKILL');
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED (steps 1, 2, 3, 5 — 4 and 6 are M2-2\'s)');
process.exit(failures ? 1 : 0);
