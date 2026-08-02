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

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
// commit message that nobody could reproduce from the file (it said 14; the all-pass path runs 16).
// A hand-counted number in prose is exactly the "count you did not measure yourself" this repo keeps
// getting caught by, so the run prints its own — and it counts CALLS, so a leg that never ran (the
// `else check(false, …)` arms below only fire when a leg is skipped) shows up as a smaller number.
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

// The onboarding card is a one-shot over everything; dismiss it before touching the lens rail.
for (let i = 0; i < 20; i++) {
  const onb = await centre('[data-onb-begin]');
  if (onb) { await clickAt(onb.x, onb.y); await sleep(1500); break; }
  await sleep(1000);
}

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
await clickAt(lensBtn.x, lensBtn.y);
await sleep(1500);
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
  await clickAt(pip1.x, pip1.y); await sleep(2000);
  const d1 = await washByAnchor();
  const reds = Object.values(d1 || {}).filter((f) => f === BAD).length;
  check(reds >= 4, `deck 1 reads as vacuum across the board (${reds} red compartments) — OD-E's dead deck `
    + 'finally LOOKS dead instead of looking unlensed');
  await png('03-pressure-lens-deck1.png');
} else check(false, 'no deck-1 pip on the rail — the dead-deck leg could not run');

// ───────────────────────── 6. THE READOUT carries a kPa reading.
log('\nREADOUT — the atmosphere box');
const pip0 = await centre('[data-ov-deck="0"]');
if (pip0) { await clickAt(pip0.x, pip0.y); await sleep(1500); }
const crew = await centre('.ov-crew');
if (crew) { await clickAt(crew.x, crew.y); await sleep(1500); }
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
  await clickAt(hall.x, hall.y);
  await sleep(3500);
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

chrome.kill('SIGKILL');
log(failures ? `\n${checks} checks run, ${failures} FAILED` : `\nall checks passed — ${checks} checks, 0 failures`);
process.exit(failures ? 1 : 0);
