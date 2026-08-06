#!/usr/bin/env node
//
// ⛔⛔ STALE AS OF 2026-08-06 — THIS RIG ADDRESSES DOM THE BUILD TRAY DELETED, AND IT WILL DIE ON ITS
// NEXT RUN. It is FILED, not fixed, and the filing is here rather than only in `HANDOVER.md` because
// a rig that fails for a reason nobody wrote down reads as a regression in the game.
//   WHAT IS GONE: `.rz-palette`, `.rz-tool`, `.rz-tool-cost` and `#rz-matstrip` / `.rz-mat-chip`.
//   WHAT REPLACED IT: `#rz-tray` — a breadcrumb, two rails (`.rz-tray-cat` / `.rz-tray-sub`) and a
//     row of `.rz-card`s. A tool's control now exists ONLY while its leaf is open, so every selector
//     below needs a NAVIGATION step in front of it (press `[data-rzcat=…]`, then `[data-rzsub=…]`,
//     both derivable from `build-tray-model.js`'s `trayLeafFor` / `categoryOf` — see
//     `client/tools/build-tray-shot.mjs`, which does exactly this).
//   ⚠️ NOTHING REDDENS TODAY: none of the four stale rigs is in `./ci.sh`.
//   ⚠️ THE PORT IS THE CHEAPEST OF THE FOUR AND THE MOST WORTH DOING: every question it asks
//   still has an answer on the tray — the price line is `.rz-card-price`, the armed state is
//   `.rz-card[aria-pressed="true"]` for a tool card and `.rz-card[aria-checked="true"]` for a material
//   card, and the six swatches are the STRUCTURE leaf's own cards.
//
// palette-honesty-shot.mjs — DOES THE PALETTE ACTUALLY ANSWER, ON THE SHIP THE PLAYER BOOTS?
//
// ⚠️ WHY A BROWSER RIG AND NOT JUST THE NODE SUITE. `client/test/palette-honesty.test.js` drives the
// four answers through the shipped controller over `dom-lite` and proves the SEMANTICS: the sentence
// is composed, the row is written, the command still goes, the fake art is gone. What it cannot
// prove is the thing the owner actually reported — *"I cannot build anything except the walls"* is a
// complaint about what is ON THE SCREEN. A price rendered into a node that is 0 px wide, clipped
// out of the palette's box, or painted in a colour the fill swallows is `invisible-feedback-is-
// FUNCTIONAL` all over again, and only a real layout engine can answer it. This tool measures:
//
//   1. THE PRICE IS ON THE CHIP AND IN THE BOX. Every `.rz-tool-cost` line has a non-zero border box
//      that lies fully inside its button, and every button lies fully inside the palette's clipping
//      box — at six viewport widths, because the cost line makes eighteen buttons TALLER and WIDER
//      and that is exactly the regression `palette-shot.mjs` exists to catch.
//   2. A BUNK CLICK ANSWERS EITHER WAY. Arm BUNK on the shipped `--ship wreck`, click clear floor,
//      and require the outcome the ship's own cost row promised: a placement that PLACES and SPENDS
//      when it can pay, the refusal sentence when it cannot. Neither branch may pass on silence.
//   3. THE FLOOR DEFAULT DRAG ANSWERS. Arm FLOOR, sweep without touching a swatch, read the toast.
//   4. SHELF STOPS PRETENDING. Arm SHELF, click, and require BOTH the sentence AND the absence of
//      any `.rz-decor` group in the rendered layer stack.
//   5. THE THREE NEW TOOLS PLACE AND ARE PAID FOR. GROWBED / MEDBED / TABLE arm, price, and either
//      put a piece in the room AND take 3 PARTS off the ship for it, or say why not.
//
// ⭐ EVERY TOAST READ IS PRECEDED BY A BLANKING WRITE, and that is the rig's own non-vacuity rule: a
// toast left on screen by the PREVIOUS leg reads exactly like one the current gesture produced. The
// node is emptied and confirmed empty before each gesture, so every sentence below is fresh.
//
// ⭐ AND THE DECOR LEG CARRIES A PLANTED FAILURE. "No `.rz-decor` in the layer stack" is an ABSENCE,
// and a rig that could never see a decor group at all would report that absence forever. One is
// planted into the live SVG, the detector is required to find it, and the next repaint is required
// to sweep it away — a search that finds nothing and a search that cannot find anything look
// identical otherwise (TRAPS, 4th shape).
//
// It is NOT in `./ci.sh`: Chrome is not a CI dependency here. Run it by hand.
//
// USAGE
//   1. ./play.sh --host-port 8394 --client-port 8395 --no-open
//   2. node client/tools/palette-honesty-shot.mjs --out <dir> [--host-port 8394] \
//        [--client-port 8395] [--prefix palhon-] [--cdp-port 9351]
//
// Exits non-zero if the host will not answer, if the Room Zoom cannot be entered, if any measured
// control is unreachable, if any of the four answers is missing, or if the planted control fails.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ⭐ THE EXPECTED COST-LINE COUNT IS DERIVED FROM THE PALETTE'S OWN TABLES, NOT TYPED (2026-08-04).
// It was the literal `9` ("7 furniture + 2 decor") until GROWBED, MEDBED and TABLE joined the bar and
// made it 12. A hand-typed census in a harness that is NOT in `./ci.sh` does not fail when it goes
// stale — it fails on the next person's unrelated run, naming a defect that is not there. Imported
// from the shipped modules for the reason `heater-shot.mjs`'s own imports give: this tool cannot then
// drift from what the surface believes.
import { ROOM_TOOLS } from '../src/ui/room-model.js';
import { chipCostText, DEVICE_PLACE_COST_PARTS } from '../src/ui/build-cost-model.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
/** How many palette buttons the shipped tables say carry a cost line at all. */
const PRICED_CHIPS = ROOM_TOOLS.filter((t) => chipCostText(t) !== '').length;
const HOST_PORT = +arg('host-port', '8394');
const CLIENT_PORT = +arg('client-port', '8395');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'palhon-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9351');
const HEIGHT = +arg('height', '1000');
const WIDTHS = arg('widths', '1600,1440,1280,1140,1024,900').split(',').map((s) => +s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

const problems = [];
const note = (m) => { problems.push(m); console.error('  ✗ ' + m); };
const ok = (m) => log('  ✓ ' + m);

// ───────────────────────────────────────────────────────────── Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'palhon-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${Math.max(...WIDTHS)},${HEIGHT}`,
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
// ⚠️ THE PID IS RECORDED AND ONLY THIS PID IS EVER KILLED (TRAPS 5, session-G addendum): a broad
// `pkill -f chrome` here takes out a SIBLING lane's gate, and a leaked headless Chrome OOM-kills
// someone else's suite as a bare exit-137 that reads like a crash in their code.
const CHROME_PID = chrome.pid;

/**
 * ⛔⛔ THE HANDLE IS REAPED ON *EVERY* EXIT, NOT ONLY THE ONES THIS FILE SPELLS OUT.
 *
 * ⚠️ THE HOLE THIS CLOSES WAS MEASURED, NOT IMAGINED (review, 2026-08-04): the `die()` paths below
 * kill Chrome, and so does the end-of-run tail — but they are the only two. EVERY OTHER WAY OUT OF
 * this script leaked a live headless browser: a CDP call that comes back a shape the destructuring
 * does not expect, a `find` on an undefined list, a WebSocket that closes mid-run, an unhandled
 * rejection from the `evaluate` chain, a Ctrl+C. `rig-lib.mjs`'s `die(chrome, …)` (landed on main,
 * same night, same motivation) fixes the FIRST class — an exit path that forgot the handle — and
 * this fixes the SECOND, which no `die()` helper can reach: an exit path nobody wrote at all.
 *
 * ⛔ AND A LEAK HERE IS SOMEBODY ELSE'S PROBLEM, WHICH IS WHY IT IS WORTH THE LINES. Measured
 * 2026-08-02 (`why-line-shot.mjs`'s header): two leaked headless instances at ~290 MB each got
 * another agent's `dotnet test` OOM-killed — SIGKILL, exit 137, which reads exactly like a crash in
 * THEIR suite. On this box several sibling lanes gate concurrently.
 *
 * ⭐ IT KILLS THE RECORDED PID AND NOTHING ELSE — never a pattern (TRAPS 5, session-G addendum): a
 * `pkill -f chrome` takes out a sibling's rig mid-run. `process.on('exit')` runs synchronously, so
 * `process.kill`/`rmSync` (both sync) are the only two calls it may make.
 *
 * ⭐ DRIVEN AS A 2x2, NOT ASSERTED (2026-08-04). The SAME bare `throw` was planted mid-rig — at the
 * head of STEP 3, after the page is up, the Room Zoom is entered and two steps have already run,
 * which is where a real defect lands — and both trees were run against one live host:
 *   · PRE-FIX (`bded8b9`'s rig) → exit 1, node's bare unhandled-throw report, and EIGHT Chrome
 *     processes still alive afterwards (the parent re-parented to init, plus seven helpers).
 *   · SHIPPED (this reaper)     → exit 13, the sentence above on stderr, and ZERO survivors.
 * Counted by the run's own `--user-data-dir`, which every helper inherits in its argv, so the count
 * is this run's and no sibling lane's; the eight were then killed BY PID.
 */
let _reaped = false;
function reapChrome() {
  if (_reaped) return;
  _reaped = true;
  try { process.kill(CHROME_PID, 'SIGKILL'); } catch { /* already gone */ }
  try { rmSync(userDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.on('exit', reapChrome);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { reapChrome(); process.exit(130); });
}
// An ESM top-level throw and a stray rejection both reach here; each names itself so the run is not
// silently attributed to a product failure, then leaves through the reaper above.
process.on('uncaughtException', (e) => {
  console.error('FAIL: the rig threw and did not handle it — ' + ((e && e.stack) || e));
  process.exit(13);
});
process.on('unhandledRejection', (e) => {
  console.error('FAIL: the rig rejected and did not handle it — ' + ((e && e.stack) || e));
  process.exit(13);
});

const die = (code, msg) => {
  console.error('FAIL: ' + msg);
  reapChrome();
  process.exit(code);
};

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) die(5, 'Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
const move = async (x, y) => { await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); };
const down = async (x, y) => call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
const up = async (x, y) => call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
const clickAt = async (x, y) => { await down(x, y); await up(x, y); };
/** A press-drag-release sweep — the real gesture; a synthetic click is a different code path. */
const dragFromTo = async (a, b) => {
  await move(a.x, a.y); await down(a.x, a.y);
  await move((a.x + b.x) / 2, (a.y + b.y) / 2); await move(b.x, b.y);
  await up(b.x, b.y);
};

async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) die(6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const setWidth = async (w) => {
  await call('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
};
/** A dead socket disarms the tool and every leg below then reports a defect that is not there —
 *  `palette-shot.mjs`'s FALSE-RED guard, kept because it has fired for real. */
const assertLinked = async (where) => {
  const gone = await evaluate(`(()=>{const d=document.getElementById('disc');` +
    `return !!(d && getComputedStyle(d).display !== 'none');})()`);
  if (gone) die(10, `the client lost its socket to the host (${where}) — a disconnect disarms the ` +
    'tool, so nothing measured after this point is about the palette');
};

await call('Page.enable');
await call('Runtime.enable');
await setWidth(Math.max(...WIDTHS));
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

const onb = await evalJson(`(()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
if (onb) { log('dismissing onboarding'); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) die(8, 'the onboarding card is still up');

// Enter the Room Zoom with the real entry gesture on a HIT-TESTED room (palette-shot.mjs's rule:
// `querySelector('.pl-room')` alone works at 1600 px and lands on the crew panel at 1300).
let entered = false;
for (let attempt = 0; attempt < 3 && !entered; attempt++) {
  const cands = await evalJson(`(()=>[...document.querySelectorAll('.pl-room[data-anchor]')].map(e=>{
    const r=e.getBoundingClientRect(); const x=r.x+r.width/2, y=r.y+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return {a:e.getAttribute('data-anchor'),x,y,top:!!(hit&&(hit===e||e.contains(hit)))};
  }).filter(c=>c.top))()`) || [];
  for (const c of cands) {
    await clickAt(c.x, c.y);
    await sleep(2500);
    entered = await evaluate(`document.body.classList.contains('roomzoom-open')`);
    if (entered) { log('entered room', c.a); break; }
  }
  if (!entered) await sleep(1500);
}
if (!entered) die(7, 'the Room Zoom did not open');
await assertLinked('after entry');

// ───────────────────────────────────────────── STEP 1: the price is on the chip, and it is VISIBLE
//
// A cost line COUNTS as visible when its border box has real area, lies inside its own button, and
// that button lies inside the palette's clipping box. Nothing here re-derives geometry the browser
// already computed.
const MEASURE = `(() => {
  const inBox = (el, box) => {
    const r = el.getBoundingClientRect();
    return r.left >= box.left - 0.5 && r.right <= box.right + 0.5
        && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
  };
  const pal = document.querySelector('.rz-palette');
  if (!pal) return null;
  const box = pal.getBoundingClientRect();
  const btns = [...pal.querySelectorAll('.rz-tool')];
  const costs = [];
  for (const b of btns) {
    const c = b.querySelector('.rz-tool-cost');
    if (!c) continue;
    const cr = c.getBoundingClientRect(), br = b.getBoundingClientRect();
    const cs = getComputedStyle(c);
    costs.push({
      tool: b.getAttribute('data-rztool'),
      text: c.textContent.trim(),
      w: Math.round(cr.width * 10) / 10, h: Math.round(cr.height * 10) / 10,
      btnW: Math.round(br.width * 10) / 10, btnH: Math.round(br.height * 10) / 10,
      inButton: inBox(c, br), fontSize: cs.fontSize, opacity: cs.opacity, color: cs.color,
      cant: b.classList.contains('cant'), title: b.getAttribute('title') || '',
    });
  }
  return {
    tools: btns.length,
    clipped: btns.filter((b) => !inBox(b, box)).map((b) => b.getAttribute('data-rztool')),
    rows: new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size,
    palH: Math.round(box.height), palW: Math.round(box.width),
    wrapH: Math.round((document.querySelector('.rz-palette-wrap') || box).getBoundingClientRect?.().height || 0),
    costs,
  };
})()`;

log('\nSTEP 1 — the price on the chip, measured across widths');
const widths = [];
for (const w of WIDTHS) {
  await setWidth(w);
  await assertLinked('width sweep @ ' + w);
  const m = await evalJson(MEASURE);
  if (!m) die(9, 'no .rz-palette at width ' + w);
  widths.push({ w, ...m });
  log(`  w=${w}  tools ${m.tools} (clipped ${m.clipped.length})  rows=${m.rows}  palette ${m.palW}x${m.palH}  ` +
      `cost lines ${m.costs.length}  chip box ${m.costs[0] ? m.costs[0].btnW + 'x' + m.costs[0].btnH : 'n/a'}  ` +
      `cost box ${m.costs[0] ? m.costs[0].w + 'x' + m.costs[0].h : 'n/a'}`);
  if (m.clipped.length) note(`w=${w}: tools UNREACHABLE — ${m.clipped.join(', ')}`);
  if (m.costs.length !== PRICED_CHIPS) {
    note(`w=${w}: ${m.costs.length} cost lines in the live palette, but ROOM_TOOLS + chipCostText ` +
      `say ${PRICED_CHIPS} tools carry one. The markup and the model disagree.`);
  }
  for (const c of m.costs) {
    if (!(c.w > 0 && c.h > 0)) note(`w=${w}: the ${c.tool} price has a ZERO box (${c.w}x${c.h}) — rendered and invisible`);
    if (!c.inButton) note(`w=${w}: the ${c.tool} price escapes its own button`);
    if (!c.text) note(`w=${w}: the ${c.tool} chip carries an EMPTY price line`);
  }
}
await setWidth(WIDTHS[0]);
await png('01-palette-priced.png');

// The refusal state on the chip itself, on the shipped wreck.
const chipState = (await evalJson(MEASURE)).costs;
const bunkChip = chipState.find((c) => c.tool === 'bunk');
log(`  BUNK chip: "${bunkChip.text}"  ${bunkChip.btnW}x${bunkChip.btnH} px  price ${bunkChip.w}x${bunkChip.h} px ` +
    `@ ${bunkChip.fontSize} opacity ${bunkChip.opacity} colour ${bunkChip.color}  cant=${bunkChip.cant}`);
log(`  BUNK hover title: "${bunkChip.title}"`);
if (bunkChip.text !== '3 PARTS') note(`the BUNK chip prices a placement as "${bunkChip.text}"`);
if (!/^BUNK ▸ /.test(bunkChip.title)) note('the BUNK chip carries no hover sentence');
const shelfChip = chipState.find((c) => c.tool === 'shelf');
if (shelfChip.text !== 'NOT YET') note(`the SHELF chip reads "${shelfChip.text}"`);
if (!shelfChip.cant) note('the SHELF chip does not read as not-yet-buildable');
else ok('SHELF and RUG wear the cannot-do state at rest');

// ───────────────────────────────────────────── the gesture helpers, on the live layout
const btnPoint = async (tool) => evalJson(`(()=>{const b=document.querySelector('.rz-tool[data-rztool="${tool}"]');` +
  `if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
const armTool = async (tool) => {
  const p = await btnPoint(tool);
  if (!p) die(9, `no ${tool.toUpperCase()} button in the palette`);
  await clickAt(p.x, p.y);
  await sleep(900);
  return p;
};
const armedTools = async () => evalJson(`[...document.querySelectorAll('.rz-tool[aria-pressed="true"]')].map(b=>b.getAttribute('data-rztool'))`);
const costRow = async () => evalJson(`(()=>{const e=document.getElementById('rz-cost');if(!e)return null;` +
  `const r=e.getBoundingClientRect();const l=e.querySelector('.rz-cost-line');` +
  `return {hidden:e.hidden,text:e.textContent.trim(),w:Math.round(r.width),h:Math.round(r.height),` +
  `fault:!!(l&&l.classList.contains('fault')),color:l?getComputedStyle(l).color:''};})()`);

// ───────────────────────────────────────────── THE SPEND, READ OFF THE SURFACE'S OWN LEDGER SIGNAL
//
// ⛔⛔ WHY A DEBIT DECIDES AND THE PIECE COUNT ONLY CORROBORATES — MEASURED, NOT PREFERRED.
// STEP 2 and STEP 5 used to call a placement PROVED by `.rz-furniture > g` going up by one. THAT
// COUNT IS NOISY: review named it 2026-08-04, and this rig then reproduced it on its own run —
// 20 pieces after MEDBED's REFUSED click, 19 before TABLE's, 20 after TABLE's (also refused), with
// the ship's purse flat at 2 PARTS through all three. So `after === before + 1` can green WITHOUT A
// PLACEMENT, which is precisely the silent no-op both legs exist to catch, and it can red on a real
// one. It is kept — a piece the player cannot SEE is not a placement either — but it is de-noised
// (max over five samples, `furnitureSample`) and it is not what decides.
//
// The verdict is the ship's PURSE, because it is the SIM's own receipt and it does not flicker:
// `PlaceDeviceCommand` charges `defs.Build.DevicePlaceCost` = 3 PARTS and charges it LAST, after
// every legality check, so nothing but a placement that actually happened moves it and an illegal
// or unaffordable click provably leaves it alone. A piece that appeared for free did not come from
// this click; a debit that landed did.
//
// ⚠️ AND THE DEBIT IS WHAT THE CANDIDATE-TILE LOOP BREAKS ON, not the count. Using a flickering
// signal as control flow is how a rig clicks again on a tile it already built — buying a second
// device with the player's Parts to satisfy its own instrument.
//
// ⭐⭐ THE PLANTED CONTROL, RUN RATHER THAN ARGUED (2026-08-04). "The debit adds something the count
// could not see" is a claim, so it was DRIVEN: `PlaceDeviceCommand`'s charge was neutered to
// `TryPay(sim, 0)` on a rebuilt host — placements land, nothing is ever paid for — and this rig was
// run against it. It went RED on STEP 2 and on all three STEP 5 tools, naming the missing debit
// every time. ⛔ AND THE MEDBED LEG IS THE WHOLE ARGUMENT IN ONE LINE: its census moved
// `24 → 25`, EXACTLY `before + 1`, with the purse flat at 8 PARTS — the old count-only predicate
// would have called that a PLACED, PAID-FOR bunk and greened the run. The charge was then restored
// byte-identically and the rig re-run green (STEP 2 8 → 5 PARTS, GROWBED 5 → 2).
//
// ⚠️ THE NUMBER IS THE SURFACE'S OWN, NOT A SECOND DERIVATION. `paletteCostRow` writes the armed
// tool's row out of `partsUnits(Hud.getLedger())` — the same reader the Overview's LEDGER island
// prints — so parsing the row here asks the shipped client what it believes the ship holds. Both of
// the row's shapes carry it: `BUNK ▸ 3 PARTS · 8 ABOARD` and `BUNK ▸ NEEDS 3 PARTS — SHIP HAS 2`.
/** PARTS aboard, off the armed cost row. `null` when no priced tool is armed (the row is hidden). */
const partsFromRow = (row) => {
  if (!row || row.hidden || !row.text) return null;
  const m = /(?:· (\d+) ABOARD|SHIP HAS (\d+))$/.exec(row.text);
  return m ? +(m[1] !== undefined ? m[1] : m[2]) : null;
};
const partsNow = async () => partsFromRow(await costRow());
/**
 * Poll the row until the purse reads `want`, hard-bounded; return the LAST value seen either way.
 * ⚠️ THE WAIT IS NOT POLITENESS. The host re-samples the `ledger` channel only when a render pass
 * finds a WALL SECOND has elapsed (`GameSession.cs`'s `_ledgerAtWall` cadence, ~1.0–1.2 s) and
 * NOTHING forces a fresh census on a place command, so a read taken straight after the click can
 * still be the pre-click balance. Returning the last value rather than throwing keeps the caller in
 * charge of the sentence: a debit that never arrives is reported as the number it actually was.
 */
const settleParts = async (want, budgetMs = 6000) => {
  const t0 = Date.now();
  let seen = await partsNow();
  while (seen !== want && Date.now() - t0 < budgetMs) {
    await sleep(300);
    seen = await partsNow();
  }
  return seen;
};
/** ⭐ BLANK THE TOAST, CONFIRM IT IS BLANK, then gesture. A toast left up by the previous leg reads
 *  exactly like one this leg produced — this is the rig's own non-vacuity rule. */
const blankToast = async () => {
  await evaluate(`(()=>{const t=document.getElementById('rz-toast');if(t){t.textContent='';t.hidden=true;}})()`);
  const left = await evaluate(`(document.getElementById('rz-toast')||{}).textContent`);
  if (left) die(11, 'the toast could not be blanked — every sentence below would be unattributable');
};
const toast = async () => evalJson(`(()=>{const t=document.getElementById('rz-toast');if(!t)return null;` +
  `const r=t.getBoundingClientRect();return {hidden:t.hidden,text:t.textContent.trim(),` +
  `w:Math.round(r.width),h:Math.round(r.height)};})()`);
/** A point on plain floor inside the framed room: the canvas centre, then nudged if it holds art. */
const floorPoints = async (n) => evalJson(`(()=>{const c=document.getElementById('rz-canvas');
  const r=c.getBoundingClientRect(); const out=[];
  for (let i=0;i<${n};i++) out.push({x:r.x+r.width*(0.42+i*0.06), y:r.y+r.height*0.56});
  return out;})()`);
/**
 * Furniture pieces drawn in the focused room — one `<g>` per piece, SAMPLED FIVE TIMES OVER ~1 s AND
 * MAXED, returned with the raw series so every log line carries its own evidence.
 *
 * ⛔ THE SAMPLING IS NOT CAUTION, IT IS THE MEASURED SHAPE OF THIS SIGNAL. A single read of this
 * selector OSCILLATES on the shipped wreck with nothing happening: this rig's own run recorded the
 * cryo bay's count at 20 immediately after MEDBED's refused click and at 19 immediately before
 * TABLE's, then 20 again after TABLE's — a click the sim refused, with the ship's purse flat at 2
 * PARTS across all three reads. One piece flickers in and out of the drawn layer for reasons that
 * are not the gesture (the layer is rebuilt from the projected frame at the wire's 10 Hz, and the
 * projection is fog-gated — a walking pawn is the obvious suspect, NOT MEASURED, so it is named as a
 * suspect and nothing is claimed). Max-over-a-second collapses the oscillation; the debit below is
 * what actually decides the verdict.
 */
const furnitureSample = async (samples = 5) => {
  const seen = [];
  for (let s = 0; s < samples; s++) {
    seen.push(await evaluate(`document.querySelectorAll('#rz-layers .rz-furniture > g').length`));
    if (s + 1 < samples) await sleep(260);
  }
  return { max: Math.max(...seen), seen, txt: Math.max(...seen) + ' [' + seen.join(' ') + ']' };
};
/** The candidate tiles both click legs draw from — STEP 2 takes the head, STEP 5 the tail. One
 *  device per tile means a fixed point is a FALSE RED generator (trap 3), so every affordable click
 *  is TRIED across several and only an all-candidates-failed run is reported. */
const spots = await floorPoints(10);

// ───────────────────────────────────────────── STEP 2: a refused placement says why
log('\nSTEP 2 — a placement the wreck cannot pay for');
await armTool('bunk');
await assertLinked('after arming BUNK');
if (!(await armedTools()).includes('bunk')) note('the BUNK click did not arm the tool — STEP 2 is vacuous');
const armedRow = await costRow();
log(`  cost row: hidden=${armedRow.hidden} "${armedRow.text}"  ${armedRow.w}x${armedRow.h} px  fault=${armedRow.fault} ${armedRow.color}`);
if (armedRow.hidden || !armedRow.text) note('arming BUNK revealed no cost row');
if (!/^BUNK ▸ (NEEDS 3 PARTS — SHIP HAS \d+|3 PARTS · \d+ ABOARD)$/.test(armedRow.text)) {
  note(`the armed cost row reads "${armedRow.text}" — neither a price nor a refusal`);
}
if (!(armedRow.w > 0 && armedRow.h > 0)) note('the cost row has a zero box — written and invisible');
await png('02-bunk-armed-priced.png');

// ⛔⛔ THIS STEP'S PREMISE IS READ OFF THE SHIP, NOT ASSUMED — CORRECTED 2026-08-04, AND THE
// CORRECTION IS THE POINT RATHER THAN A TIDY-UP.
//
// It used to require the refusal sentence UNCONDITIONALLY: `--ship wreck` booted holding ONE Parts
// unit against a price of three, so every furniture click on the shipped ship was refused and this
// leg simply pinned that. Then D7 (`lane/parts-affordability`, main a985fa5) put SEVEN one-unit
// cabin-stores crates in the cryo bay so the first bunk could go down in the first hour — the ship
// boots with EIGHT Parts and BUNK is now AFFORDABLE. The old leg would have reported
// *"a furniture click on the shipped wreck said NOTHING — the owner's defect"* against a placement
// that WORKED: a red naming the exact defect the package deleted, which is this repo's FALSE RED
// shape (trap 3) with a content change as its cause. The harness is not in `./ci.sh`, so nothing
// caught it; it is caught here because this lane had to run the rig.
//
// So the leg now asks the COST ROW — the surface's own statement of what the ship can pay — and
// requires the matching outcome. Both branches are real requirements: an unaffordable click must
// name its price, and an affordable one must NOT invent a refusal.
//
// ⛔⛔ AND NEITHER BRANCH MAY PASS ON SILENCE — CORRECTED 2026-08-04 (review), BECAUSE THE FIRST
// REWRITE OF THIS LEG RE-CREATED THE DEFECT IT EXISTS FOR. It read `if (refusal sentence) note()
// else ok()`, so a click that said NOTHING AND PLACED NOTHING took the `else` and reported
// *"a placement the ship CAN pay for invents no refusal"* — green. That is M3-10's shipped bug
// exactly (`TryFurnitureKind` fell to `default`, `HandlePlace` returned, and a refused placement is
// a silent no-op by design: the palette did nothing and said nothing for weeks and every test was
// green). A leg whose affordable branch asserts only the ABSENCE of a sentence cannot see it.
// So the affordable branch now requires the two POSITIVE facts a real placement leaves behind — a
// piece in the room AND 3 PARTS off the ship — and the unaffordable branch still requires the
// sentence. Silence fails on both sides.
const affordable = / · \d+ ABOARD$/.test(armedRow.text);
const partsAboard = partsFromRow(armedRow);
log(`  the ship's own answer: ${affordable ? 'CAN' : 'CANNOT'} pay (${partsAboard} Parts aboard)`);
if (partsAboard === null) note('the armed cost row states no Parts balance — the spend cannot be checked');
const bunkBefore = await furnitureSample();
const bunkTries = affordable ? spots.slice(0, 3) : [spots[0]];
let bunkAfter = bunkBefore, placeToast = null, bunkTried = 0, bunkPartsAfter = partsAboard;
for (const at of bunkTries) {
  bunkTried += 1;
  await blankToast();
  await clickAt(at.x, at.y);
  await sleep(1200);
  placeToast = await toast();
  bunkPartsAfter = await settleParts(affordable ? partsAboard - DEVICE_PLACE_COST_PARTS : partsAboard);
  bunkAfter = await furnitureSample();
  if (!affordable || partsAboard - bunkPartsAfter === DEVICE_PLACE_COST_PARTS) break;
  log(`    (candidate ${bunkTried} at x=${Math.round(at.x)} bought nothing — one device per tile; trying the next)`);
}
const bunkSpent = partsAboard === null || bunkPartsAfter === null ? null : partsAboard - bunkPartsAfter;
log(`  click toast: hidden=${placeToast.hidden} "${placeToast.text}" ${placeToast.w}x${placeToast.h} px`);
log(`  furniture pieces ${bunkBefore.txt} → ${bunkAfter.txt} (after ${bunkTried} candidate tile(s))   ` +
    `PARTS ${partsAboard} → ${bunkPartsAfter} (spent ${bunkSpent})`);
if (affordable) {
  // ⛔ THE DEBIT IS ASKED FIRST because it is the sim's receipt and it does not flicker; the piece
  // count is asked second because a placement the player cannot SEE is not a placement either.
  if (bunkSpent !== DEVICE_PLACE_COST_PARTS) {
    note(`the ship holds ${partsAboard} PARTS against a price of ${DEVICE_PLACE_COST_PARTS} and ` +
      `${bunkTried} BUNK click(s) BOUGHT NOTHING — the purse went ${partsAboard} → ${bunkPartsAfter} ` +
      `(${bunkSpent} spent) and the toast said "${placeToast.text}". THE SIM TOOK NOTHING, and it ` +
      'charges LAST — so on any tree where `PlaceDeviceCommand` still does, nothing was placed and ' +
      'the button is armed and inert, silently: the owner\'s defect.');
  } else if (bunkAfter.max !== bunkBefore.max + 1) {
    note(`the ship PAID ${bunkSpent} PARTS for a BUNK and the room does not show it — the furniture ` +
      `census went ${bunkBefore.txt} → ${bunkAfter.txt}. Matter left the ship and the player can see ` +
      'nothing for it, which is `invisible-feedback-is-FUNCTIONAL` with the money already spent.');
  } else {
    ok(`a placement the ship CAN pay for PLACES (${bunkBefore.max} → ${bunkAfter.max} pieces) and is ` +
       `PAID FOR (${partsAboard} → ${bunkPartsAfter} PARTS)`);
  }
  if (!placeToast.hidden && /NEEDS \d+ PARTS/.test(placeToast.text)) {
    note(`the ship holds ${partsAboard} Parts against a price of 3 and the click was still refused: ` +
      `"${placeToast.text}". A surface that refuses a placement the sim will accept is the silent ` +
      'no-op re-created from the other side.');
  }
} else if (placeToast.hidden || !placeToast.text) {
  note('a furniture click on the shipped wreck said NOTHING — the owner\'s defect');
} else if (!/^BUNK ▸ NEEDS 3 PARTS — SHIP HAS \d+$/.test(placeToast.text)) {
  note(`the click said "${placeToast.text}", which is not the refusal sentence`);
} else {
  ok('a refused placement names its price and the ship\'s stock');
  if (!(placeToast.w > 0 && placeToast.h > 0)) note('the refusal toast has a zero box');
  // ⚠️ The purse is asserted in BOTH directions; the piece count is NOT asserted here. A refused
  // click must take nothing (`TryPay` is never reached), and that is a hard fact. "The count did not
  // move" is not — it flickers on its own (see `furnitureSample`), so asserting it on the refusal
  // side would red on noise while adding nothing the debit has not already settled.
  if (bunkSpent !== 0) note(`a REFUSED BUNK click still took ${bunkSpent} PARTS off the ship`);
}
await png('03-place-click.png');
await armTool('bunk');   // disarm

// ───────────────────────────────────────────── STEP 3: the FLOOR default drag
log('\nSTEP 3 — the FLOOR tool with nothing chosen (the default drag)');
await armTool('floor');
await assertLinked('after arming FLOOR');
const matChips = await evalJson(`(()=>{const s=document.getElementById('rz-matstrip');
  return {hidden:s.hidden, chips:[...s.querySelectorAll('.rz-mat-chip')].map(c=>({mat:c.getAttribute('data-rzmat'),on:c.classList.contains('on'),title:c.getAttribute('title')}))};})()`);
log(`  material strip: hidden=${matChips.hidden}  pre-selected=${JSON.stringify(matChips.chips.filter((c) => c.on))}`);
if (!matChips.chips.some((c) => c.on && c.mat === '0')) {
  note('the FLOOR picker no longer pre-selects material 0 — the no-op this step measures may no longer be reachable');
}
const run = await floorPoints(4);
await blankToast();
await dragFromTo(run[0], run[3]);
await sleep(900);
const floorToast = await toast();
log(`  default drag toast: "${floorToast.text}"`);
if (!/^FLOOR ▸ ALREADY [A-Z- ]+ — PICK ANOTHER MATERIAL$/.test(floorToast.text)) {
  note(`the default FLOOR drag said "${floorToast.text}" — the guaranteed no-op is still unexplained`);
} else ok('the default FLOOR drag names the material already down and says to pick another');
await png('04-floor-default-answered.png');

// …and a real material change must NOT wear that sentence. Non-vacuity by contrast: two different
// sentences out of the same gesture is the only proof the first one is being DECIDED.
const wood = await evalJson(`(()=>{const c=document.querySelector('.rz-mat-chip[data-rzmat="1"]');` +
  `if(!c)return null;const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
if (!wood) note('no WOOD swatch in the material strip — the contrast leg is vacuous');
else {
  await clickAt(wood.x, wood.y); await sleep(700);
  await blankToast();
  await dragFromTo(run[0], run[3]);
  await sleep(900);
  const woodToast = await toast();
  log(`  WOOD drag toast:    "${woodToast.text}"`);
  if (/ALREADY/.test(woodToast.text)) note(`a WOOD drag over steel-tan floor said "${woodToast.text}"`);
  else if (woodToast.text === floorToast.text) note('both sweeps produced the same sentence — nothing is being decided');
  else ok('a real material change reports what it built, not the no-op sentence');
  await png('05-floor-wood-builds.png');
}
await armTool('floor');  // disarm

// ───────────────────────────────────────────── STEP 4: SHELF stops pretending
log('\nSTEP 4 — SHELF, the button that used to draw a lie');
await armTool('shelf');
const shelfRow = await costRow();
log(`  cost row: "${shelfRow.text}" fault=${shelfRow.fault}`);
if (!/NOT BUILDABLE YET/.test(shelfRow.text)) note(`arming SHELF says "${shelfRow.text}"`);

// ⭐ THE PLANTED FAILURE, BEFORE THE ABSENCE IS TRUSTED. A `.rz-decor` group is injected into the
// live layer stack and the detector must FIND it; the next repaint must then sweep it away. Without
// this, "no decor group" is a claim a rig with a broken selector makes just as confidently.
await evaluate(`(()=>{const l=document.getElementById('rz-layers');
  l.insertAdjacentHTML('beforeend','<g class="rz-decor" data-planted="1"><rect width="4" height="4"/></g>');})()`);
const sawPlanted = await evaluate(`!!document.querySelector('#rz-layers .rz-decor')`);
if (!sawPlanted) die(12, 'the PLANTED decor group was not detected — this rig cannot see decor art ' +
  'at all, so the absence measured below would be worthless');
ok('planted-failure control: the rig CAN see a decor group in the layer stack');
await sleep(1200);   // the surface repaints at the wire's cadence and re-writes the layer
const plantedGone = await evaluate(`!document.querySelector('#rz-layers .rz-decor[data-planted="1"]')`);
if (!plantedGone) note('the planted decor group survived a repaint — the layer is not being rewritten, ' +
  'so an absence after the click below would not be attributable to the click');

const [shelfAt] = await floorPoints(1);
await blankToast();
await clickAt(shelfAt.x, shelfAt.y);
await sleep(1200);
const shelfToast = await toast();
const decorAfter = await evalJson(`(()=>{const g=[...document.querySelectorAll('#rz-layers .rz-decor')];` +
  `return {n:g.length};})()`);
log(`  SHELF click toast: "${shelfToast.text}"   decor groups in the layer: ${decorAfter.n}`);
if (!/NOT BUILDABLE YET/.test(shelfToast.text)) note(`the SHELF click said "${shelfToast.text}"`);
else ok('a SHELF click answers honestly instead of drawing furniture the ship does not have');
if (decorAfter.n !== 0) note(`the SHELF click left ${decorAfter.n} decor group(s) in the layer — the lie is back`);
await png('06-shelf-honest.png');
await armTool('shelf');  // disarm

// ───────────────────────────────────────────── STEP 5: the three tools added 2026-08-04
//
// ⭐⭐ THE PLAYER SENTENCE, DRIVEN ON THE SHIP THE PLAYER BOOTS: GROWBED, MEDBED and TABLE arm,
// price, and PLACE — and the ship pays for them out of the same purse STEP 2's BUNK already drew on,
// so the run walks off the end of it and the later clicks are refused and say so. That the ship runs
// out mid-run is not an inconvenience to work around, it is the second half of the evidence: at 3
// PARTS each the wreck's boot stock buys a couple of pieces, and the click after that must produce a
// sentence rather than a silence. The vacuity floor below asserts the SHAPE (both halves reached),
// never the arithmetic, so a content lane that re-stocks the wreck does not turn this into a chore.
//
// ⚠️ THE VERDICT IS THE RENDERED ROOM, NOT THE TOAST. A toast is what the CLIENT said; the piece in
// `#rz-layers` is what the SIM sent back — the Room Zoom draws devices out of the projected frame,
// and the one historical exception (SHELF/RUG's module-local `_decor` array, which drew art for
// furniture the ship did not have) is deleted and is guarded by STEP 4's planted control. So a new
// `<g>` bearing the piece's own id at the clicked tile is the sim confirming the placement.
//
// ⚠️ AND THE NON-VACUITY IS THE BEFORE-COUNT. "A piece appeared" is worthless without "there was no
// piece there a moment ago", and the wreck AUTHORS furniture in these rooms already — so the census
// is taken immediately before each click and required to go UP BY ONE.
//
// ⛔⛔ BUT THE CENSUS IS NOT ASKED ALONE, AND THAT CORRECTION IS THE POINT (review, 2026-08-04).
// `after === before + 1` over `.rz-furniture > g` is UNSOUND ON ITS OWN: measured on this rig, the
// count went 19 → 20 across a click the sim REFUSED and 20 → 19 with no gesture sent at all, so the
// PLACED verdict could green without a placement — the exact silent no-op this leg exists to catch.
// Every placement is therefore required to move the ship's PURSE by the same click:
// `PlaceDeviceCommand` charges 3 PARTS and charges them LAST (`Commands.cs` — every earlier
// rejection leaves the matter untouched), so a debit of exactly `DEVICE_PLACE_COST_PARTS` is the
// sim's own receipt for the placement, read off the surface's armed cost row. Piece AND receipt, or
// the leg reports which one is missing. A refused click must move NEITHER.
//
// ⛔ THE PIECE CANNOT BE NAMED FROM THE DOM, AND SAYING SO IS THE HONEST FORM OF THIS LEG. The
// registry's `buildItem` is handed `idPrefix: 'rz-f-<tx>-<ty>'` (`roomzoom-view.js`'s
// `furnitureSvg`) — the TILE, never the piece id — and `dining-table` and `med-bed` emit no gradient
// defs at all, so there is no string in the rendered markup that says "hydroponics". A first draft
// of this leg matched `[id*="hydroponics"]` and would have counted ZERO forever while reporting it
// as "the sim never sent the device back": a rig that cannot find anything and a rig that found
// nothing look identical (TRAPS, 4th shape). So the leg asks the two questions the DOM CAN answer:
//   (a) did the room gain a furniture group — `.rz-furniture > g`, one per drawn piece;
//   (b) did it draw as REAL ART rather than the VS-Z-25 dashed placeholder, which is the one path
//       that emits a `<text>` node carrying the sim's raw glyph char (`"` GrowBed, `d` MedBed,
//       `t` Table). Zero of those after the click is "it drew itself", and it is the same predicate
//       `heater-shot.mjs` uses for the bare `E`.
log('\nSTEP 5 — GROWBED, MEDBED and TABLE (the three the sim accepted and the palette never offered)');
/** Raw-glyph placeholder chips bearing this kind's char — the "we don't skin it" fallback. */
const rawChips = async (ch) => evaluate(
  `[...document.querySelectorAll('#rz-layers .rz-furniture text')].filter(t=>t.textContent.trim()===${JSON.stringify(ch)}).length`);
const NEW_TOOLS = [
  { tool: 'growbed', label: 'GROWBED', piece: 'hydroponics', glyph: '"' },
  { tool: 'medbed', label: 'MEDBED', piece: 'med-bed', glyph: 'd' },
  { tool: 'table', label: 'TABLE', piece: 'dining-table', glyph: 't' },
];
// ⚠️ THE TARGET TILE IS TRIED, NOT ASSUMED — a FALSE RED guard (trap 3), and it is the one this leg
// would otherwise have shipped. `floorPoints` is a HEURISTIC: fractions of the canvas width at a
// fixed height. The one-device-per-tile rule means a click on a tile that already holds furniture is
// refused by the SIM, silently and correctly — and this leg would have read that as "the ship could
// pay and the click placed NOTHING", i.e. as the new button being inert, which is the exact defect
// it exists to disprove. So an affordable tool gets several candidates and only a run where EVERY
// candidate failed is reported: "the sim refused six clear-looking tiles" is a real finding; one
// occupied tile is not. (STEP 2's affordable branch draws from the same `spots` list for the same
// reason, from the head; this leg takes the tail.)
const step5 = [];
for (const [i, t] of NEW_TOOLS.entries()) {
  await armTool(t.tool);
  if (!(await armedTools()).includes(t.tool)) { note(`the ${t.label} click did not arm the tool`); continue; }
  const row = await costRow();
  const chip = (await evalJson(MEASURE)).costs.find((c) => c.tool === t.tool);
  const canPay = / · \d+ ABOARD$/.test(row.text);
  log(`  ${t.label.padEnd(8)} chip="${chip ? chip.text : 'NONE'}" cant=${chip ? chip.cant : '?'}  row="${row.text}"  canPay=${canPay}`);
  if (!chip) note(`${t.label} carries no cost line on its chip at all`);
  else if (chip.text !== '3 PARTS') note(`the ${t.label} chip prices a placement as "${chip.text}"`);
  else if (!(chip.w > 0 && chip.h > 0)) note(`the ${t.label} price has a ZERO box — rendered and invisible`);
  if (row.hidden || !new RegExp('^' + t.label + ' ▸ (NEEDS 3 PARTS — SHIP HAS \\d+|3 PARTS · \\d+ ABOARD)$').test(row.text)) {
    note(`arming ${t.label} says "${row.text}", which is neither a price nor a refusal`);
  }

  const before = await furnitureSample();
  const partsBefore = partsFromRow(row);
  if (partsBefore === null) note(`${t.label}: the armed cost row states no Parts balance — the spend cannot be checked`);
  // One click for a refusal (the sentence is a property of the tool, not of the tile); up to four
  // candidate tiles for a placement, for the FALSE RED reason stated above. ⭐ THE LOOP BREAKS ON THE
  // DEBIT, never on the piece count — see the debit block for why a flickering signal must not steer
  // control flow (it makes the rig buy a second device to satisfy its own instrument).
  const tries = canPay ? spots.slice(i * 2 + 2, i * 2 + 6) : [spots[i * 2 + 2]];
  let after = before, said = null, tried = 0, partsAfter = partsBefore;
  for (const at of tries) {
    tried += 1;
    await blankToast();
    await clickAt(at.x, at.y);
    await sleep(1200);
    said = await toast();
    partsAfter = await settleParts(canPay ? partsBefore - DEVICE_PLACE_COST_PARTS : partsBefore);
    after = await furnitureSample();
    if (!canPay || partsBefore - partsAfter === DEVICE_PLACE_COST_PARTS) break;
    log(`    (candidate ${tried} at x=${Math.round(at.x)} bought nothing — one device per tile; trying the next)`);
  }
  const chips = await rawChips(t.glyph);
  const spent = partsBefore === null || partsAfter === null ? null : partsBefore - partsAfter;
  log(`    click → furniture pieces ${before.txt} → ${after.txt} (after ${tried} candidate tile(s))   ` +
      `PARTS ${partsBefore} → ${partsAfter} (spent ${spent})   ` +
      `raw '${t.glyph}' chips ${chips}   toast="${said.text}"`);
  step5.push({ ...t, canPay, row: row.text, chip: chip && chip.text,
    before: before.max, beforeSeries: before.seen, after: after.max, afterSeries: after.seen, tried,
    partsBefore, partsAfter, spent, rawChips: chips, toast: said.text });
  if (canPay) {
    // ⛔ THE PURSE FIRST. `.rz-furniture > g` is corroboration and is noisy (this rig measured it
    // moving on a REFUSED click); `PlaceDeviceCommand` charges 3 PARTS LAST, after every legality
    // check, and nothing else on the shipped wreck spends them — so no debit means no placement, and
    // a piece that appeared for free did not come from this click.
    if (spent !== DEVICE_PLACE_COST_PARTS) {
      note(`${t.label}: the ship could pay and ${tried} click(s) BOUGHT NOTHING — the purse went ` +
        `${partsBefore} → ${partsAfter} PARTS (${spent} spent, ${DEVICE_PLACE_COST_PARTS} owed) with ` +
        `the furniture census reading ${before.txt} → ${after.txt} and the toast "${said.text}". THE ` +
        'SIM TOOK NOTHING, and it charges LAST — so on any tree where `PlaceDeviceCommand` still ' +
        'does, it never placed the device and the button is armed and inert: "verb parity is NOT ' +
        'sufficient" on a brand-new tool.');
    } else if (after.max !== before.max + 1) {
      note(`${t.label}: the ship PAID ${spent} PARTS and the room does not show the piece — the ` +
        `furniture census went ${before.txt} → ${after.txt}. Matter left the ship and the player can ` +
        'see nothing for it.');
    } else if (chips !== 0) {
      note(`${t.label}: a piece landed but drew as ${chips} dashed VS-Z-25 placeholder chip(s) ` +
        `carrying the raw glyph '${t.glyph}' — the ${t.piece} art in the registry is not being reached.`);
    } else {
      ok(`${t.label} PLACED on the shipped wreck (${before.max} → ${after.max} pieces), was PAID FOR ` +
         `(${partsBefore} → ${partsAfter} PARTS) and drew as the real ${t.piece} art`);
    }
    if (/NEEDS \d+ PARTS/.test(said.text)) note(`${t.label}: an affordable placement toasted a refusal`);
  } else if (!said.text || said.hidden) {
    note(`${t.label}: the ship cannot pay and the click said NOTHING — the owner's original defect ` +
      'on a brand-new button');
  } else if (!new RegExp('^' + t.label + ' ▸ NEEDS 3 PARTS — SHIP HAS \\d+$').test(said.text)) {
    note(`${t.label}: the refused click said "${said.text}"`);
  } else {
    ok(`${t.label} is refused HONESTLY once the ship has spent down: "${said.text}"`);
    // The purse is asserted on this side too — a refused click never reaches `TryPay`. The piece
    // count is deliberately NOT asserted here: it flickers on its own, and the debit has already
    // settled the question. (This is where the un-de-noised version reddened on noise, measured.)
    if (spent !== 0) note(`${t.label}: a REFUSED click still took ${spent} PARTS off the ship`);
  }
  await png(`07-${t.tool}.png`);
  await armTool(t.tool);   // disarm
}
// The run must have exercised BOTH halves, or half the leg above was never reached — the assertion
// is on the SHAPE, not on the arithmetic, so a future stock change does not make this a chore.
if (!step5.some((s) => s.canPay)) note('STEP 5 never reached an affordable click — the placement half is vacuous');
if (!step5.some((s) => !s.canPay)) note('STEP 5 never reached an unaffordable click — the refusal half is vacuous');
const zoomCrop = await evalJson(`(()=>{const e=document.getElementById('rz-layers');const r=e.getBoundingClientRect();` +
  `return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()`);
if (zoomCrop) await png('08-room-after-placements.png', zoomCrop);

// ───────────────────────────────────────────── done
writeFileSync(join(OUT, PREFIX + 'measurements.json'), JSON.stringify({
  widths, chipState, armedRow, placeToast, floorToast, shelfToast, decorAfter, step5,
}, null, 2));
log('  wrote', join(OUT, PREFIX + 'measurements.json'));

try { cdp.close(); } catch { /**/ }
reapChrome();   // the same one reaper the exit hook uses; idempotent, so the hook is a no-op after this

if (problems.length) {
  console.error('\nFAIL: the palette does not answer honestly (' + problems.length + '):');
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}
log('\nOK — every build button carries its price, an affordable click PLACES and is PAID FOR, a ' +
    'refused one says why, the FLOOR default drag explains itself, and SHELF/RUG no longer draw ' +
    'furniture the ship does not have');
process.exit(0);
