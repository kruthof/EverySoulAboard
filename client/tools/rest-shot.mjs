#!/usr/bin/env node
// ⭐⭐ M3-9 — "SHE WORKS, FINISHES, SLEEPS, WAKES, WORKS", driven in real Chrome against the running
// game. This is the package's acceptance script, automated so a reviewer can re-run it instead of
// re-watching it.
//
// WHAT ONLY THIS TOOL CAN SEE. `RestSystemTests` drives the sim directly and proves the claim, the
// no-interrupt rule, the bed-vs-deck rates and the wear path. None of that can see:
//   1. THAT THE PLAYER CAN GET A BUNK AT ALL. `--ship wreck` calls `RoomDresser.Dress` deliberately
//      not at all, so THERE IS NOT ONE BED ABOARD; the whole bed branch reaches a player only
//      through the Room Zoom's BUNK tool. A `DeviceKind` on a whitelist with no working button is a
//      def row, and no C# test can tell the difference (M3-10 found `place` INERT for all six
//      furniture tools exactly this way).
//   2. THAT THE TASK LINE SAYS IT. The acceptance's own sentence is *"the crew dock's task line says
//      so at each step"* — `Heading to sleep at …` → `Sleeping in bunk_…` → back to work. A label
//      the player cannot read is indistinguishable from a broken verb (this repo's standing rule).
//   3. THAT THE WHOLE ARC HAPPENS IN ONE UNBROKEN RUN at the game's own speeds, on the shipping
//      ship, with nothing injected into the sim.
//
// ⚠️ THE VERDICTS COME FROM AN INDEPENDENT SOCKET, NOT FROM THE DOM. This tool opens its own
// WebSocket to the host and reads the `roster` channel's own `task` string and the `devices`
// channel's own rows, so "she is asleep in a bunk" is the SIM's answer and not a label the client
// painted. The DOM is used for the gestures and for the pictures.
//
// ⚠️⚠️ TWO THINGS ARE DRIVEN AND NOT PLAYED, AND BOTH ARE SAID OUT LOUD (the heater-shot.mjs /
// pod-bay-shot.mjs precedent, verbatim in technique and in disclosure).
//
// (A) THE PRICE OF THE BUNK. `build.def device_place_cost = 3` PARTS and `--ship wreck` authors ONE
//     Parts on the ground, which MaintenanceSystem spends unattended inside the first sim-day. That
//     is `PlaceDeviceCommand`'s documented all-or-nothing behaviour, it refuses SILENTLY, and it is
//     M3-10's already-FILED owner item — not a defect in this package. So `--prep` writes a
//     TEMPORARY defs overlay in which `device_place_cost = 0` and NOTHING else changes, and the
//     placement then goes through the ordinary `place` wire command the palette click sends.
//     ⇒ ⭐ A reviewer who wants the unmodified price plays the matter ladder first; the SLEEP arc
//     below is identical either way, because the ONLY thing the overlay buys is the bunk.
//     ⇒ ⭐ AND THE DECK BRANCH NEEDS NO OVERLAY AT ALL: run with `--no-bunk` and she sleeps on the
//     deck of the unmodified shipping wreck, which is what a player sees today.
//
// (B) THE TIME. A crew member crosses needs.def `fatigue_rest_threshold` (0.75) after TWELVE
//     sim-hours, and the sleep itself is another ~7.9 sim-h in a bed or ~9.8 on the deck (MEASURED
//     on the shipped stack; §4.4's 10.5 h is the FULL 1.0 → 0 case, not this one). This
//     harness therefore FAST-FORWARDS with the
//     game's own speed control — the `speed` wire command the player's own `+`/`-` keys send — and
//     nothing else. No defs are patched for time, no ship is edited, no fatigue is injected.
//
// USAGE
//   1. node client/tools/rest-shot.mjs --prep            # writes the temp defs, prints the host cmd
//   2. <the printed host command>                         # and, beside it: python3 client/serve.py 8471
//   3. node client/tools/rest-shot.mjs --out docs/design/shots
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free (the moss-shot.mjs / heater-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { decodeDecks, decodeRooms, decodeDevices } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  deckSlots, roomTileRect, roomScene, sceneFit, scenePlacement,
} from '../src/ui/room-model.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8470');
const CLIENT_PORT = +arg('client-port', '8471');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'rest-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9376');
const NO_BUNK = process.argv.includes('--no-bunk');   // the DECK branch, on the unmodified ship
const MAX_WAIT_S = +arg('max-wait-s', '420');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

let failures = 0;
const check = (ok, what) => { log((ok ? '  ✓ ' : '  ✗ FAIL ') + what); if (!ok) failures++; return ok; };

const REPO = resolve(new URL('../..', import.meta.url).pathname);

// ───────────────────────────── --prep: the temp defs overlay, and nothing else
if (process.argv.includes('--prep')) {
  const src = join(REPO, 'content', 'core', 'SimDefs');
  const dst = mkdtempSync(join(tmpdir(), 'rest-defs-'));
  // ⚠️ A COMPLETE COPY, SUBDIRECTORIES INCLUDED — `Sim.Dsl/RulesLoader.cs` reads
  // `<defsDir>/rules/*.moss`, and an overlay that skipped them would boot the acceptance host with
  // NO designer rules while this header claimed the only change was a price.
  let copied = 0, rulesCopied = 0;
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) {
      mkdirSync(join(dst, e.name), { recursive: true });
      for (const f of readdirSync(join(src, e.name))) { copyFileSync(join(src, e.name, f), join(dst, e.name, f)); rulesCopied += 1; }
    } else { copyFileSync(join(src, e.name), join(dst, e.name)); copied += 1; }
  }
  const wantRules = readdirSync(join(src, 'rules')).length;
  if (rulesCopied !== wantRules) { console.error(`FAIL: copied ${rulesCopied} of ${wantRules} files under rules/`); process.exit(2); }
  log(`copied ${copied} def files + ${rulesCopied} rules/*.moss`);
  const bd = join(dst, 'build.def');
  const before = readFileSync(bd, 'utf8');
  const after = before.replace(/^device_place_cost\s*=\s*\d+/m, 'device_place_cost     = 0');
  if (after === before) { console.error('FAIL: device_place_cost not found in build.def'); process.exit(2); }
  writeFileSync(bd, after);
  // ⚠️ THE REST SCALARS ARE NOT TOUCHED, AND THAT IS THE POINT — this run measures the SHIPPED
  // 0.75 trigger and the SHIPPED 1/37800 recovery, at speed.
  const nd = readFileSync(join(dst, 'needs.def'), 'utf8');
  for (const key of ['fatigue_rest_threshold', 'fatigue_recovery_per_second', 'rest_effectiveness_ground']) {
    const m = nd.match(new RegExp('^' + key + '\\s*=\\s*(\\S+)', 'm'));
    log(`  needs.def ${key} = ${m ? m[1] : '(MISSING)'}  (unchanged)`);
  }
  log('wrote a defs overlay with device_place_cost = 0 (and NOTHING else changed):\n  ' + dst);
  log('\nstart the two halves with:');
  log(`  ~/.dotnet/dotnet run --project hosts/web -- --port ${HOST_PORT} --ship wreck --data ${dst}`);
  log(`  python3 client/serve.py ${CLIENT_PORT}`);
  log('\nthen: node client/tools/rest-shot.mjs --out docs/design/shots');
  process.exit(0);
}

// ───────────────────────────────────────── 1. the independent socket (the verdict channel)
mkdirSync(OUT, { recursive: true });
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

const roster0 = latest.get('roster');
if (!roster0?.crew?.length) { console.error('FAIL: no roster on the wire'); process.exit(2); }
const rell = roster0.crew[0];
log('crew aboard:', roster0.crew.map((c) => `${c.name} (cid ${c.cid}) — ${c.task}`).join(' | '));
const rosterTask = () => (latest.get('roster')?.crew || []).find((c) => c.cid === rell.cid)?.task || '';
const rosterAt = () => { const c = (latest.get('roster')?.crew || []).find((x) => x.cid === rell.cid); return c ? `${c.x},${c.y} deck ${c.deck}` : '?'; };

const BED_KIND = 17;
const bedsAboard = () => (decodeDevices(latest.get('devices')) || []).filter((d) => d.kind === BED_KIND);
log(`beds aboard at boot: ${bedsAboard().length}   ` +
    '(--ship wreck calls RoomDresser.Dress deliberately NOT at all — "a raided ship has no bunks left")');

const decks = decodeDecks(latest.get('decks'));
if (!decks) { console.error('FAIL: no `decks` message — is the host up on ' + HOST_PORT + '?'); process.exit(2); }
const dView = decksView(decks, decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, rell.deck);
const herSlot = slots.find((s) => s.anchorName && rell.x >= s.rect.x && rell.x < s.rect.x + s.rect.w
                                                && rell.y >= s.rect.y && rell.y < s.rect.y + s.rect.h);
if (!herSlot) { console.error('FAIL: could not find the compartment the crew member is standing in'); process.exit(3); }
const HOME = herSlot.anchorName;
log(`she is in ${HOME} at ${rell.x},${rell.y} (deck ${rell.deck}) — the bunk goes in HER compartment, ` +
    'so the walk this run measures is a walk she can actually make');

const waitFor = async (pred, ms, what) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(250); }
  log(`  (timed out after ${ms} ms waiting for ${what})`);
  return false;
};

// ───────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'rest-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1280,800'),
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
  } catch { /* not up */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const v = await evaluate(`JSON.stringify(${expr})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '2') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const mouse = (type, x, y) => call('Input.dispatchMouseEvent',
  { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
async function clickAt(x, y) { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
async function leaveZoom() {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(1500);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) {
  console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it');
  process.exit(8);
}
log(`\nBOOT task line: '${rosterTask()}'`);
check(/awaiting/i.test(rosterTask()), 'she boots AWAITING ORDERS (OD-G/OD-H) — the arc starts from the shipped opening');
await png('01-boot-awaiting.png');

// ───────────────────────────────────────────── 3. THE BUNK (skipped by --no-bunk: the deck branch)
if (!NO_BUNK) {
  log(`\n=== STEP 1 — place a BUNK in ${HOME} through the Room Zoom's own palette ===`);
  const rc = await centre(`.pl-room[data-anchor="${HOME}"]`);
  if (!rc) { console.error(`FAIL: .pl-room[data-anchor="${HOME}"] is not in the Overview DOM`); process.exit(7); }
  await clickAt(rc.x, rc.y);
  await sleep(3000);

  const bunkBtn = await centre('[data-rztool="bunk"]');
  check(!!bunkBtn, 'the palette carries a BUNK button — without it the bed branch is unreachable in play');
  if (!bunkBtn) { console.error('FAIL: no BUNK tool'); process.exit(7); }
  await png('02-bunk-tool.png');

  // ⭐⭐ THE TILE→SCREEN MAP IS THE SURFACE'S OWN PROJECTION, INVERTED — `roomScene` + `sceneFit` +
  // `scenePlacement`, the three functions `tileFromCanvasXY` itself composes. It is NOT `roomFit`:
  // that function described the PLAN view's `rw*U x rh*U` box and VR-P3 deleted it with the plan.
  // ⛔ AND THE OLD ARITHMETIC HERE WAS THE PLAN'S TOO — `(tx - rx) * U + U/2` names a point in a space
  // nothing draws in any more, so a tool that kept it would aim several metres from the tile it named.
  // A placement that never happened looks exactly like a placement the sim refused, which is the
  // lesson this file's own header already records; this is the same lesson at the next projection.
  const focus = roomTileRect(dView, HOME);
  const L = await evalJson(`(()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();return {left:r.left,top:r.top,w:r.width,h:r.height};})()`);
  const scene = roomScene(focus);
  const fit = sceneFit(scene, L.w, L.h);
  const place = scenePlacement(scene, focus);
  const screenOf = (tx, ty) => {
    const [sx, sy] = place.foot(tx, ty);
    return { x: L.left + fit.offX + sx * fit.s, y: L.top + fit.offY + sy * fit.s };
  };

  const rect = herSlot.rect;
  const occupied = new Set((decodeDevices(latest.get('devices')) || [])
    .filter((d) => d.deck === rell.deck).map((d) => d.x + ',' + d.y));
  let target = null;
  for (let y = rect.y + 1; y < rect.y + rect.h - 1 && !target; y++)
    for (let x = rect.x + 1; x < rect.x + rect.w - 1 && !target; x++)
      if (!occupied.has(x + ',' + y) && !(x === rell.x && y === rell.y)) target = { x, y };
  if (!target) { console.error('FAIL: no free tile in ' + HOME); process.exit(9); }
  log(`  placing the bunk on the free tile ${target.x},${target.y}`);

  const before = bedsAboard().length;
  await clickAt(bunkBtn.x, bunkBtn.y);
  await sleep(900);
  // A CLICK, NOT A DRAG: `bunk` is a `functional` tool, so it rides `onCanvasClick`, not the sweep
  // path (heater-shot.mjs's recorded finding, applied rather than rediscovered).
  const p = screenOf(target.x, target.y);
  await clickAt(p.x, p.y);
  await sleep(2500);
  const after = bedsAboard().length;
  check(after === before + 1,
    `a BUNK landed on the devices channel (${before} -> ${after}) — the SIM confirmed the placement, not the client`);
  await png('03-bunk-placed.png');
  await leaveZoom();
} else {
  log('\n=== STEP 1 SKIPPED (--no-bunk): the DECK branch on the unmodified shipping wreck ===');
  check(bedsAboard().length === 0, 'there really is no bunk aboard, so this run measures rest_effectiveness_ground');
}

// ─────────────────────────────────────────────────────── 4. GIVE HER WORK, so there is a job to finish
log('\n=== STEP 2 — REPAIR at priority 1: she takes a job of her own accord ===');
ws.send(JSON.stringify({ cmd: 'workPriority', cid: rell.cid, work: 0, priority: 1 }));
await sleep(1200);
check(JSON.stringify(latest.get('work')?.cells) === JSON.stringify([[rell.cid, 0, 1]]),
  'the SIM holds REPAIR@1 on the `work` channel (an independent socket, not the DOM)');

ws.send(JSON.stringify({ cmd: 'speed', delta: 4 }));   // 1x -> 1000x, the player's own +/- keys
await sleep(800);
log('  speed reads:', latest.get('status')?.speed);

const working = await waitFor(() => /servic/i.test(rosterTask()), 60000, 'a Maintain task');
log(`  task line: '${rosterTask()}'   at ${rosterAt()}`);
check(working, 'SHE WORKS — the task line names servicing a machine');
await png('04-she-works.png');

// ───────────────────────────────────────────────── 5. THE ARC: finish ▸ walk ▸ sleep ▸ wake ▸ work
log('\n=== STEP 3 — the arc: she FINISHES, walks to rest, SLEEPS, WAKES, works again ===');
log('  (needs.def fatigue_rest_threshold = 0.75 is 12 sim-hours awake, so this is the wait)');

const t0 = Date.now();
const seen = [];
let last = '';
let sawWorkThenSleep = false;
let sleepLabel = '', wakeLabel = '';
let sleptAt = 0, wokeAt = 0;
while ((Date.now() - t0) / 1000 < MAX_WAIT_S) {
  await sleep(400);
  const t = rosterTask();
  if (t !== last) {
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    seen.push(`t+${dt}s  ${t}`);
    log(`   t+${dt}s  ${t}   @ ${rosterAt()}`);
    // ⛔ RW §3.5's leg, WATCHED rather than asserted: the transition into rest must come out of a
    // job that ENDED, never out of one in progress. The work labels the host can emit while a job
    // is RUNNING all start with the activity verb ("Servicing …"); the en-route ones start
    // "Heading to". A jump straight from a running work label to a sleep label would mean a need
    // interrupted a job, which is the mutation this package exists not to be.
    if (/^Sleeping|^Heading to sleep/.test(t) && /^Servicing/.test(last)) sawWorkThenSleep = true;
    if (!sleptAt && /^Sleeping/.test(t)) { sleptAt = Date.now(); sleepLabel = t; await png('05-she-sleeps.png'); }
    if (sleptAt && !wokeAt && !/^Sleeping|^Heading to sleep/.test(t)) { wokeAt = Date.now(); wakeLabel = t; }
    last = t;
  }
  if (wokeAt) break;
}

log('\n  TASK-LINE TRANSCRIPT (the roster channel, verbatim):');
for (const s of seen) log('    ' + s);

check(!!sleptAt, `SHE SLEEPS — the task line reads '${sleepLabel}'`);
check(!sawWorkThenSleep,
  'RW §3.5: she never went from a RUNNING job straight into rest — the need is a SELECTION filter, ' +
  'not an interrupt (a true here would mean a job was interrupted mid-work)');
if (!NO_BUNK) {
  check(/^Sleeping in /.test(sleepLabel),
    'and she is IN THE BUNK she was given — "Sleeping in bunk_…", the effectiveness-1.0 branch');
} else {
  check(/^Sleeping on the deck$/.test(sleepLabel),
    'and with no bunk aboard she rests ON THE DECK — worse (0.8), never never');
}
check(!!wokeAt, `SHE WAKES — the task line moves on to '${wakeLabel}'`);
// ⚠️ WALL CLOCK IS NOT A SIM MEASUREMENT AND MUST NOT BE READ AS ONE. "1000×" is a REQUESTED tick
// rate (SpeedTps 10 000/s); the host serves what it can while Chrome, the renderer and this socket
// compete for the machine. The bed-vs-deck rates are measured in ticks, against absolute expected
// values, in `RestSystemTests` — this line is a progress log.
//
// ⛔ AND IT ONCE MISLED THIS FILE'S OWN AUTHOR, WHICH IS WHY THE NUMBERS STAY WRITTEN DOWN. M3-9's
// first commit measured 82.7 s (bunk) against 192.6 s (deck) — a 2.33× spread — and this comment
// attributed it to host throughput. It was not throughput: `NeedsSystem`'s fatigue ramp was
// UNCONDITIONAL, so the real recovery was `recovery × effectiveness − ramp`, which is non-linear in
// the effectiveness and blew the deck sleep out to 63.6 sim-hours. The deck run never reached its
// she-wakes screenshot. With the ramp gated on being awake the same two runs read 28.2 s and 35.4 s
// — a 1.26× spread against the sim's 1.25× (1 / 0.8). ⇒ A wall-clock ratio that does NOT match the
// def ratio is worth looking at, not worth explaining away.
if (sleptAt && wokeAt) log(`  slept for ${((wokeAt - sleptAt) / 1000).toFixed(1)} s of WALL CLOCK at a requested 1000x `
  + '(NOT a sim measurement — host-throughput-bound; see the note above this line)');
await png('06-she-wakes.png');

const backToWork = await waitFor(() => /servic|heading to service|dig|haul|craft|build/i.test(rosterTask()), 90000,
  'her to take work again');
log(`  task line after waking: '${rosterTask()}'`);
check(backToWork, 'AND SHE WORKS AGAIN — the loop closed');
await png('07-back-to-work.png');

ws.send(JSON.stringify({ cmd: 'speed', delta: -4 }));
await sleep(800);

log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* closing */ }
process.exit(failures ? 1 : 0);
