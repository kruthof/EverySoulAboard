#!/usr/bin/env node
// ⛔⛔ "A BAY LEFT OPEN ON A DARK SHIP MUST NOT EAT THE TRANSCRIPT" — the POD BAY poll's stand-down,
// driven in real Chrome, at a real 1 Hz, against the real shipping host.
//
// THE DEFECT (found by review on the moss-autoscroll merge, 2026-08-03). `_reflectPodPoll` runs
// `refreshPods` on a `POD_REFRESH_MS` = 1000 timer for as long as the POD BAY is on screen, so the
// client sends `moss pods` WITH NO KEYSTROKE. When MOSS is not live — a brownout drops
// `Device.Powered`, or wear takes the console under `MaintainBelow` — `GameSession.HandleMoss`'s
// `pods` arm answers EVERY one of them with `Refuse(...)` → `MossExec(ok:false,[(2,sentence)])`, and
// `reduceMossEvent` pushes that sentence onto the transcript. ONE UNBIDDEN LINE PER SECOND;
// `CONSOLE_CAP` is 200, so ~3.3 minutes erases everything the player had — on the screen the thaw
// arc is run from.
//
// ⭐ WHAT ONLY THIS TOOL CAN SEE. `moss-screen.test.js`'s POD POLL tests drive the same rule on a
// FAKE clock through dom-lite, which has no layout and no wire. They cannot see:
//   1. THAT THE REAL `setInterval` REALLY STOPS ASKING — the node tests hand-crank `tickTimers()`;
//      here six wall-clock seconds pass with the browser's own clock and the frames are counted at
//      the SOCKET, on the way out (trap 4: the argument recorded at the seam, never a text scan).
//   2. THAT THE REFUSALS ARE THE SHIPPING HOST'S — every reply below is `MossGate.OfflineRefusal`
//      composed by the real `GameSession` on the real `--ship wreck`, not a fixture string.
//   3. THAT THE STAND-DOWN IS ON THE PIXELS — `POD_POLL_STALE` in the shipped stylesheet, inside
//      the bay's own box, at the viewport the console defect was measured at.
//
// ⚠️⚠️ ONE THING IS STAGED, AND IT IS SAID OUT LOUD BECAUSE IT MATTERS.
// ⛔ THE BOOT WRECK CANNOT OPEN THE BAY AT ALL — measured 2026-08-04 over a plain socket against
// `hosts/web --ship wreck`: a boot-state `{"type":"moss","op":"pods","tid":"@console"}` comes back
// `ev:exec ok:false / "MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; …"`, and `reducePods` is
// the ONLY thing that moves the screen to PODBAY. So the defect's window is a bay opened while the
// ship was live that then goes dark under the player, and reaching it honestly would mean the full
// repair + commission chain (`pod-bay-shot.mjs --prep`, tens of sim-hours of ordered work) followed
// by forcing a brownout at exactly the right moment — not an acceptance run.
//   · STAGED: ONE `ev:pods` message, injected into the page's own socket, whose shape is
//     `WireFormat.MossPods`'s (`hosts/web/WireFormat.Pods.cs:202-227`) and whose only job is to put
//     the bay on screen. Nothing downstream of it is staged.
//   · REAL: the timer, the outgoing `moss pods` frames, the host that receives them, the refusal
//     sentence, the reducer, the transcript, the stylesheet, the clock.
// A reviewer who wants the unstaged precondition plays `pod-bay-shot.mjs`'s chain and pulls the
// breaker; this tool exists so the SPAM PATH can be re-run in a minute.
//
// ⭐ NON-VACUITY (STEP 4): the stand-down is physically removed from `client/src/ui/moss-screen.js`,
// the page is reloaded with the HTTP cache off, and the SAME six-second window is measured again.
// It must reproduce the per-second growth. The original is held IN MEMORY and written back in a
// `finally`, mtime pushed FORWARD (TRAPS 2 — `git checkout` never appears in a mutation loop).
//
// USAGE
//   1. ./play.sh --host-port 8472 --client-port 8473 --no-open
//   2. node client/tools/pod-poll-shot.mjs --out docs/design/shots [--host-port 8472] …
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running host
// (the moss-shot.mjs / moss-scroll-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding, waitFor, die, sleep } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8472');
const CLIENT_PORT = +arg('client-port', '8473');
const CDP_PORT = +arg('cdp-port', '9472');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'pod-poll-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REPO = resolve(new URL('../..', import.meta.url).pathname);
const SCREEN_JS = join(REPO, 'client', 'src', 'ui', 'moss-screen.js');
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

/** The six seconds the whole tool is about: POD_REFRESH_MS is 1000, so an unfixed client sends ~6. */
const WINDOW_MS = 6000;

// ───────────────────────────── the ONE staged message (WireFormat.Pods.cs:202-227's own shape)
const BAY_MSG = {
  type: 'moss', ev: 'pods', tid: '@console', term: 'term_moss', moss: 'COMMISSIONED',
  note: 'HEADROOM FOR 2 CREW — FOOD 60 U, CARRIED AND RESERVED INCLUDED',
  rows: [
    [1, 'pod_rell', 'Rell', 0, 'OPEN', 2, 'POD IS EMPTY — ALREADY THAWED', 0],
    [2, 'pod_ozawa', 'Ozawa-Reyes', 1, 'SEALED', 0, 'READY — 2 SEALS', 1],
    [3, 'pod_vance', 'Vance', 2, 'NO SIGNAL', 3, 'POD — NO SIGNAL', 0],
  ],
};

// ───────────────────────────── real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'pod-poll-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1280,800',
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
if (!wsUrl) die(chrome, 5, 'FAIL: Chrome never opened a DevTools endpoint');

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) die(chrome, 6, 'FAIL: captureScreenshot returned nothing for ' + name);
  const p = join(OUT, PREFIX + name); writeFileSync(p, Buffer.from(r.result.data, 'base64')); log('  wrote', p);
  return p;
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** One TRUSTED keystroke — OD-P made the console a terminal, so this is the only honest way in. */
async function key(k) {
  const printable = k.length === 1;
  const base = { key: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0) };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: printable ? k : (k === 'Enter' ? '\r' : undefined) });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function type(line) { for (const ch of line) { await key(ch); await sleep(12); } }
async function prompt(line) { await type(line); await key('Enter'); await sleep(1200); }

// ⭐ THE SEAM. Wrapping `WebSocket` BEFORE any page script runs records every outgoing MOSS frame at
// the point it leaves the client — the argument, not a rendered consequence — and gives the tool a
// way to deliver the one staged reply through the page's own message path (`dispatchEvent` fires the
// `onmessage` the session installed, so nothing about the client's routing is bypassed).
const HOOK = `(() => {
  const Native = window.WebSocket;
  const state = { sent: [], sock: null };
  const Wrapped = function (...a) {
    const ws = new Native(...a);
    state.sock = ws;
    const send = ws.send.bind(ws);
    ws.send = (data) => {
      try { const m = JSON.parse(data); if (m && m.type === 'moss') state.sent.push({ t: Date.now(), op: m.op }); } catch (_) {}
      return send(data);
    };
    return ws;
  };
  Wrapped.prototype = Native.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[k] = Native[k];
  window.WebSocket = Wrapped;
  window.__podpoll = state;
  window.__podpoll.inject = (msg) => {
    if (!state.sock) return false;
    state.sock.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(msg) }));
    return true;
  };
  window.__podpoll.count = (op) => state.sent.filter((s) => s.op === op).length;
})();`;

/** The page's truth: transcript lines, and whether the bay's stand-down note is really on screen. */
const VIEW = `(()=>{
  const lines = [...document.querySelectorAll('.moss-cline')].map((e)=>e.textContent);
  const st = document.querySelector('.moss-stale');
  const r = st ? st.getBoundingClientRect() : null;
  return { lines, polls: window.__podpoll.count('pods'),
           stale: st ? st.textContent : '',
           staleVisible: !!(r && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight),
           screen: document.querySelector('#moss-view')?.dataset.screen || '' };})()`;
const view = () => json(VIEW);

await call('Page.enable'); await call('Runtime.enable');
await call('Network.enable');
// The STEP-4 control reloads a MUTATED module from the same URL; a cached copy would make the
// control silently re-run the SHIPPED code and read as a passing non-vacuity check.
await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

// ⛔ THE SENTENCE IS NEVER HARD-CODED HERE, AND THAT IS A LESSON THIS TOOL LEARNED THE SAME NIGHT.
// The first draft pinned `MOSS IS OFFLINE — … REPAIR ONE TO REACH THE DOORS`, measured off the
// running host. Merging `main` an hour later (the gate-sentences lane) made the SAME request answer
// `… REPAIR TERM_MOSS ON DECK 0 AT 1,3 TO REACH THE PODS` — the tail is now DERIVED per call site.
// A rig that pins another lane's prose fails for a reason that has nothing to do with its subject.
// So the ship's own typed answer in STEP 1 IS the expected value for every later step; this tool
// asserts that the poll and the prompt say THE SAME THING, and never what that thing is.
let OFFLINE = null;

/**
 * Boot the page, open MOSS, TYPE `pods`, then stage the reply. Returns the before/after views of
 * the typed ask so STEP 1 can assert on them, and leaves the bay on screen with the poll live.
 *
 * ⚠️ THE TYPED ASK IS NOT DECORATION — the STEP-4 control found this the hard way, with the bay
 * never opening and three checks reading FAIL for the wrong reason. `reducePods` opens the bay only
 * when `model.podsAsked` is set, and only `submitCommand`'s `pods` arm sets it: a reply nobody asked
 * for must never be able to take the screen. The host REFUSES this ask (that is STEP 1's subject),
 * and a refusal is an `ev:exec` which does not clear the handshake — so the flag is still standing
 * when the staged `ev:pods` lands. Injecting without typing first stages nothing at all.
 */
async function openBay() {
  await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
  await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });
  const tab = await waitFor('the Overview MOSS tab', async () => {
    const r = await centre('[data-ov-tab="moss"]'); return (r && r.w > 0) ? r : null;
  }, { chrome, code: 8 });
  await clickAt(tab.x, tab.y);
  await waitFor('the MOSS console prompt (the takeover really happened)',
    () => evaluate("document.querySelector('.moss-input')?1:0"), { chrome, code: 8 });
  const box = await centre('.moss-input');
  if (box) await clickAt(box.x, box.y);
  await sleep(400);

  const asked = await view();
  await prompt('pods');
  const refused = await view();
  const injected = await evaluate(`window.__podpoll.inject(${JSON.stringify(BAY_MSG)})`);
  if (!injected) die(chrome, 9, 'FAIL: could not reach the page socket to stage the bay');
  await sleep(400);
  return { asked, refused, open: await view() };
}

// ───────────────────────────── STEP 1: the SHIP'S OWN refusal, typed, on the boot wreck
log('\nSTEP 1 — the shipping host really refuses `pods` here, and says so in words');
const boot = await openBay();
const gained1 = boot.refused.lines.slice(boot.asked.lines.length);
// The `> pods` echo is the client's; the OTHER line is the ship's, and it is captured as the
// expected value for every step below rather than compared to a literal.
OFFLINE = gained1.find((t) => t && !t.startsWith('> ')) || null;
check(!!OFFLINE && /MOSS IS OFFLINE/.test(OFFLINE),
  'a TYPED `pods` prints the ship\'s own refusal — the one that names what to repair '
  + '(got: ' + JSON.stringify(gained1) + ')');
check(boot.refused.screen !== 'podbay',
  'PRECONDITION, and the premise this tool had to correct: a refused ask does NOT open the bay, '
  + 'so the boot wreck cannot reach the defect without the staged step below');

// ───────────────────────────── STEP 2: the bay on screen, and six real seconds of a player reading
log('\nSTEP 2 — the bay is up on a ship that will not answer; six seconds pass');
const open = boot.open;
check(open.screen === 'podbay', 'PRECONDITION: the bay is on screen (the poll only runs there)');

const base = { lines: open.lines.length, polls: open.polls };
await sleep(WINDOW_MS);
const settled = await view();
const dPolls = settled.polls - base.polls;
const dLines = settled.lines.length - base.lines;
log(`  window: ${WINDOW_MS} ms · \`moss pods\` frames out ${dPolls} · transcript lines gained ${dLines}`);
check(dPolls === 1, 'exactly ONE `moss pods` frame left the client in six seconds (got ' + dPolls
  + ') — the poll stood down after its first unanswered period');
check(dLines === 1, 'exactly ONE unbidden transcript line landed (got ' + dLines
  + ') — the ship got to say it once, and the player\'s transcript is theirs');
check(settled.lines[settled.lines.length - 1] === OFFLINE,
  'and that line is the ship\'s own sentence, not a client-composed stand-in');
check(settled.staleVisible && settled.stale.includes('TYPE PODS'),
  'the bay SAYS its refresh has stopped, in the shipped stylesheet, inside the viewport '
  + '(' + JSON.stringify(settled.stale) + ') — a frozen census that still looks live is the '
  + 'failure this poll exists to prevent');
await png('01-bay-stood-down.png');

// ───────────────────────────── STEP 3: the typed verb still works, on the stood-down bay
log('\nSTEP 3 — the player asks anyway; the ship answers every time it is asked');
const before3 = await view();
await prompt('pods');
const after3 = await view();
check(after3.lines.slice(before3.lines.length).includes(OFFLINE),
  'a TYPED `pods` on a stood-down bay STILL prints the refusal — the stand-down is on the SEND '
  + 'side and never filters the transcript');
check(after3.polls - before3.polls === 1,
  'and it really reached the ship (one more frame out)');
await png('02-typed-still-answers.png');

// ───────────────────────────── STEP 4: NON-VACUITY — the shipped defect, reproduced
log('\nSTEP 4 — NON-VACUITY: the stand-down removed, the same six seconds re-measured');
const originalSrc = readFileSync(SCREEN_JS, 'utf8');
const ANCHOR = `    if (this._podPollQuiet) return;
    if (this._podPollAwaiting) {
      // A whole period with no \`ev:pods\`: stand down, and REPAINT so the bay says so.
      this._podPollQuiet = true;
      this.render();
      return;
    }
`;
try {
  if (!originalSrc.includes(ANCHOR)) die(chrome, 10, 'FAIL: the STEP-4 anchor is stale — this '
    + 'control would silently re-run the SHIPPED code and read as a pass');
  writeFileSync(SCREEN_JS, originalSrc.replace(ANCHOR, ''));
  const ctl = await openBay();
  const openC = ctl.open;
  check(openC.screen === 'podbay', 'PRECONDITION: the mutated build still opens the bay');
  const baseC = { lines: openC.lines.length, polls: openC.polls };
  await sleep(WINDOW_MS);
  const settledC = await view();
  const dPollsC = settledC.polls - baseC.polls;
  const dLinesC = settledC.lines.length - baseC.lines;
  log(`  window: ${WINDOW_MS} ms · \`moss pods\` frames out ${dPollsC} · transcript lines gained ${dLinesC}`);
  check(dPollsC >= 5, 'the DEFECT reproduces: the poll asks every second (' + dPollsC + ' frames)');
  check(dLinesC >= 5, 'and writes a line for every one of them (' + dLinesC + ' unbidden lines) — '
    + 'so STEP 2\'s PASS was not free');
  check(settledC.stale === '', 'and nothing on the bay says anything is wrong');
  await png('03-nonvacuity-defect-reproduced.png');
} finally {
  writeFileSync(SCREEN_JS, originalSrc);
  const t = new Date(Date.now() + 2000);   // FORWARD, so nothing downstream serves a stale copy
  utimesSync(SCREEN_JS, t, t);
  const restored = readFileSync(SCREEN_JS, 'utf8') === originalSrc;
  check(restored, 'the mutated source was restored byte-for-byte from the in-memory copy');
}

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
