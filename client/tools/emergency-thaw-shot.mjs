#!/usr/bin/env node
// ⭐⭐ M3-5 / OD-10 — "THE SHIP WAKES ONE MORE SOUL BY ITSELF, ONCE — AND THEN THE RUN ENDS",
// driven in real Chrome against the running game. This is the package's acceptance script,
// automated so a reviewer can re-run it instead of re-typing it.
//
// WHAT ONLY THIS TOOL CAN SEE. `EmergencyThawTests` drives the sim and `WireFormat.EndingBanner`
// directly; `overview-model.test.js` drives the bar against a node DOM stub. None of them can see:
//   1. THAT THE GRACE IS NOT SILENT ON THE SURFACE THE PLAYER IS ACTUALLY LOOKING AT. The two
//      Chronicle lines live on the MOSS console; the Overview is where the player watches their
//      crew die. If the bar does not paint there, the four sim-minutes between the death and the
//      wake are indistinguishable from a hung game — which is the entire defect M3-5 closes.
//   2. THAT THE CHRONICLE LINE IS REACHABLE AT ALL IN PLAY. `chron` is pushed on DAY ROLLOVER, so
//      in a short session the only route to it is the MOSS console's FAULT LOG, typed. Whether the
//      sentence survives that route is a fact about the shipping screen, not about HistorySystem.
//   3. THAT THE ENDING READS DIFFERENTLY FROM THE GRACE IN THE REAL STYLESHEET. `over` is a wire
//      flag; a class that never lands is a lose state the player cannot tell from a reprieve.
//
// ⚠️⚠️ ONE THING IS DRIVEN AND NOT PLAYED, AND IT IS SAID OUT LOUD — the pod-bay-shot.mjs /
// board-fault-shot.mjs precedent, verbatim in technique and in disclosure. **THE GAME OFFERS NO
// VERB THAT KILLS A PAWN**, and the honest route to one — order her across the pressure frontier
// and wait — is defeated by the shipping safety rule (`needs.flee_suffocation`: a crew member in
// unbreathable air drops the job and flees). So `--prep` writes a TEMPORARY defs overlay that
// moves TWO NUMBERS in `needs.def` and nothing else:
//     hypoxia_ppo2_kpa / severe_hypoxia_ppo2_kpa   16 / 10  ->  999 / 999
//   · The DEATH is the shipping mechanism — `NeedsSystem`'s own hypoxia track, the same one that
//     kills a player's pawn on the wrong side of a bulkhead — AT THE SHIPPING RATE. Only the two
//     THRESHOLDS move, so the whole ship reads as unbreathable; `suffocation_per_second_vacuum` is
//     untouched and each death still takes the authored ~90 s. (An earlier draft moved the rate too
//     and the first pawn was dead before Chrome finished booting, which cost the run's step 1.)
//   · NOTHING about cryo, the emergency thaw, the Chronicle, the banner or the wire is touched.
//     `CryoSystem`, `WireFormat.Ending*` and the client are all shipping code, unmodified.
//   · The EMERGENCY THAW, THE WAKE, THE CHRONICLE and THE ENDING are all WITNESSED, never driven:
//     this tool never sends a cryo command and never writes sim state.
//   · A reviewer who wants the unmodified rate runs the same script with a plain `--data`; the only
//     difference is that the ship stays breathable and nobody dies at all — the two thresholds ARE
//     the whole intervention.
//
// USAGE
//   1. node client/tools/emergency-thaw-shot.mjs --prep   # writes the temp defs, prints the host cmd
//   2. <the printed host command>                          # and, beside it: python3 client/serve.py 8393
//   3. node client/tools/emergency-thaw-shot.mjs --out docs/design/shots
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / board-fault-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const HOST_PORT = +arg('host-port', '8392');
const CLIENT_PORT = +arg('client-port', '8393');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'emergency-thaw-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9373');
const REPO = resolve(new URL('../..', import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ───────────────────────────── --prep: the temp defs overlay, and nothing else
if (has('prep')) {
  const src = join(REPO, 'content', 'core', 'SimDefs');
  const dst = mkdtempSync(join(tmpdir(), 'emgthaw-defs-'));
  // ⚠️ A COMPLETE COPY, SUBDIRECTORIES INCLUDED — `Sim.Dsl/RulesLoader.cs` reads
  // `<defsDir>/rules/*.moss`, and an overlay that skipped them would boot the acceptance host with
  // NO designer rules while this header claimed the only change was two numbers. That happened
  // once to pod-bay-shot.mjs; the copy is verified file-for-file below.
  let copied = 0, rulesCopied = 0;
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) {
      mkdirSync(join(dst, e.name), { recursive: true });
      for (const f of readdirSync(join(src, e.name))) { copyFileSync(join(src, e.name, f), join(dst, e.name, f)); rulesCopied += 1; }
    } else { copyFileSync(join(src, e.name), join(dst, e.name)); copied += 1; }
  }
  const wantRules = readdirSync(join(src, 'rules')).length;
  if (rulesCopied !== wantRules) { console.error(`FAIL: copied ${rulesCopied} of ${wantRules} files under rules/`); process.exit(2); }
  log(`copied ${copied} def files + ${rulesCopied} rules/*.moss`);

  const nd = join(dst, 'needs.def');
  const before = readFileSync(nd, 'utf8');
  let after = before
    .replace(/^hypoxia_ppo2_kpa(\s*)=\s*\S+/m, 'hypoxia_ppo2_kpa$1= 999')
    .replace(/^severe_hypoxia_ppo2_kpa(\s*)=\s*\S+/m, 'severe_hypoxia_ppo2_kpa$1= 999');
  const moved = ['hypoxia_ppo2_kpa', 'severe_hypoxia_ppo2_kpa']
    .filter((k) => new RegExp('^' + k + '\\s*=\\s*999\\b', 'm').test(after));
  if (moved.length !== 2) { console.error('FAIL: moved only ' + moved.length + '/2 needs.def keys: ' + moved); process.exit(2); }
  if (!/^suffocation_per_second_vacuum\s*=\s*0\.011111111\b/m.test(after))
    { console.error('FAIL: the suffocation RATE must stay at its shipped value'); process.exit(2); }
  writeFileSync(nd, after);
  log('wrote a defs overlay moving TWO needs.def numbers (and NOTHING else):\n  ' + dst);
  log('\nstart the two halves with:');
  log(`  ~/.dotnet/dotnet run --project hosts/web -- --port ${HOST_PORT} --ship wreck --data ${dst}`);
  log(`  python3 client/serve.py ${CLIENT_PORT}`);
  log('\nthen: node client/tools/emergency-thaw-shot.mjs --out docs/design/shots');
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ───────────────────────────── 1. the sim's own truth, on an INDEPENDENT socket (never the page)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
if (!latest.get('roster')) { console.error('FAIL: no roster channel on the wire'); process.exit(2); }

const crewNames = () => (latest.get('roster')?.crew || []).map((c) => c.name ?? c[1] ?? String(c));
const wireEnding = () => latest.get('ending') || null;

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'emergency-thaw-shot-'));
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
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const json = async (expr) => { const s = await evaluate(`JSON.stringify(${expr})`); return (s && s !== 'null') ? JSON.parse(s) : null; };
async function png(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  if (!r.result?.data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name); writeFileSync(p, Buffer.from(r.result.data, 'base64')); log('  wrote', p);
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** One TRUSTED keystroke, the way OD-P's terminal expects them. ⚠️ A printable character carries
 *  NO virtual key code — board-fault-shot.mjs measured that `'.'` is VK_DELETE and eats a character.
 *  With `text` alone the character is inserted and the client still sees `e.key`. */
async function key(k) {
  if (k.length === 1) {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k });
    return;
  }
  const code = k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0;
  const base = { key: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: k === 'Enter' ? '\r' : undefined });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function type(line) { for (const ch of line) { await key(ch); await sleep(12); } }

/** THE BAR, read off the shipping DOM. `text` is what the player reads; `over` is the CLASS, so a
 *  wire flag that never reaches the stylesheet is visible here as a mismatch. */
const bar = () => json(
  `(()=>{const e=document.getElementById('ov-ending');if(!e)return null;`
  + `return {present:true,hidden:!!e.hidden,text:e.textContent,over:e.classList.contains('ov-endover')};})()`);

/** Poll the shipping DOM until `pred(bar)` or the budget runs out. */
async function waitForBar(pred, budgetMs, what) {
  const t0 = Date.now();
  let b = await bar();
  while (Date.now() - t0 < budgetMs) {
    b = await bar();
    if (b && pred(b)) return b;
    await sleep(2000);
  }
  log(`  (timed out after ${Math.round((Date.now() - t0) / 1000)}s waiting for ${what}; bar = ${JSON.stringify(b)})`);
  return b;
}

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
for (let i = 0; i < 15; i++) {                       // dismiss the onboarding card if it mounted
  const onb = await centre('[data-onb-begin]');
  if (onb) { await clickAt(onb.x, onb.y); await sleep(1500); break; }
  await sleep(1000);
}

// ───────────────────────────── STEP 1 — an ordinary run says NOTHING
log('\nSTEP 1 — the crew is alive and the ENDING bar is silent');
const b0 = await bar();
check(!!b0?.present, '#ov-ending exists on the shipping Overview');
check(b0?.hidden === true, 'the bar is HIDDEN while somebody is alive');
log('  crew on the wire:', JSON.stringify(crewNames()));
check(crewNames().length === 1, 'the wreck boots with exactly one soul awake');
await png('1-alive.png');

// ───────────────────────────── STEP 2 — the death, and the grace that must not be silent
log('\nSTEP 2 — the last pawn dies and the ship starts waking somebody (WITNESSED)');
const b1 = await waitForBar((b) => !b.hidden, 180000, 'the grace banner');
check(b1?.hidden === false, 'the ENDING bar APPEARED — the grace is not silent on the standard surface');
log('  bar =', JSON.stringify(b1));
check(/^ALL HANDS DOWN — THE SHIP IS WAKING [A-Z]+\.$/.test(b1?.text || ''),
  'it reads as the grace, naming the sleeper: "' + (b1?.text || '') + '"');
check(b1?.over === false, 'it is NOT styled as the ending — the player must not read the grace as a loss');
const w1 = wireEnding();
log('  wire `ending` =', JSON.stringify(w1));
check(w1 && w1.over === false && w1.text === b1?.text,
  'the independent socket agrees with the page (text + over)');
await png('2-grace.png');

// ───────────────────────────── STEP 3 — the wake
log('\nSTEP 3 — four sim-minutes later, a second soul is aboard (WITNESSED)');
const b2 = await waitForBar((b) => b.hidden === true, 330000, 'the bar to clear on the wake');
check(b2?.hidden === true, 'the bar CLEARED — the ship woke somebody and stopped saying it was trying');
log('  crew on the wire:', JSON.stringify(crewNames()));
check(crewNames().length === 1, 'exactly one soul is aboard again');
await png('3-woken.png');

// ───────────────────────────── STEP 4 — the ending
log('\nSTEP 4 — the woken soul dies in her turn, and the run ENDS ON SCREEN (WITNESSED)');
const b3 = await waitForBar((b) => !b.hidden && b.over === true, 240000, 'the ending banner');
log('  bar =', JSON.stringify(b3));
check(b3?.hidden === false, 'the ENDING bar is up');
check(b3?.text === 'EVERY SOUL ABOARD IS DEAD — THE RUN IS OVER.', 'and it says the run is over');
check(b3?.over === true, 'and it is styled as the ending, not as another reprieve');
const w3 = wireEnding();
check(w3 && w3.over === true, 'the independent socket carries over:true');
check(crewNames().length === 0, 'nobody is aboard');
await png('4-ending.png');

// ⛔ AND IT DOES NOT FIRE TWICE. There is no second reprieve to watch for; what CAN be watched is
// that no capsule starts cycling after the ending, i.e. the banner never flips back to the grace.
await sleep(20000);
const b4 = await bar();
check(b4?.over === true && b4?.hidden === false, 'the ending STAYS — it is not a toast that expires');


// ───────────────────────────── STEP 5 — the Chronicle, and it is read LAST ON PURPOSE
//
// ⛔ MOSS IS A BODY-LEVEL TAKEOVER AND `repaint()` RETURNS EARLY WHILE IT IS UP (`shouldShow()`),
// so while the console is open the ENDING bar is FROZEN at whatever it last painted. An earlier
// draft read the Chronicle between the wake and the ending and then timed out for 240 s on a stale
// hidden bar — while the INDEPENDENT SOCKET already carried `over:true`. The product was right and
// the harness was looking at a suppressed surface. The banner is the time-critical observation and
// the Chronicle is not (an entry, once written, stays written), so the order is: witness every
// banner transition on the Overview FIRST, then go read the log.
log('\nSTEP 5 — the FAULT LOG carries the sentence that names BOTH people');
const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) { check(false, 'no MOSS tab on the Overview'); } else { await clickAt(mossTab.x, mossTab.y); await sleep(2500); }
const box = await centre('.moss-input');
if (box) await clickAt(box.x, box.y);
await type('log'); await key('Enter'); await sleep(2500);
// ⚠️ THE SELECTOR IS `.moss-faultlog .moss-logrow` — the FAULT LOG is a PANE, not transcript
// lines. An earlier draft read `.moss-cline` and saw only the echoed `> log`, which is a harness
// bug that reads exactly like "the Chronicle never arrived".
const logLines = await json(`[...document.querySelectorAll('.moss-faultlog .moss-logrow, .moss-faultlog .moss-empty')].map((e)=>e.textContent)`) || [];
log('  FAULT LOG pane:', JSON.stringify(logLines.slice(0, 14)));
check(logLines.some((s) => /With .+ dead, the ship woke .+\./.test(s)),
  'the Chronicle names BOTH people on the shipping screen');
check(logLines.some((s) => /has died\./.test(s)), 'and the death line is beside it');
check(logLines.some((s) => /Every soul aboard is dead, and .+\. The run is over\./.test(s)),
  'and the ENDING line is on record too');
await png('5-chronicle.png');

log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
chrome.kill('SIGKILL');
process.exit(failures ? 1 : 0);
