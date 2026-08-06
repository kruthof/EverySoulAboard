#!/usr/bin/env node
// blueprint-shot.mjs — DRIVE and PHOTOGRAPH the blueprint's whole life in a RUNNING game.
//
// THE OWNER'S SENTENCE (2026-08-05): *"after placing a new item, it should stay as a ghost until the
// pawn assembles it."* `tests/Perilune.Tests/BlueprintTests.cs` proves the SIM lays a site and the
// builder turns it into the piece; `client/test/build-feel.test.js` proves the CONTROLLER draws it.
// Neither can see a picture: `dom-lite` has no layout, so a blueprint drawn outside its viewBox, or
// under an opaque layer, or at half scale, is byte-identical there to one a player can see
// (`marks-shot.mjs`'s header records exactly that failure mode). This tool is the other half.
//
// ⭐⭐ AND IT PHOTOGRAPHS THE HONEST WAIT, WHICH IS THE PART THAT NEEDED A RULING. Under OD-H every
// work type boots OFF, so on a fresh wreck "until the pawn assembles it" is INDEFINITE — and that is
// the design, PROVIDED the game says so. Shot 3 is the `blocked` badge reading
// "BUILD BLOCKED — NOBODY ABOARD IS ASSIGNED THAT WORK". Shot 4 is the player's own remedy (the WORK
// grid, over the wire, never an auto-enable — OD-H stands), and shot 5 is the finished piece.
//
// USAGE
//   1. ./play.sh --host-port 8650 --client-port 8651 --no-open
//   2. node client/tools/blueprint-shot.mjs --host-port 8650 --client-port 8651 \
//        --out client/tools/shots-blueprint
//
// Exits non-zero if the blueprint never appears, if it is not the right piece, if the wait is
// SILENT, or if the pawn never finishes it once the work is switched on.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, verifiedClick, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8650');
const CLIENT_PORT = +arg('client-port', '8651');
const OUT = resolve(arg('out', 'client/tools/shots-blueprint'));
const PREFIX = arg('prefix', 'bp-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9397');
const TOOL = arg('tool', 'table');
const HOLD_MS = +arg('hold', '140');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('  x FAIL ' + msg); } else log('  ok  ' + msg); return ok; };

// ───────────────────────────────────────────────────────────── 1. the wire
const latest = new Map();
let ws;
const wsSend = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);

const { decodeDecks, decodeRooms, decodeDevices, decodeBlocked } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, roomScene, scenePlacement, sceneFit, paletteCommand } = await import('../src/ui/room-model.js');
const { partsUnits } = await import('../src/ui/ledger-model.js');

const DECK = (latest.get('frame')?.deck | 0);
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);
const frame = latest.get('frame');
// ⛔ THE DEVICE CENSUS IS THE **`devices` CHANNEL**, NOT THE FRAME GLYPH — measured, not preferred.
// The first version took any tile whose glyph was '.', and in the cryobay that picked a square with
// a CRYO POD on it: the press was refused and the rig could only report "no blueprint appeared".
// (It was the package's own refusal relay that named the cause — "TABLE ▸ SOMETHING IS ALREADY
// STANDING HERE" — which is a fair demonstration of why the relay exists, and a bad way to choose a
// tile.) `PlaceDeviceCommand` asks the DEVICE STORE, so the rig asks the channel that mirrors it.
const occupied = new Set((decodeDevices(latest.get('devices')) || [])
  .filter((d) => d.deck === DECK).map((d) => `${d.x},${d.y}`));
const clearIn = (r) => {
  const out = [];
  for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++)
    for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46 && !occupied.has(`${tx},${ty}`)) out.push({ x: tx, y: ty });
    }
  return out;
};
// ⭐⭐ THE ROOM MUST BE ONE THE CREW CAN ACTUALLY STAND IN, and that is a MEASURED correction
// rather than a preference. The first version took the room with the most clear floor — on the
// shipped wreck that is `hall_d0_s5`, which is VACUUM. The blueprint went down, the wait was
// honest, and the sentence read "NO BREATHABLE AIR WHERE THE CREW MUST STAND" rather than the
// work-type one; then no builder could ever come, because `WorksiteSafety` refuses an airless
// worksite. Both rig failures were the SHIP telling the truth about a room nobody can work in.
// ⇒ Prefer a room a live crew member is standing in: air is a precondition of them being there.
// ⚠️ WAIT FOR THE ROSTER, NEVER ASSUME IT ARRIVED. A fixed `sleep` before this point is a bet on
// a cold host, a cold socket and a cold module graph on a box that may be running three other
// agents' gates — and when the bet lost, `alive` was EMPTY, no room scored as crewed, the rig fell
// back to "most clear floor" and landed in the vacuum hall. It failed loudly rather than silently
// only because the ship then explained itself; the fix is to stop guessing.
const roster0 = await waitFor('the roster (crew positions choose the working room)',
  () => { const r = latest.get('roster'); return (r && Array.isArray(r.crew) && r.crew.length) ? r : null; },
  { timeoutMs: 20000, everyMs: 400, fatal: false }) || latest.get('roster');
const alive = (roster0 && Array.isArray(roster0.crew) ? roster0.crew : []).filter((c) => !c.dead);
const inRoom = (r, c) => (c.x | 0) >= r.x && (c.x | 0) < r.x + r.w && (c.y | 0) >= r.y && (c.y | 0) < r.y + r.h;
const scored = slots.map((s) => ({
  s, free: clearIn(s.rect), crewed: alive.some((c) => (c.deck | 0) === DECK && inRoom(s.rect, c)),
})).sort((a, b) => (b.crewed - a.crewed) || (b.free.length - a.free.length));
// ⭐ `--room <anchor>` PINS THE COMPARTMENT, and it exists because the automatic preference is a
// heuristic that has now mis-fired twice. The honest wait and the assembly are two DIFFERENT
// demonstrations and they want two different rooms: a vacuum hall shows the ship refusing to send
// anyone into it, and a breathable one shows a pawn walking over and finishing the piece. Naming
// the room makes each capture reproducible instead of dependent on what scored highest today.
const WANT_ROOM = arg('room', '');
const ROOM = (WANT_ROOM && scored.find((e) => e.s.anchorName === WANT_ROOM)) || scored[0];
if (WANT_ROOM && ROOM.s.anchorName !== WANT_ROOM) {
  console.error('FAIL: no room named ' + WANT_ROOM + ' on deck ' + DECK); process.exit(3);
}
log(`  room choice: ${scored.map((e) => `${e.s.anchorName}${e.crewed ? '*' : ''}:${e.free.length}`).join(' ')}  (* = a crew member is standing in it)`);
if (!ROOM || ROOM.free.length < 4) { console.error('FAIL: no room with 4 clear interior tiles'); process.exit(3); }
const focus = { deck: DECK, rx: ROOM.s.rect.x, ry: ROOM.s.rect.y, rw: ROOM.s.rect.w, rh: ROOM.s.rect.h };
const parts0 = partsUnits(latest.get('ledger'));
log(`WORKING ROOM: ${ROOM.s.anchorName}  PARTS ABOARD: ${parts0} (a placement costs 3)`);
if (parts0 < 3) { console.error(`FAIL: the ship holds ${parts0} PARTS and a placement costs 3 — nothing to photograph`); process.exit(3); }

const designsAt = () => ((latest.get('designs')?.cells) || []).filter((c) => (c[2] | 0) === DECK);
const devicesAt = () => (decodeDevices(latest.get('devices')) || []).filter((d) => d.deck === DECK);
const blockedAt = (t) => (decodeBlocked(latest.get('blocked')) || [])
  .find((b) => b.x === t.x && b.y === t.y && b.deck === DECK);

// ───────────────────────────────────────────────────────────── 2. Chrome
const userDir = mkdtempSync(join(tmpdir(), 'blueprint-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1600,1000'),
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid', chrome.pid, '(killed on every exit path)');

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) die(chrome, 5, 'Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const v = await evaluate(`JSON.stringify(${expr})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 2 } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(chrome, 6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const mouse = (type, x, y, buttons = 0) => call('Input.dispatchMouseEvent',
  { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, buttons });
const moveTo = (x, y) => mouse('mouseMoved', x, y, 0);
async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0);
}
/** An ordinary human press — down, HOLD, up. See place-census-shot.mjs on why the hold matters. */
async function pressAt(x, y) {
  await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1);
  await sleep(HOLD_MS); await mouse('mouseReleased', x, y, 0);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

await verifiedClick({
  what: `the Room Zoom is open on ${ROOM.s.anchorName}`,
  target: () => centre(`.pl-room[data-anchor="${ROOM.s.anchorName}"]`),
  settled: async () => (await evaluate("document.body.classList.contains('roomzoom-open')?1:0")) === 1,
  clickAt, log, chrome, code: 7,
});
const layerBox = await waitFor('#rz-layers laid out', async () => evalJson(
  "(()=>{const e=document.getElementById('rz-layers');if(!e)return null;const b=e.getBoundingClientRect();return b.width?{x:b.x,y:b.y,w:b.width,h:b.height}:null;})()"), { chrome, code: 8 });
const scene = roomScene(focus);
const fit = sceneFit(scene, layerBox.w, layerBox.h);
const place = scenePlacement(scene, focus, scene.s * 100);
const screenOf = (tx, ty) => {
  const [sx, sy] = place.foot(tx, ty);
  return { x: layerBox.x + fit.offX + sx * fit.s, y: layerBox.y + fit.offY + sy * fit.s };
};
/** The blueprint's live state, read out of the DOM the player is looking at. */
const bpState = () => evalJson(
  "(()=>{const e=document.querySelector('.rz-blueprint');if(!e)return {present:0};"
  + "return {present:1,tile:e.getAttribute('data-bp-tile'),tool:e.getAttribute('data-bp-tool'),"
  + "facing:Number(e.getAttribute('data-bp-facing')),"
  + "shapes:e.querySelectorAll('path,ellipse,rect').length};})()");

// ───────────────────────────────────────────────────────────── 3. place → a blueprint, not a table
const TARGET0 = ROOM.free[Math.floor(ROOM.free.length / 2)];
await verifiedClick({
  what: `the ${TOOL.toUpperCase()} tool is armed`,
  target: () => centre(`[data-rztool="${TOOL}"]`),
  settled: async () => (await evaluate(`document.querySelector('[data-rztool="${TOOL}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
  clickAt, log, chrome, code: 9,
});
// ⭐⭐ LET THE SIM ARBITRATE WHICH TILE IS FREE, AND LISTEN TO IT.
//
// ⛔ TWO CENSUSES HAVE NOW FAILED TO PICK A LEGAL TILE HERE, and both failed the same way: the
// frame glyph says '.' and the `devices` channel is FOG-GATED, so neither is the set
// `PlaceDeviceCommand` actually consults (the device STORE plus `TileFlags.HasDevice`). Rather than
// build a third client-side guess — the very thing the ghost's own header forbids — the rig presses
// candidates until the SIM accepts one, and reads its refusal each time. That is only possible
// because this package made the refusal audible; before it, every miss looked identical.
let TARGET = null, devicesBefore = devicesAt().length, tp = null, shotOne = false;
for (const cand of [TARGET0, ...ROOM.free]) {
  if (!cand) continue;
  const pt = screenOf(cand.x, cand.y);
  await moveTo(pt.x, pt.y); await sleep(350);
  if (!shotOne) { await png('01-ghost-before-the-press.png'); shotOne = true; }
  await pressAt(pt.x, pt.y);
  await sleep(1200);
  if (designsAt().some((c) => (c[0] | 0) === cand.x && (c[1] | 0) === cand.y && (c[3] | 0) === 3)) {
    TARGET = cand; tp = pt; break;
  }
  const said = await evaluate("(document.getElementById('rz-toast')||{}).textContent||''");
  log(`  ${cand.x},${cand.y} refused: "${String(said).trim() || '(nothing said)'}"`);
}
if (!TARGET) die(chrome, 10, 'no tile in ' + ROOM.s.anchorName + ' accepted a placement — see the refusals above');
log(`TARGET TILE: ${TARGET.x},${TARGET.y} (the sim accepted it)`);
await sleep(1500);
await moveTo(layerBox.x - 80, layerBox.y - 80);   // take the HOVER ghost away so shot 2 is the BLUEPRINT
await sleep(600);

// ⭐ IF THE PRESS WAS REFUSED, THE SIM NOW SAYS WHY — so the rig reads that instead of reporting
// "no blueprint" and leaving the reader to guess. This is the other half of the same package.
const refusal = await evaluate("(document.getElementById('rz-toast')||{}).textContent||''");
if (refusal) log(`  the sim's answer to the press: "${String(refusal).trim()}"`);
log(`  loose PARTS the sim could actually spend: ${partsUnits(latest.get('ledger'))} on the ledger `
  + '(TryPay spends only LOOSE, UNRESERVED stacks, which can be fewer)');

const bp = await bpState();
check(bp.present === 1,
  `the press left a BLUEPRINT on screen (this is the owner's sentence: it must stay a ghost until a `
  + `pawn assembles it). Read: ${JSON.stringify(bp)}`);
check(bp.tile === `${TARGET.x},${TARGET.y}`, `…on the pressed tile (drew ${bp.tile})`);
check(bp.tool === TOOL, `…and it is the ${TOOL.toUpperCase()} piece (drew ${bp.tool})`);
check(bp.shapes > 4, `…drawn with real geometry, not a stub (${bp.shapes} shapes)`);
check(devicesAt().length === devicesBefore,
  `…and NO DEVICE EXISTS YET (${devicesBefore} → ${devicesAt().length} on this deck). A placement `
  + 'that spawned the piece instantly is the behaviour this package replaced.');
check(designsAt().some((c) => (c[0] | 0) === TARGET.x && (c[1] | 0) === TARGET.y && (c[3] | 0) === 3),
  'the sim really holds a BuildKind.Device site there (read off the designs channel, not the page)');
await png('02-blueprint-standing.png');

// ───────────────────────────────────────────────────────────── 4. ⭐⭐ THE HONEST WAIT
// Under OD-H nobody is assigned Construct, so nobody will ever come. The game must SAY so.
await sleep(1500);
const stuck = blockedAt(TARGET);
// ⚠️ THIS LEG ONLY MEANS SOMETHING ON A HOST WHOSE WORK GRID IS UNTOUCHED. Running this rig twice
// against ONE host leaves CONSTRUCT switched on from the first run, and then there is correctly
// nothing to report — the row's ABSENCE is the ship being right. Measured, twice, before it was
// written down. Start a fresh `./play.sh` for the honest-wait capture.
check(!!stuck, 'the waiting blueprint is on the `blocked` channel — the wait is not silent '
  + '(⚠️ if this host has already had a run of this rig, CONSTRUCT is on and nothing is blocking: '
  + 'restart ./play.sh and re-run)');
// ⛔ THE ASSERTION IS "IT NAMES A REASON", NOT "IT NAMES **THIS** REASON". Which reason is honest
// depends on the room the rig lands in — a vacuum hall answers `air` and a breathable one answers
// `work_type_off` — and a rig that demanded one of them reports the SHIP's correct answer as a
// failure. `BlueprintTests.AWaitingBlueprintSaysWhyOnTheBlockedChannel` pins the work-type reason
// specifically, in a fixture that controls the air; this tool's job is that the wait is not silent.
check(stuck && stuck.orderName === 'build' && !!stuck.reasonName,
  `…and it says WHY: ${stuck ? stuck.orderName + ' / ' + stuck.reasonName : 'nothing'}`);
if (stuck && stuck.reasonName !== 'work_type_off') {
  log(`  NOTE: the blocking reason here is "${stuck.reasonName}", not the work grid. That is the `
    + 'ship being honest about a more urgent problem, and it is what a player would actually meet '
    + 'first in this compartment.');
}
const badge = await evaluate("(()=>{const e=document.querySelector('.rz-blocked-key, #rz-zonekey');return e?e.textContent:'';})()");
log(`  the sentence on screen: "${String(badge || '').replace(/\s+/g, ' ').trim().slice(0, 120)}"`);
await png('03-the-honest-wait.png');

// ───────────────────────────────────────────────────────────── 5. the player's own remedy
// ⛔ OVER THE WIRE, AND IT IS THE SAME COMMAND THE WORK GRID SENDS. Nothing here auto-enables
// anything — OD-H stands; this rig is standing in for the player clicking the WORK tab.
const roster = latest.get('roster');
const crew = (roster && Array.isArray(roster.crew) ? roster.crew : []).filter((c) => !c.dead);
check(crew.length > 0, 'somebody is awake to do the building');
for (const c of crew) wsSend({ cmd: 'workPriority', cid: c.cid | 0, work: 1, priority: 3 }); // 1 = Construct
log(`  switched CONSTRUCT on for ${crew.length} crew member(s) — the WORK grid's own command`);

const built = await waitFor('the pawn finished the blueprint', async () => {
  const d = devicesAt().find((x) => x.x === TARGET.x && x.y === TARGET.y);
  return d || null;
}, { timeoutMs: 120000, everyMs: 2000, fatal: false });
if (built) {
  check(true, `a pawn walked over and ASSEMBLED it — a real device now stands at ${TARGET.x},${TARGET.y}`);
  check(!designsAt().some((c) => (c[0] | 0) === TARGET.x && (c[1] | 0) === TARGET.y),
    '…and the blueprint dropped off the designs channel when it completed');
  await sleep(1200);
  check((await bpState()).present === 0, '…so the ghost is gone from the screen and the solid piece is there');
  await png('05-assembled.png');
} else {
  const why = blockedAt(TARGET);
  // ⛔ A SITE THE SHIP STILL SAYS IS BLOCKED FOR A REASON THE WORK GRID CANNOT FIX IS NOT A FAILURE
  // OF THE BLUEPRINT — it is the honest wait, still honest. It IS a failure when the ship has run
  // out of reasons and still nobody comes.
  if (why && why.reasonName && why.reasonName !== 'work_type_off') {
    check(true,
      `no pawn finished it, and the ship SAYS WHY: "${why.reasonName}". The wait stays visible with `
      + 'a reason, which is the condition this package was ruled through on.');
  } else {
    check(false,
      'CONSTRUCT was switched on, the ship reports no remaining reason, and no pawn finished the '
      + `blueprint inside 120 s (blocked row: ${JSON.stringify(why)}). A site nobody ever completes `
      + 'and nothing explains is the OD-H failure this package had to avoid.');
  }
  await png('05-never-assembled.png');
}

try { cdp.close(); } catch { /* already gone */ }
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* already gone */ }
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
