#!/usr/bin/env node
//
// ⛔⛔ STALE AS OF 2026-08-06 — THIS RIG ADDRESSES DOM THE BUILD TRAY DELETED, AND IT WILL DIE ON ITS
// NEXT RUN. It is FILED, not fixed, and the filing is here rather than only in `HANDOVER.md` because
// a rig that fails for a reason nobody wrote down reads as a regression in the game.
//   WHAT IS GONE: `.rz-tool` (as `.rz-tool.on`, the "is anything armed" witness) and the bare
//     `[data-rztool="wall"]` reach. `.rz-palette-wrap` survives.
//   WHAT REPLACED IT: `#rz-tray` — a breadcrumb, two rails (`.rz-tray-cat` / `.rz-tray-sub`) and a
//     row of `.rz-card`s. A tool's control now exists ONLY while its leaf is open, so every selector
//     below needs a NAVIGATION step in front of it (press `[data-rzcat=…]`, then `[data-rzsub=…]`,
//     both derivable from `build-tray-model.js`'s `trayLeafFor` / `categoryOf` — see
//     `client/tools/build-tray-shot.mjs`, which does exactly this).
//   ⚠️ NOTHING REDDENS TODAY: none of the four stale rigs is in `./ci.sh`.
//   ⚠️ THE PORT IS SMALL: `.rz-tool.on` becomes `.rz-card.on`, and WALL needs STRUCTURE > WALL
//   opened first. ⭐ ITS SUBJECT IS UNCHANGED AND STILL LIVE — "the first screen in a room is the
//   room, not a menu demanding a tool" is exactly the claim the tray's reserved band puts back in
//   play, so this is the one whose ABSENCE costs the most.
//
// THE FIRST SCREEN IN A ROOM IS THE ROOM — the LIVE-PIXEL acceptance, in real Chrome, against the
// running game.
//
//   *"Opening a room shows the room and its people — not a build palette demanding a tool."*
//
// WHY IT EXISTS AND WHAT ONLY IT CAN SEE. ⛔ NO NODE HARNESS IN THIS REPO CAN SEE PRESENTATION.
// There is no jsdom (`client/package.json` carries typescript + @types/node and `./ci.sh` runs a
// bare `node --test`), `dom-lite` models no layout, and nothing in it computes a font metric or
// applies `text-overflow`. `client/test/room-model.test.js` pins the DERIVATION and the DOM writes
// — which sentence each surface holds in each armed state — and says so in its own header. The
// three claims below are outside anything it can answer:
//   1. BOTH HINT TEXTS FIT. This surface's bar was already measured clipping once (the
//      palette-overflow package), so "the fix added a second, differently-shaped line" is a real
//      risk and `scrollWidth <= clientWidth` with the shipped Space Mono is the only honest answer.
//      ⚠️ AND THE WORST CASE IS THE **ARMED** TEXT, NOT THE NEUTRAL ONE — a sentence here claimed
//      the opposite and it is measured false: neutral 138 chars / 881 px on ONE line, armed 299
//      chars / 1462 px wrapping to TWO. Both are probed below; a later reader budgeting this row
//      wants the armed number.
//   2. THE WHOLE PALETTE ISLAND IS STILL ON SCREEN — the hint wraps, the wrapper has no height cap
//      (VS-Z-49 as restated), and growing the line must not push the bar off the bottom edge.
//   3. THE THREE SURFACES AGREE, IN THE BROWSER, THROUGH REAL GESTURES: enter a room → all three
//      neutral; CLICK the WALL button → all three BUILD; press ESC → all three neutral again.
//
// USAGE
//   1. ./play.sh --host-port 8352 --client-port 8353 --no-open
//   2. node client/tools/roomzoom-neutral-shot.mjs --out docs/design/shots
//        [--host-port 8352] [--client-port 8353]
//
// Exits non-zero if the host will not answer, if no room can be opened, if a surface still
// announces BUILD with nothing armed, if a text overflows its box, or if the palette island leaves
// the viewport. A green run with no pictures is the failure this class of tool exists to prevent.
// NOT wired into ./ci.sh: it needs a browser and a running host, and the gate stays browser-free
// (the same rule as why-line-shot.mjs / work-tab-shot.mjs / moss-shot.mjs).
//
// ⭐ THIS RIG'S OWN NON-VACUITY. Every check below is phrased against a string this tool did not
// write, and the two that are phrased as ABSENCES (`no BUILD in the label`, `does not overflow`)
// are the ones that can pass by reading nothing — so each is paired with a POSITIVE read of the
// same node in the same call (`text` is printed verbatim for every probe, and an empty `text` fails
// its sibling equality check). The armed leg is the inclusion control for the disarmed one: the
// exact same probes must report BUILD three lines later, or the probes are not reading the surface.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8352');
const CLIENT_PORT = +arg('client-port', '8353');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'roomzoom-neutral-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9347');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what) => { log((ok ? '  PASS  ' : '  FAIL  ') + what); if (!ok) failures += 1; };

// ────────────────────────────────────────────── 1. the host, on an independent socket
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
log('crew aboard:', roster.crew.map((c) => `${c.name} (cid ${c.cid})`).join(' | '));

// ────────────────────────────────────────────── 2. real Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'rzneutral-shot-'));
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
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' });
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
async function pressKey(key, code, keyCode) {
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}
const centre = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);

/** ⭐ THE INSTRUMENT: the node's TEXT and whether the browser is clipping it. `scrollWidth >
 *  clientWidth` is exactly the condition under which `text-overflow` fires and content leaves the
 *  box — the thing no node stub can answer. `text` is returned on every probe so an absence check
 *  cannot pass on an empty read. */
const box = async (sel) => json(
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;`
  + `const r=e.getBoundingClientRect();const s=getComputedStyle(e);`
  + `return {text:e.textContent,scrollW:e.scrollWidth,clientW:e.clientWidth,`
  + `overflowsX:e.scrollWidth>e.clientWidth,scrollH:e.scrollHeight,clientH:e.clientHeight,`
  + `overflowsY:e.scrollHeight>e.clientHeight,x:r.x,y:r.y,w:r.width,h:r.height,`
  + `font:s.font,ws:s.whiteSpace,ellipsis:s.textOverflow};})()`);

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6500);
const onb = await centre('[data-onb-begin]');
if (onb) { log('dismissing the onboarding card'); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) {
  console.error('FAIL: the onboarding card is still up — every screenshot below would photograph it');
  process.exit(8);
}

// ────────────────────────────────────────────── 3. open a room — preferring one with people in it
//
// The caption's disarmed clause counts the souls in the room, so a room with nobody in it exercises
// only the `NO CREW HERE` branch. The anchors are enumerated off the LIVE Overview (the deck the
// client is actually showing) and tried in turn; the first one holding crew wins. If none does, the
// run continues on the first room and SAYS SO rather than reporting a check it did not make.
const anchors = await json(`[...document.querySelectorAll('.pl-room[data-anchor]')].map(e=>e.getAttribute('data-anchor'))`);
if (!anchors?.length) { console.error('FAIL: the Overview drew no rooms'); chrome.kill('SIGKILL'); process.exit(9); }
log('\nrooms on this deck:', anchors.join(', '));

const enter = async (anchor) => {
  const r = await centre(`.pl-room[data-anchor="${anchor}"]`);
  if (!r) return false;
  await clickAt(r.x, r.y);
  await sleep(1600);
  return !!(await evaluate(`document.body.classList.contains('roomzoom-open')`));
};
const leave = async () => { await pressKey('Escape', 'Escape', 27); await sleep(1200); };

let chosen = null; let peopled = false;
for (const a of anchors.slice(0, 8)) {
  if (!(await enter(a))) continue;
  const cap = await box('#rz-caption');
  log(`  ${a}: caption ${JSON.stringify(cap?.text)}`);
  if (!chosen) chosen = a;
  if (cap && /\d+ CREW HERE/.test(cap.text)) { chosen = a; peopled = true; break; }
  await leave();
}
if (!chosen) { console.error('FAIL: no room would open'); chrome.kill('SIGKILL'); process.exit(10); }
if (!peopled) {
  log('  NOTE: no room on this deck holds crew right now — the caption leg below runs on the '
    + '`NO CREW HERE` branch. That is a real cell of the derivation, not a skipped check, but the '
    + 'populated cell is proven in node (room-model.test.js) rather than here.');
  if (!(await evaluate(`document.body.classList.contains('roomzoom-open')`))) await enter(chosen);
}
log(`\n=== ROOM ZOOM: ${chosen} ===`);

// ────────────────────────────────────────────── 4. THE FIRST SCREEN — nothing armed
log('\nSTEP 1 — the first screen: not one surface may announce BUILD');
const armedNow = () => evaluate(`!!document.querySelector('.rz-tool.on')`);
check((await armedNow()) === false,
  'entry armed NO tool (IX-Z-01) — if this fails the package is a state bug, not a presentation one');

const label0 = await box('.rz-place-label');
const hint0 = await box('#rz-hint');
const cap0 = await box('#rz-caption');
log('  .rz-place-label:', JSON.stringify(label0));
log('  #rz-hint       :', JSON.stringify(hint0));
log('  #rz-caption    :', JSON.stringify(cap0));

check(!!label0 && /^TOOLS ▸ \S/.test(label0.text), `the palette label reads ${JSON.stringify(label0?.text)} — expected 'TOOLS ▸ {ROOM}'`);
check(!!label0 && !/BUILD/.test(label0.text), 'the palette label does not say BUILD');
check(!!cap0 && !/BUILD/.test(cap0.text), 'the canvas caption does not say BUILD DETAIL');
check(!!cap0 && /· (NO CREW|\d+ CREW) HERE ·/.test(cap0.text), 'the caption says who is in the room');
check(!!cap0 && /\d+ PLACED$/.test(cap0.text), 'the caption still carries its placed count');
check(!!hint0 && /SELECT/.test(hint0.text) && /PRIORITISE/.test(hint0.text),
  'the hint names the two verbs a DISARMED room has (select a pawn; right-click to prioritise) — '
  + 'neither was advertised anywhere before this package');
check(!!hint0 && hint0.text.indexOf('SELECT') < hint0.text.indexOf('BUILD'),
  'the hint offers SELECT before it offers BUILD (the room and its people come first)');
check(!!hint0 && !/^PICK A TOOL/.test(hint0.text), 'the hint no longer OPENS with PICK A TOOL');

// ── the pixel claims ──
log('\nSTEP 2 — the pixel claims: BOTH hint texts must FIT, and the island must stay on screen');
check(!!hint0 && !hint0.overflowsX,
  `#rz-hint content ${hint0?.scrollW}px in a ${hint0?.clientW}px box — a clipped hint shows a junk `
  + 'fragment of the one line that teaches the disarmed verbs');
check(!!label0 && !label0.overflowsX,
  `.rz-place-label content ${label0?.scrollW}px in a ${label0?.clientW}px box (it is nowrap by CSS, `
  + 'so overflow here is real clipping)');
const wrap = await box('.rz-palette-wrap');
const vp = await json(`({w:innerWidth,h:innerHeight})`);
log('  .rz-palette-wrap:', JSON.stringify({ x: wrap?.x, y: wrap?.y, w: wrap?.w, h: wrap?.h }), 'viewport', JSON.stringify(vp));
check(!!wrap && wrap.y >= 0 && wrap.y + wrap.h <= vp.h + 1,
  `the whole palette island is inside the viewport (top ${wrap?.y?.toFixed(1)}, bottom `
  + `${(wrap ? wrap.y + wrap.h : 0).toFixed(1)} of ${vp.h}) — the hint wraps and the wrapper has no `
  + 'height cap (VS-Z-49 as restated), so a longer line grows the island upward, not off the edge');
check(!!wrap && wrap.x >= 0 && wrap.x + wrap.w <= vp.w + 1, 'and inside it horizontally');
await png('01-disarmed.png');

// ────────────────────────────────────────────── 5. ARM WALL by clicking the shipped button
log('\nSTEP 3 — click WALL: the BUILD presentation comes back on all three');
const wallBtn = await centre('[data-rztool="wall"]');
if (!wallBtn) { console.error('FAIL: no WALL button on the palette'); chrome.kill('SIGKILL'); process.exit(11); }
await clickAt(wallBtn.x, wallBtn.y);
await sleep(1200);
check((await armedNow()) === true, 'the click armed a tool (the inclusion control for STEP 1)');
const label1 = await box('.rz-place-label');
const hint1 = await box('#rz-hint');
const cap1 = await box('#rz-caption');
log('  .rz-place-label:', JSON.stringify(label1?.text));
log('  #rz-hint       :', JSON.stringify(hint1?.text));
log('  #rz-caption    :', JSON.stringify(cap1?.text));
check(!!label1 && /^BUILD ▸ \S/.test(label1.text), 'the palette label is BUILD ▸ {ROOM} again');
check(!!cap1 && /BUILD DETAIL/.test(cap1.text), 'the caption is {ROOM} · BUILD DETAIL · {n} PLACED again');
check(!!hint1 && /ESC DISARMS/.test(hint1.text) && /DIG \[G\]/.test(hint1.text),
  'the hint is the tool crib sheet again');
check(!!hint1 && hint1.text !== hint0?.text, 'the hint actually CHANGED (the probe is reading the live node)');
check(!!hint1 && !hint1.overflowsX,
  `#rz-hint (armed, the longer text) content ${hint1?.scrollW}px in a ${hint1?.clientW}px box`);
await png('02-armed.png');

// ────────────────────────────────────────────── 6. ESC — the real rung, back to neutral
log('\nSTEP 4 — ESC disarms, and the neutral screen comes back');
await pressKey('Escape', 'Escape', 27);
await sleep(1200);
check((await armedNow()) === false, 'ESC disarmed the tool');
check(await evaluate(`document.body.classList.contains('roomzoom-open')`),
  'ESC disarmed WITHOUT leaving the room — one rung per press (IX-Z-40/41)');
const label2 = await box('.rz-place-label');
const hint2 = await box('#rz-hint');
const cap2 = await box('#rz-caption');
check(!!label2 && label2.text === label0?.text, `the label returned to ${JSON.stringify(label0?.text)}`);
check(!!hint2 && hint2.text === hint0?.text, 'the hint returned to the neutral text');
// ⚠️ THE CAPTION IS COMPARED BY CLAUSE, NOT BY EQUALITY, AND THE FIRST DRAFT GOT THIS WRONG. Its
// third clause is LIVE SIM DATA — the placed/pending count — and on the shipped wreck it moved
// 18 → 19 between the disarmed read and this one, with nothing clicked on the canvas: the ship is
// running and the crew are designating and building while the tool is armed. An equality check
// against the earlier string reported a FAILURE describing a surface that was behaving perfectly
// (the `zoom-pawn-shot` lesson: a precondition that has moved is not a defect).
check(!!cap2 && !/BUILD/.test(cap2.text) && /· (NO CREW|\d+ CREW) HERE ·/.test(cap2.text),
  `the caption returned to the neutral clause (reads ${JSON.stringify(cap2?.text)})`);
// ⚠️ NO PICTURE FOR THIS STEP, DELIBERATELY. An earlier draft wrote `03-after-esc.png`, which is
// pixel-identical in every respect a reader cares about to `01-disarmed.png` — so it was never
// committed, and a rig that drops an UNTRACKED file into a tracked directory on every run trains
// the next person to ignore `git status` in the one repo whose hard rule is "if `git status` shows
// files you did not touch, stop and look". The three text assertions above are the whole evidence
// that ESC restores the neutral screen; a second copy of the same screenshot is not.

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
cdp.close(); ws.close(); chrome.kill('SIGKILL');
process.exit(failures === 0 ? 0 : 1);
