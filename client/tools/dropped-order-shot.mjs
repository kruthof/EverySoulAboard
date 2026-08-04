#!/usr/bin/env node
// ⭐⭐ D5 — AN ACCEPTED ORDER IS NEVER SILENTLY DROPPED, driven in REAL CHROME against the running
// game, on the SHIPPED wreck, unmodified.
//
// THE SIGHTING THIS TOOL REPRODUCES AND THEN CLOSES (spend-visible lane, 2026-08-03): right-click ▸
// PRIORITISE: REPAIR on `fabricator_1` ⇒ the crew dock reads "Heading to service fabricator_1" ⇒
// ~17 sim-seconds later it reads "Awaiting orders". Silent. `vacuum-shot.mjs` saw the same thing and
// could only OBSERVE it, because it belonged to another package.
//
// WHAT ONLY THIS TOOL CAN SEE. `tests/Perilune.Tests/DroppedOrderTests.cs` pins the host's payload
// and `client/test/blocked-model.test.js` pins the vocabulary — but there is no jsdom in this repo,
// so three claims are outside every node harness:
//   1. THE BADGE IS ACTUALLY DRAWN over the ordered machine's tile in the Room Zoom. A scrim the
//      player cannot see is indistinguishable from no scrim (invisible-feedback-is-FUNCTIONAL,
//      binding, three owner reports).
//   2. THE WORDS REACH THE VISIBLE KEY, not only the `<title>` — the surface `blocked-overlay.js`'s
//      own header says is the one that actually discharges "the player was never told".
//   3. ⭐⭐ THE BADGE SURVIVES THE DROP. This is the package. The dock really does go back to
//      "Awaiting orders" — that behaviour is NOT fixed here — and the explanation is still on the
//      screen when it does.
//
// USAGE
//   1. ./play.sh --host-port 8360 --client-port 8361 --no-open
//   2. node client/tools/dropped-order-shot.mjs --out docs/design/shots
//
// ⚠️ IT NEEDS A FRESH HOST. There is no cancel verb, so the order this tool issues stays pending for
// the life of the session and a SECOND run against the same `play.sh` aborts (exit 2) rather than
// reporting a red control. Restart the game between runs.
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free (the rule awaiting-shot.mjs / vacuum-shot.mjs state).
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ 2026-08-03 — THE START STATE, SAID OUT LOUD (rig-hardening lane).
//
// ⛔ THIS RIG REQUIRES A FRESH HOST AND ENFORCES IT — it does not merely ask. Its whole subject is a
// badge that appears BECAUSE the player ordered something, so both controls need a ship where
// nobody has ordered anything: `_prioritised` is per-SESSION host state with no cancel verb, so the
// premise below ABORTS (exit 2) on a host that already carries this tool's own no-route row. That is
// the one piece of state it cannot reset. Everything else it resets and PROVES:
//   · LENS   → `{cmd:'lens',name:'none'}` on this tool's own socket.
//   · ROOM   → `leaveRoomZoom()` before the first read and after the last: the focused room is HOST
//              state (`wire/session.js`), and this rig ENTERS one, so leaving it open would boot the
//              next rig on this host into a Room Zoom it did not choose.
//   · SELECT → `verifiedClick`, which re-clicks until the HOST says somebody is selected.
//
// ⭐ AND EVERY GESTURE IS WITNESSED. `Cmd.click` reaches `ContextAction`, which TOGGLES the device on
// the clicked tile when no citizen stands there (GameSession.cs:1936-1958, whenever the MOSS server
// is LIVE — measured note below). A rig that re-clicks a walking pawn could actuate the machine it is
// about to order a repair on — so the `devices` channel is fingerprinted before the first gesture
// and compared after the last (final check).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding, verifiedClick, die, deviceOpenState, actuationDiff } from './rig-lib.mjs';
// The host's own answer to "who is selected", imported rather than restated: `frame.sel` is a TILE
// and the join to a cid is `messages.js`'s, so the rig cannot drift from the client's reading.
import { selectedCrewCid } from '../src/wire/messages.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8360');
const CLIENT_PORT = +arg('client-port', '8361');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'dropped-order-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9357');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0, checks = 0;
// The count is EMITTED, not claimed (vacuum-shot.mjs's finding: a hand-counted number in a commit
// message is exactly the "count you did not measure yourself" this repo keeps getting caught by).
const check = (ok, what) => { checks += 1; log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// The host's own sentence for this reason, verbatim from `client/src/wire/messages.js`
// BLOCKED_REASON_TEXT.no_route — restated because this tool talks to a BROWSER and cannot import the
// module the page loaded. A mismatch fails the words legs loudly, which is the point.
const NO_ROUTE = 'NO WAY TO WALK TO IT';
// The machine, its compartment and the reason code — `AuthoredShips.cs` / WireFormat.ReasonNoRoute.
const ANCHOR = 'hall_d0_s2';
const MACHINE = 'fabricator_1';
// Its tile, from AuthoredShips.cs — written out because the abort below must be able to tell THIS
// tool's own leftover order from a build that badges machines nobody ordered.
const MACHINE_TILE = [24, 2, 0];
const REASON_NO_ROUTE = 5;
const ORDER_REPAIR = 3;

// ───────────────────────── 1. the SIM's own truth, on an INDEPENDENT socket (never the page)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
// The lens is HOST state and is shared across tabs (`wire/session.js`) — a previous run leaves it
// selected. Reset it so nothing below is read through somebody else's wash.
ws.send(JSON.stringify({ cmd: 'lens', name: 'none' }));
await sleep(2500);

// ⭐ THE ACTUATION WITNESS'S BASELINE, taken before this tool has clicked anything at all — so every
// gesture it makes (including the retries) is inside the window the final check compares.
const devicesAtStart = deviceOpenState(latest);
log(`devices channel at boot: ${Object.keys(devicesAtStart).length} tile-resident devices witnessed`);

// ⚠️⚠️ A PREMISE, NOT A CHECK — AND THE DISTINCTION WAS MEASURED, NOT ANTICIPATED. Running this tool
// TWICE against the same `play.sh` reddened both controls, because the first run's order is still
// pending: `_prioritised` is per-SESSION host state and there is no cancel verb. (That is the
// package working — the badge outlived a page reload, a new browser and minutes of sim time — but it
// makes the second run's control meaningless.) So it ABORTS instead of failing: a contaminated run
// is INVALID, not red, and "the badge appears" proves nothing on a host where it already had.
const blockedAtBoot = latest.get('blocked')?.cells || [];
const noRouteAtBoot = blockedAtBoot.filter((c) => c[4] === REASON_NO_ROUTE);
log(`blocked channel at boot: ${blockedAtBoot.length} rows, ${noRouteAtBoot.length} of them no-route`);
// ⚠️ THE ABORT IS KEYED ON THIS TOOL'S OWN MACHINE, NOT ON "any no-route row" — and the narrowing is
// the point. Aborting on ANY row would swallow the failure the control exists to catch: a build that
// badges machines NOBODY ordered would look like a contaminated re-run and exit 2 instead of red.
// A row on THIS tile means the previous run's order is still pending; a row anywhere else is a
// genuine over-emission and must reach the check below.
if (noRouteAtBoot.some((c) => c[0] === MACHINE_TILE[0] && c[1] === MACHINE_TILE[1] && c[2] === MACHINE_TILE[2])) {
  console.error('ABORT: this host already carries a no-route row, so the control below cannot bite.\n'
    + '       Restart the game (./play.sh) and run this tool against a FRESH host — a previous run\'s\n'
    + '       order is still pending host-side and there is no cancel verb.');
  process.exit(2);
}
check(noRouteAtBoot.length === 0,
  `CONTROL — on a fresh host, with no order issued, NOT ONE machine carries the no-route reason `
  + `(saw ${noRouteAtBoot.length}). The wreck is full of unreachable machines; badging them unordered `
  + 'would be a permanent screenful of nags, so this is the leg that keeps the reason scoped to what '
  + 'the player pointed at');

// ───────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'dropped-order-shot-'));
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
  // Through the shared exit: this guard used to `process.exit` with the browser still running,
  // which is the leaked-Chrome OOM this package is FOR (see `die`'s header).
  if (!r.result?.data) die(chrome, 6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name); writeFileSync(p, Buffer.from(r.result.data, 'base64')); log('  wrote', p);
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
/** ⛔ IS A ROOM OPEN? ASK THE SURFACE'S STATE, NEVER "does `.rz-canvas` exist". MEASURED THE HARD WAY
 *  (2026-08-03, this lane): the node is in the DOM while the Room Zoom is SHUT, so
 *  `centre('.rz-canvas')` answers a ZERO-SIZE RECT — an object, and objects are truthy. A retry that
 *  settled on it would report the room "already open" and never click. `body.roomzoom-open` is the
 *  class the view sets; the `w > 0` term makes it a fact about layout rather than about markup. */
const roomIsOpen = async () => (await evaluate(
  `(()=>{const c=document.querySelector('.rz-canvas');const r=c&&c.getBoundingClientRect();`
  + `return (document.body.classList.contains('roomzoom-open')&&r&&r.width>0)?1:0;})()`)) === 1;

/** ⚠️ BACK OUT OF ANY OPEN ROOM — the focused room is HOST state (`wire/session.js`), and this rig
 *  ENTERS one. Called before the first read and after the last so a poisoned session cannot cross
 *  runs (or reach another rig sharing this host) in either direction. */
async function leaveRoomZoom() {
  for (let i = 0; i < 4; i++) {
    if (!(await roomIsOpen())) return;
    for (const type of ['keyDown', 'keyUp'])
      await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1200);
  }
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** Every blocked badge currently drawn in the Room Zoom, as {reason class, title}. The badge is the
 *  thing the player's eye receives; reading the wire again here would prove nothing about drawing. */
const badges = async () => json(`(()=>Array.from(document.querySelectorAll('.rz-blockeds > g')).map((g)=>({
  cls: g.getAttribute('class') || '', title: (g.querySelector('title')||{}).textContent || '' })))()`);
/** The VISIBLE key box's text — the surface that does not need a hover. */
const keyText = async () => evaluate(`(()=>{const e=document.querySelector('.rz-zonekey');`
  + `return (e && !e.hidden) ? (e.textContent||'') : '';})()`);
/** ⚠️ POLLED, NEVER SLEPT — the STEP-2 selection flake (filed by the dock-labels lane) is a fresh
 *  host answering a selection click late. A fixed sleep here reads whichever frame it lands on. */
async function pollFor(fn, ms = 20000, step = 500) {
  for (let i = 0; i * step < ms; i++) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
// THE ONBOARDING CARD, DISMISSED AND VERIFIED GONE (shared helper, 2026-08-03). The one-shot
// this replaces could SILENTLY SKIP a card that had not painted yet, and every click below
// then landed on a full-screen modal instead of the ship.
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });
// …and hand this run an OVERVIEW, whatever the last one left focused (see the START STATE header).
await leaveRoomZoom();

// ───────────────────────── 3. select the crew member, then open the frontier hall in Room Zoom.
log('\nSETUP — select the crew member and open ' + ANCHOR);
const crew = await pollFor(() => centre('.ov-crew'));
check(!!crew, 'the crew dock has a row to select');
// ⭐⭐ THE FILED DEFECT (HANDOVER "Tooling", 2026-08-03): this was ONE fire-and-forget click at
// `.ov-crew` plus `sleep(1500)`. Selection is HOST state and nothing latches it client-side —
// `crewRowClick` (hud.js:940) sends `Cmd.click` at the pawn's LAST-FRAME tile
// (`crewClickTarget`, console-model.js:166) and the host selects whoever is standing there WHEN THE
// COMMAND LANDS. She wanders, so one frame of staleness selects NOBODY, and a rig that then reports
// on the badge is reporting about a ship nobody is looking at. Waiting longer never un-misses a
// click; only re-deriving her row and clicking again does.
await verifiedClick({
  what: 'the HOST reports a crew member selected (frame.sel lands on a crew tile)',
  target: () => centre('.ov-crew'),
  settled: async () => selectedCrewCid(latest.get('frame')) != null,
  clickAt, log, chrome, timeoutMs: 30000, code: 9,
  diagnose: async () => ({ sel: latest.get('frame')?.sel, crew: latest.get('frame')?.crew }),
});
const hall = await pollFor(() => centre(`.pl-room[data-anchor="${ANCHOR}"]`));
check(!!hall, `the frontier hall ${ANCHOR} is on the Overview`);
if (!hall) { chrome.kill('SIGKILL'); process.exit(1); }
// VERIFIED, and it removes a CRASH-red as well as a false one: the old cut clicked once and polled
// for `.rz-canvas` WITHOUT ACTING ON THE ANSWER, so a room that did not open dereferenced null two
// steps later (`canvas.x`) — a TypeError reads as a broken tool, not as a finding (TRAPS 3).
await verifiedClick({
  what: `the Room Zoom opened on ${ANCHOR} (body.roomzoom-open + a laid-out canvas)`,
  target: () => centre(`.pl-room[data-anchor="${ANCHOR}"]`),
  settled: roomIsOpen,
  clickAt, log, chrome, timeoutMs: 25000, code: 10,
});
await sleep(1200);

const before = await badges();
log('  badges before the order:', JSON.stringify(before));
// No abort here: the WIRE premise above already refused a contaminated host, so anything drawn at
// this point is a genuine over-emission and belongs in the check, not in an exit code.
check(Array.isArray(before) && !before.some((b) => /no_route/.test(b.cls)),
  'CONTROL (on the drawn layer this time) — nothing in this room wears the no-route badge before '
  + 'the player orders anything');
await png('01-before-the-order.png');

// ───────────────────────── 4. THE ORDER — right-click the machine, take PRIORITISE: REPAIR.
// ⚠️ The right-click is dispatched as a DOM `contextmenu` event, not CDP's right mouse button:
// `Input.dispatchMouseEvent` with button:'right' does NOT synthesize the event `.rz-canvas` listens
// for (vacuum-shot.mjs measured this). And the probe grid is FINER than the tiles on purpose — a
// coarse grid skips tiles and reports "no machine here", which reads exactly like a broken menu.
log('\nTHE ORDER — right-click ' + MACHINE);
const canvas = await centre('.rz-canvas') || await centre('#roomzoom-view');
const GX = 26, GY = 18;
let menu = null;
outer:
for (let gy = 0; gy < GY; gy++) {
  for (let gx = 0; gx < GX; gx++) {
    const x = Math.round(canvas.x - canvas.w / 2 + (canvas.w * (gx + 0.5)) / GX);
    const y = Math.round(canvas.y - canvas.h / 2 + (canvas.h * (gy + 0.5)) / GY);
    await evaluate(`(()=>{const el=document.elementFromPoint(${x},${y});if(!el)return;`
      + `el.dispatchEvent(new MouseEvent('contextmenu',{clientX:${x},clientY:${y},bubbles:true,cancelable:true}));})()`);
    await sleep(60);
    const t = await evaluate(`(()=>{const e=document.querySelector('.rz-ctx');`
      + `return (e&&!e.hidden)?(e.textContent||''):'';})()`);
    if (t) { menu = t; break outer; }
  }
}
log('  menu:', JSON.stringify(menu));
check(!!menu && /PRIORITISE: REPAIR/.test(menu), 'the PRIORITISE offer opened over the machine');
const row = await centre('.rz-ctx-item');
check(!!row, 'the offer row is clickable');
if (!row) { chrome.kill('SIGKILL'); process.exit(1); }
// ⛔⛔ THE ONE RETRY IN THIS FILE THAT COULD MUTATE THE SHIP, AND IT IS GUARDED FOR THAT REASON. A
// re-click at a REMEMBERED offer-row position after the menu has closed is a plain left click on the
// Room Zoom canvas — which lands on a tile, and `ContextAction` toggles a device standing there
// (GameSession.cs:1936-1958). So the retry does BOTH things the house rule asks for: it re-derives
// `.rz-ctx-item` from the CURRENT frame every attempt, and it REFUSES TO CLICK AT ALL unless the
// menu is still open (the guard). The settle condition is the menu having CLOSED — the row consumed
// the gesture. Deliberately NOT "the order arrived on the wire": that is a PRODUCT claim (D5's own
// premise, §2.2 — the order is accepted) and folding it into a rig precondition would convert a
// real product failure into an exit code nobody reads as a finding (the 9th shape).
await verifiedClick({
  what: 'the PRIORITISE offer row took the click (the context menu closed)',
  target: () => centre('.rz-ctx-item'),
  // ⛔ POLARITY, BOTH WAYS ROUND, and it is why these are two expressions and not one negated. Each
  // asks for a LITERAL, so a failed `evaluate` (undefined — an unreadable page, a dead renderer) is
  // neither "closed" nor "open": the loop neither declares success nor fires a click into the room.
  settled: async () => (await evaluate("(()=>{const e=document.querySelector('.rz-ctx');return (e&&!e.hidden)?0:1;})()")) === 1,
  guard: async () => ((await evaluate("(()=>{const e=document.querySelector('.rz-ctx');return (e&&!e.hidden)?1:0;})()")) === 1
    ? null : 'the context menu is not open — a click now would land on the floor of the room'),
  clickAt, log, chrome, timeoutMs: 15000, everyMs: 500, code: 11,
});

// ───────────────────────── 5. ⭐ THE BADGE ARRIVES WHILE SHE IS STILL WALKING.
// ⚠️ HONEST SCOPE: this leg proves THE BADGE IS UP, not that it arrived BEFORE the drop. She is
// dropped at tick 171 (~17 sim-seconds) and the poll below runs for up to 20 s of wall clock at
// whatever speed the host is on, so it can legitimately first succeed after the abandon. The TIMING
// half — badged on the very frame after the click, while the job is still held — is asserted by
// `DroppedOrderTests.TheOrderIsAcceptedAndTheMachineIsBadgedTheVeryNextFrame`, which renders at
// tick 1 and cannot be raced.
log('\nOUTCOME 1 — the machine is badged');
const during = await pollFor(async () => {
  const b = await badges();
  return (b && b.some((x) => /no_route/.test(x.cls))) ? b : null;
}, 20000);
check(!!during,
  '⭐⭐ THE ORDER THE SIM CANNOT FINISH IS NAMED ON THE MACHINE. Before D5 the click produced a task '
  + 'label and then nothing at all — no badge, no toast, no reason anywhere');
log('  badges after the order:', JSON.stringify(during));
const key1 = await keyText();
log('  key box:', JSON.stringify(key1));
check(!!key1 && key1.includes(NO_ROUTE),
  `⭐ …and the VISIBLE key says it in words: "${NO_ROUTE}". A <title> needs a hover nobody knows to `
  + 'try and does not exist on a touch device — the key is the surface that discharges the silence');
check(!!key1 && /\d+ .*ORDER/.test(key1),
  'and it leads with the COUNT — "1 ORDER STUCK" is the fact that makes a player look');
// ⭐ WAS "OBSERVED, NOT CHECKED" — IT IS A CHECK NOW (D5 follow-on, 2026-08-03). This tool FILED the
// defect and the follow-on lane fixed it in the same file family, so the observation graduates rather
// than being deleted: `BLOCKED_ORDER_NAMES` was `['dig','strip','build']` with no entry at index 3,
// so `blockedOrderName(WireFormat.OrderRepair)` answered '' and BOTH surfaces fell through
// `decodeBlocked`'s unknown-order path — the key read "1 ORDER STUCK" and the badge title
// "ORDER BLOCKED — …" for a machine the player had explicitly told somebody to REPAIR.
check(/REPAIR/.test(key1 || ''),
  '⭐ the key names the VERB the player used — "1 REPAIR ORDER STUCK", not the generic "1 ORDER '
  + 'STUCK". A badge that will not say what kind of order it is about sends the player looking '
  + 'through the wrong panel');
check(!!during && during.some((b) => /NO WAY TO WALK/.test(b.title)),
  'the badge carries the same sentence in its <title> — one vocabulary, two surfaces');
await png('02-badged-while-she-walks.png');

// ───────────────────────── 6. ⭐⭐ THE HEADLINE — run past the drop; the badge is STILL THERE.
log('\nOUTCOME 2 — the sim drops the job, and the explanation stays on screen');
ws.send(JSON.stringify({ cmd: 'speed', delta: 2 }));
const tasks = [];
let awaiting = false;
for (let i = 0; i < 40 && !awaiting; i++) {
  await sleep(750);
  const t = (latest.get('roster')?.crew || [])[0]?.task || '';
  if (t && tasks[tasks.length - 1] !== t) tasks.push(t);
  if (/Awaiting orders/i.test(t)) awaiting = true;
}
ws.send(JSON.stringify({ cmd: 'speed', delta: -2 }));
log('  her task line, in order:', JSON.stringify(tasks));
check(awaiting,
  'PREMISE — the sim still drops the job and the dock still returns to "Awaiting orders". D5 is '
  + 'closed by SAYING SO, not by changing what the sim does (§2.2: the order is accepted)');
const after = await badges();
const keyAfter = await keyText();
log('  badges after the drop:', JSON.stringify(after));
check(!!after && after.some((b) => /no_route/.test(b.cls)),
  '⭐⭐⭐ THE PACKAGE: she is back to "Awaiting orders" and the machine STILL wears the reason. The '
  + 'order did not evaporate — the game is still telling the player why it could not land');
check(!!keyAfter && keyAfter.includes(NO_ROUTE),
  '…and the key box still says it, after the job that produced it is gone');
await png('03-still-badged-after-the-drop.png');

// ───────────────────────── 7. the wire agrees with the screen (one row, this reason, this order).
const cells = latest.get('blocked')?.cells || [];
const mine = cells.filter((c) => c[4] === REASON_NO_ROUTE);
log('  no-route rows on the wire:', JSON.stringify(mine));
check(mine.length === 1, `exactly ONE no-route row is on the wire (${mine.length}) — one ordered `
  + 'machine, one row, and automatic maintenance is still off this channel');
check(mine.every((c) => c[3] === ORDER_REPAIR), 'and it is a REPAIR-order row');
check(mine.every((c) => c[5] === -1), 'with DetailNone (-1) — this reason names no item');

// ═════════════════ 8. ⭐⭐ THE ACTUATION WITNESS — what did this rig's own clicks DO to the ship?
//
// ⛔ EVERY RETRY LOOP ABOVE BUYS ITS ROBUSTNESS WITH THIS RISK, so the risk is measured rather than
// argued. `Cmd.click(x,y)` runs `ContextAction` (GameSession.cs:475): a citizen on the tile SELECTS,
// otherwise the DEVICE on that tile is TOGGLED (:1936-1958) whenever the MOSS server is LIVE.
// ⭐ HOW REACHABLE, MEASURED (2026-08-03) — the first draft of this note said "doors/vents are
// gated, every other kind is not", AND THAT IS WRONG: BOTH commands open with
// `if (!MossGate.IsServerLive(sim)) return;` (Commands.cs:84 + its SetDoorState sibling), and
// ContextAction's `actuates` flag governs only the STATUS LINE. Driven: one click at each of the
// 49 deck-0 device tiles on the SHIPPED WRECK moved NOTHING (MOSS boots dark, `term_moss` 0.14
// under Terminal's 0.20 floor) — while the same sweep on a MOSS-LIVE ship (`--ship grid`) SHUT
// EIGHT DOORS (`kind 0 at 5,7,0: open 1 → 0`, and seven more). So the hazard is SHUT TODAY and
// OPENS the moment the player repairs `term_moss` — the game's own ladder. The witness is quiet
// now and will bite then; see `rig-lib.mjs`'s header for the full receipts.
// This rig orders a REPAIR on a machine; a stray click that also
// flipped a machine would make the badge it photographs a fact about the rig, not about the game.
//
// ⚠️ NON-VACUITY IS THE `witnessed > 0` TERM — an INCLUSION bound (4th shape), because an empty
// `devices` channel diffs empty and would pass for ever. Only tiles present in BOTH snapshots are
// compared: the channel is fog-gated, so an arriving row is new sight rather than a toggle.
const witnessed = Object.keys(devicesAtStart).length;
const actuated = actuationDiff(devicesAtStart, deviceOpenState(latest));
check(witnessed > 0 && actuated.length === 0,
  `THE RIG DID NOT ACTUATE THE SHIP IT PHOTOGRAPHED — ${witnessed} devices witnessed across the run, `
  + `${actuated.length} changed state${actuated.length ? ': ' + actuated.join(' · ') : ''}`);

await leaveRoomZoom();   // the focused room is HOST state — hand the session back on the Overview
chrome.kill('SIGKILL');
log(failures ? `\n${checks} checks run, ${failures} FAILED` : `\nall checks passed — ${checks} checks, 0 failures`);
process.exit(failures ? 1 : 0);
