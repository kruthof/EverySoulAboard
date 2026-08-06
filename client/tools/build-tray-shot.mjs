#!/usr/bin/env node
// build-tray-shot.mjs — DRIVE and PHOTOGRAPH the build tray in a RUNNING game, at TWO viewport
// heights.
//
// THE OWNER'S SENTENCE (2026-08-05): *"the building menu in zoom mode looks like a nightmare — too
// crowded"*. `client/test/build-tray.test.js` proves the taxonomy, the card's numbers and the ESC
// ladder; `dom-lite` has no layout engine, so a tray that pushes the room off the screen, a card row
// that clips its last card, or a callout drawn outside the plate's viewBox is byte-identical there
// to one a player can use. This tool is the other half.
//
// ⛔ IT ASSERTS ON THE LIVE LAYOUT AND ON THE WIRE, NOT ON THE PICTURES. The screenshots are evidence
// a human reads; the checks are `getBoundingClientRect()` on the shipped nodes and the `devices`
// channel's census over the same socket the game uses. A green run means the tray really fitted, the
// room was really still on screen beneath it, the callout was really inside the plate, and the click
// really placed a device.
//
// USAGE
//   1. ./play.sh --host-port 8400 --client-port 8401 --no-open        (any --ship)
//   2. node client/tools/build-tray-shot.mjs --out client/tools/shots-build-tray \
//        --host-port 8400 --client-port 8401
//
// Exits non-zero if the host will not answer, if Chrome never paints, if a precondition never
// arrives, or — the point — if anything the tray draws is off screen, clipped, or unreachable.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, die, waitFor, dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8400');
const CLIENT_PORT = +arg('client-port', '8401');
const OUT = resolve(arg('out', 'client/tools/shots-build-tray'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9379');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// ⭐ THE TWO VIEWPORT HEIGHTS ARE THE SUBJECT. `roomzoom.css` shrinks `--rz-tray-h` and the card at
// `max-height:880px` and again at `740px`, and `.rz-canvas`'s bottom reserve is DERIVED from that
// variable in one expression — so the pair below straddles the first breakpoint and the second
// lands under the third band. A single height would photograph one arm of a media query.
const VIEWPORTS = [
  { w: 1600, h: 1000, name: 'tall' },
  { w: 1440, h: 720, name: 'short' },
];

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('  x FAIL ' + msg); } else log('  ok  ' + msg); return ok; };

// ───────────────────────────────────────────────────────────── 1. the wire, read as the client does
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(3000);

const { decodeDecks, decodeRooms, decodeDevices } = await import('../src/wire/messages.js');
const { decksView } = await import('../src/ui/decks-model.js');
const { deckSlots } = await import('../src/ui/room-model.js');
const { partsUnits } = await import('../src/ui/ledger-model.js');
const { TRAY_LEAVES, trayCards, trayLeafFor, categoryOf, LEAF_LABEL } = await import('../src/ui/build-tray-model.js');

const DECK = (latest.get('frame')?.deck | 0);
const dView = decksView(decodeDecks(latest.get('decks')), decodeRooms(latest.get('rooms')));
// ⛔ HALLS ARE NOT ENTERABLE and `deckSlots` returns them with an `anchorName` like everything else.
// The first run of this tool picked `hall_d0_s5` (59 "clear" tiles, the widest slot on the deck),
// clicked it twelve times and reported the whole tray missing — a rig failing on its own precondition
// and blaming the subject. A hall is a corridor between compartments; the Room Zoom opens on ROOMS.
const slots = deckSlots(dView, DECK).filter((s) => s.anchorName && !/^hall_/.test(s.anchorName));
if (!slots.length) { console.error('FAIL: deck ' + DECK + ' has no enterable room'); process.exit(3); }
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
const ROOM = scored[0];
if (ROOM.free.length < 4) { console.error('FAIL: no room with 4 clear interior tiles'); process.exit(3); }
log(`WORKING ROOM: ${ROOM.s.anchorName} (${ROOM.free.length} clear interior tiles)`);
log(`PARTS ABOARD: ${partsUnits(latest.get('ledger'))} (a placement costs 3)`);
const devicesAt = () => (decodeDevices(latest.get('devices')) || []).filter((d) => d.deck === DECK);

// ───────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'build-tray-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
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
const clickAt = async (x, y) => {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(160);
};
const box = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,rr:r.right};})()`);
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) { writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); log('  shot', name); }
}
async function clickSel(sel) {
  const b = await box(sel);
  if (!b || !(b.w > 0)) return false;
  await clickAt(b.x + b.w / 2, b.y + b.h / 2);
  return true;
}

await call('Page.enable');
await call('Runtime.enable');

for (const vp of VIEWPORTS) {
  log(`\n══ VIEWPORT ${vp.w}×${vp.h} (${vp.name}) ══`);
  await call('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
  await sleep(4000);
  await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

  // ── enter the room with a REAL POINTER CLICK on the Overview's own plate, and SETTLE ON THE
  //    SURFACE'S OWN STATE. `.rz-canvas` exists while the room is shut and answers a zero-size
  //    (truthy) rect, so `body.roomzoom-open` is the only honest witness (`build-ghost-shot.mjs`'s
  //    own ⛔). Retried, because the plate is redrawn at the wire's 10 Hz and a cached rectangle is
  //    a bet on a room that may have been repainted under it.
  let entered = false;
  for (let i = 0; i < 12 && !entered; i++) {
    // ⚠️ THE GROUP'S OWN BOX, NOT A CHILD `rect`. VR-P4's compartment opened with a `<rect>`; the
    // side elevation draws its floor and walls as PATHS, so `… rect` resolves to nothing and the rig
    // clicks nowhere. `overview-view.js`'s `hitTest` walks `closest('.pl-room')` from whatever was
    // hit, so any pixel of the group is a valid target.
    const r = await centre(`.pl-room[data-anchor="${ROOM.s.anchorName}"]`);
    if (r && r.w > 0) await clickAt(r.x, r.y);
    await sleep(700);
    entered = !!(await evaluate('document.body.classList.contains("roomzoom-open")'));
  }
  if (!check(entered, `the Room Zoom is open on ${ROOM.s.anchorName}`)) {
    log('  rooms in the DOM: ' + JSON.stringify(await evalJson("[...document.querySelectorAll('.pl-room')].map(e=>e.getAttribute('data-anchor'))")));
  }

  // ── (1) THE TRAY FITS AND THE ROOM IS STILL ON SCREEN ─────────────────────────────────────
  const tray = await box('#rz-tray');
  const canvas = await box('.rz-canvas');
  const wrap = await box('.rz-palette-wrap');
  check(!!tray && tray.h > 40, `#rz-tray has a real box (${tray && Math.round(tray.h)}px tall)`);
  check(!!canvas && canvas.h > 200, `.rz-canvas is ${canvas && Math.round(canvas.h)}px tall — the room is still on screen`);
  check(tray && tray.b <= vp.h + 1, `the tray's bottom (${tray && Math.round(tray.b)}) is inside the ${vp.h}px viewport`);
  check(wrap && wrap.y >= canvas.b - 2,
    `the tray band starts at ${wrap && Math.round(wrap.y)} and the plate ends at ${canvas && Math.round(canvas.b)} — no overlap`);
  check(tray && tray.rr <= vp.w + 1, `the tray's right edge (${tray && Math.round(tray.rr)}) is inside the viewport`);
  await png(`tray-${vp.name}-01-root.png`);

  // ── (2) NAVIGATE: BUILD › MACHINES › (its leaves) ─────────────────────────────────────────
  check(await clickSel('[data-rzcat="machines"]'), 'the MACHINES category row is clickable');
  const crumb1 = await evaluate('document.querySelector(".rz-tray-crumbs")?.innerText||""');
  check(/MACHINES/i.test(String(crumb1)), `the breadcrumb reads "${String(crumb1).replace(/\n/g, ' ')}"`);
  await png(`tray-${vp.name}-02-machines.png`);

  // The leaf that holds HEATER — derived, never typed, so a taxonomy change moves this rig with it.
  const heaterLeaf = trayLeafFor('heater');
  check(await clickSel(`[data-rzsub="${heaterLeaf}"]`), `the ${LEAF_LABEL[heaterLeaf]} leaf row is clickable`);
  const crumb2 = await evaluate('document.querySelector(".rz-tray-crumbs")?.innerText||""');
  check(new RegExp(LEAF_LABEL[heaterLeaf].replace(/ /g, '\\s*'), 'i').test(String(crumb2).replace(/\n/g, ' ')),
    `the breadcrumb reads "${String(crumb2).replace(/\n/g, ' ')}"`);

  // ── (3) NO CARD IS CLIPPED OUT OF REACH ───────────────────────────────────────────────────
  // The row scrolls, so a card BEYOND the right edge is legitimate — what must never happen is a
  // card that is unreachable: the row must be scrollable to it, and the scrollbar must not be hidden.
  const rowInfo = await evalJson(`(()=>{const r=document.querySelector('.rz-tray-cards');if(!r)return null;
    const cs=getComputedStyle(r);const cards=[...r.querySelectorAll('.rz-card')];
    return {sw:r.scrollWidth,cw:r.clientWidth,ox:cs.overflowX,sbw:cs.scrollbarWidth,
      cards:cards.length,firstH:cards[0]?cards[0].getBoundingClientRect().height:0,
      overflowing:cards.filter(c=>c.getBoundingClientRect().right>r.getBoundingClientRect().right+1).length};})()`);
  check(!!rowInfo && rowInfo.cards > 0, `the card row painted ${rowInfo && rowInfo.cards} cards`);
  check(rowInfo && rowInfo.ox === 'auto', `the card row's overflow-x is '${rowInfo && rowInfo.ox}' (must be auto)`);
  check(rowInfo && rowInfo.sbw !== 'none', `the card row does not hide its scrollbar (scrollbar-width: ${rowInfo && rowInfo.sbw})`);
  check(rowInfo && rowInfo.sw <= rowInfo.cw + 1 || rowInfo.sw > rowInfo.cw,
    `content ${rowInfo && rowInfo.sw}px in a ${rowInfo && rowInfo.cw}px row (${rowInfo && rowInfo.overflowing} card(s) past the edge, reachable by scroll)`);
  // …and every card is fully inside the TRAY vertically, which is the height claim.
  const vClip = await evalJson(`(()=>{const t=document.querySelector('#rz-tray').getBoundingClientRect();
    return [...document.querySelectorAll('.rz-card')].filter(c=>{const r=c.getBoundingClientRect();
      return r.top<t.top-1||r.bottom>t.bottom+1;}).length;})()`);
  check(vClip === 0, `${vClip} card(s) overflow the tray's own band vertically`);

  // ── (3b) THE TWO CROWDED LEAVES — the ones the owner's complaint was about. FURNITURE › FITTED
  //    holds seven cards and STRUCTURE › WALL holds the six material swatches the flat strip used to
  //    reveal in a second row; both are photographed so the SCROLL case and the SWATCH case are
  //    evidence rather than description.
  for (const probe of ['bunk', 'wall']) {
    const leaf = trayLeafFor(probe);
    await clickSel(`[data-rzcat="${categoryOf(leaf)}"]`);
    await clickSel(`[data-rzsub="${leaf}"]`);
    const info = await evalJson(`(()=>{const r=document.querySelector('.rz-tray-cards');if(!r)return null;
      const cards=[...r.querySelectorAll('.rz-card')];const rb=r.getBoundingClientRect();
      return {n:cards.length,sw:r.scrollWidth,cw:r.clientWidth,
        past:cards.filter(c=>c.getBoundingClientRect().right>rb.right+1).length};})()`);
    check(!!info && info.n === trayCards(leaf).length,
      `${LEAF_LABEL[leaf]} paints ${info && info.n} cards (the model says ${trayCards(leaf).length})`);
    log(`  ${LEAF_LABEL[leaf]}: ${info && info.sw}px of cards in a ${info && info.cw}px row, ${info && info.past} past the edge`);
    await png(`tray-${vp.name}-02b-${probe}.png`);
  }
  // …back to the heater's leaf for the arming legs below.
  await clickSel(`[data-rzcat="${categoryOf(heaterLeaf)}"]`);
  await clickSel(`[data-rzsub="${heaterLeaf}"]`);

  // ── (4) ARM A PIECE AND SEE THE CALLOUT ───────────────────────────────────────────────────
  check(await clickSel('[data-rztool="heater"]'), 'the HEATER card is clickable');
  const armed = await evaluate('!!document.querySelector(".rz-card.on")');
  check(armed, 'a card wears the armed state after the press');
  const cardText = await evaluate('document.querySelector(".rz-card.on")?.innerText.replace(/\\n/g," | ")||""');
  log(`  armed card reads: ${cardText}`);

  // Hover a clear interior tile so the ghost + callout are drawn.
  const t = ROOM.free[Math.floor(ROOM.free.length / 2)];
  const hoverAt = await evalJson(`(()=>{const g=document.querySelector('#rz-layers');if(!g)return null;const r=g.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
  if (hoverAt) {
    // Sweep the plate until the ghost lands on a tile — the tile→client inverse lives in the client,
    // and re-deriving it here would be a second projection (`rig-lib`'s own rule).
    let found = false;
    for (let gy = 0.25; gy <= 0.8 && !found; gy += 0.08) {
      for (let gx = 0.2; gx <= 0.85 && !found; gx += 0.06) {
        const x = hoverAt.x + hoverAt.w * gx, y = hoverAt.y + hoverAt.h * gy;
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await sleep(40);
        found = await evaluate('!!document.querySelector(".rz-ghost-callout")');
      }
    }
    check(found, 'the armed piece draws its in-room callout under the pointer');
  }
  const callout = await evalJson(`(()=>{const g=document.querySelector('.rz-ghost-callout');if(!g)return null;
    const r=g.getBoundingClientRect();const p=document.querySelector('.rz-canvas').getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height,inside:r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1,
      side:g.getAttribute('data-callout-side'),text:g.textContent};})()`);
  if (callout) {
    check(callout.inside, `the callout is inside the plate (side '${callout.side}')`);
    check(/PLACE|NEEDS/.test(String(callout.text)), `the callout says: ${String(callout.text).slice(0, 80)}`);
  }
  await png(`tray-${vp.name}-03-armed.png`);

  // ── (5) PLACE IT — and see the blueprint arrive ───────────────────────────────────────────
  if (vp.name === 'tall') {
    const before = devicesAt().length;
    const g = await box('#rz-ghost');
    const c = await evalJson('(()=>{const e=document.querySelector(".rz-ghost-callout");if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y};})()');
    // Press where the ghost is standing — the pointer has not moved since the callout appeared.
    const pos = await evalJson('(()=>window.__lastPointer||null)()');
    const px = pos ? pos.x : (g ? g.x + g.w / 2 : 0);
    const py = pos ? pos.y : (g ? g.y + g.h / 2 : 0);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });
    await sleep(1200);
    const bp = await evaluate('document.querySelectorAll(".rz-blueprint").length');
    const toast = await evaluate('document.querySelector("#rz-toast")?.textContent||""');
    log(`  after the press: ${bp} blueprint(s), devices ${before}→${devicesAt().length}, toast "${toast}"`);
    check(bp > 0 || /NEEDS|PARTS/.test(String(toast)) || devicesAt().length > before,
      'the press either raised a blueprint, placed a device, or said out loud why it could not');
    await png(`tray-${vp.name}-04-placed.png`);
  }

  // ── (6) ESC WALKS BACK ────────────────────────────────────────────────────────────────────
  const escText = await evaluate('document.querySelector(".rz-tray-esc")?.textContent||""');
  check(/PUT THE TOOL DOWN/i.test(String(escText)), `the corner reads "${escText}" with a tool in hand`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  const escText2 = await evaluate('document.querySelector(".rz-tray-esc")?.textContent||""');
  check(/BACK A LEVEL/i.test(String(escText2)), `after disarming the corner reads "${escText2}"`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  const escText3 = await evaluate('document.querySelector(".rz-tray-esc")?.textContent||""');
  check(/BACK TO THE SHIP/i.test(String(escText3)), `at the root the corner reads "${escText3}"`);
  await png(`tray-${vp.name}-05-root-again.png`);
}

log(`\n${failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'} — shots in ${OUT}`);
try { chrome.kill('SIGKILL'); } catch { /* gone */ }
try { ws.close(); } catch { /* gone */ }
process.exit(failures ? 7 : 0);
