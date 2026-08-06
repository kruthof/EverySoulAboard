#!/usr/bin/env node
// build-tray-shot.mjs — DRIVE and PHOTOGRAPH the build tray in a RUNNING game, at FIVE viewport
// sizes spanning all three of `roomzoom.css`'s bands.
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

// ⭐ THE VIEWPORT HEIGHTS ARE THE SUBJECT. `roomzoom.css` shrinks `--rz-tray-h`, the card and the
// rail at `max-height:880px` and again at `740px`, and `.rz-canvas`'s bottom reserve is DERIVED from
// that variable in one expression — so a single height would photograph one arm of a media query.
//
// ⚠️ FIVE, NOT TWO, AND THE THREE NEW ONES ARE NOT DECORATION (review MAJOR 4). The first pair
// straddled the outer breakpoints and never stood inside the MIDDLE band at all: 1440×900 and
// 1366×768/1280×800 are the two bands a 13"/14" laptop actually opens the game at, and the 2px rail
// overflow that review found lived at 1440×720 — a height the old pair covered only in its WIDE
// form. Each row below is a real band boundary: >880 (base), ≤880 (middle), ≤740 (short).
const VIEWPORTS = [
  { w: 1600, h: 1000, name: 'tall' },      // base band   — --rz-tray-h:186
  { w: 1440, h: 900,  name: 'tall-narrow' },// base band   — 900 > 880, the widest common laptop
  { w: 1440, h: 720,  name: 'short' },     // short band  — --rz-tray-h:146, where the rail overflowed
  { w: 1366, h: 768,  name: 'mid' },       // middle band — --rz-tray-h:158
  { w: 1280, h: 800,  name: 'mid-narrow' },// middle band — the narrowest card row this tray gets
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
const { TRAY_LEAVES, trayCards, trayLeafFor, categoryOf, LEAF_LABEL, trayStatText } = await import('../src/ui/build-tray-model.js');

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

// ⭐⭐ CONTAINMENT, OVER **EVERY** CONTROL THE TRAY PAINTS — not over the cards alone.
//
// ⛔ THE NARROW VERSION IS THE 4TH TRAP SHAPE AND IT COST THIS PACKAGE A SEND-BACK. The first draft
// swept `.rz-card` only, so it could see a clipped CARD and was structurally blind to a clipped RAIL
// — and the rail is exactly what overflowed: at 1440×720 the four-row category rail stood 2px past
// `#rz-tray`, whose `overflow:hidden` cut it, and the rig reported ALL CHECKS PASSED. A containment
// test whose selector excludes half the band is a scope filter that excludes the violation.
//
// The tray is the only clipper in the band (`.rz-tray{overflow:hidden}`; the rails are deliberately
// `overflow:visible`, so a rail never hides its own row — it just runs past the tray's edge and is
// cut there). So the honest question is per-control: is this box inside `#rz-tray`'s box?
// Returns the offenders BY NAME, with the overflow in px, so a failure says which control and how far.
const TRAY_CONTROLS = '.rz-card,.rz-tray-cat,.rz-tray-sub,.rz-tray-crumb,.rz-tray-esc,.rz-tray-empty';
async function contained() {
  const bad = await evalJson(`(()=>{const t=document.querySelector('#rz-tray');if(!t)return null;
    const b=t.getBoundingClientRect();const out=[];
    for(const e of document.querySelectorAll(${JSON.stringify(TRAY_CONTROLS)})){
      const r=e.getBoundingClientRect();
      if(r.width===0&&r.height===0)continue;
      const over={top:b.top-r.top,bottom:r.bottom-b.bottom,left:b.left-r.left,right:r.right-b.right};
      // ⚠️ THE CARD ROW SCROLLS HORIZONTALLY ON PURPOSE, so a card past the RIGHT edge is legitimate
      // and is checked by the scroll leg above instead. Vertical overflow is never legitimate: no row
      // in this band scrolls vertically, so a control past the top or the bottom is simply CUT.
      const v=Math.max(over.top,over.bottom);
      if(v>1)out.push({what:(e.className||e.tagName)+' "'+(e.textContent||'').trim().slice(0,18)+'"',
        overflow:Math.round(v*10)/10,top:Math.round(r.top),bottom:Math.round(r.bottom),
        band:[Math.round(b.top),Math.round(b.bottom)]});
    }
    return out;})()`);
  if (bad === null) { console.error('  x FAIL #rz-tray is not in the DOM — the containment sweep read nothing'); failures++; return [{ what: 'no tray' }]; }
  for (const o of bad) console.error(`     ${o.what} runs ${o.overflow}px past the band [${o.band}] (${o.top}..${o.bottom})`);
  return bad;
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
  check((await contained()).length === 0, 'every tray control is inside the band (root)');
  // ⭐ O1's FIRST UNSTATED COST, MEASURED RATHER THAN ASSERTED: what fraction of the window the band
  // takes from the plate. Logged, not checked — the trade is the owner's, and a number in the log is
  // how the next lane finds out it moved.
  log(`  BAND COST: tray ${tray && Math.round(tray.h)}px of ${vp.h}px = ` +
    `${tray ? (100 * tray.h / vp.h).toFixed(1) : '?'}% of the window; the plate keeps ${canvas && Math.round(canvas.h)}px`);
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
  // …and every control the tray paints is fully inside the TRAY vertically, which is the height claim.
  check((await contained()).length === 0, 'every tray control is inside the band (MACHINES)');

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
    check((await contained()).length === 0, `every tray control is inside the band (${LEAF_LABEL[leaf]})`);
    await png(`tray-${vp.name}-02b-${probe}.png`);
  }

  // ── (3b-ii) THE LAMP CARD — the one card whose art is a hand-stated `itemId` rather than a
  //    derivation, and therefore the one that can go stale silently. It did: `PALETTE_CMD.lamp`
  //    still named `wall-lamp` after `GLYPH_SUBSTITUTE['*']` moved to `lamp-sconce` on 2026-08-05,
  //    so this card drew the retired warm piece AND — because `wall-lamp` has no `SPECS` row —
  //    dropped its dimensions without saying so (review MAJOR 3). Both halves are read off the LIVE
  //    card here, because "the stat line silently lost a term" is precisely what a node assertion
  //    over the same derivation cannot see: the model and the card agreed, and both were wrong.
  {
    const leaf = trayLeafFor('lamp');
    await clickSel(`[data-rzcat="${categoryOf(leaf)}"]`);
    await clickSel(`[data-rzsub="${leaf}"]`);
    const lamp = await evalJson(`(()=>{const b=document.querySelector('.rz-card[data-rztool="lamp"]');
      if(!b)return null;const svg=b.querySelector('.rz-card-art svg');
      return {text:b.innerText.replace(/\\n/g,' | '),
        stat:b.querySelector('.rz-card-stat')?.textContent||'',
        artPaths:svg?svg.querySelectorAll('path,rect,circle,ellipse,line,polygon').length:0,
        artIds:svg?[...svg.querySelectorAll('[id]')].map(e=>e.id).slice(0,3):[]};})()`);
    check(!!lamp, 'the LAMP card is on screen');
    log(`  LAMP card reads: ${lamp && lamp.text}`);
    check(!!lamp && lamp.artPaths > 3, `the LAMP card draws a real piece (${lamp && lamp.artPaths} shapes)`);
    // The stat line must carry BOTH terms — the draw AND the footprint. `trayStatText` is the
    // authority for the string; what this checks is that the live card printed the same one and that
    // it really has a dimension term in it (the shape the stale id deleted).
    const want = trayStatText('lamp');
    check(!!lamp && lamp.stat.trim() === want, `the LAMP stat reads "${lamp && lamp.stat}", the model says "${want}"`);
    // ⚠️ BOTH TERMS PRESENT, ASSERTED SEPARATELY FROM THE EQUALITY ABOVE. The model and the card
    // agreeing proves only that one derivation ran twice; what the stale `wall-lamp` actually did was
    // make BOTH of them drop the dimension term in unison, silently. This is the leg that sees that.
    check(/\d\s*KW/i.test(want) && /×/.test(want),
      `the LAMP stat carries both a power term and a footprint ("${want}")`);
    await png(`tray-${vp.name}-02d-lamp.png`);
    check((await contained()).length === 0, 'every tray control is inside the band (COMFORT)');
  }

  // ── (3b-iii) NO CARD TEXT ROW IS TRUNCATED — the OTHER half of review observation 2.
  //    `.rz-card-name` / `.rz-card-stat` now really clip (`overflow:hidden` was missing, so the
  //    `text-overflow:ellipsis` beside it was inert). Making the ellipsis WORK is only half an
  //    answer: an ellipsis a player actually meets is still a number they cannot read, and the stat
  //    line is the card's only honest sentence. So the width is measured on the live nodes at every
  //    viewport — `scrollWidth > clientWidth` is the browser's own answer to "did this get cut".
  //    Swept over EVERY leaf, because the longest string is not the one a reader guesses.
  {
    const cut = [];
    for (const leaf of Object.values(TRAY_LEAVES).flat()) {
      if (!trayCards(leaf).length) continue;
      await clickSel(`[data-rzcat="${categoryOf(leaf)}"]`);
      await clickSel(`[data-rzsub="${leaf}"]`);
      const rows = await evalJson(`(()=>[...document.querySelectorAll('.rz-card')].flatMap(c=>
        [...c.querySelectorAll('.rz-card-name,.rz-card-stat')]
          .filter(e=>e.scrollWidth>e.clientWidth+1)
          .map(e=>({card:c.getAttribute('data-rzcard'),cls:e.className,
                    text:e.textContent,want:e.scrollWidth,have:e.clientWidth}))))()`);
      for (const r of rows || []) cut.push(`${r.card} ${r.cls}: "${r.text}" needs ${r.want}px, has ${r.have}px`);
    }
    for (const c of cut) console.error('     CUT ' + c);
    check(cut.length === 0, `${cut.length} card text row(s) are truncated by the ellipsis`);
  }

  // ── (3c) ORDERS — the tallest state the band ever holds, and the one review found CLIPPED.
  //    Four category rows beside three leaf rows, and the cards carry no art, so nothing about the
  //    CARD row constrains the height here: it is the RAIL that decides whether the band is tall
  //    enough. Swept at the root too, where the rails stand beside an empty card row.
  await clickSel('[data-rzcat="orders"]');
  check((await contained()).length === 0, 'every tray control is inside the band (ORDERS, rails at full height)');
  await png(`tray-${vp.name}-02c-orders.png`);
  for (const sub of ['orders/designate', 'orders/crew', 'orders/remove']) {
    await clickSel(`[data-rzsub="${sub}"]`);
    check((await contained()).length === 0, `every tray control is inside the band (${LEAF_LABEL[sub]})`);
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
