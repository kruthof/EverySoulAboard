#!/usr/bin/env node
// ⭐⭐ "THE MOSS FAULT LOG LISTS EACH FAULT ONCE" — driven in real Chrome against the running game,
// on the UNMODIFIED `--ship wreck`. This is the acceptance script for the fault-log double-print
// filed at the end of session E, automated so a reviewer can re-run it instead of re-typing it.
//
// WHAT ONLY THIS TOOL CAN SEE. `moss-model.test.js` drives the view-model against a hand-written
// fixture and `moss-screen.test.js` drives the DOM against a test double. Neither of them can see:
//   1. THAT THE SHIP'S OWN TWO CHANNELS OVERLAP THE WAY THE FIXTURE CLAIMS. The whole defect is
//      that `chron` (Chronicle.Render over the 200-entry HistorySystem ring) and `log`
//      (GameSession.BuildLog's newest 14 of THAT SAME ring) are one record in two costumes. A
//      fixture asserts that; only a real host proves it. This tool reads BOTH channels off an
//      INDEPENDENT socket and fails if they do not actually overlap — a non-vacuity check on the
//      whole run (the fixture this package replaced was disjoint, and that is exactly why the
//      shipped suite could not see the bug).
//   2. THAT THE ROWS THE PLAYER READS ARE UNIQUE. The check below is on real DOM text scraped out
//      of the shipping `.moss-faultlog` pane, after typing `log` at the real prompt.
//   3. THAT THE PANE IS NOT EMPTY INSTEAD. "Each fault once" is trivially satisfiable by showing
//      nothing; every ring entry the wire carries must be ON the screen.
//
// NOTHING IS MODIFIED — no defs overlay, no injected state, no client patch. The wreck browns out
// on its own within the first sim-hour, which is what fills the ring.
//
// USAGE (two terminals, or use ./play.sh and point --host-port/--client-port at it)
//   ~/.dotnet/dotnet run --project hosts/web -- --port 8371 --ship wreck
//   python3 client/serve.py 8372
//   node client/tools/faultlog-once-shot.mjs --host-port 8371 --client-port 8372 --out docs/design/shots
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / board-fault-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8371');
const CLIENT_PORT = +arg('client-port', '8372');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'faultlog-once-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9377');
const SETTLE_MS = +arg('settle', '45000');   // how long to let the wreck fill its history ring
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ───────────────────────────── 1. the ship's own two channels, on an INDEPENDENT socket
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
// Run the ship forward until the wreck's first machine failures and brownout episodes have written
// entries. The freeze, the wire sample and the checks all happen AFTER the browser has opened MOSS
// — see the note over `freezeAndSample`.
for (let i = 0; i < 6; i++) ws.send(JSON.stringify({ cmd: 'speed', delta: 1 }));
await sleep(SETTLE_MS);

const chronNow = async () => {
  latest.delete('chron');
  ws.send(JSON.stringify({ type: 'chron' }));
  for (let i = 0; i < 40 && !latest.get('chron'); i++) await sleep(250);
  return JSON.stringify(latest.get('chron')?.days || []);
};

/**
 * ⛔ FREEZE THE SHIP, AND PROVE THE FREEZE. Without it the run cannot compare the page against the
 * ship at all: `HistorySystem` appends entries AND rewrites a live brownout episode in place as its
 * edges accumulate, so a chronicle sampled here and the chronicle the page asks for a minute later
 * are two different records — the first draft of this tool reported four "missing" entries that
 * were simply younger than its own snapshot. `pause` is a TOGGLE, so the freeze is verified rather
 * than assumed: two chronicles three seconds apart must be byte-identical.
 */
async function freezeAndSample() {
  let frozen = '';
  for (let attempt = 0; attempt < 3 && !frozen; attempt++) {
    ws.send(JSON.stringify({ cmd: 'pause' }));
    await sleep(1500);
    const a = await chronNow();
    await sleep(3000);
    const b = await chronNow();
    if (a === b && a !== '[]') frozen = b; else log('  (pause toggled the wrong way — retrying)');
  }
  check(!!frozen, 'the ship is PAUSED and its history ring is frozen — the page and the wire can be compared');
  if (!frozen) { chrome.kill('SIGKILL'); process.exit(2); }
  await sleep(2500);
}

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'faultlog-once-shot-'));
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
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
/** ⚠️ A printable character carries NO virtual key code — board-fault-shot.mjs measured that `'.'`
 *  as VK_DELETE eats a character. With `text` alone the client still sees `e.key`. */
async function key(k) {
  if (k.length === 1) {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
    return;
  }
  const code = k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0;
  const base = { key: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: k === 'Enter' ? '\r' : undefined });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function type(line) { for (const ch of line) { await key(ch); await sleep(12); } }

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
// THE ONBOARDING CARD, DISMISSED AND VERIFIED GONE (shared helper, 2026-08-03). The one-shot
// this replaces could SILENTLY SKIP a card that had not painted yet, and every click below
// then landed on a full-screen modal instead of the ship.
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ───────────────────────────── 3. the FAULT LOG, typed at the real prompt
log('\nSTEP 1 — open MOSS and type `log`');
const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) { console.error('FAIL: no MOSS tab on the Overview'); chrome.kill('SIGKILL'); process.exit(3); }
await clickAt(mossTab.x, mossTab.y); await sleep(2500);

// ⛔⛔ THE ORDER HERE IS THE WHOLE RIG, AND GETTING IT WRONG HIDES HALF THE DEFECT — measured.
// `hud.renderLog` hands the live tail to the MOSS screen ONLY once that screen exists
// (`if (_moss) _moss.onLog(...)`), and the screen is constructed when the MOSS tab is first opened.
// A draft that paused the ship BEFORE opening the tab left the model's `log` permanently empty (a
// paused ship re-sends nothing — `Send` dedupes by payload), so the pre-fix control printed only
// the day-headline duplicate and none of the 14 tail duplicates. So: open the tab, WAIT FOR A LOG
// PAYLOAD TO CROSS THE WIRE (this socket sees the same broadcast the page does), and only then
// freeze.
const logPayload = () => JSON.stringify(latest.get('log')?.lines || []);
const beforeTab = logPayload();
let tailReached = false;
for (let i = 0; i < 60 && !tailReached; i++) { await sleep(500); tailReached = logPayload() !== beforeTab; }
check(tailReached,
  'a `log` payload crossed the wire AFTER the MOSS screen was constructed — the live tail is in the model, so the double-source is actually reachable in this run');

await freezeAndSample();

const wireLog = (latest.get('log')?.lines || []).map((l) => String(l));
const wireDays = latest.get('chron')?.days || [];
const wireLines = wireDays.flatMap((d) => (d.lines || []).map(String));
log('  wire: log tail =', wireLog.length, 'lines · chron =', wireDays.length, 'day(s),', wireLines.length, 'lines');
if (!wireLog.length || !wireLines.length) {
  console.error('FAIL: the ship has not written a history ring yet — raise --settle');
  chrome.kill('SIGKILL'); process.exit(2);
}
/** The ring entry a wire line is ABOUT, out of whichever costume it arrived in. */
const factOfWireLog = (s) => s.replace(/^D\d+\.\d+\s+/, '');
const factOfChron = (s) => s.replace(/^\[[A-Za-z]+\] /, '');
const tailFacts = wireLog.map(factOfWireLog);
const chronFacts = wireLines.map(factOfChron);
const overlap = tailFacts.filter((t) => chronFacts.includes(t));
// ⛔ NON-VACUITY FOR THE WHOLE RUN. If the two channels do not overlap on this ship, every check
// below passes for a reason that has nothing to do with the fix.
check(overlap.length > 0,
  `the two channels DO overlap on the running ship (${overlap.length} of ${tailFacts.length} tail entries are also in the chronicle) — without this the run proves nothing`);

const box = await centre('.moss-input');
if (box) await clickAt(box.x, box.y);
await type('log'); await key('Enter'); await sleep(3000);

// ⚠️ THE SELECTOR IS `.moss-faultlog .moss-logrow` — the FAULT LOG is a PANE, not transcript lines.
// Reading `.moss-cline` sees only the echoed `> log`, a harness bug that reads exactly like "the
// chronicle never arrived".
const rows = await json(`[...document.querySelectorAll('.moss-faultlog .moss-logrow')].map((e)=>e.textContent)`) || [];
const empty = await json(`[...document.querySelectorAll('.moss-faultlog .moss-empty')].map((e)=>e.textContent)`) || [];
log('  rows on screen:', rows.length);
for (const r of rows.slice(0, 20)) log('    ' + r);
check(empty.length === 0, 'the pane is not the empty-record sentence: ' + JSON.stringify(empty));
check(rows.length > 0, 'the FAULT LOG pane rendered rows');

// ───────────────────────────── 4. THE CLAIM: each fault ONCE
log('\nSTEP 2 — the pane lists each fault exactly as often as the ship recorded it');
// ⛔ THE CLAIM IS NOT "NO TWO ROWS SHARE A SENTENCE", AND A DRAFT THAT SAID SO WAS WRONG ON THE
// SHIPPED WRECK: the history ring legitimately holds the SAME sentence many times (measured — a
// saturated ring of 200 `overheat_guard: THERMAL LOAD HIGH` alarms, one per occurrence). Two
// occurrences are two facts. The defect was that ONE ring entry printed TWICE, so the honest
// instrument is a MULTISET comparison against the ship's own record: same sentences, same counts.
// Under the shipped concatenation this fails hard — 14 sentences carry one extra copy each and the
// row count runs 14 over.
const factOfRow = (s) => s.replace(/^(DAY \d+|—)\s+/, '').replace(/^\[[A-Za-z]+\] /, '').trim();
const facts = rows.map(factOfRow);
const tally = (xs) => xs.reduce((mp, x) => mp.set(x, (mp.get(x) || 0) + 1), new Map());
const onScreen = tally(facts);
const onWire = tally(chronFacts);
const over = [...onScreen].filter(([f, n]) => n > (onWire.get(f) || 0)).map(([f, n]) => `${f} ×${n} (ship: ${onWire.get(f) || 0})`);
const under = [...onWire].filter(([f, n]) => n > (onScreen.get(f) || 0)).map(([f, n]) => `${f} ×${onScreen.get(f) || 0} (ship: ${n})`);
check(over.length === 0, 'no fault is listed MORE often than the ship recorded it'
  + (over.length ? ' — OVER-COUNTED: ' + JSON.stringify(over.slice(0, 5)) : ''));
check(rows.length === chronFacts.length,
  `the pane holds exactly the chronicle's ${chronFacts.length} entries, not those plus the ${wireLog.length}-line live tail (rows=${rows.length})`);

log('\nSTEP 3 — and nothing was hidden to achieve it');
check(under.length === 0, 'no fault is listed LESS often than the ship recorded it'
  + (under.length ? ' — UNDER-COUNTED: ' + JSON.stringify(under.slice(0, 5)) : ''));
// The entries the live tail carries are on the screen too — through whichever costume. On a frozen
// ship the tail is a strict suffix of the chronicle, so this is exact.
const tailMissing = [...new Set(tailFacts)].filter((f) => !facts.includes(f));
check(tailMissing.length === 0,
  'every entry the live tail carries is on screen too' + (tailMissing.length ? ' — MISSING: ' + JSON.stringify(tailMissing) : ''));

await png('01-faultlog.png');

log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* already gone */ }
process.exit(failures ? 1 : 0);
