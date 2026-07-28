#!/usr/bin/env node
// door-shot.mjs — PHOTOGRAPH a CLOSED DOOR inside a room rect on the STANDARD SURFACE.
//
// ⚠️ WHY THIS EXISTS, and why it is committed rather than left in a scratchpad. Every assertion
// about the door fix reads a STRING. A test can prove `furnitureSvg` emitted a `<g>` for the tile
// and still say nothing about whether a player SEES a door: an SVG group paints nothing if it is
// clipped, if it is under an opaque layer, or if the piece's own geometry lands outside the tile.
// `marks-shot.mjs` exists for exactly the same reason and its header records the WP-2 mark layer
// that was mutation-green and invisible. This is that rig for the door.
//
// WHAT IT SHOWS. The defect is that a CLOSED door inside a room rect drew the VS-Z-25 dashed chip
// with a raw `+` in it (and NOTHING at all once a ground stack shared the tile). The old
// `NO_FURNITURE_SPRITE.Door` allowlist entry claimed a "structure layer" drew doors and that there
// were ZERO in-rect door tiles on `--ship grid`; both are false — every room's door sits on that
// room's own rect edge, and nothing anywhere drew a door.
//
// HOW IT PRODUCES THE CASE, deterministically and in one tick rather than by waiting for a build:
// the grid ship's room doors boot OPEN, and `GameSession.ContextAction` toggles a door under the
// cursor, so `{"cmd":"click",x,y}` on a door tile SHUTS it. `GlyphMapper.DeviceGlyph` then projects
// `'+'` instead of `'/'` and the Room Zoom has the case under test. (The player's own route to the
// same tile is the DOOR tool on the palette — `BuildSystem.cs` starts a built door CLOSED — but that
// costs Regolith and crew-minutes, which would make this tool flaky for no extra evidence.)
//
// It shoots the SAME room twice, open then closed, so the pair is a controlled comparison rather
// than one picture that has to be believed. Run it once on the fix and once with
// `dev('Door', '+')` reverted to `dev('Door', null)` to photograph the before/after.
//
// USAGE
//   1. ./play.sh --host-port 8372 --client-port 8373 --no-open
//   2. node client/tools/door-shot.mjs --out <dir> [--host-port 8372] [--client-port 8373] [--deck 0]
//
// Exits non-zero if the host will not answer, if no in-rect door tile can be found, if the door
// will not shut, or if Chrome never paints — a green run with no pictures is the failure this tool
// exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8372');
const CLIENT_PORT = +arg('client-port', '8373');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'door-');
const DECK = +arg('deck', '0');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9345');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
mkdirSync(OUT, { recursive: true });

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

// DECK IS GLOBAL SESSION STATE (see marks-shot.mjs's note) — step toward the target with the right
// sign rather than only upward.
for (let i = 0; i < 16; i++) {
  const cur = latest.get('frame')?.deck | 0;
  if (cur === DECK) break;
  send({ cmd: 'deck', dz: Math.sign(DECK - cur) });
  await sleep(450);
}
await sleep(1500);
if ((latest.get('frame')?.deck | 0) !== DECK) die(2, 'could not reach deck ' + DECK);

const frameNow = () => latest.get('frame');
const charAt = (x, y) => {
  const f = frameNow(); const c = f?.cells?.[y * f.w + x];
  return Array.isArray(c) ? String.fromCharCode(c[0] | 0) : null;
};

// Geometry through the CLIENT'S OWN modules, never re-parsed here, so this tool cannot drift from
// what the surface believes the room rects are.
const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots, itemForGlyph } = await import('../src/ui/room-model.js');
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const rooms = deckSlots(dView, DECK).filter((s) => s.anchorName)
  .map((s) => ({ anchor: s.anchorName, ...s.rect }));
log('rooms on deck', DECK + ':', rooms.map((r) => `${r.anchor}@${r.x},${r.y} ${r.w}x${r.h}`).join(' | ') || '(none)');

// THE CENSUS IS PART OF THE EVIDENCE, not a preamble: it is the measurement that retracts
// "zero such tiles today (the ship's doors sit on room boundaries, which are outside every room
// rect)". Printed for every door on the deck, in-rect or not.
const doors = [];
{
  const f = frameNow();
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const ch = charAt(x, y);
    if (ch !== '+' && ch !== '/' && ch !== 'X') continue;
    const inRoom = rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    doors.push({ x, y, ch, room: inRoom ? inRoom.anchor : null });
  }
}
log(`DOOR CENSUS deck ${DECK}: ${doors.length} door tiles, ` +
    `${doors.filter((d) => d.room).length} of them INSIDE a room rect`);
for (const d of doors) log(`  (${d.x},${d.y}) '${d.ch}' → ${d.room || 'NO ROOM'}`);

const target = doors.find((d) => d.room && d.ch === '/');
if (!target) die(3, 'no OPEN door inside a room rect on deck ' + DECK + ' — nothing to shut');
log('TARGET', target);

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'door-shot-'));
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
await sleep(6000);

// The onboarding takeover swallows both the screenshot and the room click on a fresh profile —
// dismissed with a REAL pointer click on its own BEGIN button (marks-shot.mjs's note).
const onb = await evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
if (onb && onb !== 'null') { const { x, y } = JSON.parse(onb); await click(x, y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`))
  die(8, 'the onboarding card is still up — every screenshot below would photograph it');

/** Enter `anchor` from the Overview with a real pointer click on the room. */
async function enterRoom(anchor) {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(2000);
  const box = await evaluate(`JSON.stringify((()=>{const e=document.querySelector('.pl-room[data-anchor="${anchor}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
  if (!box || box === 'null') die(7, `room element .pl-room[data-anchor="${anchor}"] not in the DOM`);
  const { x, y } = JSON.parse(box);
  await click(x, y);
  await sleep(3500);
}

// ⚠️ `Runtime.evaluate` with `returnByValue` hands back the STRING these snippets stringify, so the
// result MUST be parsed. It was read as an object in this tool's first run and every field came back
// `undefined` — the verdict printed "THE CLOSED DOOR HAS NO FURNITURE GROUP" while the very line
// above it showed `furnitureForTargetTile: true`. A tool that can print a false ⛔ is worse than no
// tool; the contradiction was visible only because both were printed.
const probeJson = async (expr) => { const s = await evaluate(expr); try { return JSON.parse(s); } catch { return { err: 'unparseable', raw: s }; } };

/** What the Room Zoom actually PUT IN THE DOM for the target tile, and its painted box. */
const probe = () => probeJson(`JSON.stringify((()=>{
  const layers = document.getElementById('rz-layers'); if (!layers) return {err:'no #rz-layers'};
  const html = layers.innerHTML;
  const chips = [...html.matchAll(/stroke-dasharray="3 2"/g)].length;
  const rawPlus = html.includes('>+</text>');
  // The furniture group's own defs ids are namespaced 'rz-f-<tx>-<ty>', which is how a test names a
  // tile. ⚠️ TAKE THE INNERMOST match: every ANCESTOR group contains the substring too, so a bare
  // .find() returns the whole layer and reports a 844×587 "door".
  const furn = html.includes('rz-f-${target.x}-${target.y}');
  const hits = [...layers.querySelectorAll('g')].filter((n) => n.innerHTML.includes('rz-f-${target.x}-${target.y}'));
  const g = hits.length ? hits[hits.length - 1] : null;
  const r = g ? g.getBoundingClientRect() : null;
  return { chips, rawPlus, furnitureForTargetTile: furn, groups: hits.length,
           box: r ? {w:+r.width.toFixed(1), h:+r.height.toFixed(1), vis:getComputedStyle(g).visibility, op:getComputedStyle(g).opacity} : null };
})())`);

// ── BEFORE: the door is OPEN. An open doorway is a GAP and correctly draws nothing. ──
await enterRoom(target.room);
log('OPEN  door at', `(${target.x},${target.y})`, 'glyph', JSON.stringify(charAt(target.x, target.y)), '→', await probe());
await png('roomzoom-open.png');

// ── shut it, over the wire, and confirm the PROJECTION really moved before photographing ──
send({ cmd: 'click', x: target.x, y: target.y });
for (let i = 0; i < 20 && charAt(target.x, target.y) !== '+'; i++) await sleep(400);
if (charAt(target.x, target.y) !== '+')
  die(4, `the door at (${target.x},${target.y}) will not shut — it still projects `
      + JSON.stringify(charAt(target.x, target.y)) + ', so there is nothing to photograph');
log(`the door SHUT: the frame now projects '+' at (${target.x},${target.y})`);
await sleep(2000);

// ── AFTER: the door is CLOSED. This is the tile that drew a dashed box with a `+` in it. ──
await enterRoom(target.room);
const after = await probe();
log('CLOSED door at', `(${target.x},${target.y})`, '→', after);
log('itemForGlyph("+") =', JSON.stringify(itemForGlyph('+'.charCodeAt(0))));
await png('roomzoom-closed.png');

// A tight crop on the door tile itself, located from the LIVE DOM rather than recomputed here.
const clip = await probeJson(`JSON.stringify((()=>{
  const layers=document.getElementById('rz-layers'); if(!layers) return null;
  const all=[...layers.querySelectorAll('g')];
  const inner=(sub)=>{const h=all.filter(n=>n.innerHTML.includes(sub)); return h.length?h[h.length-1]:null;};
  const g=inner('rz-f-${target.x}-${target.y}') || inner('stroke-dasharray="3 2"');
  if(!g) return null; const r=g.getBoundingClientRect(); const pad=70;
  return {x:Math.max(0,r.x-pad), y:Math.max(0,r.y-pad), width:r.width+pad*2, height:r.height+pad*2};
})())`);
if (clip) await png('roomzoom-closed-crop.png', clip);
else log('  (nothing in the DOM for the door tile — NO CROP, which is itself the finding)');

// …and the Level-1 Overview, where an unskinned glyph is not a chip but SILENTLY ABSENT.
await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(2500);
log('OVERVIEW furniture groups =', await evaluate(`document.querySelectorAll('.pl-furniture > g').length`));
await png('overview-closed.png');

// THE VERDICT, printed rather than left to the reader of the pictures.
if (!after.furnitureForTargetTile) {
  console.error('\n⛔ THE CLOSED DOOR HAS NO FURNITURE GROUP IN THE DOM.');
  console.error(after.rawPlus ? '   It drew the VS-Z-25 dashed chip with a raw `+` in it — the bug.'
                              : '   It drew NOTHING AT ALL — the worse half of the bug.');
} else {
  log('\n✅ the closed door drew a real furniture piece at its tile;', after.chips,
      'unknown chips remain in the room and rawPlus =', after.rawPlus);
}

cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(0);
