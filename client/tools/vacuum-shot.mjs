#!/usr/bin/env node
// ⭐⭐ D4 — YOU CAN SEE THE VACUUM, driven in REAL CHROME against the running game.
//
// WHAT ONLY THIS TOOL CAN SEE. `client/test/vacuum-visible.test.js` pins the pure models and
// `tests/Perilune.Tests/VacuumIsVisibleTests.cs` pins the host's payloads — but there is no jsdom in
// this repo, so four of this package's claims are outside every node harness:
//   1. THE WASH RECT IS ACTUALLY EMITTED OVER THE AIRLESS COMPARTMENT AND IS ACTUALLY RED. A grade
//      the player cannot see is indistinguishable from no grade (invisible-feedback-is-FUNCTIONAL,
//      binding, three owner reports). The overlay is built in `overview-view.js`'s `lensOverlaySvg`,
//      which no node test reaches.
//   2. IT IS A CHANGE UNDER A CHANGED INPUT, not a picture: the same compartments are read with the
//      lens OFF and ON, and against the PRESSURISED rooms on the same deck.
//   3. THE READOUT'S ATMOSPHERE BOX SHOWS A kPa READING at all — the box that used to HIDE ITSELF
//      for a crew member standing in a vacuum.
//   4. THE PRIORITISE MENU, over the real machine finding D4 was measured on, says NO AIR.
//
// USAGE
//   1. ./play.sh --host-port 8360 --client-port 8361 --no-open
//   2. node client/tools/vacuum-shot.mjs --out docs/design/shots [--host-port 8360] [--client-port 8361]
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free (the same rule awaiting-shot.mjs / moss-shot.mjs state).
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ 2026-08-03 — THE START STATE THIS RIG NEEDS, SAID OUT LOUD (rig-hardening lane).
//
// ⛔ A WARM HOST IS NOT A CLEAN ONE, and this tool measures PER-STATE CELLS (lens off vs lens on,
// deck 0 vs deck 1), so a leftover from the previous run is a wash it did not put there. `wire/
// session.js` is explicit — *"single-session by design: deck/lens/speed/cursor/selection are shared
// across tabs"* — and the FOCUSED ROOM is host state too. This rig therefore PROVES ITS RESET rather
// than demanding a fresh host, and does it on its OWN socket / its own keystrokes, never by hoping:
//   · LENS   → `{cmd:'lens',name:'none'}` below, then the CONTROL leg re-measures that nothing is
//              washed (an INCLUSION bound: ≥ 4 compartments answered).
//   · ROOM   → `leaveRoomZoom()` before the first read AND after the last. Section 7 ENTERS a room
//              and the previous cut never left it, so run 2 of this tool booted straight into the
//              Room Zoom, where there is no `.pl-room` to wash and the CONTROL read `{}`.
//   · DECK   → driven and VERIFIED against `frame.deck` on this socket, not assumed from a pip click.
//   · SELECT → re-established by `verifiedClick`, which re-clicks until the HOST says she is chosen.
// The one thing it cannot reset is a PENDING ORDER (there is no cancel verb) — section 7 issues one,
// so the OBSERVED task line there is a second-run-sensitive observation and is not a check.
//
// ⭐ AND THE RIG NOW WITNESSES WHAT ITS OWN CLICKS DID TO THE SHIP. `Cmd.click` reaches
// `ContextAction`, which TOGGLES the device on the clicked tile when no citizen is standing there
// (GameSession.cs:1936-1958 — gated by a LIVE MOSS server; the measured receipts are in the witness
// section at the foot of this file). A rig that re-clicks a walking pawn can actuate the ship it
// then photographs, so the `devices` channel is fingerprinted before the first gesture and compared
// after the last — see the final check.

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
const PREFIX = arg('prefix', 'vacuum-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9351');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0, checks = 0;
// ⚠️ THE COUNT IS EMITTED, NOT CLAIMED. The first cut of this package quoted a check count in its
// commit message that nobody could reproduce from the file (it said 14; the all-pass path ran 16).
// A hand-counted number in prose is exactly the "count you did not measure yourself" this repo keeps
// getting caught by, so the run prints its own — and it counts CALLS, so a leg that never ran (the
// `else check(false, …)` arms below only fire when a leg is skipped) shows up as a smaller number.
//   ⛔ …AND THIS COMMENT WENT STALE ANYWAY, WHICH IS THE JOKE AND THE LESSON (2026-08-03, caught in
//   review of the rig-hardening lane). The number above stayed at 16 after the actuation witness
//   added a seventeenth check, so the paragraph warning against unmeasured counts was itself
//   carrying one. The all-pass path is 17, RE-MEASURED off four runs of this tool on a fresh host
//   (`17 checks, 0 failures` each) rather than counted by eye — and the standing instruction is: do
//   not update this sentence from the diff, run the tool and read its own last line.
const check = (ok, what) => { checks += 1; log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// The two washes, verbatim from `overview-model.js`'s GRADE_TINT — restated because this tool talks
// to a BROWSER and cannot import the module the page loaded. A mismatch fails the fill legs loudly.
const BAD = 'rgba(194,90,63,.30)';
const GOOD = 'rgba(90,167,127,.22)';

// ───────────────────────── 1. the SIM's own truth, on an INDEPENDENT socket (never the page)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
// ⚠️ THE LENS IS HOST STATE, NOT PAGE STATE — `wire/session.js`: *"single-session by design:
// deck/lens/speed/cursor/selection are shared across tabs."* A previous run of this tool that
// selected PRESSURE leaves it selected on the host, so the control below would boot with the wash
// already on. Reset it here, on this tool's own socket, before anything is read.
ws.send(JSON.stringify({ cmd: 'lens', name: 'none' }));
await sleep(2500);

// ⭐ THE ACTUATION WITNESS'S BASELINE, taken before this tool has clicked anything at all. Compared
// against the same reading at the end — the final check. Taken here rather than after Chrome starts
// so that EVERY gesture this rig makes is inside the window.
const devicesAtStart = deviceOpenState(latest);
log(`devices channel at boot: ${Object.keys(devicesAtStart).length} tile-resident devices witnessed`);

const rooms = latest.get('rooms')?.rooms || [];
const airless = rooms.filter((r) => r[4] === 0);
const live = rooms.filter((r) => r[4] > 50);
log(`rooms channel: ${rooms.length} rows — ${airless.length} at 0 kPa, ${live.length} pressurised`);
check(rooms.length > 0, 'the `rooms` channel carries rows at all');
check(airless.length >= 2, `⭐ AIRLESS COMPARTMENTS ARE ON THE WIRE (${airless.length}). Before D4 the `
  + 'host skipped every room with no moles, so these shipped NOTHING and the client could not tell '
  + '"vacuum" from "the channel has not arrived"');
check(live.length >= 1, 'and the pressurised rooms are still there — the airless rows JOINED them');
const deck0Airless = airless.find((r) => r[1] === 0);
check(!!deck0Airless, 'at least one airless compartment is on DECK 0, the deck the game opens on');
log('  deck-0 airless anchor:', deck0Airless?.[0], '@', deck0Airless?.[4], 'kPa');

// ───────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'vacuum-shot-'));
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
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** ⛔ IS A ROOM OPEN? ASK THE SURFACE'S STATE, NEVER "does `.rz-canvas` exist". MEASURED THE HARD WAY
 *  (2026-08-03): the node is in the DOM while the Room Zoom is SHUT, so `centre('.rz-canvas')`
 *  answers a ZERO-SIZE RECT — an object, and objects are truthy. A retry that settled on it reported
 *  the room "already open", never clicked, and three legs below then swept a 0x0 box and failed as
 *  if the PRIORITISE menu were broken. `body.roomzoom-open` is the class the view itself sets, and
 *  the `w > 0` term makes the answer a fact about layout rather than about markup. */
const roomIsOpen = async () => (await evaluate(
  `(()=>{const c=document.querySelector('.rz-canvas');const r=c&&c.getBoundingClientRect();`
  + `return (document.body.classList.contains('roomzoom-open')&&r&&r.width>0)?1:0;})()`)) === 1;

/** ⚠️ BACK OUT OF ANY OPEN ROOM — the focused room is HOST state (`wire/session.js`), so section 7
 *  leaving one open boots the NEXT run straight into the Room Zoom, where there is no `.pl-room` to
 *  wash and the CONTROL leg reads `{}`. Called before the first read and after the last, so a
 *  poisoned session cannot cross runs in either direction. (why-line-shot.mjs's `leaveRoomZoom`.) */
async function leaveRoomZoom() {
  for (let i = 0; i < 4; i++) {
    if (!(await roomIsOpen())) return;
    for (const type of ['keyDown', 'keyUp'])
      await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1200);
  }
}

/** Every lens wash rect, keyed by the compartment it covers — joined on the SVG geometry, so this is
 *  the fill the player's eye actually receives over that anchor, never a re-derivation. */
const washByAnchor = async () => json(`(()=>{
  const wash = Array.from(document.querySelectorAll('.pl-lens rect'));
  const out = {};
  for (const g of document.querySelectorAll('.pl-room[data-anchor]')) {
    const b = g.getBBox();
    const hit = wash.find((r) => Math.abs(+r.getAttribute('x') - b.x) < 1.5 && Math.abs(+r.getAttribute('y') - b.y) < 1.5);
    out[g.dataset.anchor] = hit ? hit.getAttribute('fill') : null;
  }
  return out;
})()`);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// THE ONBOARDING CARD, DISMISSED AND VERIFIED GONE (shared helper, 2026-08-03). The one-shot
// this replaces could SILENTLY SKIP a card that had not painted yet, and every click below
// then landed on a full-screen modal instead of the ship.
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });
// …and hand this run an OVERVIEW, whatever the last one left focused (see the START STATE header).
await leaveRoomZoom();

// ───────────────────────── 3. THE CONTROL: lens OFF. No wash anywhere.
log('\nCONTROL — no lens selected');
// ⚠️ POLLED, NOT A FIXED SLEEP. The Overview's first paint can land after the card is dismissed, and
// an empty stage answers `{}` — whose `.every()` is VACUOUSLY TRUE, so a fixed sleep would report a
// PASS for a page with nothing on it (CLAUDE.md trap 3, and the 4th shape). Wait for the
// compartments to exist before reading anything off them.
let off = null;
for (let i = 0; i < 20; i++) {
  off = await washByAnchor();
  if (off && Object.keys(off).length >= 4) break;
  await sleep(1000);
}
log('  wash with no lens:', JSON.stringify(off));
check(off && Object.keys(off).length >= 4 && Object.values(off).every((v) => v === null),
  'with no lens selected NOTHING is washed — so a wash below is the LENS and not the floor art');
await png('01-no-lens.png');

// ───────────────────────── 4. THE OUTCOME: the PRESSURE lens paints the airless halls RED.
log('\nOUTCOME — the PRESSURE lens');
const lensBtn = await centre('[data-ov-lens="pressure"]');
check(!!lensBtn, 'the PRESSURE lens button is on the rail');
// ⭐ VERIFIED, NOT FIRED. The lens is HOST state and it comes back on `frame.lens` — this tool's own
// socket, not the page it is testing. A single click + `sleep(1500)` that missed (or that landed
// while the rail was still being reconciled) produced NO wash, and every leg below then reported the
// LENS as broken: a red for the wrong reason, on an instrument nothing gates.
await verifiedClick({
  what: 'the HOST switched to the PRESSURE lens (frame.lens)',
  target: () => centre('[data-ov-lens="pressure"]'),
  settled: async () => latest.get('frame')?.lens === 'pressure',
  clickAt, log, chrome, timeoutMs: 20000, code: 7,
  diagnose: async () => ({ lens: latest.get('frame')?.lens }),
});
await sleep(800);                                    // one repaint after the host agreed
const on = await washByAnchor();
log('  wash by anchor:', JSON.stringify(on));
const wireDeck0 = new Map(rooms.filter((r) => r[1] === 0).map((r) => [r[0], r[4]]));
let redAirless = 0, greenLive = 0; const wrong = [];
for (const [anchor, fill] of Object.entries(on || {})) {
  if (!wireDeck0.has(anchor)) continue;              // another deck's slot, or no row at all
  const kPa = wireDeck0.get(anchor);
  if (kPa === 0) { if (fill === BAD) redAirless += 1; else wrong.push(`${anchor} @0 kPa is ${fill}`); }
  else if (kPa > 50) { if (fill === GOOD) greenLive += 1; else wrong.push(`${anchor} @${kPa} kPa is ${fill}`); }
}
check(redAirless >= 1, `⭐⭐ AN AIRLESS HALL IS PAINTED RED (${redAirless} of them). This is the package's `
  + 'headline: before D4 the pressure lens painted NOTHING over a vacuum, which on screen is the '
  + 'same picture as having no lens selected at all');
check(greenLive >= 1, `…and a pressurised compartment is painted GREEN on the same deck (${greenLive}) — `
  + 'the lens is grading, not flooding');
check(wrong.length === 0, 'every washed compartment agrees with the wire: ' + (wrong.join(' · ') || 'none disagree'));
await png('02-pressure-lens-deck0.png');

// ───────────────────────── 5. DECK 1 — the wreck's dead deck, all vacuum.
log('\nDECK 1 — the dead deck');
const pip1 = await centre('[data-ov-deck="1"]');
if (pip1) {
  // VERIFIED against `frame.deck` on this tool's own socket. A pip click that did not land leaves
  // DECK 0 on screen, whose compartments are mostly pressurised — so the leg below would count 1-2
  // reds and report the DEAD DECK as broken, when what actually failed was the rig's own gesture.
  await verifiedClick({
    what: 'the HOST switched to deck 1 (frame.deck)',
    target: () => centre('[data-ov-deck="1"]'),
    settled: async () => (latest.get('frame')?.deck | 0) === 1,
    clickAt, log, chrome, timeoutMs: 20000, code: 7,
    diagnose: async () => ({ deck: latest.get('frame')?.deck }),
  });
  await sleep(1200);
  const d1 = await washByAnchor();
  const reds = Object.values(d1 || {}).filter((f) => f === BAD).length;
  check(reds >= 4, `deck 1 reads as vacuum across the board (${reds} red compartments) — OD-E's dead deck `
    + 'finally LOOKS dead instead of looking unlensed');
  await png('03-pressure-lens-deck1.png');
} else check(false, 'no deck-1 pip on the rail — the dead-deck leg could not run');

// ───────────────────────── 6. THE READOUT carries a kPa reading.
log('\nREADOUT — the atmosphere box');
const pip0 = await centre('[data-ov-deck="0"]');
if (pip0) {
  await verifiedClick({
    what: 'the HOST switched back to deck 0 (frame.deck)',
    target: () => centre('[data-ov-deck="0"]'),
    settled: async () => (latest.get('frame')?.deck | 0) === 0,
    clickAt, log, chrome, timeoutMs: 20000, code: 7,
    diagnose: async () => ({ deck: latest.get('frame')?.deck }),
  });
  await sleep(1000);
}
// ⭐⭐ THE FILED DEFECT (HANDOVER "Tooling", 2026-08-03): this was ONE fire-and-forget click at
// `.ov-crew` followed by `sleep(1500)`, and it is the same shape the why-line rig's STEP-2 flake
// turned out to be. Selection is HOST state and the gesture is not latched client-side:
// `crewRowClick` (hud.js:940) reads the pawn's tile out of the LAST FRAME IT RECEIVED
// (`crewClickTarget`, console-model.js:166) and sends `Cmd.click(x,y)`; the host selects whoever
// stands there WHEN THE COMMAND LANDS. She WANDERS on this ship (deck-confined idle wander), so one
// frame of staleness and the click selects NOBODY — the atmosphere box then stays `hidden` through
// the 30 s poll below and THREE checks red, blaming D4's readout for a gesture the rig fumbled.
// Waiting longer could never fix it: a click that already landed on empty floor does not un-miss.
await verifiedClick({
  what: 'the HOST reports a crew member selected (frame.sel lands on a crew tile)',
  target: () => centre('.ov-crew'),
  settled: async () => selectedCrewCid(latest.get('frame')) != null,
  clickAt, log, chrome, timeoutMs: 30000, code: 9,
  diagnose: async () => ({ sel: latest.get('frame')?.sel, crew: latest.get('frame')?.crew }),
});
// ⚠️ POLLED: she WANDERS (deck-confined idle wander), and the readout's CURRENT ROOM join is null
// while she stands on a spine tile belonging to no bound compartment. A fixed sleep here reads
// whichever tile she happened to be on, which is a coin flip rather than a measurement.
for (let i = 0; i < 30; i++) {
  const hidden = await evaluate(`!!document.querySelector('.ov-ro-atmos')?.hidden`);
  if (!hidden) break;
  await sleep(1000);
}
const atmos = await json(`(()=>{const e=document.querySelector('.ov-ro-atmosB');const box=document.querySelector('.ov-ro-atmos');`
  + `const nm=document.querySelector('.ov-selN');const rl=document.querySelector('.ov-selR');`
  + `return e?{text:e.textContent,hidden:!!(box&&box.hidden),who:nm&&nm.textContent,where:rl&&rl.textContent}:null;})()`);
log('  atmos row B:', JSON.stringify(atmos));
check(!!atmos && !atmos.hidden, 'the atmosphere box is SHOWN for the selected crew member');
check(/kPa/.test(atmos?.text || ''), '⭐ …and it carries a kPa reading, which it never did before D4 — '
  + 'the one number that says a compartment is empty was on the wire and on no surface');
check(!/,\d/.test(atmos?.text || ''), 'the reading uses a decimal POINT (this dev machine is de-DE)');
await png('04-readout-kpa.png');

// ───────────────────────── 7. THE DEMO'S OWN CASE: right-click a machine standing in a vacuum.
// `fabricator_1` stands in `hall_d0_s2` — the airless hall of AuthoredShips' "frontier" block, and
// the very machine finding D4 was measured on.
log('\nTHE ORDER — right-click a machine standing in a vacuum');
ws.send(JSON.stringify({ cmd: 'lens', name: 'none' }));
const hall = await centre('.pl-room[data-anchor="hall_d0_s2"]');
if (!hall) {
  check(false, 'the airless frontier hall is not on screen — the order leg cannot run');
} else {
  // VERIFIED, and it removes a CRASH-red as well as a false one: the old cut clicked once, slept
  // 3500 ms and then read `centre('.rz-canvas')`, whose null was dereferenced two lines later
  // (`canvas.x`) — a TypeError, which reads as a broken tool rather than as a room that would not
  // open (TRAPS 3: a crash is not the semantic red).
  await verifiedClick({
    what: 'the Room Zoom opened on the airless frontier hall (body.roomzoom-open + a laid-out canvas)',
    target: () => centre('.pl-room[data-anchor="hall_d0_s2"]'),
    settled: roomIsOpen,
    clickAt, log, chrome, timeoutMs: 25000, code: 10,
  });
  await sleep(1200);
  // ⚠️ THE RIGHT-CLICK IS DISPATCHED AS A DOM `contextmenu` EVENT, not as CDP's right mouse button.
  // `Input.dispatchMouseEvent` with `button:'right'` presses and releases the button; it does NOT
  // synthesize the `contextmenu` event `.rz-canvas` listens for (measured — the first version of
  // this leg probed and opened nothing). The event carries real `clientX/Y`, so the view's own
  // `tileFromCanvasXY` resolves the tile exactly as it does for a player.
  // ⚠️ AND THE GRID IS FINER THAN THE ROOM, DELIBERATELY: a 13x9 probe over a 12x8-tile compartment
  // steps ~117 px across ~85 px tiles and SKIPS TILES — measured, it walked past `fabricator_1` and
  // reported "no machine here", which reads exactly like the menu being broken.
  const canvas = await centre('.rz-canvas') || await centre('#roomzoom-view');
  const GX = 26, GY = 18;
  let menu = null, at = null;
  outer:
  for (let gy = 0; gy < GY && !menu; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      const x = Math.round(canvas.x - canvas.w / 2 + (canvas.w * (gx + 0.5)) / GX);
      const y = Math.round(canvas.y - canvas.h / 2 + (canvas.h * (gy + 0.5)) / GY);
      await evaluate(`(()=>{const el=document.elementFromPoint(${x},${y});if(!el)return;`
        + `el.dispatchEvent(new MouseEvent('contextmenu',{clientX:${x},clientY:${y},bubbles:true,cancelable:true}));})()`);
      await sleep(60);
      const t = await evaluate(`(()=>{const e=document.querySelector('.rz-ctx');`
        + `return (e&&!e.hidden)?(e.textContent||''):'';})()`);
      if (t) { menu = t; at = { x, y }; break outer; }
    }
  }
  log('  menu:', JSON.stringify(menu), 'at', JSON.stringify(at));
  check(!!menu, 'a PRIORITISE menu opened over a machine in the airless hall');
  check(/NO AIR AT THE WORKSITE/.test(menu || ''),
    '⭐⭐ THE OFFER NAMES THE HAZARD BEFORE THE ORDER EXISTS: "' + menu + '". In the M3 demo this row '
    + 'read PRIORITISE: REPAIR … and nothing else, and the pawn who took it walked in and died');
  check(/PRIORITISE: REPAIR/.test(menu || ''),
    '…and it is STILL AN OFFER — D4 is not a refusal and not a confirm dialog (rung 2: the player '
    + 'ordered her in, and rung 4 is why that means something)');
  await png('05-offer-names-the-hazard.png');

  // ⛔ THE ORDER IS GIVEN AND THE OUTCOME IS *OBSERVED, NOT CHECKED*, because the thing that stops
  // it is a defect that is not this package's. `PrioritiseJobCommand` ACCEPTS the order (her task
  // flips to "Servicing fabricator_1") and the job is then dropped before she leaves the cryobay,
  // so she never enters the hall. Measured on this tree, unmodified, at 100x and at 1000x: accepted,
  // then back to "Awaiting orders" inside a sim-minute, with no refusal anywhere. That is
  // HANDOVER's already-filed GENERAL defect D5 — *"PrioritiseJobCommand accepts-then-silently-
  // drops"* — and turning it into a FAILING D4 check would report another package's bug under this
  // package's name. The NO-AIR clause itself is driven and asserted in
  // `VacuumIsVisibleTests.AHeldWorkerInAVacuumIsToldSo_AndNobodyElseIs`, where the hold is staged by
  // hand and no dispatcher can take it away.
  const row = await centre('.rz-ctx-item');
  if (row) {
    await clickAt(row.x, row.y);
    ws.send(JSON.stringify({ cmd: 'speed', delta: 2 }));
    const seen = [];
    for (let i = 0; i < 20; i++) {
      await sleep(750);
      const t = (latest.get('roster')?.crew || [])[0]?.task || '';
      if (t && seen[seen.length - 1] !== t) seen.push(t);
      if (/NO AIR/.test(t)) break;
    }
    log('  OBSERVED (not a check) — her task line after the order:', JSON.stringify(seen));
    log(/NO AIR/.test(seen.join('|'))
      ? '  ⭐ she reached the vacuum and her line said NO AIR'
      : '  ⚠️ she never reached the hall — HANDOVER\'s filed D5 (accepted, then dropped). The clause '
        + 'is asserted in VacuumIsVisibleTests instead.');
    ws.send(JSON.stringify({ cmd: 'speed', delta: -2 }));
    await png('06-after-the-order.png');
  } else check(false, 'the menu row was not clickable — the order leg could not run');
}
await leaveRoomZoom();   // the focused room is HOST state — hand the session back on the Overview

// ═════════════════ 8. ⭐⭐ THE ACTUATION WITNESS — what did this rig's own clicks DO to the ship?
//
// ⛔ THE HAZARD IS NOT HYPOTHETICAL AND IT IS THE PRICE OF EVERY RETRY LOOP ABOVE. `Cmd.click(x,y)`
// runs `GameSession.ContextAction` (GameSession.cs:475): a citizen on the tile SELECTS, and
// otherwise a device on that tile is TOGGLED (:1936-1958) — whenever the MOSS server is LIVE, which
// is the gate BOTH commands open with (Commands.cs:84; ContextAction's `actuates` flag only picks
// the status line). ⭐ MEASURED, not assumed: one click at each of the 49 deck-0 device tiles on the
// SHIPPED WRECK moved NOTHING (MOSS boots dark there), while the same sweep on a MOSS-LIVE ship
// (`--ship grid`) SHUT EIGHT DOORS — `kind 0 at 5,7,0: open 1 → 0` and seven more. The wreck reaches
// that state the moment the player repairs `term_moss`, which is the game's own ladder. The crew-row
// gesture aims at the pawn's LAST-FRAME tile, so a rig that re-clicks a walker can flip a device and
// then photograph a ship it changed itself — a GREEN run that is evidence about the wrong world.
//
// ⚠️ NON-VACUITY IS THE `witnessed > 0` TERM, and it is an INCLUSION bound (4th shape): an empty
// `devices` channel diffs empty and would pass for ever. Only tiles present in BOTH snapshots are
// compared — the channel is fog-gated, so an arriving row is new sight, not a toggle.
const witnessed = Object.keys(devicesAtStart).length;
const actuated = actuationDiff(devicesAtStart, deviceOpenState(latest));
check(witnessed > 0 && actuated.length === 0,
  `THE RIG DID NOT ACTUATE THE SHIP IT PHOTOGRAPHED — ${witnessed} devices witnessed across the run, `
  + `${actuated.length} changed state${actuated.length ? ': ' + actuated.join(' · ') : ''}. A stale `
  + 'click that lands on a device tile toggles it through ContextAction, so a green run with a moved '
  + 'device is a run whose screenshots are of the rig\'s own doing');

chrome.kill('SIGKILL');
log(failures ? `\n${checks} checks run, ${failures} FAILED` : `\nall checks passed — ${checks} checks, 0 failures`);
process.exit(failures ? 1 : 0);
