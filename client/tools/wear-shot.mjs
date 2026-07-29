#!/usr/bin/env node
// wear-shot.mjs — PHOTOGRAPH THE WEAR JOIN on `--ship wreck`: a machine below the wreck floor
// wearing its post-raid twin, beside an intact one of the SAME KIND, plus the two cryo capsule
// states, plus the SWARF pile a strip actually produces.
//
// ⚠️ WHY THIS EXISTS AND WHY IT IS COMMITTED. Every assertion in `wear-join.test.js` and
// `devices-model.test.js` reads a STRING. A perfectly formed SVG fragment paints nothing if it is
// clipped, drawn outside its tile, or covered by an opaque layer — and the emitted text is
// byte-identical in the working and the broken case. `marks-shot.mjs`, `door-shot.mjs` and
// `wreck-shot.mjs` each exist because a layer was green in assertions and invisible on screen. The
// acceptance for ART is a PHOTOGRAPH, and the owner is the person who judges it; this tool only ever
// claims the pieces RENDER.
//
// WHAT IT SHOWS
//   wear-1-reactor.png            the Room Zoom on REACTOR — three SOLAR WINGS, one intact
//                                 (cond 79/255 = 0.31, above the 0.25 floor) and two wrecked
//                                 (46 and 15). The same piece in both states, side by side.
//   wear-2-reactor-crop.png       a 3× crop of that row, so the two paintings are distinguishable
//   wear-3-cryobay.png            the Room Zoom on CRYO BAY — twelve capsules: OPEN and OCCUPIED,
//                                 eight intact and four below the floor wearing the wrecked twin
//   wear-4-cryobay-crop.png       a 3× crop of the capsule rows
//   wear-5-swarf.png              a SWARF pile on the deck plate, made by STRIPPING a wrecked
//                                 machine (not placed, not faked — the sim produced it)
//   wear-6-swarf-crop.png         a 3× crop of the tile the pile is on
//
// ⚠️ THE SWARF SHOT IS EARNED, NOT STAGED, and that distinction is the whole reason it is worth
// taking. There is no verb that puts an item on the floor: the tool designates a STRIP on a real
// wrecked device through the same `strip` command a player's click lowers to, runs the sim at the
// host's top speed, and waits for a kind-9 row to appear on the `items` channel. If the crew cannot
// reach the machine, or cannot breathe where it stands, no pile appears and this tool FAILS rather
// than photographing something else.
//
// USAGE
//   1. ./play.sh --host-port 8360 --client-port 8361 --no-open      (play.sh opens --ship wreck)
//   2. node client/tools/wear-shot.mjs --out docs/design/shots [--host-port 8360] [--client-port 8361]
//
// Exits non-zero if the host will not answer, if the ship carries no wrecked/intact pair, if no
// Swarf is ever produced, or if Chrome never paints — a green run with no pictures is the failure
// this tool exists to prevent.
//
// ⚠️ A FAILURE AFTER THE CHROME SPAWN LEAKS a headless Chrome and its CDP port, exactly as
// `wreck-shot.mjs`, `door-shot.mjs` and `marks-shot.mjs` do. That is the committed convention here,
// RECORDED rather than re-engineered in this lane. If you hit it:
// `pkill -f "remote-debugging-port=9348"`.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8360');
const CLIENT_PORT = +arg('client-port', '8361');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'wear-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9348');
const SWARF_KIND = 9;                       // ItemStack.cs — the recovery economy's salvage item
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
mkdirSync(OUT, { recursive: true });

// ───────────────────────────────────────────────────── 1. read the sim over its own wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

/** Step to a deck. DECK IS GLOBAL SESSION STATE (marks-shot.mjs's note), so step with the sign. */
async function toDeck(deck) {
  for (let i = 0; i < 16; i++) {
    const cur = latest.get('frame')?.deck | 0;
    if (cur === deck) break;
    send({ cmd: 'deck', dz: Math.sign(deck - cur) });
    await sleep(450);
  }
  await sleep(1200);
  if ((latest.get('frame')?.deck | 0) !== deck) die(2, 'could not reach deck ' + deck);
}
await toDeck(0);

// The threshold comes from the SHIPPING module, not from a number typed here: if the def moves and
// the art follows, this tool follows too, and it can never disagree with the surface it photographs.
const { WRECK_COND_BYTE } = await import('../src/items/wear.js');
const dev = latest.get('devices')?.cells;
if (!Array.isArray(dev) || !dev.length) die(3, 'no `devices` channel — is this host running the wreck?');
log(`devices channel: ${dev.length} rows on this deck's ship; wreck floor = cond < ${WRECK_COND_BYTE}`);

const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));

/** Rows of `deck` inside `slot`'s tile rect. */
const inSlot = (slot, deck) => dev.filter((d) => d[2] === deck
  && d[0] >= slot.rect.x && d[0] < slot.rect.x + slot.rect.w
  && d[1] >= slot.rect.y && d[1] < slot.rect.y + slot.rect.h);

// THE PAIR — a room holding the same DeviceKind both above and below the floor. This is the shot
// that makes the join legible: two of one machine, one picture each. Searched rather than
// hard-coded, so a re-authored wreck moves the shot instead of breaking it.
// ⚠️ CRYOBAY IS SEARCHED LAST, NOT EXCLUDED. It has a pair (twelve CryoPods, eight intact and four
// below the floor) and it gets a shot of its own below, so taking it here would spend both shots on
// one room and never photograph a MACHINE in its two states. Searched last rather than skipped so a
// ship whose only pair is in the cryo bay still produces a picture instead of an error.
let pair = null;
const searchOrder = deckSlots(dView, 0).filter((s) => s.anchorName)
  .sort((a, b) => (a.anchorName === 'cryobay' ? 1 : 0) - (b.anchorName === 'cryobay' ? 1 : 0));
for (const slot of searchOrder) {
  const byKind = new Map();
  for (const d of inSlot(slot, 0)) {
    if (!byKind.has(d[3])) byKind.set(d[3], []);
    byKind.get(d[3]).push(d);
  }
  for (const [kind, rows] of byKind) {
    const worn = rows.filter((r) => r[4] < WRECK_COND_BYTE);
    const fine = rows.filter((r) => r[4] >= WRECK_COND_BYTE);
    if (worn.length && fine.length) { pair = { anchor: slot.anchorName, kind, worn, fine }; break; }
  }
  if (pair) break;
}
if (!pair) die(3, 'no room on deck 0 holds the same DeviceKind both above and below the wreck floor — '
  + 'the side-by-side shot cannot be taken on this ship');
log(`PAIR: room ${pair.anchor}, DeviceKind ${pair.kind} — `
  + `${pair.fine.length} intact (cond ${pair.fine.map((r) => r[4]).join(', ')}) and `
  + `${pair.worn.length} wrecked (cond ${pair.worn.map((r) => r[4]).join(', ')})`);

// ───────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'wear-shot-'));
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
if (!wsUrl) { chrome.kill('SIGKILL'); die(5, 'Chrome never opened a DevTools endpoint'); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
// ⚠️ `returnByValue` hands back the STRING these snippets stringify — PARSE IT. door-shot.mjs's
// header records a run where it was read as an object and every field came back `undefined`.
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const click = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
};
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '3') } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(7000);

// The onboarding takeover swallows both the screenshot and every room click on a fresh profile.
const onb = await evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onb && onb !== 'null') { const { x, y } = JSON.parse(onb); await click(x, y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`))
  die(8, 'the onboarding card is still up — every screenshot below would photograph it');

const escape = async () => {
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(2000);
};
await escape();
await toDeck(0);
await sleep(2500);

/** Enter `anchor` from the Overview with a real pointer click on the room element. */
async function enterRoom(anchor) {
  await escape();
  const box = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${anchor}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
  if (!box || box === 'null') die(7, `room element .pl-room[data-anchor="${anchor}"] not in the DOM`);
  const { x, y } = JSON.parse(box);
  await click(x, y);
  await sleep(3500);
}

/** The Room Zoom's layer box, for a crop. */
async function layerBox() {
  const s = await evaluate(`JSON.stringify((()=>{const e=document.getElementById('rz-layers');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})())`);
  return s && s !== 'null' ? JSON.parse(s) : null;
}

await enterRoom(pair.anchor);
await png('1-' + pair.anchor + '.png');
{
  const b = await layerBox();
  if (b) await png('2-' + pair.anchor + '-crop.png', { x: b.x, y: b.y, width: b.w * 0.6, height: b.h * 0.6 });
}

await enterRoom('cryobay');
await png('3-cryobay.png');
{
  const b = await layerBox();
  if (b) await png('4-cryobay-crop.png', { x: b.x + b.w * 0.05, y: b.y + b.h * 0.05, width: b.w * 0.55, height: b.h * 0.55 });
}

// ───────────────────────────────────────────────────── 3. EARN a Swarf pile with a real strip
// ⚠️ THIS RUNS AFTER THE TWO SHOTS ABOVE, AND THE ORDER IS LOAD-BEARING. Stripping a wrecked
// machine DESTROYS it, so a strip run first would photograph the pair's room with half its
// subject already gone — the wrecked half, which is the half the shot exists for.
// The strip is designated through the same `{cmd:'strip'}` the Room Zoom's V key lowers to. Speed is
// pushed to the host's top rung so 900 s of sim work is a second of wall clock. Nothing here writes
// to the sim directly.
const hasSwarf = () => (latest.get('items')?.cells || []).some((c) => (c[3] | 0) === SWARF_KIND);
if (hasSwarf()) log('a Swarf pile is already on the floor — the strip below is still run, harmlessly');

// Strip the wrecked machines in the pair's room AND every other wrecked device on a breathable deck-0
// room, so a single unreachable target does not sink the shot.
const targets = dev.filter((d) => d[2] === 0 && d[4] < WRECK_COND_BYTE).slice(0, 12);
log(`designating STRIP on ${targets.length} wrecked devices on deck 0`);
for (const t of targets) { send({ cmd: 'strip', x: t[0], y: t[1], on: 1 }); await sleep(120); }
for (let i = 0; i < 5; i++) { send({ cmd: 'speed', delta: 1 }); await sleep(150); }

let swarfAt = null;
for (let i = 0; i < 120 && !swarfAt; i++) {
  await sleep(1000);
  const row = (latest.get('items')?.cells || []).find((c) => (c[3] | 0) === SWARF_KIND && (c[2] | 0) === 0);
  if (row) swarfAt = { x: row[0] | 0, y: row[1] | 0, count: row[4] | 0 };
}
for (let i = 0; i < 5; i++) { send({ cmd: 'speed', delta: -1 }); await sleep(150); }
if (!swarfAt) die(4, 'no Swarf ever appeared on the `items` channel after 12 strips at top speed. '
  + 'Either the crew cannot reach or cannot breathe at any of them, or the salvage rule changed — '
  + 'this tool will not photograph a placed pile and call it a stripped one.');
log(`SWARF: ${swarfAt.count} unit(s) on deck 0 at (${swarfAt.x},${swarfAt.y}) — produced by a strip`);

// Which room is it in? The pile has to be photographed at Level 2 to be seen at all.
const swarfSlot = deckSlots(dView, 0).filter((s) => s.anchorName).find((s) =>
  swarfAt.x >= s.rect.x && swarfAt.x < s.rect.x + s.rect.w
  && swarfAt.y >= s.rect.y && swarfAt.y < s.rect.y + s.rect.h);
if (!swarfSlot) die(4, `the Swarf landed at (${swarfAt.x},${swarfAt.y}), which is in no room rect — `
  + 'the Room Zoom cannot be opened on it');
log(`  …inside room ${swarfSlot.anchorName}`);


await enterRoom(swarfSlot.anchorName);
await png('5-swarf-' + swarfSlot.anchorName + '.png');
{
  // ⚠️ THE CROP IS COMPUTED IN THE PAGE, FROM THE SVG'S OWN viewBox, and the first version of this
  // block was WRONG in a way worth recording: it took the tile's fraction of the room RECT as its
  // fraction of the element's bounding BOX. `#rz-layers` carries `preserveAspectRatio="xMidYMid
  // meet"`, so the drawing is letterboxed inside that box and the two fractions are different — the
  // pile came out half off the edge of the crop. The meet transform is applied here instead.
  const s = await evaluate(`JSON.stringify((()=>{
    const e=document.getElementById('rz-layers'); if(!e) return null;
    const vb=e.viewBox.baseVal, r=e.getBoundingClientRect();
    const k=Math.min(r.width/vb.width, r.height/vb.height);
    return {ox:r.x+(r.width-vb.width*k)/2, oy:r.y+(r.height-vb.height*k)/2, k, vw:vb.width, vh:vb.height};
  })())`);
  if (s && s !== 'null') {
    const m = JSON.parse(s);
    const U = m.vw / swarfSlot.rect.w;                       // viewBox units per tile
    const cx = m.ox + ((swarfAt.x - swarfSlot.rect.x) + 0.5) * U * m.k;
    const cy = m.oy + ((swarfAt.y - swarfSlot.rect.y) + 0.5) * U * m.k;
    const side = U * m.k * 3;                                // three tiles of context
    await png('6-swarf-crop.png', { x: cx - side / 2, y: cy - side / 2, width: side, height: side });
  }
}

log('OK — the wear join is photographed. The owner judges the art; this tool only claims it RENDERS.');
cdp.close();
chrome.kill('SIGKILL');
process.exit(0);
