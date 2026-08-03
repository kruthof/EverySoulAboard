#!/usr/bin/env node
// THE `why` LINE (M2-6) — the LIVE-PIXEL acceptance, driven in real Chrome against the running game.
//
// WHY IT EXISTS AND WHAT ONLY IT CAN SEE. M2-6's first cut appended the ranking clause to the
// roster's `task` field and both crew docks rendered the whole string. They cannot hold it: at the
// shipped Space Mono sizes `.ov-crewtask` is 145 px = 26 characters and `.rz-crewtask` 118 px = 22
// (⚠️ this header said ~147/~120 ≈ 26/23 until STEP 6/7 walked the boxes; the 23 was the CLIPPED
// figure), against clause-bearing labels of 43–54. `text-overflow:ellipsis` then ate the PAYLOAD — the
// priority number, the entire point of the package — 100% of the time, and the row read
// "Servicing door_d0_s0 — Re…". ⛔ NO NODE HARNESS CAN SEE THAT. There is no jsdom in this repo and
// `dom-lite` has neither `innerHTML` nor `querySelector`, so neither view can even be mounted, and
// no stub computes a font metric or applies `text-overflow`. `client/test/why-line.test.js` pins the
// derivation and the payload lines; the three claims below are outside anything it can answer:
//   1. THE DOCKS NO LONGER OVERFLOW — `scrollWidth <= clientWidth`, measured with real fonts. This
//      is the defect, and it is a pixel fact.
//   2. THE CLAUSE IS ACTUALLY READABLE SOMEWHERE — `.ov-task` renders the whole sentence, unclipped,
//      with every character on screen. "Invisible feedback is FUNCTIONAL" is binding here.
//   3. FLIPPING THE GRID MOVES THE NUMBER, through the real click path and back over the wire.
//
// USAGE
//   1. ./play.sh --host-port 8348 --client-port 8349 --no-open
//   2. node client/tools/why-line-shot.mjs --out docs/design/shots [--host-port 8348] [--client-port 8349]
//
// Exits non-zero if the host will not answer, if the pawn never takes a job, if a dock overflows,
// or if the clause does not follow the grid — a green run with no pictures is the failure this
// class of tool exists to prevent. NOT wired into ./ci.sh: it needs a browser and a running host,
// and the gate stays browser-free (same rule as work-tab-shot.mjs / moss-shot.mjs).
//
// ⭐ THIS RIG'S OWN NON-VACUITY, MEASURED (2026-07-30) RATHER THAN ASSUMED. On the fixed tree STEP 3
// reports `scrollW 145 / clientW 145` — and `scrollWidth` is never less than `clientWidth`, so
// "equal" is exactly what a fitting row looks like and is INDISTINGUISHABLE from a broken probe.
// So the mutation was applied to the running client (`t.what` → `t.text` in overview-view.js), the
// page reloaded, and this tool re-run:
//
//     .ov-crewtask: {"text":"Servicing battery_cryo — Repair is priority 1",
//                    "scrollW":249,"clientW":145,"overflows":true}   ⇒ 3 CHECKS FAILED, exit 1
//
// 249 px of content in a 145 px box: ~104 px — about twenty characters, the whole clause and then
// some — eaten by the ellipsis, which is the reviewer's measurement reproduced end to end. The tree
// was then restored from an in-memory copy, never `git checkout` (TRAPS 2).

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ D4 fix-back (2026-08-02) — STEPS 6 AND 7: THE WARNING SURVIVES THE DOCK.
//
// D4 gave the label a SECOND clause, `" · NO AIR"`, spelt with a middot ON PURPOSE so it rides inside
// the *what* half and reaches these two docks (`GameSession.cs:4019-4030`). But
// `"Servicing fabricator_1 · NO AIR"` is 31 characters and the docks are 26 and 22 — so
// `text-overflow:ellipsis` ate the tail, and the tail IS the warning. This rig is the only place that
// fact exists: it is a font metric on a shipped element, and no node harness in this repo can mount a
// view at all. STEP 7 also closes this tool's OWN blind spot — it probed `.ov-crewtask` and NEVER
// `.rz-crewtask`, which is the NARROWER dock and the one with no selected readout behind it.
//
// ⛔ WHY THE NO-AIR LEGS USE AN INJECTED LABEL RATHER THAN A DRIVEN PAWN, said out loud. Driving a
// crew member into a vacuum through the UI is not reliable here: HANDOVER's filed D5 blocked it in
// `vacuum-shot.mjs`'s geometry (`PrioritiseJobCommand` accepted the order and the job was dropped
// before she left the cryobay, measured at 100× and 1000×), and HANDOVER records that D5 did NOT
// reproduce in T13 and may be geometry-specific — so it is an unreliable precondition either way,
// not a settled blocker. ⛔ Either way it is another package's question, and a rig that waits on it
// would report that package's state under this one's name. So the legs below separate the three
// questions instead of faking one of them:
//   · does the HOST emit the label — `VacuumIsVisibleTests.AHeldWorkerInAVacuumIsToldSo_AndNobodyElseIs`
//     (driven, the hold staged by hand where no dispatcher can take it away);
//   · does the DERIVATION shorten it — `client/test/why-line.test.js` section 3 (driven, pure);
//   · does the RESULT FIT THE REAL BOX IN THE REAL FONT — here, and only here.
// The string is not invented: `NO_AIR` is the host's own output and the shortened string is computed
// by importing the SHIPPED `console-model.js`, not restated. And each leg carries its own
// non-vacuity — the RAW label is written into the same element first and is REQUIRED to overflow, so
// a probe that cannot see clipping fails before the fix is credited (STEP 3's note: `scrollWidth` is
// never less than `clientWidth`, so "fits" and "broken probe" look identical otherwise).

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ 2026-08-03 — THE STEP-2 SELECTION FLAKE, AND WHY A RIG'S OWN RACES ARE A GATE PROBLEM.
//
// Filed in HANDOVER as "no poll — coin-flip red on a fresh host". The cause is NOT slow paint: the
// crew-row gesture is fire-and-forget at a tile that may already be stale (full receipts on
// `ensureSelected` below), so waiting longer could never have fixed it. SIX blind waits stood in
// for preconditions — counted off this diff, not remembered: 6 call sites removed and 2 added (the
// 250 ms poll cadence inside `waitFor` and the 600 ms retry cadence inside `ensureSelected`), 13
// real ones before and 9 after. Five became `waitFor(…)` polls with hard, NAMED timeouts: the
// first `roster` on the host socket · the page coming up · the onboarding card actually CLOSING ·
// the work grid painting ≥ 4 cells · the readout following the grid flip. The sixth — `sleep(900)`
// after the selection click — is not a poll at all: STEP 2 now RE-CLICKS her row until the host
// reports the selection back on `frame.sel`, because a missed click never resolves by waiting.
//
// ⛔ AND THE FLAKE WAS THE SMALLER HALF. With nobody selected, `.ov-task` is `hidden`, so STEP 4's
// `check(!ro.overflows)` PASSED — `scrollWidth 0` is not `> clientWidth 0`. A red run that also
// prints a vacuous PASS is a rig teaching a future lane the wrong thing; `clientW > 0` closes it.
// The whole file's oldest lesson, in a third costume: a fitting row and a broken probe measure the
// same, so every leg has to carry its own non-vacuity.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  watchTask, AIR_WARNING_CLAUSE, OV_DOCK_TASK_CHARS, RZ_DOCK_TASK_CHARS,
} from '../src/ui/console-model.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8348');
const CLIENT_PORT = +arg('client-port', '8349');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'whyline-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9341');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

/**
 * ⭐ WAIT FOR A CONDITION, NEVER FOR A CLOCK (2026-08-03, the STEP-2 flake package).
 *
 * Every `sleep(n)` that stood in for a precondition in this tool was a BET that a cold `dotnet`
 * start, a cold Chrome, a cold module graph and two websockets all finish inside `n` ms on a box
 * that may be running three other agents' gates. That bet loses at random, and this file's own
 * history says what a lost bet costs: not a clean red, but a RESULT-GENERATOR — `setCell`'s header
 * already records a run that "kept producing confident output about a state that is not there".
 *
 * ⛔ THE HARD TIMEOUT IS THE POINT, not the poll. A rig that quietly carries on without its
 * precondition is worse than a flaky one (OD-P: fail hard on a mis-capture), so this NAMES what
 * never appeared, prints whatever `diagnose` can see instead, and exits. `fatal: false` is for the
 * one legitimate other case: a PRODUCT claim, which must stay a `check` so the FAIL is reported
 * with all the others rather than truncating the run.
 *
 * @param {string} what     the missing thing, spelt as the sentence the error should read
 * @param {() => any} probe truthy ⇒ done; its value is returned (so `centre(sel)` works directly)
 */
async function waitFor(what, probe, { timeoutMs = 30000, everyMs = 250, code = 9, fatal = true, diagnose = null } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await probe();
    if (v) return v;
    await sleep(everyMs);
  }
  if (!fatal) return null;
  let extra = '';
  try { if (diagnose) extra = ' — what IS there: ' + JSON.stringify(await diagnose()); } catch { /* best effort */ }
  console.error(`FAIL: waited ${Math.round(timeoutMs / 1000)}s and ${what} never appeared${extra}. `
    + 'This is a PRECONDITION of the checks below, so the run stops rather than reporting findings '
    + 'about a state that was never established.');
  process.exit(code);
  return null;   // unreachable; keeps the return type honest
}

// ────────────────────────────────────────────── 1. the sim's own truth, on an independent socket
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
// POLLED, not slept: the socket opening says the HttpListener is up, not that the sim has ticked.
// A cold host broadcasts its first `roster` seconds later, and 2500 ms was a guess about that gap.
await waitFor('a `roster` message arrived on the host socket', () => latest.has('roster'),
  { timeoutMs: 30000, code: 2, diagnose: () => ({ channelsSeen: [...latest.keys()] }) });
const roster = latest.get('roster');
if (!roster?.crew?.length) { console.error('FAIL: no roster on the wire'); process.exit(2); }
const rell = roster.crew[0];
log('crew aboard:', roster.crew.map((c) => `${c.name} (cid ${c.cid}) — ${c.task}`).join(' | '));
const rosterTask = () => (latest.get('roster')?.crew || []).find((c) => c.cid === rell.cid)?.task || '';

// ────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'whyline-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
// ⚠️ EVERY EXIT PATH, not just the happy one. This tool `process.exit`s from six places (no host, no
// DevTools endpoint, a work cell it could not set…) and only the final line killed Chrome — so an
// aborted run left a headless browser resident. Measured, 2026-08-02: two leaked instances at ~290 MB
// each were enough to get `./ci.sh`'s `dotnet test` OOM-killed (SIGKILL, exit 137), which reads
// exactly like a test-suite crash. One handler covers all of them.
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { /* already gone */ } });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
async function pngAs(fullName) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  const data = r.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + fullName); process.exit(6); }
  const p = join(OUT, fullName);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
const png = (name) => pngAs(PREFIX + name);
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
/** ⚠️ BACK OUT OF ANY OPEN ROOM. The focused room is HOST state, not page state (`wire/session.js`:
 *  *"single-session by design"*), so STEP 7 leaving a room open would boot the NEXT run of this tool
 *  straight into the Room Zoom — where the WORK tab is off screen, every `setCell` click lands on
 *  nothing, and the run dies in `setCell` reporting a grid it could not set. Measured, once. Called
 *  both before STEP 1 and after STEP 7 so a poisoned session cannot cross runs in either direction. */
async function leaveRoomZoom() {
  for (let i = 0; i < 4; i++) {
    if (!(await evaluate("!!document.querySelector('.rz-canvas')"))) return;
    for (const type of ['keyDown', 'keyUp'])
      await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1200);
  }
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** ⭐ THE INSTRUMENT THE WHOLE FIX-BACK TURNS ON: is this element's content wider than its box?
 *  `scrollWidth > clientWidth` is exactly the condition under which `text-overflow:ellipsis` fires,
 *  measured by the browser with the real font — the thing no node stub can answer. */
const box = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const s=getComputedStyle(e);return {text:e.textContent,scrollW:e.scrollWidth,clientW:e.clientWidth,`
  + `overflows:e.scrollWidth>e.clientWidth,font:s.font,ellipsis:s.textOverflow};})()`);

/** ⭐ D4 fix-back — WRITE `text` INTO THE SHIPPED ELEMENT, MEASURE IT, PUT THE ROW BACK. Everything
 *  happens inside ONE injected function, so the client's next repaint (10 Hz) cannot land between the
 *  write and the read. This is the same `scrollWidth > clientWidth` question `box` asks, put to a
 *  string the sim will not currently produce (HANDOVER's filed D5). */
const fitProbe = async (sel, text) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const orig=e.textContent;e.textContent=${JSON.stringify(text)};`
  + `const out={text:e.textContent,chars:e.textContent.length,scrollW:e.scrollWidth,clientW:e.clientWidth,`
  + `overflows:e.scrollWidth>e.clientWidth,shows:e.textContent.includes('NO AIR')};`
  + `e.textContent=orig;return out;})()`);

/** The element's REAL character budget: walk `'M'.repeat(n)` until it stops fitting. The docks are
 *  monospace (Space Mono), so this is exact — and it is where the constants in `console-model.js`
 *  came from. Reported every run so a CSS change shows up as a number rather than as a clipped row. */
const budgetOf = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const orig=e.textContent;let n=0;`
  + `for(let i=1;i<=80;i++){e.textContent='M'.repeat(i);if(e.scrollWidth<=e.clientWidth)n=i;else break;}`
  + `const w=e.clientWidth;e.textContent=orig;return {clientW:w,chars:n};})()`);

/** Hold `text` in every matching element for `ms` so a screenshot cannot race the repaint. */
async function holdText(sel, text, ms) {
  await evaluate(`(()=>{clearInterval(window.__dockHold);window.__dockHold=setInterval(()=>{`
    + `document.querySelectorAll(${JSON.stringify(sel)}).forEach((e)=>{e.textContent=${JSON.stringify(text)};});},40);})()`);
  await sleep(ms);
}
const releaseText = () => evaluate('clearInterval(window.__dockHold)');

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
// ⚠️ POLLED, NOT SLEPT (×3). `sleep(6000)` + a one-shot `centre` was the shape: if the card had not
// painted yet the dismissal was SILENTLY SKIPPED — and the card is a modal overlay, so every click
// in every step below would then land on it, and the run would die four steps later inside
// `setCell` blaming the work grid. Three separate conditions, three separate sentences:
await waitFor('the client rendered anything at all (the onboarding card or the Overview)',
  () => evaluate("!!document.querySelector('[data-onb-begin], .ov-crewwatch')"), { timeoutMs: 60000, code: 4 });
// The card is opened SYNCHRONOUSLY by `initOnboarding` whenever `perilune.introSeen.v1` is unset
// (onboarding.js:349) and this tool always launches Chrome on a fresh `--user-data-dir`, so it is
// expected here — but it is not REQUIRED (a reused profile has seen it), so its absence is logged,
// never fatal. A card that will not CLOSE is fatal: nothing below could be clicked.
// …and a GRACE POLL rather than a one-shot, because the gate above can be satisfied by the
// Overview alone: `.ov-crewwatch` and the card are both built at init, and nothing orders them.
const onb = await waitFor('the onboarding card ([data-onb-begin])', () => centre('[data-onb-begin]'),
  { timeoutMs: 5000, fatal: false });
if (!onb) log('no onboarding card on screen (a profile that has seen it) — continuing');
else {
  log('dismissing the onboarding card');
  await clickAt(onb.x, onb.y);
  // ⛔ THE POLARITY IS DELIBERATE. This is the one probe whose answer is an ABSENCE, and a naive
  // `!(await evaluate(…))` would read a FAILED evaluate (undefined) as "the card is gone" — a
  // mis-capture silently passing, which is the shape this whole package exists to remove. Asking
  // for the literal `0` makes every non-answer keep waiting, so an unreadable page ends in the loud
  // timeout below instead of a false all-clear.
  await waitFor('the onboarding card closed after BEGIN was clicked (it is a modal overlay — every '
    + 'click below would land on it instead of the ship)',
    async () => (await evaluate("document.querySelector('[data-onb-begin]')?1:0")) === 0,
    { timeoutMs: 20000, code: 4 });
}
// The real "the page is live" condition, and it is a THREE-part one: the module graph ran, the
// page's own socket connected, and a `frame` + `roster` have been painted into a row.
await waitFor('the Overview painted a CREW WATCH row (.ov-crew)',
  () => evaluate("!!document.querySelector('.ov-crew')"), { timeoutMs: 60000, code: 4 });

const openWorkTab = async () => {
  const tab = await waitFor('the WORK tab button ([data-ov-tab="work"])',
    () => centre('[data-ov-tab="work"]'), { timeoutMs: 20000, code: 7 });
  await clickAt(tab.x, tab.y);
  // …and the panel it opens is built from the `work` channel, so the click is not the arrival.
  // ≥ 4 because `setCell` addresses indices 0 and 3 — an INCLUSION bound, not "> 0" (4th shape).
  const cellsNow = () => evaluate("document.querySelectorAll('.ov-worklist .ov-workrow .ov-workcell').length");
  await waitFor('the work grid painted at least 4 cells (.ov-worklist .ov-workrow .ov-workcell) after '
    + 'the WORK tab was clicked', async () => (await cellsNow()) >= 4,
  { timeoutMs: 20000, code: 7, diagnose: async () => ({ cells: await cellsNow() }) });
};
// Indexed off the NodeList, not `nth-of-type` — the cells are not guaranteed to be the only
// element type among their siblings, and a selector that silently matches nothing would make every
// `setCell` below a no-op that still reported PASS.
const cellCentre = async (i) => json(
  `(()=>{const e=document.querySelectorAll('.ov-worklist .ov-workrow .ov-workcell')[${i}];if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
/**
 * Walk a cell's off→1→2→3→4→off cycle to `want` (the shipped surface ships one gesture).
 *
 * ⛔ READ THE PRIORITY GLYPH, NEVER THE CELL'S WHOLE TEXT — M3-12 put TWO facts in the cell (the
 * priority and her skill level in that work type) in two child spans, so `cell.textContent` is their
 * CONCATENATION: `"off0"`, `"10"`. This loop compared that against `String(want)`, which can never be
 * true, so it clicked six times and returned false — and the damage is not the four FAILs it
 * reported. It is that the grid states this whole tool depends on were NEVER ESTABLISHED: six clicks
 * from `off` walk off→1→2→3→4→off→1 and land on `1` whatever `want` was, so every downstream why-line
 * check ran against a grid the tool believed it had set and had not. A RESULT-GENERATOR — the tool
 * keeps producing confident output about a state that is not there.
 *
 * ⚠️ AND IT NOW EXITS RATHER THAN RETURNING FALSE, naming what it actually read. A tool that cannot
 * establish its own preconditions has nothing true left to say, and continuing is what turned a
 * broken read into wrong findings rather than a stopped run.
 *
 * The `?:` fallback matches `work-tab-shot.mjs`'s `cellsNow`: if the span is ever removed this
 * degrades to the old reading instead of silently comparing against `''`.
 */
async function setCell(i, want) {
  const c = await cellCentre(i);
  if (!c) { console.error('FAIL: no work cell at index ' + i); process.exit(7); }
  let now = '';
  for (let n = 0; n < 6; n++) {
    now = await evaluate(
      `(()=>{const e=document.querySelectorAll('.ov-worklist .ov-workrow .ov-workcell')[${i}];`
      + `if(!e)return '';const p=e.querySelector('.ov-workprio');`
      + `return (p?p.textContent:e.textContent)||'';})()`);
    if (now === String(want)) return true;
    await clickAt(c.x, c.y); await sleep(500);
  }
  console.error(
    `FAIL: cell ${i} never reached '${want}' — it reads '${now}' after six clicks. Every check below `
    + 'would run against a grid this tool believes it set and did not, so the run stops here. If '
    + "the cell's internals moved again, re-point the read (it wants the PRIORITY glyph, not the "
    + "cell's whole textContent, which also contains the skill level).");
  process.exit(8);
}

/**
 * ⭐⭐ SELECT HER, AND MAKE THE HOST SAY SO — the fix for the filed STEP-2 flake (2026-08-03).
 *
 * ⛔ THE RACE, AND IT IS NOT A SLOW-PAINT RACE. Selection here is HOST state and the gesture is
 * FIRE-AND-FORGET at a tile that may already be stale. `Hud.selectCrewByCid` → `crewRowClick`
 * (hud.js:934) latches nothing client-side: it reads the pawn's tile out of the LAST FRAME IT
 * RECEIVED (`crewClickTarget`, console-model.js:166) and sends `Cmd.click(x, y)`. The host selects
 * whoever is standing on that tile WHEN THE COMMAND LANDS, and the answer comes back on `frame.sel`
 * ("Never latched client-side" — console-model.js:146). STEP 1 has just switched REPAIR on, so she
 * is WALKING: one frame of staleness and the click hits empty floor and selects NOBODY.
 *
 * ⭐ MEASURED, DRIVEN, not deduced (2026-08-03): five runs against fresh hosts were green, so the
 * click was forced to land mid-walk (speed 100× first, click once the label read "Heading to…").
 * Run 3 of 3 reported `.ov-ro-task {"hidden":true,"text":""}` and 4 FAILs in STEPS 4–5 — exactly the
 * filed "coin-flip red on a fresh host". The other two were green: it is a race, not a break.
 *
 * ⚠️ AND `sleep(900)` COULD NEVER HAVE FIXED IT. Waiting longer does not un-miss a click that
 * already landed on empty floor; the only repair is to ask the host whether it selected her and
 * CLICK AGAIN AT HER NEW TILE if it did not. Hence a poll that re-reads the row's rectangle and
 * re-clicks, not a poll that only watches.
 *
 * ⛔ TWO CONDITIONS, BOTH REQUIRED, AND THE SECOND IS WHY THE FLAKE WAS QUIET. `.ov-crew.sel` is the
 * frame-derived truth (overview-view.js:1133 ← `selectedCrewCid(frame)`) and `.ov-ro-task` is the
 * element STEPS 4–5 actually measure. The old code checked NEITHER: `if (row) {…}` made a missing
 * row a silent skip, and on an unselected crew `.ov-task` is `hidden`, so STEP 4's
 * `check(!ro.overflows)` PASSED VACUOUSLY — `scrollWidth 0` is not `> clientWidth 0`. A fitting row
 * and a hidden row measure the same, which is this rig's own oldest lesson (see the header).
 */
const SELECTION_TIMEOUT_MS = 30000;
const selectionState = `(()=>{const s=document.querySelector('.ov-crew.sel'),t=document.querySelector('.ov-ro-task');`
  + `return {sel:s?s.dataset.ovCrew:null,taskHidden:!t||t.hasAttribute('hidden'),task:t?t.textContent:null};})()`;
async function ensureSelected(cid, when) {
  const want = String(cid);
  const rowSel = `.ov-crew[data-ov-crew="${want}"]`;
  await waitFor(`the CREW WATCH row for cid ${want} (${rowSel})`, () => centre(rowSel),
    { timeoutMs: SELECTION_TIMEOUT_MS, code: 9 });
  const t0 = Date.now();
  let st = null, clicks = 0;
  while (Date.now() - t0 < SELECTION_TIMEOUT_MS) {
    st = await json(selectionState);
    if (st && st.sel === want && !st.taskHidden && st.task) {
      log(`  selection (${when}): cid ${want} is SELECTED on the host`
        + (clicks ? ` after ${clicks} click(s) on her row` : ' already'));
      return st;
    }
    const row = await centre(rowSel);
    if (row) { clicks += 1; await clickAt(row.x, row.y); }
    await sleep(600);
  }
  console.error(
    `FAIL: the host never reported cid ${want} as selected — ${clicks} clicks on ${rowSel} over `
    + `${SELECTION_TIMEOUT_MS / 1000}s and the last read was ${JSON.stringify(st)} (${when}). The row `
    + 'click sends `click(x,y)` at her tile and the host answers on `frame.sel`; if she is walking '
    + 'faster than a frame the click lands on floor, and if that never resolves the selected readout '
    + 'STEPS 4-5 measure is `hidden` — a 0px box that would let their overflow legs pass vacuously. '
    + 'So the run stops here rather than reporting on an element nobody selected.');
  process.exit(9);
  return null;
}

// ── STEP 1: the grid boots off, and she is awaiting orders ──
await leaveRoomZoom();   // a previous run's STEP 7 must not decide which surface this one starts on
log('\nSTEP 1 — boot state (OD-G/OD-H)');
log(`  host TaskLabel: '${rosterTask()}'`);
await openWorkTab();
check(await setCell(0, 1), 'REPAIR set to 1');
check(await setCell(3, 4), 'STRIP (Deconstruct) set to 4');
log('  `work` on the wire:', JSON.stringify(latest.get('work')?.cells));

// ── STEP 2: select her so the readout is on screen, and run the clock until she works ──
log('\nSTEP 2 — select the pawn, run the ship, wait for a job');
await ensureSelected(rell.cid, 'STEP 2');
// 100x over the WIRE, exactly as work-tab-shot.mjs does it ({"cmd":"speed","delta":+3} walks the
// speed index 1 → 4). The SIM is untouched by that — it is the same fixed 10 Hz tick, just more of
// them per wall-second — and driving it from this socket rather than the page keeps the measurement
// independent of the surface under test.
ws.send(JSON.stringify({ cmd: 'speed', delta: 3 }));
await sleep(800);
log('  speed is now', latest.get('status')?.speed);
const t0 = Date.now();
while (Date.now() - t0 < 90000 && !rosterTask().includes(' — ')) await sleep(500);
const working = rosterTask();
log(`  host TaskLabel now: '${working}'`);
check(working.includes(' — '), 'the host is emitting a ranking clause (two work types, one job)');

// ── STEP 3: THE DEFECT — do the docks overflow? ──
log('\nSTEP 3 — the two crew docks must NOT overflow');
// Re-asked, not assumed: up to 90 s of 100× ship has run since STEP 2 selected her, and the
// selection lives on the HOST. Idempotent — when it is still selected this is two reads and no
// click; when it is not, this is the same repair rather than four confusing FAILs downstream.
await ensureSelected(rell.cid, 'after the job wait');
const ovDock = await box('.ov-crewtask');
log('  .ov-crewtask:', JSON.stringify(ovDock));
check(ovDock && !ovDock.overflows,
  `.ov-crewtask content ${ovDock?.scrollW}px in a ${ovDock?.clientW}px box — a clipped row shows a `
  + 'junk fragment of the answer, which is worse than not answering');
check(ovDock && !/priority/.test(ovDock.text), 'the dock shows the WHAT half only (no clause)');
check(ovDock && !/—\s*$/.test(ovDock.text), 'and leaves no dangling separator');

// ── STEP 4: THE PAYLOAD — the clause is fully readable in the selected readout ──
log('\nSTEP 4 — the ranking clause, whole, in the selected readout');
const ro = await box('.ov-task');
log('  .ov-task:', JSON.stringify(ro));
log(`\n  ⭐ VERBATIM .ov-task READOUT: ${JSON.stringify(ro?.text)}\n`);
// ⛔ `clientW > 0` IS NON-VACUITY, NOT BELT-AND-BRACES. An unselected crew leaves this element
// `hidden`, and `scrollWidth 0` is not `> clientWidth 0` — so without this term the leg PASSES on a
// readout that is not on screen at all, which is precisely how the STEP-2 flake stayed quiet.
check(ro && ro.clientW > 0 && !ro.overflows,
  `.ov-task content ${ro?.scrollW}px in a ${ro?.clientW}px box (it wraps; a 0px box means HIDDEN)`);
check(ro && /is priority \d/.test(ro.text), 'the readout carries the priority the job was chosen at');
check(ro && ro.text.includes(working), 'the readout is the host\'s whole sentence, unaltered');
await png('01-clause-in-readout.png');

// ── STEP 5: flip the grid and the clause follows ──
log('\nSTEP 5 — flip Repair 1/Strip 4 to Repair 4/Strip 1; the clause must follow');
const before = ro?.text || '';
await openWorkTab();
check(await setCell(0, 4), 'REPAIR set to 4');
check(await setCell(3, 1), 'STRIP set to 1');
// POLLED, and DELIBERATELY NON-FATAL. "The readout follows the grid" is a PRODUCT claim, not a rig
// precondition: if it never follows, that must arrive as the FAIL below alongside every other
// result, never as an exit that truncates STEPS 6-7. The poll only removes the 2500 ms guess about
// how long the command→sim→wire→repaint round trip takes at 100×.
const after = await waitFor('the selected readout followed the grid flip',
  async () => { const b = await box('.ov-task'); return (b && b.text && b.text !== before) ? b : null; },
  { timeoutMs: 20000, fatal: false }) || await box('.ov-task');
log(`  ⭐ VERBATIM .ov-task AFTER THE FLIP: ${JSON.stringify(after?.text)}`);
check(after && after.text !== before, 'the readout changed when the grid changed');
check(after && /is priority \d/.test(after.text), 'and it still names a priority');
const afterDock = await box('.ov-crewtask');
check(afterDock && !afterDock.overflows, 'the dock still does not overflow after the flip');
await png('02-after-the-flip.png');

// ══ STEP 6 — ⭐⭐ THE WARNING SURVIVES THE OVERVIEW DOCK (D4 fix-back) ══
log('\nSTEP 6 — the NO-AIR label in the OVERVIEW dock (.ov-crewtask)');
const NO_AIR = 'Servicing fabricator_1 · NO AIR';        // the host's own D4 string, 31 chars
const ovBudget = await budgetOf('.ov-crewtask');
log('  MEASURED budget:', JSON.stringify(ovBudget), '· the constant says', OV_DOCK_TASK_CHARS);
check(ovBudget && ovBudget.chars === OV_DOCK_TASK_CHARS,
  `.ov-crewtask holds ${ovBudget?.chars} characters in ${ovBudget?.clientW}px and OV_DOCK_TASK_CHARS `
  + `is ${OV_DOCK_TASK_CHARS}. The constant is a MEASUREMENT — if the CSS moved, re-measure it here `
  + 'and move it in console-model.js, do not widen the dock (M2-20 precedent, VS-Z-52)');

// NON-VACUITY, and it is the defect itself: the RAW label must overflow this box.
const ovRaw = await fitProbe('.ov-crewtask', NO_AIR);
log('  RAW  :', JSON.stringify(ovRaw));
check(ovRaw && ovRaw.overflows,
  `the raw ${NO_AIR.length}-char label measures ${ovRaw?.scrollW}px in a ${ovRaw?.clientW}px box — if it `
  + 'FITS, this probe cannot see the clipping D4 shipped and every check below is vacuous');

const ovFixed = watchTask({ task: NO_AIR }, OV_DOCK_TASK_CHARS).what;   // the SHIPPED derivation
const ovOut = await fitProbe('.ov-crewtask', ovFixed);
log('  FIXED:', JSON.stringify(ovOut));
check(ovOut && !ovOut.overflows,
  `the shortened label ${JSON.stringify(ovFixed)} still measures ${ovOut?.scrollW}px in ${ovOut?.clientW}px`);
check(ovOut && ovOut.shows,
  '⭐⭐ THE OVERVIEW DOCK SHOWS THE WORDS "NO AIR": ' + JSON.stringify(ovFixed) + '. Before this package '
  + 'the row read "Servicing fabricator…" and the clipped tail was the entire warning');
check(ovFixed.endsWith(AIR_WARNING_CLAUSE), 'the warning is the SUFFIX, so nothing can follow it into the ellipsis');
await holdText('.ov-crewtask', ovFixed, 700);
await pngAs('dock-noair-01-overview.png');
await releaseText();

// ══ STEP 7 — ⭐⭐ THE ROOM ZOOM DOCK, WHICH THIS RIG NEVER PROBED ══
log('\nSTEP 7 — the Room Zoom crew dock (.rz-crewtask) — the narrow one, with NO readout behind it');
// ⚠️ TRIED ACROSS EVERY COMPARTMENT, AND POLLED. One compartment is not reliably clickable: the WORK
// tab's panel overlays the top of the stage (STEP 5 left it open) and a crew marker can take the
// click on the room under it. The first cut clicked the FIRST `.pl-room` once, slept, and reported
// ten FAILs against `null` — a tool failing to open a door reads exactly like the dock being broken.
const roomOpen = await (async () => {
  const anchors = await json("Array.from(document.querySelectorAll('.pl-room[data-anchor]')).map((g)=>g.dataset.anchor)") || [];
  for (const a of anchors.slice(0, 8)) {
    const box2 = await centre(`.pl-room[data-anchor="${a}"]`);
    if (!box2) continue;
    await clickAt(box2.x, box2.y);
    for (let i = 0; i < 8; i++) {
      await sleep(700);
      if (await evaluate("!!document.querySelector('.rz-crewtask')")) { log('  entered', a); return true; }
    }
  }
  return false;
})();
if (!roomOpen) { check(false, 'no compartment would open — the Room Zoom legs cannot run'); }
else {
  const rzBudget = await budgetOf('.rz-crewtask');
  log('  MEASURED budget:', JSON.stringify(rzBudget), '· the constant says', RZ_DOCK_TASK_CHARS);
  check(rzBudget && rzBudget.chars === RZ_DOCK_TASK_CHARS,
    `.rz-crewtask holds ${rzBudget?.chars} characters in ${rzBudget?.clientW}px and RZ_DOCK_TASK_CHARS is `
    + `${RZ_DOCK_TASK_CHARS}. ⚠️ Every comment in this repo said 23 until this package measured it: 23 `
    + 'characters are 120px in a 118px box, so the inherited figure was the CLIPPED one');

  // 7a — the LIVE row, with the ranking clause the sim is really emitting. This is STEP 3's check on
  // the dock STEP 3 never looked at.
  const rzLive = await box('.rz-crewtask');
  log('  LIVE :', JSON.stringify(rzLive));
  check(rzLive && !/priority/.test(rzLive.text), 'the Room Zoom dock shows the WHAT half only (no clause)');
  check(rzLive && !/—\s*$/.test(rzLive.text), 'and leaves no dangling separator');
  // ⚠️ OBSERVED, NOT CHECKED — AND THE FIRST VERSION OF THIS LEG CHECKED IT AND WAS WRONG TO.
  // A WARNING-FREE base label can still be longer than 22: this rig measured
  // `"Heading to service battery_2"` (28 chars) at 146 px in the 118 px box on a fresh sim. That is
  // CSS ellipsis doing what it has always done here, it predates D4, and `dockTask` rule 2 leaves it
  // alone ON PURPOSE — a client that started shortening every long label would be a second, invisible
  // opinion about the host's prose. Asserting "no live row ever overflows" would fail this tool on a
  // defect that is not this package's and would flap with whatever job the pawn happens to hold.
  // FILED as an OPEN line (the hover title added below is what carries the whole sentence today).
  if (rzLive?.overflows)
    log(`  ⚠️ OBSERVED (filed, not this package): the live base label ${JSON.stringify(rzLive.text)} `
      + `(${rzLive.text.length} chars) measures ${rzLive.scrollW}px in ${rzLive.clientW}px and is CSS-clipped. `
      + 'Warning-free labels are deliberately left to the stylesheet.');
  else log(`  the live base label fits (${rzLive?.scrollW}px in ${rzLive?.clientW}px)`);

  // 7b — the NO-AIR label, raw then shortened.
  const rzRaw = await fitProbe('.rz-crewtask', NO_AIR);
  log('  RAW  :', JSON.stringify(rzRaw));
  check(rzRaw && rzRaw.overflows,
    `the raw label measures ${rzRaw?.scrollW}px in a ${rzRaw?.clientW}px box — a probe that cannot see `
    + 'this cannot credit the fix either');
  const rzFixed = watchTask({ task: NO_AIR }, RZ_DOCK_TASK_CHARS).what;
  const rzOut = await fitProbe('.rz-crewtask', rzFixed);
  log('  FIXED:', JSON.stringify(rzOut));
  check(rzOut && !rzOut.overflows,
    `the shortened label ${JSON.stringify(rzFixed)} still measures ${rzOut?.scrollW}px in ${rzOut?.clientW}px`);
  check(rzOut && rzOut.shows,
    '⭐⭐ THE ROOM ZOOM DOCK SHOWS THE WORDS "NO AIR": ' + JSON.stringify(rzFixed) + '. This surface has no '
    + 'selected readout at all, so this row is the ONLY place inside a room the warning can appear');
  // ⛔ CROSSED BUDGETS ARE THE SILENT FAILURE — the Overview's 26-char string in THIS box still clips.
  const crossed = await fitProbe('.rz-crewtask', ovFixed);
  check(crossed && crossed.overflows,
    `the OVERVIEW's 26-char string measures ${crossed?.scrollW}px here, inside ${crossed?.clientW}px — if `
    + 'that fits, the two budgets are not actually different and one constant would have done');

  // 7c — the BONUS full-line surface: the whole sentence on hover, on both docks.
  const titles = await json(`(()=>{const o=document.querySelector('.ov-crewtask'),r=document.querySelector('.rz-crewtask');`
    + `return {ov:o&&o.getAttribute('title'),rz:r&&r.getAttribute('title')};})()`);
  log('  hover titles:', JSON.stringify(titles));
  check(!!titles?.rz && titles.rz.length > 0,
    'the Room Zoom dock carries no hover title — with the base shortened and no readout on this surface, '
    + 'the full device name is now unreachable inside a room');
  check(!!titles?.ov && titles.ov.length > 0, 'the Overview dock carries no hover title');

  await holdText('.rz-crewtask', rzFixed, 700);
  await pngAs('dock-noair-02-roomzoom.png');
  await releaseText();
  await leaveRoomZoom();   // the focused room is HOST state — hand the session back on the Overview
}

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
