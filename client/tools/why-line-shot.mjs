#!/usr/bin/env node
// THE `why` LINE (M2-6) — the LIVE-PIXEL acceptance, driven in real Chrome against the running game.
//
// WHY IT EXISTS AND WHAT ONLY IT CAN SEE. M2-6's first cut appended the ranking clause to the
// roster's `task` field and both crew docks rendered the whole string. They cannot hold it: at the
// shipped Space Mono sizes `.ov-crewtask` is ~147 px ≈ 26 characters and `.rz-crewtask` ~120 px ≈ 23,
// against clause-bearing labels of 43–54. `text-overflow:ellipsis` then ate the PAYLOAD — the
// priority number, the entire point of the package — 100% of the time, and the row read
// "Servicing door_d0_s0 — Re…". ⛔ NO NODE HARNESS CAN SEE THAT. There is no jsdom in this repo and
// `dom-lite` has neither `innerHTML` nor `querySelector`, so neither view can even be mounted, and
// no stub computes a font metric or applies `text-overflow`. `client/test/why-line.test.js` pins the
// derivation and the payload lines; the three claims below are outside anything it can answer:
//   1. THE DOCKS NO LONGER OVERFLOW — `scrollWidth <= clientWidth`, measured with real fonts. This
//      is the defect, and it is a pixel fact.
//   2. THE CLAUSE IS ACTUALLY READABLE SOMEWHERE — `.ov-task` renders the whole sentence, unclipped,
//      with every character on screen. "Invisible feedback is FUNCTIONAL" is binding here.
//   3. FLIPPING THE GRID MOVES THE NUMBER, through the real click path and back over the wire.
//
// USAGE
//   1. ./play.sh --host-port 8348 --client-port 8349 --no-open
//   2. node client/tools/why-line-shot.mjs --out docs/design/shots [--host-port 8348] [--client-port 8349]
//
// Exits non-zero if the host will not answer, if the pawn never takes a job, if a dock overflows,
// or if the clause does not follow the grid — a green run with no pictures is the failure this
// class of tool exists to prevent. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free (same rule as work-tab-shot.mjs / moss-shot.mjs).
//
// ⭐ THIS RIG'S OWN NON-VACUITY, MEASURED (2026-07-30) RATHER THAN ASSUMED. On the fixed tree STEP 3
// reports `scrollW 145 / clientW 145` — and `scrollWidth` is never less than `clientWidth`, so
// "equal" is exactly what a fitting row looks like and is INDISTINGUISHABLE from a broken probe.
// So the mutation was applied to the running client (`t.what` → `t.text` in overview-view.js), the
// page reloaded, and this tool re-run:
//
//     .ov-crewtask: {"text":"Servicing battery_cryo — Repair is priority 1",
//                    "scrollW":249,"clientW":145,"overflows":true}   ⇒ 3 CHECKS FAILED, exit 1
//
// 249 px of content in a 145 px box: ~104 px — about twenty characters, the whole clause and then
// some — eaten by the ellipsis, which is the reviewer's measurement reproduced end to end. The tree
// was then restored from an in-memory copy, never `git checkout` (TRAPS 2).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8348');
const CLIENT_PORT = +arg('client-port', '8349');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'whyline-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9341');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ────────────────────────────────────────────── 1. the sim's own truth, on an independent socket
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
const rosterTask = () => (latest.get('roster')?.crew || []).find((c) => c.cid === rell.cid)?.task || '';

// ────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'whyline-shot-'));
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

/** ⭐ THE INSTRUMENT THE WHOLE FIX-BACK TURNS ON: is this element's content wider than its box?
 *  `scrollWidth > clientWidth` is exactly the condition under which `text-overflow:ellipsis` fires,
 *  measured by the browser with the real font — the thing no node stub can answer. */
const box = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const s=getComputedStyle(e);return {text:e.textContent,scrollW:e.scrollWidth,clientW:e.clientWidth,`
  + `overflows:e.scrollWidth>e.clientWidth,font:s.font,ellipsis:s.textOverflow};})()`);

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }

const openWorkTab = async () => {
  const tab = await centre('[data-ov-tab="work"]');
  if (!tab) { console.error('FAIL: no WORK tab button'); process.exit(7); }
  await clickAt(tab.x, tab.y); await sleep(1200);
};
// Indexed off the NodeList, not `nth-of-type` — the cells are not guaranteed to be the only
// element type among their siblings, and a selector that silently matches nothing would make every
// `setCell` below a no-op that still reported PASS.
const cellCentre = async (i) => json(
  `(()=>{const e=document.querySelectorAll('.ov-worklist .ov-workrow .ov-workcell')[${i}];if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
/** Walk a cell's off→1→2→3→4→off cycle to `want` (the shipped surface ships one gesture). */
async function setCell(i, want) {
  const c = await cellCentre(i);
  if (!c) { console.error('FAIL: no work cell at index ' + i); process.exit(7); }
  for (let n = 0; n < 6; n++) {
    const now = await evaluate(
      `document.querySelectorAll('.ov-worklist .ov-workrow .ov-workcell')[${i}]?.textContent||''`);
    if (now === String(want)) return true;
    await clickAt(c.x, c.y); await sleep(500);
  }
  return false;
}

// ── STEP 1: the grid boots off, and she is awaiting orders ──
log('\nSTEP 1 — boot state (OD-G/OD-H)');
log(`  host TaskLabel: '${rosterTask()}'`);
await openWorkTab();
check(await setCell(0, 1), 'REPAIR set to 1');
check(await setCell(3, 4), 'STRIP (Deconstruct) set to 4');
log('  `work` on the wire:', JSON.stringify(latest.get('work')?.cells));

// ── STEP 2: select her so the readout is on screen, and run the clock until she works ──
log('\nSTEP 2 — select the pawn, run the ship, wait for a job');
const row = await centre('.ov-crew');
if (row) { await clickAt(row.x, row.y); await sleep(900); }
// 100x over the WIRE, exactly as work-tab-shot.mjs does it ({"cmd":"speed","delta":+3} walks the
// speed index 1 → 4). The SIM is untouched by that — it is the same fixed 10 Hz tick, just more of
// them per wall-second — and driving it from this socket rather than the page keeps the measurement
// independent of the surface under test.
ws.send(JSON.stringify({ cmd: 'speed', delta: 3 }));
await sleep(800);
log('  speed is now', latest.get('status')?.speed);
const t0 = Date.now();
while (Date.now() - t0 < 90000 && !rosterTask().includes(' — ')) await sleep(500);
const working = rosterTask();
log(`  host TaskLabel now: '${working}'`);
check(working.includes(' — '), 'the host is emitting a ranking clause (two work types, one job)');

// ── STEP 3: THE DEFECT — do the docks overflow? ──
log('\nSTEP 3 — the two crew docks must NOT overflow');
const ovDock = await box('.ov-crewtask');
log('  .ov-crewtask:', JSON.stringify(ovDock));
check(ovDock && !ovDock.overflows,
  `.ov-crewtask content ${ovDock?.scrollW}px in a ${ovDock?.clientW}px box — a clipped row shows a `
  + 'junk fragment of the answer, which is worse than not answering');
check(ovDock && !/priority/.test(ovDock.text), 'the dock shows the WHAT half only (no clause)');
check(ovDock && !/—\s*$/.test(ovDock.text), 'and leaves no dangling separator');

// ── STEP 4: THE PAYLOAD — the clause is fully readable in the selected readout ──
log('\nSTEP 4 — the ranking clause, whole, in the selected readout');
const ro = await box('.ov-task');
log('  .ov-task:', JSON.stringify(ro));
log(`\n  ⭐ VERBATIM .ov-task READOUT: ${JSON.stringify(ro?.text)}\n`);
check(ro && !ro.overflows, `.ov-task content ${ro?.scrollW}px in a ${ro?.clientW}px box (it wraps)`);
check(ro && /is priority \d/.test(ro.text), 'the readout carries the priority the job was chosen at');
check(ro && ro.text.includes(working), 'the readout is the host\'s whole sentence, unaltered');
await png('01-clause-in-readout.png');

// ── STEP 5: flip the grid and the clause follows ──
log('\nSTEP 5 — flip Repair 1/Strip 4 to Repair 4/Strip 1; the clause must follow');
const before = ro?.text || '';
await openWorkTab();
check(await setCell(0, 4), 'REPAIR set to 4');
check(await setCell(3, 1), 'STRIP set to 1');
await sleep(2500);
const after = await box('.ov-task');
log(`  ⭐ VERBATIM .ov-task AFTER THE FLIP: ${JSON.stringify(after?.text)}`);
check(after && after.text !== before, 'the readout changed when the grid changed');
check(after && /is priority \d/.test(after.text), 'and it still names a priority');
const afterDock = await box('.ov-crewtask');
check(afterDock && !afterDock.overflows, 'the dock still does not overflow after the flip');
await png('02-after-the-flip.png');

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
