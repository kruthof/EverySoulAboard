#!/usr/bin/env node
// "WHEN MOSS REFUSES ME, THE REFUSAL NAMES MY NEXT STEP" — driven in real Chrome against the
// running game (MECHANICS §13.47). Harness shape lifted verbatim from `commission-shot.mjs`
// (same CDP scaffolding, same independent-socket instrument, same trusted keystrokes).
//
// WHY IT EXISTS AT ALL, given that `MossGateTests` and `WebCommissionTests` already pin both
// sentences: the owner's report was not "the string is wrong", it was *"there is still no way to
// defreeze others"* — a LOOP, walked at the keyboard. The unit tests can see a composed string;
// only this can see the loop the player actually walked:
//
//     thaw  →  "TYPE PODS"  →  pods  →  <the ship gate's refusal>  →  ???
//
// and whether the sentence at the end of it names a next step. It also witnesses that the text
// SURVIVES the wire and the reducer and lands in the DOM readable — the join no suite spans.
//
// ⚠️ IT TYPES. OD-P made the MOSS console a terminal: every printable character types into the
// prompt and ENTER submits, so each command is dispatched as TRUSTED key events over CDP.
//
// ⛔ NON-VACUITY, AND IT WAS RUN (2026-08-04). With `MossGate.OfflineRefusal` reverted to the
// pre-fix constant (`…REPAIR ONE TO REACH THE DOORS`) and the host rebuilt, STEP 2 reports
// **5 FAILED** — the name, the deck, the tile, the PODS tail and the not-DOORS check — while
// STEP 1 stays green, and so do the two negative checks that are honestly vacuous under it
// ("answered at all", "not TERM_NAV"). That split is the right one: step 1 is the CLIENT's nudge
// and step 2 is the HOST's sentence, and a rig that reddened both would be measuring the harness.
//
// USAGE
//   1. ./play.sh --host-port 8420 --client-port 8421 --no-open
//   2. node client/tools/gate-sentences-shot.mjs --out docs/design/shots \
//        [--host-port 8420] [--client-port 8421] [--skip-repair]
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot / moss-gate-shot / commission-shot rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8420');
const CLIENT_PORT = +arg('client-port', '8421');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'gate-sentences-');
const SKIP_REPAIR = process.argv.includes('--skip-repair');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9371');
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
const userDir = mkdtempSync(join(tmpdir(), 'gate-sentences-shot-'));
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
// ⚠️ THE TRANSCRIPT ACCUMULATES — `prompt` returns ONLY the lines this command added, or a
// "line N is NOT present" check reddens on a line the PREVIOUS command legitimately printed.
let seenLines = 0;
const allLines = () => json(`[...document.querySelectorAll('.moss-cline')].map((e)=>[e.className,e.textContent])`);
async function prompt(line) {
  await type(line);
  await key('Enter');
  await sleep(1200);
  const all = (await allLines()) || [];
  const fresh = all.length >= seenLines ? all.slice(seenLines) : all;
  seenLines = all.length;
  return fresh;
}
const errLines = (t) => t.filter(([c]) => /\berr\b/.test(c)).map(([, s]) => s);
const outLines = (t) => t.filter(([c]) => /\bout\b/.test(c)).map(([, s]) => s);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

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
seenLines = ((await allLines()) || []).length;   // the boot banner is not this tool's subject

// ── STEP 1: the loop's FIRST leg — `thaw` sends the player to `pods`. Not this lane's code; it is
//    the reason step 2's ask is `pods` and not something the tool chose.
log('\nSTEP 1 — `thaw` on the boot ship points at the POD BAY');
const t0 = await prompt('thaw');
const l0 = [...errLines(t0), ...outLines(t0)];
log('  transcript:', JSON.stringify(l0.slice(-3)));
check(l0.some((s) => /PODS/.test(s)),
  'the thaw verb names PODS — the nudge that makes `pods` the next thing a player types');

// ── STEP 2: ⭐⭐ THE PACKAGE. The ask is the CRYO BAY and the refusal must answer THAT — with a
//    machine, a place, and the right noun.
log('\nSTEP 2 — `pods` on the DARK ship: the refusal names the terminal, the place, and the PODS');
const t1 = await prompt('pods');
const e1 = errLines(t1);
log('  transcript(err):', JSON.stringify(e1.slice(-2)));
const offline = e1.find((s) => /MOSS IS OFFLINE/.test(s)) || '';
check(!!offline, 'the ship gate answered at all (a refusal may never be silent)');
check(/TERM_MOSS/.test(offline),
  'the refusal NAMES the terminal to repair — "REPAIR ONE" on a two-terminal ship is a search');
check(/DECK 0/.test(offline), '…and the DECK it is on');
check(/\b1,3\b/.test(offline), '…and the TILE, so it can be found on the Overview');
check(/TO REACH THE PODS/.test(offline),
  '⭐ THE OWNER-REPORTED HALF: the tail answers the verb that was refused');
check(!/DOORS/.test(offline),
  '⛔ …and NOT the DOORS, which is what a player who just typed `pods` used to be told about');
check(!/TERM_NAV/.test(offline),
  'and not the other terminal — term_nav is unpowered, on the dead deck, past the frontier');
await png('02-pods-refusal-names-the-terminal.png');

// ── STEP 3: repair term_moss for real, through the WORK tab (OD-H boots every work type OFF).
if (SKIP_REPAIR) { log('\nSTEP 3/4 SKIPPED (--skip-repair)'); }
else {
  log('\nSTEP 3 — turn REPAIR on and let her service term_moss');
  for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(500); }
  await sleep(1200);
  const workTab = await centre('[data-ov-tab="work"]');
  if (!workTab) { check(false, 'the Overview tab bar is not reachable — MOSS did not release the body'); }
  else { await clickAt(workTab.x, workTab.y); await sleep(1500); }
  const wcell = await centre('.ov-workcell[data-ov-work-type="0"]');   // WORK_COLUMNS[0] === REPAIR
  if (!wcell) { check(false, 'the WORK tab exposes no REPAIR cell to click'); }
  else { await clickAt(wcell.x, wcell.y); await sleep(1200); }

  // ⭐ THE INSTRUMENT IS THE `devices` CHANNEL ON AN INDEPENDENT SOCKET, never the page.
  const MOSS_XY = [1, 3];   // AuthoredShips.cs:2119 — the cryo bay's west wall, centre row
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

  // ── STEP 4: ⭐⭐ THE SECOND SENTENCE. The ship is live and the ask is now the PRICE — and the
  //    refusal has to say where the thing it is short of comes from.
  log('\nSTEP 4 — `commission` on the live console names the price AND where a module is made');
  const mossTab2 = await centre('[data-ov-tab="moss"]');
  if (mossTab2) { await clickAt(mossTab2.x, mossTab2.y); await sleep(2000); }
  const box2 = await centre('.moss-input');
  if (box2) await clickAt(box2.x, box2.y);
  await sleep(400);
  const t2 = await prompt('commission');
  const e2 = errLines(t2);
  log('  transcript(err):', JSON.stringify(e2.slice(-2)));
  const priced = e2.find((s) => /COMMISSIONING NEEDS/.test(s)) || '';
  check(!!priced, 'the price refusal reached the player');
  check(/SHIP HAS \d/.test(priced), '…with the NUMBER (the M3-17 half, unchanged)');
  check(/MACHINE SHOP/.test(priced),
    '⭐ …and it now names the MACHINE that makes the module — recipes.def:22, derived');
  check(/2 PARTS/.test(priced), '…and what that machine eats, so the detour can be priced');
  check(!/MOSS IS OFFLINE/.test(priced), 'the tier is still right: a live console is not "offline"');
  await png('04-commission-refusal-says-where.png');
}

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
