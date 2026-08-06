#!/usr/bin/env node
// ⭐⭐ M4-2 — ONE CLICK, ONE WINDOW: the Persona window's ACCEPTANCE SCRIPT, driven in REAL CHROME
// against the running game on the SHIPPED wreck, unmodified.
//
// WHAT ONLY THIS TOOL CAN SEE, and it is the charter's own mutation 4 verbatim: *"driven, not
// scanned: open the window with `body.roomzoom-open` set and assert it is VISIBLE — a CSS
// `display:none` is invisible to every DOM-presence test"*. `client/test/persona-view.test.js` mounts
// the real module and asserts every band it paints, but `dom-lite` computes no styles: a window that
// inherited `#panels`'s `body.roomzoom-open{display:none}` rule would pass all thirteen of those
// tests, be fully built, fully populated, and NOT ON SCREEN on the one surface that needs it most
// (the Room Zoom's crew dock — `docs/ROADMAP.md:55`). `getComputedStyle` is the only instrument that
// can answer that, and it needs a browser.
//
// The three other browser-only claims:
//   · the task sentence is NOT CLIPPED (`scrollWidth <= clientWidth`) — the whole reason the band
//     exists is that both crew docks ellipsize it at 26 / 22 characters (`MECHANICS.md:3151`).
//   · `[T] OPEN CHANNEL — TALK` is GONE FROM THE PAGE, not merely disabled (acceptance step 6).
//   · the retargeted key really opens it in a live browser, through the real keymap.
//
// USAGE
//   1. ./play.sh --host-port 8372 --client-port 8373 --no-open
//   2. node client/tools/persona-shot.mjs --host-port 8372 --client-port 8373 --out docs/design/shots
//
// ⚠️ ACCEPTANCE STEP 7 IS **NOT** DRIVEN HERE, AND THE REASON IS MEASURED RATHER THAN A SHORTCUT.
// The charter's step 7 wants a crew member with an incapable work type, and charter §12.15 measured
// that only the SEVEN AUTHORED SLEEPERS have one — Rell, the only soul aboard at boot, carries the
// fleet-wide default and an EMPTY mask, so on a fresh wreck the CANNOT half is correctly absent. A
// thawed sleeper is ~6.7 sim-hours of repair → doors → commission → thaw (the `DoorsVerbTests` chain,
// which IS the playtest script). This tool asserts the boot state honestly — six CAN rows, no CANNOT
// section — and the INCAPABLE rendering is driven headlessly instead, per work type, by
// `persona-view.test.js`'s Ozawa leg (`incapableMask = 1 << 1`, BUILD). Said out loud so nobody reads
// this tool's silence as coverage.
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8372');
const CLIENT_PORT = +arg('client-port', '8373');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'persona-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9371');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0, checks = 0;
const check = (ok, what) => { checks += 1; log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ───────────────────────── 1. the SIM's own truth, on an INDEPENDENT socket (never the page)
// The roster is the authority on the name and the task sentence; reading it here rather than off the
// page is what makes the window's text an ASSERTION instead of a tautology.
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
ws.send(JSON.stringify({ cmd: 'lens', name: 'none' }));
await sleep(2500);
const roster = latest.get('roster')?.crew || [];
const caps = latest.get('workcaps')?.cells || [];
log(`roster: ${roster.length} soul(s) — ${roster.map((c) => c.name).join(', ')}`);
if (!roster.length) { console.error('ABORT: the host sent no roster'); process.exit(2); }
const SUBJECT = roster[0];
log(`subject: ${SUBJECT.name} (cid ${SUBJECT.cid}) — task "${SUBJECT.task}"`);

// ───────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'persona-shot-'));
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
/**
 * ⛔ EXACTLY ONE `keydown` PER PRESS, AND THE FIRST DRAFT OF THIS FUNCTION SENT TWO.
 *
 * CDP's `rawKeyDown` and `keyDown` BOTH deliver a DOM `keydown`; sending the pair (as this tool did
 * on its first run) delivers the keystroke twice. Measured on that run: the FIRST Escape closed the
 * Persona window over the Room Zoom and the SECOND then exited the room, so the tool reported the
 * escape rung as broken when the rung was correct and the RIG was pressing Escape twice. That is a
 * FALSE RED (`CLAUDE.md` trap 3) with the failure landing on the shipped code — the most expensive
 * shape. `moss-scroll-shot.mjs`'s `key()` is the house pattern and this now matches it: one
 * `keyDown` carrying `text` when the key is printable, then `keyUp`.
 */
async function pressKey(key, code, vk) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key.length === 1 ? key : undefined });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** ⭐ THE INSTRUMENT MUTATION 4 NEEDS. `display` is COMPUTED, so a cascade rule that hides the
 *  window is visible here and NOWHERE ELSE in this repo. The rect is read too, because a
 *  `display:flex` box of zero area is hidden by another name. */
const windowState = async () => json(`(()=>{const e=document.getElementById('persona');if(!e)return null;
  const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
  const t=document.querySelector('.pv-task');
  // THE SHEET'S OWN BOX, NOT ONLY THE CONTAINER'S: #persona is a full-viewport flex box, so its
  // rect is 1600xN whether or not anything is drawn inside it -- measuring only that would let an
  // empty container read as "visible". .pv-sheet is the paper the window is printed on.
  const sh=document.querySelector('.pv-sheet'); const sr=sh?sh.getBoundingClientRect():null;
  return {
    display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
    w: Math.round(r.width), h: Math.round(r.height),
    sheetW: sr?Math.round(sr.width):-1, sheetH: sr?Math.round(sr.height):-1,
    sheetDisplay: sh?getComputedStyle(sh).display:'(none)',
    bodyClasses: document.body.className,
    title: (document.querySelector('.pv-title')||{}).textContent||'',
    name: (document.querySelector('.pv-name')||{}).textContent||'',
    role: (document.querySelector('.pv-role')||{}).textContent||'',
    where: (document.querySelector('.pv-where')||{}).textContent||'',
    bands: Array.from(document.querySelectorAll('.pv-bandhd')).map((b)=>b.textContent),
    task: t ? (t.textContent||'') : '',
    taskClientW: t ? t.clientWidth : -1, taskScrollW: t ? t.scrollWidth : -1,
    skills: Array.from(document.querySelectorAll('.pv-skill-lbl')).map((e2)=>e2.textContent),
    cannot: Array.from(document.querySelectorAll('.pv-cannot-row')).map((e2)=>e2.textContent),
    notes: Array.from(document.querySelectorAll('.pv-empty')).filter((e2)=>e2.offsetParent!==null||e2.getClientRects().length)
             .map((e2)=>e2.textContent),
  };})()`);
const isOpen = async () => (await evaluate(`document.body.classList.contains('persona-open')`)) === true;
async function pollFor(fn, ms = 20000, step = 500) {
  for (let i = 0; i * step < ms; i++) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
for (let i = 0; i < 20; i++) {                       // the one-shot onboarding card — VERIFIED, not fired
  const onb = await centre('[data-onb-begin]');
  if (!onb) break;
  await clickAt(onb.x, onb.y);
  await sleep(1500);
}
check(!(await centre('[data-onb-begin]')), 'the onboarding card is dismissed (verified, not assumed)');

// ───────────────────────── 3. STEP 6 FIRST — the doors that are supposed to be GONE
log('\nSTEP 6 — the deleted doors are gone from the PAGE, not disabled');
const gone = await json(`(()=>({
  talk: !!document.querySelector('[data-ov-talk]'),
  bio: !!document.querySelector('[data-ov-bio]'),
  persona: !!document.querySelector('[data-ov-persona]'),
  actionLabels: Array.from(document.querySelectorAll('.ov-act')).map((b)=>b.textContent),
}))()`);
log('  action row:', JSON.stringify(gone));
check(gone && gone.talk === false, '[T] OPEN CHANNEL — TALK is GONE from the Overview readout (not disabled)');
check(gone && gone.bio === false, '[B] BIO is GONE from the Overview readout');
check(gone && gone.persona === true, '…and [U] PERSONA is there in their place');
check(Array.isArray(gone?.actionLabels) && !gone.actionLabels.some((t) => /TALK|BIO/i.test(t)),
  'no action button still says TALK or BIO');

// ───────────────────────── 4. ACCEPTANCE STEPS 1–2 — one click on the Overview
log('\nSTEP 1/2 — click a crew member in the OVERVIEW, then open her window');
const crew = await pollFor(() => centre('.ov-crew'));
check(!!crew, 'the Overview crew dock has a row');
if (!crew) { chrome.kill('SIGKILL'); process.exit(1); }
await clickAt(crew.x, crew.y);
await sleep(1200);
check(!(await isOpen()), 'CONTROL — SELECTING a crew member does NOT open the window (selecting is not interacting)');
await png('01-overview-selected.png');

const btn = await centre('[data-ov-persona]');
check(!!btn, 'the [U] PERSONA button is on screen');
await clickAt(btn.x, btn.y);
await sleep(1200);
let st = await windowState();
log('  window:', JSON.stringify(st));
check(await isOpen(), 'clicking [U] PERSONA opened the window');
check(st && st.display !== 'none' && st.sheetW > 200 && st.sheetH > 200,
  `the window is actually VISIBLE over the Overview (display=${st?.display}, sheet ${st?.sheetW}×${st?.sheetH})`);
check(st && st.name === SUBJECT.name,
  `the name matches the roster's — window "${st?.name}" vs wire "${SUBJECT.name}"`);
check(st && st.title === 'PERSONA · ' + SUBJECT.name, 'the window titles itself with her name');
check(JSON.stringify(st?.bands) === JSON.stringify(['IDENTITY', 'DOING & WHY', 'CAN & CANNOT', 'TIES & HISTORY']),
  'FOUR bands, in the exit gate\'s order — HOW SHE IS ships with the first mental break (M4-9)');
await png('02-persona-open-overview.png');

// ⭐ THE TASK SENTENCE, WHOLE — the browser-only half of the charter's mutation 7.
const wireTask = String(SUBJECT.task || '');
check(st && st.task === wireTask,
  `the task line EQUALS the roster's task field verbatim — window "${st?.task}" vs wire "${wireTask}"`);
check(st && st.taskScrollW <= st.taskClientW + 1,
  `the task sentence is NOT CLIPPED — content ${st?.taskScrollW}px in a ${st?.taskClientW}px box. `
  + 'Both crew docks ellipsize this label (145px/118px); the window exists so it does not.');

// ───────────────────────── 5. ACCEPTANCE STEP 3 — Escape closes it, and takes nothing with it
log('\nSTEP 3 — Escape closes the window and leaves the surface alone');
const beforeEsc = await evaluate('document.body.className');
await pressKey('Escape', 'Escape', 27);
await sleep(900);
check(!(await isOpen()), 'Escape closed the Persona window');
const afterEsc = await evaluate('document.body.className');
check(String(beforeEsc).replace(/\bpersona-open\b/, '').trim() === String(afterEsc).replace(/\s+/g, ' ').trim(),
  `Escape changed ONLY the persona switch — "${beforeEsc}" → "${afterEsc}" (MOSS/RELATIONS untouched)`);

// ───────────────────────── 6. ACCEPTANCE STEP 5 — the retargeted key, through the real keymap
log('\nSTEP 5 — the retargeted key [U] opens the same window');
await pressKey('u', 'KeyU', 85);
await sleep(900);
check(await isOpen(), 'pressing [U] on a selected crew member opened the Persona window');
st = await windowState();
check(st && st.name === SUBJECT.name, 'the key opened it for the SELECTED crew member');
await png('03-persona-by-key.png');
// …and the retired key does nothing at all.
await pressKey('Escape', 'Escape', 27);
await sleep(700);
await pressKey('t', 'KeyT', 84);
await sleep(900);
check(!(await isOpen()), 'CONTROL — the retired [T] key opens nothing (the TALK verb is deleted)');

// ───────────────────────── 7. ⭐⭐ ACCEPTANCE STEP 4 — THE STEP THAT CLOSES ROADMAP.md:55
log('\nSTEP 4 — enter a ROOM, click a crew member in the dock, and the SAME window opens OVER it');
const room = await pollFor(() => centre('.pl-room[data-anchor]'));
check(!!room, 'the Overview has a room to enter');
if (room) {
  await clickAt(room.x, room.y);
  await pollFor(() => centre('.rz-canvas'), 15000);
}
check((await evaluate(`document.body.classList.contains('roomzoom-open')`)) === true,
  'the Room Zoom is open (body.roomzoom-open) — the state that hides #panels');
await png('04-roomzoom-before.png');

const rzRow = await pollFor(() => centre('.rz-crew'));
check(!!rzRow, 'the Room Zoom crew dock has a row');
if (rzRow) { await clickAt(rzRow.x, rzRow.y); await sleep(1500); }
st = await windowState();
log('  window over the room:', JSON.stringify(st));
check(await isOpen(), 'clicking a Room Zoom dock row opened the Persona window');
// ⛔ THE ASSERTION THIS WHOLE TOOL EXISTS FOR.
check(st && st.display !== 'none' && st.visibility !== 'hidden' && +st.opacity > 0
      && st.sheetW > 200 && st.sheetH > 200,
  `⭐ THE WINDOW IS VISIBLE WITH body.roomzoom-open SET (display=${st?.display}, visibility=`
  + `${st?.visibility}, opacity=${st?.opacity}, sheet ${st?.sheetW}×${st?.sheetH} (${st?.sheetDisplay}), `
  + `body="${st?.bodyClasses}"). This is `
  + 'the charter\'s mutation 4: `#panels` is display:none in this exact state, so a window mounted '
  + 'there would be built, populated, correct and INVISIBLE — and every DOM test would still pass.');
await png('05-persona-over-roomzoom.png');

// Escape here must close the WINDOW, not exit the room out from under it.
await pressKey('Escape', 'Escape', 27);
await sleep(900);
check(!(await isOpen()), 'Escape closed the window');
check((await evaluate(`document.body.classList.contains('roomzoom-open')`)) === true,
  '…and left the player IN THE ROOM — the escape rung is above the room exit, not instead of it');
await png('06-back-in-the-room.png');
await pressKey('Escape', 'Escape', 27);
await sleep(900);
check((await evaluate(`document.body.classList.contains('roomzoom-open')`)) === false,
  'a SECOND Escape then leaves the room, exactly as it did before this package');

// ───────────────────────── 8. STEP 7, AS FAR AS THE BOOT STATE HONESTLY ALLOWS
log('\nSTEP 7 — CAN & CANNOT, on the crew this ship actually has at boot');
const capRow = caps.find((c) => c[0] === SUBJECT.cid);
const mask = capRow ? capRow[capRow.length - 1] : null;
log(`  workcaps row for cid ${SUBJECT.cid}: ${JSON.stringify(capRow)} (incapableMask=${mask})`);
const crew2 = await pollFor(() => centre('.ov-crew'));
if (crew2) { await clickAt(crew2.x, crew2.y); await sleep(900); await pressKey('u', 'KeyU', 85); await sleep(900); }
st = await windowState();
const expectedCan = 6 - (mask == null ? 0 : [0, 1, 2, 3, 4, 5].filter((t) => (mask & (1 << t)) !== 0).length);
check(st && st.skills.length === expectedCan,
  `CAN lists ${st?.skills.length} work types and the wire's mask says ${expectedCan} — ${JSON.stringify(st?.skills)}`);
check(st && st.cannot.length === (6 - expectedCan),
  `CANNOT lists ${st?.cannot.length} — ${JSON.stringify(st?.cannot)} (RimWorld draws NO CELL for an `
  + 'incapable type; charter §12.15 measured that only the seven authored SLEEPERS have one, so an '
  + 'empty CANNOT here is the honest boot state and not a missing feature)');
check(Array.isArray(st?.notes) && st.notes.length >= 3,
  `the honest empties are on screen: ${JSON.stringify(st?.notes)}`);
await png('07-can-and-cannot.png');

log(`\n${checks - failures}/${checks} checks passed`);
if (failures) console.error(`FAILURES: ${failures}`);
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* already gone */ }
process.exit(failures ? 1 : 0);
