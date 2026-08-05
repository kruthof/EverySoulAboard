#!/usr/bin/env node
// overview-plate-shot.mjs — PHOTOGRAPH THE SHIP PLATE (VR-P4) AND CENSUS THE LIVE DOM.
//
// ⚠️ WHY THIS EXISTS. `overview-scene.test.js` proves the composer emits a compartment grid and
// `overview-model.test.js` proves the four columns derive their strings from the wire. Neither can
// prove the RUNNING GAME draws a plate: a nested `<svg>` paints nothing if its viewBox is wrong, a
// `vector-effect` rule that does not apply makes every miniature fade to blank paper, and a column
// whose grid template collapses is a green test and an empty screen. The redesign's whole premise is
// that the player can SEE what is in each compartment, so it has to be looked at.
//
// ⚠️ AND IT CHECKS ITSELF FIRST. Step 0 asserts three facts that are TRUE INDEPENDENTLY of this
// package (the ship is the wreck; deck 0 carries eight slots; `cryobay` is on the wire). A negative
// result is only believable after those hold.
//
// WHAT IT SHOWS
//   ovp-1-plate-deck0.png   the plate — masthead, hull capsule, 4×2 compartment grid, four columns
//   ovp-2-plate-deck1.png   the dead deck — the same plate, unpurposed tiles in the UNBUILT dash
//   ovp-3-orders-armed.png  BUILD tab with DIG armed — the footer islands in the paper idiom
//   ovp-4-work-tab.png      the WORK grid island, restyled
//
// USAGE
//   1. ~/.dotnet/dotnet run --project hosts/web -- --port 8392 --ship wreck
//      python3 client/serve.py 8393
//   2. node client/tools/overview-plate-shot.mjs --out client/tools/shots-overview
//
// Exits non-zero if the host will not answer, if the instrument check fails, if the plate's own
// structure is missing from the DOM, or if a console error was logged while it drew.
//
// ⚠️ A FAILURE AFTER THE CHROME SPAWN LEAKS a headless Chrome and its CDP port — the committed
// convention in `no-add-room-shot.mjs` / `wreck-shot.mjs`. If you hit it, kill the RECORDED pid; a
// pattern `pkill` on this box kills a sibling agent's gate (TRAPS 5, 2026-08-03 addendum).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8392');
const CLIENT_PORT = +arg('client-port', '8393');
const OUT = resolve(arg('out', 'client/tools/shots-overview'));
const PREFIX = arg('prefix', 'ovp-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9362');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const problems = [];
const die = (code, msg) => { console.error('FAIL: ' + msg); process.exit(code); };
mkdirSync(OUT, { recursive: true });

// ───────────────────────────────────────────────────────────── 1. read the sim over the wire
const latest = new Map();
let ws;
const send = (o) => ws.send(JSON.stringify(o));
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);

// ── STEP 0: THE INSTRUMENT CHECK, before any conclusion is drawn ──
const decksMsg = latest.get('decks');
if (!decksMsg) die(2, 'no `decks` message — the rig is not reading this host at all');
const d0 = decksMsg.decks?.find((d) => (d.deck | 0) === 0);
if (!d0 || d0.slots?.length !== 8) die(2, `deck 0 has ${d0?.slots?.length} slots, not 8 — wrong ship?`);
const anchorsOnWire = d0.slots.map((t) => String(t[5] ?? ''));
if (!anchorsOnWire.includes('cryobay')) die(2, 'no `cryobay` on deck 0 — this is not --ship wreck');
log('INSTRUMENT OK — --ship wreck, deck 0, 8 slots:', anchorsOnWire.join(' | '));

// ───────────────────────────────────────────────────────────── 2. drive real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'ovp-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
log('chrome pid', chrome.pid, '— kill THIS pid on a leak, never a pattern');

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
const consoleErrors = [];
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  // A thrown exception in the repaint loop is the single most likely way this package breaks the
  // running game while every node test stays green, so it is COLLECTED rather than ignored.
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params?.exceptionDetails?.exception?.description
      || m.params?.exceptionDetails?.text || 'exception');
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
    consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description).join(' '));
  }
};
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
// ⚠️ `returnByValue` hands back the STRING these snippets stringify — PARSE IT.
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const v = await evaluate(expr); return v && v !== 'null' ? JSON.parse(v) : null; };
const click = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
};
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
}
async function clickSel(sel) {
  const at = await json(`JSON.stringify((()=>{const e=document.querySelector(${JSON.stringify(sel)});
    if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})())`);
  if (!at) return false;
  await click(at.x, at.y);
  await sleep(1200);
  return true;
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(7000);

if (await clickSel('[data-onb-begin]')) await sleep(2000);
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`))
  die(8, 'the onboarding card is still up — every screenshot below would photograph it');

async function toDeck(deck) {
  for (let i = 0; i < 16; i++) {
    const cur = latest.get('frame')?.deck | 0;
    if (cur === deck) break;
    send({ cmd: 'deck', dz: Math.sign(deck - cur) });
    await sleep(450);
  }
  await sleep(2000);
}

/**
 * THE PLATE'S OWN STRUCTURAL CENSUS — every claim the redesign makes, read off the live DOM.
 * Sizes are `getBoundingClientRect` so a collapsed column or a zero-height tile is caught: a green
 * model test plus a 0-px box is exactly the failure this rig exists to find.
 */
// ⭐⭐ THE LAYOUT-AWARE HALF, AND IT IS THE REASON THIS RIG IS A PIN AND NOT A GALLERY.
//
// Review measured two affordances RENDERED OFF-SCREEN: `#ov-alert` (D2's decaying-capsule warning)
// resolved 50 px below its column's bottom edge — 0 px of it visible, at every viewport — and
// `.ov-ledcaveat` was 40 of its 44 px clipped. **`dom-lite` cannot see this class of defect at all**:
// it has no layout, so a node that is present, painted, un-hidden and entirely outside its own
// clipping box is indistinguishable from one a player can read. So the assertion lives here, where
// there is a real box model, and it is expressed as "fully inside its column AND fully inside the
// viewport" rather than "exists".
//
// ⚠️ THE ALERT IS UN-HIDDEN BY HAND FIRST, and that is a LAYOUT measurement, not a faked reading:
// the wreck at boot has no capsule near a rung crossing, so the bar is correctly empty, and what is
// under test is where the box LANDS when the wire does raise one. The text is discarded straight
// after; nothing is screenshotted in that state.
const onScreenExpr = `JSON.stringify((()=>{
  const bar = document.getElementById('ov-alert');
  const txt = document.querySelector('.ov-alerttxt');
  const was = bar.hidden, wasTxt = txt.textContent;
  bar.hidden = false;
  txt.textContent = 'CAPSULE DECAYING — MBEKI — THAW PRICE RISES SOON';
  const probe = (sel, hostSel) => {
    const e = document.querySelector(sel), h = document.querySelector(hostSel);
    if (!e || !h) return { sel, missing: true };
    const r = e.getBoundingClientRect(), b = h.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    return { sel, w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      hostBottom: Math.round(b.bottom),
      insideHost: r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
      insideView: r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw,
      visiblePx: Math.max(0, Math.min(r.bottom, b.bottom, vh) - Math.max(r.top, b.top, 0)) };
  };
  const out = [probe('#ov-alert', '#ov-ledger'), probe('.ov-ledcaveat', '#ov-ledger'),
               probe('.ov-radarcap', '#ov-radar'), probe('.ov-cplist', '#ov-compart'),
               probe('.ov-navhint', '#ov-cmd')];
  bar.hidden = was; txt.textContent = wasTxt;
  return out;
})())`;

const censusExpr = `JSON.stringify((()=>{
  const box = (s) => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const tiles = [...document.querySelectorAll('.pl-room')].map((e) => {
    const r = e.getBoundingClientRect();
    return { anchor: e.dataset.anchor, purpose: e.dataset.purpose, state: e.dataset.state,
      w: Math.round(r.width), h: Math.round(r.height),
      fittings: e.querySelectorAll('.pl-item').length,
      attend: e.classList.contains('pl-room-attend'), sel: e.classList.contains('pl-room-sel') };
  });
  const strokes = [...document.querySelectorAll('.ov-mini path')].slice(0, 40)
    .map((p) => getComputedStyle(p).vectorEffect);
  return {
    masthead: (document.querySelector('.ov-ship')||{}).textContent,
    stats: (document.querySelector('.ov-deckctx')||{}).textContent + ' / ' + (document.querySelector('.ov-clock')||{}).textContent,
    caption: (document.querySelector('.ov-capline')||{}).textContent,
    souls: (document.querySelector('.ov-capsouls')||{}).textContent,
    tiles, emptyTiles: document.querySelectorAll('.pl-room-empty').length,
    corridorItems: document.querySelectorAll('.pl-corridor .pl-item').length,
    nestedSvgs: document.querySelectorAll('.ov-mini').length,
    vectorEffect: [...new Set(strokes)],
    columns: { compart: box('#ov-compart'), aboard: box('#ov-sensor'), ship: box('#ov-ledger'), outside: box('#ov-radar') },
    compartLines: [...document.querySelectorAll('.ov-cpline')].map((e) => e.textContent),
    aboardLines: [...document.querySelectorAll('.ov-logline:not([hidden])')].map((e) => e.textContent),
    ledgerRows: [...document.querySelectorAll('.ov-ledrow:not([hidden])')].map((e) => ({
      text: e.textContent, cells: e.querySelector('.ov-ledcells').hidden ? 0 : e.querySelectorAll('.ov-ledcells i').length,
      on: e.querySelectorAll('.ov-ledcells i.on').length })),
    ledgerScale: (document.querySelector('.ov-ledscale')||{}).textContent,
    radarCap: [...document.querySelectorAll('.ov-radarcap span')].map((e) => e.textContent),
    radarCircles: document.querySelectorAll('.ov-radarsvg circle').length,
    tabs: [...document.querySelectorAll('.ov-tab')].map((e) => e.textContent + (e.classList.contains('on') ? '*' : '')),
    navHint: (document.querySelector('.ov-navhint')||{}).textContent,
    lens: [...document.querySelectorAll('.ov-lensbtn')].map((e) => e.textContent),
    stage: box('#ov-stage'), plate: box('.ov-space'),
    ground: getComputedStyle(document.getElementById('overview-view')).backgroundColor,
  };
})())`;

await toDeck(0);
await sleep(2500);
const c0 = await json(censusExpr);
if (!c0) die(9, 'the plate census returned nothing — the surface is not mounted');

log('\n── DECK 0 PLATE CENSUS ─────────────────────────────────────────────');
log('  masthead   ', JSON.stringify(c0.masthead), '|', JSON.stringify(c0.stats));
log('  caption    ', JSON.stringify(c0.caption), '|', JSON.stringify(c0.souls));
log('  ground     ', c0.ground, '  plate', JSON.stringify(c0.plate), '  stage', JSON.stringify(c0.stage));
log('  tiles      ', c0.tiles.length, '(empty cells ' + c0.emptyTiles + ', nested svgs ' + c0.nestedSvgs + ')');
log('  corridor   ', c0.corridorItems, 'item(s) drawn in the spine strip');
for (const t of c0.tiles) {
  log(`    ${String(t.anchor).padEnd(14)} ${t.w}×${t.h}px  purpose=${t.purpose} state=${t.state} fittings=${t.fittings}`);
}
log('  vectorEffect on miniature strokes:', JSON.stringify(c0.vectorEffect));
log('  columns    ', JSON.stringify(c0.columns));
log('  compartments:'); for (const l of c0.compartLines) log('    ' + l);
log('  aboard:');       for (const l of c0.aboardLines) log('    ' + l);
log('  the ship   ', JSON.stringify(c0.ledgerScale));
for (const r of c0.ledgerRows) log(`    ${r.text}   [gauge ${r.on}/${r.cells}]`);
log('  outside    ', JSON.stringify(c0.radarCap), 'rings=' + c0.radarCircles);
log('  nav        ', c0.tabs.join(' '), '|', JSON.stringify(c0.navHint));
log('  lens       ', c0.lens.join(' '));

// ── THE CHECKS. Each is a way the plate can be structurally right and visually dead. ──
if (c0.tiles.length !== 8) problems.push(`deck 0 draws ${c0.tiles.length} compartment tiles, not 8`);
if (c0.nestedSvgs !== c0.tiles.length) problems.push('a tile has no miniature interior <svg>');
for (const t of c0.tiles) {
  if (t.w < 40 || t.h < 20) problems.push(`${t.anchor} renders ${t.w}×${t.h}px — the grid collapsed`);
}
if (!c0.vectorEffect.includes('non-scaling-stroke')) {
  problems.push('the miniature strokes do NOT resolve to non-scaling-stroke — at 1/7 scale every '
    + 'interior fades to blank paper (computed: ' + JSON.stringify(c0.vectorEffect) + ')');
}
for (const [name, b] of Object.entries(c0.columns)) {
  if (!b) problems.push(`the ${name} column is not in the DOM`);
  else if (b.w < 60 || b.h < 40) problems.push(`the ${name} column renders ${b.w}×${b.h}px — collapsed`);
}
if (c0.compartLines.length !== 8) problems.push(`the compartments column lists ${c0.compartLines.length} rooms, not 8`);
if (c0.tabs.length !== 6) problems.push(`the footer nav shows ${c0.tabs.length} tabs, not the six ruling E1 keeps`);
if (c0.radarCircles !== 3) problems.push(`the scope draws ${c0.radarCircles} circles — a fourth is an invented contact`);
if (!/no contact data/i.test(c0.radarCap.join(' '))) problems.push('the scope does not say it has no contacts');
// ⛔ THE SPINE IS DRAWN. 83 deck-0 floor tiles, two ground items and the HATCH LADDER at (22,8) —
// the visible deck-to-deck route — lie inside no compartment, and before the corridor strip existed
// they were on no surface at Level 1 at all. A plate that draws every room and none of the corridor
// between them is a floor plan with the doors painted out.
if (!c0.corridorItems) {
  problems.push('the corridor strip drew NO item — the spine\'s ground stock and the hatch ladder '
    + '(the deck-to-deck route) are invisible at Level 1 again');
}
if (c0.tiles.every((t) => t.fittings === 0)) {
  problems.push('NOT ONE compartment miniature drew a fitting — the plate is empty rooms, which is '
    + 'the one thing the redesign is for');
}

// ── the on-screen check ──
const boxes = await json(onScreenExpr);
log('\n── ON-SCREEN GEOMETRY (the pin dom-lite cannot carry) ──────────────');
for (const b of boxes) {
  if (b.missing) { problems.push(`${b.sel} is not in the DOM at all`); continue; }
  log(`  ${b.sel.padEnd(16)} ${b.w}×${b.h} top=${b.top} bottom=${b.bottom} `
    + `hostBottom=${b.hostBottom} visible=${b.visiblePx}px inHost=${b.insideHost} inView=${b.insideView}`);
  if (!b.insideHost || !b.insideView || b.visiblePx < b.h - 1) {
    problems.push(`${b.sel} renders ${b.visiblePx}px of ${b.h}px on screen (top=${b.top}, `
      + `bottom=${b.bottom}, its column ends at ${b.hostBottom}). An affordance clipped out of its `
      + 'own box is an affordance deleted — see D2 and the always-visible ledger caveat.');
  }
}

// ── THE CLICK MAP AGREES WITH THE DRAWING, measured in the running game ──
//
// ⛔ THIS IS THE ACCEPTANCE FOR THE TWO-COORDINATE-SYSTEMS DEFECT, and it is measured through the
// REAL GESTURE rather than through a debug hook: ERASE is armed, a press is dispatched on each
// sampled fitting's own floor point, and `#ov-toast` reports the tile `pointToTile` resolved
// (`↺ NOTHING TO ERASE ▸ X,Y ON DECK N`). Erase on a tile carrying no order sends NOTHING, so the
// probe changes no sim state — it only asks the surface which tile the player just pressed.
// Review measured 57 of 59 wrong here before the projection was unified.
await clickSel('.ov-tab[data-ov-tab="build"]');
await clickSel('.ov-orders .ov-tool[data-ov-tool="erase"]');
// ⚠️ THE PRESS LANDS ON A PIXEL OF THE PIECE'S OWN INK, found with `elementFromPoint` — not on its
// bounding-box centre. A fitting's box is a 128-unit square with the art centred in it, so a chair's
// box centre is the paper BETWEEN its legs: a press there is not a press on the chair, it falls
// through to the floor map by design, and scoring it as a miss measures the fixture rather than the
// surface. (Measured: 5 of 15 "misses" were exactly that.) The claim under test is the reviewer's —
// a point inside the piece's own RENDERED FOOTPRINT designates the piece's tile.
//
// ⚠️ AND THE POINT IS RE-FOUND IMMEDIATELY BEFORE EACH PRESS. The scene is `innerHTML`-swapped at
// the wire's 10 Hz, so a batch of points collected up front is read against nodes that no longer
// exist by the time the presses are dispatched; one run scored a false miss that way. Finding the
// point and pressing it inside the same ~200 ms is what makes this pin repeatable rather than a coin.
const PROBE = `((idx) => {
  const all = [...document.querySelectorAll('.pl-fit')];
  const g = all[idx];
  if (!g) return null;
  const r = g.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  for (let j = 1; j <= 15; j += 1) {
    for (let i = 1; i <= 15; i += 1) {
      const x = r.left + (r.width * i) / 16, y = r.top + (r.height * j) / 16;
      const el = document.elementFromPoint(x, y);
      if (el && el.closest && el.closest('.pl-fit') === g) return { tile: g.dataset.tile, x, y };
    }
  }
  return { tile: g.dataset.tile, noInk: true };
})`;
const fitCount = await evaluate(`document.querySelectorAll('.pl-fit').length`);
const SAMPLE = 15;
const step = Math.max(1, Math.floor(fitCount / SAMPLE));
const wrong = [];
let walked = 0;
let inkless = 0;
for (let i = 0; i < fitCount; i += step) {
  const f = await json(`JSON.stringify(${PROBE}(${i}))`);
  if (!f) continue;
  if (f.noInk) { inkless += 1; continue; }
  await evaluate(`document.getElementById('ov-toast').textContent = ''`);
  await click(f.x, f.y);
  await sleep(250);
  const line = await evaluate(`document.getElementById('ov-toast').textContent`);
  const m = /▸ (\d+),(\d+) ON DECK/.exec(line || '');
  if (!m) continue;
  walked += 1;
  if (`${m[1]},${m[2]}` !== f.tile) wrong.push(`drawn for ${f.tile} → press designates ${m[1]},${m[2]}`);
}
await clickSel('.ov-orders .ov-tool[data-ov-tool="erase"]');   // disarm
log(`\n── CLICK MAP vs DRAWING (live gesture) ─────────────────────────────`);
log(`  ${fitCount} fittings drawn; ${inkless} with no pressable ink; ${walked} pressed; `
  + `${wrong.length} designate the wrong tile`);
for (const w of wrong.slice(0, 6)) log('    ' + w);
if (walked < 8) problems.push(`only ${walked} fittings pressed — the click check is thin`);
// ⚠️ A FEW INKLESS ARE EXPECTED AND ARE NOT A DEFECT: pieces are drawn BACK TO FRONT, so a fitting
// standing behind a taller one is legitimately covered by it — pressing there presses the nearer
// piece, which is what an oblique view means. MANY would mean the miniature has become unpressable.
if (inkless > Math.max(2, walked * 0.2)) {
  problems.push(`${inkless} sampled fittings have NO pixel of their own ink that is hit-testable — `
    + 'that is beyond what back-to-front occlusion accounts for');
}
if (wrong.length) {
  problems.push(`${wrong.length} of ${walked} drawn fittings designate a DIFFERENT tile than the one `
    + 'they are drawn on — the drawing and the click map have come apart again');
}
await png('1-plate-deck0.png');

await toDeck(1);
await sleep(2500);
const c1 = await json(censusExpr);
log('\n── DECK 1 (the dead deck) ──────────────────────────────────────────');
log('  caption    ', JSON.stringify(c1.caption));
log('  purposed tiles:', c1.tiles.filter((t) => t.purpose === '1').length, 'of', c1.tiles.length);
if (c1.tiles.filter((t) => t.purpose === '1').length !== 0) {
  problems.push('the DEAD deck reports purposed compartments — the predicate is wrong');
}
if (c1.tiles.some((t) => t.state !== 'unbuilt')) problems.push('a dead-deck tile is not in the UNBUILT dash');
await png('2-plate-deck1.png');

await toDeck(0);
await sleep(1500);
// the ORDERS island, armed — the footer in the paper idiom with the accent on the armed tool
await clickSel('.ov-tab[data-ov-tab="build"]');
await clickSel('.ov-orders .ov-tool');
const armed = await json(`JSON.stringify({ on: [...document.querySelectorAll('.ov-tool.on')].map(e=>e.textContent),
  hint: (document.querySelector('.ov-orderhint')||{}).textContent })`);
log('\n── ORDERS ARMED ────────────────────────────────────────────────────');
log('  ', JSON.stringify(armed));
if (!armed.on.length) problems.push('arming a tool set no `.on` class — the armed state is invisible');
await png('3-orders-armed.png');

await clickSel('.ov-tab[data-ov-tab="work"]');
await sleep(1500);
const work = await json(`JSON.stringify({ rows: document.querySelectorAll('.ov-worklist .ov-workrow').length,
  cells: document.querySelectorAll('.ov-workcell').length,
  shown: !document.querySelector('.ov-work').hidden })`);
log('\n── WORK TAB ────────────────────────────────────────────────────────');
log('  ', JSON.stringify(work));
if (!work.shown) problems.push('the WORK island did not show on its own tab');
await png('4-work-tab.png');

if (consoleErrors.length) problems.push('console errors while drawing: ' + JSON.stringify(consoleErrors.slice(0, 5)));

cdp.close(); ws.close(); chrome.kill('SIGKILL');
if (problems.length) { for (const p of problems) console.error('PROBLEM: ' + p); process.exit(10); }
log('\nOK — the plate draws, its four columns hold, and nothing invented reached the scope.');
// ⚠️ EXPLICIT. The two open WebSockets keep the event loop alive, so without this the rig prints
// its report and then hangs forever — which reads exactly like a rig that never finished.
process.exit(0);
