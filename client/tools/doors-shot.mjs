#!/usr/bin/env node
// "TYPING `doors` LISTS EVERY DOOR THE SHIP KNOWS, AND THE NAME `open` NEEDS IS LEARNABLE IN THE
// GAME" — driven in real Chrome against the running game (MECHANICS §13.48). Harness shape lifted
// verbatim from `gate-sentences-shot.mjs` (same CDP scaffolding, same independent-socket
// instrument, same trusted keystrokes, same `rig-lib.mjs` onboarding dismissal).
//
// WHY IT EXISTS, given that `DoorsVerbTests` already pins the listing at the wire: the STALL this
// package closes was a LOOP walked at the keyboard, not a wrong string. Driven 2026-08-03 on the
// shipping game: `open` → UNKNOWN SYSTEM ''; `open door` → NO SUCH DEVICE 'DOOR'; `open
// door_d0_s1` → QUEUED OPEN(DOOR_D0_S1). Every piece worked and the player had no way in. Only a
// rig can close that loop end to end: TYPE the verb, READ an id off the DOM the way a player reads
// it, TYPE IT BACK, and watch the door move on the SIM'S OWN SOCKET.
//
// ⚠️ IT TYPES. OD-P made the MOSS console a terminal: every printable character types into the
// prompt and ENTER submits, so each command is dispatched as TRUSTED key events over CDP.
//
// USAGE
//   1. ./play.sh --host-port 8430 --client-port 8431 --no-open
//   2. node client/tools/doors-shot.mjs --out docs/design/shots \
//        [--host-port 8430] [--client-port 8431] [--skip-repair]
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot / commission-shot / gate-sentences rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8430');
const CLIENT_PORT = +arg('client-port', '8431');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'doors-');
const SKIP_REPAIR = process.argv.includes('--skip-repair');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9373');
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
/** `devices` row: [x, y, deck, kind, cond, oper, open]. */
const deviceAt = (x, y, z) => (latest.get('devices')?.cells || [])
  .find((c) => c[0] === x && c[1] === y && c[2] === z) || null;

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'doors-shot-'));
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
// ⚠️ THE TRANSCRIPT ACCUMULATES, and `prompt` must return ONLY the lines THIS command added.
//
// ⛔ THE OBVIOUS IMPLEMENTATION IS THE ONE THIS TOOL FOUND WRONG — MEASURED, NOT REASONED.
// `gate-sentences-shot.mjs` diffs the element COUNT before and after (`all.slice(seenLines)`),
// which is exact for its one- and two-line answers. A `doors` reply is SEVENTEEN lines, and on the
// first run against the live game that diff returned **2 of them** — so five checks reported on a
// listing the tool had simply failed to read, while the listing on screen (and in the screenshot)
// was complete. The count is not a stable cursor across a screen the player left and came back to.
// The ECHO is: the model writes `> <line>` at stream 0 (`submitCommand`) and the screen renders it
// with `class="moss-cline echo"`, so the answer to a command is unambiguously everything after the
// LAST echo carrying that command's own text. Counting is the fallback, not the rule.
let seenLines = 0;
const allLines = () => json(`[...document.querySelectorAll('.moss-cline')].map((e)=>[e.className,e.textContent])`);
async function prompt(line) {
  await type(line);
  await key('Enter');
  await sleep(1400);
  const all = (await allLines()) || [];
  let at = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (/\becho\b/.test(all[i][0]) && all[i][1] === '> ' + line) { at = i; break; }
  }
  const fresh = at >= 0 ? all.slice(at + 1)
    : (all.length >= seenLines ? all.slice(seenLines) : all);
  seenLines = all.length;
  return fresh;
}
const errLines = (t) => t.filter(([c]) => /\berr\b/.test(c)).map(([, s]) => s);
const outLines = (t) => t.filter(([c]) => /\bout\b/.test(c)).map(([, s]) => s);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) { console.error('FAIL: no MOSS tab on the Overview'); failures += 1; }
else { await clickAt(mossTab.x, mossTab.y); await sleep(2500); }

// ── STEP 1: the two SIGNPOSTS, before a single character is typed. A verb only HELP knows about
//    is one the player has to already know to find (M3-17's own sentence).
log('\nSTEP 1 — the LEDGER footer names DOORS, and so does HELP');
const footer = (await json(`[...document.querySelectorAll('.moss-hint,.moss-foot,.moss-footer')].map((e)=>e.textContent).join(' | ')`)) || '';
log('  footer:', JSON.stringify(footer.slice(0, 200)));
check(/DOORS/.test(footer), 'the permanent LEDGER footer names DOORS (no scrolling, no HELP needed)');
const promptBox = await centre('.moss-input');
if (promptBox) await clickAt(promptBox.x, promptBox.y);
await sleep(400);
seenLines = ((await allLines()) || []).length;   // the boot banner is not this tool's subject
const help = outLines(await prompt('help'));
check(help.some((s) => /^DOORS\b/.test(s)), 'HELP lists DOORS: ' + JSON.stringify(help.find((s) => /^DOORS/.test(s)) || help.slice(-2)));

// ── STEP 2: the boot ship is DARK, and the refusal answers the noun that was asked.
//    ⭐ THIS IS THE FIRST SHIPPING-SURFACE CALLER OF `MossGate.Ask.Doors`, which §13.47 filed as
//    unreachable in the client.
log('\nSTEP 2 — `doors` on the DARK ship: the refusal names the terminal, the place, and the DOORS');
const t1 = await prompt('doors');
const e1 = errLines(t1);
log('  transcript(err):', JSON.stringify(e1.slice(-2)));
const offline = e1.find((s) => /MOSS IS OFFLINE/.test(s)) || '';
check(!!offline, 'the ship gate answered at all (a refusal may never be silent)');
check(/TERM_MOSS/.test(offline), 'the refusal NAMES the terminal to repair');
check(/DECK 0/.test(offline) && /\b1,3\b/.test(offline), '…and the DECK and TILE it stands on');
check(/TO REACH THE DOORS/.test(offline), '⭐ the tail answers the verb that was refused');
check(outLines(t1).length === 0, 'a dark computer must not also enumerate the ship');
await png('01-dark-ship-refusal.png');

// ── STEP 3: repair term_moss for real, through the WORK tab (OD-H boots every work type OFF).
let listing = [];
if (SKIP_REPAIR) { log('\nSTEP 3/4/5 SKIPPED (--skip-repair)'); }
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

  const MOSS_XY = [1, 3];   // AuthoredShips.cs — the cryo bay's west wall, centre row
  const mossCond = () => { const r = deviceAt(MOSS_XY[0], MOSS_XY[1], 0); return r ? r[4] : -1; };
  const spd = await centre('[data-ov-speed-up]');
  for (let i = 0; i < 4; i++) { if (spd) { await clickAt(spd.x, spd.y); await sleep(200); } }
  log('  term_moss cond at boot:', mossCond());
  let lit = false;
  for (let i = 0; i < 300 && !lit; i++) {
    await sleep(1000);
    if (mossCond() >= 52) lit = true;               // Terminal `maintain` 0.20 × 255
    if (i % 30 === 29) log('    …', i + 1, 's, term_moss cond =', mossCond());
  }
  check(lit, 'the crew SERVICED term_moss above its `maintain` floor (cond ' + mossCond() + '/255)');

  // ── STEP 4: ⭐⭐ THE PACKAGE. Type `doors` on the live console and read the ship's own census.
  log('\nSTEP 4 — `doors` on the LIVE console lists every door aboard');
  const mossTab2 = await centre('[data-ov-tab="moss"]');
  if (mossTab2) { await clickAt(mossTab2.x, mossTab2.y); await sleep(2000); }
  const box2 = await centre('.moss-input');
  if (box2) await clickAt(box2.x, box2.y);
  await sleep(400);
  const t2 = await prompt('doors');
  listing = outLines(t2);
  log('  listing (' + listing.length + ' lines):');
  for (const l of listing) log('    ' + l);
  check(errLines(t2).length === 0, 'a REPAIRED console is not refused (the tier is right)');
  const header = listing.find((s) => /^DOORS —/.test(s)) || '';
  check(/^DOORS — \d+ ABOARD · \d+ OPEN · \d+ SHUT$/.test(header),
    'the census header states the count: ' + JSON.stringify(header));
  const rows = listing.filter((s) => / · DECK \d+ AT \d+,\d+ · (OPEN|SHUT)/.test(s));
  check(rows.length === +(header.match(/— (\d+) ABOARD/)?.[1] ?? -1),
    'every door the header counted has a row (' + rows.length + ' rows)');

  // ⭐ READABLE, MEASURED RATHER THAN ASSUMED: the console pane is `max-height:22vh` and only
  // gained scroll-to-tail on 08-04, so a 17-line block is exactly the case that was hidden before.
  const pane = await json(`(()=>{const e=document.querySelector('.moss-console');if(!e)return null;`
    + `return {ch:e.clientHeight,sh:e.scrollHeight,st:e.scrollTop};})()`);
  log('  console pane metrics:', JSON.stringify(pane));
  check(!!pane && pane.st + pane.ch >= pane.sh - 24,
    'the pane FOLLOWED its newest line, so the end of a 17-line listing is on screen');
  await png('02-the-listing.png');

  // ── STEP 5: ⭐⭐⭐ THE LOOP CLOSED. Read an id and a place off the DOM the way a player reads
  //    them, type the id back at `open`, and watch the DOOR MOVE on the SIM'S OWN socket.
  log('\nSTEP 5 — read a SHUT door off the listing, type it back at `open`, watch it move');
  const shut = rows.find((s) => / · SHUT$/.test(s)) || '';
  const m = shut.match(/^(\S+) · DECK (\d+) AT (\d+),(\d+) · SHUT$/) || [];
  const [, rid, rz, rx, ry] = m;
  check(!!rid, 'the listing offered a SHUT door to open: ' + JSON.stringify(shut));
  if (rid) {
    const before = deviceAt(+rx, +ry, +rz);
    log('  chose', rid, 'at deck', rz, rx + ',' + ry, '— sim says open =', before ? before[6] : '(no row)');
    check(!!before && before[6] === 0,
      'PRECONDITION: the SIM agrees that door is shut, so the listing was telling the truth');
    // ⛔ VERBATIM — the id EXACTLY as the listing printed it, never case-folded. Folding here
    // would mean the rig never types the string a player reads off the screen, which is the one
    // thing this step exists to drive.
    const t3 = await prompt('open ' + rid);
    log('  transcript:', JSON.stringify([...outLines(t3), ...errLines(t3)].slice(-2)));
    await sleep(2500);
    const after = deviceAt(+rx, +ry, +rz);
    check(!!after && after[6] === 1,
      '⭐⭐ THE DOOR THE LISTING NAMED OPENED WHEN ITS NAME WAS TYPED BACK — sim open = '
      + (after ? after[6] : '(no row)'));
    const t4 = await prompt('doors');
    check(outLines(t4).some((s) => new RegExp('^' + rid + ' · .* · OPEN$').test(s)),
      '…and the directory now says OPEN for that row — the state word is LIVE');
    await png('03-opened-by-the-name-the-listing-gave.png');
  }
}

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
