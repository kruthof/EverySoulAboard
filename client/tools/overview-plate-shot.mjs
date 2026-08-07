#!/usr/bin/env node
// overview-plate-shot.mjs — PHOTOGRAPH THE SHIP PLATE AND CENSUS THE LIVE DOM.
//
// ⚠️⚠️ RE-AIMED AT THE SIDE-ELEVATION PLATE (2026-08-05). It was written for VR-P4's top-down plate
// — a hull capsule with ONE deck's 4 × 2 grid of bordered compartment tiles, each a nested `<svg>`.
// The plate is now a SIDE-ELEVATION CUTAWAY with BOTH DECKS drawn at once, compartments tiling one
// continuous deck floor with shared partition walls, and NO nested `<svg>` anywhere. Every check
// below is either unchanged (the readout band, the on-screen geometry sweep) or translated with the
// old form quoted at the point of translation.
//
// ⭐ AND IT GAINED TWO CHECKS THE NEW PLATE NEEDS AND THE OLD ONE DID NOT:
//   · THE FULL PRESS CENSUS. It used to sample 15 fittings. The elevation has ONE projection, so
//     the census can be exhaustive — every drawn fitting on both decks is pressed and must designate
//     its own tile. A sampled census cannot distinguish "the projection is right" from "the 15 I
//     happened to pick are right", and the defect this pin exists for (VR-P4's 57-of-59) was
//     systematic rather than sporadic.
//   · THE CHANNEL EQUIVALENCE, RE-DERIVED OFF THE RUNNING WIRE. The plate sources its fittings from
//     `devices`+`items` rather than from `frame` (`client/src/ui/ship-fittings.js`). That is only
//     safe while the two agree tile-for-tile, and a fixture nobody recaptures cannot keep it true.
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
//   ovp-1-plate-deck0.png   the plate — masthead, hull elevation, BOTH decks, four columns
//   ovp-2-plate-deck1.png   the same drawing with DECK 1 active (the order deck moved, not the view)
//   ovp-3-orders-armed.png  BUILD tab with DIG armed — the footer islands in the paper idiom
//   ovp-4-work-tab.png      the WORK grid island, restyled
//   ovp-5-w1360.png / -6-w1100.png / -7-w900.png   the plate at three narrower viewports
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

// ── STEP 0b: THE CHANNEL EQUIVALENCE, RE-DERIVED OFF THIS RUNNING WIRE ──
//
// ⛔ THE PLATE DOES NOT READ `frame` FOR FITTINGS ANY MORE. It reads `devices` + `items`, because
// those carry EVERY deck and `frame` carries the one the host is projecting
// (`GameSession.RenderFrame`). The substitution is only safe while the two skin the same tiles with
// the same pieces, and that is a claim about a LIVE ship, not about a fixture — so it is re-derived
// here, through the SAME two registry derivations the drawing uses, on the deck the host is showing.
{
  const { itemIdForGlyphChar } = await import('../src/items/glyph-map.js');
  const { NON_FURNITURE_CODES, itemForDeviceRow, itemIdForStockKind } = await import('../src/ui/room-model.js');
  const { decodeDevices, decodeItems } = await import('../src/wire/messages.js');
  const NF = new Set(NON_FURNITURE_CODES);
  const f = latest.get('frame');
  const deck = f.deck | 0;
  const fromFrame = new Map();
  for (let ty = 0; ty < f.h; ty += 1) {
    for (let tx = 0; tx < f.w; tx += 1) {
      const cell = f.cells[ty * f.w + tx];
      if (!Array.isArray(cell) || NF.has(cell[0])) continue;
      const id = itemIdForGlyphChar(String.fromCharCode(cell[0]));
      if (id) fromFrame.set(tx + ',' + ty, id);
    }
  }
  const fromChan = new Map();
  for (const it of (decodeItems(latest.get('items')) || [])) {
    if ((it.deck | 0) !== deck) continue;
    const id = itemIdForStockKind(it.kind);
    if (id) fromChan.set(it.x + ',' + it.y, id);
  }
  for (const d of (decodeDevices(latest.get('devices')) || [])) {
    if ((d.deck | 0) !== deck) continue;
    const id = itemForDeviceRow(d);
    if (id) fromChan.set(d.x + ',' + d.y, id);
  }
  // ⭐⭐ THE PAWN-OCCLUDED TILES ARE SUBTRACTED, AND THIS RIG IS WHAT MEASURED THEM. `GlyphMapper`
  // pass 5 writes `Glyphs.Citizen` (64) OVER whatever is on a tile a crew member stands on, so the
  // FRAME loses that tile's fitting for as long as she is there — the very defect the channel source
  // removes. On the first run of this check a single stack at (5,6) was reported as "only in the
  // channels" for exactly that reason: Rell was standing on it. Counting it as a divergence would
  // make this rig fail whenever anybody walked over anything. They are reported separately, and
  // NON-ZERO IS THE HEALTHY SIGN — it is the frame's loss, not the plate's.
  const CITIZEN = 64;
  const occluded = new Set();
  for (let ty = 0; ty < f.h; ty += 1) {
    for (let tx = 0; tx < f.w; tx += 1) {
      const cell = f.cells[ty * f.w + tx];
      if (Array.isArray(cell) && cell[0] === CITIZEN) occluded.add(tx + ',' + ty);
    }
  }
  const onlyF = [...fromFrame.keys()].filter((k) => !fromChan.has(k));
  const onlyC = [...fromChan.keys()].filter((k) => !fromFrame.has(k) && !occluded.has(k));
  const rescued = [...fromChan.keys()].filter((k) => !fromFrame.has(k) && occluded.has(k));
  const diff = [...fromFrame.keys()].filter((k) => fromChan.has(k) && fromChan.get(k) !== fromFrame.get(k));
  log(`CHANNEL EQUIVALENCE (deck ${deck}) — frame ${fromFrame.size}, devices+items ${fromChan.size}, `
    + `only-frame ${onlyF.length}, only-channels ${onlyC.length}, mismatch ${diff.length}, `
    + `RESCUED from pass-5 pawn occlusion ${rescued.length} ${JSON.stringify(rescued)}`);
  if (fromFrame.size < 10) problems.push('the frame skins fewer than 10 tiles — the equivalence check is vacuous');
  if (onlyF.length) {
    problems.push(`${onlyF.length} tile(s) the PROJECTION furnishes are empty on the plate `
      + `(${onlyF.slice(0, 5).map((k) => k + '=' + fromFrame.get(k)).join(' ')}) — the two standard `
      + 'surfaces have come to show different ships');
  }
  if (onlyC.length) {
    problems.push(`${onlyC.length} tile(s) the PLATE furnishes are empty in the projection `
      + `(${onlyC.slice(0, 5).map((k) => k + '=' + fromChan.get(k)).join(' ')}) — this is the `
      + 'dangerous direction: the channels are fog-gated in the host, so an extra tile means the '
      + 'gate is gone and the plate is showing unexplored ship');
  }
  if (diff.length) problems.push(`${diff.length} tile(s) draw a DIFFERENT PIECE on the two routes`);
}

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
      hostBottom: Math.round(b.bottom), hostRight: Math.round(b.right), right: Math.round(r.right),
      // HORIZONTAL CONTAINMENT JOINED THE VERTICAL ONE, and it was added because the pin MISSED a
      // shipped defect that is this rig's exact subject: the radar svg carried a hard 150x150 inside
      // a 150px border-box track whose padding-left:26px (a CSS specificity loss) left it 123px of
      // content, so 27px -- 18% of the instrument -- hung out of the column and was cut off by
      // .ov-col{overflow:hidden} at EVERY viewport. Vertically it was perfectly placed, so a
      // top/bottom-only check called it fine. Owner-reported, then reproduced here.
      //
      // AND THE ZERO BOX IS ITS OWN FINDING, because the containment check above CANNOT TELL
      // "contained" FROM "NOT RENDERED AT ALL" and the first draft of this widening shipped exactly
      // that hole -- the 4th shape (a guard whose scope filter excludes the violation) inside the
      // guard widened to close this class. Measured: with the shipped band defect restored, a
      // display:none column gives a 0x0 rect, every containment term is vacuously true (0 >= -1,
      // 0 <= +1), and visiblePx(0) < h-1(-1) is FALSE -- so two of the four swept widths passed
      // while drawing nothing. Every width this rig sweeps (1600/1360/1100/900) is ABOVE the 818px
      // point where the radar column is legitimately dropped, so "this affordance has a box" is a
      // true, cheap assertion at all of them, and it is the assertion that makes the containment
      // terms mean something.
      rendered: r.width > 0 && r.height > 0,
      insideHost: r.top >= b.top - 1 && r.bottom <= b.bottom + 1
        && r.left >= b.left - 1 && r.right <= b.right + 1,
      insideView: r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw,
      visiblePx: Math.max(0, Math.min(r.bottom, b.bottom, vh) - Math.max(r.top, b.top, 0)) };
  };
  const out = [probe('#ov-alert', '#ov-ledger'), probe('.ov-ledcaveat', '#ov-ledger'),
               probe('.ov-radarcap', '#ov-radar'), probe('.ov-radarsvg', '#ov-radar'),
               probe('.ov-cplist', '#ov-compart'),
               probe('.ov-navhint', '#ov-cmd')];
  bar.hidden = was; txt.textContent = wasTxt;
  return out;
})())`;

const censusExpr = `JSON.stringify((()=>{
  const box = (s) => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const tiles = [...document.querySelectorAll('.pl-room')].map((e) => {
    const r = e.getBoundingClientRect();
    return { anchor: e.dataset.anchor, deck: e.dataset.deck, purpose: e.dataset.purpose,
      state: e.dataset.state,
      w: Math.round(r.width), h: Math.round(r.height),
      attend: e.classList.contains('pl-room-attend'), sel: e.classList.contains('pl-room-sel') };
  });
  // WARNING: THE FITTING COUNT MOVED OFF THE COMPARTMENT GROUP. VR-P4 drew each compartment's
  // pieces INSIDE its own group (a nested svg); the elevation draws ONE fitting layer per BAND,
  // above the compartments, because the pieces have to sort back-to-front across the whole deck
  // floor for the oblique to read. So a piece is attributed to a compartment by its own data-tile
  // plus the slot rects on the wire, not by DOM containment.
  const fits = [...document.querySelectorAll('.pl-fit')].map((e) => {
    const r = e.getBoundingClientRect();
    return { tile: e.dataset.tile, deck: e.dataset.deck, w: Math.round(r.width), h: Math.round(r.height) };
  });
  const decks = [...document.querySelectorAll('.pl-deck')].map((e) => {
    const r = e.getBoundingClientRect();
    return { deck: e.dataset.deck, active: e.dataset.active, survey: e.dataset.survey,
      w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  });
  // WARNING: THE vector-effect PROBE MOVED WITH THE ART. There is no .ov-mini any more (no nested
  // svg); the strokes that must not vanish are the FITTINGS', which are drawn at ~1/9 scale inside
  // the fitting layer. A scaled stroke there fades every compartment to blank paper, which is the
  // exact failure this check was written for.
  const strokes = [...document.querySelectorAll('.pl-fit path')].slice(0, 40)
    .map((p) => getComputedStyle(p).vectorEffect);
  return {
    masthead: (document.querySelector('.ov-ship')||{}).textContent,
    stats: (document.querySelector('.ov-deckctx')||{}).textContent + ' / ' + (document.querySelector('.ov-clock')||{}).textContent,
    caption: (document.querySelector('.ov-capline')||{}).textContent,
    souls: (document.querySelector('.ov-capsouls')||{}).textContent,
    tiles, fits, decks,
    // WARNING: pl-room-empty AND pl-corridor ARE BOTH GONE, and their absence is asserted below:
    // the first was VR-P4's dashed unfilled GRID CELL (there is no grid to leave a cell in), the
    // second its reserved CORRIDOR STRIP with its own linear map (the walkway is the deck's own
    // floor now). A build that re-introduced either would be drawing the spine twice.
    staleLayers: document.querySelectorAll('.pl-room-empty, .pl-corridor, .ov-mini').length,
    nestedSvgs: document.querySelectorAll('.pl-overview svg').length,
    partitions: document.querySelectorAll('.pl-arch path').length,
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
log('  bands      ', c0.decks.length, JSON.stringify(c0.decks));
log('  compartments', c0.tiles.length, '(stale layers ' + c0.staleLayers + ', nested svgs ' + c0.nestedSvgs
  + ', architecture strokes ' + c0.partitions + ')');
for (const t of c0.tiles) {
  const n = c0.fits.filter((f) => f.deck === t.deck).length;
  log(`    d${t.deck} ${String(t.anchor).padEnd(14)} ${t.w}×${t.h}px  purpose=${t.purpose} state=${t.state} (deck fittings ${n})`);
}
log('  fittings   ', c0.fits.length, 'across decks', JSON.stringify([...new Set(c0.fits.map((f) => f.deck))]));
log('  vectorEffect on fitting strokes:', JSON.stringify(c0.vectorEffect));
log('  columns    ', JSON.stringify(c0.columns));
log('  compartments:'); for (const l of c0.compartLines) log('    ' + l);
log('  aboard:');       for (const l of c0.aboardLines) log('    ' + l);
log('  the ship   ', JSON.stringify(c0.ledgerScale));
for (const r of c0.ledgerRows) log(`    ${r.text}   [gauge ${r.on}/${r.cells}]`);
log('  outside    ', JSON.stringify(c0.radarCap), 'rings=' + c0.radarCircles);
log('  nav        ', c0.tabs.join(' '), '|', JSON.stringify(c0.navHint));
log('  lens       ', c0.lens.join(' '));

// ── THE CHECKS. Each is a way the plate can be structurally right and visually dead. ──
// ⭐⭐ BOTH DECKS, DRAWN AT ONCE — the package's premise, asserted on the live DOM.
if (c0.decks.length !== 2) problems.push(`the plate draws ${c0.decks.length} bands, not the wreck's 2`);
if (c0.tiles.length !== 16) problems.push(`the plate draws ${c0.tiles.length} compartments, not 8+8`);
for (const d of ['0', '1']) {
  const n = c0.tiles.filter((t) => t.deck === d).length;
  if (n !== 8) problems.push(`deck ${d} draws ${n} compartments, not 8`);
  const f = c0.fits.filter((x) => x.deck === d).length;
  if (!f) {
    problems.push(`deck ${d} drew NOT ONE fitting. Both decks are visible, so an unfurnished band `
      + 'is the plate claiming an empty deck — and on the wreck deck 1 carries 24 devices.');
  }
}
if (c0.nestedSvgs) {
  problems.push(`the plate contains ${c0.nestedSvgs} nested <svg> — that is a second coordinate `
    + 'space, and the elevation exists because there is one');
}
if (c0.staleLayers) {
  problems.push(`${c0.staleLayers} element(s) of the RETIRED plate are back (\`pl-room-empty\`, `
    + '`pl-corridor` or `.ov-mini`) — the spine would be drawn twice, with two click answers');
}
if (c0.partitions < 20) {
  problems.push(`only ${c0.partitions} architecture strokes — the deck slabs and the shared `
    + 'partition walls are the drawing; without them the bands are two flat strips');
}
for (const t of c0.tiles) {
  if (t.w < 40 || t.h < 20) problems.push(`${t.anchor} renders ${t.w}×${t.h}px — the band collapsed`);
}
if (!c0.vectorEffect.includes('non-scaling-stroke')) {
  problems.push('the fitting strokes do NOT resolve to non-scaling-stroke — at ~1/9 scale every '
    + 'compartment fades to blank paper (computed: ' + JSON.stringify(c0.vectorEffect) + ')');
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
// the visible deck-to-deck route — lie inside no compartment, and before VR-P4's corridor strip
// existed they were on no surface at Level 1 at all. The elevation draws them on the WALKWAY, the
// front third of the deck's own floor, so the check is now "a fitting is drawn on a tile no slot
// covers" rather than "a layer exists".
{
  const slotRects = d0.slots.map((t) => ({ x: t[1], y: t[2], w: t[3], h: t[4] }));
  const inSlot = (tx, ty) => slotRects.some((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
  const spine = c0.fits.filter((f) => f.deck === '0')
    .filter((f) => { const [tx, ty] = String(f.tile).split(',').map(Number); return !inSlot(tx, ty); });
  log('  walkway    ', spine.length, 'fitting(s) drawn on tiles no compartment covers');
  if (!spine.length) {
    problems.push('NOTHING is drawn on the walkway — the spine\'s ground stock and the hatch ladder '
      + '(the deck-to-deck route) are invisible at Level 1 again');
  }
}
if (!c0.fits.length) {
  problems.push('NOT ONE compartment drew a fitting — the plate is empty rooms, which is the one '
    + 'thing the redesign is for');
}

// ── the on-screen check ──
function readBoxes(boxes, at) {
  for (const b of boxes) {
    if (b.missing) { problems.push(`${at}: ${b.sel} is not in the DOM at all`); continue; }
    log(`  ${b.sel.padEnd(16)} ${b.w}×${b.h} top=${b.top} bottom=${b.bottom} right=${b.right} `
      + `hostBottom=${b.hostBottom} hostRight=${b.hostRight} visible=${b.visiblePx}px `
      + `rendered=${b.rendered} inHost=${b.insideHost} inView=${b.insideView}`);
    // ⛔ THE ZERO BOX FIRST, AND SEPARATELY — a `display:none` element passes every containment term
    // vacuously, so reporting it as "clipped" would be the wrong sentence about the right defect.
    if (!b.rendered) {
      problems.push(`${at}: ${b.sel} has a ${b.w}×${b.h} box — it is in the DOM and DRAWS NOTHING. `
        + 'Every width this rig sweeps is above the 818px point where the radar column is legitimately '
        + 'dropped, so a zero box here is an affordance that is gone, and the containment checks '
        + 'below it are vacuously true about a rectangle that does not exist.');
      continue;
    }
    if (!b.insideHost || !b.insideView || b.visiblePx < b.h - 1) {
      problems.push(`${at}: ${b.sel} renders ${b.visiblePx}px of ${b.h}px on screen (top=${b.top}, `
        + `bottom=${b.bottom}, right=${b.right}; its column ends at ${b.hostBottom} / ${b.hostRight}). `
        + 'An affordance clipped out of its own box is an affordance deleted — see D2 and the '
        + 'always-visible ledger caveat.');
    }
  }
}
const boxes = await json(onScreenExpr);
log('\n── ON-SCREEN GEOMETRY (the pin dom-lite cannot carry) ──────────────');
readBoxes(boxes, '1600px');

// ⭐⭐ AND AT THREE NARROWER WIDTHS, BECAUSE THE OWNER'S GESTURE IS SHRINKING THE WINDOW. The readout
// band's two right-hand tracks were hard pixels (`258px 150px`) with hard 28px gaps, so 490px of it
// could not compress and only the two PROSE columns gave — measured at a 700px viewport,
// `compartments` had 147px of content and `aboard` 120px while the instruments kept every pixel they
// have at 1600. A single-viewport rig cannot see that, and it is the half of this band's design that
// a player actually operates. Three widths, not a sweep: 1360 is where the radar column used to
// vanish outright, 1100 is a laptop half-screen, 900 is the narrowest width that still shows all
// four columns.
//
// ⛔⛔ THE RECEIPT FOR THIS SWEEP, CORRECTED — the first one was measured against a PARTIAL revert and
// was therefore false. It said "with the band defect restored the rig exits 10 naming `.ov-radarsvg`
// at all four widths"; that revert put back the radar's CSS and the svg's hard 150×150 but LEFT the
// new 818px drop in place, so the scope still rendered at 1100/900 and overflowed there. Against the
// REAL pre-fix tree (`@media (max-width:1359px)`) the column is `display:none` at 1100/900, and the
// containment terms were vacuously true about a 0×0 rect — the reviewer measured 2 findings, not 4.
// With the `rendered` term above, the WHOLE pre-fix band restored from `8e55f95^` now gives exit 10
// and SIX band findings, in both shapes: `.ov-radarsvg` OVERFLOWS at 1600 (right 1581 vs a column
// ending 1554) and at 1360 (1341 vs 1314), and `.ov-radarsvg` + `.ov-radarcap` are ZERO-BOX at 1100
// and 900 — each logged `rendered=false inHost=true inView=true`, which is the vacuity itself,
// printed. Re-measure with the fixture in `band-mutate2.py`'s shape, never quote this paragraph.
for (const w of [1360, 1100, 900]) {
  await call('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const tracks = await evaluate(`getComputedStyle(document.querySelector('.ov-columns')).gridTemplateColumns`);
  log(`\n── AT ${w}px — tracks ${tracks}`);
  readBoxes(await json(onScreenExpr), `${w}px`);
}
await call('Emulation.clearDeviceMetricsOverride');
await sleep(900);

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
  const all = [...document.querySelectorAll('.pl-fit[data-deck="0"]')];
  const g = all[idx];
  if (!g) return null;
  const r = g.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  let pawn = 0, other = 0;
  for (let j = 1; j <= 15; j += 1) {
    for (let i = 1; i <= 15; i += 1) {
      const x = r.left + (r.width * i) / 16, y = r.top + (r.height * j) / 16;
      const el = document.elementFromPoint(x, y);
      if (el && el.closest && el.closest('.pl-fit') === g) return { tile: g.dataset.tile, x, y };
      if (el && el.closest && el.closest('.pl-pawn')) pawn += 1; else other += 1;
    }
  }
  // WHAT covered it, not merely THAT it was covered — see the note below the census.
  return { tile: g.dataset.tile, noInk: true, pawn, other };
})`;
// ⭐⭐ THE CENSUS IS FULL NOW, NOT A SAMPLE OF 15. The elevation has ONE projection, so there is no
// reason left to sample: every drawn fitting on the ACTIVE deck is pressed. A sampled census cannot
// tell "the projection is right" from "the 15 I happened to pick are right", and the defect this pin
// exists for was systematic (57 of 59), so a sample would have caught it — but the NEXT one may not
// be. ⚠️ ONLY THE ACTIVE DECK IS PRESSED, and that is not a gap: a press on the other band moves the
// ORDER DECK by design (`crossDeckPress`) and sends no order, so the toast it produces is a
// different sentence and the deck-1 half is driven by its own check further down.
const fitCount = await evaluate(`document.querySelectorAll('.pl-fit[data-deck="0"]').length`);
const wrong = [];
let walked = 0;
let inkless = 0;
// ⚠️⚠️ EACH SAMPLE IS RE-VERIFIED AT THE PRESSED PIXEL AFTER THE PRESS, AND THE CAUSE WAS CHASED
// RATHER THAN GUESSED. Six full runs of this census read 0,1,0,1,0,0 wrong out of ~52 with no code
// between them. THE FIRST HYPOTHESIS WAS WRONG and is recorded because it cost a guard: "the scene
// is `innerHTML`-swapped at 10 Hz so the node list shifts under the press" — a re-check of
// `.pl-fit[idx]`'s own `data-tile` after the press fired ZERO times while a miss still happened, so
// the node is not what moves.
//
// ⭐ WHAT ACTUALLY MOVES IS THE PAWN. Her figure and her LABEL PILL live in a persistent OVERLAY
// stacked above the plate, and `.pl-pawn` TAKES THE POINTER (it has to: crew selection on this
// surface is `target.closest('.pl-pawn')`). She WALKS. So a pixel that `elementFromPoint` reported
// as the fitting's own ink when the probe ran can be covered by her pill 120 ms later, and the press
// then lands on the PAWN — `pointToTile`'s `data-tile` fast tier misses, the CTM tier resolves the
// FLOOR TILE UNDER THE CURSOR, and that is the correct answer to the question the player asked.
// It is not a projection defect and scoring it as one would make this pin a coin flip.
//
// ⛔ THE GUARD IS THEREFORE `elementFromPoint` AT THE PRESSED PIXEL, ASKED AGAIN AFTER THE PRESS,
// and it must not be able to hide a real failure: a sample is discarded ONLY when the pixel provably
// no longer belongs to the fitting that was measured. Discards are counted and a run that discards
// many FAILS.
let shifted = 0;
let underPawn = 0;
for (let i = 0; i < fitCount; i += 1) {
  const f = await json(`JSON.stringify(${PROBE}(${i}))`);
  if (!f) continue;
  // ANY sampled point taken by a crew member makes the piece CONTESTED BY THE FIGURE, not merely
  // hidden behind another piece. A majority test was the first cut and it under-counted: a pawn
  // covering a third of a small piece still makes it unpressable while she stands there.
  if (f.noInk) { inkless += 1; if (f.pawn > 0) underPawn += 1; continue; }
  await evaluate(`document.getElementById('ov-toast').textContent = ''`);
  await click(f.x, f.y);
  await sleep(120);
  const line = await evaluate(`document.getElementById('ov-toast').textContent`);
  const still = await evaluate(`(() => {
    const el = document.elementFromPoint(${f.x}, ${f.y});
    const g = el && el.closest ? el.closest('.pl-fit') : null;
    return g ? g.dataset.tile : null;
  })()`);
  const m = /▸ (\d+),(\d+) ON DECK/.exec(line || '');
  if (!m) continue;
  if (still !== f.tile) { shifted += 1; continue; }   // the drawing moved under the press
  walked += 1;
  if (`${m[1]},${m[2]}` !== f.tile) wrong.push(`drawn for ${f.tile} → press designates ${m[1]},${m[2]}`);
}
await clickSel('.ov-orders .ov-tool[data-ov-tool="erase"]');   // disarm
log(`\n── CLICK MAP vs DRAWING (live gesture, FULL census) ────────────────`);
log(`  ${fitCount} fittings drawn on deck 0; ${inkless} with no pressable ink; ${walked} pressed; `
  + `${shifted} discarded (the drawing moved under the press); ${wrong.length} designate the wrong tile`);
if (shifted > Math.max(3, fitCount * 0.1)) {
  problems.push(`${shifted} of ${fitCount} samples were discarded because the node under the cursor `
    + 'changed between the probe and the press. A few are the 10 Hz repaint; this many means the '
    + 'plate is churning, and the census below is measuring whatever survived rather than the plate.');
}
for (const w of wrong.slice(0, 6)) log('    ' + w);
if (walked < 30) problems.push(`only ${walked} fittings pressed — the click census is thin`);
// ⚠️⚠️ "INKLESS" IS TWO DIFFERENT FACTS AND THEY ARE COUNTED SEPARATELY, because conflating them
// made this threshold a coin flip. Runs read 10 and 11 of 62 with no code between them, and 11 trips
// a `walked * 0.2` cap while 10 does not.
//
//   · COVERED BY ANOTHER FITTING — expected, and not a defect: pieces are drawn BACK TO FRONT, so a
//     fitting standing behind a taller one is legitimately hidden by it. Pressing there presses the
//     nearer piece, which is what an oblique view MEANS.
//   · COVERED BY A CREW MEMBER — also expected, and it is the one that MOVES. `.pl-pawn` takes the
//     pointer (crew selection on this surface is `closest('.pl-pawn')`), and she walks, so the set
//     of pieces standing behind her changes between runs. Counting her as occlusion pressure made
//     the cap fire on a ship where somebody happened to be walking.
//
// The cap is therefore applied to the FITTING-occluded half alone. A press on a piece under a pawn
// selects the pawn, which is the correct answer to what the player pointed at.
//
// ⚠️ THE CAP IS 0.3, AND IT IS SET FROM A MEASUREMENT RATHER THAN FROM A FEELING. On `--ship wreck`
// deck 0 the fitting-occluded count read 10, 10, 10 of 62 across three consecutive full runs
// (~16 %), with one earlier run at 11. The previous cap was `walked * 0.2` = 10.4 — four tenths of a
// piece away from the steady-state value, so it fired on the fourth run and not on the first three.
// A rig that cries wolf at 11 and is silent at 10 teaches its readers to re-run it, which is worse
// than no cap. 0.3 keeps real headroom while still catching the failure it is for: "most of the
// compartment's contents have become unpressable", which is a majority, not a sixteenth.
const occluded = inkless - underPawn;
log(`  of the ${inkless} unpressable: ${underPawn} contested by a crew member, ${occluded} behind another fitting`);
if (occluded > Math.max(2, walked * 0.3)) {
  problems.push(`${occluded} sampled fittings have NO pixel of their own ink that is hit-testable and `
    + 'are not under a crew member — that is beyond what back-to-front occlusion accounts for');
}
if (wrong.length) {
  problems.push(`${wrong.length} of ${walked} drawn fittings designate a DIFFERENT tile than the one `
    + 'they are drawn on — the drawing and the click map have come apart again');
}
await png('1-plate-deck0.png');

// ⭐⭐ THE CROSS-DECK PRESS, DRIVEN THROUGH THE REAL GESTURE — the silent defect the elevation
// created and `crossDeckPress` closes. Every designation command carries only x/y and the host
// supplies Z from its own shown deck, so a press on the OTHER band would have ordered on THIS one.
// The rule is "move the order deck, do not guess", and it is measured here rather than argued.
{
  await clickSel('.ov-tab[data-ov-tab="build"]');
  await clickSel('.ov-orders .ov-tool[data-ov-tool="erase"]');
  const at = await json(`JSON.stringify((()=>{
    const g=document.querySelector('.pl-fit[data-deck="1"]'); if(!g) return null;
    const r=g.getBoundingClientRect();
    for(let j=1;j<=15;j++) for(let i=1;i<=15;i++){
      const x=r.left+r.width*i/16, y=r.top+r.height*j/16;
      const el=document.elementFromPoint(x,y);
      if(el&&el.closest&&el.closest('.pl-fit')===g) return {tile:g.dataset.tile,x,y};
    }
    return null; })())`);
  if (!at) {
    problems.push('no pressable fitting on the OTHER band — the cross-deck press cannot be driven');
  } else {
    const before = latest.get('frame')?.deck | 0;
    await evaluate(`document.getElementById('ov-toast').textContent = ''`);
    await click(at.x, at.y);
    await sleep(1200);
    const line = await evaluate(`document.getElementById('ov-toast').textContent`);
    const after = latest.get('frame')?.deck | 0;
    log(`\n── CROSS-DECK PRESS ────────────────────────────────────────────────`);
    log(`  pressed deck-1 fitting at ${at.tile}; order deck ${before} → ${after}; toast ${JSON.stringify(line)}`);
    if (after === before) {
      problems.push('a press on the OTHER band did not move the ORDER DECK. Designation commands '
        + 'carry no Z, so the order would have landed on the deck the player did NOT point at.');
    }
    if (!/ORDERS NOW LAND HERE/i.test(line || '')) {
      problems.push('the cross-deck press said nothing — the deck moved under the player silently');
    }
  }
  await clickSel('.ov-orders .ov-tool[data-ov-tool="erase"]');   // disarm
}

await toDeck(1);
await sleep(2500);
const c1 = await json(censusExpr);
log('\n── DECK 1 ACTIVE (the dead deck) ───────────────────────────────────');
log('  caption    ', JSON.stringify(c1.caption));
log('  bands      ', JSON.stringify(c1.decks));
const d1tiles = c1.tiles.filter((t) => t.deck === '1');
log('  purposed on deck 1:', d1tiles.filter((t) => t.purpose === '1').length, 'of', d1tiles.length);
if (d1tiles.filter((t) => t.purpose === '1').length !== 0) {
  problems.push('the DEAD deck reports purposed compartments — the predicate is wrong');
}
if (d1tiles.some((t) => t.state !== 'unbuilt')) problems.push('a dead-deck compartment is not in the UNBUILT dash');
// ⭐ THE VIEW DID NOT CHANGE, THE ACTIVE BAND DID. That is the elevation's whole behavioural
// difference from VR-P4's plate, and it is asserted rather than assumed: the same 16 compartments
// are drawn either way, and exactly one band is marked active.
if (c1.tiles.length !== c0.tiles.length) {
  problems.push(`stepping the deck rail changed the DRAWING (${c0.tiles.length} → ${c1.tiles.length} `
    + 'compartments). The plate draws every deck; the rail selects the ORDER deck.');
}
if (c1.decks.filter((d) => d.active === '1').length !== 1) {
  problems.push('exactly one band must be marked active — the ORDERS bar names one deck');
}
if ((c1.decks.find((d) => d.active === '1') || {}).deck !== '1') {
  problems.push('the deck rail moved but the drawing marks a different band active');
}
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

// ⭐ THE OWNER'S THREE VIEWPORTS. The band's responsive rules already sweep 1360/1100/900 for
// GEOMETRY; these are the PICTURES at the same widths, because the plate's aspect changed (the
// design's 1058×334 rather than VR-P4's 1028×320) and how the ship sits in a narrow window is a
// thing to look at rather than to assert.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE OWNER'S HOVER FLICKER — THE LIVE WITNESS. Node can prove the state survives a repaint;
// only a real browser can prove the PIXELS do, because the mechanism is Chrome's own `:hover`
// re-evaluation across an `innerHTML` swap.
//
// THE REPORT: "when I am on the ship level and hover my mouse for 2-3 seconds above one of the
// rooms, that room starts flickering." Held here for FIVE seconds — comfortably past the 2-3 s
// onset — with the sim RUNNING, sampling the hovered compartment's highlight at 20 Hz and counting
// every transition. A stationary cursor must produce ZERO after the first.
//
// ⛔ AND THE SAMPLER PROVES THE PLATE REALLY REPAINTED UNDERNEATH IT, by watching the compartment
// element's own identity. Without that, "zero oscillations" is satisfied by a page that never
// rebuilt at all — which is the vacuity this whole class of pin keeps falling into.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ROOM-ENTRY **CONTENT** ASSERTION — and the 4th-shape hole it replaces.
//
// ⛔⛔ WHAT STOOD HERE COULD NOT SEE THE DEFECT IT WAS POINTED AT (independent review, 2026-08-05).
// The leg asked only:
//
//     body.roomzoom-open  ||  #roomzoom-view not hidden  ||  /ROOM ZOOM/i.test(ov-toast)
//
// — three ways of asking "did SOMETHING happen", and the third is satisfied by the FAILURE string
// the Room Zoom itself prints, `"ROOM ZOOM UNAVAILABLE — <anchor>"`. Worse, none of them can see the
// defect that was actually live: a press on the INACTIVE band opened the room and the room was
// EMPTY, because the host still projects the other deck and `roomCells` returns nothing when
// `frame.deck !== focusRoom.deck`. `body.roomzoom-open` is set either way. That is TRAPS' 4th shape
// — a guard whose scope cannot contain its own subject — sitting in the one rig that drives the live
// game.
//
// ⭐ THE REPLACEMENT ASSERTS CONTENT: the compartment the plate DREW n fittings into must open a
// room whose masthead says it holds n. The two numbers come from two independent derivations —
// the plate's from the whole-ship `devices`+`items` channels through `ship-fittings.js`, the room's
// from the one-deck `frame` glyphs through `roomCells` — so their agreement is a real join and not a
// number compared against itself. (`ship-fittings.js`'s header records the tile-for-tile equality
// that makes them comparable at all; this is that claim re-derived off the running wire.)
//
// ⛔ AND IT CARRIES ITS OWN NON-VACUITY, because "n == n" passes trivially when n is 0 on both sides
// — which is precisely the failure being guarded. `enterRoomLegs` requires the reader to report TWO
// DIFFERENT numbers for two compartments the plate draws differently, so a reader stuck on a
// constant (0, or the plate's own census echoed back) reddens. An empty compartment is entered on
// purpose and must read 0 while a furnished one reads its true count.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * How many fittings the PLATE drew into one compartment. The plate's half of the join.
 *
 * ⛔⛔ IT COUNTS DISTINCT `data-tile` VALUES, NOT `.pl-fit` ELEMENTS, AND THAT CHANGED ON 2026-08-06.
 * The Room Zoom's masthead counts TILES — one machine, one entry — while the plate is free to draw a
 * machine more than once. The owner's outboard ruling made it do exactly that: a `SolarWing` wears
 * TWO drawings on this surface, the FEED standing on its own tile and the PANEL bolted to the hull
 * outside, and both are `.pl-fit` (deliberately — the press census is exhaustive over that class and
 * a piece a player can see must answer for its tile). Counting elements read **28 against the room's
 * 25** on `--ship wreck`'s reactor bay and this leg failed, naming the deck as the classic cause.
 *
 * ⇒ THE JOIN'S REAL CLAIM IS ABOUT TILES: *does the plate show what the room contains?* Two pictures
 * of one machine is not a discrepancy; a picture of a machine the room does not hold is. Counting
 * tiles asks that question and is unmoved by how many marks a surface spends on one of them.
 * ⚠️ It does NOT weaken the press census, which still walks every `.pl-fit` element individually.
 *
 * ⛔ AND STATE THE BLIND SPOT IT BUYS (CLAUDE.md's 9th shape — an instrument narrowed goes blind):
 * counting tiles cannot see EXTRA pieces drawn on a tile that already has one. A layer that hung
 * three wings on one feed, or drew every fitting twice, would read the same number as one that drew
 * each once. The press census is the instrument that still sees that (it walks elements, and a piece
 * whose ink is unreachable is reported as "behind another fitting"), and
 * `overview-scene.test.js`'s outboard block counts pieces directly. Do not let a later lane read
 * "the join is green" as "the plate draws each thing once".
 */
const plateCensus = (anchor, deck) => evaluate(
  `new Set([...document.querySelectorAll('.pl-fit[data-anchor=${JSON.stringify(String(anchor))}][data-deck="${deck}"]')]`
  + `.map((e) => e.dataset.tile)).size`);

/**
 * What the opened Room Zoom says it holds. The room's half of the join.
 *
 * ⚠️ THE COUNT IS IN THE **IN-SVG MASTHEAD** (`.rz-title`, `roomTitleSvg` → `roomStatClauses`),
 * NOT in the HTML caption strip — measured, after the first cut of this reader looked at
 * `#rz-caption` and got `"ROOM A0 · NO CREW HERE · 5 PLACED"` back with no `FITTINGS BUILT` clause in
 * it at all, i.e. `placed: null` on every leg and the whole assertion silently unreadable. Both are
 * read now: the masthead is the join's number (`placed OF placed+pending`) and the caption's
 * `N PLACED` is `_capPlaced` = placed + pending, kept as a second witness because they are computed
 * in two different places off the same `roomCells` call.
 *
 * ⚠️ `\\d` IS DOUBLED throughout — this is a template literal, and a single `\d` is eaten by the
 * escape rules before Chrome ever sees the regex.
 */
const readRoom = () => json(`JSON.stringify((()=>{
  const mast=(document.querySelector('.rz-title')||{}).textContent||'';
  const cap=(document.getElementById('rz-caption')||{}).textContent||'';
  const m=/(\\d+) OF (\\d+) FITTINGS BUILT/.exec(mast);
  const c=/(\\d+) PLACED/.exec(cap);
  return { open: document.body.classList.contains('roomzoom-open'),
    mast, cap, placed: m? +m[1] : null, total: m? +m[2] : null, capPlaced: c? +c[1] : null,
    leaf: (document.querySelector('.rz-crumb-leaf')||{}).textContent||'',
    paths: document.querySelectorAll('#rz-layers path').length,
    toast: (document.getElementById('ov-toast')||{}).textContent||'' };
})())`);

const leaveRoom = async () => {
  await clickSel('.rz-crumb-link[data-rz="home"]');
  await sleep(900);
  if (await evaluate(`document.body.classList.contains('roomzoom-open')`))
    problems.push('the Room Zoom would not close — every leg after this one is measuring the wrong surface');
};

/**
 * Press a pixel, require the room it opens to hold what the plate drew into it, come back out.
 * Returns the reading so a caller can compare two of them.
 */
async function pressIntoRoom(what, anchor, deck, x, y) {
  const before = latest.get('frame')?.deck | 0;
  const want = await plateCensus(anchor, deck);
  await evaluate(`document.getElementById('ov-toast').textContent = ''`);
  await click(x, y);
  await sleep(1800);
  const r = await readRoom();
  const after = latest.get('frame')?.deck | 0;
  log(`  ${what} — anchor "${anchor}" on band ${deck}; order deck ${before} → ${after}`);
  log(`     plate drew ${want} fittings · room says ${JSON.stringify(r)}`);
  if (!r.open) {
    problems.push(`a press on ${what} did not open the room at all (toast ${JSON.stringify(r.toast)}). `
      + 'The fitting layer is a sibling of the compartments in this drawing, so the piece has to '
      + 'carry its own `data-anchor` — see `roomAnchorOf`.');
  } else if (r.placed === null) {
    problems.push('the Room Zoom masthead carries no "N OF M FITTINGS BUILT" clause, so the content '
      + `assertion has nothing to read (masthead ${JSON.stringify(r.mast)}, caption ${JSON.stringify(r.cap)})`);
  } else if (r.placed !== want) {
    problems.push(`THE ROOM OPENED WITH THE WRONG CONTENTS: the plate draws ${want} tiles into `
      + `"${anchor}" on band ${deck}, and the room it opened says ${r.placed} (${r.paths} svg paths). `
      + 'TWO CAUSES, and the size of the gap tells them apart.\n'
      + '  · OFF BY ONE OR TWO, and it comes and goes between runs → PAWN OCCLUSION. `GlyphMapper` '
      + 'pass 5 writes `Glyphs.Citizen` over the whole cell, so a crew member standing on a fitting '
      + 'erases it from the FRAME, which is the Room Zoom\'s source; the plate reads `devices`+`items`, '
      + 'which she cannot blank. `roomCells` rescues both halves (device 2026-08-05, ground stack '
      + '2026-08-06) — a gap here means a rescue arm is missing or is not being passed its map by '
      + '`roomzoom-view.js`. ⚠️ THIS IS THE ~50%% FLAKE, and it is what this message used to blame on '
      + 'the deck.\n'
      + '  · EVERY FITTING MISSING (the room says 0) → THE DECK: `roomCells` returns NOTHING when the '
      + 'host is still projecting the other deck, so a cross-band press must take the deck with it '
      + '(`enterCompartment`).');
  }
  if (r.open) await leaveRoom();
  return { ...r, want, before, after };
}

/**
 * The three legs. Kept together because leg 2 is what makes legs 1 and 3 non-vacuous.
 */
async function enterRoomLegs() {
  log('\n── ROOM ENTRY: THE CONTENT JOIN ────────────────────────────────────');
  await clickSel('.ov-tab[data-ov-tab="build"]');
  await toDeck(0);
  await sleep(1500);
  const shown = latest.get('frame')?.deck | 0;

  // The whole plate's per-compartment census, plus a pressable point in each: an anchored FITTING's
  // own ink where there is one (the hard case — that is where a player aims), bare floor otherwise.
  const cells = await json(`JSON.stringify([...document.querySelectorAll('.pl-room[data-anchor]')].map((g)=>{
    const a=g.dataset.anchor, band=g.closest('.pl-deck'), d=band?band.dataset.deck:null;
    const fits=[...document.querySelectorAll('.pl-fit[data-anchor="'+a+'"][data-deck="'+d+'"]')];
    // TILES, not elements — see plateCensus above. A SolarWing wears two drawings on this surface.
    const tiles=new Set(fits.map((f)=>f.dataset.tile)).size;
    let at=null;
    for (const f of fits){ const r=f.getBoundingClientRect();
      for(let j=1;j<=15&&!at;j++) for(let i=1;i<=15&&!at;i++){
        const x=r.left+r.width*i/16, y=r.top+r.height*j/16;
        const el=document.elementFromPoint(x,y);
        if(el&&el.closest&&el.closest('.pl-fit')===f) at={x,y,onInk:true};
      }
      if(at) break; }
    if(!at){ const r=g.getBoundingClientRect(); at={x:r.left+r.width*0.5,y:r.top+r.height*0.88,onInk:false}; }
    return {anchor:a, deck:d, n:tiles, pieces:fits.length, x:at.x, y:at.y, onInk:at.onInk};
  }))`);
  if (!cells || !cells.length) { problems.push('no compartments on the plate — the room-entry legs cannot run'); return; }
  log(`  ${cells.length} compartments; census by band: `
    + JSON.stringify(cells.map((c) => `${c.deck}:${c.anchor}=${c.n}`)));

  // ── LEG 2 FIRST (it is the control): the richest compartment and the poorest one must read back
  //    DIFFERENTLY. Without this, "the room held what the plate drew" is satisfied by a reader that
  //    always answers 0 on a ship whose sampled compartment happens to be bare.
  const byN = cells.slice().sort((a, b) => a.n - b.n);
  const lo = byN[0], hi = byN[byN.length - 1];
  if (lo.n === hi.n) {
    problems.push(`every compartment on this ship draws the same number of fittings (${lo.n}), so the `
      + 'distinguishability control cannot run and the content assertion is unfalsifiable here');
  } else {
    const a = await pressIntoRoom(`the POOREST compartment (${lo.n} drawn)`, lo.anchor, lo.deck, lo.x, lo.y);
    const b = await pressIntoRoom(`the RICHEST compartment (${hi.n} drawn)`, hi.anchor, hi.deck, hi.x, hi.y);
    if (a.placed === b.placed) {
      problems.push(`the Room Zoom reported the SAME fitting count (${a.placed}) for a compartment the `
        + `plate draws ${lo.n} pieces into and one it draws ${hi.n} into. The reader is a constant, so `
        + 'every equality above it is vacuous.');
    }
  }

  // ── LEG 3: THE INACTIVE BAND. This is the defect's own receipt — a press on the band the host is
  //    NOT projecting must open a FURNISHED room, and must have moved the order deck to get there.
  const far = cells.filter((c) => (c.deck | 0) !== shown && c.n > 0).sort((x, y) => y.n - x.n)[0];
  if (!far) {
    problems.push('no furnished compartment on a band other than the active one — the cross-band '
      + 'room entry (the empty-room defect) cannot be driven on this ship');
  } else {
    const r = await pressIntoRoom(`the INACTIVE band (deck ${far.deck}, ${far.n} drawn, `
      + `${far.onInk ? 'on a fitting\'s ink' : 'on bare floor'})`, far.anchor, far.deck, far.x, far.y);
    if (r.after === r.before) {
      problems.push('a press on a compartment on the OTHER band opened the room WITHOUT moving the '
        + 'order deck. The host still projects the deck the player left, so `roomCells` sees a '
        + 'different deck than `_focus` and the room draws empty — silently.');
    }
    if (r.open && r.placed === 0) {
      problems.push(`THE EMPTY-ROOM PRESS IS BACK: "${far.anchor}" opened showing 0 of its ${far.n} `
        + 'drawn fittings from the inactive band.');
    }
  }
}

{
  await clickSel('.ov-tab[data-ov-tab="build"]');
  await toDeck(0);
  await sleep(1500);
  // ⭐⭐ THE HOVER IS TAKEN OVER A COMPARTMENT'S **CONTENTS**, NOT OVER ITS BARE FLOOR, AND THAT IS
  // WHERE A DEFECT LIVED. The elevation draws the fitting layer ABOVE the compartments (the pieces
  // must sort back-to-front across the whole deck floor), so `closest('.pl-room')` returned null for
  // every pixel of every piece. Measured here first: `elementFromPoint` at 50 % and 75 % of a
  // compartment's height resolved to NO room and only 90 % — bare floor — found one, so a press on
  // a room's contents did not open it and a hover over them did not wash it, over most of its area.
  // Sampling the bare floor would have photographed a green rig over a broken affordance.
  // ⚠️ THE SPOT NOW CARRIES ITS **BAND**, and that is not decoration. The first `.pl-room` in DOM
  // order is on the TOP band, which is the HIGHEST deck index — i.e. on `--ship wreck` it is deck 1
  // while this section has just stepped the rail to deck 0. So this witness was already pressing the
  // INACTIVE band and nobody knew, which is half of why the press leg below could pass over a room
  // that opened empty. Recorded rather than "fixed" by moving the sample: the flicker witness is
  // band-independent (it is about `:hover` surviving an `innerHTML` swap) and the press leg is
  // driven on BOTH bands explicitly further down.
  const spot = await json(`JSON.stringify((()=>{
    const g=document.querySelector('.pl-room[data-anchor]'); if(!g) return null;
    const r=g.getBoundingClientRect();
    const band=g.closest('.pl-deck');
    return {anchor:g.dataset.anchor, deck: band? band.dataset.deck : null,
      x:r.left+r.width*0.5, y:r.top+r.height*0.55,
      floorX:r.left+r.width*0.5, floorY:r.top+r.height*0.9};
  })())`);
  if (!spot) {
    problems.push('no compartment to hover — the flicker witness cannot run');
  } else {
    // …and the point really is over a FITTING rather than over bare floor, so the leg above is a
    // fact about the hard case. A run where the compartment happens to be empty says so instead of
    // passing quietly.
    const over = await evaluate(`(() => {
      const e = document.elementFromPoint(${spot.x}, ${spot.y});
      if (!e || !e.closest) return 'none';
      return (e.closest('.pl-fit') ? 'fit' : '') + (e.closest('.pl-room') ? '/room' : '');
    })()`);
    log(`  hover point resolves to: ${over} (compartment ${spot.anchor})`);
    if (over === 'none' || over === '/room') {
      problems.push(`the hover witness's point is over ${over}, not over a fitting — it is sampling `
        + 'the easy case, and the measured defect was specifically on a compartment\'s contents');
    }
    // Move the pointer ONCE, then never again.
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.x, y: spot.y, button: 'none' });
    await sleep(300);
    // ⚠️ THE WHOLE PROBE IS ONE ASYNC IIFE RETURNING THE STRING. `JSON.stringify(await …)` is not
    // valid at the top level of a `Runtime.evaluate` expression; `awaitPromise` resolves the
    // expression's own promise, so the stringify has to happen INSIDE it. The first cut got a
    // silent `null` back and reported it as "the plate did not repaint".
    const watch = await json(`(async () => JSON.stringify(await (async () => {
      const sel = '.pl-room[data-anchor="${spot.anchor}"]';
      const on = () => { const g = document.querySelector(sel);
        return g ? g.classList.contains('pl-room-hover') : null; };
      const samples = []; const nodes = new Set();
      for (let i = 0; i < 100; i += 1) {
        const g = document.querySelector(sel);
        if (g) nodes.add(g);
        samples.push(on());
        await new Promise((r) => setTimeout(r, 50));
      }
      let flips = 0;
      for (let i = 1; i < samples.length; i += 1) if (samples[i] !== samples[i - 1]) flips += 1;
      return { n: samples.length, on: samples.filter(Boolean).length, flips,
        rebuilds: nodes.size, first: samples[0], last: samples[samples.length - 1] };
    })()))()`);
    log('\n── HOVER FLICKER WITNESS (5 s, pointer held still, sim running) ────');
    log(`  ${JSON.stringify(watch)}`);
    if (!watch || watch.rebuilds < 2) {
      problems.push(`the hovered compartment's element was rebuilt ${watch && watch.rebuilds} time(s) `
        + 'in 5 s. The plate did not repaint under the cursor, so "zero oscillations" is a fact '
        + 'about a static page and not about the defect.');
    }
    if (watch && watch.flips > 0) {
      problems.push(`THE OWNER'S FLICKER IS BACK: the hover highlight changed state ${watch.flips} `
        + `time(s) in 5 s with the pointer held still (on for ${watch.on} of ${watch.n} samples). `
        + 'The hovered element is destroyed by the repaint and the state is not surviving it.');
    }
    if (watch && watch.on !== watch.n) {
      problems.push(`the hover highlight was on for only ${watch.on} of ${watch.n} samples — a `
        + 'stationary cursor over a compartment must wash it for the whole time it is there');
    }
    // ⭐ AND THE PRESS ON THE SAME PIXEL ENTERS THE ROOM. The hover and the click share one
    // resolution (`roomAnchorOf`), so a rig that proved only the wash would leave the affordance the
    // surface actually advertises — "click a compartment to open it" — unmeasured on the pixels a
    // player aims at.
    await pressIntoRoom('the hover witness\'s own pixel', spot.anchor, spot.deck, spot.x, spot.y);
  }

  await enterRoomLegs();
}

// ⚠️ BACK TO THE BUILD TAB FIRST. The WORK island is still up from the shot above, and it covers
// the plate — the first run of these three photographed the work grid over the ship.
await clickSel('.ov-tab[data-ov-tab="build"]');
await toDeck(0);
await sleep(1500);
for (const [i, w] of [[5, 1360], [6, 1100], [7, 900]].entries()) {
  await call('Emulation.setDeviceMetricsOverride', { width: w[1], height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1400);
  await png(`${w[0]}-w${w[1]}.png`);
  void i;
}
await call('Emulation.clearDeviceMetricsOverride');
await sleep(600);

if (consoleErrors.length) problems.push('console errors while drawing: ' + JSON.stringify(consoleErrors.slice(0, 5)));

cdp.close(); ws.close(); chrome.kill('SIGKILL');
if (problems.length) { for (const p of problems) console.error('PROBLEM: ' + p); process.exit(10); }
log('\nOK — the plate draws, its four columns hold, and nothing invented reached the scope.');
// ⚠️ EXPLICIT. The two open WebSockets keep the event loop alive, so without this the rig prints
// its report and then hangs forever — which reads exactly like a rig that never finished.
process.exit(0);
