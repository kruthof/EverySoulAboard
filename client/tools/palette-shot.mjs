#!/usr/bin/env node
//
// ⛔⛔ STALE AS OF 2026-08-06 — THIS RIG ADDRESSES DOM THE BUILD TRAY DELETED, AND IT WILL DIE ON ITS
// NEXT RUN. It is FILED, not fixed, and the filing is here rather than only in `HANDOVER.md` because
// a rig that fails for a reason nobody wrote down reads as a regression in the game.
//   WHAT IS GONE: `.rz-palette` (the flat wrapping chip strip), its `.rz-tool` buttons, `.rz-matstrip` and
//     its `.rz-mat-chip` swatches. `.rz-palette-wrap` survives — it is the tray's own wrapper now.
//   WHAT REPLACED IT: `#rz-tray` — a breadcrumb, two rails (`.rz-tray-cat` / `.rz-tray-sub`) and a
//     row of `.rz-card`s. A tool's control now exists ONLY while its leaf is open, so every selector
//     below needs a NAVIGATION step in front of it (press `[data-rzcat=…]`, then `[data-rzsub=…]`,
//     both derivable from `build-tray-model.js`'s `trayLeafFor` / `categoryOf` — see
//     `client/tools/build-tray-shot.mjs`, which does exactly this).
//   ⚠️ NOTHING REDDENS TODAY: none of the four stale rigs is in `./ci.sh`.
//   ⛔ AND THIS ONE IS A REWRITE RATHER THAN A PORT: its SUBJECT was the wrap/overflow
//   behaviour of a chip row that no longer exists. The card row's equivalent question — is any card
//   unreachable — is already asked by `build-tray-shot.mjs`. What is worth SALVAGING is its armed-look
//   section (the `:hover` borrowing the armed border colour, found here and nowhere else): that defect
//   class applies to `.rz-card` / `.rz-tray-cat` / `.rz-tray-sub` verbatim.
//
// palette-shot.mjs — MEASURE AND PHOTOGRAPH the Level-2 construction palette across viewport widths.
//
// ⚠️ WHY THIS EXISTS, and why it is committed rather than left in a scratchpad.
//
// The defect it was written for is a LAYOUT defect: `.rz-palette` was `overflow-x:auto` with
// `scrollbar-width:none` + `::-webkit-scrollbar{display:none}`, so below ~1140 px the last tools —
// STOCKPILE, STRIP, DEMOLISH — were clipped away **with no affordance of any kind**. The DOM was
// byte-identical in the working and the broken case: fifteen `<button class="rz-tool">` nodes (the
// palette wore fifteen tools on the day of the bug; it wears SEVENTEEN today, and every count this
// tool prints is READ FROM THE DOM, never typed), all
// present, all focusable, three of them simply not on the screen. No assertion in this repo can tell
// those apart, for exactly the reason `marks-shot.mjs`'s header gives about a well-formed SVG string
// that paints nothing. **Only a real layout engine can answer "can the player see this button".**
//
// So the load-bearing evidence for that fix is this tool, not a test: it drives real Chrome over
// CDP, enters the Room Zoom with a real pointer gesture, and at each requested viewport width counts
// the palette buttons whose border box lies fully inside the palette's own clipping box. It EXITS
// NON-ZERO if any tool is unreachable at any width — that is the assertion, and it is a measurement
// rather than a scan. `client/test/room-model.test.js` carries the CI-runnable ratchet (the palette
// may not re-acquire the hide-the-scrollbar idiom); it cannot carry the proof.
//
// It is NOT in `./ci.sh`: Chrome is not a CI dependency here, and the gate must run on a machine
// with no browser. Run it by hand when the palette, its tools or its wrapper change.
//
// USAGE
//   1. ./play.sh --host-port 8390 --client-port 8391 --no-open
//   2. node client/tools/palette-shot.mjs --out <dir> [--host-port 8390] [--client-port 8391] \
//        [--prefix palette-] [--widths 1600,1440,1280,1140,1024,900] [--cdp-port 9345]
//
// Exits non-zero if the host will not answer, if the Room Zoom cannot be entered, if Chrome never
// paints, or if ANY tool is clipped at ANY measured width — a green run with everything hidden is
// precisely the failure this tool exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8390');
const CLIENT_PORT = +arg('client-port', '8391');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'palette-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9345');
const HEIGHT = +arg('height', '900');
const WIDTHS = arg('widths', '1600,1440,1280,1140,1024,900').split(',').map((s) => +s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// ───────────────────────────────────────────────────────────── Chrome over CDP
const userDir = mkdtempSync(join(tmpdir(), 'palette-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${Math.max(...WIDTHS)},${HEIGHT}`,
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const die = (code, msg) => { console.error('FAIL: ' + msg); try { chrome.kill('SIGKILL'); } catch { /**/ } process.exit(code); };

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
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
};
/** A real key press on the window — the Room Zoom binds `keydown` in the CAPTURE phase. */
const key = async (k) => {
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0, nativeVirtualKeyCode: k === 'Escape' ? 27 : 0 });
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

/**
 * ⚠️ IS THE SOCKET STILL UP? — a FALSE RED guard, and it is here because it happened.
 *
 * When the host dies mid-run, `main.js:198` raises `#disc` ("LINK LOST — RECONNECTING…") and
 * `hud.js:529` DISARMS the armed tool. The arm legs below then report `aria-pressed=[]` and
 * `accepts=false`, and this tool exits non-zero with a message about the palette not announcing its
 * armed tool — a red that looks exactly like a real defect and is nothing of the kind. That is
 * `CLAUDE.md` trap 4 wearing a dead process instead of a `ReferenceError`. Checked explicitly so the
 * failure names its own cause.
 */
const assertLinked = async (where) => {
  const down = await evaluate(`(()=>{const d=document.getElementById('disc');` +
    `return !!(d && getComputedStyle(d).display !== 'none');})()`);
  if (down) die(10, `the client lost its socket to the host (${where}). Nothing measured after this ` +
    'point is about the palette — a disconnect disarms the tool. Restart the host and re-run.');
};

await call('Page.enable');
await call('Runtime.enable');
await setWidth(Math.max(...WIDTHS));
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(6000);

// Dismiss the onboarding takeover with a REAL click on its own BEGIN button — see marks-shot.mjs's
// header: the card swallows both the screenshot and the room click, and photographing it is the
// classic false negative here.
const onb = await evalJson(`(()=>{const b=document.querySelector('[data-onb-begin]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
if (onb) { log('dismissing onboarding at', onb.x.toFixed(0) + ',' + onb.y.toFixed(0)); await clickAt(onb.x, onb.y); await sleep(2500); }
if (await evaluate(`!!document.querySelector('[data-onb-begin]')`)) die(8, 'the onboarding card is still up');

// Enter the Room Zoom with the real entry gesture (a pointer press+release on a bound room), never
// a synthetic `.click()` — BUG-B (HANDOVER §4h) is the record of why that distinction is load-bearing.
// RETRIED, and the retry is not paranoia: the Overview repaints from coalesced wire messages, so a
// press dispatched at a rect read one frame earlier can land on a room that has just moved. That is
// the same coalesced-repaint/stale-read shape HANDOVER §4h and §4j both had to correct for.
// ⚠️ THE HIT-TESTED CANDIDATE LIST IS NOT PARANOIA — it cost a run. Taking `querySelector('.pl-room')`
// and clicking its centre works at 1600 px and FAILS at 1300 px: the Overview's own chrome (the
// left-hand crew panel) reflows over the first room, so the press lands on the panel and the room
// never opens. `elementFromPoint` at the candidate's own centre is what tells the two apart, and it
// is the browser's hit test rather than a re-derivation of it. Retried as well, because the Overview
// repaints from coalesced wire messages and a press dispatched at a rect read one frame earlier can
// land on a room that has just moved (the stale-read shape HANDOVER §4h and §4j both corrected for).
let entered = false;
for (let attempt = 0; attempt < 3 && !entered; attempt++) {
  const cands = await evalJson(`(()=>[...document.querySelectorAll('.pl-room[data-anchor]')].map(e=>{
    const r=e.getBoundingClientRect(); const x=r.x+r.width/2, y=r.y+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return {a:e.getAttribute('data-anchor'),x,y,top:!!(hit&&(hit===e||e.contains(hit)))};
  }).filter(c=>c.top))()`) || [];
  for (const c of cands) {
    log('entering room', c.a, 'at', c.x.toFixed(0) + ',' + c.y.toFixed(0));
    await clickAt(c.x, c.y);
    await sleep(2500);
    entered = await evaluate(`document.body.classList.contains('roomzoom-open')`);
    if (entered) break;
  }
  if (!entered) await sleep(1500);
}
if (!entered) die(7, 'the Room Zoom did not open');

// ───────────────────────────────────────────────────────────── the measurement
//
// A tool is REACHABLE when its border box lies inside the palette's own clipping box. That single
// predicate covers both candidate fixes and every failure mode between them: a horizontally-scrolled
// row hides a button by pushing it past the right edge, a wrapped row keeps it inside a taller box,
// and a `max-height` clip would push it past the bottom edge. Measured from `getBoundingClientRect`
// in the live layout — nothing here re-derives the geometry the browser already computed.
//
// It also records `scrollWidth > clientWidth` (content genuinely overflows its container) and
// whether the palette advertises that fact — a visible scrollbar, an arrow control, or an edge fade.
// "Overflowing" is not by itself the defect; overflowing SILENTLY is.
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
  const clipped = btns.filter((b) => !inBox(b, box)).map((b) => b.textContent.trim());
  const cs = getComputedStyle(pal);
  const wrapEl = document.querySelector('.rz-palette-wrap');
  const wrapBox = wrapEl ? wrapEl.getBoundingClientRect() : null;
  const acc = document.querySelector('.rz-accepts');
  const accChips = acc ? [...acc.querySelectorAll('.rz-acc-chip')] : [];
  const accBox = (acc && !acc.hidden) ? (acc.querySelector('.rz-acc-chips') || acc).getBoundingClientRect() : null;
  const mat = document.querySelector('.rz-matstrip');
  const matChips = mat ? [...mat.querySelectorAll('.rz-mat-chip')] : [];
  const matBox = (mat && !mat.hidden) ? mat.getBoundingClientRect() : null;
  return {
    tools: btns.length,
    clipped,
    reachable: btns.length - clipped.length,
    scrollW: pal.scrollWidth, clientW: pal.clientWidth,
    overflows: pal.scrollWidth > pal.clientWidth + 1,
    rows: new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size,
    palH: Math.round(box.height),
    wrapH: wrapBox ? Math.round(wrapBox.height) : null,
    wrapTop: wrapBox ? Math.round(wrapBox.top) : null,
    overflowX: cs.overflowX, flexWrap: cs.flexWrap,
    acceptsShown: !!(acc && !acc.hidden),
    accChips: accChips.length,
    accClipped: accBox ? accChips.filter((c) => !inBox(c, accBox)).map((c) => c.textContent.trim()) : [],
    matShown: !!(mat && !mat.hidden),
    matChips: matChips.length,
    matClipped: matBox ? matChips.filter((c) => !inBox(c, matBox)).map((c) => (c.getAttribute('title') || '?')) : [],
    // aria-pressed, read off the LIVE buttons: the armed tool must say so in words, not only in
    // colour, and exactly one of them may claim it — however many there are.
    pressed: btns.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim()),
    ariaMissing: btns.filter((b) => b.getAttribute('aria-pressed') === null).length,
  };
})()`;

const results = [];
for (const w of WIDTHS) {
  await setWidth(w);
  await assertLinked('width sweep @ ' + w);
  const m = await evalJson(MEASURE);
  if (!m) die(9, 'no .rz-palette in the Room Zoom DOM at width ' + w);
  results.push({ w, ...m });
  log(`w=${w}  reachable ${m.reachable}/${m.tools}  rows=${m.rows}  palH=${m.palH}  ` +
      `scrollW=${m.scrollW}/${m.clientW}${m.overflows ? ' OVERFLOWS' : ''}  ` +
      `overflow-x=${m.overflowX} flex-wrap=${m.flexWrap}  aria-missing=${m.ariaMissing}` +
      (m.clipped.length ? `\n        CLIPPED: ${m.clipped.join(' | ')}` : ''));
  await png(`w${w}.png`);
}

// The two OPTION ROWS are siblings in the same wrapper and carried the identical clipping idiom, so
// they are measured on the same rig rather than assumed. Each is armed with a REAL click on its own
// palette button — which is only possible at all once that button is reachable, so these legs are
// also a second, indirect check of the headline fix. At the narrowest width, where the bug bit
// hardest, and they double as the live check that `aria-pressed` tracks the armed slot.
const NARROW = WIDTHS[WIDTHS.length - 1];
await setWidth(NARROW);
for (const tool of ['wall', 'stockpile']) {
  const btn = await evalJson(`(()=>{const b=document.querySelector('.rz-tool[data-rztool="${tool}"]');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
  if (!btn) die(9, `no ${tool.toUpperCase()} button in the palette`);
  if (!(btn.w > 0 && btn.h > 0)) die(9, `the ${tool.toUpperCase()} button has no box`);
  await clickAt(btn.x, btn.y);
  await sleep(1200);
  await assertLinked('after arming ' + tool);
  const m = await evalJson(MEASURE);
  log(`ARMED ${tool.toUpperCase()} @ w=${NARROW}: aria-pressed=${JSON.stringify(m.pressed)} ` +
      `accepts=${m.acceptsShown}/${m.accChips} clipped=${JSON.stringify(m.accClipped)} ` +
      `materials=${m.matShown}/${m.matChips} clipped=${JSON.stringify(m.matClipped)} ` +
      `palette ${m.reachable}/${m.tools} wrapH=${m.wrapH}`);
  results.push({ w: NARROW, armed: tool, ...m });
  await png(`w${NARROW}-${tool}.png`);
  await clickAt(btn.x, btn.y);   // disarm, so the next leg starts from a known slot
  await sleep(800);
}

// ───────────────────────────────────────────── THE ARMED LOOK: rest vs HOVER vs armed, photographed
//
// ⚠️ ADDED 2026-08-03 FOR THE OWNER'S "the palette reads as an INERT placeholder" NOTE, and the leg
// that matters is the MIDDLE one. Arming was never broken and this tool already proved it — the legs
// above read `aria-pressed="true"` off the live button. What no instrument here could see is that
// `.rz-tool:hover` had borrowed `#cf7a33`, the ARMED border colour, so the button under the player's
// own cursor was already wearing the armed edge BEFORE the click. Comparing armed against REST
// answers a question no player ever asks: their pointer is on the button they just clicked, so the
// honest comparison is armed against the same button HOVERED. Measured, on the shipped-before tree:
//
//     HOVER  bg rgba(26,22,17,.5)  color rgb(179,170,156)  border 1px rgb(207,122,51)  shadow none
//     ARMED  bg rgb(58,42,18)      color rgb(242,181,99)   border 1px rgb(207,122,51)  shadow none
//
// The pointer is MOVED rather than teleported-by-click, because `:hover` is a real pointer state and
// a CDP click alone does not reliably establish it.
//
// ⛔ WHAT THESE LEGS ACTUALLY ASSERT, stated exactly, because an earlier draft of this header
// overstated it as "refuses to pass when hover and armed resolve alike" and that was measurably
// false (see the headline leg below). They assert: (1) rest and hover really differ, so the rig is
// not comparing one state with itself; (2) the click really armed the tool; (3) **armed OWNS the
// shadow channel** — armed has a box-shadow and hover has none; (4) armed and hover are not
// byte-identical; (5) arming does not re-measure the button's box; (6) ESC returns it to the hover
// look. They do NOT — and cannot — assert that the armed state is LOUD ENOUGH to notice; no
// automated check here judges contrast. That remains a human call on the four PNGs this writes.
// ⭐ RUN OVER THE **CLASS** OF ARMABLE CONTROLS, NOT OVER THE TOOL BUTTON ALONE — 2026-08-03, second
// pass. The first version of this section photographed `.rz-tool` only, the CSS fix was made there
// only, and the palette lane's own reviewer then found the identical `#cf7a33` collision on
// `.rz-acc-chip` and a near-identical one on `.rz-mat-chip` — the two OPTION ROWS that hang directly
// under the palette and that a player reaches immediately after arming WALL or STOCKPILE. Three
// members now go through the same six legs:
//
//     tool     .rz-tool[data-rztool="wall"]   armed by clicking it · released by ESC
//     matchip  .rz-mat-chip[data-rzmat=…]     armed by picking it  · released by picking a sibling
//     accchip  .rz-acc-chip[data-rzaccept=…]  armed by toggling in · released by toggling out
//
// ⚠️ EACH MEMBER'S RELEASE IS THE ONE A PLAYER ACTUALLY HAS, not a shared convenience. There is no
// ESC for a chip: the material swatches are a radio group, so the only way to un-light one is to pick
// another, and an ACCEPTS chip un-lights by being clicked again. Using ESC for all three would have
// tested a rung two of them do not own.
//
// ⚠️ AND THE STARTING STATE IS PREPARED, NOT ASSUMED. A tool boots unarmed; a material swatch boots
// with ONE already lit; every ACCEPTS chip boots LIT, because an untouched stockpile accepts
// everything. Photographing "rest" on a control that is already armed compares the armed look with
// itself and passes for free, so each chip target is first driven to a genuinely unarmed chip — the
// swatch leg picks one that is not the active material, the ACCEPTS leg clicks its chip out first.
const STATE = (sel) => `(()=>{const b=document.querySelector('${sel}');
  if(!b)return null;const cs=getComputedStyle(b);const r=b.getBoundingClientRect();
  return {cls:b.className,pressed:b.getAttribute('aria-pressed'),bg:cs.backgroundColor,color:cs.color,
    border:cs.borderTopWidth+' '+cs.borderTopColor,shadow:cs.boxShadow,weight:cs.fontWeight,
    w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100,
    x:r.x,y:r.y,cx:r.x+r.width/2,cy:r.y+r.height/2};})()`;

await setWidth(WIDTHS[0]);
await sleep(600);
const moveTo = async (x, y) => { await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(650); };
// Clear of the WHOLE wrapper, not just the palette: the option rows are siblings of the palette
// inside it, and a "rest" reading taken while the pointer sits on the subject is a comparison of one
// state with itself. Which the rest-vs-hover leg below would then catch — this only stops it being
// the normal case for the two new members.
const away = await evalJson(`(()=>{const p=document.querySelector('.rz-palette-wrap').getBoundingClientRect();
  return {x:p.x+p.width/2,y:Math.max(4,p.y-60)};})()`);
if (!away) die(9, 'no .rz-palette-wrap — the armed-look legs have nowhere to park the pointer');

const clickTool = async (tool) => {
  const b = await evalJson(`(()=>{const b=document.querySelector('.rz-tool[data-rztool="${tool}"]');
    if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if (!b) die(9, `no ${tool.toUpperCase()} button to reach the option row with`);
  await clickAt(b.x, b.y);
  await sleep(1100);
};
const clickSel = async (sel) => {
  const b = await evalJson(`(()=>{const b=document.querySelector('${sel}');if(!b)return null;
    const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if (!b) die(9, `no element for ${sel}`);
  await clickAt(b.x, b.y);
  await sleep(900);
};

const sameLook = (a, b) => a.bg === b.bg && a.color === b.color && a.border === b.border && a.shadow === b.shadow;

/**
 * Read a control's paint ONCE IT HAS STOPPED MOVING — two identical readings in a row, or give up
 * and report the last one.
 *
 * ⚠️ NOT DEFENSIVENESS: a mid-transition value was CAUGHT, in this rig, during the pre-fix control
 * run. `.rz-mat-chip` carries `transition:…border-color .09s…`, its strip is re-rendered wholesale
 * when the selection changes (`paintMatStrip` replaces the row's `innerHTML`, so the node under the
 * pointer is a NEW node that re-enters `:hover` on the next mouse move), and the released reading
 * came back `rgb(155, 97, 48)` — a colour that exists in neither state, part-way between rest and
 * hover. A single `sleep` is a guess about how long a repaint takes; this asks the page instead.
 * Without it the release leg is a coin-flip whose red says "the state latched", which is a sentence
 * about a defect that is not there — the why-line rig's 2026-08-03 flake in a new costume.
 */
async function readSettled(sel) {
  let prev = await evalJson(STATE(sel));
  for (let i = 0; i < 8 && prev; i++) {
    await sleep(300);
    const now = await evalJson(STATE(sel));
    if (now && sameLook(prev, now)) return now;
    prev = now;
  }
  return prev;
}

/**
 * Photograph and read ONE armable control through rest → hover → armed → released, and return both
 * the readings and everything wrong with them. The clip is recomputed from each state's OWN rect:
 * arming a tool reveals an option row, which moves the wrapper, and a clip frozen at the rest
 * position then photographs empty background — a PNG that shows nothing looks exactly like a PNG that
 * shows no change.
 */
async function readLook({ name, sel, arm, release }) {
  const seen = {};
  const shot = async (file, s) => png(file, { x: s.x - 7, y: s.y - 7, width: s.w + 14, height: s.h + 14 });

  await moveTo(away.x, away.y);                                 // pointer OFF the whole wrapper
  seen.rest = await readSettled(sel);
  if (!seen.rest) die(9, `no ${name} control (${sel}) for the armed-look legs`);
  await shot(`look-${name}-rest.png`, seen.rest);

  await moveTo(seen.rest.cx, seen.rest.cy);                     // pointer ON it, still unarmed
  seen.hover = await readSettled(sel);
  await shot(`look-${name}-hover.png`, seen.hover);

  await arm(seen.rest);                                         // armed, pointer still on it
  await assertLinked(`after arming ${name} for the look legs`);
  seen.armed = await readSettled(sel);
  await shot(`look-${name}-armed.png`, seen.armed);

  await release(seen.rest);                                     // the release rung THIS member owns
  await moveTo(seen.rest.cx, seen.rest.cy);                     // …and back under the pointer
  seen.released = await readSettled(sel);
  await shot(`look-${name}-rest-again.png`, seen.released);

  for (const [k, v] of Object.entries(seen))
    log(`LOOK ${name.padEnd(8)} ${k.padEnd(8)} cls="${v.cls}" pressed=${v.pressed} bg=${v.bg} ` +
        `color=${v.color} border=${v.border} shadow=${v.shadow === 'none' ? 'none' : 'yes'} box=${v.w}x${v.h}`);

  // The assertions. NON-VACUITY FIRST: `rest` and `hover` must actually DIFFER, or the pointer never
  // landed and every comparison below is being made between two identical readings of one state — the
  // exact shape of a green run that measured nothing.
  const out = [];
  const at = (m) => `${name}: ${m}`;
  if (sameLook(seen.rest, seen.hover))
    out.push(at('rest and HOVER are identical — either the pointer never established :hover or the ' +
      'control was ALREADY armed when "rest" was read, so every comparison below is vacuous. ' +
      'Nothing here is evidence until this leg passes.'));
  // ⚠️ THE ARM CHECK IS THE `.on` CLASS, NOT `aria-pressed`, AND THAT IS A GENERALISATION WITH A
  // REASON. The tool-only version of this leg read `pressed !== 'true'`, which would fail every run
  // on a material swatch: `paintMatStrip` deliberately emits NO `aria-pressed`, because exactly one
  // swatch is ever lit and six independent toggles is not what the player has (the honest spelling is
  // role="radio"/aria-checked, a keyboard change nobody has made). `.on` is the class the stylesheet
  // actually paints off, and it is the one thing all three members share.
  if (!seen.armed.cls.split(/\s+/).includes('on'))
    out.push(at(`the click did not arm it (cls="${seen.armed.cls}" pressed=${seen.armed.pressed})`));
  // ⚠️ THE HEADLINE LEG, AND IT IS NOT A BYTE-COMPARISON — the first draft's was, and independent
  // review DROVE the hole rather than arguing it: run against the exact PRE-FIX css, `sameLook(armed,
  // hover)` came back FALSE and this rig exited 0 GREEN **on the very defect the package exists to
  // fix**. The two states did differ — on a dark-on-dark fill and a text hue — they just did not
  // differ anywhere a player could see, while matching on the border and on the (absent) shadow.
  // A difference an instrument can read is not a difference the PLAYER can read, and byte-identity is
  // the weakest possible reading of "looks the same". So the leg NAMES THE CHANNEL instead: hover must
  // carry no shadow and armed must carry one, which is the one signal that cannot be produced by the
  // pointer and cannot quietly converge as two colours drift toward each other. Verified red against
  // the historical CSS and green on the shipped tree, for all three members.
  if (!(seen.armed.shadow !== 'none' && seen.hover.shadow === 'none'))
    out.push(at('the ARMED state does not OWN the shadow channel — armed must carry a box-shadow and ' +
      'hover must not. Without an exclusive channel the two states are only ever a colour edit apart, ' +
      'which is how the 2026-08-03 defect happened: armed and hovered differed on paper and not on ' +
      `screen. (armed shadow: ${seen.armed.shadow} · hover shadow: ${seen.hover.shadow})`));
  if (sameLook(seen.armed, seen.hover))
    out.push(at('ARMED and HOVERED are byte-identical across every channel read here. The player\'s ' +
      'cursor is on the control they just clicked, so this is what they actually see: a control that ' +
      `does not answer. (bg ${seen.armed.bg} · color ${seen.armed.color} · border ${seen.armed.border})`));
  if (seen.armed.w !== seen.rest.w || seen.armed.h !== seen.rest.h)
    out.push(at(`arming RE-MEASURED the control (${seen.rest.w}x${seen.rest.h} → ${seen.armed.w}x` +
      `${seen.armed.h}). The armed look must not reflow a wrapping row — that is this tool's own ` +
      'subject, and all three of these rows wrap.'));
  if (!sameLook(seen.released, seen.hover))
    out.push(at('the release rung did not return it to its unarmed look — the state latched. ' +
      `(released bg ${seen.released.bg} border ${seen.released.border} shadow ${seen.released.shadow} ` +
      `vs hover bg ${seen.hover.bg} border ${seen.hover.border} shadow ${seen.hover.shadow})`));
  return { seen, out };
}

const armedLook = {};
const lookBad = [];

// ── member 1: the tool button. Released by ESC, the rung the owner's sentence names. ───────────
{
  const sel = '.rz-tool[data-rztool="wall"]';
  const r = await readLook({
    name: 'tool', sel,
    arm: async (s) => { await clickAt(s.cx, s.cy); await sleep(900); },
    release: async () => { await key('Escape'); await sleep(900); },
  });
  armedLook.tool = r.seen; lookBad.push(...r.out);
}

// ── member 2: a material swatch. Reached by arming WALL; the target is a swatch that is NOT the
// active material, and it is released by picking a sibling — a radio group has no other way. ───
{
  await clickTool('wall');
  const pick = await evalJson(`(()=>{const cs=[...document.querySelectorAll('.rz-mat-chip')];
    if(cs.length<2)return null;const off=cs.find(c=>!c.classList.contains('on'));
    const on=cs.find(c=>c.classList.contains('on'));if(!off||!on)return null;
    return {target:off.dataset.rzmat,sibling:on.dataset.rzmat,n:cs.length};})()`);
  if (!pick) die(9, 'the material strip did not offer one lit and one unlit swatch — the swatch legs ' +
    'need a genuinely unarmed target and a sibling to release it with');
  log(`material strip: ${pick.n} swatches, target rzmat=${pick.target}, release via rzmat=${pick.sibling}`);
  const sel = `.rz-mat-chip[data-rzmat="${pick.target}"]`;
  const r = await readLook({
    name: 'matchip', sel,
    arm: async (s) => { await clickAt(s.cx, s.cy); await sleep(900); },
    release: async () => { await clickSel(`.rz-mat-chip[data-rzmat="${pick.sibling}"]`); },
  });
  armedLook.matchip = r.seen; lookBad.push(...r.out);
  await clickTool('wall');                                      // disarm, back to a known slot
}

// ── member 3: an ACCEPTS chip. Reached by arming STOCKPILE. Every chip boots LIT, so the target is
// toggled OUT first — otherwise "rest" would be a reading of the armed state. ──────────────────
{
  await clickTool('stockpile');
  const pick = await evalJson(`(()=>{const cs=[...document.querySelectorAll('.rz-acc-chip')];
    if(!cs.length)return null;return {target:cs[0].dataset.rzaccept,n:cs.length,
      litAtBoot:cs.filter(c=>c.classList.contains('on')).length};})()`);
  if (!pick) die(9, 'no ACCEPTS chips after arming STOCKPILE');
  log(`accepts row: ${pick.n} chips, ${pick.litAtBoot} lit at boot, target rzaccept=${pick.target}`);
  const sel = `.rz-acc-chip[data-rzaccept="${pick.target}"]`;
  await clickSel(sel);                                          // toggle it OUT — now genuinely unarmed
  const stillOn = await evaluate(`!!document.querySelector('${sel}.on')`);
  if (stillOn) die(9, 'the ACCEPTS chip would not toggle OUT, so "rest" would be a reading of the ' +
    'ARMED state and every leg after it would compare that state with itself');
  const r = await readLook({
    name: 'accchip', sel,
    arm: async (s) => { await clickAt(s.cx, s.cy); await sleep(900); },
    release: async (s) => { await clickAt(s.cx, s.cy); await sleep(900); },
  });
  armedLook.accchip = r.seen; lookBad.push(...r.out);
  await clickSel(sel);                                          // mask back to ACCEPT_ALL
  await clickTool('stockpile');
}

// ⚠️ NOT pushed into `results`. Every summary below filters that array on `r.clipped.length`, and a
// row with no `clipped` field threw a TypeError there — a crash AFTER the measurement, which reads
// as a failed run of the layout check that had in fact already passed (this repo's FALSE RED shape,
// trap 3). The armed-look readings are a different measurement and are reported on their own.
//
// ⛔ WHAT THESE LEGS ACTUALLY ASSERT, stated exactly, because an earlier draft of this header
// overstated it as "refuses to pass when hover and armed resolve alike" and that was measurably
// false. Per member they assert: (1) rest and hover really differ, so the rig is not comparing one
// state with itself; (2) the click really armed it; (3) **armed OWNS the shadow channel** — armed has
// a box-shadow and hover has none; (4) armed and hover are not byte-identical; (5) arming does not
// re-measure the control's box; (6) the member's own release rung returns it to the hover look. They
// do NOT — and cannot — assert that the armed state is LOUD ENOUGH to notice; no automated check here
// judges contrast. That remains a human call on the twelve PNGs this writes.

writeFileSync(join(OUT, PREFIX + 'measurements.json'), JSON.stringify({ widths: results, armedLook }, null, 2));
log('  wrote', join(OUT, PREFIX + 'measurements.json'));

try { cdp.close(); } catch { /**/ }
chrome.kill('SIGKILL');
rmSync(userDir, { recursive: true, force: true });

const bad = results.filter((r) => r.clipped.length || r.accClipped.length || r.matClipped.length);
if (bad.length) {
  console.error('\nFAIL: controls are UNREACHABLE at ' + bad.length + ' measured width(s):');
  for (const b of bad) console.error(`  w=${b.w}${b.armed ? ' (armed ' + b.armed + ')' : ''}: ` +
    `${b.clipped.join(', ')}${b.accClipped.length ? ' | ACCEPTS: ' + b.accClipped.join(', ') : ''}` +
    `${b.matClipped.length ? ' | MATERIALS: ' + b.matClipped.join(', ') : ''}`);
  process.exit(1);
}
const armed = results.filter((r) => r.armed);
const ariaBad = results.filter((r) => r.ariaMissing > 0)
  .concat(armed.filter((r) => r.pressed.length !== 1));
if (ariaBad.length) {
  console.error('\nFAIL: the palette does not announce its armed tool. ' +
    'Every tool button must carry `aria-pressed`, and exactly one may read "true" while a tool is armed:');
  for (const b of ariaBad) console.error(`  w=${b.w}${b.armed ? ' (armed ' + b.armed + ')' : ''}: ` +
    `missing=${b.ariaMissing} pressed=${JSON.stringify(b.pressed)}`);
  process.exit(1);
}
if (lookBad.length) {
  console.error('\nFAIL: the ARMED LOOK does not read as armed:');
  for (const m of lookBad) console.error('  ' + m);
  console.error('  see ' + join(OUT, PREFIX + 'look-{tool,matchip,accchip}-{rest,hover,armed,rest-again}.png'));
  process.exit(1);
}
log('\nOK — every palette control is reachable at every measured width, the armed tool says so, ' +
    'and no armed control — tool, material swatch or ACCEPTS chip — looks like a merely hovered one');
process.exit(0);
