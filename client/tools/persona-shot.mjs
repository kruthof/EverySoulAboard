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
/**
 * The centre of a VISIBLE element, or null.
 *
 * ⛔ THE ZERO-RECT GUARD IS THE POINT, AND ITS ABSENCE PRODUCED FOUR FALSE FAILURES ON THIS TOOL'S
 * OWN RE-RUN. `getBoundingClientRect()` on a `display:none` element returns 0×0 at (0,0) — a
 * perfectly truthy object — so every `check(!!(await centre('.ov-crew')))` passed against a hidden
 * surface and the click that followed went to the top-left corner of the page and hit nothing. The
 * failures then read as *"ONE click on a CREW WATCH row did not open the window"*: a product defect
 * report, from a rig that had not waited for the Overview to exist. A rect with no area is not a
 * target.
 */
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();if(!(r.width>0&&r.height>0))return null;`
  + `return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

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
async function pollFor(fn, ms = 20000, step = 250) {
  for (let i = 0; i * step < ms; i++) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}
/**
 * ⛔ POLL THE STATE, NEVER SLEEP AT IT. The first draft of this tool waited a fixed 900–1500 ms after
 * every gesture and scored **24/31 on a loaded box** — seven checks failed because the wire had not
 * come back yet, and every one of them reads as a PRODUCT DEFECT in the log. A shot tool that
 * reports a false red on a busy machine is worse than no shot tool: it costs a lane a bisect.
 * Each waiter below names the STATE it is waiting for, so a genuine failure is still a failure —
 * the poll gives up and the check fails on its own message.
 */
const untilOpen = () => pollFor(async () => (await isOpen()) || null, 8000);
const untilClosed = () => pollFor(async () => ((await isOpen()) ? null : true), 8000);
/** Wait for the HOST to echo the selection back — `Cmd.click` round-trips before `[U]` can resolve
 *  a cid from the frame, and THAT is the race the fixed sleeps were papering over. */
const untilSelected = (name) => pollFor(async () => {
  const n = await evaluate("(()=>{const e=document.querySelector('.ov-selN');return e?e.textContent:'';})()");
  return n === name ? true : null;
}, 10000);
const untilRoomOpen = () => pollFor(async () => (await evaluate("document.body.classList.contains('roomzoom-open')")) || null, 15000);
const untilRoomClosed = () => pollFor(async () => ((await evaluate("document.body.classList.contains('roomzoom-open')")) ? null : true), 8000);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
// POLL the surface, do not sleep at it: on a loaded box 6 s was sometimes not enough and every later
// check then failed for a reason that had nothing to do with this package.
const firstPaint = await pollFor(async () => (await centre('[data-onb-begin]')) || (await centre('.ov-crew')), 40000);
check(!!firstPaint, 'the client never rendered a surface — nothing below is about this package');
if (!firstPaint) { chrome.kill('SIGKILL'); process.exit(1); }
for (let i = 0; i < 20; i++) {                       // the one-shot onboarding card — VERIFIED, not fired
  const onb = await centre('[data-onb-begin]');
  if (!onb) break;
  await clickAt(onb.x, onb.y);
  await sleep(1000);
}
check(!(await centre('[data-onb-begin]')), 'the onboarding card is dismissed (verified, not assumed)');

// ⛔ AND NOW WAIT FOR THE OVERVIEW ITSELF. The card is a one-shot overlay that appears BEFORE the
// wire has delivered a `decks` grid, so "a surface painted" is not "the Overview is up" — and every
// check below addresses the Overview's own DOM. Waiting on a LAID-OUT crew row (the zero-rect guard
// above makes that a real question) is the honest signal.
const overviewUp = await pollFor(async () => (
  ((await evaluate("document.body.classList.contains('overview-open')")) && (await centre('.ov-crew'))) || null
), 40000);
check(!!overviewUp, 'the OVERVIEW never came up (no `body.overview-open` with a laid-out crew row) — '
  + 'every check below is about that surface, so none of them would be about this package');
if (!overviewUp) { chrome.kill('SIGKILL'); process.exit(1); }

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
// ⭐⭐ THE CHARTER'S ACCEPTANCE STEP 1, VERBATIM: *"Click a crew member in the Overview → the window
// opens; the name matches."* — and the package's player sentence, *"ONE click on anyone, FROM EITHER
// SURFACE, opens ONE WINDOW"* (`…m4.packages.md:1095`).
//
// ⛔ THIS CHECK USED TO NEGATE THE CHARTER AND SCORE IT AS A PASS. The first draft asserted
// *"CONTROL — SELECTING a crew member does NOT open the window"*, quoting the ROOM ZOOM's
// `zoom-pawn.test.js` principle — on the surface where the charter asks for the opposite, in the
// package that inverts that very pin. A tool whose checks describe what the code does rather than
// what the charter says cannot fail; it only ratifies. It now describes the charter.
log('\nSTEP 1 — ONE click on a crew member in the OVERVIEW opens the window (the CREW WATCH row)');
const crew = await pollFor(() => centre('.ov-crew'));
check(!!crew, 'the Overview crew dock has a row');
if (!crew) { chrome.kill('SIGKILL'); process.exit(1); }
await clickAt(crew.x, crew.y);
check(!!(await untilOpen()),
  'ONE click on a CREW WATCH row did not open the Persona window. The charter is "one click on '
  + 'anyone, from either surface" and acceptance step 1 says it again; needing [U] as well makes the '
  + 'Overview cost two gestures where the Room Zoom dock costs one, in the same package.');
let st = await windowState();
check(st && st.name && st.name.length > 0, `the window names her: "${st?.name}"`);
await png('01-overview-one-click.png');

// …and the OTHER Overview crew gesture — a pawn DRAWN ON THE PLATE — must do it too. `.pl-pawn` is
// the hit tier `hitTest` resolves first (IX-O-15), so it is the same door by a different pointer.
//
// ⛔ RE-DERIVED AND RE-CLICKED, NEVER A CACHED POINT — and this is `rig-lib.mjs`'s own lesson, met
// again here. The figures live in `#ov-pawnlay`, a tween overlay whose per-cid `<g>` MOVES between
// two roster samples, and the gesture is fire-and-forget; a single click at a rectangle read a
// moment earlier can land on the paper beside her and open nothing. The first cut of this leg did
// exactly that and reported the FEATURE broken while the CREW WATCH row — the same code path, one
// element over — passed. Selector is the overlay's, by cid, exactly as `pawn-tween-shot.mjs` does.
await pressKey('Escape', 'Escape', 27);
await untilClosed();
const PAWN_SEL = `.ov-pawnlay .pl-pawn[data-cid="${SUBJECT.cid}"]`;
check(!!(await pollFor(() => centre(PAWN_SEL))), 'the plate draws HER figure to click');

/**
 * ⛔ A POINT THAT IS ACTUALLY ON HER, NOT THE CENTRE OF HER BOUNDING BOX — MEASURED, and the
 * distinction cost this leg two false failures. `.ov-pawnlay` is `pointer-events:none` with
 * `pointer-events:auto` on `.pl-pawn`, so only the figure's PAINTED geometry takes a click, and an
 * ink drawing of a person is mostly holes. Probed live at the bbox centre of the shipped figure:
 * `document.elementFromPoint` answers a `<rect>` whose `closest('.pl-pawn')` is FALSE — the click
 * falls straight through her to the compartment tile behind. So the target is SEARCHED FOR: a small
 * grid over her box, first point that actually resolves to her. This is a fact about drawing a
 * person in ink, not about this package, and a rig that clicked the middle of a bounding box would
 * keep manufacturing product-defect reports about every future pawn gesture.
 */
const pawnInkPoint = async () => json(`(()=>{
  const e = document.querySelector(${JSON.stringify(PAWN_SEL)}); if (!e) return null;
  const b = e.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) return null;
  for (let gy = 1; gy <= 9; gy++) for (let gx = 1; gx <= 9; gx++) {
    const x = b.x + (b.width * gx) / 10, y = b.y + (b.height * gy) / 10;
    const hit = document.elementFromPoint(x, y);
    if (hit && hit.closest && hit.closest('.pl-pawn')) return { x, y };
  }
  return null; })()`);
const inkPt = await pollFor(pawnInkPoint, 8000);
check(!!inkPt, 'no point inside her drawn figure takes a pointer event — `.pl-pawn` is `pointer-events:auto` '
  + 'but every probe fell through to the scene behind her, so the plate\'s crew hit tier is dead');
const pawnOpened = await pollFor(async () => {
  if (await isOpen()) return true;
  const t = await pawnInkPoint();
  if (t) await clickAt(t.x, t.y);
  return null;
}, 15000, 700);
check(!!pawnOpened,
  'ONE click on a crew member DRAWN ON THE PLATE did not open her window — the charter draws no '
  + 'line between a pawn and a roster row, so neither may this surface');
await png('01b-plate-pawn-one-click.png');
await pressKey('Escape', 'Escape', 27);
await untilClosed();

// ⭐ THE CONTROL THAT KEEPS STEP 1 HONEST: the door is a CREW click, not every click. A room must
// still enter the room rather than open a person.
const roomForControl = await pollFor(() => centre('.pl-room[data-anchor]'));
if (roomForControl) {
  await clickAt(roomForControl.x, roomForControl.y);
  await untilRoomOpen();
  check(!(await isOpen()), 'CONTROL — clicking a ROOM opened a Persona window; the door is the crew '
    + 'click, not the map');
  await pressKey('Escape', 'Escape', 27);
  await untilRoomClosed();
}

log('\nSTEP 2 — the [U] PERSONA button opens the same window, and the bands read true');
const crew2 = await pollFor(() => centre('.ov-crew'));
if (crew2) await clickAt(crew2.x, crew2.y);
await untilOpen();
await pressKey('Escape', 'Escape', 27);
await untilClosed();
await untilSelected(SUBJECT.name);
const btn = await centre('[data-ov-persona]');
check(!!btn, 'the [U] PERSONA button is on screen');
await clickAt(btn.x, btn.y);
check(!!(await untilOpen()), 'the [U] PERSONA button opened the window');
st = await windowState();
log('  window:', JSON.stringify(st));
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
check(!!(await untilClosed()), 'Escape closed the Persona window');
const afterEsc = await evaluate('document.body.className');
check(String(beforeEsc).replace(/\bpersona-open\b/, '').trim() === String(afterEsc).replace(/\s+/g, ' ').trim(),
  `Escape changed ONLY the persona switch — "${beforeEsc}" → "${afterEsc}" (MOSS/RELATIONS untouched)`);

// ───────────────────────── 6. ACCEPTANCE STEP 5 — the retargeted key, through the real keymap
log('\nSTEP 5 — the retargeted key [U] opens the same window');
await pressKey('u', 'KeyU', 85);
check(!!(await untilOpen()), 'pressing [U] on a selected crew member opened the Persona window');
st = await windowState();
check(st && st.name === SUBJECT.name, 'the key opened it for the SELECTED crew member');
await png('03-persona-by-key.png');
// …and the retired key does nothing at all.
await pressKey('Escape', 'Escape', 27);
await untilClosed();
await pressKey('t', 'KeyT', 84);
// ⚠️ A NEGATIVE needs a real settle rather than a poll (there is no state to wait FOR), so this is
// the one deliberate sleep in the tool and it is generous — and it is paired with the positive
// legs above, which have already proved the key path is live on this page.
await sleep(1500);
check(!(await isOpen()), 'CONTROL — the retired [T] key opens nothing (the TALK verb is deleted)');

// ───────────────────────── 7. ⭐⭐ ACCEPTANCE STEP 4 — THE STEP THAT CLOSES ROADMAP.md:55
log('\nSTEP 4 — enter a ROOM, click a crew member in the dock, and the SAME window opens OVER it');
const room = await pollFor(() => centre('.pl-room[data-anchor]'));
check(!!room, 'the Overview has a room to enter');
if (room) {
  await clickAt(room.x, room.y);
  await pollFor(() => centre('.rz-canvas'), 15000);
  await untilRoomOpen();
}
check((await evaluate(`document.body.classList.contains('roomzoom-open')`)) === true,
  'the Room Zoom is open (body.roomzoom-open) — the state that hides #panels');
await png('04-roomzoom-before.png');

const rzRow = await pollFor(() => centre('.rz-crew'));
check(!!rzRow, 'the Room Zoom crew dock has a row');
if (rzRow) { await clickAt(rzRow.x, rzRow.y); await untilOpen(); }
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
check(!!(await untilClosed()), 'Escape closed the window');
check((await evaluate(`document.body.classList.contains('roomzoom-open')`)) === true,
  '…and left the player IN THE ROOM — the escape rung is above the room exit, not instead of it');
await png('06-back-in-the-room.png');
await pressKey('Escape', 'Escape', 27);
await untilRoomClosed();
check((await evaluate(`document.body.classList.contains('roomzoom-open')`)) === false,
  'a SECOND Escape then leaves the room, exactly as it did before this package');

// ───────────────────────── 8. STEP 7, AS FAR AS THE BOOT STATE HONESTLY ALLOWS
log('\nSTEP 7 — CAN & CANNOT, on the crew this ship actually has at boot');
const capRow = caps.find((c) => c[0] === SUBJECT.cid);
const mask = capRow ? capRow[capRow.length - 1] : null;
log(`  workcaps row for cid ${SUBJECT.cid}: ${JSON.stringify(capRow)} (incapableMask=${mask})`);
const crew3 = await pollFor(() => centre('.ov-crew'));
if (crew3) { await clickAt(crew3.x, crew3.y); await untilOpen(); }
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
