#!/usr/bin/env node
// ⭐⭐ M3-16 / OD-O — "ONE MACHINE DOES NOT ANSWER ITS SWITCH", driven in real Chrome against the
// running game. This is the package's acceptance script, automated so a reviewer can re-run it
// instead of re-typing it.
//
// WHAT ONLY THIS TOOL CAN SEE. `BoardFaultTests` drives the sim and the web host directly;
// `Deck1VentTests` pins the ship's boot state. None of them can see:
//   1. THAT THE THREE MOVES READ AS ONE INFERENCE IN ONE SITTING — refusal, puff, program — in the
//      real stylesheet, in the order a player meets them. The middle move is the whole design and
//      it exists only as a NUMBER MOVING ON A SCREEN.
//   2. THAT THE VENT DRAWS ITS INTACT ART. The machine is not broken; if the client tinted it as
//      damaged, every player would order a repair that does nothing. A condition byte on the wire
//      is not a picture until the surface draws it.
//   3. THAT THE PROGRAM SCREEN CAN ACTUALLY BE TYPED INTO AND INSTALLED FROM, with trusted keys,
//      on the shipping terminal — the two-line program is the deliverable, not a fixture.
//
// ⚠️ IT TYPES. OD-P made the MOSS console a terminal: no letter hotkeys, every printable character
// types into the prompt, ENTER submits. Every command below is dispatched as TRUSTED key events
// over CDP, exactly as a player produces them.
//
// ⚠️⚠️ ONE THING IS DRIVEN AND NOT PLAYED, AND IT IS SAID OUT LOUD — the pod-bay-shot.mjs
// precedent, verbatim in technique and in disclosure. Commissioning `term_moss` costs one
// `ControllerModule` and the wreck authors NONE (2 Parts <- 4 Scrap <- 8 Regolith, three benches
// deep, behind two doors, across the pressure frontier). That chain is the OPENING OF THE GAME and
// tens of sim-hours of ordered work — not a five-minute acceptance run. So `--prep` writes a
// TEMPORARY defs overlay in which `build.def commission_cost = 0` and NOTHING else changes, and
// this harness commissions through the ordinary `commission` wire command a player's own click
// sends.
//   · The SHIP is the shipping ship. The GATE is the shipping gate. The SCREEN is the shipping
//     screen. The FAULT, the REFUSAL, the BLEED and the PROGRAM are all shipping code.
//   · The repair, both refusals, the puff, the program and the fill are PLAYED.
//   · A reviewer who wants the unmodified price runs steps 4-6 by hand after playing the chain.
//
// USAGE
//   1. node client/tools/board-fault-shot.mjs --prep      # writes the temp defs, prints the host cmd
//   2. <the printed host command>                          # and, beside it: python3 client/serve.py 8391
//   3. node client/tools/board-fault-shot.mjs --out docs/design/shots
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / moss-gate-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dismissOnboarding } from './rig-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'board-fault-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9371');
const REPO = resolve(new URL('../..', import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ───────────────────────────── --prep: the temp defs overlay, and nothing else
if (has('prep')) {
  const src = join(REPO, 'content', 'core', 'SimDefs');
  const dst = mkdtempSync(join(tmpdir(), 'boardfault-defs-'));
  // ⚠️ A COMPLETE COPY, SUBDIRECTORIES INCLUDED. `Sim.Dsl/RulesLoader.cs` reads
  // `<defsDir>/rules/*.moss`; an overlay that skipped them would boot the acceptance host with NO
  // designer rules while this header claimed the only change was a price. That happened once to
  // pod-bay-shot.mjs; the copy is verified file-for-file below.
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
  const bd = join(dst, 'build.def');
  const before = readFileSync(bd, 'utf8');
  const after = before.replace(/^commission_cost\s*=\s*\d+/m, 'commission_cost       = 0');
  if (after === before) { console.error('FAIL: commission_cost not found in build.def'); process.exit(2); }
  writeFileSync(bd, after);
  log('wrote a defs overlay with commission_cost = 0 (and NOTHING else changed):\n  ' + dst);
  log('\nstart the two halves with:');
  log(`  ~/.dotnet/dotnet run --project hosts/web -- --port ${HOST_PORT} --ship wreck --data ${dst}`);
  log(`  python3 client/serve.py ${CLIENT_PORT}`);
  log('\nthen: node client/tools/board-fault-shot.mjs --out docs/design/shots');
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
if (!latest.get('devices')?.cells?.length) { console.error('FAIL: no devices channel on the wire'); process.exit(2); }

// Authored tiles, read off the SHIP rather than hard-coded behaviour: `term_moss` is the cryo bay's
// west wall at its centre row (AuthoredShips.cs), `vent_d1` is hall_d1_s0's (X1,Y0) corner on deck 1.
const MOSS_XY = [1, 3];
const VENT_XY = [10, 1];
const HALL = 'hall_d1_s0';
const row = (x, y, deck) => (latest.get('devices')?.cells || []).find((c) => c[0] === x && c[1] === y && c[2] === deck);
const mossCond = () => { const r = row(MOSS_XY[0], MOSS_XY[1], 0); return r ? r[4] : -1; };  // [x,y,deck,kind,COND,oper,open]
const ventRow = () => row(VENT_XY[0], VENT_XY[1], 1);
// ⚠️ ABSENCE FROM THE `rooms` CHANNEL IS THE ZERO, AND IT IS NOT A GAP IN THE HARNESS.
// `GameSession.BuildRooms` skips any anchor whose room is the vacuum sink OR holds
// `TotalMoles <= 0` — so an airless hall is simply not on the wire, and the boot ship publishes
// exactly three rooms (cryobay, reactor, wreck_spine_0). Reading absence as 0.000 kPa is therefore
// the host's own meaning; a `-1` is reserved for "no channel at all", which is a real failure.
const hallKPa = () => {
  const msg = latest.get('rooms');
  if (!msg) return -1;                                  // no channel: a genuine fault, not a zero
  const r = (msg.rooms || []).find((q) => q[0] === HALL); // [anchor,deck,o2,co2ppm,PRESSURE,tempK,tiles]
  return r ? r[4] : 0;                                  // absent == airless == 0.000 kPa
};

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'board-fault-shot-'));
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

/** One TRUSTED keystroke, the way OD-P's terminal expects them.
 *
 * ⚠️⚠️ A PRINTABLE CHARACTER CARRIES **NO VIRTUAL KEY CODE**, AND THAT IS A CORRECTION THIS
 * HARNESS MEASURED RATHER THAN INHERITED. The pattern in `moss-gate-shot.mjs` /
 * `pod-bay-shot.mjs` sets `windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0)`, which is fine
 * for letters and digits and WRONG for punctuation: `'.'` is char code 46, which is **VK_DELETE**,
 * so Chrome performs a forward delete instead of inserting the character. Measured on the shipping
 * prompt: `set vent_d1.rate max` arrived as `set vent_d1rate max` and the console answered
 * `SET EXPECTS <DEVICE>.<PROPERTY> <VALUE>` — a harness bug that reads exactly like a game bug.
 * Those two tools never type punctuation, so the defect was latent there; it is FILED, not fixed
 * here. With `text` alone the character is inserted and the client's terminal still sees
 * `e.key === '.'`. */
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
/** Type one command at the MOSS prompt and return ONLY the lines it added.
 *  ⚠️ The transcript ACCUMULATES, so returning all of it would let an earlier command's refusal
 *  satisfy — or contradict — a later command's assertion. Both directions bit once. */
async function prompt(line) {
  const before = (await evaluate(`document.querySelectorAll('.moss-cline').length`)) || 0;
  await type(line); await key('Enter'); await sleep(1500);
  const all = json(`[...document.querySelectorAll('.moss-cline')].map((e)=>[e.className,e.textContent])`);
  return ((await all) || []).slice(before);
}
const errLines = (t) => t.filter(([c]) => /\berr\b/.test(c)).map(([, s]) => s);
const outLines = (t) => t.filter(([c]) => !/\berr\b/.test(c)).map(([, s]) => s);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
// THE ONBOARDING CARD, DISMISSED AND VERIFIED GONE (shared helper, 2026-08-03). The one-shot
// this replaces could SILENTLY SKIP a card that had not painted yet, and every click below
// then landed on a full-screen modal instead of the ship.
await dismissOnboarding({ centre, clickAt, evaluate, log, chrome });

// ───────────────────────────── STEP 1 — the dead deck, and a vent that is NOT broken
log('\nSTEP 1 — deck 1 reads 0.000 kPa, and the vent draws its INTACT art');
const v0 = ventRow();
check(!!v0, 'vent_d1 is on the devices channel at ' + VENT_XY.join(','));
if (v0) {
  // 0.62 quantised to a byte is ~158/255. The machine is FINE — that is the point of the beat, and
  // a client that tinted it as damaged would send every player to order a repair that does nothing.
  log('  vent_d1 wire row [x,y,deck,kind,cond,oper,open] =', JSON.stringify(v0));
  check(v0[4] >= 140, 'vent_d1 reads a HEALTHY condition byte (' + v0[4] + '/255 — 0.62 authored)');
  check(v0[5] === 1, 'vent_d1 reads OPERATIONAL — the machine is not what is broken');
  check(v0[6] === 1, 'vent_d1 reads OPEN — its shutter is already up');
}
check(hallKPa() >= 0 && hallKPa() < 0.001, HALL + ' holds 0.000 kPa at boot (read ' + hallKPa() + ')');

// The deck rail to deck 1, then a screenshot of the compartment as the player first meets it.
const rail1 = await centre('[data-ov-deck="1"]');
if (rail1) { await clickAt(rail1.x, rail1.y); await sleep(2000); }
else check(false, 'the Overview deck rail has no deck-1 button (re-point the selector)');
await png('01-deck1-dead-and-the-vent-is-intact.png');

// ───────────────────────────── STEP 2 — repair term_moss so the console answers at all
log('\nSTEP 2 — turn REPAIR on and let her service term_moss (OD-N: the console needs a live server)');
const deck0 = await centre('[data-ov-deck="0"]');
if (deck0) { await clickAt(deck0.x, deck0.y); await sleep(1200); }
const workTab = await centre('[data-ov-tab="work"]');
if (!workTab) { check(false, 'no WORK tab on the Overview'); } else { await clickAt(workTab.x, workTab.y); await sleep(1500); }
const cellSel = '.ov-workcell[data-ov-work-type="0"]';   // WORK_COLUMNS[0] === REPAIR
const wcell = await centre(cellSel);
if (!wcell) { check(false, 'the WORK tab exposes no REPAIR cell to click (re-point `cellSel`)'); }
else { await clickAt(wcell.x, wcell.y); await sleep(1200); }
const spd = await centre('[data-ov-speed-up]');
for (let i = 0; i < 4; i++) { if (spd) { await clickAt(spd.x, spd.y); await sleep(200); } }
log('  term_moss cond at boot:', mossCond());
let lit = false;
for (let i = 0; i < 240 && !lit; i++) {
  await sleep(1000);
  if (mossCond() >= 52) lit = true;                     // Terminal `maintain` 0.20 => 51/255
  if (i % 30 === 29) log('    …', i + 1, 's, term_moss cond =', mossCond());
}
check(lit, 'the crew SERVICED term_moss above its `maintain` floor (cond ' + mossCond() + '/255)');

// ───────────────────────────── STEP 3 — MOVE 1: the switch is dead, and it says why
log('\nSTEP 3 — MOVE 1: `open vent_d1` is refused, and the sentence names the BOARD');
const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) { check(false, 'no MOSS tab on the Overview'); } else { await clickAt(mossTab.x, mossTab.y); await sleep(2500); }
const box = await centre('.moss-input');
if (box) await clickAt(box.x, box.y);
await sleep(400);

const t1 = await prompt('open vent_d1');
const e1 = errLines(t1);
log('  transcript(err):', JSON.stringify(e1.slice(-3)));
check(e1.some((s) => /CONTROLLER FAULT/.test(s) && /BOARD UNRESPONSIVE/.test(s)),
  'the refusal is CONTROLLER FAULT — BOARD UNRESPONSIVE');
check(!e1.some((s) => /MOSS IS OFFLINE/.test(s)),
  'and it is NOT the ship gate — the console is repaired, so this is the TARGET talking');
check(!outLines(t1).some((s) => /QUEUED OPEN\(VENT_D1\)/i.test(s)),
  'the console did NOT report the line as QUEUED — a shutter that never moved must not be reported moved');
check(t1.some(([c]) => /echo/.test(c)), 'the line the player typed is echoed — it is a terminal');
await png('02-move1-controller-fault.png');

// ───────────────────────────── STEP 4 — MOVE 2: the puff. THE TEACHING MOMENT.
log('\nSTEP 4 — MOVE 2: `set vent_d1.rate max` is ACCEPTED, the gauge ticks up … and STALLS');
const kPaBefore = hallKPa();
const t2 = await prompt('set vent_d1.rate max');
check(outLines(t2).some((s) => /QUEUED SET\(VENT_D1\.RATE/i.test(s)),
  'the rate write is ACCEPTED and reported QUEUED — the fault is a dead SWITCH, not a dead device');
check(!errLines(t2).some((s) => /CONTROLLER FAULT/.test(s)),
  'and it is NOT refused — refusing it here would delete the workaround');
await sleep(4000);
const kPaPuff = hallKPa();
log(`  ${HALL}: ${kPaBefore} -> ${kPaPuff} kPa`);
check(kPaPuff > kPaBefore, 'the hall\'s pressure VISIBLY ticked up — the puff is on the screen');
await sleep(20000);
const kPaStalled = hallKPa();
log(`  ${HALL} 20 s later: ${kPaStalled} kPa`);
check(Math.abs(kPaStalled - kPaPuff) < 0.01,
  'and then it STALLED — the board does not hold its setting. This is the diagnosis the program answers.');
check(kPaStalled < 5, 'the puff is nowhere near breathable (' + kPaStalled + ' kPa) — one line is not a fix');
await png('03-move2-the-puff-then-nothing.png');

// ───────────────────────────── STEP 5 — commission (DRIVEN at the wire; see the header)
log('\nSTEP 5 — commission term_moss (DRIVEN: the ordinary `commission` wire command, price 0)');
ws.send(JSON.stringify({ cmd: 'commission', x: MOSS_XY[0], y: MOSS_XY[1], deck: 0 }));
await sleep(3000);

// ───────────────────────────── STEP 6 — MOVE 3: the two-line program
log('\nSTEP 6 — MOVE 3: type the two-line program on the PROGRAM screen and install it');
const box2 = await centre('.moss-input');
if (box2) await clickAt(box2.x, box2.y);
await sleep(300);
const t3 = await prompt('prog term_moss');
check(!errLines(t3).some((s) => /NOT COMMISSIONED/.test(s)),
  'the PROGRAM screen opens on a COMMISSIONED terminal (OD-N: repair opens the console, a module opens programs)');
await sleep(1500);
// ⚠️ `prog <terminal>` OPENS THE DIRECTORY; IT DOES NOT SELECT A ROW. The editor mounts only once
// `selectProgram(tid)` has run, and on this screen that is a CLICK on the terminal's row
// (`moss-screen.js` `_renderProgram`). Measured: after `prog term_moss` the directory lists
// `term_moss DECK 0` / `term_nav DECK 1` and `.moss-prog-code` does not exist yet.
const dirRows = await json(`[...document.querySelectorAll('.moss-prog-row')].map((e)=>e.dataset.id)`) || [];
log('  PROGRAM directory:', JSON.stringify(dirRows));
check(dirRows.includes('term_moss'), 'the PROGRAM directory lists term_moss');
const rowIdx = dirRows.indexOf('term_moss');
if (rowIdx >= 0) {
  const rowBox = await centre('.moss-prog-row:nth-of-type(' + (rowIdx + 1) + ')');
  if (rowBox) { await clickAt(rowBox.x, rowBox.y); await sleep(2000); }
}
const editor = await centre('.moss-prog-code');
check(!!editor, 'the PROGRAM editor textarea is on the screen');
if (editor) {
  await clickAt(editor.x, editor.y);
  await evaluate('var t=document.querySelector(".moss-prog-code"); t.focus(); t.setSelectionRange(t.value.length, t.value.length); true');
  // Clear whatever draft is there, then type the workaround with TRUSTED keys.
  await evaluate('var t=document.querySelector(".moss-prog-code"); t.select(); true');
  for (const ch of 'every 1s:') { await key(ch); await sleep(10); }
  await key('Enter'); await sleep(40);
  for (const ch of '  set(vent_d1.rate, max)') { await key(ch); await sleep(10); }
  await sleep(600);
  const typed = await evaluate('document.querySelector(".moss-prog-code").value');
  log('  editor buffer now:', JSON.stringify(typed));
  check(/every\s+1s\s*:/.test(typed || '') && /set\(vent_d1\.rate,\s*max\)/.test(typed || ''),
    'the two-line program is in the editor, typed with trusted keys');
  await png('04-move3-the-program.png');
  const install = await centre('.moss-prog-install');
  check(!!install, 'the PROGRAM screen offers an Install control');
  if (install) { await clickAt(install.x, install.y); await sleep(2500); }
  // The DIAGNOSTICS LIST on the shipping screen — read off the DOM, not off a `window.__moss`
  // global. That global belongs to `client/tools/moss-preview.html`; the shipping page has none,
  // and reading it here would make this check pass by being `undefined`.
  const diags = await json(`[...document.querySelectorAll('.moss-prog-diag')].map((e)=>e.textContent)`) || [];
  log('  diagnostics:', JSON.stringify(diags));
  check(!diags.some((d) => /error/i.test(d)), 'the program COMPILED (no error diagnostics)');
}

// ───────────────────────────── STEP 7 — the hall pressurises past breathable AND STAYS
log('\nSTEP 7 — the hall pressurises past breathable, and STAYS there');
let crossed = 0;
for (let i = 0; i < 180 && !crossed; i++) {
  await sleep(1000);
  if (hallKPa() >= 80) crossed = i + 1;
  if (i % 20 === 19) log('    …', i + 1, 's,', HALL, '=', hallKPa(), 'kPa');
}
check(!!crossed, HALL + ' crossed 80 kPa (' + hallKPa() + ' kPa after ' + crossed + ' s of wall clock)');
await sleep(15000);
check(hallKPa() >= 80, 'and it STAYS above 80 kPa — the program is a heartbeat, not a one-shot ('
  + hallKPa() + ' kPa)');
// ⭐ THE WHOLE BEAT ON ONE SCREEN — the refusal, the puff and the installed program in the same
// transcript, which is what makes it an inference rather than three unrelated facts.
await png('05-all-three-moves-in-one-transcript.png');

// ⚠️ MOSS IS A BODY-LEVEL TAKEOVER: while it is up the Overview's deck rail is not on screen at
// all, so a click at the rail's coordinates hits nothing and the "the deck breathes" picture would
// be another picture of the console. ESC is a STACK key (it survives OD-P's terminal, which owns
// only printable characters), so unwind the MOSS screen stack first and then leave.
for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(500); }
await sleep(1500);
const rail1b = await centre('[data-ov-deck="1"]');
check(!!rail1b, 'ESC left MOSS and the Overview deck rail is reachable again');
if (rail1b) { await clickAt(rail1b.x, rail1b.y); await sleep(2500); }
// ⚠️ THE `2 PRES` LENS IS REQUIRED FOR THIS PICTURE TO SHOW ANYTHING, AND THAT IS A PRE-EXISTING
// FILED LIMIT, NOT THIS PACKAGE'S. The default Overview carries NO pressure indication at all
// (MECHANICS §13.23 (b): "the Level-1 Overview carries no vacuum indication outside the 2 PRES
// lens", an OWNER call left open) — so on the default lens a breathing hall and an airless one are
// pixel-identical. Driven and recorded here rather than passed over: the first draft of this
// harness photographed the default lens and produced a picture indistinguishable from boot.
const pres = await centre('[data-ov-lens="pressure"]');
check(!!pres, 'the Overview offers the PRES lens');
if (pres) { await clickAt(pres.x, pres.y); await sleep(2000); }
await png('06-the-deck-breathes.png');

// ───────────────────────────── STEP 8 (the lesson) — the `when` variant stalls again
log('\nSTEP 8 (optional, the lesson) — swap `every` for `when` and the hall stops being held');
log('  SKIPPED BY DEFAULT: the hall is already at nominal, so a stalled `when` is indistinguishable');
log('  from a working one until the air leaves — and nothing on this ship removes it. The claim is');
log('  driven instead in BoardFaultTests.TheWhenVariantFiresOnce_AndTheHallStallsAgain, from 0.000 kPa.');

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
