#!/usr/bin/env node
// "THE MOSS CONSOLE BEHAVES LIKE A TERMINAL" — the scroll contract, driven in real Chrome against
// the running game at the viewport the defect was measured at.
//
// ⛔ THE DEFECT (measured 2026-08-03, 1280×800, shipped wreck): typing `help` on the MOSS console
// printed 14 lines into a `max-height:22vh` box and left it at the TOP —
// `clientHeight 157 / scrollHeight 305 / scrollTop 0`. Seven lines visible; the hidden seven were
// the BOTTOM seven, i.e. COMMISSION, PODS and THAW — the three verbs the thaw arc is reached
// through. A terminal that hides its newest output is broken, and MOSS is the arc's surface.
//
// ⭐ WHAT ONLY THIS TOOL CAN SEE. `moss-screen.test.js` drives the contract through a hand-built
// LAYOUT (dom-lite has none): it pins the decision and the glue, and it cannot see
//   1. THAT THE PANE IS SCROLLABLE BY A PLAYER AT ALL — `max-height:22vh` + `overflow-y:auto` is a
//      stylesheet claim, and a real wheel gesture over the pane is the only thing that tests it;
//   2. THAT THE THREE VERBS ARE IN THE VISIBLE RECTANGLE — the node test computes visibility from a
//      fake stride; here it is `getBoundingClientRect` against the pane's own box, in the shipped
//      CSS, at the shipped font size;
//   3. THAT THE ~1 Hz WIRE-DRIVEN RENDERS DO NOT MOVE A READER — nothing in node produces them;
//      the check below simply waits while the real host pushes `systems`/`log` and re-renders.
//
// ⚠️ IT TYPES. OD-P made the console a terminal: no letter hotkeys, every printable character types
// into the prompt, ENTER submits. Every command below is dispatched as TRUSTED key events over CDP.
//
// ⭐ NON-VACUITY: STEP 4 plants the defect's own state (`scrollTop = 0` on an overflowing pane) and
// requires the STEP-1 check expression to read FAIL against it. A check that cannot fail is not a
// check, and this one is asked to fail on the exact metrics the bug report carries.
//
// ⛔ WHAT THIS RIG PROVED THAT THE PACKAGE'S FIRST STORY GOT WRONG (2026-08-04). The first draft
// blamed `replaceChildren` for clamping `scrollTop` to 0 on every render. It does not: parked at 357
// of a 714 maximum, the pane reads 357 after the exact `_renderConsole` call shape, still 357 with a
// layout read forced while the box is empty, and 357 across six real 1 Hz wire-driven rebuilds. The
// pane sat at 0 because nothing had ever scrolled it and new lines append below the fold — the
// FOLLOW arm is the whole of the fix, and the no-move arm is defence-in-depth.
//
// USAGE
//   1. ./play.sh --host-port 8462 --client-port 8463 --no-open
//   2. node client/tools/moss-scroll-shot.mjs --out docs/design/shots [--host-port 8462] …
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host
// (the moss-shot.mjs / awaiting-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding, waitFor, die, sleep } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8462');
const CLIENT_PORT = +arg('client-port', '8463');
const CDP_PORT = +arg('cdp-port', '9462');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'moss-scroll-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ───────────────────────────── real Chrome over CDP, at the DEFECT'S OWN VIEWPORT
// 1280×800 is not decoration: `max-height:22vh` makes the pane 176px here, ~10 line boxes, which is
// what puts HELP's bottom half below the fold. A taller window would not reproduce the bug.
const userDir = mkdtempSync(join(tmpdir(), 'moss-scroll-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1280,800',
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
if (!wsUrl) die(chrome, 5, 'FAIL: Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) die(chrome, 6, 'FAIL: captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name); writeFileSync(p, Buffer.from(r.result.data, 'base64')); log('  wrote', p);
  return p;
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
async function prompt(line) { await type(line); await key('Enter'); await sleep(1200); }

/** A REAL wheel gesture over the console pane — the only thing that tests `overflow-y:auto`. */
async function wheelOverConsole(deltaY, times = 1) {
  const box = await centre('.moss-console');
  if (!box || !(box.w > 0)) die(chrome, 7, 'FAIL: `.moss-console` is not laid out — nothing to scroll');
  for (let i = 0; i < times; i++) {
    await call('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY, pointerType: 'mouse',
    });
    await sleep(120);
  }
  await sleep(250);
}

/**
 * The pane's truth: its scroll metrics, and for every transcript row whether its box is inside the
 * pane's box. `getBoundingClientRect` rather than a stride: the shipped CSS wraps long lines, so a
 * computed row height would be a second authority on the layout and wrong on exactly the rows the
 * check cares about.
 */
const PANE = `(()=>{const el=document.querySelector('.moss-console');if(!el)return null;
const pr=el.getBoundingClientRect();
const rows=[...el.querySelectorAll('.moss-cline')].map((e)=>{const r=e.getBoundingClientRect();
  return {t:e.textContent, visible: r.top>=pr.top-0.5 && r.bottom<=pr.bottom+0.5};});
return {scrollTop:el.scrollTop, clientHeight:el.clientHeight, scrollHeight:el.scrollHeight,
        maxScroll:Math.max(0,el.scrollHeight-el.clientHeight), rows};})()`;
const pane = () => json(PANE);
/** THE STEP-1 CHECK EXPRESSION, as one function so STEP 4 can plant a state and re-ask it. */
const followsTail = (p) => !!p && p.scrollTop >= p.maxScroll - 1;
const lineHeight = (p) => (p.rows.length ? p.scrollHeight / p.rows.length : 0);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ───────────────────────────── open MOSS the way a player does
const tab = await waitFor('the Overview MOSS tab', async () => {
  const r = await centre('[data-ov-tab="moss"]'); return (r && r.w > 0) ? r : null;
}, { chrome, code: 8 });
await clickAt(tab.x, tab.y);
await waitFor('the MOSS console prompt (the takeover really happened)',
  () => evaluate("document.querySelector('.moss-input')?1:0"),
  { chrome, code: 8 });
const box = await centre('.moss-input');
if (box) await clickAt(box.x, box.y);
await sleep(400);

// ───────────────────────────── STEP 1: type `help`; the newest line must be in view
log('\nSTEP 1 — `help` prints past the fold, and the view FOLLOWS the newest line');
await prompt('help');
const p1 = await pane();
if (!p1) die(chrome, 8, 'FAIL: no `.moss-console` after typing help');
log('  metrics:', JSON.stringify({ scrollTop: +p1.scrollTop.toFixed(1), clientHeight: p1.clientHeight,
  scrollHeight: p1.scrollHeight, rows: p1.rows.length, lineBox: +lineHeight(p1).toFixed(2) }));
check(p1.scrollHeight > p1.clientHeight + 1,
  'PRECONDITION: the transcript really overflows the pane (' + p1.scrollHeight + ' > ' + p1.clientHeight
  + ') — without this every check here is vacuous');
check(followsTail(p1), 'the view followed the newest line (scrollTop ' + p1.scrollTop.toFixed(1)
  + ' of a possible ' + p1.maxScroll.toFixed(1) + ')');
const verbs = ['COMMISSION', 'PODS', 'THAW'];
const hidden = verbs.filter((v) => {
  const row = p1.rows.find((r) => r.t.startsWith(v));
  return !row || !row.visible;
});
check(hidden.length === 0, 'COMMISSION / PODS / THAW — the three verbs the thaw arc is reached '
  + 'through — are ON SCREEN' + (hidden.length ? ' (hidden: ' + hidden.join(', ') + ')' : ''));
await png('01-help-follows-newest.png');

// ───────────────────────────── STEP 2: scroll up; the reader's place is HELD
// ⚠️ ONE NOTCH, NOT THREE BIG ONES — changed in review (2026-08-04). Three ×400 slammed the pane to
// `scrollTop 0`, and at 0 "the code held the position" and "the position was lost to 0" read
// identically, so every hold check below was blind to the no-move arm (the 4th shape). A single
// ~100px notch parks the reader MID-transcript, where the two outcomes differ.
log('\nSTEP 2 — the player scrolls back to read history, and NOTHING drags them down');
await wheelOverConsole(-100, 1);
const p2 = await pane();
check(p2.scrollTop < p1.scrollTop - 1,
  'PRECONDITION: a real wheel gesture over the pane actually scrolled it (' + p1.scrollTop.toFixed(1)
  + ' → ' + p2.scrollTop.toFixed(1) + ') — `overflow-y:auto` is a claim until a wheel tests it');
check(p2.scrollTop > 0,
  'PRECONDITION: the reader is parked MID-transcript, not at 0 (' + p2.scrollTop.toFixed(1)
  + ') — at 0 a held position and a lost one are the same picture, and every check below would be '
  + 'blind to the no-move arm');

// 2a. the renders NOTHING asked for: `systems` / `log` land every second or so and each one rebuilds
//     the transcript. This is what a naive always-jump would break, and no node test can see it.
await sleep(4000);
const p2b = await pane();
check(Math.abs(p2b.scrollTop - p2.scrollTop) <= 1,
  'four seconds of wire-driven renders did not move the view (' + p2.scrollTop.toFixed(1) + ' → '
  + p2b.scrollTop.toFixed(1) + ')');

// 2b. and real OUTPUT while they are still reading: it appends, it does not yank.
await prompt('help');
const p3 = await pane();
check(Math.abs(p3.scrollTop - p2b.scrollTop) <= 1,
  'new output arriving while the player reads history did not yank them to the bottom ('
  + p2b.scrollTop.toFixed(1) + ' → ' + p3.scrollTop.toFixed(1) + ')');
check(p3.rows.length > p2b.rows.length,
  'PRECONDITION: the output really did arrive (' + p2b.rows.length + ' → ' + p3.rows.length
  + ' lines) — a console that printed nothing would hold its place trivially');
await png('02-scrolled-up-holds.png');

// ───────────────────────────── STEP 3: back to the bottom; the follow re-arms
log('\nSTEP 3 — back at the bottom, the console follows again');
await wheelOverConsole(600, 8);
const p4 = await pane();
check(followsTail(p4), 'PRECONDITION: the wheel reached the bottom (' + p4.scrollTop.toFixed(1)
  + ' of ' + p4.maxScroll.toFixed(1) + ')');
await prompt('status');
const p5 = await pane();
check(p5.rows.length > p4.rows.length, 'PRECONDITION: `status` printed something');
check(followsTail(p5), 'the follow re-armed — output moves the view again (' + p5.scrollTop.toFixed(1)
  + ' of ' + p5.maxScroll.toFixed(1) + ')');
check(p5.rows[p5.rows.length - 1].visible, 'and the NEWEST line is the one on screen');
await png('03-returned-to-bottom-follows.png');

// ───────────────────────────── STEP 4: the non-vacuity control
// ⛔ A CHECK THAT CANNOT FAIL IS NOT A CHECK. The defect's own state is planted directly — an
// overflowing pane parked at the top, `scrollTop 0`, exactly what the bug report measured — and the
// STEP-1 expression is re-asked against it. It must read FAIL.
log('\nSTEP 4 — NON-VACUITY: the STEP-1 check, asked about the DEFECT\'S OWN state');
await evaluate("document.querySelector('.moss-console').scrollTop = 0");
await sleep(300);
const planted = await pane();
check(planted.scrollHeight > planted.clientHeight + 1, 'the planted state still overflows');
check(!followsTail(planted),
  'the check reads FAIL on `scrollTop 0` over an overflowing pane — i.e. it can see the shipped '
  + 'defect, and STEP 1\'s PASS was not free');
const plantedHidden = verbs.filter((v) => {
  const row = planted.rows.find((r) => r.t.startsWith(v));
  return !row || !row.visible;
});
check(plantedHidden.length > 0,
  'and the verb check reads FAIL too — at the top of the transcript the thaw verbs really are '
  + 'below the fold (hidden: ' + plantedHidden.join(', ') + ')');

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
