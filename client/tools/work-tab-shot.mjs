#!/usr/bin/env node
// THE WORK TAB (M2-3) — the LIVE-PIXEL / LIVE-WIRE acceptance, driven in real Chrome against the
// running game. It is the charter's browser sequence, automated so a reviewer can re-run it.
//
// WHY IT EXISTS AND WHAT ONLY IT CAN SEE. `client/test/overview-model.test.js` drives the real
// controller, but over `dom-lite` — a stub that parses no markup, computes no styles and applies no
// event defaults. Three of this package's claims are outside what any node harness can answer:
//   1. THE CELL IS VISIBLE AND READS `off`, not `0`, with real CSS applied. "Invisible feedback is
//      FUNCTIONAL" is binding here (it has cost this repo three owner reports): a control the player
//      cannot see is indistinguishable from a broken one, and dom-lite cannot tell them apart.
//   2. THE CLICK LANDS THROUGH THE REAL EVENT PATH, on a node the 10 Hz repaint keeps replacing.
//      That is BUG-B's exact hazard on this surface, and only a browser fires (or fails to fire) the
//      trailing `click`.
//   3. THE VALUE SURVIVES A RELOAD, i.e. it came back over the WIRE and not out of anything this
//      page remembers. A reload is the only instrument that can distinguish those two, and a node
//      harness has no page to reload.
//   4. ⭐ M3-12 — THE SKILL CORNER IS VISIBLE, AND A ROW WITH A MISSING CELL STILL LINES UP. The
//      first is the same "invisible feedback is FUNCTIONAL" rule applied to an 8 px number in the
//      corner of a 58 px box; the second is a CSS-GRID question that no harness without a layout
//      engine can answer, and one whose failure leaves every ORDER correct while every BOX draws
//      under the wrong header. See STEP 3b.
// It also re-checks the placement pin against a REAL document: the island must be a descendant of
// `#overview-view`, not of the deprecated console `.app` shell.
//
// ⭐ ACCEPTANCE STEPS 4 AND 6 WERE DEFERRED BY NAME TO M2-2 (the work-type veto) AND ARE NOW
// DRIVEN HERE — M2-2 landed and claimed them, as this header said it would. Step 4 ("set Repair to
// 3 → she goes and repairs something") and step 6 ("set it back to off mid-service → she FINISHES
// that service, then takes nothing new") need a dispatcher that READS the grid; M2-3 merged FIRST,
// on purpose, because a grid nothing reads is inert and harmless while a veto with no grid is an
// unplayable game.
// ⛔ STEP 6 IS THE ONE TO WATCH RATHER THAN READ. It is the CLAIM-TIME ruling made visible: the
// veto is asked when a job is CLAIMED and never mid-job, so switching a work type off while a pawn
// is working does not drop her cargo or her service on the floor. It asserts THREE things, because
// "she stopped being busy" is satisfied by a job that was cancelled — she is still servicing right
// after the switch, a machine's condition measurably ROSE, and she then takes nothing new.
//
// USAGE
//   1. ./play.sh --host-port 8348 --client-port 8349 --no-open
//   2. node client/tools/work-tab-shot.mjs --out docs/design/shots [--host-port 8348] [--client-port 8349]
//
// Exits non-zero if the host will not answer, if the WORK tab cannot be opened, if a cell does not
// read `off` at boot, if the click does not reach the sim, or if the value does not survive a
// reload — a green run with no pictures is the failure this class of tool exists to prevent.
// It is NOT wired into ./ci.sh: it needs a browser and a running host, and the gate stays
// browser-free (same rule as moss-shot.mjs / operate-shot.mjs).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8348');
const CLIENT_PORT = +arg('client-port', '8349');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'worktab-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9337');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ────────────────────────────────────────────────────── 1. the ship over the wire (the sim's truth)
const latest = new Map();
let ws;
await new Promise((res, rej) => {
  ws = new WebSocket(`ws://localhost:${HOST_PORT}/ws`);
  ws.onopen = res; ws.onerror = () => rej(new Error('no host on ' + HOST_PORT));
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m?.type) latest.set(m.type, m); };
});
await sleep(2500);
const roster = latest.get('roster');
if (!roster?.crew?.length) { console.error('FAIL: no roster on the wire'); process.exit(2); }
const rell = roster.crew[0];
log('crew aboard:', roster.crew.map((c) => `${c.name} (cid ${c.cid}) — ${c.task}`).join(' | '));
// ⚠️ THE SIM'S OWN ANSWER, read off the channel and never off the page: if the payload is not empty
// at boot, every "the grid reads off" claim below is about a ship where it is TRUE for a different
// reason, and the guard would be passing vacuously.
const bootWork = latest.get('work');
log('`work` at boot:', JSON.stringify(bootWork));
check(Array.isArray(bootWork?.cells) && bootWork.cells.length === 0,
  'OD-H: the `work` payload is EMPTY at boot — every work type is off for every soul');

// ────────────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'worktab-shot-'));
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
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 2 } } : { format: 'png' });
  const data = r.result?.data;
  if (!data) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('  wrote', p);
  return p;
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** Every WORK cell of the first row, as the PLAYER sees it: text, state class, and the two facts a
 *  node harness cannot supply — is it laid out at all, and what colour did the stylesheet resolve.
 *
 *  ⭐ M3-12 SPLIT THE CELL'S TEXT IN TWO and this reader followed. A cell now draws the PRIORITY
 *  glyph and her SKILL in that work type in two child spans, so `c.textContent` is their
 *  concatenation — `text` below reads `.ov-workprio` so every legacy `text === 'off'` check keeps
 *  asserting the same thing it always did, and `skill`/`skillW`/`skillH` are the new facts. The
 *  centre-x is carried too, because the M3-12 leg below is about WHERE a cell lands, not what it
 *  says. */
const cellsNow = async () => json(
  `[...document.querySelectorAll('.ov-worklist .ov-workrow')[0]?.querySelectorAll('.ov-workcell')||[]]`
  + `.map((c)=>{const r=c.getBoundingClientRect();const s=getComputedStyle(c);`
  + `const p=c.querySelector('.ov-workprio');const k=c.querySelector('.ov-workskill');`
  + `const kr=k?k.getBoundingClientRect():{width:0,height:0};`
  + `return {text:p?p.textContent:c.textContent,skill:k?k.textContent:null,`
  + `skillW:Math.round(kr.width),skillH:Math.round(kr.height),`
  + `skillColor:k?getComputedStyle(k).color:null,`
  + `cx:Math.round(r.x+r.width/2),cls:c.className,w:Math.round(r.width),h:Math.round(r.height),`
  + `color:s.color,border:s.borderStyle,cid:c.dataset.ovWorkCid,type:c.dataset.ovWorkType};})`);

/** The column headers' centre-x, in order — what a cell must line up with to be readable at all. */
const headerXs = async () => json(
  `[...document.querySelectorAll('.ov-workhead .ov-workcolhdr')]`
  + `.map((h)=>{const r=h.getBoundingClientRect();return Math.round(r.x+r.width/2);})`);

async function openWorkTab() {
  const tab = await centre('[data-ov-tab="work"]');
  if (!tab) { console.error('FAIL: there is no WORK tab button in the command bar'); process.exit(7); }
  await clickAt(tab.x, tab.y);
  await sleep(1200);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// The onboarding takeover swallows every click and every screenshot below it.
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }

// ── STEP 1: open the WORK tab ──
log('\nSTEP 1 — open the WORK tab');
await openWorkTab();
check(await evaluate(`document.querySelector('.ov-work') && !document.querySelector('.ov-work').hidden`),
  'the WORK island is on screen');
check(await evaluate(`document.body.classList.contains('overview-open')`),
  'the Overview is still the shown surface — the tab did NOT drop the player onto the console shell');
// THE PLACEMENT PIN, against a real document: an id census cannot see a re-parenting.
const parentId = await evaluate(`(document.querySelector('.ov-work')?.parentElement?.id)||'(none)'`);
check(parentId === 'overview-view',
  `the grid's parent is #${parentId} — it must be #overview-view (the standard surface)`);
await png('01-work-tab.png');

// ── STEP 2: a row of six columns, every cell `off` and visibly switched off ──
log('\nSTEP 2 — Rell has a row of six columns, every cell OFF');
const headers = await json(`[...document.querySelectorAll('.ov-workhead .ov-workcolhdr')].map(h=>h.textContent)`);
log('  columns:', JSON.stringify(headers));
check(JSON.stringify(headers) === JSON.stringify(['REPAIR', 'BUILD', 'CRAFT', 'STRIP', 'MINE', 'HAUL']),
  'the columns are OD-J\'s order: Repair · Construct · Craft · Deconstruct · Mine · Haul');
const rowName = await evaluate(`document.querySelector('.ov-worklist .ov-workrow .ov-workname')?.textContent||''`);
// `surnameOf` UPPERCASES (console-model.js:71) — the same derivation the CREW WATCH row uses, shared
// rather than re-spelled so the two docks cannot come to name the same soul differently.
check(rowName.length > 0 && rell.name.toUpperCase().includes(rowName),
  `the row is labelled '${rowName}' — the crew member the wire calls '${rell.name}'`);
const boot = await cellsNow();
log('  cells:', JSON.stringify(boot));
check(boot?.length === 6, 'the row carries six cells');
check(boot?.every((c) => c.text === 'off'), 'every cell reads `off`');
check(boot?.every((c) => c.text !== '0'), '⛔ and NOT "0" — a zero in a grid of numbers reads as a priority');
check(boot?.every((c) => c.cls.includes('off')), 'every cell carries the `off` state class');
check(boot?.every((c) => c.w > 0 && c.h > 0), 'every cell is actually laid out (non-zero box)');
check(boot?.every((c) => c.border === 'dashed'), 'the off cell renders visibly switched-off (dashed, not solid)');
check(JSON.stringify(boot?.map((c) => c.type)) === '["0","1","2","3","4","5"]',
  'each cell carries its own WorkType index, left to right');

// ── STEP 3: what the Overview says she is doing ──
log('\nSTEP 3 — what the Overview says she is doing');
const task = await evaluate(`document.querySelector('.ov-crewtask')?.textContent||'(no task line)'`);
log(`  CREW WATCH task line: '${task}'    (the host's own TaskLabel: '${rell.task}')`);
log('  ⚠️ REPORTED, NOT ASSERTED: OD-G\'s "the pawn boots idle and waiting" is M2-19/M2-20\'s subject,');
log('     not this package\'s. This line records what the shipped ship actually shows today.');

// ══════════════════════════════════════════════════════════ M3-12: THE SKILL CORNER AND THE GAP
// ⭐ WHAT ONLY A BROWSER CAN ANSWER HERE, and it is not "does the number appear in the DOM" — the
// node harness settles that. It is:
//   (a) IS THE NUMBER ACTUALLY VISIBLE? `.ov-workskill` is 8 px, absolutely positioned in the corner
//       of a 58 px cell. "Invisible feedback is FUNCTIONAL" is binding in this repo (three owner
//       reports): a zero-height box, a clipped corner or a colour equal to the background is a
//       feature that shipped dead, and dom-lite computes no styles at all.
//   (b) DOES A ROW WITH A MISSING CELL STILL LINE UP UNDER ITS HEADERS? That is a CSS-GRID question.
//       `.ov-workrow` is a fixed six-column grid; an incapable soul's row has five children, and
//       under auto-placement the survivors slide one column left and every one of them draws under
//       the WRONG header. ⛔ The addressing stays correct, so no click test — in any harness — can
//       see it. Only a layout engine can.
log('\nSTEP 3b (M3-12) — her skill in each work type, and the cell that is not there');
const capsWire = latest.get('workcaps');
log('  `workcaps` on the wire:', JSON.stringify(capsWire));
const wireRow = (capsWire?.cells || []).find((c) => c[0] === rell.cid);
check(!!wireRow, 'the sim sends a `workcaps` row for this crew member');
const boot2 = await cellsNow();
log('  skill corners:', JSON.stringify(boot2?.map((c) => c.skill)));
check(boot2?.every((c) => c.skill !== null), 'every cell carries a skill corner');
// ⭐ THE NUMBER ON SCREEN IS THE SIM'S, checked against an INDEPENDENT SOCKET rather than against
// the page — the page is the thing under test.
check(!!wireRow && boot2?.every((c, i) => c.skill === String(wireRow[1 + i])),
  'every skill on screen is the level the `workcaps` channel sent for that work type');
check(boot2?.every((c) => c.skillW > 0 && c.skillH > 0),
  'the skill corner is actually LAID OUT (a zero box is a feature that shipped dead)');
check(boot2?.every((c) => c.skill === '0'),
  '⚠️ REPORTED AS WELL AS ASSERTED: every skill reads 0. MECHANICS §13.37.5 — nothing in the sim '
  + 'WRITES a skill yet, so this is the honest state of the ship, not a broken display. It is shown '
  + 'rather than hidden on purpose: a blank corner here would be indistinguishable from this '
  + 'feature never having landed.');
log('  skill colour:', boot2?.[0]?.skillColor, ' cell colour:', boot2?.[0]?.color);
// ⭐ THIS CHECK EARNED ITS KEEP ON ITS FIRST RUN. It caught the skill and the word `off` resolving to
// the SAME faint ink — 9 px against 8 px, no contrast between them — so a boot cell read as the
// single token "off0". Under OD-H every cell on screen is that cell.
check(boot2?.every((c) => c.skillColor !== c.color),
  'the skill is drawn in its own ink, distinct from the priority it sits beside — otherwise the two '
  + 'numbers in the box read as one token');
await png('07-skill-corners.png');

// ── the GAP, as a pure CSS-LAYOUT probe ──
// ⛔ HONESTY ABOUT WHAT THIS IS. `--ship wreck` sends `incapableMask = 0` for everyone (nothing in
// the sim writes `WorkIncapable` — §13.37.5), so the running game CANNOT produce an absent cell and
// no amount of playing would show one. The client logic that removes the cell is driven in
// `overview-model.test.js` against an authored two-soul fixture. What is unsettled there, and only
// here, is whether the STYLESHEET holds the remaining cells in their own columns — so this removes
// one cell from the live DOM directly and re-measures. It is a CSS experiment on the real page, and
// it is NOT a claim that the sim produced this state.
const hx = await headerXs();
log('  header centres:', JSON.stringify(hx));
check(boot2?.every((c, i) => Math.abs(c.cx - hx[i]) <= 1),
  'with all six cells present, each sits under its own column header');
// ⚠️ THE PROBE RUNS SYNCHRONOUSLY, IN ONE EXPRESSION — remove, force layout, measure, put back.
// The first version slept 400 ms between removing the cell and measuring, and by then `paintWork`
// had put it back: the grid compares its cell set against the DOM on every repaint, so it self-heals
// at ~10 Hz and a probe that pauses measures nothing. Reading `getBoundingClientRect()` inside the
// same task forces layout with the gap in place, which is the state a genuinely incapable soul's row
// would be in permanently.
const gapped = await json(
  `(()=>{const r=document.querySelectorAll('.ov-worklist .ov-workrow')[0];`
  + `const m=r.querySelector('.ov-workcell[data-ov-work-type="4"]');`
  + `const next=m?m.nextSibling:null;if(m)m.remove();`
  + `const out=[...r.querySelectorAll('.ov-workcell')].map((c)=>{const b=c.getBoundingClientRect();`
  + `return {type:c.dataset.ovWorkType,cx:Math.round(b.x+b.width/2)};});`
  + `if(m)r.insertBefore(m,next);return out;})()`);
log('  with MINE removed:', JSON.stringify(gapped));
check(gapped?.length === 5, 'the probe removed exactly one cell');
check(gapped?.every((c) => Math.abs(c.cx - hx[Number(c.type)]) <= 1),
  '⭐ EACH SURVIVING CELL STILL SITS UNDER ITS OWN HEADER. Without the per-work-type `grid-column` '
  + 'rules the five would shuffle left and HAUL would draw beneath MINE — every box in the row '
  + 'reading as the wrong work type, while every click it sent stayed correct.');
check((await cellsNow())?.length === 6, 'the grid is whole again after the probe');

// ⭐ AND A PICTURE OF THE GAP, for the one reviewer no test can replace. The measurement above is
// synchronous because the repaint heals the DOM; a screenshot cannot be. So the gap is held open
// with a stylesheet rule instead — `display:none` removes the cell from the grid's flow exactly as
// absence does, so the layout in the shot is the layout an incapable soul's row really has.
// ⛔ IT IS A PREVIEW, NOT A STATE THE GAME CAN REACH TODAY: `--ship wreck` sends
// `incapableMask = 0` for everyone (§13.37.5), so no play session can produce this until something
// WRITES an incapability. The DOM half is driven in `overview-model.test.js`.
await evaluate(
  `(()=>{const s=document.createElement('style');s.id='m312-gap-preview';`
  + `s.textContent='.ov-worklist .ov-workcell[data-ov-work-type="4"]{display:none}';`
  + `document.head.appendChild(s);return 1;})()`);
await sleep(500);
const island = await centre('.ov-work');
await png('08-absent-cell-preview.png', island
  ? { x: Math.max(0, island.x - island.w / 2 - 8), y: Math.max(0, island.y - island.h / 2 - 8),
    width: island.w + 16, height: island.h + 16 }
  : null);
// ⚠️ COUNTED BY LAYOUT, NOT BY DOM MEMBERSHIP. The preview hides the cell with `display:none`, so it
// is still a child — it simply has no box. `cellsNow()` counts children, so the check that the rule
// TOOK has to ask for a box, and the first draft asked for a count and reported a false FAIL.
const preview = await cellsNow();
const drawn = preview?.filter((c) => c.w > 0);
log('  preview row (MINE hidden):', JSON.stringify(preview?.map((c) => ({ t: c.type, cx: c.cx, w: c.w }))));
check(drawn?.length === 5,
  'the preview rule did not take — the shot above would show a full row and say nothing');
check(drawn?.every((c) => Math.abs(c.cx - hx[Number(c.type)]) <= 1),
  'the previewed row is not the layout an absent cell produces — the shot would mislead');
await evaluate(`(()=>{const s=document.getElementById('m312-gap-preview');if(s)s.remove();return 1;})()`);
await sleep(400);
check((await cellsNow())?.length === 6, 'the preview rule was removed again');

// ── STEP 4 and STEP 6 ARE NOW DRIVEN, AT THE END OF THIS FILE — M2-2 (the work-type veto)
//    landed and claimed them. They run last because they need the grid already SET, which is
//    what STEP 5's reload leaves behind. See 'STEP 4' below. ──

// ── STEP 5: set a cell, reload, and the value survives ──
log('\nSTEP 5 — set REPAIR, reload the page, the value survives');
const c0 = await centre('.ov-worklist .ov-workrow .ov-workcell');
await clickAt(c0.x, c0.y);
await sleep(900);
const after1 = await cellsNow();
log('  after one click:', after1?.[0]);
check(after1?.[0]?.text === '1', 'one click on an `off` cell sets priority 1 (the highest)');
check(after1?.[0]?.cls.includes('set'), 'the cell now carries the `set` state class');
check(JSON.stringify(latest.get('work')?.cells) === JSON.stringify([[rell.cid, 0, 1]]),
  'THE SIM HOLDS IT: the `work` channel on an independent socket carries [cid, 0, 1]');
await clickAt(c0.x, c0.y); await sleep(700);
await clickAt(c0.x, c0.y); await sleep(900);
const after3 = await cellsNow();
check(after3?.[0]?.text === '3', 'two more clicks walk the cycle to 3');
await png('02-repair-at-3.png');

log('  reloading…');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);
const onb2 = await centre('[data-onb-begin]');
if (onb2) { await clickAt(onb2.x, onb2.y); await sleep(2500); }
await openWorkTab();
const reloaded = await cellsNow();
log('  after the reload:', JSON.stringify(reloaded?.map((c) => c.text)));
check(reloaded?.[0]?.text === '3',
  'the value SURVIVED the reload — it came back over the wire, not out of local state');
check(reloaded?.slice(1).every((c) => c.text === 'off'),
  'and only the column that was set survived — the other five are still off');
await png('03-after-reload.png');

// ══════════════════════════════════════════════════════════ M2-2: STEP 4 and STEP 6, DRIVEN
// The two steps M2-3 deferred BY NAME to the work-type veto, because they need a dispatcher that
// READS the grid. STEP 5 above left REPAIR at 3 and the other five columns off, which is exactly
// the state step 4 starts from.
//
// ⚠️ TIME. At 1x a service is minutes of wall clock, so this runs the game at 100x
// ({"cmd":"speed","delta":+3} walks the index 1 -> 4; SpeedTps = 0/10/50/200/1000/10000). The
// SIM is untouched by that — it is the same fixed 10 Hz tick, just more of them per wall-second.
// Driven measurements on --ship wreck for the numbers to expect: she claims Maintain at tick 1,
// arrives at wing_c at tick 211, and the service completes 9 000 ticks later.
const rosterTask = () => (latest.get('roster')?.crew || []).find((c) => c.cid === rell.cid)?.task || '';
const condByTile = () => {
  const m = new Map();
  for (const [x, y, deck, , cond] of latest.get('devices')?.cells || []) m.set(`${x},${y},${deck}`, cond);
  return m;
};
const waitFor = async (pred, ms, what) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(250); }
  log(`  (timed out after ${ms} ms waiting for ${what})`);
  return false;
};

log('\nSTEP 4 — REPAIR is at 3: she must go and repair something');
ws.send(JSON.stringify({ cmd: 'speed', delta: 3 }));
await sleep(600);
log('  speed is now', latest.get('status')?.speed);
const condBefore = condByTile();

const gotJob = await waitFor(() => /service|Servicing/i.test(rosterTask()), 30000, 'a Maintain task');
log(`  CREW WATCH task line: '${rosterTask()}'`);
check(gotJob, 'STEP 4: with REPAIR at 3 she takes a MAINTAIN job herself — the opening beat');
check(/servic/i.test(rosterTask()), 'and the task line names servicing a machine, not some other work');
await png('04-repair-job-taken.png');

// Wait until she has ARRIVED (the label drops "Heading to"), which is what "mid-service" means.
const atMachine = await waitFor(() => /^Servicing/.test(rosterTask()), 30000, 'her to arrive at the machine');
log(`  at the machine: '${rosterTask()}'`);
check(atMachine, 'STEP 4: and she reaches the machine and starts working on it');

log('\nSTEP 6 — set REPAIR back to OFF *mid-service*: the CLAIM-TIME ruling, made visible');
const taskAtFlip = rosterTask();
ws.send(JSON.stringify({ cmd: 'workPriority', cid: rell.cid, work: 0, priority: 0 }));
await sleep(1200);
log(`  REPAIR is now off; work channel = ${JSON.stringify(latest.get('work'))}`);
check(JSON.stringify(latest.get('work')?.cells) === '[]', 'the sim really has REPAIR off again');
// ⭐ THE RULING: a RUNNING job completes. She must NOT drop it the instant the checkbox changed.
log(`  task 1.2 s after the switch: '${rosterTask()}'`);
check(/^Servicing/.test(rosterTask()),
  'STEP 6a: she is STILL SERVICING after the switch — a veto at the in-job site would have dropped ' +
  'the job on the checkbox, which is CancelJob\'s contract and a DELIBERATE verb, not a setting');
await png('05-still-servicing-after-off.png');

const finished = await waitFor(() => !/servic/i.test(rosterTask()), 60000, 'the service to finish');
check(finished, 'STEP 6b: and the service then FINISHES rather than hanging');
const condAfter = condByTile();
let repaired = 0, biggest = null;
for (const [k, v] of condAfter) {
  const was = condBefore.get(k);
  if (was !== undefined && v > was) { repaired += 1; if (!biggest || v - was > biggest.d) biggest = { k, d: v - was, was, now: v }; }
}
log(`  devices whose condition ROSE across steps 4-6: ${repaired}` + (biggest ? `  (largest: ${biggest.k}, cond ${biggest.was} -> ${biggest.now})` : ''));
check(repaired > 0,
  'STEP 6c: a machine is measurably BETTER than it was — the service she was told to stop really ' +
  'completed. "She stopped being busy" alone is satisfied by a job that was cancelled.');

log('  watching for 15 s: she must take NOTHING new');
let tookNew = '';
for (let i = 0; i < 60; i++) { await sleep(250); const t = rosterTask(); if (/servic|dig|haul|craft|build/i.test(t)) { tookNew = t; break; } }
log(`  task after the watch: '${rosterTask()}'`);
check(tookNew === '',
  `STEP 6d: with REPAIR off she takes no NEW work — saw '${tookNew}'. A running job completes; a ` +
  'new one is refused. That is what "gate at CLAIM" means.');
await png('06-idle-again.png');

ws.send(JSON.stringify({ cmd: 'speed', delta: -3 }));
await sleep(400);


// Leave the ship as we found it, so a re-run starts from the same OD-H boot state.
ws.send(JSON.stringify({ cmd: 'workPriority', cid: rell.cid, work: 0, priority: 0 }));
await sleep(800);
log('\nrestored: `work` is now', JSON.stringify(latest.get('work')));

chrome.kill('SIGKILL');
log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED — the whole charter sequence: 1, 2, 3, 5 (M2-3) and 4, 6 (M2-2)');
process.exit(failures ? 1 : 0);
