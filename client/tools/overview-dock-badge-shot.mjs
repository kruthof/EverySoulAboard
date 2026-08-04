#!/usr/bin/env node
// ⭐⭐ D5 OVERVIEW — WHEN THE ORDER I GAVE IS STUCK, THE **OVERVIEW** SAYS SO, driven in REAL CHROME
// against the running game, on the SHIPPED wreck, unmodified.
//
// THE DEFECT THIS TOOL CLOSES, and its own predecessor is the witness: `dropped-order-shot.mjs` STEP 6
// asserts, as a PREMISE, that *"the dock still returns to 'Awaiting orders'"* while the machine wears
// the reason. That was honest — D5 closed the silence on the TILE — but the Level-1 Overview is the
// screen a first-hour player watches, and there the order simply evaporated. HANDOVER filed it as
// *"badge Room-Zoom-only (Overview dock bare)"* and named it a first-hour playtest risk.
//
// WHAT ONLY THIS TOOL CAN SEE. `DroppedOrderTests` pins that the wire row NAMES her and
// `client/test/overview-dock-badge.test.js` pins the join and the words — but there is no jsdom in
// this repo, so three claims are outside every node harness:
//   1. THE SENTENCE IS ACTUALLY IN THE OVERVIEW'S CREW DOCK, on the surface, in the running game.
//   2. ⭐ IT IS NOT CLIPPED INTO INVISIBILITY. The cell ellipsizes at ~26 characters and the M2-6
//      send-back was exactly that: a clause that measured invisible in both docks. `scrollWidth` vs
//      `clientWidth` is the only instrument that can answer it, and it needs a browser.
//   3. ⭐⭐ IT IS LIVE ON THIS SURFACE. Make the world stop agreeing and the reason must leave the
//      Overview — the dock, the fault colour and the readout line together. See SUPERSEDING_TILE for
//      which lever this uses and why it is not the door the D5 diagnosis names.
//
// USAGE
//   1. ./play.sh --host-port 8362 --client-port 8363 --no-open
//   2. node client/tools/overview-dock-badge-shot.mjs --host-port 8362 --client-port 8363 --out docs/design/shots
//
// ⚠️ IT NEEDS A FRESH HOST, for `dropped-order-shot.mjs`'s reason exactly: there is no cancel verb, so
// the order this tool issues stays pending for the life of the session and a second run against the
// same `play.sh` cannot tell "the badge appeared" from "the badge was already there". It ABORTS
// (exit 2) rather than reporting a green it has not earned.
// ⚠️ IT ALSO MUTATES THE SHIP, ON PURPOSE AND ONCE: STEP 6 issues a SECOND direct order. That is the
// live half's lever (see SUPERSEDING_TILE for why it is not the door), it is the last thing this tool
// does, and it is another reason the host is disposable after.
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free (the rule awaiting-shot.mjs / vacuum-shot.mjs state).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8362');
const CLIENT_PORT = +arg('client-port', '8363');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'overview-dock-badge-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9359');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0, checks = 0;
const check = (ok, what) => { checks += 1; log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// The client's own sentence for this reason, verbatim from `client/src/wire/messages.js`
// BLOCKED_REASON_TEXT.no_route — restated because this tool talks to a BROWSER and cannot import the
// module the page loaded. A mismatch fails the words legs loudly, which is the point.
const NO_ROUTE = 'NO WAY TO WALK TO IT';
const AWAITING = 'Awaiting orders';
const ANCHOR = 'hall_d0_s2';
const MACHINE = 'fabricator_1';
const MACHINE_TILE = [24, 2, 0];
// ⭐ THE LIVE HALF'S LEVER, AND IT IS NOT THE DOOR — read this before "fixing" it back.
// `MECHANICS` §13.25 b3 names `door_d0_s2` (27,7,0) as the one edit that restores the route, and this
// tool tried it first. IT CANNOT BE DONE FROM A BOOTED WRECK: since OD-N doors are actuated through
// MOSS only, and on `--ship wreck` the power is down at boot, so the host answers
// `MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; …` (the tail now names the terminal to repair
// and answers the verb that was refused — re-worded 2026-08-04, §13.47; the FACT this comment
// records, that the door cannot be actuated from a booted wreck, is unchanged). (The DOOR lever
// is driven headlessly instead, by `DroppedOrderTests.TheDoorOpensAgain_TheBadgeAndTheRecordBothGo`.)
// So the lever here is the OTHER world change the same live-re-ask rule governs, and it is a player
// gesture rather than a debug hook: A NEW ORDER THE SHIP CAN ACTUALLY RUN. `HandlePrioritise` clears
// `_dropped` for that crew member and files a fresh pending record, which the retire rule drops on
// the next render because this machine IS reachable — so the row goes, and with it both surfaces.
// `light_reactor` at (5,13,0) is two tiles from her boot position, inside the breathable core.
const SUPERSEDING_TILE = [5, 13, 0];
const SUPERSEDING_MACHINE = 'light_reactor';
const REASON_NO_ROUTE = 5;

// ───────────────────────── 1. the SIM's own truth, on an INDEPENDENT socket (never the page)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
ws.send(JSON.stringify({ cmd: 'lens', name: 'none' }));
await sleep(2500);

const rowsAtBoot = (latest.get('blocked')?.cells || []).filter((c) => c[4] === REASON_NO_ROUTE);
log(`no-route rows at boot: ${rowsAtBoot.length}`);
if (rowsAtBoot.some((c) => c[0] === MACHINE_TILE[0] && c[1] === MACHINE_TILE[1] && c[2] === MACHINE_TILE[2])) {
  console.error('ABORT: this host already carries a no-route row on ' + MACHINE + ', so the controls\n'
    + '       below cannot bite. Restart ./play.sh — a previous run\'s order is still pending and\n'
    + '       there is no cancel verb.');
  process.exit(2);
}

// ───────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'overview-dock-badge-shot-'));
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

/** ⭐ THE INSTRUMENT. Every Overview crew-dock task cell, with the BOX and the CONTENT measured —
 *  `clientWidth` is what the player can see, `scrollWidth` is what the string wants. A cell whose
 *  content overflows its box is ellipsized by CSS, and that is the M2-6 defect wearing a stylesheet.
 *  `cls` is read too, because the fault colour is half the signal. */
const dockCells = async () => json(`(()=>Array.from(document.querySelectorAll('.ov-crewtask')).map((e)=>({
  text: (e.textContent||''), cls: (e.getAttribute('class')||''),
  clientW: e.clientWidth, scrollW: e.scrollWidth, title: e.getAttribute('title')||'' })))()`);
/** The SELECTED readout's stuck-order line — the wide surface, where the whole sentence lives. */
const readoutLine = async () => evaluate(`(()=>{const e=document.querySelector('.ov-roblocked');`
  + `return (e && !e.hidden) ? (e.textContent||'') : '';})()`);
/** ⭐ …and its OWN box, measured rather than inherited from `.ov-task`'s number or derived from the
 *  island's CSS width. The repo's rule is that a count you did not measure yourself is not evidence,
 *  and this element's width was written down twice from two different derivations before anybody
 *  walked it. `clientWidth` is the content box; `scrollHeight > clientHeight`-free wrapping is the
 *  point of the element, so the WIDTH is the only number that has to be right. */
const readoutBox = async () => json(`(()=>{const e=document.querySelector('.ov-roblocked');if(!e)return null;`
  + `const t=document.querySelector('.ov-task');`
  + `return {roblockedW:e.clientWidth, taskW:t?t.clientWidth:-1, lines:Math.round(e.scrollHeight)};})()`);
/** The Room Zoom's drawn badges, so the LIVE half can be asserted on BOTH surfaces at once. */
const badges = async () => json(`(()=>Array.from(document.querySelectorAll('.rz-blockeds > g')).map((g)=>
  g.getAttribute('class')||''))()`);
async function pollFor(fn, ms = 20000, step = 500) {
  for (let i = 0; i * step < ms; i++) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}
/** Is the Overview showing? (ESC leaves the Room Zoom; verified rather than assumed — ten tools in
 *  this repo one-shot a dismissal and never checked it.) */
const overviewUp = async () => !!(await centre('.ov-crewtask'));

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

// ───────────────────────── 3. THE BASELINE — the dock before anything is ordered.
log('\nBASELINE — the Overview dock with no order given');
const crew = await pollFor(() => centre('.ov-crew'));
check(!!crew, 'the crew dock has a row');
if (!crew) { chrome.kill('SIGKILL'); process.exit(1); }
await clickAt(crew.x, crew.y);                       // select her, so the readout has a subject
await sleep(1500);
const before = await dockCells();
log('  dock cells:', JSON.stringify(before));
check(Array.isArray(before) && before.every((c) => !/\bblocked\b/.test(c.cls)),
  'CONTROL — before the player orders anything, NOT ONE dock row wears the fault state. The wreck is '
  + 'full of unreachable machines; a dock that nagged about them unordered would be a permanent lie');
check(before.some((c) => c.text.includes(AWAITING)),
  `PREMISE — the dock really does read "${AWAITING}" at boot (OD-H: every work type boots off). This `
  + 'is the sentence the package replaces, and without it the outcome below is about another state');
check(!(await readoutLine()), 'CONTROL — the selected readout carries no stuck-order line either');
await png('01-baseline-awaiting-orders.png');

// ───────────────────────── 4. THE ORDER — right-click the machine in the Room Zoom, take PRIORITISE.
log('\nTHE ORDER — open ' + ANCHOR + ' and right-click ' + MACHINE);
const hall = await pollFor(() => centre(`.pl-room[data-anchor="${ANCHOR}"]`));
check(!!hall, `the frontier hall ${ANCHOR} is on the Overview`);
if (!hall) { chrome.kill('SIGKILL'); process.exit(1); }
await clickAt(hall.x, hall.y);
await pollFor(() => centre('.rz-canvas'), 15000);

// ⚠️ The right-click is a DOM `contextmenu` event, not CDP's right button: `Input.dispatchMouseEvent`
// with button:'right' does NOT synthesize the event `.rz-canvas` listens for (vacuum-shot.mjs
// measured this). The probe grid is finer than the tiles on purpose.
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
check(!!menu && /PRIORITISE: REPAIR/.test(menu), 'the PRIORITISE offer opened over the machine');
const row = await centre('.rz-ctx-item');
check(!!row, 'the offer row is clickable');
if (!row) { chrome.kill('SIGKILL'); process.exit(1); }
await clickAt(row.x, row.y);
await sleep(1500);

// ───────────────────────── 5. ⭐⭐ THE OUTCOME — back on the OVERVIEW, the dock names the reason.
log('\nOUTCOME — leave the Room Zoom and read the Overview');
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
await sleep(1200);
check(await overviewUp(), 'the Room Zoom closed and the Overview is showing (verified)');

// Run past the drop, so this is the state the sighting photographed: no job, no hold, "Awaiting
// orders" territory. The reason must be on the Overview in BOTH halves of the order's life, and the
// dropped half is the one the defect was filed about.
ws.send(JSON.stringify({ cmd: 'speed', delta: 2 }));
const during = await pollFor(async () => {
  const cells = await dockCells();
  return (cells && cells.some((c) => c.text.includes(NO_ROUTE))) ? cells : null;
}, 25000);
ws.send(JSON.stringify({ cmd: 'speed', delta: -2 }));
log('  dock cells:', JSON.stringify(during));
check(!!during,
  `⭐⭐ THE PACKAGE: the Overview's crew dock says "${NO_ROUTE}" where it used to say "${AWAITING}". `
  + 'Before this, the order the player gave evaporated from the only screen they were looking at');

const cell = (during || []).find((c) => c.text.includes(NO_ROUTE));
check(!!cell && /\bblocked\b/.test(cell.cls),
  '…and the row wears the FAULT state, not the work state — amber means work is happening, and this '
  + 'is the opposite of that');
// ⭐ THE MEASUREMENT THE M2-6 SEND-BACK EXISTS FOR. `clientW > 0` is the non-vacuity term (the
// whyline-shot flake was a check that passed 0 > 0 against a hidden element).
check(!!cell && cell.clientW > 0,
  `NON-VACUITY — the dock cell is really on screen and has a box (clientWidth ${cell?.clientW}px). `
  + 'A hidden element measures 0 and every width assertion below would pass vacuously');
check(!!cell && cell.scrollW <= cell.clientW,
  `⭐ …AND IT IS NOT CLIPPED: the sentence wants ${cell?.scrollW}px in a ${cell?.clientW}px box. A `
  + 'reason the player can only read half of is the M2-6 defect wearing a stylesheet, and invisible '
  + 'feedback is FUNCTIONAL breakage (binding)');
check(!!cell && cell.title.includes(NO_ROUTE) && cell.title.length > NO_ROUTE.length,
  'the hover carries the reason AND the host\'s own task label — the fault and the activity are both '
  + 'true at once');

const line = await readoutLine();
log('  readout line:', JSON.stringify(line));
const box = await readoutBox();
log('  readout box :', JSON.stringify(box));
check(!!box && box.roblockedW > 0,
  `NON-VACUITY — .ov-roblocked has a real box (clientWidth ${box?.roblockedW}px)`);
check(!!box && box.roblockedW === box.taskW,
  `⭐ …and it is the SAME width as .ov-task (${box?.roblockedW}px vs ${box?.taskW}px). They are `
  + 'zero-padding siblings in one 298px island, so ONE number describes both — the comments and '
  + 'MECHANICS quote this figure and quoted the ISLAND\'s 298 until it was walked here');
check(!!line && line.includes(NO_ROUTE),
  '⭐ the SELECTED readout carries the whole sentence too — the wide surface, where a 45-character '
  + 'reason (NEEDS PARTS — …) is readable without a hover');
await png('02-the-overview-says-why.png');

// ───────────────────────── 6. ⭐⭐ THE LIVE HALF — the world stops agreeing; the reason must leave.
// The badge rule is LIVE RE-ASK, never a latch (MECHANICS §13.25 b3′). If the dock kept the sentence
// here, the Overview would be telling the player their order is stuck about a world that has moved
// on — and it would do it forever, since there is no timer anywhere. See SUPERSEDING_TILE above for
// why the lever is a second order rather than the door.
log('\nLIVE — order her onto ' + SUPERSEDING_MACHINE + ' at ' + JSON.stringify(SUPERSEDING_TILE));
const her = (latest.get('roster')?.crew || [])[0];
check(!!her && Number.isFinite(her.cid), 'the roster names the crew member this order is for');
// ⚠️ SENT ON THIS TOOL'S OWN SOCKET, and it is the SAME message the right-click emits
// (`{"cmd":"prioritise","cid":N,"x":..,"y":..,"deck":..}`, GameSession.cs:4963) — not a debug hook.
// The Room Zoom's context menu cannot be aimed at an arbitrary tile from here: this tool finds a
// machine by sweeping a probe grid until a menu opens, which is fine for "the one machine in this
// room" and useless for "that machine over there".
ws.send(JSON.stringify({ cmd: 'prioritise', cid: her?.cid, x: SUPERSEDING_TILE[0],
                         y: SUPERSEDING_TILE[1], deck: SUPERSEDING_TILE[2] }));
await sleep(2500);
const newTask = (latest.get('roster')?.crew || [])[0]?.task || '';
log('  her task now:', JSON.stringify(newTask));
check(/service|Servicing/i.test(newTask) && newTask.includes(SUPERSEDING_MACHINE),
  'PREMISE — the second order was ACCEPTED and the sim is running it. Without this the leg below is '
  + '"nothing changed, nothing changed" and proves nothing at all');

const gone = await pollFor(async () => {
  const cells = await dockCells();
  return (cells && !cells.some((c) => c.text.includes(NO_ROUTE))) ? cells : null;
}, 20000);
log('  dock cells after:', JSON.stringify(gone));
check(!!gone,
  '⭐⭐ THE REASON LEFT THE OVERVIEW THE MOMENT THE WORLD STOPPED AGREEING. The dock renders the '
  + "host's live row and remembers nothing — no latch, no fade, no timer");
check(!!gone && gone.every((c) => !/\bblocked\b/.test(c.cls)),
  '…and the fault colour went with the words, rather than a red row with an ordinary sentence in it');
check(!(await readoutLine()), '…and the readout\'s stuck-order line is gone too');
const wireAfter = (latest.get('blocked')?.cells || []).filter((c) => c[4] === REASON_NO_ROUTE);
check(wireAfter.length === 0,
  `and the WIRE agrees with the screen (${wireAfter.length} no-route rows left) — the host dropped `
  + 'the record, so the two surfaces went quiet because the FACT went away, not because the client '
  + 'decided to stop drawing it');
await png('03-superseded-the-overview-goes-quiet.png');

chrome.kill('SIGKILL');
log(failures ? `\n${checks} checks run, ${failures} FAILED` : `\nall checks passed — ${checks} checks, 0 failures`);
process.exit(failures ? 1 : 0);
