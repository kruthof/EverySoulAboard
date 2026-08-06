#!/usr/bin/env node
// ring-press-shot.mjs — THE WHOLE-RECT PRESS MAP. Press EVERY tile the Room Zoom DRAWS — ring
// included — and record, per tile, what the surface sent and what the sim said back.
//
// ⛔⛔ WHY IT EXISTS, AND IT IS CLAUDE.md's 9th TRAP SHAPE WITH A RECEIPT. `place-census-shot.mjs`
// insets its tile list by one on every side, so it presses only INTERIOR floor. That inset is
// correct for what that census measures and it made it structurally BLIND to the defect the owner
// reported on 2026-08-06: the Room Zoom's focus rect is WALL-INCLUSIVE (`SlotGridPlanner`'s
// `SlotDescriptor` = interior−1 by interior+2), the cutaway drew a floor quad across all of it, and
// `clampTileToRoom` accepted every tile — so 36 of a 12×8 compartment's 96 drawn tiles were solid
// wall offered as clean, ghost-previewable floor, and no instrument in the repo pressed one.
//
// ⭐ SO THE RULE THIS FILE ENFORCES IS: **a question about what the surface OFFERS must press the
// drawn rect, not the interior.** It reads the `placerefused` REASON BYTE off the wire rather than
// classifying a toast sentence with a regex — an earlier cut of this rig scored "NOBODY COULD STAND
// HERE" and "SOMETHING IS ALREADY STANDING HERE" as the same letter and reported a map that was
// wrong in both directions.
//
// It also reports `offby`: whether the press at a tile's OWN CENTRE (`scenePlacement.foot`, the
// point the build ghost is drawn on) came back as that tile. That column is what caught the second
// half of the same defect — a tall piece's ink covering the floor centre of the tile in front of it.
//
// USAGE
//   1. ./play.sh --host-port 8676 --client-port 8677 --no-open
//   2. node client/tools/ring-press-shot.mjs --host-port 8676 --client-port 8677 [--anchor cryobay]
//
// MEASURED, shipped wreck, cryo bay (breathable), 96 drawn tiles:
//   before 2026-08-06: 32 × NotWalkable on the ring, 59 × Occupied, 40 tiles resolved off-by-one
//   after:             36 NOT-SENT (ring clamped), 0 × NotWalkable, 18 × Occupied (= the real
//                      device glyphs, exactly), 0 off-by among all 60 sent presses
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, verifiedClick, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8672');
const CLIENT_PORT = +arg('client-port', '8673');
const OUT = resolve(arg('out', 'client/tools/shots-ring-probe'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9394');
const TOOL = arg('tool', 'table');
const HOLD = +arg('hold', '140');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);

const { decodeDecks, decodeRooms } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');

const DECK = (latest.get('frame')?.deck | 0);
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName);
const frame = latest.get('frame');
const WANT = arg('anchor', '');
const ROOM = WANT ? slots.find((s) => s.anchorName === WANT) : slots[0];
if (!ROOM) { console.error('no room'); process.exit(3); }
const focus = { deck: DECK, rx: ROOM.rect.x, ry: ROOM.rect.y, rw: ROOM.rect.w, rh: ROOM.rect.h };
log(`ROOM ${ROOM.anchorName} rect=${focus.rx},${focus.ry} ${focus.rw}x${focus.rh} deck=${DECK}`);
log('rooms on deck: ' + slots.map((s) => `${s.anchorName}@${s.rect.x},${s.rect.y} ${s.rect.w}x${s.rect.h}`).join(' | '));

// The GLYPH under every tile of the drawn rect, from the frame the client itself holds.
const glyphAt = (tx, ty) => {
  const cell = frame.cells[ty * frame.w + tx];
  return Array.isArray(cell) ? String.fromCharCode(cell[0] | 0) : '?';
};
let gmap = '';
for (let ty = focus.ry; ty < focus.ry + focus.rh; ty++) {
  let row = '';
  for (let tx = focus.rx; tx < focus.rx + focus.rw; tx++) row += glyphAt(tx, ty);
  gmap += `  ty=${ty} ${row}\n`;
}
log('GLYPHS INSIDE THE DRAWN RECT:\n' + gmap);

const userDir = mkdtempSync(join(tmpdir(), 'ring-probe-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid', chrome.pid);

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) die(chrome, 5, 'no devtools');

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
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
  return p;
}
const mouse = (type, x, y, buttons = 0) => call('Input.dispatchMouseEvent',
  { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, buttons });
async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0);
}
async function pressAt(x, y, holdMs) {
  await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1);
  await sleep(holdMs); await mouse('mouseReleased', x, y, 0);
}
await call('Page.enable'); await call('Runtime.enable');
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__sent = []; window.__recv = [];
    const o = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { try { const j = JSON.parse(d); if (j && j.cmd) window.__sent.push(j); } catch (e) {} return o.apply(this, arguments); };
    const Orig = window.WebSocket;
    function Patched(u, p) {
      const s = p === undefined ? new Orig(u) : new Orig(u, p);
      s.addEventListener('message', (e) => { try { const m = JSON.parse(e.data); if (m && m.type === 'placerefused') window.__recv.push(m); } catch (x) {} });
      return s;
    }
    Patched.prototype = Orig.prototype;
    Patched.OPEN = Orig.OPEN; Patched.CLOSED = Orig.CLOSED; Patched.CONNECTING = Orig.CONNECTING; Patched.CLOSING = Orig.CLOSING;
    window.WebSocket = Patched;
  })();`,
});
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

await verifiedClick({
  what: `Room Zoom on ${ROOM.anchorName}`,
  target: () => centre(`.pl-room[data-anchor="${ROOM.anchorName}"]`),
  settled: async () => (await evaluate("document.body.classList.contains('roomzoom-open')?1:0")) === 1,
  clickAt, log, chrome, code: 7,
});
const layerBox = await waitFor('#rz-layers', async () => evalJson(
  "(()=>{const e=document.getElementById('rz-layers');if(!e)return null;const b=e.getBoundingClientRect();return b.width?{x:b.x,y:b.y,w:b.width,h:b.height}:null;})()"), { chrome, code: 8 });
const { roomScene, scenePlacement, sceneFit } = await import('../src/ui/room-model.js');
const scene = roomScene(focus);
const fit = sceneFit(scene, layerBox.w, layerBox.h);
const place = scenePlacement(scene, focus, scene.s * 100);
const screenOf = (tx, ty) => {
  const [sx, sy] = place.foot(tx, ty);
  return { x: layerBox.x + fit.offX + sx * fit.s, y: layerBox.y + fit.offY + sy * fit.s };
};
// ⭐⭐ ARMING IS A THREE-STEP WALK NOW, NOT ONE CLICK — the BUILD TRAY (2026-08-05) put every tool
// behind a category rail and a leaf rail, so `[data-rztool]` does not exist in the DOM until the
// player has navigated to it. A rig that clicked straight for the card found nothing and died at the
// gate; this walks the rails exactly as a player must. The leaf is asked of the SHIPPED taxonomy
// (`build-tray-model.js`) rather than hard-coded, so a re-shuffle moves this rig with it.
const { trayLeafFor, categoryOf } = await import('../src/ui/build-tray-model.js');
const LEAF = trayLeafFor(TOOL);
if (!LEAF) die(chrome, 9, `\`${TOOL}\` is in no tray leaf — the taxonomy does not know this tool`);
// ⚠️ `settled` ASKS THIS CATEGORY'S OWN PRESSED STATE. A first draft asked whether ANY leaf/card rail
// existed — true before the click as well as after — so `verifiedClick` reported "open already",
// pressed nothing, and the run died two steps later with a misleading message. The tray sets
// `aria-pressed="true"` on the selected `.rz-tray-cat` (`build-tray-view.js`), which is the state
// that actually changes.
await verifiedClick({
  what: `the ${categoryOf(LEAF)} category is open`,
  target: () => centre(`[data-rzcat="${categoryOf(LEAF)}"]`),
  settled: async () => (await evaluate(
    `document.querySelector('[data-rzcat="${categoryOf(LEAF)}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
  clickAt, log, chrome, code: 9,
});
// A one-leaf category is entered in ONE press, so the leaf rail may legitimately be absent — its
// absence is the design (`tray-arm.js` says so), not a miss, and clicking is conditional on it.
// ⚠️ POLLED, NOT READ ONCE. The rail is painted on the NEXT frame after the category press, so a
// single immediate read finds nothing and the run dies at the card gate having navigated correctly.
// The loop ends as soon as EITHER the leaf row or the card itself is on screen, so a one-leaf
// category costs one extra poll rather than a timeout.
let subBox = null;
for (let i = 0; i < 20; i++) {
  subBox = await centre(`[data-rzsub="${LEAF}"]`);
  if (subBox || await centre(`[data-rztool="${TOOL}"]`)) break;
  await sleep(150);
}
if (subBox) {
  await verifiedClick({
    what: `the ${LEAF} leaf is open`,
    target: () => centre(`[data-rzsub="${LEAF}"]`),
    settled: async () => (await evaluate(
      `document.querySelector('[data-rzsub="${LEAF}"]')?.getAttribute('aria-pressed')==='true'?1:0`)) === 1,
    clickAt, log, chrome, code: 9,
  });
}
// ⛔⛔ A TOOL CARD IS A **TOGGLE**, SO IT IS PRESSED ONCE AND THEN WAITED ON — `verifiedClick` is the
// wrong instrument here and using it cost two runs. That helper re-clicks until its `settled`
// predicate reads true, which on a toggle means arm, disarm, arm, disarm: it pressed the TABLE card
// 49 times in 30 s and read false at the end of every cycle. `tray-arm.js` (the node rigs' shared
// driver) presses exactly once for the same reason.
// The armed signal is the `.on` class, which is what the tray's own shot rig reads
// (`build-tray-shot.mjs`: `!!document.querySelector('.rz-card.on')`).
const cardSel = `.rz-card[data-rztool="${TOOL}"]`;
const isArmed = async () => (await evaluate(
  `document.querySelector(${JSON.stringify(cardSel)})?.classList.contains('on')?1:0`)) === 1;
let armedOk = false;
for (let attempt = 0; attempt < 3 && !armedOk; attempt++) {
  // ⚠️ SCROLLED INTO VIEW FIRST. The card rail scrolls, and a card past its right edge still has a
  // bounding rect — one that lies OUTSIDE the viewport, so the press landed on nothing and the run
  // reported "pressed but never armed" about a card it had never actually hit. `table` is the last
  // of seven in `furniture/fitted`, which is why this bit at all.
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(cardSel)});
    if (e && e.scrollIntoView) e.scrollIntoView({block:'nearest', inline:'center'}); return 1;})()`);
  await sleep(250);
  const box = await centre(cardSel);
  if (!box) die(chrome, 9, `the ${TOOL} card is not in the tray after navigating to its leaf`);
  await clickAt(box.x, box.y);
  for (let i = 0; i < 20 && !armedOk; i++) { await sleep(150); armedOk = await isArmed(); }
}
if (!armedOk) {
  const diag = await evaluate(`JSON.stringify({
    cards: Array.from(document.querySelectorAll('.rz-card')).map(b=>b.getAttribute('data-rztool')+(b.classList.contains('on')?'*':'')),
    anyOn: (document.querySelector('.rz-card.on')||{}).outerHTML ? document.querySelector('.rz-card.on').getAttribute('data-rztool') : null,
    hint: (document.getElementById('rz-hint')||{}).textContent,
    label: (document.querySelector('.rz-tray-label')||{}).textContent,
  })`);
  log('  DIAG ' + diag);
  die(chrome, 9, `${TOOL} never armed — the card was pressed but never wore \`.on\``);
}
log(`  verified: ${TOOL} armed`);
await png('00-armed.png');

// ── press EVERY tile of the drawn rect ──
// ⚠️ MIRRORS `Perilune.Sim.PlaceRefusal` AND MUST BE EXTENDED WITH IT. A code this table does not
// know printed as a bare number and read as noise; `NoFloor = 9` was appended on 2026-08-06 and this
// rig went out with tables that stopped at 8, so its own map could not name the arm the same package
// added. `?` is kept as the fallback so a future gap is LOUD rather than silently blank.
const REASON = { 0: 'NONE(sentinel)', 1: 'NotPlaceable', 2: 'OutOfBounds', 3: 'NotWalkable', 4: 'Blocked',
  5: 'Occupied', 6: 'CannotPay', 7: 'AlreadyQueued', 8: 'TooManyQueued', 9: 'NoFloor' };
const CODE = { 1: 'P', 2: 'O', 3: 'W', 4: '#', 5: 'D', 6: '$', 7: 'Q', 8: 'M', 9: 'V' };
const rows = [];
for (let ty = focus.ry; ty < focus.ry + focus.rh; ty++) {
  for (let tx = focus.rx; tx < focus.rx + focus.rw; tx++) {
    const p = screenOf(tx, ty);
    const s0 = await evaluate("window.__sent.filter(s=>s.cmd==='place').length");
    const r0 = await evaluate('window.__recv.length');
    await pressAt(p.x, p.y, HOLD);
    await sleep(220);
    const sentAll = await evalJson("window.__sent.filter(s=>s.cmd==='place').slice(" + s0 + ")");
    const recvAll = await evalJson('window.__recv.slice(' + r0 + ')');
    const sent = (sentAll || [])[0] || null;
    const rec = (recvAll || [])[0] || null;
    rows.push({
      want: `${tx},${ty}`, glyph: glyphAt(tx, ty),
      sent: sent ? `${sent.x},${sent.y}` : '-',
      onWanted: !!sent && (sent.x | 0) === tx && (sent.y | 0) === ty,
      reason: rec ? (rec.reason | 0) : null,
      reasonName: rec ? (REASON[rec.reason | 0] || String(rec.reason)) : (sent ? 'ACCEPTED' : 'NOT-SENT'),
    });
  }
}
log('\n=== ACCEPTANCE / REFUSAL MAP, per tile of the DRAWN + CLICKABLE rect ===');
log('  glyph: # wall, . floor, other = a device/item.');
log('  said:  . ACCEPTED  # Blocked(wall)  W NotWalkable  D Occupied  $ CannotPay  Q AlreadyQueued'
  + '  M TooManyQueued  V NoFloor  P NotPlaceable  O OutOfBounds  ! not sent  ? code this rig does not know');
let i = 0;
for (let ty = focus.ry; ty < focus.ry + focus.rh; ty++) {
  let g = '', a = '', o = '';
  for (let tx = focus.rx; tx < focus.rx + focus.rw; tx++, i++) {
    const r = rows[i];
    g += r.glyph;
    a += r.reason == null ? (r.sent === '-' ? '!' : '.') : (CODE[r.reason] || '?');
    o += r.onWanted ? ' ' : '*';
  }
  log(`  ty=${String(ty).padStart(2)}  glyph[${g}]  said[${a}]  offby[${o}]`);
}
const tally = {};
for (const r of rows) tally[r.reasonName] = (tally[r.reasonName] || 0) + 1;
log('\nTALLY (all ' + rows.length + ' drawn tiles):');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) log('  ' + String(v).padStart(3) + '  ' + k);
const wallTiles = rows.filter((r) => r.glyph === '#');
const wallRefused = wallTiles.filter((r) => r.reason === 3);
log(`\nWALL TILES INSIDE THE CLICKABLE RECT: ${wallTiles.length}/${rows.length} (${(100 * wallTiles.length / rows.length).toFixed(1)}%)`);
log(`  of those, refused NotWalkable ("NOBODY COULD STAND HERE"): ${wallRefused.length}`);
writeFileSync(join(OUT, 'rows.json'), JSON.stringify(rows, null, 1));
await png('01-after.png');
chrome.kill('SIGKILL');
process.exit(0);
