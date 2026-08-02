#!/usr/bin/env node
// M3-17 — "THE COMMISSIONING VERB", driven in real Chrome against the running game.
// This is the package's acceptance script, automated so a reviewer can re-run it instead of
// re-typing it. Shape and scaffolding lifted from `moss-gate-shot.mjs` (same CDP harness, same
// independent-socket instrument, same trusted keystrokes).
//
// WHAT ONLY THIS TOOL CAN SEE. `WebCommissionTests` drives the wire op straight into
// `GameSession`; `moss-model.test.js` drives the reducer. NEITHER can see the JOIN — keystroke →
// `parseCommand` → `wireForEffect` → socket → `HandleMoss` → `MossExec` → `reduceMossEvent` → DOM.
// That join is the entire content of this package: the sim could always commission, and what was
// missing for a whole milestone was a SENDER. A verb can be present and inert (three prior owner
// reports); a green suite on both sides of a seam says nothing about the seam.
//   1. THAT THE VERB IS DISCOVERABLE — `HELP` names it, in the real stylesheet.
//   2. THAT THE DARK SHIP'S REFUSAL REACHES THE PLAYER as a readable line (the ship gate).
//   3. THAT THE TIER IS RIGHT — after a REAL repair, the same line stops saying OFFLINE and starts
//      saying what the ship is short of, WITH THE NUMBER. A `commission` behind the commissioned
//      tier would still say OFFLINE/NOT COMMISSIONED here, and the arc would still dead-end.
//
// ⛔ WHAT IT DELIBERATELY DOES NOT WITNESS, STATED RATHER THAN IMPLIED: the ACCEPTED branch. It
// needs one `ControllerModule`, and the only honest way to get one is to play the whole
// Regolith → Scrap → Parts → ControllerModule chain (the M3 demo did exactly that, over many steps
// and several sim-hours). Cheating it with a `commission_cost = 0` defs overlay is the very thing
// this package exists to delete. The accepted branch is driven instead at the wire
// (`WebCommissionTests.TypingCommission_CommissionsTheConsole_AndTheseTwoUnlock`, which ends by
// asking the ship for the POD BAY and getting twelve rows) and at the reducer
// (`moss-model.test.js`). ⇒ THE FULL-ARC BROWSER BEAT IS STILL OWED, and it is T13's own
// unmodified-game run, not this tool's.
//
// ⚠️ IT TYPES. OD-P made the MOSS console a terminal: there are no letter hotkeys, every printable
// character types into the prompt, and ENTER submits. So every command below is dispatched as
// TRUSTED key events over CDP, exactly as a player produces them.
//
// USAGE
//   1. ./play.sh --host-port 8390 --client-port 8391 --no-open
//   2. node client/tools/commission-shot.mjs --out docs/design/shots [--host-port 8390] [--client-port 8391]
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / moss-gate-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'commission-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9353');
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
if (!latest.get('devices')?.cells?.length) { console.error('FAIL: no devices channel on the wire'); process.exit(2); }

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'commission-shot-'));
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
// ⚠️ THE TRANSCRIPT ACCUMULATES, AND A CHECK THAT FORGETS THAT IS A FALSE WITNESS IN BOTH
// DIRECTIONS. Reading every `.moss-cline` after each command means step N's assertions also see
// step N-1's sentences: a "this line is NOT present" check reddens on a line the previous command
// legitimately printed (it did, first run), and a "this line IS present" check can pass on a stale
// one. So `prompt` returns ONLY the lines this command added.
let seenLines = 0;
const allLines = () => json(`[...document.querySelectorAll('.moss-cline')].map((e)=>[e.className,e.textContent])`);
/** Type one command at the MOSS prompt and return the lines IT added. */
async function prompt(line) {
  await type(line);
  await key('Enter');
  await sleep(1200);
  const all = (await allLines()) || [];
  // If the ring ever rotated (CONSOLE_CAP), a slice would silently skip lines — fall back to the
  // whole buffer and let the check be pessimistic rather than wrong.
  const fresh = all.length >= seenLines ? all.slice(seenLines) : all;
  seenLines = all.length;
  return fresh;
}
const errLines = (t) => t.filter(([c]) => /\berr\b/.test(c)).map(([, s]) => s);
const outLines = (t) => t.filter(([c]) => /\bout\b/.test(c)).map(([, s]) => s);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// dismiss the onboarding card if it mounted
for (let i = 0; i < 15; i++) {
  const onb = await centre('[data-onb-begin]');
  if (onb) { await clickAt(onb.x, onb.y); await sleep(1500); break; }
  await sleep(1000);
}

const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) { console.error('FAIL: no MOSS tab on the Overview'); failures += 1; }
else { await clickAt(mossTab.x, mossTab.y); await sleep(2500); }
const promptBox = await centre('.moss-input');
if (promptBox) await clickAt(promptBox.x, promptBox.y);
await sleep(400);

// ── STEP 1: the verb is DISCOVERABLE. A command nobody can find is a command nobody sends — which
//    is, precisely, how this blocker survived a whole milestone.
log('\nSTEP 1 — HELP names COMMISSION');
seenLines = ((await allLines()) || []).length;   // the boot banner is not this package's output
const tHelp = await prompt('help');
const help = outLines(tHelp);
check(help.some((s) => /^COMMISSION\b/.test(s.trim())),
  'HELP lists COMMISSION beside the other console verbs');
log('  help line:', JSON.stringify(help.filter((s) => /COMMISSION/.test(s))));
await png('01-help-names-commission.png');

// ── STEP 2: the DARK ship refuses, in words, with the SHIP's own sentence.
log('\nSTEP 2 — on the boot ship the console is DARK and `commission` says so');
const t1 = await prompt('commission');
const e1 = errLines(t1);
log('  transcript(err):', JSON.stringify(e1.slice(-2)));
check(e1.some((s) => /MOSS IS OFFLINE/.test(s)),
  'the refusal is the SHIP sentence — repair a terminal, do not go and craft a module');
check(t1.some(([c]) => /echo/.test(c)), 'the line the player typed is echoed — it is a terminal');
check(!(await evaluate(`/UNKNOWN COMMAND/.test(document.querySelector('.moss-console')?.textContent||'')`)),
  'the client did not answer UNKNOWN COMMAND — the verb really is in the vocabulary');
await png('02-dark-refuses.png');

// ── STEP 3: repair term_moss for real, through the WORK tab (OD-H boots every work type OFF).
log('\nSTEP 3 — turn REPAIR on and let her service term_moss');
for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(500); }
await sleep(1200);
const workTab = await centre('[data-ov-tab="work"]');
if (!workTab) { check(false, 'the Overview tab bar is not reachable — MOSS did not release the body'); }
else { await clickAt(workTab.x, workTab.y); await sleep(1500); }
const cellSel = '.ov-workcell[data-ov-work-type="0"]';   // WORK_COLUMNS[0] === REPAIR
const wcell = await centre(cellSel);
if (!wcell) { check(false, 'the WORK tab exposes no REPAIR cell to click (re-point `cellSel`)'); }
else { await clickAt(wcell.x, wcell.y); await sleep(1200); }

// ⭐ THE INSTRUMENT IS THE `devices` CHANNEL ON AN INDEPENDENT SOCKET, never the page: `cond` is
// `Device.Condition` quantised to a byte, so `term_moss` crossing `maintain` (0.20 ⇒ 51/255) is
// visible without asking the console whether the console works.
const MOSS_XY = [1, 3];   // AuthoredShips.cs:2059 — the cryo bay's west wall, centre row
const mossCond = () => {
  const cells = latest.get('devices')?.cells || [];
  const row = cells.find((c) => c[0] === MOSS_XY[0] && c[1] === MOSS_XY[1] && c[2] === 0);
  return row ? row[4] : -1;   // [x,y,deck,kind,COND,oper,open]
};
const spd = await centre('[data-ov-speed-up]');
for (let i = 0; i < 4; i++) { if (spd) { await clickAt(spd.x, spd.y); await sleep(200); } }
log('  term_moss cond at boot:', mossCond());
let lit = false;
for (let i = 0; i < 240 && !lit; i++) {
  await sleep(1000);
  if (mossCond() >= 52) lit = true;
  if (i % 30 === 29) log('    …', i + 1, 's, term_moss cond =', mossCond());
}
check(lit, 'the crew SERVICED term_moss above its `maintain` floor (cond ' + mossCond() + '/255)');

// ── STEP 4: ⭐ THE TIER. The same line, on the same console, now names what the SHIP is short of —
//    with the NUMBER. This is the check that would fail if `commission` sat behind the commissioned
//    tier: it would still be refusing, and the arc would still dead-end here.
log('\nSTEP 4 — the console is live: `commission` names the price and the stock, not the console');
const mossTab2 = await centre('[data-ov-tab="moss"]');
if (mossTab2) { await clickAt(mossTab2.x, mossTab2.y); await sleep(2000); }
const box2 = await centre('.moss-input');
if (box2) await clickAt(box2.x, box2.y);
await sleep(400);
const t2 = await prompt('commission');
const e2 = errLines(t2);
log('  transcript(err):', JSON.stringify(e2.slice(-2)));
check(e2.some((s) => /COMMISSIONING NEEDS/.test(s) && /CONTROLLER MODULE/.test(s)),
  'the refusal names the ACT and the ITEM');
check(e2.some((s) => /SHIP HAS \d/.test(s)),
  '…and carries the NUMBER — "SHIP HAS 0" is what sends the player to the benches');
check(!e2.some((s) => /MOSS IS OFFLINE/.test(s)),
  'the verb is at the REPAIRED tier: a live console no longer answers with the ship sentence');
await png('04-live-names-the-price.png');

// ── STEP 5: the split is still intact around it — a program on the same console refuses in OTHER
//    words. Two tiers, two sentences, one sitting.
log('\nSTEP 5 — the split stands: a PROGRAM on the same console still refuses, differently');
const t3 = await prompt('prog term_moss');
const e3 = errLines(t3);
check(e3.some((s) => /NOT COMMISSIONED/.test(s) && /CONTROLLER MODULE/.test(s)),
  'the program refusal is M3-15\'s sentence, not this package\'s');
check(!e3.some((s) => /COMMISSIONING NEEDS/.test(s)),
  'and the two are not confusable — different leads, as the family test requires');
await png('05-split-intact.png');

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
log('⛔ NOT witnessed here and owed to T13: the ACCEPTED branch (see this file\'s header).');
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
