#!/usr/bin/env node
// pawn-tween-shot.mjs — MEASURE THE CLIENT-SIDE TWEEN IN A RUNNING GAME.
//
// ⚠️ WHY THIS EXISTS, and why 1523 green node tests are not a substitute. `pawn-tween.test.js` proves
// the interpolation maths and the layer's node lifecycle; `room-model.test.js` proves the node
// survives a repaint in a DOM with no layout. NONE of them can see the only thing the owner asked
// for — "how do we bring it to full smooth" — because smoothness is a property of SCREEN POSITIONS
// OVER TIME, and neither dom-lite nor node has either.
//
// SO EVERY NUMBER BELOW IS SAMPLED FROM A REAL CHROME AT DISPLAY RATE, off `getBoundingClientRect()`
// of the real figure in the real running game:
//   §3  THE HEADLINE — distinct drawn positions per tile, BEFORE and AFTER, from ONE run. The
//       "before" is not a memory and not another branch: it is the number of distinct sub-tile
//       positions the HOST sent over the same window, which is exactly what the client drew per
//       message before this package (one position per roster message, by construction).
//   §4  MONOTONICITY — zero backwards motion, and the largest single-frame step.
//   §5  THE HOLD — pause mid-glide, then measure creep at 60 Hz for two seconds.
//   §6  THE COST — attribute writes on the pawn overlay and rAF callbacks, IDLE vs WALKING, so
//       "zero work when every pawn is settled" is a measured 0 rather than a claim.
//
// ⛔ IT DRIVES THE SIM ON ITS OWN SOCKET, NOT THROUGH THE PAGE, and that is deliberate: the subject
// is what the PAGE DRAWS, so every gesture the rig makes through the page is a variable in its own
// measurement (and `zoom-pawn-shot.mjs`'s header records what re-clicking a walking pawn costs). The
// host runs ONE `GameSession` for all connections (`hosts/web/Program.cs:100`), so `click` → `cursor`
// → `move` on this tool's socket selects and walks the same crew member the browser is watching.
//
// USAGE
//   1. ./play.sh --host-port 8410 --client-port 8411 --no-open        (the wreck; ANY port ≥ 8410)
//   2. node client/tools/pawn-tween-shot.mjs --host-port 8410 --client-port 8411
//
// Exits non-zero if the host will not answer, if Chrome never paints, if nobody can be made to walk,
// or — the point — if the figure is not smoother than the wire, moves backwards, creeps after a
// hold, or costs anything while the ship is idle.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { die, waitFor, sleep, dismissOnboarding } from './rig-lib.mjs';
// The SHIPPED reader of `frame.sel` — imported rather than re-implemented, so this rig cannot come to
// a different answer about "who is selected" than the surface it is measuring (the `paletteOrders`
// rule the other rigs follow).
import { selectedCrewCid, decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { makeTransform } from '../src/ui/overview-scene.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const HOST_PORT = +arg('host-port', '8410');
const CLIENT_PORT = +arg('client-port', String(HOST_PORT + 1));
const CDP_PORT = +arg('cdp-port', '9410');
const OUT = arg('out', new URL('./shots-pawn-tween/', import.meta.url).pathname);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const fails = [];
const check = (ok, what, detail) => {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails.push(what + (detail ? ' — ' + detail : ''));
};

// ─────────────────────────────────────────────────────── 1. the host socket (the rig's own driver)
const latest = new Map();
let ws = null;
async function connect() {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onmessage = (e) => {
    try { const m = JSON.parse(e.data); if (m && m.type) latest.set(m.type, m); } catch { /* not json */ }
  };
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('no host'));
    setTimeout(() => rej(new Error('timeout')), 12000);
  });
}
const send = (o) => ws.send(JSON.stringify(o));
const crewNow = () => (latest.get('roster')?.crew) || [];
const crewOf = (cid) => crewNow().find((c) => c.cid === cid) || null;

try { await connect(); } catch {
  console.error(`FAIL: no host on :${HOST_PORT}. Start one first — ./play.sh --host-port ${HOST_PORT} `
    + `--client-port ${CLIENT_PORT} --no-open`);
  process.exit(2);
}
await waitFor('a roster from the host', () => (crewNow().length ? crewNow() : null), { timeoutMs: 20000, code: 2 });

// ⛔ THE SHIP MUST BE RUNNING. A held ship sends no roster, so every measurement below would be a
// measurement of a still picture — and it would pass §6 (idle costs nothing) vacuously.
if (latest.get('status')?.paused) { send({ cmd: 'pause' }); await sleep(600); }
if (latest.get('status')?.paused) die(null, 3, 'the ship stayed on HOLD — nothing can walk');

const frame0 = latest.get('frame');
const DECK = frame0 ? (frame0.deck | 0) : 0;
const SUBJECT = crewNow().find((c) => (c.deck | 0) === DECK) || crewNow()[0];
if (!SUBJECT) die(null, 3, `no crew member on deck ${DECK}`);
log(`SUBJECT: ${SUBJECT.name} (cid ${SUBJECT.cid}) on deck ${SUBJECT.deck} at ${SUBJECT.x},${SUBJECT.y}`);

// ─────────────────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'pawn-tween-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + arg('window', '1440,900'),
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
// ⛔ THE PID IS PRINTED AND ONLY THIS PID IS EVER KILLED (TRAPS §5): a broad `pkill -f chrome` on a
// box running three lanes' gates takes down somebody else's rig, and a LEAKED headless instance at
// ~290 MB gets somebody else's `dotnet test` OOM-killed as a bare exit 137.
log(`chrome pid ${chrome.pid} (this rig kills THIS pid and nothing else)`);
// ⛔⛔ AND IT KILLS IT ON A CRASH TOO, WHICH THIS RIG LEARNED THE EXPENSIVE WAY. `rig-lib`'s `die`
// takes the handle on every path the AUTHOR thought of; an UNCAUGHT exception is by definition the
// path nobody thought of, and one — `JSON.stringify(promise)` returning `{}`, so `screen.filter` was
// not a function — left a full headless Chrome tree (6 processes, ~290 MB) alive on this box. TRAPS
// §5: a leak here is not this rig's problem, it is somebody else's gate dying as a bare exit 137.
// The handle is killed and the original failure is re-thrown, so nothing is swallowed.
for (const sig of ['uncaughtException', 'unhandledRejection']) {
  process.on(sig, (err) => {
    console.error(`FAIL: ${sig} — killing chrome pid ${chrome.pid} before exiting`);
    console.error(err && err.stack ? err.stack : String(err));
    try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
    process.exit(12);
  });
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { chrome.kill('SIGKILL'); } catch { /* gone */ } process.exit(130); });
}

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) die(chrome, 5, 'Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (x) => (await call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const evalJson = async (x) => { const v = await evaluate(`JSON.stringify(${x})`); return (v && v !== 'null') ? JSON.parse(v) : null; };
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) die(chrome, 6, 'captureScreenshot returned nothing for ' + name);
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(r.result.data, 'base64'));
  log('  wrote', p);
  return p;
}
const centre = async (sel) => evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});`
  + 'if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()');
const clickAt = async (x, y) => {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
};

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6500);
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome, code: 8 });
await waitFor('the Overview plate', () => centre('svg.pl-overview'), { timeoutMs: 30000, chrome, code: 9 });

// THE OVERLAY ITSELF, before anything else: if the figures are not in it, every number below is
// about a surface that never got this package.
const SEL = `.ov-pawnlay .pl-pawn[data-cid="${SUBJECT.cid}"]`;
// ⛔⛔ THE SAMPLED RECT IS THE FIGURE'S OWN SPRITE, NOT THE PAWN GROUP, AND THE DIFFERENCE IS A FALSE
// FINDING THIS RIG ACTUALLY PRODUCED. The group's bounding box also contains the LABEL PILL, whose
// width is a function of her task text and whose de-clutter ROW re-slots at message cadence — so the
// group's centre jumps when she starts a job and the pill grows, with the person not having moved at
// all. Measured: a 28.81 px "single-frame step" on a 32.2 px walk, which read exactly like a
// teleport. `[data-form="pawn"]` is the sprite's own root (`render/pawn-svg.js` stamps it), fixed
// local geometry, so its screen rect moves with the tween and with nothing else. It is selected by
// `data-form` rather than by `.pawn` deliberately: the class is a caller-supplied option
// (`opts.className`) while the data attribute is the builder's own, so a surface that renamed its
// class makes this rig find NOTHING rather than find the wrong thing. ⚠️ The first draft DID say
// `svg.pawn` — and the sprite root is a `<g>`, so the sampler collected 601 empty frames; the hard
// stop in §3 is what turned that into a message about the selector instead of a crash.
// (The group is still what `SEL` names — that is the hit test's element and §0's census subject.)
const SEL_BODY = SEL + ' [data-form="pawn"]';
await waitFor(`the subject's figure in the PERSISTENT overlay (${SEL})`, () => centre(SEL),
  { timeoutMs: 20000, chrome, code: 9,
    diagnose: async () => evalJson('({overlay:!!document.querySelector(".ov-pawnlay"),'
      + 'inOverlay:document.querySelectorAll(".ov-pawnlay .pl-pawn").length,'
      + 'inScene:document.querySelectorAll("#ov-stage .pl-pawn").length})') });

// ⛔ AND NOBODY IS DRAWN TWICE. A pawn layer left in the scene as well would double every figure —
// one animated, one frozen a tile behind — and a rig that only looked in the overlay would call that
// a pass.
const census = await evalJson('({inOverlay:document.querySelectorAll(".ov-pawnlay .pl-pawn").length,'
  + 'inScene:document.querySelectorAll("#ov-stage .pl-pawn").length})');
log('\n=== 0. THE MOUNT ===');
check(census.inOverlay > 0 && census.inScene === 0, 'the figures are in the overlay and NOT in the scene',
  JSON.stringify(census));

// ────────────────────────────────────────────────── 3. the sampler, installed in the page
//
// 60 Hz sampling of the figure's OWN client rect. `getBoundingClientRect` is the browser's answer
// about what is on screen, so it cannot be satisfied by module state the way a DOM-string assertion
// can. The rAF/attribute counters ride along so §6 costs nothing extra to collect.
await evaluate(`
window.__pt = (() => {
  const st = { samples: [], rafCalls: 0, attrWrites: 0, observing: false };
  const raf0 = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => { st.rafCalls += 1; return raf0(fn); };
  const lay = document.querySelector('.ov-pawnlay');
  new MutationObserver((recs) => { st.attrWrites += recs.length; })
    .observe(lay, { attributes: true, subtree: true, attributeFilter: ['transform'] });
  st.sample = (sel, ms) => new Promise((res) => {
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      const e = document.querySelector(sel);
      const r = e && e.getBoundingClientRect();
      out.push({ t: performance.now() - t0, x: r ? r.x + r.width / 2 : null, y: r ? r.y + r.height / 2 : null });
      if (performance.now() - t0 < ms) raf0(tick); else res(out);
    };
    raf0(tick);
  });
  st.counters = () => ({ raf: st.rafCalls, attr: st.attrWrites });
  return st;
})(); 1`);

const counters = () => evalJson('window.__pt.counters()');
// ⚠️ `.then(JSON.stringify)`, NOT `JSON.stringify(promise)` — the latter serializes a Promise as
// `{}` and the rig then measures an empty object with great confidence.
const sampleScreen = async (ms) => JSON.parse(await evaluate(
  `window.__pt.sample(${JSON.stringify(SEL_BODY)}, ${ms}).then((r) => JSON.stringify(r))`));

// ────────────────────────────────────────────────── 4. THE BASELINE, THE WALK, AND THE COST
//
// ⛔⛔ "IDLE" IS NOT A STATE THE SHIPPING WRECK RELIABLY REACHES, AND THIS RIG'S OWN FIRST RUN IS THE
// EVIDENCE BOTH WAYS: crew WANDER when they have no job (the deck-confined wander), so run 1 saw 18
// roster messages and 342 pawn transform writes in a nominally idle 3 s — correctly, because somebody
// really was walking — while run 2 saw 0 and 0 from the same code. A "zero work when idle" check that
// takes whatever window it happens to get measures the ship's mood, not the renderer.
//
// SO THE COST IS A THREE-WAY DELTA, all from one continuous run, on states that are defined rather
// than hoped for: QUIET (running, nobody walking), WALKING (the 5 s sample window), HELD (paused,
// every segment spent). The rAF counter is read as a delta and never against an absolute, because
// this page already runs a permanent rAF loop of its own (`main.js` `animLoop`) and headless Chrome
// does not tick at 60 Hz — measured ~130/s on this box. An absolute threshold would be a fact about
// the harness; the delta is a fact about the tween.
let rosterN = 0;
ws.addEventListener('message', (e) => { try { if (JSON.parse(e.data).type === 'roster') rosterN += 1; } catch { /* ignore */ } });

/** Count rAF callbacks, pawn transform writes and roster messages over `ms`. */
async function costWindow(label, ms) {
  const a = await counters(); const n0 = rosterN; const t0 = Date.now();
  await sleep(ms);
  const b = await counters();
  const secs = (Date.now() - t0) / 1000;
  const row = { label, secs, roster: rosterN - n0, raf: (b.raf - a.raf) / secs, attr: (b.attr - a.attr) / secs,
    attrTotal: b.attr - a.attr };
  log(`  ${label.padEnd(8)} ${secs.toFixed(2)} s: roster ${String(row.roster).padStart(3)} msgs, `
    + `rAF ${row.raf.toFixed(1)}/s, pawn transform writes ${row.attr.toFixed(1)}/s`);
  return row;
}

log('\n=== 6a. THE QUIET SHIP (running, nobody walking) ===');
// A quiet window has to be FOUND, not assumed: wait for the wire to go silent about her.
// ⛔ TWO CONSECUTIVE SILENT WINDOWS, NOT ONE, AND THE SECOND ONE IS THE MEASUREMENT. A window that
// merely contains no roster message can still OPEN mid-segment: the tween has up to
// `TWEEN.MAX_INTERVAL_MS` of a spent-but-unfinished walk left to draw, which is real work correctly
// done and which this check would report as a cost bug. Measured: 3 transform writes in a 2 s window
// carrying 0 roster messages. Requiring the PREVIOUS window to have been silent too puts the
// segment's tail outside the one being measured.
let quiet = null;
let prevSilent = false;
for (let i = 0; i < 14 && !quiet; i += 1) {
  const w = await costWindow('QUIET', 2000);
  if (w.roster === 0 && prevSilent) quiet = w;
  prevSilent = w.roster === 0;
}
if (!quiet) {
  log('  (no naturally quiet 2 s window in 24 s — the crew wandered throughout; the HELD window below '
    + 'is the guaranteed-settled state and carries the claim)');
}
if (quiet) {
  check(quiet.attrTotal === 0, 'ZERO pawn transform writes on a running ship where nobody is walking',
    `${quiet.attrTotal} writes in ${quiet.secs.toFixed(2)} s`);
}
await png('01-quiet.png');

// ────────────────────────────────────────────────── 5. MAKE HER WALK, and sample at 60 Hz
log('\n=== the walk ===');
// ⭐ WAIT FOR A NATURAL STEP FIRST, and only then order one. An order is the more forceful
// instrument and it is also the more fragile: `MoveCitizenCommand` is refused for an unreachable
// destination (D5), and this rig has no route-finder, so a rig that ALWAYS ordered would report
// "nobody walks" for a fact about the tile it picked. Measured: run 2 ordered 3,1 → 11,1 on the
// wreck and she never moved; the wander was walking her around the same deck minutes later.
let walking = await waitFor('the subject to take a step of her own accord (the wander)', () => {
  const c = crewOf(SUBJECT.cid);
  return c && Number.isFinite(c.fx) && Math.abs(c.fx - c.x) > 0.05 ? c : null;
}, { timeoutMs: 45000, everyMs: 100, fatal: false });
if (!walking) {
  log('  no wander in 45 s — ordering a MOVE instead (this rig\'s own socket)');
  // ⛔ SEVERAL DESTINATIONS, NOT ONE, AND THE REASON IS MEASURED. `MoveCitizenCommand` is silently
  // refused for an unreachable target (D5 — orders to unreachable worksites are accepted and
  // dropped), and this rig has no route-finder: run 2 ordered 3,1 → 11,1 and run 3 ordered 9,1 →
  // 15,1, and both died reporting "nobody walks" about a fact concerning the TILE it guessed. So it
  // tries a spread of offsets and stops at the first one that produces an actual step. A rig with
  // one guess is a rig that reports the ship broken when its own arithmetic was.
  const her0 = crewOf(SUBJECT.cid) || SUBJECT;
  const W = frame0 ? frame0.w : 40;
  const H = frame0 ? frame0.h : 20;
  const cand = [];
  for (const dy of [0, -1, 1, -2, 2]) {
    for (const dx of [-6, 6, -3, 3, -9, 9, -12, 12]) {
      const x = her0.x + dx, y = her0.y + dy;
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) cand.push({ x, y });
    }
  }
  send({ cmd: 'click', x: her0.x, y: her0.y });
  await sleep(500);
  for (const dest of cand) {
    send({ cmd: 'cursor', x: dest.x, y: dest.y });
    send({ cmd: 'move' });
    walking = await waitFor(`a step after MOVE to ${dest.x},${dest.y}`, () => {
      const c = crewOf(SUBJECT.cid);
      return c && Number.isFinite(c.fx) && Math.abs(c.fx - c.x) > 0.05 ? c : null;
    }, { timeoutMs: 2500, everyMs: 80, fatal: false });
    if (walking) { log(`  walking after MOVE to ${dest.x},${dest.y}`); break; }
  }
}
if (!walking) {
  // NOT a silent skip: without a walker every measurement below is about a still picture.
  die(chrome, 10, `${SUBJECT.name} never took a step, by wander or by order. Nothing below can be `
    + 'measured on a ship where nobody walks.');
}

// ⭐ THE PLATE'S OWN DISCONTINUITIES, DERIVED FROM THE SHIPPED `makeTransform` ON THE LIVE `decks`
// CHANNEL — never from a literal. Scanning the projection along each axis at 1/20 of a tile finds
// the compartment-cell boundaries this deck really has, so §4 can tell "the plate jumped" from "the
// tween tore" on whatever ship it is pointed at.
const seamsX = [], seamsY = [];
{
  const dv = decksView(decodeDecks(decode(JSON.stringify(latest.get('decks')))),
    decodeRooms(decode(JSON.stringify(latest.get('rooms') || { type: 'rooms', rooms: [] }))));
  const entry = (dv || []).find((d) => d.deck === DECK);
  if (entry) {
    const tf = makeTransform(entry.slots, null);
    const W = frame0 ? frame0.w : 44, H = frame0 ? frame0.h : 20;
    let prev = null;
    for (let v = 0; v <= W; v += 0.05) {
      const q2 = tf.project(v + 0.5, 6.5);
      if (prev && Math.hypot(q2[0] - prev[0], q2[1] - prev[1]) > 2) seamsX.push(v);
      prev = q2;
    }
    prev = null;
    for (let v = 0; v <= H; v += 0.05) {
      const q2 = tf.project(6.5, v + 0.5);
      if (prev && Math.hypot(q2[0] - prev[0], q2[1] - prev[1]) > 2) seamsY.push(v);
      prev = q2;
    }
  }
  log(`  plate seams on deck ${DECK}: x at ${JSON.stringify(seamsX.map((v) => +v.toFixed(2)))}, `
    + `y at ${JSON.stringify(seamsY.map((v) => +v.toFixed(2)))}`);
}
/** Is this tile position within a sample step of a projection discontinuity? */
const plateSeam = (fx, fy) => seamsX.some((v) => Math.abs(fx - v) < 0.45)
  || seamsY.some((v) => Math.abs(fy - v) < 0.45);

log('\n=== 3. SMOOTHNESS: distinct drawn positions per tile ===');
// BEFORE and AFTER from ONE window: the wire samples are what the client drew per message before
// this package (one drawn position per roster message, by construction); the screen samples are what
// it draws now.
const wireSeen = [];
const wireTap2 = (e) => {
  try {
    const m = JSON.parse(e.data);
    if (m.type !== 'roster') return;
    const c = (m.crew || []).find((k) => k.cid === SUBJECT.cid);
    if (c) wireSeen.push({ t: Date.now(), fx: c.fx, fy: c.fy });
  } catch { /* ignore */ }
};
ws.addEventListener('message', wireTap2);
const walkA = await counters();
const screen = await sampleScreen(5000);
const walkB = await counters();
ws.removeEventListener('message', wireTap2);

const live = screen.filter((s) => s.x != null);
// ⛔ A HARD STOP, NOT A `check`. Every number below dereferences this array; a rig that reported one
// FAIL and then died on `live.at(-1)` sends the reader to the product instead of to the selector
// that matched nothing. (It did, once — `svg.pawn` when the sprite root is a `<g>`.)
if (live.length < 200) {
  die(chrome, 13, `the sampler saw ${live.length} live frames of ${screen.length} for ${SEL_BODY}. `
    + 'Either the figure left the screen or the selector matches nothing — check the census in §0.');
}
check(true, 'the figure stayed on screen for the whole 5 s window', `${live.length} frames`);

// Tiles crossed, measured off the WIRE (the host's own answer), so the per-tile rates share a divisor.
const tilesCrossed = new Set(wireSeen.map((w) => `${Math.round(w.fx)},${Math.round(w.fy)}`)).size;
const uniqWire = new Set(wireSeen.map((w) => `${w.fx},${w.fy}`)).size;
const uniqScreen = new Set(live.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`)).size;
const walkSecs = live.at(-1).t / 1000;
const beforePerTile = uniqWire / Math.max(1, tilesCrossed);
const afterPerTile = uniqScreen / Math.max(1, tilesCrossed);
log(`  window: ${walkSecs.toFixed(2)} s, ${tilesCrossed} tiles crossed, `
  + `${wireSeen.length} roster msgs (${(wireSeen.length / walkSecs).toFixed(2)}/s)`);
log(`  BEFORE (one drawn position per wire sample): ${uniqWire} distinct, ${beforePerTile.toFixed(1)} per tile`);
log(`  AFTER  (distinct screen positions)         : ${uniqScreen} distinct, ${afterPerTile.toFixed(1)} per tile`);
check(afterPerTile >= 2 * beforePerTile, 'the figure draws at least 2x the wire\'s distinct positions per tile',
  `${afterPerTile.toFixed(1)} vs ${beforePerTile.toFixed(1)} per tile`);

// ⭐ THE DRAWING LAG, MEASURED AT ITS SOURCE. The tween never extrapolates, so the drawn body trails
// the newest sample by at most ONE SAMPLE STEP — and the step is a thing this rig can measure
// exactly, off the wire, without needing the page's projection. It is the number that decides how
// often `round(drawn) != round(sample)`, i.e. how often a hit test on the SAMPLE answers for a tile
// the player is not looking at. Reported, not checked: it is a property of the host's cadence.
const wireSteps = [];
for (let i = 1; i < wireSeen.length; i += 1) {
  wireSteps.push(Math.hypot(wireSeen[i].fx - wireSeen[i - 1].fx, wireSeen[i].fy - wireSeen[i - 1].fy));
}
wireSteps.sort((a, b) => a - b);
const q = (x) => (wireSteps.length ? wireSteps[Math.min(wireSteps.length - 1, Math.floor(wireSteps.length * x))] : 0);
log(`  drawing lag bound (consecutive wire samples, tiles): median ${q(0.5).toFixed(3)}, `
  + `p90 ${q(0.9).toFixed(3)}, max ${(wireSteps.at(-1) || 0).toFixed(3)}`);

log('\n=== 4. MONOTONICITY: no backwards motion, and how big a single frame step is ===');
// The walk is a straight line in tile space here, so "backwards" is a reversal of the dominant axis.
const dxTotal = live.at(-1).x - live[0].x;
const dyTotal = live.at(-1).y - live[0].y;
const axis = Math.abs(dxTotal) >= Math.abs(dyTotal) ? 'x' : 'y';
const dir = Math.sign(axis === 'x' ? dxTotal : dyTotal) || 1;
const steps = [];
let back = 0, backWorst = 0;
const big = [];
const t0Wall = Date.now() - live.at(-1).t;          // the sampler's t=0, on the wire's clock
for (let i = 1; i < live.length; i += 1) {
  const d = (live[i][axis] - live[i - 1][axis]) * dir;
  const step = Math.hypot(live[i].x - live[i - 1].x, live[i].y - live[i - 1].y);
  steps.push(step);
  if (d < -0.5) { back += 1; backWorst = Math.min(backWorst, d); }   // 0.5 px: rounding is not motion
  if (step > 10) {
    // ⭐ CLASSIFY IT — AGAINST THE WIRE **AND** AGAINST THE PLATE'S OWN PROJECTION. There are exactly
    // two innocent explanations for a big one-frame move and this rig now knows both:
    //   (a) THE HOST JUMPED. A step over `SNAP_TILES` is a re-path/thaw/ladder and the figure cutting
    //       rather than sliding is rule 2 doing its job.
    //   (b) THE PLATE JUMPED. The Level-1 transform is PIECEWISE — each compartment is drawn as its
    //       own miniature cell — so a crew member walking from one compartment into the next moves a
    //       fraction of a tile and lands a long way off on screen. Measured on `--ship wreck` deck 0
    //       off the shipped `makeTransform`: 3 discontinuities along x of 68.1 px (at tiles 11.5,
    //       22.5, 33.5) and 3 along y (39.9 / 82.7 / 41.8 px, at 7.55 / 9.5 / 17.5). That is
    //       pre-existing plate behaviour — it teleported a walking pawn between compartments before
    //       this package existed and it still does — and the tween cannot smooth it, because the
    //       screen gap between two cells is not a place a person can be drawn.
    // Anything left over is a TEAR, which is what this leg is for.
    const wa = t0Wall + live[i - 1].t, wb = t0Wall + live[i].t + 400;
    const near = wireSeen.filter((w) => w.t >= wa - 400 && w.t <= wb);
    let tile = 0;
    for (let k = 1; k < near.length; k += 1) {
      tile = Math.max(tile, Math.hypot(near[k].fx - near[k - 1].fx, near[k].fy - near[k - 1].fy));
    }
    const atSeam = near.some((w) => plateSeam(w.fx, w.fy));
    big.push({ atMs: Math.round(live[i].t), px: +step.toFixed(1), wireTileStep: +tile.toFixed(2), atSeam });
  }
}
steps.sort((a, b) => a - b);
const p = (q) => steps[Math.min(steps.length - 1, Math.floor(steps.length * q))];
log(`  travelled ${Math.hypot(dxTotal, dyTotal).toFixed(1)} px along ${axis}; per-frame step `
  + `median ${p(0.5).toFixed(2)} px, p99 ${p(0.99).toFixed(2)} px, max ${steps.at(-1).toFixed(2)} px; `
  + `backwards frames ${back}`);
check(back === 0, 'ZERO backwards motion across the whole window',
  back ? `${back} reversals, worst ${backWorst.toFixed(2)} px` : '0 reversals');
// THE SMOOTHNESS CLAIM IS THE p99, not the max — one snap in five seconds is a correct snap, and a
// threshold on the max would make this leg a coin flip on whether the crew re-pathed.
check(p(0.99) < 4, 'the ordinary frame moves the figure a fraction of a pixel',
  `p99 ${p(0.99).toFixed(2)} px`);
// …and every LARGE step must be explained by the host jumping too (rule 2). An unexplained one is
// the tween tearing, which is exactly what this package must not do.
const unexplained = big.filter((b) => b.wireTileStep <= 1.5 && !b.atSeam);
if (big.length) log('  large steps: ' + JSON.stringify(big));
check(unexplained.length === 0,
  'every large single-frame step is a host SNAP or a plate seam, never a tear',
  big.length ? `${big.length} large step(s), ${unexplained.length} unexplained` : 'no large steps at all');
await png('02-walking.png');

log('\n=== 6b. COST WHILE WALKING ===');
const rafPerSec = (walkB.raf - walkA.raf) / walkSecs;
const attrPerSec = (walkB.attr - walkA.attr) / walkSecs;
log(`  WALKING  ${walkSecs.toFixed(2)} s: rAF ${rafPerSec.toFixed(1)}/s, `
  + `pawn transform writes ${attrPerSec.toFixed(1)}/s`);
check(attrPerSec > 30, 'the pawn IS being moved at display rate while walking',
  `${attrPerSec.toFixed(1)} transform writes/s against ${(wireSeen.length / walkSecs).toFixed(1)} wire msgs/s`);

log('\n=== 5. THE HOLD: pause mid-glide ===');
const midGlide = await waitFor('the subject mid-step (fx strictly between two tiles)', () => {
  const c = crewOf(SUBJECT.cid);
  return c && Number.isFinite(c.fx) && Math.abs(c.fx - Math.round(c.fx)) > 0.15 ? c : null;
}, { timeoutMs: 20000, everyMs: 60, fatal: false });
if (!midGlide) {
  check(false, 'the subject could be caught mid-glide (she may have arrived)', 'no mid-step sample');
} else {
  const before = await evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(SEL_BODY)});`
    + 'const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  send({ cmd: 'pause' });
  // ⛔⛔ THE HOLD IS NOT INSTANTANEOUS AT THE CLIENT, AND PRETENDING IT IS MAKES THIS LEG A COIN
  // FLIP. The command reaches the sim at a TICK boundary and the page learns about it from the next
  // `status` message — one render period, 100 ms — so the client correctly keeps advancing its clock
  // until then. Measured as ~0.8 px of perfectly legitimate motion after the send, which a naive
  // "freezes immediately" check reported as creep. So: wait for the HOST to say it is held (this
  // tool's own socket), give the page one render period to hear the same thing, and measure the
  // FREEZE from there. What is checked either side of that line is stated rather than blurred —
  // §oneFrame is how far she travelled between the send and the freeze, §creep is what happened
  // after, and only the second one is allowed to be zero.
  await waitFor('the HOST to report the ship held', () => (latest.get('status')?.paused ? true : null),
    { timeoutMs: 8000, chrome, code: 3 });
  await sleep(300);
  const frozen = await evalJson(`(()=>{const e=document.querySelector(${JSON.stringify(SEL_BODY)});`
    + 'const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  const after = await sampleScreen(2000);
  const liveAfter = after.filter((s) => s.x != null);
  let creep = 0;
  for (const s of liveAfter) creep = Math.max(creep, Math.hypot(s.x - frozen.x, s.y - frozen.y));
  const oneFrame = Math.hypot(frozen.x - before.x, frozen.y - before.y);
  log(`  hold: ${liveAfter.length} frames over 2 s; travel between the HOLD and the freeze `
    + `${oneFrame.toFixed(2)} px; creep after the freeze ${creep.toFixed(3)} px`);
  check(creep < 0.3, 'the figure does NOT creep once the page knows the ship is held',
    `${creep.toFixed(3)} px over ${(liveAfter.at(-1).t / 1000).toFixed(2)} s`);
  check(oneFrame < 25, 'the freeze lands inside one render period of the hold',
    `${oneFrame.toFixed(2)} px (a wall-clock tween would have run the whole remaining segment)`);
  const held = await costWindow('HELD', 3000);
  check(held.attrTotal === 0, 'a held ship writes NO pawn transforms', `${held.attrTotal} writes`);
  // ⭐ THE LOOP REALLY STOPS, measured against the WALKING window rather than against a constant:
  // this page runs a permanent rAF loop of its own, so the claim can only be a DIFFERENCE. A loop
  // that kept re-arming would hold the walking rate forever after the player pressed HOLD — which is
  // exactly the defect this rig found on its first run and which `startTween`'s `isPaused()` closes.
  check(held.raf < rafPerSec - 20, 'the animation loop STOPS when there is nothing to move',
    `${held.raf.toFixed(1)} rAF/s held vs ${rafPerSec.toFixed(1)}/s walking`
    + (quiet ? ` (quiet baseline ${quiet.raf.toFixed(1)}/s)` : ''));
  await png('03-held.png');
  send({ cmd: 'pause' });   // …and leave the ship as we found it: running
}

// ────────────────────────────────────────────────── 6c. THE HELD-SHIP CREW CLICK (the review's MAJOR 2)
//
// ⛔⛔ THE DEFECT, AND WHY THE HOLD IS WHERE IT IS MEASURED. `crewHitAtTile` matches the tile of the
// NEWEST WIRE SAMPLE; the tween draws the body BETWEEN the last two samples and never past the
// newest. So for most of every interval the figure stands one tile short of what a sample-based hit
// test answers — and on a HELD ship the clock stops, so it stands there PERMANENTLY. Independent
// review measured 11.0% of moving frames disagreeing and a held-ship click drive at 14/17 (a base
// client without the tween: 11/12). That is the 2026-07-29 "we cannot select a pawn by clicking on
// him" affordance coming back for a new reason.
//
// THIS DRIVE IS END-TO-END AND ON THE ROOM ZOOM, because that is the surface with the geometric hit
// test. The Overview is immune by construction — it hit-tests the drawn ELEMENT (`.pl-pawn` +
// `data-cid`), which is the thing the tween moves — and §0 plus `overview-model.test.js` pin that.
// The gesture is a real Chrome click at her drawn FEET; the verdict is the HOST's own `frame.sel`
// read on this tool's socket, never the page's opinion of itself.
log('\n=== 6c. THE HELD-SHIP CREW CLICK (Room Zoom) ===');
{
  // Walk her into a compartment and hold the ship mid-glide, so the drawn/sample disagreement is
  // frozen and every trial below is the same, reproducible state.
  const rzSlots = [];
  for (const d of (latest.get('decks')?.decks || [])) {
    if ((d.deck | 0) !== DECK) continue;
    for (const sl of (d.slots || [])) { const [, x, y, w, h, anchor] = sl; if (w > 1 && h > 1) rzSlots.push({ x, y, w, h, anchor }); }
  }
  const inR = (c, r) => {
    const tx = Math.round(Number.isFinite(c.fx) ? c.fx : c.x), ty = Math.round(Number.isFinite(c.fy) ? c.fy : c.y);
    return tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
  };
  let room = rzSlots.find((r) => inR(crewOf(SUBJECT.cid) || SUBJECT, r)) || null;
  for (const r of rzSlots) {
    if (room) break;
    const now = crewOf(SUBJECT.cid) || SUBJECT;
    send({ cmd: 'click', x: now.x, y: now.y }); await sleep(300);
    send({ cmd: 'cursor', x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) }); send({ cmd: 'move' });
    room = await waitFor(`${SUBJECT.name} to reach ${r.anchor}`, () => (inR(crewOf(SUBJECT.cid) || SUBJECT, r) ? r : null),
      { timeoutMs: 12000, everyMs: 200, fatal: false });
  }
  if (!room) {
    check(false, 'the subject could be walked into a compartment for the click drive', 'no reachable room');
  } else {
    // Open the room from the plate (held, so the gesture is stable), then release and walk her again
    // so the hold below lands MID-GLIDE — a settled figure has no disagreement to measure.
    send({ cmd: 'pause' });
    await waitFor('the ship held', () => (latest.get('status')?.paused ? true : null), { timeoutMs: 8000, chrome, code: 3 });
    await sleep(500);
    const box = await centre(SEL_BODY);
    const hit = box ? await evalJson(`(()=>{const p=${JSON.stringify(box)};`
      + 'for(const r of document.querySelectorAll("#ov-stage .pl-room[data-anchor]")){const b=r.getBoundingClientRect();'
      + 'if(p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height)return {x:b.x+b.width/2,y:b.y+b.height/2};}return null;})()') : null;
    if (hit) {
      await waitFor('the Room Zoom open for the click drive', async () => {
        if (await evaluate("document.body.classList.contains('roomzoom-open')")) return true;
        await clickAt(hit.x, hit.y); await sleep(600); return null;
      }, { timeoutMs: 20000, everyMs: 200, chrome, code: 11 });
    }
    send({ cmd: 'pause' });
    await waitFor('the ship running again', () => (latest.get('status')?.paused ? null : true), { timeoutMs: 8000, chrome, code: 3 });
    // Keep her moving inside the room, then freeze mid-step.
    const dest = { x: room.x + 1, y: room.y + 1 };
    const her = crewOf(SUBJECT.cid) || SUBJECT;
    send({ cmd: 'click', x: her.x, y: her.y }); await sleep(300);
    send({ cmd: 'cursor', x: dest.x, y: dest.y }); send({ cmd: 'move' });
    const mid = await waitFor('the subject mid-step inside the room', () => {
      const c = crewOf(SUBJECT.cid);
      return c && Number.isFinite(c.fx) && Math.abs(c.fx - Math.round(c.fx)) > 0.2 ? c : null;
    }, { timeoutMs: 20000, everyMs: 50, fatal: false });
    send({ cmd: 'pause' });
    await waitFor('the ship held mid-glide', () => (latest.get('status')?.paused ? true : null), { timeoutMs: 8000, chrome, code: 3 });
    await sleep(500);
    if (!mid) log('  (could not catch her mid-step; the drive still runs, on a settled figure)');

    // THE DRIVE: 18 clicks at her drawn feet, deselecting between each so every trial is independent.
    const TRIALS = 18;
    let hits = 0;
    for (let i = 0; i < TRIALS; i += 1) {
      send({ cmd: 'click', x: 0, y: 0 });            // …a tile no crew member is on: clears `sel`
      await sleep(180);
      const feet = await centre(SEL_BODY);
      if (!feet) continue;
      // The FEET, not the sprite's centre: the figure is 2.2 tiles tall and stands ON the floor
      // point, so the middle of its box is a tile or two behind it in the oblique.
      await clickAt(feet.x, feet.y + feet.h * 0.42);
      await sleep(220);
      if (selectedCrewCid(latest.get('frame')) === SUBJECT.cid) hits += 1;
    }
    log(`  held-ship clicks on the drawn feet: ${hits}/${TRIALS} selected her`);
    check(hits >= TRIALS - 1, 'clicking the figure you can SEE selects her on a held ship',
      `${hits}/${TRIALS} (independent review measured 14/17 before this fix, against a base client's 11/12)`);
    await png('05-held-click.png');
    send({ cmd: 'pause' });
    await waitFor('the ship running again', () => (latest.get('status')?.paused ? null : true), { timeoutMs: 8000, chrome, code: 3 });
  }
}

// ────────────────────────────────────────────────── 7. THE OTHER STANDARD SURFACE
//
// ⛔ THE ROOM ZOOM IS NOT ASSUMED TO FOLLOW. It has its OWN overlay, its OWN clock, its OWN
// `scenePlacement`, and — the part a shared model cannot cover — its own mount whose `viewBox` is
// per-room rather than constant. A package that shipped the plate and left the cutaway drawing
// figures inside a wholesale-rebuilt `<svg>` would look completely correct in §0–§6.
log('\n=== 7. THE ROOM ZOOM ===');
// ⛔ SHE MUST BE INSIDE A COMPARTMENT, AND ON THE WRECK THAT HAS TO BE ARRANGED. The ship has ONE
// crew member and the wander leaves her in a hall about as often as not — a run that found her
// outside a room reported "cannot open a room around her" and skipped the whole Level-2 leg, which is
// the silent-skip this repo does not allow. So the rig walks her in: MOVE to each compartment's
// centre in turn until her DRAWN tile is inside one (the drawn tile, because that is what
// `roomCrew` admits on — `WireFormat.RosterEntry.Fx`).
const slots = [];
for (const d of (latest.get('decks')?.decks || [])) {
  if ((d.deck | 0) !== DECK) continue;
  for (const sl of (d.slots || [])) {
    // ⚠️ THE SHAPE, READ OFF THE LIVE WIRE RATHER THAN REMEMBERED: a slot is
    // `[slotIndex, x, y, w, h, anchorName, roomType, …]`. The first draft destructured
    // `[x,y,w,h]` from the front — i.e. it treated the SLOT INDEX as x — so every rect was one
    // column to the left and the containment test answered "she is in no compartment" while she was
    // standing in the cryo bay. `decks` slots on `--ship wreck` deck 0:
    // `[0,0,0,12,8,"cryobay",16,true,true]`.
    const [, x, y, w, h, anchor] = sl;
    if (w > 1 && h > 1) slots.push({ x, y, w, h, anchor });
  }
}
const inRect = (c, r) => {
  const tx = Math.round(Number.isFinite(c.fx) ? c.fx : c.x);
  const ty = Math.round(Number.isFinite(c.fy) ? c.fy : c.y);
  return tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
};
let inside = slots.find((r) => inRect(crewOf(SUBJECT.cid) || SUBJECT, r)) || null;
for (const r of slots) {
  if (inside) break;
  send({ cmd: 'click', x: (crewOf(SUBJECT.cid) || SUBJECT).x, y: (crewOf(SUBJECT.cid) || SUBJECT).y });
  await sleep(300);
  send({ cmd: 'cursor', x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
  send({ cmd: 'move' });
  inside = await waitFor(`${SUBJECT.name} to reach ${r.anchor}`,
    () => (inRect(crewOf(SUBJECT.cid) || SUBJECT, r) ? r : null),
    { timeoutMs: 12000, everyMs: 200, fatal: false });
}
if (!inside) {
  check(false, 'the subject could be walked into an enterable compartment (the Level-2 leg\'s precondition)',
    `tried ${slots.length} compartments on deck ${DECK}`);
}
send({ cmd: 'pause' });                    // …hold it, so the room is entered on a still ship
await waitFor('the ship held for the room-entry gesture', () => (latest.get('status')?.paused ? true : null),
  { timeoutMs: 8000, chrome, code: 3 });
await sleep(600);
const pawnBox = await centre(SEL_BODY);
const roomHit = pawnBox ? await evalJson(`(()=>{const p=${JSON.stringify(pawnBox)};`
  + 'for(const r of document.querySelectorAll("#ov-stage .pl-room[data-anchor]")){const b=r.getBoundingClientRect();'
  + 'if(p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height)'
  + 'return {anchor:r.dataset.anchor,x:b.x+b.width/2,y:b.y+b.height/2};}return null;})()') : null;
if (!roomHit) {
  check(false, 'the subject stands in an enterable compartment (needed for the Level-2 leg)',
    `her figure is at ${JSON.stringify(pawnBox)} and over no compartment tile — this run cannot open `
    + 'a room around her');
} else {
  log(`  entering ${roomHit.anchor}`);
  await waitFor('the Room Zoom to open', async () => {
    if (await evaluate("document.body.classList.contains('roomzoom-open')")) return true;
    await clickAt(roomHit.x, roomHit.y);
    await sleep(600);
    return null;
  }, { timeoutMs: 20000, everyMs: 200, chrome, code: 11 });
  await sleep(900);
  const rzCensus = await evalJson('({inOverlay:document.querySelectorAll("#rz-pawnlay .rz-pawn-root").length,'
    + 'inScene:document.querySelectorAll("#rz-layers .rz-pawn").length,'
    + 'sprites:document.querySelectorAll("#rz-pawnlay .rz-pawn").length,'
    + 'vbLayers:document.getElementById("rz-layers").getAttribute("viewBox"),'
    + 'vbPawn:document.getElementById("rz-pawnlay").getAttribute("viewBox"),'
    + 'boxLayers:(()=>{const r=document.getElementById("rz-layers").getBoundingClientRect();'
    + 'return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(),'
    + 'boxPawn:(()=>{const r=document.getElementById("rz-pawnlay").getBoundingClientRect();'
    + 'return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})()})');
  log('  ' + JSON.stringify(rzCensus));
  check(rzCensus.inOverlay > 0 && rzCensus.inScene === 0,
    'the Room Zoom draws its figures in the PERSISTENT overlay and not in the repainted scene',
    `${rzCensus.inOverlay} in the overlay, ${rzCensus.inScene} in the scene`);
  // ⛔ THE COUPLING, MEASURED RATHER THAN REASONED. The overlay is only correct while it shares the
  // scene's projection EXACTLY: same viewBox over the same client box. A one-pixel difference in
  // either is a figure standing beside her own floor, and neither is visible in any node test.
  check(rzCensus.vbPawn === rzCensus.vbLayers, 'the overlay carries the scene\'s own viewBox',
    `${rzCensus.vbPawn} vs ${rzCensus.vbLayers}`);
  check(JSON.stringify(rzCensus.boxPawn) === JSON.stringify(rzCensus.boxLayers),
    'the overlay occupies the scene\'s exact client box',
    `${JSON.stringify(rzCensus.boxPawn)} vs ${JSON.stringify(rzCensus.boxLayers)}`);
  await png('04-roomzoom.png');
  await evaluate("document.body.classList.contains('roomzoom-open')");
}
send({ cmd: 'pause' });                    // leave the ship running, as we found it

// ─────────────────────────────────────────────────────────────────────────────── report
log('\n════════════════════════════════════════════════════════');
if (fails.length) {
  log(`${fails.length} FAILED:`);
  for (const f of fails) log('  · ' + f);
} else {
  log('all checks PASSED');
}
chrome.kill('SIGKILL');
try { ws.close(); } catch { /* already closed */ }
process.exit(fails.length ? 1 : 0);
