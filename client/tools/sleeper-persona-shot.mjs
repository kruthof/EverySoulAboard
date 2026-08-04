#!/usr/bin/env node
// ⭐⭐ M3-8 / THE SLEEPERS ARE PEOPLE — "thaw two capsules and CREW WATCH shows two people who read
// as two people", driven in real Chrome against the running game. This is the package's acceptance
// script, automated so a reviewer can re-run it instead of re-typing it.
//
// WHAT ONLY THIS TOOL CAN SEE. `SleeperPersonaTests` drives the sim and the host directly — it can
// prove the roster CHANNEL carries "electronics" and "salvage". None of that can see:
//   1. THAT THE AUTHORED ROLE LANDS IN CREW WATCH AT ALL. `overview-view.js:916` paints
//      `e.role` into `.ov-crewrole`; a role that never reaches the element is a person the player
//      cannot tell from the one beside her, which is the whole defect this package closes.
//   2. THAT THREE ROWS READ AS THREE PEOPLE IN THE REAL STYLESHEET, at 1600px, in the panel the
//      player actually watches their crew in.
//   3. ⚠️ THAT RELL STILL READS `general crew` BESIDE THEM — the deliberately-unauthored survivor
//      (MECHANICS §13.39.3). That is a DESIGN DECISION and this tool photographs it rather than
//      hiding it, so the owner can overrule it from a picture.
//
// ⚠️⚠️ ONE THING IS DRIVEN AND NOT PLAYED, AND IT IS SAID OUT LOUD — the `pod-bay-shot.mjs`
// precedent, verbatim in technique and in disclosure. Commissioning `term_moss` costs one
// `ControllerModule` and the wreck authors NONE (2 Parts ← 4 Scrap ← 8 Regolith, three benches
// deep, behind two doors, across the pressure frontier) — that chain is the OPENING OF THE GAME and
// tens of sim-hours of ordered work, not a five-minute acceptance run. So `--prep` writes a
// TEMPORARY DEFS OVERLAY in which `build.def commission_cost = 0` and nothing else changes, and the
// tool commissions through the ordinary `commission` wire command a player's own click sends.
//   · The SHIP, the GATE, the THAW LADDER, the SCREEN and both PEOPLE are the shipping ones.
//   · The repair is PLAYED (a direct order; the sim walks her there and spends the Seals).
//   · Both THAWS are played through the POD BAY's own typed `thaw N`.
//   · ⛔ NOTHING here writes a skill, a mask or a persona: the tool never touches sim state. The
//     two women's competence comes from `CryoSystem` and their sheets from `GameSession`'s
//     observer, exactly as they do in a real run.
//
// USAGE
//   1. node client/tools/sleeper-persona-shot.mjs --prep     # writes the temp defs, prints the host cmd
//   2. <the printed host command>                            # and, beside it: python3 client/serve.py 8395
//   3. node client/tools/sleeper-persona-shot.mjs --out docs/design/shots
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / pod-bay-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const HOST_PORT = +arg('host-port', '8394');
const CLIENT_PORT = +arg('client-port', '8395');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'sleeper-persona-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9375');
const REPO = resolve(new URL('../..', import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ───────────────────────────── --prep: the temp defs overlay, and nothing else
if (has('prep')) {
  const src = join(REPO, 'content', 'core', 'SimDefs');
  const dst = mkdtempSync(join(tmpdir(), 'sleeperpersona-defs-'));
  // A COMPLETE COPY, SUBDIRECTORIES INCLUDED — `Sim.Dsl/RulesLoader.cs` reads
  // `<defsDir>/rules/*.moss`, and an overlay that skipped them would boot the acceptance host with
  // NO designer rules while this header claimed the only change was the commissioning price. That
  // happened once to pod-bay-shot.mjs; the copy is verified file-for-file below.
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
  const after = before.replace(/^commission_cost\s*=\s*\d+/m, 'commission_cost       = 0');
  if (after === before) { console.error('FAIL: commission_cost not found in build.def'); process.exit(2); }
  writeFileSync(bd, after);
  log('wrote a defs overlay with commission_cost = 0 (and NOTHING else changed):\n  ' + dst);
  log('\nstart the two halves with:');
  log(`  ~/.dotnet/dotnet run --project hosts/web -- --port ${HOST_PORT} --ship wreck --data ${dst}`);
  log(`  python3 client/serve.py ${CLIENT_PORT}`);
  log(`\nthen: node client/tools/sleeper-persona-shot.mjs --out docs/design/shots`);
  process.exit(0);
}

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
if (!latest.get('devices')?.cells?.length) { console.error('FAIL: no devices channel on the wire'); process.exit(2); }

const MOSS_XY = [1, 3];   // term_moss, from the ship's own authoring (AuthoredShips.cs:2059)
const mossCond = () => {
  const cells = latest.get('devices')?.cells || [];
  const row = cells.find((c) => c[0] === MOSS_XY[0] && c[1] === MOSS_XY[1] && c[2] === 0);
  return row ? row[4] : -1;   // [x,y,deck,kind,COND,oper,open]
};
const crewRows = () => (latest.get('roster')?.crew || []);
const seals = () => (latest.get('ledger')?.matter || []).find((m) => m[0] === 'Seals')?.[1] ?? 0;

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'sleeper-persona-shot-'));
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
async function prompt(line) {
  await type(line); await key('Enter'); await sleep(1400);
  return json(`[...document.querySelectorAll('.moss-cline')].map((e)=>[e.className,e.textContent])`) || [];
}
const errLines = (t) => t.filter(([c]) => /\berr\b/.test(c)).map(([, s]) => s);
const bayRows = () => json(
  `[...document.querySelectorAll('.moss-podrow')].map((e)=>({`
  + `pod:e.dataset.pod, num:e.querySelector('.c-podnum')?.textContent?.trim(),`
  + `who:e.querySelector('.c-occupant')?.textContent?.trim(),`
  + `state:e.querySelector('.c-podstate')?.textContent?.trim(),`
  + `why:e.querySelector('.c-podwhy')?.textContent?.trim(),`
  + `thaw:!!e.querySelector('.moss-thaw')}))`);
/** ⭐ THE PANEL THE PLAYER WATCHES THEIR CREW IN, read as PIXELS off the elements themselves. */
const watchRows = () => json(
  `[...document.querySelectorAll('.ov-crewlist > *')].map((e)=>({`
  + `name:e.querySelector('.ov-crewname')?.textContent?.trim(),`
  + `role:e.querySelector('.ov-crewrole')?.textContent?.trim()}))`);
const openMoss = async () => {
  for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(300); }
  const tab = await centre('[data-ov-tab="moss"]');
  if (tab) { await clickAt(tab.x, tab.y); await sleep(2200); }
  const box = await centre('.moss-input');
  if (box) await clickAt(box.x, box.y);
  await sleep(400);
};

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
// THE ONBOARDING CARD, DISMISSED AND VERIFIED GONE (shared helper, 2026-08-03). The one-shot
// this replaces could SILENTLY SKIP a card that had not painted yet, and every click below
// then landed on a full-screen modal instead of the ship.
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ───────────────────────────── STEP 1 — the ship before anybody is woken
log('\nSTEP 1 — one soul aboard, and she is the procedural default');
const boot = await watchRows() || [];
log('  CREW WATCH:', JSON.stringify(boot));
check(boot.length === 1, 'CREW WATCH shows exactly one soul at boot (' + boot.length + ')');
check(/general crew/i.test(boot[0]?.role || ''),
  '…and her role is the PROCEDURAL default — Rell is deliberately unauthored (§13.39.3)');
await png('01-one-soul.png');

// ───────────────────────────── STEP 2 — repair term_moss with a DIRECT ORDER (played)
log('\nSTEP 2 — order the repair of term_moss directly (right-click ▸ Prioritise, M2-10)');
const spd = await centre('[data-ov-speed-up]');
for (let i = 0; i < 2; i++) { if (spd) { await clickAt(spd.x, spd.y); await sleep(250); } }   // 20x
const cid = crewRows()[0]?.cid;
check(!!cid, 'the roster names the one soul aboard (cid ' + cid + ')');
// The ORDER is sent as its own wire message — exactly what the Room Zoom's right-click ▸ Prioritise
// emits (`roomzoom-view.js:1436`); CDP's synthetic right-click does not raise `contextmenu` in
// headless Chrome, and reproducing the gesture would mean a second copy of the zoom's canvas→tile
// projection. The tool sends the ORDER; the SIM plays the walk, the job, the consumable, the repair.
ws.send(JSON.stringify({ cmd: 'prioritise', cid, x: MOSS_XY[0], y: MOSS_XY[1], deck: 0 }));
await sleep(600);
log('  term_moss cond at boot:', mossCond(), '· Seals aboard:', seals());
let lit = false;
for (let i = 0; i < 1600 && !lit; i++) {
  await sleep(250);
  if (mossCond() >= 52) lit = true;            // 0.20 maint ⇒ 51/255
  if (i % 80 === 79) log('    …', ((i + 1) / 4) | 0, 's, term_moss cond =', mossCond(), '· Seals', seals());
}
check(lit, 'ONE ORDER put term_moss above its `maintain` floor (cond ' + mossCond() + '/255)');

// ───────────────────────────── STEP 3 — commission (DRIVEN at the wire; see the header)
log('\nSTEP 3 — commission term_moss (DRIVEN: the ordinary `commission` wire command, price 0)');
ws.send(JSON.stringify({ cmd: 'commission', x: MOSS_XY[0], y: MOSS_XY[1], deck: 0 }));
await sleep(2500);

// ───────────────────────────── STEP 4+5 — thaw TWO capsules, one after the other
const woken = [];
for (const pass of [1, 2]) {
  log(`\nSTEP ${3 + pass} — thaw capsule ${pass} through the POD BAY's own typed verb`);
  await openMoss();
  await prompt('pods');
  let rows = (await bayRows()) || [];
  let ready = rows.find((r) => r.thaw);
  for (let i = 0; i < 60 && !ready; i++) {          // wait for the pawn to release the Seals
    await sleep(2000);
    await prompt('pods');
    rows = (await bayRows()) || [];
    ready = rows.find((r) => r.thaw);
  }
  check(!!ready, 'a capsule is offered ([THAW] on ' + (ready ? ready.who : 'nobody') + ')');
  if (!ready) break;
  log('  offered:', ready.who, '·', ready.why);
  await prompt('thaw ' + ready.num);
  const want = crewRows().length + 1;
  let arrived = false;
  for (let i = 0; i < 300 && !arrived; i++) { await sleep(1000); arrived = crewRows().length >= want; }
  check(arrived, ready.who + ' stepped out of her capsule (' + crewRows().length + ' souls aboard)');
  woken.push(ready.who);
}

// ───────────────────────────── STEP 6 — CREW WATCH: two people who read as two people
log('\nSTEP 6 — CREW WATCH, the panel the player actually watches their crew in');
for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(300); }
await sleep(2500);
const watch = (await watchRows()) || [];
for (const r of watch) log(`    ${String(r.name).padEnd(12)} ${r.role}`);
check(watch.length === 3, 'three rows are drawn (' + watch.length + ')');
const sleepers = watch.filter((r) => !/general crew/i.test(r.role || ''));
check(sleepers.length === 2, 'TWO of them carry an AUTHORED role (' + sleepers.length + ')');
check(sleepers.length === 2 && sleepers[0].role !== sleepers[1].role,
  '⭐ and the two authored roles DISAGREE — two people, not one person twice: ' +
  JSON.stringify(sleepers.map((r) => r.role)));
check(watch.some((r) => /general crew/i.test(r.role || '')),
  '⚠️ Rell still reads `general crew` beside them — photographed, not hidden (§13.39.3)');

// The sim's own truth, off the independent socket, so a role painted from a stale cache is caught.
const wire = crewRows().map((c) => [c.name, c.role]);
log('  roster channel:', JSON.stringify(wire));
check(wire.filter(([, role]) => role && role !== 'general crew').length === 2,
  'the roster CHANNEL carries the same two authored roles the panel drew');
await png('02-crew-watch.png');

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
