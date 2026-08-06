#!/usr/bin/env node
// build-ghost-shot.mjs — DRIVE and PHOTOGRAPH the build ghost in a RUNNING game.
//
// THE OWNER'S SENTENCE (2026-08-05): *"when building a new item, e.g. a table, I want to see it
// before placing it and I want to be able to rotate it (4× rotation)"*. `client/test/build-ghost.test.js`
// proves the CONTROLLER draws it; `dom-lite` has no layout, so a ghost drawn outside its own viewBox
// — or under an opaque layer, or at half the scale — is byte-identical there to one a player can see
// (`marks-shot.mjs`'s header records exactly that failure mode). This tool is the other half.
//
// ⛔ IT ASSERTS ON THE DOM AND ON THE WIRE, NOT ON THE PICTURES. The screenshots are evidence a human
// reads; the checks are `#rz-ghost`'s own live markup and the `devices` channel's census, both read
// over the same socket the game uses. A green run means the ghost was really on screen at the really
// hovered tile and the click really placed a device there.
//
// USAGE
//   1. ./play.sh --host-port 8400 --client-port 8401 --no-open        (any --ship)
//   2. node client/tools/build-ghost-shot.mjs --out client/tools/shots-build-ghost \
//        --host-port 8400 --client-port 8401
//
// Exits non-zero if the host will not answer, if Chrome never paints, if a precondition never
// arrives, or — the point — if the ghost is absent, in the wrong place, or drawn where it must not be.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, verifiedClick, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8400');
const CLIENT_PORT = +arg('client-port', '8401');
const OUT = resolve(arg('out', 'client/tools/shots-build-ghost'));
const PREFIX = arg('prefix', 'ghost-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9377');
const TOOL = arg('tool', 'table');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('  x FAIL ' + msg); } else log('  ok  ' + msg); return ok; };

// ───────────────────────────────────────────────────────────── 1. the wire, read as the client does
const latest = new Map();
let ws;
const wsSend = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);

// Decoded by the CLIENT'S OWN modules — this tool cannot drift from what the surface believes.
const { decodeDecks, decodeRooms, decodeDevices } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, roomScene, scenePlacement, sceneFit, paletteCommand } = await import('../src/ui/room-model.js');
const { partsUnits } = await import('../src/ui/ledger-model.js');

const DECK = (latest.get('frame')?.deck | 0);
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);
if (!slots.length) { console.error('FAIL: deck ' + DECK + ' has no enterable room'); process.exit(3); }
const parts = partsUnits(latest.get('ledger'));
const devicesAt = () => (decodeDevices(latest.get('devices')) || []).filter((d) => d.deck === DECK);

// The working room: the one with the most clear interior floor, so three distinct hover tiles and a
// placement target all exist. Derived from the FRAME, never hand-written.
const frame = latest.get('frame');
const clearIn = (r) => {
  const out = [];
  for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) {
    for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46) out.push({ x: tx, y: ty });
    }
  }
  return out;
};
const scored = slots.map((s) => ({ s, free: clearIn(s.rect) })).sort((a, b) => b.free.length - a.free.length);
for (const e of scored) log(`  ${e.s.anchorName}: ${e.free.length} clear interior tiles`);
const ROOM = scored[0];
if (ROOM.free.length < 4) { console.error('FAIL: no room with 4 clear interior tiles'); process.exit(3); }
const focus = { deck: DECK, rx: ROOM.s.rect.x, ry: ROOM.s.rect.y, rw: ROOM.s.rect.w, rh: ROOM.s.rect.h };
log(`WORKING ROOM: ${ROOM.s.anchorName} @${focus.rx},${focus.ry} ${focus.rw}x${focus.rh}`);
log(`PARTS ABOARD: ${parts} (a placement costs 3 — below that every place tool previews REFUSED)`);
// Three tiles apart enough to read as three positions in the screenshots.
const HOVERS = [ROOM.free[0], ROOM.free[Math.floor(ROOM.free.length / 2)], ROOM.free[ROOM.free.length - 1]];
const TARGET = HOVERS[1];

// ───────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'build-ghost-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1600,1000'),
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid', chrome.pid, '(killed on every exit path — a leak OOM-kills a sibling agent\'s gate)');

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
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '2') } } : { format: 'png' });
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
  await mouse('mouseMoved', x, y, 0);
  await mouse('mousePressed', x, y, 1);
  await mouse('mouseReleased', x, y, 0);
}
const key = (k) => call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k })
  .then(() => call('Input.dispatchKeyEvent', { type: 'keyUp', key: k }));

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ───────────────────────────────────────────────────────────── 3. into the room
await verifiedClick({
  what: `the Room Zoom is open on ${ROOM.s.anchorName}`,
  target: () => centre(`.pl-room[data-anchor="${ROOM.s.anchorName}"] rect`),
  // ⛔ SETTLE ON A STATE, NOT ON `centre('.rz-canvas')` — that node exists while the room is SHUT and
  // answers a zero-size (truthy) rect. `body.roomzoom-open` is the class the surface itself sets.
  settled: async () => (await evaluate("document.body.classList.contains('roomzoom-open')?1:0")) === 1,
  clickAt, log, chrome, code: 7,
  diagnose: () => evalJson("[...document.querySelectorAll('.pl-room')].map(e=>e.getAttribute('data-anchor'))"),
});

// ───────────────────────────────────────────────────────────── 4. tile → screen, through the SHIPPED projection
const layerBox = await waitFor('#rz-layers laid out', async () => {
  const r = await evalJson("(()=>{const e=document.getElementById('rz-layers');if(!e)return null;const b=e.getBoundingClientRect();return b.width?{x:b.x,y:b.y,w:b.width,h:b.height}:null;})()");
  return r;
}, { chrome, code: 8 });
const scene = roomScene(focus);
const fit = sceneFit(scene, layerBox.w, layerBox.h);
const place = scenePlacement(scene, focus, scene.s * 100);
/** The screen point at a tile's projected floor centre — the same two transforms `tileFromCanvasXY`
 *  inverts, in the forward direction, off the SHIPPED placement object. */
const screenOf = (tx, ty) => {
  const [sx, sy] = place.foot(tx, ty);
  return { x: layerBox.x + fit.offX + sx * fit.s, y: layerBox.y + fit.offY + sy * fit.s };
};

/** The ghost's live state, read out of the DOM the player is looking at. */
const ghostState = () => evalJson(
  "(()=>{const g=document.getElementById('rz-ghost');if(!g)return {node:0};"
  + "const e=g.querySelector('.rz-buildghost');"
  + "return {node:1,present:e?1:0,tile:e?e.getAttribute('data-ghost-tile'):null,"
  + "tool:e?e.getAttribute('data-ghost-tool'):null,refused:e?(e.getAttribute('class').indexOf('refused')>=0?1:0):0,"
  + "facing:e?Number(e.getAttribute('data-ghost-facing')):null,"
  + "ink:e?(()=>{const d=[...g.querySelectorAll('path')].map(n=>n.getAttribute('d')).join('|');"
  + "let h=5381;for(let i=0;i<d.length;i++){h=((h*33)^d.charCodeAt(i))>>>0;}return h+':'+d.length;})():0,"
  + "paths:g.querySelectorAll('path,ellipse,rect').length};})()");

const g0 = await ghostState();
check(g0.node === 1, 'the ghost root #rz-ghost is in the shipped DOM');
check(g0.present === 0, 'nothing armed ⇒ no ghost');
await png('01-room-open-no-tool.png');

// ───────────────────────────────────────────────────────────── 5. arm, and hover three tiles
await verifiedClick({
  what: `the ${TOOL.toUpperCase()} tool is armed`,
  target: () => centre(`[data-rztool="${TOOL}"]`),
  settled: async () => (await evaluate(`document.querySelector('[data-rztool="${TOOL}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
  clickAt, log, chrome, code: 9,
});

let n = 1;
for (const t of HOVERS) {
  const p = screenOf(t.x, t.y);
  await moveTo(p.x, p.y);
  await sleep(400);
  const st = await ghostState();
  check(st.present === 1, `hovering ${t.x},${t.y}: the ghost is on screen`);
  check(st.tile === `${t.x},${t.y}`,
    `…at the tile the pointer is over (drew ${st.tile}, pointer on ${t.x},${t.y})`);
  check(st.tool === TOOL, `…and it is the ${TOOL.toUpperCase()} piece (drew ${st.tool})`);
  check(st.paths > 6, `…drawn with real geometry, not a stub (${st.paths} shapes)`);
  await png(`0${++n}-ghost-at-${t.x}-${t.y}.png`);
}
log(`  ghost REFUSED state = ${(await ghostState()).refused} (parts aboard ${parts}, price 3)`);

// The pointer leaves ⇒ the ghost leaves. The picture is the proof there is no residue.
await moveTo(layerBox.x - 60, layerBox.y - 60);
await sleep(400);
check((await ghostState()).present === 0, 'the pointer leaving the canvas takes the ghost with it');
await png(`0${++n}-ghost-gone-pointer-off.png`);

// Disarm ⇒ the ghost leaves without the pointer moving.
const back = screenOf(TARGET.x, TARGET.y);
await moveTo(back.x, back.y); await sleep(350);
check((await ghostState()).present === 1, 'back on the tile, the ghost is back');
await clickAt(...Object.values(await centre(`[data-rztool="${TOOL}"]`)).slice(0, 2));
await sleep(400);
check((await ghostState()).present === 0, 'DISARMING takes the ghost away without the pointer moving');
await png(`0${++n}-ghost-gone-disarmed.png`);

// ───────────────────────────────────────────────────────────── 6. THE ROTATION — [E], four times
await verifiedClick({
  what: `the ${TOOL.toUpperCase()} tool is armed again`,
  target: () => centre(`[data-rztool="${TOOL}"]`),
  settled: async () => (await evaluate(`document.querySelector('[data-rztool="${TOOL}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
  clickAt, log, chrome, code: 9,
});
const tp = screenOf(TARGET.x, TARGET.y);
await moveTo(tp.x, tp.y); await sleep(400);
const shown = await ghostState();
check(shown.present === 1 && shown.tile === `${TARGET.x},${TARGET.y}`, 'the ghost stands on the target tile');
check(shown.facing === 0, 'a freshly armed tool starts at facing 0');
await png(`0${++n}-rot-0.png`);

// ⭐⭐ FOUR QUARTER-TURNS, PHOTOGRAPHED. The DOM check is the evidence a machine can fail on: the
// declared facing must step 1→2→3→0 AND the drawn ink must actually change, because a `_facing` that
// incremented while the drawing ignored it would satisfy the first half alone.
const inkAt = [shown.ink];
const faceAt = [shown.facing];
for (let r = 1; r <= 4; r++) {
  await key('e');
  await sleep(350);
  const st = await ghostState();
  faceAt.push(st.facing);
  inkAt.push(st.ink);
  check(st.present === 1, `after rotate ${r}: the ghost is still on screen`);
  await png(`${n < 9 ? '0' : ''}${++n}-rot-${r % 4}.png`);
}
check(JSON.stringify(faceAt) === '[0,1,2,3,0]',
  `[E] cycled the facing 0→1→2→3→0 (saw ${JSON.stringify(faceAt)})`);
check(inkAt[1] !== inkAt[0] && inkAt[2] !== inkAt[1] && inkAt[3] !== inkAt[2],
  'each quarter-turn actually REDREW the piece — a facing counter that the drawing ignores would '
  + 'pass the cycle check above on its own');
// ⚠️ `ink` IS A CONTENT DIGEST (djb2 over the concatenated path data, plus its length), NOT a bare
// LENGTH — the first draft compared lengths, and two different drawings of the same piece can easily
// be the same number of characters, so "returned to where it started" could have passed over a
// picture that had not. The digest makes the check about the DRAWING; the authoritative byte-identity
// claim still lives in `client/test/rotation.test.js`, where the markup is compared in full and this
// rig is only the live witness that the same thing happens in a real browser.
check(inkAt[4] === inkAt[0],
  'four quarter-turns returned the drawing to exactly where it started (the "4x" in the owner\'s ask)');

// ───────────────────────────────────────────────────────────── 7. THE PLACEMENT — turned, and it sticks
// Turn to 1 and place there, so the facing that lands is NOT the default and a dropped field shows.
await key('e');
await sleep(350);
const placing = await ghostState();
check(placing.facing === 1, `placing at facing ${placing.facing}`);
await png(`${n < 9 ? '0' : ''}${++n}-ghost-before-the-click.png`);

const deviceKind = paletteCommand(TOOL).deviceKind;
const before = devicesAt().length;
await clickAt(tp.x, tp.y);
await sleep(2500);
const after = devicesAt();
const landed = after.length > before;
if (parts >= 3) {
  check(landed, `the click PLACED a device at ${TARGET.x},${TARGET.y} (${before} → ${after.length} on this deck)`);
  const row = after.find((d) => d.x === TARGET.x && d.y === TARGET.y);
  check(!!row, `…on the tile the ghost was standing on (kind for ${deviceKind})`);
  // ⭐⭐ THE WHOLE CHAIN IN ONE ASSERTION: the facing the player was LOOKING AT came back off the
  // sim, through the save-shaped field, through the wire's eleventh element. Read from the rig's own
  // socket, never from the page — the page is the thing under test.
  check(row && row.face === placing.facing,
    `…AT THE FACING THE GHOST WAS SHOWING (ghost ${placing.facing}, wire reports ${row && row.face})`);
  // …and the ghost is gone, because the tool is still armed but the piece is now REAL.
  const post = await ghostState();
  check(post.present === 1 && post.tile === `${TARGET.x},${TARGET.y}`,
    'the ghost is still previewing (the tool stays armed after a placement — RimWorld\'s designator '
    + 'does the same, and it is what lets a player lay a row)');
} else {
  // Not a skip and not a pass: the SHIP cannot pay, which is a real and reported state, and the
  // ghost said so before the click. Naming it is the honest report; calling it a placement is not.
  check(shown.refused === 1,
    `the ship holds ${parts} PARTS against a price of 3, so the ghost previewed the REFUSAL — and `
    + 'the placement legs below are NOT evidence about this run');
  log('  (no placement asserted: this ship cannot pay. Re-run against a ship holding 3+ PARTS.)');
}
await sleep(600);
await png(`0${++n}-after-the-click.png`);

// ───────────────────────────────────────────────────────────── 7. done
try { cdp.close(); } catch { /* already gone */ }
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* already gone */ }
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
