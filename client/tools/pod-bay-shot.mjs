#!/usr/bin/env node
// ⭐⭐ M3-4 / THE POD BAY — "who is aboard, and what stands between you and the next person",
// driven in real Chrome against the running game. This is the package's acceptance script,
// automated so a reviewer can re-run it instead of re-typing it. It is also the M3 milestone
// demo's spine (§8 of the charter).
//
// WHAT ONLY THIS TOOL CAN SEE. `WebPodBayTests` drives the host and the sim directly;
// `moss-model.test.js` / `moss-screen.test.js` drive the model and the DOM. None of them can see:
//   1. THAT ALL THREE OD-N MOSS STATES ARE READABLE IN ONE SITTING — the DARK refusal, the
//      REPAIRED-but-uncommissioned refusal that names COMMISSIONING, and the COMMISSIONED bay —
//      in the real stylesheet, on the real screen, in the order a player meets them.
//   2. THAT TWELVE ROWS FIT AND ALIGN. A monospace table proven in a DOM stub is a string
//      assertion; a column that wraps at 1600px is a different picture entirely.
//   3. THAT THE BADGE COUNTS. The bay is a request/reply op with a client-side poll; only a real
//      clock shows a cycling capsule's minutes actually moving.
//
// ⚠️ IT TYPES. OD-P made the MOSS console a terminal: no letter hotkeys, every printable character
// types into the prompt, ENTER submits. Every command below is dispatched as TRUSTED key events
// over CDP, exactly as a player produces them.
//
// ⚠️⚠️ ONE THING IS DRIVEN AND NOT PLAYED, AND IT IS SAID OUT LOUD BECAUSE IT MATTERS.
// Commissioning `term_moss` costs one `ControllerModule`, and the wreck authors NONE: the module is
// 2 Parts ← 4 Scrap ← 8 Regolith, three benches deep, behind two doors, across the pressure
// frontier. That chain is the OPENING OF THE GAME and it is tens of sim-hours of ordered work —
// not a five-minute acceptance run. So this harness starts the host against a TEMPORARY DEFS
// OVERLAY in which `build.def commission_cost = 0` (`--prep` writes it), and commissions through
// the ordinary `commission` wire command a player's own click sends.
//   · The SHIP is the shipping ship. The GATE is the shipping gate. The SCREEN is the shipping
//     screen. The only thing changed is the PRICE of the one step that cannot be automated —
//     the overlay is a COMPLETE copy of content/core/SimDefs, `rules/*.moss` included, with one
//     integer edited. (An earlier draft skipped `rules/`, which booted the acceptance host with no
//     designer rules and made this very sentence untrue; the copy is now verified file-for-file.)
//   · Everything else — the repair, both refusals, the bay, the thaw, the cycle — is played.
//   · A reviewer who wants the unmodified price runs step 5 by hand after playing the chain.
//
// USAGE
//   1. node client/tools/pod-bay-shot.mjs --prep          # writes the temp defs, prints the host cmd
//   2. <the printed host command>                          # and, beside it: python3 client/serve.py 8391
//   3. node client/tools/pod-bay-shot.mjs --out docs/design/shots [--host-port 8390] [--client-port 8391]
//
// Exits non-zero on any failed check. NOT wired into ./ci.sh: it needs a browser and a running
// host, and the gate stays browser-free (the moss-shot.mjs / moss-gate-shot.mjs rule).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'podbay-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9361');
const REPO = resolve(new URL('../..', import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ───────────────────────────── --prep: the temp defs overlay, and nothing else
if (has('prep')) {
  const src = join(REPO, 'content', 'core', 'SimDefs');
  const dst = mkdtempSync(join(tmpdir(), 'podbay-defs-'));
  // ⚠️ THE OVERLAY IS A COMPLETE COPY, SUBDIRECTORIES INCLUDED, AND THAT IS NOT PEDANTRY.
  // The first draft skipped directories under the comment "the loader only reads *.def", which is
  // FALSE: `Sim.Dsl/RulesLoader.cs:22-25` reads `<defsDir>/rules/*.moss`, so the acceptance host
  // booted with NO designer rules — `overheat_guard.moss` missing, `DesignerRuleSystem` carrying
  // nothing — while this file's header claimed the only change was the commissioning price. The
  // package's own honesty instrument was the thing telling a small lie.
  let copied = 0, rulesCopied = 0;
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) {
      mkdirSync(join(dst, e.name), { recursive: true });
      for (const f of readdirSync(join(src, e.name))) {
        copyFileSync(join(src, e.name, f), join(dst, e.name, f));
        rulesCopied += 1;
      }
    } else { copyFileSync(join(src, e.name), join(dst, e.name)); copied += 1; }
  }
  // Proven, not assumed: a silent skip is exactly what went wrong once already.
  const wantRules = readdirSync(join(src, 'rules')).length;
  if (rulesCopied !== wantRules) {
    console.error(`FAIL: copied ${rulesCopied} of ${wantRules} files under rules/`); process.exit(2);
  }
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
  log('\nthen: node client/tools/pod-bay-shot.mjs --out docs/design/shots');
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

// term_moss's tile, from the ship's own authoring (`AuthoredShips.cs:2059` — the cryo bay's west
// wall at its centre row). Used to read its condition off the independent socket AND to address the
// commission click, exactly as a player's own click on that tile does.
const MOSS_XY = [1, 3];
const mossCond = () => {
  const cells = latest.get('devices')?.cells || [];
  const row = cells.find((c) => c[0] === MOSS_XY[0] && c[1] === MOSS_XY[1] && c[2] === 0);
  return row ? row[4] : -1;   // [x,y,deck,kind,COND,oper,open]
};

// ───────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'pod-bay-shot-'));
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

/** One TRUSTED keystroke, the way OD-P's terminal expects them. */
async function key(k) {
  const printable = k.length === 1;
  const base = { key: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0) };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: printable ? k : (k === 'Enter' ? '\r' : undefined) });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function type(line) { for (const ch of line) { await key(ch); await sleep(12); } }
async function prompt(line) {
  await type(line);
  await key('Enter');
  await sleep(1400);
  return json(`[...document.querySelectorAll('.moss-cline')].map((e)=>[e.className,e.textContent])`) || [];
}
const errLines = (t) => t.filter(([c]) => /\berr\b/.test(c)).map(([, s]) => s);
/** ⭐ WHICH SCREEN DID IT DRAW? `moss-screen.js:render` stamps it; a transcript line is not a screen. */
const screenNow = () => evaluate(`document.getElementById('moss-view')?.dataset?.screen || ''`);
/** The bay as PIXELS: one array per row, straight off the elements the player is looking at. */
const bayRows = () => json(
  `[...document.querySelectorAll('.moss-podrow')].map((e)=>({`
  + `pod:e.dataset.pod, can:e.dataset.can, cls:e.className,`
  + `num:e.querySelector('.c-podnum')?.textContent?.trim(),`
  + `who:e.querySelector('.c-occupant')?.textContent?.trim(),`
  + `state:e.querySelector('.c-podstate')?.textContent?.trim(),`
  + `why:e.querySelector('.c-podwhy')?.textContent?.trim(),`
  + `thaw:!!e.querySelector('.moss-thaw')}))`);

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
for (let i = 0; i < 15; i++) {          // dismiss the onboarding card if it mounted
  const onb = await centre('[data-onb-begin]');
  if (onb) { await clickAt(onb.x, onb.y); await sleep(1500); break; }
  await sleep(1000);
}

// ───────────────────────────── STEP 1 — the DARK ship: `pods` is refused, MOSS IS OFFLINE
log('\nSTEP 1 — on a DARK ship, PODS is refused in the SHIP\'s words (worst-first)');
const mossTab = await centre('[data-ov-tab="moss"]');
if (!mossTab) { console.error('FAIL: no MOSS tab on the Overview'); failures += 1; }
else { await clickAt(mossTab.x, mossTab.y); await sleep(2500); }
const box = await centre('.moss-input');
if (box) await clickAt(box.x, box.y);
await sleep(400);

const t1 = await prompt('pods');
const e1 = errLines(t1);
log('  transcript(err):', JSON.stringify(e1.slice(-2)));
check(e1.some((s) => /MOSS IS OFFLINE/.test(s)), 'the refusal names MOSS as OFFLINE');
check(!e1.some((s) => /CONTROLLER MODULE/.test(s)),
  'and NOT the commissioning sentence — a dark ship must not send the player to a machine shop');
check((await screenNow()) !== 'podbay', 'and NO empty POD BAY was drawn beside it');
await png('01-dark-refused.png');

// ───────────────────────────── STEP 2 — repair term_moss with a DIRECT ORDER (played)
// ⭐ THE RIGHT-CLICK, NOT THE WORK TAB, AND THAT IS A CORRECTION THIS RUN EARNED.
// The first draft turned the REPAIR work type on and let the maintenance board run. MEASURED, twice:
// the pawn works the whole board, and by the time `term_moss` is in service she has spent SIX of the
// wreck's ten Seals on other machines and is CARRYING the remaining four — so every rung reads
// `SHIP HAS 0` (a rung reads LOOSE stock) with the matter still aboard, and the ladder's first rung
// is unreachable in the run that just unlocked it. A DIRECT ORDER repairs one machine, spends one
// consumable and leaves the rest on the deck — which is also the loop this whole project is about.
// (The board-runs-the-larder-down behaviour is filed for the owner; it is not this package's to fix.)
log('\nSTEP 2 — order the repair of term_moss directly (right-click ▸ Prioritise, M2-10)');
for (let i = 0; i < 4; i++) { await key('Escape'); await sleep(400); }
await sleep(1200);
const spd = await centre('[data-ov-speed-up]');
for (let i = 0; i < 2; i++) { if (spd) { await clickAt(spd.x, spd.y); await sleep(250); } }   // 20x
const seals = () => (latest.get('ledger')?.matter || []).find((m) => m[0] === 'Seals')?.[1] ?? 0;
// ⚠️ THE ORDER IS SENT AS ITS OWN WIRE MESSAGE, and the reason is stated rather than hidden.
// `Cmd.prioritise(cid, x, y, deck)` is EXACTLY what the Room Zoom's right-click ▸ Prioritise emits
// (`roomzoom-view.js:1436`); the menu that emits it is M2-10's, was accepted in the browser then,
// and is pinned by `client/test/prioritise-menu.test.js` including the capture-phase argument.
// Reproducing the GESTURE here would mean re-deriving the zoom's canvas→tile projection in this
// tool — a second copy of a mapping nothing else owns — and CDP's synthetic right-click does not
// raise `contextmenu` in headless Chrome (measured: 300+ probes across the canvas, menu never
// opened). So the tool sends the ORDER and the SIM plays everything after it: the walk, the job,
// the consumable, the repair.
const roster = latest.get('roster');
const cid = roster?.crew?.[0]?.cid;
check(!!cid, 'the roster names the one soul aboard (cid ' + cid + ')');
ws.send(JSON.stringify({ cmd: 'prioritise', cid, x: MOSS_XY[0], y: MOSS_XY[1], deck: 0 }));
await sleep(600);
log('  term_moss cond at boot:', mossCond(), '· Seals aboard:', seals());
let lit = false;
for (let i = 0; i < 1600 && !lit; i++) {
  await sleep(250);
  if (mossCond() >= 52) lit = true;            // 0.20 maint ⇒ 51/255
  if (i % 80 === 79) log('    …', ((i + 1) / 4) | 0, 's, term_moss cond =', mossCond(), '· Seals', seals());
}
check(lit, 'ONE ORDER put term_moss above its `maintain` floor (cond ' + mossCond() + '/255)');
log('  after the order: Seals aboard =', seals(), '(ten at boot)');
check(seals() >= 8,
  'the direct order spent ONE consumable and left the rest on the deck — the ladder SURVIVES the ' +
  'repair that unlocked it (Seals ' + seals() + '/10). Step 5\'s READY rows are the other half of ' +
  'this claim: they are what the maintenance-board run could not produce.');
// ONE step down (20x → 5x): fast enough that a 240 sim-second cycle is ~48 wall-seconds and the
// badge visibly counts, slow enough that step 7 can ask a second capsule before it finishes.
const dn = await centre('[data-ov-speed-dn]');
if (dn) { await clickAt(dn.x, dn.y); await sleep(250); }


// ───────────────────────────── STEP 3 — the REPAIRED state: the refusal now names COMMISSIONING
log('\nSTEP 3 — the console RUNS and the bay still refuses — naming what to MAKE next');
const mossTab2 = await centre('[data-ov-tab="moss"]');
if (mossTab2) { await clickAt(mossTab2.x, mossTab2.y); await sleep(2000); }
const box2 = await centre('.moss-input');
if (box2) await clickAt(box2.x, box2.y);
await sleep(400);
const t3 = await prompt('pods');
const e3 = errLines(t3);
log('  transcript(err):', JSON.stringify(e3.slice(-2)));
check(e3.some((s) => /NOT COMMISSIONED/.test(s) && /CONTROLLER MODULE/.test(s)),
  'the middle state names COMMISSIONING and the module');
check(!e3.slice(-1).some((s) => /MOSS IS OFFLINE/.test(s)),
  'and no longer reads as the DARK sentence — the two tiers are not confusable');
check((await screenNow()) !== 'podbay', 'still no empty POD BAY');
await png('02-repaired-refused.png');

// ───────────────────────────── STEP 4 — commission (DRIVEN at the wire; see the header)
log('\nSTEP 4 — commission term_moss (DRIVEN: the ordinary `commission` wire command, price 0)');
ws.send(JSON.stringify({ cmd: 'commission', x: MOSS_XY[0], y: MOSS_XY[1], deck: 0 }));
await sleep(2500);

// ───────────────────────────── STEP 5 — the COMMISSIONED bay
log('\nSTEP 5 — the POD BAY: twelve capsules, and every closed one says why');
const t5 = await prompt('pods');
check((await screenNow()) === 'podbay', 'the typed command reached the POD BAY screen');
const rows = (await bayRows()) || [];
log('  rows:', rows.length);
for (const r of rows) log(`    ${String(r.num).padStart(2)}  ${String(r.who).padEnd(12)} ${String(r.state).padEnd(10)} ${r.why}${r.thaw ? '  [THAW]' : ''}`);
check(rows.length === 12, 'twelve capsules are drawn (' + rows.length + ')');
check(rows.filter((r) => r.state === 'NO SIGNAL').length === 4, 'four read NO SIGNAL');
check(rows.filter((r) => r.state === 'OPEN').length === 1, 'one reads OPEN');
const sealed = rows.filter((r) => r.state === 'SEALED');
check(sealed.length === 7, 'seven read SEALED (' + sealed.length + ')');
check(sealed.every((r) => r.why && r.why !== '—'), '⭐ every SEALED row states WHY — the OD-L column');
check(sealed.every((r) => /\d/.test(r.why || '')), '…and carries the NUMBER that produced it');
check(rows.every((r) => (r.thaw ? r.can === '1' : true)),
  '[THAW] appears only where the GATE allows it');
const header = await evaluate(`document.querySelector('.moss-podterm')?.textContent || ''`);
log('  header:', header);
check(/COMMISSIONED/.test(header || ''), 'the header states WHICH of the three MOSS states it is in');
await png('03-pod-bay.png');

// ───────────────────────────── STEP 6 — thaw the READY capsule; the badge counts
log('\nSTEP 6 — thaw the capsule whose reason is READY, and watch it cycle');
// ⚠️ WAIT FOR THE PAWN TO LET GO OF THE SEALS, and this is worth watching rather than sleeping
// through: the ledger says 4 Seals are aboard while the bay says SHIP HAS 0, because a rung reads
// LOOSE stock and the crew member still has the rest RESERVED for maintenance jobs she has not
// finished. That is the very distinction the headroom note is labelled for, happening live.
let ready = rows.find((r) => r.thaw);
for (let i = 0; i < 30 && !ready; i++) {
  await sleep(2000);
  const now = (await bayRows()) || [];
  ready = now.find((r) => r.thaw);
  if (i % 5 === 4) log('    …still no offer; rung-1 row reads:',
    JSON.stringify(now.find((r) => /1 SEALS/.test(r.why || ''))?.why));
}
if (ready) log('  offered:', ready.who, '·', ready.why);
check(!!ready, 'at least one capsule is offered ([THAW] on ' + (ready ? ready.who : 'nobody') + ')');
if (ready) {
  await prompt('thaw ' + ready.num);
  await sleep(2500);
  const after = (await bayRows()) || [];
  const it = after.find((r) => r.pod === ready.pod);
  log('  ' + ready.who + ' now reads:', it && it.state, '·', it && it.why);
  check(!!it && it.state === 'CYCLING', 'the capsule is CYCLING');
  const firstWhy = it ? it.why : '';
  await png('04-cycling.png');

  // The badge is a countdown, not a label: the poll must move it.
  let moved = false;
  for (let i = 0; i < 30 && !moved; i++) {
    await sleep(1000);
    const now = ((await bayRows()) || []).find((r) => r.pod === ready.pod);
    if (now && now.why && now.why !== firstWhy) { moved = true; log('  badge moved:', firstWhy, '→', now.why); }
  }
  check(moved, '⭐ the badge COUNTS — the bay re-asks and the number moves');

  // STEP 7 — a second capsule mid-cycle is refused, and the sentence names the busy one.
  log('\nSTEP 7 — a second thaw mid-cycle is refused, by name');
  const other = ((await bayRows()) || []).find((r) => r.state === 'SEALED' && r.pod !== ready.pod);
  if (!other) { check(false, 'no other sealed capsule to ask for'); }
  else {
    const t7 = await prompt('thaw ' + other.num);
    const e7 = errLines(t7);
    log('  transcript(err):', JSON.stringify(e7.slice(-1)));
    check(e7.some((s) => /IS CYCLING/.test(s)), 'the refusal says the bay is busy, and names who');
    await png('05-refused-cycling.png');
  }
}

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
