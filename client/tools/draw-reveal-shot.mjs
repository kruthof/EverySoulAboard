#!/usr/bin/env node
// draw-reveal-shot.mjs — ⭐⭐ THE PIECE DRAWS ITSELF IN, PHOTOGRAPHED IN A RUNNING GAME.
//
// THE OWNER'S SENTENCE (2026-08-06): *"we place an item, first see it as a ghost, the pawn comes and
// constructs it — instead of immediately emerging, could it be DRAWN? like if someone writes on
// paper?"* This tool drives the whole gesture — arm, place, switch CONSTRUCT on, wait for a builder
// — and captures the completion as a FRAME SEQUENCE the owner can flip through.
//
// ⛔⛔ AND IT IS AN INSTRUMENT, NOT A CAMERA. A screenshot sequence proves nothing on its own: eight
// identical PNGs of a finished table are exactly what a broken animation produces, and they look
// like success. So the page carries a rAF WATCHER that samples the mean COMPUTED
// `stroke-dashoffset` across the reveal's own ink elements on every frame, and the run FAILS unless
// that number starts at 1, falls, and reaches 0 — i.e. unless the strokes really advanced. The
// watcher also counts the copies of the piece in the document on every one of those frames, which
// is the live half of the node suite's "exactly one copy" rule (`client/test/draw-reveal.test.js`
// can only see it at repaint boundaries it dispatches itself).
//
// ⚠️ WHY IT SWITCHES CONSTRUCT ON FIRST, unlike `blueprint-shot.mjs`. That rig's subject is the
// HONEST WAIT under OD-H (nobody is assigned Construct, so nobody comes, and the game must say so).
// This rig's subject is the instant a builder FINISHES, so it needs a builder — over the wire, with
// the WORK grid's own command, never an auto-enable. OD-H stands; the rig is standing in for a
// player who pressed the WORK tab.
//
// USAGE
//   1. ./play.sh --host-port 8650 --client-port 8651 --no-open
//   2. node client/tools/draw-reveal-shot.mjs --host-port 8650 --client-port 8651 \
//        --out client/tools/shots-draw-reveal
//
// Exits non-zero if no blueprint is accepted, if no builder finishes it, if the overlay never
// appears, if the strokes do not advance, or if two copies of the piece are ever on screen at once.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, verifiedClick, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8650');
const CLIENT_PORT = +arg('client-port', '8651');
const OUT = resolve(arg('out', 'client/tools/shots-draw-reveal'));
const PREFIX = arg('prefix', 'rv-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9401');
const TOOL = arg('tool', 'table');
const HOLD_MS = +arg('hold', '140');
const FRAMES = +arg('frames', '8');
const FRAME_MS = +arg('frame-ms', '170');
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

const { decodeDecks, decodeRooms, decodeDevices } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, roomScene, scenePlacement, sceneFit } = await import('../src/ui/room-model.js');
const { partsUnits } = await import('../src/ui/ledger-model.js');

const DECK = (latest.get('frame')?.deck | 0);
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);
const frame = latest.get('frame');
// The device census is the `devices` CHANNEL, not the frame glyph — `blueprint-shot.mjs`'s measured
// correction, quoted rather than re-derived: `PlaceDeviceCommand` asks the device store.
const occupied = new Set((decodeDevices(latest.get('devices')) || [])
  .filter((d) => d.deck === DECK).map((d) => `${d.x},${d.y}`));
const clearIn = (r) => {
  const out = [];
  for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) {
    for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46 && !occupied.has(`${tx},${ty}`)) out.push({ x: tx, y: ty });
    }
  }
  return out;
};
// ⭐ PREFER A ROOM SOMEBODY IS STANDING IN — air is a precondition of them being there, and this rig
// NEEDS a builder to arrive (blueprint-shot.mjs's header carries the two measured failures that put
// this rule in: the biggest clear floor on the shipped wreck is a VACUUM hall).
const roster0 = await waitFor('the roster (crew positions choose the working room)',
  () => { const r = latest.get('roster'); return (r && Array.isArray(r.crew) && r.crew.length) ? r : null; },
  { timeoutMs: 20000, everyMs: 400, fatal: false }) || latest.get('roster');
const alive = (roster0 && Array.isArray(roster0.crew) ? roster0.crew : []).filter((c) => !c.dead);
const inRoom = (r, c) => (c.x | 0) >= r.x && (c.x | 0) < r.x + r.w && (c.y | 0) >= r.y && (c.y | 0) < r.y + r.h;
const scored = slots.map((s) => ({
  s, free: clearIn(s.rect), crewed: alive.some((c) => (c.deck | 0) === DECK && inRoom(s.rect, c)),
})).sort((a, b) => (b.crewed - a.crewed) || (b.free.length - a.free.length));
const WANT_ROOM = arg('room', '');
const ROOM = (WANT_ROOM && scored.find((e) => e.s.anchorName === WANT_ROOM)) || scored[0];
if (WANT_ROOM && ROOM.s.anchorName !== WANT_ROOM) { console.error('FAIL: no room named ' + WANT_ROOM); process.exit(3); }
log(`  room choice: ${scored.map((e) => `${e.s.anchorName}${e.crewed ? '*' : ''}:${e.free.length}`).join(' ')}  (* = crewed)`);
if (!ROOM || ROOM.free.length < 4) { console.error('FAIL: no room with 4 clear interior tiles'); process.exit(3); }
const focus = { deck: DECK, rx: ROOM.s.rect.x, ry: ROOM.s.rect.y, rw: ROOM.s.rect.w, rh: ROOM.s.rect.h };
const parts0 = partsUnits(latest.get('ledger'));
log(`WORKING ROOM: ${ROOM.s.anchorName}  PARTS ABOARD: ${parts0} (a placement costs 3)`);
if (parts0 < 3) { console.error(`FAIL: the ship holds ${parts0} PARTS; a placement costs 3`); process.exit(3); }

const designsAt = () => ((latest.get('designs')?.cells) || []).filter((c) => (c[2] | 0) === DECK);
const devicesAt = () => (decodeDevices(latest.get('devices')) || []).filter((d) => d.deck === DECK);

// ───────────────────────────────────────────────────────────── 2. Chrome
const userDir = mkdtempSync(join(tmpdir(), 'draw-reveal-shot-'));
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
const clickAt = async (x, y) => { await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); };
async function pressAt(x, y) {
  await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1);
  await sleep(HOLD_MS); await mouse('mouseReleased', x, y, 0);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ⚠️ THE TARGET IS THE COMPARTMENT **GROUP**, NOT A `<rect>` INSIDE IT, and that is a correction
// measured on the shipping tree rather than a preference. The sibling rigs still ask for
// `.pl-room[data-anchor="…"] rect`; VR-P4 redrew the compartment as two `<path>`s, so that selector
// resolves to NOTHING on today's Overview and `verifiedClick` reports "0 click(s) over 30 s" — the
// rig never presses anything at all. `overview-view.js`'s own hit test is `target.closest('.pl-room')`
// plus `data-anchor`, so the group IS the door, and any painted pixel of it opens the room.
// (FILED, not fixed here: the same stale selector is in blueprint-shot / zoom-pawn / others.)
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

// ───────────────────────────────────────────────────────────── 3. the builder, then the placement
// ⛔ OVER THE WIRE, THE WORK GRID'S OWN COMMAND. Nothing auto-enables anything — OD-H stands.
const crew = (latest.get('roster')?.crew || []).filter((c) => !c.dead);
check(crew.length > 0, 'somebody is awake to do the building');
for (const c of crew) wsSend({ cmd: 'workPriority', cid: c.cid | 0, work: 1, priority: 3 });
log(`  switched CONSTRUCT on for ${crew.length} crew member(s) — before placing, so a builder comes`);
await sleep(1500);

// ⭐ ARMING IS A THREE-PRESS GESTURE — the build tray replaced the flat strip, so a tool is reached
// through its CATEGORY and its LEAF before its card exists in the DOM at all. The walk is the pure
// taxonomy's (`build-tray-model.js`), driven through the shipped `<button>`s, exactly as
// `client/test/tray-arm.js` does it in node and `build-tray-shot.mjs` does it here.
const { trayLeafFor, categoryOf } = await import('../src/ui/build-tray-model.js');
const LEAF = trayLeafFor(TOOL);
if (!LEAF) die(chrome, 9, `\`${TOOL}\` is in no tray leaf — check --tool`);
for (const sel of [`[data-rzcat="${categoryOf(LEAF)}"]`, `[data-rzsub="${LEAF}"]`]) {
  const box = await centre(sel);
  // A one-leaf category is entered in ONE press (`trayNav`), so its leaf row never renders —
  // absence is correct there rather than a miss, which is why this does not fail on a null.
  if (box) { await clickAt(box.x, box.y); await sleep(350); }
}
// ⛔ AND THE CARD IS PRESSED WITH A **CHECK BETWEEN EVERY PRESS**, NOT THROUGH `verifiedClick` —
// measured, because `verifiedClick` failed here reporting "49 click(s), last read false" while the
// tool was being armed and disarmed 49 times. `arm()` is a TOGGLE (`nextRoomTool(_armed, {t:
// 'toggle'})`), so a retry loop that presses faster than it reads is a coin flip on a control that
// was working. A retry loop is only correct for an idempotent gesture.
const armed = async () => (await evaluate(
  `document.querySelector('.rz-card[data-rztool="${TOOL}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1;
// ⛔⛔ AND THE CARD MUST BE SCROLLED INTO VIEW AND THE POINT VERIFIED BEFORE THE PRESS. The tray's
// card row SCROLLS horizontally (it is the band that replaced the palette that used to clip), so a
// card's `getBoundingClientRect()` can name a point that is inside the WINDOW and outside the row's
// own clip — measured here: the TABLE card reported its centre at x = 1530 and
// `document.elementFromPoint` at that centre answered `DIV.rz-space`, the plate behind the tray. The
// press landed on nothing, forever, while every read said the card was there. A rig that trusts a
// rectangle it has not asked the DOCUMENT about is betting on a layout.
const cardPoint = async () => evalJson(`(() => {
  const e = document.querySelector('.rz-card[data-rztool=${JSON.stringify(TOOL)}]');
  if (!e) return null;
  e.scrollIntoView({ block: 'nearest', inline: 'center' });
  const r = e.getBoundingClientRect();
  const p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const hit = document.elementFromPoint(p.x, p.y);
  p.onCard = !!(hit && hit.closest && hit.closest('.rz-card') === e);
  p.hit = hit ? hit.tagName + '.' + hit.className : 'null';
  return p;
})()`);
for (let i = 0; i < 6 && !(await armed()); i += 1) {
  const box = await cardPoint();
  if (!box) die(chrome, 9, `no ${TOOL.toUpperCase()} card in the tray after walking to its leaf`);
  if (!box.onCard) {
    await sleep(250);                       // the scroll is animated; let it land and re-measure
    const again = await cardPoint();
    if (!again || !again.onCard) die(chrome, 9, `the ${TOOL.toUpperCase()} card's own centre resolves `
      + `to ${again ? again.hit : 'nothing'} — it is clipped out of the tray's scrolling row and a `
      + 'press there lands on the plate behind it');
    box.x = again.x; box.y = again.y;
  }
  await clickAt(box.x, box.y);
  await sleep(450);
}
if (!(await armed())) die(chrome, 9, `the ${TOOL.toUpperCase()} card never latched armed`);
log(`  ok  the ${TOOL.toUpperCase()} tool is armed`);

// Press candidates until the SIM accepts one — `blueprint-shot.mjs`'s rule, and its reason: neither
// the frame glyph nor the fog-gated `devices` channel is the set `PlaceDeviceCommand` consults, and
// a third client-side guess is exactly what the ghost's own header forbids.
let TARGET = null;
for (const cand of ROOM.free) {
  const pt = screenOf(cand.x, cand.y);
  await moveTo(pt.x, pt.y); await sleep(300);
  await pressAt(pt.x, pt.y);
  await sleep(1100);
  if (designsAt().some((c) => (c[0] | 0) === cand.x && (c[1] | 0) === cand.y && (c[3] | 0) === 3)) { TARGET = cand; break; }
  const said = await evaluate("(document.getElementById('rz-toast')||{}).textContent||''");
  log(`  ${cand.x},${cand.y} refused: "${String(said).trim() || '(nothing said)'}"`);
}
if (!TARGET) die(chrome, 10, 'no tile in ' + ROOM.s.anchorName + ' accepted a placement');
const TILE = `${TARGET.x},${TARGET.y}`;
log(`TARGET TILE: ${TILE} (the sim accepted it)`);
await moveTo(layerBox.x - 80, layerBox.y - 80);   // the hover ghost off, so shot 1 is the BLUEPRINT
await sleep(700);
await png('01-blueprint-waiting.png');

// ───────────────────────────────────────────────────────────── 4. the in-page watcher
//
// ⛔⛔ THIS IS THE INSTRUMENT AND THE SCREENSHOTS ARE THE ILLUSTRATION. It runs on rAF from BEFORE
// the piece completes, so it catches the first frame of the overlay's life — which a poll from node
// (one round trip every ~15 ms, with a build that finishes whenever the pawn gets there) cannot.
// Three things per frame: the mean computed dashoffset (did the strokes advance), the number of
// overlay groups, and the number of copies of the piece in the SCENE (the double-draw rule, live).
await evaluate(`(() => {
  const TILE = ${JSON.stringify(TILE)};
  const lay = document.getElementById('rz-reveal');
  const scn = document.getElementById('rz-layers');
  const w = { samples: [], started: 0, ended: 0, err: lay ? '' : 'no #rz-reveal in the document' };
  window.__rv = w;
  if (!lay) return;
  const tick = () => {
    const g = lay.firstElementChild;
    if (g) {
      if (!w.started) w.started = performance.now();
      const inks = g.querySelectorAll('.rz-rv-ink');
      let s = 0;
      for (const e of inks) s += parseFloat(getComputedStyle(e).strokeDashoffset) || 0;
      w.samples.push({
        t: +(performance.now() - w.started).toFixed(1),
        n: inks.length,
        mean: +(inks.length ? s / inks.length : -1).toFixed(4),
        overlay: lay.childElementCount,
        scene: scn ? scn.querySelectorAll('[data-tile="' + TILE + '"]').length : -1,
      });
    } else if (w.started && !w.ended) {
      w.ended = performance.now();
      w.sceneAfter = scn ? scn.querySelectorAll('[data-tile="' + TILE + '"]').length : -1;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
check((await evaluate('window.__rv ? window.__rv.err : "the watcher never installed"')) === '',
  'the draw-in watcher is installed on #rz-reveal');

// ───────────────────────────────────────────────────────────── 5. wait for the builder, then shoot
const built = await waitFor('a pawn walked over and finished the blueprint', async () => {
  const d = devicesAt().find((x) => x.x === TARGET.x && x.y === TARGET.y);
  if (d) return d;
  // …and start the camera the instant the OVERLAY appears, which is earlier than the wire tells us
  return (await evaluate('window.__rv && window.__rv.started ? 1 : 0')) ? { early: true } : null;
}, { timeoutMs: 180000, everyMs: 60, fatal: false });
if (!built) die(chrome, 11, 'no builder finished the blueprint inside 180 s — nothing to photograph. '
  + '(Is CONSTRUCT reachable in this room? blueprint-shot.mjs reports the blocked reason.)');

// THE FRAME SEQUENCE. Shot as fast as `Page.captureScreenshot` allows over the animation's window.
const clip = { x: Math.round(layerBox.x), y: Math.round(layerBox.y), width: Math.round(layerBox.w), height: Math.round(layerBox.h) };
for (let i = 0; i < FRAMES; i += 1) {
  await png(`frame-${String(i).padStart(2, '0')}.png`, clip);
  await sleep(FRAME_MS);
}
await sleep(600);
await png('09-settled.png', clip);

// ───────────────────────────────────────────────────────────── 6. read the instrument
const w = await evalJson('window.__rv');
const s = (w && w.samples) || [];
check(s.length > 8, `the watcher caught ${s.length} frames of the draw-in (needs more than 8 to say anything)`);
if (s.length) {
  const first = s[0], last = s[s.length - 1];
  const mid = s[Math.floor(s.length / 2)];
  log(`  dashoffset over ${s.length} frames on ${first.n} strokes: `
    + `${first.mean} → ${mid.mean} → ${last.mean}   (t = 0 … ${last.t} ms)`);
  // ⛔⛔ THE PROGRESS ASSERTION — the one that makes the screenshots evidence rather than decoration.
  check(first.mean > 0.85,
    `the first frame of the overlay's life has mean dashoffset ${first.mean}; it must be ~1 (nothing `
    + 'drawn yet). A lower number means the piece was already partly there when it mounted.');
  check(mid.mean < first.mean - 0.1,
    `the strokes did not ADVANCE between the first frame and the middle one (${first.mean} → ${mid.mean}). `
    + 'Eight screenshots of a finished table look exactly like this.');
  check(last.mean < 0.05, `…and reached the end (${last.mean})`);
  // monotone, within the rounding a computed style gives back
  const rises = s.filter((x, i) => i > 0 && x.mean > s[i - 1].mean + 0.02).length;
  check(rises === 0, `the drawing went BACKWARDS on ${rises} frame(s) — a restarted animation`);
  // ⛔ AND THE DOUBLE-DRAW RULE, LIVE, ON EVERY FRAME THE OVERLAY EXISTED.
  const twoOverlay = s.filter((x) => x.overlay !== 1).length;
  const inScene = s.filter((x) => x.scene !== 0).length;
  check(twoOverlay === 0, `the overlay held something other than one group on ${twoOverlay} frame(s)`);
  check(inScene === 0,
    `the SCENE was also drawing the piece on ${inScene} of ${s.length} frames — two copies of one `
    + 'fitting, one of them fully drawn, standing in the same place');
  check(w.sceneAfter === 1,
    `after the overlay went away the scene holds ${w.sceneAfter} copies of the piece; it must hold `
    + 'exactly 1 (0 means the suppression is stuck and the fitting has vanished from the room)');
  writeFileSync(join(OUT, PREFIX + 'timeline.json'), JSON.stringify(w, null, 1));
  log('  wrote ' + join(OUT, PREFIX + 'timeline.json'));
}

try { cdp.close(); } catch { /* gone */ }
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* gone */ }
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
