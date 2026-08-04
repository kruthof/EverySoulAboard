#!/usr/bin/env node
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
const STATE = (tool) => `(()=>{const b=document.querySelector('.rz-tool[data-rztool="${tool}"]');
  if(!b)return null;const cs=getComputedStyle(b);const r=b.getBoundingClientRect();
  return {cls:b.className,pressed:b.getAttribute('aria-pressed'),bg:cs.backgroundColor,color:cs.color,
    border:cs.borderTopWidth+' '+cs.borderTopColor,shadow:cs.boxShadow,weight:cs.fontWeight,
    w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100,
    x:r.x,y:r.y,cx:r.x+r.width/2,cy:r.y+r.height/2};})()`;

await setWidth(WIDTHS[0]);
await sleep(600);
const LOOK = 'wall';
const seen = {};
const away = await evalJson(`(()=>{const p=document.querySelector('.rz-palette').getBoundingClientRect();
  return {x:p.x+p.width/2,y:Math.max(4,p.y-90)};})()`);
const moveTo = async (x, y) => { await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(650); };

await moveTo(away.x, away.y);                                   // pointer OFF the palette
seen.rest = await evalJson(STATE(LOOK));
if (!seen.rest) die(9, `no ${LOOK.toUpperCase()} button for the armed-look legs`);
const zoom = { x: seen.rest.x - 7, y: seen.rest.y - 7, width: seen.rest.w + 14, height: seen.rest.h + 14 };
await png('look-rest.png', zoom);

await moveTo(seen.rest.cx, seen.rest.cy);                       // pointer ON it, still unarmed
seen.hover = await evalJson(STATE(LOOK));
await png('look-hover.png', zoom);

await clickAt(seen.rest.cx, seen.rest.cy); await sleep(900);    // armed, pointer still on it
await assertLinked('after arming for the look legs');
seen.armed = await evalJson(STATE(LOOK));
await png('look-armed.png', zoom);

await key('Escape'); await sleep(900);                          // the disarm rung the owner names
seen.escaped = await evalJson(STATE(LOOK));
await png('look-rest-again.png', zoom);

for (const [k, v] of Object.entries(seen))
  log(`LOOK ${k.padEnd(8)} cls="${v.cls}" pressed=${v.pressed} bg=${v.bg} color=${v.color} ` +
      `border=${v.border} shadow=${v.shadow === 'none' ? 'none' : 'yes'} box=${v.w}x${v.h}`);
// ⚠️ NOT pushed into `results`. Every summary below filters that array on `r.clipped.length`, and a
// row with no `clipped` field threw a TypeError there — a crash AFTER the measurement, which reads
// as a failed run of the layout check that had in fact already passed (this repo's FALSE RED shape,
// trap 3). The armed-look readings are a different measurement and are reported on their own.
const armedLook = seen;

// The assertions. NON-VACUITY FIRST: `rest` and `hover` must actually DIFFER, or the pointer never
// landed and every comparison below is being made between two identical readings of one state — the
// exact shape of a green run that measured nothing.
const sameLook = (a, b) => a.bg === b.bg && a.color === b.color && a.border === b.border && a.shadow === b.shadow;
const lookBad = [];
if (sameLook(seen.rest, seen.hover))
  lookBad.push('rest and HOVER are identical — the pointer never established :hover, so the armed-vs-' +
    'hover comparison below is vacuous. Nothing here is evidence until this leg passes.');
if (seen.armed.cls === seen.rest.cls || seen.armed.pressed !== 'true')
  lookBad.push(`the click did not arm ${LOOK.toUpperCase()} (cls="${seen.armed.cls}" pressed=${seen.armed.pressed})`);
// ⚠️ THE HEADLINE LEG, AND IT IS NOT A BYTE-COMPARISON — the first draft's was, and independent
// review DROVE the hole rather than arguing it: run against the exact PRE-FIX css, `sameLook(armed,
// hover)` came back FALSE and this rig exited 0 GREEN **on the very defect the package exists to
// fix**. The two states did differ — on a dark-on-dark fill and a text hue — they just did not
// differ anywhere a player could see, while matching on the border and on the (absent) shadow.
// A difference an instrument can read is not a difference the PLAYER can read, and byte-identity is
// the weakest possible reading of "looks the same". So the leg NAMES THE CHANNEL instead: hover must
// carry no shadow and armed must carry one, which is the one signal that cannot be produced by the
// pointer and cannot quietly converge as two colours drift toward each other. Verified red against
// the historical CSS and green on the shipped tree.
if (!(seen.armed.shadow !== 'none' && seen.hover.shadow === 'none'))
  lookBad.push('the ARMED state does not OWN the shadow channel — armed must carry a box-shadow and ' +
    'hover must not. Without an exclusive channel the two states are only ever a colour edit apart, ' +
    'which is how the 2026-08-03 defect happened: armed and hovered differed on paper and not on ' +
    `screen. (armed shadow: ${seen.armed.shadow} · hover shadow: ${seen.hover.shadow})`);
if (sameLook(seen.armed, seen.hover))
  lookBad.push('ARMED and HOVERED are byte-identical across every channel read here. The player\'s ' +
    'cursor is on the button they just clicked, so this is what they actually see: a control that ' +
    `does not answer. (bg ${seen.armed.bg} · color ${seen.armed.color} · border ${seen.armed.border})`);
if (seen.armed.w !== seen.rest.w || seen.armed.h !== seen.rest.h)
  lookBad.push(`arming RE-MEASURED the button (${seen.rest.w}x${seen.rest.h} → ${seen.armed.w}x` +
    `${seen.armed.h}). The armed look must not reflow a wrapping row — that is this tool's own subject.`);
if (!sameLook(seen.escaped, seen.hover))
  lookBad.push('ESC did not return the button to its unarmed look — the state latched. ' +
    `(escaped bg ${seen.escaped.bg} border ${seen.escaped.border} vs hover bg ${seen.hover.bg} ` +
    `border ${seen.hover.border})`);

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
  console.error('  see ' + join(OUT, PREFIX + 'look-{rest,hover,armed,rest-again}.png'));
  process.exit(1);
}
log('\nOK — every palette control is reachable at every measured width, the armed tool says so, ' +
    'and an armed button does not look like a merely hovered one');
process.exit(0);
