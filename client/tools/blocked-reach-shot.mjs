#!/usr/bin/env node
// blocked-reach-shot.mjs — THE M1-D ACCEPTANCE DEMO, DRIVEN AND PHOTOGRAPHED ON THE SHIPPING GAME.
//
// ⚠️ WHY THIS EXISTS. `WireFormat.ReasonUnreachable` reports something no assertion in this repo can
// photograph: an order the player painted that NOBODY CAN GET TO. The failure it replaces is a
// 480 000-tick silence — an order frozen, a pawn reading "Idle", and `blocked` carrying zero rows —
// so "the suite is green" is precisely the evidence that was already available while the bug was
// live. `blocked-shot.mjs` is the sibling rig for the AIR and NO_APPROACH reasons.
//
// ⛔⛔ READ THIS BEFORE TRUSTING ANY DEVICE NUMBER IN THIS FILE. **REVISION 0 OF THIS RIG CENSUSED
// THE WRONG DEVICE KIND, AND ALL THREE FINDINGS IT PUBLISHED WERE FALSE.** It filtered `kind === 2`
// under a comment reading `// DeviceKind.Door`. **`DeviceKind.Door = 0`**
// (`sim/Sim.Core/Entities/Device.cs:5`); `1` is `AirVent` and **`2` is `Scrubber`**. So it censused
// the four scrubbers, found none of them openable, and published:
//   ✗ "all four deck-0 Doors boot SHUT"          — there are EIGHT Doors on deck 0 and TWO BOOT OPEN.
//   ✗ "shutting them partitions nothing"         — it never shut a door; its `openDoors` was empty.
//   ✗ "the reason is not producible by a player" — it is. The recipe is below.
// The hazard was named in advance and ignored: `hosts/web/WireFormat.Devices.cs:179` says
// *"⚠️ THE CLIENT HAS NO NUMERIC MIRROR OF `DeviceKind` TODAY"*, so a hand-written kind number in a
// client-side tool is precisely the mirror that file refuses to create. **This rig now derives
// nothing by hand: `DOOR_KIND` is PARSED from the sim's own enum and the census is checked for
// non-vacuity before anything else runs.**
//
// ⇒ **THE RECIPE THAT PRODUCES REASON 3 IN PLAY, on `--ship wreck`, with nothing planted:**
//     arm **O** and shut the two doors that boot OPEN — `(5,7)` and `(5,10)` on deck 0 —
//     then arm **STRIP** and condemn a wall on the stranded side.
//   Shutting those two strands 148 tiles: deck-0 explored + breathable + crew-reachable falls
//   **208 → 60**. The verb is **STRIP, not BUILD**, and that is not a detail — see the next block.
//
// ⛔ **WHY NOT THE CHARTER'S `BUILD`.** A build behind a shut door cannot reach this reason at all.
// `BuildJobSource.TryReserveMaterialFor` checks a path to the MATERIAL and never to the SITE, so the
// claim SUCCEEDS, the pawn walks to the Regolith, and `ProgressHaulToBuild` phase A then abandons on
// `JobWork.TryPathToAdjacent(site)` — a path that records NO back-off. Measured on `--ship grid`
// (sealed pocket, 174 reachable Regolith, one un-materialed wall build inside, 6000 ticks): the site
// was held as `HaulToBuild` for 3000 ticks with 2999 abandons, **first back-off tick = NEVER**,
// **blocked rows = 0**. That loop IS the 480 000-tick livelock and nothing stamps it. STRIP needs no
// material, so its claim reaches `TryPathToAdjacent`, fails, and stamps. FILED, NOT FIXED: the fix is
// one write on a dispatch path and this lane is pin-neutral by charter.
//
// THE SEVEN STEPS, in the charter's order, with the second verb corrected:
//   1. a live `--ship wreck` host (what ./play.sh serves) + the standard surface
//   2. OPERATE the doors that boot open, shut                       (the `operate` verb)
//   3. STRIP the walls those doors STRAND, derived from the `frame`  (the `strip` verb)
//   4. let it run ~10 s at DEFAULT speed (max speed kills the one crew member — see step 4)
//   5. the order must carry reason 3
//   6. ⭐ WAIT A FULL SIM-MINUTE UNTOUCHED — the reason must STILL BE THERE. This is the step that
//      fails if the latch decision was skipped, and it is why a human runs this demo rather than
//      trusting the suite: the back-off stamp behind reason 3 lasts FIVE SECONDS.
//   7. re-open one door — the reason must clear on its own.
//
// USAGE
//   1. ./play.sh --host-port 8430 --client-port 8431 --no-open
//   2. node client/tools/blocked-reach-shot.mjs --out docs/design/shots [--host-port 8430]
//
// Exits non-zero if the host will not answer, if the door census is empty, if no reason-3 row
// appears, if it vanishes during the wait, or if Chrome never paints. A green run with no pictures is
// the failure this tool exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8430');
const CLIENT_PORT = +arg('client-port', '8431');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'blocked-reach-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9341');
const REASON_UNREACHABLE = 3;
const DECK = +arg('deck', '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
mkdirSync(OUT, { recursive: true });

// ── THE CONSTANT IS READ FROM THE SIM'S OWN ENUM, NOT WRITTEN HERE ──
// Revision 0 hand-wrote `2` under a comment claiming it was Door. The enum is the authority, so this
// parses it. If the parse rots the rig FAILS rather than falling back to a literal — a fallback is
// how the wrong number survived the first time.
const HERE = dirname(fileURLToPath(import.meta.url));
const DEVICE_CS = readFileSync(resolve(HERE, '../../sim/Sim.Core/Entities/Device.cs'), 'utf8');
const doorDecl = /^\s*Door\s*=\s*(\d+)\s*,/m.exec(DEVICE_CS);
if (!doorDecl) die(1, 'could not read DeviceKind.Door out of sim/Sim.Core/Entities/Device.cs — this '
  + 'parse has rotted, and a hand-written fallback is exactly the defect this line exists to prevent');
const DOOR_KIND = Number(doorDecl[1]);
log(`0   DeviceKind.Door = ${DOOR_KIND}, PARSED from sim/Sim.Core/Entities/Device.cs`);

// ───────────────────────────────────────────────────────────── 1. drive the sim over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');

const deckOf = (d) => deckSlots(decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms'))), d);
const devicesOf = (d) => (latest.get('devices')?.cells || []).filter((c) => (c[2] | 0) === d);
const blockedOf = (d) => (latest.get('blocked')?.cells || []).filter((c) => (c[2] | 0) === d);
const reachRows = (d) => blockedOf(d).filter((c) => (c[4] | 0) === REASON_UNREACHABLE);
const pawn = () => latest.get('roster')?.crew?.[0];
const census = (d) => {
  const by = {};
  for (const c of blockedOf(d)) { const k = `order${c[3]}/reason${c[4]}`; by[k] = (by[k] || 0) + 1; }
  return JSON.stringify(by);
};

async function gotoDeck(deck) {
  for (let i = 0; i < 16; i++) {
    const cur = latest.get('frame')?.deck | 0;
    if (cur === deck) return true;
    send({ cmd: 'deck', dz: Math.sign(deck - cur) });
    await sleep(450);
  }
  return (latest.get('frame')?.deck | 0) === deck;
}
if (!await gotoDeck(DECK)) die(2, 'could not reach deck ' + DECK);
await sleep(1500);

// ── STEP 1: the door census, with a NON-VACUITY CHECK on the constant itself ──
const kindHist = {};
for (const c of devicesOf(DECK)) kindHist[c[3] | 0] = (kindHist[c[3] | 0] || 0) + 1;
log(`1   deck ${DECK} device kinds (kind -> count): ${JSON.stringify(kindHist)}`);
const doors = devicesOf(DECK).filter((c) => (c[3] | 0) === DOOR_KIND);
if (doors.length === 0) die(3, `deck ${DECK} has ZERO devices of kind ${DOOR_KIND}. Either the enum `
  + 'parse points at the wrong member or this ship has no doors — and a rig that censuses an empty '
  + 'set and then reports "nothing is open" is how revision 0 published three false findings.');
log(`1   DOORS (kind ${DOOR_KIND}): ${doors.map((c) => `(${c[0]},${c[1]}) open=${c[6]}`).join('  ')}`);
const openDoors = doors.filter((c) => (c[6] | 0) === 1);
log(`1   of ${doors.length} doors on this deck, ${openDoors.length} are OPEN at boot`);

// ── STEP 2: OPERATE them shut ──
if (openDoors.length === 0) die(4, 'no door boots open on this deck, so the demo\'s opening move '
  + 'cannot be performed. Revision 0 REPORTED exactly this and it was an artefact of the wrong kind '
  + 'constant; if it is ever true again, prove it against the kind histogram above before believing it.');
for (const d of openDoors) { send({ cmd: 'operate', x: d[0], y: d[1], deck: DECK }); await sleep(900); }
await sleep(2000);
const afterOp = devicesOf(DECK).filter((c) => (c[3] | 0) === DOOR_KIND);
const stillOpen = afterOp.filter((c) => (c[6] | 0) === 1);
log(`2   after OPERATE: ${afterOp.map((c) => `(${c[0]},${c[1]}) open=${c[6]}`).join('  ')}`);
log(`2   doors still open = ${stillOpen.length}`);
if (stillOpen.length === openDoors.length) die(4, 'the OPERATE verb changed nothing — every door is '
  + 'still open, so nothing was stranded and every step below would be vacuous');

// ── STEP 3: STRIP exactly the walls the shut doors STRAND ──
//
// ⚠️ THE TARGET IS DERIVED FROM THE FRAME, NOT HARD-CODED — and a sweep does NOT work, which is a
// finding worth keeping. Condemning every wall on the deck leaves the crew member stripping the
// NEAREST reachable one for minutes, and a busy pawn attempts nothing else, so the stranded sites are
// never claimed and never stamped. That is `IsBackedOff`'s documented under-claim doing exactly what
// it says: only sites somebody TRIED carry a stamp. Measured — a 78-wall sweep of the same rows
// produced `blocked=0` for 80 s while the pawn stripped (8,7).
//
// THE RULE. The two doors that boot open sit on the two wall lines that seal the spine corridor:
//     y= 7 |#####/##########+#######|
//     y= 8 |#.....................H.|      <- the sealed corridor
//     y= 9 |#.......S...........*...|
//     y=10 |#####/##########+#######|
// A wall on one of those lines is STRANDED when the tile on the OUTSIDE of the line is itself wall
// (so no worker can stand there) while the tile on the INSIDE is open floor — its only approach is
// inside the corridor the player just sealed. `(11,7)` is one: `(11,6)` is `#`, `(11,8)` is `.`.
// Both facts come off the `frame` channel, so nothing here encodes this ship's coordinates.
const F = latest.get('frame');
const W = F.w | 0, H = F.h | 0;
const ch = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : String.fromCharCode(F.cells[y * W + x][0]);
const doorYs = [...new Set(openDoors.map((d) => d[1] | 0))].sort((a, b) => a - b);
const yTop = doorYs[0], yBot = doorYs[doorYs.length - 1];
log(`3   the shut doors sit on wall lines y=${doorYs.join(' and y=')}; the sealed corridor is between them`);

const targets = [];
for (const y of doorYs) {
  const outside = (y === yTop) ? y - 1 : y + 1;
  const inside = (y === yTop) ? y + 1 : y - 1;
  for (let x = 0; x < W; x++) {
    if (ch(x, y) !== '#') continue;                 // not a plain wall (a door is '/' '+' 'X')
    if (ch(x, outside) !== '#') continue;           // reachable from outside — not stranded
    if (ch(x, inside) === '#') continue;            // no open tile inside either — nobody can ever stand
    targets.push([x, y]);
  }
}
if (!targets.length) die(5, 'no stranded wall could be derived from the frame, so the demo has no '
  + 'order to place. Print the frame rows around the door lines before believing this.');
log(`3   ${targets.length} stranded wall(s) derived: ${targets.slice(0, 8).map((t) => `(${t[0]},${t[1]})`).join(' ')}`
  + (targets.length > 8 ? ' …' : ''));
for (const [x, y] of targets) send({ cmd: 'strip', x, y, on: 1 });
await sleep(4000);

// ── STEP 4: let it run ──
// ⚠️ AT DEFAULT SPEED, DELIBERATELY, AND THE CHARTER SAYS "MAX SPEED". Measured: at max speed the
// single thawed crew member is DEAD before the demo finishes (`roster` empties), and with no crew
// nothing ever attempts a claim, so the channel goes honestly silent and the whole run is vacuous.
// The likeliest cause is the wreck's own doom clock rather than the doors — `--ship wreck` loses
// every light at sim-hour 7 and max speed reaches that in seconds — but THAT ATTRIBUTION IS INFERRED
// AND WAS NOT ISOLATED. What is measured is only: max speed ⇒ dead pawn ⇒ no stamp.
// ── STEP 5: the reason must be on the wire ──
// POLLED, NOT SLEPT-ON, and the reason is the under-claim: a site is stamped only when a crew member
// ATTEMPTS it, so the row appears when the pawn next goes idle — not on a fixed clock. The poll
// prints what the pawn is doing so a run that fails can be read rather than guessed at.
let rows = [];
for (let i = 0; i < 24; i++) {
  await sleep(5000);
  rows = reachRows(DECK);
  log(`5   +${(i + 1) * 5}s blocked=${blockedOf(DECK).length} ${census(DECK)} r3=${rows.length}`
    + `  pawn @${pawn()?.x},${pawn()?.y} "${pawn()?.task}"`);
  if (rows.length) break;
  if (!pawn()) die(5, 'THE CREW MEMBER DIED. With no crew nothing attempts a claim, nothing is '
    + 'stamped, and the channel is honestly silent — the run is vacuous, not a refutation.');
}
if (!rows.length) die(5, 'no reason-3 row appeared after shutting the doors and condemning the walls. '
  + 'Either nothing was stranded, or no crew member ever went idle long enough to attempt a claim (an '
  + 'unattempted site carries no stamp — the documented under-claim), or the seam is inert.');
log(`5   ✅ ${rows.length} row(s) carry reason ${REASON_UNREACHABLE} (unreachable)`);
log(`5   sample: ${JSON.stringify(rows.slice(0, 6))}`);

// ── STEP 6 ⭐ the LATCH: a full sim-minute untouched ──
const t0 = Date.now();
await sleep(70000);
const later = reachRows(DECK);
log(`6   after ${Math.round((Date.now() - t0) / 1000)}s untouched: ${later.length} reason-3 row(s)`);
if (!later.length) die(6, 'THE REASON BLINKED OUT. The back-off stamp behind it lasts 50 ticks; '
  + 'without the host latch this channel explains a stalled order for five seconds and then goes '
  + 'silent with the door still shut.');
log('6   ✅ the reason is STILL THERE');

// ── which surface can show it? Room rect vs hall tile — MEASURED AND STATED, never assumed ──
//
// ⚠️ COUNTED AS DISTINCT ROWS, not summed per rect. Revision 1 of this block summed a per-rect count
// and printed "12 of 6 rows … -6 on HALL tiles" — the room rects OVERLAP the corridor lines, so a row
// on y=7 falls inside two of them. A negative remainder is what a double count looks like.
// ⚠️ AND THE ROOM IS CHOSEN BY ARGMAX, not by first hit. Revision 1 took the FIRST rect containing any
// row, entered "cryobay" (rx 0, ry 0, 12x8) on the strength of `(11,7)` — and by the time the browser
// had a payload the pawn had already claimed that one, leaving only rows at x=22 and x=33 which
// cryobay does not contain. The Room Zoom then honestly drew nothing and the rig reported it as a
// blind spot. It was a stale choice, not a blind spot.
const inRect = (R, c) => c[0] >= R.x && c[0] < R.x + R.w && c[1] >= R.y && c[1] < R.y + R.h;
const slots = deckOf(DECK);
const contained = later.filter((c) => slots.some((s) => inRect(s.rect, c)));
log(`6   RECT CONTAINMENT: ${contained.length} of ${later.length} reason-3 rows sit inside at least `
  + `one Room-Zoom room rect; ${later.length - contained.length} are on HALL tiles only.`);
// ⚠️ AND ONLY A **NAMED** SLOT CAN BE ENTERED. Measured on this ship: deck 0 has EIGHT slots and only
// THREE carry an `anchorName` (cryobay, lifesupport, reactor); the other five are empty berths whose
// `anchorName` is the empty string. Revision 2 took the argmax over ALL slots, won it with an unnamed
// one, assigned `room = ""` — and `if (room)` is FALSE for the empty string, so it fell into the
// "no row is inside any rect" branch and printed that one line after printing "6 of 6 rows ARE inside
// a rect" on the line above. Two contradictory sentences, both from the same data, and the falsy
// empty string is the whole of it. The unnamed count is now reported rather than silently folded in:
// a row inside an unnamed berth genuinely CANNOT be shown by the Room Zoom, and that is a fact about
// the surface worth carrying, not a rig failure to hide.
const named = slots.filter((s) => s.anchorName);
const inUnnamed = later.filter((c) => !named.some((s) => inRect(s.rect, c))
                                   && slots.some((s) => inRect(s.rect, c))).length;
log(`6   of the ${slots.length} slots on this deck only ${named.length} are ENTERABLE rooms `
  + `(${named.map((s) => s.anchorName).join(', ')}); ${inUnnamed} reason-3 row(s) sit in an UNNAMED `
  + 'berth and cannot be reached by the Room Zoom at all');
// ⚠️ A LIST, NOT A WINNER — and this is the third correction to this one block, so the reason is
// written down. Revision 3 picked the argmax and entered it blind; it chose "cryobay" on a tie and
// drew NOTHING, while "lifesupport" — tied at the same count — drew the badge correctly when probed
// by hand. A rig that picks one room and reports what it finds there cannot tell "this room has no
// badge" from "the layer is broken". So the candidates are ORDERED and the browser section TRIES
// THEM IN TURN, stopping at the first that actually paints; only if every one of them paints nothing
// is there a finding to report.
const candidates = named
  .map((slot) => ({ room: slot.anchorName, rect: slot.rect, n: later.filter((c) => inRect(slot.rect, c)).length }))
  .filter((c) => c.n > 0)
  .sort((a, b) => b.n - a.n);
log(`6   named rooms containing a reason-3 row: `
  + (candidates.map((c) => `${c.room}(${c.n})`).join(' ') || 'NONE'));
let room = candidates[0]?.room || null, RECT = candidates[0]?.rect || null;
if (!room) {
  const first = named[0] || slots[0];
  if (!first) die(7, 'deck ' + DECK + ' has no room rect at all');
  room = first.anchorName; RECT = first.rect;
  log('6   ⛔ NO reason-3 row is inside an ENTERABLE room rect, so the Level-2 Room Zoom — which is '
    + 'entered PER ROOM — cannot be pointed at one. State that as its own finding; do not route '
    + 'around it. Entering "' + room + '" anyway so the surface is at least seen.');
}

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'blocked-reach-shot-'));
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
  } catch { /* not up */ }
}
if (!wsUrl) { chrome.kill('SIGKILL'); die(8, 'Chrome never opened a DevTools endpoint'); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '3') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(9, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

const onbBox = await evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onbBox && onbBox !== 'null') {
  const { x: bx, y: by } = JSON.parse(onbBox);
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x: bx, y: by, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(2500);
}
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) die(10, 'the onboarding card is still up');

await png('overview.png');

async function reportDom(tag) {
  const n = await evaluate(`document.querySelectorAll('.rz-blockeds .rz-blocked').length`);
  const un = await evaluate(`document.querySelectorAll('.rz-blocked-unreachable').length`);
  const key = await evaluate(`(document.getElementById('rz-zonekey')||{}).textContent||''`);
  log(`${tag}: .rz-blocked=${n} .rz-blocked-unreachable=${un}`);
  log(`  key text = "${String(key).trim()}"`);
  return { n, un, key: String(key) };
}
async function enterRoom(name) {
  await evaluate(`(async()=>{const RZ=await import('/src/ui/roomzoom-view.js');RZ.exitRoom&&RZ.exitRoom();return 1;})()`);
  await sleep(800);
  const r = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${name}"]');if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})())`);
  if (!r || r === 'null') return false;
  const { x, y } = JSON.parse(r);
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(3500);
  return true;
}

let shot = { n: 0, un: 0, key: '' };
for (const cand of (candidates.length ? candidates : [{ room, rect: RECT }])) {
  if (!await enterRoom(cand.room)) { log(`B   "${cand.room}" is not in the Overview DOM — skipping`); continue; }
  room = cand.room; RECT = cand.rect;
  shot = await reportDom(`ROOM ZOOM "${cand.room}" (LIVE, doors shut, latched)`);
  if (shot.un) break;
  log(`B   "${cand.room}" painted no unreachable badge; trying the next candidate room`);
}
await png('live-latched.png');
const clip = await evaluate(`JSON.stringify((()=>{const es=[...document.querySelectorAll('.rz-blocked')];if(!es.length)return null;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const e of es){const r=e.getBoundingClientRect();x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.width);y1=Math.max(y1,r.y+r.height);}const pad=40;return {x:Math.max(0,x0-pad),y:Math.max(0,y0-pad),width:(x1-x0)+pad*2,height:(y1-y0)+pad*2};})())`);
if (clip && clip !== 'null') await png('live-latched-crop.png', JSON.parse(clip));
if (shot.un) log(`B   ✅ the LIVE reason-3 badge is drawn on the standard surface in "${room}", `
  + 'from a LIVE host row — not an injected one');
else die(12, 'NO named room painted an `rz-blocked-unreachable` badge, although the wire carries '
  + 'reason-3 rows inside ' + candidates.length + ' of them. Either the layer is emitting a string '
  + 'nobody paints, or every such row sits in an UNNAMED berth (see the slot line above). Both are '
  + 'findings; neither may be reported as "the demo passed".');

// ── STEP 7: re-open one door; the reason must clear on its own ──
send({ cmd: 'operate', x: openDoors[0][0], y: openDoors[0][1], deck: DECK });
log(`7   re-opened (${openDoors[0][0]},${openDoors[0][1]}); waiting for the crew to reach the work`);
let cleared = later.length;
for (let i = 0; i < 12; i++) {
  await sleep(10000);
  cleared = reachRows(DECK).length;
  log(`7   +${(i + 1) * 10}s: ${cleared} reason-3 row(s) left, pawn "${pawn()?.task}"`);
  if (cleared === 0) break;
}
await reportDom('ROOM ZOOM (door re-opened)');
await png('reopened.png');
if (cleared >= later.length) {
  console.error('WARN: the reason-3 rows did not fall after re-opening the door. The latch clears '
    + 'when a crew member actually TAKES the job, so a crew busy elsewhere legitimately keeps a row. '
    + 'Report which case this was from the numbers above; do NOT report step 7 as passed on this path.');
  cdp.close(); chrome.kill('SIGKILL');
  process.exit(12);
}
log(`7   ✅ reason-3 rows fell ${later.length} -> ${cleared} with no further player action`);

cdp.close();
chrome.kill('SIGKILL');
log('done — all 7 steps');
process.exit(0);
